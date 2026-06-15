import assert from 'node:assert/strict';

import { Direction } from '@mud/shared';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { advancePlayerArtifactQiTick } from '../runtime/player/player-artifact-runtime.helpers';
import { WorldRuntimeNavigationService } from '../runtime/world/world-runtime-navigation.service';

function createTemplate() {
  return {
    id: 'player_movement_capability_smoke',
    name: '玩家移动能力 Smoke',
    width: 3,
    height: 1,
    terrainRows: ['.#.'],
    walkableMask: Uint8Array.from([1, 0, 1]),
    blocksSightMask: Uint8Array.from([0, 1, 0]),
    portalIndexByTile: Int32Array.from({ length: 3 }, () => -1),
    safeZoneMask: Uint8Array.from({ length: 3 }, () => 0),
    baseAuraByTile: Int32Array.from({ length: 3 }, () => 0),
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

function createInstance() {
  return new MapInstanceRuntime({
    instanceId: 'instance:player-movement-capability-smoke',
    template: createTemplate(),
    monsterSpawns: [],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: '玩家移动能力 Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: false,
  });
}

function grantStaticObstacleIgnoreFromFlyingSword(player: any, overrides: Partial<Record<'enabled' | 'qi', unknown>> = {}): void {
  player.artifacts = {
    revision: 1,
    slots: [{
      slot: 'artifact_1',
      unlocked: true,
      enabled: overrides.enabled === undefined ? true : overrides.enabled === true,
      qi: Number.isFinite(Number(overrides.qi)) ? Number(overrides.qi) : 100,
      maxQi: 100,
      item: {
        itemId: 'artifact.flying_sword',
        itemInstanceId: 'artifact:flying-sword:smoke',
        count: 1,
        type: 'artifact',
        name: '巡天飞剑',
        artifactMaxQiFactor: 1,
        artifactEffects: [{ type: 'traverse_unwalkable', costMaxQiRatio: 0.1 }],
      },
    }],
  };
}

function createNavigationService(instance: MapInstanceRuntime, player: any) {
  return new WorldRuntimeNavigationService(
    { getOrThrow: () => instance.template },
    {
      getPlayer(playerId: string) {
        assert.equal(playerId, player.playerId);
        return player;
      },
      getPlayerOrThrow(playerId: string) {
        assert.equal(playerId, player.playerId);
        return player;
      },
    },
  );
}

function createNavigationDeps(instance: MapInstanceRuntime) {
  return {
    getPlayerLocationOrThrow(playerId: string) {
      return { playerId, instanceId: instance.meta.instanceId };
    },
    getInstanceRuntimeOrThrow(instanceId: string) {
      assert.equal(instanceId, instance.meta.instanceId);
      return instance;
    },
    resolveCurrentTickForPlayerId() {
      return instance.tick;
    },
  };
}

function testPlayerCapabilityPlansIntoStaticObstacleTile(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:capability-path',
    sessionId: 'session:capability-path',
    preferredX: 0,
    preferredY: 0,
  });
  player.movementCapabilities = { staticObstacleIgnore: true };
  const service = createNavigationService(instance, player);

  const step = service.resolveNavigationStep(
    player.playerId,
    { kind: 'point', mapId: instance.template.id, x: 1, y: 0, allowNearestReachable: false, clientPathHint: null },
    createNavigationDeps(instance),
  );

  assert.equal(step.kind, 'move');
  assert.equal(step.direction, Direction.East);
  assert.deepEqual(step.path, [{ x: 1, y: 0 }]);
}

function testMissingPlayerCapabilityDoesNotPlanIntoStaticObstacleTile(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:capability-missing',
    sessionId: 'session:capability-missing',
    preferredX: 0,
    preferredY: 0,
  });
  const service = createNavigationService(instance, player);

  assert.throws(
    () => service.resolveNavigationStep(
      player.playerId,
      { kind: 'point', mapId: instance.template.id, x: 1, y: 0, allowNearestReachable: false, clientPathHint: null },
      createNavigationDeps(instance),
    ),
    /无法到达该位置/u,
  );
}

function testDisabledFlyingSwordProviderDoesNotGrantPlayerCapability(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:provider-disabled',
    sessionId: 'session:provider-disabled',
    preferredX: 0,
    preferredY: 0,
  });
  grantStaticObstacleIgnoreFromFlyingSword(player, { enabled: false });
  const service = createNavigationService(instance, player);

  assert.throws(
    () => service.resolveNavigationStep(
      player.playerId,
      { kind: 'point', mapId: instance.template.id, x: 1, y: 0, allowNearestReachable: false, clientPathHint: null },
      createNavigationDeps(instance),
    ),
    /无法到达该位置/u,
  );
}

function testPlayerCapabilityIgnoresStaticObstacleOnMove(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:capability-move',
    sessionId: 'session:capability-move',
    preferredX: 0,
    preferredY: 0,
  });
  player.movementCapabilities = { staticObstacleIgnore: true };
  player.movePoints = 100;
  player.lastMoveBudgetTick = instance.tick;

  assert.equal(instance.enqueueMove({
    playerId: player.playerId,
    direction: Direction.East,
    continuous: true,
    resetBudget: false,
  }), true);
  instance.tickOnce();

  assert.deepEqual(instance.getPlayerPosition(player.playerId), { x: 1, y: 0 });
  assert.equal(player.movePoints, 0);
}

function testFlyingSwordProviderDoesNotConsumeQiOnMove(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:provider-move',
    sessionId: 'session:provider-move',
    preferredX: 0,
    preferredY: 0,
  });
  grantStaticObstacleIgnoreFromFlyingSword(player);
  player.movePoints = 100;
  player.lastMoveBudgetTick = instance.tick;

  assert.equal(instance.enqueueMove({
    playerId: player.playerId,
    direction: Direction.East,
    continuous: true,
    resetBudget: false,
  }), true);
  instance.tickOnce();

  assert.deepEqual(instance.getPlayerPosition(player.playerId), { x: 1, y: 0 });
  assert.equal(player.artifacts.slots[0].qi, 100);
  assert.equal(player.movePoints, 0);
}

function testFlyingSwordProviderGrantsCapabilityEvenWhenArtifactQiIsEmpty(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:provider-empty-qi',
    sessionId: 'session:provider-empty-qi',
    preferredX: 0,
    preferredY: 0,
  });
  grantStaticObstacleIgnoreFromFlyingSword(player, { qi: 0 });
  const service = createNavigationService(instance, player);

  const step = service.resolveNavigationStep(
    player.playerId,
    { kind: 'point', mapId: instance.template.id, x: 1, y: 0, allowNearestReachable: false, clientPathHint: null },
    createNavigationDeps(instance),
  );

  assert.equal(step.kind, 'move');
  assert.equal(step.direction, Direction.East);
  assert.deepEqual(step.path, [{ x: 1, y: 0 }]);
}

function testFlyingSwordProviderMovesWhenArtifactQiIsEmpty(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:provider-empty-qi-move',
    sessionId: 'session:provider-empty-qi-move',
    preferredX: 0,
    preferredY: 0,
  });
  grantStaticObstacleIgnoreFromFlyingSword(player, { qi: 0 });
  player.movePoints = 100;
  player.lastMoveBudgetTick = instance.tick;

  assert.equal(instance.enqueueMove({
    playerId: player.playerId,
    direction: Direction.East,
    continuous: true,
    resetBudget: false,
  }), true);
  instance.tickOnce();

  assert.deepEqual(instance.getPlayerPosition(player.playerId), { x: 1, y: 0 });
  assert.equal(player.artifacts.slots[0].qi, 0);
  assert.equal(player.movePoints, 0);
}

function testEnabledFlyingSwordConsumesArtifactQiEveryTick(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:provider-sustain',
    sessionId: 'session:provider-sustain',
    preferredX: 0,
    preferredY: 0,
  });
  grantStaticObstacleIgnoreFromFlyingSword(player, { qi: 50 });
  player.qi = 100;
  player.attrs = {
    ...(player.attrs ?? {}),
    numericStats: {
      ...(player.attrs?.numericStats ?? {}),
      maxQiOutputPerTick: 0,
    },
  };

  const result = advancePlayerArtifactQiTick(player);

  assert.equal(result.artifactChanged, true);
  assert.equal(result.vitalsChanged, false);
  assert.equal(player.artifacts.slots[0].qi, 40);
  assert.equal(player.qi, 100);
}

function testEnabledFlyingSwordRechargesFromPlayerQiOutputEveryTick(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:provider-recharge',
    sessionId: 'session:provider-recharge',
    preferredX: 0,
    preferredY: 0,
  });
  grantStaticObstacleIgnoreFromFlyingSword(player, { qi: 50 });
  player.qi = 100;
  player.attrs = {
    ...(player.attrs ?? {}),
    numericStats: {
      ...(player.attrs?.numericStats ?? {}),
      maxQiOutputPerTick: 100,
    },
  };

  const result = advancePlayerArtifactQiTick(player);

  assert.equal(result.artifactChanged, false);
  assert.equal(result.vitalsChanged, true);
  assert.equal(player.artifacts.slots[0].qi, 50);
  assert.equal(player.qi, 90);
}

function testDynamicBlockerStillBlocksPlayerCapability(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:capability-dynamic-block',
    sessionId: 'session:capability-dynamic-block',
    preferredX: 0,
    preferredY: 0,
  });
  player.movementCapabilities = { staticObstacleIgnore: true };
  instance.setDynamicTileBlocker((x: number, y: number) => x === 1 && y === 0);
  const service = createNavigationService(instance, player);

  assert.throws(
    () => service.resolveNavigationStep(
      player.playerId,
      { kind: 'point', mapId: instance.template.id, x: 1, y: 0, allowNearestReachable: false, clientPathHint: null },
      createNavigationDeps(instance),
    ),
    /无法到达该位置/u,
  );
}

function main(): void {
  testPlayerCapabilityPlansIntoStaticObstacleTile();
  testMissingPlayerCapabilityDoesNotPlanIntoStaticObstacleTile();
  testDisabledFlyingSwordProviderDoesNotGrantPlayerCapability();
  testPlayerCapabilityIgnoresStaticObstacleOnMove();
  testFlyingSwordProviderDoesNotConsumeQiOnMove();
  testFlyingSwordProviderGrantsCapabilityEvenWhenArtifactQiIsEmpty();
  testFlyingSwordProviderMovesWhenArtifactQiIsEmpty();
  testEnabledFlyingSwordConsumesArtifactQiEveryTick();
  testEnabledFlyingSwordRechargesFromPlayerQiOutputEveryTick();
  testDynamicBlockerStillBlocksPlayerCapability();
  console.log('world-runtime-player-movement-capability-smoke ok');
}

main();
