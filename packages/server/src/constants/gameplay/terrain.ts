/**
 * 地形相关玩法常量。
 */
import { TileType } from '@mud/shared';
import { RUNTIME_TILE_RESOURCE_NODES } from './resource-nodes';

/** 矿脉奖励结算的基准伤害。 */
export const ORE_REWARD_BASE_DAMAGE = 100;
/** 矿脉奖励按伤害递增时使用的倍率门槛。 */
export const ORE_REWARD_DAMAGE_SCALE = 3;

/** 各矿种对应的基础掉落物。 */
export const ORE_REWARD_ITEM_ID_BY_TILE: Partial<Record<TileType, string>> = Object.fromEntries(
  RUNTIME_TILE_RESOURCE_NODES.map((node) => [node.tileType, node.itemId]),
) as Partial<Record<TileType, string>>;

/** 资源地块掉落提示里显示的来源名。 */
export const ORE_REWARD_SOURCE_LABEL_BY_TILE: Partial<Record<TileType, string>> = Object.fromEntries(
  RUNTIME_TILE_RESOURCE_NODES.map((node) => [node.tileType, node.sourceLabel]),
) as Partial<Record<TileType, string>>;

/** 各矿种“每 100 伤害”的基础掉落概率，单位为万分比。 */
export const ORE_REWARD_BASE_CHANCE_BPS_BY_TILE: Partial<Record<TileType, number>> = Object.fromEntries(
  RUNTIME_TILE_RESOURCE_NODES.map((node) => [node.tileType, node.baseChanceBps]),
) as Partial<Record<TileType, number>>;
