/**
 * 设置面板
 * 提供显示名称、角色名称修改、密码修改与兑换码功能
 */

import {
  AccountRedeemCodesRes,
  ROLE_NAME_MAX_ASCII_LENGTH,
  ROLE_NAME_MAX_LENGTH,
} from '@mud/shared';
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
  UI_GLOBAL_FONT_OFFSET_RANGE,
  UI_SCALE_RANGE,
  updateUiColorMode,
  updateUiGlobalFontOffset,
  updateUiScale,
  UiColorMode,
} from '../ui-style-config';
import {
  getMapPerformanceConfig,
  resetMapPerformanceConfig,
  updateMapPerformanceConfig,
} from '../performance-config';

type SettingsPanelOptions = {
  getCurrentAccountName: () => string;
  getCurrentDisplayName: () => string;
  getCurrentRoleName: () => string;
  onDisplayNameUpdated: (displayName: string) => void;
  onRoleNameUpdated: (roleName: string) => void;
  redeemCodes: (codes: string[]) => Promise<AccountRedeemCodesRes>;
  onLogout: () => void;
};

export class SettingsPanel {
  private activeTab: 'account' | 'redeem' | 'ui' | 'performance' = 'account';
  private currentAccountName = '';
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
    this.currentAccountName = this.options.getCurrentAccountName().normalize('NFC');
    this.currentDisplayName = this.options.getCurrentDisplayName().normalize('NFC');
    this.currentRoleName = this.options.getCurrentRoleName().normalize('NFC');
    this.displayNameAvailable = true;

    detailModalHost.open({
      ownerId: 'settings-panel',
      variantClass: 'detail-modal--settings',
      title: '设置',
      subtitle: `账号：${this.currentAccountName || '未登录'} · 显示：${this.currentDisplayName || '未设置'} · 角色名：${this.currentRoleName || '未设置'}`,
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
              class="settings-modal-tab${this.activeTab === 'redeem' ? ' active' : ''}"
              type="button"
              data-settings-tab="redeem"
              aria-selected="${this.activeTab === 'redeem' ? 'true' : 'false'}"
            >兑换码</button>
            <button
              class="settings-modal-tab${this.activeTab === 'ui' ? ' active' : ''}"
              type="button"
              data-settings-tab="ui"
              aria-selected="${this.activeTab === 'ui' ? 'true' : 'false'}"
            >UI</button>
            <button
              class="settings-modal-tab${this.activeTab === 'performance' ? ' active' : ''}"
              type="button"
              data-settings-tab="performance"
              aria-selected="${this.activeTab === 'performance' ? 'true' : 'false'}"
            >性能</button>
          </div>
          <div class="settings-modal-pane${this.activeTab === 'account' ? ' active' : ''}" data-settings-pane="account">
            ${this.renderAccountTab()}
          </div>
          <div class="settings-modal-pane${this.activeTab === 'redeem' ? ' active' : ''}" data-settings-pane="redeem">
            ${this.renderRedeemTab()}
          </div>
          <div class="settings-modal-pane${this.activeTab === 'ui' ? ' active' : ''}" data-settings-pane="ui">
            ${this.renderUiTab()}
          </div>
          <div class="settings-modal-pane${this.activeTab === 'performance' ? ' active' : ''}" data-settings-pane="performance">
            ${this.renderPerformanceTab()}
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
    this.bindRedeemSettings(body);
    this.bindUiSettings(body);
    this.bindPerformanceSettings(body);
  }

  private bindTabs(body: HTMLElement): void {
    body.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextTab = button.dataset.settingsTab;
        if (nextTab !== 'account' && nextTab !== 'redeem' && nextTab !== 'ui' && nextTab !== 'performance') {
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
    const config = getUiStyleConfig();
    const styleStatus = body.querySelector<HTMLElement>('#settings-ui-style-status');
    const resetButton = body.querySelector<HTMLButtonElement>('#settings-ui-reset');
    const globalRangeInput = body.querySelector<HTMLInputElement>('[data-ui-global-font-range]');
    const globalNumberInput = body.querySelector<HTMLInputElement>('[data-ui-global-font-number]');
    const scaleRangeInput = body.querySelector<HTMLInputElement>('[data-ui-scale-range]');
    const scaleNumberInput = body.querySelector<HTMLInputElement>('[data-ui-scale-number]');

    this.syncUiGlobalFontOffsetRow(body, config.globalFontOffset);
    this.syncUiScaleRow(body, config.uiScale);

    body.querySelectorAll<HTMLButtonElement>('[data-ui-color-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const colorMode = button.dataset.uiColorMode;
        if (colorMode !== 'light' && colorMode !== 'dark') {
          return;
        }
        const nextConfig = updateUiColorMode(colorMode as UiColorMode);
        this.syncUiModeButtons(body, colorMode as UiColorMode);
        this.syncUiGlobalFontOffsetRow(body, nextConfig.globalFontOffset);
        this.syncUiScaleRow(body, nextConfig.uiScale);
        setStatus(styleStatus, `已切换为${colorMode === 'dark' ? '深色' : '浅色'}模式`, 'success');
      });
    });

    if (globalRangeInput && globalNumberInput) {
      const applyGlobalOffset = (rawValue: string) => {
        const parsed = Number.parseInt(rawValue, 10);
        const nextValue = Number.isFinite(parsed)
          ? Math.max(UI_GLOBAL_FONT_OFFSET_RANGE.min, Math.min(UI_GLOBAL_FONT_OFFSET_RANGE.max, parsed))
          : UI_GLOBAL_FONT_OFFSET_RANGE.defaultValue;
        const nextConfig = updateUiGlobalFontOffset(nextValue);
        this.syncUiGlobalFontOffsetRow(body, nextConfig.globalFontOffset);
        setStatus(styleStatus, '已更新全局字号', 'success');
      };

      globalRangeInput.addEventListener('input', () => {
        applyGlobalOffset(globalRangeInput.value);
      });
      globalNumberInput.addEventListener('input', () => {
        applyGlobalOffset(globalNumberInput.value);
      });
      globalNumberInput.addEventListener('blur', () => {
        applyGlobalOffset(globalNumberInput.value);
      });
    }

    if (scaleRangeInput && scaleNumberInput) {
      const applyScale = (rawValue: string) => {
        const parsed = Number.parseFloat(rawValue);
        const nextValue = Number.isFinite(parsed)
          ? Math.max(UI_SCALE_RANGE.min, Math.min(UI_SCALE_RANGE.max, parsed))
          : UI_SCALE_RANGE.defaultValue;
        const nextConfig = updateUiScale(nextValue);
        this.syncUiScaleRow(body, nextConfig.uiScale);
        setStatus(styleStatus, '已更新界面缩放', 'success');
      };

      scaleRangeInput.addEventListener('input', () => {
        applyScale(scaleRangeInput.value);
      });
      scaleNumberInput.addEventListener('input', () => {
        applyScale(scaleNumberInput.value);
      });
      scaleNumberInput.addEventListener('blur', () => {
        applyScale(scaleNumberInput.value);
      });
    }

    resetButton?.addEventListener('click', () => {
      const nextConfig = resetUiStyleConfig();
      this.syncUiModeButtons(body, nextConfig.colorMode);
      this.syncUiGlobalFontOffsetRow(body, nextConfig.globalFontOffset);
      this.syncUiScaleRow(body, nextConfig.uiScale);
      setStatus(styleStatus, 'UI 样式已恢复默认', 'success');
    });
  }

  private bindRedeemSettings(body: HTMLElement): void {
    const textarea = body.querySelector<HTMLTextAreaElement>('#settings-redeem-codes');
    const statusEl = body.querySelector<HTMLElement>('#settings-redeem-status');
    const button = body.querySelector<HTMLButtonElement>('#settings-redeem-submit');
    const resultEl = body.querySelector<HTMLElement>('#settings-redeem-results');
    if (!textarea || !statusEl || !button || !resultEl) {
      return;
    }

    button.addEventListener('click', () => {
      void this.handleRedeemSubmit(textarea, statusEl, resultEl, button);
    });
  }

  private bindPerformanceSettings(body: HTMLElement): void {
    const config = getMapPerformanceConfig();
    const statusEl = body.querySelector<HTMLElement>('#settings-performance-status');
    const resetButton = body.querySelector<HTMLButtonElement>('#settings-performance-reset');

    this.syncPerformanceFpsButtons(body, config.showFpsMonitor);

    body.querySelectorAll<HTMLButtonElement>('[data-performance-fps-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextValue = button.dataset.performanceFpsToggle === 'on';
        const nextConfig = updateMapPerformanceConfig({
          showFpsMonitor: nextValue,
        });
        this.syncPerformanceFpsButtons(body, nextConfig.showFpsMonitor);
        setStatus(statusEl, nextConfig.showFpsMonitor ? '已开启地图帧率浮层，并自动保存到本机' : '已关闭地图帧率浮层，并自动保存到本机', 'success');
      });
    });

    resetButton?.addEventListener('click', () => {
      const nextConfig = resetMapPerformanceConfig();
      this.syncPerformanceFpsButtons(body, nextConfig.showFpsMonitor);
      setStatus(statusEl, '性能设置已恢复默认，并自动保存到本机', 'success');
    });
  }

  private syncUiModeButtons(body: HTMLElement, currentMode: UiColorMode): void {
    body.querySelectorAll<HTMLButtonElement>('[data-ui-color-mode]').forEach((button) => {
      const active = button.dataset.uiColorMode === currentMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  private syncUiGlobalFontOffsetRow(body: HTMLElement, globalFontOffset: number): void {
    const rangeInput = body.querySelector<HTMLInputElement>('[data-ui-global-font-range]');
    const numberInput = body.querySelector<HTMLInputElement>('[data-ui-global-font-number]');
    const valueEl = body.querySelector<HTMLElement>('[data-ui-global-font-value]');
    if (rangeInput) {
      rangeInput.value = String(globalFontOffset);
    }
    if (numberInput) {
      numberInput.value = String(globalFontOffset);
    }
    if (valueEl) {
      valueEl.textContent = formatGlobalFontOffset(globalFontOffset);
    }
  }

  private syncUiScaleRow(body: HTMLElement, uiScale: number): void {
    const rangeInput = body.querySelector<HTMLInputElement>('[data-ui-scale-range]');
    const numberInput = body.querySelector<HTMLInputElement>('[data-ui-scale-number]');
    const valueEl = body.querySelector<HTMLElement>('[data-ui-scale-value]');
    if (rangeInput) {
      rangeInput.value = uiScale.toFixed(2);
    }
    if (numberInput) {
      numberInput.value = uiScale.toFixed(2);
    }
    if (valueEl) {
      valueEl.textContent = `${Math.round(uiScale * 100)}%`;
    }
  }

  private syncPerformanceFpsButtons(body: HTMLElement, showFpsMonitor: boolean): void {
    body.querySelectorAll<HTMLButtonElement>('[data-performance-fps-toggle]').forEach((button) => {
      const active = (button.dataset.performanceFpsToggle === 'on') === showFpsMonitor;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  private renderAccountTab(): string {
    return `
      <div class="panel-section account-settings-section">
        <div class="panel-section-title">账号信息</div>
        <div class="account-settings-copy">账号用于登录，登录页输入当前账号或当前角色名都可以进入。设置页这里展示的是当前登录账号。</div>
        <div class="account-settings-field">
          <label for="settings-account-name">当前账号</label>
          <input id="settings-account-name" type="text" value="${escapeHtml(this.currentAccountName)}" readonly />
        </div>
      </div>
      <div class="panel-section account-settings-section">
        <div class="panel-section-title">名称设置</div>
        <div class="account-settings-copy">显示名称是唯一的一字标识；角色名称完整显示在头顶。账号只和其他账号比唯一性，显示名称只和其他显示名称比唯一性，角色名称只和其他角色名称比唯一性；纯中文建议不超过 ${ROLE_NAME_MAX_LENGTH} 个字，纯英文最多 ${ROLE_NAME_MAX_ASCII_LENGTH} 个字符。</div>
        <div class="account-settings-name-grid">
          <div class="account-settings-field account-settings-field--display">
            <label for="settings-display-name">显示名称</label>
            <input id="settings-display-name" class="account-settings-display-input" type="text" value="${escapeHtml(this.currentDisplayName)}" placeholder="字" />
            <div id="settings-display-name-status" class="account-settings-status">当前名称可继续使用</div>
            <div class="account-settings-actions">
              <button id="settings-display-name-submit" class="small-btn" type="button">保存显示名称</button>
            </div>
          </div>
          <div class="account-settings-field">
            <label for="settings-role-name">角色名称</label>
            <input id="settings-role-name" type="text" value="${escapeHtml(this.currentRoleName)}" placeholder="输入角色名称" />
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
          <div class="panel-section-title">界面显示</div>
          <button id="settings-ui-reset" class="small-btn ghost" type="button">恢复默认</button>
        </div>
        <div class="settings-ui-copy">只保留一个全局字号和一个整体界面缩放。两项都会立即生效，并自动保存在当前设备。</div>
        <div class="settings-ui-table">
          <div class="settings-ui-table-row">
            <div class="settings-ui-level-meta">
              <div class="settings-ui-level-name">全局字号</div>
              <div class="settings-ui-level-desc">统一增减全部文字大小，适合“现在字太小”这类情况。</div>
            </div>
            <div class="settings-ui-level-slider">
              <input
                type="range"
                min="${UI_GLOBAL_FONT_OFFSET_RANGE.min}"
                max="${UI_GLOBAL_FONT_OFFSET_RANGE.max}"
                step="${UI_GLOBAL_FONT_OFFSET_RANGE.step}"
                value="${config.globalFontOffset}"
                data-ui-global-font-range
              />
            </div>
            <div class="settings-ui-level-input">
              <input
                type="number"
                min="${UI_GLOBAL_FONT_OFFSET_RANGE.min}"
                max="${UI_GLOBAL_FONT_OFFSET_RANGE.max}"
                step="${UI_GLOBAL_FONT_OFFSET_RANGE.step}"
                value="${config.globalFontOffset}"
                data-ui-global-font-number
              />
              <span data-ui-global-font-value>${formatGlobalFontOffset(config.globalFontOffset)}</span>
            </div>
            <div class="settings-ui-level-preview settings-ui-level-preview--body">山门告示</div>
          </div>
          <div class="settings-ui-table-row">
            <div class="settings-ui-level-meta">
              <div class="settings-ui-level-name">界面缩放</div>
              <div class="settings-ui-level-desc">统一放大常用 UI 尺寸和字号，适合高分屏或 2K / 4K 屏幕。</div>
            </div>
            <div class="settings-ui-level-slider">
              <input
                type="range"
                min="${UI_SCALE_RANGE.min}"
                max="${UI_SCALE_RANGE.max}"
                step="${UI_SCALE_RANGE.step}"
                value="${config.uiScale.toFixed(2)}"
                data-ui-scale-range
              />
            </div>
            <div class="settings-ui-level-input">
              <input
                type="number"
                min="${UI_SCALE_RANGE.min}"
                max="${UI_SCALE_RANGE.max}"
                step="${UI_SCALE_RANGE.step}"
                value="${config.uiScale.toFixed(2)}"
                data-ui-scale-number
              />
              <span data-ui-scale-value>${Math.round(config.uiScale * 100)}%</span>
            </div>
            <div class="settings-ui-level-preview settings-ui-level-preview--title">缩放预览</div>
          </div>
        </div>
        <div id="settings-ui-style-status" class="account-settings-status">当前配置已自动保存到本机</div>
      </div>
    `;
  }

  private renderRedeemTab(): string {
    return `
      <div class="panel-section account-settings-section">
        <div class="panel-section-title">批量兑换</div>
        <div class="settings-ui-copy">支持一次输入多个兑换码。可用换行、空格、中文逗号、英文逗号或分号分隔。兑换在服务端下一息统一执行。</div>
        <div class="account-settings-field">
          <label for="settings-redeem-codes">兑换码列表</label>
          <textarea
            id="settings-redeem-codes"
            class="settings-redeem-textarea"
            spellcheck="false"
            placeholder="每行一个，或用空格 / 逗号分隔多个兑换码"
          ></textarea>
        </div>
        <div class="account-settings-actions">
          <button id="settings-redeem-submit" class="small-btn" type="button">立即兑换</button>
        </div>
        <div id="settings-redeem-status" class="account-settings-status"></div>
        <div id="settings-redeem-results" class="settings-redeem-results"></div>
      </div>
    `;
  }

  private renderPerformanceTab(): string {
    const config = getMapPerformanceConfig();
    return `
      <div class="panel-section account-settings-section">
        <div class="settings-ui-table-head">
          <div class="panel-section-title">地图性能浮层</div>
          <button id="settings-performance-reset" class="small-btn ghost" type="button">恢复默认</button>
        </div>
        <div class="settings-ui-copy">这里的配置只保存在当前设备。默认关闭；开启后会在地图顶部显示 FPS、LOW 与 1% LOW，方便排查全屏、缩放和特效变化带来的帧率波动。</div>
        <div class="settings-performance-card">
          <div class="settings-performance-row">
            <div class="settings-performance-meta">
              <div class="settings-performance-name">显示地图帧率浮层</div>
              <div class="settings-performance-desc">关闭时不显示浮层，也不会启动额外的帧率采样循环。</div>
            </div>
            <div class="settings-performance-actions">
              <button
                class="small-btn ghost${config.showFpsMonitor ? '' : ' active'}"
                type="button"
                data-performance-fps-toggle="off"
                aria-pressed="${config.showFpsMonitor ? 'false' : 'true'}"
              >关闭</button>
              <button
                class="small-btn ghost${config.showFpsMonitor ? ' active' : ''}"
                type="button"
                data-performance-fps-toggle="on"
                aria-pressed="${config.showFpsMonitor ? 'true' : 'false'}"
              >显示</button>
            </div>
          </div>
        </div>
        <div id="settings-performance-status" class="account-settings-status">当前配置已自动保存到本机</div>
      </div>
    `;
  }

  private async handleRedeemSubmit(
    textarea: HTMLTextAreaElement,
    statusEl: HTMLElement,
    resultEl: HTMLElement,
    button: HTMLButtonElement,
  ): Promise<void> {
    if (!this.options) {
      return;
    }
    const codes = parseRedeemCodes(textarea.value);
    if (codes.length === 0) {
      setStatus(statusEl, '请至少填写一个兑换码', 'error');
      resultEl.innerHTML = '';
      return;
    }

    button.disabled = true;
    setStatus(statusEl, '兑换请求已发送，等待本息结算...', '');
    resultEl.innerHTML = '';
    try {
      const result = await this.options.redeemCodes(codes);
      const successCount = result.results.filter((entry) => entry.ok).length;
      const failedCount = result.results.length - successCount;
      setStatus(
        statusEl,
        failedCount > 0 ? `兑换完成：成功 ${successCount}，失败 ${failedCount}` : `兑换完成：成功 ${successCount}`,
        failedCount > 0 ? 'error' : 'success',
      );
      resultEl.innerHTML = result.results.map((entry) => `
        <div class="settings-redeem-result${entry.ok ? ' success' : ' error'}">
          <div class="settings-redeem-result-head">
            <span>${escapeHtml(entry.code)}</span>
            <span>${entry.ok ? '成功' : '失败'}</span>
          </div>
          <div class="settings-redeem-result-body">
            ${escapeHtml(entry.groupName ? `${entry.groupName} · ${entry.message}` : entry.message)}
          </div>
        </div>
      `).join('');
    } catch (error) {
      setStatus(statusEl, error instanceof Error ? error.message : '兑换失败', 'error');
      resultEl.innerHTML = '';
    } finally {
      button.disabled = false;
    }
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

function formatGlobalFontOffset(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}px`;
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

function parseRedeemCodes(raw: string): string[] {
  const entries = raw
    .split(/[\s,，;；]+/u)
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
  return [...new Set(entries)].slice(0, 50);
}
