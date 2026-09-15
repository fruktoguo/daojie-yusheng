/**
 * map-instance.buildings.ts
 *
 * 从 MapInstanceRuntime 抽出的建筑域方法（模式 B 委托壳）。
 * 包含：建筑放置/拆除、房间风水、拓扑重建、建筑持久化辅助、
 * 建筑视野、建筑战斗状态、建筑 HP 恢复等建筑相关逻辑。
 * 所有函数接收 instance: MapInstanceRuntime 作为第一参数，通过委托壳调用。
 */
import type { MapInstanceRuntime } from './map-instance.runtime';
import {
  BUILDING_TOPOLOGY_BLOCKS_MOVE,
  BUILDING_TOPOLOGY_BLOCKS_SIGHT,
  OWNER_ONLY_ACCESS_POLICY,
  StructureType,
  TileType,
  cloneAccessPolicy,
  composeTileTypeFromLayers,
  computeAffectedCellsFromAnchor,
  doesTileTypeBlockSight,
  isTileTypeWalkable,
  resolveDefaultTileLayerFallback,
  resolvePlayerFacingContentName,
  resolveTileLayerSeedFromTileType,
  validateAccessPolicy,
} from '@mud/shared';
import { BuildingTopologyIndex } from '../building/building-topology-index.service';
import {
  createRuntimeTilePlaneRoomCellProvider,
  detectRooms,
  isRoomTopologyTileType,
  isStaticRoomBoundaryTile,
} from '../building/room-detection.service';
import { calculateFengShuiSnapshot, inferRoomRole } from '../building/fengshui-calculator.service';
import { getDefaultBuildingRuntime } from '../building/building-default-content';
import { resolveCompiledBuildingDefinition } from '../building/building-definition-resolution.helpers';
import { findBuildingProtectedPlacementConflict } from '../world/building-protected-placement.helpers';
import {
  applyCompiledBuildingToRoomAggregate,
  buildSkippedBuildingRecord,
  buildingUsesActiveTopology,
  canAttemptTerrainStabilizerHpRecovery,
  chebyshevDistance,
  compiledBuildingAffectsFengShui,
  compiledBuildingAffectsRoomBoundaryTopology,
  countBuildingCellReferences,
  createRoomAggregate,
  freezeRuntimeProjection,
  hasTerrainStabilizerHpRecoveryAt,
  isIndoorSubspaceTemplate,
  isTimeChamberBuildingForRuntime,
  isTreasureVaultBuildingForRuntime,
  iterateBuildingProtectedPlacementPoints,
  markMapInstanceDirtyDomainHighPriority,
  normalizeBuildingDeconstructPreviousState,
  normalizeBuildingId,
  normalizeBuildingRemainingTicks,
  normalizeBuildingRotation,
  normalizeBuildingState,
  resolveBuildingCatalogRevision,
  resolveBuildingCombatTargetName,
  resolveBuildingCombatTargetPriority,
  resolveBuildingCombatTileType,
  resolveBuildingDeconstructionTotalWork,
  resolveBuildingRemainingTicks,
  resolvePersistedBuildingCells,
  resolveTemplateLayerSeed,
  resolveTerrainHpRecoveryAmount,
  rotationToIndex,
  shouldProjectLocalBuilding,
} from './map-instance.runtime.helpers';

type PendingBuildingRoomFengShuiState = {
  topologyDirty: boolean;
  topologyRequestCount: number;
  localRequestCount: number;
  topologyDirtyCellCount: number;
  dirtyCellIndices: Set<number>;
  dirtyRoomIds: Set<string>;
  roomRoleInferenceByRoomId: Map<string, boolean>;
  snapshotRevisionOffsetByRoomId: Map<string, number>;
  latestReason: string;
  highPriorityDomains: Set<string>;
  roomDomainHoldRelease: (() => void) | null;
  fengShuiDomainHoldRelease: (() => void) | null;
};

const SECT_BUILDING_VISUAL_STRUCTURE_TYPES = new Set([
  StructureType.Door,
  StructureType.Window,
]);

const INVALID_OCCUPANCY = 0;

export { SECT_BUILDING_VISUAL_STRUCTURE_TYPES, INVALID_OCCUPANCY };
export type { PendingBuildingRoomFengShuiState };
export function resolveDefaultTileLayerFallbackForCellImpl(instance: MapInstanceRuntime, tileIndexInput = -1, xInput = null, yInput = null) {
  const tileIndex = Math.trunc(Number(tileIndexInput));
  const hasCell = Number.isFinite(tileIndex) && tileIndex >= 0 && tileIndex < instance.tilePlane.getCellCount();
  const x = Number.isFinite(Number(xInput))
   ? Math.trunc(Number(xInput))
   : hasCell
    ? instance.tilePlane.getX(tileIndex)
    : null;
  const y = Number.isFinite(Number(yInput))
   ? Math.trunc(Number(yInput))
   : hasCell
    ? instance.tilePlane.getY(tileIndex)
    : null;
  return resolveDefaultTileLayerFallback({
   mapId: instance.template?.id ?? instance.meta?.mapId ?? null,
   templateId: instance.meta?.templateId ?? instance.template?.id ?? null,
   instanceId: instance.meta?.instanceId ?? null,
   x,
   y,
   routeDomain: instance.meta?.routeDomain ?? null,
   mapKind: instance.template?.source?.sectMap === true ? 'sect' : null,
  });
}

export function applyBuildingVisualTileTypeImpl(instance: MapInstanceRuntime, cellIndex, compiled) {
  if (!compiled?.visualTileType || cellIndex < 0 || cellIndex >= instance.tilePlane.getCellCount()) {
   return false;
  }
  if (compiled.layerId === 1 && typeof instance.tilePlane.setStructureTileType === 'function') {
   return instance.tilePlane.setStructureTileType(cellIndex, compiled.visualTileType);
  }
  if (compiled.layerId === 2 && typeof instance.tilePlane.setSurfaceTileType === 'function') {
   return instance.tilePlane.setSurfaceTileType(cellIndex, compiled.visualTileType);
  }
  return instance.tilePlane.setTileType(cellIndex, compiled.visualTileType);
}

export function captureBuildingPreviousTileStateImpl(instance: MapInstanceRuntime, cellIndex) {
  const tileType = instance.tilePlane.getTileType(cellIndex);
  const layerState = typeof instance.tilePlane.getTileLayerState === 'function'
   ? instance.tilePlane.getTileLayerState(cellIndex)
   : null;
  if (!layerState) {
   return { tileType };
  }
  if (instance.tileDamageByTile.get(cellIndex)?.destroyed === true) {
   return {
    ...instance.getDestroyedTileLayerStateByCellIndex(cellIndex, layerState),
    structureType: null,
   };
  }
  return {
   tileType,
   terrainType: layerState.terrain,
   surfaceType: layerState.surface ?? null,
   structureType: layerState.structure ?? null,
   interactableKinds: Array.isArray(layerState.interactableKinds) ? layerState.interactableKinds.slice() : [],
  };
}

export function restoreBuildingPreviousTileStateImpl(instance: MapInstanceRuntime, cellIndex, previousState) {
  if (cellIndex < 0 || cellIndex >= instance.tilePlane.getCellCount()) {
   return false;
  }
  if (typeof previousState === 'string') {
   return instance.tilePlane.setTileType(cellIndex, previousState);
  }
  const tileType = typeof previousState?.tileType === 'string' && previousState.tileType.trim()
   ? previousState.tileType.trim()
   : TileType.Floor;
  let changed = instance.tilePlane.setTileType(cellIndex, tileType);
  if (typeof previousState?.terrainType === 'string' && previousState.terrainType.trim()) {
   changed = instance.tilePlane.setTerrain(cellIndex, previousState.terrainType.trim()) || changed;
  }
  if (Object.prototype.hasOwnProperty.call(previousState ?? {}, 'surfaceType')) {
   changed = instance.tilePlane.setSurface(cellIndex, typeof previousState.surfaceType === 'string' && previousState.surfaceType.trim() ? previousState.surfaceType.trim() : null) || changed;
  }
  if (Object.prototype.hasOwnProperty.call(previousState ?? {}, 'structureType')) {
   changed = instance.tilePlane.setStructure(cellIndex, typeof previousState.structureType === 'string' && previousState.structureType.trim() ? previousState.structureType.trim() : null) || changed;
  }
  if (Array.isArray(previousState?.interactableKinds) && typeof instance.tilePlane.setInteractableKinds === 'function') {
   changed = instance.tilePlane.setInteractableKinds(cellIndex, previousState.interactableKinds) || changed;
  }
  return changed;
}

export function clearTileDamageForBuildingVisualCellsImpl(instance: MapInstanceRuntime, cells) {
  let changed = false;
  for (const cellIndex of Array.isArray(cells) ? cells : []) {
   if (cellIndex < 0 || cellIndex >= instance.tilePlane.getCellCount()) {
    continue;
   }
   const damage = instance.tileDamageByTile.get(cellIndex);
   if (damage?.destroyed === true) {
    // destroyed 只是有损坏记录时的派生投影；删除记录前必须清掉已被摧毁的底层结构，
    // 否则铺设 floor 只会改 surface，原 stone/wall 会随损坏记录消失而复活并继续阻挡。
    const destroyedState = instance.getDestroyedTileLayerStateByCellIndex(cellIndex);
    instance.tilePlane.setTerrain(cellIndex, destroyedState.terrainType);
    instance.tilePlane.setSurface(cellIndex, destroyedState.surfaceType ?? null);
    instance.tilePlane.setStructure(cellIndex, null);
    if (typeof instance.tilePlane.setInteractableKinds === 'function') {
     instance.tilePlane.setInteractableKinds(cellIndex, destroyedState.interactableKinds);
    }
   }
   if (instance.tileDamageByTile.delete(cellIndex)) {
    instance.markTileDamagePersistenceDirtyHighPriority(cellIndex);
    changed = true;
   }
  }
  return changed;
}

export function configureBuildingRuntimeImpl(instance: MapInstanceRuntime, catalog, fengShuiRules = []) {
  instance.buildingCatalog = catalog ?? null;
  instance.fengShuiRules = Array.isArray(fengShuiRules) ? fengShuiRules : [];
  instance.rebuildBuildingRoomFengShuiState({ reason: 'configure' });
}

export function placeBuildingInstanceImpl(instance: MapInstanceRuntime, input) {
  const catalog = instance.buildingCatalog;
  if (!catalog?.defById) {
   return { ok: false, reason: 'building_catalog_missing' };
  }
  const defId = typeof input?.defId === 'string' ? input.defId.trim() : '';
  const compiled = catalog.defById.get(defId);
  if (!compiled) {
   return { ok: false, reason: 'building_def_not_found' };
  }
  const isTimeChamberInstance = instance.meta.kind === 'time_chamber'
   || String(instance.template?.id ?? '').startsWith('time-chamber-template:');
  if (isTimeChamberInstance && compiled.id === 'time_chamber') {
   return { ok: false, reason: 'time_chamber_nested_forbidden' };
  }
  const x = Math.trunc(Number(input?.x));
  const y = Math.trunc(Number(input?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
   return { ok: false, reason: 'invalid_coordinate' };
  }
  const anchorConflict = findBuildingProtectedPlacementConflict(instance, [{ x, y }]);
  if (anchorConflict.ok !== true) {
   return { ok: false, reason: anchorConflict.reason, x: anchorConflict.x, y: anchorConflict.y };
  }
  const rotation = normalizeBuildingRotation(input?.rotation);
  const footprint = compiled.footprintByRotation[rotationToIndex(rotation)] ?? compiled.footprintByRotation[0];
  const cells = [];
  for (let index = 0; index < footprint.length; index += 2) {
   const cellX = x + footprint[index];
   const cellY = y + footprint[index + 1];
   const cellIndex = instance.toTileIndex(cellX, cellY);
   if (cellIndex < 0) {
    return { ok: false, reason: 'out_of_bounds', x: cellX, y: cellY };
   }
   const cellProtectedConflict = findBuildingProtectedPlacementConflict(instance, [{ x: cellX, y: cellY }]);
   if (cellProtectedConflict.ok !== true) {
    return { ok: false, reason: cellProtectedConflict.reason, x: cellProtectedConflict.x, y: cellProtectedConflict.y };
   }
   if (instance.occupancy[cellIndex] !== INVALID_OCCUPANCY && input?.ignoreOccupancy !== true) {
    return { ok: false, reason: 'occupied', x: cellX, y: cellY };
   }
   if (compiled.layerId === 1 && instance.buildingTopologyIndex?.structureHandleByCell?.[cellIndex] > 0) {
    return { ok: false, reason: 'structure_overlap', x: cellX, y: cellY };
   }
   if (instance.hasBuildingLayerOverlapAtCell(cellIndex, compiled.layerId)) {
    return { ok: false, reason: 'building_layer_overlap', x: cellX, y: cellY };
   }
   if (!instance.isCellIndexWalkable(cellIndex)) {
    return { ok: false, reason: 'tile_not_clear', x: cellX, y: cellY };
   }
   cells.push(cellIndex);
  }
  const buildingId = normalizeBuildingId(input?.buildingId)
   || normalizeBuildingId(input?.requestId)
   || `building:${instance.meta.instanceId}:${instance.tick}:${instance.buildingById.size + 1}`;
  if (instance.buildingById.has(buildingId)) {
   return { ok: true, duplicate: true, building: instance.buildingById.get(buildingId) };
  }
  const state = normalizeBuildingState(input?.state ?? 'active');
  const previousTileTypes = [];
  const usesActiveTopology = buildingUsesActiveTopology({
   state,
   deconstructPreviousState: input?.deconstructPreviousState,
   buildRemainingTicks: input?.buildRemainingTicks,
  });
  const wasInRoomInfluence = usesActiveTopology
   ? cells.some((cellIndex) => instance.isCellInRoomInfluence(cellIndex))
   : false;
  let clearedTileDamage = false;
  if (usesActiveTopology && compiled.visualTileType) {
   for (const cellIndex of cells) {
    previousTileTypes.push([cellIndex, instance.captureBuildingPreviousTileState(cellIndex)]);
   }
   clearedTileDamage = instance.clearTileDamageForBuildingVisualCells(cells);
   for (const cellIndex of cells) {
    instance.applyBuildingVisualTileType(cellIndex, compiled);
    instance.markStaticTileSyncDirtyByIndex(cellIndex, { sightBlockingChanged: true, pathingChanged: true });
   }
  }
  const building = {
   id: buildingId,
   defId: compiled.id,
   defHandle: compiled.handle,
   instanceId: instance.meta.instanceId,
   x,
   y,
   rotation,
   ownerPlayerId: typeof input?.ownerPlayerId === 'string' && input.ownerPlayerId.trim() ? input.ownerPlayerId.trim() : null,
   ownerSectId: typeof input?.ownerSectId === 'string' && input.ownerSectId.trim() ? input.ownerSectId.trim() : null,
   roomId: null,
   hp: Math.max(0, Math.min(Math.max(1, Math.trunc(Number(input?.maxHp ?? compiled.maxHp) || compiled.maxHp)), Math.trunc(Number(input?.hp ?? input?.maxHp ?? compiled.maxHp) || compiled.maxHp))),
   maxHp: Math.max(1, Math.trunc(Number(input?.maxHp ?? compiled.maxHp) || compiled.maxHp)),
   state,
   createdAtTick: instance.tick,
   updatedAtTick: instance.tick,
   revision: 1,
   buildStrength: Number.isFinite(Number(input?.buildStrength)) ? Math.max(1, Math.trunc(Number(input.buildStrength))) : undefined,
   builderSkillLevel: Number.isFinite(Number(input?.builderSkillLevel)) ? Math.max(1, Math.trunc(Number(input.builderSkillLevel))) : undefined,
   buildCompleteTick: state === 'building' && normalizeBuildingId(input?.activeBuilderPlayerId)
    ? Math.max(instance.tick, Math.trunc(Number(input?.buildCompleteTick ?? (instance.tick + normalizeBuildingRemainingTicks(input?.buildRemainingTicks ?? input?.buildStrength, input?.buildStrength)))))
    : undefined,
   buildRemainingTicks: state === 'building'
    ? normalizeBuildingRemainingTicks(input?.buildRemainingTicks ?? input?.buildStrength, input?.buildStrength)
    : undefined,
   activeBuilderPlayerId: state === 'building'
    ? (normalizeBuildingId(input?.activeBuilderPlayerId) || null)
    : null,
   deconstructRemainingTicks: state === 'deconstructing'
    ? normalizeBuildingRemainingTicks(input?.deconstructRemainingTicks, input?.buildStrength)
    : undefined,
   activeDeconstructorPlayerId: state === 'deconstructing'
    ? (normalizeBuildingId(input?.activeDeconstructorPlayerId) || null)
    : null,
   deconstructPreviousState: state === 'deconstructing'
    ? normalizeBuildingDeconstructPreviousState(input?.deconstructPreviousState, input?.buildRemainingTicks)
    : undefined,
  };
  instance.buildingById.set(building.id, building);
  instance.buildingCellsById.set(building.id, cells);
  if (previousTileTypes.length > 0) {
   instance.buildingPreviousTileTypeById.set(building.id, previousTileTypes);
  }
  let dirtyDomains = ['building'];
  if (usesActiveTopology) {
   instance.applyBuildingTopologyForBuilding(building.id);
   if (!compiled.visualTileType && (compiled.topologyMask & (BUILDING_TOPOLOGY_BLOCKS_MOVE | BUILDING_TOPOLOGY_BLOCKS_SIGHT)) !== 0) {
    for (const cellIndex of cells) {
     instance.markStaticTileSyncDirtyByIndex(cellIndex, {
      sightBlockingChanged: Boolean(compiled.topologyMask & BUILDING_TOPOLOGY_BLOCKS_SIGHT),
      pathingChanged: Boolean(compiled.topologyMask & BUILDING_TOPOLOGY_BLOCKS_MOVE),
     });
    }
   }
   const affectsBoundaryTopology = compiledBuildingAffectsRoomBoundaryTopology(compiled);
   const affectsRoofTopology = compiled.roofCoverage > 0;
   const shouldRecalculateRooms = affectsBoundaryTopology
    ? cells.some((cellIndex) => instance.shouldRecalculateRoomsForTileMutation(cellIndex, instance.tilePlane.getTileType(cellIndex), compiled.visualTileType ?? instance.getEffectiveTileTypeByCellIndex(cellIndex)))
    : affectsRoofTopology && wasInRoomInfluence;
   if (shouldRecalculateRooms) {
    instance.markRoomsAndFengShuiDirtyAfterTopologyChange({
     reason: 'place',
     dirtyCellCount: cells.length,
     highPriority: true,
    });
   }
   else if (compiledBuildingAffectsFengShui(compiled) || affectsRoofTopology) {
    for (const cellIndex of cells) {
     instance.markFengShuiDirtyAfterRoomInfluenceChange(cellIndex, 'building_place_fengshui', { highPriority: true });
    }
   }
   if (previousTileTypes.length > 0) {
    dirtyDomains.push('tile_cell');
   }
   if (clearedTileDamage) {
    dirtyDomains.push('tile_damage');
   }
  }
  instance.markAoiViewChangedAt(building.x, building.y);
  instance.worldRevision += 1;
  instance.persistentRevision += 1;
  instance.markPersistenceDirtyDomainsHighPriority(Array.from(new Set(dirtyDomains)));
  return { ok: true, building };
}

export function startBuildingConstructionImpl(instance: MapInstanceRuntime, buildingIdInput, playerIdInput) {
  const buildingId = normalizeBuildingId(buildingIdInput);
  const playerId = normalizeBuildingId(playerIdInput);
  const building = buildingId ? instance.buildingById.get(buildingId) : null;
  if (!building) {
   return { ok: false, reason: 'building_not_found' };
  }
  if (building.state !== 'building') {
   return { ok: false, reason: 'building_not_under_construction' };
  }
  const player = playerId ? instance.playersById.get(playerId) : null;
  if (!player) {
   return { ok: false, reason: 'player_not_found' };
  }
  if (chebyshevDistance(player.x, player.y, building.x, building.y) > 1) {
   return { ok: false, reason: 'building_too_far' };
  }
  let changed = false;
  for (const entry of instance.buildingById.values()) {
   if (entry?.state !== 'building' || entry.id === building.id) {
    continue;
   }
   if (entry.activeBuilderPlayerId === playerId) {
    entry.activeBuilderPlayerId = null;
    entry.buildCompleteTick = undefined;
    entry.updatedAtTick = instance.tick;
    entry.revision = Math.max(1, Math.trunc(Number(entry.revision) || 1)) + 1;
    instance.markAoiViewChangedAt(entry.x, entry.y);
    changed = true;
   }
  }
  if (building.activeBuilderPlayerId === playerId) {
   return { ok: true, building, changed };
  }
  building.activeBuilderPlayerId = playerId;
  building.buildCompleteTick = instance.tick + resolveBuildingRemainingTicks(building);
  building.updatedAtTick = instance.tick;
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  changed = true;
  if (changed) {
   instance.markAoiViewChangedAt(building.x, building.y);
   instance.worldRevision += 1;
   instance.persistentRevision += 1;
   instance.markPersistenceDirtyDomainsHighPriority(['building']);
  }
  return { ok: true, building, changed };
}

export function stopBuildingConstructionImpl(instance: MapInstanceRuntime, buildingIdInput, playerIdInput) {
  const buildingId = normalizeBuildingId(buildingIdInput);
  const playerId = normalizeBuildingId(playerIdInput);
  const building = buildingId ? instance.buildingById.get(buildingId) : null;
  if (!building) {
   return { ok: false, reason: 'building_not_found' };
  }
  if (building.state !== 'building') {
   return { ok: false, reason: 'building_not_under_construction' };
  }
  if (!building.activeBuilderPlayerId || (playerId && building.activeBuilderPlayerId !== playerId)) {
   return { ok: true, building, changed: false };
  }
  building.activeBuilderPlayerId = null;
  building.buildCompleteTick = undefined;
  building.updatedAtTick = instance.tick;
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  instance.markAoiViewChangedAt(building.x, building.y);
  instance.worldRevision += 1;
  instance.persistentRevision += 1;
  instance.markPersistenceDirtyDomainsHighPriority(['building']);
  return { ok: true, building, changed: true };
}

export function startBuildingDeconstructionImpl(instance: MapInstanceRuntime, buildingIdInput, playerIdInput, totalTicksInput) {
  const buildingId = normalizeBuildingId(buildingIdInput);
  const playerId = normalizeBuildingId(playerIdInput);
  const building = buildingId ? instance.buildingById.get(buildingId) : null;
  if (!building) {
   return { ok: false, reason: 'building_not_found' };
  }
  const player = playerId ? instance.playersById.get(playerId) : null;
  if (!player) {
   return { ok: false, reason: 'player_not_found' };
  }
  if (chebyshevDistance(player.x, player.y, building.x, building.y) > 1) {
   return { ok: false, reason: 'building_too_far' };
  }
  if (building.state === 'deconstructing') {
   if (building.activeDeconstructorPlayerId === playerId) {
    return { ok: true, building, changed: false };
   }
   return { ok: false, reason: 'building_deconstructing' };
  }
  if (building.state === 'destroyed' || building.state === 'planned') {
   return { ok: false, reason: 'building_deconstruct_unavailable' };
  }
  const totalTicks = Math.max(1, Number((Number(totalTicksInput) || 1).toFixed(6)));
  building.deconstructPreviousState = normalizeBuildingDeconstructPreviousState(building.state, building.buildRemainingTicks);
  building.state = 'deconstructing';
  building.deconstructRemainingTicks = totalTicks;
  building.activeDeconstructorPlayerId = playerId;
  building.activeBuilderPlayerId = null;
  building.buildCompleteTick = undefined;
  building.updatedAtTick = instance.tick;
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  instance.localBuildingViewCacheById.delete(building.id);
  instance.markAoiViewChangedAt(building.x, building.y);
  instance.worldRevision += 1;
  instance.persistentRevision += 1;
  instance.markPersistenceDirtyDomainsHighPriority(['building']);
  return { ok: true, building, changed: true };
}

export function stopBuildingDeconstructionImpl(instance: MapInstanceRuntime, buildingIdInput, playerIdInput) {
  const buildingId = normalizeBuildingId(buildingIdInput);
  const playerId = normalizeBuildingId(playerIdInput);
  const building = buildingId ? instance.buildingById.get(buildingId) : null;
  if (!building) {
   return { ok: false, reason: 'building_not_found' };
  }
  if (building.state !== 'deconstructing') {
   return { ok: true, building, changed: false };
  }
  if (playerId && building.activeDeconstructorPlayerId !== playerId) {
   return { ok: true, building, changed: false };
  }
  building.state = normalizeBuildingDeconstructPreviousState(
   building.deconstructPreviousState,
   building.buildRemainingTicks,
  );
  building.deconstructRemainingTicks = undefined;
  building.activeDeconstructorPlayerId = null;
  building.deconstructPreviousState = undefined;
  building.updatedAtTick = instance.tick;
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  instance.localBuildingViewCacheById.delete(building.id);
  instance.markAoiViewChangedAt(building.x, building.y);
  instance.worldRevision += 1;
  instance.persistentRevision += 1;
  instance.markPersistenceDirtyDomainsHighPriority(['building']);
  return { ok: true, building, changed: true };
}

export function updateBuildingAccessPolicyStateImpl(instance: MapInstanceRuntime, buildingIdInput, slotInput, policyInput, expectedRevisionInput) {
  const buildingId = normalizeBuildingId(buildingIdInput);
  const slot = normalizeBuildingId(slotInput);
  const expectedRevision = Math.trunc(Number(expectedRevisionInput) || 0);
  const building = buildingId ? instance.buildingById.get(buildingId) : null;
  if (!building || !slot || expectedRevision <= 0) {
   return { ok: false, reason: 'access_policy_resource_not_found' };
  }
  const next = validateAccessPolicy(policyInput, { requireResolvedPlayers: true });
  if (!next.ok || !next.policy || next.policy.revision !== expectedRevision + 1) {
   return { ok: false, reason: 'access_policy_invalid' };
  }
  const currentRaw = building.accessPolicies && typeof building.accessPolicies === 'object'
   ? building.accessPolicies[slot]
   : undefined;
  const current = currentRaw === undefined
   ? null
   : validateAccessPolicy(currentRaw, { requireResolvedPlayers: true });
  if (current && (!current.ok || !current.policy)) {
   return { ok: false, reason: 'access_policy_invalid' };
  }
  const currentRevision = current?.policy?.revision ?? 1;
  if (currentRevision !== expectedRevision) {
   return { ok: false, reason: 'access_policy_revision_conflict' };
  }
  building.accessPolicies = {
   ...(building.accessPolicies ?? {}),
   [slot]: cloneAccessPolicy(next.policy),
  };
  building.updatedAtTick = Math.max(0, Math.trunc(Number(instance.tick) || 0));
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  instance.localBuildingViewCacheById.delete(building.id);
  instance.markAoiViewChangedAt(building.x, building.y);
  instance.worldRevision += 1;
  instance.persistentRevision += 1;
  instance.markPersistenceDirtyDomainsHighPriority(['building']);
  return { ok: true, building, changed: true };
}

export function deconstructBuildingInstanceImpl(instance: MapInstanceRuntime, buildingIdInput, options: { treasureVaultRecovered?: boolean; timeChamberReleased?: boolean } = {}) {
  const buildingId = normalizeBuildingId(buildingIdInput);
  if (!buildingId || !instance.buildingById.has(buildingId)) {
   return { ok: false, reason: 'building_not_found' };
  }
  const building = instance.buildingById.get(buildingId);
  const compiled = resolveCompiledBuildingDefinition(instance.buildingCatalog, building);
  if (isTreasureVaultBuildingForRuntime(compiled, building) && options?.treasureVaultRecovered !== true) {
   return { ok: false, reason: 'treasure_vault_recovery_required' };
  }
  if (isTimeChamberBuildingForRuntime(compiled, building) && options?.timeChamberReleased !== true) {
   return { ok: false, reason: 'time_chamber_release_required' };
  }
  const changedCells = (instance.buildingCellsById.get(buildingId) ?? []).slice();
  const wasInRoomInfluence = changedCells.some((cellIndex) => instance.isCellInRoomInfluence(cellIndex));
  const previousTileTypes = instance.buildingPreviousTileTypeById.get(buildingId) ?? [];
  const sightBlockingChanged = Boolean(compiled?.topologyMask & BUILDING_TOPOLOGY_BLOCKS_SIGHT)
   || (compiled?.visualTileType ? doesTileTypeBlockSight(compiled.visualTileType) : false);
  for (const [cellIndex, previousState] of previousTileTypes) {
   instance.restoreBuildingPreviousTileState(cellIndex, previousState);
  }
  for (const cellIndex of changedCells) {
   instance.markStaticTileSyncDirtyByIndex(cellIndex, {
    sightBlockingChanged,
    pathingChanged: Boolean(compiled?.topologyMask & BUILDING_TOPOLOGY_BLOCKS_MOVE) || previousTileTypes.length > 0,
   });
  }
  instance.buildingPreviousTileTypeById.delete(buildingId);
  instance.buildingById.delete(buildingId);
  // P0-4 entry cache 跟随 entity lifecycle 释放：建筑拆除/完工时清理 view 条目。
  instance.localBuildingViewCacheById.delete(buildingId);
  instance.buildingCellsById.delete(buildingId);
  instance.rebuildBuildingTopologyCells(changedCells);
  const shouldRecalculateRooms = compiled
   ? compiledBuildingAffectsRoomBoundaryTopology(compiled) || (compiled.roofCoverage > 0 && wasInRoomInfluence)
   : changedCells.some((cellIndex) => instance.shouldRecalculateRoomsForTileMutation(cellIndex));
  if (shouldRecalculateRooms) {
   instance.markRoomsAndFengShuiDirtyAfterTopologyChange({
    reason: 'deconstruct',
    dirtyCellCount: changedCells.length,
    highPriority: true,
   });
  }
  else if (compiled && compiledBuildingAffectsFengShui(compiled) && wasInRoomInfluence) {
   for (const cellIndex of changedCells) {
    instance.markFengShuiDirtyAfterRoomInfluenceChange(cellIndex, 'building_deconstruct_fengshui', { highPriority: true });
   }
  }
  instance.markAoiViewChangedAt(building.x, building.y);
  instance.worldRevision += 1;
  instance.persistentRevision += 1;
  instance.markPersistenceDirtyDomainsHighPriority([
   'building',
   ...(previousTileTypes.length > 0 ? ['tile_cell'] : []),
  ]);
  return { ok: true, buildingId };
}

export function rebuildBuildingRoomFengShuiStateImpl(instance: MapInstanceRuntime, options = {}) {
  const startedAt = Date.now();
  const capacity = Math.max(instance.tilePlane?.getCellCapacity?.() ?? 1, instance.occupancy?.length ?? 1);
  instance.buildingTopologyIndex = new BuildingTopologyIndex(capacity);
  instance.buildingIdByCell.clear();
  const catalog = instance.buildingCatalog;
  if (catalog) {
   for (const [buildingId, building] of instance.buildingById.entries()) {
    if (!building || !buildingUsesActiveTopology(building)) {
     continue;
    }
    const compiled = resolveCompiledBuildingDefinition(catalog, building);
    const cells = instance.buildingCellsById.get(buildingId) ?? [];
    if (!compiled || cells.length === 0) {
     continue;
    }
    instance.buildingTopologyIndex.applyBuildingToCells(compiled, cells);
    for (const cellIndex of cells) {
     let ids = instance.buildingIdByCell.get(cellIndex);
     if (!ids) {
      ids = [];
      instance.buildingIdByCell.set(cellIndex, ids);
     }
     ids.push(buildingId);
    }
   }
  }
  const topologyOptions: any = options;
  const result = instance.recalculateRoomsAndFengShuiAfterTopologyChange({
   reason: topologyOptions?.reason ?? 'full_rebuild',
   fullTopologyRebuild: true,
   dirtyCellCount: instance.buildingIdByCell.size,
   startedAt,
  });
  return { roomCount: result.roomCount, fengShuiCount: result.fengShuiCount, deferredCount: result.deferredCount };
}

export function applyBuildingTopologyForBuildingImpl(instance: MapInstanceRuntime, buildingId) {
  const building = instance.buildingById.get(buildingId);
  const catalog = instance.buildingCatalog;
  const compiled = resolveCompiledBuildingDefinition(catalog, building);
  const cells = instance.buildingCellsById.get(buildingId) ?? [];
  if (!building || !compiled || cells.length === 0 || !buildingUsesActiveTopology(building)) {
   return false;
  }
  instance.buildingTopologyIndex?.applyBuildingToCells(compiled, cells);
  for (const cellIndex of cells) {
   let ids = instance.buildingIdByCell.get(cellIndex);
   if (!ids) {
    ids = [];
    instance.buildingIdByCell.set(cellIndex, ids);
   }
   if (!ids.includes(buildingId)) {
    ids.push(buildingId);
   }
  }
  return true;
}

export function hasBuildingLayerOverlapAtCellImpl(instance: MapInstanceRuntime, cellIndexInput, layerIdInput) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  const layerId = Math.max(0, Math.trunc(Number(layerIdInput) || 0));
  const catalog = instance.buildingCatalog;
  if (!Number.isFinite(cellIndex) || cellIndex < 0 || layerId <= 0 || !catalog) {
   return false;
  }
  const candidateIds = new Set(instance.buildingIdByCell.get(cellIndex) ?? []);
  for (const [buildingId, cells] of instance.buildingCellsById.entries()) {
   if (candidateIds.has(buildingId)) {
    continue;
   }
   if (Array.isArray(cells) && cells.includes(cellIndex)) {
    candidateIds.add(buildingId);
   }
  }
  for (const buildingId of candidateIds) {
   const building = instance.buildingById.get(buildingId);
   if (!building || building.state === 'destroyed') {
    continue;
   }
   const compiled = resolveCompiledBuildingDefinition(catalog, building);
   if (compiled?.layerId === layerId) {
    return true;
   }
  }
  return false;
}

export function rebuildBuildingTopologyCellsImpl(instance: MapInstanceRuntime, cellIndices) {
  const catalog = instance.buildingCatalog;
  if (!instance.buildingTopologyIndex || !catalog) {
   return { repairedCellCount: 0, orphanReferenceCount: 0 };
  }
  let repairedCellCount = 0;
  let orphanReferenceCount = 0;
  const uniqueCells = new Set();
  for (const rawCellIndex of cellIndices ?? []) {
   const cellIndex = Math.trunc(Number(rawCellIndex));
   if (Number.isFinite(cellIndex) && cellIndex >= 0) {
    uniqueCells.add(cellIndex);
   }
  }
  for (const cellIndex of uniqueCells) {
   instance.buildingTopologyIndex.clearCell(cellIndex);
   const ids = instance.buildingIdByCell.get(cellIndex) ?? [];
   const keptIds = [];
   for (const buildingId of ids) {
    const building = instance.buildingById.get(buildingId);
    if (!building || building.state === 'destroyed') {
     orphanReferenceCount += 1;
     continue;
    }
    const compiled = resolveCompiledBuildingDefinition(catalog, building);
    if (!compiled) {
     orphanReferenceCount += 1;
     continue;
    }
    keptIds.push(buildingId);
    instance.buildingTopologyIndex.applyBuildingToCells(compiled, [cellIndex]);
   }
   if (keptIds.length > 0) {
    instance.buildingIdByCell.set(cellIndex, keptIds);
   }
   else {
    instance.buildingIdByCell.delete(cellIndex);
   }
   repairedCellCount += 1;
  }
  return { repairedCellCount, orphanReferenceCount };
}

export function getOrCreatePendingBuildingRoomFengShuiStateImpl(instance: MapInstanceRuntime, reasonInput) {
  if (instance.pendingBuildingRoomFengShuiState) {
   return instance.pendingBuildingRoomFengShuiState;
  }
  const reason = typeof reasonInput === 'string' && reasonInput.trim()
   ? reasonInput.trim()
   : 'room_fengshui_dirty';
  const pending: PendingBuildingRoomFengShuiState = {
   topologyDirty: false,
   topologyRequestCount: 0,
   localRequestCount: 0,
   topologyDirtyCellCount: 0,
   dirtyCellIndices: new Set(),
   dirtyRoomIds: new Set(),
   roomRoleInferenceByRoomId: new Map(),
   snapshotRevisionOffsetByRoomId: new Map(),
   latestReason: reason,
   highPriorityDomains: new Set(),
   roomDomainHoldRelease: null,
   fengShuiDomainHoldRelease: null,
  };
  instance.pendingBuildingRoomFengShuiState = pending;
  return pending;
}

export function ensurePendingBuildingRoomFengShuiDomainImpl(instance: MapInstanceRuntime, pending, domain, highPriority = false) {
  const holdKey = domain === 'room' ? 'roomDomainHoldRelease' : 'fengShuiDomainHoldRelease';
  if (pending[holdKey] === null) {
   pending[holdKey] = instance.acquirePersistenceDomainHold(domain);
   instance.markPersistenceDirtyDomains([domain]);
  }
  if (highPriority === true && !pending.highPriorityDomains.has(domain)) {
   markMapInstanceDirtyDomainHighPriority(instance, [domain]);
   pending.highPriorityDomains.add(domain);
  }
}

export function releasePendingBuildingRoomFengShuiStateImpl(instance: MapInstanceRuntime, pending) {
  if (!pending || instance.pendingBuildingRoomFengShuiState !== pending) {
   return;
  }
  instance.pendingBuildingRoomFengShuiState = null;
  pending.roomDomainHoldRelease?.();
  pending.fengShuiDomainHoldRelease?.();
  pending.roomDomainHoldRelease = null;
  pending.fengShuiDomainHoldRelease = null;
}

export function markRoomsAndFengShuiDirtyAfterTopologyChangeImpl(instance: MapInstanceRuntime, options: any = {}) {
  const reason = typeof options?.reason === 'string' && options.reason.trim()
   ? options.reason.trim()
   : 'topology_change';
  const pending = instance.getOrCreatePendingBuildingRoomFengShuiState(reason);
  pending.latestReason = reason;
  pending.topologyDirty = true;
  pending.topologyRequestCount += 1;
  pending.topologyDirtyCellCount += Math.max(0, Math.trunc(Number(options?.dirtyCellCount) || 0));
  // 全量拓扑重建覆盖局部房间计划，但保留请求计数供性能归因。
  pending.dirtyRoomIds.clear();
  pending.roomRoleInferenceByRoomId.clear();
  pending.snapshotRevisionOffsetByRoomId.clear();
  const highPriority = options?.highPriority === true;
  instance.ensurePendingBuildingRoomFengShuiDomain(pending, 'room', highPriority);
  instance.ensurePendingBuildingRoomFengShuiDomain(pending, 'fengshui', highPriority);
  return true;
}

export function markFengShuiDirtyAfterRoomInfluenceChangeImpl(instance: MapInstanceRuntime, cellIndexInput, reasonInput = 'room_influence_change', options: any = {}) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  if (!Number.isFinite(cellIndex) || cellIndex < 0) {
   return false;
  }
  const reason = typeof reasonInput === 'string' && reasonInput.trim()
   ? reasonInput.trim()
   : 'room_influence_change';
  const existingPending = instance.pendingBuildingRoomFengShuiState;
  if (existingPending?.topologyDirty === true) {
   existingPending.latestReason = reason;
   existingPending.localRequestCount += 1;
   existingPending.dirtyCellIndices.add(cellIndex);
   instance.ensurePendingBuildingRoomFengShuiDomain(existingPending, 'fengshui', options?.highPriority === true);
   return true;
  }
  const roomIds = instance.collectRoomInfluenceRoomIdsByCell(cellIndex);
  if (roomIds.length === 0) {
   return false;
  }
  const pending = instance.getOrCreatePendingBuildingRoomFengShuiState(reason);
  pending.latestReason = reason;
  pending.localRequestCount += 1;
  pending.dirtyCellIndices.add(cellIndex);
  for (const roomIdInput of roomIds) {
   const roomId = typeof roomIdInput === 'string' ? roomIdInput : '';
   if (!roomId) {
    continue;
   }
   pending.dirtyRoomIds.add(roomId);
   // 同一房间内最后一次变化决定是否重新自动推断角色。
   pending.roomRoleInferenceByRoomId.set(roomId, true);
   pending.snapshotRevisionOffsetByRoomId.set(roomId, 0);
  }
  instance.ensurePendingBuildingRoomFengShuiDomain(pending, 'fengshui', options?.highPriority === true);
  return true;
}

export function markFengShuiDirtyRoomImpl(instance: MapInstanceRuntime, roomIdInput, reasonInput = 'room_change', options: any = {}) {
  const roomId = typeof roomIdInput === 'string' ? roomIdInput.trim() : '';
  if (!roomId || !instance.roomsById.has(roomId)) {
   return false;
  }
  const reason = typeof reasonInput === 'string' && reasonInput.trim()
   ? reasonInput.trim()
   : 'room_change';
  const pending = instance.getOrCreatePendingBuildingRoomFengShuiState(reason);
  pending.latestReason = reason;
  pending.localRequestCount += 1;
  if (pending.topologyDirty !== true) {
   pending.dirtyRoomIds.add(roomId);
   pending.roomRoleInferenceByRoomId.set(roomId, options?.inferRoomRole !== false);
   pending.snapshotRevisionOffsetByRoomId.set(
    roomId,
    Math.max(0, Math.trunc(Number(options?.snapshotRevisionOffset) || 0)),
   );
  }
  const highPriority = options?.highPriority === true;
  if (options?.includeRoomDomain === true) {
   instance.ensurePendingBuildingRoomFengShuiDomain(pending, 'room', highPriority);
  }
  instance.ensurePendingBuildingRoomFengShuiDomain(pending, 'fengshui', highPriority);
  return true;
}

export function hasPendingBuildingRoomFengShuiChangesImpl(instance: MapInstanceRuntime) {
  return instance.pendingBuildingRoomFengShuiState !== null;
}

export function getBuildingRoomFengShuiFinalizeIntervalTicksImpl(instance: MapInstanceRuntime) {
  const speed = Number(instance.tickSpeed);
  return Math.max(1, Math.ceil(Number.isFinite(speed) && speed > 0 ? speed : 1));
}

export function shouldFinalizePendingBuildingRoomFengShuiChangesImpl(instance: MapInstanceRuntime) {
  if (!instance.pendingBuildingRoomFengShuiState) {
   return false;
  }
  const currentTick = Math.max(0, Math.trunc(Number(instance.tick) || 0));
  const lastFinalizeTick = Math.trunc(Number(instance.lastBuildingRoomFengShuiFinalizeTick));
  if (!Number.isFinite(lastFinalizeTick) || lastFinalizeTick < 0 || currentTick < lastFinalizeTick) {
   return true;
  }
  return currentTick - lastFinalizeTick >= instance.getBuildingRoomFengShuiFinalizeIntervalTicks();
}

export function finalizePendingBuildingRoomFengShuiChangesImpl(instance: MapInstanceRuntime) {
  const pending = instance.pendingBuildingRoomFengShuiState;
  if (!pending) {
   return { flushed: false, reason: 'clean' };
  }
  const currentTick = Math.max(0, Math.trunc(Number(instance.tick) || 0));
  if (instance.lastBuildingRoomFengShuiFinalizeTick === currentTick) {
   return { flushed: false, reason: 'already_finalized_this_tick', pending: true };
  }
  if (!instance.shouldFinalizePendingBuildingRoomFengShuiChanges()) {
   const intervalTicks = instance.getBuildingRoomFengShuiFinalizeIntervalTicks();
   const elapsedTicks = Math.max(0, currentTick - instance.lastBuildingRoomFengShuiFinalizeTick);
   return {
    flushed: false,
    reason: 'cadence_wait',
    pending: true,
    remainingTicks: Math.max(1, intervalTicks - elapsedTicks),
   };
  }
  const requestCount = pending.topologyRequestCount + pending.localRequestCount;
  const dirtyCellCount = pending.topologyDirtyCellCount + pending.dirtyCellIndices.size;
  const startedAt = performance.now();
  const mode = pending.topologyDirty ? 'topology' : 'local';
  let roomCount = pending.dirtyRoomIds.size;
  if (pending.topologyDirty) {
   instance.recalculateRoomsAndFengShuiImmediatelyAfterTopologyChange({
    reason: `tick_finalize:${pending.latestReason}`,
    dirtyCellCount,
    requestCount,
    coalescedRequestCount: Math.max(0, requestCount - 1),
    topologyRequestCount: pending.topologyRequestCount,
    localRequestCount: pending.localRequestCount,
   });
   roomCount = instance.roomsById.size;
  }
  else {
   instance.recalculateFengShuiForRoomIdsImmediately(Array.from(pending.dirtyRoomIds), {
    reason: `tick_finalize:${pending.latestReason}`,
    dirtyCellCount,
    requestCount,
    coalescedRequestCount: Math.max(0, requestCount - 1),
    topologyRequestCount: pending.topologyRequestCount,
    localRequestCount: pending.localRequestCount,
    roomRoleInferenceByRoomId: pending.roomRoleInferenceByRoomId,
    snapshotRevisionOffsetByRoomId: pending.snapshotRevisionOffsetByRoomId,
   });
  }
  const durationMs = Math.max(0, performance.now() - startedAt);
  instance.lastBuildingRoomFengShuiFinalizeTick = currentTick;
  instance.releasePendingBuildingRoomFengShuiState(pending);
  return {
   flushed: true,
   mode,
   requestCount,
   coalescedRequestCount: Math.max(0, requestCount - 1),
   topologyRequestCount: pending.topologyRequestCount,
   localRequestCount: pending.localRequestCount,
   dirtyCellCount,
   roomCount,
   durationMs,
  };
}

export function recalculateRoomsAndFengShuiAfterTopologyChangeImpl(instance: MapInstanceRuntime, options: any = {}) {
  const result = instance.recalculateRoomsAndFengShuiImmediatelyAfterTopologyChange(options);
  const pending = instance.pendingBuildingRoomFengShuiState;
  if (pending) {
   instance.releasePendingBuildingRoomFengShuiState(pending);
  }
  return result;
}

export function recalculateRoomsAndFengShuiImmediatelyAfterTopologyChangeImpl(instance: MapInstanceRuntime, options: any = {}) {
  const startedAt = Number.isFinite(Number(options?.startedAt)) ? Number(options.startedAt) : Date.now();
  const catalog = instance.buildingCatalog;
  const provider = createRuntimeTilePlaneRoomCellProvider(instance.tilePlane, instance.buildingTopologyIndex, {
   getEffectiveTileType: (cellIndex) => instance.getEffectiveTileTypeByCellIndex(cellIndex),
   isTopologySuppressed: (cellIndex) => instance.tileDamageByTile.get(cellIndex)?.destroyed === true,
   countEntryTilesAsOpenings: isIndoorSubspaceTemplate(instance.template),
  });
  const detection = detectRooms(provider, {
   instanceId: instance.meta.instanceId,
   topologyRevision: instance.persistentRevision,
   contentRevision: resolveBuildingCatalogRevision(catalog),
   updatedAtTick: instance.tick,
   maxCellsPerRoom: 512,
  });
  instance.buildingRoomDeferredStartCells = detection.deferredStartCells.slice();
  instance.roomsById = new Map();
  instance.roomIdsByHandle = [];
  instance.roomIdByCell = detection.roomIdByCell as Int32Array<ArrayBuffer>;
  instance.roomCellIndicesById = new Map();
  for (let index = 0; index < detection.rooms.length; index += 1) {
   const room = detection.rooms[index];
   instance.roomsById.set(room.id, room);
   instance.roomIdsByHandle[index + 1] = room.id;
  }
  instance.rebuildRoomCellIndices();
  instance.roomAggregatesById = instance.buildRoomAggregates();
  instance.fengShuiByRoomId = new Map();
  for (const room of instance.roomsById.values()) {
   const aggregate = instance.roomAggregatesById.get(room.id);
   if (!aggregate) {
    continue;
   }
   room.role = inferRoomRole(catalog, room, aggregate).role;
   const snapshot = calculateFengShuiSnapshot(room, aggregate, instance.fengShuiRules, {
    instanceId: instance.meta.instanceId,
    updatedAtTick: instance.tick,
    revision: aggregate.aggregateRevision,
   });
   instance.fengShuiByRoomId.set(room.id, snapshot);
  }
  const durationMs = Math.max(0, Date.now() - startedAt);
  const requestCount = Math.max(1, Math.trunc(Number(options?.requestCount) || 1));
  instance.lastBuildingRoomRebuildStats = {
   reason: typeof options?.reason === 'string' && options.reason.trim() ? options.reason.trim() : 'recalculate',
   fullTopologyRebuild: options?.fullTopologyRebuild === true,
   dirtyCellCount: Math.max(0, Math.trunc(Number(options?.dirtyCellCount) || 0)),
   requestCount,
   coalescedRequestCount: Math.max(0, Math.trunc(Number(options?.coalescedRequestCount) || requestCount - 1)),
   topologyRequestCount: Math.max(0, Math.trunc(Number(options?.topologyRequestCount) || 0)),
   localRequestCount: Math.max(0, Math.trunc(Number(options?.localRequestCount) || 0)),
   roomCount: instance.roomsById.size,
   fengShuiCount: instance.fengShuiByRoomId.size,
   deferredCount: instance.buildingRoomDeferredStartCells.length,
   durationMs,
   updatedAtTick: instance.tick,
  };
  return instance.lastBuildingRoomRebuildStats;
}

export function getEffectiveTileTypeByCellIndexImpl(instance: MapInstanceRuntime, cellIndexInput) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  if (!Number.isFinite(cellIndex) || cellIndex < 0) {
   return instance.resolveDefaultTileLayerFallbackForCell(cellIndex).legacyTileType;
  }
  const temporary = instance.temporaryTileByTile.get(cellIndex);
  if (temporary) {
   return temporary.tileType;
  }
  const current = instance.tileDamageByTile.get(cellIndex);
  if (current?.destroyed === true) {
   return instance.getDestroyedTileLayerStateByCellIndex(cellIndex).tileType;
  }
  return instance.tilePlane.getTileType(cellIndex);
}

export function getDestroyedTileLayerStateByCellIndexImpl(instance: MapInstanceRuntime, cellIndexInput, layerStateInput = null) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  const state = layerStateInput
   ?? (Number.isFinite(cellIndex) && cellIndex >= 0 && cellIndex < instance.tilePlane.getCellCount() && typeof instance.tilePlane.getTileLayerState === 'function'
    ? instance.tilePlane.getTileLayerState(cellIndex)
    : null);
  if (!state) {
   const fallback = instance.resolveDefaultTileLayerFallbackForCell(cellIndex);
   return {
    tileType: fallback.legacyTileType,
    terrainType: fallback.terrain,
    surfaceType: fallback.surface,
    interactableKinds: [...fallback.interactables],
   };
  }
  const interactableKinds = Array.isArray(state.interactableKinds) ? state.interactableKinds.slice() : [];
  const groundTileType = composeTileTypeFromLayers(state.terrain, state.surface ?? null, null, interactableKinds);
  if (isTileTypeWalkable(groundTileType) && !doesTileTypeBlockSight(groundTileType)) {
   return {
    tileType: groundTileType,
    terrainType: state.terrain,
    surfaceType: state.surface ?? null,
    interactableKinds,
   };
  }
  const fallback = instance.resolveDefaultTileLayerFallbackForCell(cellIndex);
  return {
   tileType: fallback.legacyTileType,
   terrainType: fallback.terrain,
   surfaceType: fallback.surface,
   interactableKinds: [...fallback.interactables],
  };
}

export function isRoomTopologyCellImpl(instance: MapInstanceRuntime, cellIndexInput, tileTypeInput = null) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  if (!Number.isFinite(cellIndex) || cellIndex < 0) {
   return false;
  }
  if (instance.buildingTopologyIndex?.isRoomBoundary?.(cellIndex) === true) {
   return true;
  }
  if ((instance.buildingTopologyIndex?.roofCoverageByCell?.[cellIndex] ?? 0) > 0) {
   return true;
  }
  const tileType = typeof tileTypeInput === 'string' && tileTypeInput.length > 0
   ? tileTypeInput
   : instance.getEffectiveTileTypeByCellIndex(cellIndex);
  return isRoomTopologyTileType(tileType);
}

export function collectRoomInfluenceRoomIdsByCellImpl(instance: MapInstanceRuntime, cellIndexInput) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  if (!Number.isFinite(cellIndex) || cellIndex < 0) {
   return [];
  }
  const roomIds = new Set();
  const direct = instance.roomIdsByHandle[instance.roomIdByCell?.[cellIndex] ?? 0];
  if (direct) {
   roomIds.add(direct);
  }
  const x = instance.tilePlane.getX(cellIndex);
  const y = instance.tilePlane.getY(cellIndex);
  const candidates = [
   instance.toTileIndex(x + 1, y),
   instance.toTileIndex(x - 1, y),
   instance.toTileIndex(x, y + 1),
   instance.toTileIndex(x, y - 1),
  ];
  for (const candidate of candidates) {
   if (candidate < 0) {
    continue;
   }
   const nearby = instance.roomIdsByHandle[instance.roomIdByCell?.[candidate] ?? 0];
   if (nearby) {
    roomIds.add(nearby);
   }
  }
  return Array.from(roomIds);
}

export function isCellInRoomInfluenceImpl(instance: MapInstanceRuntime, cellIndexInput) {
  return instance.collectRoomInfluenceRoomIdsByCell(cellIndexInput).length > 0;
}

export function shouldRecalculateRoomsForTileMutationImpl(instance: MapInstanceRuntime, cellIndexInput, previousTileType = null, nextTileType = null) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  if (!Number.isFinite(cellIndex) || cellIndex < 0) {
   return false;
  }
  if (instance.isCellInRoomInfluence(cellIndex)) {
   return true;
  }
  return instance.isRoomTopologyCell(cellIndex, previousTileType) || instance.isRoomTopologyCell(cellIndex, nextTileType);
}

export function recalculateFengShuiForRoomIdsImmediatelyImpl(instance: MapInstanceRuntime, roomIdsInput, options: any = {}) {
  const startedAt = performance.now();
  const roomIds = Array.from(new Set((Array.isArray(roomIdsInput) ? roomIdsInput : [])
   .map((roomId) => typeof roomId === 'string' ? roomId.trim() : '')
   .filter((roomId) => roomId && instance.roomsById.has(roomId))));
  const recalculatedAggregates = instance.buildRoomAggregates(roomIds);
  for (const [roomId, aggregate] of recalculatedAggregates.entries()) {
   instance.roomAggregatesById.set(roomId, aggregate);
  }
  const roomRoleInferenceByRoomId = options?.roomRoleInferenceByRoomId instanceof Map
   ? options.roomRoleInferenceByRoomId
   : null;
  const snapshotRevisionOffsetByRoomId = options?.snapshotRevisionOffsetByRoomId instanceof Map
   ? options.snapshotRevisionOffsetByRoomId
   : null;
  for (const roomId of roomIds) {
   const room = instance.roomsById.get(roomId);
   const aggregate = instance.roomAggregatesById.get(roomId);
   if (!room || !aggregate) {
    continue;
   }
   if (roomRoleInferenceByRoomId?.get(roomId) !== false) {
    room.role = inferRoomRole(instance.buildingCatalog, room, aggregate).role;
   }
   const snapshot = calculateFengShuiSnapshot(room, aggregate, instance.fengShuiRules, {
    instanceId: instance.meta.instanceId,
    updatedAtTick: instance.tick,
    revision: aggregate.aggregateRevision + Math.max(0, Math.trunc(Number(snapshotRevisionOffsetByRoomId?.get(roomId)) || 0)),
   });
   instance.fengShuiByRoomId.set(room.id, snapshot);
  }
  const requestCount = Math.max(1, Math.trunc(Number(options?.requestCount) || 1));
  instance.lastBuildingRoomRebuildStats = {
   reason: typeof options?.reason === 'string' && options.reason.trim() ? options.reason.trim() : 'room_influence_change',
   fullTopologyRebuild: false,
   dirtyCellCount: Math.max(0, Math.trunc(Number(options?.dirtyCellCount) || 0)),
   requestCount,
   coalescedRequestCount: Math.max(0, Math.trunc(Number(options?.coalescedRequestCount) || requestCount - 1)),
   topologyRequestCount: Math.max(0, Math.trunc(Number(options?.topologyRequestCount) || 0)),
   localRequestCount: Math.max(0, Math.trunc(Number(options?.localRequestCount) || 0)),
   roomCount: instance.roomsById.size,
   fengShuiCount: instance.fengShuiByRoomId.size,
   deferredCount: instance.buildingRoomDeferredStartCells.length,
   durationMs: Math.max(0, performance.now() - startedAt),
   updatedAtTick: instance.tick,
  };
  return instance.lastBuildingRoomRebuildStats;
}

export function recalculateFengShuiAfterRoomInfluenceChangeImpl(instance: MapInstanceRuntime, cellIndexInput, reason = 'room_influence_change') {
  const roomIds = instance.collectRoomInfluenceRoomIdsByCell(cellIndexInput);
  if (roomIds.length === 0) {
   return false;
  }
  instance.recalculateFengShuiForRoomIdsImmediately(roomIds, {
   reason,
   dirtyCellCount: 1,
   localRequestCount: 1,
  });
  instance.markPersistenceDirtyDomains(['fengshui']);
  return true;
}

export function repairBuildingRoomFengShuiStateImpl(instance: MapInstanceRuntime) {
  const before = {
   buildingCellRefCount: countBuildingCellReferences(instance.buildingIdByCell),
   roomCount: instance.roomsById.size,
   fengShuiCount: instance.fengShuiByRoomId.size,
  };
  const result = instance.rebuildBuildingRoomFengShuiState({ reason: 'gm_repair' });
  const orphanFengShuiCount = Array.from(instance.fengShuiByRoomId.keys()).filter((roomId) => !instance.roomsById.has(roomId)).length;
  instance.markPersistenceDirtyDomainsHighPriority(['room', 'fengshui']);
  return {
   ok: true,
   before,
   after: {
    buildingCellRefCount: countBuildingCellReferences(instance.buildingIdByCell),
    roomCount: instance.roomsById.size,
    fengShuiCount: instance.fengShuiByRoomId.size,
    deferredCount: instance.buildingRoomDeferredStartCells.length,
   },
   orphanFengShuiCount,
   result,
  };
}

export function getBuildingRoomFengShuiAtImpl(instance: MapInstanceRuntime, xInput, yInput) {
  const x = Math.trunc(Number(xInput));
  const y = Math.trunc(Number(yInput));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
   return null;
  }
  const tileIndex = instance.toTileIndex(x, y);
  if (tileIndex < 0) {
   return null;
  }
  const buildingIds = (instance.buildingIdByCell.get(tileIndex) ?? []).slice();
  const roomId = instance.roomIdsByHandle[instance.roomIdByCell[tileIndex]] ?? null;
  return {
   x,
   y,
   tileIndex,
   buildingIds,
   buildings: buildingIds.map((buildingId) => instance.buildingById.get(buildingId)).filter(Boolean),
   room: roomId ? instance.roomsById.get(roomId) ?? null : null,
   fengShui: roomId ? instance.fengShuiByRoomId.get(roomId) ?? null : null,
  };
}

export function rebuildRoomCellIndicesImpl(instance: MapInstanceRuntime) {
  instance.roomCellIndicesById = new Map();
  for (let cellIndex = 0; cellIndex < instance.roomIdByCell.length; cellIndex += 1) {
   const roomId = instance.roomIdsByHandle[instance.roomIdByCell[cellIndex]];
   if (!roomId) {
    continue;
   }
   let cells = instance.roomCellIndicesById.get(roomId);
   if (!cells) {
    cells = [];
    instance.roomCellIndicesById.set(roomId, cells);
   }
   cells.push(cellIndex);
  }
  return instance.roomCellIndicesById;
}

export function buildRoomAggregatesImpl(instance: MapInstanceRuntime, roomIdsInput = null) {
  const selectedRoomIds = Array.isArray(roomIdsInput)
   ? new Set(roomIdsInput.filter((roomId) => typeof roomId === 'string' && roomId.length > 0))
   : null;
  const aggregates = new Map();
  for (const room of instance.roomsById.values()) {
   if (selectedRoomIds && !selectedRoomIds.has(room.id)) {
    continue;
   }
   aggregates.set(room.id, createRoomAggregate(room));
  }
  if (!(instance.roomCellIndicesById instanceof Map) || instance.roomCellIndicesById.size === 0) {
   instance.rebuildRoomCellIndices();
  }
  for (const [roomId, cells] of instance.roomCellIndicesById.entries()) {
   const aggregate = aggregates.get(roomId);
   if (!aggregate) {
    continue;
   }
   for (const cellIndex of cells) {
    aggregate.qiRaw += instance.auraByTile?.[cellIndex] ?? 0;
   }
  }
  for (const [tileIndex, damage] of instance.tileDamageByTile.entries()) {
   if (!damage || damage.destroyed === true) {
    continue;
   }
   const maxHp = Math.max(1, Math.trunc(Number(damage.maxHp) || 1));
   const hp = Math.max(0, Math.min(maxHp, Math.trunc(Number(damage.hp) || maxHp)));
   if (hp >= maxHp) {
    continue;
   }
   const damageRatio = 1 - hp / maxHp;
   const roomIds = instance.collectRoomInfluenceRoomIdsByCell(tileIndex);
   for (const roomId of roomIds) {
    const aggregate = aggregates.get(roomId);
    if (!aggregate) {
     continue;
    }
    aggregate.integrityPenalty += Math.max(1, Math.round(30 * damageRatio));
    aggregate.aggregateRevision += 1;
   }
  }
  const catalog = instance.buildingCatalog;
  if (!catalog) {
   return aggregates;
  }
  const buildingEntries = selectedRoomIds
   ? instance.collectBuildingEntriesForRoomAggregate(selectedRoomIds)
   : Array.from(instance.buildingById.entries());
  for (const [buildingId, building] of buildingEntries) {
   const compiled = resolveCompiledBuildingDefinition(catalog, building);
   if (!compiled) {
    continue;
   }
   const roomId = instance.resolveBuildingRoomId(buildingId);
   if (!roomId) {
    continue;
   }
   const aggregate = aggregates.get(roomId);
   if (!aggregate) {
    continue;
   }
   applyCompiledBuildingToRoomAggregate(aggregate, compiled, catalog);
   building.roomId = roomId;
  }
  return aggregates;
}

export function collectBuildingEntriesForRoomAggregateImpl(instance: MapInstanceRuntime, roomIds) {
  const selectedRoomIds = roomIds instanceof Set
   ? roomIds
   : new Set(Array.isArray(roomIds) ? roomIds : []);
  const buildingIds = new Set();
  const visitedCells = new Set();
  for (const roomId of selectedRoomIds) {
   const cells = instance.roomCellIndicesById.get(roomId) ?? [];
   for (const cellIndex of cells) {
    instance.collectBuildingIdsAtCellForAggregate(cellIndex, buildingIds, visitedCells);
    const x = instance.tilePlane.getX(cellIndex);
    const y = instance.tilePlane.getY(cellIndex);
    instance.collectBuildingIdsAtCellForAggregate(instance.toTileIndex(x + 1, y), buildingIds, visitedCells);
    instance.collectBuildingIdsAtCellForAggregate(instance.toTileIndex(x - 1, y), buildingIds, visitedCells);
    instance.collectBuildingIdsAtCellForAggregate(instance.toTileIndex(x, y + 1), buildingIds, visitedCells);
    instance.collectBuildingIdsAtCellForAggregate(instance.toTileIndex(x, y - 1), buildingIds, visitedCells);
   }
  }
  const entries = [];
  for (const buildingId of buildingIds) {
   const building = instance.buildingById.get(buildingId);
   if (building) {
    entries.push([buildingId, building]);
   }
  }
  return entries;
}

export function collectBuildingIdsAtCellForAggregateImpl(instance: MapInstanceRuntime, cellIndexInput, buildingIds, visitedCells) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  if (!Number.isFinite(cellIndex) || cellIndex < 0 || visitedCells.has(cellIndex)) {
   return;
  }
  visitedCells.add(cellIndex);
  const ids = instance.buildingIdByCell.get(cellIndex);
  if (!Array.isArray(ids)) {
   return;
  }
  for (const buildingId of ids) {
   buildingIds.add(buildingId);
  }
}

export function resolveBuildingRoomIdImpl(instance: MapInstanceRuntime, buildingId) {
  const cells = instance.buildingCellsById.get(buildingId) ?? [];
  for (const cellIndex of cells) {
   const direct = instance.roomIdsByHandle[instance.roomIdByCell[cellIndex]];
   if (direct) {
    return direct;
   }
  }
  for (const cellIndex of cells) {
   const x = instance.tilePlane.getX(cellIndex);
   const y = instance.tilePlane.getY(cellIndex);
   const candidates = [
    instance.toTileIndex(x + 1, y),
    instance.toTileIndex(x - 1, y),
    instance.toTileIndex(x, y + 1),
    instance.toTileIndex(x, y - 1),
   ];
   for (const candidate of candidates) {
    const nearby = candidate >= 0 ? instance.roomIdsByHandle[instance.roomIdByCell[candidate]] : null;
    if (nearby) {
     return nearby;
    }
   }
  }
  return null;
}

export function listBuildingSummariesImpl(instance: MapInstanceRuntime) {
  return Array.from(instance.buildingById.values());
}

export function collectExpectedSectBuildingVisualStructuresImpl(instance: MapInstanceRuntime) {
  const expectedStructureByCell = new Map();
  if (instance.template?.source?.sectMap !== true) {
   return expectedStructureByCell;
  }
  for (const building of instance.buildingById.values()) {
   if (!building || !buildingUsesActiveTopology(building)) {
    continue;
   }
   const compiled = resolveCompiledBuildingDefinition(instance.buildingCatalog, building);
   if (!compiled?.visualTileType) {
    continue;
   }
   const visualSeed = resolveTileLayerSeedFromTileType(compiled.visualTileType);
   const structureType = visualSeed?.structure ?? null;
   if (!SECT_BUILDING_VISUAL_STRUCTURE_TYPES.has(structureType)) {
    continue;
   }
   for (const cellIndex of instance.buildingCellsById.get(building.id) ?? []) {
    if (cellIndex >= 0 && cellIndex < instance.tilePlane.getCellCount()) {
     expectedStructureByCell.set(cellIndex, structureType);
    }
   }
  }
  return expectedStructureByCell;
}

export function scanOrphanSectBuildingVisualsImpl(instance: MapInstanceRuntime) {
  const candidates = [];
  if (instance.template?.source?.sectMap !== true
   || !instance.tilePlane
   || typeof instance.tilePlane.getCellCount !== 'function') {
   return {
    eligible: false,
    scannedTileCount: 0,
    expectedVisualCellCount: 0,
    candidates,
   };
  }
  const expectedStructureByCell = instance.collectExpectedSectBuildingVisualStructures();
  const cellCount = instance.tilePlane.getCellCount();
  for (let tileIndex = 0; tileIndex < cellCount; tileIndex += 1) {
   const layerState = instance.tilePlane.getTileLayerState(tileIndex);
   const structureType = layerState?.structure ?? null;
   if (!SECT_BUILDING_VISUAL_STRUCTURE_TYPES.has(structureType)) {
    continue;
   }
   const x = instance.tilePlane.getX(tileIndex);
   const y = instance.tilePlane.getY(tileIndex);
   const inTemplateBounds = x >= 0 && y >= 0 && x < instance.template.width && y < instance.template.height;
   if (inTemplateBounds && resolveTemplateLayerSeed(instance.template, x, y).structure === structureType) {
    continue;
   }
   // 同格只要仍有有效门窗建筑，就交给建筑水合的规范投影逻辑处理，绝不误删。
   if (expectedStructureByCell.has(tileIndex)) {
    continue;
   }
   candidates.push({
    instanceId: instance.meta.instanceId,
    tileIndex,
    x,
    y,
    tileType: layerState?.legacyTileType ?? instance.tilePlane.getTileType(tileIndex),
    structureType,
    hasTileDamage: instance.tileDamageByTile.has(tileIndex),
   });
  }
  return {
   eligible: true,
   scannedTileCount: cellCount,
   expectedVisualCellCount: expectedStructureByCell.size,
   candidates,
  };
}

export function removeOrphanSectBuildingVisualsImpl(instance: MapInstanceRuntime) {
  const scan = instance.scanOrphanSectBuildingVisuals();
  if (scan.candidates.length === 0) {
   return {
    ...scan,
    removedCount: 0,
    clearedTileDamageCount: 0,
   };
  }
  let removedCount = 0;
  let clearedTileDamageCount = 0;
  for (const candidate of scan.candidates) {
   const layerState = instance.tilePlane.getTileLayerState(candidate.tileIndex);
   if (layerState?.structure !== candidate.structureType) {
    continue;
   }
   instance.tilePlane.setStructure(candidate.tileIndex, null);
   if (instance.tileDamageByTile.delete(candidate.tileIndex)) {
    instance.markTileDamagePersistenceDirtyHighPriority(candidate.tileIndex);
    clearedTileDamageCount += 1;
   }
   instance.markStaticTileSyncDirtyByIndex(candidate.tileIndex, {
    sightBlockingChanged: true,
    pathingChanged: true,
   });
   removedCount += 1;
  }
  if (removedCount > 0) {
   instance.recalculateRoomsAndFengShuiAfterTopologyChange({
    reason: 'gm_orphan_sect_building_visual_cleanup',
    dirtyCellCount: removedCount,
   });
   instance.markAoiViewChangedGlobally({ sightBlockingChanged: true });
   instance.worldRevision += 1;
   instance.persistentRevision += 1;
   instance.markPersistenceDirtyDomainsHighPriority([
    'tile_cell',
    'room',
    'fengshui',
    ...(clearedTileDamageCount > 0 ? ['tile_damage'] : []),
   ]);
  }
  return {
   ...scan,
   removedCount,
   clearedTileDamageCount,
  };
}

export function listRoomSummariesImpl(instance: MapInstanceRuntime) {
  return Array.from(instance.roomsById.values());
}

export function getFengShuiSnapshotImpl(instance: MapInstanceRuntime, roomId) {
  const normalized = typeof roomId === 'string' ? roomId.trim() : '';
  return normalized ? instance.fengShuiByRoomId.get(normalized) ?? null : null;
}

export function setRoomRoleImpl(instance: MapInstanceRuntime, roomIdInput, roleInput) {
  const roomId = typeof roomIdInput === 'string' ? roomIdInput.trim() : '';
  const room = roomId ? instance.roomsById.get(roomId) : null;
  const role = typeof roleInput === 'string' && roleInput.trim() ? roleInput.trim() : '';
  if (!room || !role) {
   return { ok: false, reason: 'room_not_found' };
  }
  room.role = role;
  instance.markFengShuiDirtyRoom(room.id, 'room_role_changed', {
   highPriority: true,
   includeRoomDomain: true,
   inferRoomRole: false,
   snapshotRevisionOffset: 1,
  });
  instance.markAoiViewChangedGlobally();
  instance.worldRevision += 1;
  instance.persistentRevision += 1;
  return { ok: true, room: { ...room }, fengShui: instance.fengShuiByRoomId.get(room.id) ?? null };
}

export function getFengShuiSnapshotAtImpl(instance: MapInstanceRuntime, x, y) {
  const tileIndex = instance.toTileIndex(x, y);
  if (tileIndex < 0) {
   return null;
  }
  const roomId = instance.roomIdsByHandle[instance.roomIdByCell[tileIndex]];
  return roomId && instance.roomsById.has(roomId) ? instance.fengShuiByRoomId.get(roomId) ?? null : null;
}

export function getFengShuiLuckAtImpl(instance: MapInstanceRuntime, x, y) {
  const snapshot = instance.getFengShuiSnapshotAt(x, y);
  return snapshot ? Math.trunc((Number(snapshot.score) || 0) / 10) : 0;
}

export function listPrunableVaultBuildingsImpl(instance: MapInstanceRuntime, state) {
  const buildings = Array.isArray(state?.buildings) ? state.buildings : [];
  const vaults = [];
  for (const entry of buildings) {
   const id = normalizeBuildingId(entry?.id ?? entry?.buildingId);
   const defId = normalizeBuildingId(entry?.defId);
   if (!id || !defId) {
    continue;
   }
   const compiled = instance.buildingCatalog?.defById?.get?.(defId);
   if (!isTreasureVaultBuildingForRuntime(compiled, entry)) {
    continue;
   }
   if (instance.buildingCatalog?.defById && !compiled) {
    // 定义已删除的宝库无法恢复运行态，只能摧毁，仍需先返还库存。
    vaults.push(buildSkippedBuildingRecord(id, defId, entry?.ownerPlayerId, 'unknown_def'));
    continue;
   }
   const location = { x: Math.trunc(Number(entry?.x) || 0), y: Math.trunc(Number(entry?.y) || 0), rotation: normalizeBuildingRotation(entry?.rotation) };
   const cells = resolvePersistedBuildingCells(instance, location, entry?.cells, compiled);
   const conflict = findBuildingProtectedPlacementConflict(
    instance,
    iterateBuildingProtectedPlacementPoints(instance, cells, location.x, location.y),
   );
   if (conflict.ok !== true) {
    vaults.push(buildSkippedBuildingRecord(id, defId, entry?.ownerPlayerId, conflict.reason));
   }
  }
  return vaults;
}

export function listPrunableTimeChamberBuildingsImpl(instance: MapInstanceRuntime, state) {
  const buildings = Array.isArray(state?.buildings) ? state.buildings : [];
  const chambers = [];
  for (const entry of buildings) {
   const id = normalizeBuildingId(entry?.id ?? entry?.buildingId);
   const defId = normalizeBuildingId(entry?.defId);
   if (!id || !defId) {
    continue;
   }
   const compiled = instance.buildingCatalog?.defById?.get?.(defId);
   if (!isTimeChamberBuildingForRuntime(compiled, entry)) {
    continue;
   }
   if (instance.buildingCatalog?.defById && !compiled) {
    chambers.push(buildSkippedBuildingRecord(id, defId, entry?.ownerPlayerId, 'unknown_def'));
    continue;
   }
   const location = {
    x: Math.trunc(Number(entry?.x) || 0),
    y: Math.trunc(Number(entry?.y) || 0),
    rotation: normalizeBuildingRotation(entry?.rotation),
   };
   const cells = resolvePersistedBuildingCells(instance, location, entry?.cells, compiled);
   const conflict = findBuildingProtectedPlacementConflict(
    instance,
    iterateBuildingProtectedPlacementPoints(instance, cells, location.x, location.y),
   );
   if (conflict.ok !== true) {
    chambers.push(buildSkippedBuildingRecord(id, defId, entry?.ownerPlayerId, conflict.reason));
   }
  }
  return chambers;
}

export function advanceBuildingConstructionImpl(instance: MapInstanceRuntime) {
  let changed = false;
  for (const building of instance.buildingById.values()) {
   if (building?.state === 'deconstructing') {
    const activeDeconstructorPlayerId = normalizeBuildingId(building.activeDeconstructorPlayerId);
    const activeDeconstructor = activeDeconstructorPlayerId
     ? instance.playersById.get(activeDeconstructorPlayerId)
     : null;
    if (!activeDeconstructor
     || chebyshevDistance(activeDeconstructor.x, activeDeconstructor.y, building.x, building.y) > 1) {
     building.state = normalizeBuildingDeconstructPreviousState(
      building.deconstructPreviousState,
      building.buildRemainingTicks,
     );
     building.deconstructRemainingTicks = undefined;
     building.activeDeconstructorPlayerId = null;
     building.deconstructPreviousState = undefined;
     building.updatedAtTick = instance.tick;
     building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
     instance.localBuildingViewCacheById.delete(building.id);
     changed = true;
    }
    continue;
   }
   if (building?.state !== 'building') {
    continue;
   }
   const activeBuilderPlayerId = normalizeBuildingId(building.activeBuilderPlayerId);
   if (!activeBuilderPlayerId) {
    continue;
   }
   const activeBuilder = instance.playersById.get(activeBuilderPlayerId);
   if (!activeBuilder || chebyshevDistance(activeBuilder.x, activeBuilder.y, building.x, building.y) > 1) {
    building.activeBuilderPlayerId = null;
    building.buildCompleteTick = undefined;
    building.updatedAtTick = instance.tick;
    building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
    changed = true;
    continue;
   }
  }
  if (!changed) {
   return [];
  }
  for (const building of instance.buildingById.values()) {
   if (building?.state === 'building' || building?.state === 'deconstructing') {
    instance.markAoiViewChangedAt(building.x, building.y);
   }
  }
  instance.worldRevision += 1;
  instance.persistentRevision += 1;
  instance.markPersistenceDirtyDomainsHighPriority(['building']);
  return [];
}

export function activatePlacedBuildingTopologyAndVisualImpl(instance: MapInstanceRuntime, building) {
  const compiled = resolveCompiledBuildingDefinition(instance.buildingCatalog, building);
  const cells = building ? (instance.buildingCellsById.get(building.id) ?? []) : [];
  if (!building || !compiled || cells.length === 0) {
   return [];
  }
  const previousTileTypes = [];
  let clearedTileDamage = false;
  const wasInRoomInfluence = cells.some((cellIndex) => instance.isCellInRoomInfluence(cellIndex));
  if (compiled.visualTileType) {
   for (const cellIndex of cells) {
    previousTileTypes.push([cellIndex, instance.captureBuildingPreviousTileState(cellIndex)]);
   }
   clearedTileDamage = instance.clearTileDamageForBuildingVisualCells(cells);
   for (const cellIndex of cells) {
    instance.applyBuildingVisualTileType(cellIndex, compiled);
    instance.markStaticTileSyncDirtyByIndex(cellIndex, { sightBlockingChanged: true, pathingChanged: true });
   }
  }
  if (previousTileTypes.length > 0) {
   instance.buildingPreviousTileTypeById.set(building.id, previousTileTypes);
  }
  instance.applyBuildingTopologyForBuilding(building.id);
  if (!compiled.visualTileType && (compiled.topologyMask & (BUILDING_TOPOLOGY_BLOCKS_MOVE | BUILDING_TOPOLOGY_BLOCKS_SIGHT)) !== 0) {
   for (const cellIndex of cells) {
    instance.markStaticTileSyncDirtyByIndex(cellIndex, {
     sightBlockingChanged: Boolean(compiled.topologyMask & BUILDING_TOPOLOGY_BLOCKS_SIGHT),
     pathingChanged: Boolean(compiled.topologyMask & BUILDING_TOPOLOGY_BLOCKS_MOVE),
    });
   }
  }
  const affectsBoundaryTopology = compiledBuildingAffectsRoomBoundaryTopology(compiled);
  const affectsRoofTopology = compiled.roofCoverage > 0;
  const shouldRecalculateRooms = affectsBoundaryTopology
   ? cells.some((cellIndex) => instance.shouldRecalculateRoomsForTileMutation(cellIndex, instance.tilePlane.getTileType(cellIndex), compiled.visualTileType ?? instance.getEffectiveTileTypeByCellIndex(cellIndex)))
   : affectsRoofTopology && wasInRoomInfluence;
  if (shouldRecalculateRooms) {
   instance.markRoomsAndFengShuiDirtyAfterTopologyChange({
    reason: 'build_complete',
    dirtyCellCount: cells.length,
    highPriority: true,
   });
   return ['building', ...(previousTileTypes.length > 0 ? ['tile_cell'] : []), ...(clearedTileDamage ? ['tile_damage'] : [])];
  }
  if (compiledBuildingAffectsFengShui(compiled) || affectsRoofTopology) {
   for (const cellIndex of cells) {
    instance.markFengShuiDirtyAfterRoomInfluenceChange(cellIndex, 'building_complete_fengshui', { highPriority: true });
   }
   return ['building', ...(previousTileTypes.length > 0 ? ['tile_cell'] : []), ...(clearedTileDamage ? ['tile_damage'] : [])];
  }
  return ['building', ...(previousTileTypes.length > 0 ? ['tile_cell'] : []), ...(clearedTileDamage ? ['tile_damage'] : [])];
}

export function getBuildingsAtTileImpl(instance: MapInstanceRuntime, x, y) {
  if (!instance.isInBounds(x, y)) {
   return [];
  }
  const tileIndex = instance.toTileIndex(x, y);
  const result = [];
  for (const [buildingId, cells] of instance.buildingCellsById.entries()) {
   if (!Array.isArray(cells) || !cells.includes(tileIndex)) {
    continue;
   }
   const building = instance.buildingById.get(buildingId);
   if (!building || building.state === 'destroyed') {
    continue;
   }
   const compiled = resolveCompiledBuildingDefinition(instance.buildingCatalog, building);
   result.push({ building, compiled });
  }
  result.sort((left, right) => String(left.building?.id ?? '').localeCompare(String(right.building?.id ?? ''), 'zh-CN'));
  return result;
}

export function getPrimaryBuildingAtTileImpl(instance: MapInstanceRuntime, x, y) {
  const candidates = instance.getBuildingsAtTile(x, y);
  let selected = null;
  let selectedPriority = -1;
  for (const candidate of candidates) {
   const priority = resolveBuildingCombatTargetPriority(candidate.compiled, candidate.building);
   if (priority > selectedPriority) {
    selected = candidate.building;
    selectedPriority = priority;
   }
  }
  return selected;
}

export function getActiveBuildingCombatStateAtCellIndexImpl(instance: MapInstanceRuntime, cellIndex) {
  const ids = instance.buildingIdByCell.get(cellIndex);
  if (!Array.isArray(ids) || ids.length === 0) {
   return null;
  }
  let selected = null;
  let selectedPriority = -1;
  for (const buildingId of ids) {
   const building = instance.buildingById.get(buildingId);
   if (!building || !buildingUsesActiveTopology(building)) {
    continue;
   }
   const compiled = resolveCompiledBuildingDefinition(instance.buildingCatalog, building);
   if (!compiled) {
    continue;
   }
   const maxHp = Math.max(1, Math.trunc(Number(building.maxHp) || Number(compiled.maxHp) || 1));
   const hp = Math.max(0, Math.min(maxHp, Math.trunc(Number(building.hp) || maxHp)));
   const candidate = {
    buildingId: building.id,
    targetName: resolveBuildingCombatTargetName(building, compiled),
    tileType: resolveBuildingCombatTileType(building, compiled),
    hp,
    maxHp,
    modifiedAt: Number.isFinite(Number(building.updatedAtTick)) ? Math.max(0, Math.trunc(Number(building.updatedAtTick))) : null,
    respawnLeft: 0,
    destroyed: hp <= 0 || building.state === 'destroyed',
    building: true,
   };
   const priority = resolveBuildingCombatTargetPriority(compiled, building);
   if (priority > selectedPriority) {
    selected = candidate;
    selectedPriority = priority;
   }
  }
  return selected;
}

export function advanceBuildingHpRecoveryByTerrainStabilizerImpl(instance: MapInstanceRuntime, terrainStabilizerHpRecoveryChecker) {
  if (instance.buildingById.size === 0 || !canAttemptTerrainStabilizerHpRecovery(terrainStabilizerHpRecoveryChecker)) {
   return false;
  }
  let changed = false;
  const fengShuiInfluenceCells = new Set();
  for (const [buildingId, building] of instance.buildingById.entries()) {
   if (!building || !buildingUsesActiveTopology(building)) {
    continue;
   }
   const compiled = resolveCompiledBuildingDefinition(instance.buildingCatalog, building);
   const maxHp = Math.max(1, Math.trunc(Number(building.maxHp) || Number(compiled?.maxHp) || 1));
   const rawHp = Number(building.hp);
   const hp = Number.isFinite(rawHp)
    ? Math.max(0, Math.min(maxHp, Math.trunc(rawHp)))
    : maxHp;
   if (hp <= 0 || hp >= maxHp) {
    continue;
   }
   const cells = instance.buildingCellsById.get(buildingId);
   if (!Array.isArray(cells) || cells.length === 0) {
    continue;
   }
   let coveredCellIndex = -1;
   for (const cellIndexInput of cells) {
    const cellIndex = Math.trunc(Number(cellIndexInput));
    if (!Number.isFinite(cellIndex) || cellIndex < 0) {
     continue;
    }
    const x = instance.tilePlane.getX(cellIndex);
    const y = instance.tilePlane.getY(cellIndex);
    if (hasTerrainStabilizerHpRecoveryAt(terrainStabilizerHpRecoveryChecker, x, y)) {
     coveredCellIndex = cellIndex;
     break;
    }
   }
   if (coveredCellIndex < 0) {
    continue;
   }
   const nextHp = Math.min(maxHp, hp + resolveTerrainHpRecoveryAmount(maxHp));
   building.hp = nextHp;
   building.maxHp = maxHp;
   building.updatedAtTick = instance.tick;
   building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
   for (const cellIndexInput of cells) {
    const cellIndex = Math.trunc(Number(cellIndexInput));
    if (Number.isFinite(cellIndex) && cellIndex >= 0) {
     instance.markStaticTileSyncDirtyByIndex(cellIndex);
     if (nextHp >= maxHp && instance.isCellInRoomInfluence(cellIndex)) {
      fengShuiInfluenceCells.add(cellIndex);
     }
    }
   }
   instance.markPersistenceDirtyDomains(['building']);
   changed = true;
  }
  if (fengShuiInfluenceCells.size > 0) {
   for (const cellIndex of fengShuiInfluenceCells) {
    instance.markFengShuiDirtyAfterRoomInfluenceChange(cellIndex, 'building_integrity_recovered');
   }
  }
  return changed;
}

export function collectLocalBuildingsImpl(instance: MapInstanceRuntime, centerX, centerY, radius, visibleTileVisibility = null) {
  const visibility = instance.normalizeVisibilityFilter(visibleTileVisibility);
  const buildings = [];
  for (const building of instance.buildingById.values()) {
   const compiled = resolveCompiledBuildingDefinition(instance.buildingCatalog, building);
   if (!shouldProjectLocalBuilding(building, compiled)) {
    continue;
   }
   if (!instance.isTileInsideViewRadius(centerX, centerY, radius, building.x, building.y)) {
    continue;
   }
   if (!instance.isTileVisibleByFilter(building.x, building.y, visibility)) {
    continue;
   }
   buildings.push(instance.getLocalBuildingViewEntry(building, compiled));
  }
  buildings.sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'));
  return buildings;
}

export function getLocalBuildingViewEntryImpl(instance: MapInstanceRuntime, building, compiled) {
  const isUnderConstruction = building?.state === 'building';
  const isUnderDeconstruction = building?.state === 'deconstructing';
  const remainingTicks = isUnderConstruction
   ? resolveBuildingRemainingTicks(building)
   : isUnderDeconstruction
    ? Math.max(0, Math.ceil(Number(building.deconstructRemainingTicks) || 0))
    : undefined;
  const totalTicks = isUnderConstruction
   ? Math.max(remainingTicks ?? 0, Math.trunc(Number(building.buildStrength) || 1), 1)
   : isUnderDeconstruction
    ? Math.max(remainingTicks ?? 0, Math.ceil(resolveBuildingDeconstructionTotalWork(building)), 1)
    : undefined;
  const char = typeof compiled?.glyph === 'string' && compiled.glyph.trim()
   ? compiled.glyph.trim()[0] ?? '筑'
   : (compiled?.name?.trim()?.[0] ?? '筑');
  const color = typeof compiled?.color === 'string' && compiled.color.trim()
   ? compiled.color.trim()
   : '#cbd5e1';
  const name = resolvePlayerFacingContentName(building.defId, '未知建筑', building?.name, compiled?.name);
  const cached = instance.localBuildingViewCacheById.get(building.id);
  if (cached
   && cached.x === building.x
   && cached.y === building.y
   && cached.name === name
   && cached.char === char
   && cached.color === color
   && cached.remainingTicks === remainingTicks
   && cached.totalTicks === totalTicks) {
   return cached;
  }
  const entry = freezeRuntimeProjection({
   id: building.id,
   x: building.x,
   y: building.y,
   name,
   char,
   color,
   remainingTicks,
   totalTicks,
  });
  instance.localBuildingViewCacheById.set(building.id, entry);
  return entry;
}

