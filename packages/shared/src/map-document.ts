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
  GmMapListRes,
  GmMapMonsterSpawnRecord,
  GmMapNpcRecord,
  GmMapNpcShopItemRecord,
  GmMapPortalRecord,
  GmMapQuestRecord,
  GmMapResourceRecord,
  GmMapSafeZoneRecord,
  GmMapSummary,
} from './api-contracts';
import { parseQiResourceKey } from './qi';
import { getTileTypeFromMapChar, isTileTypeWalkable } from './terrain';
import { HOUSE_DECOR_TILE_MAP_CHARS } from './constants/gameplay/house-terrain';
import {
  MapSpaceVisionMode,
  MapRouteDomain,
  MapTimeConfig,
  MonsterAggroMode,
  PortalKind,
  PortalRouteDomain,
  PortalTrigger,
  TileType,
} from './world-core-types';
import { QuestLine, QuestObjectiveType } from './quest-types';
import { TechniqueGrade } from './cultivation-types';

/** 允许出现在地图文档里的地块字符全集。 */
const SUPPORTED_MAP_TILE_CHARS = new Set(['#', '.', '=', ':', 'P', 'S', '+', 'W', 'B', ',', '^', '崖', ';', '%', '~', '云', '霞', '空', 'T', '竹', 'o', 'L', '铁', '刃', ...HOUSE_DECOR_TILE_MAP_CHARS]);

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
  if (trigger === 'manual' || trigger === 'auto') {
    return trigger;
  }
  return kind === 'stairs' ? 'auto' : 'manual';
}

/** 只有配置了父图时才允许使用父图叠加视野。 */
function normalizeMapSpaceVisionMode(mode: unknown, parentMapId?: unknown): MapSpaceVisionMode {
  if (mode === 'parent_overlay' && typeof parentMapId === 'string' && parentMapId.trim()) {
    return 'parent_overlay';
  }
  return 'isolated';
}

/** 将容器品质限制在合法枚举内，未知值回落到最低档。 */
function normalizeContainerGrade(grade: unknown): TechniqueGrade {
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

/** 去掉空白字符串，空内容统一转成 undefined。 */
function normalizeOptionalTrimmedString(value: unknown): string | undefined {
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
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const container = input as GmMapContainerRecord;
  return {
    grade: normalizeContainerGrade(container.grade),
    refreshTicks: Number.isFinite(container.refreshTicks) ? Number(container.refreshTicks) : undefined,
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
  const rows = document.tiles.map((row) => [...row].map((char) => (char === 'P' || char === 'S') ? '.' : char));
  for (const portal of document.portals) {
    if (portal.hidden) continue;
    if (!rows[portal.y]?.[portal.x]) continue;
    rows[portal.y]![portal.x] = portal.kind === 'stairs' ? 'S' : 'P';
  }
  return {
    ...document,
    tiles: rows.map((row) => row.join('')),
  };
}

/** 在出生点落在不可通行格时，向外搜索最近可走坐标作为兜底。 */
function resolveNearestWalkablePointInDocument(
  document: GmMapDocument,
  origin: { x: number; y: number },
): { x: number; y: number } | null {
  if (document.width <= 0 || document.height <= 0) {
    return null;
  }

  const clamped = {
    x: Math.min(document.width - 1, Math.max(0, Math.floor(origin.x))),
    y: Math.min(document.height - 1, Math.max(0, Math.floor(origin.y))),
  };

  let portalFallback: { x: number; y: number } | null = null;
  for (let radius = 0; radius <= Math.max(document.width, document.height); radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (!isOffsetInRange(dx, dy, radius)) continue;
        const x = clamped.x + dx;
        const y = clamped.y + dy;
        if (x < 0 || x >= document.width || y < 0 || y >= document.height) continue;
        const type = getTileTypeFromMapChar(document.tiles[y]?.[x] ?? '#');
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

/** 返回地图文档的深拷贝，避免编辑时直接改写原对象。 */
export function cloneMapDocument(document: GmMapDocument): GmMapDocument {
  return clone(document);
}

/** 将编辑器原始 JSON 归一成标准地图文档，并顺手做边界修正。 */
export function normalizeEditableMapDocument(raw: unknown): GmMapDocument {
  const source = raw as Partial<GmMapDocument>;
  const tiles = Array.isArray(source.tiles)
    ? source.tiles.map((row) => typeof row === 'string' ? row : '')
    : [];
  const auras = Array.isArray(source.auras) ? source.auras : [];
  const resources = Array.isArray((source as { resources?: unknown[] }).resources)
    ? (source as { resources: unknown[] }).resources
    : [];
  const safeZones = Array.isArray((source as { safeZones?: unknown[] }).safeZones)
    ? (source as { safeZones: unknown[] }).safeZones
    : [];
  const landmarks = Array.isArray((source as { landmarks?: unknown[] }).landmarks)
    ? (source as { landmarks: unknown[] }).landmarks
    : [];
  const portals = Array.isArray(source.portals) ? source.portals : [];
  const npcs = Array.isArray(source.npcs) ? source.npcs : [];
  const monsterSpawns = Array.isArray(source.monsterSpawns) ? source.monsterSpawns : [];

  return repairEditableMapDocument(syncPortalTiles({
    id: typeof source.id === 'string' ? source.id : '',
    name: typeof source.name === 'string' ? source.name : '',
    width: Number.isInteger(source.width) ? Number(source.width) : 0,
    height: Number.isInteger(source.height) ? Number(source.height) : 0,
    routeDomain: normalizeMapRouteDomain((source as { routeDomain?: unknown }).routeDomain) ?? 'system',
    terrainProfileId: typeof (source as { terrainProfileId?: unknown }).terrainProfileId === 'string'
      ? (source as { terrainProfileId: string }).terrainProfileId
      : undefined,
    terrainRealmLv: Number.isFinite((source as { terrainRealmLv?: unknown }).terrainRealmLv)
      ? Math.max(1, Math.floor(Number((source as { terrainRealmLv?: number }).terrainRealmLv)))
      : undefined,
    parentMapId: typeof source.parentMapId === 'string' ? source.parentMapId : undefined,
    parentOriginX: Number.isInteger(source.parentOriginX) ? Number(source.parentOriginX) : undefined,
    parentOriginY: Number.isInteger(source.parentOriginY) ? Number(source.parentOriginY) : undefined,
    floorLevel: Number.isInteger(source.floorLevel) ? Number(source.floorLevel) : undefined,
    floorName: typeof source.floorName === 'string' ? source.floorName : undefined,
    spaceVisionMode: normalizeMapSpaceVisionMode(source.spaceVisionMode, source.parentMapId),
    description: typeof source.description === 'string' ? source.description : undefined,
    dangerLevel: Number.isFinite(source.dangerLevel) ? Number(source.dangerLevel) : undefined,
    recommendedRealm: typeof source.recommendedRealm === 'string' ? source.recommendedRealm : undefined,
    tiles,
    portals: portals.map((portal) => ({
      x: Number((portal as GmMapPortalRecord).x ?? 0),
      y: Number((portal as GmMapPortalRecord).y ?? 0),
      targetMapId: String((portal as GmMapPortalRecord).targetMapId ?? ''),
      targetX: Number((portal as GmMapPortalRecord).targetX ?? 0),
      targetY: Number((portal as GmMapPortalRecord).targetY ?? 0),
      kind: normalizePortalKind((portal as GmMapPortalRecord).kind),
      trigger: normalizePortalTrigger((portal as GmMapPortalRecord).trigger, (portal as GmMapPortalRecord).kind),
      routeDomain: normalizePortalRouteDomain((portal as GmMapPortalRecord).routeDomain) ?? 'inherit',
      allowPlayerOverlap: (portal as GmMapPortalRecord).allowPlayerOverlap === true,
      hidden: (portal as GmMapPortalRecord).hidden === true,
      observeTitle: typeof (portal as GmMapPortalRecord).observeTitle === 'string'
        ? (portal as GmMapPortalRecord).observeTitle
        : undefined,
      observeDesc: typeof (portal as GmMapPortalRecord).observeDesc === 'string'
        ? (portal as GmMapPortalRecord).observeDesc
        : undefined,
    })),
    spawnPoint: {
      x: Number((source.spawnPoint as { x?: number } | undefined)?.x ?? 0),
      y: Number((source.spawnPoint as { y?: number } | undefined)?.y ?? 0),
    },
    time: normalizeMapTimeConfig((source as { time?: unknown }).time),
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
    const type = getTileTypeFromMapChar(document.tiles[y]![x]!);
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
  for (let index = 0; index < document.portals.length; index += 1) {
    const portal = document.portals[index]!;
    const label = `传送点 ${index + 1}`;
    const error = ensureWalkablePoint(portal.x, portal.y, label);
    if (error) return error;
    if (!portal.targetMapId.trim()) return `${label} 的目标地图不能为空`;
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

/** 生成地图列表需要的摘要字段。 */
export function buildEditableMapSummary(document: GmMapDocument): GmMapSummary {
  return {
    id: document.id,
    name: document.name,
    width: document.width,
    height: document.height,
    description: document.description,
    terrainRealmLv: document.terrainRealmLv,
    dangerLevel: document.dangerLevel,
    recommendedRealm: document.recommendedRealm,
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
