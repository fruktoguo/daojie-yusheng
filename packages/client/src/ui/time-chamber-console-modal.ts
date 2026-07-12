/**
 * 密室独立控制台。这里只渲染服务端投影并发送管理意图，不在客户端裁定燃料、容量或调速结果。
 */
import type { TimeChamberDetailView, TimeChamberOperationKind, TimeChamberSizeTier } from '@mud/shared';

import { formatDisplayNumber } from '../utils/number';
import { detailModalHost } from './detail-modal-host';

const MODAL_OWNER = 'time-chamber-console';
const MODAL_VARIANT = 'detail-modal--time-chamber';

type TimeChamberConsoleCallbacks = {
  onClose(): void;
  onDeposit(spiritStoneCount: number): void;
  onSetSpeed(speed: number): void;
  onRename(name: string): void;
  onResize(sizeTier: TimeChamberSizeTier): void;
};

export class TimeChamberConsoleModal {
  private detail: TimeChamberDetailView | null = null;
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
      title: '密室控制台',
      size: 'md',
      subtitle: '正在读取密室状态…',
      hint: '管理操作均由服务端校验并持久化。',
      onClose: () => this.callbacks?.onClose(),
      renderBody: (body) => {
        const loading = document.createElement('div');
        loading.className = 'time-chamber-loading';
        loading.textContent = '正在连接独立空间…';
        body.replaceChildren(loading);
      },
    });
  }

  showDetail(detail: TimeChamberDetailView): void {
    this.detail = detail;
    const subtitle = buildSubtitle(detail);
    if (!detailModalHost.isOpenFor(MODAL_OWNER)) {
      detailModalHost.open(this.buildModalOptions(detail, subtitle));
      return;
    }
    const body = document.getElementById('detail-modal-body');
    const shell = body?.querySelector<HTMLElement>('[data-time-chamber-shell]') ?? null;
    if (!shell) {
      detailModalHost.patch(this.buildModalOptions(detail, subtitle));
      return;
    }
    detailModalHost.patch({ ownerId: MODAL_OWNER, title: detail.displayName, subtitle });
    patchDetailFields(shell, detail);
    this.syncPendingButtons(shell);
  }

  setPending(operation: TimeChamberOperationKind, pending: boolean): void {
    if (pending) {
      this.pendingOperations.add(operation);
    } else {
      this.pendingOperations.delete(operation);
    }
    const shell = document.querySelector<HTMLElement>('#detail-modal-body [data-time-chamber-shell]');
    if (shell && detailModalHost.isOpenFor(MODAL_OWNER)) {
      this.syncPendingButtons(shell);
    }
  }

  clear(): void {
    this.detail = null;
    this.pendingOperations.clear();
    detailModalHost.close(MODAL_OWNER);
  }

  isOpen(): boolean {
    return detailModalHost.isOpenFor(MODAL_OWNER);
  }

  private buildModalOptions(detail: TimeChamberDetailView, subtitle: string) {
    return {
      ownerId: MODAL_OWNER,
      variantClass: MODAL_VARIANT,
      title: detail.displayName,
      size: 'md' as const,
      subtitle,
      hint: '高倍流速只推进本密室；灵石耗尽时自动回落为一倍。',
      onClose: () => this.callbacks?.onClose(),
      renderBody: (body: HTMLElement) => {
        body.replaceChildren(buildConsoleShell(detail));
      },
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
        const shell = body.querySelector<HTMLElement>('[data-time-chamber-shell]');
        if (!shell) return;
        this.bindActions(shell, signal);
        this.syncPendingButtons(shell);
      },
    };
  }

  private bindActions(shell: HTMLElement, signal: AbortSignal): void {
    shell.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !this.callbacks || !this.detail) return;
      const operation = form.dataset.timeChamberForm;
      if (operation === 'deposit') {
        const count = Math.trunc(Number(form.elements.namedItem('spiritStoneCount') instanceof HTMLInputElement
          ? (form.elements.namedItem('spiritStoneCount') as HTMLInputElement).value
          : 0));
        if (count > 0) this.callbacks.onDeposit(count);
        return;
      }
      if (operation === 'speed') {
        const field = form.elements.namedItem('speed');
        if (field instanceof HTMLSelectElement) this.callbacks.onSetSpeed(Math.trunc(Number(field.value)));
        return;
      }
      if (operation === 'rename') {
        const field = form.elements.namedItem('name');
        if (field instanceof HTMLInputElement) this.callbacks.onRename(field.value.trim());
        return;
      }
      if (operation === 'resize') {
        const field = form.elements.namedItem('sizeTier');
        if (field instanceof HTMLSelectElement && isSizeTier(field.value)) this.callbacks.onResize(field.value);
      }
    }, { signal });
  }

  private syncPendingButtons(shell: HTMLElement): void {
    const mutationPending = Array.from(this.pendingOperations).some((operation) => operation !== 'detail');
    for (const button of shell.querySelectorAll<HTMLButtonElement>('[data-time-chamber-operation]')) {
      const operation = button.dataset.timeChamberOperation as TimeChamberOperationKind | undefined;
      const pending = Boolean(operation && this.pendingOperations.has(operation));
      const occupiedResize = operation === 'resize' && (this.detail?.occupancy ?? 0) > 0;
      button.disabled = mutationPending || occupiedResize || this.detail?.isOwner !== true;
      button.textContent = pending ? '处理中…' : button.dataset.idleLabel ?? '确认';
    }
  }
}

function buildConsoleShell(detail: TimeChamberDetailView): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'time-chamber-console';
  shell.dataset.timeChamberShell = 'true';

  const metrics = document.createElement('section');
  metrics.className = 'time-chamber-metrics';
  metrics.append(
    buildMetric('当前流速', 'speed'),
    buildMetric('灵石储备', 'fuel'),
    buildMetric('预计可用', 'remaining'),
    buildMetric('空间状态', 'space'),
  );

  const controls = document.createElement('div');
  controls.className = 'time-chamber-control-grid';
  controls.append(
    buildDepositForm(),
    buildSpeedForm(detail),
    buildRenameForm(detail),
    buildResizeForm(detail),
  );

  const note = document.createElement('p');
  note.className = 'time-chamber-note';
  note.textContent = `所有玩家均可从外部入口申请进入；当前准入容量为 ${detail.capacity} 人，位置仍遵循不可重叠规则。`;
  note.dataset.timeChamberField = 'note';

  shell.append(metrics, controls, note);
  patchDetailFields(shell, detail);
  return shell;
}

function buildMetric(labelText: string, field: string): HTMLElement {
  const card = document.createElement('article');
  card.className = 'time-chamber-metric';
  const label = document.createElement('span');
  label.className = 'time-chamber-metric-label';
  label.textContent = labelText;
  const value = document.createElement('strong');
  value.className = 'time-chamber-metric-value';
  value.dataset.timeChamberField = field;
  card.append(label, value);
  return card;
}

function buildControlSection(titleText: string, description: string, form: HTMLFormElement): HTMLElement {
  const section = document.createElement('section');
  section.className = 'time-chamber-control';
  const title = document.createElement('h3');
  title.textContent = titleText;
  const desc = document.createElement('p');
  desc.textContent = description;
  section.append(title, desc, form);
  return section;
}

function buildDepositForm(): HTMLElement {
  const form = buildForm('deposit', '投入灵石');
  const input = document.createElement('input');
  input.className = 'ui-input';
  input.type = 'number';
  input.name = 'spiritStoneCount';
  input.min = '1';
  input.max = '1000000';
  input.step = '1';
  input.value = '1';
  input.inputMode = 'numeric';
  form.prepend(input);
  return buildControlSection('补充燃料', '灵石会持续供给高倍时间流速。', form);
}

function buildSpeedForm(detail: TimeChamberDetailView): HTMLElement {
  const form = buildForm('speed', '应用流速');
  const select = document.createElement('select');
  select.className = 'ui-input';
  select.name = 'speed';
  for (let speed = detail.minSpeed; speed <= detail.maxSpeed; speed += 1) {
    const option = document.createElement('option');
    option.value = String(speed);
    option.textContent = `${speed} 倍`;
    select.append(option);
  }
  form.prepend(select);
  return buildControlSection('时间流速', '倍速越高，每现实秒推进的逻辑息数和燃料消耗越高。', form);
}

function buildRenameForm(detail: TimeChamberDetailView): HTMLElement {
  const form = buildForm('rename', '保存名称');
  const input = document.createElement('input');
  input.className = 'ui-input';
  input.type = 'text';
  input.name = 'name';
  input.maxLength = 20;
  input.value = detail.displayName;
  input.autocomplete = 'off';
  form.prepend(input);
  return buildControlSection('密室名称', '名称同时用于外部建筑和独立地图。', form);
}

function buildResizeForm(detail: TimeChamberDetailView): HTMLElement {
  const form = buildForm('resize', '调整空间');
  const select = document.createElement('select');
  select.className = 'ui-input';
  select.name = 'sizeTier';
  select.dataset.sizeSignature = buildSizeSignature(detail);
  appendSizeOptions(select, detail);
  form.prepend(select);
  return buildControlSection('空间大小', '只能在密室无人且内部没有运行态对象时调整。', form);
}

function buildForm(operation: Exclude<TimeChamberOperationKind, 'detail'>, buttonText: string): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'time-chamber-form';
  form.dataset.timeChamberForm = operation;
  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'small-btn';
  button.textContent = buttonText;
  button.dataset.idleLabel = buttonText;
  button.dataset.timeChamberOperation = operation;
  form.append(button);
  return form;
}

function patchDetailFields(shell: HTMLElement, detail: TimeChamberDetailView): void {
  setField(shell, 'speed', detail.configuredSpeed === detail.effectiveSpeed
    ? `${detail.effectiveSpeed} 倍`
    : `设定 ${detail.configuredSpeed} 倍 / 实际 ${detail.effectiveSpeed} 倍`);
  const spiritStonesPerHour = detail.fuelUnitsPerSpiritStone > 0
    ? detail.fuelConsumptionUnitsPerSecond * 3600 / detail.fuelUnitsPerSpiritStone
    : 0;
  const consumptionText = spiritStonesPerHour > 0
    ? `约 ${formatDisplayNumber(spiritStonesPerHour, { maximumFractionDigits: 2 })} 枚/小时`
    : '当前无消耗';
  setField(shell, 'fuel', `${formatDisplayNumber(detail.fuelSpiritStoneEquivalent, { maximumFractionDigits: 2 })} 枚 · ${consumptionText}`);
  setField(shell, 'remaining', detail.estimatedRemainingSeconds === null ? '一倍不耗燃料' : formatDuration(detail.estimatedRemainingSeconds));
  setField(shell, 'space', `${detail.width}×${detail.height} · ${detail.occupancy}/${detail.capacity} 人`);
  setField(shell, 'note', `所有玩家均可从外部入口申请进入；当前准入容量为 ${detail.capacity} 人，位置仍遵循不可重叠规则。`);

  const active = document.activeElement;
  const speed = shell.querySelector<HTMLSelectElement>('select[name="speed"]');
  if (speed && active !== speed) speed.value = String(detail.configuredSpeed);
  const name = shell.querySelector<HTMLInputElement>('input[name="name"]');
  if (name && active !== name) name.value = detail.displayName;
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

function setField(shell: HTMLElement, name: string, value: string): void {
  const element = shell.querySelector<HTMLElement>(`[data-time-chamber-field="${name}"]`);
  if (element && element.textContent !== value) element.textContent = value;
}

function appendSizeOptions(select: HTMLSelectElement, detail: TimeChamberDetailView): void {
  for (const size of detail.allowedSizes) {
    const option = document.createElement('option');
    option.value = size.tier;
    option.textContent = `${sizeTierLabel(size.tier)}（${size.width}×${size.height}）`;
    option.selected = size.tier === detail.sizeTier;
    select.append(option);
  }
}

function buildSizeSignature(detail: TimeChamberDetailView): string {
  return detail.allowedSizes.map((size) => `${size.tier}:${size.width}:${size.height}`).join('|');
}

function buildSubtitle(detail: TimeChamberDetailView): string {
  return `空间 ${detail.width}×${detail.height} · ${detail.occupancy}/${detail.capacity} 人`;
}

function sizeTierLabel(tier: TimeChamberSizeTier): string {
  return tier === 'small' ? '小型' : tier === 'medium' ? '中型' : '大型';
}

function formatDuration(secondsInput: number): string {
  const seconds = Math.max(0, Math.trunc(secondsInput));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${remainder} 秒`;
  return `${remainder} 秒`;
}

function isSizeTier(value: string): value is TimeChamberSizeTier {
  return value === 'small' || value === 'medium' || value === 'large';
}
