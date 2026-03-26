import { DEFAULT_MAP_TIME_CONFIG } from './constants';
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
  GmMapSummary,
} from './protocol';
import { getTileTypeFromMapChar, isTileTypeWalkable } from './terrain';
import {
  MapSpaceVisionMode,
  MapRouteDomain,
  MapTimeConfig,
  MonsterAggroMode,
  PortalKind,
  PortalRouteDomain,
  PortalTrigger,
  QuestLine,
  QuestObjectiveType,
  TechniqueGrade,
  TileType,
} from './types';

const SUPPORTED_MAP_TILE_CHARS = new Set(['#', '.', '=', ':', 'P', 'S', '+', 'W', 'B', ',', '^', ';', '%', '~', 'T', 'o', 'L']);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePortalKind(kind: unknown): PortalKind {
  return kind === 'stairs' ? 'stairs' : 'portal';
}

function normalizePortalTrigger(trigger: unknown, kind?: unknown): PortalTrigger {
  if (trigger === 'manual' || trigger === 'auto') {
    return trigger;
  }
  return kind === 'stairs' ? 'auto' : 'manual';
}

function normalizeMapSpaceVisionMode(mode: unknown, parentMapId?: unknown): MapSpaceVisionMode {
  if (mode === 'parent_overlay' && typeof parentMapId === 'string' && parentMapId.trim()) {
    return 'parent_overlay';
  }
  return 'isolated';
}

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

function normalizeEditableNpcShopItemRecord(raw: unknown): GmMapNpcShopItemRecord | null {
  const item = raw as Partial<GmMapNpcShopItemRecord>;
  if (typeof item.itemId !== 'string' || !Number.isFinite(item.price)) {
    return null;
  }
  return {
    itemId: item.itemId,
    price: Number(item.price),
  };
}

function normalizeOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  return Number.isFinite(value) ? Math.floor(Number(value)) : undefined;
}

function normalizeQuestLine(value: unknown): QuestLine | undefined {
  return value === 'main' || value === 'side' || value === 'daily' || value === 'encounter'
    ? value
    : undefined;
}

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

function normalizeMapRouteDomain(value: unknown): MapRouteDomain | undefined {
  return value === 'system' || value === 'sect' || value === 'personal' || value === 'dynamic'
    ? value
    : undefined;
}

function normalizePortalRouteDomain(value: unknown): PortalRouteDomain | undefined {
  return value === 'inherit' || value === 'system' || value === 'sect' || value === 'personal' || value === 'dynamic'
    ? value
    : undefined;
}

function normalizeMonsterAggroMode(value: unknown): MonsterAggroMode | undefined {
  return value === 'always' || value === 'retaliate' || value === 'day_only' || value === 'night_only'
    ? value
    : undefined;
}

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

function repairEditableMapDocument(document: GmMapDocument): GmMapDocument {
  return {
    ...document,
    spawnPoint: resolveNearestWalkablePointInDocument(document, document.spawnPoint) ?? document.spawnPoint,
  };
}

export function cloneMapDocument(document: GmMapDocument): GmMapDocument {
  return clone(document);
}

export function normalizeEditableMapDocument(raw: unknown): GmMapDocument {
  const source = raw as Partial<GmMapDocument>;
  const tiles = Array.isArray(source.tiles)
    ? source.tiles.map((row) => typeof row === 'string' ? row : '')
    : [];
  const auras = Array.isArray(source.auras) ? source.auras : [];
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
    landmarks: landmarks.map((landmark) => ({
      id: String((landmark as GmMapLandmarkRecord).id ?? ''),
      name: String((landmark as GmMapLandmarkRecord).name ?? ''),
      x: Number((landmark as GmMapLandmarkRecord).x ?? 0),
      y: Number((landmark as GmMapLandmarkRecord).y ?? 0),
      desc: typeof (landmark as GmMapLandmarkRecord).desc === 'string'
        ? (landmark as GmMapLandmarkRecord).desc
        : undefined,
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
      expMultiplier: Number.isFinite((spawn as GmMapMonsterSpawnRecord).expMultiplier)
        ? Number((spawn as GmMapMonsterSpawnRecord).expMultiplier)
        : undefined,
      drops: Array.isArray((spawn as GmMapMonsterSpawnRecord).drops)
        ? clone((spawn as GmMapMonsterSpawnRecord).drops)
        : [],
    })),
  }));
}

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

  for (let index = 0; index < (document.landmarks?.length ?? 0); index += 1) {
    const landmark = document.landmarks![index]!;
    const label = `地标 ${landmark.id || index + 1}`;
    if (!landmark.id.trim()) return `${label} 的 ID 不能为空`;
    if (!landmark.name.trim()) return `${label} 的名称不能为空`;
    const error = ensurePointInBounds(landmark.x, landmark.y, label);
    if (error) return error;
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
      if (!Number.isInteger(shopItem.price) || shopItem.price <= 0) {
        return `${shopLabel} 的价格必须为正整数`;
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
    if (!spawn.name.trim()) return `${label} 的名称不能为空`;
    if (!spawn.char.trim()) return `${label} 的字符不能为空`;
    const error = ensurePointInBounds(spawn.x, spawn.y, label);
    if (error) return error;
  }

  return null;
}

export function buildEditableMapSummary(document: GmMapDocument): GmMapSummary {
  return {
    id: document.id,
    name: document.name,
    width: document.width,
    height: document.height,
    description: document.description,
    dangerLevel: document.dangerLevel,
    recommendedRealm: document.recommendedRealm,
    portalCount: document.portals.length,
    npcCount: document.npcs.length,
    monsterSpawnCount: document.monsterSpawns.length,
  };
}

export function buildEditableMapList(documents: GmMapDocument[]): GmMapListRes {
  return {
    maps: documents
      .map((document) => buildEditableMapSummary(document))
      .sort((left, right) => left.id.localeCompare(right.id, 'zh-CN')),
  };
}
