import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NativeGmWorkerService } from '../http/native/native-gm-worker.service';

async function main(): Promise<void> {
  const service = new NativeGmWorkerService(
    {
      isEnabled(): boolean { return true; },
      listInstanceBacklogSummary(): Promise<Array<Record<string, unknown>>> { return Promise.resolve([]); },
      listInstanceRecentThroughputSummary(): Promise<Array<Record<string, unknown>>> { return Promise.resolve([]); },
      listRecentThroughputSummary(): Promise<Array<Record<string, unknown>>> { return Promise.resolve([]); },
    } as never,
    {
      getSnapshot() {
        return {
          pgPools: {
            runtimeCritical: null,
            flush: { totalCount: 5, idleCount: 5, waitingCount: 4 },
            outbox: null,
            gmDiagnostics: null,
          },
          pgLockWait: null,
          player: null,
          map: null,
          failures: { total: 0, byCategory: {}, byDomain: {} },
        };
      },
      getPlayerStats() { return null; },
      getMapStats() { return null; },
    } as never,
    {
      isEnabled(): boolean { return true; },
      listBacklogSummary(): Promise<Array<Record<string, unknown>>> { return Promise.resolve([]); },
      listRecentThroughputSummary(): Promise<Array<Record<string, unknown>>> { return Promise.resolve([]); },
    } as never,
    {
      isEnabled(): boolean { return true; },
      listRecentThroughputSummary(): Promise<Record<string, unknown>> { return Promise.resolve({}); },
      listRetryQueue(): Promise<Array<Record<string, unknown>>> { return Promise.resolve([]); },
    } as never,
    {
      getDatabaseState() {
        return Promise.resolve({ automation: { schedulesActive: true } });
      },
    } as never,
    {
      listWorkerStates() {
        return [{ id: 'outbox-dispatcher', enabled: true, running: false, lastHeartbeatAt: null, lastSuccessAt: null, lastFailureAt: null, lastFailure: null, processedCount: 0 }];
      },
    } as never,
    {
      getSnapshot() {
        return {
          initialized: true,
          stopping: false,
          barrier: { workerOpen: true },
          tasks: [],
          governor: { availableParallelism: 16, cpuReserve: 14, flushPoolWaiting: 0, lockWaitCount: 0, backlogCount: 0, backlogPressureLevel: 'low' },
        };
      },
    } as never,
  );

  const state = await service.getWorkerState();
  assert.ok(state.scheduler);
  assert.equal(state.scheduler?.initialized, true);
  assert.equal(state.scheduler?.governor?.availableParallelism, 16);
  assert.equal(state.sources.backgroundWorkerCount, 1);
  assert.equal(state.capacity.pgPools?.flush?.waitingCount, 0);
  assert.equal(state.alerts.some((alert) => alert.reason === 'db_backpressure'), false);

  console.log(JSON.stringify({
    ok: true,
    answers: 'GM worker 面板已可透出统一 scheduler 快照，包含任务状态与 governor/反压摘要。',
    excludes: '不证明前端页面已渲染这些字段，也不证明真实生产阈值调优完成。',
    completionMapping: 'gm-worker-scheduler-snapshot',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
