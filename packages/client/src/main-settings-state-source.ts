import {
  AccountRedeemCodesRes,
  NEXT_S2C_RedeemCodesResult,
  PlayerState,
} from '@mud/shared-next';
import { SettingsPanel } from './ui/panels/settings-panel';

type PendingRedeemCodesRequest = {
  resolve: (value: AccountRedeemCodesRes) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type MainSettingsStateSourceOptions = {
  settingsPanel: SettingsPanel;
  getCurrentAccountName: () => string;
  getPlayer: () => PlayerState | null;
  applyVisibleDisplayName: (playerId: string, displayName: string) => void;
  applyVisibleRoleName: (playerId: string, roleName: string) => void;
  syncPlayerBridgeState: (player: PlayerState | null) => void;
  refreshHudChrome: () => void;
  showToast: (message: string) => void;
  isSocketConnected: () => boolean;
  sendRedeemCodes: (codes: string[]) => void;
  closeSettingsPanel: () => void;
  disconnectSocket: () => void;
  resetGameState: () => void;
  logout: (message: string) => void;
};

const REDEEM_RESULT_TIMEOUT_MS = 12000;

export type MainSettingsStateSource = ReturnType<typeof createMainSettingsStateSource>;

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
    handleRedeemCodesResult(data: NEXT_S2C_RedeemCodesResult): void {
      if (!pendingRedeemCodesRequest) {
        return;
      }
      const pending = pendingRedeemCodesRequest;
      pendingRedeemCodesRequest = null;
      window.clearTimeout(pending.timeoutId);
      pending.resolve(data.result);
    },

    rejectPendingRedeemCodes(message: string): void {
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
