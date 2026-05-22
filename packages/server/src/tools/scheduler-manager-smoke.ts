import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { SchedulerManagerService } from '../scheduler/scheduler-manager.service';
import { SchedulerRegistryService } from '../scheduler/scheduler-registry.service';
import { SchedulerStateService } from '../scheduler/scheduler-state.service';

async function main(): Promise<void> {
  const barrier = new StartupBarrierService();
  const registry = new SchedulerRegistryService();
  const state = new SchedulerStateService();
  const manager = new SchedulerManagerService(registry, state, undefined, undefined, barrier);

  manager.onModuleInit();
  barrier.resetForStartup();
  const initial = await manager.initialize();
  assert.equal(initial.initialized, true);
  assert.equal(initial.barrier?.workerOpen, false);

  manager.registerTask({
    id: 'scheduler-smoke-task',
    kind: 'maintenance',
    scope: 'global',
    enabled: true,
    priority: 'normal',
    intervalMs: 1_000,
    timeoutMs: 5_000,
    maxConcurrency: 1,
    leaderMode: 'single',
  });
  assert.equal(manager.listTasks().length, 1);

  let calls = 0;
  const processed = await manager.runTask('scheduler-smoke-task', async () => {
    calls += 1;
    return { processedCount: 3, nextRunAt: Date.now() + 1_000 };
  });
  assert.equal(processed, 3);
  assert.equal(calls, 1);
  let taskState = manager.getSnapshot().tasks.find((task) => task.id === 'scheduler-smoke-task');
  assert.ok(taskState);
  assert.equal(taskState.processedCount, 3);
  assert.equal(taskState.runCount, 1);
  assert.equal(taskState.lastFailure, null);
  assert.ok(taskState.nextRunAt);

  assert.equal(manager.setPaused('scheduler-smoke-task', true), true);
  const skipped = await manager.runTask('scheduler-smoke-task', async () => 1);
  assert.equal(skipped, 0);
  taskState = manager.getSnapshot().tasks.find((task) => task.id === 'scheduler-smoke-task');
  assert.equal(taskState?.status, 'paused');

  assert.equal(manager.setPaused('scheduler-smoke-task', false), true);
  await assert.rejects(
    () => manager.runTask('scheduler-smoke-task', async () => {
      throw new Error('scheduler_smoke_failure');
    }),
    /scheduler_smoke_failure/,
  );
  taskState = manager.getSnapshot().tasks.find((task) => task.id === 'scheduler-smoke-task');
  assert.equal(taskState?.failureCount, 1);
  assert.equal(taskState?.lastFailure, 'scheduler_smoke_failure');

  barrier.openWorker();
  const withWorkerOpen = manager.refreshBarrierSnapshot();
  assert.equal(withWorkerOpen.barrier?.workerOpen, true);

  const stopping = manager.stop('smoke_done');
  assert.equal(stopping.stopping, true);

  // 回归测试：恢复持久化 snapshot 时不能继承 running=true / stopping=true。
  // 否则 worker 进程被 SIGKILL 后下次启动 beginRun 会永久拒绝该任务，导致 flush 死锁。
  const recoveryState = new SchedulerStateService();
  recoveryState.restoreFromSnapshot({
    initialized: true,
    stopping: true,
    barrier: null,
    tasks: [
      {
        id: 'flush-task-consumer',
        kind: 'flush',
        scope: 'global',
        priority: 'high',
        enabled: true,
        running: true,
        paused: false,
        status: 'running',
        lastHeartbeatAt: '2026-05-22T14:17:11.822Z',
        lastSuccessAt: '2026-05-22T14:17:10.025Z',
        lastFailureAt: '2026-05-22T14:17:05.941Z',
        lastFailure: null,
        processedCount: 110,
        nextRunAt: null,
        backlogCount: 0,
        lastDurationMs: 204,
        runCount: 693,
        failureCount: 231,
      },
    ],
  });
  const recoveredManager = new SchedulerManagerService(
    new SchedulerRegistryService(),
    recoveryState,
    undefined,
    undefined,
    new StartupBarrierService(),
  );
  recoveredManager.registerTask({
    id: 'flush-task-consumer',
    kind: 'flush',
    scope: 'global',
    enabled: true,
    priority: 'high',
    intervalMs: 2_000,
    maxConcurrency: 1,
    leaderMode: 'claim',
  });
  let recoveredCalls = 0;
  const recoveredProcessed = await recoveredManager.runTask('flush-task-consumer', async () => {
    recoveredCalls += 1;
    return 7;
  });
  assert.equal(recoveredCalls, 1, 'restoreFromSnapshot 必须重置 running，否则 beginRun 会拒绝调度导致积压无法消费');
  assert.equal(recoveredProcessed, 7);
  const recoveredTaskState = recoveredManager.getSnapshot().tasks.find((task) => task.id === 'flush-task-consumer');
  assert.ok(recoveredTaskState);
  assert.equal(recoveredTaskState.runCount, 694, '历史 runCount 应保留');
  assert.equal(recoveredTaskState.processedCount, 117, '历史 processedCount 应保留');
  assert.equal(recoveredTaskState.failureCount, 231, '历史 failureCount 应保留');

  console.log(JSON.stringify({
    ok: true,
    taskCount: stopping.tasks.length,
    processedCount: taskState?.processedCount ?? 0,
    failureCount: taskState?.failureCount ?? 0,
    answers: 'SchedulerManager Phase 1 骨架已验证：registry 注册、state 初始化、StartupBarrier 快照、单飞执行、pause 跳过、失败记录、停止状态。',
    excludes: '不证明 Phase 2 之后的真实 tick/flush/outbox 迁移、DB state store、GM 控制面或多节点 leader 语义。',
    completionMapping: 'scheduler-manager:phase1',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
