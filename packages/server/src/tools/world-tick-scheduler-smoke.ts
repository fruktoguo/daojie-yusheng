import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { SchedulerManagerService } from '../scheduler/scheduler-manager.service';
import { SchedulerRegistryService } from '../scheduler/scheduler-registry.service';
import { SchedulerStateService } from '../scheduler/scheduler-state.service';
import { WorldTickService } from '../runtime/tick/world-tick.service';

async function main(): Promise<void> {
  const barrier = new StartupBarrierService();
  const scheduler = new SchedulerManagerService(new SchedulerRegistryService(), new SchedulerStateService(), undefined, undefined, barrier);
  await scheduler.initialize();
  barrier.openTick();

  const service = new WorldTickService(
    { flushTick(): void {} },
    { isRuntimeMaintenanceActive(): boolean { return false; } },
    { getMapTickSpeed(): number { return 1; }, isMapPaused(): boolean { return false; } },
    { advanceFrame(): Promise<void> { return Promise.resolve(); }, recordSyncFlushDuration(): void {} },
    { flushConnectedPlayers(): Promise<void> { return Promise.resolve(); } },
    barrier,
    scheduler,
  );

  service.onModuleInit();
  service.startForLifecycleCoordinator();

  const started = scheduler.getSnapshot();
  const tickTask = started.tasks.find((task) => task.id === 'world-tick');
  assert.ok(tickTask);
  assert.equal(tickTask?.kind, 'tick');
  assert.equal(tickTask?.status, 'idle');

  await service.stopForShutdown();
  const stopped = scheduler.getSnapshot().tasks.find((task) => task.id === 'world-tick');
  assert.equal(stopped?.status, 'paused');

  console.log(JSON.stringify({
    ok: true,
    answers: '世界 Tick 已能向 SchedulerManager 注册并在 stopForShutdown/onModuleDestroy 时进入 paused 状态，满足 Phase 2 的启动/停止接入要求。',
    excludes: '不证明实际帧推进、慢帧追踪或 GM 调速策略已迁移到 SchedulerManager。',
    completionMapping: 'world-tick-scheduler-adapter',
  }, null, 2));

  service.onModuleDestroy();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
