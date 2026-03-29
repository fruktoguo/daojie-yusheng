import {
  VIEW_RADIUS,
  type GroundItemPilePatch,
  type GroundItemPileView,
  type MapMeta,
  type MapMinimapMarker,
  type MapMinimapSnapshot,
  type PlayerState,
  type RenderEntity,
  type S2C_Init,
  type S2C_MapStaticSync,
  type S2C_Tick,
  type TickRenderEntity,
  type Tile,
  type VisibleTile,
  type VisibleTilePatch,
  clonePlainValue,
} from '@mud/shared';
import {
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
  getCachedMapSnapshot,
} from '../../map-static-cache';
import type {
  MapEntityTransition,
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
  private tickTiming = {
    startedAt: performance.now(),
    durationMs: 1000,
  };
  private entityTransition: MapEntityTransition | null = null;

  applyInit(data: S2C_Init): void {
    this.player = cloneJson(data.self);
    this.time = data.time ?? null;
    this.mapMeta = data.mapMeta;
    cacheMapMeta(data.mapMeta);
    this.visibleMinimapMarkers = cloneJson(data.visibleMinimapMarkers ?? []);
    rememberVisibleMarkers(this.player.mapId, this.visibleMinimapMarkers);
    cacheUnlockedMinimapLibrary(data.minimapLibrary);
    this.player.unlockedMinimapIds = data.minimapLibrary.map((entry) => entry.mapId).sort();
    this.minimapSnapshot = data.minimap ?? (
      this.player.unlockedMinimapIds.includes(this.player.mapId)
        ? getCachedMapSnapshot(this.player.mapId)
        : null
    );
    if (data.minimap) {
      cacheMapSnapshot(this.player.mapId, data.minimap, { meta: data.mapMeta, unlocked: true });
    }

    this.tileCache.clear();
    this.visibleTiles.clear();
    hydrateTileCacheFromMemory(this.player.mapId, this.tileCache);
    this.cacheVisibleTiles(this.player.mapId, data.tiles, this.player.x - this.getViewRadius(), this.player.y - this.getViewRadius());

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

  applyTick(data: S2C_Tick): void {
    if (!this.player) {
      return;
    }

    let mapChanged = false;
    if (data.time) {
      this.time = data.time;
    }

    if (data.m) {
      mapChanged = this.player.mapId !== data.m;
      if (mapChanged) {
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
      }
      this.player.mapId = data.m;
      if (mapChanged) {
        this.minimapSnapshot = (this.player.unlockedMinimapIds ?? []).includes(this.player.mapId)
          ? getCachedMapSnapshot(this.player.mapId)
          : null;
        hydrateTileCacheFromMemory(this.player.mapId, this.tileCache);
      }
    }

    if (typeof data.hp === 'number') {
      this.player.hp = data.hp;
    }
    if (typeof data.qi === 'number') {
      this.player.qi = data.qi;
    }
    if (data.f !== undefined) {
      this.player.facing = data.f;
    }

    const oldX = this.player.x;
    const oldY = this.player.y;
    for (const patch of data.p) {
      if (patch.id !== this.player.id) {
        continue;
      }
      if (patch.name) {
        this.player.name = patch.name;
      }
      this.player.x = patch.x;
      this.player.y = patch.y;
      break;
    }

    if (data.v) {
      this.cacheVisibleTiles(this.player.mapId, data.v, this.player.x - this.getViewRadius(), this.player.y - this.getViewRadius());
    }
    if (data.t) {
      this.applyVisibleTilePatches(this.player.mapId, data.t);
    }
    if (data.g) {
      this.groundPiles = this.mergeGroundItemPatches(data.g);
    }

    this.entities = this.mergeTickEntities(data.p, data.e, data.r);
    publishLatestObservedEntitiesSnapshot(this.entities);
    if (Array.isArray(data.threatArrows)) {
      this.threatArrows = data.threatArrows
        .map(([ownerId, targetId]) => ({ ownerId, targetId }))
        .filter((entry) => entry.ownerId && entry.targetId);
    } else if ((data.threatArrowAdds?.length ?? 0) > 0 || (data.threatArrowRemoves?.length ?? 0) > 0) {
      this.threatArrows = this.mergeThreatArrowPatches(
        data.threatArrowAdds ?? [],
        data.threatArrowRemoves ?? [],
      );
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

    if (data.path) {
      this.pathCells = data.path.map(([x, y]) => ({ x, y }));
    }
    if (data.dt) {
      this.tickTiming.durationMs = Math.max(1, Math.round(data.dt * 0.5));
    }
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
  }
}
