import type { Socket } from 'socket.io-client';
import { NEXT_S2C, PLAYER_HEARTBEAT_INTERVAL_MS } from '@mud/shared-next';
/**
 * SocketLifecycleControllerDeps：统一结构类型，保证协议与运行时一致性。
 */


type SocketLifecycleControllerDeps = {
/**
 * sendHeartbeat：对象字段。
 */

  sendHeartbeat: () => void;  
  /**
 * sendHello：对象字段。
 */

  sendHello: () => void;  
  /**
 * disconnect：对象字段。
 */

  disconnect: () => void;
};
/**
 * createSocketLifecycleController：构建并返回目标对象。
 * @param deps SocketLifecycleControllerDeps 运行时依赖。
 * @returns 函数返回值。
 */


export function createSocketLifecycleController(deps: SocketLifecycleControllerDeps) {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const onKickCallbacks: Array<() => void> = [];
  const onDisconnectCallbacks: Array<(reason: string) => void> = [];
  const onConnectErrorCallbacks: Array<(message: string) => void> = [];  
  /**
 * stopHeartbeat：执行核心业务逻辑。
 * @returns void。
 */


  function stopHeartbeat(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!heartbeatTimer) {
      return;
    }
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }  
  /**
 * startHeartbeat：执行核心业务逻辑。
 * @returns void。
 */


  function startHeartbeat(): void {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      deps.sendHeartbeat();
    }, PLAYER_HEARTBEAT_INTERVAL_MS);
  }

  return {  
  /**
 * bind：执行核心业务逻辑。
 * @param socket Socket 参数说明。
 * @returns void。
 */

    bind(socket: Socket): void {
      socket.on('connect', () => {
        startHeartbeat();
        deps.sendHeartbeat();
        deps.sendHello();
      });

      socket.on(NEXT_S2C.Kick, () => {
        onKickCallbacks.forEach((cb) => cb());
        deps.disconnect();
      });

      socket.on('disconnect', (reason: string) => {
        stopHeartbeat();
        onDisconnectCallbacks.forEach((cb) => cb(reason));
      });

      socket.on('connect_error', (error: Error) => {
        onConnectErrorCallbacks.forEach((cb) => cb(error.message));
      });
    },    
    /**
 * dispose：执行核心业务逻辑。
 * @returns void。
 */


    dispose(): void {
      stopHeartbeat();
    },    
    /**
 * onKick：执行核心业务逻辑。
 * @param cb () => void 参数说明。
 * @returns void。
 */


    onKick(cb: () => void): void {
      onKickCallbacks.push(cb);
    },    
    /**
 * onDisconnect：执行核心业务逻辑。
 * @param cb (reason: string) => void 参数说明。
 * @returns void。
 */


    onDisconnect(cb: (reason: string) => void): void {
      onDisconnectCallbacks.push(cb);
    },    
    /**
 * onConnectError：执行核心业务逻辑。
 * @param cb (message: string) => void 参数说明。
 * @returns void。
 */


    onConnectError(cb: (message: string) => void): void {
      onConnectErrorCallbacks.push(cb);
    },
  };
}
