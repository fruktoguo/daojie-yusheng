/**
 * 设置面板
 * 提供显示名称、角色名称修改、密码修改与兑换码功能
 */
import {
  AccountRedeemCodesRes,
  ROLE_NAME_MAX_ASCII_LENGTH,
  ROLE_NAME_MAX_LENGTH,
} from '@mud/shared';
import type { OfflineGainReportView, PlayerStatisticPeriodTotalView, PlayerStatisticTotalsView } from '@mud/shared';
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
  MapPerformanceConfig,
  resetMapPerformanceConfig,
  updateMapPerformanceConfig,
} from '../performance-config';
import { readOfflineGainReportsFromBrowser, readPlayerStatisticTotalsFromBrowser } from '../../offline-gain-storage';
import {
  formatOfflineGainDuration,
  formatOfflineGainTime,
  formatSignedAmount,
  renderOfflineGainReport,
} from '../offline-gain-render';
import { MAP_TARGET_FPS_RANGE } from '../../constants/ui/performance';
import { t } from '../i18n';
import {
  mountReactSettingsPanel,
  setReactSettingsPanelCallbacks,
  shouldUseReactSettingsPanel,
  syncReactSettingsPanelState,
  unmountReactSettingsPanel,
} from '../../react-ui/panels/settings/mount-settings-panel';

type SettingsTab = 'account' | 'redeem' | 'ui' | 'performance' | 'offlineGain';

function replaceElementHtml(root: HTMLElement, html: string): void {
  root.innerHTML = html;
}

/** 设置面板初始化依赖，提供账号信息读取、保存回调、兑换提交和登出回调。 */
type SettingsPanelOptions = {
/**
 * getCurrentAccountName：CurrentAccount名称名称或显示文本。
 */

  getCurrentAccountName: () => string;  
  /**
 * getCurrentPlayerId：Current玩家ID。
 */

  getCurrentPlayerId: () => string;
  /**
 * getCurrentDisplayName：Current显示名称名称或显示文本。
 */

  getCurrentDisplayName: () => string;  
  /**
 * getCurrentRoleName：CurrentRole名称名称或显示文本。
 */

  getCurrentRoleName: () => string;  
  /**
 * onDisplayNameUpdated：on显示名称Updated相关字段。
 */

  onDisplayNameUpdated: (displayName: string) => void;  
  /**
 * onRoleNameUpdated：onRole名称Updated相关字段。
 */

  onRoleNameUpdated: (roleName: string) => void;  
  /**
 * redeemCodes：redeemCode相关字段。
 */

  redeemCodes: (codes: string[]) => Promise<AccountRedeemCodesRes>;  
  /**
 * onLogout：onLogout相关字段。
 */

  onLogout: () => void;
};

/** SettingsPanel：设置面板实现。 */
export class SettingsPanel {
  /** activeTab：活跃Tab。 */
  private activeTab: SettingsTab = 'account';
  /** currentAccountName：当前账号名称。 */
  private currentAccountName = '';
  /** currentPlayerId：当前玩家ID。 */
  private currentPlayerId = '';
  /** currentDisplayName：当前显示名称。 */
  private currentDisplayName = '';
  /** currentRoleName：当前角色名称。 */
  private currentRoleName = '';
  /** selectedOfflineGainReportId：当前收支统计历史选中记录。 */
  private selectedOfflineGainReportId = '';
  /** displayNameCheckTimer：显示名称检查Timer。 */
  private displayNameCheckTimer: ReturnType<typeof setTimeout> | null = null;
  /** displayNameAbortController：显示名称Abort Controller。 */
  private displayNameAbortController: AbortController | null = null;
  /** displayNameAvailable：显示名称Available。 */
  private displayNameAvailable = false;
  /** 当前设置面板实例持有的读取函数、提交回调和登出回调。 */
  private options: SettingsPanelOptions | null = null;  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @returns 无返回值，完成实例初始化。
 */


  constructor() {
    document.getElementById('hud-open-settings')?.addEventListener('click', () => this.open());
    document.getElementById('hud-logout')?.addEventListener('click', () => {
      this.options?.onLogout();
    });
  }

  /** 注入设置面板运行时依赖。 */
  setOptions(options: SettingsPanelOptions): void {
    this.options = options;
    setReactSettingsPanelCallbacks({
      onDisplayNameUpdated: options.onDisplayNameUpdated,
      onRoleNameUpdated: options.onRoleNameUpdated,
      redeemCodes: options.redeemCodes,
      onLogout: options.onLogout,
    });
  }

  /** 打开设置弹层 */
  open(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.options) {
      return;
    }
    this.currentAccountName = this.options.getCurrentAccountName().normalize('NFC');
    this.currentPlayerId = this.options.getCurrentPlayerId().trim();
    this.currentDisplayName = this.options.getCurrentDisplayName().normalize('NFC');
    this.currentRoleName = this.options.getCurrentRoleName().normalize('NFC');
    this.displayNameAvailable = true;
    this.syncReactState();

    if (this.useReactPanel()) {
      detailModalHost.open({
        ownerId: 'settings-panel',
        size: 'xl',
        variantClass: 'detail-modal--settings',
        title: t('settings.modal.title', undefined),
        subtitle: this.buildSubtitle(),
        hint: t('settings.modal.close-hint', undefined),
        renderBody: (body) => {
          body.replaceChildren();
        },
        onAfterRender: (body, signal) => mountReactSettingsPanel(body, signal),
        onClose: unmountReactSettingsPanel,
      });
      return;
    }

    detailModalHost.open({
      ownerId: 'settings-panel',
      size: 'xl',
      variantClass: 'detail-modal--settings',
      title: t('settings.modal.title', undefined),
      subtitle: this.buildSubtitle(),
      hint: t('settings.modal.close-hint', undefined),
      renderBody: (body) => {
        this.renderBody(body);
      },
      onAfterRender: (body, signal) => {
        this.bindModal(body, signal);
      },
    });
  }

  private useReactPanel(): boolean {
    return shouldUseReactSettingsPanel();
  }

  private buildSubtitle(): string {
    return t('settings.modal.subtitle', {
      account: this.currentAccountName || t('settings.modal.not-logged-in', undefined),
      displayName: this.currentDisplayName || t('settings.modal.not-set', undefined),
      roleName: this.currentRoleName || t('settings.modal.not-set', undefined),
    });
  }

  private syncReactState(): void {
    syncReactSettingsPanelState({
      accountName: this.currentAccountName,
      playerId: this.currentPlayerId,
      displayName: this.currentDisplayName,
      roleName: this.currentRoleName,
    });
  }

  /** renderBody：渲染设置弹层主体。 */
  private renderBody(body: HTMLElement): void {
    replaceElementHtml(body, `
        <div class="settings-modal-shell ui-tabbed-modal-shell">
          <div class="settings-modal-tabs ui-tabbed-modal-tabs" role="tablist" aria-label="${escapeHtml(t('settings.tabs.aria', undefined))}">
            <button
              class="settings-modal-tab ui-tabbed-modal-tab${this.activeTab === 'account' ? ' active' : ''}"
              type="button"
              data-settings-tab="account"
              aria-selected="${this.activeTab === 'account' ? 'true' : 'false'}"
            >${escapeHtml(t('settings.tab.account', undefined))}</button>
            <button
              class="settings-modal-tab ui-tabbed-modal-tab${this.activeTab === 'redeem' ? ' active' : ''}"
              type="button"
              data-settings-tab="redeem"
              aria-selected="${this.activeTab === 'redeem' ? 'true' : 'false'}"
            >${escapeHtml(t('settings.tab.redeem', undefined))}</button>
            <button
              class="settings-modal-tab ui-tabbed-modal-tab${this.activeTab === 'ui' ? ' active' : ''}"
              type="button"
              data-settings-tab="ui"
              aria-selected="${this.activeTab === 'ui' ? 'true' : 'false'}"
            >${escapeHtml(t('settings.tab.ui', undefined))}</button>
            <button
              class="settings-modal-tab ui-tabbed-modal-tab${this.activeTab === 'performance' ? ' active' : ''}"
              type="button"
              data-settings-tab="performance"
              aria-selected="${this.activeTab === 'performance' ? 'true' : 'false'}"
            >${escapeHtml(t('settings.tab.performance', undefined))}</button>
            <button
              class="settings-modal-tab ui-tabbed-modal-tab${this.activeTab === 'offlineGain' ? ' active' : ''}"
              type="button"
              data-settings-tab="offlineGain"
              aria-selected="${this.activeTab === 'offlineGain' ? 'true' : 'false'}"
            >${escapeHtml(t('settings.tab.offline-gain', undefined))}</button>
          </div>
          <div class="settings-modal-pane ui-tabbed-modal-pane${this.activeTab === 'account' ? ' active' : ''}" data-settings-pane="account">
            ${this.renderAccountTab()}
          </div>
          <div class="settings-modal-pane ui-tabbed-modal-pane${this.activeTab === 'redeem' ? ' active' : ''}" data-settings-pane="redeem">
            ${this.renderRedeemTab()}
          </div>
          <div class="settings-modal-pane ui-tabbed-modal-pane${this.activeTab === 'ui' ? ' active' : ''}" data-settings-pane="ui">
            ${this.renderUiTab()}
          </div>
          <div class="settings-modal-pane ui-tabbed-modal-pane${this.activeTab === 'performance' ? ' active' : ''}" data-settings-pane="performance">
            ${this.renderPerformanceTab()}
          </div>
          <div class="settings-modal-pane ui-tabbed-modal-pane${this.activeTab === 'offlineGain' ? ' active' : ''}" data-settings-pane="offlineGain">
            ${this.renderOfflineGainTab()}
          </div>
        </div>
    `);
  }

  /** bindModal：绑定弹窗。 */
  private bindModal(body: HTMLElement, signal: AbortSignal): void {
    this.bindTabs(body, signal);
    this.bindAccountSettings(body, signal);
    this.bindRedeemSettings(body, signal);
    this.bindUiSettings(body, signal);
    this.bindPerformanceSettings(body, signal);
    this.bindOfflineGainSettings(body, signal);
  }

  /** bindTabs：绑定标签页。 */
  private bindTabs(body: HTMLElement, signal: AbortSignal): void {
    body.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextTab = button.dataset.settingsTab;
        if (!isSettingsTab(nextTab)) {
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
        if (nextTab === 'offlineGain') {
          this.refreshOfflineGainPane(body);
        }
      }, { signal });
    });
  }

  /** bindAccountSettings：绑定账号设置。 */
  private bindAccountSettings(body: HTMLElement, signal: AbortSignal): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    }, { signal });
    displayNameSubmit.addEventListener('click', () => {
      void this.handleDisplayNameSubmit(displayNameInput, displayNameStatus, displayNameSubmit);
    }, { signal });
    passwordSubmit.addEventListener('click', () => {
      void this.handlePasswordSubmit(currentPasswordInput, newPasswordInput, passwordStatus, passwordSubmit);
    }, { signal });
    roleNameSubmit.addEventListener('click', () => {
      void this.handleRoleNameSubmit(roleNameInput, roleNameStatus, roleNameSubmit);
    }, { signal });
  }

  /** bindUiSettings：绑定界面设置。 */
  private bindUiSettings(body: HTMLElement, signal: AbortSignal): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        setStatus(styleStatus, t('settings.status.color-mode-switched', {
          mode: colorMode === 'dark'
            ? t('settings.status.mode.dark', undefined)
            : t('settings.status.mode.light', undefined),
        }), 'success');
      }, { signal });
    });

    if (globalRangeInput && globalNumberInput) {
      /** applyGlobalOffset：应用Global偏移。 */
      const applyGlobalOffset = (rawValue: string) => {
        const parsed = Number.parseInt(rawValue, 10);
        const nextValue = Number.isFinite(parsed)
          ? Math.max(UI_GLOBAL_FONT_OFFSET_RANGE.min, Math.min(UI_GLOBAL_FONT_OFFSET_RANGE.max, parsed))
          : UI_GLOBAL_FONT_OFFSET_RANGE.defaultValue;
        const nextConfig = updateUiGlobalFontOffset(nextValue);
        this.syncUiGlobalFontOffsetRow(body, nextConfig.globalFontOffset);
        setStatus(styleStatus, t('settings.status.font-adjusted', undefined), 'success');
      };

      globalRangeInput.addEventListener('input', () => {
        applyGlobalOffset(globalRangeInput.value);
      }, { signal });
      globalNumberInput.addEventListener('input', () => {
        applyGlobalOffset(globalNumberInput.value);
      }, { signal });
      globalNumberInput.addEventListener('blur', () => {
        applyGlobalOffset(globalNumberInput.value);
      }, { signal });
    }

    if (scaleRangeInput && scaleNumberInput) {
      /** applyScale：应用缩放。 */
      const applyScale = (rawValue: string) => {
        const parsed = Number.parseFloat(rawValue);
        const nextValue = Number.isFinite(parsed)
          ? Math.max(UI_SCALE_RANGE.min, Math.min(UI_SCALE_RANGE.max, parsed))
          : UI_SCALE_RANGE.defaultValue;
        const nextConfig = updateUiScale(nextValue);
        this.syncUiScaleRow(body, nextConfig.uiScale);
        setStatus(styleStatus, t('settings.status.scale-adjusted', undefined), 'success');
      };

      scaleRangeInput.addEventListener('input', () => {
        applyScale(scaleRangeInput.value);
      }, { signal });
      scaleNumberInput.addEventListener('input', () => {
        applyScale(scaleNumberInput.value);
      }, { signal });
      scaleNumberInput.addEventListener('blur', () => {
        applyScale(scaleNumberInput.value);
      }, { signal });
    }

    resetButton?.addEventListener('click', () => {
      const nextConfig = resetUiStyleConfig();
      this.syncUiModeButtons(body, nextConfig.colorMode);
      this.syncUiGlobalFontOffsetRow(body, nextConfig.globalFontOffset);
      this.syncUiScaleRow(body, nextConfig.uiScale);
      setStatus(styleStatus, t('settings.status.ui-reset', undefined), 'success');
    }, { signal });
  }

  /** bindRedeemSettings：绑定兑换设置。 */
  private bindRedeemSettings(body: HTMLElement, signal: AbortSignal): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const textarea = body.querySelector<HTMLTextAreaElement>('#settings-redeem-codes');
    const statusEl = body.querySelector<HTMLElement>('#settings-redeem-status');
    const button = body.querySelector<HTMLButtonElement>('#settings-redeem-submit');
    const resultEl = body.querySelector<HTMLElement>('#settings-redeem-results');
    if (!textarea || !statusEl || !button || !resultEl) {
      return;
    }

    button.addEventListener('click', () => {
      void this.handleRedeemSubmit(textarea, statusEl, resultEl, button);
    }, { signal });
  }

  /** bindPerformanceSettings：绑定性能设置。 */
  private bindPerformanceSettings(body: HTMLElement, signal: AbortSignal): void {
    const config = getMapPerformanceConfig();
    const statusEl = body.querySelector<HTMLElement>('#settings-performance-status');
    const resetButton = body.querySelector<HTMLButtonElement>('#settings-performance-reset');
    const fpsNumberInput = body.querySelector<HTMLInputElement>('[data-performance-target-fps-number]');

    this.syncPerformanceControls(body, config);

    body.querySelectorAll<HTMLButtonElement>('[data-performance-fps-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextValue = button.dataset.performanceFpsToggle === 'on';
        const nextConfig = updateMapPerformanceConfig({
          showFpsMonitor: nextValue,
        });
        this.syncPerformanceControls(body, nextConfig);
        setStatus(statusEl, nextConfig.showFpsMonitor
          ? t('settings.status.fps-shown', undefined)
          : t('settings.status.fps-hidden', undefined), 'success');
      }, { signal });
    });

    if (fpsNumberInput) {
      const applyTargetFps = (rawValue: string) => {
        const parsed = Number.parseInt(rawValue, 10);
        const nextValue = Number.isFinite(parsed)
          ? Math.max(MAP_TARGET_FPS_RANGE.min, Math.min(MAP_TARGET_FPS_RANGE.max, parsed))
          : MAP_TARGET_FPS_RANGE.defaultValue;
        const nextConfig = updateMapPerformanceConfig({
          targetFps: nextValue,
        });
        this.syncPerformanceControls(body, nextConfig);
        setStatus(statusEl, t('settings.status.target-fps-adjusted', {
          fps: nextConfig.targetFps,
        }), 'success');
      };
      fpsNumberInput.addEventListener('change', () => {
        applyTargetFps(fpsNumberInput.value);
      }, { signal });
      fpsNumberInput.addEventListener('blur', () => {
        applyTargetFps(fpsNumberInput.value);
      }, { signal });
    }

    resetButton?.addEventListener('click', () => {
      const nextConfig = resetMapPerformanceConfig();
      this.syncPerformanceControls(body, nextConfig);
      setStatus(statusEl, t('settings.status.performance-reset', undefined), 'success');
    }, { signal });
  }

  /** bindOfflineGainSettings：绑定收支统计设置。 */
  private bindOfflineGainSettings(body: HTMLElement, signal: AbortSignal): void {
    body.querySelector<HTMLButtonElement>('#settings-offline-gain-refresh')?.addEventListener('click', () => {
      this.refreshOfflineGainPane(body, t('settings.status.offline-gain-refreshed', undefined));
    }, { signal });
    body.querySelector<HTMLElement>('#settings-offline-gain-list')?.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('[data-offline-gain-report-id]');
      if (!button || !body.contains(button)) {
        return;
      }
      const reportId = button.dataset.offlineGainReportId ?? '';
      if (!reportId) {
        return;
      }
      this.selectOfflineGainHistoryRecord(body, reportId);
    }, { signal });
  }

  /** syncUiModeButtons：同步界面模式按钮。 */
  private syncUiModeButtons(body: HTMLElement, currentMode: UiColorMode): void {
    body.querySelectorAll<HTMLButtonElement>('[data-ui-color-mode]').forEach((button) => {
      const active = button.dataset.uiColorMode === currentMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  /** syncUiGlobalFontOffsetRow：同步界面Global Font偏移Row。 */
  private syncUiGlobalFontOffsetRow(body: HTMLElement, globalFontOffset: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** syncUiScaleRow：同步界面缩放Row。 */
  private syncUiScaleRow(body: HTMLElement, uiScale: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

  /** syncPerformanceControls：同步性能设置控件。 */
  private syncPerformanceControls(body: HTMLElement, config: MapPerformanceConfig): void {
    body.querySelectorAll<HTMLButtonElement>('[data-performance-fps-toggle]').forEach((button) => {
      const active = (button.dataset.performanceFpsToggle === 'on') === config.showFpsMonitor;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const fpsNumberInput = body.querySelector<HTMLInputElement>('[data-performance-target-fps-number]');
    if (fpsNumberInput) {
      fpsNumberInput.value = String(config.targetFps);
    }
  }

  /** renderAccountTab：渲染账号Tab。 */
  private renderAccountTab(): string {
    return `
      <div class="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">${escapeHtml(t('settings.account.section.account', undefined))}</div>
        <div class="account-settings-copy ui-form-copy">${escapeHtml(t('settings.account.copy.account', undefined))}</div>
        <div class="account-settings-field ui-form-field">
          <label class="ui-form-label" for="settings-account-name">${escapeHtml(t('settings.account.label.current-account', undefined))}</label>
          <input id="settings-account-name" class="ui-input" type="text" value="${escapeHtml(this.currentAccountName)}" readonly />
        </div>
      </div>
      <div class="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">${escapeHtml(t('settings.account.section.names', undefined))}</div>
        <div class="account-settings-copy ui-form-copy">${escapeHtml(t('settings.account.copy.names', {
          roleNameMaxLength: ROLE_NAME_MAX_LENGTH,
          roleNameMaxAsciiLength: ROLE_NAME_MAX_ASCII_LENGTH,
        }))}</div>
        <div class="account-settings-name-grid ui-form-grid ui-form-grid--two-column">
          <div class="account-settings-field account-settings-field--display ui-form-field">
            <label class="ui-form-label" for="settings-display-name">${escapeHtml(t('settings.account.label.display-name', undefined))}</label>
            <input id="settings-display-name" class="account-settings-display-input ui-input" type="text" maxlength="1" value="${escapeHtml(this.currentDisplayName)}" placeholder="${escapeHtml(t('settings.account.placeholder.display-name', undefined))}" />
            <div id="settings-display-name-status" class="account-settings-status ui-status-text">${escapeHtml(t('settings.account.status.display-name-current', undefined))}</div>
            <div class="account-settings-actions ui-inline-actions-end ui-action-row">
              <button id="settings-display-name-submit" class="small-btn" type="button">${escapeHtml(t('settings.account.action.save-display-name', undefined))}</button>
            </div>
          </div>
          <div class="account-settings-field ui-form-field">
            <label class="ui-form-label" for="settings-role-name">${escapeHtml(t('settings.account.label.role-name', undefined))}</label>
            <input id="settings-role-name" class="ui-input" type="text" maxlength="${ROLE_NAME_MAX_ASCII_LENGTH}" value="${escapeHtml(this.currentRoleName)}" placeholder="${escapeHtml(t('settings.account.placeholder.role-name', undefined))}" />
            <div id="settings-role-name-status" class="account-settings-status ui-status-text"></div>
            <div class="account-settings-actions ui-inline-actions-end ui-action-row">
              <button id="settings-role-name-submit" class="small-btn" type="button">${escapeHtml(t('settings.account.action.save-role-name', undefined))}</button>
            </div>
          </div>
        </div>
      </div>
      <div class="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">${escapeHtml(t('settings.account.section.password', undefined))}</div>
        <div class="account-settings-field ui-form-field">
          <label class="ui-form-label" for="settings-current-password">${escapeHtml(t('settings.account.label.current-password', undefined))}</label>
          <input id="settings-current-password" class="ui-input" type="password" placeholder="${escapeHtml(t('settings.account.placeholder.current-password', undefined))}" />
        </div>
        <div class="account-settings-field ui-form-field">
          <label class="ui-form-label" for="settings-new-password">${escapeHtml(t('settings.account.label.new-password', undefined))}</label>
          <input id="settings-new-password" class="ui-input" type="password" placeholder="${escapeHtml(t('settings.account.placeholder.new-password', undefined))}" />
        </div>
        <div id="settings-password-status" class="account-settings-status ui-status-text"></div>
        <div class="account-settings-actions ui-inline-actions-end ui-action-row">
          <button id="settings-password-submit" class="small-btn" type="button">${escapeHtml(t('settings.account.action.save-password', undefined))}</button>
        </div>
      </div>
    `;
  }

  /** renderUiTab：渲染界面Tab。 */
  private renderUiTab(): string {
    const config = getUiStyleConfig();
    return `
      <div class="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">${escapeHtml(t('settings.ui.section.color-mode', undefined))}</div>
        <div class="settings-ui-copy ui-form-copy">${escapeHtml(t('settings.ui.copy.color-mode', undefined))}</div>
        <div class="settings-ui-mode-row">
          ${UI_COLOR_MODE_OPTIONS.map((option) => `
            <button
              class="small-btn ghost${config.colorMode === option.value ? ' active' : ''}"
              type="button"
              data-ui-color-mode="${option.value}"
              aria-pressed="${config.colorMode === option.value ? 'true' : 'false'}"
              aria-label="${escapeHtml(option.description)}"
            >${option.label}</button>
          `).join('')}
        </div>
      </div>
      <div class="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div class="settings-ui-table-head">
    <div class="panel-section-title">${escapeHtml(t('settings.ui.section.display', undefined))}</div>
          <button id="settings-ui-reset" class="small-btn ghost" type="button">${escapeHtml(t('settings.common.action.reset-default', undefined))}</button>
        </div>
        <div class="settings-ui-copy ui-form-copy">${escapeHtml(t('settings.ui.copy.display', undefined))}</div>
        <div class="settings-ui-table ui-data-table">
          <div class="settings-ui-table-row ui-data-table-row">
            <div class="settings-ui-level-meta ui-data-table-meta">
              <div class="settings-ui-level-name ui-data-table-name">${escapeHtml(t('settings.ui.label.global-font', undefined))}</div>
              <div class="settings-ui-level-desc ui-data-table-desc">${escapeHtml(t('settings.ui.desc.global-font', undefined))}</div>
            </div>
            <div class="settings-ui-level-slider ui-data-table-control">
              <input
                type="range"
                min="${UI_GLOBAL_FONT_OFFSET_RANGE.min}"
                max="${UI_GLOBAL_FONT_OFFSET_RANGE.max}"
                step="${UI_GLOBAL_FONT_OFFSET_RANGE.step}"
                value="${config.globalFontOffset}"
                data-ui-global-font-range
              />
            </div>
            <div class="settings-ui-level-input ui-data-table-input-group">
              <input
                class="ui-input"
                type="number"
                min="${UI_GLOBAL_FONT_OFFSET_RANGE.min}"
                max="${UI_GLOBAL_FONT_OFFSET_RANGE.max}"
                step="${UI_GLOBAL_FONT_OFFSET_RANGE.step}"
                value="${config.globalFontOffset}"
                data-ui-global-font-number
              />
              <span data-ui-global-font-value>${formatGlobalFontOffset(config.globalFontOffset)}</span>
            </div>
            <div class="settings-ui-level-preview settings-ui-level-preview--body ui-data-table-preview ui-data-table-preview--body">${escapeHtml(t('settings.ui.preview.body', undefined))}</div>
          </div>
          <div class="settings-ui-table-row ui-data-table-row">
            <div class="settings-ui-level-meta ui-data-table-meta">
              <div class="settings-ui-level-name ui-data-table-name">${escapeHtml(t('settings.ui.label.scale', undefined))}</div>
              <div class="settings-ui-level-desc ui-data-table-desc">${escapeHtml(t('settings.ui.desc.scale', undefined))}</div>
            </div>
            <div class="settings-ui-level-slider ui-data-table-control">
              <input
                type="range"
                min="${UI_SCALE_RANGE.min}"
                max="${UI_SCALE_RANGE.max}"
                step="${UI_SCALE_RANGE.step}"
                value="${config.uiScale.toFixed(2)}"
                data-ui-scale-range
              />
            </div>
            <div class="settings-ui-level-input ui-data-table-input-group">
              <input
                class="ui-input"
                type="number"
                min="${UI_SCALE_RANGE.min}"
                max="${UI_SCALE_RANGE.max}"
                step="${UI_SCALE_RANGE.step}"
                value="${config.uiScale.toFixed(2)}"
                data-ui-scale-number
              />
              <span data-ui-scale-value>${Math.round(config.uiScale * 100)}%</span>
            </div>
            <div class="settings-ui-level-preview settings-ui-level-preview--title ui-data-table-preview ui-data-table-preview--title">${escapeHtml(t('settings.ui.preview.scale', undefined))}</div>
          </div>
        </div>
      <div id="settings-ui-style-status" class="account-settings-status ui-status-text">${escapeHtml(t('settings.ui.status.saved-local', undefined))}</div>
      </div>
    `;
  }

  /** renderRedeemTab：渲染兑换Tab。 */
  private renderRedeemTab(): string {
    return `
      <div class="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div class="panel-section-title">${escapeHtml(t('settings.redeem.section.bulk', undefined))}</div>
        <div class="settings-ui-copy ui-form-copy">${escapeHtml(t('settings.redeem.copy.bulk', undefined))}</div>
        <div class="account-settings-field ui-form-field">
          <label class="ui-form-label" for="settings-redeem-codes">${escapeHtml(t('settings.redeem.label.codes', undefined))}</label>
          <textarea
            id="settings-redeem-codes"
            class="settings-redeem-textarea ui-textarea"
            spellcheck="false"
            placeholder="${escapeHtml(t('settings.redeem.placeholder.codes', undefined))}"
          ></textarea>
        </div>
        <div class="account-settings-actions ui-inline-actions-end ui-action-row">
          <button id="settings-redeem-submit" class="small-btn" type="button">${escapeHtml(t('settings.redeem.action.submit', undefined))}</button>
        </div>
        <div id="settings-redeem-status" class="account-settings-status ui-status-text"></div>
        <div id="settings-redeem-results" class="settings-redeem-results ui-card-list"></div>
      </div>
    `;
  }

  /** renderPerformanceTab：渲染性能Tab。 */
  private renderPerformanceTab(): string {
    const config = getMapPerformanceConfig();
    return `
      <div class="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack">
        <div class="settings-ui-table-head">
    <div class="panel-section-title">${escapeHtml(t('settings.performance.section.overlay', undefined))}</div>
          <button id="settings-performance-reset" class="small-btn ghost" type="button">${escapeHtml(t('settings.common.action.reset-default', undefined))}</button>
        </div>
        <div class="settings-ui-copy ui-form-copy">${escapeHtml(t('settings.performance.copy.overlay', undefined))}</div>
        <div class="settings-performance-card ui-card-list">
          <div class="settings-performance-row ui-data-table-row">
            <div class="settings-performance-meta ui-data-table-meta">
              <div class="settings-performance-name ui-data-table-name">${escapeHtml(t('settings.performance.label.show-fps', undefined))}</div>
              <div class="settings-performance-desc ui-data-table-desc">${escapeHtml(t('settings.performance.desc.show-fps', undefined))}</div>
            </div>
            <div class="settings-performance-actions ui-inline-actions-end-wrap">
              <button
                class="small-btn ghost${config.showFpsMonitor ? '' : ' active'}"
                type="button"
                data-performance-fps-toggle="off"
                aria-pressed="${config.showFpsMonitor ? 'false' : 'true'}"
              >${escapeHtml(t('settings.common.action.off', undefined))}</button>
              <button
                class="small-btn ghost${config.showFpsMonitor ? ' active' : ''}"
                type="button"
                data-performance-fps-toggle="on"
                aria-pressed="${config.showFpsMonitor ? 'true' : 'false'}"
              >${escapeHtml(t('settings.common.action.show', undefined))}</button>
            </div>
          </div>
          <div class="settings-performance-row ui-data-table-row">
            <div class="settings-performance-meta ui-data-table-meta">
              <div class="settings-performance-name ui-data-table-name">${escapeHtml(t('settings.performance.label.target-fps', undefined))}</div>
              <div class="settings-performance-desc ui-data-table-desc">${escapeHtml(t('settings.performance.desc.target-fps', {
                min: MAP_TARGET_FPS_RANGE.min,
                max: MAP_TARGET_FPS_RANGE.max,
              }))}</div>
            </div>
            <div class="settings-performance-actions ui-inline-actions-end-wrap settings-performance-actions--numeric">
              <input
                class="settings-performance-number-input ui-input"
                type="number"
                inputmode="numeric"
                min="${MAP_TARGET_FPS_RANGE.min}"
                max="${MAP_TARGET_FPS_RANGE.max}"
                step="1"
                value="${config.targetFps}"
                data-performance-target-fps-number="1"
              />
              <span class="settings-performance-number-unit">FPS</span>
            </div>
          </div>
        </div>
        <div id="settings-performance-status" class="account-settings-status ui-status-text">${escapeHtml(t('settings.ui.status.saved-local', undefined))}</div>
      </div>
    `;
  }  

  /** renderOfflineGainTab：渲染收支统计Tab。 */
  private renderOfflineGainTab(): string {
    const reports = this.readCurrentOfflineGainReports();
    const totals = this.readCurrentPlayerStatisticTotals();
    return `
      <div class="panel-section account-settings-section ui-surface-pane ui-surface-pane--stack settings-offline-gain-shell">
        <div class="settings-ui-table-head">
          <div class="panel-section-title">${escapeHtml(t('settings.offline-gain.section.title', undefined))}</div>
          <button id="settings-offline-gain-refresh" class="small-btn ghost" type="button">${escapeHtml(t('settings.common.action.refresh', undefined))}</button>
        </div>
        <div class="settings-ui-copy ui-form-copy">${escapeHtml(t('settings.offline-gain.copy.summary', undefined))}</div>
        <div id="settings-offline-gain-summary">
          ${this.renderOfflineGainHistorySummary(totals)}
        </div>
        <div id="settings-offline-gain-list" class="settings-offline-gain-list">
          ${this.renderOfflineGainHistoryList(reports)}
        </div>
        <div id="settings-offline-gain-status" class="account-settings-status ui-status-text">${escapeHtml(t('settings.offline-gain.status.source', undefined))}</div>
      </div>
    `;
  }

  /** refreshOfflineGainPane：刷新收支统计Pane。 */
  private refreshOfflineGainPane(body: HTMLElement, statusMessage = ''): void {
    const reports = this.readCurrentOfflineGainReports();
    const totals = this.readCurrentPlayerStatisticTotals();
    const summaryEl = body.querySelector<HTMLElement>('#settings-offline-gain-summary');
    const listEl = body.querySelector<HTMLElement>('#settings-offline-gain-list');
    const statusEl = body.querySelector<HTMLElement>('#settings-offline-gain-status');
    if (summaryEl) {
      replaceElementHtml(summaryEl, this.renderOfflineGainHistorySummary(totals));
    }
    if (listEl) {
      replaceElementHtml(listEl, this.renderOfflineGainHistoryList(reports));
    }
    if (statusMessage) {
      setStatus(statusEl, statusMessage, 'success');
    }
  }

  /** readCurrentOfflineGainReports：读取当前玩家本地收支统计。 */
  private readCurrentOfflineGainReports(): OfflineGainReportView[] {
    return readOfflineGainReportsFromBrowser(this.currentPlayerId || this.currentAccountName || 'anonymous');
  }

  /** readCurrentPlayerStatisticTotals：读取服务端总账的本机展示缓存。 */
  private readCurrentPlayerStatisticTotals(): PlayerStatisticTotalsView | null {
    return readPlayerStatisticTotalsFromBrowser(this.currentPlayerId || this.currentAccountName || 'anonymous');
  }

  /** renderOfflineGainHistorySummary：渲染收支统计汇总。 */
  private renderOfflineGainHistorySummary(totals: PlayerStatisticTotalsView | null): string {
    return `
      <div class="settings-offline-gain-summary">
        ${this.renderStatisticPeriodCard(t('settings.offline-gain.period.today', undefined), totals?.today)}
        ${this.renderStatisticPeriodCard(t('settings.offline-gain.period.yesterday', undefined), totals?.yesterday)}
        ${this.renderStatisticPeriodCard(t('settings.offline-gain.period.week', undefined), totals?.week)}
      </div>
    `;
  }

  /** renderStatisticPeriodCard：渲染统计周期卡片。 */
  private renderStatisticPeriodCard(title: string, totalValue: PlayerStatisticPeriodTotalView | null | undefined): string {
    const total = normalizeStatisticPeriodTotal(totalValue);
    return `
      <div class="settings-offline-gain-stat ui-surface-card ui-surface-card--compact">
        <span class="settings-offline-gain-stat-title">${escapeHtml(title)}</span>
        <div class="settings-offline-gain-stat-line">
          <small>${escapeHtml(t('settings.offline-gain.metric.spirit-stones', undefined))}</small>
          <strong>${escapeHtml(formatSignedAmount(total.spiritStones.gained, total.spiritStones.lost))}</strong>
        </div>
        <div class="settings-offline-gain-stat-line">
          <small>${escapeHtml(t('settings.offline-gain.metric.progress', undefined))}</small>
          <strong>${escapeHtml(formatSignedAmount(total.progress.gained, total.progress.lost))}</strong>
        </div>
        <div class="settings-offline-gain-stat-line">
          <small>${escapeHtml(t('settings.offline-gain.metric.techniques', undefined))}</small>
          <strong>${escapeHtml(formatSignedAmount(total.techniques.gained, total.techniques.lost))}</strong>
        </div>
        <div class="settings-offline-gain-stat-line">
          <small>${escapeHtml(t('settings.offline-gain.metric.professions', undefined))}</small>
          <strong>${escapeHtml(formatSignedAmount(total.professions.gained, total.professions.lost))}</strong>
        </div>
      </div>
    `;
  }

  /** renderOfflineGainHistoryList：渲染收支统计历史列表。 */
  private renderOfflineGainHistoryList(reports: OfflineGainReportView[]): string {
    if (reports.length === 0) {
      return `<div class="ui-empty-hint compact settings-offline-gain-empty">${escapeHtml(t('settings.offline-gain.empty.history', undefined))}</div>`;
    }
    const selected = resolveSelectedOfflineGainReport(reports, this.selectedOfflineGainReportId) ?? reports[0];
    return `
      <div class="settings-offline-gain-history-layout">
        <div class="settings-offline-gain-record-list" role="listbox" aria-label="${escapeHtml(t('settings.offline-gain.aria.history', undefined))}">
          ${reports.map((report) => this.renderOfflineGainHistoryListItem(report, selected.id)).join('')}
        </div>
        <div id="settings-offline-gain-detail" class="settings-offline-gain-detail">
          ${renderOfflineGainReport(selected)}
        </div>
      </div>
    `;
  }

  /** renderOfflineGainHistoryListItem：渲染收支统计历史索引项。 */
  private renderOfflineGainHistoryListItem(report: OfflineGainReportView, selectedReportId: string): string {
    const active = report.id === selectedReportId;
    return `
      <button
        class="settings-offline-gain-record-button${active ? ' active' : ''}"
        type="button"
        role="option"
        aria-selected="${active ? 'true' : 'false'}"
        data-offline-gain-report-id="${escapeHtml(report.id)}"
      >
        <span class="settings-offline-gain-record-date">${escapeHtml(formatOfflineGainTime(report.endedAt))}</span>
        <span class="settings-offline-gain-record-meta">${escapeHtml(t('settings.offline-gain.record.duration', {
          duration: formatOfflineGainDuration(report.durationMs),
        }))}</span>
      </button>
    `;
  }

  /** selectOfflineGainHistoryRecord：切换历史记录详情。 */
  private selectOfflineGainHistoryRecord(body: HTMLElement, reportId: string): void {
    const reports = this.readCurrentOfflineGainReports();
    const selected = reports.find((report) => report.id === reportId);
    if (!selected) {
      return;
    }
    this.selectedOfflineGainReportId = selected.id;
    body.querySelectorAll<HTMLButtonElement>('[data-offline-gain-report-id]').forEach((button) => {
      const active = button.dataset.offlineGainReportId === selected.id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const detailEl = body.querySelector<HTMLElement>('#settings-offline-gain-detail');
    if (detailEl) {
      replaceElementHtml(detailEl, renderOfflineGainReport(selected));
    }
  }

  /**
 * handleRedeemSubmit：处理RedeemSubmit并更新相关状态。
 * @param textarea HTMLTextAreaElement 参数说明。
 * @param statusEl HTMLElement 参数说明。
 * @param resultEl HTMLElement 参数说明。
 * @param button HTMLButtonElement 参数说明。
 * @returns 返回 Promise，完成后得到RedeemSubmit。
 */


  private async handleRedeemSubmit(
    textarea: HTMLTextAreaElement,
    statusEl: HTMLElement,
    resultEl: HTMLElement,
    button: HTMLButtonElement,
  ): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.options) {
      return;
    }
    const codes = parseRedeemCodes(textarea.value);
    if (codes.length === 0) {
      setStatus(statusEl, t('settings.redeem.error.empty', undefined), 'error');
      resultEl.replaceChildren();
      return;
    }

    button.disabled = true;
      setStatus(statusEl, t('settings.redeem.status.submitted', undefined), '');
    resultEl.replaceChildren();
    try {
      const result = await this.options.redeemCodes(codes);
      const successCount = result.results.filter((entry) => entry.ok).length;
      const failedCount = result.results.length - successCount;
      setStatus(
        statusEl,
        failedCount > 0
          ? t('settings.redeem.status.result-mixed', {
            successCount,
            failedCount,
          })
          : t('settings.redeem.status.result-success', { successCount }),
        failedCount > 0 ? 'error' : 'success',
      );
      resultEl.replaceChildren(...result.results.map((entry) => this.createRedeemResultCard(entry)));
    } catch (error) {
      setStatus(statusEl, error instanceof Error ? error.message : t('settings.redeem.error.failed', undefined), 'error');
      resultEl.replaceChildren();
    } finally {
      button.disabled = false;
    }
  }

  /** createRedeemResultCard：创建兑换结果卡片。 */
  private createRedeemResultCard(entry: AccountRedeemCodesRes['results'][number]): HTMLElement {
    const card = document.createElement('div');
    card.className = `settings-redeem-result ui-surface-card ui-surface-card--compact${entry.ok ? ' success' : ' error'}`;
    const head = document.createElement('div');
    head.className = 'settings-redeem-result-head';
    const code = document.createElement('span');
    code.textContent = entry.code;
    const status = document.createElement('span');
    status.textContent = entry.ok
      ? t('settings.redeem.result.success', undefined)
      : t('settings.redeem.result.failed', undefined);
    head.append(code, status);

    const body = document.createElement('div');
    body.className = 'settings-redeem-result-body';
    body.textContent = entry.groupName ? `${entry.groupName} · ${entry.message}` : entry.message;
    card.append(head, body);
    return card;
  }  
  /**
 * scheduleDisplayNameCheck：判断schedule显示名称Check是否满足条件。
 * @param input HTMLInputElement 输入参数。
 * @param statusEl HTMLElement 参数说明。
 * @returns 返回 Promise，完成后得到schedule显示名称Check。
 */


  private async scheduleDisplayNameCheck(
    input: HTMLInputElement,
    statusEl: HTMLElement,
  ): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.displayNameCheckTimer) {
      clearTimeout(this.displayNameCheckTimer);
    }
    const displayName = input.value.normalize('NFC');
    if (displayName === this.currentDisplayName) {
      this.displayNameAvailable = true;
      setStatus(statusEl, t('settings.account.status.display-name-available-current', undefined), '');
      return;
    }

    const localError = validateDisplayName(displayName);
    if (localError) {
      this.displayNameAvailable = false;
      setStatus(statusEl, localError, 'error');
      return;
    }

    setStatus(statusEl, t('settings.account.status.checking', undefined), '');
    this.displayNameCheckTimer = setTimeout(() => {
      void this.checkDisplayName(displayName, statusEl);
    }, 250);
  }

  /** checkDisplayName：处理检查显示名称。 */
  private async checkDisplayName(displayName: string, statusEl: HTMLElement): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (displayName === this.currentDisplayName) {
      this.displayNameAvailable = true;
      setStatus(statusEl, t('settings.account.status.display-name-available-current', undefined), '');
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
        result.available ? t('settings.account.status.display-name-available', undefined) : (result.message ?? t('settings.account.status.display-name-taken', undefined)),
        result.available ? 'success' : 'error',
      );
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      this.displayNameAvailable = false;
      setStatus(statusEl, error instanceof Error ? error.message : t('settings.account.error.check-failed', undefined), 'error');
    }
  }  
  /**
 * handleDisplayNameSubmit：判断显示名称Submit是否满足条件。
 * @param input HTMLInputElement 输入参数。
 * @param statusEl HTMLElement 参数说明。
 * @param button HTMLButtonElement 参数说明。
 * @returns 返回 Promise，完成后得到显示名称Submit。
 */


  private async handleDisplayNameSubmit(
    input: HTMLInputElement,
    statusEl: HTMLElement,
    button: HTMLButtonElement,
  ): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatus(statusEl, t('settings.account.error.login-expired', undefined), 'error');
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
    setStatus(statusEl, t('settings.account.status.saving', undefined), '');
    try {
      const result = await updateDisplayName(accessToken, { displayName });
      this.currentDisplayName = result.displayName;
      this.displayNameAvailable = true;
      input.value = result.displayName;
      this.options?.onDisplayNameUpdated(result.displayName);
      setStatus(statusEl, t('settings.account.status.display-name-saved', undefined), 'success');
    } catch (error) {
      setStatus(statusEl, error instanceof Error ? error.message : t('settings.account.error.save-failed', undefined), 'error');
    } finally {
      button.disabled = false;
    }
  }  
  /**
 * handlePasswordSubmit：处理PasswordSubmit并更新相关状态。
 * @param currentPasswordInput HTMLInputElement 参数说明。
 * @param newPasswordInput HTMLInputElement 参数说明。
 * @param statusEl HTMLElement 参数说明。
 * @param button HTMLButtonElement 参数说明。
 * @returns 返回 Promise，完成后得到PasswordSubmit。
 */


  private async handlePasswordSubmit(
    currentPasswordInput: HTMLInputElement,
    newPasswordInput: HTMLInputElement,
    statusEl: HTMLElement,
    button: HTMLButtonElement,
  ): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatus(statusEl, t('settings.account.error.login-expired', undefined), 'error');
      return;
    }

    if (!currentPasswordInput.value) {
      setStatus(statusEl, t('settings.account.error.current-password-empty', undefined), 'error');
      return;
    }
    const passwordError = validatePassword(newPasswordInput.value);
    if (passwordError) {
      setStatus(statusEl, passwordError, 'error');
      return;
    }

    button.disabled = true;
    setStatus(statusEl, t('settings.account.status.saving', undefined), '');
    try {
      await updatePassword(accessToken, {
        currentPassword: currentPasswordInput.value,
        newPassword: newPasswordInput.value,
      });
      currentPasswordInput.value = '';
      newPasswordInput.value = '';
      setStatus(statusEl, t('settings.account.status.password-saved', undefined), 'success');
    } catch (error) {
      setStatus(statusEl, error instanceof Error ? error.message : t('settings.account.error.save-failed', undefined), 'error');
    } finally {
      button.disabled = false;
    }
  }  
  /**
 * handleRoleNameSubmit：处理Role名称Submit并更新相关状态。
 * @param input HTMLInputElement 输入参数。
 * @param statusEl HTMLElement 参数说明。
 * @param button HTMLButtonElement 参数说明。
 * @returns 返回 Promise，完成后得到Role名称Submit。
 */


  private async handleRoleNameSubmit(
    input: HTMLInputElement,
    statusEl: HTMLElement,
    button: HTMLButtonElement,
  ): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatus(statusEl, t('settings.account.error.login-expired', undefined), 'error');
      return;
    }

    const roleName = input.value.normalize('NFC').trim();
    const roleNameError = validateRoleName(roleName);
    if (roleNameError) {
      setStatus(statusEl, roleNameError, 'error');
      return;
    }
    if (roleName === this.currentRoleName) {
      setStatus(statusEl, t('settings.account.status.role-name-unchanged', undefined), '');
      return;
    }

    button.disabled = true;
    setStatus(statusEl, t('settings.account.status.saving', undefined), '');
    try {
      const result = await updateRoleName(accessToken, { roleName });
      this.currentRoleName = result.roleName;
      input.value = result.roleName;
      this.options?.onRoleNameUpdated(result.roleName);
      setStatus(statusEl, t('settings.account.status.role-name-saved', undefined), 'success');
    } catch (error) {
      setStatus(statusEl, error instanceof Error ? error.message : t('settings.account.error.save-failed', undefined), 'error');
    } finally {
      button.disabled = false;
    }
  }
}

/** formatGlobalFontOffset：格式化Global Font偏移。 */
function formatGlobalFontOffset(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}px`;
}

/** setStatus：处理set状态。 */
function setStatus(target: HTMLElement | null, message: string, tone: '' | 'success' | 'error'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!target) {
    return;
  }
  target.textContent = message;
  target.classList.remove('success', 'error');
  if (tone) {
    target.classList.add(tone);
  }
}

/** isSettingsTab：判断设置标签是否合法。 */
function isSettingsTab(value: string | undefined): value is SettingsTab {
  return value === 'account'
    || value === 'redeem'
    || value === 'ui'
    || value === 'performance'
    || value === 'offlineGain';
}

function resolveSelectedOfflineGainReport(reports: OfflineGainReportView[], selectedReportId: string): OfflineGainReportView | null {
  if (reports.length === 0) {
    return null;
  }
  return reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null;
}

function normalizeStatisticPeriodTotal(total: PlayerStatisticPeriodTotalView | null | undefined): PlayerStatisticPeriodTotalView {
  return {
    spiritStones: normalizeStatisticAmount(total?.spiritStones),
    progress: normalizeStatisticAmount(total?.progress),
    techniques: normalizeStatisticAmount(total?.techniques),
    professions: normalizeStatisticAmount(total?.professions),
  };
}

function normalizeStatisticAmount(value: PlayerStatisticPeriodTotalView['spiritStones'] | null | undefined): { gained: number; lost: number; net: number } {
  const gained = Math.max(0, Math.trunc(Number(value?.gained ?? 0) || 0));
  const lost = Math.max(0, Math.trunc(Number(value?.lost ?? 0) || 0));
  return {
    gained,
    lost,
    net: gained - lost,
  };
}

/** escapeHtml：转义 HTML 文本中的危险字符。 */
function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** parseRedeemCodes：解析兑换兑换码。 */
function parseRedeemCodes(raw: string): string[] {
  const entries = raw
    .split(/[\s,，;；]+/u)
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
  return [...new Set(entries)].slice(0, 50);
}
