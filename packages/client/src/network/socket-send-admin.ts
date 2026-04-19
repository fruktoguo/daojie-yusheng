import { NEXT_C2S, type NEXT_C2S_EventPayload } from '@mud/shared-next';
import type { SocketEmitEvent } from './socket-send-types';

type AdminSenderDeps = {
  emitEvent: SocketEmitEvent;
};

export function createSocketAdminSender(deps: AdminSenderDeps) {
  return {
    sendGmGetState(): void {
      deps.emitEvent(NEXT_C2S.GmGetState, {});
    },

    sendGmSpawnBots(count: number): void {
      deps.emitEvent(NEXT_C2S.GmSpawnBots, { count });
    },

    sendGmRemoveBots(playerIds?: string[], all = false): void {
      deps.emitEvent(NEXT_C2S.GmRemoveBots, { playerIds, all });
    },

    sendGmUpdatePlayer(
      payload: NEXT_C2S_EventPayload<typeof NEXT_C2S.GmUpdatePlayer>,
    ): void {
      deps.emitEvent(NEXT_C2S.GmUpdatePlayer, payload);
    },

    sendGmResetPlayer(playerId: string): void {
      deps.emitEvent(NEXT_C2S.GmResetPlayer, { playerId });
    },

    sendDebugResetSpawn(): void {
      deps.emitEvent(NEXT_C2S.DebugResetSpawn, { force: true });
    },
  };
}

export type SocketAdminSender = ReturnType<typeof createSocketAdminSender>;
