/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 网络会话与连接存活常量。
 */

/** 玩家心跳发送间隔，单位为毫秒。 */
export const PLAYER_HEARTBEAT_INTERVAL_MS = 15_000;

/** 玩家心跳超时判定窗口，单位为毫秒。 */
export const PLAYER_HEARTBEAT_TIMEOUT_MS = 45_000;
