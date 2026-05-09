// @ts-nocheck

import assert from 'node:assert/strict';

import {
  createNumericRatioDivisors,
  createNumericStats,
  Direction,
  TileType,
} from '@mud/shared';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { createMonsterPendingCombatCast } from '../runtime/combat/pending-combat-cast.helpers';

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
  stats.maxQi = 100;
  stats.maxQiOutputPerTick = 100;
  stats.physAtk = 7;
  stats.spellAtk = 1;
  stats.hpRegenRate = 0;
  stats.qiRegenRate = 0;
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

function testPendingCastCompletionDoesNotDropWhenOriginalTargetDisconnects() {
  const instance = createInstance({
    skills: [{
      id: 'monster:warning_strike',
      name: '预警打击',
      range: 5,
      cooldown: 1,
      cost: 0,
      targeting: { shape: 'single' },
      monsterCast: {
        windupTicks: 1,
        warningColor: '#ffcc66',
      },
      effects: [],
    }],
  });
  connectTargetPlayer(instance);
  assert.equal(instance.damageTile(2, 1, Number.MAX_SAFE_INTEGER)?.destroyed, true);

  const chant = instance.tickOnce();
  assert.equal(chant.monsterActions.length, 1);
  assert.equal(chant.monsterActions[0]?.kind, 'skill_chant');
  assert.equal(chant.monsterActions[0]?.targetPlayerId, 'player:target');
  assert.deepEqual(chant.monsterActions[0]?.warningCells, [{ x: 3, y: 1 }]);

  assert.equal(instance.disconnectPlayer('player:target'), true);
  const completed = instance.tickOnce();

  assert.equal(completed.monsterActions.length, 1);
  assert.equal(completed.monsterActions[0]?.kind, 'skill');
  assert.equal(completed.monsterActions[0]?.skillId, 'monster:warning_strike');
  assert.equal(completed.monsterActions[0]?.targetPlayerId, 'player:target');
  assert.equal(completed.monsterActions[0]?.targetX, 3);
  assert.equal(completed.monsterActions[0]?.targetY, 1);
  assert.deepEqual(completed.monsterActions[0]?.warningCells, [{ x: 3, y: 1 }]);
}

function testMonsterPendingCastActorDeadEmitsCancelAction() {
  const instance = createInstance();
  const monster = instance.monstersByRuntimeId.get('monster:los');
  monster.pendingCast = createMonsterPendingCombatCast({
    runtimeId: 'monster:los',
    instanceId: 'instance:monster-los-smoke',
    skillId: 'monster:warning_strike',
    targetPlayerId: 'player:target',
    anchor: { x: 3, y: 1 },
    warningCells: [{ x: 3, y: 1 }],
    remainingTicks: 2,
    startedTick: 0,
    resolveTick: 2,
  });
  assert.equal(instance.defeatMonster('monster:los')?.alive, false);
  const result = instance.tickOnce();
  assert.equal(result.monsterActions.length, 1);
  assert.equal(result.monsterActions[0]?.kind, 'skill_cancel');
  assert.equal(result.monsterActions[0]?.cancelReason, 'actor_dead');
  assert.equal(result.monsterActions[0]?.skillId, 'monster:warning_strike');
}

function testMonsterPendingCastRevisionMismatchEmitsCancelAction() {
  const instance = createInstance({
    skills: [{
      id: 'monster:warning_strike',
      name: '预警打击',
      version: 2,
      cooldown: 1,
      windupTicks: 1,
      range: 5,
      targeting: { shape: 'single' },
      effects: [{ type: 'damage' }],
    }],
  });
  const monster = instance.monstersByRuntimeId.get('monster:los');
  monster.pendingCast = createMonsterPendingCombatCast({
    runtimeId: 'monster:los',
    instanceId: 'instance:monster-los-smoke',
    skillId: 'monster:warning_strike',
    targetPlayerId: 'player:target',
    anchor: { x: 3, y: 1 },
    warningCells: [{ x: 3, y: 1 }],
    remainingTicks: 2,
    startedTick: 0,
    resolveTick: 2,
    configRevision: 1,
  });
  const result = instance.tickOnce();
  assert.equal(result.monsterActions.length, 1);
  assert.equal(result.monsterActions[0]?.kind, 'skill_cancel');
  assert.equal(result.monsterActions[0]?.cancelReason, 'config_revision_mismatch');
}

function testMonsterPendingCastExpiredEmitsCancelAction() {
  const instance = createInstance();
  const monster = instance.monstersByRuntimeId.get('monster:los');
  monster.pendingCast = createMonsterPendingCombatCast({
    runtimeId: 'monster:los',
    instanceId: 'instance:monster-los-smoke',
    skillId: 'monster:warning_strike',
    targetPlayerId: 'player:target',
    anchor: { x: 3, y: 1 },
    warningCells: [{ x: 3, y: 1 }],
    remainingTicks: 2,
    startedTick: 0,
    resolveTick: 0,
  });
  const result = instance.tickOnce();
  assert.equal(result.monsterActions.length, 1);
  assert.equal(result.monsterActions[0]?.kind, 'skill_cancel');
  assert.equal(result.monsterActions[0]?.cancelReason, 'expired');
}

function testMonsterPendingCastNotPersistedAndClearedOnHydrate() {
  const instance = createInstance({ tier: 'demon_king' });
  const monster = instance.monstersByRuntimeId.get('monster:los');
  monster.pendingCast = createMonsterPendingCombatCast({
    runtimeId: 'monster:los',
    instanceId: 'instance:monster-los-smoke',
    skillId: 'monster:warning_strike',
    targetPlayerId: 'player:target',
    anchor: { x: 3, y: 1 },
    warningCells: [{ x: 3, y: 1 }],
    remainingTicks: 2,
    startedTick: 0,
    resolveTick: 2,
  });
  const entries = instance.buildMonsterRuntimePersistenceEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].statePayload.pendingCast, undefined);

  const restored = createInstance({ tier: 'demon_king' });
  const restoredMonster = restored.monstersByRuntimeId.get('monster:los');
  restoredMonster.pendingCast = createMonsterPendingCombatCast({
    runtimeId: 'monster:los',
    instanceId: 'instance:monster-los-smoke',
    skillId: 'monster:warning_strike',
    targetPlayerId: 'player:target',
    anchor: { x: 3, y: 1 },
    warningCells: [{ x: 3, y: 1 }],
    remainingTicks: 2,
    startedTick: 0,
    resolveTick: 2,
  });
  restored.hydrateMonsterRuntimeStates([{
    runtimeId: 'monster:los',
    monsterId: 'monster.los',
    monsterName: '隔墙妖兽',
    monsterTier: 'demon_king',
    monsterLevel: 1,
    x: 1,
    y: 1,
    hp: 50,
    maxHp: 50,
    qi: 0,
    maxQi: 0,
    alive: true,
    respawnLeft: 0,
    respawnTicks: 30,
    statePayload: {
      pendingCast: { stale: true },
      attackReadyTick: 3,
    },
  }]);
  assert.equal(restored.monstersByRuntimeId.get('monster:los')?.pendingCast, undefined);
}

function testInstantMonsterSkillCommitsResourceCooldownAndDirtyRuntime() {
  const skillId = 'monster:instant_strike';
  const instance = createInstance({
    tier: 'demon_king',
    skills: [{
      id: skillId,
      name: '瞬发打击',
      range: 5,
      cooldown: 3,
      cost: 12,
      targeting: { shape: 'single' },
      monsterCast: { windupTicks: 0 },
      effects: [],
    }],
  });
  instance.monstersByRuntimeId.get('monster:los').qi = 30;
  connectTargetPlayer(instance);
  assert.equal(instance.damageTile(2, 1, Number.MAX_SAFE_INTEGER)?.destroyed, true);
  const revisionBeforeCast = instance.worldRevision;

  const result = instance.tickOnce();
  const monster = instance.monstersByRuntimeId.get('monster:los');
  const delta = instance.buildMonsterRuntimePersistenceDelta();

  assert.equal(result.monsterActions.length, 1);
  assert.equal(result.monsterActions[0]?.kind, 'skill');
  assert.equal(result.monsterActions[0]?.skillId, skillId);
  assert.equal(instance.worldRevision, revisionBeforeCast + 1);
  assert.equal(monster.qi, 18);
  assert.equal(monster.cooldownReadyTickBySkillId[skillId], 4);
  assert.equal(delta.fullReplace, false);
  assert.equal(delta.upserts.length, 1);
  assert.equal(delta.upserts[0]?.monsterRuntimeId, 'monster:los');
  assert.equal(delta.upserts[0]?.statePayload?.qi, 18);
  assert.equal(delta.upserts[0]?.statePayload?.cooldownReadyTickBySkillId?.[skillId], 4);
}

function testChantedMonsterSkillCommitsOnceAndCarriesResourceCooldownSnapshots() {
  const skillId = 'monster:chant_strike';
  const instance = createInstance({
    tier: 'demon_king',
    skills: [{
      id: skillId,
      name: '蓄势打击',
      range: 5,
      cooldown: 4,
      cost: 9,
      targeting: { shape: 'single' },
      monsterCast: {
        windupTicks: 1,
        warningColor: '#ffcc66',
      },
      effects: [],
    }],
  });
  instance.monstersByRuntimeId.get('monster:los').qi = 30;
  connectTargetPlayer(instance);
  assert.equal(instance.damageTile(2, 1, Number.MAX_SAFE_INTEGER)?.destroyed, true);
  const revisionBeforeCast = instance.worldRevision;

  const chant = instance.tickOnce();
  const monsterAfterChant = instance.monstersByRuntimeId.get('monster:los');
  assert.equal(chant.monsterActions.length, 1);
  assert.equal(chant.monsterActions[0]?.kind, 'skill_chant');
  assert.equal(chant.monsterActions[0]?.skillId, skillId);
  assert.equal(instance.worldRevision, revisionBeforeCast + 1);
  assert.equal(monsterAfterChant.qi, 21);
  assert.equal(monsterAfterChant.cooldownReadyTickBySkillId[skillId], 5);
  assert.equal(monsterAfterChant.pendingCast?.committedResourceSnapshot?.kind, 'qi');
  assert.equal(monsterAfterChant.pendingCast?.committedResourceSnapshot?.spent, 9);
  assert.equal(monsterAfterChant.pendingCast?.committedCooldownSnapshot?.actionId, skillId);
  assert.equal(monsterAfterChant.pendingCast?.committedCooldownSnapshot?.readyTick, 5);

  const completed = instance.tickOnce();
  const monsterAfterComplete = instance.monstersByRuntimeId.get('monster:los');
  assert.equal(completed.monsterActions.length, 1);
  assert.equal(completed.monsterActions[0]?.kind, 'skill');
  assert.equal(completed.monsterActions[0]?.skillId, skillId);
  assert.equal(completed.monsterActions[0]?.targetX, 3);
  assert.equal(completed.monsterActions[0]?.targetY, 1);
  assert.equal(monsterAfterComplete.qi, 21);
  assert.equal(monsterAfterComplete.cooldownReadyTickBySkillId[skillId], 5);
}

function testMonsterSkillInsufficientQiDoesNotEmitActionOrCommitCooldown() {
  const skillId = 'monster:hungry_strike';
  const instance = createInstance({
    tier: 'demon_king',
    skills: [{
      id: skillId,
      name: '灵力不足打击',
      range: 5,
      cooldown: 3,
      cost: 12,
      targeting: { shape: 'single' },
      monsterCast: { windupTicks: 0 },
      effects: [],
    }],
  });
  instance.monstersByRuntimeId.get('monster:los').qi = 8;
  connectTargetPlayer(instance);
  assert.equal(instance.damageTile(2, 1, Number.MAX_SAFE_INTEGER)?.destroyed, true);

  const result = instance.tickOnce();
  const monster = instance.monstersByRuntimeId.get('monster:los');
  const delta = instance.buildMonsterRuntimePersistenceDelta();

  assert.equal(result.monsterActions.some((action) => action.kind === 'skill' || action.kind === 'skill_chant'), false);
  assert.equal(monster.qi, 8);
  assert.equal(monster.cooldownReadyTickBySkillId[skillId], undefined);
  assert.equal(delta.fullReplace, false);
  assert.deepEqual(delta.upserts, []);
  assert.deepEqual(delta.deletes, []);
}

testMonsterDoesNotAcquireTargetBehindWall();
testMonsterAcquiresTargetAfterWallDestroyed();
testDynamicBarrierBlocksMovementButNotSight();
testPendingCastCompletionDoesNotDropWhenOriginalTargetDisconnects();
testMonsterPendingCastActorDeadEmitsCancelAction();
testMonsterPendingCastRevisionMismatchEmitsCancelAction();
testMonsterPendingCastExpiredEmitsCancelAction();
testMonsterPendingCastNotPersistedAndClearedOnHydrate();
testInstantMonsterSkillCommitsResourceCooldownAndDirtyRuntime();
testChantedMonsterSkillCommitsOnceAndCarriesResourceCooldownSnapshots();
testMonsterSkillInsufficientQiDoesNotEmitActionOrCommitCooldown();

console.log(JSON.stringify({
  ok: true,
  case: 'world-runtime-monster-los',
  answers: '妖兽不会隔墙索敌或攻击；遮挡地块被摧毁后才会按视野重新索敌；动态阵法边界挡通行但不遮挡视线；吟唱完成时原目标断开也不会静默丢弃技能 action；怪物 pending cast 死亡、过期和配置版本不匹配会产出取消 action；怪物 pending cast 不持久化且 hydrate 时显式清空；怪物瞬发/吟唱技能在 tick 生产阶段预提交元气与冷却，吟唱完成不重复扣元气，元气不足不产出技能 action 或冷却提交。',
}, null, 2));
