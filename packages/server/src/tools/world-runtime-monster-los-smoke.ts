// @ts-nocheck

import assert from 'node:assert/strict';

import {
  createNumericRatioDivisors,
  createNumericStats,
  Direction,
  TileType,
} from '@mud/shared';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';

function createTemplate() {
  return {
    id: 'monster_los_smoke_map',
    name: '妖兽视野 Smoke',
    width: 5,
    height: 3,
    terrainRows: [
      '.....',
      '..#..',
      '.....',
    ],
    walkableMask: Uint8Array.from([
      1, 1, 1, 1, 1,
      1, 1, 0, 1, 1,
      1, 1, 1, 1, 1,
    ]),
    blocksSightMask: Uint8Array.from([
      0, 0, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 0, 0,
    ]),
    baseAuraByTile: Int32Array.from({ length: 15 }, () => 0),
    baseTileResourceEntries: [],
    npcs: [],
    landmarks: [],
    containers: [],
    safeZones: [],
    portals: [],
    spawnX: 0,
    spawnY: 0,
    source: {},
  };
}

function createMonsterSpawn(overrides = {}) {
  const stats = createNumericStats();
  stats.maxHp = 50;
  stats.physAtk = 7;
  stats.spellAtk = 1;
  stats.hpRegenRate = 0;
  return {
    runtimeId: 'monster:los',
    monsterId: 'monster.los',
    spawnOriginX: 1,
    spawnOriginY: 1,
    x: 1,
    y: 1,
    hp: 50,
    maxHp: 50,
    alive: true,
    respawnLeft: 0,
    respawnTicks: 30,
    facing: Direction.East,
    name: '隔墙妖兽',
    char: '妖',
    color: '#d27a7a',
    level: 1,
    tier: 'mortal_blood',
    baseAttrs: {
      constitution: 1,
      spirit: 1,
      perception: 1,
      talent: 1,
      strength: 1,
      meridians: 1,
    },
    baseNumericStats: stats,
    ratioDivisors: createNumericRatioDivisors(),
    skills: [],
    aggroRange: 5,
    leashRange: 8,
    wanderRadius: 0,
    attackRange: 5,
    attackCooldownTicks: 1,
    ...overrides,
  };
}

function createInstance(monsterOverrides = {}) {
  return new MapInstanceRuntime({
    instanceId: 'instance:monster-los-smoke',
    template: createTemplate(),
    monsterSpawns: [createMonsterSpawn(monsterOverrides)],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: 'Monster LOS Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: true,
  });
}

function connectTargetPlayer(instance: MapInstanceRuntime) {
  const player = instance.connectPlayer({
    playerId: 'player:target',
    sessionId: 'session:target',
    preferredX: 3,
    preferredY: 1,
  });
  assert.equal(player.x, 3);
  assert.equal(player.y, 1);
  return player;
}

function testMonsterDoesNotAcquireTargetBehindWall() {
  const instance = createInstance();
  connectTargetPlayer(instance);

  const result = instance.tickOnce();
  const monster = instance.getMonster('monster:los');

  assert.deepEqual(result.monsterActions, []);
  assert.equal(monster?.aggroTargetPlayerId, null);
  assert.equal(instance.canSeeTileFrom(1, 1, 3, 1, 5), false);
}

function testMonsterAcquiresTargetAfterWallDestroyed() {
  const instance = createInstance();
  connectTargetPlayer(instance);
  const destroyed = instance.damageTile(2, 1, Number.MAX_SAFE_INTEGER);

  assert.equal(destroyed?.destroyed, true);
  assert.equal(instance.getEffectiveTileType(2, 1), TileType.Floor);
  assert.equal(instance.canSeeTileFrom(1, 1, 3, 1, 5), true);

  const result = instance.tickOnce();
  const monster = instance.getMonster('monster:los');

  assert.equal(result.monsterActions.length, 1);
  assert.equal(result.monsterActions[0]?.kind, 'basic');
  assert.equal(result.monsterActions[0]?.targetPlayerId, 'player:target');
  assert.equal(monster?.aggroTargetPlayerId, 'player:target');
}

function testDynamicBarrierBlocksMovementButNotSight() {
  const instance = createInstance();
  instance.setDynamicTileBlocker((x, y) => x === 2 && y === 0);

  assert.equal(instance.isWalkable(2, 0), false);
  assert.equal(instance.isTileSightBlocked(2, 0), false);
  assert.equal(instance.canSeeTileFrom(1, 0, 3, 0, 5), true);
}

testMonsterDoesNotAcquireTargetBehindWall();
testMonsterAcquiresTargetAfterWallDestroyed();
testDynamicBarrierBlocksMovementButNotSight();

console.log(JSON.stringify({
  ok: true,
  case: 'world-runtime-monster-los',
  answers: '妖兽不会隔墙索敌或攻击；遮挡地块被摧毁后才会按视野重新索敌；动态阵法边界挡通行但不遮挡视线。',
}, null, 2));
