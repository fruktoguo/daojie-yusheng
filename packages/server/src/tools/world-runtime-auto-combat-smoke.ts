import assert from 'node:assert/strict';

import { WorldRuntimeAutoCombatService } from '../runtime/world/world-runtime-auto-combat.service';

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
testLockedDestroyedTileStopsAutoBattle();
testLockedHerbTileContinuesBasicAttack();
testLockedDepletedHerbTileStopsAutoBattle();
testLockedFormationContinuesBasicAttack();

console.log(JSON.stringify({
  ok: true,
  case: 'world-runtime-auto-combat',
  answers: '自动战斗不会在本 tick 行动次数已满时继续物化必然失败的攻击指令；一次性接战和自动战斗在无可用远程技能时，会继续贴近到普攻距离；锁定的可攻击地块摧毁后会停止自动战斗；锁定草药和阵法会在未清空或未摧毁前继续生成下一次攻击。',
}, null, 2));
