/**
 * 玩家运行时状态容器定义。
 * 提供全局玩家 Map 和待处理战斗效果队列的工厂函数。
 */
import type { CombatEffect } from '@mud/shared';

/** 玩家运行时状态存储：在线玩家集合 + 待处理战斗效果队列。 */
export interface PlayerRuntimeStateStore<TPlayer = unknown> {
  players: Map<string, TPlayer>;
  pendingCombatEffectsByPlayerId: Map<string, CombatEffect[]>;
}

/** 创建空的玩家运行时状态容器。 */
export function createPlayerRuntimeStateStore<TPlayer = unknown>(): PlayerRuntimeStateStore<TPlayer> {
  return {
    players: new Map<string, TPlayer>(),
    pendingCombatEffectsByPlayerId: new Map<string, CombatEffect[]>(),
  };
}
