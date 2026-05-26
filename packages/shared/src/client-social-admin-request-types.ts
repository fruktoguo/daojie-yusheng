/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/** GM 取状态。 */
export interface GmGetStateRequestView {}

/** GM 生成机器人。 */
export interface GmSpawnBotsRequestView {
/**
 * count：数量或计量字段。
 */

  count: number;
}

/** GM 移除机器人。 */
export interface GmRemoveBotsRequestView {
/**
 * playerIds：玩家ID相关字段。
 */

  playerIds?: string[];  
  /**
 * all：all相关字段。
 */

  all?: boolean;
}

/** GM 调整玩家。 */
export interface GmUpdatePlayerRequestView {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;  
  /**
 * hp：hp相关字段。
 */

  hp: number;  
  /**
 * autoBattle：autoBattle相关字段。
 */

  autoBattle: boolean;
}

/** GM 重置玩家。 */
export interface GmResetPlayerRequestView {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;
}
