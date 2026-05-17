import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { RuntimeGmStateService } from '../runtime/gm/runtime-gm-state.service';

async function main(): Promise<void> {
  const service = new RuntimeGmStateService({} as never, {} as never, {} as never, {} as never, {} as never);

  const first = await service.triggerManualGc() as Record<string, any>;
  assert.equal(first.ok, true);
  assert.equal(typeof first.durationMs, 'number');
  assert.equal(typeof first.before?.heapUsedBytes, 'number');
  assert.equal(typeof first.after?.heapUsedBytes, 'number');
  assert.equal(typeof first.delta?.heapUsedBytes, 'number');
  assert.equal(first.cooldownMs, 60_000);

  const second = await service.triggerManualGc() as Record<string, any>;
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'cooldown');
  assert.equal(typeof second.cooldownRemainingMs, 'number');

  console.log(JSON.stringify({
    ok: true,
    first: {
      durationMs: first.durationMs,
      heapUsedDeltaBytes: first.delta.heapUsedBytes,
      rssDeltaBytes: first.delta.rssBytes,
    },
    second: {
      reason: second.reason,
      cooldownRemainingMs: second.cooldownRemainingMs,
    },
    answers:
      'GM 手动 GC 可触发一次受控 full GC，并返回前后内存差值；连续触发会被 60 秒冷却拦截。',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
