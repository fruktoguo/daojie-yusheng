/**
 * 地形相关玩法常量。
 */
import { TileType } from '@mud/shared';

/** 矿脉奖励结算的基准伤害。 */
export const ORE_REWARD_BASE_DAMAGE = 100;
/** 矿脉奖励按伤害递增时使用的倍率门槛。 */
export const ORE_REWARD_DAMAGE_SCALE = 3;

/** 各矿种对应的基础掉落物。 */
export const ORE_REWARD_ITEM_ID_BY_TILE: Partial<Record<TileType, string>> = {
  [TileType.SpiritOre]: 'spirit_stone',
  [TileType.BlackIronOre]: 'black_iron_chunk',
  [TileType.Cloud]: 'cloud_puff',
};

/** 各矿种“每 100 伤害”的基础掉落概率，单位为万分比。 */
export const ORE_REWARD_BASE_CHANCE_BPS_BY_TILE: Partial<Record<TileType, number>> = {
  [TileType.SpiritOre]: 20,
  [TileType.BlackIronOre]: 50,
  [TileType.Cloud]: 200,
};
