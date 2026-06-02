/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
import { ATTR_KEYS } from './constants/gameplay/attributes';
import { DEFAULT_MAP_TIME_CONFIG } from './constants/gameplay/world';
import { isOffsetInRange } from './geometry';
import {
  GmMapAuraRecord,
  GmMapContainerRecord,
  GmMapContainerLootPoolRecord,
  GmMapDocument,
  GmMapDropRecord,
  GmMapLandmarkRecord,
  GmMapLayeredCellRecord,
  GmMapListRes,
  GmMapMonsterSpawnRecord,
  GmMapNpcRecord,
  GmMapNpcShopItemRecord,
  GmMapPortalRecord,
  GmMapQuestRecord,
  GmMapResourceNodeGroupRecord,
  GmMapResourceNodePlacementRecord,
  GmMapResourceRecord,
  GmMapSafeZoneRecord,
  GmMapTileEffectRecord,
  GmMapSummary,
} from './api-contracts';
import { parseQiResourceKey } from './qi';
import { resolveMapGroupInfo } from './map-groups';
import { getTileTypeFromMapChar, getMapCharFromTileType, isTileTypeWalkable } from './terrain';
import {
  TERRAIN_CHAR_TO_TYPE,
  TERRAIN_TYPE_TO_CHAR,
  STRUCTURE_CHAR_TO_TYPE,
  STRUCTURE_TYPE_TO_CHAR,
  SURFACE_CHAR_TO_TYPE,
  SURFACE_TYPE_TO_CHAR,
  LAYER_EMPTY_CHAR,
} from './constants/gameplay/map-layer-chars';
import { HOUSE_DECOR_TILE_MAP_CHARS } from './constants/gameplay/house-terrain';
import {
  InteractableKind,
  StructureType,
  SurfaceType,
  TerrainType,
  composeTileTypeFromLayers,
  resolveTileLayerSeedFromTemplateContext,
} from './map-layer-types';
import {
  MapSpaceVisionMode,
  MapRouteDomain,
  MapTimeConfig,
  PortalDirection,
  MonsterAggroMode,
  PortalKind,
  PortalRouteDomain,
  PortalTrigger,
  TileType,
} from './world-core-types';
import { QuestLine, QuestObjectiveType } from './quest-types';
import { TechniqueGrade } from './cultivation-types';

/** 允许出现在地图文档里的地块字符全集。 */
const SUPPORTED_MAP_TILE_CHARS = new Set(['#', '.', '=', ':', 'P', 'S', '+', 'W', 'B', ',', '^', '崖', ';', '%', '~', '云', '霞', '空', 'T', '竹', 'o', 'L', '铁', '刃', '梯', ...HOUSE_DECOR_TILE_MAP_CHARS]);

/** 深拷贝地图文档，供编辑器本地草稿保存或回滚使用。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 将传送点类型归一到地图编辑器支持的两种取值。 */
function normalizePortalKind(kind: unknown): PortalKind {
  return kind === 'stairs' ? 'stairs' : 'portal';
}

/** 传送触发方式非法时回退到与传送点类型匹配的默认值。 */
function normalizePortalTrigger(trigger: unknown, kind?: unknown): PortalTrigger {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (trigger === 'manual' || trigger === 'auto') {
    return trigger;
  }
  return kind === 'stairs' ? 'auto' : 'manual';
}

/** 传送方向非法时默认按双向处理，兼容旧内容。 */
function normalizePortalDirection(direction: unknown): PortalDirection {
  return direction === 'one_way' ? 'one_way' : 'two_way';
}

/** 生成缺省传送点 ID，旧内容加载时可被稳定补齐。 */
function normalizePortalId(id: unknown, mapId: string, x: number, y: number): string {
  const explicit = normalizeOptionalTrimmedString(id);
  if (explicit) {
    return explicit;
  }
  const normalizedMapId = mapId.trim() || 'map';
  return `${normalizedMapId}:${x},${y}`;
}

/** 只有配置了父图时才允许使用父图叠加视野。 */
function normalizeMapSpaceVisionMode(mode: unknown, parentMapId?: unknown): MapSpaceVisionMode {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (mode === 'parent_overlay' && typeof parentMapId === 'string' && parentMapId.trim()) {
    return 'parent_overlay';
  }
  return 'isolated';
}

/** 将容器品质限制在合法枚举内，未知值回落到最低档。 */
function normalizeContainerGrade(grade: unknown): TechniqueGrade {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (
    grade === 'mortal'
    || grade === 'yellow'
    || grade === 'mystic'
    || grade === 'earth'
    || grade === 'heaven'
    || grade === 'spirit'
    || grade === 'saint'
    || grade === 'emperor'
  ) {
    return grade;
  }
  return 'mortal';
}

/** 清洗 NPC 商店商品记录，补齐可落库的最小字段。 */
function normalizeEditableNpcShopItemRecord(raw: unknown): GmMapNpcShopItemRecord | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const item = raw as Partial<GmMapNpcShopItemRecord>;
  if (typeof item.itemId !== 'string') {
    return null;
  }
  const price = Number.isFinite(item.price) ? Math.floor(Number(item.price)) : undefined;
  const priceFormula = item.priceFormula === 'technique_realm_square_grade'
    ? 'technique_realm_square_grade'
    : undefined;
  if (price === undefined && !priceFormula) {
    return null;
  }
  return {
    itemId: item.itemId,
    price,
    stockLimit: normalizeOptionalInteger(item.stockLimit),
    refreshSeconds: normalizeOptionalInteger(item.refreshSeconds),
    priceFormula,
  };
}

/** 清洗资源节点布点坐标，确保只保留整数网格点。 */
function normalizeEditableResourceNodePlacementRecord(raw: unknown): GmMapResourceNodePlacementRecord | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const placement = raw as Partial<GmMapResourceNodePlacementRecord>;
  if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) {
    return undefined;
  }
  return {
    x: Math.trunc(Number(placement.x)),
    y: Math.trunc(Number(placement.y)),
  };
}

/** 清洗资源节点分组，保留主线地图运行时需要的最小字段。 */
function normalizeEditableResourceNodeGroupRecord(raw: unknown): GmMapResourceNodeGroupRecord | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const group = raw as Partial<GmMapResourceNodeGroupRecord>;
  const resourceNodeId = normalizeOptionalTrimmedString(group.resourceNodeId);
  const idPrefix = normalizeOptionalTrimmedString(group.idPrefix);
  const name = normalizeOptionalTrimmedString(group.name);
  if (!resourceNodeId || !idPrefix || !name) {
    return undefined;
  }
  return {
    resourceNodeId,
    idPrefix,
    name,
    placements: Array.isArray(group.placements)
      ? group.placements
        .map((placement) => normalizeEditableResourceNodePlacementRecord(placement))
        .filter((placement): placement is GmMapResourceNodePlacementRecord => Boolean(placement))
      : [],
  };
}

/** 清洗地块效果区域，冷路径转成运行时可直接查表的矩形。 */
function normalizeEditableTileEffectRecord(raw: unknown): GmMapTileEffectRecord | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const effect = raw as Partial<GmMapTileEffectRecord>;
  if (!Number.isFinite(effect.x) || !Number.isFinite(effect.y)) {
    return undefined;
  }
  const movementCost = Number.isFinite(effect.movementCost)
    ? Math.max(1, Math.floor(Number(effect.movementCost)))
    : undefined;
  const qiDrainPerTick = Number.isFinite(effect.qiDrainPerTick)
    ? Math.max(0, Math.floor(Number(effect.qiDrainPerTick)))
    : undefined;
  if (movementCost === undefined && qiDrainPerTick === undefined) {
    return undefined;
  }
  return {
    id: normalizeOptionalTrimmedString(effect.id),
    x: Math.trunc(Number(effect.x)),
    y: Math.trunc(Number(effect.y)),
    width: Math.max(1, Math.floor(Number(effect.width) || 1)),
    height: Math.max(1, Math.floor(Number(effect.height) || 1)),
    movementCost,
    qiDrainPerTick,
  };
}

/** 去掉空白字符串，空内容统一转成 undefined。 */
function normalizeOptionalTrimmedString(value: unknown): string | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 将可空数字收敛为整数，非法值返回 undefined。 */
function normalizeOptionalInteger(value: unknown): number | undefined {
  return Number.isFinite(value) ? Math.floor(Number(value)) : undefined;
}

/** 将任务线字段收敛到合法枚举。 */
function normalizeQuestLine(value: unknown): QuestLine | undefined {
  return value === 'main' || value === 'side' || value === 'daily' || value === 'encounter'
    ? value
    : undefined;
}

/** 过滤非法任务目标类型，避免保存后出现不可执行目标。 */
function normalizeQuestObjectiveType(value: unknown): QuestObjectiveType | undefined {
  return value === 'kill'
    || value === 'talk'
    || value === 'submit_item'
    || value === 'learn_technique'
    || value === 'realm_progress'
    || value === 'realm_stage'
    ? value
  : undefined;
}

/** 将地图路网域收敛到合法取值。 */
function normalizeMapRouteDomain(value: unknown): MapRouteDomain | undefined {
  return value === 'system' || value === 'sect' || value === 'personal' || value === 'dynamic'
    ? value
    : undefined;
}

/** 将传送点路网域收敛到合法取值。 */
function normalizePortalRouteDomain(value: unknown): PortalRouteDomain | undefined {
  return value === 'inherit' || value === 'system' || value === 'sect' || value === 'personal' || value === 'dynamic'
    ? value
    : undefined;
}

/** 将怪物仇恨模式收敛到合法枚举。 */
function normalizeMonsterAggroMode(value: unknown): MonsterAggroMode | undefined {
  return value === 'always' || value === 'retaliate' || value === 'day_only' || value === 'night_only'
    ? value
    : undefined;
}

/** 清洗地图时间配置，并把数值压到可保存的边界内。 */
function normalizeMapTimeConfig(raw: unknown): MapTimeConfig {
  const candidate = (raw ?? {}) as Partial<MapTimeConfig>;
  const palette = candidate.palette && typeof candidate.palette === 'object' ? candidate.palette : {};
  const normalizedPalette = Object.fromEntries(
    Object.entries(palette).flatMap(([phase, entry]) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const tint = typeof entry.tint === 'string' ? entry.tint : undefined;
      const alpha = typeof entry.alpha === 'number' && Number.isFinite(entry.alpha)
        ? Math.max(0, Math.min(1, entry.alpha))
        : undefined;
      return [[phase, { tint, alpha }]];
    }),
  ) as NonNullable<MapTimeConfig['palette']>;

  return {
    offsetTicks: Number.isFinite(candidate.offsetTicks)
      ? Math.round(candidate.offsetTicks ?? 0)
      : DEFAULT_MAP_TIME_CONFIG.offsetTicks,
    scale: typeof candidate.scale === 'number' && Number.isFinite(candidate.scale) && candidate.scale >= 0
      ? candidate.scale
      : DEFAULT_MAP_TIME_CONFIG.scale,
    light: {
      base: typeof candidate.light?.base === 'number' && Number.isFinite(candidate.light.base)
        ? Math.max(0, Math.min(100, candidate.light.base))
        : DEFAULT_MAP_TIME_CONFIG.light?.base,
      timeInfluence: typeof candidate.light?.timeInfluence === 'number' && Number.isFinite(candidate.light.timeInfluence)
        ? Math.max(0, Math.min(100, candidate.light.timeInfluence))
        : DEFAULT_MAP_TIME_CONFIG.light?.timeInfluence,
    },
    palette: normalizedPalette,
  };
}

/** 清洗容器记录，连同嵌套掉落和随机池一起归一化。 */
function normalizeEditableContainerRecord(input: unknown): GmMapContainerRecord | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const container = input as GmMapContainerRecord;
  return {
    variant: container.variant === 'herb' ? 'herb' : undefined,
    grade: normalizeContainerGrade(container.grade),
    refreshTicks: Number.isFinite(container.refreshTicks) ? Number(container.refreshTicks) : undefined,
    refreshTicksMin: Number.isFinite(container.refreshTicksMin) ? Number(container.refreshTicksMin) : undefined,
    refreshTicksMax: Number.isFinite(container.refreshTicksMax) ? Number(container.refreshTicksMax) : undefined,
    char: normalizeOptionalTrimmedString(container.char),
    color: normalizeOptionalTrimmedString(container.color),
    drops: Array.isArray(container.drops)
      ? container.drops.map((drop) => ({
        itemId: String(drop.itemId ?? ''),
        name: String(drop.name ?? ''),
        type: drop.type,
        count: Number.isFinite(drop.count) ? Number(drop.count) : 1,
        chance: Number.isFinite(drop.chance) ? Number(drop.chance) : undefined,
      }))
      : [],
    lootPools: Array.isArray(container.lootPools)
      ? container.lootPools
        .map((pool) => normalizeEditableContainerLootPoolRecord(pool))
        .filter((pool): pool is GmMapContainerLootPoolRecord => Boolean(pool))
      : [],
  };
}

/** 清洗容器随机池参数，并去掉空标签组。 */
function normalizeEditableContainerLootPoolRecord(input: unknown): GmMapContainerLootPoolRecord | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const pool = input as GmMapContainerLootPoolRecord;
  const normalizedTagGroups = Array.isArray(pool.tagGroups)
    ? pool.tagGroups
      .map((group) => Array.isArray(group)
        ? group
          .map((entry) => normalizeOptionalTrimmedString(entry))
          .filter((entry): entry is string => Boolean(entry))
        : [])
      .filter((group) => group.length > 0)
    : [];
  return {
    rolls: Number.isFinite(pool.rolls) ? Number(pool.rolls) : undefined,
    chance: Number.isFinite(pool.chance) ? Number(pool.chance) : undefined,
    minLevel: Number.isFinite(pool.minLevel) ? Number(pool.minLevel) : undefined,
    maxLevel: Number.isFinite(pool.maxLevel) ? Number(pool.maxLevel) : undefined,
    minGrade: pool.minGrade ? normalizeContainerGrade(pool.minGrade) : undefined,
    maxGrade: pool.maxGrade ? normalizeContainerGrade(pool.maxGrade) : undefined,
    tagGroups: normalizedTagGroups,
    countMin: Number.isFinite(pool.countMin) ? Number(pool.countMin) : undefined,
    countMax: Number.isFinite(pool.countMax) ? Number(pool.countMax) : undefined,
    allowDuplicates: pool.allowDuplicates === true,
  };
}

/** 清洗地图掉落项，统一最小可落库字段。 */
function normalizeEditableDropRecord(input: unknown): GmMapDropRecord | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const drop = input as GmMapDropRecord;
  return {
    itemId: String(drop.itemId ?? ''),
    name: String(drop.name ?? ''),
    type: drop.type,
    count: Number.isFinite(drop.count) ? Number(drop.count) : 1,
    chance: Number.isFinite(drop.chance) ? Number(drop.chance) : undefined,
  };
}

/** 清洗任务记录，统一奖励、目标和提交字段的类型。 */
function normalizeEditableQuestRecord(input: unknown): GmMapQuestRecord | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const quest = input as GmMapQuestRecord;
  const reward = Array.isArray(quest.reward)
    ? quest.reward
        .map((entry) => normalizeEditableDropRecord(entry))
        .filter((entry): entry is GmMapDropRecord => Boolean(entry))
    : [];
  const unlockBreakthroughRequirementIds = Array.isArray(quest.unlockBreakthroughRequirementIds)
    ? quest.unlockBreakthroughRequirementIds
        .map((entry) => normalizeOptionalTrimmedString(entry))
        .filter((entry): entry is string => Boolean(entry))
    : undefined;

  return {
    id: String(quest.id ?? ''),
    title: String(quest.title ?? ''),
    desc: String(quest.desc ?? ''),
    line: normalizeQuestLine(quest.line),
    chapter: normalizeOptionalTrimmedString(quest.chapter),
    story: normalizeOptionalTrimmedString(quest.story),
    objectiveType: normalizeQuestObjectiveType(quest.objectiveType),
    objectiveText: normalizeOptionalTrimmedString(quest.objectiveText),
    targetName: normalizeOptionalTrimmedString(quest.targetName),
    targetMapId: normalizeOptionalTrimmedString(quest.targetMapId),
    targetX: normalizeOptionalInteger(quest.targetX),
    targetY: normalizeOptionalInteger(quest.targetY),
    targetNpcId: normalizeOptionalTrimmedString(quest.targetNpcId),
    targetNpcName: normalizeOptionalTrimmedString(quest.targetNpcName),
    targetMonsterId: normalizeOptionalTrimmedString(quest.targetMonsterId),
    targetTechniqueId: normalizeOptionalTrimmedString(quest.targetTechniqueId),
    targetRealmStage: typeof quest.targetRealmStage === 'string'
      ? normalizeOptionalTrimmedString(quest.targetRealmStage)
      : normalizeOptionalInteger(quest.targetRealmStage),
    required: normalizeOptionalInteger(quest.required),
    targetCount: normalizeOptionalInteger(quest.targetCount),
    rewardItemId: normalizeOptionalTrimmedString(quest.rewardItemId),
    rewardText: normalizeOptionalTrimmedString(quest.rewardText),
    reward,
    nextQuestId: normalizeOptionalTrimmedString(quest.nextQuestId),
    requiredItemId: normalizeOptionalTrimmedString(quest.requiredItemId),
    requiredItemCount: normalizeOptionalInteger(quest.requiredItemCount),
    submitNpcId: normalizeOptionalTrimmedString(quest.submitNpcId),
    submitNpcName: normalizeOptionalTrimmedString(quest.submitNpcName),
    submitMapId: normalizeOptionalTrimmedString(quest.submitMapId),
    submitX: normalizeOptionalInteger(quest.submitX),
    submitY: normalizeOptionalInteger(quest.submitY),
    relayMessage: normalizeOptionalTrimmedString(quest.relayMessage),
    unlockBreakthroughRequirementIds,
  };
}

/** 根据传送点数据重建地图字符层，保持图块与对象同步。 */
function syncPortalTiles(document: GmMapDocument): GmMapDocument {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const rows = document.tiles.map((row) => [...row].map((char) => (char === 'P' || char === 'S') ? '.' : char));
  const interactableRows: InteractableKind[][][] | undefined = document.interactableRows?.map((row) => row.map((cell): InteractableKind[] => (
    Array.isArray(cell)
      ? cell.filter((kind) => kind !== InteractableKind.Portal && kind !== InteractableKind.Stairs)
      : []
  )));
  for (const portal of document.portals) {
    if (portal.hidden) continue;
    if (!rows[portal.y]?.[portal.x]) continue;
    rows[portal.y]![portal.x] = portal.kind === 'stairs' ? 'S' : 'P';
    const interactableKind = portal.kind === 'stairs' ? InteractableKind.Stairs : InteractableKind.Portal;
    const cell = interactableRows?.[portal.y]?.[portal.x];
    if (cell && !cell.includes(interactableKind)) {
      cell.push(interactableKind);
    }
  }
  return {
    ...document,
    tiles: rows.map((row) => row.join('')),
    interactableRows,
  };
}

/** 在出生点落在不可通行格时，向外搜索最近可走坐标作为兜底。 */
function resolveNearestWalkablePointInDocument(
  document: GmMapDocument,
  origin: {
  /**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number },
): {
/**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (document.width <= 0 || document.height <= 0) {
    return null;
  }

  const clamped = {
    x: Math.min(document.width - 1, Math.max(0, Math.floor(origin.x))),
    y: Math.min(document.height - 1, Math.max(0, Math.floor(origin.y))),
  };

  let portalFallback: {
  /**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number } | null = null;
  for (let radius = 0; radius <= Math.max(document.width, document.height); radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (!isOffsetInRange(dx, dy, radius)) continue;
        const x = clamped.x + dx;
        const y = clamped.y + dy;
        if (x < 0 || x >= document.width || y < 0 || y >= document.height) continue;
        const type = getComposedTileTypeAt(document, x, y);
        if (type === TileType.Portal || type === TileType.Stairs) {
          portalFallback ??= { x, y };
          continue;
        }
        if (isTileTypeWalkable(type)) {
          return { x, y };
        }
      }
    }
  }

  return portalFallback;
}

/** 修正地图文档中的出生点，让保存后的进入点始终可达。 */
function repairEditableMapDocument(document: GmMapDocument): GmMapDocument {
  return {
    ...document,
    spawnPoint: resolveNearestWalkablePointInDocument(document, document.spawnPoint) ?? document.spawnPoint,
  };
}

const TERRAIN_TYPE_SET = new Set(Object.values(TerrainType)) as ReadonlySet<TerrainType>;
const SURFACE_TYPE_SET = new Set(Object.values(SurfaceType)) as ReadonlySet<SurfaceType>;
const STRUCTURE_TYPE_SET = new Set(Object.values(StructureType)) as ReadonlySet<StructureType>;
const INTERACTABLE_KIND_SET = new Set(Object.values(InteractableKind)) as ReadonlySet<InteractableKind>;

function normalizeTerrainRowCell(value: unknown): TerrainType | null {
  return typeof value === 'string' && TERRAIN_TYPE_SET.has(value as TerrainType)
    ? value as TerrainType
    : null;
}

function normalizeSurfaceRowCell(value: unknown): SurfaceType | null {
  return typeof value === 'string' && SURFACE_TYPE_SET.has(value as SurfaceType)
    ? value as SurfaceType
    : null;
}

function normalizeStructureRowCell(value: unknown): StructureType | null {
  return typeof value === 'string' && STRUCTURE_TYPE_SET.has(value as StructureType)
    ? value as StructureType
    : null;
}

function normalizeInteractableRowCell(value: unknown): InteractableKind[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: InteractableKind[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && INTERACTABLE_KIND_SET.has(entry as InteractableKind) && !result.includes(entry as InteractableKind)) {
      result.push(entry as InteractableKind);
    }
  }
  return result;
}

function normalizeTerrainRows(raw: unknown): TerrainType[][] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.map((row) => Array.isArray(row) ? row.map((cell) => normalizeTerrainRowCell(cell) ?? TerrainType.Floor) : []);
}

function normalizeSurfaceRows(raw: unknown): (SurfaceType | null)[][] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.map((row) => Array.isArray(row) ? row.map((cell) => normalizeSurfaceRowCell(cell)) : []);
}

function normalizeStructureRows(raw: unknown): (StructureType | null)[][] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.map((row) => Array.isArray(row) ? row.map((cell) => normalizeStructureRowCell(cell)) : []);
}

function normalizeInteractableRows(raw: unknown): InteractableKind[][][] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.map((row) => Array.isArray(row) ? row.map((cell) => normalizeInteractableRowCell(cell)) : []);
}

function buildLayeredRowsFromLegacyTiles(tiles: readonly string[], width: number, height: number): Pick<
  GmMapDocument,
  'terrainRows' | 'surfaceRows' | 'structureRows' | 'interactableRows'
> {
  const terrainRows: TerrainType[][] = [];
  const surfaceRows: (SurfaceType | null)[][] = [];
  const structureRows: (StructureType | null)[][] = [];
  const interactableRows: InteractableKind[][][] = [];
  for (let y = 0; y < height; y += 1) {
    const terrainRow: TerrainType[] = [];
    const surfaceRow: (SurfaceType | null)[] = [];
    const structureRow: (StructureType | null)[] = [];
    const interactableRow: InteractableKind[][] = [];
    for (let x = 0; x < width; x += 1) {
      const tileType = getTileTypeFromMapChar(tiles[y]?.[x] ?? '#');
      const seed = resolveTileLayerSeedFromTemplateContext(tileType, x, y, (lookupX, lookupY) => {
        if (lookupX < 0 || lookupY < 0 || lookupX >= width || lookupY >= height) {
          return null;
        }
        return getTileTypeFromMapChar(tiles[lookupY]?.[lookupX] ?? '#');
      });
      terrainRow.push(seed.terrain);
      surfaceRow.push(seed.surface);
      structureRow.push(seed.structure);
      interactableRow.push([...seed.interactables]);
    }
    terrainRows.push(terrainRow);
    surfaceRows.push(surfaceRow);
    structureRows.push(structureRow);
    interactableRows.push(interactableRow);
  }
  return { terrainRows, surfaceRows, structureRows, interactableRows };
}

function buildLayeredRowsFromDocument(source: Partial<GmMapDocument>, tiles: readonly string[], width: number, height: number): Pick<
  GmMapDocument,
  'terrainRows' | 'surfaceRows' | 'structureRows' | 'interactableRows'
> {
  const legacyRows = buildLayeredRowsFromLegacyTiles(tiles, width, height);
  const layeredCells = normalizeEditableLayeredCells(source.layeredCells);
  const sourceTerrainRows = normalizeTerrainRows(source.terrainRows);
  const sourceSurfaceRows = normalizeSurfaceRows(source.surfaceRows);
  const sourceStructureRows = normalizeStructureRows(source.structureRows);
  const sourceInteractableRows = normalizeInteractableRows(source.interactableRows);
  const terrainRows = legacyRows.terrainRows!.map((row) => row.slice());
  const surfaceRows = legacyRows.surfaceRows!.map((row) => row.slice());
  const structureRows = legacyRows.structureRows!.map((row) => row.slice());
  const interactableRows = legacyRows.interactableRows!.map((row) => row.map((cell) => cell.slice()));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (sourceTerrainRows?.[y]?.[x] !== undefined) terrainRows[y]![x] = sourceTerrainRows[y]![x]!;
      if (sourceSurfaceRows?.[y]?.[x] !== undefined) surfaceRows[y]![x] = sourceSurfaceRows[y]![x]!;
      if (sourceStructureRows?.[y]?.[x] !== undefined) structureRows[y]![x] = sourceStructureRows[y]![x]!;
      if (sourceInteractableRows?.[y]?.[x] !== undefined) interactableRows[y]![x] = sourceInteractableRows[y]![x]!;
      const cell = layeredCells?.[y]?.[x];
      if (!cell) {
        continue;
      }
      if (cell.terrain !== undefined) terrainRows[y]![x] = cell.terrain;
      if (cell.surface !== undefined) surfaceRows[y]![x] = cell.surface;
      if (cell.structure !== undefined) structureRows[y]![x] = cell.structure;
      if (cell.interactables !== undefined) interactableRows[y]![x] = [...cell.interactables];
    }
  }
  return { terrainRows, surfaceRows, structureRows, interactableRows };
}

function getComposedTileTypeAt(document: GmMapDocument, x: number, y: number): TileType {
  return composeTileTypeFromLayers(
    document.terrainRows?.[y]?.[x],
    document.surfaceRows?.[y]?.[x] ?? null,
    document.structureRows?.[y]?.[x] ?? null,
    document.interactableRows?.[y]?.[x] ?? [],
  );
}

/** 校验并清洗单个分层 cell。空对象/非法字段会被丢弃，缺省字段保持 undefined。 */
function normalizeLayeredCell(raw: unknown): GmMapLayeredCellRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const source = raw as Partial<GmMapLayeredCellRecord> & { interactables?: unknown };
  const result: GmMapLayeredCellRecord = {};
  if (typeof source.terrain === 'string' && TERRAIN_TYPE_SET.has(source.terrain as TerrainType)) {
    result.terrain = source.terrain as TerrainType;
  }
  if (source.surface === null) {
    result.surface = null;
  } else if (typeof source.surface === 'string' && SURFACE_TYPE_SET.has(source.surface as SurfaceType)) {
    result.surface = source.surface as SurfaceType;
  }
  if (source.structure === null) {
    result.structure = null;
  } else if (typeof source.structure === 'string' && STRUCTURE_TYPE_SET.has(source.structure as StructureType)) {
    result.structure = source.structure as StructureType;
  }
  if (Array.isArray(source.interactables)) {
    const interactables = source.interactables.filter(
      (entry): entry is InteractableKind => typeof entry === 'string' && INTERACTABLE_KIND_SET.has(entry as InteractableKind),
    );
    if (interactables.length > 0) {
      result.interactables = interactables;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

/** 校验并清洗 layeredCells 二维结构。非法行/cell 会被剔除，缺省时返回 undefined。 */
export function normalizeEditableLayeredCells(raw: unknown): (GmMapLayeredCellRecord | null)[][] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  let hasAny = false;
  const rows: (GmMapLayeredCellRecord | null)[][] = raw.map((row) => {
    if (!Array.isArray(row)) {
      return [] as (GmMapLayeredCellRecord | null)[];
    }
    return row.map((cell) => {
      const normalized = normalizeLayeredCell(cell);
      if (normalized) {
        hasAny = true;
      }
      return normalized;
    });
  });
  return hasAny ? rows : undefined;
}

/** 返回地图文档的深拷贝，避免编辑时直接改写原对象。 */
export function cloneMapDocument(document: GmMapDocument): GmMapDocument {
  return clone(document);
}

/** 将编辑器原始 JSON 归一成标准地图文档，并顺手做边界修正。 */
export function normalizeEditableMapDocument(raw: unknown): GmMapDocument {
  const source = preprocessFormatV2(raw) as Partial<GmMapDocument>;
  const mapId = typeof source.id === 'string' ? source.id : '';
  const tiles = Array.isArray(source.tiles)
    ? source.tiles.map((row) => typeof row === 'string' ? row : '')
    : [];
  const width = Number.isInteger(source.width) ? Number(source.width) : 0;
  const height = Number.isInteger(source.height) ? Number(source.height) : 0;
  const layeredRows = buildLayeredRowsFromDocument(source, tiles, width, height);
  const auras = Array.isArray(source.auras) ? source.auras : [];
  const resources = Array.isArray((source as {
  /**
 * resources：resource相关字段。
 */
 resources?: unknown[] }).resources)
    ? (source as {
    /**
 * resources：resource相关字段。
 */
 resources: unknown[] }).resources
    : [];
  const safeZones = Array.isArray((source as {
  /**
 * safeZones：safeZone相关字段。
 */
 safeZones?: unknown[] }).safeZones)
    ? (source as {
    /**
 * safeZones：safeZone相关字段。
 */
 safeZones: unknown[] }).safeZones
    : [];
  const tileEffects = Array.isArray((source as {
    tileEffects?: unknown[];
  }).tileEffects)
    ? (source as {
      tileEffects: unknown[];
    }).tileEffects
    : [];
  const resourceNodeGroups = Array.isArray((source as {
    /**
 * resourceNodeGroups：resourceNodeGroup相关字段。
 */
    resourceNodeGroups?: unknown[];
  }).resourceNodeGroups)
    ? (source as {
      /**
 * resourceNodeGroups：resourceNodeGroup相关字段。
 */
      resourceNodeGroups: unknown[];
    }).resourceNodeGroups
    : [];
  const landmarks = Array.isArray((source as {
  /**
 * landmarks：landmark相关字段。
 */
 landmarks?: unknown[] }).landmarks)
    ? (source as {
    /**
 * landmarks：landmark相关字段。
 */
 landmarks: unknown[] }).landmarks
    : [];
  const portals = Array.isArray(source.portals) ? source.portals : [];
  const npcs = Array.isArray(source.npcs) ? source.npcs : [];
  const monsterSpawns = Array.isArray(source.monsterSpawns) ? source.monsterSpawns : [];
  const mapGroup = resolveMapGroupInfo({
    id: mapId,
    name: typeof source.name === 'string' ? source.name : '',
    parentMapId: typeof source.parentMapId === 'string' ? source.parentMapId : undefined,
    mapGroupId: typeof source.mapGroupId === 'string' ? source.mapGroupId : undefined,
    mapGroupName: typeof source.mapGroupName === 'string' ? source.mapGroupName : undefined,
    mapGroupOrder: Number.isFinite(source.mapGroupOrder) ? Number(source.mapGroupOrder) : undefined,
    mapGroupMemberOrder: Number.isFinite(source.mapGroupMemberOrder) ? Number(source.mapGroupMemberOrder) : undefined,
    floorLevel: Number.isInteger(source.floorLevel) ? Number(source.floorLevel) : undefined,
  });

  return repairEditableMapDocument(syncPortalTiles({
    id: mapId,
    name: typeof source.name === 'string' ? source.name : '',
    mapGroupId: mapGroup.mapGroupId,
    mapGroupName: mapGroup.mapGroupName,
    mapGroupOrder: mapGroup.mapGroupOrder,
    mapGroupMemberOrder: mapGroup.mapGroupMemberOrder,
    width,
    height,
    routeDomain: normalizeMapRouteDomain((source as {
    /**
 * routeDomain：路线Domain相关字段。
 */
 routeDomain?: unknown }).routeDomain) ?? 'system',
    mapLv: Number.isFinite((source as {
    /**
 * mapLv：mapLv相关字段。
 */
 mapLv?: unknown }).mapLv)
      ? Math.max(1, Math.floor(Number((source as {
      /**
 * mapLv：mapLv相关字段。
 */
 mapLv?: number }).mapLv)))
      : undefined,
    parentMapId: typeof source.parentMapId === 'string' ? source.parentMapId : undefined,
    parentOriginX: Number.isInteger(source.parentOriginX) ? Number(source.parentOriginX) : undefined,
    parentOriginY: Number.isInteger(source.parentOriginY) ? Number(source.parentOriginY) : undefined,
    floorLevel: Number.isInteger(source.floorLevel) ? Number(source.floorLevel) : undefined,
    floorName: typeof source.floorName === 'string' ? source.floorName : undefined,
    spaceVisionMode: normalizeMapSpaceVisionMode(source.spaceVisionMode, source.parentMapId),
    description: typeof source.description === 'string' ? source.description : undefined,
    tiles,
    terrainRows: layeredRows.terrainRows?.map((row) => row.slice()),
    surfaceRows: layeredRows.surfaceRows?.map((row) => row.slice()),
    structureRows: layeredRows.structureRows?.map((row) => row.slice()),
    interactableRows: layeredRows.interactableRows?.map((row) => row.map((cell) => cell.slice())),
    portals: portals.map((portal) => {
      const record = portal as GmMapPortalRecord;
      const x = Number(record.x ?? 0);
      const y = Number(record.y ?? 0);
      return {
        id: normalizePortalId(record.id, mapId, x, y),
        targetPortalId: normalizeOptionalTrimmedString(record.targetPortalId),
        direction: normalizePortalDirection(record.direction),
        x,
        y,
        targetMapId: String(record.targetMapId ?? ''),
        targetX: Number(record.targetX ?? 0),
        targetY: Number(record.targetY ?? 0),
        kind: normalizePortalKind(record.kind),
        trigger: normalizePortalTrigger(record.trigger, record.kind),
        routeDomain: normalizePortalRouteDomain(record.routeDomain) ?? 'inherit',
        allowPlayerOverlap: record.allowPlayerOverlap === true,
        hidden: record.hidden === true,
        observeTitle: typeof record.observeTitle === 'string'
          ? record.observeTitle
          : undefined,
        observeDesc: typeof record.observeDesc === 'string'
          ? record.observeDesc
          : undefined,
      };
    }),
    spawnPoint: {
      x: Number((source.spawnPoint as {
      /**
 * x：x相关字段。
 */
 x?: number } | undefined)?.x ?? 0),
      y: Number((source.spawnPoint as {
      /**
 * y：y相关字段。
 */
 y?: number } | undefined)?.y ?? 0),
    },
    time: normalizeMapTimeConfig((source as {
    /**
 * time：时间相关字段。
 */
 time?: unknown }).time),
    auras: auras.map((point) => ({
      x: Number((point as GmMapAuraRecord).x ?? 0),
      y: Number((point as GmMapAuraRecord).y ?? 0),
      value: Number((point as GmMapAuraRecord).value ?? 0),
    })),
    resources: resources.map((point) => ({
      x: Number((point as GmMapResourceRecord).x ?? 0),
      y: Number((point as GmMapResourceRecord).y ?? 0),
      resourceKey: typeof (point as GmMapResourceRecord).resourceKey === 'string'
        ? (point as GmMapResourceRecord).resourceKey.trim()
        : '',
      value: Number((point as GmMapResourceRecord).value ?? 0),
    })),
    safeZones: safeZones.map((zone) => ({
      x: Number((zone as GmMapSafeZoneRecord).x ?? 0),
      y: Number((zone as GmMapSafeZoneRecord).y ?? 0),
      radius: Number((zone as GmMapSafeZoneRecord).radius ?? 0),
    })),
    tileEffects: tileEffects
      .map((effect) => normalizeEditableTileEffectRecord(effect))
      .filter((effect): effect is GmMapTileEffectRecord => Boolean(effect)),
    resourceNodeGroups: resourceNodeGroups
      .map((group) => normalizeEditableResourceNodeGroupRecord(group))
      .filter((group): group is GmMapResourceNodeGroupRecord => Boolean(group)),
    landmarks: landmarks.map((landmark) => ({
      id: String((landmark as GmMapLandmarkRecord).id ?? ''),
      name: String((landmark as GmMapLandmarkRecord).name ?? ''),
      x: Number((landmark as GmMapLandmarkRecord).x ?? 0),
      y: Number((landmark as GmMapLandmarkRecord).y ?? 0),
      desc: typeof (landmark as GmMapLandmarkRecord).desc === 'string'
        ? (landmark as GmMapLandmarkRecord).desc
        : undefined,
      resourceNodeId: normalizeOptionalTrimmedString((landmark as GmMapLandmarkRecord).resourceNodeId),
      container: normalizeEditableContainerRecord((landmark as GmMapLandmarkRecord).container),
    })),
    npcs: npcs.map((npc) => ({
      id: String((npc as GmMapNpcRecord).id ?? ''),
      name: String((npc as GmMapNpcRecord).name ?? ''),
      x: Number((npc as GmMapNpcRecord).x ?? 0),
      y: Number((npc as GmMapNpcRecord).y ?? 0),
      char: String((npc as GmMapNpcRecord).char ?? ''),
      color: String((npc as GmMapNpcRecord).color ?? ''),
      dialogue: String((npc as GmMapNpcRecord).dialogue ?? ''),
      role: typeof (npc as GmMapNpcRecord).role === 'string' ? (npc as GmMapNpcRecord).role : undefined,
      shopItems: Array.isArray((npc as GmMapNpcRecord).shopItems)
        ? ((npc as GmMapNpcRecord).shopItems ?? [])
            .map((item) => normalizeEditableNpcShopItemRecord(item))
            .filter((item): item is GmMapNpcShopItemRecord => Boolean(item))
        : [],
      quests: Array.isArray((npc as GmMapNpcRecord).quests)
        ? ((npc as GmMapNpcRecord).quests ?? [])
            .map((quest) => normalizeEditableQuestRecord(quest))
            .filter((quest): quest is GmMapQuestRecord => Boolean(quest))
        : [],
    })),
    monsterSpawns: monsterSpawns.map((spawn) => ({
      id: String((spawn as GmMapMonsterSpawnRecord).id ?? ''),
      templateId: typeof (spawn as GmMapMonsterSpawnRecord).templateId === 'string'
        ? (spawn as GmMapMonsterSpawnRecord).templateId
        : undefined,
      name: String((spawn as GmMapMonsterSpawnRecord).name ?? ''),
      x: Number((spawn as GmMapMonsterSpawnRecord).x ?? 0),
      y: Number((spawn as GmMapMonsterSpawnRecord).y ?? 0),
      char: String((spawn as GmMapMonsterSpawnRecord).char ?? ''),
      color: String((spawn as GmMapMonsterSpawnRecord).color ?? ''),
      grade: normalizeContainerGrade((spawn as GmMapMonsterSpawnRecord).grade),
      hp: Number((spawn as GmMapMonsterSpawnRecord).hp ?? 0),
      maxHp: Number.isFinite((spawn as GmMapMonsterSpawnRecord).maxHp)
        ? Number((spawn as GmMapMonsterSpawnRecord).maxHp)
        : undefined,
      attack: Number((spawn as GmMapMonsterSpawnRecord).attack ?? 0),
      count: Number.isFinite((spawn as GmMapMonsterSpawnRecord).count)
        ? Number((spawn as GmMapMonsterSpawnRecord).count)
        : undefined,
      radius: Number.isFinite((spawn as GmMapMonsterSpawnRecord).radius)
        ? Number((spawn as GmMapMonsterSpawnRecord).radius)
        : undefined,
      maxAlive: Number.isFinite((spawn as GmMapMonsterSpawnRecord).maxAlive)
        ? Number((spawn as GmMapMonsterSpawnRecord).maxAlive)
        : undefined,
      wanderRadius: Number.isFinite((spawn as GmMapMonsterSpawnRecord).wanderRadius)
        ? Number((spawn as GmMapMonsterSpawnRecord).wanderRadius)
        : undefined,
      aggroRange: Number.isFinite((spawn as GmMapMonsterSpawnRecord).aggroRange)
        ? Number((spawn as GmMapMonsterSpawnRecord).aggroRange)
        : undefined,
      viewRange: Number.isFinite((spawn as GmMapMonsterSpawnRecord).viewRange)
        ? Number((spawn as GmMapMonsterSpawnRecord).viewRange)
        : undefined,
      aggroMode: normalizeMonsterAggroMode((spawn as GmMapMonsterSpawnRecord).aggroMode),
      respawnSec: Number.isFinite((spawn as GmMapMonsterSpawnRecord).respawnSec)
        ? Number((spawn as GmMapMonsterSpawnRecord).respawnSec)
        : undefined,
      respawnTicks: Number.isFinite((spawn as GmMapMonsterSpawnRecord).respawnTicks)
        ? Number((spawn as GmMapMonsterSpawnRecord).respawnTicks)
        : undefined,
      level: Number.isFinite((spawn as GmMapMonsterSpawnRecord).level)
        ? Number((spawn as GmMapMonsterSpawnRecord).level)
        : undefined,
      attrs: (() => {
        const rawAttrs = (spawn as GmMapMonsterSpawnRecord).attrs;
        if (!rawAttrs || typeof rawAttrs !== 'object') {
          return undefined;
        }
        const normalized: Partial<Record<typeof ATTR_KEYS[number], number>> = {};
        for (const key of ATTR_KEYS) {
          const value = (rawAttrs as Record<string, unknown>)[key];
          if (!Number.isFinite(value)) {
            continue;
          }
          normalized[key] = Math.max(0, Number(value));
        }
        return Object.keys(normalized).length > 0 ? normalized : undefined;
      })(),
      statPercents: (() => {
        const rawStatPercents = (spawn as GmMapMonsterSpawnRecord).statPercents;
        if (!rawStatPercents || typeof rawStatPercents !== 'object') {
          return undefined;
        }
        const normalized: NonNullable<GmMapMonsterSpawnRecord['statPercents']> = {};
        for (const [key, value] of Object.entries(rawStatPercents)) {
          if (!Number.isFinite(value)) {
            continue;
          }
          normalized[key as keyof NonNullable<GmMapMonsterSpawnRecord['statPercents']>] = Math.max(0, Number(value));
        }
        return Object.keys(normalized).length > 0 ? normalized : undefined;
      })(),
      skills: (() => {
        const rawSkills = (spawn as GmMapMonsterSpawnRecord).skills;
        if (!Array.isArray(rawSkills)) {
          return undefined;
        }
        const normalized = rawSkills
          .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          .map((entry) => entry.trim());
        return normalized.length > 0 ? normalized : undefined;
      })(),
      tier: (spawn as GmMapMonsterSpawnRecord).tier === 'mortal_blood'
        || (spawn as GmMapMonsterSpawnRecord).tier === 'variant'
        || (spawn as GmMapMonsterSpawnRecord).tier === 'demon_king'
        ? (spawn as GmMapMonsterSpawnRecord).tier
        : undefined,
      expMultiplier: Number.isFinite((spawn as GmMapMonsterSpawnRecord).expMultiplier)
        ? Number((spawn as GmMapMonsterSpawnRecord).expMultiplier)
        : undefined,
      drops: Array.isArray((spawn as GmMapMonsterSpawnRecord).drops)
        ? clone((spawn as GmMapMonsterSpawnRecord).drops)
        : [],
    })),
  }));
}

/** 保存前执行格式与业务完整性检查，返回第一条错误。 */
export function validateEditableMapDocument(document: GmMapDocument): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!document.id.trim()) return '地图 ID 不能为空';
  if (!document.name.trim()) return '地图名称不能为空';
  if (!document.routeDomain) return '地图路网域不能为空';
  if (document.parentMapId?.trim() === document.id.trim()) return '子地图的父地图不能指向自己';
  if (document.spaceVisionMode === 'parent_overlay' && !document.parentMapId?.trim()) {
    return '启用父地图透视时必须填写父地图 ID';
  }
  if (document.spaceVisionMode === 'parent_overlay') {
    if (!Number.isInteger(document.parentOriginX) || !Number.isInteger(document.parentOriginY)) {
      return '启用父地图透视时必须填写父地图对齐坐标';
    }
  }
  if (!Number.isInteger(document.width) || document.width <= 0) return '地图宽度必须为正整数';
  if (!Number.isInteger(document.height) || document.height <= 0) return '地图高度必须为正整数';
  if (document.tiles.length !== document.height) return '地图行数必须与高度一致';

  for (let y = 0; y < document.tiles.length; y += 1) {
    const row = document.tiles[y] ?? '';
    if (row.length !== document.width) {
      return `第 ${y + 1} 行长度与地图宽度不一致`;
    }
    for (const char of row) {
      if (!SUPPORTED_MAP_TILE_CHARS.has(char)) {
        return `地图中存在不支持的地块字符: ${char}`;
      }
    }
  }

  const rowSets: Array<{ label: string; rows: readonly unknown[][] | undefined }> = [
    { label: 'terrainRows', rows: document.terrainRows },
    { label: 'surfaceRows', rows: document.surfaceRows },
    { label: 'structureRows', rows: document.structureRows },
    { label: 'interactableRows', rows: document.interactableRows },
  ];
  for (const rowSet of rowSets) {
    if (!rowSet.rows) {
      continue;
    }
    if (rowSet.rows.length !== document.height) {
      return `${rowSet.label} 行数必须与高度一致`;
    }
    for (let y = 0; y < rowSet.rows.length; y += 1) {
      if (!Array.isArray(rowSet.rows[y]) || rowSet.rows[y]!.length !== document.width) {
        return `${rowSet.label} 第 ${y + 1} 行长度与地图宽度不一致`;
      }
    }
  }

  const ensurePointInBounds = (x: number, y: number, label: string): string | null => {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return `${label} 坐标必须为整数`;
    if (x < 0 || x >= document.width || y < 0 || y >= document.height) {
      return `${label} 越界: (${x}, ${y})`;
    }
    return null;
  };

  const ensureWalkablePoint = (x: number, y: number, label: string): string | null => {
    const boundsError = ensurePointInBounds(x, y, label);
    if (boundsError) return boundsError;
    const type = getComposedTileTypeAt(document, x, y);
    if (!isTileTypeWalkable(type)) {
      return `${label} 必须位于可通行地块`;
    }
    return null;
  };

  const ensureOptionalPoint = (
    mapId: string | undefined,
    x: number | undefined,
    y: number | undefined,
    label: string,
  ): string | null => {
    const hasX = Number.isInteger(x);
    const hasY = Number.isInteger(y);
    if (hasX !== hasY) {
      return `${label} 的 X/Y 坐标必须同时填写`;
    }
    if (!hasX || !hasY) {
      return null;
    }
    if (!mapId?.trim()) {
      return `${label} 填了坐标时必须同时填写地图 ID`;
    }
    if (mapId.trim() !== document.id.trim()) {
      return null;
    }
    return ensureWalkablePoint(x!, y!, label);
  };

  const spawnError = ensureWalkablePoint(document.spawnPoint.x, document.spawnPoint.y, '出生点');
  if (spawnError) return spawnError;

  const portalKeys = new Set<string>();
  const portalIds = new Set<string>();
  for (let index = 0; index < document.portals.length; index += 1) {
    const portal = document.portals[index]!;
    const label = `传送点 ${index + 1}`;
    const error = ensureWalkablePoint(portal.x, portal.y, label);
    if (error) return error;
    if (!portal.id.trim()) return `${label} 的 ID 不能为空`;
    if (portalIds.has(portal.id.trim())) return `${label} 的 ID 与其他传送点重复`;
    portalIds.add(portal.id.trim());
    if (!portal.targetMapId.trim()) return `${label} 的目标地图不能为空`;
    if (!Number.isInteger(portal.targetX) || !Number.isInteger(portal.targetY)) {
      return `${label} 的目标 X/Y 坐标必须为整数`;
    }
    if (portal.direction !== 'one_way' && portal.direction !== 'two_way') {
      return `${label} 的方向必须为单向或双向`;
    }
    if (portal.direction === 'two_way' && !portal.targetPortalId?.trim()) {
      return `${label} 是双向传送点，必须填写目标传送点 ID`;
    }
    if (!portal.routeDomain) return `${label} 的路网域不能为空`;
    const key = `${portal.x},${portal.y}`;
    if (portalKeys.has(key)) return `${label} 与其他传送点坐标重复`;
    portalKeys.add(key);
  }

  for (let index = 0; index < (document.auras?.length ?? 0); index += 1) {
    const point = document.auras![index]!;
    const error = ensurePointInBounds(point.x, point.y, `灵气点 ${index + 1}`);
    if (error) return error;
  }

  const resourcePointKeys = new Set<string>();
  for (let index = 0; index < (document.resources?.length ?? 0); index += 1) {
    const point = document.resources![index]!;
    const label = `气机点 ${index + 1}`;
    const error = ensurePointInBounds(point.x, point.y, label);
    if (error) return error;
    if (!point.resourceKey.trim()) {
      return `${label} 的资源键不能为空`;
    }
    if (!parseQiResourceKey(point.resourceKey.trim())) {
      return `${label} 的资源键无效`;
    }
    const pointKey = `${point.x},${point.y},${point.resourceKey.trim()}`;
    if (resourcePointKeys.has(pointKey)) {
      return `${label} 与其他同类气机点坐标重复`;
    }
    resourcePointKeys.add(pointKey);
  }

  for (let index = 0; index < (document.safeZones?.length ?? 0); index += 1) {
    const zone = document.safeZones![index]!;
    const label = `安全区 ${index + 1}`;
    const error = ensurePointInBounds(zone.x, zone.y, label);
    if (error) return error;
    if (!Number.isInteger(zone.radius) || zone.radius < 0) {
      return `${label} 的半径必须为非负整数`;
    }
  }

  for (let index = 0; index < (document.tileEffects?.length ?? 0); index += 1) {
    const effect = document.tileEffects![index]!;
    const label = `地块效果 ${effect.id || index + 1}`;
    const error = ensurePointInBounds(effect.x, effect.y, label);
    if (error) return error;
    if (!Number.isInteger(effect.width) || effect.width <= 0 || !Number.isInteger(effect.height) || effect.height <= 0) {
      return `${label} 的宽高必须为正整数`;
    }
    const maxX = effect.x + effect.width - 1;
    const maxY = effect.y + effect.height - 1;
    const boundsError = ensurePointInBounds(maxX, maxY, `${label} 的右下角`);
    if (boundsError) return boundsError;
    if (effect.movementCost !== undefined && (!Number.isInteger(effect.movementCost) || effect.movementCost <= 0)) {
      return `${label} 的移动消耗必须为正整数`;
    }
    if (effect.qiDrainPerTick !== undefined && (!Number.isInteger(effect.qiDrainPerTick) || effect.qiDrainPerTick < 0)) {
      return `${label} 的每息灵力消耗必须为非负整数`;
    }
  }

  for (let index = 0; index < (document.resourceNodeGroups?.length ?? 0); index += 1) {
    const group = document.resourceNodeGroups![index]!;
    const label = `资源节点分组 ${group.idPrefix || index + 1}`;
    if (!group.resourceNodeId.trim()) return `${label} 的资源节点 ID 不能为空`;
    if (!group.idPrefix.trim()) return `${label} 的 ID 前缀不能为空`;
    if (!group.name.trim()) return `${label} 的名称不能为空`;
    if (!Array.isArray(group.placements) || group.placements.length <= 0) {
      return `${label} 至少需要一个布点`;
    }
    const placementKeys = new Set<string>();
    for (let placementIndex = 0; placementIndex < group.placements.length; placementIndex += 1) {
      const placement = group.placements[placementIndex]!;
      const placementLabel = `${label} 的布点 ${placementIndex + 1}`;
      const error = ensureWalkablePoint(placement.x, placement.y, placementLabel);
      if (error) return error;
      const placementKey = `${placement.x},${placement.y}`;
      if (placementKeys.has(placementKey)) {
        return `${placementLabel} 与同组其他布点坐标重复`;
      }
      placementKeys.add(placementKey);
    }
  }

  for (let index = 0; index < (document.landmarks?.length ?? 0); index += 1) {
    const landmark = document.landmarks![index]!;
    const label = `地标 ${landmark.id || index + 1}`;
    if (!landmark.id.trim()) return `${label} 的 ID 不能为空`;
    if (!landmark.name.trim()) return `${label} 的名称不能为空`;
    const error = ensurePointInBounds(landmark.x, landmark.y, label);
    if (error) return error;
    if (landmark.resourceNodeId !== undefined && !landmark.resourceNodeId.trim()) {
      return `${label} 的资源节点 ID 不能为空字符串`;
    }
    if (landmark.container) {
      const refreshTicks = landmark.container.refreshTicks;
      if (refreshTicks !== undefined && (!Number.isInteger(refreshTicks) || refreshTicks <= 0)) {
        return `${label} 的容器刷新时间必须为正整数`;
      }
      const refreshTicksMin = landmark.container.refreshTicksMin;
      const refreshTicksMax = landmark.container.refreshTicksMax;
      if (refreshTicksMin !== undefined && (!Number.isInteger(refreshTicksMin) || refreshTicksMin <= 0)) {
        return `${label} 的容器最小刷新时间必须为正整数`;
      }
      if (refreshTicksMax !== undefined && (!Number.isInteger(refreshTicksMax) || refreshTicksMax <= 0)) {
        return `${label} 的容器最大刷新时间必须为正整数`;
      }
      if (
        refreshTicksMin !== undefined
        && refreshTicksMax !== undefined
        && refreshTicksMin > refreshTicksMax
      ) {
        return `${label} 的容器刷新时间范围无效`;
      }
      for (let poolIndex = 0; poolIndex < (landmark.container.lootPools?.length ?? 0); poolIndex += 1) {
        const pool = landmark.container.lootPools![poolIndex]!;
        const poolLabel = `${label} 的随机池 ${poolIndex + 1}`;
        if (pool.rolls !== undefined && (!Number.isInteger(pool.rolls) || pool.rolls <= 0)) {
          return `${poolLabel} 的抽取次数必须为正整数`;
        }
        if (pool.minLevel !== undefined && (!Number.isInteger(pool.minLevel) || pool.minLevel <= 0)) {
          return `${poolLabel} 的最低等级必须为正整数`;
        }
        if (pool.maxLevel !== undefined && (!Number.isInteger(pool.maxLevel) || pool.maxLevel <= 0)) {
          return `${poolLabel} 的最高等级必须为正整数`;
        }
        if (
          pool.minLevel !== undefined
          && pool.maxLevel !== undefined
          && pool.minLevel > pool.maxLevel
        ) {
          return `${poolLabel} 的等级范围无效`;
        }
        if (pool.countMin !== undefined && (!Number.isInteger(pool.countMin) || pool.countMin <= 0)) {
          return `${poolLabel} 的最小数量必须为正整数`;
        }
        if (pool.countMax !== undefined && (!Number.isInteger(pool.countMax) || pool.countMax <= 0)) {
          return `${poolLabel} 的最大数量必须为正整数`;
        }
        if (
          pool.countMin !== undefined
          && pool.countMax !== undefined
          && pool.countMin > pool.countMax
        ) {
          return `${poolLabel} 的数量范围无效`;
        }
      }
    }
  }

  for (let index = 0; index < document.npcs.length; index += 1) {
    const npc = document.npcs[index]!;
    const label = `NPC ${npc.id || index + 1}`;
    if (!npc.id.trim()) return `${label} 的 ID 不能为空`;
    if (!npc.name.trim()) return `${label} 的名称不能为空`;
    if (!npc.char.trim()) return `${label} 的字符不能为空`;
    const error = ensureWalkablePoint(npc.x, npc.y, label);
    if (error) return error;

    const seenShopItemIds = new Set<string>();
    for (let shopIndex = 0; shopIndex < (npc.shopItems?.length ?? 0); shopIndex += 1) {
      const shopItem = npc.shopItems![shopIndex]!;
      const shopLabel = `${label} 的商品 ${shopItem.itemId || shopIndex + 1}`;
      if (!shopItem.itemId.trim()) return `${shopLabel} 的物品 ID 不能为空`;
      const hasStaticPrice = Number.isInteger(shopItem.price) && (shopItem.price ?? 0) > 0;
      const hasPriceFormula = shopItem.priceFormula === 'technique_realm_square_grade';
      if (!hasStaticPrice && !hasPriceFormula) {
        return `${shopLabel} 必须配置正整数价格或合法价格公式`;
      }
      if (seenShopItemIds.has(shopItem.itemId)) {
        return `${label} 的商店商品 ID 不能重复: ${shopItem.itemId}`;
      }
      seenShopItemIds.add(shopItem.itemId);
    }

    for (let questIndex = 0; questIndex < (npc.quests?.length ?? 0); questIndex += 1) {
      const quest = npc.quests![questIndex]!;
      const questLabel = `${label} 的任务 ${quest.id || quest.title || questIndex + 1}`;
      if (!quest.id.trim()) return `${questLabel} 的 ID 不能为空`;
      if (!quest.title.trim()) return `${questLabel} 的标题不能为空`;
      if (!quest.desc.trim()) return `${questLabel} 的描述不能为空`;
      if (!quest.rewardText?.trim() && !quest.rewardItemId?.trim() && (quest.reward?.length ?? 0) <= 0) {
        return `${questLabel} 至少需要奖励文本、奖励物品 ID 或奖励列表中的一种`;
      }

      const targetPointError = ensureOptionalPoint(quest.targetMapId, quest.targetX, quest.targetY, `${questLabel} 的目标地点`);
      if (targetPointError) return targetPointError;
      const submitPointError = ensureOptionalPoint(quest.submitMapId, quest.submitX, quest.submitY, `${questLabel} 的提交地点`);
      if (submitPointError) return submitPointError;

      const objectiveType = quest.objectiveType ?? 'kill';
      switch (objectiveType) {
        case 'kill': {
          const required = quest.required;
          if (!quest.targetMonsterId?.trim()) {
            return `${questLabel} 的击杀目标怪物 ID 不能为空`;
          }
          if (required === undefined || !Number.isInteger(required) || required <= 0) {
            return `${questLabel} 的击杀数量必须为正整数`;
          }
          break;
        }
        case 'talk': {
          if (!quest.targetNpcId?.trim()) {
            return `${questLabel} 的目标 NPC ID 不能为空`;
          }
          if (quest.targetMapId?.trim() === document.id.trim()) {
            const exists = document.npcs.some((entry) => entry.id.trim() === quest.targetNpcId);
            if (!exists) {
              return `${questLabel} 的目标 NPC 不存在于当前地图`;
            }
          }
          break;
        }
        case 'submit_item': {
          if (!quest.requiredItemId?.trim()) {
            return `${questLabel} 的提交物品 ID 不能为空`;
          }
          if (quest.requiredItemCount !== undefined && (!Number.isInteger(quest.requiredItemCount) || quest.requiredItemCount <= 0)) {
            return `${questLabel} 的提交物品数量必须为正整数`;
          }
          if (quest.submitMapId?.trim() === document.id.trim() && quest.submitNpcId?.trim()) {
            const exists = document.npcs.some((entry) => entry.id.trim() === quest.submitNpcId);
            if (!exists) {
              return `${questLabel} 的提交 NPC 不存在于当前地图`;
            }
          }
          break;
        }
        case 'learn_technique': {
          if (!quest.targetTechniqueId?.trim()) {
            return `${questLabel} 的目标功法 ID 不能为空`;
          }
          break;
        }
        case 'realm_progress': {
          const required = quest.required;
          if (required === undefined || !Number.isInteger(required) || required <= 0) {
            return `${questLabel} 的境界推进需求必须为正整数`;
          }
          if (quest.targetRealmStage === undefined || `${quest.targetRealmStage}`.trim().length <= 0) {
            return `${questLabel} 的目标境界阶段不能为空`;
          }
          break;
        }
        case 'realm_stage': {
          if (quest.targetRealmStage === undefined || `${quest.targetRealmStage}`.trim().length <= 0) {
            return `${questLabel} 的目标境界阶段不能为空`;
          }
          break;
        }
        default:
          return `${questLabel} 的任务目标类型非法`;
      }
    }
  }

  for (let index = 0; index < document.monsterSpawns.length; index += 1) {
    const spawn = document.monsterSpawns[index]!;
    const label = `怪物刷新点 ${spawn.id || index + 1}`;
    if (!spawn.id.trim()) return `${label} 的 ID 不能为空`;
    if (!spawn.name?.trim()) return `${label} 的名称不能为空`;
    if (!spawn.char?.trim()) return `${label} 的字符不能为空`;
    const error = ensurePointInBounds(spawn.x, spawn.y, label);
    if (error) return error;
    if (spawn.level !== undefined && (!Number.isInteger(spawn.level) || spawn.level <= 0)) {
      return `${label} 的等级必须为正整数`;
    }
    if (spawn.tier !== undefined && spawn.tier !== 'mortal_blood' && spawn.tier !== 'variant' && spawn.tier !== 'demon_king') {
      return `${label} 的血脉层次非法`;
    }
    if (spawn.attrs) {
      for (const key of ATTR_KEYS) {
        const value = spawn.attrs[key];
        if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
          return `${label} 的 ${key} 必须为非负数`;
        }
      }
    }
    if (spawn.statPercents) {
      for (const [key, value] of Object.entries(spawn.statPercents)) {
        if (!Number.isFinite(value) || value < 0) {
          return `${label} 的 ${key} 百分比必须为非负数`;
        }
      }
    }
    if (spawn.count !== undefined && (!Number.isInteger(spawn.count) || spawn.count <= 0)) {
      return `${label} 的生成数量必须为正整数`;
    }
    if (spawn.radius !== undefined && (!Number.isInteger(spawn.radius) || spawn.radius < 0)) {
      return `${label} 的生成半径必须为非负整数`;
    }
    if (spawn.maxAlive !== undefined && (!Number.isInteger(spawn.maxAlive) || spawn.maxAlive <= 0)) {
      return `${label} 的最大维持数量必须为正整数`;
    }
    if (
      spawn.count !== undefined
      && spawn.maxAlive !== undefined
      && spawn.count > spawn.maxAlive
    ) {
      return `${label} 的生成数量不能大于最大维持数量`;
    }
    if (spawn.wanderRadius !== undefined && (!Number.isInteger(spawn.wanderRadius) || spawn.wanderRadius < 0)) {
      return `${label} 的分布范围必须为非负整数`;
    }
    if (spawn.respawnSec !== undefined && (!Number.isInteger(spawn.respawnSec) || spawn.respawnSec <= 0)) {
      return `${label} 的重生秒数必须为正整数`;
    }
    if (spawn.respawnTicks !== undefined && (!Number.isInteger(spawn.respawnTicks) || spawn.respawnTicks <= 0)) {
      return `${label} 的重生时间必须为正整数`;
    }
  }

  return null;
}

/** 对整批地图执行跨图传送点校验：双向按 ID 严格回指，单向只校验目标落点。 */
export function validateEditableMapPortalReciprocity(documents: readonly GmMapDocument[]): string | null {
  const documentById = new Map<string, GmMapDocument>();
  const portalByMapAndId = new Map<string, Map<string, GmMapPortalRecord>>();

  for (const document of documents) {
    const mapId = document.id.trim();
    if (!mapId) {
      return '地图 ID 不能为空';
    }
    if (documentById.has(mapId)) {
      return `地图 ID 重复: ${mapId}`;
    }
    documentById.set(mapId, document);
    const portalById = new Map<string, GmMapPortalRecord>();
    for (const portal of document.portals) {
      const portalId = portal.id.trim();
      if (!portalId) {
        return `${mapId} 存在未填写 ID 的传送点`;
      }
      if (portalById.has(portalId)) {
        return `${mapId} 的传送点 ID 重复: ${portalId}`;
      }
      portalById.set(portalId, portal);
    }
    portalByMapAndId.set(mapId, portalById);
  }

  for (const document of documents) {
    const sourceMapId = document.id.trim();
    for (let index = 0; index < document.portals.length; index += 1) {
      const portal = document.portals[index]!;
      const label = `${sourceMapId} 的传送点 ${index + 1}`;
      const targetMapId = portal.targetMapId.trim();
      const targetDocument = documentById.get(targetMapId);
      if (!targetDocument) {
        return `${label} 的目标地图不存在: ${targetMapId}`;
      }
      if (
        portal.targetX < 0
        || portal.targetX >= targetDocument.width
        || portal.targetY < 0
        || portal.targetY >= targetDocument.height
      ) {
        return `${label} 的目标坐标越界: ${targetMapId} (${portal.targetX}, ${portal.targetY})`;
      }
      if (portal.direction === 'one_way') {
        continue;
      }
      const targetPortalId = portal.targetPortalId?.trim();
      if (!targetPortalId) {
        return `${label} 是双向传送点，必须填写目标传送点 ID`;
      }
      const targetPortal = portalByMapAndId.get(targetMapId)?.get(targetPortalId);
      if (!targetPortal) {
        return `${label} 的目标传送点不存在: ${targetMapId}.${targetPortalId}`;
      }
      if (targetPortal.x !== portal.targetX || targetPortal.y !== portal.targetY) {
        return `${label} 的目标坐标 ${targetMapId} (${portal.targetX}, ${portal.targetY}) 与目标传送点 ${targetPortalId} 坐标不一致`;
      }
      if (
        targetPortal.direction !== 'two_way'
        || targetPortal.targetMapId.trim() !== sourceMapId
        || targetPortal.targetPortalId?.trim() !== portal.id.trim()
        || targetPortal.targetX !== portal.x
        || targetPortal.targetY !== portal.y
      ) {
        return `${label} 与目标传送点 ${targetMapId}.${targetPortalId} 不是双向 ID 回指`;
      }
    }
  }

  return null;
}

/** 生成地图列表需要的摘要字段。 */
export function buildEditableMapSummary(document: GmMapDocument): GmMapSummary {
  return {
    id: document.id,
    name: document.name,
    mapGroupId: document.mapGroupId,
    mapGroupName: document.mapGroupName,
    mapGroupOrder: document.mapGroupOrder,
    mapGroupMemberOrder: document.mapGroupMemberOrder,
    width: document.width,
    height: document.height,
    description: document.description,
    mapLv: document.mapLv,
    portalCount: document.portals.length,
    npcCount: document.npcs.length,
    monsterSpawnCount: document.monsterSpawns.length,
  };
}

/** 组装地图列表响应体。 */
export function buildEditableMapList(documents: GmMapDocument[]): GmMapListRes {
  return {
    maps: documents
      .map((document) => buildEditableMapSummary(document))
      .sort((left, right) => left.id.localeCompare(right.id, 'zh-CN')),
  };
}

/** 将编辑器内部地图文档序列化为服务器地图文件使用的 format:2 分层字符图。 */
export function serializeEditableMapDocumentToFormatV2(document: GmMapDocument): Record<string, unknown> {
  const normalized = normalizeEditableMapDocument(document);
  const terrain: string[] = [];
  const structure: string[] = [];
  const surface: string[] = [];
  let hasSurface = false;

  for (let y = 0; y < normalized.height; y += 1) {
    let terrainLine = '';
    let structureLine = '';
    let surfaceLine = '';
    for (let x = 0; x < normalized.width; x += 1) {
      const terrainType = normalized.terrainRows?.[y]?.[x] ?? TerrainType.Floor;
      const structureType = normalized.structureRows?.[y]?.[x] ?? null;
      const surfaceType = normalized.surfaceRows?.[y]?.[x] ?? null;
      terrainLine += TERRAIN_TYPE_TO_CHAR.get(terrainType) ?? TERRAIN_TYPE_TO_CHAR.get(TerrainType.Floor) ?? '地';
      structureLine += structureType ? (STRUCTURE_TYPE_TO_CHAR.get(structureType) ?? LAYER_EMPTY_CHAR) : LAYER_EMPTY_CHAR;
      const surfaceChar = surfaceType ? (SURFACE_TYPE_TO_CHAR.get(surfaceType) ?? LAYER_EMPTY_CHAR) : LAYER_EMPTY_CHAR;
      surfaceLine += surfaceChar;
      if (surfaceType) {
        hasSurface = true;
      }
    }
    terrain.push(terrainLine);
    structure.push(structureLine);
    surface.push(surfaceLine);
  }

  const output: Record<string, unknown> = {
    format: 2,
    id: normalized.id,
    name: normalized.name,
  };
  if (normalized.mapGroupId) output.mapGroupId = normalized.mapGroupId;
  if (normalized.mapGroupName) output.mapGroupName = normalized.mapGroupName;
  if (normalized.mapGroupOrder !== undefined) output.mapGroupOrder = normalized.mapGroupOrder;
  if (normalized.mapGroupMemberOrder !== undefined) output.mapGroupMemberOrder = normalized.mapGroupMemberOrder;
  output.width = normalized.width;
  output.height = normalized.height;
  if (normalized.routeDomain) output.routeDomain = normalized.routeDomain;
  if (normalized.mapLv !== undefined) output.mapLv = normalized.mapLv;
  if (normalized.spaceVisionMode) output.spaceVisionMode = normalized.spaceVisionMode;
  if (normalized.parentMapId) output.parentMapId = normalized.parentMapId;
  if (normalized.parentOriginX !== undefined) output.parentOriginX = normalized.parentOriginX;
  if (normalized.parentOriginY !== undefined) output.parentOriginY = normalized.parentOriginY;
  if (normalized.floorLevel !== undefined) output.floorLevel = normalized.floorLevel;
  if (normalized.floorName) output.floorName = normalized.floorName;
  if (normalized.description) output.description = normalized.description;
  output.terrain = terrain;
  output.structure = structure;
  if (hasSurface) output.surface = surface;

  const auras = (normalized.auras ?? []).map((aura) => [aura.x, aura.y, aura.value]);
  if (auras.length > 0) output.auras = auras;
  const monsterSpawns = (normalized.monsterSpawns ?? []).map((spawn) => serializeMonsterSpawnForFormatV2(spawn));
  if (monsterSpawns.length > 0) output.monsterSpawns = monsterSpawns;
  const portals = normalized.portals ?? [];
  if (portals.length > 0) output.portals = portals;
  output.spawnPoint = normalized.spawnPoint;
  if (normalized.time) output.time = normalized.time;
  const resources = normalized.resources ?? [];
  if (resources.length > 0) output.resources = resources;
  const safeZones = normalized.safeZones ?? [];
  if (safeZones.length > 0) output.safeZones = safeZones;
  const landmarks = normalized.landmarks ?? [];
  if (landmarks.length > 0) output.landmarks = landmarks;
  const npcs = normalized.npcs ?? [];
  if (npcs.length > 0) output.npcs = npcs;
  const tileEffects = normalized.tileEffects ?? [];
  if (tileEffects.length > 0) output.tileEffects = tileEffects;
  const resourceNodeGroups = normalized.resourceNodeGroups ?? [];
  if (resourceNodeGroups.length > 0) output.resourceNodeGroups = resourceNodeGroups;

  return output;
}

function serializeMonsterSpawnForFormatV2(spawn: GmMapMonsterSpawnRecord): unknown {
  const persisted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spawn)) {
    if (value === undefined) {
      continue;
    }
    if ((key === 'hp' || key === 'attack') && value === 0) {
      continue;
    }
    if (typeof value === 'string' && value.length === 0) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    persisted[key] = value;
  }
  const keys = Object.keys(persisted);
  const onlySimpleFields = keys.every((key) => key === 'id' || key === 'x' || key === 'y' || key === 'grade')
    && persisted.id !== undefined
    && persisted.x !== undefined
    && persisted.y !== undefined
    && (persisted.grade === undefined || persisted.grade === 'mortal');
  if (onlySimpleFields) {
    return [persisted.x, persisted.y, persisted.id];
  }
  return persisted;
}

/** format:2 预处理：将分层中文字符图解码为内部结构。非 format:2 原样返回。 */
function preprocessFormatV2(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const doc = raw as Record<string, unknown>;
  if (doc.format !== 2) return raw;
  const width = Number(doc.width) || 0;
  const height = Number(doc.height) || 0;
  const terrainCharRows = Array.isArray(doc.terrain) ? doc.terrain as string[] : [];
  const structureCharRows = Array.isArray(doc.structure) ? doc.structure as string[] : [];
  const surfaceCharRows = Array.isArray(doc.surface) ? doc.surface as string[] : undefined;
  const terrainRows: (TerrainType | undefined)[][] = [];
  const structureRows: (StructureType | null)[][] = [];
  const surfaceRows: (SurfaceType | null)[][] = [];
  const tiles: string[] = [];
  for (let y = 0; y < height; y++) {
    const tChars = [...(terrainCharRows[y] ?? '')];
    const sChars = [...(structureCharRows[y] ?? '')];
    const fChars = surfaceCharRows ? [...(surfaceCharRows[y] ?? '')] : [];
    const tRow: (TerrainType | undefined)[] = [];
    const sRow: (StructureType | null)[] = [];
    const fRow: (SurfaceType | null)[] = [];
    let tileRow = '';
    for (let x = 0; x < width; x++) {
      const terrain = TERRAIN_CHAR_TO_TYPE.get(tChars[x] ?? '') ?? TerrainType.Floor;
      const structure = (sChars[x] ?? LAYER_EMPTY_CHAR) === LAYER_EMPTY_CHAR ? null : (STRUCTURE_CHAR_TO_TYPE.get(sChars[x]!) ?? null);
      const surface = (fChars[x] ?? LAYER_EMPTY_CHAR) === LAYER_EMPTY_CHAR ? null : (SURFACE_CHAR_TO_TYPE.get(fChars[x]!) ?? null);
      tRow.push(terrain);
      sRow.push(structure);
      fRow.push(surface);
      tileRow += getMapCharFromTileType(composeTileTypeFromLayers(terrain, surface, structure, []));
    }
    terrainRows.push(tRow);
    structureRows.push(sRow);
    surfaceRows.push(fRow);
    tiles.push(tileRow);
  }
  const auras = Array.isArray(doc.auras) ? (doc.auras as unknown[]).map((e) => Array.isArray(e) && e.length >= 3 ? { x: e[0], y: e[1], value: e[2] } : e) : [];
  const monsterSpawns = Array.isArray(doc.monsterSpawns) ? (doc.monsterSpawns as unknown[]).map((e) => Array.isArray(e) && e.length >= 3 ? { x: e[0], y: e[1], id: e[2] } : e) : [];
  return { ...doc, tiles, terrainRows, structureRows, surfaceRows, auras, monsterSpawns, terrain: undefined, structure: undefined, surface: undefined, format: undefined };
}
