import { MINING_DROP_BASE_DAMAGE_MAX_HP_RATIO } from './constants/gameplay/craft';
import { getMiningDamageDropMultiplier } from './craft-skill';
import { TileType } from './world-core-types';

export const MINERAL_CRYSTAL_USE_BEHAVIOR = 'create_mineral_vein';
export const MINERAL_CRYSTAL_DURATION_TICKS = 86_400;
export const MINERAL_CRYSTAL_DROP_DIVISOR = 10_000;

export const MINERAL_CRYSTALS = [
  { itemId: 'spirit_vein_crystal', tileType: TileType.SpiritOre },
  { itemId: 'black_iron_vein_crystal', tileType: TileType.BlackIronOre },
] as const;

/** 伤害仅复用千分之一阈值的线性/平方根曲线，独立掉落只接受幸运乘区。 */
export function computeMineralCrystalDropChance(appliedDamage: number, maxHp: number, luckBonus = 0): number {
  return Math.min(1, getMiningDamageDropMultiplier(appliedDamage, maxHp)
    * MINING_DROP_BASE_DAMAGE_MAX_HP_RATIO / MINERAL_CRYSTAL_DROP_DIVISOR
    * (1 + Math.max(0, Number.isFinite(luckBonus) ? luckBonus : 0)));
}
