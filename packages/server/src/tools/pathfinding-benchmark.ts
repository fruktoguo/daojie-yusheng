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

function parseArgs(argv: string[]): BenchmarkOptions {
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

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function loadStaticGrid(mapId: string): { grid: PathfindingStaticGrid; walkables: BenchmarkPoint[] } {
  const mapPath = path.resolve(__dirname, '../../data/maps', `${mapId}.json`);
  if (!fs.existsSync(mapPath)) {
    throw new Error(`地图不存在: ${mapPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(mapPath, 'utf-8')) as { id?: string; width?: number; height?: number; tiles?: string[] };
  if (!Array.isArray(raw.tiles) || !Number.isInteger(raw.width) || !Number.isInteger(raw.height)) {
    throw new Error(`地图格式非法: ${mapPath}`);
  }

  const width = Number(raw.width);
  const height = Number(raw.height);
  const walkable = new Uint8Array(width * height);
  const traversalCost = new Uint16Array(width * height);
  const walkables: BenchmarkPoint[] = [];

  for (let y = 0; y < height; y += 1) {
    const row = raw.tiles[y] ?? '';
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const tileChar = row[x] ?? '#';
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

function buildTasks(grid: PathfindingStaticGrid, walkables: BenchmarkPoint[], jobs: number, seed: number): PathfindingTask[] {
  if (walkables.length < 2) {
    throw new Error('可通行地块不足，无法进行 benchmark');
  }

  const rng = createRng(seed);
  const tasks: PathfindingTask[] = [];
  for (let index = 0; index < jobs; index += 1) {
    const start = walkables[Math.floor(rng() * walkables.length)]!;
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

function summarize(results: PathfindingTaskResult[], wallTimeMs: number): string {
  const succeeded = results.filter((result) => result.status === 'success').length;
  const cancelled = results.filter((result) => result.status === 'failed' && result.reason === 'cancelled').length;
  const failed = results.length - succeeded - cancelled;
  const avgElapsedMs = results.length > 0
    ? results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length
    : 0;
  const maxElapsedMs = results.reduce((max, result) => Math.max(max, result.elapsedMs), 0);
  const avgExpandedNodes = results.length > 0
    ? results.reduce((sum, result) => sum + result.expandedNodes, 0) / results.length
    : 0;
  const maxExpandedNodes = results.reduce((max, result) => Math.max(max, result.expandedNodes), 0);
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

async function runSingleThread(tasks: PathfindingTask[]): Promise<PathfindingTaskResult[]> {
  return tasks.map((task) => {
    const startedAt = process.hrtime.bigint();
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

async function runWorkerPool(tasks: PathfindingTask[]): Promise<PathfindingTaskResult[]> {
  const pool = new PathWorkerPoolService();
  const pending = [...tasks];
  const results: PathfindingTaskResult[] = [];

  try {
    while (pending.length > 0 || results.length < tasks.length) {
      while (pending.length > 0 && pool.hasIdleWorker()) {
        pool.dispatch(pending.shift()!);
      }

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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { grid, walkables } = loadStaticGrid(options.mapId);
  const tasks = buildTasks(grid, walkables, options.jobs, options.seed);
  const startedAt = process.hrtime.bigint();
  const results = options.mode === 'workers'
    ? await runWorkerPool(tasks)
    : await runSingleThread(tasks);
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
