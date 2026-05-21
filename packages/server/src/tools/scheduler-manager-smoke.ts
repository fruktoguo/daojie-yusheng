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
