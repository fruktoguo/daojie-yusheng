/**
 * 本文件是客户端 DOM UI 的 minimap 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 小地图与大地图浏览器
 * 提供角落缩略图、全屏地图弹窗、地图目录切换、缩放平移、点击前往等功能
 */
import { getTileTypeFromMapChar, GroundItemPileView, isTileTypeWalkable, MapMeta, MapMinimapMarker, MapMinimapSnapshot, MINIMAP_MARKER_COLORS, resolveMapGroupInfo, Tile, TILE_MINIMAP_COLORS, TileType } from '@mud/shared';
import { deleteAllRememberedMaps, deleteRememberedMap, getRememberedMarkers, getRememberedTiles, listRememberedMapIds } from '../map-memory';
import { getCachedMapMeta, getCachedUnlockedMapSnapshot, listCachedUnlockedMapSummaries } from '../map-static-cache';
import { getMinimapMarkerKindLabel, getTileTypeLabel } from '../domain-labels';
import { detailModalHost } from './detail-modal-host';
import { getViewportRoot } from './responsive-viewport';
import {
  EMPTY_GROUND_PILES,
  EMPTY_VISIBLE_TILES,
  MAX_MODAL_ZOOM,
  MIN_MODAL_ZOOM,
} from '../constants/visuals/minimap';
import { buildCanvasFont } from '../constants/ui/text';
import { formatDisplayCountBadge, formatDisplayInteger } from '../utils/number';
import { t } from './i18n';
import {
  buildCatalogEntriesImpl,
  renderCatalogImpl,
  createCatalogItemNodeImpl,
  updateCatalogItemNodeImpl,
  insertCatalogItemNodeInOrderImpl,
  getCatalogEmptyNodeImpl,
  removeAllCatalogNodesImpl,
  buildCatalogBadgeImpl,
  getCatalogDescriptionImpl,
  getCurrentDisplayAvailabilityImpl,
  getDisplayAvailabilityImpl,
  resolveModalDisplayModeImpl,
  syncModalDisplaySwitchImpl,
  setModalDisplayModeImpl,
  getCurrentDisplaySceneImpl,
  getModalDisplaySceneImpl,
} from './minimap.catalog';
import {
  mountModalToBodyImpl,
  isCompactViewportImpl,
  syncResponsiveModalChromeImpl,
  openModalImpl,
  closeModalImpl,
  resetModalViewportImpl,
  cancelModalPanImpl,
  openMoveConfirmImpl,
  closeMoveConfirmImpl,
  openDeleteMemoryConfirmImpl,
  createConfirmMessageImpl,
  createMoveConfirmActionsImpl,
  bindMoveConfirmActionsImpl,
  createDeleteMemoryActionsImpl,
  bindDeleteMemoryActionsImpl,
  createConfirmActionsImpl,
  createConfirmButtonImpl,
  deleteSelectedMemoryImpl,
  deleteAllMemoryImpl,
  applyMemoryDeletionToSceneImpl,
} from './minimap.modal';
import {
  buildTileCacheHashImpl,
  buildBaseKeyImpl,
  ensureBaseCanvasImpl,
  renderOverlayImpl,
  renderExpandedMapImpl,
  getViewportMetricsImpl,
  resolveWorldPointImpl,
  resolveCanvasPointImpl,
  resolveCurrentMoveTargetImpl,
  getTileAtImpl,
  getTileTypeAtImpl,
  getDisplayMarkersImpl,
  drawSceneImpl,
  drawMarkerImpl,
  drawMarkerLabelImpl,
  drawGroundPileImpl,
  drawModalHudImpl,
  buildHoverLinesImpl,
} from './minimap.draw';

/** 小地图目录筛选条件。 */
export type CatalogFilter = 'all' | 'memory' | 'unlock';
/** MinimapDisplayMode：模式枚举。 */
export type MinimapDisplayMode = 'memory' | 'unlock';

/** 目录来源在当前环境中的可用性。 */
export interface DisplaySourceAvailability {
/**
 * hasMemory：启用开关或状态标识。
 */

  hasMemory: boolean;  
  /**
 * hasUnlock：启用开关或状态标识。
 */

  hasUnlock: boolean;
}

/** 小地图主场景渲染数据。 */
export interface MinimapScene {
/**
 * mapMeta：地图Meta相关字段。
 */

  mapMeta: MapMeta | null;  
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot: MapMinimapSnapshot | null;  
  /**
 * rememberedMarkers：rememberedMarker相关字段。
 */

  rememberedMarkers: MapMinimapMarker[];  
  /**
 * visibleMarkers：可见Marker相关字段。
 */

  visibleMarkers: MapMinimapMarker[];  
  /**
 * tileCache：缓存或索引容器。
 */

  tileCache: ReadonlyMap<string, Tile>;  
  /**
 * visibleTiles：可见Tile相关字段。
 */

  visibleTiles: ReadonlySet<string>;  
  /**
 * visibleEntities：可见Entity相关字段。
 */

  visibleEntities: ReadonlyArray<{  
  /**
 * id：ID标识。
 */

    id: string;    
    /**
 * wx：wx相关字段。
 */

    wx: number;    
    /**
 * wy：wy相关字段。
 */

    wy: number;    
    /**
 * name：名称名称或显示文本。
 */

    name?: string;    
    /**
 * kind：kind相关字段。
 */

    kind?: string;
  }>;  
  /**
 * groundPiles：groundPile相关字段。
 */

  groundPiles: ReadonlyMap<string, GroundItemPileView>;  
  /**
 * player：玩家引用。
 */

  player: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null;  
 /**
 * viewRadius：视图Radiu相关字段。
 */

  viewRadius: number;  
  /**
 * memoryVersion：memoryVersion相关字段。
 */

  memoryVersion: number;
}

/** 小地图目录条目。 */
export interface CatalogEntry {
/**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * mapMeta：地图Meta相关字段。
 */

  mapMeta: MapMeta | null;  
  mapGroupId: string;
  mapGroupName: string;
  mapGroupOrder: number;
  mapGroupMemberOrder: number;
  /**
 * hasMemory：启用开关或状态标识。
 */

  hasMemory: boolean;  
  /**
 * hasUnlock：启用开关或状态标识。
 */

  hasUnlock: boolean;
}

/** 弹窗中正在绘制的地图场景。 */
export interface DisplayMapScene {
/**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * mapMeta：地图Meta相关字段。
 */

  mapMeta: MapMeta;  
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot: MapMinimapSnapshot | null;  
  /**
 * rememberedMarkers：rememberedMarker相关字段。
 */

  rememberedMarkers: MapMinimapMarker[];  
  /**
 * visibleMarkers：可见Marker相关字段。
 */

  visibleMarkers: MapMinimapMarker[];  
  /**
 * tileCache：缓存或索引容器。
 */

  tileCache: ReadonlyMap<string, Tile>;  
  /**
 * visibleTiles：可见Tile相关字段。
 */

  visibleTiles: ReadonlySet<string>;  
  /**
 * visibleEntities：可见Entity相关字段。
 */

  visibleEntities: ReadonlyArray<{  
  /**
 * id：ID标识。
 */

    id: string;    
    /**
 * wx：wx相关字段。
 */

    wx: number;    
    /**
 * wy：wy相关字段。
 */

    wy: number;    
    /**
 * name：名称名称或显示文本。
 */

    name?: string;    
    /**
 * kind：kind相关字段。
 */

    kind?: string;
  }>;  
  /**
 * groundPiles：groundPile相关字段。
 */

  groundPiles: ReadonlyMap<string, GroundItemPileView>;  
  /**
 * player：玩家引用。
 */

  player: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null;  
 /**
 * viewRadius：视图Radiu相关字段。
 */

  viewRadius: number;  
  /**
 * isCurrent：启用开关或状态标识。
 */

  isCurrent: boolean;  
  /**
 * memoryVersion：memoryVersion相关字段。
 */

  memoryVersion: number;  
  /**
 * displayMode：显示Mode相关字段。
 */

  displayMode: MinimapDisplayMode;  
  /**
 * hasMemory：启用开关或状态标识。
 */

  hasMemory: boolean;  
  /**
 * hasUnlock：启用开关或状态标识。
 */

  hasUnlock: boolean;
}

/** 小地图弹窗视口换算指标。 */
export interface ViewportMetrics {
/**
 * width：width相关字段。
 */

  width: number;  
  /**
 * height：height相关字段。
 */

  height: number;  
  /**
 * innerWidth：innerWidth相关字段。
 */

  innerWidth: number;  
  /**
 * innerHeight：innerHeight相关字段。
 */

  innerHeight: number;  
  /**
 * mapWidth：地图Width相关字段。
 */

  mapWidth: number;  
  /**
 * mapHeight：地图Height相关字段。
 */

  mapHeight: number;  
  minX: number;
  minY: number;
  /**
 * padding：padding相关字段。
 */

  padding: number;  
  /**
 * scale：scale相关字段。
 */

  scale: number;  
  /**
 * drawWidth：drawWidth相关字段。
 */

  drawWidth: number;  
  /**
 * drawHeight：drawHeight相关字段。
 */

  drawHeight: number;  
  /**
 * baseOffsetX：baseOffsetX相关字段。
 */

  baseOffsetX: number;  
  /**
 * baseOffsetY：baseOffsetY相关字段。
 */

  baseOffsetY: number;  
  /**
 * offsetX：offsetX相关字段。
 */

  offsetX: number;  
  /**
 * offsetY：offsetY相关字段。
 */

  offsetY: number;  
  /**
 * panX：panX相关字段。
 */

  panX: number;  
  /**
 * panY：panY相关字段。
 */

  panY: number;  
  /**
 * maxPanX：maxPanX相关字段。
 */

  maxPanX: number;  
  /**
 * maxPanY：maxPanY相关字段。
 */

  maxPanY: number;
}

/** 弹窗平移拖拽状态。 */
export interface ModalPanState {
/**
 * pointerId：pointerID标识。
 */

  pointerId: number;  
  /**
 * startClientX：startClientX相关字段。
 */

  startClientX: number;  
  /**
 * startClientY：startClientY相关字段。
 */

  startClientY: number;  
  /**
 * startPanX：startPanX相关字段。
 */

  startPanX: number;  
  /**
 * startPanY：startPanY相关字段。
 */

  startPanY: number;
}

/** clamp：处理clamp。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** parseTileKey：解析地块Key。 */
export function parseTileKey(key: string): {
/**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const [rawX, rawY] = key.split(',');
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    x: Math.trunc(x),
    y: Math.trunc(y),
  };
}

/** ensureCanvasSize：确保Canvas Size。 */
export function ensureCanvasSize(canvas: HTMLCanvasElement): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width === width && canvas.height === height) {
    return false;
  }
  canvas.width = width;
  canvas.height = height;
  return true;
}

/** buildFallbackMapMeta：构建兜底地图元数据。 */
export function buildFallbackMapMeta(mapId: string, snapshot: MapMinimapSnapshot | null, tileCache: Map<string, Tile>): MapMeta {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  let width = snapshot?.width ?? 1;
  let height = snapshot?.height ?? 1;
  if (!snapshot) {
    for (const key of tileCache.keys()) {
      const point = parseTileKey(key);
      if (!point) {
        continue;
      }
      width = Math.max(width, point.x + 1);
      height = Math.max(height, point.y + 1);
    }
  }
  return {
    id: mapId,
    name: t('minimap.catalog.unknown-region', undefined),
    width,
    height,
  };
}

export function attachCatalogGroup(entry: Omit<CatalogEntry, 'mapGroupId' | 'mapGroupName' | 'mapGroupOrder' | 'mapGroupMemberOrder'>): CatalogEntry {
  const group = resolveMapGroupInfo({
    id: entry.mapMeta?.id ?? entry.mapId,
    name: entry.mapMeta?.name ?? t('minimap.catalog.unknown-region', undefined),
    parentMapId: entry.mapMeta?.parentMapId,
    mapGroupId: entry.mapMeta?.mapGroupId,
    mapGroupName: entry.mapMeta?.mapGroupName,
    mapGroupOrder: entry.mapMeta?.mapGroupOrder,
    mapGroupMemberOrder: entry.mapMeta?.mapGroupMemberOrder,
    floorLevel: entry.mapMeta?.floorLevel,
  });
  return {
    ...entry,
    mapGroupId: group.mapGroupId,
    mapGroupName: group.mapGroupName,
    mapGroupOrder: group.mapGroupOrder,
    mapGroupMemberOrder: group.mapGroupMemberOrder,
  };
}

export interface MinimapDrawExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function buildMinimapDrawExtent(display: DisplayMapScene): MinimapDrawExtent {
  let minX = 0;
  let minY = 0;
  let maxX = Math.max(0, Math.trunc(Number(display.mapMeta.width) || 1) - 1);
  let maxY = Math.max(0, Math.trunc(Number(display.mapMeta.height) || 1) - 1);
  const include = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const tx = Math.trunc(x);
    const ty = Math.trunc(y);
    minX = Math.min(minX, tx);
    minY = Math.min(minY, ty);
    maxX = Math.max(maxX, tx);
    maxY = Math.max(maxY, ty);
  };
  if (display.snapshot) {
    maxX = Math.max(maxX, Math.max(0, Math.trunc(Number(display.snapshot.width) || 1) - 1));
    maxY = Math.max(maxY, Math.max(0, Math.trunc(Number(display.snapshot.height) || 1) - 1));
    for (const marker of display.snapshot.markers ?? []) {
      include(marker.x, marker.y);
    }
  }
  for (const key of display.tileCache.keys()) {
    const point = parseTileKey(key);
    if (point) {
      include(point.x, point.y);
    }
  }
  for (const key of display.visibleTiles.values()) {
    const point = parseTileKey(key);
    if (point) {
      include(point.x, point.y);
    }
  }
  for (const marker of display.rememberedMarkers) {
    include(marker.x, marker.y);
  }
  for (const marker of display.visibleMarkers) {
    include(marker.x, marker.y);
  }
  for (const entity of display.visibleEntities) {
    include(entity.wx, entity.wy);
  }
  for (const pile of display.groundPiles.values()) {
    include(pile.x, pile.y);
  }
  if (display.player) {
    include(display.player.x, display.player.y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
}

/** getCanvasPixels：读取Canvas Pixels。 */
export function getCanvasPixels(canvas: HTMLCanvasElement, clientX: number, clientY: number): {
/**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

/** Minimap：小地图实现。 */
export class Minimap {
  /** MOVE_CONFIRM_OWNER：移动CONFIRM OWNER。 */
  static readonly MOVE_CONFIRM_OWNER = 'map-minimap:move-confirm';
  /** DELETE_MEMORY_OWNER：DELETE MEMORY OWNER。 */
  static readonly DELETE_MEMORY_OWNER = 'map-minimap:delete-memory';

  /** shell：shell。 */
  readonly shell = document.getElementById('map-minimap-shell') as HTMLElement | null;
  /** overlayRoot：overlay Root。 */
  readonly overlayRoot = document.getElementById('map-minimap') as HTMLElement | null;
  /** overlayCanvas：overlay Canvas。 */
  readonly overlayCanvas = document.getElementById('map-minimap-canvas') as HTMLCanvasElement | null;
  /** overlayTitle：overlay标题。 */
  readonly overlayTitle = document.getElementById('map-minimap-title') as HTMLElement | null;
  /** toggleBtn：toggle按钮。 */
  readonly toggleBtn = document.getElementById('map-minimap-toggle') as HTMLButtonElement | null;
  /** openBtn：open按钮。 */
  readonly openBtn = document.getElementById('map-minimap-open') as HTMLButtonElement | null;
  /** modal：弹窗。 */
  readonly modal = document.getElementById('map-minimap-modal') as HTMLElement | null;
  /** modalBody：弹窗身体。 */
  readonly modalBody = document.querySelector('#map-minimap-modal .map-minimap-modal-body') as HTMLElement | null;
  /** modalSidebar：弹窗Sidebar。 */
  readonly modalSidebar = document.querySelector('#map-minimap-modal .map-minimap-modal-sidebar') as HTMLElement | null;
  /** modalWindow：弹窗窗口。 */
  readonly modalWindow = document.getElementById('map-minimap-modal-window') as HTMLElement | null;
  /** modalTitle：弹窗标题。 */
  readonly modalTitle = document.getElementById('map-minimap-modal-title') as HTMLElement | null;
  /** modalCatalogToggleBtn：弹窗目录Toggle按钮。 */
  readonly modalCatalogToggleBtn = document.getElementById('map-minimap-modal-catalog-toggle') as HTMLButtonElement | null;
  /** modalCloseBtn：弹窗Close按钮。 */
  readonly modalCloseBtn = document.getElementById('map-minimap-modal-close') as HTMLButtonElement | null;
  /** modalCanvas：弹窗Canvas。 */
  readonly modalCanvas = document.getElementById('map-minimap-modal-canvas') as HTMLCanvasElement | null;
  /** modalSourceSwitch：弹窗来源Switch。 */
  readonly modalSourceSwitch = document.getElementById('map-minimap-modal-source-switch') as HTMLElement | null;
  /** modalSourceMemoryBtn：弹窗来源Memory按钮。 */
  readonly modalSourceMemoryBtn = document.getElementById('map-minimap-modal-source-memory') as HTMLButtonElement | null;
  /** modalSourceUnlockBtn：弹窗来源解锁按钮。 */
  readonly modalSourceUnlockBtn = document.getElementById('map-minimap-modal-source-unlock') as HTMLButtonElement | null;
  /** modalList：弹窗列表。 */
  readonly modalList = document.getElementById('map-minimap-modal-list') as HTMLElement | null;
  /** modalTabAll：弹窗Tab All。 */
  readonly modalTabAll = document.getElementById('map-minimap-filter-all') as HTMLButtonElement | null;
  /** modalTabMemory：弹窗Tab Memory。 */
  readonly modalTabMemory = document.getElementById('map-minimap-filter-memory') as HTMLButtonElement | null;
  /** modalTabUnlock：弹窗Tab解锁。 */
  readonly modalTabUnlock = document.getElementById('map-minimap-filter-unlock') as HTMLButtonElement | null;
  /** deleteMemoryBtn：delete Memory按钮。 */
  readonly deleteMemoryBtn = document.getElementById('map-minimap-delete-memory') as HTMLButtonElement | null;
  /** deleteAllMemoryBtn：删除全部地图记忆按钮。 */
  readonly deleteAllMemoryBtn = document.getElementById('map-minimap-delete-all-memory') as HTMLButtonElement | null;

  /** baseCanvas：基础Canvas。 */
  readonly baseCanvas = document.createElement('canvas');
  /** baseCtx：基础Ctx。 */
  readonly baseCtx = this.baseCanvas.getContext('2d');
  /** scene：场景。 */
  scene: MinimapScene | null = null;
  /** renderQueued：渲染Queued。 */
  private renderQueued = false;
  /** overlayVisible：overlay可见。 */
  overlayVisible = true;
  /** modalOpen：弹窗Open。 */
  modalOpen = false;
  /** baseKey：基础Key。 */
  baseKey: string | null = null;
  /** selectedMapId：selected地图ID。 */
  selectedMapId: string | null = null;
  /** modalDisplayMode：弹窗显示模式。 */
  modalDisplayMode: MinimapDisplayMode = 'unlock';
  /** catalogFilter：目录筛选。 */
  catalogFilter: CatalogFilter = 'all';
  /** moveHandler：移动Handler。 */
  moveHandler: ((x: number, y: number, mapId?: string) => void) | null = null;
  /** memoryDeleteHandler：地图记忆删除后通知地图运行时同步缓存。 */
  memoryDeleteHandler: ((mapIds: readonly string[] | null) => void) | null = null;
  /**
 * pendingMovePoint：pendingMovePoint相关字段。
 */

  pendingMovePoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null = null;
  /** modalZoom：弹窗缩放。 */
  modalZoom = 1;
  /** modalPanX：弹窗Pan X。 */
  modalPanX = 0;
  /** modalPanY：弹窗Pan Y。 */
  modalPanY = 0;
  /** modalPanState：弹窗Pan状态。 */
  modalPanState: ModalPanState | null = null;  
  /**
 * hoveredModalPoint：hovered弹层Point相关字段。
 */

  hoveredModalPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null = null;
  /** mobileCatalogOpen：mobile目录Open。 */
  mobileCatalogOpen = false;
  /** catalogEntryNodes：目录条目Nodes。 */
  readonly catalogEntryNodes = new Map<string, HTMLButtonElement>();
  readonly catalogGroupHeaderNodes = new Map<string, HTMLElement>();
  /** catalogEmptyNode：目录Empty节点。 */
  catalogEmptyNode: HTMLElement | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    this.mountModalToBody();

    this.toggleBtn?.addEventListener('click', () => {
      this.overlayVisible = !this.overlayVisible;
      this.render();
    });

    this.openBtn?.addEventListener('click', () => {
      if (this.modalOpen) {
        this.closeModal();
        return;
      }
      this.openModal();
    });

    this.overlayRoot?.addEventListener('click', () => {
      if (this.modalOpen || !this.scene?.mapMeta || !this.scene.player) {
        return;
      }
      this.openModal();
    });

    this.modalCloseBtn?.addEventListener('click', () => {
      this.closeModal();
    });

    this.modalCatalogToggleBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.mobileCatalogOpen = !this.mobileCatalogOpen;
      this.syncResponsiveModalChrome();
    });

    this.modalSourceMemoryBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setModalDisplayMode('memory');
    });

    this.modalSourceUnlockBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setModalDisplayMode('unlock');
    });

    this.modal?.addEventListener('click', () => {
      if (!this.modalOpen) {
        return;
      }
      this.closeModal();
    });

    this.modalWindow?.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    this.modalBody?.addEventListener('click', (event) => {
      if (!this.modalOpen || !this.isCompactViewport() || !this.mobileCatalogOpen) {
        return;
      }
      const target = event.target as Node | null;
      if (
        (target && this.modalSidebar?.contains(target))
        || (target && this.modalCatalogToggleBtn?.contains(target))
      ) {
        return;
      }
      this.mobileCatalogOpen = false;
      this.syncResponsiveModalChrome();
    });

    this.modalTabAll?.addEventListener('click', () => {
      this.catalogFilter = 'all';
      this.closeMoveConfirm();
      this.renderCatalog();
    });

    this.modalTabMemory?.addEventListener('click', () => {
      this.catalogFilter = 'memory';
      this.closeMoveConfirm();
      this.renderCatalog();
    });

    this.modalTabUnlock?.addEventListener('click', () => {
      this.catalogFilter = 'unlock';
      this.closeMoveConfirm();
      this.renderCatalog();
    });

    this.deleteMemoryBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openDeleteMemoryConfirm('selected');
    });

    this.deleteAllMemoryBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openDeleteMemoryConfirm('all');
    });

    this.modalList?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-map-id]');
      const mapId = button?.dataset.mapId;
      if (!mapId || mapId === this.selectedMapId) {
        return;
      }
      this.selectedMapId = mapId;
      this.baseKey = null;
      this.hoveredModalPoint = null;
      if (this.isCompactViewport()) {
        this.mobileCatalogOpen = false;
        this.syncResponsiveModalChrome();
      }
      this.closeMoveConfirm();
      this.resetModalViewport();
      this.renderCatalog();
      this.scheduleRender();
    });

    this.modalCanvas?.addEventListener('wheel', (event) => {
      if (!this.modalOpen || !this.modalCanvas) {
        return;
      }
      const display = this.getModalDisplayScene();
      if (!display) {
        return;
      }
      ensureCanvasSize(this.modalCanvas);
      const pixels = getCanvasPixels(this.modalCanvas, event.clientX, event.clientY);
      if (!pixels) {
        return;
      }
      const previousMetrics = this.getViewportMetrics(this.modalCanvas, display, true);
      const anchor = this.resolveWorldPoint(previousMetrics, pixels.x, pixels.y)
        ?? { x: previousMetrics.mapWidth / 2, y: previousMetrics.mapHeight / 2 };
      const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
      const nextZoom = clamp(Number((this.modalZoom * factor).toFixed(4)), MIN_MODAL_ZOOM, MAX_MODAL_ZOOM);
      if (nextZoom === this.modalZoom) {
        return;
      }
      event.preventDefault();
      const previewMetrics = this.getViewportMetrics(this.modalCanvas, display, true, nextZoom, this.modalPanX, this.modalPanY);
      const nextMetrics = this.getViewportMetrics(
        this.modalCanvas,
        display,
        true,
        nextZoom,
        pixels.x - previewMetrics.baseOffsetX - anchor.x * previewMetrics.scale,
        pixels.y - previewMetrics.baseOffsetY - anchor.y * previewMetrics.scale,
      );
      this.modalZoom = nextZoom;
      this.modalPanX = nextMetrics.panX;
      this.modalPanY = nextMetrics.panY;
      this.scheduleRender();
    }, { passive: false });

    this.modalCanvas?.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    this.modalCanvas?.addEventListener('pointerdown', (event) => {
      if (!this.modalOpen || !this.modalCanvas || event.button !== 2) {
        return;
      }
      event.preventDefault();
      this.modalPanState = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: this.modalPanX,
        startPanY: this.modalPanY,
      };
      this.modalCanvas.setPointerCapture(event.pointerId);
    });

    this.modalCanvas?.addEventListener('pointermove', (event) => {
      if (!this.modalOpen || !this.modalCanvas) {
        return;
      }
      const display = this.getModalDisplayScene();
      if (!display) {
        return;
      }

      if (this.modalPanState && this.modalPanState.pointerId === event.pointerId) {
        const rect = this.modalCanvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? this.modalCanvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? this.modalCanvas.height / rect.height : 1;
        const nextMetrics = this.getViewportMetrics(
          this.modalCanvas,
          display,
          true,
          this.modalZoom,
          this.modalPanState.startPanX + (event.clientX - this.modalPanState.startClientX) * scaleX,
          this.modalPanState.startPanY + (event.clientY - this.modalPanState.startClientY) * scaleY,
        );
        this.modalPanX = nextMetrics.panX;
        this.modalPanY = nextMetrics.panY;
        this.scheduleRender();
        return;
      }

      const point = this.resolveCanvasPoint(this.modalCanvas, event.clientX, event.clientY, display, true);
      const nextHover = point ? { x: point.x, y: point.y } : null;
      if (
        this.hoveredModalPoint?.x !== nextHover?.x
        || this.hoveredModalPoint?.y !== nextHover?.y
      ) {
        this.hoveredModalPoint = nextHover;
        this.scheduleRender();
      }
    });

    this.modalCanvas?.addEventListener('pointerleave', () => {
      if (!this.modalPanState && this.hoveredModalPoint) {
        this.hoveredModalPoint = null;
        this.scheduleRender();
      }
    });

    this.modalCanvas?.addEventListener('pointerup', (event) => {
      if (this.modalPanState?.pointerId === event.pointerId) {
        this.cancelModalPan();
      }
    });

    this.modalCanvas?.addEventListener('pointercancel', (event) => {
      if (this.modalPanState?.pointerId === event.pointerId) {
        this.cancelModalPan();
      }
    });

    this.modalCanvas?.addEventListener('click', (event) => {
      if (!this.modalOpen || event.button !== 0 || this.modalPanState) {
        return;
      }
      if (this.isCompactViewport() && this.mobileCatalogOpen) {
        this.mobileCatalogOpen = false;
        this.syncResponsiveModalChrome();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!this.moveHandler) {
        return;
      }
      const display = this.getModalDisplayScene();
      const moveTarget = this.resolveCurrentMoveTarget(display, this.modalCanvas, event.clientX, event.clientY, true);
      if (!display || !moveTarget) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.openMoveConfirm(display.mapMeta, moveTarget.x, moveTarget.y, display.mapId);
    });

    window.addEventListener('pointerup', (event) => {
      if (this.modalPanState?.pointerId === event.pointerId) {
        this.cancelModalPan();
      }
    });

    window.addEventListener('pointercancel', (event) => {
      if (this.modalPanState?.pointerId === event.pointerId) {
        this.cancelModalPan();
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.modalOpen) {
        this.closeModal();
      }
    });

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    window.addEventListener('resize', () => {
      if (!this.modalOpen) {
        return;
      }
      if (resizeTimer !== null) {
        return;
      }
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        if (!this.modalOpen) {
          return;
        }
        this.syncResponsiveModalChrome();
        this.scheduleRender();
      }, 100);
    });
  }

  /** mountModalToBody：处理mount弹窗To身体。 */
  mountModalToBody(): void {
    mountModalToBodyImpl(this);
  }

  /** isCompactViewport：判断是否Compact视口。 */
  isCompactViewport(): boolean {
    return isCompactViewportImpl(this);
  }

  /** syncResponsiveModalChrome：同步Responsive弹窗Chrome。 */
  syncResponsiveModalChrome(): void {
    syncResponsiveModalChromeImpl(this);
  }

  /** 注册点击地图前往目标坐标的回调 */
  setMoveHandler(handler: ((x: number, y: number, mapId?: string) => void) | null): void {
    this.moveHandler = handler;
  }

  /** 注册本地地图记忆删除后的运行时同步回调。 */
  setMemoryDeleteHandler(handler: ((mapIds: readonly string[] | null) => void) | null): void {
    this.memoryDeleteHandler = handler;
  }

  /** 更新当前地图场景数据并触发重绘 */
  updateScene(scene: MinimapScene | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const previousCurrentMapId = this.scene?.mapMeta?.id ?? null;
    this.scene = scene;
    if (!scene) {
      this.selectedMapId = null;
      this.baseKey = null;
      this.hoveredModalPoint = null;
      this.closeMoveConfirm();
    } else {
      const nextCurrentMapId = scene.mapMeta?.id ?? null;
      const currentMapChanged = nextCurrentMapId !== previousCurrentMapId;
      if (currentMapChanged || !this.selectedMapId) {
        this.selectedMapId = nextCurrentMapId;
        this.baseKey = null;
        this.hoveredModalPoint = null;
        if (currentMapChanged) {
          this.closeMoveConfirm();
          this.resetModalViewport();
          this.cancelModalPan();
        }
      }
    }
    this.render();
  }

  /** clear：清理clear。 */
  clear(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.scene = null;
    this.selectedMapId = null;
    this.baseKey = null;
    this.hoveredModalPoint = null;
    this.cancelModalPan();
    this.closeMoveConfirm();
    detailModalHost.close(Minimap.DELETE_MEMORY_OWNER);
    this.overlayRoot?.classList.add('hidden');
    this.shell?.classList.add('hidden');
    this.modal?.classList.add('hidden');
    this.modal?.setAttribute('aria-hidden', 'true');
    this.modalOpen = false;
    const overlayCtx = this.overlayCanvas?.getContext('2d');
    overlayCtx?.clearRect(0, 0, this.overlayCanvas?.width ?? 0, this.overlayCanvas?.height ?? 0);
    const modalCtx = this.modalCanvas?.getContext('2d');
    modalCtx?.clearRect(0, 0, this.modalCanvas?.width ?? 0, this.modalCanvas?.height ?? 0);
    if (this.modalList) {
      this.modalList.replaceChildren();
    }
    this.catalogEntryNodes.clear();
    this.modalDisplayMode = 'unlock';
  }

  /** resize：处理resize。 */
  resize(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.overlayCanvas) {
      ensureCanvasSize(this.overlayCanvas);
    }
    if (this.modalOpen && this.modalCanvas) {
      ensureCanvasSize(this.modalCanvas);
    }
    this.scheduleRender();
  }

  /** render：渲染渲染。 */
  render(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.refreshChrome();
    if (this.modalOpen) {
      this.renderCatalog();
    }
    this.scheduleRender();
  }

  /** scheduleRender：调度渲染。 */
  scheduleRender(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.renderQueued) {
      return;
    }
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.renderOverlay();
      this.renderExpandedMap();
    });
  }

  /** refreshChrome：处理refresh Chrome。 */
  refreshChrome(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const hasScene = !!(this.scene?.mapMeta && this.scene.player);
    this.shell?.classList.toggle('hidden', !hasScene);
    this.overlayRoot?.classList.toggle('hidden', !hasScene || !this.overlayVisible);
    this.syncModalDisplaySwitch();
    if (this.toggleBtn) {
      this.toggleBtn.textContent = this.overlayVisible
        ? t('minimap.overlay.toggle.hide-short', undefined)
        : t('minimap.overlay.toggle.show-short', undefined);
      this.toggleBtn.setAttribute('aria-label', this.overlayVisible
        ? t('minimap.overlay.toggle.hide-title', undefined)
        : t('minimap.overlay.toggle.show-title', undefined));
    }
    if (this.openBtn) {
      this.openBtn.textContent = this.modalOpen
        ? t('minimap.modal.toggle.collapse-short', undefined)
        : t('minimap.modal.toggle.open-short', undefined);
      this.openBtn.setAttribute('aria-label', this.modalOpen
        ? t('minimap.modal.toggle.collapse-title', undefined)
        : t('minimap.modal.toggle.open-title', undefined));
    }
  }

  /** openModal：打开弹窗。 */
  openModal(): void {
    openModalImpl(this);
  }

  /** closeModal：关闭弹窗。 */
  closeModal(): void {
    closeModalImpl(this);
  }

  /** resetModalViewport：重置弹窗视口。 */
  resetModalViewport(): void {
    resetModalViewportImpl(this);
  }

  /** cancelModalPan：取消弹窗Pan。 */
  cancelModalPan(): void {
    cancelModalPanImpl(this);
  }

  /** buildCatalogEntries：构建目录Entries。 */
  buildCatalogEntries(): CatalogEntry[] {
    return buildCatalogEntriesImpl(this);
  }

  /** renderCatalog：渲染目录。 */
  renderCatalog(): void {
    renderCatalogImpl(this);
  }

  /** createCatalogItemNode：创建目录物品节点。 */
  createCatalogItemNode(entry: CatalogEntry): HTMLButtonElement {
    return createCatalogItemNodeImpl(this, entry);
  }

  /** updateCatalogItemNode：更新目录物品节点。 */
  updateCatalogItemNode(entry: CatalogEntry, node: HTMLButtonElement): void {
    updateCatalogItemNodeImpl(this, entry, node);
  }
  /**
 * insertCatalogItemNodeInOrder：执行insert目录道具NodeIn订单相关逻辑。
 * @param node HTMLButtonElement 参数说明。
 * @param previousNode HTMLButtonElement | null 参数说明。
 * @param container HTMLElement 参数说明。
 * @returns 无返回值，直接更新insert目录道具NodeIn订单相关状态。
 */


  insertCatalogItemNodeInOrder(
    node: HTMLElement,
    previousNode: HTMLElement | null,
    container: HTMLElement,
  ): void {
    insertCatalogItemNodeInOrderImpl(this, node, previousNode, container);
  }

  /** getCatalogEmptyNode：读取目录Empty节点。 */
  getCatalogEmptyNode(): HTMLElement {
    return getCatalogEmptyNodeImpl(this);
  }

  /** removeAllCatalogNodes：处理remove All目录Nodes。 */
  removeAllCatalogNodes(): void {
    removeAllCatalogNodesImpl(this);
  }

  /** buildCatalogBadge：构建目录Badge。 */
  buildCatalogBadge(badgeClass: 'unlock' | 'memory', label: string): HTMLSpanElement {
    return buildCatalogBadgeImpl(this, badgeClass, label);
  }

  /** getCatalogDescription：读取目录Description。 */
  getCatalogDescription(entry: CatalogEntry): string {
    return getCatalogDescriptionImpl(this, entry);
  }

  /** getCurrentDisplayAvailability：读取当前显示Availability。 */
  getCurrentDisplayAvailability(): DisplaySourceAvailability {
    return getCurrentDisplayAvailabilityImpl(this);
  }

  /** getDisplayAvailability：读取显示Availability。 */
  getDisplayAvailability(selectedMapId: string | null, current: DisplayMapScene | null): DisplaySourceAvailability {
    return getDisplayAvailabilityImpl(this, selectedMapId, current);
  }

  /** resolveModalDisplayMode：解析弹窗显示模式。 */
  resolveModalDisplayMode(availability: DisplaySourceAvailability): MinimapDisplayMode {
    return resolveModalDisplayModeImpl(this, availability);
  }

  /** syncModalDisplaySwitch：同步弹窗显示Switch。 */
  syncModalDisplaySwitch(): void {
    syncModalDisplaySwitchImpl(this);
  }

  /** setModalDisplayMode：处理set弹窗显示模式。 */
  setModalDisplayMode(mode: MinimapDisplayMode): void {
    setModalDisplayModeImpl(this, mode);
  }

  /** getCurrentDisplayScene：读取当前显示场景。 */
  getCurrentDisplayScene(): DisplayMapScene | null {
    return getCurrentDisplaySceneImpl(this);
  }

  /** getModalDisplayScene：读取弹窗显示场景。 */
  getModalDisplayScene(): DisplayMapScene | null {
    return getModalDisplaySceneImpl(this);
  }

  /** buildTileCacheHash：构建地块缓存Hash。 */
  buildTileCacheHash(tileCache: ReadonlyMap<string, Tile>): string {
    return buildTileCacheHashImpl(this, tileCache);
  }

  /** buildBaseKey：构建基础Key。 */
  buildBaseKey(display: DisplayMapScene): string {
    return buildBaseKeyImpl(this, display);
  }

  /** ensureBaseCanvas：确保基础Canvas。 */
  ensureBaseCanvas(display: DisplayMapScene): void {
    ensureBaseCanvasImpl(this, display);
  }

  /** renderOverlay：渲染Overlay。 */
  renderOverlay(): void {
    renderOverlayImpl(this);
  }

  /** renderExpandedMap：绘制已展开的大地图 Canvas，不重建窗口。 */
  renderExpandedMap(): void {
    renderExpandedMapImpl(this);
  }

  /** openMoveConfirm：打开移动Confirm。 */
  openMoveConfirm(mapMeta: MapMeta, x: number, y: number, mapId: string): void {
    openMoveConfirmImpl(this, mapMeta, x, y, mapId);
  }

  /** closeMoveConfirm：关闭移动Confirm。 */
  closeMoveConfirm(): void {
    closeMoveConfirmImpl(this);
  }

  /** openDeleteMemoryConfirm：打开Delete Memory Confirm。 */
  openDeleteMemoryConfirm(scope: 'selected' | 'all'): void {
    openDeleteMemoryConfirmImpl(this, scope);
  }

  /** createConfirmMessage：创建确认说明。 */
  createConfirmMessage(message: string): HTMLElement {
    return createConfirmMessageImpl(this, message);
  }

  /** createMoveConfirmActions：创建移动确认按钮区。 */
  createMoveConfirmActions(x: number, y: number): HTMLElement {
    return createMoveConfirmActionsImpl(this, x, y);
  }

  /** bindMoveConfirmActions：绑定移动确认弹层按钮。 */
  bindMoveConfirmActions(body: HTMLElement, signal: AbortSignal, x: number, y: number, mapId: string): void {
    bindMoveConfirmActionsImpl(this, body, signal, x, y, mapId);
  }

  /** createDeleteMemoryActions：创建删除记忆按钮区。 */
  createDeleteMemoryActions(scope: 'selected' | 'all'): HTMLElement {
    return createDeleteMemoryActionsImpl(this, scope);
  }

  /** bindDeleteMemoryActions：绑定删除记忆确认弹层按钮。 */
  bindDeleteMemoryActions(body: HTMLElement, signal: AbortSignal, scope: 'selected' | 'all', selectedMapId: string | null): void {
    bindDeleteMemoryActionsImpl(this, body, signal, scope, selectedMapId);
  }

  /** createConfirmActions：创建确认动作容器。 */
  createConfirmActions(): HTMLElement {
    return createConfirmActionsImpl(this);
  }

  /** createConfirmButton：创建确认按钮。 */
  createConfirmButton(label: string, className: string): HTMLButtonElement {
    return createConfirmButtonImpl(this, label, className);
  }

  /** deleteSelectedMemory：处理delete Selected Memory。 */
  deleteSelectedMemory(mapId: string): void {
    deleteSelectedMemoryImpl(this, mapId);
  }

  /** deleteAllMemory：处理delete All Memory。 */
  deleteAllMemory(): void {
    deleteAllMemoryImpl(this);
  }

  /** applyMemoryDeletionToScene：同步小地图本地场景中的记忆删除结果。 */
  applyMemoryDeletionToScene(mapIds: readonly string[] | null): void {
    applyMemoryDeletionToSceneImpl(this, mapIds);
  }
  /**
 * getViewportMetrics：读取ViewportMetric。
 * @param canvas HTMLCanvasElement 参数说明。
 * @param display DisplayMapScene 参数说明。
 * @param isModal boolean 参数说明。
 * @param zoom 参数说明。
 * @param panX 参数说明。
 * @param panY 参数说明。
 * @returns 返回ViewportMetric。
 */


  getViewportMetrics(
    canvas: HTMLCanvasElement,
    display: DisplayMapScene,
    isModal: boolean,
    zoom = isModal ? this.modalZoom : 1,
    panX = isModal ? this.modalPanX : 0,
    panY = isModal ? this.modalPanY : 0,
  ): ViewportMetrics {
    return getViewportMetricsImpl(this, canvas, display, isModal, zoom, panX, panY);
  }

  /** resolveWorldPoint：解析世界坐标。 */
  resolveWorldPoint(metrics: ViewportMetrics, px: number, py: number): { x: number; y: number } | null {
    return resolveWorldPointImpl(this, metrics, px, py);
  }

  /** resolveCanvasPoint：判断CanvaPoint是否满足条件。 */
  resolveCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number, display: DisplayMapScene, isModal: boolean): { x: number; y: number } | null {
    return resolveCanvasPointImpl(this, canvas, clientX, clientY, display, isModal);
  }

  /** resolveCurrentMoveTarget：读取当前Move目标并返回结果。 */
  resolveCurrentMoveTarget(display: DisplayMapScene | null, canvas: HTMLCanvasElement | null, clientX: number, clientY: number, isModal: boolean): { x: number; y: number } | null {
    return resolveCurrentMoveTargetImpl(this, display, canvas, clientX, clientY, isModal);
  }

  /** getTileAt：读取地块At。 */
  getTileAt(display: DisplayMapScene, x: number, y: number): Tile | null {
    return getTileAtImpl(this, display, x, y);
  }

  /** getTileTypeAt：读取地块类型At。 */
  getTileTypeAt(display: DisplayMapScene, x: number, y: number): TileType {
    return getTileTypeAtImpl(this, display, x, y);
  }

  /** getDisplayMarkers：读取显示标记。 */
  getDisplayMarkers(display: DisplayMapScene): MapMinimapMarker[] {
    return getDisplayMarkersImpl(this, display);
  }
  /**
 * drawScene：执行drawScene相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param display DisplayMapScene 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param isModal boolean 参数说明。
 * @returns 无返回值，直接更新drawScene相关状态。
 */


  drawScene(
    ctx: CanvasRenderingContext2D,
    display: DisplayMapScene,
    metrics: ViewportMetrics,
    isModal: boolean,
  ): void {
    drawSceneImpl(this, ctx, display, metrics, isModal);
  }
  /**
 * drawMarker：处理drawMarker并更新相关状态。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param marker MapMinimapMarker 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param markerSize number 参数说明。
 * @returns 无返回值，直接更新drawMarker相关状态。
 */


  drawMarker(
    ctx: CanvasRenderingContext2D,
    marker: MapMinimapMarker,
    metrics: ViewportMetrics,
    markerSize: number,
  ): void {
    drawMarkerImpl(this, ctx, marker, metrics, markerSize);
  }
  /**
 * drawMarkerLabel：处理drawMarkerLabel并更新相关状态。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param marker MapMinimapMarker 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @returns 无返回值，直接更新drawMarkerLabel相关状态。
 */


  drawMarkerLabel(
    ctx: CanvasRenderingContext2D,
    marker: MapMinimapMarker,
    metrics: ViewportMetrics,
  ): void {
    drawMarkerLabelImpl(this, ctx, marker, metrics);
  }
  /**
 * drawGroundPile：执行draw地面Pile相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param pile GroundItemPileView 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param pileSize number 参数说明。
 * @returns 无返回值，直接更新drawGroundPile相关状态。
 */


  drawGroundPile(
    ctx: CanvasRenderingContext2D,
    pile: GroundItemPileView,
    metrics: ViewportMetrics,
    pileSize: number,
  ): void {
    drawGroundPileImpl(this, ctx, pile, metrics, pileSize);
  }
  /**
 * drawModalHud：执行draw弹层Hud相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param display DisplayMapScene 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param markers MapMinimapMarker[] 参数说明。
 * @returns 无返回值，直接更新draw弹层Hud相关状态。
 */


  drawModalHud(
    ctx: CanvasRenderingContext2D,
    display: DisplayMapScene,
    metrics: ViewportMetrics,
    markers: MapMinimapMarker[],
  ): void {
    drawModalHudImpl(this, ctx, display, metrics, markers);
  }

  /** buildHoverLines：构建Hover Lines。 */
  buildHoverLines(display: DisplayMapScene, markers: MapMinimapMarker[], x: number, y: number): string[] {
    return buildHoverLinesImpl(this, display, markers, x, y);
  }
}
