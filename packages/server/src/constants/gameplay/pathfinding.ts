/**
 * 服务端寻路调度常量。
 */
import * as os from 'os';

/** 玩家显式点地移动优先级。数值越小越优先。 */
export const PATH_REQUEST_PRIORITY_PLAYER_MOVE = 10;

/** 玩家每息最多允许发起的寻路请求次数。 */
export const PATH_REQUEST_MAX_PER_TICK_PER_PLAYER = 4;

/** 路径阻挡后的重算优先级。 */
export const PATH_REQUEST_PRIORITY_PLAYER_REPATH = 5;

/** Bot 漫游重算优先级。 */
export const PATH_REQUEST_PRIORITY_BOT_ROAM = 30;

/** 同一实体重复重算路径的冷却息数。 */
export const PATH_REPATH_COOLDOWN_TICKS = 1;

/** 连续失败后的退避息数。 */
export const PATH_RETRY_BACKOFF_TICKS = 2;

/** 动态阻挡时尝试本地微调的最大半径。 */
export const PATH_DYNAMIC_ADJUST_MAX_RADIUS = 3;

/** 动态阻挡时最多尝试接回后续路径的节点数。 */
export const PATH_DYNAMIC_ADJUST_LOOKAHEAD = 6;

/** 单张地图每次调度最多下发的请求数量。 */
export const PATH_REQUEST_DISPATCH_BATCH_SIZE = 64;

/** 寻路 worker 数量，保守限制在 1~4。 */
export const PATHFINDING_WORKER_COUNT = Math.max(1, Math.min(Math.max(1, os.cpus().length - 1), 4));
