import type { Socket } from 'socket.io-client';
import { NEXT_S2C, PLAYER_HEARTBEAT_INTERVAL_MS } from '@mud/shared-next';

type SocketLifecycleControllerDeps = {
  sendHeartbeat: () => void;
  sendHello: () => void;
  disconnect: () => void;
};

export function createSocketLifecycleController(deps: SocketLifecycleControllerDeps) {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const onKickCallbacks: Array<() => void> = [];
  const onDisconnectCallbacks: Array<(reason: string) => void> = [];
  const onConnectErrorCallbacks: Array<(message: string) => void> = [];

  function stopHeartbeat(): void {
    if (!heartbeatTimer) {
      return;
    }
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function startHeartbeat(): void {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      deps.sendHeartbeat();
    }, PLAYER_HEARTBEAT_INTERVAL_MS);
  }

  return {
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

    dispose(): void {
      stopHeartbeat();
    },

    onKick(cb: () => void): void {
      onKickCallbacks.push(cb);
    },

    onDisconnect(cb: (reason: string) => void): void {
      onDisconnectCallbacks.push(cb);
    },

    onConnectError(cb: (message: string) => void): void {
      onConnectErrorCallbacks.push(cb);
    },
  };
}
