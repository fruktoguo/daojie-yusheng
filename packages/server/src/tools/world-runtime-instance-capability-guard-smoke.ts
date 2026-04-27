// @ts-nocheck

const assert = require('node:assert/strict');

const { WorldRuntimeBasicAttackService } = require('../runtime/world/world-runtime-basic-attack.service');
const { WorldRuntimeBattleEngageService } = require('../runtime/world/world-runtime-battle-engage.service');

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
  const service = new WorldRuntimeBasicAttackService(playerRuntimeService);
  service.resolveBasicAttackDamageAgainstPlayer = () => ({ rawDamage: 14, damage: 9 });
  return service;
}

function createBasicAttackDeps(instance, log = []) {
  return {
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
  .then(() => testPeacefulLineAllowsTileAttack())
  .then(() => testTileAttackHitsHerbContainerBeforeTerrainDamage())
  .then(() => testTileAttackFallsBackToTerrainWhenContainerIsNotHerb())
  .then(() => testTileAttackWithoutLootContainerServiceFallsBackToTerrain())
  .then(() => testRealLineAllowsTileAttack())
  .then(() => testPeacefulLineRejectsPlayerLockOn())
  .then(() => testRealLineAllowsTileLockOnAndDispatch())
  .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-instance-capability-guard' }, null, 2));
  });
