import type { ChatHistoryCursorView } from './social-types';

export const PARTY_MAX_MEMBERS = 5;
export const PARTY_INVITE_TTL_MS = 5 * 60 * 1_000;
export const PARTY_RECRUITMENT_TTL_MS = 30 * 60 * 1_000;
export const PARTY_REWARD_RANGE = 20;

export type PartyMemberRole = 'leader' | 'member';
export type PartyExpMode = 'contribution' | 'equal';
export type PartyLootMode = 'killer' | 'round_robin';
export type PartyPurpose = 'general' | 'leveling' | 'boss' | 'tower' | 'exploration';

export interface PartyMemberView {
  playerId: string;
  playerNo?: number;
  name: string;
  role: PartyMemberRole;
  realmLv: number;
  online: boolean;
  mapId?: string;
  mapName?: string;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  joinedAt: number;
}

export interface PartySettingsView {
  expMode: PartyExpMode;
  lootMode: PartyLootMode;
  friendlyFireEnabled: boolean;
  revision: number;
}

export interface PartyInviteView {
  inviteId: string;
  partyId: string;
  partyLabel: string;
  fromPlayerId: string;
  fromName: string;
  memberCount: number;
  expiresAt: number;
}

export interface PartyJoinApplicationView {
  applicationId: string;
  partyId: string;
  playerId: string;
  playerNo?: number;
  playerName: string;
  realmLv: number;
  createdAt: number;
  expiresAt: number;
}

export interface PartyRecruitmentView {
  listingId: string;
  partyId: string;
  leaderPlayerId: string;
  leaderName: string;
  purpose: PartyPurpose;
  minRealmLv: number;
  maxRealmLv: number;
  note: string;
  memberCount: number;
  maxMembers: number;
  createdAt: number;
  expiresAt: number;
}

export interface PartyMatchQueueView {
  queued: boolean;
  purpose?: PartyPurpose;
  joinedAt?: number;
  initialRealmTolerance?: number;
  currentRealmTolerance?: number;
}

export interface PartyView {
  partyId: string;
  leaderPlayerId: string;
  members: PartyMemberView[];
  settings: PartySettingsView;
  recruitment?: PartyRecruitmentView | null;
  createdAt: number;
  revision: number;
}

export interface PartyPanelView {
  party: PartyView | null;
  incomingInvites: PartyInviteView[];
  incomingApplications: PartyJoinApplicationView[];
  recruitments: PartyRecruitmentView[];
  matchQueue: PartyMatchQueueView;
  serverTime: number;
}

export interface PartyChatMessageView {
  messageId: string;
  partyId: string;
  fromPlayerId: string;
  fromName: string;
  text: string;
  sentAt: number;
}

export interface PartyChatHistoryView {
  requestId?: string;
  partyId: string;
  messages: PartyChatMessageView[];
}

export type PartyOperation =
  | 'panel'
  | 'create'
  | 'invite'
  | 'invite_response'
  | 'leave'
  | 'remove_member'
  | 'transfer_leader'
  | 'disband'
  | 'settings'
  | 'recruit_publish'
  | 'recruit_close'
  | 'recruit_apply'
  | 'application_response'
  | 'match_join'
  | 'match_leave'
  | 'chat';

export interface PartyOperationResultView {
  ok: boolean;
  operation: PartyOperation;
  reason?: string;
  panel?: PartyPanelView;
}

export interface C2S_RequestPartyPanelView {}
export interface C2S_CreatePartyView {}
export interface C2S_InvitePartyPlayerView {
  targetPlayerId?: string;
  targetPlayerNo?: number;
}
export interface C2S_RespondPartyInviteView { inviteId: string; accept: boolean; }
export interface C2S_LeavePartyView {}
export interface C2S_RemovePartyMemberView { targetPlayerId: string; }
export interface C2S_TransferPartyLeaderView { targetPlayerId: string; }
export interface C2S_DisbandPartyView {}
export interface C2S_UpdatePartySettingsView {
  expectedRevision: number;
  expMode?: PartyExpMode;
  lootMode?: PartyLootMode;
  friendlyFireEnabled?: boolean;
}
export interface C2S_PublishPartyRecruitmentView {
  expectedRevision: number;
  purpose: PartyPurpose;
  minRealmLv: number;
  maxRealmLv: number;
  note?: string;
}
export interface C2S_ClosePartyRecruitmentView { expectedRevision: number; }
export interface C2S_RequestPartyRecruitmentsView { purpose?: PartyPurpose; }
export interface C2S_ApplyPartyRecruitmentView { listingId: string; }
export interface C2S_RespondPartyApplicationView { applicationId: string; accept: boolean; }
export interface C2S_JoinPartyMatchView { purpose: PartyPurpose; }
export interface C2S_LeavePartyMatchView {}
export interface C2S_SendPartyChatView { text: string; }
export interface C2S_RequestPartyChatHistoryView {
  requestId?: string;
  cursor?: ChatHistoryCursorView;
}
