import assert from 'node:assert/strict';

import { ServerLifecycleCoordinatorService } from '../lifecycle/server-lifecycle-coordinator.service';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { StartupStatusService } from '../lifecycle/startup-status.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  await assertAllRoleStartupOrder();
  await assertWorkerRoleStartsFlushConsumer();
  console.log('[startup-lifecycle-coordinator-smoke] ok');
}

async function assertAllRoleStartupOrder(): Promise<void> {
  process.env.SERVER_RUNTIME_ROLE = 'all';

  const status = new StartupStatusService();
  const barrier = new StartupBarrierService();
  const order: string[] = [];
  const instanceId = 'real:startup_lifecycle_smoke';

  const worldRuntimeService = {
    async rebuildPersistentRuntimeAfterRestore(options: {
      restoreOfflinePlayers?: boolean;
      restoreInstanceDomains?: boolean;
      restoreCatalogInstances?: boolean;
      rewriteCatalogRuntimeStatus?: boolean;
    }) {
      order.push('world');
      assert.equal(options.restoreOfflinePlayers, false);
      assert.equal(options.restoreInstanceDomains, true);
      assert.equal(options.restoreCatalogInstances, true);
      assert.equal(options.rewriteCatalogRuntimeStatus, true);
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
        skippedPlayers: [
          {
            playerId: 'player:blocked',
            targetInstanceId: instanceId,
            reason: 'lease_not_local',
          },
        ],
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
  const recoveringWorld = snapshot.phases.find((phase) => phase.phase === 'recovering_world');
  assert.equal(recoveringWorld?.metrics.instanceDomainRestoreMode, 'eager');
  const offlineHangingPlayers = recoveringPlayers?.metrics.offlineHangingPlayers as any;
  assert.equal(offlineHangingPlayers.enabled, true);
  assert.equal(offlineHangingPlayers.expired, 1);
  assert.equal(offlineHangingPlayers.candidates, 3);
  assert.equal(offlineHangingPlayers.restored, 2);
  assert.equal(offlineHangingPlayers.skipped, 1);
  assert.deepEqual(offlineHangingPlayers.skippedByReason, { lease_not_local: 1 });
  assert.equal(offlineHangingPlayers.skippedPlayers[0]?.startupRunId, snapshot.startupRunId);
  assert.equal(offlineHangingPlayers.skippedPlayers[0]?.targetInstanceId, instanceId);

  delete process.env.SERVER_RUNTIME_ROLE;
}

async function assertWorkerRoleStartsFlushConsumer(): Promise<void> {
  process.env.SERVER_RUNTIME_ROLE = 'worker';

  const status = new StartupStatusService();
  const barrier = new StartupBarrierService();
  const order: string[] = [];

  const backgroundWorkerRuntimeService = {
    startForLifecycleCoordinator() {
      order.push('worker');
      assert.equal(barrier.isOutboxOpen(), true);
      assert.equal(barrier.isWorkerOpen(), true);
    },
  };

  const coordinator = new ServerLifecycleCoordinatorService(
    status,
    barrier,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    backgroundWorkerRuntimeService as never,
    undefined,
  );

  await coordinator.start();

  // worker 角色不调用 flushTaskRuntimeService.startForLifecycleCoordinator（它是 no-op），
  // flush 消费由 BackgroundWorkerRuntimeService 的 timer 通过 schedulerManager.runTask 驱动。
  assert.deepEqual(order, ['worker']);
  assert.equal(barrier.isTrafficOpen(), false);
  assert.equal(barrier.isWorkerOpen(), true);
  assert.equal(status.getSnapshot().ready, true);
  delete process.env.SERVER_RUNTIME_ROLE;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
