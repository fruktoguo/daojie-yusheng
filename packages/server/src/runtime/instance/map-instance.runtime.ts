/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 地图实例运行时核心。
 * 单张地图的全部运行态：地块平面、占位、妖兽 AI、战斗、建筑、
 * 资源刷新、灵气流动、AOI 广播和持久化脏域追踪。
 */
import { BUILDING_TOPOLOGY_BLOCKS_MOVE, BUILDING_TOPOLOGY_BLOCKS_SIGHT, DEFAULT_AGGRO_THRESHOLD, DEFAULT_PASSIVE_THREAT_PER_TICK, DEFAULT_QI_RESOURCE_DESCRIPTOR, DEFAULT_QI_RUNTIME_FLOW_CONFIGS, DISPERSED_AURA_RESOURCE_KEY, Direction, ELEMENT_KEYS, GROUND_ITEM_EXPIRE_TICKS, LOST_TARGET_THREAT_DECAY_RATIO, LOST_TARGET_THREAT_FLAT_DECAY_HP_RATIO, MAX_INSTANCE_TICK_SPEED, MAX_THREAT_VALUE, MOVE_POINT_UNIT, OWNER_ONLY_ACCESS_POLICY, QI_HALF_LIFE_RATE_SCALE, StructureType, TECHNIQUE_UNIFICATION_PLATFORM_DEF_ID, TERRAIN_DESTROYED_RESTORE_TICKS, TERRAIN_REGEN_RATE_PER_TICK, TERRAIN_RESTORE_RETRY_DELAY_TICKS, THREAT_DISTANCE_FALLOFF_PER_TILE, TILE_AURA_HALF_LIFE_RATE_SCALE, TILE_AURA_HALF_LIFE_RATE_SCALED, TerrainType, TileType, buildEffectiveTargetingGeometry, buildQiResourceKey, calcQiCostWithOutputLimit, calculateDispersedAuraGainPerTile, calculateTerrainDurability, cloneAccessPolicy, composeTileTypeFromLayers, computeAffectedCellsFromAnchor, createItemStackSignature, createNumericStats, doesTileTypeBlockSight, getEffectiveMoveSpeed, getLayeredTileTraversalCost, getMaxStoredMovePoints, getMovePointsPerTick, getStructureDurabilityProfile, getTileTraversalCost, getTileTypeFromMapChar, horizontalFacingFromDelta, horizontalFacingFromTo, isGroundInteractableCellLayerTarget, isOffsetInRange, isTileTypeWalkable, mergeItemStackEntryInto, normalizeHorizontalFacing, normalizeStructureType, normalizeSurfaceType, normalizeTerrainType, parseQiResourceKey, percentModifierToMultiplier, resolveDefaultTileLayerFallback, resolveMonsterTemplateRecord, resolvePlayerFacingContentName, resolveSkillRequiresTarget, resolveTileLayerSeedFromTemplateContext, resolveTileLayerSeedFromTileType, validateAccessPolicy } from '@mud/shared';
import { MINERAL_CRYSTALS, computeMineralCrystalDropChance, computeMiningDamageDropExpectedCount, rollMiningExpectedDropCount } from '@mud/shared';
import '../map/map-template.repository';
import { RuntimeTilePlane } from '../map/runtime-tile-plane';
import { BuildingTopologyIndex } from '../building/building-topology-index.service';
import { createRuntimeTilePlaneRoomCellProvider, detectRooms, isRoomTopologyTileType, isStaticRoomBoundaryTile } from '../building/room-detection.service';
import { calculateFengShuiSnapshot, inferRoomRole } from '../building/fengshui-calculator.service';
import { getDefaultBuildingRuntime } from '../building/building-default-content';
import {
 applyMapInstanceOrdinaryTileDamageMutation,
 damageMapInstanceTilesBatch,
 type TileDamageBatchInput,
 type TileDropRollOptions,
} from './map-instance-tile-damage-batch.helpers';
import { resolveCompiledBuildingDefinition } from '../building/building-definition-resolution.helpers';
import { CombatPendingCastCancelReason, cancelPendingCombatCast, createMonsterPendingCombatCast, createMonsterSkillActionFromPendingCast, createMonsterSkillCancelActionFromPendingCast, resolvePendingCombatCastCancellation } from '../combat/pending-combat-cast.helpers';
import { createRuntimeTemporaryBuff, refreshRuntimeTemporaryBuffPrototype } from '../player/runtime-buff-instance';
import { canPlayerIgnoreStaticObstacle as canPlayerIgnoreStaticObstacleFromState } from '../player/player-movement-capability.helpers';
import { resolveTileDamageDropMultiplier } from '../world/combat/tile-drop.helpers';
import { findBuildingProtectedPlacementConflict } from '../world/building-protected-placement.helpers';
import { CombatReactionRegistry } from '../combat/combat-reaction-registry';
import { registerMonsterCombatReactions } from '../combat/reactions/monster/register-monster-reactions';
import {
 DUNGEON_PRESSURE_BUFF_ID,
 DUNGEON_PRESSURE_COMBAT_STAT_KEYS,
 DUNGEON_PRESSURE_ELEMENT_KEYS,
 getLineCells,
 resolveDungeonPressureCombatMultiplier,
 resolveDungeonPressureMoveSpeedMultiplier,
} from '@mud/shared';
import { chooseMonsterSkill as chooseMonsterSkillFromAiRegistry } from '../monster-ai/index';
import {
  DEFAULT_TILE_AURA_RESOURCE_KEY,
  TILE_RESOURCE_EPSILON,
  MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT,
  MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT,
  DIRECTION_OFFSET,
  addNumericDirtyKey,
  addTileResourceDirtyKey,
  applyCompiledBuildingToRoomAggregate,
  applyMonsterInitialBuffs,
  areAllMonstersAlive,
  areAllMonstersDefeated,
  areInteractableKindListsEqual,
  areTileResourceValuesEqual,
  buildEffectiveMonsterSkillGeometry,
  buildGroundItemKey,
  buildGroundSourceId,
  buildMonsterAttackDamage,
  buildMonsterSkillAffectedCells,
  buildMonsterSpawnKey,
  buildSkippedBuildingRecord,
  buildingUsesActiveTopology,
  calculateTileRestoreRetryTicks,
  calculateTileRestoreTicks,
  canAttemptTerrainStabilizerHpRecovery,
  chebyshevDistance,
  chooseMonsterSkill,
  chooseMonsterStep,
  clearMapInstanceDirtyDomains,
  clearMapInstancePersistenceDeltaDomain,
  commitMonsterSkillCast,
  compareGroundEntries,
  compareGroundPiles,
  compareLocalContainers,
  compareLocalLandmarks,
  compareLocalMonsters,
  compareLocalNpcs,
  compareLocalSafeZones,
  compiledBuildingAffectsFengShui,
  compiledBuildingAffectsRoomBoundaryTopology,
  countAliveMonsters,
  countBuildingCellReferences,
  createGroundRuntimeItem,
  createMapInstanceDirtyDomainSet,
  createRoomAggregate,
  doesTemporaryBuffAffectAttributes,
  ensureMonsterInitialBuffs,
  findGroundEntryIndex,
  freezeRuntimeProjection,
  getGroundItemExpiresAtTick,
  getMonsterSkillWarningColor,
  getMonsterSkillWindupTicks,
  getTileResourceFlowRate,
  getTileResourceMinimumDecayPerTick,
  hasTerrainStabilizerHpRecoveryAt,
  inspectPersistedBuildingCellRecovery,
  isIndoorSubspaceTemplate,
  isNaturalAuraFlowResource,
  isOrdinaryMonster,
  isRuntimeBuffActive,
  isSameGroundPileView,
  isSameTemporaryBuffAttributePayload,
  isSameTemporaryBuffPrototypePayload,
  isTimeChamberBuildingForRuntime,
  isTreasureVaultBuildingForRuntime,
  iterateBuildingProtectedPlacementPoints,
  markMapInstanceDirtyDomainHighPriority,
  markMapInstanceDirtyDomains,
  markMapInstancePersistenceFullReplaceDomains,
  mergeGroundItemEntry,
  nextPowerOfTwo,
  normalizeBuildingDeconstructPreviousState,
  normalizeBuildingId,
  normalizeBuildingRemainingTicks,
  normalizeBuildingRotation,
  normalizeBuildingState,
  normalizeExplicitBuildingAccessPolicies,
  normalizeGroundRuntimeItemExpiry,
  normalizePersistedBuildingProgress,
  normalizePersistedGroundItem,
  normalizeTileResourceValue,
  normalizeTileRestoreTicksLeft,
  parseGroundSourceId,
  recalculateMonsterBaseStatsFromFormula,
  recalculateMonsterDerivedState,
  recoverMonsterHp,
  recoverMonsterQi,
  resolveBuildingCatalogRevision,
  resolveBuildingCombatTargetName,
  resolveBuildingCombatTargetPriority,
  resolveBuildingCombatTileType,
  resolveBuildingDeconstructionTotalWork,
  resolveBuildingRemainingTicks,
  resolveMonsterRespawnTicksWithBonus,
  resolveMonsterSkillAnchor,
  resolvePersistedBuildingCells,
  resolvePersistedBuildingPreviousTileTypes,
  resolvePreviousBuildingInteractableKinds,
  resolvePreviousBuildingLayerValue,
  resolvePreviousBuildingNullableLayerValue,
  resolvePreviousBuildingTileType,
  resolveTemplateLayerSeed,
  resolveTerrainHpRecoveryAmount,
  resolveTileDurability,
  resolveTileDurabilityProfile,
  restoreSkippedPersistedBuildingTileCells,
  rotationToIndex,
  setChunkRevision,
  shouldMarkTimePersistenceDirty,
  shouldProjectLocalBuilding,
  snapshotContainer,
  snapshotGroundPile,
  snapshotLandmark,
  snapshotMonster,
  snapshotNpc,
  snapshotSafeZone,
  tickTemporaryBuffs,
  toGroundPileView,
  toInventoryItemFromGroundItem,
} from './map-instance.runtime.helpers';
import {
  acquirePersistenceDomainHoldImpl,
  applyPersistedTileLayersImpl,
  applyTileResourceDirtyCounterImpl,
  buildAuraPersistenceEntriesImpl,
  buildBuildingCellPersistenceEntriesImpl,
  buildBuildingPersistenceEntriesImpl,
  buildBuildingRoomFengShuiPersistenceStateImpl,
  buildGroundPersistenceDeltaImpl,
  buildGroundPersistenceEntriesImpl,
  buildMonsterRuntimePersistenceDeltaImpl,
  buildMonsterRuntimePersistenceEntriesImpl,
  buildOverlayPersistenceChunksImpl,
  buildRoomCellPersistenceEntriesImpl,
  buildRuntimeTilePersistenceEntriesImpl,
  buildTemporaryTilePersistenceEntriesImpl,
  buildTileDamagePersistenceDeltaImpl,
  buildTileDamagePersistenceEntriesImpl,
  buildTileResourcePersistenceDeltaImpl,
  buildTileResourcePersistenceEntriesImpl,
  capturePersistenceDomainFlushSnapshotImpl,
  clearDirtyDomainsImpl,
  consumeStaticTileSyncDirtyTilesImpl,
  getDirtyDomainFirstMarkedAtImpl,
  getDirtyDomainsImpl,
  getPersistenceDomainRevisionImpl,
  getPersistenceRevisionImpl,
  getStagedPersistenceDomainRevisionImpl,
  getStaticPathingRevisionImpl,
  getStaticTileSyncRevisionImpl,
  hydrateAuraImpl,
  hydrateBuildingRoomFengShuiStateImpl,
  hydrateGroundPilesImpl,
  hydrateMonsterRuntimeStatesImpl,
  hydrateOverlayChunksImpl,
  hydrateRuntimeTilesImpl,
  hydrateTemporaryTilesImpl,
  hydrateTileDamageImpl,
  hydrateTileResourcesImpl,
  hydrateTimeImpl,
  isDirtyDomainHighPriorityImpl,
  isPersistenceDomainHeldImpl,
  isPersistentDirtyImpl,
  markAuraPersistedImpl,
  markGroundItemPersistenceDirtyImpl,
  markMonsterRuntimePersistenceDirtyImpl,
  markPersistenceDirtyDomainsHighPriorityImpl,
  markPersistenceDirtyDomainsImpl,
  markPersistenceDomainsPersistedImpl,
  markPersistenceDomainsStagedImpl,
  markStaticTileSyncDirtyByIndexImpl,
  markTileDamagePersistenceDirtyBatchHighPriorityImpl,
  markTileDamagePersistenceDirtyHighPriorityImpl,
  markTileDamagePersistenceDirtyImpl,
  markTileResourcePersistenceDirtyHighPriorityImpl,
  markTileResourcePersistenceDirtyImpl,
  runExclusivePersistenceDomainMutationImpl,
  shouldNormalizePersistedRuntimeTileLayersImpl,
  shouldNormalizePersistedRuntimeTileToDefaultFallbackImpl,
  snapshotImpl,
  updateAuraDirtyStateImpl,
} from './map-instance.persistence';
import {
  activatePlacedBuildingTopologyAndVisualImpl,
  advanceBuildingConstructionImpl,
  advanceBuildingHpRecoveryByTerrainStabilizerImpl,
  applyBuildingTopologyForBuildingImpl,
  applyBuildingVisualTileTypeImpl,
  buildRoomAggregatesImpl,
  captureBuildingPreviousTileStateImpl,
  clearTileDamageForBuildingVisualCellsImpl,
  collectBuildingEntriesForRoomAggregateImpl,
  collectBuildingIdsAtCellForAggregateImpl,
  collectExpectedSectBuildingVisualStructuresImpl,
  collectLocalBuildingsImpl,
  collectRoomInfluenceRoomIdsByCellImpl,
  configureBuildingRuntimeImpl,
  deconstructBuildingInstanceImpl,
  ensurePendingBuildingRoomFengShuiDomainImpl,
  finalizePendingBuildingRoomFengShuiChangesImpl,
  getActiveBuildingCombatStateAtCellIndexImpl,
  getBuildingRoomFengShuiAtImpl,
  getBuildingRoomFengShuiFinalizeIntervalTicksImpl,
  getBuildingsAtTileImpl,
  getDestroyedTileLayerStateByCellIndexImpl,
  getEffectiveTileTypeByCellIndexImpl,
  getFengShuiLuckAtImpl,
  getFengShuiSnapshotAtImpl,
  getFengShuiSnapshotImpl,
  getLocalBuildingViewEntryImpl,
  getOrCreatePendingBuildingRoomFengShuiStateImpl,
  getPrimaryBuildingAtTileImpl,
  hasBuildingLayerOverlapAtCellImpl,
  hasPendingBuildingRoomFengShuiChangesImpl,
  isCellInRoomInfluenceImpl,
  isRoomTopologyCellImpl,
  listBuildingSummariesImpl,
  listPrunableTimeChamberBuildingsImpl,
  listPrunableVaultBuildingsImpl,
  listRoomSummariesImpl,
  markFengShuiDirtyAfterRoomInfluenceChangeImpl,
  markFengShuiDirtyRoomImpl,
  markRoomsAndFengShuiDirtyAfterTopologyChangeImpl,
  placeBuildingInstanceImpl,
  rebuildBuildingRoomFengShuiStateImpl,
  rebuildBuildingTopologyCellsImpl,
  rebuildRoomCellIndicesImpl,
  recalculateFengShuiAfterRoomInfluenceChangeImpl,
  recalculateFengShuiForRoomIdsImmediatelyImpl,
  recalculateRoomsAndFengShuiAfterTopologyChangeImpl,
  recalculateRoomsAndFengShuiImmediatelyAfterTopologyChangeImpl,
  releasePendingBuildingRoomFengShuiStateImpl,
  removeOrphanSectBuildingVisualsImpl,
  repairBuildingRoomFengShuiStateImpl,
  resolveBuildingRoomIdImpl,
  resolveDefaultTileLayerFallbackForCellImpl,
  restoreBuildingPreviousTileStateImpl,
  scanOrphanSectBuildingVisualsImpl,
  setRoomRoleImpl,
  shouldFinalizePendingBuildingRoomFengShuiChangesImpl,
  shouldRecalculateRoomsForTileMutationImpl,
  startBuildingConstructionImpl,
  startBuildingDeconstructionImpl,
  stopBuildingConstructionImpl,
  stopBuildingDeconstructionImpl,
  updateBuildingAccessPolicyStateImpl,
} from './map-instance.buildings';
import {
  addPlayerToChunkIndexImpl,
  buildAutoCombatViewImpl,
  buildPlayerViewImpl,
  canResolveSightCoordinateImpl,
  canSeeTileFromImpl,
  castLightImpl,
  collectCachedAutoCombatTileVisibilityImpl,
  collectLocalContainersImpl,
  collectLocalGroundPilesImpl,
  collectLocalLandmarksImpl,
  collectLocalMonstersImpl,
  collectLocalNpcsImpl,
  collectLocalPortalsImpl,
  collectLocalSafeZonesImpl,
  collectPlayersByChunkRangeImpl,
  collectVisiblePlayersImpl,
  collectVisibleTileIndicesImpl,
  collectVisibleTileVisibilityImpl,
  forEachPathingBlockerImpl,
  getLocalContainerViewEntryImpl,
  getLocalGroundPileViewEntryImpl,
  getLocalLandmarkViewEntryImpl,
  getLocalMonsterViewEntryImpl,
  getLocalNpcViewEntryImpl,
  getLocalPlayerViewEntryImpl,
  getLocalPortalViewEntryImpl,
  getLocalSafeZoneViewEntryImpl,
  getPlayerSpatialChunkKeyImpl,
  isAnyTileVisibleInCircleImpl,
  isCircleInsideViewRadiusImpl,
  isDynamicallyBlockedTileImpl,
  isTileInsideViewRadiusImpl,
  isTileSightBlockedImpl,
  isTileVisibleByFilterImpl,
  markAoiViewChangedAtImpl,
  markAoiViewChangedGloballyImpl,
  markAoiViewMovedImpl,
  nextAoiRevisionImpl,
  rememberMonsterTargetSightImpl,
  removePlayerFromChunkIndexImpl,
  resolveAoiViewRevisionImpl,
  resolveCompositeSightBlockedImpl,
  resolveMonsterLostSightChaseTargetImpl,
  setCompositeSightResolverImpl,
} from './map-instance.aoi';
import {
  addMonsterThreatImpl,
  addRuntimeMonsterImpl,
  advanceMonstersImpl,
  applyDamageToMonsterImpl,
  applyTemporaryBuffToMonsterImpl,
  canMonsterActOnTargetImpl,
  canMonsterStepTowardImpl,
  clearMonsterActiveAiStateForSleepImpl,
  clearMonsterAggroForPlayerImpl,
  clearMonsterRuntimeTileIndexImpl,
  clearMonsterTargetPursuitImpl,
  collectAutoCombatMonstersImpl,
  decayMonsterThreatsImpl,
  defeatMonsterImpl,
  engageMonsterImpl,
  getAdjacentNpcImpl,
  getHighestMonsterThreatTargetImpl,
  getMonsterAtTileImpl,
  getMonsterDamageContributionEntriesImpl,
  getMonsterImpl,
  getMonsterRuntimeRefAtTileImpl,
  getMonsterRuntimeRefImpl,
  getMonsterSpawnAccelerationStateImpl,
  getMonsterSpawnGroupImpl,
  getMonsterThreatTableImpl,
  getNpcImpl,
  handleMonsterDefeatImpl,
  handleMonsterRespawnImpl,
  initializeMonsterSpawnAccelerationStatesImpl,
  isMonsterOpenTileImpl,
  isMonsterWithinWanderRangeImpl,
  listMonsterAiWorkerMirrorsImpl,
  listMonstersImpl,
  markMonsterDefeatedImpl,
  removeRuntimeMonsterImpl,
  replaceTemporaryBuffOnMonsterImpl,
  resolveMonsterAimPositionImpl,
  resolveMonsterCombatAggroRangeImpl,
  resolveMonsterMaxAttackReachImpl,
  resolveMonsterRespawnTicksImpl,
  resolveMonsterTargetImpl,
  resolveMonsterTargetWithHintImpl,
  respawnMonsterImpl,
  setMonsterSpeechTicksImpl,
  stepMonsterIdleRoamImpl,
  tryMoveMonsterTowardImpl,
} from './map-instance.monsters';
import {
  activateRuntimeTileImpl,
  addPlayerToTileIndexImpl,
  addTileAuraImpl,
  addTileResourceImpl,
  advanceGroundItemExpiryImpl,
  advanceTemporaryTileHpRecoveryByTerrainStabilizerImpl,
  advanceTemporaryTilesImpl,
  advanceTileRecoveryImpl,
  advanceTileResourceFlowImpl,
  applyDefaultTileLayerFallbackImpl,
  applyRuntimeTerrainAreaImpl,
  canCreateTemporaryTileImpl,
  captureGroundTileItemsForAssetMutationImpl,
  clampToRuntimeTileBoundsImpl,
  collectPlayersByTileIndicesImpl,
  createTemporaryTileImpl,
  damageTileImpl,
  damageTilesBatchImpl,
  disperseQiAtImpl,
  dropGroundItemImpl,
  ensureGroundItemExpiryDefaultsImpl,
  findNearestOpenTileImpl,
  forEachRuntimeTileImpl,
  getBaseTileTypeImpl,
  getCombatTargetRuntimeRefsAtTileImpl,
  getContainerAtTileImpl,
  getContainerByIdImpl,
  getEffectiveTileTypeImpl,
  getGroundPileBySourceIdImpl,
  getGroundTileTypeByCellIndexImpl,
  getLandmarkAtTileImpl,
  getOrCreateBaseTileResourceBucketImpl,
  getOrCreateTileResourceBucketImpl,
  getOrCreateTileResourceFlowRemainderBucketImpl,
  getPlayerRuntimeRefsAtTileImpl,
  getPlayersAtTileImpl,
  getPortalAtTileImpl,
  getSafeZoneAtTileImpl,
  getStaticTileTraversalCostImpl,
  getTileAuraImpl,
  getTileCombatStateAtIndexedCellImpl,
  getTileCombatStateImpl,
  getTileGroundPileImpl,
  getTileLayerStateImpl,
  getTileQiDrainPerTickImpl,
  getTileResourceBaseValueByIndexImpl,
  getTileResourceImpl,
  getTileResourceValueByIndexImpl,
  getTileTraversalCostImpl,
  hasBlockingEntityAtImpl,
  isOpenTileImpl,
  isPlayerOverlapTileImpl,
  isPointInSafeZoneImpl,
  isSafeZoneTileImpl,
  isSectVirtualBoundaryTileImpl,
  listTileResourcesImpl,
  patchTileResourcesImpl,
  pickFirstAttackableLineTileImpl,
  rebuildTileResourceFlowIndicesImpl,
  removeAbnormalTemporaryTilesImpl,
  removeGroundItemsAfterFailedAssetDropImpl,
  removePlayerFromTileIndexImpl,
  resolveTemporaryTileAvailabilityImpl,
  restoreGroundItemsAfterFailedAssetTakeImpl,
  restoreGroundTileItemsForAssetMutationImpl,
  rollTileDropsImpl,
  setDynamicTileBlockerImpl,
  setTileResourceValueByIndexImpl,
  toTileIndexImpl,
  updateTileResourceFlowIndexImpl,
  visitTileResourcesImpl,
} from './map-instance.tiles';
import {
  addRuntimePortalImpl,
  applyMoveImpl,
  cancelPendingCommandImpl,
  connectPlayerImpl,
  disconnectPlayerImpl,
  enqueueMoveImpl,
  enqueuePortalUseImpl,
  findSpawnPointImpl,
  getInteractablePortalNearImpl,
  getPortalAtImpl,
  getStaticObstacleTraversalCostImpl,
  isCellIndexWalkableImpl,
  isWalkableImpl,
  listAllPortalsImpl,
  rechargePlayerMoveBudgetImpl,
  relocatePlayerImpl,
  setOccupiedImpl,
  setPlayerMoveSpeedImpl,
  setPlayerMovementCapabilitiesImpl,
  tickOnceImpl,
  tryPortalTransferImpl,
} from './map-instance.movement';

const DEFAULT_TILE_LAYER_FALLBACK_SEED = resolveDefaultTileLayerFallback();
const BASE_CHANT_TICK_DURATION_MS = 1000;
import { FIVE_PHASE_YUKONG_BUFF_ID } from './map-instance.monsters';
import { PLAYER_ATTACH_BLOCKED_INSTANCE_STATES, MAP_TIME_PERSISTENCE_DOMAIN } from './map-instance.movement';

import { SECT_BUILDING_VISUAL_STRUCTURE_TYPES, INVALID_OCCUPANCY } from './map-instance.buildings';
import type { PendingBuildingRoomFengShuiState } from './map-instance.buildings';

export function hasAttachedPlayerSession(sessionId: unknown): boolean {
 return typeof sessionId === 'string' && sessionId.length > 0;
}

import { DEFAULT_VIEW_RADIUS, PLAYER_SPATIAL_CHUNK_SIZE, MONSTER_LOST_SIGHT_CHASE_TICKS } from './map-instance.aoi';

export function resolveTickScaledChantDurationMs(ticks, tickSpeed = 1) {
 const normalizedTicks = Math.max(0, Math.trunc(Number(ticks) || 0));
 if (normalizedTicks <= 0) {
  return 0;
 }
 const normalizedSpeed = Number.isFinite(Number(tickSpeed)) && Number(tickSpeed) > 0
  ? Number(tickSpeed)
  : 1;
 return Math.max(1, Math.round((normalizedTicks * BASE_CHANT_TICK_DURATION_MS) / normalizedSpeed));
}
export function resolveRuntimeThreatDistanceMultiplier(distance) {
 const normalizedDistance = Math.max(0, Math.trunc(Number(distance) || 0));
 if (normalizedDistance <= 1) {
  return 1;
 }
 return THREAT_DISTANCE_FALLOFF_PER_TILE ** (normalizedDistance - 1);
}
export function resolveRuntimeExtraAggroThreatMultiplier(extraAggroRate) {
 const rate = Number(extraAggroRate) || 0;
 if (rate > 0) {
  return 1 + rate / 100;
 }
 if (rate < 0) {
  return 100 / (100 - rate);
 }
 return 1;
}
export function calculateRuntimeThreatDelta(baseThreat, distance, extraAggroRate) {
 const normalizedBase = Math.max(0, Number(baseThreat) || 0);
 if (normalizedBase <= 0) {
  return 0;
 }
 const delta = normalizedBase
  * resolveRuntimeThreatDistanceMultiplier(distance)
  * resolveRuntimeExtraAggroThreatMultiplier(extraAggroRate);
 if (!Number.isFinite(delta) || delta <= 0) {
  return 0;
 }
 return Math.min(MAX_THREAT_VALUE, delta);
}
export function isAbnormalTemporaryTileState(state, expiresAtTick, currentTick) {
 const sourceSkillId = typeof state?.sourceSkillId === 'string' ? state.sourceSkillId.trim() : '';
 if (!LEGACY_YI_KUNLUN_TEMPORARY_TILE_SKILL_IDS.has(sourceSkillId)) {
  return false;
 }
 if (expiresAtTick - currentTick <= LEGACY_TEMPORARY_TILE_SUSPECT_REMAINING_TICKS) {
  return false;
 }
 return state?.tileType === TileType.Stone;
}
export function compareRuntimeThreatEntry(left, right) {
 return right.value - left.value
  || right.lastUpdatedAt - left.lastUpdatedAt
  || left.targetId.localeCompare(right.targetId, 'zh-Hans-CN');
}

const LEGACY_YI_KUNLUN_TEMPORARY_TILE_SKILL_IDS = new Set([
 'skill.yi_kunlun_point_stone',
 'skill.yi_kunlun_hollow_square',
 'skill.yi_kunlun_horizontal_wall',
]);
const LEGACY_TEMPORARY_TILE_SUSPECT_REMAINING_TICKS = 600;

/** MapInstanceRuntime：地图实例运行时实现。 */
class MapInstanceRuntime {
 readonly damageReactionRegistry = new CombatReactionRegistry();
 /**
  * meta：meta相关字段。
  */

 meta;
 /**
* template：template相关字段。
*/

 template;
 /**
* tilePlane：运行时稀疏坐标地块平面。
*/

 tilePlane;
 /**
* occupancy：occupancy相关字段。
*/

 occupancy;
 /**
* auraByTile：默认灵气资源桶兼容视图。
*/

 auraByTile;
 /**
* tileResourceBuckets：按资源键拆分的地块资源桶。
*/

 tileResourceBuckets = new Map();
 /**
* baseTileResourceBuckets：按资源键拆分的模板基线资源桶。
*/

 baseTileResourceBuckets = new Map();
 /**
* tileDamageByTile：tileDamageByTile相关字段。
*/

 tileDamageByTile = new Map();
 /**
* temporaryTileByTile：技能生成的非持久临时地块。
*/

 temporaryTileByTile = new Map();
 /**
* playersById：玩家ByID标识。
*/

 playersById = new Map();
 /** 当前实例中仍挂有网络会话的玩家数；离线挂机玩家不计入。 */
 connectedPlayerSessionCount = 0;
 /**
* playerIdsByTile：按地块索引维护玩家集合，供 AOE/PvP 目标规划按格取人。
*/

 playerIdsByTile = new Map();
 /** 玩家 tile 索引中的唯一玩家计数，用于异常时 O(1) 触发正确性 fallback。 */
 playerTileIndexedPlayerCount = 0;
 /** 玩家 chunk 空间索引，供 AOI 与怪物寻敌先缩小候选集。 */
 playerIdsByChunk = new Map();
 /** 玩家 chunk 索引中的唯一玩家计数，用于异常时 O(1) 触发正确性 fallback。 */
 playerChunkIndexedPlayerCount = 0;
 /** 玩家空间索引结构修订号，用于低频精确自检。 */
 playerSpatialIndexRevision = 0;
 /** 最近完成精确自检的玩家空间索引修订号。 */
 playerSpatialIndexValidatedRevision = -1;
 /**
* playersByHandle：玩家ByHandle相关字段。
*/

 playersByHandle = new Map();
 /**
* npcsById：NPCByID标识。
*/

 npcsById = new Map();
 /**
* npcIdByTile：NPCIDByTile相关字段。
*/

 npcIdByTile = new Map();
 /**
* landmarksById：landmarkByID标识。
*/

 landmarksById = new Map();
 /**
* landmarkIdByTile：landmarkIDByTile相关字段。
*/

 landmarkIdByTile = new Map();
 /**
* containersById：containerByID标识。
*/

 containersById = new Map();
 /**
* containerIdByTile：containerIDByTile相关字段。
*/

 containerIdByTile = new Map();
 /**
* monstersByRuntimeId：怪物By运行态ID标识。
*/

 monstersByRuntimeId = new Map();
 /**
* monsterRuntimeIdByTile：怪物运行态IDByTile相关字段。
*/

 monsterRuntimeIdByTile = new Map();
 /** 妖兽运行时仇恨表；按实例局部保存，不进入持久化和网络投影。 */
 monsterThreatByRuntimeId = new Map();
 /**
* monsterSpawnGroupsByKey：按刷新点聚合的妖兽运行态分组。
*/

 monsterSpawnGroupsByKey = new Map();
 buffRegistry = null;
 /**
* monsterSpawnAccelerationStatesByKey：普通妖兽刷新点清场加速状态。
*/

 monsterSpawnAccelerationStatesByKey = new Map();
 /**
* monsterSpawnKeyByRuntimeId：妖兽运行态 ID 到刷新点分组键。
*/

 monsterSpawnKeyByRuntimeId = new Map();
 /**
* groundPilesByTile：groundPileByTile相关字段。
*/

 groundPilesByTile = new Map();
 /**
* pendingCommands：pendingCommand相关字段。
*/

 pendingCommands = new Map();
 /** 本 tick 已出队但尚未结算的玩家战斗指令；在统一出手排序阶段按速度序消费。 */
 deferredCombatActions = [];
 /**
* freeHandles：freeHandle相关字段。
*/

 freeHandles = [];
 /**
* nextHandle：nextHandle相关字段。
*/

 nextHandle = 1;
 /**
* tick：tick相关字段。
*/

 tick = 0;
 /** 实例级 tick 倍速（默认 1，0 表示暂停）。 */
 tickSpeed = 1;
 /** 降频开始时间戳（ms），null 表示未降频。 */
 _throttledSinceMs: number | null = null;
 /** 降频开始时的实例 tick。 */
 _throttledSinceTick = 0;
 /** 实例是否暂停 tick 推进。 */
 paused = false;
 /**
* worldRevision：世界Revision相关字段。
*/

 worldRevision = 0;
 /** 玩家视野快照缓存；同一玩家在世界/自身 revision 未变时复用视野数组，降低空 tick 分配。 */
 playerViewCacheByPlayerId = new Map();
 /** 自动战斗轻量视野缓存；只包含目标选择需要的玩家和妖兽。 */
 autoCombatViewCacheByPlayerId = new Map();
 /** 自动战斗可见地块缓存；按玩家坐标/半径/视线遮挡 revision 复用 shadowcast 结果。 */
 autoCombatTileVisibilityCacheByPlayerId = new Map();
 /** 可见玩家视野条目缓存；同一玩家展示字段未变时复用条目对象。 */
 localPlayerViewCacheByPlayerId = new Map();
 /** NPC 视野条目缓存；静态 NPC 不再为每个玩家重复创建条目对象。 */
 localNpcViewCacheById = new Map();
 /** 传送点视野条目缓存；静态传送点不再为每个玩家重复创建条目对象。 */
 localPortalViewCacheById = new Map();
 /** 容器视野条目缓存；静态容器不再为每个玩家重复创建条目对象。 */
 localContainerViewCacheById = new Map();
 /** 地标视野条目缓存；静态地标不再为每个玩家重复创建条目对象。 */
 localLandmarkViewCacheById = new Map();
 /** 安全区视野条目缓存；模板安全区不再为每个玩家重复创建条目对象。 */
 localSafeZoneViewCacheByKey = new Map();
 /** 地面物品堆视野条目缓存；同一 sourceId 内容未变时复用条目对象。 */
 localGroundPileViewCacheBySourceId = new Map();
 /** 建筑视野条目缓存；未完工建筑展示字段未变时复用条目对象。 */
 localBuildingViewCacheById = new Map();
 /** 妖兽视野条目缓存；同一 runtimeId 字段未变时复用条目对象，降低 collectLocalMonsters 高频分配。 */
 localMonsterViewCacheByRuntimeId = new Map();
 /** Tile 共享投影缓存（per-instance）；按 coordKey="${x},${y}" 索引；实例 GC 时随之释放，避免 service-level 累积。 */
 tileProjectionByCoord = new Map();
 /** 地块静态同步 revision；只跟地块/结构/资源投影变化有关，不跟玩家/怪物移动混用。 */
 staticTileSyncRevision = 0;
 /** 静态寻路 revision；只在可行走性或移动代价改变时推进，不被灵气等纯展示投影污染。 */
 staticPathingRevision = 0;
 /** 视线遮挡 revision；只在地形、建筑、临时地块或毁坏状态可能改变 LOS 时推进。 */
 sightBlockingRevision = 0;
 /** AOI 局部 revision 单调序列，chunk 只保留最后一次变化序号。 */
 aoiRevisionSequence = 0;
 /** 无法定位到单个区域的罕见结构变化 revision。 */
 aoiGlobalRevision = 0;
 /** 按 chunkY -> chunkX 保存视野内容 revision，避免 tick 热路拼接字符串键。 */
 aoiRevisionByChunkRow = new Map<number, Map<number, number>>();
 /** 仅跟踪会改变 FOV 的 chunk revision。 */
 aoiSightRevisionByChunkRow = new Map<number, Map<number, number>>();
 /** 静态地块同步脏索引；网络消费时才转换为协议坐标键，避免 tick 热路径拼接字符串。 */
 staticTileSyncDirtyTileKeys = new Set();
 /** 当前脏坐标批次开始前的地块静态同步 revision。 */
 staticTileSyncDirtyFromRevision = 0;
 /**
* persistentRevision：persistentRevision相关字段。
*/

 persistentRevision = 1;
 /**
* persistedRevision：persistedRevision相关字段。
*/

 persistedRevision = 1;
 /**
* changedAuraTileCount：默认灵气脏地块数量。
*/

 changedAuraTileCount = 0;
 /**
* changedTileResourceEntryCount：通用地块资源脏条目数量。
*/

 changedTileResourceEntryCount = 0;
 /**
* changedTileResourceEntryCountByKey：按资源键统计脏条目数量。
*/

 changedTileResourceEntryCountByKey = new Map();
 /**
* tileResourceFlowRemainderBuckets：地块气机自然流转的固定点余数。
*/

 tileResourceFlowRemainderBuckets = new Map();
 /**
* tileResourceFlowIndicesByKey：当前需要自然流转的地块资源索引。
*/

 tileResourceFlowIndicesByKey = new Map();
 /**
* dirtyDomains：实例域级脏标记。
*/

 dirtyDomains = createMapInstanceDirtyDomainSet();
 /**
* persistenceFullReplaceDomains：需要保留全量替换兜底的持久化域。
*/

 persistenceFullReplaceDomains = createMapInstanceDirtyDomainSet();
 /**
* dirtyTileResourceByKey：按资源键记录需要行级落盘的地块资源。
*/

 dirtyTileResourceByKey = new Map();
 /**
* dirtyTileDamageIndices：需要行级落盘的地块损坏索引。
*/

 dirtyTileDamageIndices = new Set();
 /**
* dirtyGroundItemTileIndices：需要按 tile 替换的地面物品堆索引。
*/

 dirtyGroundItemTileIndices = new Set();
 /** 跨域强事务持有期间禁止普通 flush 抢先提交对应实例域。 */
 persistenceDomainHoldCounts = new Map();
 /** 实例分域异步写队列；普通 flush 与 durable 来源事务必须共用这一顺序边界。 */
 persistenceDomainMutationQueueByDomain = new Map();
 /** 每次 domain 重新标脏都会推进，供在途 flush 精确判断快照是否已经过期。 */
 persistenceDomainRevisionByDomain = new Map();
 /** 当前 ledger generation 已可靠接管的单域修订；不代表数据库真源已经落盘。 */
 stagedPersistenceDomainRevisionByDomain = new Map();
 /** staged 修订所属的进程级 ledger generation。 */
 persistenceStagingGenerationByDomain = new Map();
 /**
* dirtyMonsterRuntimeIds：需要行级落盘的妖兽运行态 ID。
*/

 dirtyMonsterRuntimeIds = new Set();
 /**
  * dirtyDomainFirstMarkedAt：每个 domain 首次变脏的时间戳（毫秒），用于合并窗口判断。
  */
 dirtyDomainFirstMarkedAt = new Map();
 /**
  * dirtyDomainHighPriority：玩家主动操作标记的高优先级脏域，绕过合并窗口。
  */
 dirtyDomainHighPriority = new Set();
 /**
  * dynamicTileBlocker：运行时动态阻挡判断，例如阵法边界。
  */

 dynamicTileBlocker = null;
 /** sectVirtualBoundaryLayerState：宗门模板外未定义边界的分层投影。 */
 sectVirtualBoundaryLayerState = {
  terrain: DEFAULT_TILE_LAYER_FALLBACK_SEED.terrain,
  surface: DEFAULT_TILE_LAYER_FALLBACK_SEED.surface,
  structure: StructureType.Stone,
  interactableKinds: [],
  interactableFlags: 0,
  legacyTileType: TileType.Stone,
  virtualBoundary: true,
 };
 /**
  * compositeSightResolver：跨地图视觉叠加查询，例如二楼窗口外投影到父地图。
  */

 compositeSightResolver = null;
 /** runtimePortals：运行时动态传送点，例如宗门入口。 */
 runtimePortals = [];
 /** buildingCatalog：动态建筑/家具编译配置，只在低频建造链路读取。 */
 buildingCatalog = null;
 /** fengShuiRules：已编译风水规则表。 */
 fengShuiRules = [];
 /** buildingById：实例内长期建筑对象。 */
 buildingById = new Map();
 /** buildingCellsById：建筑 footprint 对应 cell 索引。 */
 buildingCellsById = new Map();
 /** buildingPreviousTileTypeById：建筑投影前地块类型，用于拆除恢复。 */
 buildingPreviousTileTypeById = new Map();
 /** buildingIdByCell：cell 上的建筑 ID 集合，低频查询用。 */
 buildingIdByCell = new Map();
 /** buildingTopologyIndex：cell 拓扑能力索引。 */
 buildingTopologyIndex = null;
 /** roomsById：当前房间派生快照。 */
 roomsById = new Map();
 /** roomIdByCell：cell -> room handle。 */
 roomIdByCell = new Int32Array(1);
 /** roomIdsByHandle：room handle -> roomId。 */
 roomIdsByHandle = [];
 /** roomCellIndicesById：roomId -> cell index 列表，用于单房间风水重算避免扫全图。 */
 roomCellIndicesById = new Map();
 /** roomAggregatesById：房间聚合快照。 */
 roomAggregatesById = new Map();
 /** fengShuiByRoomId：房间风水派生快照。 */
 fengShuiByRoomId = new Map();
 /** buildingRoomDeferredStartCells：超预算房间识别延迟队列起点。 */
 buildingRoomDeferredStartCells = [];
 /** lastBuildingRoomRebuildStats：最近一次建筑/房间/风水重算指标。 */
 lastBuildingRoomRebuildStats = {
  reason: 'init',
  fullTopologyRebuild: false,
  dirtyCellCount: 0,
  requestCount: 0,
  coalescedRequestCount: 0,
  topologyRequestCount: 0,
  localRequestCount: 0,
  roomCount: 0,
  fengShuiCount: 0,
  deferredCount: 0,
  durationMs: 0,
  updatedAtTick: 0,
 };
 /** 房间/风水派生状态按实例惰性创建；变化只标脏并按实例倍率低频收敛。 */
 pendingBuildingRoomFengShuiState: PendingBuildingRoomFengShuiState | null = null;
 /** 防止刷新窗口内的多个编排入口重复结算。 */
 lastBuildingRoomFengShuiFinalizeTick = -1;
 /** pendingEngagedMonsterEvents：本 tick 新开怪的怪物事件队列，供副本流程触发剧情对白与阶段。 */
 pendingEngagedMonsterEvents: Array<{ runtimeId: string; monsterId: string; x: number; y: number; triggerPlayerId?: string }> = [];

 /** isDungeonInstance：判断当前实例是否属于副本。 */
 isDungeonInstance(): boolean {
  return this.meta?.kind === 'dungeon'
   || this.meta?.instanceOrigin === 'dungeon'
   || typeof (this.meta as Record<string, unknown>)?.dungeonRunId === 'string';
 }

 /** engageMonster：将未开怪的副本妖兽标记为进入战斗，并记录开怪事件。 */
 engageMonster(monster: { runtimeId: string; monsterId: string; x: number; y: number; engaged?: boolean; combatOpeningTicks?: number; speechTicksLeft?: number }, triggerPlayerId?: string): void {
  return engageMonsterImpl(this, monster, triggerPlayerId);
 }

 /** setMonsterSpeechTicks：设置妖兽在开怪说话阶段的禁攻持续 tick 数。 */
 setMonsterSpeechTicks(runtimeId: string, ticks: number): void {
  return setMonsterSpeechTicksImpl(this, runtimeId, ticks);
 }

 /** 副本开战后天人视野半径：覆盖整张地图。 */
 resolveDungeonCombatVisionRange(): number {
  const minX = Number.isFinite(Number(this.tilePlane?.minX)) ? Math.trunc(Number(this.tilePlane.minX)) : 0;
  const maxX = Number.isFinite(Number(this.tilePlane?.maxX))
   ? Math.trunc(Number(this.tilePlane.maxX))
   : Math.max(0, Math.trunc(Number(this.template?.width) || 1) - 1);
  const minY = Number.isFinite(Number(this.tilePlane?.minY)) ? Math.trunc(Number(this.tilePlane.minY)) : 0;
  const maxY = Number.isFinite(Number(this.tilePlane?.maxY))
   ? Math.trunc(Number(this.tilePlane.maxY))
   : Math.max(0, Math.trunc(Number(this.template?.height) || 1) - 1);
  return Math.max(0, maxX - minX, maxY - minY);
 }

 /** 解析妖兽当前寻敌半径：未开怪副本怪不主动寻敌，开战后覆盖全图，其余用配置 aggroRange。 */
 resolveMonsterCombatAggroRange(monster: { aggroRange?: unknown; engaged?: boolean }): number {
  return resolveMonsterCombatAggroRangeImpl(this, monster);
 }

 /** 当前可出手的最大攻击/技能距离。 */
 resolveMonsterMaxAttackReach(monster: { attackRange?: unknown; skills?: unknown; numericStats?: unknown }): number {
  return resolveMonsterMaxAttackReachImpl(this, monster);
 }

 /** 解析攻击者瞄准点：当前锁定玩家、最后目击点。 */
 resolveMonsterAimPosition(
  monster,
  liveTarget: { playerId?: string; x: number; y: number } | null,
 ): { playerId?: string; x: number; y: number } | null {
  return resolveMonsterAimPositionImpl(this, monster, liveTarget);
 }

 /** 沿怪物到攻击者的 Bresenham 连线，取当前够得着的第一格。 */
 pickFirstAttackableLineTile(
  monster,
  aim: { x: number; y: number },
 ): { x: number; y: number } | null {
  return pickFirstAttackableLineTileImpl(this, monster, aim);
 }

 canMonsterStepToward(monster: { x: number; y: number; facing?: unknown; buffs?: unknown }, targetX: number, targetY: number): boolean {
  return canMonsterStepTowardImpl(this, monster, targetX, targetY);
 }

 canMonsterActOnTarget(
  monster,
  target: { playerId?: string; x: number; y: number },
 ): boolean {
  return canMonsterActOnTargetImpl(this, monster, target);
 }

 /** 攻击者不可达时，改打连线上第一格的占用者或该地块本身。 */
 resolveLineAttackTarget(
  monster: { x: number; y: number; attackRange?: unknown; skills?: unknown; numericStats?: unknown },
  aim: { playerId?: string; x: number; y: number },
 ): { playerId: string; x: number; y: number } | null {
  const tile = this.pickFirstAttackableLineTile(monster, aim);
  if (!tile) {
   return null;
  }
  const occupants = this.getPlayerRuntimeRefsAtTile(tile.x, tile.y);
  const occupant = occupants[0];
  if (occupant && typeof occupant.playerId === 'string') {
   return occupant;
  }
  return { playerId: '', x: tile.x, y: tile.y };
 }
 /**
* 构造器：初始化 当前 实例并建立基础状态。
* @param request 请求参数。
* @returns 无返回值，完成实例初始化。
*/

 constructor(request) {
  registerMonsterCombatReactions(this.damageReactionRegistry, {
   recalculateMonsterDerivedState,
   markMonsterRuntimePersistenceDirty: (runtimeId) => this.markMonsterRuntimePersistenceDirty(runtimeId),
   bumpWorldRevision: () => { this.worldRevision += 1; },
  });
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  this.meta = {
   instanceId: request.instanceId,
   templateId: request.template.id,
   kind: request.kind,
   persistent: request.persistent,
   persistentPolicy: request.persistentPolicy ?? (request.persistent === false ? 'ephemeral' : 'persistent'),
   createdAt: request.createdAt,
   displayName: request.displayName,
   linePreset: request.linePreset,
   lineIndex: request.lineIndex,
   instanceOrigin: request.instanceOrigin,
   supportsPvp: request.supportsPvp === true,
   canDamageTile: request.canDamageTile === true,
   defaultEntry: request.defaultEntry !== false,
   ownerPlayerId: request.ownerPlayerId,
   ownerSectId: request.ownerSectId,
   partyId: request.partyId,
   assignedNodeId: request.assignedNodeId ?? null,
   leaseToken: request.leaseToken ?? null,
   leaseExpireAt: request.leaseExpireAt ?? null,
   catalogReservationToken: request.catalogReservationToken ?? null,
   ownershipEpoch: Number.isFinite(Number(request.ownershipEpoch)) ? Math.max(0, Math.trunc(Number(request.ownershipEpoch))) : 0,
   runtimeStatus: request.runtimeStatus ?? 'running',
   status: request.status ?? 'active',
   clusterId: request.clusterId ?? null,
   shardKey: request.shardKey ?? request.instanceId,
   routeDomain: request.routeDomain ?? null,
   parentInstanceId: request.parentInstanceId ?? null,
   parentBuildingId: request.parentBuildingId ?? null,
   destroyAt: request.destroyAt ?? null,
   lastActiveAt: request.lastActiveAt ?? null,
   lastPersistedAt: request.lastPersistedAt ?? null,
  };
  this.template = request.template;
  this.buffRegistry = request.buffRegistry ?? null;
  this.tilePlane = RuntimeTilePlane.fromTemplate(request.template);
  const initialCellCapacity = this.tilePlane.getCellCapacity();
  this.occupancy = new Uint32Array(initialCellCapacity);
  this.buildingTopologyIndex = new BuildingTopologyIndex(initialCellCapacity);
  this.roomIdByCell = new Int32Array(initialCellCapacity);
  const defaultBuildingRuntime = getDefaultBuildingRuntime();
  this.buildingCatalog = defaultBuildingRuntime.catalog;
  this.fengShuiRules = defaultBuildingRuntime.rules;
  this.auraByTile = new Float64Array(initialCellCapacity);
  this.auraByTile.set(request.template.baseAuraByTile);
  this.tileResourceBuckets.set(DEFAULT_TILE_AURA_RESOURCE_KEY, this.auraByTile);
  const baseAuraByTile = new Float64Array(initialCellCapacity);
  baseAuraByTile.set(request.template.baseAuraByTile);
  this.baseTileResourceBuckets.set(DEFAULT_TILE_AURA_RESOURCE_KEY, baseAuraByTile);
  for (const entry of request.template.baseTileResourceEntries ?? []) {
   if (!entry
    || entry.resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY
    || !Number.isFinite(entry.tileIndex)
    || !Number.isFinite(entry.value)) {
    continue;
   }
   const tileIndex = Math.trunc(entry.tileIndex);
   if (tileIndex < 0 || tileIndex >= this.auraByTile.length) {
    continue;
   }
   const value = normalizeTileResourceValue(entry.value);
   if (value <= 0) {
    continue;
   }
   this.getOrCreateTileResourceBucket(entry.resourceKey)[tileIndex] = value;
   this.getOrCreateBaseTileResourceBucket(entry.resourceKey)[tileIndex] = value;
  }
  for (const npc of request.template.npcs) {
   this.npcsById.set(npc.npcId, npc);
   this.npcIdByTile.set(this.toTileIndex(npc.x, npc.y), npc.npcId);
  }
  for (const landmark of request.template.landmarks) {
   this.landmarksById.set(landmark.id, landmark);
   this.landmarkIdByTile.set(this.toTileIndex(landmark.x, landmark.y), landmark.id);
  }
  for (const container of request.template.containers) {
   this.containersById.set(container.id, container);
   this.containerIdByTile.set(this.toTileIndex(container.x, container.y), container.id);
  }
  for (const monster of request.monsterSpawns) {
   const spawnX = Number.isFinite(Number(monster.spawnOriginX)) ? Math.trunc(Number(monster.spawnOriginX)) : monster.x;
   const spawnY = Number.isFinite(Number(monster.spawnOriginY)) ? Math.trunc(Number(monster.spawnOriginY)) : monster.y;
   const spawnKey = typeof monster.spawnKey === 'string' && monster.spawnKey.trim()
    ? monster.spawnKey.trim()
    : buildMonsterSpawnKey(monster.monsterId, spawnX, spawnY);
   const state = {
    runtimeId: monster.runtimeId,
    monsterId: monster.monsterId,
    spawnKey,
    spawnX,
    spawnY,
    x: monster.x,
    y: monster.y,
    hp: monster.alive ? Math.max(1, Math.min(monster.hp, monster.maxHp)) : 0,
    maxHp: monster.maxHp,
    qi: monster.alive ? Math.max(0, Math.round(monster.baseNumericStats?.maxQi ?? 0)) : 0,
    maxQi: Math.max(0, Math.round(monster.baseNumericStats?.maxQi ?? 0)),
    alive: monster.alive,
    respawnLeft: monster.alive ? 0 : monster.respawnLeft,
    respawnTicks: monster.respawnTicks,
    facing: monster.facing,
    name: monster.name,
    char: monster.char,
    color: monster.color,
    level: monster.level,
    tier: monster.tier,
    expMultiplier: monster.expMultiplier,
    baseAttrs: monster.baseAttrs,
    attrs: monster.baseAttrs,
    baseNumericStats: monster.baseNumericStats,
    numericStats: monster.baseNumericStats,
    ratioDivisors: monster.ratioDivisors,
    statFormula: monster.statFormula,
    initialBuffs: Array.isArray(monster.initialBuffs) ? monster.initialBuffs : [],
    buffs: [],
    skills: monster.skills,
    cooldownReadyTickBySkillId: {},
    damageContributors: {},
    aggroTargetPlayerId: null,
    lastSeenTargetX: undefined,
    lastSeenTargetY: undefined,
    lastSeenTargetTick: undefined,
    aggroRange: monster.aggroRange,
    leashRange: monster.leashRange,
    wanderRadius: Number.isFinite(Number(monster.wanderRadius)) ? Math.max(0, Math.trunc(Number(monster.wanderRadius))) : 0,
    attackRange: monster.attackRange,
    attackCooldownTicks: monster.attackCooldownTicks,
    attackReadyTick: 0,
    engaged: !this.isDungeonInstance(),
    combatOpeningTicks: Number.isFinite(Number((monster as { combatOpeningTicks?: unknown })?.combatOpeningTicks))
     ? Math.max(0, Math.trunc(Number((monster as { combatOpeningTicks?: unknown }).combatOpeningTicks)))
     : 0,
    speechTicksLeft: 0,
   };
   if (state.alive) {
    applyMonsterInitialBuffs(state, this.buffRegistry);
    recalculateMonsterDerivedState(state);
   }
   this.monstersByRuntimeId.set(monster.runtimeId, state);
   this.monsterSpawnKeyByRuntimeId.set(monster.runtimeId, spawnKey);
   const group = this.monsterSpawnGroupsByKey.get(spawnKey);
   if (group) {
    group.push(state);
   }
   else {
    this.monsterSpawnGroupsByKey.set(spawnKey, [state]);
   }
   if (monster.alive) {
    this.monsterRuntimeIdByTile.set(this.toTileIndex(monster.x, monster.y), monster.runtimeId);
   }
  }
  this.initializeMonsterSpawnAccelerationStates();
  this.rebuildBuildingRoomFengShuiState({ reason: 'instance_init_static_room_scan' });
 }
 /** playerCount：当前实例中的运行态玩家数量，包含离线挂机。 */
 get playerCount() {
  return this.playersById.size;
 }
 /** 是否存在能够接收本息战斗表现同步的在线会话。 */
 hasConnectedPlayerSessions() {
  return this.connectedPlayerSessionCount > 0;
 }
 /** listPlayerIds：列出玩家 ID 列表。 */
 listPlayerIds() {
  return Array.from(this.playersById.keys());
 }
 /** listPlayerPositionWorkerMirrors：列出 worker 预计算需要的玩家位置精简镜像。 */
 listPlayerPositionWorkerMirrors() {
  const players = [];
  for (const player of this.playersById.values()) {
   players.push({
    playerId: player.playerId,
    x: Math.trunc(Number(player.x) || 0),
    y: Math.trunc(Number(player.y) || 0),
   });
  }
  return players;
 }
 /** connectPlayer：将玩家接入当前实例，并同步初始移动速度与位置。 */
 connectPlayer(request) {
  return connectPlayerImpl(this, request);
 }
 /**
  * T-04: 降频实例 catch-up 补偿。
  * 计算降频期间跳过的 ticks，批量补偿怪物 respawnLeft 和地块 respawnLeft。
  */
 performThrottleCatchUp() {
  if (this._throttledSinceMs == null) {
   return;
  }
  const elapsedRealSeconds = Math.max(0, Math.floor((Date.now() - this._throttledSinceMs) / 1000));
  const executedTicks = Math.max(0, this.tick - this._throttledSinceTick);
  const missedTicks = Math.max(0, elapsedRealSeconds - executedTicks);
  if (missedTicks <= 0) {
   this._throttledSinceMs = null;
   return;
  }
  // 补偿怪物 respawnLeft
  for (const monster of this.monstersByRuntimeId.values()) {
   if (!monster.alive && monster.respawnLeft > 0) {
    monster.respawnLeft = Math.max(0, monster.respawnLeft - missedTicks);
    if (monster.respawnLeft === 0) {
     this.respawnMonster(monster);
    }
   }
  }
  // 补偿地块 respawnLeft
  for (const [tileIndex, damage] of this.tileDamageByTile.entries()) {
   if (damage.destroyed === true && damage.respawnLeft > 0) {
    const newRespawnLeft = Math.max(0, damage.respawnLeft - missedTicks);
    this.tileDamageByTile.set(tileIndex, {
     ...damage,
     respawnLeft: newRespawnLeft,
    });
   }
  }
  // 清除降频标记
  this._throttledSinceMs = null;
 }
 /** detachPlayerSession：保留离线挂机玩家的实例占位，仅清理网络会话标识。 */
 detachPlayerSession(playerId) {
  const player = this.playersById.get(playerId);
  if (!player) {
   return false;
  }
  if (!hasAttachedPlayerSession(player.sessionId)) {
   player.sessionId = null;
   return true;
  }
  player.sessionId = null;
  this.connectedPlayerSessionCount = Math.max(0, this.connectedPlayerSessionCount - 1);
  player.selfRevision += 1;
  this.playerViewCacheByPlayerId.delete(playerId);
  this.autoCombatViewCacheByPlayerId.delete(playerId);
  this.autoCombatTileVisibilityCacheByPlayerId.delete(playerId);
  this.localPlayerViewCacheByPlayerId.delete(playerId);
  return true;
 }
 /** disconnectPlayer：断开玩家与实例的挂接，并清理相关排队状态。 */
 disconnectPlayer(playerId) {
  return disconnectPlayerImpl(this, playerId);
 }
 addPlayerToTileIndex(player) {
  return addPlayerToTileIndexImpl(this, player);
 }
 removePlayerFromTileIndex(playerId, x, y) {
  return removePlayerFromTileIndexImpl(this, playerId, x, y);
 }
 getPlayerSpatialChunkKey(x, y) {
  return getPlayerSpatialChunkKeyImpl(this, x, y);
 }

 /** 标记单个坐标所在 AOI chunk 变化；不改变用于协议排序的 worldRevision。 */
 markAoiViewChangedAt(xInput, yInput, options = undefined) {
  return markAoiViewChangedAtImpl(this, xInput, yInput, options);
 }

 /** 同时标记移动前后两个位置，让离开视野和进入视野都能失效。 */
 markAoiViewMoved(fromX, fromY, toX, toY) {
  return markAoiViewMovedImpl(this, fromX, fromY, toX, toY);
 }

 /** 只有整张实例重建等无法局部归因的变化才走全局失效。 */
 markAoiViewChangedGlobally(options = undefined) {
  return markAoiViewChangedGloballyImpl(this, options);
 }

 nextAoiRevision() {
  return nextAoiRevisionImpl(this);
 }

 /** 读取覆盖视野窗口的最新局部 revision；默认半径只需检查少量 chunk。 */
 resolveAoiViewRevision(centerX, centerY, radius, sightOnly = false) {
  return resolveAoiViewRevisionImpl(this, centerX, centerY, radius, sightOnly);
 }
 addPlayerToChunkIndex(player) {
  return addPlayerToChunkIndexImpl(this, player);
 }
 removePlayerFromChunkIndex(playerId, x, y) {
  return removePlayerFromChunkIndexImpl(this, playerId, x, y);
 }
 rebuildPlayerSpatialIndexesFromPlayers() {
  this.playerIdsByTile.clear();
  this.playerTileIndexedPlayerCount = 0;
  this.playerIdsByChunk.clear();
  this.playerChunkIndexedPlayerCount = 0;
  for (const player of this.playersById.values()) {
   this.addPlayerToTileIndex(player);
  }
 }
 isPlayerSpatialIndexMembershipConsistent() {
  for (const player of this.playersById.values()) {
   if (!player?.playerId || !this.isInBounds(player.x, player.y)) {
    continue;
   }
   const tilePlayers = this.playerIdsByTile.get(this.toTileIndex(player.x, player.y));
   const chunkPlayers = this.playerIdsByChunk.get(this.getPlayerSpatialChunkKey(player.x, player.y));
   if (!tilePlayers?.has(player.playerId) || !chunkPlayers?.has(player.playerId)) {
    return false;
   }
  }
  return true;
 }
 ensurePlayerSpatialIndexesConsistent() {
  if (this.playerTileIndexedPlayerCount !== this.playersById.size
   || this.playerChunkIndexedPlayerCount !== this.playersById.size
   || (this.playerSpatialIndexValidatedRevision !== this.playerSpatialIndexRevision
    && !this.isPlayerSpatialIndexMembershipConsistent())) {
   this.rebuildPlayerSpatialIndexesFromPlayers();
  }
  this.playerSpatialIndexValidatedRevision = this.playerSpatialIndexRevision;
 }
 collectPlayersByTileIndices(tileIndices) {
  return collectPlayersByTileIndicesImpl(this, tileIndices);
 }
 collectPlayersByChunkRange(centerX, centerY, radius) {
  return collectPlayersByChunkRangeImpl(this, centerX, centerY, radius);
 }
 /** relocatePlayer：把玩家强制迁到指定落点，仍然复用出生点占位逻辑。 */
 relocatePlayer(playerId, preferredX, preferredY) {
  return relocatePlayerImpl(this, playerId, preferredX, preferredY);
 }
 /** getPlayerPosition：读取玩家当前位置。 */
 getPlayerPosition(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = this.playersById.get(playerId);
  if (!player) {
   return null;
  }
  return {
   x: player.x,
   y: player.y,
  };
 }
 /** enqueueMove：把方向移动请求排入下一次 tick 统一执行。 */
 enqueueMove(command) {
  return enqueueMoveImpl(this, command);
 }
 /** setDynamicTileBlocker：设置运行期动态地块阻挡回调。 */
 setDynamicTileBlocker(blocker) {
  return setDynamicTileBlockerImpl(this, blocker);
 }
 /** addRuntimePortal：添加或替换运行时动态传送点。 */
 addRuntimePortal(portal) {
  return addRuntimePortalImpl(this, portal);
 }
 /** 密室改尺寸前检查实例内没有玩家、实体、建筑、掉落或待执行指令。 */
 canReplaceEmptyRuntimeTemplate() {
  return this.playersById.size === 0
   && this.monstersByRuntimeId.size === 0
   && this.buildingById.size === 0
   && this.groundPilesByTile.size === 0
   && this.pendingCommands.size === 0
   && this.temporaryTileByTile.size === 0
   && this.tileDamageByTile.size === 0
   && this.runtimePortals.length === 0
   && this.buildRuntimeTilePersistenceEntries().length === 0;
 }
 /** 空实例替换动态模板；实际迁移仍复用通用模板扩展路径。 */
 replaceEmptyRuntimeTemplate(nextTemplate) {
  if (!this.canReplaceEmptyRuntimeTemplate()) {
   return false;
  }
  return this.replaceTemplateForSectExpansion(nextTemplate);
 }

 /** replaceTemplateForSectExpansion：宗门地图扩圈时替换模板并迁移运行态坐标。 */
 replaceTemplateForSectExpansion(nextTemplate) {
  if (!nextTemplate || !Number.isFinite(Number(nextTemplate.width)) || !Number.isFinite(Number(nextTemplate.height))) {
   return false;
  }
  const previousTemplate = this.template;
  const previousTilePlane = this.tilePlane;
  const previousDirtyDomains = Array.from(this.getDirtyDomains());
  const previousHighPriorityDirtyDomains = this.dirtyDomainHighPriority instanceof Set
   ? Array.from(this.dirtyDomainHighPriority)
   : [];
  const runtimeTileEntries = this.buildRuntimeTilePersistenceEntries();
  const temporaryTileEntries = this.buildTemporaryTilePersistenceEntries();
  const previousCenterX = Number.isFinite(Number(previousTemplate.source?.sectCoreX)) ? Math.trunc(Number(previousTemplate.source.sectCoreX)) : Math.trunc(previousTemplate.width / 2);
  const previousCenterY = Number.isFinite(Number(previousTemplate.source?.sectCoreY)) ? Math.trunc(Number(previousTemplate.source.sectCoreY)) : Math.trunc(previousTemplate.height / 2);
  const nextCenterX = Number.isFinite(Number(nextTemplate.source?.sectCoreX)) ? Math.trunc(Number(nextTemplate.source.sectCoreX)) : Math.trunc(nextTemplate.width / 2);
  const nextCenterY = Number.isFinite(Number(nextTemplate.source?.sectCoreY)) ? Math.trunc(Number(nextTemplate.source.sectCoreY)) : Math.trunc(nextTemplate.height / 2);
  const offsetX = nextCenterX - previousCenterX;
  const offsetY = nextCenterY - previousCenterY;
  const players = Array.from(this.playersById.values());
  const tileDamageEntries = Array.from(this.tileDamageByTile.entries());
  this.template = nextTemplate;
  this.tilePlane = RuntimeTilePlane.fromTemplate(nextTemplate);
  this.meta.templateId = nextTemplate.id;
  const nextCellCapacity = this.tilePlane.getCellCapacity();
  this.occupancy = new Uint32Array(nextCellCapacity);
  this.auraByTile = new Float64Array(nextCellCapacity);
  this.auraByTile.set(nextTemplate.baseAuraByTile);
  this.tileResourceBuckets = new Map([[DEFAULT_TILE_AURA_RESOURCE_KEY, this.auraByTile]]);
  const baseAuraByTile = new Float64Array(nextCellCapacity);
  baseAuraByTile.set(nextTemplate.baseAuraByTile);
  this.baseTileResourceBuckets = new Map([[DEFAULT_TILE_AURA_RESOURCE_KEY, baseAuraByTile]]);
  this.tileResourceFlowRemainderBuckets = new Map();
  this.tileResourceFlowIndicesByKey = new Map();
  this.changedTileResourceEntryCountByKey = new Map();
  this.changedAuraTileCount = 0;
  this.changedTileResourceEntryCount = 0;
  this.playerIdsByTile.clear();
  this.playerTileIndexedPlayerCount = 0;
  this.playerIdsByChunk.clear();
  this.playerChunkIndexedPlayerCount = 0;
  this.npcIdByTile.clear();
  this.npcsById.clear();
  this.landmarkIdByTile.clear();
  this.landmarksById.clear();
  this.containerIdByTile.clear();
  this.containersById.clear();
  this.runtimePortals = [];
  this.buildingTopologyIndex = new BuildingTopologyIndex(nextCellCapacity);
  this.roomIdByCell = new Int32Array(nextCellCapacity);
  for (const player of players) {
   const nextX = Math.max(0, Math.min(nextTemplate.width - 1, Math.trunc(Number(player.x) || 0) + offsetX));
   const nextY = Math.max(0, Math.min(nextTemplate.height - 1, Math.trunc(Number(player.y) || 0) + offsetY));
   player.x = nextX;
   player.y = nextY;
   player.selfRevision += 1;
   this.addPlayerToTileIndex(player);
   this.setOccupied(nextX, nextY, player.handle);
  }
  this.tileDamageByTile.clear();
  this.temporaryTileByTile.clear();
  for (const [tileIndex, state] of tileDamageEntries) {
   const oldIndex = Math.trunc(Number(tileIndex));
   const oldX = previousTilePlane.getX(oldIndex);
   const oldY = previousTilePlane.getY(oldIndex);
   const nextX = oldX + offsetX;
   const nextY = oldY + offsetY;
   if (!this.isInBounds(nextX, nextY)) {
    continue;
   }
   this.tileDamageByTile.set(this.toTileIndex(nextX, nextY), { ...state });
  }
  this.hydrateRuntimeTiles(runtimeTileEntries.map((entry) => ({
   ...entry,
   x: Math.trunc(Number(entry.x) || 0) + offsetX,
   y: Math.trunc(Number(entry.y) || 0) + offsetY,
  })));
  this.hydrateTemporaryTiles(temporaryTileEntries.map((entry) => ({
   ...entry,
   x: Math.trunc(Number(entry.x) || 0) + offsetX,
   y: Math.trunc(Number(entry.y) || 0) + offsetY,
  })));
  this.rebuildTileResourceFlowIndices();
  this.markPersistenceDirtyDomains(previousDirtyDomains);
  markMapInstanceDirtyDomainHighPriority(this, previousHighPriorityDirtyDomains);
  this.staticPathingRevision = Math.max(0, Math.trunc(Number(this.staticPathingRevision) || 0)) + 1;
  this.markAoiViewChangedGlobally({ sightBlockingChanged: true });
  this.worldRevision += 1;
  this.persistentRevision += 1;
  this.markPersistenceDirtyDomainsHighPriority(['overlay', 'tile_damage', 'tile_cell']);
  return true;
 }
 /** rebaseSectTemplateToStableCoordinates：旧宗门模板迁移到核心(0,0)稳定坐标，之后扩展不再平移。 */
 rebaseSectTemplateToStableCoordinates(nextTemplate) {
  if (!nextTemplate || !Number.isFinite(Number(nextTemplate.width)) || !Number.isFinite(Number(nextTemplate.height))) {
   return false;
  }
  const previousTemplate = this.template;
  const previousTilePlane = this.tilePlane;
  const previousDirtyDomains = Array.from(this.getDirtyDomains());
  const previousHighPriorityDirtyDomains = this.dirtyDomainHighPriority instanceof Set
   ? Array.from(this.dirtyDomainHighPriority)
   : [];
  const previousCenterX = Number.isFinite(Number(previousTemplate.source?.sectCoreX)) ? Math.trunc(Number(previousTemplate.source.sectCoreX)) : 0;
  const previousCenterY = Number.isFinite(Number(previousTemplate.source?.sectCoreY)) ? Math.trunc(Number(previousTemplate.source.sectCoreY)) : 0;
  const previousCellEntries = [];
  const previousCellCount = typeof previousTilePlane?.getCellCount === 'function' ? previousTilePlane.getCellCount() : 0;
  for (let tileIndex = 0; tileIndex < previousCellCount; tileIndex += 1) {
   const layerState = typeof previousTilePlane.getTileLayerState === 'function'
    ? previousTilePlane.getTileLayerState(tileIndex)
    : null;
   previousCellEntries.push({
    x: previousTilePlane.getX(tileIndex) - previousCenterX,
    y: previousTilePlane.getY(tileIndex) - previousCenterY,
    tileType: previousTilePlane.getTileType(tileIndex),
    terrainType: layerState?.terrain,
    surfaceType: layerState?.surface ?? null,
    structureType: layerState?.structure ?? null,
    interactableKinds: Array.isArray(layerState?.interactableKinds) ? layerState.interactableKinds : [],
   });
  }
  const tileDamageEntries = this.buildTileDamagePersistenceEntries().map((entry) => ({
   ...entry,
   x: Math.trunc(Number(entry.x) || 0) - previousCenterX,
   y: Math.trunc(Number(entry.y) || 0) - previousCenterY,
  }));
  const temporaryTileEntries = this.buildTemporaryTilePersistenceEntries().map((entry) => ({
   ...entry,
   x: Math.trunc(Number(entry.x) || 0) - previousCenterX,
   y: Math.trunc(Number(entry.y) || 0) - previousCenterY,
  }));
  const players = Array.from(this.playersById.values());
  this.template = nextTemplate;
  this.tilePlane = RuntimeTilePlane.fromTemplate(nextTemplate);
  this.meta.templateId = nextTemplate.id;
  const nextCellCapacity = this.tilePlane.getCellCapacity();
  this.occupancy = new Uint32Array(nextCellCapacity);
  this.auraByTile = new Float64Array(nextCellCapacity);
  this.auraByTile.set(nextTemplate.baseAuraByTile);
  this.tileResourceBuckets = new Map([[DEFAULT_TILE_AURA_RESOURCE_KEY, this.auraByTile]]);
  const baseAuraByTile = new Float64Array(nextCellCapacity);
  baseAuraByTile.set(nextTemplate.baseAuraByTile);
  this.baseTileResourceBuckets = new Map([[DEFAULT_TILE_AURA_RESOURCE_KEY, baseAuraByTile]]);
  this.tileResourceFlowRemainderBuckets = new Map();
  this.tileResourceFlowIndicesByKey = new Map();
  this.changedTileResourceEntryCountByKey = new Map();
  this.changedAuraTileCount = 0;
  this.changedTileResourceEntryCount = 0;
  this.playerIdsByTile.clear();
  this.playerTileIndexedPlayerCount = 0;
  this.playerIdsByChunk.clear();
  this.playerChunkIndexedPlayerCount = 0;
  this.npcIdByTile.clear();
  this.npcsById.clear();
  this.landmarkIdByTile.clear();
  this.landmarksById.clear();
  this.containerIdByTile.clear();
  this.containersById.clear();
  this.runtimePortals = [];
  this.buildingTopologyIndex = new BuildingTopologyIndex(nextCellCapacity);
  this.roomIdByCell = new Int32Array(nextCellCapacity);
  this.tileDamageByTile.clear();
  this.temporaryTileByTile.clear();
  this.hydrateRuntimeTiles(previousCellEntries);
  this.hydrateTileDamage(tileDamageEntries);
  this.hydrateTemporaryTiles(temporaryTileEntries);
  for (const player of players) {
   const nextX = Math.trunc(Number(player.x) || 0) - previousCenterX;
   const nextY = Math.trunc(Number(player.y) || 0) - previousCenterY;
   player.x = this.isInBounds(nextX, nextY) ? nextX : this.template.spawnX;
   player.y = this.isInBounds(nextX, nextY) ? nextY : this.template.spawnY;
   player.selfRevision += 1;
   this.addPlayerToTileIndex(player);
   this.setOccupied(player.x, player.y, player.handle);
  }
  this.rebuildTileResourceFlowIndices();
  this.markPersistenceDirtyDomains(previousDirtyDomains);
  markMapInstanceDirtyDomainHighPriority(this, previousHighPriorityDirtyDomains);
  this.staticPathingRevision = Math.max(0, Math.trunc(Number(this.staticPathingRevision) || 0)) + 1;
  this.markAoiViewChangedGlobally({ sightBlockingChanged: true });
  this.worldRevision += 1;
  this.persistentRevision += 1;
  this.markPersistenceDirtyDomainsHighPriority(['overlay', 'tile_damage', 'tile_cell']);
  return true;
 }
 /** activateRuntimeTile：按坐标激活一个运行时地块，已存在坐标不会被覆盖。 */
 activateRuntimeTile(x, y, tileType, options: any = {}) {
  return activateRuntimeTileImpl(this, x, y, tileType, options);
 }
 /** forEachRuntimeTile：遍历当前运行时真实存在的地块坐标。 */
 forEachRuntimeTile(visitor) {
  return forEachRuntimeTileImpl(this, visitor);
 }
 /** resolveDefaultTileLayerFallbackForCell：统一读取未知/缺失地块四层默认回退，后续程序化扩展只扩这个入口的上下文。 */
 resolveDefaultTileLayerFallbackForCell(tileIndexInput = -1, xInput = null, yInput = null) {
  return resolveDefaultTileLayerFallbackForCellImpl(this, tileIndexInput, xInput, yInput);
 }
 /** applyDefaultTileLayerFallback：把已激活 cell 重置为统一默认四层，不硬编码地板。 */
 applyDefaultTileLayerFallback(tileIndexInput) {
  return applyDefaultTileLayerFallbackImpl(this, tileIndexInput);
 }
 /** applyBuildingVisualTileType：按建筑 placement layer 写入地表或结构层，避免覆盖底层地形。 */
 applyBuildingVisualTileType(cellIndex, compiled) {
  return applyBuildingVisualTileTypeImpl(this, cellIndex, compiled);
 }
 /** captureBuildingPreviousTileState：记录建筑投影前的完整分层，拆除时不能只靠 legacy TileType 恢复。 */
 captureBuildingPreviousTileState(cellIndex) {
  return captureBuildingPreviousTileStateImpl(this, cellIndex);
 }
 /** restoreBuildingPreviousTileState：按分层快照恢复建筑占用前状态，兼容旧库里只有 previousTileType 的记录。 */
 restoreBuildingPreviousTileState(cellIndex, previousState) {
  return restoreBuildingPreviousTileStateImpl(this, cellIndex, previousState);
 }
 /** clearTileDamageForBuildingVisualCells：玩家建筑接管损坏地块时，先落实摧毁投影再清掉损坏状态。 */
 clearTileDamageForBuildingVisualCells(cells) {
  return clearTileDamageForBuildingVisualCellsImpl(this, cells);
 }
 /** configureBuildingRuntime：挂载建筑/风水编译配置并重建派生索引。 */
 configureBuildingRuntime(catalog, fengShuiRules = []) {
  return configureBuildingRuntimeImpl(this, catalog, fengShuiRules);
 }
 /** placeBuildingInstance：服务端权威放置建筑，调用方负责玩家权限和材料事务。 */
 placeBuildingInstance(input) {
  return placeBuildingInstanceImpl(this, input);
 }
 /** startBuildingConstruction：把半成品建筑切到持续施工状态。 */
 startBuildingConstruction(buildingIdInput, playerIdInput) {
  return startBuildingConstructionImpl(this, buildingIdInput, playerIdInput);
 }
 /** stopBuildingConstruction：暂停指定玩家的半成品施工。 */
 stopBuildingConstruction(buildingIdInput, playerIdInput) {
  return stopBuildingConstructionImpl(this, buildingIdInput, playerIdInput);
 }
 /** startBuildingDeconstruction：非所有人拆除时进入逐息任务。 */
 startBuildingDeconstruction(buildingIdInput, playerIdInput, totalTicksInput) {
  return startBuildingDeconstructionImpl(this, buildingIdInput, playerIdInput, totalTicksInput);
 }
 /** stopBuildingDeconstruction：取消逐息拆除并恢复进入拆除前的建筑状态。 */
 stopBuildingDeconstruction(buildingIdInput, playerIdInput) {
  return stopBuildingDeconstructionImpl(this, buildingIdInput, playerIdInput);
 }
 /** updateTechniqueUnificationPlatformState：在实例权威边界内绑定法脉。 */
 updateTechniqueUnificationPlatformState(
  buildingIdInput,
  input: { familyId?: unknown; techniqueName?: unknown; accessPolicies?: unknown } = {},
 ) {
  const buildingId = normalizeBuildingId(buildingIdInput);
  const familyId = normalizeBuildingId(input?.familyId);
  const building = buildingId ? this.buildingById.get(buildingId) : null;
  if (!building || building.defId !== TECHNIQUE_UNIFICATION_PLATFORM_DEF_ID || building.state !== 'active') {
   return { ok: false, reason: 'technique_unification_platform_invalid' };
  }
  if (!familyId) {
   return { ok: false, reason: 'technique_unification_family_required' };
  }
  const currentFamilyId = normalizeBuildingId(building.techniqueAggregationFamilyId);
  if (currentFamilyId && currentFamilyId !== familyId) {
   return { ok: false, reason: 'technique_unification_platform_already_bound' };
  }
  const techniqueName = normalizeBuildingId(input?.techniqueName);
  const nextName = techniqueName ? `统法台：${techniqueName}` : building.name;
  const seededPolicies = normalizeExplicitBuildingAccessPolicies(input?.accessPolicies);
  const missingSeedEntries = seededPolicies
   ? Object.entries(seededPolicies).filter(([slot]) => !building.accessPolicies?.[slot])
   : [];
  if (currentFamilyId === familyId
   && building.name === nextName
   && missingSeedEntries.length === 0) {
   return { ok: true, building, changed: false };
  }
  building.techniqueAggregationFamilyId = familyId;
  if (missingSeedEntries.length > 0) {
   building.accessPolicies = {
    ...Object.fromEntries(missingSeedEntries),
    ...(building.accessPolicies ?? {}),
   };
  }
  if (techniqueName) {
   building.name = nextName;
  }
  building.updatedAtTick = Math.max(0, Math.trunc(Number(this.tick) || 0));
  building.revision = Math.max(1, Math.trunc(Number(building.revision) || 1)) + 1;
  this.localBuildingViewCacheById.delete(building.id);
  this.markAoiViewChangedAt(building.x, building.y);
  this.worldRevision += 1;
  this.persistentRevision += 1;
  this.markPersistenceDirtyDomainsHighPriority(['building']);
  return { ok: true, building, changed: true };
 }
 /** updateBuildingAccessPolicyState：在实例权威边界内按槽位 CAS 更新通用权限。 */
 updateBuildingAccessPolicyState(buildingIdInput, slotInput, policyInput, expectedRevisionInput) {
  return updateBuildingAccessPolicyStateImpl(this, buildingIdInput, slotInput, policyInput, expectedRevisionInput);
 }
 /** deconstructBuildingInstance：服务端权威拆除建筑，调用方负责返还和审计。 */
 deconstructBuildingInstance(buildingIdInput, options: { treasureVaultRecovered?: boolean; timeChamberReleased?: boolean } = {}) {
  return deconstructBuildingInstanceImpl(this, buildingIdInput, options);
 }
 /** rebuildBuildingRoomFengShuiState：重建建筑拓扑、房间和风水派生快照。 */
 rebuildBuildingRoomFengShuiState(options = {}) {
  return rebuildBuildingRoomFengShuiStateImpl(this, options);
 }
 /** applyBuildingTopologyForBuilding：只把一个建筑投影到拓扑索引，避免每次建造扫描全实例建筑。 */
 applyBuildingTopologyForBuilding(buildingId) {
  return applyBuildingTopologyForBuildingImpl(this, buildingId);
 }
 /** hasBuildingLayerOverlapAtCell：建造前检查同一建筑层是否已有未销毁建筑，包括半成品。 */
 hasBuildingLayerOverlapAtCell(cellIndexInput, layerIdInput) {
  return hasBuildingLayerOverlapAtCellImpl(this, cellIndexInput, layerIdInput);
 }
 /** rebuildBuildingTopologyCells：只重建受影响 cell 的拓扑聚合。 */
 rebuildBuildingTopologyCells(cellIndices) {
  return rebuildBuildingTopologyCellsImpl(this, cellIndices);
 }
 /** 惰性创建本批次房间/风水脏状态，避免为无变化实例常驻分配集合。 */
 getOrCreatePendingBuildingRoomFengShuiState(reasonInput) {
  return getOrCreatePendingBuildingRoomFengShuiStateImpl(this, reasonInput);
 }
 /** 首次标脏时先持有派生域，防止 flush 读取尚未在息末收敛的旧快照。 */
 ensurePendingBuildingRoomFengShuiDomain(pending, domain, highPriority = false) {
  return ensurePendingBuildingRoomFengShuiDomainImpl(this, pending, domain, highPriority);
 }
 /** 成功收敛或显式立即重建后释放派生域围栏。失败路径不会调用此方法。 */
 releasePendingBuildingRoomFengShuiState(pending) {
  return releasePendingBuildingRoomFengShuiStateImpl(this, pending);
 }
 /** 拓扑变化只标脏；完整房间检测和风水计算统一延迟到实例调度批次末。 */
 markRoomsAndFengShuiDirtyAfterTopologyChange(options: any = {}) {
  return markRoomsAndFengShuiDirtyAfterTopologyChangeImpl(this, options);
 }
 /** 房间影响区变化只收集受影响房间；同息重复 cell/room 由 Set 合并。 */
 markFengShuiDirtyAfterRoomInfluenceChange(cellIndexInput, reasonInput = 'room_influence_change', options: any = {}) {
  return markFengShuiDirtyAfterRoomInfluenceChangeImpl(this, cellIndexInput, reasonInput, options);
 }
 /** 已知 roomId 的低频入口，主要用于保持手动角色变更的原有计算语义。 */
 markFengShuiDirtyRoom(roomIdInput, reasonInput = 'room_change', options: any = {}) {
  return markFengShuiDirtyRoomImpl(this, roomIdInput, reasonInput, options);
 }
 hasPendingBuildingRoomFengShuiChanges() {
  return hasPendingBuildingRoomFengShuiChangesImpl(this);
 }
 /** 按实例倍率把逻辑息折算为约一秒现实时间的风水收敛间隔。 */
 getBuildingRoomFengShuiFinalizeIntervalTicks() {
  return getBuildingRoomFengShuiFinalizeIntervalTicksImpl(this);
 }
 /** 判断当前脏快照是否已到刷新边界；首次脏数据立即允许收敛。 */
 shouldFinalizePendingBuildingRoomFengShuiChanges() {
  return shouldFinalizePendingBuildingRoomFengShuiChangesImpl(this);
 }
 /** 到达刷新边界后最多收敛一次；异常时保留脏状态和持久化围栏供下一批次重试。 */
 finalizePendingBuildingRoomFengShuiChanges() {
  return finalizePendingBuildingRoomFengShuiChangesImpl(this);
 }
 /** 显式立即入口供启动恢复和 GM 修复使用；成功后覆盖并释放已有延迟计划。 */
 recalculateRoomsAndFengShuiAfterTopologyChange(options: any = {}) {
  return recalculateRoomsAndFengShuiAfterTopologyChangeImpl(this, options);
 }
 /** 基于当前拓扑索引立即重算房间/风水，不重扫建筑拓扑。 */
 recalculateRoomsAndFengShuiImmediatelyAfterTopologyChange(options: any = {}) {
  return recalculateRoomsAndFengShuiImmediatelyAfterTopologyChangeImpl(this, options);
 }
 /** getEffectiveTileTypeByCellIndex：按 cell 读取当前有效地块，摧毁边界按空地处理。 */
 getEffectiveTileTypeByCellIndex(cellIndexInput) {
  return getEffectiveTileTypeByCellIndexImpl(this, cellIndexInput);
 }
 /** getGroundTileTypeByCellIndex：结构被拆/毁后露出的地面，不用固定 Floor 兜底。 */
 getGroundTileTypeByCellIndex(cellIndexInput) {
  return getGroundTileTypeByCellIndexImpl(this, cellIndexInput);
 }
 /** getDestroyedTileLayerStateByCellIndex：摧毁地块必须投影为真正可通行、无遮挡的地面。 */
 getDestroyedTileLayerStateByCellIndex(cellIndexInput, layerStateInput = null) {
  return getDestroyedTileLayerStateByCellIndexImpl(this, cellIndexInput, layerStateInput);
 }
 /** isRoomTopologyCell：判断地块类型或动态建筑拓扑是否可能改变房间边界/覆盖。 */
 isRoomTopologyCell(cellIndexInput, tileTypeInput = null) {
  return isRoomTopologyCellImpl(this, cellIndexInput, tileTypeInput);
 }
 /** collectRoomInfluenceRoomIdsByCell：返回此 cell 所在房间或相邻边界影响到的房间。 */
 collectRoomInfluenceRoomIdsByCell(cellIndexInput) {
  return collectRoomInfluenceRoomIdsByCellImpl(this, cellIndexInput);
 }
 /** isCellInRoomInfluence：判断 cell 是否处于房间内部或边界影响圈。 */
 isCellInRoomInfluence(cellIndexInput) {
  return isCellInRoomInfluenceImpl(this, cellIndexInput);
 }
 /** shouldRecalculateRoomsForTileMutation：拓扑地块或房间影响圈内变化才触发房间链路。 */
 shouldRecalculateRoomsForTileMutation(cellIndexInput, previousTileType = null, nextTileType = null) {
  return shouldRecalculateRoomsForTileMutationImpl(this, cellIndexInput, previousTileType, nextTileType);
 }
 /** 立即重算指定房间聚合与风水，供息末收敛和低频显式入口复用。 */
 recalculateFengShuiForRoomIdsImmediately(roomIdsInput, options: any = {}) {
  return recalculateFengShuiForRoomIdsImmediatelyImpl(this, roomIdsInput, options);
 }
 /** 低频显式立即入口；生产 tick 变化应使用 markFengShuiDirtyAfterRoomInfluenceChange。 */
 recalculateFengShuiAfterRoomInfluenceChange(cellIndexInput, reason = 'room_influence_change') {
  return recalculateFengShuiAfterRoomInfluenceChangeImpl(this, cellIndexInput, reason);
 }
 /** repairBuildingRoomFengShuiState：GM/运维入口，重建索引并清理孤儿派生。 */
 repairBuildingRoomFengShuiState() {
  return repairBuildingRoomFengShuiStateImpl(this);
 }
 /** getBuildingRoomFengShuiAt：GM 诊断指定 cell 的建筑、房间、风水来源。 */
 getBuildingRoomFengShuiAt(xInput, yInput) {
  return getBuildingRoomFengShuiAtImpl(this, xInput, yInput);
 }
 /** rebuildRoomCellIndices：重建 roomId -> cell 列表索引，供单房间风水重算复用。 */
 rebuildRoomCellIndices() {
  return rebuildRoomCellIndicesImpl(this);
 }
 /** buildRoomAggregates：按当前房间 cell 索引聚合风水计算输入。 */
 buildRoomAggregates(roomIdsInput = null) {
  return buildRoomAggregatesImpl(this, roomIdsInput);
 }
 /** collectBuildingEntriesForRoomAggregate：局部风水重算只扫描目标房间及边界邻格上的建筑。 */
 collectBuildingEntriesForRoomAggregate(roomIds) {
  return collectBuildingEntriesForRoomAggregateImpl(this, roomIds);
 }
 /** collectBuildingIdsAtCellForAggregate：按 cell 收集建筑 ID，避免重复读取同一 cell。 */
 collectBuildingIdsAtCellForAggregate(cellIndexInput, buildingIds, visitedCells) {
  return collectBuildingIdsAtCellForAggregateImpl(this, cellIndexInput, buildingIds, visitedCells);
 }
 /** resolveBuildingRoomId：将建筑关联到所在或相邻房间。 */
 resolveBuildingRoomId(buildingId) {
  return resolveBuildingRoomIdImpl(this, buildingId);
 }
 listBuildingSummaries() {
  return listBuildingSummariesImpl(this);
 }
 /** 收集宗门地图中由当前有效建筑权威占用的门窗结构格。 */
 collectExpectedSectBuildingVisualStructures() {
  return collectExpectedSectBuildingVisualStructuresImpl(this);
 }
 /**
  * 扫描宗门地图的孤儿门窗投影。
  *
  * 宗门地图真源只生成地板与边界石，因此当前格存在门窗、但没有同格有效建筑投影时，
  * 可以确定它是历史建筑占格错位留下的孤儿结构。普通地图不应用这条判定。
  */
 scanOrphanSectBuildingVisuals() {
  return scanOrphanSectBuildingVisualsImpl(this);
 }
 /** GM 兼容转换入口：清除已确认没有有效建筑真源的宗门门窗投影。 */
 removeOrphanSectBuildingVisuals() {
  return removeOrphanSectBuildingVisualsImpl(this);
 }
 listRoomSummaries() {
  return listRoomSummariesImpl(this);
 }
 getFengShuiSnapshot(roomId) {
  return getFengShuiSnapshotImpl(this, roomId);
 }
 setRoomRole(roomIdInput, roleInput) {
  return setRoomRoleImpl(this, roomIdInput, roleInput);
 }
 getFengShuiSnapshotAt(x, y) {
  return getFengShuiSnapshotAtImpl(this, x, y);
 }
 /** getFengShuiLuckAt：把当前格所在房间风水折算成临时幸运修正。 */
 getFengShuiLuckAt(x, y) {
  return getFengShuiLuckAtImpl(this, x, y);
 }
 buildBuildingPersistenceEntries() {
  return buildBuildingPersistenceEntriesImpl(this);
 }
 buildBuildingCellPersistenceEntries(buildingId) {
  return buildBuildingCellPersistenceEntriesImpl(this, buildingId);
 }
 buildBuildingRoomFengShuiPersistenceState() {
  return buildBuildingRoomFengShuiPersistenceStateImpl(this);
 }
 buildRoomCellPersistenceEntries() {
  return buildRoomCellPersistenceEntriesImpl(this);
 }
 /**
  * listPrunableVaultBuildings：启动自检前找出会因禁建区被摧毁的宝库。
  *
  * hydrate 是同步的，无法在其中 await 邮件返还，因此调用方先用本方法预检、
  * 返还库存，再把返还失败的建筑 id 作为豁免名单传回 hydrate。
  * 只扫描宝库，避免为每个墙体重复跑一遍冲突判定。
  */
 listPrunableVaultBuildings(state) {
  return listPrunableVaultBuildingsImpl(this, state);
 }
 /** 启动自检前找出会被摧毁、且需要先释放独立实例的密室建筑。 */
 listPrunableTimeChamberBuildings(state) {
  return listPrunableTimeChamberBuildingsImpl(this, state);
 }
 hydrateBuildingRoomFengShuiState(state, options: { keepBuildingIds?: Set<string> } = {}) {
  return hydrateBuildingRoomFengShuiStateImpl(this, state, options);
 }
 /** setPlayerMoveSpeed：设置玩家移动速度。 */
 setPlayerMoveSpeed(playerId, moveSpeed) {
  return setPlayerMoveSpeedImpl(this, playerId, moveSpeed);
 }
 /** setPlayerMovementCapabilities：同步玩家移动能力到实例内玩家镜像。 */
 setPlayerMovementCapabilities(playerId, capabilities) {
  return setPlayerMovementCapabilitiesImpl(this, playerId, capabilities);
 }
 /** enqueuePortalUse：把传送点使用请求排入下一次 tick。 */
 enqueuePortalUse(command) {
  return enqueuePortalUseImpl(this, command);
 }
 /** cancelPendingCommand：取消玩家在实例侧排队的待执行命令。 */
 cancelPendingCommand(playerId) {
  return cancelPendingCommandImpl(this, playerId);
 }
 /** enqueueDeferredCombatAction：把已出队的玩家战斗指令挂到本实例，等待统一出手排序结算。 */
 enqueueDeferredCombatAction(playerId, command) {
  this.deferredCombatActions.push({ playerId, command });
  return true;
 }
 /** consumeDeferredCombatActions：取出并清空本实例待统一结算的玩家战斗指令。 */
 consumeDeferredCombatActions() {
  const actions = this.deferredCombatActions;
  this.deferredCombatActions = [];
  return actions;
 }
 /** tryPortalTransfer：尝试按当前站位触发传送点跳转。 */
 tryPortalTransfer(playerId, reason) {
  return tryPortalTransferImpl(this, playerId, reason);
 }
 advanceBuildingConstruction() {
  return advanceBuildingConstructionImpl(this);
 }
 activatePlacedBuildingTopologyAndVisual(building) {
  return activatePlacedBuildingTopologyAndVisualImpl(this, building);
 }
 /** tickOnce：推进当前地图实例的一个逻辑 tick。
  * @param precomputedMonsterIntents 可选的 worker 预计算怪物意图，作为 target hints 加速 AI 决策。
  * @param options sleepMonsterAi=true 时仅休眠怪物主动寻敌、移动、攻击和吟唱，仍推进复活、buff 与恢复。
  */
 tickOnce(precomputedMonsterIntents = null, options = undefined) {
  return tickOnceImpl(this, precomputedMonsterIntents, options);
 }
 /** buildPlayerView：构建玩家当前视野快照。 */
 buildPlayerView(playerId, radius = DEFAULT_VIEW_RADIUS) {
  return buildPlayerViewImpl(this, playerId, radius);
 }
 /** buildAutoCombatView：构建自动战斗目标选择需要的轻量视野。 */
 buildAutoCombatView(playerId, radius = DEFAULT_VIEW_RADIUS) {
  return buildAutoCombatViewImpl(this, playerId, radius);
 }
 /** collectCachedAutoCombatTileVisibility：复用自动战斗只读视野地块，妖兽列表仍每 tick 按最新位置重建。 */
 collectCachedAutoCombatTileVisibility(playerId, originX, originY, radius) {
  return collectCachedAutoCombatTileVisibilityImpl(this, playerId, originX, originY, radius);
 }
 /** snapshot：构建地图实例快照。 */
 snapshot() {
  return snapshotImpl(this);
 }
 /** forEachPathingBlocker：遍历当前实例里的寻路阻挡地块。 */
 forEachPathingBlocker(excludePlayerId, visitor) {
  return forEachPathingBlockerImpl(this, excludePlayerId, visitor);
 }
 /** getTileAura：读取指定地块灵气。 */
 getTileAura(x, y) {
  return getTileAuraImpl(this, x, y);
 }
 /** getTileResource：读取指定地块的指定资源。 */
 getTileResource(resourceKey, x, y) {
  return getTileResourceImpl(this, resourceKey, x, y);
 }
 /** listTileResources：读取指定地块的全部有效资源。 */
 listTileResources(x, y) {
  return listTileResourcesImpl(this, x, y);
 }
 /** visitTileResources：无排序/无数组分配地遍历指定地块有效资源，供 tick 热路径使用。 */
 visitTileResources(x, y, visitor) {
  return visitTileResourcesImpl(this, x, y, visitor);
 }
 /** getTileGroundPile：读取指定地块地面物品堆。 */
 getTileGroundPile(x, y) {
  return getTileGroundPileImpl(this, x, y);
 }
 /** getBuildingsAtTile：低频观察查询同格建筑，返回运行态和编译定义。 */
 getBuildingsAtTile(x, y) {
  return getBuildingsAtTileImpl(this, x, y);
 }
 /** getPrimaryBuildingAtTile：按地块展示层级选择低频交互应命中的权威建筑。 */
 getPrimaryBuildingAtTile(x, y) {
  return getPrimaryBuildingAtTileImpl(this, x, y);
 }
 /** getActiveBuildingCombatStateAtCellIndex：动态建筑优先作为地块战斗真源。 */
 getActiveBuildingCombatStateAtCellIndex(cellIndex) {
  return getActiveBuildingCombatStateAtCellIndexImpl(this, cellIndex);
 }
 /** getTileCombatState：读取指定地块战斗状态。 */
 getTileCombatState(x, y) {
  return getTileCombatStateImpl(this, x, y);
 }
 /** 已完成边界与索引解析的地块战斗状态读取，供同格目标聚合查询复用。 */
 getTileCombatStateAtIndexedCell(tileIndex, x, y) {
  return getTileCombatStateAtIndexedCellImpl(this, tileIndex, x, y);
 }
 /** damageTile：对可破坏地块施加伤害。 */
 damageTile(x, y, damage, options: TileDropRollOptions = {}): any {
  return damageTileImpl(this, x, y, damage, options);
 }
 /** damageTilesBatch：批量伤害普通地块，特殊地块由 helper 回退单格生命周期。 */
 damageTilesBatch(entries: readonly TileDamageBatchInput[], options: TileDropRollOptions = {}) {
  return damageTilesBatchImpl(this, entries, options);
 }
 /** createTemporaryTile：创建或刷新技能生成的临时地块。 */
 createTemporaryTile(x, y, tileType, maxHp, durationTicks, currentTick, options: any = {}) {
  return createTemporaryTileImpl(this, x, y, tileType, maxHp, durationTicks, currentTick, options);
 }
 /** applyRuntimeTerrainArea：将实例范围覆盖为临时地形，供副本 Boss 的全图地形技能使用。 */
 applyRuntimeTerrainArea(tileType, durationTicks, currentTick = this.tick, options: any = {}) {
  return applyRuntimeTerrainAreaImpl(this, tileType, durationTicks, currentTick, options);
 }
 /** canCreateTemporaryTile：判断指定坐标是否允许生成临时地块。 */
 canCreateTemporaryTile(x, y) {
  return canCreateTemporaryTileImpl(this, x, y);
 }
 /** resolveTemporaryTileAvailability：返回临时地块生成可用性。 */
 resolveTemporaryTileAvailability(x, y) {
  return resolveTemporaryTileAvailabilityImpl(this, x, y);
 }
 /** advanceTemporaryTiles：推进临时地块过期；固脉阵稳定范围内暂停自动消失。 */
 advanceTemporaryTiles(currentTick = this.tick, isTerrainStabilized = null) {
  return advanceTemporaryTilesImpl(this, currentTick, isTerrainStabilized);
 }
 /** removeAbnormalTemporaryTiles：GM 手动清理旧版本异常临时石头。 */
 removeAbnormalTemporaryTiles(currentTick = this.tick) {
  return removeAbnormalTemporaryTilesImpl(this, currentTick);
 }
 /** advanceTileRecovery：推进可破坏地块的自然修复、固脉额外修复与复生。 */
 advanceTileRecovery(isTerrainStabilized, tileRecoveryProvider, terrainStabilizerHpRecoveryChecker = null) {
  return advanceTileRecoveryImpl(this, isTerrainStabilized, tileRecoveryProvider, terrainStabilizerHpRecoveryChecker);
 }
 /** advanceTemporaryTileHpRecoveryByTerrainStabilizer：固脉范围内的临时地块每息恢复 1% 最大生命。 */
 advanceTemporaryTileHpRecoveryByTerrainStabilizer(terrainStabilizerHpRecoveryChecker, now = Date.now()) {
  return advanceTemporaryTileHpRecoveryByTerrainStabilizerImpl(this, terrainStabilizerHpRecoveryChecker, now);
 }
 /** advanceBuildingHpRecoveryByTerrainStabilizer：固脉范围内的玩家建筑地块每息恢复 1% 最大生命。 */
 advanceBuildingHpRecoveryByTerrainStabilizer(terrainStabilizerHpRecoveryChecker) {
  return advanceBuildingHpRecoveryByTerrainStabilizerImpl(this, terrainStabilizerHpRecoveryChecker);
 }
 /** hasBlockingEntityAt：判断指定地块上是否已有会阻挡地形复生的单位。 */
 hasBlockingEntityAt(x, y) {
  return hasBlockingEntityAtImpl(this, x, y);
 }
 /** getBaseTileType：读取模板原始地块类型。 */
 getBaseTileType(x, y) {
  return getBaseTileTypeImpl(this, x, y);
 }
 /** getEffectiveTileType：读取地块当前生效类型，已摧毁地块按空地处理。 */
 getEffectiveTileType(x, y) {
  return getEffectiveTileTypeImpl(this, x, y);
 }
 /** getTileLayerState：读取指定坐标的权威分层状态，供低频投影和诊断使用。 */
 getTileLayerState(x, y) {
  return getTileLayerStateImpl(this, x, y);
 }
 /** getGroundPileBySourceId：按来源 ID 读取地面物品堆。 */
 getGroundPileBySourceId(sourceId) {
  return getGroundPileBySourceIdImpl(this, sourceId);
 }
 /** getPlayersAtTile：读取指定地块上的玩家。 */
 getPlayersAtTile(x, y) {
  return getPlayersAtTileImpl(this, x, y);
 }
 /** 权威运行时内部只读入口；避免目标规划为每个命中玩家复制完整地块快照。 */
 getPlayerRuntimeRefsAtTile(x, y) {
  return getPlayerRuntimeRefsAtTileImpl(this, x, y);
 }
 /**
  * 按一次地块索引读取战斗规划所需的运行态引用。
  * 仅返回允许的目标类型，空地块不分配临时数组或对象。
  */
 getCombatTargetRuntimeRefsAtTile(x, y, options: any = {}) {
  return getCombatTargetRuntimeRefsAtTileImpl(this, x, y, options);
 }
 /** getPortalAtTile：读取指定地块上的传送点。 */
 getPortalAtTile(x, y) {
  return getPortalAtTileImpl(this, x, y);
 }
 /** getLandmarkAtTile：读取指定地块上的地标。 */
 getLandmarkAtTile(x, y) {
  return getLandmarkAtTileImpl(this, x, y);
 }
 /** isSafeZoneTile：判断指定地块是否属于安全区。 */
 isSafeZoneTile(x, y) {
  return isSafeZoneTileImpl(this, x, y);
 }
 /** isPlayerOverlapTile：判断指定地块是否允许玩家重叠站立。 */
 isPlayerOverlapTile(x, y) {
  return isPlayerOverlapTileImpl(this, x, y);
 }
 /** getContainerAtTile：读取指定地块上的容器。 */
 getContainerAtTile(x, y) {
  return getContainerAtTileImpl(this, x, y);
 }
 /** getContainerById：按容器 ID 读取容器。 */
 getContainerById(containerId) {
  return getContainerByIdImpl(this, containerId);
 }
 /** getSafeZoneAtTile：读取指定地块上的安全区信息。 */
 getSafeZoneAtTile(x, y) {
  return getSafeZoneAtTileImpl(this, x, y);
 }
 /** isPointInSafeZone：判断坐标是否落在安全区内。 */
 isPointInSafeZone(x, y) {
  return isPointInSafeZoneImpl(this, x, y);
 }
 /** listMonsters：列出实例中的妖兽。 */
 listMonsters() {
  return listMonstersImpl(this);
 }
 /** listMonsterAiWorkerMirrors：列出 worker 预计算需要的存活妖兽精简镜像。 */
 listMonsterAiWorkerMirrors() {
  return listMonsterAiWorkerMirrorsImpl(this);
 }
 /** getMonsterAtTile：按地块读取存活妖兽，供战斗规划避免全量列怪建索引。 */
 getMonsterAtTile(x, y) {
  return getMonsterAtTileImpl(this, x, y);
 }
 /** 权威运行时内部只读入口；目标规划不得修改返回的妖兽真源引用。 */
 getMonsterRuntimeRefAtTile(x, y) {
  return getMonsterRuntimeRefAtTileImpl(this, x, y);
 }
 /** addRuntimeMonster：添加运行时动态妖兽，并把高价值运行态纳入实例分域持久化。 */
 addRuntimeMonster(monster) {
  return addRuntimeMonsterImpl(this, monster);
 }
 /** removeRuntimeMonster：移除运行时动态妖兽，不触发死亡、经验、掉落或击杀。 */
 removeRuntimeMonster(runtimeIdInput) {
  return removeRuntimeMonsterImpl(this, runtimeIdInput);
 }
 /** getMonster：按运行时 ID 读取妖兽。 */
 getMonster(runtimeId) {
  return getMonsterImpl(this, runtimeId);
 }
 /** getMonsterRuntimeRef：读取权威妖兽运行态引用，仅供服务端热路径内部只读使用。 */
 getMonsterRuntimeRef(runtimeId) {
  return getMonsterRuntimeRefImpl(this, runtimeId);
 }
 /** getNpc：按 ID 读取 NPC。 */
 getNpc(npcId) {
  return getNpcImpl(this, npcId);
 }
 /** getMonsterDamageContributionEntries：读取妖兽受到的伤害贡献记录。 */
 getMonsterDamageContributionEntries(runtimeId) {
  return getMonsterDamageContributionEntriesImpl(this, runtimeId);
 }
 getMonsterThreatTable(runtimeId) {
  return getMonsterThreatTableImpl(this, runtimeId);
 }
 addMonsterThreat(runtimeId, targetPlayerId, baseThreat, distance, extraAggroRate = 0) {
  return addMonsterThreatImpl(this, runtimeId, targetPlayerId, baseThreat, distance, extraAggroRate);
 }
 decayMonsterThreats(monster, activePlayerIds) {
  return decayMonsterThreatsImpl(this, monster, activePlayerIds);
 }
 getHighestMonsterThreatTarget(monster, canTarget) {
  return getHighestMonsterThreatTargetImpl(this, monster, canTarget);
 }
 /** getAdjacentNpc：读取玩家相邻的 NPC。 */
 getAdjacentNpc(playerId, npcId) {
  return getAdjacentNpcImpl(this, playerId, npcId);
 }
 /** applyDamageToMonster：对妖兽应用伤害并检查击败结果。 */
 applyDamageToMonster(runtimeId, amount, attackerPlayerId, damageElement = undefined, damageKind = undefined) {
  return applyDamageToMonsterImpl(this, runtimeId, amount, attackerPlayerId, damageElement, damageKind);
 }
 /** applyTemporaryBuffToMonster：给妖兽应用临时 Buff。 */
 applyTemporaryBuffToMonster(runtimeId, buff, options = undefined) {
  return applyTemporaryBuffToMonsterImpl(this, runtimeId, buff, options);
 }
 /** 精确替换妖兽的指定临时 Buff，供每息重算型行动效果使用。 */
 replaceTemporaryBuffOnMonster(runtimeId, buff, options = undefined) {
  return replaceTemporaryBuffOnMonsterImpl(this, runtimeId, buff, options);
 }
 /** defeatMonster：直接结算一只妖兽被击败后的占用释放。 */
 defeatMonster(runtimeId) {
  return defeatMonsterImpl(this, runtimeId);
 }
 /** addTileAura：给地块叠加灵气。 */
 addTileAura(x, y, amount) {
  return addTileAuraImpl(this, x, y, amount);
 }
 /** disperseQiAt：按单次灵力消耗向周围 3x3 地块注入逸散灵气。 */
 disperseQiAt(x, y, qiCost) {
  return disperseQiAtImpl(this, x, y, qiCost);
 }
 /** addTileResource：给地块叠加指定资源。 */
 addTileResource(resourceKey, x, y, amount) {
  return addTileResourceImpl(this, resourceKey, x, y, amount);
 }
 /** advanceTileResourceFlow：推进地块灵气向模板基线自然衰减或回补。 */
 advanceTileResourceFlow() {
  return advanceTileResourceFlowImpl(this);
 }
 /** hydrateAura：用持久化数据回填地块灵气。 */
 hydrateAura(entries) {
  return hydrateAuraImpl(this, entries);
 }
 /** hydrateTileResources：用持久化数据回填地块资源。 */
 hydrateTileResources(entries) {
  return hydrateTileResourcesImpl(this, entries);
 }
 /** hydrateTileDamage：用持久化数据回填可破坏地块状态。 */
 hydrateTileDamage(entries) {
  return hydrateTileDamageImpl(this, entries);
 }
 /** hydrateTemporaryTiles：用持久化数据回填技能生成的临时地块。 */
 hydrateTemporaryTiles(entries) {
  return hydrateTemporaryTilesImpl(this, entries);
 }
 /** hydrateRuntimeTiles：用持久化动态地块回填稀疏地块平面。 */
 hydrateRuntimeTiles(entries) {
  return hydrateRuntimeTilesImpl(this, entries);
 }
 /** applyPersistedTileLayers：回填动态地块的分层真源；修正旧库中 tileType 与分层自相矛盾的记录。 */
 applyPersistedTileLayers(tileIndex, entry) {
  return applyPersistedTileLayersImpl(this, tileIndex, entry);
 }
 /** shouldNormalizePersistedRuntimeTileToDefaultFallback：旧脏层缺少结构真源时，按统一默认四层回退，不按宗门或坐标特判。 */
 shouldNormalizePersistedRuntimeTileToDefaultFallback(tileType, terrainType, surfaceType, structureType, interactableKinds) {
  return shouldNormalizePersistedRuntimeTileToDefaultFallbackImpl(this, tileType, terrainType, surfaceType, structureType, interactableKinds);
 }
 /** shouldNormalizePersistedRuntimeTileLayers：旧 bug 可能把 floor 地块持久化成 stone_ground，回读时按 tileType 自修复。 */
 shouldNormalizePersistedRuntimeTileLayers(tileType, terrainType, surfaceType, structureType, interactableKinds) {
  return shouldNormalizePersistedRuntimeTileLayersImpl(this, tileType, terrainType, surfaceType, structureType, interactableKinds);
 }
 /** patchTileResources：在现有地块资源上叠加差量持久化条目，不重置未覆盖资源。 */
 patchTileResources(entries) {
  return patchTileResourcesImpl(this, entries);
 }
 /** hydrateGroundPiles：用持久化数据回填地面物品堆。 */
 hydrateGroundPiles(entries) {
  return hydrateGroundPilesImpl(this, entries);
 }
 /** hydrateTime：用持久化数据回填实例时间。 */
 hydrateTime(tick, options) {
  return hydrateTimeImpl(this, tick, options);
 }
 /** hydrateMonsterRuntimeStates：用持久化数据回填高价值妖兽运行态。 */
 hydrateMonsterRuntimeStates(entries, options = undefined) {
  return hydrateMonsterRuntimeStatesImpl(this, entries, options);
 }
 clearMonsterRuntimeTileIndex(runtimeId) {
  return clearMonsterRuntimeTileIndexImpl(this, runtimeId);
 }
 /** hydrateOverlayChunks：用分域 overlay chunk 回填运行期动态覆盖物。 */
 hydrateOverlayChunks(entries) {
  return hydrateOverlayChunksImpl(this, entries);
 }
 /** buildAuraPersistenceEntries：导出灵气持久化条目。 */
 buildAuraPersistenceEntries() {
  return buildAuraPersistenceEntriesImpl(this);
 }
 /** buildTileResourcePersistenceEntries：导出地块资源持久化条目。 */
 buildTileResourcePersistenceEntries() {
  return buildTileResourcePersistenceEntriesImpl(this);
 }
 /** buildTileResourcePersistenceDelta：导出地块资源行级增量。 */
 buildTileResourcePersistenceDelta(flushSnapshot = null) {
  return buildTileResourcePersistenceDeltaImpl(this, flushSnapshot);
 }
 /** buildGroundPersistenceEntries：导出地面物品堆持久化条目。 */
 buildGroundPersistenceEntries() {
  return buildGroundPersistenceEntriesImpl(this);
 }
 /** buildGroundPersistenceDelta：导出地面物品按 tile 替换增量。 */
 buildGroundPersistenceDelta(flushSnapshot = null) {
  return buildGroundPersistenceDeltaImpl(this, flushSnapshot);
 }
 /** 记录单个地块的完整地面物品，供跨域资产事务失败时精确恢复运行态。 */
 captureGroundTileItemsForAssetMutation(tileIndex) {
  return captureGroundTileItemsForAssetMutationImpl(this, tileIndex);
 }
 /**
  * durable 拾取失败时只补回本次拿走的条目；等待数据库期间新增的战斗掉落不会被旧快照覆盖。
  * 已在等待期间自然过期的条目不再复活。
  */
 restoreGroundItemsAfterFailedAssetTake(tileIndex, items) {
  return restoreGroundItemsAfterFailedAssetTakeImpl(this, tileIndex, items);
 }
 /** durable 丢弃失败时只扣回本次新增数量，保留等待期间落到同一地块或同一堆叠的物品。 */
 removeGroundItemsAfterFailedAssetDrop(tileIndex, items) {
  return removeGroundItemsAfterFailedAssetDropImpl(this, tileIndex, items);
 }
 /** 恢复单个地块的完整地面物品，不触碰其他地块或实例状态。 */
 restoreGroundTileItemsForAssetMutation(tileIndex, items) {
  return restoreGroundTileItemsForAssetMutationImpl(this, tileIndex, items);
 }
 /** buildTileDamagePersistenceEntries：导出可破坏地块持久化条目。 */
 buildTileDamagePersistenceEntries() {
  return buildTileDamagePersistenceEntriesImpl(this);
 }
 /** buildTileDamagePersistenceDelta：导出可破坏地块行级增量。 */
 buildTileDamagePersistenceDelta(flushSnapshot = null) {
  return buildTileDamagePersistenceDeltaImpl(this, flushSnapshot);
 }
 /** buildTemporaryTilePersistenceEntries：导出技能生成临时地块持久化条目。 */
 buildTemporaryTilePersistenceEntries() {
  return buildTemporaryTilePersistenceEntriesImpl(this);
 }
 /** buildRuntimeTilePersistenceEntries：导出模板外或运行时改写的动态地块。 */
 buildRuntimeTilePersistenceEntries() {
  return buildRuntimeTilePersistenceEntriesImpl(this);
 }
 /** buildOverlayPersistenceChunks：导出动态 overlay 分域持久化 chunk。 */
 buildOverlayPersistenceChunks() {
  return buildOverlayPersistenceChunksImpl(this);
 }
 /** buildMonsterRuntimePersistenceEntries：导出高价值妖兽运行态持久化条目。 */
 buildMonsterRuntimePersistenceEntries() {
  return buildMonsterRuntimePersistenceEntriesImpl(this);
 }
 /** buildMonsterRuntimePersistenceDelta：导出妖兽运行态行级增量。 */
 buildMonsterRuntimePersistenceDelta(flushSnapshot = null) {
  return buildMonsterRuntimePersistenceDeltaImpl(this, flushSnapshot);
 }
 /** isPersistentDirty：判断实例是否还有未落盘的持久化变更。 */
 isPersistentDirty() {
  return isPersistentDirtyImpl(this);
 }
 /** getPersistenceRevision：读取实例持久化版本。 */
 getPersistenceRevision() {
  return getPersistenceRevisionImpl(this);
 }
 /** 读取单个持久化域的运行态修订，用于判断 durable 等待期间是否出现并发源变更。 */
 getPersistenceDomainRevision(domain) {
  return getPersistenceDomainRevisionImpl(this, domain);
 }
 /** 读取当前 generation 已写入 flush ledger 的单域修订。 */
 getStagedPersistenceDomainRevision(domain, stagingGenerationId) {
  return getStagedPersistenceDomainRevisionImpl(this, domain, stagingGenerationId);
 }
 /** 捕获一次实例分域 flush 使用的 revision 与增量脏键，后续 IO 只消费该快照。 */
 capturePersistenceDomainFlushSnapshot(domains) {
  return capturePersistenceDomainFlushSnapshotImpl(this, domains);
 }
 /** ledger 批次提交成功后按捕获快照转移调度义务，但增量脏键保留到真实落库。 */
 markPersistenceDomainsStaged(domains, flushSnapshot = null, stagingGenerationId = '') {
  return markPersistenceDomainsStagedImpl(this, domains, flushSnapshot, stagingGenerationId);
 }
 /** getDirtyDomains：读取实例脏域集合。 */
 getDirtyDomains() {
  return getDirtyDomainsImpl(this);
 }
 /** markPersistenceDirtyDomains：记录实例脏域。 */
 markPersistenceDirtyDomains(domains) {
  return markPersistenceDirtyDomainsImpl(this, domains);
 }
 /** markPersistenceDirtyDomainsHighPriority：玩家主动操作标记高优先级脏域，绕过合并窗口。 */
 markPersistenceDirtyDomainsHighPriority(domains) {
  return markPersistenceDirtyDomainsHighPriorityImpl(this, domains);
 }
 /** markTileResourcePersistenceDirty：记录地块资源行级脏键。 */
 markTileResourcePersistenceDirty(resourceKey, tileIndex) {
  return markTileResourcePersistenceDirtyImpl(this, resourceKey, tileIndex);
 }
 /** markTileResourcePersistenceDirtyHighPriority：玩家主动操作触发的地块资源脏标记（高优先级）。 */
 markTileResourcePersistenceDirtyHighPriority(resourceKey, tileIndex) {
  return markTileResourcePersistenceDirtyHighPriorityImpl(this, resourceKey, tileIndex);
 }
 /** markTileDamagePersistenceDirty：记录地块损坏行级脏键。 */
 markTileDamagePersistenceDirty(tileIndex) {
  return markTileDamagePersistenceDirtyImpl(this, tileIndex);
 }
 /** markTileDamagePersistenceDirtyHighPriority：玩家主动破坏触发的地块损坏脏标记（高优先级）。 */
 markTileDamagePersistenceDirtyHighPriority(tileIndex) {
  return markTileDamagePersistenceDirtyHighPriorityImpl(this, tileIndex);
 }
 /** 批量记录玩家主动破坏的地块损坏脏键，域优先级只推进一次。 */
 markTileDamagePersistenceDirtyBatchHighPriority(tileIndices: ReadonlySet<number>) {
  return markTileDamagePersistenceDirtyBatchHighPriorityImpl(this, tileIndices);
 }
 /** markStaticTileSyncDirtyByIndex：记录实例级地块静态同步脏坐标。 */
 markStaticTileSyncDirtyByIndex(tileIndexInput, options = undefined) {
  return markStaticTileSyncDirtyByIndexImpl(this, tileIndexInput, options);
 }
 /** getStaticTileSyncRevision：读取地块静态同步 revision。 */
 getStaticTileSyncRevision() {
  return getStaticTileSyncRevisionImpl(this);
 }
 /** getStaticPathingRevision：读取只影响静态寻路网格的 revision。 */
 getStaticPathingRevision() {
  return getStaticPathingRevisionImpl(this);
 }
 /**
  * 串行执行跨 await 的实例分域变更。普通 flush 与 durable 来源事务必须走同一队列，
  * 避免旧 delta 在 durable 提交后重新覆盖数据库来源状态。
  */
 async runExclusivePersistenceDomainMutation<TResult>(
  domains: readonly string[],
  action: () => Promise<TResult> | TResult,
 ): Promise<TResult> {
  return runExclusivePersistenceDomainMutationImpl(this, domains, action);
 }
 /** 持有一个实例持久化域；返回的 release 必须在事务完成或回滚后调用。 */
 acquirePersistenceDomainHold(domain) {
  return acquirePersistenceDomainHoldImpl(this, domain);
 }
 isPersistenceDomainHeld(domain) {
  return isPersistenceDomainHeldImpl(this, domain);
 }
 /** consumeStaticTileSyncDirtyTiles：消费当前实例级地块静态脏坐标，由网络层缓存本轮 plan。 */
 consumeStaticTileSyncDirtyTiles() {
  return consumeStaticTileSyncDirtyTilesImpl(this);
 }
 /** markGroundItemPersistenceDirty：记录地面物品按 tile 替换脏键。 */
 markGroundItemPersistenceDirty(tileIndex) {
  return markGroundItemPersistenceDirtyImpl(this, tileIndex);
 }
 /** ensureGroundItemExpiryDefaults：给旧版无过期元数据的地面物品补默认 TTL。 */
 ensureGroundItemExpiryDefaults(currentTick = this.tick) {
  return ensureGroundItemExpiryDefaultsImpl(this, currentTick);
 }
 /** advanceGroundItemExpiry：推进地面物品过期并彻底移除。 */
 advanceGroundItemExpiry(currentTick = this.tick) {
  return advanceGroundItemExpiryImpl(this, currentTick);
 }
 /** markMonsterRuntimePersistenceDirty：记录妖兽运行态行级脏键。 */
 markMonsterRuntimePersistenceDirty(runtimeId) {
  return markMonsterRuntimePersistenceDirtyImpl(this, runtimeId);
 }
 /** markPersistenceDomainsPersisted：标记指定实例域已完成持久化。 */
 markPersistenceDomainsPersisted(domains, flushSnapshot = null) {
  return markPersistenceDomainsPersistedImpl(this, domains, flushSnapshot);
 }
 /** clearDirtyDomains：清空实例脏域集合。 */
 clearDirtyDomains() {
  return clearDirtyDomainsImpl(this);
 }
 /** getDirtyDomainFirstMarkedAt：获取 domain 首次变脏时间戳。 */
 getDirtyDomainFirstMarkedAt(domain) {
  return getDirtyDomainFirstMarkedAtImpl(this, domain);
 }
 /** isDirtyDomainHighPriority：判断 domain 是否为高优先级（玩家主动操作）。 */
 isDirtyDomainHighPriority(domain) {
  return isDirtyDomainHighPriorityImpl(this, domain);
 }
 /** markAuraPersisted：标记灵气状态已完成持久化。 */
 markAuraPersisted() {
  return markAuraPersistedImpl(this);
 }
 /** dropGroundItem：把物品丢到地面堆中。 */
 dropGroundItem(x, y, item) {
  return dropGroundItemImpl(this, x, y, item);
 }
 /** rollTileDrops：按 structure/terrain 分层耐久配置结算本次伤害和拆除掉落。 */
 rollTileDrops(tileState, appliedDamage, destroyed, options: TileDropRollOptions = {}) {
  return rollTileDropsImpl(this, tileState, appliedDamage, destroyed, options);
 }
 /** takeGroundItem：从地面堆中取走指定物品。 */
 takeGroundItem(sourceId, itemKey, takerX, takerY) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!this.isInBounds(takerX, takerY)) {
   return null;
  }

  const tileIndex = parseGroundSourceId(sourceId);
  if (tileIndex === null) {
   return null;
  }

  const pile = this.groundPilesByTile.get(tileIndex);
  if (!pile) {
   return null;
  }
  if (chebyshevDistance(takerX, takerY, pile.x, pile.y) > 1) {
   return null;
  }

  const entryIndex = findGroundEntryIndex(pile.items, itemKey);
  if (entryIndex < 0) {
   return null;
  }
  const [entry] = pile.items.splice(entryIndex, 1);
  if (!entry) {
   return null;
  }
  if (pile.items.length === 0) {
   this.groundPilesByTile.delete(tileIndex);
   // P0-4 entry cache 跟随 entity lifecycle 释放：地面物品堆被拾光时清理 view 条目，避免长期累积 frozen entry。
   this.localGroundPileViewCacheBySourceId.delete(buildGroundSourceId(tileIndex));
  }
  this.markGroundItemPersistenceDirty(tileIndex);
  this.markFengShuiDirtyAfterRoomInfluenceChange(tileIndex, 'ground_item_taken');
  this.persistentRevision += 1;
  this.worldRevision += 1;
  return toInventoryItemFromGroundItem(entry.item);
 }
 /** applyMove：应用一次玩家移动。 */
 applyMove(player, direction, transfers, continuous = false, maxSteps = undefined, path = undefined) {
  return applyMoveImpl(this, player, direction, transfers, continuous, maxSteps, path);
 }
 /** getStaticObstacleTraversalCost：忽略静态障碍时按基础单步移动消耗处理。 */
 getStaticObstacleTraversalCost(tileIndex) {
  return getStaticObstacleTraversalCostImpl(this, tileIndex);
 }
 /** canPlayerIgnoreStaticObstacle：读取玩家是否拥有忽略静态障碍移动能力。 */
 canPlayerIgnoreStaticObstacle(player, currentTick) {
  return canPlayerIgnoreStaticObstacleFromState(player, currentTick);
 }
 /** buildTransfer：构建跨图传送结果。 */
 buildTransfer(player, portal, reason) {
  return {
   playerId: player.playerId,
   sessionId: player.sessionId,
   fromInstanceId: this.meta.instanceId,
   targetMapId: portal.targetMapId,
   targetInstanceId: portal.targetInstanceId ?? null,
   targetX: portal.targetX,
   targetY: portal.targetY,
   reason,
  };
 }
 /** rechargePlayerMoveBudget：恢复玩家移动预算。 */
 rechargePlayerMoveBudget(player, requiredMovePoints = 0) {
  return rechargePlayerMoveBudgetImpl(this, player, requiredMovePoints);
 }
 /** getTileTraversalCost：读取地块通行代价。 */
 getTileTraversalCost(x, y, playerId = null) {
  return getTileTraversalCostImpl(this, x, y, playerId);
 }
 /** getStaticTileTraversalCost：读取不含玩家/阵法等动态占位的静态地块代价。 */
 getStaticTileTraversalCost(x, y) {
  return getStaticTileTraversalCostImpl(this, x, y);
 }
 /** getTileQiDrainPerTick：读取地块每息灵力消耗。 */
 getTileQiDrainPerTick(x, y) {
  return getTileQiDrainPerTickImpl(this, x, y);
 }
 /** normalizeVisibilityFilter：统一视野过滤输入，坐标 key 优先、索引兼容。 */
 normalizeVisibilityFilter(visibleTileVisibility = null) {
  if (!visibleTileVisibility) {
   return { indices: null, keys: null };
  }
  if (visibleTileVisibility instanceof Set) {
   return { indices: visibleTileVisibility, keys: null };
  }
  return {
   indices: visibleTileVisibility.indices instanceof Set ? visibleTileVisibility.indices : null,
   keys: visibleTileVisibility.keys instanceof Set ? visibleTileVisibility.keys : null,
  };
 }
 /** isTileVisibleByFilter：按 main 语义以 visibleKeys 为视野真源，索引用于旧调用兼容。 */
 isTileVisibleByFilter(x, y, visibility) {
  return isTileVisibleByFilterImpl(this, x, y, visibility);
 }
 /** isTileInsideViewRadius：视野窗口粗过滤，不再按模板 width/height 裁剪稀疏坐标。 */
 isTileInsideViewRadius(centerX, centerY, radius, x, y) {
  return isTileInsideViewRadiusImpl(this, centerX, centerY, radius, x, y);
 }
 /** collectVisiblePlayers：收集当前视野内可见玩家。 */
 collectVisiblePlayers(observer, radius, visibleTileVisibility = null) {
  return collectVisiblePlayersImpl(this, observer, radius, visibleTileVisibility);
 }
 /** collectLocalPortals：收集当前视野内可见传送点。 */
 collectLocalPortals(centerX, centerY, radius, visibleTileVisibility = null) {
  return collectLocalPortalsImpl(this, centerX, centerY, radius, visibleTileVisibility);
 }
 /** collectLocalGroundPiles：收集当前视野内可见地面物品堆。 */
 collectLocalGroundPiles(centerX, centerY, radius, visibleTileVisibility = null) {
  return collectLocalGroundPilesImpl(this, centerX, centerY, radius, visibleTileVisibility);
 }
 /** collectLocalContainers：收集当前视野内可见容器。 */
 collectLocalContainers(centerX, centerY, radius, visibleTileVisibility = null) {
  return collectLocalContainersImpl(this, centerX, centerY, radius, visibleTileVisibility);
 }
 /** collectLocalBuildings：收集视野内需要以建筑实体形式展示/交互的建筑。 */
 collectLocalBuildings(centerX, centerY, radius, visibleTileVisibility = null) {
  return collectLocalBuildingsImpl(this, centerX, centerY, radius, visibleTileVisibility);
 }
 /** collectLocalLandmarks：收集当前视野内可见地标。 */
 collectLocalLandmarks(centerX, centerY, radius, visibleTileVisibility = null) {
  return collectLocalLandmarksImpl(this, centerX, centerY, radius, visibleTileVisibility);
 }
 /** collectLocalSafeZones：收集当前视野内可见安全区。 */
 collectLocalSafeZones(centerX, centerY, radius, visibleTileVisibility = null) {
  return collectLocalSafeZonesImpl(this, centerX, centerY, radius, visibleTileVisibility);
 }
 /** collectLocalNpcs：收集当前视野内可见 NPC。 */
 collectLocalNpcs(centerX, centerY, radius, visibleTileVisibility = null) {
  return collectLocalNpcsImpl(this, centerX, centerY, radius, visibleTileVisibility);
 }
 /** getLocalPlayerViewEntry：复用未变化的可见玩家视野条目。 */
 getLocalPlayerViewEntry(player) {
  return getLocalPlayerViewEntryImpl(this, player);
 }
 /** getLocalPortalViewEntry：复用未变化的传送点视野条目。 */
 getLocalPortalViewEntry(portal) {
  return getLocalPortalViewEntryImpl(this, portal);
 }
 /** getLocalGroundPileViewEntry：复用未变化的地面物品堆视野条目。 */
 getLocalGroundPileViewEntry(pile) {
  return getLocalGroundPileViewEntryImpl(this, pile);
 }
 /** getLocalContainerViewEntry：复用未变化的容器视野条目。 */
 getLocalContainerViewEntry(container) {
  return getLocalContainerViewEntryImpl(this, container);
 }
 /** getLocalBuildingViewEntry：复用未变化的建筑视野条目。 */
 getLocalBuildingViewEntry(building, compiled) {
  return getLocalBuildingViewEntryImpl(this, building, compiled);
 }
 /** getLocalLandmarkViewEntry：复用未变化的地标视野条目。 */
 getLocalLandmarkViewEntry(landmark) {
  return getLocalLandmarkViewEntryImpl(this, landmark);
 }
 /** getLocalSafeZoneViewEntry：复用未变化的安全区视野条目。 */
 getLocalSafeZoneViewEntry(zone) {
  return getLocalSafeZoneViewEntryImpl(this, zone);
 }
 /** getLocalNpcViewEntry：复用未变化的 NPC 视野条目。 */
 getLocalNpcViewEntry(npc) {
  return getLocalNpcViewEntryImpl(this, npc);
 }
 /** collectLocalMonsters：收集当前视野内可见妖兽。 */
 collectLocalMonsters(centerX, centerY, radius, visibleTileVisibility = null) {
  return collectLocalMonstersImpl(this, centerX, centerY, radius, visibleTileVisibility);
 }
 /** collectAutoCombatMonsters：自动战斗只读 runtimeId/x/y/hp，跳过客户端投影缓存校验和排序。 */
 collectAutoCombatMonsters(centerX, centerY, radius, visibleTileVisibility = null) {
  return collectAutoCombatMonstersImpl(this, centerX, centerY, radius, visibleTileVisibility);
 }
 /** getLocalMonsterViewEntry：复用未变化的本地妖兽视野条目。 */
 getLocalMonsterViewEntry(monster) {
  return getLocalMonsterViewEntryImpl(this, monster);
 }
 /** advanceMonsters：推进妖兽 AI 和行动。 */
 advanceMonsters(monsterActions, precomputedIntents = null, options = undefined) {
  return advanceMonstersImpl(this, monsterActions, precomputedIntents, options);
 }
 /** findSpawnPoint：查找生成点。 */
 findSpawnPoint(preferredX, preferredY, playerId = null) {
  return findSpawnPointImpl(this, preferredX, preferredY, playerId);
 }
 /** findNearestOpenTile：查找最近的可占用地块。 */
 findNearestOpenTile(originX, originY, playerId = null) {
  return findNearestOpenTileImpl(this, originX, originY, playerId);
 }
 /** clampToRuntimeTileBounds：按真实稀疏地块边界夹取坐标，支持宗门 signed 坐标。 */
 clampToRuntimeTileBounds(value, axis) {
  return clampToRuntimeTileBoundsImpl(this, value, axis);
 }
 /** isOpenTile：判断地块是否可占用。 */
 isOpenTile(x, y, playerId = null) {
  return isOpenTileImpl(this, x, y, playerId);
 }
 /** isWalkable：判断地块是否可行走。 */
 isWalkable(x, y, playerId = null) {
  return isWalkableImpl(this, x, y, playerId);
 }
 /** isCellIndexWalkable：按预合成 flags 判断静态通行，摧毁/临时地块按有效投影兜底。 */
 isCellIndexWalkable(cellIndexInput) {
  return isCellIndexWalkableImpl(this, cellIndexInput);
 }
 /** isDynamicallyBlockedTile：判断运行期动态阻挡是否覆盖目标地块。 */
 isDynamicallyBlockedTile(x, y, playerId = null) {
  return isDynamicallyBlockedTileImpl(this, x, y, playerId);
 }
 /** setCompositeSightResolver：设置跨地图视觉叠加查询。 */
 setCompositeSightResolver(resolver) {
  return setCompositeSightResolverImpl(this, resolver);
 }
 /** resolveCompositeSightBlocked：查询非本图坐标的视觉遮挡。 */
 resolveCompositeSightBlocked(x, y) {
  return resolveCompositeSightBlockedImpl(this, x, y);
 }
 /** canResolveSightCoordinate：判断坐标是否存在可用于视野计算的地块。 */
 canResolveSightCoordinate(x, y) {
  return canResolveSightCoordinateImpl(this, x, y);
 }
 /** isTileSightBlocked：判断地块是否阻挡视线。动态阵法边界只挡通行，不挡视线。 */
 isTileSightBlocked(x, y) {
  return isTileSightBlockedImpl(this, x, y);
 }
 /** canSeeTileFrom：判断 origin 在指定半径内是否能看见目标地块。 */
 canSeeTileFrom(originX, originY, targetX, targetY, radius) {
  return canSeeTileFromImpl(this, originX, originY, targetX, targetY, radius);
 }
 /** collectVisibleTileIndices：收集视野内可见地块索引。 */
 collectVisibleTileIndices(originX, originY, radius) {
  return collectVisibleTileIndicesImpl(this, originX, originY, radius);
 }
 /** collectVisibleTileVisibility：收集本图索引和跨图坐标视野。 */
 collectVisibleTileVisibility(originX, originY, radius, options = undefined) {
  return collectVisibleTileVisibilityImpl(this, originX, originY, radius, options);
 }
 /** castLight：把视野光照落到地图上。 */
 castLight(originX, originY, row, startSlope, endSlope, radius, xx, xy, yx, yy, visibleTileIndices, visibleTileKeys = null) {
  return castLightImpl(this, originX, originY, row, startSlope, endSlope, radius, xx, xy, yx, yy, visibleTileIndices, visibleTileKeys);
 }
 /** isAnyTileVisibleInCircle：判断圆形范围内是否存在可见地块。 */
 isCircleInsideViewRadius(viewCenterX, viewCenterY, viewRadius, centerX, centerY, radius) {
  return isCircleInsideViewRadiusImpl(this, viewCenterX, viewCenterY, viewRadius, centerX, centerY, radius);
 }
 /** isAnyTileVisibleInCircle：判断圆形范围内是否存在可见地块。 */
 isAnyTileVisibleInCircle(centerX, centerY, radius, visibleTileVisibility) {
  return isAnyTileVisibleInCircleImpl(this, centerX, centerY, radius, visibleTileVisibility);
 }
 /** getPortalAt：按坐标读取传送点。 */
 getPortalAt(x, y) {
  return getPortalAtImpl(this, x, y);
 }
 listAllPortals() {
  return listAllPortalsImpl(this);
 }
 getInteractablePortalNear(x, y) {
  return getInteractablePortalNearImpl(this, x, y);
 }
 /** updateAuraDirtyState：更新灵气脏状态。 */
 updateAuraDirtyState(tileIndex, previous, next) {
  return updateAuraDirtyStateImpl(this, tileIndex, previous, next);
 }
 /** getOrCreateTileResourceBucket：读取或初始化地块资源桶。 */
 getOrCreateTileResourceBucket(resourceKey) {
  return getOrCreateTileResourceBucketImpl(this, resourceKey);
 }
 /** getOrCreateBaseTileResourceBucket：读取或初始化模板基线资源桶。 */
 getOrCreateBaseTileResourceBucket(resourceKey) {
  return getOrCreateBaseTileResourceBucketImpl(this, resourceKey);
 }
 /** getOrCreateTileResourceFlowRemainderBucket：读取或创建地块气机流转余数桶。 */
 getOrCreateTileResourceFlowRemainderBucket(resourceKey) {
  return getOrCreateTileResourceFlowRemainderBucketImpl(this, resourceKey);
 }
 /** updateTileResourceFlowIndex：维护需要自然流转的地块索引集合。 */
 updateTileResourceFlowIndex(resourceKey, tileIndex, value = this.getTileResourceValueByIndex(resourceKey, tileIndex)) {
  return updateTileResourceFlowIndexImpl(this, resourceKey, tileIndex, value);
 }
 /** rebuildTileResourceFlowIndices：从当前资源桶重建自然流转索引。 */
 rebuildTileResourceFlowIndices() {
  return rebuildTileResourceFlowIndicesImpl(this);
 }
 /** getTileResourceBaseValueByIndex：读取资源在模板上的基线值。 */
 getTileResourceBaseValueByIndex(resourceKey, tileIndex) {
  return getTileResourceBaseValueByIndexImpl(this, resourceKey, tileIndex);
 }
 /** getTileResourceValueByIndex：读取资源在指定索引上的当前值。 */
 getTileResourceValueByIndex(resourceKey, tileIndex) {
  return getTileResourceValueByIndexImpl(this, resourceKey, tileIndex);
 }
 /** setTileResourceValueByIndex：写入资源值并维护脏标记。 */
 setTileResourceValueByIndex(resourceKey, tileIndex, next, previous = this.getTileResourceValueByIndex(resourceKey, tileIndex)) {
  return setTileResourceValueByIndexImpl(this, resourceKey, tileIndex, next, previous);
 }
 /** ensureCellStorageCapacity：保证按 cell index 寻址的运行时列容量足够。 */
 ensureCellStorageCapacity(required) {
  const normalizedRequired = Math.max(0, Math.trunc(Number(required) || 0));
  if (normalizedRequired <= this.occupancy.length) {
   return;
  }
  const nextCapacity = nextPowerOfTwo(normalizedRequired);
  this.buildingTopologyIndex?.ensureCapacity?.(nextCapacity);
  const nextOccupancy = new Uint32Array(nextCapacity);
  nextOccupancy.set(this.occupancy);
  this.occupancy = nextOccupancy;
  for (const [resourceKey, bucket] of Array.from(this.tileResourceBuckets.entries())) {
   if (bucket.length >= nextCapacity) {
    continue;
   }
   const nextBucket = new Float64Array(nextCapacity);
   nextBucket.set(bucket);
   this.tileResourceBuckets.set(resourceKey, nextBucket);
   if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
    this.auraByTile = nextBucket;
   }
  }
  for (const [resourceKey, bucket] of Array.from(this.baseTileResourceBuckets.entries())) {
   if (bucket.length >= nextCapacity) {
    continue;
   }
   const nextBucket = new Float64Array(nextCapacity);
   nextBucket.set(bucket);
   this.baseTileResourceBuckets.set(resourceKey, nextBucket);
  }
  for (const [resourceKey, bucket] of Array.from(this.tileResourceFlowRemainderBuckets.entries())) {
   if (bucket.length >= nextCapacity) {
    continue;
   }
   const nextBucket = new Float64Array(nextCapacity);
   nextBucket.set(bucket);
   this.tileResourceFlowRemainderBuckets.set(resourceKey, nextBucket);
  }
 }
 /** applyTileResourceDirtyCounter：维护地块资源脏条目统计。 */
 applyTileResourceDirtyCounter(resourceKey, tileIndex, previous, next) {
  return applyTileResourceDirtyCounterImpl(this, resourceKey, tileIndex, previous, next);
 }
 /** isInBounds：判断坐标是否在地图范围内。 */
 isInBounds(x, y) {
  return this.tilePlane.getCellIndex(x, y) >= 0;
 }
 /** isSectVirtualBoundaryTile：宗门模板外紧邻已定义地块的未定义坐标按边界石头投影。 */
 isSectVirtualBoundaryTile(x, y) {
  return isSectVirtualBoundaryTileImpl(this, x, y);
 }
 /** isSectRuntimeExpandedBoundaryStone：宗门模板外已激活的边界石，打穿后应变成地板而不是复生石头。 */
 isSectRuntimeExpandedBoundaryStone(tileIndex, combatState = null) {
  if (this.template?.source?.sectMap !== true || !Number.isFinite(Number(tileIndex))) {
   return false;
  }
  const normalizedTileIndex = Math.trunc(Number(tileIndex));
  if (normalizedTileIndex < 0 || normalizedTileIndex >= this.tilePlane.getCellCount()) {
   return false;
  }
  const x = this.tilePlane.getX(normalizedTileIndex);
  const y = this.tilePlane.getY(normalizedTileIndex);
  if (x >= 0 && y >= 0 && x < this.template.width && y < this.template.height) {
   return false;
  }
  const layerState = typeof this.tilePlane.getTileLayerState === 'function'
   ? this.tilePlane.getTileLayerState(normalizedTileIndex)
   : null;
  return (combatState?.tileType ?? this.tilePlane.getTileType(normalizedTileIndex)) === TileType.Stone
   && (layerState?.structure ?? null) === StructureType.Stone;
 }
 /** setOccupied：设置地块占用状态。 */
 setOccupied(x, y, handle) {
  return setOccupiedImpl(this, x, y, handle);
 }
 /** toTileIndex：把坐标转换成地块索引。 */
 toTileIndex(x, y) {
  return toTileIndexImpl(this, x, y);
 }
 /** allocateHandle：分配一个可复用句柄。 */
 allocateHandle() {
  return this.freeHandles.pop() ?? this.nextHandle++;
 }
 /** initializeMonsterSpawnAccelerationStates：初始化普通怪物刷新点清场加速状态。 */
 initializeMonsterSpawnAccelerationStates() {
  return initializeMonsterSpawnAccelerationStatesImpl(this);
 }
 /** getMonsterSpawnGroup：读取同一刷新点下的全部怪物。 */
 getMonsterSpawnGroup(monster) {
  return getMonsterSpawnGroupImpl(this, monster);
 }
 /** getMonsterSpawnAccelerationState：读取或创建普通怪物刷新点加速状态。 */
 getMonsterSpawnAccelerationState(monster) {
  return getMonsterSpawnAccelerationStateImpl(this, monster);
 }
 /** resolveMonsterRespawnTicks：按普通怪物清场加速状态计算本次复活间隔。 */
 resolveMonsterRespawnTicks(monster) {
  return resolveMonsterRespawnTicksImpl(this, monster);
 }
 /** handleMonsterRespawn：普通怪物整组复活后重设下一次清场期限。 */
 handleMonsterRespawn(monster) {
  return handleMonsterRespawnImpl(this, monster);
 }
 /** handleMonsterDefeat：普通怪物整组清场时更新加速倍率并统一复活倒计时。 */
 handleMonsterDefeat(monster) {
  return handleMonsterDefeatImpl(this, monster);
 }
 /** markMonsterDefeated：标记妖兽已经被击败。 */
 markMonsterDefeated(monster) {
  return markMonsterDefeatedImpl(this, monster);
 }
 /** respawnMonster：在重生点复生妖兽。 */
 respawnMonster(monster) {
  return respawnMonsterImpl(this, monster);
 }
 /** resolveMonsterTarget：解析妖兽的当前目标。 */
 resolveMonsterTarget(monster) {
  return resolveMonsterTargetImpl(this, monster);
 }
 /**
  * Phase 4: 使用 worker 预计算 intent 作为 target hint 加速解析。
  * - idle hint + 无 aggroTarget + 无玩家在范围内 → 只 decay → return null（跳过 shadowcasting）
  * - idle hint 但有玩家在范围内 → fallback 完整扫描
  * - attack hint + 目标有效（存活、在范围内） → 仍执行完整仇恨逻辑（保证仇恨切换），只跳过目标选择
  * - attack hint + 目标无效 → fallback 完整扫描
  */
 resolveMonsterTargetWithHint(monster, preIntent) {
  return resolveMonsterTargetWithHintImpl(this, monster, preIntent);
 }
 /** rememberMonsterTargetSight：记录妖兽最后一次真正看见目标的位置。 */
 rememberMonsterTargetSight(monster, target) {
  return rememberMonsterTargetSightImpl(this, monster, target);
 }
 /** clearMonsterTargetPursuit：清理妖兽追击状态。 */
 clearMonsterTargetPursuit(monster) {
  return clearMonsterTargetPursuitImpl(this, monster);
 }
 /** clearMonsterActiveAiStateForSleep：空实例休眠主动 AI 时清理追击态，避免玩家回图后继承过期仇恨。 */
 clearMonsterActiveAiStateForSleep(monster) {
  return clearMonsterActiveAiStateForSleepImpl(this, monster);
 }
 /** clearMonsterAggroForPlayer：清除所有以指定玩家为仇恨目标的妖兽仇恨。 */
 clearMonsterAggroForPlayer(playerId: string) {
  return clearMonsterAggroForPlayerImpl(this, playerId);
 }
 /** resolveMonsterLostSightChaseTarget：解析妖兽丢视野后的短暂追击落点。 */
 resolveMonsterLostSightChaseTarget(monster) {
  return resolveMonsterLostSightChaseTargetImpl(this, monster);
 }
 /** isMonsterWithinWanderRange：判断妖兽是否仍在活动范围内。 */
 isMonsterWithinWanderRange(monster, x, y) {
  return isMonsterWithinWanderRangeImpl(this, monster, x, y);
 }
 /** stepMonsterIdleRoam：让无目标妖兽在活动范围内随机闲逛一步。 */
 stepMonsterIdleRoam(monster) {
  return stepMonsterIdleRoamImpl(this, monster);
 }
 /** tryMoveMonsterToward：尝试让妖兽朝目标移动。 */
 tryMoveMonsterToward(monster, targetX, targetY) {
  return tryMoveMonsterTowardImpl(this, monster, targetX, targetY);
 }
 /** isMonsterOpenTile：御空期间允许妖兽穿越静态不可行走地形，但仍遵守边界、动态阻挡和占位。 */
 isMonsterOpenTile(monster, x, y) {
  return isMonsterOpenTileImpl(this, monster, x, y);
 }
}

export { MapInstanceRuntime };
