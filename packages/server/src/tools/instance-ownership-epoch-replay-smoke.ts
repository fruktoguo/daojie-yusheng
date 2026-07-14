import assert from 'node:assert/strict';

import {
  migrateInstanceToNode,
  syncInstanceLease,
} from '../runtime/world/world-runtime-instance-lease.helpers';

interface SmokeInstanceMeta {
  instanceId: string;
  persistent: boolean;
  status: string;
  leaseExpireAt: string;
  assignedNodeId: string | null;
  leaseToken: string | null;
  ownershipEpoch: number;
  runtimeStatus: string;
  destroyAt: string | null;
}

async function main(): Promise<void> {
  const previousForce = process.env.SERVER_FORCE_RECLAIM_STALE_LEASES;
  const previousRuntimeEnv = process.env.SERVER_RUNTIME_ENV;
  try {
    const ordinaryClaim = await verifyOrdinaryClaimReplaysBeforeEpochAdvance();
    const missingCatalog = await verifyMissingCatalogLeaseReplaysBeforeEpochAdvance();
    process.env.SERVER_FORCE_RECLAIM_STALE_LEASES = '1';
    process.env.SERVER_RUNTIME_ENV = 'development';
    const catalogTombstoneRejection = await verifyGenericCatalogTombstoneRejection();
    const scheduledDestroyAt = await verifyScheduledDestroyAtRemainsClaimable();
    const forceClaim = await verifyForceClaimReplaysBeforeEpochAdvance();
    const migration = await verifyMigrationReplaysBeforeEpochAdvance();
    console.log(JSON.stringify({
      ok: true,
      ordinaryClaim,
      missingCatalog,
      catalogTombstoneRejection,
      scheduledDestroyAt,
      forceClaim,
      migration,
      answers: '普通接管、catalog lease 缺失重建、开发环境强制接管和 GM 实例迁移都会先冻结旧写并 replay 旧 ownership epoch payload；普通 claim、force claim、adopt 与 reclaim 均不能复活任一 catalog tombstone',
      excludes: '不证明真实 PostgreSQL 跨节点锁竞争，只证明运行时调用顺序、冻结状态与 CAS 入参',
    }, null, 2));
  } finally {
    restoreEnv('SERVER_FORCE_RECLAIM_STALE_LEASES', previousForce);
    restoreEnv('SERVER_RUNTIME_ENV', previousRuntimeEnv);
  }
}

async function verifyScheduledDestroyAtRemainsClaimable(): Promise<{
  order: string[];
  ownershipEpoch: number;
  destroyAt: string;
}> {
  const instanceId = 'public:scheduled-destroy-claim';
  const order: string[] = [];
  const destroyAt = new Date(Date.now() + 60_000).toISOString();
  const instance = buildInstance(instanceId, {
    assignedNodeId: null,
    leaseToken: null,
    ownershipEpoch: 16,
    runtimeStatus: 'running',
    destroyAt,
  });
  const catalog = {
    ...buildCatalog(instanceId, 16, null, null, null),
    status: 'active',
    runtime_status: 'running',
    destroy_at: destroyAt,
  };
  const runtime = buildRuntime(instanceId, instance, catalog, order, {
    async claim(input) {
      assert.equal(input.expectedOwnershipEpoch, 16);
      order.push('claim');
      return { ok: true, ownershipEpoch: 17 };
    },
  });

  await syncInstanceLease(runtime, instanceId);

  assert.deepEqual(order, ['replay:16', 'claim']);
  assert.equal(instance.meta.ownershipEpoch, 17);
  assert.equal(instance.meta.destroyAt, destroyAt);
  return { order, ownershipEpoch: instance.meta.ownershipEpoch, destroyAt };
}

async function verifyGenericCatalogTombstoneRejection(): Promise<{
  cases: Array<{ name: string; order: string[]; runtimeStatus: string }>;
}> {
  const definitions = [
    { name: 'destroyed_status', patch: { status: 'destroyed' } },
    { name: 'stopped_runtime', patch: { runtime_status: 'stopped' } },
    {
      name: 'expired_destroy_at',
      patch: { destroy_at: new Date(Date.now() - 60_000).toISOString() },
    },
  ];
  const cases: Array<{ name: string; order: string[]; runtimeStatus: string }> = [];
  for (const [index, definition] of definitions.entries()) {
    const instanceId = `tower:tongtian:layer:${40 + index}`;
    const order: string[] = [];
    const instance = buildInstance(instanceId, {
      assignedNodeId: null,
      leaseToken: null,
      ownershipEpoch: 13,
      runtimeStatus: 'running',
    });
    const catalog = {
      ...buildCatalog(instanceId, 13, null, null, null),
      status: 'active',
      runtime_status: 'running',
      destroy_at: null,
      ...definition.patch,
    };
    const runtime = buildRuntime(instanceId, instance, catalog, order, {
      async claim() {
        throw new Error('普通 claim 不得接管 tombstone');
      },
      async forceClaim() {
        throw new Error('force claim 不得接管 tombstone');
      },
      async revive() {
        throw new Error('generic sync 不得调用显式 revival');
      },
    });

    await syncInstanceLease(runtime, instanceId, { allowForceReclaim: true });

    assert.deepEqual(order, ['delete']);
    assert.equal(instance.meta.runtimeStatus, 'fenced');
    assert.equal(instance.meta.status, 'lease_lost');
    cases.push({ name: definition.name, order, runtimeStatus: instance.meta.runtimeStatus });
  }
  return { cases };
}

async function verifyOrdinaryClaimReplaysBeforeEpochAdvance(): Promise<{ order: string[]; ownershipEpoch: number }> {
  const instanceId = 'public:ordinary-claim-replay';
  const order: string[] = [];
  const instance = buildInstance(instanceId, {
    assignedNodeId: null,
    leaseToken: null,
    ownershipEpoch: 3,
    runtimeStatus: 'running',
  });
  const catalog = buildCatalog(instanceId, 3, null, null, null);
  const runtime = buildRuntime(instanceId, instance, catalog, order, {
    async claim(input) {
      assert.equal(input.expectedOwnershipEpoch, 3);
      assert.equal(instance.meta.runtimeStatus, 'ownership_transition');
      order.push('claim');
      return { ok: true, ownershipEpoch: 4 };
    },
  });

  await syncInstanceLease(runtime, instanceId);

  assert.deepEqual(order, ['replay:3', 'claim']);
  assert.equal(instance.meta.ownershipEpoch, 4);
  assert.equal(instance.meta.runtimeStatus, 'leased');
  return { order, ownershipEpoch: instance.meta.ownershipEpoch };
}

async function verifyMissingCatalogLeaseReplaysBeforeEpochAdvance(): Promise<{ order: string[]; ownershipEpoch: number }> {
  const instanceId = 'public:missing-catalog-lease-replay';
  const order: string[] = [];
  const instance = buildInstance(instanceId, {
    assignedNodeId: 'node:local',
    leaseToken: 'lease:local:old',
    ownershipEpoch: 8,
    runtimeStatus: 'leased',
  });
  const catalog = buildCatalog(instanceId, 8, null, null, null);
  const runtime = buildRuntime(instanceId, instance, catalog, order, {
    async renew() {
      return false;
    },
    async claim(input) {
      assert.equal(input.expectedOwnershipEpoch, 8);
      assert.equal(instance.meta.runtimeStatus, 'ownership_transition');
      order.push('claim');
      return { ok: true, ownershipEpoch: 9 };
    },
  });

  await syncInstanceLease(runtime, instanceId);

  assert.deepEqual(order, ['replay:8', 'claim']);
  assert.equal(instance.meta.ownershipEpoch, 9);
  assert.equal(instance.meta.runtimeStatus, 'leased');
  return { order, ownershipEpoch: instance.meta.ownershipEpoch };
}

async function verifyForceClaimReplaysBeforeEpochAdvance(): Promise<{ order: string[]; ownershipEpoch: number }> {
  const instanceId = 'public:force-claim-replay';
  const order: string[] = [];
  const futureLease = new Date(Date.now() + 60_000).toISOString();
  const instance = buildInstance(instanceId, {
    assignedNodeId: 'node:remote',
    leaseToken: 'lease:remote:valid',
    leaseExpireAt: futureLease,
    ownershipEpoch: 12,
    runtimeStatus: 'leased',
  });
  const catalog = buildCatalog(instanceId, 12, 'node:remote', 'lease:remote:valid', futureLease);
  const runtime = buildRuntime(instanceId, instance, catalog, order, {
    async renew() {
      return false;
    },
    async claim() {
      throw new Error('有效远端 lease 不应走普通 claim');
    },
    async forceClaim(input) {
      assert.equal(input.expectedOwnershipEpoch, 12);
      assert.equal(instance.meta.runtimeStatus, 'ownership_transition');
      order.push('force-claim');
      return { ok: true, ownershipEpoch: 13 };
    },
  });

  await syncInstanceLease(runtime, instanceId, { allowForceReclaim: true });

  assert.deepEqual(order, ['replay:12', 'force-claim']);
  assert.equal(instance.meta.ownershipEpoch, 13);
  assert.equal(instance.meta.runtimeStatus, 'leased');
  return { order, ownershipEpoch: instance.meta.ownershipEpoch };
}

async function verifyMigrationReplaysBeforeEpochAdvance(): Promise<{ order: string[]; ownershipEpoch: number }> {
  const instanceId = 'public:migrate-replay';
  const order: string[] = [];
  const instance = buildInstance(instanceId, {
    assignedNodeId: 'node:local',
    leaseToken: 'lease:local:migrate',
    ownershipEpoch: 20,
    runtimeStatus: 'leased',
  });
  const catalog = buildCatalog(
    instanceId,
    20,
    'node:local',
    'lease:local:migrate',
    instance.meta.leaseExpireAt,
  );
  const runtime = buildRuntime(instanceId, instance, catalog, order, {
    async migrate(input) {
      assert.equal(input.expectedOwnershipEpoch, 20);
      assert.equal(input.sourceNodeId, 'node:local');
      assert.equal(input.sourceLeaseToken, 'lease:local:migrate');
      assert.equal(instance.meta.runtimeStatus, 'ownership_transition');
      order.push('migrate');
      return { ok: true, ownershipEpoch: 21 };
    },
  });

  const result = await migrateInstanceToNode(runtime, instanceId, 'node:target');

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(order, ['replay:20', 'migrate']);
  assert.equal(instance.meta.ownershipEpoch, 21);
  assert.equal(instance.meta.assignedNodeId, 'node:target');
  assert.equal(instance.meta.runtimeStatus, 'stopped');
  return { order, ownershipEpoch: instance.meta.ownershipEpoch };
}

function buildInstance(instanceId: string, meta: Partial<SmokeInstanceMeta>) {
  return {
    meta: {
      instanceId,
      persistent: true,
      status: 'active',
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
      assignedNodeId: null,
      leaseToken: null,
      ownershipEpoch: 0,
      runtimeStatus: 'running',
      destroyAt: null,
      ...meta,
    } satisfies SmokeInstanceMeta,
  };
}

function buildCatalog(
  instanceId: string,
  ownershipEpoch: number,
  assignedNodeId: string | null,
  leaseToken: string | null,
  leaseExpireAt: string | null,
) {
  return {
    instance_id: instanceId,
    ownership_epoch: ownershipEpoch,
    assigned_node_id: assignedNodeId,
    lease_token: leaseToken,
    lease_expire_at: leaseExpireAt,
  };
}

function buildRuntime(
  instanceId: string,
  instance: ReturnType<typeof buildInstance>,
  catalog: ReturnType<typeof buildCatalog> & Record<string, unknown>,
  order: string[],
  behavior: {
    renew?: (input: Record<string, unknown>) => Promise<boolean>;
    claim?: (input: Record<string, unknown>) => Promise<{ ok: boolean; ownershipEpoch: number | null }>;
    forceClaim?: (input: Record<string, unknown>) => Promise<{ ok: boolean; ownershipEpoch: number | null }>;
    revive?: (input: Record<string, unknown>) => Promise<{ ok: boolean; ownershipEpoch: number | null }>;
    migrate?: (input: Record<string, unknown>) => Promise<{ ok: boolean; ownershipEpoch: number | null }>;
  },
) {
  return {
    logger: {
      log() {},
      warn() {},
      error() {},
    },
    nodeRegistryService: {
      getNodeId() {
        return 'node:local';
      },
    },
    instanceCatalogService: {
      isEnabled() {
        return true;
      },
      async loadInstanceCatalog() {
        return catalog;
      },
      async renewInstanceLease(input: Record<string, unknown>) {
        return behavior.renew?.(input) ?? false;
      },
      async claimInstanceLease(input: Record<string, unknown>) {
        return behavior.claim?.(input) ?? { ok: false, ownershipEpoch: null };
      },
      async forceClaimInstanceLease(input: Record<string, unknown>) {
        return behavior.forceClaim?.(input) ?? { ok: false, ownershipEpoch: null };
      },
      async reviveInstanceLeaseWithFence(input: Record<string, unknown>) {
        return behavior.revive?.(input) ?? { ok: false, ownershipEpoch: null };
      },
      async migrateInstanceLease(input: Record<string, unknown>) {
        return behavior.migrate?.(input) ?? { ok: false, ownershipEpoch: null };
      },
    },
    instanceDomainPersistenceService: {
      isEnabled() {
        return false;
      },
    },
    getInstanceRuntime(candidateInstanceId: string) {
      return candidateInstanceId === instanceId ? instance : null;
    },
    worldRuntimeInstanceStateService: {
      deleteInstanceRuntime(candidateInstanceId: string) {
        assert.equal(candidateInstanceId, instanceId);
        order.push('delete');
      },
    },
    worldRuntimeTickProgressService: {
      clearInstance() {},
    },
    worldRuntimeLootContainerService: {
      removeInstanceState() {},
    },
    runtimeEventBusService: {
      discardInstance() {},
    },
    worldRuntimeFormationService: {
      releaseInstance() {},
    },
    async replayInstanceFlushPayloadsBeforeOwnershipChange(targetInstanceId: string, ownershipEpoch: number) {
      assert.equal(targetInstanceId, instanceId);
      assert.equal(instance.meta.runtimeStatus, 'ownership_transition');
      order.push(`replay:${ownershipEpoch}`);
    },
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
    return;
  }
  delete process.env[name];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
