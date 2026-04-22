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
  type S2C_MapStatic,
  type TickRenderEntity,
  type Tile,
  type VisibleTile,
  type VisibleTilePatch,
  clonePlainValue,
  getFirstGrapheme,
} from '@mud/shared';
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
  MapSelfDeltaInput,
  MapWorldDeltaInput,
  MapSenseQiOverlayState,
  MapStoreSnapshot,
  MapTargetingOverlayState,
  ObservedMapEntity,
} from '../types';

let latestObservedEntitiesSnapshot: readonly ObservedMapEntity[] = [];
const PVP_SHA_INFUSION_BUFF_ID = 'pvp.sha_infusion';
const PVP_SHA_DEMONIZED_STACK_THRESHOLD = 20;

/** 获取最近一次刷新后的可见实体快照，供 UI 和交互层读取。 */
export function getLatestObservedEntitiesSnapshot(): readonly ObservedMapEntity[] {
  return latestObservedEntitiesSnapshot;
}

/** 覆盖最新可见实体快照，供只读读取路径共享。 */
function publishLatestObservedEntitiesSnapshot(entities: readonly ObservedMapEntity[]): void {
  latestObservedEntitiesSnapshot = entities;
}

/** 克隆对象，确保状态快照不共享引用。 */
function cloneJson<T>(value: T): T {
  return clonePlainValue(value);
}

/** 按值优先级处理补丁：null 表示清空，undefined 表示不更新。 */
function applyNullablePatch<T>(value: T | null | undefined, fallback: T | undefined): T | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (value === null) {
    return undefined;
  }
  if (value !== undefined) {
    return value;
  }
  return fallback;
}

function isDemonizedBuffCarrier(buffs: readonly { buffId: string; stacks: number }[] | null | undefined): boolean {
  return (buffs ?? []).some((buff) => (
    buff.buffId === PVP_SHA_INFUSION_BUFF_ID
    && Math.max(0, Math.round(buff.stacks ?? 0)) > PVP_SHA_DEMONIZED_STACK_THRESHOLD
  ));
}

function decorateObservedEntity(entity: ObservedMapEntity, player: PlayerState | null): ObservedMapEntity {
  const badge = entity.badge ?? (
    entity.kind === 'player' && isDemonizedBuffCarrier(entity.buffs)
      ? { text: '魔', tone: 'demonic' as const }
      : undefined
  );
  const hostile = entity.kind === 'player'
    && player !== null
    && entity.id !== player.id
    && (player.allowAoePlayerHit === true || player.retaliatePlayerTargetId === entity.id);
  return {
    ...entity,
    badge,
    hostile,
  };
}

/** 将服务端渲染实体标准化为本地可观察实体快照。 */
function toObservedEntity(entity: RenderEntity): ObservedMapEntity {
  return {
    id: entity.id,
    wx: entity.x,
    wy: entity.y,
    char: entity.char,
    color: entity.color,
    badge: entity.badge,
    hostile: false,
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

/** 用增量 patch 覆盖已有实体字段，缺失值回退到旧值。 */
function mergeObservedEntityPatch(patch: TickRenderEntity, previous?: ObservedMapEntity): ObservedMapEntity {
  return {
    id: patch.id,
    wx: patch.x,
    wy: patch.y,
    char: patch.char ?? previous?.char ?? '?',
    color: patch.color ?? previous?.color ?? '#fff',
    badge: previous?.badge,
    hostile: previous?.hostile,
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

/** 从本地玩家状态构造高优先级实体快照。 */
function buildLocalPlayerEntity(player: PlayerState, previous?: ObservedMapEntity): ObservedMapEntity {
  return {
    id: player.id,
    wx: player.x,
    wy: player.y,
    char: getFirstGrapheme(player.displayName ?? player.name ?? '') || previous?.char || '我',
    color: previous?.color ?? '#7ee787',
    badge: previous?.badge,
    hostile: false,
    name: player.name,
    kind: 'player',
    hp: player.hp,
    maxHp: player.maxHp,
    qi: player.qi,
    maxQi: player.numericStats?.maxQi,
    npcQuestMarker: previous?.npcQuestMarker,
    observation: previous?.observation,
    buffs: player.temporaryBuffs ? cloneJson(player.temporaryBuffs) : previous?.buffs,
  };
}

/** 使用“owner->target”拼接唯一定位威胁箭头键。 */
function buildThreatArrowKey(ownerId: string, targetId: string): string {
  return `${ownerId}->${targetId}`;
}

/** 判断 tick patch 是否包含位移信息。 */
function hasSpatialTickEntityDelta(patch: TickRenderEntity | undefined | null): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!patch) {
    return false;
  }
  return typeof patch.x === 'number' || typeof patch.y === 'number';
}

/** 全量比较两个小地图快照是否一致（元数据与标记）。 */
function isSameMinimapSnapshot(left: MapMinimapSnapshot | null, right: MapMinimapSnapshot | null): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 判断缓存小地图数据是否与最新快照不一致，需要清理。 */
function shouldResetRememberedMap(mapId: string, nextMeta: MapMeta | null | undefined, nextSnapshot: MapMinimapSnapshot | null | undefined): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 地图运行态存储，维护可见地块、实体、叠加层与时间线状态。 */
export class MapStore {
  /** 当前所在地图静态信息。 */
  private mapMeta: MapMeta | null = null;
  /** 当前玩家状态。 */
  private player: PlayerState | null = null;
  /** 小地图缓存快照，优先回退到本地记忆。 */
  private minimapSnapshot: MapMinimapSnapshot | null = null;
  /** 玩家显式标记（主线/日常/事件）的可见列表。 */
  private visibleMinimapMarkers: MapMinimapMarker[] = [];
  /** 当前地图时间与视域相关的运行态信息。 */
  private time = null as MapStoreSnapshot['time'];
  /** 地块可见性缓存，key 为 "x,y"。 */
  private tileCache = new Map<string, Tile>();
  /** 当前会话内可见地块 key 集合。 */
  private visibleTiles = new Set<string>();
  /** 可见地块版本号，用于渲染层增量判断。 */
  private visibleTileRevision = 0;
  /** 当前已知实体列表（含自身与其他可见对象）。 */
  private entities: ObservedMapEntity[] = [];
  /** 实体 ID 到实体快照索引。 */
  private entityMap = new Map<string, ObservedMapEntity>();
  /** 地面物品堆叠索引，key 为 "x,y"。 */
  private groundPiles = new Map<string, GroundItemPileView>();  
  /**
 * pathCells：路径Cell相关字段。
 */

  private pathCells: Array<{  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }> = [];
  /** 当前寻路/施法叠加层状态。 */
  private targeting: MapTargetingOverlayState | null = null;
  /** 感气视角叠加层状态。 */
  private senseQi: MapSenseQiOverlayState | null = null;  
  /**
 * threatArrows：集合字段。
 */

  private threatArrows: Array<{  
  /**
 * ownerId：ownerID标识。
 */
 ownerId: string;  
 /**
 * targetId：目标ID标识。
 */
 targetId: string }> = [];
  /** 小地图增量版本，推动 minimap 列表与可见性更新。 */
  private minimapMemoryVersion = 0;
  /** 地图切换后等待首批完整可见块到达时的占位标记。 */
  private awaitingFullVisibilityMapId: string | null = null;  
  /**
 * tickTiming：tickTiming相关字段。
 */

  private tickTiming = {
    startedAt: performance.now(),
    durationMs: 500,
  };
  /** 本地实体运动过渡信息，用于下一次插值渲染。 */
  private entityTransition: MapEntityTransition | null = null;
  /** 记录已由 WorldDelta 预加载的新图实体 mapId，避免后续 SelfDelta 再清掉。 */
  private preloadedEntityMapId: string | null = null;

  /** 首次接入/重连时初始化地图状态与基础缓存。 */
  applyBootstrap(data: MapBootstrapInput): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = cloneJson(data.self);
    this.player = player;
    this.time = data.time ?? null;
    const mapMeta = data.mapMeta ?? getCachedMapMeta(player.mapId);
    const minimapLibrary = data.minimapLibrary ?? [];
    const visibleTiles = Array.isArray(data.tiles) ? data.tiles : [];
    const renderPlayers = Array.isArray(data.players) ? data.players : [];
    if (mapMeta && shouldResetRememberedMap(player.mapId, mapMeta, data.minimap ?? null)) {
      deleteRememberedMap(player.mapId);
    }
    if (mapMeta) {
      this.mapMeta = mapMeta;
      cacheMapMeta(mapMeta);
    }
    this.visibleMinimapMarkers = cloneJson(data.visibleMinimapMarkers ?? []);
    rememberVisibleMarkers(player.mapId, this.visibleMinimapMarkers);
    if (minimapLibrary.length > 0) {
      cacheUnlockedMinimapLibrary(minimapLibrary);
      player.unlockedMinimapIds = minimapLibrary.map((entry) => entry.mapId).sort();
    }
    if (!Array.isArray(player.unlockedMinimapIds)) {
      player.unlockedMinimapIds = [];
    }
    this.minimapSnapshot = data.minimap ?? (
      player.unlockedMinimapIds.includes(player.mapId)
        ? getCachedMapSnapshot(player.mapId)
        : null
    );
    if (data.minimap) {
      cacheMapSnapshot(player.mapId, data.minimap, { meta: mapMeta ?? null, unlocked: true });
    }

    this.tileCache.clear();
    this.visibleTiles.clear();
    hydrateTileCacheFromMemory(player.mapId, this.tileCache);
    if (visibleTiles.length > 0) {
      this.cacheVisibleTiles(player.mapId, visibleTiles, player.x - this.getViewRadius(), player.y - this.getViewRadius());
    }
    this.awaitingFullVisibilityMapId = null;

    this.entities = [buildLocalPlayerEntity(player), ...renderPlayers.map(toObservedEntity).filter((entry) => entry.id !== player.id)];
    this.entityMap = new Map(this.entities.map((entry) => [entry.id, entry]));
    publishLatestObservedEntitiesSnapshot(this.entities);
    this.groundPiles.clear();
    this.pathCells = [];
    this.threatArrows = [];
    this.entityTransition = { snapCamera: true };
    this.tickTiming.startedAt = performance.now();
  }

  /** 接收地图静态信息更新：元数据、可见块与小地图元数据。 */
  applyMapStatic(data: S2C_MapStatic): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.player) {
      return;
    }
    const dataWithTiles = data as S2C_MapStatic & {    
    /**
 * tiles：tile相关字段。
 */

      tiles?: VisibleTile[][];      
      /**
 * tilesOriginX：tileOriginX相关字段。
 */

      tilesOriginX?: number;      
      /**
 * tilesOriginY：tileOriginY相关字段。
 */

      tilesOriginY?: number;      
    };
    if (Array.isArray(dataWithTiles.tiles)
      && typeof dataWithTiles.tilesOriginX === 'number'
      && typeof dataWithTiles.tilesOriginY === 'number'
      && data.mapId === this.player.mapId) {
      this.cacheVisibleTiles(data.mapId, dataWithTiles.tiles, dataWithTiles.tilesOriginX, dataWithTiles.tilesOriginY);
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
    }
    if ('minimap' in data && data.mapId === this.player.mapId) {
      this.minimapSnapshot = data.minimap ?? null;
    }
    if (data.minimap) {
      cacheMapSnapshot(data.mapId, data.minimap, { meta: data.mapMeta ?? (data.mapId === this.player.mapId ? this.mapMeta : null), unlocked: true });
    }
  }

  /** 处理世界级增量：实体移动、威胁箭头、地块更新与时间推进。 */
  applyWorldDelta(data: MapWorldDeltaInput): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.player) {
      return;
    }
    const hintedMapId = typeof data.mapId === 'string' && data.mapId
      ? data.mapId
      : this.player.mapId;
    const preloadingDifferentMap = hintedMapId !== this.player.mapId;
    if (preloadingDifferentMap) {
      this.groundPiles.clear();
      this.entities = [];
      this.entityMap.clear();
      this.threatArrows = [];
      this.preloadedEntityMapId = hintedMapId;
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
    if (data.time) {
      this.time = data.time;
    }
    if (Array.isArray(data.threatArrows)) {
      this.threatArrows = data.threatArrows
        .map((entry) => ({ ownerId: entry.ownerId, targetId: entry.targetId }))
        .filter((entry) => entry.ownerId && entry.targetId);
    } else if ((data.threatArrowAdds?.length ?? 0) > 0 || (data.threatArrowRemoves?.length ?? 0) > 0) {
      this.threatArrows = this.mergeThreatArrowPatches(
        data.threatArrowAdds ?? [],
        data.threatArrowRemoves ?? [],
      );
    }
    if (Array.isArray(data.pathCells)) {
      this.pathCells = data.pathCells.map((cell) => ({ x: cell.x, y: cell.y }));
    }
    if (Array.isArray(data.visibleTiles) && !preloadingDifferentMap) {
      this.cacheVisibleTiles(
        this.player.mapId,
        data.visibleTiles,
        this.player.x - this.getViewRadius(),
        this.player.y - this.getViewRadius(),
      );
    } else if (!preloadingDifferentMap && Array.isArray(data.visibleTilePatches) && data.visibleTilePatches.length > 0) {
      this.applyVisibleTilePatches(this.player.mapId, data.visibleTilePatches);
    }
    if (!preloadingDifferentMap && ((data.visibleMinimapMarkerAdds?.length ?? 0) > 0 || (data.visibleMinimapMarkerRemoves?.length ?? 0) > 0)) {
      this.visibleMinimapMarkers = this.mergeVisibleMinimapMarkerPatches(
        data.visibleMinimapMarkerAdds ?? [],
        data.visibleMinimapMarkerRemoves ?? [],
      );
      if ((data.visibleMinimapMarkerAdds?.length ?? 0) > 0) {
        rememberVisibleMarkers(this.player.mapId, data.visibleMinimapMarkerAdds ?? []);
      }
    }
    const hasEntityPatch = data.playerPatches.length > 0 || data.entityPatches.length > 0 || (data.removedEntityIds?.length ?? 0) > 0;
    if (hasEntityPatch) {
      this.entities = this.mergeTickEntities(data.playerPatches, data.entityPatches, data.removedEntityIds ?? []);
      publishLatestObservedEntitiesSnapshot(this.entities);
    }
    const moved = this.player.x !== oldX || this.player.y !== oldY;
    const hasSpatialEntityDelta = moved
      || (data.removedEntityIds?.length ?? 0) > 0
      || data.playerPatches.some((patch) => hasSpatialTickEntityDelta(patch))
      || data.entityPatches.some((patch) => hasSpatialTickEntityDelta(patch));
    if (hasSpatialEntityDelta) {
      this.entityTransition = moved
        ? {
            movedId: this.player.id,
            shiftX: this.player.x - oldX,
            shiftY: this.player.y - oldY,
          }
        : { settleMotion: true };
      if (typeof data.tickDurationMs === 'number' && Number.isFinite(data.tickDurationMs) && data.tickDurationMs > 0) {
        this.tickTiming.durationMs = Math.max(1, Math.round(data.tickDurationMs * 0.5));
      }
      this.tickTiming.startedAt = performance.now();
    }
  }

  /** 处理本体增量：坐标、生命/真元变化、地图切换。 */
  applySelfDelta(data: MapSelfDeltaInput): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      this.pathCells = [];
      if (this.preloadedEntityMapId !== nextMapId) {
        this.groundPiles.clear();
        this.entities = [];
        this.entityMap.clear();
        this.threatArrows = [];
      }
      this.player.mapId = nextMapId;
      this.minimapSnapshot = (this.player.unlockedMinimapIds ?? []).includes(this.player.mapId)
        ? getCachedMapSnapshot(this.player.mapId)
        : null;
      hydrateTileCacheFromMemory(this.player.mapId, this.tileCache);
      this.awaitingFullVisibilityMapId = this.player.mapId;
      this.preloadedEntityMapId = null;
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
    if (mapChanged) {
      this.entityTransition = { snapCamera: true };
      this.tickTiming.startedAt = performance.now();
      return;
    }
    if (moved) {
      this.entityTransition = {
        movedId: this.player.id,
        shiftX: this.player.x - oldX,
        shiftY: this.player.y - oldY,
      };
      this.tickTiming.startedAt = performance.now();
      return;
    }
    this.entityTransition = null;
  }

  /** 用新实体数组替换当前可见实体并更新过渡信息。 */
  replaceVisibleEntities(entities: ObservedMapEntity[], transition: MapEntityTransition | null = null): void {
    this.entities = entities.map((entry) => decorateObservedEntity(cloneJson(entry), this.player));
    this.entityMap = new Map(this.entities.map((entry) => [entry.id, entry]));
    publishLatestObservedEntitiesSnapshot(this.entities);
    this.entityTransition = transition;
  }

  /** 写入寻路路径用于前端高亮渲染。 */
  setPathCells(cells: Array<{  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }>): void {
    this.pathCells = cells.map((cell) => ({ x: cell.x, y: cell.y }));
  }

  /** 更新瞄准叠加层状态。 */
  setTargetingOverlay(state: MapTargetingOverlayState | null): void {
    this.targeting = state ? cloneJson(state) : null;
  }

  /** 更新感气叠加层状态。 */
  setSenseQiOverlay(state: MapSenseQiOverlayState | null): void {
    this.senseQi = state ? { ...state } : null;
  }

  /** 清空地图会话状态，保留实例可复用。 */
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
    this.tickTiming.durationMs = 500;
    this.visibleTileRevision += 1;
  }

  /** 校验并更新本地 tick 插值时长。 */
  setTickDurationMs(durationMs: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return;
    }
    this.tickTiming.durationMs = Math.max(1, Math.round(durationMs));
  }

  /** 读取当前视域半径（时间状态 > 玩家设置 > 默认常量）。 */
  getViewRadius(): number {
    return this.time?.effectiveViewRange ?? this.player?.viewRange ?? VIEW_RADIUS;
  }

  /** 获取当前地图元数据。 */
  getMapMeta(): MapMeta | null {
    return this.mapMeta;
  }

  /** 按坐标读取已知地块（不考虑可见性）。 */
  getKnownTileAt(x: number, y: number): Tile | null {
    return this.tileCache.get(`${x},${y}`) ?? null;
  }

  /** 按坐标读取当前可见地块。 */
  getVisibleTileAt(x: number, y: number): Tile | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const key = `${x},${y}`;
    if (!this.visibleTiles.has(key)) {
      return null;
    }
    return this.tileCache.get(key) ?? null;
  }

  /** 按坐标读取地面物品堆。 */
  getGroundPileAt(x: number, y: number): GroundItemPileView | null {
    return this.groundPiles.get(`${x},${y}`) ?? null;
  }

  /** 组装可供渲染/交互使用的只读快照。 */
  getSnapshot(): MapStoreSnapshot {
    return {
      mapMeta: this.mapMeta,
      player: this.player
        ? {
            id: this.player.id,
            x: this.player.x,
            y: this.player.y,
            char: getFirstGrapheme(this.player.displayName ?? this.player.name ?? '') || '我',
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

  /** 返回当前 tick 计时器。 */
  getTickTiming(): MapStoreSnapshot['tickTiming'] {
    return this.tickTiming;
  }  
  /**
 * mergeTickEntities：读取tickEntity并返回结果。
 * @param playerPatches TickRenderEntity[] 参数说明。
 * @param entityPatches TickRenderEntity[] 参数说明。
 * @param removedEntityIds string[] removedEntity ID 集合。
 * @returns 返回tickEntity列表。
 */


  private mergeTickEntities(
    playerPatches: TickRenderEntity[],
    entityPatches: TickRenderEntity[],
    removedEntityIds: string[] = [],
  ): ObservedMapEntity[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const removedIdSet = new Set(removedEntityIds);
    const merged = this.entities
      .filter((entity) => !removedIdSet.has(entity.id))
      .map((entity) => cloneJson(entity));
    const nextMap = new Map<string, ObservedMapEntity>(merged.map((entity) => [entity.id, entity]));
    if (this.player && !removedIdSet.has(this.player.id) && !nextMap.has(this.player.id)) {
      const localPlayerEntity = buildLocalPlayerEntity(this.player, this.entityMap.get(this.player.id));
      merged.unshift(localPlayerEntity);
      nextMap.set(localPlayerEntity.id, localPlayerEntity);
    }

    for (const patch of [...playerPatches, ...entityPatches]) {
      const previous = nextMap.get(patch.id);
      const next = mergeObservedEntityPatch(patch, previous);
      if (this.player && patch.id === this.player.id) {
        next.char = getFirstGrapheme(this.player.displayName ?? this.player.name ?? '') || next.char;
        next.name = this.player.name ?? next.name;
      }
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

    const decorated = merged.map((entity) => decorateObservedEntity(entity, this.player));
    this.entityMap = new Map(decorated.map((entity) => [entity.id, entity]));
    return decorated;
  }

  /** 合并地面物品增量，返回新 map 用于下发。 */
  private mergeGroundItemPatches(patches: GroundItemPilePatch[]): Map<string, GroundItemPileView> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * mergeVisibleMinimapMarkerPatches：判断可见MinimapMarkerPatche是否满足条件。
 * @param adds MapMinimapMarker[] 参数说明。
 * @param removes string[] 参数说明。
 * @returns 返回可见MinimapMarkerPatche列表。
 */


  private mergeVisibleMinimapMarkerPatches(
    adds: MapMinimapMarker[],
    removes: string[],
  ): MapMinimapMarker[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const nextMap = new Map(this.visibleMinimapMarkers.map((marker) => [marker.id, cloneJson(marker)]));
    for (const markerId of removes) {
      nextMap.delete(markerId);
    }
    for (const marker of adds) {
      nextMap.set(marker.id, cloneJson(marker));
    }
    return [...nextMap.values()];
  }  
  /**
 * mergeThreatArrowPatches：读取ThreatArrowPatche并返回结果。
 * @param adds Array<[string, string]> 参数说明。
 * @param removes Array<[string, string]> 参数说明。
 * @returns 返回ThreatArrowPatche。
 */


  private mergeThreatArrowPatches(
    adds: Array<[string, string]>,
    removes: Array<[string, string]>,
  ): Array<{  
  /**
 * ownerId：ownerID标识。
 */
 ownerId: string;  
 /**
 * targetId：目标ID标识。
 */
 targetId: string }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 按补丁方式更新可见块并提高 minimap 版本号。 */
  private applyVisibleTilePatches(mapId: string, patches: VisibleTilePatch[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** 重新缓存整块可见地块并重建可见集合。 */
  private cacheVisibleTiles(mapId: string, tiles: VisibleTile[][], originX: number, originY: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
