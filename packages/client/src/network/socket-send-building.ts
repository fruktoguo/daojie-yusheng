/**
 * 本文件位于客户端网络层，负责把前端意图或服务端事件接入现有 socket 边界。
 *
 * 维护时要保证包体字段精简、事件名来自共享协议，并避免把服务端权威判断下沉到客户端。
 */
import { C2S, type ClientToServerEventPayload } from '@mud/shared';
import type { SocketEmitEvent } from './socket-send-types';

type BuildingSenderDeps = {
  emitEvent: SocketEmitEvent;
};

export function createSocketBuildingSender(deps: BuildingSenderDeps) {
  return {
    sendBuildPlaceIntent(payload: ClientToServerEventPayload<typeof C2S.BuildPlaceIntent>): void {
      deps.emitEvent(C2S.BuildPlaceIntent, payload);
    },

    sendBuildDeconstruct(payload: ClientToServerEventPayload<typeof C2S.BuildDeconstruct>): void {
      deps.emitEvent(C2S.BuildDeconstruct, payload);
    },

    sendRoomSetRole(payload: ClientToServerEventPayload<typeof C2S.RoomSetRole>): void {
      deps.emitEvent(C2S.RoomSetRole, payload);
    },

    sendFengShuiObserve(payload: ClientToServerEventPayload<typeof C2S.FengShuiObserve>): void {
      deps.emitEvent(C2S.FengShuiObserve, payload);
    },
  };
}

export type SocketBuildingSender = ReturnType<typeof createSocketBuildingSender>;
