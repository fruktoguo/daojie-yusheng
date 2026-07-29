/**
 * 本文件定义道友关系、私聊和宝库权限的共享契约。
 *
 * 关系与宝库权限由服务端裁定，客户端只展示状态并提交意图。
 */

import type { ChatMessageScope } from './notice-types';
import type { SyncedItemStack } from './synced-panel-types';

export type DaoistRelationLevel = 'dao_friend' | 'close_friend';

export type DaoistRequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';

export interface DaoistRelationView {
  playerId: string;
  name: string;
  level: DaoistRelationLevel;
  online: boolean;
  instanceId?: string;
  /** 玩家可见的位置名称；instanceId 仅用于内部定位，不直接展示。 */
  instanceName?: string;
  x?: number;
  y?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DaoistRequestView {
  requestId: string;
  fromPlayerId: string;
  fromName: string;
  toPlayerId: string;
  toName: string;
  status: DaoistRequestStatus;
  createdAt: number;
  expiresAt: number;
}

export interface NearbyDaoistCandidateView {
  playerId: string;
  name: string;
  distance: number;
  relationLevel?: DaoistRelationLevel;
  pendingRequest?: 'incoming' | 'outgoing';
}

export interface SocialPanelView {
  relations: DaoistRelationView[];
  incomingRequests: DaoistRequestView[];
  outgoingRequests: DaoistRequestView[];
  nearbyCandidates: NearbyDaoistCandidateView[];
  /** 私聊会话的云端未读摘要；历史正文按会话按需增量同步。 */
  conversations?: DaoistConversationSummaryView[];
}

export type SocialOperationKind =
  | 'request'
  | 'respond'
  | 'level'
  | 'remove'
  | 'message';

export interface SocialOperationResultView {
  ok: boolean;
  operation: SocialOperationKind;
  reason?: string;
  panel?: SocialPanelView;
}

export interface DaoistDirectMessageView {
  messageId: string;
  fromPlayerId: string;
  fromName: string;
  toPlayerId: string;
  toName: string;
  text: string;
  sentAt: number;
}

/** 服务端聊天记录的稳定复合游标。 */
export interface ChatHistoryCursorView {
  occurredAt: number;
  messageId: string;
}

/** 公共聊天消息。 */
export interface ServerChatMessageView extends ChatHistoryCursorView {
  channel: ChatMessageScope;
  fromPlayerId: string;
  from: string;
  text: string;
}

/** 单个公共频道的增量历史。 */
export interface ChatHistoryChannelView {
  channel: ChatMessageScope;
  messages: ServerChatMessageView[];
  /** 本地游标之后的云端记录超过保留窗口时为 true。 */
  truncated: boolean;
}

/** 公共聊天增量同步包。 */
export interface ChatHistorySyncView {
  /** 客户端请求关联 ID，用于丢弃跨图、重连后的过期响应。 */
  requestId?: string;
  channels: ChatHistoryChannelView[];
}

/** 私聊会话的服务端未读摘要。 */
export interface DaoistConversationSummaryView {
  peerPlayerId: string;
  unreadCount: number;
  latestMessageAt?: number;
  latestMessageId?: string;
}

/** 单个私聊会话的增量历史。 */
export interface DaoistDirectMessageHistoryView {
  /** 客户端请求关联 ID，用于隔离切号或并发会话响应。 */
  requestId?: string;
  peerPlayerId: string;
  messages: DaoistDirectMessageView[];
  truncated: boolean;
}

export type TreasureVaultPermissionKind = 'view' | 'deposit' | 'withdraw';

export type TreasureVaultPermissionScope =
  | 'all'
  | 'party'
  | 'sect'
  | 'dao_friend'
  | 'close_friend';

export type TreasureVaultPermissionMap = Record<
  TreasureVaultPermissionKind,
  TreasureVaultPermissionScope[]
>;

export interface TreasureVaultItemView extends SyncedItemStack {
  storageItemId: string;
  slotIndex: number;
}

export interface TreasureVaultDetailView {
  instanceId: string;
  buildingId: string;
  buildingName: string;
  ownerPlayerId: string | null;
  ownerName?: string;
  permissions: TreasureVaultPermissionMap;
  effectivePermissions: Record<TreasureVaultPermissionKind, boolean>;
  items: TreasureVaultItemView[];
  capacity: number;
  revision: number;
}

export interface TreasureVaultOperationResultView {
  ok: boolean;
  operation: 'detail' | 'deposit' | 'withdraw' | 'organize' | 'permissions' | 'rename';
  reason?: string;
  detail?: TreasureVaultDetailView;
}

export interface C2S_RequestSocialPanelView {}

export interface C2S_RequestNearbyDaoistCandidatesView {}

export interface C2S_SendDaoistRequestView {
  targetPlayerId: string;
}

export interface C2S_RespondDaoistRequestView {
  requestId: string;
  accept: boolean;
}

export interface C2S_UpdateDaoistRelationLevelView {
  targetPlayerId: string;
  level: DaoistRelationLevel;
}

export interface C2S_RemoveDaoistRelationView {
  targetPlayerId: string;
}

export interface C2S_SendDaoistDirectMessageView {
  targetPlayerId: string;
  message: string;
}

export interface C2S_RequestChatHistoryView {
  requestId?: string;
  cursors?: Partial<Record<ChatMessageScope, ChatHistoryCursorView>>;
}

export interface C2S_RequestDaoistDirectMessageHistoryView {
  requestId?: string;
  peerPlayerId: string;
  cursor?: ChatHistoryCursorView;
}

export interface C2S_MarkDaoistDirectMessagesReadView {
  peerPlayerId: string;
  /** 客户端已经实际展示的最后一条入站消息；服务端只推进到这个位置。 */
  cursor: ChatHistoryCursorView;
}

export interface C2S_RequestTreasureVaultView {
  instanceId?: string;
  buildingId: string;
}

export interface TreasureVaultDepositEntryView {
  itemInstanceId: string;
  count: number;
}

export interface C2S_TreasureVaultDepositView {
  instanceId?: string;
  buildingId: string;
  /** 批量存入条目；同一请求内的物品实例 ID 不得重复。 */
  items?: TreasureVaultDepositEntryView[];
  /** 兼容批量协议上线前的单件存入客户端。 */
  itemInstanceId?: string;
  count?: number;
}

export interface C2S_TreasureVaultWithdrawView {
  instanceId?: string;
  buildingId: string;
  storageItemId: string;
  count: number;
}

export interface C2S_OrganizeTreasureVaultView {
  instanceId?: string;
  buildingId: string;
}

export interface C2S_UpdateTreasureVaultPermissionsView {
  instanceId?: string;
  buildingId: string;
  permissions: Partial<TreasureVaultPermissionMap>;
}

export interface C2S_RenameTreasureVaultView {
  instanceId?: string;
  buildingId: string;
  name: string;
}
