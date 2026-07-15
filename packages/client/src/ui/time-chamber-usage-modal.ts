/** 密室使用面板：展示服务端详情，并把时长选择和开启意图交给状态编排层。 */
import {
  calculateTimeChamberUsageFee,
  type TimeChamberUsageDetailView,
} from '@mud/shared';

import { formatDisplayNumber } from '../utils/number';
import { detailModalHost } from './detail-modal-host';
import { renderTradePriceStepControl } from './trade-control-renderers';

const MODAL_OWNER = 'time-chamber-usage';
const MODAL_VARIANT = 'detail-modal--time-chamber';

type TimeChamberUsageCallbacks = {
  onClose(): void;
  onActivate(durationHours: number): void;
  onEnter(): void;
};

export class TimeChamberUsageModal {
  private detail: TimeChamberUsageDetailView | null = null;
  private callbacks: TimeChamberUsageCallbacks | null = null;
  private durationHours = 1;
  private pending = false;

  setCallbacks(callbacks: TimeChamberUsageCallbacks): void {
    this.callbacks = callbacks;
  }

  openPending(): void {
    this.detail = null;
    this.durationHours = 1;
    this.pending = false;
    detailModalHost.open({
      ownerId: MODAL_OWNER,
      variantClass: MODAL_VARIANT,
      title: '开启密室',
      size: 'md',
      subtitle: '正在读取密室状态…',
      onClose: () => this.callbacks?.onClose(),
      renderBody: (body) => {
        const loading = document.createElement('div');
        loading.className = 'time-chamber-loading';
        loading.textContent = '正在读取密室信息…';
        body.replaceChildren(loading);
      },
    });
  }

  showDetail(detail: TimeChamberUsageDetailView): void {
    this.detail = detail;
    this.durationHours = clampHours(this.durationHours, detail);
    const subtitle = `${detail.configuredSpeed} 倍 · ${detail.activeUsageCount}/${detail.capacity} 人`;
    if (!detailModalHost.isOpenFor(MODAL_OWNER)) {
      detailModalHost.open(this.buildModalOptions(detail, subtitle));
      return;
    }
    const shell = document.querySelector<HTMLElement>('#detail-modal-body [data-time-chamber-usage-shell]');
    if (!shell) {
      detailModalHost.patch(this.buildModalOptions(detail, subtitle));
      return;
    }
    detailModalHost.patch({ ownerId: MODAL_OWNER, title: detail.displayName, subtitle });
    patchUsageFields(shell, detail);
    this.patchDuration(shell);
    this.syncPending(shell);
  }

  setPending(pending: boolean): void {
    this.pending = pending;
    const shell = document.querySelector<HTMLElement>('#detail-modal-body [data-time-chamber-usage-shell]');
    if (shell && detailModalHost.isOpenFor(MODAL_OWNER)) this.syncPending(shell);
  }

  clear(): void {
    this.detail = null;
    this.pending = false;
    detailModalHost.close(MODAL_OWNER);
  }

  isOpen(): boolean {
    return detailModalHost.isOpenFor(MODAL_OWNER);
  }

  private buildModalOptions(detail: TimeChamberUsageDetailView, subtitle: string) {
    return {
      ownerId: MODAL_OWNER,
      variantClass: MODAL_VARIANT,
      title: detail.displayName,
      size: 'md' as const,
      subtitle,
      onClose: () => this.callbacks?.onClose(),
      renderBody: (body: HTMLElement) => body.replaceChildren(buildUsageShell(detail, this.durationHours)),
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
        const shell = body.querySelector<HTMLElement>('[data-time-chamber-usage-shell]');
        if (!shell) return;
        shell.addEventListener('click', (event) => this.handleClick(event), { signal });
        this.syncPending(shell);
      },
    };
  }

  private handleClick(event: Event): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-time-chamber-duration-action], [data-time-chamber-activate], [data-time-chamber-enter]')
      : null;
    if (!target || !this.detail || this.pending) return;
    const durationAction = target.dataset.timeChamberDurationAction;
    if (durationAction) {
      const current = this.durationHours;
      const next = durationAction === 'half'
        ? Math.floor(current / 2)
        : durationAction === 'minus'
          ? current - 1
          : durationAction === 'plus'
            ? current + 1
            : current * 2;
      this.durationHours = clampHours(next, this.detail);
      const shell = document.querySelector<HTMLElement>('#detail-modal-body [data-time-chamber-usage-shell]');
      if (shell) this.patchDuration(shell);
      return;
    }
    if (target.hasAttribute('data-time-chamber-activate')) {
      this.callbacks?.onActivate(this.durationHours);
      return;
    }
    if (target.hasAttribute('data-time-chamber-enter')) this.callbacks?.onEnter();
  }

  private patchDuration(shell: HTMLElement): void {
    if (!this.detail) return;
    const durationValue = shell.querySelector<HTMLElement>('[data-time-chamber-field="duration"] strong');
    if (durationValue) durationValue.textContent = `${this.durationHours} 小时`;
    const total = calculateTimeChamberUsageFee(this.detail.usageFeePerHour, this.durationHours);
    setField(shell, 'total', `${formatDisplayNumber(total)} 灵石`);
    for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-time-chamber-duration-action]')) {
      const action = button.dataset.timeChamberDurationAction;
      const atMin = this.durationHours <= this.detail.minUsageHours;
      const atMax = this.durationHours >= this.detail.maxUsageHours;
      button.disabled = this.pending || ((action === 'half' || action === 'minus') ? atMin : atMax);
    }
  }

  private syncPending(shell: HTMLElement): void {
    const activateButton = shell.querySelector<HTMLButtonElement>('[data-time-chamber-activate]');
    if (activateButton) {
      activateButton.disabled = this.pending;
      activateButton.textContent = this.pending
        ? '处理中…'
        : this.detail?.playerLeaseExpiresAt
          ? '续期并进入'
          : '支付并开启';
    }
    const enterButton = shell.querySelector<HTMLButtonElement>('[data-time-chamber-enter]');
    if (enterButton) {
      enterButton.hidden = !this.detail?.playerLeaseExpiresAt;
      enterButton.disabled = this.pending || !this.detail?.playerLeaseExpiresAt;
      enterButton.textContent = this.pending ? '处理中…' : '进入密室';
    }
    this.patchDuration(shell);
  }
}

function buildUsageShell(detail: TimeChamberUsageDetailView, durationHours: number): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'time-chamber-console time-chamber-usage';
  shell.dataset.timeChamberUsageShell = 'true';

  const metrics = document.createElement('section');
  metrics.className = 'time-chamber-metrics';
  metrics.append(
    buildMetric('时间流速', 'speed'),
    buildMetric('使用人数', 'users'),
    buildMetric('每小时收费', 'fee'),
    buildMetric('我的时段', 'lease'),
  );

  const purchase = document.createElement('section');
  purchase.className = 'time-chamber-purchase';
  const heading = document.createElement('h3');
  heading.textContent = '使用时长';
  const durationControl = document.createElement('div');
  durationControl.className = 'time-chamber-duration-control';
  durationControl.innerHTML = renderTradePriceStepControl({
    value: `${durationHours} 小时`,
    currencyName: '使用时长',
    displayAttrs: { 'data-time-chamber-field': 'duration' },
    leftButtons: [
      { label: '÷2', attrs: { 'data-time-chamber-duration-action': 'half', title: '时长减半' } },
      { label: '-1', attrs: { 'data-time-chamber-duration-action': 'minus', title: '减少一小时' } },
    ],
    rightButtons: [
      { label: '+1', attrs: { 'data-time-chamber-duration-action': 'plus', title: '增加一小时' } },
      { label: '×2', attrs: { 'data-time-chamber-duration-action': 'double', title: '时长翻倍' } },
    ],
  });
  const checkout = document.createElement('div');
  checkout.className = 'time-chamber-checkout';
  const totalLabel = document.createElement('span');
  totalLabel.textContent = '合计';
  const total = document.createElement('strong');
  total.dataset.timeChamberField = 'total';
  const actions = document.createElement('div');
  actions.className = 'time-chamber-checkout-actions';
  const enter = document.createElement('button');
  enter.type = 'button';
  enter.className = 'small-btn ghost';
  enter.dataset.timeChamberEnter = 'true';
  enter.hidden = !detail.playerLeaseExpiresAt;
  enter.textContent = '进入密室';
  const activate = document.createElement('button');
  activate.type = 'button';
  activate.className = 'small-btn';
  activate.dataset.timeChamberActivate = 'true';
  activate.textContent = detail.playerLeaseExpiresAt ? '续期并进入' : '支付并开启';
  actions.append(enter, activate);
  checkout.append(totalLabel, total, actions);
  purchase.append(heading, durationControl, checkout);

  const details = document.createElement('dl');
  details.className = 'time-chamber-detail-list';
  details.append(
    buildDetailRow('空间', 'space'),
    buildDetailRow('本轮运行至', 'active-until'),
  );
  shell.append(metrics, purchase, details);
  patchUsageFields(shell, detail);
  setField(shell, 'total', `${formatDisplayNumber(calculateTimeChamberUsageFee(detail.usageFeePerHour, durationHours))} 灵石`);
  return shell;
}

function patchUsageFields(shell: HTMLElement, detail: TimeChamberUsageDetailView): void {
  setField(shell, 'speed', detail.configuredSpeed === detail.effectiveSpeed
    ? `${detail.effectiveSpeed} 倍`
    : `设定 ${detail.configuredSpeed} 倍 / 当前 ${detail.effectiveSpeed} 倍`);
  setField(shell, 'users', `${detail.activeUsageCount}/${detail.capacity} 人`);
  setField(shell, 'fee', detail.ownerUsageFree ? '建造者免费' : `${formatDisplayNumber(detail.usageFeePerHour)} 灵石`);
  setField(shell, 'lease', detail.playerLeaseExpiresAt ? formatDateTime(detail.playerLeaseExpiresAt) : '未开启');
  setField(shell, 'space', `${detail.width}×${detail.height}`);
  setField(shell, 'active-until', detail.activeUntil ? formatDateTime(detail.activeUntil) : '当前未激活');
  const enter = shell.querySelector<HTMLButtonElement>('[data-time-chamber-enter]');
  if (enter) enter.hidden = !detail.playerLeaseExpiresAt;
}

function buildMetric(labelText: string, field: string): HTMLElement {
  const metric = document.createElement('article');
  metric.className = 'time-chamber-metric';
  const label = document.createElement('span');
  label.className = 'time-chamber-metric-label';
  label.textContent = labelText;
  const value = document.createElement('strong');
  value.className = 'time-chamber-metric-value';
  value.dataset.timeChamberField = field;
  metric.append(label, value);
  return metric;
}

function buildDetailRow(labelText: string, field: string): HTMLElement {
  const row = document.createElement('div');
  const label = document.createElement('dt');
  label.textContent = labelText;
  const value = document.createElement('dd');
  value.dataset.timeChamberField = field;
  row.append(label, value);
  return row;
}

function setField(shell: HTMLElement, name: string, value: string): void {
  const element = shell.querySelector<HTMLElement>(`[data-time-chamber-field="${name}"]`);
  if (element && element.textContent !== value) element.textContent = value;
}

function clampHours(value: number, detail: TimeChamberUsageDetailView): number {
  return Math.max(detail.minUsageHours, Math.min(detail.maxUsageHours, Math.trunc(Number(value) || detail.minUsageHours)));
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}
