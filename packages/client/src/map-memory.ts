/**
 * 地图记忆持久化 —— 将玩家已探索的地块和标记缓存到 localStorage，跨会话保留
 */

import {
  MAP_MEMORY_FORMAT_VERSION,
  MAP_MEMORY_PERSIST_DEBOUNCE_MS,
  MAP_MEMORY_STORAGE_KEY,
  MapMinimapMarker,
  Tile,
  TileType,
  VisibleTile,
  VisibleTilePatch,
} from '@mud/shared';

/** RememberedTile：定义该类型的结构与数据语义。 */
type RememberedTile = Pick<Tile, 'type' | 'walkable' | 'blocksSight' | 'aura'>;
/** RememberedMarker：定义该类型的结构与数据语义。 */
type RememberedMarker = Pick<MapMinimapMarker, 'id' | 'kind' | 'x' | 'y' | 'label' | 'detail'>;
/** SerializedMapTileMemory：定义该类型的结构与数据语义。 */
type SerializedMapTileMemory = Record<string, RememberedTile>;
/** SerializedMapMarkerMemory：定义该类型的结构与数据语义。 */
type SerializedMapMarkerMemory = Record<string, RememberedMarker>;
/** SerializedMapMemoryEntry：定义该类型的结构与数据语义。 */
type SerializedMapMemoryEntry = {
  tiles?: SerializedMapTileMemory;
  markers?: SerializedMapMarkerMemory;
};
/** SerializedLegacyMapMemory：定义该类型的结构与数据语义。 */
type SerializedLegacyMapMemory = Record<string, SerializedMapTileMemory>;
/** SerializedMapMemory：定义该类型的结构与数据语义。 */
type SerializedMapMemory = Record<string, SerializedMapMemoryEntry>;
/** SerializedMapMemoryEnvelope：定义该类型的结构与数据语义。 */
type SerializedMapMemoryEnvelope = {
/** version：定义该变量以承载业务值。 */
  version: typeof MAP_MEMORY_FORMAT_VERSION;
/** maps：定义该变量以承载业务值。 */
  maps: SerializedMapMemory;
};

/** rememberedTilesByMap：定义该变量以承载业务值。 */
const rememberedTilesByMap = new Map<string, Map<string, Tile>>();
/** rememberedMarkersByMap：定义该变量以承载业务值。 */
const rememberedMarkersByMap = new Map<string, Map<string, MapMinimapMarker>>();
/** didLoadMemory：定义该变量以承载业务值。 */
let didLoadMemory = false;
/** didBindPersistenceLifecycle：定义该变量以承载业务值。 */
let didBindPersistenceLifecycle = false;
/** storageAccessible：定义该变量以承载业务值。 */
let storageAccessible: boolean | null = null;
/** persistDisabled：定义该变量以承载业务值。 */
let persistDisabled = false;
/** persistTimer：定义该变量以承载业务值。 */
let persistTimer: number | null = null;
/** hasPendingPersist：定义该变量以承载业务值。 */
let hasPendingPersist = false;

/** isTileType：执行对应的业务逻辑。 */
function isTileType(value: unknown): value is TileType {
  return typeof value === 'string' && Object.values(TileType).includes(value as TileType);
}

/** toRememberedTile：执行对应的业务逻辑。 */
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

/** cloneMarker：执行对应的业务逻辑。 */
function cloneMarker(marker: MapMinimapMarker): MapMinimapMarker {
  return JSON.parse(JSON.stringify(marker)) as MapMinimapMarker;
}

/** isSerializedRememberedTile：执行对应的业务逻辑。 */
function isSerializedRememberedTile(value: unknown): value is RememberedTile {
  if (!value || typeof value !== 'object') {
    return false;
  }
/** candidate：定义该变量以承载业务值。 */
  const candidate = value as Partial<RememberedTile>;
  return isTileType(candidate.type)
    && typeof candidate.walkable === 'boolean'
    && typeof candidate.blocksSight === 'boolean'
    && (typeof candidate.aura === 'number' || candidate.aura === undefined);
}

/** isSerializedRememberedMarker：执行对应的业务逻辑。 */
function isSerializedRememberedMarker(value: unknown): value is RememberedMarker {
  if (!value || typeof value !== 'object') {
    return false;
  }
/** candidate：定义该变量以承载业务值。 */
  const candidate = value as Partial<RememberedMarker>;
  return typeof candidate.id === 'string'
    && typeof candidate.kind === 'string'
    && Number.isInteger(candidate.x)
    && Number.isInteger(candidate.y)
    && typeof candidate.label === 'string'
    && (candidate.detail === undefined || typeof candidate.detail === 'string');
}

/** getStorage：执行对应的业务逻辑。 */
function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (storageAccessible === false) {
    return null;
  }

  try {
/** storage：定义该变量以承载业务值。 */
    const storage = window.localStorage;
    if (storageAccessible === null) {
/** probeKey：定义该变量以承载业务值。 */
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

/** getStoredEnvelope：执行对应的业务逻辑。 */
function getStoredEnvelope(parsed: unknown): SerializedMapMemoryEnvelope | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

/** candidate：定义该变量以承载业务值。 */
  const candidate = parsed as Partial<SerializedMapMemoryEnvelope> & Record<string, unknown>;
  if (candidate.version === MAP_MEMORY_FORMAT_VERSION && candidate.maps && typeof candidate.maps === 'object') {
    return {
      version: MAP_MEMORY_FORMAT_VERSION,
      maps: candidate.maps as SerializedMapMemory,
    };
  }

/** candidateVersion：定义该变量以承载业务值。 */
  const candidateVersion = Number(candidate.version);
  if (candidateVersion === 2 || candidate.version === undefined) {
/** legacyMaps：定义该变量以承载业务值。 */
    const legacyMaps = (candidateVersion === 2 && candidate.maps && typeof candidate.maps === 'object'
      ? candidate.maps
      : candidate) as SerializedLegacyMapMemory;
/** maps：定义该变量以承载业务值。 */
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

/** importRememberedMaps：执行对应的业务逻辑。 */
function importRememberedMaps(serialized: SerializedMapMemory): boolean {
/** hasValidMemory：定义该变量以承载业务值。 */
  let hasValidMemory = false;

  for (const [mapId, entry] of Object.entries(serialized)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

/** rememberedTiles：定义该变量以承载业务值。 */
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

/** rememberedMarkers：定义该变量以承载业务值。 */
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

/** buildSerializedMapMemory：执行对应的业务逻辑。 */
function buildSerializedMapMemory(): SerializedMapMemoryEnvelope {
/** maps：定义该变量以承载业务值。 */
  const maps: SerializedMapMemory = {};
/** mapIds：定义该变量以承载业务值。 */
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

/** markers：定义该变量以承载业务值。 */
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

/** disablePersistence：执行对应的业务逻辑。 */
function disablePersistence(reason: string, error?: unknown): void {
  persistDisabled = true;
  hasPendingPersist = false;
  if (persistTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  console.warn(`[map-memory] ${reason}`, error);
}

/** flushPersistMemory：执行对应的业务逻辑。 */
function flushPersistMemory(): void {
  persistTimer = null;
  if (!hasPendingPersist || persistDisabled) {
    return;
  }

/** storage：定义该变量以承载业务值。 */
  const storage = getStorage();
  if (!storage) {
    hasPendingPersist = false;
    return;
  }

  try {
/** envelope：定义该变量以承载业务值。 */
    const envelope = buildSerializedMapMemory();
/** nextJson：定义该变量以承载业务值。 */
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

/** flushPersistMemoryNow：执行对应的业务逻辑。 */
function flushPersistMemoryNow(): void {
  if (persistTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  flushPersistMemory();
}

/** ensurePersistenceLifecycle：执行对应的业务逻辑。 */
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

/** schedulePersistMemory：执行对应的业务逻辑。 */
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

/** ensureMemoryLoaded：执行对应的业务逻辑。 */
function ensureMemoryLoaded(): void {
  if (didLoadMemory) {
    return;
  }
  didLoadMemory = true;

/** storage：定义该变量以承载业务值。 */
  const storage = getStorage();
  if (!storage) {
    return;
  }

/** raw：定义该变量以承载业务值。 */
  const raw = storage.getItem(MAP_MEMORY_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
/** parsed：定义该变量以承载业务值。 */
    const parsed = JSON.parse(raw) as unknown;
/** envelope：定义该变量以承载业务值。 */
    const envelope = getStoredEnvelope(parsed);
    if (!envelope) {
      disablePersistence('本地地图记忆格式无法识别，已保留原始数据且停止本次会话持久化。');
      return;
    }
    if (!importRememberedMaps(envelope.maps)) {
      disablePersistence('本地地图记忆中没有可恢复的有效内容，已保留原始数据且停止本次会话持久化。');
      return;
    }
/** loadedMapCount：定义该变量以承载业务值。 */
    const loadedMapCount = rememberedTilesByMap.size + rememberedMarkersByMap.size;
/** storedMapCount：定义该变量以承载业务值。 */
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

/** persistMemory：执行对应的业务逻辑。 */
function persistMemory(): void {
  schedulePersistMemory();
}

/** getRememberedTileMap：执行对应的业务逻辑。 */
function getRememberedTileMap(mapId: string): Map<string, Tile> {
  ensureMemoryLoaded();
/** remembered：定义该变量以承载业务值。 */
  let remembered = rememberedTilesByMap.get(mapId);
  if (!remembered) {
    remembered = new Map<string, Tile>();
    rememberedTilesByMap.set(mapId, remembered);
  }
  return remembered;
}

/** getRememberedMarkerMap：执行对应的业务逻辑。 */
function getRememberedMarkerMap(mapId: string): Map<string, MapMinimapMarker> {
  ensureMemoryLoaded();
/** remembered：定义该变量以承载业务值。 */
  let remembered = rememberedMarkersByMap.get(mapId);
  if (!remembered) {
    remembered = new Map<string, MapMinimapMarker>();
    rememberedMarkersByMap.set(mapId, remembered);
  }
  return remembered;
}

/** areMarkersEqual：执行对应的业务逻辑。 */
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
/** remembered：定义该变量以承载业务值。 */
  const remembered = getRememberedTileMap(mapId);
  for (const [key, tile] of remembered.entries()) {
    tileCache.set(key, { ...tile });
  }
}

/** 获取指定地图所有已记忆地块的克隆副本 */
export function getRememberedTiles(mapId: string): Map<string, Tile> {
/** remembered：定义该变量以承载业务值。 */
  const remembered = getRememberedTileMap(mapId);
/** cloned：定义该变量以承载业务值。 */
  const cloned = new Map<string, Tile>();
  for (const [key, tile] of remembered.entries()) {
    cloned.set(key, { ...tile });
  }
  return cloned;
}

/** 获取指定地图所有已记忆的小地图标记 */
export function getRememberedMarkers(mapId: string): MapMinimapMarker[] {
/** remembered：定义该变量以承载业务值。 */
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
/** remembered：定义该变量以承载业务值。 */
  const remembered = getRememberedTileMap(mapId);
/** changed：定义该变量以承载业务值。 */
  let changed = false;

  for (let row = 0; row < tiles.length; row += 1) {
    for (let col = 0; col < tiles[row].length; col += 1) {
      const tile = tiles[row][col];
      if (!tile) {
        continue;
      }
/** key：定义该变量以承载业务值。 */
      const key = `${originX + col},${originY + row}`;
/** nextTile：定义该变量以承载业务值。 */
      const nextTile = toRememberedTile(tile);
/** previous：定义该变量以承载业务值。 */
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

/** 将增量地块 patch 写入记忆，仅记录当前已知地块，不处理“暂时不可见”的清除 patch */
export function rememberVisibleTilePatches(mapId: string, patches: VisibleTilePatch[]): void {
  if (patches.length === 0) {
    return;
  }

/** remembered：定义该变量以承载业务值。 */
  const remembered = getRememberedTileMap(mapId);
/** changed：定义该变量以承载业务值。 */
  let changed = false;

  for (const patch of patches) {
    if (!patch.tile) {
      continue;
    }

/** key：定义该变量以承载业务值。 */
    const key = `${patch.x},${patch.y}`;
/** nextTile：定义该变量以承载业务值。 */
    const nextTile = toRememberedTile(patch.tile);
/** previous：定义该变量以承载业务值。 */
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

/** 将当前可见的小地图标记写入记忆 */
export function rememberVisibleMarkers(mapId: string, markers: MapMinimapMarker[]): void {
  if (markers.length === 0) {
    return;
  }

/** remembered：定义该变量以承载业务值。 */
  const remembered = getRememberedMarkerMap(mapId);
/** changed：定义该变量以承载业务值。 */
  let changed = false;

  for (const marker of markers) {
    if (!marker.id || !marker.label) {
      continue;
    }
/** previous：定义该变量以承载业务值。 */
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
/** removedTiles：定义该变量以承载业务值。 */
  const removedTiles = rememberedTilesByMap.delete(mapId);
/** removedMarkers：定义该变量以承载业务值。 */
  const removedMarkers = rememberedMarkersByMap.delete(mapId);
  if (removedTiles || removedMarkers) {
    persistMemory();
  }
}

