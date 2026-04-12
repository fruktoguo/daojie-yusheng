/**
 * GM 世界管理查看器 —— 复用 TextRenderer + Camera 渲染运行时地图
 * 上帝视角，无迷雾，支持拖动、缩放、选中查看
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
} from '@mud/shared';
import { TextRenderer } from './renderer/text';
import { Camera } from './renderer/camera';
import { getCellSize, setZoom, updateDisplayMetrics } from './display';
import { GM_WORLD_VIEW_MAX } from './constants/world/gm-world-viewer';

/** RequestFn：定义该类型的结构与数据语义。 */
type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;
/** StatusFn：定义该类型的结构与数据语义。 */
type StatusFn = (message: string, isError?: boolean) => void;

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** formatClockFromTicks：执行对应的业务逻辑。 */
function formatClockFromTicks(localTicks: number, dayLength: number): string {
  const safeDayLength = Math.max(1, dayLength);
  const normalizedTicks = ((localTicks % safeDayLength) + safeDayLength) % safeDayLength;
  const totalMinutes = Math.floor((normalizedTicks / safeDayLength) * 24 * 60);
  const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** formatDebugNumber：执行对应的业务逻辑。 */
function formatDebugNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

/** createViewerId：执行对应的业务逻辑。 */
function createViewerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gm-viewer-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** GmWorldViewer：封装相关状态与行为。 */
export class GmWorldViewer {
  private canvas: HTMLCanvasElement;
  private mapListEl: HTMLElement;
  private timeControlEl: HTMLElement;
  private infoEl: HTMLElement;

  private renderer: TextRenderer;
  private camera: Camera;

  private currentMapId: string | null = null;
  private maps: GmMapSummary[] = [];
  private runtimeData: GmMapRuntimeRes | null = null;

  // 视口中心（世界坐标）
  private viewX = 0;
  private viewY = 0;

  // 选中状态
  private selectedCell: { x: number; y: number } | null = null;
  private selectedEntity: GmRuntimeEntity | null = null;

  // 拖动状态
  private isDragging = false;
  private dragStartScreenX = 0;
  private dragStartScreenY = 0;
  private dragStartViewX = 0;
  private dragStartViewY = 0;

  private pollTimer: number | null = null;
  private rafId: number | null = null;
  private mounted = false;
  private speedDraft: string | null = null;
  private offsetDraft: string | null = null;
  private readonly viewerId = createViewerId();
  private observationRegistered = false;

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

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.renderer.init(this.canvas);
    this.resizeCanvas();
    setZoom(GM_WORLD_DEFAULT_ZOOM);
    this.bindEvents();
    window.addEventListener('resize', this.handleResize);
  }

  unmount(): void {
    this.stopPolling();
    this.stopRaf();
    window.removeEventListener('resize', this.handleResize);
    this.mounted = false;
  }

  async updateMapIds(_mapIds: string[]): Promise<void> {
    try {
      const res = await this.request<GmMapListRes>('/gm/maps');
      this.maps = res.maps;
    } catch {
      this.maps = _mapIds.map((id) => ({ id, name: id, width: 0, height: 0, portalCount: 0, npcCount: 0, monsterSpawnCount: 0 }));
    }
    this.renderMapList();
  }

  async selectMap(mapId: string): Promise<void> {
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

  startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => {
      if (this.currentMapId) {
        this.loadRuntime().then(() => this.renderAll()).catch(() => {});
      }
    }, GM_WORLD_POLL_INTERVAL_MS);
    this.startRaf();
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.stopRaf();
    this.clearObservation();
  }

  // ===== RAF 循环（平滑摄像机） =====

  private startRaf(): void {
    if (this.rafId !== null) return;
    let lastTime = performance.now();
/** loop：通过常量导出可复用函数行为。 */
    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      this.camera.update(dt);
      this.renderCanvas();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // ===== 数据加载 =====

  private async loadRuntime(): Promise<void> {
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
        `/gm/maps/${this.currentMapId}/runtime?${params.toString()}`,
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

  private currentTileCache: Map<string, Tile> = new Map();
  private currentTileRevision = 0;

  private getViewport(): { startX: number; startY: number; w: number; h: number } {
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

  private snapCamera(): void {
    const cellSize = getCellSize();
    const fakePlayer = {
      x: this.viewX,
      y: this.viewY,
      id: '', name: '', mapId: '', facing: 0, viewRange: 10,
      hp: 1, maxHp: 1, qi: 0, dead: false, baseAttrs: {} as any,
      bonuses: [], temporaryBuffs: [], inventory: {} as any,
      equipment: {} as any, techniques: [], quests: [], actions: [],
      autoBattle: false, autoBattleSkills: [], autoUsePills: [], autoRetaliate: true,
      autoIdleCultivation: true, idleTicks: 0,
    } as any;
    this.camera.snap(fakePlayer);
  }

  // ===== 渲染 =====

  private renderAll(): void {
    this.renderCanvas();
    this.renderInfo();
  }

  private renderCanvas(): void {
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

  // ===== 交互 =====

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

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

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.isDragging) {
      this.isDragging = false;
      this.canvas.releasePointerCapture(e.pointerId);
      // 松手后重新加载当前视口数据
      this.loadRuntime().then(() => this.renderAll()).catch(() => {});
    }
  };

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

  private handleResize = (): void => {
    this.resizeCanvas();
    this.renderCanvas();
  };

  private screenToWorld(sx: number, sy: number): { x: number; y: number } | null {
    if (!this.runtimeData) return null;
    const cellSize = getCellSize();
    const { sx: camSx, sy: camSy } = this.camera.worldToScreen(0, 0, this.canvas.width, this.canvas.height);
    const wx = Math.floor((sx - camSx) / cellSize);
    const wy = Math.floor((sy - camSy) / cellSize);
    if (wx < 0 || wy < 0 || wx >= this.runtimeData.width || wy >= this.runtimeData.height) return null;
    return { x: wx, y: wy };
  }

  private findEntityAt(x: number, y: number): GmRuntimeEntity | null {
    if (!this.runtimeData) return null;
    const sorted = [...this.runtimeData.entities]
      .filter((e) => e.x === x && e.y === y)
      .sort((a, b) => {
        const order = { player: 0, monster: 1, npc: 2, container: 3 };
        return (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
      });
    return sorted[0] ?? null;
  }

  private resizeCanvas(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    updateDisplayMetrics(rect.width, rect.height, GM_WORLD_VIEW_MAX);
  }

  // ===== 地图列表 =====

  private renderMapList(): void {
    this.mapListEl.innerHTML = this.maps.map((m) => `
      <button class="world-map-btn ${m.id === this.currentMapId ? 'active' : ''}" data-map-id="${escapeHtml(m.id)}">
        ${escapeHtml(m.name || m.id)}
        <span style="font-size:11px;color:#888;margin-left:4px;">${escapeHtml(m.id)}</span>
      </button>
    `).join('');

    this.mapListEl.querySelectorAll('.world-map-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mapId = (btn as HTMLElement).dataset.mapId;
        if (mapId && mapId !== this.currentMapId) {
          this.selectMap(mapId).catch(() => {});
        }
      });
    });
  }

  // ===== 时间操控 =====

  private captureTimeControlDraftState(): {
    focusedField: 'speed' | 'offset' | null;
    selectionStart: number | null;
    selectionEnd: number | null;
  } {
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

  private restoreTimeControlFocus(state: {
    focusedField: 'speed' | 'offset' | null;
    selectionStart: number | null;
    selectionEnd: number | null;
  }): void {
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

  private renderTimeControl(): void {
    if (!this.runtimeData) {
      this.timeControlEl.innerHTML = '<div class="empty-hint">未选择地图</div>';
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

    this.timeControlEl.innerHTML = `
      <div class="world-time-info">
        <div class="panel-row"><span class="panel-label">当前时刻</span><span class="panel-value">${formatClockFromTicks(time.localTicks, time.dayLength)}</span></div>
        <div class="panel-row"><span class="panel-label">时辰</span><span class="panel-value">${escapeHtml(time.phaseLabel)}</span></div>
        <div class="panel-row"><span class="panel-label">光照</span><span class="panel-value">${time.lightPercent}%</span></div>
        <div class="panel-row"><span class="panel-label">黑暗层数</span><span class="panel-value">${time.darknessStacks}</span></div>
        <div class="panel-row"><span class="panel-label">时间控制</span><span class="panel-value">${tickPaused ? '已暂停' : `${formatDebugNumber(realtimeTickRate)}x`}</span></div>
        <div class="panel-row"><span class="panel-label">总 Tick</span><span class="panel-value">${time.totalTicks}</span></div>
        <div class="panel-row"><span class="panel-label">本地 Tick</span><span class="panel-value">${formatDebugNumber(time.localTicks, 2)} / ${time.dayLength}</span></div>
        <div class="panel-row"><span class="panel-label">时间偏移</span><span class="panel-value">${offsetTicks}</span></div>
        <div class="panel-row"><span class="panel-label">基础倍率</span><span class="panel-value">${configuredScale}x</span></div>
        <div class="panel-row"><span class="panel-label">地图 Tick</span><span class="panel-value">${tickPaused ? '已暂停' : `${formatDebugNumber(realtimeTickRate)} 次/秒`}</span></div>
        <div class="panel-row"><span class="panel-label">时间推进</span><span class="panel-value">${tickPaused ? '已暂停' : `${formatDebugNumber(localTicksPerSecond)} 本地 Tick/秒`}</span></div>
        <div class="panel-row"><span class="panel-label">时钟速度</span><span class="panel-value">${tickPaused ? '已暂停' : `${formatDebugNumber(realtimeMinutesPerSecond)} 分钟/秒`}</span></div>
      </div>
      <div class="world-tick-control">
        <div class="panel-section-title">时间控制</div>
        <div class="world-speed-btns">
          ${speeds.map((s) => `
            <button class="small-btn world-speed-btn ${(tickPaused && s === 0) || (!tickPaused && tickSpeed === s) ? 'active' : ''}" data-speed="${s}">
              ${s === 0 ? '暂停' : s + 'x'}
            </button>
          `).join('')}
        </div>
        <div class="gm-btn-row" style="margin-top:6px;">
          <input
            type="number"
            class="gm-inline-input"
            data-world-speed-input
            value="${escapeHtml(speedValue)}"
            step="0.1"
            min="0"
            max="100"
            style="width:96px"
          />
          <button class="small-btn" id="world-speed-apply">应用速度</button>
        </div>
      </div>
      <div class="world-time-adjust">
        <div class="panel-section-title">时间偏移</div>
        <div class="gm-btn-row">
          <input type="number" id="world-time-offset" data-world-offset-input class="gm-inline-input" value="${escapeHtml(offsetValue)}" style="width:80px" />
          <button class="small-btn" id="world-time-apply">应用</button>
        </div>
      </div>
      <div class="world-time-adjust">
        <div class="panel-section-title">运行配置</div>
        <div class="gm-btn-row">
          <button class="small-btn" id="world-reload-tick-config">重新加载服务端配置</button>
        </div>
      </div>
    `;

    const speedInput = this.timeControlEl.querySelector<HTMLInputElement>('[data-world-speed-input]');
    const offsetInput = this.timeControlEl.querySelector<HTMLInputElement>('[data-world-offset-input]');
    speedInput?.addEventListener('input', () => {
      this.speedDraft = speedInput.value;
    });
    offsetInput?.addEventListener('input', () => {
      this.offsetDraft = offsetInput.value;
    });

    this.timeControlEl.querySelectorAll('.world-speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const speed = parseFloat((btn as HTMLElement).dataset.speed ?? '1');
        this.speedDraft = String(speed);
        this.setWorldSpeed(speed).catch(() => {});
      });
    });

    document.getElementById('world-speed-apply')?.addEventListener('click', () => {
      const speed = parseFloat(speedInput?.value ?? '1');
      if (Number.isFinite(speed)) {
        this.setWorldSpeed(speed).catch(() => {});
      }
    });

    document.getElementById('world-time-apply')?.addEventListener('click', () => {
      const input = document.getElementById('world-time-offset') as HTMLInputElement;
      const offset = parseInt(input.value, 10);
      if (Number.isFinite(offset)) {
        this.updateTime({ offsetTicks: offset }).catch(() => {});
      }
    });

    document.getElementById('world-reload-tick-config')?.addEventListener('click', () => {
      this.reloadTickConfig().catch(() => {});
    });

    this.restoreTimeControlFocus(previousControlState);
  }

  private async setWorldSpeed(speed: number): Promise<void> {
    if (!this.currentMapId) return;
    const clamped = Math.max(0, Math.min(100, speed));
    try {
      await this.request<{ ok: true }>(`/gm/maps/${this.currentMapId}/tick`, {
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

  private async updateTime(req: GmUpdateMapTimeReq): Promise<void> {
    if (!this.currentMapId) return;
    try {
      await this.request<{ ok: true }>(`/gm/maps/${this.currentMapId}/time`, {
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

  private async reloadTickConfig(): Promise<void> {
    try {
      await this.request<{ ok: true }>('/gm/tick-config/reload', {
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

  private clearObservation(): void {
    if (!this.observationRegistered) {
      return;
    }
    this.observationRegistered = false;
    void this.request<{ ok: true }>(`/gm/world-observers/${encodeURIComponent(this.viewerId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }

  // ===== 信息面板 =====

  private renderInfo(): void {
    if (!this.runtimeData) {
      this.infoEl.innerHTML = '<div class="empty-hint">未选择地图</div>';
      return;
    }

    const d = this.runtimeData;
    const playerCount = d.entities.filter((e) => e.kind === 'player').length;
    const monsterCount = d.entities.filter((e) => e.kind === 'monster').length;
    const npcCount = d.entities.filter((e) => e.kind === 'npc').length;

    let html = `
      <div class="panel-section">
        <div class="panel-section-title">地图信息</div>
        <div class="panel-row"><span class="panel-label">名称</span><span class="panel-value">${escapeHtml(d.mapName)}</span></div>
        <div class="panel-row"><span class="panel-label">尺寸</span><span class="panel-value">${d.width} × ${d.height}</span></div>
        <div class="panel-row"><span class="panel-label">视口玩家</span><span class="panel-value">${playerCount}</span></div>
        <div class="panel-row"><span class="panel-label">视口怪物</span><span class="panel-value">${monsterCount}</span></div>
        <div class="panel-row"><span class="panel-label">视口 NPC</span><span class="panel-value">${npcCount}</span></div>
      </div>
    `;

    if (this.selectedCell) {
      const key = `${this.selectedCell.x},${this.selectedCell.y}`;
      const tile = this.currentTileCache.get(key);

      html += `
        <div class="panel-section">
          <div class="panel-section-title">选中格 (${this.selectedCell.x}, ${this.selectedCell.y})</div>
          ${tile ? `
          <div class="panel-row"><span class="panel-label">地块</span><span class="panel-value">${TILE_TYPE_LABELS[tile.type] ?? tile.type}</span></div>
            <div class="panel-row"><span class="panel-label">可行走</span><span class="panel-value">${tile.walkable ? '是' : '否'}</span></div>
            <div class="panel-row"><span class="panel-label">灵气</span><span class="panel-value">${tile.aura ?? 0}</span></div>
          ` : '<div class="empty-hint">无地块数据</div>'}
        </div>
      `;
    }

    if (this.selectedEntity) {
      const e = this.selectedEntity;
      html += `
        <div class="panel-section">
          <div class="panel-section-title">${ENTITY_KIND_LABELS[e.kind] ?? e.kind}：${escapeHtml(e.name)}</div>
          <div class="panel-row"><span class="panel-label">坐标</span><span class="panel-value">(${e.x}, ${e.y})</span></div>
          <div class="panel-row"><span class="panel-label">字符</span><span class="panel-value">${escapeHtml(e.char)}</span></div>
      `;

      if (e.hp !== undefined && e.maxHp) {
        html += `<div class="panel-row"><span class="panel-label">HP</span><span class="panel-value">${e.hp} / ${e.maxHp}</span></div>`;
      }

      if (e.kind === 'player') {
        html += `
          <div class="panel-row"><span class="panel-label">在线</span><span class="panel-value">${e.online ? '是' : '否'}</span></div>
          <div class="panel-row"><span class="panel-label">自动战斗</span><span class="panel-value">${e.autoBattle ? '是' : '否'}</span></div>
          <div class="panel-row"><span class="panel-label">机器人</span><span class="panel-value">${e.isBot ? '是' : '否'}</span></div>
        `;
        if (e.dead) html += `<div class="panel-row"><span class="panel-label">状态</span><span class="panel-value" style="color:#f44336">死亡</span></div>`;
      }

      if (e.kind === 'monster') {
        html += `<div class="panel-row"><span class="panel-label">存活</span><span class="panel-value">${e.alive ? '是' : '否'}</span></div>`;
        if (e.targetPlayerId) {
          html += `<div class="panel-row"><span class="panel-label">仇恨目标</span><span class="panel-value">${escapeHtml(e.targetPlayerId)}</span></div>`;
        }
        if (e.respawnLeft !== undefined && e.respawnLeft > 0) {
          html += `<div class="panel-row"><span class="panel-label">重生倒计时</span><span class="panel-value">${e.respawnLeft}s</span></div>`;
        }
      }

      html += '</div>';
    }

    this.infoEl.innerHTML = html;
  }
}

