/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 装备系统通用常量。
 */

/** 装备槽位列表。 */
export const EQUIP_SLOTS = ['weapon', 'head', 'body', 'legs', 'accessory'] as const;

/** 装备槽位整理顺序。 */
export const EQUIP_SLOT_SORT_ORDER = {
  weapon: 0,
  head: 1,
  body: 2,
  legs: 3,
  accessory: 4,
} as const;
