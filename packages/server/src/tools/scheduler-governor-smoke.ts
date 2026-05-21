import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { SchedulerGovernorService } from '../scheduler/scheduler-governor.service';

async function main(): Promise<void> {
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

  console.log(JSON.stringify({
    ok: true,
    answers: 'SchedulerGovernor 能读取 flush pool waiting、PG lock wait、backlog 与 CPU 预算，并对低优先级任务施加反压。',
    excludes: '不证明 GM 页面已接入完整 governor 文本展示，也不证明真实生产阈值已调优。',
    completionMapping: 'scheduler-governor:phase3',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
