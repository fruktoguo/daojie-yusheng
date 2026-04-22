/**
 * 地图静态缓存 —— 将地图元信息和小地图快照持久化到 localStorage，减少重复请求
 */

import { MAP_STATIC_CACHE_STORAGE_KEY, MapMeta, MapMinimapArchiveEntry, MapMinimapSnapshot } from '@mud/shared';

/** 地图元信息的持久化字段集合。 */
type CachedMapMeta = Pick<
  MapMeta,
  'id' | 'name' | 'width' | 'height' | 'dangerLevel' | 'recommendedRealm' | 'floorLevel' | 'floorName' | 'description' | 'playerOverlapPoints'
>;

/** 地图静态缓存按 ID 维护的一条记录。 */
interface CachedMapEntry {
/**
 * meta：meta相关字段。
 */

  meta?: CachedMapMeta;  
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot?: MapMinimapSnapshot;  
  /**
 * unlocked：unlocked相关字段。
 */

  unlocked?: boolean;
}

/** 序列化写入 localStorage 的对象形状。 */
type SerializedStaticCache = Record<string, CachedMapEntry | MapMinimapSnapshot>;

/** 是否已经完成本地缓存读取。 */
let loaded = false;
/** 已加载的地图静态缓存映射。 */
const cachedEntries = new Map<string, CachedMapEntry>();

/** 读取 localStorage 存储对象，不支持环境时返回 null。 */
function getStorage(): Storage | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 判断本地缓存值是否能还原成完整的小地图快照。 */
function isSnapshot(value: unknown): value is MapMinimapSnapshot {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<MapMinimapSnapshot>;
  if (!Array.isArray(candidate.markers)) {
    return false;
  }
  const width = Number(candidate.width);
  const height = Number(candidate.height);
  return Number.isInteger(candidate.width)
    && Number.isInteger(candidate.height)
    && width > 0
    && height > 0
    && Array.isArray(candidate.terrainRows)
    && candidate.terrainRows.every((row) => typeof row === 'string')
    && candidate.terrainRows.length <= height
    && candidate.terrainRows.every((row) => row.length <= width)
    && candidate.markers.every((marker) => {
      if (!marker || typeof marker !== 'object') {
        return false;
      }
      const typedMarker = marker as {      
      /**
 * id：ID标识。
 */

        id?: unknown;        
        /**
 * kind：kind相关字段。
 */

        kind?: unknown;        
        /**
 * x：x相关字段。
 */

        x?: unknown;        
        /**
 * y：y相关字段。
 */

        y?: unknown;        
        /**
 * label：label名称或显示文本。
 */

        label?: unknown;        
        /**
 * detail：详情状态或数据块。
 */

        detail?: unknown;
      };
      return typeof typedMarker.id === 'string'
        && typeof typedMarker.kind === 'string'
        && Number.isInteger(typedMarker.x)
        && Number.isInteger(typedMarker.y)
        && typeof typedMarker.label === 'string'
        && (typedMarker.detail === undefined || typeof typedMarker.detail === 'string');
    });
}

/** 判断对象是否为可持久化的地图元信息。 */
function isCachedMapMeta(value: unknown): value is CachedMapMeta {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<CachedMapMeta>;
  return typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && Number.isInteger(candidate.width)
    && Number.isInteger(candidate.height)
    && (
      candidate.playerOverlapPoints === undefined
      || (
        Array.isArray(candidate.playerOverlapPoints)
        && candidate.playerOverlapPoints.every((point) => (
          point
          && typeof point === 'object'
          && Number.isInteger((point as {          
          /**
 * x：x相关字段。
 */
 x?: unknown }).x)
          && Number.isInteger((point as {          
          /**
 * y：y相关字段。
 */
 y?: unknown }).y)
        ))
      )
    );
}

/** 复制快照以避免外部修改污染缓存。 */
function cloneSnapshot(snapshot: MapMinimapSnapshot): MapMinimapSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as MapMinimapSnapshot;
}

/** 复制元数据以避免返回值被外部篡改。 */
function cloneMeta(meta: CachedMapMeta): MapMeta {
  return JSON.parse(JSON.stringify(meta)) as MapMeta;
}

/** 从完整地图元信息提取持久化字段。 */
function toCachedMeta(meta: MapMeta): CachedMapMeta {
  return {
    id: meta.id,
    name: meta.name,
    width: meta.width,
    height: meta.height,
    playerOverlapPoints: meta.playerOverlapPoints,
    dangerLevel: meta.dangerLevel,
    recommendedRealm: meta.recommendedRealm,
    floorLevel: meta.floorLevel,
    floorName: meta.floorName,
    description: meta.description,
  };
}

/** 规范化并过滤无效反序列化条目。 */
function normalizeEntry(value: unknown): CachedMapEntry | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (isSnapshot(value)) {
    return {
      snapshot: cloneSnapshot(value),
      unlocked: false,
    };
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as CachedMapEntry;
  const normalized: CachedMapEntry = {};
  if (candidate.meta && isCachedMapMeta(candidate.meta)) {
    normalized.meta = JSON.parse(JSON.stringify(candidate.meta)) as CachedMapMeta;
  }
  if (candidate.snapshot && isSnapshot(candidate.snapshot)) {
    normalized.snapshot = cloneSnapshot(candidate.snapshot);
  }
  if (typeof candidate.unlocked === 'boolean') {
    normalized.unlocked = candidate.unlocked;
  }
  if (!normalized.meta && !normalized.snapshot) {
    return null;
  }
  return normalized;
}

/** 首次按需加载 localStorage 缓存到内存。 */
function ensureLoaded(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (loaded) {
    return;
  }
  /** 避免重复解析，首次进入时打标记。 */
  loaded = true;

  const storage = getStorage();
  if (!storage) {
    return;
  }

  const raw = storage.getItem(MAP_STATIC_CACHE_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    for (const [mapId, entry] of Object.entries(parsed as SerializedStaticCache)) {
      const normalized = normalizeEntry(entry);
      if (!normalized) {
        continue;
      }
      cachedEntries.set(mapId, normalized);
    }
  } catch {
    // 保留原始存储，不在这里主动删除。
  }
}

/** 将内存缓存持久化回 localStorage。 */
function persist(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const storage = getStorage();
  if (!storage) {
    return;
  }

  const payload: Record<string, CachedMapEntry> = {};
  for (const [mapId, entry] of cachedEntries.entries()) {
    payload[mapId] = {
      meta: entry.meta ? JSON.parse(JSON.stringify(entry.meta)) as CachedMapMeta : undefined,
      snapshot: entry.snapshot ? cloneSnapshot(entry.snapshot) : undefined,
      unlocked: entry.unlocked === true,
    };
  }

  try {
    storage.setItem(MAP_STATIC_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 静态地图缓存失败时直接退回仅内存模式。
  }
}

/** 获取或创建某地图的缓存记录。 */
function getOrCreateEntry(mapId: string): CachedMapEntry {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ensureLoaded();
  const existing = cachedEntries.get(mapId);
  if (existing) {
    return existing;
  }
  const created: CachedMapEntry = {};
  cachedEntries.set(mapId, created);
  return created;
}

/** 缓存某张地图的元信息（用于断线重入/跳图时快速展示）。 */
export function cacheMapMeta(meta: MapMeta): void {
  const entry = getOrCreateEntry(meta.id);
  entry.meta = toCachedMeta(meta);
  persist();
}

/** 读取某张地图已缓存的元信息。 */
export function getCachedMapMeta(mapId: string): MapMeta | null {
  ensureLoaded();
  const meta = cachedEntries.get(mapId)?.meta;
  return meta ? cloneMeta(meta) : null;
}

/** 读取某张地图已缓存的小地图快照。 */
export function getCachedMapSnapshot(mapId: string): MapMinimapSnapshot | null {
  ensureLoaded();
  const snapshot = cachedEntries.get(mapId)?.snapshot;
  return snapshot ? cloneSnapshot(snapshot) : null;
}

/** 缓存小地图快照，并可同步元信息和解锁状态。 */
export function cacheMapSnapshot(
  mapId: string,
  snapshot: MapMinimapSnapshot,
  options?: {  
  /**
 * meta：meta相关字段。
 */
 meta?: MapMeta | null;  
 /**
 * unlocked：unlocked相关字段。
 */
 unlocked?: boolean },
): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const entry = getOrCreateEntry(mapId);
  entry.snapshot = cloneSnapshot(snapshot);
  if (options?.meta) {
    entry.meta = toCachedMeta(options.meta);
  }
  if (options?.unlocked !== undefined) {
    entry.unlocked = options.unlocked;
  }
  persist();
}

/** 批量写入已解锁地图快照（用于首次登录的地图目录恢复）。 */
export function cacheUnlockedMinimapLibrary(entries: MapMinimapArchiveEntry[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ensureLoaded();
  for (const entry of entries) {
    const cached = getOrCreateEntry(entry.mapId);
    cached.meta = toCachedMeta(entry.mapMeta);
    cached.snapshot = cloneSnapshot(entry.snapshot);
    cached.unlocked = true;
  }
  persist();
}

/** 列出可直接展示摘要和小地图的已解锁地图。 */
export function listCachedUnlockedMaps(): Array<{
/**
 * mapId：地图ID标识。
 */
 mapId: string;
 /**
 * mapMeta：地图Meta相关字段。
 */
 mapMeta: MapMeta | null;
 /**
 * snapshot：快照状态或数据块。
 */
 snapshot: MapMinimapSnapshot }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ensureLoaded();
  const result: Array<{  
  /**
 * mapId：地图ID标识。
 */
 mapId: string;  
 /**
 * mapMeta：地图Meta相关字段。
 */
 mapMeta: MapMeta | null;  
 /**
 * snapshot：快照状态或数据块。
 */
 snapshot: MapMinimapSnapshot }> = [];
  for (const [mapId, entry] of cachedEntries.entries()) {
    if (entry.unlocked !== true || !entry.snapshot) {
      continue;
    }
    result.push({
      mapId,
      mapMeta: entry.meta ? cloneMeta(entry.meta) : null,
      snapshot: cloneSnapshot(entry.snapshot),
    });
  }
  result.sort((left, right) => {
    const leftName = left.mapMeta?.name ?? left.mapId;
    const rightName = right.mapMeta?.name ?? right.mapId;
    return leftName.localeCompare(rightName, 'zh-Hans-CN');
  });
  return result;
}

/** 列出已解锁地图的元信息摘要，不包含大体积快照。 */
export function listCachedUnlockedMapSummaries(): Array<{
/**
 * mapId：地图ID标识。
 */
 mapId: string;
 /**
 * mapMeta：地图Meta相关字段。
 */
 mapMeta: MapMeta | null }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  ensureLoaded();
  const result: Array<{  
  /**
 * mapId：地图ID标识。
 */
 mapId: string;  
 /**
 * mapMeta：地图Meta相关字段。
 */
 mapMeta: MapMeta | null }> = [];
  for (const [mapId, entry] of cachedEntries.entries()) {
    if (entry.unlocked !== true) {
      continue;
    }
    result.push({
      mapId,
      mapMeta: entry.meta ? cloneMeta(entry.meta) : null,
    });
  }
  result.sort((left, right) => {
    const leftName = left.mapMeta?.name ?? left.mapId;
    const rightName = right.mapMeta?.name ?? right.mapId;
    return leftName.localeCompare(rightName, 'zh-Hans-CN');
  });
  return result;
}


