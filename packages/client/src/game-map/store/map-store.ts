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
  TileType,
  type VisibleTile,
  type VisibleTilePatch,
  clonePlainValue,
  doesTileTypeBlockSight,
  getFirstGrapheme,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
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
  getCachedUnlockedMapSnapshot,
  syncCachedUnlockedMapIds,
} from '../../map-static-cache';
import { TILE_HIDDEN_FADE_MS } from '../../constants/visuals/time-atmosphere';
import type {
  MapBootstrapInput,
  MapEntityTransition,
  MapFormationRangeOverlayState,
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
const DEFAULT_MOTION_DURATION_MS = 320;
const MIN_MOTION_DURATION_MS = 180;
const MAX_MOTION_DURATION_MS = 420;
const TICK_MOTION_DURATION_RATIO = 0.34;

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

function normalizeMotionDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return DEFAULT_MOTION_DURATION_MS;
  }
  const scaled = Math.round(durationMs * TICK_MOTION_DURATION_RATIO);
  return Math.max(MIN_MOTION_DURATION_MS, Math.min(MAX_MOTION_DURATION_MS, scaled));
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
    respawnRemainingTicks: entity.respawnRemainingTicks,
    respawnTotalTicks: entity.respawnTotalTicks,
    qi: entity.qi,
    maxQi: entity.maxQi,
    npcQuestMarker: entity.npcQuestMarker,
    observation: entity.observation,
    buffs: entity.buffs ? cloneJson(entity.buffs) : undefined,
    formationRadius: entity.formationRadius,
    formationRangeShape: entity.formationRangeShape,
    formationRangeHighlightColor: entity.formationRangeHighlightColor,
    formationBoundaryChar: entity.formationBoundaryChar,
    formationBoundaryColor: entity.formationBoundaryColor,
    formationBoundaryRangeHighlightColor: entity.formationBoundaryRangeHighlightColor,
    formationEyeVisibleWithoutSenseQi: entity.formationEyeVisibleWithoutSenseQi,
    formationRangeVisibleWithoutSenseQi: entity.formationRangeVisibleWithoutSenseQi,
    formationBoundaryVisibleWithoutSenseQi: entity.formationBoundaryVisibleWithoutSenseQi,
    formationShowText: entity.formationShowText,
    formationBlocksBoundary: entity.formationBlocksBoundary,
    formationOwnerSectId: entity.formationOwnerSectId,
    formationOwnerPlayerId: entity.formationOwnerPlayerId,
    formationActive: entity.formationActive,
    formationLifecycle: entity.formationLifecycle,
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
    respawnRemainingTicks: applyNullablePatch(patch.respawnRemainingTicks, previous?.respawnRemainingTicks),
    respawnTotalTicks: applyNullablePatch(patch.respawnTotalTicks, previous?.respawnTotalTicks),
    qi: applyNullablePatch(patch.qi, previous?.qi),
    maxQi: applyNullablePatch(patch.maxQi, previous?.maxQi),
    npcQuestMarker: applyNullablePatch(patch.npcQuestMarker, previous?.npcQuestMarker),
    observation: applyNullablePatch(patch.observation, previous?.observation),
    buffs: applyNullablePatch(patch.buffs, previous?.buffs),
    formationRadius: applyNullablePatch(patch.formationRadius, previous?.formationRadius),
    formationRangeShape: applyNullablePatch(patch.formationRangeShape, previous?.formationRangeShape),
    formationRangeHighlightColor: applyNullablePatch(patch.formationRangeHighlightColor, previous?.formationRangeHighlightColor),
    formationBoundaryChar: applyNullablePatch(patch.formationBoundaryChar, previous?.formationBoundaryChar),
    formationBoundaryColor: applyNullablePatch(patch.formationBoundaryColor, previous?.formationBoundaryColor),
    formationBoundaryRangeHighlightColor: applyNullablePatch(patch.formationBoundaryRangeHighlightColor, previous?.formationBoundaryRangeHighlightColor),
    formationEyeVisibleWithoutSenseQi: applyNullablePatch(patch.formationEyeVisibleWithoutSenseQi, previous?.formationEyeVisibleWithoutSenseQi),
    formationRangeVisibleWithoutSenseQi: applyNullablePatch(patch.formationRangeVisibleWithoutSenseQi, previous?.formationRangeVisibleWithoutSenseQi),
    formationBoundaryVisibleWithoutSenseQi: applyNullablePatch(patch.formationBoundaryVisibleWithoutSenseQi, previous?.formationBoundaryVisibleWithoutSenseQi),
    formationShowText: applyNullablePatch(patch.formationShowText, previous?.formationShowText),
    formationBlocksBoundary: applyNullablePatch(patch.formationBlocksBoundary, previous?.formationBlocksBoundary),
    formationOwnerSectId: applyNullablePatch(patch.formationOwnerSectId, previous?.formationOwnerSectId),
    formationOwnerPlayerId: applyNullablePatch(patch.formationOwnerPlayerId, previous?.formationOwnerPlayerId),
    formationActive: applyNullablePatch(patch.formationActive, previous?.formationActive),
    formationLifecycle: applyNullablePatch(patch.formationLifecycle, previous?.formationLifecycle),
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
  /** 已解锁整图转出的静态地形缓存，只用于视野外渲染 fallback。 */
  private snapshotTileCache = new Map<string, Tile>();
  /** 主视图使用的渲染缓存：已解锁整图为底，视野/记忆覆盖其上。 */
  private renderTileCache = new Map<string, Tile>();
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
  private formationRange: MapFormationRangeOverlayState | null = null;
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
    durationMs: DEFAULT_MOTION_DURATION_MS,
  };
  /** 当前视野可见性过渡时间轴，与玩家移动 tick 尽量对齐。 */
  private visibleTileTransition = {
    startedAt: performance.now(),
    durationMs: TILE_HIDDEN_FADE_MS,
  };
  /** 本地实体运动过渡信息，用于下一次插值渲染。 */
  private entityTransition: MapEntityTransition | null = null;
  /** 记录已由 WorldDelta 预加载的新图实体 mapId，避免后续 SelfDelta 再清掉。 */
  private preloadedEntityMapId: string | null = null;

  /** 设置当前地图完整舆图快照，并同步主视图渲染 fallback。 */
  private setMinimapSnapshot(snapshot: MapMinimapSnapshot | null): void {
    this.minimapSnapshot = snapshot;
    this.rebuildSnapshotTileCache();
    this.rebuildRenderTileCache();
  }

  /** 从已解锁整图快照预建静态地形缓存，避免主视图视野外只能依赖记忆。 */
  private rebuildSnapshotTileCache(): void {
    this.snapshotTileCache.clear();
    const snapshot = this.minimapSnapshot;
    if (!snapshot || snapshot.terrainRows.length === 0) {
      return;
    }
    for (let y = 0; y < snapshot.terrainRows.length; y += 1) {
      const row = snapshot.terrainRows[y] ?? '';
      for (let x = 0; x < row.length; x += 1) {
        const type = getTileTypeFromMapChar(row[x] ?? '.');
        this.snapshotTileCache.set(`${x},${y}`, {
          type,
          walkable: isTileTypeWalkable(type),
          blocksSight: doesTileTypeBlockSight(type),
          aura: 0,
          occupiedBy: null,
          modifiedAt: null,
        });
      }
    }
  }

  /** 叠合静态整图与本地记忆/当前视野，供主 Canvas 渲染和命中读取使用。 */
  private rebuildRenderTileCache(): void {
    this.renderTileCache = new Map<string, Tile>();
    for (const [key, tile] of this.snapshotTileCache.entries()) {
      this.renderTileCache.set(key, { ...tile });
    }
    for (const [key, tile] of this.tileCache.entries()) {
      this.renderTileCache.set(key, { ...tile });
    }
  }

  /** 删除记忆后只保留当前可见块，避免旧记忆继续污染主视图。 */
  private rebuildTileCacheFromVisibleTiles(): void {
    const visibleOnlyTileCache = new Map<string, Tile>();
    for (const key of this.visibleTiles) {
      const tile = this.tileCache.get(key) ?? this.renderTileCache.get(key);
      if (tile) {
        visibleOnlyTileCache.set(key, cloneJson(tile));
      }
    }
    this.tileCache = visibleOnlyTileCache;
    this.minimapMemoryVersion += 1;
    this.visibleTileRevision += 1;
    this.visibleTileTransition = {
      startedAt: performance.now(),
      durationMs: TILE_HIDDEN_FADE_MS,
    };
    this.rebuildRenderTileCache();
  }

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
    syncCachedUnlockedMapIds(player.unlockedMinimapIds);
    this.setMinimapSnapshot(data.minimap ?? (
      player.unlockedMinimapIds.includes(player.mapId)
        ? getCachedUnlockedMapSnapshot(player.mapId)
        : null
    ));
    if (data.minimap) {
      cacheMapSnapshot(player.mapId, data.minimap, { meta: mapMeta ?? null, unlocked: true });
    }

    this.tileCache.clear();
    this.visibleTiles.clear();
    hydrateTileCacheFromMemory(player.mapId, this.tileCache);
    if (visibleTiles.length > 0) {
      this.cacheVisibleTiles(player.mapId, visibleTiles, player.x - this.getViewRadius(), player.y - this.getViewRadius());
    } else {
      this.rebuildRenderTileCache();
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
        if (data.mapId === this.player.mapId) {
          this.rebuildTileCacheFromVisibleTiles();
        }
      }
      cacheMapMeta(data.mapMeta);
    }
    if (data.minimapLibrary) {
      cacheUnlockedMinimapLibrary(data.minimapLibrary);
      this.player.unlockedMinimapIds = data.minimapLibrary.map((entry) => entry.mapId).sort();
      syncCachedUnlockedMapIds(this.player.unlockedMinimapIds);
      if (data.mapId === this.player.mapId && !this.minimapSnapshot && this.player.unlockedMinimapIds.includes(this.player.mapId)) {
        this.setMinimapSnapshot(getCachedUnlockedMapSnapshot(this.player.mapId));
      }
    }
    if (data.visibleMinimapMarkers !== undefined && data.mapId === this.player.mapId) {
      this.visibleMinimapMarkers = cloneJson(data.visibleMinimapMarkers);
      rememberVisibleMarkers(data.mapId, this.visibleMinimapMarkers);
    }
    if ('minimap' in data && data.mapId === this.player.mapId) {
      this.setMinimapSnapshot(data.minimap ?? null);
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
    const nextInstanceId = typeof data.instanceId === 'string' && data.instanceId.trim()
      ? data.instanceId.trim()
      : undefined;
    const instanceChanged = Boolean(nextInstanceId && nextInstanceId !== this.player.instanceId);
    if (preloadingDifferentMap || instanceChanged) {
      this.groundPiles.clear();
      this.entities = [];
      this.entityMap.clear();
      this.threatArrows = [];
      this.pathCells = [];
      this.preloadedEntityMapId = preloadingDifferentMap ? hintedMapId : null;
    }
    if (instanceChanged && nextInstanceId) {
      this.player.instanceId = nextInstanceId;
      this.tileCache.clear();
      this.visibleTiles.clear();
      this.visibleTileRevision += 1;
      this.rebuildRenderTileCache();
      this.visibleMinimapMarkers = [];
      this.awaitingFullVisibilityMapId = this.player.mapId;
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
    if (!preloadingDifferentMap && ((data.visibleMinimapMarkerAdds?.length ?? 0) > 0 || (data.visibleMinimapMarkerRemoves?.length ?? 0) > 0)) {
      this.visibleMinimapMarkers = this.mergeVisibleMinimapMarkerPatches(
        data.visibleMinimapMarkerAdds ?? [],
        data.visibleMinimapMarkerRemoves ?? [],
      );
      if ((data.visibleMinimapMarkerAdds?.length ?? 0) > 0) {
        rememberVisibleMarkers(this.player.mapId, data.visibleMinimapMarkerAdds ?? []);
      }
    }
    const moved = this.player.x !== oldX || this.player.y !== oldY;
    const hasVisibilityUpdate = !preloadingDifferentMap
      && (
        Array.isArray(data.visibleTiles)
        || (Array.isArray(data.visibleTilePatches) && data.visibleTilePatches.length > 0)
      );
    const transitionStartedAt = performance.now();
    if (typeof data.tickDurationMs === 'number' && Number.isFinite(data.tickDurationMs) && data.tickDurationMs > 0) {
      this.tickTiming.durationMs = normalizeMotionDurationMs(data.tickDurationMs);
    }
    if (hasVisibilityUpdate) {
      const visibilityClock = this.resolveVisibleTileTransitionClock(transitionStartedAt, moved);
      if (Array.isArray(data.visibleTiles)) {
        this.cacheVisibleTiles(
          this.player.mapId,
          data.visibleTiles,
          this.player.x - this.getViewRadius(),
          this.player.y - this.getViewRadius(),
          visibilityClock,
        );
      } else {
        this.applyVisibleTilePatches(this.player.mapId, data.visibleTilePatches ?? [], visibilityClock);
      }
    }
    const hasEntityPatch = data.playerPatches.length > 0 || data.entityPatches.length > 0 || (data.removedEntityIds?.length ?? 0) > 0;
    if (hasEntityPatch) {
      this.entities = this.mergeTickEntities(data.playerPatches, data.entityPatches, data.removedEntityIds ?? []);
      publishLatestObservedEntitiesSnapshot(this.entities);
    }
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
      this.tickTiming.startedAt = transitionStartedAt;
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
      this.setMinimapSnapshot(null);
      this.visibleMinimapMarkers = [];
      this.pathCells = [];
      if (this.preloadedEntityMapId !== nextMapId) {
        this.groundPiles.clear();
        this.entities = [];
        this.entityMap.clear();
        this.threatArrows = [];
      }
      this.player.mapId = nextMapId;
      this.setMinimapSnapshot((this.player.unlockedMinimapIds ?? []).includes(this.player.mapId)
        ? getCachedUnlockedMapSnapshot(this.player.mapId)
        : null);
      hydrateTileCacheFromMemory(this.player.mapId, this.tileCache);
      this.rebuildRenderTileCache();
      this.awaitingFullVisibilityMapId = this.player.mapId;
      this.preloadedEntityMapId = null;
    }
    if (typeof data.instanceId === 'string' && data.instanceId.trim()) {
      this.player.instanceId = data.instanceId.trim();
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

  /** 更新阵法布置范围叠加层状态。 */
  setFormationRangeOverlay(state: MapFormationRangeOverlayState | null): void {
    this.formationRange = state ? cloneJson(state) : null;
  }

  /** 更新感气叠加层状态。 */
  setSenseQiOverlay(state: MapSenseQiOverlayState | null): void {
    this.senseQi = state ? { ...state } : null;
  }

  /** 清空地图会话状态，保留实例可复用。 */
  reset(): void {
    this.mapMeta = null;
    this.player = null;
    this.setMinimapSnapshot(null);
    this.visibleMinimapMarkers = [];
    this.time = null;
    this.tileCache.clear();
    this.snapshotTileCache.clear();
    this.renderTileCache.clear();
    this.visibleTiles.clear();
    this.entities = [];
    this.entityMap.clear();
    this.groundPiles.clear();
    this.pathCells = [];
    this.targeting = null;
    this.formationRange = null;
    this.senseQi = null;
    this.threatArrows = [];
    this.minimapMemoryVersion = 0;
    this.awaitingFullVisibilityMapId = null;
    this.entityTransition = null;
    publishLatestObservedEntitiesSnapshot([]);
    this.tickTiming.startedAt = performance.now();
    this.tickTiming.durationMs = DEFAULT_MOTION_DURATION_MS;
    this.visibleTileTransition = {
      startedAt: this.tickTiming.startedAt,
      durationMs: TILE_HIDDEN_FADE_MS,
    };
    this.visibleTileRevision += 1;
  }

  /** 校验并更新本地 tick 插值时长。 */
  setTickDurationMs(durationMs: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return;
    }
    this.tickTiming.durationMs = normalizeMotionDurationMs(durationMs);
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
    return this.renderTileCache.get(`${x},${y}`) ?? null;
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

  /** 本地地图记忆被手动删除后，同步清理当前地图的记忆派生缓存。 */
  handleRememberedMapsDeleted(mapIds: readonly string[] | null): void {
    if (!this.player) {
      return;
    }
    if (mapIds !== null && !mapIds.includes(this.player.mapId)) {
      return;
    }
    this.rebuildTileCacheFromVisibleTiles();
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
      tileCache: this.renderTileCache,
      visibleTiles: this.visibleTiles,
      visibleTileRevision: this.visibleTileRevision,
      visibleTileTransitionStartedAt: this.visibleTileTransition.startedAt,
      visibleTileTransitionDurationMs: this.visibleTileTransition.durationMs,
      entities: this.entities,
      groundPiles: this.groundPiles,
      overlays: {
        pathCells: this.pathCells,
        targeting: this.targeting,
        formationRange: this.formationRange,
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
  private applyVisibleTilePatches(
    mapId: string,
    patches: VisibleTilePatch[],
    transitionClock: { startedAt: number; durationMs: number },
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedPatches = patches.map((patch) => ({
      ...patch,
      tile: normalizeVisibleTile(patch.tile),
    }));
    rememberVisibleTilePatches(mapId, normalizedPatches);
    for (const patch of normalizedPatches) {
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
    this.visibleTileTransition = transitionClock;
    this.rebuildRenderTileCache();
  }

  /** 重新缓存整块可见地块并重建可见集合。 */
  private cacheVisibleTiles(
    mapId: string,
    tiles: VisibleTile[][],
    originX: number,
    originY: number,
    transitionClock: { startedAt: number; durationMs: number } = {
      startedAt: performance.now(),
      durationMs: TILE_HIDDEN_FADE_MS,
    },
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.visibleTiles.clear();
    const normalizedTiles = tiles.map((row) => row.map((tile) => normalizeVisibleTile(tile)));
    rememberVisibleTiles(mapId, normalizedTiles, originX, originY);
    for (let rowIndex = 0; rowIndex < normalizedTiles.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < normalizedTiles[rowIndex].length; columnIndex += 1) {
        const tile = normalizedTiles[rowIndex][columnIndex];
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
    this.visibleTileTransition = transitionClock;
    this.rebuildRenderTileCache();
    if (this.awaitingFullVisibilityMapId === mapId) {
      this.awaitingFullVisibilityMapId = null;
    }
  }

  /** 选择视野过渡时间轴：移动相关补丁复用移动 tick，避免晚到补丁另起动画。 */
  private resolveVisibleTileTransitionClock(now: number, movedThisDelta: boolean): { startedAt: number; durationMs: number } {
    const motionDurationMs = Math.max(1, Math.round(this.tickTiming.durationMs || DEFAULT_MOTION_DURATION_MS));
    if (movedThisDelta) {
      return {
        startedAt: now,
        durationMs: motionDurationMs,
      };
    }
    const elapsedSinceMotionStart = now - this.tickTiming.startedAt;
    const canJoinRecentMotion = this.entityTransition?.movedId === this.player?.id
      && elapsedSinceMotionStart >= 0
      && elapsedSinceMotionStart <= motionDurationMs + TILE_HIDDEN_FADE_MS;
    if (canJoinRecentMotion) {
      return {
        startedAt: this.tickTiming.startedAt,
        durationMs: motionDurationMs,
      };
    }
    return {
      startedAt: now,
      durationMs: TILE_HIDDEN_FADE_MS,
    };
  }
}

function normalizeVisibleTile(tile: VisibleTile): VisibleTile {
  if (!tile) {
    return null;
  }
  const type = tile.type ?? TileType.Floor;
  const resources = Array.isArray(tile.resources) && tile.resources.length > 0
    ? tile.resources.map((entry) => ({ ...entry }))
    : undefined;
  const normalized: Tile = {
    ...tile,
    type,
    walkable: typeof tile.walkable === 'boolean' ? tile.walkable : isTileTypeWalkable(type),
    blocksSight: typeof tile.blocksSight === 'boolean' ? tile.blocksSight : doesTileTypeBlockSight(type),
    aura: Number.isFinite(tile.aura) ? tile.aura : 0,
    occupiedBy: typeof tile.occupiedBy === 'string' && tile.occupiedBy.length > 0 ? tile.occupiedBy : null,
    modifiedAt: typeof tile.modifiedAt === 'number' && Number.isFinite(tile.modifiedAt) ? tile.modifiedAt : null,
    resources,
    hp: typeof tile.hp === 'number' && Number.isFinite(tile.hp) ? tile.hp : undefined,
    maxHp: typeof tile.maxHp === 'number' && Number.isFinite(tile.maxHp) ? tile.maxHp : undefined,
    hpVisible: tile.hpVisible === true ? true : undefined,
    hiddenEntrance: tile.hiddenEntrance ? { ...tile.hiddenEntrance } : undefined,
  };
  return normalized;
}
