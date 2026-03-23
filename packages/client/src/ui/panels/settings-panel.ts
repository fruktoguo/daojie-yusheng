/**
 * 设置面板
 * 提供显示名称、角色名称修改与密码修改功能
 */

import { detailModalHost } from '../detail-modal-host';
import { validateDisplayName, validatePassword, validateRoleName } from '../account-rules';
import {
  checkDisplayNameAvailability,
  getAccessToken,
  updateDisplayName,
  updatePassword,
  updateRoleName,
} from '../auth-api';
import {
  getUiStyleConfig,
  resetUiStyleConfig,
  UI_COLOR_MODE_OPTIONS,
  UI_FONT_LEVEL_DEFINITIONS,
  updateUiColorMode,
  updateUiFontSize,
  UiColorMode,
  UiFontLevelKey,
} from '../ui-style-config';

type SettingsPanelOptions = {
  getCurrentDisplayName: () => string;
  getCurrentRoleName: () => string;
  onDisplayNameUpdated: (displayName: string) => void;
  onRoleNameUpdated: (roleName: string) => void;
  onLogout: () => void;
};

export class SettingsPanel {
  private activeTab: 'account' | 'ui' = 'account';
  private currentDisplayName = '';
  private currentRoleName = '';
  private displayNameCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private displayNameAbortController: AbortController | null = null;
  private displayNameAvailable = false;
  private options: SettingsPanelOptions | null = null;

  constructor() {
    document.getElementById('hud-open-settings')?.addEventListener('click', () => this.open());
    document.getElementById('hud-logout')?.addEventListener('click', () => {
      this.options?.onLogout();
    });
  }

  setOptions(options: SettingsPanelOptions): void {
    this.options = options;
  }

  /** 打开设置弹层 */
  open(): void {
    if (!this.options) {
      return;
    }
    this.currentDisplayName = this.options.getCurrentDisplayName().normalize('NFC');
    this.currentRoleName = this.options.getCurrentRoleName().normalize('NFC');
    this.displayNameAvailable = true;

    detailModalHost.open({
      ownerId: 'settings-panel',
      variantClass: 'detail-modal--settings',
      title: '设置',
      subtitle: `当前显示：${this.currentDisplayName || '未设置'} · 角色名：${this.currentRoleName || '未设置'}`,
      hint: '点击空白处关闭',
      bodyHtml: `
        <div class="settings-modal-shell">
          <div class="settings-modal-tabs" role="tablist" aria-label="设置分组">
            <button
              class="settings-modal-tab${this.activeTab === 'account' ? ' active' : ''}"
              type="button"
              data-settings-tab="account"
              aria-selected="${this.activeTab === 'account' ? 'true' : 'false'}"
            >账号管理</button>
            <button
              class="settings-modal-tab${this.activeTab === 'ui' ? ' active' : ''}"
              type="button"
              data-settings-tab="ui"
              aria-selected="${this.activeTab === 'ui' ? 'true' : 'false'}"
            >UI</button>
          </div>
          <div class="settings-modal-pane${this.activeTab === 'account' ? ' active' : ''}" data-settings-pane="account">
            ${this.renderAccountTab()}
          </div>
          <div class="settings-modal-pane${this.activeTab === 'ui' ? ' active' : ''}" data-settings-pane="ui">
            ${this.renderUiTab()}
          </div>
        </div>
      `,
      onAfterRender: (body) => {
        this.bindModal(body);
      },
    });
  }

  private bindModal(body: HTMLElement): void {
    this.bindTabs(body);
    this.bindAccountSettings(body);
    this.bindUiSettings(body);
  }

  private bindTabs(body: HTMLElement): void {
    body.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextTab = button.dataset.settingsTab;
        if (nextTab !== 'account' && nextTab !== 'ui') {
          return;
        }
        this.activeTab = nextTab;
        body.querySelectorAll<HTMLElement>('[data-settings-tab]').forEach((entry) => {
          const active = entry.dataset.settingsTab === nextTab;
          entry.classList.toggle('active', active);
          entry.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        body.querySelectorAll<HTMLElement>('[data-settings-pane]').forEach((entry) => {
          entry.classList.toggle('active', entry.dataset.settingsPane === nextTab);
        });
      });
    });
  }

  private bindAccountSettings(body: HTMLElement): void {
    const displayNameInput = body.querySelector<HTMLInputElement>('#settings-display-name');
    const displayNameStatus = body.querySelector<HTMLElement>('#settings-display-name-status');
    const displayNameSubmit = body.querySelector<HTMLButtonElement>('#settings-display-name-submit');
    const currentPasswordInput = body.querySelector<HTMLInputElement>('#settings-current-password');
    const newPasswordInput = body.querySelector<HTMLInputElement>('#settings-new-password');
    const passwordStatus = body.querySelector<HTMLElement>('#settings-password-status');
    const passwordSubmit = body.querySelector<HTMLButtonElement>('#settings-password-submit');
    const roleNameInput = body.querySelector<HTMLInputElement>('#settings-role-name');
    const roleNameStatus = body.querySelector<HTMLElement>('#settings-role-name-status');
    const roleNameSubmit = body.querySelector<HTMLButtonElement>('#settings-role-name-submit');
    if (!displayNameInput || !displayNameStatus || !displayNameSubmit || !currentPasswordInput || !newPasswordInput || !passwordStatus || !passwordSubmit || !roleNameInput || !roleNameStatus || !roleNameSubmit) {
      return;
    }

    displayNameInput.addEventListener('input', () => {
      void this.scheduleDisplayNameCheck(displayNameInput, displayNameStatus);
    });
    displayNameSubmit.addEventListener('click', () => {
      void this.handleDisplayNameSubmit(displayNameInput, displayNameStatus, displayNameSubmit);
    });
    passwordSubmit.addEventListener('click', () => {
      void this.handlePasswordSubmit(currentPasswordInput, newPasswordInput, passwordStatus, passwordSubmit);
    });
    roleNameSubmit.addEventListener('click', () => {
      void this.handleRoleNameSubmit(roleNameInput, roleNameStatus, roleNameSubmit);
    });
  }

  private bindUiSettings(body: HTMLElement): void {
    const styleStatus = body.querySelector<HTMLElement>('#settings-ui-style-status');
    const resetButton = body.querySelector<HTMLButtonElement>('#settings-ui-reset');

    body.querySelectorAll<HTMLButtonElement>('[data-ui-color-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const colorMode = button.dataset.uiColorMode;
        if (colorMode !== 'light' && colorMode !== 'dark') {
          return;
        }
        updateUiColorMode(colorMode as UiColorMode);
        this.syncUiModeButtons(body, colorMode as UiColorMode);
        setStatus(styleStatus, `已切换为${colorMode === 'dark' ? '深色' : '浅色'}模式`, 'success');
      });
    });

    body.querySelectorAll<HTMLElement>('[data-ui-font-level]').forEach((row) => {
      const key = row.getAttribute('data-ui-font-level') as UiFontLevelKey | null;
      const rangeInput = row.querySelector<HTMLInputElement>('[data-ui-font-range]');
      const numberInput = row.querySelector<HTMLInputElement>('[data-ui-font-number]');
      const valueEl = row.querySelector<HTMLElement>('[data-ui-font-value]');
      if (!key || !rangeInput || !numberInput || !valueEl) {
        return;
      }

      const applyValue = (rawValue: string) => {
        const definition = UI_FONT_LEVEL_DEFINITIONS.find((entry) => entry.key === key);
        if (!definition) {
          return;
        }
        const parsed = Number.parseInt(rawValue, 10);
        const nextValue = Number.isFinite(parsed)
          ? Math.max(definition.min, Math.min(definition.max, parsed))
          : definition.defaultSize;
        rangeInput.value = String(nextValue);
        numberInput.value = String(nextValue);
        valueEl.textContent = `${nextValue}px`;
        updateUiFontSize(key, nextValue);
        setStatus(styleStatus, `已更新${definition.label}字号`, 'success');
      };

      rangeInput.addEventListener('input', () => {
        applyValue(rangeInput.value);
      });
      numberInput.addEventListener('input', () => {
        applyValue(numberInput.value);
      });
      numberInput.addEventListener('blur', () => {
        applyValue(numberInput.value);
      });
    });

    resetButton?.addEventListener('click', () => {
      const nextConfig = resetUiStyleConfig();
      this.syncUiModeButtons(body, nextConfig.colorMode);
      this.syncUiFontRows(body, nextConfig.fontSizes);
      setStatus(styleStatus, 'UI 样式已恢复默认', 'success');
    });
  }

  private syncUiModeButtons(body: HTMLElement, currentMode: UiColorMode): void {
    body.querySelectorAll<HTMLButtonElement>('[data-ui-color-mode]').forEach((button) => {
      const active = button.dataset.uiColorMode === currentMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  private syncUiFontRows(body: HTMLElement, fontSizes: Record<UiFontLevelKey, number>): void {
    body.querySelectorAll<HTMLElement>('[data-ui-font-level]').forEach((row) => {
      const key = row.getAttribute('data-ui-font-level') as UiFontLevelKey | null;
      const rangeInput = row.querySelector<HTMLInputElement>('[data-ui-font-range]');
      const numberInput = row.querySelector<HTMLInputElement>('[data-ui-font-number]');
      const valueEl = row.querySelector<HTMLElement>('[data-ui-font-value]');
      if (!key || !rangeInput || !numberInput || !valueEl) {
        return;
      }
      const nextValue = fontSizes[key];
      rangeInput.value = String(nextValue);
      numberInput.value = String(nextValue);
      valueEl.textContent = `${nextValue}px`;
    });
  }

  private renderAccountTab(): string {
    return `
      <div class="panel-section account-settings-section">
        <div class="panel-section-title">名称设置</div>
        <div class="account-settings-copy">显示名称是唯一的一字标识；角色名称完整显示在头顶，默认使用账号名称，可与其他人重名。</div>
        <div class="account-settings-name-grid">
          <div class="account-settings-field account-settings-field--display">
            <label for="settings-display-name">显示名称</label>
            <input id="settings-display-name" class="account-settings-display-input" type="text" maxlength="1" value="${escapeHtml(this.currentDisplayName)}" placeholder="字" />
            <div id="settings-display-name-status" class="account-settings-status">当前名称可继续使用</div>
            <div class="account-settings-actions">
              <button id="settings-display-name-submit" class="small-btn" type="button">保存显示名称</button>
            </div>
          </div>
          <div class="account-settings-field">
            <label for="settings-role-name">角色名称</label>
            <input id="settings-role-name" type="text" maxlength="50" value="${escapeHtml(this.currentRoleName)}" placeholder="输入角色名称" />
            <div id="settings-role-name-status" class="account-settings-status"></div>
            <div class="account-settings-actions">
              <button id="settings-role-name-submit" class="small-btn" type="button">保存角色名称</button>
            </div>
          </div>
        </div>
      </div>
      <div class="panel-section account-settings-section">
        <div class="panel-section-title">修改密码</div>
        <div class="account-settings-field">
          <label for="settings-current-password">当前密码</label>
          <input id="settings-current-password" type="password" placeholder="输入当前密码" />
        </div>
        <div class="account-settings-field">
          <label for="settings-new-password">新密码</label>
          <input id="settings-new-password" type="password" placeholder="至少 6 位且不含空格" />
        </div>
        <div id="settings-password-status" class="account-settings-status"></div>
        <div class="account-settings-actions">
          <button id="settings-password-submit" class="small-btn" type="button">保存密码</button>
        </div>
      </div>
    `;
  }

  private renderUiTab(): string {
    const config = getUiStyleConfig();
    return `
      <div class="panel-section account-settings-section">
        <div class="panel-section-title">颜色模式</div>
        <div class="settings-ui-copy">切换后立即生效，并自动保存在当前设备。深色模式会同步替换主界面、弹层与常用控件的基础配色。</div>
        <div class="settings-ui-mode-row">
          ${UI_COLOR_MODE_OPTIONS.map((option) => `
            <button
              class="small-btn ghost${config.colorMode === option.value ? ' active' : ''}"
              type="button"
              data-ui-color-mode="${option.value}"
              aria-pressed="${config.colorMode === option.value ? 'true' : 'false'}"
              title="${escapeHtml(option.description)}"
            >${option.label}</button>
          `).join('')}
        </div>
      </div>
      <div class="panel-section account-settings-section">
        <div class="settings-ui-table-head">
          <div class="panel-section-title">字体等级配置表</div>
          <button id="settings-ui-reset" class="small-btn ghost" type="button">恢复默认</button>
        </div>
        <div class="settings-ui-copy">下面的等级会映射到全局字号变量，已覆盖标题、副标题、正文、说明、小字等常用文本层级。</div>
        <div class="settings-ui-table">
          ${UI_FONT_LEVEL_DEFINITIONS.map((definition) => {
            const size = config.fontSizes[definition.key];
            return `
              <div class="settings-ui-table-row" data-ui-font-level="${definition.key}">
                <div class="settings-ui-level-meta">
                  <div class="settings-ui-level-name">${definition.label}</div>
                  <div class="settings-ui-level-desc">${definition.description}</div>
                </div>
                <div class="settings-ui-level-slider">
                  <input
                    type="range"
                    min="${definition.min}"
                    max="${definition.max}"
                    step="1"
                    value="${size}"
                    data-ui-font-range
                  />
                </div>
                <div class="settings-ui-level-input">
                  <input
                    type="number"
                    min="${definition.min}"
                    max="${definition.max}"
                    step="1"
                    value="${size}"
                    data-ui-font-number
                  />
                  <span data-ui-font-value>${size}px</span>
                </div>
                <div class="settings-ui-level-preview settings-ui-level-preview--${definition.previewClassName}">${definition.previewText}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div id="settings-ui-style-status" class="account-settings-status">当前配置已自动保存到本机</div>
      </div>
    `;
  }

  private async scheduleDisplayNameCheck(
    input: HTMLInputElement,
    statusEl: HTMLElement,
  ): Promise<void> {
    if (this.displayNameCheckTimer) {
      clearTimeout(this.displayNameCheckTimer);
    }
    const displayName = input.value.normalize('NFC');
    if (displayName === this.currentDisplayName) {
      this.displayNameAvailable = true;
      setStatus(statusEl, '当前名称可继续使用', '');
      return;
    }

    const localError = validateDisplayName(displayName);
    if (localError) {
      this.displayNameAvailable = false;
      setStatus(statusEl, localError, 'error');
      return;
    }

    setStatus(statusEl, '正在检测...', '');
    this.displayNameCheckTimer = setTimeout(() => {
      void this.checkDisplayName(displayName, statusEl);
    }, 250);
  }

  private async checkDisplayName(displayName: string, statusEl: HTMLElement): Promise<void> {
    if (displayName === this.currentDisplayName) {
      this.displayNameAvailable = true;
      setStatus(statusEl, '当前名称可继续使用', '');
      return;
    }
    if (this.displayNameAbortController) {
      this.displayNameAbortController.abort();
    }
    const controller = new AbortController();
    this.displayNameAbortController = controller;

    try {
      const result = await checkDisplayNameAvailability(displayName, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      this.displayNameAvailable = result.available;
      setStatus(
        statusEl,
        result.available ? '显示名称可用' : (result.message ?? '显示名称不可用'),
        result.available ? 'success' : 'error',
      );
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      this.displayNameAvailable = false;
      setStatus(statusEl, error instanceof Error ? error.message : '检测失败', 'error');
    }
  }

  private async handleDisplayNameSubmit(
    input: HTMLInputElement,
    statusEl: HTMLElement,
    button: HTMLButtonElement,
  ): Promise<void> {
    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatus(statusEl, '登录已失效，请重新登录', 'error');
      return;
    }

    const displayName = input.value.normalize('NFC');
    const localError = validateDisplayName(displayName);
    if (localError) {
      setStatus(statusEl, localError, 'error');
      return;
    }
    if (displayName !== this.currentDisplayName) {
      await this.checkDisplayName(displayName, statusEl);
      if (!this.displayNameAvailable) {
        return;
      }
    }

    button.disabled = true;
    setStatus(statusEl, '正在保存...', '');
    try {
      const result = await updateDisplayName(accessToken, { displayName });
      this.currentDisplayName = result.displayName;
      this.displayNameAvailable = true;
      input.value = result.displayName;
      this.options?.onDisplayNameUpdated(result.displayName);
      setStatus(statusEl, '显示名称已更新', 'success');
    } catch (error) {
      setStatus(statusEl, error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      button.disabled = false;
    }
  }

  private async handlePasswordSubmit(
    currentPasswordInput: HTMLInputElement,
    newPasswordInput: HTMLInputElement,
    statusEl: HTMLElement,
    button: HTMLButtonElement,
  ): Promise<void> {
    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatus(statusEl, '登录已失效，请重新登录', 'error');
      return;
    }

    if (!currentPasswordInput.value) {
      setStatus(statusEl, '当前密码不能为空', 'error');
      return;
    }
    const passwordError = validatePassword(newPasswordInput.value);
    if (passwordError) {
      setStatus(statusEl, passwordError, 'error');
      return;
    }

    button.disabled = true;
    setStatus(statusEl, '正在保存...', '');
    try {
      await updatePassword(accessToken, {
        currentPassword: currentPasswordInput.value,
        newPassword: newPasswordInput.value,
      });
      currentPasswordInput.value = '';
      newPasswordInput.value = '';
      setStatus(statusEl, '密码已更新', 'success');
    } catch (error) {
      setStatus(statusEl, error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      button.disabled = false;
    }
  }

  private async handleRoleNameSubmit(
    input: HTMLInputElement,
    statusEl: HTMLElement,
    button: HTMLButtonElement,
  ): Promise<void> {
    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatus(statusEl, '登录已失效，请重新登录', 'error');
      return;
    }

    const roleName = input.value.normalize('NFC').trim();
    const roleNameError = validateRoleName(roleName);
    if (roleNameError) {
      setStatus(statusEl, roleNameError, 'error');
      return;
    }
    if (roleName === this.currentRoleName) {
      setStatus(statusEl, '角色名称未变化', '');
      return;
    }

    button.disabled = true;
    setStatus(statusEl, '正在保存...', '');
    try {
      const result = await updateRoleName(accessToken, { roleName });
      this.currentRoleName = result.roleName;
      input.value = result.roleName;
      this.options?.onRoleNameUpdated(result.roleName);
      setStatus(statusEl, '角色名称已更新', 'success');
    } catch (error) {
      setStatus(statusEl, error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      button.disabled = false;
    }
  }
}

function setStatus(target: HTMLElement | null, message: string, tone: '' | 'success' | 'error'): void {
  if (!target) {
    return;
  }
  target.textContent = message;
  target.classList.remove('success', 'error');
  if (tone) {
    target.classList.add(tone);
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
