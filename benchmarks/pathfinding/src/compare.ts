import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  findBoundedPath,
  getTileTraversalCost,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
  PATHFINDING_PLAYER_MAX_EXPANDED_NODES,
  PATHFINDING_PLAYER_MAX_PATH_LENGTH,
  PATHFINDING_PLAYER_MAX_TARGET_DISTANCE,
  type PathPoint,
  type PathResultFailureReason,
  type PathfindingSearchResult,
  type PathfindingStaticGrid,
} from '../../../packages/shared/dist/index.js';

interface Point {
  x: number;
  y: number;
}

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface PortalFixture extends Point {
  targetMapId: string;
}

interface MapFixture {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: string[];
  spawnPoint: Point;
  portals: PortalFixture[];
}

interface SearchLimitsFixture {
  maxExpandedNodes: number;
  maxPathLength: number;
  maxGoalDistance?: number;
  allowPartialPath?: boolean;
}

interface BenchmarkTask {
  id: string;
  start: Point;
  goals: Point[];
  limits: SearchLimitsFixture;
}

interface ScenarioResultDigest {
  id: string;
  status: 'success' | 'failed';
  reason: PathResultFailureReason | null;
  complete: boolean;
  pathLength: number;
  reachedGoal: Point | null;
  expandedNodes: number;
  pathHash: string;
}

interface BenchmarkStats {
  implementation: 'ts' | 'rust';
  totalElapsedMs: number;
  avgIterationMs: number;
  avgTaskMs: number;
  minIterationMs: number;
  maxIterationMs: number;
  p50IterationMs: number;
  p95IterationMs: number;
  tasksPerSecond: number;
  iterationMs: number[];
}

interface ScenarioSummary {
  name: string;
  description: string;
  taskCount: number;
  successCount: number;
  failureCount: number;
  avgExpandedNodes: number;
  maxExpandedNodes: number;
  verificationMatched: boolean;
  verificationNotes: string[];
  ts: BenchmarkStats;
  rust: BenchmarkStats;
  speedup: number;
}

interface ScenarioDefinition {
  name: string;
  description: string;
  type: 'region-random' | 'fixed-routes';
  region?: Rect;
  minManhattanDistance?: number;
  tasks?: Array<{ id: string; start: Point; goal: Point }>;
}

interface CompareOptions {
  iterations: number;
  warmupIterations: number;
  samplesPerScenario: number;
  seed: number;
  rustBinary: string;
  fixture: string;
}

interface ScenarioBenchmarkInput {
  name: string;
  description: string;
  tasks: BenchmarkTask[];
}

interface ScenarioPrepared extends ScenarioBenchmarkInput {
  expectedDigests: ScenarioResultDigest[];
  tsStats: BenchmarkStats;
}

interface RustScenarioOutput {
  name: string;
  verification: ScenarioResultDigest[];
  stats: BenchmarkStats;
}

interface RustSuiteOutput {
  scenarios: RustScenarioOutput[];
}

interface RustSuiteBenchmarkResult {
  output: RustSuiteOutput;
  wallTimeMs: number;
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;
const BLOCKED_EMPTY_CACHE = new Map<number, Uint8Array>();
const DEFAULT_OPTIONS: CompareOptions = {
  iterations: 12,
  warmupIterations: 2,
  samplesPerScenario: 512,
  seed: 20260417,
  rustBinary: path.resolve(__dirname, '../rust/target/release/mud-pathfinding-bench'),
  fixture: path.resolve(__dirname, '../fixtures/maps/yunlai_town.json'),
};

const BENCHMARK_LIMITS: SearchLimitsFixture = {
  maxExpandedNodes: PATHFINDING_PLAYER_MAX_EXPANDED_NODES,
  maxPathLength: PATHFINDING_PLAYER_MAX_PATH_LENGTH,
  maxGoalDistance: PATHFINDING_PLAYER_MAX_TARGET_DISTANCE,
  allowPartialPath: true,
};

const SCENARIOS: ScenarioDefinition[] = [
  {
    name: 'full_map_random',
    description: '全图随机点对，覆盖云来镇整体路网与边缘地形。',
    type: 'region-random',
    region: { minX: 1, maxX: 62, minY: 1, maxY: 62 },
    minManhattanDistance: 12,
  },
  {
    name: 'northwest_residential',
    description: '西北居民区与院墙缺口，障碍密度较高。',
    type: 'region-random',
    region: { minX: 6, maxX: 24, minY: 7, maxY: 24 },
    minManhattanDistance: 8,
  },
  {
    name: 'central_main_road',
    description: '镇中主干道与交叉口，路径较长但通路连续。',
    type: 'region-random',
    region: { minX: 13, maxX: 49, minY: 18, maxY: 37 },
    minManhattanDistance: 16,
  },
  {
    name: 'east_gate_corridor',
    description: '东侧出口与狭长道路，适合观察长走廊式搜索。',
    type: 'region-random',
    region: { minX: 45, maxX: 62, minY: 8, maxY: 28 },
    minManhattanDistance: 10,
  },
  {
    name: 'south_marsh',
    description: '南部沼泽和南门外区域，代价地形更多。',
    type: 'region-random',
    region: { minX: 1, maxX: 62, minY: 49, maxY: 62 },
    minManhattanDistance: 14,
  },
  {
    name: 'landmark_routes',
    description: '出生点、城门、传送口与关键建筑之间的固定路线。',
    type: 'fixed-routes',
    tasks: [
      { id: 'spawn_to_bamboo_forest', start: { x: 32, y: 5 }, goal: { x: 13, y: 27 } },
      { id: 'spawn_to_spirit_ridge', start: { x: 32, y: 5 }, goal: { x: 62, y: 16 } },
      { id: 'spawn_to_wildlands', start: { x: 32, y: 5 }, goal: { x: 31, y: 54 } },
      { id: 'bamboo_to_spirit', start: { x: 13, y: 27 }, goal: { x: 62, y: 16 } },
      { id: 'inn_to_south_gate_tower', start: { x: 16, y: 39 }, goal: { x: 28, y: 45 } },
      { id: 'old_shrine_to_ore_basement', start: { x: 14, y: 13 }, goal: { x: 38, y: 14 } },
      { id: 'apothecary_to_hidden_grotto', start: { x: 41, y: 38 }, goal: { x: 48, y: 43 } },
      { id: 'south_gate_to_spawn', start: { x: 31, y: 54 }, goal: { x: 32, y: 5 } },
      { id: 'spirit_to_bamboo', start: { x: 62, y: 16 }, goal: { x: 13, y: 27 } },
      { id: 'wildlands_to_hidden_grotto', start: { x: 31, y: 54 }, goal: { x: 48, y: 43 } },
    ],
  },
];

function parseArgs(argv: string[]): CompareOptions {
  const options = { ...DEFAULT_OPTIONS };
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith('--')) {
      continue;
    }
    const [rawKey, inlineValue] = entry.slice(2).split('=');
    const consumesNext = inlineValue == null;
    const value = inlineValue ?? argv[index + 1];
    switch (rawKey) {
      case 'iterations':
        options.iterations = normalizePositiveInteger(value, options.iterations);
        break;
      case 'warmup':
      case 'warmup-iterations':
        options.warmupIterations = normalizeNonNegativeInteger(value, options.warmupIterations);
        break;
      case 'samples':
      case 'samples-per-scenario':
        options.samplesPerScenario = normalizePositiveInteger(value, options.samplesPerScenario);
        break;
      case 'seed':
        options.seed = normalizePositiveInteger(value, options.seed);
        break;
      case 'rust-binary':
        options.rustBinary = value ? path.resolve(value) : options.rustBinary;
        break;
      case 'fixture':
        options.fixture = value ? path.resolve(value) : options.fixture;
        break;
      default:
        break;
    }
    if (consumesNext && value != null) {
      index += 1;
    }
  }
  return options;
}

function normalizePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function loadMapFixture(fixturePath: string): MapFixture {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as MapFixture;
}

function buildStaticGrid(mapFixture: MapFixture): { grid: PathfindingStaticGrid; walkablePoints: Point[] } {
  const total = mapFixture.width * mapFixture.height;
  const walkable = new Uint8Array(total);
  const traversalCost = new Uint16Array(total);
  const walkablePoints: Point[] = [];

  for (let y = 0; y < mapFixture.height; y += 1) {
    const row = mapFixture.tiles[y] ?? '';
    for (let x = 0; x < mapFixture.width; x += 1) {
      const tileChar = row[x] ?? '#';
      const tileType = getTileTypeFromMapChar(tileChar);
      if (!isTileTypeWalkable(tileType)) {
        continue;
      }
      const tileIndex = toIndex(x, y, mapFixture.width);
      walkable[tileIndex] = 1;
      traversalCost[tileIndex] = getTileTraversalCost(tileType);
      walkablePoints.push({ x, y });
    }
  }

  return {
    grid: {
      mapId: mapFixture.id,
      mapRevision: 1,
      width: mapFixture.width,
      height: mapFixture.height,
      walkable,
      traversalCost,
    },
    walkablePoints,
  };
}

function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pointWithinRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.minX
    && point.x <= rect.maxX
    && point.y >= rect.minY
    && point.y <= rect.maxY;
}

function getWalkablePointsInRegion(walkablePoints: Point[], rect: Rect): Point[] {
  return walkablePoints.filter((point) => pointWithinRect(point, rect));
}

function buildScenarioTasks(
  definition: ScenarioDefinition,
  walkablePoints: Point[],
  samplesPerScenario: number,
  seed: number,
): BenchmarkTask[] {
  if (definition.type === 'fixed-routes') {
    return (definition.tasks ?? []).map((task) => ({
      id: task.id,
      start: task.start,
      goals: [task.goal],
      limits: { ...BENCHMARK_LIMITS },
    }));
  }

  if (!definition.region) {
    throw new Error(`场景 ${definition.name} 缺少 region`);
  }

  const candidates = getWalkablePointsInRegion(walkablePoints, definition.region);
  if (candidates.length < 2) {
    throw new Error(`场景 ${definition.name} 的可通行点不足`);
  }

  const rng = createRng(seed);
  const tasks: BenchmarkTask[] = [];
  const minDistance = definition.minManhattanDistance ?? 1;

  while (tasks.length < samplesPerScenario) {
    const start = candidates[Math.floor(rng() * candidates.length)]!;
    let goal = candidates[Math.floor(rng() * candidates.length)]!;
    let attempts = 0;
    while (
      attempts < 16
      && ((goal.x === start.x && goal.y === start.y) || manhattanDistance(start, goal) < minDistance)
    ) {
      goal = candidates[Math.floor(rng() * candidates.length)]!;
      attempts += 1;
    }
    if (goal.x === start.x && goal.y === start.y) {
      continue;
    }
    tasks.push({
      id: `${definition.name}:${tasks.length}`,
      start,
      goals: [{ x: goal.x, y: goal.y }],
      limits: { ...BENCHMARK_LIMITS },
    });
  }

  return tasks;
}

function manhattanDistance(left: Point, right: Point): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function getEmptyBlocked(total: number): Uint8Array {
  let blocked = BLOCKED_EMPTY_CACHE.get(total);
  if (!blocked) {
    blocked = new Uint8Array(total);
    BLOCKED_EMPTY_CACHE.set(total, blocked);
  }
  return blocked;
}

function buildDigest(taskId: string, result: PathfindingSearchResult): ScenarioResultDigest {
  if (result.status === 'failed') {
    return {
      id: taskId,
      status: 'failed',
      reason: result.reason,
      complete: false,
      pathLength: 0,
      reachedGoal: null,
      expandedNodes: result.expandedNodes,
      pathHash: hashPath([], null, result.reason),
    };
  }

  return {
    id: taskId,
    status: 'success',
    reason: null,
    complete: result.complete,
    pathLength: result.path.length,
    reachedGoal: result.reachedGoal,
    expandedNodes: result.expandedNodes,
    pathHash: hashPath(result.path, result.reachedGoal, result.complete ? null : 'partial'),
  };
}

function hashPath(pathPoints: PathPoint[], reachedGoal: Point | null, marker: string | null): string {
  let hash = FNV_OFFSET;
  hash = fnvUpdateString(hash, marker ?? 'ok');
  if (reachedGoal) {
    hash = fnvUpdateNumber(hash, reachedGoal.x);
    hash = fnvUpdateNumber(hash, reachedGoal.y);
  } else {
    hash = fnvUpdateNumber(hash, -1);
    hash = fnvUpdateNumber(hash, -1);
  }
  for (const point of pathPoints) {
    hash = fnvUpdateNumber(hash, point.x);
    hash = fnvUpdateNumber(hash, point.y);
  }
  return hash.toString(16).padStart(16, '0');
}

function fnvUpdateString(current: bigint, value: string): bigint {
  let hash = current;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash;
}

function fnvUpdateNumber(current: bigint, value: number): bigint {
  let hash = current;
  const normalized = value >>> 0;
  for (let shift = 0; shift < 32; shift += 8) {
    hash ^= BigInt((normalized >>> shift) & 0xff);
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash;
}

function verifyScenario(grid: PathfindingStaticGrid, tasks: BenchmarkTask[]): ScenarioResultDigest[] {
  const blocked = getEmptyBlocked(grid.width * grid.height);
  return tasks.map((task) => buildDigest(task.id, findBoundedPath(
    grid,
    blocked,
    task.start.x,
    task.start.y,
    task.goals,
    task.limits,
  )));
}

function benchmarkTs(grid: PathfindingStaticGrid, tasks: BenchmarkTask[], iterations: number, warmupIterations: number): BenchmarkStats {
  const blocked = getEmptyBlocked(grid.width * grid.height);

  for (let warmup = 0; warmup < warmupIterations; warmup += 1) {
    runTasks(grid, blocked, tasks);
  }

  const iterationMs: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    runTasks(grid, blocked, tasks);
    iterationMs.push(performance.now() - startedAt);
  }

  return buildStats('ts', iterationMs, tasks.length);
}

function runTasks(grid: PathfindingStaticGrid, blocked: Uint8Array, tasks: BenchmarkTask[]): void {
  for (const task of tasks) {
    findBoundedPath(
      grid,
      blocked,
      task.start.x,
      task.start.y,
      task.goals,
      task.limits,
    );
  }
}

function buildStats(implementation: 'ts' | 'rust', iterationMs: number[], taskCount: number): BenchmarkStats {
  const totalElapsedMs = iterationMs.reduce((sum, value) => sum + value, 0);
  const avgIterationMs = iterationMs.length > 0 ? totalElapsedMs / iterationMs.length : 0;
  const avgTaskMs = iterationMs.length > 0 && taskCount > 0
    ? totalElapsedMs / (iterationMs.length * taskCount)
    : 0;
  const sorted = [...iterationMs].sort((left, right) => left - right);

  return {
    implementation,
    totalElapsedMs,
    avgIterationMs,
    avgTaskMs,
    minIterationMs: sorted[0] ?? 0,
    maxIterationMs: sorted[sorted.length - 1] ?? 0,
    p50IterationMs: percentile(sorted, 0.5),
    p95IterationMs: percentile(sorted, 0.95),
    tasksPerSecond: totalElapsedMs > 0 ? (taskCount * iterationMs.length * 1000) / totalElapsedMs : 0,
    iterationMs,
  };
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(sortedValues.length * ratio)));
  return sortedValues[index] ?? 0;
}

function benchmarkRustSuite(
  rustBinary: string,
  grid: PathfindingStaticGrid,
  scenarios: ScenarioBenchmarkInput[],
  iterations: number,
  warmupIterations: number,
): RustSuiteBenchmarkResult {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'mud-pathfinding-bench-'));
  const inputPath = path.join(tempDir, 'input.json');
  try {
    writeFileSync(
      inputPath,
      JSON.stringify({
        grid: {
          width: grid.width,
          height: grid.height,
          walkable: Array.from(grid.walkable),
          traversalCost: Array.from(grid.traversalCost),
        },
        scenarios: scenarios.map((scenario) => ({
          name: scenario.name,
          tasks: scenario.tasks,
        })),
        iterations,
        warmupIterations,
      }),
      'utf8',
    );

    const startedAt = performance.now();
    const stdout = execFileSync(rustBinary, ['--input', inputPath], {
      cwd: path.dirname(rustBinary),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 1024 * 1024 * 64,
    });
    const wallTimeMs = performance.now() - startedAt;
    return {
      output: JSON.parse(stdout) as RustSuiteOutput,
      wallTimeMs,
    };
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function compareVerification(expected: ScenarioResultDigest[], actual: ScenarioResultDigest[]): { matched: boolean; notes: string[] } {
  const actualById = new Map(actual.map((entry) => [entry.id, entry]));
  const notes: string[] = [];

  for (const digest of expected) {
    const rustDigest = actualById.get(digest.id);
    if (!rustDigest) {
      notes.push(`缺少任务结果: ${digest.id}`);
      continue;
    }
    if (digest.status !== rustDigest.status) {
      notes.push(`状态不一致: ${digest.id} ts=${digest.status} rust=${rustDigest.status}`);
      continue;
    }
    if (digest.reason !== rustDigest.reason) {
      notes.push(`失败原因不一致: ${digest.id} ts=${digest.reason ?? 'null'} rust=${rustDigest.reason ?? 'null'}`);
    }
    if (digest.complete !== rustDigest.complete) {
      notes.push(`complete 不一致: ${digest.id} ts=${digest.complete} rust=${rustDigest.complete}`);
    }
    if (digest.pathLength !== rustDigest.pathLength) {
      notes.push(`路径长度不一致: ${digest.id} ts=${digest.pathLength} rust=${rustDigest.pathLength}`);
    }
    if (!samePoint(digest.reachedGoal, rustDigest.reachedGoal)) {
      notes.push(`reachedGoal 不一致: ${digest.id} ts=${formatPoint(digest.reachedGoal)} rust=${formatPoint(rustDigest.reachedGoal)}`);
    }
    if (digest.pathHash !== rustDigest.pathHash) {
      notes.push(`路径签名不一致: ${digest.id} ts=${digest.pathHash} rust=${rustDigest.pathHash}`);
    }
  }

  for (const digest of actual) {
    if (!expected.find((entry) => entry.id === digest.id)) {
      notes.push(`Rust 多返回任务: ${digest.id}`);
    }
  }

  return {
    matched: notes.length === 0,
    notes: notes.slice(0, 8),
  };
}

function samePoint(left: Point | null, right: Point | null): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.x === right.x && left.y === right.y;
}

function formatPoint(point: Point | null): string {
  return point ? `(${point.x},${point.y})` : 'null';
}

function summarizeScenario(
  definition: ScenarioBenchmarkInput,
  verification: { matched: boolean; notes: string[] },
  expectedDigests: ScenarioResultDigest[],
  ts: BenchmarkStats,
  rust: BenchmarkStats,
): ScenarioSummary {
  const successCount = expectedDigests.filter((digest) => digest.status === 'success').length;
  const failureCount = expectedDigests.length - successCount;
  const expandedNodes = expectedDigests.map((digest) => digest.expandedNodes);
  const totalExpandedNodes = expandedNodes.reduce((sum, value) => sum + value, 0);

  return {
    name: definition.name,
    description: definition.description,
    taskCount: definition.tasks.length,
    successCount,
    failureCount,
    avgExpandedNodes: expandedNodes.length > 0 ? totalExpandedNodes / expandedNodes.length : 0,
    maxExpandedNodes: expandedNodes.reduce((max, value) => Math.max(max, value), 0),
    verificationMatched: verification.matched,
    verificationNotes: verification.notes,
    ts,
    rust,
    speedup: rust.avgIterationMs > 0 ? ts.avgIterationMs / rust.avgIterationMs : 0,
  };
}

function printReport(
  fixture: MapFixture,
  options: CompareOptions,
  summaries: ScenarioSummary[],
  perScenarioWallTimeMs: number,
  batchWallTimeMs: number,
): void {
  console.log(`# 寻路基准对比: ${fixture.name}`);
  console.log(`地图夹具: ${options.fixture}`);
  console.log(`迭代次数: ${options.iterations}，预热次数: ${options.warmupIterations}，区域随机样本: ${options.samplesPerScenario}`);
  console.log(`Rust 二进制: ${options.rustBinary}`);
  console.log(`Rust 外层调用 wall time: 单场景逐次=${perScenarioWallTimeMs.toFixed(3)}ms，整套批量=${batchWallTimeMs.toFixed(3)}ms，额外收益=${(perScenarioWallTimeMs / batchWallTimeMs).toFixed(2)}x`);
  console.log('');
  console.log('| 场景 | 任务数 | TS 平均迭代 ms | Rust 平均迭代 ms | 加速比 | TS QPS | Rust QPS | 校验 |');
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const summary of summaries) {
    console.log(`| ${summary.name} | ${summary.taskCount} | ${summary.ts.avgIterationMs.toFixed(3)} | ${summary.rust.avgIterationMs.toFixed(3)} | ${summary.speedup.toFixed(2)}x | ${summary.ts.tasksPerSecond.toFixed(1)} | ${summary.rust.tasksPerSecond.toFixed(1)} | ${summary.verificationMatched ? '通过' : '失败'} |`);
  }
  console.log('');

  for (const summary of summaries) {
    console.log(`## ${summary.name}`);
    console.log(summary.description);
    console.log(`任务: ${summary.taskCount}，成功: ${summary.successCount}，失败: ${summary.failureCount}，平均展开节点: ${summary.avgExpandedNodes.toFixed(1)}，最大展开节点: ${summary.maxExpandedNodes}`);
    console.log(`TS: avg=${summary.ts.avgIterationMs.toFixed(3)}ms, p50=${summary.ts.p50IterationMs.toFixed(3)}ms, p95=${summary.ts.p95IterationMs.toFixed(3)}ms, qps=${summary.ts.tasksPerSecond.toFixed(1)}`);
    console.log(`Rust: avg=${summary.rust.avgIterationMs.toFixed(3)}ms, p50=${summary.rust.p50IterationMs.toFixed(3)}ms, p95=${summary.rust.p95IterationMs.toFixed(3)}ms, qps=${summary.rust.tasksPerSecond.toFixed(1)}`);
    console.log(`加速比: ${summary.speedup.toFixed(2)}x`);
    if (!summary.verificationMatched) {
      for (const note of summary.verificationNotes) {
        console.log(`校验差异: ${note}`);
      }
    }
    console.log('');
  }

  const validSummaries = summaries.filter((summary) => summary.verificationMatched);
  if (validSummaries.length > 0) {
    const avgSpeedup = validSummaries.reduce((sum, summary) => sum + summary.speedup, 0) / validSummaries.length;
    const fastest = [...validSummaries].sort((left, right) => right.speedup - left.speedup)[0]!;
    const slowest = [...validSummaries].sort((left, right) => left.speedup - right.speedup)[0]!;
    console.log(`总体平均加速比: ${avgSpeedup.toFixed(2)}x`);
    console.log(`最快场景: ${fastest.name} (${fastest.speedup.toFixed(2)}x)`);
    console.log(`最慢场景: ${slowest.name} (${slowest.speedup.toFixed(2)}x)`);
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const fixture = loadMapFixture(options.fixture);
  const { grid, walkablePoints } = buildStaticGrid(fixture);

  const scenarios: ScenarioPrepared[] = SCENARIOS.map((scenario, scenarioIndex) => {
    const tasks = buildScenarioTasks(
      scenario,
      walkablePoints,
      options.samplesPerScenario,
      options.seed + scenarioIndex * 97,
    );
    return {
      name: scenario.name,
      description: scenario.description,
      tasks,
      expectedDigests: verifyScenario(grid, tasks),
      tsStats: benchmarkTs(grid, tasks, options.iterations, options.warmupIterations),
    };
  });

  const batchRun = benchmarkRustSuite(options.rustBinary, grid, scenarios, options.iterations, options.warmupIterations);
  const scenarioOutputMap = new Map(batchRun.output.scenarios.map((scenario) => [scenario.name, scenario]));

  let perScenarioWallTimeMs = 0;
  for (const scenario of scenarios) {
    perScenarioWallTimeMs += benchmarkRustSuite(
      options.rustBinary,
      grid,
      [scenario],
      options.iterations,
      options.warmupIterations,
    ).wallTimeMs;
  }

  const summaries: ScenarioSummary[] = scenarios.map((scenario) => {
    const rustOutput = scenarioOutputMap.get(scenario.name);
    if (!rustOutput) {
      throw new Error(`Rust 输出缺少场景 ${scenario.name}`);
    }
    const verification = compareVerification(scenario.expectedDigests, rustOutput.verification);
    return summarizeScenario(
      scenario,
      verification,
      scenario.expectedDigests,
      scenario.tsStats,
      rustOutput.stats,
    );
  });

  printReport(fixture, options, summaries, perScenarioWallTimeMs, batchRun.wallTimeMs);
}

main();
