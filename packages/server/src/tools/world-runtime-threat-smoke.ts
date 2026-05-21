import assert from 'node:assert/strict';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { WorldRuntimeThreatService, calculateThreatDelta } from '../runtime/world/combat/world-runtime-threat.service';

function testThreatFormulaAndSorting(): void {
  const service = new WorldRuntimeThreatService();
  const ownerId = service.buildPlayerOwnerId('owner');

  const farDelta = calculateThreatDelta({ baseThreat: 100, distance: 3, extraAggroRate: 50 });
  assert.equal(Math.round(farDelta * 100) / 100, 121.5);

  service.addThreat(ownerId, 'monster:b', { baseThreat: 10, distance: 1, now: 1 });
  service.addThreat(ownerId, 'monster:a', { baseThreat: 10, distance: 1, now: 2 });
  service.addThreat(ownerId, 'monster:c', { baseThreat: 20, distance: 1, now: 1 });

  assert.deepEqual(service.getThreatEntries(ownerId).map((entry) => entry.targetId), [
    'monster:c',
    'monster:a',
    'monster:b',
  ]);
}

function testThreatDecayAndUnreachableReduction(): void {
  const service = new WorldRuntimeThreatService();
  const ownerId = service.buildPlayerOwnerId('owner');

  service.addThreat(ownerId, 'monster:blocked', { baseThreat: 100, distance: 1, now: 1 });
  assert.equal(service.multiplyThreat(ownerId, 'monster:blocked', 0.2), 20);

  service.decayMissingTargets(ownerId, new Set(), 1000, 2);
  assert.equal(service.getThreat(ownerId, 'monster:blocked'), 8);

  service.decayMissingTargets(ownerId, new Set(), 1000, 3);
  assert.equal(service.getThreat(ownerId, 'monster:blocked'), 0);
}

function testClearTargetEverywhere(): void {
  const service = new WorldRuntimeThreatService();
  const left = service.buildPlayerOwnerId('left');
  const right = service.buildPlayerOwnerId('right');
  const target = service.buildPlayerTargetId('target');

  service.addThreat(left, target, { baseThreat: 5, now: 1 });
  service.addThreat(right, target, { baseThreat: 7, now: 1 });
  service.clearTargetEverywhere(target);

  assert.equal(service.getThreat(left, target), 0);
  assert.equal(service.getThreat(right, target), 0);
}

function testMonsterRuntimeThreatSelectsHighestTarget(): void {
  const monster = {
    runtimeId: 'monster:1',
    alive: true,
    maxHp: 1000,
    x: 0,
    y: 0,
    spawnX: 0,
    spawnY: 0,
    aggroRange: 8,
    leashRange: 8,
    numericStats: { extraAggroRate: 0 },
    aggroTargetPlayerId: null,
  };
  const playerA = { playerId: 'player:a', x: 1, y: 0 };
  const playerB = { playerId: 'player:b', x: 2, y: 0 };
  const runtime: Record<string, unknown> = {
    tick: 1,
    monstersByRuntimeId: new Map([[monster.runtimeId, monster]]),
    playersById: new Map([
      [playerA.playerId, playerA],
      [playerB.playerId, playerB],
    ]),
    monsterThreatByRuntimeId: new Map(),
    getMonsterThreatTable: MapInstanceRuntime.prototype.getMonsterThreatTable,
    addMonsterThreat: MapInstanceRuntime.prototype.addMonsterThreat,
    decayMonsterThreats: MapInstanceRuntime.prototype.decayMonsterThreats,
    getHighestMonsterThreatTarget: MapInstanceRuntime.prototype.getHighestMonsterThreatTarget,
    rememberMonsterTargetSight: MapInstanceRuntime.prototype.rememberMonsterTargetSight,
    toTileIndex(x: number, y: number) {
      return y * 1000 + x;
    },
    collectVisibleTileIndices() {
      return new Set([0, 1, 2]);
    },
  };

  MapInstanceRuntime.prototype.addMonsterThreat.call(runtime, monster.runtimeId, playerA.playerId, 100, 1, 0);
  MapInstanceRuntime.prototype.addMonsterThreat.call(runtime, monster.runtimeId, playerB.playerId, 300, 1, 0);
  const target = MapInstanceRuntime.prototype.resolveMonsterTarget.call(runtime, monster);

  assert.equal(target?.playerId, playerB.playerId);
  assert.equal(monster.aggroTargetPlayerId, playerB.playerId);
}

function testPassiveSightThreatCanAcquirePositionOnlyPlayer(): void {
  const monster = {
    runtimeId: 'monster:passive',
    alive: true,
    maxHp: 1000,
    x: 0,
    y: 0,
    spawnX: 0,
    spawnY: 0,
    aggroRange: 8,
    leashRange: 8,
    numericStats: { extraAggroRate: 0 },
    aggroTargetPlayerId: null,
  };
  const player = { playerId: 'player:visible', x: 2, y: 0 };
  const runtime: Record<string, unknown> = {
    tick: 1,
    monstersByRuntimeId: new Map([[monster.runtimeId, monster]]),
    playersById: new Map([[player.playerId, player]]),
    monsterThreatByRuntimeId: new Map(),
    getMonsterThreatTable: MapInstanceRuntime.prototype.getMonsterThreatTable,
    addMonsterThreat: MapInstanceRuntime.prototype.addMonsterThreat,
    decayMonsterThreats: MapInstanceRuntime.prototype.decayMonsterThreats,
    getHighestMonsterThreatTarget: MapInstanceRuntime.prototype.getHighestMonsterThreatTarget,
    rememberMonsterTargetSight: MapInstanceRuntime.prototype.rememberMonsterTargetSight,
    toTileIndex(x: number, y: number) {
      return y * 1000 + x;
    },
    collectVisibleTileIndices() {
      return new Set([0, 1, 2]);
    },
  };

  const target = MapInstanceRuntime.prototype.resolveMonsterTarget.call(runtime, monster);

  assert.equal(target?.playerId, player.playerId);
  assert.equal(monster.aggroTargetPlayerId, player.playerId);
  assert.equal(MapInstanceRuntime.prototype.getHighestMonsterThreatTarget.call(runtime, monster, () => true)?.value, 1);
}

testThreatFormulaAndSorting();
testThreatDecayAndUnreachableReduction();
testClearTargetEverywhere();
testMonsterRuntimeThreatSelectsHighestTarget();
testPassiveSightThreatCanAcquirePositionOnlyPlayer();

console.log('world-runtime-threat-smoke passed');
