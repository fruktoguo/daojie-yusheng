/**
 * 本文件定义道友关系、私聊和宝库权限的共享契约。
 *
 * 关系与宝库权限由服务端裁定，客户端只展示状态并提交意图。
 */

import type { SyncedItemStack } from './synced-panel-types';

export type DaoistRelationLevel = 'dao_friend' | 'close_friend';

export type DaoistRequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';

export interface DaoistRelationView {
  playerId: string;
  name: string;
  level: DaoistRelationLevel;
  online: boolean;
  instanceId?: string;
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
  operation: 'detail' | 'deposit' | 'withdraw' | 'permissions';
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

export interface C2S_UpdateTreasureVaultPermissionsView {
  instanceId?: string;
  buildingId: string;
  permissions: Partial<TreasureVaultPermissionMap>;
}
