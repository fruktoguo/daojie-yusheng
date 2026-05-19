/** Worker Pool 性能基准：同步路径 vs 真实 worker_threads 路径。 */
import { encodeServerEventPayload, findBoundedPath, type PathfindingStaticGrid } from '@mud/shared';
import { EncodingWorkerPoolService } from '../concurrency/encoding-worker-pool.service';
import { PersistenceWorkerPoolService } from '../concurrency/persistence-worker-pool.service';
import { WorkerPoolMetricsService } from '../concurrency/worker-pool-metrics.service';

interface BenchResult { label: string; syncMs: number; workerMs: number; speedup: number; passed: boolean }
const results: BenchResult[] = [];

function bench(iterations: number, fn: () => void): number {
  for (let i = 0; i < Math.min(10, iterations); i += 1) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) fn();
  return performance.now() - start;
}
async function benchAsync(iterations: number, concurrency: number, fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  for (let i = 0; i < iterations; i += concurrency) {
    await Promise.all(Array.from({ length: Math.min(concurrency, iterations - i) }, () => fn()));
  }
  return performance.now() - start;
}
function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
}
function push(label: string, syncMs: number, workerMs: number): void {
  results.push({ label, syncMs, workerMs, speedup: syncMs / Math.max(1, workerMs), passed: true });
}
function withEncodingPool(): { pool: EncodingWorkerPoolService; restore: () => void } {
  const prevPool = process.env.SERVER_WORKER_POOL_ENABLED;
  process.env.SERVER_WORKER_POOL_ENABLED = 'true';
  const pool = new EncodingWorkerPoolService(new WorkerPoolMetricsService());
  pool.initialize();
  return { pool, restore: () => { pool.shutdown(); restoreEnv('SERVER_WORKER_POOL_ENABLED', prevPool); } };
}
function withPersistencePool(): { pool: PersistenceWorkerPoolService; restore: () => void } {
  const prevPool = process.env.SERVER_WORKER_POOL_ENABLED;
  const prevPersistence = process.env.SERVER_PERSISTENCE_BUILD_WORKER_ENABLED;
  process.env.SERVER_WORKER_POOL_ENABLED = 'true';
  process.env.SERVER_PERSISTENCE_BUILD_WORKER_ENABLED = 'true';
  const pool = new PersistenceWorkerPoolService(new WorkerPoolMetricsService());
  pool.initialize();
  return {
    pool,
    restore: () => {
      pool.shutdown();
      restoreEnv('SERVER_WORKER_POOL_ENABLED', prevPool);
      restoreEnv('SERVER_PERSISTENCE_BUILD_WORKER_ENABLED', prevPersistence);
    },
  };
}

async function benchPhase1(): Promise<void> {
  const iterations = 1000;
  const payload = {
    t: 42, wr: 100, sr: 5,
    p: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, x: i * 3, y: i * 2, name: `玩家${i}`, facing: 1 })),
    m: Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, x: i, y: i, hp: 100, maxHp: 200, name: `怪物${i}` })),
  };
  const syncMs = bench(iterations, () => { encodeServerEventPayload('n:s:worldDelta', payload); });
  const { pool, restore } = withEncodingPool();
  try {
    const workerMs = await benchAsync(iterations, 64, () => pool.submit('envelope-encode', payload, (p) => Buffer.from(JSON.stringify(p), 'utf-8'), 1000));
    push(`Phase 1: AOI envelope encode (${iterations} iterations, real worker)`, syncMs, workerMs);
  } finally { restore(); }
}

async function benchPhase2(): Promise<void> {
  const width = 64, height = 64, total = width * height, iterations = 300;
  const walkable = new Uint8Array(total), traversalCost = new Uint16Array(total), blocked = new Uint8Array(total);
  walkable.fill(1); traversalCost.fill(1);
  for (let y = 5; y < 55; y += 1) walkable[y * width + 32] = 0;
  const grid: PathfindingStaticGrid = { mapId: 'bench', mapRevision: 1, width, height, walkable, traversalCost };
  const input = { mapId: grid.mapId, mapRevision: grid.mapRevision, width, height, walkable, traversalCost, blocked, startX: 10, startY: 32, goals: [{ x: 50, y: 32 }], maxExpandedNodes: total, maxPathLength: total };
  const syncMs = bench(iterations, () => { findBoundedPath(grid, blocked, 10, 32, [{ x: 50, y: 32 }], { maxExpandedNodes: total, maxPathLength: total }); });
  const { pool, restore } = withEncodingPool();
  try {
    const workerMs = await benchAsync(iterations, 32, () => pool.submit('pathfind', input, () => findBoundedPath(grid, blocked, 10, 32, [{ x: 50, y: 32 }], { maxExpandedNodes: total, maxPathLength: total }), 1000));
    push(`Phase 2: A* pathfinding 64x64 (${iterations} iterations, real worker)`, syncMs, workerMs);
  } finally { restore(); }
}

async function benchPhase5(): Promise<void> {
  const iterations = 1000;
  const snapshots = Array.from({ length: 10 }, (_, i) => ({
    playerId: `player_${i}`, hp: 100 + i, qi: 50 + i,
    inventory: Array.from({ length: 20 }, (_, j) => ({ itemId: `item_${j}`, count: j + 1, attrs: { str: j, dex: j * 2 } })),
    buffs: Array.from({ length: 5 }, (_, j) => ({ buffId: `buff_${j}`, stacks: j + 1, remaining: 10 - j })),
  }));
  const syncMs = bench(iterations, () => { for (const snapshot of snapshots) JSON.stringify(snapshot); });
  const { pool, restore } = withPersistencePool();
  try {
    const workerMs = await benchAsync(iterations, 32, () => pool.submit('persistence-build', { snapshots }, (payload: any) => ({ jsonPayloads: payload.snapshots.map((s: unknown) => JSON.stringify(s)) }), 1000));
    push(`Phase 5: Persistence serialize 10 players × ${iterations} iterations (real worker)`, syncMs, workerMs);
  } finally { restore(); }
}

async function main(): Promise<void> {
  console.log('=== Worker Pool Performance Bench ===\n');
  await benchPhase1();
  await benchPhase2();
  await benchPhase5();
  console.log('Results:');
  console.log('─'.repeat(80));
  for (const r of results) {
    console.log(`  ${r.label}`);
    console.log(`    sync: ${r.syncMs.toFixed(1)}ms | worker: ${r.workerMs.toFixed(1)}ms | speedup: ${r.speedup.toFixed(2)}x`);
  }
  console.log('─'.repeat(80));
  console.log('\nNote: 单机基准包含 worker 消息传递成本；真实收益依赖多核、并发负载和主线程让渡。\n');
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), results: results.map((r) => ({ label: r.label, syncMs: r.syncMs, workerMs: r.workerMs, speedup: r.speedup })) }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
