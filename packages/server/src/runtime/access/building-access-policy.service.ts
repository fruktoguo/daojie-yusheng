/**
 * 建筑资源接入通用权限系统的统一适配层。
 *
 * 宝库和统法台只在这里声明权限槽位、默认策略、编辑资格和持久化提交；业务运行时
 * 只消费权威检测结果，不再各自维护权限表达式、保存协议或关系查询。
 */
import { Inject, Injectable, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common';
import {
  ACCESS_POLICY_RESOURCE_TYPE,
  EVERYONE_ACCESS_POLICY,
  OWNER_ONLY_ACCESS_POLICY,
  TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT,
  TECHNIQUE_UNIFICATION_PLATFORM_DEF_ID,
  TREASURE_VAULT_ACCESS_POLICY_SLOT,
  cloneAccessPolicy,
  validateAccessPolicy,
  type AccessPolicy,
  type AccessPolicyResourceLocator,
  type AccessPolicyResourceRef,
} from '@mud/shared';

import { PlayerRuntimeService } from '../player/player-runtime.service';
import { WorldRuntimeService } from '../world/world-runtime.service';
import {
  AccessPolicyResourceService,
  type ManagedAccessPolicyResourceState,
} from './access-policy-resource.service';
import { AccessPolicyRuntimeService } from './access-policy-runtime.service';

const TREASURE_VAULT_DEF_ID = 'treasure_vault';
const BUILDING_ACCESS_RANGE = 1;

const TREASURE_VAULT_SLOT_DEFINITIONS = Object.freeze([
  Object.freeze({
    slot: TREASURE_VAULT_ACCESS_POLICY_SLOT.viewDeposit,
    label: '可看和可放',
    description: '查看宝库内容并向宝库放入物品。',
    defaultPolicy: cloneAccessPolicy(EVERYONE_ACCESS_POLICY),
  }),
  Object.freeze({
    slot: TREASURE_VAULT_ACCESS_POLICY_SLOT.withdraw,
    label: '可拿',
    description: '从宝库中取出物品。',
    defaultPolicy: cloneAccessPolicy(OWNER_ONLY_ACCESS_POLICY),
  }),
]);

const TECHNIQUE_PLATFORM_SLOT_DEFINITIONS = Object.freeze([
  Object.freeze({
    slot: TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.read,
    label: '参阅',
    description: '查看并参悟统法台当前法脉。',
    defaultPolicy: cloneAccessPolicy(EVERYONE_ACCESS_POLICY),
  }),
  Object.freeze({
    slot: TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.revision,
    label: '修订',
    description: '向统法台当前法脉续录自己的圆满功法。',
    defaultPolicy: cloneAccessPolicy(OWNER_ONLY_ACCESS_POLICY),
  }),
]);

type ResolvedBuilding = {
  player: any;
  instance: any;
  building: any;
};

@Injectable()
export class BuildingAccessPolicyService implements OnModuleInit, OnModuleDestroy {
  private readonly unregisterAdapters: Array<() => void> = [];
  private readonly policyCacheByBuilding = new WeakMap<object, {
    source: unknown;
    policies: Map<string, Readonly<AccessPolicy>>;
  }>();

  constructor(
    @Inject(AccessPolicyRuntimeService)
    private readonly accessPolicyRuntimeService: AccessPolicyRuntimeService,
    @Inject(AccessPolicyResourceService)
    private readonly accessPolicyResourceService: AccessPolicyResourceService,
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerRuntimeService,
    @Inject(forwardRef(() => WorldRuntimeService))
    private readonly worldRuntimeService: WorldRuntimeService,
  ) {}

  onModuleInit(): void {
    this.unregisterAdapters.push(
      this.registerBuildingAdapter(
        ACCESS_POLICY_RESOURCE_TYPE.treasureVault,
        TREASURE_VAULT_DEF_ID,
        TREASURE_VAULT_SLOT_DEFINITIONS,
      ),
      this.registerBuildingAdapter(
        ACCESS_POLICY_RESOURCE_TYPE.techniqueUnificationPlatform,
        TECHNIQUE_UNIFICATION_PLATFORM_DEF_ID,
        TECHNIQUE_PLATFORM_SLOT_DEFINITIONS,
      ),
    );
  }

  onModuleDestroy(): void {
    for (const unregister of this.unregisterAdapters.splice(0)) unregister();
  }

  buildTreasureVaultResource(buildingId: string): AccessPolicyResourceLocator {
    return {
      resourceType: ACCESS_POLICY_RESOURCE_TYPE.treasureVault,
      resourceId: normalizeText(buildingId),
    };
  }

  buildTechniquePlatformResource(buildingId: string): AccessPolicyResourceLocator {
    return {
      resourceType: ACCESS_POLICY_RESOURCE_TYPE.techniqueUnificationPlatform,
      resourceId: normalizeText(buildingId),
    };
  }

  async evaluateTreasureVault(playerId: string, building: any): Promise<{
    viewDeposit: boolean;
    withdraw: boolean;
  }> {
    const result = await this.accessPolicyRuntimeService.evaluateMany([
      this.resolvePolicy(building, TREASURE_VAULT_ACCESS_POLICY_SLOT.viewDeposit, EVERYONE_ACCESS_POLICY),
      this.resolvePolicy(building, TREASURE_VAULT_ACCESS_POLICY_SLOT.withdraw, OWNER_ONLY_ACCESS_POLICY),
    ], {
      actorPlayerId: playerId,
      ownerPlayerId: normalizeText(building?.ownerPlayerId) || null,
      sectAnchorId: normalizeText(building?.ownerSectId) || null,
    });
    return result.ok
      ? { viewDeposit: result.allowed[0] === true, withdraw: result.allowed[1] === true }
      : { viewDeposit: false, withdraw: false };
  }

  async evaluateTechniquePlatform(playerId: string, building: any): Promise<{
    read: boolean;
    revision: boolean;
  }> {
    const result = await this.accessPolicyRuntimeService.evaluateMany([
      this.resolvePolicy(building, TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.read, EVERYONE_ACCESS_POLICY),
      this.resolvePolicy(building, TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.revision, OWNER_ONLY_ACCESS_POLICY),
    ], {
      actorPlayerId: playerId,
      ownerPlayerId: normalizeText(building?.ownerPlayerId) || null,
    });
    return result.ok
      ? { read: result.allowed[0] === true, revision: result.allowed[1] === true }
      : { read: false, revision: false };
  }

  resolveTechniquePlatformPolicies(building: any): {
    read: AccessPolicy;
    revision: AccessPolicy;
  } {
    return {
      read: cloneAccessPolicy(this.resolvePolicy(
        building,
        TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.read,
        EVERYONE_ACCESS_POLICY,
      )),
      revision: cloneAccessPolicy(this.resolvePolicy(
        building,
        TECHNIQUE_UNIFICATION_ACCESS_POLICY_SLOT.revision,
        OWNER_ONLY_ACCESS_POLICY,
      )),
    };
  }

  private registerBuildingAdapter(
    resourceType: string,
    defId: string,
    slots: readonly { slot: string; label: string; description: string; defaultPolicy: AccessPolicy }[],
  ): () => void {
    const defaultPolicyBySlot = new Map(slots.map((slot) => [slot.slot, slot.defaultPolicy]));
    return this.accessPolicyResourceService.registerAdapter({
      resourceType,
      slots,
      load: async (actorPlayerId, resourceId) => {
        const resolved = this.resolveEditableBuilding(actorPlayerId, resourceId, defId);
        return resolved ? this.buildManagedState(resourceType, resolved.building) : null;
      },
      canManage: (actorPlayerId, state) => (
        normalizeText(actorPlayerId) !== ''
        && normalizeText(actorPlayerId) === normalizeText(state.ownerPlayerId)
      ),
      commit: async (actorPlayerId, _state, ref, nextPolicy, expectedRevision) => {
        const resolved = this.resolveEditableBuilding(actorPlayerId, ref.resourceId, defId);
        if (!resolved || normalizeText(resolved.building.ownerPlayerId) !== normalizeText(actorPlayerId)) {
          throw new Error('access_policy_manage_denied');
        }
        const defaultPolicy = defaultPolicyBySlot.get(ref.slot);
        if (!defaultPolicy) throw new Error('access_policy_resource_unsupported');
        const currentPolicy = this.resolvePolicy(resolved.building, ref.slot, defaultPolicy);
        if (currentPolicy.revision !== expectedRevision) throw new Error('access_policy_revision_conflict');
        const mutation = resolved.instance.updateBuildingAccessPolicyState?.(
          resolved.building.id,
          ref.slot,
          nextPolicy,
          expectedRevision,
        );
        if (!mutation?.ok) {
          throw new Error(mutation?.reason === 'access_policy_revision_conflict'
            ? 'access_policy_revision_conflict'
            : 'access_policy_persistence_failed');
        }
        const flushResult = await this.worldRuntimeService.flushInstanceDomains(
          resolved.instance.meta.instanceId,
          ['building'],
        );
        if (resolved.instance.meta.persistent === true && flushResult?.skipped === true) {
          throw new Error('access_policy_persistence_failed');
        }
        return this.buildManagedState(resourceType, mutation.building);
      },
    });
  }

  private resolveEditableBuilding(actorPlayerId: string, resourceId: string, defId: string): ResolvedBuilding | null {
    const playerId = normalizeText(actorPlayerId);
    const buildingId = normalizeText(resourceId);
    const player = playerId ? this.playerRuntimeService.getPlayer(playerId) : null;
    const instance = player ? this.worldRuntimeService.getInstanceRuntime(player.instanceId) : null;
    const building = instance?.buildingById?.get?.(buildingId) ?? null;
    if (!player || !instance || !building || building.defId !== defId || building.state !== 'active') return null;
    const dx = Math.abs(Math.floor(Number(player.x) || 0) - Math.floor(Number(building.x) || 0));
    const dy = Math.abs(Math.floor(Number(player.y) || 0) - Math.floor(Number(building.y) || 0));
    return Math.max(dx, dy) <= BUILDING_ACCESS_RANGE ? { player, instance, building } : null;
  }

  private buildManagedState(resourceType: string, building: any): ManagedAccessPolicyResourceState {
    return {
      resourceType,
      resourceId: normalizeText(building?.id),
      title: normalizeText(building?.name) || normalizeText(building?.id),
      ownerPlayerId: normalizeText(building?.ownerPlayerId) || null,
      policies: isRecord(building?.accessPolicies) ? building.accessPolicies : {},
    };
  }

  private resolvePolicy(building: any, slot: string, defaultPolicy: Readonly<AccessPolicy>): Readonly<AccessPolicy> {
    if (!isRecord(building)) return defaultPolicy;
    const source = building.accessPolicies;
    let cache = this.policyCacheByBuilding.get(building);
    if (!cache || cache.source !== source) {
      cache = { source, policies: new Map() };
      this.policyCacheByBuilding.set(building, cache);
    }
    const cached = cache.policies.get(slot);
    if (cached) return cached;
    const stored = isRecord(source) ? source[slot] : undefined;
    if (stored === undefined) {
      cache.policies.set(slot, defaultPolicy);
      return defaultPolicy;
    }
    const validated = validateAccessPolicy(stored, { requireResolvedPlayers: true });
    const policy = validated.ok && validated.policy ? stored as AccessPolicy : OWNER_ONLY_ACCESS_POLICY;
    cache.policies.set(slot, policy);
    return policy;
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
