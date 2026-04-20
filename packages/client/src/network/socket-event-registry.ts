import type { Socket } from 'socket.io-client';
import { decodeServerEventPayload, type NEXT_S2C_EventPayload } from '@mud/shared-next';
import {
  GAMEPLAY_SERVER_EVENTS,
  SESSION_SERVER_EVENTS,
  type BoundServerEventName,
  type ServerEventCallback,
  type ServerEventCallbackBuckets,
} from './socket-server-events';
/**
 * SocketServerEventRegistryDeps：统一结构类型，保证协议与运行时一致性。
 */


type SocketServerEventRegistryDeps = {
/**
 * getSocket：对象字段。
 */

  getSocket: () => Socket | null;
};
/**
 * createSocketServerEventRegistry：构建并返回目标对象。
 * @param deps SocketServerEventRegistryDeps 运行时依赖。
 * @returns 函数返回值。
 */


export function createSocketServerEventRegistry(deps: SocketServerEventRegistryDeps) {
  const callbacks: ServerEventCallbackBuckets = {};  
  /**
 * getCallbacks：按给定条件读取/查询数据。
 * @param event TEvent 参数说明。
 * @returns Array<ServerEventCallback<TEvent>>。
 */


  function getCallbacks<TEvent extends BoundServerEventName>(
    event: TEvent,
  ): Array<ServerEventCallback<TEvent>> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const existing = callbacks[event] as Array<ServerEventCallback<TEvent>> | undefined;
    if (existing) {
      return existing;
    }
    const next: Array<ServerEventCallback<TEvent>> = [];
    callbacks[event] = next as ServerEventCallbackBuckets[TEvent];
    return next;
  }  
  /**
 * bindServerEvent：执行核心业务逻辑。
 * @param event TEvent 参数说明。
 * @returns void。
 */


  function bindServerEvent<TEvent extends BoundServerEventName>(event: TEvent): void {
    const listener = ((raw: unknown) => {
      const data = decodeServerEventPayload<NEXT_S2C_EventPayload<TEvent>>(event, raw);
      for (const callback of getCallbacks(event)) {
        callback(data);
      }
    }) as (payload: unknown) => void;
    deps.getSocket()?.on(event as never, listener as never);
  }

  return {  
  /**
 * on：执行核心业务逻辑。
 * @param event TEvent 参数说明。
 * @param cb ServerEventCallback<TEvent> 参数说明。
 * @returns void。
 */

    on<TEvent extends BoundServerEventName>(event: TEvent, cb: ServerEventCallback<TEvent>): void {
      getCallbacks(event).push(cb);
    },    
    /**
 * bindSessionEvents：执行核心业务逻辑。
 * @returns void。
 */


    bindSessionEvents(): void {
      for (const event of SESSION_SERVER_EVENTS) {
        bindServerEvent(event);
      }
    },    
    /**
 * bindGameplayEvents：执行核心业务逻辑。
 * @returns void。
 */


    bindGameplayEvents(): void {
      for (const event of GAMEPLAY_SERVER_EVENTS) {
        bindServerEvent(event);
      }
    },
  };
}
