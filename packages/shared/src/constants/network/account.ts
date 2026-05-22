/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 账号与密码输入规则常量。
 */

/** 账号最小长度。 */
export const ACCOUNT_MIN_LENGTH = 1;

/** 账号最大长度。 */
export const ACCOUNT_MAX_LENGTH = 20;

/** 密码最小长度。 */
export const PASSWORD_MIN_LENGTH = 8;

/** 角色名称最大长度。 */
export const ROLE_NAME_MAX_LENGTH = 7;

/** 角色名称纯英文最大长度。 */
export const ROLE_NAME_MAX_ASCII_LENGTH = 14;
