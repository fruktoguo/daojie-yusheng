import type { Socket } from 'socket.io-client';
import { decodeServerEventPayload, type ServerToClientEventPayload } from '@mud/shared';
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
 * getSocket：Socket相关字段。
 */

  getSocket: () => Socket | null;
};
/**
 * createSocketServerEventRegistry：构建并返回目标对象。
 * @param deps SocketServerEventRegistryDeps 运行时依赖。
 * @returns 无返回值，直接更新SocketServer事件注册表相关状态。
 */


export function createSocketServerEventRegistry(deps: SocketServerEventRegistryDeps) {
  const callbacks: ServerEventCallbackBuckets = {};  
  /**
 * getCallbacks：读取Callback。
 * @param event TEvent 参数说明。
 * @returns 返回Callback列表。
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
 * bindServerEvent：执行bindServer事件相关逻辑。
 * @param event TEvent 参数说明。
 * @returns 无返回值，直接更新bindServer事件相关状态。
 */


  function bindServerEvent<TEvent extends BoundServerEventName>(event: TEvent): void {
    const listener = ((raw: unknown) => {
      const data = decodeServerEventPayload<ServerToClientEventPayload<TEvent>>(event, raw);
      for (const callback of getCallbacks(event)) {
        callback(data);
      }
    }) as (payload: unknown) => void;
    deps.getSocket()?.on(event as never, listener as never);
  }

  return {  
  /**
 * on：执行on相关逻辑。
 * @param event TEvent 参数说明。
 * @param cb ServerEventCallback<TEvent> 参数说明。
 * @returns 无返回值，直接更新on相关状态。
 */

    on<TEvent extends BoundServerEventName>(event: TEvent, cb: ServerEventCallback<TEvent>): void {
      getCallbacks(event).push(cb);
    },    
    /**
 * bindSessionEvents：执行bindSession事件相关逻辑。
 * @returns 无返回值，直接更新bindSession事件相关状态。
 */


    bindSessionEvents(): void {
      for (const event of SESSION_SERVER_EVENTS) {
        bindServerEvent(event);
      }
    },    
    /**
 * bindGameplayEvents：执行bindGameplay事件相关逻辑。
 * @returns 无返回值，直接更新bindGameplay事件相关状态。
 */


    bindGameplayEvents(): void {
      for (const event of GAMEPLAY_SERVER_EVENTS) {
        bindServerEvent(event);
      }
    },
  };
}
