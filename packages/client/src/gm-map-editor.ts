/**
 * GM 地图编辑器 —— Canvas 可视化地图编辑，支持地块绘制、对象管理、撤销与 JSON 导入导出
 */

import {
  GmEditorItemOption,
  GmMapDetailRes,
  GmMapContainerLootPoolRecord,
  GmMapDocument,
  GmMapLandmarkRecord,
  GmMapListRes,
  GmMapSummary,
  GmMapMonsterSpawnRecord,
  GmMapNpcRecord,
  GmMapPortalRecord,
  GmMapQuestRecord,
  GmMapResourceRecord,
  GmMapSafeZoneRecord,
  MapRouteDomain,
  PortalRouteDomain,
  QUEST_LINE_LABELS,
  QUEST_OBJECTIVE_TYPE_LABELS,
  GmUpdateMapReq,
  TECHNIQUE_GRADE_LABELS,
  Tile,
  TileType,
  TILE_TYPE_LABELS,
  TILE_VISUAL_BG_COLORS,
  TILE_VISUAL_GLYPHS,
  TILE_VISUAL_GLYPH_COLORS,
  getMapCharFromTileType,
  getTileTypeFromMapChar,
  getAuraLevel,
  isOffsetInRange,
  isTileTypeWalkable,
  normalizeConfiguredAuraValue,
  parseQiResourceKey,
} from '@mud/shared-next';
import {
  AURA_BRUSH_LEVELS,
  EDITOR_BASE_CELL_SIZE,
  EDITOR_ZOOM_LEVELS,
  DEFAULT_EDITOR_ZOOM_INDEX,
  MAX_UNDO_STEPS,
  INSPECTOR_TABS,
  TOOL_OPTIONS,
  PAINT_TILE_TYPES,
  PAINT_LAYER_OPTIONS,
} from './constants/editor/map-editor';
import { buildCanvasFont } from './constants/ui/text';
import {
  clone,
  createDefaultContainerLootPool,
  createDefaultQuestRecord,
  decimalField,
  escapeHtml,
  formatAuraLevelText,
  formatAuraPointLabel,
  formatJson,
  formatResourcePointLabel,
  formatResourceSummary,
  formatTagGroups,
  getConfiguredAuraLevel,
  getQuestCardMeta,
  getQuestCardTitle,
  getResourcePointGlyphColor,
  getResourcePointLabelColor,
  getResourceRecordKey,
  getResourceRecordKeyName,
  getResourceTypeSortKey,
  formatResourceTypeLabel,
  isEditableTarget,
  jsonField,
  nullableDecimalField,
  nullableNumberField,
  nullableSelectField,
  numberField,
  parseTagGroups,
  readonlyField,
  removeArrayIndex,
  rotateComposeClockwise,
  rotateComposeCounterClockwise,
  selectField,
  setResourceRecordKey,
  setValueByPath,
  getValueByPath,
  textareaField,
  textField,
  booleanField,
} from './gm-map-editor-helpers';
import { GM_API_BASE_PATH } from './constants/api';

/** RequestFn：定义该类型的结构与数据语义。 */
type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;
/** StatusFn：定义该类型的结构与数据语义。 */
type StatusFn = (message: string, isError?: boolean) => void;
/** MONSTER_GRADE_OPTIONS：定义该变量以承载业务值。 */
const MONSTER_GRADE_OPTIONS = Object.entries(TECHNIQUE_GRADE_LABELS).map(([value, label]) => ({ value, label }));
/** MAP_ROUTE_DOMAIN_OPTIONS：定义该变量以承载业务值。 */
const MAP_ROUTE_DOMAIN_OPTIONS: Array<{ value: MapRouteDomain; label: string }> = [
  { value: 'system', label: '系统地图' },
  { value: 'sect', label: '宗门地图' },
  { value: 'personal', label: '个人地图' },
  { value: 'dynamic', label: '动态图' },
];
/** PORTAL_ROUTE_DOMAIN_OPTIONS：定义该变量以承载业务值。 */
const PORTAL_ROUTE_DOMAIN_OPTIONS: Array<{ value: PortalRouteDomain; label: string }> = [
  { value: 'inherit', label: '继承地图' },
  { value: 'system', label: '系统传送点' },
  { value: 'sect', label: '宗门传送点' },
  { value: 'personal', label: '个人传送点' },
  { value: 'dynamic', label: '动态图传送点' },
];
/** MONSTER_GRADE_OVERRIDE_OPTIONS：定义该变量以承载业务值。 */
const MONSTER_GRADE_OVERRIDE_OPTIONS = [
  { value: '', label: '跟随模板' },
  ...MONSTER_GRADE_OPTIONS,
];
/** GmMapEditorOptions：定义该类型的结构与数据语义。 */
type GmMapEditorOptions = {
  mapApiBasePath?: string;
  syncedSummaryLabel?: string;
  itemCatalog?: GmEditorItemOption[];
};

/** MapEntitySelection：定义该类型的结构与数据语义。 */
type MapEntitySelection =
  | { kind: 'portal'; index: number }
  | { kind: 'npc'; index: number }
  | { kind: 'monster'; index: number }
  | { kind: 'aura'; index: number }
  | { kind: 'resource'; index: number }
  | { kind: 'safeZone'; index: number }
  | { kind: 'landmark'; index: number }
  | { kind: 'container'; index: number }
  | null;

/** MapEntityKind：定义该类型的结构与数据语义。 */
type MapEntityKind = 'portal' | 'npc' | 'monster' | 'aura' | 'resource' | 'safeZone' | 'landmark' | 'container';

/** MapTool：定义该类型的结构与数据语义。 */
type MapTool = 'select' | 'paint' | 'pan';
/** PaintLayer：定义该类型的结构与数据语义。 */
type PaintLayer = 'tile' | 'aura' | 'resource';
/** InspectorTabId：定义该类型的结构与数据语义。 */
type InspectorTabId = 'selection' | 'meta' | 'compose' | 'portal' | 'npc' | 'monster' | 'aura' | 'resource' | 'safeZone' | 'landmark' | 'container';
/** GridPoint：定义该类型的结构与数据语义。 */
type GridPoint = { x: number; y: number };
/** ComposeRotation：定义该类型的结构与数据语义。 */
type ComposeRotation = 0 | 90 | 180 | 270;

/** TileResourcePoint：定义该类型的结构与数据语义。 */
type TileResourcePoint = GmMapResourceRecord;
/** MapComposePiece：定义该类型的结构与数据语义。 */
type MapComposePiece = {
  id: string,
  sourceMapId: string,
  sourceMapName: string,
  x: number,
  y: number,
  rotation: ComposeRotation,
};

/** DEFAULT_RESOURCE_KEY：定义该变量以承载业务值。 */
const DEFAULT_RESOURCE_KEY = 'aura.refined.metal';

/** EditorUndoEntry：定义该类型的结构与数据语义。 */
type EditorUndoEntry = {
/** draft：定义该变量以承载业务值。 */
  draft: GmMapDocument;
/** selectedCell：定义该变量以承载业务值。 */
  selectedCell: GridPoint | null;
/** selectedEntity：定义该变量以承载业务值。 */
  selectedEntity: MapEntitySelection;
/** resizeWidth：定义该变量以承载业务值。 */
  resizeWidth: number;
/** resizeHeight：定义该变量以承载业务值。 */
  resizeHeight: number;
/** resizeFillTileType：定义该变量以承载业务值。 */
  resizeFillTileType: TileType;
/** composePieces：定义该变量以承载业务值。 */
  composePieces: MapComposePiece[];
/** selectedComposePieceId：定义该变量以承载业务值。 */
  selectedComposePieceId: string | null;
/** composeSourceMapId：定义该变量以承载业务值。 */
  composeSourceMapId: string;
/** dirty：定义该变量以承载业务值。 */
  dirty: boolean;
};

/** GM 地图可视化编辑器，支持地块绘制、对象增删、撤销和 JSON 导入导出 */
export class GmMapEditor {
  private readonly listEl = document.getElementById('map-list') as HTMLDivElement;
  private readonly searchInput = document.getElementById('map-search') as HTMLInputElement;
  private readonly saveBtn = document.getElementById('map-save') as HTMLButtonElement;
  private readonly resetBtn = document.getElementById('map-reset') as HTMLButtonElement;
  private readonly reloadBtn = document.getElementById('map-reload') as HTMLButtonElement;
  private readonly undoBtn = document.getElementById('map-undo') as HTMLButtonElement;
  private readonly refreshListBtn = document.getElementById('map-refresh-list') as HTMLButtonElement;
  private readonly centerBtn = document.getElementById('map-center') as HTMLButtonElement;
  private readonly zoomOutBtn = document.getElementById('map-zoom-out') as HTMLButtonElement;
  private readonly zoomInBtn = document.getElementById('map-zoom-in') as HTMLButtonElement;
  private readonly statusEl = document.getElementById('map-status-bar') as HTMLDivElement;
  private readonly canvasHost = document.getElementById('map-editor-host') as HTMLDivElement;
  private readonly canvas = document.getElementById('map-editor-canvas') as HTMLCanvasElement;
  private readonly canvasEmptyEl = document.getElementById('map-canvas-empty') as HTMLDivElement;
  private readonly editorEmptyEl = document.getElementById('map-editor-empty') as HTMLDivElement;
  private readonly editorPanelEl = document.getElementById('map-editor-panel') as HTMLDivElement;
  private readonly summaryEl = document.getElementById('map-summary') as HTMLDivElement;
  private readonly toolButtonsEl = document.getElementById('map-tool-buttons') as HTMLDivElement;
  private readonly paintLayerTabsEl = document.getElementById('map-paint-layer-tabs') as HTMLDivElement | null;
  private readonly tilePaletteEl = document.getElementById('map-tile-palette') as HTMLDivElement;
  private readonly inspectorEl = document.getElementById('map-inspector-content') as HTMLDivElement;
  private readonly jsonEl = document.getElementById('map-json') as HTMLTextAreaElement;
  private readonly applyJsonBtn = document.getElementById('map-apply-json') as HTMLButtonElement;
  private readonly ctx = this.canvas.getContext('2d');
/** mapApiBasePath：定义该变量以承载业务值。 */
  private readonly mapApiBasePath: string;
/** syncedSummaryLabel：定义该变量以承载业务值。 */
  private readonly syncedSummaryLabel: string;
/** itemCatalog：定义该变量以承载业务值。 */
  private itemCatalog: GmEditorItemOption[] = [];

/** mapList：定义该变量以承载业务值。 */
  private mapList: GmMapSummary[] = [];
/** selectedMapId：定义该变量以承载业务值。 */
  private selectedMapId: string | null = null;
/** draft：定义该变量以承载业务值。 */
  private draft: GmMapDocument | null = null;
  private dirty = false;
/** activeTool：定义该变量以承载业务值。 */
  private activeTool: MapTool = 'paint';
/** forcedTool：定义该变量以承载业务值。 */
  private forcedTool: MapTool | null = null;
/** paintTileType：定义该变量以承载业务值。 */
  private paintTileType: TileType = TileType.Grass;
/** paintLayer：定义该变量以承载业务值。 */
  private paintLayer: PaintLayer = 'tile';
  private auraPaintValue = 1;
  private resourcePaintValue = 1;
  private resourcePaintKey = DEFAULT_RESOURCE_KEY;
  private composeSourceMapId = '';
/** composePieces：定义该变量以承载业务值。 */
  private composePieces: MapComposePiece[] = [];
/** selectedComposePieceId：定义该变量以承载业务值。 */
  private selectedComposePieceId: string | null = null;
  private readonly composeSourceCache = new Map<string, GmMapDocument>();
  private composeDragActive = false;
  private composeDragOffsetX = 0;
  private composeDragOffsetY = 0;
  private composePieceCounter = 1;
/** selectedCell：定义该变量以承载业务值。 */
  private selectedCell: { x: number; y: number } | null = null;
/** hoveredCell：定义该变量以承载业务值。 */
  private hoveredCell: { x: number; y: number } | null = null;
/** selectedEntity：定义该变量以承载业务值。 */
  private selectedEntity: MapEntitySelection = null;
/** currentInspectorTab：定义该变量以承载业务值。 */
  private currentInspectorTab: InspectorTabId = 'selection';
  private resizeWidth = 0;
  private resizeHeight = 0;
/** resizeFillTileType：定义该变量以承载业务值。 */
  private resizeFillTileType: TileType = TileType.Grass;
  private viewCenterX = 0;
  private viewCenterY = 0;
  private paintActive = false;
  private panActive = false;
/** lastPaintKey：定义该变量以承载业务值。 */
  private lastPaintKey: string | null = null;
  private panStartClientX = 0;
  private panStartClientY = 0;
  private panStartCenterX = 0;
  private panStartCenterY = 0;
/** activePointerId：定义该变量以承载业务值。 */
  private activePointerId: number | null = null;
  private activePanButtonMask = 0;
  private listLoaded = false;
  private zoomLevelIndex = DEFAULT_EDITOR_ZOOM_INDEX;
  private paintSessionHasUndoSnapshot = false;
  private dragEntityActive = false;
  private dragSessionHasUndoSnapshot = false;
/** linePaintStart：定义该变量以承载业务值。 */
  private linePaintStart: GridPoint | null = null;
/** undoStack：定义该变量以承载业务值。 */
  private undoStack: EditorUndoEntry[] = [];
/** renderFrameId：定义该变量以承载业务值。 */
  private renderFrameId: number | null = null;

  constructor(
    private readonly request: RequestFn,
    private readonly setGlobalStatus: StatusFn,
/** options：定义该变量以承载业务值。 */
    options: GmMapEditorOptions = {},
  ) {
    this.mapApiBasePath = options.mapApiBasePath ?? `${GM_API_BASE_PATH}/maps`;
    this.syncedSummaryLabel = options.syncedSummaryLabel ?? '已与服务端同步';
    this.itemCatalog = options.itemCatalog ? clone(options.itemCatalog) : [];
    this.bindEvents();
    this.renderToolControls();
    this.renderCanvas();
    this.updateUndoButtonState();
  }

/** setItemCatalog：执行对应的业务逻辑。 */
  setItemCatalog(items: GmEditorItemOption[]): void {
    this.itemCatalog = clone(items);
    if (this.currentInspectorTab === 'container') {
      this.renderInspector();
    }
  }

  /** 确保地图列表已加载，首次切换到地图 tab 时调用 */
  async ensureLoaded(): Promise<void> {
    if (this.listLoaded) return;
    await this.loadMapList();
  }

  /** 重置编辑器状态（登出时调用） */
  reset(): void {
    if (this.renderFrameId !== null) {
      window.cancelAnimationFrame(this.renderFrameId);
      this.renderFrameId = null;
    }
    this.mapList = [];
    this.selectedMapId = null;
    this.draft = null;
    this.dirty = false;
    this.selectedCell = null;
    this.hoveredCell = null;
    this.selectedEntity = null;
    this.composePieces = [];
    this.selectedComposePieceId = null;
    this.composeDragActive = false;
    this.composeSourceMapId = '';
    this.currentInspectorTab = 'selection';
    this.linePaintStart = null;
    this.undoStack = [];
    this.listLoaded = false;
    this.listEl.innerHTML = '';
    this.inspectorEl.innerHTML = '';
    this.summaryEl.innerHTML = '';
    this.jsonEl.value = '';
    this.editorPanelEl.classList.add('hidden');
    this.editorEmptyEl.classList.remove('hidden');
    this.canvasEmptyEl.classList.remove('hidden');
    this.updateUndoButtonState();
    this.setStatus('');
  }

/** forceTool：执行对应的业务逻辑。 */
  forceTool(tool: MapTool): void {
    if (this.forcedTool === tool) return;
    this.endPointerInteraction();
    this.forcedTool = tool;
    if (tool !== 'paint') {
      this.linePaintStart = null;
    }
    this.renderToolControls();
    this.renderCanvas();
  }

/** clearForcedTool：执行对应的业务逻辑。 */
  clearForcedTool(): void {
    if (this.forcedTool === null) return;
    this.endPointerInteraction();
    this.forcedTool = null;
    this.renderToolControls();
    this.renderCanvas();
  }

/** getCurrentTool：执行对应的业务逻辑。 */
  private getCurrentTool(): MapTool {
    return this.forcedTool ?? this.activeTool;
  }

/** bindEvents：执行对应的业务逻辑。 */
  private bindEvents(): void {
    this.searchInput.addEventListener('input', () => this.renderMapList());
    this.refreshListBtn.addEventListener('click', () => {
      this.loadMapList(true).catch(() => {});
    });
    this.saveBtn.addEventListener('click', () => {
      this.saveCurrentMap().catch(() => {});
    });
    this.resetBtn.addEventListener('click', () => this.resetDraft());
    this.reloadBtn.addEventListener('click', () => {
      this.reloadCurrentMap().catch(() => {});
    });
    this.undoBtn.addEventListener('click', () => this.undo());
    this.centerBtn.addEventListener('click', () => this.centerView());
    this.zoomOutBtn.addEventListener('click', () => this.applyZoom(-1));
    this.zoomInBtn.addEventListener('click', () => this.applyZoom(1));
    this.applyJsonBtn.addEventListener('click', () => this.applyRawJson());
    window.addEventListener('keydown', (event) => this.handleKeyDown(event));

    this.listEl.addEventListener('click', (event) => {
/** button：定义该变量以承载业务值。 */
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-id]');
/** mapId：定义该变量以承载业务值。 */
      const mapId = button?.dataset.mapId;
      if (!mapId) return;
      this.selectMap(mapId).catch(() => {});
    });

    this.toolButtonsEl.addEventListener('click', (event) => {
/** button：定义该变量以承载业务值。 */
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tool]');
/** tool：定义该变量以承载业务值。 */
      const tool = button?.dataset.tool as MapTool | undefined;
      if (!tool) return;
      this.clearForcedTool();
      this.activeTool = tool;
      if (tool !== 'paint') {
        this.linePaintStart = null;
      }
      this.renderToolControls();
      this.renderInspector();
      this.renderCanvas();
    });

    this.paintLayerTabsEl?.addEventListener('click', (event) => {
/** button：定义该变量以承载业务值。 */
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-paint-layer]');
/** nextLayer：定义该变量以承载业务值。 */
      const nextLayer = button?.dataset.paintLayer as PaintLayer | undefined;
      if (!nextLayer || this.paintLayer === nextLayer) return;
      this.paintLayer = nextLayer;
      this.renderToolControls();
      this.renderInspector();
    });

    this.tilePaletteEl.addEventListener('click', (event) => {
/** button：定义该变量以承载业务值。 */
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
/** tileType：定义该变量以承载业务值。 */
      const tileType = button.dataset.tileType as TileType | undefined;
      if (tileType) {
        this.paintTileType = tileType;
        this.renderToolControls();
        this.renderInspector();
        return;
      }
/** auraValue：定义该变量以承载业务值。 */
      const auraValue = Number(button.dataset.auraValue ?? Number.NaN);
      if (!Number.isFinite(auraValue)) return;
      if (this.paintLayer === 'aura') {
        this.auraPaintValue = Math.max(0, Math.floor(auraValue));
      } else if (this.paintLayer === 'resource') {
        this.resourcePaintValue = Math.max(0, Math.floor(auraValue));
      }
      this.renderToolControls();
      this.renderInspector();
    });

    this.inspectorEl.addEventListener('click', (event) => {
/** tabButton：定义该变量以承载业务值。 */
      const tabButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-inspector-tab]');
/** tab：定义该变量以承载业务值。 */
      const tab = tabButton?.dataset.mapInspectorTab as InspectorTabId | undefined;
      if (tab) {
        this.currentInspectorTab = tab;
        this.renderInspector();
        return;
      }
/** actionEl：定义该变量以承载业务值。 */
      const actionEl = (event.target as HTMLElement).closest<HTMLElement>('[data-map-action]');
/** action：定义该变量以承载业务值。 */
      const action = actionEl?.dataset.mapAction;
      if (action) {
        this.handleAction(action, actionEl!);
        return;
      }
/** entityButton：定义该变量以承载业务值。 */
      const entityButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-entity-kind]');
/** composeButton：定义该变量以承载业务值。 */
      const composeButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-compose-piece-id]');
      if (composeButton) {
/** pieceId：定义该变量以承载业务值。 */
        const pieceId = composeButton.dataset.composePieceId;
        if (pieceId) {
          this.selectedComposePieceId = pieceId;
          this.selectedEntity = null;
          this.currentInspectorTab = 'compose';
/** piece：定义该变量以承载业务值。 */
          const piece = this.getSelectedComposePiece();
          if (piece) {
            this.selectedCell = { x: piece.x, y: piece.y };
          }
          this.renderInspector();
        }
        return;
      }
      if (!entityButton) return;
/** kind：定义该变量以承载业务值。 */
      const kind = entityButton.dataset.entityKind as MapEntityKind | undefined;
/** index：定义该变量以承载业务值。 */
      const index = Number(entityButton.dataset.entityIndex ?? '-1');
      if (Number.isInteger(index) && kind) {
        this.selectedComposePieceId = null;
        this.selectedEntity = { kind, index } as Exclude<MapEntitySelection, null>;
        this.currentInspectorTab = kind;
/** point：定义该变量以承载业务值。 */
        const point = this.getSelectedEntityPoint();
        if (point) this.selectedCell = point;
        this.renderInspector();
      }
    });

    this.inspectorEl.addEventListener('change', (event) => {
/** target：定义该变量以承载业务值。 */
      const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
/** uiField：定义该变量以承载业务值。 */
      const uiField = target.dataset.mapUi;
      if (uiField) {
        this.handleUiFieldChange(uiField, target.value);
        return;
      }
/** result：定义该变量以承载业务值。 */
      const result = this.syncInspectorToDraft();
      if ('message' in result) {
        this.setStatus(result.message, true);
        return;
      }
      this.renderInspector();
    });

    this.canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.endPointerInteraction();
    });
    this.canvas.addEventListener('pointerdown', (event) => this.handleCanvasPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.handleCanvasPointerMove(event));
    this.canvas.addEventListener('pointerup', () => this.endPointerInteraction());
    this.canvas.addEventListener('pointercancel', () => this.endPointerInteraction());
    this.canvas.addEventListener('lostpointercapture', () => this.endPointerInteraction());
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.paintActive && !this.panActive && !this.dragEntityActive) {
        this.hoveredCell = null;
      }
    });
    window.addEventListener('blur', () => this.endPointerInteraction());
    window.addEventListener('resize', () => this.renderCanvas());
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.applyZoom(event.deltaY > 0 ? -1 : 1);
    }, { passive: false });
  }

/** setStatus：执行对应的业务逻辑。 */
  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.style.color = isError ? 'var(--stamp-red)' : 'var(--ink-grey)';
    this.setGlobalStatus(message, isError);
  }

/** renderToolControls：执行对应的业务逻辑。 */
  private renderToolControls(): void {
/** currentTool：定义该变量以承载业务值。 */
    const currentTool = this.getCurrentTool();
    this.toolButtonsEl.innerHTML = TOOL_OPTIONS.map((tool) => `
      <button class="map-tool-btn ${currentTool === tool.value ? 'active' : ''}" data-tool="${tool.value}" type="button">
        ${escapeHtml(tool.label)} · ${escapeHtml(tool.value === 'paint' ? `左键拖拽刷${this.paintLayer === 'tile' ? '地块' : this.paintLayer === 'aura' ? '无属性灵气' : '气机'}` : tool.note)}
      </button>
    `).join('');

    if (this.paintLayerTabsEl) {
      this.paintLayerTabsEl.innerHTML = PAINT_LAYER_OPTIONS.map((option) => `
      <button class="side-tab ${this.paintLayer === option.value ? 'active' : ''}" data-paint-layer="${option.value}" type="button">
        ${escapeHtml(option.label)}
      </button>
      `).join('');
    }

    this.tilePaletteEl.innerHTML = this.paintLayer === 'tile'
      ? PAINT_TILE_TYPES.map((tileType) => `
        <button class="map-tile-btn ${this.paintTileType === tileType ? 'active' : ''}" data-tile-type="${tileType}" type="button">
          ${escapeHtml(TILE_TYPE_LABELS[tileType])}
        </button>
      `).join('')
      : AURA_BRUSH_LEVELS.map((value) => `
        <button class="map-tile-btn ${(this.paintLayer === 'aura' ? this.auraPaintValue : this.resourcePaintValue) === value ? 'active' : ''}" data-aura-value="${value}" type="button">
          ${value === 0 ? '清除' : `${this.paintLayer === 'aura' ? '灵气' : '气机'} ${value}`}
        </button>
      `).join('');
  }

/** loadMapList：执行对应的业务逻辑。 */
  private async loadMapList(force = false): Promise<void> {
/** data：定义该变量以承载业务值。 */
    const data = await this.request<GmMapListRes>(this.mapApiBasePath);
    this.mapList = data.maps;
    this.listLoaded = true;
    if (force && this.selectedMapId) {
/** exists：定义该变量以承载业务值。 */
      const exists = data.maps.some((map) => map.id === this.selectedMapId);
      if (!exists) {
        this.selectedMapId = null;
        this.draft = null;
      }
    }
    if (!this.selectedMapId && data.maps.length > 0) {
      this.selectedMapId = data.maps[0]!.id;
      await this.loadMap(this.selectedMapId, false);
    }
    this.renderMapList();
  }

/** renderMapList：执行对应的业务逻辑。 */
  private renderMapList(): void {
/** keyword：定义该变量以承载业务值。 */
    const keyword = this.searchInput.value.trim().toLowerCase();
/** filtered：定义该变量以承载业务值。 */
    const filtered = this.mapList.filter((map) => {
      if (!keyword) return true;
      return [map.id, map.name, map.recommendedRealm ?? '', map.description ?? '']
        .some((value) => value.toLowerCase().includes(keyword));
    });
    if (filtered.length === 0) {
      this.listEl.innerHTML = '<div class="empty-hint">没有符合条件的地图。</div>';
      return;
    }
    this.listEl.innerHTML = filtered.map((map) => `
      <button class="map-row ${map.id === this.selectedMapId ? 'active' : ''}" data-map-id="${escapeHtml(map.id)}" type="button">
        <div class="map-row-title">${escapeHtml(map.name)}</div>
        <div class="map-row-meta">${escapeHtml(map.id)} · ${map.width} x ${map.height} · 危险度 ${map.dangerLevel ?? '-'}</div>
        <div class="map-row-meta">传送点 ${map.portalCount} · NPC ${map.npcCount} · 怪物刷新点 ${map.monsterSpawnCount}</div>
      </button>
    `).join('');
  }

/** selectMap：执行对应的业务逻辑。 */
  private async selectMap(mapId: string): Promise<void> {
    if (mapId === this.selectedMapId && this.draft) return;
    if (this.dirty && !window.confirm('当前地图有未保存修改，切换后会丢失这些修改。继续吗？')) {
      return;
    }
    await this.loadMap(mapId, true);
    this.renderMapList();
  }

/** loadMap：执行对应的业务逻辑。 */
  private async loadMap(mapId: string, announce = true): Promise<void> {
/** data：定义该变量以承载业务值。 */
    const data = await this.request<GmMapDetailRes>(`${this.mapApiBasePath}/${encodeURIComponent(mapId)}`);
    this.selectedMapId = mapId;
    this.draft = clone(data.map);
    this.dirty = false;
    this.selectedCell = { x: data.map.spawnPoint.x, y: data.map.spawnPoint.y };
    this.hoveredCell = null;
    this.selectedEntity = null;
    this.composePieces = [];
    this.selectedComposePieceId = null;
    this.composeDragActive = false;
    this.composeSourceMapId = this.mapList.find((map) => map.id !== mapId)?.id ?? '';
    this.currentInspectorTab = 'selection';
    this.linePaintStart = null;
    this.undoStack = [];
    this.resizeWidth = data.map.width;
    this.resizeHeight = data.map.height;
    this.resizeFillTileType = this.paintTileType;
    this.updateUndoButtonState();
    this.centerView();
    this.renderInspector();
    if (announce) {
      this.setStatus(`已载入地图 ${data.map.name}`);
    }
  }

/** renderInspector：执行对应的业务逻辑。 */
  private renderInspector(): void {
    if (!this.draft) {
      this.editorPanelEl.classList.add('hidden');
      this.editorEmptyEl.classList.remove('hidden');
      this.canvasEmptyEl.classList.remove('hidden');
      this.summaryEl.innerHTML = '';
      this.inspectorEl.innerHTML = '';
      this.jsonEl.value = '';
      return;
    }

    this.editorPanelEl.classList.remove('hidden');
    this.editorEmptyEl.classList.add('hidden');
    this.canvasEmptyEl.classList.add('hidden');

/** selectedCell：定义该变量以承载业务值。 */
    const selectedCell = this.selectedCell;
/** selectedTileType：定义该变量以承载业务值。 */
    const selectedTileType = selectedCell ? this.getTileTypeAt(selectedCell.x, selectedCell.y) : null;
/** selectedEntityPoint：定义该变量以承载业务值。 */
    const selectedEntityPoint = this.getSelectedEntityPoint();
    this.draft.resources = this.draft.resources ?? [];

/** summaryBits：定义该变量以承载业务值。 */
    const summaryBits = [
      `${this.draft.name} (${this.draft.id})`,
      `${this.draft.width} x ${this.draft.height}`,
      `拼图块 ${this.composePieces.length}`,
      `传送点 ${this.draft.portals.length}`,
      `NPC ${this.draft.npcs.length}`,
      `怪物刷新点 ${this.draft.monsterSpawns.length}`,
      `无属性灵气点 ${this.draft.auras?.length ?? 0}`,
      `气机点 ${this.draft.resources?.length ?? 0}`,
      `安全区 ${(this.draft.safeZones ?? []).length}`,
      `地标 ${this.draft.landmarks?.length ?? 0}`,
      `容器 ${this.getContainerLandmarks().length}`,
      this.dirty ? '有未保存修改' : this.syncedSummaryLabel,
    ];
    this.summaryEl.textContent = summaryBits.join(' · ');
    this.inspectorEl.innerHTML = `
      <div class="inspector-layout">
        <div class="inspector-tabs">
          ${INSPECTOR_TABS.map((tab) => `
            <button class="side-tab inspector-tab-btn ${this.currentInspectorTab === tab.value ? 'active' : ''}" data-map-inspector-tab="${tab.value}" type="button">
              ${escapeHtml(tab.label)}
            </button>
          `).join('')}
        </div>
        <div class="inspector-panel">
          ${this.renderInspectorTabContent(selectedCell, selectedTileType, selectedEntityPoint)}
        </div>
      </div>
    `;
    this.jsonEl.value = formatJson(this.draft);
    this.renderCanvas();
  }

  private renderInspectorTabContent(
/** selectedCell：定义该变量以承载业务值。 */
    selectedCell: { x: number; y: number } | null,
    selectedTileType: TileType | null,
/** selectedEntityPoint：定义该变量以承载业务值。 */
    selectedEntityPoint: { x: number; y: number } | null,
  ): string {
    switch (this.currentInspectorTab) {
      case 'selection':
        return this.renderSelectionTab(selectedCell, selectedTileType);
      case 'meta':
        return this.renderMetaTab();
      case 'compose':
        return this.renderComposeTab();
      case 'portal':
        return this.renderPortalTab(selectedEntityPoint);
      case 'npc':
        return this.renderNpcTab(selectedEntityPoint);
      case 'monster':
        return this.renderMonsterTab(selectedEntityPoint);
      case 'aura':
        return this.renderAuraTab(selectedEntityPoint);
      case 'resource':
        return this.renderResourceTab(selectedEntityPoint);
      case 'safeZone':
        return this.renderSafeZoneTab(selectedEntityPoint);
      case 'landmark':
        return this.renderLandmarkTab(selectedEntityPoint);
      case 'container':
        return this.renderContainerTab(selectedEntityPoint);
      default:
        return '';
    }
  }

/** renderSelectionTab：执行对应的业务逻辑。 */
  private renderSelectionTab(selectedCell: { x: number; y: number } | null, selectedTileType: TileType | null): string {
/** selectedAura：定义该变量以承载业务值。 */
    const selectedAura = selectedCell ? this.getAuraAt(selectedCell.x, selectedCell.y) : null;
/** selectedResources：定义该变量以承载业务值。 */
    const selectedResources = selectedCell ? this.getResourcesAt(selectedCell.x, selectedCell.y) : [];
/** resourceSummary：定义该变量以承载业务值。 */
    const resourceSummary = formatResourceSummary(selectedResources);
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">当前选区</div>
            <div class="editor-section-note">切到检视或 JSON 时会强制进入选取模式，回到工具面板再恢复你原本的工具。</div>
          </div>
        </div>
        <div class="map-form-grid compact">
          ${readonlyField('当前格', selectedCell ? `(${selectedCell.x}, ${selectedCell.y})` : '未选择')}
          ${readonlyField('悬停格', this.hoveredCell ? `(${this.hoveredCell.x}, ${this.hoveredCell.y})` : '无')}
          ${readonlyField('地块', selectedTileType ? TILE_TYPE_LABELS[selectedTileType] : '无')}
          ${readonlyField('无属性灵气', selectedAura ? formatAuraPointLabel(selectedAura.value) : '无')}
          ${readonlyField('气机', resourceSummary)}
          ${readonlyField('当前工具', this.getCurrentTool() === 'paint' ? `绘制 · ${this.paintLayer === 'tile' ? '地块' : this.paintLayer === 'aura' ? '无属性灵气' : '气机'}` : this.getCurrentTool() === 'pan' ? '平移' : '选取')}
          ${readonlyField('选中对象', this.describeSelectedEntity())}
        </div>
        <div class="button-row" style="margin-top: 10px;">
          <button class="small-btn" type="button" data-map-action="pick-tile">用当前地块作画笔</button>
          <button class="small-btn" type="button" data-map-action="set-spawn">把当前格设为出生点</button>
          <button class="small-btn" type="button" data-map-action="move-selected">把选中对象移到当前格</button>
        </div>
      </section>
    `;
  }

/** renderMetaTab：执行对应的业务逻辑。 */
  private renderMetaTab(): string {
    if (!this.draft) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">地图元信息</div>
            <div class="editor-section-note">名称、推荐境界、出生点与地图尺寸。</div>
          </div>
        </div>
        <div class="map-form-grid">
          ${textField('地图名称', 'name', this.draft.name)}
          ${selectField('路网域', 'routeDomain', this.draft.routeDomain ?? 'system', MAP_ROUTE_DOMAIN_OPTIONS)}
          ${textField('推荐境界', 'recommendedRealm', this.draft.recommendedRealm)}
          ${numberField('危险度', 'dangerLevel', this.draft.dangerLevel)}
          ${numberField('地块境界等级', 'terrainRealmLv', this.draft.terrainRealmLv)}
          ${readonlyField('地图 ID', this.draft.id)}
          ${numberField('出生点 X', 'spawnPoint.x', this.draft.spawnPoint.x)}
          ${numberField('出生点 Y', 'spawnPoint.y', this.draft.spawnPoint.y)}
          ${textField('描述', 'description', this.draft.description, 'wide')}
        </div>
        <div class="map-form-grid compact" style="margin-top: 10px;">
          <label class="map-field">
            <span>新宽度</span>
            <input data-map-ui="resizeWidth" type="number" min="1" value="${this.resizeWidth}" />
          </label>
          <label class="map-field">
            <span>新高度</span>
            <input data-map-ui="resizeHeight" type="number" min="1" value="${this.resizeHeight}" />
          </label>
          <label class="map-field">
            <span>扩展填充值</span>
            <select data-map-ui="resizeFill">
              ${PAINT_TILE_TYPES.map((tileType) => `
                <option value="${tileType}" ${this.resizeFillTileType === tileType ? 'selected' : ''}>${escapeHtml(TILE_TYPE_LABELS[tileType])}</option>
              `).join('')}
            </select>
          </label>
        </div>
        <div class="button-row" style="margin-top: 10px;">
          <button class="small-btn" type="button" data-map-action="resize">应用尺寸</button>
        </div>
      </section>
    `;
  }

/** renderComposeTab：执行对应的业务逻辑。 */
  private renderComposeTab(): string {
    if (!this.draft) return '';
/** sourceOptions：定义该变量以承载业务值。 */
    const sourceOptions = this.mapList.filter((map) => map.id !== this.draft?.id);
/** selectedPiece：定义该变量以承载业务值。 */
    const selectedPiece = this.getSelectedComposePiece();
/** selectedSource：定义该变量以承载业务值。 */
    const selectedSource = this.composeSourceMapId
      ? this.mapList.find((map) => map.id === this.composeSourceMapId) ?? null
      : null;
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">拼图块</div>
            <div class="editor-section-note">把子地图作为临时拼图块放到画布上。左键拖拽移动，旋转后再烘焙进当前地图。</div>
          </div>
          <button class="small-btn" type="button" data-map-action="compose-add-piece">加入拼图块</button>
        </div>
        <div class="map-form-grid compact">
          <label class="map-field wide">
            <span>来源地图</span>
            <select data-map-ui="composeSourceMapId">
              <option value="">请选择子地图</option>
              ${sourceOptions.map((map) => `
                <option value="${escapeHtml(map.id)}" ${map.id === this.composeSourceMapId ? 'selected' : ''}>
                  ${escapeHtml(`${map.name} (${map.id})`)}
                </option>
              `).join('')}
            </select>
          </label>
          ${readonlyField('当前来源', selectedSource ? `${selectedSource.name} · ${selectedSource.width}x${selectedSource.height}` : '未选择')}
          ${readonlyField('选中拼图', selectedPiece ? `${selectedPiece.sourceMapName} @ (${selectedPiece.x}, ${selectedPiece.y}) · ${selectedPiece.rotation}°` : '无')}
        </div>
        <div class="button-row" style="margin-top: 10px;">
          <button class="small-btn" type="button" data-map-action="compose-rotate-left" ${selectedPiece ? '' : 'disabled'}>左转 90°</button>
          <button class="small-btn" type="button" data-map-action="compose-rotate-right" ${selectedPiece ? '' : 'disabled'}>右转 90°</button>
          <button class="small-btn" type="button" data-map-action="compose-bake-selected" ${selectedPiece ? '' : 'disabled'}>烘焙选中块</button>
          <button class="small-btn" type="button" data-map-action="compose-bake-all" ${this.composePieces.length > 0 ? '' : 'disabled'}>全部烘焙</button>
        </div>
        <div class="button-row" style="margin-top: 8px;">
          <button class="small-btn danger" type="button" data-map-action="compose-remove-piece" ${selectedPiece ? '' : 'disabled'}>删除选中块</button>
          <button class="small-btn danger" type="button" data-map-action="compose-clear-pieces" ${this.composePieces.length > 0 ? '' : 'disabled'}>清空拼图块</button>
        </div>
        <div class="map-entity-list" style="margin-top: 10px;">
          ${this.composePieces.map((piece) => `
            <button class="map-entity-btn ${piece.id === this.selectedComposePieceId ? 'active' : ''}" data-compose-piece-id="${escapeHtml(piece.id)}" type="button">
              ${escapeHtml(`${piece.sourceMapName} @ (${piece.x},${piece.y}) · ${piece.rotation}°`)}
            </button>
          `).join('') || '<div class="editor-note">暂无拼图块。</div>'}
        </div>
      </section>
      <div class="editor-note" style="margin-top: 8px;">
        当前烘焙只写入地块，不自动带入子图里的传送点、NPC、怪物、灵气和地标，避免把内部逻辑一并拼进大图。
      </div>
    `;
  }

/** renderPortalTab：执行对应的业务逻辑。 */
  private renderPortalTab(selectedPoint: { x: number; y: number } | null): string {
    if (!this.draft) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">传送点</div>
            <div class="editor-section-note">可从列表选中，也可直接在地图上拖动移动。</div>
          </div>
          <button class="small-btn" type="button" data-map-action="add-portal">新建传送点</button>
        </div>
        <div class="map-entity-list">
          ${this.draft.portals.map((portal, index) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'portal' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="portal" data-entity-index="${index}" type="button">
              ${escapeHtml(`${portal.hidden ? '隐藏' : ''}${portal.kind === 'stairs' ? '楼梯' : '传送阵'} (${portal.x},${portal.y}) -> ${this.formatMapTargetLabel(portal.targetMapId)}`)}
            </button>
          `).join('') || '<div class="editor-note">暂无传送点。</div>'}
        </div>
      </section>
      ${this.selectedEntity?.kind === 'portal'
        ? this.renderSelectedEntitySection(selectedPoint)
        : '<div class="editor-note">选中一个传送点后可在下方编辑属性。</div>'}
    `;
  }

/** renderNpcTab：执行对应的业务逻辑。 */
  private renderNpcTab(selectedPoint: { x: number; y: number } | null): string {
    if (!this.draft) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">NPC</div>
            <div class="editor-section-note">选中后可直接拖动位置，也可继续改属性。</div>
          </div>
          <button class="small-btn" type="button" data-map-action="add-npc">新建 NPC</button>
        </div>
        <div class="map-entity-list">
          ${this.draft.npcs.map((npc, index) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'npc' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="npc" data-entity-index="${index}" type="button">
              ${escapeHtml(`${npc.name || npc.id} @ (${npc.x},${npc.y})`)}
            </button>
          `).join('') || '<div class="editor-note">暂无 NPC。</div>'}
        </div>
      </section>
      ${this.selectedEntity?.kind === 'npc'
        ? this.renderSelectedEntitySection(selectedPoint)
        : '<div class="editor-note">选中一个 NPC 后可在下方编辑属性。</div>'}
    `;
  }

/** renderMonsterTab：执行对应的业务逻辑。 */
  private renderMonsterTab(selectedPoint: { x: number; y: number } | null): string {
    if (!this.draft) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">怪物刷新点</div>
            <div class="editor-section-note">支持在地图中拖动移动生成点。</div>
          </div>
          <button class="small-btn" type="button" data-map-action="add-monster">新建怪物点</button>
        </div>
        <div class="map-entity-list">
          ${this.draft.monsterSpawns.map((spawn, index) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'monster' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="monster" data-entity-index="${index}" type="button">
              ${escapeHtml(`${spawn.name || spawn.id} @ (${spawn.x},${spawn.y})`)}
            </button>
          `).join('') || '<div class="editor-note">暂无怪物刷新点。</div>'}
        </div>
      </section>
      ${this.selectedEntity?.kind === 'monster'
        ? this.renderSelectedEntitySection(selectedPoint)
        : '<div class="editor-note">选中一个怪物刷新点后可在下方编辑属性。</div>'}
    `;
  }

/** renderAuraTab：执行对应的业务逻辑。 */
  private renderAuraTab(selectedPoint: { x: number; y: number } | null): string {
    if (!this.draft) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">无属性灵气点</div>
            <div class="editor-section-note">切到工具面板后可选等级直接笔刷，0 表示清除。</div>
          </div>
          <button class="small-btn" type="button" data-map-action="add-aura">新建灵气点</button>
        </div>
        <div class="map-entity-list">
          ${(this.draft.auras ?? []).map((point, index) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'aura' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="aura" data-entity-index="${index}" type="button">
              ${escapeHtml(`(${point.x},${point.y}) ${formatAuraPointLabel(point.value)}`)}
            </button>
          `).join('') || '<div class="editor-note">暂无灵气点。</div>'}
        </div>
      </section>
      ${this.selectedEntity?.kind === 'aura'
        ? this.renderSelectedEntitySection(selectedPoint)
        : '<div class="editor-note">选中一个无属性灵气点后可在下方编辑属性。</div>'}
    `;
  }

/** renderResourceTab：执行对应的业务逻辑。 */
  private renderResourceTab(selectedPoint: { x: number; y: number } | null): string {
    if (!this.draft) return '';
/** uniqueKeys：定义该变量以承载业务值。 */
    const uniqueKeys = [...new Set((this.draft.resources ?? []).map((point) => getResourceRecordKey(point)).filter(Boolean))]
      .sort((left, right) => {
/** sortKeyCompare：定义该变量以承载业务值。 */
        const sortKeyCompare = getResourceTypeSortKey(left).localeCompare(getResourceTypeSortKey(right), 'zh-CN');
        return sortKeyCompare !== 0 ? sortKeyCompare : left.localeCompare(right, 'zh-CN');
      });
/** resourceGroups：定义该变量以承载业务值。 */
    const resourceGroups = uniqueKeys.map((resourceKey) => ({
      resourceKey,
      label: formatResourceTypeLabel(resourceKey),
      items: (this.draft?.resources ?? [])
        .map((point, index) => ({ point, index }))
        .filter(({ point }) => getResourceRecordKey(point) === resourceKey)
        .sort((left, right) => (
          left.point.y - right.point.y
          || left.point.x - right.point.x
          || left.index - right.index
        )),
    }));
/** selectedResource：定义该变量以承载业务值。 */
    const selectedResource = this.selectedEntity?.kind === 'resource'
      ? this.draft.resources?.[this.selectedEntity.index]
      : null;
/** selectedResourceKey：定义该变量以承载业务值。 */
    const selectedResourceKey = selectedResource ? getResourceRecordKey(selectedResource) : this.resourcePaintKey;
/** currentBrushLabel：定义该变量以承载业务值。 */
    const currentBrushLabel = `${formatResourceTypeLabel(this.resourcePaintKey || selectedResourceKey)} ${formatAuraLevelText(this.resourcePaintValue)}`;
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">气机点</div>
            <div class="editor-section-note">可编辑任意资源键，同格允许并存多个气机条目。</div>
          </div>
          <button class="small-btn" type="button" data-map-action="add-resource">新建气机点</button>
        </div>
        <div class="map-form-grid compact" style="margin-bottom: 10px;">
          <label class="map-field">
            <span>画笔资源键</span>
            <input data-map-ui="resourcePaintKey" value="${escapeHtml(this.resourcePaintKey)}" />
          </label>
          <label class="map-field">
            <span>画笔值</span>
            <input data-map-ui="resourcePaintValue" type="number" min="0" value="${this.resourcePaintValue}" />
          </label>
        </div>
        <div class="button-row" style="margin-bottom: 10px;">
          <button class="small-btn" type="button" data-map-action="apply-resource-brush-key">应用到画笔</button>
        </div>
        <div class="editor-note" style="margin-bottom: 10px;">已存在资源种类：${escapeHtml(uniqueKeys.length > 0 ? uniqueKeys.map((resourceKey) => formatResourceTypeLabel(resourceKey)).join('、') : '无')}</div>
        ${resourceGroups.length > 0
          ? resourceGroups.map((group) => `
            <div class="editor-note" style="margin: 10px 0 6px;">${escapeHtml(group.label)}</div>
            <div class="map-entity-list">
              ${group.items.map(({ point, index }) => `
                <button class="map-entity-btn ${this.selectedEntity?.kind === 'resource' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="resource" data-entity-index="${index}" type="button">
                  ${escapeHtml(`(${point.x},${point.y}) ${formatResourcePointLabel(point)}`)}
                </button>
              `).join('')}
            </div>
          `).join('')
          : '<div class="editor-note">暂无气机点。</div>'}
      </section>
      ${this.selectedEntity?.kind === 'resource'
        ? this.renderSelectedEntitySection(selectedPoint)
        : '<div class="editor-note">选中一个气机点后可在下方编辑属性。</div>'}
      <div class="editor-note" style="margin-top: 8px;">当前画笔：${escapeHtml(currentBrushLabel)}</div>
    `;
  }

/** renderSafeZoneTab：执行对应的业务逻辑。 */
  private renderSafeZoneTab(selectedPoint: { x: number; y: number } | null): string {
    if (!this.draft) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">安全区</div>
            <div class="editor-section-note">玩家站在安全区内时无法主动发起攻击。范围显示与怪物点类似，可直接拖动中心点。</div>
          </div>
          <button class="small-btn" type="button" data-map-action="add-safe-zone">新建安全区</button>
        </div>
        <div class="map-entity-list">
          ${(this.draft.safeZones ?? []).map((zone, index) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'safeZone' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="safeZone" data-entity-index="${index}" type="button">
              ${escapeHtml(`中心 (${zone.x},${zone.y}) · 半径 ${zone.radius}`)}
            </button>
          `).join('') || '<div class="editor-note">暂无安全区。</div>'}
        </div>
      </section>
      ${this.selectedEntity?.kind === 'safeZone'
        ? this.renderSelectedEntitySection(selectedPoint)
        : '<div class="editor-note">选中一个安全区后可在下方编辑半径。</div>'}
    `;
  }

/** renderLandmarkTab：执行对应的业务逻辑。 */
  private renderLandmarkTab(selectedPoint: { x: number; y: number } | null): string {
    if (!this.draft) return '';
/** landmarks：定义该变量以承载业务值。 */
    const landmarks = (this.draft.landmarks ?? []).flatMap((landmark, index) => landmark.container ? [] : [{ landmark, index }]);
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">地标</div>
            <div class="editor-section-note">用于区域名和地图标识，也支持拖动位置。可搜索家具类容器请到“容器”页配置。</div>
          </div>
          <button class="small-btn" type="button" data-map-action="add-landmark">新建地标</button>
        </div>
        <div class="map-entity-list">
          ${landmarks.map(({ landmark, index }) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'landmark' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="landmark" data-entity-index="${index}" type="button">
              ${escapeHtml(`${landmark.name || landmark.id} @ (${landmark.x},${landmark.y})`)}
            </button>
          `).join('') || '<div class="editor-note">暂无地标。</div>'}
        </div>
      </section>
      ${this.selectedEntity?.kind === 'landmark'
        ? this.renderSelectedEntitySection(selectedPoint)
        : '<div class="editor-note">选中一个地标后可在下方编辑属性。</div>'}
    `;
  }

/** renderContainerTab：执行对应的业务逻辑。 */
  private renderContainerTab(selectedPoint: { x: number; y: number } | null): string {
    if (!this.draft) return '';
/** containers：定义该变量以承载业务值。 */
    const containers = this.getContainerLandmarks();
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">容器</div>
            <div class="editor-section-note">容器实际挂在地标下，这里单独抽出，便于配置展示外观、搜索阶次与随机池。</div>
          </div>
          <button class="small-btn" type="button" data-map-action="add-container">新建容器</button>
        </div>
        <div class="map-entity-list">
          ${containers.map(({ landmark, index }) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'container' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="container" data-entity-index="${index}" type="button">
              ${escapeHtml(`${landmark.name || landmark.id} @ (${landmark.x},${landmark.y}) · ${landmark.container?.char || '箱'} · ${TECHNIQUE_GRADE_LABELS[landmark.container?.grade ?? 'mortal'] ?? (landmark.container?.grade ?? 'mortal')}`)}
            </button>
          `).join('') || '<div class="editor-note">暂无容器。</div>'}
        </div>
      </section>
      ${this.selectedEntity?.kind === 'container'
        ? this.renderSelectedEntitySection(selectedPoint)
        : '<div class="editor-note">选中一个容器后可在下方编辑随机池。</div>'}
    `;
  }

/** renderSelectedEntitySection：执行对应的业务逻辑。 */
  private renderSelectedEntitySection(selectedPoint: { x: number; y: number } | null): string {
    if (!this.draft || !this.selectedEntity) {
      return `
        <section class="editor-section">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">对象属性</div>
              <div class="editor-section-note">先从上面的对象列表里选中一个。</div>
            </div>
          </div>
          <div class="editor-note">当前没有选中的传送点、NPC、怪物刷新点、无属性灵气点、气机点、安全区、地标或容器。</div>
        </section>
      `;
    }

    if (this.selectedEntity.kind === 'portal') {
/** portal：定义该变量以承载业务值。 */
      const portal = this.draft.portals[this.selectedEntity.index];
      if (!portal) return '';
/** portalKind：定义该变量以承载业务值。 */
      const portalKind = portal.kind === 'stairs' ? 'stairs' : 'portal';
/** portalTrigger：定义该变量以承载业务值。 */
      const portalTrigger = portal.trigger ?? (portalKind === 'stairs' ? 'auto' : 'manual');
      return `
        <section class="editor-section">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">传送点属性</div>
              <div class="editor-section-note">格子 ${selectedPoint ? `(${selectedPoint.x}, ${selectedPoint.y})` : '-'}</div>
            </div>
            <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
          </div>
          <div class="map-form-grid">
            ${numberField('X', `portals.${this.selectedEntity.index}.x`, portal.x)}
            ${numberField('Y', `portals.${this.selectedEntity.index}.y`, portal.y)}
            ${selectField('类型', `portals.${this.selectedEntity.index}.kind`, portalKind, [
              { value: 'portal', label: '传送阵' },
              { value: 'stairs', label: '楼梯' },
            ])}
            ${selectField('触发', `portals.${this.selectedEntity.index}.trigger`, portalTrigger, [
              { value: 'manual', label: '手动' },
              { value: 'auto', label: '自动' },
            ])}
            ${selectField('路网域', `portals.${this.selectedEntity.index}.routeDomain`, portal.routeDomain ?? 'inherit', PORTAL_ROUTE_DOMAIN_OPTIONS)}
            ${booleanField('允许玩家重叠', `portals.${this.selectedEntity.index}.allowPlayerOverlap`, portal.allowPlayerOverlap, 'wide')}
            ${booleanField('隐藏入口', `portals.${this.selectedEntity.index}.hidden`, portal.hidden, 'wide')}
            ${textField('目标地图', `portals.${this.selectedEntity.index}.targetMapId`, portal.targetMapId)}
            ${numberField('目标 X', `portals.${this.selectedEntity.index}.targetX`, portal.targetX)}
            ${numberField('目标 Y', `portals.${this.selectedEntity.index}.targetY`, portal.targetY)}
            ${textField('观察标题', `portals.${this.selectedEntity.index}.observeTitle`, portal.observeTitle, 'wide')}
            ${textField('观察说明', `portals.${this.selectedEntity.index}.observeDesc`, portal.observeDesc, 'wide')}
          </div>
        </section>
      `;
    }

    if (this.selectedEntity.kind === 'npc') {
/** npcIndex：定义该变量以承载业务值。 */
      const npcIndex = this.selectedEntity.index;
/** npc：定义该变量以承载业务值。 */
      const npc = this.draft.npcs[npcIndex];
      if (!npc) return '';
      return `
        <section class="editor-section">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">NPC 属性</div>
              <div class="editor-section-note">任务已迁移到独立章节文件，这里只维护 NPC 本身的地图属性。</div>
            </div>
            <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
          </div>
          <div class="map-form-grid">
            ${textField('ID', `npcs.${npcIndex}.id`, npc.id)}
            ${textField('名称', `npcs.${npcIndex}.name`, npc.name)}
            ${numberField('X', `npcs.${npcIndex}.x`, npc.x)}
            ${numberField('Y', `npcs.${npcIndex}.y`, npc.y)}
            ${textField('显示字', `npcs.${npcIndex}.char`, npc.char)}
            ${textField('颜色', `npcs.${npcIndex}.color`, npc.color)}
            ${textField('角色类型', `npcs.${npcIndex}.role`, npc.role)}
            ${textField('对白', `npcs.${npcIndex}.dialogue`, npc.dialogue, 'wide')}
          </div>
          <div class="editor-note" style="margin-top: 12px;">任务请改到 <code>legacy/server/data/content/quests/</code> 下对应章节文件，例如 <code>第一章_主线.json</code>、<code>第一章_支线.json</code>。</div>
        </section>
      `;
    }

    if (this.selectedEntity.kind === 'monster') {
/** spawn：定义该变量以承载业务值。 */
      const spawn = this.draft.monsterSpawns[this.selectedEntity.index];
      if (!spawn) return '';
      return `
        <section class="editor-section">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">怪物刷新点属性</div>
              <div class="editor-section-note">地图里只维护模板引用、可选等级/品阶覆盖，以及生成与漫游参数。名称、显示字、基础属性都来自怪物模板。</div>
            </div>
            <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
          </div>
          <div class="map-form-grid">
            ${textField('怪物 ID', `monsterSpawns.${this.selectedEntity.index}.id`, spawn.id)}
            ${numberField('X', `monsterSpawns.${this.selectedEntity.index}.x`, spawn.x)}
            ${numberField('Y', `monsterSpawns.${this.selectedEntity.index}.y`, spawn.y)}
            ${readonlyField('名称', spawn.name || '未匹配到怪物模板')}
            ${readonlyField('显示字', spawn.char || '-')}
            ${readonlyField('颜色', spawn.color || '-')}
            ${nullableNumberField('等级覆盖', `monsterSpawns.${this.selectedEntity.index}.level`, spawn.level)}
            ${nullableSelectField('品阶覆盖', `monsterSpawns.${this.selectedEntity.index}.grade`, spawn.grade, MONSTER_GRADE_OVERRIDE_OPTIONS)}
            ${nullableNumberField('生成数量', `monsterSpawns.${this.selectedEntity.index}.count`, spawn.count)}
            ${nullableNumberField('生成半径', `monsterSpawns.${this.selectedEntity.index}.radius`, spawn.radius)}
            ${nullableNumberField('最大维持数量', `monsterSpawns.${this.selectedEntity.index}.maxAlive`, spawn.maxAlive)}
            ${nullableNumberField('重生时间(秒)', `monsterSpawns.${this.selectedEntity.index}.respawnTicks`, spawn.respawnTicks ?? spawn.respawnSec)}
            ${nullableNumberField('分布范围', `monsterSpawns.${this.selectedEntity.index}.wanderRadius`, spawn.wanderRadius ?? spawn.radius)}
          </div>
          <div class="editor-note">留空时跟随怪物模板；分布范围留空时默认等于生成半径。要改名字、显示字、基础属性、移动速度或索敌半径，请改怪物模板。</div>
        </section>
      `;
    }

    if (this.selectedEntity.kind === 'safeZone') {
/** zone：定义该变量以承载业务值。 */
      const zone = this.draft.safeZones?.[this.selectedEntity.index];
      if (!zone) return '';
      return `
        <section class="editor-section">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">安全区属性</div>
              <div class="editor-section-note">格子 ${selectedPoint ? `(${selectedPoint.x}, ${selectedPoint.y})` : '-'} · 只限制玩家从区内主动发起攻击。</div>
            </div>
            <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
          </div>
          <div class="map-form-grid">
            ${numberField('中心 X', `safeZones.${this.selectedEntity.index}.x`, zone.x)}
            ${numberField('中心 Y', `safeZones.${this.selectedEntity.index}.y`, zone.y)}
            ${numberField('半径', `safeZones.${this.selectedEntity.index}.radius`, zone.radius)}
          </div>
        </section>
      `;
    }

    if (this.selectedEntity.kind === 'container') {
/** selectedIndex：定义该变量以承载业务值。 */
      const selectedIndex = this.selectedEntity.index;
/** containerLandmark：定义该变量以承载业务值。 */
      const containerLandmark = this.getContainerLandmark(selectedIndex);
      if (!containerLandmark || !containerLandmark.container) return '';
/** container：定义该变量以承载业务值。 */
      const container = containerLandmark.container;
/** poolRows：定义该变量以承载业务值。 */
      const poolRows = (container.lootPools ?? []).map((pool, poolIndex) => `
        <section class="editor-section" style="margin-top: 12px;">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">随机池 ${poolIndex + 1}</div>
              <div class="editor-section-note">等级/品阶为筛选条件，tag 组按“每行至少命中一项”组合筛选。</div>
            </div>
            <button class="small-btn danger" type="button" data-map-action="remove-container-pool" data-pool-index="${poolIndex}">删除随机池</button>
          </div>
          <div class="map-form-grid">
            ${nullableNumberField('抽取次数', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.rolls`, pool.rolls)}
            ${nullableDecimalField('触发概率', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.chance`, pool.chance)}
            ${nullableNumberField('最低等级', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.minLevel`, pool.minLevel)}
            ${nullableNumberField('最高等级', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.maxLevel`, pool.maxLevel)}
            ${nullableSelectField('最低品阶', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.minGrade`, pool.minGrade, [
              { value: '', label: '不限' },
              ...MONSTER_GRADE_OPTIONS,
            ])}
            ${nullableSelectField('最高品阶', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.maxGrade`, pool.maxGrade, [
              { value: '', label: '不限' },
              ...MONSTER_GRADE_OPTIONS,
            ])}
            ${nullableNumberField('最小数量', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.countMin`, pool.countMin)}
            ${nullableNumberField('最大数量', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.countMax`, pool.countMax)}
            ${booleanField('允许重复', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.allowDuplicates`, pool.allowDuplicates, 'wide')}
            ${textareaField('Tag 组', `landmarks.${selectedIndex}.container.lootPools.${poolIndex}.tagGroups`, formatTagGroups(pool.tagGroups), 'wide', 'tag-groups')}
          </div>
        </section>
      `).join('');

      return `
        <section class="editor-section">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">容器属性</div>
              <div class="editor-section-note">格子 ${selectedPoint ? `(${selectedPoint.x}, ${selectedPoint.y})` : '-'} · 底层仍保存为地标 + container。</div>
            </div>
            <button class="small-btn danger" type="button" data-map-action="remove-selected">删除容器</button>
          </div>
          <div class="map-form-grid">
            ${textField('ID', `landmarks.${selectedIndex}.id`, containerLandmark.id)}
            ${textField('名称', `landmarks.${selectedIndex}.name`, containerLandmark.name)}
            ${numberField('X', `landmarks.${selectedIndex}.x`, containerLandmark.x)}
            ${numberField('Y', `landmarks.${selectedIndex}.y`, containerLandmark.y)}
            ${textField('资源节点 ID', `landmarks.${selectedIndex}.resourceNodeId`, containerLandmark.resourceNodeId)}
            ${textField('显示字', `landmarks.${selectedIndex}.container.char`, container.char)}
            ${textField('颜色', `landmarks.${selectedIndex}.container.color`, container.color)}
            ${selectField('搜索阶次', `landmarks.${selectedIndex}.container.grade`, container.grade ?? 'mortal', MONSTER_GRADE_OPTIONS)}
            ${nullableNumberField('刷新 ticks', `landmarks.${selectedIndex}.container.refreshTicks`, container.refreshTicks)}
            ${textareaField('说明', `landmarks.${selectedIndex}.desc`, containerLandmark.desc, 'wide')}
          </div>
          <div class="button-row" style="margin-top: 10px;">
            <button class="small-btn" type="button" data-map-action="add-container-pool">新增随机池</button>
          </div>
          <div class="editor-note" style="margin-top: 12px;">${escapeHtml(this.buildContainerTagHint())}</div>
        </section>
        ${poolRows || '<div class="editor-note">当前没有随机池，点上方“新增随机池”添加。</div>'}
      `;
    }

/** aura：定义该变量以承载业务值。 */
    const aura = this.draft.auras?.[this.selectedEntity.index];
    if (this.selectedEntity.kind === 'aura') {
      if (!aura) return '';
      return `
        <section class="editor-section">
          <div class="editor-section-head">
          <div>
            <div class="editor-section-title">无属性灵气点属性</div>
            <div class="editor-section-note">用于配置可自动回补的无属性灵气。</div>
          </div>
            <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
          </div>
          <div class="map-form-grid">
            ${numberField('X', `auras.${this.selectedEntity.index}.x`, aura.x)}
            ${numberField('Y', `auras.${this.selectedEntity.index}.y`, aura.y)}
            ${numberField('灵气值', `auras.${this.selectedEntity.index}.value`, aura.value)}
          </div>
        </section>
      `;
    }

    if (this.selectedEntity.kind === 'resource') {
/** resource：定义该变量以承载业务值。 */
      const resource = this.draft.resources?.[this.selectedEntity.index];
      if (!resource) return '';
/** resourceKey：定义该变量以承载业务值。 */
      const resourceKey = getResourceRecordKey(resource);
/** resourceKeyName：定义该变量以承载业务值。 */
      const resourceKeyName = getResourceRecordKeyName(resource);
      return `
        <section class="editor-section">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">气机点属性</div>
              <div class="editor-section-note">同格可并存多个不同资源键。</div>
            </div>
            <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
          </div>
          <div class="map-form-grid">
            ${numberField('X', `resources.${this.selectedEntity.index}.x`, resource.x)}
            ${numberField('Y', `resources.${this.selectedEntity.index}.y`, resource.y)}
            ${textField('资源键', `resources.${this.selectedEntity.index}.${resourceKeyName}`, resourceKey, 'wide')}
            ${numberField('数值', `resources.${this.selectedEntity.index}.value`, resource.value)}
          </div>
        </section>
      `;
    }

/** landmark：定义该变量以承载业务值。 */
    const landmark = this.draft.landmarks?.[this.selectedEntity.index];
    if (!landmark) return '';
    return `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">地标属性</div>
            <div class="editor-section-note">用于区域名、提示文本和地图标识。</div>
          </div>
          <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
        </div>
        <div class="map-form-grid">
          ${textField('ID', `landmarks.${this.selectedEntity.index}.id`, landmark.id)}
          ${textField('名称', `landmarks.${this.selectedEntity.index}.name`, landmark.name)}
          ${numberField('X', `landmarks.${this.selectedEntity.index}.x`, landmark.x)}
          ${numberField('Y', `landmarks.${this.selectedEntity.index}.y`, landmark.y)}
          ${textField('资源节点 ID', `landmarks.${this.selectedEntity.index}.resourceNodeId`, landmark.resourceNodeId)}
          ${textField('说明', `landmarks.${this.selectedEntity.index}.desc`, landmark.desc, 'wide')}
        </div>
      </section>
    `;
  }

/** describeSelectedEntity：执行对应的业务逻辑。 */
  private describeSelectedEntity(): string {
/** selectedComposePiece：定义该变量以承载业务值。 */
    const selectedComposePiece = this.getSelectedComposePiece();
    if (selectedComposePiece) {
      return `拼图块 ${selectedComposePiece.sourceMapName} ${selectedComposePiece.rotation}°`;
    }
    if (!this.draft || !this.selectedEntity) {
      return '无';
    }
    if (this.selectedEntity.kind === 'portal') {
/** portal：定义该变量以承载业务值。 */
      const portal = this.draft.portals[this.selectedEntity.index];
      return portal ? `${portal.kind === 'stairs' ? '楼梯' : '传送阵'} (${portal.x}, ${portal.y}) -> ${this.formatMapTargetLabel(portal.targetMapId)}` : '无';
    }
    if (this.selectedEntity.kind === 'npc') {
/** npc：定义该变量以承载业务值。 */
      const npc = this.draft.npcs[this.selectedEntity.index];
      return npc ? `NPC ${npc.name || npc.id}` : '无';
    }
    if (this.selectedEntity.kind === 'monster') {
/** spawn：定义该变量以承载业务值。 */
      const spawn = this.draft.monsterSpawns[this.selectedEntity.index];
      return spawn ? `怪物 ${spawn.name || spawn.id}` : '无';
    }
    if (this.selectedEntity.kind === 'aura') {
/** aura：定义该变量以承载业务值。 */
      const aura = this.draft.auras?.[this.selectedEntity.index];
      return aura ? formatAuraPointLabel(aura.value) : '无';
    }
    if (this.selectedEntity.kind === 'resource') {
/** resource：定义该变量以承载业务值。 */
      const resource = this.draft.resources?.[this.selectedEntity.index];
      return resource ? formatResourcePointLabel(resource) : '无';
    }
    if (this.selectedEntity.kind === 'safeZone') {
/** zone：定义该变量以承载业务值。 */
      const zone = this.draft.safeZones?.[this.selectedEntity.index];
      return zone ? `安全区 半径 ${zone.radius}` : '无';
    }
    if (this.selectedEntity.kind === 'container') {
/** landmark：定义该变量以承载业务值。 */
      const landmark = this.getContainerLandmark(this.selectedEntity.index);
      return landmark ? `容器 ${landmark.name || landmark.id}` : '无';
    }
/** landmark：定义该变量以承载业务值。 */
    const landmark = this.draft.landmarks?.[this.selectedEntity.index];
    return landmark ? `地标 ${landmark.name || landmark.id}` : '无';
  }

/** findComposePieceAt：执行对应的业务逻辑。 */
  private findComposePieceAt(x: number, y: number): MapComposePiece | null {
    for (let index = this.composePieces.length - 1; index >= 0; index -= 1) {
      const piece = this.composePieces[index]!;
      const bounds = this.getComposePieceBounds(piece);
      if (!bounds) continue;
      if (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height) {
        return piece;
      }
    }
    return null;
  }

  private getAuraAt(x: number, y: number): { x: number; y: number; value: number } | null {
    if (!this.draft) return null;
    return this.draft.auras?.find((point) => point.x === x && point.y === y) ?? null;
  }

/** getResourcesAt：执行对应的业务逻辑。 */
  private getResourcesAt(x: number, y: number): TileResourcePoint[] {
    if (!this.draft) return [];
    return (this.draft.resources ?? []).filter((point) => point.x === x && point.y === y);
  }

/** formatMapTargetLabel：执行对应的业务逻辑。 */
  private formatMapTargetLabel(mapId: string): string {
/** target：定义该变量以承载业务值。 */
    const target = this.mapList.find((map) => map.id === mapId);
    if (!target) {
      return mapId;
    }
    return target.name && target.name !== mapId
      ? `${target.name} (${mapId})`
      : target.name || mapId;
  }

  private getContainerLandmarks(): Array<{ landmark: GmMapLandmarkRecord; index: number }> {
    if (!this.draft) {
      return [];
    }
    return (this.draft.landmarks ?? [])
      .flatMap((landmark, index) => landmark.container ? [{ landmark, index }] : []);
  }

/** getContainerLandmark：执行对应的业务逻辑。 */
  private getContainerLandmark(index: number): GmMapLandmarkRecord | null {
    if (!this.draft) {
      return null;
    }
/** landmark：定义该变量以承载业务值。 */
    const landmark = this.draft.landmarks?.[index];
    return landmark?.container ? landmark : null;
  }

/** getAvailableItemTags：执行对应的业务逻辑。 */
  private getAvailableItemTags(): string[] {
    return [...new Set(this.itemCatalog.flatMap((item) => item.tags ?? []))]
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }

/** buildContainerTagHint：执行对应的业务逻辑。 */
  private buildContainerTagHint(): string {
/** tags：定义该变量以承载业务值。 */
    const tags = this.getAvailableItemTags();
    if (tags.length === 0) {
      return '标签来源于物品目录。每行一组，组内用逗号分隔；同一随机池会同时满足每一行至少一个 tag。';
    }
/** preview：定义该变量以承载业务值。 */
    const preview = tags.slice(0, 40).join('、');
/** suffix：定义该变量以承载业务值。 */
    const suffix = tags.length > 40 ? ` 等 ${tags.length} 个` : '';
    return `每行一组，组内用逗号分隔；同一随机池会同时满足每一行至少一个 tag。当前可用 tag：${preview}${suffix}`;
  }

/** handleUiFieldChange：执行对应的业务逻辑。 */
  private handleUiFieldChange(field: string, value: string): void {
    if (field === 'resizeWidth') {
      this.resizeWidth = Math.max(1, Math.floor(Number(value) || 1));
      return;
    }
    if (field === 'resizeHeight') {
      this.resizeHeight = Math.max(1, Math.floor(Number(value) || 1));
      return;
    }
    if (field === 'resizeFill') {
      this.resizeFillTileType = value as TileType;
      return;
    }
    if (field === 'composeSourceMapId') {
      this.composeSourceMapId = value.trim();
      this.renderInspector();
      return;
    }
    if (field === 'resourcePaintKey') {
      this.resourcePaintKey = value.trim();
      this.renderInspector();
      return;
    }
    if (field === 'resourcePaintValue') {
      this.resourcePaintValue = Math.max(0, Math.floor(Number(value) || 0));
      this.renderInspector();
    }
  }

  private syncInspectorToDraft(): { ok: true } | { ok: false; message: string } {
    if (!this.draft) {
      return { ok: false, message: '当前没有地图草稿' };
    }
/** previousJson：定义该变量以承载业务值。 */
    const previousJson = formatJson(this.draft);
/** next：定义该变量以承载业务值。 */
    const next = clone(this.draft);
/** fields：定义该变量以承载业务值。 */
    const fields = this.inspectorEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-map-bind]');
    for (const field of Array.from(fields)) {
      const path = field.dataset.mapBind;
      const kind = field.dataset.mapKind;
      if (!path || !kind) continue;
/** value：定义该变量以承载业务值。 */
      let value: unknown;
      if (kind === 'number') {
/** num：定义该变量以承载业务值。 */
        const num = Number(field.value || '0');
        if (!Number.isFinite(num)) {
          return { ok: false, message: `${path} 不是合法数字` };
        }
        value = Math.floor(num);
      } else if (kind === 'float') {
/** num：定义该变量以承载业务值。 */
        const num = Number(field.value || '0');
        if (!Number.isFinite(num)) {
          return { ok: false, message: `${path} 不是合法数字` };
        }
        value = num;
      } else if (kind === 'nullable-number') {
        if (!field.value.trim()) {
          value = undefined;
        } else {
/** num：定义该变量以承载业务值。 */
          const num = Number(field.value);
          if (!Number.isFinite(num)) {
            return { ok: false, message: `${path} 不是合法数字` };
          }
          value = Math.floor(num);
        }
      } else if (kind === 'nullable-float') {
        if (!field.value.trim()) {
          value = undefined;
        } else {
/** num：定义该变量以承载业务值。 */
          const num = Number(field.value);
          if (!Number.isFinite(num)) {
            return { ok: false, message: `${path} 不是合法数字` };
          }
          value = num;
        }
      } else if (kind === 'boolean') {
        value = field.value === 'true';
      } else if (kind === 'nullable-string') {
        value = field.value === '' ? undefined : field.value;
      } else if (kind === 'tag-groups') {
        value = parseTagGroups(field.value);
      } else if (kind === 'json') {
        try {
          value = field.value.trim() ? JSON.parse(field.value) : [];
        } catch {
          return { ok: false, message: `${path} 的 JSON 解析失败` };
        }
      } else {
        value = field.value;
      }
      setValueByPath(next, path, value);
    }
/** nextJson：定义该变量以承载业务值。 */
    const nextJson = formatJson(next);
    if (nextJson === previousJson) {
      return { ok: true };
    }
    this.captureUndoState();
    this.draft = next;
    this.dirty = true;
    this.jsonEl.value = nextJson;
    this.updateUndoButtonState();
    return { ok: true };
  }

/** handleAction：执行对应的业务逻辑。 */
  private handleAction(action: string, trigger: HTMLElement): void {
    if (!this.draft) return;
/** synced：定义该变量以承载业务值。 */
    const synced = this.syncInspectorToDraft();
    if ('message' in synced) {
      this.setStatus(synced.message, true);
      return;
    }

    switch (action) {
      case 'pick-tile':
        if (this.selectedCell) {
          this.paintTileType = this.getTileTypeAt(this.selectedCell.x, this.selectedCell.y);
          this.renderToolControls();
          this.renderInspector();
        }
        return;
      case 'set-spawn':
        if (this.selectedCell) {
          this.captureUndoState();
          this.draft.spawnPoint = { ...this.selectedCell };
          this.markDirty();
        }
        return;
      case 'move-selected':
        this.moveSelectedEntityToCurrentCell();
        return;
      case 'compose-add-piece':
        this.addComposePiece().catch(() => {});
        return;
      case 'compose-rotate-left':
        this.rotateSelectedComposePiece(false);
        return;
      case 'compose-rotate-right':
        this.rotateSelectedComposePiece(true);
        return;
      case 'compose-remove-piece':
        this.removeSelectedComposePiece();
        return;
      case 'compose-clear-pieces':
        this.clearComposePieces();
        return;
      case 'compose-bake-selected':
        this.bakeSelectedComposePiece();
        return;
      case 'compose-bake-all':
        this.bakeAllComposePieces();
        return;
      case 'add-portal':
        this.currentInspectorTab = 'portal';
        this.addPortalAtCurrentCell();
        return;
      case 'add-npc':
        this.currentInspectorTab = 'npc';
        this.addNpcAtCurrentCell();
        return;
      case 'add-npc-quest':
        this.addQuestToSelectedNpc();
        return;
      case 'add-monster':
        this.currentInspectorTab = 'monster';
        this.addMonsterAtCurrentCell();
        return;
      case 'add-aura':
        this.currentInspectorTab = 'aura';
        this.addAuraAtCurrentCell();
        return;
      case 'add-resource':
        this.currentInspectorTab = 'resource';
        this.addResourceAtCurrentCell();
        return;
      case 'apply-resource-brush-key':
        this.applyResourceBrushKey();
        return;
      case 'add-safe-zone':
        this.currentInspectorTab = 'safeZone';
        this.addSafeZoneAtCurrentCell();
        return;
      case 'add-landmark':
        this.currentInspectorTab = 'landmark';
        this.addLandmarkAtCurrentCell();
        return;
      case 'add-container':
        this.currentInspectorTab = 'container';
        this.addContainerAtCurrentCell();
        return;
      case 'add-container-pool':
        this.addLootPoolToSelectedContainer();
        return;
      case 'remove-container-pool':
        this.removeLootPoolFromSelectedContainer(Number(trigger.dataset.poolIndex ?? '-1'));
        return;
      case 'remove-selected':
        this.removeSelectedEntity();
        return;
      case 'remove-npc-quest':
        this.removeQuestFromSelectedNpc(Number(trigger.dataset.questIndex ?? '-1'));
        return;
      case 'resize':
        this.applyResize();
        return;
      default:
        if (trigger.dataset.entityKind) {
          this.renderInspector();
        }
    }
  }

/** addPortalAtCurrentCell：执行对应的业务逻辑。 */
  private addPortalAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    if (!this.ensureWalkableSelection('传送点')) return;
    this.captureUndoState();
/** targetMapId：定义该变量以承载业务值。 */
    const targetMapId = this.mapList.find((map) => map.id !== this.draft!.id)?.id ?? this.draft!.id;
    this.draft!.portals.push({
      x,
      y,
      targetMapId,
      targetX: 0,
      targetY: 0,
      kind: 'portal',
      trigger: 'manual',
      routeDomain: 'inherit',
      allowPlayerOverlap: false,
      hidden: false,
      observeTitle: '',
      observeDesc: '',
    });
    this.selectedEntity = { kind: 'portal', index: this.draft!.portals.length - 1 };
    this.markDirty();
  }

/** ensureComposeSourceMap：执行对应的业务逻辑。 */
  private async ensureComposeSourceMap(sourceMapId: string): Promise<GmMapDocument> {
/** cached：定义该变量以承载业务值。 */
    const cached = this.composeSourceCache.get(sourceMapId);
    if (cached) {
      return cached;
    }
/** data：定义该变量以承载业务值。 */
    const data = await this.request<GmMapDetailRes>(`${this.mapApiBasePath}/${encodeURIComponent(sourceMapId)}`);
/** map：定义该变量以承载业务值。 */
    const map = clone(data.map);
    this.composeSourceCache.set(sourceMapId, map);
    return map;
  }

  private getComposePieceSize(piece: MapComposePiece): { width: number; height: number } | null {
/** source：定义该变量以承载业务值。 */
    const source = this.composeSourceCache.get(piece.sourceMapId);
    if (!source) return null;
/** interiorWidth：定义该变量以承载业务值。 */
    const interiorWidth = Math.max(0, source.width - 2);
/** interiorHeight：定义该变量以承载业务值。 */
    const interiorHeight = Math.max(0, source.height - 2);
    if (piece.rotation === 90 || piece.rotation === 270) {
      return { width: interiorHeight, height: interiorWidth };
    }
    return { width: interiorWidth, height: interiorHeight };
  }

  private getComposePieceBounds(piece: MapComposePiece): { x: number; y: number; width: number; height: number } | null {
/** size：定义该变量以承载业务值。 */
    const size = this.getComposePieceSize(piece);
    if (!size) return null;
    return {
      x: piece.x,
      y: piece.y,
      width: size.width,
      height: size.height,
    };
  }

/** clampComposePiecePosition：执行对应的业务逻辑。 */
  private clampComposePiecePosition(piece: MapComposePiece): MapComposePiece {
    if (!this.draft) return piece;
/** size：定义该变量以承载业务值。 */
    const size = this.getComposePieceSize(piece);
    if (!size) return piece;
    return {
      ...piece,
      x: Math.min(Math.max(0, piece.x), Math.max(0, this.draft.width - size.width)),
      y: Math.min(Math.max(0, piece.y), Math.max(0, this.draft.height - size.height)),
    };
  }

/** getSelectedComposePiece：执行对应的业务逻辑。 */
  private getSelectedComposePiece(): MapComposePiece | null {
    if (!this.selectedComposePieceId) return null;
    return this.composePieces.find((piece) => piece.id === this.selectedComposePieceId) ?? null;
  }

/** addComposePiece：执行对应的业务逻辑。 */
  private async addComposePiece(): Promise<void> {
    if (!this.draft) return;
/** sourceMapId：定义该变量以承载业务值。 */
    const sourceMapId = this.composeSourceMapId.trim();
    if (!sourceMapId) {
      this.setStatus('请先选择来源地图', true);
      return;
    }
    if (sourceMapId === this.draft.id) {
      this.setStatus('不能把当前地图自己当成拼图块', true);
      return;
    }
/** source：定义该变量以承载业务值。 */
    const source = await this.ensureComposeSourceMap(sourceMapId);
/** anchor：定义该变量以承载业务值。 */
    const anchor = this.selectedCell
      ? { ...this.selectedCell }
      : { x: Math.max(0, Math.floor(this.draft.width / 2) - 2), y: Math.max(0, Math.floor(this.draft.height / 2) - 2) };
/** piece：定义该变量以承载业务值。 */
    const piece = this.clampComposePiecePosition({
      id: `compose_${this.composePieceCounter}`,
      sourceMapId,
      sourceMapName: source.name,
      x: anchor.x,
      y: anchor.y,
      rotation: 0,
    });
    this.composePieceCounter += 1;
    this.captureUndoState();
    this.composePieces.push(piece);
    this.selectedComposePieceId = piece.id;
    this.selectedEntity = null;
    this.currentInspectorTab = 'compose';
    this.selectedCell = { x: piece.x, y: piece.y };
    this.renderInspector();
    this.setStatus(`已加入拼图块：${source.name}`);
  }

  private updateComposePiece(pieceId: string, updater: (piece: MapComposePiece) => MapComposePiece): boolean {
/** index：定义该变量以承载业务值。 */
    const index = this.composePieces.findIndex((piece) => piece.id === pieceId);
    if (index < 0) return false;
    this.composePieces[index] = this.clampComposePiecePosition(updater(this.composePieces[index]!));
    return true;
  }

/** rotateSelectedComposePiece：执行对应的业务逻辑。 */
  private rotateSelectedComposePiece(clockwise: boolean): void {
/** selected：定义该变量以承载业务值。 */
    const selected = this.getSelectedComposePiece();
    if (!selected) {
      this.setStatus('请先选中一个拼图块', true);
      return;
    }
    this.captureUndoState();
    this.updateComposePiece(selected.id, (piece) => ({
      ...piece,
      rotation: clockwise ? rotateComposeClockwise(piece.rotation) : rotateComposeCounterClockwise(piece.rotation),
    }));
/** updated：定义该变量以承载业务值。 */
    const updated = this.getSelectedComposePiece();
    if (updated) {
      this.selectedCell = { x: updated.x, y: updated.y };
    }
    this.renderInspector();
    this.setStatus(`已${clockwise ? '右转' : '左转'}拼图块 90°`);
  }

/** removeSelectedComposePiece：执行对应的业务逻辑。 */
  private removeSelectedComposePiece(): void {
/** selected：定义该变量以承载业务值。 */
    const selected = this.getSelectedComposePiece();
    if (!selected) {
      this.setStatus('请先选中一个拼图块', true);
      return;
    }
    this.captureUndoState();
    this.composePieces = this.composePieces.filter((piece) => piece.id !== selected.id);
    this.selectedComposePieceId = null;
    this.renderInspector();
    this.setStatus(`已删除拼图块：${selected.sourceMapName}`);
  }

/** clearComposePieces：执行对应的业务逻辑。 */
  private clearComposePieces(): void {
    if (this.composePieces.length === 0) {
      this.setStatus('当前没有拼图块');
      return;
    }
    this.captureUndoState();
    this.composePieces = [];
    this.selectedComposePieceId = null;
    this.renderInspector();
    this.setStatus('已清空全部拼图块');
  }

  private forEachComposePieceTile(
    piece: MapComposePiece,
    visitor: (targetX: number, targetY: number, sourceChar: string) => void,
  ): void {
/** source：定义该变量以承载业务值。 */
    const source = this.composeSourceCache.get(piece.sourceMapId);
    if (!source) return;
/** interiorWidth：定义该变量以承载业务值。 */
    const interiorWidth = Math.max(0, source.width - 2);
/** interiorHeight：定义该变量以承载业务值。 */
    const interiorHeight = Math.max(0, source.height - 2);
    for (let sourceY = 1; sourceY < source.height - 1; sourceY += 1) {
      const row = [...source.tiles[sourceY]!];
      for (let sourceX = 1; sourceX < source.width - 1; sourceX += 1) {
        const localX = sourceX - 1;
        const localY = sourceY - 1;
/** targetOffsetX：定义该变量以承载业务值。 */
        let targetOffsetX = localX;
/** targetOffsetY：定义该变量以承载业务值。 */
        let targetOffsetY = localY;
        switch (piece.rotation) {
          case 90:
            targetOffsetX = interiorHeight - 1 - localY;
            targetOffsetY = localX;
            break;
          case 180:
            targetOffsetX = interiorWidth - 1 - localX;
            targetOffsetY = interiorHeight - 1 - localY;
            break;
          case 270:
            targetOffsetX = localY;
            targetOffsetY = interiorWidth - 1 - localX;
            break;
          default:
            break;
        }
        visitor(piece.x + targetOffsetX, piece.y + targetOffsetY, row[sourceX]!);
      }
    }
  }

/** bakeComposePiece：执行对应的业务逻辑。 */
  private bakeComposePiece(piece: MapComposePiece, recordUndo: boolean): number {
    if (!this.draft) return 0;
/** changed：定义该变量以承载业务值。 */
    const changed = new Map<number, string[]>();
/** changedCount：定义该变量以承载业务值。 */
    let changedCount = 0;
    this.forEachComposePieceTile(piece, (targetX, targetY, sourceChar) => {
      if (targetX < 0 || targetY < 0 || targetX >= this.draft!.width || targetY >= this.draft!.height) {
        return;
      }
/** row：定义该变量以承载业务值。 */
      const row = changed.get(targetY) ?? [...(this.draft!.tiles[targetY] ?? '')];
      if (row[targetX] === sourceChar) {
        changed.set(targetY, row);
        return;
      }
      row[targetX] = sourceChar;
      changed.set(targetY, row);
      changedCount += 1;
    });
    if (changedCount === 0) {
      return 0;
    }
    if (recordUndo) {
      this.captureUndoState();
    }
    for (const [y, row] of changed) {
      this.draft.tiles[y] = row.join('');
    }
    return changedCount;
  }

/** bakeSelectedComposePiece：执行对应的业务逻辑。 */
  private bakeSelectedComposePiece(): void {
/** selected：定义该变量以承载业务值。 */
    const selected = this.getSelectedComposePiece();
    if (!selected) {
      this.setStatus('请先选中一个拼图块', true);
      return;
    }
/** changed：定义该变量以承载业务值。 */
    const changed = this.bakeComposePiece(selected, true);
    if (changed <= 0) {
      this.setStatus('选中拼图块没有产生地块变化');
      return;
    }
    this.composePieces = this.composePieces.filter((piece) => piece.id !== selected.id);
    this.selectedComposePieceId = null;
    this.markDirty();
    this.setStatus(`已烘焙拼图块：${selected.sourceMapName}`);
  }

/** bakeAllComposePieces：执行对应的业务逻辑。 */
  private bakeAllComposePieces(): void {
    if (!this.draft || this.composePieces.length === 0) {
      this.setStatus('当前没有可烘焙的拼图块', true);
      return;
    }
    this.captureUndoState();
/** changed：定义该变量以承载业务值。 */
    let changed = 0;
    for (const piece of this.composePieces) {
      changed += this.bakeComposePiece(piece, false);
    }
    if (changed <= 0) {
      this.undoStack.pop();
      this.updateUndoButtonState();
      this.setStatus('全部拼图块都没有产生地块变化');
      return;
    }
    this.composePieces = [];
    this.selectedComposePieceId = null;
    this.markDirty();
    this.setStatus(`已烘焙全部拼图块，共写入 ${changed} 个格子`);
  }

/** addNpcAtCurrentCell：执行对应的业务逻辑。 */
  private addNpcAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    if (!this.ensureWalkableSelection('NPC')) return;
    this.captureUndoState();
    this.draft!.npcs.push({
      id: `npc_${this.draft!.id}_${this.draft!.npcs.length + 1}`,
      name: '新 NPC',
      x,
      y,
      char: '人',
      color: '#d6d0c4',
      dialogue: '',
      role: 'scene',
      quests: [],
    });
    this.selectedEntity = { kind: 'npc', index: this.draft!.npcs.length - 1 };
    this.markDirty();
  }

/** addQuestToSelectedNpc：执行对应的业务逻辑。 */
  private addQuestToSelectedNpc(): void {
    if (!this.draft || this.selectedEntity?.kind !== 'npc') {
      return;
    }
/** npc：定义该变量以承载业务值。 */
    const npc = this.draft.npcs[this.selectedEntity.index];
    if (!npc) {
      return;
    }
    this.captureUndoState();
    npc.quests = npc.quests ?? [];
    npc.quests.push(createDefaultQuestRecord(npc, npc.quests.length));
    this.markDirty();
  }

/** removeQuestFromSelectedNpc：执行对应的业务逻辑。 */
  private removeQuestFromSelectedNpc(index: number): void {
    if (!this.draft || this.selectedEntity?.kind !== 'npc' || index < 0) {
      return;
    }
/** npc：定义该变量以承载业务值。 */
    const npc = this.draft.npcs[this.selectedEntity.index];
    if (!npc?.quests || index >= npc.quests.length) {
      return;
    }
    this.captureUndoState();
    npc.quests.splice(index, 1);
    this.markDirty();
  }

/** addMonsterAtCurrentCell：执行对应的业务逻辑。 */
  private addMonsterAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    if (!this.ensureWalkableSelection('怪物刷新点')) return;
    this.captureUndoState();
/** fallbackId：定义该变量以承载业务值。 */
    const fallbackId = this.selectedEntity?.kind === 'monster'
      ? this.draft!.monsterSpawns[this.selectedEntity.index]?.id
      : this.draft!.monsterSpawns[0]?.id;
    this.draft!.monsterSpawns.push({
      id: fallbackId ?? '',
      x,
      y,
    });
    this.selectedEntity = { kind: 'monster', index: this.draft!.monsterSpawns.length - 1 };
    if (!fallbackId) {
      this.setStatus('新怪物点已创建，请先填写一个已存在的怪物 ID', true);
    }
    this.markDirty();
  }

/** addAuraAtCurrentCell：执行对应的业务逻辑。 */
  private addAuraAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
/** changed：定义该变量以承载业务值。 */
    const changed = this.applyAuraPaint([{ x, y }], true, 1);
    if (!changed) return;
/** index：定义该变量以承载业务值。 */
    const index = this.draft!.auras?.findIndex((point) => point.x === x && point.y === y) ?? -1;
    if (index >= 0) {
      this.selectedEntity = { kind: 'aura', index };
    }
    this.markDirty();
  }

/** applyResourceBrushKey：执行对应的业务逻辑。 */
  private applyResourceBrushKey(): void {
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.resourcePaintKey.trim();
    if (!normalized) {
      this.setStatus('资源键不能为空', true);
      return;
    }
    this.resourcePaintKey = normalized;
    this.setStatus(`已设置气机画笔资源键：${normalized}`);
    this.renderInspector();
  }

/** addResourceAtCurrentCell：执行对应的业务逻辑。 */
  private addResourceAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
/** normalizedKey：定义该变量以承载业务值。 */
    const normalizedKey = this.resourcePaintKey.trim();
    if (!normalizedKey) {
      this.setStatus('请先填写气机资源键', true);
      return;
    }
/** changed：定义该变量以承载业务值。 */
    const changed = this.applyResourcePaint([{ x, y }], true, this.resourcePaintValue, normalizedKey);
    if (!changed) return;
/** index：定义该变量以承载业务值。 */
    const index = this.findResourceIndex(x, y, normalizedKey);
    if (index >= 0) {
      this.selectedEntity = { kind: 'resource', index };
    }
    this.markDirty();
  }

/** addSafeZoneAtCurrentCell：执行对应的业务逻辑。 */
  private addSafeZoneAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    this.captureUndoState();
    this.draft!.safeZones = this.draft!.safeZones ?? [];
    this.draft!.safeZones.push({
      x,
      y,
      radius: 4,
    });
    this.selectedEntity = { kind: 'safeZone', index: this.draft!.safeZones.length - 1 };
    this.markDirty();
  }

/** addLandmarkAtCurrentCell：执行对应的业务逻辑。 */
  private addLandmarkAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    this.captureUndoState();
    this.draft!.landmarks = this.draft!.landmarks ?? [];
    this.draft!.landmarks.push({
      id: `landmark_${this.draft!.id}_${this.draft!.landmarks.length + 1}`,
      name: '新区标识',
      x,
      y,
      desc: '',
    });
    this.selectedEntity = { kind: 'landmark', index: this.draft!.landmarks.length - 1 };
    this.markDirty();
  }

/** addContainerAtCurrentCell：执行对应的业务逻辑。 */
  private addContainerAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    if (this.hasLandmarkAt(x, y)) {
      this.setStatus('目标格已有地标或容器，请先移动或删除原对象', true);
      return;
    }
    if (this.hasBlockingMapObjectAt(x, y)) {
      this.setStatus('目标格已有出生点、传送点、NPC 或怪物点，不能放置容器', true);
      return;
    }
    this.captureUndoState();
    this.draft!.landmarks = this.draft!.landmarks ?? [];
    this.draft!.landmarks.push({
      id: `container_${this.draft!.id}_${this.draft!.landmarks.length + 1}`,
      name: '新容器',
      x,
      y,
      desc: '',
      container: {
        grade: 'mortal',
        refreshTicks: 1800,
        char: '柜',
        color: '#8a6a4c',
        lootPools: [createDefaultContainerLootPool()],
      },
    });
    this.selectedEntity = { kind: 'container', index: this.draft!.landmarks.length - 1 };
    this.markDirty();
  }

/** addLootPoolToSelectedContainer：执行对应的业务逻辑。 */
  private addLootPoolToSelectedContainer(): void {
/** landmark：定义该变量以承载业务值。 */
    const landmark = this.selectedEntity?.kind === 'container'
      ? this.getContainerLandmark(this.selectedEntity.index)
      : null;
    if (!landmark?.container) {
      return;
    }
    this.captureUndoState();
    landmark.container.lootPools = landmark.container.lootPools ?? [];
    landmark.container.lootPools.push(createDefaultContainerLootPool());
    this.markDirty();
  }

/** removeLootPoolFromSelectedContainer：执行对应的业务逻辑。 */
  private removeLootPoolFromSelectedContainer(index: number): void {
/** landmark：定义该变量以承载业务值。 */
    const landmark = this.selectedEntity?.kind === 'container'
      ? this.getContainerLandmark(this.selectedEntity.index)
      : null;
    if (!landmark?.container?.lootPools || index < 0 || index >= landmark.container.lootPools.length) {
      return;
    }
    this.captureUndoState();
    landmark.container.lootPools.splice(index, 1);
    this.markDirty();
  }

/** moveSelectedEntityToCurrentCell：执行对应的业务逻辑。 */
  private moveSelectedEntityToCurrentCell(): void {
    if (!this.draft || !this.selectedEntity || !this.selectedCell) {
      this.setStatus('请先选中对象和目标格', true);
      return;
    }
/** moved：定义该变量以承载业务值。 */
    const moved = this.moveSelectedEntityToPoint(this.selectedCell.x, this.selectedCell.y, true, false);
    if (moved) {
      this.markDirty();
    }
  }

/** moveSelectedEntityToPoint：执行对应的业务逻辑。 */
  private moveSelectedEntityToPoint(x: number, y: number, recordUndo: boolean, silent: boolean): boolean {
    if (!this.draft || !this.selectedEntity) return false;
/** selection：定义该变量以承载业务值。 */
    const selection = this.selectedEntity;
/** currentPoint：定义该变量以承载业务值。 */
    const currentPoint = this.getSelectedEntityPoint();
    if (!currentPoint) return false;
    if (currentPoint.x === x && currentPoint.y === y) {
      return false;
    }

    if (selection.kind === 'aura') {
/** aura：定义该变量以承载业务值。 */
      const aura = this.draft.auras?.[selection.index];
      if (!aura) return false;
      if (this.hasAuraAt(x, y, selection.index)) {
        if (!silent) this.setStatus('目标格已有灵气点', true);
        return false;
      }
      if (recordUndo) this.captureUndoState();
      aura.x = x;
      aura.y = y;
      this.selectedCell = { x, y };
      this.markDirty(false);
      return true;
    }

    if (selection.kind === 'resource') {
/** resource：定义该变量以承载业务值。 */
      const resource = this.draft.resources?.[selection.index];
      if (!resource) return false;
/** resourceKey：定义该变量以承载业务值。 */
      const resourceKey = getResourceRecordKey(resource);
      if (this.hasResourceAt(x, y, resourceKey, selection.index)) {
        if (!silent) this.setStatus('目标格已有同资源键气机点', true);
        return false;
      }
      if (recordUndo) this.captureUndoState();
      resource.x = x;
      resource.y = y;
      this.selectedCell = { x, y };
      this.markDirty(false);
      return true;
    }

    if (selection.kind === 'safeZone') {
/** zone：定义该变量以承载业务值。 */
      const zone = this.draft.safeZones?.[selection.index];
      if (!zone) return false;
      if (recordUndo) this.captureUndoState();
      zone.x = x;
      zone.y = y;
      this.selectedCell = { x, y };
      this.markDirty(false);
      return true;
    }

    if (selection.kind === 'landmark') {
/** landmark：定义该变量以承载业务值。 */
      const landmark = this.draft.landmarks?.[selection.index];
      if (!landmark) return false;
      if (this.hasLandmarkAt(x, y, selection.index)) {
        if (!silent) this.setStatus('目标格已有地标', true);
        return false;
      }
      if (recordUndo) this.captureUndoState();
      landmark.x = x;
      landmark.y = y;
      this.selectedCell = { x, y };
      this.markDirty(false);
      return true;
    }

    if (selection.kind === 'container') {
/** landmark：定义该变量以承载业务值。 */
      const landmark = this.draft.landmarks?.[selection.index];
      if (!landmark?.container) return false;
      if (this.hasLandmarkAt(x, y, selection.index)) {
        if (!silent) this.setStatus('目标格已有地标', true);
        return false;
      }
      if (this.hasBlockingMapObjectAt(x, y)) {
        if (!silent) this.setStatus('目标格已有出生点或阻挡对象', true);
        return false;
      }
      if (recordUndo) this.captureUndoState();
      landmark.x = x;
      landmark.y = y;
      this.selectedCell = { x, y };
      this.markDirty(false);
      return true;
    }

    if (!isTileTypeWalkable(this.getTileTypeAt(x, y))) {
      if (!silent) this.setStatus('目标格不是可通行地块，无法放置对象', true);
      return false;
    }
    if (this.hasBlockingMapObjectAt(x, y, selection)) {
      if (!silent) this.setStatus('目标格已有出生点或阻挡对象', true);
      return false;
    }

    if (recordUndo) this.captureUndoState();
    if (selection.kind === 'portal') {
/** portal：定义该变量以承载业务值。 */
      const portal = this.draft.portals[selection.index];
      if (!portal) return false;
      portal.x = x;
      portal.y = y;
    } else if (selection.kind === 'npc') {
/** npc：定义该变量以承载业务值。 */
      const npc = this.draft.npcs[selection.index];
      if (!npc) return false;
      npc.x = x;
      npc.y = y;
    } else if (selection.kind === 'monster') {
/** spawn：定义该变量以承载业务值。 */
      const spawn = this.draft.monsterSpawns[selection.index];
      if (!spawn) return false;
      spawn.x = x;
      spawn.y = y;
    }
    this.selectedCell = { x, y };
    this.markDirty(false);
    return true;
  }

/** removeSelectedEntity：执行对应的业务逻辑。 */
  private removeSelectedEntity(): void {
    if (!this.draft || !this.selectedEntity) return;
    this.captureUndoState();
    if (this.selectedEntity.kind === 'portal') {
      removeArrayIndex(this.draft, 'portals', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'npc') {
      removeArrayIndex(this.draft, 'npcs', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'monster') {
      removeArrayIndex(this.draft, 'monsterSpawns', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'aura') {
      removeArrayIndex(this.draft, 'auras', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'resource') {
      removeArrayIndex(this.draft, 'resources', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'safeZone') {
      removeArrayIndex(this.draft, 'safeZones', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'container') {
      removeArrayIndex(this.draft, 'landmarks', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'landmark') {
      removeArrayIndex(this.draft, 'landmarks', this.selectedEntity.index);
    }
    this.selectedEntity = null;
    this.markDirty();
  }

/** applyResize：执行对应的业务逻辑。 */
  private applyResize(): void {
    if (!this.draft) return;
    this.captureUndoState();
/** width：定义该变量以承载业务值。 */
    const width = Math.max(1, this.resizeWidth);
/** height：定义该变量以承载业务值。 */
    const height = Math.max(1, this.resizeHeight);
/** fillChar：定义该变量以承载业务值。 */
    const fillChar = getMapCharFromTileType(this.resizeFillTileType);
/** nextTiles：定义该变量以承载业务值。 */
    const nextTiles: string[] = [];
    for (let y = 0; y < height; y += 1) {
      const chars: string[] = [];
      const oldRow = this.draft.tiles[y] ?? '';
      for (let x = 0; x < width; x += 1) {
        chars.push(oldRow[x] ?? fillChar);
      }
      nextTiles.push(chars.join(''));
    }
    this.draft.width = width;
    this.draft.height = height;
    this.draft.tiles = nextTiles;
    this.draft.portals = this.draft.portals.filter((portal) => portal.x < width && portal.y < height && portal.x >= 0 && portal.y >= 0);
    this.draft.npcs = this.draft.npcs.filter((npc) => npc.x < width && npc.y < height && npc.x >= 0 && npc.y >= 0);
    this.draft.monsterSpawns = this.draft.monsterSpawns.filter((spawn) => spawn.x < width && spawn.y < height && spawn.x >= 0 && spawn.y >= 0);
    this.draft.auras = (this.draft.auras ?? []).filter((point) => point.x < width && point.y < height && point.x >= 0 && point.y >= 0);
    this.draft.resources = (this.draft.resources ?? []).filter((point) => point.x < width && point.y < height && point.x >= 0 && point.y >= 0);
    this.draft.safeZones = (this.draft.safeZones ?? []).filter((zone) => zone.x < width && zone.y < height && zone.x >= 0 && zone.y >= 0);
    this.draft.landmarks = (this.draft.landmarks ?? []).filter((landmark) => landmark.x < width && landmark.y < height && landmark.x >= 0 && landmark.y >= 0);
    this.draft.spawnPoint = this.findNearestWalkable(this.clampPoint(this.draft.spawnPoint, width, height)) ?? this.clampPoint(this.draft.spawnPoint, width, height);
    this.selectedCell = this.clampPoint(this.selectedCell ?? this.draft.spawnPoint, width, height);
    this.markDirty();
  }

  private clampPoint(point: { x: number; y: number }, width: number, height: number): { x: number; y: number } {
    return {
      x: Math.min(width - 1, Math.max(0, point.x)),
      y: Math.min(height - 1, Math.max(0, point.y)),
    };
  }

  private findNearestWalkable(origin: { x: number; y: number }): { x: number; y: number } | null {
    if (!this.draft) return null;
    for (let radius = 0; radius <= Math.max(this.draft.width, this.draft.height); radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!isOffsetInRange(dx, dy, radius)) continue;
          const x = origin.x + dx;
/** y：定义该变量以承载业务值。 */
          const y = origin.y + dy;
          if (x < 0 || y < 0 || x >= this.draft.width || y >= this.draft.height) continue;
          if (isTileTypeWalkable(this.getTileTypeAt(x, y))) {
            return { x, y };
          }
        }
      }
    }
    return null;
  }

/** resetDraft：执行对应的业务逻辑。 */
  private resetDraft(): void {
    if (!this.selectedMapId) return;
    if (this.dirty && !window.confirm('确定放弃当前地图的未保存修改吗？')) {
      return;
    }
    this.loadMap(this.selectedMapId).catch(() => {});
  }

/** reloadCurrentMap：执行对应的业务逻辑。 */
  private async reloadCurrentMap(): Promise<void> {
    if (!this.selectedMapId) return;
    if (this.dirty && !window.confirm('当前有未保存修改，重新载入会丢失这些修改。继续吗？')) {
      return;
    }
    await this.loadMap(this.selectedMapId);
  }

/** applyRawJson：执行对应的业务逻辑。 */
  private applyRawJson(): void {
    if (!this.selectedMapId) return;
    try {
/** next：定义该变量以承载业务值。 */
      const next = JSON.parse(this.jsonEl.value) as GmMapDocument;
      if (this.draft) {
        this.captureUndoState();
      }
      this.draft = next;
      this.selectedMapId = next.id;
      this.resizeWidth = next.width;
      this.resizeHeight = next.height;
      this.selectedCell = { x: next.spawnPoint.x, y: next.spawnPoint.y };
    this.currentInspectorTab = 'selection';
    this.linePaintStart = null;
    this.dirty = true;
    this.composePieces = [];
    this.selectedComposePieceId = null;
    this.composeDragActive = false;
    this.centerView();
      this.renderInspector();
      this.renderMapList();
      this.setStatus('地图 JSON 已应用到可视化编辑区');
    } catch {
      this.setStatus('地图 JSON 解析失败', true);
    }
  }

/** saveCurrentMap：执行对应的业务逻辑。 */
  private async saveCurrentMap(): Promise<void> {
    if (!this.draft || !this.selectedMapId) {
      this.setStatus('请先选择地图', true);
      return;
    }
/** synced：定义该变量以承载业务值。 */
    const synced = this.syncInspectorToDraft();
    if ('message' in synced) {
      this.setStatus(synced.message, true);
      return;
    }
    this.saveBtn.disabled = true;
    try {
      await this.request<{ ok: true }>(`${this.mapApiBasePath}/${encodeURIComponent(this.selectedMapId)}`, {
        method: 'PUT',
        body: JSON.stringify({ map: this.draft } satisfies GmUpdateMapReq),
      });
      this.dirty = false;
      await this.loadMapList(true);
      await this.loadMap(this.selectedMapId, false);
      this.setStatus(`已保存地图 ${this.draft.name}`);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : '地图保存失败', true);
    } finally {
      this.saveBtn.disabled = false;
    }
  }

/** centerView：执行对应的业务逻辑。 */
  private centerView(): void {
    if (!this.draft) return;
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = this.getCellSize();
    this.viewCenterX = this.draft.width * cellSize / 2;
    this.viewCenterY = this.draft.height * cellSize / 2;
    this.renderCanvas();
  }

/** applyZoom：执行对应的业务逻辑。 */
  private applyZoom(delta: number): void {
/** oldSize：定义该变量以承载业务值。 */
    const oldSize = this.getCellSize();
/** gridCenterX：定义该变量以承载业务值。 */
    const gridCenterX = oldSize > 0 ? this.viewCenterX / oldSize : 0;
/** gridCenterY：定义该变量以承载业务值。 */
    const gridCenterY = oldSize > 0 ? this.viewCenterY / oldSize : 0;
/** direction：定义该变量以承载业务值。 */
    const direction = Math.sign(delta);
    if (direction === 0) return;
    this.zoomLevelIndex = Math.max(0, Math.min(EDITOR_ZOOM_LEVELS.length - 1, this.zoomLevelIndex + direction));
/** nextSize：定义该变量以承载业务值。 */
    const nextSize = this.getCellSize();
    this.viewCenterX = gridCenterX * nextSize;
    this.viewCenterY = gridCenterY * nextSize;
    this.renderCanvas();
  }

/** getCellSize：执行对应的业务逻辑。 */
  private getCellSize(): number {
    return EDITOR_BASE_CELL_SIZE * EDITOR_ZOOM_LEVELS[this.zoomLevelIndex];
  }

/** renderCanvas：执行对应的业务逻辑。 */
  private renderCanvas(): void {
    if (this.renderFrameId !== null) {
      return;
    }
    this.renderFrameId = window.requestAnimationFrame(() => {
      this.renderFrameId = null;
      this.flushCanvasRender();
    });
  }

/** flushCanvasRender：执行对应的业务逻辑。 */
  private flushCanvasRender(): void {
    this.resizeCanvas();
/** ctx：定义该变量以承载业务值。 */
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = '#1a1816';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.draft) return;
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = this.getCellSize();
/** screenW：定义该变量以承载业务值。 */
    const screenW = this.canvas.width;
/** screenH：定义该变量以承载业务值。 */
    const screenH = this.canvas.height;
/** camWorldX：定义该变量以承载业务值。 */
    const camWorldX = this.viewCenterX - screenW / 2;
/** camWorldY：定义该变量以承载业务值。 */
    const camWorldY = this.viewCenterY - screenH / 2;
/** startGX：定义该变量以承载业务值。 */
    const startGX = Math.floor(camWorldX / cellSize) - 1;
/** startGY：定义该变量以承载业务值。 */
    const startGY = Math.floor(camWorldY / cellSize) - 1;
/** endGX：定义该变量以承载业务值。 */
    const endGX = Math.ceil((camWorldX + screenW) / cellSize) + 1;
/** endGY：定义该变量以承载业务值。 */
    const endGY = Math.ceil((camWorldY + screenH) / cellSize) + 1;
/** auraPointKeys：定义该变量以承载业务值。 */
    const auraPointKeys = new Set((this.draft.auras ?? []).map((point) => `${point.x},${point.y}`));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = buildCanvasFont('tileGlyph', cellSize * 0.6);

    for (let gy = startGY; gy <= endGY; gy += 1) {
      for (let gx = startGX; gx <= endGX; gx += 1) {
        const sx = gx * cellSize - this.viewCenterX + screenW / 2;
        const sy = gy * cellSize - this.viewCenterY + screenH / 2;
        if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) continue;
        if (gx < 0 || gy < 0 || gx >= this.draft.width || gy >= this.draft.height) {
          ctx.fillStyle = '#0d0b0a';
          ctx.fillRect(sx, sy, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(255,255,255,0.02)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(sx, sy, cellSize, cellSize);
          continue;
        }

/** type：定义该变量以承载业务值。 */
        const type = this.getTileTypeAt(gx, gy);
        ctx.fillStyle = TILE_VISUAL_BG_COLORS[type];
        ctx.fillRect(sx, sy, cellSize, cellSize);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx, sy, cellSize, cellSize);

/** ch：定义该变量以承载业务值。 */
        const ch = TILE_VISUAL_GLYPHS[type];
        if (ch) {
          ctx.fillStyle = TILE_VISUAL_GLYPH_COLORS[type];
          ctx.fillText(ch, sx + cellSize / 2, sy + cellSize / 2 + 1);
        }

        if (auraPointKeys.has(`${gx},${gy}`)) {
          ctx.fillStyle = 'rgba(90, 170, 255, 0.18)';
          ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
        }

        if (this.getResourcesAt(gx, gy).length > 0) {
          ctx.fillStyle = 'rgba(247, 208, 96, 0.16)';
          ctx.fillRect(sx + 3, sy + 3, cellSize - 6, cellSize - 6);
        }

/** isLineStart：定义该变量以承载业务值。 */
        const isLineStart = this.linePaintStart?.x === gx && this.linePaintStart?.y === gy;
/** isSelected：定义该变量以承载业务值。 */
        const isSelected = this.selectedCell?.x === gx && this.selectedCell?.y === gy;
/** isHovered：定义该变量以承载业务值。 */
        const isHovered = this.hoveredCell?.x === gx && this.hoveredCell?.y === gy;
        if (isSelected || isHovered || isLineStart) {
          ctx.fillStyle = isSelected
            ? 'rgba(208, 76, 56, 0.26)'
            : isLineStart
              ? 'rgba(64, 120, 236, 0.2)'
              : 'rgba(212, 164, 71, 0.16)';
          ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
          ctx.strokeStyle = isSelected
            ? 'rgba(166, 37, 31, 0.96)'
            : isLineStart
              ? 'rgba(38, 84, 186, 0.92)'
              : 'rgba(123, 91, 20, 0.55)';
          ctx.lineWidth = isSelected || isLineStart ? 2 : 1;
          ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
        }
      }
    }

    this.drawComposePieces(ctx, screenW, screenH, cellSize);
    this.drawEntities(ctx, screenW, screenH, cellSize);
  }

/** drawComposePieces：执行对应的业务逻辑。 */
  private drawComposePieces(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number): void {
    if (!this.draft || this.composePieces.length === 0) return;
/** showLabels：定义该变量以承载业务值。 */
    const showLabels = cellSize >= 16;
    for (const piece of this.composePieces) {
      const bounds = this.getComposePieceBounds(piece);
      if (!bounds) continue;
/** isSelected：定义该变量以承载业务值。 */
      const isSelected = piece.id === this.selectedComposePieceId;
      this.forEachComposePieceTile(piece, (targetX, targetY, sourceChar) => {
        if (targetX < 0 || targetY < 0 || targetX >= this.draft!.width || targetY >= this.draft!.height) {
          return;
        }
/** sx：定义该变量以承载业务值。 */
        const sx = targetX * cellSize - this.viewCenterX + screenW / 2;
/** sy：定义该变量以承载业务值。 */
        const sy = targetY * cellSize - this.viewCenterY + screenH / 2;
        if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) return;
/** type：定义该变量以承载业务值。 */
        const type = getTileTypeFromMapChar(sourceChar);
        ctx.fillStyle = isSelected ? 'rgba(255, 214, 92, 0.2)' : 'rgba(124, 187, 255, 0.16)';
        ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
/** glyph：定义该变量以承载业务值。 */
        const glyph = TILE_VISUAL_GLYPHS[type];
        if (glyph) {
          ctx.fillStyle = isSelected ? '#ffe8a6' : TILE_VISUAL_GLYPH_COLORS[type];
          ctx.font = buildCanvasFont('tileGlyph', cellSize * 0.52);
          ctx.fillText(glyph, sx + cellSize / 2, sy + cellSize / 2 + 1);
        }
      });

/** boxX：定义该变量以承载业务值。 */
      const boxX = bounds.x * cellSize - this.viewCenterX + screenW / 2;
/** boxY：定义该变量以承载业务值。 */
      const boxY = bounds.y * cellSize - this.viewCenterY + screenH / 2;
/** boxW：定义该变量以承载业务值。 */
      const boxW = bounds.width * cellSize;
/** boxH：定义该变量以承载业务值。 */
      const boxH = bounds.height * cellSize;
      ctx.strokeStyle = isSelected ? 'rgba(255, 211, 84, 0.95)' : 'rgba(116, 187, 255, 0.75)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(boxX + 1, boxY + 1, boxW - 2, boxH - 2);

      if (!showLabels) continue;
/** label：定义该变量以承载业务值。 */
      const label = `${piece.sourceMapName} ${piece.rotation}°`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = buildCanvasFont('label', Math.max(11, cellSize * 0.28));
/** textWidth：定义该变量以承载业务值。 */
      const textWidth = ctx.measureText(label).width;
/** labelX：定义该变量以承载业务值。 */
      const labelX = boxX + 4;
/** labelY：定义该变量以承载业务值。 */
      const labelY = boxY - 10;
      ctx.fillStyle = 'rgba(15, 12, 10, 0.78)';
      ctx.fillRect(labelX - 3, labelY - 9, textWidth + 8, 18);
      ctx.fillStyle = isSelected ? '#ffe7a8' : '#d7efff';
      ctx.fillText(label, labelX + 1, labelY);
    }
  }

/** drawEntities：执行对应的业务逻辑。 */
  private drawEntities(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number): void {
    if (!this.draft) return;
/** showEntityLabels：定义该变量以承载业务值。 */
    const showEntityLabels = cellSize >= 18;
    if (this.selectedEntity?.kind === 'monster') {
/** selectedSpawn：定义该变量以承载业务值。 */
      const selectedSpawn = this.draft.monsterSpawns[this.selectedEntity.index];
      if (selectedSpawn) {
        this.drawMonsterSpawnOverlay(ctx, screenW, screenH, cellSize, selectedSpawn);
      }
    }
    if (this.selectedEntity?.kind === 'safeZone') {
/** selectedZone：定义该变量以承载业务值。 */
      const selectedZone = this.draft.safeZones?.[this.selectedEntity.index];
      if (selectedZone) {
        this.drawSafeZoneOverlay(ctx, screenW, screenH, cellSize, selectedZone);
      }
    }
/** drawEntity：定义该变量以承载业务值。 */
    const drawEntity = (
      wx: number,
      wy: number,
      char: string,
      color: string,
      name: string,
      kind: 'npc' | 'monster' | 'spawn' | 'container' | 'safeZone',
      labelColor?: string,
    ): void => {
/** sx：定义该变量以承载业务值。 */
      const sx = wx * cellSize - this.viewCenterX + screenW / 2;
/** sy：定义该变量以承载业务值。 */
      const sy = wy * cellSize - this.viewCenterY + screenH / 2;
      if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) return;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(sx + cellSize / 2, sy + cellSize - 3, cellSize * 0.32, cellSize * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, cellSize * 0.08);
      ctx.strokeStyle = 'rgba(15,12,10,0.9)';
      ctx.fillStyle = color;
      ctx.font = buildCanvasFont('entityGlyph', cellSize * 0.75);
      ctx.strokeText(char, sx + cellSize / 2, sy + cellSize / 2);
      ctx.fillText(char, sx + cellSize / 2, sy + cellSize / 2);
      if (!showEntityLabels) {
        return;
      }
      ctx.font = buildCanvasFont('label', cellSize * 0.3);
      ctx.strokeStyle = 'rgba(15,12,10,0.9)';
      ctx.fillStyle = kind === 'monster'
        ? '#ffddcc'
        : kind === 'spawn'
          ? '#fff0b0'
          : kind === 'safeZone'
            ? '#d7fff2'
            : kind === 'container'
              ? '#f5ddb0'
            : (labelColor ?? '#cce7ff');
      ctx.textBaseline = 'alphabetic';
      ctx.strokeText(name, sx + cellSize / 2, sy - Math.max(6, cellSize * 0.18));
      ctx.fillText(name, sx + cellSize / 2, sy - Math.max(6, cellSize * 0.18));
    };

/** drawLandmark：定义该变量以承载业务值。 */
    const drawLandmark = (landmark: GmMapLandmarkRecord): void => {
      if (!showEntityLabels) {
        return;
      }
/** sx：定义该变量以承载业务值。 */
      const sx = landmark.x * cellSize - this.viewCenterX + screenW / 2;
/** sy：定义该变量以承载业务值。 */
      const sy = landmark.y * cellSize - this.viewCenterY + screenH / 2;
      if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) return;
/** label：定义该变量以承载业务值。 */
      const label = landmark.name || landmark.id;
      if (!label) return;
/** anchorY：定义该变量以承载业务值。 */
      const anchorY = sy + cellSize + Math.max(12, cellSize * 0.34);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = buildCanvasFont('labelStrong', Math.max(12, cellSize * 0.34));
/** textWidth：定义该变量以承载业务值。 */
      const textWidth = ctx.measureText(label).width;
/** paddingX：定义该变量以承载业务值。 */
      const paddingX = Math.max(8, cellSize * 0.22);
/** boxHeight：定义该变量以承载业务值。 */
      const boxHeight = Math.max(20, cellSize * 0.52);
/** boxWidth：定义该变量以承载业务值。 */
      const boxWidth = textWidth + paddingX * 2;

      ctx.fillStyle = 'rgba(15,12,10,0.72)';
      ctx.fillRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
      ctx.strokeStyle = 'rgba(255, 226, 168, 0.72)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
      ctx.fillStyle = '#ffe7b8';
      ctx.fillText(label, sx + cellSize / 2, anchorY + 0.5);
    };

    drawEntity(this.draft.spawnPoint.x, this.draft.spawnPoint.y, '生', '#ffd27a', '出生点', 'spawn');
    this.draft.portals.forEach((portal) => {
/** isStairs：定义该变量以承载业务值。 */
      const isStairs = portal.kind === 'stairs';
      drawEntity(
        portal.x,
        portal.y,
        isStairs ? '阶' : '阵',
        isStairs ? '#d7b27c' : '#c8a2f2',
        `${isStairs ? '楼梯' : '传送'}:${this.formatMapTargetLabel(portal.targetMapId)}`,
        'npc',
      );
    });
    this.draft.npcs.forEach((npc) => drawEntity(npc.x, npc.y, npc.char || '人', npc.color || '#d6d0c4', npc.name || npc.id, 'npc'));
    this.draft.monsterSpawns.forEach((spawn) => drawEntity(spawn.x, spawn.y, spawn.char || '妖', spawn.color || '#d27a7a', spawn.name || spawn.id, 'monster'));
    (this.draft.auras ?? []).forEach((point) => drawEntity(point.x, point.y, '灵', '#77b8ff', formatAuraPointLabel(point.value), 'npc'));
    (this.draft.resources ?? []).forEach((point) => drawEntity(
      point.x,
      point.y,
      '炁',
      getResourcePointGlyphColor(point),
      formatResourcePointLabel(point),
      'npc',
      getResourcePointLabelColor(point),
    ));
    (this.draft.safeZones ?? []).forEach((zone) => drawEntity(zone.x, zone.y, '安', '#7ce5c6', `安全区:${zone.radius}`, 'safeZone'));
    (this.draft.landmarks ?? [])
      .filter((landmark) => landmark.container)
      .forEach((landmark) => drawEntity(
        landmark.x,
        landmark.y,
        landmark.container?.char?.trim() || '箱',
        landmark.container?.color?.trim() || '#c18b46',
        landmark.name || landmark.id,
        'container',
      ));
    (this.draft.landmarks ?? [])
      .filter((landmark) => !landmark.container)
      .forEach((landmark) => drawLandmark(landmark));
  }

  private drawMonsterSpawnOverlay(
    ctx: CanvasRenderingContext2D,
    screenW: number,
    screenH: number,
    cellSize: number,
    spawn: GmMapMonsterSpawnRecord,
  ): void {
    if (!this.draft) {
      return;
    }
/** spawnRadius：定义该变量以承载业务值。 */
    const spawnRadius = Math.max(0, Math.floor(spawn.radius ?? 0));
/** wanderRadius：定义该变量以承载业务值。 */
    const wanderRadius = Math.max(0, Math.floor(spawn.wanderRadius ?? spawn.radius ?? 0));
/** maxRadius：定义该变量以承载业务值。 */
    const maxRadius = Math.max(spawnRadius, wanderRadius);
    if (maxRadius <= 0) {
      return;
    }

/** drawCellOverlay：定义该变量以承载业务值。 */
    const drawCellOverlay = (
      x: number,
      y: number,
      fillStyle: string | null,
      strokeStyle: string | null,
      lineWidth: number,
    ): void => {
      if (x < 0 || y < 0 || x >= this.draft!.width || y >= this.draft!.height) {
        return;
      }
/** sx：定义该变量以承载业务值。 */
      const sx = x * cellSize - this.viewCenterX + screenW / 2;
/** sy：定义该变量以承载业务值。 */
      const sy = y * cellSize - this.viewCenterY + screenH / 2;
      if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) {
        return;
      }
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(sx, sy, cellSize, cellSize);
      }
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(sx + 0.5, sy + 0.5, cellSize - 1, cellSize - 1);
      }
    };

    for (let dy = -maxRadius; dy <= maxRadius; dy += 1) {
      for (let dx = -maxRadius; dx <= maxRadius; dx += 1) {
        if (!isOffsetInRange(dx, dy, maxRadius)) {
          continue;
        }
/** worldX：定义该变量以承载业务值。 */
        const worldX = spawn.x + dx;
/** worldY：定义该变量以承载业务值。 */
        const worldY = spawn.y + dy;
/** inSpawnRadius：定义该变量以承载业务值。 */
        const inSpawnRadius = spawnRadius > 0 && isOffsetInRange(dx, dy, spawnRadius);
/** inWanderRadius：定义该变量以承载业务值。 */
        const inWanderRadius = wanderRadius > 0 && isOffsetInRange(dx, dy, wanderRadius);
        if (!inSpawnRadius && !inWanderRadius) {
          continue;
        }
        drawCellOverlay(
          worldX,
          worldY,
          inSpawnRadius
            ? 'rgba(255, 182, 93, 0.22)'
            : 'rgba(96, 176, 152, 0.14)',
          null,
          0,
        );
      }
    }

/** outlineRadius：定义该变量以承载业务值。 */
    const outlineRadius = (radius: number, strokeStyle: string): void => {
      if (radius <= 0) {
        return;
      }
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!isOffsetInRange(dx, dy, radius) || isOffsetInRange(dx, dy, radius - 1)) {
            continue;
          }
          drawCellOverlay(
            spawn.x + dx,
            spawn.y + dy,
            null,
            strokeStyle,
            Math.max(1, cellSize >= 24 ? 2 : 1),
          );
        }
      }
    };

    outlineRadius(wanderRadius, 'rgba(110, 222, 184, 0.9)');
    outlineRadius(spawnRadius, 'rgba(255, 203, 122, 0.95)');
    drawCellOverlay(
      spawn.x,
      spawn.y,
      'rgba(255, 244, 180, 0.18)',
      'rgba(255, 244, 180, 0.95)',
      Math.max(1, cellSize >= 24 ? 2 : 1),
    );

    if (cellSize < 18) {
      return;
    }
/** sx：定义该变量以承载业务值。 */
    const sx = spawn.x * cellSize - this.viewCenterX + screenW / 2;
/** sy：定义该变量以承载业务值。 */
    const sy = spawn.y * cellSize - this.viewCenterY + screenH / 2;
/** summary：定义该变量以承载业务值。 */
    const summary = `生${spawnRadius} 漫${wanderRadius}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = buildCanvasFont('badge', Math.max(11, cellSize * 0.28));
/** paddingX：定义该变量以承载业务值。 */
    const paddingX = Math.max(7, cellSize * 0.18);
/** boxHeight：定义该变量以承载业务值。 */
    const boxHeight = Math.max(18, cellSize * 0.46);
/** boxWidth：定义该变量以承载业务值。 */
    const boxWidth = ctx.measureText(summary).width + paddingX * 2;
/** anchorY：定义该变量以承载业务值。 */
    const anchorY = sy + cellSize + Math.max(12, cellSize * 0.34);
    ctx.fillStyle = 'rgba(12, 18, 16, 0.78)';
    ctx.fillRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeStyle = 'rgba(171, 243, 214, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.fillStyle = '#e5fff5';
    ctx.fillText(summary, sx + cellSize / 2, anchorY + 0.5);
  }

  private drawSafeZoneOverlay(
    ctx: CanvasRenderingContext2D,
    screenW: number,
    screenH: number,
    cellSize: number,
    zone: GmMapSafeZoneRecord,
  ): void {
    if (!this.draft) {
      return;
    }
/** radius：定义该变量以承载业务值。 */
    const radius = Math.max(0, Math.floor(zone.radius ?? 0));

/** drawCellOverlay：定义该变量以承载业务值。 */
    const drawCellOverlay = (
      x: number,
      y: number,
      fillStyle: string | null,
      strokeStyle: string | null,
      lineWidth: number,
    ): void => {
      if (x < 0 || y < 0 || x >= this.draft!.width || y >= this.draft!.height) {
        return;
      }
/** sx：定义该变量以承载业务值。 */
      const sx = x * cellSize - this.viewCenterX + screenW / 2;
/** sy：定义该变量以承载业务值。 */
      const sy = y * cellSize - this.viewCenterY + screenH / 2;
      if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) {
        return;
      }
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(sx, sy, cellSize, cellSize);
      }
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(sx + 0.5, sy + 0.5, cellSize - 1, cellSize - 1);
      }
    };

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (!isOffsetInRange(dx, dy, radius)) {
          continue;
        }
        drawCellOverlay(
          zone.x + dx,
          zone.y + dy,
          'rgba(74, 209, 164, 0.18)',
          null,
          0,
        );
      }
    }

    if (radius > 0) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!isOffsetInRange(dx, dy, radius) || isOffsetInRange(dx, dy, radius - 1)) {
            continue;
          }
          drawCellOverlay(
            zone.x + dx,
            zone.y + dy,
            null,
            'rgba(141, 255, 221, 0.92)',
            Math.max(1, cellSize >= 24 ? 2 : 1),
          );
        }
      }
    }

    drawCellOverlay(
      zone.x,
      zone.y,
      'rgba(210, 255, 241, 0.22)',
      'rgba(210, 255, 241, 0.95)',
      Math.max(1, cellSize >= 24 ? 2 : 1),
    );

    if (cellSize < 18) {
      return;
    }
/** sx：定义该变量以承载业务值。 */
    const sx = zone.x * cellSize - this.viewCenterX + screenW / 2;
/** sy：定义该变量以承载业务值。 */
    const sy = zone.y * cellSize - this.viewCenterY + screenH / 2;
/** summary：定义该变量以承载业务值。 */
    const summary = `安${radius}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = buildCanvasFont('badge', Math.max(11, cellSize * 0.28));
/** paddingX：定义该变量以承载业务值。 */
    const paddingX = Math.max(7, cellSize * 0.18);
/** boxHeight：定义该变量以承载业务值。 */
    const boxHeight = Math.max(18, cellSize * 0.46);
/** boxWidth：定义该变量以承载业务值。 */
    const boxWidth = ctx.measureText(summary).width + paddingX * 2;
/** anchorY：定义该变量以承载业务值。 */
    const anchorY = sy + cellSize + Math.max(12, cellSize * 0.34);
    ctx.fillStyle = 'rgba(9, 22, 18, 0.8)';
    ctx.fillRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeStyle = 'rgba(141, 255, 221, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.fillStyle = '#eafff8';
    ctx.fillText(summary, sx + cellSize / 2, anchorY + 0.5);
  }

/** resizeCanvas：执行对应的业务逻辑。 */
  private resizeCanvas(): void {
/** width：定义该变量以承载业务值。 */
    const width = Math.max(1, Math.floor(this.canvasHost.clientWidth));
/** height：定义该变量以承载业务值。 */
    const height = Math.max(1, Math.floor(this.canvasHost.clientHeight));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

/** handleCanvasPointerDown：执行对应的业务逻辑。 */
  private handleCanvasPointerDown(event: PointerEvent): void {
/** point：定义该变量以承载业务值。 */
    const point = this.screenToGrid(event.clientX, event.clientY);
/** currentTool：定义该变量以承载业务值。 */
    const currentTool = this.getCurrentTool();
/** wantsPan：定义该变量以承载业务值。 */
    const wantsPan = event.button === 2 || (currentTool === 'pan' && event.button === 0);
    if (wantsPan) {
      this.panActive = true;
      this.dragEntityActive = false;
      this.paintActive = false;
      this.activePointerId = event.pointerId;
      this.activePanButtonMask = event.button === 2 ? 2 : 1;
      this.panStartClientX = event.clientX;
      this.panStartClientY = event.clientY;
      this.panStartCenterX = this.viewCenterX;
      this.panStartCenterY = this.viewCenterY;
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      this.renderCanvas();
      return;
    }
    if (event.button !== 0) return;
    if (!point) return;
    this.selectedCell = point;
/** hitComposePiece：定义该变量以承载业务值。 */
    const hitComposePiece = this.findComposePieceAt(point.x, point.y);
/** hitEntity：定义该变量以承载业务值。 */
    const hitEntity = this.findEntityAt(point.x, point.y);
    this.selectedComposePieceId = hitComposePiece?.id ?? null;
    this.selectedEntity = hitComposePiece ? null : hitEntity;
    if (currentTool === 'paint') {
      if (event.altKey && this.paintLayer === 'tile') {
        this.sampleTileAt(point.x, point.y);
        this.renderInspector();
        this.renderCanvas();
        return;
      }
      if (this.linePaintStart) {
        this.applyLinePaint(this.linePaintStart, point);
        this.linePaintStart = null;
        this.renderInspector();
        this.renderCanvas();
        return;
      }
      if (event.shiftKey) {
        this.linePaintStart = point;
        this.setStatus(`已设置线刷起点 (${point.x}, ${point.y})，再点终点即可整线填充`);
        this.renderInspector();
        this.renderCanvas();
        return;
      }
      this.activePointerId = event.pointerId;
      this.activePanButtonMask = 0;
      this.paintSessionHasUndoSnapshot = false;
      this.canvas.setPointerCapture(event.pointerId);
      this.paintActive = true;
/** changed：定义该变量以承载业务值。 */
      const changed = this.paintLayer === 'tile'
        ? this.paintTileAt(point.x, point.y, true)
        : this.paintLayer === 'aura'
          ? this.paintAuraAt(point.x, point.y, true)
          : this.paintResourceAt(point.x, point.y, true);
      this.paintSessionHasUndoSnapshot = changed;
      this.renderCanvas();
      return;
    }

    if (currentTool === 'select' && hitComposePiece) {
/** bounds：定义该变量以承载业务值。 */
      const bounds = this.getComposePieceBounds(hitComposePiece);
      this.currentInspectorTab = 'compose';
      this.activePointerId = event.pointerId;
      this.activePanButtonMask = 0;
      this.dragSessionHasUndoSnapshot = false;
      this.composeDragActive = true;
      this.dragEntityActive = false;
      this.paintActive = false;
      this.composeDragOffsetX = bounds ? point.x - bounds.x : 0;
      this.composeDragOffsetY = bounds ? point.y - bounds.y : 0;
      this.canvas.setPointerCapture(event.pointerId);
    } else if (currentTool === 'select' && hitEntity) {
      this.activePointerId = event.pointerId;
      this.activePanButtonMask = 0;
      this.dragSessionHasUndoSnapshot = false;
      this.dragEntityActive = true;
      this.composeDragActive = false;
      this.paintActive = false;
      this.canvas.setPointerCapture(event.pointerId);
    }
    this.renderInspector();
    this.renderCanvas();
  }

/** sampleTileAt：执行对应的业务逻辑。 */
  private sampleTileAt(x: number, y: number): void {
/** nextType：定义该变量以承载业务值。 */
    const nextType = this.getTileTypeAt(x, y);
    this.paintTileType = nextType;
    this.setStatus(`已吸取地块 ${TILE_TYPE_LABELS[nextType]} (${x}, ${y})`);
    this.renderToolControls();
  }

/** handleCanvasPointerMove：执行对应的业务逻辑。 */
  private handleCanvasPointerMove(event: PointerEvent): void {
/** point：定义该变量以承载业务值。 */
    const point = this.screenToGrid(event.clientX, event.clientY);
    this.hoveredCell = point;
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
    if (this.panActive) {
      if ((event.buttons & this.activePanButtonMask) === 0) {
        this.endPointerInteraction();
        return;
      }
      this.viewCenterX = this.panStartCenterX - (event.clientX - this.panStartClientX);
      this.viewCenterY = this.panStartCenterY - (event.clientY - this.panStartClientY);
      this.renderCanvas();
      return;
    }
    if (this.composeDragActive) {
      if ((event.buttons & 1) === 0) {
        this.endPointerInteraction();
        return;
      }
      if (point) {
        this.selectedCell = point;
/** piece：定义该变量以承载业务值。 */
        const piece = this.getSelectedComposePiece();
        if (piece) {
/** nextX：定义该变量以承载业务值。 */
          const nextX = point.x - this.composeDragOffsetX;
/** nextY：定义该变量以承载业务值。 */
          const nextY = point.y - this.composeDragOffsetY;
          if (piece.x !== nextX || piece.y !== nextY) {
            if (!this.dragSessionHasUndoSnapshot) {
              this.captureUndoState();
              this.dragSessionHasUndoSnapshot = true;
            }
            this.updateComposePiece(piece.id, (current) => ({ ...current, x: nextX, y: nextY }));
          }
        }
      }
      this.renderCanvas();
      return;
    }
    if (this.dragEntityActive) {
      if ((event.buttons & 1) === 0) {
        this.endPointerInteraction();
        return;
      }
      if (point) {
        this.selectedCell = point;
/** changed：定义该变量以承载业务值。 */
        const changed = this.moveSelectedEntityToPoint(point.x, point.y, !this.dragSessionHasUndoSnapshot, true);
        this.dragSessionHasUndoSnapshot = this.dragSessionHasUndoSnapshot || changed;
      }
      this.renderCanvas();
      return;
    }
    if (this.paintActive) {
      if ((event.buttons & 1) === 0) {
        this.endPointerInteraction();
        return;
      }
    }
    if (this.paintActive && point) {
/** changed：定义该变量以承载业务值。 */
      const changed = this.paintLayer === 'tile'
        ? this.paintTileAt(point.x, point.y, !this.paintSessionHasUndoSnapshot)
        : this.paintLayer === 'aura'
          ? this.paintAuraAt(point.x, point.y, !this.paintSessionHasUndoSnapshot)
          : this.paintResourceAt(point.x, point.y, !this.paintSessionHasUndoSnapshot);
      this.paintSessionHasUndoSnapshot = this.paintSessionHasUndoSnapshot || changed;
      this.renderCanvas();
      return;
    }
  }

/** endPointerInteraction：执行对应的业务逻辑。 */
  private endPointerInteraction(): void {
    if (this.activePointerId !== null && this.canvas.hasPointerCapture(this.activePointerId)) {
      this.canvas.releasePointerCapture(this.activePointerId);
    }
    if ((this.paintActive || this.dragEntityActive || this.composeDragActive) && this.draft) {
      this.renderInspector();
    }
    this.paintActive = false;
    this.dragEntityActive = false;
    this.composeDragActive = false;
    this.panActive = false;
    this.paintSessionHasUndoSnapshot = false;
    this.dragSessionHasUndoSnapshot = false;
    this.lastPaintKey = null;
    this.activePointerId = null;
    this.activePanButtonMask = 0;
    this.composeDragOffsetX = 0;
    this.composeDragOffsetY = 0;
    this.renderCanvas();
  }

  private screenToGrid(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.draft) return null;
/** rect：定义该变量以承载业务值。 */
    const rect = this.canvas.getBoundingClientRect();
/** sx：定义该变量以承载业务值。 */
    const sx = clientX - rect.left;
/** sy：定义该变量以承载业务值。 */
    const sy = clientY - rect.top;
    if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return null;
/** cellSize：定义该变量以承载业务值。 */
    const cellSize = this.getCellSize();
/** worldX：定义该变量以承载业务值。 */
    const worldX = sx + this.viewCenterX - rect.width / 2;
/** worldY：定义该变量以承载业务值。 */
    const worldY = sy + this.viewCenterY - rect.height / 2;
/** x：定义该变量以承载业务值。 */
    const x = Math.floor(worldX / cellSize);
/** y：定义该变量以承载业务值。 */
    const y = Math.floor(worldY / cellSize);
    if (x < 0 || y < 0 || x >= this.draft.width || y >= this.draft.height) return null;
    return { x, y };
  }

/** paintTileAt：执行对应的业务逻辑。 */
  private paintTileAt(x: number, y: number, recordUndo = false): boolean {
    if (!this.draft) return false;
/** key：定义该变量以承载业务值。 */
    const key = `${x},${y}`;
    if (this.lastPaintKey === key) return false;
    this.lastPaintKey = key;
    return this.applyTilePaint([{ x, y }], recordUndo) > 0;
  }

/** paintAuraAt：执行对应的业务逻辑。 */
  private paintAuraAt(x: number, y: number, recordUndo = false): boolean {
    if (!this.draft) return false;
/** key：定义该变量以承载业务值。 */
    const key = `${x},${y}`;
    if (this.lastPaintKey === key) return false;
    this.lastPaintKey = key;
    return this.applyAuraPaint([{ x, y }], recordUndo) > 0;
  }

/** paintResourceAt：执行对应的业务逻辑。 */
  private paintResourceAt(x: number, y: number, recordUndo = false): boolean {
    if (!this.draft) return false;
/** key：定义该变量以承载业务值。 */
    const key = `${x},${y},${this.resourcePaintKey}`;
    if (this.lastPaintKey === key) return false;
    this.lastPaintKey = key;
    return this.applyResourcePaint([{ x, y }], recordUndo) > 0;
  }

/** applyLinePaint：执行对应的业务逻辑。 */
  private applyLinePaint(start: GridPoint, end: GridPoint): void {
/** changed：定义该变量以承载业务值。 */
    const changed = this.paintLayer === 'tile'
      ? this.applyTilePaint(this.getLinePoints(start, end), true)
      : this.paintLayer === 'aura'
        ? this.applyAuraPaint(this.getLinePoints(start, end), true)
        : this.applyResourcePaint(this.getLinePoints(start, end), true);
    if (changed > 0) {
      this.setStatus(`已沿直线填充 ${changed} 个${this.paintLayer === 'tile' ? '格子' : this.paintLayer === 'aura' ? '无属性灵气点' : '气机点'}`);
    }
  }

/** applyTilePaint：执行对应的业务逻辑。 */
  private applyTilePaint(points: GridPoint[], recordUndo: boolean): number {
    if (!this.draft) return 0;
/** nextType：定义该变量以承载业务值。 */
    const nextType = this.paintTileType;
/** nextChar：定义该变量以承载业务值。 */
    const nextChar = getMapCharFromTileType(nextType);
/** changedPoints：定义该变量以承载业务值。 */
    const changedPoints: GridPoint[] = [];
/** visited：定义该变量以承载业务值。 */
    const visited = new Set<string>();
    for (const point of points) {
      const key = `${point.x},${point.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
/** currentType：定义该变量以承载业务值。 */
      const currentType = this.getTileTypeAt(point.x, point.y);
      if (currentType === nextType) continue;
      if (!isTileTypeWalkable(nextType) && this.hasBlockingMapObjectAt(point.x, point.y)) {
        this.setStatus('线刷路径上存在出生点或可交互对象，不能改成不可通行地块', true);
        return 0;
      }
      changedPoints.push(point);
    }
    if (changedPoints.length === 0) {
      return 0;
    }
    if (recordUndo) {
      this.captureUndoState();
    }
/** rows：定义该变量以承载业务值。 */
    const rows = new Map<number, string[]>();
    for (const point of changedPoints) {
      const row = rows.get(point.y) ?? [...(this.draft.tiles[point.y] ?? '')];
      row[point.x] = nextChar;
      rows.set(point.y, row);
    }
    for (const [y, row] of rows) {
      this.draft.tiles[y] = row.join('');
    }
    this.markDirty(false);
    return changedPoints.length;
  }

/** applyAuraPaint：执行对应的业务逻辑。 */
  private applyAuraPaint(points: GridPoint[], recordUndo: boolean, overrideValue?: number): number {
    if (!this.draft) return 0;
/** nextValue：定义该变量以承载业务值。 */
    const nextValue = Math.max(0, Math.floor(overrideValue ?? this.auraPaintValue));
/** selectedAuraPoint：定义该变量以承载业务值。 */
    const selectedAuraPoint = this.selectedEntity?.kind === 'aura' ? this.getSelectedEntityPoint() : null;
/** nextAuras：定义该变量以承载业务值。 */
    const nextAuras = [...(this.draft.auras ?? [])];
/** changedKeys：定义该变量以承载业务值。 */
    const changedKeys = new Set<string>();

    for (const point of points) {
      const key = `${point.x},${point.y}`;
      if (changedKeys.has(key)) continue;
/** index：定义该变量以承载业务值。 */
      const index = nextAuras.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y);
      if (nextValue === 0) {
        if (index >= 0) {
          nextAuras.splice(index, 1);
          changedKeys.add(key);
        }
        continue;
      }
      if (index >= 0) {
        if (nextAuras[index]!.value !== nextValue) {
          nextAuras[index] = { ...nextAuras[index]!, value: nextValue };
          changedKeys.add(key);
        }
        continue;
      }
      nextAuras.push({ x: point.x, y: point.y, value: nextValue });
      changedKeys.add(key);
    }

    if (changedKeys.size === 0) {
      return 0;
    }
    if (recordUndo) {
      this.captureUndoState();
    }
    this.draft.auras = nextAuras;
    if (selectedAuraPoint) {
/** nextIndex：定义该变量以承载业务值。 */
      const nextIndex = nextAuras.findIndex((point) => point.x === selectedAuraPoint.x && point.y === selectedAuraPoint.y);
      this.selectedEntity = nextIndex >= 0 ? { kind: 'aura', index: nextIndex } : null;
    }
    this.markDirty(false);
    return changedKeys.size;
  }

  private applyResourcePaint(
    points: GridPoint[],
    recordUndo: boolean,
    overrideValue?: number,
    overrideResourceKey?: string,
  ): number {
    if (!this.draft) return 0;
/** resourceKey：定义该变量以承载业务值。 */
    const resourceKey = (overrideResourceKey ?? this.resourcePaintKey).trim();
    if (!resourceKey) {
      this.setStatus('资源键不能为空', true);
      return 0;
    }
/** nextValue：定义该变量以承载业务值。 */
    const nextValue = Math.max(0, Math.floor(overrideValue ?? this.resourcePaintValue));
/** selectedResourcePoint：定义该变量以承载业务值。 */
    const selectedResourcePoint = this.selectedEntity?.kind === 'resource' ? this.getSelectedEntityPoint() : null;
/** nextResources：定义该变量以承载业务值。 */
    const nextResources = [...(this.draft.resources ?? [])];
/** changedKeys：定义该变量以承载业务值。 */
    const changedKeys = new Set<string>();

    for (const point of points) {
      const key = `${point.x},${point.y},${resourceKey}`;
      if (changedKeys.has(key)) continue;
/** index：定义该变量以承载业务值。 */
      const index = nextResources.findIndex((candidate) => (
        candidate.x === point.x
        && candidate.y === point.y
        && getResourceRecordKey(candidate) === resourceKey
      ));
      if (nextValue === 0) {
        if (index >= 0) {
          nextResources.splice(index, 1);
          changedKeys.add(key);
        }
        continue;
      }
      if (index >= 0) {
        if (nextResources[index]!.value !== nextValue) {
          nextResources[index] = { ...nextResources[index]!, value: nextValue };
          setResourceRecordKey(nextResources[index]!, resourceKey);
          changedKeys.add(key);
        }
        continue;
      }
/** nextPoint：定义该变量以承载业务值。 */
      const nextPoint: TileResourcePoint = {
        x: point.x,
        y: point.y,
        value: nextValue,
        resourceKey: resourceKey,
      };
      nextResources.push(nextPoint);
      changedKeys.add(key);
    }

    if (changedKeys.size === 0) {
      return 0;
    }
    if (recordUndo) {
      this.captureUndoState();
    }
    this.draft.resources = nextResources;
    if (selectedResourcePoint) {
/** nextIndex：定义该变量以承载业务值。 */
      const nextIndex = nextResources.findIndex((point) => point.x === selectedResourcePoint.x && point.y === selectedResourcePoint.y);
      this.selectedEntity = nextIndex >= 0 ? { kind: 'resource', index: nextIndex } : null;
    }
    this.resourcePaintKey = resourceKey;
    this.markDirty(false);
    return changedKeys.size;
  }

/** findResourceIndex：执行对应的业务逻辑。 */
  private findResourceIndex(x: number, y: number, resourceKey: string): number {
    if (!this.draft) {
      return -1;
    }
    return (this.draft.resources ?? []).findIndex((point) => point.x === x && point.y === y && getResourceRecordKey(point) === resourceKey);
  }

/** getLinePoints：执行对应的业务逻辑。 */
  private getLinePoints(start: GridPoint, end: GridPoint): GridPoint[] {
/** points：定义该变量以承载业务值。 */
    const points: GridPoint[] = [];
/** x0：定义该变量以承载业务值。 */
    let x0 = start.x;
/** y0：定义该变量以承载业务值。 */
    let y0 = start.y;
/** x1：定义该变量以承载业务值。 */
    const x1 = end.x;
/** y1：定义该变量以承载业务值。 */
    const y1 = end.y;
/** dx：定义该变量以承载业务值。 */
    const dx = Math.abs(x1 - x0);
/** dy：定义该变量以承载业务值。 */
    const dy = Math.abs(y1 - y0);
/** sx：定义该变量以承载业务值。 */
    const sx = x0 < x1 ? 1 : -1;
/** sy：定义该变量以承载业务值。 */
    const sy = y0 < y1 ? 1 : -1;
/** err：定义该变量以承载业务值。 */
    let err = dx - dy;

    while (true) {
      points.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
/** err2：定义该变量以承载业务值。 */
      const err2 = err * 2;
      if (err2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (err2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    return points;
  }

/** hasBlockingMapObjectAt：执行对应的业务逻辑。 */
  private hasBlockingMapObjectAt(x: number, y: number, ignoredSelection: MapEntitySelection = null): boolean {
    if (!this.draft) return false;
    if (this.draft.spawnPoint.x === x && this.draft.spawnPoint.y === y) return true;
    if (this.draft.portals.some((portal, index) => !(ignoredSelection?.kind === 'portal' && ignoredSelection.index === index) && portal.x === x && portal.y === y)) return true;
    if (this.draft.npcs.some((npc, index) => !(ignoredSelection?.kind === 'npc' && ignoredSelection.index === index) && npc.x === x && npc.y === y)) return true;
    if (this.draft.monsterSpawns.some((spawn, index) => !(ignoredSelection?.kind === 'monster' && ignoredSelection.index === index) && spawn.x === x && spawn.y === y)) return true;
    return false;
  }

/** hasAuraAt：执行对应的业务逻辑。 */
  private hasAuraAt(x: number, y: number, ignoredIndex?: number): boolean {
    if (!this.draft) return false;
    return (this.draft.auras ?? []).some((point, index) => index !== ignoredIndex && point.x === x && point.y === y);
  }

/** hasResourceAt：执行对应的业务逻辑。 */
  private hasResourceAt(x: number, y: number, resourceKey: string, ignoredIndex?: number): boolean {
    if (!this.draft) return false;
    return (this.draft.resources ?? []).some((point, index) => (
      index !== ignoredIndex
      && point.x === x
      && point.y === y
      && getResourceRecordKey(point) === resourceKey
    ));
  }

/** hasLandmarkAt：执行对应的业务逻辑。 */
  private hasLandmarkAt(x: number, y: number, ignoredIndex?: number): boolean {
    if (!this.draft) return false;
    return (this.draft.landmarks ?? []).some((landmark, index) => index !== ignoredIndex && landmark.x === x && landmark.y === y);
  }

/** ensureSelectedCell：执行对应的业务逻辑。 */
  private ensureSelectedCell(): boolean {
    if (!this.selectedCell) {
      this.setStatus('请先在画布上选中一个格子', true);
      return false;
    }
    return true;
  }

/** ensureWalkableSelection：执行对应的业务逻辑。 */
  private ensureWalkableSelection(label: string): boolean {
    if (!this.selectedCell) return false;
    if (!isTileTypeWalkable(this.getTileTypeAt(this.selectedCell.x, this.selectedCell.y))) {
      this.setStatus(`${label} 必须放在可通行地块上`, true);
      return false;
    }
    return true;
  }

/** getTileTypeAt：执行对应的业务逻辑。 */
  private getTileTypeAt(x: number, y: number): TileType {
    if (!this.draft) return TileType.Floor;
    return getTileTypeFromMapChar(this.draft.tiles[y]?.[x] ?? '.');
  }

/** findEntityAt：执行对应的业务逻辑。 */
  private findEntityAt(x: number, y: number): MapEntitySelection {
    if (!this.draft) return null;
/** npcIndex：定义该变量以承载业务值。 */
    const npcIndex = this.draft.npcs.findIndex((npc) => npc.x === x && npc.y === y);
    if (npcIndex >= 0) return { kind: 'npc', index: npcIndex };
/** monsterIndex：定义该变量以承载业务值。 */
    const monsterIndex = this.draft.monsterSpawns.findIndex((spawn) => spawn.x === x && spawn.y === y);
    if (monsterIndex >= 0) return { kind: 'monster', index: monsterIndex };
/** portalIndex：定义该变量以承载业务值。 */
    const portalIndex = this.draft.portals.findIndex((portal) => portal.x === x && portal.y === y);
    if (portalIndex >= 0) return { kind: 'portal', index: portalIndex };
/** auraIndex：定义该变量以承载业务值。 */
    const auraIndex = (this.draft.auras ?? []).findIndex((point) => point.x === x && point.y === y);
    if (auraIndex >= 0) return { kind: 'aura', index: auraIndex };
/** resourceIndex：定义该变量以承载业务值。 */
    const resourceIndex = (this.draft.resources ?? []).findIndex((point) => point.x === x && point.y === y);
    if (resourceIndex >= 0) return { kind: 'resource', index: resourceIndex };
/** safeZoneIndex：定义该变量以承载业务值。 */
    const safeZoneIndex = (this.draft.safeZones ?? []).findIndex((zone) => zone.x === x && zone.y === y);
    if (safeZoneIndex >= 0) return { kind: 'safeZone', index: safeZoneIndex };
/** containerIndex：定义该变量以承载业务值。 */
    const containerIndex = (this.draft.landmarks ?? []).findIndex((landmark) => landmark.container && landmark.x === x && landmark.y === y);
    if (containerIndex >= 0) return { kind: 'container', index: containerIndex };
/** landmarkIndex：定义该变量以承载业务值。 */
    const landmarkIndex = (this.draft.landmarks ?? []).findIndex((landmark) => landmark.x === x && landmark.y === y);
    if (landmarkIndex >= 0) return { kind: 'landmark', index: landmarkIndex };
    return null;
  }

  private getSelectedEntityPoint(): { x: number; y: number } | null {
    if (!this.draft || !this.selectedEntity) return null;
    if (this.selectedEntity.kind === 'portal') {
/** portal：定义该变量以承载业务值。 */
      const portal = this.draft.portals[this.selectedEntity.index];
      return portal ? { x: portal.x, y: portal.y } : null;
    }
    if (this.selectedEntity.kind === 'npc') {
/** npc：定义该变量以承载业务值。 */
      const npc = this.draft.npcs[this.selectedEntity.index];
      return npc ? { x: npc.x, y: npc.y } : null;
    }
    if (this.selectedEntity.kind === 'monster') {
/** spawn：定义该变量以承载业务值。 */
      const spawn = this.draft.monsterSpawns[this.selectedEntity.index];
      return spawn ? { x: spawn.x, y: spawn.y } : null;
    }
    if (this.selectedEntity.kind === 'aura') {
/** aura：定义该变量以承载业务值。 */
      const aura = this.draft.auras?.[this.selectedEntity.index];
      return aura ? { x: aura.x, y: aura.y } : null;
    }
    if (this.selectedEntity.kind === 'resource') {
/** resource：定义该变量以承载业务值。 */
      const resource = this.draft.resources?.[this.selectedEntity.index];
      return resource ? { x: resource.x, y: resource.y } : null;
    }
    if (this.selectedEntity.kind === 'safeZone') {
/** zone：定义该变量以承载业务值。 */
      const zone = this.draft.safeZones?.[this.selectedEntity.index];
      return zone ? { x: zone.x, y: zone.y } : null;
    }
    if (this.selectedEntity.kind === 'container') {
/** landmark：定义该变量以承载业务值。 */
      const landmark = this.getContainerLandmark(this.selectedEntity.index);
      return landmark ? { x: landmark.x, y: landmark.y } : null;
    }
/** landmark：定义该变量以承载业务值。 */
    const landmark = this.draft.landmarks?.[this.selectedEntity.index];
    return landmark ? { x: landmark.x, y: landmark.y } : null;
  }

/** createUndoEntry：执行对应的业务逻辑。 */
  private createUndoEntry(): EditorUndoEntry | null {
    if (!this.draft) return null;
    return {
      draft: clone(this.draft),
      selectedCell: this.selectedCell ? { ...this.selectedCell } : null,
      selectedEntity: this.selectedEntity ? { ...this.selectedEntity } : null,
      resizeWidth: this.resizeWidth,
      resizeHeight: this.resizeHeight,
      resizeFillTileType: this.resizeFillTileType,
      composePieces: clone(this.composePieces),
      selectedComposePieceId: this.selectedComposePieceId,
      composeSourceMapId: this.composeSourceMapId,
      dirty: this.dirty,
    };
  }

/** captureUndoState：执行对应的业务逻辑。 */
  private captureUndoState(): void {
/** entry：定义该变量以承载业务值。 */
    const entry = this.createUndoEntry();
    if (!entry) return;
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_UNDO_STEPS) {
      this.undoStack.shift();
    }
    this.updateUndoButtonState();
  }

/** restoreUndoEntry：执行对应的业务逻辑。 */
  private restoreUndoEntry(entry: EditorUndoEntry): void {
    this.draft = clone(entry.draft);
    this.selectedCell = entry.selectedCell ? { ...entry.selectedCell } : null;
    this.selectedEntity = entry.selectedEntity ? { ...entry.selectedEntity } : null;
    this.resizeWidth = entry.resizeWidth;
    this.resizeHeight = entry.resizeHeight;
    this.resizeFillTileType = entry.resizeFillTileType;
    this.composePieces = clone(entry.composePieces);
    this.selectedComposePieceId = entry.selectedComposePieceId;
    this.composeSourceMapId = entry.composeSourceMapId;
    this.dirty = entry.dirty;
    this.linePaintStart = null;
    this.paintActive = false;
    this.dragEntityActive = false;
    this.composeDragActive = false;
    this.panActive = false;
    this.paintSessionHasUndoSnapshot = false;
    this.dragSessionHasUndoSnapshot = false;
    this.lastPaintKey = null;
    this.renderInspector();
    this.renderCanvas();
  }

/** undo：执行对应的业务逻辑。 */
  private undo(): void {
/** entry：定义该变量以承载业务值。 */
    const entry = this.undoStack.pop();
    if (!entry) {
      this.setStatus('没有可撤销的修改');
      this.updateUndoButtonState();
      return;
    }
    this.restoreUndoEntry(entry);
    this.updateUndoButtonState();
    this.setStatus('已撤销上一步修改');
  }

/** updateUndoButtonState：执行对应的业务逻辑。 */
  private updateUndoButtonState(): void {
    this.undoBtn.disabled = !this.draft || this.undoStack.length === 0;
  }

/** handleKeyDown：执行对应的业务逻辑。 */
  private handleKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      if (this.canvasHost.offsetParent === null || isEditableTarget(event.target)) return;
      event.preventDefault();
      this.undo();
    }
  }

/** markDirty：执行对应的业务逻辑。 */
  private markDirty(render = true): void {
    this.dirty = true;
    this.updateUndoButtonState();
    if (render) this.renderInspector();
    else this.jsonEl.value = formatJson(this.draft);
  }
}
