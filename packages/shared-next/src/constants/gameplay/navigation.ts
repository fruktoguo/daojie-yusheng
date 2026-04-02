/**
 * 寻路与移动流程常量。
 */

/** A* 与路径评估使用的单步最小代价。 */
export const PATHFINDING_MIN_STEP_COST = 1;

/** 玩家手动寻路允许的最大目标曼哈顿距离。 */
export const PATHFINDING_PLAYER_MAX_TARGET_DISTANCE = 96;

/** 玩家手动寻路允许展开的最大节点数。 */
export const PATHFINDING_PLAYER_MAX_EXPANDED_NODES = 16_384;

/** 玩家路径允许保留的最大步数。 */
export const PATHFINDING_PLAYER_MAX_PATH_LENGTH = 16_384;

/** 路径被阻挡后的重算节点上限，沿用完整玩家寻路预算。 */
export const PATHFINDING_REPATH_MAX_EXPANDED_NODES = PATHFINDING_PLAYER_MAX_EXPANDED_NODES;

/** 路径被阻挡后的重算步数上限，沿用完整玩家寻路预算。 */
export const PATHFINDING_REPATH_MAX_PATH_LENGTH = PATHFINDING_PLAYER_MAX_PATH_LENGTH;

/** Bot 漫游寻路允许展开的最大节点数。 */
export const PATHFINDING_BOT_MAX_EXPANDED_NODES = 512;

/** Bot 漫游允许保留的最大步数。 */
export const PATHFINDING_BOT_MAX_PATH_LENGTH = 24;

/** 攻击接近位搜索允许展开的最大节点数。 */
export const PATHFINDING_APPROACH_MAX_EXPANDED_NODES = 1_024;

/** 攻击接近位搜索允许保留的最大步数。 */
export const PATHFINDING_APPROACH_MAX_PATH_LENGTH = 32;
