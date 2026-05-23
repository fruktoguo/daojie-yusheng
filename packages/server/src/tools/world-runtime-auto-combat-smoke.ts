import assert from 'node:assert/strict';

import { WorldRuntimeAutoCombatService } from '../runtime/world/combat/world-runtime-auto-combat.service';
import { findPathToTargetWithinRangeOnMap } from '../runtime/world/world-runtime.path-planning.helpers';

function createPlayerRuntimeService(player: Record<string, unknown>, extraPlayers: Array<Record<string, unknown>> = []) {
  const log: unknown[][] = [];
  const players = new Map<string, Record<string, unknown>>([
    [String(player.playerId), player],
    ...extraPlayers.map((entry) => [String(entry.playerId), entry] as [string, Record<string, unknown>]),
  ]);
  return {
    log,
    getPlayer(playerId: string) {
      return players.get(playerId) ?? null;
    },
    clearRetaliatePlayerTargetIfExpired(playerId: string, currentTick: number) {
      log.push(['clearRetaliatePlayerTargetIfExpired', playerId, currentTick]);
      const current = players.get(playerId);
      const combat = current?.combat as { retaliatePlayerTargetId?: string | null; retaliatePlayerTargetLastAttackTick?: number | null } | undefined;
      if (!combat?.retaliatePlayerTargetId) {
        return current ?? null;
      }
      const lastAttackTick = typeof combat.retaliatePlayerTargetLastAttackTick === 'number'
        ? combat.retaliatePlayerTargetLastAttackTick
        : null;
      if (lastAttackTick === null || currentTick - lastAttackTick >= 1800) {
        combat.retaliatePlayerTargetId = null;
        combat.retaliatePlayerTargetLastAttackTick = null;
      }
      return current ?? null;
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
    useItemByInstanceId(playerId: string, itemInstanceId: string) {
      log.push(['useItemByInstanceId', playerId, itemInstanceId]);
      const inventory = player.inventory as { items?: Array<{ itemInstanceId?: string; count?: number }> } | undefined;
      const item = inventory?.items?.find((entry) => entry.itemInstanceId === itemInstanceId);
      if (item && typeof item.count === 'number') {
        item.count -= 1;
      }
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

function createAutoUsePillDeps(log: unknown[][], hasPendingCommand = false) {
  return {
    listConnectedPlayerIds() {
      return ['player:1'];
    },
    hasPendingCommand() {
      return hasPendingCommand;
    },
    refreshQuestStates(playerId: string) {
      log.push(['refreshQuestStates', playerId]);
    },
    queuePlayerNotice(playerId: string, message: string, kind: string) {
      log.push(['queuePlayerNotice', playerId, message, kind]);
    },
  };
}

function createAutoUsePillPlayer(overrides: Record<string, unknown> = {}) {
  return {
    playerId: 'player:1',
    hp: 42,
    maxHp: 100,
    qi: 30,
    maxQi: 100,
    inventory: {
      items: [{
        itemId: 'pill.minor_heal',
        itemInstanceId: 'auto-pill-minor-heal',
        name: '回春散',
        count: 3,
        healPercent: 0.22,
      }],
    },
    buffs: {
      buffs: [],
    },
    combat: {
      autoUsePills: [{
        itemId: 'pill.minor_heal',
        conditions: [{ type: 'resource_ratio', resource: 'hp', op: 'lt', thresholdPct: 60 }],
      }],
    },
    ...overrides,
  };
}

function testAutoUsePillTriggersBeforeAutoCombatCommandMaterialization(): void {
  const player = createAutoUsePillPlayer();
  const playerRuntimeService = createPlayerRuntimeService(player);
  const service = new WorldRuntimeAutoCombatService(playerRuntimeService as never);

  service.materializeAutoUsePills(createAutoUsePillDeps(playerRuntimeService.log) as never);

  assert.deepEqual(playerRuntimeService.log, [
    ['useItemByInstanceId', 'player:1', 'auto-pill-minor-heal'],
    ['refreshQuestStates', 'player:1'],
    ['queuePlayerNotice', 'player:1', '自动使用 回春散', 'success'],
  ]);
  assert.equal(((player.inventory as { items: Array<{ count: number }> }).items[0]?.count), 2);
}

function testAutoUsePillSkipsEmptyConditions(): void {
  const player = createAutoUsePillPlayer({
    combat: {
      autoUsePills: [{
        itemId: 'pill.minor_heal',
        conditions: [],
      }],
    },
  });
  const playerRuntimeService = createPlayerRuntimeService(player);
  const service = new WorldRuntimeAutoCombatService(playerRuntimeService as never);

  service.materializeAutoUsePills(createAutoUsePillDeps(playerRuntimeService.log) as never);

  assert.deepEqual(playerRuntimeService.log, []);
}

function testAutoUsePillSkipsWhenManualCommandIsPending(): void {
  const player = createAutoUsePillPlayer();
  const playerRuntimeService = createPlayerRuntimeService(player);
  const service = new WorldRuntimeAutoCombatService(playerRuntimeService as never);

  service.materializeAutoUsePills(createAutoUsePillDeps(playerRuntimeService.log, true) as never);

  assert.deepEqual(playerRuntimeService.log, []);
}

function testAutoUseBuffPillTriggersOnlyWhenBuffMissing(): void {
  const player = createAutoUsePillPlayer({
    inventory: {
      items: [{
        itemId: 'pill.crimson_bud_elixir',
        itemInstanceId: 'auto-pill-crimson-bud',
        name: '赤芽丹',
        count: 2,
        consumeBuffs: [{ buffId: 'item_buff.crimson_bud', name: '赤芽生锋', duration: 10 }],
      }],
    },
    buffs: {
      buffs: [{
        buffId: 'item_buff.crimson_bud',
        remainingTicks: 10,
        stacks: 1,
      }],
    },
    combat: {
      autoUsePills: [{
        itemId: 'pill.crimson_bud_elixir',
        conditions: [{ type: 'buff_missing' }],
      }],
    },
  });
  const playerRuntimeService = createPlayerRuntimeService(player);
  const service = new WorldRuntimeAutoCombatService(playerRuntimeService as never);

  service.materializeAutoUsePills(createAutoUsePillDeps(playerRuntimeService.log) as never);
  assert.deepEqual(playerRuntimeService.log, []);

  (player.buffs as { buffs: Array<{ remainingTicks: number }> }).buffs[0]!.remainingTicks = 0;
  service.materializeAutoUsePills(createAutoUsePillDeps(playerRuntimeService.log) as never);

  assert.deepEqual(playerRuntimeService.log, [
    ['useItemByInstanceId', 'player:1', 'auto-pill-crimson-bud'],
    ['refreshQuestStates', 'player:1'],
    ['queuePlayerNotice', 'player:1', '自动使用 赤芽丹', 'success'],
  ]);
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
  assert.equal((enqueueLog[0]?.[1] as { targetMonsterId?: string })?.targetMonsterId, 'monster:1');
}

function testMaterializeAutoCombatClearsExpiredRetaliatorBeforeEarlyExit(): void {
  const player = {
    playerId: 'player:1',
    hp: 100,
    x: 1,
    y: 1,
    instanceId: 'public:test_map',
    combat: {
      autoBattle: false,
      autoRetaliate: false,
      manualEngagePending: false,
      retaliatePlayerTargetId: 'attacker',
      retaliatePlayerTargetLastAttackTick: 10,
    },
  };
  const enqueueLog: unknown[][] = [];
  const playerRuntimeService = createPlayerRuntimeService(player);
  const service = new WorldRuntimeAutoCombatService(playerRuntimeService as never);

  service.materializeAutoCombatCommands(createMaterializeDeps(
    createAdjacentMonsterInstance(),
    enqueueLog,
    1810,
  ) as never);

  assert.deepEqual(playerRuntimeService.log, [
    ['clearRetaliatePlayerTargetIfExpired', 'player:1', 1810],
  ]);
  assert.equal((player.combat as { retaliatePlayerTargetId?: string | null }).retaliatePlayerTargetId, null);
  assert.equal(enqueueLog.length, 0);
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

function testInRangeButBlockedLineOfSightMovesToCastPosition(): void {
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
        range: 5,
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
          range: 5,
        }],
      }],
    },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: 'monster:1',
      combatTargetLocked: true,
      manualEngagePending: false,
    },
  };
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player) as never);
  const command = service.buildAutoCombatCommand({
    template: { width: 8, height: 4 },
    meta: { instanceId: 'public:test_map' },
    isPointInSafeZone() {
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
          x: 6,
          y: 1,
          hp: 20,
        }],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getMonster() {
      return {
        runtimeId: 'monster:1',
        x: 6,
        y: 1,
        hp: 20,
        maxHp: 20,
        alive: true,
      };
    },
    canSeeTileFrom(originX: number, originY: number, targetX: number, targetY: number, radius: number) {
      assert.deepEqual([targetX, targetY, radius], [6, 1, 5]);
      return originX === 2 && originY === 1;
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
  } as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 24;
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

function testUnreachableCurrentTargetIsPenalizedAndRetargetedImmediately(): void {
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
        range: 5,
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
          range: 5,
        }],
      }],
    },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: 'monster:far',
      combatTargetLocked: true,
      manualEngagePending: false,
    },
  };
  const playerRuntimeService = createPlayerRuntimeService(player);
  const service = new WorldRuntimeAutoCombatService(playerRuntimeService as never);
  const command = service.buildAutoCombatCommand({
    template: { width: 8, height: 4 },
    meta: { instanceId: 'public:test_map' },
    isPointInSafeZone() {
      return false;
    },
    buildPlayerView() {
      return {
        playerId: 'player:1',
        self: { x: 1, y: 1 },
        instance: { width: 8, height: 4 },
        visiblePlayers: [],
        localMonsters: [
          { runtimeId: 'monster:far', x: 6, y: 1, hp: 20 },
          { runtimeId: 'monster:near', x: 1, y: 2, hp: 20 },
        ],
        localNpcs: [],
        localPortals: [],
        localGroundPiles: [],
      };
    },
    getMonster(runtimeId: string) {
      if (runtimeId === 'monster:far') {
        return {
          runtimeId,
          x: 6,
          y: 1,
          hp: 20,
          maxHp: 20,
          alive: true,
        };
      }
      if (runtimeId === 'monster:near') {
        return {
          runtimeId,
          x: 1,
          y: 2,
          hp: 20,
          maxHp: 20,
          alive: true,
          aggroTargetPlayerId: 'player:1',
        };
      }
      return null;
    },
    canSeeTileFrom(originX: number, originY: number, targetX: number, targetY: number) {
      return originX === 1 && originY === 1 && targetX === 1 && targetY === 2;
    },
    isInBounds(x: number, y: number) {
      return x >= 0 && y >= 0 && x < 8 && y < 4;
    },
    toTileIndex(x: number, y: number) {
      return y * 8 + x;
    },
    isWalkable(x: number, y: number) {
      return x === 1 && y === 1;
    },
    forEachPathingBlocker(_playerId: string, _callback: (x: number, y: number) => void) {},
    getTileTraversalCost(x: number, y: number) {
      return x === 1 && y === 1 ? 1 : Number.POSITIVE_INFINITY;
    },
  } as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 25;
    },
    queuePlayerNotice() {},
  } as never);

  assert.deepEqual(command, {
    kind: 'castSkill',
    skillId: 'skill:ranged',
    targetPlayerId: null,
    targetMonsterId: 'monster:near',
    targetRef: null,
    autoCombat: true,
  });
  assert.deepEqual(playerRuntimeService.log, [
    ['clearManualEngagePending', 'player:1'],
    ['clearCombatTarget', 'player:1', 25],
    ['setCombatTarget', 'player:1', 'monster:near', false, 25],
  ]);
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

function testAutoBattleSkipsSelfBuffSkillWithoutTarget(): void {
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
    buffs: {
      buffs: [],
    },
    actions: {
      actions: [{
        id: 'skill:guard',
        type: 'skill',
        range: 1,
        cooldownLeft: 0,
        autoBattleEnabled: true,
        skillEnabled: true,
      }],
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill:guard',
          name: '护体术',
          cost: 0,
          requiresTarget: false,
          range: 1,
          effects: [{
            type: 'buff',
            target: 'self',
            buffId: 'buff:guard',
            name: '护体',
            duration: 10,
          }],
        }],
      }],
    },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
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
  } as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 15;
    },
    queuePlayerNotice() {},
  } as never);

  assert.equal(command, null);
}

function testAutoBattleCastsMissingSelfBuffSkillWithTarget(): void {
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
    buffs: {
      buffs: [],
    },
    actions: {
      actions: [{
        id: 'skill:guard',
        type: 'skill',
        range: 1,
        cooldownLeft: 0,
        autoBattleEnabled: true,
        skillEnabled: true,
      }],
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill:guard',
          name: '护体术',
          cost: 0,
          requiresTarget: false,
          range: 1,
          effects: [{
            type: 'buff',
            target: 'self',
            buffId: 'buff:guard',
            name: '护体',
            duration: 10,
          }],
        }],
      }],
    },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
      manualEngagePending: false,
    },
  };
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player) as never);
  const command = service.buildAutoCombatCommand(createAdjacentMonsterInstance() as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 15;
    },
    queuePlayerNotice() {},
  } as never);

  assert.deepEqual(command, {
    kind: 'castSkill',
    skillId: 'skill:guard',
    targetPlayerId: null,
    targetMonsterId: null,
    targetRef: null,
    autoCombat: true,
  });
}

function testAutoBattleCastsSelfAnchoredAreaSkillWithTarget(): void {
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
        id: 'skill:self-area',
        type: 'skill',
        range: 0,
        cooldownLeft: 0,
        autoBattleEnabled: true,
        skillEnabled: true,
      }],
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill:self-area',
          name: '原地劫焰',
          cost: 0,
          requiresTarget: false,
          range: 0,
          targeting: { shape: 'box', width: 5, height: 5, maxTargets: 25 },
          effects: [{ type: 'damage', formula: 1 }],
        }],
      }],
    },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
      manualEngagePending: false,
    },
  };
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player) as never);
  const command = service.buildAutoCombatCommand(createAdjacentMonsterInstance() as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 17;
    },
    queuePlayerNotice() {},
  } as never);

  assert.deepEqual(command, {
    kind: 'castSkill',
    skillId: 'skill:self-area',
    targetPlayerId: null,
    targetMonsterId: null,
    targetRef: null,
    autoCombat: true,
  });
}

function testAutoBattleSkipsSelfBuffSkillWhenBuffActive(): void {
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
    buffs: {
      buffs: [{
        buffId: 'buff:guard',
        name: '护体',
        remainingTicks: 5,
        stacks: 1,
      }],
    },
    actions: {
      actions: [{
        id: 'skill:guard',
        type: 'skill',
        range: 4,
        cooldownLeft: 0,
        autoBattleEnabled: true,
        skillEnabled: true,
      }],
    },
    techniques: {
      techniques: [{
        skills: [{
          id: 'skill:guard',
          name: '护体术',
          cost: 0,
          requiresTarget: false,
          range: 4,
          effects: [{
            type: 'buff',
            target: 'self',
            buffId: 'buff:guard',
            name: '护体',
            duration: 10,
          }],
        }],
      }],
    },
    combat: {
      autoBattle: true,
      autoRetaliate: false,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
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
  } as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 16;
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

function testLockedDestroyedTileClearsTarget(): void {
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
    ['clearCombatTarget', 'player:1', 19],
  ]);
  assert.deepEqual(notices, []);
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

function testRetaliatePlayerPreemptsLockedMiningTileWithoutClearingLock(): void {
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
      autoRetaliate: true,
      autoBattleStationary: false,
      combatTargetId: 'tile:2:1',
      combatTargetLocked: true,
      retaliatePlayerTargetId: 'attacker',
      manualEngagePending: false,
    },
  };
  const attacker = {
    playerId: 'attacker',
    hp: 100,
    maxHp: 100,
    x: 2,
    y: 1,
    instanceId: 'public:test_map',
    combat: {},
  };
  const playerRuntimeService = createPlayerRuntimeService(player, [attacker]);
  const service = new WorldRuntimeAutoCombatService(playerRuntimeService as never);
  const command = service.buildAutoCombatCommand({
    meta: {
      instanceId: 'public:test_map',
      supportsPvp: true,
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
  } as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 24;
    },
    queuePlayerNotice() {},
  } as never);

  assert.deepEqual(command, {
    kind: 'basicAttack',
    targetPlayerId: 'attacker',
    targetMonsterId: null,
    targetX: null,
    targetY: null,
    autoCombat: true,
  });
  assert.equal((player.combat as { combatTargetId: string }).combatTargetId, 'tile:2:1');
  assert.equal((player.combat as { combatTargetLocked: boolean }).combatTargetLocked, true);
  assert.deepEqual(playerRuntimeService.log, []);
}

function testRetaliatePlayerDoesNotPreemptLockedPlayerTarget(): void {
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
      autoRetaliate: true,
      autoBattleStationary: false,
      combatTargetId: 'player:duel',
      combatTargetLocked: true,
      retaliatePlayerTargetId: 'attacker',
      allowAoePlayerHit: true,
      manualEngagePending: false,
    },
  };
  const duelTarget = {
    playerId: 'duel',
    hp: 100,
    maxHp: 100,
    x: 2,
    y: 1,
    instanceId: 'public:test_map',
    combat: {},
  };
  const attacker = {
    playerId: 'attacker',
    hp: 100,
    maxHp: 100,
    x: 1,
    y: 2,
    instanceId: 'public:test_map',
    combat: {},
  };
  const service = new WorldRuntimeAutoCombatService(createPlayerRuntimeService(player, [duelTarget, attacker]) as never);
  const command = service.buildAutoCombatCommand({
    meta: {
      instanceId: 'public:test_map',
      supportsPvp: true,
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
  } as never, player as never, {
    resolveCurrentTickForPlayerId() {
      return 25;
    },
    queuePlayerNotice() {},
  } as never);

  assert.deepEqual(command, {
    kind: 'basicAttack',
    targetPlayerId: 'duel',
    targetMonsterId: null,
    targetX: null,
    targetY: null,
    autoCombat: true,
  });
}

function testLockedDepletedHerbTileClearsTarget(): void {
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
testInRangeButBlockedLineOfSightMovesToCastPosition();
testUnreachableCurrentTargetIsPenalizedAndRetargetedImmediately();
testStationaryOutOfRangeSkillSkipsWithoutMove();
testAutoBattleSkipsSelfBuffSkillWithoutTarget();
testAutoBattleCastsMissingSelfBuffSkillWithTarget();
testAutoBattleCastsSelfAnchoredAreaSkillWithTarget();
testAutoBattleSkipsSelfBuffSkillWhenBuffActive();
testStopDistancePathDoesNotGenerateRangeCandidateGrid();
testLockedDestroyedTileClearsTarget();
testLockedHerbTileContinuesBasicAttack();
testRetaliatePlayerPreemptsLockedMiningTileWithoutClearingLock();
testRetaliatePlayerDoesNotPreemptLockedPlayerTarget();
testLockedDepletedHerbTileClearsTarget();
testLockedFormationContinuesBasicAttack();
testAutoUsePillTriggersBeforeAutoCombatCommandMaterialization();
testAutoUsePillSkipsEmptyConditions();
testAutoUsePillSkipsWhenManualCommandIsPending();
testAutoUseBuffPillTriggersOnlyWhenBuffMissing();
testMaterializeAutoCombatClearsExpiredRetaliatorBeforeEarlyExit();

console.log(JSON.stringify({
  ok: true,
  case: 'world-runtime-auto-combat',
  answers: '自动战斗不会在本 tick 行动次数已满时继续物化必然失败的攻击指令；一次性接战和自动战斗会按第一个当前可用技能决定停止距离，目标已在射程内但视线被遮挡时会继续寻找可释放站位；当前锁定目标不可达时只对该目标做一次 80% 仇恨降权、清理当前目标并立即重选；普通自动战斗每 tick 按实时仇恨重算目标，只有明确锁定或一次性接战才优先沿用 tracked target；原地战斗会按 AOE 覆盖半径作为停止距离；无需目标的自身 buff 技能只有在存在有效自动战斗目标且缺少对应 buff 时才会按自动技能顺序原地施放，已有 buff 时不会重复刷也不会把 buff 技能当成追击距离；锁定目标失效后只清理当前目标锁，不关闭自动战斗、不发丢失提示；锁定草药、挖矿和阵法会在未清空或未摧毁前继续生成下一次攻击；自动反击会临时抢占非玩家锁定目标并保留原锁定，明确锁定玩家时不擅自切目标，且仇敌 30 分钟未续攻会在 tick 内过期；自动丹药会按资源阈值或缺 Buff 条件在 tick 受控流程内使用，空条件不触发，已有 pending command 时不改动背包槽位。',
}, null, 2));
