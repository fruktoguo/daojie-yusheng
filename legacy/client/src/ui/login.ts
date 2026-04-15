/**
 * 登录/注册界面
 * 管理登录、注册表单切换，显示名称可用性检测，以及 token 会话恢复
 */

import { AuthLoginReq, AuthRegisterReq, AuthTokenRes } from '@mud/shared';
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
import { validateAccountName, validateDisplayName, validatePassword, validateRoleName } from './account-rules';

type AuthMode = 'login' | 'register';

export class LoginUI {
  private overlay = document.getElementById('login-overlay')!;
  private loginTab = document.getElementById('tab-login') as HTMLButtonElement;
  private registerTab = document.getElementById('tab-register') as HTMLButtonElement;
  private loginNameGroup = document.getElementById('login-name-group') as HTMLElement;
  private loginNameLabel = document.getElementById('login-name-label')!;
  private loginNameInput = document.getElementById('input-login-name') as HTMLInputElement;
  private passwordInput = document.getElementById('input-password') as HTMLInputElement;
  private registerAccountGroup = document.getElementById('register-account-group') as HTMLElement;
  private accountNameInput = document.getElementById('input-account-name') as HTMLInputElement;
  private roleNameGroup = document.getElementById('register-role-name-group') as HTMLElement;
  private roleNameInput = document.getElementById('input-role-name') as HTMLInputElement;
  private displayNameGroup = document.getElementById('register-display-name-group') as HTMLElement;
  private displayNameInput = document.getElementById('input-display-name') as HTMLInputElement;
  private displayNameStatus = document.getElementById('display-name-status')!;
  private submitBtn = document.getElementById('btn-auth-submit') as HTMLButtonElement;
  private submitText = document.getElementById('auth-submit-text')!;
  private errorDiv = document.getElementById('login-error')!;
  private displayNameCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private displayNameAbortController: AbortController | null = null;
  private displayNameAvailable = false;
  private mode: AuthMode | null = null;
  private restoreSessionPromise: Promise<boolean> | null = null;

/** constructor：初始化实例并完成构造。 */
  constructor(private socket: SocketManager) {
    this.loginTab.addEventListener('click', () => this.setMode('login'));
    this.registerTab.addEventListener('click', () => this.setMode('register'));
    this.submitBtn.addEventListener('click', () => {
      void this.handleSubmit();
    });
    this.displayNameInput.addEventListener('input', () => {
      void this.scheduleDisplayNameCheck();
    });
    this.setMode('login');
  }

  /** 尝试用 localStorage 中的 refreshToken 恢复登录态 */
  async restoreSession(): Promise<boolean> {
    if (this.restoreSessionPromise) {
      return this.restoreSessionPromise;
    }
    this.restoreSessionPromise = this.performRestoreSession().finally(() => {
      this.restoreSessionPromise = null;
    });
    return this.restoreSessionPromise;
  }


  private async performRestoreSession(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    this.setError('正在恢复会话...');
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
      this.setError(error instanceof Error ? error.message : '会话恢复失败');
      return false;
    }
  }

/** show：显示当前视图。 */
  show(message = ''): void {
    this.setMode('login');
    this.overlay.classList.remove('hidden');
    if (message) {
      this.setError(message);
    }
  }

/** hide：隐藏当前视图。 */
  hide(): void {
    this.overlay.classList.add('hidden');
  }

  /** 登出并显示登录界面 */
  logout(message = ''): void {
    this.clearSession();
    this.show(message);
  }

/** clearSession：清理并清空临时数据。 */
  clearSession(): void {
    clearStoredTokens();
  }

/** hasRefreshToken：判断并返回条件结果。 */
  hasRefreshToken(): boolean {
    return Boolean(getRefreshToken());
  }

/** handleSubmit：处理输入事件。 */
  private async handleSubmit(): Promise<void> {
    if (this.mode === 'register') {
      await this.handleRegister();
      return;
    }
    await this.handleLogin();
  }

/** handleLogin：处理输入事件。 */
  private async handleLogin(): Promise<void> {
    const body: AuthLoginReq = {
      loginName: this.loginNameInput.value.normalize('NFC'),
      password: this.passwordInput.value,
    };
    try {
      const data = await requestJson<AuthTokenRes>('/auth/login', {
        method: 'POST',
        body,
      });
      this.onSuccess(data);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : '登录失败');
    }
  }

/** handleRegister：处理输入事件。 */
  private async handleRegister(): Promise<void> {
    const accountName = this.accountNameInput.value.normalize('NFC');
    const password = this.passwordInput.value;
    const roleName = this.roleNameInput.value.normalize('NFC').trim();
    const displayName = this.displayNameInput.value.normalize('NFC');

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
      this.setError(this.displayNameStatus.textContent || '显示名称不可用');
      return;
    }

    const body: AuthRegisterReq = {
      accountName,
      password,
      displayName,
      roleName,
    };

    try {
      const data = await requestJson<AuthTokenRes>('/auth/register', {
        method: 'POST',
        body,
      });
      this.onSuccess(data);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : '注册失败');
    }
  }

/** onSuccess：处理输入事件。 */
  private onSuccess(data: AuthTokenRes): void {
    storeTokens(data);
    this.socket.connect(data.accessToken);
    this.hide();
    document.getElementById('hud')?.classList.remove('hidden');
    this.setError('');
  }


  private async scheduleDisplayNameCheck(): Promise<void> {
    if (this.mode !== 'register') {
      return;
    }
    if (this.displayNameCheckTimer) {
      clearTimeout(this.displayNameCheckTimer);
    }
    const displayName = this.displayNameInput.value.normalize('NFC');
    const localError = validateDisplayName(displayName);
    if (!displayName) {
      this.setDisplayNameStatus('注册时必填', '');
      this.displayNameAvailable = false;
      return;
    }
    if (localError) {
      this.setDisplayNameStatus(localError, 'error');
      this.displayNameAvailable = false;
      return;
    }

    this.setDisplayNameStatus('正在检测...', '');
    this.displayNameCheckTimer = setTimeout(() => {
      void this.checkDisplayName(displayName, { immediate: false });
    }, 250);
  }

  private async checkDisplayName(
    displayName: string,
    options: { immediate: boolean },
  ): Promise<void> {
    if (this.displayNameAbortController) {
      this.displayNameAbortController.abort();
    }
    const controller = new AbortController();
    this.displayNameAbortController = controller;
    if (options.immediate) {
      this.setDisplayNameStatus('正在检测...', '');
    }

    try {
      const result = await checkDisplayNameAvailability(displayName, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      this.displayNameAvailable = result.available;
      this.setDisplayNameStatus(
        result.available ? '显示名称可用' : (result.message ?? '显示名称不可用'),
        result.available ? 'success' : 'error',
      );
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      this.displayNameAvailable = false;
      this.setDisplayNameStatus(error instanceof Error ? error.message : '检测失败', 'error');
    }
  }

/** setDisplayNameStatus：设置并同步相关状态。 */
  private setDisplayNameStatus(message: string, tone: '' | 'success' | 'error'): void {
    this.displayNameStatus.textContent = message;
    this.displayNameStatus.classList.remove('success', 'error');
    if (tone) {
      this.displayNameStatus.classList.add(tone);
    }
  }

/** setError：设置并同步相关状态。 */
  private setError(message: string): void {
    this.errorDiv.textContent = message;
  }

/** setMode：设置并同步相关状态。 */
  private setMode(mode: AuthMode): void {
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
    this.loginNameLabel.textContent = '账号 / 角色名';
    this.loginNameInput.placeholder = '输入账号或角色名';
    this.submitText.textContent = isRegister ? '注册' : '登录';
    this.setError('');
    if (!isRegister) {
      this.resetDisplayNameState();
    } else {
      this.setDisplayNameStatus('注册时必填', '');
    }
  }

/** resetDisplayNameState：重置为初始状态。 */
  private resetDisplayNameState(): void {
    if (this.displayNameCheckTimer) {
      clearTimeout(this.displayNameCheckTimer);
      this.displayNameCheckTimer = null;
    }
    if (this.displayNameAbortController) {
      this.displayNameAbortController.abort();
      this.displayNameAbortController = null;
    }
    this.displayNameAvailable = false;
    this.setDisplayNameStatus('注册时必填', '');
  }
}

