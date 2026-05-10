// @ts-nocheck

const assert = require('node:assert/strict');

const { resolveMonsterCombatExpEquivalentFallback } = require('../runtime/combat/monster-combat-exp-equivalent.helper');
const { WorldRuntimeBasicAttackService } = require('../runtime/world/combat/world-runtime-basic-attack.service');
const { WorldRuntimeBattleEngageService } = require('../runtime/world/combat/world-runtime-battle-engage.service');
const { WorldRuntimeCombatActionService } = require('../runtime/world/combat/world-runtime-combat-action.service');
const { WorldRuntimeMonsterActionApplyService } = require('../runtime/world/combat/world-runtime-monster-action-apply.service');

function createAttacker(overrides = {}) {
  return {
    playerId: 'player:attacker',
    name: '攻击者',
    instanceId: 'public:yunlai_town',
    hp: 100,
    maxHp: 100,
    x: 10,
    y: 10,
    qi: 100,
    maxQi: 100,
    combatExp: 120,
    realm: { realmLv: 2 },
    buffs: [],
    attrs: {
      numericStats: {
        physAtk: 12,
        spellAtk: 14,
        viewRange: 8,
        maxQiOutputPerTick: 50,
      },
      ratioDivisors: {},
    },
    combat: {
      allowAoePlayerHit: true,
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

function createTarget(overrides = {}) {
  return {
    playerId: 'player:target',
    name: '目标',
    instanceId: 'public:yunlai_town',
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

function createInstance(overrides = {}) {
  return {
    meta: {
      instanceId: 'public:yunlai_town',
      supportsPvp: false,
      canDamageTile: true,
      ...overrides.meta,
    },
    damageTile(x, y, amount) {
      return { x, y, appliedDamage: amount };
    },
    getTileCombatState(x, y) {
      return {
        x,
        y,
        hp: 100,
        maxHp: 100,
        destroyed: false,
      };
    },
    ...overrides,
  };
}

function createMonster(overrides = {}) {
  return {
    runtimeId: 'monster:caller',
    monsterId: 'm_soul_caller',
    name: '唤灵真人',
    alive: true,
    hp: 100,
    maxHp: 100,
    x: 10,
    y: 10,
    level: 12,
    attackRange: 1,
    skills: [
      {
        id: 'monster:soul_flame',
        name: '唤灵火',
        range: 3,
        cooldown: { ticks: 1 },
        cost: {},
        effects: [],
      },
    ],
    cooldownReadyTickBySkillId: {},
    attrs: {},
    buffs: [],
    numericStats: {
      physAtk: 80,
      spellAtk: 12,
      hit: 100,
      breakPower: 0,
      crit: 0,
      critDamage: 0,
      elementDamageBonus: {},
    },
    ratioDivisors: {
      elementDamageBonus: {},
    },
    ...overrides,
  };
}

function createBasicAttackService(attacker, target, log = []) {
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
    setRetaliatePlayerTarget(targetPlayerId, sourcePlayerId, tick) {
      log.push(['setRetaliatePlayerTarget', targetPlayerId, sourcePlayerId, tick]);
    },
    applyDamage(playerId, amount) {
      log.push(['applyDamage', playerId, amount]);
      return { playerId, hp: 25 };
    },
    recordActivity(playerId, tick, payload) {
      log.push(['recordActivity', playerId, tick, payload]);
    },
  };
  const service = new WorldRuntimeBasicAttackService(playerRuntimeService, new WorldRuntimeCombatActionService());
  service.resolveBasicAttackDamageAgainstPlayer = () => ({ rawDamage: 14, damage: 9 });
  return service;
}

function createBasicAttackDeps(instance, log = []) {
  return {
    combatOutcomes: [],
    getInstanceRuntimeOrThrow(instanceId) {
      log.push(['getInstanceRuntimeOrThrow', instanceId]);
      return instance;
    },
    pushActionLabelEffect(instanceId, x, y, label) {
      log.push(['pushActionLabelEffect', instanceId, x, y, label]);
    },
    pushAttackEffect(instanceId, fromX, fromY, toX, toY, color) {
      log.push(['pushAttackEffect', instanceId, fromX, fromY, toX, toY, color]);
    },
    pushDamageFloatEffect(instanceId, x, y, amount, color) {
      log.push(['pushDamageFloatEffect', instanceId, x, y, amount, color]);
    },
    queuePlayerNotice(playerId, message, channel) {
      log.push(['queuePlayerNotice', playerId, message, channel]);
    },
    handlePlayerDefeat(playerId, sourcePlayerId) {
      log.push(['handlePlayerDefeat', playerId, sourcePlayerId]);
    },
    handlePlayerMonsterKill(instanceArg, monster, playerId) {
      log.push(['handlePlayerMonsterKill', instanceArg?.meta?.instanceId, monster?.runtimeId, playerId]);
    },
    worldRuntimeLootContainerService: {
      damageHerbContainerAtTile(instanceId, container, currentTick) {
        if (!container || container.variant !== 'herb') {
          return null;
        }
        log.push(['damageHerbContainerAtTile', instanceId, container.id, currentTick]);
        return {
          title: container.name,
          appliedDamage: 1,
          remainingCount: 0,
          respawnRemainingTicks: 5,
        };
      },
    },
  };
}

function createMonsterActionApplyService(player, log = [], playerCombatService = {}) {
  const playerRuntimeService = {
    playerProgressionService: {
      getMonsterCombatExpEquivalent(level) {
        return resolveMonsterCombatExpEquivalentFallback(level);
      },
    },
    getPlayer(playerId) {
      if (player instanceof Map) {
        return player.get(playerId) ?? null;
      }
      return playerId === player.playerId ? player : null;
    },
    applyDamage(playerId, amount) {
      log.push(['applyDamage', playerId, amount]);
      player.hp = Math.max(0, player.hp - amount);
      return player;
    },
    activateAutoRetaliate(playerId, tick) {
      log.push(['activateAutoRetaliate', playerId, tick]);
    },
    recordActivity(playerId, tick, payload) {
      log.push(['recordActivity', playerId, tick, payload]);
    },
    applyTemporaryBuff(playerId, buff) {
      log.push(['applyTemporaryBuff', playerId, buff]);
    },
  };
  const combatEffectsService = {
    pushActionLabelEffect(instanceId, x, y, label) {
      log.push(['pushActionLabelEffect', instanceId, x, y, label]);
    },
    pushAttackEffect(instanceId, fromX, fromY, toX, toY, color) {
      log.push(['pushAttackEffect', instanceId, fromX, fromY, toX, toY, color]);
    },
    pushDamageFloatEffect(instanceId, x, y, amount, color) {
      log.push(['pushDamageFloatEffect', instanceId, x, y, amount, color]);
    },
    pushCombatTextFloatEffect(instanceId, x, y, text, color, durationMs) {
      log.push(['pushCombatTextFloatEffect', instanceId, x, y, text, color, durationMs]);
    },
    pushCombatEffect(instanceId, effect) {
      log.push(['pushCombatEffect', instanceId, effect]);
    },
  };
  return new WorldRuntimeMonsterActionApplyService(
    playerRuntimeService,
    playerCombatService,
    combatEffectsService,
    new WorldRuntimeCombatActionService(),
  );
}

function createMonsterActionDeps(instance, player, log = []) {
  return {
    combatOutcomes: [],
    combatDiagnostics: [],
    getPlayerLocation(playerId) {
      log.push(['getPlayerLocation', playerId]);
      const resolvedPlayer = player instanceof Map ? player.get(playerId) : player;
      return playerId === resolvedPlayer?.playerId ? { instanceId: resolvedPlayer.instanceId, x: resolvedPlayer.x, y: resolvedPlayer.y } : null;
    },
    getInstanceRuntime(instanceId) {
      log.push(['getInstanceRuntime', instanceId]);
      return instance.meta.instanceId === instanceId ? instance : null;
    },
    resolveCurrentTickForPlayerId(playerId) {
      log.push(['resolveCurrentTickForPlayerId', playerId]);
      return 24;
    },
    queuePlayerNotice(playerId, message, channel) {
      log.push(['queuePlayerNotice', playerId, message, channel]);
    },
    handlePlayerDefeat(playerId) {
      log.push(['handlePlayerDefeat', playerId]);
    },
  };
}

function createBattleEngageService(attacker, target, log = []) {
  return new WorldRuntimeBattleEngageService({
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
}

function createBattleEngageDeps(instance, log = []) {
  return {
    resolveCurrentTickForPlayerId() {
      return 12;
    },
    getInstanceRuntimeOrThrow(instanceId) {
      log.push(['getInstanceRuntimeOrThrow', instanceId]);
      return instance;
    },
    interruptManualCombat(playerId) {
      log.push(['interruptManualCombat', playerId]);
    },
    dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY) {
      log.push(['dispatchBasicAttack', playerId, targetPlayerId, targetMonsterId, targetX, targetY]);
    },
    buildAutoCombatCommand() {
      return null;
    },
    dispatchInstanceCommand(commandPlayerId, command) {
      log.push(['dispatchInstanceCommand', commandPlayerId, command]);
    },
    dispatchPlayerCommand(commandPlayerId, command) {
      log.push(['dispatchPlayerCommand', commandPlayerId, command]);
    },
  };
}

async function testPeacefulLineRejectsPlayerBasicAttack() {
  const attacker = createAttacker();
  const target = createTarget();
  const service = createBasicAttackService(attacker, target);
  const deps = createBasicAttackDeps(createInstance({
    meta: {
      supportsPvp: false,
      canDamageTile: true,
    },
  }));
  await assert.rejects(
    () => service.dispatchBasicAttackToPlayer(attacker, target.playerId, 'spell', 14, 8, deps),
    /当前实例不允许玩家互攻/,
  );
}

async function testRealLineAllowsPlayerBasicAttack() {
  const log = [];
  const attacker = createAttacker({ instanceId: 'real:yunlai_town' });
  const target = createTarget({ instanceId: 'real:yunlai_town' });
  const service = createBasicAttackService(attacker, target, log);
  const deps = createBasicAttackDeps(createInstance({
    meta: {
      instanceId: 'real:yunlai_town',
      supportsPvp: true,
      canDamageTile: true,
    },
  }), log);
  await service.dispatchBasicAttackToPlayer(attacker, target.playerId, 'spell', 14, 8, deps);
  assert.deepEqual(log[0], ['getInstanceRuntimeOrThrow', 'real:yunlai_town']);
  assert.deepEqual(log[1], ['pushActionLabelEffect', 'real:yunlai_town', 10, 10, '攻击']);
  assert.deepEqual(log[2].slice(0, 6), ['pushAttackEffect', 'real:yunlai_town', 10, 10, 11, 10]);
  assert.equal(typeof log[2][6], 'string');
  assert.deepEqual(log[3].slice(0, 5), ['pushDamageFloatEffect', 'real:yunlai_town', 11, 10, 9]);
  assert.equal(typeof log[3][5], 'string');
  assert.deepEqual(log[4], ['setRetaliatePlayerTarget', 'player:target', 'player:attacker', 8]);
  assert.deepEqual(log[5], ['applyDamage', 'player:target', 9]);
  assert.deepEqual(log[6], ['recordActivity', 'player:target', 8, { interruptCultivation: true }]);
  assert.deepEqual(log[7].slice(0, 2), ['queuePlayerNotice', 'player:attacker']);
  assert.match(log[7][2], /发起攻击/);
  assert.match(log[7][2], /原始 14 - 实际 9 - 法术/);
  assert.deepEqual(log[8].slice(0, 2), ['queuePlayerNotice', 'player:target']);
  assert.match(log[8][2], /发起攻击/);
  assert.match(log[8][2], /原始 14 - 实际 9 - 法术/);
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.kind, 'player');
  assert.equal(deps.combatOutcomes[0].target.id, target.playerId);
  assert.equal(deps.combatOutcomes[0].result.damage, 9);
}

async function testPlayerBasicAttackMonsterRecordsCombatOutcome() {
  const log = [];
  const attacker = createAttacker();
  const target = createTarget();
  const monster = createMonster({
    runtimeId: 'monster:target',
    name: '靶妖',
    x: 11,
    y: 10,
    numericStats: {
      physDef: 0,
      spellDef: 0,
      dodge: 0,
      resolvePower: 0,
      antiCrit: 0,
      elementDamageReduce: {},
    },
    ratioDivisors: {
      dodge: 1,
      elementDamageReduce: {},
    },
  });
  const instance = createInstance({
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    applyDamageToMonster(runtimeId, amount, playerId) {
      log.push(['applyDamageToMonster', runtimeId, amount, playerId]);
      return { monster, defeated: false };
    },
  });
  const service = createBasicAttackService(attacker, target, log);
  const deps = createBasicAttackDeps(instance, log);
  await service.dispatchBasicAttackToMonster(attacker, monster.runtimeId, 'physical', 12, deps);

  assert.ok(log.some((entry) => entry[0] === 'applyDamageToMonster'), `expected monster damage application, log=${JSON.stringify(log)}`);
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.kind, 'monster');
  assert.equal(deps.combatOutcomes[0].target.id, monster.runtimeId);
  assert.equal(deps.combatOutcomes[0].result.targetType, 'monster');
  assert.equal(deps.combatOutcomes[0].result.damage > 0, true);
}

async function testPlayerBasicAttackMonsterKillKeepsRewardAndDamageFloat() {
  const log = [];
  const attacker = createAttacker();
  const target = createTarget();
  const monster = createMonster({
    runtimeId: 'monster:target',
    name: '通天塔虚影',
    x: 11,
    y: 10,
  });
  const instance = createInstance({
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    applyDamageToMonster(runtimeId, amount, playerId) {
      log.push(['applyDamageToMonster', runtimeId, amount, playerId]);
      return { monster, appliedDamage: amount, defeated: true };
    },
  });
  const service = createBasicAttackService(attacker, target, log);
  service.resolveBasicAttackDamageAgainstMonster = () => ({ rawDamage: 12, damage: 12 });
  const deps = createBasicAttackDeps(instance, log);

  await service.dispatchBasicAttackToMonster(attacker, monster.runtimeId, 'physical', 12, deps);

  assert.ok(
    log.some((entry) => entry[0] === 'handlePlayerMonsterKill'
      && entry[1] === instance.meta.instanceId
      && entry[2] === monster.runtimeId
      && entry[3] === attacker.playerId),
    `expected monster kill reward settlement to receive defeated monster snapshot, log=${JSON.stringify(log)}`,
  );
  assert.ok(
    log.some((entry) => entry[0] === 'pushDamageFloatEffect'
      && entry[1] === instance.meta.instanceId
      && entry[2] === monster.x
      && entry[3] === monster.y
      && entry[4] === 12),
    `expected killing hit to still enqueue damage float, log=${JSON.stringify(log)}`,
  );
}

function testPlayerBasicAttackFormationRecordsCombatOutcome() {
  const log = [];
  const attacker = createAttacker();
  const formation = {
    id: 'formation:eye',
    name: '护山阵眼',
    x: 11,
    y: 10,
  };
  const service = createBasicAttackService(attacker, createTarget(), log);
  const deps = createBasicAttackDeps(createInstance(), log);
  deps.worldRuntimeFormationService = {
    applyDamageToFormation(instanceId, formationId, amount, playerId) {
      log.push(['applyDamageToFormation', instanceId, formationId, amount, playerId]);
      return {
        appliedDamage: 6,
        auraDamage: 1.25,
      };
    },
  };
  service.dispatchBasicAttackToFormation(attacker, formation, 'physical', 12, deps);

  assert.ok(log.some((entry) => entry[0] === 'applyDamageToFormation'), `expected formation damage application, log=${JSON.stringify(log)}`);
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.kind, 'formation');
  assert.equal(deps.combatOutcomes[0].target.id, formation.id);
  assert.equal(deps.combatOutcomes[0].result.targetType, 'formation');
  assert.equal(deps.combatOutcomes[0].result.damage, 6);
  assert.equal(deps.combatOutcomes[0].result.auraDamage, 1.25);
}

function testMonsterBasicAttackQueuesCombatNoticeAndDamageFloat() {
  const log = [];
  const player = createTarget({
    playerId: 'player:victim',
    name: '受击者',
    hp: 100,
    x: 11,
    y: 10,
    attrs: {
      numericStats: {
        physDef: 0,
        spellDef: 0,
        dodge: 0,
        resolvePower: 0,
        antiCrit: 0,
        elementDamageReduce: {},
      },
      ratioDivisors: {
        dodge: 1,
        elementDamageReduce: {},
      },
    },
  });
  const monster = createMonster();
  const instance = createInstance({
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    getPlayerPosition(playerId) {
      return playerId === player.playerId ? { x: player.x, y: player.y } : null;
    },
    canSeeTileFrom() {
      return true;
    },
  });
  const service = createMonsterActionApplyService(player, log);
  const deps = createMonsterActionDeps(instance, player, log);
  service.applyMonsterBasicAttack({
    kind: 'basic-attack',
    instanceId: instance.meta.instanceId,
    runtimeId: monster.runtimeId,
    targetPlayerId: player.playerId,
  }, deps);

  const float = log.find((entry) => entry[0] === 'pushDamageFloatEffect');
  assert.ok(float, `expected monster basic attack to enqueue damage float, log=${JSON.stringify(log)}`);
  assert.deepEqual(float.slice(0, 4), ['pushDamageFloatEffect', 'public:yunlai_town', 11, 10]);
  assert.equal(float[4] > 0, true);
  const notice = log.find((entry) => entry[0] === 'queuePlayerNotice');
  assert.ok(notice, `expected monster basic attack to enqueue combat notice, log=${JSON.stringify(log)}`);
  assert.deepEqual(notice.slice(0, 2), ['queuePlayerNotice', 'player:victim']);
  assert.match(notice[2], /唤灵真人对你发起攻击/);
  assert.match(notice[2], new RegExp(`实际 ${float[4]} - 物理`));
  assert.equal(notice[3], 'combat');
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.id, player.playerId);
  assert.equal(deps.combatOutcomes[0].result.damage, float[4]);
}

function testMonsterBasicAttackDodgeQueuesCombatNoticeAndOutcome() {
  const log = [];
  const player = createTarget({
    playerId: 'player:victim',
    name: '受击者',
    hp: 100,
    x: 11,
    y: 10,
    attrs: {
      numericStats: {
        physDef: 0,
        spellDef: 0,
        dodge: 100,
        resolvePower: 0,
        antiCrit: 0,
        elementDamageReduce: {},
      },
      ratioDivisors: {
        dodge: 1,
        elementDamageReduce: {},
      },
    },
  });
  const monster = createMonster();
  const instance = createInstance({
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    getPlayerPosition(playerId) {
      return playerId === player.playerId ? { x: player.x, y: player.y } : null;
    },
    canSeeTileFrom() {
      return true;
    },
  });
  const service = createMonsterActionApplyService(player, log);
  const deps = createMonsterActionDeps(instance, player, log);
  const random = Math.random;
  Math.random = () => 0;
  const { setCombatRngForTesting, resetCombatRngForTesting } = require('../runtime/combat/combat-resolution.helpers');
  setCombatRngForTesting(() => 0);
  try {
    service.applyMonsterBasicAttack({
      kind: 'basic-attack',
      instanceId: instance.meta.instanceId,
      runtimeId: monster.runtimeId,
      targetPlayerId: player.playerId,
    }, deps);
  }
  finally {
    Math.random = random;
    resetCombatRngForTesting();
  }

  assert.equal(log.some((entry) => entry[0] === 'applyDamage'), false, `dodged monster basic attack should not apply damage, log=${JSON.stringify(log)}`);
  assert.equal(log.some((entry) => entry[0] === 'pushDamageFloatEffect'), false, `dodged monster basic attack should not enqueue damage float, log=${JSON.stringify(log)}`);
  const notice = log.find((entry) => entry[0] === 'queuePlayerNotice');
  assert.ok(notice, `expected monster basic attack dodge notice, log=${JSON.stringify(log)}`);
  assert.match(notice[2], /唤灵真人对你发起攻击/);
  assert.match(notice[2], /被闪避/);
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.id, player.playerId);
  assert.equal(deps.combatOutcomes[0].result.damage, 0);
  assert.equal(deps.combatOutcomes[0].result.dodged, true);
}

function testMonsterBasicAttackRejectsTargetInstanceMismatchWithDiagnostic() {
  const log = [];
  const player = createTarget({
    playerId: 'player:victim',
    name: '受击者',
    instanceId: 'stale:previous',
    hp: 100,
    x: 11,
    y: 10,
  });
  const monster = createMonster();
  const instance = createInstance({
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    getPlayerPosition(playerId) {
      return playerId === player.playerId ? { x: player.x, y: player.y } : null;
    },
    canSeeTileFrom() {
      return true;
    },
  });
  const service = createMonsterActionApplyService(player, log);
  const deps = createMonsterActionDeps(instance, player, log);
  deps.getPlayerLocation = (playerId) => {
    log.push(['getPlayerLocation', playerId]);
    return playerId === player.playerId
      ? { instanceId: instance.meta.instanceId, x: player.x, y: player.y }
      : null;
  };
  service.applyMonsterBasicAttack({
    kind: 'basic-attack',
    instanceId: instance.meta.instanceId,
    runtimeId: monster.runtimeId,
    targetPlayerId: player.playerId,
  }, deps);

  assert.equal(log.some((entry) => entry[0] === 'applyDamage'), false, `instance-mismatched target should not take damage, log=${JSON.stringify(log)}`);
  assert.equal(log.some((entry) => entry[0] === 'queuePlayerNotice'), false, `instance-mismatched target should not receive combat notice, log=${JSON.stringify(log)}`);
  assert.equal(deps.combatOutcomes.length, 0);
  assert.equal(deps.combatDiagnostics.length, 1);
  assert.equal(deps.combatDiagnostics[0].reason, 'target_instance_mismatch');
}

function testMonsterBasicAttackRejectsGuardFailuresWithDiagnostics() {
  const cases = [
    {
      name: 'dead monster',
      expectedReason: 'monster_dead',
      monster: { alive: false, hp: 0 },
    },
    {
      name: 'dead target',
      expectedReason: 'target_dead',
      player: { hp: 0 },
    },
    {
      name: 'missing target position',
      expectedReason: 'missing_runtime_target_position',
      instance: {
        getPlayerPosition() {
          return null;
        },
      },
    },
    {
      name: 'out of range',
      expectedReason: 'out_of_range',
      player: { x: 15, y: 10 },
    },
    {
      name: 'line of sight blocked',
      expectedReason: 'line_of_sight_blocked',
      instance: {
        canSeeTileFrom() {
          return false;
        },
      },
    },
    {
      name: 'missing target location',
      expectedReason: 'missing_target_location',
      deps: {
        getPlayerLocation() {
          return null;
        },
      },
    },
  ];

  for (const testCase of cases) {
    const log = [];
    const player = createTarget({
      playerId: 'player:victim',
      name: '受击者',
      hp: 100,
      x: 11,
      y: 10,
      ...testCase.player,
    });
    const monster = createMonster(testCase.monster);
    const instance = createInstance({
      getMonster(runtimeId) {
        return runtimeId === monster.runtimeId ? monster : null;
      },
      getPlayerPosition(playerId) {
        return playerId === player.playerId ? { x: player.x, y: player.y } : null;
      },
      canSeeTileFrom() {
        return true;
      },
      ...testCase.instance,
    });
    const service = createMonsterActionApplyService(player, log);
    const deps = {
      ...createMonsterActionDeps(instance, player, log),
      ...testCase.deps,
    };
    service.applyMonsterBasicAttack({
      kind: 'basic-attack',
      instanceId: instance.meta.instanceId,
      runtimeId: monster.runtimeId,
      targetPlayerId: player.playerId,
    }, deps);

    assert.equal(log.some((entry) => entry[0] === 'applyDamage'), false, `${testCase.name} should not apply damage, log=${JSON.stringify(log)}`);
    assert.equal(log.some((entry) => entry[0] === 'queuePlayerNotice'), false, `${testCase.name} should not queue combat notice, log=${JSON.stringify(log)}`);
    assert.equal(deps.combatOutcomes.length, 0, `${testCase.name} should not record success outcome`);
    assert.equal(deps.combatDiagnostics.length, 1, `${testCase.name} should record one diagnostic`);
    assert.equal(deps.combatDiagnostics[0].reason, testCase.expectedReason, `${testCase.name} diagnostic reason`);
  }
}

function testMonsterSkillQueuesCombatNoticeAndDamageFloat() {
  const log = [];
  const player = createTarget({
    playerId: 'player:victim',
    name: '受击者',
    hp: 100,
    x: 11,
    y: 10,
  });
  const monster = createMonster();
  const instance = createInstance({
    tick: 31,
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    getPlayerPosition(playerId) {
      return playerId === player.playerId ? { x: player.x, y: player.y } : null;
    },
    canSeeTileFrom() {
      return true;
    },
    applyTemporaryBuffToMonster(runtimeId, buff) {
      log.push(['applyTemporaryBuffToMonster', runtimeId, buff]);
    },
  });
  const playerCombatService = {
    castMonsterSkill(attacker, target, skillId, currentTick, distance) {
      log.push(['castMonsterSkill', attacker.runtimeId, target.playerId, skillId, currentTick, distance]);
      return {
        skillId,
        totalDamage: 17,
        hitCount: 1,
        damageKind: 'spell',
        targetPlayerId: target.playerId,
      };
    },
  };
  const service = createMonsterActionApplyService(player, log, playerCombatService);
  const deps = createMonsterActionDeps(instance, player, log);
  service.applyMonsterSkill({
    kind: 'skill',
    instanceId: instance.meta.instanceId,
    runtimeId: monster.runtimeId,
    targetPlayerId: player.playerId,
    skillId: 'monster:soul_flame',
  }, deps);

  const float = log.find((entry) => entry[0] === 'pushDamageFloatEffect');
  assert.ok(float, `expected monster skill to enqueue damage float, log=${JSON.stringify(log)}`);
  assert.deepEqual(float.slice(0, 5), ['pushDamageFloatEffect', 'public:yunlai_town', 11, 10, 17]);
  const notice = log.find((entry) => entry[0] === 'queuePlayerNotice');
  assert.ok(notice, `expected monster skill to enqueue combat notice, log=${JSON.stringify(log)}`);
  assert.deepEqual(notice.slice(0, 2), ['queuePlayerNotice', 'player:victim']);
  assert.match(notice[2], /唤灵真人对你施展唤灵火/);
  assert.match(notice[2], /原始 17 - 实际 17 - 法术/);
  assert.equal(notice[3], 'combat');
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.id, player.playerId);
  assert.equal(deps.combatOutcomes[0].result.damage, 17);
}

function testDeadMonsterSkillRejectsWithoutResolvingCombat() {
  const log = [];
  const player = createTarget({
    playerId: 'player:victim',
    name: '受击者',
    hp: 100,
    x: 11,
    y: 10,
  });
  const monster = createMonster({ alive: false, hp: 0 });
  const instance = createInstance({
    tick: 31,
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    getPlayerPosition(playerId) {
      return playerId === player.playerId ? { x: player.x, y: player.y } : null;
    },
    canSeeTileFrom() {
      return true;
    },
  });
  const playerCombatService = {
    castMonsterSkill() {
      throw new Error('dead monster skill should not resolve combat');
    },
  };
  const service = createMonsterActionApplyService(player, log, playerCombatService);
  const deps = createMonsterActionDeps(instance, player, log);
  service.applyMonsterSkill({
    kind: 'skill',
    instanceId: instance.meta.instanceId,
    runtimeId: monster.runtimeId,
    targetPlayerId: player.playerId,
    skillId: 'monster:soul_flame',
  }, deps);

  assert.equal(log.some((entry) => entry[0] === 'castMonsterSkill'), false, `dead monster skill should not cast, log=${JSON.stringify(log)}`);
  assert.equal(log.some((entry) => entry[0] === 'queuePlayerNotice'), false, `dead monster skill should not notify target, log=${JSON.stringify(log)}`);
  assert.equal(deps.combatOutcomes.length, 0);
  assert.equal(deps.combatDiagnostics.length, 1);
  assert.equal(deps.combatDiagnostics[0].reason, 'monster_dead');
}

function testMonsterSkillUsesRuntimeLocationBeforeCombatStateSync() {
  const log = [];
  const player = createTarget({
    playerId: 'player:victim',
    name: '受击者',
    instanceId: 'stale:previous',
    hp: 100,
    x: 11,
    y: 10,
  });
  const monster = createMonster();
  const instance = createInstance({
    tick: 31,
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    getPlayerPosition(playerId) {
      return playerId === player.playerId ? { x: player.x, y: player.y } : null;
    },
    canSeeTileFrom() {
      return true;
    },
  });
  const playerCombatService = {
    castMonsterSkill(attacker, target, skillId, currentTick, distance) {
      log.push(['castMonsterSkill', attacker.runtimeId, target.playerId, skillId, currentTick, distance]);
      return {
        skillId,
        totalDamage: 0,
        hitCount: 0,
        damageKind: 'spell',
        damageRolls: [{
          hit: false,
          rawDamage: 17,
          damage: 0,
          dodged: true,
          damageKind: 'spell',
        }],
        targetPlayerId: target.playerId,
      };
    },
  };
  const service = createMonsterActionApplyService(player, log, playerCombatService);
  const deps = createMonsterActionDeps(instance, player, log);
  deps.getPlayerLocation = (playerId) => {
    log.push(['getPlayerLocation', playerId]);
    return playerId === player.playerId
      ? { instanceId: instance.meta.instanceId, x: player.x, y: player.y }
      : null;
  };
  service.applyMonsterSkill({
    kind: 'skill',
    instanceId: instance.meta.instanceId,
    runtimeId: monster.runtimeId,
    targetPlayerId: player.playerId,
    skillId: 'monster:soul_flame',
  }, deps);

  assert.ok(log.some((entry) => entry[0] === 'castMonsterSkill'), `expected stale player.instanceId not to suppress monster skill, log=${JSON.stringify(log)}`);
  const notice = log.find((entry) => entry[0] === 'queuePlayerNotice');
  assert.ok(notice, `expected monster skill dodge notice before combat state sync, log=${JSON.stringify(log)}`);
  assert.match(notice[2], /唤灵真人对你施展唤灵火/);
  assert.match(notice[2], /被闪避/);
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].result.dodged, true);
}

function testAnchoredMonsterChantMissStillShowsCast() {
  const log = [];
  const player = createTarget({
    playerId: 'player:victim',
    name: '受击者',
    hp: 100,
    x: 12,
    y: 10,
  });
  const monster = createMonster();
  const instance = createInstance({
    tick: 32,
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    getPlayerPosition(playerId) {
      return playerId === player.playerId ? { x: player.x, y: player.y } : null;
    },
    getPlayersAtTile() {
      return [];
    },
    canSeeTileFrom() {
      return true;
    },
  });
  const playerCombatService = {
    castMonsterSkill() {
      throw new Error('anchored miss should not resolve damage against moved target');
    },
  };
  const service = createMonsterActionApplyService(player, log, playerCombatService);
  const deps = createMonsterActionDeps(instance, player, log);
  service.applyMonsterSkill({
    kind: 'skill',
    instanceId: instance.meta.instanceId,
    runtimeId: monster.runtimeId,
    targetPlayerId: player.playerId,
    skillId: 'monster:soul_flame',
    targetX: 11,
    targetY: 10,
    warningCells: [{ x: 11, y: 10 }],
  }, deps);

  assert.ok(log.some((entry) => entry[0] === 'pushActionLabelEffect'
    && entry[1] === instance.meta.instanceId
    && entry[2] === monster.x
    && entry[3] === monster.y
    && entry[4] === '唤灵火'), `expected anchored miss to show cast label, log=${JSON.stringify(log)}`);
  assert.ok(log.some((entry) => entry[0] === 'pushAttackEffect'
    && entry[1] === instance.meta.instanceId
    && entry[2] === monster.x
    && entry[3] === monster.y
    && entry[4] === 11
    && entry[5] === 10), `expected anchored miss to show cast effect at warning anchor, log=${JSON.stringify(log)}`);
  assert.ok(!log.some((entry) => entry[0] === 'queuePlayerNotice'), `anchored miss should not report a hit notice, log=${JSON.stringify(log)}`);
}

function testAnchoredMonsterChantHitsWarningCellPlayerWithoutPrimaryTargetLocation() {
  const log = [];
  const player = createTarget({
    playerId: 'player:victim',
    name: '受击者',
    instanceId: 'stale:previous',
    hp: 100,
    x: 11,
    y: 10,
  });
  const monster = createMonster();
  const instance = createInstance({
    tick: 33,
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    getPlayerPosition() {
      return null;
    },
    getPlayersAtTile(x, y) {
      return x === player.x && y === player.y
        ? [{ playerId: player.playerId, x, y }]
        : [];
    },
    canSeeTileFrom() {
      return true;
    },
  });
  const playerCombatService = {
    castMonsterSkill(attacker, target, skillId, currentTick, distance) {
      log.push(['castMonsterSkill', attacker.runtimeId, target.playerId, skillId, currentTick, distance]);
      return {
        skillId,
        totalDamage: 0,
        hitCount: 0,
        damageKind: 'spell',
        damageRolls: [{
          hit: false,
          rawDamage: 17,
          damage: 0,
          dodged: true,
          damageKind: 'spell',
        }],
        targetPlayerId: target.playerId,
      };
    },
  };
  const service = createMonsterActionApplyService(player, log, playerCombatService);
  const deps = createMonsterActionDeps(instance, player, log);
  deps.getPlayerLocation = () => null;
  service.applyMonsterSkill({
    kind: 'skill',
    instanceId: instance.meta.instanceId,
    runtimeId: monster.runtimeId,
    targetPlayerId: 'player:no-longer-authoritative',
    skillId: 'monster:soul_flame',
    targetX: 11,
    targetY: 10,
    warningCells: [{ x: 11, y: 10 }],
  }, deps);

  assert.ok(log.some((entry) => entry[0] === 'castMonsterSkill'
    && entry[2] === player.playerId), `expected warning-cell player to be resolved even when primary target location is missing, log=${JSON.stringify(log)}`);
  const notice = log.find((entry) => entry[0] === 'queuePlayerNotice');
  assert.ok(notice, `expected dodge notice for warning-cell target, log=${JSON.stringify(log)}`);
  assert.match(notice[2], /唤灵真人对你施展唤灵火/);
  assert.match(notice[2], /被闪避/);
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.id, player.playerId);
  assert.equal(deps.combatOutcomes[0].result.targetSource, 'warning_cell');
}

function testMonsterSkillConsumesMultiplePlanTargetsOncePerTarget() {
  const log = [];
  const playerA = createTarget({
    playerId: 'player:a',
    name: '甲',
    hp: 100,
    x: 11,
    y: 10,
  });
  const playerB = createTarget({
    playerId: 'player:b',
    name: '乙',
    hp: 100,
    x: 12,
    y: 10,
  });
  const players = new Map([
    [playerA.playerId, playerA],
    [playerB.playerId, playerB],
  ]);
  const monster = createMonster({
    skills: [{
      id: 'monster:soul_flame',
      name: '唤灵火',
      range: 3,
      cooldown: { ticks: 1 },
      cost: {},
      targeting: { shape: 'line', maxTargets: 2 },
      effects: [],
    }],
  });
  const instance = createInstance({
    tick: 34,
    getMonster(runtimeId) {
      return runtimeId === monster.runtimeId ? monster : null;
    },
    getPlayerPosition(playerId) {
      const player = players.get(playerId);
      return player ? { x: player.x, y: player.y } : null;
    },
    getPlayersAtTile(x, y) {
      return [...players.values()]
        .filter((player) => player.x === x && player.y === y)
        .map((player) => ({ playerId: player.playerId, x, y }));
    },
    canSeeTileFrom() {
      return true;
    },
    markMonsterRuntimePersistenceDirty(runtimeId) {
      log.push(['markMonsterRuntimePersistenceDirty', runtimeId]);
    },
  });
  const playerCombatService = {
    castMonsterSkill(attacker, target, skillId, _currentTick, _distance, _applySelfBuff, _applyTargetBuff, _spendQi, options) {
      log.push(['castMonsterSkill', attacker.runtimeId, target.playerId, skillId, options?.skipResourceAndCooldown, options?.targetCount]);
      return {
        skillId,
        totalDamage: target.playerId === playerA.playerId ? 9 : 7,
        hitCount: 1,
        damageKind: 'spell',
        targetPlayerId: target.playerId,
      };
    },
  };
  const service = createMonsterActionApplyService(players, log, playerCombatService);
  const deps = createMonsterActionDeps(instance, players, log);
  service.applyMonsterSkill({
    kind: 'skill',
    instanceId: instance.meta.instanceId,
    runtimeId: monster.runtimeId,
    targetPlayerId: playerA.playerId,
    skillId: 'monster:soul_flame',
    targetX: 11,
    targetY: 10,
    warningCells: [{ x: 11, y: 10 }, { x: 12, y: 10 }],
  }, deps);

  const castCalls = log.filter((entry) => entry[0] === 'castMonsterSkill');
  assert.deepEqual(castCalls.map((entry) => [entry[2], entry[4], entry[5]]), [
    [playerA.playerId, false, 2],
    [playerB.playerId, true, 2],
  ]);
  assert.equal(deps.combatOutcomes.length, 2);
  assert.deepEqual(deps.combatOutcomes.map((entry) => entry.target.id), [playerA.playerId, playerB.playerId]);
  assert.deepEqual(deps.combatOutcomes.map((entry) => entry.result.damage), [9, 7]);
}

function testPeacefulLineAllowsTileAttack() {
  const log = [];
  const attacker = createAttacker();
  const instance = createInstance({
    meta: {
      supportsPvp: false,
      canDamageTile: true,
    },
    damageTile(x, y, amount) {
      log.push(['damageTile', x, y, amount]);
      return { appliedDamage: 5 };
    },
  });
  const service = createBasicAttackService(attacker, createTarget(), log);
  const deps = createBasicAttackDeps(instance, log);
  service.dispatchBasicAttackToTile(attacker, 11, 10, 'physical', 12, deps);
  assert.deepEqual(log[0], ['getInstanceRuntimeOrThrow', 'public:yunlai_town']);
  assert.deepEqual(log[1], ['damageTile', 11, 10, 12]);
  assert.deepEqual(log[2], ['pushActionLabelEffect', 'public:yunlai_town', 10, 10, '攻击']);
  assert.deepEqual(log[3].slice(0, 6), ['pushAttackEffect', 'public:yunlai_town', 10, 10, 11, 10]);
  assert.equal(typeof log[3][6], 'string');
  assert.deepEqual(log[4].slice(0, 5), ['pushDamageFloatEffect', 'public:yunlai_town', 11, 10, 5]);
  assert.equal(typeof log[4][5], 'string');
  assert.deepEqual(log[5].slice(0, 2), ['queuePlayerNotice', 'player:attacker']);
  assert.match(log[5][2], /攻击/);
  assert.match(log[5][2], /原始 12 - 实际 5 - 物理/);
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.kind, 'tile');
  assert.equal(deps.combatOutcomes[0].result.damage, 5);
}

function testTileAttackHitsHerbContainerBeforeTerrainDamage() {
  const log = [];
  const attacker = createAttacker();
  const instance = createInstance({
    getContainerAtTile(x, y) {
      log.push(['getContainerAtTile', x, y]);
      return {
        id: 'herb1',
        name: '月露草',
        x,
        y,
        variant: 'herb',
      };
    },
    damageTile(x, y, amount) {
      log.push(['damageTile', x, y, amount]);
      return { appliedDamage: amount };
    },
  });
  const service = createBasicAttackService(attacker, createTarget(), log);
  const deps = createBasicAttackDeps(instance, log);
  service.dispatchBasicAttackToTile(attacker, 11, 10, 'physical', 12, deps, 22);
  assert.deepEqual(log[0], ['getInstanceRuntimeOrThrow', 'public:yunlai_town']);
  assert.deepEqual(log[1], ['getContainerAtTile', 11, 10]);
  assert.deepEqual(log[2], ['damageHerbContainerAtTile', 'public:yunlai_town', 'herb1', 22]);
  assert.deepEqual(log[3], ['pushActionLabelEffect', 'public:yunlai_town', 10, 10, '攻击']);
  assert.deepEqual(log[4].slice(0, 6), ['pushAttackEffect', 'public:yunlai_town', 10, 10, 11, 10]);
  assert.deepEqual(log[5].slice(0, 5), ['pushDamageFloatEffect', 'public:yunlai_town', 11, 10, 1]);
  assert.deepEqual(log[6].slice(0, 2), ['queuePlayerNotice', 'player:attacker']);
  assert.match(log[6][2], /打落 1 朵/);
  assert.match(log[6][2], /还需 5 息/);
  assert.equal(log.some((entry) => entry[0] === 'damageTile'), false);
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.kind, 'container');
  assert.equal(deps.combatOutcomes[0].target.id, 'herb1');
  assert.equal(deps.combatOutcomes[0].result.damage, 1);
}

function testPlannedTileAttackDoesNotRetargetHerbContainer() {
  const log = [];
  const attacker = createAttacker();
  const instance = createInstance({
    getContainerAtTile(x, y) {
      log.push(['getContainerAtTile', x, y]);
      return {
        id: 'herb1',
        name: '月露草',
        x,
        y,
        variant: 'herb',
      };
    },
    damageTile(x, y, amount) {
      log.push(['damageTile', x, y, amount]);
      return { appliedDamage: 5 };
    },
  });
  const service = createBasicAttackService(attacker, createTarget(), log);
  const deps = createBasicAttackDeps(instance, log);
  service.dispatchBasicAttackToTile(attacker, 11, 10, 'physical', 12, deps, 22, {
    plannedTarget: {
      kind: 'tile',
      x: 11,
      y: 10,
    },
  });
  assert.equal(log.some((entry) => entry[0] === 'getContainerAtTile'), false);
  assert.deepEqual(log[1], ['damageTile', 11, 10, 12]);
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.kind, 'tile');
  assert.equal(deps.combatOutcomes[0].result.damage, 5);
}

function testPlannedContainerAttackDoesNotRequireTerrainDamageCapability() {
  const log = [];
  const attacker = createAttacker();
  const instance = createInstance({
    meta: {
      instanceId: 'public:yunlai_town',
      supportsPvp: false,
      canDamageTile: false,
    },
    getContainerAtTile(x, y) {
      log.push(['getContainerAtTile', x, y]);
      return {
        id: 'herb1',
        name: '月露草',
        x,
        y,
        variant: 'herb',
      };
    },
    damageTile() {
      throw new Error('planned container attack must not damage tile');
    },
  });
  const service = createBasicAttackService(attacker, createTarget(), log);
  const deps = createBasicAttackDeps(instance, log);
  service.dispatchBasicAttackToTile(attacker, 11, 10, 'physical', 12, deps, 22, {
    plannedTarget: {
      kind: 'container',
      id: 'herb1',
      x: 11,
      y: 10,
    },
  });
  assert.deepEqual(log[1], ['getContainerAtTile', 11, 10]);
  assert.deepEqual(log[2], ['damageHerbContainerAtTile', 'public:yunlai_town', 'herb1', 22]);
  assert.equal(deps.combatOutcomes.length, 1);
  assert.equal(deps.combatOutcomes[0].target.kind, 'container');
  assert.equal(deps.combatOutcomes[0].target.id, 'herb1');
}

function testPlannedContainerAttackDoesNotFallbackToTerrainWhenContainerGone() {
  const log = [];
  const attacker = createAttacker();
  const instance = createInstance({
    getContainerAtTile(x, y) {
      log.push(['getContainerAtTile', x, y]);
      return null;
    },
    damageTile() {
      throw new Error('planned stale container must not fall back to terrain');
    },
  });
  const service = createBasicAttackService(attacker, createTarget(), log);
  const deps = createBasicAttackDeps(instance, log);
  assert.throws(
    () => service.dispatchBasicAttackToTile(attacker, 11, 10, 'physical', 12, deps, 22, {
      plannedTarget: {
        kind: 'container',
        id: 'herb1',
        x: 11,
        y: 10,
      },
    }),
    /该目标无法被攻击/,
  );
  assert.deepEqual(log, [
    ['getInstanceRuntimeOrThrow', 'public:yunlai_town'],
    ['getContainerAtTile', 11, 10],
  ]);
  assert.equal(deps.combatOutcomes.length, 0);
}

function testPlannedFormationBoundaryAttackDoesNotFallbackWhenBoundaryGone() {
  const log = [];
  const attacker = createAttacker();
  const instance = createInstance({
    getContainerAtTile() {
      throw new Error('planned stale boundary must not retarget container');
    },
    damageTile() {
      throw new Error('planned stale boundary must not fall back to terrain');
    },
  });
  const service = createBasicAttackService(attacker, createTarget(), log);
  const deps = createBasicAttackDeps(instance, log);
  deps.worldRuntimeFormationService = {
    getBoundaryBarrierCombatState(instanceId, x, y) {
      log.push(['getBoundaryBarrierCombatState', instanceId, x, y]);
      return null;
    },
  };
  assert.throws(
    () => service.dispatchBasicAttackToTile(attacker, 11, 10, 'physical', 12, deps, 22, {
      plannedTarget: {
        kind: 'formation',
        id: 'boundary:11:10',
        source: 'formation_boundary',
        x: 11,
        y: 10,
      },
    }),
    /该目标无法被攻击/,
  );
  assert.deepEqual(log, [
    ['getInstanceRuntimeOrThrow', 'public:yunlai_town'],
    ['getBoundaryBarrierCombatState', 'public:yunlai_town', 11, 10],
  ]);
  assert.equal(deps.combatOutcomes.length, 0);
}

function testTileAttackFallsBackToTerrainWhenContainerIsNotHerb() {
  const log = [];
  const attacker = createAttacker();
  const instance = createInstance({
    getContainerAtTile(x, y) {
      log.push(['getContainerAtTile', x, y]);
      return {
        id: 'box1',
        name: '木箱',
        x,
        y,
      };
    },
    damageTile(x, y, amount) {
      log.push(['damageTile', x, y, amount]);
      return { appliedDamage: 5 };
    },
  });
  const service = createBasicAttackService(attacker, createTarget(), log);
  const deps = createBasicAttackDeps(instance, log);
  service.dispatchBasicAttackToTile(attacker, 11, 10, 'physical', 12, deps, 22);
  assert.deepEqual(log[0], ['getInstanceRuntimeOrThrow', 'public:yunlai_town']);
  assert.deepEqual(log[1], ['getContainerAtTile', 11, 10]);
  assert.deepEqual(log[2], ['damageTile', 11, 10, 12]);
}

function testTileAttackWithoutLootContainerServiceFallsBackToTerrain() {
  const log = [];
  const attacker = createAttacker();
  const instance = createInstance({
    getContainerAtTile(x, y) {
      log.push(['getContainerAtTile', x, y]);
      return {
        id: 'box1',
        name: '木箱',
        x,
        y,
      };
    },
    damageTile(x, y, amount) {
      log.push(['damageTile', x, y, amount]);
      return { appliedDamage: 5 };
    },
  });
  const service = createBasicAttackService(attacker, createTarget(), log);
  const deps = createBasicAttackDeps(instance, log);
  delete deps.worldRuntimeLootContainerService;
  service.dispatchBasicAttackToTile(attacker, 11, 10, 'physical', 12, deps, 22);
  assert.deepEqual(log[0], ['getInstanceRuntimeOrThrow', 'public:yunlai_town']);
  assert.deepEqual(log[1], ['getContainerAtTile', 11, 10]);
  assert.deepEqual(log[2], ['damageTile', 11, 10, 12]);
}

function testRealLineAllowsTileAttack() {
  const log = [];
  const attacker = createAttacker({ instanceId: 'real:yunlai_town' });
  const instance = createInstance({
    meta: {
      instanceId: 'real:yunlai_town',
      supportsPvp: true,
      canDamageTile: true,
    },
    damageTile(x, y, amount) {
      log.push(['damageTile', x, y, amount]);
      return { appliedDamage: 7 };
    },
  });
  const service = createBasicAttackService(attacker, createTarget(), log);
  const deps = createBasicAttackDeps(instance, log);
  service.dispatchBasicAttackToTile(attacker, 11, 10, 'physical', 12, deps);
  assert.deepEqual(log[0], ['getInstanceRuntimeOrThrow', 'real:yunlai_town']);
  assert.deepEqual(log[1], ['damageTile', 11, 10, 12]);
  assert.deepEqual(log[2], ['pushActionLabelEffect', 'real:yunlai_town', 10, 10, '攻击']);
  assert.deepEqual(log[3].slice(0, 6), ['pushAttackEffect', 'real:yunlai_town', 10, 10, 11, 10]);
  assert.equal(typeof log[3][6], 'string');
  assert.deepEqual(log[4].slice(0, 5), ['pushDamageFloatEffect', 'real:yunlai_town', 11, 10, 7]);
  assert.equal(typeof log[4][5], 'string');
  assert.deepEqual(log[5].slice(0, 2), ['queuePlayerNotice', 'player:attacker']);
  assert.match(log[5][2], /攻击/);
  assert.match(log[5][2], /原始 12 - 实际 7 - 物理/);
}

async function testPeacefulLineRejectsPlayerLockOn() {
  const log = [];
  const attacker = createAttacker();
  const target = createTarget();
  const service = createBattleEngageService(attacker, target, log);
  const deps = createBattleEngageDeps(createInstance({
    meta: {
      supportsPvp: false,
      canDamageTile: true,
    },
  }), log);
  await assert.rejects(
    () => service.dispatchEngageBattle(attacker.playerId, target.playerId, null, null, null, true, deps),
    /当前实例不允许玩家互攻/,
  );
  assert.deepEqual(log, [
    ['getInstanceRuntimeOrThrow', 'public:yunlai_town'],
    ['interruptManualCombat', 'player:attacker'],
  ]);
}

async function testRealLineAllowsTileLockOnAndDispatch() {
  const log = [];
  const attacker = createAttacker({ instanceId: 'real:yunlai_town' });
  const service = createBattleEngageService(attacker, createTarget({ instanceId: 'real:yunlai_town' }), log);
  const deps = createBattleEngageDeps(createInstance({
    meta: {
      instanceId: 'real:yunlai_town',
      supportsPvp: true,
      canDamageTile: true,
    },
  }), log);
  const autoCommand = { kind: 'basicAttack', targetPlayerId: null, targetMonsterId: null, targetX: 11, targetY: 10 };
  deps.buildAutoCombatCommand = () => autoCommand;
  await service.dispatchEngageBattle(attacker.playerId, null, null, 11, 10, true, deps);
  assert.deepEqual(log, [
    ['getInstanceRuntimeOrThrow', 'real:yunlai_town'],
    ['interruptManualCombat', 'player:attacker'],
    ['updateCombatSettings', 'player:attacker', { autoBattle: true }, 12],
    ['setCombatTarget', 'player:attacker', 'tile:11:10', true, 12],
    ['dispatchPlayerCommand', 'player:attacker', autoCommand],
  ]);
}

Promise.resolve()
  .then(() => testPeacefulLineRejectsPlayerBasicAttack())
  .then(() => testRealLineAllowsPlayerBasicAttack())
  .then(() => testPlayerBasicAttackMonsterRecordsCombatOutcome())
  .then(() => testPlayerBasicAttackMonsterKillKeepsRewardAndDamageFloat())
  .then(() => testPlayerBasicAttackFormationRecordsCombatOutcome())
  .then(() => testMonsterBasicAttackQueuesCombatNoticeAndDamageFloat())
  .then(() => testMonsterBasicAttackDodgeQueuesCombatNoticeAndOutcome())
  .then(() => testMonsterBasicAttackRejectsTargetInstanceMismatchWithDiagnostic())
  .then(() => testMonsterBasicAttackRejectsGuardFailuresWithDiagnostics())
  .then(() => testMonsterSkillQueuesCombatNoticeAndDamageFloat())
  .then(() => testDeadMonsterSkillRejectsWithoutResolvingCombat())
  .then(() => testMonsterSkillUsesRuntimeLocationBeforeCombatStateSync())
  .then(() => testAnchoredMonsterChantMissStillShowsCast())
  .then(() => testAnchoredMonsterChantHitsWarningCellPlayerWithoutPrimaryTargetLocation())
  .then(() => testMonsterSkillConsumesMultiplePlanTargetsOncePerTarget())
  .then(() => testPeacefulLineAllowsTileAttack())
  .then(() => testTileAttackHitsHerbContainerBeforeTerrainDamage())
  .then(() => testPlannedTileAttackDoesNotRetargetHerbContainer())
  .then(() => testPlannedContainerAttackDoesNotRequireTerrainDamageCapability())
  .then(() => testPlannedContainerAttackDoesNotFallbackToTerrainWhenContainerGone())
  .then(() => testPlannedFormationBoundaryAttackDoesNotFallbackWhenBoundaryGone())
  .then(() => testTileAttackFallsBackToTerrainWhenContainerIsNotHerb())
  .then(() => testTileAttackWithoutLootContainerServiceFallsBackToTerrain())
  .then(() => testRealLineAllowsTileAttack())
  .then(() => testPeacefulLineRejectsPlayerLockOn())
  .then(() => testRealLineAllowsTileLockOnAndDispatch())
  .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-instance-capability-guard' }, null, 2));
  });
