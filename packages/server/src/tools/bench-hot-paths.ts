/**
 * bench-hot-paths.ts — 热路径性能基准：寻路、FOV、怪物派生状态重算。
 *
 * 用法：node dist/tools/bench-hot-paths.js
 */

import {
  createNumericRatioDivisors,
  createNumericStats,
  Direction,
} from '@mud/shared';

import { collectVisibleTileIndices } from '../runtime/instance/fov';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { findPathPointsOnMap } from '../runtime/world/world-runtime.path-planning.helpers';

// ─── 地图模板 ───

const MAP_SIZE = 64;

function createTemplate() {
  const walkable = new Uint8Array(MAP_SIZE * MAP_SIZE);
  const blocksSight = new Uint8Array(MAP_SIZE * MAP_SIZE);
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const idx = y * MAP_SIZE + x;
      const isWall = x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1;
      walkable[idx] = isWall ? 0 : 1;
      blocksSight[idx] = isWall ? 1 : 0;
    }
  }
  // 散布一些障碍
  for (let i = 10; i < MAP_SIZE - 10; i += 7) {
    for (let j = 10; j < MAP_SIZE - 10; j += 7) {
      const idx = j * MAP_SIZE + i;
      walkable[idx] = 0;
      blocksSight[idx] = 1;
    }
  }
  return {
    id: 'bench_hot_paths',
    name: '热路径基准',
    width: MAP_SIZE,
    height: MAP_SIZE,
    terrainRows: Array.from({ length: MAP_SIZE }, (_, y) =>
      Array.from({ length: MAP_SIZE }, (_, x) => (walkable[y * MAP_SIZE + x] ? '.' : '#')).join(''),
    ),
    walkableMask: walkable,
    blocksSightMask: blocksSight,
    baseAuraByTile: new Int32Array(MAP_SIZE * MAP_SIZE),
    baseTileResourceEntries: [],
    npcs: [],
    landmarks: [],
    containers: [],
    safeZones: [],
    portals: [],
    spawnX: 2,
    spawnY: 2,
    source: {},
  };
}

function createMonsterSpawn(id: string, x: number, y: number) {
  const stats = createNumericStats();
  stats.maxHp = 100;
  stats.maxQi = 50;
  stats.physAtk = 10;
  stats.spellAtk = 5;
  return {
    runtimeId: `monster:${id}`,
    monsterId: `monster.${id}`,
    spawnOriginX: x,
    spawnOriginY: y,
    x,
    y,
    hp: 100,
    maxHp: 100,
    alive: true,
    respawnLeft: 0,
    respawnTicks: 60,
    facing: Direction.South,
    name: `怪物${id}`,
    char: '妖',
    color: '#cc4444',
    level: 5,
    tier: 'mortal_blood' as const,
    baseAttrs: { constitution: 5, spirit: 3, perception: 2, talent: 1, strength: 4, meridians: 2 },
    baseNumericStats: stats,
    ratioDivisors: createNumericRatioDivisors(),
    skills: [],
    aggroRange: 6,
    leashRange: 10,
    wanderRadius: 3,
    attackRange: 1,
    attackCooldownTicks: 2,
  };
}

// ─── 基准执行 ───

interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  p95Ms: number;
}

function benchPathfinding(instance: MapInstanceRuntime): BenchResult {
  const iterations = 100;
  const samples: number[] = [];
  const goals = [{ x: MAP_SIZE - 3, y: MAP_SIZE - 3 }];

  for (let i = 0; i < iterations; i++) {
    const startX = 2 + (i % 10);
    const startY = 2 + Math.floor(i / 10) % 10;
    const t0 = performance.now();
    findPathPointsOnMap(instance, `player:bench`, startX, startY, goals, true);
    samples.push(performance.now() - t0);
  }

  return summarize('findPathPointsOnMap', iterations, samples);
}

function benchFOV(): BenchResult {
  const iterations = 1000;
  const samples: number[] = [];
  const isSightBlocked = (idx: number) => {
    const x = idx % MAP_SIZE;
    const y = Math.floor(idx / MAP_SIZE);
    return x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1;
  };

  for (let i = 0; i < iterations; i++) {
    const ox = 5 + (i % (MAP_SIZE - 10));
    const oy = 5 + Math.floor(i / (MAP_SIZE - 10)) % (MAP_SIZE - 10);
    const t0 = performance.now();
    collectVisibleTileIndices(MAP_SIZE, MAP_SIZE, ox, oy, 10, isSightBlocked);
    samples.push(performance.now() - t0);
  }

  return summarize('collectVisibleTileIndices', iterations, samples);
}

function benchMonsterDerived(instance: MapInstanceRuntime): BenchResult {
  const iterations = 1000;
  const samples: number[] = [];
  const runtimeId = 'monster:m0';
  const monster = instance.getMonster(runtimeId);
  if (!monster) throw new Error('Monster not found');

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    instance.applyTemporaryBuffToMonster(runtimeId, {
      buffId: 'bench:cycle',
      name: '基准',
      stacks: 1 + (i % 5),
      maxStacks: 10,
      remainingTicks: 9999,
      duration: 9999,
      attrs: { constitution: 0, spirit: 0, perception: 0, talent: 0, strength: 2 + (i % 3), meridians: 0 },
      attrMode: 'flat',
    } as any);
    samples.push(performance.now() - t0);
  }

  return summarize('recalculateMonsterDerivedState (via applyBuff)', iterations, samples);
}

function summarize(name: string, iterations: number, samples: number[]): BenchResult {
  const sorted = samples.slice().sort((a, b) => a - b);
  const totalMs = sorted.reduce((s, v) => s + v, 0);
  const avgMs = totalMs / iterations;
  const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { name, iterations, totalMs: +totalMs.toFixed(3), avgMs: +avgMs.toFixed(4), p95Ms: +p95Ms.toFixed(4) };
}

function printTable(results: BenchResult[]) {
  const header = ['Function', 'Iterations', 'Total (ms)', 'Avg (ms)', 'P95 (ms)'];
  const rows = results.map(r => [r.name, String(r.iterations), String(r.totalMs), String(r.avgMs), String(r.p95Ms)]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const sep = widths.map(w => '-'.repeat(w + 2)).join('+');
  const fmt = (row: string[]) => row.map((c, i) => ` ${c.padEnd(widths[i])} `).join('|');

  console.log(sep);
  console.log(fmt(header));
  console.log(sep);
  for (const row of rows) console.log(fmt(row));
  console.log(sep);
}

function main() {
  const template = createTemplate();
  const monsterSpawns = [createMonsterSpawn('m0', 10, 10)];
  const instance = new MapInstanceRuntime({
    instanceId: 'bench:hot-paths',
    template,
    monsterSpawns,
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: '热路径基准',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'bench',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: false,
  });

  // warmup
  for (let i = 0; i < 10; i++) {
    findPathPointsOnMap(instance, 'player:warmup', 2, 2, [{ x: 30, y: 30 }], true);
    collectVisibleTileIndices(MAP_SIZE, MAP_SIZE, 32, 32, 10, () => false);
  }

  const results: BenchResult[] = [
    benchPathfinding(instance),
    benchFOV(),
    benchMonsterDerived(instance),
  ];

  printTable(results);
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main();
