/**
 * GM 世界管理查看器 —— 复用 TextRenderer + Camera 渲染运行时地图
 * 上帝视角，无迷雾，支持拖动、缩放、选中查看
 * 当前作为 GM 独立运行时查看工具继续保留，不并入玩家主线 main.ts，也不作为主线硬切的前台阻塞项。
 */
import {
  GM_WORLD_DEFAULT_ZOOM,
  GM_WORLD_POLL_INTERVAL_MS,
  type GmCreateWorldInstanceReq,
  type GmCreateWorldInstanceRes,
  type GmRuntimeEntity,
  type GmTransferPlayerToInstanceReq,
  type GmUpdateMapTickReq,
  type GmUpdateMapTimeReq,
  type GmWorldInstanceListRes,
  type GmWorldInstanceRuntimeRes,
  type GmWorldInstanceSummary,
  type Tile,
  type TileType,
  ENTITY_KIND_LABELS,
  TILE_TYPE_LABELS,
} from '@mud/shared';
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

function isSectTemplateId(templateId: string | null | undefined): boolean {
  return typeof templateId === 'string' && templateId.trim().startsWith('sect_domain:');
}

function isSectRuntimeInstance(instance: Pick<GmWorldInstanceSummary, 'instanceId' | 'templateId'>): boolean {
  return isSectTemplateId(instance.templateId) && instance.instanceId.startsWith('sect:');
}

function buildInstanceLineBadge(instance: GmWorldInstanceSummary): string {
  if (isSectRuntimeInstance(instance)) {
    return '宗门';
  }
  return instance.defaultEntry ? '默认线' : '手动线';
}

function buildInstanceCapabilityText(instance: GmWorldInstanceSummary): string {
  if (isSectRuntimeInstance(instance)) {
    return `宗门 · ${instance.supportsPvp ? 'PVP' : '禁PVP'} · ${instance.canDamageTile ? '可打地块' : '禁地块攻击'}`;
  }
  return `${instance.templateName} · ${instance.linePreset === 'peaceful' ? '和平' : '真实'} · ${instance.supportsPvp ? 'PVP' : '禁PVP'} · ${instance.canDamageTile ? '可打地块' : '禁地块攻击'}`;
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
  /** mapListEl：实例列表元素。 */
  private mapListEl: HTMLElement;
  /** timeControlEl：时间Control元素。 */
  private timeControlEl: HTMLElement;
  /** infoEl：信息元素。 */
  private infoEl: HTMLElement;

  /** renderer：renderer。 */
  private renderer: TextRenderer;
  /** camera：camera。 */
  private camera: Camera;

  /** currentInstanceId：当前实例 ID。 */
  private currentInstanceId: string | null = null;
  /** instances：实例列表。 */
  private instances: GmWorldInstanceSummary[] = [];
  /** runtimeData：运行时数据。 */
  private runtimeData: GmWorldInstanceRuntimeRes | null = null;
  /**
 * viewX：视图X相关字段。
 */


  // 视口中心（世界坐标）
  private viewX = 0;
  /** viewY：视图Y。 */
  private viewY = 0;  
  /**
 * selectedCell：selectedCell相关字段。
 */


  // 选中状态
  private selectedCell: {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
 */
 y: number } | null = null;
  /** selectedEntity：selected实体。 */
  private selectedEntity: GmRuntimeEntity | null = null;  
  /**
 * isDragging：启用开关或状态标识。
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
  /** createTemplateIdDraft：创建实例模板草稿。 */
  private createTemplateIdDraft: string | null = null;
  /** createNameDraft：新实例名称草稿。 */
  private createNameDraft: string | null = null;
  /** transferPlayerIdDraft：迁移玩家 ID 草稿。 */
  private transferPlayerIdDraft: string | null = null;
  /** transferXDraft：迁移目标 X 草稿。 */
  private transferXDraft: string | null = null;
  /** transferYDraft：迁移目标 Y 草稿。 */
  private transferYDraft: string | null = null;
  /** infoTab：右侧信息面板当前页签。 */
  private infoTab: 'info' | 'manage' = 'info';
  /** viewerId：viewer ID。 */
  private readonly viewerId = createViewerId();
  /** observationRegistered：observation Registered。 */
  private observationRegistered = false;
  /** timeControlBound：时间控制事件是否已绑定。 */
  private timeControlBound = false;
  /** infoControlBound：实例信息事件是否已绑定。 */
  private infoControlBound = false;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param request RequestFn 请求参数。
 * @param setStatus StatusFn 参数说明。
 * @returns 无返回值，完成实例初始化。
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
    void _mapIds;
    await this.refreshInstanceList();
    if (!this.currentInstanceId || this.runtimeData) {
      return;
    }
    await this.loadRuntime();
    const runtime = this.runtimeData as GmWorldInstanceRuntimeRes | null;
    if (runtime) {
      this.viewX = Math.floor(runtime.width / 2);
      this.viewY = Math.floor(runtime.height / 2);
      this.snapCamera();
      await this.loadRuntime();
    }
    this.renderAll();
  }

  /** selectInstance：兼容旧调用，当前实际选择实例。 */
  async selectInstance(instanceId: string): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const previousRuntime = this.runtimeData;
    const previousViewX = this.viewX;
    const previousViewY = this.viewY;
    const previousSelectedCell = this.selectedCell;
    const previousSelectedEntityId = this.selectedEntity?.id ?? null;
    const nextInstanceSummary = this.instances.find((instance) => instance.instanceId === instanceId) ?? null;
    const preserveViewState = previousRuntime?.templateId === nextInstanceSummary?.templateId;
    const previousPreferredTemplateId = this.getPreferredCreateTemplateId();
    this.currentInstanceId = instanceId;
    if (this.createTemplateIdDraft && this.createTemplateIdDraft === previousPreferredTemplateId) {
      this.createTemplateIdDraft = null;
    }
    if (!preserveViewState) {
      this.selectedCell = null;
    }
    this.selectedEntity = null;
    this.renderer.resetScene();
    this.renderInstanceList();
    await this.loadRuntime();
    if (this.runtimeData) {
      if (preserveViewState) {
        this.viewX = previousViewX;
        this.viewY = previousViewY;
        const didClamp = this.clampViewToRuntimeBounds();
        this.snapCamera();
        if (didClamp) {
          await this.loadRuntime();
        }
        this.selectedCell = this.normalizeSelectedCell(previousSelectedCell);
        this.selectedEntity = this.resolveSelectedEntity(previousSelectedEntityId, this.selectedCell);
      } else {
        this.selectedCell = null;
        this.viewX = Math.floor(this.runtimeData.width / 2);
        this.viewY = Math.floor(this.runtimeData.height / 2);
        this.snapCamera();
        await this.loadRuntime();
      }
    }
    this.renderAll();
  }

  /** startPolling：启动Polling。 */
  startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => {
      this.refreshInstanceList(false)
        .then(() => (this.currentInstanceId ? this.loadRuntime() : undefined))
        .then(() => this.renderAll())
        .catch(() => {});
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
 * startRaf：执行开始Raf相关逻辑。
 * @returns 无返回值，直接更新startRaf相关状态。
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
 * loadRuntime：读取运行态并返回结果。
 * @returns 返回 Promise，完成后得到运行态。
 */


  // ===== 数据加载 =====

  private getCurrentInstanceSummary(): GmWorldInstanceSummary | null {
    if (!this.currentInstanceId) {
      return null;
    }
    return this.instances.find((instance) => instance.instanceId === this.currentInstanceId) ?? null;
  }

  private getCurrentTemplateMapId(): string | null {
    return this.runtimeData?.mapId
      ?? this.runtimeData?.templateId
      ?? this.getCurrentInstanceSummary()?.templateId
      ?? null;
  }

  private getTemplateOptions(): Array<{ templateId: string; templateName: string }> {
    const seen = new Set<string>();
    const templates: Array<{ templateId: string; templateName: string }> = [];
    for (const instance of this.instances) {
      if (isSectTemplateId(instance.templateId)) {
        continue;
      }
      if (seen.has(instance.templateId)) {
        continue;
      }
      seen.add(instance.templateId);
      templates.push({
        templateId: instance.templateId,
        templateName: instance.templateName,
      });
    }
    return templates;
  }

  private getPreferredCreateTemplateId(): string | null {
    return this.runtimeData?.templateId
      ?? this.getCurrentInstanceSummary()?.templateId
      ?? this.getTemplateOptions()[0]?.templateId
      ?? null;
  }

  private async refreshInstanceList(render = true): Promise<void> {
    try {
      const previousInstanceId = this.currentInstanceId;
      const previousPreferredTemplateId = this.getPreferredCreateTemplateId();
      const res = await this.request<GmWorldInstanceListRes>(`${GM_API_BASE_PATH}/world/instances`);
      this.instances = res.instances;
      if (this.currentInstanceId && !this.instances.some((instance) => instance.instanceId === this.currentInstanceId)) {
        this.currentInstanceId = null;
        this.runtimeData = null;
        this.selectedCell = null;
        this.selectedEntity = null;
      }
      if (!this.currentInstanceId && this.instances.length > 0) {
        this.currentInstanceId = this.instances[0]!.instanceId;
      }
      if (this.createTemplateIdDraft && this.createTemplateIdDraft === previousPreferredTemplateId) {
        const nextPreferredTemplateId = this.getPreferredCreateTemplateId();
        if (nextPreferredTemplateId !== this.createTemplateIdDraft) {
          this.createTemplateIdDraft = null;
        }
      }
      if (render || previousInstanceId !== this.currentInstanceId || !this.currentInstanceId) {
        this.renderInstanceList();
        if (!this.currentInstanceId) {
          this.renderTimeControl();
          this.renderInfo();
        }
      }
    } catch (err) {
      this.instances = [];
      if (render) {
        this.renderInstanceList();
        this.renderTimeControl();
        this.renderInfo();
      }
      this.setStatus(err instanceof Error ? err.message : '加载世界实例列表失败', true);
    }
  }

  private async loadRuntime(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.currentInstanceId) return;
    const { startX, startY, w, h } = this.getViewport();
    try {
      const params = new URLSearchParams({
        x: String(startX),
        y: String(startY),
        w: String(w),
        h: String(h),
        viewerId: this.viewerId,
      });
      this.runtimeData = await this.request<GmWorldInstanceRuntimeRes>(
        `${GM_API_BASE_PATH}/world/instances/${encodeURIComponent(this.currentInstanceId)}/runtime?${params.toString()}`,
      );
      this.observationRegistered = true;
      this.renderInstanceList();
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
 * startX：startX相关字段。
 */
 startX: number;  
 /**
 * startY：startY相关字段。
 */
 startY: number;  
 /**
 * w：w相关字段。
 */
 w: number;  
 /**
 * h：h相关字段。
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

  private clampViewToRuntimeBounds(): boolean {
    if (!this.runtimeData) {
      return false;
    }
    const nextViewX = Math.max(0, Math.min(this.runtimeData.width - 1, this.viewX));
    const nextViewY = Math.max(0, Math.min(this.runtimeData.height - 1, this.viewY));
    const changed = nextViewX !== this.viewX || nextViewY !== this.viewY;
    this.viewX = nextViewX;
    this.viewY = nextViewY;
    return changed;
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
 * renderAll：执行All相关逻辑。
 * @returns 无返回值，直接更新All相关状态。
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
      performance.now(),
      1,
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
 * bindEvents：执行bind事件相关逻辑。
 * @returns 无返回值，直接更新bind事件相关状态。
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
 * handlePointerDown：handlePointerDown相关字段。
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
 * handlePointerMove：handlePointerMove相关字段。
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
 * handlePointerUp：handlePointerUp相关字段。
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
 * handleWheel：handleWheel相关字段。
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
 * handleResize：数量或计量字段。
 */


  private handleResize = (): void => {
    this.resizeCanvas();
    this.renderCanvas();
  };

  /** screenToWorld：处理屏幕To世界。 */
  private screenToWorld(sx: number, sy: number): {  
  /**
 * x：x相关字段。
 */
 x: number;  
 /**
 * y：y相关字段。
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

  private normalizeSelectedCell(
    cell: { x: number; y: number } | null,
  ): { x: number; y: number } | null {
    if (!cell || !this.runtimeData) {
      return null;
    }
    if (cell.x < 0 || cell.y < 0 || cell.x >= this.runtimeData.width || cell.y >= this.runtimeData.height) {
      return null;
    }
    return cell;
  }

  private resolveSelectedEntity(entityId: string | null, cell: { x: number; y: number } | null): GmRuntimeEntity | null {
    if (!this.runtimeData) {
      return null;
    }
    if (entityId) {
      const matched = this.runtimeData.entities.find((entity) => entity.id === entityId);
      if (matched) {
        return matched;
      }
    }
    if (!cell) {
      return null;
    }
    return this.findEntityAt(cell.x, cell.y);
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
 * renderInstanceList：读取实例列表并返回结果。
 * @returns 无返回值，直接更新实例列表相关状态。
 */


  // ===== 实例列表 =====

  private renderInstanceList(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const fragment = document.createDocumentFragment();
    const existingButtons = new Map<string, HTMLButtonElement>();
    this.mapListEl.querySelectorAll<HTMLButtonElement>('.world-map-btn').forEach((button) => {
      const instanceId = button.dataset.instanceId;
      if (instanceId) {
        existingButtons.set(instanceId, button);
      }
    });

    if (this.instances.length === 0) {
      fragment.append(createFragmentFromHtml('<div class="empty-hint">暂无实例</div>'));
      this.mapListEl.replaceChildren(fragment);
      return;
    }

    const grouped = new Map<string, { title: string; instances: GmWorldInstanceSummary[] }>();
    for (const instance of this.instances) {
      const sectInstance = isSectRuntimeInstance(instance);
      const groupKey = sectInstance
        ? `sect|||${instance.templateName || instance.displayName || '宗门'}`
        : `${instance.templateId}|||${instance.templateName}`;
      const groupTitle = sectInstance
        ? (instance.templateName || instance.displayName || '宗门')
        : `${instance.templateName || instance.templateId} (${instance.templateId})`;
      const group = grouped.get(groupKey);
      if (group) {
        group.instances.push(instance);
      } else {
        grouped.set(groupKey, { title: groupTitle, instances: [instance] });
      }
    }

    for (const group of grouped.values()) {
      const groupEl = document.createElement('div');
      groupEl.className = 'world-instance-group';
      groupEl.style.marginBottom = '8px';

      const headerEl = document.createElement('div');
      headerEl.style.fontSize = '12px';
      headerEl.style.fontWeight = '600';
      headerEl.style.color = '#666';
      headerEl.style.margin = '8px 0 4px';
      headerEl.textContent = group.title;
      groupEl.append(headerEl);

      for (const instance of group.instances) {
        const badgeLabel = buildInstanceLineBadge(instance);
        const badgeIsDefault = instance.defaultEntry && !isSectRuntimeInstance(instance);
        const button = existingButtons.get(instance.instanceId) ?? document.createElement('button');
        if (!existingButtons.has(instance.instanceId)) {
          button.addEventListener('click', () => {
            const instanceId = button.dataset.instanceId;
            if (instanceId && instanceId !== this.currentInstanceId) {
              this.selectInstance(instanceId).catch(() => {});
            }
          });
        }
        button.className = `world-map-btn ${instance.instanceId === this.currentInstanceId ? 'active' : ''}`;
        button.dataset.instanceId = instance.instanceId;
        button.style.display = 'block';
        button.style.width = '100%';
        button.style.textAlign = 'left';
        button.style.marginBottom = '4px';
        button.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
            <span style="display:flex;align-items:center;gap:6px;min-width:0;">
              <span>${escapeHtml(instance.displayName)}</span>
              <span style="font-size:10px;line-height:1;padding:2px 6px;border-radius:999px;background:${badgeIsDefault ? 'rgba(76, 175, 80, 0.14)' : 'rgba(33, 150, 243, 0.14)'};color:${badgeIsDefault ? '#2e7d32' : '#1565c0'};white-space:nowrap;">${escapeHtml(badgeLabel)}</span>
            </span>
            <span style="font-size:11px;color:#888;">${instance.playerCount}人</span>
          </div>
          <div style="font-size:11px;color:#888;line-height:1.4;">
            <div>${escapeHtml(instance.instanceId)}</div>
            <div>${escapeHtml(buildInstanceCapabilityText(instance))}</div>
          </div>
        `;
        groupEl.append(button);
      }

      fragment.append(groupEl);
    }

    this.mapListEl.replaceChildren(fragment);
  }  
  /**
 * captureTimeControlDraftState：执行capture时间ControlDraft状态相关逻辑。
 * @returns 返回capture时间ControlDraft状态数值。
    focusedField: 'speed' | 'offset' | null;
    selectionStart: number | null;
    selectionEnd: number | null;
  }。
 */


  // ===== 时间操控 =====

  private captureTimeControlDraftState(): {  
  /**
 * focusedField：focusedField相关字段。
 */

    focusedField: 'speed' | 'offset' | null;    
    /**
 * selectionStart：selectionStart相关字段。
 */

    selectionStart: number | null;    
    /**
 * selectionEnd：selectionEnd相关字段。
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
 * restoreTimeControlFocus：执行restore时间ControlFocu相关逻辑。
 * @param state {
    focusedField: 'speed' | 'offset' | null;
    selectionStart: number | null;
    selectionEnd: number | null;
  } 状态对象。
 * @returns 无返回值，直接更新restore时间ControlFocu相关状态。
 */


  private restoreTimeControlFocus(state: {  
  /**
 * focusedField：focusedField相关字段。
 */

    focusedField: 'speed' | 'offset' | null;    
    /**
 * selectionStart：selectionStart相关字段。
 */

    selectionStart: number | null;    
    /**
 * selectionEnd：selectionEnd相关字段。
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
      this.timeControlEl.replaceChildren(createFragmentFromHtml('<div class="empty-hint">未选择实例</div>'));
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
 * ensureTimeControlShell：执行ensure时间ControlShell相关逻辑。
 * @param speeds number[] 参数说明。
 * @returns 无返回值，直接更新ensure时间ControlShell相关状态。
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
 * bindTimeControlEvents：执行bind时间Control事件相关逻辑。
 * @returns 无返回值，直接更新bind时间Control事件相关状态。
 */


  private bindTimeControlEvents(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.timeControlBound) {
      return;
    }
    this.timeControlBound = true;
    this.timeControlEl.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (target.matches('[data-world-speed-input]')) {
        this.speedDraft = target.value;
        return;
      }
      if (target.matches('[data-world-offset-input]')) {
        this.offsetDraft = target.value;
      }
    });
    this.timeControlEl.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const speedInput = this.timeControlEl.querySelector<HTMLInputElement>('[data-world-speed-input]');
      const offsetInput = this.timeControlEl.querySelector<HTMLInputElement>('[data-world-offset-input]');
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
 * syncTimeControlMetric：处理时间ControlMetric并更新相关状态。
 * @param key string 参数说明。
 * @param value string 参数说明。
 * @returns 无返回值，直接更新时间ControlMetric相关状态。
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

    const mapId = this.getCurrentTemplateMapId();
    if (!mapId) return;
    const clamped = Math.max(0, Math.min(100, speed));
    try {
      await this.request<{      
      /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/maps/${encodeURIComponent(mapId)}/tick`, {
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

    const mapId = this.getCurrentTemplateMapId();
    if (!mapId) return;
    try {
      await this.request<{      
      /**
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/maps/${encodeURIComponent(mapId)}/time`, {
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
 * ok：ok相关字段。
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
 * ok：ok相关字段。
 */
 ok: true }>(`${GM_API_BASE_PATH}/world-observers/${encodeURIComponent(this.viewerId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }  
  /**
 * renderInfo：执行Info相关逻辑。
 * @returns 无返回值，直接更新Info相关状态。
 */


  // ===== 信息面板 =====

  private captureInfoDraftState(): {
    focusedField: 'create-template' | 'create-name' | 'transfer-player-id' | 'transfer-x' | 'transfer-y' | null;
    selectionStart: number | null;
    selectionEnd: number | null;
  } {
    const createTemplateSelect = this.infoEl.querySelector<HTMLSelectElement>('[data-instance-create-template]');
    const createNameInput = this.infoEl.querySelector<HTMLInputElement>('[data-instance-create-name]');
    const transferPlayerInput = this.infoEl.querySelector<HTMLInputElement>('[data-instance-transfer-player-id]');
    const transferXInput = this.infoEl.querySelector<HTMLInputElement>('[data-instance-transfer-x]');
    const transferYInput = this.infoEl.querySelector<HTMLInputElement>('[data-instance-transfer-y]');
    const active = document.activeElement;
    const focusedElement = active instanceof HTMLInputElement || active instanceof HTMLSelectElement ? active : null;
    const focusedField = focusedElement === createTemplateSelect
      ? 'create-template'
      : focusedElement === createNameInput
      ? 'create-name'
      : focusedElement === transferPlayerInput
        ? 'transfer-player-id'
        : focusedElement === transferXInput
          ? 'transfer-x'
          : focusedElement === transferYInput
            ? 'transfer-y'
            : null;
    if (createTemplateSelect) {
      this.createTemplateIdDraft = focusedField === 'create-template'
        ? createTemplateSelect.value
        : this.createTemplateIdDraft;
    }
    if (createNameInput) {
      this.createNameDraft = focusedField === 'create-name' ? createNameInput.value : this.createNameDraft;
    }
    if (transferPlayerInput) {
      this.transferPlayerIdDraft = focusedField === 'transfer-player-id' ? transferPlayerInput.value : this.transferPlayerIdDraft;
    }
    if (transferXInput) {
      this.transferXDraft = focusedField === 'transfer-x' ? transferXInput.value : this.transferXDraft;
    }
    if (transferYInput) {
      this.transferYDraft = focusedField === 'transfer-y' ? transferYInput.value : this.transferYDraft;
    }
    return {
      focusedField,
      selectionStart: focusedElement instanceof HTMLInputElement ? focusedElement.selectionStart : null,
      selectionEnd: focusedElement instanceof HTMLInputElement ? focusedElement.selectionEnd : null,
    };
  }

  private restoreInfoFocus(state: {
    focusedField: 'create-template' | 'create-name' | 'transfer-player-id' | 'transfer-x' | 'transfer-y' | null;
    selectionStart: number | null;
    selectionEnd: number | null;
  }): void {
    if (!state.focusedField) {
      return;
    }
    const selector = state.focusedField === 'create-template'
      ? '[data-instance-create-template]'
      : state.focusedField === 'create-name'
      ? '[data-instance-create-name]'
      : state.focusedField === 'transfer-player-id'
        ? '[data-instance-transfer-player-id]'
        : state.focusedField === 'transfer-x'
          ? '[data-instance-transfer-x]'
          : '[data-instance-transfer-y]';
    const control = this.infoEl.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
    if (!control) {
      return;
    }
    control.focus();
    if (control instanceof HTMLInputElement && (state.selectionStart !== null || state.selectionEnd !== null)) {
      control.setSelectionRange(state.selectionStart ?? control.value.length, state.selectionEnd ?? control.value.length);
    }
  }

  private renderInfo(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.runtimeData) {
      this.infoEl.replaceChildren(createFragmentFromHtml('<div class="empty-hint">未选择实例</div>'));
      return;
    }

    const d = this.runtimeData;
    const previousInfoState = this.captureInfoDraftState();
    const playerCount = d.entities.filter((e) => e.kind === 'player').length;
    const monsterCount = d.entities.filter((e) => e.kind === 'monster').length;
    const npcCount = d.entities.filter((e) => e.kind === 'npc').length;
    const sectInstance = isSectTemplateId(d.templateId) && d.instanceId.startsWith('sect:');
    const lineText = sectInstance
      ? '宗门实例'
      : `${d.linePreset === 'peaceful' ? '和平' : '真实'} · 第 ${d.lineIndex} 线${d.defaultEntry ? ' · 默认入口' : ''}`;
    const capabilityText = sectInstance
      ? `宗门 / ${d.supportsPvp ? 'PVP' : '禁PVP'} / ${d.canDamageTile ? '可打地块' : '禁地块攻击'}`
      : `${d.linePreset === 'peaceful' ? '和平' : '真实'} / ${d.supportsPvp ? 'PVP' : '禁PVP'} / ${d.canDamageTile ? '可打地块' : '禁地块攻击'}`;
    const originText = sectInstance
      ? '宗门运行时'
      : d.instanceOrigin === 'bootstrap' ? '系统引导' : 'GM 手动';
    this.ensureInfoShell();
    this.syncInfoSection(
      'instance',
      `
        <div class="panel-section-title">实例信息</div>
        <div class="panel-row"><span class="panel-label">实例名</span><span class="panel-value">${escapeHtml(d.instanceName)}</span></div>
        <div class="panel-row"><span class="panel-label">实例 ID</span><span class="panel-value">${escapeHtml(d.instanceId)}</span></div>
        <div class="panel-row"><span class="panel-label">模板地图</span><span class="panel-value">${escapeHtml(d.templateName)} (${escapeHtml(d.templateId)})</span></div>
        <div class="panel-row"><span class="panel-label">线路</span><span class="panel-value">${escapeHtml(lineText)}</span></div>
        <div class="panel-row"><span class="panel-label">能力</span><span class="panel-value">${escapeHtml(capabilityText)}</span></div>
        <div class="panel-row"><span class="panel-label">来源</span><span class="panel-value">${escapeHtml(originText)}</span></div>
        <div class="panel-row"><span class="panel-label">玩家数</span><span class="panel-value">${d.playerCount}</span></div>
        <div class="panel-row"><span class="panel-label">世界版本</span><span class="panel-value">${d.worldRevision}</span></div>
        <div class="panel-row"><span class="panel-label">地图尺寸</span><span class="panel-value">${d.width} × ${d.height}</span></div>
        <div class="panel-row"><span class="panel-label">视口玩家</span><span class="panel-value">${playerCount}</span></div>
        <div class="panel-row"><span class="panel-label">视口怪物</span><span class="panel-value">${monsterCount}</span></div>
        <div class="panel-row"><span class="panel-label">视口场景人物</span><span class="panel-value">${npcCount}</span></div>
      `,
    );
    this.syncInstanceActionValues();

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
              ${tile.resources && tile.resources.length > 0
                ? `<div class="panel-row"><span class="panel-label">气机</span><span class="panel-value">${tile.resources.map((entry) => `${escapeHtml(entry.label)} ${entry.effectiveValue ?? entry.value}`).join('、')}</span></div>`
                : ''}
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
    this.restoreInfoFocus(previousInfoState);
  }  
  /**
 * ensureInfoShell：执行ensureInfoShell相关逻辑。
 * @returns 无返回值，直接更新ensureInfoShell相关状态。
 */


  private ensureInfoShell(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.infoEl.querySelector('[data-world-info-shell]')) {
      this.mountTimeControlIntoInfoShell();
      this.syncInfoTabState();
      return;
    }
    this.infoEl.replaceChildren(createFragmentFromHtml(`
      <div data-world-info-shell>
        <div class="workspace-tabs" style="margin-bottom:12px;">
          <button class="workspace-tab" type="button" data-world-info-tab="info">信息</button>
          <button class="workspace-tab" type="button" data-world-info-tab="manage">世界操作</button>
        </div>
        <div data-world-info-panel="info">
          <div class="panel-section" data-world-info-section="instance"></div>
          <div class="panel-section" data-world-info-section="cell"></div>
          <div class="panel-section" data-world-info-section="entity"></div>
        </div>
        <div data-world-info-panel="manage" hidden>
          <div class="panel-section" data-world-info-time-host></div>
          <div class="panel-section">
            <div class="panel-section-title">实例操作</div>
            <div class="gm-btn-row" style="margin-bottom:6px;">
              <select class="gm-inline-input" data-instance-create-template style="flex:1;min-width:0;"></select>
            </div>
            <div class="gm-btn-row" style="margin-bottom:6px;">
              <input
                type="text"
                class="gm-inline-input"
                data-instance-create-name
                placeholder="新线路实例名（可选）"
                style="flex:1;min-width:0;"
              />
            </div>
            <div class="gm-btn-row" style="margin-bottom:8px;">
              <button class="small-btn" data-instance-create-line="peaceful">新建和平线</button>
              <button class="small-btn" data-instance-create-line="real">新建真实线</button>
            </div>
            <div class="gm-btn-row" style="margin-bottom:6px;">
              <input
                type="text"
                class="gm-inline-input"
                data-instance-transfer-player-id
                placeholder="玩家 ID"
                style="flex:1;min-width:0;"
              />
            </div>
            <div class="gm-btn-row" style="margin-bottom:6px;">
              <input type="number" class="gm-inline-input" data-instance-transfer-x placeholder="X" style="width:72px;" />
              <input type="number" class="gm-inline-input" data-instance-transfer-y placeholder="Y" style="width:72px;" />
              <button class="small-btn" data-instance-transfer-player>迁移到当前实例</button>
            </div>
          </div>
        </div>
      </div>
    `));
    this.mountTimeControlIntoInfoShell();
    this.syncInfoTabState();
    this.bindInfoEvents();
  }  
  /**
 * syncInfoSection：处理InfoSection并更新相关状态。
 * @param section 'map' | 'cell' | 'entity' 参数说明。
 * @param html string 参数说明。
 * @returns 无返回值，直接更新InfoSection相关状态。
 */


  private syncInfoSection(section: 'instance' | 'cell' | 'entity', html: string): void {
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

  private mountTimeControlIntoInfoShell(): void {
    const host = this.infoEl.querySelector<HTMLElement>('[data-world-info-time-host]');
    if (!host) {
      return;
    }
    this.timeControlEl.style.marginTop = '0';
    if (this.timeControlEl.parentElement !== host) {
      host.replaceChildren(this.timeControlEl);
    }
  }

  private syncInfoTabState(): void {
    this.infoEl.querySelectorAll<HTMLButtonElement>('[data-world-info-tab]').forEach((button) => {
      const tab = button.getAttribute('data-world-info-tab');
      const active = tab === this.infoTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    this.infoEl.querySelectorAll<HTMLElement>('[data-world-info-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-world-info-panel') !== this.infoTab;
    });
  }

  private syncInstanceActionValues(): void {
    const createTemplateSelect = this.infoEl.querySelector<HTMLSelectElement>('[data-instance-create-template]');
    const createNameInput = this.infoEl.querySelector<HTMLInputElement>('[data-instance-create-name]');
    const transferPlayerInput = this.infoEl.querySelector<HTMLInputElement>('[data-instance-transfer-player-id]');
    const transferXInput = this.infoEl.querySelector<HTMLInputElement>('[data-instance-transfer-x]');
    const transferYInput = this.infoEl.querySelector<HTMLInputElement>('[data-instance-transfer-y]');
    const templateOptions = this.getTemplateOptions();
    const templateIdSet = new Set(templateOptions.map((option) => option.templateId));
    if (this.createTemplateIdDraft && !templateIdSet.has(this.createTemplateIdDraft)) {
      this.createTemplateIdDraft = null;
    }
    if (createTemplateSelect) {
      const selectedTemplateId = this.createTemplateIdDraft ?? this.getPreferredCreateTemplateId() ?? '';
      createTemplateSelect.replaceChildren(createFragmentFromHtml(
        templateOptions.length > 0
          ? templateOptions.map((option) => `
              <option value="${escapeHtml(option.templateId)}">${escapeHtml(option.templateName)} (${escapeHtml(option.templateId)})</option>
            `).join('')
          : '<option value="">暂无可用模板</option>',
      ));
      createTemplateSelect.disabled = templateOptions.length === 0;
      if (selectedTemplateId) {
        createTemplateSelect.value = selectedTemplateId;
      }
      if (!createTemplateSelect.value && templateOptions[0]) {
        createTemplateSelect.value = templateOptions[0].templateId;
      }
    }
    if (createNameInput && document.activeElement !== createNameInput) {
      createNameInput.value = this.createNameDraft ?? '';
    }
    if (transferPlayerInput && document.activeElement !== transferPlayerInput) {
      transferPlayerInput.value = this.transferPlayerIdDraft ?? '';
    }
    if (transferXInput && document.activeElement !== transferXInput) {
      transferXInput.value = this.transferXDraft ?? '';
    }
    if (transferYInput && document.activeElement !== transferYInput) {
      transferYInput.value = this.transferYDraft ?? '';
    }
  }

  private bindInfoEvents(): void {
    if (this.infoControlBound) {
      return;
    }
    this.infoControlBound = true;
    this.infoEl.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (target.matches('[data-instance-create-name]')) {
        this.createNameDraft = target.value;
        return;
      }
      if (target.matches('[data-instance-transfer-player-id]')) {
        this.transferPlayerIdDraft = target.value;
        return;
      }
      if (target.matches('[data-instance-transfer-x]')) {
        this.transferXDraft = target.value;
        return;
      }
      if (target.matches('[data-instance-transfer-y]')) {
        this.transferYDraft = target.value;
      }
    });
    this.infoEl.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }
      if (target.matches('[data-instance-create-template]')) {
        this.createTemplateIdDraft = target.value || null;
      }
    });
    this.infoEl.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const tabButton = target.closest<HTMLElement>('[data-world-info-tab]');
      if (tabButton) {
        const nextTab = tabButton.getAttribute('data-world-info-tab');
        if (nextTab === 'info' || nextTab === 'manage') {
          this.infoTab = nextTab;
          this.syncInfoTabState();
        }
        return;
      }
      const createButton = target.closest<HTMLElement>('[data-instance-create-line]');
      if (createButton) {
        const preset = createButton.getAttribute('data-instance-create-line');
        if (preset === 'peaceful' || preset === 'real') {
          this.createWorldInstance(preset).catch(() => {});
        }
        return;
      }
      if (target.closest('[data-instance-transfer-player]')) {
        this.transferPlayerToCurrentInstance().catch(() => {});
      }
    });
  }

  private async createWorldInstance(linePreset: 'peaceful' | 'real'): Promise<void> {
    const templateId = this.createTemplateIdDraft ?? this.getPreferredCreateTemplateId();
    if (!templateId) {
      this.setStatus('当前缺少可用模板，无法创建新线', true);
      return;
    }
    const displayName = this.createNameDraft?.trim();
    try {
      const result = await this.request<GmCreateWorldInstanceRes>(`${GM_API_BASE_PATH}/world/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          linePreset,
          displayName: displayName || undefined,
        } satisfies GmCreateWorldInstanceReq),
      });
      this.createNameDraft = '';
      await this.refreshInstanceList();
      this.currentInstanceId = result.instance.instanceId;
      await this.loadRuntime();
      this.renderAll();
      this.setStatus(`已创建${linePreset === 'peaceful' ? '和平' : '真实'}实例：${result.instance.displayName}`);
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : '创建实例失败', true);
    }
  }

  private async transferPlayerToCurrentInstance(): Promise<void> {
    if (!this.currentInstanceId) {
      this.setStatus('未选择实例', true);
      return;
    }
    const playerId = this.transferPlayerIdDraft?.trim();
    if (!playerId) {
      this.setStatus('请填写要迁移的玩家 ID', true);
      return;
    }
    const parsedX = this.transferXDraft?.trim() ? Number(this.transferXDraft) : undefined;
    const parsedY = this.transferYDraft?.trim() ? Number(this.transferYDraft) : undefined;
    if ((parsedX !== undefined && !Number.isFinite(parsedX)) || (parsedY !== undefined && !Number.isFinite(parsedY))) {
      this.setStatus('迁移坐标必须是有效数字', true);
      return;
    }
    try {
      await this.request<{ ok: true }>(`${GM_API_BASE_PATH}/world/instances/transfer-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          instanceId: this.currentInstanceId,
          x: parsedX,
          y: parsedY,
        } satisfies GmTransferPlayerToInstanceReq),
      });
      this.transferPlayerIdDraft = playerId;
      await this.refreshInstanceList(false);
      await this.loadRuntime();
      this.renderAll();
      this.setStatus(`已迁移玩家 ${playerId} 到当前实例`);
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : '迁移玩家失败', true);
    }
  }
}
