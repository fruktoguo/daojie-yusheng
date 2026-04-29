/**
 * 客户端侧 HTTP API 前缀常量。
 */

export const HTTP_API_PREFIX = '/api';

/** AUTH_API_BASE_PATH：玩家登录/刷新 API 前缀。 */
export const AUTH_API_BASE_PATH = `${HTTP_API_PREFIX}/auth`;

/** ACCOUNT_API_BASE_PATH：玩家账号 API 前缀。 */
export const ACCOUNT_API_BASE_PATH = `${HTTP_API_PREFIX}/account`;

/** GM_AUTH_API_BASE_PATH：GM 登录/改密 API 前缀。 */
export const GM_AUTH_API_BASE_PATH = `${AUTH_API_BASE_PATH}/gm`;

/** GM_API_BASE_PATH：GM 页面 API 前缀。 */
export const GM_API_BASE_PATH = `${HTTP_API_PREFIX}/gm`;
