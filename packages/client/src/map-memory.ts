import { Tile, TileType, VisibleTile } from '@mud/shared';

const MAP_MEMORY_STORAGE_KEY = 'mud:map-memory:v1';

type RememberedTile = Pick<Tile, 'type' | 'walkable' | 'blocksSight'>;
type SerializedMapMemory = Record<string, Record<string, RememberedTile>>;

const rememberedMaps = new Map<string, Map<string, Tile>>();
let didLoadMemory = false;

function isTileType(value: unknown): value is TileType {
  return typeof value === 'string' && Object.values(TileType).includes(value as TileType);
}

function toRememberedTile(tile: Pick<Tile, 'type' | 'walkable' | 'blocksSight'>): Tile {
  return {
    type: tile.type,
    walkable: tile.walkable,
    blocksSight: tile.blocksSight,
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
    && typeof candidate.blocksSight === 'boolean';
}

function ensureMemoryLoaded(): void {
  if (didLoadMemory) {
    return;
  }
  didLoadMemory = true;

  const raw = localStorage.getItem(MAP_MEMORY_STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      localStorage.removeItem(MAP_MEMORY_STORAGE_KEY);
      return;
    }
    for (const [mapId, entries] of Object.entries(parsed as SerializedMapMemory)) {
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
      }
    }
  } catch {
    localStorage.removeItem(MAP_MEMORY_STORAGE_KEY);
  }
}

function persistMemory(): void {
  const payload: SerializedMapMemory = {};
  for (const [mapId, entries] of rememberedMaps.entries()) {
    if (entries.size === 0) {
      continue;
    }
    payload[mapId] = {};
    for (const [key, tile] of entries.entries()) {
      payload[mapId][key] = {
        type: tile.type,
        walkable: tile.walkable,
        blocksSight: tile.blocksSight,
      };
    }
  }
  localStorage.setItem(MAP_MEMORY_STORAGE_KEY, JSON.stringify(payload));
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
