/**
 * CLI 工具：离线压测寻路核心或 worker 池，不接触 live 世界状态。
 *
 * 用法示例：
 * `pnpm --filter @mud/server bench:pathfinding -- --map=yunlai_town --jobs=500 --mode=workers`
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  getTileTraversalCost,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
  PATHFINDING_PLAYER_MAX_EXPANDED_NODES,
  PATHFINDING_PLAYER_MAX_PATH_LENGTH,
} from '@mud/shared';
import { findBoundedPath } from '../game/pathfinding/pathfinding-core';
import { PathWorkerPoolService } from '../game/pathfinding/path-worker-pool.service';
import { PathfindingStaticGrid, PathfindingTask, PathfindingTaskResult } from '../game/pathfinding/pathfinding.types';

interface BenchmarkOptions {
  mapId: string;
  jobs: number;
  mode: 'single' | 'workers';
  seed: number;
}

interface BenchmarkPoint {
  x: number;
  y: number;
}

/**
 * 解析参数。
 */
function parseArgs(argv: string[]): BenchmarkOptions {
/**
 * 汇总当前条目列表。
 */
  const entries = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }
    const [key, rawValue] = arg.slice(2).split('=');
    entries.set(key, rawValue ?? '1');
  }

  return {
    mapId: entries.get('map')?.trim() || 'yunlai_town',
    jobs: Math.max(1, Math.floor(Number(entries.get('jobs') ?? '200'))),
    mode: entries.get('mode') === 'workers' ? 'workers' : 'single',
    seed: Math.max(1, Math.floor(Number(entries.get('seed') ?? `${Date.now()}`))),
  };
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
 * 加载staticgrid。
 */
function loadStaticGrid(mapId: string): { grid: PathfindingStaticGrid; walkables: BenchmarkPoint[] } {
/**
 * 记录地图路径。
 */
  const mapPath = path.resolve(__dirname, '../../data/maps', `${mapId}.json`);
  if (!fs.existsSync(mapPath)) {
    throw new Error(`地图不存在: ${mapPath}`);
  }

/**
 * 记录raw。
 */
  const raw = JSON.parse(fs.readFileSync(mapPath, 'utf-8')) as { id?: string; width?: number; height?: number; tiles?: string[] };
  if (!Array.isArray(raw.tiles) || !Number.isInteger(raw.width) || !Number.isInteger(raw.height)) {
    throw new Error(`地图格式非法: ${mapPath}`);
  }

/**
 * 记录width。
 */
  const width = Number(raw.width);
/**
 * 记录height。
 */
  const height = Number(raw.height);
/**
 * 记录walkable。
 */
  const walkable = new Uint8Array(width * height);
/**
 * 记录traversalcost。
 */
  const traversalCost = new Uint16Array(width * height);
/**
 * 记录walkables。
 */
  const walkables: BenchmarkPoint[] = [];

  for (let y = 0; y < height; y += 1) {
/**
 * 记录row。
 */
    const row = raw.tiles[y] ?? '';
    for (let x = 0; x < width; x += 1) {
/**
 * 记录索引。
 */
      const index = y * width + x;
/**
 * 记录tilechar。
 */
      const tileChar = row[x] ?? '#';
/**
 * 记录tiletype。
 */
      const tileType = getTileTypeFromMapChar(tileChar);
      if (!isTileTypeWalkable(tileType)) {
        continue;
      }
      walkable[index] = 1;
      traversalCost[index] = Math.max(1, getTileTraversalCost(tileType));
      walkables.push({ x, y });
    }
  }

  return {
    grid: {
      mapId: raw.id ?? mapId,
      mapRevision: 1,
      width,
      height,
      walkable,
      traversalCost,
    },
    walkables,
  };
}

/**
 * 构建tasks。
 */
function buildTasks(grid: PathfindingStaticGrid, walkables: BenchmarkPoint[], jobs: number, seed: number): PathfindingTask[] {
  if (walkables.length < 2) {
    throw new Error('可通行地块不足，无法进行 benchmark');
  }

/**
 * 记录rng。
 */
  const rng = createRng(seed);
/**
 * 记录tasks。
 */
  const tasks: PathfindingTask[] = [];
  for (let index = 0; index < jobs; index += 1) {
/**
 * 记录start。
 */
    const start = walkables[Math.floor(rng() * walkables.length)]!;
/**
 * 记录goal。
 */
    let goal = walkables[Math.floor(rng() * walkables.length)]!;
    if (goal.x === start.x && goal.y === start.y) {
      goal = walkables[(Math.floor(rng() * walkables.length) + 1) % walkables.length]!;
    }
    tasks.push({
      requestId: `bench:${index}`,
      actorId: `bench:${index}`,
      actorType: 'player',
      kind: 'player_move_to',
      priority: 0,
      moveSpeed: 100,
      enqueueOrder: index,
      startX: start.x,
      startY: start.y,
      goals: [{ x: goal.x, y: goal.y }],
      staticGrid: grid,
      blocked: new Uint8Array(grid.width * grid.height),
      limits: {
        maxExpandedNodes: PATHFINDING_PLAYER_MAX_EXPANDED_NODES,
        maxPathLength: PATHFINDING_PLAYER_MAX_PATH_LENGTH,
        allowPartialPath: true,
      },
    });
  }
  return tasks;
}

/**
 * 处理summarize。
 */
function summarize(results: PathfindingTaskResult[], wallTimeMs: number): string {
/**
 * 记录succeeded。
 */
  const succeeded = results.filter((result) => result.status === 'success').length;
/**
 * 记录cancelled。
 */
  const cancelled = results.filter((result) => result.status === 'failed' && result.reason === 'cancelled').length;
/**
 * 记录failed。
 */
  const failed = results.length - succeeded - cancelled;
/**
 * 记录avgelapsedms。
 */
  const avgElapsedMs = results.length > 0
    ? results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length
    : 0;
/**
 * 记录maxelapsedms。
 */
  const maxElapsedMs = results.reduce((max, result) => Math.max(max, result.elapsedMs), 0);
/**
 * 记录avgexpandednodes。
 */
  const avgExpandedNodes = results.length > 0
    ? results.reduce((sum, result) => sum + result.expandedNodes, 0) / results.length
    : 0;
/**
 * 记录maxexpandednodes。
 */
  const maxExpandedNodes = results.reduce((max, result) => Math.max(max, result.expandedNodes), 0);
/**
 * 记录throughput。
 */
  const throughput = wallTimeMs > 0 ? (results.length / wallTimeMs) * 1000 : 0;

  return [
    `jobs: ${results.length}`,
    `success: ${succeeded}, failed: ${failed}, cancelled: ${cancelled}`,
    `wall time: ${wallTimeMs.toFixed(2)} ms`,
    `avg run time: ${avgElapsedMs.toFixed(2)} ms, max run time: ${maxElapsedMs.toFixed(2)} ms`,
    `avg expanded: ${avgExpandedNodes.toFixed(1)}, max expanded: ${maxExpandedNodes}`,
    `throughput: ${throughput.toFixed(2)} req/s`,
  ].join('\n');
}

/**
 * 运行singlethread。
 */
async function runSingleThread(tasks: PathfindingTask[]): Promise<PathfindingTaskResult[]> {
  return tasks.map((task) => {
/**
 * 记录startedat。
 */
    const startedAt = process.hrtime.bigint();
/**
 * 累计当前结果。
 */
    const result = findBoundedPath(
      task.staticGrid,
      task.blocked,
      task.startX,
      task.startY,
      task.goals,
      task.limits,
    );
    return {
      ...result,
      requestId: task.requestId,
      actorId: task.actorId,
      kind: task.kind,
      mapId: task.staticGrid.mapId,
      mapRevision: task.staticGrid.mapRevision,
      elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
    };
  });
}

/**
 * 运行workerpool。
 */
async function runWorkerPool(tasks: PathfindingTask[]): Promise<PathfindingTaskResult[]> {
/**
 * 记录pool。
 */
  const pool = new PathWorkerPoolService();
/**
 * 记录pending。
 */
  const pending = [...tasks];
/**
 * 汇总执行结果。
 */
  const results: PathfindingTaskResult[] = [];

  try {
    while (pending.length > 0 || results.length < tasks.length) {
      while (pending.length > 0 && pool.hasIdleWorker()) {
        pool.dispatch(pending.shift()!);
      }

/**
 * 记录completed。
 */
      const completed = pool.drainCompleted();
      if (completed.length > 0) {
        results.push(...completed);
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  } finally {
    pool.onModuleDestroy();
  }

  return results;
}

/**
 * 串联执行脚本主流程。
 */
async function main(): Promise<void> {
/**
 * 保存解析后的选项。
 */
  const options = parseArgs(process.argv.slice(2));
  const { grid, walkables } = loadStaticGrid(options.mapId);
/**
 * 记录tasks。
 */
  const tasks = buildTasks(grid, walkables, options.jobs, options.seed);
/**
 * 记录startedat。
 */
  const startedAt = process.hrtime.bigint();
/**
 * 汇总执行结果。
 */
  const results = options.mode === 'workers'
    ? await runWorkerPool(tasks)
    : await runSingleThread(tasks);
/**
 * 记录walltimems。
 */
  const wallTimeMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

  process.stdout.write([
    `mode: ${options.mode}`,
    `map: ${grid.mapId} (${grid.width}x${grid.height})`,
    summarize(results, wallTimeMs),
  ].join('\n'));
  process.stdout.write('\n');
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
