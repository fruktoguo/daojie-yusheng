/**
 * GM 管理面板
 * 提供服务端性能监控、在线玩家列表、玩家编辑、机器人控制与意见管理
 */

import { C2S_GmUpdatePlayer, GmPlayerSummary, S2C_GmState, Suggestion } from '@mud/shared';

interface GmCallbacks {
  onRefresh: () => void;
  onResetSelf: () => void;
  onCycleZoom: () => void;
  onSpawnBots: (count: number) => void;
  onRemoveBots: (playerIds?: string[], all?: boolean) => void;
  onUpdatePlayer: (payload: C2S_GmUpdatePlayer) => void;
  onResetPlayer: (playerId: string) => void;
  onMarkSuggestionCompleted: (id: string) => void;
  onRemoveSuggestion: (id: string) => void;
}

function createEmptyGmState(): S2C_GmState {
  return {
    players: [],
    mapIds: [],
    botCount: 0,
    perf: {
      cpuPercent: 0,
      memoryMb: 0,
      tickMs: 0,
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

export class GmPanel {
  private pane = document.getElementById('pane-gm')!;
  private state: S2C_GmState = createEmptyGmState();
  private suggestions: Suggestion[] = [];
  private selectedPlayerId: string | null = null;
  private callbacks: GmCallbacks | null = null;
  private initialized = false;

  private perfCpuEl: HTMLElement | null = null;
  private perfMemoryEl: HTMLElement | null = null;
  private perfTickEl: HTMLElement | null = null;
  private playerCountEl: HTMLElement | null = null;
  private botsDisplayEl: HTMLElement | null = null;
  private playerListEl: HTMLElement | null = null;
  private detailFormEl: HTMLElement | null = null;
  private detailEmptyEl: HTMLElement | null = null;
  private suggestionListEl: HTMLElement | null = null;

  private mapSelect: HTMLSelectElement | null = null;
  private xInput: HTMLInputElement | null = null;
  private yInput: HTMLInputElement | null = null;
  private hpInput: HTMLInputElement | null = null;
  private autoBattleCheckbox: HTMLInputElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private healBtn: HTMLButtonElement | null = null;
  private resetBtn: HTMLButtonElement | null = null;
  private removeBtn: HTMLButtonElement | null = null;
  private botCountInput: HTMLInputElement | null = null;

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

  updateSuggestionsData(suggestions: Suggestion[]) {
    this.suggestions = suggestions;
    this.updateSuggestions();
  }

  private updateSuggestions() {
    if (!this.suggestionListEl) return;
    
    if (this.suggestions.length === 0) {
      this.suggestionListEl.innerHTML = '<div style="color:#666; padding:10px; text-align:center;">暂无意见收集</div>';
      return;
    }

    this.suggestionListEl.innerHTML = this.suggestions
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(s => `
        <div style="border-bottom:1px solid #333; padding:5px; margin-bottom:5px;">
          <div style="display:flex; justify-content:space-between;">
            <span style="font-weight:bold; color:${s.status === 'completed' ? '#0f0' : '#ffcc00'}">${s.title}</span>
            <span style="color:#888; font-size:10px;">${s.authorName}</span>
          </div>
          <div style="color:#aaa; margin:3px 0; word-break:break-all;">${s.description}</div>
          <div style="display:flex; gap:10px; align-items:center; margin-top:5px;">
            <span style="color:#888;">👍${s.upvotes.length} 👎${s.downvotes.length}</span>
            ${s.status === 'pending' ? `<button class="gm-suggest-complete" data-id="${s.id}" style="font-size:10px; padding:1px 4px; cursor:pointer;">标记完成</button>` : ''}
            <button class="gm-suggest-remove" data-id="${s.id}" style="font-size:10px; padding:1px 4px; color:#ff4444; cursor:pointer;">移除</button>
          </div>
        </div>
      `).join('');

    this.suggestionListEl.querySelectorAll('.gm-suggest-complete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) this.callbacks?.onMarkSuggestionCompleted(id);
      });
    });

    this.suggestionListEl.querySelectorAll('.gm-suggest-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id && confirm('确定移除这条意见吗？')) {
          this.callbacks?.onRemoveSuggestion(id);
        }
      });
    });
  }

  clear(): void {
    this.state = createEmptyGmState();
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
    this.mapSelect = null;
    this.xInput = null;
    this.yInput = null;
    this.hpInput = null;
    this.autoBattleCheckbox = null;
    this.saveBtn = null;
    this.healBtn = null;
    this.resetBtn = null;
    this.removeBtn = null;
    this.botCountInput = null;
    this.pane.innerHTML = '<div class="empty-hint">暂无 GM 数据</div>';
  }

  private ensureLayout(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.pane.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-title">服务端性能</div>
        <div class="panel-row"><span class="panel-label">CPU 压力</span><span class="panel-value" data-gm-perf-cpu>0%</span></div>
        <div class="panel-row"><span class="panel-label">内存占用</span><span class="panel-value" data-gm-perf-memory>0 MB</span></div>
        <div class="panel-row"><span class="panel-label">单息耗时</span><span class="panel-value" data-gm-perf-tick>0 ms</span></div>
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

    this.saveBtn?.addEventListener('click', () => this.handleSave());
    this.healBtn?.addEventListener('click', () => this.handleHeal());
    this.resetBtn?.addEventListener('click', () => this.handleReset());
    this.removeBtn?.addEventListener('click', () => this.handleRemove());
  }

  private updatePerformance(): void {
    if (!this.perfCpuEl || !this.perfMemoryEl || !this.perfTickEl) return;
    this.perfCpuEl.textContent = `${Math.round(this.state.perf.cpuPercent)}%`;
    this.perfMemoryEl.textContent = `${Math.round(this.state.perf.memoryMb)} MB`;
    this.perfTickEl.textContent = `${Math.round(this.state.perf.tickMs)} ms`;
  }

  private updateOverview(): void {
    if (this.playerCountEl) {
      this.playerCountEl.textContent = `${this.state.players.length}`;
    }
    if (this.botsDisplayEl) {
      this.botsDisplayEl.textContent = `${this.state.botCount}`;
    }
  }

  private updatePlayerList(): void {
    if (!this.playerListEl) return;
    if (this.state.players.length === 0) {
      this.playerListEl.innerHTML = '<div class="empty-hint">当前没有在线玩家</div>';
      return;
    }
    this.playerListEl.innerHTML = this.state.players.map((player) => `
      <button class="gm-player-row ${player.id === this.selectedPlayerId ? 'active' : ''}" data-gm-player-id="${player.id}">
        <div>
          <div class="gm-player-name">${player.name}</div>
          <div class="gm-player-meta">${player.isBot ? '机器人' : '真人'} · ${player.mapId} · (${player.x}, ${player.y})</div>
        </div>
        <div class="gm-player-stat">${player.hp}/${player.maxHp}</div>
      </button>
    `).join('');
  }

  private updateDetail(): void {
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

  private updateDetailFields(selected: GmPlayerSummary): void {
    if (this.mapSelect && !this.isActiveElement(this.mapSelect)) {
      const maps = this.state.mapIds.map((mapId) => ` <option value="${mapId}">${mapId}</option>`).join('');
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

  private setDetailVisibility(visible: boolean): void {
    if (this.detailFormEl) {
      (this.detailFormEl as HTMLElement).style.display = visible ? '' : 'none';
    }
    if (this.detailEmptyEl) {
      (this.detailEmptyEl as HTMLElement).style.display = visible ? 'none' : '';
    }
  }

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

  private getSelectedPlayer(): GmPlayerSummary | null {
    if (!this.selectedPlayerId) return null;
    return this.state.players.find((player) => player.id === this.selectedPlayerId) ?? null;
  }

  private handlePlayerSelect(id: string): void {
    if (this.selectedPlayerId === id) return;
    this.selectedPlayerId = id;
    this.updatePlayerList();
    this.updateDetail();
  }

  private handleSave(): void {
    const player = this.getSelectedPlayer();
    if (!player) return;
    const mapId = this.mapSelect?.value ?? player.mapId;
    const x = Number(this.xInput?.value ?? player.x);
    const y = Number(this.yInput?.value ?? player.y);
    const hp = Number(this.hpInput?.value ?? player.hp);
    const autoBattle = Boolean(this.autoBattleCheckbox?.checked ?? player.autoBattle);
    this.callbacks?.onUpdatePlayer({ playerId: player.id, mapId, x, y, hp, autoBattle });
  }

  private handleHeal(): void {
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

  private handleReset(): void {
    const player = this.getSelectedPlayer();
    if (!player) return;
    this.callbacks?.onResetPlayer(player.id);
  }

  private handleRemove(): void {
    const player = this.getSelectedPlayer();
    if (!player || !player.isBot) return;
    this.callbacks?.onRemoveBots([player.id], false);
  }

  private isActiveElement(element?: Element | null): boolean {
    return Boolean(element && document.activeElement === element);
  }
}
