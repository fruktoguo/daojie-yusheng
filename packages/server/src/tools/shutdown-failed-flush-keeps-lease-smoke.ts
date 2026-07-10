import assert from 'node:assert/strict';

import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { ShutdownStatusService } from '../lifecycle/shutdown-status.service';
import { WorldShutdownDrainService } from '../network/world-shutdown-drain.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const barrier = new StartupBarrierService();
  const shutdownStatusService = new ShutdownStatusService();
  const order: string[] = [];
  const worldGateway = {
    setDraining() {
      order.push('setDraining');
    },
    disconnectAllForShutdown() {
      order.push('disconnectAll');
      return [{ playerId: 'player:a', connected: false }];
    },
    async drainDetachedBinding() {
      order.push('drainBinding');
      return { playerId: 'player:a', presencePersisted: true, flushSucceeded: true, skipped: false };
    },
  };
  const playerPersistenceFlushService = {
    async flushAllNow() {
      order.push('flushPlayers');
      throw new Error('player flush failed');
    },
  };
  const mapPersistenceFlushService = {
    async flushAllNow() {
      order.push('flushMaps');
    },
  };
  const marketRuntimeService = {
    async drainForShutdown() {
      order.push('drainMarket');
    },
  };
  const tongtianTowerPersistenceService = {
    async flushAllProgress() {
      order.push('flushTower');
    },
  };
  const worldTickService = {
    async stopForShutdown() {
      order.push('stopTick');
    },
  };
  const worldRuntimeService = {
    listInstanceEntries() {
      order.push('listInstances');
      return [[
        'instance:a',
        { meta: { assignedNodeId: 'node-a', leaseToken: 'lease-a', runtimeStatus: 'leased' } },
      ]];
    },
    async releaseLocalInstanceLeasesForShutdown() {
      throw new Error('releaseLocalInstanceLeasesForShutdown should not be called when final flush fails');
    },
    worldRuntimeSectService: {
      beginShutdown() {
        order.push('beginSectShutdown');
      },
      async flushAllNow() {
        order.push('flushSects');
      },
    },
    async closeForShutdown() {
      order.push('closeRuntime');
    },
  };
  const nodeRegistryService = {
    getNodeId() {
      return 'node-a';
    },
    async deregisterNode() {
      order.push('deregisterNode');
    },
  };
  const durableOperationService = {
    beginShutdown() {
      order.push('beginDurableShutdown');
    },
    hasUnresolvedCommitOutcomes() {
      return false;
    },
  };
  const service = new WorldShutdownDrainService(
    worldGateway as never,
    playerPersistenceFlushService as never,
    mapPersistenceFlushService as never,
    durableOperationService as never,
    marketRuntimeService as never,
    tongtianTowerPersistenceService as never,
    worldTickService as never,
    worldRuntimeService as never,
    nodeRegistryService as never,
    shutdownStatusService as never,
    barrier as never,
    { async drainForShutdown() {} } as never,
  );

  const snapshot = await service.drain('SIGTERM');
  assert.equal(snapshot.phase, 'drain_failed');
  assert.deepEqual(snapshot.instances.leaseReleased, 0);
  assert.ok(snapshot.instances.leaseReleaseSkipped.includes('instance:a'));
  assert.ok(snapshot.instances.flushFailed.includes('player_flush'));
  assert.equal(order.includes('releaseLeases'), false);
  assert.equal(snapshot.node.deregistered, true);
  await proveUnresolvedDurableCommitFlushesUnaffectedState();
  await proveUnresolvedSectCommitSkipsOnlySectState();
  await proveBackgroundWorkerDrainFailureKeepsLease();
  await proveDurablePayloadDrainFailureKeepsLease();
  await proveTongtianFinalFlushFailureKeepsLease();
  console.log('[shutdown-failed-flush-keeps-lease-smoke] ok');
}

async function proveTongtianFinalFlushFailureKeepsLease(): Promise<void> {
  const barrier = new StartupBarrierService();
  const shutdownStatusService = new ShutdownStatusService();
  let releaseLeaseCalled = false;
  const service = new WorldShutdownDrainService(
    {
      setDraining() {},
      disconnectAllForShutdown() { return []; },
      async drainDetachedBinding() { throw new Error('unexpected binding'); },
    } as never,
    { async flushAllNow() {} } as never,
    { async flushAllNow() {} } as never,
    {
      beginShutdown() {},
      hasUnresolvedCommitOutcomes() { return false; },
    } as never,
    { async drainForShutdown() {} } as never,
    {
      async flushAllProgress() {
        throw new Error('tongtian_tower_persistence_pool_closed');
      },
    } as never,
    { async stopForShutdown() {} } as never,
    {
      worldRuntimeSectService: {
        beginShutdown() {},
        hasUnresolvedCommitOutcomes() { return false; },
        async flushAllNow() {},
      },
      worldRuntimeFormationService: { async flushAllNow() {} },
      listInstanceEntries() {
        return [['instance:tongtian', { meta: { assignedNodeId: 'node-a', leaseToken: 'lease-a' } }]];
      },
      async releaseLocalInstanceLeasesForShutdown() {
        releaseLeaseCalled = true;
        return { released: 1, skipped: 0 };
      },
      async closeForShutdown() {},
    } as never,
    {
      getNodeId() { return 'node-a'; },
      async deregisterNode() {},
    } as never,
    shutdownStatusService as never,
    barrier as never,
    { async drainForShutdown() {} } as never,
  );

  const snapshot = await service.drain('SIGTERM');
  assert.equal(snapshot.phase, 'drain_failed');
  assert.ok(snapshot.instances.flushFailed.includes('tongtian_tower_flush'));
  assert.ok(snapshot.instances.leaseReleaseSkipped.includes('instance:tongtian'));
  assert.equal(releaseLeaseCalled, false);
}

async function proveDurablePayloadDrainFailureKeepsLease(): Promise<void> {
  const barrier = new StartupBarrierService();
  const shutdownStatusService = new ShutdownStatusService();
  const calls: string[] = [];
  let releaseLeaseCalled = false;
  const service = new WorldShutdownDrainService(
    {
      setDraining() {},
      disconnectAllForShutdown() { return []; },
      async drainDetachedBinding() { throw new Error('unexpected binding'); },
    } as never,
    { async flushAllNow() { calls.push('flushPlayers'); } } as never,
    { async flushAllNow() { calls.push('flushMaps'); } } as never,
    {
      beginShutdown() {},
      hasUnresolvedCommitOutcomes() { return false; },
    } as never,
    { async drainForShutdown() { calls.push('drainMarket'); } } as never,
    { async flushAllProgress() { calls.push('flushTower'); } } as never,
    { async stopForShutdown() { calls.push('stopTick'); } } as never,
    {
      worldRuntimeSectService: {
        beginShutdown() {},
        hasUnresolvedCommitOutcomes() { return false; },
        async flushAllNow() { calls.push('flushSects'); },
      },
      worldRuntimeFormationService: { async flushAllNow() { calls.push('flushFormations'); } },
      listInstanceEntries() {
        return [['instance:durable-payload', { meta: { assignedNodeId: 'node-a', leaseToken: 'lease-a' } }]];
      },
      async releaseLocalInstanceLeasesForShutdown() {
        releaseLeaseCalled = true;
        return { released: 1, skipped: 0 };
      },
      async closeForShutdown() {},
    } as never,
    {
      getNodeId() { return 'node-a'; },
      async deregisterNode() {},
    } as never,
    shutdownStatusService as never,
    barrier as never,
    {
      async drainForShutdown() {
        calls.push('drainDurablePayload');
        throw new Error('shutdown_durable_payload_pending:3');
      },
    } as never,
  );

  const snapshot = await service.drain('SIGTERM');
  assert.equal(snapshot.phase, 'drain_failed');
  assert.ok(snapshot.instances.flushFailed.includes('durable_payload_drain'));
  assert.ok(snapshot.instances.leaseReleaseSkipped.includes('instance:durable-payload'));
  assert.equal(releaseLeaseCalled, false);
  assert.ok(calls.indexOf('stopTick') < calls.indexOf('drainDurablePayload'));
  assert.ok(calls.indexOf('drainDurablePayload') < calls.indexOf('flushPlayers'));
  assert.deepEqual(calls.slice(-5), [
    'flushPlayers',
    'flushMaps',
    'flushTower',
    'flushSects',
    'flushFormations',
  ]);
}

async function proveBackgroundWorkerDrainFailureKeepsLease(): Promise<void> {
  const barrier = new StartupBarrierService();
  const shutdownStatusService = new ShutdownStatusService();
  let releaseLeaseCalled = false;
  const service = new WorldShutdownDrainService(
    {
      setDraining() {},
      disconnectAllForShutdown() { return []; },
      async drainDetachedBinding() { throw new Error('unexpected binding'); },
    } as never,
    { async flushAllNow() {} } as never,
    { async flushAllNow() {} } as never,
    {
      beginShutdown() {},
      hasUnresolvedCommitOutcomes() { return false; },
    } as never,
    { async drainForShutdown() {} } as never,
    { async flushAllProgress() {} } as never,
    { async stopForShutdown() {} } as never,
    {
      worldRuntimeSectService: {
        beginShutdown() {},
        hasUnresolvedCommitOutcomes() { return false; },
        async flushAllNow() {},
      },
      worldRuntimeFormationService: { async flushAllNow() {} },
      listInstanceEntries() {
        return [['instance:background-drain', { meta: { assignedNodeId: 'node-a', leaseToken: 'lease-a' } }]];
      },
      async releaseLocalInstanceLeasesForShutdown() {
        releaseLeaseCalled = true;
        return { released: 1, skipped: 0 };
      },
      async closeForShutdown() {},
    } as never,
    {
      getNodeId() { return 'node-a'; },
      async deregisterNode() {},
    } as never,
    shutdownStatusService as never,
    barrier as never,
    { async drainForShutdown() {} } as never,
    {
      async drainForShutdown() {
        throw new Error('background_worker_drain_budget_exceeded:10:inFlight=1');
      },
    } as never,
  );

  const snapshot = await service.drain('SIGTERM');
  assert.equal(snapshot.phase, 'drain_failed');
  assert.ok(snapshot.instances.flushFailed.includes('background_worker_drain'));
  assert.ok(snapshot.instances.leaseReleaseSkipped.includes('instance:background-drain'));
  assert.equal(releaseLeaseCalled, false);
}

async function proveUnresolvedDurableCommitFlushesUnaffectedState(): Promise<void> {
  const barrier = new StartupBarrierService();
  const shutdownStatusService = new ShutdownStatusService();
  const calls: string[] = [];
  const service = new WorldShutdownDrainService(
    {
      setDraining() {},
      disconnectAllForShutdown() { return []; },
      async drainDetachedBinding() { throw new Error('unexpected binding'); },
    } as never,
    { async flushAllNow() { calls.push('flushPlayers'); } } as never,
    { async flushAllNow() { calls.push('flushMaps'); } } as never,
    {
      beginShutdown() {},
      hasUnresolvedCommitOutcomes() { return true; },
    } as never,
    { async drainForShutdown() {} } as never,
    { async flushAllProgress() { calls.push('flushTower'); } } as never,
    { async stopForShutdown() {} } as never,
    {
      worldRuntimeSectService: {
        beginShutdown() {},
        hasUnresolvedCommitOutcomes() { return false; },
        async flushAllNow() { calls.push('flushSects'); },
      },
      worldRuntimeFormationService: {
        async flushAllNow() { calls.push('flushFormations'); },
      },
      listInstanceEntries() {
        return [['instance:unknown', { meta: { assignedNodeId: 'node-a', leaseToken: 'lease-a' } }]];
      },
      async releaseLocalInstanceLeasesForShutdown() {
        calls.push('releaseLeases');
        return { released: 1, skipped: 0 };
      },
      async closeForShutdown() {},
    } as never,
    {
      getNodeId() { return 'node-a'; },
      async deregisterNode() {},
    } as never,
    shutdownStatusService as never,
    barrier as never,
    { async drainForShutdown() {} } as never,
  );

  const snapshot = await service.drain('SIGTERM');
  assert.deepEqual(calls, [
    'flushPlayers',
    'flushMaps',
    'flushTower',
    'flushSects',
    'flushFormations',
  ]);
  assert.ok(snapshot.instances.flushFailed.includes('durable_commit_outcome_unknown'));
  assert.ok(snapshot.instances.leaseReleaseSkipped.includes('instance:unknown'));
}

async function proveUnresolvedSectCommitSkipsOnlySectState(): Promise<void> {
  const barrier = new StartupBarrierService();
  const shutdownStatusService = new ShutdownStatusService();
  const calls: string[] = [];
  const service = new WorldShutdownDrainService(
    {
      setDraining() {},
      disconnectAllForShutdown() { return []; },
      async drainDetachedBinding() { throw new Error('unexpected binding'); },
    } as never,
    { async flushAllNow() { calls.push('flushPlayers'); } } as never,
    { async flushAllNow() { calls.push('flushMaps'); } } as never,
    {
      beginShutdown() {},
      hasUnresolvedCommitOutcomes() { return true; },
    } as never,
    { async drainForShutdown() {} } as never,
    { async flushAllProgress() { calls.push('flushTower'); } } as never,
    { async stopForShutdown() {} } as never,
    {
      worldRuntimeSectService: {
        beginShutdown() {},
        hasUnresolvedCommitOutcomes() { return true; },
        async flushAllNow() { calls.push('flushSects'); },
      },
      worldRuntimeFormationService: {
        async flushAllNow() { calls.push('flushFormations'); },
      },
      listInstanceEntries() {
        return [['instance:sect-unknown', { meta: { assignedNodeId: 'node-a', leaseToken: 'lease-a' } }]];
      },
      async releaseLocalInstanceLeasesForShutdown() {
        calls.push('releaseLeases');
        return { released: 1, skipped: 0 };
      },
      async closeForShutdown() {},
    } as never,
    {
      getNodeId() { return 'node-a'; },
      async deregisterNode() {},
    } as never,
    shutdownStatusService as never,
    barrier as never,
    { async drainForShutdown() {} } as never,
  );

  const snapshot = await service.drain('SIGTERM');
  assert.deepEqual(calls, ['flushPlayers', 'flushMaps', 'flushTower']);
  assert.ok(snapshot.instances.flushFailed.includes('durable_commit_outcome_unknown'));
  assert.ok(snapshot.instances.leaseReleaseSkipped.includes('instance:sect-unknown'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
