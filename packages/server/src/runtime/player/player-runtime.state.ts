/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 玩家运行时状态容器定义。
 * 提供全局玩家 Map 的工厂函数。
 */

/** 玩家运行时状态存储：在线玩家集合。 */
export interface PlayerRuntimeStateStore<TPlayer = unknown> {
  players: Map<string, TPlayer>;
}

/** 创建空的玩家运行时状态容器。 */
export function createPlayerRuntimeStateStore<TPlayer = unknown>(): PlayerRuntimeStateStore<TPlayer> {
  return {
    players: new Map<string, TPlayer>(),
  };
}
