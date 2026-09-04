import { C2S, type ClientToServerEventPayload } from '@mud/shared';
import type { SocketEmitEvent } from './socket-send-types';

export function createSocketDungeonSender(deps: { emitEvent: SocketEmitEvent }) {
  return {
    requestCatalog(): void { deps.emitEvent(C2S.RequestDungeonCatalog, {}); },
    startEntry(payload: ClientToServerEventPayload<typeof C2S.StartDungeonEntry>): void { deps.emitEvent(C2S.StartDungeonEntry, payload); },
    respondEntry(runId: string, confirm: boolean, reject = false): void { deps.emitEvent(C2S.RespondDungeonEntry, { runId, confirm, ...(reject ? { reject: true } : {}) }); },
    exit(runId?: string): void { deps.emitEvent(C2S.ExitDungeon, runId ? { runId } : {}); },
    rejoin(payload: ClientToServerEventPayload<typeof C2S.RejoinDungeon>): void { deps.emitEvent(C2S.RejoinDungeon, payload); },
  };
}

export type SocketDungeonSender = ReturnType<typeof createSocketDungeonSender>;
