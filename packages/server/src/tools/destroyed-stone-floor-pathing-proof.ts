/**
 * 验证已摧毁石块上铺设地板后，旧结构不会复活，通行、寻路缓存与重启回读保持一致。
 */
import assert from 'node:assert/strict';

import type { PathfindingBatchTaskInput, PathfindingBatchTaskResult } from '@mud/shared';
import { SurfaceType, TileType } from '@mud/shared';

import { getDefaultBuildingRuntime } from '../runtime/building/building-default-content';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { AsyncPathfindingService } from '../runtime/world/async-pathfinding.service';

const MARKER = 'REPAIR_PROOF:ISSUE-000017:PASS';
const INSTANCE_ID = 'real:repair-proof-destroyed-stone-floor';
const STONE_X = 3;

function createInstance(): MapInstanceRuntime {
  const repository = new MapTemplateRepository();
  repository.registerRuntimeMapTemplate({
    id: 'repair-proof-destroyed-stone-floor',
    name: '摧毁石块铺地板验证',
    width: 7,
    height: 1,
    routeDomain: 'system',
    tiles: ['...o...'],
    spawnPoint: { x: 0, y: 0 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });
  const instance = new MapInstanceRuntime({
    instanceId: INSTANCE_ID,
    template: repository.getOrThrow('repair-proof-destroyed-stone-floor'),
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '摧毁石块铺地板验证',
    linePreset: 'real',
    lineIndex: 1,
    instanceOrigin: 'repair-proof',
    defaultEntry: true,
    canDamageTile: true,
  });
  const { catalog, rules } = getDefaultBuildingRuntime();
  instance.configureBuildingRuntime(catalog, rules);
  return instance;
}

function createPathfindingService(): AsyncPathfindingService {
  let taskSequence = 0;
  const pool = {
    async submit(
      _kind: string,
      payload: PathfindingBatchTaskInput,
      fallback: (input: PathfindingBatchTaskInput) => PathfindingBatchTaskResult,
    ) {
      taskSequence += 1;
      return {
        taskId: `repair-proof:path:${taskSequence}`,
        ok: true,
        result: fallback(payload),
        durationMs: 0,
      };
    },
  };
  return new AsyncPathfindingService(pool as never);
}

async function findStraightPath(service: AsyncPathfindingService, instance: MapInstanceRuntime) {
  return service.findPathAsync(
    instance,
    new Uint8Array(instance.template.width * instance.template.height),
    0,
    0,
    [{ x: 6, y: 0 }],
  );
}

async function main(): Promise<void> {
  const instance = createInstance();
  const pathfinding = createPathfindingService();
  const stoneCell = instance.toTileIndex(STONE_X, 0);
  const originalIsCellIndexWalkable = instance.isCellIndexWalkable.bind(instance);
  let staticGridReads = 0;
  instance.isCellIndexWalkable = (cellIndex: number) => {
    staticGridReads += 1;
    return originalIsCellIndexWalkable(cellIndex);
  };

  assert.equal((await findStraightPath(pathfinding, instance)).status, 'failed', '石块未摧毁时必须阻断单行路径');
  const readsBeforeDamage = staticGridReads;
  const revisionBeforeDamage = instance.getStaticPathingRevision();

  assert.equal(instance.damageTile(STONE_X, 0, Number.MAX_SAFE_INTEGER).destroyed, true);
  assert.equal(instance.getTileLayerState(STONE_X, 0)?.structure, null, '摧毁投影必须隐藏旧石块结构');
  assert.ok(instance.getStaticPathingRevision() > revisionBeforeDamage, '摧毁必须推进静态寻路 revision');
  assert.equal((await findStraightPath(pathfinding, instance)).status, 'success', '石块摧毁后直行路径应恢复');
  assert.ok(staticGridReads > readsBeforeDamage, '摧毁后必须重建 Worker 静态网格');

  const placement = instance.placeBuildingInstance({
    buildingId: 'repair-proof:plain-floor',
    defId: 'plain_floor',
    x: STONE_X,
    y: 0,
    state: 'building',
    buildStrength: 1,
    buildRemainingTicks: 1,
    ownerPlayerId: 'repair-proof:builder',
  });
  assert.equal(placement.ok, true, '已摧毁石块格应允许铺设地板');

  const revisionBeforeCompletion = instance.getStaticPathingRevision();
  const readsBeforeCompletion = staticGridReads;
  placement.building.state = 'active';
  placement.building.activeBuilderPlayerId = null;
  placement.building.buildRemainingTicks = 0;
  const completionDomains = instance.activatePlacedBuildingTopologyAndVisual(placement.building);
  assert.ok(completionDomains.includes('tile_damage'), '技艺 job 完工接管必须把旧损坏域纳入刷盘');
  assert.equal(instance.tileDamageByTile.has(stoneCell), false, '地板接管后应清除旧损坏记录');
  assert.equal(instance.tilePlane.getStructure(stoneCell), null, '删除损坏记录不得让旧石块结构复活');
  assert.equal(instance.tilePlane.getSurface(stoneCell), SurfaceType.Floor);
  assert.equal(instance.getEffectiveTileType(STONE_X, 0), TileType.Floor);
  assert.equal(instance.isWalkable(STONE_X, 0), true, '铺设完成的地板必须权威可通行');
  assert.ok(instance.getStaticPathingRevision() > revisionBeforeCompletion, '地板完工必须再次失效静态寻路缓存');
  assert.equal((await findStraightPath(pathfinding, instance)).status, 'success');
  assert.ok(staticGridReads > readsBeforeCompletion, '地板完工后 Worker 不得复用旧 revision 网格');

  const runtimeTiles = instance.buildRuntimeTilePersistenceEntries();
  const tileDamage = instance.buildTileDamagePersistenceEntries();
  const buildingState = instance.buildBuildingRoomFengShuiPersistenceState();
  assert.equal(tileDamage.length, 0, '刷盘载荷不得遗留已被地板接管的损坏行');
  assert.equal(runtimeTiles.find((entry) => entry.x === STONE_X && entry.y === 0)?.structureType, null);

  const restored = createInstance();
  restored.hydrateRuntimeTiles(runtimeTiles);
  restored.hydrateTileDamage(tileDamage);
  restored.hydrateBuildingRoomFengShuiState(buildingState);
  assert.equal(restored.tilePlane.getStructure(restored.toTileIndex(STONE_X, 0)), null, '重启回读不得恢复模板旧石块');
  assert.equal(restored.isWalkable(STONE_X, 0), true, '重启回读后地板必须仍可通行');
  assert.equal((await findStraightPath(pathfinding, restored)).status, 'success', '同 ID 新实例不得复用重启前静态网格');

  console.log(MARKER);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
