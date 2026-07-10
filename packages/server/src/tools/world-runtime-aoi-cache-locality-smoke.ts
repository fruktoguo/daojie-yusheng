import assert from 'node:assert/strict';

import { Direction } from '@mud/shared';

import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';

function createTemplate() {
  const width = 64;
  const height = 3;
  const cellCount = width * height;
  return {
    id: 'aoi-cache-locality-map',
    name: 'AOI 局部缓存 Smoke',
    width,
    height,
    terrainRows: Array.from({ length: height }, () => '.'.repeat(width)),
    walkableMask: Uint8Array.from({ length: cellCount }, () => 1),
    blocksSightMask: Uint8Array.from({ length: cellCount }, () => 0),
    baseAuraByTile: Int32Array.from({ length: cellCount }, () => 0),
    baseTileResourceEntries: [],
    npcs: [],
    landmarks: [],
    containers: [],
    safeZones: [],
    portals: [],
    spawnX: 1,
    spawnY: 1,
    source: {},
  };
}

function createInstance(): MapInstanceRuntime {
  return new MapInstanceRuntime({
    instanceId: 'instance:aoi-cache-locality',
    template: createTemplate(),
    monsterSpawns: [],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: 'AOI 局部缓存 Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: true,
  });
}

function verifyRemoteChangesDoNotRebuildObserverView(): void {
  const instance = createInstance();
  instance.connectPlayer({ playerId: 'player:observer', sessionId: 'session:observer', preferredX: 2, preferredY: 1 });
  instance.connectPlayer({ playerId: 'player:near', sessionId: 'session:near', preferredX: 4, preferredY: 1 });
  instance.connectPlayer({ playerId: 'player:far', sessionId: 'session:far', preferredX: 50, preferredY: 1 });

  const initial = instance.buildPlayerView('player:observer', 10);
  assert.ok(initial);
  assert.equal(initial?.visiblePlayers.some((entry) => entry.playerId === 'player:near'), true);
  assert.equal(initial?.visiblePlayers.some((entry) => entry.playerId === 'player:far'), false);

  instance.relocatePlayer('player:far', 51, 1);
  const afterFarMove = instance.buildPlayerView('player:observer', 10);
  assert.equal(afterFarMove, initial, '远处玩家移动不应重建观察者 AOI 快照');
  assert.equal(afterFarMove?.worldRevision, instance.worldRevision, '缓存命中仍应刷新协议 worldRevision');

  instance.relocatePlayer('player:near', 5, 1);
  const afterNearMove = instance.buildPlayerView('player:observer', 10);
  assert.notEqual(afterNearMove, afterFarMove, '视野内玩家移动必须重建 AOI 快照');
  assert.equal(afterNearMove?.visiblePlayers.find((entry) => entry.playerId === 'player:near')?.x, 5);
}

function verifyStaticDirtyUsesLocalChunks(): void {
  const instance = createInstance();
  const observer = instance.connectPlayer({
    playerId: 'player:observer',
    sessionId: 'session:observer',
    preferredX: 2,
    preferredY: 1,
  });
  assert.equal(observer.facing, Direction.East);
  const initial = instance.buildPlayerView('player:observer', 10);
  const initialPathingRevision = instance.getStaticPathingRevision();

  instance.markStaticTileSyncDirtyByIndex(instance.toTileIndex(40, 1));
  instance.markStaticTileSyncDirtyByIndex(instance.toTileIndex(45, 1), { sightBlockingChanged: true });
  assert.equal(
    instance.getStaticPathingRevision(),
    initialPathingRevision,
    '纯展示或 LOS 变化不得污染静态寻路 revision',
  );

  const farIndex = instance.toTileIndex(50, 1);
  instance.markStaticTileSyncDirtyByIndex(farIndex, { sightBlockingChanged: true, pathingChanged: true });
  assert.equal(instance.getStaticPathingRevision(), initialPathingRevision + 1);
  instance.worldRevision += 1;
  const afterFarStaticChange = instance.buildPlayerView('player:observer', 10);
  assert.equal(afterFarStaticChange, initial, '远处静态地块变化不应重建本地 AOI');

  const nearIndex = instance.toTileIndex(6, 1);
  instance.markStaticTileSyncDirtyByIndex(nearIndex, { sightBlockingChanged: true, pathingChanged: true });
  instance.worldRevision += 1;
  const afterNearStaticChange = instance.buildPlayerView('player:observer', 10);
  assert.notEqual(afterNearStaticChange, afterFarStaticChange, '视野内静态地块变化必须重建 AOI');
}

verifyRemoteChangesDoNotRebuildObserverView();
verifyStaticDirtyUsesLocalChunks();
console.log(JSON.stringify({ ok: true, case: 'world-runtime-aoi-cache-locality' }));
