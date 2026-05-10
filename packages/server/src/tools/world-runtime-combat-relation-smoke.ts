// @ts-nocheck

const assert = require('node:assert/strict');
const { Direction } = require('@mud/shared');

const {
  resolveCombatRelation,
  canPlayerDealDamageToPlayer,
} = require('../runtime/player/player-combat-config.helpers');
const { PlayerCombatService } = require('../runtime/combat/player-combat.service');
const { resolveMonsterCombatExpEquivalentFallback } = require('../runtime/combat/monster-combat-exp-equivalent.helper');
const { WorldRuntimeAutoCombatService } = require('../runtime/world/combat/world-runtime-auto-combat.service');
const { WorldRuntimeBasicAttackService } = require('../runtime/world/combat/world-runtime-basic-attack.service');
const { WorldRuntimeBattleEngageService } = require('../runtime/world/combat/world-runtime-battle-engage.service');
const { WorldRuntimeCombatActionService } = require('../runtime/world/combat/world-runtime-combat-action.service');
const { WorldRuntimePlayerSkillDispatchService } = require('../runtime/world/combat/world-runtime-player-skill-dispatch.service');

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
    getPlayer(playerId) {
      if (playerId === attacker.playerId) {
        return attacker;
      }
      if (playerId === target.playerId) {
        return target;
      }
      return null;
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

async function testSelfBuffSkillDispatchesWithoutHostileTarget() {
  const attacker = createPlayer({
    actions: {
      actions: [{ id: 'skill.iron_bone_art', type: 'skill', requiresTarget: false }],
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill.iron_bone_art',
          name: '铁骨功',
          cost: 0,
          cooldown: 1,
          requiresTarget: false,
          range: 1,
          effects: [{
            type: 'buff',
            target: 'self',
            buffId: 'buff.tiegu_guard',
            name: '铁骨',
            duration: 12,
          }],
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
    recordActivity(playerId, tick, options) {
      log.push(['recordActivity', playerId, tick, options]);
    },
  };
  const service = new WorldRuntimePlayerSkillDispatchService(playerRuntimeService, {
    castSelfSkill(player, skillId, tick) {
      log.push(['castSelfSkill', player.playerId, skillId, tick]);
      return { totalDamage: 0, hitCount: 0 };
    },
    castSkill() {
      throw new Error('castSkill should not run for self buff');
    },
    castSkillToMonster() {
      throw new Error('castSkillToMonster should not run for self buff');
    },
  });
  await service.dispatchCastSkill(attacker.playerId, 'skill.iron_bone_art', null, null, null, {
    resolveCurrentTickForPlayerId() {
      log.push(['resolveCurrentTickForPlayerId', attacker.playerId]);
      return 8;
    },
    worldRuntimeCraftInterruptService: {
      interruptCraftForReason(playerId, _player, reason) {
        log.push(['interruptCraftForReason', playerId, reason]);
      },
    },
    ensureAttackAllowed(player, skill) {
      log.push(['ensureAttackAllowed', player.playerId, skill.id]);
    },
    getInstanceRuntimeOrThrow(instanceId) {
      log.push(['getInstanceRuntimeOrThrow', instanceId]);
      return {
        listMonsters() {
          return [];
        },
      };
    },
    pushActionLabelEffect(instanceId, x, y, label) {
      log.push(['pushActionLabelEffect', instanceId, x, y, label]);
    },
  });
  assert.deepEqual(log, [
    ['resolveCurrentTickForPlayerId', attacker.playerId],
    ['recordActivity', attacker.playerId, 8, { interruptCultivation: true }],
    ['interruptCraftForReason', attacker.playerId, 'attack'],
    ['ensureAttackAllowed', attacker.playerId, 'skill.iron_bone_art'],
    ['getInstanceRuntimeOrThrow', attacker.instanceId],
    ['resolveCurrentTickForPlayerId', attacker.playerId],
    ['pushActionLabelEffect', attacker.instanceId, attacker.x, attacker.y, '铁骨功'],
    ['castSelfSkill', attacker.playerId, 'skill.iron_bone_art', 8],
  ]);
}

function testPlayerCombatSelfBuffSkillAppliesBuff() {
  const attacker = createPlayer({
    combat: {
      ...createPlayer().combat,
      cooldownReadyTickBySkillId: {},
    },
    attrs: {
      finalAttrs: {},
      numericStats: {
        maxQiOutputPerTick: 50,
      },
      ratioDivisors: {},
    },
    buffs: {
      buffs: [],
    },
    techniques: {
      techniques: [{
        level: 1,
        skills: [{
          id: 'skill.iron_bone_art',
          name: '铁骨功',
          cost: 0,
          cooldown: 1,
          range: 1,
          effects: [{
            type: 'buff',
            target: 'self',
            buffId: 'buff.tiegu_guard',
            name: '铁骨',
            duration: 12,
            statMode: 'percent',
            stats: {
              physDef: 30,
            },
          }],
        }],
      }],
    },
  });
  const log = [];
  const service = new PlayerCombatService({
    spendQi(playerId, amount) {
      log.push(['spendQi', playerId, amount]);
    },
    setSkillCooldownReadyTick(playerId, skillId, readyTick, tick) {
      log.push(['setSkillCooldownReadyTick', playerId, skillId, readyTick, tick]);
    },
    applyTemporaryBuff(playerId, buff) {
      log.push(['applyTemporaryBuff', playerId, buff.buffId, buff.statMode, buff.stats]);
    },
  });
  const result = service.castSelfSkill(attacker, 'skill.iron_bone_art', 8);
  assert.equal(result.skillId, 'skill.iron_bone_art');
  assert.equal(result.qiCost, 0);
  assert.equal(result.totalDamage, 0);
  assert.equal(result.hitCount, 0);
  assert.equal(result.targetPlayerId, attacker.playerId);
  assert.deepEqual(log, [
    ['setSkillCooldownReadyTick', attacker.playerId, 'skill.iron_bone_art', 9, 8],
    ['applyTemporaryBuff', attacker.playerId, 'buff.tiegu_guard', 'percent', { physDef: 30 }],
  ]);
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
    isInBounds(x, y) {
      return x >= 0 && y >= 0 && x < 12 && y < 12;
    },
    toTileIndex(x, y) {
      return y * 12 + x;
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

async function testSkillDispatchLogsFormationDamage() {
  const attacker = createPlayer({
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill.formation',
          name: '破阵诀',
          effects: [{ type: 'damage', damageKind: 'spell' }],
          targeting: { range: 3 },
          range: 3,
        }],
      }],
    },
  });
  const log = [];
  const service = new WorldRuntimePlayerSkillDispatchService({
    getPlayerOrThrow(playerId) {
      assert.equal(playerId, attacker.playerId);
      return attacker;
    },
  }, {
    castSkillToMonster() {
      return { totalDamage: 120, hitCount: 1, qiCost: 0 };
    },
  }, new WorldRuntimeCombatActionService());
  const combatOutcomes = [];
  await service.dispatchSkillTargets(attacker, 'skill.formation', attacker.techniques.techniques[0].skills[0], [{
    kind: 'formation',
    formationId: 'formation:test',
    x: 11,
    y: 10,
  }], {
    getInstanceRuntimeOrThrow(instanceId) {
      assert.equal(instanceId, attacker.instanceId);
      return {};
    },
    resolveCurrentTickForPlayerId(playerId) {
      assert.equal(playerId, attacker.playerId);
      return 10;
    },
    combatOutcomes,
    pushActionLabelEffect(instanceId, x, y, label) {
      log.push(['label', instanceId, x, y, label]);
    },
    pushAttackEffect(instanceId, fromX, fromY, toX, toY) {
      log.push(['attackEffect', instanceId, fromX, fromY, toX, toY]);
    },
    pushDamageFloatEffect(instanceId, x, y, damage) {
      log.push(['damageFloat', instanceId, x, y, damage]);
    },
    queuePlayerNotice(playerId, text, kind) {
      log.push(['notice', playerId, text, kind]);
    },
    worldRuntimeFormationService: {
      getFormationCombatState(instanceId, formationId) {
        assert.equal(instanceId, attacker.instanceId);
        assert.equal(formationId, 'formation:test');
        return {
          id: 'formation:test',
          name: '测试阵法',
          x: 11,
          y: 10,
          remainingAuraBudget: 100,
          damagePerAura: 10,
        };
      },
      applyDamageToFormation(instanceId, formationId, damage, attackerPlayerId) {
        assert.equal(instanceId, attacker.instanceId);
        assert.equal(formationId, 'formation:test');
        assert.equal(damage, 120);
        assert.equal(attackerPlayerId, attacker.playerId);
        return {
          appliedDamage: 120,
          auraDamage: 12,
          destroyed: false,
        };
      },
    },
  });
  assert.ok(log.some((entry) => entry[0] === 'notice'
    && entry[1] === attacker.playerId
    && entry[2].includes('造成')
    && entry[2].includes('削减阵法灵力 12')
    && entry[3] === 'combat'));
  assert.equal(combatOutcomes.length, 1);
  assert.equal(combatOutcomes[0].target.kind, 'formation');
  assert.equal(combatOutcomes[0].target.id, 'formation:test');
  assert.equal(combatOutcomes[0].result.targetType, 'formation');
  assert.equal(combatOutcomes[0].result.damage, 120);
}

async function testSkillDispatchLogsMonsterAndPlayerDamage() {
  const skill = {
    id: 'skill.damage_log',
    name: '青木剑诀',
    effects: [{ type: 'damage', damageKind: 'physical' }],
    targeting: { range: 3 },
    range: 3,
  };
  const attacker = createPlayer({
    name: '攻击者',
    combat: {
      ...createPlayer().combat,
      allowAoePlayerHit: true,
    },
    techniques: {
      techniques: [{
        skills: [skill],
      }],
    },
  });
  const targetPlayer = createTarget('player:target', {
    name: '目标修士',
    x: 12,
    y: 10,
  });
  const monster = {
    runtimeId: 'monster:runtime:1',
    monsterId: 'monster.test',
    name: '测试妖兽',
    alive: true,
    hp: 100,
    maxHp: 100,
    x: 11,
    y: 10,
    level: 2,
    attrs: {},
    numericStats: {},
    ratioDivisors: {},
    buffs: [],
  };
  const log = [];
  const service = new WorldRuntimePlayerSkillDispatchService({
    playerProgressionService: {
      getMonsterCombatExpEquivalent(level) {
        return resolveMonsterCombatExpEquivalentFallback(level);
      },
    },
    getPlayerOrThrow(playerId) {
      if (playerId === attacker.playerId) {
        return attacker;
      }
      throw new Error(`unexpected playerId ${playerId}`);
    },
    getPlayer(playerId) {
      if (playerId === targetPlayer.playerId) {
        return targetPlayer;
      }
      if (playerId === attacker.playerId) {
        return attacker;
      }
      return null;
    },
    recordActivity(playerId, tick, payload) {
      log.push(['recordActivity', playerId, tick, payload]);
    },
  }, {
    castSkillToMonster() {
      return { totalDamage: 23, hitCount: 1, qiCost: 0 };
    },
    castSkill() {
      return { totalDamage: 17, hitCount: 1, qiCost: 0 };
    },
  }, new WorldRuntimeCombatActionService());
  const combatOutcomes = [];
  await service.dispatchSkillTargets(attacker, skill.id, skill, [
    {
      kind: 'monster',
      monsterId: monster.runtimeId,
      x: monster.x,
      y: monster.y,
    },
    {
      kind: 'player',
      playerId: targetPlayer.playerId,
      x: targetPlayer.x,
      y: targetPlayer.y,
    },
  ], {
    getInstanceRuntimeOrThrow(instanceId) {
      assert.equal(instanceId, attacker.instanceId);
      return {
        meta: { supportsPvp: true, canDamageTile: false },
        getMonster(runtimeId) {
          return runtimeId === monster.runtimeId ? monster : null;
        },
        applyDamageToMonster(runtimeId, damage, attackerPlayerId) {
          log.push(['applyDamageToMonster', runtimeId, damage, attackerPlayerId]);
          return { defeated: false, monster };
        },
      };
    },
    resolveCurrentTickForPlayerId(playerId) {
      assert.equal(playerId, attacker.playerId);
      return 18;
    },
    combatOutcomes,
    pushActionLabelEffect(instanceId, x, y, label) {
      log.push(['label', instanceId, x, y, label]);
    },
    pushAttackEffect(instanceId, fromX, fromY, toX, toY) {
      log.push(['attackEffect', instanceId, fromX, fromY, toX, toY]);
    },
    pushDamageFloatEffect(instanceId, x, y, damage) {
      log.push(['damageFloat', instanceId, x, y, damage]);
    },
    queuePlayerNotice(playerId, text, kind) {
      log.push(['notice', playerId, text, kind]);
    },
    handlePlayerDefeat(playerId, sourcePlayerId) {
      log.push(['handlePlayerDefeat', playerId, sourcePlayerId]);
    },
  });

  assert.ok(log.some((entry) => entry[0] === 'notice'
    && entry[1] === attacker.playerId
    && entry[2].includes('你对测试妖兽施展青木剑诀')
    && entry[2].includes('原始 23 - 实际 23 - 物理')
    && entry[3] === 'combat'));
  assert.ok(log.some((entry) => entry[0] === 'notice'
    && entry[1] === attacker.playerId
    && entry[2].includes('你对目标修士施展青木剑诀')
    && entry[2].includes('原始 17 - 实际 17 - 物理')
    && entry[3] === 'combat'));
  assert.ok(log.some((entry) => entry[0] === 'notice'
    && entry[1] === targetPlayer.playerId
    && entry[2].includes('攻击者对你施展青木剑诀')
    && entry[2].includes('原始 17 - 实际 17 - 物理')
    && entry[3] === 'combat'));
  assert.ok(log.some((entry) => entry[0] === 'damageFloat'
    && entry[1] === attacker.instanceId
    && entry[2] === monster.x
    && entry[3] === monster.y
    && entry[4] === 23));
  assert.ok(log.some((entry) => entry[0] === 'damageFloat'
    && entry[1] === attacker.instanceId
    && entry[2] === targetPlayer.x
    && entry[3] === targetPlayer.y
    && entry[4] === 17));
  assert.equal(combatOutcomes.length, 2);
  assert.equal(combatOutcomes[0].target.kind, 'monster');
  assert.equal(combatOutcomes[0].result.damage, 23);
  assert.equal(combatOutcomes[1].target.kind, 'player');
  assert.equal(combatOutcomes[1].result.damage, 17);
}

async function testMissedPlayerSkillStillAggrosMonster() {
  const skill = {
    id: 'skill.miss_probe',
    name: '试探术',
    cost: 0,
    cooldown: 1,
    range: 3,
    effects: [{
      type: 'damage',
      damageKind: 'spell',
      formula: 10,
    }],
  };
  const attacker = createPlayer({
    techniques: {
      techniques: [{
        skills: [skill],
      }],
    },
  });
  const monster = {
    runtimeId: 'monster:runtime:miss',
    monsterId: 'monster.test',
    name: '测试妖兽',
    alive: true,
    hp: 100,
    maxHp: 100,
    x: 11,
    y: 10,
    level: 2,
    attrs: {},
    numericStats: {},
    ratioDivisors: {},
    buffs: [],
  };
  const log = [];
  const service = new WorldRuntimePlayerSkillDispatchService({
    playerProgressionService: {
      getMonsterCombatExpEquivalent(level) {
        return resolveMonsterCombatExpEquivalentFallback(level);
      },
    },
    getPlayerOrThrow(playerId) {
      if (playerId === attacker.playerId) {
        return attacker;
      }
      throw new Error(`unexpected playerId ${playerId}`);
    },
    getPlayer(playerId) {
      return playerId === attacker.playerId ? attacker : null;
    },
    recordActivity(playerId, tick, payload) {
      log.push(['recordActivity', playerId, tick, payload]);
    },
  }, {
    castSkillToMonster() {
      return {
        totalDamage: 0,
        hitCount: 0,
        qiCost: 0,
        damageKind: 'spell',
        damageRolls: [{
          hit: false,
          rawDamage: 10,
          damage: 0,
          dodged: true,
          damageKind: 'spell',
        }],
      };
    },
  }, new WorldRuntimeCombatActionService());
  const combatOutcomes = [];
  await service.dispatchSkillTargets(attacker, skill.id, skill, [{
    kind: 'monster',
    monsterId: monster.runtimeId,
    x: monster.x,
    y: monster.y,
  }], {
    getInstanceRuntimeOrThrow(instanceId) {
      assert.equal(instanceId, attacker.instanceId);
      return {
        getMonster(runtimeId) {
          return runtimeId === monster.runtimeId ? monster : null;
        },
        applyDamageToMonster(runtimeId, damage, attackerPlayerId) {
          log.push(['applyDamageToMonster', runtimeId, damage, attackerPlayerId]);
          return { defeated: false, monster, appliedDamage: damage };
        },
      };
    },
    resolveCurrentTickForPlayerId(playerId) {
      assert.equal(playerId, attacker.playerId);
      return 19;
    },
    combatOutcomes,
    pushActionLabelEffect(instanceId, x, y, label) {
      log.push(['label', instanceId, x, y, label]);
    },
    pushAttackEffect(instanceId, fromX, fromY, toX, toY) {
      log.push(['attackEffect', instanceId, fromX, fromY, toX, toY]);
    },
    pushCombatTextFloatEffect(instanceId, x, y, text) {
      log.push(['combatText', instanceId, x, y, text]);
    },
    pushDamageFloatEffect(instanceId, x, y, damage) {
      log.push(['damageFloat', instanceId, x, y, damage]);
    },
    queuePlayerNotice(playerId, text, kind) {
      log.push(['notice', playerId, text, kind]);
    },
  });
  assert.ok(log.some((entry) => entry[0] === 'applyDamageToMonster'
    && entry[1] === monster.runtimeId
    && entry[2] === 0
    && entry[3] === attacker.playerId), `expected zero-damage skill to aggro monster, log=${JSON.stringify(log)}`);
  assert.equal(combatOutcomes.length, 1);
  assert.equal(combatOutcomes[0].target.kind, 'monster');
  assert.equal(combatOutcomes[0].result.damage, 0);
  assert.equal(combatOutcomes[0].result.dodged, true);
}

async function testSkillDispatchKeepsTileAnchorForAreaTerrainDamage() {
  const attacker = createPlayer({
    actions: {
      actions: [{ id: 'skill.terrain_box', type: 'skill', requiresTarget: true, skillEnabled: true }],
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill.terrain_box',
          name: '裂地术',
          effects: [{ type: 'damage', damageKind: 'spell' }],
          range: 3,
          targeting: {
            shape: 'box',
            width: 3,
            height: 1,
            range: 3,
            maxTargets: 99,
          },
        }],
      }],
    },
  });
  const damagedTiles = [];
  const castTargets = [];
  const notices = [];
  const tileStates = new Map([
    ['11,10', { tileType: 'wall', hp: 100, maxHp: 100, destroyed: false }],
    ['13,10', { tileType: 'wall', hp: 100, maxHp: 100, destroyed: false }],
  ]);
  const instance = {
    meta: { canDamageTile: true },
    listMonsters() {
      return [];
    },
    getMonster() {
      return null;
    },
    getTileCombatState(x, y) {
      return tileStates.get(`${x},${y}`) ?? null;
    },
    damageTile(x, y, damage) {
      damagedTiles.push(`${x},${y}`);
      return { appliedDamage: damage, destroyed: false };
    },
  };
  const service = new WorldRuntimePlayerSkillDispatchService({
    getPlayerOrThrow(playerId) {
      assert.equal(playerId, attacker.playerId);
      return attacker;
    },
    getPlayer() {
      return null;
    },
    listPlayerSnapshots() {
      return [];
    },
    recordActivity() {
      return undefined;
    },
  }, {
    castSkillToMonster(_attacker, target) {
      castTargets.push(target.runtimeId);
      return { totalDamage: 10, hitCount: 1, qiCost: 0, damageKind: 'spell' };
    },
  }, new WorldRuntimeCombatActionService());
  const combatOutcomes = [];
  await service.dispatchCastSkill(attacker.playerId, 'skill.terrain_box', null, null, 'tile:12:10', {
    resolveCurrentTickForPlayerId(playerId) {
      assert.equal(playerId, attacker.playerId);
      return 20;
    },
    worldRuntimeCraftInterruptService: {
      interruptCraftForReason() {
        return undefined;
      },
    },
    ensureAttackAllowed() {
      return undefined;
    },
    combatOutcomes,
    getInstanceRuntimeOrThrow(instanceId) {
      assert.equal(instanceId, attacker.instanceId);
      return instance;
    },
    pushActionLabelEffect() {
      return undefined;
    },
    pushAttackEffect() {
      return undefined;
    },
    pushDamageFloatEffect() {
      return undefined;
    },
    queuePlayerNotice(playerId, text, kind) {
      notices.push([playerId, text, kind]);
    },
  });
  assert.deepEqual(castTargets.sort(), ['tile:11:10', 'tile:13:10']);
  assert.deepEqual(damagedTiles.sort(), ['11,10', '13,10']);
  assert.equal(notices.length, 2);
  assert.ok(notices.every((entry) => entry[0] === attacker.playerId
    && entry[1].includes('你对地块施展裂地术')
    && entry[1].includes('原始 10 - 实际 10 - 法术')
    && entry[2] === 'combat'));
  assert.equal(combatOutcomes.length, 2);
  assert.deepEqual(combatOutcomes.map((entry) => `${entry.target.x},${entry.target.y}`).sort(), ['11,10', '13,10']);
  assert.ok(combatOutcomes.every((entry) => entry.target.kind === 'tile' && entry.result.damage === 10));
}

async function testSkillDispatchConsumesProductionActionPlanTargets() {
  const skill = {
    id: 'skill.plan_filter',
    name: '筛选术',
    effects: [{ type: 'damage', damageKind: 'spell' }],
    range: 3,
    targeting: { range: 3, maxTargets: 99 },
  };
  const attacker = createPlayer({
    techniques: { techniques: [{ skills: [skill] }] },
  });
  const validMonster = {
    runtimeId: 'monster:valid',
    monsterId: 'monster.valid',
    name: '合法妖兽',
    alive: true,
    hp: 100,
    maxHp: 100,
    x: 11,
    y: 10,
    level: 1,
    attrs: {},
    numericStats: {},
    ratioDivisors: {},
    buffs: [],
  };
  const deadMonster = {
    ...validMonster,
    runtimeId: 'monster:dead',
    alive: false,
    hp: 0,
    x: 12,
    y: 10,
  };
  const castTargets = [];
  const diagnostics = [];
  const service = new WorldRuntimePlayerSkillDispatchService({
    playerProgressionService: {
      getMonsterCombatExpEquivalent(level) {
        return resolveMonsterCombatExpEquivalentFallback(level);
      },
    },
    getPlayer(playerId) {
      return playerId === attacker.playerId ? attacker : null;
    },
    listPlayerSnapshots() {
      return [];
    },
    recordActivity() {
      return undefined;
    },
  }, {
    castSkillToMonster(_attacker, target) {
      castTargets.push(target.runtimeId);
      return { totalDamage: 7, hitCount: 1, qiCost: 0, damageKind: 'spell' };
    },
  }, new WorldRuntimeCombatActionService());
  await service.dispatchSkillTargets(attacker, skill.id, skill, [
    { kind: 'monster', monsterId: validMonster.runtimeId, x: validMonster.x, y: validMonster.y },
    { kind: 'monster', monsterId: deadMonster.runtimeId, x: deadMonster.x, y: deadMonster.y },
  ], {
    combatDiagnostics: diagnostics,
    getInstanceRuntimeOrThrow() {
      return {
        meta: { supportsPvp: false, canDamageTile: false },
        getMonster(runtimeId) {
          if (runtimeId === validMonster.runtimeId) return validMonster;
          if (runtimeId === deadMonster.runtimeId) return deadMonster;
          return null;
        },
        applyDamageToMonster(runtimeId, damage) {
          return { defeated: false, monster: validMonster, appliedDamage: damage };
        },
        canSeeTileFrom() {
          return true;
        },
      };
    },
    resolveCurrentTickForPlayerId() {
      return 30;
    },
    pushActionLabelEffect() {},
    pushAttackEffect() {},
    pushDamageFloatEffect() {},
    queuePlayerNotice() {},
  });
  assert.deepEqual(castTargets, [validMonster.runtimeId]);
  assert.ok(diagnostics.some((entry) => entry.reason === 'monster_dead'));
}

async function testSkillDispatchKeepsFormationBoundaryPlanMapping() {
  const skill = {
    id: 'skill.boundary_plan',
    name: '破界术',
    effects: [{ type: 'damage', damageKind: 'spell' }],
    range: 3,
    targeting: { range: 3 },
  };
  const attacker = createPlayer({
    techniques: { techniques: [{ skills: [skill] }] },
  });
  const calls = [];
  const service = new WorldRuntimePlayerSkillDispatchService({
    getPlayer(playerId) {
      return playerId === attacker.playerId ? attacker : null;
    },
    listPlayerSnapshots() {
      return [];
    },
    recordActivity() {
      return undefined;
    },
  }, {
    castSkillToMonster(_attacker, target) {
      calls.push(['cast', target.runtimeId]);
      return { totalDamage: 18, hitCount: 1, qiCost: 0, damageKind: 'spell' };
    },
  }, new WorldRuntimeCombatActionService());
  await service.dispatchSkillTargets(attacker, skill.id, skill, [{
    kind: 'formation_boundary',
    formationId: 'formation:boundary',
    x: 11,
    y: 10,
  }], {
    getInstanceRuntimeOrThrow() {
      return {
        meta: { supportsPvp: false, canDamageTile: false },
        getMonster() {
          return null;
        },
        canSeeTileFrom() {
          return true;
        },
      };
    },
    resolveCurrentTickForPlayerId() {
      return 31;
    },
    pushActionLabelEffect() {},
    pushAttackEffect() {},
    pushDamageFloatEffect() {},
    queuePlayerNotice() {},
    worldRuntimeFormationService: {
      getBoundaryBarrierCombatState(instanceId, x, y) {
        assert.equal(instanceId, attacker.instanceId);
        assert.equal(x, 11);
        assert.equal(y, 10);
        return {
          formationId: 'formation:boundary',
          name: '边界阵法',
          remainingAuraBudget: 10,
          damagePerAura: 10,
        };
      },
      getFormationCombatState() {
        return null;
      },
      applyDamageToBoundaryBarrier(instanceId, x, y, damage) {
        calls.push(['boundary', instanceId, x, y, damage]);
        return { appliedDamage: damage, auraDamage: 1.8, destroyed: false };
      },
      applyDamageToFormation() {
        calls.push(['formation']);
        return { appliedDamage: 0, auraDamage: 0 };
      },
    },
  });
  assert.deepEqual(calls, [
    ['cast', 'formation-boundary:formation:boundary:11:10'],
    ['boundary', attacker.instanceId, 11, 10, 18],
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
    getPlayer(playerId) {
      if (playerId === attacker.playerId) {
        return attacker;
      }
      if (playerId === target.playerId) {
        return target;
      }
      return null;
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
    /无法被攻击/,
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
  .then(() => testSelfBuffSkillDispatchesWithoutHostileTarget())
  .then(() => testPlayerCombatSelfBuffSkillAppliesBuff())
  .then(() => testAutoCombatPrefersRetaliator())
  .then(() => testAutoCombatMoveIsSingleStepLikeMainline())
  .then(() => testSkillDispatchLogsFormationDamage())
  .then(() => testSkillDispatchLogsMonsterAndPlayerDamage())
  .then(() => testMissedPlayerSkillStillAggrosMonster())
  .then(() => testSkillDispatchKeepsTileAnchorForAreaTerrainDamage())
  .then(() => testSkillDispatchConsumesProductionActionPlanTargets())
  .then(() => testSkillDispatchKeepsFormationBoundaryPlanMapping())
  .then(() => testEngageBattleRejectsNeutralPlayerBeforeLocking())
  .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-combat-relation' }, null, 2));
  });
