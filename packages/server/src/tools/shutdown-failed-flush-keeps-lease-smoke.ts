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
  };
  const nodeRegistryService = {
    getNodeId() {
      return 'node-a';
    },
    async deregisterNode() {
      order.push('deregisterNode');
    },
  };
  const service = new WorldShutdownDrainService(
    worldGateway as never,
    playerPersistenceFlushService as never,
    mapPersistenceFlushService as never,
    marketRuntimeService as never,
    tongtianTowerPersistenceService as never,
    worldTickService as never,
    worldRuntimeService as never,
    nodeRegistryService as never,
    shutdownStatusService as never,
    barrier as never,
  );

  const snapshot = await service.drain('SIGTERM');
  assert.equal(snapshot.phase, 'drain_failed');
  assert.deepEqual(snapshot.instances.leaseReleased, 0);
  assert.ok(snapshot.instances.leaseReleaseSkipped.includes('instance:a'));
  assert.ok(snapshot.instances.flushFailed.includes('player_flush'));
  assert.equal(order.includes('releaseLeases'), false);
  assert.equal(snapshot.node.deregistered, true);
  console.log('[shutdown-failed-flush-keeps-lease-smoke] ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
