/**
 * 地图记忆持久化 —— 将玩家已探索的地块和标记缓存到 localStorage，跨会话保留
 */

import { MapMinimapMarker, Tile, TileType, VisibleTile } from '@mud/shared';

const MAP_MEMORY_STORAGE_KEY = 'mud:map-memory:v2';
const MAP_MEMORY_FORMAT_VERSION = 3;
const MAP_MEMORY_PERSIST_DEBOUNCE_MS = 1500;

type RememberedTile = Pick<Tile, 'type' | 'walkable' | 'blocksSight' | 'aura'>;
type RememberedMarker = Pick<MapMinimapMarker, 'id' | 'kind' | 'x' | 'y' | 'label' | 'detail'>;
type SerializedMapTileMemory = Record<string, RememberedTile>;
type SerializedMapMarkerMemory = Record<string, RememberedMarker>;
type SerializedMapMemoryEntry = {
  tiles?: SerializedMapTileMemory;
  markers?: SerializedMapMarkerMemory;
};
type SerializedLegacyMapMemory = Record<string, SerializedMapTileMemory>;
type SerializedMapMemory = Record<string, SerializedMapMemoryEntry>;
type SerializedMapMemoryEnvelope = {
  version: typeof MAP_MEMORY_FORMAT_VERSION;
  maps: SerializedMapMemory;
};

const rememberedTilesByMap = new Map<string, Map<string, Tile>>();
const rememberedMarkersByMap = new Map<string, Map<string, MapMinimapMarker>>();
let didLoadMemory = false;
let didBindPersistenceLifecycle = false;
let storageAccessible: boolean | null = null;
let persistDisabled = false;
let persistTimer: number | null = null;
let hasPendingPersist = false;

function isTileType(value: unknown): value is TileType {
  return typeof value === 'string' && Object.values(TileType).includes(value as TileType);
}

function toRememberedTile(tile: Pick<Tile, 'type' | 'walkable' | 'blocksSight' | 'aura'>): Tile {
  return {
    type: tile.type,
    walkable: tile.walkable,
    blocksSight: tile.blocksSight,
    aura: Math.max(0, Math.floor(tile.aura ?? 0)),
    occupiedBy: null,
    modifiedAt: null,
  };
}

function cloneMarker(marker: MapMinimapMarker): MapMinimapMarker {
  return JSON.parse(JSON.stringify(marker)) as MapMinimapMarker;
}

function isSerializedRememberedTile(value: unknown): value is RememberedTile {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<RememberedTile>;
  return isTileType(candidate.type)
    && typeof candidate.walkable === 'boolean'
    && typeof candidate.blocksSight === 'boolean'
    && (typeof candidate.aura === 'number' || candidate.aura === undefined);
}

function isSerializedRememberedMarker(value: unknown): value is RememberedMarker {
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

function getStorage(): Storage | null {
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

function getStoredEnvelope(parsed: unknown): SerializedMapMemoryEnvelope | null {
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
    const legacyMaps = (candidateVersion === 2 && candidate.maps && typeof candidate.maps === 'object'
      ? candidate.maps
      : candidate) as SerializedLegacyMapMemory;
    const maps: SerializedMapMemory = {};
    for (const [mapId, tiles] of Object.entries(legacyMaps)) {
      maps[mapId] = { tiles };
    }
    return {
      version: MAP_MEMORY_FORMAT_VERSION,
      maps,
    };
  }

  return null;
}

function importRememberedMaps(serialized: SerializedMapMemory): boolean {
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

function buildSerializedMapMemory(): SerializedMapMemoryEnvelope {
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

function disablePersistence(reason: string, error?: unknown): void {
  persistDisabled = true;
  hasPendingPersist = false;
  if (persistTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  console.warn(`[map-memory] ${reason}`, error);
}

function flushPersistMemory(): void {
  persistTimer = null;
  if (!hasPendingPersist || persistDisabled) {
    return;
  }

  const storage = getStorage();
  if (!storage) {
    hasPendingPersist = false;
    return;
  }

  try {
    const envelope = buildSerializedMapMemory();
    const nextJson = JSON.stringify(envelope);

    // 安全检查：如果即将写入的数据比已有数据小很多，可能是加载失败后的残留写入
    const existingRaw = storage.getItem(MAP_MEMORY_STORAGE_KEY);
    if (existingRaw && nextJson.length < existingRaw.length * 0.5 && existingRaw.length > 1024) {
      disablePersistence(
        `写入数据异常缩小（${nextJson.length} < ${existingRaw.length} * 0.5），已停止持久化以避免覆盖。`,
      );
      return;
    }

    storage.setItem(MAP_MEMORY_STORAGE_KEY, nextJson);
    hasPendingPersist = false;
  } catch (error) {
    disablePersistence('写入本地地图记忆失败，已停止自动持久化以避免覆盖现有数据。', error);
  }
}

function flushPersistMemoryNow(): void {
  if (persistTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  flushPersistMemory();
}

function ensurePersistenceLifecycle(): void {
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

function schedulePersistMemory(): void {
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

function ensureMemoryLoaded(): void {
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

function persistMemory(): void {
  schedulePersistMemory();
}

function getRememberedTileMap(mapId: string): Map<string, Tile> {
  ensureMemoryLoaded();
  let remembered = rememberedTilesByMap.get(mapId);
  if (!remembered) {
    remembered = new Map<string, Tile>();
    rememberedTilesByMap.set(mapId, remembered);
  }
  return remembered;
}

function getRememberedMarkerMap(mapId: string): Map<string, MapMinimapMarker> {
  ensureMemoryLoaded();
  let remembered = rememberedMarkersByMap.get(mapId);
  if (!remembered) {
    remembered = new Map<string, MapMinimapMarker>();
    rememberedMarkersByMap.set(mapId, remembered);
  }
  return remembered;
}

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
  const remembered = getRememberedTileMap(mapId);
  for (const [key, tile] of remembered.entries()) {
    tileCache.set(key, { ...tile });
  }
}

/** 获取指定地图所有已记忆地块的克隆副本 */
export function getRememberedTiles(mapId: string): Map<string, Tile> {
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

/** 将当前视野内的地块写入记忆，有变化时触发持久化 */
export function rememberVisibleTiles(
  mapId: string,
  tiles: VisibleTile[][],
  originX: number,
  originY: number,
): void {
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

/** 将当前可见的小地图标记写入记忆 */
export function rememberVisibleMarkers(mapId: string, markers: MapMinimapMarker[]): void {
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

/** 删除指定地图的所有记忆数据 */
export function deleteRememberedMap(mapId: string): void {
  ensureMemoryLoaded();
  const removedTiles = rememberedTilesByMap.delete(mapId);
  const removedMarkers = rememberedMarkersByMap.delete(mapId);
  if (removedTiles || removedMarkers) {
    persistMemory();
  }
}
