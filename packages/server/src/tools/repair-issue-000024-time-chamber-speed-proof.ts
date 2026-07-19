import assert from 'node:assert/strict';

import { WorldRuntimeInstanceScheduleService } from '../runtime/world/world-runtime-instance-schedule.service';

const PROOF_MARKER = 'REPAIR_PROOF:ISSUE-000024:PASS';
const CHAMBER_INSTANCE_ID = 'time-chamber:repair-issue-000024';
const CHAMBER_SPEED = 7;
const BATCH_BREW_TICKS = 28;

function main(): void {
  const chamberInstance = {
    meta: {
      instanceId: CHAMBER_INSTANCE_ID,
      runtimeStatus: 'running',
      status: 'active',
    },
    tickSpeed: CHAMBER_SPEED,
    paused: false,
  };
  const schedule = new WorldRuntimeInstanceScheduleService();
  schedule.registerOrUpdate(CHAMBER_INSTANCE_ID, chamberInstance, 0);

  let scheduledSteps = 0;
  for (let elapsedSeconds = 1; elapsedSeconds <= 4; elapsedSeconds += 1) {
    const plans = schedule.collectDue(
      elapsedSeconds * 1_000 + 1,
      (instanceId) => instanceId === CHAMBER_INSTANCE_ID ? chamberInstance : null,
      () => true,
    );
    assert.equal(plans.length, 1, `第 ${elapsedSeconds} 秒必须生成密室推进计划`);
    assert.equal(plans[0].speed, CHAMBER_SPEED, '推进计划必须保留权威 7 倍流速');
    scheduledSteps += plans[0].steps;
  }

  assert.equal(
    scheduledSteps,
    BATCH_BREW_TICKS,
    `7 倍密室在 4 秒内应推进 ${BATCH_BREW_TICKS} 息，实际仅推进 ${scheduledSteps} 息`,
  );
  assert.equal(schedule.getDroppedLogicalStepCount(), 0, '一秒内的 7 倍逻辑息不应被过载保护永久丢弃');

  console.log(PROOF_MARKER);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
