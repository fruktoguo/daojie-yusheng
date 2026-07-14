/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { randomBytes } from 'node:crypto';
import { normalizeRuntimeInstancePersistentPolicy, parseRuntimeInstanceDescriptor } from "./world-runtime.normalization.helpers";
import {
  logPrunedBuildingAudit,
  recoverVaultsBeforePlacementPrune,
  releaseTimeChambersBeforePlacementPrune,
} from './building-placement-prune.helpers';

const INSTANCE_LEASE_TTL_MS = 45_000;
const INSTANCE_LEASE_RENEW_SKEW_MS = 5_000;
const LONG_LIVED_INSTANCE_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_LEASE_DEGRADED_REASONS = new Set([
  'lease_sync_failed',
  'advance_frame_lease_check_failed',
  'instance_tick_lease_check_failed',
  'action_execution_lease_check_failed',
  'player_write_lease_check_failed',
  'instance_write_lease_check_failed',
  'transfer_lease_check_failed',
  'build_map_persistence_snapshot_lease_check_failed',
  'flush_instance_domains_lease_check_failed',
]);
/** 每个 runtime 同时只允许一个销毁尝试；WeakMap 标记不会进入快照或协议。 */
const INSTANCE_DESTROY_ATTEMPT_TOKENS = new WeakMap<object, symbol>();
/** ownership replay 到 hydrate 完成期间的单调用凭据，防止并发旧任务借用过渡态继续写回。 */
const INSTANCE_OWNERSHIP_TRANSITION_TOKENS = new WeakMap<object, symbol>();

async function persistBuildingRoomStateAfterStartupRecovery(runtime, domainPersistenceService, instanceId, instance, hydrateResult) {
  const skippedCount = Math.max(0, Math.trunc(Number(hydrateResult?.skippedUnknownDefCount) || 0));
  const skippedProtectedPlacementCount = Math.max(0, Math.trunc(Number(hydrateResult?.skippedProtectedPlacementCount) || 0));
  const restoredSkippedBuildingTileCellCount = Math.max(0, Math.trunc(Number(hydrateResult?.restoredSkippedBuildingTileCellCount) || 0));
  const repairedBuildingCellCount = Math.max(0, Math.trunc(Number(hydrateResult?.repairedBuildingCellCount) || 0));
  const repairedBuildingVisualCellCount = Math.max(0, Math.trunc(Number(hydrateResult?.repairedBuildingVisualCellCount) || 0));
  const restoredStaleBuildingVisualCellCount = Math.max(0, Math.trunc(Number(hydrateResult?.restoredStaleBuildingVisualCellCount) || 0));
  const runtimeTileCellRecoveryCount = restoredSkippedBuildingTileCellCount
    + repairedBuildingVisualCellCount
    + restoredStaleBuildingVisualCellCount;
  if (skippedCount <= 0
    && skippedProtectedPlacementCount <= 0
    && restoredSkippedBuildingTileCellCount <= 0
    && repairedBuildingCellCount <= 0) {
    return;
  }
  if (typeof domainPersistenceService?.saveBuildingRoomFengShuiState === 'function') {
    const state = typeof instance?.buildBuildingRoomFengShuiPersistenceState === 'function'
      ? instance.buildBuildingRoomFengShuiPersistenceState()
      : {
        buildings: typeof instance?.buildBuildingPersistenceEntries === 'function' ? instance.buildBuildingPersistenceEntries() : [],
        rooms: typeof instance?.listRoomSummaries === 'function' ? instance.listRoomSummaries() : [],
        roomCells: [],
        fengShui: [],
    };
    await domainPersistenceService.saveBuildingRoomFengShuiState(instanceId, state);
  }
  if (runtimeTileCellRecoveryCount > 0 && typeof domainPersistenceService?.replaceRuntimeTileCells === 'function') {
    await domainPersistenceService.replaceRuntimeTileCells(
      instanceId,
      typeof instance?.buildRuntimeTilePersistenceEntries === 'function' ? instance.buildRuntimeTilePersistenceEntries() : [],
    );
  }
  if (skippedCount > 0) {
    runtime.logger?.warn?.(`启动清理了 ${skippedCount} 个未知建筑定义实例：${instanceId}`);
  }
  if (skippedProtectedPlacementCount > 0) {
    runtime.logger?.warn?.(`启动清理了 ${skippedProtectedPlacementCount} 个违规保护点位建筑：${instanceId}`);
  }
  if (restoredSkippedBuildingTileCellCount > 0) {
    runtime.logger?.warn?.(`启动恢复了 ${restoredSkippedBuildingTileCellCount} 个违规建筑占用地块：${instanceId}`);
  }
  if (repairedBuildingCellCount > 0) {
    runtime.logger?.warn?.(`启动修复了 ${repairedBuildingCellCount} 个失配建筑占格：${instanceId}`);
  }
}

export async function registerManagedInstanceCatalog(runtime, instanceId, instance) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return;
  }
  const templateId = instance?.template?.id ?? instance?.templateId ?? '';
  const kind = typeof instance?.kind === 'string' && instance.kind.trim() ? instance.kind.trim() : 'public';
  const persistentPolicy = normalizeRuntimeInstancePersistentPolicy(
    instance?.meta?.persistentPolicy
    ?? (instance?.meta?.persistent === true || instance?.persistent === true ? 'persistent' : 'ephemeral'),
  );
  const catalogReservationToken = typeof instance?.meta?.catalogReservationToken === 'string'
    ? instance.meta.catalogReservationToken.trim()
    : '';
  if (catalogReservationToken) {
    const confirmed = await runtime.instanceCatalogService.confirmManualLineReservation({
      instanceId,
      reservationToken: catalogReservationToken,
      expectedTemplateId: templateId,
      expectedInstanceType: kind,
      expectedPersistentPolicy: persistentPolicy,
    });
    if (confirmed !== true) {
      throw new Error(`manual_line_catalog_reservation_conflict:${instanceId}`);
    }
    return;
  }
  await runtime.instanceCatalogService.upsertInstanceCatalog({
    instanceId,
    templateId,
    instanceType: kind,
    persistentPolicy,
    ownerPlayerId: instance?.meta?.ownerPlayerId ?? null,
    ownerSectId: instance?.meta?.ownerSectId ?? null,
    partyId: instance?.meta?.partyId ?? null,
    lineId: instance?.meta?.lineId ?? null,
    status: instance?.meta?.status ?? 'active',
    runtimeStatus: instance?.meta?.runtimeStatus ?? 'running',
    assignedNodeId: instance?.meta?.assignedNodeId ?? null,
    leaseToken: instance?.meta?.leaseToken ?? null,
    leaseExpireAt: instance?.meta?.leaseExpireAt ?? null,
    ownershipEpoch: instance?.meta?.ownershipEpoch ?? 0,
    clusterId: instance?.meta?.clusterId ?? null,
    shardKey: instance?.meta?.shardKey ?? instanceId,
    routeDomain: instance?.meta?.routeDomain ?? null,
    destroyAt: instance?.meta?.destroyAt ?? null,
    lastActiveAt: instance?.meta?.lastActiveAt ?? null,
    lastPersistedAt: instance?.meta?.lastPersistedAt ?? null,
    preserveExistingLease: persistentPolicy === 'persistent' || persistentPolicy === 'long_lived',
  });
}

export async function syncManagedInstanceRegistration(
  runtime,
  instanceId,
  instance,
  options: { isCurrent?: () => boolean } = {},
) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return { ok: true, reason: 'catalog_disabled' };
  }
  const isCurrent = () => (
    (typeof options.isCurrent !== 'function' || options.isCurrent() !== false)
    && (typeof runtime.getInstanceRuntime !== 'function' || runtime.getInstanceRuntime(instanceId) === instance)
  );
  try {
    if (!isCurrent()) {
      return { ok: false, reason: 'instance_replaced' };
    }
    if (shouldDeferManagedLeaseSyncUntilStartupGateOpen(runtime, instanceId)) {
      // 启动 gate 关闭时只做幂等注册；upsert 自身带 tombstone WHERE fence，
      // 不提前读取/接管 lease，后续统一由启动恢复链裁定。
      await registerManagedInstanceCatalog(runtime, instanceId, instance);
      return isCurrent()
        ? { ok: true, reason: 'startup_deferred' }
        : { ok: false, reason: 'instance_replaced' };
    }
    const existingCatalog = await runtime.instanceCatalogService.loadInstanceCatalog(instanceId);
    if (!isCurrent()) {
      return { ok: false, reason: 'instance_replaced' };
    }
    if (isCatalogTombstone(existingCatalog)) {
      runtime.logger.warn(`实例 catalog 已进入 tombstone，拒绝普通注册覆盖：${instanceId}`);
      fenceInstanceRuntime(runtime, instanceId, 'catalog_tombstone', instance);
      return { ok: false, reason: 'catalog_tombstone' };
    }
    await registerManagedInstanceCatalog(runtime, instanceId, instance);
    if (!isCurrent()) {
      return { ok: false, reason: 'instance_replaced' };
    }
    await syncInstanceLease(runtime, instanceId);
    const currentInstance = typeof runtime.getInstanceRuntime === 'function'
      ? runtime.getInstanceRuntime(instanceId)
      : instance;
    return {
      ok: isCurrent() && isInstanceLeaseWritable(runtime, currentInstance),
      reason: isCurrent() ? 'lease_sync_completed' : 'instance_replaced',
    };
  } catch (error) {
    runtime.logger.warn(`实例目录或租约同步失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, reason: 'registration_or_lease_sync_failed' };
  }
}

function shouldDeferManagedLeaseSyncUntilStartupGateOpen(runtime, instanceId) {
  const startupBarrierService = runtime.startupBarrierService;
  if (typeof startupBarrierService?.isInstanceWritable !== 'function') {
    return false;
  }
  return !startupBarrierService.isInstanceWritable(instanceId);
}

export function isInstanceLeaseWritable(runtime, instance) {
  if (!instance || instance?.meta?.runtimeStatus === 'fenced') {
    return false;
  }
  if (instance?.meta?.runtimeStatus === 'destroying') {
    return false;
  }
  if (instance?.meta?.runtimeStatus === 'lease_degraded'
    || instance?.meta?.runtimeStatus === 'cleanup_pending'
    || instance?.meta?.runtimeStatus === 'ownership_transition'
    || instance?.meta?.runtimeStatus === 'releasing'
    || instance?.meta?.runtimeStatus === 'creating') {
    return false;
  }
  if (instance?.meta?.runtimeStatus === 'stopped' || instance?.meta?.status === 'destroyed') {
    return false;
  }
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return true;
  }
  const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
  const leaseToken = typeof instance?.meta?.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
  if (!assignedNodeId || !leaseToken) {
    return false;
  }
  if (assignedNodeId !== runtime.nodeRegistryService.getNodeId()) {
    return false;
  }
  const leaseExpireAt = instance?.meta?.leaseExpireAt ? new Date(instance.meta.leaseExpireAt).getTime() : 0;
  return leaseExpireAt > Date.now();
}

export function getInstancePlayerAttachReadiness(runtime, instanceId) {
  const instance = runtime.getInstanceRuntime(instanceId);
  if (!instance) return { ok: false, reason: 'instance_missing', instance: null };
  const runtimeStatus = typeof instance?.meta?.runtimeStatus === 'string' ? instance.meta.runtimeStatus.trim() : '';
  const destroyAt = instance?.meta?.destroyAt ? new Date(instance.meta.destroyAt).getTime() : 0;
  if (Number.isFinite(destroyAt) && destroyAt > 0 && destroyAt <= Date.now()) {
    return { ok: false, reason: 'instance_destroy_expired', instance };
  }
  const blockedReasons = {
    fenced: 'lease_fenced',
    lease_degraded: 'lease_degraded',
    template_missing: 'template_missing',
    stopped: 'instance_stopped',
    creating: 'instance_ownership_transition',
    ownership_transition: 'instance_ownership_transition',
    releasing: 'instance_ownership_transition',
  };
  if (blockedReasons[runtimeStatus]) {
    return { ok: false, reason: blockedReasons[runtimeStatus], instance };
  }
  if (instance?.meta?.status === 'destroyed') return { ok: false, reason: 'instance_destroyed', instance };
  if (runtime.startupBarrierService?.isInstanceAttachAllowed
    && !runtime.startupBarrierService.isInstanceAttachAllowed(instanceId)) {
    return { ok: false, reason: 'attach_gate_closed', instance };
  }
  return isInstanceLeaseWritable(runtime, instance)
    ? { ok: true, reason: 'ready', instance }
    : { ok: false, reason: 'lease_not_local', instance };
}

export function fenceInstanceRuntime(runtime, instanceId, reason = 'lease_lost', expectedInstance = null) {
  const instance = runtime.getInstanceRuntime(instanceId);
  if (expectedInstance && instance !== expectedInstance) {
    return;
  }
  if (!instance || instance?.meta?.runtimeStatus === 'fenced') {
    return;
  }
  if (shouldMarkLocalLeaseDegraded(runtime, instance, reason)) {
    markLocalLeaseDegraded(runtime, instanceId, instance, reason);
    return;
  }
  instance.meta.runtimeStatus = 'fenced';
  instance.meta.status = 'lease_lost';
  instance.meta.leaseToken = null;
  instance.meta.leaseExpireAt = null;
  const activePlayers = typeof instance.listPlayerIds === 'function' ? instance.listPlayerIds() : [];
  if (!Array.isArray(activePlayers) || activePlayers.length === 0) {
    runtime.worldRuntimeInstanceStateService.deleteInstanceRuntime(instanceId);
    runtime.worldRuntimeTickProgressService.clearInstance(instanceId);
    runtime.worldRuntimeLootContainerService.removeInstanceState(instanceId);
    if (typeof runtime.runtimeEventBusService?.discardInstance === 'function') {
      runtime.runtimeEventBusService.discardInstance(instanceId);
    }
    if (typeof runtime.worldRuntimeFormationService?.releaseInstance === 'function') {
      runtime.worldRuntimeFormationService.releaseInstance(instanceId);
    }
    runtime.logger.warn(`实例 ${instanceId} 已因租约隔离被卸载：${reason}`);
    return;
  }
  runtime.logger.error(`实例 ${instanceId} 租约隔离命中但仍有在线玩家，已停止写入：${reason} players=${activePlayers.join(',')}`);
}

function shouldMarkLocalLeaseDegraded(runtime, instance, reason) {
  if (!LOCAL_LEASE_DEGRADED_REASONS.has(reason)) {
    return false;
  }
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return false;
  }
  const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
  const leaseToken = typeof instance?.meta?.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
  if (!assignedNodeId || !leaseToken || assignedNodeId !== runtime.nodeRegistryService.getNodeId()) {
    return false;
  }
  if (reason === 'lease_sync_failed') {
    return true;
  }
  const leaseExpireAt = instance?.meta?.leaseExpireAt ? new Date(instance.meta.leaseExpireAt).getTime() : 0;
  return !Number.isFinite(leaseExpireAt) || leaseExpireAt <= Date.now();
}

function markLocalLeaseDegraded(runtime, instanceId, instance, reason) {
  const wasDegraded = instance.meta.runtimeStatus === 'lease_degraded';
  instance.meta.runtimeStatus = 'lease_degraded';
  instance.meta.status = 'active';
  if (!wasDegraded) {
    runtime.logger.warn(`实例 ${instanceId} 本节点租约续租降级，暂停写入并等待恢复：${reason}`);
  }
}

export async function destroyManagedInstance(runtime, instanceId, reason = 'scheduled_destroy') {
  const instance = runtime.getInstanceRuntime(instanceId);
  if (!instance) {
    return { ok: false, reason: 'instance_not_found' };
  }
  const initialPlayers = listManagedInstancePlayerIds(instance);
  if (initialPlayers.length > 0) {
    return { ok: false, reason: 'players_present', players: initialPlayers };
  }
  if (instance?.meta?.runtimeStatus === 'destroying') {
    return { ok: false, reason: 'instance_destroy_in_progress' };
  }
  const destroyAt = instance.meta.destroyAt ?? new Date().toISOString();
  let nextOwnershipEpoch = normalizeOwnershipEpoch(instance?.meta?.ownershipEpoch, 0);
  const catalogEnabled = runtime.instanceCatalogService?.isEnabled?.() === true;
  let assignedNodeId = null;
  let leaseToken = null;
  if (catalogEnabled) {
    if (typeof runtime.instanceCatalogService.destroyInstanceCatalogWithFence !== 'function') {
      return { ok: false, reason: 'instance_catalog_destroy_unsupported' };
    }
    const localNodeId = runtime.nodeRegistryService.getNodeId();
    assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string' && instance.meta.assignedNodeId.trim()
      ? instance.meta.assignedNodeId.trim()
      : null;
    leaseToken = typeof instance?.meta?.leaseToken === 'string' && instance.meta.leaseToken.trim()
      ? instance.meta.leaseToken.trim()
      : null;
    if ((assignedNodeId === null) !== (leaseToken === null)) {
      return { ok: false, reason: 'instance_lease_incomplete' };
    }
    const cleanupPending = instance?.meta?.runtimeStatus === 'cleanup_pending';
    const cleanupLeaseExpireAt = instance?.meta?.leaseExpireAt
      ? new Date(instance.meta.leaseExpireAt).getTime()
      : 0;
    const cleanupLeaseValid = cleanupPending
      && assignedNodeId === localNodeId
      && Number.isFinite(cleanupLeaseExpireAt)
      && cleanupLeaseExpireAt > Date.now();
    if (assignedNodeId !== null
      && (assignedNodeId !== localNodeId
        || (!cleanupLeaseValid && !isInstanceLeaseWritable(runtime, instance)))) {
      return { ok: false, reason: 'instance_lease_not_local' };
    }
  }

  const destroyAttempt = beginManagedInstanceDestroyAttempt(instance);
  let destroyed = null;
  if (catalogEnabled) {
    try {
      destroyed = await runtime.instanceCatalogService.destroyInstanceCatalogWithFence({
        instanceId,
        assignedNodeId,
        leaseToken,
        expectedOwnershipEpoch: nextOwnershipEpoch,
        destroyAt,
      });
    } catch (error) {
      restoreManagedInstanceDestroyAttempt(runtime, instanceId, instance, destroyAttempt);
      throw error;
    }
    if (destroyed?.ok !== true || !Number.isFinite(Number(destroyed.ownershipEpoch))) {
      restoreManagedInstanceDestroyAttempt(runtime, instanceId, instance, destroyAttempt);
      return { ok: false, reason: 'instance_catalog_fence_failed' };
    }
    nextOwnershipEpoch = normalizeOwnershipEpoch(destroyed.ownershipEpoch, nextOwnershipEpoch + 1);
  }

  const current = runtime.getInstanceRuntime(instanceId);
  if (!current) {
    clearManagedInstanceDestroyAttempt(instance, destroyAttempt);
    cleanupManagedInstanceRuntimeState(runtime, instanceId, null);
    runtime.logger.log(`实例 ${instanceId} 已在 catalog fence 后由并发链卸载：${reason}`);
    return { ok: true };
  }
  const playersAfterFence = listManagedInstancePlayerIds(current);
  const destroyAttemptStillCurrent = current === instance
    && isManagedInstanceDestroyAttemptCurrent(instance, destroyAttempt);
  if (!destroyAttemptStillCurrent || playersAfterFence.length > 0) {
    clearManagedInstanceDestroyAttempt(instance, destroyAttempt);
    if (current?.meta) {
      current.meta.runtimeStatus = 'destroying';
    }
    const conflictReason = current !== instance
      ? 'instance_replaced_after_catalog_fence'
      : playersAfterFence.length > 0
        ? 'players_present_after_catalog_fence'
        : 'instance_state_changed_after_catalog_fence';
    if (!catalogEnabled) {
      markManagedInstanceDestroyCompensationFailed(current, nextOwnershipEpoch, destroyAt);
      return {
        ok: false,
        reason: conflictReason,
        compensated: false,
        players: playersAfterFence,
      };
    }
    return compensateManagedInstanceDestroyConflict(runtime, {
      instanceId,
      originalInstance: instance,
      currentInstance: current,
      destroyedOwnershipEpoch: nextOwnershipEpoch,
      destroyAt,
      conflictReason,
      players: playersAfterFence,
    });
  }

  instance.meta.runtimeStatus = 'stopped';
  instance.meta.status = 'destroyed';
  instance.meta.assignedNodeId = null;
  instance.meta.leaseToken = null;
  instance.meta.leaseExpireAt = null;
  instance.meta.ownershipEpoch = nextOwnershipEpoch;
  instance.meta.destroyAt = destroyAt;
  clearManagedInstanceDestroyAttempt(instance, destroyAttempt);
  if (!cleanupManagedInstanceRuntimeState(runtime, instanceId, instance)) {
    if (catalogEnabled) {
      const replacement = runtime.getInstanceRuntime(instanceId);
      if (replacement?.meta) {
        replacement.meta.runtimeStatus = 'destroying';
      }
      return compensateManagedInstanceDestroyConflict(runtime, {
        instanceId,
        originalInstance: instance,
        currentInstance: replacement,
        destroyedOwnershipEpoch: nextOwnershipEpoch,
        destroyAt,
        conflictReason: 'instance_replaced_before_runtime_cleanup',
        players: listManagedInstancePlayerIds(replacement),
      });
    }
    return { ok: false, reason: 'instance_replaced_before_runtime_cleanup', compensated: false };
  }
  runtime.logger.log(`实例 ${instanceId} 已按生命周期销毁：${reason}`);
  return { ok: true };
}

function beginManagedInstanceDestroyAttempt(instance) {
  const attempt = {
    token: Symbol('managed_instance_destroy'),
    previousRuntimeStatus: instance?.meta?.runtimeStatus,
    previousStatus: instance?.meta?.status,
  };
  INSTANCE_DESTROY_ATTEMPT_TOKENS.set(instance, attempt.token);
  instance.meta.runtimeStatus = 'destroying';
  return attempt;
}

function isManagedInstanceDestroyAttemptCurrent(instance, attempt) {
  return INSTANCE_DESTROY_ATTEMPT_TOKENS.get(instance) === attempt.token
    && instance?.meta?.runtimeStatus === 'destroying'
    && instance?.meta?.status === attempt.previousStatus;
}

function restoreManagedInstanceDestroyAttempt(runtime, instanceId, instance, attempt) {
  const current = runtime.getInstanceRuntime(instanceId);
  if (current === instance && isManagedInstanceDestroyAttemptCurrent(instance, attempt)) {
    instance.meta.runtimeStatus = attempt.previousRuntimeStatus;
    instance.meta.status = attempt.previousStatus;
    INSTANCE_DESTROY_ATTEMPT_TOKENS.delete(instance);
    return true;
  }
  clearManagedInstanceDestroyAttempt(instance, attempt);
  return false;
}

function clearManagedInstanceDestroyAttempt(instance, attempt) {
  if (INSTANCE_DESTROY_ATTEMPT_TOKENS.get(instance) === attempt.token) {
    INSTANCE_DESTROY_ATTEMPT_TOKENS.delete(instance);
  }
}

function listManagedInstancePlayerIds(instance) {
  const players = typeof instance?.listPlayerIds === 'function' ? instance.listPlayerIds() : [];
  return Array.isArray(players) ? players : [];
}

function cleanupManagedInstanceRuntimeState(runtime, instanceId, expectedInstance) {
  if (typeof runtime.getInstanceRuntime === 'function'
    && runtime.getInstanceRuntime(instanceId) !== expectedInstance) {
    return false;
  }
  runtime.worldRuntimeInstanceStateService?.deleteInstanceRuntime?.(instanceId);
  runtime.worldRuntimeTickProgressService?.clearInstance?.(instanceId);
  runtime.worldRuntimeLootContainerService?.removeInstanceState?.(instanceId);
  runtime.runtimeEventBusService?.discardInstance?.(instanceId);
  runtime.worldRuntimeFormationService?.releaseInstance?.(instanceId);
  return true;
}

async function quarantineOwnershipHydrateFailure(runtime, instanceId, instance, input) {
  completeOwnershipTransition(instance, input.transitionToken);
  if (input.destroyCatalog === true && listManagedInstancePlayerIds(instance).length === 0) {
    try {
      const destroyed = await runtime.instanceCatalogService.destroyInstanceCatalogWithFence?.({
        instanceId,
        assignedNodeId: input.nodeId,
        leaseToken: input.leaseToken,
        expectedOwnershipEpoch: input.ownershipEpoch,
        destroyAt: new Date().toISOString(),
      });
      if (destroyed?.ok === true) {
        if (!cleanupManagedInstanceRuntimeState(runtime, instanceId, instance)) {
          const replacement = runtime.getInstanceRuntime(instanceId);
          fenceInstanceRuntime(runtime, instanceId, 'hydrate_failure_catalog_tombstone', replacement);
        }
        return;
      }
    } catch (error) {
      runtime.logger.warn(
        `实例水合失败且精确销毁异常：${instanceId} ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (input.destroyCatalog !== true && listManagedInstancePlayerIds(instance).length === 0) {
    try {
      const released = await runtime.instanceCatalogService.releaseInstanceLease?.({
        instanceId,
        nodeId: input.nodeId,
        leaseToken: input.leaseToken,
      });
      if (released === true) {
        if (!cleanupManagedInstanceRuntimeState(runtime, instanceId, instance)) {
          const replacement = runtime.getInstanceRuntime(instanceId);
          fenceInstanceRuntime(runtime, instanceId, 'hydrate_failure_lease_released', replacement);
        }
        return;
      }
    } catch (error) {
      runtime.logger.warn(
        `实例接管收尾释放异常：${instanceId} ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  instance.meta.runtimeStatus = 'cleanup_pending';
  instance.meta.status = 'active';
  instance.meta.destroyAt = new Date().toISOString();
  try {
    await runtime.instanceCatalogService.markInstanceCleanupPendingWithFence?.({
      instanceId,
      assignedNodeId: input.nodeId,
      leaseToken: input.leaseToken,
      expectedOwnershipEpoch: input.ownershipEpoch,
    });
  } catch (error) {
    runtime.logger.warn(
      `实例水合失败待清理状态持久化异常：${instanceId} ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function compensateManagedInstanceDestroyConflict(runtime, input) {
  const target = input.currentInstance;
  const originalIdentity = resolveManagedInstanceCatalogIdentity(input.originalInstance);
  const targetIdentity = resolveManagedInstanceCatalogIdentity(target);
  if (!target?.meta
    || !originalIdentity.templateId
    || !originalIdentity.instanceType
    || targetIdentity.templateId !== originalIdentity.templateId
    || targetIdentity.instanceType !== originalIdentity.instanceType
    || typeof runtime.instanceCatalogService?.reviveInstanceLeaseWithFence !== 'function') {
    markManagedInstanceDestroyCompensationFailed(target, input.destroyedOwnershipEpoch, input.destroyAt);
    runtime.logger.error(
      `实例 ${input.instanceId} catalog 已销毁但运行态冲突无法补偿：${input.conflictReason}`,
    );
    return {
      ok: false,
      reason: input.conflictReason,
      compensated: false,
      compensationReason: 'catalog_revival_identity_or_api_unavailable',
      players: input.players,
    };
  }

  const nodeId = String(runtime.nodeRegistryService.getNodeId()).trim();
  const leaseToken = `${nodeId}:${input.instanceId}:destroy-compensation:${Date.now()}:${randomBytes(6).toString('base64url')}`;
  const leaseExpireAt = new Date(Date.now() + INSTANCE_LEASE_TTL_MS);
  let revived;
  let compensationTransitionToken = null;
  try {
    compensationTransitionToken = await freezeAndReplayInstanceOwnershipEpoch(
      runtime,
      target,
      input.instanceId,
      input.destroyedOwnershipEpoch,
    );
    if (runtime.getInstanceRuntime(input.instanceId) !== target
      || !isOwnershipTransitionCurrent(target, compensationTransitionToken)) {
      throw new Error(`instance_ownership_transition_replaced:${input.instanceId}`);
    }
    revived = await runtime.instanceCatalogService.reviveInstanceLeaseWithFence({
      instanceId: input.instanceId,
      expectedTemplateId: originalIdentity.templateId,
      expectedInstanceType: originalIdentity.instanceType,
      expectedCurrentNodeId: null,
      expectedCurrentLeaseToken: null,
      nodeId,
      leaseToken,
      leaseExpireAt,
      expectedOwnershipEpoch: input.destroyedOwnershipEpoch,
    });
  } catch (error) {
    markManagedInstanceDestroyCompensationFailed(target, input.destroyedOwnershipEpoch, input.destroyAt);
    runtime.logger.error(
      `实例 ${input.instanceId} catalog 销毁冲突补偿异常：${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      ok: false,
      reason: input.conflictReason,
      compensated: false,
      compensationReason: 'catalog_replay_or_revival_failed',
      players: input.players,
    };
  }
  const compensatedOwnershipEpoch = parseOwnershipEpoch(revived?.ownershipEpoch);
  if (revived?.ok !== true || compensatedOwnershipEpoch !== input.destroyedOwnershipEpoch + 1) {
    markManagedInstanceDestroyCompensationFailed(target, input.destroyedOwnershipEpoch, input.destroyAt);
    runtime.logger.error(`实例 ${input.instanceId} catalog 销毁冲突补偿 CAS 失败：${input.conflictReason}`);
    return {
      ok: false,
      reason: input.conflictReason,
      compensated: false,
      compensationReason: 'catalog_revival_conflict',
      players: input.players,
    };
  }

  if (runtime.getInstanceRuntime(input.instanceId) !== target) {
    const latest = runtime.getInstanceRuntime(input.instanceId);
    markManagedInstanceDestroyCompensationFailed(latest, compensatedOwnershipEpoch, null);
    const retombstoned = await retombstoneFailedDestroyCompensation(
      runtime,
      input.instanceId,
      nodeId,
      leaseToken,
      compensatedOwnershipEpoch,
    );
    return {
      ok: false,
      reason: input.conflictReason,
      compensated: true,
      compensationReason: 'instance_replaced_during_compensation',
      compensationRetombstoned: retombstoned,
      players: input.players,
    };
  }

  target.meta.assignedNodeId = nodeId;
  target.meta.leaseToken = leaseToken;
  target.meta.leaseExpireAt = leaseExpireAt.toISOString();
  target.meta.ownershipEpoch = compensatedOwnershipEpoch;
  if (!isOwnershipTransitionCurrent(target, compensationTransitionToken)) {
    await retombstoneFailedDestroyCompensation(
      runtime,
      input.instanceId,
      nodeId,
      leaseToken,
      compensatedOwnershipEpoch,
    );
    markManagedInstanceDestroyCompensationFailed(target, compensatedOwnershipEpoch, null);
    return {
      ok: false,
      reason: input.conflictReason,
      compensated: false,
      compensationReason: 'ownership_transition_replaced',
      players: input.players,
    };
  }
  try {
    await hydratePersistentInstanceSnapshot(runtime, input.instanceId, target);
  } catch (error) {
    await retombstoneFailedDestroyCompensation(
      runtime,
      input.instanceId,
      nodeId,
      leaseToken,
      compensatedOwnershipEpoch,
    );
    markManagedInstanceDestroyCompensationFailed(target, compensatedOwnershipEpoch, null);
    runtime.logger.error(
      `实例 ${input.instanceId} 销毁冲突补偿水合失败：${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      ok: false,
      reason: input.conflictReason,
      compensated: false,
      compensationReason: 'catalog_revival_hydrate_failed',
      players: input.players,
    };
  }
  if (runtime.getInstanceRuntime(input.instanceId) !== target
    || !isOwnershipTransitionCurrent(target, compensationTransitionToken)) {
    await retombstoneFailedDestroyCompensation(
      runtime,
      input.instanceId,
      nodeId,
      leaseToken,
      compensatedOwnershipEpoch,
    );
    markManagedInstanceDestroyCompensationFailed(
      runtime.getInstanceRuntime(input.instanceId),
      compensatedOwnershipEpoch,
      null,
    );
    return {
      ok: false,
      reason: input.conflictReason,
      compensated: false,
      compensationReason: 'instance_replaced_during_compensation_hydrate',
      players: input.players,
    };
  }
  completeOwnershipTransition(target, compensationTransitionToken);
  target.meta.runtimeStatus = 'leased';
  target.meta.status = 'active';
  target.meta.destroyAt = null;
  runtime.logger.warn(`实例 ${input.instanceId} 销毁后发现运行态冲突，已恢复 catalog lease：${input.conflictReason}`);
  return {
    ok: false,
    reason: input.conflictReason,
    compensated: true,
    ownershipEpoch: compensatedOwnershipEpoch,
    players: input.players,
  };
}

async function retombstoneFailedDestroyCompensation(
  runtime,
  instanceId,
  nodeId,
  leaseToken,
  ownershipEpoch,
) {
  try {
    const destroyed = await runtime.instanceCatalogService.destroyInstanceCatalogWithFence?.({
      instanceId,
      assignedNodeId: nodeId,
      leaseToken,
      expectedOwnershipEpoch: ownershipEpoch,
      destroyAt: new Date().toISOString(),
    });
    if (destroyed?.ok === true) {
      return true;
    }
  } catch (error) {
    runtime.logger.error(
      `实例 ${instanceId} 销毁补偿失败后的重新 tombstone 异常：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    const pending = await runtime.instanceCatalogService.markInstanceCleanupPendingWithFence?.({
      instanceId,
      assignedNodeId: nodeId,
      leaseToken,
      expectedOwnershipEpoch: ownershipEpoch,
    });
    if (pending === true) {
      runtime.logger.error(`实例 ${instanceId} 无法重新 tombstone，已持久化为 cleanup_pending`);
      return false;
    }
  } catch (error) {
    runtime.logger.error(
      `实例 ${instanceId} 重新 tombstone 失败且待清理状态持久化异常：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  runtime.logger.error(`实例 ${instanceId} 销毁补偿失败后无法重新 tombstone，保留本地围栏`);
  return false;
}

function resolveManagedInstanceCatalogIdentity(instance) {
  const templateId = typeof instance?.meta?.templateId === 'string' && instance.meta.templateId.trim()
    ? instance.meta.templateId.trim()
    : typeof instance?.template?.id === 'string' ? instance.template.id.trim() : '';
  const instanceType = typeof instance?.meta?.kind === 'string' && instance.meta.kind.trim()
    ? instance.meta.kind.trim()
    : typeof instance?.kind === 'string' && instance.kind.trim() ? instance.kind.trim() : '';
  return { templateId, instanceType };
}

function markManagedInstanceDestroyCompensationFailed(instance, ownershipEpoch, destroyAt) {
  if (!instance?.meta) {
    return;
  }
  instance.meta.runtimeStatus = 'fenced';
  instance.meta.status = 'lease_lost';
  instance.meta.assignedNodeId = null;
  instance.meta.leaseToken = null;
  instance.meta.leaseExpireAt = null;
  instance.meta.ownershipEpoch = ownershipEpoch;
  instance.meta.destroyAt = destroyAt;
}

export function unfreezeInstanceWriting(runtime, instanceId) {
  const instance = runtime.getInstanceRuntime(instanceId);
  if (!instance) {
    return { ok: false, reason: 'instance_not_found' };
  }
  const nodeId = runtime.nodeRegistryService.getNodeId();
  const assignedNodeId = typeof instance.meta.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
  const leaseToken = typeof instance.meta.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
  if (!assignedNodeId || !leaseToken) {
    return { ok: false, reason: 'lease_missing' };
  }
  if (assignedNodeId !== nodeId || !isInstanceLeaseWritable(runtime, instance)) {
    return { ok: false, reason: 'lease_not_local' };
  }
  instance.meta.runtimeStatus = 'leased';
  instance.meta.status = 'active';
  return { ok: true };
}

export async function releaseLocalInstanceLeasesForShutdown(runtime) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return { released: 0, skipped: 0, releasedInstanceIds: [], skippedInstanceIds: [], failedInstanceIds: [] };
  }
  const nodeId = runtime.nodeRegistryService.getNodeId();
  let released = 0;
  let skipped = 0;
  const releasedInstanceIds: string[] = [];
  const skippedInstanceIds: string[] = [];
  const failedInstanceIds: string[] = [];
  for (const [instanceId, instance] of runtime.listInstanceEntries()) {
    const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
    const leaseToken = typeof instance?.meta?.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
    if (assignedNodeId !== nodeId || !leaseToken || instance?.meta?.status === 'destroyed') {
      continue;
    }
    if (instance?.meta?.runtimeStatus === 'fenced'
      || instance?.meta?.runtimeStatus === 'cleanup_pending'
      || instance?.meta?.runtimeStatus === 'ownership_transition'
      || instance?.meta?.runtimeStatus === 'releasing'
      || instance?.meta?.runtimeStatus === 'destroying'
      || instance?.meta?.runtimeStatus === 'stopped') {
      skipped++;
      skippedInstanceIds.push(instanceId);
      runtime.logger.warn(`关闭释放跳过（实例生命周期处理中）：${instanceId} status=${instance?.meta?.runtimeStatus ?? 'unknown'}`);
      continue;
    }
    const connectedPlayers = typeof runtime.worldSessionService?.listInstancePlayerIds === 'function'
      ? runtime.worldSessionService.listInstancePlayerIds(instanceId)
      : [];
    if (Array.isArray(connectedPlayers) && connectedPlayers.length > 0) {
      skipped++;
      skippedInstanceIds.push(instanceId);
      runtime.logger.warn(`关闭释放跳过（仍有连接玩家）：${instanceId} players=${connectedPlayers.join(',')}`);
      continue;
    }
    instance.meta.runtimeStatus = 'releasing';
    const ok = await runtime.instanceCatalogService.releaseInstanceLease({ instanceId, nodeId, leaseToken });
    if (!ok) {
      if (runtime.getInstanceRuntime(instanceId) === instance && instance.meta.runtimeStatus === 'releasing') {
        instance.meta.runtimeStatus = 'leased';
      }
      skipped++;
      failedInstanceIds.push(instanceId);
      runtime.logger.warn(`关闭释放失败：${instanceId}`);
      continue;
    }
    if (runtime.getInstanceRuntime(instanceId) !== instance
      || instance?.meta?.runtimeStatus === 'cleanup_pending'
      || instance?.meta?.runtimeStatus !== 'releasing'
      || instance?.meta?.status === 'destroyed') {
      skipped++;
      skippedInstanceIds.push(instanceId);
      runtime.logger.warn(`关闭释放后运行态已变化，跳过本地状态覆盖：${instanceId}`);
      continue;
    }
    instance.meta.assignedNodeId = null;
    instance.meta.leaseToken = null;
    instance.meta.leaseExpireAt = null;
    instance.meta.runtimeStatus = 'stopped';
    released++;
    releasedInstanceIds.push(instanceId);
  }
  return { released, skipped, releasedInstanceIds, skippedInstanceIds, failedInstanceIds };
}

export async function syncInstanceLease(runtime, instanceId, {
  allowForceReclaim = false,
  hydratePersistentSnapshot = true,
} = {}) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return;
  }
  const instance = runtime.getInstanceRuntime(instanceId);
  if (!isManagedInstanceLeaseSyncCurrent(runtime, instanceId, instance)) {
    return;
  }
  const nodeId = runtime.nodeRegistryService.getNodeId();
  const leaseToken = `${nodeId}:${instanceId}:${Date.now()}:${randomBytes(6).toString('base64url')}`;
  const leaseExpireAt = new Date(Date.now() + INSTANCE_LEASE_TTL_MS);
  let assignedNodeId = typeof instance.meta.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
  let currentLeaseToken = typeof instance.meta.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
  let currentLeaseExpireAt = instance.meta.leaseExpireAt ? new Date(instance.meta.leaseExpireAt).getTime() : 0;
  let expectedOwnershipEpoch = Number.isFinite(Number(instance.meta.ownershipEpoch))
    ? Math.trunc(Number(instance.meta.ownershipEpoch))
    : 0;
  if (assignedNodeId
    && currentLeaseToken
    && assignedNodeId !== nodeId
    && (!Number.isFinite(currentLeaseExpireAt) || currentLeaseExpireAt <= Date.now() - INSTANCE_LEASE_RENEW_SKEW_MS)) {
    assignedNodeId = '';
    currentLeaseToken = '';
  }
  if ((!assignedNodeId || !currentLeaseToken) && runtime.instanceCatalogService?.isEnabled?.()) {
    const catalog = await runtime.instanceCatalogService.loadInstanceCatalog(instanceId);
    if (!isManagedInstanceLeaseSyncCurrent(runtime, instanceId, instance)) {
      return;
    }
    const catalogAssignedNodeId = typeof catalog?.assigned_node_id === 'string' ? catalog.assigned_node_id.trim() : '';
    const catalogLeaseToken = typeof catalog?.lease_token === 'string' ? catalog.lease_token.trim() : '';
    const catalogLeaseExpireAt = catalog?.lease_expire_at ? new Date(catalog.lease_expire_at).getTime() : 0;
    const catalogOwnershipEpoch = Number.isFinite(Number(catalog?.ownership_epoch))
      ? Math.trunc(Number(catalog.ownership_epoch))
      : 0;
    if (!isCatalogTombstone(catalog)
      && catalogAssignedNodeId === nodeId
      && catalogLeaseToken
      && Number.isFinite(catalogLeaseExpireAt)
      && catalogLeaseExpireAt > Date.now() - INSTANCE_LEASE_RENEW_SKEW_MS) {
      assignedNodeId = catalogAssignedNodeId;
      currentLeaseToken = catalogLeaseToken;
      currentLeaseExpireAt = catalogLeaseExpireAt;
      expectedOwnershipEpoch = catalogOwnershipEpoch;
      instance.meta.assignedNodeId = catalogAssignedNodeId;
      instance.meta.leaseToken = catalogLeaseToken;
      instance.meta.leaseExpireAt = new Date(catalogLeaseExpireAt).toISOString();
      instance.meta.ownershipEpoch = catalogOwnershipEpoch;
    }
  }
  const renewResult = assignedNodeId && currentLeaseToken
    ? await runtime.instanceCatalogService.renewInstanceLease({
      instanceId,
      nodeId,
      leaseToken: currentLeaseToken,
      leaseExpireAt,
      expectedOwnershipEpoch,
    })
    : null;
  const claimResult = !assignedNodeId || !currentLeaseToken
    ? await claimInstanceOwnershipAfterReplay(runtime, instance, {
      instanceId,
      nodeId,
      leaseToken,
      leaseExpireAt,
      expectedOwnershipEpoch,
      force: false,
    })
    : null;
  const ownershipClaimed = claimResult?.ok === true;
  if (ownershipClaimed
    ? (!isManagedInstanceRuntimeCurrent(runtime, instanceId, instance)
      || !isOwnershipTransitionCurrent(instance, claimResult?.transitionToken))
    : !isManagedInstanceLeaseSyncCurrent(runtime, instanceId, instance)) {
    return;
  }
  const ok = renewResult === true || claimResult?.ok === true;
  if (!ok) {
    const reclaimed = await reclaimMissingCatalogLeaseForLocalRuntime(
      runtime,
      instance,
      instanceId,
      nodeId,
      leaseToken,
      leaseExpireAt,
      expectedOwnershipEpoch,
      hydratePersistentSnapshot,
    );
    if (reclaimed) {
      return;
    }
    if (!isManagedInstanceLeaseSyncCurrent(runtime, instanceId, instance)) {
      return;
    }
    const adopted = await adoptLocalCatalogLeaseAndRenew(runtime, instance, instanceId, nodeId, leaseExpireAt);
    if (adopted) {
      return;
    }
    if (!isManagedInstanceLeaseSyncCurrent(runtime, instanceId, instance)) {
      return;
    }
    // dev/test 环境下启动恢复阶段尝试 force-reclaim，避免旧 lease 未过期导致 fencing
    if (allowForceReclaim && shouldForceReclaimStaleLease()
      && typeof runtime.instanceCatalogService.forceClaimInstanceLease === 'function') {
      const forceClaim = await claimInstanceOwnershipAfterReplay(runtime, instance, {
        instanceId,
        nodeId,
        leaseToken,
        leaseExpireAt,
        expectedOwnershipEpoch,
        force: true,
      });
      if (forceClaim?.ok) {
        const restored = await restoreInstanceAfterOwnershipClaim(runtime, instanceId, instance, {
          nodeId,
          leaseToken,
          leaseExpireAt,
          ownershipEpoch: forceClaim.ownershipEpoch,
          fallbackOwnershipEpoch: expectedOwnershipEpoch + 1,
          hydratePersistentSnapshot,
          transitionToken: forceClaim.transitionToken,
        });
        if (!restored) {
          return;
        }
        runtime.logger.log(`启动恢复强制回收成功：${instanceId} newLeaseToken=${leaseToken}`);
        return;
      }
    }
    fenceInstanceRuntime(runtime, instanceId, 'lease_sync_failed');
    return;
  }
  if (ownershipClaimed
    ? (!isManagedInstanceRuntimeCurrent(runtime, instanceId, instance)
      || !isOwnershipTransitionCurrent(instance, claimResult?.transitionToken))
    : !isManagedInstanceLeaseSyncCurrent(runtime, instanceId, instance)) {
    return;
  }
  instance.meta.assignedNodeId = nodeId;
  instance.meta.leaseToken = assignedNodeId && currentLeaseToken ? currentLeaseToken : leaseToken;
  instance.meta.leaseExpireAt = leaseExpireAt.toISOString();
  instance.meta.ownershipEpoch = assignedNodeId && currentLeaseToken
    ? expectedOwnershipEpoch
    : Number.isFinite(Number(claimResult?.ownershipEpoch)) ? Math.trunc(Number(claimResult.ownershipEpoch)) : expectedOwnershipEpoch + 1;
  const reservationClaimed = ownershipClaimed
    && typeof instance.meta.catalogReservationToken === 'string'
    && Boolean(instance.meta.catalogReservationToken.trim());
  if (ownershipClaimed) {
    instance.meta.catalogReservationToken = null;
  }
  if (claimResult?.ok && hydratePersistentSnapshot !== false) {
    try {
      await hydratePersistentInstanceSnapshot(runtime, instanceId, instance);
    } catch (error) {
      await quarantineOwnershipHydrateFailure(runtime, instanceId, instance, {
        nodeId,
        leaseToken,
        ownershipEpoch: instance.meta.ownershipEpoch,
        transitionToken: claimResult.transitionToken,
        destroyCatalog: reservationClaimed,
      });
      runtime.logger.warn(`实例接管后水合失败，已隔离待清理：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }
  if (!isManagedInstanceRuntimeCurrent(runtime, instanceId, instance)
    || (ownershipClaimed && !isOwnershipTransitionCurrent(instance, claimResult?.transitionToken))) {
    if (ownershipClaimed) {
      await quarantineOwnershipHydrateFailure(runtime, instanceId, instance, {
        nodeId,
        leaseToken,
        ownershipEpoch: instance.meta.ownershipEpoch,
        transitionToken: claimResult.transitionToken,
        destroyCatalog: reservationClaimed,
      });
    }
    return;
  }
  completeOwnershipTransition(instance, claimResult?.transitionToken);
  instance.meta.runtimeStatus = 'leased';
  instance.meta.status = 'active';
}

function isManagedInstanceLeaseSyncCurrent(runtime, instanceId, instance) {
  return isManagedInstanceRuntimeCurrent(runtime, instanceId, instance)
    && instance?.meta?.runtimeStatus !== 'destroying'
    && instance?.meta?.runtimeStatus !== 'cleanup_pending'
    && instance?.meta?.runtimeStatus !== 'ownership_transition'
    && instance?.meta?.runtimeStatus !== 'releasing'
    && instance?.meta?.runtimeStatus !== 'stopped'
    && instance?.meta?.runtimeStatus !== 'fenced'
    && instance?.meta?.status !== 'destroyed';
}

function isManagedInstanceRuntimeCurrent(runtime, instanceId, instance) {
  return Boolean(instance) && runtime.getInstanceRuntime(instanceId) === instance;
}

async function claimInstanceOwnershipAfterReplay(runtime, instance, input) {
  const catalog = await runtime.instanceCatalogService.loadInstanceCatalog(input.instanceId);
  if (!isManagedInstanceLeaseSyncCurrent(runtime, input.instanceId, instance)) {
    return { ok: false, ownershipEpoch: null };
  }
  if (!catalog) {
    return { ok: false, ownershipEpoch: null };
  }
  const expectedReservationToken = typeof instance?.meta?.catalogReservationToken === 'string'
    ? instance.meta.catalogReservationToken.trim()
    : '';
  if (!input.force && !isCatalogLeaseClaimable(catalog, expectedReservationToken)) {
    return { ok: false, ownershipEpoch: null };
  }
  if (isCatalogTombstone(catalog)) {
    runtime.logger.warn(`实例 catalog tombstone 禁止普通接管：${input.instanceId}`);
    return { ok: false, ownershipEpoch: null };
  }
  const catalogOwnershipEpoch = normalizeOwnershipEpoch(catalog.ownership_epoch, input.expectedOwnershipEpoch);
  const runtimeOwnershipEpoch = normalizeOwnershipEpoch(instance?.meta?.ownershipEpoch, catalogOwnershipEpoch);
  if (runtimeOwnershipEpoch !== catalogOwnershipEpoch) {
    runtime.logger.warn(
      `实例 ownership epoch 不一致，拒绝接管：${input.instanceId} runtime=${runtimeOwnershipEpoch} catalog=${catalogOwnershipEpoch}`,
    );
    return { ok: false, ownershipEpoch: null };
  }
  const previousRuntimeStatus = instance?.meta?.runtimeStatus;
  const transitionToken = await freezeAndReplayInstanceOwnershipEpoch(
    runtime,
    instance,
    input.instanceId,
    catalogOwnershipEpoch,
  );
  if (!isManagedInstanceRuntimeCurrent(runtime, input.instanceId, instance)
    || !isOwnershipTransitionCurrent(instance, transitionToken)) {
    return { ok: false, ownershipEpoch: null };
  }
  const claimInput = {
    instanceId: input.instanceId,
    nodeId: input.nodeId,
    leaseToken: input.leaseToken,
    leaseExpireAt: input.leaseExpireAt,
    expectedOwnershipEpoch: catalogOwnershipEpoch,
    expectedReservationToken: expectedReservationToken || null,
  };
  try {
    const claimed = input.force
      ? await runtime.instanceCatalogService.forceClaimInstanceLease(claimInput)
      : await runtime.instanceCatalogService.claimInstanceLease(claimInput);
    if (claimed?.ok === true
      && (!isManagedInstanceRuntimeCurrent(runtime, input.instanceId, instance)
        || !isOwnershipTransitionCurrent(instance, transitionToken))) {
      const claimedOwnershipEpoch = normalizeOwnershipEpoch(
        claimed.ownershipEpoch,
        catalogOwnershipEpoch + 1,
      );
      let cleaned = false;
      try {
        if (expectedReservationToken) {
          const destroyed = await runtime.instanceCatalogService.destroyInstanceCatalogWithFence?.({
            instanceId: input.instanceId,
            assignedNodeId: input.nodeId,
            leaseToken: input.leaseToken,
            expectedOwnershipEpoch: claimedOwnershipEpoch,
            destroyAt: new Date().toISOString(),
          });
          cleaned = destroyed?.ok === true;
        } else {
          cleaned = await runtime.instanceCatalogService.releaseInstanceLease?.({
            instanceId: input.instanceId,
            nodeId: input.nodeId,
            leaseToken: input.leaseToken,
          }) === true;
        }
      } catch (cleanupError) {
        runtime.logger.warn(
          `实例接管成功后运行态已替换，精确 lease 收尾异常：${input.instanceId} ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
      if (!cleaned) {
        try {
          await runtime.instanceCatalogService.markInstanceCleanupPendingWithFence?.({
            instanceId: input.instanceId,
            assignedNodeId: input.nodeId,
            leaseToken: input.leaseToken,
            expectedOwnershipEpoch: claimedOwnershipEpoch,
          });
        } catch {
          // 上层仍会保持运行态关闭；周期清理会在数据库恢复后重试。
        }
      }
      return { ok: false, ownershipEpoch: null, transitionToken };
    }
    if (claimed?.ok !== true
      && isManagedInstanceRuntimeCurrent(runtime, input.instanceId, instance)
      && isOwnershipTransitionCurrent(instance, transitionToken)) {
      completeOwnershipTransition(instance, transitionToken);
      instance.meta.runtimeStatus = previousRuntimeStatus;
    }
    return { ...claimed, transitionToken };
  } catch (error) {
    if (isManagedInstanceRuntimeCurrent(runtime, input.instanceId, instance)
      && isOwnershipTransitionCurrent(instance, transitionToken)) {
      completeOwnershipTransition(instance, transitionToken);
      instance.meta.runtimeStatus = previousRuntimeStatus;
    }
    throw error;
  }
}

async function freezeAndReplayInstanceOwnershipEpoch(runtime, instance, instanceId, ownershipEpoch) {
  const transitionToken = instance?.meta ? Symbol(`ownership-transition:${instanceId}`) : null;
  const previousRuntimeStatus = instance?.meta?.runtimeStatus;
  if (instance?.meta) {
    INSTANCE_OWNERSHIP_TRANSITION_TOKENS.set(instance, transitionToken);
    instance.meta.runtimeStatus = 'ownership_transition';
  }
  if (typeof runtime.replayInstanceFlushPayloadsBeforeOwnershipChange !== 'function') {
    completeOwnershipTransition(instance, transitionToken);
    if (instance?.meta) {
      instance.meta.runtimeStatus = previousRuntimeStatus;
    }
    throw new Error(`instance_flush_replay_unavailable:${instanceId}:${ownershipEpoch}`);
  }
  try {
    await runtime.replayInstanceFlushPayloadsBeforeOwnershipChange(instanceId, ownershipEpoch);
  } catch (error) {
    completeOwnershipTransition(instance, transitionToken);
    if (instance?.meta) {
      instance.meta.runtimeStatus = previousRuntimeStatus;
    }
    throw error;
  }
  return transitionToken;
}

function isOwnershipTransitionCurrent(instance, transitionToken) {
  return Boolean(instance && transitionToken)
    && INSTANCE_OWNERSHIP_TRANSITION_TOKENS.get(instance) === transitionToken
    && instance?.meta?.runtimeStatus === 'ownership_transition';
}

function completeOwnershipTransition(instance, transitionToken) {
  if (instance && transitionToken
    && INSTANCE_OWNERSHIP_TRANSITION_TOKENS.get(instance) === transitionToken) {
    INSTANCE_OWNERSHIP_TRANSITION_TOKENS.delete(instance);
    return true;
  }
  return false;
}

function isCatalogLeaseClaimable(catalog, expectedReservationToken = '') {
  const assignedNodeId = typeof catalog?.assigned_node_id === 'string' ? catalog.assigned_node_id.trim() : '';
  const leaseToken = typeof catalog?.lease_token === 'string' ? catalog.lease_token.trim() : '';
  const leaseExpireAt = catalog?.lease_expire_at ? new Date(catalog.lease_expire_at).getTime() : 0;
  const runtimeStatus = typeof catalog?.runtime_status === 'string' ? catalog.runtime_status.trim() : '';
  if (runtimeStatus === 'creating') {
    return Boolean(expectedReservationToken)
      && !assignedNodeId
      && leaseToken === expectedReservationToken
      && Number.isFinite(leaseExpireAt)
      && leaseExpireAt > Date.now();
  }
  return !assignedNodeId
    || !leaseToken
    || !Number.isFinite(leaseExpireAt)
    || leaseExpireAt < Date.now();
}

function isCatalogTombstone(catalog) {
  if (catalog?.status === 'destroyed' || catalog?.runtime_status === 'stopped') {
    return true;
  }
  const destroyAt = catalog?.destroy_at ? new Date(catalog.destroy_at).getTime() : 0;
  return Number.isFinite(destroyAt) && destroyAt > 0 && destroyAt <= Date.now();
}

function normalizeCatalogDestroyAt(value) {
  const destroyAt = value ? new Date(value).getTime() : 0;
  return Number.isFinite(destroyAt) && destroyAt > 0
    ? new Date(destroyAt).toISOString()
    : null;
}

function requiresExplicitCatalogRevival(catalog) {
  return isCatalogTombstone(catalog);
}

/**
 * 为已经 direct mount 且保持 stopped 的 catalog-backed 实例取得恢复租约。
 *
 * 本入口不会 upsert catalog。每次调用都会重新读取 catalog，并以 instance/template/type/epoch
 * 校验同一稳定实例；取得或续接本节点 lease 后只执行一次 hydrate。hydrate 失败会释放本次
 * 精确 lease、清空运行态 lease 元数据并返回结构化失败，调用方必须丢弃该半水合实例。
 */
export async function acquireCatalogBackedInstanceLeaseForRestore(
  runtime,
  instanceId,
  instance,
  options: { expectedTemplateId?: string; expectedInstanceType?: string } = {},
) {
  const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
  const expectedTemplateId = typeof options.expectedTemplateId === 'string'
    ? options.expectedTemplateId.trim()
    : '';
  const expectedInstanceType = typeof options.expectedInstanceType === 'string'
    ? options.expectedInstanceType.trim()
    : '';
  if (!normalizedInstanceId || !expectedTemplateId || !expectedInstanceType || !instance?.meta) {
    stopAndClearRestoredInstanceLease(instance);
    return { ok: false, reason: 'restore_identity_required' };
  }
  if (!runtime.instanceCatalogService?.isEnabled?.()
    || typeof runtime.instanceCatalogService.loadInstanceCatalog !== 'function') {
    stopAndClearRestoredInstanceLease(instance);
    return { ok: false, reason: 'catalog_disabled' };
  }
  if (typeof runtime.getInstanceRuntime === 'function'
    && runtime.getInstanceRuntime(normalizedInstanceId) !== instance) {
    stopAndClearRestoredInstanceLease(instance);
    return { ok: false, reason: 'instance_replaced' };
  }

  let catalog;
  try {
    catalog = await runtime.instanceCatalogService.loadInstanceCatalog(normalizedInstanceId);
  } catch (error) {
    stopAndClearRestoredInstanceLease(instance);
    return { ok: false, reason: 'catalog_load_failed', error };
  }
  if (!catalog) {
    stopAndClearRestoredInstanceLease(instance);
    return { ok: false, reason: 'catalog_not_found' };
  }

  const catalogInstanceId = typeof catalog.instance_id === 'string' ? catalog.instance_id.trim() : '';
  const catalogTemplateId = typeof catalog.template_id === 'string' ? catalog.template_id.trim() : '';
  const catalogInstanceType = typeof catalog.instance_type === 'string' ? catalog.instance_type.trim() : '';
  const runtimeTemplateId = typeof instance?.template?.id === 'string'
    ? instance.template.id.trim()
    : typeof instance?.templateId === 'string' ? instance.templateId.trim() : '';
  const runtimeInstanceType = typeof instance?.meta?.kind === 'string'
    ? instance.meta.kind.trim()
    : typeof instance?.kind === 'string' ? instance.kind.trim() : '';
  if (catalogInstanceId !== normalizedInstanceId
    || catalogTemplateId !== expectedTemplateId
    || catalogInstanceType !== expectedInstanceType
    || runtimeTemplateId !== expectedTemplateId
    || runtimeInstanceType !== expectedInstanceType) {
    stopAndClearRestoredInstanceLease(instance);
    return {
      ok: false,
      reason: 'catalog_identity_mismatch',
      catalog,
    };
  }
  const catalogRuntimeStatus = typeof catalog.runtime_status === 'string'
    ? catalog.runtime_status.trim()
    : '';
  if (catalogRuntimeStatus === 'cleanup_pending'
    || catalogRuntimeStatus === 'creating'
    || catalogRuntimeStatus === 'template_missing') {
    stopAndClearRestoredInstanceLease(instance);
    return { ok: false, reason: 'catalog_runtime_status_blocked', catalog };
  }

  const catalogOwnershipEpoch = parseOwnershipEpoch(catalog.ownership_epoch);
  const runtimeOwnershipEpoch = parseOwnershipEpoch(instance.meta.ownershipEpoch);
  if (catalogOwnershipEpoch === null
    || runtimeOwnershipEpoch === null
    || catalogOwnershipEpoch !== runtimeOwnershipEpoch) {
    stopAndClearRestoredInstanceLease(instance);
    return {
      ok: false,
      reason: 'ownership_epoch_mismatch',
      catalog,
      catalogOwnershipEpoch,
      runtimeOwnershipEpoch,
    };
  }

  const nodeId = typeof runtime.nodeRegistryService?.getNodeId === 'function'
    ? String(runtime.nodeRegistryService.getNodeId()).trim()
    : '';
  if (!nodeId) {
    stopAndClearRestoredInstanceLease(instance);
    return { ok: false, reason: 'node_id_missing', catalog };
  }
  const catalogAssignedNodeId = typeof catalog.assigned_node_id === 'string'
    ? catalog.assigned_node_id.trim()
    : '';
  const catalogLeaseToken = typeof catalog.lease_token === 'string' ? catalog.lease_token.trim() : '';
  const catalogLeaseExpireAt = catalog.lease_expire_at ? new Date(catalog.lease_expire_at).getTime() : 0;
  const hasValidCatalogLease = Boolean(
    catalogAssignedNodeId
    && catalogLeaseToken
    && Number.isFinite(catalogLeaseExpireAt)
    && catalogLeaseExpireAt > Date.now(),
  );
  const tombstone = requiresExplicitCatalogRevival(catalog);
  if (tombstone && catalog.status !== 'destroyed' && catalogRuntimeStatus !== 'stopped') {
    stopAndClearRestoredInstanceLease(instance);
    return { ok: false, reason: 'catalog_destroy_pending', catalog };
  }
  if (hasValidCatalogLease && catalogAssignedNodeId !== nodeId) {
    stopAndClearRestoredInstanceLease(instance);
    return {
      ok: false,
      reason: 'catalog_lease_owned_by_other_node',
      catalog,
    };
  }

  const generatedLeaseToken = `${nodeId}:${normalizedInstanceId}:${Date.now()}:${randomBytes(6).toString('base64url')}`;
  const leaseExpireAt = new Date(Date.now() + INSTANCE_LEASE_TTL_MS);
  let acquiredLeaseToken = '';
  let acquiredOwnershipEpoch = catalogOwnershipEpoch;
  let revived = false;
  let phase = 'replay';
  try {
    const restoreTransitionToken = await freezeAndReplayInstanceOwnershipEpoch(
      runtime,
      instance,
      normalizedInstanceId,
      catalogOwnershipEpoch,
    );
    if ((typeof runtime.getInstanceRuntime === 'function'
      && runtime.getInstanceRuntime(normalizedInstanceId) !== instance)
      || !isOwnershipTransitionCurrent(instance, restoreTransitionToken)) {
      throw new Error(`instance_ownership_transition_replaced:${normalizedInstanceId}`);
    }
    phase = 'claim';
    if (hasValidCatalogLease && !tombstone) {
      const renewed = await runtime.instanceCatalogService.renewInstanceLease({
        instanceId: normalizedInstanceId,
        expectedTemplateId,
        expectedInstanceType,
        nodeId,
        leaseToken: catalogLeaseToken,
        leaseExpireAt,
        expectedOwnershipEpoch: catalogOwnershipEpoch,
      });
      if (renewed !== true) {
        stopAndClearRestoredInstanceLease(instance);
        return { ok: false, reason: 'local_lease_renew_conflict', catalog };
      }
      acquiredLeaseToken = catalogLeaseToken;
    } else {
      const claimInput = {
        instanceId: normalizedInstanceId,
        expectedTemplateId,
        expectedInstanceType,
        expectedCurrentNodeId: tombstone && hasValidCatalogLease ? catalogAssignedNodeId : null,
        expectedCurrentLeaseToken: tombstone && hasValidCatalogLease ? catalogLeaseToken : null,
        nodeId,
        leaseToken: generatedLeaseToken,
        leaseExpireAt,
        expectedOwnershipEpoch: catalogOwnershipEpoch,
      };
      const claimed = tombstone
        ? await runtime.instanceCatalogService.reviveInstanceLeaseWithFence?.(claimInput)
        : await runtime.instanceCatalogService.claimInstanceLease?.(claimInput);
      const claimedOwnershipEpoch = parseOwnershipEpoch(claimed?.ownershipEpoch);
      if (claimed?.ok !== true) {
        stopAndClearRestoredInstanceLease(instance);
        return {
          ok: false,
          reason: tombstone ? 'catalog_revival_conflict' : 'catalog_claim_conflict',
          catalog,
        };
      }
      acquiredLeaseToken = generatedLeaseToken;
      if (claimedOwnershipEpoch !== catalogOwnershipEpoch + 1) {
        throw new Error(
          `catalog_claim_epoch_invalid:${normalizedInstanceId}:${catalogOwnershipEpoch}:${claimedOwnershipEpoch ?? 'null'}`,
        );
      }
      acquiredOwnershipEpoch = claimedOwnershipEpoch;
      revived = tombstone;
    }

    if ((typeof runtime.getInstanceRuntime === 'function'
      && runtime.getInstanceRuntime(normalizedInstanceId) !== instance)
      || !isOwnershipTransitionCurrent(instance, restoreTransitionToken)) {
      if (revived) {
        await retombstoneFailedDestroyCompensation(
          runtime,
          normalizedInstanceId,
          nodeId,
          acquiredLeaseToken,
          acquiredOwnershipEpoch,
        );
      } else if (acquiredLeaseToken) {
        let released = false;
        try {
          released = await runtime.instanceCatalogService.releaseInstanceLease?.({
            instanceId: normalizedInstanceId,
            nodeId,
            leaseToken: acquiredLeaseToken,
          }) === true;
        } catch (releaseError) {
          runtime.logger?.warn?.(
            `catalog-backed 实例取得 lease 后运行态已替换且释放异常：${normalizedInstanceId} ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
          );
        }
        if (!released) {
          try {
            await runtime.instanceCatalogService.markInstanceCleanupPendingWithFence?.({
              instanceId: normalizedInstanceId,
              assignedNodeId: nodeId,
              leaseToken: acquiredLeaseToken,
              expectedOwnershipEpoch: acquiredOwnershipEpoch,
            });
          } catch {
            // fresh catalog 回读会在下一轮周期清理中继续收敛。
          }
        }
      }
      stopAndClearRestoredInstanceLease(instance);
      return { ok: false, reason: 'instance_replaced_after_catalog_claim', catalog };
    }

    instance.meta.assignedNodeId = nodeId;
    instance.meta.leaseToken = acquiredLeaseToken;
    instance.meta.leaseExpireAt = leaseExpireAt.toISOString();
    instance.meta.ownershipEpoch = acquiredOwnershipEpoch;
    instance.meta.runtimeStatus = 'ownership_transition';
    phase = 'hydrate';
    if (typeof runtime.hydratePersistentInstanceSnapshot === 'function') {
      await runtime.hydratePersistentInstanceSnapshot(normalizedInstanceId, instance);
    } else {
      await hydratePersistentInstanceSnapshot(runtime, normalizedInstanceId, instance);
    }
    phase = 'finalize';
    if ((typeof runtime.getInstanceRuntime === 'function'
      && runtime.getInstanceRuntime(normalizedInstanceId) !== instance)
      || !isOwnershipTransitionCurrent(instance, restoreTransitionToken)) {
      throw new Error(`instance_replaced_during_restore:${normalizedInstanceId}`);
    }
    instance.meta.destroyAt = revived ? null : normalizeCatalogDestroyAt(catalog?.destroy_at);
    const restoredDestroyAt = instance.meta.destroyAt ? new Date(instance.meta.destroyAt).getTime() : 0;
    if (Number.isFinite(restoredDestroyAt) && restoredDestroyAt > 0 && restoredDestroyAt <= Date.now()) {
      instance.meta.runtimeStatus = 'leased';
      instance.meta.status = 'active';
      completeOwnershipTransition(instance, restoreTransitionToken);
      const destroyed = await destroyManagedInstance(
        runtime,
        normalizedInstanceId,
        'catalog_destroy_expired_during_restore',
      );
      return {
        ok: false,
        reason: destroyed?.ok === true
          ? 'catalog_destroy_expired_during_restore'
          : 'catalog_destroy_expired_cleanup_failed',
        catalog,
        ownershipEpoch: acquiredOwnershipEpoch,
        leaseToken: acquiredLeaseToken,
        leaseExpireAt: leaseExpireAt.toISOString(),
        revived,
        hydrated: true,
      };
    }
    completeOwnershipTransition(instance, restoreTransitionToken);
    instance.meta.runtimeStatus = 'leased';
    instance.meta.status = 'active';
    return {
      ok: true,
      reason: revived ? 'catalog_revived' : hasValidCatalogLease ? 'local_lease_renewed' : 'catalog_claimed',
      catalog,
      ownershipEpoch: acquiredOwnershipEpoch,
      leaseToken: acquiredLeaseToken,
      leaseExpireAt: leaseExpireAt.toISOString(),
      revived,
      hydrated: true,
    };
  } catch (error) {
    let released = false;
    if (acquiredLeaseToken && typeof runtime.instanceCatalogService.releaseInstanceLease === 'function') {
      try {
        released = await runtime.instanceCatalogService.releaseInstanceLease({
          instanceId: normalizedInstanceId,
          nodeId,
          leaseToken: acquiredLeaseToken,
        }) === true;
      } catch (releaseError) {
        runtime.logger?.warn?.(
          `catalog-backed 实例恢复失败且 lease 释放异常：${normalizedInstanceId} ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
        );
      }
    }
    stopAndClearRestoredInstanceLease(instance);
    runtime.logger?.warn?.(
      `catalog-backed 实例恢复失败：${normalizedInstanceId} phase=${phase} ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      ok: false,
      reason: phase === 'hydrate' ? 'hydrate_failed' : phase === 'finalize' ? 'instance_replaced' : 'restore_failed',
      catalog,
      error,
      released,
      ownershipEpoch: acquiredOwnershipEpoch,
      revived,
      hydrated: false,
    };
  }
}

function stopAndClearRestoredInstanceLease(instance) {
  if (!instance?.meta) {
    return;
  }
  instance.meta.assignedNodeId = null;
  instance.meta.leaseToken = null;
  instance.meta.leaseExpireAt = null;
  INSTANCE_OWNERSHIP_TRANSITION_TOKENS.delete(instance);
  instance.meta.runtimeStatus = 'stopped';
}

function parseOwnershipEpoch(value) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0 ? normalized : null;
}

function normalizeOwnershipEpoch(value, fallback = 0) {
  return Number.isFinite(Number(value))
    ? Math.max(0, Math.trunc(Number(value)))
    : Math.max(0, Math.trunc(Number(fallback) || 0));
}

async function restoreInstanceAfterOwnershipClaim(runtime, instanceId, instance, input) {
  instance.meta.assignedNodeId = input.nodeId;
  instance.meta.leaseToken = input.leaseToken;
  instance.meta.leaseExpireAt = input.leaseExpireAt.toISOString();
  instance.meta.ownershipEpoch = normalizeOwnershipEpoch(input.ownershipEpoch, input.fallbackOwnershipEpoch);
  if (input.hydratePersistentSnapshot !== false) {
    try {
      await hydratePersistentInstanceSnapshot(runtime, instanceId, instance);
    } catch (error) {
      await quarantineOwnershipHydrateFailure(runtime, instanceId, instance, {
        nodeId: input.nodeId,
        leaseToken: input.leaseToken,
        ownershipEpoch: instance.meta.ownershipEpoch,
        transitionToken: input.transitionToken,
        destroyCatalog: false,
      });
      runtime.logger.warn(`实例强制接管后水合失败，已隔离待清理：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  if (!isManagedInstanceRuntimeCurrent(runtime, instanceId, instance)
    || !isOwnershipTransitionCurrent(instance, input.transitionToken)) {
    return false;
  }
  completeOwnershipTransition(instance, input.transitionToken);
  instance.meta.runtimeStatus = 'leased';
  instance.meta.status = 'active';
  return true;
}

async function reclaimMissingCatalogLeaseForLocalRuntime(
  runtime,
  instance,
  instanceId,
  nodeId,
  leaseToken,
  leaseExpireAt,
  expectedOwnershipEpoch,
  hydratePersistentSnapshot = true,
) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return false;
  }
  const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string' ? instance.meta.assignedNodeId.trim() : '';
  const currentLeaseToken = typeof instance?.meta?.leaseToken === 'string' ? instance.meta.leaseToken.trim() : '';
  if (assignedNodeId !== nodeId || !currentLeaseToken) {
    return false;
  }
  const catalog = await runtime.instanceCatalogService.loadInstanceCatalog(instanceId);
  if (!isManagedInstanceLeaseSyncCurrent(runtime, instanceId, instance)) {
    return false;
  }
  if (isCatalogTombstone(catalog)) {
    return false;
  }
  const catalogAssignedNodeId = typeof catalog?.assigned_node_id === 'string' ? catalog.assigned_node_id.trim() : '';
  const catalogLeaseToken = typeof catalog?.lease_token === 'string' ? catalog.lease_token.trim() : '';
  const catalogLeaseExpireAt = catalog?.lease_expire_at ? new Date(catalog.lease_expire_at).getTime() : 0;
  if (catalogAssignedNodeId && catalogLeaseToken && Number.isFinite(catalogLeaseExpireAt) && catalogLeaseExpireAt > Date.now()) {
    return false;
  }
  const catalogOwnershipEpoch = normalizeOwnershipEpoch(catalog?.ownership_epoch, expectedOwnershipEpoch);
  const claim = await claimInstanceOwnershipAfterReplay(runtime, instance, {
    instanceId,
    nodeId,
    leaseToken,
    leaseExpireAt,
    expectedOwnershipEpoch: catalogOwnershipEpoch,
    force: false,
  });
  if (!claim?.ok) {
    return false;
  }
  const restored = await restoreInstanceAfterOwnershipClaim(runtime, instanceId, instance, {
    nodeId,
    leaseToken,
    leaseExpireAt,
    ownershipEpoch: claim.ownershipEpoch,
    fallbackOwnershipEpoch: catalogOwnershipEpoch + 1,
    hydratePersistentSnapshot,
    transitionToken: claim.transitionToken,
  });
  if (!restored) {
    return false;
  }
  runtime.logger.warn(`实例 ${instanceId} catalog 租约缺失，已由本地运行态重新接管`);
  return true;
}

async function adoptLocalCatalogLeaseAndRenew(runtime, instance, instanceId, nodeId, leaseExpireAt) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return false;
  }
  const catalog = await runtime.instanceCatalogService.loadInstanceCatalog(instanceId);
  if (!isManagedInstanceLeaseSyncCurrent(runtime, instanceId, instance)) {
    return false;
  }
  if (isCatalogTombstone(catalog)) {
    return false;
  }
  const catalogAssignedNodeId = typeof catalog?.assigned_node_id === 'string' ? catalog.assigned_node_id.trim() : '';
  const catalogLeaseToken = typeof catalog?.lease_token === 'string' ? catalog.lease_token.trim() : '';
  const catalogLeaseExpireAt = catalog?.lease_expire_at ? new Date(catalog.lease_expire_at).getTime() : 0;
  const catalogOwnershipEpoch = Number.isFinite(Number(catalog?.ownership_epoch))
    ? Math.trunc(Number(catalog.ownership_epoch))
    : 0;
  if (catalogAssignedNodeId !== nodeId
    || !catalogLeaseToken
    || !Number.isFinite(catalogLeaseExpireAt)
    || catalogLeaseExpireAt <= Date.now() - INSTANCE_LEASE_RENEW_SKEW_MS) {
    return false;
  }
  const renewed = await runtime.instanceCatalogService.renewInstanceLease({
    instanceId,
    nodeId,
    leaseToken: catalogLeaseToken,
    leaseExpireAt,
    expectedOwnershipEpoch: catalogOwnershipEpoch,
  });
  if (renewed !== true) {
    return false;
  }
  if (!isManagedInstanceLeaseSyncCurrent(runtime, instanceId, instance)) {
    return false;
  }
  instance.meta.assignedNodeId = nodeId;
  instance.meta.leaseToken = catalogLeaseToken;
  instance.meta.leaseExpireAt = leaseExpireAt.toISOString();
  instance.meta.ownershipEpoch = catalogOwnershipEpoch;
  instance.meta.runtimeStatus = 'leased';
  instance.meta.status = 'active';
  return true;
}

export async function rebuildPersistentInstance(runtime, instanceId) {
  const current = runtime.getInstanceRuntime(instanceId);
  if (!current) {
    return { ok: false, reason: 'instance_not_found' };
  }
  if (!(current.meta?.persistent === true || current.persistent === true)) {
    return { ok: false, reason: 'instance_not_persistent' };
  }
  const templateId = current.template?.id ?? current.templateId ?? '';
  if (!templateId) {
    return { ok: false, reason: 'template_missing' };
  }
  const currentMeta = { ...(current.meta ?? {}) };
  runtime.worldRuntimeInstanceStateService.deleteInstanceRuntime(instanceId);
  const descriptor = parseRuntimeInstanceDescriptor(instanceId);
  const rebuilt = runtime.createInstance({
    instanceId,
    templateId,
    kind: typeof current.kind === 'string' && current.kind.trim() ? current.kind.trim() : 'public',
    persistent: true,
    linePreset: descriptor?.linePreset ?? currentMeta.linePreset ?? (currentMeta.routeDomain === 'real' ? 'real' : 'peaceful'),
    lineIndex: descriptor?.lineIndex ?? currentMeta.lineIndex ?? 1,
    instanceOrigin: descriptor?.instanceOrigin ?? currentMeta.instanceOrigin ?? 'gm_manual',
    defaultEntry: descriptor?.defaultEntry !== false,
    ownerPlayerId: currentMeta.ownerPlayerId ?? null,
    ownerSectId: currentMeta.ownerSectId ?? null,
    partyId: currentMeta.partyId ?? null,
    status: currentMeta.status ?? 'active',
    runtimeStatus: currentMeta.runtimeStatus ?? 'running',
    assignedNodeId: currentMeta.assignedNodeId ?? null,
    leaseToken: currentMeta.leaseToken ?? null,
    leaseExpireAt: currentMeta.leaseExpireAt ?? null,
    ownershipEpoch: Number.isFinite(Number(currentMeta.ownershipEpoch)) ? Math.trunc(Number(currentMeta.ownershipEpoch)) : 0,
    clusterId: currentMeta.clusterId ?? null,
    shardKey: currentMeta.shardKey ?? instanceId,
    routeDomain: currentMeta.routeDomain ?? null,
    destroyAt: currentMeta.destroyAt ?? null,
    lastActiveAt: currentMeta.lastActiveAt ?? null,
    lastPersistedAt: currentMeta.lastPersistedAt ?? null,
  });
  await hydratePersistentInstanceSnapshot(runtime, instanceId, rebuilt);
  return { ok: true, snapshot: typeof rebuilt?.snapshot === 'function' ? rebuilt.snapshot() : null };
}

export async function migrateInstanceToNode(runtime, instanceId, targetNodeId) {
  const normalizedTargetNodeId = typeof targetNodeId === 'string' ? targetNodeId.trim() : '';
  if (!normalizedTargetNodeId) {
    return { ok: false, reason: 'target_node_required' };
  }
  const current = runtime.getInstanceRuntime(instanceId);
  if (!current) {
    return { ok: false, reason: 'instance_not_found' };
  }
  const currentNodeId = runtime.nodeRegistryService.getNodeId();
  if (normalizedTargetNodeId === currentNodeId && isInstanceLeaseWritable(runtime, current)) {
    return { ok: true };
  }
  const sourceAssignedNodeId = typeof current.meta?.assignedNodeId === 'string'
    ? current.meta.assignedNodeId.trim()
    : '';
  const sourceLeaseToken = typeof current.meta?.leaseToken === 'string'
    ? current.meta.leaseToken.trim()
    : '';
  if (runtime.instanceCatalogService?.isEnabled?.()
    && (sourceAssignedNodeId !== currentNodeId || !sourceLeaseToken || !isInstanceLeaseWritable(runtime, current))) {
    return { ok: false, reason: 'lease_not_local' };
  }
  const leaseExpireAt = new Date(Date.now() - 1000);
  const previousOwnershipEpoch = normalizeOwnershipEpoch(current.meta.ownershipEpoch, 0);
  const previousRuntimeStatus = current.meta.runtimeStatus;
  const migrationTransitionToken = await freezeAndReplayInstanceOwnershipEpoch(
    runtime,
    current,
    instanceId,
    previousOwnershipEpoch,
  );
  let ownershipEpoch = previousOwnershipEpoch + 1;
  try {
    if (runtime.instanceCatalogService?.isEnabled?.()) {
      if (typeof runtime.instanceCatalogService.migrateInstanceLease !== 'function') {
        throw new Error(`instance_lease_migration_cas_unavailable:${instanceId}`);
      }
      const migrated = await runtime.instanceCatalogService.migrateInstanceLease({
        instanceId,
        sourceNodeId: currentNodeId,
        sourceLeaseToken,
        targetNodeId: normalizedTargetNodeId,
        leaseExpireAt,
        expectedOwnershipEpoch: previousOwnershipEpoch,
      });
      if (!migrated?.ok) {
        completeOwnershipTransition(current, migrationTransitionToken);
        current.meta.runtimeStatus = previousRuntimeStatus;
        return { ok: false, reason: 'lease_conflict' };
      }
      ownershipEpoch = normalizeOwnershipEpoch(migrated.ownershipEpoch, previousOwnershipEpoch + 1);
    }
  } catch (error) {
    if (isOwnershipTransitionCurrent(current, migrationTransitionToken)) {
      completeOwnershipTransition(current, migrationTransitionToken);
      current.meta.runtimeStatus = previousRuntimeStatus;
    }
    throw error;
  }
  current.meta.assignedNodeId = normalizedTargetNodeId;
  current.meta.leaseToken = null;
  current.meta.leaseExpireAt = leaseExpireAt.toISOString();
  current.meta.ownershipEpoch = ownershipEpoch;
  completeOwnershipTransition(current, migrationTransitionToken);
  current.meta.runtimeStatus = 'stopped';
  current.meta.status = 'active';
  return { ok: true };
}

export async function migratePlayerToNode(runtime, playerId, targetNodeId) {
  const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
  const normalizedTargetNodeId = typeof targetNodeId === 'string' ? targetNodeId.trim() : '';
  if (!normalizedPlayerId) {
    return { ok: false, reason: 'player_required' };
  }
  if (!normalizedTargetNodeId) {
    return { ok: false, reason: 'target_node_required' };
  }
  const player = runtime.playerRuntimeService?.getPlayer?.(normalizedPlayerId);
  if (!player) {
    return { ok: false, reason: 'player_not_found' };
  }
  if (typeof runtime.playerPersistenceFlushService?.flushPlayer === 'function') {
    await runtime.playerPersistenceFlushService.flushPlayer(normalizedPlayerId);
  }
  if (!runtime.playerRuntimeService?.beginTransfer) {
    player.transferState = 'in_transfer';
    player.transferTargetNodeId = normalizedTargetNodeId;
    player.transferStartedAt = new Date().toISOString();
    return { ok: true };
  }
  runtime.playerRuntimeService.beginTransfer(player, normalizedTargetNodeId);
  // beginTransfer 已旋转 owner/epoch；route handoff 前必须先把新 fence 落到 presence，
  // 否则目标节点可能从旧 DB epoch 生成同 epoch rival owner，或源节点投影被精确围栏自锁。
  if (typeof runtime.playerPersistenceFlushService?.flushPlayer === 'function') {
    await runtime.playerPersistenceFlushService.flushPlayer(normalizedPlayerId);
  }
  const routeSessionEpoch = Number.isFinite(player.sessionEpoch)
    ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
    : 0;
  if (routeSessionEpoch > 0 && typeof runtime.worldSessionService?.rememberSessionEpoch === 'function') {
    runtime.worldSessionService.rememberSessionEpoch(normalizedPlayerId, routeSessionEpoch);
  }
  if (routeSessionEpoch > 0 && typeof runtime.worldRuntimePlayerSessionService?.assignPlayerRoute === 'function') {
    await runtime.worldRuntimePlayerSessionService.assignPlayerRoute({
      playerId: normalizedPlayerId,
      nodeId: normalizedTargetNodeId,
      sessionEpoch: routeSessionEpoch,
      routeStatus: 'assigned',
    });
  }
  return { ok: true };
}

export async function getInstanceLeaseStatus(runtime, instanceId) {
  const instance = runtime.getInstanceRuntime(instanceId);
  const catalog = runtime.instanceCatalogService?.isEnabled?.()
    ? await runtime.instanceCatalogService.loadInstanceCatalog(instanceId)
    : null;
  const runtimeLease = instance ? {
    assignedNodeId: typeof instance?.meta?.assignedNodeId === 'string' && instance.meta.assignedNodeId.trim() ? instance.meta.assignedNodeId.trim() : null,
    leaseToken: typeof instance?.meta?.leaseToken === 'string' && instance.meta.leaseToken.trim() ? instance.meta.leaseToken.trim() : null,
    leaseExpireAt: typeof instance?.meta?.leaseExpireAt === 'string' && instance.meta.leaseExpireAt.trim() ? instance.meta.leaseExpireAt.trim() : null,
    ownershipEpoch: Number.isFinite(Number(instance?.meta?.ownershipEpoch)) ? Math.trunc(Number(instance.meta.ownershipEpoch)) : 0,
    runtimeStatus: typeof instance?.meta?.runtimeStatus === 'string' && instance.meta.runtimeStatus.trim() ? instance.meta.runtimeStatus.trim() : 'running',
    status: typeof instance?.meta?.status === 'string' && instance.meta.status.trim() ? instance.meta.status.trim() : 'active',
  } : null;
  const catalogLease = catalog ? {
    assignedNodeId: typeof catalog.assigned_node_id === 'string' && catalog.assigned_node_id.trim() ? catalog.assigned_node_id.trim() : null,
    leaseToken: typeof catalog.lease_token === 'string' && catalog.lease_token.trim() ? catalog.lease_token.trim() : null,
    leaseExpireAt: typeof catalog.lease_expire_at === 'string' && catalog.lease_expire_at.trim() ? catalog.lease_expire_at.trim() : null,
    ownershipEpoch: Number.isFinite(Number(catalog.ownership_epoch)) ? Math.trunc(Number(catalog.ownership_epoch)) : 0,
    runtimeStatus: typeof catalog.runtime_status === 'string' && catalog.runtime_status.trim() ? catalog.runtime_status.trim() : 'unknown',
    status: typeof catalog.status === 'string' && catalog.status.trim() ? catalog.status.trim() : 'unknown',
  } : null;
  return {
    instanceId,
    nodeId: runtime.nodeRegistryService.getNodeId(),
    runtime: runtimeLease,
    catalog: catalogLease,
    writable: isInstanceLeaseWritable(runtime, instance),
  };
}

export async function destroyExpiredManagedInstances(runtime) {
  const now = Date.now();
  for (const [instanceId, instance] of runtime.listInstanceEntries()) {
    const destroyAt = typeof instance?.meta?.destroyAt === 'string' && instance.meta.destroyAt.trim()
      ? Date.parse(instance.meta.destroyAt)
      : NaN;
    if (!Number.isFinite(destroyAt) || destroyAt > now) {
      continue;
    }
    const result = await destroyManagedInstance(runtime, instanceId, 'expire_at_reached');
    if (result?.ok !== true) {
      runtime.logger.warn(`过期实例销毁被拒绝：${instanceId} reason=${result?.reason ?? 'unknown'}`);
    }
  }
}

export async function syncAllInstanceLeases(runtime) {
  try {
    await destroyExpiredManagedInstances(runtime);
  } catch (error) {
    runtime.logger.warn(`过期实例清理失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return;
  }
  for (const [instanceId, instance] of runtime.listInstanceEntries()) {
    if (instance?.meta?.runtimeStatus !== 'fenced'
      || listManagedInstancePlayerIds(instance).length > 0) {
      continue;
    }
    try {
      await runtime.instanceCatalogService.loadInstanceCatalog?.(instanceId);
      cleanupManagedInstanceRuntimeState(runtime, instanceId, instance);
    } catch (error) {
      runtime.logger.warn(`空闲 fenced 实例回读失败，保留隔离等待重试：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const [instanceId, instance] of runtime.listInstanceEntries()) {
    if (instance?.meta?.runtimeStatus !== 'cleanup_pending') {
      continue;
    }
    const reservationToken = typeof instance?.meta?.catalogReservationToken === 'string'
      ? instance.meta.catalogReservationToken.trim()
      : '';
    const assignedNodeId = typeof instance?.meta?.assignedNodeId === 'string'
      ? instance.meta.assignedNodeId.trim()
      : '';
    const leaseToken = typeof instance?.meta?.leaseToken === 'string'
      ? instance.meta.leaseToken.trim()
      : '';
    const ownershipEpoch = normalizeOwnershipEpoch(instance?.meta?.ownershipEpoch, 0);
    try {
      if (reservationToken && !assignedNodeId && !leaseToken) {
        const abandoned = await runtime.instanceCatalogService.abandonManualLineReservation?.(
          instanceId,
          reservationToken,
        );
        if (abandoned === true && listManagedInstancePlayerIds(instance).length === 0) {
          cleanupManagedInstanceRuntimeState(runtime, instanceId, instance);
        } else if (abandoned !== true) {
          const catalog = await runtime.instanceCatalogService.loadInstanceCatalog?.(instanceId);
          if ((!catalog || isCatalogTombstone(catalog)) && listManagedInstancePlayerIds(instance).length === 0) {
            cleanupManagedInstanceRuntimeState(runtime, instanceId, instance);
          }
        }
        continue;
      }
      if (assignedNodeId && leaseToken) {
        const persisted = await runtime.instanceCatalogService.markInstanceCleanupPendingWithFence?.({
          instanceId,
          assignedNodeId,
          leaseToken,
          expectedOwnershipEpoch: ownershipEpoch,
        });
        if (persisted !== true) {
          const catalog = await runtime.instanceCatalogService.loadInstanceCatalog?.(instanceId);
          const catalogNodeId = typeof catalog?.assigned_node_id === 'string' ? catalog.assigned_node_id.trim() : '';
          const catalogLeaseToken = typeof catalog?.lease_token === 'string' ? catalog.lease_token.trim() : '';
          const catalogEpoch = parseOwnershipEpoch(catalog?.ownership_epoch);
          if ((isCatalogTombstone(catalog)
            || catalogNodeId !== assignedNodeId
            || catalogLeaseToken !== leaseToken
            || catalogEpoch !== ownershipEpoch)
            && listManagedInstancePlayerIds(instance).length === 0) {
            cleanupManagedInstanceRuntimeState(runtime, instanceId, instance);
          }
        }
      }
    } catch (error) {
      runtime.logger.warn(`实例待清理状态重试失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (typeof runtime.instanceCatalogService.cleanupStaleManualLineReservations === 'function') {
    try {
      const cleanedInstanceIds = await runtime.instanceCatalogService.cleanupStaleManualLineReservations();
      if (cleanedInstanceIds.length > 0) {
        for (const instanceId of cleanedInstanceIds) {
          const instance = runtime.getInstanceRuntime(instanceId);
          if (instance?.meta?.runtimeStatus === 'cleanup_pending'
            && listManagedInstancePlayerIds(instance).length === 0) {
            cleanupManagedInstanceRuntimeState(runtime, instanceId, instance);
          }
        }
        runtime.logger.warn(`已回收 ${cleanedInstanceIds.length} 个超时的 GM 手动分线预留`);
      }
    } catch (error) {
      runtime.logger.warn(`GM 手动分线预留回收失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (typeof runtime.instanceCatalogService.cleanupAbandonedPendingInstances === 'function') {
    try {
      const cleanedInstanceIds = await runtime.instanceCatalogService.cleanupAbandonedPendingInstances();
      if (cleanedInstanceIds.length > 0) {
        for (const instanceId of cleanedInstanceIds) {
          const instance = runtime.getInstanceRuntime(instanceId);
          if (instance?.meta?.runtimeStatus === 'cleanup_pending'
            && listManagedInstancePlayerIds(instance).length === 0) {
            cleanupManagedInstanceRuntimeState(runtime, instanceId, instance);
          }
        }
        runtime.logger.warn(`已完成 ${cleanedInstanceIds.length} 个失去有效 owner 的实例清理任务`);
      }
    } catch (error) {
      runtime.logger.warn(`实例待清理任务回收失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const [instanceId] of runtime.listInstanceEntries()) {
    try {
      await syncInstanceLease(runtime, instanceId, { allowForceReclaim: false });
    } catch (error) {
      runtime.logger.warn(`实例租约同步失败：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    const claimedCount = await claimRecoverableCatalogInstances(runtime, { allowForceReclaim: false });
    const shouldRetryOfflineRestore = runtime.worldRuntimeLifecycleService?.consumeOfflineRestoreRetry?.() === true;
    if ((claimedCount > 0 || shouldRetryOfflineRestore)
      && typeof runtime.worldRuntimeLifecycleService?.restoreOfflineHangingPlayers === 'function') {
      await runtime.worldRuntimeLifecycleService.restoreOfflineHangingPlayers(runtime);
    }
  } catch (error) {
    runtime.logger.warn(`可恢复实例租约接管失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function claimRecoverableCatalogInstances(runtime, {
  allowForceReclaim = false,
  hydratePersistentSnapshot = true,
} = {}) {
  if (!runtime.instanceCatalogService?.isEnabled?.()) {
    return 0;
  }
  const nodeId = runtime.nodeRegistryService.getNodeId();
  const catalogEntries = await runtime.instanceCatalogService.listInstanceCatalogEntries();
  let claimedCount = 0;
  for (const entry of catalogEntries) {
    const instanceId = typeof entry?.instance_id === 'string' ? entry.instance_id.trim() : '';
    const templateId = typeof entry?.template_id === 'string' ? entry.template_id.trim() : '';
    if (!shouldRestoreCatalogEntry(entry)) {
      continue;
    }
    if (!instanceId || !templateId || runtime.getInstanceRuntime(instanceId)) {
      continue;
    }
    if (!(await canClaimRecoverableCatalogEntry(runtime, entry, instanceId, nodeId, { allowForceReclaim }))) {
      continue;
    }
    if (typeof runtime.worldRuntimeTongtianTowerService?.restoreCatalogTowerTemplate === 'function'
      && runtime.worldRuntimeTongtianTowerService.restoreCatalogTowerTemplate(entry, runtime)) {
      // 历史塔层由启动缓存按 lease → hydrate 顺序恢复；不注册进常驻 tick。
      continue;
    }
    if (typeof runtime.templateRepository?.has === 'function'
      && !runtime.templateRepository.has(templateId)
      && typeof runtime.worldRuntimeSectService?.restoreCatalogSectTemplate === 'function') {
      runtime.worldRuntimeSectService.restoreCatalogSectTemplate(entry, runtime);
    }
    if (typeof runtime.templateRepository?.has === 'function' && !runtime.templateRepository.has(templateId)) {
      await markMissingTemplateCatalogEntry(runtime, entry, instanceId, templateId, 'lease 接管');
      continue;
    }
    const previousOwnershipEpoch = Number.isFinite(Number(entry?.ownership_epoch))
      ? Math.max(0, Math.trunc(Number(entry.ownership_epoch)))
      : 0;
    // 必须在 claimInstanceLease 自增 ownership epoch 与 hydrate 真源之前完成旧 epoch payload replay。
    await freezeAndReplayInstanceOwnershipEpoch(runtime, null, instanceId, previousOwnershipEpoch);
    const leaseToken = `${nodeId}:${instanceId}:${Date.now()}:${randomBytes(6).toString('base64url')}`;
    const leaseExpireAt = new Date(Date.now() + INSTANCE_LEASE_TTL_MS);
    const useForce = allowForceReclaim
      && shouldForceReclaimStaleLease()
      && typeof runtime.instanceCatalogService.forceClaimInstanceLease === 'function';
    const claim = useForce
      ? await runtime.instanceCatalogService.forceClaimInstanceLease({
          instanceId,
          nodeId,
          leaseToken,
          leaseExpireAt,
          expectedOwnershipEpoch: previousOwnershipEpoch,
        })
      : await runtime.instanceCatalogService.claimInstanceLease({
          instanceId,
          nodeId,
          leaseToken,
          leaseExpireAt,
          expectedOwnershipEpoch: previousOwnershipEpoch,
        });
    if (!claim.ok) {
      continue;
    }
    const concurrentInstance = runtime.getInstanceRuntime(instanceId);
    if (concurrentInstance) {
      let released = false;
      let cleanupPending = false;
      try {
        released = await runtime.instanceCatalogService.releaseInstanceLease({
          instanceId,
          nodeId,
          leaseToken,
        }) === true;
      } catch (error) {
        runtime.logger.warn(
          `可恢复实例接管后发现并发运行态且 lease 释放异常：${instanceId} ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!released) {
        try {
          cleanupPending = await runtime.instanceCatalogService.markInstanceCleanupPendingWithFence?.({
            instanceId,
            assignedNodeId: nodeId,
            leaseToken,
            expectedOwnershipEpoch: normalizeOwnershipEpoch(claim.ownershipEpoch, previousOwnershipEpoch + 1),
          }) === true;
        } catch {
          // 并发运行态仍保持自身 lease gate，下一轮 fresh catalog 同步会继续收敛。
        }
      }
      if (released || cleanupPending) {
        fenceInstanceRuntime(runtime, instanceId, 'recoverable_claim_concurrent_runtime', concurrentInstance);
      }
      continue;
    }
    const descriptor = parseRuntimeInstanceDescriptor(instanceId);
    const instance = runtime.createInstance({
      instanceId,
      templateId,
      kind: typeof entry.instance_type === 'string' && entry.instance_type.trim() ? entry.instance_type.trim() : 'public',
      persistent: true,
      linePreset: descriptor?.linePreset ?? (entry.route_domain === 'real' ? 'real' : 'peaceful'),
      lineIndex: descriptor?.lineIndex ?? 1,
      instanceOrigin: descriptor?.instanceOrigin ?? 'catalog',
      defaultEntry: descriptor?.defaultEntry !== false,
      ownerPlayerId: typeof entry.owner_player_id === 'string' ? entry.owner_player_id : null,
      ownerSectId: typeof entry.owner_sect_id === 'string' ? entry.owner_sect_id : null,
      partyId: typeof entry.party_id === 'string' ? entry.party_id : null,
      status: 'active',
      runtimeStatus: 'ownership_transition',
      assignedNodeId: nodeId,
      leaseToken,
      leaseExpireAt: leaseExpireAt.toISOString(),
      ownershipEpoch: Number.isFinite(Number(claim.ownershipEpoch)) ? Math.trunc(Number(claim.ownershipEpoch)) : 0,
      clusterId: typeof entry.cluster_id === 'string' ? entry.cluster_id : null,
      shardKey: typeof entry.shard_key === 'string' && entry.shard_key.trim() ? entry.shard_key.trim() : instanceId,
      routeDomain: typeof entry.route_domain === 'string' ? entry.route_domain : null,
      destroyAt: entry.destroy_at ? new Date(entry.destroy_at).toISOString() : null,
      lastActiveAt: entry.last_active_at ? new Date(entry.last_active_at).toISOString() : null,
      lastPersistedAt: entry.last_persisted_at ? new Date(entry.last_persisted_at).toISOString() : null,
    });
    try {
      if (hydratePersistentSnapshot !== false) {
        await hydratePersistentInstanceSnapshot(runtime, instanceId, instance);
      }
    } catch (error) {
      await quarantineOwnershipHydrateFailure(runtime, instanceId, instance, {
        nodeId,
        leaseToken,
        ownershipEpoch: instance.meta.ownershipEpoch,
        transitionToken: null,
        destroyCatalog: false,
      });
      runtime.logger.warn(`可恢复实例自动接管水合失败，已释放并卸载：${instanceId} ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (runtime.getInstanceRuntime(instanceId) !== instance) {
      await quarantineOwnershipHydrateFailure(runtime, instanceId, instance, {
        nodeId,
        leaseToken,
        ownershipEpoch: instance.meta.ownershipEpoch,
        transitionToken: null,
        destroyCatalog: false,
      });
      continue;
    }
    instance.meta.runtimeStatus = 'leased';
    instance.meta.status = 'active';
    if (typeof runtime.worldRuntimeInstanceLeaseReadinessService?.schedule === 'function') {
      await runtime.worldRuntimeInstanceLeaseReadinessService.schedule(instanceId, instance, runtime);
    }
    claimedCount++;
    runtime.logger.log(`实例租约自动接管成功：${instanceId} ownershipEpoch=${claim.ownershipEpoch ?? 0}`);
  }
  return claimedCount;
}

async function canClaimRecoverableCatalogEntry(runtime, entry, instanceId, nodeId, { allowForceReclaim = false } = {}) {
  const assignedNodeId = typeof entry?.assigned_node_id === 'string' ? entry.assigned_node_id.trim() : '';
  const leaseToken = typeof entry?.lease_token === 'string' ? entry.lease_token.trim() : '';
  const leaseExpireAt = entry?.lease_expire_at ? new Date(entry.lease_expire_at).getTime() : 0;
  if (!assignedNodeId || assignedNodeId === nodeId || !leaseToken) {
    return true;
  }
  // dev/test 环境下强制回收未过期的 stale lease，避免上一轮 smoke 残留阻塞启动
  if (allowForceReclaim && shouldForceReclaimStaleLease()) {
    runtime.logger.warn(`启动恢复强制回收过期租约：${instanceId} assignedNodeId=${assignedNodeId}`);
    return true;
  }
  if (Number.isFinite(leaseExpireAt) && leaseExpireAt > Date.now()) {
    runtime.logger.debug(`启动恢复跳过仍由其他节点持有的实例：${instanceId} assignedNodeId=${assignedNodeId}`);
    return false;
  }
  const persistenceService = runtime.playerRuntimeService?.playerDomainPersistenceService;
  const hasOnlinePlayers = typeof persistenceService?.hasOnlinePlayersInInstance === 'function'
    ? await persistenceService.hasOnlinePlayersInInstance(instanceId)
    : false;
  if (hasOnlinePlayers) {
    runtime.logger.warn(`启动恢复过期租约仍有在线玩家：${instanceId} assignedNodeId=${assignedNodeId}`);
    return false;
  }
  return true;
}

/** dev/test 环境或显式环境变量下允许强制回收 stale lease。 */
function shouldForceReclaimStaleLease(): boolean {
  const explicit = String(process.env.SERVER_FORCE_RECLAIM_STALE_LEASES ?? '').trim();
  if (explicit === '1') return true;
  if (explicit === '0') return false;
  const env = String(process.env.SERVER_RUNTIME_ENV ?? process.env.NODE_ENV ?? '').trim().toLowerCase();
  return env === 'development' || env === 'dev' || env === 'local' || env === 'test';
}

export async function hydratePersistentInstanceSnapshot(runtime, instanceId, instance) {
  const domainPersistenceService = runtime.instanceDomainPersistenceService;
  const domainPersistenceEnabled = typeof domainPersistenceService?.isEnabled === 'function'
    && domainPersistenceService.isEnabled();
  if (!domainPersistenceEnabled) {
    await restorePersistentInstanceFormations(runtime, instanceId);
    return;
  }
  const runtimeTileCells = typeof domainPersistenceService.loadRuntimeTileCells === 'function'
    ? await domainPersistenceService.loadRuntimeTileCells(instanceId)
    : [];
  if (Array.isArray(runtimeTileCells) && runtimeTileCells.length > 0 && typeof instance.hydrateRuntimeTiles === 'function') {
    instance.hydrateRuntimeTiles(runtimeTileCells);
  }
  const tileDiffs = await domainPersistenceService.loadTileResourceDiffs(instanceId);
  if (Array.isArray(tileDiffs) && tileDiffs.length > 0) {
    instance.patchTileResources(tileDiffs);
  }
  const tileDamageStates = typeof domainPersistenceService.loadTileDamageStates === 'function'
    ? await domainPersistenceService.loadTileDamageStates(instanceId)
    : [];
  if (Array.isArray(tileDamageStates) && tileDamageStates.length > 0) {
    instance.hydrateTileDamage(tileDamageStates);
  }
  const temporaryTileStates = typeof domainPersistenceService.loadTemporaryTileStates === 'function'
    ? await domainPersistenceService.loadTemporaryTileStates(instanceId)
    : [];
  if (Array.isArray(temporaryTileStates) && temporaryTileStates.length > 0 && typeof instance.hydrateTemporaryTiles === 'function') {
    instance.hydrateTemporaryTiles(temporaryTileStates);
  }
  const groundItems = await domainPersistenceService.loadGroundItems(instanceId);
  if (Array.isArray(groundItems) && groundItems.length > 0) {
    instance.hydrateGroundPiles(groupGroundItemsByTile(groundItems));
  }
  const containerStates = await domainPersistenceService.loadContainerStates(instanceId);
  runtime.worldRuntimeLootContainerService.hydrateContainerStates(instanceId, normalizeLoadedContainerStates(containerStates ?? []));
  const monsterStates = await domainPersistenceService.loadMonsterRuntimeStates(instanceId);
  instance.hydrateMonsterRuntimeStates(monsterStates ?? []);
  const overlayChunks = await domainPersistenceService.loadOverlayChunks(instanceId);
  if (Array.isArray(overlayChunks) && overlayChunks.length > 0 && typeof instance.hydrateOverlayChunks === 'function') {
    instance.hydrateOverlayChunks(overlayChunks);
  }
  const buildingRoomFengShuiState = typeof domainPersistenceService.loadBuildingRoomFengShuiState === 'function'
    ? await domainPersistenceService.loadBuildingRoomFengShuiState(instanceId)
    : null;
  if (buildingRoomFengShuiState
    && (buildingRoomFengShuiState.buildings?.length > 0
      || buildingRoomFengShuiState.rooms?.length > 0
      || buildingRoomFengShuiState.fengShui?.length > 0)
    && typeof instance.hydrateBuildingRoomFengShuiState === 'function') {
    // 先返还即将被摧毁的宝库库存：删除建筑行后就取不到 owner 了；返还失败的宝库豁免摧毁。
    const keepBuildingIds = await recoverVaultsBeforePlacementPrune(runtime, instanceId, instance, buildingRoomFengShuiState, runtime?.logger);
    const keptTimeChambers = await releaseTimeChambersBeforePlacementPrune(runtime, instanceId, instance, buildingRoomFengShuiState, runtime?.logger);
    for (const buildingId of keptTimeChambers) keepBuildingIds.add(buildingId);
    const hydrateResult = instance.hydrateBuildingRoomFengShuiState(buildingRoomFengShuiState, { keepBuildingIds });
    logPrunedBuildingAudit(instanceId, hydrateResult, runtime?.logger);
    await persistBuildingRoomStateAfterStartupRecovery(runtime, domainPersistenceService, instanceId, instance, hydrateResult);
  }
  const checkpoint = await domainPersistenceService.loadInstanceCheckpoint(instanceId);
  if (checkpoint) {
    hydrateInstanceFromCheckpoint(instance, checkpoint, runtime, instanceId);
  }
  await restorePersistentInstanceFormations(runtime, instanceId);
}

async function restorePersistentInstanceFormations(runtime, instanceId) {
  if (typeof runtime.worldRuntimeFormationService?.restoreInstanceFormations !== 'function') {
    return;
  }
  const instance = runtime.getInstanceRuntime?.(instanceId) ?? null;
  const restoredFormations = await runtime.worldRuntimeFormationService.restoreInstanceFormations(instanceId, instance);
  if (restoredFormations > 0) {
    runtime.logger.debug?.(`实例阵法已恢复：${instanceId} x${restoredFormations}`);
  }
}

function shouldRestoreCatalogEntry(entry) {
  if (isCatalogTombstone(entry) || entry?.runtime_status === 'creating') {
    return false;
  }
  const persistentPolicy = normalizeRuntimeInstancePersistentPolicy(entry?.persistent_policy);
  if (persistentPolicy === 'persistent') {
    return true;
  }
  if (persistentPolicy !== 'long_lived') {
    return false;
  }
  const lastActiveAt = entry?.last_active_at ? new Date(entry.last_active_at).getTime() : 0;
  if (!Number.isFinite(lastActiveAt) || lastActiveAt <= 0) {
    return false;
  }
  return Date.now() - lastActiveAt <= LONG_LIVED_INSTANCE_TTL_MS;
}

async function markMissingTemplateCatalogEntry(runtime, entry, instanceId, templateId, phase) {
  if (entry?.runtime_status === 'template_missing') {
    return;
  }
  if (typeof runtime.instanceCatalogService?.markInstanceTemplateMissing !== 'function') {
    runtime.logger.warn(`实例目录引用的地图模板不存在，跳过 ${phase}：${instanceId} -> ${templateId}`);
    return;
  }
  const changed = await runtime.instanceCatalogService.markInstanceTemplateMissing({ instanceId, templateId });
  if (changed) {
    runtime.logger.warn(`实例目录引用的地图模板不存在，已标记为待内容恢复：${instanceId} -> ${templateId}`);
  }
}

function normalizeLoadedContainerStates(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const payload = row?.statePayload && typeof row.statePayload === 'object' ? row.statePayload : {};
      return {
        ...payload,
        sourceId: typeof row?.sourceId === 'string' && row.sourceId.trim() ? row.sourceId : payload.sourceId,
        containerId: typeof row?.containerId === 'string' && row.containerId.trim() ? row.containerId : payload.containerId,
      };
    });
}

function groupGroundItemsByTile(items) {
  const piles = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const tileIndex = Number.isFinite(Number(item?.tileIndex)) ? Math.trunc(Number(item.tileIndex)) : -1;
    if (tileIndex < 0) {
      continue;
    }
    const current = piles.get(tileIndex) ?? { tileIndex, items: [] };
    const payload = item.itemPayload && typeof item.itemPayload === 'object' ? item.itemPayload : {};
    current.items.push(payload);
    piles.set(tileIndex, current);
  }
  return Array.from(piles.values(), (pile) => ({
    tileIndex: pile.tileIndex,
    items: pile.items,
  }));
}

function hydrateInstanceFromCheckpoint(instance, checkpoint, runtime, instanceId) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return;
  }
  const snapshot = resolveCheckpointSnapshot(checkpoint);
  if (!snapshot) {
    return;
  }
  if (typeof instance.hydrateTime === 'function') {
    const tickSpeed = snapshot.tickSpeed;
    const paused = snapshot.paused;
    instance.hydrateTime(snapshot.tick, { tickSpeed, paused });
  }
  void runtime;
  void instanceId;
}

function resolveCheckpointSnapshot(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return null;
  }
  if (checkpoint.snapshot && typeof checkpoint.snapshot === 'object') {
    return checkpoint.snapshot;
  }
  return checkpoint;
}
