/**
 * 游戏核心流程常量（Tick、在线态与基础结算）。
 */

/** Tick 间隔（毫秒） */
export const TICK_INTERVAL = 1000;

/** 单 tick 最大处理时间（毫秒） */
export const TICK_BUDGET = 200;

/** 死亡等待时间（秒） */
export const DEATH_WAIT_TIME = 10;

/** 断线保留时间（秒） */
export const DISCONNECT_RETAIN_TIME = 120;

/** 玩家心跳发送间隔（毫秒） */
export const PLAYER_HEARTBEAT_INTERVAL_MS = 15_000;

/** 玩家心跳超时判定（毫秒） */
export const PLAYER_HEARTBEAT_TIMEOUT_MS = 45_000;

/** 离线玩家在世界中保留的默认时长（秒） */
export const DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC = 48 * 60 * 60;

/** 复活后 HP 比例 */
export const RESPAWN_HP_RATIO = 0.5;

/** 死亡经验惩罚比例 */
export const DEATH_EXP_PENALTY = 0.1;

/** Redis 落盘间隔（秒） */
export const PERSIST_INTERVAL = 60;

/** 服务端默认端口 */
export const SERVER_PORT = 3000;
