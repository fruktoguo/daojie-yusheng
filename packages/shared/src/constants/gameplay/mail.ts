/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 邮件系统游戏常量。
 */

import type { MailFilter } from '../../mail-types';

/** 邮件可用过滤器列表 */
export const MAIL_FILTERS: MailFilter[] = ['all', 'unread', 'claimable'];

/** 新手之旅邮件模板 ID */
export const MAIL_TEMPLATE_BEGINNER_JOURNEY_ID = 'mail.starter.beginner_journey.v1';

/** 天根种子邮件模板 ID */
export const MAIL_TEMPLATE_HEAVEN_ROOT_SEED_ID = 'mail.item.heaven_root_seed.v1';

/** 神根种子邮件模板 ID */
export const MAIL_TEMPLATE_DIVINE_ROOT_SEED_ID = 'mail.item.divine_root_seed.v1';
