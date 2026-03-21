import {
  GmMapAuraRecord,
  GmMapDetailRes,
  GmMapDocument,
  GmMapLandmarkRecord,
  GmMapListRes,
  GmMapSummary,
  GmMapMonsterSpawnRecord,
  GmMapNpcRecord,
  GmMapPortalRecord,
  GmUpdateMapReq,
  Tile,
  TileType,
  getMapCharFromTileType,
  getTileTypeFromMapChar,
  isTileTypeWalkable,
} from '@mud/shared';
import { adjustZoom, getCellSize } from './display';

type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;
type StatusFn = (message: string, isError?: boolean) => void;

type MapEntitySelection =
  | { kind: 'portal'; index: number }
  | { kind: 'npc'; index: number }
  | { kind: 'monster'; index: number }
  | { kind: 'aura'; index: number }
  | { kind: 'landmark'; index: number }
  | null;

type MapEntityKind = 'portal' | 'npc' | 'monster' | 'aura' | 'landmark';

type MapTool = 'select' | 'paint' | 'pan';

const PAINT_TILE_TYPES: TileType[] = [
  TileType.Floor,
  TileType.Road,
  TileType.Trail,
  TileType.Wall,
  TileType.Door,
  TileType.Grass,
  TileType.Hill,
  TileType.Mud,
  TileType.Swamp,
  TileType.Water,
  TileType.Tree,
  TileType.Stone,
];

const TILE_LABELS: Record<TileType, string> = {
  [TileType.Floor]: '地面',
  [TileType.Road]: '大路',
  [TileType.Trail]: '小路',
  [TileType.Wall]: '墙体',
  [TileType.Door]: '门',
  [TileType.Portal]: '传送阵',
  [TileType.Stairs]: '楼梯',
  [TileType.Grass]: '草地',
  [TileType.Hill]: '山地',
  [TileType.Mud]: '泥地',
  [TileType.Swamp]: '沼泽',
  [TileType.Water]: '水域',
  [TileType.Tree]: '树木',
  [TileType.Stone]: '岩石',
};

const TILE_BG: Record<TileType, string> = {
  [TileType.Floor]: '#ddd8cf',
  [TileType.Road]: '#cdb89c',
  [TileType.Trail]: '#b4946f',
  [TileType.Wall]: '#3e3a35',
  [TileType.Door]: '#8b7355',
  [TileType.Portal]: '#5c3d7a',
  [TileType.Stairs]: '#7f5a34',
  [TileType.Grass]: '#b8c98b',
  [TileType.Hill]: '#b7a17f',
  [TileType.Mud]: '#8b6a4c',
  [TileType.Swamp]: '#556b3f',
  [TileType.Water]: '#6e9ab8',
  [TileType.Tree]: '#4d6b3a',
  [TileType.Stone]: '#7a7570',
};

const TILE_CHAR: Record<TileType, string> = {
  [TileType.Floor]: '·',
  [TileType.Road]: '路',
  [TileType.Trail]: '径',
  [TileType.Wall]: '▓',
  [TileType.Door]: '门',
  [TileType.Portal]: '阵',
  [TileType.Stairs]: '阶',
  [TileType.Grass]: '草',
  [TileType.Hill]: '坡',
  [TileType.Mud]: '泥',
  [TileType.Swamp]: '沼',
  [TileType.Water]: '水',
  [TileType.Tree]: '木',
  [TileType.Stone]: '石',
};

const CHAR_COLOR: Record<TileType, string> = {
  [TileType.Floor]: 'rgba(0,0,0,0.15)',
  [TileType.Road]: 'rgba(90,55,24,0.35)',
  [TileType.Trail]: 'rgba(84,52,28,0.42)',
  [TileType.Wall]: 'rgba(255,255,255,0.2)',
  [TileType.Door]: '#f0e0c0',
  [TileType.Portal]: '#d0b0f0',
  [TileType.Stairs]: '#f3d19c',
  [TileType.Grass]: 'rgba(50,80,30,0.35)',
  [TileType.Hill]: 'rgba(92,60,32,0.36)',
  [TileType.Mud]: 'rgba(250,240,220,0.34)',
  [TileType.Swamp]: 'rgba(220,240,180,0.4)',
  [TileType.Water]: 'rgba(30,50,80,0.4)',
  [TileType.Tree]: 'rgba(20,40,15,0.5)',
  [TileType.Stone]: 'rgba(40,35,30,0.35)',
};

const TOOL_OPTIONS: Array<{ value: MapTool; label: string; note: string }> = [
  { value: 'select', label: '选取', note: '检查当前格与对象' },
  { value: 'paint', label: '绘制', note: '左键拖拽刷地块' },
  { value: 'pan', label: '平移', note: '左键拖动画布' },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function setValueByPath(target: unknown, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = target as Record<string, unknown>;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index]!;
    const next = cursor[key];
    if (next === undefined || next === null) {
      cursor[key] = /^\d+$/.test(segments[index + 1] ?? '') ? [] : {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

function getValueByPath(target: unknown, path: string): unknown {
  let cursor = target as Record<string, unknown> | undefined;
  for (const segment of path.split('.')) {
    if (cursor === undefined || cursor === null) return undefined;
    cursor = cursor[segment] as Record<string, unknown> | undefined;
  }
  return cursor;
}

function removeArrayIndex(target: unknown, path: string, index: number): void {
  const value = getValueByPath(target, path);
  if (!Array.isArray(value)) return;
  value.splice(index, 1);
}

function textField(label: string, path: string, value: string | undefined, extraClass = ''): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input data-map-bind="${escapeHtml(path)}" data-map-kind="string" value="${escapeHtml(value ?? '')}" />
    </label>
  `;
}

function numberField(label: string, path: string, value: number | undefined, extraClass = ''): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <input type="number" data-map-bind="${escapeHtml(path)}" data-map-kind="number" value="${Number.isFinite(value) ? String(value) : '0'}" />
    </label>
  `;
}

function selectField(
  label: string,
  path: string,
  value: string | undefined,
  options: Array<{ value: string; label: string }>,
  extraClass = '',
): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <select data-map-bind="${escapeHtml(path)}" data-map-kind="string">
        ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === (value ?? '') ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </label>
  `;
}

function jsonField(label: string, path: string, value: unknown, extraClass = ''): string {
  return `
    <label class="map-field ${extraClass}">
      <span>${escapeHtml(label)}</span>
      <textarea data-map-bind="${escapeHtml(path)}" data-map-kind="json">${escapeHtml(formatJson(value ?? []))}</textarea>
    </label>
  `;
}

function readonlyField(label: string, value: string): string {
  return `
    <div class="map-field">
      <span>${escapeHtml(label)}</span>
      <input value="${escapeHtml(value)}" readonly />
    </div>
  `;
}

export class GmMapEditor {
  private readonly listEl = document.getElementById('map-list') as HTMLDivElement;
  private readonly searchInput = document.getElementById('map-search') as HTMLInputElement;
  private readonly saveBtn = document.getElementById('map-save') as HTMLButtonElement;
  private readonly resetBtn = document.getElementById('map-reset') as HTMLButtonElement;
  private readonly reloadBtn = document.getElementById('map-reload') as HTMLButtonElement;
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
  private readonly tilePaletteEl = document.getElementById('map-tile-palette') as HTMLDivElement;
  private readonly inspectorEl = document.getElementById('map-inspector-content') as HTMLDivElement;
  private readonly jsonEl = document.getElementById('map-json') as HTMLTextAreaElement;
  private readonly applyJsonBtn = document.getElementById('map-apply-json') as HTMLButtonElement;
  private readonly ctx = this.canvas.getContext('2d');

  private mapList: GmMapSummary[] = [];
  private selectedMapId: string | null = null;
  private draft: GmMapDocument | null = null;
  private dirty = false;
  private activeTool: MapTool = 'paint';
  private paintTileType: TileType = TileType.Grass;
  private selectedCell: { x: number; y: number } | null = null;
  private hoveredCell: { x: number; y: number } | null = null;
  private selectedEntity: MapEntitySelection = null;
  private resizeWidth = 0;
  private resizeHeight = 0;
  private resizeFillTileType: TileType = TileType.Grass;
  private viewCenterX = 0;
  private viewCenterY = 0;
  private paintActive = false;
  private panActive = false;
  private lastPaintKey: string | null = null;
  private panStartClientX = 0;
  private panStartClientY = 0;
  private panStartCenterX = 0;
  private panStartCenterY = 0;
  private activePointerId: number | null = null;
  private activePanButtonMask = 0;
  private listLoaded = false;

  constructor(
    private readonly request: RequestFn,
    private readonly setGlobalStatus: StatusFn,
  ) {
    this.bindEvents();
    this.renderToolControls();
    this.renderCanvas();
  }

  async ensureLoaded(): Promise<void> {
    if (this.listLoaded) return;
    await this.loadMapList();
  }

  reset(): void {
    this.mapList = [];
    this.selectedMapId = null;
    this.draft = null;
    this.dirty = false;
    this.selectedCell = null;
    this.hoveredCell = null;
    this.selectedEntity = null;
    this.listLoaded = false;
    this.listEl.innerHTML = '';
    this.inspectorEl.innerHTML = '';
    this.summaryEl.innerHTML = '';
    this.jsonEl.value = '';
    this.editorPanelEl.classList.add('hidden');
    this.editorEmptyEl.classList.remove('hidden');
    this.canvasEmptyEl.classList.remove('hidden');
    this.setStatus('');
  }

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
    this.centerBtn.addEventListener('click', () => this.centerView());
    this.zoomOutBtn.addEventListener('click', () => this.applyZoom(-1));
    this.zoomInBtn.addEventListener('click', () => this.applyZoom(1));
    this.applyJsonBtn.addEventListener('click', () => this.applyRawJson());

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
      this.activeTool = tool;
      this.renderToolControls();
      this.renderInspector();
    });

    this.tilePaletteEl.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tile-type]');
      const tileType = button?.dataset.tileType as TileType | undefined;
      if (!tileType) return;
      this.paintTileType = tileType;
      this.renderToolControls();
      this.renderInspector();
    });

    this.inspectorEl.addEventListener('click', (event) => {
      const actionEl = (event.target as HTMLElement).closest<HTMLElement>('[data-map-action]');
      const action = actionEl?.dataset.mapAction;
      if (action) {
        this.handleAction(action, actionEl!);
        return;
      }
      const entityButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-entity-kind]');
      if (!entityButton) return;
      const kind = entityButton.dataset.entityKind as MapEntityKind | undefined;
      const index = Number(entityButton.dataset.entityIndex ?? '-1');
      if (Number.isInteger(index) && kind) {
        this.selectedEntity = { kind, index } as Exclude<MapEntitySelection, null>;
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
      if (!result.ok) {
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
      if (!this.paintActive && !this.panActive) {
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

  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.style.color = isError ? 'var(--stamp-red)' : 'var(--ink-grey)';
    this.setGlobalStatus(message, isError);
  }

  private renderToolControls(): void {
    this.toolButtonsEl.innerHTML = TOOL_OPTIONS.map((tool) => `
      <button class="map-tool-btn ${this.activeTool === tool.value ? 'active' : ''}" data-tool="${tool.value}" type="button">
        ${escapeHtml(tool.label)} · ${escapeHtml(tool.note)}
      </button>
    `).join('');

    this.tilePaletteEl.innerHTML = PAINT_TILE_TYPES.map((tileType) => `
      <button class="map-tile-btn ${this.paintTileType === tileType ? 'active' : ''}" data-tile-type="${tileType}" type="button">
        ${escapeHtml(TILE_LABELS[tileType])}
      </button>
    `).join('');
  }

  private async loadMapList(force = false): Promise<void> {
    const data = await this.request<GmMapListRes>('/gm/maps');
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

  private renderMapList(): void {
    const keyword = this.searchInput.value.trim().toLowerCase();
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

  private async selectMap(mapId: string): Promise<void> {
    if (mapId === this.selectedMapId && this.draft) return;
    if (this.dirty && !window.confirm('当前地图有未保存修改，切换后会丢失这些修改。继续吗？')) {
      return;
    }
    await this.loadMap(mapId, true);
    this.renderMapList();
  }

  private async loadMap(mapId: string, announce = true): Promise<void> {
    const data = await this.request<GmMapDetailRes>(`/gm/maps/${encodeURIComponent(mapId)}`);
    this.selectedMapId = mapId;
    this.draft = clone(data.map);
    this.dirty = false;
    this.selectedCell = { x: data.map.spawnPoint.x, y: data.map.spawnPoint.y };
    this.hoveredCell = null;
    this.selectedEntity = null;
    this.resizeWidth = data.map.width;
    this.resizeHeight = data.map.height;
    this.resizeFillTileType = this.paintTileType;
    this.centerView();
    this.renderInspector();
    if (announce) {
      this.setStatus(`已载入地图 ${data.map.name}`);
    }
  }

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

    const selectedCell = this.selectedCell;
    const selectedTileType = selectedCell ? this.getTileTypeAt(selectedCell.x, selectedCell.y) : null;
    const selectedEntityPoint = this.getSelectedEntityPoint();
    const summaryBits = [
      `${this.draft.name} (${this.draft.id})`,
      `${this.draft.width} x ${this.draft.height}`,
      `传送点 ${this.draft.portals.length}`,
      `NPC ${this.draft.npcs.length}`,
      `怪物刷新点 ${this.draft.monsterSpawns.length}`,
      `灵气点 ${this.draft.auras?.length ?? 0}`,
      `地标 ${this.draft.landmarks?.length ?? 0}`,
      this.dirty ? '有未保存修改' : '已与服务端同步',
    ];
    this.summaryEl.textContent = summaryBits.join(' · ');

    const selectionMarkup = `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">当前选区</div>
            <div class="editor-section-note">画布点击后会同步这里的坐标与对象。</div>
          </div>
        </div>
        <div class="map-form-grid compact">
          ${readonlyField('当前格', selectedCell ? `(${selectedCell.x}, ${selectedCell.y})` : '未选择')}
          ${readonlyField('悬停格', this.hoveredCell ? `(${this.hoveredCell.x}, ${this.hoveredCell.y})` : '无')}
          ${readonlyField('地块', selectedTileType ? TILE_LABELS[selectedTileType] : '无')}
        </div>
        <div class="button-row" style="margin-top: 10px;">
          <button class="small-btn" type="button" data-map-action="pick-tile">用当前地块作画笔</button>
          <button class="small-btn" type="button" data-map-action="set-spawn">把当前格设为出生点</button>
          <button class="small-btn" type="button" data-map-action="move-selected">把选中对象移到当前格</button>
        </div>
      </section>
    `;

    const metaMarkup = `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">地图元信息</div>
            <div class="editor-section-note">名称、推荐境界、出生点与地图尺寸。</div>
          </div>
        </div>
        <div class="map-form-grid">
          ${textField('地图名称', 'name', this.draft.name)}
          ${textField('推荐境界', 'recommendedRealm', this.draft.recommendedRealm)}
          ${numberField('危险度', 'dangerLevel', this.draft.dangerLevel)}
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
                <option value="${tileType}" ${this.resizeFillTileType === tileType ? 'selected' : ''}>${escapeHtml(TILE_LABELS[tileType])}</option>
              `).join('')}
            </select>
          </label>
        </div>
        <div class="button-row" style="margin-top: 10px;">
          <button class="small-btn" type="button" data-map-action="resize">应用尺寸</button>
        </div>
      </section>
    `;

    const entitiesMarkup = `
      <section class="editor-section">
        <div class="editor-section-head">
          <div>
            <div class="editor-section-title">地图对象</div>
            <div class="editor-section-note">以当前格为锚点新增或切换对象。</div>
          </div>
          <div class="button-row">
            <button class="small-btn" type="button" data-map-action="add-portal">新建传送点</button>
            <button class="small-btn" type="button" data-map-action="add-npc">新建 NPC</button>
            <button class="small-btn" type="button" data-map-action="add-monster">新建怪物点</button>
            <button class="small-btn" type="button" data-map-action="add-aura">新建灵气点</button>
            <button class="small-btn" type="button" data-map-action="add-landmark">新建地标</button>
          </div>
        </div>
        <div class="editor-section-note">传送点</div>
        <div class="map-entity-list" style="margin-top: 8px;">
          ${this.draft.portals.map((portal, index) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'portal' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="portal" data-entity-index="${index}" type="button">
              ${escapeHtml(`${portal.kind === 'stairs' ? '楼梯' : '传送阵'} (${portal.x},${portal.y}) -> ${portal.targetMapId}`)}
            </button>
          `).join('') || '<div class="editor-note">暂无传送点。</div>'}
        </div>
        <div class="editor-section-note" style="margin-top: 12px;">NPC</div>
        <div class="map-entity-list" style="margin-top: 8px;">
          ${this.draft.npcs.map((npc, index) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'npc' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="npc" data-entity-index="${index}" type="button">
              ${escapeHtml(`${npc.name || npc.id} @ (${npc.x},${npc.y})`)}
            </button>
          `).join('') || '<div class="editor-note">暂无 NPC。</div>'}
        </div>
        <div class="editor-section-note" style="margin-top: 12px;">怪物刷新点</div>
        <div class="map-entity-list" style="margin-top: 8px;">
          ${this.draft.monsterSpawns.map((spawn, index) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'monster' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="monster" data-entity-index="${index}" type="button">
              ${escapeHtml(`${spawn.name || spawn.id} @ (${spawn.x},${spawn.y})`)}
            </button>
          `).join('') || '<div class="editor-note">暂无怪物刷新点。</div>'}
        </div>
        <div class="editor-section-note" style="margin-top: 12px;">灵气点</div>
        <div class="map-entity-list" style="margin-top: 8px;">
          ${(this.draft.auras ?? []).map((point, index) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'aura' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="aura" data-entity-index="${index}" type="button">
              ${escapeHtml(`(${point.x},${point.y}) = ${point.value}`)}
            </button>
          `).join('') || '<div class="editor-note">暂无灵气点。</div>'}
        </div>
        <div class="editor-section-note" style="margin-top: 12px;">地标</div>
        <div class="map-entity-list" style="margin-top: 8px;">
          ${(this.draft.landmarks ?? []).map((landmark, index) => `
            <button class="map-entity-btn ${this.selectedEntity?.kind === 'landmark' && this.selectedEntity.index === index ? 'active' : ''}" data-entity-kind="landmark" data-entity-index="${index}" type="button">
              ${escapeHtml(`${landmark.name || landmark.id} @ (${landmark.x},${landmark.y})`)}
            </button>
          `).join('') || '<div class="editor-note">暂无地标。</div>'}
        </div>
      </section>
    `;

    const selectedEntityMarkup = this.renderSelectedEntitySection(selectedEntityPoint);
    this.inspectorEl.innerHTML = `${selectionMarkup}${metaMarkup}${entitiesMarkup}${selectedEntityMarkup}`;
    this.jsonEl.value = formatJson(this.draft);
    this.renderCanvas();
  }

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
          <div class="editor-note">当前没有选中的传送点、NPC、怪物刷新点、灵气点或地标。</div>
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
            ${textField('目标地图', `portals.${this.selectedEntity.index}.targetMapId`, portal.targetMapId)}
            ${numberField('目标 X', `portals.${this.selectedEntity.index}.targetX`, portal.targetX)}
            ${numberField('目标 Y', `portals.${this.selectedEntity.index}.targetY`, portal.targetY)}
          </div>
        </section>
      `;
    }

    if (this.selectedEntity.kind === 'npc') {
      const npc = this.draft.npcs[this.selectedEntity.index];
      if (!npc) return '';
      return `
        <section class="editor-section">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">NPC 属性</div>
              <div class="editor-section-note">复杂任务链保留在 JSON 文本中编辑。</div>
            </div>
            <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
          </div>
          <div class="map-form-grid">
            ${textField('ID', `npcs.${this.selectedEntity.index}.id`, npc.id)}
            ${textField('名称', `npcs.${this.selectedEntity.index}.name`, npc.name)}
            ${numberField('X', `npcs.${this.selectedEntity.index}.x`, npc.x)}
            ${numberField('Y', `npcs.${this.selectedEntity.index}.y`, npc.y)}
            ${textField('显示字', `npcs.${this.selectedEntity.index}.char`, npc.char)}
            ${textField('颜色', `npcs.${this.selectedEntity.index}.color`, npc.color)}
            ${textField('角色类型', `npcs.${this.selectedEntity.index}.role`, npc.role)}
            ${textField('对白', `npcs.${this.selectedEntity.index}.dialogue`, npc.dialogue, 'wide')}
            ${jsonField('任务列表', `npcs.${this.selectedEntity.index}.quests`, npc.quests ?? [], 'wide')}
          </div>
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
              <div class="editor-section-note">可视位置和数值都在这里编辑。</div>
            </div>
            <button class="small-btn danger" type="button" data-map-action="remove-selected">删除</button>
          </div>
          <div class="map-form-grid">
            ${textField('ID', `monsterSpawns.${this.selectedEntity.index}.id`, spawn.id)}
            ${textField('名称', `monsterSpawns.${this.selectedEntity.index}.name`, spawn.name)}
            ${numberField('X', `monsterSpawns.${this.selectedEntity.index}.x`, spawn.x)}
            ${numberField('Y', `monsterSpawns.${this.selectedEntity.index}.y`, spawn.y)}
            ${textField('显示字', `monsterSpawns.${this.selectedEntity.index}.char`, spawn.char)}
            ${textField('颜色', `monsterSpawns.${this.selectedEntity.index}.color`, spawn.color)}
            ${numberField('HP', `monsterSpawns.${this.selectedEntity.index}.hp`, spawn.hp)}
            ${numberField('最大 HP', `monsterSpawns.${this.selectedEntity.index}.maxHp`, spawn.maxHp ?? spawn.hp)}
            ${numberField('攻击', `monsterSpawns.${this.selectedEntity.index}.attack`, spawn.attack)}
            ${numberField('巡逻半径', `monsterSpawns.${this.selectedEntity.index}.radius`, spawn.radius ?? 3)}
            ${numberField('最大存活', `monsterSpawns.${this.selectedEntity.index}.maxAlive`, spawn.maxAlive ?? 1)}
            ${numberField('仇恨范围', `monsterSpawns.${this.selectedEntity.index}.aggroRange`, spawn.aggroRange ?? 6)}
            ${numberField('重生秒数', `monsterSpawns.${this.selectedEntity.index}.respawnSec`, spawn.respawnSec ?? spawn.respawnTicks ?? 15)}
            ${numberField('等级', `monsterSpawns.${this.selectedEntity.index}.level`, spawn.level ?? 1)}
            ${numberField('经验倍率', `monsterSpawns.${this.selectedEntity.index}.expMultiplier`, spawn.expMultiplier ?? 1)}
            ${jsonField('掉落列表', `monsterSpawns.${this.selectedEntity.index}.drops`, spawn.drops ?? [], 'wide')}
          </div>
        </section>
      `;
    }

    const aura = this.draft.auras?.[this.selectedEntity.index];
    if (this.selectedEntity.kind === 'aura') {
      if (!aura) return '';
      return `
        <section class="editor-section">
          <div class="editor-section-head">
            <div>
              <div class="editor-section-title">灵气点属性</div>
              <div class="editor-section-note">用于调试感气地图热点。</div>
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
          ${textField('说明', `landmarks.${this.selectedEntity.index}.desc`, landmark.desc, 'wide')}
        </div>
      </section>
    `;
  }

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
    }
  }

  private syncInspectorToDraft(): { ok: true } | { ok: false; message: string } {
    if (!this.draft) {
      return { ok: false, message: '当前没有地图草稿' };
    }
    const next = clone(this.draft);
    const fields = this.inspectorEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-map-bind]');
    for (const field of fields) {
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
    this.draft = next;
    this.dirty = true;
    return { ok: true };
  }

  private handleAction(action: string, trigger: HTMLElement): void {
    if (!this.draft) return;
    const synced = this.syncInspectorToDraft();
    if (!synced.ok) {
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
          this.draft.spawnPoint = { ...this.selectedCell };
          this.markDirty();
        }
        return;
      case 'move-selected':
        this.moveSelectedEntityToCurrentCell();
        return;
      case 'add-portal':
        this.addPortalAtCurrentCell();
        return;
      case 'add-npc':
        this.addNpcAtCurrentCell();
        return;
      case 'add-monster':
        this.addMonsterAtCurrentCell();
        return;
      case 'add-aura':
        this.addAuraAtCurrentCell();
        return;
      case 'add-landmark':
        this.addLandmarkAtCurrentCell();
        return;
      case 'remove-selected':
        this.removeSelectedEntity();
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

  private addPortalAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    if (!this.ensureWalkableSelection('传送点')) return;
    const targetMapId = this.mapList.find((map) => map.id !== this.draft!.id)?.id ?? this.draft!.id;
    this.draft!.portals.push({ x, y, targetMapId, targetX: 0, targetY: 0, kind: 'portal', trigger: 'manual' });
    this.selectedEntity = { kind: 'portal', index: this.draft!.portals.length - 1 };
    this.markDirty();
  }

  private addNpcAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    if (!this.ensureWalkableSelection('NPC')) return;
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

  private addMonsterAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    if (!this.ensureWalkableSelection('怪物刷新点')) return;
    this.draft!.monsterSpawns.push({
      id: `monster_${this.draft!.id}_${this.draft!.monsterSpawns.length + 1}`,
      name: '新怪物点',
      x,
      y,
      char: '妖',
      color: '#c47f7f',
      hp: 10,
      maxHp: 10,
      attack: 2,
      radius: 3,
      maxAlive: 1,
      aggroRange: 6,
      respawnSec: 15,
      level: 1,
      expMultiplier: 1,
      drops: [],
    });
    this.selectedEntity = { kind: 'monster', index: this.draft!.monsterSpawns.length - 1 };
    this.markDirty();
  }

  private addAuraAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
    this.draft!.auras = this.draft!.auras ?? [];
    this.draft!.auras.push({ x, y, value: 1 });
    this.selectedEntity = { kind: 'aura', index: this.draft!.auras.length - 1 };
    this.markDirty();
  }

  private addLandmarkAtCurrentCell(): void {
    if (!this.ensureSelectedCell()) return;
    const { x, y } = this.selectedCell!;
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

  private moveSelectedEntityToCurrentCell(): void {
    if (!this.draft || !this.selectedEntity || !this.selectedCell) {
      this.setStatus('请先选中对象和目标格', true);
      return;
    }
    const { x, y } = this.selectedCell;
    if (this.selectedEntity.kind === 'aura') {
      const aura = this.draft.auras?.[this.selectedEntity.index];
      if (aura) {
        aura.x = x;
        aura.y = y;
      }
      this.markDirty();
      return;
    }
    if (this.selectedEntity.kind === 'landmark') {
      const landmark = this.draft.landmarks?.[this.selectedEntity.index];
      if (landmark) {
        landmark.x = x;
        landmark.y = y;
      }
      this.markDirty();
      return;
    }
    if (!isTileTypeWalkable(this.getTileTypeAt(x, y))) {
      this.setStatus('目标格不是可通行地块，无法放置对象', true);
      return;
    }
    if (this.selectedEntity.kind === 'portal') {
      const portal = this.draft.portals[this.selectedEntity.index];
      if (portal) {
        portal.x = x;
        portal.y = y;
      }
    } else if (this.selectedEntity.kind === 'npc') {
      const npc = this.draft.npcs[this.selectedEntity.index];
      if (npc) {
        npc.x = x;
        npc.y = y;
      }
    } else if (this.selectedEntity.kind === 'monster') {
      const spawn = this.draft.monsterSpawns[this.selectedEntity.index];
      if (spawn) {
        spawn.x = x;
        spawn.y = y;
      }
    }
    this.markDirty();
  }

  private removeSelectedEntity(): void {
    if (!this.draft || !this.selectedEntity) return;
    if (this.selectedEntity.kind === 'portal') {
      removeArrayIndex(this.draft, 'portals', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'npc') {
      removeArrayIndex(this.draft, 'npcs', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'monster') {
      removeArrayIndex(this.draft, 'monsterSpawns', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'aura') {
      removeArrayIndex(this.draft, 'auras', this.selectedEntity.index);
    } else if (this.selectedEntity.kind === 'landmark') {
      removeArrayIndex(this.draft, 'landmarks', this.selectedEntity.index);
    }
    this.selectedEntity = null;
    this.markDirty();
  }

  private applyResize(): void {
    if (!this.draft) return;
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
          if (Math.abs(dx) + Math.abs(dy) > radius) continue;
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

  private resetDraft(): void {
    if (!this.selectedMapId) return;
    if (this.dirty && !window.confirm('确定放弃当前地图的未保存修改吗？')) {
      return;
    }
    this.loadMap(this.selectedMapId).catch(() => {});
  }

  private async reloadCurrentMap(): Promise<void> {
    if (!this.selectedMapId) return;
    if (this.dirty && !window.confirm('当前有未保存修改，重新载入会丢失这些修改。继续吗？')) {
      return;
    }
    await this.loadMap(this.selectedMapId);
  }

  private applyRawJson(): void {
    if (!this.selectedMapId) return;
    try {
      const next = JSON.parse(this.jsonEl.value) as GmMapDocument;
      this.draft = next;
      this.selectedMapId = next.id;
      this.resizeWidth = next.width;
      this.resizeHeight = next.height;
      this.selectedCell = { x: next.spawnPoint.x, y: next.spawnPoint.y };
      this.dirty = true;
      this.centerView();
      this.renderInspector();
      this.renderMapList();
      this.setStatus('地图 JSON 已应用到可视化编辑区');
    } catch {
      this.setStatus('地图 JSON 解析失败', true);
    }
  }

  private async saveCurrentMap(): Promise<void> {
    if (!this.draft || !this.selectedMapId) {
      this.setStatus('请先选择地图', true);
      return;
    }
    const synced = this.syncInspectorToDraft();
    if (!synced.ok) {
      this.setStatus(synced.message, true);
      return;
    }
    this.saveBtn.disabled = true;
    try {
      await this.request<{ ok: true }>(`/gm/maps/${encodeURIComponent(this.selectedMapId)}`, {
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

  private centerView(): void {
    if (!this.draft) return;
    const cellSize = getCellSize();
    this.viewCenterX = this.draft.width * cellSize / 2;
    this.viewCenterY = this.draft.height * cellSize / 2;
    this.renderCanvas();
  }

  private applyZoom(delta: number): void {
    const oldSize = getCellSize();
    const gridCenterX = oldSize > 0 ? this.viewCenterX / oldSize : 0;
    const gridCenterY = oldSize > 0 ? this.viewCenterY / oldSize : 0;
    adjustZoom(delta);
    const nextSize = getCellSize();
    this.viewCenterX = gridCenterX * nextSize;
    this.viewCenterY = gridCenterY * nextSize;
    this.renderCanvas();
  }

  private renderCanvas(): void {
    this.resizeCanvas();
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = '#1a1816';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.draft) return;
    const cellSize = getCellSize();
    const screenW = this.canvas.width;
    const screenH = this.canvas.height;
    const camWorldX = this.viewCenterX - screenW / 2;
    const camWorldY = this.viewCenterY - screenH / 2;
    const startGX = Math.floor(camWorldX / cellSize) - 1;
    const startGY = Math.floor(camWorldY / cellSize) - 1;
    const endGX = Math.ceil((camWorldX + screenW) / cellSize) + 1;
    const endGY = Math.ceil((camWorldY + screenH) / cellSize) + 1;

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
        ctx.fillStyle = TILE_BG[type];
        ctx.fillRect(sx, sy, cellSize, cellSize);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx, sy, cellSize, cellSize);

        const ch = TILE_CHAR[type];
        if (ch) {
          ctx.fillStyle = CHAR_COLOR[type];
          ctx.font = `${cellSize * 0.6}px "Ma Shan Zheng", cursive`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ch, sx + cellSize / 2, sy + cellSize / 2 + 1);
        }

        const aura = (this.draft.auras ?? []).find((point) => point.x === gx && point.y === gy);
        if (aura) {
          ctx.fillStyle = 'rgba(90, 170, 255, 0.18)';
          ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
        }

        const isSelected = this.selectedCell?.x === gx && this.selectedCell?.y === gy;
        const isHovered = this.hoveredCell?.x === gx && this.hoveredCell?.y === gy;
        if (isSelected || isHovered) {
          ctx.fillStyle = isSelected ? 'rgba(208, 76, 56, 0.26)' : 'rgba(212, 164, 71, 0.16)';
          ctx.fillRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
          ctx.strokeStyle = isSelected ? 'rgba(166, 37, 31, 0.96)' : 'rgba(123, 91, 20, 0.55)';
          ctx.lineWidth = isSelected ? 2 : 1;
          ctx.strokeRect(sx + 1.5, sy + 1.5, cellSize - 3, cellSize - 3);
        }
      }
    }

    this.drawEntities(ctx, screenW, screenH, cellSize);
  }

  private drawEntities(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, cellSize: number): void {
    if (!this.draft) return;
    const drawEntity = (wx: number, wy: number, char: string, color: string, name: string, kind: 'npc' | 'monster' | 'spawn'): void => {
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
      ctx.font = `bold ${cellSize * 0.75}px "Ma Shan Zheng", cursive`;
      ctx.strokeText(char, sx + cellSize / 2, sy + cellSize / 2);
      ctx.fillText(char, sx + cellSize / 2, sy + cellSize / 2);
      ctx.font = `${cellSize * 0.3}px "Noto Serif SC", serif`;
      ctx.strokeStyle = 'rgba(15,12,10,0.9)';
      ctx.fillStyle = kind === 'monster' ? '#ffddcc' : kind === 'spawn' ? '#fff0b0' : '#cce7ff';
      ctx.textBaseline = 'alphabetic';
      ctx.strokeText(name, sx + cellSize / 2, sy - Math.max(6, cellSize * 0.18));
      ctx.fillText(name, sx + cellSize / 2, sy - Math.max(6, cellSize * 0.18));
    };

    const drawLandmark = (landmark: GmMapLandmarkRecord): void => {
      const sx = landmark.x * cellSize - this.viewCenterX + screenW / 2;
      const sy = landmark.y * cellSize - this.viewCenterY + screenH / 2;
      if (sx + cellSize < 0 || sx > screenW || sy + cellSize < 0 || sy > screenH) return;
      const label = landmark.name || landmark.id;
      if (!label) return;
      const anchorY = sy + cellSize + Math.max(12, cellSize * 0.34);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.max(12, cellSize * 0.34)}px "Noto Serif SC", serif`;
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
        `${isStairs ? '楼梯' : '传送'}:${portal.targetMapId}`,
        'npc',
      );
    });
    this.draft.npcs.forEach((npc) => drawEntity(npc.x, npc.y, npc.char || '人', npc.color || '#d6d0c4', npc.name || npc.id, 'npc'));
    this.draft.monsterSpawns.forEach((spawn) => drawEntity(spawn.x, spawn.y, spawn.char || '妖', spawn.color || '#d27a7a', spawn.name || spawn.id, 'monster'));
    (this.draft.auras ?? []).forEach((point) => drawEntity(point.x, point.y, '灵', '#77b8ff', `灵气:${point.value}`, 'npc'));
    (this.draft.landmarks ?? []).forEach((landmark) => drawLandmark(landmark));
  }

  private resizeCanvas(): void {
    const width = Math.max(1, Math.floor(this.canvasHost.clientWidth));
    const height = Math.max(1, Math.floor(this.canvasHost.clientHeight));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  private handleCanvasPointerDown(event: PointerEvent): void {
    const point = this.screenToGrid(event.clientX, event.clientY);
    const wantsPan = event.button === 2 || (this.activeTool === 'pan' && event.button === 0);
    if (wantsPan) {
      this.panActive = true;
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
    this.activePointerId = event.pointerId;
    this.activePanButtonMask = 0;
    this.canvas.setPointerCapture(event.pointerId);
    this.selectedCell = point;
    this.selectedEntity = this.findEntityAt(point.x, point.y);
    if (this.activeTool === 'paint') {
      this.paintActive = true;
      this.paintTileAt(point.x, point.y);
    }
    this.renderInspector();
  }

  private handleCanvasPointerMove(event: PointerEvent): void {
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
    if (this.paintActive) {
      if ((event.buttons & 1) === 0) {
        this.endPointerInteraction();
        return;
      }
    }
    if (this.paintActive && point) {
      this.paintTileAt(point.x, point.y);
      this.renderCanvas();
      return;
    }
  }

  private endPointerInteraction(): void {
    if (this.activePointerId !== null && this.canvas.hasPointerCapture(this.activePointerId)) {
      this.canvas.releasePointerCapture(this.activePointerId);
    }
    if (this.paintActive && this.draft) {
      this.renderInspector();
    }
    this.paintActive = false;
    this.panActive = false;
    this.lastPaintKey = null;
    this.activePointerId = null;
    this.activePanButtonMask = 0;
    this.renderCanvas();
  }

  private screenToGrid(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.draft) return null;
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return null;
    const cellSize = getCellSize();
    const worldX = sx + this.viewCenterX - rect.width / 2;
    const worldY = sy + this.viewCenterY - rect.height / 2;
    const x = Math.floor(worldX / cellSize);
    const y = Math.floor(worldY / cellSize);
    if (x < 0 || y < 0 || x >= this.draft.width || y >= this.draft.height) return null;
    return { x, y };
  }

  private paintTileAt(x: number, y: number): void {
    if (!this.draft) return;
    const key = `${x},${y}`;
    if (this.lastPaintKey === key) return;
    this.lastPaintKey = key;
    const nextType = this.paintTileType;
    const currentType = this.getTileTypeAt(x, y);
    if (currentType === nextType) return;
    if (!isTileTypeWalkable(nextType) && this.hasBlockingMapObjectAt(x, y)) {
      this.setStatus('该格存在出生点或可交互对象，先移动或删除对象后再改成不可通行地块', true);
      return;
    }
    const chars = [...(this.draft.tiles[y] ?? '')];
    chars[x] = getMapCharFromTileType(nextType);
    this.draft.tiles[y] = chars.join('');
    this.markDirty(false);
  }

  private hasBlockingMapObjectAt(x: number, y: number): boolean {
    if (!this.draft) return false;
    if (this.draft.spawnPoint.x === x && this.draft.spawnPoint.y === y) return true;
    if (this.draft.portals.some((portal) => portal.x === x && portal.y === y)) return true;
    if (this.draft.npcs.some((npc) => npc.x === x && npc.y === y)) return true;
    if (this.draft.monsterSpawns.some((spawn) => spawn.x === x && spawn.y === y)) return true;
    return false;
  }

  private ensureSelectedCell(): boolean {
    if (!this.selectedCell) {
      this.setStatus('请先在画布上选中一个格子', true);
      return false;
    }
    return true;
  }

  private ensureWalkableSelection(label: string): boolean {
    if (!this.selectedCell) return false;
    if (!isTileTypeWalkable(this.getTileTypeAt(this.selectedCell.x, this.selectedCell.y))) {
      this.setStatus(`${label} 必须放在可通行地块上`, true);
      return false;
    }
    return true;
  }

  private getTileTypeAt(x: number, y: number): TileType {
    if (!this.draft) return TileType.Floor;
    return getTileTypeFromMapChar(this.draft.tiles[y]?.[x] ?? '.');
  }

  private findEntityAt(x: number, y: number): MapEntitySelection {
    if (!this.draft) return null;
    const npcIndex = this.draft.npcs.findIndex((npc) => npc.x === x && npc.y === y);
    if (npcIndex >= 0) return { kind: 'npc', index: npcIndex };
    const monsterIndex = this.draft.monsterSpawns.findIndex((spawn) => spawn.x === x && spawn.y === y);
    if (monsterIndex >= 0) return { kind: 'monster', index: monsterIndex };
    const portalIndex = this.draft.portals.findIndex((portal) => portal.x === x && portal.y === y);
    if (portalIndex >= 0) return { kind: 'portal', index: portalIndex };
    const auraIndex = (this.draft.auras ?? []).findIndex((point) => point.x === x && point.y === y);
    if (auraIndex >= 0) return { kind: 'aura', index: auraIndex };
    const landmarkIndex = (this.draft.landmarks ?? []).findIndex((landmark) => landmark.x === x && landmark.y === y);
    if (landmarkIndex >= 0) return { kind: 'landmark', index: landmarkIndex };
    return null;
  }

  private getSelectedEntityPoint(): { x: number; y: number } | null {
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
    const landmark = this.draft.landmarks?.[this.selectedEntity.index];
    return landmark ? { x: landmark.x, y: landmark.y } : null;
  }

  private markDirty(render = true): void {
    this.dirty = true;
    if (render) this.renderInspector();
    else this.jsonEl.value = formatJson(this.draft);
  }
}
