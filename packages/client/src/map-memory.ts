/**
 * 地图记忆持久化。
 * 负责把玩家已经探索过的地块与小地图标记缓存到 localStorage，供下次进入时恢复。
 */

import {
  MAP_MEMORY_FORMAT_VERSION,
  MAP_MEMORY_PERSIST_DEBOUNCE_MS,
  MAP_MEMORY_STORAGE_KEY,
  MapMinimapMarker,
  Tile,
  TileRuntimeResourceView,
  TileType,
  VisibleTile,
  VisibleTilePatch,
} from '@mud/shared';

/** 已探索地块的持久化字段。 */
type RememberedTile = Pick<Tile, 'type' | 'walkable' | 'blocksSight' | 'aura' | 'resources'>;
/** 已探索标记的持久化字段。 */
type RememberedMarker = Pick<MapMinimapMarker, 'id' | 'kind' | 'x' | 'y' | 'label' | 'detail'>;
/** 地图级地块记忆序列化结构。 */
type SerializedMapTileMemory = Record<string, RememberedTile>;
/** 地图级标记记忆序列化结构。 */
type SerializedMapMarkerMemory = Record<string, RememberedMarker>;
/** 单张地图的记忆条目。 */
type SerializedMapMemoryEntry = {
/**
 * tiles：tile相关字段。
 */

  tiles?: SerializedMapTileMemory;  
  /**
 * markers：marker相关字段。
 */

  markers?: SerializedMapMarkerMemory;
};
/** 兼容旧版仅地块记忆的反序列化形状。 */
type SerializedMapMemoryTilesOnlyShape = Record<string, SerializedMapTileMemory>;
/** 全量记忆序列化容器。 */
type SerializedMapMemory = Record<string, SerializedMapMemoryEntry>;
/** 持久化文件外层结构（含版本）。 */
type SerializedMapMemoryEnvelope = {
/**
 * version：version相关字段。
 */

  version: typeof MAP_MEMORY_FORMAT_VERSION;  
  /**
 * maps：地图相关字段。
 */

  maps: SerializedMapMemory;
};

/** 按地图保存已探索地块的内存缓存。 */
const rememberedTilesByMap = new Map<string, Map<string, Tile>>();
/** 按地图保存已记住的小地图标记。 */
const rememberedMarkersByMap = new Map<string, Map<string, MapMinimapMarker>>();
/** 是否已经从本地存储完成过一次加载。 */
let didLoadMemory = false;
/** 是否已经绑定页面生命周期相关的落盘事件。 */
let didBindPersistenceLifecycle = false;
/** localStorage 是否可用；首次探测后缓存结果。 */
let storageAccessible: boolean | null = null;
/** 是否因为异常而停止继续写入本地存储。 */
let persistDisabled = false;
/** 延迟落盘的防抖定时器。 */
let persistTimer: number | null = null;
/** 当前是否存在尚未写回存储的记忆改动。 */
let hasPendingPersist = false;
/** 下一次落盘是否允许因显式删除导致内容大幅缩小。 */
let allowNextPersistShrink = false;

/** 判断值是否为地块枚举中的合法类型。 */
function isTileType(value: unknown): value is TileType {
  return typeof value === 'string' && Object.values(TileType).includes(value as TileType);
}

/** 将地块压缩为持久化记录。 */
function toRememberedTile(tile: Pick<Tile, 'type' | 'walkable' | 'blocksSight' | 'aura' | 'resources'>): Tile {
  return {
    type: tile.type,
    walkable: tile.walkable,
    blocksSight: tile.blocksSight,
    aura: Math.max(0, Math.floor(tile.aura ?? 0)),
    resources: tile.resources?.map((entry) => ({
      key: entry.key,
      label: entry.label,
      value: Math.max(0, Math.floor(entry.value ?? 0)),
      effectiveValue: typeof entry.effectiveValue === 'number' ? Math.max(0, Math.floor(entry.effectiveValue)) : undefined,
      level: typeof entry.level === 'number' ? Math.max(0, Math.floor(entry.level)) : undefined,
      sourceValue: typeof entry.sourceValue === 'number' ? Math.max(0, Math.floor(entry.sourceValue)) : undefined,
    })),
    occupiedBy: null,
    modifiedAt: null,
  };
}

/** 深拷贝地图标记，避免对象引用污染。 */
function cloneMarker(marker: MapMinimapMarker): MapMinimapMarker {
  return JSON.parse(JSON.stringify(marker)) as MapMinimapMarker;
}

/** 校验反序列化后地块记录是否符合持久化结构。 */
function isSerializedRememberedTile(value: unknown): value is RememberedTile {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RememberedTile>;
  return isTileType(candidate.type)
    && typeof candidate.walkable === 'boolean'
    && typeof candidate.blocksSight === 'boolean'
    && (typeof candidate.aura === 'number' || candidate.aura === undefined)
    && (candidate.resources === undefined || isSerializedRememberedResources(candidate.resources));
}

/** 校验反序列化后的资源列表是否符合地块记忆结构。 */
function isSerializedRememberedResources(value: unknown): value is TileRuntimeResourceView[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const candidate = entry as Partial<TileRuntimeResourceView>;
    return typeof candidate.key === 'string'
      && typeof candidate.label === 'string'
      && typeof candidate.value === 'number'
      && (candidate.effectiveValue === undefined || typeof candidate.effectiveValue === 'number')
      && (candidate.level === undefined || typeof candidate.level === 'number')
      && (candidate.sourceValue === undefined || typeof candidate.sourceValue === 'number');
  });
}

/** 校验反序列化后标记记录是否符合持久化结构。 */
function isSerializedRememberedMarker(value: unknown): value is RememberedMarker {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RememberedMarker>;
  return typeof candidate.id === 'string'
    && typeof candidate.kind === 'string'
    && Number.isInteger(candidate.x)
    && Number.isInteger(candidate.y)
    && typeof candidate.label === 'string'
    && (candidate.detail === undefined || typeof candidate.detail === 'string');
}

/** 读取可用的 localStorage；在受限环境下返回 null。 */
function getStorage(): Storage | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof window === 'undefined') {
    return null;
  }
  if (storageAccessible === false) {
    return null;
  }

  try {
    const storage = window.localStorage;
    if (storageAccessible === null) {
      const probeKey = `${MAP_MEMORY_STORAGE_KEY}:probe`;
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      storageAccessible = true;
    }
    return storage;
  } catch (error) {
    storageAccessible = false;
    console.warn('[map-memory] 本地存储不可用，已退回仅内存模式。', error);
    return null;
  }
}

/** 读取并兼容旧版结构的地图记忆封装。 */
function getStoredEnvelope(parsed: unknown): SerializedMapMemoryEnvelope | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Partial<SerializedMapMemoryEnvelope> & Record<string, unknown>;
  if (candidate.version === MAP_MEMORY_FORMAT_VERSION && candidate.maps && typeof candidate.maps === 'object') {
    return {
      version: MAP_MEMORY_FORMAT_VERSION,
      maps: candidate.maps as SerializedMapMemory,
    };
  }

  const candidateVersion = Number(candidate.version);
  if (candidateVersion === 2 || candidate.version === undefined) {
    const tileOnlyMaps = (candidateVersion === 2 && candidate.maps && typeof candidate.maps === 'object'
      ? candidate.maps
      : candidate) as SerializedMapMemoryTilesOnlyShape;
    const maps: SerializedMapMemory = {};
    for (const [mapId, tiles] of Object.entries(tileOnlyMaps)) {
      maps[mapId] = { tiles };
    }
    return {
      version: MAP_MEMORY_FORMAT_VERSION,
      maps,
    };
  }

  return null;
}

/** 将反序列化后的地图记忆导入运行时缓存。 */
function importRememberedMaps(serialized: SerializedMapMemory): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  let hasValidMemory = false;

  for (const [mapId, entry] of Object.entries(serialized)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const rememberedTiles = new Map<string, Tile>();
    for (const [key, rememberedTile] of Object.entries(entry.tiles ?? {})) {
      if (!isSerializedRememberedTile(rememberedTile)) {
        continue;
      }
      rememberedTiles.set(key, toRememberedTile(rememberedTile));
    }
    if (rememberedTiles.size > 0) {
      rememberedTilesByMap.set(mapId, rememberedTiles);
      hasValidMemory = true;
    }

    const rememberedMarkers = new Map<string, MapMinimapMarker>();
    for (const [markerId, rememberedMarker] of Object.entries(entry.markers ?? {})) {
      if (!isSerializedRememberedMarker(rememberedMarker)) {
        continue;
      }
      rememberedMarkers.set(markerId, cloneMarker(rememberedMarker));
    }
    if (rememberedMarkers.size > 0) {
      rememberedMarkersByMap.set(mapId, rememberedMarkers);
      hasValidMemory = true;
    }
  }

  return hasValidMemory;
}

/** 把当前运行时缓存整理成可写回存储的结构。 */
function buildSerializedMapMemory(): SerializedMapMemoryEnvelope {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const maps: SerializedMapMemory = {};
  const mapIds = new Set<string>([
    ...rememberedTilesByMap.keys(),
    ...rememberedMarkersByMap.keys(),
  ]);

  for (const mapId of mapIds) {
    const entry: SerializedMapMemoryEntry = {};
    const tiles = rememberedTilesByMap.get(mapId);
    if (tiles && tiles.size > 0) {
      entry.tiles = {};
      for (const [key, tile] of tiles.entries()) {
        entry.tiles[key] = {
          type: tile.type,
          walkable: tile.walkable,
          blocksSight: tile.blocksSight,
          aura: Math.max(0, Math.floor(tile.aura ?? 0)),
          resources: tile.resources?.map((resource) => ({
            key: resource.key,
            label: resource.label,
            value: Math.max(0, Math.floor(resource.value ?? 0)),
            effectiveValue: typeof resource.effectiveValue === 'number' ? Math.max(0, Math.floor(resource.effectiveValue)) : undefined,
            level: typeof resource.level === 'number' ? Math.max(0, Math.floor(resource.level)) : undefined,
            sourceValue: typeof resource.sourceValue === 'number' ? Math.max(0, Math.floor(resource.sourceValue)) : undefined,
          })),
        };
      }
    }

    const markers = rememberedMarkersByMap.get(mapId);
    if (markers && markers.size > 0) {
      entry.markers = {};
      for (const [key, marker] of markers.entries()) {
        entry.markers[key] = {
          id: marker.id,
          kind: marker.kind,
          x: marker.x,
          y: marker.y,
          label: marker.label,
          detail: marker.detail,
        };
      }
    }

    if (entry.tiles || entry.markers) {
      maps[mapId] = entry;
    }
  }

  return {
    version: MAP_MEMORY_FORMAT_VERSION,
    maps,
  };
}

/** 关闭后续持久化，避免异常数据继续覆盖本地存档。 */
function disablePersistence(reason: string, error?: unknown): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  persistDisabled = true;
  hasPendingPersist = false;
  if (persistTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  console.warn(`[map-memory] ${reason}`, error);
}

/** 立即把当前记忆缓存刷写到本地存储。 */
function flushPersistMemory(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  persistTimer = null;
  if (!hasPendingPersist || persistDisabled) {
    return;
  }

  const storage = getStorage();
  if (!storage) {
    hasPendingPersist = false;
    allowNextPersistShrink = false;
    return;
  }

  try {
    const envelope = buildSerializedMapMemory();
    const nextJson = JSON.stringify(envelope);

    // 如果新内容突然比旧内容小很多，通常意味着恢复失败后的残留数据。
    const existingRaw = storage.getItem(MAP_MEMORY_STORAGE_KEY);
    if (!allowNextPersistShrink && existingRaw && nextJson.length < existingRaw.length * 0.5 && existingRaw.length > 1024) {
      disablePersistence(
        `写入数据异常缩小（${nextJson.length} < ${existingRaw.length} * 0.5），已停止持久化以避免覆盖。`,
      );
      return;
    }

    storage.setItem(MAP_MEMORY_STORAGE_KEY, nextJson);
    hasPendingPersist = false;
    allowNextPersistShrink = false;
  } catch (error) {
    disablePersistence('写入本地地图记忆失败，已停止自动持久化以避免覆盖现有数据。', error);
  }
}

/** 取消防抖并立刻落盘。 */
function flushPersistMemoryNow(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (persistTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  flushPersistMemory();
}

/** 绑定页面隐藏与切页时的自动落盘钩子。 */
function ensurePersistenceLifecycle(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (didBindPersistenceLifecycle || typeof window === 'undefined') {
    return;
  }
  didBindPersistenceLifecycle = true;

  window.addEventListener('pagehide', flushPersistMemoryNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPersistMemoryNow();
    }
  });
}

/** 标记当前记忆有变更，并延迟安排一次落盘。 */
function schedulePersistMemory(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (persistDisabled) {
    return;
  }

  ensurePersistenceLifecycle();
  hasPendingPersist = true;
  if (persistTimer !== null || typeof window === 'undefined') {
    return;
  }

  persistTimer = window.setTimeout(() => {
    flushPersistMemory();
  }, MAP_MEMORY_PERSIST_DEBOUNCE_MS);
}

/** 首次访问时从本地存储加载记忆数据。 */
function ensureMemoryLoaded(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (didLoadMemory) {
    return;
  }
  didLoadMemory = true;

  const storage = getStorage();
  if (!storage) {
    return;
  }

  const raw = storage.getItem(MAP_MEMORY_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const envelope = getStoredEnvelope(parsed);
    if (!envelope) {
      disablePersistence('本地地图记忆格式无法识别，已保留原始数据且停止本次会话持久化。');
      return;
    }
    if (Object.keys(envelope.maps).length === 0) {
      return;
    }
    if (!importRememberedMaps(envelope.maps)) {
      disablePersistence('本地地图记忆中没有可恢复的有效内容，已保留原始数据且停止本次会话持久化。');
      return;
    }
    const loadedMapCount = rememberedTilesByMap.size + rememberedMarkersByMap.size;
    const storedMapCount = Object.keys(envelope.maps).length;
    if (loadedMapCount < storedMapCount) {
      console.warn(`[map-memory] 部分地图记忆未能恢复（已加载 ${loadedMapCount}/${storedMapCount}），已保留原始数据且停止本次会话持久化。`);
      disablePersistence('部分地图记忆未能恢复，停止持久化以避免覆盖。');
      return;
    }
  } catch (error) {
    disablePersistence('解析本地地图记忆失败，已保留原始数据且停止本次会话持久化。', error);
  }
}

/** 对外暴露的记忆持久化触发入口。 */
function persistMemory(): void {
  schedulePersistMemory();
}

/** 显式删除后立即落盘，并允许本次内容大幅缩小。 */
function persistMemoryAfterDelete(): void {
  if (persistDisabled) {
    return;
  }
  ensurePersistenceLifecycle();
  hasPendingPersist = true;
  allowNextPersistShrink = true;
  flushPersistMemoryNow();
}

/** 取出某张地图的已记忆地块缓存。 */
function getRememberedTileMap(mapId: string): Map<string, Tile> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ensureMemoryLoaded();
  let remembered = rememberedTilesByMap.get(mapId);
  if (!remembered) {
    remembered = new Map<string, Tile>();
    rememberedTilesByMap.set(mapId, remembered);
  }
  return remembered;
}

/** 取出某张地图的已记忆小地图标记缓存。 */
function getRememberedMarkerMap(mapId: string): Map<string, MapMinimapMarker> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ensureMemoryLoaded();
  let remembered = rememberedMarkersByMap.get(mapId);
  if (!remembered) {
    remembered = new Map<string, MapMinimapMarker>();
    rememberedMarkersByMap.set(mapId, remembered);
  }
  return remembered;
}

/** 比较两个标记是否在记忆语义上等价。 */
function areMarkersEqual(left: MapMinimapMarker | undefined, right: MapMinimapMarker): boolean {
  return !!left
    && left.kind === right.kind
    && left.x === right.x
    && left.y === right.y
    && left.label === right.label
    && left.detail === right.detail;
}

/** 将指定地图的记忆地块填充到 tileCache 中，用于初始化时恢复已探索区域 */
export function hydrateTileCacheFromMemory(mapId: string, tileCache: Map<string, Tile>): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const remembered = getRememberedTileMap(mapId);
  for (const [key, tile] of remembered.entries()) {
    tileCache.set(key, { ...tile });
  }
}

/** 获取指定地图所有已记忆地块的克隆副本 */
export function getRememberedTiles(mapId: string): Map<string, Tile> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const remembered = getRememberedTileMap(mapId);
  const cloned = new Map<string, Tile>();
  for (const [key, tile] of remembered.entries()) {
    cloned.set(key, { ...tile });
  }
  return cloned;
}

/** 获取指定地图所有已记忆的小地图标记 */
export function getRememberedMarkers(mapId: string): MapMinimapMarker[] {
  const remembered = getRememberedMarkerMap(mapId);
  return [...remembered.values()].map((marker) => cloneMarker(marker));
}

/** 列出所有有记忆数据的地图 ID */
export function listRememberedMapIds(): string[] {
  ensureMemoryLoaded();
  return [...new Set([
    ...rememberedTilesByMap.keys(),
    ...rememberedMarkersByMap.keys(),
  ])].sort();
}

/** 记录当前视野内可见地块的记忆内容。 */
export function rememberVisibleTiles(
  mapId: string,
  tiles: VisibleTile[][],
  originX: number,
  originY: number,
): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const remembered = getRememberedTileMap(mapId);
  let changed = false;

  for (let row = 0; row < tiles.length; row += 1) {
    for (let col = 0; col < tiles[row].length; col += 1) {
      const tile = tiles[row][col];
      if (!tile) {
        continue;
      }
      const key = `${originX + col},${originY + row}`;
      const nextTile = toRememberedTile(tile);
      const previous = remembered.get(key);
      if (
        previous?.type === nextTile.type
        && previous.walkable === nextTile.walkable
        && previous.blocksSight === nextTile.blocksSight
        && previous.aura === nextTile.aura
      ) {
        continue;
      }
      remembered.set(key, nextTile);
      changed = true;
    }
  }

  if (changed) {
    persistMemory();
  }
}

/** 记录增量地块 patch，只保留实际可见到的内容。 */
export function rememberVisibleTilePatches(mapId: string, patches: VisibleTilePatch[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (patches.length === 0) {
    return;
  }

  const remembered = getRememberedTileMap(mapId);
  let changed = false;

  for (const patch of patches) {
    if (!patch.tile) {
      continue;
    }

    const key = `${patch.x},${patch.y}`;
    const nextTile = toRememberedTile(patch.tile);
    const previous = remembered.get(key);
    if (
      previous?.type === nextTile.type
      && previous.walkable === nextTile.walkable
      && previous.blocksSight === nextTile.blocksSight
      && previous.aura === nextTile.aura
    ) {
      continue;
    }

    remembered.set(key, nextTile);
    changed = true;
  }

  if (changed) {
    persistMemory();
  }
}

/** 记录当前可见的小地图标记。 */
export function rememberVisibleMarkers(mapId: string, markers: MapMinimapMarker[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (markers.length === 0) {
    return;
  }

  const remembered = getRememberedMarkerMap(mapId);
  let changed = false;

  for (const marker of markers) {
    if (!marker.id || !marker.label) {
      continue;
    }
    const previous = remembered.get(marker.id);
    if (areMarkersEqual(previous, marker)) {
      continue;
    }
    remembered.set(marker.id, cloneMarker(marker));
    changed = true;
  }

  if (changed) {
    persistMemory();
  }
}

/** 删除指定地图的全部记忆数据。 */
export function deleteRememberedMap(mapId: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ensureMemoryLoaded();
  const removedTiles = rememberedTilesByMap.delete(mapId);
  const removedMarkers = rememberedMarkersByMap.delete(mapId);
  if (removedTiles || removedMarkers) {
    persistMemoryAfterDelete();
  }
}

/** 删除所有地图的本地记忆数据。 */
export function deleteAllRememberedMaps(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ensureMemoryLoaded();
  const hadMemory = rememberedTilesByMap.size > 0 || rememberedMarkersByMap.size > 0;
  rememberedTilesByMap.clear();
  rememberedMarkersByMap.clear();
  if (hadMemory) {
    persistMemoryAfterDelete();
  }
}
