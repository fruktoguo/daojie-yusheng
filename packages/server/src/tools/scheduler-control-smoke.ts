import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NativeGmAdminController } from '../http/native/native-gm-admin.controller';
import { NativeGmAdminService } from '../http/native/native-gm-admin.service';
import { NativeGmDiagnosticsService } from '../http/native/native-gm-diagnostics.service';
import { NativeGmWorkerService } from '../http/native/native-gm-worker.service';
import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { SchedulerGovernorService } from '../scheduler/scheduler-governor.service';
import { SchedulerManagerService } from '../scheduler/scheduler-manager.service';
import { SchedulerRegistryService } from '../scheduler/scheduler-registry.service';
import { SchedulerStateService } from '../scheduler/scheduler-state.service';

async function main(): Promise<void> {
  const persistedSnapshot = {
    initialized: true,
    stopping: false,
    barrier: { workerOpen: true },
    tasks: [
      {
        id: 'restored-task',
        kind: 'maintenance',
        scope: 'global',
        priority: 'normal',
        enabled: true,
        running: false,
        paused: true,
        status: 'paused',
        lastHeartbeatAt: '2026-05-22T00:00:00.000Z',
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailure: null,
        processedCount: 7,
        nextRunAt: null,
        backlogCount: 0,
        lastDurationMs: 12,
        runCount: 3,
        failureCount: 0,
      },
    ],
    governor: null,
  };
  let savedSnapshot: unknown = null;
  const persistence = {
    loadSnapshot: async () => persistedSnapshot,
    saveSnapshot: async (snapshot: unknown) => { savedSnapshot = snapshot; },
  } as never;
  const governor = new SchedulerGovernorService({ getSnapshot() { return { pgPools: null, pgLockWait: null, player: null, map: null }; } } as never);
  const manager = new SchedulerManagerService(new SchedulerRegistryService(), new SchedulerStateService(), governor, persistence, new StartupBarrierService());
  await manager.initialize({ barrier: { workerOpen: true } });
  let snapshot = manager.getSnapshot();
  assert.equal(snapshot.tasks.some((task) => task.id === 'restored-task' && task.paused === true), true);

  manager.registerTask({
    id: 'control-task',
    kind: 'maintenance',
    scope: 'global',
    enabled: true,
    priority: 'normal',
    intervalMs: 1_000,
    leaderMode: 'single',
  }, async () => 2);
  assert.equal(await manager.triggerTask('control-task'), 2);
  assert.equal(manager.setPaused('control-task', true), true);
  assert.equal(await manager.triggerTask('control-task'), 0);
  assert.equal(manager.setPaused('control-task', false), true);
  assert.equal(manager.setEnabled('control-task', false), true);
  assert.equal(await manager.triggerTask('control-task'), 0);
  assert.equal(manager.setEnabled('control-task', true), true);
  assert.equal(await manager.triggerTask('control-task'), 2);

  const controller = new NativeGmAdminController(
    { getDatabaseState: async () => ({}) } as never,
    { getWorkerState: async () => ({}) } as never,
    { executeQuery: async () => ({}) } as never,
    manager,
  );
  assert.equal(controller.pauseSchedulerTask('control-task').ok, true);
  assert.equal(controller.resumeSchedulerTask('control-task').ok, true);
  assert.equal(controller.disableSchedulerTask('control-task').ok, true);
  assert.equal(controller.enableSchedulerTask('control-task').ok, true);
  assert.equal((await controller.triggerSchedulerTask('control-task')).processedCount, 2);
  const drained = controller.drainScheduler();
  assert.equal(drained.stopping, true);

  snapshot = manager.getSnapshot();
  assert.equal(snapshot.tasks.some((task) => task.id === 'control-task'), true);
  assert.equal(Boolean(savedSnapshot), true);

  console.log(JSON.stringify({
    ok: true,
    answers: 'Scheduler state 可从持久化快照恢复，且 GM 控制面已能暂停/恢复/启用/禁用/手动触发/排空 scheduler 任务。',
    excludes: '不证明真实数据库表已在生产环境写满历史快照，也不证明前端 UI 组件已完成交互渲染。',
    completionMapping: 'scheduler-control:phase4',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
