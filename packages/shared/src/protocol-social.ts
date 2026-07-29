/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 协议域文件：社交（邮件、建议、聊天）相关 payload 接口。
 * 由 protocol.ts 统一 re-export，外部消费者不需要直接导入本文件。
 */
import type { MailDetailSyncView } from './service-sync-types';
export type {
  C2S_OrganizeTreasureVaultView,
  C2S_RemoveDaoistRelationView,
  C2S_RenameTreasureVaultView,
  C2S_MarkDaoistDirectMessagesReadView,
  C2S_RequestChatHistoryView,
  C2S_RequestDaoistDirectMessageHistoryView,
  C2S_RequestNearbyDaoistCandidatesView,
  C2S_RequestSocialPanelView,
  C2S_RequestTreasureVaultView,
  C2S_RespondDaoistRequestView,
  C2S_SendDaoistDirectMessageView,
  C2S_SendDaoistRequestView,
  C2S_TreasureVaultDepositView,
  C2S_TreasureVaultWithdrawView,
  C2S_UpdateDaoistRelationLevelView,
  C2S_UpdateTreasureVaultPermissionsView,
  ChatHistoryChannelView,
  ChatHistoryCursorView,
  ChatHistorySyncView,
  DaoistConversationSummaryView,
  DaoistDirectMessageView,
  DaoistDirectMessageHistoryView,
  ServerChatMessageView,
  SocialOperationResultView,
  SocialPanelView,
  TreasureVaultDepositEntryView,
  TreasureVaultDetailView,
  TreasureVaultOperationResultView,
} from './social-types';

/** 邮件详情同步包。 */
export interface S2C_MailDetail extends MailDetailSyncView {}
