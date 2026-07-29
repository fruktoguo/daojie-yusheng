/** 密室管理面板：只渲染服务端投影并发送配置意图。 */
import type {
  TimeChamberManagementDetailView,
  TimeChamberOperationKind,
  TimeChamberPasswordChangeView,
  TimeChamberSizeTier,
} from '@mud/shared';
import { TIME_CHAMBER_MAX_PASSWORD_LENGTH } from '@mud/shared';

import { formatDisplayNumber } from '../utils/number';
import { detailModalHost } from './detail-modal-host';

const MODAL_OWNER = 'time-chamber-management';
const MODAL_VARIANT = 'detail-modal--time-chamber';

type TimeChamberSettingsDraft = {
  name: string;
  speed: number;
  capacity: number;
  passwordChange?: TimeChamberPasswordChangeView;
};

type TimeChamberSettingsInputDraft = {
  name: string;
  speed: string;
  capacity: string;
  passwordEnabled: boolean;
  password: string;
};

type TimeChamberAcceptedOperation = 'settings' | 'resize' | null;

type TimeChamberConsoleCallbacks = {
  onClose(): void;
  onSaveSettings(settings: TimeChamberSettingsDraft): void;
  onResize(sizeTier: TimeChamberSizeTier): void;
};

export class TimeChamberConsoleModal {
  private detail: TimeChamberManagementDetailView | null = null;
  private callbacks: TimeChamberConsoleCallbacks | null = null;
  private readonly pendingOperations = new Set<TimeChamberOperationKind>();
  private readonly dirtySettings = new Set<keyof TimeChamberSettingsInputDraft>();
  private settingsDraft: TimeChamberSettingsInputDraft | null = null;
  private sizeDraft: TimeChamberSizeTier | null = null;
  private sizeDirty = false;
  private detailIdentity = '';
  private detailSignature = '';
  private shell: HTMLElement | null = null;

  setCallbacks(callbacks: TimeChamberConsoleCallbacks): void {
    this.callbacks = callbacks;
  }

  openPending(): void {
    this.detail = null;
    this.pendingOperations.clear();
    this.resetDraftState();
    this.shell = null;
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
        loading.textContent = '正在读取管理信息…';
        body.replaceChildren(loading);
      },
    });
  }

  showDetail(detail: TimeChamberManagementDetailView, acceptedOperation: TimeChamberAcceptedOperation = null): void {
    const identity = buildDetailIdentity(detail);
    if (this.detailIdentity !== identity) {
      this.resetDraftState();
      this.detailIdentity = identity;
    }
    this.reconcileDraft(detail, acceptedOperation);
    const nextSignature = buildManagementDetailSignature(detail);
    const shell = this.getShell();
    this.detail = detail;
    if (shell && nextSignature === this.detailSignature && acceptedOperation === null) return;
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
    patchDetailFields(shell, detail, this.settingsDraft, this.sizeDraft);
    this.syncPendingButtons(shell);
  }

  setPending(operation: TimeChamberOperationKind, pending: boolean): void {
    if (pending) this.pendingOperations.add(operation);
    else this.pendingOperations.delete(operation);
    const shell = this.getShell();
    if (shell) this.syncPendingButtons(shell);
  }

  clear(): void {
    this.detail = null;
    this.pendingOperations.clear();
    this.resetDraftState();
    this.shell = null;
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
      renderBody: (body: HTMLElement) => body.replaceChildren(buildConsoleShell(
        detail,
        this.settingsDraft ?? buildSettingsInputDraft(detail),
        this.sizeDraft ?? detail.sizeTier,
      )),
      onAfterRender: (body: HTMLElement, signal: AbortSignal) => {
        const shell = body.querySelector<HTMLElement>('[data-time-chamber-management-shell]');
        if (!shell) return;
        this.shell = shell;
        shell.addEventListener('submit', (event) => this.handleSubmit(event), { signal });
        shell.addEventListener('input', (event) => this.captureDraftChange(event), { signal });
        shell.addEventListener('change', (event) => this.captureDraftChange(event), { signal });
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
      const speed = form.elements.namedItem('speed');
      const capacity = form.elements.namedItem('capacity');
      const passwordEnabled = form.elements.namedItem('passwordEnabled');
      const password = form.elements.namedItem('password');
      if (
        name instanceof HTMLInputElement
        && speed instanceof HTMLSelectElement
        && capacity instanceof HTMLInputElement
        && passwordEnabled instanceof HTMLInputElement
        && password instanceof HTMLInputElement
      ) {
        const passwordValue = password.value.normalize('NFC');
        if (passwordEnabled.checked && passwordValue && passwordValue.trim().length === 0) {
          password.setCustomValidity('进入密码不能全部为空白字符');
          password.reportValidity();
          return;
        }
        if (passwordEnabled.checked && !this.detail.passwordProtected && !passwordValue) {
          password.setCustomValidity('请输入进入密码');
          password.reportValidity();
          return;
        }
        password.setCustomValidity('');
        const passwordChange: TimeChamberPasswordChangeView | undefined = !passwordEnabled.checked
          ? this.detail.passwordProtected ? { action: 'clear' } : undefined
          : passwordValue ? { action: 'set', password: passwordValue } : undefined;
        this.callbacks.onSaveSettings({
          name: name.value.trim(),
          speed: Math.trunc(Number(speed.value)),
          capacity: Math.trunc(Number(capacity.value)),
          ...(passwordChange ? { passwordChange } : {}),
        });
      }
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
      const blockedByActive = operation === 'resize' && (
        this.detail?.settingsLocked === true
        || (this.detail?.occupancy ?? 0) > 0
        || this.detail?.hasBuildings === true
      );
      button.disabled = mutationPending || blockedByActive || this.detail?.isOwner !== true;
      button.textContent = pending ? '处理中…' : button.dataset.idleLabel ?? '确认';
    }
  }

  private captureDraftChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) || !this.detail) return;
    const authoritative = buildSettingsInputDraft(this.detail);
    if (target.name === 'name' || target.name === 'speed' || target.name === 'capacity') {
      this.settingsDraft = this.settingsDraft ?? authoritative;
      this.settingsDraft[target.name] = target.value;
      if (target.value === authoritative[target.name]) this.dirtySettings.delete(target.name);
      else this.dirtySettings.add(target.name);
      return;
    }
    if (target instanceof HTMLInputElement && target.name === 'passwordEnabled') {
      this.settingsDraft = this.settingsDraft ?? authoritative;
      this.settingsDraft.passwordEnabled = target.checked;
      if (target.checked === authoritative.passwordEnabled) this.dirtySettings.delete('passwordEnabled');
      else this.dirtySettings.add('passwordEnabled');
      const shell = this.getShell();
      if (shell) syncPasswordFieldState(shell, this.settingsDraft);
      return;
    }
    if (target instanceof HTMLInputElement && target.name === 'password') {
      this.settingsDraft = this.settingsDraft ?? authoritative;
      this.settingsDraft.password = target.value;
      if (target.value) this.dirtySettings.add('password');
      else this.dirtySettings.delete('password');
      target.setCustomValidity('');
      return;
    }
    if (target.name === 'sizeTier' && isSizeTier(target.value)) {
      this.sizeDraft = target.value;
      this.sizeDirty = target.value !== this.detail.sizeTier;
    }
  }

  private reconcileDraft(detail: TimeChamberManagementDetailView, acceptedOperation: TimeChamberAcceptedOperation): void {
    const authoritative = buildSettingsInputDraft(detail);
    if (acceptedOperation === 'settings') this.dirtySettings.clear();
    this.settingsDraft = this.settingsDraft ?? authoritative;
    for (const field of ['name', 'speed', 'capacity'] as const) {
      if (this.dirtySettings.has(field) && this.settingsDraft[field] === authoritative[field]) {
        this.dirtySettings.delete(field);
      }
      if (!this.dirtySettings.has(field)) this.settingsDraft[field] = authoritative[field];
    }
    if (this.dirtySettings.has('passwordEnabled') && this.settingsDraft.passwordEnabled === authoritative.passwordEnabled) {
      this.dirtySettings.delete('passwordEnabled');
    }
    if (!this.dirtySettings.has('passwordEnabled')) {
      this.settingsDraft.passwordEnabled = authoritative.passwordEnabled;
    }
    if (acceptedOperation === 'settings') {
      this.settingsDraft.password = '';
      this.dirtySettings.delete('password');
    } else if (!this.dirtySettings.has('password')) {
      this.settingsDraft.password = '';
    }
    if (acceptedOperation === 'resize') this.sizeDirty = false;
    if (!this.sizeDirty || this.sizeDraft === detail.sizeTier) {
      this.sizeDirty = false;
      this.sizeDraft = detail.sizeTier;
    }
  }

  private resetDraftState(): void {
    this.settingsDraft = null;
    this.sizeDraft = null;
    this.sizeDirty = false;
    this.dirtySettings.clear();
    this.detailIdentity = '';
    this.detailSignature = '';
  }

  private getShell(): HTMLElement | null {
    if (!detailModalHost.isOpenFor(MODAL_OWNER)) return null;
    if (this.shell?.isConnected) return this.shell;
    this.shell = document.querySelector<HTMLElement>('#detail-modal-body [data-time-chamber-management-shell]');
    return this.shell;
  }
}

function buildConsoleShell(
  detail: TimeChamberManagementDetailView,
  settingsDraft: TimeChamberSettingsInputDraft,
  sizeDraft: TimeChamberSizeTier,
): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'time-chamber-console time-chamber-management';
  shell.dataset.timeChamberManagementShell = 'true';

  const metrics = document.createElement('section');
  metrics.className = 'time-chamber-metrics time-chamber-metrics--management';
  metrics.append(
    buildMetric('当前流速', 'speed'),
    buildMetric('当前人数', 'users'),
    buildMetric('运行成本', 'cost'),
    buildMetric('激活截止', 'active-until'),
  );

  const controls = document.createElement('div');
  controls.className = 'time-chamber-control-grid';
  controls.append(
    buildSettingsSection(detail, settingsDraft),
    buildResizeSection(detail, sizeDraft),
  );
  shell.append(metrics, controls);
  patchDetailFields(shell, detail, settingsDraft, sizeDraft);
  return shell;
}

function buildSettingsSection(detail: TimeChamberManagementDetailView, draft: TimeChamberSettingsInputDraft): HTMLElement {
  const form = document.createElement('form');
  form.className = 'time-chamber-settings-form';
  form.dataset.timeChamberForm = 'settings';
  form.append(
    buildLabeledInput('名称', 'name', 'text', draft.name, { max: 20 }),
    buildSpeedField(detail, draft.speed),
    buildLabeledInput('最大人数', 'capacity', 'number', draft.capacity, { min: 1, max: detail.maxCapacity }),
    buildPasswordSetting(draft),
  );
  const lock = document.createElement('p');
  lock.className = 'time-chamber-setting-lock';
  lock.dataset.timeChamberField = 'settings-lock';
  const button = buildSubmitButton('settings', '保存配置');
  form.append(lock, button);
  return buildControlSection('密室配置', form, true);
}

function buildResizeSection(detail: TimeChamberManagementDetailView, sizeDraft: TimeChamberSizeTier): HTMLElement {
  const form = document.createElement('form');
  form.className = 'time-chamber-form';
  form.dataset.timeChamberForm = 'resize';
  const select = document.createElement('select');
  select.className = 'ui-input';
  select.name = 'sizeTier';
  select.dataset.sizeSignature = buildSizeSignature(detail);
  appendSizeOptions(select, detail, sizeDraft);
  form.append(select, buildSubmitButton('resize', '调整空间'));
  return buildControlSection('空间大小', form);
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
  type: 'text' | 'number' | 'password',
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
  input.autocomplete = type === 'password' ? 'new-password' : 'off';
  if (type === 'number') input.inputMode = 'numeric';
  if (limits.min !== undefined) input.min = String(limits.min);
  if (limits.max !== undefined) {
    if (type === 'text' || type === 'password') input.maxLength = limits.max;
    else input.max = String(limits.max);
  }
  label.append(caption, input);
  return label;
}

function buildPasswordSetting(draft: TimeChamberSettingsInputDraft): HTMLElement {
  const field = document.createElement('div');
  field.className = 'time-chamber-password-setting';
  const toggle = document.createElement('label');
  toggle.className = 'time-chamber-password-toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name = 'passwordEnabled';
  checkbox.checked = draft.passwordEnabled;
  const caption = document.createElement('span');
  caption.textContent = '启用进入密码';
  toggle.append(checkbox, caption);
  const passwordField = buildLabeledInput(
    '进入密码',
    'password',
    'password',
    draft.password,
    { max: TIME_CHAMBER_MAX_PASSWORD_LENGTH },
  );
  field.append(toggle, passwordField);
  syncPasswordFieldState(field, draft);
  return field;
}

function buildSpeedField(detail: TimeChamberManagementDetailView, draftSpeed: string): HTMLElement {
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
    option.selected = option.value === draftSpeed;
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

function patchDetailFields(
  shell: HTMLElement,
  detail: TimeChamberManagementDetailView,
  settingsDraft: TimeChamberSettingsInputDraft | null,
  sizeDraft: TimeChamberSizeTier | null,
): void {
  setField(shell, 'speed', detail.configuredSpeed === detail.effectiveSpeed
    ? `${detail.effectiveSpeed} 倍`
    : `设定 ${detail.configuredSpeed} 倍 / 当前 ${detail.effectiveSpeed} 倍`);
  setField(shell, 'users', `${detail.occupancy}/${detail.capacity} 人`);
  setField(shell, 'cost', `${formatDisplayNumber(detail.operatingCostSpiritStonesPerHour)} 灵石/小时`);
  setField(shell, 'active-until', detail.activeUntil ? formatDateTime(detail.activeUntil) : '未激活');
  setField(shell, 'settings-lock', detail.settingsLocked
    ? '运行期间倍率、人数与空间保持不变'
    : detail.hasBuildings
      ? '密室内已有建筑，空间大小已锁定'
      : '');

  const draft = settingsDraft ?? buildSettingsInputDraft(detail);
  patchInput(shell, 'name', draft.name);
  patchInput(shell, 'capacity', draft.capacity);
  patchInput(shell, 'password', draft.password);
  syncPasswordFieldState(shell, draft);
  const capacity = shell.querySelector<HTMLInputElement>('input[name="capacity"]');
  if (capacity) {
    capacity.max = String(detail.maxCapacity);
    capacity.disabled = detail.settingsLocked;
  }
  const speed = shell.querySelector<HTMLSelectElement>('select[name="speed"]');
  if (speed) {
    if (speed.value !== draft.speed) speed.value = draft.speed;
    speed.disabled = detail.settingsLocked;
  }
  const size = shell.querySelector<HTMLSelectElement>('select[name="sizeTier"]');
  if (size) {
    const signature = buildSizeSignature(detail);
    if (size.dataset.sizeSignature !== signature) {
      size.replaceChildren();
      appendSizeOptions(size, detail, sizeDraft ?? detail.sizeTier);
      size.dataset.sizeSignature = signature;
    }
    const nextSize = sizeDraft ?? detail.sizeTier;
    if (size.value !== nextSize) size.value = nextSize;
    size.disabled = detail.settingsLocked || detail.occupancy > 0 || detail.hasBuildings;
  }
}

function patchInput(shell: HTMLElement, name: string, value: string): void {
  const input = shell.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (input && input.value !== value) input.value = value;
}

function syncPasswordFieldState(shell: HTMLElement, draft: TimeChamberSettingsInputDraft): void {
  const checkbox = shell.querySelector<HTMLInputElement>('input[name="passwordEnabled"]');
  const password = shell.querySelector<HTMLInputElement>('input[name="password"]');
  if (checkbox && checkbox.checked !== draft.passwordEnabled) checkbox.checked = draft.passwordEnabled;
  if (!password) return;
  password.disabled = !draft.passwordEnabled;
  password.placeholder = draft.passwordEnabled ? '留空则保持当前密码' : '未启用';
}

function setField(shell: HTMLElement, name: string, value: string): void {
  const element = shell.querySelector<HTMLElement>(`[data-time-chamber-field="${name}"]`);
  if (element && element.textContent !== value) element.textContent = value;
}

function appendSizeOptions(
  select: HTMLSelectElement,
  detail: TimeChamberManagementDetailView,
  selectedTier: TimeChamberSizeTier,
): void {
  for (const size of detail.allowedSizes) {
    const option = document.createElement('option');
    option.value = size.tier;
    option.textContent = `${sizeTierLabel(size.tier)}（${size.width}×${size.height}，最大 ${size.width * size.height} 人，成本 ${size.costMultiplierPercent}%）`;
    option.selected = size.tier === selectedTier;
    select.append(option);
  }
}

function buildSizeSignature(detail: TimeChamberManagementDetailView): string {
  return detail.allowedSizes
    .map((size) => `${size.tier}:${size.width}:${size.height}:${size.costMultiplierPercent}`)
    .join('|');
}

function buildSettingsInputDraft(detail: TimeChamberManagementDetailView): TimeChamberSettingsInputDraft {
  return {
    name: detail.displayName,
    speed: String(detail.configuredSpeed),
    capacity: String(detail.capacity),
    passwordEnabled: detail.passwordProtected,
    password: '',
  };
}

function buildDetailIdentity(detail: TimeChamberManagementDetailView): string {
  return `${detail.sourceInstanceId}\u0000${detail.buildingId}\u0000${detail.chamberInstanceId}`;
}

function buildManagementDetailSignature(detail: TimeChamberManagementDetailView): string {
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
    detail.minSpeed,
    detail.maxSpeed,
    detail.maxCapacity,
    detail.operatingCostSpiritStonesPerHour,
    detail.settingsLocked,
    detail.hasBuildings,
    detail.isOwner,
    buildSizeSignature(detail),
  ].join('\u0000');
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
