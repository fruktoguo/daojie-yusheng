import { Tile, TileType, VisibleTile } from '@mud/shared';

const MAP_MEMORY_STORAGE_KEY = 'mud:map-memory:v2';
const MAP_MEMORY_FORMAT_VERSION = 2;
const MAP_MEMORY_PERSIST_DEBOUNCE_MS = 1500;

type RememberedTile = Pick<Tile, 'type' | 'walkable' | 'blocksSight' | 'aura'>;
type SerializedMapMemory = Record<string, Record<string, RememberedTile>>;
type SerializedMapMemoryEnvelope = {
  version: typeof MAP_MEMORY_FORMAT_VERSION;
  maps: SerializedMapMemory;
};

const rememberedMaps = new Map<string, Map<string, Tile>>();
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

  return {
    version: MAP_MEMORY_FORMAT_VERSION,
    maps: candidate as SerializedMapMemory,
  };
}

function importRememberedMaps(serialized: SerializedMapMemory): boolean {
  let hasValidTile = false;

  for (const [mapId, entries] of Object.entries(serialized)) {
    if (!entries || typeof entries !== 'object') {
      continue;
    }
    const rememberedTiles = new Map<string, Tile>();
    for (const [key, rememberedTile] of Object.entries(entries)) {
      if (!isSerializedRememberedTile(rememberedTile)) {
        continue;
      }
      rememberedTiles.set(key, toRememberedTile(rememberedTile));
    }
    if (rememberedTiles.size > 0) {
      rememberedMaps.set(mapId, rememberedTiles);
      hasValidTile = true;
    }
  }

  return hasValidTile;
}

function buildSerializedMapMemory(): SerializedMapMemoryEnvelope {
  const maps: SerializedMapMemory = {};
  for (const [mapId, entries] of rememberedMaps.entries()) {
    if (entries.size === 0) {
      continue;
    }
    maps[mapId] = {};
    for (const [key, tile] of entries.entries()) {
      maps[mapId][key] = {
        type: tile.type,
        walkable: tile.walkable,
        blocksSight: tile.blocksSight,
        aura: Math.max(0, Math.floor(tile.aura ?? 0)),
      };
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
    storage.setItem(MAP_MEMORY_STORAGE_KEY, JSON.stringify(buildSerializedMapMemory()));
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
      console.warn('[map-memory] 本地地图记忆中没有可恢复的有效格子，已跳过加载。');
    }
  } catch (error) {
    disablePersistence('解析本地地图记忆失败，已保留原始数据且停止本次会话持久化。', error);
  }
}

function persistMemory(): void {
  schedulePersistMemory();
}

function getRememberedMap(mapId: string): Map<string, Tile> {
  ensureMemoryLoaded();
  let remembered = rememberedMaps.get(mapId);
  if (!remembered) {
    remembered = new Map<string, Tile>();
    rememberedMaps.set(mapId, remembered);
  }
  return remembered;
}

export function hydrateTileCacheFromMemory(mapId: string, tileCache: Map<string, Tile>): void {
  const remembered = getRememberedMap(mapId);
  for (const [key, tile] of remembered.entries()) {
    tileCache.set(key, { ...tile });
  }
}

export function rememberVisibleTiles(
  mapId: string,
  tiles: VisibleTile[][],
  originX: number,
  originY: number,
): void {
  const remembered = getRememberedMap(mapId);
  let changed = false;

  for (let row = 0; row < tiles.length; row++) {
    for (let col = 0; col < tiles[row].length; col++) {
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
