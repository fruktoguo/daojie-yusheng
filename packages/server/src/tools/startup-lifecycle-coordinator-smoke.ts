import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ServerLifecycleCoordinatorService } from '../lifecycle/server-lifecycle-coordinator.service';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { StartupStatusService } from '../lifecycle/startup-status.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  await assertAllRoleStartupOrder();
  await assertWorkerRoleStartsFlushConsumer();
  await assertStartupFailureDrainsBeforeNestDestroy();
  assertBootstrapEntryHandlesRejectedStartup();
  console.log('[startup-lifecycle-coordinator-smoke] ok');
}

function assertBootstrapEntryHandlesRejectedStartup(): void {
  const source = readFileSync(resolve(process.cwd(), 'packages/server/src/bootstrap/server-application.ts'), 'utf8');
  const helperStart = source.indexOf('async function drainAndCloseBootstrapApplication');
  const helperEnd = source.indexOf('// ─── 全局未捕获异常兜底', helperStart);
  const helperSource = source.slice(helperStart, helperEnd);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.ok(
    helperSource.indexOf('lifecycleCoordinator.drain(reason)') < helperSource.indexOf('app.close()'),
    'Nest 上下文关闭前必须完成 lifecycle drain',
  );
  assert.match(source, /export async function startServerApplication\(\): Promise<void>/);
  assert.match(source, /await drainAndCloseBootstrapApplication\('startup_failed'\)/);
  assert.match(source, /abortOnError: false/);
}

async function assertStartupFailureDrainsBeforeNestDestroy(): Promise<void> {
  const previousRole = process.env.SERVER_RUNTIME_ROLE;
  process.env.SERVER_RUNTIME_ROLE = 'api';
  try {
    const status = new StartupStatusService();
    const barrier = new StartupBarrierService();
    const order: string[] = [];
    const coordinator = new ServerLifecycleCoordinatorService(
      status,
      barrier,
      {} as never,
      undefined,
      {
        async replayDurablePayloadsBeforeRecovery() {
          order.push('startup-replay');
          throw new Error('startup_replay_failed');
        },
      } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        async drain(reason: string) {
          order.push(`drain:${reason}`);
          assert.equal(barrier.isTrafficOpen(), false);
          return {};
        },
      } as never,
    );

    await assert.rejects(
      () => coordinator.onApplicationBootstrap(),
      /startup_replay_failed/,
    );
    assert.deepEqual(order, ['startup-replay', 'drain:startup_failed']);
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
  }
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
    }) {
      order.push('world');
      assert.equal(
        typeof (worldRuntimeService as { replayInstanceFlushPayloadsBeforeOwnershipChange?: unknown }).replayInstanceFlushPayloadsBeforeOwnershipChange,
        'function',
      );
      assert.equal(options.restoreOfflinePlayers, false);
      assert.equal(options.restoreInstanceDomains, true);
      assert.equal(options.restoreCatalogInstances, true);
      assert.equal('rewriteCatalogRuntimeStatus' in options, false);
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
    async replayDurablePayloadsBeforeRecovery() {
      order.push('payload-replay');
      assert.equal(barrier.isTickOpen(), false);
      assert.equal(barrier.isFlushOpen(), false);
      return 2;
    },
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
  (coordinator as unknown as {
    playerDomainPersistenceService?: { runPostReplayStartupMaintenance(): Promise<void> };
    timeChamberRuntimeService?: {
      prepareForWorldRecovery(): Promise<void>;
      applyRecoveredRuntimeState(runtime: unknown, options: { instanceDomainRestoreMode?: string }): Promise<void>;
    };
  }).playerDomainPersistenceService = {
    async runPostReplayStartupMaintenance() {
      order.push('post-replay-maintenance');
      assert.equal(barrier.isTickOpen(), false);
      assert.equal(barrier.isFlushOpen(), false);
    },
  };
  (coordinator as unknown as {
    timeChamberRuntimeService?: {
      prepareForWorldRecovery(): Promise<void>;
      applyRecoveredRuntimeState(runtime: unknown, options: { instanceDomainRestoreMode?: string }): Promise<void>;
    };
  }).timeChamberRuntimeService = {
    async prepareForWorldRecovery() {
      order.push('time-chamber-prepare');
    },
    async applyRecoveredRuntimeState(runtime, options) {
      assert.equal(runtime, worldRuntimeService);
      assert.equal(options.instanceDomainRestoreMode, 'eager');
      order.push('time-chamber-apply');
    },
  };

  await coordinator.start();

  assert.deepEqual(order, [
    'payload-replay',
    'post-replay-maintenance',
    'time-chamber-prepare',
    'world',
    'time-chamber-apply',
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

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') process.env[name] = value;
  else delete process.env[name];
}
