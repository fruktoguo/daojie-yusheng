import type { Socket } from 'socket.io-client';
import { decodeServerEventPayload, type NEXT_S2C_EventPayload } from '@mud/shared-next';
import {
  GAMEPLAY_SERVER_EVENTS,
  SESSION_SERVER_EVENTS,
  type BoundServerEventName,
  type ServerEventCallback,
  type ServerEventCallbackBuckets,
} from './socket-server-events';

type SocketServerEventRegistryDeps = {
  getSocket: () => Socket | null;
};

export function createSocketServerEventRegistry(deps: SocketServerEventRegistryDeps) {
  const callbacks: ServerEventCallbackBuckets = {};

  function getCallbacks<TEvent extends BoundServerEventName>(
    event: TEvent,
  ): Array<ServerEventCallback<TEvent>> {
    const existing = callbacks[event] as Array<ServerEventCallback<TEvent>> | undefined;
    if (existing) {
      return existing;
    }
    const next: Array<ServerEventCallback<TEvent>> = [];
    callbacks[event] = next as ServerEventCallbackBuckets[TEvent];
    return next;
  }

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
    on<TEvent extends BoundServerEventName>(event: TEvent, cb: ServerEventCallback<TEvent>): void {
      getCallbacks(event).push(cb);
    },

    bindSessionEvents(): void {
      for (const event of SESSION_SERVER_EVENTS) {
        bindServerEvent(event);
      }
    },

    bindGameplayEvents(): void {
      for (const event of GAMEPLAY_SERVER_EVENTS) {
        bindServerEvent(event);
      }
    },
  };
}
