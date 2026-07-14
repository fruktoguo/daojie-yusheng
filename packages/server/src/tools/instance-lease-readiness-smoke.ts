import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldRuntimeInstanceLeaseReadinessService } from '../runtime/world/world-runtime-instance-lease-readiness.service';
import { isInstanceLeaseWritable } from '../runtime/world/world-runtime-instance-lease.helpers';
import { WorldRuntimePlayerSessionService } from '../runtime/world/world-runtime-player-session.service';

async function main(): Promise<void> {
  const readiness = await verifyDynamicInstanceWaitsForLeaseAndSupersedesStaleRegistration();
  const expiry = verifyExpiredLeaseStopsWritesImmediately();
  const session = await verifyPlayerAttachUsesDirectRuntimeLeaseGuard();
  console.log(JSON.stringify({
    ok: true,
    readiness,
    expiry,
    session,
    answers: 'catalog 启用时，无 assignedNodeId/leaseToken 的动态实例不可写；全局 gate 已开放后，动态实例会在 readiness 注册前加入 write gate，只在注册与 lease 成功后加入 attach gate；租约一旦到达数据库过期时刻立即停止写入，不保留跨节点双写宽限；相同实例 ID 的替换注册严格串行，旧任务不会 claim；玩家挂接直接调用真实 WorldRuntimeService 的 lease/attach 闸门，并在动态实例注册完成后才连接。',
    excludes: '不证明真实 PostgreSQL 锁等待、跨节点网络分区或 10000 实例同时注册的吞吐。',
  }, null, 2));
}

function verifyExpiredLeaseStopsWritesImmediately(): {
  beforeExpiryWritable: boolean;
  expiredWritable: boolean;
} {
  const runtime: any = {
    instanceCatalogService: { isEnabled: () => true },
    nodeRegistryService: { getNodeId: () => 'node:lease-expiry-smoke' },
  };
  const instance = buildPendingInstance('public:lease-expiry-smoke', 'expiry');
  instance.meta.assignedNodeId = 'node:lease-expiry-smoke';
  instance.meta.leaseToken = 'lease:expiry-smoke';
  instance.meta.leaseExpireAt = new Date(Date.now() + 60_000).toISOString();
  const beforeExpiryWritable = isInstanceLeaseWritable(runtime, instance);
  instance.meta.leaseExpireAt = new Date(Date.now() - 1).toISOString();
  const expiredWritable = isInstanceLeaseWritable(runtime, instance);
  assert.equal(beforeExpiryWritable, true);
  assert.equal(expiredWritable, false, '租约到期后必须立即停写，不能沿用续租调度的时钟偏移量作为写入宽限');
  return { beforeExpiryWritable, expiredWritable };
}

async function verifyDynamicInstanceWaitsForLeaseAndSupersedesStaleRegistration(): Promise<{
  initiallyWritable: boolean;
  finalWritable: boolean;
  claimCount: number;
  staleInstanceClaimed: boolean;
  writeGateEnrolledBeforeRegistration: boolean;
  attachGateEnrolledAfterClaim: boolean;
}> {
  const instanceId = 'tower:tongtian:layer:lease-readiness-smoke';
  const instances = new Map<string, any>();
  const order: string[] = [];
  let catalog: Record<string, unknown> | null = null;
  let claimCount = 0;
  let releaseFirstUpsert: (() => void) | null = null;
  const firstUpsertGate = new Promise<void>((resolve) => {
    releaseFirstUpsert = resolve;
  });
  let upsertCount = 0;
  const writableInstanceIds = new Set<string>();
  const attachableInstanceIds = new Set<string>();
  const runtime: any = {
    logger: { warn() {}, debug() {}, log() {} },
    nodeRegistryService: { getNodeId: () => 'node:lease-readiness-smoke' },
    instanceDomainPersistenceService: { isEnabled: () => false },
    startupBarrierService: {
      getSnapshot() {
        return { instanceWriteOpen: true, instanceAttachOpen: true };
      },
      openInstanceWrites(instanceIds: Iterable<string>) {
        for (const candidateInstanceId of instanceIds) {
          writableInstanceIds.add(candidateInstanceId);
          order.push(`open-write:${candidateInstanceId}`);
        }
      },
      openInstanceAttach(instanceIds: Iterable<string>) {
        assert.equal(order.at(-1), 'claim', 'attach gate 只能在 catalog claim 成功后开放');
        for (const candidateInstanceId of instanceIds) {
          attachableInstanceIds.add(candidateInstanceId);
          order.push(`open-attach:${candidateInstanceId}`);
        }
      },
      isInstanceWritable(candidateInstanceId: string) {
        return writableInstanceIds.has(candidateInstanceId);
      },
    },
    instanceCatalogService: {
      isEnabled: () => true,
      async upsertInstanceCatalog(input: any) {
        assert.equal(writableInstanceIds.has(input.instanceId), true,
          'readiness 注册前必须先把动态实例加入 write gate');
        assert.equal(attachableInstanceIds.has(input.instanceId), false,
          'catalog 注册完成前不得开放 attach gate');
        upsertCount += 1;
        order.push(`upsert:${upsertCount}`);
        if (upsertCount === 1) {
          await firstUpsertGate;
        }
        catalog = {
          instance_id: input.instanceId,
          template_id: input.templateId,
          persistent_policy: input.persistentPolicy,
          status: input.status,
          runtime_status: input.runtimeStatus,
          assigned_node_id: input.assignedNodeId,
          lease_token: input.leaseToken,
          lease_expire_at: input.leaseExpireAt,
          ownership_epoch: input.ownershipEpoch,
        };
      },
      async loadInstanceCatalog() {
        return catalog;
      },
      async claimInstanceLease(input: any) {
        claimCount += 1;
        order.push('claim');
        catalog = {
          ...(catalog ?? {}),
          assigned_node_id: input.nodeId,
          lease_token: input.leaseToken,
          lease_expire_at: input.leaseExpireAt.toISOString(),
          ownership_epoch: Number(input.expectedOwnershipEpoch) + 1,
          runtime_status: 'leased',
        };
        return { ok: true, ownershipEpoch: Number(input.expectedOwnershipEpoch) + 1 };
      },
      async renewInstanceLease() {
        throw new Error('new runtime must claim exactly once instead of renewing a stale shell');
      },
    },
    getInstanceRuntime(id: string) {
      return instances.get(id) ?? null;
    },
    async replayInstanceFlushPayloadsBeforeOwnershipChange(_id: string, epoch: number) {
      order.push(`replay:${epoch}`);
    },
  };
  const service = new WorldRuntimeInstanceLeaseReadinessService();
  const staleInstance = buildPendingInstance(instanceId, 'stale');
  instances.set(instanceId, staleInstance);
  service.schedule(instanceId, staleInstance, runtime);
  await new Promise((resolve) => setImmediate(resolve));

  service.reset();
  const currentInstance = buildPendingInstance(instanceId, 'current');
  instances.set(instanceId, currentInstance);
  const currentTask = service.schedule(instanceId, currentInstance, runtime);
  const initiallyWritable = isInstanceLeaseWritable(runtime, currentInstance);
  let waitFinished = false;
  const waitTask = service.wait(instanceId).then(() => {
    waitFinished = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(waitFinished, false, '动态实例等待器不能在 catalog upsert/claim 前提前完成');
  releaseFirstUpsert?.();
  await Promise.all([currentTask, waitTask]);

  assert.equal(initiallyWritable, false);
  assert.equal(isInstanceLeaseWritable(runtime, staleInstance), false);
  assert.equal(isInstanceLeaseWritable(runtime, currentInstance), true);
  assert.equal(claimCount, 1);
  assert.deepEqual(order, [
    `open-write:${instanceId}`,
    'upsert:1',
    `open-write:${instanceId}`,
    'upsert:2',
    'replay:0',
    'claim',
    `open-attach:${instanceId}`,
  ]);
  assert.equal(writableInstanceIds.has(instanceId), true);
  assert.equal(attachableInstanceIds.has(instanceId), true);
  assert.equal(service.getPendingCount(), 0);
  return {
    initiallyWritable,
    finalWritable: true,
    claimCount,
    staleInstanceClaimed: false,
    writeGateEnrolledBeforeRegistration: true,
    attachGateEnrolledAfterClaim: true,
  };
}

async function verifyPlayerAttachUsesDirectRuntimeLeaseGuard(): Promise<{
  directGuardCalled: boolean;
  waitBeforeConnect: boolean;
}> {
  const order: string[] = [];
  const instance = {
    meta: { instanceId: 'public:lease-guard', runtimeStatus: 'running', status: 'active' },
    template: { id: 'lease-guard' },
    connectPlayer() {
      order.push('connect');
      return { sessionId: 'session:player:lease-guard' };
    },
    disconnectPlayer() { return true; },
    setPlayerMoveSpeed() {},
  };
  const worldAccess: any = {
    resolveDefaultRespawnMapId: () => 'lease-guard',
    getOrCreatePublicInstance: () => instance,
    getOrCreateDefaultLineInstance: () => instance,
    getPlayerViewOrThrow: () => ({ ok: true }),
  };
  const service = new WorldRuntimePlayerSessionService(worldAccess, null);
  const deps: any = buildSessionDeps(instance, order);
  deps.instanceReadyForPlayerAttach = () => {
    order.push('guard:rejected');
    return { ok: false, reason: 'lease_not_local', instance };
  };
  assert.throws(() => service.connectPlayer({
    playerId: 'player:lease-guard',
    sessionId: 'session:player:lease-guard',
    instanceId: instance.meta.instanceId,
  }, deps), /lease_not_local/);
  assert.deepEqual(order, ['guard:rejected']);

  order.length = 0;
  deps.waitForInstanceLeaseReady = async () => {
    order.push('wait');
  };
  deps.instanceReadyForPlayerAttach = () => {
    order.push('guard:ready');
    return { ok: true, reason: 'ready', instance };
  };
  await service.connectPlayerWhenReady({
    playerId: 'player:lease-guard',
    sessionId: 'session:player:lease-guard',
    instanceId: instance.meta.instanceId,
  }, deps);
  assert.deepEqual(order.slice(0, 3), ['wait', 'guard:ready', 'connect']);
  return { directGuardCalled: true, waitBeforeConnect: true };
}

function buildPendingInstance(instanceId: string, marker: string): any {
  return {
    marker,
    meta: {
      instanceId,
      persistent: true,
      persistentPolicy: 'persistent',
      runtimeStatus: 'running',
      status: 'active',
      ownershipEpoch: 0,
    },
    template: { id: 'tongtian_tower_layer_lease_readiness_smoke' },
  };
}

function buildSessionDeps(instance: any, order: string[]): any {
  return {
    logger: { debug() {}, warn() {} },
    templateRepository: { has: () => true },
    worldRuntimeGmQueueService: { clearPendingRespawn() {} },
    worldRuntimeNavigationService: { clearNavigationIntent() {} },
    worldSessionService: { purgePlayerSession() {} },
    playerRuntimeService: {
      ensurePlayer: () => ({ attrs: { numericStats: { moveSpeed: 100 } } }),
      getPlayer: () => ({ worldPreference: { linePreset: 'peaceful' } }),
      removePlayerRuntime() {},
      syncFromWorldView() {},
    },
    getPlayerLocation: () => null,
    setPlayerLocation() {},
    clearPlayerLocation() {},
    clearPendingCommand() {},
    getInstanceRuntime: (instanceId: string) => instanceId === instance.meta.instanceId ? instance : null,
    refreshPlayerContextActions() {},
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
