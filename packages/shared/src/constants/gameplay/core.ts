/**
 * 游戏核心流程常量（Tick、在线态与基础结算）。
 */

/** 玩家动作节流间隔（毫秒），用于输入节流与单次操作冷却。 */
export const TICK_INTERVAL = 1000;

/** 世界运行时主循环间隔（毫秒），按 1Hz 推进。 */
export const WORLD_TICK_INTERVAL_MS = TICK_INTERVAL;

/** 世界运行时主循环频率（Hz）。 */
export const WORLD_TICK_RATE_HZ = 1000 / WORLD_TICK_INTERVAL_MS;

/** 单 tick 最大处理时间（毫秒） */
export const TICK_BUDGET = 200;

/** 死亡等待时间（秒） */
export const DEATH_WAIT_TIME = 10;

/** 断线保留时间（秒） */
export const DISCONNECT_RETAIN_TIME = 120;

/** 离线玩家在世界中保留的默认时长（秒） */
export const DEFAULT_OFFLINE_PLAYER_TIMEOUT_SEC = 48 * 60 * 60;

/** 新角色默认骨龄（岁） */
export const DEFAULT_BONE_AGE_YEARS = 15;

/** 一年按多少游戏日折算 */
export const GAME_YEAR_DAYS = 365;

/** 复活后 HP 比例 */
export const RESPAWN_HP_RATIO = 0.5;

/** 死亡经验惩罚比例 */
export const DEATH_EXP_PENALTY = 0.1;

/** Redis 落盘间隔（秒） */
export const PERSIST_INTERVAL = 60;

/** 服务端默认端口 */
export const SERVER_PORT = 3000;
