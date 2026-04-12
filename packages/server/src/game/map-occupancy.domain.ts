import {
  DEFAULT_PLAYER_MAP_ID,
  getTileTraversalCost,
  isOffsetInRange,
  Tile,
} from '@mud/shared';
import { isPlayerRespawnMapId, PLAYER_RESPAWN_MAP_IDS } from '../constants/gameplay/respawn';
import { PathfindingActorType, PathfindingStaticGrid } from './pathfinding/pathfinding.types';
import {
  MapData,
  OccupancyCheckOptions,
  OccupantKind,
} from './map.service.shared';

/** DomainDeps：定义该接口的能力与字段约束。 */
interface DomainDeps {
  tileStateKey: (x: number, y: number) => string;
  getPlayerOverlapPointsByMap: () => Map<string, Set<string>>;
  replacePlayerOverlapPointsByMap: (next: Map<string, Set<string>>) => void;
  getMapRevision: (mapId: string) => number;
  markTileDirty: (mapId: string, x: number, y: number) => void;
}

/** MapOccupancyDomain：封装相关状态与行为。 */
export class MapOccupancyDomain {
  constructor(
    private readonly maps: Map<string, MapData>,
    private readonly revisions: Map<string, number>,
    private readonly pathfindingStaticGrids: Map<string, PathfindingStaticGrid>,
    private readonly occupantsByMap: Map<string, Map<string, Map<string, OccupantKind>>>,
    private readonly deps: DomainDeps,
  ) {}

/** rebuildPlayerOverlapPointIndex：执行对应的业务逻辑。 */
  rebuildPlayerOverlapPointIndex(): void {
/** next：定义该变量以承载业务值。 */
    const next = new Map<string, Set<string>>();
    for (const [mapId, map] of this.maps.entries()) {
      this.addOverlapArea(next, mapId, map.spawnPoint.x, map.spawnPoint.y, true);
      for (const portal of map.portals) {
        this.addOverlapArea(next, mapId, portal.x, portal.y, true);
        this.addOverlapArea(next, portal.targetMapId, portal.targetX, portal.targetY, true);
      }
      for (const zone of map.safeZones) {
        this.addSafeZoneOverlapArea(next, mapId, zone.x, zone.y, zone.radius);
      }
      for (const npc of map.npcs) {
        this.addOverlapArea(next, mapId, npc.x, npc.y, false);
      }
    }
    this.deps.replacePlayerOverlapPointsByMap(next);
    this.syncPlayerOverlapPointsToMapMeta();
  }

/** hasOccupant：执行对应的业务逻辑。 */
  hasOccupant(mapId: string, x: number, y: number, occupancyId: string): boolean {
    return this.getOccupantsAt(mapId, x, y)?.has(occupancyId) === true;
  }

/** getPathfindingStaticGrid：执行对应的业务逻辑。 */
  getPathfindingStaticGrid(mapId: string): PathfindingStaticGrid | null {
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
    if (!map) {
      return null;
    }

/** revision：定义该变量以承载业务值。 */
    const revision = this.deps.getMapRevision(mapId);
/** cached：定义该变量以承载业务值。 */
    const cached = this.pathfindingStaticGrids.get(mapId);
    if (cached && cached.mapRevision === revision) {
      return cached;
    }

/** total：定义该变量以承载业务值。 */
    const total = map.meta.width * map.meta.height;
/** walkable：定义该变量以承载业务值。 */
    const walkable = new Uint8Array(total);
/** traversalCost：定义该变量以承载业务值。 */
    const traversalCost = new Uint16Array(total);
    for (let y = 0; y < map.meta.height; y += 1) {
      for (let x = 0; x < map.meta.width; x += 1) {
        const index = y * map.meta.width + x;
        const tile = map.tiles[y]?.[x];
        if (!tile || !tile.walkable) {
          walkable[index] = 0;
          traversalCost[index] = 0;
          continue;
        }
        walkable[index] = 1;
        traversalCost[index] = getTileTraversalCost(tile.type);
      }
    }

/** snapshot：定义该变量以承载业务值。 */
    const snapshot: PathfindingStaticGrid = {
      mapId,
      mapRevision: revision,
      width: map.meta.width,
      height: map.meta.height,
      walkable,
      traversalCost,
    };
    this.pathfindingStaticGrids.set(mapId, snapshot);
    return snapshot;
  }

  buildPathfindingBlockedGrid(
    mapId: string,
    actorType: PathfindingActorType,
    selfOccupancyId?: string | null,
  ): Uint8Array | null {
/** grid：定义该变量以承载业务值。 */
    const grid = this.getPathfindingStaticGrid(mapId);
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
    if (!grid || !map) {
      return null;
    }

/** blocked：定义该变量以承载业务值。 */
    const blocked = new Uint8Array(grid.width * grid.height);
    for (const npc of map.npcs) {
      if (npc.x < 0 || npc.x >= grid.width || npc.y < 0 || npc.y >= grid.height) {
        continue;
      }
      blocked[npc.y * grid.width + npc.x] = 1;
    }

/** occupants：定义该变量以承载业务值。 */
    const occupants = this.occupantsByMap.get(mapId);
    if (!occupants) {
      return blocked;
    }

    for (const [key, entries] of occupants.entries()) {
      const [rawX, rawY] = key.split(',');
      const x = Number(rawX);
/** y：定义该变量以承载业务值。 */
      const y = Number(rawY);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
        continue;
      }
/** blockers：定义该变量以承载业务值。 */
      const blockers = [...entries.entries()].filter(([id]) => id !== selfOccupancyId);
      if (blockers.length === 0) {
        continue;
      }
      if (actorType === 'player' && this.supportsPlayerOverlap(mapId, x, y)) {
        continue;
      }
      blocked[y * grid.width + x] = 1;
    }

    return blocked;
  }

/** hasNpcAt：执行对应的业务逻辑。 */
  hasNpcAt(mapId: string, x: number, y: number): boolean {
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
    if (!map) {
      return false;
    }
    return map.npcs.some((npc) => npc.x === x && npc.y === y);
  }

/** isTerrainWalkable：执行对应的业务逻辑。 */
  isTerrainWalkable(mapId: string, x: number, y: number): boolean {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
    return tile !== null && tile.walkable;
  }

/** isPlayerOverlapTile：执行对应的业务逻辑。 */
  isPlayerOverlapTile(mapId: string, x: number, y: number): boolean {
    return this.supportsPlayerOverlap(mapId, x, y);
  }

/** resolvePlayerRespawnMapId：执行对应的业务逻辑。 */
  resolvePlayerRespawnMapId(preferredMapId?: string | null): string {
    if (isPlayerRespawnMapId(preferredMapId) && this.maps.has(preferredMapId)) {
      return preferredMapId;
    }
/** configuredFallback：定义该变量以承载业务值。 */
    const configuredFallback = PLAYER_RESPAWN_MAP_IDS.find((mapId) => this.maps.has(mapId));
    if (configuredFallback) {
      return configuredFallback;
    }
    return this.maps.has(DEFAULT_PLAYER_MAP_ID)
      ? DEFAULT_PLAYER_MAP_ID
      : (this.getAllMapIds()[0] ?? DEFAULT_PLAYER_MAP_ID);
  }

  resolveDefaultPlayerSpawnPosition(
    occupancyId?: string | null,
    preferredMapId?: string | null,
  ): { mapId: string; x: number; y: number } {
/** mapId：定义该变量以承载业务值。 */
    const mapId = this.resolvePlayerRespawnMapId(preferredMapId);
/** spawn：定义该变量以承载业务值。 */
    const spawn = this.getSpawnPoint(mapId) ?? { x: 10, y: 10 };
/** pos：定义该变量以承载业务值。 */
    const pos = this.resolveWalkablePlayerPositionInMap(mapId, spawn.x, spawn.y, occupancyId);
    return { mapId, x: pos.x, y: pos.y };
  }

  resolvePlayerPlacement(
    mapId: string,
    x: number,
    y: number,
    occupancyId?: string | null,
  ): { mapId: string; x: number; y: number; mapMissing: boolean } {
    if (!this.maps.has(mapId)) {
      return {
        ...this.resolveDefaultPlayerSpawnPosition(occupancyId),
        mapMissing: true,
      };
    }

/** pos：定义该变量以承载业务值。 */
    const pos = this.resolveWalkablePlayerPositionInMap(mapId, x, y, occupancyId);
    return {
      mapId,
      x: pos.x,
      y: pos.y,
      mapMissing: false,
    };
  }

/** isWalkable：执行对应的业务逻辑。 */
  isWalkable(mapId: string, x: number, y: number, options: OccupancyCheckOptions = {}): boolean {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
    if (tile === null || !tile.walkable || this.hasNpcAt(mapId, x, y)) {
      return false;
    }
    return this.canOccupy(mapId, x, y, options);
  }

/** canOccupy：执行对应的业务逻辑。 */
  canOccupy(mapId: string, x: number, y: number, options: OccupancyCheckOptions = {}): boolean {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
    if (!tile || !tile.walkable) return false;
    if (this.hasNpcAt(mapId, x, y)) return false;

    const { occupancyId, actorType = 'player' } = options;
/** occupants：定义该变量以承载业务值。 */
    const occupants = this.getOccupantsAt(mapId, x, y);
    if (!occupants || occupants.size === 0) {
      return true;
    }

/** blockingOccupants：定义该变量以承载业务值。 */
    const blockingOccupants = [...occupants.entries()].filter(([id]) => id !== occupancyId);
    if (blockingOccupants.length === 0) {
      return true;
    }

    return actorType === 'player' && this.supportsPlayerOverlap(mapId, x, y);
  }

/** canTraverseTerrain：执行对应的业务逻辑。 */
  canTraverseTerrain(mapId: string, x: number, y: number): boolean {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
    if (!tile || !tile.walkable) {
      return false;
    }
    return !this.hasNpcAt(mapId, x, y);
  }

/** addOccupant：执行对应的业务逻辑。 */
  addOccupant(mapId: string, x: number, y: number, occupancyId: string, kind: OccupantKind = 'player'): void {
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTile(mapId, x, y);
    if (!tile) return;

/** mapOccupants：定义该变量以承载业务值。 */
    const mapOccupants = this.occupantsByMap.get(mapId) ?? new Map<string, Map<string, OccupantKind>>();
/** key：定义该变量以承载业务值。 */
    const key = this.deps.tileStateKey(x, y);
/** occupants：定义该变量以承载业务值。 */
    const occupants = mapOccupants.get(key) ?? new Map<string, OccupantKind>();
    occupants.set(occupancyId, kind);
    mapOccupants.set(key, occupants);
    this.occupantsByMap.set(mapId, mapOccupants);
    this.syncOccupancyDisplay(mapId, x, y);
    this.deps.markTileDirty(mapId, x, y);
  }

/** removeOccupant：执行对应的业务逻辑。 */
  removeOccupant(mapId: string, x: number, y: number, occupancyId: string): void {
/** mapOccupants：定义该变量以承载业务值。 */
    const mapOccupants = this.occupantsByMap.get(mapId);
    if (!mapOccupants) return;

/** key：定义该变量以承载业务值。 */
    const key = this.deps.tileStateKey(x, y);
/** occupants：定义该变量以承载业务值。 */
    const occupants = mapOccupants.get(key);
    if (!occupants) return;

    occupants.delete(occupancyId);
    if (occupants.size === 0) {
      mapOccupants.delete(key);
    }
    if (mapOccupants.size === 0) {
      this.occupantsByMap.delete(mapId);
    }
    this.syncOccupancyDisplay(mapId, x, y);
    this.deps.markTileDirty(mapId, x, y);
  }

  findNearbyWalkable(
    mapId: string,
    x: number,
    y: number,
    maxRadius = 6,
/** options：定义该变量以承载业务值。 */
    options: OccupancyCheckOptions = {},
  ): { x: number; y: number } | null {
    for (let radius = 0; radius <= maxRadius; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!isOffsetInRange(dx, dy, radius)) continue;
          const nx = x + dx;
/** ny：定义该变量以承载业务值。 */
          const ny = y + dy;
          if (this.isWalkable(mapId, nx, ny, options)) {
            return { x: nx, y: ny };
          }
        }
      }
    }
    return null;
  }

  resolveWalkablePlayerPositionInMap(
    mapId: string,
    x: number,
    y: number,
    occupancyId?: string | null,
  ): { x: number; y: number } {
/** options：定义该变量以承载业务值。 */
    const options: OccupancyCheckOptions = { occupancyId, actorType: 'player' };
    if (this.canOccupy(mapId, x, y, options)) {
      return { x, y };
    }

/** nearby：定义该变量以承载业务值。 */
    const nearby = this.findNearbyWalkable(mapId, x, y, 10, options);
    if (nearby) {
      return nearby;
    }

/** spawn：定义该变量以承载业务值。 */
    const spawn = this.getSpawnPoint(mapId);
    if (spawn && this.canOccupy(mapId, spawn.x, spawn.y, options)) {
      return spawn;
    }

    if (spawn) {
/** nearSpawn：定义该变量以承载业务值。 */
      const nearSpawn = this.findNearbyWalkable(mapId, spawn.x, spawn.y, 12, options);
      if (nearSpawn) {
        return nearSpawn;
      }
      return spawn;
    }

    return { x, y };
  }

/** syncPlayerOverlapPointsToMapMeta：执行对应的业务逻辑。 */
  private syncPlayerOverlapPointsToMapMeta(): void {
    for (const [mapId, map] of this.maps.entries()) {
      const points = [...(this.deps.getPlayerOverlapPointsByMap().get(mapId) ?? new Set<string>())]
        .map((key) => {
          const [rawX, rawY] = key.split(',');
          return { x: Number(rawX), y: Number(rawY) };
        })
        .filter((point) => Number.isInteger(point.x) && Number.isInteger(point.y))
        .sort((left, right) => (left.y - right.y) || (left.x - right.x));
      map.meta.playerOverlapPoints = points.length > 0 ? points : undefined;
    }
  }

  private addOverlapArea(
    index: Map<string, Set<string>>,
    mapId: string,
    centerX: number,
    centerY: number,
    includeCenter: boolean,
  ): void {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!includeCenter && dx === 0 && dy === 0) {
          continue;
        }
/** x：定义该变量以承载业务值。 */
        const x = centerX + dx;
/** y：定义该变量以承载业务值。 */
        const y = centerY + dy;
        if (!this.getTile(mapId, x, y)?.walkable) {
          continue;
        }
        this.addOverlapPoint(index, mapId, x, y);
      }
    }
  }

/** addOverlapPoint：执行对应的业务逻辑。 */
  private addOverlapPoint(index: Map<string, Set<string>>, mapId: string, x: number, y: number): void {
/** key：定义该变量以承载业务值。 */
    const key = this.deps.tileStateKey(x, y);
/** points：定义该变量以承载业务值。 */
    const points = index.get(mapId) ?? new Set<string>();
    points.add(key);
    index.set(mapId, points);
  }

  private addSafeZoneOverlapArea(
    index: Map<string, Set<string>>,
    mapId: string,
    centerX: number,
    centerY: number,
    radius: number,
  ): void {
/** normalizedRadius：定义该变量以承载业务值。 */
    const normalizedRadius = Math.max(0, Math.floor(radius));
    for (let dy = -normalizedRadius; dy <= normalizedRadius; dy += 1) {
      for (let dx = -normalizedRadius; dx <= normalizedRadius; dx += 1) {
        if (!isOffsetInRange(dx, dy, normalizedRadius)) {
          continue;
        }
/** x：定义该变量以承载业务值。 */
        const x = centerX + dx;
/** y：定义该变量以承载业务值。 */
        const y = centerY + dy;
        if (!this.getTile(mapId, x, y)?.walkable) {
          continue;
        }
        this.addOverlapPoint(index, mapId, x, y);
      }
    }
  }

/** supportsPlayerOverlap：执行对应的业务逻辑。 */
  private supportsPlayerOverlap(mapId: string, x: number, y: number): boolean {
    return this.deps.getPlayerOverlapPointsByMap().get(mapId)?.has(this.deps.tileStateKey(x, y)) === true;
  }

/** getOccupantsAt：执行对应的业务逻辑。 */
  private getOccupantsAt(mapId: string, x: number, y: number): Map<string, OccupantKind> | undefined {
    return this.occupantsByMap.get(mapId)?.get(this.deps.tileStateKey(x, y));
  }

/** syncOccupancyDisplay：执行对应的业务逻辑。 */
  private syncOccupancyDisplay(mapId: string, x?: number, y?: number): void {
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
    if (!map) return;

    if (x !== undefined && y !== undefined) {
/** tile：定义该变量以承载业务值。 */
      const tile = map.tiles[y]?.[x];
      if (!tile) return;
/** occupants：定义该变量以承载业务值。 */
      const occupants = this.getOccupantsAt(mapId, x, y);
      tile.occupiedBy = occupants ? [...occupants.keys()][0] ?? null : null;
      return;
    }

    for (let rowIndex = 0; rowIndex < map.tiles.length; rowIndex += 1) {
      const row = map.tiles[rowIndex];
      if (!row) continue;
      for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
        const tile = row[colIndex];
        if (!tile) continue;
/** occupants：定义该变量以承载业务值。 */
        const occupants = this.getOccupantsAt(mapId, colIndex, rowIndex);
        tile.occupiedBy = occupants ? [...occupants.keys()][0] ?? null : null;
      }
    }
  }

/** getTile：执行对应的业务逻辑。 */
  private getTile(mapId: string, x: number, y: number): Tile | null {
/** map：定义该变量以承载业务值。 */
    const map = this.maps.get(mapId);
    if (!map) {
      return null;
    }
    return map.tiles[y]?.[x] ?? null;
  }

  private getSpawnPoint(mapId: string): { x: number; y: number } | undefined {
    return this.maps.get(mapId)?.spawnPoint;
  }

/** getAllMapIds：执行对应的业务逻辑。 */
  private getAllMapIds(): string[] {
    return [...this.maps.keys()];
  }
}

