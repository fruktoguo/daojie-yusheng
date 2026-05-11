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
