import assert from 'node:assert/strict';

import { Direction } from '@mud/shared';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { WorldRuntimeNavigationService } from '../runtime/world/world-runtime-navigation.service';

function createTemplate() {
  return {
    id: 'artifact_movement_smoke',
    name: '法宝移动 Smoke',
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
    instanceId: 'instance:artifact-movement-smoke',
    template: createTemplate(),
    monsterSpawns: [],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: '法宝移动 Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: false,
  });
}

function equipFlyingSword(player: any, overrides: Partial<Record<'enabled' | 'qi', unknown>> = {}): void {
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

function testMoveToPlansIntoUnwalkableTileWithFlyingSword(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:artifact-path',
    sessionId: 'session:artifact-path',
    preferredX: 0,
    preferredY: 0,
  });
  equipFlyingSword(player);
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

function testDisabledFlyingSwordDoesNotPlanIntoUnwalkableTile(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:artifact-disabled',
    sessionId: 'session:artifact-disabled',
    preferredX: 0,
    preferredY: 0,
  });
  equipFlyingSword(player, { enabled: false });
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

function testFlyingSwordConsumesQiOnUnwalkableMove(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:artifact-move',
    sessionId: 'session:artifact-move',
    preferredX: 0,
    preferredY: 0,
  });
  equipFlyingSword(player);
  player.movePoints = 400;
  player.lastMoveBudgetTick = instance.tick;

  assert.equal(instance.enqueueMove({
    playerId: player.playerId,
    direction: Direction.East,
    continuous: true,
    resetBudget: false,
  }), true);
  instance.tickOnce();

  assert.deepEqual(instance.getPlayerPosition(player.playerId), { x: 1, y: 0 });
  assert.equal(player.artifacts.slots[0].qi, 90);
}

function testDynamicBlockerStillBlocksFlyingSword(): void {
  const instance = createInstance();
  const player = instance.connectPlayer({
    playerId: 'player:artifact-dynamic-block',
    sessionId: 'session:artifact-dynamic-block',
    preferredX: 0,
    preferredY: 0,
  });
  equipFlyingSword(player);
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
  testMoveToPlansIntoUnwalkableTileWithFlyingSword();
  testDisabledFlyingSwordDoesNotPlanIntoUnwalkableTile();
  testFlyingSwordConsumesQiOnUnwalkableMove();
  testDynamicBlockerStillBlocksFlyingSword();
  console.log('world-runtime-artifact-movement-smoke ok');
}

main();
