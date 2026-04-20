import type { SocketManager } from './network/socket';
/**
 * MainConnectionStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainConnectionStateSourceOptions = {
/**
 * socket：对象字段。
 */

  socket: Pick<SocketManager, 'connected'>;  
  /**
 * restoreSession：对象字段。
 */

  restoreSession: () => Promise<boolean>;  
  /**
 * hasRefreshToken：对象字段。
 */

  hasRefreshToken: () => boolean;  
  /**
 * resetGameState：对象字段。
 */

  resetGameState: () => void;  
  /**
 * showLogin：对象字段。
 */

  showLogin: (message: string) => void;  
  /**
 * showToast：对象字段。
 */

  showToast: (message: string) => void;  
  /**
 * logout：对象字段。
 */

  logout: (message: string) => void;  
  /**
 * rejectPendingRedeemCodes：对象字段。
 */

  rejectPendingRedeemCodes: (message: string) => void;  
  /**
 * clearPendingSocketPing：对象字段。
 */

  clearPendingSocketPing: () => void;  
  /**
 * renderPingLatency：对象字段。
 */

  renderPingLatency: (latencyMs: number | null, status?: string) => void;  
  /**
 * setPanelRuntimeDisconnected：对象字段。
 */

  setPanelRuntimeDisconnected: () => void;  
  /**
 * hasPlayer：对象字段。
 */

  hasPlayer: () => boolean;  
  /**
 * scheduleConnectionRecovery：对象字段。
 */

  scheduleConnectionRecovery: (delayMs?: number, forceRefresh?: boolean) => void;  
  /**
 * getDocumentVisibilityState：对象字段。
 */

  getDocumentVisibilityState: () => DocumentVisibilityState;  
  /**
 * handlePong：对象字段。
 */

  handlePong: (data: {  
  /**
 * clientAt：对象字段。
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
 * @returns 函数返回值。
 */


export function createMainConnectionStateSource(options: MainConnectionStateSourceOptions) {
  return {  
  /**
 * handleError：处理事件并驱动执行路径。
 * @param data { code?: string; message: string } 原始数据。
 * @returns Promise<void>。
 */

    async handleError(data: {    
    /**
 * code：对象字段。
 */
 code?: string;    
 /**
 * message：对象字段。
 */
 message: string }): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleKick：处理事件并驱动执行路径。
 * @returns void。
 */


    handleKick(): void {
      options.resetGameState();
      options.logout('账号已在其他位置登录');
    },    
    /**
 * handleConnectError：处理事件并驱动执行路径。
 * @param message string 参数说明。
 * @returns void。
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
 * handleDisconnect：处理事件并驱动执行路径。
 * @param reason string 参数说明。
 * @returns void。
 */


    handleDisconnect(reason: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handlePong：处理事件并驱动执行路径。
 * @param data { clientAt: number } 原始数据。
 * @returns void。
 */


    handlePong(data: {    
    /**
 * clientAt：对象字段。
 */
 clientAt: number }): void {
      options.handlePong(data);
    },
  };
}
