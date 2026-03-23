/**
 * 客户端连接恢复与探活常量。
 */

/** 断线后再次尝试恢复连接的等待时间，单位为毫秒。 */
export const CONNECTION_RECOVERY_RETRY_MS = 1_200;

/** 主客户端主动测量往返延迟的发送间隔，单位为毫秒。 */
export const SERVER_PING_INTERVAL_MS = 5_000;

/** 主客户端等待一次延迟探测响应的超时时间，单位为毫秒。 */
export const SOCKET_PING_TIMEOUT_MS = 4_000;

/** Socket.IO 断线重连的初始退避时间，单位为毫秒。 */
export const SOCKET_RECONNECTION_DELAY_MS = 1_000;

/** Socket.IO 断线重连的最大尝试次数。Infinity 表示持续尝试恢复。 */
export const SOCKET_RECONNECTION_ATTEMPTS = Number.POSITIVE_INFINITY;

/** Socket.IO 断线重连的最大退避时间，单位为毫秒。 */
export const SOCKET_RECONNECTION_DELAY_MAX_MS = 5_000;

/** Socket.IO 建连超时时间，单位为毫秒。 */
export const SOCKET_CONNECT_TIMEOUT_MS = 8_000;

/** 客户端 Socket.IO 默认传输方式。 */
export const SOCKET_TRANSPORTS = ['websocket'] as const;
