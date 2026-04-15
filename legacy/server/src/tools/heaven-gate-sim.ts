/**
 * CLI 工具：离线模拟开天门随机结果，验证不同保留灵根数与 averageBonus 下的实际分布是否符合预期。
 *
 * 用法示例：
 * `pnpm --filter @mud/server build && node dist/tools/heaven-gate-sim.js --remaining=5 --bonus=20 --runs=10000`
 */
import { ELEMENT_KEYS, type ElementKey, type HeavenGateRootValues } from '@mud/shared';

interface Segment {
  min: number;
  max: number;
  weight: number;
}

interface CliOptions {
  remaining: number;
  bonus: number;
  runs: number;
  seed: number;
}

interface SimulationSummary {
  sampledAverageQuality: number;
  sampledTotalAverage: number;
  minTotal: number;
  maxTotal: number;
  averageTopRoot: number;
  averageBottomRoot: number;
  totalPerfectCount: number;
  anyPerfectRootCount: number;
  allRootsEqualCount: number;
}

/**
 * 记录heavengateaveragequalitysegments。
 */
const HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS: Record<number, Segment[]> = {
  5: [
    { min: 1, max: 15, weight: 35 },
    { min: 16, max: 30, weight: 35 },
    { min: 31, max: 45, weight: 18 },
    { min: 46, max: 60, weight: 8 },
    { min: 61, max: 75, weight: 2.95 },
    { min: 76, max: 99, weight: 1 },
    { min: 100, max: 100, weight: 0.05 },
  ],
  4: [
    { min: 1, max: 15, weight: 32 },
    { min: 16, max: 32, weight: 33 },
    { min: 33, max: 50, weight: 18 },
    { min: 51, max: 66, weight: 8 },
    { min: 67, max: 82, weight: 4.8 },
    { min: 83, max: 99, weight: 4 },
    { min: 100, max: 100, weight: 0.2 },
  ],
  3: [
    { min: 1, max: 12, weight: 17 },
    { min: 13, max: 30, weight: 23 },
    { min: 31, max: 50, weight: 27 },
    { min: 51, max: 68, weight: 18 },
    { min: 69, max: 84, weight: 9.2 },
    { min: 85, max: 99, weight: 5.3 },
    { min: 100, max: 100, weight: 0.5 },
  ],
  2: [
    { min: 1, max: 10, weight: 10 },
    { min: 11, max: 25, weight: 13 },
    { min: 26, max: 45, weight: 21 },
    { min: 46, max: 65, weight: 23 },
    { min: 66, max: 82, weight: 16.5 },
    { min: 83, max: 99, weight: 15.5 },
    { min: 100, max: 100, weight: 1 },
  ],
  1: [
    { min: 1, max: 8, weight: 1 },
    { min: 9, max: 20, weight: 3 },
    { min: 21, max: 40, weight: 10 },
    { min: 41, max: 60, weight: 16 },
    { min: 61, max: 78, weight: 24 },
    { min: 79, max: 92, weight: 23 },
    { min: 93, max: 99, weight: 20 },
    { min: 100, max: 100, weight: 3 },
  ],
};

/**
 * 记录heavengatedistributionspread。
 */
const HEAVEN_GATE_DISTRIBUTION_SPREAD: Record<number, number> = {
  5: 0.18,
  4: 0.28,
  3: 0.4,
  2: 0.58,
  1: 0,
};
/**
 * 记录heavengateextraperfect根目录softcap。
 */
const HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP = 174;

/**
 * 解析参数。
 */
function parseArgs(argv: string[]): CliOptions {
/**
 * 记录values。
 */
  const values = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }
    const [key, rawValue] = arg.slice(2).split('=');
    values.set(key, rawValue ?? '');
  }

  return {
    remaining: clampRemaining(Number(values.get('remaining') ?? '5')),
    bonus: Math.max(0, Math.floor(Number(values.get('bonus') ?? '0'))),
    runs: Math.max(1, Math.floor(Number(values.get('runs') ?? '10000'))),
    seed: Math.max(1, Math.floor(Number(values.get('seed') ?? `${Date.now()}`))),
  };
}

/**
 * 处理clampremaining。
 */
function clampRemaining(value: number): number {
  if (!Number.isFinite(value)) {
    return 5;
  }
  return Math.max(1, Math.min(5, Math.floor(value)));
}

/**
 * 创建rng。
 */
function createRng(seed: number): () => number {
/**
 * 记录状态。
 */
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * 处理weightedpicksegment。
 */
function weightedPickSegment(segments: Segment[], rng: () => number): Segment {
/**
 * 记录totalweight。
 */
  const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
/**
 * 记录cursor。
 */
  let cursor = rng() * totalWeight;
  for (const segment of segments) {
    cursor -= segment.weight;
    if (cursor <= 0) {
      return segment;
    }
  }
  return segments[segments.length - 1]!;
}

/**
 * 处理randomint。
 */
function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * 处理distributeroots。
 */
function distributeRoots(total: number, remaining: ElementKey[], rng: () => number): HeavenGateRootValues {
/**
 * 累计当前结果。
 */
  const result = ELEMENT_KEYS.reduce((state, key) => {
    state[key] = 0;
    return state;
  }, {} as HeavenGateRootValues);

  if (remaining.length === 0) {
    return result;
  }
  if (remaining.length === 1) {
    result[remaining[0]] = Math.max(1, Math.min(100, total));
    return result;
  }
  if (total === remaining.length) {
    for (const key of remaining) {
      result[key] = 1;
    }
    return result;
  }
  if (total === remaining.length * 100) {
    for (const key of remaining) {
      result[key] = 100;
    }
    return result;
  }

/**
 * 记录spread。
 */
  const spread = HEAVEN_GATE_DISTRIBUTION_SPREAD[remaining.length] ?? 0.18;
/**
 * 记录scores。
 */
  const scores = remaining.map(() => Math.max(0.08, 1 + (rng() * 2 - 1) * spread));
/**
 * 记录scoresum。
 */
  const scoreSum = scores.reduce((sum, score) => sum + score, 0);
/**
 * 记录remainder。
 */
  const remainder = Math.max(0, total - remaining.length);
/**
 * 记录allocations。
 */
  const allocations = remaining.map((element, index) => ({
    element,
    extra: Math.min(99, Math.floor((remainder * scores[index]!) / scoreSum)),
    fraction: (remainder * scores[index]!) / scoreSum,
  }));

/**
 * 记录allocated。
 */
  let allocated = allocations.reduce((sum, entry) => sum + entry.extra, 0);
/**
 * 记录sorted。
 */
  const sorted = [...allocations].sort((left, right) => right.fraction - left.fraction);
/**
 * 记录cursor。
 */
  let cursor = 0;
  while (allocated < remainder) {
/**
 * 记录目标。
 */
    const target = sorted[cursor % sorted.length]!;
    if (target.extra < 99) {
      target.extra += 1;
      allocated += 1;
    }
    cursor += 1;
  }

  for (const entry of sorted) {
    result[entry.element] = 1 + entry.extra;
  }
  return result;
}

/**
 * 获取extraperfect根目录keepchance。
 */
function getExtraPerfectRootKeepChance(averageBonus: number): number {
/**
 * 记录bonus。
 */
  const bonus = Math.max(0, averageBonus);
  if (bonus <= 0) {
    return 1;
  }
/**
 * 记录squaredbonus。
 */
  const squaredBonus = bonus * bonus;
/**
 * 记录squaredsoftcap。
 */
  const squaredSoftCap = HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP * HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP;
  return squaredBonus / (squaredBonus + squaredSoftCap);
}

/**
 * 处理softenperfectroots。
 */
function softenPerfectRoots(roots: HeavenGateRootValues, averageBonus: number, rng: () => number): HeavenGateRootValues {
/**
 * 记录keepchance。
 */
  const keepChance = getExtraPerfectRootKeepChance(averageBonus);
/**
 * 记录preservedperfect数量。
 */
  let preservedPerfectCount = 0;
  for (const key of ELEMENT_KEYS) {
    if (roots[key] !== 100) {
      continue;
    }
    if (preservedPerfectCount === 0) {
      preservedPerfectCount = 1;
      continue;
    }
    if (rng() > keepChance) {
      roots[key] = 99;
      continue;
    }
    preservedPerfectCount += 1;
  }
  return roots;
}

/**
 * 处理rollroots。
 */
function rollRoots(remainingCount: number, averageBonus: number, rng: () => number): { roots: HeavenGateRootValues; averageQuality: number } {
/**
 * 记录remaining。
 */
  const remaining = ELEMENT_KEYS.slice(0, remainingCount);
/**
 * 记录segments。
 */
  const segments = HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[remainingCount] ?? HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[1];
/**
 * 记录segment。
 */
  const segment = weightedPickSegment(segments, rng);
/**
 * 记录averagequality。
 */
  const averageQuality = Math.min(100, randomInt(segment.min, segment.max, rng) + Math.max(0, averageBonus));
  return {
    roots: softenPerfectRoots(distributeRoots(averageQuality * remaining.length, remaining, rng), averageBonus, rng),
    averageQuality,
  };
}

/**
 * 获取expectedaveragequality。
 */
function getExpectedAverageQuality(remainingCount: number, averageBonus: number): number {
/**
 * 记录segments。
 */
  const segments = HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[remainingCount] ?? HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[1];
  return segments.reduce((sum, segment) => {
/**
 * 记录expected。
 */
    const expected = Math.min(100, ((segment.min + segment.max) / 2) + Math.max(0, averageBonus));
    return sum + expected * (segment.weight / 100);
  }, 0);
}

/**
 * 处理simulate。
 */
function simulate(options: CliOptions): SimulationSummary {
/**
 * 记录rng。
 */
  const rng = createRng(options.seed);
/**
 * 记录averagequalitysum。
 */
  let averageQualitySum = 0;
/**
 * 记录totalsum。
 */
  let totalSum = 0;
/**
 * 记录top根目录sum。
 */
  let topRootSum = 0;
/**
 * 记录bottom根目录sum。
 */
  let bottomRootSum = 0;
/**
 * 记录mintotal。
 */
  let minTotal = Number.POSITIVE_INFINITY;
/**
 * 记录maxtotal。
 */
  let maxTotal = Number.NEGATIVE_INFINITY;
/**
 * 记录totalperfect数量。
 */
  let totalPerfectCount = 0;
/**
 * 记录anyperfect根目录数量。
 */
  let anyPerfectRootCount = 0;
/**
 * 记录allrootsequal数量。
 */
  let allRootsEqualCount = 0;

  for (let index = 0; index < options.runs; index += 1) {
    const { roots, averageQuality } = rollRoots(options.remaining, options.bonus, rng);
/**
 * 记录values。
 */
    const values = ELEMENT_KEYS
      .map((key) => roots[key])
      .filter((value) => value > 0)
      .sort((left, right) => right - left);
/**
 * 记录total。
 */
    const total = values.reduce((sum, value) => sum + value, 0);

    averageQualitySum += averageQuality;
    totalSum += total;
    topRootSum += values[0] ?? 0;
    bottomRootSum += values[values.length - 1] ?? 0;
    minTotal = Math.min(minTotal, total);
    maxTotal = Math.max(maxTotal, total);
    if (total === options.remaining * 100) {
      totalPerfectCount += 1;
    }
    if (values.some((value) => value === 100)) {
      anyPerfectRootCount += 1;
    }
    if (values.length > 0 && values.every((value) => value === values[0])) {
      allRootsEqualCount += 1;
    }
  }

  return {
    sampledAverageQuality: averageQualitySum / options.runs,
    sampledTotalAverage: totalSum / options.runs,
    minTotal,
    maxTotal,
    averageTopRoot: topRootSum / options.runs,
    averageBottomRoot: bottomRootSum / options.runs,
    totalPerfectCount,
    anyPerfectRootCount,
    allRootsEqualCount,
  };
}

/**
 * 格式化percent。
 */
function formatPercent(count: number, total: number): string {
  return `${((count / total) * 100).toFixed(4)}%`;
}

/**
 * 串联执行脚本主流程。
 */
function main(): void {
/**
 * 保存解析后的选项。
 */
  const options = parseArgs(process.argv.slice(2));
/**
 * 记录expectedaveragequality。
 */
  const expectedAverageQuality = getExpectedAverageQuality(options.remaining, options.bonus);
/**
 * 记录汇总。
 */
  const summary = simulate(options);

/**
 * 汇总输出行。
 */
  const lines = [
    '开天门 Monte Carlo 模拟',
    `remaining: ${options.remaining}`,
    `averageBonus: +${options.bonus}`,
    `runs: ${options.runs}`,
    `seed: ${options.seed}`,
    '',
    `理论平均品质: ${expectedAverageQuality.toFixed(4)}`,
    `模拟平均品质: ${summary.sampledAverageQuality.toFixed(4)}`,
    `理论平均总值: ${(expectedAverageQuality * options.remaining).toFixed(4)}`,
    `模拟平均总值: ${summary.sampledTotalAverage.toFixed(4)}`,
    `总值区间: ${summary.minTotal} - ${summary.maxTotal}`,
    `平均最高单根: ${summary.averageTopRoot.toFixed(4)}`,
    `平均最低单根: ${summary.averageBottomRoot.toFixed(4)}`,
    `总值满值次数: ${summary.totalPerfectCount}/${options.runs} (${formatPercent(summary.totalPerfectCount, options.runs)})`,
    `出现任意 100 单根次数: ${summary.anyPerfectRootCount}/${options.runs} (${formatPercent(summary.anyPerfectRootCount, options.runs)})`,
    `所有保留灵根完全相等次数: ${summary.allRootsEqualCount}/${options.runs} (${formatPercent(summary.allRootsEqualCount, options.runs)})`,
  ];

  console.log(lines.join('\n'));
}

main();

