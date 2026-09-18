export const PLANT_SEED_USE_BEHAVIOR = 'plant_seed';
export const SPIRIT_FARMLAND_BUILDING_ID = 'spirit_farmland';
export const PLANTED_HERB_DURATION_TICKS = 7 * 86_400;
export const PLANT_SEED_DROP_CHANCE = 0.002;

/** 每次成功采集独立判定，只有幸运乘区参与；灵田种植物不产种子。 */
export function computePlantSeedDropChance(luckBonus = 0): number {
  return Math.min(1, PLANT_SEED_DROP_CHANCE * (1 + Math.max(0, Number.isFinite(luckBonus) ? luckBonus : 0)));
}

/** 零级灵气为原速，每级复利增加 10%。 */
export function computeHerbGrowthRate(auraLevel: number): number {
  return 1.1 ** Math.max(0, Math.trunc(Number.isFinite(auraLevel) ? auraLevel : 0));
}
