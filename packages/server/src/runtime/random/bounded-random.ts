/**
 * 服务端内部有界随机工具。
 *
 * 用于“扩大取值上界，但把长期均值锚定在原始目标均值”的奖励池。
 */
import { randomInt } from 'crypto';

const UNIT_RANDOM_SCALE = 0x1_0000_0000;
const EXPECTATION_EPSILON = 1e-9;
const GEOMETRIC_SOLVE_ITERATIONS = 80;

export interface ExpandedMeanIntegerRollOptions {
  min: number;
  max: number;
  targetMean: number;
  unitRandom?: () => number;
}

export interface TruncatedGeometricDistribution {
  min: number;
  max: number;
  targetMean: number;
  q: number;
  mirror: boolean;
  expectedMean: number;
}

export function rollUnitRandom(): number {
  return randomInt(0, UNIT_RANDOM_SCALE) / UNIT_RANDOM_SCALE;
}

export function buildTruncatedGeometricDistribution(
  min: number,
  max: number,
  targetMean: number,
): TruncatedGeometricDistribution {
  const normalizedMin = Math.trunc(Number(min));
  const normalizedMax = Math.trunc(Number(max));
  if (!Number.isFinite(normalizedMin) || !Number.isFinite(normalizedMax) || normalizedMax < normalizedMin) {
    throw new RangeError('随机区间必须是有效整数闭区间');
  }

  const normalizedTargetMean = Number(targetMean);
  if (!Number.isFinite(normalizedTargetMean) || normalizedTargetMean < normalizedMin || normalizedTargetMean > normalizedMax) {
    throw new RangeError('目标均值必须落在随机区间内');
  }

  const span = normalizedMax - normalizedMin;
  const targetOffsetMean = normalizedTargetMean - normalizedMin;
  if (span === 0 || targetOffsetMean <= EXPECTATION_EPSILON) {
    return { min: normalizedMin, max: normalizedMax, targetMean: normalizedTargetMean, q: 0, mirror: false, expectedMean: normalizedMin };
  }
  if (Math.abs(targetOffsetMean - span) <= EXPECTATION_EPSILON) {
    return { min: normalizedMin, max: normalizedMax, targetMean: normalizedTargetMean, q: 0, mirror: true, expectedMean: normalizedMax };
  }
  if (Math.abs(targetOffsetMean - span / 2) <= EXPECTATION_EPSILON) {
    return { min: normalizedMin, max: normalizedMax, targetMean: normalizedTargetMean, q: 1, mirror: false, expectedMean: normalizedTargetMean };
  }

  const mirror = targetOffsetMean > span / 2;
  const solvedOffsetMean = mirror ? span - targetOffsetMean : targetOffsetMean;
  let low = 0;
  let high = 1;
  for (let i = 0; i < GEOMETRIC_SOLVE_ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    const mean = truncatedGeometricOffsetMean(span, mid);
    if (mean < solvedOffsetMean) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const q = (low + high) / 2;
  const expectedOffsetMean = truncatedGeometricOffsetMean(span, q);
  return {
    min: normalizedMin,
    max: normalizedMax,
    targetMean: normalizedTargetMean,
    q,
    mirror,
    expectedMean: normalizedMin + (mirror ? span - expectedOffsetMean : expectedOffsetMean),
  };
}

export function rollExpandedMeanInteger(options: ExpandedMeanIntegerRollOptions): number {
  const distribution = buildTruncatedGeometricDistribution(options.min, options.max, options.targetMean);
  if (distribution.min === distribution.max || distribution.q === 0) {
    return distribution.min;
  }

  const u = clampUnitRandom((options.unitRandom ?? rollUnitRandom)());
  if (distribution.q === 1) {
    return distribution.min + Math.min(distribution.max - distribution.min, Math.floor(u * (distribution.max - distribution.min + 1)));
  }

  const span = distribution.max - distribution.min;
  const totalWeight = geometricWeightSum(span, distribution.q);
  let threshold = u * totalWeight;
  let weight = 1;
  for (let offset = 0; offset <= span; offset += 1) {
    threshold -= weight;
    if (threshold <= 0 || offset === span) {
      return distribution.min + (distribution.mirror ? span - offset : offset);
    }
    weight *= distribution.q;
  }

  return distribution.mirror ? distribution.min : distribution.max;
}

function clampUnitRandom(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(value, 1 - Number.EPSILON);
}

function geometricWeightSum(span: number, q: number): number {
  if (q === 1) {
    return span + 1;
  }
  return (1 - q ** (span + 1)) / (1 - q);
}

function truncatedGeometricOffsetMean(span: number, q: number): number {
  if (q <= 0) {
    return 0;
  }
  if (q === 1) {
    return span / 2;
  }

  const qToNPlusOne = q ** (span + 1);
  const qToNPlusTwo = qToNPlusOne * q;
  const numerator = q - (span + 1) * qToNPlusOne + span * qToNPlusTwo;
  const denominator = (1 - q) * (1 - qToNPlusOne);
  return numerator / denominator;
}
