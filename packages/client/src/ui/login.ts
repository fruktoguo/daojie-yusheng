/**
 * 登录/注册界面
 * 管理登录、注册表单切换，显示名称可用性检测，以及 token 会话恢复
 */
// TODO(next:MIGRATE01): 在 next 鉴权 contract 完全稳定后，复核这里的账号/角色双入口与会话恢复语义，清掉迁移期遗留的兼容口径。

import { AuthLoginReq, AuthRegisterReq, AuthTokenRes } from '@mud/shared-next';
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
import { validateAccountName, validateDisplayName, validatePassword, validateRoleName } from './account-rules';

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

  /** 尝试用当前会话里的 refreshToken 恢复登录态 */
  async restoreSession(): Promise<boolean> {
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

  /** show：处理显示。 */
  show(message = ''): void {
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
    if (this.mode === 'register') {
      await this.handleRegister();
      return;
    }
    await this.handleLogin();
  }

  /** handleLogin：处理Login。 */
  private async handleLogin(): Promise<void> {
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
      this.setError(error instanceof Error ? error.message : '登录失败');
    }
  }

  /** handleRegister：处理Register。 */
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
      const data = await requestJson<AuthTokenRes>(`${AUTH_API_BASE_PATH}/register`, {
        method: 'POST',
        body,
      });
      this.onSuccess(data);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : '注册失败');
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

  /** setDisplayNameStatus：处理set显示名称状态。 */
  private setDisplayNameStatus(message: string, tone: '' | 'success' | 'error'): void {
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

  /** resetDisplayNameState：重置显示名称状态。 */
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
