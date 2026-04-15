/**
 * 地图静态缓存 —— 将地图元信息和小地图快照持久化到 localStorage，减少重复请求
 */

import { MAP_STATIC_CACHE_STORAGE_KEY, MapMeta, MapMinimapArchiveEntry, MapMinimapSnapshot } from '@mud/shared';

type CachedMapMeta = Pick<
  MapMeta,
  'id' | 'name' | 'width' | 'height' | 'dangerLevel' | 'recommendedRealm' | 'floorLevel' | 'floorName' | 'description' | 'playerOverlapPoints'
>;

interface CachedMapEntry {
  meta?: CachedMapMeta;
  snapshot?: MapMinimapSnapshot;
  unlocked?: boolean;
}

type SerializedStaticCache = Record<string, CachedMapEntry | MapMinimapSnapshot>;

let loaded = false;
const cachedEntries = new Map<string, CachedMapEntry>();

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** isSnapshot：判断并返回条件结果。 */
function isSnapshot(value: unknown): value is MapMinimapSnapshot {
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
        id?: unknown;
        kind?: unknown;
        x?: unknown;
        y?: unknown;
        label?: unknown;
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

/** isCachedMapMeta：判断并返回条件结果。 */
function isCachedMapMeta(value: unknown): value is CachedMapMeta {
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
          && Number.isInteger((point as { x?: unknown }).x)
          && Number.isInteger((point as { y?: unknown }).y)
        ))
      )
    );
}


function cloneSnapshot(snapshot: MapMinimapSnapshot): MapMinimapSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as MapMinimapSnapshot;
}


function cloneMeta(meta: CachedMapMeta): MapMeta {
  return JSON.parse(JSON.stringify(meta)) as MapMeta;
}


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


function normalizeEntry(value: unknown): CachedMapEntry | null {
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


function ensureLoaded(): void {
  if (loaded) {
    return;
  }
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


function persist(): void {
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

function getOrCreateEntry(mapId: string): CachedMapEntry {
  ensureLoaded();
  const existing = cachedEntries.get(mapId);
  if (existing) {
    return existing;
  }
  const created: CachedMapEntry = {};
  cachedEntries.set(mapId, created);
  return created;
}

/** 缓存地图元信息到本地 */
export function cacheMapMeta(meta: MapMeta): void {
  const entry = getOrCreateEntry(meta.id);
  entry.meta = toCachedMeta(meta);
  persist();
}

/** 获取已缓存的地图元信息 */
export function getCachedMapMeta(mapId: string): MapMeta | null {
  ensureLoaded();
  const meta = cachedEntries.get(mapId)?.meta;
  return meta ? cloneMeta(meta) : null;
}

/** 获取已缓存的小地图快照 */
export function getCachedMapSnapshot(mapId: string): MapMinimapSnapshot | null {
  ensureLoaded();
  const snapshot = cachedEntries.get(mapId)?.snapshot;
  return snapshot ? cloneSnapshot(snapshot) : null;
}

/** 缓存小地图快照，可同时更新元信息和解锁状态 */
export function cacheMapSnapshot(
  mapId: string,
  snapshot: MapMinimapSnapshot,
  options?: { meta?: MapMeta | null; unlocked?: boolean },
): void {
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

/** 批量缓存已解锁的小地图库条目 */
export function cacheUnlockedMinimapLibrary(entries: MapMinimapArchiveEntry[]): void {
  ensureLoaded();
  for (const entry of entries) {
    const cached = getOrCreateEntry(entry.mapId);
    cached.meta = toCachedMeta(entry.mapMeta);
    cached.snapshot = cloneSnapshot(entry.snapshot);
    cached.unlocked = true;
  }
  persist();
}

/** 列出所有已解锁且有快照的地图（含元信息和快照） */
export function listCachedUnlockedMaps(): Array<{ mapId: string; mapMeta: MapMeta | null; snapshot: MapMinimapSnapshot }> {
  ensureLoaded();
  const result: Array<{ mapId: string; mapMeta: MapMeta | null; snapshot: MapMinimapSnapshot }> = [];
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

/** 列出所有已解锁地图的摘要信息（不含快照数据） */
export function listCachedUnlockedMapSummaries(): Array<{ mapId: string; mapMeta: MapMeta | null }> {
  ensureLoaded();
  const result: Array<{ mapId: string; mapMeta: MapMeta | null }> = [];
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

