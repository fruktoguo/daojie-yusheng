import assert from 'node:assert/strict';

import { TileType } from '@mud/shared';

import { WorldSyncMapSnapshotService } from '../network/world-sync-map-snapshot.service';

interface StaticTileDiffInstance {
  getStaticTileSyncRevision(): number;
  consumeStaticTileSyncDirtyTiles(): { fromRevision: number; toRevision: number; tileKeys: string[] };
}

function createService(instance: StaticTileDiffInstance) {
  return createServiceWithRuntime({
    getInstanceRuntime(instanceId: string) {
      return instanceId === 'inst.a' ? instance : null;
    },
    getInstanceTileState() {
      return null;
    },
  });
}

function createServiceWithRuntime(worldRuntimeService: Record<string, unknown>) {
  return new WorldSyncMapSnapshotService(
    worldRuntimeService,
    {},
    {
      has() {
        return false;
      },
      getOrThrow() {
        return null;
      },
    },
    {
      getMapTimeConfig() {
        return null;
      },
      getMapTickSpeed() {
        return 1;
      },
    },
    {},
  );
}

function createView(instanceId = 'inst.a') {
  return {
    instance: {
      instanceId,
      templateId: 'map.a',
    },
    worldRevision: 19,
  };
}

function testInstanceDirtyPlanIsConsumedOnceAndReused() {
  let consumeCount = 0;
  const instance = {
    getStaticTileSyncRevision() {
      return 3;
    },
    consumeStaticTileSyncDirtyTiles() {
      consumeCount += 1;
      return {
        fromRevision: 1,
        toRevision: 3,
        tileKeys: ['2,3', '4,5'],
      };
    },
  };
  const service = createService(instance);

  const first = service.buildInstanceStaticTileDiffPlan(createView(), { id: 'map.a' });
  const second = service.buildInstanceStaticTileDiffPlan(createView(), { id: 'map.a' });

  assert.equal(consumeCount, 1);
  assert.equal(first, second);
  assert.deepEqual(first, {
    fromRevision: 1,
    toRevision: 3,
    dirtyTileKeys: ['2,3', '4,5'],
  });
}

function testParentOverlayFallsBackToPlayerStaticDiff() {
  let consumeCount = 0;
  const instance = {
    getStaticTileSyncRevision() {
      return 1;
    },
    consumeStaticTileSyncDirtyTiles() {
      consumeCount += 1;
      return { fromRevision: 0, toRevision: 1, tileKeys: ['1,1'] };
    },
  };
  const service = createService(instance);

  const plan = service.buildInstanceStaticTileDiffPlan(createView(), {
    id: 'map.a',
    source: { spaceVisionMode: 'parent_overlay' },
  });

  assert.equal(plan, null);
  assert.equal(consumeCount, 0);
}

function testTileProjectionOmitsDefaultBlockingFields() {
  const states = new Map<string, unknown>([
    ['1,1', {
      tileType: TileType.Floor,
      walkable: true,
      blocksSight: false,
      aura: 0,
      combat: null,
    }],
    ['2,1', {
      tileType: TileType.Wall,
      walkable: false,
      blocksSight: true,
      aura: 0,
      combat: { destroyed: true },
    }],
  ]);
  const service = createServiceWithRuntime({
    getInstanceRuntime() {
      return null;
    },
    getInstanceTileState(_instanceId: string, x: number, y: number) {
      return states.get(`${x},${y}`) ?? null;
    },
  });
  const template = { id: 'map.a', width: 4, height: 4 };

  const floor = service.buildTileSyncState(template, 'inst.a', 1, 1);
  const destroyedWall = service.buildTileSyncState(template, 'inst.a', 2, 1);

  assert.equal(floor.type, TileType.Floor);
  assert.equal(Object.prototype.hasOwnProperty.call(floor, 'walkable'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(floor, 'blocksSight'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(floor, 'terrainType'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(floor, 'surfaceType'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(floor, 'structureType'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(floor, 'interactableKinds'), false);
  assert.equal(destroyedWall.type, TileType.Wall);
  assert.equal(destroyedWall.walkable, true);
  assert.equal(destroyedWall.blocksSight, false);
  assert.equal(destroyedWall.structureType, null);
}

testInstanceDirtyPlanIsConsumedOnceAndReused();
testParentOverlayFallsBackToPlayerStaticDiff();
testTileProjectionOmitsDefaultBlockingFields();

console.log(JSON.stringify({ ok: true, case: 'world-sync-map-snapshot-instance-diff' }, null, 2));
