/** Worker Pool 性能基准：同步路径 vs 真实 worker_threads 路径。 */
import { encodeServerEventPayload, findBoundedPath, type PathfindingStaticGrid } from '@mud/shared';
import { EncodingWorkerPoolService } from '../concurrency/encoding-worker-pool.service';
import { PersistenceWorkerPoolService } from '../concurrency/persistence-worker-pool.service';
import { WorkerPoolMetricsService } from '../concurrency/worker-pool-metrics.service';
import {
  buildPlayerSnapshotProjectionWritePlan,
  type PlayerDomainWritePlan,
} from '../persistence/player-domain-write-plan';

interface BenchSample {
  wallMs: number;
  activeMs: number;
  utilization: number;
}
interface BenchResult {
  label: string;
  syncMs: number;
  workerMs: number;
  speedup: number;
  syncActiveMs: number;
  workerActiveMs: number;
  activeReduction: number;
  passed: boolean;
}
const results: BenchResult[] = [];

function bench(iterations: number, fn: () => void): BenchSample {
  for (let i = 0; i < Math.min(10, iterations); i += 1) fn();
  const eluStart = performance.eventLoopUtilization();
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) fn();
  const wallMs = performance.now() - start;
  const elu = performance.eventLoopUtilization(eluStart);
  return { wallMs, activeMs: elu.active, utilization: elu.utilization };
}
async function benchAsync(iterations: number, concurrency: number, fn: () => Promise<unknown>): Promise<BenchSample> {
  const eluStart = performance.eventLoopUtilization();
  const start = performance.now();
  for (let i = 0; i < iterations; i += concurrency) {
    await Promise.all(Array.from({ length: Math.min(concurrency, iterations - i) }, () => fn()));
  }
  const wallMs = performance.now() - start;
  const elu = performance.eventLoopUtilization(eluStart);
  return { wallMs, activeMs: elu.active, utilization: elu.utilization };
}
function push(label: string, sync: BenchSample, worker: BenchSample): void {
  results.push({
    label,
    syncMs: sync.wallMs,
    workerMs: worker.wallMs,
    speedup: sync.wallMs / Math.max(1, worker.wallMs),
    syncActiveMs: sync.activeMs,
    workerActiveMs: worker.activeMs,
    activeReduction: 1 - (worker.activeMs / Math.max(1, sync.activeMs)),
    passed: true,
  });
}
function withEncodingPool(): { pool: EncodingWorkerPoolService; restore: () => void } {
  const pool = new EncodingWorkerPoolService(new WorkerPoolMetricsService());
  pool.initialize();
  return { pool, restore: () => { pool.shutdown(); } };
}
function withPersistencePool(): { pool: PersistenceWorkerPoolService; restore: () => void } {
  const pool = new PersistenceWorkerPoolService(new WorkerPoolMetricsService());
  pool.initialize();
  return { pool, restore: () => { pool.shutdown(); } };
}

async function benchPhase1(): Promise<void> {
  const iterations = 1000;
  const payload = {
    t: 42, wr: 100, sr: 5,
    p: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, x: i * 3, y: i * 2, name: `玩家${i}`, facing: 1 })),
    m: Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, x: i, y: i, hp: 100, maxHp: 200, name: `怪物${i}` })),
  };
  const sync = bench(iterations, () => { encodeServerEventPayload('n:s:worldDelta', payload); });
  const { pool, restore } = withEncodingPool();
  try {
    const worker = await benchAsync(iterations, 64, () => pool.submit('envelope-encode', payload, (p) => Buffer.from(JSON.stringify(p), 'utf-8'), 1000));
    push(`Phase 1: AOI envelope encode (${iterations} iterations, real worker)`, sync, worker);
  } finally { restore(); }
}

async function benchPhase2(): Promise<void> {
  const width = 64, height = 64, total = width * height, iterations = 300;
  const walkable = new Uint8Array(total), traversalCost = new Uint16Array(total), blocked = new Uint8Array(total);
  walkable.fill(1); traversalCost.fill(1);
  for (let y = 5; y < 55; y += 1) walkable[y * width + 32] = 0;
  const grid: PathfindingStaticGrid = { mapId: 'bench', mapRevision: 1, width, height, walkable, traversalCost };
  const input = { mapId: grid.mapId, mapRevision: grid.mapRevision, width, height, walkable, traversalCost, blocked, startX: 10, startY: 32, goals: [{ x: 50, y: 32 }], maxExpandedNodes: total, maxPathLength: total };
  const sync = bench(iterations, () => { findBoundedPath(grid, blocked, 10, 32, [{ x: 50, y: 32 }], { maxExpandedNodes: total, maxPathLength: total }); });
  const { pool, restore } = withEncodingPool();
  try {
    const worker = await benchAsync(iterations, 32, () => pool.submit('pathfind', input, () => findBoundedPath(grid, blocked, 10, 32, [{ x: 50, y: 32 }], { maxExpandedNodes: total, maxPathLength: total }), 1000));
    push(`Phase 2: A* pathfinding 64x64 (${iterations} iterations, real worker)`, sync, worker);
  } finally { restore(); }
}

function buildPlanSnapshot() {
  return {
    savedAt: 1_720_000_000_000,
    placement: { templateId: 'yunlai_town', instanceId: 'public:yunlai_town', x: 12, y: 8, facing: 2 },
    inventory: { revision: 1, capacity: 60, items: Array.from({ length: 24 }, (_, i) => ({ itemId: `item_${i}`, count: i + 1 })) },
    wallet: { balances: [{ walletType: 'coin', balance: 88_000, frozenBalance: 0, version: 1 }] },
    unlockedMapIds: ['yunlai_town', 'spirit_valley', 'trial_cave'],
  };
}

async function benchPhase5(): Promise<void> {
  const iterations = 500;
  const playerId = 'bench-player';
  const snapshot = buildPlanSnapshot();
  const domains = ['inventory', 'wallet', 'map_unlock'];
  const sync = await benchAsync(iterations, 16, () => buildPlayerSnapshotProjectionWritePlan(playerId, snapshot as never, domains, {}));
  const { pool, restore } = withPersistencePool();
  try {
    const worker = await benchAsync(iterations, 16, () => pool.submit<{
      playerId: string;
      snapshot: unknown;
      domains: string[];
      options: Record<string, unknown>;
    }, PlayerDomainWritePlan>('persistence-build', { playerId, snapshot, domains, options: {} }, null, 1000));
    push(`Phase 5: Persistence write plan ${iterations} iterations (real worker)`, sync, worker);
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
    console.log(`    wall: sync ${r.syncMs.toFixed(1)}ms | worker ${r.workerMs.toFixed(1)}ms | speedup ${r.speedup.toFixed(2)}x`);
    console.log(`    main-thread active: sync ${r.syncActiveMs.toFixed(1)}ms | worker ${r.workerActiveMs.toFixed(1)}ms | reduction ${(r.activeReduction * 100).toFixed(1)}%`);
  }
  console.log('─'.repeat(80));
  console.log('\nNote: 单机基准包含 worker 消息传递成本；主线程 active time 以 eventLoopUtilization 近似，真实收益依赖多核、并发负载和主线程让渡。\n');
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), results: results.map((r) => ({ label: r.label, syncMs: r.syncMs, workerMs: r.workerMs, speedup: r.speedup, syncActiveMs: r.syncActiveMs, workerActiveMs: r.workerActiveMs, activeReduction: r.activeReduction })) }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
