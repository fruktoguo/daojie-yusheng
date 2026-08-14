/**
 * 通用权限事实收集与高性能检测入口。
 *
 * 纯规则位于 shared；本服务只负责按编译依赖读取权威运行态、身份、宗门和关系事实。
 */
import { Inject, Injectable, Logger, OnModuleDestroy, Optional, forwardRef } from '@nestjs/common';
import {
  ACCESS_POLICY_DEPENDENCY,
  type AccessPolicy,
  type AccessPolicyFacts,
  type AccessPolicyRelationKind,
  type AccessPolicySpecifiedPlayer,
  type Attributes,
  type CompiledAccessPolicy,
  type SectMemberRole,
  compileAccessPolicy,
  evaluateCompiledAccessPolicy,
  validateAccessPolicy,
} from '@mud/shared';
import { NativePlayerAuthStoreService } from '../../http/native/native-player-auth-store.service';
import { PlayerIdentityPersistenceService } from '../../persistence/player-identity-persistence.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { PartyRuntimeService } from '../party/party-runtime.service';
import { SocialRuntimeService } from '../social/social-runtime.service';
import { WorldRuntimeService } from '../world/world-runtime.service';

const RELATION_CACHE_TTL_MS = 5 * 60 * 1_000;
const RELATION_CACHE_MAX_ENTRIES = 32_768;
const EMPTY_ATTRS: Readonly<Attributes> = Object.freeze({
  constitution: 0,
  spirit: 0,
  perception: 0,
  talent: 0,
  strength: 0,
  meridians: 0,
});

export interface AccessPolicyEvaluationContext {
  actorPlayerId: string;
  ownerPlayerId?: string | null;
  /** 显式传入时覆盖“所有者当前宗门”，兼容资源绑定宗门快照。 */
  sectAnchorId?: string | null;
  /** 非玩家所有权资源可显式声明当前操作者为所有者。 */
  isOwner?: boolean;
}

export interface AccessPolicyRelationProvider {
  id: string;
  relationKinds: readonly AccessPolicyRelationKind[];
  resolve(ownerPlayerId: string, actorPlayerId: string): Promise<readonly AccessPolicyRelationKind[]>;
}

export interface AccessPolicyPlayerResolution {
  playerNo: number;
  playerId: string;
  roleName: string;
}

export type AccessPolicyEvaluationResult =
  | { ok: true; allowed: boolean; facts: AccessPolicyFacts }
  | { ok: false; allowed: false; reason: string };

type RelationCacheEntry = {
  expiresAt: number;
  relationKinds: ReadonlySet<AccessPolicyRelationKind>;
};

@Injectable()
export class AccessPolicyRuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(AccessPolicyRuntimeService.name);
  private readonly relationProviders = new Map<string, AccessPolicyRelationProvider>();
  private readonly relationCache = new Map<string, RelationCacheEntry>();
  private readonly compiledPolicyCache = new WeakMap<object, CompiledAccessPolicy>();
  private unregisterSocialRelationListener: (() => void) | null = null;

  constructor(
    @Inject(PlayerRuntimeService) private readonly playerRuntimeService: PlayerRuntimeService,
    @Inject(PlayerIdentityPersistenceService) private readonly playerIdentityPersistenceService: PlayerIdentityPersistenceService,
    @Optional() @Inject(NativePlayerAuthStoreService) private readonly authStore: NativePlayerAuthStoreService | null = null,
    @Optional() @Inject(SocialRuntimeService) private readonly socialRuntimeService: SocialRuntimeService | null = null,
    @Optional() @Inject(forwardRef(() => WorldRuntimeService)) private readonly worldRuntimeService: WorldRuntimeService | null = null,
    @Optional() @Inject(PartyRuntimeService) private readonly partyRuntimeService: PartyRuntimeService | null = null,
  ) {
    if (this.socialRuntimeService?.registerRelationChangeListener) {
      this.unregisterSocialRelationListener = this.socialRuntimeService.registerRelationChangeListener((left, right) => {
        this.invalidateRelationFacts(left, right);
      });
    }
  }

  onModuleDestroy(): void {
    this.unregisterSocialRelationListener?.();
    this.unregisterSocialRelationListener = null;
    this.relationProviders.clear();
    this.relationCache.clear();
  }

  /** 注册师徒、仇家等未来关系提供器；重复 ID 会拒绝覆盖。 */
  registerRelationProvider(provider: AccessPolicyRelationProvider): () => void {
    const providerId = normalizeText(provider?.id);
    if (!providerId || this.relationProviders.has(providerId)) {
      throw new Error(`access_policy_relation_provider_conflict:${providerId || 'unknown'}`);
    }
    this.relationProviders.set(providerId, provider);
    this.relationCache.clear();
    return () => {
      if (this.relationProviders.get(providerId) === provider) {
        this.relationProviders.delete(providerId);
        this.relationCache.clear();
      }
    };
  }

  invalidateRelationFacts(playerAId: string, playerBId: string): void {
    const playerA = normalizeText(playerAId);
    const playerB = normalizeText(playerBId);
    if (!playerA || !playerB) return;
    this.relationCache.delete(buildDirectionalPairKey(playerA, playerB));
    this.relationCache.delete(buildDirectionalPairKey(playerB, playerA));
  }

  async evaluate(
    policy: Readonly<AccessPolicy> | Readonly<CompiledAccessPolicy>,
    context: AccessPolicyEvaluationContext,
  ): Promise<AccessPolicyEvaluationResult> {
    let compiled: Readonly<CompiledAccessPolicy>;
    try {
      compiled = this.prepare(policy);
    } catch {
      return { ok: false, allowed: false, reason: 'access_policy_invalid' };
    }
    const facts = await this.collectFacts(compiled.dependencies, context);
    if (facts.ok !== true) return facts;
    return { ok: true, allowed: evaluateCompiledAccessPolicy(compiled, facts.facts), facts: facts.facts };
  }

  /** 同一资源的多项权限共享一份事实快照，避免宝库式重复关系查询。 */
  async evaluateMany(
    policies: readonly (Readonly<AccessPolicy> | Readonly<CompiledAccessPolicy>)[],
    context: AccessPolicyEvaluationContext,
  ): Promise<{ ok: true; allowed: boolean[]; facts: AccessPolicyFacts } | { ok: false; allowed: boolean[]; reason: string }> {
    let compiledPolicies: Readonly<CompiledAccessPolicy>[];
    try {
      compiledPolicies = policies.map((policy) => this.prepare(policy));
    } catch {
      return { ok: false, allowed: policies.map(() => false), reason: 'access_policy_invalid' };
    }
    const dependencies = compiledPolicies.reduce((mask, policy) => mask | policy.dependencies, 0);
    const facts = await this.collectFacts(dependencies, context);
    if (!facts.ok) return { ...facts, allowed: compiledPolicies.map(() => false) };
    return {
      ok: true,
      facts: facts.facts,
      allowed: compiledPolicies.map((policy) => evaluateCompiledAccessPolicy(policy, facts.facts)),
    };
  }

  async resolvePlayerNo(playerNoInput: unknown): Promise<AccessPolicyPlayerResolution | null> {
    const playerNo = normalizePlayerNo(playerNoInput);
    if (playerNo === null) return null;
    const resolved = await this.resolvePlayerNos([playerNo]);
    return resolved.get(playerNo) ?? null;
  }

  /**
   * 将水合后的策略编译为可复用检测结构。原始策略对象保持稳定时只编译一次，
   * 业务热路径也可以显式缓存返回值，避免每次检测分配 Set。
   */
  prepare(policy: Readonly<AccessPolicy> | Readonly<CompiledAccessPolicy>): Readonly<CompiledAccessPolicy> {
    if (isCompiledPolicy(policy)) return policy;
    const cacheKey = policy as object;
    const cached = this.compiledPolicyCache.get(cacheKey);
    if (cached && cached.revision === policy.revision) return cached;
    const validated = validateAccessPolicy(policy, { requireResolvedPlayers: true });
    if (!validated.ok || !validated.policy) throw new Error('access_policy_invalid');
    const compiled = compileAccessPolicy(validated.policy);
    this.compiledPolicyCache.set(cacheKey, compiled);
    return compiled;
  }

  async resolvePolicyPlayers(policyInput: unknown, revision: number): Promise<{
    ok: true;
    policy: AccessPolicy;
  } | {
    ok: false;
    reason: string;
    unresolvedPlayerNos?: number[];
  }> {
    const validated = validateAccessPolicy(policyInput);
    if (!validated.ok || !validated.policy) {
      return { ok: false, reason: validated.issues[0]?.code ?? 'access_policy_invalid' };
    }
    const playerNos = validated.policy.conditions.flatMap((condition) => (
      condition.type === 'players' ? condition.players.map((entry) => entry.playerNo) : []
    ));
    const resolutions = await this.resolvePlayerNos(playerNos);
    const unresolvedPlayerNos = playerNos.filter((playerNo) => !resolutions.has(playerNo));
    if (unresolvedPlayerNos.length > 0) {
      return { ok: false, reason: 'access_policy_player_not_found', unresolvedPlayerNos };
    }
    const policy: AccessPolicy = {
      ...validated.policy,
      revision: Math.max(1, Math.trunc(Number(revision) || 1)),
      conditions: validated.policy.conditions.map((condition) => {
        if (condition.type !== 'players') return condition;
        return {
          type: 'players' as const,
          players: condition.players.map((entry): AccessPolicySpecifiedPlayer => {
            const resolved = resolutions.get(entry.playerNo)!;
            return {
              playerNo: resolved.playerNo,
              playerId: resolved.playerId,
              roleName: resolved.roleName,
            };
          }),
        };
      }),
    };
    const authoritative = validateAccessPolicy(policy, { requireResolvedPlayers: true });
    return authoritative.ok && authoritative.policy
      ? { ok: true, policy: authoritative.policy }
      : { ok: false, reason: authoritative.issues[0]?.code ?? 'access_policy_invalid' };
  }

  private async collectFacts(
    dependencies: number,
    context: AccessPolicyEvaluationContext,
  ): Promise<{ ok: true; facts: AccessPolicyFacts } | { ok: false; allowed: false; reason: string }> {
    const actorPlayerId = normalizeText(context.actorPlayerId);
    if (!actorPlayerId) return { ok: false, allowed: false, reason: 'access_policy_actor_required' };
    const actor = this.playerRuntimeService.getPlayer(actorPlayerId);
    if (!actor) return { ok: false, allowed: false, reason: 'access_policy_actor_not_found' };
    const ownerPlayerId = normalizeText(context.ownerPlayerId);
    const isOwner = context.isOwner === true || Boolean(ownerPlayerId && ownerPlayerId === actorPlayerId);
    let relationKinds: ReadonlySet<AccessPolicyRelationKind> = EMPTY_RELATIONS;
    if ((dependencies & ACCESS_POLICY_DEPENDENCY.relation) !== 0 && !isOwner && ownerPlayerId) {
      try {
        relationKinds = await this.resolveRelationKinds(ownerPlayerId, actorPlayerId);
      } catch (error) {
        this.logger.warn(`通用权限关系事实读取失败：${error instanceof Error ? error.message : String(error)}`);
        return { ok: false, allowed: false, reason: 'access_policy_relation_unavailable' };
      }
    }

    let sameSect = false;
    let sectRole: SectMemberRole | null = null;
    if ((dependencies & ACCESS_POLICY_DEPENDENCY.sect) !== 0) {
      const sectService = this.worldRuntimeService?.worldRuntimeSectService;
      const hasExplicitSectAnchor = Object.prototype.hasOwnProperty.call(context, 'sectAnchorId');
      const anchorSectId = hasExplicitSectAnchor
        ? normalizeText(context.sectAnchorId)
        : ownerPlayerId && sectService?.resolvePlayerSectId
          ? normalizeText(sectService.resolvePlayerSectId(ownerPlayerId))
          : '';
      const actorSectId = sectService?.resolvePlayerSectId
        ? normalizeText(sectService.resolvePlayerSectId(actorPlayerId))
        : normalizeText(actor?.sectId);
      sameSect = Boolean(anchorSectId && actorSectId && anchorSectId === actorSectId);
      if (sameSect && sectService?.findSectById) {
        const sect = sectService.findSectById(anchorSectId);
        const member = Array.isArray(sect?.members)
          ? sect.members.find((entry: any) => normalizeText(entry?.playerId) === actorPlayerId)
          : null;
        sectRole = normalizeSectRole(member?.roleId);
      }
    }

    let sameParty = false;
    if ((dependencies & ACCESS_POLICY_DEPENDENCY.party) !== 0 && ownerPlayerId) {
      try {
        const owner = this.playerRuntimeService.getPlayer(ownerPlayerId);
        const actorPartyId = normalizeText(actor?.partyId);
        const ownerPartyId = normalizeText(owner?.partyId);
        sameParty = Boolean(actorPartyId && actorPartyId === ownerPartyId);
        if (!sameParty && this.partyRuntimeService) {
          sameParty = await this.partyRuntimeService.arePlayersInSameParty(actorPlayerId, ownerPlayerId);
        }
      } catch (error) {
        this.logger.warn(`通用权限队伍事实读取失败：${error instanceof Error ? error.message : String(error)}`);
        return { ok: false, allowed: false, reason: 'access_policy_party_unavailable' };
      }
    }

    let roleName = '';
    if ((dependencies & ACCESS_POLICY_DEPENDENCY.identity) !== 0) {
      const identity = this.authStore?.getMemoryUserByPlayerId?.(actorPlayerId) ?? null;
      roleName = normalizeRoleName(identity?.pendingRoleName, identity?.playerName, actor?.name);
    }

    if ((dependencies & ACCESS_POLICY_DEPENDENCY.attributes) !== 0) {
      this.playerRuntimeService.ensurePlayerAttributesFresh?.(actorPlayerId);
    }
    const refreshedActor = this.playerRuntimeService.getPlayer(actorPlayerId) ?? actor;
    return {
      ok: true,
      facts: {
        actorPlayerId,
        isOwner,
        relationKinds,
        sameSect,
        sectRole,
        sameParty,
        roleName,
        realmLv: (dependencies & ACCESS_POLICY_DEPENDENCY.realm) !== 0
          ? Math.max(0, Math.trunc(Number(refreshedActor?.realm?.realmLv) || 0))
          : 0,
        finalAttrs: (dependencies & ACCESS_POLICY_DEPENDENCY.attributes) !== 0
          ? normalizeAttributes(refreshedActor?.attrs?.finalAttrs)
          : EMPTY_ATTRS,
      },
    };
  }

  private async resolveRelationKinds(ownerPlayerId: string, actorPlayerId: string): Promise<ReadonlySet<AccessPolicyRelationKind>> {
    const cacheKey = buildDirectionalPairKey(ownerPlayerId, actorPlayerId);
    const cached = this.relationCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      this.relationCache.delete(cacheKey);
      this.relationCache.set(cacheKey, cached);
      return cached.relationKinds;
    }
    if (cached) this.relationCache.delete(cacheKey);
    const relationKinds = new Set<AccessPolicyRelationKind>();
    const daoistLevel = await this.socialRuntimeService?.resolveRelationLevel?.(ownerPlayerId, actorPlayerId) ?? null;
    if (daoistLevel === 'dao_friend') relationKinds.add('dao_friend');
    if (daoistLevel === 'close_friend') {
      relationKinds.add('dao_friend');
      relationKinds.add('close_friend');
    }
    for (const provider of this.relationProviders.values()) {
      const resolved = await provider.resolve(ownerPlayerId, actorPlayerId);
      for (const relationKind of resolved ?? []) {
        if (provider.relationKinds.includes(relationKind)) relationKinds.add(relationKind);
      }
    }
    const entry: RelationCacheEntry = {
      expiresAt: now + RELATION_CACHE_TTL_MS,
      relationKinds,
    };
    this.relationCache.set(cacheKey, entry);
    while (this.relationCache.size > RELATION_CACHE_MAX_ENTRIES) {
      const oldestKey = this.relationCache.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      this.relationCache.delete(oldestKey);
    }
    return relationKinds;
  }

  private async resolvePlayerNos(playerNos: readonly number[]): Promise<Map<number, AccessPolicyPlayerResolution>> {
    const normalizedPlayerNos = Array.from(new Set(
      (playerNos ?? []).map(normalizePlayerNo).filter((value): value is number => value !== null),
    ));
    const result = new Map<number, AccessPolicyPlayerResolution>();
    if (normalizedPlayerNos.length === 0) return result;
    const persisted = typeof this.playerIdentityPersistenceService?.findPlayerIdentitiesByPlayerNos === 'function'
      ? await this.playerIdentityPersistenceService.findPlayerIdentitiesByPlayerNos(normalizedPlayerNos)
      : new Map();
    for (const playerNo of normalizedPlayerNos) {
      const identity = persisted.get(playerNo);
      const playerId = normalizeText(identity?.playerId);
      const roleName = normalizeRoleName(identity?.playerName, identity?.pendingRoleName);
      if (playerId && roleName) result.set(playerNo, { playerNo, playerId, roleName });
    }
    if (result.size < normalizedPlayerNos.length && this.authStore?.listUsers) {
      const unresolved = new Set(normalizedPlayerNos.filter((playerNo) => !result.has(playerNo)));
      for (const identity of await this.authStore.listUsers()) {
        const playerNo = normalizePlayerNo(identity?.playerNo);
        if (playerNo === null || !unresolved.has(playerNo)) continue;
        const playerId = normalizeText(identity?.playerId);
        const roleName = normalizeRoleName(identity?.pendingRoleName, identity?.playerName);
        if (playerId && roleName) result.set(playerNo, { playerNo, playerId, roleName });
      }
    }
    return result;
  }
}

const EMPTY_RELATIONS: ReadonlySet<AccessPolicyRelationKind> = new Set();

function isCompiledPolicy(value: Readonly<AccessPolicy> | Readonly<CompiledAccessPolicy>): value is Readonly<CompiledAccessPolicy> {
  return typeof (value as CompiledAccessPolicy).dependencies === 'number';
}

function buildDirectionalPairKey(ownerPlayerId: string, actorPlayerId: string): string {
  return `${ownerPlayerId}\u0000${actorPlayerId}`;
}

function normalizePlayerNo(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRoleName(...values: unknown[]): string {
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.normalize('NFC').trim() : '';
    if (normalized) return normalized;
  }
  return '';
}

function normalizeSectRole(value: unknown): SectMemberRole | null {
  return typeof value === 'string' && ['leader', 'supreme_elder', 'deputy', 'elder', 'inner', 'outer', 'labor'].includes(value)
    ? value as SectMemberRole
    : null;
}

function normalizeAttributes(value: any): Attributes {
  return {
    constitution: normalizeNonNegativeNumber(value?.constitution),
    spirit: normalizeNonNegativeNumber(value?.spirit),
    perception: normalizeNonNegativeNumber(value?.perception),
    talent: normalizeNonNegativeNumber(value?.talent),
    strength: normalizeNonNegativeNumber(value?.strength),
    meridians: normalizeNonNegativeNumber(value?.meridians),
  };
}

function normalizeNonNegativeNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
