import type { SocketManager } from './network/socket';
/**
 * MainConnectionStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainConnectionStateSourceOptions = {
/**
 * socket：socket相关字段。
 */

  socket: Pick<SocketManager, 'connected'>;  
  /**
 * restoreSession：restoreSession相关字段。
 */

  restoreSession: () => Promise<boolean>;  
  /**
 * redirectConnection：重定向到指定服务地址。
 */

  redirectConnection: (redirectUrl: string) => boolean;  
  /**
 * hasRefreshToken：启用开关或状态标识。
 */

  hasRefreshToken: () => boolean;  
  /**
 * resetGameState：resetGame状态状态或数据块。
 */

  resetGameState: () => void;  
  /**
 * showLogin：showLogin相关字段。
 */

  showLogin: (message: string) => void;  
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string) => void;  
  /**
 * logout：logout相关字段。
 */

  logout: (message: string) => void;  
  /**
 * rejectPendingRedeemCodes：rejectPendingRedeemCode相关字段。
 */

  rejectPendingRedeemCodes: (message: string) => void;  
  /**
 * clearPendingSocketPing：clearPendingSocketPing相关字段。
 */

  clearPendingSocketPing: () => void;  
  /**
 * renderPingLatency：PingLatency相关字段。
 */

  renderPingLatency: (latencyMs: number | null, status?: string) => void;  
  /**
 * setPanelRuntimeDisconnected：面板运行态Disconnected相关字段。
 */

  setPanelRuntimeDisconnected: () => void;  
  /**
 * hasPlayer：启用开关或状态标识。
 */

  hasPlayer: () => boolean;  
  /**
 * scheduleConnectionRecovery：scheduleConnectionRecovery相关字段。
 */

  scheduleConnectionRecovery: (delayMs?: number, forceRefresh?: boolean) => void;  
  /**
 * getDocumentVisibilityState：Document可见性状态状态或数据块。
 */

  getDocumentVisibilityState: () => DocumentVisibilityState;  
  /**
 * handlePong：Pong相关字段。
 */

  handlePong: (data: {  
  /**
 * clientAt：clientAt相关字段。
 */
 clientAt: number }) => void;
};
/**
 * MainConnectionStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainConnectionStateSource = ReturnType<typeof createMainConnectionStateSource>;
/**
 * createMainConnectionStateSource：构建并返回目标对象。
 * @param options MainConnectionStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新MainConnection状态来源相关状态。
 */


export function createMainConnectionStateSource(options: MainConnectionStateSourceOptions) {
  let redirectInProgress = false;
  return {  
  /**
 * handleError：处理Error并更新相关状态。
 * @param data { code?: string; message: string } 原始数据。
 * @returns 返回 Promise，完成后得到Error。
 */

    async handleError(data: {    
    /**
 * code：code相关字段。
 */
 code?: string;    
/**
 * message：message相关字段。
 */
 message: string;
 /**
 * redirectNodeId：redirectNodeId相关字段。
 */
 redirectNodeId?: string | null;
 /**
 * redirectUrl：redirectUrl相关字段。
 */
 redirectUrl?: string | null; }): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const redirectUrl = typeof data.redirectUrl === 'string' ? data.redirectUrl.trim() : '';
      if (data.code === 'AUTH_FAIL') {
        if (redirectUrl && options.redirectConnection(redirectUrl)) {
          redirectInProgress = true;
          options.renderPingLatency(null, '迁移');
          return;
        }
        const restored = await options.restoreSession();
        if (restored) {
          return;
        }
        options.resetGameState();
        options.showLogin('登录已失效，请重新登录');
        return;
      }
      if (data.code === 'SESSION_EXPIRED') {
        const restored = await options.restoreSession();
        if (restored) {
          options.showToast('会话已恢复，正在重连...');
          return;
        }
        options.resetGameState();
        options.showLogin('会话已失效，请重新登录');
        return;
      }
      options.showToast(data.message);
    },    
    /**
 * handleKick：处理Kick并更新相关状态。
 * @returns 无返回值，直接更新Kick相关状态。
 */


    handleKick(): void {
      options.resetGameState();
      options.logout('账号已在其他位置登录');
    },    
    /**
 * handleConnectError：处理ConnectError并更新相关状态。
 * @param message string 参数说明。
 * @returns 无返回值，直接更新ConnectError相关状态。
 */


    handleConnectError(message: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleDisconnect：判断Disconnect是否满足条件。
 * @param reason string 参数说明。
 * @returns 无返回值，直接更新Disconnect相关状态。
 */


    handleDisconnect(reason: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      if (reason === 'io client disconnect') {
        return;
      }
      if (redirectInProgress) {
        redirectInProgress = false;
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
    /**
 * handlePong：处理Pong并更新相关状态。
 * @param data { clientAt: number } 原始数据。
 * @returns 无返回值，直接更新Pong相关状态。
 */


    handlePong(data: {    
    /**
 * clientAt：clientAt相关字段。
 */
 clientAt: number }): void {
      options.handlePong(data);
    },
  };
}
