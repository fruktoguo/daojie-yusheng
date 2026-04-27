import assert from 'node:assert/strict';

import { WorldRuntimeAutoCombatService } from '../runtime/world/world-runtime-auto-combat.service';
import { findPathToTargetWithinRangeOnMap } from '../runtime/world/world-runtime.path-planning.helpers';

function createPlayerRuntimeService(player: Record<string, unknown>) {
  const log: unknown[][] = [];
  return {
    log,
    getPlayer(playerId: string) {
      return playerId === player.playerId ? player : null;
    },
    clearManualEngagePending(playerId: string) {
      log.push(['clearManualEngagePending', playerId]);
    },
    clearCombatTarget(playerId: string, tick: number) {
      log.push(['clearCombatTarget', playerId, tick]);
    },
    updateCombatSettings(playerId: string, input: Record<string, unknown>, tick: number) {
      log.push(['updateCombatSettings', playerId, input, tick]);
    },
    setCombatTarget(playerId: string, targetRef: string, locked: boolean, tick: number) {
      log.push(['setCombatTarget', playerId, targetRef, locked, tick]);
    },
  };
}

function createPathingInstance() {
  return {
    template: {
      width: 6,
      height: 4,
    },
    meta: {
      instanceId: 'public:test_map',
    },
    isPointInSafeZone() {
      return false;
    },
    isSafeZoneTile() {
      return false;
    },
    buildPlayerView() {
      return {
        playerId: 'player:1',
        self: { x: 1, y: 1 },
        instance: { width: 6, height: 4 },
        visiblePlayers: [],
        localMonsters: [{
          runtimeId: 'monster:1',
          x: 4,
          y: 1,
          hp: 20,
        }],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getMonster(runtimeId: string) {
      assert.equal(runtimeId, 'monster:1');
      return {
        runtimeId: 'monster:1',
        x: 4,
        y: 1,
        hp: 20,
        alive: true,
      };
    },
    isInBounds(x: number, y: number) {
      return x >= 0 && y >= 0 && x < 6 && y < 4;
    },
    toTileIndex(x: number, y: number) {
      return y * 6 + x;
    },
    isWalkable(x: number, y: number) {
      return x >= 0 && y >= 0 && x < 6 && y < 4;
    },
    forEachPathingBlocker(_playerId: string, _callback: (x: number, y: number) => void) {},
    getTileTraversalCost() {
      return 1;
    },
  };
}

function createLongRangePathingInstance() {
  return {
    template: {
      width: 8,
      height: 4,
    },
    meta: {
      instanceId: 'public:test_map',
    },
    isPointInSafeZone() {
      return false;
    },
    isSafeZoneTile() {
      return false;
    },
    buildPlayerView() {
      return {
        playerId: 'player:1',
        self: { x: 1, y: 1 },
        instance: { width: 8, height: 4 },
        visiblePlayers: [],
        localMonsters: [{
          runtimeId: 'monster:1',
          x: 5,
          y: 1,
          hp: 20,
        }],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getMonster(runtimeId: string) {
      assert.equal(runtimeId, 'monster:1');
      return {
        runtimeId: 'monster:1',
        x: 5,
        y: 1,
        hp: 20,
        maxHp: 20,
        alive: true,
      };
    },
    isInBounds(x: number, y: number) {
      return x >= 0 && y >= 0 && x < 8 && y < 4;
    },
    toTileIndex(x: number, y: number) {
      return y * 8 + x;
    },
    isWalkable(x: number, y: number) {
      return x >= 0 && y >= 0 && x < 8 && y < 4;
    },
    forEachPathingBlocker(_playerId: string, _callback: (x: number, y: number) => void) {},
    getTileTraversalCost() {
      return 1;
    },
  };
}

function createWidePathingInstance() {
  let boundsChecks = 0;
  const instance = {
    template: {
      width: 64,
      height: 8,
    },
    isInBounds(x: number, y: number) {
      boundsChecks += 1;
      return x >= 0 && y >= 0 && x < 64 && y < 8;
    },
    toTileIndex(x: number, y: number) {
      return y * 64 + x;
    },
    isWalkable(x: number, y: number) {
      return x >= 0 && y >= 0 && x < 64 && y < 8;
    },
    forEachPathingBlocker(_playerId: string, _callback: (x: number, y: number) => void) {},
    getTileTraversalCost() {
      return 1;
    },
  };
  return {
    instance,
    getBoundsChecks() {
      return boundsChecks;
    },
  };
}

function createAdjacentMonsterInstance() {
  return {
    meta: {
      instanceId: 'public:test_map',
    },
    isPointInSafeZone() {
      return false;
    },
    isSafeZoneTile() {
      return false;
    },
    buildPlayerView() {
      return {
        playerId: 'player:1',
        self: { x: 1, y: 1 },
        instance: { width: 4, height: 4 },
        visiblePlayers: [],
        localMonsters: [{
          runtimeId: 'monster:1',
          x: 2,
          y: 1,
          hp: 20,
        }],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getMonster(runtimeId: string) {
      assert.equal(runtimeId, 'monster:1');
      return {
        runtimeId: 'monster:1',
        x: 2,
        y: 1,
        hp: 20,
        maxHp: 20,
        alive: true,
      };
    },
  };
}

function createAutoBattlePlayer() {
  return {
    playerId: 'player:1',
    hp: 100,
    x: 1,
    y: 1,
    instanceId: 'public:test_map',
    qi: 100,
    attrs: {
      numericStats: {
        viewRange: 6,
        maxQiOutputPerTick: 100,
        actionsPerTurn: 1,
      },
    },
    actions: { actions: [] },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      autoBattleTargetingMode: 'nearest',
      combatTargetId: null,
      combatTargetLocked: false,
      manualEngagePending: false,
      combatActionTick: 12,
      combatActionsUsedThisTick: 1,
    },
  };
}

function createMaterializeDeps(instance: Record<string, unknown>, enqueueLog: unknown[][], currentTick: number) {
  return {
    listConnectedPlayerIds() {
      return ['player:1'];
    },
    hasPendingCommand() {
      return false;
    },
    worldRuntimeNavigationService: {
      hasNavigationIntent() {
        return false;
      },
    },
    getPlayerLocation() {
      return {
        instanceId: 'public:test_map',
      };
    },
    getInstanceRuntime(instanceId: string) {
      assert.equal(instanceId, 'public:test_map');
      return instance;
    },
    enqueuePendingCommand(playerId: string, command: Record<string, unknown>) {
      enqueueLog.push([playerId, command]);
    },
    resolveCurrentTickForPlayerId() {
      return currentTick;
    },
    queuePlayerNotice() {},
  };
}

function testAutoCombatDoesNotEnqueueSpentActionCommand(): void {
  const player = createAutoBattlePlayer();
  const enqueueLog: unknown[][] = [];
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player) as never);

  service.materializeAutoCombatCommands(createMaterializeDeps(
    createAdjacentMonsterInstance(),
    enqueueLog,
    12,
  ) as never);

  assert.deepEqual(enqueueLog, []);

  player.combat.combatActionTick = 11;
  service.materializeAutoCombatCommands(createMaterializeDeps(
    createAdjacentMonsterInstance(),
    enqueueLog,
    12,
  ) as never);

  assert.equal(enqueueLog.length, 1);
  assert.equal((enqueueLog[0]?.[1] as { kind?: string })?.kind, 'basicAttack');
}

function testManualEngageFallsBackToMoveWhenOnlyRangedSkillIsOnCooldown(): void {
  const player = {
    playerId: 'player:1',
    hp: 100,
    x: 1,
    y: 1,
    instanceId: 'public:test_map',
    qi: 100,
    attrs: {
      numericStats: {
        viewRange: 6,
        maxQiOutputPerTick: 100,
      },
    },
    actions: {
      actions: [{
        id: 'skill:ranged',
        type: 'skill',
        range: 3,
        cooldownLeft: 5,
        autoBattleEnabled: true,
        skillEnabled: true,
      }],
    },
    combat: {
      autoBattle: false,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: 'monster:1',
      combatTargetLocked: false,
      manualEngagePending: true,
    },
  };
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player) as never);
  const command = service.buildAutoCombatCommand(createPathingInstance() as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 12;
    },
    queuePlayerNotice() {},
  } as never);
  assert.deepEqual(command, {
    kind: 'move',
    direction: 2,
    continuous: true,
    maxSteps: 2,
    path: [{ x: 2, y: 1 }, { x: 3, y: 1 }],
    autoCombat: true,
  });
}

function testOutOfRangeSkillMovesToSkillMaxRangeImmediately(): void {
  const player = {
    playerId: 'player:1',
    hp: 100,
    x: 1,
    y: 1,
    instanceId: 'public:test_map',
    qi: 100,
    attrs: {
      numericStats: {
        viewRange: 8,
        maxQiOutputPerTick: 100,
      },
    },
    actions: {
      actions: [{
        id: 'skill:ranged',
        type: 'skill',
        range: 3,
        cooldownLeft: 0,
        autoBattleEnabled: true,
        skillEnabled: true,
      }],
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill:ranged',
          cost: 0,
        }],
      }],
    },
    combat: {
      autoBattle: false,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: 'monster:1',
      combatTargetLocked: false,
      manualEngagePending: true,
    },
  };
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player) as never);
  const command = service.buildAutoCombatCommand(createLongRangePathingInstance() as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 13;
    },
    queuePlayerNotice() {},
  } as never);
  assert.deepEqual(command, {
    kind: 'move',
    direction: 2,
    continuous: true,
    maxSteps: 1,
    path: [{ x: 2, y: 1 }],
    autoCombat: true,
  });
}

function testStationaryOutOfRangeSkillSkipsWithoutMove(): void {
  const player = {
    playerId: 'player:1',
    hp: 100,
    x: 1,
    y: 1,
    instanceId: 'public:test_map',
    qi: 100,
    attrs: {
      numericStats: {
        viewRange: 8,
        maxQiOutputPerTick: 100,
      },
    },
    actions: {
      actions: [{
        id: 'skill:ranged',
        type: 'skill',
        range: 3,
        cooldownLeft: 0,
        autoBattleEnabled: true,
        skillEnabled: true,
      }],
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill:ranged',
          cost: 0,
        }],
      }],
    },
    combat: {
      autoBattle: false,
      autoRetaliate: false,
      autoBattleStationary: true,
      combatTargetId: 'monster:1',
      combatTargetLocked: false,
      manualEngagePending: true,
    },
  };
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player) as never);
  const command = service.buildAutoCombatCommand(createLongRangePathingInstance() as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 14;
    },
    queuePlayerNotice() {},
  } as never);
  assert.equal(command, null);
}

function testStopDistancePathDoesNotGenerateRangeCandidateGrid(): void {
  const { instance, getBoundsChecks } = createWidePathingInstance();
  const path = findPathToTargetWithinRangeOnMap(
    instance as never,
    'player:1',
    1,
    1,
    25,
    1,
    20,
    false,
  );
  assert.deepEqual(path?.points, [
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
    { x: 5, y: 1 },
  ]);
  assert.ok(getBoundsChecks() < 400, `unexpected range-grid-like bounds checks: ${getBoundsChecks()}`);
}

function testLockedDestroyedTileStopsAutoBattle(): void {
  const player = {
    playerId: 'player:1',
    hp: 100,
    x: 1,
    y: 1,
    instanceId: 'public:test_map',
    qi: 100,
    attrs: {
      numericStats: {
        viewRange: 6,
        maxQiOutputPerTick: 100,
      },
    },
    actions: {
      actions: [],
    },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: 'tile:2:1',
      combatTargetLocked: true,
      manualEngagePending: false,
    },
  };
  const playerRuntimeService = createPlayerRuntimeService(player);
  const notices: unknown[][] = [];
  const service = new WorldRuntimeAutoCombatService(playerRuntimeService as never);
  const command = service.buildAutoCombatCommand({
    meta: {
      canDamageTile: true,
    },
    isPointInSafeZone() {
      return false;
    },
    buildPlayerView() {
      return {
        playerId: 'player:1',
        self: { x: 1, y: 1 },
        instance: { width: 4, height: 4 },
        visiblePlayers: [],
        localMonsters: [],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getTileCombatState(x: number, y: number) {
      assert.deepEqual([x, y], [2, 1]);
      return {
        hp: 0,
        maxHp: 100,
        destroyed: true,
      };
    },
  } as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 19;
    },
    queuePlayerNotice(playerId: string, text: string, kind: string) {
      notices.push([playerId, text, kind]);
    },
  } as never);

  assert.equal(command, null);
  assert.deepEqual(playerRuntimeService.log, [
    ['updateCombatSettings', 'player:1', { autoBattle: false }, 19],
    ['clearCombatTarget', 'player:1', 19],
  ]);
  assert.deepEqual(notices, [
    ['player:1', '强制攻击目标已经失去踪迹，自动战斗已停止。', 'combat'],
  ]);
}

function testLockedHerbTileContinuesBasicAttack(): void {
  const player = {
    playerId: 'player:1',
    hp: 100,
    x: 1,
    y: 1,
    instanceId: 'public:test_map',
    qi: 100,
    attrs: {
      numericStats: {
        viewRange: 6,
        maxQiOutputPerTick: 100,
      },
    },
    actions: {
      actions: [{
        id: 'skill:ranged',
        type: 'skill',
        range: 3,
        cooldownLeft: 0,
        autoBattleEnabled: true,
        skillEnabled: true,
      }],
    },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: 'tile:2:1',
      combatTargetLocked: true,
      manualEngagePending: false,
    },
  };
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player) as never);
  const command = service.buildAutoCombatCommand({
    meta: {
      canDamageTile: true,
    },
    isPointInSafeZone() {
      return false;
    },
    buildPlayerView() {
      return {
        playerId: 'player:1',
        self: { x: 1, y: 1 },
        instance: { width: 4, height: 4 },
        visiblePlayers: [],
        localMonsters: [],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getContainerAtTile(x: number, y: number) {
      assert.deepEqual([x, y], [2, 1]);
      return {
        id: 'herb:1',
        variant: 'herb',
        name: '灵草',
      };
    },
    getTileCombatState() {
      return null;
    },
  } as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 21;
    },
    worldRuntimeLootContainerService: {
      getAttackableContainerCombatStateAtTile(instanceId: string, container: Record<string, unknown>, currentTick: number) {
        assert.equal(instanceId, 'public:test_map');
        assert.equal(container.id, 'herb:1');
        assert.equal(currentTick, 21);
        return {
          kind: 'container',
          id: 'herb:1',
          hp: 2,
          supportsSkill: false,
        };
      },
    },
    queuePlayerNotice() {},
  } as never);

  assert.deepEqual(command, {
    kind: 'basicAttack',
    targetPlayerId: null,
    targetMonsterId: null,
    targetX: 2,
    targetY: 1,
    autoCombat: true,
  });
}

function testLockedDepletedHerbTileStopsAutoBattle(): void {
  const player = {
    playerId: 'player:1',
    hp: 100,
    x: 1,
    y: 1,
    instanceId: 'public:test_map',
    qi: 100,
    attrs: {
      numericStats: {
        viewRange: 6,
        maxQiOutputPerTick: 100,
      },
    },
    actions: { actions: [] },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: 'tile:2:1',
      combatTargetLocked: true,
      manualEngagePending: false,
    },
  };
  const playerRuntimeService = createPlayerRuntimeService(player);
  const service = new WorldRuntimeAutoCombatService(playerRuntimeService as never);
  const command = service.buildAutoCombatCommand({
    isPointInSafeZone() {
      return false;
    },
    buildPlayerView() {
      return {
        playerId: 'player:1',
        self: { x: 1, y: 1 },
        instance: { width: 4, height: 4 },
        visiblePlayers: [],
        localMonsters: [],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getContainerAtTile() {
      return {
        id: 'herb:1',
        variant: 'herb',
        name: '灵草',
      };
    },
    getTileCombatState() {
      return null;
    },
  } as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 22;
    },
    worldRuntimeLootContainerService: {
      getAttackableContainerCombatStateAtTile() {
        return null;
      },
    },
    queuePlayerNotice() {},
  } as never);

  assert.equal(command, null);
  assert.deepEqual(playerRuntimeService.log, [
    ['updateCombatSettings', 'player:1', { autoBattle: false }, 22],
    ['clearCombatTarget', 'player:1', 22],
  ]);
}

function testLockedFormationContinuesBasicAttack(): void {
  const player = {
    playerId: 'player:1',
    hp: 100,
    x: 1,
    y: 1,
    instanceId: 'public:test_map',
    qi: 100,
    attrs: {
      numericStats: {
        viewRange: 6,
        maxQiOutputPerTick: 100,
      },
    },
    actions: { actions: [] },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: 'formation:earth:1',
      combatTargetLocked: true,
      manualEngagePending: false,
    },
  };
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player) as never);
  const command = service.buildAutoCombatCommand({
    isPointInSafeZone() {
      return false;
    },
    buildPlayerView() {
      return {
        playerId: 'player:1',
        self: { x: 1, y: 1 },
        instance: { width: 4, height: 4 },
        visiblePlayers: [],
        localMonsters: [],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getMonster() {
      return null;
    },
  } as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 23;
    },
    worldRuntimeFormationService: {
      getAttackableEntityCombatState(instanceId: string, formationId: string) {
        assert.equal(instanceId, 'public:test_map');
        assert.equal(formationId, 'formation:earth:1');
        return {
          kind: 'formation',
          id: 'formation:earth:1',
          targetRef: 'formation:earth:1',
          targetMonsterId: 'formation:earth:1',
          name: '厚土阵',
          x: 2,
          y: 1,
          hp: 1000,
          supportsSkill: true,
        };
      },
    },
    queuePlayerNotice() {},
  } as never);

  assert.deepEqual(command, {
    kind: 'basicAttack',
    targetPlayerId: null,
    targetMonsterId: 'formation:earth:1',
    targetX: null,
    targetY: null,
    autoCombat: true,
  });
}

testAutoCombatDoesNotEnqueueSpentActionCommand();
testManualEngageFallsBackToMoveWhenOnlyRangedSkillIsOnCooldown();
testOutOfRangeSkillMovesToSkillMaxRangeImmediately();
testStationaryOutOfRangeSkillSkipsWithoutMove();
testStopDistancePathDoesNotGenerateRangeCandidateGrid();
testLockedDestroyedTileStopsAutoBattle();
testLockedHerbTileContinuesBasicAttack();
testLockedDepletedHerbTileStopsAutoBattle();
testLockedFormationContinuesBasicAttack();

console.log(JSON.stringify({
  ok: true,
  case: 'world-runtime-auto-combat',
  answers: '自动战斗不会在本 tick 行动次数已满时继续物化必然失败的攻击指令；一次性接战和自动战斗会在技能超距时同息追近到技能最远射程，原地战斗会跳过超距技能；锁定的可攻击地块摧毁后会停止自动战斗；锁定草药和阵法会在未清空或未摧毁前继续生成下一次攻击。',
}, null, 2));
