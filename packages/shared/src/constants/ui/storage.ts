/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 客户端本地存储与持久化键常量。
 */

/** 地图记忆缓存的本地存储键。 */
export const MAP_MEMORY_STORAGE_KEY = 'mud:map-memory:v2';

/** 地图记忆缓存的数据格式版本。 */
export const MAP_MEMORY_FORMAT_VERSION = 3;

/** 地图记忆写入本地存储前的防抖时间，单位为毫秒。 */
export const MAP_MEMORY_PERSIST_DEBOUNCE_MS = 1_500;

/** 地图静态缓存的本地存储键。 */
export const MAP_STATIC_CACHE_STORAGE_KEY = 'mud:map-static-cache:v2';

/** UI 样式配置的本地存储键。 */
export const UI_STYLE_STORAGE_KEY = 'mud-ui-style-config:v1';

/** GM 管理台最近一次可用密码的本地存储键。 */
export const GM_PASSWORD_STORAGE_KEY = 'mud:gm-password:v1';
