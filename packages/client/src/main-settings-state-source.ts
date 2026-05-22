/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
import {
  AccountRedeemCodesRes,
  S2C_RedeemCodesResult,
  PlayerState,
} from '@mud/shared';
import { SettingsPanel } from './ui/panels/settings-panel';
import { t } from './ui/i18n';
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
 * getCurrentPlayerId：Current玩家ID。
 */

  getCurrentPlayerId: () => string;
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
      return Promise.reject(new Error(t('settings.error.not-connected')));
    }
    if (pendingRedeemCodesRequest) {
      return Promise.reject(new Error(t('settings.error.redeem-busy')));
    }
    return new Promise<AccountRedeemCodesRes>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (pendingRedeemCodesRequest?.timeoutId !== timeoutId) {
          return;
        }
        pendingRedeemCodesRequest = null;
        reject(new Error(t('settings.error.redeem-timeout')));
      }, REDEEM_RESULT_TIMEOUT_MS);
      pendingRedeemCodesRequest = { resolve, reject, timeoutId };
      options.sendRedeemCodes(codes);
    });
  };

  options.settingsPanel.setOptions({
    getCurrentAccountName: options.getCurrentAccountName,
    getCurrentPlayerId: options.getCurrentPlayerId,
    getCurrentDisplayName: () => options.getPlayer()?.displayName ?? '',
    getCurrentRoleName: () => options.getPlayer()?.name ?? '',
    onDisplayNameUpdated: (displayName) => {
      applyLocalDisplayName(displayName);
      options.showToast(t('settings.toast.display-name-updated', { displayName }));
    },
    onRoleNameUpdated: (roleName) => {
      applyLocalRoleName(roleName);
      options.showToast(t('settings.toast.role-name-updated', { roleName }));
    },
    redeemCodes: requestRedeemCodes,
    onLogout: () => {
      options.closeSettingsPanel();
      options.disconnectSocket();
      options.resetGameState();
      options.logout(t('settings.logout.done'));
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
