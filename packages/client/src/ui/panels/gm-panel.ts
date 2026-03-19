import { C2S_GmUpdatePlayer, GmPlayerSummary, S2C_GmState } from '@mud/shared';

interface GmCallbacks {
  onRefresh: () => void;
  onResetSelf: () => void;
  onCycleZoom: () => void;
  onSpawnBots: (count: number) => void;
  onRemoveBots: (playerIds?: string[], all?: boolean) => void;
  onUpdatePlayer: (payload: C2S_GmUpdatePlayer) => void;
  onResetPlayer: (playerId: string) => void;
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
    },
  };
}

export class GmPanel {
  private pane = document.getElementById('pane-gm')!;
  private state: S2C_GmState = createEmptyGmState();
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
        <div class="panel-row"><span class="panel-label">Tick 耗时</span><span class="panel-value" data-gm-perf-tick>0 ms</span></div>
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
    `;

    this.perfCpuEl = this.pane.querySelector('[data-gm-perf-cpu]');
    this.perfMemoryEl = this.pane.querySelector('[data-gm-perf-memory]');
    this.perfTickEl = this.pane.querySelector('[data-gm-perf-tick]');
    this.playerCountEl = this.pane.querySelector('[data-gm-player-count]');
    this.botsDisplayEl = this.pane.querySelector('[data-gm-bot-count]');
    this.playerListEl = this.pane.querySelector('[data-gm-player-list]');
    this.detailFormEl = this.pane.querySelector('[data-gm-detail-form]');
    this.detailEmptyEl = this.pane.querySelector('[data-gm-detail-empty]');
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
