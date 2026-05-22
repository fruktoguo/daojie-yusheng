/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 客户端界面刷新与 GM 面板节奏常量。
 */

/** 世界时钟在前端本地补帧时的刷新间隔，单位为毫秒。 */
export const CURRENT_TIME_REFRESH_MS = 250;

/** GM 管理台基础状态轮询间隔，单位为毫秒。 */
export const GM_PANEL_POLL_INTERVAL_MS = 5_000;

/** GM 保存角色后等待服务端广播回流的缓冲时间，单位为毫秒。 */
export const GM_APPLY_DELAY_MS = 1_200;

/** GM 世界查看器轮询运行时数据的间隔，单位为毫秒。 */
export const GM_WORLD_POLL_INTERVAL_MS = 2_000;

/** GM 世界查看器默认缩放倍率。 */
export const GM_WORLD_DEFAULT_ZOOM = 1.5;

