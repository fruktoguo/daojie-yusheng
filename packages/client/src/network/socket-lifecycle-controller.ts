import type { Socket } from 'socket.io-client';
import { S2C, PLAYER_HEARTBEAT_INTERVAL_MS } from '@mud/shared';
/**
 * SocketLifecycleControllerDeps：统一结构类型，保证协议与运行时一致性。
 */


type SocketLifecycleControllerDeps = {
/**
 * sendHeartbeat：sendHeartbeat相关字段。
 */

  sendHeartbeat: () => void;  
  /**
 * sendHello：sendHello相关字段。
 */

  sendHello: () => void;  
  /**
 * disconnect：disconnect相关字段。
 */

  disconnect: () => void;
};
/**
 * createSocketLifecycleController：构建并返回目标对象。
 * @param deps SocketLifecycleControllerDeps 运行时依赖。
 * @returns 无返回值，直接更新SocketLifecycle控制器相关状态。
 */


export function createSocketLifecycleController(deps: SocketLifecycleControllerDeps) {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const onKickCallbacks: Array<() => void> = [];
  const onDisconnectCallbacks: Array<(reason: string) => void> = [];
  const onConnectErrorCallbacks: Array<(message: string) => void> = [];  
  /**
 * stopHeartbeat：执行stopHeartbeat相关逻辑。
 * @returns 无返回值，直接更新stopHeartbeat相关状态。
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
 * startHeartbeat：执行开始Heartbeat相关逻辑。
 * @returns 无返回值，直接更新startHeartbeat相关状态。
 */


  function startHeartbeat(): void {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      deps.sendHeartbeat();
    }, PLAYER_HEARTBEAT_INTERVAL_MS);
  }

  return {  
  /**
 * bind：执行bind相关逻辑。
 * @param socket Socket 参数说明。
 * @returns 无返回值，直接更新bind相关状态。
 */

    bind(socket: Socket): void {
      socket.on('connect', () => {
        stopHeartbeat();
        deps.sendHello();
      });

      socket.on(S2C.InitSession, () => {
        startHeartbeat();
        deps.sendHeartbeat();
      });

      socket.on(S2C.Kick, () => {
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
 * dispose：判断dispose是否满足条件。
 * @returns 无返回值，直接更新dispose相关状态。
 */


    dispose(): void {
      stopHeartbeat();
    },    
    /**
 * onKick：执行onKick相关逻辑。
 * @param cb () => void 参数说明。
 * @returns 无返回值，直接更新onKick相关状态。
 */


    onKick(cb: () => void): void {
      onKickCallbacks.push(cb);
    },    
    /**
 * onDisconnect：判断onDisconnect是否满足条件。
 * @param cb (reason: string) => void 参数说明。
 * @returns 无返回值，直接更新onDisconnect相关状态。
 */


    onDisconnect(cb: (reason: string) => void): void {
      onDisconnectCallbacks.push(cb);
    },    
    /**
 * onConnectError：执行onConnectError相关逻辑。
 * @param cb (message: string) => void 参数说明。
 * @returns 无返回值，直接更新onConnectError相关状态。
 */


    onConnectError(cb: (message: string) => void): void {
      onConnectErrorCallbacks.push(cb);
    },
  };
}
