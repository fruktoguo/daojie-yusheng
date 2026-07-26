import assert from 'node:assert/strict';

import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { ShutdownStatusService } from '../lifecycle/shutdown-status.service';
import { WorldShutdownDrainService } from '../network/world-shutdown-drain.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const order: string[] = [];
  const barrier = new StartupBarrierService();
  const shutdownStatusService = new ShutdownStatusService();
  const worldGateway = {
    setDraining(draining: boolean) {
      order.push(`setDraining:${draining}`);
    },
    disconnectAllForShutdown(reason: string) {
      order.push(`disconnectAll:${reason}`);
      return [{ playerId: 'player:a', connected: false }];
    },
    async drainDetachedBinding(binding: { playerId: string }) {
      order.push(`drainBinding:${binding.playerId}`);
      return { playerId: binding.playerId, presencePersisted: true, flushSucceeded: true, skipped: false };
    },
  };
  const playerPersistenceFlushService = {
    async flushAllNow() {
      order.push('flushPlayers');
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
      order.push('releaseLeases');
      return {
        released: 1,
        skipped: 0,
        releasedInstanceIds: ['instance:a'],
        skippedInstanceIds: [],
        failedInstanceIds: [],
      };
    },
    worldRuntimeFormationService: {
      async flushAllNow() {
        order.push('flushFormations');
      },
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
  const flushTaskRuntimeService = {
    async drainForShutdown() {
      order.push('drainFlushTaskRuntime');
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
    flushTaskRuntimeService as never,
    {
      async drainForShutdown() {
        order.push('drainBackgroundWorkers');
      },
    } as never,
  );

  const first = await service.drain('SIGTERM');
  const second = await service.drain('SIGTERM');

  assert.equal(first.shutdownRunId, second.shutdownRunId);
  assert.deepEqual(first.players.flushFailed, []);
  assert.deepEqual(first.instances.leaseReleaseFailed, []);
  assert.deepEqual(first.instances.leaseReleaseSkipped, []);
  assert.equal(first.node.deregistered, true);
  assert.ok(order.indexOf('flushTower') < order.indexOf('releaseLeases'));
  assert.ok(order.indexOf('beginDurableShutdown') < order.indexOf('drainMarket'));
  assert.ok(order.indexOf('stopTick') < order.indexOf('drainFlushTaskRuntime'));
  assert.ok(order.indexOf('stopTick') < order.indexOf('drainBackgroundWorkers'));
  assert.ok(order.indexOf('drainBackgroundWorkers') < order.indexOf('drainFlushTaskRuntime'));
  assert.ok(order.indexOf('drainFlushTaskRuntime') < order.indexOf('flushPlayers'));
  assert.ok(order.indexOf('beginSectShutdown') < order.indexOf('disconnectAll:server_shutdown'));
  assert.ok(order.indexOf('flushSects') < order.indexOf('flushFormations'));
  assert.ok(order.indexOf('flushFormations') < order.indexOf('flushPlayers'));
  assert.ok(order.indexOf('flushFormations') < order.indexOf('releaseLeases'));
  assert.ok(order.indexOf('releaseLeases') < order.indexOf('deregisterNode'));
  assert.ok(order.indexOf('deregisterNode') < order.indexOf('closeRuntime'));
  assert.equal(order.filter((item) => item === 'releaseLeases').length, 1);
  assert.equal(order.filter((item) => item === 'deregisterNode').length, 1);
  assert.equal(barrier.isTrafficOpen(), false);
  assert.equal(barrier.isTickOpen(), false);
  assert.equal(barrier.isFlushOpen(), false);
  assert.equal(barrier.isWorkerOpen(), false);
  assert.equal(barrier.isOutboxOpen(), false);
  assert.equal(first.phase, 'drain_completed');

  console.log('[shutdown-coordinator-order-smoke] ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
