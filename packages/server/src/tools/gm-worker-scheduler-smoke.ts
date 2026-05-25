import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NativeGmWorkerService } from '../http/native/native-gm-worker.service';
import type { SchedulerTaskRuntimeState } from '../scheduler/scheduler.types';

async function main(): Promise<void> {
  const service = new NativeGmWorkerService(
    {
      isEnabled(): boolean { return true; },
      listInstanceBacklogSummary(): Promise<Array<Record<string, unknown>>> { return Promise.resolve([]); },
      listInstanceRecentThroughputSummary(): Promise<Array<Record<string, unknown>>> { return Promise.resolve([]); },
      listRecentThroughputSummary(): Promise<Array<Record<string, unknown>>> { return Promise.resolve([]); },
      listPlayerStalePayloadCountByDomain(): Promise<Map<string, number>> { return Promise.resolve(new Map()); },
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
          tasks: [taskState({ id: 'world-tick', kind: 'tick', lastHeartbeatAt: '2026-05-25T08:00:02.000Z', lastSuccessAt: '2026-05-25T08:00:02.000Z', processedCount: 2, runCount: 2 })],
          governor: { availableParallelism: 16, cpuReserve: 14, flushPoolWaiting: 0, lockWaitCount: 0, backlogCount: 0, backlogPressureLevel: 'low' },
        };
      },
    } as never,
    {
      listRecentSnapshots() {
        return Promise.resolve([
          {
            stateKey: 'scheduler_snapshot:api:test',
            nodeId: 'node:api',
            runtimeRole: 'api',
            processId: 101,
            updatedAt: '2026-05-25T08:00:02.000Z',
            snapshot: {
              initialized: true,
              stopping: false,
              barrier: { tickOpen: true, workerOpen: false },
              tasks: [
                taskState({ id: 'world-tick', kind: 'tick', lastHeartbeatAt: '2026-05-25T08:00:02.000Z', lastSuccessAt: '2026-05-25T08:00:02.000Z', processedCount: 2, runCount: 2 }),
                taskState({ id: 'outbox-dispatcher', kind: 'outbox', enabled: false, status: 'disabled', priority: 'high' }),
              ],
              governor: { availableParallelism: 16, cpuReserve: 14, flushPoolWaiting: 0, lockWaitCount: 0, backlogCount: 0, backlogPressureLevel: 'low' },
            },
          },
          {
            stateKey: 'scheduler_snapshot:worker:test',
            nodeId: 'node:worker',
            runtimeRole: 'worker',
            processId: 202,
            updatedAt: '2026-05-25T08:00:03.000Z',
            snapshot: {
              initialized: true,
              stopping: false,
              barrier: { tickOpen: false, workerOpen: true },
              tasks: [
                taskState({ id: 'flush-task-consumer', kind: 'flush', lastHeartbeatAt: '2026-05-25T08:00:03.000Z', lastSuccessAt: '2026-05-25T08:00:03.000Z', processedCount: 7, runCount: 3, lastDurationMs: 20 }),
                taskState({ id: 'outbox-dispatcher', kind: 'outbox', lastHeartbeatAt: '2026-05-25T08:00:03.000Z', lastSuccessAt: '2026-05-25T08:00:03.000Z', processedCount: 1, runCount: 4, lastDurationMs: 3 }),
              ],
              governor: { availableParallelism: 2, cpuReserve: 1, flushPoolWaiting: 1, lockWaitCount: 2, backlogCount: 3, backlogPressureLevel: 'high' },
            },
          },
        ]);
      },
    } as never,
  );

  const state = await service.getWorkerState();
  assert.ok(state.scheduler);
  assert.equal(state.scheduler.initialized, true);
  assert.equal(state.scheduler.governor?.availableParallelism, 18);
  assert.equal(state.scheduler.governor?.lockWaitCount, 2);
  assert.equal(state.scheduler.tasks.some((task) => task.id === 'flush-task-consumer' && task.runtimeRole === 'worker'), true);
  assert.equal(state.scheduler.tasks.some((task) => task.id === 'outbox-dispatcher' && task.enabled === true && task.runtimeRole === 'worker'), true);
  assert.equal(state.scheduler.tasks.some((task) => task.id === 'world-tick' && task.runtimeRole === 'api'), true);
  assert.equal(state.sources.backgroundWorkerCount, 1);
  assert.equal(state.capacity?.pgPools?.flush?.waitingCount, 0);
  assert.equal(state.alerts.some((alert) => alert.reason === 'db_backpressure'), false);

  console.log(JSON.stringify({
    ok: true,
    answers: 'GM worker 面板已可聚合多进程 scheduler 快照，API 的 disabled 任务不会覆盖 worker 的活跃任务。',
    excludes: '不证明真实生产阈值调优完成，也不直接提升 flush 写库吞吐。',
    completionMapping: 'gm-worker-scheduler-snapshot',
  }, null, 2));
}

function taskState(input: Partial<SchedulerTaskRuntimeState> & Pick<SchedulerTaskRuntimeState, 'id' | 'kind'>): SchedulerTaskRuntimeState {
  return {
    id: input.id,
    kind: input.kind,
    scope: input.scope ?? 'global',
    priority: input.priority ?? 'high',
    enabled: input.enabled ?? true,
    running: input.running ?? false,
    paused: input.paused ?? false,
    status: input.status ?? 'idle',
    lastHeartbeatAt: input.lastHeartbeatAt ?? null,
    lastSuccessAt: input.lastSuccessAt ?? null,
    lastFailureAt: input.lastFailureAt ?? null,
    lastFailure: input.lastFailure ?? null,
    processedCount: input.processedCount ?? 0,
    nextRunAt: input.nextRunAt ?? null,
    backlogCount: input.backlogCount ?? 0,
    lastDurationMs: input.lastDurationMs ?? 0,
    runCount: input.runCount ?? 0,
    failureCount: input.failureCount ?? 0,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
