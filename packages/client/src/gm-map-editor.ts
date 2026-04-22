/**
 * GM 地图编辑器 —— Canvas 可视化地图编辑，支持地块绘制、对象管理、撤销与 JSON 导入导出
 * 当前作为 GM 独立编辑器工具继续保留，不并入玩家主线 main.ts，也不作为 next cutover 的前台阻塞项。
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
} from '@mud/shared';
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

/** RequestFn：地图编辑器的请求回调签名。 */
type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;
/** StatusFn：向状态栏输出提示或错误的回调签名。 */
type StatusFn = (message: string, isError?: boolean) => void;
const MONSTER_GRADE_OPTIONS = Object.entries(TECHNIQUE_GRADE_LABELS).map(([value, label]) => ({ value, label }));
const MAP_ROUTE_DOMAIN_OPTIONS: Array<{
/**
 * value：值数值。
 */
 value: MapRouteDomain;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { value: 'system', label: '系统地图' },
  { value: 'sect', label: '宗门地图' },
  { value: 'personal', label: '个人地图' },
  { value: 'dynamic', label: '动态图' },
];
const PORTAL_ROUTE_DOMAIN_OPTIONS: Array<{
/**
 * value：值数值。
 */
 value: PortalRouteDomain;
 /**
 * label：label名称或显示文本。
 */
 label: string }> = [
  { value: 'inherit', label: '继承地图' },
  { value: 'system', label: '系统传送点' },
  { value: 'sect', label: '宗门传送点' },
  { value: 'personal', label: '个人传送点' },
  { value: 'dynamic', label: '动态图传送点' },
];
const MONSTER_GRADE_OVERRIDE_OPTIONS = [
  { value: '', label: '跟随模板' },
  ...MONSTER_GRADE_OPTIONS,
];
/** GmMapEditorOptions：地图编辑器实例的初始化选项。 */
type GmMapEditorOptions = {
/**
 * mapApiBasePath：地图ApiBase路径相关字段。
 */

  mapApiBasePath?: string;  
  /**
 * syncedSummaryLabel：synced摘要Label名称或显示文本。
 */

  syncedSummaryLabel?: string;  
  /**
 * itemCatalog：道具目录相关字段。
 */

  itemCatalog?: GmEditorItemOption[];
};

/** MapEntitySelection：编辑器当前选中的地图实体定位。 */
type MapEntitySelection =
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'portal';  
 /**
 * index：index相关字段。
 */
 index: number }
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'npc';  
 /**
 * index：index相关字段。
 */
 index: number }
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'monster';  
 /**
 * index：index相关字段。
 */
 index: number }
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'aura';  
 /**
 * index：index相关字段。
 */
 index: number }
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'resource';  
 /**
 * index：index相关字段。
 */
 index: number }
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'safeZone';  
 /**
 * index：index相关字段。
 */
 index: number }
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'landmark';  
 /**
 * index：index相关字段。
 */
 index: number }
  | {  
  /**
 * kind：kind相关字段。
 */
 kind: 'container';  
 /**
 * index：index相关字段。
 */
 index: number }
  | null;

/** MapEntityKind：分类枚举。 */
type MapEntityKind = 'portal' | 'npc' | 'monster' | 'aura' | 'resource' | 'safeZone' | 'landmark' | 'container';

/** MapTool：地图编辑器当前激活的工具模式。 */
type MapTool = 'select' | 'paint' | 'pan';
/** PaintLayer：刷点时正在编辑的图层类型。 */
type PaintLayer = 'tile' | 'aura' | 'resource';
/** InspectorTabId：属性面板中可切换的编辑标签页。 */
type InspectorTabId = 'selection' | 'meta' | 'compose' | 'portal' | 'npc' | 'monster' | 'aura' | 'resource' | 'safeZone' | 'landmark' | 'container';
/** GridPoint：地图网格坐标。 */
type GridPoint = {
/**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number };
/** ComposeRotation：合图子块支持的直角旋转角度。 */
type ComposeRotation = 0 | 90 | 180 | 270;

/** TileResourcePoint：地图上的资源刷点记录。 */
type TileResourcePoint = GmMapResourceRecord;
/** MapComposePiece：合图预览中的单个来源地图块。 */
type MapComposePiece = {
/**
 * id：ID标识。
 */

  id: string,  
  /**
 * sourceMapId：来源地图ID标识。
 */

  sourceMapId: string,  
  /**
 * sourceMapName：来源地图名称名称或显示文本。
 */

  sourceMapName: string,  
  /**
 * x：x相关字段。
 */

  x: number,  
  /**
 * y：y相关字段。
 */

  y: number,  
  /**
 * rotation：rotation相关字段。
 */

  rotation: ComposeRotation,
};

/** DEFAULT_RESOURCE_KEY：资源KEY默认值。 */
const DEFAULT_RESOURCE_KEY = 'aura.refined.metal';

/** EditorUndoEntry：撤销栈里保存的整份编辑草稿快照。 */
type EditorUndoEntry = {
/**
 * draft：draft相关字段。
 */

  draft: GmMapDocument;  
  /**
 * selectedCell：selectedCell相关字段。
 */

  selectedCell: GridPoint | null;  
  /**
 * selectedEntity：selectedEntity相关字段。
 */

  selectedEntity: MapEntitySelection;  
  /**
 * resizeWidth：resizeWidth相关字段。
 */

  resizeWidth: number;  
  /**
 * resizeHeight：resizeHeight相关字段。
 */

  resizeHeight: number;  
  /**
 * resizeFillTileType：resizeFillTileType相关字段。
 */

  resizeFillTileType: TileType;  
  /**
 * composePieces：composePiece相关字段。
 */

  composePieces: MapComposePiece[];  
  /**
 * selectedComposePieceId：selectedComposePieceID标识。
 */

  selectedComposePieceId: string | null;  
  /**
 * composeSourceMapId：compose来源地图ID标识。
 */

  composeSourceMapId: string;  
  /**
 * dirty：dirty相关字段。
 */

  dirty: boolean;
};

/** createFragmentFromHtml：从 HTML 创建片段。 */
function createFragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

/** GM 地图可视化编辑器，支持地块绘制、对象增删、撤销和 JSON 导入导出 */
export class GmMapEditor {
  /** listEl：列表元素。 */
  private readonly listEl = document.getElementById('map-list') as HTMLDivElement;
  /** searchInput：搜索输入。 */
  private readonly searchInput = document.getElementById('map-search') as HTMLInputElement;
  /** saveBtn：保存按钮。 */
  private readonly saveBtn = document.getElementById('map-save') as HTMLButtonElement;
  /** resetBtn：reset按钮。 */
  private readonly resetBtn = document.getElementById('map-reset') as HTMLButtonElement;
  /** reloadBtn：重载按钮。 */
  private readonly reloadBtn = document.getElementById('map-reload') as HTMLButtonElement;
  /** undoBtn：undo按钮。 */
  private readonly undoBtn = document.getElementById('map-undo') as HTMLButtonElement;
  /** refreshListBtn：refresh列表按钮。 */
  private readonly refreshListBtn = document.getElementById('map-refresh-list') as HTMLButtonElement;
  /** centerBtn：center按钮。 */
  private readonly centerBtn = document.getElementById('map-center') as HTMLButtonElement;
  /** zoomOutBtn：缩放Out按钮。 */
  private readonly zoomOutBtn = document.getElementById('map-zoom-out') as HTMLButtonElement;
  /** zoomInBtn：缩放In按钮。 */
  private readonly zoomInBtn = document.getElementById('map-zoom-in') as HTMLButtonElement;
  /** statusEl：状态元素。 */
  private readonly statusEl = document.getElementById('map-status-bar') as HTMLDivElement;
  /** canvasHost：canvas宿主元素。 */
  private readonly canvasHost = document.getElementById('map-editor-host') as HTMLDivElement;
  /** canvas：canvas。 */
  private readonly canvas = document.getElementById('map-editor-canvas') as HTMLCanvasElement;
  /** canvasEmptyEl：canvas Empty元素。 */
  private readonly canvasEmptyEl = document.getElementById('map-canvas-empty') as HTMLDivElement;
  /** editorEmptyEl：编辑器Empty元素。 */
  private readonly editorEmptyEl = document.getElementById('map-editor-empty') as HTMLDivElement;
  /** editorPanelEl：编辑器面板元素。 */
  private readonly editorPanelEl = document.getElementById('map-editor-panel') as HTMLDivElement;
  /** summaryEl：摘要元素。 */
  private readonly summaryEl = document.getElementById('map-summary') as HTMLDivElement;
  /** toolButtonsEl：tool按钮元素。 */
  private readonly toolButtonsEl = document.getElementById('map-tool-buttons') as HTMLDivElement;
  /** paintLayerTabsEl：paint层标签页元素。 */
  private readonly paintLayerTabsEl = document.getElementById('map-paint-layer-tabs') as HTMLDivElement | null;
  /** tilePaletteEl：地块Palette元素。 */
  private readonly tilePaletteEl = document.getElementById('map-tile-palette') as HTMLDivElement;
  /** inspectorEl：inspector元素。 */
  private readonly inspectorEl = document.getElementById('map-inspector-content') as HTMLDivElement;
  /** jsonEl：JSON元素。 */
  private readonly jsonEl = document.getElementById('map-json') as HTMLTextAreaElement;
  /** applyJsonBtn：apply JSON按钮。 */
  private readonly applyJsonBtn = document.getElementById('map-apply-json') as HTMLButtonElement;
  /** ctx：ctx。 */
  private readonly ctx = this.canvas.getContext('2d');
  /** mapApiBasePath：地图Api基础路径。 */
  private readonly mapApiBasePath: string;
  /** syncedSummaryLabel：synced摘要标签。 */
  private readonly syncedSummaryLabel: string;
  /** itemCatalog：物品目录。 */
  private itemCatalog: GmEditorItemOption[] = [];

  /** mapList：地图列表。 */
  private mapList: GmMapSummary[] = [];
  /** selectedMapId：selected地图ID。 */
  private selectedMapId: string | null = null;
  /** draft：draft。 */
  private draft: GmMapDocument | null = null;
  /** dirty：dirty。 */
  private dirty = false;
  /** activeTool：活跃Tool。 */
  private activeTool: MapTool = 'paint';
  /** forcedTool：forced Tool。 */
  private forcedTool: MapTool | null = null;
  /** paintTileType：paint地块类型。 */
  private paintTileType: TileType = TileType.Grass;
  /** paintLayer：paint层。 */
  private paintLayer: PaintLayer = 'tile';
  /** auraPaintValue：灵气Paint值。 */
  private auraPaintValue = 1;
  /** resourcePaintValue：资源Paint值。 */
  private resourcePaintValue = 1;
  /** resourcePaintKey：资源Paint Key。 */
  private resourcePaintKey = DEFAULT_RESOURCE_KEY;
  /** composeSourceMapId：compose来源地图ID。 */
  private composeSourceMapId = '';
  /** composePieces：compose Pieces。 */
  private composePieces: MapComposePiece[] = [];
  /** selectedComposePieceId：selected Compose Piece ID。 */
  private selectedComposePieceId: string | null = null;
  /** composeSourceCache：compose来源缓存。 */
  private readonly composeSourceCache = new Map<string, GmMapDocument>();
  /** composeDragActive：compose Drag活跃。 */
  private composeDragActive = false;
  /** composeDragOffsetX：compose Drag偏移X。 */
  private composeDragOffsetX = 0;
  /** composeDragOffsetY：compose Drag偏移Y。 */
  private composeDragOffsetY = 0;
  /** composePieceCounter：compose Piece Counter。 */
  private composePieceCounter = 1;  
  /**
 * selectedCell：selectedCell相关字段。
 */

  private selectedCell: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null = null;  
 /**
 * hoveredCell：hoveredCell相关字段。
 */

  private hoveredCell: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null = null;
  /** selectedEntity：selected实体。 */
  private selectedEntity: MapEntitySelection = null;
  /** currentInspectorTab：当前Inspector Tab。 */
  private currentInspectorTab: InspectorTabId = 'selection';
  /** resizeWidth：resize Width。 */
  private resizeWidth = 0;
  /** resizeHeight：resize Height。 */
  private resizeHeight = 0;
  /** resizeFillTileType：resize Fill地块类型。 */
  private resizeFillTileType: TileType = TileType.Grass;
  /** viewCenterX：视图Center X。 */
  private viewCenterX = 0;
  /** viewCenterY：视图Center Y。 */
  private viewCenterY = 0;
  /** paintActive：paint活跃。 */
  private paintActive = false;
  /** panActive：pan活跃。 */
  private panActive = false;
  /** lastPaintKey：last Paint Key。 */
  private lastPaintKey: string | null = null;
  /** panStartClientX：pan Start客户端X。 */
  private panStartClientX = 0;
  /** panStartClientY：pan Start客户端Y。 */
  private panStartClientY = 0;
  /** panStartCenterX：pan Start Center X。 */
  private panStartCenterX = 0;
  /** panStartCenterY：pan Start Center Y。 */
  private panStartCenterY = 0;
  /** activePointerId：活跃Pointer ID。 */
  private activePointerId: number | null = null;
  /** activePanButtonMask：活跃Pan按钮掩码。 */
  private activePanButtonMask = 0;
  /** listLoaded：列表已加载。 */
  private listLoaded = false;
  /** zoomLevelIndex：缩放等级索引。 */
  private zoomLevelIndex = DEFAULT_EDITOR_ZOOM_INDEX;
  /** paintSessionHasUndoSnapshot：paint会话Has Undo快照。 */
  private paintSessionHasUndoSnapshot = false;
  /** dragEntityActive：drag实体活跃。 */
  private dragEntityActive = false;
  /** dragSessionHasUndoSnapshot：drag会话Has Undo快照。 */
  private dragSessionHasUndoSnapshot = false;
  /** linePaintStart：line Paint Start。 */
  private linePaintStart: GridPoint | null = null;
  /** undoStack：undo Stack。 */
  private undoStack: EditorUndoEntry[] = [];
  /** renderFrameId：渲染帧ID。 */
  private renderFrameId: number | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param request RequestFn 请求参数。
 * @param setGlobalStatus StatusFn 参数说明。
 * @param options GmMapEditorOptions 选项参数。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(
    private readonly request: RequestFn,
    private readonly setGlobalStatus: StatusFn,
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

  /** setItemCatalog：处理set物品目录。 */
  setItemCatalog(items: GmEditorItemOption[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.itemCatalog = clone(items);
    if (this.currentInspectorTab === 'container') {
      this.renderInspector();
    }
  }

  /** 确保地图列表已加载，首次切换到地图 tab 时调用 */
  async ensureLoaded(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.listLoaded) return;
    await this.loadMapList();
  }

  /** 重置编辑器状态（登出时调用） */
  reset(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    this.listEl.replaceChildren();
    this.inspectorEl.replaceChildren();
    this.summaryEl.replaceChildren();
    this.jsonEl.value = '';
    this.editorPanelEl.classList.add('hidden');
    this.editorEmptyEl.classList.remove('hidden');
    this.canvasEmptyEl.classList.remove('hidden');
    this.updateUndoButtonState();
    this.setStatus('');
  }

  /** forceTool：处理force Tool。 */
  forceTool(tool: MapTool): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.forcedTool === tool) return;
    this.endPointerInteraction();
    this.forcedTool = tool;
    if (tool !== 'paint') {
      this.linePaintStart = null;
    }
    this.renderToolControls();
    this.renderCanvas();
  }

  /** clearForcedTool：清理Forced Tool。 */
  clearForcedTool(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.forcedTool === null) return;
    this.endPointerInteraction();
    this.forcedTool = null;
    this.renderToolControls();
    this.renderCanvas();
  }

  /** getCurrentTool：读取当前Tool。 */
  private getCurrentTool(): MapTool {
    return this.forcedTool ?? this.activeTool;
  }

  /** bindEvents：绑定事件。 */
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
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-id]');
      const mapId = button?.dataset.mapId;
      if (!mapId) return;
      this.selectMap(mapId).catch(() => {});
    });

    this.toolButtonsEl.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tool]');
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
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-paint-layer]');
      const nextLayer = button?.dataset.paintLayer as PaintLayer | undefined;
      if (!nextLayer || this.paintLayer === nextLayer) return;
      this.paintLayer = nextLayer;
      this.renderToolControls();
      this.renderInspector();
    });

    this.tilePaletteEl.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button) return;
      const tileType = button.dataset.tileType as TileType | undefined;
      if (tileType) {
        this.paintTileType = tileType;
        this.renderToolControls();
        this.renderInspector();
        return;
      }
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
      const tabButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-inspector-tab]');
      const tab = tabButton?.dataset.mapInspectorTab as InspectorTabId | undefined;
      if (tab) {
        this.currentInspectorTab = tab;
        this.renderInspector();
        return;
      }
      const actionEl = (event.target as HTMLElement).closest<HTMLElement>('[data-map-action]');
      const action = actionEl?.dataset.mapAction;
      if (action) {
        this.handleAction(action, actionEl!);
        return;
      }
      const entityButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-entity-kind]');
      const composeButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-compose-piece-id]');
      if (composeButton) {
        const pieceId = composeButton.dataset.composePieceId;
        if (pieceId) {
          this.selectedComposePieceId = pieceId;
          this.selectedEntity = null;
          this.currentInspectorTab = 'compose';
          const piece = this.getSelectedComposePiece();
          if (piece) {
            this.selectedCell = { x: piece.x, y: piece.y };
          }
          this.renderInspector();
        }
        return;
      }
      if (!entityButton) return;
      const kind = entityButton.dataset.entityKind as MapEntityKind | undefined;
      const index = Number(entityButton.dataset.entityIndex ?? '-1');
      if (Number.isInteger(index) && kind) {
        this.selectedComposePieceId = null;
        this.selectedEntity = { kind, index } as Exclude<MapEntitySelection, null>;
        this.currentInspectorTab = kind;
        const point = this.getSelectedEntityPoint();
        if (point) this.selectedCell = point;
        this.renderInspector();
      }
    });

    this.inspectorEl.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const uiField = target.dataset.mapUi;
      if (uiField) {
        this.handleUiFieldChange(uiField, target.value);
        return;
      }
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

  /** setStatus：处理set状态。 */
  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.style.color = isError ? 'var(--stamp-red)' : 'var(--ink-grey)';
    this.setGlobalStatus(message, isError);
  }

  /** renderToolControls：渲染Tool Controls。 */
  private renderToolControls(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const currentTool = this.getCurrentTool();
    const existingToolButtons = new Map<string, HTMLButtonElement>();
    this.toolButtonsEl.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      const tool = button.dataset.tool;
      if (tool) {
        existingToolButtons.set(tool, button);
      }
    });
    const toolFragment = document.createDocumentFragment();
    for (const tool of TOOL_OPTIONS) {
      const button = existingToolButtons.get(tool.value) ?? document.createElement('button');
      button.type = 'button';
      button.dataset.tool = tool.value;
      button.className = `map-tool-btn ${currentTool === tool.value ? 'active' : ''}`;
      button.textContent = `${tool.label} · ${tool.value === 'paint' ? `左键拖拽刷${this.paintLayer === 'tile' ? '地块' : this.paintLayer === 'aura' ? '无属性灵气' : '气机'}` : tool.note}`;
      toolFragment.append(button);
    }
    this.toolButtonsEl.replaceChildren(toolFragment);

    if (this.paintLayerTabsEl) {
      const existingTabs = new Map<string, HTMLButtonElement>();
      this.paintLayerTabsEl.querySelectorAll<HTMLButtonElement>('[data-paint-layer]').forEach((button) => {
        const value = button.dataset.paintLayer;
        if (value) {
          existingTabs.set(value, button);
        }
      });
      const tabFragment = document.createDocumentFragment();
      for (const option of PAINT_LAYER_OPTIONS) {
        const button = existingTabs.get(option.value) ?? document.createElement('button');
        button.type = 'button';
        button.dataset.paintLayer = option.value;
        button.className = `side-tab ${this.paintLayer === option.value ? 'active' : ''}`;
        button.textContent = option.label;
        tabFragment.append(button);
      }
      this.paintLayerTabsEl.replaceChildren(tabFragment);
    }

    const paletteFragment = document.createDocumentFragment();
    if (this.paintLayer === 'tile') {
      const existingPaletteButtons = new Map<string, HTMLButtonElement>();
      this.tilePaletteEl.querySelectorAll<HTMLButtonElement>('[data-tile-type]').forEach((button) => {
        const tileType = button.dataset.tileType;
        if (tileType) {
          existingPaletteButtons.set(tileType, button);
        }
      });
      for (const tileType of PAINT_TILE_TYPES) {
        const button = existingPaletteButtons.get(tileType) ?? document.createElement('button');
        button.type = 'button';
        button.dataset.tileType = tileType;
        button.dataset.auraValue = '';
        button.className = `map-tile-btn ${this.paintTileType === tileType ? 'active' : ''}`;
        button.textContent = TILE_TYPE_LABELS[tileType];
        paletteFragment.append(button);
      }
    } else {
      const existingPaletteButtons = new Map<string, HTMLButtonElement>();
      this.tilePaletteEl.querySelectorAll<HTMLButtonElement>('[data-aura-value]').forEach((button) => {
        const value = button.dataset.auraValue;
        if (value) {
          existingPaletteButtons.set(value, button);
        }
      });
      for (const value of AURA_BRUSH_LEVELS) {
        const key = String(value);
        const button = existingPaletteButtons.get(key) ?? document.createElement('button');
        button.type = 'button';
        button.dataset.auraValue = key;
        delete button.dataset.tileType;
        button.className = `map-tile-btn ${(this.paintLayer === 'aura' ? this.auraPaintValue : this.resourcePaintValue) === value ? 'active' : ''}`;
        button.textContent = value === 0 ? '清除' : `${this.paintLayer === 'aura' ? '灵气' : '气机'} ${value}`;
        paletteFragment.append(button);
      }
    }
    this.tilePaletteEl.replaceChildren(paletteFragment);
  }

  /** loadMapList：加载地图列表。 */
  private async loadMapList(force = false): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const data = await this.request<GmMapListRes>(this.mapApiBasePath);
    this.mapList = data.maps;
    this.listLoaded = true;
    if (force && this.selectedMapId) {
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

  /** renderMapList：渲染地图列表。 */
  private renderMapList(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const keyword = this.searchInput.value.trim().toLowerCase();
    const filtered = this.mapList.filter((map) => {
      if (!keyword) return true;
      return [map.id, map.name, map.recommendedRealm ?? '', map.description ?? '']
        .some((value) => value.toLowerCase().includes(keyword));
    });
    if (filtered.length === 0) {
      this.listEl.replaceChildren(createFragmentFromHtml('<div class="empty-hint">没有符合条件的地图。</div>'));
      return;
    }
    const existingRows = new Map<string, HTMLButtonElement>();
    this.listEl.querySelectorAll<HTMLButtonElement>('[data-map-id]').forEach((button) => {
      const mapId = button.dataset.mapId;
      if (mapId) {
        existingRows.set(mapId, button);
      }
    });
    const fragment = document.createDocumentFragment();
    for (const map of filtered) {
      const button = existingRows.get(map.id) ?? document.createElement('button');
      button.type = 'button';
      button.dataset.mapId = map.id;
      button.className = `map-row ${map.id === this.selectedMapId ? 'active' : ''}`;
      button.replaceChildren(createFragmentFromHtml(`
        <div class="map-row-title">${escapeHtml(map.name)}</div>
        <div class="map-row-meta">${escapeHtml(map.id)} · ${map.width} x ${map.height} · 危险度 ${map.dangerLevel ?? '-'}</div>
        <div class="map-row-meta">传送点 ${map.portalCount} · NPC ${map.npcCount} · 怪物刷新点 ${map.monsterSpawnCount}</div>
      `));
      fragment.append(button);
    }
    this.listEl.replaceChildren(fragment);
  }

  /** selectMap：选择地图。 */
  private async selectMap(mapId: string): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (mapId === this.selectedMapId && this.draft) return;
    if (this.dirty && !window.confirm('当前地图有未保存修改，切换后会丢失这些修改。继续吗？')) {
      return;
    }
    await this.loadMap(mapId, true);
    this.renderMapList();
  }

  /** loadMap：加载地图。 */
  private async loadMap(mapId: string, announce = true): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** renderInspector：渲染Inspector。 */
  private renderInspector(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) {
      this.editorPanelEl.classList.add('hidden');
      this.editorEmptyEl.classList.remove('hidden');
      this.canvasEmptyEl.classList.remove('hidden');
      this.summaryEl.replaceChildren();
      this.inspectorEl.replaceChildren();
      this.jsonEl.value = '';
      return;
    }

    this.editorPanelEl.classList.remove('hidden');
    this.editorEmptyEl.classList.add('hidden');
    this.canvasEmptyEl.classList.add('hidden');

    const selectedCell = this.selectedCell;
    const selectedTileType = selectedCell ? this.getTileTypeAt(selectedCell.x, selectedCell.y) : null;
    const selectedEntityPoint = this.getSelectedEntityPoint();
    this.draft.resources = this.draft.resources ?? [];

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
    this.ensureInspectorShell();
    this.syncInspectorTabs();
    this.syncInspectorPanel(this.renderInspectorTabContent(selectedCell, selectedTileType, selectedEntityPoint));
    this.jsonEl.value = formatJson(this.draft);
    this.renderCanvas();
  }  
  /**
 * ensureInspectorShell：执行ensureInspectorShell相关逻辑。
 * @returns 无返回值，直接更新ensureInspectorShell相关状态。
 */


  private ensureInspectorShell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.inspectorEl.querySelector('[data-map-inspector-shell]')) {
      return;
    }
    this.inspectorEl.replaceChildren(createFragmentFromHtml(`
      <div class="inspector-layout" data-map-inspector-shell>
        <div class="inspector-tabs" data-map-inspector-tabs></div>
        <div class="inspector-panel" data-map-inspector-panel></div>
      </div>
    `));
  }  
  /**
 * syncInspectorTabs：处理InspectorTab并更新相关状态。
 * @returns 无返回值，直接更新InspectorTab相关状态。
 */


  private syncInspectorTabs(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const tabsRoot = this.inspectorEl.querySelector<HTMLElement>('[data-map-inspector-tabs]');
    if (!tabsRoot) {
      return;
    }
    const existingTabs = new Map<string, HTMLButtonElement>();
    tabsRoot.querySelectorAll<HTMLButtonElement>('[data-map-inspector-tab]').forEach((button) => {
      const tab = button.dataset.mapInspectorTab;
      if (tab) {
        existingTabs.set(tab, button);
      }
    });
    const fragment = document.createDocumentFragment();
    for (const tab of INSPECTOR_TABS) {
      const button = existingTabs.get(tab.value) ?? document.createElement('button');
      button.type = 'button';
      button.dataset.mapInspectorTab = tab.value;
      button.className = `side-tab inspector-tab-btn ${this.currentInspectorTab === tab.value ? 'active' : ''}`;
      button.textContent = tab.label;
      fragment.append(button);
    }
    tabsRoot.replaceChildren(fragment);
  }  
  /**
 * syncInspectorPanel：处理Inspector面板并更新相关状态。
 * @param html string 参数说明。
 * @returns 无返回值，直接更新Inspector面板相关状态。
 */


  private syncInspectorPanel(html: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const panel = this.inspectorEl.querySelector<HTMLElement>('[data-map-inspector-panel]');
    if (!panel) {
      return;
    }
    panel.replaceChildren(createFragmentFromHtml(html));
  }  
  /**
 * renderInspectorTabContent：执行InspectorTab内容相关逻辑。
 * @param selectedCell { x: number; y: number } | null 参数说明。
 * @param selectedTileType TileType | null 参数说明。
 * @param selectedEntityPoint { x: number; y: number } | null 参数说明。
 * @returns 返回InspectorTab内容。
 */


  private renderInspectorTabContent(
    selectedCell: {    
    /**
 * x：x相关字段。
 */
 x: number;    
 /**
 * y：y相关字段。
 */
 y: number } | null,
    selectedTileType: TileType | null,
    selectedEntityPoint: {    
    /**
 * x：x相关字段。
 */
 x: number;    
 /**
 * y：y相关字段。
 */
 y: number } | null,
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

  /** renderSelectionTab：渲染选中项Tab。 */
  private renderSelectionTab(selectedCell: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null, selectedTileType: TileType | null): string {
    const selectedAura = selectedCell ? this.getAuraAt(selectedCell.x, selectedCell.y) : null;
    const selectedResources = selectedCell ? this.getResourcesAt(selectedCell.x, selectedCell.y) : [];
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

  /** renderMetaTab：渲染元数据Tab。 */
  private renderMetaTab(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** renderComposeTab：渲染Compose Tab。 */
  private renderComposeTab(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return '';
    const sourceOptions = this.mapList.filter((map) => map.id !== this.draft?.id);
    const selectedPiece = this.getSelectedComposePiece();
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

  /** renderPortalTab：渲染传送点Tab。 */
  private renderPortalTab(selectedPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** renderNpcTab：渲染NPC Tab。 */
  private renderNpcTab(selectedPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** renderMonsterTab：渲染妖兽Tab。 */
  private renderMonsterTab(selectedPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** renderAuraTab：渲染灵气Tab。 */
  private renderAuraTab(selectedPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** renderResourceTab：渲染资源Tab。 */
  private renderResourceTab(selectedPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return '';
    const uniqueKeys = [...new Set((this.draft.resources ?? []).map((point) => getResourceRecordKey(point)).filter(Boolean))]
      .sort((left, right) => {
        const sortKeyCompare = getResourceTypeSortKey(left).localeCompare(getResourceTypeSortKey(right), 'zh-CN');
        return sortKeyCompare !== 0 ? sortKeyCompare : left.localeCompare(right, 'zh-CN');
      });
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
    const selectedResource = this.selectedEntity?.kind === 'resource'
      ? this.draft.resources?.[this.selectedEntity.index]
      : null;
    const selectedResourceKey = selectedResource ? getResourceRecordKey(selectedResource) : this.resourcePaintKey;
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

  /** renderSafeZoneTab：渲染安全Zone Tab。 */
  private renderSafeZoneTab(selectedPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** renderLandmarkTab：渲染地标Tab。 */
  private renderLandmarkTab(selectedPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return '';
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

  /** renderContainerTab：渲染容器Tab。 */
  private renderContainerTab(selectedPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return '';
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

  /** renderSelectedEntitySection：渲染Selected实体Section。 */
  private renderSelectedEntitySection(selectedPoint: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
      const portal = this.draft.portals[this.selectedEntity.index];
      if (!portal) return '';
      const portalKind = portal.kind === 'stairs' ? 'stairs' : 'portal';
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
      const npcIndex = this.selectedEntity.index;
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
          <div class="editor-note" style="margin-top: 12px;">任务请改到 <code>packages/server/data/content/quests/</code> 下对应章节文件，例如 <code>第一章_主线.json</code>、<code>第一章_支线.json</code>。</div>
        </section>
      `;
    }

    if (this.selectedEntity.kind === 'monster') {
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
      const selectedIndex = this.selectedEntity.index;
      const containerLandmark = this.getContainerLandmark(selectedIndex);
      if (!containerLandmark || !containerLandmark.container) return '';
      const container = containerLandmark.container;
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
      const resource = this.draft.resources?.[this.selectedEntity.index];
      if (!resource) return '';
      const resourceKey = getResourceRecordKey(resource);
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

  /** describeSelectedEntity：处理describe Selected实体。 */
  private describeSelectedEntity(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const selectedComposePiece = this.getSelectedComposePiece();
    if (selectedComposePiece) {
      return `拼图块 ${selectedComposePiece.sourceMapName} ${selectedComposePiece.rotation}°`;
    }
    if (!this.draft || !this.selectedEntity) {
      return '无';
    }
    if (this.selectedEntity.kind === 'portal') {
      const portal = this.draft.portals[this.selectedEntity.index];
      return portal ? `${portal.kind === 'stairs' ? '楼梯' : '传送阵'} (${portal.x}, ${portal.y}) -> ${this.formatMapTargetLabel(portal.targetMapId)}` : '无';
    }
    if (this.selectedEntity.kind === 'npc') {
      const npc = this.draft.npcs[this.selectedEntity.index];
      return npc ? `NPC ${npc.name || npc.id}` : '无';
    }
    if (this.selectedEntity.kind === 'monster') {
      const spawn = this.draft.monsterSpawns[this.selectedEntity.index];
      return spawn ? `怪物 ${spawn.name || spawn.id}` : '无';
    }
    if (this.selectedEntity.kind === 'aura') {
      const aura = this.draft.auras?.[this.selectedEntity.index];
      return aura ? formatAuraPointLabel(aura.value) : '无';
    }
    if (this.selectedEntity.kind === 'resource') {
      const resource = this.draft.resources?.[this.selectedEntity.index];
      return resource ? formatResourcePointLabel(resource) : '无';
    }
    if (this.selectedEntity.kind === 'safeZone') {
      const zone = this.draft.safeZones?.[this.selectedEntity.index];
      return zone ? `安全区 半径 ${zone.radius}` : '无';
    }
    if (this.selectedEntity.kind === 'container') {
      const landmark = this.getContainerLandmark(this.selectedEntity.index);
      return landmark ? `容器 ${landmark.name || landmark.id}` : '无';
    }
    const landmark = this.draft.landmarks?.[this.selectedEntity.index];
    return landmark ? `地标 ${landmark.name || landmark.id}` : '无';
  }

  /** findComposePieceAt：查找Compose Piece At。 */
  private findComposePieceAt(x: number, y: number): MapComposePiece | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** getAuraAt：读取灵气At。 */
  private getAuraAt(x: number, y: number): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number;  
 /**
 * value：值数值。
 */
 value: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return null;
    return this.draft.auras?.find((point) => point.x === x && point.y === y) ?? null;
  }

  /** getResourcesAt：读取资源At。 */
  private getResourcesAt(x: number, y: number): TileResourcePoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return [];
    return (this.draft.resources ?? []).filter((point) => point.x === x && point.y === y);
  }

  /** formatMapTargetLabel：格式化地图目标标签。 */
  private formatMapTargetLabel(mapId: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const target = this.mapList.find((map) => map.id === mapId);
    if (!target) {
      return mapId;
    }
    return target.name && target.name !== mapId
      ? `${target.name} (${mapId})`
      : target.name || mapId;
  }

  /** getContainerLandmarks：读取容器Landmarks。 */
  private getContainerLandmarks(): Array<{  
  /**
 * landmark：landmark相关字段。
 */
 landmark: GmMapLandmarkRecord;  
 /**
 * index：index相关字段。
 */
 index: number }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) {
      return [];
    }
    return (this.draft.landmarks ?? [])
      .flatMap((landmark, index) => landmark.container ? [{ landmark, index }] : []);
  }

  /** getContainerLandmark：读取容器地标。 */
  private getContainerLandmark(index: number): GmMapLandmarkRecord | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) {
      return null;
    }
    const landmark = this.draft.landmarks?.[index];
    return landmark?.container ? landmark : null;
  }

  /** getAvailableItemTags：读取Available物品Tags。 */
  private getAvailableItemTags(): string[] {
    return [...new Set(this.itemCatalog.flatMap((item) => item.tags ?? []))]
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }

  /** buildContainerTagHint：构建容器Tag Hint。 */
  private buildContainerTagHint(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const tags = this.getAvailableItemTags();
    if (tags.length === 0) {
      return '标签来源于物品目录。每行一组，组内用逗号分隔；同一随机池会同时满足每一行至少一个 tag。';
    }
    const preview = tags.slice(0, 40).join('、');
    const suffix = tags.length > 40 ? ` 等 ${tags.length} 个` : '';
    return `每行一组，组内用逗号分隔；同一随机池会同时满足每一行至少一个 tag。当前可用 tag：${preview}${suffix}`;
  }

  /** handleUiFieldChange：处理界面字段变更。 */
  private handleUiFieldChange(field: string, value: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** syncInspectorToDraft：同步Inspector To Draft。 */
  private syncInspectorToDraft(): {  
  /**
 * ok：ok相关字段。
 */
 ok: true } | {  
 /**
 * ok：ok相关字段。
 */
 ok: false;  
 /**
 * message：message相关字段。
 */
 message: string } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) {
      return { ok: false, message: '当前没有地图草稿' };
    }
    const previousJson = formatJson(this.draft);
    const next = clone(this.draft);
    const fields = this.inspectorEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-map-bind]');
    for (const field of Array.from(fields)) {
      const path = field.dataset.mapBind;
      const kind = field.dataset.mapKind;
      if (!path || !kind) continue;
      let value: unknown;
      if (kind === 'number') {
        const num = Number(field.value || '0');
        if (!Number.isFinite(num)) {
          return { ok: false, message: `${path} 不是合法数字` };
        }
        value = Math.floor(num);
      } else if (kind === 'float') {
        const num = Number(field.value || '0');
        if (!Number.isFinite(num)) {
          return { ok: false, message: `${path} 不是合法数字` };
        }
        value = num;
      } else if (kind === 'nullable-number') {
        if (!field.value.trim()) {
          value = undefined;
        } else {
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

  /** handleAction：处理动作。 */
  private handleAction(action: string, trigger: HTMLElement): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return;
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

  /** addPortalAtCurrentCell：处理add传送点At当前格子。 */
  private addPortalAtCurrentCell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    if (!this.ensureWalkableSelection('传送点')) return;
    this.captureUndoState();
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

  /** ensureComposeSourceMap：确保Compose来源地图。 */
  private async ensureComposeSourceMap(sourceMapId: string): Promise<GmMapDocument> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const cached = this.composeSourceCache.get(sourceMapId);
    if (cached) {
      return cached;
    }
    const data = await this.request<GmMapDetailRes>(`${this.mapApiBasePath}/${encodeURIComponent(sourceMapId)}`);
    const map = clone(data.map);
    this.composeSourceCache.set(sourceMapId, map);
    return map;
  }

  /** getComposePieceSize：读取Compose Piece Size。 */
  private getComposePieceSize(piece: MapComposePiece): {  
  /**
 * width：width相关字段。
 */
 width: number;  
 /**
 * height：height相关字段。
 */
 height: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const source = this.composeSourceCache.get(piece.sourceMapId);
    if (!source) return null;
    const interiorWidth = Math.max(0, source.width - 2);
    const interiorHeight = Math.max(0, source.height - 2);
    if (piece.rotation === 90 || piece.rotation === 270) {
      return { width: interiorHeight, height: interiorWidth };
    }
    return { width: interiorWidth, height: interiorHeight };
  }

  /** getComposePieceBounds：读取Compose Piece Bounds。 */
  private getComposePieceBounds(piece: MapComposePiece): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number;  
 /**
 * width：width相关字段。
 */
 width: number;  
 /**
 * height：height相关字段。
 */
 height: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const size = this.getComposePieceSize(piece);
    if (!size) return null;
    return {
      x: piece.x,
      y: piece.y,
      width: size.width,
      height: size.height,
    };
  }

  /** clampComposePiecePosition：处理clamp Compose Piece位置。 */
  private clampComposePiecePosition(piece: MapComposePiece): MapComposePiece {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return piece;
    const size = this.getComposePieceSize(piece);
    if (!size) return piece;
    return {
      ...piece,
      x: Math.min(Math.max(0, piece.x), Math.max(0, this.draft.width - size.width)),
      y: Math.min(Math.max(0, piece.y), Math.max(0, this.draft.height - size.height)),
    };
  }

  /** getSelectedComposePiece：读取Selected Compose Piece。 */
  private getSelectedComposePiece(): MapComposePiece | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedComposePieceId) return null;
    return this.composePieces.find((piece) => piece.id === this.selectedComposePieceId) ?? null;
  }

  /** addComposePiece：处理add Compose Piece。 */
  private async addComposePiece(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return;
    const sourceMapId = this.composeSourceMapId.trim();
    if (!sourceMapId) {
      this.setStatus('请先选择来源地图', true);
      return;
    }
    if (sourceMapId === this.draft.id) {
      this.setStatus('不能把当前地图自己当成拼图块', true);
      return;
    }
    const source = await this.ensureComposeSourceMap(sourceMapId);
    const anchor = this.selectedCell
      ? { ...this.selectedCell }
      : { x: Math.max(0, Math.floor(this.draft.width / 2) - 2), y: Math.max(0, Math.floor(this.draft.height / 2) - 2) };
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
  /**
 * updateComposePiece：处理ComposePiece并更新相关状态。
 * @param pieceId string piece ID。
 * @param updater (piece: MapComposePiece) => MapComposePiece 参数说明。
 * @returns 返回是否满足ComposePiece条件。
 */


  private updateComposePiece(pieceId: string, updater: (piece: MapComposePiece) => MapComposePiece): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const index = this.composePieces.findIndex((piece) => piece.id === pieceId);
    if (index < 0) return false;
    this.composePieces[index] = this.clampComposePiecePosition(updater(this.composePieces[index]!));
    return true;
  }

  /** rotateSelectedComposePiece：处理rotate Selected Compose Piece。 */
  private rotateSelectedComposePiece(clockwise: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    const updated = this.getSelectedComposePiece();
    if (updated) {
      this.selectedCell = { x: updated.x, y: updated.y };
    }
    this.renderInspector();
    this.setStatus(`已${clockwise ? '右转' : '左转'}拼图块 90°`);
  }

  /** removeSelectedComposePiece：处理remove Selected Compose Piece。 */
  private removeSelectedComposePiece(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** clearComposePieces：清理Compose Pieces。 */
  private clearComposePieces(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * forEachComposePieceTile：执行forEachComposePieceTile相关逻辑。
 * @param piece MapComposePiece 参数说明。
 * @param visitor (targetX: number, targetY: number, sourceChar: string) => void 参数说明。
 * @returns 无返回值，直接更新forEachComposePieceTile相关状态。
 */


  private forEachComposePieceTile(
    piece: MapComposePiece,
    visitor: (targetX: number, targetY: number, sourceChar: string) => void,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const source = this.composeSourceCache.get(piece.sourceMapId);
    if (!source) return;
    const interiorWidth = Math.max(0, source.width - 2);
    const interiorHeight = Math.max(0, source.height - 2);
    for (let sourceY = 1; sourceY < source.height - 1; sourceY += 1) {
      const row = [...source.tiles[sourceY]!];
      for (let sourceX = 1; sourceX < source.width - 1; sourceX += 1) {
        const localX = sourceX - 1;
        const localY = sourceY - 1;
        let targetOffsetX = localX;
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

  /** bakeComposePiece：处理bake Compose Piece。 */
  private bakeComposePiece(piece: MapComposePiece, recordUndo: boolean): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return 0;
    const changed = new Map<number, string[]>();
    let changedCount = 0;
    this.forEachComposePieceTile(piece, (targetX, targetY, sourceChar) => {
      if (targetX < 0 || targetY < 0 || targetX >= this.draft!.width || targetY >= this.draft!.height) {
        return;
      }
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

  /** bakeSelectedComposePiece：处理bake Selected Compose Piece。 */
  private bakeSelectedComposePiece(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const selected = this.getSelectedComposePiece();
    if (!selected) {
      this.setStatus('请先选中一个拼图块', true);
      return;
    }
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

  /** bakeAllComposePieces：处理bake All Compose Pieces。 */
  private bakeAllComposePieces(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft || this.composePieces.length === 0) {
      this.setStatus('当前没有可烘焙的拼图块', true);
      return;
    }
    this.captureUndoState();
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

  /** addNpcAtCurrentCell：处理add NPC At当前格子。 */
  private addNpcAtCurrentCell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** addQuestToSelectedNpc：处理add任务To Selected NPC。 */
  private addQuestToSelectedNpc(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft || this.selectedEntity?.kind !== 'npc') {
      return;
    }
    const npc = this.draft.npcs[this.selectedEntity.index];
    if (!npc) {
      return;
    }
    this.captureUndoState();
    npc.quests = npc.quests ?? [];
    npc.quests.push(createDefaultQuestRecord(npc, npc.quests.length));
    this.markDirty();
  }

  /** removeQuestFromSelectedNpc：处理remove任务From Selected NPC。 */
  private removeQuestFromSelectedNpc(index: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft || this.selectedEntity?.kind !== 'npc' || index < 0) {
      return;
    }
    const npc = this.draft.npcs[this.selectedEntity.index];
    if (!npc?.quests || index >= npc.quests.length) {
      return;
    }
    this.captureUndoState();
    npc.quests.splice(index, 1);
    this.markDirty();
  }

  /** addMonsterAtCurrentCell：处理add妖兽At当前格子。 */
  private addMonsterAtCurrentCell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    if (!this.ensureWalkableSelection('怪物刷新点')) return;
    this.captureUndoState();
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

  /** addAuraAtCurrentCell：处理add灵气At当前格子。 */
  private addAuraAtCurrentCell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    const changed = this.applyAuraPaint([{ x, y }], true, 1);
    if (!changed) return;
    const index = this.draft!.auras?.findIndex((point) => point.x === x && point.y === y) ?? -1;
    if (index >= 0) {
      this.selectedEntity = { kind: 'aura', index };
    }
    this.markDirty();
  }

  /** applyResourceBrushKey：应用资源Brush Key。 */
  private applyResourceBrushKey(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = this.resourcePaintKey.trim();
    if (!normalized) {
      this.setStatus('资源键不能为空', true);
      return;
    }
    this.resourcePaintKey = normalized;
    this.setStatus(`已设置气机画笔资源键：${normalized}`);
    this.renderInspector();
  }

  /** addResourceAtCurrentCell：处理add资源At当前格子。 */
  private addResourceAtCurrentCell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    const normalizedKey = this.resourcePaintKey.trim();
    if (!normalizedKey) {
      this.setStatus('请先填写气机资源键', true);
      return;
    }
    const changed = this.applyResourcePaint([{ x, y }], true, this.resourcePaintValue, normalizedKey);
    if (!changed) return;
    const index = this.findResourceIndex(x, y, normalizedKey);
    if (index >= 0) {
      this.selectedEntity = { kind: 'resource', index };
    }
    this.markDirty();
  }

  /** addSafeZoneAtCurrentCell：处理add安全Zone At当前格子。 */
  private addSafeZoneAtCurrentCell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** addLandmarkAtCurrentCell：处理add地标At当前格子。 */
  private addLandmarkAtCurrentCell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** addContainerAtCurrentCell：处理add容器At当前格子。 */
  private addContainerAtCurrentCell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** addLootPoolToSelectedContainer：处理add战利品池To Selected容器。 */
  private addLootPoolToSelectedContainer(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** removeLootPoolFromSelectedContainer：处理remove战利品池From Selected容器。 */
  private removeLootPoolFromSelectedContainer(index: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** moveSelectedEntityToCurrentCell：处理移动Selected实体To当前格子。 */
  private moveSelectedEntityToCurrentCell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft || !this.selectedEntity || !this.selectedCell) {
      this.setStatus('请先选中对象和目标格', true);
      return;
    }
    const moved = this.moveSelectedEntityToPoint(this.selectedCell.x, this.selectedCell.y, true, false);
    if (moved) {
      this.markDirty();
    }
  }

  /** moveSelectedEntityToPoint：处理移动Selected实体To坐标。 */
  private moveSelectedEntityToPoint(x: number, y: number, recordUndo: boolean, silent: boolean): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft || !this.selectedEntity) return false;
    const selection = this.selectedEntity;
    const currentPoint = this.getSelectedEntityPoint();
    if (!currentPoint) return false;
    if (currentPoint.x === x && currentPoint.y === y) {
      return false;
    }

    if (selection.kind === 'aura') {
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
      const resource = this.draft.resources?.[selection.index];
      if (!resource) return false;
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
      const portal = this.draft.portals[selection.index];
      if (!portal) return false;
      portal.x = x;
      portal.y = y;
    } else if (selection.kind === 'npc') {
      const npc = this.draft.npcs[selection.index];
      if (!npc) return false;
      npc.x = x;
      npc.y = y;
    } else if (selection.kind === 'monster') {
      const spawn = this.draft.monsterSpawns[selection.index];
      if (!spawn) return false;
      spawn.x = x;
      spawn.y = y;
    }
    this.selectedCell = { x, y };
    this.markDirty(false);
    return true;
  }

  /** removeSelectedEntity：处理remove Selected实体。 */
  private removeSelectedEntity(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** applyResize：应用Resize。 */
  private applyResize(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return;
    this.captureUndoState();
    const width = Math.max(1, this.resizeWidth);
    const height = Math.max(1, this.resizeHeight);
    const fillChar = getMapCharFromTileType(this.resizeFillTileType);
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

  /** clampPoint：处理clamp坐标。 */
  private clampPoint(point: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }, width: number, height: number): {  
 /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } {
    return {
      x: Math.min(width - 1, Math.max(0, point.x)),
      y: Math.min(height - 1, Math.max(0, point.y)),
    };
  }

  /** findNearestWalkable：查找Nearest Walkable。 */
  private findNearestWalkable(origin: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number }): {  
 /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return null;
    for (let radius = 0; radius <= Math.max(this.draft.width, this.draft.height); radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!isOffsetInRange(dx, dy, radius)) continue;
          const x = origin.x + dx;
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

  /** resetDraft：重置Draft。 */
  private resetDraft(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedMapId) return;
    if (this.dirty && !window.confirm('确定放弃当前地图的未保存修改吗？')) {
      return;
    }
    this.loadMap(this.selectedMapId).catch(() => {});
  }

  /** reloadCurrentMap：重载当前地图。 */
  private async reloadCurrentMap(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedMapId) return;
    if (this.dirty && !window.confirm('当前有未保存修改，重新载入会丢失这些修改。继续吗？')) {
      return;
    }
    await this.loadMap(this.selectedMapId);
  }

  /** applyRawJson：应用Raw JSON。 */
  private applyRawJson(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedMapId) return;
    try {
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

  /** saveCurrentMap：保存当前地图。 */
  private async saveCurrentMap(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft || !this.selectedMapId) {
      this.setStatus('请先选择地图', true);
      return;
    }
    const synced = this.syncInspectorToDraft();
    if ('message' in synced) {
      this.setStatus(synced.message, true);
      return;
    }
    this.saveBtn.disabled = true;
    try {
      await this.request<{      
      /**
 * ok：ok相关字段。
 */
 ok: true }>(`${this.mapApiBasePath}/${encodeURIComponent(this.selectedMapId)}`, {
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

  /** centerView：处理center视图。 */
  private centerView(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return;
    const cellSize = this.getCellSize();
    this.viewCenterX = this.draft.width * cellSize / 2;
    this.viewCenterY = this.draft.height * cellSize / 2;
    this.renderCanvas();
  }

  /** applyZoom：应用缩放。 */
  private applyZoom(delta: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const oldSize = this.getCellSize();
    const gridCenterX = oldSize > 0 ? this.viewCenterX / oldSize : 0;
    const gridCenterY = oldSize > 0 ? this.viewCenterY / oldSize : 0;
    const direction = Math.sign(delta);
    if (direction === 0) return;
    this.zoomLevelIndex = Math.max(0, Math.min(EDITOR_ZOOM_LEVELS.length - 1, this.zoomLevelIndex + direction));
    const nextSize = this.getCellSize();
    this.viewCenterX = gridCenterX * nextSize;
    this.viewCenterY = gridCenterY * nextSize;
    this.renderCanvas();
  }

  /** getCellSize：读取格子Size。 */
  private getCellSize(): number {
    return EDITOR_BASE_CELL_SIZE * EDITOR_ZOOM_LEVELS[this.zoomLevelIndex];
  }

  /** renderCanvas：渲染Canvas。 */
  private renderCanvas(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.renderFrameId !== null) {
      return;
    }
    this.renderFrameId = window.requestAnimationFrame(() => {
      this.renderFrameId = null;
      this.flushCanvasRender();
    });
  }

  /** flushCanvasRender：处理刷新Canvas渲染。 */
  private flushCanvasRender(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.resizeCanvas();
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = '#1a1816';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.draft) return;
    const cellSize = this.getCellSize();
    const screenW = this.canvas.width;
    const screenH = this.canvas.height;
    const camWorldX = this.viewCenterX - screenW / 2;
    const camWorldY = this.viewCenterY - screenH / 2;
    const startGX = Math.floor(camWorldX / cellSize) - 1;
    const startGY = Math.floor(camWorldY / cellSize) - 1;
    const endGX = Math.ceil((camWorldX + screenW) / cellSize) + 1;
    const endGY = Math.ceil((camWorldY + screenH) / cellSize) + 1;
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

        const type = this.getTileTypeAt(gx, gy);
        ctx.fillStyle = TILE_VISUAL_BG_COLORS[type];
        ctx.fillRect(sx, sy, cellSize, cellSize);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx, sy, cellSize, cellSize);

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

        const isLineStart = this.linePaintStart?.x === gx && this.linePaintStart?.y === gy;
        const isSelected = this.selectedCell?.x === gx && this.selectedCell?.y === gy;
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

  /** drawComposePieces：处理draw Compose Pieces。 */
  private drawComposePieces(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft || this.composePieces.length === 0) return;
    const showLabels = cellSize >= 16;
    for (const piece of this.composePieces) {
      const bounds = this.getComposePieceBounds(piece);
      if (!bounds) continue;
      const isSelected = piece.id === this.selectedComposePieceId;
      this.forEachComposePieceTile(piece, (targetX, targetY, sourceChar) => {
        if (targetX < 0 || targetY < 0 || targetX >= this.draft!.width || targetY >= this.draft!.height) {
          return;
        }
        const sx = targetX * cellSize - this.viewCenterX + screenW / 2;
        const sy = targetY * cellSize - this.viewCenterY + screenH / 2;
        if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) return;
        const type = getTileTypeFromMapChar(sourceChar);
        ctx.fillStyle = isSelected ? 'rgba(255, 214, 92, 0.2)' : 'rgba(124, 187, 255, 0.16)';
        ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
        const glyph = TILE_VISUAL_GLYPHS[type];
        if (glyph) {
          ctx.fillStyle = isSelected ? '#ffe8a6' : TILE_VISUAL_GLYPH_COLORS[type];
          ctx.font = buildCanvasFont('tileGlyph', cellSize * 0.52);
          ctx.fillText(glyph, sx + cellSize / 2, sy + cellSize / 2 + 1);
        }
      });

      const boxX = bounds.x * cellSize - this.viewCenterX + screenW / 2;
      const boxY = bounds.y * cellSize - this.viewCenterY + screenH / 2;
      const boxW = bounds.width * cellSize;
      const boxH = bounds.height * cellSize;
      ctx.strokeStyle = isSelected ? 'rgba(255, 211, 84, 0.95)' : 'rgba(116, 187, 255, 0.75)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(boxX + 1, boxY + 1, boxW - 2, boxH - 2);

      if (!showLabels) continue;
      const label = `${piece.sourceMapName} ${piece.rotation}°`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = buildCanvasFont('label', Math.max(11, cellSize * 0.28));
      const textWidth = ctx.measureText(label).width;
      const labelX = boxX + 4;
      const labelY = boxY - 10;
      ctx.fillStyle = 'rgba(15, 12, 10, 0.78)';
      ctx.fillRect(labelX - 3, labelY - 9, textWidth + 8, 18);
      ctx.fillStyle = isSelected ? '#ffe7a8' : '#d7efff';
      ctx.fillText(label, labelX + 1, labelY);
    }
  }

  /** drawEntities：处理draw实体。 */
  private drawEntities(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return;
    const showEntityLabels = cellSize >= 18;
    if (this.selectedEntity?.kind === 'monster') {
      const selectedSpawn = this.draft.monsterSpawns[this.selectedEntity.index];
      if (selectedSpawn) {
        this.drawMonsterSpawnOverlay(ctx, screenW, screenH, cellSize, selectedSpawn);
      }
    }
    if (this.selectedEntity?.kind === 'safeZone') {
      const selectedZone = this.draft.safeZones?.[this.selectedEntity.index];
      if (selectedZone) {
        this.drawSafeZoneOverlay(ctx, screenW, screenH, cellSize, selectedZone);
      }
    }
    const drawEntity = (
      wx: number,
      wy: number,
      char: string,
      color: string,
      name: string,
      kind: 'npc' | 'monster' | 'spawn' | 'container' | 'safeZone',
      labelColor?: string,
    ): void => {
      const sx = wx * cellSize - this.viewCenterX + screenW / 2;
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

    const drawLandmark = (landmark: GmMapLandmarkRecord): void => {
      if (!showEntityLabels) {
        return;
      }
      const sx = landmark.x * cellSize - this.viewCenterX + screenW / 2;
      const sy = landmark.y * cellSize - this.viewCenterY + screenH / 2;
      if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) return;
      const label = landmark.name || landmark.id;
      if (!label) return;
      const anchorY = sy + cellSize + Math.max(12, cellSize * 0.34);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = buildCanvasFont('labelStrong', Math.max(12, cellSize * 0.34));
      const textWidth = ctx.measureText(label).width;
      const paddingX = Math.max(8, cellSize * 0.22);
      const boxHeight = Math.max(20, cellSize * 0.52);
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
  /**
 * drawMonsterSpawnOverlay：执行draw怪物SpawnOverlay相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param screenW number 参数说明。
 * @param screenH number 参数说明。
 * @param cellSize number 参数说明。
 * @param spawn GmMapMonsterSpawnRecord 参数说明。
 * @returns 无返回值，直接更新draw怪物SpawnOverlay相关状态。
 */


  private drawMonsterSpawnOverlay(
    ctx: CanvasRenderingContext2D,
    screenW: number,
    screenH: number,
    cellSize: number,
    spawn: GmMapMonsterSpawnRecord,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) {
      return;
    }
    const spawnRadius = Math.max(0, Math.floor(spawn.radius ?? 0));
    const wanderRadius = Math.max(0, Math.floor(spawn.wanderRadius ?? spawn.radius ?? 0));
    const maxRadius = Math.max(spawnRadius, wanderRadius);
    if (maxRadius <= 0) {
      return;
    }

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
      const sx = x * cellSize - this.viewCenterX + screenW / 2;
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
        const worldX = spawn.x + dx;
        const worldY = spawn.y + dy;
        const inSpawnRadius = spawnRadius > 0 && isOffsetInRange(dx, dy, spawnRadius);
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
    const sx = spawn.x * cellSize - this.viewCenterX + screenW / 2;
    const sy = spawn.y * cellSize - this.viewCenterY + screenH / 2;
    const summary = `生${spawnRadius} 漫${wanderRadius}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = buildCanvasFont('badge', Math.max(11, cellSize * 0.28));
    const paddingX = Math.max(7, cellSize * 0.18);
    const boxHeight = Math.max(18, cellSize * 0.46);
    const boxWidth = ctx.measureText(summary).width + paddingX * 2;
    const anchorY = sy + cellSize + Math.max(12, cellSize * 0.34);
    ctx.fillStyle = 'rgba(12, 18, 16, 0.78)';
    ctx.fillRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeStyle = 'rgba(171, 243, 214, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.fillStyle = '#e5fff5';
    ctx.fillText(summary, sx + cellSize / 2, anchorY + 0.5);
  }  
  /**
 * drawSafeZoneOverlay：执行drawSafeZoneOverlay相关逻辑。
 * @param ctx CanvasRenderingContext2D 上下文信息。
 * @param screenW number 参数说明。
 * @param screenH number 参数说明。
 * @param cellSize number 参数说明。
 * @param zone GmMapSafeZoneRecord 参数说明。
 * @returns 无返回值，直接更新drawSafeZoneOverlay相关状态。
 */


  private drawSafeZoneOverlay(
    ctx: CanvasRenderingContext2D,
    screenW: number,
    screenH: number,
    cellSize: number,
    zone: GmMapSafeZoneRecord,
  ): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) {
      return;
    }
    const radius = Math.max(0, Math.floor(zone.radius ?? 0));

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
      const sx = x * cellSize - this.viewCenterX + screenW / 2;
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
    const sx = zone.x * cellSize - this.viewCenterX + screenW / 2;
    const sy = zone.y * cellSize - this.viewCenterY + screenH / 2;
    const summary = `安${radius}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = buildCanvasFont('badge', Math.max(11, cellSize * 0.28));
    const paddingX = Math.max(7, cellSize * 0.18);
    const boxHeight = Math.max(18, cellSize * 0.46);
    const boxWidth = ctx.measureText(summary).width + paddingX * 2;
    const anchorY = sy + cellSize + Math.max(12, cellSize * 0.34);
    ctx.fillStyle = 'rgba(9, 22, 18, 0.8)';
    ctx.fillRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeStyle = 'rgba(141, 255, 221, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + cellSize / 2 - boxWidth / 2, anchorY - boxHeight / 2, boxWidth, boxHeight);
    ctx.fillStyle = '#eafff8';
    ctx.fillText(summary, sx + cellSize / 2, anchorY + 0.5);
  }

  /** resizeCanvas：处理resize Canvas。 */
  private resizeCanvas(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const width = Math.max(1, Math.floor(this.canvasHost.clientWidth));
    const height = Math.max(1, Math.floor(this.canvasHost.clientHeight));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /** handleCanvasPointerDown：处理Canvas Pointer Down。 */
  private handleCanvasPointerDown(event: PointerEvent): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const point = this.screenToGrid(event.clientX, event.clientY);
    const currentTool = this.getCurrentTool();
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
    const hitComposePiece = this.findComposePieceAt(point.x, point.y);
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

  /** sampleTileAt：处理sample地块At。 */
  private sampleTileAt(x: number, y: number): void {
    const nextType = this.getTileTypeAt(x, y);
    this.paintTileType = nextType;
    this.setStatus(`已吸取地块 ${TILE_TYPE_LABELS[nextType]} (${x}, ${y})`);
    this.renderToolControls();
  }

  /** handleCanvasPointerMove：处理Canvas Pointer移动。 */
  private handleCanvasPointerMove(event: PointerEvent): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        const piece = this.getSelectedComposePiece();
        if (piece) {
          const nextX = point.x - this.composeDragOffsetX;
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

  /** endPointerInteraction：处理end Pointer交互。 */
  private endPointerInteraction(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** screenToGrid：处理屏幕To Grid。 */
  private screenToGrid(clientX: number, clientY: number): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return null;
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return null;
    const cellSize = this.getCellSize();
    const worldX = sx + this.viewCenterX - rect.width / 2;
    const worldY = sy + this.viewCenterY - rect.height / 2;
    const x = Math.floor(worldX / cellSize);
    const y = Math.floor(worldY / cellSize);
    if (x < 0 || y < 0 || x >= this.draft.width || y >= this.draft.height) return null;
    return { x, y };
  }

  /** paintTileAt：处理paint地块At。 */
  private paintTileAt(x: number, y: number, recordUndo = false): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return false;
    const key = `${x},${y}`;
    if (this.lastPaintKey === key) return false;
    this.lastPaintKey = key;
    return this.applyTilePaint([{ x, y }], recordUndo) > 0;
  }

  /** paintAuraAt：处理paint灵气At。 */
  private paintAuraAt(x: number, y: number, recordUndo = false): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return false;
    const key = `${x},${y}`;
    if (this.lastPaintKey === key) return false;
    this.lastPaintKey = key;
    return this.applyAuraPaint([{ x, y }], recordUndo) > 0;
  }

  /** paintResourceAt：处理paint资源At。 */
  private paintResourceAt(x: number, y: number, recordUndo = false): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return false;
    const key = `${x},${y},${this.resourcePaintKey}`;
    if (this.lastPaintKey === key) return false;
    this.lastPaintKey = key;
    return this.applyResourcePaint([{ x, y }], recordUndo) > 0;
  }

  /** applyLinePaint：应用Line Paint。 */
  private applyLinePaint(start: GridPoint, end: GridPoint): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const changed = this.paintLayer === 'tile'
      ? this.applyTilePaint(this.getLinePoints(start, end), true)
      : this.paintLayer === 'aura'
        ? this.applyAuraPaint(this.getLinePoints(start, end), true)
        : this.applyResourcePaint(this.getLinePoints(start, end), true);
    if (changed > 0) {
      this.setStatus(`已沿直线填充 ${changed} 个${this.paintLayer === 'tile' ? '格子' : this.paintLayer === 'aura' ? '无属性灵气点' : '气机点'}`);
    }
  }

  /** applyTilePaint：应用地块Paint。 */
  private applyTilePaint(points: GridPoint[], recordUndo: boolean): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return 0;
    const nextType = this.paintTileType;
    const nextChar = getMapCharFromTileType(nextType);
    const changedPoints: GridPoint[] = [];
    const visited = new Set<string>();
    for (const point of points) {
      const key = `${point.x},${point.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
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

  /** applyAuraPaint：应用灵气Paint。 */
  private applyAuraPaint(points: GridPoint[], recordUndo: boolean, overrideValue?: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return 0;
    const nextValue = Math.max(0, Math.floor(overrideValue ?? this.auraPaintValue));
    const selectedAuraPoint = this.selectedEntity?.kind === 'aura' ? this.getSelectedEntityPoint() : null;
    const nextAuras = [...(this.draft.auras ?? [])];
    const changedKeys = new Set<string>();

    for (const point of points) {
      const key = `${point.x},${point.y}`;
      if (changedKeys.has(key)) continue;
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
      const nextIndex = nextAuras.findIndex((point) => point.x === selectedAuraPoint.x && point.y === selectedAuraPoint.y);
      this.selectedEntity = nextIndex >= 0 ? { kind: 'aura', index: nextIndex } : null;
    }
    this.markDirty(false);
    return changedKeys.size;
  }  
  /**
 * applyResourcePaint：处理ResourcePaint并更新相关状态。
 * @param points GridPoint[] 参数说明。
 * @param recordUndo boolean 参数说明。
 * @param overrideValue number 参数说明。
 * @param overrideResourceKey string 参数说明。
 * @returns 返回ResourcePaint。
 */


  private applyResourcePaint(
    points: GridPoint[],
    recordUndo: boolean,
    overrideValue?: number,
    overrideResourceKey?: string,
  ): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return 0;
    const resourceKey = (overrideResourceKey ?? this.resourcePaintKey).trim();
    if (!resourceKey) {
      this.setStatus('资源键不能为空', true);
      return 0;
    }
    const nextValue = Math.max(0, Math.floor(overrideValue ?? this.resourcePaintValue));
    const selectedResourcePoint = this.selectedEntity?.kind === 'resource' ? this.getSelectedEntityPoint() : null;
    const nextResources = [...(this.draft.resources ?? [])];
    const changedKeys = new Set<string>();

    for (const point of points) {
      const key = `${point.x},${point.y},${resourceKey}`;
      if (changedKeys.has(key)) continue;
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
      const nextIndex = nextResources.findIndex((point) => point.x === selectedResourcePoint.x && point.y === selectedResourcePoint.y);
      this.selectedEntity = nextIndex >= 0 ? { kind: 'resource', index: nextIndex } : null;
    }
    this.resourcePaintKey = resourceKey;
    this.markDirty(false);
    return changedKeys.size;
  }

  /** findResourceIndex：查找资源索引。 */
  private findResourceIndex(x: number, y: number, resourceKey: string): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) {
      return -1;
    }
    return (this.draft.resources ?? []).findIndex((point) => point.x === x && point.y === y && getResourceRecordKey(point) === resourceKey);
  }

  /** getLinePoints：读取Line坐标。 */
  private getLinePoints(start: GridPoint, end: GridPoint): GridPoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const points: GridPoint[] = [];
    let x0 = start.x;
    let y0 = start.y;
    const x1 = end.x;
    const y1 = end.y;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      points.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
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

  /** hasBlockingMapObjectAt：判断是否Blocking地图Object At。 */
  private hasBlockingMapObjectAt(x: number, y: number, ignoredSelection: MapEntitySelection = null): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return false;
    if (this.draft.spawnPoint.x === x && this.draft.spawnPoint.y === y) return true;
    if (this.draft.portals.some((portal, index) => !(ignoredSelection?.kind === 'portal' && ignoredSelection.index === index) && portal.x === x && portal.y === y)) return true;
    if (this.draft.npcs.some((npc, index) => !(ignoredSelection?.kind === 'npc' && ignoredSelection.index === index) && npc.x === x && npc.y === y)) return true;
    if (this.draft.monsterSpawns.some((spawn, index) => !(ignoredSelection?.kind === 'monster' && ignoredSelection.index === index) && spawn.x === x && spawn.y === y)) return true;
    return false;
  }

  /** hasAuraAt：判断是否灵气At。 */
  private hasAuraAt(x: number, y: number, ignoredIndex?: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return false;
    return (this.draft.auras ?? []).some((point, index) => index !== ignoredIndex && point.x === x && point.y === y);
  }

  /** hasResourceAt：判断是否资源At。 */
  private hasResourceAt(x: number, y: number, resourceKey: string, ignoredIndex?: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return false;
    return (this.draft.resources ?? []).some((point, index) => (
      index !== ignoredIndex
      && point.x === x
      && point.y === y
      && getResourceRecordKey(point) === resourceKey
    ));
  }

  /** hasLandmarkAt：判断是否地标At。 */
  private hasLandmarkAt(x: number, y: number, ignoredIndex?: number): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return false;
    return (this.draft.landmarks ?? []).some((landmark, index) => index !== ignoredIndex && landmark.x === x && landmark.y === y);
  }

  /** ensureSelectedCell：确保Selected格子。 */
  private ensureSelectedCell(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedCell) {
      this.setStatus('请先在画布上选中一个格子', true);
      return false;
    }
    return true;
  }

  /** ensureWalkableSelection：确保Walkable选中项。 */
  private ensureWalkableSelection(label: string): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedCell) return false;
    if (!isTileTypeWalkable(this.getTileTypeAt(this.selectedCell.x, this.selectedCell.y))) {
      this.setStatus(`${label} 必须放在可通行地块上`, true);
      return false;
    }
    return true;
  }

  /** getTileTypeAt：读取地块类型At。 */
  private getTileTypeAt(x: number, y: number): TileType {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return TileType.Floor;
    return getTileTypeFromMapChar(this.draft.tiles[y]?.[x] ?? '.');
  }

  /** findEntityAt：查找实体At。 */
  private findEntityAt(x: number, y: number): MapEntitySelection {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return null;
    const npcIndex = this.draft.npcs.findIndex((npc) => npc.x === x && npc.y === y);
    if (npcIndex >= 0) return { kind: 'npc', index: npcIndex };
    const monsterIndex = this.draft.monsterSpawns.findIndex((spawn) => spawn.x === x && spawn.y === y);
    if (monsterIndex >= 0) return { kind: 'monster', index: monsterIndex };
    const portalIndex = this.draft.portals.findIndex((portal) => portal.x === x && portal.y === y);
    if (portalIndex >= 0) return { kind: 'portal', index: portalIndex };
    const auraIndex = (this.draft.auras ?? []).findIndex((point) => point.x === x && point.y === y);
    if (auraIndex >= 0) return { kind: 'aura', index: auraIndex };
    const resourceIndex = (this.draft.resources ?? []).findIndex((point) => point.x === x && point.y === y);
    if (resourceIndex >= 0) return { kind: 'resource', index: resourceIndex };
    const safeZoneIndex = (this.draft.safeZones ?? []).findIndex((zone) => zone.x === x && zone.y === y);
    if (safeZoneIndex >= 0) return { kind: 'safeZone', index: safeZoneIndex };
    const containerIndex = (this.draft.landmarks ?? []).findIndex((landmark) => landmark.container && landmark.x === x && landmark.y === y);
    if (containerIndex >= 0) return { kind: 'container', index: containerIndex };
    const landmarkIndex = (this.draft.landmarks ?? []).findIndex((landmark) => landmark.x === x && landmark.y === y);
    if (landmarkIndex >= 0) return { kind: 'landmark', index: landmarkIndex };
    return null;
  }

  /** getSelectedEntityPoint：读取Selected实体坐标。 */
  private getSelectedEntityPoint(): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft || !this.selectedEntity) return null;
    if (this.selectedEntity.kind === 'portal') {
      const portal = this.draft.portals[this.selectedEntity.index];
      return portal ? { x: portal.x, y: portal.y } : null;
    }
    if (this.selectedEntity.kind === 'npc') {
      const npc = this.draft.npcs[this.selectedEntity.index];
      return npc ? { x: npc.x, y: npc.y } : null;
    }
    if (this.selectedEntity.kind === 'monster') {
      const spawn = this.draft.monsterSpawns[this.selectedEntity.index];
      return spawn ? { x: spawn.x, y: spawn.y } : null;
    }
    if (this.selectedEntity.kind === 'aura') {
      const aura = this.draft.auras?.[this.selectedEntity.index];
      return aura ? { x: aura.x, y: aura.y } : null;
    }
    if (this.selectedEntity.kind === 'resource') {
      const resource = this.draft.resources?.[this.selectedEntity.index];
      return resource ? { x: resource.x, y: resource.y } : null;
    }
    if (this.selectedEntity.kind === 'safeZone') {
      const zone = this.draft.safeZones?.[this.selectedEntity.index];
      return zone ? { x: zone.x, y: zone.y } : null;
    }
    if (this.selectedEntity.kind === 'container') {
      const landmark = this.getContainerLandmark(this.selectedEntity.index);
      return landmark ? { x: landmark.x, y: landmark.y } : null;
    }
    const landmark = this.draft.landmarks?.[this.selectedEntity.index];
    return landmark ? { x: landmark.x, y: landmark.y } : null;
  }

  /** createUndoEntry：创建Undo条目。 */
  private createUndoEntry(): EditorUndoEntry | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** captureUndoState：处理capture Undo状态。 */
  private captureUndoState(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const entry = this.createUndoEntry();
    if (!entry) return;
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_UNDO_STEPS) {
      this.undoStack.shift();
    }
    this.updateUndoButtonState();
  }

  /** restoreUndoEntry：处理restore Undo条目。 */
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

  /** undo：处理undo。 */
  private undo(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** updateUndoButtonState：更新Undo按钮状态。 */
  private updateUndoButtonState(): void {
    this.undoBtn.disabled = !this.draft || this.undoStack.length === 0;
  }

  /** handleKeyDown：处理Key Down。 */
  private handleKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      if (this.canvasHost.offsetParent === null || isEditableTarget(event.target)) return;
      event.preventDefault();
      this.undo();
    }
  }

  /** markDirty：标记Dirty。 */
  private markDirty(render = true): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.dirty = true;
    this.updateUndoButtonState();
    if (render) this.renderInspector();
    else this.jsonEl.value = formatJson(this.draft);
  }
}
