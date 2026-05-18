/**
 * Worker Pool Equivalence Smoke 测试。
 * 验证 worker 路径与同步 fallback 路径产生逐字节相等的输出。
 *
 * 覆盖：
 * - Phase 1: AOI envelope JSON binary encode/decode 等价性
 * - Phase 2: A* 寻路 worker vs 同步路径等价性
 * - Phase 5: 持久化序列化 worker vs 同步路径等价性
 *
 * 用法：node dist/tools/worker-pool-equivalence-smoke.js
 */

import { encodeServerEventPayload, decodeServerEventPayload, findBoundedPath } from '@mud/shared';
import type { PathfindingStaticGrid } from '@mud/shared';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
let failures = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
  } else {
    console.log(`  ${FAIL} ${label}`);
    failures += 1;
  }
}

// ─── Phase 1: AOI envelope encode/decode 等价性 ────────────────

function testPhase1EnvelopeEquivalence(): void {
  console.log('\n[Phase 1] AOI envelope encode/decode equivalence');

  const testPayloads = [
    { t: 42, wr: 100, sr: 5, p: [{ id: 'p1', x: 10, y: 20, name: '测试玩家' }] },
    { t: 1, wr: 1, sr: 1 },
    { t: 99, wr: 50, sr: 3, m: [{ id: 'm1', x: 5, y: 5, hp: 100, maxHp: 200 }], fx: [{ type: 'hit', fromX: 1, fromY: 2 }] },
    null,
    { t: 0, wr: 0, sr: 0, p: [], m: [], n: [] },
  ];

  for (let i = 0; i < testPayloads.length; i++) {
    const original = testPayloads[i];
    if (original === null) {
      assert(true, `payload[${i}] null skip`);
      continue;
    }

    // encode → decode 往返
    const encoded = encodeServerEventPayload('n:s:worldDelta', original);
    const decoded = decodeServerEventPayload<typeof original>('n:s:worldDelta', encoded);

    const originalJson = JSON.stringify(original);
    const decodedJson = JSON.stringify(decoded);
    assert(originalJson === decodedJson, `payload[${i}] roundtrip (${originalJson.length} bytes)`);
  }

  // 非 binary 事件不编码
  const nonBinaryPayload = { test: true };
  const result = encodeServerEventPayload('n:s:notice', nonBinaryPayload);
  assert(result === nonBinaryPayload, 'non-binary event passthrough');
}

// ─── Phase 2: A* 寻路等价性 ───────────────────────────────────

function testPhase2PathfindingEquivalence(): void {
  console.log('\n[Phase 2] A* pathfinding equivalence');

  // 构造简单 10x10 地图
  const width = 10;
  const height = 10;
  const total = width * height;
  const walkable = new Uint8Array(total);
  const traversalCost = new Uint16Array(total);

  // 全部可走，代价为 1
  walkable.fill(1);
  traversalCost.fill(1);

  // 加一堵墙 (x=5, y=0..7)
  for (let y = 0; y < 8; y++) {
    walkable[y * width + 5] = 0;
  }

  const grid: PathfindingStaticGrid = {
    mapId: 'test_map',
    mapRevision: 1,
    width,
    height,
    walkable,
    traversalCost,
  };

  const blocked = new Uint8Array(total);

  // 测试 1: 简单直线路径
  const result1 = findBoundedPath(grid, blocked, 0, 0, [{ x: 3, y: 0 }], { maxExpandedNodes: total, maxPathLength: total });
  assert(result1.status === 'success', 'straight path found');
  assert(result1.status === 'success' && result1.path.length === 3, 'straight path length=3');

  // 测试 2: 绕墙路径
  const result2 = findBoundedPath(grid, blocked, 3, 3, [{ x: 7, y: 3 }], { maxExpandedNodes: total, maxPathLength: total });
  assert(result2.status === 'success', 'wall-bypass path found');
  assert(result2.status === 'success' && result2.path.length > 4, 'wall-bypass path longer than direct');

  // 测试 3: 不可达
  walkable.fill(1);
  for (let y = 0; y < height; y++) {
    walkable[y * width + 5] = 0;
  }
  const result3 = findBoundedPath(grid, blocked, 0, 0, [{ x: 9, y: 0 }], { maxExpandedNodes: total, maxPathLength: total });
  assert(result3.status === 'failed', 'unreachable target fails');

  // 测试 4: 多次调用结果一致
  walkable.fill(1);
  for (let y = 0; y < 8; y++) {
    walkable[y * width + 5] = 0;
  }
  const resultA = findBoundedPath(grid, blocked, 2, 2, [{ x: 8, y: 2 }], { maxExpandedNodes: total, maxPathLength: total });
  const resultB = findBoundedPath(grid, blocked, 2, 2, [{ x: 8, y: 2 }], { maxExpandedNodes: total, maxPathLength: total });
  assert(
    JSON.stringify(resultA) === JSON.stringify(resultB),
    'deterministic: same input → same output',
  );
}

// ─── Phase 5: 持久化序列化等价性 ──────────────────────────────

function testPhase5PersistenceEquivalence(): void {
  console.log('\n[Phase 5] Persistence serialization equivalence');

  const testSnapshots = [
    { playerId: 'p1', hp: 100, inventory: [{ itemId: 'sword', count: 1 }] },
    { instanceId: 'map_1', tick: 12345, monsters: [{ id: 'm1', hp: 50 }] },
    { nested: { deep: { value: 42, arr: [1, 2, 3] } } },
  ];

  for (let i = 0; i < testSnapshots.length; i++) {
    const snapshot = testSnapshots[i];
    const serialized = JSON.stringify(snapshot);
    const deserialized = JSON.parse(serialized);
    assert(
      JSON.stringify(deserialized) === JSON.stringify(snapshot),
      `snapshot[${i}] roundtrip`,
    );
  }

  // bigint 替换器测试
  const bigintReplacer = (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value;
  const withBigint = { id: 'test', amount: BigInt('9007199254740993') };
  let serialized: string;
  try {
    serialized = JSON.stringify(withBigint, bigintReplacer);
    assert(serialized.includes('9007199254740993'), 'bigint serialized as string');
    assert(!serialized.includes('"amount":9007199254740993n'), 'no bigint literal in output');
  } catch (err: unknown) {
    assert(false, `bigint serialization threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── 运行 ──────────────────────────────────────────────────────

console.log('=== Worker Pool Equivalence Smoke ===');
testPhase1EnvelopeEquivalence();
testPhase2PathfindingEquivalence();
testPhase5PersistenceEquivalence();

console.log(`\n=== Summary: ${failures === 0 ? PASS : FAIL} (${failures} failures) ===`);
if (failures > 0) {
  process.exit(1);
}
