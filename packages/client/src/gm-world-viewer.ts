/**
 * GM 世界管理查看器 —— 复用 TextRenderer + Camera 渲染运行时地图
 * 上帝视角，无迷雾，支持拖动、缩放、选中查看
 * 当前作为 GM 独立运行时查看工具继续保留，不并入玩家主线 main.ts，也不作为 next cutover 的前台阻塞项。
 */
import {
  GM_WORLD_DEFAULT_ZOOM,
  GM_WORLD_POLL_INTERVAL_MS,
  type GmMapListRes,
  type GmMapRuntimeRes,
  type GmMapSummary,
  type GmRuntimeEntity,
  type GmUpdateMapTickReq,
  type GmUpdateMapTimeReq,
  type Tile,
  type TileType,
  ENTITY_KIND_LABELS,
  TILE_TYPE_LABELS,
} from '@mud/shared-next';
import { TextRenderer } from './renderer/text';
import { Camera } from './renderer/camera';
import { getCellSize, setZoom, updateDisplayMetrics } from './display';
import { GM_WORLD_VIEW_MAX } from './constants/world/gm-world-viewer';
import { GM_API_BASE_PATH } from './constants/api';

/** RequestFn：世界查看器的请求回调签名。 */
type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;
/** StatusFn：向世界查看器状态栏输出提示或错误的回调签名。 */
type StatusFn = (message: string, isError?: boolean) => void;

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** createFragmentFromHtml：从 HTML 创建片段。 */
function createFragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

/** formatClockFromTicks：格式化时钟From Ticks。 */
function formatClockFromTicks(localTicks: number, dayLength: number): string {
  const safeDayLength = Math.max(1, dayLength);
  const normalizedTicks = ((localTicks % safeDayLength) + safeDayLength) % safeDayLength;
  const totalMinutes = Math.floor((normalizedTicks / safeDayLength) * 24 * 60);
  const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** formatDebugNumber：格式化调试数值。 */
function formatDebugNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

/** createViewerId：创建Viewer ID。 */
function createViewerId(): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gm-viewer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** GmWorldViewer：GM世界Viewer实现。 */
export class GmWorldViewer {
  /** canvas：canvas。 */
  private canvas: HTMLCanvasElement;
  /** mapListEl：地图列表元素。 */
  private mapListEl: HTMLElement;
  /** timeControlEl：时间Control元素。 */
  private timeControlEl: HTMLElement;
  /** infoEl：信息元素。 */
  private infoEl: HTMLElement;

  /** renderer：renderer。 */
  private renderer: TextRenderer;
  /** camera：camera。 */
  private camera: Camera;

  /** currentMapId：当前地图ID。 */
  private currentMapId: string | null = null;
  /** maps：maps。 */
  private maps: GmMapSummary[] = [];
  /** runtimeData：运行时数据。 */
  private runtimeData: GmMapRuntimeRes | null = null;  
  /**
 * viewX：GmWorldViewer 内部字段。
 */


  // 视口中心（世界坐标）
  private viewX = 0;
  /** viewY：视图Y。 */
  private viewY = 0;  
  /**
 * selectedCell：GmWorldViewer 内部字段。
 */


  // 选中状态
  private selectedCell: {  
  /**
 * x：GmWorldViewer 内部字段。
 */
 x: number;  
 /**
 * y：GmWorldViewer 内部字段。
 */
 y: number } | null = null;
  /** selectedEntity：selected实体。 */
  private selectedEntity: GmRuntimeEntity | null = null;  
  /**
 * isDragging：GmWorldViewer 内部字段。
 */


  // 拖动状态
  private isDragging = false;
  /** dragStartScreenX：drag Start屏幕X。 */
  private dragStartScreenX = 0;
  /** dragStartScreenY：drag Start屏幕Y。 */
  private dragStartScreenY = 0;
  /** dragStartViewX：drag Start视图X。 */
  private dragStartViewX = 0;
  /** dragStartViewY：drag Start视图Y。 */
  private dragStartViewY = 0;

  /** pollTimer：poll Timer。 */
  private pollTimer: number | null = null;
  /** rafId：raf ID。 */
  private rafId: number | null = null;
  /** mounted：mounted。 */
  private mounted = false;
  /** speedDraft：速度Draft。 */
  private speedDraft: string | null = null;
  /** offsetDraft：偏移Draft。 */
  private offsetDraft: string | null = null;
  /** viewerId：viewer ID。 */
  private readonly viewerId = createViewerId();
  /** observationRegistered：observation Registered。 */
  private observationRegistered = false;
  /** timeControlBound：时间控制事件是否已绑定。 */
  private timeControlBound = false;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param request RequestFn 请求参数。
 * @param setStatus StatusFn 参数说明。
 * @returns 无返回值（构造函数）。
 */


  constructor(
    private readonly request: RequestFn,
    private readonly setStatus: StatusFn,
  ) {
    this.canvas = document.getElementById('world-canvas') as HTMLCanvasElement;
    this.mapListEl = document.getElementById('world-map-list')!;
    this.timeControlEl = document.getElementById('world-time-control')!;
    this.infoEl = document.getElementById('world-info')!;

    this.renderer = new TextRenderer();
    this.camera = new Camera();
  }

  /** mount：处理mount。 */
  mount(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.mounted) return;
    this.mounted = true;
    this.renderer.init(this.canvas);
    this.resizeCanvas();
    setZoom(GM_WORLD_DEFAULT_ZOOM);
    this.bindEvents();
    window.addEventListener('resize', this.handleResize);
  }

  /** unmount：处理unmount。 */
  unmount(): void {
    this.stopPolling();
    this.stopRaf();
    window.removeEventListener('resize', this.handleResize);
    this.mounted = false;
  }

  /** updateMapIds：更新地图ID 列表。 */
  async updateMapIds(_mapIds: string[]): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    try {
      const res = await this.request<GmMapListRes>(`${GM_API_BASE_PATH}/maps`);
      this.maps = res.maps;
    } catch {
      this.maps = _mapIds.map((id) => ({ id, name: id, width: 0, height: 0, portalCount: 0, npcCount: 0, monsterSpawnCount: 0 }));
    }
    this.renderMapList();
  }

  /** selectMap：选择地图。 */
  async selectMap(mapId: string): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.currentMapId = mapId;
    this.selectedCell = null;
    this.selectedEntity = null;
    this.renderer.resetScene();
    this.renderMapList();
    await this.loadRuntime();
    if (this.runtimeData) {
      this.viewX = Math.floor(this.runtimeData.width / 2);
      this.viewY = Math.floor(this.runtimeData.height / 2);
      this.snapCamera();
      await this.loadRuntime();
    }
    this.renderAll();
  }

  /** startPolling：启动Polling。 */
  startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => {
      if (this.currentMapId) {
        this.loadRuntime().then(() => this.renderAll()).catch(() => {});
      }
    }, GM_WORLD_POLL_INTERVAL_MS);
    this.startRaf();
  }

  /** stopPolling：停止Polling。 */
  stopPolling(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.stopRaf();
    this.clearObservation();
  }  
  /**
 * startRaf：执行核心业务逻辑。
 * @returns void。
 */


  // ===== RAF 循环（平滑摄像机） =====

  private startRaf(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.rafId !== null) return;
    let lastTime = performance.now();
    /** loop：处理loop。 */
    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      this.camera.update(dt);
      this.renderCanvas();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** stopRaf：停止Raf。 */
  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }  
  /**
 * loadRuntime：按给定条件读取/查询数据。
 * @returns Promise<void>。
 */


  // ===== 数据加载 =====

  private async loadRuntime(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.currentMapId) return;
    const { startX, startY, w, h } = this.getViewport();
    try {
      const params = new URLSearchParams({
        x: String(startX),
        y: String(startY),
        w: String(w),
        h: String(h),
        viewerId: this.viewerId,
      });
      this.runtimeData = await this.request<GmMapRuntimeRes>(
        `${GM_API_BASE_PATH}/maps/${this.currentMapId}/runtime?${params.toString()}`,
      );
      this.observationRegistered = true;
      this.syncToRenderer();
      this.renderTimeControl();
      this.renderInfo();
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : '加载运行时数据失败', true);
    }
  }

  /** 将服务端运行时数据转换为 TextRenderer 需要的格式 */
  private syncToRenderer(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.runtimeData) return;
    const d = this.runtimeData;
    const { startX, startY } = this.getViewport();
    const cellSize = getCellSize();

    // 构建 tileCache
    const tileCache = new Map<string, Tile>();
    for (let dy = 0; dy < d.tiles.length; dy++) {
      const row = d.tiles[dy]!;
      for (let dx = 0; dx < row.length; dx++) {
        const vt = row[dx];
        if (!vt) continue;
        const wx = startX + dx;
        const wy = startY + dy;
        tileCache.set(`${wx},${wy}`, {
          type: vt.type as TileType,
          walkable: vt.walkable,
          blocksSight: false,
          aura: vt.aura ?? 0,
          occupiedBy: null,
          modifiedAt: null,
        });
      }
    }
    this.currentTileCache = tileCache;
    this.currentTileRevision += 1;

    // 构建实体列表（wx/wy 是格子坐标，TextRenderer 内部会乘 cellSize）
    const entityList = d.entities.map((e) => ({
      id: e.id,
      wx: e.x,
      wy: e.y,
      char: e.char,
      color: e.color,
      name: e.name,
      kind: e.kind,
      hp: e.hp,
      maxHp: e.maxHp,
    }));
    this.renderer.updateEntities(entityList);
  }

  /** currentTileCache：当前地块缓存。 */
  private currentTileCache: Map<string, Tile> = new Map();
  /** currentTileRevision：当前地块Revision。 */
  private currentTileRevision = 0;

  /** getViewport：读取视口。 */
  private getViewport(): {  
  /**
 * startX：GmWorldViewer 内部字段。
 */
 startX: number;  
 /**
 * startY：GmWorldViewer 内部字段。
 */
 startY: number;  
 /**
 * w：GmWorldViewer 内部字段。
 */
 w: number;  
 /**
 * h：GmWorldViewer 内部字段。
 */
 h: number } {
    const cellSize = getCellSize();
    const tilesX = Math.min(GM_WORLD_VIEW_MAX, Math.ceil(this.canvas.width / cellSize) + 2);
    const tilesY = Math.min(GM_WORLD_VIEW_MAX, Math.ceil(this.canvas.height / cellSize) + 2);
    const halfX = Math.floor(tilesX / 2);
    const halfY = Math.floor(tilesY / 2);
    return {
      startX: Math.max(0, this.viewX - halfX),
      startY: Math.max(0, this.viewY - halfY),
      w: tilesX,
      h: tilesY,
    };
  }

  /** snapCamera：处理snap Camera。 */
  private snapCamera(): void {
    const cellSize = getCellSize();
    const fakePlayer = {
      x: this.viewX,
      y: this.viewY,
      id: '', name: '', mapId: '', facing: 0, viewRange: 10,
      hp: 1, maxHp: 1, qi: 0, dead: false, baseAttrs: {} as any,
      bonuses: [], temporaryBuffs: [], inventory: {} as any,
      equipment: {} as any, techniques: [], quests: [], actions: [],
      autoBattle: false, autoBattleSkills: [], autoRetaliate: true,
      autoIdleCultivation: true, idleTicks: 0,
    } as any;
    this.camera.snap(fakePlayer);
  }  
  /**
 * renderAll：执行核心业务逻辑。
 * @returns void。
 */


  // ===== 渲染 =====

  private renderAll(): void {
    this.renderCanvas();
    this.renderInfo();
  }

  /** renderCanvas：渲染Canvas。 */
  private renderCanvas(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.runtimeData || !this.mounted) return;

    const cellSize = getCellSize();
    updateDisplayMetrics(this.canvas.width, this.canvas.height, GM_WORLD_VIEW_MAX);

    // 构建 visibleTiles（上帝视角，全部可见）
    const visibleTiles = new Set<string>();
    for (const key of this.currentTileCache.keys()) {
      visibleTiles.add(key);
    }

    this.renderer.clear();
    this.renderer.setGroundPiles([]);
    this.renderer.renderWorld(
      this.camera,
      this.currentTileCache,
      visibleTiles,
      this.currentTileRevision,
      this.viewX,
      this.viewY,
      GM_WORLD_VIEW_MAX,
      GM_WORLD_VIEW_MAX,
      this.runtimeData.time,
    );
    this.renderer.renderEntities(this.camera);

    // 选中高亮
    if (this.selectedCell) {
      const ctx = this.canvas.getContext('2d')!;
      const { sx, sy } = this.camera.worldToScreen(
        this.selectedCell.x * cellSize,
        this.selectedCell.y * cellSize,
        this.canvas.width,
        this.canvas.height,
      );
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, cellSize, cellSize);
      ctx.lineWidth = 1;
    }
  }  
  /**
 * bindEvents：执行核心业务逻辑。
 * @returns void。
 */


  // ===== 交互 =====

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }  
  /**
 * handlePointerDown：GmWorldViewer 内部字段。
 */


  private handlePointerDown = (e: PointerEvent): void => {
    if (e.button === 2 || e.button === 1) {
      this.isDragging = true;
      this.dragStartScreenX = e.clientX;
      this.dragStartScreenY = e.clientY;
      this.dragStartViewX = this.viewX;
      this.dragStartViewY = this.viewY;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 0) {
      const cell = this.screenToWorld(e.offsetX, e.offsetY);
      if (!cell) return;
      this.selectedCell = cell;
      this.selectedEntity = this.findEntityAt(cell.x, cell.y);
      this.renderInfo();
    }
  };  
  /**
 * handlePointerMove：GmWorldViewer 内部字段。
 */


  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    const cellSize = getCellSize();
    const deltaX = (this.dragStartScreenX - e.clientX) / cellSize;
    const deltaY = (this.dragStartScreenY - e.clientY) / cellSize;
    this.viewX = Math.round(this.dragStartViewX + deltaX);
    this.viewY = Math.round(this.dragStartViewY + deltaY);
    this.snapCamera();
    // 拖动中只移动摄像机，不发请求
  };  
  /**
 * handlePointerUp：GmWorldViewer 内部字段。
 */


  private handlePointerUp = (e: PointerEvent): void => {
    if (this.isDragging) {
      this.isDragging = false;
      this.canvas.releasePointerCapture(e.pointerId);
      // 松手后重新加载当前视口数据
      this.loadRuntime().then(() => this.renderAll()).catch(() => {});
    }
  };  
  /**
 * handleWheel：GmWorldViewer 内部字段。
 */


  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const current = getCellSize() / 32;
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    const next = Math.max(0.5, Math.min(4, current + delta));
    setZoom(next);
    updateDisplayMetrics(this.canvas.width, this.canvas.height, GM_WORLD_VIEW_MAX);
    this.snapCamera();
    this.loadRuntime().then(() => this.renderAll()).catch(() => {});
  };  
  /**
 * handleResize：GmWorldViewer 内部字段。
 */


  private handleResize = (): void => {
    this.resizeCanvas();
    this.renderCanvas();
  };

  /** screenToWorld：处理屏幕To世界。 */
  private screenToWorld(sx: number, sy: number): {  
  /**
 * x：GmWorldViewer 内部字段。
 */
 x: number;  
 /**
 * y：GmWorldViewer 内部字段。
 */
 y: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.runtimeData) return null;
    const cellSize = getCellSize();
    const { sx: camSx, sy: camSy } = this.camera.worldToScreen(0, 0, this.canvas.width, this.canvas.height);
    const wx = Math.floor((sx - camSx) / cellSize);
    const wy = Math.floor((sy - camSy) / cellSize);
    if (wx < 0 || wy < 0 || wx >= this.runtimeData.width || wy >= this.runtimeData.height) return null;
    return { x: wx, y: wy };
  }

  /** findEntityAt：查找实体At。 */
  private findEntityAt(x: number, y: number): GmRuntimeEntity | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.runtimeData) return null;
    const sorted = [...this.runtimeData.entities]
      .filter((e) => e.x === x && e.y === y)
      .sort((a, b) => {
        const order = { player: 0, monster: 1, npc: 2, container: 3 };
        return (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
      });
    return sorted[0] ?? null;
  }

  /** resizeCanvas：处理resize Canvas。 */
  private resizeCanvas(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    updateDisplayMetrics(rect.width, rect.height, GM_WORLD_VIEW_MAX);
  }  
  /**
 * renderMapList：执行核心业务逻辑。
 * @returns void。
 */


  // ===== 地图列表 =====

  private renderMapList(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const fragment = document.createDocumentFragment();
    const existingButtons = new Map<string, HTMLButtonElement>();
    this.mapListEl.querySelectorAll<HTMLButtonElement>('.world-map-btn').forEach((button) => {
      const mapId = button.dataset.mapId;
      if (mapId) {
        existingButtons.set(mapId, button);
      }
    });

    for (const map of this.maps) {
      const button = existingButtons.get(map.id) ?? document.createElement('button');
      if (!existingButtons.has(map.id)) {
        button.addEventListener('click', () => {
          const mapId = button.dataset.mapId;
          if (mapId && mapId !== this.currentMapId) {
            this.selectMap(mapId).catch(() => {});
          }
        });
      }
      button.className = `world-map-btn ${map.id === this.currentMapId ? 'active' : ''}`;
      button.dataset.mapId = map.id;
      const nameNode = document.createTextNode(map.name || map.id);
      const idNode = document.createElement('span');
      idNode.style.fontSize = '11px';
      idNode.style.color = '#888';
      idNode.style.marginLeft = '4px';
      idNode.textContent = map.id;
      button.replaceChildren(nameNode, idNode);
      fragment.append(button);
    }

    this.mapListEl.replaceChildren(fragment);
  }  
  /**
 * captureTimeControlDraftState：执行核心业务逻辑。
 * @returns {
    focusedField: 'speed' | 'offset' | null;
    selectionStart: number | null;
    selectionEnd: number | null;
  }。
 */


  // ===== 时间操控 =====

  private captureTimeControlDraftState(): {  
  /**
 * focusedField：GmWorldViewer 内部字段。
 */

    focusedField: 'speed' | 'offset' | null;    
    /**
 * selectionStart：GmWorldViewer 内部字段。
 */

    selectionStart: number | null;    
    /**
 * selectionEnd：GmWorldViewer 内部字段。
 */

    selectionEnd: number | null;
  } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const speedInput = this.timeControlEl.querySelector<HTMLInputElement>('[data-world-speed-input]');
    const offsetInput = this.timeControlEl.querySelector<HTMLInputElement>('[data-world-offset-input]');
    const active = document.activeElement;
    const focusedInput = active instanceof HTMLInputElement ? active : null;
    const focusedField = focusedInput === speedInput
      ? 'speed'
      : focusedInput === offsetInput
        ? 'offset'
        : null;
    if (speedInput) {
      this.speedDraft = focusedField === 'speed' ? speedInput.value : null;
    }
    if (offsetInput) {
      this.offsetDraft = focusedField === 'offset' ? offsetInput.value : null;
    }
    return {
      focusedField,
      selectionStart: focusedInput?.selectionStart ?? null,
      selectionEnd: focusedInput?.selectionEnd ?? null,
    };
  }  
  /**
 * restoreTimeControlFocus：执行核心业务逻辑。
 * @param state {
    focusedField: 'speed' | 'offset' | null;
    selectionStart: number | null;
    selectionEnd: number | null;
  } 状态对象。
 * @returns void。
 */


  private restoreTimeControlFocus(state: {  
  /**
 * focusedField：GmWorldViewer 内部字段。
 */

    focusedField: 'speed' | 'offset' | null;    
    /**
 * selectionStart：GmWorldViewer 内部字段。
 */

    selectionStart: number | null;    
    /**
 * selectionEnd：GmWorldViewer 内部字段。
 */

    selectionEnd: number | null;
  }): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!state.focusedField) {
      return;
    }
    const selector = state.focusedField === 'speed' ? '[data-world-speed-input]' : '[data-world-offset-input]';
    const input = this.timeControlEl.querySelector<HTMLInputElement>(selector);
    if (!input) {
      return;
    }
    input.focus();
    if (state.selectionStart !== null || state.selectionEnd !== null) {
      input.setSelectionRange(state.selectionStart ?? input.value.length, state.selectionEnd ?? input.value.length);
    }
  }

  /** renderTimeControl：渲染时间Control。 */
  private renderTimeControl(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.runtimeData) {
      this.timeControlEl.replaceChildren(createFragmentFromHtml('<div class="empty-hint">未选择地图</div>'));
      return;
    }

    const previousControlState = this.captureTimeControlDraftState();
    const { time, tickSpeed, tickPaused, timeConfig } = this.runtimeData;
    const configuredScale = typeof timeConfig.scale === 'number' ? timeConfig.scale : 1;
    const offsetTicks = typeof timeConfig.offsetTicks === 'number' ? timeConfig.offsetTicks : 0;
    const realtimeTickRate = tickPaused ? 0 : tickSpeed;
    const localTicksPerSecond = realtimeTickRate * configuredScale;
    const realtimeMinutesPerSecond = time.dayLength > 0
      ? localTicksPerSecond / time.dayLength * 24 * 60
      : 0;
    const speedValue = this.speedDraft ?? String(realtimeTickRate);
    const offsetValue = this.offsetDraft ?? String(offsetTicks);
    const speeds = [0, 0.5, 1, 2, 5, 10, 20, 50, 100];
    this.ensureTimeControlShell(speeds);
    this.syncTimeControlMetric('current', formatClockFromTicks(time.localTicks, time.dayLength));
    this.syncTimeControlMetric('phase', time.phaseLabel);
    this.syncTimeControlMetric('light', `${time.lightPercent}%`);
    this.syncTimeControlMetric('darkness', String(time.darknessStacks));
    this.syncTimeControlMetric('control', tickPaused ? '已暂停' : `${formatDebugNumber(realtimeTickRate)}x`);
    this.syncTimeControlMetric('total-ticks', String(time.totalTicks));
    this.syncTimeControlMetric('local-ticks', `${formatDebugNumber(time.localTicks, 2)} / ${time.dayLength}`);
    this.syncTimeControlMetric('offset', String(offsetTicks));
    this.syncTimeControlMetric('scale', `${configuredScale}x`);
    this.syncTimeControlMetric('map-tick', tickPaused ? '已暂停' : `${formatDebugNumber(realtimeTickRate)} 次/秒`);
    this.syncTimeControlMetric('advance', tickPaused ? '已暂停' : `${formatDebugNumber(localTicksPerSecond)} 本地 Tick/秒`);
    this.syncTimeControlMetric('clock-speed', tickPaused ? '已暂停' : `${formatDebugNumber(realtimeMinutesPerSecond)} 分钟/秒`);

    const speedInput = this.timeControlEl.querySelector<HTMLInputElement>('[data-world-speed-input]');
    const offsetInput = this.timeControlEl.querySelector<HTMLInputElement>('[data-world-offset-input]');
    if (speedInput && document.activeElement !== speedInput) {
      speedInput.value = speedValue;
    }
    if (offsetInput && document.activeElement !== offsetInput) {
      offsetInput.value = offsetValue;
    }
    this.timeControlEl.querySelectorAll<HTMLButtonElement>('.world-speed-btn').forEach((button) => {
      const speed = parseFloat(button.dataset.speed ?? '1');
      const active = (tickPaused && speed === 0) || (!tickPaused && tickSpeed === speed);
      button.classList.toggle('active', active);
    });

    this.restoreTimeControlFocus(previousControlState);
  }  
  /**
 * ensureTimeControlShell：执行核心业务逻辑。
 * @param speeds number[] 参数说明。
 * @returns void。
 */


  private ensureTimeControlShell(speeds: number[]): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.timeControlEl.querySelector('[data-world-time-shell]')) {
      return;
    }
    this.timeControlEl.replaceChildren(createFragmentFromHtml(`
      <div data-world-time-shell>
        <div class="world-time-info" data-world-time-info></div>
        <div class="world-tick-control">
          <div class="panel-section-title">时间控制</div>
          <div class="world-speed-btns" data-world-speed-buttons>
            ${speeds.map((speed) => `
              <button class="small-btn world-speed-btn" data-speed="${speed}">
                ${speed === 0 ? '暂停' : `${speed}x`}
              </button>
            `).join('')}
          </div>
          <div class="gm-btn-row" style="margin-top:6px;">
            <input
              type="number"
              class="gm-inline-input"
              data-world-speed-input
              step="0.1"
              min="0"
              max="100"
              style="width:96px"
            />
            <button class="small-btn" data-world-speed-apply>应用速度</button>
          </div>
        </div>
        <div class="world-time-adjust">
          <div class="panel-section-title">时间偏移</div>
          <div class="gm-btn-row">
            <input type="number" data-world-offset-input class="gm-inline-input" style="width:80px" />
            <button class="small-btn" data-world-time-apply>应用</button>
          </div>
        </div>
        <div class="world-time-adjust">
          <div class="panel-section-title">运行配置</div>
          <div class="gm-btn-row">
            <button class="small-btn" data-world-reload-tick-config>重新加载服务端配置</button>
          </div>
        </div>
      </div>
    `));
    const infoEl = this.timeControlEl.querySelector<HTMLElement>('[data-world-time-info]');
    if (infoEl) {
      infoEl.replaceChildren(createFragmentFromHtml(`
        <div class="panel-row"><span class="panel-label">当前时刻</span><span class="panel-value" data-world-metric="current"></span></div>
        <div class="panel-row"><span class="panel-label">时辰</span><span class="panel-value" data-world-metric="phase"></span></div>
        <div class="panel-row"><span class="panel-label">光照</span><span class="panel-value" data-world-metric="light"></span></div>
        <div class="panel-row"><span class="panel-label">黑暗层数</span><span class="panel-value" data-world-metric="darkness"></span></div>
        <div class="panel-row"><span class="panel-label">时间控制</span><span class="panel-value" data-world-metric="control"></span></div>
        <div class="panel-row"><span class="panel-label">总 Tick</span><span class="panel-value" data-world-metric="total-ticks"></span></div>
        <div class="panel-row"><span class="panel-label">本地 Tick</span><span class="panel-value" data-world-metric="local-ticks"></span></div>
        <div class="panel-row"><span class="panel-label">时间偏移</span><span class="panel-value" data-world-metric="offset"></span></div>
        <div class="panel-row"><span class="panel-label">基础倍率</span><span class="panel-value" data-world-metric="scale"></span></div>
        <div class="panel-row"><span class="panel-label">地图 Tick</span><span class="panel-value" data-world-metric="map-tick"></span></div>
        <div class="panel-row"><span class="panel-label">时间推进</span><span class="panel-value" data-world-metric="advance"></span></div>
        <div class="panel-row"><span class="panel-label">时钟速度</span><span class="panel-value" data-world-metric="clock-speed"></span></div>
      `));
    }
    this.bindTimeControlEvents();
  }  
  /**
 * bindTimeControlEvents：执行核心业务逻辑。
 * @returns void。
 */


  private bindTimeControlEvents(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.timeControlBound) {
      return;
    }
    this.timeControlBound = true;
    const speedInput = this.timeControlEl.querySelector<HTMLInputElement>('[data-world-speed-input]');
    const offsetInput = this.timeControlEl.querySelector<HTMLInputElement>('[data-world-offset-input]');
    speedInput?.addEventListener('input', () => {
      this.speedDraft = speedInput.value;
    });
    offsetInput?.addEventListener('input', () => {
      this.offsetDraft = offsetInput.value;
    });
    this.timeControlEl.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const speedButton = target.closest<HTMLButtonElement>('.world-speed-btn');
      if (speedButton) {
        const speed = parseFloat(speedButton.dataset.speed ?? '1');
        this.speedDraft = String(speed);
        this.setWorldSpeed(speed).catch(() => {});
        return;
      }
      if (target.closest('[data-world-speed-apply]')) {
        const speed = parseFloat(speedInput?.value ?? '1');
        if (Number.isFinite(speed)) {
          this.setWorldSpeed(speed).catch(() => {});
        }
        return;
      }
      if (target.closest('[data-world-time-apply]')) {
        const offset = parseInt(offsetInput?.value ?? '0', 10);
        if (Number.isFinite(offset)) {
          this.updateTime({ offsetTicks: offset }).catch(() => {});
        }
        return;
      }
      if (target.closest('[data-world-reload-tick-config]')) {
        this.reloadTickConfig().catch(() => {});
      }
    });
  }  
  /**
 * syncTimeControlMetric：执行核心业务逻辑。
 * @param key string 参数说明。
 * @param value string 参数说明。
 * @returns void。
 */


  private syncTimeControlMetric(key: string, value: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const element = this.timeControlEl.querySelector<HTMLElement>(`[data-world-metric="${key}"]`);
    if (element) {
      element.textContent = value;
    }
  }

  /** setWorldSpeed：处理set世界速度。 */
  private async setWorldSpeed(speed: number): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.currentMapId) return;
    const clamped = Math.max(0, Math.min(100, speed));
    try {
      await this.request<{      
      /**
 * ok：GmWorldViewer 内部字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/maps/${this.currentMapId}/tick`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: clamped } satisfies GmUpdateMapTickReq),
      });
      this.speedDraft = null;
      this.setStatus(`时间速度已设为 ${clamped === 0 ? '暂停' : `${clamped}x`}`);
      await this.loadRuntime();
      this.renderAll();
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : '设置时间速度失败', true);
    }
  }

  /** updateTime：更新时间。 */
  private async updateTime(req: GmUpdateMapTimeReq): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.currentMapId) return;
    try {
      await this.request<{      
      /**
 * ok：GmWorldViewer 内部字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/maps/${this.currentMapId}/time`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (req.offsetTicks !== undefined) {
        this.offsetDraft = null;
      }
      this.setStatus('时间配置已更新');
      await this.loadRuntime();
      this.renderAll();
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : '更新时间配置失败', true);
    }
  }

  /** reloadTickConfig：重载Tick配置。 */
  private async reloadTickConfig(): Promise<void> {
    try {
      await this.request<{      
      /**
 * ok：GmWorldViewer 内部字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/tick-config/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      this.setStatus('服务端 Tick 配置已重新加载');
      await this.loadRuntime();
      this.renderAll();
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : '重新加载服务端配置失败', true);
    }
  }

  /** clearObservation：清理Observation。 */
  private clearObservation(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.observationRegistered) {
      return;
    }
    this.observationRegistered = false;
    void this.request<{    
    /**
 * ok：GmWorldViewer 内部字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/world-observers/${encodeURIComponent(this.viewerId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }  
  /**
 * renderInfo：执行核心业务逻辑。
 * @returns void。
 */


  // ===== 信息面板 =====

  private renderInfo(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.runtimeData) {
      this.infoEl.replaceChildren(createFragmentFromHtml('<div class="empty-hint">未选择地图</div>'));
      return;
    }

    const d = this.runtimeData;
    const playerCount = d.entities.filter((e) => e.kind === 'player').length;
    const monsterCount = d.entities.filter((e) => e.kind === 'monster').length;
    const npcCount = d.entities.filter((e) => e.kind === 'npc').length;
    this.ensureInfoShell();
    this.syncInfoSection(
      'map',
      `
        <div class="panel-section-title">地图信息</div>
        <div class="panel-row"><span class="panel-label">名称</span><span class="panel-value">${escapeHtml(d.mapName)}</span></div>
        <div class="panel-row"><span class="panel-label">尺寸</span><span class="panel-value">${d.width} × ${d.height}</span></div>
        <div class="panel-row"><span class="panel-label">视口玩家</span><span class="panel-value">${playerCount}</span></div>
        <div class="panel-row"><span class="panel-label">视口怪物</span><span class="panel-value">${monsterCount}</span></div>
        <div class="panel-row"><span class="panel-label">视口 NPC</span><span class="panel-value">${npcCount}</span></div>
      `,
    );

    if (this.selectedCell) {
      const key = `${this.selectedCell.x},${this.selectedCell.y}`;
      const tile = this.currentTileCache.get(key);
      this.syncInfoSection(
        'cell',
        `
          <div class="panel-section-title">选中格 (${this.selectedCell.x}, ${this.selectedCell.y})</div>
          ${tile
            ? `
              <div class="panel-row"><span class="panel-label">地块</span><span class="panel-value">${TILE_TYPE_LABELS[tile.type] ?? tile.type}</span></div>
              <div class="panel-row"><span class="panel-label">可行走</span><span class="panel-value">${tile.walkable ? '是' : '否'}</span></div>
              <div class="panel-row"><span class="panel-label">灵气</span><span class="panel-value">${tile.aura ?? 0}</span></div>
            `
            : '<div class="empty-hint">无地块数据</div>'}
        `,
      );
    } else {
      this.syncInfoSection('cell', '');
    }

    if (this.selectedEntity) {
      const entity = this.selectedEntity;
      let html = `
        <div class="panel-section-title">${ENTITY_KIND_LABELS[entity.kind] ?? entity.kind}：${escapeHtml(entity.name)}</div>
        <div class="panel-row"><span class="panel-label">坐标</span><span class="panel-value">(${entity.x}, ${entity.y})</span></div>
        <div class="panel-row"><span class="panel-label">字符</span><span class="panel-value">${escapeHtml(entity.char)}</span></div>
      `;
      if (entity.hp !== undefined && entity.maxHp) {
        html += `<div class="panel-row"><span class="panel-label">HP</span><span class="panel-value">${entity.hp} / ${entity.maxHp}</span></div>`;
      }
      if (entity.kind === 'player') {
        html += `
          <div class="panel-row"><span class="panel-label">在线</span><span class="panel-value">${entity.online ? '是' : '否'}</span></div>
          <div class="panel-row"><span class="panel-label">自动战斗</span><span class="panel-value">${entity.autoBattle ? '是' : '否'}</span></div>
          <div class="panel-row"><span class="panel-label">机器人</span><span class="panel-value">${entity.isBot ? '是' : '否'}</span></div>
        `;
        if (entity.dead) {
          html += `<div class="panel-row"><span class="panel-label">状态</span><span class="panel-value" style="color:#f44336">死亡</span></div>`;
        }
      }
      if (entity.kind === 'monster') {
        html += `<div class="panel-row"><span class="panel-label">存活</span><span class="panel-value">${entity.alive ? '是' : '否'}</span></div>`;
        if (entity.targetPlayerId) {
          html += `<div class="panel-row"><span class="panel-label">仇恨目标</span><span class="panel-value">${escapeHtml(entity.targetPlayerId)}</span></div>`;
        }
        if (entity.respawnLeft !== undefined && entity.respawnLeft > 0) {
          html += `<div class="panel-row"><span class="panel-label">重生倒计时</span><span class="panel-value">${entity.respawnLeft}s</span></div>`;
        }
      }
      this.syncInfoSection('entity', html);
    } else {
      this.syncInfoSection('entity', '');
    }
  }  
  /**
 * ensureInfoShell：执行核心业务逻辑。
 * @returns void。
 */


  private ensureInfoShell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.infoEl.querySelector('[data-world-info-shell]')) {
      return;
    }
    this.infoEl.replaceChildren(createFragmentFromHtml(`
      <div data-world-info-shell>
        <div class="panel-section" data-world-info-section="map"></div>
        <div class="panel-section" data-world-info-section="cell"></div>
        <div class="panel-section" data-world-info-section="entity"></div>
      </div>
    `));
  }  
  /**
 * syncInfoSection：执行核心业务逻辑。
 * @param section 'map' | 'cell' | 'entity' 参数说明。
 * @param html string 参数说明。
 * @returns void。
 */


  private syncInfoSection(section: 'map' | 'cell' | 'entity', html: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const root = this.infoEl.querySelector<HTMLElement>(`[data-world-info-section="${section}"]`);
    if (!root) {
      return;
    }
    if (!html) {
      root.replaceChildren();
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.replaceChildren(createFragmentFromHtml(html));
  }
}
