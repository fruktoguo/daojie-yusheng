/**
 * 有界随机工具 smoke。
 * 覆盖扩大上界后仍保持目标均值的离散分布参数和边界行为。
 */
import { strict as assert } from 'node:assert';

import { buildTruncatedGeometricDistribution, rollExpandedMeanInteger } from '../runtime/random/bounded-random';

function main(): void {
  const distribution = buildTruncatedGeometricDistribution(1, 820, 41.5);
  assert.equal(distribution.min, 1);
  assert.equal(distribution.max, 820);
  assert.equal(distribution.targetMean, 41.5);
  assert.equal(distribution.mirror, false);
  assert.ok(distribution.q > 0 && distribution.q < 1);
  assert.ok(Math.abs(distribution.expectedMean - 41.5) < 1e-6);

  assert.equal(rollExpandedMeanInteger({ min: 1, max: 820, targetMean: 41.5, unitRandom: () => 0 }), 1);
  assert.equal(rollExpandedMeanInteger({ min: 1, max: 820, targetMean: 41.5, unitRandom: () => 1 }), 820);

  const mirrored = buildTruncatedGeometricDistribution(1, 10, 8);
  assert.equal(mirrored.mirror, true);
  assert.ok(Math.abs(mirrored.expectedMean - 8) < 1e-6);
  assert.equal(rollExpandedMeanInteger({ min: 1, max: 10, targetMean: 8, unitRandom: () => 0 }), 10);

  process.stdout.write(JSON.stringify({
    ok: true,
    case: 'bounded-random',
    signInRange: [distribution.min, distribution.max],
    signInExpectedMean: distribution.expectedMean,
  }));
}

main();
