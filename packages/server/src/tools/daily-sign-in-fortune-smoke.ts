import assert from 'node:assert/strict';

import { buildDailySignInFortune, buildDailySignInRewardPreview } from '../runtime/activity/activity-runtime.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

function main(): void {
  const day0 = buildDailySignInRewardPreview(40, 0, 0);
  const day100 = buildDailySignInRewardPreview(40, 0, 100);
  assert.equal(day0.baseRandomMaxMerit, 80);
  assert.equal(day0.randomMaxMerit, 800);
  assert.equal(day0.targetRandomMeanMerit, 40.5);
  assert.equal(Math.round(day100.targetRandomMeanMerit * 100) / 100, 60.25);
  assert.ok(day100.targetRandomMeanMerit < 80);

  assert.deepEqual(buildDailySignInFortune(1, day0), {
    tier: 'very_bad',
    ratioPercent: 0,
    luckDelta: -10,
    randomMerit: 1,
    baseRandomMaxMerit: 80,
    randomMaxMerit: 800,
  });
  assert.equal(buildDailySignInFortune(80, day0).tier, 'great');
  assert.equal(buildDailySignInFortune(80, day0).luckDelta, 20);
  assert.equal(buildDailySignInFortune(81, day0).tier, 'transcendent_1');
  assert.equal(buildDailySignInFortune(240, day0).tier, 'transcendent_2');
  assert.equal(buildDailySignInFortune(420, day0).tier, 'transcendent_3');
  assert.equal(buildDailySignInFortune(799, day0).tier, 'transcendent_4');
  assert.equal(buildDailySignInFortune(799, day0).luckDelta, 202);
  assert.equal(buildDailySignInFortune(800, day0).tier, 'perfect');
  assert.equal(buildDailySignInFortune(800, day0).luckDelta, 666);

  process.stdout.write(JSON.stringify({
    ok: true,
    case: 'daily-sign-in-fortune',
    baseMean: day0.targetRandomMeanMerit,
    day100Mean: day100.targetRandomMeanMerit,
    perfectLuckDelta: buildDailySignInFortune(800, day0).luckDelta,
  }, null, 2));
}

main();
