import assert from 'node:assert/strict';

import { WorldSyncMapSnapshotService } from '../network/world-sync-map-snapshot.service';

interface StaticTileDiffInstance {
  getStaticTileSyncRevision(): number;
  consumeStaticTileSyncDirtyTiles(): { fromRevision: number; toRevision: number; tileKeys: string[] };
}

function createService(instance: StaticTileDiffInstance) {
  return new WorldSyncMapSnapshotService(
    {
      getInstanceRuntime(instanceId: string) {
        return instanceId === 'inst.a' ? instance : null;
      },
      getInstanceTileState() {
        return null;
      },
    },
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

testInstanceDirtyPlanIsConsumedOnceAndReused();
testParentOverlayFallsBackToPlayerStaticDiff();

console.log(JSON.stringify({ ok: true, case: 'world-sync-map-snapshot-instance-diff' }, null, 2));
