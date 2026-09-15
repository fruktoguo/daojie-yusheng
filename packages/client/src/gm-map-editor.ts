/**
 * 本文件属于客户端 GM 工具链，负责地图编辑、世界查看或管理端辅助展示。
 *
 * 维护时要把 GM 能力限定在受控入口，并避免普通玩家客户端路径依赖管理端状态。
 */
/**
 * GM 地图编辑器 —— Canvas 可视化地图编辑，支持地块绘制、对象管理、撤销与 JSON 导入导出
 * 当前作为 GM 独立编辑器工具继续保留，不并入玩家主线 main.ts，也不作为主线硬切的前台阻塞项。
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
  InteractableKind,
  TECHNIQUE_GRADE_LABELS,
  StructureType,
  SurfaceType,
  TerrainType,
  Tile,
  TileType,
  TILE_TYPE_LABELS,
  TILE_VISUAL_BG_COLORS,
  TILE_VISUAL_GLYPHS,
  TILE_VISUAL_GLYPH_COLORS,
  composeTileTypeFromLayers,
  getMapCharFromTileType,
  getTileTypeFromMapChar,
  resolveTileLayerSeedFromTileType,
  getAuraLevel,
  doesTileTypeBlockSight,
  isOffsetInRange,
  isTileTypeWalkable,
  normalizeConfiguredAuraValue,
  parseQiResourceKey,
} from '@mud/shared';
import { t } from './ui/i18n';
import {
  AURA_BRUSH_LEVELS,
  EDITOR_BASE_CELL_SIZE,
  EDITOR_ZOOM_LEVELS,
  DEFAULT_EDITOR_ZOOM_INDEX,
  MAX_UNDO_STEPS,
  INSPECTOR_TABS,
  TOOL_OPTIONS,
  PAINT_TILE_TYPES,
  PAINT_TERRAIN_TYPES,
  PAINT_SURFACE_TYPES,
  PAINT_STRUCTURE_TYPES,
  PAINT_INTERACTABLE_KINDS,
  PAINT_LAYER_OPTIONS,
} from './constants/editor/map-editor';
import { buildCanvasFont } from './constants/ui/text';
import { runtimeImagePack, type RuntimeTileVisualSource } from './renderer/runtime-image-pack';
import { formatMapRecommendedRealmLabel } from './utils/map-level-display';
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
import { renderSelectedEntitySectionHtml, renderPortalTabHtml, renderNpcTabHtml, renderMonsterTabHtml, renderAuraTabHtml, renderSafeZoneTabHtml, renderLandmarkTabHtml, renderContainerTabHtml, renderComposeTabHtml, renderResourceTabHtml, describeSelectedEntityHtml, renderSelectionTabHtml, renderMetaTabHtml } from './gm-map-editor.inspector';
import {
  findComposePieceAtImpl,
  ensureComposeSourceMapImpl,
  getComposePieceSizeImpl,
  getComposePieceBoundsImpl,
  clampComposePiecePositionImpl,
  getSelectedComposePieceImpl,
  addComposePieceImpl,
  updateComposePieceImpl,
  rotateSelectedComposePieceImpl,
  removeSelectedComposePieceImpl,
  clearComposePiecesImpl,
  forEachComposePieceTileImpl,
  bakeComposePieceImpl,
  bakeSelectedComposePieceImpl,
  bakeAllComposePiecesImpl,
} from './gm-map-editor.compose';
import {
  addPortalAtCurrentCellImpl,
  addNpcAtCurrentCellImpl,
  addQuestToSelectedNpcImpl,
  removeQuestFromSelectedNpcImpl,
  addMonsterAtCurrentCellImpl,
  addAuraAtCurrentCellImpl,
  applyResourceBrushKeyImpl,
  addResourceAtCurrentCellImpl,
  addSafeZoneAtCurrentCellImpl,
  addLandmarkAtCurrentCellImpl,
  addContainerAtCurrentCellImpl,
  addLootPoolToSelectedContainerImpl,
  removeLootPoolFromSelectedContainerImpl,
  moveSelectedEntityToCurrentCellImpl,
  moveSelectedEntityToPointImpl,
  removeSelectedEntityImpl,
} from './gm-map-editor.entities';
import {
  centerViewImpl,
  applyZoomImpl,
  getCellSizeImpl,
  renderCanvasImpl,
  flushCanvasRenderImpl,
  buildVisibleTileTypeRowsImpl,
  buildVisibleTileVisualSourceRowsImpl,
  getCachedTileVisualSourceImpl,
  drawComposePiecesImpl,
  drawEntitiesImpl,
  drawMonsterSpawnOverlayImpl,
  drawSafeZoneOverlayImpl,
  resizeCanvasImpl,
} from './gm-map-editor.canvas';
import {
  handleCanvasPointerDownImpl,
  sampleTileAtImpl,
  handleCanvasPointerMoveImpl,
  endPointerInteractionImpl,
  screenToGridImpl,
  paintAtImpl,
  paintTileAtImpl,
  paintLayerAtImpl,
  paintAuraAtImpl,
  paintResourceAtImpl,
  applyLinePaintImpl,
  applyTilePaintImpl,
  applyLayerPaintImpl,
  ensureLayerRowsImpl,
  previewLayerPaintTileTypeImpl,
  isLayerPaintNoopImpl,
  getLayerStateAtImpl,
  syncLegacyTileFromLayersImpl,
  applyAuraPaintImpl,
  applyResourcePaintImpl,
  findResourceIndexImpl,
  getLinePointsImpl,
  hasBlockingMapObjectAtImpl,
  hasAuraAtImpl,
  hasResourceAtImpl,
  hasLandmarkAtImpl,
  ensureSelectedCellImpl,
  ensureWalkableSelectionImpl,
  getTileTypeAtImpl,
  getTileVisualSourceAtImpl,
  findEntityAtImpl,
  getSelectedEntityPointImpl,
} from './gm-map-editor.paint';

const RUNTIME_IMAGE_PACK_WATCH_INTERVAL_MS = 120;
const RUNTIME_IMAGE_PACK_WATCH_TICKS = 40;

export function makeGridPointKey(x: number, y: number, width: number): number {
  return y * width + x;
}

export function createRuntimePreviewTile(source: RuntimeTileVisualSource): Tile {
  return {
    type: source.type,
    walkable: isTileTypeWalkable(source.type),
    blocksSight: doesTileTypeBlockSight(source.type),
    aura: 0,
    occupiedBy: null,
    modifiedAt: null,
    terrainType: source.terrainType,
    surfaceType: source.surfaceType,
    structureType: source.structureType,
    interactableKinds: source.interactableKinds,
  };
}

/** RequestFn：地图编辑器的请求回调签名。 */
export type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;
/** StatusFn：向状态栏输出提示或错误的回调签名。 */
export type StatusFn = (message: string, isError?: boolean) => void;
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
  /** 是否在编辑器画布中启用 dual-grid 地块预览。 */
  dualGridRenderingEnabled?: boolean;
  /**
 * itemCatalog：道具目录相关字段。
 */

  itemCatalog?: GmEditorItemOption[];
};

/** MapEntitySelection：编辑器当前选中的地图实体定位。 */
export type MapEntitySelection =
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
export type MapEntityKind = 'portal' | 'npc' | 'monster' | 'aura' | 'resource' | 'safeZone' | 'landmark' | 'container';

/** MapTool：地图编辑器当前激活的工具模式。 */
export type MapTool = 'select' | 'paint' | 'pan';
/** PaintLayer：刷点时正在编辑的图层类型。 */
export type PaintLayer = 'tile' | 'terrain' | 'surface' | 'structure' | 'interactable' | 'aura' | 'resource';
/** InspectorTabId：属性面板中可切换的编辑标签页。 */
export type InspectorTabId = 'selection' | 'meta' | 'compose' | 'portal' | 'npc' | 'monster' | 'aura' | 'resource' | 'safeZone' | 'landmark' | 'container';
/** GridPoint：地图网格坐标。 */
export type GridPoint = {
/**
 * x：x相关字段。
 */
 x: number;
 /**
 * y：y相关字段。
 */
 y: number };
/** ComposeRotation：合图子块支持的直角旋转角度。 */
export type ComposeRotation = 0 | 90 | 180 | 270;

/** TileResourcePoint：地图上的资源刷点记录。 */
export type TileResourcePoint = GmMapResourceRecord;
/** MapComposePiece：合图预览中的单个来源地图块。 */
export type MapComposePiece = {
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
const TERRAIN_TYPE_LABELS: Record<TerrainType, string> = {
  [TerrainType.Floor]: '地面',
  [TerrainType.Grass]: '草地',
  [TerrainType.Hill]: '丘陵',
  [TerrainType.Cliff]: '峭壁',
  [TerrainType.Mud]: '泥地',
  [TerrainType.Swamp]: '沼泽',
  [TerrainType.ColdBog]: '寒沼',
  [TerrainType.MoltenPool]: '熔池',
  [TerrainType.Water]: '水域',
  [TerrainType.Cloud]: '云障',
  [TerrainType.CloudFloor]: '云地',
  [TerrainType.Void]: '虚空',
};
const SURFACE_TYPE_LABELS: Record<SurfaceType, string> = {
  [SurfaceType.Floor]: '地板',
  [SurfaceType.Road]: '道路',
  [SurfaceType.Trail]: '小径',
  [SurfaceType.Veranda]: '回廊',
  [SurfaceType.StoneStairs]: '石阶',
  [SurfaceType.FormationGlyph]: '法阵纹',
};
const STRUCTURE_TYPE_LABELS: Record<StructureType, string> = {
  [StructureType.Wall]: '墙',
  [StructureType.Door]: '门',
  [StructureType.Window]: '窗',
  [StructureType.HouseEave]: '屋檐',
  [StructureType.HouseCorner]: '转角',
  [StructureType.ScreenWall]: '影壁',
  [StructureType.Tree]: '树',
  [StructureType.Bamboo]: '竹',
  [StructureType.Stone]: '石头',
  [StructureType.SpiritOre]: '灵矿',
  [StructureType.BlackIronOre]: '玄铁矿',
  [StructureType.BrokenSwordHeap]: '断剑堆',
};
const INTERACTABLE_KIND_LABELS: Record<InteractableKind, string> = {
  [InteractableKind.Portal]: '传送点',
  [InteractableKind.Stairs]: '楼梯',
  [InteractableKind.Container]: '容器',
  [InteractableKind.Formation]: '阵法',
  [InteractableKind.Mechanism]: '机关',
};
const TERRAIN_SELECT_OPTIONS = PAINT_TERRAIN_TYPES.map((value) => ({
  value,
  label: TERRAIN_TYPE_LABELS[value] ?? '未知地貌',
}));
const SURFACE_SELECT_OPTIONS = PAINT_SURFACE_TYPES.map((value) => ({
  value: value ?? '',
  label: value ? SURFACE_TYPE_LABELS[value] ?? '未知地表' : '无',
}));
const STRUCTURE_SELECT_OPTIONS = PAINT_STRUCTURE_TYPES.map((value) => ({
  value: value ?? '',
  label: value ? STRUCTURE_TYPE_LABELS[value] ?? '未知结构' : '无',
}));
const INTERACTABLE_SELECT_OPTIONS = PAINT_INTERACTABLE_KINDS.map((value) => ({
  value: value ?? '',
  label: value ? INTERACTABLE_KIND_LABELS[value] ?? '未知交互物' : '无',
}));

/** EditorUndoEntry：撤销栈里保存的整份编辑草稿快照。 */
export type EditorUndoEntry = {
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

export function areStringListsEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function setAuraPointValue(draft: GmMapDocument, x: number, y: number, value: number): void {
  const nextValue = Math.max(0, Math.floor(Number(value) || 0));
  const auras = Array.isArray(draft.auras) ? [...draft.auras] : [];
  const index = auras.findIndex((point) => point.x === x && point.y === y);
  if (nextValue <= 0) {
    if (index >= 0) {
      auras.splice(index, 1);
    }
    draft.auras = auras;
    return;
  }
  if (index >= 0) {
    auras[index] = { ...auras[index]!, value: nextValue };
  } else {
    auras.push({ x, y, value: nextValue });
  }
  draft.auras = auras.sort((left, right) => left.y - right.y || left.x - right.x);
}

function normalizeSingleInteractableRows(draft: GmMapDocument): void {
  if (!Array.isArray(draft.interactableRows)) {
    return;
  }
  draft.interactableRows = draft.interactableRows.map((row) => row.map((cell) => {
    const first = Array.isArray(cell) && typeof cell[0] === 'string' && cell[0].trim()
      ? cell[0] as InteractableKind
      : null;
    return first ? [first] : [];
  }));
}

function syncAllLegacyTilesFromLayers(draft: GmMapDocument): void {
  if (!Array.isArray(draft.terrainRows)
    && !Array.isArray(draft.surfaceRows)
    && !Array.isArray(draft.structureRows)
    && !Array.isArray(draft.interactableRows)) {
    return;
  }
  const rows: string[] = [];
  const width = Math.max(0, Math.trunc(Number(draft.width) || 0));
  const height = Math.max(0, Math.trunc(Number(draft.height) || 0));
  for (let y = 0; y < height; y += 1) {
    let row = '';
    for (let x = 0; x < width; x += 1) {
      row += getMapCharFromTileType(composeTileTypeFromLayers(
        draft.terrainRows?.[y]?.[x],
        draft.surfaceRows?.[y]?.[x] ?? null,
        draft.structureRows?.[y]?.[x] ?? null,
        draft.interactableRows?.[y]?.[x] ?? [],
      ));
    }
    rows.push(row);
  }
  draft.tiles = rows;
}

/** GM 地图可视化编辑器，支持地块绘制、对象增删、撤销和 JSON 导入导出 */
export class GmMapEditor {
  /** listEl：列表元素。 */
  readonly listEl = document.getElementById('map-list') as HTMLDivElement;
  /** searchInput：搜索输入。 */
  readonly searchInput = document.getElementById('map-search') as HTMLInputElement;
  /** saveBtn：保存按钮。 */
  readonly saveBtn = document.getElementById('map-save') as HTMLButtonElement;
  /** resetBtn：reset按钮。 */
  readonly resetBtn = document.getElementById('map-reset') as HTMLButtonElement;
  /** reloadBtn：重载按钮。 */
  readonly reloadBtn = document.getElementById('map-reload') as HTMLButtonElement;
  /** undoBtn：undo按钮。 */
  readonly undoBtn = document.getElementById('map-undo') as HTMLButtonElement;
  /** refreshListBtn：refresh列表按钮。 */
  readonly refreshListBtn = document.getElementById('map-refresh-list') as HTMLButtonElement;
  /** centerBtn：center按钮。 */
  readonly centerBtn = document.getElementById('map-center') as HTMLButtonElement;
  /** zoomOutBtn：缩放Out按钮。 */
  readonly zoomOutBtn = document.getElementById('map-zoom-out') as HTMLButtonElement;
  /** zoomInBtn：缩放In按钮。 */
  readonly zoomInBtn = document.getElementById('map-zoom-in') as HTMLButtonElement;
  /** statusEl：状态元素。 */
  readonly statusEl = document.getElementById('map-status-bar') as HTMLDivElement;
  /** canvasHost：canvas宿主元素。 */
  readonly canvasHost = document.getElementById('map-editor-host') as HTMLDivElement;
  /** canvas：canvas。 */
  readonly canvas = document.getElementById('map-editor-canvas') as HTMLCanvasElement;
  /** canvasEmptyEl：canvas Empty元素。 */
  readonly canvasEmptyEl = document.getElementById('map-canvas-empty') as HTMLDivElement;
  /** editorEmptyEl：编辑器Empty元素。 */
  readonly editorEmptyEl = document.getElementById('map-editor-empty') as HTMLDivElement;
  /** editorPanelEl：编辑器面板元素。 */
  readonly editorPanelEl = document.getElementById('map-editor-panel') as HTMLDivElement;
  /** summaryEl：摘要元素。 */
  readonly summaryEl = document.getElementById('map-summary') as HTMLDivElement;
  /** toolButtonsEl：tool按钮元素。 */
  readonly toolButtonsEl = document.getElementById('map-tool-buttons') as HTMLDivElement;
  /** paintLayerTabsEl：paint层标签页元素。 */
  readonly paintLayerTabsEl = document.getElementById('map-paint-layer-tabs') as HTMLDivElement | null;
  /** tilePaletteEl：地块Palette元素。 */
  readonly tilePaletteEl = document.getElementById('map-tile-palette') as HTMLDivElement;
  /** inspectorEl：inspector元素。 */
  readonly inspectorEl = document.getElementById('map-inspector-content') as HTMLDivElement;
  /** jsonEl：JSON元素。 */
  readonly jsonEl = document.getElementById('map-json') as HTMLTextAreaElement;
  /** applyJsonBtn：apply JSON按钮。 */
  readonly applyJsonBtn = document.getElementById('map-apply-json') as HTMLButtonElement;
  /** ctx：ctx。 */
  readonly ctx = this.canvas.getContext('2d');
  /** mapApiBasePath：地图Api基础路径。 */
  readonly mapApiBasePath: string;
  /** syncedSummaryLabel：synced摘要标签。 */
  readonly syncedSummaryLabel: string;
  /** itemCatalog：物品目录。 */
  itemCatalog: GmEditorItemOption[] = [];

  /** mapList：地图列表。 */
  mapList: GmMapSummary[] = [];
  /** selectedMapId：selected地图ID。 */
  selectedMapId: string | null = null;
  /** draft：draft。 */
  draft: GmMapDocument | null = null;
  /** dirty：dirty。 */
  dirty = false;
  /** activeTool：活跃Tool。 */
  activeTool: MapTool = 'paint';
  /** forcedTool：forced Tool。 */
  forcedTool: MapTool | null = null;
  /** paintTileType：paint地块类型。 */
  paintTileType: TileType = TileType.Grass;
  paintTerrainType: TerrainType = TerrainType.Grass;
  paintSurfaceType: SurfaceType | null = SurfaceType.Floor;
  paintStructureType: StructureType | null = StructureType.Wall;
  paintInteractableKind: InteractableKind | null = null;
  /** paintLayer：paint层。 */
  paintLayer: PaintLayer = 'tile';
  /** auraPaintValue：灵气Paint值。 */
  auraPaintValue = 1;
  /** resourcePaintValue：资源Paint值。 */
  resourcePaintValue = 1;
  /** resourcePaintKey：资源Paint Key。 */
  resourcePaintKey = DEFAULT_RESOURCE_KEY;
  /** composeSourceMapId：compose来源地图ID。 */
  composeSourceMapId = '';
  /** composePieces：compose Pieces。 */
  composePieces: MapComposePiece[] = [];
  /** selectedComposePieceId：selected Compose Piece ID。 */
  selectedComposePieceId: string | null = null;

  /** window 事件监听器引用，用于 dispose 时移除。 */
  readonly _windowKeydownHandler = (event: KeyboardEvent) => this.handleKeyDown(event);
  readonly _windowBlurHandler = () => this.endPointerInteraction();
  readonly _windowResizeHandler = () => this.renderCanvas();
  /** composeSourceCache：compose来源缓存。 */
  readonly composeSourceCache = new Map<string, GmMapDocument>();
  /** composeDragActive：compose Drag活跃。 */
  composeDragActive = false;
  /** composeDragOffsetX：compose Drag偏移X。 */
  composeDragOffsetX = 0;
  /** composeDragOffsetY：compose Drag偏移Y。 */
  composeDragOffsetY = 0;
  /** composePieceCounter：compose Piece Counter。 */
  composePieceCounter = 1;  
  /**
 * selectedCell：selectedCell相关字段。
 */

  selectedCell: {  
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

  hoveredCell: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null = null;
  /** selectedEntity：selected实体。 */
  selectedEntity: MapEntitySelection = null;
  /** currentInspectorTab：当前Inspector Tab。 */
  currentInspectorTab: InspectorTabId = 'selection';
  /** resizeWidth：resize Width。 */
  resizeWidth = 0;
  /** resizeHeight：resize Height。 */
  resizeHeight = 0;
  /** resizeFillTileType：resize Fill地块类型。 */
  resizeFillTileType: TileType = TileType.Grass;
  /** viewCenterX：视图Center X。 */
  viewCenterX = 0;
  /** viewCenterY：视图Center Y。 */
  viewCenterY = 0;
  /** paintActive：paint活跃。 */
  paintActive = false;
  /** panActive：pan活跃。 */
  panActive = false;
  /** lastPaintKey：last Paint Key。 */
  lastPaintKey: string | null = null;
  /** panStartClientX：pan Start客户端X。 */
  panStartClientX = 0;
  /** panStartClientY：pan Start客户端Y。 */
  panStartClientY = 0;
  /** panStartCenterX：pan Start Center X。 */
  panStartCenterX = 0;
  /** panStartCenterY：pan Start Center Y。 */
  panStartCenterY = 0;
  /** activePointerId：活跃Pointer ID。 */
  activePointerId: number | null = null;
  /** activePanButtonMask：活跃Pan按钮掩码。 */
  activePanButtonMask = 0;
  /** listLoaded：列表已加载。 */
  listLoaded = false;
  /** zoomLevelIndex：缩放等级索引。 */
  zoomLevelIndex = DEFAULT_EDITOR_ZOOM_INDEX;
  /** paintSessionHasUndoSnapshot：paint会话Has Undo快照。 */
  paintSessionHasUndoSnapshot = false;
  /** dragEntityActive：drag实体活跃。 */
  dragEntityActive = false;
  /** dragSessionHasUndoSnapshot：drag会话Has Undo快照。 */
  dragSessionHasUndoSnapshot = false;
  /** linePaintStart：line Paint Start。 */
  linePaintStart: GridPoint | null = null;
  /** undoStack：undo Stack。 */
  undoStack: EditorUndoEntry[] = [];
  /** renderFrameId：渲染帧ID。 */
  renderFrameId: number | null = null;  
  /** runtimeImagePackWatchTimerId：runtime 图包异步加载后的刷新定时器。 */
  runtimeImagePackWatchTimerId: number | null = null;
  /** runtimeImagePackWatchTicksRemaining：runtime 图包加载刷新剩余观察次数。 */
  runtimeImagePackWatchTicksRemaining = 0;
  /** runtimeImagePackRevision：上次已渲染的 runtime 图包版本。 */
  runtimeImagePackRevision = runtimeImagePack.getRevision();
  /** 编辑器画布是否启用 dual-grid 地块预览。 */
  dualGridRenderingEnabled = true;
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param request RequestFn 请求参数。
 * @param setGlobalStatus StatusFn 参数说明。
 * @param options GmMapEditorOptions 选项参数。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(
    readonly request: RequestFn,
    readonly setGlobalStatus: StatusFn,
    options: GmMapEditorOptions = {},
  ) {
    this.mapApiBasePath = options.mapApiBasePath ?? `${GM_API_BASE_PATH}/maps`;
    this.syncedSummaryLabel = options.syncedSummaryLabel ?? '已与服务端同步';
    this.dualGridRenderingEnabled = options.dualGridRenderingEnabled !== false;
    this.itemCatalog = options.itemCatalog ? clone(options.itemCatalog) : [];
    this.bindEvents();
    this.renderToolControls();
    this.renderCanvas();
    this.startRuntimeImagePackWatch();
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

  /** 设置地图编辑器画布是否使用 dual-grid 地块预览。 */
  setDualGridRenderingEnabled(enabled: boolean): void {
    if (this.dualGridRenderingEnabled === enabled) return;
    this.dualGridRenderingEnabled = enabled;
    this.renderCanvas();
    if (!enabled) {
      this.stopRuntimeImagePackWatch();
      return;
    }
    this.startRuntimeImagePackWatch();
  }

  startRuntimeImagePackWatch(): void {
    if (!this.dualGridRenderingEnabled) {
      return;
    }
    this.runtimeImagePackWatchTicksRemaining = RUNTIME_IMAGE_PACK_WATCH_TICKS;
    this.scheduleRuntimeImagePackWatch();
  }

  ensureRuntimeImagePackWatch(): void {
    if (
      !this.dualGridRenderingEnabled
      || this.runtimeImagePackWatchTimerId !== null
      || this.runtimeImagePackWatchTicksRemaining > 0
    ) {
      return;
    }
    this.startRuntimeImagePackWatch();
  }

  scheduleRuntimeImagePackWatch(): void {
    if (
      !this.dualGridRenderingEnabled
      || this.runtimeImagePackWatchTicksRemaining <= 0
      || this.runtimeImagePackWatchTimerId !== null
    ) {
      return;
    }
    this.runtimeImagePackWatchTimerId = window.setTimeout(() => {
      this.runtimeImagePackWatchTimerId = null;
      this.refreshRuntimeImagePackRevision();
    }, RUNTIME_IMAGE_PACK_WATCH_INTERVAL_MS);
  }

  stopRuntimeImagePackWatch(): void {
    this.runtimeImagePackWatchTicksRemaining = 0;
    if (this.runtimeImagePackWatchTimerId !== null) {
      window.clearTimeout(this.runtimeImagePackWatchTimerId);
      this.runtimeImagePackWatchTimerId = null;
    }
  }

  refreshRuntimeImagePackRevision(): void {
    const nextRevision = runtimeImagePack.getRevision();
    if (this.runtimeImagePackRevision !== nextRevision) {
      this.runtimeImagePackRevision = nextRevision;
      this.renderCanvas();
    }
    this.runtimeImagePackWatchTicksRemaining -= 1;
    this.scheduleRuntimeImagePackWatch();
  }

  /** 确保地图列表已加载，首次切换到地图 tab 时调用 */
  async ensureLoaded(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.listLoaded) return;
    await this.loadMapList();
  }

  /** 返回当前地图草稿是否包含尚未保存的修改，供宿主统一保护离页行为。 */
  hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  /** 重置编辑器状态（登出时调用） */
  reset(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.renderFrameId !== null) {
      window.cancelAnimationFrame(this.renderFrameId);
      this.renderFrameId = null;
    }
    if (this.runtimeImagePackWatchTimerId !== null) {
      window.clearTimeout(this.runtimeImagePackWatchTimerId);
      this.runtimeImagePackWatchTimerId = null;
    }
    this.runtimeImagePackWatchTicksRemaining = 0;
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
  getCurrentTool(): MapTool {
    return this.forcedTool ?? this.activeTool;
  }

  /** bindEvents：绑定事件。 */
  bindEvents(): void {
    this.searchInput.addEventListener('input', () => this.renderMapList());
    this.refreshListBtn.addEventListener('click', () => {
      this.loadMapList(true).catch((e) => console.error('[GmMapEditor] loadMapList failed:', e));
    });
    this.saveBtn.addEventListener('click', () => {
      this.saveCurrentMap().catch((e) => console.error('[GmMapEditor] saveCurrentMap failed:', e));
    });
    this.resetBtn.addEventListener('click', () => this.resetDraft());
    this.reloadBtn.addEventListener('click', () => {
      this.reloadCurrentMap().catch((e) => console.error('[GmMapEditor] reloadCurrentMap failed:', e));
    });
    this.undoBtn.addEventListener('click', () => this.undo());
    this.centerBtn.addEventListener('click', () => this.centerView());
    this.zoomOutBtn.addEventListener('click', () => this.applyZoom(-1));
    this.zoomInBtn.addEventListener('click', () => this.applyZoom(1));
    this.applyJsonBtn.addEventListener('click', () => this.applyRawJson());
    window.addEventListener('keydown', this._windowKeydownHandler);

    this.listEl.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-map-id]');
      const mapId = button?.dataset.mapId;
      if (!mapId) return;
      this.selectMap(mapId).catch((e) => console.error('[GmMapEditor] selectMap failed:', e));
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
      if (button.dataset.terrainType !== undefined) {
        this.paintTerrainType = button.dataset.terrainType as TerrainType;
        this.renderToolControls();
        this.renderInspector();
        return;
      }
      if (button.dataset.surfaceType !== undefined) {
        const value = button.dataset.surfaceType;
        this.paintSurfaceType = value ? value as SurfaceType : null;
        this.renderToolControls();
        this.renderInspector();
        return;
      }
      if (button.dataset.structureType !== undefined) {
        const value = button.dataset.structureType;
        this.paintStructureType = value ? value as StructureType : null;
        this.renderToolControls();
        this.renderInspector();
        return;
      }
      if (button.dataset.interactableKind !== undefined) {
        const value = button.dataset.interactableKind;
        this.paintInteractableKind = value ? value as InteractableKind : null;
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
    window.addEventListener('blur', this._windowBlurHandler);
    window.addEventListener('resize', this._windowResizeHandler);
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.applyZoom(event.deltaY > 0 ? -1 : 1);
    }, { passive: false });
  }

  /** setStatus：处理set状态。 */
  setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.style.color = isError ? 'var(--stamp-red)' : 'var(--ink-grey)';
    this.setGlobalStatus(message, isError);
  }

  /** renderToolControls：渲染Tool Controls。 */
  renderToolControls(): void {
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
      button.textContent = `${tool.label} · ${tool.value === 'paint' ? `左键拖拽刷${this.getPaintLayerLabel()}` : tool.note}`;
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
    } else if (this.paintLayer === 'terrain') {
      for (const terrainType of PAINT_TERRAIN_TYPES) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.terrainType = terrainType;
        button.className = `map-tile-btn ${this.paintTerrainType === terrainType ? 'active' : ''}`;
        button.textContent = TERRAIN_TYPE_LABELS[terrainType] ?? '未知地貌';
        paletteFragment.append(button);
      }
    } else if (this.paintLayer === 'surface') {
      for (const surfaceType of PAINT_SURFACE_TYPES) {
        const key = surfaceType ?? '';
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.surfaceType = key;
        button.className = `map-tile-btn ${this.paintSurfaceType === surfaceType ? 'active' : ''}`;
        button.textContent = surfaceType ? SURFACE_TYPE_LABELS[surfaceType] ?? '未知地表' : '清除地表';
        paletteFragment.append(button);
      }
    } else if (this.paintLayer === 'structure') {
      for (const structureType of PAINT_STRUCTURE_TYPES) {
        const key = structureType ?? '';
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.structureType = key;
        button.className = `map-tile-btn ${this.paintStructureType === structureType ? 'active' : ''}`;
        button.textContent = structureType ? STRUCTURE_TYPE_LABELS[structureType] ?? '未知结构' : '清除结构';
        paletteFragment.append(button);
      }
    } else if (this.paintLayer === 'interactable') {
      for (const interactableKind of PAINT_INTERACTABLE_KINDS) {
        const key = interactableKind ?? '';
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.interactableKind = key;
        button.className = `map-tile-btn ${this.paintInteractableKind === interactableKind ? 'active' : ''}`;
        button.textContent = interactableKind ? INTERACTABLE_KIND_LABELS[interactableKind] ?? '未知交互物' : '清除交互';
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

  getPaintLayerLabel(): string {
    return PAINT_LAYER_OPTIONS.find((option) => option.value === this.paintLayer)?.label ?? '地块';
  }

  /** loadMapList：加载地图列表。 */
  async loadMapList(force = false): Promise<void> {
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
  renderMapList(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const keyword = this.searchInput.value.trim().toLowerCase();
    const filtered = this.mapList.filter((map) => {
      if (!keyword) return true;
      return [map.id, map.name, map.description ?? '']
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
        <div class="map-row-meta">${escapeHtml(map.id)} · ${map.width} x ${map.height} · 推荐境界 ${escapeHtml(formatMapRecommendedRealmLabel(map.mapLv))}</div>
        <div class="map-row-meta">传送点 ${map.portalCount} · 场景人物 ${map.npcCount} · 怪物刷新点 ${map.monsterSpawnCount}</div>
      `));
      fragment.append(button);
    }
    this.listEl.replaceChildren(fragment);
  }

  /** selectMap：选择地图。 */
  async selectMap(mapId: string): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (mapId === this.selectedMapId && this.draft) return;
    if (this.dirty && !window.confirm(t('gm-map-editor.confirm.switch-dirty'))) {
      return;
    }
    await this.loadMap(mapId, true);
    this.renderMapList();
  }

  /** loadMap：加载地图。 */
  async loadMap(mapId: string, announce = true): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const data = await this.request<GmMapDetailRes>(`${this.mapApiBasePath}/${encodeURIComponent(mapId)}`);
    this.selectedMapId = mapId;
    this.draft = clone(data.map);
    this.ensureLayerRows();
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
  renderInspector(): void {
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
      `场景人物 ${this.draft.npcs.length}`,
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


  ensureInspectorShell(): void {
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


  syncInspectorTabs(): void {
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


  syncInspectorPanel(html: string): void {
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


  renderInspectorTabContent(
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
  renderSelectionTab(selectedCell: { x: number; y: number } | null, selectedTileType: TileType | null): string {
    const selectedAura = selectedCell ? this.getAuraAt(selectedCell.x, selectedCell.y) : null;
    const selectedResources = selectedCell ? this.getResourcesAt(selectedCell.x, selectedCell.y) : [];
    const resourceSummary = formatResourceSummary(selectedResources);
    const selectedLayers = selectedCell ? this.getLayerStateAt(selectedCell.x, selectedCell.y) : null;
    const currentToolLabel = this.getCurrentTool() === 'paint' ? `绘制 · ${this.getPaintLayerLabel()}` : this.getCurrentTool() === 'pan' ? '平移' : '选取';
    return renderSelectionTabHtml({
      selectedCell,
      hoveredCell: this.hoveredCell,
      selectedTileType,
      selectedAuraValue: selectedAura?.value ?? null,
      resourceSummary,
      selectedLayers,
      currentToolLabel,
      selectedEntityDescription: this.describeSelectedEntity(),
    });
  }

  /** renderMetaTab：渲染元数据Tab。 */
  renderMetaTab(): string {
    if (!this.draft) return '';
    return renderMetaTabHtml({
      draft: this.draft,
      resizeWidth: this.resizeWidth,
      resizeHeight: this.resizeHeight,
      resizeFillTileType: this.resizeFillTileType,
    });
  }

  /** renderComposeTab：渲染Compose Tab。 */
  renderComposeTab(): string {
    if (!this.draft) return '';
    const selectedPiece = this.getSelectedComposePiece();
    return renderComposeTabHtml({
      draftId: this.draft.id,
      mapList: this.mapList,
      composeSourceMapId: this.composeSourceMapId,
      selectedPiece: selectedPiece ? {
        id: selectedPiece.id,
        sourceMapName: selectedPiece.sourceMapName,
        x: selectedPiece.x,
        y: selectedPiece.y,
        rotation: selectedPiece.rotation,
      } : null,
      composePieces: this.composePieces.map((piece) => ({
        id: piece.id,
        sourceMapName: piece.sourceMapName,
        x: piece.x,
        y: piece.y,
        rotation: piece.rotation,
      })),
      selectedComposePieceId: this.selectedComposePieceId,
    });
  }

  /** renderPortalTab：渲染传送点Tab。 */
  renderPortalTab(selectedPoint: { x: number; y: number } | null): string {
    return renderPortalTabHtml({
      draft: this.draft,
      selectedEntity: this.selectedEntity,
      selectedPoint,
      selectedEntitySectionHtml: this.renderSelectedEntitySection(selectedPoint),
      formatMapTargetLabel: (mapId) => this.formatMapTargetLabel(mapId),
    });
  }

  /** renderNpcTab：渲染NPC Tab。 */
  renderNpcTab(selectedPoint: { x: number; y: number } | null): string {
    return renderNpcTabHtml({
      draft: this.draft,
      selectedEntity: this.selectedEntity,
      selectedPoint,
      selectedEntitySectionHtml: this.renderSelectedEntitySection(selectedPoint),
    });
  }

  /** renderMonsterTab：渲染妖兽Tab。 */
  renderMonsterTab(selectedPoint: { x: number; y: number } | null): string {
    return renderMonsterTabHtml({
      draft: this.draft,
      selectedEntity: this.selectedEntity,
      selectedPoint,
      selectedEntitySectionHtml: this.renderSelectedEntitySection(selectedPoint),
    });
  }

  /** renderAuraTab：渲染灵气Tab。 */
  renderAuraTab(selectedPoint: { x: number; y: number } | null): string {
    return renderAuraTabHtml({
      draft: this.draft,
      selectedEntity: this.selectedEntity,
      selectedPoint,
      selectedEntitySectionHtml: this.renderSelectedEntitySection(selectedPoint),
    });
  }

  /** renderResourceTab：渲染资源Tab。 */
  renderResourceTab(selectedPoint: { x: number; y: number } | null): string {
    return renderResourceTabHtml({
      draft: this.draft,
      selectedEntity: this.selectedEntity,
      selectedPoint,
      selectedEntitySectionHtml: this.renderSelectedEntitySection(selectedPoint),
      resourcePaintKey: this.resourcePaintKey,
      resourcePaintValue: this.resourcePaintValue,
    });
  }

  /** renderSafeZoneTab：渲染安全Zone Tab。 */
  renderSafeZoneTab(selectedPoint: { x: number; y: number } | null): string {
    return renderSafeZoneTabHtml({
      draft: this.draft,
      selectedEntity: this.selectedEntity,
      selectedPoint,
      selectedEntitySectionHtml: this.renderSelectedEntitySection(selectedPoint),
    });
  }

  /** renderLandmarkTab：渲染地标Tab。 */
  renderLandmarkTab(selectedPoint: { x: number; y: number } | null): string {
    return renderLandmarkTabHtml({
      draft: this.draft,
      selectedEntity: this.selectedEntity,
      selectedPoint,
      selectedEntitySectionHtml: this.renderSelectedEntitySection(selectedPoint),
    });
  }

  /** renderContainerTab：渲染容器Tab。 */
  renderContainerTab(selectedPoint: { x: number; y: number } | null): string {
    return renderContainerTabHtml({
      draft: this.draft,
      selectedEntity: this.selectedEntity,
      selectedPoint,
      selectedEntitySectionHtml: this.renderSelectedEntitySection(selectedPoint),
      containers: this.getContainerLandmarks(),
    });
  }

  /** renderSelectedEntitySection：渲染Selected实体Section。 */
  renderSelectedEntitySection(selectedPoint: {
  x: number;
  y: number } | null): string {
    const containerLandmark = this.selectedEntity?.kind === 'container'
      ? this.getContainerLandmark(this.selectedEntity.index)
      : null;
    const containerInfo = containerLandmark?.container
      ? {
          id: containerLandmark.id,
          name: containerLandmark.name,
          x: containerLandmark.x,
          y: containerLandmark.y,
          resourceNodeId: containerLandmark.resourceNodeId,
          desc: containerLandmark.desc,
          container: containerLandmark.container,
        }
      : null;
    return renderSelectedEntitySectionHtml({
      draft: this.draft,
      selectedEntity: this.selectedEntity,
      selectedPoint,
      containerLandmark: containerInfo,
      containerTagHint: this.buildContainerTagHint(),
    });
  }

  /** describeSelectedEntity：处理describe Selected实体。 */
  /** describeSelectedEntity：处理describe Selected实体。 */
  describeSelectedEntity(): string {
    const selectedPiece = this.getSelectedComposePiece();
    const containerLandmark = this.selectedEntity?.kind === 'container'
      ? this.getContainerLandmark(this.selectedEntity.index)
      : null;
    return describeSelectedEntityHtml({
      draft: this.draft,
      selectedEntity: this.selectedEntity,
      selectedComposePiece: selectedPiece ? {
        id: selectedPiece.id,
        sourceMapName: selectedPiece.sourceMapName,
        x: selectedPiece.x,
        y: selectedPiece.y,
        rotation: selectedPiece.rotation,
      } : null,
      formatMapTargetLabel: (mapId) => this.formatMapTargetLabel(mapId),
      containerLandmarkName: containerLandmark?.name ?? null,
    });
  }

  /** findComposePieceAt：查找Compose Piece At。 */
  findComposePieceAt(x: number, y: number): MapComposePiece | null {
    return findComposePieceAtImpl(this, x, y);
  }

  /** getAuraAt：读取灵气At。 */
  getAuraAt(x: number, y: number): {  
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
  getResourcesAt(x: number, y: number): TileResourcePoint[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return [];
    return (this.draft.resources ?? []).filter((point) => point.x === x && point.y === y);
  }

  /** formatMapTargetLabel：格式化地图目标标签。 */
  formatMapTargetLabel(mapId: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const target = this.mapList.find((map) => map.id === mapId);
    if (!target) {
      return t('minimap.catalog.unknown-region', undefined);
    }
    return target.name && target.name !== mapId
      ? `${target.name} (${mapId})`
      : target.name || t('minimap.catalog.unknown-region', undefined);
  }

  /** getContainerLandmarks：读取容器Landmarks。 */
  getContainerLandmarks(): Array<{  
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
  getContainerLandmark(index: number): GmMapLandmarkRecord | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) {
      return null;
    }
    const landmark = this.draft.landmarks?.[index];
    return landmark?.container ? landmark : null;
  }

  /** getAvailableItemTags：读取Available物品Tags。 */
  getAvailableItemTags(): string[] {
    return [...new Set(this.itemCatalog.flatMap((item) => item.tags ?? []))]
      .sort((left, right) => left.localeCompare(right, 'zh-CN'));
  }

  /** buildContainerTagHint：构建容器Tag Hint。 */
  buildContainerTagHint(): string {
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
  handleUiFieldChange(field: string, value: string): void {
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
  syncInspectorToDraft(): {  
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
      if (path.startsWith('__cellAura.')) {
        const segments = path.split('.');
        const x = Number(segments[1]);
        const y = Number(segments[2]);
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
          return { ok: false, message: '当前格灵气坐标非法' };
        }
        setAuraPointValue(next, x, y, Number(value));
        continue;
      }
      setValueByPath(next, path, value);
    }
    normalizeSingleInteractableRows(next);
    syncAllLegacyTilesFromLayers(next);
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
  handleAction(action: string, trigger: HTMLElement): void {
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
        this.addComposePiece().catch((e) => console.error('[GmMapEditor] addComposePiece failed:', e));
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
  addPortalAtCurrentCell(): void {
    return addPortalAtCurrentCellImpl(this);
  }

  /** ensureComposeSourceMap：确保Compose来源地图。 */
  async ensureComposeSourceMap(sourceMapId: string): Promise<GmMapDocument> {
    return ensureComposeSourceMapImpl(this, sourceMapId);
  }

  /** getComposePieceSize：读取Compose Piece Size。 */
  getComposePieceSize(piece: MapComposePiece): { width: number; height: number } | null {
    return getComposePieceSizeImpl(this, piece);
  }

  /** getComposePieceBounds：读取Compose Piece Bounds。 */
  getComposePieceBounds(piece: MapComposePiece): { x: number; y: number; width: number; height: number } | null {
    return getComposePieceBoundsImpl(this, piece);
  }

  /** clampComposePiecePosition：处理clamp Compose Piece位置。 */
  clampComposePiecePosition(piece: MapComposePiece): MapComposePiece {
    return clampComposePiecePositionImpl(this, piece);
  }

  /** getSelectedComposePiece：读取Selected Compose Piece。 */
  getSelectedComposePiece(): MapComposePiece | null {
    return getSelectedComposePieceImpl(this);
  }

  /** addComposePiece：处理add Compose Piece。 */
  async addComposePiece(): Promise<void> {
    return addComposePieceImpl(this);
  }  
  /**
 * updateComposePiece：处理ComposePiece并更新相关状态。
 * @param pieceId string piece ID。
 * @param updater (piece: MapComposePiece) => MapComposePiece 参数说明。
 * @returns 返回是否满足ComposePiece条件。
 */


  updateComposePiece(pieceId: string, updater: (piece: MapComposePiece) => MapComposePiece): boolean {
    return updateComposePieceImpl(this, pieceId, updater);
  }

  /** rotateSelectedComposePiece：处理rotate Selected Compose Piece。 */
  rotateSelectedComposePiece(clockwise: boolean): void {
    return rotateSelectedComposePieceImpl(this, clockwise);
  }

  /** removeSelectedComposePiece：处理remove Selected Compose Piece。 */
  removeSelectedComposePiece(): void {
    return removeSelectedComposePieceImpl(this);
  }

  /** clearComposePieces：清理Compose Pieces。 */
  clearComposePieces(): void {
    return clearComposePiecesImpl(this);
  }  
  /**
 * forEachComposePieceTile：执行forEachComposePieceTile相关逻辑。
 * @param piece MapComposePiece 参数说明。
 * @param visitor (targetX: number, targetY: number, sourceChar: string) => void 参数说明。
 * @returns 无返回值，直接更新forEachComposePieceTile相关状态。
 */


  forEachComposePieceTile(piece: MapComposePiece, visitor: (targetX: number, targetY: number, sourceX: number, sourceY: number, sourceChar: string) => void): void {
    return forEachComposePieceTileImpl(this, piece, visitor);
  }

  /** bakeComposePiece：处理bake Compose Piece。 */
  bakeComposePiece(piece: MapComposePiece, recordUndo: boolean): number {
    return bakeComposePieceImpl(this, piece, recordUndo);
  }

  /** bakeSelectedComposePiece：处理bake Selected Compose Piece。 */
  bakeSelectedComposePiece(): void {
    return bakeSelectedComposePieceImpl(this);
  }

  /** bakeAllComposePieces：处理bake All Compose Pieces。 */
  bakeAllComposePieces(): void {
    return bakeAllComposePiecesImpl(this);
  }

  /** addNpcAtCurrentCell：处理add NPC At当前格子。 */
  addNpcAtCurrentCell(): void {
    return addNpcAtCurrentCellImpl(this);
  }

  /** addQuestToSelectedNpc：处理add任务To Selected NPC。 */
  addQuestToSelectedNpc(): void {
    return addQuestToSelectedNpcImpl(this);
  }

  /** removeQuestFromSelectedNpc：处理remove任务From Selected NPC。 */
  removeQuestFromSelectedNpc(index: number): void {
    return removeQuestFromSelectedNpcImpl(this, index);
  }

  /** addMonsterAtCurrentCell：处理add妖兽At当前格子。 */
  addMonsterAtCurrentCell(): void {
    return addMonsterAtCurrentCellImpl(this);
  }

  /** addAuraAtCurrentCell：处理add灵气At当前格子。 */
  addAuraAtCurrentCell(): void {
    return addAuraAtCurrentCellImpl(this);
  }

  /** applyResourceBrushKey：应用资源Brush Key。 */
  applyResourceBrushKey(): void {
    return applyResourceBrushKeyImpl(this);
  }

  /** addResourceAtCurrentCell：处理add资源At当前格子。 */
  addResourceAtCurrentCell(): void {
    return addResourceAtCurrentCellImpl(this);
  }

  /** addSafeZoneAtCurrentCell：处理add安全Zone At当前格子。 */
  addSafeZoneAtCurrentCell(): void {
    return addSafeZoneAtCurrentCellImpl(this);
  }

  /** addLandmarkAtCurrentCell：处理add地标At当前格子。 */
  addLandmarkAtCurrentCell(): void {
    return addLandmarkAtCurrentCellImpl(this);
  }

  /** addContainerAtCurrentCell：处理add容器At当前格子。 */
  addContainerAtCurrentCell(): void {
    return addContainerAtCurrentCellImpl(this);
  }

  /** addLootPoolToSelectedContainer：处理add战利品池To Selected容器。 */
  addLootPoolToSelectedContainer(): void {
    return addLootPoolToSelectedContainerImpl(this);
  }

  /** removeLootPoolFromSelectedContainer：处理remove战利品池From Selected容器。 */
  removeLootPoolFromSelectedContainer(index: number): void {
    return removeLootPoolFromSelectedContainerImpl(this, index);
  }

  /** moveSelectedEntityToCurrentCell：处理移动Selected实体To当前格子。 */
  moveSelectedEntityToCurrentCell(): void {
    return moveSelectedEntityToCurrentCellImpl(this);
  }

  /** moveSelectedEntityToPoint：处理移动Selected实体To坐标。 */
  moveSelectedEntityToPoint(x: number, y: number, recordUndo: boolean, silent: boolean): boolean {
    return moveSelectedEntityToPointImpl(this, x, y, recordUndo, silent);
  }

  /** removeSelectedEntity：处理remove Selected实体。 */
  removeSelectedEntity(): void {
    return removeSelectedEntityImpl(this);
  }

  /** applyResize：应用Resize。 */
  applyResize(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.draft) return;
    this.captureUndoState();
    const width = Math.max(1, this.resizeWidth);
    const height = Math.max(1, this.resizeHeight);
    const fillChar = getMapCharFromTileType(this.resizeFillTileType);
    const nextTiles: string[] = [];
    this.ensureLayerRows();
    const fillSeed = resolveTileLayerSeedFromTileType(this.resizeFillTileType);
    const nextTerrainRows: TerrainType[][] = [];
    const nextSurfaceRows: (SurfaceType | null)[][] = [];
    const nextStructureRows: (StructureType | null)[][] = [];
    const nextInteractableRows: InteractableKind[][][] = [];
    for (let y = 0; y < height; y += 1) {
      const chars: string[] = [];
      const oldRow = this.draft.tiles[y] ?? '';
      const terrainRow: TerrainType[] = [];
      const surfaceRow: (SurfaceType | null)[] = [];
      const structureRow: (StructureType | null)[] = [];
      const interactableRow: InteractableKind[][] = [];
      for (let x = 0; x < width; x += 1) {
        chars.push(oldRow[x] ?? fillChar);
        terrainRow.push(this.draft.terrainRows?.[y]?.[x] ?? fillSeed.terrain);
        surfaceRow.push(this.draft.surfaceRows?.[y]?.[x] ?? fillSeed.surface);
        structureRow.push(this.draft.structureRows?.[y]?.[x] ?? fillSeed.structure);
        interactableRow.push([...(this.draft.interactableRows?.[y]?.[x] ?? fillSeed.interactables)]);
      }
      nextTiles.push(chars.join(''));
      nextTerrainRows.push(terrainRow);
      nextSurfaceRows.push(surfaceRow);
      nextStructureRows.push(structureRow);
      nextInteractableRows.push(interactableRow);
    }
    this.draft.width = width;
    this.draft.height = height;
    this.draft.tiles = nextTiles;
    this.draft.terrainRows = nextTerrainRows;
    this.draft.surfaceRows = nextSurfaceRows;
    this.draft.structureRows = nextStructureRows;
    this.draft.interactableRows = nextInteractableRows;
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
  clampPoint(point: {  
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
  findNearestWalkable(origin: {  
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
  resetDraft(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedMapId) return;
    if (this.dirty && !window.confirm(t('gm-map-editor.confirm.reset-dirty'))) {
      return;
    }
    this.loadMap(this.selectedMapId).catch((e) => console.error('[GmMapEditor] loadMap failed:', e));
  }

  /** reloadCurrentMap：重载当前地图。 */
  async reloadCurrentMap(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedMapId) return;
    if (this.dirty && !window.confirm(t('gm-map-editor.confirm.reload-dirty'))) {
      return;
    }
    await this.loadMap(this.selectedMapId);
  }

  /** applyRawJson：应用Raw JSON。 */
  applyRawJson(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedMapId) return;
    try {
      const next = JSON.parse(this.jsonEl.value) as GmMapDocument;
      if (this.draft) {
        this.captureUndoState();
      }
      this.draft = next;
      this.ensureLayerRows();
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
  async saveCurrentMap(): Promise<void> {
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
    this.ensureLayerRows();
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
  centerView(): void {
    return centerViewImpl(this);
  }

  /** applyZoom：应用缩放。 */
  applyZoom(delta: number): void {
    return applyZoomImpl(this, delta);
  }

  /** getCellSize：读取格子Size。 */
  getCellSize(): number {
    return getCellSizeImpl(this);
  }

  /** renderCanvas：渲染Canvas。 */
  renderCanvas(): void {
    return renderCanvasImpl(this);
  }

  /** flushCanvasRender：处理刷新Canvas渲染。 */
  flushCanvasRender(): void {
    return flushCanvasRenderImpl(this);
  }

  buildVisibleTileTypeRows(startGX: number, startGY: number, endGX: number, endGY: number): TileType[][] {
    return buildVisibleTileTypeRowsImpl(this, startGX, startGY, endGX, endGY);
  }

  buildVisibleTileVisualSourceRows(startGX: number, startGY: number, endGX: number, endGY: number): Array<Array<RuntimeTileVisualSource | null>> {
    return buildVisibleTileVisualSourceRowsImpl(this, startGX, startGY, endGX, endGY);
  }

  getCachedTileVisualSource(rows: Array<Array<RuntimeTileVisualSource | null>>, startGX: number, startGY: number, x: number, y: number): RuntimeTileVisualSource | null {
    return getCachedTileVisualSourceImpl(this, rows, startGX, startGY, x, y);
  }

  /** drawComposePieces：处理draw Compose Pieces。 */
  drawComposePieces(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number): void {
    return drawComposePiecesImpl(this, ctx, screenW, screenH, cellSize);
  }

  /** drawEntities：处理draw实体。 */
  drawEntities(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number): void {
    return drawEntitiesImpl(this, ctx, screenW, screenH, cellSize);
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


  drawMonsterSpawnOverlay(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number, spawn: GmMapMonsterSpawnRecord): void {
    return drawMonsterSpawnOverlayImpl(this, ctx, screenW, screenH, cellSize, spawn);
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


  drawSafeZoneOverlay(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number, zone: GmMapSafeZoneRecord): void {
    return drawSafeZoneOverlayImpl(this, ctx, screenW, screenH, cellSize, zone);
  }

  /** resizeCanvas：处理resize Canvas。 */
  resizeCanvas(): void {
    return resizeCanvasImpl(this);
  }

  /** handleCanvasPointerDown：处理Canvas Pointer Down。 */
  handleCanvasPointerDown(event: PointerEvent): void {
    return handleCanvasPointerDownImpl(this, event);
  }

  /** sampleTileAt：处理sample地块At。 */
  sampleTileAt(x: number, y: number): void {
    return sampleTileAtImpl(this, x, y);
  }

  /** handleCanvasPointerMove：处理Canvas Pointer移动。 */
  handleCanvasPointerMove(event: PointerEvent): void {
    return handleCanvasPointerMoveImpl(this, event);
  }

  /** endPointerInteraction：处理end Pointer交互。 */
  endPointerInteraction(): void {
    return endPointerInteractionImpl(this);
  }

  /** screenToGrid：处理屏幕To Grid。 */
  screenToGrid(clientX: number, clientY: number): { x: number; y: number } | null {
    return screenToGridImpl(this, clientX, clientY);
  }

  /** paintTileAt：处理paint地块At。 */
  paintAt(x: number, y: number, recordUndo = false): boolean {
    return paintAtImpl(this, x, y, recordUndo);
  }

  paintTileAt(x: number, y: number, recordUndo = false): boolean {
    return paintTileAtImpl(this, x, y, recordUndo);
  }

  paintLayerAt(x: number, y: number, recordUndo = false): boolean {
    return paintLayerAtImpl(this, x, y, recordUndo);
  }

  /** paintAuraAt：处理paint灵气At。 */
  paintAuraAt(x: number, y: number, recordUndo = false): boolean {
    return paintAuraAtImpl(this, x, y, recordUndo);
  }

  /** paintResourceAt：处理paint资源At。 */
  paintResourceAt(x: number, y: number, recordUndo = false): boolean {
    return paintResourceAtImpl(this, x, y, recordUndo);
  }

  /** applyLinePaint：应用Line Paint。 */
  applyLinePaint(start: GridPoint, end: GridPoint): void {
    return applyLinePaintImpl(this, start, end);
  }

  /** applyTilePaint：应用地块Paint。 */
  applyTilePaint(points: GridPoint[], recordUndo: boolean): number {
    return applyTilePaintImpl(this, points, recordUndo);
  }

  applyLayerPaint(layer: PaintLayer, points: GridPoint[], recordUndo: boolean): number {
    return applyLayerPaintImpl(this, layer, points, recordUndo);
  }

  ensureLayerRows(): void {
    return ensureLayerRowsImpl(this);
  }

  previewLayerPaintTileType(layer: PaintLayer, x: number, y: number): TileType {
    return previewLayerPaintTileTypeImpl(this, layer, x, y);
  }

  isLayerPaintNoop(layer: PaintLayer, x: number, y: number): boolean {
    return isLayerPaintNoopImpl(this, layer, x, y);
  }

  getLayerStateAt(x: number, y: number): { terrain: TerrainType; surface: SurfaceType | null; structure: StructureType | null; interactableKinds: InteractableKind[] } {
    return getLayerStateAtImpl(this, x, y);
  }

  syncLegacyTileFromLayers(x: number, y: number): void {
    return syncLegacyTileFromLayersImpl(this, x, y);
  }

  /** applyAuraPaint：应用灵气Paint。 */
  applyAuraPaint(points: GridPoint[], recordUndo: boolean, overrideValue?: number): number {
    return applyAuraPaintImpl(this, points, recordUndo, overrideValue);
  }  
  /**
 * applyResourcePaint：处理ResourcePaint并更新相关状态。
 * @param points GridPoint[] 参数说明。
 * @param recordUndo boolean 参数说明。
 * @param overrideValue number 参数说明。
 * @param overrideResourceKey string 参数说明。
 * @returns 返回ResourcePaint。
 */


  applyResourcePaint(points: GridPoint[], recordUndo: boolean, overrideValue?: number, overrideResourceKey?: string): number {
    return applyResourcePaintImpl(this, points, recordUndo, overrideValue, overrideResourceKey);
  }

  /** findResourceIndex：查找资源索引。 */
  findResourceIndex(x: number, y: number, resourceKey: string): number {
    return findResourceIndexImpl(this, x, y, resourceKey);
  }

  /** getLinePoints：读取Line坐标。 */
  getLinePoints(start: GridPoint, end: GridPoint): GridPoint[] {
    return getLinePointsImpl(this, start, end);
  }

  /** hasBlockingMapObjectAt：判断是否Blocking地图Object At。 */
  hasBlockingMapObjectAt(x: number, y: number, ignoredSelection: MapEntitySelection = null): boolean {
    return hasBlockingMapObjectAtImpl(this, x, y, ignoredSelection);
  }

  /** hasAuraAt：判断是否灵气At。 */
  hasAuraAt(x: number, y: number, ignoredIndex?: number): boolean {
    return hasAuraAtImpl(this, x, y, ignoredIndex);
  }

  /** hasResourceAt：判断是否资源At。 */
  hasResourceAt(x: number, y: number, resourceKey: string, ignoredIndex?: number): boolean {
    return hasResourceAtImpl(this, x, y, resourceKey, ignoredIndex);
  }

  /** hasLandmarkAt：判断是否地标At。 */
  hasLandmarkAt(x: number, y: number, ignoredIndex?: number): boolean {
    return hasLandmarkAtImpl(this, x, y, ignoredIndex);
  }

  /** ensureSelectedCell：确保Selected格子。 */
  ensureSelectedCell(): boolean {
    return ensureSelectedCellImpl(this);
  }

  /** ensureWalkableSelection：确保Walkable选中项。 */
  ensureWalkableSelection(label: string): boolean {
    return ensureWalkableSelectionImpl(this, label);
  }

  /** getTileTypeAt：读取地块类型At。 */
  getTileTypeAt(x: number, y: number): TileType {
    return getTileTypeAtImpl(this, x, y);
  }

  getTileVisualSourceAt(x: number, y: number): RuntimeTileVisualSource | null {
    return getTileVisualSourceAtImpl(this, x, y);
  }

  /** findEntityAt：查找实体At。 */
  findEntityAt(x: number, y: number): MapEntitySelection {
    return findEntityAtImpl(this, x, y);
  }

  /** getSelectedEntityPoint：读取Selected实体坐标。 */
  getSelectedEntityPoint(): { x: number; y: number } | null {
    return getSelectedEntityPointImpl(this);
  }

  /** createUndoEntry：创建Undo条目。 */
  createUndoEntry(): EditorUndoEntry | null {
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
  captureUndoState(): void {
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
  restoreUndoEntry(entry: EditorUndoEntry): void {
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
  undo(): void {
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
  updateUndoButtonState(): void {
    this.undoBtn.disabled = !this.draft || this.undoStack.length === 0;
  }

  /** handleKeyDown：处理Key Down。 */
  handleKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      if (this.canvasHost.offsetParent === null || isEditableTarget(event.target)) return;
      event.preventDefault();
      this.undo();
    }
  }

  /** markDirty：标记Dirty。 */
  markDirty(render = true): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.dirty = true;
    this.updateUndoButtonState();
    if (render) this.renderInspector();
    else this.jsonEl.value = formatJson(this.draft);
  }

  /** 移除 window 事件监听器，释放全局引用。 */
  dispose(): void {
    if (this.renderFrameId !== null) {
      window.cancelAnimationFrame(this.renderFrameId);
      this.renderFrameId = null;
    }
    this.stopRuntimeImagePackWatch();
    window.removeEventListener('keydown', this._windowKeydownHandler);
    window.removeEventListener('blur', this._windowBlurHandler);
    window.removeEventListener('resize', this._windowResizeHandler);
  }
}

export function buildGridPointKeySet(
  points: readonly GridPoint[] | undefined,
  width: number,
): Set<number> {
  const keys = new Set<number>();
  if (!points) {
    return keys;
  }
  for (const point of points) {
    keys.add(makeGridPointKey(point.x, point.y, width));
  }
  return keys;
}
