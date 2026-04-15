/**
 * 小地图与大地图浏览器
 * 提供角落缩略图、全屏地图弹窗、地图目录切换、缩放平移、点击前往等功能
 */

import { getTileTypeFromMapChar, GroundItemPileView, isTileTypeWalkable, MapMeta, MapMinimapMarker, MapMinimapSnapshot, MINIMAP_MARKER_COLORS, Tile, TILE_MINIMAP_COLORS, TileType } from '@mud/shared-next';
import { deleteRememberedMap, getRememberedMarkers, getRememberedTiles, listRememberedMapIds } from '../map-memory';
import { getCachedMapMeta, getCachedMapSnapshot, listCachedUnlockedMapSummaries } from '../map-static-cache';
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

/** CatalogFilter：定义该类型的结构与数据语义。 */
type CatalogFilter = 'all' | 'memory' | 'unlock';
/** MinimapDisplayMode：定义该类型的结构与数据语义。 */
type MinimapDisplayMode = 'memory' | 'unlock';

/** DisplaySourceAvailability：定义该接口的能力与字段约束。 */
interface DisplaySourceAvailability {
/** hasMemory：定义该变量以承载业务值。 */
  hasMemory: boolean;
/** hasUnlock：定义该变量以承载业务值。 */
  hasUnlock: boolean;
}

/** MinimapScene：定义该接口的能力与字段约束。 */
interface MinimapScene {
/** mapMeta：定义该变量以承载业务值。 */
  mapMeta: MapMeta | null;
/** snapshot：定义该变量以承载业务值。 */
  snapshot: MapMinimapSnapshot | null;
/** rememberedMarkers：定义该变量以承载业务值。 */
  rememberedMarkers: MapMinimapMarker[];
/** visibleMarkers：定义该变量以承载业务值。 */
  visibleMarkers: MapMinimapMarker[];
/** tileCache：定义该变量以承载业务值。 */
  tileCache: ReadonlyMap<string, Tile>;
/** visibleTiles：定义该变量以承载业务值。 */
  visibleTiles: ReadonlySet<string>;
  visibleEntities: ReadonlyArray<{
/** id：定义该变量以承载业务值。 */
    id: string;
/** wx：定义该变量以承载业务值。 */
    wx: number;
/** wy：定义该变量以承载业务值。 */
    wy: number;
    name?: string;
    kind?: string;
  }>;
/** groundPiles：定义该变量以承载业务值。 */
  groundPiles: ReadonlyMap<string, GroundItemPileView>;
/** player：定义该变量以承载业务值。 */
  player: { x: number; y: number } | null;
/** viewRadius：定义该变量以承载业务值。 */
  viewRadius: number;
/** memoryVersion：定义该变量以承载业务值。 */
  memoryVersion: number;
}

/** CatalogEntry：定义该接口的能力与字段约束。 */
interface CatalogEntry {
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** mapMeta：定义该变量以承载业务值。 */
  mapMeta: MapMeta | null;
/** hasMemory：定义该变量以承载业务值。 */
  hasMemory: boolean;
/** hasUnlock：定义该变量以承载业务值。 */
  hasUnlock: boolean;
}

/** DisplayMapScene：定义该接口的能力与字段约束。 */
interface DisplayMapScene {
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** mapMeta：定义该变量以承载业务值。 */
  mapMeta: MapMeta;
/** snapshot：定义该变量以承载业务值。 */
  snapshot: MapMinimapSnapshot | null;
/** rememberedMarkers：定义该变量以承载业务值。 */
  rememberedMarkers: MapMinimapMarker[];
/** visibleMarkers：定义该变量以承载业务值。 */
  visibleMarkers: MapMinimapMarker[];
/** tileCache：定义该变量以承载业务值。 */
  tileCache: ReadonlyMap<string, Tile>;
/** visibleTiles：定义该变量以承载业务值。 */
  visibleTiles: ReadonlySet<string>;
  visibleEntities: ReadonlyArray<{
/** id：定义该变量以承载业务值。 */
    id: string;
/** wx：定义该变量以承载业务值。 */
    wx: number;
/** wy：定义该变量以承载业务值。 */
    wy: number;
    name?: string;
    kind?: string;
  }>;
/** groundPiles：定义该变量以承载业务值。 */
  groundPiles: ReadonlyMap<string, GroundItemPileView>;
/** player：定义该变量以承载业务值。 */
  player: { x: number; y: number } | null;
/** viewRadius：定义该变量以承载业务值。 */
  viewRadius: number;
/** isCurrent：定义该变量以承载业务值。 */
  isCurrent: boolean;
/** memoryVersion：定义该变量以承载业务值。 */
  memoryVersion: number;
/** displayMode：定义该变量以承载业务值。 */
  displayMode: MinimapDisplayMode;
/** hasMemory：定义该变量以承载业务值。 */
  hasMemory: boolean;
/** hasUnlock：定义该变量以承载业务值。 */
  hasUnlock: boolean;
}

/** ViewportMetrics：定义该接口的能力与字段约束。 */
interface ViewportMetrics {
/** width：定义该变量以承载业务值。 */
  width: number;
/** height：定义该变量以承载业务值。 */
  height: number;
/** innerWidth：定义该变量以承载业务值。 */
  innerWidth: number;
/** innerHeight：定义该变量以承载业务值。 */
  innerHeight: number;
/** mapWidth：定义该变量以承载业务值。 */
  mapWidth: number;
/** mapHeight：定义该变量以承载业务值。 */
  mapHeight: number;
/** padding：定义该变量以承载业务值。 */
  padding: number;
/** scale：定义该变量以承载业务值。 */
  scale: number;
/** drawWidth：定义该变量以承载业务值。 */
  drawWidth: number;
/** drawHeight：定义该变量以承载业务值。 */
  drawHeight: number;
/** baseOffsetX：定义该变量以承载业务值。 */
  baseOffsetX: number;
/** baseOffsetY：定义该变量以承载业务值。 */
  baseOffsetY: number;
/** offsetX：定义该变量以承载业务值。 */
  offsetX: number;
/** offsetY：定义该变量以承载业务值。 */
  offsetY: number;
/** panX：定义该变量以承载业务值。 */
  panX: number;
/** panY：定义该变量以承载业务值。 */
  panY: number;
/** maxPanX：定义该变量以承载业务值。 */
  maxPanX: number;
/** maxPanY：定义该变量以承载业务值。 */
  maxPanY: number;
}

/** ModalPanState：定义该接口的能力与字段约束。 */
interface ModalPanState {
/** pointerId：定义该变量以承载业务值。 */
  pointerId: number;
/** startClientX：定义该变量以承载业务值。 */
  startClientX: number;
/** startClientY：定义该变量以承载业务值。 */
  startClientY: number;
/** startPanX：定义该变量以承载业务值。 */
  startPanX: number;
/** startPanY：定义该变量以承载业务值。 */
  startPanY: number;
}

/** clamp：执行对应的业务逻辑。 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** parseTileKey：执行对应的业务逻辑。 */
function parseTileKey(key: string): { x: number; y: number } | null {
  const [rawX, rawY] = key.split(',');
/** x：定义该变量以承载业务值。 */
  const x = Number(rawX);
/** y：定义该变量以承载业务值。 */
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    x: Math.trunc(x),
    y: Math.trunc(y),
  };
}

/** ensureCanvasSize：执行对应的业务逻辑。 */
function ensureCanvasSize(canvas: HTMLCanvasElement): boolean {
/** rect：定义该变量以承载业务值。 */
  const rect = canvas.getBoundingClientRect();
/** dpr：定义该变量以承载业务值。 */
  const dpr = window.devicePixelRatio || 1;
/** width：定义该变量以承载业务值。 */
  const width = Math.max(1, Math.floor(rect.width * dpr));
/** height：定义该变量以承载业务值。 */
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width === width && canvas.height === height) {
    return false;
  }
  canvas.width = width;
  canvas.height = height;
  return true;
}

/** buildFallbackMapMeta：执行对应的业务逻辑。 */
function buildFallbackMapMeta(mapId: string, snapshot: MapMinimapSnapshot | null, tileCache: Map<string, Tile>): MapMeta {
/** width：定义该变量以承载业务值。 */
  let width = snapshot?.width ?? 1;
/** height：定义该变量以承载业务值。 */
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

/** getCanvasPixels：执行对应的业务逻辑。 */
function getCanvasPixels(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } | null {
/** rect：定义该变量以承载业务值。 */
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

/** Minimap：封装相关状态与行为。 */
export class Minimap {
  private static readonly MOVE_CONFIRM_OWNER = 'map-minimap:move-confirm';
  private static readonly DELETE_MEMORY_OWNER = 'map-minimap:delete-memory';

  private readonly shell = document.getElementById('map-minimap-shell') as HTMLElement | null;
  private readonly overlayRoot = document.getElementById('map-minimap') as HTMLElement | null;
  private readonly overlayCanvas = document.getElementById('map-minimap-canvas') as HTMLCanvasElement | null;
  private readonly overlayTitle = document.getElementById('map-minimap-title') as HTMLElement | null;
  private readonly toggleBtn = document.getElementById('map-minimap-toggle') as HTMLButtonElement | null;
  private readonly openBtn = document.getElementById('map-minimap-open') as HTMLButtonElement | null;
  private readonly modal = document.getElementById('map-minimap-modal') as HTMLElement | null;
  private readonly modalBody = document.querySelector('#map-minimap-modal .map-minimap-modal-body') as HTMLElement | null;
  private readonly modalSidebar = document.querySelector('#map-minimap-modal .map-minimap-modal-sidebar') as HTMLElement | null;
  private readonly modalWindow = document.getElementById('map-minimap-modal-window') as HTMLElement | null;
  private readonly modalTitle = document.getElementById('map-minimap-modal-title') as HTMLElement | null;
  private readonly modalCatalogToggleBtn = document.getElementById('map-minimap-modal-catalog-toggle') as HTMLButtonElement | null;
  private readonly modalCloseBtn = document.getElementById('map-minimap-modal-close') as HTMLButtonElement | null;
  private readonly modalCanvas = document.getElementById('map-minimap-modal-canvas') as HTMLCanvasElement | null;
  private readonly modalSourceSwitch = document.getElementById('map-minimap-modal-source-switch') as HTMLElement | null;
  private readonly modalSourceMemoryBtn = document.getElementById('map-minimap-modal-source-memory') as HTMLButtonElement | null;
  private readonly modalSourceUnlockBtn = document.getElementById('map-minimap-modal-source-unlock') as HTMLButtonElement | null;
  private readonly modalList = document.getElementById('map-minimap-modal-list') as HTMLElement | null;
  private readonly modalTabAll = document.getElementById('map-minimap-filter-all') as HTMLButtonElement | null;
  private readonly modalTabMemory = document.getElementById('map-minimap-filter-memory') as HTMLButtonElement | null;
  private readonly modalTabUnlock = document.getElementById('map-minimap-filter-unlock') as HTMLButtonElement | null;
  private readonly deleteMemoryBtn = document.getElementById('map-minimap-delete-memory') as HTMLButtonElement | null;

  private readonly baseCanvas = document.createElement('canvas');
  private readonly baseCtx = this.baseCanvas.getContext('2d');
/** scene：定义该变量以承载业务值。 */
  private scene: MinimapScene | null = null;
  private renderQueued = false;
  private overlayVisible = true;
  private modalOpen = false;
/** baseKey：定义该变量以承载业务值。 */
  private baseKey: string | null = null;
/** selectedMapId：定义该变量以承载业务值。 */
  private selectedMapId: string | null = null;
/** modalDisplayMode：定义该变量以承载业务值。 */
  private modalDisplayMode: MinimapDisplayMode = 'unlock';
/** catalogFilter：定义该变量以承载业务值。 */
  private catalogFilter: CatalogFilter = 'all';
  private moveHandler: ((x: number, y: number) => void) | null = null;
/** pendingMovePoint：定义该变量以承载业务值。 */
  private pendingMovePoint: { x: number; y: number } | null = null;
  private modalZoom = 1;
  private modalPanX = 0;
  private modalPanY = 0;
/** modalPanState：定义该变量以承载业务值。 */
  private modalPanState: ModalPanState | null = null;
/** hoveredModalPoint：定义该变量以承载业务值。 */
  private hoveredModalPoint: { x: number; y: number } | null = null;
  private mobileCatalogOpen = false;
  private readonly catalogEntryNodes = new Map<string, HTMLButtonElement>();
/** catalogEmptyNode：定义该变量以承载业务值。 */
  private catalogEmptyNode: HTMLElement | null = null;

/** constructor：处理当前场景中的对应操作。 */
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
/** target：定义该变量以承载业务值。 */
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

    this.deleteMemoryBtn?.addEventListener('click', () => {
      this.openDeleteMemoryConfirm();
    });

    this.modalList?.addEventListener('click', (event) => {
/** button：定义该变量以承载业务值。 */
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-map-id]');
/** mapId：定义该变量以承载业务值。 */
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
/** display：定义该变量以承载业务值。 */
      const display = this.getModalDisplayScene();
      if (!display) {
        return;
      }
      ensureCanvasSize(this.modalCanvas);
/** pixels：定义该变量以承载业务值。 */
      const pixels = getCanvasPixels(this.modalCanvas, event.clientX, event.clientY);
      if (!pixels) {
        return;
      }
/** previousMetrics：定义该变量以承载业务值。 */
      const previousMetrics = this.getViewportMetrics(this.modalCanvas, display, true);
/** anchor：定义该变量以承载业务值。 */
      const anchor = this.resolveWorldPoint(previousMetrics, pixels.x, pixels.y)
        ?? { x: previousMetrics.mapWidth / 2, y: previousMetrics.mapHeight / 2 };
/** factor：定义该变量以承载业务值。 */
      const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
/** nextZoom：定义该变量以承载业务值。 */
      const nextZoom = clamp(Number((this.modalZoom * factor).toFixed(4)), MIN_MODAL_ZOOM, MAX_MODAL_ZOOM);
      if (nextZoom === this.modalZoom) {
        return;
      }
      event.preventDefault();
/** previewMetrics：定义该变量以承载业务值。 */
      const previewMetrics = this.getViewportMetrics(this.modalCanvas, display, true, nextZoom, this.modalPanX, this.modalPanY);
/** nextMetrics：定义该变量以承载业务值。 */
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
/** display：定义该变量以承载业务值。 */
      const display = this.getModalDisplayScene();
      if (!display) {
        return;
      }

      if (this.modalPanState && this.modalPanState.pointerId === event.pointerId) {
/** rect：定义该变量以承载业务值。 */
        const rect = this.modalCanvas.getBoundingClientRect();
/** scaleX：定义该变量以承载业务值。 */
        const scaleX = rect.width > 0 ? this.modalCanvas.width / rect.width : 1;
/** scaleY：定义该变量以承载业务值。 */
        const scaleY = rect.height > 0 ? this.modalCanvas.height / rect.height : 1;
/** nextMetrics：定义该变量以承载业务值。 */
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

/** point：定义该变量以承载业务值。 */
      const point = this.resolveCanvasPoint(this.modalCanvas, event.clientX, event.clientY, display, true);
/** nextHover：定义该变量以承载业务值。 */
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
/** display：定义该变量以承载业务值。 */
      const display = this.getModalDisplayScene();
/** moveTarget：定义该变量以承载业务值。 */
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

/** mountModalToBody：执行对应的业务逻辑。 */
  private mountModalToBody(): void {
    if (!this.modal) {
      return;
    }
/** root：定义该变量以承载业务值。 */
    const root = getViewportRoot(document) ?? document.body;
    if (this.modal.parentElement === root) {
      return;
    }
    root.appendChild(this.modal);
  }

/** isCompactViewport：执行对应的业务逻辑。 */
  private isCompactViewport(): boolean {
    return window.innerWidth <= 900;
  }

/** syncResponsiveModalChrome：执行对应的业务逻辑。 */
  private syncResponsiveModalChrome(): void {
/** catalogVisible：定义该变量以承载业务值。 */
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

  /** 更新当前地图场景数据并触发重绘 */
  updateScene(scene: MinimapScene | null): void {
/** previousCurrentMapId：定义该变量以承载业务值。 */
    const previousCurrentMapId = this.scene?.mapMeta?.id ?? null;
    this.scene = scene;
    if (!scene) {
      this.selectedMapId = null;
      this.baseKey = null;
      this.hoveredModalPoint = null;
      this.closeMoveConfirm();
    } else {
/** nextCurrentMapId：定义该变量以承载业务值。 */
      const nextCurrentMapId = scene.mapMeta?.id ?? null;
/** currentMapChanged：定义该变量以承载业务值。 */
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

/** clear：执行对应的业务逻辑。 */
  clear(): void {
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
/** overlayCtx：定义该变量以承载业务值。 */
    const overlayCtx = this.overlayCanvas?.getContext('2d');
    overlayCtx?.clearRect(0, 0, this.overlayCanvas?.width ?? 0, this.overlayCanvas?.height ?? 0);
/** modalCtx：定义该变量以承载业务值。 */
    const modalCtx = this.modalCanvas?.getContext('2d');
    modalCtx?.clearRect(0, 0, this.modalCanvas?.width ?? 0, this.modalCanvas?.height ?? 0);
    if (this.modalList) {
      this.modalList.innerHTML = '';
    }
    this.modalDisplayMode = 'unlock';
  }

/** resize：执行对应的业务逻辑。 */
  resize(): void {
    if (this.overlayCanvas) {
      ensureCanvasSize(this.overlayCanvas);
    }
    if (this.modalOpen && this.modalCanvas) {
      ensureCanvasSize(this.modalCanvas);
    }
    this.scheduleRender();
  }

/** render：执行对应的业务逻辑。 */
  render(): void {
    this.refreshChrome();
    if (this.modalOpen) {
      this.renderCatalog();
    }
    this.scheduleRender();
  }

/** scheduleRender：执行对应的业务逻辑。 */
  private scheduleRender(): void {
    if (this.renderQueued) {
      return;
    }
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.renderOverlay();
      this.renderModal();
    });
  }

/** refreshChrome：执行对应的业务逻辑。 */
  private refreshChrome(): void {
/** hasScene：定义该变量以承载业务值。 */
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

/** openModal：执行对应的业务逻辑。 */
  private openModal(): void {
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

/** closeModal：执行对应的业务逻辑。 */
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

/** resetModalViewport：执行对应的业务逻辑。 */
  private resetModalViewport(): void {
    this.modalZoom = 1;
    this.modalPanX = 0;
    this.modalPanY = 0;
  }

/** cancelModalPan：执行对应的业务逻辑。 */
  private cancelModalPan(): void {
    if (this.modalPanState && this.modalCanvas?.hasPointerCapture(this.modalPanState.pointerId)) {
      this.modalCanvas.releasePointerCapture(this.modalPanState.pointerId);
    }
    this.modalPanState = null;
  }

/** buildCatalogEntries：执行对应的业务逻辑。 */
  private buildCatalogEntries(): CatalogEntry[] {
/** entries：定义该变量以承载业务值。 */
    const entries = new Map<string, CatalogEntry>();
/** currentMapMeta：定义该变量以承载业务值。 */
    const currentMapMeta = this.scene?.mapMeta ?? null;
/** currentMapId：定义该变量以承载业务值。 */
    const currentMapId = currentMapMeta?.id ?? null;

    for (const mapId of listRememberedMapIds()) {
      const existing = entries.get(mapId);
      entries.set(mapId, {
        mapId,
/** mapMeta：定义该变量以承载业务值。 */
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
/** existing：定义该变量以承载业务值。 */
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
/** leftName：定义该变量以承载业务值。 */
      const leftName = left.mapMeta?.name ?? left.mapId;
/** rightName：定义该变量以承载业务值。 */
      const rightName = right.mapMeta?.name ?? right.mapId;
      return leftName.localeCompare(rightName, 'zh-Hans-CN');
    });
  }

/** renderCatalog：执行对应的业务逻辑。 */
  private renderCatalog(): void {
    if (!this.modalList) {
      return;
    }

/** allEntries：定义该变量以承载业务值。 */
    const allEntries = this.buildCatalogEntries();
/** filteredEntries：定义该变量以承载业务值。 */
    const filteredEntries = allEntries.filter((entry) => {
      if (this.catalogFilter === 'memory') {
        return entry.hasMemory;
      }
      if (this.catalogFilter === 'unlock') {
        return entry.hasUnlock;
      }
      return true;
    });

/** currentMapId：定义该变量以承载业务值。 */
    const currentMapId = this.scene?.mapMeta?.id ?? null;
/** selectedVisible：定义该变量以承载业务值。 */
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
/** selectedEntry：定义该变量以承载业务值。 */
      const selectedEntry = allEntries.find((entry) => entry.mapId === this.selectedMapId) ?? null;
      this.deleteMemoryBtn.disabled = !selectedEntry?.hasMemory;
      this.deleteMemoryBtn.title = selectedEntry?.hasMemory ? `删除 ${selectedEntry.mapMeta?.name ?? selectedEntry.mapId} 的本地记忆` : '当前地图没有可删除的本地记忆';
    }

/** catalogContainer：定义该变量以承载业务值。 */
    const catalogContainer = this.modalList;
/** previousScrollTop：定义该变量以承载业务值。 */
    const previousScrollTop = catalogContainer.scrollTop;
/** filteredIds：定义该变量以承载业务值。 */
    const filteredIds = new Set(filteredEntries.map((entry) => entry.mapId));

    if (filteredEntries.length === 0) {
      this.removeAllCatalogNodes();
      catalogContainer.replaceChildren(this.getCatalogEmptyNode());
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

/** previousNode：定义该变量以承载业务值。 */
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

/** createCatalogItemNode：执行对应的业务逻辑。 */
  private createCatalogItemNode(entry: CatalogEntry): HTMLButtonElement {
/** button：定义该变量以承载业务值。 */
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-minimap-modal-item';
    button.dataset.mapId = entry.mapId;

/** head：定义该变量以承载业务值。 */
    const head = document.createElement('div');
    head.className = 'map-minimap-modal-item-head';

/** name：定义该变量以承载业务值。 */
    const name = document.createElement('span');
    name.className = 'map-minimap-modal-item-name';
    head.appendChild(name);

/** badges：定义该变量以承载业务值。 */
    const badges = document.createElement('span');
    badges.className = 'map-minimap-modal-item-badges';
    head.appendChild(badges);

    button.appendChild(head);

    return button;
  }

/** updateCatalogItemNode：执行对应的业务逻辑。 */
  private updateCatalogItemNode(entry: CatalogEntry, node: HTMLButtonElement): void {
/** nameNode：定义该变量以承载业务值。 */
    const nameNode = node.querySelector<HTMLSpanElement>('.map-minimap-modal-item-name');
    if (nameNode) {
      nameNode.textContent = entry.mapMeta?.name ?? '无名地域';
    }

/** badgesNode：定义该变量以承载业务值。 */
    const badgesNode = node.querySelector<HTMLElement>('.map-minimap-modal-item-badges');
    if (badgesNode) {
      badgesNode.replaceChildren();
      if (entry.hasMemory) {
        badgesNode.appendChild(this.buildCatalogBadge('memory', '忆'));
      }
      if (entry.hasUnlock) {
        badgesNode.appendChild(this.buildCatalogBadge('unlock', '图'));
      }
    }

    node.dataset.mapId = entry.mapId;
    node.classList.toggle('active', entry.mapId === this.selectedMapId);
  }

  private insertCatalogItemNodeInOrder(
    node: HTMLButtonElement,
    previousNode: HTMLButtonElement | null,
    container: HTMLElement,
  ): void {
/** anchor：定义该变量以承载业务值。 */
    const anchor = previousNode ? previousNode.nextElementSibling : container.firstElementChild;
    if (anchor === node) {
      return;
    }
    container.insertBefore(node, anchor);
  }

/** getCatalogEmptyNode：执行对应的业务逻辑。 */
  private getCatalogEmptyNode(): HTMLElement {
    if (!this.catalogEmptyNode) {
      this.catalogEmptyNode = document.createElement('div');
      this.catalogEmptyNode.className = 'map-minimap-modal-empty';
    }
    this.catalogEmptyNode.textContent = '当前分类下没有可浏览的地图。';
    return this.catalogEmptyNode;
  }

/** removeAllCatalogNodes：执行对应的业务逻辑。 */
  private removeAllCatalogNodes(): void {
    this.catalogEntryNodes.forEach((node) => {
      node.remove();
    });
    this.catalogEntryNodes.clear();
  }

/** buildCatalogBadge：执行对应的业务逻辑。 */
  private buildCatalogBadge(badgeClass: 'unlock' | 'memory', label: string): HTMLSpanElement {
/** badge：定义该变量以承载业务值。 */
    const badge = document.createElement('span');
    badge.className = `map-minimap-modal-badge ${badgeClass}`;
    badge.textContent = label;
    return badge;
  }

/** getCatalogDescription：执行对应的业务逻辑。 */
  private getCatalogDescription(entry: CatalogEntry): string {
/** description：定义该变量以承载业务值。 */
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

/** getCurrentDisplayAvailability：执行对应的业务逻辑。 */
  private getCurrentDisplayAvailability(): DisplaySourceAvailability {
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

/** getDisplayAvailability：执行对应的业务逻辑。 */
  private getDisplayAvailability(selectedMapId: string | null, current: DisplayMapScene | null): DisplaySourceAvailability {
    if (!selectedMapId) {
      return { hasMemory: false, hasUnlock: false };
    }
    if (current && selectedMapId === current.mapId) {
      return {
        hasMemory: current.hasMemory,
        hasUnlock: current.hasUnlock,
      };
    }
/** snapshot：定义该变量以承载业务值。 */
    const snapshot = getCachedMapSnapshot(selectedMapId);
/** rememberedMarkers：定义该变量以承载业务值。 */
    const rememberedMarkers = getRememberedMarkers(selectedMapId);
/** tileCache：定义该变量以承载业务值。 */
    const tileCache = getRememberedTiles(selectedMapId);
    return {
      hasMemory: tileCache.size > 0 || rememberedMarkers.length > 0,
      hasUnlock: !!snapshot,
    };
  }

/** resolveModalDisplayMode：执行对应的业务逻辑。 */
  private resolveModalDisplayMode(availability: DisplaySourceAvailability): MinimapDisplayMode {
    if (this.modalDisplayMode === 'unlock' && availability.hasUnlock) {
      return 'unlock';
    }
    if (this.modalDisplayMode === 'memory' && availability.hasMemory) {
      return 'memory';
    }
    return availability.hasUnlock ? 'unlock' : 'memory';
  }

/** syncModalDisplaySwitch：执行对应的业务逻辑。 */
  private syncModalDisplaySwitch(): void {
/** current：定义该变量以承载业务值。 */
    const current = this.getCurrentDisplayScene();
/** selectedMapId：定义该变量以承载业务值。 */
    const selectedMapId = this.selectedMapId ?? current?.mapId ?? null;
/** availability：定义该变量以承载业务值。 */
    const availability = this.getDisplayAvailability(selectedMapId, current);
/** showSwitch：定义该变量以承载业务值。 */
    const showSwitch = availability.hasMemory && availability.hasUnlock;
/** nextMode：定义该变量以承载业务值。 */
    const nextMode = this.resolveModalDisplayMode(availability);
    this.modalDisplayMode = nextMode;

    this.modalSourceSwitch?.classList.toggle('hidden', !showSwitch);

    if (this.modalSourceMemoryBtn) {
/** active：定义该变量以承载业务值。 */
      const active = nextMode === 'memory';
      this.modalSourceMemoryBtn.classList.toggle('active', active);
      this.modalSourceMemoryBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      this.modalSourceMemoryBtn.title = '显示本地记忆地图';
    }
    if (this.modalSourceUnlockBtn) {
/** active：定义该变量以承载业务值。 */
      const active = nextMode === 'unlock';
      this.modalSourceUnlockBtn.classList.toggle('active', active);
      this.modalSourceUnlockBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      this.modalSourceUnlockBtn.title = '显示已解锁整图';
    }
  }

/** setModalDisplayMode：执行对应的业务逻辑。 */
  private setModalDisplayMode(mode: MinimapDisplayMode): void {
/** current：定义该变量以承载业务值。 */
    const current = this.getCurrentDisplayScene();
/** selectedMapId：定义该变量以承载业务值。 */
    const selectedMapId = this.selectedMapId ?? current?.mapId ?? null;
/** availability：定义该变量以承载业务值。 */
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

/** getCurrentDisplayScene：执行对应的业务逻辑。 */
  private getCurrentDisplayScene(): DisplayMapScene | null {
    if (!this.scene?.mapMeta) {
      return null;
    }
/** availability：定义该变量以承载业务值。 */
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

/** getModalDisplayScene：执行对应的业务逻辑。 */
  private getModalDisplayScene(): DisplayMapScene | null {
/** current：定义该变量以承载业务值。 */
    const current = this.getCurrentDisplayScene();
    if (!this.modalOpen) {
      return null;
    }
/** selectedMapId：定义该变量以承载业务值。 */
    const selectedMapId = this.selectedMapId ?? current?.mapId ?? null;
    if (!selectedMapId) {
      return current;
    }
    if (current && selectedMapId === current.mapId) {
/** mode：定义该变量以承载业务值。 */
      const mode = this.resolveModalDisplayMode({
        hasMemory: current.hasMemory,
        hasUnlock: current.hasUnlock,
      });
      this.modalDisplayMode = mode;
      return {
        ...current,
/** snapshot：定义该变量以承载业务值。 */
        snapshot: mode === 'unlock' ? current.snapshot : null,
        displayMode: mode,
      };
    }

/** snapshot：定义该变量以承载业务值。 */
    const snapshot = getCachedMapSnapshot(selectedMapId);
/** rememberedMarkers：定义该变量以承载业务值。 */
    const rememberedMarkers = getRememberedMarkers(selectedMapId);
/** tileCache：定义该变量以承载业务值。 */
    const tileCache = getRememberedTiles(selectedMapId);
/** hasMemory：定义该变量以承载业务值。 */
    const hasMemory = tileCache.size > 0 || rememberedMarkers.length > 0;
/** hasUnlock：定义该变量以承载业务值。 */
    const hasUnlock = !!snapshot;
    if (!hasUnlock && !hasMemory) {
      return current;
    }

/** mode：定义该变量以承载业务值。 */
    const mode = this.resolveModalDisplayMode({ hasMemory, hasUnlock });
    this.modalDisplayMode = mode;
/** mapMeta：定义该变量以承载业务值。 */
    const mapMeta = getCachedMapMeta(selectedMapId) ?? buildFallbackMapMeta(selectedMapId, snapshot, tileCache);
    return {
      mapId: selectedMapId,
      mapMeta,
/** snapshot：定义该变量以承载业务值。 */
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

/** buildTileCacheHash：执行对应的业务逻辑。 */
  private buildTileCacheHash(tileCache: ReadonlyMap<string, Tile>): string {
/** hash：定义该变量以承载业务值。 */
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

/** buildBaseKey：执行对应的业务逻辑。 */
  private buildBaseKey(display: DisplayMapScene): string {
    if (display.snapshot) {
      return `snapshot:${display.mapId}:${display.snapshot.width}:${display.snapshot.height}:${display.snapshot.terrainRows.length}:${display.snapshot.markers.length}`;
    }
    if (display.isCurrent) {
      return `memory:${display.mapId}:${display.memoryVersion}`;
    }
    return `memory:${display.mapId}:${this.buildTileCacheHash(display.tileCache)}`;
  }

/** ensureBaseCanvas：执行对应的业务逻辑。 */
  private ensureBaseCanvas(display: DisplayMapScene): void {
    if (!this.baseCtx) {
      return;
    }

/** nextKey：定义该变量以承载业务值。 */
    const nextKey = this.buildBaseKey(display);
    if (this.baseKey === nextKey) {
      return;
    }
    this.baseKey = nextKey;

    this.baseCanvas.width = Math.max(1, display.mapMeta.width);
    this.baseCanvas.height = Math.max(1, display.mapMeta.height);
    this.baseCtx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
    this.baseCtx.fillStyle = '#0d0f12';
    this.baseCtx.fillRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);

    if (display.snapshot && display.snapshot.terrainRows.length > 0) {
      for (let y = 0; y < display.snapshot.terrainRows.length; y += 1) {
        const row = display.snapshot.terrainRows[y] ?? '';
        for (let x = 0; x < row.length; x += 1) {
          const type = getTileTypeFromMapChar(row[x] ?? '.');
          this.baseCtx.fillStyle = TILE_MINIMAP_COLORS[type] ?? '#888';
          this.baseCtx.fillRect(x, y, 1, 1);
        }
      }
      return;
    }

    for (const [key, tile] of display.tileCache.entries()) {
      const point = parseTileKey(key);
      if (!point) {
        continue;
      }
      if (
        point.x < 0 || point.y < 0
        || point.x >= this.baseCanvas.width
        || point.y >= this.baseCanvas.height
      ) {
        continue;
      }
      this.baseCtx.fillStyle = TILE_MINIMAP_COLORS[tile.type] ?? '#888';
      this.baseCtx.fillRect(point.x, point.y, 1, 1);
    }
  }

/** renderOverlay：执行对应的业务逻辑。 */
  private renderOverlay(): void {
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.overlayCanvas?.getContext('2d');
/** display：定义该变量以承载业务值。 */
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
/** metrics：定义该变量以承载业务值。 */
    const metrics = this.getViewportMetrics(this.overlayCanvas, display, false);
    this.drawScene(ctx, display, metrics, false);
  }

/** renderModal：执行对应的业务逻辑。 */
  private renderModal(): void {
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.modalCanvas?.getContext('2d');
/** display：定义该变量以承载业务值。 */
    const display = this.getModalDisplayScene();
    if (!ctx || !this.modalCanvas || !this.modalOpen) {
      return;
    }
    if (!display) {
      ctx.clearRect(0, 0, this.modalCanvas.width, this.modalCanvas.height);
      return;
    }

    ensureCanvasSize(this.modalCanvas);
/** metrics：定义该变量以承载业务值。 */
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

/** openMoveConfirm：执行对应的业务逻辑。 */
  private openMoveConfirm(mapMeta: MapMeta, x: number, y: number): void {
    this.pendingMovePoint = { x, y };
    detailModalHost.open({
      ownerId: Minimap.MOVE_CONFIRM_OWNER,
      title: '确认前往',
      subtitle: `${mapMeta.name} · 坐标 (${x}, ${y})`,
      hint: '点击空白处取消',
      bodyHtml: `
        <div class="panel-section">
          <div class="empty-hint">将角色移动至该坐标。实际是否可达仍以服务端寻路与通行判定为准。</div>
        </div>
        <div class="tech-modal-actions ui-modal-footer-actions">
          <button class="small-btn ghost" type="button" data-map-move-cancel>取消</button>
          <button class="small-btn" type="button" data-map-move-confirm>确认前往</button>
        </div>
      `,
      onClose: () => {
        this.pendingMovePoint = null;
      },
      onAfterRender: (body) => {
        body.querySelector<HTMLElement>('[data-map-move-cancel]')?.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.closeMoveConfirm();
        });
        body.querySelector<HTMLElement>('[data-map-move-confirm]')?.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!this.moveHandler) {
            this.closeMoveConfirm();
            return;
          }
          this.moveHandler(x, y);
          this.closeMoveConfirm();
        });
      },
    });
  }

/** closeMoveConfirm：执行对应的业务逻辑。 */
  private closeMoveConfirm(): void {
    this.pendingMovePoint = null;
    detailModalHost.close(Minimap.MOVE_CONFIRM_OWNER);
  }

/** openDeleteMemoryConfirm：执行对应的业务逻辑。 */
  private openDeleteMemoryConfirm(): void {
/** selectedMapId：定义该变量以承载业务值。 */
    const selectedMapId = this.selectedMapId;
    if (!selectedMapId) {
      return;
    }
/** entry：定义该变量以承载业务值。 */
    const entry = this.buildCatalogEntries().find((candidate) => candidate.mapId === selectedMapId);
    if (!entry?.hasMemory) {
      return;
    }
/** mapName：定义该变量以承载业务值。 */
    const mapName = entry.mapMeta?.name ?? selectedMapId;
    detailModalHost.open({
      ownerId: Minimap.DELETE_MEMORY_OWNER,
      title: '删除本地记忆',
      subtitle: mapName,
      hint: '点击空白处取消',
      bodyHtml: `
        <div class="panel-section">
          <div class="empty-hint">只会删除这张地图的本地记忆，不会影响已解锁整图。若你当前正站在该地图，视野内正在看到的部分会重新记入。</div>
        </div>
        <div class="tech-modal-actions ui-modal-footer-actions">
          <button class="small-btn ghost" type="button" data-map-memory-cancel>取消</button>
          <button class="small-btn danger" type="button" data-map-memory-confirm>确认删除</button>
        </div>
      `,
      onAfterRender: (body) => {
        body.querySelector<HTMLElement>('[data-map-memory-cancel]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          detailModalHost.close(Minimap.DELETE_MEMORY_OWNER);
        });
        body.querySelector<HTMLElement>('[data-map-memory-confirm]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          this.deleteSelectedMemory(selectedMapId);
          detailModalHost.close(Minimap.DELETE_MEMORY_OWNER);
        });
      },
    });
  }

/** deleteSelectedMemory：执行对应的业务逻辑。 */
  private deleteSelectedMemory(mapId: string): void {
    deleteRememberedMap(mapId);
    this.baseKey = null;
    this.closeMoveConfirm();
    if (this.scene?.mapMeta?.id === mapId) {
/** nextScene：定义该变量以承载业务值。 */
      const nextScene: MinimapScene = {
        ...this.scene,
        rememberedMarkers: [],
        memoryVersion: this.scene.memoryVersion + 1,
      };
      if (!this.scene.snapshot) {
/** visibleOnlyTileCache：定义该变量以承载业务值。 */
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
    this.renderCatalog();
    this.scheduleRender();
  }

  private getViewportMetrics(
    canvas: HTMLCanvasElement,
    display: DisplayMapScene,
    isModal: boolean,
    zoom = isModal ? this.modalZoom : 1,
    panX = isModal ? this.modalPanX : 0,
    panY = isModal ? this.modalPanY : 0,
  ): ViewportMetrics {
/** width：定义该变量以承载业务值。 */
    const width = Math.max(1, canvas.width);
/** height：定义该变量以承载业务值。 */
    const height = Math.max(1, canvas.height);
/** mapWidth：定义该变量以承载业务值。 */
    const mapWidth = Math.max(1, display.mapMeta.width);
/** mapHeight：定义该变量以承载业务值。 */
    const mapHeight = Math.max(1, display.mapMeta.height);
/** padding：定义该变量以承载业务值。 */
    const padding = isModal
      ? Math.max(18, Math.round(Math.min(width, height) * 0.022))
      : Math.max(8, Math.round(Math.min(width, height) * 0.06));
/** innerWidth：定义该变量以承载业务值。 */
    const innerWidth = Math.max(1, width - padding * 2);
/** innerHeight：定义该变量以承载业务值。 */
    const innerHeight = Math.max(1, height - padding * 2);
/** fitScale：定义该变量以承载业务值。 */
    const fitScale = Math.min(innerWidth / mapWidth, innerHeight / mapHeight);
/** scale：定义该变量以承载业务值。 */
    const scale = fitScale * (isModal ? zoom : 1);
/** drawWidth：定义该变量以承载业务值。 */
    const drawWidth = mapWidth * scale;
/** drawHeight：定义该变量以承载业务值。 */
    const drawHeight = mapHeight * scale;
/** baseOffsetX：定义该变量以承载业务值。 */
    const baseOffsetX = padding + (innerWidth - drawWidth) / 2;
/** baseOffsetY：定义该变量以承载业务值。 */
    const baseOffsetY = padding + (innerHeight - drawHeight) / 2;
/** maxPanX：定义该变量以承载业务值。 */
    const maxPanX = isModal ? Math.max(0, (drawWidth - innerWidth) / 2) : 0;
/** maxPanY：定义该变量以承载业务值。 */
    const maxPanY = isModal ? Math.max(0, (drawHeight - innerHeight) / 2) : 0;
/** clampedPanX：定义该变量以承载业务值。 */
    const clampedPanX = isModal ? clamp(panX, -maxPanX, maxPanX) : 0;
/** clampedPanY：定义该变量以承载业务值。 */
    const clampedPanY = isModal ? clamp(panY, -maxPanY, maxPanY) : 0;
    return {
      width,
      height,
      innerWidth,
      innerHeight,
      mapWidth,
      mapHeight,
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

  private resolveWorldPoint(metrics: ViewportMetrics, px: number, py: number): { x: number; y: number } | null {
    if (
      px < metrics.offsetX
      || py < metrics.offsetY
      || px >= metrics.offsetX + metrics.drawWidth
      || py >= metrics.offsetY + metrics.drawHeight
    ) {
      return null;
    }
    return {
      x: (px - metrics.offsetX) / metrics.scale,
      y: (py - metrics.offsetY) / metrics.scale,
    };
  }

  private resolveCanvasPoint(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
    display: DisplayMapScene,
    isModal: boolean,
  ): { x: number; y: number } | null {
/** pixels：定义该变量以承载业务值。 */
    const pixels = getCanvasPixels(canvas, clientX, clientY);
    if (!pixels) {
      return null;
    }
/** metrics：定义该变量以承载业务值。 */
    const metrics = this.getViewportMetrics(canvas, display, isModal);
/** world：定义该变量以承载业务值。 */
    const world = this.resolveWorldPoint(metrics, pixels.x, pixels.y);
    if (!world) {
      return null;
    }
    return {
      x: clamp(Math.floor(world.x), 0, metrics.mapWidth - 1),
      y: clamp(Math.floor(world.y), 0, metrics.mapHeight - 1),
    };
  }

  private resolveCurrentMoveTarget(
    display: DisplayMapScene | null,
    canvas: HTMLCanvasElement | null,
    clientX: number,
    clientY: number,
    isModal: boolean,
  ): { x: number; y: number } | null {
    if (!display || !display.isCurrent || !display.player || !canvas) {
      return null;
    }
/** point：定义该变量以承载业务值。 */
    const point = this.resolveCanvasPoint(canvas, clientX, clientY, display, isModal);
    if (!point) {
      return null;
    }
/** tile：定义该变量以承载业务值。 */
    const tile = this.getTileAt(display, point.x, point.y);
/** walkable：定义该变量以承载业务值。 */
    const walkable = tile ? tile.walkable : isTileTypeWalkable(this.getTileTypeAt(display, point.x, point.y));
    if (!walkable) {
      return null;
    }
    return point;
  }

/** getTileAt：执行对应的业务逻辑。 */
  private getTileAt(display: DisplayMapScene, x: number, y: number): Tile | null {
/** key：定义该变量以承载业务值。 */
    const key = `${x},${y}`;
/** current：定义该变量以承载业务值。 */
    const current = display.tileCache.get(key);
    if (current) {
      return current;
    }
/** row：定义该变量以承载业务值。 */
    const row = display.snapshot?.terrainRows[y] ?? '';
/** type：定义该变量以承载业务值。 */
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

/** getTileTypeAt：执行对应的业务逻辑。 */
  private getTileTypeAt(display: DisplayMapScene, x: number, y: number): TileType {
    return this.getTileAt(display, x, y)?.type ?? TileType.Floor;
  }

/** getDisplayMarkers：执行对应的业务逻辑。 */
  private getDisplayMarkers(display: DisplayMapScene): MapMinimapMarker[] {
/** markers：定义该变量以承载业务值。 */
    const markers: MapMinimapMarker[] = [];
/** markerIndexByKey：定义该变量以承载业务值。 */
    const markerIndexByKey = new Map<string, number>();
/** occupiedPointKeys：定义该变量以承载业务值。 */
    const occupiedPointKeys = new Set<string>();
/** pushMarker：定义该变量以承载业务值。 */
    const pushMarker = (marker: MapMinimapMarker): void => {
/** key：定义该变量以承载业务值。 */
      const key = `${marker.kind}:${marker.x},${marker.y}`;
/** existingIndex：定义该变量以承载业务值。 */
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
/** type：定义该变量以承载业务值。 */
      const type = this.getTileTypeAt(display, point.x, point.y);
/** hasStaticMarkerAtPoint：定义该变量以承载业务值。 */
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

  private drawScene(
    ctx: CanvasRenderingContext2D,
    display: DisplayMapScene,
    metrics: ViewportMetrics,
    isModal: boolean,
  ): void {
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
          metrics.offsetX + point.x * metrics.scale,
          metrics.offsetY + point.y * metrics.scale,
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
          metrics.offsetX + point.x * metrics.scale,
          metrics.offsetY + point.y * metrics.scale,
          Math.ceil(metrics.scale),
          Math.ceil(metrics.scale),
        );
      }
    }

/** markers：定义该变量以承载业务值。 */
    const markers = this.getDisplayMarkers(display);
/** markerSize：定义该变量以承载业务值。 */
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
/** pileSize：定义该变量以承载业务值。 */
      const pileSize = clamp(metrics.scale * 0.52, 3, isModal ? 10 : 8);
      for (const pile of display.groundPiles.values()) {
        this.drawGroundPile(ctx, pile, metrics, pileSize);
      }
    }

    if (display.isCurrent && display.player) {
/** playerLeft：定义该变量以承载业务值。 */
      const playerLeft = clamp(display.player.x - display.viewRadius, 0, metrics.mapWidth);
/** playerTop：定义该变量以承载业务值。 */
      const playerTop = clamp(display.player.y - display.viewRadius, 0, metrics.mapHeight);
/** playerRight：定义该变量以承载业务值。 */
      const playerRight = clamp(display.player.x + display.viewRadius + 1, 0, metrics.mapWidth);
/** playerBottom：定义该变量以承载业务值。 */
      const playerBottom = clamp(display.player.y + display.viewRadius + 1, 0, metrics.mapHeight);
      ctx.strokeStyle = isModal ? 'rgba(255, 241, 186, 0.84)' : 'rgba(247, 233, 180, 0.72)';
      ctx.lineWidth = Math.max(1, metrics.scale * 0.18);
      ctx.strokeRect(
        metrics.offsetX + playerLeft * metrics.scale,
        metrics.offsetY + playerTop * metrics.scale,
        Math.max(metrics.scale, (playerRight - playerLeft) * metrics.scale),
        Math.max(metrics.scale, (playerBottom - playerTop) * metrics.scale),
      );

/** playerCenterX：定义该变量以承载业务值。 */
      const playerCenterX = metrics.offsetX + (display.player.x + 0.5) * metrics.scale;
/** playerCenterY：定义该变量以承载业务值。 */
      const playerCenterY = metrics.offsetY + (display.player.y + 0.5) * metrics.scale;
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

  private drawMarker(
    ctx: CanvasRenderingContext2D,
    marker: MapMinimapMarker,
    metrics: ViewportMetrics,
    markerSize: number,
  ): void {
/** centerX：定义该变量以承载业务值。 */
    const centerX = metrics.offsetX + (marker.x + 0.5) * metrics.scale;
/** centerY：定义该变量以承载业务值。 */
    const centerY = metrics.offsetY + (marker.y + 0.5) * metrics.scale;
/** half：定义该变量以承载业务值。 */
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

  private drawMarkerLabel(
    ctx: CanvasRenderingContext2D,
    marker: MapMinimapMarker,
    metrics: ViewportMetrics,
  ): void {
/** centerX：定义该变量以承载业务值。 */
    const centerX = metrics.offsetX + (marker.x + 0.5) * metrics.scale;
/** centerY：定义该变量以承载业务值。 */
    const centerY = metrics.offsetY + (marker.y + 0.5) * metrics.scale;
/** label：定义该变量以承载业务值。 */
    const label = marker.label.trim();
    if (!label) {
      return;
    }

    ctx.save();
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(15, 12, 10, 0.92)';

    if (marker.kind === 'landmark') {
/** fontSize：定义该变量以承载业务值。 */
      const fontSize = clamp(metrics.scale * 0.7, 12, 18);
      ctx.font = buildCanvasFont('labelStrong', fontSize);
      ctx.textBaseline = 'middle';
/** textWidth：定义该变量以承载业务值。 */
      const textWidth = ctx.measureText(label).width;
/** paddingX：定义该变量以承载业务值。 */
      const paddingX = Math.max(8, metrics.scale * 0.24);
/** boxHeight：定义该变量以承载业务值。 */
      const boxHeight = Math.max(20, fontSize + 8);
/** boxWidth：定义该变量以承载业务值。 */
      const boxWidth = textWidth + paddingX * 2;
/** anchorY：定义该变量以承载业务值。 */
      const anchorY = clamp(
        centerY + Math.max(16, metrics.scale * 0.7),
        metrics.padding + boxHeight / 2 + 2,
        metrics.height - metrics.padding - boxHeight / 2 - 2,
      );
/** boxLeft：定义该变量以承载业务值。 */
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

/** fontSize：定义该变量以承载业务值。 */
    const fontSize = clamp(metrics.scale * 0.6, 11, 16);
/** textY：定义该变量以承载业务值。 */
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

  private drawGroundPile(
    ctx: CanvasRenderingContext2D,
    pile: GroundItemPileView,
    metrics: ViewportMetrics,
    pileSize: number,
  ): void {
/** centerX：定义该变量以承载业务值。 */
    const centerX = metrics.offsetX + (pile.x + 0.5) * metrics.scale;
/** centerY：定义该变量以承载业务值。 */
    const centerY = metrics.offsetY + (pile.y + 0.5) * metrics.scale;
/** half：定义该变量以承载业务值。 */
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

  private drawModalHud(
    ctx: CanvasRenderingContext2D,
    display: DisplayMapScene,
    metrics: ViewportMetrics,
    markers: MapMinimapMarker[],
  ): void {
/** guide：定义该变量以承载业务值。 */
    const guide = display.isCurrent
      ? '滚轮缩放 · 右键拖拽 · 左键前往'
      : '滚轮缩放 · 右键拖拽';
    ctx.save();
    ctx.font = buildCanvasFont('label', 12);
    ctx.textBaseline = 'middle';
/** guideWidth：定义该变量以承载业务值。 */
    const guideWidth = ctx.measureText(guide).width + 18;
/** guideX：定义该变量以承载业务值。 */
    const guideX = metrics.width - metrics.padding - guideWidth;
/** guideY：定义该变量以承载业务值。 */
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

/** lines：定义该变量以承载业务值。 */
    const lines = this.buildHoverLines(display, markers, this.hoveredModalPoint.x, this.hoveredModalPoint.y);
    if (lines.length === 0) {
      ctx.restore();
      return;
    }

    ctx.font = buildCanvasFont('label', 13);
/** lineHeight：定义该变量以承载业务值。 */
    const lineHeight = 20;
/** contentWidth：定义该变量以承载业务值。 */
    const contentWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
/** panelWidth：定义该变量以承载业务值。 */
    const panelWidth = Math.min(metrics.width - metrics.padding * 2, contentWidth + 20);
/** panelHeight：定义该变量以承载业务值。 */
    const panelHeight = lines.length * lineHeight + 16;
/** panelX：定义该变量以承载业务值。 */
    const panelX = metrics.padding;
/** panelY：定义该变量以承载业务值。 */
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

/** buildHoverLines：执行对应的业务逻辑。 */
  private buildHoverLines(display: DisplayMapScene, markers: MapMinimapMarker[], x: number, y: number): string[] {
/** lines：定义该变量以承载业务值。 */
    const lines: string[] = [];
    lines.push(`坐标 (${x}, ${y})`);

/** tile：定义该变量以承载业务值。 */
    const tile = this.getTileAt(display, x, y);
    if (tile) {
      lines.push(`地表：${getTileTypeLabel(tile.type)}`);
    } else {
      lines.push('地表：此处尚未记下');
    }

/** tileMarkers：定义该变量以承载业务值。 */
    const tileMarkers = markers.filter((marker) => marker.x === x && marker.y === y);
    for (const marker of tileMarkers.slice(0, 3)) {
      lines.push(`${getMinimapMarkerKindLabel(marker.kind)}：${marker.label}${marker.detail ? ` · ${marker.detail}` : ''}`);
    }

    if (display.isCurrent && display.player?.x === x && display.player.y === y) {
      lines.push('位置：你当前在此');
    }

    if (display.isCurrent) {
/** pile：定义该变量以承载业务值。 */
      const pile = [...display.groundPiles.values()].find((entry) => entry.x === x && entry.y === y);
      if (pile) {
/** itemsLabel：定义该变量以承载业务值。 */
        const itemsLabel = pile.items.slice(0, 2).map((entry) => `${entry.name} ${formatDisplayCountBadge(entry.count)}`).join('、');
/** suffix：定义该变量以承载业务值。 */
        const suffix = pile.items.length > 2 ? ` 等 ${formatDisplayInteger(pile.items.length)} 件` : '';
        lines.push(`地面：${itemsLabel}${suffix}`);
      }
    }

    return lines;
  }
}
