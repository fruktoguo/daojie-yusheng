/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
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
