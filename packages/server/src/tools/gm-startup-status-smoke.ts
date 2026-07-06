import assert from 'node:assert/strict';

import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { StartupStatusService } from '../lifecycle/startup-status.service';
import { NativeGmStateQueryService } from '../http/native/native-gm-state-query.service';
import { RuntimeGmStateService } from '../runtime/gm/runtime-gm-state.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const startupStatus = new StartupStatusService();
  const startupBarrier = new StartupBarrierService();
  startupStatus.beginPhase('preparing', 'gm_startup_status_smoke');
  startupStatus.completePhase('preparing', { checkedBy: 'gm-startup-status-smoke' });
  startupStatus.beginPhase('ready', 'gm_startup_ready');
  startupBarrier.openTraffic();
  startupBarrier.openTick();
  startupStatus.markReady('gm_startup_ready', { trafficOpen: true });

  const service = new RuntimeGmStateService(
    { listSummaries: () => [] } as never,
    { listPlayerSnapshots: () => [] } as never,
    { getRuntimeSummary: () => ({ lastTickDurationMs: 0 }) } as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    startupStatus,
    undefined,
    startupBarrier,
  );

  const state = service.buildState() as {
    perf?: {
      startup?: {
        phase?: string;
        ready?: boolean;
        reason?: string;
        barrier?: { trafficOpen?: boolean; tickOpen?: boolean } | null;
      } | null;
    };
  };
  assert.equal(state.perf?.startup?.phase, 'ready');
  assert.equal(state.perf?.startup?.ready, true);
  assert.equal(state.perf?.startup?.reason, 'gm_startup_ready');
  assert.equal(state.perf?.startup?.barrier?.trafficOpen, true);
  assert.equal(state.perf?.startup?.barrier?.tickOpen, true);

  const queryService = new NativeGmStateQueryService(
    { getManagedAccountIndex: async () => new Map() } as never,
    {
      buildPerformanceSnapshot: () => ({ cpu: {}, pathfinding: {}, memoryMb: 1, tickMs: 0 }),
      buildSharedGmStatePerf: () => ({ workerCount: 0, runningWorkers: 0, idleWorkers: 0 }),
    } as never,
    {
      listSummaries: () => [{ id: 'yunlai_town', name: '云来镇' }],
      getOrThrow: () => ({ name: '云来镇' }),
    } as never,
    { listProjectedSnapshots: async () => [] } as never,
    { createRealmStateFromLevel: () => ({ realmLv: 1, displayName: '凡胎' }) } as never,
    {
      listGmPlayerSummaries: () => [{
        playerId: 'gm-state-query-player',
        name: 'GM 状态烟测',
        displayName: 'GM 状态烟测',
        sessionId: 'session:gm-state-query-player',
        instanceId: 'public:yunlai_town',
        persistentRevision: 1,
        persistedRevision: 1,
        templateId: 'yunlai_town',
        realm: { realmLv: 1, displayName: '凡胎' },
        x: 1,
        y: 2,
        hp: 10,
        maxHp: 10,
        qi: 3,
        combat: { autoBattle: false, autoBattleStationary: false, autoRetaliate: true },
      }],
      buildStarterPersistenceSnapshot: () => null,
    } as never,
    { getPool: () => null } as never,
  );

  const fullState = await queryService.getState({ includePlayers: '1', page: 1, pageSize: 5, sort: 'name' }, {
    networkPerfStartedAt: 0,
    cpuPerfStartedAt: 0,
    pathfindingPerfStartedAt: 0,
  });
  assert.deepEqual(fullState.mapIds, ['yunlai_town']);
  assert.equal(fullState.players.length, 1);
  assert.equal(fullState.playerPage.pageSize, 5);
  assert.equal(fullState.playerStats.totalPlayers, 1);

  console.log(JSON.stringify({ ok: true, case: 'gm-startup-status' }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
