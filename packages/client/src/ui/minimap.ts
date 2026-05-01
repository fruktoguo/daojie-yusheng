/**
 * 小地图与大地图浏览器
 * 提供角落缩略图、全屏地图弹窗、地图目录切换、缩放平移、点击前往等功能
 */
import { getTileTypeFromMapChar, GroundItemPileView, isTileTypeWalkable, MapMeta, MapMinimapMarker, MapMinimapSnapshot, MINIMAP_MARKER_COLORS, Tile, TILE_MINIMAP_COLORS, TileType } from '@mud/shared';
import { deleteAllRememberedMaps, deleteRememberedMap, getRememberedMarkers, getRememberedTiles, listRememberedMapIds } from '../map-memory';
import { getCachedMapMeta, getCachedUnlockedMapSnapshot, listCachedUnlockedMapSummaries } from '../map-static-cache';
import { getMinimapMarkerKindLabel, getTileTypeLabel } from '../domain-labels';
import { detailModalHost } from './detail-modal-host';
import { patchElementChildren, patchElementHtml } from './dom-patch';
import { getViewportRoot } from './responsive-viewport';
import {
  EMPTY_GROUND_PILES,
  EMPTY_VISIBLE_TILES,
  MAX_MODAL_ZOOM,
  MIN_MODAL_ZOOM,
} from '../constants/visuals/minimap';
import { buildCanvasFont } from '../constants/ui/text';
import { formatDisplayCountBadge, formatDisplayInteger } from '../utils/number';

/** 小地图目录筛选条件。 */
type CatalogFilter = 'all' | 'memory' | 'unlock';
/** MinimapDisplayMode：模式枚举。 */
type MinimapDisplayMode = 'memory' | 'unlock';

/** 目录来源在当前环境中的可用性。 */
interface DisplaySourceAvailability {
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
interface MinimapScene {
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
interface CatalogEntry {
/**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * mapMeta：地图Meta相关字段。
 */

  mapMeta: MapMeta | null;  
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
interface DisplayMapScene {
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
interface ViewportMetrics {
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
interface ModalPanState {
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
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** parseTileKey：解析地块Key。 */
function parseTileKey(key: string): {
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
function ensureCanvasSize(canvas: HTMLCanvasElement): boolean {
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
function buildFallbackMapMeta(mapId: string, snapshot: MapMinimapSnapshot | null, tileCache: Map<string, Tile>): MapMeta {
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
    name: mapId,
    width,
    height,
  };
}

interface MinimapDrawExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

function buildMinimapDrawExtent(display: DisplayMapScene): MinimapDrawExtent {
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
function getCanvasPixels(canvas: HTMLCanvasElement, clientX: number, clientY: number): {
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
  private static readonly MOVE_CONFIRM_OWNER = 'map-minimap:move-confirm';
  /** DELETE_MEMORY_OWNER：DELETE MEMORY OWNER。 */
  private static readonly DELETE_MEMORY_OWNER = 'map-minimap:delete-memory';

  /** shell：shell。 */
  private readonly shell = document.getElementById('map-minimap-shell') as HTMLElement | null;
  /** overlayRoot：overlay Root。 */
  private readonly overlayRoot = document.getElementById('map-minimap') as HTMLElement | null;
  /** overlayCanvas：overlay Canvas。 */
  private readonly overlayCanvas = document.getElementById('map-minimap-canvas') as HTMLCanvasElement | null;
  /** overlayTitle：overlay标题。 */
  private readonly overlayTitle = document.getElementById('map-minimap-title') as HTMLElement | null;
  /** toggleBtn：toggle按钮。 */
  private readonly toggleBtn = document.getElementById('map-minimap-toggle') as HTMLButtonElement | null;
  /** openBtn：open按钮。 */
  private readonly openBtn = document.getElementById('map-minimap-open') as HTMLButtonElement | null;
  /** modal：弹窗。 */
  private readonly modal = document.getElementById('map-minimap-modal') as HTMLElement | null;
  /** modalBody：弹窗身体。 */
  private readonly modalBody = document.querySelector('#map-minimap-modal .map-minimap-modal-body') as HTMLElement | null;
  /** modalSidebar：弹窗Sidebar。 */
  private readonly modalSidebar = document.querySelector('#map-minimap-modal .map-minimap-modal-sidebar') as HTMLElement | null;
  /** modalWindow：弹窗窗口。 */
  private readonly modalWindow = document.getElementById('map-minimap-modal-window') as HTMLElement | null;
  /** modalTitle：弹窗标题。 */
  private readonly modalTitle = document.getElementById('map-minimap-modal-title') as HTMLElement | null;
  /** modalCatalogToggleBtn：弹窗目录Toggle按钮。 */
  private readonly modalCatalogToggleBtn = document.getElementById('map-minimap-modal-catalog-toggle') as HTMLButtonElement | null;
  /** modalCloseBtn：弹窗Close按钮。 */
  private readonly modalCloseBtn = document.getElementById('map-minimap-modal-close') as HTMLButtonElement | null;
  /** modalCanvas：弹窗Canvas。 */
  private readonly modalCanvas = document.getElementById('map-minimap-modal-canvas') as HTMLCanvasElement | null;
  /** modalSourceSwitch：弹窗来源Switch。 */
  private readonly modalSourceSwitch = document.getElementById('map-minimap-modal-source-switch') as HTMLElement | null;
  /** modalSourceMemoryBtn：弹窗来源Memory按钮。 */
  private readonly modalSourceMemoryBtn = document.getElementById('map-minimap-modal-source-memory') as HTMLButtonElement | null;
  /** modalSourceUnlockBtn：弹窗来源解锁按钮。 */
  private readonly modalSourceUnlockBtn = document.getElementById('map-minimap-modal-source-unlock') as HTMLButtonElement | null;
  /** modalList：弹窗列表。 */
  private readonly modalList = document.getElementById('map-minimap-modal-list') as HTMLElement | null;
  /** modalTabAll：弹窗Tab All。 */
  private readonly modalTabAll = document.getElementById('map-minimap-filter-all') as HTMLButtonElement | null;
  /** modalTabMemory：弹窗Tab Memory。 */
  private readonly modalTabMemory = document.getElementById('map-minimap-filter-memory') as HTMLButtonElement | null;
  /** modalTabUnlock：弹窗Tab解锁。 */
  private readonly modalTabUnlock = document.getElementById('map-minimap-filter-unlock') as HTMLButtonElement | null;
  /** deleteMemoryBtn：delete Memory按钮。 */
  private readonly deleteMemoryBtn = document.getElementById('map-minimap-delete-memory') as HTMLButtonElement | null;
  /** deleteAllMemoryBtn：删除全部地图记忆按钮。 */
  private readonly deleteAllMemoryBtn = document.getElementById('map-minimap-delete-all-memory') as HTMLButtonElement | null;

  /** baseCanvas：基础Canvas。 */
  private readonly baseCanvas = document.createElement('canvas');
  /** baseCtx：基础Ctx。 */
  private readonly baseCtx = this.baseCanvas.getContext('2d');
  /** scene：场景。 */
  private scene: MinimapScene | null = null;
  /** renderQueued：渲染Queued。 */
  private renderQueued = false;
  /** overlayVisible：overlay可见。 */
  private overlayVisible = true;
  /** modalOpen：弹窗Open。 */
  private modalOpen = false;
  /** baseKey：基础Key。 */
  private baseKey: string | null = null;
  /** selectedMapId：selected地图ID。 */
  private selectedMapId: string | null = null;
  /** modalDisplayMode：弹窗显示模式。 */
  private modalDisplayMode: MinimapDisplayMode = 'unlock';
  /** catalogFilter：目录筛选。 */
  private catalogFilter: CatalogFilter = 'all';
  /** moveHandler：移动Handler。 */
  private moveHandler: ((x: number, y: number) => void) | null = null;  
  /** memoryDeleteHandler：地图记忆删除后通知地图运行时同步缓存。 */
  private memoryDeleteHandler: ((mapIds: readonly string[] | null) => void) | null = null;
  /**
 * pendingMovePoint：pendingMovePoint相关字段。
 */

  private pendingMovePoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null = null;
  /** modalZoom：弹窗缩放。 */
  private modalZoom = 1;
  /** modalPanX：弹窗Pan X。 */
  private modalPanX = 0;
  /** modalPanY：弹窗Pan Y。 */
  private modalPanY = 0;
  /** modalPanState：弹窗Pan状态。 */
  private modalPanState: ModalPanState | null = null;  
  /**
 * hoveredModalPoint：hovered弹层Point相关字段。
 */

  private hoveredModalPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null = null;
  /** mobileCatalogOpen：mobile目录Open。 */
  private mobileCatalogOpen = false;
  /** catalogEntryNodes：目录条目Nodes。 */
  private readonly catalogEntryNodes = new Map<string, HTMLButtonElement>();
  /** catalogEmptyNode：目录Empty节点。 */
  private catalogEmptyNode: HTMLElement | null = null;  
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
      this.openMoveConfirm(display.mapMeta, moveTarget.x, moveTarget.y);
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

    window.addEventListener('resize', () => {
      if (!this.modalOpen) {
        return;
      }
      this.syncResponsiveModalChrome();
      this.scheduleRender();
    });
  }

  /** mountModalToBody：处理mount弹窗To身体。 */
  private mountModalToBody(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.modal) {
      return;
    }
    const root = getViewportRoot(document) ?? document.body;
    if (this.modal.parentElement === root) {
      return;
    }
    root.appendChild(this.modal);
  }

  /** isCompactViewport：判断是否Compact视口。 */
  private isCompactViewport(): boolean {
    return window.innerWidth <= 900;
  }

  /** syncResponsiveModalChrome：同步Responsive弹窗Chrome。 */
  private syncResponsiveModalChrome(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const catalogVisible = this.isCompactViewport() ? this.mobileCatalogOpen : true;
    if (this.modal) {
      this.modal.dataset.mobileCatalogOpen = catalogVisible ? 'true' : 'false';
    }
    if (this.modalCatalogToggleBtn) {
      this.modalCatalogToggleBtn.classList.toggle('active', catalogVisible);
      this.modalCatalogToggleBtn.setAttribute('aria-expanded', catalogVisible ? 'true' : 'false');
      this.modalCatalogToggleBtn.textContent = catalogVisible ? '收起' : '目录';
      this.modalCatalogToggleBtn.title = catalogVisible ? '收起地图目录' : '展开地图目录';
    }
  }

  /** 注册点击地图前往目标坐标的回调 */
  setMoveHandler(handler: ((x: number, y: number) => void) | null): void {
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
      patchElementHtml(this.modalList, '');
    }
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
  private scheduleRender(): void {
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
  private refreshChrome(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const hasScene = !!(this.scene?.mapMeta && this.scene.player);
    this.shell?.classList.toggle('hidden', !hasScene);
    this.overlayRoot?.classList.toggle('hidden', !hasScene || !this.overlayVisible);
    this.syncModalDisplaySwitch();
    if (this.toggleBtn) {
      this.toggleBtn.textContent = this.overlayVisible ? '隐' : '显';
      this.toggleBtn.title = this.overlayVisible ? '隐藏小地图' : '显示小地图';
    }
    if (this.openBtn) {
      this.openBtn.textContent = this.modalOpen ? '收' : '展';
      this.openBtn.title = this.modalOpen ? '收起大地图' : '展开大地图';
    }
  }

  /** openModal：打开弹窗。 */
  private openModal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.modal) {
      return;
    }
    this.modalOpen = true;
    this.mobileCatalogOpen = !this.isCompactViewport();
    if (!this.selectedMapId) {
      this.selectedMapId = this.scene?.mapMeta?.id ?? null;
    }
    this.resetModalViewport();
    this.renderCatalog();
    this.refreshChrome();
    this.syncResponsiveModalChrome();
    this.modal.classList.remove('hidden');
    this.modal.setAttribute('aria-hidden', 'false');
    this.scheduleRender();
  }

  /** closeModal：关闭弹窗。 */
  private closeModal(): void {
    this.modalOpen = false;
    this.mobileCatalogOpen = false;
    this.hoveredModalPoint = null;
    this.cancelModalPan();
    this.closeMoveConfirm();
    detailModalHost.close(Minimap.DELETE_MEMORY_OWNER);
    this.modal?.classList.add('hidden');
    this.modal?.setAttribute('aria-hidden', 'true');
    this.syncResponsiveModalChrome();
    this.refreshChrome();
    this.scheduleRender();
  }

  /** resetModalViewport：重置弹窗视口。 */
  private resetModalViewport(): void {
    this.modalZoom = 1;
    this.modalPanX = 0;
    this.modalPanY = 0;
  }

  /** cancelModalPan：取消弹窗Pan。 */
  private cancelModalPan(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.modalPanState && this.modalCanvas?.hasPointerCapture(this.modalPanState.pointerId)) {
      this.modalCanvas.releasePointerCapture(this.modalPanState.pointerId);
    }
    this.modalPanState = null;
  }

  /** buildCatalogEntries：构建目录Entries。 */
  private buildCatalogEntries(): CatalogEntry[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const entries = new Map<string, CatalogEntry>();
    const currentMapMeta = this.scene?.mapMeta ?? null;
    const currentMapId = currentMapMeta?.id ?? null;

    for (const mapId of listRememberedMapIds()) {
      const existing = entries.get(mapId);
      entries.set(mapId, {
        mapId,
        mapMeta: existing?.mapMeta ?? (mapId === currentMapId ? currentMapMeta : getCachedMapMeta(mapId)),
        hasMemory: true,
        hasUnlock: existing?.hasUnlock ?? false,
      });
    }

    for (const entry of listCachedUnlockedMapSummaries()) {
      const existing = entries.get(entry.mapId);
      entries.set(entry.mapId, {
        mapId: entry.mapId,
        mapMeta: existing?.mapMeta ?? entry.mapMeta,
        hasMemory: existing?.hasMemory ?? false,
        hasUnlock: true,
      });
    }

    if (currentMapId) {
      const existing = entries.get(currentMapId);
      entries.set(currentMapId, {
        mapId: currentMapId,
        mapMeta: currentMapMeta,
        hasMemory: existing?.hasMemory ?? true,
        hasUnlock: existing?.hasUnlock ?? !!this.scene?.snapshot,
      });
    }

    return [...entries.values()].sort((left, right) => {
      if (left.mapId === currentMapId) {
        return -1;
      }
      if (right.mapId === currentMapId) {
        return 1;
      }
      const leftName = left.mapMeta?.name ?? left.mapId;
      const rightName = right.mapMeta?.name ?? right.mapId;
      return leftName.localeCompare(rightName, 'zh-Hans-CN');
    });
  }

  /** renderCatalog：渲染目录。 */
  private renderCatalog(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.modalList) {
      return;
    }

    const allEntries = this.buildCatalogEntries();
    const filteredEntries = allEntries.filter((entry) => {
      if (this.catalogFilter === 'memory') {
        return entry.hasMemory;
      }
      if (this.catalogFilter === 'unlock') {
        return entry.hasUnlock;
      }
      return true;
    });

    const currentMapId = this.scene?.mapMeta?.id ?? null;
    const selectedVisible = filteredEntries.some((entry) => entry.mapId === this.selectedMapId);
    if (!selectedVisible) {
      this.selectedMapId = filteredEntries.find((entry) => entry.mapId === currentMapId)?.mapId
        ?? filteredEntries[0]?.mapId
        ?? allEntries[0]?.mapId
        ?? null;
      this.baseKey = null;
      this.hoveredModalPoint = null;
      this.closeMoveConfirm();
      this.resetModalViewport();
    }

    this.syncModalDisplaySwitch();

    this.modalTabAll?.classList.toggle('active', this.catalogFilter === 'all');
    this.modalTabMemory?.classList.toggle('active', this.catalogFilter === 'memory');
    this.modalTabUnlock?.classList.toggle('active', this.catalogFilter === 'unlock');
    if (this.deleteMemoryBtn) {
      const selectedEntry = allEntries.find((entry) => entry.mapId === this.selectedMapId) ?? null;
      this.deleteMemoryBtn.disabled = !selectedEntry?.hasMemory;
      this.deleteMemoryBtn.title = selectedEntry?.hasMemory ? `删除 ${selectedEntry.mapMeta?.name ?? selectedEntry.mapId} 的本地记忆` : '当前地图没有可删除的本地记忆';
    }
    if (this.deleteAllMemoryBtn) {
      const hasAnyMemory = listRememberedMapIds().length > 0;
      this.deleteAllMemoryBtn.disabled = !hasAnyMemory;
      this.deleteAllMemoryBtn.title = hasAnyMemory ? '删除所有地图的本地记忆' : '当前没有可删除的本地记忆';
    }

    const catalogContainer = this.modalList;
    const previousScrollTop = catalogContainer.scrollTop;
    const filteredIds = new Set(filteredEntries.map((entry) => entry.mapId));

    if (filteredEntries.length === 0) {
      this.removeAllCatalogNodes();
      patchElementChildren(catalogContainer, this.getCatalogEmptyNode());
      return;
    }

    if (this.catalogEmptyNode?.parentElement === catalogContainer) {
      catalogContainer.removeChild(this.catalogEmptyNode);
    }

    for (const existingId of Array.from(this.catalogEntryNodes.keys())) {
      if (!filteredIds.has(existingId)) {
        this.catalogEntryNodes.get(existingId)?.remove();
        this.catalogEntryNodes.delete(existingId);
      }
    }

    let previousNode: HTMLButtonElement | null = null;
    for (const entry of filteredEntries) {
      let node = this.catalogEntryNodes.get(entry.mapId);
      if (!node) {
        node = this.createCatalogItemNode(entry);
        this.catalogEntryNodes.set(entry.mapId, node);
      }
      this.updateCatalogItemNode(entry, node);
      this.insertCatalogItemNodeInOrder(node, previousNode, catalogContainer);
      previousNode = node;
    }

    catalogContainer.scrollTop = previousScrollTop;
  }

  /** createCatalogItemNode：创建目录物品节点。 */
  private createCatalogItemNode(entry: CatalogEntry): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-minimap-modal-item';
    button.dataset.mapId = entry.mapId;

    const head = document.createElement('div');
    head.className = 'map-minimap-modal-item-head';

    const name = document.createElement('span');
    name.className = 'map-minimap-modal-item-name';
    head.appendChild(name);

    const badges = document.createElement('span');
    badges.className = 'map-minimap-modal-item-badges';
    head.appendChild(badges);

    button.appendChild(head);

    return button;
  }

  /** updateCatalogItemNode：更新目录物品节点。 */
  private updateCatalogItemNode(entry: CatalogEntry, node: HTMLButtonElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const nameNode = node.querySelector<HTMLSpanElement>('.map-minimap-modal-item-name');
    if (nameNode) {
      nameNode.textContent = entry.mapMeta?.name ?? '无名地域';
    }

    const badgesNode = node.querySelector<HTMLElement>('.map-minimap-modal-item-badges');
    if (badgesNode) {
      const badges: HTMLElement[] = [];
      if (entry.hasMemory) {
        badges.push(this.buildCatalogBadge('memory', '忆'));
      }
      if (entry.hasUnlock) {
        badges.push(this.buildCatalogBadge('unlock', '图'));
      }
      patchElementChildren(badgesNode, badges);
    }

    node.dataset.mapId = entry.mapId;
    node.classList.toggle('active', entry.mapId === this.selectedMapId);
  }  
  /**
 * insertCatalogItemNodeInOrder：执行insert目录道具NodeIn订单相关逻辑。
 * @param node HTMLButtonElement 参数说明。
 * @param previousNode HTMLButtonElement | null 参数说明。
 * @param container HTMLElement 参数说明。
 * @returns 无返回值，直接更新insert目录道具NodeIn订单相关状态。
 */


  private insertCatalogItemNodeInOrder(
    node: HTMLButtonElement,
    previousNode: HTMLButtonElement | null,
    container: HTMLElement,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const anchor = previousNode ? previousNode.nextElementSibling : container.firstElementChild;
    if (anchor === node) {
      return;
    }
    container.insertBefore(node, anchor);
  }

  /** getCatalogEmptyNode：读取目录Empty节点。 */
  private getCatalogEmptyNode(): HTMLElement {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.catalogEmptyNode) {
      this.catalogEmptyNode = document.createElement('div');
      this.catalogEmptyNode.className = 'map-minimap-modal-empty';
    }
    this.catalogEmptyNode.textContent = '当前分类下没有可浏览的地图。';
    return this.catalogEmptyNode;
  }

  /** removeAllCatalogNodes：处理remove All目录Nodes。 */
  private removeAllCatalogNodes(): void {
    this.catalogEntryNodes.forEach((node) => {
      node.remove();
    });
    this.catalogEntryNodes.clear();
  }

  /** buildCatalogBadge：构建目录Badge。 */
  private buildCatalogBadge(badgeClass: 'unlock' | 'memory', label: string): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = `map-minimap-modal-badge ${badgeClass}`;
    badge.textContent = label;
    return badge;
  }

  /** getCatalogDescription：读取目录Description。 */
  private getCatalogDescription(entry: CatalogEntry): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const description = entry.mapMeta?.description?.trim();
    if (description) {
      return description;
    }
    if (entry.hasUnlock && entry.hasMemory) {
      return '已拥有完整舆图，也保留了自身行走记忆。';
    }
    if (entry.hasUnlock) {
      return '已解锁完整舆图，可查看整张地图地势。';
    }
    return '仅保留本地探索记忆，未获得完整地图。';
  }

  /** getCurrentDisplayAvailability：读取当前显示Availability。 */
  private getCurrentDisplayAvailability(): DisplaySourceAvailability {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.scene) {
      return { hasMemory: false, hasUnlock: false };
    }
    return {
      hasMemory: this.scene.tileCache.size > 0
        || this.scene.visibleTiles.size > 0
        || this.scene.rememberedMarkers.length > 0
        || this.scene.visibleMarkers.length > 0,
      hasUnlock: !!this.scene.snapshot,
    };
  }

  /** getDisplayAvailability：读取显示Availability。 */
  private getDisplayAvailability(selectedMapId: string | null, current: DisplayMapScene | null): DisplaySourceAvailability {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!selectedMapId) {
      return { hasMemory: false, hasUnlock: false };
    }
    if (current && selectedMapId === current.mapId) {
      return {
        hasMemory: current.hasMemory,
        hasUnlock: current.hasUnlock,
      };
    }
    const snapshot = getCachedUnlockedMapSnapshot(selectedMapId);
    const rememberedMarkers = getRememberedMarkers(selectedMapId);
    const tileCache = getRememberedTiles(selectedMapId);
    return {
      hasMemory: tileCache.size > 0 || rememberedMarkers.length > 0,
      hasUnlock: !!snapshot,
    };
  }

  /** resolveModalDisplayMode：解析弹窗显示模式。 */
  private resolveModalDisplayMode(availability: DisplaySourceAvailability): MinimapDisplayMode {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.modalDisplayMode === 'unlock' && availability.hasUnlock) {
      return 'unlock';
    }
    if (this.modalDisplayMode === 'memory' && availability.hasMemory) {
      return 'memory';
    }
    return availability.hasUnlock ? 'unlock' : 'memory';
  }

  /** syncModalDisplaySwitch：同步弹窗显示Switch。 */
  private syncModalDisplaySwitch(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const current = this.getCurrentDisplayScene();
    const selectedMapId = this.selectedMapId ?? current?.mapId ?? null;
    const availability = this.getDisplayAvailability(selectedMapId, current);
    const showSwitch = availability.hasMemory && availability.hasUnlock;
    const nextMode = this.resolveModalDisplayMode(availability);
    this.modalDisplayMode = nextMode;

    this.modalSourceSwitch?.classList.toggle('hidden', !showSwitch);

    if (this.modalSourceMemoryBtn) {
      const active = nextMode === 'memory';
      this.modalSourceMemoryBtn.classList.toggle('active', active);
      this.modalSourceMemoryBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      this.modalSourceMemoryBtn.title = '显示本地记忆地图';
    }
    if (this.modalSourceUnlockBtn) {
      const active = nextMode === 'unlock';
      this.modalSourceUnlockBtn.classList.toggle('active', active);
      this.modalSourceUnlockBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      this.modalSourceUnlockBtn.title = '显示已解锁整图';
    }
  }

  /** setModalDisplayMode：处理set弹窗显示模式。 */
  private setModalDisplayMode(mode: MinimapDisplayMode): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const current = this.getCurrentDisplayScene();
    const selectedMapId = this.selectedMapId ?? current?.mapId ?? null;
    const availability = this.getDisplayAvailability(selectedMapId, current);
    if ((mode === 'memory' && !availability.hasMemory) || (mode === 'unlock' && !availability.hasUnlock)) {
      return;
    }
    if (this.modalDisplayMode === mode) {
      return;
    }
    this.modalDisplayMode = mode;
    this.baseKey = null;
    this.hoveredModalPoint = null;
    this.closeMoveConfirm();
    this.syncModalDisplaySwitch();
    this.scheduleRender();
  }

  /** getCurrentDisplayScene：读取当前显示场景。 */
  private getCurrentDisplayScene(): DisplayMapScene | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.scene?.mapMeta) {
      return null;
    }
    const availability = this.getCurrentDisplayAvailability();
    return {
      mapId: this.scene.mapMeta.id,
      mapMeta: this.scene.mapMeta,
      snapshot: this.scene.snapshot,
      rememberedMarkers: this.scene.rememberedMarkers,
      visibleMarkers: this.scene.visibleMarkers,
      tileCache: this.scene.tileCache,
      visibleTiles: this.scene.visibleTiles,
      visibleEntities: this.scene.visibleEntities,
      groundPiles: this.scene.groundPiles,
      player: this.scene.player,
      viewRadius: this.scene.viewRadius,
      isCurrent: true,
      memoryVersion: this.scene.memoryVersion,
      displayMode: availability.hasUnlock ? 'unlock' : 'memory',
      hasMemory: availability.hasMemory,
      hasUnlock: availability.hasUnlock,
    };
  }

  /** getModalDisplayScene：读取弹窗显示场景。 */
  private getModalDisplayScene(): DisplayMapScene | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const current = this.getCurrentDisplayScene();
    if (!this.modalOpen) {
      return null;
    }
    const selectedMapId = this.selectedMapId ?? current?.mapId ?? null;
    if (!selectedMapId) {
      return current;
    }
    if (current && selectedMapId === current.mapId) {
      const mode = this.resolveModalDisplayMode({
        hasMemory: current.hasMemory,
        hasUnlock: current.hasUnlock,
      });
      this.modalDisplayMode = mode;
      return {
        ...current,
        snapshot: mode === 'unlock' ? current.snapshot : null,
        displayMode: mode,
      };
    }

    const snapshot = getCachedUnlockedMapSnapshot(selectedMapId);
    const rememberedMarkers = getRememberedMarkers(selectedMapId);
    const tileCache = getRememberedTiles(selectedMapId);
    const hasMemory = tileCache.size > 0 || rememberedMarkers.length > 0;
    const hasUnlock = !!snapshot;
    if (!hasUnlock && !hasMemory) {
      return current;
    }

    const mode = this.resolveModalDisplayMode({ hasMemory, hasUnlock });
    this.modalDisplayMode = mode;
    const mapMeta = getCachedMapMeta(selectedMapId) ?? buildFallbackMapMeta(selectedMapId, snapshot, tileCache);
    return {
      mapId: selectedMapId,
      mapMeta,
      snapshot: mode === 'unlock' ? snapshot : null,
      rememberedMarkers,
      visibleMarkers: [],
      tileCache,
      visibleTiles: EMPTY_VISIBLE_TILES,
      visibleEntities: [],
      groundPiles: EMPTY_GROUND_PILES,
      player: null,
      viewRadius: 0,
      isCurrent: false,
      memoryVersion: tileCache.size,
      displayMode: mode,
      hasMemory,
      hasUnlock,
    };
  }

  /** buildTileCacheHash：构建地块缓存Hash。 */
  private buildTileCacheHash(tileCache: ReadonlyMap<string, Tile>): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let hash = 0;
    for (const [key, tile] of tileCache.entries()) {
      for (let index = 0; index < key.length; index += 1) {
        hash = (hash * 33 + key.charCodeAt(index)) >>> 0;
      }
      for (let index = 0; index < tile.type.length; index += 1) {
        hash = (hash * 33 + tile.type.charCodeAt(index)) >>> 0;
      }
    }
    return `${tileCache.size}:${hash}`;
  }

  /** buildBaseKey：构建基础Key。 */
  private buildBaseKey(display: DisplayMapScene): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const extent = buildMinimapDrawExtent(display);
    if (display.snapshot) {
      return `snapshot:${display.mapId}:${display.snapshot.width}:${display.snapshot.height}:${display.snapshot.terrainRows.length}:${display.snapshot.markers.length}:${extent.minX},${extent.minY},${extent.maxX},${extent.maxY}:${this.buildTileCacheHash(display.tileCache)}`;
    }
    if (display.isCurrent) {
      return `memory:${display.mapId}:${display.memoryVersion}:${extent.minX},${extent.minY},${extent.maxX},${extent.maxY}`;
    }
    return `memory:${display.mapId}:${this.buildTileCacheHash(display.tileCache)}:${extent.minX},${extent.minY},${extent.maxX},${extent.maxY}`;
  }

  /** ensureBaseCanvas：确保基础Canvas。 */
  private ensureBaseCanvas(display: DisplayMapScene): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.baseCtx) {
      return;
    }

    const nextKey = this.buildBaseKey(display);
    if (this.baseKey === nextKey) {
      return;
    }
    this.baseKey = nextKey;

    const extent = buildMinimapDrawExtent(display);
    this.baseCanvas.width = extent.width;
    this.baseCanvas.height = extent.height;
    this.baseCtx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
    this.baseCtx.fillStyle = '#0d0f12';
    this.baseCtx.fillRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);

    if (display.snapshot && display.snapshot.terrainRows.length > 0) {
      for (let y = 0; y < display.snapshot.terrainRows.length; y += 1) {
        const row = display.snapshot.terrainRows[y] ?? '';
        for (let x = 0; x < row.length; x += 1) {
          const type = getTileTypeFromMapChar(row[x] ?? '.');
          this.baseCtx.fillStyle = TILE_MINIMAP_COLORS[type] ?? '#888';
          this.baseCtx.fillRect(x - extent.minX, y - extent.minY, 1, 1);
        }
      }
    }

    for (const [key, tile] of display.tileCache.entries()) {
      const point = parseTileKey(key);
      if (!point) {
        continue;
      }
      if (
        point.x < extent.minX || point.y < extent.minY
        || point.x > extent.maxX || point.y > extent.maxY
      ) {
        continue;
      }
      this.baseCtx.fillStyle = TILE_MINIMAP_COLORS[tile.type] ?? '#888';
      this.baseCtx.fillRect(point.x - extent.minX, point.y - extent.minY, 1, 1);
    }
  }

  /** renderOverlay：渲染Overlay。 */
  private renderOverlay(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const ctx = this.overlayCanvas?.getContext('2d');
    const display = this.getCurrentDisplayScene();
    if (!ctx || !this.overlayCanvas) {
      return;
    }
    if (!display || !display.player || !this.overlayVisible || this.modalOpen) {
      ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
      return;
    }

    ensureCanvasSize(this.overlayCanvas);
    if (this.overlayTitle) {
      this.overlayTitle.textContent = `${display.mapMeta.name}${display.snapshot ? ' · 全图' : ' · 记忆'}`;
    }
    const metrics = this.getViewportMetrics(this.overlayCanvas, display, false);
    this.drawScene(ctx, display, metrics, false);
  }

  /** renderExpandedMap：绘制已展开的大地图 Canvas，不重建窗口。 */
  private renderExpandedMap(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const ctx = this.modalCanvas?.getContext('2d');
    const display = this.getModalDisplayScene();
    if (!ctx || !this.modalCanvas || !this.modalOpen) {
      return;
    }
    if (!display) {
      ctx.clearRect(0, 0, this.modalCanvas.width, this.modalCanvas.height);
      return;
    }

    ensureCanvasSize(this.modalCanvas);
    const metrics = this.getViewportMetrics(this.modalCanvas, display, true);
    this.modalPanX = metrics.panX;
    this.modalPanY = metrics.panY;
    if (this.modalTitle) {
      this.modalTitle.textContent = `${display.mapMeta.name}${display.displayMode === 'unlock' ? ' · 已解锁图鉴' : ' · 本地记忆'}`;
    }
    if (!display.isCurrent) {
      this.closeMoveConfirm();
    }
    this.drawScene(ctx, display, metrics, true);
  }

  /** openMoveConfirm：打开移动Confirm。 */
  private openMoveConfirm(mapMeta: MapMeta, x: number, y: number): void {
    this.pendingMovePoint = { x, y };
    detailModalHost.open({
      ownerId: Minimap.MOVE_CONFIRM_OWNER,
      title: '确认前往',
      subtitle: `${mapMeta.name} · 坐标 (${x}, ${y})`,
      hint: '点击空白处取消',
      renderBody: (body) => {
        patchElementChildren(body, [
          this.createConfirmMessage('将角色移动至该坐标。实际是否可达仍以服务端寻路与通行判定为准。'),
          this.createMoveConfirmActions(x, y),
        ]);
      },
      onAfterRender: (body, signal) => {
        this.bindMoveConfirmActions(body, signal, x, y);
      },
      onClose: () => {
        this.pendingMovePoint = null;
      },
    });
  }

  /** closeMoveConfirm：关闭移动Confirm。 */
  private closeMoveConfirm(): void {
    this.pendingMovePoint = null;
    detailModalHost.close(Minimap.MOVE_CONFIRM_OWNER);
  }

  /** openDeleteMemoryConfirm：打开Delete Memory Confirm。 */
  private openDeleteMemoryConfirm(scope: 'selected' | 'all'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const allEntries = this.buildCatalogEntries();
    const selectedMapId = this.selectedMapId;
    const selectedEntry = selectedMapId ? allEntries.find((candidate) => candidate.mapId === selectedMapId) : null;
    const rememberedMapIds = listRememberedMapIds();
    if (scope === 'selected' && (!selectedMapId || !selectedEntry?.hasMemory)) {
      return;
    }
    if (scope === 'all' && rememberedMapIds.length === 0) {
      return;
    }
    const mapName = scope === 'all'
      ? `共 ${formatDisplayInteger(rememberedMapIds.length)} 张地图`
      : (selectedEntry?.mapMeta?.name ?? selectedMapId ?? '当前地图');
    const title = scope === 'all' ? '删除全部本地记忆' : '删除本地记忆';
    const message = scope === 'all'
      ? '会删除所有地图的本地探索记忆，不会影响已解锁整图。当前视野内正在看到的部分会继续保留在本次画面中。'
      : '只会删除这张地图的本地记忆，不会影响已解锁整图。若你当前正站在该地图，视野内正在看到的部分会继续保留在本次画面中。';
    detailModalHost.open({
      ownerId: Minimap.DELETE_MEMORY_OWNER,
      title,
      subtitle: mapName,
      hint: '点击空白处取消',
      renderBody: (body) => {
        patchElementChildren(body, [
          this.createConfirmMessage(message),
          this.createDeleteMemoryActions(scope),
        ]);
      },
      onAfterRender: (body, signal) => {
        this.bindDeleteMemoryActions(body, signal, scope, selectedMapId);
      },
    });
  }

  /** createConfirmMessage：创建确认说明。 */
  private createConfirmMessage(message: string): HTMLElement {
    const section = document.createElement('div');
    section.className = 'panel-section';
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = message;
    section.append(hint);
    return section;
  }

  /** createMoveConfirmActions：创建移动确认按钮区。 */
  private createMoveConfirmActions(x: number, y: number): HTMLElement {
    const actions = this.createConfirmActions();
    const cancelButton = this.createConfirmButton('取消', 'small-btn ghost');
    cancelButton.dataset.mapMoveCancel = 'true';
    const confirmButton = this.createConfirmButton('确认前往', 'small-btn');
    confirmButton.dataset.mapMoveConfirm = 'true';
    actions.append(cancelButton, confirmButton);
    return actions;
  }

  /** bindMoveConfirmActions：绑定移动确认弹层按钮。 */
  private bindMoveConfirmActions(body: HTMLElement, signal: AbortSignal, x: number, y: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    body.querySelector<HTMLButtonElement>('[data-map-move-cancel="true"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeMoveConfirm();
    }, { signal });

    body.querySelector<HTMLButtonElement>('[data-map-move-confirm="true"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.moveHandler) {
        this.closeMoveConfirm();
        return;
      }
      this.moveHandler(x, y);
      this.closeMoveConfirm();
    }, { signal });
  }

  /** createDeleteMemoryActions：创建删除记忆按钮区。 */
  private createDeleteMemoryActions(scope: 'selected' | 'all'): HTMLElement {
    const actions = this.createConfirmActions();
    const cancelButton = this.createConfirmButton('取消', 'small-btn ghost');
    cancelButton.dataset.mapMemoryDeleteCancel = 'true';
    const confirmButton = this.createConfirmButton(scope === 'all' ? '确认全部删除' : '确认删除', 'small-btn danger');
    confirmButton.dataset.mapMemoryDeleteConfirm = 'true';
    actions.append(cancelButton, confirmButton);
    return actions;
  }

  /** bindDeleteMemoryActions：绑定删除记忆确认弹层按钮。 */
  private bindDeleteMemoryActions(body: HTMLElement, signal: AbortSignal, scope: 'selected' | 'all', selectedMapId: string | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    body.querySelector<HTMLButtonElement>('[data-map-memory-delete-cancel="true"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      detailModalHost.close(Minimap.DELETE_MEMORY_OWNER);
    }, { signal });

    body.querySelector<HTMLButtonElement>('[data-map-memory-delete-confirm="true"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (scope === 'all') {
        this.deleteAllMemory();
      } else if (selectedMapId) {
        this.deleteSelectedMemory(selectedMapId);
      }
      detailModalHost.close(Minimap.DELETE_MEMORY_OWNER);
    }, { signal });
  }

  /** createConfirmActions：创建确认动作容器。 */
  private createConfirmActions(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'tech-modal-actions ui-modal-footer-actions';
    return actions;
  }

  /** createConfirmButton：创建确认按钮。 */
  private createConfirmButton(label: string, className: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = className;
    button.type = 'button';
    button.textContent = label;
    return button;
  }

  /** deleteSelectedMemory：处理delete Selected Memory。 */
  private deleteSelectedMemory(mapId: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    deleteRememberedMap(mapId);
    this.memoryDeleteHandler?.([mapId]);
    this.applyMemoryDeletionToScene([mapId]);
    this.renderCatalog();
    this.scheduleRender();
  }

  /** deleteAllMemory：处理delete All Memory。 */
  private deleteAllMemory(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const rememberedMapIds = listRememberedMapIds();
    if (rememberedMapIds.length === 0) {
      return;
    }
    deleteAllRememberedMaps();
    this.memoryDeleteHandler?.(null);
    this.applyMemoryDeletionToScene(null);
    this.renderCatalog();
    this.scheduleRender();
  }

  /** applyMemoryDeletionToScene：同步小地图本地场景中的记忆删除结果。 */
  private applyMemoryDeletionToScene(mapIds: readonly string[] | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.baseKey = null;
    this.closeMoveConfirm();
    if (this.scene?.mapMeta?.id && (mapIds === null || mapIds.includes(this.scene.mapMeta.id))) {
      const nextScene: MinimapScene = {
        ...this.scene,
        rememberedMarkers: [],
        memoryVersion: this.scene.memoryVersion + 1,
      };
      if (!this.scene.snapshot) {
        const visibleOnlyTileCache = new Map<string, Tile>();
        for (const key of this.scene.visibleTiles) {
          const tile = this.scene.tileCache.get(key);
          if (tile) {
            visibleOnlyTileCache.set(key, tile);
          }
        }
        nextScene.tileCache = visibleOnlyTileCache;
      }
      this.scene = nextScene;
    }
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


  private getViewportMetrics(
    canvas: HTMLCanvasElement,
    display: DisplayMapScene,
    isModal: boolean,
    zoom = isModal ? this.modalZoom : 1,
    panX = isModal ? this.modalPanX : 0,
    panY = isModal ? this.modalPanY : 0,
  ): ViewportMetrics {
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    const extent = buildMinimapDrawExtent(display);
    const mapWidth = extent.width;
    const mapHeight = extent.height;
    const padding = isModal
      ? Math.max(18, Math.round(Math.min(width, height) * 0.022))
      : Math.max(8, Math.round(Math.min(width, height) * 0.06));
    const innerWidth = Math.max(1, width - padding * 2);
    const innerHeight = Math.max(1, height - padding * 2);
    const fitScale = Math.min(innerWidth / mapWidth, innerHeight / mapHeight);
    const scale = fitScale * (isModal ? zoom : 1);
    const drawWidth = mapWidth * scale;
    const drawHeight = mapHeight * scale;
    const baseOffsetX = padding + (innerWidth - drawWidth) / 2;
    const baseOffsetY = padding + (innerHeight - drawHeight) / 2;
    const maxPanX = isModal ? Math.max(0, (drawWidth - innerWidth) / 2) : 0;
    const maxPanY = isModal ? Math.max(0, (drawHeight - innerHeight) / 2) : 0;
    const clampedPanX = isModal ? clamp(panX, -maxPanX, maxPanX) : 0;
    const clampedPanY = isModal ? clamp(panY, -maxPanY, maxPanY) : 0;
    return {
      width,
      height,
      innerWidth,
      innerHeight,
      mapWidth,
      mapHeight,
      minX: extent.minX,
      minY: extent.minY,
      padding,
      scale,
      drawWidth,
      drawHeight,
      baseOffsetX,
      baseOffsetY,
      offsetX: baseOffsetX + clampedPanX,
      offsetY: baseOffsetY + clampedPanY,
      panX: clampedPanX,
      panY: clampedPanY,
      maxPanX,
      maxPanY,
    };
  }

  /** resolveWorldPoint：解析世界坐标。 */
  private resolveWorldPoint(metrics: ViewportMetrics, px: number, py: number): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (
      px < metrics.offsetX
      || py < metrics.offsetY
      || px >= metrics.offsetX + metrics.drawWidth
      || py >= metrics.offsetY + metrics.drawHeight
    ) {
      return null;
    }
    return {
      x: metrics.minX + (px - metrics.offsetX) / metrics.scale,
      y: metrics.minY + (py - metrics.offsetY) / metrics.scale,
    };
  }  
  /**
 * resolveCanvasPoint：判断CanvaPoint是否满足条件。
 * @param canvas HTMLCanvasElement 参数说明。
 * @param clientX number 参数说明。
 * @param clientY number 参数说明。
 * @param display DisplayMapScene 参数说明。
 * @param isModal boolean 参数说明。
 * @returns 返回CanvaPoint。
 */


  private resolveCanvasPoint(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
    display: DisplayMapScene,
    isModal: boolean,
  ): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const pixels = getCanvasPixels(canvas, clientX, clientY);
    if (!pixels) {
      return null;
    }
    const metrics = this.getViewportMetrics(canvas, display, isModal);
    const world = this.resolveWorldPoint(metrics, pixels.x, pixels.y);
    if (!world) {
      return null;
    }
    return {
      x: clamp(Math.floor(world.x), metrics.minX, metrics.minX + metrics.mapWidth - 1),
      y: clamp(Math.floor(world.y), metrics.minY, metrics.minY + metrics.mapHeight - 1),
    };
  }  
  /**
 * resolveCurrentMoveTarget：读取当前Move目标并返回结果。
 * @param display DisplayMapScene | null 参数说明。
 * @param canvas HTMLCanvasElement | null 参数说明。
 * @param clientX number 参数说明。
 * @param clientY number 参数说明。
 * @param isModal boolean 参数说明。
 * @returns 返回CurrentMove目标。
 */


  private resolveCurrentMoveTarget(
    display: DisplayMapScene | null,
    canvas: HTMLCanvasElement | null,
    clientX: number,
    clientY: number,
    isModal: boolean,
  ): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!display || !display.isCurrent || !display.player || !canvas) {
      return null;
    }
    const point = this.resolveCanvasPoint(canvas, clientX, clientY, display, isModal);
    if (!point) {
      return null;
    }
    const tile = this.getTileAt(display, point.x, point.y);
    const walkable = tile ? tile.walkable : isTileTypeWalkable(this.getTileTypeAt(display, point.x, point.y));
    if (!walkable) {
      return null;
    }
    return point;
  }

  /** getTileAt：读取地块At。 */
  private getTileAt(display: DisplayMapScene, x: number, y: number): Tile | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const key = `${x},${y}`;
    const current = display.tileCache.get(key);
    if (current) {
      return current;
    }
    const row = display.snapshot?.terrainRows[y] ?? '';
    const type = row[x] ? getTileTypeFromMapChar(row[x]!) : null;
    if (!type) {
      return null;
    }
    return {
      type,
      walkable: isTileTypeWalkable(type),
      blocksSight: false,
      aura: 0,
      occupiedBy: null,
      modifiedAt: null,
    };
  }

  /** getTileTypeAt：读取地块类型At。 */
  private getTileTypeAt(display: DisplayMapScene, x: number, y: number): TileType {
    return this.getTileAt(display, x, y)?.type ?? TileType.Floor;
  }

  /** getDisplayMarkers：读取显示标记。 */
  private getDisplayMarkers(display: DisplayMapScene): MapMinimapMarker[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const markers: MapMinimapMarker[] = [];
    const markerIndexByKey = new Map<string, number>();
    const occupiedPointKeys = new Set<string>();
    const pushMarker = (marker: MapMinimapMarker): void => {
      const key = `${marker.kind}:${marker.x},${marker.y}`;
      const existingIndex = markerIndexByKey.get(key);
      if (existingIndex !== undefined) {
        markers[existingIndex] = marker;
        occupiedPointKeys.add(`${marker.x},${marker.y}`);
        return;
      }
      markerIndexByKey.set(key, markers.length);
      markers.push(marker);
      occupiedPointKeys.add(`${marker.x},${marker.y}`);
    };

    for (const marker of display.snapshot?.markers ?? []) {
      if (!display.snapshot && !display.tileCache.has(`${marker.x},${marker.y}`)) {
        continue;
      }
      pushMarker(marker);
    }

    for (const marker of display.rememberedMarkers) {
      pushMarker(marker);
    }

    for (const marker of display.visibleMarkers) {
      pushMarker(marker);
    }

    if (!display.isCurrent) {
      return markers;
    }

    for (const entity of display.visibleEntities) {
      if (!entity.name || entity.kind === 'player') {
        continue;
      }
      if (entity.kind === 'npc') {
        pushMarker({
          id: `live:npc:${entity.id}`,
          kind: 'npc',
          x: entity.wx,
          y: entity.wy,
          label: entity.name,
          detail: '当前可见人物',
        });
        continue;
      }
      if (entity.kind === 'container') {
        pushMarker({
          id: `live:container:${entity.id}`,
          kind: 'container',
          x: entity.wx,
          y: entity.wy,
          label: entity.name,
          detail: '当前可见容器',
        });
        continue;
      }
      if (entity.kind === 'monster') {
        pushMarker({
          id: `live:monster:${entity.id}`,
          kind: 'monster_spawn',
          x: entity.wx,
          y: entity.wy,
          label: entity.name,
          detail: '当前可见怪物',
        });
      }
    }

    for (const key of display.visibleTiles) {
      const point = parseTileKey(key);
      if (!point) {
        continue;
      }
      const type = this.getTileTypeAt(display, point.x, point.y);
      const hasStaticMarkerAtPoint = occupiedPointKeys.has(`${point.x},${point.y}`);
      if (type === TileType.Portal) {
        if (hasStaticMarkerAtPoint) {
          continue;
        }
        pushMarker({
          id: `live:portal:${point.x},${point.y}`,
          kind: 'portal',
          x: point.x,
          y: point.y,
          label: getTileTypeLabel(TileType.Portal),
          detail: '当前视野内传送地块',
        });
      } else if (type === TileType.Stairs) {
        if (hasStaticMarkerAtPoint) {
          continue;
        }
        pushMarker({
          id: `live:stairs:${point.x},${point.y}`,
          kind: 'stairs',
          x: point.x,
          y: point.y,
          label: getTileTypeLabel(TileType.Stairs),
          detail: '当前视野内楼梯',
        });
      }
    }

    return markers;
  }  
  /**
 * drawScene：执行drawScene相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param display DisplayMapScene 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param isModal boolean 参数说明。
 * @returns 无返回值，直接更新drawScene相关状态。
 */


  private drawScene(
    ctx: CanvasRenderingContext2D,
    display: DisplayMapScene,
    metrics: ViewportMetrics,
    isModal: boolean,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.ensureBaseCanvas(display);

    ctx.clearRect(0, 0, metrics.width, metrics.height);
    ctx.fillStyle = isModal ? 'rgba(9, 10, 12, 0.8)' : 'rgba(10, 11, 13, 0.84)';
    ctx.fillRect(0, 0, metrics.width, metrics.height);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.baseCanvas, metrics.offsetX, metrics.offsetY, metrics.drawWidth, metrics.drawHeight);
    ctx.imageSmoothingEnabled = true;

    if (display.isCurrent && display.snapshot) {
      for (const key of display.visibleTiles.values()) {
        const point = parseTileKey(key);
        const tile = display.tileCache.get(key);
        if (!point || !tile) {
          continue;
        }
        ctx.fillStyle = TILE_MINIMAP_COLORS[tile.type] ?? '#888';
        ctx.fillRect(
          metrics.offsetX + (point.x - metrics.minX) * metrics.scale,
          metrics.offsetY + (point.y - metrics.minY) * metrics.scale,
          Math.ceil(metrics.scale),
          Math.ceil(metrics.scale),
        );
      }
    }

    if (display.isCurrent) {
      ctx.fillStyle = isModal ? 'rgba(255, 248, 214, 0.12)' : 'rgba(255, 248, 214, 0.18)';
      for (const key of display.visibleTiles.values()) {
        const point = parseTileKey(key);
        if (!point) {
          continue;
        }
        ctx.fillRect(
          metrics.offsetX + (point.x - metrics.minX) * metrics.scale,
          metrics.offsetY + (point.y - metrics.minY) * metrics.scale,
          Math.ceil(metrics.scale),
          Math.ceil(metrics.scale),
        );
      }
    }

    const markers = this.getDisplayMarkers(display);
    const markerSize = clamp(metrics.scale * (isModal ? 0.82 : 0.72), isModal ? 5 : 4, isModal ? 14 : 10);
    for (const marker of markers) {
      this.drawMarker(ctx, marker, metrics, markerSize);
    }

    if (isModal) {
      for (const marker of markers) {
        this.drawMarkerLabel(ctx, marker, metrics);
      }
    }

    if (display.isCurrent) {
      const pileSize = clamp(metrics.scale * 0.52, 3, isModal ? 10 : 8);
      for (const pile of display.groundPiles.values()) {
        this.drawGroundPile(ctx, pile, metrics, pileSize);
      }
    }

    if (display.isCurrent && display.player) {
      const playerLeft = clamp(display.player.x - display.viewRadius, metrics.minX, metrics.minX + metrics.mapWidth);
      const playerTop = clamp(display.player.y - display.viewRadius, metrics.minY, metrics.minY + metrics.mapHeight);
      const playerRight = clamp(display.player.x + display.viewRadius + 1, metrics.minX, metrics.minX + metrics.mapWidth);
      const playerBottom = clamp(display.player.y + display.viewRadius + 1, metrics.minY, metrics.minY + metrics.mapHeight);
      ctx.strokeStyle = isModal ? 'rgba(255, 241, 186, 0.84)' : 'rgba(247, 233, 180, 0.72)';
      ctx.lineWidth = Math.max(1, metrics.scale * 0.18);
      ctx.strokeRect(
        metrics.offsetX + (playerLeft - metrics.minX) * metrics.scale,
        metrics.offsetY + (playerTop - metrics.minY) * metrics.scale,
        Math.max(metrics.scale, (playerRight - playerLeft) * metrics.scale),
        Math.max(metrics.scale, (playerBottom - playerTop) * metrics.scale),
      );

      const playerCenterX = metrics.offsetX + (display.player.x - metrics.minX + 0.5) * metrics.scale;
      const playerCenterY = metrics.offsetY + (display.player.y - metrics.minY + 0.5) * metrics.scale;
      ctx.fillStyle = '#fff7ce';
      ctx.beginPath();
      ctx.arc(playerCenterX, playerCenterY, clamp(metrics.scale * (isModal ? 0.58 : 0.48), 3, isModal ? 10 : 8), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#20140a';
      ctx.lineWidth = Math.max(1, metrics.scale * 0.2);
      ctx.stroke();
      ctx.fillStyle = '#ffca52';
      ctx.beginPath();
      ctx.arc(playerCenterX, playerCenterY, clamp(metrics.scale * 0.24, 1.5, isModal ? 5 : 4), 0, Math.PI * 2);
      ctx.fill();
    }

    if (isModal) {
      this.drawModalHud(ctx, display, metrics, markers);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(metrics.offsetX + 0.5, metrics.offsetY + 0.5, metrics.drawWidth, metrics.drawHeight);
  }  
  /**
 * drawMarker：处理drawMarker并更新相关状态。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param marker MapMinimapMarker 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param markerSize number 参数说明。
 * @returns 无返回值，直接更新drawMarker相关状态。
 */


  private drawMarker(
    ctx: CanvasRenderingContext2D,
    marker: MapMinimapMarker,
    metrics: ViewportMetrics,
    markerSize: number,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const centerX = metrics.offsetX + (marker.x - metrics.minX + 0.5) * metrics.scale;
    const centerY = metrics.offsetY + (marker.y - metrics.minY + 0.5) * metrics.scale;
    const half = markerSize / 2;

    ctx.save();
    ctx.fillStyle = MINIMAP_MARKER_COLORS[marker.kind];
    ctx.strokeStyle = 'rgba(15, 10, 8, 0.92)';
    ctx.lineWidth = Math.max(1, metrics.scale * 0.18);

    if (marker.kind === 'landmark') {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - half);
      ctx.lineTo(centerX + half, centerY);
      ctx.lineTo(centerX, centerY + half);
      ctx.lineTo(centerX - half, centerY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (marker.kind === 'npc') {
      ctx.fillRect(centerX - half, centerY - half, markerSize, markerSize);
      ctx.strokeRect(centerX - half, centerY - half, markerSize, markerSize);
      ctx.restore();
      return;
    }

    if (marker.kind === 'container') {
      ctx.fillRect(centerX - half, centerY - half * 0.9, markerSize, markerSize * 0.9);
      ctx.strokeRect(centerX - half, centerY - half * 0.9, markerSize, markerSize * 0.9);
      ctx.strokeStyle = 'rgba(255, 241, 208, 0.92)';
      ctx.beginPath();
      ctx.moveTo(centerX - half, centerY);
      ctx.lineTo(centerX + half, centerY);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (marker.kind === 'monster_spawn') {
      ctx.beginPath();
      ctx.arc(centerX, centerY, half, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 245, 237, 0.9)';
      ctx.beginPath();
      ctx.moveTo(centerX - half * 0.65, centerY);
      ctx.lineTo(centerX + half * 0.65, centerY);
      ctx.moveTo(centerX, centerY - half * 0.65);
      ctx.lineTo(centerX, centerY + half * 0.65);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (marker.kind === 'stairs') {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - half);
      ctx.lineTo(centerX + half, centerY + half);
      ctx.lineTo(centerX - half, centerY + half);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, half, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }  
  /**
 * drawMarkerLabel：处理drawMarkerLabel并更新相关状态。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param marker MapMinimapMarker 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @returns 无返回值，直接更新drawMarkerLabel相关状态。
 */


  private drawMarkerLabel(
    ctx: CanvasRenderingContext2D,
    marker: MapMinimapMarker,
    metrics: ViewportMetrics,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const centerX = metrics.offsetX + (marker.x - metrics.minX + 0.5) * metrics.scale;
    const centerY = metrics.offsetY + (marker.y - metrics.minY + 0.5) * metrics.scale;
    const label = marker.label.trim();
    if (!label) {
      return;
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(15, 12, 10, 0.92)';

    if (marker.kind === 'landmark') {
      const fontSize = clamp(metrics.scale * 0.7, 12, 18);
      ctx.font = buildCanvasFont('labelStrong', fontSize);
      ctx.textBaseline = 'middle';
      const textWidth = ctx.measureText(label).width;
      const paddingX = Math.max(8, metrics.scale * 0.24);
      const boxHeight = Math.max(20, fontSize + 8);
      const boxWidth = textWidth + paddingX * 2;
      const anchorY = clamp(
        centerY + Math.max(16, metrics.scale * 0.7),
        metrics.padding + boxHeight / 2 + 2,
        metrics.height - metrics.padding - boxHeight / 2 - 2,
      );
      const boxLeft = clamp(
        centerX - boxWidth / 2,
        metrics.padding + 2,
        metrics.width - metrics.padding - boxWidth - 2,
      );
      ctx.fillStyle = 'rgba(15, 12, 10, 0.72)';
      ctx.fillRect(boxLeft, anchorY - boxHeight / 2, boxWidth, boxHeight);
      ctx.strokeStyle = 'rgba(255, 226, 168, 0.72)';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxLeft + 0.5, anchorY - boxHeight / 2 + 0.5, boxWidth - 1, boxHeight - 1);
      ctx.fillStyle = '#ffe7b8';
      ctx.fillText(label, boxLeft + boxWidth / 2, anchorY + 0.5);
      ctx.restore();
      return;
    }

    const fontSize = clamp(metrics.scale * 0.6, 11, 16);
    const textY = clamp(
      centerY - Math.max(10, metrics.scale * 0.55),
      metrics.padding + fontSize + 2,
      metrics.height - metrics.padding - 2,
    );
    ctx.font = buildCanvasFont('label', fontSize);
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = Math.max(2, fontSize * 0.18);
    ctx.fillStyle = marker.kind === 'monster_spawn'
      ? '#ffd9d0'
      : marker.kind === 'npc'
        ? '#d9f1ff'
        : marker.kind === 'container'
          ? '#ffe6bf'
        : '#f8e4b7';
    ctx.strokeText(label, centerX, textY);
    ctx.fillText(label, centerX, textY);
    ctx.restore();
  }  
  /**
 * drawGroundPile：执行draw地面Pile相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param pile GroundItemPileView 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param pileSize number 参数说明。
 * @returns 无返回值，直接更新drawGroundPile相关状态。
 */


  private drawGroundPile(
    ctx: CanvasRenderingContext2D,
    pile: GroundItemPileView,
    metrics: ViewportMetrics,
    pileSize: number,
  ): void {
    const centerX = metrics.offsetX + (pile.x - metrics.minX + 0.5) * metrics.scale;
    const centerY = metrics.offsetY + (pile.y - metrics.minY + 0.5) * metrics.scale;
    const half = pileSize / 2;
    ctx.save();
    ctx.fillStyle = '#f7e39a';
    ctx.strokeStyle = 'rgba(53, 36, 10, 0.95)';
    ctx.lineWidth = Math.max(1, metrics.scale * 0.16);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - half);
    ctx.lineTo(centerX + half, centerY);
    ctx.lineTo(centerX, centerY + half);
    ctx.lineTo(centerX - half, centerY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }  
  /**
 * drawModalHud：执行draw弹层Hud相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param display DisplayMapScene 参数说明。
 * @param metrics ViewportMetrics 参数说明。
 * @param markers MapMinimapMarker[] 参数说明。
 * @returns 无返回值，直接更新draw弹层Hud相关状态。
 */


  private drawModalHud(
    ctx: CanvasRenderingContext2D,
    display: DisplayMapScene,
    metrics: ViewportMetrics,
    markers: MapMinimapMarker[],
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const guide = display.isCurrent
      ? '滚轮缩放 · 右键拖拽 · 左键前往'
      : '滚轮缩放 · 右键拖拽';
    ctx.save();
    ctx.font = buildCanvasFont('label', 12);
    ctx.textBaseline = 'middle';
    const guideWidth = ctx.measureText(guide).width + 18;
    const guideX = metrics.width - metrics.padding - guideWidth;
    const guideY = metrics.padding + 8;
    ctx.fillStyle = 'rgba(8, 9, 12, 0.68)';
    ctx.fillRect(guideX, guideY, guideWidth, 26);
    ctx.strokeStyle = 'rgba(255, 240, 213, 0.12)';
    ctx.strokeRect(guideX + 0.5, guideY + 0.5, guideWidth - 1, 25);
    ctx.fillStyle = 'rgba(255, 245, 222, 0.9)';
    ctx.fillText(guide, guideX + 9, guideY + 13);

    if (!this.hoveredModalPoint) {
      ctx.restore();
      return;
    }

    const lines = this.buildHoverLines(display, markers, this.hoveredModalPoint.x, this.hoveredModalPoint.y);
    if (lines.length === 0) {
      ctx.restore();
      return;
    }

    ctx.font = buildCanvasFont('label', 13);
    const lineHeight = 20;
    const contentWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
    const panelWidth = Math.min(metrics.width - metrics.padding * 2, contentWidth + 20);
    const panelHeight = lines.length * lineHeight + 16;
    const panelX = metrics.padding;
    const panelY = metrics.height - metrics.padding - panelHeight;
    ctx.fillStyle = 'rgba(8, 9, 12, 0.72)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeStyle = 'rgba(255, 240, 213, 0.14)';
    ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);
    ctx.fillStyle = 'rgba(255, 246, 225, 0.94)';
    lines.forEach((line, index) => {
      ctx.fillText(line, panelX + 10, panelY + 12 + lineHeight * index + lineHeight / 2);
    });
    ctx.restore();
  }

  /** buildHoverLines：构建Hover Lines。 */
  private buildHoverLines(display: DisplayMapScene, markers: MapMinimapMarker[], x: number, y: number): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const lines: string[] = [];
    lines.push(`坐标 (${x}, ${y})`);

    const tile = this.getTileAt(display, x, y);
    if (tile) {
      lines.push(`地表：${getTileTypeLabel(tile.type)}`);
    } else {
      lines.push('地表：此处尚未记下');
    }

    const tileMarkers = markers.filter((marker) => marker.x === x && marker.y === y);
    for (const marker of tileMarkers.slice(0, 3)) {
      lines.push(`${getMinimapMarkerKindLabel(marker.kind)}：${marker.label}${marker.detail ? ` · ${marker.detail}` : ''}`);
    }

    if (display.isCurrent && display.player?.x === x && display.player.y === y) {
      lines.push('位置：你当前在此');
    }

    if (display.isCurrent) {
      const pile = [...display.groundPiles.values()].find((entry) => entry.x === x && entry.y === y);
      if (pile) {
        const itemsLabel = pile.items.slice(0, 2).map((entry) => `${entry.name} ${formatDisplayCountBadge(entry.count)}`).join('、');
        const suffix = pile.items.length > 2 ? ` 等 ${formatDisplayInteger(pile.items.length)} 件` : '';
        lines.push(`地面：${itemsLabel}${suffix}`);
      }
    }

    return lines;
  }
}
