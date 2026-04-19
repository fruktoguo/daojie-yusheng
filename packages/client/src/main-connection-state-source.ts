import type { SocketManager } from './network/socket';

type MainConnectionStateSourceOptions = {
  socket: Pick<SocketManager, 'connected'>;
  restoreSession: () => Promise<boolean>;
  hasRefreshToken: () => boolean;
  resetGameState: () => void;
  showLogin: (message: string) => void;
  showToast: (message: string) => void;
  logout: (message: string) => void;
  rejectPendingRedeemCodes: (message: string) => void;
  clearPendingSocketPing: () => void;
  renderPingLatency: (latencyMs: number | null, status?: string) => void;
  setPanelRuntimeDisconnected: () => void;
  hasPlayer: () => boolean;
  scheduleConnectionRecovery: (delayMs?: number, forceRefresh?: boolean) => void;
  getDocumentVisibilityState: () => DocumentVisibilityState;
  handlePong: (data: { clientAt: number }) => void;
};

export type MainConnectionStateSource = ReturnType<typeof createMainConnectionStateSource>;

export function createMainConnectionStateSource(options: MainConnectionStateSourceOptions) {
  return {
    async handleError(data: { code?: string; message: string }): Promise<void> {
      if (data.code === 'AUTH_FAIL') {
        const restored = await options.restoreSession();
        if (restored) {
          return;
        }
        options.resetGameState();
        options.showLogin('登录已失效，请重新登录');
        return;
      }
      options.showToast(data.message);
    },

    handleKick(): void {
      options.resetGameState();
      options.logout('账号已在其他位置登录');
    },

    handleConnectError(message: string): void {
      if (options.socket.connected) {
        return;
      }
      if (options.hasRefreshToken()) {
        options.renderPingLatency(null, '重连');
        options.scheduleConnectionRecovery(300, true);
        return;
      }
      options.showToast(`连接失败: ${message}`);
    },

    handleDisconnect(reason: string): void {
      if (reason === 'io client disconnect') {
        return;
      }
      options.rejectPendingRedeemCodes('连接已断开，兑换结果未返回');
      options.clearPendingSocketPing();
      options.renderPingLatency(null, navigator.onLine ? '重连' : '断网');
      options.setPanelRuntimeDisconnected();
      if (options.hasPlayer()) {
        options.showToast('连接已断开，正在尝试恢复');
      }
      options.scheduleConnectionRecovery(options.getDocumentVisibilityState() === 'visible' ? 300 : 0);
    },

    handlePong(data: { clientAt: number }): void {
      options.handlePong(data);
    },
  };
}
