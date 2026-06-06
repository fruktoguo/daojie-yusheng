/**
 * 本文件属于客户端地图模块，负责相机、交互、投影、渲染适配或地图运行态组织。
 *
 * 维护时要保证表现层只处理显示和输入命中，移动合法性、占位和地图权威状态仍以服务端为准。
 */
// 地图存储：客户端地图状态管理，维护地块缓存、玩家状态、实体与增量更新
import {
  VIEW_RADIUS,
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
  getQiResourceDisplayLabel,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
  normalizeHorizontalFacing,
  resolveTileLayerSeedFromTileType,
} from '@mud/shared';
import {
  deleteRememberedMap,
  getRememberedMarkers,
  hydrateTileCacheFromMemory,
  rememberVisibleMarkers,
  rememberVisibleTilePatches,
  rememberVisibleTiles,
} from '../../map-memory';
import { hydrateClientGroundItemEntryName } from '../../content/item-display-name';
import {
  cacheMapMeta,
  cacheMapSnapshot,
  cacheUnlockedMinimapLibrary,
  getCachedMapMeta,
  getCachedMapSnapshot,
  getCachedUnlockedMapSnapshot,
  syncCachedUnlockedMapIds,
} from '../../map-static-cache';
import { resolvePresentationScaleFromBuffs } from '../../buff-presentation';
import { TILE_HIDDEN_FADE_MS } from '../../constants/visuals/time-atmosphere';
import { t } from '../../ui/i18n';
import type {
  MapBootstrapInput,
  MapEntityTransition,
  MapFormationRangeOverlayState,
  MapBuildPreviewOverlayState,
  MapFengShuiOverlayState,
  MapSelfDeltaInput,
  MapWorldDeltaInput,
  MapKnownTileBounds,
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
const TERRAIN_RENDER_CHUNK_SIZE = 16;

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

function resolveObservedFacing(
  kind: RenderEntity['kind'] | undefined,
  nextFacing: RenderEntity['facing'] | null | undefined,
  previousFacing?: RenderEntity['facing'] | null | undefined,
): RenderEntity['facing'] | undefined {
  return kind === 'monster' || kind === 'player'
    ? normalizeHorizontalFacing(nextFacing, previousFacing)
    : (nextFacing ?? previousFacing ?? undefined);
}

function isDemonizedBuffCarrier(buffs: readonly { buffId: string; stacks: number }[] | null | undefined): boolean {
  return (buffs ?? []).some((buff) => (
    buff.buffId === PVP_SHA_INFUSION_BUFF_ID
    && Math.max(0, Math.round(buff.stacks ?? 0)) > PVP_SHA_DEMONIZED_STACK_THRESHOLD
  ));
}

function buildTerrainTileRenderSignature(tile: Tile | null | undefined): string {
  if (!tile) {
    return 'null';
  }
  return [
    tile.type,
    tile.terrainType ?? '',
    tile.surfaceType ?? '',
    tile.structureType ?? '',
    Array.isArray(tile.interactableKinds) ? tile.interactableKinds.join('+') : '',
    tile.hp ?? '',
    tile.maxHp ?? '',
    tile.hpVisible === false ? 0 : 1,
    tile.aura ?? '',
    tile.resources?.length ?? 0,
  ].join(':');
}

function decorateObservedEntity(entity: ObservedMapEntity, player: PlayerState | null): ObservedMapEntity {
  const isSelf = player !== null && entity.id === player.id;
  const buffs = isSelf && Array.isArray(player.temporaryBuffs)
    ? cloneJson(player.temporaryBuffs)
    : entity.buffs;
  const badge = entity.badge ?? (
    entity.kind === 'player' && isDemonizedBuffCarrier(buffs)
      ? { text: t('entity.badge.demonic'), tone: 'demonic' as const }
      : undefined
  );
  const hostile = entity.kind === 'player'
    && player !== null
    && entity.id !== player.id
    && (player.allowAoePlayerHit === true || player.retaliatePlayerTargetId === entity.id);
  return {
    ...entity,
    buffs,
    monsterScale: isSelf ? resolvePresentationScaleFromBuffs(buffs) : entity.monsterScale,
    badge,
    hostile,
  };
}

/** 将服务端渲染实体标准化为本地可观察实体快照。 */
function toObservedEntity(entity: RenderEntity): ObservedMapEntity {
  const kind = entity.kind ?? 'player';
  return {
    id: entity.id,
    wx: entity.x,
    wy: entity.y,
    char: entity.char,
    color: entity.color,
    badge: entity.badge,
    hostile: false,
    name: entity.name,
    kind,
    monsterId: entity.monsterId,
    monsterTier: entity.monsterTier,
    monsterScale: entity.monsterScale,
    facing: resolveObservedFacing(kind, entity.facing, undefined),
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
  const kind = applyNullablePatch(patch.kind, previous?.kind);
  return {
    id: patch.id,
    wx: patch.x,
    wy: patch.y,
    char: patch.char ?? previous?.char ?? '?',
    color: patch.color ?? previous?.color ?? '#fff',
    badge: previous?.badge,
    hostile: previous?.hostile,
    name: applyNullablePatch(patch.name, previous?.name),
    kind,
    monsterId: applyNullablePatch(patch.monsterId, previous?.monsterId),
    monsterTier: applyNullablePatch(patch.monsterTier, previous?.monsterTier),
    monsterScale: applyNullablePatch(patch.monsterScale, previous?.monsterScale),
    facing: resolveObservedFacing(kind, patch.facing, previous?.facing),
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

function isCompleteNewEntityPatch(patch: TickRenderEntity): boolean {
  return typeof patch.kind === 'string' || typeof patch.name === 'string';
}

/** 从本地玩家状态构造高优先级实体快照。 */
function buildLocalPlayerEntity(player: PlayerState, previous?: ObservedMapEntity): ObservedMapEntity {
  return {
    id: player.id,
    wx: player.x,
    wy: player.y,
    char: getFirstGrapheme(player.displayName ?? player.name ?? '') || previous?.char || t('entity.player.self-char'),
    color: previous?.color ?? '#7ee787',
    badge: previous?.badge,
    hostile: false,
    name: player.name,
    kind: 'player',
    hp: player.hp,
    maxHp: player.maxHp,
    qi: player.qi,
    maxQi: player.numericStats?.maxQi,
    facing: normalizeHorizontalFacing(player.facing, previous?.facing),
    npcQuestMarker: previous?.npcQuestMarker,
    observation: previous?.observation,
    buffs: player.temporaryBuffs ? cloneJson(player.temporaryBuffs) : previous?.buffs,
    monsterScale: resolvePresentationScaleFromBuffs(player.temporaryBuffs),
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
  /** 地形静态层按 chunk 拆分的版本号，用于避免少量地块更新打穿所有可见 chunk。 */
  private terrainChunkRevisions = new Map<string, number>();
  /** 当前已知实体列表（含自身与其他可见对象）。 */
  private entities: ObservedMapEntity[] = [];
  /** 实体 ID 到实体快照索引。 */
  private entityMap = new Map<string, ObservedMapEntity>();
  /** 地面物品堆叠索引，key 为 sourceId。 */
  private groundPiles = new Map<string, GroundItemPileView>();  
  /** 地面物品坐标到 sourceId 的索引，供点击与渲染按坐标读取。 */
  private groundPileTileIndex = new Map<string, string>();
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
  /** 本地建造预览叠加层，只表达输入反馈，不作为权威合法性。 */
  private buildPreview: MapBuildPreviewOverlayState | null = null;
  /** 服务端返回的风水格子叠加层。 */
  private fengShui: MapFengShuiOverlayState | null = null;
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
    this.minimapMemoryVersion += 1;
    this.rebuildSnapshotTileCache();
    this.rebuildRenderTileCache(true);
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
  private rebuildRenderTileCache(markAllDirty = false): void {
    this.renderTileCache.clear();
    for (const [key, tile] of this.snapshotTileCache.entries()) {
      this.renderTileCache.set(key, { ...tile });
    }
    for (const [key, tile] of this.tileCache.entries()) {
      this.renderTileCache.set(key, { ...tile });
    }
    if (markAllDirty) {
      this.markAllKnownTerrainChunksDirty();
    }
  }

  private updateRenderTileCacheAt(key: string): void {
    const tile = this.tileCache.get(key) ?? this.snapshotTileCache.get(key) ?? null;
    if (tile) {
      this.renderTileCache.set(key, { ...tile });
      return;
    }
    this.renderTileCache.delete(key);
  }

  private static parseTileKey(key: string): { x: number; y: number } | null {
    const separatorIndex = key.indexOf(',');
    if (separatorIndex <= 0) {
      return null;
    }
    const x = Number(key.slice(0, separatorIndex));
    const y = Number(key.slice(separatorIndex + 1));
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return null;
    }
    return { x, y };
  }

  private buildTerrainChunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private bumpTerrainChunkRevision(cx: number, cy: number): void {
    const key = this.buildTerrainChunkKey(cx, cy);
    this.terrainChunkRevisions.set(key, (this.terrainChunkRevisions.get(key) ?? 0) + 1);
  }

  private markTerrainTileDirty(x: number, y: number): void {
    const minCX = Math.floor((x - 1) / TERRAIN_RENDER_CHUNK_SIZE);
    const maxCX = Math.floor((x + 1) / TERRAIN_RENDER_CHUNK_SIZE);
    const minCY = Math.floor((y - 1) / TERRAIN_RENDER_CHUNK_SIZE);
    const maxCY = Math.floor((y + 1) / TERRAIN_RENDER_CHUNK_SIZE);
    for (let cy = minCY; cy <= maxCY; cy += 1) {
      for (let cx = minCX; cx <= maxCX; cx += 1) {
        this.bumpTerrainChunkRevision(cx, cy);
      }
    }
  }

  private markAllKnownTerrainChunksDirty(): void {
    const chunks = new Set<string>();
    for (const key of this.renderTileCache.keys()) {
      const point = MapStore.parseTileKey(key);
      if (!point) {
        continue;
      }
      const minCX = Math.floor((point.x - 1) / TERRAIN_RENDER_CHUNK_SIZE);
      const maxCX = Math.floor((point.x + 1) / TERRAIN_RENDER_CHUNK_SIZE);
      const minCY = Math.floor((point.y - 1) / TERRAIN_RENDER_CHUNK_SIZE);
      const maxCY = Math.floor((point.y + 1) / TERRAIN_RENDER_CHUNK_SIZE);
      for (let cy = minCY; cy <= maxCY; cy += 1) {
        for (let cx = minCX; cx <= maxCX; cx += 1) {
          chunks.add(this.buildTerrainChunkKey(cx, cy));
        }
      }
    }
    for (const key of chunks) {
      this.terrainChunkRevisions.set(key, (this.terrainChunkRevisions.get(key) ?? 0) + 1);
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
    this.rebuildRenderTileCache(true);
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
    if (!mapMeta?.hideMinimap) {
      rememberVisibleMarkers(player.mapId, this.visibleMinimapMarkers);
    }
    // 兼容旧协议 minimapLibrary 全量 + 新协议 unlockedMapIds
    if (minimapLibrary.length > 0) {
      cacheUnlockedMinimapLibrary(minimapLibrary);
      player.unlockedMinimapIds = minimapLibrary.map((entry) => entry.mapId).sort();
    } else if (Array.isArray((data as any).unlockedMapIds) && (data as any).unlockedMapIds.length > 0) {
      player.unlockedMinimapIds = (data as any).unlockedMapIds.slice().sort();
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
      this.rebuildRenderTileCache(true);
    }
    this.awaitingFullVisibilityMapId = null;

    this.entities = [buildLocalPlayerEntity(player), ...renderPlayers.map(toObservedEntity).filter((entry) => entry.id !== player.id)];
    this.entityMap = new Map(this.entities.map((entry) => [entry.id, entry]));
    publishLatestObservedEntitiesSnapshot(this.entities);
    this.clearGroundPiles();
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
      if (!this.mapMeta?.hideMinimap) {
        rememberVisibleMarkers(data.mapId, this.visibleMinimapMarkers);
      }
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
    const hintedMapId = typeof data.resetMapId === 'string' && data.resetMapId
      ? data.resetMapId
      : this.player.mapId;
    const preloadingDifferentMap = hintedMapId !== this.player.mapId;
    const nextInstanceId = typeof data.resetInstanceId === 'string' && data.resetInstanceId.trim()
      ? data.resetInstanceId.trim()
      : undefined;
    const instanceChanged = Boolean(nextInstanceId && nextInstanceId !== this.player.instanceId);
    const hasEntityPatch = data.playerPatches.length > 0 || data.entityPatches.length > 0 || (data.removedEntityIds?.length ?? 0) > 0;
    const shouldResetEntities = (preloadingDifferentMap || instanceChanged) && hasEntityPatch;
    if (shouldResetEntities) {
      this.clearGroundPiles();
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
      this.rebuildRenderTileCache(true);
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
      if ((data.visibleMinimapMarkerAdds?.length ?? 0) > 0 && !this.mapMeta?.hideMinimap) {
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
        this.clearGroundPiles();
        this.entities = [];
        this.entityMap.clear();
        this.threatArrows = [];
      }
      this.player.mapId = nextMapId;
      this.setMinimapSnapshot((this.player.unlockedMinimapIds ?? []).includes(this.player.mapId)
        ? getCachedUnlockedMapSnapshot(this.player.mapId)
        : null);
      hydrateTileCacheFromMemory(this.player.mapId, this.tileCache);
      this.rebuildRenderTileCache(true);
      this.awaitingFullVisibilityMapId = this.player.mapId;
      this.preloadedEntityMapId = null;
    }
    if (typeof data.instanceId === 'string' && data.instanceId.trim()) {
      this.player.instanceId = data.instanceId.trim();
    }

    if (typeof data.hp === 'number') {
      this.player.hp = data.hp;
    }
    if (typeof data.maxHp === 'number') {
      this.player.maxHp = data.maxHp;
    }
    if (typeof data.qi === 'number') {
      this.player.qi = data.qi;
    }
    if (typeof data.maxQi === 'number' && this.player.numericStats) {
      this.player.numericStats.maxQi = data.maxQi;
    }
    if (data.facing !== undefined) {
      this.player.facing = normalizeHorizontalFacing(data.facing, this.player.facing);
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
    if (this.player) {
      const selfEntity = entities.find((entry) => entry.id === this.player?.id);
      if (Array.isArray(selfEntity?.buffs)) {
        this.player.temporaryBuffs = cloneJson(selfEntity.buffs);
      }
    }
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

  setBuildPreviewOverlay(state: MapBuildPreviewOverlayState | null): void {
    this.buildPreview = state ? cloneJson(state) : null;
  }

  setFengShuiOverlay(state: MapFengShuiOverlayState | null): void {
    this.fengShui = state ? cloneJson(state) : null;
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
    this.terrainChunkRevisions.clear();
    this.visibleTiles.clear();
    this.entities = [];
    this.entityMap.clear();
    this.clearGroundPiles();
    this.pathCells = [];
    this.targeting = null;
    this.formationRange = null;
    this.buildPreview = null;
    this.fengShui = null;
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
    return this.player?.viewRange ?? this.time?.effectiveViewRange ?? VIEW_RADIUS;
  }

  /** 获取当前地图元数据。 */
  getMapMeta(): MapMeta | null {
    return this.mapMeta;
  }

  getKnownTileBounds(): MapKnownTileBounds | null {
    let bounds: MapKnownTileBounds | null = null;
    for (const key of this.renderTileCache.keys()) {
      const separatorIndex = key.indexOf(',');
      if (separatorIndex <= 0) {
        continue;
      }
      const x = Number(key.slice(0, separatorIndex));
      const y = Number(key.slice(separatorIndex + 1));
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        continue;
      }
      if (!bounds) {
        bounds = { minX: x, maxX: x, minY: y, maxY: y };
        continue;
      }
      if (x < bounds.minX) bounds.minX = x;
      if (x > bounds.maxX) bounds.maxX = x;
      if (y < bounds.minY) bounds.minY = y;
      if (y > bounds.maxY) bounds.maxY = y;
    }
    return bounds;
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
    const sourceId = this.groundPileTileIndex.get(`${x},${y}`);
    return sourceId ? this.groundPiles.get(sourceId) ?? null : null;
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
            char: getFirstGrapheme(this.player.displayName ?? this.player.name ?? '') || t('entity.player.self-char'),
            mapId: this.player.mapId,
            viewRange: this.player.viewRange,
            senseQiActive: this.player.senseQiActive,
          }
        : null,
      time: this.time,
      tileCache: this.renderTileCache,
      visibleTiles: this.visibleTiles,
      terrainChunkRevisions: this.terrainChunkRevisions,
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
        buildPreview: this.buildPreview,
        fengShui: this.fengShui,
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
    const merged: ObservedMapEntity[] = [];
    const nextMap = new Map<string, ObservedMapEntity>();
    const indexById = new Map<string, number>();

    if (this.player && !removedIdSet.has(this.player.id) && !this.entityMap.has(this.player.id)) {
      const localPlayerEntity = buildLocalPlayerEntity(this.player, this.entityMap.get(this.player.id));
      indexById.set(localPlayerEntity.id, merged.length);
      merged.push(localPlayerEntity);
      nextMap.set(localPlayerEntity.id, localPlayerEntity);
    }

    for (const entity of this.entities) {
      if (removedIdSet.has(entity.id)) {
        continue;
      }
      const cloned = cloneJson(entity);
      indexById.set(cloned.id, merged.length);
      merged.push(cloned);
      nextMap.set(cloned.id, cloned);
    }

    const applyPatch = (patch: TickRenderEntity): void => {
      const previous = nextMap.get(patch.id);
      if (!previous && !isCompleteNewEntityPatch(patch)) {
        return;
      }
      const next = mergeObservedEntityPatch(patch, previous);
      if (this.player && patch.id === this.player.id) {
        next.char = getFirstGrapheme(this.player.displayName ?? this.player.name ?? '') || next.char;
        next.name = this.player.name ?? next.name;
      }
      if (previous) {
        const index = indexById.get(patch.id);
        if (index !== undefined) {
          merged[index] = next;
        }
      } else {
        indexById.set(next.id, merged.length);
        merged.push(next);
      }
      nextMap.set(next.id, next);
    };

    for (const patch of playerPatches) {
      applyPatch(patch);
    }
    for (const patch of entityPatches) {
      applyPatch(patch);
    }

    const decorated: ObservedMapEntity[] = [];
    this.entityMap = new Map<string, ObservedMapEntity>();
    for (const entity of merged) {
      const next = decorateObservedEntity(entity, this.player);
      decorated.push(next);
      this.entityMap.set(next.id, next);
    }
    this.threatArrows = this.filterThreatArrowsByVisibleEntities(this.entityMap);
    return decorated;
  }

  private filterThreatArrowsByVisibleEntities(entityMap: Map<string, ObservedMapEntity>): Array<{ ownerId: string; targetId: string }> {
    return this.threatArrows.filter((entry) => (
      entry.ownerId
      && entry.targetId
      && entityMap.has(entry.ownerId)
      && entityMap.has(entry.targetId)
    ));
  }

  /** 清空地面物品主索引与坐标索引。 */
  private clearGroundPiles(): void {
    this.groundPiles.clear();
    this.groundPileTileIndex.clear();
  }

  /** 合并地面物品增量，返回新 map 用于下发。 */
  private mergeGroundItemPatches(patches: GroundItemPilePatch[]): Map<string, GroundItemPileView> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const nextMap = new Map(this.groundPiles);
    const nextTileIndex = new Map(this.groundPileTileIndex);
    for (const patch of patches) {
      if (patch.items === null) {
        const previous = nextMap.get(patch.sourceId);
        if (previous) {
          nextTileIndex.delete(`${previous.x},${previous.y}`);
        }
        nextMap.delete(patch.sourceId);
        continue;
      }
      if (patch.items === undefined) {
        continue;
      }
      if (typeof patch.x !== 'number' || typeof patch.y !== 'number') {
        continue;
      }
      const previous = nextMap.get(patch.sourceId);
      if (previous) {
        nextTileIndex.delete(`${previous.x},${previous.y}`);
      }
      nextMap.set(patch.sourceId, {
        sourceId: patch.sourceId,
        x: patch.x,
        y: patch.y,
        items: cloneJson(patch.items).map((entry) => hydrateClientGroundItemEntryName(entry)),
      });
      nextTileIndex.set(`${patch.x},${patch.y}`, patch.sourceId);
    }
    this.groundPileTileIndex = nextTileIndex;
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
    if (!this.mapMeta?.hideMinimap) {
      rememberVisibleTilePatches(mapId, normalizedPatches);
    }
    let terrainChanged = false;
    for (const patch of normalizedPatches) {
      const key = `${patch.x},${patch.y}`;
      if (patch.tile) {
        const previousSignature = buildTerrainTileRenderSignature(this.tileCache.get(key) ?? this.snapshotTileCache.get(key));
        const nextTile = cloneJson(patch.tile);
        this.visibleTiles.add(key);
        this.tileCache.set(key, nextTile);
        this.updateRenderTileCacheAt(key);
        if (previousSignature !== buildTerrainTileRenderSignature(nextTile)) {
          this.markTerrainTileDirty(patch.x, patch.y);
          terrainChanged = true;
        }
        continue;
      }
      this.visibleTiles.delete(key);
    }
    if (terrainChanged) {
      this.minimapMemoryVersion += 1;
    }
    this.visibleTileRevision += 1;
    this.visibleTileTransition = transitionClock;
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
    if (!this.mapMeta?.hideMinimap) {
      rememberVisibleTiles(mapId, normalizedTiles, originX, originY);
    }
    let terrainChanged = false;
    for (let rowIndex = 0; rowIndex < normalizedTiles.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < normalizedTiles[rowIndex].length; columnIndex += 1) {
        const tile = normalizedTiles[rowIndex][columnIndex];
        const key = `${originX + columnIndex},${originY + rowIndex}`;
        if (!tile) {
          continue;
        }
        const x = originX + columnIndex;
        const y = originY + rowIndex;
        const previousSignature = buildTerrainTileRenderSignature(this.tileCache.get(key) ?? this.snapshotTileCache.get(key));
        const nextTile = cloneJson(tile);
        this.visibleTiles.add(key);
        this.tileCache.set(key, nextTile);
        this.updateRenderTileCacheAt(key);
        if (previousSignature !== buildTerrainTileRenderSignature(nextTile)) {
          this.markTerrainTileDirty(x, y);
          terrainChanged = true;
        }
      }
    }
    if (terrainChanged) {
      this.minimapMemoryVersion += 1;
    }
    this.visibleTileRevision += 1;
    this.visibleTileTransition = transitionClock;
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
  const defaultLayerSeed = resolveTileLayerSeedFromTileType(type);
  const movementCost = tile.movementCost;
  const qiDrainPerTick = tile.qiDrainPerTick;
  const hasSurfaceType = Object.prototype.hasOwnProperty.call(tile, 'surfaceType');
  const hasStructureType = Object.prototype.hasOwnProperty.call(tile, 'structureType');
  const hasInteractableKinds = Object.prototype.hasOwnProperty.call(tile, 'interactableKinds');
  const resources = Array.isArray(tile.resources) && tile.resources.length > 0
    ? tile.resources
      .filter((entry) => entry && typeof entry.key === 'string' && entry.key.length > 0)
      .map((entry) => ({
        ...entry,
        label: typeof entry.label === 'string' && entry.label.length > 0
          ? entry.label
          : getQiResourceDisplayLabel(entry.key),
        value: typeof entry.value === 'number' && Number.isFinite(entry.value) ? Math.max(0, entry.value) : 0,
        effectiveValue: typeof entry.effectiveValue === 'number' && Number.isFinite(entry.effectiveValue)
          ? Math.max(0, entry.effectiveValue)
          : undefined,
        level: typeof entry.level === 'number' && Number.isFinite(entry.level) ? Math.max(0, entry.level) : undefined,
        sourceValue: typeof entry.sourceValue === 'number' && Number.isFinite(entry.sourceValue)
          ? Math.max(0, entry.sourceValue)
          : undefined,
      }))
    : undefined;
  const normalized: Tile = {
    ...tile,
    type,
    walkable: typeof tile.walkable === 'boolean' ? tile.walkable : isTileTypeWalkable(type),
    blocksSight: typeof tile.blocksSight === 'boolean' ? tile.blocksSight : doesTileTypeBlockSight(type),
    aura: Number.isFinite(tile.aura) ? tile.aura : 0,
    movementCost: typeof movementCost === 'number' && Number.isFinite(movementCost) && movementCost > 0 ? Math.trunc(movementCost) : undefined,
    qiDrainPerTick: typeof qiDrainPerTick === 'number' && Number.isFinite(qiDrainPerTick) && qiDrainPerTick > 0 ? Math.trunc(qiDrainPerTick) : undefined,
    occupiedBy: typeof tile.occupiedBy === 'string' && tile.occupiedBy.length > 0 ? tile.occupiedBy : null,
    modifiedAt: typeof tile.modifiedAt === 'number' && Number.isFinite(tile.modifiedAt) ? tile.modifiedAt : null,
    resources,
    hp: typeof tile.hp === 'number' && Number.isFinite(tile.hp) ? tile.hp : undefined,
    maxHp: typeof tile.maxHp === 'number' && Number.isFinite(tile.maxHp) ? tile.maxHp : undefined,
    hpVisible: tile.hpVisible === true ? true : undefined,
    hiddenEntrance: tile.hiddenEntrance ? { ...tile.hiddenEntrance } : undefined,
    terrainType: typeof tile.terrainType === 'string' && tile.terrainType.length > 0 ? tile.terrainType : defaultLayerSeed.terrain,
    surfaceType: hasSurfaceType
      ? (typeof tile.surfaceType === 'string' && tile.surfaceType.length > 0 ? tile.surfaceType : undefined)
      : defaultLayerSeed.surface ?? undefined,
    structureType: hasStructureType
      ? (typeof tile.structureType === 'string' && tile.structureType.length > 0 ? tile.structureType : undefined)
      : defaultLayerSeed.structure ?? undefined,
    interactableKinds: hasInteractableKinds && Array.isArray(tile.interactableKinds)
      ? tile.interactableKinds.filter((kind) => typeof kind === 'string' && kind.length > 0)
      : defaultLayerSeed.interactables.length > 0 ? [...defaultLayerSeed.interactables] : undefined,
  };
  return normalized;
}
