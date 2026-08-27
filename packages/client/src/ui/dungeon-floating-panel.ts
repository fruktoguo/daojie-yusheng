import { S2C, type DungeonRunState, type DungeonSettlementView } from '@mud/shared';

type DungeonSocket = { on(event: string, listener: (payload: any) => void): unknown };

/** 副本流程 HUD：只消费服务端状态，倒计时为结算展示的本地投影。 */
export class DungeonFloatingPanel {
  private readonly root: HTMLDivElement;
  private readonly phase: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly progress: HTMLElement;
  private timer: number | null = null;
  private hiddenByUser = false;

  constructor(documentRef: Document, socket: DungeonSocket) {
    const existing = documentRef.getElementById('dungeon-floating-panel');
    this.root = (existing as HTMLDivElement | null) ?? documentRef.createElement('div');
    this.root.id = 'dungeon-floating-panel';
    this.root.className = 'dungeon-floating-panel';
    this.root.innerHTML = '<div class="dungeon-floating-panel__head"><strong>副本进度</strong><button type="button" aria-label="隐藏副本进度">×</button></div><div class="dungeon-floating-panel__body"><div class="dungeon-floating-panel__phase"></div><div class="dungeon-floating-panel__objective"></div><div class="dungeon-floating-panel__progress"></div><div class="dungeon-floating-panel__countdown"></div></div>';
    if (!existing) documentRef.body.appendChild(this.root);
    this.phase = this.root.querySelector('.dungeon-floating-panel__phase')!;
    this.objective = this.root.querySelector('.dungeon-floating-panel__objective')!;
    this.progress = this.root.querySelector('.dungeon-floating-panel__progress')!;
    this.countdown = this.root.querySelector('.dungeon-floating-panel__countdown')!;
    this.root.querySelector('button')?.addEventListener('click', () => {
      this.hiddenByUser = true;
      this.root.hidden = true;
    });
    socket.on(S2C.DungeonState, ({ run }: { run: DungeonRunState }) => this.updateRun(run));
    socket.on(S2C.DungeonSettlement, ({ settlement }: { settlement: DungeonSettlementView }) => this.showSettlement(settlement));
  }

  private updateRun(run: DungeonRunState): void {
    if (!run || ['failed', 'aborted', 'expired'].includes(run.status)) {
      this.stop();
      return;
    }
    this.hiddenByUser = false;
    this.root.hidden = false;
    this.phase.textContent = run.status === 'completed' ? '已通关' : '挑战进行中';
    this.objective.textContent = run.status === 'completed'
      ? '请前往副本入口附近退出'
      : `当前房间：${run.currentRoomId ?? '准备中'}`;
    this.progress.textContent = run.status === 'completed'
      ? '所有目标已完成'
      : (run.currentWaveIndex === undefined ? '目标：击败本房间守关者' : `当前波次：第 ${run.currentWaveIndex + 1} 波`);
    this.countdown.textContent = run.status === 'completed' ? '结算倒计时：30 秒' : '队伍成员可随时断线重连，流程不会暂停';
    if (run.status === 'completed') this.startCountdown(Date.now() + 30_000);
    else this.stopTimer();
  }

  private showSettlement(settlement: DungeonSettlementView): void {
    this.hiddenByUser = false;
    this.root.hidden = false;
    this.phase.textContent = settlement.status === 'completed' ? '已通关' : '副本结束';
    this.objective.textContent = '结算已生成';
    this.progress.textContent = `完成编号：${settlement.completionId}`;
    this.startCountdown(settlement.completedAt + 30_000);
  }

  private startCountdown(deadline: number): void {
    this.stopTimer();
    const render = () => {
      const remain = Math.max(0, deadline - Date.now());
      this.countdown.textContent = remain > 0 ? `退出倒计时：${Math.ceil(remain / 1000)} 秒` : '请尽快到入口附近退出';
      if (remain > 0) this.timer = window.setTimeout(render, 250);
    };
    render();
  }

  private stop(): void {
    this.stopTimer();
    this.root.hidden = true;
  }

  private stopTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }
}
