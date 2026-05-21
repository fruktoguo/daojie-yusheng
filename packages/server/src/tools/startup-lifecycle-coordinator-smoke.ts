import assert from 'node:assert/strict';

import { ServerLifecycleCoordinatorService } from '../lifecycle/server-lifecycle-coordinator.service';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { StartupStatusService } from '../lifecycle/startup-status.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  process.env.SERVER_RUNTIME_ROLE = 'all';

  const status = new StartupStatusService();
  const barrier = new StartupBarrierService();
  const order: string[] = [];
  const instanceId = 'real:startup_lifecycle_smoke';

  const worldRuntimeService = {
    async rebuildPersistentRuntimeAfterRestore(options: { restoreOfflinePlayers?: boolean }) {
      order.push('world');
      assert.equal(options.restoreOfflinePlayers, false);
      assert.equal(barrier.isTickOpen(), false);
      assert.equal(barrier.isFlushOpen(), false);
      assert.equal(barrier.isTrafficOpen(), false);
    },
    listInstanceEntries() {
      return [[instanceId, {}]];
    },
    async restoreOfflineHangingPlayersForStartup() {
      order.push('players');
      assert.equal(barrier.isInstanceWritable(instanceId), true);
      assert.equal(barrier.isInstanceAttachAllowed(instanceId), true);
      assert.equal(barrier.isTrafficOpen(), false);
      return {
        enabled: true,
        expired: 1,
        candidates: 3,
        restored: 2,
        skipped: 1,
        skippedByReason: { lease_not_local: 1 },
      };
    },
    startInstanceLeaseSyncForLifecycleCoordinator() {
      order.push('lease-sync');
      assert.equal(barrier.isTickOpen(), true);
      assert.equal(barrier.isFlushOpen(), true);
      assert.equal(barrier.isTrafficOpen(), false);
    },
  };

  const worldTickService = {
    startForLifecycleCoordinator() {
      order.push('tick');
      assert.equal(barrier.isTickOpen(), true);
    },
  };

  const flushTaskRuntimeService = {
    startForLifecycleCoordinator() {
      order.push('flush-task');
      assert.equal(barrier.isFlushOpen(), true);
    },
  };

  const playerPersistenceFlushService = {
    startForLifecycleCoordinator() {
      order.push('player-flush');
      assert.equal(barrier.isFlushOpen(), true);
    },
  };

  const mapPersistenceFlushService = {
    startForLifecycleCoordinator() {
      order.push('map-flush');
      assert.equal(barrier.isFlushOpen(), true);
    },
  };

  const backgroundWorkerRuntimeService = {
    startForLifecycleCoordinator() {
      order.push('worker');
      assert.equal(barrier.isOutboxOpen(), true);
      assert.equal(barrier.isWorkerOpen(), true);
    },
  };

  const marketRuntimeService = {
    async reloadFromPersistence() {
      order.push('market');
      assert.equal(barrier.isTrafficOpen(), false);
    },
  };

  const coordinator = new ServerLifecycleCoordinatorService(
    status,
    barrier,
    worldRuntimeService as never,
    worldTickService as never,
    flushTaskRuntimeService as never,
    playerPersistenceFlushService as never,
    mapPersistenceFlushService as never,
    backgroundWorkerRuntimeService as never,
    marketRuntimeService as never,
  );

  await coordinator.start();

  assert.deepEqual(order, [
    'world',
    'players',
    'market',
    'tick',
    'flush-task',
    'player-flush',
    'map-flush',
    'worker',
    'lease-sync',
  ]);
  assert.equal(barrier.isTrafficOpen(), true);
  const snapshot = status.getSnapshot();
  assert.equal(snapshot.ready, true);
  const recoveringPlayers = snapshot.phases.find((phase) => phase.phase === 'recovering_players');
  assert.deepEqual(recoveringPlayers?.metrics.offlineHangingPlayers, {
    enabled: true,
    expired: 1,
    candidates: 3,
    restored: 2,
    skipped: 1,
    skippedByReason: { lease_not_local: 1 },
  });

  console.log('[startup-lifecycle-coordinator-smoke] ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
