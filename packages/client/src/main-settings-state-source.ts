import {
  AccountRedeemCodesRes,
  S2C_RedeemCodesResult,
  PlayerState,
} from '@mud/shared';
import { SettingsPanel } from './ui/panels/settings-panel';
/**
 * PendingRedeemCodesRequest：统一结构类型，保证协议与运行时一致性。
 */


type PendingRedeemCodesRequest = {
/**
 * resolve：resolve相关字段。
 */

  resolve: (value: AccountRedeemCodesRes) => void;  
  /**
 * reject：reject相关字段。
 */

  reject: (reason?: unknown) => void;  
  /**
 * timeoutId：超时ID标识。
 */

  timeoutId: ReturnType<typeof setTimeout>;
};
/**
 * MainSettingsStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainSettingsStateSourceOptions = {
/**
 * settingsPanel：setting面板相关字段。
 */

  settingsPanel: SettingsPanel;  
  /**
 * getCurrentAccountName：CurrentAccount名称名称或显示文本。
 */

  getCurrentAccountName: () => string;  
  /**
 * getPlayer：玩家引用。
 */

  getPlayer: () => PlayerState | null;  
  /**
 * applyVisibleDisplayName：可见显示名称名称或显示文本。
 */

  applyVisibleDisplayName: (playerId: string, displayName: string) => void;  
  /**
 * applyVisibleRoleName：可见Role名称名称或显示文本。
 */

  applyVisibleRoleName: (playerId: string, roleName: string) => void;  
  /**
 * syncPlayerBridgeState：玩家桥接状态状态或数据块。
 */

  syncPlayerBridgeState: (player: PlayerState | null) => void;  
  /**
 * refreshHudChrome：refreshHudChrome相关字段。
 */

  refreshHudChrome: () => void;  
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string) => void;  
  /**
 * isSocketConnected：启用开关或状态标识。
 */

  isSocketConnected: () => boolean;  
  /**
 * sendRedeemCodes：sendRedeemCode相关字段。
 */

  sendRedeemCodes: (codes: string[]) => void;  
  /**
 * closeSettingsPanel：closeSetting面板相关字段。
 */

  closeSettingsPanel: () => void;  
  /**
 * disconnectSocket：disconnectSocket相关字段。
 */

  disconnectSocket: () => void;  
  /**
 * resetGameState：resetGame状态状态或数据块。
 */

  resetGameState: () => void;  
  /**
 * logout：logout相关字段。
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
 * @returns 无返回值，直接更新MainSetting状态来源相关状态。
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
 * handleRedeemCodesResult：处理RedeemCode结果并更新相关状态。
   * @param data S2C_RedeemCodesResult 原始数据。
 * @returns 无返回值，直接更新RedeemCode结果相关状态。
 */

    handleRedeemCodesResult(data: S2C_RedeemCodesResult): void {
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
 * rejectPendingRedeemCodes：执行reject待处理RedeemCode相关逻辑。
 * @param message string 参数说明。
 * @returns 无返回值，直接更新rejectPendingRedeemCode相关状态。
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
