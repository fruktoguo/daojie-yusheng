/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 客户端会话与本地存储键常量。
 */

/** 玩家 access token 的本地存储键。 */
export const ACCESS_TOKEN_STORAGE_KEY = 'accessToken';

/** 玩家 refresh token 的本地存储键。 */
export const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken';

/** GM 管理台 access token 的会话存储键。 */
export const GM_ACCESS_TOKEN_STORAGE_KEY = 'mud:gm-access-token';

