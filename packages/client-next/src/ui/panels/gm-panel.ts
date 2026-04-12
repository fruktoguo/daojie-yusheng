/**
 * GM 管理面板
 * 提供服务端性能监控、在线玩家列表、玩家编辑、机器人控制与意见管理
 */

import { C2S_GmUpdatePlayer, GmPlayerSummary, S2C_GmState, Suggestion } from '@mud/shared-next';

/** GmCallbacks：定义该接口的能力与字段约束。 */
interface GmCallbacks {
  onRefresh: () => void;
  onResetSelf: () => void;
  onCycleZoom: () => void;
  onSpawnBots: (count: number) => void;
  onRemoveBots: (playerIds?: string[], all?: boolean) => void;
  onUpdatePlayer: (payload: C2S_GmUpdatePlayer) => void;
  onResetPlayer: (playerId: string) => void;
  onResetHeavenGate: (playerId: string) => void;
  onMarkSuggestionCompleted: (id: string) => void;
  onRemoveSuggestion: (id: string) => void;
}

/** getPlayerAccountLabel：执行对应的业务逻辑。 */
function getPlayerAccountLabel(player: GmPlayerSummary): string {
  return player.accountName ?? (player.isBot ? '机器人' : '无');
}

/** getPlayerMapLabel：执行对应的业务逻辑。 */
function getPlayerMapLabel(player: GmPlayerSummary): string {
  return player.mapName || player.mapId;
}

/** createEmptyGmState：执行对应的业务逻辑。 */
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

/** GmPanel：封装相关状态与行为。 */
export class GmPanel {
  private pane = document.getElementById('pane-gm')!;
/** state：定义该变量以承载业务值。 */
  private state: S2C_GmState = createEmptyGmState();
/** suggestions：定义该变量以承载业务值。 */
  private suggestions: Suggestion[] = [];
/** selectedPlayerId：定义该变量以承载业务值。 */
  private selectedPlayerId: string | null = null;
/** callbacks：定义该变量以承载业务值。 */
  private callbacks: GmCallbacks | null = null;
  private initialized = false;

/** perfCpuEl：定义该变量以承载业务值。 */
  private perfCpuEl: HTMLElement | null = null;
/** perfMemoryEl：定义该变量以承载业务值。 */
  private perfMemoryEl: HTMLElement | null = null;
/** perfTickEl：定义该变量以承载业务值。 */
  private perfTickEl: HTMLElement | null = null;
/** playerCountEl：定义该变量以承载业务值。 */
  private playerCountEl: HTMLElement | null = null;
/** botsDisplayEl：定义该变量以承载业务值。 */
  private botsDisplayEl: HTMLElement | null = null;
/** playerListEl：定义该变量以承载业务值。 */
  private playerListEl: HTMLElement | null = null;
/** detailFormEl：定义该变量以承载业务值。 */
  private detailFormEl: HTMLElement | null = null;
/** detailEmptyEl：定义该变量以承载业务值。 */
  private detailEmptyEl: HTMLElement | null = null;
/** suggestionListEl：定义该变量以承载业务值。 */
  private suggestionListEl: HTMLElement | null = null;

/** mapSelect：定义该变量以承载业务值。 */
  private mapSelect: HTMLSelectElement | null = null;
/** xInput：定义该变量以承载业务值。 */
  private xInput: HTMLInputElement | null = null;
/** yInput：定义该变量以承载业务值。 */
  private yInput: HTMLInputElement | null = null;
/** hpInput：定义该变量以承载业务值。 */
  private hpInput: HTMLInputElement | null = null;
/** autoBattleCheckbox：定义该变量以承载业务值。 */
  private autoBattleCheckbox: HTMLInputElement | null = null;
/** saveBtn：定义该变量以承载业务值。 */
  private saveBtn: HTMLButtonElement | null = null;
/** healBtn：定义该变量以承载业务值。 */
  private healBtn: HTMLButtonElement | null = null;
/** resetBtn：定义该变量以承载业务值。 */
  private resetBtn: HTMLButtonElement | null = null;
/** resetHeavenGateBtn：定义该变量以承载业务值。 */
  private resetHeavenGateBtn: HTMLButtonElement | null = null;
/** removeBtn：定义该变量以承载业务值。 */
  private removeBtn: HTMLButtonElement | null = null;
/** botCountInput：定义该变量以承载业务值。 */
  private botCountInput: HTMLInputElement | null = null;

/** setCallbacks：执行对应的业务逻辑。 */
  setCallbacks(callbacks: GmCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 接收服务端 GM 状态并刷新所有子区域 */
  update(state: S2C_GmState): void {
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

/** updateSuggestionsData：处理当前场景中的对应操作。 */
  updateSuggestionsData(suggestions: Suggestion[]) {
    this.suggestions = suggestions;
    this.updateSuggestions();
  }

/** updateSuggestions：处理当前场景中的对应操作。 */
  private updateSuggestions() {
    if (!this.suggestionListEl) return;

/** preserved：定义该变量以承载业务值。 */
    const preserved = this.captureContainerState(this.suggestionListEl);
    if (this.suggestions.length === 0) {
/** empty：定义该变量以承载业务值。 */
      const empty = document.createElement('div');
      empty.dataset.gmEmptyState = 'suggestions';
      empty.style.color = '#666';
      empty.style.padding = '10px';
      empty.style.textAlign = 'center';
      empty.textContent = '暂无意见收集';
      this.suggestionListEl.replaceChildren(empty);
      return;
    }

/** orderedSuggestions：定义该变量以承载业务值。 */
    const orderedSuggestions = [...this.suggestions].sort((a, b) => b.createdAt - a.createdAt);
/** existingItems：定义该变量以承载业务值。 */
    const existingItems = new Map<string, HTMLElement>();
    this.suggestionListEl.querySelectorAll<HTMLElement>('[data-gm-suggestion-id]').forEach((item) => {
/** id：定义该变量以承载业务值。 */
      const id = item.dataset.gmSuggestionId;
      if (id) {
        existingItems.set(id, item);
      }
    });

/** orderedItems：定义该变量以承载业务值。 */
    const orderedItems = orderedSuggestions.map((suggestion) => {
/** existing：定义该变量以承载业务值。 */
      const existing = existingItems.get(suggestion.id);
/** item：定义该变量以承载业务值。 */
      const item = existing ?? this.createSuggestionItem();
      this.patchSuggestionItem(item, suggestion);
      existingItems.delete(suggestion.id);
      return item;
    });

    existingItems.forEach((item) => item.remove());
    this.syncContainerChildren(this.suggestionListEl, orderedItems);
    this.restoreContainerState(this.suggestionListEl, preserved);
  }

/** clear：执行对应的业务逻辑。 */
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
    this.pane.innerHTML = '<div class="empty-hint">暂无 GM 数据</div>';
  }

/** ensureLayout：执行对应的业务逻辑。 */
  private ensureLayout(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.pane.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-title">服务端性能</div>
        <div class="panel-row"><span class="panel-label">CPU 压力</span><span class="panel-value" data-gm-perf-cpu>0%</span></div>
        <div class="panel-row"><span class="panel-label">内存占用</span><span class="panel-value" data-gm-perf-memory>0 MB</span></div>
        <div class="panel-row"><span class="panel-label">最近单图 tick</span><span class="panel-value" data-gm-perf-tick>0 ms</span></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">GM 概览</div>
        <div class="panel-row"><span class="panel-label">在线玩家</span><span class="panel-value" data-gm-player-count>0</span></div>
        <div class="panel-row"><span class="panel-label">机器人</span><span class="panel-value" data-gm-bot-count>0</span></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">调试</div>
        <div class="gm-btn-row">
          <button class="small-btn" id="gm-reset-self">自己回出生点</button>
          <button class="small-btn" id="gm-refresh">刷新</button>
          <button class="small-btn" id="gm-cycle-zoom">缩放</button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">机器人控制</div>
        <div class="gm-btn-row">
          <input id="gm-bot-count" class="gm-inline-input" type="number" min="1" max="50" value="5" />
          <button class="small-btn" id="gm-spawn-bots">生成</button>
          <button class="small-btn danger" id="gm-remove-all-bots">移除全部</button>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">在线列表</div>
        <div class="gm-player-list" data-gm-player-list></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">玩家编辑</div>
        <div data-gm-detail-empty class="empty-hint">请选择一名玩家</div>
        <div data-gm-detail-form>
          <div class="gm-form-grid">
            <label class="gm-field">
              <span>地图</span>
              <select id="gm-map"></select>
            </label>
            <label class="gm-field">
              <span>X</span>
              <input id="gm-x" type="number" />
            </label>
            <label class="gm-field">
              <span>Y</span>
              <input id="gm-y" type="number" />
            </label>
            <label class="gm-field">
              <span>HP</span>
              <input id="gm-hp" type="number" min="0" />
            </label>
          </div>
          <label class="gm-checkbox">
            <input id="gm-auto-battle" type="checkbox" />
            <span>自动战斗</span>
          </label>
          <div class="gm-btn-row">
            <button class="small-btn" id="gm-save-player">保存</button>
            <button class="small-btn" id="gm-heal-player">满血</button>
            <button class="small-btn" id="gm-reset-player">回出生点</button>
            <button class="small-btn" id="gm-reset-heaven-gate">重置天门</button>
            <button class="small-btn danger" id="gm-remove-player">移除机器人</button>
          </div>
        </div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">意见管理</div>
        <div id="gm-suggestion-list" style="max-height: 200px; overflow-y: auto; font-size: 11px; border: 1px solid #444; padding: 5px; background: rgba(0,0,0,0.2);">
        </div>
      </div>
    `;

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

/** bindStaticEvents：执行对应的业务逻辑。 */
  private bindStaticEvents(): void {
    document.getElementById('gm-refresh')?.addEventListener('click', () => this.callbacks?.onRefresh());
    document.getElementById('gm-reset-self')?.addEventListener('click', () => this.callbacks?.onResetSelf());
    document.getElementById('gm-cycle-zoom')?.addEventListener('click', () => this.callbacks?.onCycleZoom());
    document.getElementById('gm-spawn-bots')?.addEventListener('click', () => {
/** count：定义该变量以承载业务值。 */
      const count = Number(this.botCountInput?.value ?? '0');
      if (Number.isNaN(count) || count <= 0) return;
      this.callbacks?.onSpawnBots(count);
    });
    document.getElementById('gm-remove-all-bots')?.addEventListener('click', () => {
      this.callbacks?.onRemoveBots(undefined, true);
    });

    this.playerListEl?.addEventListener('click', (event) => {
/** button：定义该变量以承载业务值。 */
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-gm-player-id]');
/** id：定义该变量以承载业务值。 */
      const id = button?.dataset.gmPlayerId;
      if (id) {
        this.handlePlayerSelect(id);
      }
    });
    this.suggestionListEl?.addEventListener('click', (event) => {
/** button：定义该变量以承载业务值。 */
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-gm-suggest-action][data-id]');
/** id：定义该变量以承载业务值。 */
      const id = button?.dataset.id;
      if (!id) {
        return;
      }
/** action：定义该变量以承载业务值。 */
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

/** updatePerformance：执行对应的业务逻辑。 */
  private updatePerformance(): void {
    if (!this.perfCpuEl || !this.perfMemoryEl || !this.perfTickEl) return;
    this.perfCpuEl.textContent = `${Math.round(this.state.perf.cpuPercent)}%`;
    this.perfMemoryEl.textContent = `${Math.round(this.state.perf.memoryMb)} MB`;
/** tickPerf：定义该变量以承载业务值。 */
    const tickPerf = this.state.perf.tick ?? {
      lastMapId: null,
      lastMs: this.state.perf.tickMs,
    };
/** lastMapId：定义该变量以承载业务值。 */
    const lastMapId = tickPerf.lastMapId;
    this.perfTickEl.textContent = lastMapId
      ? `${Math.round(tickPerf.lastMs)} ms · ${lastMapId}`
      : `${Math.round(tickPerf.lastMs)} ms`;
  }

/** updateOverview：执行对应的业务逻辑。 */
  private updateOverview(): void {
    if (this.playerCountEl) {
      this.playerCountEl.textContent = `${this.state.players.length}`;
    }
    if (this.botsDisplayEl) {
      this.botsDisplayEl.textContent = `${this.state.botCount}`;
    }
  }

/** updatePlayerList：执行对应的业务逻辑。 */
  private updatePlayerList(): void {
    if (!this.playerListEl) return;
/** preserved：定义该变量以承载业务值。 */
    const preserved = this.captureContainerState(this.playerListEl);
    if (this.state.players.length === 0) {
/** empty：定义该变量以承载业务值。 */
      const empty = document.createElement('div');
      empty.className = 'empty-hint';
      empty.dataset.gmEmptyState = 'players';
      empty.textContent = '当前没有在线玩家';
      this.playerListEl.replaceChildren(empty);
      return;
    }
/** existingRows：定义该变量以承载业务值。 */
    const existingRows = new Map<string, HTMLButtonElement>();
    this.playerListEl.querySelectorAll<HTMLButtonElement>('[data-gm-player-id]').forEach((row) => {
/** id：定义该变量以承载业务值。 */
      const id = row.dataset.gmPlayerId;
      if (id) {
        existingRows.set(id, row);
      }
    });
/** orderedRows：定义该变量以承载业务值。 */
    const orderedRows = this.state.players.map((player) => {
/** existing：定义该变量以承载业务值。 */
      const existing = existingRows.get(player.id);
/** row：定义该变量以承载业务值。 */
      const row = existing ?? this.createPlayerRow();
      this.patchPlayerRow(row, player);
      existingRows.delete(player.id);
      return row;
    });
    existingRows.forEach((row) => row.remove());
    this.syncContainerChildren(this.playerListEl, orderedRows);
    this.restoreContainerState(this.playerListEl, preserved);
  }

/** updateDetail：执行对应的业务逻辑。 */
  private updateDetail(): void {
/** selected：定义该变量以承载业务值。 */
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

/** updateDetailFields：执行对应的业务逻辑。 */
  private updateDetailFields(selected: GmPlayerSummary): void {
    if (this.mapSelect && !this.isActiveElement(this.mapSelect)) {
/** maps：定义该变量以承载业务值。 */
      const maps = this.state.mapIds.map((mapId) => ` <option value="${mapId}">${mapId}</option>`).join('');
/** includesSelected：定义该变量以承载业务值。 */
      const includesSelected = this.state.mapIds.includes(selected.mapId);
      this.mapSelect.innerHTML = `${maps}${includesSelected ? '' : `<option value="${selected.mapId}">${selected.mapId}</option>`}`;
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

/** setDetailVisibility：执行对应的业务逻辑。 */
  private setDetailVisibility(visible: boolean): void {
    if (this.detailFormEl) {
      (this.detailFormEl as HTMLElement).style.display = visible ? '' : 'none';
    }
    if (this.detailEmptyEl) {
      (this.detailEmptyEl as HTMLElement).style.display = visible ? 'none' : '';
    }
  }

/** toggleDetailButtons：执行对应的业务逻辑。 */
  private toggleDetailButtons(enabled: boolean, showRemove: boolean): void {
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

/** getSelectedPlayer：执行对应的业务逻辑。 */
  private getSelectedPlayer(): GmPlayerSummary | null {
    if (!this.selectedPlayerId) return null;
    return this.state.players.find((player) => player.id === this.selectedPlayerId) ?? null;
  }

/** handlePlayerSelect：执行对应的业务逻辑。 */
  private handlePlayerSelect(id: string): void {
    if (this.selectedPlayerId === id) return;
    this.selectedPlayerId = id;
    this.updatePlayerList();
    this.updateDetail();
  }

/** handleSave：执行对应的业务逻辑。 */
  private handleSave(): void {
/** player：定义该变量以承载业务值。 */
    const player = this.getSelectedPlayer();
    if (!player) return;
/** mapId：定义该变量以承载业务值。 */
    const mapId = this.mapSelect?.value ?? player.mapId;
/** x：定义该变量以承载业务值。 */
    const x = Number(this.xInput?.value ?? player.x);
/** y：定义该变量以承载业务值。 */
    const y = Number(this.yInput?.value ?? player.y);
/** hp：定义该变量以承载业务值。 */
    const hp = Number(this.hpInput?.value ?? player.hp);
/** autoBattle：定义该变量以承载业务值。 */
    const autoBattle = Boolean(this.autoBattleCheckbox?.checked ?? player.autoBattle);
    this.callbacks?.onUpdatePlayer({ playerId: player.id, mapId, x, y, hp, autoBattle });
  }

/** handleHeal：执行对应的业务逻辑。 */
  private handleHeal(): void {
/** player：定义该变量以承载业务值。 */
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

/** handleReset：执行对应的业务逻辑。 */
  private handleReset(): void {
/** player：定义该变量以承载业务值。 */
    const player = this.getSelectedPlayer();
    if (!player) return;
    this.callbacks?.onResetPlayer(player.id);
  }

/** handleResetHeavenGate：执行对应的业务逻辑。 */
  private handleResetHeavenGate(): void {
/** player：定义该变量以承载业务值。 */
    const player = this.getSelectedPlayer();
    if (!player) return;
    this.callbacks?.onResetHeavenGate(player.id);
  }

/** handleRemove：执行对应的业务逻辑。 */
  private handleRemove(): void {
/** player：定义该变量以承载业务值。 */
    const player = this.getSelectedPlayer();
    if (!player || !player.isBot) return;
    this.callbacks?.onRemoveBots([player.id], false);
  }

/** createPlayerRow：执行对应的业务逻辑。 */
  private createPlayerRow(): HTMLButtonElement {
/** button：定义该变量以承载业务值。 */
    const button = document.createElement('button');
    button.className = 'gm-player-row';
    button.type = 'button';
/** content：定义该变量以承载业务值。 */
    const content = document.createElement('div');
/** name：定义该变量以承载业务值。 */
    const name = document.createElement('div');
    name.className = 'gm-player-name';
    name.dataset.gmRole = 'name';
/** accountMeta：定义该变量以承载业务值。 */
    const accountMeta = document.createElement('div');
    accountMeta.className = 'gm-player-meta';
    accountMeta.dataset.gmRole = 'account';
/** mapMeta：定义该变量以承载业务值。 */
    const mapMeta = document.createElement('div');
    mapMeta.className = 'gm-player-meta';
    mapMeta.dataset.gmRole = 'map';
    content.append(name, accountMeta, mapMeta);
    button.appendChild(content);
    return button;
  }

/** patchPlayerRow：执行对应的业务逻辑。 */
  private patchPlayerRow(row: HTMLButtonElement, player: GmPlayerSummary): void {
    row.dataset.gmPlayerId = player.id;
    row.classList.toggle('active', player.id === this.selectedPlayerId);
/** name：定义该变量以承载业务值。 */
    const name = row.querySelector<HTMLElement>('[data-gm-role="name"]');
/** accountMeta：定义该变量以承载业务值。 */
    const accountMeta = row.querySelector<HTMLElement>('[data-gm-role="account"]');
/** mapMeta：定义该变量以承载业务值。 */
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

/** createSuggestionItem：执行对应的业务逻辑。 */
  private createSuggestionItem(): HTMLElement {
/** item：定义该变量以承载业务值。 */
    const item = document.createElement('div');
    item.style.borderBottom = '1px solid #333';
    item.style.padding = '5px';
    item.style.marginBottom = '5px';

/** header：定义该变量以承载业务值。 */
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';

/** title：定义该变量以承载业务值。 */
    const title = document.createElement('span');
    title.dataset.gmSuggestionRole = 'title';
    title.style.fontWeight = 'var(--font-weight-strong)';
/** author：定义该变量以承载业务值。 */
    const author = document.createElement('span');
    author.dataset.gmSuggestionRole = 'author';
    author.style.color = '#888';
    author.style.fontSize = '10px';
    header.append(title, author);

/** description：定义该变量以承载业务值。 */
    const description = document.createElement('div');
    description.dataset.gmSuggestionRole = 'description';
    description.style.color = '#aaa';
    description.style.margin = '3px 0';
    description.style.wordBreak = 'break-all';

/** actions：定义该变量以承载业务值。 */
    const actions = document.createElement('div');
    actions.dataset.gmSuggestionRole = 'actions';
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    actions.style.alignItems = 'center';
    actions.style.marginTop = '5px';

/** votes：定义该变量以承载业务值。 */
    const votes = document.createElement('span');
    votes.dataset.gmSuggestionRole = 'votes';
    votes.style.color = '#888';
    actions.appendChild(votes);

    item.append(header, description, actions);
    return item;
  }

/** patchSuggestionItem：执行对应的业务逻辑。 */
  private patchSuggestionItem(item: HTMLElement, suggestion: Suggestion): void {
    item.dataset.gmSuggestionId = suggestion.id;
/** title：定义该变量以承载业务值。 */
    const title = item.querySelector<HTMLElement>('[data-gm-suggestion-role="title"]');
/** author：定义该变量以承载业务值。 */
    const author = item.querySelector<HTMLElement>('[data-gm-suggestion-role="author"]');
/** description：定义该变量以承载业务值。 */
    const description = item.querySelector<HTMLElement>('[data-gm-suggestion-role="description"]');
/** votes：定义该变量以承载业务值。 */
    const votes = item.querySelector<HTMLElement>('[data-gm-suggestion-role="votes"]');
/** actions：定义该变量以承载业务值。 */
    const actions = item.querySelector<HTMLElement>('[data-gm-suggestion-role="actions"]');

    if (title) {
      title.textContent = suggestion.title;
      title.style.color = suggestion.status === 'completed' ? '#0f0' : '#ffcc00';
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
/** removeButton：定义该变量以承载业务值。 */
    let removeButton = actions.querySelector<HTMLButtonElement>('[data-gm-suggest-action="remove"]');
    if (!removeButton) {
      removeButton = this.createSuggestionActionButton('移除', 'remove', '#ff4444');
      actions.appendChild(removeButton);
    }
    removeButton.dataset.id = suggestion.id;
  }

/** setSuggestionPendingAction：执行对应的业务逻辑。 */
  private setSuggestionPendingAction(actions: HTMLElement, suggestion: Suggestion): void {
/** existing：定义该变量以承载业务值。 */
    const existing = actions.querySelector<HTMLButtonElement>('[data-gm-suggest-action="complete"]');
    if (suggestion.status !== 'pending') {
      existing?.remove();
      return;
    }
/** button：定义该变量以承载业务值。 */
    const button = existing ?? this.createSuggestionActionButton('标记完成', 'complete');
    button.dataset.id = suggestion.id;
    if (!existing) {
/** removeButton：定义该变量以承载业务值。 */
      const removeButton = actions.querySelector('[data-gm-suggest-action="remove"]');
      actions.insertBefore(button, removeButton ?? null);
    }
  }

/** createSuggestionActionButton：执行对应的业务逻辑。 */
  private createSuggestionActionButton(label: string, action: 'complete' | 'remove', color?: string): HTMLButtonElement {
/** button：定义该变量以承载业务值。 */
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.gmSuggestAction = action;
    button.style.fontSize = '10px';
    button.style.padding = '1px 4px';
    button.style.cursor = 'pointer';
    if (color) {
      button.style.color = color;
    }
    button.textContent = label;
    return button;
  }

/** syncContainerChildren：执行对应的业务逻辑。 */
  private syncContainerChildren(container: HTMLElement, orderedChildren: HTMLElement[]): void {
/** allowed：定义该变量以承载业务值。 */
    const allowed = new Set(orderedChildren);
    Array.from(container.children).forEach((child) => {
      if (child instanceof HTMLElement && !allowed.has(child)) {
        child.remove();
      }
    });
    orderedChildren.forEach((child, index) => {
/** current：定义该变量以承载业务值。 */
      const current = container.children.item(index);
      if (current !== child) {
        container.insertBefore(child, current ?? null);
      }
    });
  }

  private captureContainerState(container: HTMLElement): { scrollTop: number; focusSelector: string | null } {
    return {
      scrollTop: container.scrollTop,
      focusSelector: this.buildContainedFocusSelector(container),
    };
  }

/** restoreContainerState：执行对应的业务逻辑。 */
  private restoreContainerState(container: HTMLElement, preserved: { scrollTop: number; focusSelector: string | null }): void {
    container.scrollTop = preserved.scrollTop;
    if (!preserved.focusSelector) {
      return;
    }
/** target：定义该变量以承载业务值。 */
    const target = container.querySelector<HTMLElement>(preserved.focusSelector);
    target?.focus({ preventScroll: true });
  }

/** buildContainedFocusSelector：执行对应的业务逻辑。 */
  private buildContainedFocusSelector(container: HTMLElement): string | null {
/** active：定义该变量以承载业务值。 */
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !container.contains(active)) {
      return null;
    }
/** suggestionButton：定义该变量以承载业务值。 */
    const suggestionButton = active.closest<HTMLElement>('[data-gm-suggest-action][data-id]');
    if (suggestionButton && container.contains(suggestionButton)) {
/** action：定义该变量以承载业务值。 */
      const action = suggestionButton.dataset.gmSuggestAction;
/** id：定义该变量以承载业务值。 */
      const id = suggestionButton.dataset.id;
      if (action && id) {
        return `[data-gm-suggest-action="${action}"][data-id="${this.escapeSelectorValue(id)}"]`;
      }
    }
/** playerButton：定义该变量以承载业务值。 */
    const playerButton = active.closest<HTMLElement>('[data-gm-player-id]');
    if (playerButton && container.contains(playerButton)) {
/** id：定义该变量以承载业务值。 */
      const id = playerButton.dataset.gmPlayerId;
      if (id) {
        return `[data-gm-player-id="${this.escapeSelectorValue(id)}"]`;
      }
    }
    return null;
  }

/** escapeSelectorValue：执行对应的业务逻辑。 */
  private escapeSelectorValue(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

/** isActiveElement：执行对应的业务逻辑。 */
  private isActiveElement(element?: Element | null): boolean {
    return Boolean(element && document.activeElement === element);
  }
}

