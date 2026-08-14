/**
 * 本文件属于客户端网络层，负责组队相关的 C2S 发包封装。
 *
 * 维护时要使用共享协议事件名和最小字段，避免把服务端权威判断下沉到客户端。
 */
import { C2S, type ClientToServerEventPayload } from '@mud/shared';
import type { SocketEmitEvent } from './socket-send-types';

type PartySenderDeps = {
  emitEvent: SocketEmitEvent;
};

export function createSocketPartySender(deps: PartySenderDeps) {
  return {
    sendRequestPartyPanel(): void {
      deps.emitEvent(C2S.RequestPartyPanel, {});
    },
    sendCreateParty(): void {
      deps.emitEvent(C2S.CreateParty, {});
    },
    sendInvitePartyPlayer(payload: ClientToServerEventPayload<typeof C2S.InvitePartyPlayer>): void {
      deps.emitEvent(C2S.InvitePartyPlayer, payload);
    },
    sendRespondPartyInvite(inviteId: string, accept: boolean): void {
      deps.emitEvent(C2S.RespondPartyInvite, { inviteId, accept });
    },
    sendLeaveParty(): void {
      deps.emitEvent(C2S.LeaveParty, {});
    },
    sendRemovePartyMember(targetPlayerId: string): void {
      deps.emitEvent(C2S.RemovePartyMember, { targetPlayerId });
    },
    sendTransferPartyLeader(targetPlayerId: string): void {
      deps.emitEvent(C2S.TransferPartyLeader, { targetPlayerId });
    },
    sendDisbandParty(): void {
      deps.emitEvent(C2S.DisbandParty, {});
    },
    sendUpdatePartySettings(payload: ClientToServerEventPayload<typeof C2S.UpdatePartySettings>): void {
      deps.emitEvent(C2S.UpdatePartySettings, payload);
    },
    sendPublishPartyRecruitment(payload: ClientToServerEventPayload<typeof C2S.PublishPartyRecruitment>): void {
      deps.emitEvent(C2S.PublishPartyRecruitment, payload);
    },
    sendClosePartyRecruitment(expectedRevision: number): void {
      deps.emitEvent(C2S.ClosePartyRecruitment, { expectedRevision });
    },
    sendRequestPartyRecruitments(purpose?: ClientToServerEventPayload<typeof C2S.RequestPartyRecruitments>['purpose']): void {
      deps.emitEvent(C2S.RequestPartyRecruitments, purpose ? { purpose } : {});
    },
    sendApplyPartyRecruitment(listingId: string): void {
      deps.emitEvent(C2S.ApplyPartyRecruitment, { listingId });
    },
    sendRespondPartyApplication(applicationId: string, accept: boolean): void {
      deps.emitEvent(C2S.RespondPartyApplication, { applicationId, accept });
    },
    sendJoinPartyMatch(purpose: ClientToServerEventPayload<typeof C2S.JoinPartyMatch>['purpose']): void {
      deps.emitEvent(C2S.JoinPartyMatch, { purpose });
    },
    sendLeavePartyMatch(): void {
      deps.emitEvent(C2S.LeavePartyMatch, {});
    },
    sendSendPartyChat(text: string): void {
      deps.emitEvent(C2S.SendPartyChat, { text });
    },
    sendRequestPartyChatHistory(payload: ClientToServerEventPayload<typeof C2S.RequestPartyChatHistory>): void {
      deps.emitEvent(C2S.RequestPartyChatHistory, payload);
    },
  };
}

export type SocketPartySender = ReturnType<typeof createSocketPartySender>;
