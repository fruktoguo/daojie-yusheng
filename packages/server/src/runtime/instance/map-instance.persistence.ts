/**
 * map-instance.persistence.ts
 *
 * 从 MapInstanceRuntime 抽出的持久化域方法（模式 B 委托壳）。
 * 包含：hydrate*、build*Persistence*、mark*Dirty、acquirePersistenceDomainHold、
 * dirty 管理、flush snapshot、staged revision 等持久化相关逻辑。
 * 所有函数接收 instance: MapInstanceRuntime 作为第一参数，通过委托壳调用。
 */
import type { MapInstanceRuntime } from './map-instance.runtime';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  composeTileTypeFromLayers,
  MAX_INSTANCE_TICK_SPEED,
  TileType,
  resolveTileLayerSeedFromTileType,
} from '@mud/shared';
import { resolveCompiledBuildingDefinition } from '../building/building-definition-resolution.helpers';
import { findBuildingProtectedPlacementConflict } from '../world/building-protected-placement.helpers';
import {
  DEFAULT_TILE_AURA_RESOURCE_KEY,
  addNumericDirtyKey,
  addTileResourceDirtyKey,
  areInteractableKindListsEqual,
  areTileResourceValuesEqual,
  buildGroundSourceId,
  buildSkippedBuildingRecord,
  buildingUsesActiveTopology,
  clearMapInstanceDirtyDomains,
  clearMapInstancePersistenceDeltaDomain,
  compareGroundEntries,
  countAliveMonsters,
  createMapInstanceDirtyDomainSet,
  ensureMonsterInitialBuffs,
  inspectPersistedBuildingCellRecovery,
  iterateBuildingProtectedPlacementPoints,
  markMapInstanceDirtyDomainHighPriority,
  markMapInstanceDirtyDomains,
  markMapInstancePersistenceFullReplaceDomains,
  mergeGroundItemEntry,
  normalizeBuildingDeconstructPreviousState,
  normalizeBuildingId,
  normalizeBuildingRotation,
  normalizeBuildingState,
  normalizeExplicitBuildingAccessPolicies,
  normalizePersistedBuildingProgress,
  normalizePersistedGroundItem,
  normalizeTileResourceValue,
  normalizeTileRestoreTicksLeft,
  recalculateMonsterBaseStatsFromFormula,
  recalculateMonsterDerivedState,
  resolvePersistedBuildingCells,
  resolvePersistedBuildingPreviousTileTypes,
  resolvePreviousBuildingInteractableKinds,
  resolvePreviousBuildingLayerValue,
  resolvePreviousBuildingNullableLayerValue,
  resolvePreviousBuildingTileType,
  resolveTemplateLayerSeed,
  resolveTileDurability,
  restoreSkippedPersistedBuildingTileCells,
} from './map-instance.runtime.helpers';

type InstancePersistenceDomainMutationContext = {
  instance: object;
  domains: ReadonlySet<string>;
  active: boolean;
};

const INSTANCE_PERSISTENCE_DOMAIN_MUTATION_CONTEXT = new AsyncLocalStorage<InstancePersistenceDomainMutationContext>();

export { INSTANCE_PERSISTENCE_DOMAIN_MUTATION_CONTEXT };
export function buildBuildingPersistenceEntriesImpl(instance: MapInstanceRuntime) {
  return Array.from(instance.buildingById.values()).map((building) => {
   const persistedBuilding = { ...building };
   // defHandle 仅是当前内容目录的进程内索引，持久化身份始终使用 defId。
   delete persistedBuilding.defHandle;
   return {
    ...persistedBuilding,
    cells: instance.buildBuildingCellPersistenceEntries(building.id),
   };
  });
}

export function buildBuildingCellPersistenceEntriesImpl(instance: MapInstanceRuntime, buildingId) {
  const previousTileTypeByCell = new Map(instance.buildingPreviousTileTypeById.get(buildingId) ?? []);
  return (instance.buildingCellsById.get(buildingId) ?? []).map((cellIndex) => ({
   tileIndex: cellIndex,
   x: instance.tilePlane.getX(cellIndex),
   y: instance.tilePlane.getY(cellIndex),
   tileType: instance.tilePlane.getTileType(cellIndex),
   previousTileType: resolvePreviousBuildingTileType(previousTileTypeByCell.get(cellIndex)),
   previousTerrainType: resolvePreviousBuildingLayerValue(previousTileTypeByCell.get(cellIndex), 'terrainType'),
   previousSurfaceType: resolvePreviousBuildingNullableLayerValue(previousTileTypeByCell.get(cellIndex), 'surfaceType'),
   previousStructureType: resolvePreviousBuildingNullableLayerValue(previousTileTypeByCell.get(cellIndex), 'structureType'),
   previousInteractableKinds: resolvePreviousBuildingInteractableKinds(previousTileTypeByCell.get(cellIndex)),
  }));
}

export function buildBuildingRoomFengShuiPersistenceStateImpl(instance: MapInstanceRuntime) {
  return {
   buildings: instance.buildBuildingPersistenceEntries(),
   rooms: instance.listRoomSummaries(),
   roomCells: instance.buildRoomCellPersistenceEntries(),
   fengShui: Array.from(instance.fengShuiByRoomId.values()).map((snapshot) => ({ ...snapshot })),
  };
}

export function buildRoomCellPersistenceEntriesImpl(instance: MapInstanceRuntime) {
  const rows = [];
  for (let cellIndex = 0; cellIndex < instance.roomIdByCell.length; cellIndex += 1) {
   const roomId = instance.roomIdsByHandle[instance.roomIdByCell[cellIndex]];
   if (!roomId) continue;
   rows.push({
    roomId,
    tileIndex: cellIndex,
    x: instance.tilePlane.getX(cellIndex),
    y: instance.tilePlane.getY(cellIndex),
    edgeFlags: instance.buildingTopologyIndex?.isRoomBoundary?.(cellIndex) ? 1 : 0,
   });
  }
  return rows;
}

export function hydrateBuildingRoomFengShuiStateImpl(instance: MapInstanceRuntime, state, options: { keepBuildingIds?: Set<string> } = {}) {
  const buildings = Array.isArray(state?.buildings) ? state.buildings : [];
  // 宝库库存返还失败时豁免摧毁，避免玩家资产滞留在无法访问的建筑里。
  const keepBuildingIds = options?.keepBuildingIds instanceof Set ? options.keepBuildingIds : null;
  instance.buildingById = new Map();
  instance.buildingCellsById = new Map();
  instance.buildingPreviousTileTypeById = new Map();
  let skippedUnknownDefCount = 0;
  let skippedProtectedPlacementCount = 0;
  let restoredSkippedBuildingTileCellCount = 0;
  let keptProtectedPlacementCount = 0;
  let repairedBuildingCellCount = 0;
  let repairedBuildingVisualCellCount = 0;
  let restoredStaleBuildingVisualCellCount = 0;
  const repairedBuildingVisualCells = new Set();
  const staleBuildingVisualRepairByCell = new Map();
  // 被丢弃的建筑可能是宝库，调用方需要先把库存邮件返还给 owner 再清理持久化行。
  const skippedBuildings = [];
  for (const entry of buildings) {
   const id = normalizeBuildingId(entry?.id ?? entry?.buildingId);
   const defId = normalizeBuildingId(entry?.defId);
   if (!id || !defId) {
    continue;
   }
   const compiled = instance.buildingCatalog?.defById?.get?.(defId);
   const persistedLocation = {
    x: Math.trunc(Number(entry?.x) || 0),
    y: Math.trunc(Number(entry?.y) || 0),
    rotation: normalizeBuildingRotation(entry?.rotation),
   };
   if (instance.buildingCatalog?.defById && !compiled) {
    skippedUnknownDefCount += 1;
    skippedBuildings.push(buildSkippedBuildingRecord(id, defId, entry?.ownerPlayerId, 'unknown_def'));
    const skippedCells = resolvePersistedBuildingCells(instance, persistedLocation, entry?.cells, null);
    restoredSkippedBuildingTileCellCount += restoreSkippedPersistedBuildingTileCells(instance, entry?.cells, skippedCells);
    continue;
   }
   const defHandle = Math.max(0, Math.trunc(Number(compiled?.handle) || 0));
   const accessPolicies = normalizeExplicitBuildingAccessPolicies(entry?.accessPolicies);
   const building = {
    id,
    name: typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : undefined,
    ...(accessPolicies ? { accessPolicies } : {}),
    ...(normalizeBuildingId(entry?.techniqueAggregationFamilyId) ? {
     techniqueAggregationFamilyId: normalizeBuildingId(entry.techniqueAggregationFamilyId),
    } : {}),
    defId,
    defHandle,
    instanceId: instance.meta.instanceId,
    x: persistedLocation.x,
    y: persistedLocation.y,
    rotation: persistedLocation.rotation,
    ownerPlayerId: typeof entry?.ownerPlayerId === 'string' && entry.ownerPlayerId.trim() ? entry.ownerPlayerId.trim() : null,
    ownerSectId: typeof entry?.ownerSectId === 'string' && entry.ownerSectId.trim() ? entry.ownerSectId.trim() : null,
    roomId: typeof entry?.roomId === 'string' && entry.roomId.trim() ? entry.roomId.trim() : null,
    hp: Math.max(0, Math.trunc(Number(entry?.hp) || 0)),
    maxHp: Math.max(1, Math.trunc(Number(entry?.maxHp) || compiled?.maxHp || 1)),
    state: normalizeBuildingState(entry?.state),
    createdAtTick: Math.max(0, Math.trunc(Number(entry?.createdAtTick) || 0)),
    updatedAtTick: Math.max(0, Math.trunc(Number(entry?.updatedAtTick) || 0)),
    revision: Math.max(1, Math.trunc(Number(entry?.revision) || 1)),
    buildStrength: Number.isFinite(Number(entry?.buildStrength)) ? Math.max(1, Math.trunc(Number(entry.buildStrength))) : undefined,
    builderSkillLevel: Number.isFinite(Number(entry?.builderSkillLevel)) ? Math.max(1, Math.trunc(Number(entry.builderSkillLevel))) : undefined,
    buildCompleteTick: Number.isFinite(Number(entry?.buildCompleteTick)) ? Math.max(0, Math.trunc(Number(entry.buildCompleteTick))) : undefined,
    buildRemainingTicks: normalizePersistedBuildingProgress(entry?.buildRemainingTicks),
    activeBuilderPlayerId: normalizeBuildingId(entry?.activeBuilderPlayerId) || null,
    deconstructRemainingTicks: normalizePersistedBuildingProgress(entry?.deconstructRemainingTicks),
    activeDeconstructorPlayerId: normalizeBuildingId(entry?.activeDeconstructorPlayerId) || null,
    deconstructPreviousState: entry?.state === 'deconstructing'
     ? normalizeBuildingDeconstructPreviousState(entry?.deconstructPreviousState, entry?.buildRemainingTicks)
     : undefined,
    scriptureTechniqueId: normalizeBuildingId(entry?.scriptureTechniqueId) || null,
    scriptureTechniqueName: typeof entry?.scriptureTechniqueName === 'string' && entry.scriptureTechniqueName.trim() ? entry.scriptureTechniqueName.trim() : null,
    scriptureProgress: Number.isFinite(Number(entry?.scriptureProgress)) ? Math.max(0, Number(entry.scriptureProgress)) : undefined,
    scriptureRequiredProgress: Number.isFinite(Number(entry?.scriptureRequiredProgress)) ? Math.max(1, Number(entry.scriptureRequiredProgress)) : undefined,
    scriptureRealmLv: Number.isFinite(Number(entry?.scriptureRealmLv)) ? Math.max(1, Math.trunc(Number(entry.scriptureRealmLv))) : undefined,
    scriptureGrade: typeof entry?.scriptureGrade === 'string' && entry.scriptureGrade.trim() ? entry.scriptureGrade.trim() : undefined,
    scriptureCategory: typeof entry?.scriptureCategory === 'string' && entry.scriptureCategory.trim() ? entry.scriptureCategory.trim() : undefined,
    scriptureRecorderPlayerId: normalizeBuildingId(entry?.scriptureRecorderPlayerId) || null,
    scriptureRecordingJobRunId: normalizeBuildingId(entry?.scriptureRecordingJobRunId) || null,
    scriptureRecordedAtTick: Number.isFinite(Number(entry?.scriptureRecordedAtTick)) ? Math.max(0, Math.trunc(Number(entry.scriptureRecordedAtTick))) : undefined,
    scriptureUpdatedAtTick: Number.isFinite(Number(entry?.scriptureUpdatedAtTick)) ? Math.max(0, Math.trunc(Number(entry.scriptureUpdatedAtTick))) : undefined,
   };
   const cells = resolvePersistedBuildingCells(instance, building, entry?.cells, compiled);
   const placementConflict = findBuildingProtectedPlacementConflict(
    instance,
    iterateBuildingProtectedPlacementPoints(instance, cells, building.x, building.y),
   );
   if (placementConflict.ok !== true && keepBuildingIds?.has(id) !== true) {
    skippedProtectedPlacementCount += 1;
    skippedBuildings.push(buildSkippedBuildingRecord(id, defId, building.ownerPlayerId, placementConflict.reason));
    restoredSkippedBuildingTileCellCount += restoreSkippedPersistedBuildingTileCells(instance, entry?.cells, cells);
    continue;
   }
   if (placementConflict.ok !== true) {
    keptProtectedPlacementCount += 1;
   }
   const cellRecovery = inspectPersistedBuildingCellRecovery(instance, cells, entry?.cells);
   repairedBuildingCellCount += cellRecovery.repairedCellCount;
   if (compiled?.visualTileType && cellRecovery.repairedCellCount > 0) {
    repairedBuildingVisualCellCount += cellRecovery.repairedCellCount;
    for (const cellIndex of cells) {
     repairedBuildingVisualCells.add(cellIndex);
    }
    for (const repair of cellRecovery.staleCells) {
     const existing = staleBuildingVisualRepairByCell.get(repair.cellIndex);
     if (!existing || (!existing.previousState && repair.previousState)) {
      staleBuildingVisualRepairByCell.set(repair.cellIndex, repair);
     }
    }
   }
   instance.buildingById.set(id, building);
   instance.buildingCellsById.set(id, cells);
   const previousTileTypes = resolvePersistedBuildingPreviousTileTypes(instance, entry?.cells, cells);
   if (previousTileTypes.length > 0) {
    instance.buildingPreviousTileTypeById.set(id, previousTileTypes);
   }
  }
  for (const repair of staleBuildingVisualRepairByCell.values()) {
   const changed = repair.previousState
    ? instance.restoreBuildingPreviousTileState(repair.cellIndex, repair.previousState)
    : instance.applyDefaultTileLayerFallback(repair.cellIndex);
   if (changed) {
    restoredStaleBuildingVisualCellCount += 1;
    instance.markStaticTileSyncDirtyByIndex(repair.cellIndex, { sightBlockingChanged: true, pathingChanged: true });
   }
  }
  for (const building of instance.buildingById.values()) {
   const compiled = resolveCompiledBuildingDefinition(instance.buildingCatalog, building);
   if (!compiled?.visualTileType || !buildingUsesActiveTopology(building)) {
    continue;
   }
   for (const cellIndex of instance.buildingCellsById.get(building.id) ?? []) {
    if (cellIndex >= 0 && cellIndex < instance.tilePlane.getCellCount()) {
     instance.applyBuildingVisualTileType(cellIndex, compiled);
     if (repairedBuildingVisualCells.has(cellIndex)) {
      instance.markStaticTileSyncDirtyByIndex(cellIndex, { sightBlockingChanged: true, pathingChanged: true });
     }
    }
   }
  }
  if (skippedUnknownDefCount > 0 || skippedProtectedPlacementCount > 0 || repairedBuildingCellCount > 0) {
   const tileCellRecoveryRequired = restoredSkippedBuildingTileCellCount > 0
    || repairedBuildingVisualCellCount > 0
    || restoredStaleBuildingVisualCellCount > 0;
   instance.markAoiViewChangedGlobally({ sightBlockingChanged: tileCellRecoveryRequired });
   instance.worldRevision += 1;
   instance.persistentRevision += 1;
   instance.markPersistenceDirtyDomains([
    'building',
    'room',
    'fengshui',
    ...(tileCellRecoveryRequired ? ['tile_cell'] : []),
   ]);
  }
  if (instance.buildingCatalog) {
   instance.rebuildBuildingRoomFengShuiState();
   return { buildingCount: instance.buildingById.size, rebuilt: true, skippedUnknownDefCount, skippedProtectedPlacementCount, restoredSkippedBuildingTileCellCount, skippedBuildings, keptProtectedPlacementCount, repairedBuildingCellCount, repairedBuildingVisualCellCount, restoredStaleBuildingVisualCellCount };
  }
  instance.roomsById = new Map();
  instance.roomIdsByHandle = [];
  instance.roomCellIndicesById = new Map();
  const rooms = Array.isArray(state?.rooms) ? state.rooms : [];
  for (let index = 0; index < rooms.length; index += 1) {
   const room = rooms[index];
   const id = typeof room?.id === 'string' && room.id.trim() ? room.id.trim() : '';
   if (!id) {
    continue;
   }
   room.instanceId = instance.meta.instanceId;
   instance.roomsById.set(id, room);
   instance.roomIdsByHandle[index + 1] = id;
  }
  if (Array.isArray(state?.roomCells)) {
   instance.roomIdByCell = new Int32Array(Math.max(1, instance.tilePlane.getCellCapacity?.() ?? instance.tilePlane.getCellCount?.() ?? 1));
   const roomHandleById = new Map();
   for (let index = 1; index < instance.roomIdsByHandle.length; index += 1) {
    const roomId = instance.roomIdsByHandle[index];
    if (roomId) {
     roomHandleById.set(roomId, index);
    }
   }
   for (const cell of state.roomCells) {
    const roomId = typeof cell?.roomId === 'string' && cell.roomId.trim() ? cell.roomId.trim() : '';
    const handle = roomHandleById.get(roomId) ?? 0;
    const tileIndex = Number.isFinite(Number(cell?.tileIndex))
     ? Math.trunc(Number(cell.tileIndex))
     : instance.toTileIndex(cell?.x, cell?.y);
    if (handle > 0 && tileIndex >= 0 && tileIndex < instance.roomIdByCell.length) {
     instance.roomIdByCell[tileIndex] = handle;
    }
   }
   instance.rebuildRoomCellIndices();
  }
  instance.fengShuiByRoomId = new Map();
  for (const snapshot of Array.isArray(state?.fengShui) ? state.fengShui : []) {
   const roomId = typeof snapshot?.roomId === 'string' && snapshot.roomId.trim() ? snapshot.roomId.trim() : '';
   if (roomId) {
    snapshot.instanceId = instance.meta.instanceId;
    instance.fengShuiByRoomId.set(roomId, snapshot);
   }
  }
  return { buildingCount: instance.buildingById.size, rebuilt: false, skippedUnknownDefCount, skippedProtectedPlacementCount, restoredSkippedBuildingTileCellCount, skippedBuildings, keptProtectedPlacementCount, repairedBuildingCellCount, repairedBuildingVisualCellCount, restoredStaleBuildingVisualCellCount };
}

export function snapshotImpl(instance: MapInstanceRuntime) {
  const snapshot: Record<string, unknown> = {
   instanceId: instance.meta.instanceId,
   displayName: instance.meta.displayName,
   templateId: instance.meta.templateId,
   templateName: instance.template.name,
   mapGroupId: instance.template.mapGroupId,
   mapGroupName: instance.template.mapGroupName,
   mapGroupOrder: instance.template.mapGroupOrder,
   mapGroupMemberOrder: instance.template.mapGroupMemberOrder,
   kind: instance.meta.kind,
   linePreset: instance.meta.linePreset,
   lineIndex: instance.meta.lineIndex,
   instanceOrigin: instance.meta.instanceOrigin,
   defaultEntry: instance.meta.defaultEntry === true,
   persistent: instance.meta.persistent === true,
   persistentPolicy: instance.meta.persistentPolicy,
   runtimeStatus: instance.meta.runtimeStatus,
   status: instance.meta.status,
   supportsPvp: instance.meta.supportsPvp === true,
   canDamageTile: instance.meta.canDamageTile === true,
   tick: instance.tick,
   worldRevision: instance.worldRevision,
   persistenceRevision: instance.persistentRevision,
   playerCount: instance.playersById.size,
   width: instance.template.width,
   height: instance.template.height,
   changedAuraTileCount: instance.changedAuraTileCount,
   groundPileCount: instance.groundPilesByTile.size,
   monsterCount: instance.monstersByRuntimeId.size,
   aliveMonsterCount: countAliveMonsters(instance.monstersByRuntimeId),
   safeZoneCount: instance.template.safeZones.length,
   landmarkCount: instance.landmarksById.size,
   containerCount: instance.containersById.size,
   players: Array.from(instance.playersById.values(), (player) => ({
    playerId: player.playerId,
    sessionId: player.sessionId,
    x: player.x,
    y: player.y,
   })),
  };
  if (typeof instance.meta.parentInstanceId === 'string' && instance.meta.parentInstanceId.trim()) {
   snapshot.parentInstanceId = instance.meta.parentInstanceId;
  }
  if (typeof instance.meta.parentBuildingId === 'string' && instance.meta.parentBuildingId.trim()) {
   snapshot.parentBuildingId = instance.meta.parentBuildingId;
  }
  if (typeof instance.meta.destroyAt === 'string' && instance.meta.destroyAt.trim()) {
   snapshot.destroyAt = instance.meta.destroyAt;
  }
  return snapshot;
}

export function hydrateAuraImpl(instance: MapInstanceRuntime, entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  instance.hydrateTileResources((entries ?? []).map((entry) => ({
   resourceKey: DEFAULT_TILE_AURA_RESOURCE_KEY,
   tileIndex: entry.tileIndex,
   value: entry.value,
  })));
}

export function hydrateTileResourcesImpl(instance: MapInstanceRuntime, entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  instance.tileResourceBuckets.clear();
  instance.auraByTile.set(instance.template.baseAuraByTile);
  instance.tileResourceBuckets.set(DEFAULT_TILE_AURA_RESOURCE_KEY, instance.auraByTile);
  instance.changedAuraTileCount = 0;
  instance.changedTileResourceEntryCount = 0;
  instance.changedTileResourceEntryCountByKey.clear();
  instance.tileResourceFlowRemainderBuckets.clear();
  instance.tileResourceFlowIndicesByKey.clear();
  instance.clearDirtyDomains();
  for (const entry of entries) {
   if (!entry
    || typeof entry.resourceKey !== 'string'
    || !entry.resourceKey
    || !Number.isFinite(entry.tileIndex)
    || !Number.isFinite(entry.value)) {
    continue;
   }

   const tileIndex = Math.trunc(entry.tileIndex);
   if (tileIndex < 0 || tileIndex >= instance.auraByTile.length) {
    continue;
   }

   const next = normalizeTileResourceValue(entry.value);
   if (entry.resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY && next <= 0) {
    continue;
   }
   const bucket = instance.getOrCreateTileResourceBucket(entry.resourceKey);
   const previous = bucket[tileIndex] ?? 0;
   bucket[tileIndex] = next;
   instance.applyTileResourceDirtyCounter(entry.resourceKey, tileIndex, previous, next);
   instance.updateTileResourceFlowIndex(entry.resourceKey, tileIndex, next);
  }
  instance.persistentRevision = 1;
  instance.persistedRevision = 1;
  instance.clearDirtyDomains();
}

export function hydrateTileDamageImpl(instance: MapInstanceRuntime, entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  instance.tileDamageByTile.clear();
  if (!Array.isArray(entries)) {
   instance.persistentRevision = 1;
   instance.persistedRevision = 1;
   instance.clearDirtyDomains();
   return;
  }
  for (const entry of entries) {
   if (!entry || !Number.isFinite(Number(entry.tileIndex))) {
    continue;
   }
   const tileIndex = Math.trunc(Number(entry.tileIndex));
   const hasCoordinate = Number.isFinite(Number(entry.x)) && Number.isFinite(Number(entry.y));
   const resolvedTileIndex = hasCoordinate
    ? instance.toTileIndex(Math.trunc(Number(entry.x)), Math.trunc(Number(entry.y)))
    : tileIndex;
   if (resolvedTileIndex < 0 || resolvedTileIndex >= instance.auraByTile.length) {
    continue;
   }
   const x = instance.tilePlane.getX(resolvedTileIndex);
   const y = instance.tilePlane.getY(resolvedTileIndex);
   const tileType = instance.getBaseTileType(x, y);
   const layerState = typeof instance.tilePlane.getTileLayerState === 'function'
    ? instance.tilePlane.getTileLayerState(resolvedTileIndex)
    : null;
   const resolvedMaxHp = resolveTileDurability(instance.template, tileType, x, y, layerState);
   if (resolvedMaxHp <= 0) {
    continue;
   }
   const maxHp = Math.max(1, Math.trunc(Number(entry.maxHp) || resolvedMaxHp));
   const destroyed = entry.destroyed === true;
   const hp = destroyed
    ? 0
    : Math.max(1, Math.min(maxHp - 1, Math.trunc(Number(entry.hp) || maxHp)));
   const respawnLeft = destroyed
    ? normalizeTileRestoreTicksLeft(entry.respawnLeft, tileType)
    : 0;
   if (!destroyed && hp >= maxHp) {
    continue;
   }
   instance.tileDamageByTile.set(resolvedTileIndex, {
    hp,
    maxHp,
    destroyed,
    respawnLeft,
    modifiedAt: Number.isFinite(Number(entry.modifiedAt)) ? Math.max(0, Math.trunc(Number(entry.modifiedAt))) : Date.now(),
   });
  }
  let topologyChangedCellCount = 0;
  for (const [tileIndex, damage] of instance.tileDamageByTile.entries()) {
   const x = instance.tilePlane.getX(tileIndex);
   const y = instance.tilePlane.getY(tileIndex);
   const tileType = instance.getBaseTileType(x, y);
   if (damage?.destroyed === true && instance.shouldRecalculateRoomsForTileMutation(tileIndex, tileType, instance.getDestroyedTileLayerStateByCellIndex(tileIndex).tileType)) {
    topologyChangedCellCount += 1;
   }
  }
  if (topologyChangedCellCount > 0) {
   instance.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'tile_damage_hydrated', dirtyCellCount: topologyChangedCellCount });
  }
  instance.persistentRevision = 1;
  instance.persistedRevision = 1;
  instance.clearDirtyDomains();
}

export function hydrateTemporaryTilesImpl(instance: MapInstanceRuntime, entries) {
  instance.temporaryTileByTile.clear();
  if (!Array.isArray(entries)) {
   instance.clearDirtyDomains();
   return;
  }
  let topologyChangedCellCount = 0;
  for (const entry of entries) {
   if (!entry || !Number.isFinite(Number(entry.tileIndex))) {
    continue;
   }
   const tileIndex = Math.trunc(Number(entry.tileIndex));
   const hasCoordinate = Number.isFinite(Number(entry.x)) && Number.isFinite(Number(entry.y));
   const resolvedTileIndex = hasCoordinate
    ? instance.toTileIndex(Math.trunc(Number(entry.x)), Math.trunc(Number(entry.y)))
    : tileIndex;
   if (resolvedTileIndex < 0 || resolvedTileIndex >= instance.auraByTile.length) {
    continue;
   }
   const previousTileType = instance.getEffectiveTileTypeByCellIndex(resolvedTileIndex);
   const hp = Math.max(1, Math.trunc(Number(entry.hp) || 1));
   const maxHp = Math.max(hp, Math.trunc(Number(entry.maxHp) || hp));
   const expiresAtTick = Math.max(1, Math.trunc(Number(entry.expiresAtTick) || 1));
   const tileType = typeof entry.tileType === 'string' && entry.tileType.length > 0 ? entry.tileType : TileType.Stone;
   instance.temporaryTileByTile.set(resolvedTileIndex, {
    tileType,
    hp,
    maxHp,
    expiresAtTick,
    ownerPlayerId: typeof entry.ownerPlayerId === 'string' && entry.ownerPlayerId.trim() ? entry.ownerPlayerId.trim() : null,
    sourceSkillId: typeof entry.sourceSkillId === 'string' && entry.sourceSkillId.trim() ? entry.sourceSkillId.trim() : null,
    sourceItemId: typeof entry.sourceItemId === 'string' && entry.sourceItemId.trim() ? entry.sourceItemId.trim() : null,
    mineralLevel: Number.isFinite(entry.mineralLevel) ? Math.max(1, Math.trunc(entry.mineralLevel)) : null,
    createdAt: Number.isFinite(Number(entry.createdAt)) ? Math.max(0, Math.trunc(Number(entry.createdAt))) : Date.now(),
    modifiedAt: Number.isFinite(Number(entry.modifiedAt)) ? Math.max(0, Math.trunc(Number(entry.modifiedAt))) : Date.now(),
   });
   if (instance.shouldRecalculateRoomsForTileMutation(resolvedTileIndex, previousTileType, tileType)) {
    topologyChangedCellCount += 1;
   }
  }
  if (topologyChangedCellCount > 0) {
   instance.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'temporary_tiles_hydrated', dirtyCellCount: topologyChangedCellCount });
  }
  instance.clearDirtyDomains();
}

export function hydrateRuntimeTilesImpl(instance: MapInstanceRuntime, entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
   return;
  }
  let topologyChangedCellCount = 0;
  for (const entry of entries) {
   if (!entry || !Number.isFinite(Number(entry.x)) || !Number.isFinite(Number(entry.y))) {
    continue;
   }
   const x = Math.trunc(Number(entry.x));
   const y = Math.trunc(Number(entry.y));
   const tileType = typeof entry.tileType === 'string' && entry.tileType.length > 0
    ? entry.tileType
    : TileType.Stone;
   const tileIndex = instance.toTileIndex(x, y);
   if (tileIndex >= 0) {
    const previousTileType = instance.getEffectiveTileTypeByCellIndex(tileIndex);
    instance.tilePlane.setTileType(tileIndex, tileType);
    instance.applyPersistedTileLayers(tileIndex, entry);
    if (instance.shouldRecalculateRoomsForTileMutation(tileIndex, previousTileType, tileType)) {
     topologyChangedCellCount += 1;
    }
    continue;
   }
   const activated = instance.activateRuntimeTile(x, y, tileType, { skipRoomFengShuiDirty: true });
   if (activated?.tileIndex >= 0) {
    instance.applyPersistedTileLayers(activated.tileIndex, entry);
   }
   if (activated?.created === true && instance.shouldRecalculateRoomsForTileMutation(activated.tileIndex, instance.resolveDefaultTileLayerFallbackForCell(activated.tileIndex).legacyTileType, tileType)) {
    topologyChangedCellCount += 1;
   }
  }
  if (topologyChangedCellCount > 0) {
   instance.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'runtime_tiles_hydrated', dirtyCellCount: topologyChangedCellCount });
  }
  const repairedRuntimeTiles = instance.getDirtyDomains().has('tile_cell');
  instance.persistentRevision = 1;
  instance.persistedRevision = 1;
  instance.clearDirtyDomains();
  if (repairedRuntimeTiles) {
   instance.persistentRevision += 1;
   instance.markPersistenceDirtyDomains(['tile_cell']);
  }
}

export function applyPersistedTileLayersImpl(instance: MapInstanceRuntime, tileIndex, entry) {
  if (!entry || tileIndex < 0 || tileIndex >= instance.tilePlane.getCellCount()) {
   return;
  }
  const tileType = typeof entry.tileType === 'string' && entry.tileType.length > 0
   ? entry.tileType
   : instance.tilePlane.getTileType(tileIndex);
  const persistedTerrainType = typeof entry.terrainType === 'string' && entry.terrainType.length > 0 ? entry.terrainType : undefined;
  const persistedSurfaceType = Object.prototype.hasOwnProperty.call(entry, 'surfaceType')
   ? (typeof entry.surfaceType === 'string' && entry.surfaceType.length > 0 ? entry.surfaceType : null)
   : undefined;
  const persistedStructureType = Object.prototype.hasOwnProperty.call(entry, 'structureType')
   ? (typeof entry.structureType === 'string' && entry.structureType.length > 0 ? entry.structureType : null)
   : undefined;
  const persistedInteractableKinds = Array.isArray(entry.interactableKinds) ? entry.interactableKinds : undefined;
  if (instance.shouldNormalizePersistedRuntimeTileToDefaultFallback(tileType, persistedTerrainType, persistedSurfaceType, persistedStructureType, persistedInteractableKinds)) {
   instance.applyDefaultTileLayerFallback(tileIndex);
   instance.markPersistenceDirtyDomains(['tile_cell']);
   return;
  }
  if (instance.shouldNormalizePersistedRuntimeTileLayers(tileType, persistedTerrainType, persistedSurfaceType, persistedStructureType, persistedInteractableKinds)) {
   const seed = resolveTileLayerSeedFromTileType(tileType);
   instance.tilePlane.setTerrain(tileIndex, seed.terrain);
   instance.tilePlane.setSurface(tileIndex, seed.surface);
   instance.tilePlane.setStructure(tileIndex, seed.structure);
   if (typeof instance.tilePlane.setInteractableKinds === 'function') {
    instance.tilePlane.setInteractableKinds(tileIndex, [...seed.interactables]);
   }
   instance.markPersistenceDirtyDomains(['tile_cell']);
   return;
  }
  if (typeof entry.terrainType === 'string' && entry.terrainType.length > 0) {
   instance.tilePlane.setTerrain(tileIndex, entry.terrainType);
  }
  if (Object.prototype.hasOwnProperty.call(entry, 'surfaceType')) {
   instance.tilePlane.setSurface(tileIndex, typeof entry.surfaceType === 'string' && entry.surfaceType.length > 0 ? entry.surfaceType : null);
  }
  if (Object.prototype.hasOwnProperty.call(entry, 'structureType')) {
   instance.tilePlane.setStructure(tileIndex, typeof entry.structureType === 'string' && entry.structureType.length > 0 ? entry.structureType : null);
  }
  if (Array.isArray(entry.interactableKinds) && typeof instance.tilePlane.setInteractableKinds === 'function') {
   instance.tilePlane.setInteractableKinds(tileIndex, entry.interactableKinds);
  }
}

export function shouldNormalizePersistedRuntimeTileToDefaultFallbackImpl(instance: MapInstanceRuntime, tileType, terrainType, surfaceType, structureType, interactableKinds) {
  const hasSurface = surfaceType !== undefined && surfaceType !== null;
  const hasStructure = structureType !== undefined && structureType !== null;
  const hasInteractables = Array.isArray(interactableKinds) && interactableKinds.length > 0;
  const seed = resolveTileLayerSeedFromTileType(tileType);
  if (seed.structure && structureType === null) {
   return true;
  }
  return terrainType === 'stone_ground' && !hasSurface && !hasStructure && !hasInteractables;
}

export function shouldNormalizePersistedRuntimeTileLayersImpl(instance: MapInstanceRuntime, tileType, terrainType, surfaceType, structureType, interactableKinds) {
  const seed = resolveTileLayerSeedFromTileType(tileType);
  const composed = composeTileTypeFromLayers(
   terrainType ?? seed.terrain,
   surfaceType === undefined ? seed.surface : surfaceType,
   structureType === undefined ? seed.structure : structureType,
   interactableKinds ?? [...seed.interactables],
  );
  return composed !== tileType;
}

export function hydrateGroundPilesImpl(instance: MapInstanceRuntime, entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  instance.groundPilesByTile.clear();
  // P0-4 entry cache 跟随 entity lifecycle 释放：hydrate 重置 ground pile 索引时同步清空 view 条目缓存。
  instance.localGroundPileViewCacheBySourceId.clear();
  for (const entry of entries) {
   if (!Number.isFinite(entry.tileIndex) || !Array.isArray(entry.items)) {
    continue;
   }

   const tileIndex = Math.trunc(entry.tileIndex);
   if (tileIndex < 0 || tileIndex >= instance.auraByTile.length) {
    continue;
   }

   const x = instance.tilePlane.getX(tileIndex);

   const y = instance.tilePlane.getY(tileIndex);

   const items = entry.items
    .map((item) => normalizePersistedGroundItem(item))
    .filter((item) => Boolean(item));
   if (items.length === 0) {
    continue;
   }

   const mergedItems = [];
   for (const item of items) {
    mergeGroundItemEntry(mergedItems, item);
   }
   const pile = {
    sourceId: buildGroundSourceId(tileIndex),
    x,
    y,
    tileIndex,
    items: mergedItems,
   };
   pile.items.sort(compareGroundEntries);
   instance.groundPilesByTile.set(tileIndex, pile);
  }
  instance.persistentRevision = 1;
  instance.persistedRevision = 1;
}

export function hydrateTimeImpl(instance: MapInstanceRuntime, tick, options) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(Number(tick))) {
   return;
  }
  instance.tick = Math.max(0, Math.trunc(Number(tick)));
  if (options && Number.isFinite(Number(options.tickSpeed))) {
   instance.tickSpeed = Math.max(0, Math.min(MAX_INSTANCE_TICK_SPEED, Number(options.tickSpeed)));
   instance.paused = instance.tickSpeed === 0;
  }
  if (options && typeof options.paused === 'boolean') {
   instance.paused = options.paused;
   if (instance.paused) {
    instance.tickSpeed = 0;
   }
  }
  instance.persistentRevision = 1;
  instance.persistedRevision = 1;
  instance.clearDirtyDomains();
  instance.ensureGroundItemExpiryDefaults(instance.tick);
  instance.advanceGroundItemExpiry(instance.tick);
}

export function hydrateMonsterRuntimeStatesImpl(instance: MapInstanceRuntime, entries, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Array.isArray(entries) || entries.length === 0) {
   return;
  }
  for (const entry of entries) {
   if (!entry) {
    continue;
   }
   // 分域表使用 monsterRuntimeId 字段名，运行时对象使用 runtimeId；恢复时两种契约都要识别，
   // 否则只能按 monsterId 模糊匹配，多个同类波次会串写 HP/位置。
   const runtimeId = typeof entry.runtimeId === 'string'
    ? entry.runtimeId.trim()
    : (typeof entry.monsterRuntimeId === 'string' ? entry.monsterRuntimeId.trim() : '');
   const monsterId = typeof entry.monsterId === 'string' ? entry.monsterId.trim() : '';
   const monster = (runtimeId ? instance.monstersByRuntimeId.get(runtimeId) : null)
    ?? Array.from(instance.monstersByRuntimeId.values()).find((candidate) => candidate.monsterId === monsterId && candidate.tier !== 'mortal_blood');
   if (!monster) {
    continue;
   }
   instance.clearMonsterRuntimeTileIndex(monster.runtimeId);
   if (typeof entry.monsterName === 'string' && entry.monsterName.trim()) {
    monster.name = entry.monsterName.trim();
   }
   if (typeof entry.monsterTier === 'string' && entry.monsterTier.trim()) {
    monster.tier = entry.monsterTier.trim();
   }
   if (Number.isFinite(Number(entry.monsterLevel))) {
    monster.level = Math.max(1, Math.trunc(Number(entry.monsterLevel)));
   }
   if (Number.isFinite(Number(entry.x))) {
    monster.x = Math.trunc(Number(entry.x));
   }
   if (Number.isFinite(Number(entry.y))) {
    monster.y = Math.trunc(Number(entry.y));
   }
   if (Number.isFinite(Number(entry.hp))) {
    monster.hp = Math.max(0, Math.trunc(Number(entry.hp)));
   }
   if (Number.isFinite(Number(entry.maxHp))) {
    monster.maxHp = Math.max(1, Math.trunc(Number(entry.maxHp)));
   }
   if (Number.isFinite(Number(entry.qi))) {
    monster.qi = Math.max(0, Math.trunc(Number(entry.qi)));
   }
   if (Number.isFinite(Number(entry.maxQi))) {
    monster.maxQi = Math.max(0, Math.trunc(Number(entry.maxQi)));
   }
   if (typeof entry.alive === 'boolean') {
    monster.alive = entry.alive;
   }
   if (Number.isFinite(Number(entry.respawnLeft))) {
    monster.respawnLeft = Math.max(0, Math.trunc(Number(entry.respawnLeft)));
   }
   if (Number.isFinite(Number(entry.respawnTicks))) {
    monster.respawnTicks = Math.max(0, Math.trunc(Number(entry.respawnTicks)));
   }
   if (entry.statePayload && typeof entry.statePayload === 'object') {
    const payload = entry.statePayload;
    monster.pendingCast = undefined;
    if (Array.isArray(payload.buffs)) {
     monster.buffs = payload.buffs;
    }
    if (Number.isFinite(Number(payload.attackReadyTick))) {
     monster.attackReadyTick = Math.max(0, Math.trunc(Number(payload.attackReadyTick)));
    }
    if (Number.isFinite(Number(payload.qi))) {
     monster.qi = Math.max(0, Math.trunc(Number(payload.qi)));
    }
    if (Number.isFinite(Number(payload.maxQi))) {
     monster.maxQi = Math.max(0, Math.trunc(Number(payload.maxQi)));
    }
    if (payload.cooldownReadyTickBySkillId && typeof payload.cooldownReadyTickBySkillId === 'object') {
     monster.cooldownReadyTickBySkillId = payload.cooldownReadyTickBySkillId;
    }
    if (payload.damageContributors && typeof payload.damageContributors === 'object') {
     monster.damageContributors = payload.damageContributors;
    }
    if (typeof payload.engaged === 'boolean') {
     monster.engaged = payload.engaged;
    } else if (monster.aggroTargetPlayerId || (monster.damageContributors && Object.keys(monster.damageContributors).length > 0)) {
     monster.engaged = true;
    } else {
     monster.engaged = !instance.isDungeonInstance();
    }
    if (Number.isFinite(Number(payload.speechTicksLeft))) {
     monster.speechTicksLeft = Math.max(0, Math.trunc(Number(payload.speechTicksLeft)));
    } else {
     monster.speechTicksLeft = 0;
    }
   }
   if (monster.alive) {
    ensureMonsterInitialBuffs(monster, instance.buffRegistry);
   }
   // 副本恢复前已经按难度应用了运行时倍率；此处只重算 Buff 派生值，
   // 避免通用模板公式把副本倍率覆盖回普通地图基准。
   if (options?.preserveScaledBaseStats === true) {
    recalculateMonsterDerivedState(monster);
   }
   else if (!recalculateMonsterBaseStatsFromFormula(monster)) {
    recalculateMonsterDerivedState(monster);
   }
   if (monster.alive) {
    const tileIndex = instance.toTileIndex(monster.x, monster.y);
    if (tileIndex >= 0 && tileIndex < instance.auraByTile.length) {
     instance.monsterRuntimeIdByTile.set(tileIndex, monster.runtimeId);
    }
   }
  }
}

export function hydrateOverlayChunksImpl(instance: MapInstanceRuntime, entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Array.isArray(entries) || entries.length === 0) {
   return;
  }
  const portals = [];
  // server_sect 已在 overlay 回填前重建当前山门与宗门核心；这些派生 portal 不属于 overlay 真源，
  // 因此回填普通 portal 时必须保留，否则启动/实例接管会把刚重建的宗门出入口清空。
  const derivedSectPortals = instance.runtimePortals.filter((portal) => (
   typeof portal?.sectId === 'string' && portal.sectId.trim()
  ));
  let sawPortalChunk = false;
  for (const entry of entries) {
   if (!entry || entry.patchKind !== 'portal') {
    continue;
   }
   const payload = entry.patchPayload && typeof entry.patchPayload === 'object' ? entry.patchPayload : null;
   const portalEntries = Array.isArray(payload?.portals) ? payload.portals : [];
   sawPortalChunk = true;
   for (const portal of portalEntries) {
    if (!portal || !Number.isFinite(Number(portal.x)) || !Number.isFinite(Number(portal.y))) {
     continue;
    }
    // 宗门山门由 server_sect 真源在恢复期重建；忽略历史 overlay，避免迁宗后旧山门复活。
    if (typeof portal.sectId === 'string' && portal.sectId.trim()) {
     continue;
    }
    const x = Math.trunc(Number(portal.x));
    const y = Math.trunc(Number(portal.y));
    if (!instance.isInBounds(x, y)) {
     continue;
    }
    portals.push({
     id: typeof portal.id === 'string' && portal.id.trim() ? portal.id.trim() : `${portal.kind ?? 'portal'}:${x},${y}`,
     x,
     y,
     targetMapId: typeof portal.targetMapId === 'string' && portal.targetMapId.trim() ? portal.targetMapId.trim() : instance.template.id,
     targetInstanceId: typeof portal.targetInstanceId === 'string' && portal.targetInstanceId.trim() ? portal.targetInstanceId.trim() : null,
     targetX: Number.isFinite(Number(portal.targetX)) ? Math.trunc(Number(portal.targetX)) : instance.template.spawnX,
     targetY: Number.isFinite(Number(portal.targetY)) ? Math.trunc(Number(portal.targetY)) : instance.template.spawnY,
     targetPortalId: typeof portal.targetPortalId === 'string' && portal.targetPortalId.trim() ? portal.targetPortalId.trim() : undefined,
     direction: portal.direction === 'one_way' ? 'one_way' : 'two_way',
     kind: typeof portal.kind === 'string' && portal.kind.trim() ? portal.kind.trim() : 'portal',
     trigger: portal.trigger === 'auto' ? 'auto' : 'manual',
     hidden: portal.hidden === true,
     name: typeof portal.name === 'string' && portal.name.trim() ? portal.name.trim() : undefined,
     char: typeof portal.char === 'string' && portal.char.trim() ? portal.char.trim() : undefined,
     color: typeof portal.color === 'string' && portal.color.trim() ? portal.color.trim() : undefined,
     sectId: typeof portal.sectId === 'string' && portal.sectId.trim() ? portal.sectId.trim() : undefined,
    });
   }
  }
  if (sawPortalChunk) {
   for (const portal of derivedSectPortals) {
    const existingIndex = portals.findIndex((entry) => entry.x === portal.x && entry.y === portal.y);
    if (existingIndex >= 0) {
     portals[existingIndex] = portal;
    }
    else {
     portals.push(portal);
    }
   }
   portals.sort((left, right) => left.y - right.y || left.x - right.x);
   instance.runtimePortals = portals;
   instance.markAoiViewChangedGlobally();
   instance.worldRevision += 1;
  }
}

export function buildAuraPersistenceEntriesImpl(instance: MapInstanceRuntime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (instance.changedAuraTileCount === 0) {
   return [];
  }

  return instance.buildTileResourcePersistenceEntries()
   .filter((entry) => entry.resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY)
   .map((entry) => ({
    tileIndex: entry.tileIndex,
    value: entry.value,
   }));
}

export function buildTileResourcePersistenceEntriesImpl(instance: MapInstanceRuntime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const tileResourceDomainDirty = instance.getDirtyDomains().has('tile_resource');
  if (instance.changedTileResourceEntryCount === 0 && !tileResourceDomainDirty) {
   return [];
  }
  const entries = [];
  for (const [resourceKey, bucket] of instance.tileResourceBuckets.entries()) {
   const dirtyCount = instance.changedTileResourceEntryCountByKey.get(resourceKey) ?? 0;
   if (dirtyCount <= 0 && !tileResourceDomainDirty) {
    continue;
   }
   for (let tileIndex = 0; tileIndex < bucket.length; tileIndex += 1) {
    const value = normalizeTileResourceValue(bucket[tileIndex]);
    if (!areTileResourceValuesEqual(value, instance.getTileResourceBaseValueByIndex(resourceKey, tileIndex))) {
     entries.push({
      resourceKey,
      tileIndex,
      value,
     });
    }
   }
  }
  entries.sort((left, right) => left.resourceKey.localeCompare(right.resourceKey, 'zh-Hans-CN') || left.tileIndex - right.tileIndex);
  return entries;
}

export function buildTileResourcePersistenceDeltaImpl(instance: MapInstanceRuntime, flushSnapshot = null) {
  const dirtyPairs = [];
  const dirtyTileResourceByKey = flushSnapshot?.dirtyTileResourceByKey instanceof Map
   ? flushSnapshot.dirtyTileResourceByKey
   : instance.dirtyTileResourceByKey;
  if (dirtyTileResourceByKey instanceof Map) {
   for (const [resourceKey, tileIndices] of dirtyTileResourceByKey.entries()) {
    if (typeof resourceKey !== 'string' || !resourceKey.trim() || !(tileIndices instanceof Set)) {
     continue;
    }
    for (const tileIndex of tileIndices.values()) {
     if (Number.isFinite(Number(tileIndex))) {
      dirtyPairs.push({ resourceKey: resourceKey.trim(), tileIndex: Math.max(0, Math.trunc(Number(tileIndex))) });
     }
    }
   }
  }
  const fullReplaceDomains = flushSnapshot?.fullReplaceDomains instanceof Set
   ? flushSnapshot.fullReplaceDomains
   : instance.persistenceFullReplaceDomains;
  const fullReplace = fullReplaceDomains?.has?.('tile_resource') === true
   || (dirtyPairs.length === 0 && instance.getDirtyDomains().has('tile_resource'));
  if (fullReplace) {
   return { fullReplace: true, upserts: [], deletes: [] };
  }
  const upserts = [];
  const deletes = [];
  for (const pair of dirtyPairs) {
   const value = instance.getTileResourceValueByIndex(pair.resourceKey, pair.tileIndex);
   const base = instance.getTileResourceBaseValueByIndex(pair.resourceKey, pair.tileIndex);
   if (!areTileResourceValuesEqual(value, base)) {
    upserts.push({ resourceKey: pair.resourceKey, tileIndex: pair.tileIndex, value: normalizeTileResourceValue(value) });
   }
   else {
    deletes.push({ resourceKey: pair.resourceKey, tileIndex: pair.tileIndex });
   }
  }
  upserts.sort((left, right) => left.resourceKey.localeCompare(right.resourceKey, 'zh-Hans-CN') || left.tileIndex - right.tileIndex);
  deletes.sort((left, right) => left.resourceKey.localeCompare(right.resourceKey, 'zh-Hans-CN') || left.tileIndex - right.tileIndex);
  return { fullReplace: false, upserts, deletes };
}

export function buildGroundPersistenceEntriesImpl(instance: MapInstanceRuntime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (instance.groundPilesByTile.size === 0) {
   return [];
  }

  const entries = [];
  for (const pile of instance.groundPilesByTile.values()) {
   if (pile.items.length === 0) {
    continue;
   }
   entries.push({
    tileIndex: pile.tileIndex,
    items: pile.items.map((entry) => entry.item),
   });
  }
  entries.sort((left, right) => left.tileIndex - right.tileIndex);
  return entries;
}

export function buildGroundPersistenceDeltaImpl(instance: MapInstanceRuntime, flushSnapshot = null) {
  const dirtyGroundItemTileIndices = flushSnapshot?.dirtyGroundItemTileIndices instanceof Set
   ? flushSnapshot.dirtyGroundItemTileIndices
   : instance.dirtyGroundItemTileIndices;
  const dirtyTileIndices = dirtyGroundItemTileIndices instanceof Set
   ? Array.from(dirtyGroundItemTileIndices.values())
    .filter((tileIndex) => Number.isFinite(Number(tileIndex)))
    .map((tileIndex) => Math.max(0, Math.trunc(Number(tileIndex))))
   : [];
  const fullReplaceDomains = flushSnapshot?.fullReplaceDomains instanceof Set
   ? flushSnapshot.fullReplaceDomains
   : instance.persistenceFullReplaceDomains;
  const fullReplace = fullReplaceDomains?.has?.('ground_item') === true
   || (dirtyTileIndices.length === 0 && instance.getDirtyDomains().has('ground_item'));
  if (fullReplace) {
   return { fullReplace: true, tileIndices: [], entries: [] };
  }
  const tileIndexSet = new Set(dirtyTileIndices);
  const entries = [];
  for (const tileIndex of tileIndexSet.values()) {
   const pile = instance.groundPilesByTile.get(tileIndex);
   if (!pile || !Array.isArray(pile.items) || pile.items.length === 0) {
    continue;
   }
   entries.push({
    tileIndex,
    items: pile.items.map((entry) => entry.item),
   });
  }
  entries.sort((left, right) => left.tileIndex - right.tileIndex);
  return { fullReplace: false, tileIndices: Array.from(tileIndexSet.values()).sort((left, right) => left - right), entries };
}

export function buildTileDamagePersistenceEntriesImpl(instance: MapInstanceRuntime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (instance.tileDamageByTile.size === 0) {
   return [];
  }

  const entries = [];
  for (const [tileIndex, state] of instance.tileDamageByTile.entries()) {
   if (!Number.isFinite(Number(tileIndex)) || !state) {
    continue;
   }
   entries.push({
    tileIndex: Math.trunc(Number(tileIndex)),
    x: instance.tilePlane.getX(Math.trunc(Number(tileIndex))),
    y: instance.tilePlane.getY(Math.trunc(Number(tileIndex))),
    hp: Math.max(0, Math.trunc(Number(state.hp) || 0)),
    maxHp: Math.max(1, Math.trunc(Number(state.maxHp) || 1)),
    destroyed: state.destroyed === true,
    respawnLeft: Math.max(0, Math.trunc(Number(state.respawnLeft) || 0)),
    modifiedAt: Number.isFinite(Number(state.modifiedAt)) ? Math.max(0, Math.trunc(Number(state.modifiedAt))) : Date.now(),
   });
  }
  entries.sort((left, right) => left.tileIndex - right.tileIndex);
  return entries;
}

export function buildTileDamagePersistenceDeltaImpl(instance: MapInstanceRuntime, flushSnapshot = null) {
  const dirtyTileDamageIndices = flushSnapshot?.dirtyTileDamageIndices instanceof Set
   ? flushSnapshot.dirtyTileDamageIndices
   : instance.dirtyTileDamageIndices;
  const dirtyTileIndices = dirtyTileDamageIndices instanceof Set
   ? Array.from(dirtyTileDamageIndices.values())
    .filter((tileIndex) => Number.isFinite(Number(tileIndex)))
    .map((tileIndex) => Math.max(0, Math.trunc(Number(tileIndex))))
   : [];
  const fullReplaceDomains = flushSnapshot?.fullReplaceDomains instanceof Set
   ? flushSnapshot.fullReplaceDomains
   : instance.persistenceFullReplaceDomains;
  const fullReplace = fullReplaceDomains?.has?.('tile_damage') === true
   || (dirtyTileIndices.length === 0 && instance.getDirtyDomains().has('tile_damage'));
  if (fullReplace) {
   return { fullReplace: true, upserts: [], deletes: [] };
  }
  const upserts = [];
  const deletes = [];
  for (const tileIndex of new Set(dirtyTileIndices).values()) {
   const state = instance.tileDamageByTile.get(tileIndex);
   if (!state) {
    deletes.push(tileIndex);
    continue;
   }
   upserts.push({
    tileIndex,
    x: instance.tilePlane.getX(tileIndex),
    y: instance.tilePlane.getY(tileIndex),
    hp: Math.max(0, Math.trunc(Number(state.hp) || 0)),
    maxHp: Math.max(1, Math.trunc(Number(state.maxHp) || 1)),
    destroyed: state.destroyed === true,
    respawnLeft: Math.max(0, Math.trunc(Number(state.respawnLeft) || 0)),
    modifiedAt: Number.isFinite(Number(state.modifiedAt)) ? Math.max(0, Math.trunc(Number(state.modifiedAt))) : Date.now(),
   });
  }
  upserts.sort((left, right) => left.tileIndex - right.tileIndex);
  deletes.sort((left, right) => left - right);
  return { fullReplace: false, upserts, deletes };
}

export function buildTemporaryTilePersistenceEntriesImpl(instance: MapInstanceRuntime) {
  if (instance.temporaryTileByTile.size === 0) {
   return [];
  }
  const entries = [];
  for (const [tileIndex, state] of instance.temporaryTileByTile.entries()) {
   if (!Number.isFinite(Number(tileIndex)) || !state) {
    continue;
   }
   const normalizedTileIndex = Math.trunc(Number(tileIndex));
   entries.push({
    tileIndex: normalizedTileIndex,
    x: instance.tilePlane.getX(normalizedTileIndex),
    y: instance.tilePlane.getY(normalizedTileIndex),
    tileType: typeof state.tileType === 'string' && state.tileType.length > 0 ? state.tileType : TileType.Stone,
    hp: Math.max(1, Math.trunc(Number(state.hp) || 1)),
    maxHp: Math.max(1, Math.trunc(Number(state.maxHp) || 1)),
    expiresAtTick: Math.max(1, Math.trunc(Number(state.expiresAtTick) || 1)),
    ownerPlayerId: typeof state.ownerPlayerId === 'string' && state.ownerPlayerId.trim() ? state.ownerPlayerId.trim() : null,
    sourceSkillId: typeof state.sourceSkillId === 'string' && state.sourceSkillId.trim() ? state.sourceSkillId.trim() : null,
    sourceItemId: typeof state.sourceItemId === 'string' && state.sourceItemId.trim() ? state.sourceItemId.trim() : null,
    mineralLevel: Number.isFinite(state.mineralLevel) ? Math.max(1, Math.trunc(state.mineralLevel)) : null,
    createdAt: Number.isFinite(Number(state.createdAt)) ? Math.max(0, Math.trunc(Number(state.createdAt))) : Date.now(),
    modifiedAt: Number.isFinite(Number(state.modifiedAt)) ? Math.max(0, Math.trunc(Number(state.modifiedAt))) : Date.now(),
   });
  }
  entries.sort((left, right) => left.tileIndex - right.tileIndex);
  return entries;
}

export function buildRuntimeTilePersistenceEntriesImpl(instance: MapInstanceRuntime) {
  if (!instance.tilePlane || typeof instance.tilePlane.getCellCount !== 'function') {
   return [];
  }
  const entries = [];
  const count = instance.tilePlane.getCellCount();
  for (let tileIndex = 0; tileIndex < count; tileIndex += 1) {
   const x = instance.tilePlane.getX(tileIndex);
   const y = instance.tilePlane.getY(tileIndex);
   const tileType = instance.tilePlane.getTileType(tileIndex);
   const layerState = typeof instance.tilePlane.getTileLayerState === 'function'
    ? instance.tilePlane.getTileLayerState(tileIndex)
    : null;
   const inTemplateBounds = x >= 0 && y >= 0 && x < instance.template.width && y < instance.template.height;
   if (inTemplateBounds) {
    const staticSeed = resolveTemplateLayerSeed(instance.template, x, y);
    const staticType = staticSeed.legacyTileType;
    if (tileType === staticType
     && layerState?.terrain === staticSeed.terrain
     && (layerState?.surface ?? null) === staticSeed.surface
     && (layerState?.structure ?? null) === staticSeed.structure
     && areInteractableKindListsEqual(layerState?.interactableKinds, staticSeed.interactables)) {
     continue;
    }
   }
   entries.push({
    x,
    y,
    tileType,
    terrainType: layerState?.terrain,
    surfaceType: layerState?.surface ?? null,
    structureType: layerState?.structure ?? null,
    interactableKinds: Array.isArray(layerState?.interactableKinds) ? layerState.interactableKinds : [],
   });
  }
  entries.sort((left, right) => left.y - right.y || left.x - right.x || String(left.tileType).localeCompare(String(right.tileType), 'zh-Hans-CN'));
  return entries;
}

export function buildOverlayPersistenceChunksImpl(instance: MapInstanceRuntime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const portals = instance.runtimePortals
   // 宗门传送门是 server_sect 的派生投影，不重复写入实例 overlay 真源。
   .filter((portal) => !(typeof portal.sectId === 'string' && portal.sectId.trim()))
   .map((portal) => ({
    id: portal.id,
    x: portal.x,
    y: portal.y,
    targetMapId: portal.targetMapId,
    targetInstanceId: portal.targetInstanceId ?? null,
    targetX: portal.targetX,
    targetY: portal.targetY,
    targetPortalId: portal.targetPortalId,
    direction: portal.direction,
    kind: portal.kind,
    trigger: portal.trigger,
    hidden: portal.hidden === true,
    name: portal.name,
    char: portal.char,
    color: portal.color,
    sectId: portal.sectId,
   }))
   .sort((left, right) => left.y - right.y || left.x - right.x);
  return [{
   patchKind: 'portal',
   chunkKey: 'runtime_portals',
   patchVersion: instance.getPersistenceRevision(),
   patchPayload: {
    version: 1,
    portals,
   },
  }];
}

export function buildMonsterRuntimePersistenceEntriesImpl(instance: MapInstanceRuntime) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const entries = [];
  for (const monster of instance.monstersByRuntimeId.values()) {
   if (!monster || monster.tier === 'mortal_blood') {
    continue;
   }
   entries.push({
    monsterRuntimeId: monster.runtimeId,
    monsterId: monster.monsterId,
    monsterName: monster.name,
    monsterTier: monster.tier,
    monsterLevel: monster.level,
    tileIndex: instance.toTileIndex(monster.x, monster.y),
    x: monster.x,
    y: monster.y,
    hp: monster.hp,
    maxHp: monster.maxHp,
    qi: monster.qi,
    maxQi: monster.maxQi,
    alive: monster.alive === true,
    respawnLeft: monster.respawnLeft,
    respawnTicks: monster.respawnTicks,
    aggroTargetPlayerId: monster.aggroTargetPlayerId ?? null,
    statePayload: {
     qi: monster.qi,
     maxQi: monster.maxQi,
     attackReadyTick: monster.attackReadyTick,
     cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId ?? {},
     damageContributors: monster.damageContributors ?? {},
     buffs: Array.isArray(monster.buffs) ? monster.buffs : [],
     engaged: monster.engaged ?? !instance.isDungeonInstance(),
     speechTicksLeft: monster.speechTicksLeft ?? 0,
    },
   });
  }
  entries.sort((left, right) => left.monsterRuntimeId.localeCompare(right.monsterRuntimeId, 'zh-Hans-CN'));
  return entries;
}

export function buildMonsterRuntimePersistenceDeltaImpl(instance: MapInstanceRuntime, flushSnapshot = null) {
  const dirtyMonsterRuntimeIds = flushSnapshot?.dirtyMonsterRuntimeIds instanceof Set
   ? flushSnapshot.dirtyMonsterRuntimeIds
   : instance.dirtyMonsterRuntimeIds;
  const dirtyIds = dirtyMonsterRuntimeIds instanceof Set
   ? Array.from(dirtyMonsterRuntimeIds.values())
    .filter((runtimeId): runtimeId is string => typeof runtimeId === 'string' && runtimeId.trim().length > 0)
    .map((runtimeId) => runtimeId.trim())
   : [];
  const fullReplaceDomains = flushSnapshot?.fullReplaceDomains instanceof Set
   ? flushSnapshot.fullReplaceDomains
   : instance.persistenceFullReplaceDomains;
  const fullReplace = fullReplaceDomains?.has?.('monster_runtime') === true
   || (dirtyIds.length === 0 && instance.getDirtyDomains().has('monster_runtime'));
  if (fullReplace) {
   return { fullReplace: true, upserts: [], deletes: [] };
  }
  const upserts = [];
  const deletes = [];
  for (const runtimeId of new Set(dirtyIds).values()) {
   const monster = instance.monstersByRuntimeId.get(runtimeId);
   if (!monster || monster.tier === 'mortal_blood') {
    deletes.push(runtimeId);
    continue;
   }
   upserts.push({
    monsterRuntimeId: monster.runtimeId,
    monsterId: monster.monsterId,
    monsterName: monster.name,
    monsterTier: monster.tier,
    monsterLevel: monster.level,
    tileIndex: instance.toTileIndex(monster.x, monster.y),
    x: monster.x,
    y: monster.y,
    hp: monster.hp,
    maxHp: monster.maxHp,
    qi: monster.qi,
    maxQi: monster.maxQi,
    alive: monster.alive === true,
    respawnLeft: monster.respawnLeft,
    respawnTicks: monster.respawnTicks,
    aggroTargetPlayerId: monster.aggroTargetPlayerId ?? null,
    statePayload: {
     qi: monster.qi,
     maxQi: monster.maxQi,
     attackReadyTick: monster.attackReadyTick,
     cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId ?? {},
     damageContributors: monster.damageContributors ?? {},
     buffs: Array.isArray(monster.buffs) ? monster.buffs : [],
     engaged: monster.engaged ?? !instance.isDungeonInstance(),
     speechTicksLeft: monster.speechTicksLeft ?? 0,
    },
   });
  }
  upserts.sort((left, right) => left.monsterRuntimeId.localeCompare(right.monsterRuntimeId, 'zh-Hans-CN'));
  deletes.sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  return { fullReplace: false, upserts, deletes };
}

export function isPersistentDirtyImpl(instance: MapInstanceRuntime) {
  return instance.getDirtyDomains().size > 0;
}

export function getPersistenceRevisionImpl(instance: MapInstanceRuntime) {
  return instance.persistentRevision;
}

export function getPersistenceDomainRevisionImpl(instance: MapInstanceRuntime, domain) {
  const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
  return normalizedDomain
   ? Math.max(0, Math.trunc(Number(instance.persistenceDomainRevisionByDomain.get(normalizedDomain) ?? 0)))
   : 0;
}

export function getStagedPersistenceDomainRevisionImpl(instance: MapInstanceRuntime, domain, stagingGenerationId) {
  const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
  const normalizedGenerationId = typeof stagingGenerationId === 'string' ? stagingGenerationId.trim() : '';
  if (!normalizedDomain || !normalizedGenerationId) {
   return 0;
  }
  if (!(instance.persistenceStagingGenerationByDomain instanceof Map)
   || instance.persistenceStagingGenerationByDomain.get(normalizedDomain) !== normalizedGenerationId) {
   return 0;
  }
  return Math.max(
   0,
   Math.trunc(Number(instance.stagedPersistenceDomainRevisionByDomain?.get?.(normalizedDomain) ?? 0)),
  );
}

export function capturePersistenceDomainFlushSnapshotImpl(instance: MapInstanceRuntime, domains) {
  const normalizedDomains = new Set((Array.isArray(domains) ? domains : [])
   .map((domain) => typeof domain === 'string' ? domain.trim() : '')
   .filter(Boolean));
  const domainRevisions = new Map();
  for (const domain of normalizedDomains) {
   domainRevisions.set(
    domain,
    Math.max(0, Math.trunc(Number(instance.persistenceDomainRevisionByDomain.get(domain) ?? 0))),
   );
  }
  const dirtyTileResourceByKey = new Map();
  if (normalizedDomains.has('tile_resource') && instance.dirtyTileResourceByKey instanceof Map) {
   for (const [resourceKey, tileIndices] of instance.dirtyTileResourceByKey.entries()) {
    dirtyTileResourceByKey.set(resourceKey, new Set(tileIndices instanceof Set ? tileIndices : []));
   }
  }
  return {
   persistenceRevision: Math.max(0, Math.trunc(Number(instance.persistentRevision) || 0)),
   domainRevisions,
   fullReplaceDomains: new Set(Array.from(normalizedDomains)
    .filter((domain) => instance.persistenceFullReplaceDomains?.has?.(domain) === true)),
   dirtyTileResourceByKey,
   dirtyTileDamageIndices: normalizedDomains.has('tile_damage')
    ? new Set(instance.dirtyTileDamageIndices instanceof Set ? instance.dirtyTileDamageIndices : [])
    : new Set(),
   dirtyGroundItemTileIndices: normalizedDomains.has('ground_item')
    ? new Set(instance.dirtyGroundItemTileIndices instanceof Set ? instance.dirtyGroundItemTileIndices : [])
    : new Set(),
   dirtyMonsterRuntimeIds: normalizedDomains.has('monster_runtime')
    ? new Set(instance.dirtyMonsterRuntimeIds instanceof Set ? instance.dirtyMonsterRuntimeIds : [])
    : new Set(),
  };
}

export function markPersistenceDomainsStagedImpl(instance: MapInstanceRuntime, domains, flushSnapshot = null, stagingGenerationId = '') {
  const normalizedGenerationId = typeof stagingGenerationId === 'string' ? stagingGenerationId.trim() : '';
  if (!normalizedGenerationId) {
   return;
  }
  if (!(instance.stagedPersistenceDomainRevisionByDomain instanceof Map)) {
   instance.stagedPersistenceDomainRevisionByDomain = new Map();
  }
  if (!(instance.persistenceStagingGenerationByDomain instanceof Map)) {
   instance.persistenceStagingGenerationByDomain = new Map();
  }
  for (const domain of Array.isArray(domains) ? domains : []) {
   const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
   if (!normalizedDomain) {
    continue;
   }
   const capturedRevision = flushSnapshot?.domainRevisions instanceof Map
    ? Math.max(0, Math.trunc(Number(flushSnapshot.domainRevisions.get(normalizedDomain) ?? 0)))
    : instance.getPersistenceDomainRevision(normalizedDomain);
   if (capturedRevision <= 0) {
    continue;
   }
   const currentRevision = instance.getPersistenceDomainRevision(normalizedDomain);
   if (currentRevision === capturedRevision) {
    // ledger 每个实例域只保留最新 payload。这里只移交调度义务，不能清掉增量脏键：
    // 若落库前同域再次变化，下一版 payload 必须携带“上一版未落库键 + 新键”的累计后态，
    // 才能安全覆盖 ledger 中的旧 payload。
    instance.getDirtyDomains().delete(normalizedDomain);
    instance.dirtyDomainFirstMarkedAt?.delete?.(normalizedDomain);
    instance.dirtyDomainHighPriority?.delete?.(normalizedDomain);
   }
   const previousRevision = instance.persistenceStagingGenerationByDomain.get(normalizedDomain) === normalizedGenerationId
    ? Math.max(0, Math.trunc(Number(instance.stagedPersistenceDomainRevisionByDomain.get(normalizedDomain) ?? 0)))
    : 0;
   instance.stagedPersistenceDomainRevisionByDomain.set(
    normalizedDomain,
    Math.max(previousRevision, capturedRevision),
   );
   instance.persistenceStagingGenerationByDomain.set(normalizedDomain, normalizedGenerationId);
  }
}

export function getDirtyDomainsImpl(instance: MapInstanceRuntime) {
  return instance.dirtyDomains instanceof Set ? instance.dirtyDomains : createMapInstanceDirtyDomainSet();
}

export function markPersistenceDirtyDomainsImpl(instance: MapInstanceRuntime, domains) {
  markMapInstanceDirtyDomains(instance, domains);
  markMapInstancePersistenceFullReplaceDomains(instance, domains);
}

export function markPersistenceDirtyDomainsHighPriorityImpl(instance: MapInstanceRuntime, domains) {
  markMapInstanceDirtyDomains(instance, domains);
  markMapInstancePersistenceFullReplaceDomains(instance, domains);
  markMapInstanceDirtyDomainHighPriority(instance, domains);
}

export function markTileResourcePersistenceDirtyImpl(instance: MapInstanceRuntime, resourceKey, tileIndex) {
  markMapInstanceDirtyDomains(instance, ['tile_resource']);
  addTileResourceDirtyKey(instance, resourceKey, tileIndex);
  instance.markStaticTileSyncDirtyByIndex(tileIndex);
}

export function markTileResourcePersistenceDirtyHighPriorityImpl(instance: MapInstanceRuntime, resourceKey, tileIndex) {
  markMapInstanceDirtyDomains(instance, ['tile_resource']);
  markMapInstanceDirtyDomainHighPriority(instance, ['tile_resource']);
  addTileResourceDirtyKey(instance, resourceKey, tileIndex);
  instance.markStaticTileSyncDirtyByIndex(tileIndex);
}

export function markTileDamagePersistenceDirtyImpl(instance: MapInstanceRuntime, tileIndex) {
  markMapInstanceDirtyDomains(instance, ['tile_damage']);
  if (!(instance.dirtyTileDamageIndices instanceof Set)) {
   instance.dirtyTileDamageIndices = new Set();
  }
  addNumericDirtyKey(instance.dirtyTileDamageIndices, tileIndex);
  instance.markStaticTileSyncDirtyByIndex(tileIndex);
}

export function markTileDamagePersistenceDirtyHighPriorityImpl(instance: MapInstanceRuntime, tileIndex) {
  markMapInstanceDirtyDomains(instance, ['tile_damage']);
  markMapInstanceDirtyDomainHighPriority(instance, ['tile_damage']);
  if (!(instance.dirtyTileDamageIndices instanceof Set)) {
   instance.dirtyTileDamageIndices = new Set();
  }
  addNumericDirtyKey(instance.dirtyTileDamageIndices, tileIndex);
  instance.markStaticTileSyncDirtyByIndex(tileIndex);
}

export function markTileDamagePersistenceDirtyBatchHighPriorityImpl(instance: MapInstanceRuntime, tileIndices: ReadonlySet<number>) {
  if (!(tileIndices instanceof Set) || tileIndices.size === 0) {
   return;
  }
  markMapInstanceDirtyDomains(instance, ['tile_damage']);
  markMapInstanceDirtyDomainHighPriority(instance, ['tile_damage']);
  if (!(instance.dirtyTileDamageIndices instanceof Set)) {
   instance.dirtyTileDamageIndices = new Set();
  }
  for (const tileIndex of tileIndices) {
   addNumericDirtyKey(instance.dirtyTileDamageIndices, tileIndex);
  }
}

export function markStaticTileSyncDirtyByIndexImpl(instance: MapInstanceRuntime, tileIndexInput, options = undefined) {
  const tileIndex = Math.trunc(Number(tileIndexInput));
  if (!Number.isFinite(tileIndex) || tileIndex < 0 || tileIndex >= instance.tilePlane.getCellCount()) {
   return false;
  }
  if (!(instance.staticTileSyncDirtyTileKeys instanceof Set)) {
   instance.staticTileSyncDirtyTileKeys = new Set();
  }
  if (instance.staticTileSyncDirtyTileKeys.size === 0) {
   instance.staticTileSyncDirtyFromRevision = Math.max(0, Math.trunc(Number(instance.staticTileSyncRevision) || 0));
  }
  const tileX = instance.tilePlane.getX(tileIndex);
  const tileY = instance.tilePlane.getY(tileIndex);
  instance.markAoiViewChangedAt(tileX, tileY, options);
  if (options?.pathingChanged === true) {
   instance.staticPathingRevision = Math.max(0, Math.trunc(Number(instance.staticPathingRevision) || 0)) + 1;
  }
  if (instance.staticTileSyncDirtyTileKeys.has(tileIndex)) {
   instance.staticTileSyncRevision = Math.max(0, Math.trunc(Number(instance.staticTileSyncRevision) || 0)) + 1;
   if (options?.sightBlockingChanged === true) {
    instance.sightBlockingRevision = Math.max(0, Math.trunc(Number(instance.sightBlockingRevision) || 0)) + 1;
   }
   return false;
  }
  instance.staticTileSyncDirtyTileKeys.add(tileIndex);
  instance.staticTileSyncRevision = Math.max(0, Math.trunc(Number(instance.staticTileSyncRevision) || 0)) + 1;
  if (options?.sightBlockingChanged === true) {
   instance.sightBlockingRevision = Math.max(0, Math.trunc(Number(instance.sightBlockingRevision) || 0)) + 1;
  }
  return true;
}

export function getStaticTileSyncRevisionImpl(instance: MapInstanceRuntime) {
  return Math.max(0, Math.trunc(Number(instance.staticTileSyncRevision) || 0));
}

export function getStaticPathingRevisionImpl(instance: MapInstanceRuntime) {
  return Math.max(0, Math.trunc(Number(instance.staticPathingRevision) || 0));
}

export async function runExclusivePersistenceDomainMutationImpl<TResult>(instance: MapInstanceRuntime, 
  domains: readonly string[],
  action: () => Promise<TResult> | TResult,
 ): Promise<TResult> {
  const normalizedDomains = Array.from(new Set((Array.isArray(domains) ? domains : [])
   .map((domain) => typeof domain === 'string' ? domain.trim() : '')
   .filter(Boolean))).sort();
  if (normalizedDomains.length === 0) {
   return await action();
  }
  const activeContext = INSTANCE_PERSISTENCE_DOMAIN_MUTATION_CONTEXT.getStore();
  if (activeContext?.active
   && activeContext.instance === instance
   && normalizedDomains.every((domain) => activeContext.domains.has(domain))) {
   return await action();
  }
  if (activeContext?.active && activeContext.domains.size > 0) {
   throw new Error('instance_persistence_domain_nested_lock_expansion_forbidden');
  }
  const tickets = normalizedDomains.map((domain) => {
   const previous = instance.persistenceDomainMutationQueueByDomain.get(domain) ?? Promise.resolve();
   let release!: () => void;
   const gate = new Promise<void>((resolve) => {
    release = resolve;
   });
   const tail = previous.catch(() => undefined).then(() => gate);
   instance.persistenceDomainMutationQueueByDomain.set(domain, tail);
   return { domain, previous, release, tail };
  });
  await Promise.all(tickets.map((ticket) => ticket.previous.catch(() => undefined)));
  const lockContext = {
   instance: instance,
   domains: new Set(normalizedDomains),
   active: true,
  };
  try {
   return await INSTANCE_PERSISTENCE_DOMAIN_MUTATION_CONTEXT.run(lockContext, action);
  }
  finally {
   lockContext.active = false;
   for (const ticket of tickets) {
    ticket.release();
   }
   for (const ticket of tickets) {
    void ticket.tail.finally(() => {
     if (instance.persistenceDomainMutationQueueByDomain.get(ticket.domain) === ticket.tail) {
      instance.persistenceDomainMutationQueueByDomain.delete(ticket.domain);
     }
    });
   }
  }
}

export function acquirePersistenceDomainHoldImpl(instance: MapInstanceRuntime, domain) {
  const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
  if (!normalizedDomain) {
   return () => undefined;
  }
  const current = Math.max(0, Math.trunc(Number(instance.persistenceDomainHoldCounts.get(normalizedDomain) ?? 0)));
  instance.persistenceDomainHoldCounts.set(normalizedDomain, current + 1);
  let released = false;
  return () => {
   if (released) {
    return;
   }
   released = true;
   const next = Math.max(0, Math.trunc(Number(instance.persistenceDomainHoldCounts.get(normalizedDomain) ?? 0)) - 1);
   if (next <= 0) {
    instance.persistenceDomainHoldCounts.delete(normalizedDomain);
   }
   else {
    instance.persistenceDomainHoldCounts.set(normalizedDomain, next);
   }
  };
}

export function isPersistenceDomainHeldImpl(instance: MapInstanceRuntime, domain) {
  const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
  return normalizedDomain
   ? Math.max(0, Math.trunc(Number(instance.persistenceDomainHoldCounts.get(normalizedDomain) ?? 0))) > 0
   : false;
}

export function consumeStaticTileSyncDirtyTilesImpl(instance: MapInstanceRuntime) {
  const toRevision = instance.getStaticTileSyncRevision();
  if (!(instance.staticTileSyncDirtyTileKeys instanceof Set) || instance.staticTileSyncDirtyTileKeys.size === 0) {
   return { fromRevision: toRevision, toRevision, tileKeys: [] };
  }
  const fromRevision = Math.max(0, Math.trunc(Number(instance.staticTileSyncDirtyFromRevision) || 0));
  const tileKeys = Array.from(instance.staticTileSyncDirtyTileKeys, (tileIndex) => {
   const x = instance.tilePlane.getX(tileIndex);
   const y = instance.tilePlane.getY(tileIndex);
   return `${x},${y}`;
  });
  instance.staticTileSyncDirtyTileKeys.clear();
  instance.staticTileSyncDirtyFromRevision = toRevision;
  return { fromRevision, toRevision, tileKeys };
}

export function markGroundItemPersistenceDirtyImpl(instance: MapInstanceRuntime, tileIndex) {
  markMapInstanceDirtyDomains(instance, ['ground_item']);
  if (!(instance.dirtyGroundItemTileIndices instanceof Set)) {
   instance.dirtyGroundItemTileIndices = new Set();
  }
  addNumericDirtyKey(instance.dirtyGroundItemTileIndices, tileIndex);
  if (Number.isFinite(Number(tileIndex)) && Number(tileIndex) >= 0 && Number(tileIndex) < instance.tilePlane.getCellCount()) {
   const normalizedIndex = Math.trunc(Number(tileIndex));
   instance.markAoiViewChangedAt(instance.tilePlane.getX(normalizedIndex), instance.tilePlane.getY(normalizedIndex));
  }
}

export function markMonsterRuntimePersistenceDirtyImpl(instance: MapInstanceRuntime, runtimeId) {
  markMapInstanceDirtyDomains(instance, ['monster_runtime']);
  if (!(instance.dirtyMonsterRuntimeIds instanceof Set)) {
   instance.dirtyMonsterRuntimeIds = new Set();
  }
  if (typeof runtimeId === 'string' && runtimeId.trim()) {
   const normalizedRuntimeId = runtimeId.trim();
   instance.dirtyMonsterRuntimeIds.add(normalizedRuntimeId);
   const monster = instance.monstersByRuntimeId.get(normalizedRuntimeId);
   if (monster) {
    instance.markAoiViewChangedAt(monster.x, monster.y);
   }
  }
}

export function markPersistenceDomainsPersistedImpl(instance: MapInstanceRuntime, domains, flushSnapshot = null) {
  const dirtyDomains = instance.getDirtyDomains();
  for (const domain of Array.isArray(domains) ? domains : []) {
   if (typeof domain === 'string' && domain.trim()) {
    const normalizedDomain = domain.trim();
    const expectedDomainRevision = flushSnapshot?.domainRevisions instanceof Map
     ? flushSnapshot.domainRevisions.get(normalizedDomain)
     : undefined;
    const currentDomainRevision = Math.max(
     0,
     Math.trunc(Number(instance.persistenceDomainRevisionByDomain.get(normalizedDomain) ?? 0)),
    );
    if (Number.isFinite(Number(expectedDomainRevision))
     && currentDomainRevision !== Math.max(0, Math.trunc(Number(expectedDomainRevision)))) {
     continue;
    }
    dirtyDomains.delete(normalizedDomain);
    clearMapInstancePersistenceDeltaDomain(instance, normalizedDomain);
    // 清除合并窗口追踪状态
    if (instance.dirtyDomainFirstMarkedAt instanceof Map) {
     instance.dirtyDomainFirstMarkedAt.delete(normalizedDomain);
    }
    if (instance.dirtyDomainHighPriority instanceof Set) {
     instance.dirtyDomainHighPriority.delete(normalizedDomain);
    }
   }
  }
  if (dirtyDomains.size === 0) {
   instance.persistedRevision = instance.persistentRevision;
  }
}

export function clearDirtyDomainsImpl(instance: MapInstanceRuntime) {
  clearMapInstanceDirtyDomains(instance);
}

export function getDirtyDomainFirstMarkedAtImpl(instance: MapInstanceRuntime, domain) {
  if (!(instance.dirtyDomainFirstMarkedAt instanceof Map)) {
   return undefined;
  }
  return instance.dirtyDomainFirstMarkedAt.get(domain);
}

export function isDirtyDomainHighPriorityImpl(instance: MapInstanceRuntime, domain) {
  if (!(instance.dirtyDomainHighPriority instanceof Set)) {
   return false;
  }
  return instance.dirtyDomainHighPriority.has(domain);
}

export function markAuraPersistedImpl(instance: MapInstanceRuntime) {
  instance.persistedRevision = instance.persistentRevision;
  instance.clearDirtyDomains();
}

export function updateAuraDirtyStateImpl(instance: MapInstanceRuntime, tileIndex, previous, next) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  instance.applyTileResourceDirtyCounter(DEFAULT_TILE_AURA_RESOURCE_KEY, tileIndex, previous, next);
  instance.markTileResourcePersistenceDirty(DEFAULT_TILE_AURA_RESOURCE_KEY, tileIndex);
  instance.persistentRevision += 1;
}

export function applyTileResourceDirtyCounterImpl(instance: MapInstanceRuntime, resourceKey, tileIndex, previous, next) {
  const baseValue = instance.getTileResourceBaseValueByIndex(resourceKey, tileIndex);
  const previousDirty = !areTileResourceValuesEqual(previous, baseValue);
  const nextDirty = !areTileResourceValuesEqual(next, baseValue);
  if (previousDirty === nextDirty) {
   if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
    instance.changedAuraTileCount = instance.changedTileResourceEntryCountByKey.get(DEFAULT_TILE_AURA_RESOURCE_KEY) ?? instance.changedAuraTileCount;
   }
   return;
  }
  const previousCount = instance.changedTileResourceEntryCountByKey.get(resourceKey) ?? 0;
  const nextCount = nextDirty
   ? previousCount + 1
   : Math.max(0, previousCount - 1);
  if (nextCount > 0) {
   instance.changedTileResourceEntryCountByKey.set(resourceKey, nextCount);
  }
  else {
   instance.changedTileResourceEntryCountByKey.delete(resourceKey);
  }
  if (!previousDirty && nextDirty) {
   instance.changedTileResourceEntryCount += 1;
  }
  else if (previousDirty && !nextDirty) {
   instance.changedTileResourceEntryCount = Math.max(0, instance.changedTileResourceEntryCount - 1);
  }
  if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
   instance.changedAuraTileCount = nextCount;
  }
}

