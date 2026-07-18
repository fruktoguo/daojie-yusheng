/**
 * 验证完工视觉建筑未投影为实体时，拆除请求仍能通过可见格坐标命中权威建筑。
 */
import assert from 'node:assert/strict';

import { TileType } from '@mud/shared';

import { getDefaultBuildingRuntime } from '../runtime/building/building-default-content';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { handleBuildDeconstructIntent } from '../runtime/world/world-runtime-building.service';

const MARKER = 'REPAIR_PROOF:ISSUE-000007:PASS';

async function main(): Promise<void> {
  const playerId = 'repair-proof:building-owner';
  const nearBuildingId = 'repair-proof:stone-wall:near';
  const farBuildingId = 'repair-proof:stone-wall:far';
  const hiddenBuildingId = 'repair-proof:stone-wall:hidden';
  const templateRepository = new MapTemplateRepository();
  templateRepository.registerRuntimeMapTemplate({
    id: 'repair-proof-building-deconstruct',
    name: '拆除坐标解析验证',
    width: 7,
    height: 5,
    routeDomain: 'system',
    tiles: Array.from({ length: 5 }, () => '.......'),
    spawnPoint: { x: 6, y: 4 },
    portals: [],
    npcs: [],
    monsters: [],
    safeZones: [],
    landmarks: [],
    containers: [],
    auras: [],
  });

  const instance = new MapInstanceRuntime({
    instanceId: 'real:repair-proof-building-deconstruct',
    template: templateRepository.getOrThrow('repair-proof-building-deconstruct'),
    monsterSpawns: [],
    kind: 'public',
    persistent: true,
    createdAt: Date.now(),
    displayName: '拆除坐标解析验证',
    linePreset: 'real',
    lineIndex: 1,
    instanceOrigin: 'repair-proof',
    defaultEntry: true,
    canDamageTile: true,
  });
  const { catalog, rules } = getDefaultBuildingRuntime();
  instance.configureBuildingRuntime(catalog, rules);

  function placeWall(buildingId: string, x: number, y: number): void {
    const placement = instance.placeBuildingInstance({
      buildingId,
      defId: 'stone_wall',
      x,
      y,
      ownerPlayerId: playerId,
      state: 'active',
    });
    assert.equal(placement.ok, true, `${buildingId} 应能通过生产放置链进入权威运行态`);
  }

  placeWall(nearBuildingId, 1, 2);
  placeWall(farBuildingId, 4, 0);
  placeWall(hiddenBuildingId, 2, 3);
  assert.equal(
    instance.collectLocalBuildings(1, 2, 3).some((entry) => entry.id === nearBuildingId),
    false,
    '完工视觉建筑应继续由 tile 层渲染，不能为修复拆除命中而重复投影实体',
  );

  const domainPlayer = {
    playerId,
    x: 0,
    y: 2,
    attrs: { numericStats: { viewRange: 2 } },
  };
  instance.playersById.set(playerId, { playerId, x: 0, y: 2, selfRevision: 1 });
  let visibleTileIndices = new Set<number>();
  const runtime = {
    tick: 1,
    buildingOperationResultsByKey: new Map<string, unknown>(),
    buildingOperationAuditLog: [] as unknown[],
    getPlayerLocationOrThrow: () => ({ instanceId: instance.meta.instanceId, x: domainPlayer.x, y: domainPlayer.y }),
    getInstanceRuntimeOrThrow: () => instance,
    getPlayerView: () => ({
      visibleTileIndices: Array.from(visibleTileIndices),
      visibleTileKeys: [],
    }),
    playerRuntimeService: {
      getPlayer: (requestedPlayerId: string) => requestedPlayerId === playerId ? domainPlayer : null,
      getViewRadius: (requestedPlayerId: string) => requestedPlayerId === playerId ? 2 : 1,
    },
  };

  visibleTileIndices = new Set([instance.toTileIndex(4, 0)]);
  const farResult = await handleBuildDeconstructIntent(runtime, playerId, {
    requestId: 'repair-proof:deconstruct:far',
    buildingId: farBuildingId,
    x: 4,
    y: 0,
  });
  assert.equal(farResult.ok, false, '即使客户端声称远端占格可见，服务端仍必须拒绝超范围拆除');
  assert.equal(farResult.reason, 'building_out_of_range');
  assert.equal(instance.buildingById.has(farBuildingId), true, '远距离拒绝不得改变建筑权威状态');

  visibleTileIndices = new Set([instance.toTileIndex(0, 2)]);
  const hiddenResult = await handleBuildDeconstructIntent(runtime, playerId, {
    requestId: 'repair-proof:deconstruct:hidden',
    buildingId: hiddenBuildingId,
    x: 2,
    y: 3,
  });
  assert.equal(hiddenResult.ok, false, '范围内但不在权威 AOI 的建筑必须拒绝拆除');
  assert.equal(hiddenResult.reason, 'building_not_visible');
  assert.equal(instance.buildingById.has(hiddenBuildingId), true, '不可见拒绝不得改变建筑权威状态');

  visibleTileIndices = new Set([
    instance.toTileIndex(1, 2),
    instance.toTileIndex(2, 3),
  ]);
  const mismatchResult = await handleBuildDeconstructIntent(runtime, playerId, {
    requestId: 'repair-proof:deconstruct:mismatch',
    buildingId: nearBuildingId,
    x: 2,
    y: 3,
  });
  assert.equal(mismatchResult.ok, false, 'ID 与坐标指向不同建筑时必须拒绝，不能误拆 ID 建筑');
  assert.equal(mismatchResult.reason, 'building_target_mismatch');
  assert.equal(instance.buildingById.has(nearBuildingId), true);
  assert.equal(instance.buildingById.has(hiddenBuildingId), true);

  const staleResult = await handleBuildDeconstructIntent(runtime, playerId, {
    requestId: 'repair-proof:deconstruct:stale',
    buildingId: 'repair-proof:stone-wall:missing',
    x: 2,
    y: 3,
  });
  assert.equal(staleResult.ok, false, '陈旧 ID 不能退化为按同格坐标拆除其它建筑');
  assert.equal(staleResult.reason, 'building_not_found');
  assert.equal(instance.buildingById.has(hiddenBuildingId), true);

  visibleTileIndices = new Set([instance.toTileIndex(1, 2)]);
  const result = await handleBuildDeconstructIntent(runtime, playerId, {
    requestId: 'repair-proof:deconstruct:coordinate',
    x: 1,
    y: 2,
  });

  assert.equal(result.ok, true, `坐标拆除应命中正式石墙，实际原因：${String(result.reason ?? '')}`);
  assert.equal(instance.buildingById.has(nearBuildingId), false, '拆除成功后权威建筑索引必须移除目标');
  assert.equal(instance.tilePlane.getTileType(instance.toTileIndex(1, 2)), TileType.Floor, '拆除后应恢复原地块');
  assert.equal(runtime.buildingOperationAuditLog.length, 5, '成功与拒绝结果都必须进入既有操作审计链');

  console.log(MARKER);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
