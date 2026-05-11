/**
 * 协议域文件：社交（邮件、建议、聊天）相关 payload 接口。
 * 由 protocol.ts 统一 re-export，外部消费者不需要直接导入本文件。
 */
import type { MailDetailSyncView } from './service-sync-types';

/** 邮件详情同步包。 */
export interface S2C_MailDetail extends MailDetailSyncView {}
