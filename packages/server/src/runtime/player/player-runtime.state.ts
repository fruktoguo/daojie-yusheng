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
