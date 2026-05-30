/**
 * 本文件是客户端 DOM UI 的 login 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 登录/注册界面
 * 管理登录、注册表单切换，显示名称可用性检测，以及 token 会话恢复
 */

import { AUTH_REGISTER_ACTIVATION_REQUIRED_CODE, AuthLoginReq, AuthRegisterReq, AuthTokenRes } from '@mud/shared';
import { SocketManager } from '../network/socket';
import {
  checkDisplayNameAvailability,
  clearStoredTokens,
  getRefreshToken,
  requestJson,
  RequestError,
  restoreTokens,
  storeTokens,
} from './auth-api';
import { AUTH_API_BASE_PATH } from '../constants/api';
import { QQ_GROUP_NUMBER } from '../main-dom-elements';
import { validateAccountName, validateDisplayName, validatePassword, validateRoleName } from './account-rules';
import { t } from './i18n';

/** AuthMode：模式枚举。 */
type AuthMode = 'login' | 'register';

/** LoginUI：Login界面实现。 */
export class LoginUI {
  /** overlay：overlay。 */
  private overlay = document.getElementById('login-overlay')!;
  /** loginTab：login Tab。 */
  private loginTab = document.getElementById('tab-login') as HTMLButtonElement;
  /** registerTab：register Tab。 */
  private registerTab = document.getElementById('tab-register') as HTMLButtonElement;
  /** loginNameGroup：login名称分组。 */
  private loginNameGroup = document.getElementById('login-name-group') as HTMLElement;
  /** loginNameLabel：login名称标签。 */
  private loginNameLabel = document.getElementById('login-name-label')!;
  /** loginNameInput：login名称输入。 */
  private loginNameInput = document.getElementById('input-login-name') as HTMLInputElement;
  /** passwordInput：密码输入。 */
  private passwordInput = document.getElementById('input-password') as HTMLInputElement;
  /** registerAccountGroup：register账号分组。 */
  private registerAccountGroup = document.getElementById('register-account-group') as HTMLElement;
  /** accountNameInput：账号名称输入。 */
  private accountNameInput = document.getElementById('input-account-name') as HTMLInputElement;
  /** roleNameGroup：角色名称分组。 */
  private roleNameGroup = document.getElementById('register-role-name-group') as HTMLElement;
  /** roleNameInput：角色名称输入。 */
  private roleNameInput = document.getElementById('input-role-name') as HTMLInputElement;
  /** displayNameGroup：显示名称分组。 */
  private displayNameGroup = document.getElementById('register-display-name-group') as HTMLElement;
  /** displayNameInput：显示名称输入。 */
  private displayNameInput = document.getElementById('input-display-name') as HTMLInputElement;
  /** displayNameStatus：显示名称状态。 */
  private displayNameStatus = document.getElementById('display-name-status')!;
  /** invitationCodeGroup：邀请码输入分组。 */
  private invitationCodeGroup = document.getElementById('register-invitation-code-group') as HTMLElement;
  /** invitationCodeInput：邀请码输入。 */
  private invitationCodeInput = document.getElementById('input-invitation-code') as HTMLInputElement;
  /** submitBtn：submit按钮。 */
  private submitBtn = document.getElementById('btn-auth-submit') as HTMLButtonElement;
  /** submitText：submit文本。 */
  private submitText = document.getElementById('auth-submit-text')!;
  /** errorDiv：错误Div。 */
  private errorDiv = document.getElementById('login-error')!;
  /** displayNameCheckTimer：显示名称检查Timer。 */
  private displayNameCheckTimer: ReturnType<typeof setTimeout> | null = null;
  /** displayNameAbortController：显示名称Abort Controller。 */
  private displayNameAbortController: AbortController | null = null;
  /** displayNameAvailable：显示名称Available。 */
  private displayNameAvailable = false;
  /** mode：模式。 */
  private mode: AuthMode | null = null;
  /** restoreSessionPromise：restore会话异步结果。 */
  private restoreSessionPromise: Promise<boolean> | null = null;  
  private activationModal: HTMLElement | null = null;
  private activationCodeInput: HTMLInputElement | null = null;
  private activationStatus: HTMLElement | null = null;
  private activationResolve: ((value: string | null) => void) | null = null;
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param socket SocketManager 参数说明。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(private socket: SocketManager) {
    this.loginTab.addEventListener('click', () => this.setMode('login'));
    this.registerTab.addEventListener('click', () => this.setMode('register'));
    this.submitBtn.addEventListener('click', () => {
      void this.handleSubmit();
    });
    this.displayNameInput.addEventListener('input', () => {
      void this.scheduleDisplayNameCheck();
    });
    const invitationCode = resolveInvitationCodeFromUrl();
    if (invitationCode) {
      this.invitationCodeInput.value = invitationCode.slice(0, 80);
    }
    this.setMode(invitationCode ? 'register' : 'login');
  }

  /** 尝试用当前会话里的 refreshToken 恢复登录态 */
  async restoreSession(): Promise<boolean> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.restoreSessionPromise) {
      return this.restoreSessionPromise;
    }
    this.restoreSessionPromise = this.performRestoreSession().finally(() => {
      this.restoreSessionPromise = null;
    });
    return this.restoreSessionPromise;
  }

  /** performRestoreSession：处理perform Restore会话。 */
  private async performRestoreSession(): Promise<boolean> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    this.setError(t('login.restore.in-progress', undefined));
    try {
      const data = await restoreTokens(refreshToken);
      this.onSuccess(data);
      this.setError('');
      return true;
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) {
        this.clearSession();
      }
      this.show();
      this.setError(error instanceof Error ? error.message : t('login.restore.failed', undefined));
      return false;
    }
  }

  /** show：处理显示。 */
  show(message = ''): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.setMode('login');
    this.overlay.classList.remove('hidden');
    if (message) {
      this.setError(message);
    }
  }

  /** hide：处理hide。 */
  hide(): void {
    this.overlay.classList.add('hidden');
  }

  /** 登出并显示登录界面 */
  logout(message = ''): void {
    this.clearSession();
    this.show(message);
  }

  /** clearSession：清理会话。 */
  clearSession(): void {
    clearStoredTokens();
  }

  /** hasRefreshToken：判断是否Refresh令牌。 */
  hasRefreshToken(): boolean {
    return Boolean(getRefreshToken());
  }

  /** handleSubmit：处理Submit。 */
  private async handleSubmit(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.mode === 'register') {
      await this.handleRegister();
      return;
    }
    await this.handleLogin();
  }

  /** handleLogin：处理Login。 */
  private async handleLogin(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const body: AuthLoginReq = {
      loginName: this.loginNameInput.value.normalize('NFC'),
      password: this.passwordInput.value,
    };
    try {
      const data = await requestJson<AuthTokenRes>(`${AUTH_API_BASE_PATH}/login`, {
        method: 'POST',
        body,
      });
      this.onSuccess(data);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : t('login.error.login-failed', undefined));
    }
  }

  /** handleRegister：处理Register。 */
  private async handleRegister(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    await this.handleRegisterWithActivationCode();
  }

  private async handleRegisterWithActivationCode(activationCode?: string): Promise<void> {
    const accountName = this.accountNameInput.value.normalize('NFC');
    const password = this.passwordInput.value;
    const roleName = this.roleNameInput.value.normalize('NFC').trim();
    const displayName = this.displayNameInput.value.normalize('NFC');
    const invitationCode = this.invitationCodeInput.value.normalize('NFC').trim();

    const accountNameError = validateAccountName(accountName);
    if (accountNameError) {
      this.setError(accountNameError);
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      this.setError(passwordError);
      return;
    }
    const displayNameError = validateDisplayName(displayName);
    if (displayNameError) {
      this.setError(displayNameError);
      return;
    }
    const roleNameError = validateRoleName(roleName);
    if (roleNameError) {
      this.setError(roleNameError);
      return;
    }

    await this.checkDisplayName(displayName, { immediate: true });
    if (!this.displayNameAvailable) {
      this.setError(this.displayNameStatus.textContent || t('login.display-name.taken', undefined));
      return;
    }

    const body: AuthRegisterReq = {
      accountName,
      password,
      displayName,
      roleName,
      ...(invitationCode ? { invitationCode: invitationCode.slice(0, 80) } : {}),
      ...(activationCode ? { activationCode: activationCode.slice(0, 80) } : {}),
    };

    try {
      const data = await requestJson<AuthTokenRes>(`${AUTH_API_BASE_PATH}/register`, {
        method: 'POST',
        body,
      });
      this.onSuccess(data);
    } catch (error) {
      if (isRegistrationActivationRequired(error)) {
        const code = await this.openActivationCodeModal(error instanceof Error ? error.message : '');
        if (code) {
          await this.handleRegisterWithActivationCode(code);
        }
        return;
      }
      this.setError(error instanceof Error ? error.message : t('login.error.register-failed', undefined));
    }
  }

  /** onSuccess：处理Success。 */
  private onSuccess(data: AuthTokenRes): void {
    storeTokens(data);
    this.socket.connect(data.accessToken);
    this.hide();
    document.getElementById('hud')?.classList.remove('hidden');
    this.setError('');
  }

  /** scheduleDisplayNameCheck：调度显示名称检查。 */
  private async scheduleDisplayNameCheck(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.mode !== 'register') {
      return;
    }
    if (this.displayNameCheckTimer) {
      clearTimeout(this.displayNameCheckTimer);
    }
    const displayName = this.displayNameInput.value.normalize('NFC');
    const localError = validateDisplayName(displayName);
    if (!displayName) {
      this.setDisplayNameStatus(t('login.display-name.required', undefined), '');
      this.displayNameAvailable = false;
      return;
    }
    if (localError) {
      this.setDisplayNameStatus(localError, 'error');
      this.displayNameAvailable = false;
      return;
    }

    this.setDisplayNameStatus(t('login.display-name.checking', undefined), '');
    this.displayNameCheckTimer = setTimeout(() => {
      void this.checkDisplayName(displayName, { immediate: false });
    }, 250);
  }  
  /**
 * checkDisplayName：判断显示名称是否满足条件。
 * @param displayName string 参数说明。
 * @param options { immediate: boolean } 选项参数。
 * @returns 返回 Promise，完成后得到显示名称。
 */


  private async checkDisplayName(
    displayName: string,
    options: {    
    /**
 * immediate：immediate相关字段。
 */
 immediate: boolean },
  ): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.displayNameAbortController) {
      this.displayNameAbortController.abort();
    }
    const controller = new AbortController();
    this.displayNameAbortController = controller;
    if (options.immediate) {
      this.setDisplayNameStatus(t('login.display-name.checking', undefined), '');
    }

    try {
      const result = await checkDisplayNameAvailability(displayName, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      this.displayNameAvailable = result.available;
      this.setDisplayNameStatus(
        result.available
          ? t('login.display-name.available', undefined)
          : (result.message ?? t('login.display-name.taken', undefined)),
        result.available ? 'success' : 'error',
      );
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      this.displayNameAvailable = false;
      this.setDisplayNameStatus(error instanceof Error ? error.message : t('login.display-name.check-failed', undefined), 'error');
    }
  }

  /** setDisplayNameStatus：处理set显示名称状态。 */
  private setDisplayNameStatus(message: string, tone: '' | 'success' | 'error'): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.displayNameStatus.textContent = message;
    this.displayNameStatus.classList.remove('success', 'error');
    if (tone) {
      this.displayNameStatus.classList.add(tone);
    }
  }

  /** setError：处理set错误。 */
  private setError(message: string): void {
    this.errorDiv.textContent = message;
  }

  /** setMode：处理set模式。 */
  private setMode(mode: AuthMode): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    const isRegister = mode === 'register';
    this.loginTab.classList.toggle('active', !isRegister);
    this.loginTab.setAttribute('aria-selected', String(!isRegister));
    this.registerTab.classList.toggle('active', isRegister);
    this.registerTab.setAttribute('aria-selected', String(isRegister));
    this.loginNameGroup.classList.toggle('hidden', isRegister);
    this.registerAccountGroup.classList.toggle('hidden', !isRegister);
    this.roleNameGroup.classList.toggle('hidden', !isRegister);
    this.displayNameGroup.classList.toggle('hidden', !isRegister);
    this.invitationCodeGroup.classList.toggle('hidden', !isRegister);
    this.passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
    this.loginTab.textContent = t('login.mode.login', undefined);
    this.registerTab.textContent = t('login.mode.register', undefined);
    this.loginNameLabel.textContent = t('login.login-name.label', undefined);
    this.loginNameInput.placeholder = t('login.login-name.placeholder', undefined);
    this.submitText.textContent = isRegister
      ? t('login.mode.register', undefined)
      : t('login.mode.login', undefined);
    this.setError('');
    if (!isRegister) {
      this.resetDisplayNameState();
    } else {
      this.setDisplayNameStatus(t('login.display-name.required', undefined), '');
    }
  }

  /** resetDisplayNameState：重置显示名称状态。 */
  private resetDisplayNameState(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (this.displayNameCheckTimer) {
      clearTimeout(this.displayNameCheckTimer);
      this.displayNameCheckTimer = null;
    }
    if (this.displayNameAbortController) {
      this.displayNameAbortController.abort();
      this.displayNameAbortController = null;
    }
    this.displayNameAvailable = false;
    this.setDisplayNameStatus(t('login.display-name.required', undefined), '');
  }

  private openActivationCodeModal(initialError: string): Promise<string | null> {
    this.ensureActivationCodeModal();
    if (!this.activationModal || !this.activationCodeInput || !this.activationStatus) {
      return Promise.resolve(null);
    }

    this.activationCodeInput.value = '';
    this.activationStatus.textContent = initialError || t('login.activation.required', undefined);
    this.activationModal.classList.remove('hidden');
    this.activationModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => this.activationCodeInput?.focus(), 0);
    return new Promise((resolve) => {
      this.activationResolve = resolve;
    });
  }

  private ensureActivationCodeModal(): void {
    if (this.activationModal) {
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'confirm-modal-layer hidden login-activation-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="confirm-modal-backdrop" data-login-activation-cancel="true"></div>
      <div class="confirm-modal-card" role="dialog" aria-modal="true" aria-labelledby="login-activation-title">
        <div class="confirm-modal-head">
          <div>
            <div class="confirm-modal-title" id="login-activation-title">${escapeHtml(t('login.activation.title', undefined))}</div>
            <div class="confirm-modal-subtitle">${escapeHtml(t('login.activation.subtitle', { qqGroupNumber: QQ_GROUP_NUMBER }))}</div>
          </div>
        </div>
        <div class="confirm-modal-body">
          <label class="login-activation-field">
            <span>${escapeHtml(t('login.activation.code.label', undefined))}</span>
            <input class="login-activation-input" type="text" autocomplete="off" data-login-activation-code="true" />
          </label>
          <div class="login-activation-status" data-login-activation-status="true"></div>
          <a class="small-btn ghost login-activation-qq" href="#" data-qq-group-link="true">
            ${escapeHtml(t('login.activation.qq-action', { qqGroupNumber: QQ_GROUP_NUMBER }))}
          </a>
        </div>
        <div class="confirm-modal-actions">
          <button class="small-btn ghost" type="button" data-login-activation-cancel="true">${escapeHtml(t('modal.confirm.cancel', undefined))}</button>
          <button class="small-btn" type="button" data-login-activation-confirm="true">${escapeHtml(t('login.activation.submit', undefined))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.activationModal = modal;
    this.activationCodeInput = modal.querySelector<HTMLInputElement>('[data-login-activation-code="true"]');
    this.activationStatus = modal.querySelector<HTMLElement>('[data-login-activation-status="true"]');

    const close = (value: string | null) => {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      const resolve = this.activationResolve;
      this.activationResolve = null;
      resolve?.(value);
    };
    const confirm = () => {
      const value = this.activationCodeInput?.value.normalize('NFC').trim() ?? '';
      if (!value) {
        if (this.activationStatus) {
          this.activationStatus.textContent = t('login.activation.empty', undefined);
        }
        this.activationCodeInput?.focus();
        return;
      }
      close(value);
    };

    modal.querySelectorAll<HTMLElement>('[data-login-activation-cancel="true"]').forEach((entry) => {
      entry.addEventListener('click', () => close(null));
    });
    modal.querySelector<HTMLElement>('[data-login-activation-confirm="true"]')?.addEventListener('click', confirm);
    this.activationCodeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirm();
      }
    });
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || modal.classList.contains('hidden')) {
        return;
      }
      event.preventDefault();
      close(null);
    }, true);
  }
}

function isRegistrationActivationRequired(error: unknown): boolean {
  return error instanceof RequestError
    && error.data?.code === AUTH_REGISTER_ACTIVATION_REQUIRED_CODE;
}

function resolveInvitationCodeFromUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const candidates = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash.includes('=') ? hash : '');
  for (const key of ['invite', 'inviteCode', 'invitationCode', '邀请码']) {
    const value = candidates.get(key) ?? hashParams.get(key);
    if (value?.trim()) {
      return value.normalize('NFC').trim();
    }
  }
  return '';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });
}
