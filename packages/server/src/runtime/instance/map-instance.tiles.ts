/**
 * map-instance.tiles.ts
 *
 * 从 MapInstanceRuntime 抽出的地块域方法（模式 B 委托壳）。
 * 包含：地块伤害、临时地块、地形恢复、灵气、地块资源流动、
 * 地面物品、地块查询访问器等地块相关逻辑。
 * 所有函数接收 instance: MapInstanceRuntime 作为第一参数，通过委托壳调用。
 */
import type { MapInstanceRuntime } from './map-instance.runtime';
import {
  DISPERSED_AURA_RESOURCE_KEY,
  MINERAL_CRYSTALS,
  StructureType,
  TileType,
  calculateDispersedAuraGainPerTile,
  composeTileTypeFromLayers,
  computeMineralCrystalDropChance,
  computeMiningDamageDropExpectedCount,
  getLayeredTileTraversalCost,
  getLineCells,
  getTileTraversalCost,
  isOffsetInRange,
  normalizeStructureType,
  rollMiningExpectedDropCount,
} from '@mud/shared';
import {
  applyMapInstanceOrdinaryTileDamageMutation,
  damageMapInstanceTilesBatch,
  type TileDamageBatchInput,
  type TileDropRollOptions,
} from './map-instance-tile-damage-batch.helpers';
import { resolveTileDamageDropMultiplier } from '../world/combat/tile-drop.helpers';
import { INVALID_OCCUPANCY } from './map-instance.buildings';
import { isAbnormalTemporaryTileState } from './map-instance.runtime';
import {
  DEFAULT_TILE_AURA_RESOURCE_KEY,
  TILE_RESOURCE_EPSILON,
  areTileResourceValuesEqual,
  buildGroundItemKey,
  buildGroundSourceId,
  buildingUsesActiveTopology,
  calculateTileRestoreRetryTicks,
  calculateTileRestoreTicks,
  canAttemptTerrainStabilizerHpRecovery,
  chebyshevDistance,
  compareGroundEntries,
  createGroundRuntimeItem,
  getGroundItemExpiresAtTick,
  getTileResourceFlowRate,
  getTileResourceMinimumDecayPerTick,
  hasTerrainStabilizerHpRecoveryAt,
  isNaturalAuraFlowResource,
  mergeGroundItemEntry,
  normalizeGroundRuntimeItemExpiry,
  normalizePersistedGroundItem,
  normalizeTileResourceValue,
  resolveTerrainHpRecoveryAmount,
  resolveTileDurability,
  resolveTileDurabilityProfile,
  snapshotContainer,
  snapshotGroundPile,
  snapshotLandmark,
  snapshotSafeZone,
  toGroundPileView,
} from './map-instance.runtime.helpers';
export function pickFirstAttackableLineTileImpl(instance: MapInstanceRuntime, monster, aim: { x: number; y: number }): { x: number; y: number } | null {
  const maxReach = instance.resolveMonsterMaxAttackReach(monster);
  if (maxReach <= 0) {
   return null;
  }
  const cells = getLineCells(
   { x: Math.trunc(Number(monster.x) || 0), y: Math.trunc(Number(monster.y) || 0) },
   { x: Math.trunc(Number(aim.x) || 0), y: Math.trunc(Number(aim.y) || 0) },
  );
  for (let index = 1; index < cells.length; index += 1) {
   const cell = cells[index];
   if (!cell || !instance.isInBounds(cell.x, cell.y)) {
    continue;
   }
   const distance = chebyshevDistance(monster.x, monster.y, cell.x, cell.y);
   if (distance > maxReach) {
    continue;
   }
   return { x: cell.x, y: cell.y };
  }
  return null;
}

export function addPlayerToTileIndexImpl(instance: MapInstanceRuntime, player) {
  if (!player?.playerId || !instance.isInBounds(player.x, player.y)) {
   return;
  }
  const tileIndex = instance.toTileIndex(player.x, player.y);
  let playerIds = instance.playerIdsByTile.get(tileIndex);
  if (!playerIds) {
   playerIds = new Set();
   instance.playerIdsByTile.set(tileIndex, playerIds);
  }
  if (!playerIds.has(player.playerId)) {
   instance.playerTileIndexedPlayerCount += 1;
   instance.playerSpatialIndexRevision += 1;
  }
  playerIds.add(player.playerId);
  instance.addPlayerToChunkIndex(player);
}

export function removePlayerFromTileIndexImpl(instance: MapInstanceRuntime, playerId, x, y) {
  if (!playerId || !instance.isInBounds(x, y)) {
   return;
  }
  const tileIndex = instance.toTileIndex(x, y);
  const playerIds = instance.playerIdsByTile.get(tileIndex);
  if (playerIds?.delete(playerId)) {
   instance.playerTileIndexedPlayerCount = Math.max(0, instance.playerTileIndexedPlayerCount - 1);
   instance.playerSpatialIndexRevision += 1;
   if (playerIds.size === 0) {
    instance.playerIdsByTile.delete(tileIndex);
   }
  }
  instance.removePlayerFromChunkIndex(playerId, x, y);
}

export function collectPlayersByTileIndicesImpl(instance: MapInstanceRuntime, tileIndices) {
  if (!(tileIndices instanceof Set)) {
   return Array.from(instance.playersById.values());
  }
  instance.ensurePlayerSpatialIndexesConsistent();
  if (instance.playerTileIndexedPlayerCount !== instance.playersById.size) {
   return Array.from(instance.playersById.values());
  }
  const players = [];
  const seenPlayerIds = new Set();
  for (const tileIndexInput of tileIndices) {
   const tileIndex = Math.trunc(Number(tileIndexInput));
   const playerIds = instance.playerIdsByTile.get(tileIndex);
   if (!playerIds) {
    continue;
   }
   for (const playerId of playerIds) {
    if (seenPlayerIds.has(playerId)) {
     continue;
    }
    const player = instance.playersById.get(playerId);
    if (!player) {
     continue;
    }
    seenPlayerIds.add(playerId);
    players.push(player);
   }
  }
  return players;
}

export function setDynamicTileBlockerImpl(instance: MapInstanceRuntime, blocker) {
  instance.dynamicTileBlocker = typeof blocker === 'function' ? blocker : null;
}

export function activateRuntimeTileImpl(instance: MapInstanceRuntime, x, y, tileType, options: any = {}) {
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
   return { created: false, tileIndex: -1 };
  }
  const normalizedX = Math.trunc(Number(x));
  const normalizedY = Math.trunc(Number(y));
  const existing = instance.toTileIndex(normalizedX, normalizedY);
  if (existing >= 0) {
   return { created: false, tileIndex: existing };
  }
  const tileIndex = instance.tilePlane.activateCell(normalizedX, normalizedY, tileType);
  instance.ensureCellStorageCapacity(tileIndex + 1);
  if (Number.isFinite(Number(options?.aura))) {
   instance.auraByTile[tileIndex] = normalizeTileResourceValue(options.aura);
   const baseAura = instance.baseTileResourceBuckets.get(DEFAULT_TILE_AURA_RESOURCE_KEY);
   if (baseAura) {
    baseAura[tileIndex] = instance.auraByTile[tileIndex];
   }
  }
  instance.markStaticTileSyncDirtyByIndex(tileIndex, { sightBlockingChanged: true, pathingChanged: true });
  instance.worldRevision += 1;
  instance.persistentRevision += 1;
  instance.markPersistenceDirtyDomainsHighPriority(['tile_cell']);
  if (options?.skipRoomFengShuiDirty !== true
   && instance.shouldRecalculateRoomsForTileMutation(tileIndex, instance.resolveDefaultTileLayerFallbackForCell(tileIndex).legacyTileType, tileType)) {
   instance.markRoomsAndFengShuiDirtyAfterTopologyChange({
    reason: 'runtime_tile_activated',
    dirtyCellCount: 1,
    highPriority: true,
   });
  }
  return { created: true, tileIndex };
}

export function forEachRuntimeTileImpl(instance: MapInstanceRuntime, visitor) {
  if (typeof visitor !== 'function' || !instance.tilePlane || typeof instance.tilePlane.getCellCount !== 'function') {
   return;
  }
  const count = instance.tilePlane.getCellCount();
  for (let tileIndex = 0; tileIndex < count; tileIndex += 1) {
   visitor(instance.tilePlane.getX(tileIndex), instance.tilePlane.getY(tileIndex), tileIndex);
  }
}

export function applyDefaultTileLayerFallbackImpl(instance: MapInstanceRuntime, tileIndexInput) {
  const tileIndex = Math.trunc(Number(tileIndexInput));
  if (!Number.isFinite(tileIndex) || tileIndex < 0 || tileIndex >= instance.tilePlane.getCellCount()) {
   return false;
  }
  const fallback = instance.resolveDefaultTileLayerFallbackForCell(tileIndex);
  instance.tilePlane.setTerrain(tileIndex, fallback.terrain);
  instance.tilePlane.setSurface(tileIndex, fallback.surface);
  instance.tilePlane.setStructure(tileIndex, fallback.structure);
  if (typeof instance.tilePlane.setInteractableKinds === 'function') {
   instance.tilePlane.setInteractableKinds(tileIndex, [...fallback.interactables]);
  }
  return true;
}

export function getGroundTileTypeByCellIndexImpl(instance: MapInstanceRuntime, cellIndexInput) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  if (!Number.isFinite(cellIndex) || cellIndex < 0 || cellIndex >= instance.tilePlane.getCellCount()) {
   return instance.resolveDefaultTileLayerFallbackForCell(cellIndex).legacyTileType;
  }
  const state = typeof instance.tilePlane.getTileLayerState === 'function'
   ? instance.tilePlane.getTileLayerState(cellIndex)
   : null;
  if (!state) {
   return instance.resolveDefaultTileLayerFallbackForCell(cellIndex).legacyTileType;
  }
  return composeTileTypeFromLayers(
   state.terrain,
   state.surface,
   null,
   Array.isArray(state.interactableKinds) ? state.interactableKinds : [],
  );
}

export function getTileAuraImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   if (instance.isSectVirtualBoundaryTile(x, y)) {
    return 0;
   }
   return null;
  }
  return instance.getTileResource(DEFAULT_TILE_AURA_RESOURCE_KEY, x, y);
}

export function getTileResourceImpl(instance: MapInstanceRuntime, resourceKey, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   if (instance.isSectVirtualBoundaryTile(x, y)) {
    return 0;
   }
   return null;
  }
  return instance.getTileResourceValueByIndex(resourceKey, instance.toTileIndex(x, y));
}

export function listTileResourcesImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   if (instance.isSectVirtualBoundaryTile(x, y)) {
    return [];
   }
   return null;
  }
  const tileIndex = instance.toTileIndex(x, y);
  const entries = [];
  for (const [resourceKey, bucket] of instance.tileResourceBuckets.entries()) {
   const value = bucket[tileIndex] ?? 0;
   if (value <= 0) {
    continue;
   }
   entries.push({
    resourceKey,
    value,
    sourceValue: instance.getTileResourceBaseValueByIndex(resourceKey, tileIndex),
   });
  }
  entries.sort((left, right) => {
   if (left.resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY && right.resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY) {
    return -1;
   }
   if (left.resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY && right.resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
    return 1;
   }
   return left.resourceKey.localeCompare(right.resourceKey, 'zh-Hans-CN');
  });
  return entries;
}

export function visitTileResourcesImpl(instance: MapInstanceRuntime, x, y, visitor) {
  if (typeof visitor !== 'function') {
   return false;
  }
  if (!instance.isInBounds(x, y)) {
   return instance.isSectVirtualBoundaryTile(x, y);
  }
  const tileIndex = instance.toTileIndex(x, y);
  for (const [resourceKey, bucket] of instance.tileResourceBuckets.entries()) {
   const value = bucket[tileIndex] ?? 0;
   if (value <= 0) {
    continue;
   }
   visitor(resourceKey, value);
  }
  return true;
}

export function getTileGroundPileImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return null;
  }
  return toGroundPileView(instance.groundPilesByTile.get(instance.toTileIndex(x, y)) ?? null);
}

export function getTileCombatStateImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   if (instance.isSectVirtualBoundaryTile(x, y)) {
    const maxHp = resolveTileDurability(instance.template, TileType.Stone, x, y, instance.sectVirtualBoundaryLayerState);
    return maxHp > 0
     ? {
      tileType: TileType.Stone,
      terrainType: instance.sectVirtualBoundaryLayerState.terrain,
      surfaceType: instance.sectVirtualBoundaryLayerState.surface,
      structureType: StructureType.Stone,
      hp: maxHp,
      maxHp,
      modifiedAt: null,
      respawnLeft: 0,
      destroyed: false,
      virtualBoundary: true,
     }
     : null;
   }
   return null;
  }

  return instance.getTileCombatStateAtIndexedCell(instance.toTileIndex(x, y), x, y);
}

export function getTileCombatStateAtIndexedCellImpl(instance: MapInstanceRuntime, tileIndex, x, y) {
  const temporary = instance.temporaryTileByTile.get(tileIndex);
  if (temporary) {
   return {
    tileType: temporary.tileType,
    structureType: normalizeStructureType(temporary.tileType),
    hp: Math.max(0, Math.trunc(Number(temporary.hp) || 0)),
    maxHp: Math.max(1, Math.trunc(Number(temporary.maxHp) || 1)),
    modifiedAt: temporary.modifiedAt ?? null,
    respawnLeft: 0,
    destroyed: false,
    temporary: true,
    mineralLevel: temporary.mineralLevel,
    expiresAtTick: Math.max(0, Math.trunc(Number(temporary.expiresAtTick) || 0)),
   };
  }
  const buildingCombat = instance.getActiveBuildingCombatStateAtCellIndex(tileIndex);
  if (buildingCombat) {
   return buildingCombat;
  }
  const tileType = instance.getBaseTileType(x, y);
  const layerState = typeof instance.tilePlane.getTileLayerState === 'function'
   ? instance.tilePlane.getTileLayerState(tileIndex)
   : null;

  const maxHp = resolveTileDurability(instance.template, tileType, x, y, layerState);
  if (maxHp <= 0) {
   return null;
  }

  const current = instance.tileDamageByTile.get(tileIndex);
  return {
   tileType,
   terrainType: layerState?.terrain ?? null,
   structureType: layerState?.structure ?? null,
   hp: current?.hp ?? maxHp,
   maxHp,
   modifiedAt: current?.modifiedAt ?? null,
   respawnLeft: current?.destroyed === true ? Math.max(0, Math.trunc(Number(current?.respawnLeft) || 0)) : 0,

   destroyed: current?.destroyed === true,
  };
}

export function damageTileImpl(instance: MapInstanceRuntime, x, y, damage, options: TileDropRollOptions = {}): any {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (instance.meta.canDamageTile !== true) {
   return null;
  }

  const current: any = instance.getTileCombatState(x, y);
  if (!current) {
   return null;
  }
  if (current.destroyed === true) {
   return null;
  }
  if (current.virtualBoundary === true) {
   const activated = instance.activateRuntimeTile(x, y, TileType.Stone);
   if (activated.tileIndex < 0) {
    return null;
   }
  }

  const normalizedDamage = Math.max(0, Math.round(damage));
  if (normalizedDamage <= 0) {
   return {
    destroyed: current.destroyed,
    hp: current.hp,
    maxHp: current.maxHp,
    appliedDamage: 0,
    targetType: current.tileType,
   };
  }

  const tileIndex = instance.toTileIndex(x, y);
  if (current.virtualBoundary === true) {
   const baseHp = Math.max(1, Math.trunc(Number(current.maxHp) || 1));
   const appliedDamage = Math.min(baseHp, normalizedDamage);
   const nextHp = Math.max(0, baseHp - appliedDamage);
   const destroyed = nextHp <= 0;
   if (!destroyed) {
    instance.tileDamageByTile.set(tileIndex, {
     hp: nextHp,
     maxHp: baseHp,
     destroyed: false,
     respawnLeft: 0,
     modifiedAt: Date.now(),
    });
    instance.markTileDamagePersistenceDirtyHighPriority(tileIndex);
   } else {
    instance.applyDefaultTileLayerFallback(tileIndex);
    instance.tileDamageByTile.delete(tileIndex);
    instance.markTileDamagePersistenceDirtyHighPriority(tileIndex);
    instance.markStaticTileSyncDirtyByIndex(tileIndex, { sightBlockingChanged: true, pathingChanged: true });
   }
   instance.worldRevision += 1;
   instance.persistentRevision += 1;
   return {
    destroyed,
    hp: nextHp,
    maxHp: baseHp,
    appliedDamage,
    targetType: current.tileType,
    virtualBoundary: true,
   };
  }
  const temporary = instance.temporaryTileByTile.get(tileIndex);
  if (temporary) {
   const appliedDamage = Math.min(Math.max(0, Math.trunc(Number(temporary.hp) || 0)), normalizedDamage);
   const nextHp = Math.max(0, Math.trunc(Number(temporary.hp) || 0) - appliedDamage);
   const destroyed = nextHp <= 0;
   const affectsRoomTopology = destroyed === true
    && instance.shouldRecalculateRoomsForTileMutation(tileIndex, temporary.tileType, instance.getBaseTileType(x, y));
   if (destroyed) {
    instance.temporaryTileByTile.delete(tileIndex);
   }
   else {
    instance.temporaryTileByTile.set(tileIndex, {
     ...temporary,
     hp: nextHp,
     modifiedAt: Date.now(),
    });
   }
   instance.markStaticTileSyncDirtyByIndex(tileIndex, {
    sightBlockingChanged: destroyed,
    pathingChanged: destroyed,
   });
   instance.worldRevision += 1;
   instance.markPersistenceDirtyDomainsHighPriority(['temporary_tile']);
   if (affectsRoomTopology) {
    instance.markRoomsAndFengShuiDirtyAfterTopologyChange({
     reason: 'temporary_tile_destroyed',
     dirtyCellCount: 1,
     highPriority: true,
    });
   }
   instance.persistentRevision += 1;
   return {
    destroyed,
    hp: nextHp,
    maxHp: Math.max(1, Math.trunc(Number(temporary.maxHp) || 1)),
    appliedDamage,
    targetType: temporary.tileType,
    temporary: true,
    mineralLevel: temporary.mineralLevel,
    tileDrops: temporary.sourceItemId
     ? instance.rollTileDrops(current, appliedDamage, destroyed, options)
     : [],
   };
  }
  if (current.building === true && current.buildingId) {
   const building = instance.buildingById.get(current.buildingId);
   if (!building || !buildingUsesActiveTopology(building)) {
    return null;
   }
   const maxHp = Math.max(1, Math.trunc(Number(building.maxHp) || current.maxHp || 1));
   const appliedDamage = Math.min(Math.max(0, Math.trunc(Number(building.hp) || maxHp)), normalizedDamage);
   const nextHp = Math.max(0, Math.trunc(Number(building.hp) || maxHp) - appliedDamage);
   const destroyed = nextHp <= 0;
   if (destroyed) {
    building.hp = 0;
    building.state = 'destroyed';
    building.updatedAtTick = instance.tick;
    building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
    const deconstructResult = instance.deconstructBuildingInstance(building.id);
    if (deconstructResult?.ok !== true
     && (deconstructResult?.reason === 'treasure_vault_recovery_required'
      || deconstructResult?.reason === 'time_chamber_release_required')) {
     building.hp = 1;
     building.state = 'active';
     building.updatedAtTick = instance.tick;
     building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
     instance.markStaticTileSyncDirtyByIndex(tileIndex);
     instance.worldRevision += 1;
     instance.persistentRevision += 1;
     instance.markPersistenceDirtyDomainsHighPriority(['building']);
     return {
      destroyed: false,
      hp: 1,
      maxHp,
      appliedDamage,
      targetType: current.tileType,
      targetName: current.targetName,
      buildingId: building.id,
      building: true,
      protectedBySpecialBuildingLifecycle: true,
     };
    }
   }
   else {
    building.hp = nextHp;
    building.updatedAtTick = instance.tick;
    building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
    instance.markStaticTileSyncDirtyByIndex(tileIndex);
    instance.worldRevision += 1;
    instance.persistentRevision += 1;
    instance.markPersistenceDirtyDomainsHighPriority(['building']);
    if (instance.isCellInRoomInfluence(tileIndex)) {
     instance.markFengShuiDirtyAfterRoomInfluenceChange(tileIndex, 'building_integrity_damaged', { highPriority: true });
    }
   }
   return {
    destroyed,
    hp: nextHp,
    maxHp,
    appliedDamage,
    targetType: current.tileType,
    targetName: current.targetName,
    buildingId: building.id,
    building: true,
   };
  }

  const appliedDamage = Math.min(current.hp, normalizedDamage);

  const nextHp = Math.max(0, current.hp - appliedDamage);
  const destroyed = nextHp <= 0;
  const tileDrops = instance.rollTileDrops(current, appliedDamage, destroyed, options);
  const affectsRoomTopology = destroyed === true
   && instance.shouldRecalculateRoomsForTileMutation(tileIndex, current.tileType, instance.getDestroyedTileLayerStateByCellIndex(tileIndex).tileType);
  const affectsRoomIntegrity = destroyed !== true
   && current.hp >= current.maxHp
   && instance.isCellInRoomInfluence(tileIndex);
  if (destroyed && instance.isSectRuntimeExpandedBoundaryStone(tileIndex, current)) {
   instance.applyDefaultTileLayerFallback(tileIndex);
   instance.tileDamageByTile.delete(tileIndex);
   instance.worldRevision += 1;
   instance.markStaticTileSyncDirtyByIndex(tileIndex, { sightBlockingChanged: true, pathingChanged: true });
   instance.markTileDamagePersistenceDirtyHighPriority(tileIndex);
   if (instance.shouldRecalculateRoomsForTileMutation(tileIndex, current.tileType, instance.resolveDefaultTileLayerFallbackForCell(tileIndex).legacyTileType)) {
    instance.markRoomsAndFengShuiDirtyAfterTopologyChange({
     reason: 'sect_boundary_opened',
     dirtyCellCount: 1,
     highPriority: true,
    });
   }
   instance.persistentRevision += 1;
   return {
    destroyed,
    hp: nextHp,
    maxHp: current.maxHp,
    appliedDamage,
    targetType: current.tileType,
    tileDrops,
    sectBoundaryOpened: true,
   };
  }
  return applyMapInstanceOrdinaryTileDamageMutation(instance, {
   current,
   tileIndex,
   appliedDamage,
   nextHp,
   destroyed,
   tileDrops,
   affectsRoomTopology,
   affectsRoomIntegrity,
  }, null, calculateTileRestoreTicks);
}

export function damageTilesBatchImpl(instance: MapInstanceRuntime, entries: readonly TileDamageBatchInput[], options: TileDropRollOptions = {}) {
  return damageMapInstanceTilesBatch(instance, entries, options, calculateTileRestoreTicks);
}

export function createTemporaryTileImpl(instance: MapInstanceRuntime, x, y, tileType, maxHp, durationTicks, currentTick, options: any = {}) {
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
   return { created: false, reason: 'invalid_coordinate' };
  }
  const normalizedX = Math.trunc(Number(x));
  const normalizedY = Math.trunc(Number(y));
  const availability = instance.resolveTemporaryTileAvailability(normalizedX, normalizedY);
  if (availability.allowed !== true && !(options?.allowOccupied === true && availability.reason === 'blocked')) {
   return { created: false, reason: availability.reason };
  }
  const tileIndex = availability.tileIndex >= 0 ? availability.tileIndex : instance.toTileIndex(normalizedX, normalizedY);
  const existingTemporary = instance.temporaryTileByTile.get(tileIndex);
  if (existingTemporary?.sourceItemId) {
   return { created: false, reason: 'mineral_vein_occupied' };
  }
  const hp = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(maxHp) || 1)));
  const nowTick = Math.max(0, Math.trunc(Number(currentTick) || instance.tick || 0));
  const ttl = Math.max(1, Math.trunc(Number(durationTicks) || 1));
  const now = Date.now();
  const previousEffectiveTileType = instance.getEffectiveTileTypeByCellIndex(tileIndex);
  instance.temporaryTileByTile.set(tileIndex, {
   tileType: typeof tileType === 'string' && tileType.length > 0 ? tileType : TileType.Stone,
   hp,
   maxHp: hp,
   expiresAtTick: nowTick + ttl,
   ownerPlayerId: typeof options?.ownerPlayerId === 'string' ? options.ownerPlayerId : null,
   sourceSkillId: typeof options?.sourceSkillId === 'string' ? options.sourceSkillId : null,
   sourceItemId: typeof options?.sourceItemId === 'string' ? options.sourceItemId : null,
   mineralLevel: Number.isFinite(options?.mineralLevel) ? Math.max(1, Math.trunc(options.mineralLevel)) : null,
   createdAt: existingTemporary?.createdAt ?? now,
   modifiedAt: now,
  });
  instance.markStaticTileSyncDirtyByIndex(tileIndex, { sightBlockingChanged: true, pathingChanged: true });
  instance.worldRevision += 1;
  instance.markPersistenceDirtyDomainsHighPriority(['temporary_tile']);
  if (instance.shouldRecalculateRoomsForTileMutation(tileIndex, previousEffectiveTileType, instance.getEffectiveTileTypeByCellIndex(tileIndex))) {
   instance.markRoomsAndFengShuiDirtyAfterTopologyChange({
    reason: 'temporary_tile_created',
    dirtyCellCount: 1,
    highPriority: true,
   });
  }
  instance.persistentRevision += 1;
  return { created: true, refreshed: Boolean(existingTemporary), tileIndex };
}

export function applyRuntimeTerrainAreaImpl(instance: MapInstanceRuntime, tileType, durationTicks, currentTick = this.tick, options: any = {}) {
  const createdCells = [];
  for (let y = 0; y < instance.template.height; y += 1) {
   for (let x = 0; x < instance.template.width; x += 1) {
    const result = instance.createTemporaryTile(x, y, tileType, Number.MAX_SAFE_INTEGER, durationTicks, currentTick, {
     ...options,
     allowOccupied: true,
    });
    if (result.created) {
     createdCells.push({ x, y });
    }
   }
  }
  return { created: createdCells.length, cells: createdCells };
}

export function canCreateTemporaryTileImpl(instance: MapInstanceRuntime, x, y) {
  return instance.resolveTemporaryTileAvailability(Math.trunc(Number(x)), Math.trunc(Number(y))).allowed === true;
}

export function resolveTemporaryTileAvailabilityImpl(instance: MapInstanceRuntime, x, y) {
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
   return { allowed: false, reason: 'invalid_coordinate', tileIndex: -1 };
  }
  const normalizedX = Math.trunc(Number(x));
  const normalizedY = Math.trunc(Number(y));
  if (!instance.isInBounds(normalizedX, normalizedY)) {
   return { allowed: false, reason: 'out_of_bounds', tileIndex: -1 };
  }
  const tileIndex = instance.toTileIndex(normalizedX, normalizedY);
  if (instance.temporaryTileByTile.has(tileIndex)) {
   return { allowed: true, reason: 'refresh', tileIndex };
  }
  if (instance.hasBlockingEntityAt(normalizedX, normalizedY)) {
   return { allowed: false, reason: 'blocked', tileIndex };
  }
  if (!instance.isCellIndexWalkable(tileIndex)) {
   return { allowed: false, reason: 'not_walkable', tileIndex };
  }
  return { allowed: true, reason: 'available', tileIndex };
}

export function advanceTemporaryTilesImpl(instance: MapInstanceRuntime, currentTick = this.tick, isTerrainStabilized = null) {
  if (instance.temporaryTileByTile.size === 0) {
   return false;
  }
  const normalizedTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
  let changed = false;
  let topologyChangedCellCount = 0;
  const toDelete: number[] = [];
  for (const [tileIndex, state] of instance.temporaryTileByTile) {
   if (!state || !Number.isFinite(Number(tileIndex))) {
    toDelete.push(tileIndex);
    instance.markStaticTileSyncDirtyByIndex(tileIndex, { sightBlockingChanged: true, pathingChanged: true });
    changed = true;
    continue;
   }
   const x = instance.tilePlane.getX(Math.trunc(Number(tileIndex)));
   const y = instance.tilePlane.getY(Math.trunc(Number(tileIndex)));
   if (!state.sourceItemId && typeof isTerrainStabilized === 'function' && isTerrainStabilized(x, y) === true) {
    continue;
   }
   const expiresAtTick = Math.max(0, Math.trunc(Number(state.expiresAtTick) || 0));
   if (expiresAtTick > 0 && normalizedTick >= expiresAtTick) {
    if (instance.shouldRecalculateRoomsForTileMutation(tileIndex, state.tileType, instance.getBaseTileType(x, y))) {
     topologyChangedCellCount += 1;
    }
    toDelete.push(tileIndex);
    instance.markStaticTileSyncDirtyByIndex(tileIndex, { sightBlockingChanged: true, pathingChanged: true });
    changed = true;
   }
  }
  for (const key of toDelete) {
   instance.temporaryTileByTile.delete(key);
  }
  if (changed) {
   if (topologyChangedCellCount > 0) {
    instance.markRoomsAndFengShuiDirtyAfterTopologyChange({
     reason: 'temporary_tile_expired',
     dirtyCellCount: topologyChangedCellCount,
    });
   }
   instance.worldRevision += 1;
   instance.markPersistenceDirtyDomains(['temporary_tile']);
   instance.persistentRevision += 1;
  }
  return changed;
}

export function removeAbnormalTemporaryTilesImpl(instance: MapInstanceRuntime, currentTick = this.tick) {
  if (instance.temporaryTileByTile.size === 0) {
   return { scanned: 0, removed: 0 };
  }
  const normalizedTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
  let scanned = 0;
  let topologyChangedCellCount = 0;
  const toDelete: number[] = [];
  for (const [tileIndex, state] of instance.temporaryTileByTile) {
   if (!state || !Number.isFinite(Number(tileIndex))) {
    continue;
   }
   scanned += 1;
   const expiresAtTick = Math.max(0, Math.trunc(Number(state.expiresAtTick) || 0));
   if (!isAbnormalTemporaryTileState(state, expiresAtTick, normalizedTick)) {
    continue;
   }
   const normalizedTileIndex = Math.trunc(Number(tileIndex));
   const x = instance.tilePlane.getX(normalizedTileIndex);
   const y = instance.tilePlane.getY(normalizedTileIndex);
   if (instance.shouldRecalculateRoomsForTileMutation(normalizedTileIndex, state.tileType, instance.getBaseTileType(x, y))) {
    topologyChangedCellCount += 1;
   }
   toDelete.push(normalizedTileIndex);
   instance.markStaticTileSyncDirtyByIndex(normalizedTileIndex, { sightBlockingChanged: true, pathingChanged: true });
  }
  for (const key of toDelete) {
   instance.temporaryTileByTile.delete(key);
  }
  if (toDelete.length > 0) {
   if (topologyChangedCellCount > 0) {
    instance.recalculateRoomsAndFengShuiAfterTopologyChange({ reason: 'gm_abnormal_temporary_tile_cleanup', dirtyCellCount: topologyChangedCellCount });
    instance.markPersistenceDirtyDomains(['room', 'fengshui']);
   }
   instance.worldRevision += 1;
   instance.markPersistenceDirtyDomains(['temporary_tile']);
   instance.persistentRevision += 1;
  }
  return { scanned, removed: toDelete.length };
}

export function advanceTileRecoveryImpl(instance: MapInstanceRuntime, isTerrainStabilized, tileRecoveryProvider, terrainStabilizerHpRecoveryChecker = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const hasStabilizerHpRecovery = canAttemptTerrainStabilizerHpRecovery(terrainStabilizerHpRecoveryChecker);
  if (instance.tileDamageByTile.size === 0 && !hasStabilizerHpRecovery) {
   return false;
  }

  let naturalTileRecoveryEnabled = true;
  // 通过 provider 检查普通地形恢复是否启用；固脉额外回血是阵法效果，单独结算。
  if (tileRecoveryProvider && typeof tileRecoveryProvider.getRecoveryConfig === 'function') {
   const config = tileRecoveryProvider.getRecoveryConfig(instance.meta?.instanceId);
   if (config && config.enabled === false) {
    naturalTileRecoveryEnabled = false;
   }
  }

  const now = Date.now();
  let changed = false;
  let topologyChangedCellCount = 0;
  const fengShuiInfluenceCells = new Set();
  for (const [tileIndex, current] of Array.from(instance.tileDamageByTile.entries())) {
   if (!Number.isFinite(Number(tileIndex))) {
    continue;
   }
   const normalizedTileIndex = Math.trunc(Number(tileIndex));
   const x = instance.tilePlane.getX(normalizedTileIndex);
   const y = instance.tilePlane.getY(normalizedTileIndex);
   // 优先通过 provider 获取恢复目标地块类型，fallback 到 getBaseTileType
   let tileType;
   if (tileRecoveryProvider && typeof tileRecoveryProvider.getOriginalTileType === 'function') {
    const providerResult = tileRecoveryProvider.getOriginalTileType(instance.meta?.instanceId, x, y);
    tileType = providerResult != null ? providerResult : instance.getBaseTileType(x, y);
   } else {
    tileType = instance.getBaseTileType(x, y);
   }
   const layerState = typeof instance.tilePlane.getTileLayerState === 'function'
    ? instance.tilePlane.getTileLayerState(normalizedTileIndex)
    : null;
   const maxHp = Math.max(1, Math.trunc(Number(current?.maxHp) || resolveTileDurability(instance.template, tileType, x, y, layerState)));
   if (current?.destroyed === true) {
    if (!naturalTileRecoveryEnabled) {
     continue;
    }
    if (typeof isTerrainStabilized === 'function' && isTerrainStabilized(x, y) === true) {
     continue;
    }
    const rawRespawnLeft = Math.trunc(Number(current.respawnLeft));
    const respawnLeft = Number.isFinite(rawRespawnLeft)
     ? Math.max(0, rawRespawnLeft)
     : calculateTileRestoreTicks(tileType);
    if (respawnLeft <= 1) {
     if (instance.hasBlockingEntityAt(x, y)) {
      instance.tileDamageByTile.set(tileIndex, {
       hp: 0,
       maxHp,
       destroyed: true,
       respawnLeft: calculateTileRestoreRetryTicks(tileType),
       modifiedAt: now,
      });
     }
     else {
      instance.tileDamageByTile.delete(tileIndex);
      if (instance.shouldRecalculateRoomsForTileMutation(normalizedTileIndex, instance.getDestroyedTileLayerStateByCellIndex(normalizedTileIndex).tileType, tileType)) {
       topologyChangedCellCount += 1;
      }
     }
    }
    else {
     instance.tileDamageByTile.set(tileIndex, {
      hp: 0,
      maxHp,
      destroyed: true,
      respawnLeft: respawnLeft - 1,
      modifiedAt: now,
     });
    }
    if (respawnLeft <= 1 && !instance.hasBlockingEntityAt(x, y)) {
     instance.markStaticTileSyncDirtyByIndex(normalizedTileIndex, { sightBlockingChanged: true, pathingChanged: true });
    }
    instance.markTileDamagePersistenceDirty(tileIndex);
    changed = true;
    continue;
   }

   const hp = Math.max(0, Math.min(maxHp, Math.trunc(Number(current?.hp) || maxHp)));
   if (hp >= maxHp) {
    instance.tileDamageByTile.delete(tileIndex);
    instance.markStaticTileSyncDirtyByIndex(normalizedTileIndex, { sightBlockingChanged: true, pathingChanged: true });
    instance.markTileDamagePersistenceDirty(tileIndex);
    changed = true;
    continue;
   }
   const baseRepairAmount = naturalTileRecoveryEnabled
    ? resolveTerrainHpRecoveryAmount(maxHp)
    : 0;
   const stabilizerRepairAmount = hasTerrainStabilizerHpRecoveryAt(terrainStabilizerHpRecoveryChecker, x, y)
    ? resolveTerrainHpRecoveryAmount(maxHp)
    : 0;
   const repairAmount = baseRepairAmount + stabilizerRepairAmount;
   if (repairAmount <= 0) {
    continue;
   }
   const nextHp = Math.min(maxHp, hp + repairAmount);
   if (nextHp >= maxHp) {
    instance.tileDamageByTile.delete(tileIndex);
    if (instance.isCellInRoomInfluence(normalizedTileIndex)) {
     fengShuiInfluenceCells.add(normalizedTileIndex);
    }
   }
   else {
    instance.tileDamageByTile.set(tileIndex, {
     hp: nextHp,
     maxHp,
     destroyed: false,
     respawnLeft: 0,
     modifiedAt: now,
    });
   }
   if (nextHp >= maxHp) {
    instance.markStaticTileSyncDirtyByIndex(normalizedTileIndex, {
     sightBlockingChanged: current?.destroyed === true,
     pathingChanged: current?.destroyed === true,
    });
   }
   instance.markTileDamagePersistenceDirty(tileIndex);
   changed = true;
  }

  if (hasStabilizerHpRecovery) {
   changed = instance.advanceTemporaryTileHpRecoveryByTerrainStabilizer(terrainStabilizerHpRecoveryChecker, now) || changed;
   changed = instance.advanceBuildingHpRecoveryByTerrainStabilizer(terrainStabilizerHpRecoveryChecker) || changed;
  }

  if (changed) {
   if (topologyChangedCellCount > 0) {
    instance.markRoomsAndFengShuiDirtyAfterTopologyChange({
     reason: 'tile_recovered',
     dirtyCellCount: topologyChangedCellCount,
    });
   }
   else if (fengShuiInfluenceCells.size > 0) {
    for (const cellIndex of fengShuiInfluenceCells) {
     instance.markFengShuiDirtyAfterRoomInfluenceChange(cellIndex, 'tile_integrity_recovered');
    }
   }
   instance.worldRevision += 1;
   instance.persistentRevision += 1;
  }
  return changed;
}

export function advanceTemporaryTileHpRecoveryByTerrainStabilizerImpl(instance: MapInstanceRuntime, terrainStabilizerHpRecoveryChecker, now = Date.now()) {
  if (instance.temporaryTileByTile.size === 0 || !canAttemptTerrainStabilizerHpRecovery(terrainStabilizerHpRecoveryChecker)) {
   return false;
  }
  let changed = false;
  for (const [tileIndex, state] of instance.temporaryTileByTile.entries()) {
   if (!state || !Number.isFinite(Number(tileIndex))) {
    continue;
   }
   const normalizedTileIndex = Math.trunc(Number(tileIndex));
   const x = instance.tilePlane.getX(normalizedTileIndex);
   const y = instance.tilePlane.getY(normalizedTileIndex);
   if (!hasTerrainStabilizerHpRecoveryAt(terrainStabilizerHpRecoveryChecker, x, y)) {
    continue;
   }
   const maxHp = Math.max(1, Math.trunc(Number(state.maxHp) || 1));
   const hp = Math.max(0, Math.min(maxHp, Math.trunc(Number(state.hp) || maxHp)));
   if (hp >= maxHp) {
    continue;
   }
   const nextHp = Math.min(maxHp, hp + resolveTerrainHpRecoveryAmount(maxHp));
   instance.temporaryTileByTile.set(normalizedTileIndex, {
    ...state,
    hp: nextHp,
    maxHp,
    modifiedAt: now,
   });
   instance.markStaticTileSyncDirtyByIndex(normalizedTileIndex);
   instance.markPersistenceDirtyDomains(['temporary_tile']);
   changed = true;
  }
  return changed;
}

export function hasBlockingEntityAtImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return true;
  }
  const tileIndex = instance.toTileIndex(x, y);
  return instance.occupancy[tileIndex] !== INVALID_OCCUPANCY
   || instance.monsterRuntimeIdByTile.has(tileIndex)
   || instance.npcIdByTile.has(tileIndex)
   || instance.temporaryTileByTile.has(tileIndex);
}

export function getBaseTileTypeImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const tileIndex = instance.toTileIndex(x, y);
  if (tileIndex < 0) {
   return instance.resolveDefaultTileLayerFallbackForCell(-1, x, y).legacyTileType;
  }
  return instance.tilePlane.getTileType(tileIndex);
}

export function getEffectiveTileTypeImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   if (instance.isSectVirtualBoundaryTile(x, y)) {
    return TileType.Stone;
   }
   return instance.resolveDefaultTileLayerFallbackForCell(-1, x, y).legacyTileType;
  }
  return instance.getEffectiveTileTypeByCellIndex(instance.toTileIndex(x, y));
}

export function getTileLayerStateImpl(instance: MapInstanceRuntime, x, y) {
  if (!instance.isInBounds(x, y)) {
   if (instance.isSectVirtualBoundaryTile(x, y)) {
    return instance.sectVirtualBoundaryLayerState;
   }
   return null;
  }
  const tileIndex = instance.toTileIndex(x, y);
  const state = typeof instance.tilePlane.getTileLayerState === 'function'
   ? instance.tilePlane.getTileLayerState(tileIndex)
   : null;
  if (!state) {
   return null;
  }
  const temporary = instance.temporaryTileByTile.get(tileIndex);
  if (temporary?.sourceItemId) {
   return { ...state, structure: normalizeStructureType(temporary.tileType), legacyTileType: temporary.tileType };
  }
  if (instance.tileDamageByTile.get(tileIndex)?.destroyed === true) {
   const destroyedState = instance.getDestroyedTileLayerStateByCellIndex(tileIndex, state);
   return {
    ...state,
    terrain: destroyedState.terrainType,
    surface: destroyedState.surfaceType,
    structure: null,
    interactableKinds: destroyedState.interactableKinds,
    legacyTileType: destroyedState.tileType,
   };
  }
  return state;
}

export function getGroundPileBySourceIdImpl(instance: MapInstanceRuntime, sourceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  for (const pile of instance.groundPilesByTile.values()) {
   if (pile.sourceId !== sourceId) {
    continue;
   }
   return snapshotGroundPile(pile);
  }
  return null;
}

export function getPlayersAtTileImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return [];
  }

  const results = [];
  const playerIds = instance.playerIdsByTile.get(instance.toTileIndex(x, y));
  if (!playerIds || playerIds.size === 0) {
   return results;
  }
  for (const playerId of playerIds) {
   const player = instance.playersById.get(playerId);
   if (player) {
    results.push({ ...player });
   }
  }
  return results;
}

export function getPlayerRuntimeRefsAtTileImpl(instance: MapInstanceRuntime, x, y) {
  if (!instance.isInBounds(x, y)) {
   return [];
  }
  const playerIds = instance.playerIdsByTile.get(instance.toTileIndex(x, y));
  if (!playerIds || playerIds.size === 0) {
   return [];
  }
  const results = [];
  for (const playerId of playerIds) {
   const player = instance.playersById.get(playerId);
   if (player) {
    results.push(player);
   }
  }
  return results;
}

export function getCombatTargetRuntimeRefsAtTileImpl(instance: MapInstanceRuntime, x, y, options: any = {}) {
  if (!instance.isInBounds(x, y)) {
   const tileState = options.tile === true ? instance.getTileCombatState(x, y) : null;
   return tileState ? { monster: null, players: null, container: null, tileState } : null;
  }
  const tileIndex = instance.toTileIndex(x, y);
  let monster = null;
  let players = null;
  let container = null;
  const tileState = options.tile === true
   ? instance.getTileCombatStateAtIndexedCell(tileIndex, x, y)
   : null;
  if (options.monster !== false) {
   const runtimeId = instance.monsterRuntimeIdByTile.get(tileIndex);
   const candidate = runtimeId ? instance.monstersByRuntimeId.get(runtimeId) : null;
   if (candidate?.alive) {
    monster = candidate;
   }
  }
  if (options.player !== false) {
   const playerIds = instance.playerIdsByTile.get(tileIndex);
   if (playerIds && playerIds.size > 0) {
    const indexedPlayers = [];
    for (const playerId of playerIds) {
     const player = instance.playersById.get(playerId);
     if (player) {
      indexedPlayers.push(player);
     }
    }
    if (indexedPlayers.length > 0) {
     players = indexedPlayers;
    }
   }
  }
  if (options.container !== false) {
   const containerId = instance.containerIdByTile.get(tileIndex);
   if (containerId) {
    const candidate = instance.containersById.get(containerId);
    if (candidate) {
     container = snapshotContainer(candidate);
    }
   }
  }
  if (!monster && !players && !container && !tileState) {
   return null;
  }
  return { monster, players, container, tileState };
}

export function getPortalAtTileImpl(instance: MapInstanceRuntime, x, y) {
  return instance.getPortalAt(x, y);
}

export function getLandmarkAtTileImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return null;
  }

  const landmarkId = instance.landmarkIdByTile.get(instance.toTileIndex(x, y));
  if (!landmarkId) {
   return null;
  }

  const landmark = instance.landmarksById.get(landmarkId);
  return landmark ? snapshotLandmark(landmark) : null;
}

export function isSafeZoneTileImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return false;
  }
  return instance.template.safeZoneMask[instance.toTileIndex(x, y)] === 1;
}

export function isPlayerOverlapTileImpl(instance: MapInstanceRuntime, x, y) {
  if (!instance.isInBounds(x, y)) {
   return false;
  }
  return instance.template.playerOverlapMask?.[instance.toTileIndex(x, y)] === 1;
}

export function getContainerAtTileImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return null;
  }

  const containerId = instance.containerIdByTile.get(instance.toTileIndex(x, y));
  if (!containerId) {
   return null;
  }

  const container = instance.containersById.get(containerId);
  return container && !(container.plantedExpiresAtTick <= instance.tick) ? snapshotContainer(container) : null;
}

export function getContainerByIdImpl(instance: MapInstanceRuntime, containerId) {

  const container = instance.containersById.get(containerId);
  return container && !(container.plantedExpiresAtTick <= instance.tick) ? snapshotContainer(container) : null;
}

export function getSafeZoneAtTileImpl(instance: MapInstanceRuntime, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return null;
  }
  for (const zone of instance.template.safeZones) {
   if (isOffsetInRange(x - zone.x, y - zone.y, zone.radius)) {
    return snapshotSafeZone(zone);
   }
  }
  return null;
}

export function isPointInSafeZoneImpl(instance: MapInstanceRuntime, x, y) {
  return instance.getSafeZoneAtTile(x, y) !== null;
}

export function addTileAuraImpl(instance: MapInstanceRuntime, x, y, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  return instance.addTileResource(DEFAULT_TILE_AURA_RESOURCE_KEY, x, y, amount);
}

export function disperseQiAtImpl(instance: MapInstanceRuntime, x, y, qiCost) {
  const perTileGain = calculateDispersedAuraGainPerTile(qiCost);
  if (perTileGain <= 0 || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
   return 0;
  }
  const centerX = Math.trunc(Number(x));
  const centerY = Math.trunc(Number(y));
  let affected = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
   for (let dx = -1; dx <= 1; dx += 1) {
    if (instance.addTileResource(DISPERSED_AURA_RESOURCE_KEY, centerX + dx, centerY + dy, perTileGain) !== null) {
     affected += 1;
    }
   }
  }
  return affected;
}

export function addTileResourceImpl(instance: MapInstanceRuntime, resourceKey, x, y, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y) || !Number.isFinite(amount)) {
   return null;
  }

  const normalizedAmount = Number(amount);
  if (normalizedAmount === 0) {
   return instance.getTileResource(resourceKey, x, y);
  }

  const tileIndex = instance.toTileIndex(x, y);
  const previous = instance.getTileResourceValueByIndex(resourceKey, tileIndex);
  const next = Math.max(0, previous + normalizedAmount);
  if (areTileResourceValuesEqual(next, previous)) {
   return next;
  }
  instance.setTileResourceValueByIndex(resourceKey, tileIndex, next, previous);
  return next;
}

export function advanceTileResourceFlowImpl(instance: MapInstanceRuntime) {
  let changed = false;
  for (const [resourceKey, tileIndices] of Array.from(instance.tileResourceFlowIndicesByKey.entries())) {
   if (!isNaturalAuraFlowResource(resourceKey) || !(tileIndices instanceof Set) || tileIndices.size <= 0) {
    continue;
   }
   const bucket = instance.tileResourceBuckets.get(resourceKey);
   if (!bucket) {
    instance.tileResourceFlowIndicesByKey.delete(resourceKey);
    continue;
   }
   const baseBucket = instance.baseTileResourceBuckets.get(resourceKey);
   const remainderBucket = instance.getOrCreateTileResourceFlowRemainderBucket(resourceKey);
   for (const tileIndex of Array.from(tileIndices.values())) {
    const current = normalizeTileResourceValue(bucket[tileIndex]);
    const base = normalizeTileResourceValue(baseBucket?.[tileIndex]);
    if (areTileResourceValuesEqual(current, base)) {
     if (current !== base) {
      instance.setTileResourceValueByIndex(resourceKey, tileIndex, base, current);
     }
     remainderBucket[tileIndex] = 0;
     tileIndices.delete(tileIndex);
     continue;
    }
    const diff = Math.abs(current - base);
    const flowRate = getTileResourceFlowRate(resourceKey);
    const minDecay = getTileResourceMinimumDecayPerTick(resourceKey);
    const step = Math.min(diff, Math.max(diff * flowRate, minDecay));
    remainderBucket[tileIndex] = 0;
    if (step <= TILE_RESOURCE_EPSILON) {
     instance.setTileResourceValueByIndex(resourceKey, tileIndex, base, current);
     remainderBucket[tileIndex] = 0;
     tileIndices.delete(tileIndex);
     changed = true;
     continue;
    }
    const next = current > base ? Math.max(base, current - step) : Math.min(base, current + step);
    instance.setTileResourceValueByIndex(resourceKey, tileIndex, next, current);
    if (areTileResourceValuesEqual(next, base)) {
     remainderBucket[tileIndex] = 0;
    }
    changed = true;
   }
   if (tileIndices.size <= 0) {
    instance.tileResourceFlowIndicesByKey.delete(resourceKey);
   }
  }
  return changed;
}

export function patchTileResourcesImpl(instance: MapInstanceRuntime, entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
   bucket[tileIndex] = next;
   instance.updateTileResourceFlowIndex(entry.resourceKey, tileIndex, next);
  }
  instance.changedAuraTileCount = 0;
  instance.changedTileResourceEntryCount = 0;
  instance.changedTileResourceEntryCountByKey.clear();
  instance.tileResourceFlowRemainderBuckets.clear();
  instance.tileResourceFlowIndicesByKey.clear();
  instance.rebuildTileResourceFlowIndices();
  instance.persistentRevision = 1;
  instance.persistedRevision = 1;
  instance.clearDirtyDomains();
}

export function captureGroundTileItemsForAssetMutationImpl(instance: MapInstanceRuntime, tileIndex) {
  const normalizedTileIndex = Math.trunc(Number(tileIndex));
  const pile = instance.groundPilesByTile.get(normalizedTileIndex);
  return pile?.items?.map((entry) => ({ ...entry.item })) ?? [];
}

export function restoreGroundItemsAfterFailedAssetTakeImpl(instance: MapInstanceRuntime, tileIndex, items) {
  const normalizedTileIndex = Math.trunc(Number(tileIndex));
  if (normalizedTileIndex < 0 || normalizedTileIndex >= instance.auraByTile.length) {
   return false;
  }
  const normalizedItems = (Array.isArray(items) ? items : [])
   .map((item) => normalizePersistedGroundItem({ ...item }))
   .filter((item) => Boolean(item))
   .filter((item) => {
    const expiresAtTick = getGroundItemExpiresAtTick(item);
    return expiresAtTick <= 0 || instance.tick < expiresAtTick;
   });
  if (normalizedItems.length === 0) {
   return false;
  }
  let pile = instance.groundPilesByTile.get(normalizedTileIndex);
  if (!pile) {
   pile = {
    sourceId: buildGroundSourceId(normalizedTileIndex),
    x: instance.tilePlane.getX(normalizedTileIndex),
    y: instance.tilePlane.getY(normalizedTileIndex),
    tileIndex: normalizedTileIndex,
    items: [],
   };
   instance.groundPilesByTile.set(normalizedTileIndex, pile);
  }
  for (const item of normalizedItems) {
   mergeGroundItemEntry(pile.items, item);
  }
  pile.items.sort(compareGroundEntries);
  instance.markGroundItemPersistenceDirty(normalizedTileIndex);
  instance.markFengShuiDirtyAfterRoomInfluenceChange(normalizedTileIndex, 'ground_item_transaction_reverted');
  instance.persistentRevision += 1;
  instance.worldRevision += 1;
  return true;
}

export function removeGroundItemsAfterFailedAssetDropImpl(instance: MapInstanceRuntime, tileIndex, items) {
  const normalizedTileIndex = Math.trunc(Number(tileIndex));
  const pile = instance.groundPilesByTile.get(normalizedTileIndex);
  if (!pile || !Array.isArray(pile.items)) {
   return false;
  }
  let changed = false;
  for (const item of Array.isArray(items) ? items : []) {
   const expiresAtTick = getGroundItemExpiresAtTick(item);
   if (expiresAtTick > 0 && instance.tick >= expiresAtTick) {
    // 本次新增份额已经在等待窗口内自然过期，不能再扣减之后落下的同签名物品。
    continue;
   }
   const itemKey = buildGroundItemKey(item);
   const entryIndex = pile.items.findIndex((entry) => entry?.itemKey === itemKey);
   if (entryIndex < 0) {
    continue;
   }
   const entry = pile.items[entryIndex];
   const removeCount = Math.max(1, Math.trunc(Number(item?.count ?? 1)));
   const remainingCount = Math.max(0, Math.trunc(Number(entry?.item?.count ?? 0)) - removeCount);
   if (remainingCount <= 0) {
    pile.items.splice(entryIndex, 1);
   }
   else {
    entry.item.count = remainingCount;
   }
   changed = true;
  }
  if (!changed) {
   return false;
  }
  if (pile.items.length === 0) {
   instance.groundPilesByTile.delete(normalizedTileIndex);
   instance.localGroundPileViewCacheBySourceId.delete(buildGroundSourceId(normalizedTileIndex));
  }
  else {
   pile.items.sort(compareGroundEntries);
  }
  instance.markGroundItemPersistenceDirty(normalizedTileIndex);
  instance.markFengShuiDirtyAfterRoomInfluenceChange(normalizedTileIndex, 'ground_item_transaction_reverted');
  instance.persistentRevision += 1;
  instance.worldRevision += 1;
  return true;
}

export function restoreGroundTileItemsForAssetMutationImpl(instance: MapInstanceRuntime, tileIndex, items) {
  const normalizedTileIndex = Math.trunc(Number(tileIndex));
  if (normalizedTileIndex < 0 || normalizedTileIndex >= instance.auraByTile.length) {
   return;
  }
  const normalizedItems = (Array.isArray(items) ? items : [])
   .map((item) => normalizePersistedGroundItem(item))
   .filter((item) => Boolean(item));
  if (normalizedItems.length === 0) {
   instance.groundPilesByTile.delete(normalizedTileIndex);
   instance.localGroundPileViewCacheBySourceId.delete(buildGroundSourceId(normalizedTileIndex));
  }
  else {
   const mergedItems = [];
   for (const item of normalizedItems) {
    mergeGroundItemEntry(mergedItems, item);
   }
   mergedItems.sort(compareGroundEntries);
   instance.groundPilesByTile.set(normalizedTileIndex, {
    sourceId: buildGroundSourceId(normalizedTileIndex),
    x: instance.tilePlane.getX(normalizedTileIndex),
    y: instance.tilePlane.getY(normalizedTileIndex),
    tileIndex: normalizedTileIndex,
    items: mergedItems,
   });
  }
  instance.markGroundItemPersistenceDirty(normalizedTileIndex);
  instance.markFengShuiDirtyAfterRoomInfluenceChange(normalizedTileIndex, 'ground_item_transaction_restored');
  instance.persistentRevision += 1;
  instance.worldRevision += 1;
}

export function ensureGroundItemExpiryDefaultsImpl(instance: MapInstanceRuntime, currentTick = this.tick) {
  if (instance.groundPilesByTile.size === 0) {
   return false;
  }
  let changed = false;
  for (const [tileIndex, pile] of instance.groundPilesByTile.entries()) {
   if (!pile || !Array.isArray(pile.items)) {
    continue;
   }
   let tileChanged = false;
   for (const entry of pile.items) {
    if (!entry?.item || getGroundItemExpiresAtTick(entry.item) > 0) {
     continue;
    }
    normalizeGroundRuntimeItemExpiry(entry.item, currentTick);
    tileChanged = true;
   }
   if (tileChanged) {
    instance.markGroundItemPersistenceDirty(tileIndex);
    changed = true;
   }
  }
  if (changed) {
   instance.persistentRevision += 1;
  }
  return changed;
}

export function advanceGroundItemExpiryImpl(instance: MapInstanceRuntime, currentTick = this.tick) {
  if (instance.groundPilesByTile.size === 0) {
   return false;
  }
  const normalizedTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
  instance.ensureGroundItemExpiryDefaults(normalizedTick);
  let changed = false;
  const toDelete = [];
  for (const [tileIndex, pile] of instance.groundPilesByTile.entries()) {
   if (!pile || !Array.isArray(pile.items)) {
    toDelete.push(tileIndex);
    instance.markGroundItemPersistenceDirty(tileIndex);
    changed = true;
    continue;
   }
   const before = pile.items.length;
   pile.items = pile.items.filter((entry) => {
    const expiresAtTick = getGroundItemExpiresAtTick(entry?.item);
    return expiresAtTick <= 0 || normalizedTick < expiresAtTick;
   });
   if (pile.items.length === before) {
    continue;
   }
   if (pile.items.length === 0) {
    toDelete.push(tileIndex);
    instance.localGroundPileViewCacheBySourceId.delete(buildGroundSourceId(tileIndex));
   }
   else {
    pile.items.sort(compareGroundEntries);
   }
   instance.markGroundItemPersistenceDirty(tileIndex);
   instance.markFengShuiDirtyAfterRoomInfluenceChange(tileIndex, 'ground_item_expired');
   changed = true;
  }
  for (const tileIndex of toDelete) {
   instance.groundPilesByTile.delete(tileIndex);
  }
  if (changed) {
   instance.persistentRevision += 1;
   instance.worldRevision += 1;
  }
  return changed;
}

export function dropGroundItemImpl(instance: MapInstanceRuntime, x, y, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return null;
  }

  const normalizedCount = Math.max(1, Math.trunc(item.count));
  const runtimeItem = createGroundRuntimeItem({
   ...item,
   count: normalizedCount,
  }, instance.tick);

  const itemKey = buildGroundItemKey(runtimeItem);

  const tileIndex = instance.toTileIndex(x, y);

  const existingPile = instance.groundPilesByTile.get(tileIndex);

  let changed = false;
  if (existingPile) {

   const mergeResult = mergeGroundItemEntry(existingPile.items, {
    ...runtimeItem,
   });
   if (!mergeResult.merged) {
    existingPile.items.sort(compareGroundEntries);
   }
   changed = true;
   if (changed) {
    instance.markGroundItemPersistenceDirty(tileIndex);
    instance.markFengShuiDirtyAfterRoomInfluenceChange(tileIndex, 'ground_item_changed');
    instance.persistentRevision += 1;
    instance.worldRevision += 1;
   }
   return toGroundPileView(existingPile);
  }

  const pile = {
   sourceId: buildGroundSourceId(tileIndex),
   x,
   y,
   tileIndex,
   items: [{
    itemKey,
    item: {
     ...runtimeItem,
    },
   }],
  };
  instance.groundPilesByTile.set(tileIndex, pile);
  instance.markGroundItemPersistenceDirty(tileIndex);
  instance.markFengShuiDirtyAfterRoomInfluenceChange(tileIndex, 'ground_item_added');
  instance.persistentRevision += 1;
  instance.worldRevision += 1;
  return toGroundPileView(pile);
}

export function rollTileDropsImpl(instance: MapInstanceRuntime, tileState, appliedDamage, destroyed, options: TileDropRollOptions = {}) {
  const config = resolveTileDurabilityProfile(tileState?.tileType, tileState);
  if (!config) {
   return [];
  }
  const drops = [];
  const mineralLevel = Number.isFinite(tileState?.mineralLevel) ? Math.max(1, Math.trunc(tileState.mineralLevel)) : Number.isFinite(Number(instance.template?.source?.mapLv))
   ? Math.max(1, Math.floor(Number(instance.template.source.mapLv)))
   : 1;
  const isMineralDrop = Number.isFinite(Number(config.miningLevel)) && Number(config.miningLevel) > 0;
  const legacyDamageMultiplier = isMineralDrop ? 0 : resolveTileDamageDropMultiplier(appliedDamage);
  for (const entry of config.damageDrops ?? []) {
   if (isMineralDrop) {
    const expectedCount = computeMiningDamageDropExpectedCount({
     baseChanceBps: entry?.chanceBps,
     baseCount: entry?.count,
     appliedDamage,
     maxHp: tileState?.maxHp,
     mineralLevel,
     attackerRealmLevel: options?.miningAttackerRealmLevel ?? mineralLevel,
     otherMultiplier: options?.miningOtherDropMultiplier,
     aoeHitCount: options?.miningAoeHitCount,
    });
    const count = rollMiningExpectedDropCount(expectedCount);
    if (count > 0) {
     drops.push({ itemId: entry.itemId, count, reason: 'damage' });
    }
    continue;
   }
   const chanceBps = Math.max(0, Math.min(10000, Math.trunc(Number(entry?.chanceBps) || 0) * legacyDamageMultiplier));
   if (chanceBps > 0 && Math.random() * 10000 < chanceBps) {
    drops.push({ itemId: entry.itemId, count: Math.max(1, Math.trunc(Number(entry.count) || 1)), reason: 'damage' });
   }
  }
  const crystal = MINERAL_CRYSTALS.find((entry) => entry.tileType === tileState?.tileType);
  if (crystal && options.miningCrystalLuckBonus !== undefined
   && Math.random() < computeMineralCrystalDropChance(appliedDamage, tileState.maxHp, options.miningCrystalLuckBonus)) {
   drops.push({ itemId: crystal.itemId, count: 1, reason: 'damage' });
  }
  if (destroyed === true) {
   for (const entry of config.destroyDrops ?? []) {
    drops.push({ itemId: entry.itemId, count: Math.max(1, Math.trunc(Number(entry.count) || 1)), reason: 'destroy' });
   }
  }
  return drops;
}

export function getTileTraversalCostImpl(instance: MapInstanceRuntime, x, y, playerId = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isInBounds(x, y)) {
   return Number.POSITIVE_INFINITY;
  }
  if (instance.isDynamicallyBlockedTile(x, y, playerId)) {
   return Number.POSITIVE_INFINITY;
  }
  return instance.getStaticTileTraversalCost(x, y);
}

export function getStaticTileTraversalCostImpl(instance: MapInstanceRuntime, x, y) {
  if (!instance.isInBounds(x, y)) {
   return Number.POSITIVE_INFINITY;
  }
  const tileIndex = instance.toTileIndex(x, y);
  if (!instance.isCellIndexWalkable(tileIndex)) {
   return Number.POSITIVE_INFINITY;
  }
  const movementCostOverride = instance.template?.movementCostOverrideByTile?.[tileIndex] ?? 0;
  if (Number.isFinite(movementCostOverride) && movementCostOverride > 0) {
   return Math.max(1, Math.trunc(movementCostOverride));
  }
  if (instance.tileDamageByTile.get(tileIndex)?.destroyed === true) {
   const destroyedState = instance.getDestroyedTileLayerStateByCellIndex(tileIndex);
   return getLayeredTileTraversalCost(destroyedState.terrainType, destroyedState.surfaceType ?? null);
  }
  const state = typeof instance.tilePlane.getTileLayerState === 'function'
   ? instance.tilePlane.getTileLayerState(tileIndex)
   : null;
  if (state) {
   return getLayeredTileTraversalCost(state.terrain, state.surface ?? null);
  }
  return getTileTraversalCost(instance.getEffectiveTileTypeByCellIndex(tileIndex));
}

export function getTileQiDrainPerTickImpl(instance: MapInstanceRuntime, x, y) {
  if (!instance.isInBounds(x, y)) {
   return 0;
  }
  const tileIndex = instance.toTileIndex(x, y);
  const value = instance.template?.qiDrainByTile?.[tileIndex] ?? 0;
  return Number.isFinite(value) && value > 0 ? Math.max(0, Math.trunc(value)) : 0;
}

export function findNearestOpenTileImpl(instance: MapInstanceRuntime, originX, originY, playerId = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (instance.isOpenTile(originX, originY, playerId)) {
   return { x: originX, y: originY };
  }

  const minBoundX = Number.isFinite(Number(instance.tilePlane?.minX)) ? Math.trunc(Number(instance.tilePlane.minX)) : 0;
  const maxBoundX = Number.isFinite(Number(instance.tilePlane?.maxX)) ? Math.trunc(Number(instance.tilePlane.maxX)) : instance.template.width - 1;
  const minBoundY = Number.isFinite(Number(instance.tilePlane?.minY)) ? Math.trunc(Number(instance.tilePlane.minY)) : 0;
  const maxBoundY = Number.isFinite(Number(instance.tilePlane?.maxY)) ? Math.trunc(Number(instance.tilePlane.maxY)) : instance.template.height - 1;
  const maxRadius = Math.max(maxBoundX - minBoundX + 1, maxBoundY - minBoundY + 1);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
   const minX = Math.max(minBoundX, originX - radius);
   const maxX = Math.min(maxBoundX, originX + radius);

   const minY = Math.max(minBoundY, originY - radius);

   const maxY = Math.min(maxBoundY, originY + radius);
   for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
     if (Math.abs(x - originX) !== radius && Math.abs(y - originY) !== radius) {
      continue;
     }
     if (instance.isOpenTile(x, y, playerId)) {
      return { x, y };
     }
    }
   }
  }
  return null;
}

export function clampToRuntimeTileBoundsImpl(instance: MapInstanceRuntime, value, axis) {
  const normalized = Math.trunc(Number(value) || 0);
  const minKey = axis === 'y' ? 'minY' : 'minX';
  const maxKey = axis === 'y' ? 'maxY' : 'maxX';
  const fallbackMax = axis === 'y' ? instance.template.height - 1 : instance.template.width - 1;
  const min = Number.isFinite(Number(instance.tilePlane?.[minKey])) ? Math.trunc(Number(instance.tilePlane[minKey])) : 0;
  const max = Number.isFinite(Number(instance.tilePlane?.[maxKey])) ? Math.trunc(Number(instance.tilePlane[maxKey])) : fallbackMax;
  return Math.max(min, Math.min(max, normalized));
}

export function isOpenTileImpl(instance: MapInstanceRuntime, x, y, playerId = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!instance.isWalkable(x, y, playerId)) {
   return false;
  }

  const tileIndex = instance.toTileIndex(x, y);
  if (instance.npcIdByTile.has(tileIndex)) {
   return false;
  }
  if (instance.monsterRuntimeIdByTile.has(tileIndex)) {
   return false;
  }
  if (instance.occupancy[tileIndex] !== INVALID_OCCUPANCY && !instance.isPlayerOverlapTile(x, y)) {
   return false;
  }
  return true;
}

export function getOrCreateTileResourceBucketImpl(instance: MapInstanceRuntime, resourceKey) {
  const existing = instance.tileResourceBuckets.get(resourceKey);
  if (existing) {
   return existing;
  }
  const bucket = new Float64Array(Math.max(instance.tilePlane.getCellCapacity(), instance.occupancy.length));
  instance.tileResourceBuckets.set(resourceKey, bucket);
  return bucket;
}

export function getOrCreateBaseTileResourceBucketImpl(instance: MapInstanceRuntime, resourceKey) {
  const existing = instance.baseTileResourceBuckets.get(resourceKey);
  if (existing) {
   return existing;
  }
  const bucket = new Float64Array(Math.max(instance.tilePlane.getCellCapacity(), instance.occupancy.length));
  instance.baseTileResourceBuckets.set(resourceKey, bucket);
  return bucket;
}

export function getOrCreateTileResourceFlowRemainderBucketImpl(instance: MapInstanceRuntime, resourceKey) {
  const existing = instance.tileResourceFlowRemainderBuckets.get(resourceKey);
  if (existing) {
   return existing;
  }
  const bucket = new Float64Array(Math.max(instance.tilePlane.getCellCapacity(), instance.occupancy.length));
  instance.tileResourceFlowRemainderBuckets.set(resourceKey, bucket);
  return bucket;
}

export function updateTileResourceFlowIndexImpl(instance: MapInstanceRuntime, resourceKey, tileIndex, value = this.getTileResourceValueByIndex(resourceKey, tileIndex)) {
  if (!isNaturalAuraFlowResource(resourceKey) || !Number.isFinite(Number(tileIndex))) {
   return;
  }
  const normalizedTileIndex = Math.max(0, Math.trunc(Number(tileIndex)));
  const current = normalizeTileResourceValue(value);
  const base = normalizeTileResourceValue(instance.getTileResourceBaseValueByIndex(resourceKey, normalizedTileIndex));
  let tileIndices = instance.tileResourceFlowIndicesByKey.get(resourceKey);
  if (areTileResourceValuesEqual(current, base)) {
   if (tileIndices instanceof Set) {
    tileIndices.delete(normalizedTileIndex);
    if (tileIndices.size <= 0) {
     instance.tileResourceFlowIndicesByKey.delete(resourceKey);
    }
   }
   return;
  }
  if (!(tileIndices instanceof Set)) {
   tileIndices = new Set();
   instance.tileResourceFlowIndicesByKey.set(resourceKey, tileIndices);
  }
  tileIndices.add(normalizedTileIndex);
}

export function rebuildTileResourceFlowIndicesImpl(instance: MapInstanceRuntime) {
  instance.tileResourceFlowIndicesByKey.clear();
  for (const [resourceKey, bucket] of instance.tileResourceBuckets.entries()) {
   if (!isNaturalAuraFlowResource(resourceKey)) {
    continue;
   }
   const baseBucket = instance.baseTileResourceBuckets.get(resourceKey);
   for (let tileIndex = 0; tileIndex < bucket.length; tileIndex += 1) {
    const current = normalizeTileResourceValue(bucket[tileIndex]);
    const base = normalizeTileResourceValue(baseBucket?.[tileIndex]);
    if (!areTileResourceValuesEqual(current, base)) {
     instance.updateTileResourceFlowIndex(resourceKey, tileIndex, current);
    }
   }
  }
}

export function getTileResourceBaseValueByIndexImpl(instance: MapInstanceRuntime, resourceKey, tileIndex) {
  return instance.baseTileResourceBuckets.get(resourceKey)?.[tileIndex] ?? 0;
}

export function getTileResourceValueByIndexImpl(instance: MapInstanceRuntime, resourceKey, tileIndex) {
  const bucket = resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY
   ? instance.auraByTile
   : instance.tileResourceBuckets.get(resourceKey);
  return bucket?.[tileIndex] ?? 0;
}

export function setTileResourceValueByIndexImpl(instance: MapInstanceRuntime, resourceKey, tileIndex, next, previous = this.getTileResourceValueByIndex(resourceKey, tileIndex)) {
  instance.ensureCellStorageCapacity(tileIndex + 1);
  const bucket = instance.getOrCreateTileResourceBucket(resourceKey);
  const normalizedPrevious = normalizeTileResourceValue(previous);
  const normalizedNext = normalizeTileResourceValue(next);
  if (areTileResourceValuesEqual(normalizedPrevious, normalizedNext)) {
   return;
  }
  bucket[tileIndex] = normalizedNext;
  instance.applyTileResourceDirtyCounter(resourceKey, tileIndex, normalizedPrevious, normalizedNext);
  instance.updateTileResourceFlowIndex(resourceKey, tileIndex, normalizedNext);
  if (resourceKey !== DEFAULT_TILE_AURA_RESOURCE_KEY && (instance.changedTileResourceEntryCountByKey.get(resourceKey) ?? 0) <= 0) {
   instance.tileResourceBuckets.delete(resourceKey);
  }
  instance.markTileResourcePersistenceDirty(resourceKey, tileIndex);
  instance.markFengShuiDirtyAfterRoomInfluenceChange(tileIndex, 'tile_resource_changed');
  instance.persistentRevision += 1;
}

export function isSectVirtualBoundaryTileImpl(instance: MapInstanceRuntime, x, y) {
  if (instance.template?.source?.sectMap !== true) {
   return false;
  }
  const tx = Math.trunc(Number(x));
  const ty = Math.trunc(Number(y));
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || instance.tilePlane.getCellIndex(tx, ty) >= 0) {
   return false;
  }
  for (let dy = -1; dy <= 1; dy += 1) {
   for (let dx = -1; dx <= 1; dx += 1) {
    if (dx === 0 && dy === 0) {
     continue;
    }
    if (instance.tilePlane.getCellIndex(tx + dx, ty + dy) >= 0) {
     return true;
    }
   }
  }
  return false;
}

export function toTileIndexImpl(instance: MapInstanceRuntime, x, y) {
  return instance.tilePlane.getCellIndex(x, y);
}

