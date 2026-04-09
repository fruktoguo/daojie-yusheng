import {
  VIEW_RADIUS,
  type Direction,
  type GroundItemPilePatch,
  type GroundItemPileView,
  type MapMeta,
  type MapMinimapMarker,
  type MapMinimapSnapshot,
  type PlayerState,
  type RenderEntity,
  type S2C_MapStaticSync,
  type TickRenderEntity,
  type Tile,
  type VisibleTile,
  type VisibleTilePatch,
  clonePlainValue,
} from '@mud/shared-next';
import {
  deleteRememberedMap,
  getRememberedMarkers,
  hydrateTileCacheFromMemory,
  rememberVisibleMarkers,
  rememberVisibleTilePatches,
  rememberVisibleTiles,
} from '../../map-memory';
import {
  cacheMapMeta,
  cacheMapSnapshot,
  cacheUnlockedMinimapLibrary,
  getCachedMapMeta,
  getCachedMapSnapshot,
} from '../../map-static-cache';
import type {
  MapBootstrapInput,
  MapEntityTransition,
  MapNextSelfDeltaInput,
  MapNextWorldDeltaInput,
  MapSenseQiOverlayState,
  MapStoreSnapshot,
  MapTargetingOverlayState,
  ObservedMapEntity,
} from '../types';

let latestObservedEntitiesSnapshot: readonly ObservedMapEntity[] = [];

export function getLatestObservedEntitiesSnapshot(): readonly ObservedMapEntity[] {
  return latestObservedEntitiesSnapshot;
}

function publishLatestObservedEntitiesSnapshot(entities: readonly ObservedMapEntity[]): void {
  latestObservedEntitiesSnapshot = entities;
}

function cloneJson<T>(value: T): T {
  return clonePlainValue(value);
}

function applyNullablePatch<T>(value: T | null | undefined, fallback: T | undefined): T | undefined {
  if (value === null) {
    return undefined;
  }
  if (value !== undefined) {
    return value;
  }
  return fallback;
}

function toObservedEntity(entity: RenderEntity): ObservedMapEntity {
  return {
    id: entity.id,
    wx: entity.x,
    wy: entity.y,
    char: entity.char,
    color: entity.color,
    name: entity.name,
    kind: entity.kind ?? 'player',
    monsterTier: entity.monsterTier,
    monsterScale: entity.monsterScale,
    hp: entity.hp,
    maxHp: entity.maxHp,
    qi: entity.qi,
    maxQi: entity.maxQi,
    npcQuestMarker: entity.npcQuestMarker,
    observation: entity.observation,
    buffs: entity.buffs ? cloneJson(entity.buffs) : undefined,
  };
}

function mergeObservedEntityPatch(patch: TickRenderEntity, previous?: ObservedMapEntity): ObservedMapEntity {
  return {
    id: patch.id,
    wx: patch.x,
    wy: patch.y,
    char: patch.char ?? previous?.char ?? '?',
    color: patch.color ?? previous?.color ?? '#fff',
    name: applyNullablePatch(patch.name, previous?.name),
    kind: applyNullablePatch(patch.kind, previous?.kind),
    monsterTier: applyNullablePatch(patch.monsterTier, previous?.monsterTier),
    monsterScale: applyNullablePatch(patch.monsterScale, previous?.monsterScale),
    hp: applyNullablePatch(patch.hp, previous?.hp),
    maxHp: applyNullablePatch(patch.maxHp, previous?.maxHp),
    qi: applyNullablePatch(patch.qi, previous?.qi),
    maxQi: applyNullablePatch(patch.maxQi, previous?.maxQi),
    npcQuestMarker: applyNullablePatch(patch.npcQuestMarker, previous?.npcQuestMarker),
    observation: applyNullablePatch(patch.observation, previous?.observation),
    buffs: applyNullablePatch(patch.buffs, previous?.buffs),
  };
}

function buildThreatArrowKey(ownerId: string, targetId: string): string {
  return `${ownerId}->${targetId}`;
}

function isSameMinimapSnapshot(left: MapMinimapSnapshot | null, right: MapMinimapSnapshot | null): boolean {
  if (!left || !right) {
    return left === right;
  }
  if (left.width !== right.width || left.height !== right.height || left.terrainRows.length !== right.terrainRows.length || left.markers.length !== right.markers.length) {
    return false;
  }
  for (let index = 0; index < left.terrainRows.length; index += 1) {
    if (left.terrainRows[index] !== right.terrainRows[index]) {
      return false;
    }
  }
  for (let index = 0; index < left.markers.length; index += 1) {
    const leftMarker = left.markers[index];
    const rightMarker = right.markers[index];
    if (
      leftMarker.id !== rightMarker.id
      || leftMarker.kind !== rightMarker.kind
      || leftMarker.x !== rightMarker.x
      || leftMarker.y !== rightMarker.y
      || leftMarker.label !== rightMarker.label
      || leftMarker.detail !== rightMarker.detail
    ) {
      return false;
    }
  }
  return true;
}

function shouldResetRememberedMap(mapId: string, nextMeta: MapMeta | null | undefined, nextSnapshot: MapMinimapSnapshot | null | undefined): boolean {
  const cachedMeta = getCachedMapMeta(mapId);
  if (cachedMeta && nextMeta) {
    if (
      cachedMeta.width !== nextMeta.width
      || cachedMeta.height !== nextMeta.height
      || cachedMeta.name !== nextMeta.name
      || cachedMeta.floorLevel !== nextMeta.floorLevel
      || cachedMeta.floorName !== nextMeta.floorName
    ) {
      return true;
    }
  }
  const cachedSnapshot = getCachedMapSnapshot(mapId);
  if (cachedSnapshot && nextSnapshot && !isSameMinimapSnapshot(cachedSnapshot, nextSnapshot)) {
    return true;
  }
  return false;
}

export class MapStore {
  private mapMeta: MapMeta | null = null;
  private player: PlayerState | null = null;
  private minimapSnapshot: MapMinimapSnapshot | null = null;
  private visibleMinimapMarkers: MapMinimapMarker[] = [];
  private time = null as MapStoreSnapshot['time'];
  private tileCache = new Map<string, Tile>();
  private visibleTiles = new Set<string>();
  private visibleTileRevision = 0;
  private entities: ObservedMapEntity[] = [];
  private entityMap = new Map<string, ObservedMapEntity>();
  private groundPiles = new Map<string, GroundItemPileView>();
  private pathCells: Array<{ x: number; y: number }> = [];
  private targeting: MapTargetingOverlayState | null = null;
  private senseQi: MapSenseQiOverlayState | null = null;
  private threatArrows: Array<{ ownerId: string; targetId: string }> = [];
  private minimapMemoryVersion = 0;
  private awaitingFullVisibilityMapId: string | null = null;
  private tickTiming = {
    startedAt: performance.now(),
    durationMs: 1000,
  };
  private entityTransition: MapEntityTransition | null = null;

  applyBootstrap(data: MapBootstrapInput): void {
    const player = cloneJson(data.self);
    this.player = player;
    this.time = data.time ?? null;
    if (shouldResetRememberedMap(player.mapId, data.mapMeta, data.minimap ?? null)) {
      deleteRememberedMap(player.mapId);
    }
    this.mapMeta = data.mapMeta;
    cacheMapMeta(data.mapMeta);
    this.visibleMinimapMarkers = cloneJson(data.visibleMinimapMarkers ?? []);
    rememberVisibleMarkers(player.mapId, this.visibleMinimapMarkers);
    cacheUnlockedMinimapLibrary(data.minimapLibrary);
    player.unlockedMinimapIds = data.minimapLibrary.map((entry) => entry.mapId).sort();
    this.minimapSnapshot = data.minimap ?? (
      player.unlockedMinimapIds.includes(player.mapId)
        ? getCachedMapSnapshot(player.mapId)
        : null
    );
    if (data.minimap) {
      cacheMapSnapshot(player.mapId, data.minimap, { meta: data.mapMeta, unlocked: true });
    }

    this.tileCache.clear();
    this.visibleTiles.clear();
    hydrateTileCacheFromMemory(player.mapId, this.tileCache);
    this.cacheVisibleTiles(player.mapId, data.tiles, player.x - this.getViewRadius(), player.y - this.getViewRadius());
    this.awaitingFullVisibilityMapId = null;

    this.entities = data.players.map(toObservedEntity);
    this.entityMap = new Map(this.entities.map((entry) => [entry.id, entry]));
    publishLatestObservedEntitiesSnapshot(this.entities);
    this.groundPiles.clear();
    this.pathCells = [];
    this.threatArrows = [];
    this.entityTransition = { snapCamera: true };
    this.tickTiming.startedAt = performance.now();
  }

  applyMapStaticSync(data: S2C_MapStaticSync): void {
    if (!this.player) {
      return;
    }

    if (data.mapMeta && data.mapId === this.player.mapId) {
      this.mapMeta = data.mapMeta;
    }
    if (data.mapMeta) {
      if (shouldResetRememberedMap(data.mapId, data.mapMeta, data.minimap)) {
        deleteRememberedMap(data.mapId);
      }
      cacheMapMeta(data.mapMeta);
    }
    if (data.minimapLibrary) {
      cacheUnlockedMinimapLibrary(data.minimapLibrary);
      this.player.unlockedMinimapIds = data.minimapLibrary.map((entry) => entry.mapId).sort();
      if (data.mapId === this.player.mapId && !this.minimapSnapshot && this.player.unlockedMinimapIds.includes(this.player.mapId)) {
        this.minimapSnapshot = getCachedMapSnapshot(this.player.mapId);
      }
    }
    if (data.visibleMinimapMarkers !== undefined && data.mapId === this.player.mapId) {
      this.visibleMinimapMarkers = cloneJson(data.visibleMinimapMarkers);
      rememberVisibleMarkers(data.mapId, this.visibleMinimapMarkers);
    } else if (data.mapId === this.player.mapId && ((data.visibleMinimapMarkerAdds?.length ?? 0) > 0 || (data.visibleMinimapMarkerRemoves?.length ?? 0) > 0)) {
      this.visibleMinimapMarkers = this.mergeVisibleMinimapMarkerPatches(
        data.visibleMinimapMarkerAdds ?? [],
        data.visibleMinimapMarkerRemoves ?? [],
      );
      if ((data.visibleMinimapMarkerAdds?.length ?? 0) > 0) {
        rememberVisibleMarkers(data.mapId, data.visibleMinimapMarkerAdds ?? []);
      }
    }
    if ('minimap' in data && data.mapId === this.player.mapId) {
      this.minimapSnapshot = data.minimap ?? null;
    }
    if (data.minimap) {
      cacheMapSnapshot(data.mapId, data.minimap, { meta: data.mapMeta ?? (data.mapId === this.player.mapId ? this.mapMeta : null), unlocked: true });
    }
  }

  applyNextWorldDelta(data: MapNextWorldDeltaInput): void {
    if (!this.player) {
      return;
    }

    const oldX = this.player.x;
    const oldY = this.player.y;
    const selfPatch = data.playerPatches.find((patch) => patch.id === this.player?.id);
    if (selfPatch) {
      if (selfPatch.name) {
        this.player.name = selfPatch.name;
      }
      this.player.x = selfPatch.x;
      this.player.y = selfPatch.y;
    }
    if (data.groundPatches) {
      this.groundPiles = this.mergeGroundItemPatches(data.groundPatches);
    }
    this.entities = this.mergeTickEntities(data.playerPatches, data.entityPatches, data.removedEntityIds ?? []);
    publishLatestObservedEntitiesSnapshot(this.entities);
    const moved = this.player.x !== oldX || this.player.y !== oldY;
    this.entityTransition = moved
      ? {
          movedId: this.player.id,
          shiftX: this.player.x - oldX,
          shiftY: this.player.y - oldY,
        }
      : { settleMotion: true };
    this.tickTiming.startedAt = performance.now();
  }

  applyNextSelfDelta(data: MapNextSelfDeltaInput): void {
    if (!this.player) {
      return;
    }

    const nextMapId = typeof data.mapId === 'string' && data.mapId ? data.mapId : undefined;
    const mapChanged = Boolean(nextMapId && nextMapId !== this.player.mapId);
    if (mapChanged && nextMapId) {
      this.mapMeta = null;
      this.tileCache.clear();
      this.visibleTiles.clear();
      this.visibleTileRevision += 1;
      this.minimapMemoryVersion = 0;
      this.minimapSnapshot = null;
      this.visibleMinimapMarkers = [];
      this.groundPiles.clear();
      this.entities = [];
      this.entityMap.clear();
      this.threatArrows = [];
      this.pathCells = [];
      this.player.mapId = nextMapId;
      this.minimapSnapshot = (this.player.unlockedMinimapIds ?? []).includes(this.player.mapId)
        ? getCachedMapSnapshot(this.player.mapId)
        : null;
      hydrateTileCacheFromMemory(this.player.mapId, this.tileCache);
      this.awaitingFullVisibilityMapId = this.player.mapId;
    }

    if (typeof data.hp === 'number') {
      this.player.hp = data.hp;
    }
    if (typeof data.qi === 'number') {
      this.player.qi = data.qi;
    }
    if (data.facing !== undefined) {
      this.player.facing = data.facing as Direction;
    }

    const oldX = this.player.x;
    const oldY = this.player.y;
    if (typeof data.x === 'number') {
      this.player.x = data.x;
    }
    if (typeof data.y === 'number') {
      this.player.y = data.y;
    }
    if (data.playerPatch?.name) {
      this.player.name = data.playerPatch.name;
    }
    if (data.playerPatch) {
      this.entities = this.mergeTickEntities([data.playerPatch], [], []);
      publishLatestObservedEntitiesSnapshot(this.entities);
    }

    const moved = !mapChanged && (this.player.x !== oldX || this.player.y !== oldY);
    this.entityTransition = mapChanged
      ? { snapCamera: true }
      : moved
        ? {
            movedId: this.player.id,
            shiftX: this.player.x - oldX,
            shiftY: this.player.y - oldY,
          }
        : { settleMotion: true };
    this.tickTiming.startedAt = performance.now();
  }

  replaceVisibleEntities(entities: ObservedMapEntity[], transition: MapEntityTransition | null = null): void {
    this.entities = entities.map((entry) => cloneJson(entry));
    this.entityMap = new Map(this.entities.map((entry) => [entry.id, entry]));
    publishLatestObservedEntitiesSnapshot(this.entities);
    this.entityTransition = transition;
  }

  setPathCells(cells: Array<{ x: number; y: number }>): void {
    this.pathCells = cells.map((cell) => ({ x: cell.x, y: cell.y }));
  }

  setTargetingOverlay(state: MapTargetingOverlayState | null): void {
    this.targeting = state ? cloneJson(state) : null;
  }

  setSenseQiOverlay(state: MapSenseQiOverlayState | null): void {
    this.senseQi = state ? { ...state } : null;
  }

  reset(): void {
    this.mapMeta = null;
    this.player = null;
    this.minimapSnapshot = null;
    this.visibleMinimapMarkers = [];
    this.time = null;
    this.tileCache.clear();
    this.visibleTiles.clear();
    this.entities = [];
    this.entityMap.clear();
    this.groundPiles.clear();
    this.pathCells = [];
    this.targeting = null;
    this.senseQi = null;
    this.threatArrows = [];
    this.minimapMemoryVersion = 0;
    this.awaitingFullVisibilityMapId = null;
    this.entityTransition = null;
    publishLatestObservedEntitiesSnapshot([]);
    this.tickTiming.startedAt = performance.now();
    this.tickTiming.durationMs = 1000;
    this.visibleTileRevision += 1;
  }

  getViewRadius(): number {
    return this.time?.effectiveViewRange ?? this.player?.viewRange ?? VIEW_RADIUS;
  }

  getMapMeta(): MapMeta | null {
    return this.mapMeta;
  }

  getKnownTileAt(x: number, y: number): Tile | null {
    return this.tileCache.get(`${x},${y}`) ?? null;
  }

  getVisibleTileAt(x: number, y: number): Tile | null {
    const key = `${x},${y}`;
    if (!this.visibleTiles.has(key)) {
      return null;
    }
    return this.tileCache.get(key) ?? null;
  }

  getGroundPileAt(x: number, y: number): GroundItemPileView | null {
    return this.groundPiles.get(`${x},${y}`) ?? null;
  }

  getSnapshot(): MapStoreSnapshot {
    return {
      mapMeta: this.mapMeta,
      player: this.player
        ? {
            id: this.player.id,
            x: this.player.x,
            y: this.player.y,
            mapId: this.player.mapId,
            viewRange: this.player.viewRange,
            senseQiActive: this.player.senseQiActive,
          }
        : null,
      time: this.time,
      tileCache: this.tileCache,
      visibleTiles: this.visibleTiles,
      visibleTileRevision: this.visibleTileRevision,
      entities: this.entities,
      groundPiles: this.groundPiles,
      overlays: {
        pathCells: this.pathCells,
        targeting: this.targeting,
        senseQi: this.senseQi,
        threatArrows: this.threatArrows,
      },
      minimap: {
        mapMeta: this.mapMeta,
        snapshot: this.minimapSnapshot,
        rememberedMarkers: this.player ? getRememberedMarkers(this.player.mapId) : [],
        visibleMarkers: this.visibleMinimapMarkers,
        tileCache: this.tileCache,
        visibleTiles: this.visibleTiles,
        visibleEntities: this.entities,
        groundPiles: this.groundPiles,
        player: this.player ? { x: this.player.x, y: this.player.y } : null,
        viewRadius: this.getViewRadius(),
        memoryVersion: this.minimapMemoryVersion,
      },
      tickTiming: this.tickTiming,
      entityTransition: this.entityTransition,
    };
  }

  getTickTiming(): MapStoreSnapshot['tickTiming'] {
    return this.tickTiming;
  }

  private mergeTickEntities(
    playerPatches: TickRenderEntity[],
    entityPatches: TickRenderEntity[],
    removedEntityIds: string[] = [],
  ): ObservedMapEntity[] {
    const removedIdSet = new Set(removedEntityIds);
    const merged = this.entities
      .filter((entity) => !removedIdSet.has(entity.id))
      .map((entity) => cloneJson(entity));
    const nextMap = new Map<string, ObservedMapEntity>(merged.map((entity) => [entity.id, entity]));

    for (const patch of [...playerPatches, ...entityPatches]) {
      const previous = nextMap.get(patch.id);
      const next = mergeObservedEntityPatch(patch, previous);
      if (previous) {
        const index = merged.findIndex((entity) => entity.id === patch.id);
        if (index >= 0) {
          merged[index] = next;
        }
      } else {
        merged.push(next);
      }
      nextMap.set(next.id, next);
    }

    this.entityMap = nextMap;
    return merged;
  }

  private mergeGroundItemPatches(patches: GroundItemPilePatch[]): Map<string, GroundItemPileView> {
    const nextMap = new Map(this.groundPiles);
    for (const patch of patches) {
      const key = `${patch.x},${patch.y}`;
      if (patch.items === null) {
        nextMap.delete(key);
        continue;
      }
      if (patch.items === undefined) {
        continue;
      }
      nextMap.set(key, {
        sourceId: patch.sourceId,
        x: patch.x,
        y: patch.y,
        items: cloneJson(patch.items),
      });
    }
    return nextMap;
  }

  private mergeVisibleMinimapMarkerPatches(
    adds: MapMinimapMarker[],
    removes: string[],
  ): MapMinimapMarker[] {
    const nextMap = new Map(this.visibleMinimapMarkers.map((marker) => [marker.id, cloneJson(marker)]));
    for (const markerId of removes) {
      nextMap.delete(markerId);
    }
    for (const marker of adds) {
      nextMap.set(marker.id, cloneJson(marker));
    }
    return [...nextMap.values()];
  }

  private mergeThreatArrowPatches(
    adds: Array<[string, string]>,
    removes: Array<[string, string]>,
  ): Array<{ ownerId: string; targetId: string }> {
    const nextMap = new Map(
      this.threatArrows.map((entry) => [buildThreatArrowKey(entry.ownerId, entry.targetId), { ...entry }]),
    );
    for (const [ownerId, targetId] of removes) {
      nextMap.delete(buildThreatArrowKey(ownerId, targetId));
    }
    for (const [ownerId, targetId] of adds) {
      if (!ownerId || !targetId) {
        continue;
      }
      nextMap.set(buildThreatArrowKey(ownerId, targetId), { ownerId, targetId });
    }
    return [...nextMap.values()];
  }

  private applyVisibleTilePatches(mapId: string, patches: VisibleTilePatch[]): void {
    rememberVisibleTilePatches(mapId, patches);
    for (const patch of patches) {
      const key = `${patch.x},${patch.y}`;
      if (patch.tile) {
        this.visibleTiles.add(key);
        this.tileCache.set(key, cloneJson(patch.tile));
        continue;
      }
      this.visibleTiles.delete(key);
    }
    this.minimapMemoryVersion += 1;
    this.visibleTileRevision += 1;
  }

  private cacheVisibleTiles(mapId: string, tiles: VisibleTile[][], originX: number, originY: number): void {
    this.visibleTiles.clear();
    rememberVisibleTiles(mapId, tiles, originX, originY);
    for (let rowIndex = 0; rowIndex < tiles.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < tiles[rowIndex].length; columnIndex += 1) {
        const tile = tiles[rowIndex][columnIndex];
        const key = `${originX + columnIndex},${originY + rowIndex}`;
        if (!tile) {
          continue;
        }
        this.visibleTiles.add(key);
        this.tileCache.set(key, cloneJson(tile));
      }
    }
    this.minimapMemoryVersion += 1;
    this.visibleTileRevision += 1;
    if (this.awaitingFullVisibilityMapId === mapId) {
      this.awaitingFullVisibilityMapId = null;
    }
  }
}
