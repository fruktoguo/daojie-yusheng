/**
 * 登录/注册界面
 * 管理登录、注册表单切换，显示名称可用性检测，以及 token 会话恢复
 */

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
import { validateAccountName, validateDisplayName, validatePassword, validateRoleName } from './account-rules';

/** AuthMode：定义该类型的结构与数据语义。 */
type AuthMode = 'login' | 'register';

/** LoginUI：封装相关状态与行为。 */
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
/** displayNameCheckTimer：定义该变量以承载业务值。 */
  private displayNameCheckTimer: ReturnType<typeof setTimeout> | null = null;
/** displayNameAbortController：定义该变量以承载业务值。 */
  private displayNameAbortController: AbortController | null = null;
  private displayNameAvailable = false;
/** mode：定义该变量以承载业务值。 */
  private mode: AuthMode | null = null;
/** restoreSessionPromise：定义该变量以承载业务值。 */
  private restoreSessionPromise: Promise<boolean> | null = null;

/** constructor：处理当前场景中的对应操作。 */
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

/** performRestoreSession：执行对应的业务逻辑。 */
  private async performRestoreSession(): Promise<boolean> {
/** refreshToken：定义该变量以承载业务值。 */
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    this.setError('正在恢复会话...');
    try {
/** data：定义该变量以承载业务值。 */
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

/** show：执行对应的业务逻辑。 */
  show(message = ''): void {
    this.setMode('login');
    this.overlay.classList.remove('hidden');
    if (message) {
      this.setError(message);
    }
  }

/** hide：执行对应的业务逻辑。 */
  hide(): void {
    this.overlay.classList.add('hidden');
  }

  /** 登出并显示登录界面 */
  logout(message = ''): void {
    this.clearSession();
    this.show(message);
  }

/** clearSession：执行对应的业务逻辑。 */
  clearSession(): void {
    clearStoredTokens();
  }

/** hasRefreshToken：执行对应的业务逻辑。 */
  hasRefreshToken(): boolean {
    return Boolean(getRefreshToken());
  }

/** handleSubmit：执行对应的业务逻辑。 */
  private async handleSubmit(): Promise<void> {
    if (this.mode === 'register') {
      await this.handleRegister();
      return;
    }
    await this.handleLogin();
  }

/** handleLogin：执行对应的业务逻辑。 */
  private async handleLogin(): Promise<void> {
/** body：定义该变量以承载业务值。 */
    const body: AuthLoginReq = {
      loginName: this.loginNameInput.value.normalize('NFC'),
      password: this.passwordInput.value,
    };
    try {
/** data：定义该变量以承载业务值。 */
      const data = await requestJson<AuthTokenRes>('/auth/login', {
        method: 'POST',
        body,
      });
      this.onSuccess(data);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : '登录失败');
    }
  }

/** handleRegister：执行对应的业务逻辑。 */
  private async handleRegister(): Promise<void> {
/** accountName：定义该变量以承载业务值。 */
    const accountName = this.accountNameInput.value.normalize('NFC');
/** password：定义该变量以承载业务值。 */
    const password = this.passwordInput.value;
/** roleName：定义该变量以承载业务值。 */
    const roleName = this.roleNameInput.value.normalize('NFC').trim();
/** displayName：定义该变量以承载业务值。 */
    const displayName = this.displayNameInput.value.normalize('NFC');

/** accountNameError：定义该变量以承载业务值。 */
    const accountNameError = validateAccountName(accountName);
    if (accountNameError) {
      this.setError(accountNameError);
      return;
    }
/** passwordError：定义该变量以承载业务值。 */
    const passwordError = validatePassword(password);
    if (passwordError) {
      this.setError(passwordError);
      return;
    }
/** displayNameError：定义该变量以承载业务值。 */
    const displayNameError = validateDisplayName(displayName);
    if (displayNameError) {
      this.setError(displayNameError);
      return;
    }
/** roleNameError：定义该变量以承载业务值。 */
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

/** body：定义该变量以承载业务值。 */
    const body: AuthRegisterReq = {
      accountName,
      password,
      displayName,
      roleName,
    };

    try {
/** data：定义该变量以承载业务值。 */
      const data = await requestJson<AuthTokenRes>('/auth/register', {
        method: 'POST',
        body,
      });
      this.onSuccess(data);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : '注册失败');
    }
  }

/** onSuccess：执行对应的业务逻辑。 */
  private onSuccess(data: AuthTokenRes): void {
    storeTokens(data);
    this.socket.connect(data.accessToken);
    this.hide();
    document.getElementById('hud')?.classList.remove('hidden');
    this.setError('');
  }

/** scheduleDisplayNameCheck：执行对应的业务逻辑。 */
  private async scheduleDisplayNameCheck(): Promise<void> {
    if (this.mode !== 'register') {
      return;
    }
    if (this.displayNameCheckTimer) {
      clearTimeout(this.displayNameCheckTimer);
    }
/** displayName：定义该变量以承载业务值。 */
    const displayName = this.displayNameInput.value.normalize('NFC');
/** localError：定义该变量以承载业务值。 */
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
/** controller：定义该变量以承载业务值。 */
    const controller = new AbortController();
    this.displayNameAbortController = controller;
    if (options.immediate) {
      this.setDisplayNameStatus('正在检测...', '');
    }

    try {
/** result：定义该变量以承载业务值。 */
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

/** setDisplayNameStatus：执行对应的业务逻辑。 */
  private setDisplayNameStatus(message: string, tone: '' | 'success' | 'error'): void {
    this.displayNameStatus.textContent = message;
    this.displayNameStatus.classList.remove('success', 'error');
    if (tone) {
      this.displayNameStatus.classList.add(tone);
    }
  }

/** setError：执行对应的业务逻辑。 */
  private setError(message: string): void {
    this.errorDiv.textContent = message;
  }

/** setMode：执行对应的业务逻辑。 */
  private setMode(mode: AuthMode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
/** isRegister：定义该变量以承载业务值。 */
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

/** resetDisplayNameState：执行对应的业务逻辑。 */
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

