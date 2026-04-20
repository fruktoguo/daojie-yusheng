import {
  AccountRedeemCodesRes,
  NEXT_S2C_RedeemCodesResult,
  PlayerState,
} from '@mud/shared-next';
import { SettingsPanel } from './ui/panels/settings-panel';
/**
 * PendingRedeemCodesRequest：统一结构类型，保证协议与运行时一致性。
 */


type PendingRedeemCodesRequest = {
/**
 * resolve：对象字段。
 */

  resolve: (value: AccountRedeemCodesRes) => void;  
  /**
 * reject：对象字段。
 */

  reject: (reason?: unknown) => void;  
  /**
 * timeoutId：对象字段。
 */

  timeoutId: ReturnType<typeof setTimeout>;
};
/**
 * MainSettingsStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainSettingsStateSourceOptions = {
/**
 * settingsPanel：对象字段。
 */

  settingsPanel: SettingsPanel;  
  /**
 * getCurrentAccountName：对象字段。
 */

  getCurrentAccountName: () => string;  
  /**
 * getPlayer：对象字段。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * applyVisibleDisplayName：对象字段。
 */

  applyVisibleDisplayName: (playerId: string, displayName: string) => void;  
  /**
 * applyVisibleRoleName：对象字段。
 */

  applyVisibleRoleName: (playerId: string, roleName: string) => void;  
  /**
 * syncPlayerBridgeState：对象字段。
 */

  syncPlayerBridgeState: (player: PlayerState | null) => void;  
  /**
 * refreshHudChrome：对象字段。
 */

  refreshHudChrome: () => void;  
  /**
 * showToast：对象字段。
 */

  showToast: (message: string) => void;  
  /**
 * isSocketConnected：对象字段。
 */

  isSocketConnected: () => boolean;  
  /**
 * sendRedeemCodes：对象字段。
 */

  sendRedeemCodes: (codes: string[]) => void;  
  /**
 * closeSettingsPanel：对象字段。
 */

  closeSettingsPanel: () => void;  
  /**
 * disconnectSocket：对象字段。
 */

  disconnectSocket: () => void;  
  /**
 * resetGameState：对象字段。
 */

  resetGameState: () => void;  
  /**
 * logout：对象字段。
 */

  logout: (message: string) => void;
};

const REDEEM_RESULT_TIMEOUT_MS = 12000;
/**
 * MainSettingsStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainSettingsStateSource = ReturnType<typeof createMainSettingsStateSource>;
/**
 * createMainSettingsStateSource：构建并返回目标对象。
 * @param options MainSettingsStateSourceOptions 选项参数。
 * @returns 函数返回值。
 */


export function createMainSettingsStateSource(options: MainSettingsStateSourceOptions) {
  let pendingRedeemCodesRequest: PendingRedeemCodesRequest | null = null;

  const applyLocalDisplayName = (displayName: string): void => {
    const player = options.getPlayer();
    if (!player) {
      return;
    }
    player.displayName = displayName;
    options.applyVisibleDisplayName(player.id, displayName);
    options.syncPlayerBridgeState(player);
    options.refreshHudChrome();
  };

  const applyLocalRoleName = (roleName: string): void => {
    const player = options.getPlayer();
    if (!player) {
      return;
    }
    player.name = roleName;
    options.applyVisibleRoleName(player.id, roleName);
    options.syncPlayerBridgeState(player);
    options.refreshHudChrome();
  };

  const requestRedeemCodes = (codes: string[]): Promise<AccountRedeemCodesRes> => {
    if (!options.isSocketConnected()) {
      return Promise.reject(new Error('当前连接不可用，请稍后重试'));
    }
    if (pendingRedeemCodesRequest) {
      return Promise.reject(new Error('已有兑换请求正在处理中'));
    }
    return new Promise<AccountRedeemCodesRes>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (pendingRedeemCodesRequest?.timeoutId !== timeoutId) {
          return;
        }
        pendingRedeemCodesRequest = null;
        reject(new Error('兑换结果返回超时，请稍后查看背包或重试'));
      }, REDEEM_RESULT_TIMEOUT_MS);
      pendingRedeemCodesRequest = { resolve, reject, timeoutId };
      options.sendRedeemCodes(codes);
    });
  };

  options.settingsPanel.setOptions({
    getCurrentAccountName: options.getCurrentAccountName,
    getCurrentDisplayName: () => options.getPlayer()?.displayName ?? '',
    getCurrentRoleName: () => options.getPlayer()?.name ?? '',
    onDisplayNameUpdated: (displayName) => {
      applyLocalDisplayName(displayName);
      options.showToast(`显示名称已改为 ${displayName}`);
    },
    onRoleNameUpdated: (roleName) => {
      applyLocalRoleName(roleName);
      options.showToast(`角色名称已改为 ${roleName}`);
    },
    redeemCodes: requestRedeemCodes,
    onLogout: () => {
      options.closeSettingsPanel();
      options.disconnectSocket();
      options.resetGameState();
      options.logout('已退出登录');
    },
  });

  return {  
  /**
 * handleRedeemCodesResult：处理事件并驱动执行路径。
 * @param data NEXT_S2C_RedeemCodesResult 原始数据。
 * @returns void。
 */

    handleRedeemCodesResult(data: NEXT_S2C_RedeemCodesResult): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!pendingRedeemCodesRequest) {
        return;
      }
      const pending = pendingRedeemCodesRequest;
      pendingRedeemCodesRequest = null;
      window.clearTimeout(pending.timeoutId);
      pending.resolve(data.result);
    },    
    /**
 * rejectPendingRedeemCodes：执行核心业务逻辑。
 * @param message string 参数说明。
 * @returns void。
 */


    rejectPendingRedeemCodes(message: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (!pendingRedeemCodesRequest) {
        return;
      }
      const pending = pendingRedeemCodesRequest;
      pendingRedeemCodesRequest = null;
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
    },
  };
}
