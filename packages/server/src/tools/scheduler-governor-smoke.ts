import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import os from 'node:os';

import { SchedulerGovernorService } from '../scheduler/scheduler-governor.service';

async function main(): Promise<void> {
  const originalAvailableParallelism = os.availableParallelism;
  const governor = new SchedulerGovernorService({
    getSnapshot() {
      return {
        pgPools: { flush: { waitingCount: 3 } },
        pgLockWait: { waitingCount: 1 },
        player: { dirtyPlayerCount: 80 },
        map: { dirtyInstanceCount: 40 },
      };
    },
  } as never);

  const snapshot = governor.getSnapshot();
  assert.equal(snapshot.flushPoolWaiting, 3);
  assert.equal(snapshot.lockWaitCount, 1);
  assert.equal(snapshot.backlogCount, 120);
  assert.equal(snapshot.backlogPressureLevel === 'high' || snapshot.backlogPressureLevel === 'critical', true);

  const lowPriorityDecision = governor.evaluate({
    id: 'maintenance-smoke',
    kind: 'maintenance',
    scope: 'global',
    enabled: true,
    priority: 'low',
  });
  assert.equal(lowPriorityDecision.allow, false);
  assert.ok(lowPriorityDecision.reason);

  const highPriorityDecision = governor.evaluate({
    id: 'tick-smoke',
    kind: 'tick',
    scope: 'global',
    enabled: true,
    priority: 'high',
  });
  assert.equal(highPriorityDecision.allow, true);

  try {
    Object.defineProperty(os, 'availableParallelism', {
      value: () => 2,
      configurable: true,
    });
    const lowPressureGovernor = new SchedulerGovernorService({
      getSnapshot() {
        return {
          pgPools: { flush: { waitingCount: 0 } },
          pgLockWait: { waitingCount: 0 },
          player: { dirtyPlayerCount: 0 },
          map: { dirtyInstanceCount: 0 },
        };
      },
    } as never);
    const lowPressureDecision = lowPressureGovernor.evaluate({
      id: 'database-backup',
      kind: 'maintenance',
      scope: 'node',
      enabled: true,
      priority: 'low',
    });
    assert.equal(lowPressureDecision.allow, true);
    assert.equal(lowPressureDecision.snapshot.availableParallelism, 2);
    assert.equal(lowPressureDecision.snapshot.backlogPressureLevel, 'low');

    const mediumPressureGovernor = new SchedulerGovernorService({
      getSnapshot() {
        return {
          pgPools: { flush: { waitingCount: 0 } },
          pgLockWait: { waitingCount: 0 },
          player: { dirtyPlayerCount: 60 },
          map: { dirtyInstanceCount: 0 },
        };
      },
    } as never);
    const mediumPressureDecision = mediumPressureGovernor.evaluate({
      id: 'database-backup',
      kind: 'maintenance',
      scope: 'node',
      enabled: true,
      priority: 'low',
    });
    assert.equal(mediumPressureDecision.allow, false);
    assert.equal(mediumPressureDecision.reason, 'cpu_budget_exhausted');
    assert.equal(mediumPressureDecision.snapshot.backlogPressureLevel, 'medium');
  } finally {
    Object.defineProperty(os, 'availableParallelism', {
      value: originalAvailableParallelism,
      configurable: true,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    answers: 'SchedulerGovernor 能读取 flush pool waiting、PG lock wait、backlog 与 CPU 预算；2 核低压力允许低优先级维护任务运行，非低压力继续反压。',
    excludes: '不证明 GM 页面已接入完整 governor 文本展示，也不证明真实生产阈值已调优。',
    completionMapping: 'scheduler-governor:phase3',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
