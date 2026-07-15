/** 密室管理面板：只渲染服务端投影并发送经营配置意图。 */
import type {
  TimeChamberManagementDetailView,
  TimeChamberOperationKind,
  TimeChamberSizeTier,
} from '@mud/shared';

import { formatDisplayNumber } from '../utils/number';
import { detailModalHost } from './detail-modal-host';

const MODAL_OWNER = 'time-chamber-management';
const MODAL_VARIANT = 'detail-modal--time-chamber';

type TimeChamberSettingsDraft = {
  name: string;
  hourlyFee: number;
  speed: number;
  capacity: number;
};

type TimeChamberConsoleCallbacks = {
  onClose(): void;
  onSaveSettings(settings: TimeChamberSettingsDraft): void;
  onDeposit(spiritStoneCount: number): void;
  onClaimRevenue(spiritStoneCount: number): void;
  onResize(sizeTier: TimeChamberSizeTier): void;
};

export class TimeChamberConsoleModal {
  private detail: TimeChamberManagementDetailView | null = null;
  private callbacks: TimeChamberConsoleCallbacks | null = null;
  private readonly pendingOperations = new Set<TimeChamberOperationKind>();

  setCallbacks(callbacks: TimeChamberConsoleCallbacks): void {
    this.callbacks = callbacks;
  }

  openPending(): void {
    this.detail = null;
    this.pendingOperations.clear();
    detailModalHost.open({
      ownerId: MODAL_OWNER,
      variantClass: MODAL_VARIANT,
      title: '管理密室',
      size: 'md',
      subtitle: '正在读取密室状态…',
      onClose: () => this.callbacks?.onClose(),
      renderBody: (body) => {
        const loading = document.createElement('div');
        loading.className = 'time-chamber-loading';
        loading.textContent = '正在读取经营信息…';
        body.replaceChildren(loading);
      },
    });
  }

  showDetail(detail: TimeChamberManagementDetailView): void {
    this.detail = detail;
    const subtitle = `${detail.configuredSpeed} 倍 · ${detail.activeUsageCount}/${detail.capacity} 人`;
    if (!detailModalHost.isOpenFor(MODAL_OWNER)) {
      detailModalHost.open(this.buildModalOptions(detail, subtitle));
      return;
    }
    const shell = document.querySelector<HTMLElement>('#detail-modal-body [data-time-chamber-management-shell]');
    if (!shell) {
      detailModalHost.patch(this.buildModalOptions(detail, subtitle));
      return;
    }
    detailModalHost.patch({ ownerId: MODAL_OWNER, title: detail.displayName, subtitle });
    patchDetailFields(shell, detail);
    this.syncPendingButtons(shell);
  }

  setPending(operation: TimeChamberOperationKind, pending: boolean): void {
    if (pending) this.pendingOperations.add(operation);
    else this.pendingOperations.delete(operation);
    const shell = document.querySelector<HTMLElement>('#detail-modal-body [data-time-chamber-management-shell]');
    if (shell && detailModalHost.isOpenFor(MODAL_OWNER)) this.syncPendingButtons(shell);
  }

  clear(): void {
    this.detail = null;
    this.pendingOperations.clear();
    detailModalHost.close(MODAL_OWNER);
  }

  isOpen(): boolean {
    return detailModalHost.isOpenFor(MODAL_OWNER);
  }

  private buildModalOptions(detail: TimeChamberManagementDetailView, subtitle: string) {
    return {
      ownerId: MODAL_OWNER,
      variantClass: MODAL_VARIANT,
      title: detail.displayName,
      size: 'md' as const,
      subtitle,
      onClose: () => this.callbacks?.onClose(),
      renderBody: (body: HTMLElement) => body.replaceChildren(buildConsoleShell(detail)),
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
        const shell = body.querySelector<HTMLElement>('[data-time-chamber-management-shell]');
        if (!shell) return;
        shell.addEventListener('submit', (event) => this.handleSubmit(event), { signal });
        this.syncPendingButtons(shell);
      },
    };
  }

  private handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !this.callbacks || !this.detail) return;
    const operation = form.dataset.timeChamberForm;
    if (operation === 'settings') {
      const name = form.elements.namedItem('name');
      const hourlyFee = form.elements.namedItem('hourlyFee');
      const speed = form.elements.namedItem('speed');
      const capacity = form.elements.namedItem('capacity');
      if (
        name instanceof HTMLInputElement
        && hourlyFee instanceof HTMLInputElement
        && speed instanceof HTMLSelectElement
        && capacity instanceof HTMLInputElement
      ) {
        this.callbacks.onSaveSettings({
          name: name.value.trim(),
          hourlyFee: Math.trunc(Number(hourlyFee.value)),
          speed: Math.trunc(Number(speed.value)),
          capacity: Math.trunc(Number(capacity.value)),
        });
      }
      return;
    }
    const countField = form.elements.namedItem('spiritStoneCount');
    if (operation === 'deposit' && countField instanceof HTMLInputElement) {
      this.callbacks.onDeposit(Math.trunc(Number(countField.value)));
      return;
    }
    if (operation === 'claim_revenue' && countField instanceof HTMLInputElement) {
      this.callbacks.onClaimRevenue(Math.trunc(Number(countField.value)));
      return;
    }
    const sizeField = form.elements.namedItem('sizeTier');
    if (operation === 'resize' && sizeField instanceof HTMLSelectElement && isSizeTier(sizeField.value)) {
      this.callbacks.onResize(sizeField.value);
    }
  }

  private syncPendingButtons(shell: HTMLElement): void {
    const mutationPending = this.pendingOperations.size > 0;
    for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-time-chamber-operation]')) {
      const operation = button.dataset.timeChamberOperation as TimeChamberOperationKind | undefined;
      const pending = Boolean(operation && this.pendingOperations.has(operation));
      const blockedByActiveUsage = operation === 'resize' && (this.detail?.settingsLocked === true || (this.detail?.occupancy ?? 0) > 0);
      const noRevenue = operation === 'claim_revenue' && (this.detail?.revenueSpiritStones ?? 0) <= 0;
      button.disabled = mutationPending || blockedByActiveUsage || noRevenue || this.detail?.isOwner !== true;
      button.textContent = pending ? '处理中…' : button.dataset.idleLabel ?? '确认';
    }
  }
}

function buildConsoleShell(detail: TimeChamberManagementDetailView): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'time-chamber-console time-chamber-management';
  shell.dataset.timeChamberManagementShell = 'true';

  const metrics = document.createElement('section');
  metrics.className = 'time-chamber-metrics time-chamber-metrics--management';
  metrics.append(
    buildMetric('当前流速', 'speed'),
    buildMetric('使用人数', 'users'),
    buildMetric('燃料储备', 'fuel'),
    buildMetric('运行成本', 'cost'),
    buildMetric('待提收益', 'revenue'),
    buildMetric('激活截止', 'active-until'),
  );

  const controls = document.createElement('div');
  controls.className = 'time-chamber-control-grid';
  controls.append(
    buildSettingsSection(detail),
    buildDepositSection(),
    buildRevenueSection(detail),
    buildResizeSection(detail),
  );
  shell.append(metrics, controls);
  patchDetailFields(shell, detail);
  return shell;
}

function buildSettingsSection(detail: TimeChamberManagementDetailView): HTMLElement {
  const form = document.createElement('form');
  form.className = 'time-chamber-settings-form';
  form.dataset.timeChamberForm = 'settings';
  form.append(
    buildLabeledInput('名称', 'name', 'text', detail.displayName, { max: 20 }),
    buildLabeledInput('每小时收费', 'hourlyFee', 'number', String(detail.hourlyFee), { min: 0, max: 10_000_000 }),
    buildSpeedField(detail),
    buildLabeledInput('最大人数', 'capacity', 'number', String(detail.capacity), { min: 1, max: detail.maxCapacity }),
  );
  const lock = document.createElement('p');
  lock.className = 'time-chamber-setting-lock';
  lock.dataset.timeChamberField = 'settings-lock';
  const button = buildSubmitButton('settings', '保存配置');
  form.append(lock, button);
  return buildControlSection('经营配置', form, true);
}

function buildDepositSection(): HTMLElement {
  const form = buildCountForm('deposit', '投入燃料');
  return buildControlSection('补充燃料', form);
}

function buildRevenueSection(detail: TimeChamberManagementDetailView): HTMLElement {
  const form = buildCountForm('claim_revenue', '提取收益');
  const input = form.elements.namedItem('spiritStoneCount');
  if (input instanceof HTMLInputElement) {
    input.max = String(Math.max(1, detail.revenueSpiritStones));
    input.value = String(Math.max(1, detail.revenueSpiritStones));
  }
  return buildControlSection('经营收益', form);
}

function buildResizeSection(detail: TimeChamberManagementDetailView): HTMLElement {
  const form = document.createElement('form');
  form.className = 'time-chamber-form';
  form.dataset.timeChamberForm = 'resize';
  const select = document.createElement('select');
  select.className = 'ui-input';
  select.name = 'sizeTier';
  select.dataset.sizeSignature = buildSizeSignature(detail);
  appendSizeOptions(select, detail);
  form.append(select, buildSubmitButton('resize', '调整空间'));
  return buildControlSection('空间大小', form);
}

function buildCountForm(operation: 'deposit' | 'claim_revenue', buttonText: string): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'time-chamber-form';
  form.dataset.timeChamberForm = operation;
  const input = document.createElement('input');
  input.className = 'ui-input';
  input.type = 'number';
  input.name = 'spiritStoneCount';
  input.min = '1';
  input.max = '1000000';
  input.step = '1';
  input.value = '1';
  input.inputMode = 'numeric';
  form.append(input, buildSubmitButton(operation, buttonText));
  return form;
}

function buildSubmitButton(operation: TimeChamberOperationKind, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'small-btn';
  button.textContent = label;
  button.dataset.idleLabel = label;
  button.dataset.timeChamberOperation = operation;
  return button;
}

function buildControlSection(titleText: string, form: HTMLFormElement, wide = false): HTMLElement {
  const section = document.createElement('section');
  section.className = `time-chamber-control${wide ? ' time-chamber-control--wide' : ''}`;
  const title = document.createElement('h3');
  title.textContent = titleText;
  section.append(title, form);
  return section;
}

function buildLabeledInput(
  labelText: string,
  name: string,
  type: 'text' | 'number',
  value: string,
  limits: { min?: number; max?: number },
): HTMLElement {
  const label = document.createElement('label');
  label.className = 'time-chamber-setting-field';
  const caption = document.createElement('span');
  caption.textContent = labelText;
  const input = document.createElement('input');
  input.className = 'ui-input';
  input.type = type;
  input.name = name;
  input.value = value;
  input.autocomplete = 'off';
  if (type === 'number') input.inputMode = 'numeric';
  if (limits.min !== undefined) input.min = String(limits.min);
  if (limits.max !== undefined) {
    if (type === 'text') input.maxLength = limits.max;
    else input.max = String(limits.max);
  }
  label.append(caption, input);
  return label;
}

function buildSpeedField(detail: TimeChamberManagementDetailView): HTMLElement {
  const label = document.createElement('label');
  label.className = 'time-chamber-setting-field';
  const caption = document.createElement('span');
  caption.textContent = '时间倍率';
  const select = document.createElement('select');
  select.className = 'ui-input';
  select.name = 'speed';
  for (let speed = detail.minSpeed; speed <= detail.maxSpeed; speed += 1) {
    const option = document.createElement('option');
    option.value = String(speed);
    option.textContent = `${speed} 倍`;
    select.append(option);
  }
  label.append(caption, select);
  return label;
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

function patchDetailFields(shell: HTMLElement, detail: TimeChamberManagementDetailView): void {
  setField(shell, 'speed', detail.configuredSpeed === detail.effectiveSpeed
    ? `${detail.effectiveSpeed} 倍`
    : `设定 ${detail.configuredSpeed} 倍 / 当前 ${detail.effectiveSpeed} 倍`);
  setField(shell, 'users', `${detail.activeUsageCount}/${detail.capacity} 人`);
  setField(shell, 'fuel', `${formatDisplayNumber(detail.fuelSpiritStoneEquivalent, { maximumFractionDigits: 2 })} 灵石`);
  setField(shell, 'cost', `${formatDisplayNumber(detail.operatingCostSpiritStonesPerHour)} 灵石/小时`);
  setField(shell, 'revenue', `${formatDisplayNumber(detail.revenueSpiritStones)} 灵石`);
  setField(shell, 'active-until', detail.activeUntil ? formatDateTime(detail.activeUntil) : '未激活');
  setField(shell, 'settings-lock', detail.settingsLocked ? '运行期间倍率与容量保持不变' : '');

  const active = document.activeElement;
  patchInput(shell, 'name', detail.displayName, active);
  patchInput(shell, 'hourlyFee', String(detail.hourlyFee), active);
  patchInput(shell, 'capacity', String(detail.capacity), active);
  const capacity = shell.querySelector<HTMLInputElement>('input[name="capacity"]');
  if (capacity) {
    capacity.max = String(detail.maxCapacity);
    capacity.disabled = detail.settingsLocked;
  }
  const speed = shell.querySelector<HTMLSelectElement>('select[name="speed"]');
  if (speed) {
    if (active !== speed) speed.value = String(detail.configuredSpeed);
    speed.disabled = detail.settingsLocked;
  }
  const claim = shell.querySelector<HTMLInputElement>('form[data-time-chamber-form="claim_revenue"] input[name="spiritStoneCount"]');
  if (claim && active !== claim) {
    claim.max = String(Math.max(1, detail.revenueSpiritStones));
    claim.value = String(Math.max(1, detail.revenueSpiritStones));
  }
  const size = shell.querySelector<HTMLSelectElement>('select[name="sizeTier"]');
  if (size) {
    const signature = buildSizeSignature(detail);
    if (size.dataset.sizeSignature !== signature) {
      size.replaceChildren();
      appendSizeOptions(size, detail);
      size.dataset.sizeSignature = signature;
    }
    if (active !== size) size.value = detail.sizeTier;
  }
}

function patchInput(shell: HTMLElement, name: string, value: string, active: Element | null): void {
  const input = shell.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (input && active !== input && input.value !== value) input.value = value;
}

function setField(shell: HTMLElement, name: string, value: string): void {
  const element = shell.querySelector<HTMLElement>(`[data-time-chamber-field="${name}"]`);
  if (element && element.textContent !== value) element.textContent = value;
}

function appendSizeOptions(select: HTMLSelectElement, detail: TimeChamberManagementDetailView): void {
  for (const size of detail.allowedSizes) {
    const option = document.createElement('option');
    option.value = size.tier;
    option.textContent = `${sizeTierLabel(size.tier)}（${size.width}×${size.height}）`;
    option.selected = size.tier === detail.sizeTier;
    select.append(option);
  }
}

function buildSizeSignature(detail: TimeChamberManagementDetailView): string {
  return detail.allowedSizes.map((size) => `${size.tier}:${size.width}:${size.height}`).join('|');
}

function sizeTierLabel(tier: TimeChamberSizeTier): string {
  return tier === 'small' ? '小型' : tier === 'medium' ? '中型' : '大型';
}

function isSizeTier(value: string): value is TimeChamberSizeTier {
  return value === 'small' || value === 'medium' || value === 'large';
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
