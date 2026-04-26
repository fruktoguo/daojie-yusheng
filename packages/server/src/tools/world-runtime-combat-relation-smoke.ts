// @ts-nocheck

const assert = require('node:assert/strict');
const { Direction } = require('@mud/shared');

const {
  resolveCombatRelation,
  canPlayerDealDamageToPlayer,
} = require('../runtime/player/player-combat-config.helpers');
const { WorldRuntimeAutoCombatService } = require('../runtime/world/world-runtime-auto-combat.service');
const { WorldRuntimeBasicAttackService } = require('../runtime/world/world-runtime-basic-attack.service');
const { WorldRuntimeBattleEngageService } = require('../runtime/world/world-runtime-battle-engage.service');
const { WorldRuntimePlayerSkillDispatchService } = require('../runtime/world/world-runtime-player-skill-dispatch.service');

function createPlayer(overrides = {}) {
  return {
    playerId: 'player:attacker',
    instanceId: 'instance:a',
    hp: 100,
    maxHp: 100,
    x: 10,
    y: 10,
    qi: 100,
    maxQi: 100,
    combatExp: 100,
    realm: { realmLv: 2 },
    buffs: [],
    attrs: {
      numericStats: {
        physAtk: 10,
        spellAtk: 12,
        viewRange: 8,
        maxQiOutputPerTick: 50,
      },
      ratioDivisors: {},
    },
    actions: {
      actions: [],
    },
    techniques: {
      techniques: [],
    },
    combat: {
      allowAoePlayerHit: false,
      retaliatePlayerTargetId: null,
      combatTargetingRules: undefined,
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
    },
    ...overrides,
  };
}

function createTarget(playerId, overrides = {}) {
  return {
    playerId,
    instanceId: 'instance:a',
    hp: 100,
    maxHp: 100,
    x: 11,
    y: 10,
    combatExp: 80,
    realm: { realmLv: 2 },
    buffs: [],
    attrs: {
      numericStats: {
        physDef: 1,
        spellDef: 1,
        dodge: 0,
      },
      ratioDivisors: {
        dodge: 1,
      },
    },
    combat: {},
    ...overrides,
  };
}

function createDemonizedTarget(playerId) {
  return createTarget(playerId, {
    buffs: [{
      buffId: 'pvp.sha_infusion',
      stacks: 21,
      remainingTicks: 12,
    }],
  });
}

function testResolveCombatRelation() {
  const attacker = createPlayer();
  const neutralTarget = createTarget('player:neutral');
  assert.deepEqual(resolveCombatRelation(attacker, {
    kind: 'player',
    target: neutralTarget,
  }), {
    relation: 'friendly',
    matchedRules: ['non_hostile_players'],
  });
  assert.equal(canPlayerDealDamageToPlayer(attacker, neutralTarget), false);

  const aoeAttacker = createPlayer({
    combat: {
      ...attacker.combat,
      allowAoePlayerHit: true,
    },
  });
  assert.deepEqual(resolveCombatRelation(aoeAttacker, {
    kind: 'player',
    target: neutralTarget,
  }), {
    relation: 'hostile',
    matchedRules: ['all_players'],
  });

  const retaliateAttacker = createPlayer({
    combat: {
      ...attacker.combat,
      retaliatePlayerTargetId: 'player:retaliator',
    },
  });
  assert.deepEqual(resolveCombatRelation(retaliateAttacker, {
    kind: 'player',
    target: createTarget('player:retaliator'),
  }), {
    relation: 'hostile',
    matchedRules: ['retaliators'],
  });

  assert.deepEqual(resolveCombatRelation(attacker, {
    kind: 'player',
    target: createDemonizedTarget('player:demonized'),
  }), {
    relation: 'hostile',
    matchedRules: ['demonized_players'],
  });

  assert.deepEqual(resolveCombatRelation(attacker, { kind: 'monster' }), {
    relation: 'hostile',
    matchedRules: ['monster'],
  });
  assert.deepEqual(resolveCombatRelation(attacker, { kind: 'terrain' }), {
    relation: 'hostile',
    matchedRules: ['terrain'],
  });

  const terrainOnlyAttacker = createPlayer({
    combat: {
      ...attacker.combat,
      combatTargetingRules: {
        hostile: ['terrain'],
        friendly: ['non_hostile_players'],
      },
    },
  });
  assert.deepEqual(resolveCombatRelation(terrainOnlyAttacker, { kind: 'monster' }), {
    relation: 'neutral',
    matchedRules: [],
    blockedReason: 'rule_not_matched',
  });
  assert.deepEqual(resolveCombatRelation(terrainOnlyAttacker, { kind: 'terrain' }), {
    relation: 'hostile',
    matchedRules: ['terrain'],
  });
}

async function testBasicAttackRejectsNeutralPlayer() {
  const attacker = createPlayer();
  const target = createTarget('player:neutral');
  const service = new WorldRuntimeBasicAttackService({
    getPlayerOrThrow(playerId) {
      if (playerId === target.playerId) {
        return target;
      }
      return attacker;
    },
  });
  await assert.rejects(
    () => service.dispatchBasicAttackToPlayer(attacker, target.playerId, 'spell', 12, 5, {
      getInstanceRuntimeOrThrow() {
        return {
          meta: {
            supportsPvp: true,
          },
        };
      },
    }),
    /敌方判定规则/,
  );
}

async function testSkillDispatchRejectsNeutralPlayer() {
  const attacker = createPlayer({
    actions: {
      actions: [{ id: 'skill.alpha', type: 'skill', requiresTarget: true }],
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill.alpha',
          name: '青木剑',
          effects: [{ type: 'damage', damageKind: 'spell' }],
          targeting: { range: 3 },
          range: 3,
        }],
      }],
    },
  });
  const target = createTarget('player:neutral');
  const playerRuntimeService = {
    getPlayerOrThrow(playerId) {
      if (playerId === attacker.playerId) {
        return attacker;
      }
      if (playerId === target.playerId) {
        return target;
      }
      throw new Error(`unexpected playerId ${playerId}`);
    },
    recordActivity() {
      return undefined;
    },
    getPlayer(playerId) {
      return playerId === target.playerId ? target : null;
    },
  };
  const service = new WorldRuntimePlayerSkillDispatchService(playerRuntimeService, {
    castSkill() {
      throw new Error('castSkill should not run for neutral player target');
    },
  });
  await assert.rejects(
    () => service.dispatchCastSkill(attacker.playerId, 'skill.alpha', target.playerId, null, null, {
      resolveCurrentTickForPlayerId() {
        return 8;
      },
      worldRuntimeCraftInterruptService: {
        interruptCraftForReason() {
          return undefined;
        },
      },
      ensureAttackAllowed() {
        return undefined;
      },
      getInstanceRuntimeOrThrow() {
        return {
          meta: {
            supportsPvp: true,
          },
        };
      },
    }),
    /敌方判定规则/,
  );
}

async function testSkillDispatchRejectsDisabledSkillAction() {
  const attacker = createPlayer({
    actions: {
      actions: [{ id: 'skill.alpha', type: 'skill', requiresTarget: true, skillEnabled: false }],
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill.alpha',
          name: '青木剑',
          effects: [{ type: 'damage', damageKind: 'spell' }],
          targeting: { range: 3 },
          range: 3,
        }],
      }],
    },
  });
  const log = [];
  const playerRuntimeService = {
    getPlayerOrThrow(playerId) {
      if (playerId === attacker.playerId) {
        return attacker;
      }
      throw new Error(`unexpected playerId ${playerId}`);
    },
    recordActivity() {
      log.push('recordActivity');
    },
  };
  const service = new WorldRuntimePlayerSkillDispatchService(playerRuntimeService, {
    castSkill() {
      throw new Error('castSkill should not run for disabled skill');
    },
  });
  await assert.rejects(
    () => service.dispatchCastSkill(attacker.playerId, 'skill.alpha', 'player:target', null, null, {
      resolveCurrentTickForPlayerId() {
        log.push('resolveCurrentTickForPlayerId');
        return 8;
      },
      worldRuntimeCraftInterruptService: {
        interruptCraftForReason() {
          log.push('interruptCraftForReason');
        },
      },
      ensureAttackAllowed() {
        log.push('ensureAttackAllowed');
      },
    }),
    /技能未启用，无法释放/,
  );
  assert.deepEqual(log, []);
}

function testAutoCombatPrefersRetaliator() {
  const player = createPlayer({
    combat: {
      allowAoePlayerHit: true,
      retaliatePlayerTargetId: 'player:retaliator',
      combatTargetingRules: undefined,
      autoBattle: true,
      autoRetaliate: true,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
    },
  });
  const players = new Map([
    ['player:neutral', createTarget('player:neutral', { x: 12, y: 10 })],
    ['player:demonized', createDemonizedTarget('player:demonized')],
    ['player:retaliator', createTarget('player:retaliator')],
  ]);
  const service = new WorldRuntimeAutoCombatService({
    getPlayer(playerId) {
      return players.get(playerId) ?? null;
    },
  });
  const result = service.selectAutoCombatPlayerTarget(player, {
    visiblePlayers: [
      { playerId: 'player:neutral' },
      { playerId: 'player:demonized' },
      { playerId: 'player:retaliator' },
    ],
  });
  assert.equal(result?.playerId, 'player:retaliator');
  assert.equal(result?.priority, 3);
}

function testAutoCombatMoveIsSingleStepLikeMainline() {
  const player = createPlayer({
    x: 2,
    y: 2,
    combat: {
      allowAoePlayerHit: false,
      retaliatePlayerTargetId: null,
      combatTargetingRules: undefined,
      autoBattle: true,
      autoRetaliate: true,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
    },
  });
  const log = [];
  const service = new WorldRuntimeAutoCombatService({
    getPlayer() {
      return null;
    },
    setCombatTarget(playerId, targetRef, locked, tick) {
      log.push(['setCombatTarget', playerId, targetRef, locked, tick]);
    },
  });
  const instance = {
    template: {
      width: 12,
      height: 12,
      walkableMask: new Uint8Array(12 * 12).fill(1),
    },
    isPointInSafeZone() {
      return false;
    },
    buildPlayerView() {
      return {
        self: { x: player.x, y: player.y },
        instance: { width: 12, height: 12 },
        visibleTileIndices: [],
        visiblePlayers: [],
        localMonsters: [{
          runtimeId: 'monster:runtime:1',
          x: 6,
          y: 2,
          hp: 50,
        }],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getMonster(runtimeId) {
      assert.equal(runtimeId, 'monster:runtime:1');
      return {
        runtimeId,
        alive: true,
        x: 6,
        y: 2,
        hp: 50,
      };
    },
    forEachPathingBlocker(_excludePlayerId, _visitor) {
      return undefined;
    },
    isWalkable() {
      return true;
    },
    getTileTraversalCost() {
      return 1;
    },
  };
  const command = service.buildAutoCombatCommand(instance, player, {
    resolveCurrentTickForPlayerId() {
      return 33;
    },
  });
  assert.deepEqual(command, {
    kind: 'move',
    direction: Direction.East,
    continuous: true,
    maxSteps: 3,
    path: [
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 5, y: 2 },
    ],
    autoCombat: true,
  });
  assert.deepEqual(log, [
    ['setCombatTarget', 'player:attacker', 'monster:runtime:1', false, 33],
  ]);
}

async function testEngageBattleRejectsNeutralPlayerBeforeLocking() {
  const log = [];
  const attacker = createPlayer();
  const target = createTarget('player:neutral');
  const service = new WorldRuntimeBattleEngageService({
    getPlayerOrThrow(playerId) {
      if (playerId === attacker.playerId) {
        return attacker;
      }
      if (playerId === target.playerId) {
        return target;
      }
      throw new Error(`unexpected playerId ${playerId}`);
    },
    updateCombatSettings(playerId, input, tick) {
      log.push(['updateCombatSettings', playerId, input, tick]);
    },
    setCombatTarget(playerId, targetRef, locked, tick) {
      log.push(['setCombatTarget', playerId, targetRef, locked, tick]);
    },
  });
  await assert.rejects(
    () => service.dispatchEngageBattle(attacker.playerId, target.playerId, null, null, null, true, {
      resolveCurrentTickForPlayerId() {
        return 12;
      },
      getInstanceRuntimeOrThrow() {
        return {
          meta: {
            supportsPvp: true,
          },
        };
      },
      interruptManualCombat(playerId) {
        log.push(['interruptManualCombat', playerId]);
      },
      dispatchBasicAttack() {
        log.push(['dispatchBasicAttack']);
      },
    }),
    /敌方判定规则/,
  );
  assert.deepEqual(log, [
    ['interruptManualCombat', attacker.playerId],
  ]);
}

Promise.resolve()
  .then(() => testResolveCombatRelation())
  .then(() => testBasicAttackRejectsNeutralPlayer())
  .then(() => testSkillDispatchRejectsNeutralPlayer())
  .then(() => testSkillDispatchRejectsDisabledSkillAction())
  .then(() => testAutoCombatPrefersRetaliator())
  .then(() => testAutoCombatMoveIsSingleStepLikeMainline())
  .then(() => testEngageBattleRejectsNeutralPlayerBeforeLocking())
  .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-combat-relation' }, null, 2));
  });
