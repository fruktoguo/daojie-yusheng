/** 密室使用面板：展示服务端详情，并把时长选择和开启意图交给状态编排层。 */
import {
  calculateTimeChamberActivationCost,
  requiresTimeChamberActivation,
  TIME_CHAMBER_MAX_PASSWORD_LENGTH,
  type TimeChamberUsageDetailView,
} from '@mud/shared';

import { formatDisplayNumber } from '../utils/number';
import { detailModalHost } from './detail-modal-host';
import { renderTradePriceStepControl } from './trade-control-renderers';

const MODAL_OWNER = 'time-chamber-usage';
const MODAL_VARIANT = 'detail-modal--time-chamber';

type TimeChamberUsageCallbacks = {
  onClose(): void;
  onActivate(durationHours: number, accessPassword?: string): void;
  onEnter(accessPassword?: string): void;
};

type TimeChamberPasswordAction =
  | { operation: 'activate'; durationHours: number }
  | { operation: 'enter' };

export class TimeChamberUsageModal {
  private detail: TimeChamberUsageDetailView | null = null;
  private callbacks: TimeChamberUsageCallbacks | null = null;
  private durationHours = 1;
  private pending = false;
  private detailIdentity = '';
  private detailSignature = '';
  private shell: HTMLElement | null = null;
  private passwordAction: TimeChamberPasswordAction | null = null;
  private passwordError = '';

  setCallbacks(callbacks: TimeChamberUsageCallbacks): void {
    this.callbacks = callbacks;
  }

  openPending(): void {
    this.detail = null;
    this.durationHours = 1;
    this.pending = false;
    this.detailIdentity = '';
    this.detailSignature = '';
    this.shell = null;
    this.passwordAction = null;
    this.passwordError = '';
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
    const identity = buildUsageDetailIdentity(detail);
    if (this.detailIdentity !== identity) {
      this.durationHours = detail.minUsageHours;
      this.detailIdentity = identity;
      this.detailSignature = '';
      this.passwordAction = null;
      this.passwordError = '';
    }
    const nextSignature = buildUsageDetailSignature(detail);
    const shell = this.getShell();
    this.detail = detail;
    this.durationHours = clampHours(this.durationHours, detail);
    if (this.passwordAction && detail.passwordProtected && detailModalHost.isOpenFor(MODAL_OWNER)) {
      this.detailSignature = nextSignature;
      detailModalHost.patch({ ownerId: MODAL_OWNER, title: '输入进入密码', subtitle: detail.displayName });
      this.syncPasswordPrompt();
      return;
    }
    if (this.passwordAction && !detail.passwordProtected) {
      this.passwordAction = null;
      this.passwordError = '';
      this.shell = null;
    }
    if (shell && nextSignature === this.detailSignature) return;
    this.detailSignature = nextSignature;
    const subtitle = `${detail.configuredSpeed} 倍 · ${detail.occupancy}/${detail.capacity} 人`;
    if (!detailModalHost.isOpenFor(MODAL_OWNER)) {
      detailModalHost.open(this.buildModalOptions(detail, subtitle));
      return;
    }
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
    if (this.passwordAction) {
      this.syncPasswordPrompt();
      return;
    }
    const shell = this.getShell();
    if (shell) this.syncPending(shell);
  }

  clear(): void {
    this.detail = null;
    this.pending = false;
    this.detailIdentity = '';
    this.detailSignature = '';
    this.shell = null;
    this.passwordAction = null;
    this.passwordError = '';
    detailModalHost.close(MODAL_OWNER);
  }

  isOpen(): boolean {
    return detailModalHost.isOpenFor(MODAL_OWNER);
  }

  showPasswordError(message: string, operation?: TimeChamberPasswordAction['operation']): boolean {
    if (!detailModalHost.isOpenFor(MODAL_OWNER) || !this.detail) return false;
    if (!this.passwordAction) {
      if (operation === 'activate') {
        this.openPasswordPrompt({ operation, durationHours: this.durationHours });
      } else if (operation === 'enter') {
        this.openPasswordPrompt({ operation });
      } else {
        return false;
      }
    }
    this.passwordError = message;
    this.syncPasswordPrompt();
    const input = document.querySelector<HTMLInputElement>('#detail-modal-body input[name="timeChamberPassword"]');
    input?.focus({ preventScroll: true });
    input?.select();
    return true;
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
        this.shell = shell;
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
      if (!requiresTimeChamberActivation(this.detail.configuredSpeed)) return;
      const current = this.durationHours;
      const next = durationAction === 'half'
        ? Math.floor(current / 2)
        : durationAction === 'minus'
          ? current - 1
          : durationAction === 'plus'
            ? current + 1
            : current * 2;
      this.durationHours = clampHours(next, this.detail);
      const shell = this.getShell();
      if (shell) this.patchDuration(shell);
      return;
    }
    if (target.hasAttribute('data-time-chamber-activate')) {
      if (this.detail.active || !requiresTimeChamberActivation(this.detail.configuredSpeed)) return;
      this.requestProtectedAction({ operation: 'activate', durationHours: this.durationHours });
      return;
    }
    if (target.hasAttribute('data-time-chamber-enter')) this.requestProtectedAction({ operation: 'enter' });
  }

  private requestProtectedAction(action: TimeChamberPasswordAction): void {
    if (!this.detail || !this.callbacks) return;
    if (!this.detail.passwordProtected) {
      if (action.operation === 'activate') this.callbacks.onActivate(action.durationHours);
      else this.callbacks.onEnter();
      return;
    }
    this.openPasswordPrompt(action);
  }

  private openPasswordPrompt(action: TimeChamberPasswordAction): void {
    if (!this.detail) return;
    this.passwordAction = action;
    this.passwordError = '';
    this.shell = null;
    detailModalHost.patch({
      ownerId: MODAL_OWNER,
      title: '输入进入密码',
      subtitle: this.detail.displayName,
      renderBody: (body) => body.replaceChildren(buildPasswordPrompt(action)),
      onAfterRender: (body, signal) => {
        const prompt = body.querySelector<HTMLElement>('[data-time-chamber-password-shell]');
        if (!prompt) return;
        prompt.addEventListener('submit', (event) => this.handlePasswordSubmit(event), { signal });
        prompt.addEventListener('click', (event) => this.handlePasswordPromptClick(event), { signal });
        this.syncPasswordPrompt();
        prompt.querySelector<HTMLInputElement>('input[name="timeChamberPassword"]')?.focus();
      },
    });
  }

  private handlePasswordSubmit(event: Event): void {
    event.preventDefault();
    if (!this.passwordAction || !this.callbacks || this.pending) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const input = form.elements.namedItem('timeChamberPassword');
    if (!(input instanceof HTMLInputElement)) return;
    const password = input.value.normalize('NFC');
    if (!password || password.trim().length === 0) {
      this.passwordError = '请输入进入密码';
      this.syncPasswordPrompt();
      input.focus();
      return;
    }
    const action = this.passwordAction;
    this.passwordError = '';
    if (action.operation === 'activate') this.callbacks.onActivate(action.durationHours, password);
    else this.callbacks.onEnter(password);
  }

  private handlePasswordPromptClick(event: Event): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-time-chamber-password-cancel]')
      : null;
    if (!target || this.pending) return;
    this.passwordAction = null;
    this.passwordError = '';
    this.shell = null;
    this.detailSignature = '';
    if (!this.detail) return;
    const subtitle = `${this.detail.configuredSpeed} 倍 · ${this.detail.occupancy}/${this.detail.capacity} 人`;
    detailModalHost.patch(this.buildModalOptions(this.detail, subtitle));
  }

  private syncPasswordPrompt(): void {
    const action = this.passwordAction;
    if (!action) return;
    const prompt = document.querySelector<HTMLElement>('#detail-modal-body [data-time-chamber-password-shell]');
    if (!prompt) return;
    const input = prompt.querySelector<HTMLInputElement>('input[name="timeChamberPassword"]');
    const submit = prompt.querySelector<HTMLButtonElement>('[data-time-chamber-password-submit]');
    const cancel = prompt.querySelector<HTMLButtonElement>('[data-time-chamber-password-cancel]');
    const error = prompt.querySelector<HTMLElement>('[data-time-chamber-password-error]');
    if (input) input.disabled = this.pending;
    if (submit) {
      submit.disabled = this.pending;
      submit.textContent = this.pending
        ? '验证中…'
        : action.operation === 'activate' ? '确认开启并进入' : '确认进入';
    }
    if (cancel) cancel.disabled = this.pending;
    if (error) {
      error.textContent = this.passwordError;
      error.hidden = !this.passwordError;
    }
  }

  private patchDuration(shell: HTMLElement): void {
    if (!this.detail) return;
    const durationValue = shell.querySelector<HTMLElement>('[data-time-chamber-field="duration"] strong');
    if (durationValue) durationValue.textContent = `${this.durationHours} 小时`;
    const total = calculateTimeChamberActivationCost(
      this.detail.configuredSpeed,
      this.detail.capacity,
      this.durationHours,
      this.detail.sizeTier,
    );
    setField(shell, 'total', `${formatDisplayNumber(total)} 灵石`);
    for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-time-chamber-duration-action]')) {
      const action = button.dataset.timeChamberDurationAction;
      const atMin = this.durationHours <= this.detail.minUsageHours;
      const atMax = this.durationHours >= this.detail.maxUsageHours;
      button.disabled = this.pending
        || this.detail.active
        || !requiresTimeChamberActivation(this.detail.configuredSpeed)
        || ((action === 'half' || action === 'minus') ? atMin : atMax);
    }
  }

  private syncPending(shell: HTMLElement): void {
    const activationRequired = this.detail ? requiresTimeChamberActivation(this.detail.configuredSpeed) : true;
    const entryAvailable = this.detail?.active === true || (this.detail !== null && !activationRequired);
    const activateButton = shell.querySelector<HTMLButtonElement>('[data-time-chamber-activate]');
    if (activateButton) {
      activateButton.hidden = this.detail?.active === true || !activationRequired;
      activateButton.disabled = this.pending || this.detail?.active === true || !activationRequired;
      activateButton.textContent = this.pending ? '处理中…' : '支付并开启';
    }
    const enterButton = shell.querySelector<HTMLButtonElement>('[data-time-chamber-enter]');
    if (enterButton) {
      enterButton.hidden = !entryAvailable;
      enterButton.disabled = this.pending || !entryAvailable;
      enterButton.textContent = this.pending ? '处理中…' : '进入密室';
    }
    this.patchDuration(shell);
  }

  private getShell(): HTMLElement | null {
    if (!detailModalHost.isOpenFor(MODAL_OWNER)) return null;
    if (this.shell?.isConnected) return this.shell;
    this.shell = document.querySelector<HTMLElement>('#detail-modal-body [data-time-chamber-usage-shell]');
    return this.shell;
  }
}

function buildPasswordPrompt(action: TimeChamberPasswordAction): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'time-chamber-password-prompt';
  form.dataset.timeChamberPasswordShell = 'true';
  const label = document.createElement('label');
  label.className = 'time-chamber-setting-field';
  const caption = document.createElement('span');
  caption.textContent = '进入密码';
  const input = document.createElement('input');
  input.className = 'ui-input';
  input.type = 'password';
  input.name = 'timeChamberPassword';
  input.autocomplete = 'current-password';
  input.maxLength = TIME_CHAMBER_MAX_PASSWORD_LENGTH;
  input.required = true;
  label.append(caption, input);
  const error = document.createElement('p');
  error.className = 'time-chamber-password-error';
  error.dataset.timeChamberPasswordError = 'true';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'time-chamber-password-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'small-btn ghost';
  cancel.dataset.timeChamberPasswordCancel = 'true';
  cancel.textContent = '取消';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'small-btn';
  submit.dataset.timeChamberPasswordSubmit = 'true';
  submit.textContent = action.operation === 'activate' ? '确认开启并进入' : '确认进入';
  actions.append(cancel, submit);
  form.append(label, error, actions);
  return form;
}

function buildUsageShell(detail: TimeChamberUsageDetailView, durationHours: number): HTMLElement {
  const activationRequired = requiresTimeChamberActivation(detail.configuredSpeed);
  const entryAvailable = detail.active || !activationRequired;
  const shell = document.createElement('div');
  shell.className = 'time-chamber-console time-chamber-usage';
  shell.dataset.timeChamberUsageShell = 'true';

  const metrics = document.createElement('section');
  metrics.className = 'time-chamber-metrics';
  metrics.append(
    buildMetric('时间流速', 'speed'),
    buildMetric('当前人数', 'users'),
    buildMetric('开启成本', 'cost'),
    buildMetric('密室状态', 'status'),
  );

  const purchase = document.createElement('section');
  purchase.className = 'time-chamber-purchase';
  purchase.dataset.timeChamberPurchase = 'true';
  const heading = document.createElement('h3');
  heading.dataset.timeChamberPurchaseOnly = 'true';
  heading.textContent = '开启时长';
  const durationControl = document.createElement('div');
  durationControl.className = 'time-chamber-duration-control';
  durationControl.dataset.timeChamberPurchaseOnly = 'true';
  durationControl.innerHTML = renderTradePriceStepControl({
    value: `${durationHours} 小时`,
    currencyName: '开启时长',
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
  totalLabel.dataset.timeChamberPurchaseOnly = 'true';
  totalLabel.textContent = '合计';
  const total = document.createElement('strong');
  total.dataset.timeChamberField = 'total';
  total.dataset.timeChamberPurchaseOnly = 'true';
  const actions = document.createElement('div');
  actions.className = 'time-chamber-checkout-actions';
  const enter = document.createElement('button');
  enter.type = 'button';
  enter.className = 'small-btn ghost';
  enter.dataset.timeChamberEnter = 'true';
  enter.hidden = !entryAvailable;
  enter.textContent = '进入密室';
  const activate = document.createElement('button');
  activate.type = 'button';
  activate.className = 'small-btn';
  activate.dataset.timeChamberActivate = 'true';
  activate.hidden = detail.active || !activationRequired;
  activate.textContent = '支付并开启';
  actions.append(enter, activate);
  checkout.append(totalLabel, total, actions);
  purchase.append(heading, durationControl, checkout);

  const details = document.createElement('dl');
  details.className = 'time-chamber-detail-list';
  details.append(
    buildDetailRow('空间', 'space'),
    buildDetailRow('进入限制', 'access'),
    buildDetailRow('本轮运行至', 'active-until'),
  );
  shell.append(metrics, purchase, details);
  patchUsageFields(shell, detail);
  setField(shell, 'total', `${formatDisplayNumber(calculateTimeChamberActivationCost(
    detail.configuredSpeed,
    detail.capacity,
    durationHours,
    detail.sizeTier,
  ))} 灵石`);
  return shell;
}

function patchUsageFields(shell: HTMLElement, detail: TimeChamberUsageDetailView): void {
  const activationRequired = requiresTimeChamberActivation(detail.configuredSpeed);
  const entryAvailable = detail.active || !activationRequired;
  setField(shell, 'speed', detail.configuredSpeed === detail.effectiveSpeed
    ? `${detail.effectiveSpeed} 倍`
    : `设定 ${detail.configuredSpeed} 倍 / 当前 ${detail.effectiveSpeed} 倍`);
  setField(shell, 'users', `${detail.occupancy}/${detail.capacity} 人`);
  setField(shell, 'cost', `${formatDisplayNumber(detail.activationCostSpiritStonesPerHour)} 灵石/小时`);
  setField(shell, 'status', detail.active ? '已开启' : activationRequired ? '未开启' : '常驻开放');
  setField(shell, 'space', `${detail.width}×${detail.height}`);
  setField(shell, 'access', detail.passwordProtected ? '需要密码' : '公开进入');
  setField(shell, 'active-until', detail.activeUntil
    ? formatDateTime(detail.activeUntil)
    : activationRequired ? '当前未激活' : '无需开启时段');
  for (const element of shell.querySelectorAll<HTMLElement>('[data-time-chamber-purchase-only]')) {
    element.hidden = detail.active || !activationRequired;
  }
  const enter = shell.querySelector<HTMLButtonElement>('[data-time-chamber-enter]');
  if (enter) enter.hidden = !entryAvailable;
  const activate = shell.querySelector<HTMLButtonElement>('[data-time-chamber-activate]');
  if (activate) activate.hidden = detail.active || !activationRequired;
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

function buildUsageDetailIdentity(detail: TimeChamberUsageDetailView): string {
  return `${detail.sourceInstanceId}\u0000${detail.buildingId}\u0000${detail.chamberInstanceId}`;
}

function buildUsageDetailSignature(detail: TimeChamberUsageDetailView): string {
  return [
    detail.displayName,
    detail.sizeTier,
    detail.width,
    detail.height,
    detail.capacity,
    detail.occupancy,
    detail.configuredSpeed,
    detail.effectiveSpeed,
    detail.active,
    detail.activeUntil ?? '',
    detail.passwordProtected,
    detail.revision,
    detail.activationCostSpiritStonesPerHour,
    detail.minUsageHours,
    detail.maxUsageHours,
  ].join('\u0000');
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
