/**
 * 通用权限资源适配器注册表与保存协调器。
 *
 * 本服务不保存业务数据，也不决定谁能管理某类资源；这些职责由注册适配器完成。
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  AccessPolicy,
  AccessPolicyResourceRef,
  AccessPolicyResourceSnapshot,
} from '@mud/shared';
import { cloneAccessPolicy, validateAccessPolicy } from '@mud/shared';
import { AccessPolicyRuntimeService } from './access-policy-runtime.service';

export interface ManagedAccessPolicyResourceSnapshot extends AccessPolicyResourceSnapshot {
  ownerPlayerId?: string | null;
}

export interface AccessPolicyResourceAdapter {
  resourceType: string;
  load(actorPlayerId: string, ref: AccessPolicyResourceRef): Promise<ManagedAccessPolicyResourceSnapshot | null>;
  canManage(actorPlayerId: string, snapshot: ManagedAccessPolicyResourceSnapshot): Promise<boolean> | boolean;
  /** 必须在业务自身的独占/CAS/事务边界内持久化，并在落盘成功后返回。 */
  commit(
    actorPlayerId: string,
    snapshot: ManagedAccessPolicyResourceSnapshot,
    nextPolicy: AccessPolicy,
    expectedRevision: number,
  ): Promise<ManagedAccessPolicyResourceSnapshot>;
}

export type AccessPolicyMutationResult =
  | { ok: true; snapshot: ManagedAccessPolicyResourceSnapshot }
  | { ok: false; reason: string; current?: ManagedAccessPolicyResourceSnapshot; unresolvedPlayerNos?: number[] };

@Injectable()
export class AccessPolicyResourceService {
  private readonly adapters = new Map<string, AccessPolicyResourceAdapter>();
  private readonly mutationTailByResource = new Map<string, Promise<void>>();

  constructor(
    @Inject(AccessPolicyRuntimeService) private readonly accessPolicyRuntimeService: AccessPolicyRuntimeService,
  ) {}

  registerAdapter(adapter: AccessPolicyResourceAdapter): () => void {
    const resourceType = normalizeKey(adapter?.resourceType, 64);
    if (!resourceType || this.adapters.has(resourceType)) {
      throw new Error(`access_policy_resource_adapter_conflict:${resourceType || 'unknown'}`);
    }
    this.adapters.set(resourceType, adapter);
    return () => {
      if (this.adapters.get(resourceType) === adapter) this.adapters.delete(resourceType);
    };
  }

  async loadForEditor(actorPlayerIdInput: string, refInput: AccessPolicyResourceRef): Promise<AccessPolicyMutationResult> {
    const actorPlayerId = normalizeKey(actorPlayerIdInput);
    const ref = normalizeResourceRef(refInput);
    if (!actorPlayerId || !ref) return { ok: false, reason: 'access_policy_resource_request_invalid' };
    const adapter = this.adapters.get(ref.resourceType);
    if (!adapter) return { ok: false, reason: 'access_policy_resource_unsupported' };
    const snapshot = await adapter.load(actorPlayerId, ref);
    if (!snapshot) return { ok: false, reason: 'access_policy_resource_not_found' };
    const canonical = normalizeSnapshot(snapshot, ref);
    if (!canonical) return { ok: false, reason: 'access_policy_resource_corrupted' };
    if (!await adapter.canManage(actorPlayerId, canonical)) {
      return { ok: false, reason: 'access_policy_manage_denied' };
    }
    return { ok: true, snapshot: canonical };
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
      const adapter = this.adapters.get(ref.resourceType);
      if (!adapter) return { ok: false, reason: 'access_policy_resource_unsupported' };
      const snapshot = await adapter.load(actorPlayerId, ref);
      if (!snapshot) return { ok: false, reason: 'access_policy_resource_not_found' };
      const canonical = normalizeSnapshot(snapshot, ref);
      if (!canonical) return { ok: false, reason: 'access_policy_resource_corrupted' };
      if (!await adapter.canManage(actorPlayerId, canonical)) {
        return { ok: false, reason: 'access_policy_manage_denied' };
      }
      if (canonical.revision !== expectedRevision) {
        return { ok: false, reason: 'access_policy_revision_conflict', current: canonical };
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
        const committed = await adapter.commit(actorPlayerId, canonical, resolved.policy, expectedRevision);
        const normalizedCommitted = normalizeSnapshot(committed, ref);
        if (!normalizedCommitted
          || normalizedCommitted.revision !== expectedRevision + 1
          || normalizedCommitted.policy.revision !== normalizedCommitted.revision) {
          return { ok: false, reason: 'access_policy_commit_invalid' };
        }
        return { ok: true, snapshot: normalizedCommitted };
      } catch (error) {
        const reason = error instanceof Error && error.message === 'access_policy_revision_conflict'
          ? 'access_policy_revision_conflict'
          : 'access_policy_persistence_failed';
        const current = reason === 'access_policy_revision_conflict'
          ? normalizeSnapshot(await adapter.load(actorPlayerId, ref), ref) ?? undefined
          : undefined;
        return { ok: false, reason, ...(current ? { current } : {}) };
      }
    });
  }

  private async runExclusive<T>(ref: AccessPolicyResourceRef, action: () => Promise<T>): Promise<T> {
    const key = `${ref.resourceType}\u0000${ref.resourceId}\u0000${ref.slot}`;
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

function normalizeResourceRef(value: AccessPolicyResourceRef | null | undefined): AccessPolicyResourceRef | null {
  const resourceType = normalizeKey(value?.resourceType, 64);
  const resourceId = normalizeKey(value?.resourceId, 160);
  const slot = normalizeKey(value?.slot, 64);
  return resourceType && resourceId && slot ? { resourceType, resourceId, slot } : null;
}

function normalizeRevision(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeSnapshot(
  value: ManagedAccessPolicyResourceSnapshot | null | undefined,
  ref: AccessPolicyResourceRef,
): ManagedAccessPolicyResourceSnapshot | null {
  if (!value) return null;
  const normalizedRef = normalizeResourceRef(value);
  const revision = normalizeRevision(value.revision);
  const validated = validateAccessPolicy(value.policy, { requireResolvedPlayers: true });
  if (!normalizedRef
    || normalizedRef.resourceType !== ref.resourceType
    || normalizedRef.resourceId !== ref.resourceId
    || normalizedRef.slot !== ref.slot
    || revision === null
    || !validated.ok
    || !validated.policy
    || validated.policy.revision !== revision) {
    return null;
  }
  return {
    ...normalizedRef,
    revision,
    policy: cloneAccessPolicy(validated.policy),
    ...(typeof value.ownerPlayerId === 'string' || value.ownerPlayerId === null
      ? { ownerPlayerId: value.ownerPlayerId }
      : {}),
  };
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
