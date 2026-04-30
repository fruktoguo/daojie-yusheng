/**
 * GM 管理面板
 * 提供服务端性能监控、在线玩家列表、玩家编辑、机器人控制与意见管理
 * 当前作为 GM 工具面板继续保留，由独立 GM 入口驱动，不并入玩家主线 main.ts。
 */
import { C2S_GmUpdatePlayer, GmPlayerSummary, S2C_GmState, Suggestion } from '@mud/shared';
import { patchElementChildren, patchElementHtml } from '../dom-patch';

/** GM 面板与主客户端之间的动作回调集合。 */
interface GmCallbacks {
/**
 * onRefresh：onRefresh相关字段。
 */

  onRefresh: () => void;  
  /**
 * onResetSelf：onResetSelf相关字段。
 */

  onResetSelf: () => void;  
  /**
 * onCycleZoom：onCycleZoom相关字段。
 */

  onCycleZoom: () => void;  
  /**
 * onSpawnBots：onSpawnBot相关字段。
 */

  onSpawnBots: (count: number) => void;  
  /**
 * onRemoveBots：onRemoveBot相关字段。
 */

  onRemoveBots: (playerIds?: string[], all?: boolean) => void;  
  /**
 * onUpdatePlayer：onUpdate玩家引用。
 */

  onUpdatePlayer: (payload: C2S_GmUpdatePlayer) => void;  
  /**
 * onResetPlayer：onReset玩家引用。
 */

  onResetPlayer: (playerId: string) => void;  
  /**
 * onResetHeavenGate：onResetHeavenGate相关字段。
 */

  onResetHeavenGate: (playerId: string) => void;  
  /**
 * onMarkSuggestionCompleted：onMarkSuggestionCompleted相关字段。
 */

  onMarkSuggestionCompleted: (id: string) => void;  
  /**
 * onRemoveSuggestion：onRemoveSuggestion相关字段。
 */

  onRemoveSuggestion: (id: string) => void;
}

/** 生成玩家账号展示文本。 */
function getPlayerAccountLabel(player: GmPlayerSummary): string {
  return player.accountName ?? (player.isBot ? '机器人' : '无');
}

/** 生成玩家所在地图的展示文本。 */
function getPlayerMapLabel(player: GmPlayerSummary): string {
  return player.mapName || player.mapId;
}

/** 构建一份空的 GM 状态快照，作为首屏和清空时的基线。 */
function createEmptyGmState(): S2C_GmState {
  return {
    players: [],
    mapIds: [],
    botCount: 0,
    perf: {
      cpuPercent: 0,
      memoryMb: 0,
      tickMs: 0,
      tick: {
        lastMapId: null,
        lastMs: 0,
        windowElapsedSec: 0,
        windowTickCount: 0,
        windowTotalMs: 0,
        windowAvgMs: 0,
        windowBusyPercent: 0,
      },
      cpu: {
        cores: 0,
        loadAvg1m: 0,
        loadAvg5m: 0,
        loadAvg15m: 0,
        processUptimeSec: 0,
        systemUptimeSec: 0,
        userCpuMs: 0,
        systemCpuMs: 0,
        rssMb: 0,
        heapUsedMb: 0,
        heapTotalMb: 0,
        externalMb: 0,
        profileStartedAt: 0,
        profileElapsedSec: 0,
        breakdown: [],
      },
      memoryEstimate: {
        mode: 'snapshot_estimate',
        generatedAt: 0,
        cacheTtlMs: 0,
        rssBytes: 0,
        coveredBytes: 0,
        uncoveredBytes: 0,
        coveragePercent: 0,
        domains: [],
        topInstances: [],
      },
      pathfinding: {
        statsStartedAt: 0,
        statsElapsedSec: 0,
        workerCount: 0,
        runningWorkers: 0,
        idleWorkers: 0,
        peakRunningWorkers: 0,
        queueDepth: 0,
        peakQueueDepth: 0,
        enqueued: 0,
        dispatched: 0,
        completed: 0,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
        droppedPending: 0,
        droppedStaleResults: 0,
        avgQueueMs: 0,
        maxQueueMs: 0,
        avgRunMs: 0,
        maxRunMs: 0,
        avgExpandedNodes: 0,
        maxExpandedNodes: 0,
        failureReasons: [],
      },
      networkStatsStartedAt: 0,
      networkStatsElapsedSec: 0,
      networkInBytes: 0,
      networkOutBytes: 0,
      networkInBuckets: [],
      networkOutBuckets: [],
    },
  };
}

/** GM 面板实现，负责展示服务器概况、玩家列表和意见处理。 */
export class GmPanel {
  /** 面板根节点。 */
  private pane = document.getElementById('pane-gm')!;
  /** 当前收到的 GM 状态快照。 */
  private state: S2C_GmState = createEmptyGmState();
  /** 意见列表缓存。 */
  private suggestions: Suggestion[] = [];
  /** 当前选中的玩家 ID。 */
  private selectedPlayerId: string | null = null;
  /** 各类 GM 操作回调。 */
  private callbacks: GmCallbacks | null = null;
  /** 是否已经完成布局初始化。 */
  private initialized = false;

  /** 服务器 CPU 性能显示节点。 */
  private perfCpuEl: HTMLElement | null = null;
  /** 服务器内存性能显示节点。 */
  private perfMemoryEl: HTMLElement | null = null;
  /** tick 性能显示节点。 */
  private perfTickEl: HTMLElement | null = null;
  /** 在线玩家数量节点。 */
  private playerCountEl: HTMLElement | null = null;
  /** 机器人数量显示节点。 */
  private botsDisplayEl: HTMLElement | null = null;
  /** 玩家列表容器。 */
  private playerListEl: HTMLElement | null = null;
  /** 玩家详情表单容器。 */
  private detailFormEl: HTMLElement | null = null;
  /** 详情空态节点。 */
  private detailEmptyEl: HTMLElement | null = null;
  /** 意见列表容器。 */
  private suggestionListEl: HTMLElement | null = null;

  /** 玩家地图下拉框。 */
  private mapSelect: HTMLSelectElement | null = null;
  /** 玩家坐标 X 输入框。 */
  private xInput: HTMLInputElement | null = null;
  /** 玩家坐标 Y 输入框。 */
  private yInput: HTMLInputElement | null = null;
  /** 玩家血量输入框。 */
  private hpInput: HTMLInputElement | null = null;
  /** 玩家自动战斗开关。 */
  private autoBattleCheckbox: HTMLInputElement | null = null;
  /** 保存修改按钮。 */
  private saveBtn: HTMLButtonElement | null = null;
  /** 回满血量按钮。 */
  private healBtn: HTMLButtonElement | null = null;
  /** 重置玩家按钮。 */
  private resetBtn: HTMLButtonElement | null = null;
  /** 重置天关按钮。 */
  private resetHeavenGateBtn: HTMLButtonElement | null = null;
  /** 删除玩家按钮。 */
  private removeBtn: HTMLButtonElement | null = null;
  /** 批量生成机器人数量输入框。 */
  private botCountInput: HTMLInputElement | null = null;

  /** 注册 GM 面板对外回调。 */
  setCallbacks(callbacks: GmCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 接收服务端 GM 状态并刷新所有子区域。 */
  update(state: S2C_GmState): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.state = state;
    this.ensureLayout();
    if (!this.selectedPlayerId || !state.players.some((player) => player.id === this.selectedPlayerId)) {
      this.selectedPlayerId = state.players[0]?.id ?? null;
    }
    this.updatePerformance();
    this.updateOverview();
    this.updatePlayerList();
    this.updateDetail();
    this.updateSuggestions();
  }

  /** 更新意见列表数据并重绘意见区域。 */
  updateSuggestionsData(suggestions: Suggestion[]) {
    this.suggestions = suggestions;
    this.updateSuggestions();
  }

  /** 以复用节点的方式刷新意见列表。 */
  private updateSuggestions() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.suggestionListEl) return;

    const preserved = this.captureContainerState(this.suggestionListEl);
    if (this.suggestions.length === 0) {
      const empty = document.createElement('div');
      empty.dataset.gmEmptyState = 'suggestions';
      empty.style.color = '#666';
      empty.style.padding = '10px';
      empty.style.textAlign = 'center';
      empty.textContent = '暂无意见收集';
      patchElementChildren(this.suggestionListEl, empty);
      return;
    }

    const orderedSuggestions = [...this.suggestions].sort((a, b) => b.createdAt - a.createdAt);
    const existingItems = new Map<string, HTMLElement>();
    this.suggestionListEl.querySelectorAll<HTMLElement>('[data-gm-suggestion-id]').forEach((item) => {
      const id = item.dataset.gmSuggestionId;
      if (id) {
        existingItems.set(id, item);
      }
    });

    const orderedItems = orderedSuggestions.map((suggestion) => {
      const existing = existingItems.get(suggestion.id);
      const item = existing ?? this.createSuggestionItem();
      this.patchSuggestionItem(item, suggestion);
      existingItems.delete(suggestion.id);
      return item;
    });

    existingItems.forEach((item) => item.remove());
    this.syncContainerChildren(this.suggestionListEl, orderedItems);
    this.restoreContainerState(this.suggestionListEl, preserved);
  }

  /** 清空 GM 面板并回到未初始化状态。 */
  clear(): void {
    this.state = createEmptyGmState();
    this.suggestions = [];
    this.selectedPlayerId = null;
    this.initialized = false;
    this.perfCpuEl = null;
    this.perfMemoryEl = null;
    this.perfTickEl = null;
    this.playerCountEl = null;
    this.botsDisplayEl = null;
    this.playerListEl = null;
    this.detailFormEl = null;
    this.detailEmptyEl = null;
    this.suggestionListEl = null;
    this.mapSelect = null;
    this.xInput = null;
    this.yInput = null;
    this.hpInput = null;
    this.autoBattleCheckbox = null;
    this.saveBtn = null;
    this.healBtn = null;
    this.resetBtn = null;
    this.resetHeavenGateBtn = null;
    this.removeBtn = null;
    this.botCountInput = null;
    patchElementHtml(this.pane, '<div class="empty-hint ui-empty-hint">暂无 GM 数据</div>');
  }

  /** 确保面板布局只初始化一次。 */
  private ensureLayout(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.initialized) return;
    this.initialized = true;
    patchElementHtml(this.pane, `
      <div class="panel-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">服务端性能</div>
        <div class="panel-row"><span class="panel-label">CPU 压力</span><span class="panel-value" data-gm-perf-cpu>0%</span></div>
        <div class="panel-row"><span class="panel-label">内存占用</span><span class="panel-value" data-gm-perf-memory>0 MB</span></div>
        <div class="panel-row"><span class="panel-label">最近单图 tick</span><span class="panel-value" data-gm-perf-tick>0 ms</span></div>
      </div>
      <div class="panel-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">GM 概览</div>
        <div class="panel-row"><span class="panel-label">在线玩家</span><span class="panel-value" data-gm-player-count>0</span></div>
        <div class="panel-row"><span class="panel-label">机器人</span><span class="panel-value" data-gm-bot-count>0</span></div>
      </div>
      <div class="panel-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">调试</div>
        <div class="gm-btn-row ui-action-row ui-action-row--start">
          <button class="small-btn" id="gm-reset-self">自己回出生点</button>
          <button class="small-btn" id="gm-refresh">刷新</button>
          <button class="small-btn" id="gm-cycle-zoom">缩放</button>
        </div>
      </div>
      <div class="panel-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">机器人控制</div>
        <div class="gm-btn-row ui-action-row ui-action-row--start">
          <input id="gm-bot-count" class="gm-inline-input ui-input" type="number" min="1" max="50" value="5" />
          <button class="small-btn" id="gm-spawn-bots">生成</button>
          <button class="small-btn danger" id="gm-remove-all-bots">移除全部</button>
        </div>
      </div>
      <div class="panel-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">在线列表</div>
        <div class="gm-player-list ui-card-list ui-scroll-panel" data-gm-player-list></div>
      </div>
      <div class="panel-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">玩家编辑</div>
        <div data-gm-detail-empty class="empty-hint ui-empty-hint">请选择一名玩家</div>
        <div data-gm-detail-form>
          <div class="gm-form-grid ui-form-grid ui-form-grid--three-column">
            <label class="gm-field ui-form-field">
              <span>地图</span>
              <select id="gm-map" class="ui-input"></select>
            </label>
            <label class="gm-field ui-form-field">
              <span>X</span>
              <input id="gm-x" class="ui-input" type="number" />
            </label>
            <label class="gm-field ui-form-field">
              <span>Y</span>
              <input id="gm-y" class="ui-input" type="number" />
            </label>
            <label class="gm-field ui-form-field">
              <span>HP</span>
              <input id="gm-hp" class="ui-input" type="number" min="0" />
            </label>
          </div>
          <label class="gm-checkbox">
            <input id="gm-auto-battle" type="checkbox" />
            <span>自动战斗</span>
          </label>
          <div class="gm-btn-row ui-action-row ui-action-row--start">
            <button class="small-btn" id="gm-save-player">保存</button>
            <button class="small-btn" id="gm-heal-player">满血</button>
            <button class="small-btn" id="gm-reset-player">回出生点</button>
            <button class="small-btn" id="gm-reset-heaven-gate">重置天门</button>
            <button class="small-btn danger" id="gm-remove-player">移除机器人</button>
          </div>
        </div>
      </div>
      <div class="panel-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">意见管理</div>
        <div id="gm-suggestion-list" class="gm-suggestion-list ui-surface-pane ui-surface-pane--stack ui-scroll-panel">
        </div>
      </div>
    `);

    this.perfCpuEl = this.pane.querySelector('[data-gm-perf-cpu]');
    this.perfMemoryEl = this.pane.querySelector('[data-gm-perf-memory]');
    this.perfTickEl = this.pane.querySelector('[data-gm-perf-tick]');
    this.playerCountEl = this.pane.querySelector('[data-gm-player-count]');
    this.botsDisplayEl = this.pane.querySelector('[data-gm-bot-count]');
    this.playerListEl = this.pane.querySelector('[data-gm-player-list]');
    this.detailFormEl = this.pane.querySelector('[data-gm-detail-form]');
    this.detailEmptyEl = this.pane.querySelector('[data-gm-detail-empty]');
    this.suggestionListEl = this.pane.querySelector<HTMLElement>('#gm-suggestion-list');
    this.mapSelect = this.pane.querySelector<HTMLSelectElement>('#gm-map');
    this.xInput = this.pane.querySelector<HTMLInputElement>('#gm-x');
    this.yInput = this.pane.querySelector<HTMLInputElement>('#gm-y');
    this.hpInput = this.pane.querySelector<HTMLInputElement>('#gm-hp');
    this.autoBattleCheckbox = this.pane.querySelector<HTMLInputElement>('#gm-auto-battle');
    this.saveBtn = this.pane.querySelector<HTMLButtonElement>('#gm-save-player');
    this.healBtn = this.pane.querySelector<HTMLButtonElement>('#gm-heal-player');
    this.resetBtn = this.pane.querySelector<HTMLButtonElement>('#gm-reset-player');
    this.resetHeavenGateBtn = this.pane.querySelector<HTMLButtonElement>('#gm-reset-heaven-gate');
    this.removeBtn = this.pane.querySelector<HTMLButtonElement>('#gm-remove-player');
    this.botCountInput = this.pane.querySelector<HTMLInputElement>('#gm-bot-count');

    this.botCountInput?.addEventListener('keydown', (event) => {
      if (event.key === 'e' || event.key === 'E' || event.key === '.' || event.key === '+') {
        event.preventDefault();
      }
    });

    this.bindStaticEvents();
    this.setDetailVisibility(false);
  }

  /** 绑定不依赖当前选中玩家的静态事件。 */
  private bindStaticEvents(): void {
    document.getElementById('gm-refresh')?.addEventListener('click', () => this.callbacks?.onRefresh());
    document.getElementById('gm-reset-self')?.addEventListener('click', () => this.callbacks?.onResetSelf());
    document.getElementById('gm-cycle-zoom')?.addEventListener('click', () => this.callbacks?.onCycleZoom());
    document.getElementById('gm-spawn-bots')?.addEventListener('click', () => {
      const count = Number(this.botCountInput?.value ?? '0');
      if (Number.isNaN(count) || count <= 0) return;
      this.callbacks?.onSpawnBots(count);
    });
    document.getElementById('gm-remove-all-bots')?.addEventListener('click', () => {
      this.callbacks?.onRemoveBots(undefined, true);
    });

    this.playerListEl?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-gm-player-id]');
      const id = button?.dataset.gmPlayerId;
      if (id) {
        this.handlePlayerSelect(id);
      }
    });
    this.suggestionListEl?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-gm-suggest-action][data-id]');
      const id = button?.dataset.id;
      if (!id) {
        return;
      }
      const action = button.dataset.gmSuggestAction;
      if (action === 'complete') {
        this.callbacks?.onMarkSuggestionCompleted(id);
        return;
      }
      if (action === 'remove' && confirm('确定移除这条意见吗？')) {
        this.callbacks?.onRemoveSuggestion(id);
      }
    });

    this.saveBtn?.addEventListener('click', () => this.handleSave());
    this.healBtn?.addEventListener('click', () => this.handleHeal());
    this.resetBtn?.addEventListener('click', () => this.handleReset());
    this.resetHeavenGateBtn?.addEventListener('click', () => this.handleResetHeavenGate());
    this.removeBtn?.addEventListener('click', () => this.handleRemove());
  }

  /** 刷新性能概览。 */
  private updatePerformance(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.perfCpuEl || !this.perfMemoryEl || !this.perfTickEl) return;
    this.perfCpuEl.textContent = `${Math.round(this.state.perf.cpuPercent)}%`;
    this.perfMemoryEl.textContent = `${Math.round(this.state.perf.memoryMb)} MB`;
    const tickPerf = this.state.perf.tick ?? {
      lastMapId: null,
      lastMs: this.state.perf.tickMs,
    };
    const lastMapId = tickPerf.lastMapId;
    this.perfTickEl.textContent = lastMapId
      ? `${Math.round(tickPerf.lastMs)} ms · ${lastMapId}`
      : `${Math.round(tickPerf.lastMs)} ms`;
  }

  /** 刷新在线人数和机器人数量概览。 */
  private updateOverview(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.playerCountEl) {
      this.playerCountEl.textContent = `${this.state.players.length}`;
    }
    if (this.botsDisplayEl) {
      this.botsDisplayEl.textContent = `${this.state.botCount}`;
    }
  }

  /** 刷新玩家列表，并尽量复用已有条目节点。 */
  private updatePlayerList(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.playerListEl) return;
    const preserved = this.captureContainerState(this.playerListEl);
    if (this.state.players.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-hint ui-empty-hint';
      empty.dataset.gmEmptyState = 'players';
      empty.textContent = '当前没有在线玩家';
      patchElementChildren(this.playerListEl, empty);
      return;
    }
    const existingRows = new Map<string, HTMLButtonElement>();
    this.playerListEl.querySelectorAll<HTMLButtonElement>('[data-gm-player-id]').forEach((row) => {
      const id = row.dataset.gmPlayerId;
      if (id) {
        existingRows.set(id, row);
      }
    });
    const orderedRows = this.state.players.map((player) => {
      const existing = existingRows.get(player.id);
      const row = existing ?? this.createPlayerRow();
      this.patchPlayerRow(row, player);
      existingRows.delete(player.id);
      return row;
    });
    existingRows.forEach((row) => row.remove());
    this.syncContainerChildren(this.playerListEl, orderedRows);
    this.restoreContainerState(this.playerListEl, preserved);
  }

  /** 刷新当前选中玩家的详情区。 */
  private updateDetail(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const selected = this.getSelectedPlayer();
    if (!selected) {
      this.setDetailVisibility(false);
      this.toggleDetailButtons(false, false);
      return;
    }
    this.setDetailVisibility(true);
    this.toggleDetailButtons(true, selected.isBot);
    this.updateDetailFields(selected);
  }

  /** 将选中玩家的信息写回表单字段。 */
  private updateDetailFields(selected: GmPlayerSummary): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.mapSelect && !this.isActiveElement(this.mapSelect)) {
      const fragment = document.createDocumentFragment();
      const seen = new Set<string>();
      for (const mapId of this.state.mapIds) {
        const option = document.createElement('option');
        option.value = mapId;
        option.textContent = mapId;
        fragment.appendChild(option);
        seen.add(mapId);
      }
      const includesSelected = this.state.mapIds.includes(selected.mapId);
      if (!includesSelected) {
        const option = document.createElement('option');
        option.value = selected.mapId;
        option.textContent = selected.mapId;
        fragment.appendChild(option);
        seen.add(selected.mapId);
      }
      patchElementChildren(this.mapSelect, Array.from(fragment.childNodes));
      this.mapSelect.value = selected.mapId;
    }

    if (this.xInput && !this.isActiveElement(this.xInput)) {
      this.xInput.value = `${selected.x}`;
    }
    if (this.yInput && !this.isActiveElement(this.yInput)) {
      this.yInput.value = `${selected.y}`;
    }
    if (this.hpInput) {
      this.hpInput.max = `${selected.maxHp}`;
      if (!this.isActiveElement(this.hpInput)) {
        this.hpInput.value = `${selected.hp}`;
      }
    }
    if (this.autoBattleCheckbox) {
      this.autoBattleCheckbox.disabled = !!selected.dead;
      if (!this.isActiveElement(this.autoBattleCheckbox)) {
        this.autoBattleCheckbox.checked = !!selected.autoBattle;
      }
    }
  }

  /** 控制详情表单与空态之间的切换。 */
  private setDetailVisibility(visible: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.detailFormEl) {
      (this.detailFormEl as HTMLElement).style.display = visible ? '' : 'none';
    }
    if (this.detailEmptyEl) {
      (this.detailEmptyEl as HTMLElement).style.display = visible ? 'none' : '';
    }
  }

  /** 控制与当前选中玩家相关的操作按钮。 */
  private toggleDetailButtons(enabled: boolean, showRemove: boolean): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.saveBtn) {
      this.saveBtn.disabled = !enabled;
    }
    if (this.healBtn) {
      this.healBtn.disabled = !enabled;
    }
    if (this.resetBtn) {
      this.resetBtn.disabled = !enabled;
    }
    if (this.removeBtn) {
      this.removeBtn.disabled = !showRemove;
      this.removeBtn.style.display = showRemove ? '' : 'none';
    }
  }

  /** 读取当前选中的玩家。 */
  private getSelectedPlayer(): GmPlayerSummary | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.selectedPlayerId) return null;
    return this.state.players.find((player) => player.id === this.selectedPlayerId) ?? null;
  }

  /** 切换玩家选中态并刷新详情。 */
  private handlePlayerSelect(id: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.selectedPlayerId === id) return;
    this.selectedPlayerId = id;
    this.updatePlayerList();
    this.updateDetail();
  }

  /** 提交玩家编辑表单。 */
  private handleSave(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = this.getSelectedPlayer();
    if (!player) return;
    const mapId = this.mapSelect?.value ?? player.mapId;
    const x = Number(this.xInput?.value ?? player.x);
    const y = Number(this.yInput?.value ?? player.y);
    const hp = Number(this.hpInput?.value ?? player.hp);
    const autoBattle = Boolean(this.autoBattleCheckbox?.checked ?? player.autoBattle);
    this.callbacks?.onUpdatePlayer({ playerId: player.id, mapId, x, y, hp, autoBattle });
  }

  /** 将选中玩家恢复到满血。 */
  private handleHeal(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = this.getSelectedPlayer();
    if (!player) return;
    this.callbacks?.onUpdatePlayer({
      playerId: player.id,
      mapId: player.mapId,
      x: player.x,
      y: player.y,
      hp: player.maxHp,
      autoBattle: false,
    });
  }

  /** 请求将选中玩家送回出生点。 */
  private handleReset(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = this.getSelectedPlayer();
    if (!player) return;
    this.callbacks?.onResetPlayer(player.id);
  }

  /** 请求重置选中玩家的天关进度。 */
  private handleResetHeavenGate(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = this.getSelectedPlayer();
    if (!player) return;
    this.callbacks?.onResetHeavenGate(player.id);
  }

  /** 移除当前选中的机器人。 */
  private handleRemove(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = this.getSelectedPlayer();
    if (!player || !player.isBot) return;
    this.callbacks?.onRemoveBots([player.id], false);
  }

  /** 创建玩家列表条目的基础节点。 */
  private createPlayerRow(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'gm-player-row ui-surface-card ui-surface-card--compact ui-selectable-card';
    button.type = 'button';
    const content = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'gm-player-name';
    name.dataset.gmRole = 'name';
    const accountMeta = document.createElement('div');
    accountMeta.className = 'gm-player-meta';
    accountMeta.dataset.gmRole = 'account';
    const mapMeta = document.createElement('div');
    mapMeta.className = 'gm-player-meta';
    mapMeta.dataset.gmRole = 'map';
    content.append(name, accountMeta, mapMeta);
    button.appendChild(content);
    return button;
  }

  /** 将玩家数据写入列表条目并同步高亮。 */
  private patchPlayerRow(row: HTMLButtonElement, player: GmPlayerSummary): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    row.dataset.gmPlayerId = player.id;
    row.classList.toggle('is-active', player.id === this.selectedPlayerId);
    const name = row.querySelector<HTMLElement>('[data-gm-role="name"]');
    const accountMeta = row.querySelector<HTMLElement>('[data-gm-role="account"]');
    const mapMeta = row.querySelector<HTMLElement>('[data-gm-role="map"]');
    if (name) {
      name.textContent = player.roleName;
    }
    if (accountMeta) {
      accountMeta.textContent = `账号: ${getPlayerAccountLabel(player)} · 显示名: ${player.displayName}`;
    }
    if (mapMeta) {
      mapMeta.textContent = `${player.isBot ? '机器人' : '真人'} · ${getPlayerMapLabel(player)}`;
    }
  }

  /** 创建意见列表条目的基础节点。 */
  private createSuggestionItem(): HTMLElement {
    const item = document.createElement('div');
    item.className = 'gm-suggestion-card ui-surface-card ui-surface-card--compact';

    const header = document.createElement('div');
    header.className = 'gm-suggestion-head';

    const title = document.createElement('span');
    title.className = 'gm-suggestion-title';
    title.dataset.gmSuggestionRole = 'title';
    const author = document.createElement('span');
    author.className = 'gm-suggestion-author';
    author.dataset.gmSuggestionRole = 'author';
    header.append(title, author);

    const description = document.createElement('div');
    description.className = 'gm-suggestion-desc';
    description.dataset.gmSuggestionRole = 'description';

    const actions = document.createElement('div');
    actions.className = 'gm-suggestion-actions';
    actions.dataset.gmSuggestionRole = 'actions';

    const votes = document.createElement('span');
    votes.className = 'gm-suggestion-votes';
    votes.dataset.gmSuggestionRole = 'votes';
    actions.appendChild(votes);

    item.append(header, description, actions);
    return item;
  }

  /** 将意见数据写入条目并同步动作按钮。 */
  private patchSuggestionItem(item: HTMLElement, suggestion: Suggestion): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    item.dataset.gmSuggestionId = suggestion.id;
    const title = item.querySelector<HTMLElement>('[data-gm-suggestion-role="title"]');
    const author = item.querySelector<HTMLElement>('[data-gm-suggestion-role="author"]');
    const description = item.querySelector<HTMLElement>('[data-gm-suggestion-role="description"]');
    const votes = item.querySelector<HTMLElement>('[data-gm-suggestion-role="votes"]');
    const actions = item.querySelector<HTMLElement>('[data-gm-suggestion-role="actions"]');

    if (title) {
      title.textContent = suggestion.title;
      title.classList.toggle('completed', suggestion.status === 'completed');
      title.classList.toggle('pending', suggestion.status !== 'completed');
    }
    if (author) {
      author.textContent = suggestion.authorName;
    }
    if (description) {
      description.textContent = suggestion.description;
    }
    if (votes) {
      votes.textContent = `👍${suggestion.upvotes.length} 👎${suggestion.downvotes.length}`;
    }
    if (!actions) {
      return;
    }

    this.setSuggestionPendingAction(actions, suggestion);
    let removeButton = actions.querySelector<HTMLButtonElement>('[data-gm-suggest-action="remove"]');
    if (!removeButton) {
      removeButton = this.createSuggestionActionButton('移除', 'remove', 'danger');
      actions.appendChild(removeButton);
    }
    removeButton.dataset.id = suggestion.id;
  }

  /** 根据意见状态切换“标记完成”按钮。 */
  private setSuggestionPendingAction(actions: HTMLElement, suggestion: Suggestion): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const existing = actions.querySelector<HTMLButtonElement>('[data-gm-suggest-action="complete"]');
    if (suggestion.status !== 'pending') {
      existing?.remove();
      return;
    }
    const button = existing ?? this.createSuggestionActionButton('标记完成', 'complete');
    button.dataset.id = suggestion.id;
    if (!existing) {
      const removeButton = actions.querySelector('[data-gm-suggest-action="remove"]');
      actions.insertBefore(button, removeButton ?? null);
    }
  }

  /** 创建意见卡片上的操作按钮。 */
  private createSuggestionActionButton(label: string, action: 'complete' | 'remove', tone?: 'danger'): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.gmSuggestAction = action;
    button.className = `gm-suggestion-action${tone === 'danger' ? ' gm-suggestion-action--danger' : ''}`;
    button.textContent = label;
    return button;
  }

  /** 按给定顺序同步容器子节点。 */
  private syncContainerChildren(container: HTMLElement, orderedChildren: HTMLElement[]): void {
    const allowed = new Set(orderedChildren);
    Array.from(container.children).forEach((child) => {
      if (child instanceof HTMLElement && !allowed.has(child)) {
        child.remove();
      }
    });
    orderedChildren.forEach((child, index) => {
      const current = container.children.item(index);
      if (current !== child) {
        container.insertBefore(child, current ?? null);
      }
    });
  }

  /** 记录容器滚动和焦点位置。 */
  private captureContainerState(container: HTMLElement): {  
  /**
 * scrollTop：scrollTop相关字段。
 */
 scrollTop: number;  
 /**
 * focusSelector：focuSelector相关字段。
 */
 focusSelector: string | null } {
    return {
      scrollTop: container.scrollTop,
      focusSelector: this.buildContainedFocusSelector(container),
    };
  }

  /** 恢复容器滚动和焦点位置。 */
  private restoreContainerState(container: HTMLElement, preserved: {  
  /**
 * scrollTop：scrollTop相关字段。
 */
 scrollTop: number;  
 /**
 * focusSelector：focuSelector相关字段。
 */
 focusSelector: string | null }): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    container.scrollTop = preserved.scrollTop;
    if (!preserved.focusSelector) {
      return;
    }
    const target = container.querySelector<HTMLElement>(preserved.focusSelector);
    target?.focus({ preventScroll: true });
  }

  /** 为容器内当前焦点构建可复原的选择器。 */
  private buildContainedFocusSelector(container: HTMLElement): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !container.contains(active)) {
      return null;
    }
    const suggestionButton = active.closest<HTMLElement>('[data-gm-suggest-action][data-id]');
    if (suggestionButton && container.contains(suggestionButton)) {
      const action = suggestionButton.dataset.gmSuggestAction;
      const id = suggestionButton.dataset.id;
      if (action && id) {
        return `[data-gm-suggest-action="${action}"][data-id="${this.escapeSelectorValue(id)}"]`;
      }
    }
    const playerButton = active.closest<HTMLElement>('[data-gm-player-id]');
    if (playerButton && container.contains(playerButton)) {
      const id = playerButton.dataset.gmPlayerId;
      if (id) {
        return `[data-gm-player-id="${this.escapeSelectorValue(id)}"]`;
      }
    }
    return null;
  }

  /** 转义选择器中的特殊字符。 */
  private escapeSelectorValue(value: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /** 判断节点是否仍处于当前输入焦点。 */
  private isActiveElement(element?: Element | null): boolean {
    return Boolean(element && document.activeElement === element);
  }
}
