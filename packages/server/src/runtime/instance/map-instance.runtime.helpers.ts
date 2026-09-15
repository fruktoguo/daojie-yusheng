/**
 * map-instance.runtime.helpers.ts
 *
 * 从 map-instance.runtime.ts 抽出的模块级游离函数与常量。
 * 包含：地块耐久/恢复、脏域管理、地面物品、妖兽派生状态/Buff/AI/技能、
 * 建筑投影/风水聚合、快照比较等纯函数工具集。
 * 所有函数均不依赖 MapInstanceRuntime 实例状态，可独立测试。
 */
import {
  DEFAULT_QI_RESOURCE_DESCRIPTOR,
  DEFAULT_QI_RUNTIME_FLOW_CONFIGS,
  DISPERSED_AURA_RESOURCE_KEY,
  DUNGEON_PRESSURE_BUFF_ID,
  DUNGEON_PRESSURE_COMBAT_STAT_KEYS,
  DUNGEON_PRESSURE_ELEMENT_KEYS,
  Direction,
  GROUND_ITEM_EXPIRE_TICKS,
  OWNER_ONLY_ACCESS_POLICY,
  QI_HALF_LIFE_RATE_SCALE,
  StructureType,
  TILE_AURA_HALF_LIFE_RATE_SCALE,
  TILE_AURA_HALF_LIFE_RATE_SCALED,
  TERRAIN_DESTROYED_RESTORE_TICKS,
  TERRAIN_REGEN_RATE_PER_TICK,
  TERRAIN_RESTORE_RETRY_DELAY_TICKS,
  TileType,
  buildEffectiveTargetingGeometry,
  buildQiResourceKey,
  calcQiCostWithOutputLimit,
  calculateTerrainDurability,
  cloneAccessPolicy,
  composeTileTypeFromLayers,
  computeAffectedCellsFromAnchor,
  createItemStackSignature,
  createNumericStats,
  getEffectiveMoveSpeed,
  getStructureDurabilityProfile,
  getTileTypeFromMapChar,
  isGroundInteractableCellLayerTarget,
  mergeItemStackEntryInto,
  normalizeStructureType,
  normalizeSurfaceType,
  normalizeTerrainType,
  parseQiResourceKey,
  percentModifierToMultiplier,
  resolveDungeonPressureCombatMultiplier,
  resolveDungeonPressureMoveSpeedMultiplier,
  resolveMonsterTemplateRecord,
  resolvePlayerFacingContentName,
  resolveSkillRequiresTarget,
  resolveTileLayerSeedFromTemplateContext,
  validateAccessPolicy,
} from '@mud/shared';
import { readTrimmedEnv } from '../../config/env-alias';
import { isStaticRoomBoundaryTile } from '../building/room-detection.service';
import { createRuntimeTemporaryBuff } from '../player/runtime-buff-instance';
import { chooseMonsterSkill as chooseMonsterSkillFromAiRegistry } from '../monster-ai/index';

const DEFAULT_TILE_AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);
const TILE_AURA_FLOW_RATE_SCALE = TILE_AURA_HALF_LIFE_RATE_SCALE ?? QI_HALF_LIFE_RATE_SCALE ?? 1_000_000_000;
const TILE_AURA_FLOW_RATE_SCALED = Math.max(1, Math.trunc(Number(TILE_AURA_HALF_LIFE_RATE_SCALED) || 1));
const TILE_AURA_FLOW_RATE = TILE_AURA_FLOW_RATE_SCALED / TILE_AURA_FLOW_RATE_SCALE;
const DISPERSED_AURA_FLOW_CONFIG = DEFAULT_QI_RUNTIME_FLOW_CONFIGS[DISPERSED_AURA_RESOURCE_KEY];
const DISPERSED_AURA_FLOW_RATE_SCALE = Math.max(1, Math.trunc(Number(DISPERSED_AURA_FLOW_CONFIG?.halfLifeRateScale) || QI_HALF_LIFE_RATE_SCALE || 1_000_000_000));
const DISPERSED_AURA_FLOW_RATE_SCALED = Math.max(1, Math.trunc(Number(DISPERSED_AURA_FLOW_CONFIG?.halfLifeRateScaled) || TILE_AURA_FLOW_RATE_SCALED));
const DISPERSED_AURA_FLOW_RATE = DISPERSED_AURA_FLOW_RATE_SCALED / DISPERSED_AURA_FLOW_RATE_SCALE;
const DISPERSED_AURA_MIN_DECAY_PER_TICK = Math.max(0, Math.trunc(Number(DISPERSED_AURA_FLOW_CONFIG?.minimumDecayPerTick) || 0));
const TILE_RESOURCE_EPSILON = 1e-9;

const MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT = 100;
const MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT = 100;
const MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT = 1000;

/** DEFAULT_TERRAIN_DURABILITY_BY_TILE：真正 terrain 层的默认耐久配置；structure 耐久见 shared structure profile。 */
const DEFAULT_TERRAIN_DURABILITY_BY_TILE = {
  [TileType.Cloud]: {
    material: 'vine',
    multiplier: 3,
    damageDrops: [{ itemId: 'cloud_puff', count: 1, chanceBps: 200 }],
    destroyDrops: [{ itemId: 'cloud_puff', count: 1 }],
  },
  [TileType.Cliff]: { material: 'stone', multiplier: 50 },
};

/** SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS：特殊地形恢复速度倍率，越高表示复原越快。 */
const SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS = {
  [TileType.Cloud]: 100,
};

const MAP_TIME_PERSISTENCE_CHECKPOINT_INTERVAL_TICKS = normalizePositiveInteger(readTrimmedEnv('SERVER_MAP_TIME_CHECKPOINT_INTERVAL_TICKS', 'MAP_TIME_CHECKPOINT_INTERVAL_TICKS'), 300, 30, 86_400);

/** DIRECTION_OFFSET：DIRECTIONOFFSET。 */
const DIRECTION_OFFSET = {
  [Direction.North]: { x: 0, y: -1 },
  [Direction.South]: { x: 0, y: 1 },
  [Direction.East]: { x: 1, y: 0 },
  [Direction.West]: { x: -1, y: 0 },
};

const INCREMENTAL_PERSISTENCE_DOMAINS = new Set(['tile_resource', 'tile_damage', 'ground_item', 'monster_runtime']);

const TEMPORARY_BUFF_PROTOTYPE_COMPARE_KEYS = [
  'buffId',
  'name',
  'desc',
  'baseDesc',
  'shortMark',
  'category',
  'visibility',
  'sourceSkillId',
  'sourceSkillName',
  'color',
  'presentationScale',
  'ignoreRealmEffectiveness',
  'sustainCost',
  'expireWithBuffId',
  'sourceCasterId',
];

export {
  DEFAULT_TILE_AURA_RESOURCE_KEY,
  TILE_RESOURCE_EPSILON,
  MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT,
  MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT,
  DIRECTION_OFFSET,
};
export function setChunkRevision(rows: Map<number, Map<number, number>>, chunkX: number, chunkY: number, revision: number): void {
 let row = rows.get(chunkY);
 if (!row) {
  row = new Map<number, number>();
  rows.set(chunkY, row);
 }
 row.set(chunkX, revision);
}

/** getTileRestoreSpeedMultiplier：读取地形恢复速度倍率。 */
export function getTileRestoreSpeedMultiplier(tileType) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const configured = SPECIAL_TILE_RESTORE_SPEED_MULTIPLIERS[tileType] ?? 1;
 return Number.isFinite(configured) && configured > 0 ? configured : 1;
}
/** calculateTileRestoreTicks：按 main 口径计算摧毁地块复生时间。 */
export function calculateTileRestoreTicks(tileType) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 return Math.max(1, Math.ceil(TERRAIN_DESTROYED_RESTORE_TICKS / getTileRestoreSpeedMultiplier(tileType)));
}
/** calculateTileRestoreRetryTicks：按 main 口径计算复生受阻后的重试时间。 */
export function calculateTileRestoreRetryTicks(tileType) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 return Math.max(1, Math.ceil(TERRAIN_RESTORE_RETRY_DELAY_TICKS / getTileRestoreSpeedMultiplier(tileType)));
}
/** resolveTerrainHpRecoveryAmount：地块生命恢复统一按最大生命 1% 取整，至少 1 点。 */
export function resolveTerrainHpRecoveryAmount(maxHp) {
 const normalizedMaxHp = Math.max(1, Math.trunc(Number(maxHp) || 1));
 return Math.max(1, Math.floor(normalizedMaxHp * TERRAIN_REGEN_RATE_PER_TICK));
}
export function canAttemptTerrainStabilizerHpRecovery(checker) {
 return typeof checker === 'function' && checker.hasTerrainStabilizer !== false;
}
export function hasTerrainStabilizerHpRecoveryAt(checker, x, y) {
 return canAttemptTerrainStabilizerHpRecovery(checker) && checker(x, y) === true;
}
/** normalizeTileRestoreTicksLeft：恢复持久化地块复生倒计时。 */
export function normalizeTileRestoreTicksLeft(value, tileType) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const normalized = Math.trunc(Number(value));
 return Number.isFinite(normalized) && normalized > 0 ? normalized : calculateTileRestoreTicks(tileType);
}
export function normalizeTileResourceValue(value) {
 const normalized = Number(value);
 return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}
export function areTileResourceValuesEqual(left, right) {
 return Math.abs(normalizeTileResourceValue(left) - normalizeTileResourceValue(right)) <= TILE_RESOURCE_EPSILON;
}
/** resolveTileDurabilityProfile：解析分层耐久配置，structure 优先，terrain 仅处理真正地形层。 */
export function resolveTileDurabilityProfile(tileType, layerState = null) {
 const structureProfile = getStructureDurabilityProfile(layerState?.structure ?? layerState?.structureType ?? null);
 if (structureProfile) {
  return structureProfile;
 }
 return DEFAULT_TERRAIN_DURABILITY_BY_TILE[tileType] ?? null;
}
/** resolveTileDurability：解析地形/结构耐久配置。 */
export function resolveTileDurability(template, tileType, x = null, y = null, layerState = null) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const profile = resolveTileDurabilityProfile(tileType, layerState);
 if (!profile) {
  return 0;
 }

 if (template?.source?.sectMap === true && (layerState?.structure ?? layerState?.structureType ?? null) === StructureType.Stone) {
  const centerX = Number.isFinite(Number(template.source.sectCoreX)) ? Math.trunc(Number(template.source.sectCoreX)) : Math.trunc(template.width / 2);
  const centerY = Number.isFinite(Number(template.source.sectCoreY)) ? Math.trunc(Number(template.source.sectCoreY)) : Math.trunc(template.height / 2);
  const dx = Number.isFinite(Number(x)) ? Math.abs(Math.trunc(Number(x)) - centerX) : 1;
  const dy = Number.isFinite(Number(y)) ? Math.abs(Math.trunc(Number(y)) - centerY) : 1;
  const ring = Math.max(1, dx, dy);
  return Math.max(1, Math.trunc(100000 * Math.pow(2, Math.max(0, ring - 1))));
 }

 const mapLv = Number.isFinite(template.source?.mapLv)
  ? Math.max(1, Math.floor(Number(template.source.mapLv)))
  : 1;
 return calculateTerrainDurability(mapLv, profile.multiplier);
}
/** clampCoordinate：把坐标夹到地图边界内。 */
export function clampCoordinate(value, size) {
 return Math.max(0, Math.min(size - 1, Math.trunc(value)));
}

/** DIRECTION_OFFSET：DIRECTIONOFFSET。 */
/** buildGroundSourceId：构建地面物品堆来源 ID。 */
export function buildGroundSourceId(tileIndex) {
 return `g:${tileIndex}`;
}
/** createMapInstanceDirtyDomainSet：构建实例脏域集合。 */
export function createMapInstanceDirtyDomainSet() {
 return new Set();
}
export function normalizePositiveInteger(value, defaultValue, min, max) {
 if (typeof value === 'string' && value.trim() === '') {
  return defaultValue;
 }
 const parsed = Number(value);
 if (!Number.isFinite(parsed)) {
  return defaultValue;
 }
 const normalized = Math.trunc(parsed);
 if (normalized < min) {
  return min;
 }
 if (normalized > max) {
  return max;
 }
 return normalized;
}
export function shouldMarkTimePersistenceDirty(tick) {
 const normalizedTick = Number.isFinite(Number(tick)) ? Math.max(0, Math.trunc(Number(tick))) : 0;
 return normalizedTick > 0 && normalizedTick % MAP_TIME_PERSISTENCE_CHECKPOINT_INTERVAL_TICKS === 0;
}
/** markMapInstanceDirtyDomains：记录实例脏域。 */
export function markMapInstanceDirtyDomains(instance, domains) {
 if (!instance) {
  return;
 }
 if (!(instance.dirtyDomains instanceof Set)) {
  instance.dirtyDomains = createMapInstanceDirtyDomainSet();
 }
 if (!(instance.dirtyDomainFirstMarkedAt instanceof Map)) {
  instance.dirtyDomainFirstMarkedAt = new Map();
 }
 const now = Date.now();
 for (const domain of Array.isArray(domains) ? domains : []) {
  if (typeof domain === 'string' && domain.trim()) {
   const normalizedDomain = domain.trim();
   instance.dirtyDomains.add(normalizedDomain);
   if (!(instance.persistenceDomainRevisionByDomain instanceof Map)) {
    instance.persistenceDomainRevisionByDomain = new Map();
   }
   const currentRevision = Math.max(
    0,
    Math.trunc(Number(instance.persistenceDomainRevisionByDomain.get(normalizedDomain) ?? 0)),
   );
   if (currentRevision >= Number.MAX_SAFE_INTEGER - 1) {
    instance.persistenceDomainRevisionByDomain.set(normalizedDomain, 1);
    instance.stagedPersistenceDomainRevisionByDomain?.delete?.(normalizedDomain);
    instance.persistenceStagingGenerationByDomain?.delete?.(normalizedDomain);
   }
   else {
    instance.persistenceDomainRevisionByDomain.set(normalizedDomain, currentRevision + 1);
   }
   // 仅在首次标脏时记录时间戳
   if (!instance.dirtyDomainFirstMarkedAt.has(normalizedDomain)) {
    instance.dirtyDomainFirstMarkedAt.set(normalizedDomain, now);
   }
  }
 }
}
/** markMapInstanceDirtyDomainHighPriority：标记脏域为高优先级（玩家主动操作），绕过合并窗口。 */
export function markMapInstanceDirtyDomainHighPriority(instance, domains) {
 if (!instance) {
  return;
 }
 if (!(instance.dirtyDomainHighPriority instanceof Set)) {
  instance.dirtyDomainHighPriority = new Set();
 }
 for (const domain of Array.isArray(domains) ? domains : []) {
  if (typeof domain === 'string' && domain.trim()) {
   instance.dirtyDomainHighPriority.add(domain.trim());
  }
 }
}
/** markMapInstancePersistenceFullReplaceDomains：为未细分脏键的高频域保留全量兜底。 */
export function markMapInstancePersistenceFullReplaceDomains(instance, domains) {
 if (!instance) {
  return;
 }
 if (!(instance.persistenceFullReplaceDomains instanceof Set)) {
  instance.persistenceFullReplaceDomains = createMapInstanceDirtyDomainSet();
 }
 for (const domain of Array.isArray(domains) ? domains : []) {
  const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
  if (INCREMENTAL_PERSISTENCE_DOMAINS.has(normalizedDomain)) {
   instance.persistenceFullReplaceDomains.add(normalizedDomain);
  }
 }
}
/** addTileResourceDirtyKey：记录地块资源的资源键与 tile 索引。 */
export function addTileResourceDirtyKey(instance, resourceKey, tileIndex) {
 if (!instance || typeof resourceKey !== 'string' || !resourceKey.trim() || !Number.isFinite(Number(tileIndex))) {
  return;
 }
 if (!(instance.dirtyTileResourceByKey instanceof Map)) {
  instance.dirtyTileResourceByKey = new Map();
 }
 const normalizedResourceKey = resourceKey.trim();
 let tileIndices = instance.dirtyTileResourceByKey.get(normalizedResourceKey);
 if (!(tileIndices instanceof Set)) {
  tileIndices = new Set();
  instance.dirtyTileResourceByKey.set(normalizedResourceKey, tileIndices);
 }
 tileIndices.add(Math.max(0, Math.trunc(Number(tileIndex))));
}
/** addNumericDirtyKey：记录数字型脏键。 */
export function addNumericDirtyKey(target, value) {
 if (!(target instanceof Set) || !Number.isFinite(Number(value))) {
  return;
 }
 target.add(Math.max(0, Math.trunc(Number(value))));
}
/** clearMapInstancePersistenceDeltaDomain：清理指定域的增量脏键。 */
export function clearMapInstancePersistenceDeltaDomain(instance, domain) {
 if (!instance || typeof domain !== 'string') {
  return;
 }
 if (instance.persistenceFullReplaceDomains instanceof Set) {
  instance.persistenceFullReplaceDomains.delete(domain);
 }
 if (domain === 'tile_resource' && instance.dirtyTileResourceByKey instanceof Map) {
  instance.dirtyTileResourceByKey.clear();
  return;
 }
 if (domain === 'tile_damage' && instance.dirtyTileDamageIndices instanceof Set) {
  instance.dirtyTileDamageIndices.clear();
  return;
 }
 if (domain === 'ground_item' && instance.dirtyGroundItemTileIndices instanceof Set) {
  instance.dirtyGroundItemTileIndices.clear();
  return;
 }
 if (domain === 'monster_runtime' && instance.dirtyMonsterRuntimeIds instanceof Set) {
  instance.dirtyMonsterRuntimeIds.clear();
 }
}
/** clearMapInstancePersistenceDeltas：清空所有增量脏键。 */
export function clearMapInstancePersistenceDeltas(instance) {
 if (!instance) {
  return;
 }
 if (instance.persistenceFullReplaceDomains instanceof Set) {
  instance.persistenceFullReplaceDomains.clear();
 }
 if (instance.dirtyTileResourceByKey instanceof Map) {
  instance.dirtyTileResourceByKey.clear();
 }
 if (instance.dirtyTileDamageIndices instanceof Set) {
  instance.dirtyTileDamageIndices.clear();
 }
 if (instance.dirtyGroundItemTileIndices instanceof Set) {
  instance.dirtyGroundItemTileIndices.clear();
 }
 if (instance.dirtyMonsterRuntimeIds instanceof Set) {
  instance.dirtyMonsterRuntimeIds.clear();
 }
}
/** clearMapInstanceDirtyDomains：清空实例脏域。 */
export function clearMapInstanceDirtyDomains(instance) {
 if (instance?.dirtyDomains instanceof Set) {
  instance.dirtyDomains.clear();
 }
 if (instance?.dirtyDomainFirstMarkedAt instanceof Map) {
  instance.dirtyDomainFirstMarkedAt.clear();
 }
 if (instance?.dirtyDomainHighPriority instanceof Set) {
  instance.dirtyDomainHighPriority.clear();
 }
 clearMapInstancePersistenceDeltas(instance);
}
/** parseGroundSourceId：解析地面物品堆来源 ID。 */
export function parseGroundSourceId(sourceId) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!sourceId.startsWith('g:')) {
  return null;
 }

 const tileIndex = Number(sourceId.slice(2));
 return Number.isInteger(tileIndex) && tileIndex >= 0 ? tileIndex : null;
}
export function nextPowerOfTwo(value) {
 let result = 1;
 const target = Math.max(1, Math.trunc(Number(value) || 1));
 while (result < target) {
  result <<= 1;
 }
 return result;
}
/** toGroundPileView：把地面物品堆转换成视图对象。 */
export function toGroundPileView(pile) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!pile) {
  return null;
 }
 return {
  sourceId: pile.sourceId,
  x: pile.x,
  y: pile.y,
  items: pile.items.map((entry) => ({
   itemKey: entry.itemKey,
   itemId: entry.item.itemId,
   name: resolvePlayerFacingContentName(entry.item.itemId, '未知物品', entry.item.name),
   type: (entry.item.type ?? 'material'),
   count: entry.item.count,
   grade: entry.item.grade,
   enhanceLevel: entry.item.enhanceLevel,
   groundLabel: entry.item.groundLabel,
  })),
 };
}
export function freezeRuntimeProjection(entry) {
 if (entry && process.env.NODE_ENV !== 'production') {
  Object.freeze(entry);
 }
 return entry;
}
export function isSameGroundPileView(left, right) {
 if (left === right) {
  return true;
 }
 if (!left || !right || left.x !== right.x || left.y !== right.y || left.items.length !== right.items.length) {
  return false;
 }
 for (let index = 0; index < left.items.length; index += 1) {
  const leftItem = left.items[index];
  const rightItem = right.items[index];
  if (leftItem.itemKey !== rightItem.itemKey
   || leftItem.itemId !== rightItem.itemId
   || leftItem.name !== rightItem.name
   || leftItem.type !== rightItem.type
   || leftItem.count !== rightItem.count
   || leftItem.grade !== rightItem.grade
   || leftItem.enhanceLevel !== rightItem.enhanceLevel
   || leftItem.groundLabel !== rightItem.groundLabel) {
   return false;
  }
 }
 return true;
}
/** normalizePersistedGroundItem：规范化持久化地面物品条目。 */
export function normalizePersistedGroundItem(item) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!item || typeof item !== 'object' || typeof item.itemId !== 'string' || !item.itemId.trim()) {
  return null;
 }

 item.itemId = item.itemId.trim();
 item.count = Number.isFinite(Number(item.count)) ? Math.max(1, Math.trunc(Number(item.count))) : 1;
 if (Number.isFinite(Number(item.enhanceLevel))) {
  item.enhanceLevel = Math.max(0, Math.trunc(Number(item.enhanceLevel)));
 }
 else {
  delete item.enhanceLevel;
 }
 return item;
}
export function getGroundItemExpiresAtTick(item) {
 const value = Number(item?.expiresAtTick);
 return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
export function getGroundItemExpiresAtMs(item) {
 const value = Number(item?.groundExpiresAtMs);
 return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
export function resolveGroundItemExpiresAtTick(item, currentTick) {
 const normalizedTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
 const existing = getGroundItemExpiresAtTick(item);
 if (existing > normalizedTick) {
  return existing;
 }
 return normalizedTick + Math.max(1, Math.trunc(Number(GROUND_ITEM_EXPIRE_TICKS) || 1));
}
export function resolveGroundItemExpiresAtMs(item, expiresAtTick, currentTick, nowMs = Date.now()) {
 const existing = getGroundItemExpiresAtMs(item);
 if (existing > nowMs) {
  return existing;
 }
 const remainingTicks = Math.max(1, Math.trunc(Number(expiresAtTick) || 0) - Math.max(0, Math.trunc(Number(currentTick) || 0)));
 return Math.max(0, Math.trunc(Number(nowMs) || 0)) + remainingTicks * 1000;
}
export function normalizeGroundRuntimeItemExpiry(item, currentTick, nowMs = Date.now()) {
 if (!item || typeof item !== 'object') {
  return item;
 }
 const expiresAtTick = resolveGroundItemExpiresAtTick(item, currentTick);
 item.expiresAtTick = expiresAtTick;
 item.groundExpiresAtMs = resolveGroundItemExpiresAtMs(item, expiresAtTick, currentTick, nowMs);
 return item;
}
export function createGroundRuntimeItem(item, currentTick) {
 const normalized = normalizeGroundRuntimeItemExpiry({ ...item }, currentTick);
 normalized.count = Number.isFinite(Number(normalized.count)) ? Math.max(1, Math.trunc(Number(normalized.count))) : 1;
 return normalized;
}
export function toInventoryItemFromGroundItem(item) {
 const next = { ...item };
 delete next.expiresAtTick;
 delete next.groundExpiresAtMs;
 return next;
}
/** buildGroundItemKey：地面物品用共享堆叠签名区分实例态字段。 */
export function buildGroundItemKey(item) {
 return createItemStackSignature(item);
}
/** mergeGroundItemEntry：地面堆走共享物品合并规则，额外补齐展示字段。 */
export function mergeGroundItemEntry(entries, item) {
 return mergeItemStackEntryInto(entries, item, {
  getItem: (entry: any) => entry.item,
  createEntry: (entryItem, itemKey) => ({ itemKey, item: entryItem }),
  onMerged: (targetEntry: any, incomingItem: any) => {
   const targetItem = targetEntry.item;
   if (!targetItem.name && incomingItem.name) {
    targetItem.name = incomingItem.name;
   }
   if (!targetItem.groundLabel && incomingItem.groundLabel) {
    targetItem.groundLabel = incomingItem.groundLabel;
   }
   const targetExpiresAtTick = getGroundItemExpiresAtTick(targetItem);
   const incomingExpiresAtTick = getGroundItemExpiresAtTick(incomingItem);
   if (incomingExpiresAtTick > targetExpiresAtTick) {
    targetItem.expiresAtTick = incomingExpiresAtTick;
   }
   const targetExpiresAtMs = getGroundItemExpiresAtMs(targetItem);
   const incomingExpiresAtMs = getGroundItemExpiresAtMs(incomingItem);
   if (incomingExpiresAtMs > targetExpiresAtMs) {
    targetItem.groundExpiresAtMs = incomingExpiresAtMs;
   }
  },
 });
}
/** findGroundEntryIndex：优先按签名取地面条目，兼容历史裸 itemId 且避免多变体误取。 */
export function findGroundEntryIndex(entries, itemKey) {
 const directIndex = entries.findIndex((entry) => entry.itemKey === itemKey);
 if (directIndex >= 0) {
  return directIndex;
 }
 const matches = entries
  .map((entry, index) => ({ entry, index }))
  .filter(({ entry }) => entry.item?.itemId === itemKey);
 return matches.length === 1 ? matches[0].index : -1;
}
/** compareGroundPiles：比较地面物品堆顺序。 */
export function compareGroundPiles(left, right) {
 return left.y - right.y || left.x - right.x || left.sourceId.localeCompare(right.sourceId, 'zh-Hans-CN');
}
/** compareGroundEntries：比较地面物品条目顺序。 */
export function compareGroundEntries(left, right) {
 return left.itemKey.localeCompare(right.itemKey, 'zh-Hans-CN');
}
/** compareLocalMonsters：比较妖兽排序。 */
export function compareLocalMonsters(left, right) {
 return left.y - right.y || left.x - right.x || left.runtimeId.localeCompare(right.runtimeId, 'zh-Hans-CN');
}
/** compareLocalNpcs：比较 NPC 排序。 */
export function compareLocalNpcs(left, right) {
 return left.y - right.y || left.x - right.x || left.npcId.localeCompare(right.npcId, 'zh-Hans-CN');
}
/** compareLocalContainers：比较容器排序。 */
export function compareLocalContainers(left, right) {
 return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/** compareLocalLandmarks：比较地标排序。 */
export function compareLocalLandmarks(left, right) {
 return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/** compareLocalSafeZones：比较安全区排序。 */
export function compareLocalSafeZones(left, right) {
 return left.y - right.y || left.x - right.x || left.radius - right.radius;
}
/** countAliveMonsters：统计存活妖兽数量。 */
export function countAliveMonsters(monstersByRuntimeId) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 let count = 0;
 for (const monster of monstersByRuntimeId.values()) {
  if (monster.alive) {
   count += 1;
  }
 }
 return count;
}
/** snapshotNpc：快照 NPC。 */
export function snapshotNpc(source) {
 return source;
}
/** snapshotContainer：快照容器。 */
export function snapshotContainer(source) {
 return source;
}
/** snapshotLandmark：快照地标。 */
export function snapshotLandmark(source) {
 return source;
}
/** snapshotSafeZone：快照安全区。 */
export function snapshotSafeZone(source) {
 return {
  x: source.x,
  y: source.y,
  radius: source.radius,
 };
}
/** snapshotGroundPile：快照地面物品堆。 */
export function snapshotGroundPile(source) {
 return {
  sourceId: source.sourceId,
  x: source.x,
  y: source.y,
  items: source.items.map((entry) => ({
   itemKey: entry.itemKey,
   item: entry.item,
  })),
 };
}
/** snapshotMonster：快照妖兽。 */
export function snapshotMonster(source) {
 return {
  ...source,
  baseAttrs: source.baseAttrs,
  attrs: source.attrs,
  baseNumericStats: source.baseNumericStats,
  numericStats: source.numericStats,
  ratioDivisors: source.ratioDivisors,
  statFormula: source.statFormula,
  buffs: source.buffs,
  skills: source.skills,
  cooldownReadyTickBySkillId: source.cooldownReadyTickBySkillId,
  damageContributors: source.damageContributors,
 };
}
/** cloneAttributes：克隆属性面板。 */
export function cloneAttributes(source) {
 return {
  constitution: source.constitution,
  spirit: source.spirit,
  perception: source.perception,
  talent: source.talent,
  strength: source.strength ?? source.comprehension ?? 0,
  meridians: source.meridians ?? source.luck ?? 0,
 };
}
/** cloneNumericStats：克隆数值属性。 */
export function cloneNumericStats(source) {
 return {
  maxHp: source.maxHp,
  maxQi: source.maxQi,
  physAtk: source.physAtk,
  spellAtk: source.spellAtk,
  physDef: source.physDef,
  spellDef: source.spellDef,
  hit: source.hit,
  dodge: source.dodge,
  crit: source.crit,
  antiCrit: source.antiCrit,
  critDamage: source.critDamage,
  breakPower: source.breakPower,
  resolvePower: source.resolvePower,
  maxQiOutputPerTick: source.maxQiOutputPerTick,
  qiRegenRate: source.qiRegenRate,
  hpRegenRate: source.hpRegenRate,
  cooldownSpeed: source.cooldownSpeed,
  auraCostReduce: source.auraCostReduce,
  auraPowerRate: source.auraPowerRate,
  playerExpRate: source.playerExpRate,
  techniqueExpRate: source.techniqueExpRate,
  realmExpPerTick: source.realmExpPerTick,
  techniqueExpPerTick: source.techniqueExpPerTick,
  lootRate: source.lootRate,
  rareLootRate: source.rareLootRate,
  viewRange: source.viewRange,
  moveSpeed: source.moveSpeed,
  extraAggroRate: source.extraAggroRate,
  extraRange: source.extraRange ?? 0,
  extraArea: source.extraArea ?? 0,
  actionsPerTurn: source.actionsPerTurn ?? 1,
  elementDamageBonus: { ...source.elementDamageBonus },
  elementDamageReduce: { ...source.elementDamageReduce },
 };
}
/** cloneNumericRatioDivisors：克隆数值比例除数。 */
export function cloneNumericRatioDivisors(source) {
 return {
  dodge: source.dodge,
  crit: source.crit,
  breakPower: source.breakPower,
  resolvePower: source.resolvePower,
  cooldownSpeed: source.cooldownSpeed,
  moveSpeed: source.moveSpeed,
  elementDamageReduce: { ...source.elementDamageReduce },
 };
}
/** recalculateMonsterBaseStatsFromFormula：按当前等级/血脉重算妖兽基础属性。 */
export function recalculateMonsterBaseStatsFromFormula(monster) {
 const formula = monster.statFormula;
 if (!formula?.raw) {
  return false;
 }
 const formulaRaw = formula.raw;
 const raw = {
  ...formulaRaw,
  level: Math.max(1, Math.trunc(Number(monster.level) || Number(formulaRaw.level) || 1)),
 };
 if (typeof monster.tier === 'string' && monster.tier.trim()) {
  raw.tier = monster.tier.trim();
 }
 const resolved = resolveMonsterTemplateRecord(raw, undefined, formula.baselines);
 monster.level = resolved.level ?? raw.level;
 monster.tier = resolved.tier;
 monster.expMultiplier = resolved.expMultiplier;
 monster.baseAttrs = cloneAttributes(resolved.resolvedAttrs);
 monster.baseNumericStats = cloneNumericStats(resolved.computedStats);
 recalculateMonsterDerivedState(monster);
 return true;
}
/** applyMonsterInitialBuffs：按模板给妖兽重建出生自带 Buff。 */
export function applyMonsterInitialBuffs(monster, buffRegistry = null) {
 monster.buffs.length = 0;
 ensureMonsterInitialBuffs(monster, buffRegistry);
}
/** ensureMonsterInitialBuffs：补齐或刷新妖兽模板要求的出生 Buff，不覆盖战斗临时 Buff。 */
export function ensureMonsterInitialBuffs(monster, buffRegistry = null) {
 for (const effect of monster.initialBuffs ?? []) {
  const buff = buffRegistry
   ? buffRegistry.createInstanceFromTemplate(effect, buildMonsterInitialBuffState(monster, effect))
   : createRuntimeTemporaryBuff(buildMonsterInitialBuffState(monster, effect));
  if (buff.remainingTicks <= 0 || buff.stacks <= 0) {
   continue;
  }
  const existing = monster.buffs.find((entry) => entry.buffId === buff.buffId);
  if (existing) {
   Object.assign(existing, buff);
  }
  else {
   monster.buffs.push(buff);
  }
 }
 monster.buffs.sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
}
/** buildMonsterInitialBuffState：把内容配置转换为运行时 Buff 状态。 */
export function buildMonsterInitialBuffState(monster, effect) {
 const maxStacks = Math.max(1, Math.trunc(Number(effect.maxStacks) || 1));
 const duration = Math.max(1, Math.trunc(Number(effect.duration) || 1));
 const infiniteDuration = effect.infiniteDuration === true;
 const stacks = Math.min(maxStacks, Math.max(1, Math.trunc(Number(effect.stacks) || 1)));
 const name = resolvePlayerFacingContentName(effect.buffId, '未知增益', effect.name);
 const shortMark = typeof effect.shortMark === 'string' && effect.shortMark.trim()
  ? String(Array.from(effect.shortMark.trim())[0] ?? '气')
  : String(Array.from(name)[0] ?? '气');
 return {
  buffId: effect.buffId,
  name,
  desc: typeof effect.desc === 'string' ? effect.desc : undefined,
  baseDesc: typeof effect.desc === 'string' ? effect.desc : undefined,
  shortMark,
  category: effect.category === 'debuff' ? 'debuff' : 'buff',
  visibility: effect.visibility === 'observe_only' || effect.visibility === 'hidden' ? effect.visibility : 'public',
  remainingTicks: infiniteDuration ? 1 : duration + 1,
  duration,
  stacks,
  maxStacks,
  sourceSkillId: `monster-initial:${monster.monsterId}:${effect.buffId}`,
  sourceSkillName: `${monster.name}·先天妖势`,
  realmLv: Math.max(1, Math.floor(monster.level ?? 1)),
  color: typeof effect.color === 'string' ? effect.color : undefined,
  attrs: effect.attrs ? { ...effect.attrs } : undefined,
  attrMode: effect.attrMode,
  stats: effect.stats ? { ...effect.stats } : undefined,
  statMode: effect.statMode,
  qiProjection: effect.qiProjection ? effect.qiProjection.map((entry) => ({ ...entry })) : undefined,
  presentationScale: Number.isFinite(effect.presentationScale) && Number(effect.presentationScale) > 0
   ? Number(effect.presentationScale)
   : undefined,
  infiniteDuration,
  sustainCost: effect.sustainCost,
  sustainTicksElapsed: effect.sustainCost ? 0 : undefined,
  expireWithBuffId: typeof effect.expireWithBuffId === 'string' && effect.expireWithBuffId.trim()
   ? effect.expireWithBuffId.trim()
   : undefined,
  persistOnDeath: effect.persistOnDeath === true,
  persistOnReturnToSpawn: effect.persistOnReturnToSpawn === true,
  ignoreRealmEffectiveness: effect.ignoreRealmEffectiveness === true ? true : undefined,
 };
}

export function isRuntimeBuffActive(buff) {
 return Boolean(buff && buff.remainingTicks > 0 && buff.stacks > 0);
}

export function doesTemporaryBuffAffectAttributes(buff) {
 return Boolean(buff && (buff.attrs || buff.stats || buff.buffId === DUNGEON_PRESSURE_BUFF_ID));
}

export function isSameTemporaryBuffAttributePayload(left, right) {
 return (left?.buffId ?? undefined) === (right?.buffId ?? undefined)
  && (left?.sourceSkillId ?? undefined) === (right?.sourceSkillId ?? undefined)
  && (left?.attrMode ?? undefined) === (right?.attrMode ?? undefined)
  && (left?.statMode ?? undefined) === (right?.statMode ?? undefined)
  && (left?.realmLv ?? undefined) === (right?.realmLv ?? undefined)
  && (left?.ignoreRealmEffectiveness === true) === (right?.ignoreRealmEffectiveness === true)
  && isSamePlainObjectValue(left?.attrs, right?.attrs)
  && isSamePlainObjectValue(left?.stats, right?.stats);
}

export function isSameTemporaryBuffPrototypePayload(left, right) {
 if (!isSameTemporaryBuffAttributePayload(left, right)
  || !isSamePlainObjectValue(left?.qiProjection, right?.qiProjection)
  || !isSamePlainObjectValue(left?.tickEffects, right?.tickEffects)) {
  return false;
 }
 for (const key of TEMPORARY_BUFF_PROTOTYPE_COMPARE_KEYS) {
  if ((left?.[key] ?? undefined) !== (right?.[key] ?? undefined)) {
   return false;
  }
 }
 return true;
}

export function isSamePlainObjectValue(left, right) {
 if (left === right) {
  return true;
 }
 if (left === undefined || left === null || right === undefined || right === null) {
  return left === right;
 }
 if (typeof left !== 'object' || typeof right !== 'object') {
  return left === right;
 }
 if (Array.isArray(left) || Array.isArray(right)) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
   return false;
  }
  for (let index = 0; index < left.length; index += 1) {
   if (!isSamePlainObjectValue(left[index], right[index])) {
    return false;
   }
  }
  return true;
 }
 const leftKeys = Object.keys(left);
 const rightKeys = Object.keys(right);
 if (leftKeys.length !== rightKeys.length) {
  return false;
 }
 for (const key of leftKeys) {
  if (!Object.hasOwn(right, key) || !isSamePlainObjectValue(left[key], right[key])) {
   return false;
  }
 }
 return true;
}
/** tickTemporaryBuffs：推进临时 Buff 计时。 */
export function tickTemporaryBuffs(buffs) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 let changed = false;
 for (const buff of buffs) {
  if (buff.infiniteDuration === true) {
   continue;
  }
  if (buff.remainingTicks > 0) {
   buff.remainingTicks -= 1;
   changed = true;
  }
 }

 const nextLength = buffs.filter((entry) => entry.remainingTicks > 0 && entry.stacks > 0).length;
 if (nextLength !== buffs.length) {
  changed = true;
 }
 if (changed) {

  let writeIndex = 0;
  for (const buff of buffs) {
   if (buff.remainingTicks > 0 && buff.stacks > 0) {
    buffs[writeIndex] = buff;
    writeIndex += 1;
   }
  }
  buffs.length = writeIndex;
 }
 return changed;
}
/** createEmptyAttributes：创建全零六维属性修饰桶。 */
export function createEmptyAttributes() {
 return {
  constitution: 0,
  spirit: 0,
  perception: 0,
  talent: 0,
  strength: 0,
  meridians: 0,
 };
}
/** addAttributeModifiers：叠加六维属性修饰。 */
export function addAttributeModifiers(target, patch, factor) {
 target.constitution += (patch.constitution ?? 0) * factor;
 target.spirit += (patch.spirit ?? 0) * factor;
 target.perception += (patch.perception ?? 0) * factor;
 target.talent += (patch.talent ?? 0) * factor;
 target.strength += (patch.strength ?? patch.comprehension ?? 0) * factor;
 target.meridians += (patch.meridians ?? patch.luck ?? 0) * factor;
}
/** applyAttributePercentModifiers：把百分比属性修饰应用到当前属性。 */
export function applyAttributePercentModifiers(target, modifiers) {
 target.constitution *= percentModifierToMultiplier(modifiers.constitution);
 target.spirit *= percentModifierToMultiplier(modifiers.spirit);
 target.perception *= percentModifierToMultiplier(modifiers.perception);
 target.talent *= percentModifierToMultiplier(modifiers.talent);
 target.strength *= percentModifierToMultiplier(modifiers.strength);
 target.meridians *= percentModifierToMultiplier(modifiers.meridians);
}
/** addNumericStatModifiers：叠加数值属性修饰。 */
export function addNumericStatModifiers(target, patch, factor) {
 for (const [key, value] of Object.entries(patch)) {
  if (typeof value === 'number') {
   target[key] = (target[key] ?? 0) + value * factor;
   continue;
  }
  if (value && typeof value === 'object') {
   const targetGroup = target[key] ?? {};
   target[key] = targetGroup;
   for (const [groupKey, groupValue] of Object.entries(value)) {
    if (typeof groupValue === 'number') {
     targetGroup[groupKey] = (targetGroup[groupKey] ?? 0) + groupValue * factor;
    }
   }
  }
 }
}
/** applyNumericStatPercentModifiers：按百分比乘区应用数值属性修饰。 */
export function applyNumericStatPercentModifiers(target, modifiers) {
 for (const [key, value] of Object.entries(modifiers)) {
  if (typeof value === 'number') {
   target[key] = (target[key] ?? 0) * percentModifierToMultiplier(value);
   continue;
  }
  if (value && typeof value === 'object') {
   const targetGroup = target[key] ?? {};
   target[key] = targetGroup;
   for (const [groupKey, groupValue] of Object.entries(value)) {
    if (typeof groupValue === 'number') {
     targetGroup[groupKey] = (targetGroup[groupKey] ?? 0) * percentModifierToMultiplier(groupValue);
    }
   }
  }
 }
}
/** recalculateMonsterDerivedState：重算妖兽派生状态。 */
export function recalculateMonsterDerivedState(monster) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const nextAttrs = cloneAttributes(monster.baseAttrs);

 const nextStats = cloneNumericStats(monster.baseNumericStats);
 const attrPercentModifiers = createEmptyAttributes();
 const statPercentModifiers = createNumericStats();
 for (const buff of monster.buffs) {
  const stacks = Math.max(1, buff.stacks);
  if (buff.attrs) {
   const targetAttrs = buff.attrMode === 'percent' ? attrPercentModifiers : nextAttrs;
   addAttributeModifiers(targetAttrs, buff.attrs, stacks);
  }
  if (buff.stats) {
   const targetStats = buff.statMode === 'percent' ? statPercentModifiers : nextStats;
   addNumericStatModifiers(targetStats, buff.stats, stacks);
  }
 }
 applyAttributePercentModifiers(nextAttrs, attrPercentModifiers);
 applyNumericStatPercentModifiers(nextStats, statPercentModifiers);
 applyDungeonPressureToMonsterStats(nextAttrs, nextStats, monster.buffs);
 nextStats.maxHp = Math.max(1, Math.round(nextStats.maxHp));
 nextStats.maxQi = Math.max(0, Math.round(nextStats.maxQi));
 nextStats.moveSpeed = Math.max(0, Math.round(getEffectiveMoveSpeed(nextStats.moveSpeed)));

 const previousMaxHp = monster.maxHp;

 const previousHp = monster.hp;

 const previousStats = monster.numericStats;

 const previousMaxQi = Number.isFinite(Number(monster.maxQi))
  ? Math.max(0, Math.round(Number(monster.maxQi)))
  : Math.max(0, Math.round(Number(previousStats.maxQi ?? 0)));

 const previousQi = Number.isFinite(Number(monster.qi))
  ? Math.max(0, Math.round(Number(monster.qi)))
  : previousMaxQi;

 const previousAttrs = monster.attrs;

 monster.attrs = nextAttrs;
 monster.numericStats = nextStats;
 monster.maxHp = Math.max(1, Math.round(nextStats.maxHp));
 monster.maxQi = Math.max(0, Math.round(nextStats.maxQi));
 if (monster.alive) {
  monster.hp = previousMaxHp > 0
   ? Math.max(0, Math.min(monster.maxHp, Math.round(previousHp / previousMaxHp * monster.maxHp)))
   : monster.maxHp;
  monster.qi = previousMaxQi > 0
   ? Math.max(0, Math.min(monster.maxQi, Math.round(previousQi / previousMaxQi * monster.maxQi)))
   : monster.maxQi;
 }
 else {
  monster.hp = 0;
  monster.qi = 0;
 }
 return !isSameAttributes(previousAttrs, nextAttrs)
  || !isSameNumericStats(previousStats, nextStats)
  || previousMaxHp !== monster.maxHp
  || previousHp !== monster.hp
  || previousMaxQi !== monster.maxQi
  || previousQi !== monster.qi;
}

export function applyDungeonPressureToMonsterStats(finalAttrs, numericStats, buffs) {
 const pressure = buffs.find((buff) => buff?.buffId === DUNGEON_PRESSURE_BUFF_ID && isRuntimeBuffActive(buff));
 if (!pressure) return;
 const multiplier = resolveDungeonPressureCombatMultiplier(pressure.stacks);
 for (const key of ['constitution', 'spirit', 'perception', 'talent', 'strength', 'meridians']) {
  finalAttrs[key] = Math.max(0, finalAttrs[key] * multiplier);
 }
 for (const key of DUNGEON_PRESSURE_COMBAT_STAT_KEYS) {
  numericStats[key] = Math.round(numericStats[key] * multiplier);
 }
 numericStats.moveSpeed = Math.max(0, Math.round(numericStats.moveSpeed * resolveDungeonPressureMoveSpeedMultiplier(pressure.stacks)));
 for (const element of DUNGEON_PRESSURE_ELEMENT_KEYS) {
  numericStats.elementDamageBonus[element] = Math.round(numericStats.elementDamageBonus[element] * multiplier);
  numericStats.elementDamageReduce[element] = Math.max(0, Math.round(numericStats.elementDamageReduce[element] * multiplier));
 }
}
/** isSameAttributes：判断属性是否一致。 */
export function isSameAttributes(left, right) {
 return left.constitution === right.constitution
  && left.spirit === right.spirit
  && left.perception === right.perception
  && left.talent === right.talent
  && left.strength === right.strength
  && left.meridians === right.meridians;
}
/** isSameNumericStats：判断数值属性是否一致。 */
export function isSameNumericStats(left, right) {
 return left.maxHp === right.maxHp
  && left.maxQi === right.maxQi
  && left.physAtk === right.physAtk
  && left.spellAtk === right.spellAtk
  && left.physDef === right.physDef
  && left.spellDef === right.spellDef
  && left.hit === right.hit
  && left.dodge === right.dodge
  && left.crit === right.crit
  && left.antiCrit === right.antiCrit
  && left.critDamage === right.critDamage
  && left.breakPower === right.breakPower
  && left.resolvePower === right.resolvePower
  && left.maxQiOutputPerTick === right.maxQiOutputPerTick
  && left.qiRegenRate === right.qiRegenRate
  && left.hpRegenRate === right.hpRegenRate
  && left.cooldownSpeed === right.cooldownSpeed
  && left.auraCostReduce === right.auraCostReduce
  && left.auraPowerRate === right.auraPowerRate
  && left.playerExpRate === right.playerExpRate
  && left.techniqueExpRate === right.techniqueExpRate
  && left.realmExpPerTick === right.realmExpPerTick
  && left.techniqueExpPerTick === right.techniqueExpPerTick
  && left.lootRate === right.lootRate
  && left.rareLootRate === right.rareLootRate
  && left.viewRange === right.viewRange
  && left.moveSpeed === right.moveSpeed
  && left.extraAggroRate === right.extraAggroRate
  && left.extraRange === right.extraRange
  && left.extraArea === right.extraArea
  && left.actionsPerTurn === right.actionsPerTurn
  && left.elementDamageBonus.metal === right.elementDamageBonus.metal
  && left.elementDamageBonus.wood === right.elementDamageBonus.wood
  && left.elementDamageBonus.water === right.elementDamageBonus.water
  && left.elementDamageBonus.fire === right.elementDamageBonus.fire
  && left.elementDamageBonus.earth === right.elementDamageBonus.earth
  && left.elementDamageReduce.metal === right.elementDamageReduce.metal
  && left.elementDamageReduce.wood === right.elementDamageReduce.wood
  && left.elementDamageReduce.water === right.elementDamageReduce.water
  && left.elementDamageReduce.fire === right.elementDamageReduce.fire
  && left.elementDamageReduce.earth === right.elementDamageReduce.earth;
}
/** buildMonsterAttackDamage：构建妖兽普通攻击伤害。 */
export function buildMonsterAttackDamage(monster) {

 const attack = Math.max(monster.numericStats.physAtk, monster.numericStats.spellAtk);
 return Math.max(1, Math.round(attack));
}
/** recoverMonsterHp：恢复妖兽生命值。 */
export function recoverMonsterHp(monster) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!monster.alive || monster.hp >= monster.maxHp || monster.numericStats.hpRegenRate <= 0) {
  return false;
 }

 const heal = Math.round(monster.numericStats.hpRegenRate);
 if (heal <= 0) {
  return false;
 }

 const nextHp = Math.min(monster.maxHp, monster.hp + heal);
 if (nextHp === monster.hp) {
  return false;
 }
 monster.hp = nextHp;
 return true;
}
/** recoverMonsterQi：恢复妖兽灵力值。 */
export function recoverMonsterQi(monster) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 if (!monster.alive || monster.qi >= monster.maxQi || monster.numericStats.qiRegenRate <= 0) {
  return false;
 }

 const recover = Math.round(monster.numericStats.qiRegenRate);
 if (recover <= 0) {
  return false;
 }

 const nextQi = Math.min(monster.maxQi, monster.qi + recover);
 if (nextQi === monster.qi) {
  return false;
 }
 monster.qi = nextQi;
 return true;
}
export function resolveMonsterSkillQiCost(monster, skill) {
 return Math.round(calcQiCostWithOutputLimit(
  Math.max(0, Math.round(Number(skill?.cost) || 0)),
  Math.max(0, monster?.numericStats?.maxQiOutputPerTick ?? 0),
 ));
}
export function commitMonsterSkillCast(monster, skill, currentTick) {
 const qiCost = resolveMonsterSkillQiCost(monster, skill);
 const cooldownReadyTick = Math.max(0, Math.trunc(Number(currentTick) || 0)) + Math.max(1, Math.round(Number(skill?.cooldown) || 1));
 if (qiCost > 0 && (monster.qi ?? 0) < qiCost) {
  return {
   ok: false,
   reason: 'insufficient_qi',
   qiCost,
   cooldownReadyTick,
  };
 }
 if (qiCost > 0) {
  monster.qi = Math.max(0, Math.round((monster.qi ?? 0) - qiCost));
 }
 monster.cooldownReadyTickBySkillId[skill.id] = cooldownReadyTick;
 return {
  ok: true,
  qiCost,
  cooldownReadyTick,
 };
}
/** chooseMonsterSkill：委托怪物 AI 策略注册中心选择当前 tick 技能。 */
export function chooseMonsterSkill(monster, target, distance, currentTick) {
 return chooseMonsterSkillFromAiRegistry(monster, target, distance, currentTick);
}
export function pickFirstCastableMonsterSkill(monster, target, distance, currentTick, skillIds) {
 for (const skillId of skillIds) {
  const skill = monster.skills.find((entry) => entry.id === skillId);
  if (!skill) {
   continue;
  }
  if (!canMonsterCastSkill(monster, skill, target, distance, currentTick)) {
   continue;
  }
  return skill;
 }
 return null;
}
export function canMonsterCastSkill(monster, skill, target, distance, currentTick) {
 if (!skill || typeof skill !== 'object' || typeof skill.id !== 'string' || !skill.id) {
  return false;
 }
 if (skill.active === false) {
  return false;
 }
 if (!matchesMonsterSkillConditions(monster, skill)) {
  return false;
 }
 const skillRange = buildEffectiveMonsterSkillGeometry(monster, skill).range;
 if (resolveSkillRequiresTarget(skill) && distance > skillRange) {
  return false;
 }
 if (!resolveSkillRequiresTarget(skill)
  && monsterSkillHasHostileTargetEffect(skill)
  && !isMonsterTargetInsideSelfAnchoredSkillArea(monster, skill, target)) {
  return false;
 }

 const qiCost = resolveMonsterSkillQiCost(monster, skill);
 if (qiCost > 0 && (monster.qi ?? 0) < qiCost) {
  return false;
 }

 const readyTick = monster.cooldownReadyTickBySkillId[skill.id] ?? 0;
 return currentTick >= readyTick;
}
export function entityHasActiveBuff(buffs, buffId, minStacks = 1) {
 return (Array.isArray(buffs) ? buffs : []).some((buff) => (
  buff?.buffId === buffId
  && (buff.remainingTicks === undefined || buff.remainingTicks > 0)
  && Math.max(1, Math.round(Number(buff.stacks) || 1)) >= minStacks
 ));
}
export function getEntityBuffStacks(buffs, buffId) {
 let total = 0;
 for (const buff of Array.isArray(buffs) ? buffs : []) {
  if (buff?.buffId !== buffId) {
   continue;
  }
  if (buff.remainingTicks !== undefined && buff.remainingTicks <= 0) {
   continue;
  }
  total += Math.max(1, Math.round(Number(buff.stacks) || 1));
 }
 return total;
}
export function matchesMonsterSkillConditions(monster, skill) {
 const group = skill?.monsterCast?.conditions;
 if (!group || !Array.isArray(group.items) || group.items.length === 0) {
  return true;
 }
 const matches = (condition) => matchesMonsterSkillCondition(monster, condition);
 return group.mode === 'any' ? group.items.some(matches) : group.items.every(matches);
}
export function matchesMonsterSkillCondition(monster, condition) {
 switch (condition?.type) {
  case 'hp_ratio': {
   const maxHp = Math.max(1, Math.round(monster.maxHp));
   const ratio = maxHp > 0 ? monster.hp / maxHp : 0;
   return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
  }
  case 'qi_ratio': {
   const maxQi = Math.max(0, Math.round(monster.numericStats?.maxQi ?? 0));
   const qi = Math.max(0, Math.round(monster.qi ?? 0));
   const ratio = maxQi > 0 ? qi / maxQi : 0;
   return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
  }
  case 'has_buff':
   return (monster.buffs ?? []).some((buff) => (
    buff.buffId === condition.buffId
    && Number(buff.remainingTicks) > 0
    && Number(buff.stacks ?? 0) >= (condition.minStacks ?? 1)
   ));
  case 'is_cultivating':
  case 'target_kind':
   return condition.value === false;
  default:
   return true;
 }
}
export function getMonsterSkillWindupTicks(skill) {
 const windupTicks = skill?.monsterCast?.windupTicks;
 return Number.isFinite(windupTicks)
  ? Math.max(0, Math.floor(Number(windupTicks)))
  : 0;
}
export function getMonsterSkillWarningColor(skill) {
 return typeof skill?.monsterCast?.warningColor === 'string' && skill.monsterCast.warningColor.trim().length > 0
  ? skill.monsterCast.warningColor.trim()
  : undefined;
}
export function buildEffectiveMonsterSkillGeometry(monster, skill) {
 return buildEffectiveTargetingGeometry({
  range: resolveSkillRange(skill),
  shape: skill.targeting?.shape ?? 'single',
  radius: skill.targeting?.radius,
  innerRadius: skill.targeting?.innerRadius,
  width: skill.targeting?.width,
  height: skill.targeting?.height,
  checkerParity: skill.targeting?.checkerParity,
 }, {
  extraRange: Math.max(0, Math.floor(monster.numericStats?.extraRange ?? 0)),
  extraArea: Math.max(0, Math.floor(monster.numericStats?.extraArea ?? 0)),
 });
}
export function buildMonsterSkillAffectedCells(monster, skill, anchor) {
 const geometry = buildEffectiveMonsterSkillGeometry(monster, skill);
 const shape = geometry.shape ?? 'single';
 if (shape === 'single') {
  return chebyshevDistance(monster.x, monster.y, anchor.x, anchor.y) <= geometry.range
   ? [{ x: anchor.x, y: anchor.y }]
   : [];
 }
 return computeAffectedCellsFromAnchor({ x: monster.x, y: monster.y }, anchor, geometry);
}
export function resolveMonsterSkillAnchor(monster, skill, target) {
 return resolveSkillRequiresTarget(skill)
  ? { x: target.x, y: target.y }
  : { x: monster.x, y: monster.y };
}
export function monsterSkillHasHostileTargetEffect(skill) {
 const effects = Array.isArray(skill?.effects) ? skill.effects : [];
 return effects.some((effect) => effect?.type === 'damage'
  || (effect?.type === 'buff' && effect.target !== 'self' && effect.target !== 'allies'));
}
export function isMonsterTargetInsideSelfAnchoredSkillArea(monster, skill, target) {
 if (!target) {
  return false;
 }
 const anchor = { x: monster.x, y: monster.y };
 return buildMonsterSkillAffectedCells(monster, skill, anchor)
  .some((cell) => cell.x === target.x && cell.y === target.y);
}
export function buildMonsterSpawnKey(monsterId, spawnX, spawnY) {
 return `monster_spawn:${monsterId}:${spawnX}:${spawnY}`;
}
export function isOrdinaryMonster(monster) {
 return monster?.tier === 'mortal_blood';
}
export function areAllMonstersAlive(monsters) {
 return monsters.length > 0 && monsters.every((monster) => monster.alive === true);
}
export function areAllMonstersDefeated(monsters) {
 return monsters.length > 0 && monsters.every((monster) => monster.alive !== true);
}
export function normalizeMonsterRespawnSpeedBonusPercent(value) {
 if (!Number.isFinite(Number(value))) {
  return 0;
 }
 const normalized = Math.round(Number(value) / MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT)
  * MONSTER_RESPAWN_ACCELERATION_STEP_PERCENT;
 return Math.max(0, Math.min(MONSTER_RESPAWN_ACCELERATION_MAX_PERCENT, normalized));
}
export function resolveMonsterRespawnTicksWithBonus(respawnTicks, bonusPercent) {
 const safeTicks = Math.max(1, Math.round(Number(respawnTicks) || 1));
 const safeBonusPercent = normalizeMonsterRespawnSpeedBonusPercent(bonusPercent);
 return Math.max(
  1,
  Math.round(
   safeTicks * MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT
   / (MONSTER_RESPAWN_ACCELERATION_BASE_PERCENT + safeBonusPercent),
  ),
 );
}
export function normalizeExplicitBuildingAccessPolicies(value) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) {
  return undefined;
 }
 const result = {};
 for (const [slotInput, policyInput] of Object.entries(value)) {
  const slot = typeof slotInput === 'string' ? slotInput.trim() : '';
  if (!slot) continue;
  const validated = validateAccessPolicy(policyInput, { requireResolvedPlayers: true });
  result[slot] = validated.ok && validated.policy
   ? cloneAccessPolicy(validated.policy)
   : cloneAccessPolicy(OWNER_ONLY_ACCESS_POLICY);
 }
 return Object.keys(result).length > 0 ? result : undefined;
}
export function normalizeBuildingRotation(value) {
 const normalized = Math.trunc(Number(value) || 0);
 if (normalized === 90 || normalized === 180 || normalized === 270) {
  return normalized;
 }
 return 0;
}
export function rotationToIndex(rotation) {
 switch (rotation) {
  case 90:
   return 1;
  case 180:
   return 2;
  case 270:
   return 3;
  case 0:
  default:
   return 0;
 }
}
export function normalizeBuildingId(value) {
 return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}
export function normalizeBuildingState(value) {
 switch (value) {
  case 'planned':
  case 'building':
  case 'active':
  case 'damaged':
  case 'destroyed':
  case 'deconstructing':
   return value;
  default:
   return 'active';
 }
}
export function normalizeBuildingDeconstructPreviousState(value, buildRemainingTicks = undefined) {
 const state = normalizeBuildingState(value);
 if (state === 'building' || state === 'active' || state === 'damaged') {
  return state;
 }
 return Number(buildRemainingTicks) > 0 ? 'building' : 'active';
}
export function buildingUsesActiveTopology(buildingOrState) {
 const building = typeof buildingOrState === 'string' ? null : buildingOrState;
 const state = typeof buildingOrState === 'string'
  ? buildingOrState
  : normalizeBuildingState(building?.state);
 if (state === 'deconstructing') {
  const previousState = normalizeBuildingDeconstructPreviousState(
   building?.deconstructPreviousState,
   building?.buildRemainingTicks,
  );
  return previousState !== 'building';
 }
 return state !== 'planned' && state !== 'building' && state !== 'destroyed';
}

export function isTreasureVaultBuildingForRuntime(compiled, building) {
 return building?.defId === 'treasure_vault'
  || compiled?.id === 'treasure_vault'
  || Math.max(0, Math.trunc(Number(compiled?.treasureVaultCapacity) || 0)) > 0;
}

export function isTimeChamberBuildingForRuntime(compiled, building) {
 return building?.defId === 'time_chamber'
  || compiled?.id === 'time_chamber'
  || compiled?.timeChamberEnabled === true;
}
export function resolveBuildingCombatTileType(building, compiled) {
 if (typeof compiled?.visualTileType === 'string' && compiled.visualTileType.trim()) {
  return compiled.visualTileType.trim();
 }
 if (typeof building?.defId === 'string' && building.defId.trim()) {
  return building.defId.trim();
 }
 return 'building';
}
export function resolveBuildingCombatTargetName(building, compiled) {
 if (typeof building?.name === 'string' && building.name.trim()) {
  return building.name.trim();
 }
 if (typeof compiled?.name === 'string' && compiled.name.trim()) {
  return compiled.name.trim();
 }
 if (typeof building?.defId === 'string' && building.defId.trim()) {
  return building.defId.trim();
 }
 return '建筑';
}
export function resolveBuildingCombatTargetPriority(compiled, building) {
 const layerId = Math.max(0, Math.trunc(Number(compiled?.layerId) || 0));
 switch (layerId) {
  case 1:
   return 50;
  case 3:
   return 40;
  case 4:
   return 30;
  case 5:
   return 20;
  case 2:
   return 10;
  default:
   return buildingUsesActiveTopology(building) ? 1 : 0;
 }
}
export function normalizeBuildingRemainingTicks(value, fallbackValue = undefined) {
 const resolved = Number.isFinite(Number(value))
  ? Number(value)
  : Number.isFinite(Number(fallbackValue))
   ? Number(fallbackValue)
   : 1;
 return Math.max(1, resolved);
}
export function normalizePersistedBuildingProgress(value) {
 const resolved = Number(value);
 return Number.isFinite(resolved)
  ? Math.max(0, Number(resolved.toFixed(6)))
  : undefined;
}
export function resolveBuildingRemainingTicks(building) {
 if (Number.isFinite(Number(building?.buildRemainingTicks))) {
  return Math.max(0, Math.ceil(Number(building.buildRemainingTicks)));
 }
 if (Number.isFinite(Number(building?.buildStrength))) {
  return Math.max(1, Math.ceil(Number(building.buildStrength)));
 }
 return 1;
}
export function resolveBuildingDeconstructionTotalWork(building) {
 const buildStrength = Math.max(1, Number(building?.buildStrength) || 1);
 const previousState = normalizeBuildingDeconstructPreviousState(
  building?.deconstructPreviousState,
  building?.buildRemainingTicks,
 );
 if (previousState !== 'building') {
  return buildStrength;
 }
 const remainingWork = Number.isFinite(Number(building?.buildRemainingTicks))
  ? Math.min(buildStrength, Math.max(0, Number(building.buildRemainingTicks)))
  : buildStrength;
 return Math.max(1, Number((buildStrength - remainingWork).toFixed(6)));
}
export function shouldProjectLocalBuilding(building, compiled) {
 if (building?.state === 'building' || building?.state === 'deconstructing') {
  return true;
 }
 if (building?.state !== 'active') {
  return false;
 }
 return building?.defId === 'scripture_platform'
  || isGroundInteractableCellLayerTarget(compiled?.cellLayerTarget)
  || !compiled?.visualTileType;
}
export function resolveBuildingCatalogRevision(catalog) {
 if (!Array.isArray(catalog?.defs)) {
  return 0;
 }
 let revision = 0;
 for (const def of catalog.defs) {
  revision += Math.max(0, Math.trunc(Number(def?.revision) || 0));
 }
 return revision;
}
export function countBuildingCellReferences(buildingIdByCell) {
 let count = 0;
 if (!(buildingIdByCell instanceof Map)) {
  return 0;
 }
 for (const ids of buildingIdByCell.values()) {
  count += Array.isArray(ids) ? ids.length : 0;
 }
 return count;
}
export function createRoomAggregate(room) {
 return {
  roomId: room.id,
  area: room.area,
  perimeter: room.perimeter,
  doorCount: room.doorCount,
  windowCount: room.windowCount,
  roofCoverage: room.roofCoverageRatio,
  elementVector: new Int32Array(5),
  traitCounts: new Map(),
  traitKeys: new Set(),
  comfort: 0,
  stability: 0,
  qiRaw: 0,
  qiAffinity: 0,
  qiLeak: 0,
  shaRaw: 0,
  shaEmit: 0,
  shaReduce: 0,
  integrityPenalty: 0,
  formationScore: 0,
  topologyRevision: room.topologyRevision,
  aggregateRevision: room.topologyRevision + room.contentRevision,
 };
}
export function applyCompiledBuildingToRoomAggregate(aggregate, compiled, catalog = null) {
 for (let index = 0; index < compiled.elementVector.length; index += 1) {
  aggregate.elementVector[index] += compiled.elementVector[index] ?? 0;
 }
 for (const traitId of compiled.traitIds ?? []) {
  aggregate.traitCounts.set(traitId, (aggregate.traitCounts.get(traitId) ?? 0) + 1);
  const traitKey = catalog?.traitKeysById?.[traitId];
  if (traitKey && aggregate.traitKeys instanceof Set) {
   aggregate.traitKeys.add(traitKey);
  }
 }
 aggregate.comfort += compiled.fengShuiContrib?.[0] ?? 0;
 aggregate.stability += compiled.fengShuiContrib?.[1] ?? 0;
 aggregate.qiAffinity += Math.max(0, compiled.fengShuiContrib?.[2] ?? 0);
 aggregate.qiLeak += Math.max(0, compiled.fengShuiContrib?.[3] ?? 0);
 aggregate.shaEmit += Math.max(0, compiled.fengShuiContrib?.[4] ?? 0);
 aggregate.shaReduce += Math.max(0, compiled.fengShuiContrib?.[5] ?? 0);
 aggregate.shaRaw = Math.max(0, aggregate.shaEmit - aggregate.shaReduce);
 aggregate.integrityPenalty += Math.max(0, compiled.fengShuiContrib?.[6] ?? 0);
 aggregate.aggregateRevision += compiled.revision ?? 0;
}
export function compiledBuildingAffectsRoomBoundaryTopology(compiled) {
 if (!compiled) {
  return false;
 }
 if (Math.max(0, Math.trunc(Number(compiled.roomBoundary) || 0)) > 0) {
  return true;
 }
 if (Math.max(0, Math.trunc(Number(compiled.openingKind) || 0)) > 0) {
  return true;
 }
 return typeof compiled.visualTileType === 'string'
  && isStaticRoomBoundaryTile(compiled.visualTileType);
}
export function compiledBuildingAffectsFengShui(compiled) {
 if (!compiled) {
  return false;
 }
 for (const value of compiled.elementVector ?? []) {
  if (value !== 0) {
   return true;
  }
 }
 if ((compiled.traitIds?.length ?? 0) > 0) {
  return true;
 }
 for (const value of compiled.fengShuiContrib ?? []) {
  if (value !== 0) {
   return true;
  }
 }
 return false;
}
export function resolvePersistedBuildingCells(instance, building, persistedCells, compiled) {
 if (compiled?.footprintByRotation) {
  const compiledCells = [];
  const footprint = compiled.footprintByRotation[rotationToIndex(building.rotation)] ?? compiled.footprintByRotation[0];
  for (let index = 0; index < footprint.length; index += 2) {
   const tileIndex = instance.toTileIndex(building.x + footprint[index], building.y + footprint[index + 1]);
   if (tileIndex >= 0) {
    compiledCells.push(tileIndex);
   }
  }
  return Array.from(new Set(compiledCells));
 }
 const cells = [];
 for (const cell of Array.isArray(persistedCells) ? persistedCells : []) {
  const tileIndex = resolvePersistedBuildingCellIndex(instance, cell);
  if (tileIndex >= 0) {
   cells.push(tileIndex);
  }
 }
 return Array.from(new Set(cells));
}

/** 恢复建筑占格时坐标才是稳定真源，tileIndex 只用于兼容没有坐标的旧数据。 */
export function resolvePersistedBuildingCellIndex(instance, cell) {
 if (Number.isFinite(Number(cell?.x)) && Number.isFinite(Number(cell?.y))) {
  return instance.toTileIndex(Math.trunc(Number(cell.x)), Math.trunc(Number(cell.y)));
 }
 return Number.isFinite(Number(cell?.tileIndex)) ? Math.trunc(Number(cell.tileIndex)) : -1;
}

/** 检测重启后失效的进程内 cell 索引，并收集需要清掉的旧建筑视觉。 */
export function inspectPersistedBuildingCellRecovery(instance, canonicalCells, persistedCells) {
 const expectedCells = Array.from(new Set(Array.isArray(canonicalCells) ? canonicalCells : []));
 const rows = Array.isArray(persistedCells) ? persistedCells : [];
 const expectedByCoordinate = new Map(expectedCells.map((cellIndex) => [
  `${instance.tilePlane.getX(cellIndex)},${instance.tilePlane.getY(cellIndex)}`,
  cellIndex,
 ]));
 const exactExpectedCells = new Set();
 const staleCells = [];
 for (const row of rows) {
  const hasCoordinate = Number.isFinite(Number(row?.x)) && Number.isFinite(Number(row?.y));
  const coordinateKey = hasCoordinate
   ? `${Math.trunc(Number(row.x))},${Math.trunc(Number(row.y))}`
   : '';
  const expectedCellIndex = coordinateKey ? expectedByCoordinate.get(coordinateKey) : undefined;
  const persistedTileIndex = Number.isFinite(Number(row?.tileIndex)) ? Math.trunc(Number(row.tileIndex)) : -1;
  if (expectedCellIndex !== undefined && persistedTileIndex === expectedCellIndex) {
   exactExpectedCells.add(expectedCellIndex);
  }
  const staleCellIndex = expectedCellIndex === undefined
   ? resolvePersistedBuildingCellIndex(instance, row)
   : -1;
  if (staleCellIndex >= 0 && !expectedByCoordinate.has(`${instance.tilePlane.getX(staleCellIndex)},${instance.tilePlane.getY(staleCellIndex)}`)) {
   staleCells.push({
    cellIndex: staleCellIndex,
    previousState: resolvePersistedBuildingPreviousTileState(row),
   });
  }
 }
 const missingExpectedCellCount = expectedCells.reduce(
  (count, cellIndex) => count + (exactExpectedCells.has(cellIndex) ? 0 : 1),
  0,
 );
 const extraPersistedCellCount = Math.max(0, rows.length - expectedCells.length);
 return {
  repairedCellCount: missingExpectedCellCount + extraPersistedCellCount,
  staleCells,
 };
}
/** buildSkippedBuildingRecord：记录启动自检丢弃的建筑，供调用方返还宝库库存并写审计。 */
export function buildSkippedBuildingRecord(buildingId, defId, ownerPlayerId, reason) {
 return {
  id: buildingId,
  defId,
  ownerPlayerId: typeof ownerPlayerId === 'string' && ownerPlayerId.trim() ? ownerPlayerId.trim() : null,
  reason,
 };
}
export function* iterateBuildingProtectedPlacementPoints(instance, cellIndices, anchorX, anchorY) {
 const seen = new Set();
 const normalizedAnchorX = Math.trunc(Number(anchorX));
 const normalizedAnchorY = Math.trunc(Number(anchorY));
 if (Number.isFinite(normalizedAnchorX) && Number.isFinite(normalizedAnchorY)) {
  seen.add(`${normalizedAnchorX}:${normalizedAnchorY}`);
  yield { x: normalizedAnchorX, y: normalizedAnchorY };
 }
 for (const cellIndexInput of Array.isArray(cellIndices) ? cellIndices : []) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  if (!Number.isFinite(cellIndex) || cellIndex < 0 || cellIndex >= instance.tilePlane.getCellCount()) {
   continue;
  }
  const x = instance.tilePlane.getX(cellIndex);
  const y = instance.tilePlane.getY(cellIndex);
  const key = `${x}:${y}`;
  if (seen.has(key)) {
   continue;
  }
  seen.add(key);
  yield { x, y };
 }
}
export function restoreSkippedPersistedBuildingTileCells(instance, persistedCells, cellIndices) {
 const previousStateByCell = new Map(resolvePersistedBuildingPreviousTileTypes(instance, persistedCells));
 let restoredCount = 0;
 const restoredCells = new Set();
 for (const cellIndexInput of Array.isArray(cellIndices) ? cellIndices : []) {
  const cellIndex = Math.trunc(Number(cellIndexInput));
  if (!Number.isFinite(cellIndex) || cellIndex < 0 || cellIndex >= instance.tilePlane.getCellCount() || restoredCells.has(cellIndex)) {
   continue;
  }
  restoredCells.add(cellIndex);
  const previousState = previousStateByCell.get(cellIndex);
  const changed = previousState
   ? instance.restoreBuildingPreviousTileState(cellIndex, previousState)
   : instance.applyDefaultTileLayerFallback(cellIndex);
  if (changed) {
   restoredCount += 1;
   instance.markStaticTileSyncDirtyByIndex?.(cellIndex, { sightBlockingChanged: true, pathingChanged: true });
  }
 }
 return restoredCount;
}
export function resolvePersistedBuildingPreviousTileTypes(instance, persistedCells, canonicalCells = null) {
 const previousTileTypes = [];
 const rows = Array.isArray(persistedCells) ? persistedCells : [];
 const targetCells = Array.isArray(canonicalCells) ? Array.from(new Set(canonicalCells)) : [];
 const rowsByCoordinate = new Map();
 for (const row of rows) {
  if (Number.isFinite(Number(row?.x)) && Number.isFinite(Number(row?.y))) {
   rowsByCoordinate.set(`${Math.trunc(Number(row.x))},${Math.trunc(Number(row.y))}`, row);
  }
 }
 const sources = targetCells.length > 0
  ? targetCells.map((tileIndex, index) => ({
   tileIndex,
   cell: rowsByCoordinate.get(`${instance.tilePlane.getX(tileIndex)},${instance.tilePlane.getY(tileIndex)}`)
    ?? (targetCells.length === rows.length ? rows[index] : null),
  }))
  : rows.map((cell) => ({ tileIndex: resolvePersistedBuildingCellIndex(instance, cell), cell }));
 for (const source of sources) {
  const cell = source.cell;
  if (!cell) {
   continue;
  }
  const previousTileType = typeof cell?.previousTileType === 'string' && cell.previousTileType.trim()
   ? cell.previousTileType.trim()
   : typeof cell?.previous_tile_type === 'string' && cell.previous_tile_type.trim()
    ? cell.previous_tile_type.trim()
    : '';
  if (!previousTileType) {
   continue;
  }
  const tileIndex = source.tileIndex;
  if (tileIndex >= 0) {
   previousTileTypes.push([tileIndex, resolvePersistedBuildingPreviousTileState(cell)]);
  }
 }
 return previousTileTypes;
}

export function resolvePersistedBuildingPreviousTileState(cell) {
 const previousTileType = typeof cell?.previousTileType === 'string' && cell.previousTileType.trim()
  ? cell.previousTileType.trim()
  : typeof cell?.previous_tile_type === 'string' && cell.previous_tile_type.trim()
   ? cell.previous_tile_type.trim()
   : '';
 if (!previousTileType) {
  return null;
 }
 const previousState: Record<string, unknown> = { tileType: previousTileType };
 const terrainValue = readPersistedCellProperty(cell, 'previousTerrainType', 'previous_terrain_type');
 if (terrainValue.exists) {
  const terrainType = normalizeOptionalLayerString(terrainValue.value);
  if (terrainType) {
   previousState.terrainType = terrainType;
  }
 }
 const surfaceValue = readPersistedCellProperty(cell, 'previousSurfaceType', 'previous_surface_type');
 if (surfaceValue.exists) {
  previousState.surfaceType = normalizeNullableLayerString(surfaceValue.value);
 }
 const structureValue = readPersistedCellProperty(cell, 'previousStructureType', 'previous_structure_type');
 if (structureValue.exists) {
  previousState.structureType = normalizeNullableLayerString(structureValue.value);
 }
 const interactableValue = readPersistedCellProperty(cell, 'previousInteractableKinds', 'previous_interactable_kinds');
 if (interactableValue.exists) {
  previousState.interactableKinds = normalizeInteractableKindList(interactableValue.value);
 }
 return previousState;
}
export function readPersistedCellProperty(cell, camelKey, snakeKey) {
 if (cell && Object.prototype.hasOwnProperty.call(cell, camelKey)) {
  return { exists: true, value: cell[camelKey] };
 }
 if (cell && Object.prototype.hasOwnProperty.call(cell, snakeKey)) {
  return { exists: true, value: cell[snakeKey] };
 }
 return { exists: false, value: undefined };
}
export function resolvePreviousBuildingTileType(previousState) {
 if (typeof previousState === 'string') {
  return previousState;
 }
 return typeof previousState?.tileType === 'string' && previousState.tileType.trim()
  ? previousState.tileType.trim()
  : null;
}
export function resolvePreviousBuildingLayerValue(previousState, key) {
 if (!previousState || typeof previousState !== 'object') {
  return null;
 }
 const value = previousState[key];
 return typeof value === 'string' && value.trim() ? value.trim() : null;
}
export function resolvePreviousBuildingNullableLayerValue(previousState, key) {
 if (!previousState || typeof previousState !== 'object' || !Object.prototype.hasOwnProperty.call(previousState, key)) {
  return null;
 }
 const value = previousState[key];
 return typeof value === 'string' && value.trim() ? value.trim() : null;
}
export function resolvePreviousBuildingInteractableKinds(previousState) {
 return Array.isArray(previousState?.interactableKinds)
  ? previousState.interactableKinds.filter((kind) => typeof kind === 'string' && kind.trim()).map((kind) => kind.trim())
  : [];
}
export function normalizeOptionalLayerString(value) {
 return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
export function normalizeNullableLayerString(value) {
 return typeof value === 'string' && value.trim() ? value.trim() : null;
}
export function normalizeInteractableKindList(value) {
 return Array.isArray(value)
  ? value.filter((kind) => typeof kind === 'string' && kind.trim()).map((kind) => kind.trim())
  : [];
}
export function areInteractableKindListsEqual(left, right) {
 const leftList = normalizeInteractableKindList(left);
 const rightList = normalizeInteractableKindList(right);
 if (leftList.length !== rightList.length) {
  return false;
 }
 for (let index = 0; index < leftList.length; index += 1) {
  if (leftList[index] !== rightList[index]) {
   return false;
  }
 }
 return true;
}

export function resolveTemplateLayerSeed(template, x, y) {
 if (hasTemplateLayerRows(template)
  || Array.isArray(template?.surfaceRows)
  || Array.isArray(template?.structureRows)
  || Array.isArray(template?.interactableRows)) {
  const legacyTileType = composeTileTypeFromLayers(
   template.terrainRows?.[y]?.[x],
   template.surfaceRows?.[y]?.[x] ?? null,
   template.structureRows?.[y]?.[x] ?? null,
   template.interactableRows?.[y]?.[x] ?? [],
  );
  return {
   terrain: normalizeTerrainType(template.terrainRows?.[y]?.[x]),
   surface: normalizeSurfaceType(template.surfaceRows?.[y]?.[x] ?? null),
   structure: normalizeStructureType(template.structureRows?.[y]?.[x] ?? null),
   interactables: Array.isArray(template.interactableRows?.[y]?.[x]) ? template.interactableRows[y][x] : [],
   legacyTileType,
  };
 }
 const staticType = getTileTypeFromMapChar(template.terrainRows?.[y]?.[x] ?? template.source?.tiles?.[y]?.[x] ?? '#');
 return resolveTileLayerSeedFromTemplateContext(staticType, x, y, (lookupX, lookupY) => {
  if (lookupX < 0 || lookupY < 0 || lookupX >= template.width || lookupY >= template.height) {
   return null;
  }
  return getTileTypeFromMapChar(template.terrainRows?.[lookupY]?.[lookupX] ?? template.source?.tiles?.[lookupY]?.[lookupX] ?? '#');
 });
}

export function hasTemplateLayerRows(template) {
 return Array.isArray(template?.terrainRows?.[0]);
}
export function isIndoorSubspaceTemplate(template) {
 const source = template?.source ?? template ?? {};
 return Boolean(
  (typeof source.parentMapId === 'string' && source.parentMapId.trim())
  || source.spaceVisionMode === 'parent_overlay'
  || Number.isInteger(source.floorLevel),
 );
}
export function isNaturalAuraFlowResource(resourceKey) {
 if (resourceKey === DEFAULT_TILE_AURA_RESOURCE_KEY) {
  return true;
 }
 if (resourceKey === DISPERSED_AURA_RESOURCE_KEY) {
  return true;
 }
 const parsed = typeof parseQiResourceKey === 'function'
  ? parseQiResourceKey(resourceKey)
  : null;
 return parsed?.family === 'aura' && parsed?.form === 'refined';
}
export function getTileResourceFlowRate(resourceKey) {
 return resourceKey === DISPERSED_AURA_RESOURCE_KEY ? DISPERSED_AURA_FLOW_RATE : TILE_AURA_FLOW_RATE;
}
export function getTileResourceMinimumDecayPerTick(resourceKey) {
 return resourceKey === DISPERSED_AURA_RESOURCE_KEY ? DISPERSED_AURA_MIN_DECAY_PER_TICK : 0;
}
/** resolveSkillRange：解析技能射程。 */
export function resolveSkillRange(skill) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const targetingRange = skill.targeting?.range;
 if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
  return Math.max(1, Math.round(targetingRange));
 }
 return Math.max(1, Math.round(skill.range));
}
/** chooseMonsterStep：选择妖兽下一步移动。 */
export function chooseMonsterStep(fromX, fromY, targetX, targetY) {
 // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

 const dx = Math.sign(targetX - fromX);

 const dy = Math.sign(targetY - fromY);

 const candidates = [];
 if (Math.abs(targetX - fromX) >= Math.abs(targetY - fromY) && dx !== 0) {
  candidates.push({
   x: fromX + dx,
   y: fromY,
   facing: dx > 0 ? Direction.East : Direction.West,
  });
 }
 if (dy !== 0) {
  candidates.push({
   x: fromX,
   y: fromY + dy,
   facing: Direction.East,
  });
 }
 if (Math.abs(targetX - fromX) < Math.abs(targetY - fromY) && dx !== 0) {
  candidates.push({
   x: fromX + dx,
   y: fromY,
   facing: dx > 0 ? Direction.East : Direction.West,
  });
 }
 return candidates;
}
/** chebyshevDistance：计算切比雪夫距离。 */
export function chebyshevDistance(ax, ay, bx, by) {
 return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
