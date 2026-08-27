import { S2C, type DungeonRunState, type DungeonSettlementView, type S2C_DungeonCatalog } from '@mud/shared';

type DungeonSocket = { on(event: string, listener: (payload: any) => void): unknown };

/** 副本 HUD：只展示服务端状态，支持收起和拖拽，不提供关闭入口。 */
export class DungeonFloatingPanel {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly target: HTMLElement;
  private readonly progressText: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly boss: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossHp: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly collapseButton: HTMLButtonElement;
  private readonly dungeonNames = new Map<string, string>();
  private timer: number | null = null;
  private collapsed = false;
  private dragging = false;
  private dragOffset = { x: 0, y: 0 };

  constructor(documentRef: Document, socket: DungeonSocket) {
    const existing = documentRef.getElementById('dungeon-floating-panel');
    this.root = (existing as HTMLDivElement | null) ?? documentRef.createElement('div');
    this.root.id = 'dungeon-floating-panel';
    this.root.className = 'dungeon-floating-panel';
    this.root.innerHTML = '<div class="dungeon-floating-panel__head"><strong data-dungeon-title>副本</strong><button type="button" aria-expanded="true" aria-label="收起副本进度">−</button></div><div class="dungeon-floating-panel__body"><div class="dungeon-floating-panel__target" data-dungeon-target></div><div class="dungeon-floating-panel__progress-row"><span data-dungeon-progress-text>进度 0%</span><div class="dungeon-floating-panel__bar"><i data-dungeon-progress-fill></i></div></div><div class="dungeon-floating-panel__boss" data-dungeon-boss><div class="dungeon-floating-panel__boss-line"><span data-dungeon-boss-name></span><span data-dungeon-boss-hp></span></div><div class="dungeon-floating-panel__bar dungeon-floating-panel__bar--boss"><i data-dungeon-boss-fill></i></div></div><div class="dungeon-floating-panel__countdown" data-dungeon-countdown></div></div>';
    if (!existing) documentRef.body.appendChild(this.root);
    this.title = this.root.querySelector('[data-dungeon-title]')!;
    this.target = this.root.querySelector('[data-dungeon-target]')!;
    this.progressText = this.root.querySelector('[data-dungeon-progress-text]')!;
    this.progressFill = this.root.querySelector('[data-dungeon-progress-fill]')!;
    this.boss = this.root.querySelector('[data-dungeon-boss]')!;
    this.bossName = this.root.querySelector('[data-dungeon-boss-name]')!;
    this.bossHp = this.root.querySelector('[data-dungeon-boss-hp]')!;
    this.bossFill = this.root.querySelector('[data-dungeon-boss-fill]')!;
    this.countdown = this.root.querySelector('[data-dungeon-countdown]')!;
    this.collapseButton = this.root.querySelector('button')!;
    this.collapseButton.addEventListener('click', () => this.toggleCollapsed());
    const head = this.root.querySelector('.dungeon-floating-panel__head') as HTMLElement;
    head.addEventListener('pointerdown', (event) => this.beginDrag(event));
    head.addEventListener('pointermove', (event) => this.moveDrag(event));
    head.addEventListener('pointerup', () => this.endDrag());
    head.addEventListener('pointercancel', () => this.endDrag());
    socket.on(S2C.DungeonCatalog, (catalog: S2C_DungeonCatalog) => {
      for (const dungeon of catalog.dungeons ?? []) this.dungeonNames.set(dungeon.id, dungeon.name);
      if (catalog.activeRun) this.updateRun(catalog.activeRun);
    });
    socket.on(S2C.DungeonState, ({ run }: { run: DungeonRunState }) => this.updateRun(run));
    socket.on(S2C.DungeonSettlement, ({ settlement }: { settlement: DungeonSettlementView }) => this.showSettlement(settlement));
    this.root.hidden = true;
  }

  private updateRun(run: DungeonRunState): void {
    if (!run || ['failed', 'aborted', 'expired'].includes(run.status)) { this.stop(); return; }
    this.root.hidden = false;
    this.title.textContent = this.dungeonNames.get(run.dungeonId) ?? run.dungeonId;
    this.target.textContent = run.status === 'completed' ? '目标：已击破，前往入口退出' : `目标：${run.bossProgress?.name ?? (run.currentRoomId ? `清理 ${run.currentRoomId}` : '进入战场')}`;
    this.updateProgress(run.progressPercent ?? 0);
    this.updateBoss(run.bossProgress);
    this.countdown.textContent = run.status === 'completed' ? '退出倒计时：30 秒' : '';
    if (run.status === 'completed') this.startCountdown(Date.now() + 30_000); else this.stopTimer();
  }

  private showSettlement(settlement: DungeonSettlementView): void {
    this.root.hidden = false;
    this.title.textContent = this.dungeonNames.get(settlement.dungeonId) ?? settlement.dungeonId;
    this.target.textContent = settlement.status === 'completed' ? '目标：通关' : '目标：副本结束';
    this.updateProgress(settlement.status === 'completed' ? 100 : 0);
    this.updateBoss(undefined);
    this.startCountdown(settlement.completedAt + 30_000);
  }

  private updateProgress(value: number): void {
    const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    this.progressText.textContent = `进度 ${percent}%`;
    this.progressFill.style.width = `${percent}%`;
  }

  private updateBoss(value: DungeonRunState['bossProgress']): void {
    const maxHp = Math.max(1, Number(value?.maxHp) || 1);
    const hp = Math.max(0, Math.min(maxHp, Number(value?.hp) || 0));
    this.boss.hidden = !value;
    if (!value) return;
    this.bossName.textContent = value.name;
    this.bossHp.textContent = `${Math.ceil(hp)} / ${Math.ceil(maxHp)}`;
    this.bossFill.style.width = `${Math.round((hp / maxHp) * 100)}%`;
  }

  private toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    this.root.classList.toggle('is-collapsed', this.collapsed);
    this.collapseButton.textContent = this.collapsed ? '+' : '−';
    this.collapseButton.setAttribute('aria-expanded', String(!this.collapsed));
    this.collapseButton.setAttribute('aria-label', this.collapsed ? '展开副本进度' : '收起副本进度');
  }

  private beginDrag(event: PointerEvent): void {
    if (event.target === this.collapseButton || this.collapsed) return;
    const rect = this.root.getBoundingClientRect();
    this.dragging = true;
    this.dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  private moveDrag(event: PointerEvent): void {
    if (!this.dragging) return;
    const left = Math.max(8, Math.min(window.innerWidth - this.root.offsetWidth - 8, event.clientX - this.dragOffset.x));
    const top = Math.max(8, Math.min(window.innerHeight - this.root.offsetHeight - 8, event.clientY - this.dragOffset.y));
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.right = 'auto';
  }

  private endDrag(): void { this.dragging = false; }
  private startCountdown(deadline: number): void {
    this.stopTimer();
    const render = () => { const remain = Math.max(0, deadline - Date.now()); this.countdown.textContent = remain > 0 ? `退出倒计时：${Math.ceil(remain / 1000)} 秒` : '请尽快到入口附近退出'; if (remain > 0) this.timer = window.setTimeout(render, 250); };
    render();
  }
  private stop(): void { this.stopTimer(); this.root.hidden = true; }
  private stopTimer(): void { if (this.timer !== null) window.clearTimeout(this.timer); this.timer = null; }
}
