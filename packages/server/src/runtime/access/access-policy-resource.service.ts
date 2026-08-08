/**
 * 通用权限资源适配器注册表与保存协调器。
 *
 * 一个资源可以声明多个权限槽位，每个槽位拥有独立默认策略和乐观锁版本。服务只负责
 * 规范化、串行化和保存协调，业务状态定位、管理资格和持久化仍由适配器负责。
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ACCESS_POLICY_MAX_RESOURCE_SLOTS,
  type AccessPolicy,
  type AccessPolicyResourceLocator,
  type AccessPolicyResourceRef,
  type AccessPolicyResourceSetSnapshot,
  type AccessPolicyResourceSlotDefinition,
  type AccessPolicyResourceSnapshot,
  cloneAccessPolicy,
  validateAccessPolicy,
} from '@mud/shared';
import { AccessPolicyRuntimeService } from './access-policy-runtime.service';

export interface ManagedAccessPolicyResourceState extends AccessPolicyResourceLocator {
  title?: string;
  ownerPlayerId?: string | null;
  /** 缺失的槽位表示尚未显式保存，由通用层使用适配器声明的默认策略。 */
  policies?: Readonly<Record<string, unknown>>;
}

export interface AccessPolicyResourceAdapter {
  resourceType: string;
  slots: readonly AccessPolicyResourceSlotDefinition[];
  load(actorPlayerId: string, resourceId: string): Promise<ManagedAccessPolicyResourceState | null>;
  canManage(actorPlayerId: string, state: ManagedAccessPolicyResourceState): Promise<boolean> | boolean;
  /** 必须在业务自身的独占/CAS/事务边界内持久化，并在落盘成功后返回完整资源状态。 */
  commit(
    actorPlayerId: string,
    state: ManagedAccessPolicyResourceState,
    ref: AccessPolicyResourceRef,
    nextPolicy: AccessPolicy,
    expectedRevision: number,
  ): Promise<ManagedAccessPolicyResourceState>;
}

interface RegisteredAccessPolicyResourceAdapter {
  adapter: AccessPolicyResourceAdapter;
  slots: readonly AccessPolicyResourceSlotDefinition[];
  slotByKey: ReadonlyMap<string, AccessPolicyResourceSlotDefinition>;
}

export type AccessPolicyMutationResult =
  | { ok: true; snapshot: AccessPolicyResourceSnapshot }
  | { ok: false; reason: string; current?: AccessPolicyResourceSnapshot; unresolvedPlayerNos?: number[] };

export type AccessPolicyResourceSetLoadResult =
  | { ok: true; snapshot: AccessPolicyResourceSetSnapshot }
  | { ok: false; reason: string };

@Injectable()
export class AccessPolicyResourceService {
  private readonly adapters = new Map<string, RegisteredAccessPolicyResourceAdapter>();
  private readonly mutationTailByResource = new Map<string, Promise<void>>();

  constructor(
    @Inject(AccessPolicyRuntimeService) private readonly accessPolicyRuntimeService: AccessPolicyRuntimeService,
  ) {}

  registerAdapter(adapter: AccessPolicyResourceAdapter): () => void {
    const resourceType = normalizeKey(adapter?.resourceType, 64);
    const slots = normalizeSlotDefinitions(adapter?.slots);
    if (!resourceType || this.adapters.has(resourceType)) {
      throw new Error(`access_policy_resource_adapter_conflict:${resourceType || 'unknown'}`);
    }
    if (!slots) throw new Error(`access_policy_resource_adapter_invalid_slots:${resourceType}`);
    const registered: RegisteredAccessPolicyResourceAdapter = {
      adapter,
      slots,
      slotByKey: new Map(slots.map((slot) => [slot.slot, slot])),
    };
    this.adapters.set(resourceType, registered);
    return () => {
      if (this.adapters.get(resourceType) === registered) this.adapters.delete(resourceType);
    };
  }

  async loadForEditor(actorPlayerIdInput: string, refInput: AccessPolicyResourceRef): Promise<AccessPolicyMutationResult> {
    const actorPlayerId = normalizeKey(actorPlayerIdInput);
    const ref = normalizeResourceRef(refInput);
    if (!actorPlayerId || !ref) return { ok: false, reason: 'access_policy_resource_request_invalid' };
    const registered = this.adapters.get(ref.resourceType);
    const slot = registered?.slotByKey.get(ref.slot);
    if (!registered || !slot) return { ok: false, reason: 'access_policy_resource_unsupported' };
    const loaded = await registered.adapter.load(actorPlayerId, ref.resourceId);
    if (!loaded) return { ok: false, reason: 'access_policy_resource_not_found' };
    const state = normalizeResourceState(loaded, ref);
    if (!state) return { ok: false, reason: 'access_policy_resource_corrupted' };
    if (!await registered.adapter.canManage(actorPlayerId, state)) {
      return { ok: false, reason: 'access_policy_manage_denied' };
    }
    const snapshot = resolveSlotSnapshot(state, ref, slot);
    return snapshot
      ? { ok: true, snapshot }
      : { ok: false, reason: 'access_policy_resource_corrupted' };
  }

  /** 一次读取同一资源的全部权限，避免多权限界面重复定位和重复鉴权。 */
  async loadSetForEditor(
    actorPlayerIdInput: string,
    locatorInput: AccessPolicyResourceLocator,
  ): Promise<AccessPolicyResourceSetLoadResult> {
    const actorPlayerId = normalizeKey(actorPlayerIdInput);
    const locator = normalizeResourceLocator(locatorInput);
    if (!actorPlayerId || !locator) return { ok: false, reason: 'access_policy_resource_request_invalid' };
    const registered = this.adapters.get(locator.resourceType);
    if (!registered) return { ok: false, reason: 'access_policy_resource_unsupported' };
    const loaded = await registered.adapter.load(actorPlayerId, locator.resourceId);
    if (!loaded) return { ok: false, reason: 'access_policy_resource_not_found' };
    const state = normalizeResourceState(loaded, locator);
    if (!state) return { ok: false, reason: 'access_policy_resource_corrupted' };
    if (!await registered.adapter.canManage(actorPlayerId, state)) {
      return { ok: false, reason: 'access_policy_manage_denied' };
    }
    const slots: AccessPolicyResourceSetSnapshot['slots'] = [];
    for (const definition of registered.slots) {
      const snapshot = resolveSlotSnapshot(state, { ...locator, slot: definition.slot }, definition);
      if (!snapshot) return { ok: false, reason: 'access_policy_resource_corrupted' };
      slots.push({
        ...cloneSlotDefinition(definition),
        policy: snapshot.policy,
        revision: snapshot.revision,
      });
    }
    return {
      ok: true,
      snapshot: {
        ...locator,
        title: normalizeTitle(state.title) || locator.resourceId,
        slots,
      },
    };
  }

  async save(
    actorPlayerIdInput: string,
    refInput: AccessPolicyResourceRef,
    expectedRevisionInput: unknown,
    policyInput: unknown,
  ): Promise<AccessPolicyMutationResult> {
    const actorPlayerId = normalizeKey(actorPlayerIdInput);
    const ref = normalizeResourceRef(refInput);
    const expectedRevision = normalizeRevision(expectedRevisionInput);
    if (!actorPlayerId || !ref || expectedRevision === null) {
      return { ok: false, reason: 'access_policy_resource_request_invalid' };
    }
    return this.runExclusive(ref, async () => {
      const registered = this.adapters.get(ref.resourceType);
      const slot = registered?.slotByKey.get(ref.slot);
      if (!registered || !slot) return { ok: false, reason: 'access_policy_resource_unsupported' };
      const loaded = await registered.adapter.load(actorPlayerId, ref.resourceId);
      if (!loaded) return { ok: false, reason: 'access_policy_resource_not_found' };
      const state = normalizeResourceState(loaded, ref);
      if (!state) return { ok: false, reason: 'access_policy_resource_corrupted' };
      if (!await registered.adapter.canManage(actorPlayerId, state)) {
        return { ok: false, reason: 'access_policy_manage_denied' };
      }
      const current = resolveSlotSnapshot(state, ref, slot);
      if (!current) return { ok: false, reason: 'access_policy_resource_corrupted' };
      if (current.revision !== expectedRevision) {
        return { ok: false, reason: 'access_policy_revision_conflict', current };
      }
      const resolved = await this.accessPolicyRuntimeService.resolvePolicyPlayers(policyInput, expectedRevision + 1);
      if (resolved.ok !== true) {
        return {
          ok: false,
          reason: resolved.reason,
          ...('unresolvedPlayerNos' in resolved ? { unresolvedPlayerNos: resolved.unresolvedPlayerNos } : {}),
        };
      }
      try {
        const committedState = normalizeResourceState(
          await registered.adapter.commit(actorPlayerId, state, ref, resolved.policy, expectedRevision),
          ref,
        );
        const committed = committedState ? resolveSlotSnapshot(committedState, ref, slot) : null;
        if (!committed
          || committed.revision !== expectedRevision + 1
          || committed.policy.revision !== committed.revision) {
          return { ok: false, reason: 'access_policy_commit_invalid' };
        }
        return { ok: true, snapshot: committed };
      } catch (error) {
        const reason = error instanceof Error && error.message === 'access_policy_revision_conflict'
          ? 'access_policy_revision_conflict'
          : 'access_policy_persistence_failed';
        const latestState = reason === 'access_policy_revision_conflict'
          ? normalizeResourceState(await registered.adapter.load(actorPlayerId, ref.resourceId), ref)
          : null;
        const current = latestState ? resolveSlotSnapshot(latestState, ref, slot) ?? undefined : undefined;
        return { ok: false, reason, ...(current ? { current } : {}) };
      }
    });
  }

  /** 业务适配器常写回整个资源，因此不同槽位也必须按资源串行，避免低频管理操作互相覆盖。 */
  private async runExclusive<T>(locator: AccessPolicyResourceLocator, action: () => Promise<T>): Promise<T> {
    const key = `${locator.resourceType}\u0000${locator.resourceId}`;
    const previous = this.mutationTailByResource.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => current);
    this.mutationTailByResource.set(key, tail);
    await previous.catch(() => undefined);
    try {
      return await action();
    } finally {
      release();
      if (this.mutationTailByResource.get(key) === tail) this.mutationTailByResource.delete(key);
    }
  }
}

function normalizeSlotDefinitions(
  value: readonly AccessPolicyResourceSlotDefinition[] | null | undefined,
): readonly AccessPolicyResourceSlotDefinition[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > ACCESS_POLICY_MAX_RESOURCE_SLOTS) return null;
  const slots: AccessPolicyResourceSlotDefinition[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const slot = normalizeKey(entry?.slot, 64);
    const label = normalizeTitle(entry?.label);
    const description = normalizeDescription(entry?.description);
    const validated = validateAccessPolicy(entry?.defaultPolicy, { requireResolvedPlayers: true });
    if (!slot || !label || seen.has(slot) || !validated.ok || !validated.policy) return null;
    seen.add(slot);
    const defaultPolicy = cloneAccessPolicy(validated.policy);
    defaultPolicy.revision = 1;
    slots.push({ slot, label, ...(description ? { description } : {}), defaultPolicy });
  }
  return Object.freeze(slots.map((entry) => Object.freeze(entry)));
}

function resolveSlotSnapshot(
  state: ManagedAccessPolicyResourceState,
  ref: AccessPolicyResourceRef,
  slot: AccessPolicyResourceSlotDefinition,
): AccessPolicyResourceSnapshot | null {
  const stored = state.policies && Object.hasOwn(state.policies, ref.slot)
    ? state.policies[ref.slot]
    : undefined;
  const source = stored === undefined ? slot.defaultPolicy : stored;
  const validated = validateAccessPolicy(source, { requireResolvedPlayers: true });
  if (!validated.ok || !validated.policy) return null;
  return {
    ...ref,
    policy: cloneAccessPolicy(validated.policy),
    revision: validated.policy.revision,
  };
}

function cloneSlotDefinition(definition: AccessPolicyResourceSlotDefinition): AccessPolicyResourceSlotDefinition {
  return {
    slot: definition.slot,
    label: definition.label,
    ...(definition.description ? { description: definition.description } : {}),
    defaultPolicy: cloneAccessPolicy(definition.defaultPolicy),
  };
}

function normalizeResourceState(
  value: ManagedAccessPolicyResourceState | null | undefined,
  expected: AccessPolicyResourceLocator,
): ManagedAccessPolicyResourceState | null {
  if (!value) return null;
  const locator = normalizeResourceLocator(value);
  const title = normalizeTitle(value.title);
  if (!locator
    || locator.resourceType !== expected.resourceType
    || locator.resourceId !== expected.resourceId
    || (value.policies !== undefined && (!value.policies || typeof value.policies !== 'object' || Array.isArray(value.policies)))) {
    return null;
  }
  return {
    ...locator,
    ...(title ? { title } : {}),
    ...(typeof value.ownerPlayerId === 'string' || value.ownerPlayerId === null
      ? { ownerPlayerId: value.ownerPlayerId }
      : {}),
    ...(value.policies ? { policies: value.policies } : {}),
  };
}

function normalizeResourceLocator(value: AccessPolicyResourceLocator | null | undefined): AccessPolicyResourceLocator | null {
  const resourceType = normalizeKey(value?.resourceType, 64);
  const resourceId = normalizeKey(value?.resourceId, 160);
  return resourceType && resourceId ? { resourceType, resourceId } : null;
}

function normalizeResourceRef(value: AccessPolicyResourceRef | null | undefined): AccessPolicyResourceRef | null {
  const locator = normalizeResourceLocator(value);
  const slot = normalizeKey(value?.slot, 64);
  return locator && slot ? { ...locator, slot } : null;
}

function normalizeRevision(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeKey(value: unknown, maxLength = 160): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized.length > 0
    && normalized.length <= maxLength
    && !/[\u0000-\u001f\u007f]/u.test(normalized)
    ? normalized
    : '';
}

function normalizeTitle(value: unknown): string {
  return normalizeText(value, 80);
}

function normalizeDescription(value: unknown): string {
  return normalizeText(value, 240);
}

function normalizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value.normalize('NFC').trim();
  return normalized.length > 0
    && normalized.length <= maxLength
    && !/[\u0000-\u001f\u007f]/u.test(normalized)
    ? normalized
    : '';
}
