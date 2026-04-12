import {
  addPartialNumericStats,
  cloneNumericStats,
  createNumericStats,
  type NumericStats,
  type PartialNumericStats,
} from './numeric';
import {
  ATTR_KEYS,
  ATTR_TO_NUMERIC_WEIGHTS,
  ATTR_TO_PERCENT_NUMERIC_WEIGHTS,
  DEFAULT_PLAYER_REALM_STAGE,
  EQUIP_SLOTS,
  MONSTER_GLOBAL_STAT_PERCENTS,
  MONSTER_GRADE_STAT_PERCENTS,
  MONSTER_KILL_EXP_LEVEL_DELTA_CAP,
  MONSTER_TIER_EXP_MULTIPLIERS,
  MONSTER_TIER_OVERLEVEL_EXP_REDUCTION_RATES,
  MONSTER_TIER_STAT_PERCENTS,
  NUMERIC_SCALAR_STAT_KEYS,
  PLAYER_REALM_ORDER,
  PLAYER_REALM_NUMERIC_TEMPLATES,
  PLAYER_REALM_STAGE_LEVEL_RANGES,
} from './constants';
import { getRealmAttributeMultiplier, getRealmLinearGrowthMultiplier } from './combat';
import {
  compileValueStatsToActualStats,
  NUMERIC_STAT_ACTUAL_POINTS_PER_CONFIG_VALUE,
} from './value';
import type { Attributes, EquipmentSlots, MonsterTier, NumericStatPercentages, PlayerRealmStage, TechniqueGrade } from './types';
import type { NumericScalarStatKey } from './numeric';

/** MonsterCombatModel：定义该类型的结构与数据语义。 */
export type MonsterCombatModel = 'legacy' | 'value_stats';

const MONSTER_EXPONENTIAL_NUMERIC_KEYS = [
  'maxHp',
  'maxQi',
  'physAtk',
  'spellAtk',
  'physDef',
  'spellDef',
  'hit',
  'dodge',
  'crit',
  'antiCrit',
  'breakPower',
  'resolvePower',
  'cooldownSpeed',
  'moveSpeed',
  'extraAggroRate',
  'viewRange',
] as const satisfies readonly NumericScalarStatKey[];
const MONSTER_LINEAR_NUMERIC_KEYS = [
  'critDamage',
  'maxQiOutputPerTick',
  'qiRegenRate',
  'hpRegenRate',
] as const satisfies readonly NumericScalarStatKey[];
const MONSTER_LINEAR_NUMERIC_GROWTH_RATES: Record<typeof MONSTER_LINEAR_NUMERIC_KEYS[number], number> = {
  critDamage: 0.1,
  maxQiOutputPerTick: 0.1,
  qiRegenRate: 0.02,
  hpRegenRate: 0.02,
};

/** getMonsterLinearGrowthRate：执行对应的业务逻辑。 */
function getMonsterLinearGrowthRate(key: NumericScalarStatKey): number | null {
  switch (key) {
    case 'critDamage':
    case 'maxQiOutputPerTick':
      return 0.1;
    case 'qiRegenRate':
    case 'hpRegenRate':
      return 0.02;
    default:
      return null;
  }
}

/** LegacyMonsterNumericProfile：定义该接口的能力与字段约束。 */
export interface LegacyMonsterNumericProfile {
  maxHp: number;
  attack: number;
  level?: number;
  viewRange?: number;
}

/** MonsterFormulaInput：定义该接口的能力与字段约束。 */
export interface MonsterFormulaInput {
  attrs?: Partial<Attributes>;
  equipment?: Partial<EquipmentSlots>;
  level?: number;
  statPercents?: NumericStatPercentages;
  grade?: TechniqueGrade;
  tier?: MonsterTier;
}

/** PercentBonusAccumulator：定义该类型的结构与数据语义。 */
type PercentBonusAccumulator = Pick<NumericStats, 'maxHp' | 'maxQi' | 'physAtk' | 'spellAtk'>;
const MONSTER_SECONDARY_ATTR_RATIO = 0.2;
const MONSTER_BASE_HP_REGEN_RATE = 5;

/** normalizeMonsterLevel：执行对应的业务逻辑。 */
function normalizeMonsterLevel(level?: number): number {
  return Math.max(1, Math.floor(level ?? 1));
}

/** roundConfigValue：执行对应的业务逻辑。 */
function roundConfigValue(value: number): number {
  return Math.round(value * 100) / 100;
}

/** resolveMonsterBaseRealmStage：执行对应的业务逻辑。 */
function resolveMonsterBaseRealmStage(level?: number): PlayerRealmStage {
  const normalizedLevel = normalizeMonsterLevel(level);
  for (const stage of [...PLAYER_REALM_ORDER].reverse()) {
    const range = PLAYER_REALM_STAGE_LEVEL_RANGES[stage];
    if (normalizedLevel >= range.levelFrom) {
      return stage;
    }
  }
  return DEFAULT_PLAYER_REALM_STAGE;
}

/** createMonsterAttributes：执行对应的业务逻辑。 */
export function createMonsterAttributes(initial = 0): Attributes {
  return {
    constitution: initial,
    spirit: initial,
    perception: initial,
    talent: initial,
    comprehension: initial,
    luck: initial,
  };
}

/** normalizeMonsterTier：执行对应的业务逻辑。 */
export function normalizeMonsterTier(tier: unknown, fallback: MonsterTier = 'mortal_blood'): MonsterTier {
  return tier === 'mortal_blood' || tier === 'variant' || tier === 'demon_king' ? tier : fallback;
}

/** inferMonsterTierFromName：执行对应的业务逻辑。 */
export function inferMonsterTierFromName(name: string | undefined): MonsterTier {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (/妖王|荒王|兽王|王$/.test(normalizedName)) {
    return 'demon_king';
  }
  if (/精英|异种/.test(normalizedName)) {
    return 'variant';
  }
  return 'mortal_blood';
}

/** getDefaultMonsterExpMultiplier：执行对应的业务逻辑。 */
export function getDefaultMonsterExpMultiplier(tier: MonsterTier | undefined): number {
  return MONSTER_TIER_EXP_MULTIPLIERS[normalizeMonsterTier(tier)] ?? 1;
}

/** resolveMonsterExpMultiplier：执行对应的业务逻辑。 */
export function resolveMonsterExpMultiplier(expMultiplier: unknown, tier: MonsterTier | undefined): number {
  if (Number.isFinite(expMultiplier)) {
    return Math.max(0, Number(expMultiplier));
  }
  return getDefaultMonsterExpMultiplier(tier);
}

/** shouldPersistMonsterTier：执行对应的业务逻辑。 */
export function shouldPersistMonsterTier(tier: MonsterTier | undefined, name: string | undefined): boolean {
  return normalizeMonsterTier(tier) !== inferMonsterTierFromName(name);
}

/** shouldPersistMonsterExpMultiplier：执行对应的业务逻辑。 */
export function shouldPersistMonsterExpMultiplier(expMultiplier: unknown, tier: MonsterTier | undefined): boolean {
  return resolveMonsterExpMultiplier(expMultiplier, tier) !== getDefaultMonsterExpMultiplier(tier);
}

/** getMonsterKillExpLevelAdjustment：执行对应的业务逻辑。 */
export function getMonsterKillExpLevelAdjustment(
  playerRealmLv: number,
  monsterLevel: number,
  tier: MonsterTier | undefined,
): number {
  const normalizedPlayerLevel = Math.max(1, Math.floor(playerRealmLv));
  const normalizedMonsterLevel = Math.max(1, Math.floor(monsterLevel));
  const levelDelta = Math.min(
    MONSTER_KILL_EXP_LEVEL_DELTA_CAP,
    Math.abs(normalizedMonsterLevel - normalizedPlayerLevel),
  );
  if (normalizedPlayerLevel < normalizedMonsterLevel) {
    return 1.5 ** levelDelta;
  }
  if (normalizedPlayerLevel > normalizedMonsterLevel) {
    const reductionRate = MONSTER_TIER_OVERLEVEL_EXP_REDUCTION_RATES[normalizeMonsterTier(tier)] ?? 0.5;
    return Math.max(0, 1 - reductionRate) ** levelDelta;
  }
  return 1;
}

/** normalizeMonsterAttrs：执行对应的业务逻辑。 */
export function normalizeMonsterAttrs(
  attrs: Partial<Attributes> | undefined,
  fallback?: Attributes,
): Attributes {
  const result = fallback ? { ...fallback } : createMonsterAttributes();
  for (const key of ATTR_KEYS) {
    const value = attrs?.[key];
    result[key] = Number.isFinite(value) ? Math.max(0, Number(value)) : (fallback?.[key] ?? 0);
  }
  return result;
}

/** normalizeMonsterStatPercents：执行对应的业务逻辑。 */
export function normalizeMonsterStatPercents(statPercents: NumericStatPercentages | undefined): NumericStatPercentages | undefined {
  if (!statPercents) {
    return undefined;
  }
  const result: NumericStatPercentages = {};
  for (const key of Object.keys(statPercents) as NumericScalarStatKey[]) {
    const value = statPercents[key];
    if (!Number.isFinite(value)) {
      continue;
    }
    result[key] = Math.max(0, Number(value));
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** accumulateAttrPercentBonus：执行对应的业务逻辑。 */
function accumulateAttrPercentBonus(target: PercentBonusAccumulator, attrs: Attributes): void {
  for (const key of ATTR_KEYS) {
    const value = attrs[key];
    if (value === 0) {
      continue;
    }
    const weight = ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key];
    if (!weight) {
      continue;
    }
    if (weight.maxHp !== undefined) target.maxHp += weight.maxHp * value;
    if (weight.maxQi !== undefined) target.maxQi += weight.maxQi * value;
    if (weight.physAtk !== undefined) target.physAtk += weight.physAtk * value;
    if (weight.spellAtk !== undefined) target.spellAtk += weight.spellAtk * value;
  }
}

/** applyAttrWeight：执行对应的业务逻辑。 */
function applyAttrWeight(target: NumericStats, attrs: Attributes): void {
  for (const key of ATTR_KEYS) {
    const value = attrs[key];
    if (value === 0) {
      continue;
    }
    const weight = ATTR_TO_NUMERIC_WEIGHTS[key];
    if (!weight) {
      continue;
    }
    if (weight.maxHp !== undefined) target.maxHp += weight.maxHp * value;
    if (weight.maxQi !== undefined) target.maxQi += weight.maxQi * value;
    if (weight.physAtk !== undefined) target.physAtk += weight.physAtk * value;
    if (weight.spellAtk !== undefined) target.spellAtk += weight.spellAtk * value;
    if (weight.physDef !== undefined) target.physDef += weight.physDef * value;
    if (weight.spellDef !== undefined) target.spellDef += weight.spellDef * value;
    if (weight.hit !== undefined) target.hit += weight.hit * value;
    if (weight.dodge !== undefined) target.dodge += weight.dodge * value;
    if (weight.crit !== undefined) target.crit += weight.crit * value;
    if (weight.antiCrit !== undefined) target.antiCrit += weight.antiCrit * value;
    if (weight.critDamage !== undefined) target.critDamage += weight.critDamage * value;
    if (weight.breakPower !== undefined) target.breakPower += weight.breakPower * value;
    if (weight.resolvePower !== undefined) target.resolvePower += weight.resolvePower * value;
    if (weight.maxQiOutputPerTick !== undefined) target.maxQiOutputPerTick += weight.maxQiOutputPerTick * value;
    if (weight.qiRegenRate !== undefined) target.qiRegenRate += weight.qiRegenRate * value;
    if (weight.hpRegenRate !== undefined) target.hpRegenRate += weight.hpRegenRate * value;
    if (weight.cooldownSpeed !== undefined) target.cooldownSpeed += weight.cooldownSpeed * value;
    if (weight.auraPowerRate !== undefined) target.auraPowerRate += weight.auraPowerRate * value;
    if (weight.techniqueExpRate !== undefined) target.techniqueExpRate += weight.techniqueExpRate * value;
    if (weight.lootRate !== undefined) target.lootRate += weight.lootRate * value;
    if (weight.rareLootRate !== undefined) target.rareLootRate += weight.rareLootRate * value;
    if (weight.moveSpeed !== undefined) target.moveSpeed += weight.moveSpeed * value;
  }
}

/** applyPercentBonuses：执行对应的业务逻辑。 */
function applyPercentBonuses(target: NumericStats, bonuses: PercentBonusAccumulator): void {
  if (bonuses.maxHp !== 0) target.maxHp *= 1 + bonuses.maxHp / 100;
  if (bonuses.maxQi !== 0) target.maxQi *= 1 + bonuses.maxQi / 100;
  if (bonuses.physAtk !== 0) target.physAtk *= 1 + bonuses.physAtk / 100;
  if (bonuses.spellAtk !== 0) target.spellAtk *= 1 + bonuses.spellAtk / 100;
}

/** mergeMonsterEquipmentAttrs：执行对应的业务逻辑。 */
function mergeMonsterEquipmentAttrs(
  attrs: Attributes,
  equipment?: Partial<EquipmentSlots>,
): Attributes {
  for (const slot of EQUIP_SLOTS) {
    const item = equipment?.[slot];
    if (!item?.equipAttrs) {
      continue;
    }
    for (const key of ATTR_KEYS) {
      const value = item.equipAttrs[key];
      if (!Number.isFinite(value)) {
        continue;
      }
      attrs[key] += Number(value);
    }
  }
  return attrs;
}

/** applyMonsterEquipmentStats：执行对应的业务逻辑。 */
function applyMonsterEquipmentStats(
  target: NumericStats,
  equipment?: Partial<EquipmentSlots>,
): void {
  for (const slot of EQUIP_SLOTS) {
    const item = equipment?.[slot];
    if (!item?.equipStats) {
      continue;
    }
    addPartialNumericStats(target, item.equipStats);
  }
}

/** computeMonsterBaseNumericStatsFromAttrs：执行对应的业务逻辑。 */
export function computeMonsterBaseNumericStatsFromAttrs(
  attrs?: Partial<Attributes>,
  equipment?: Partial<EquipmentSlots>,
  level?: number,
): NumericStats {
  const normalizedAttrs = mergeMonsterEquipmentAttrs(normalizeMonsterAttrs(attrs), equipment);
  const template = PLAYER_REALM_NUMERIC_TEMPLATES[resolveMonsterBaseRealmStage(level)];
  const percentBonuses: PercentBonusAccumulator = {
    maxHp: 0,
    maxQi: 0,
    physAtk: 0,
    spellAtk: 0,
  };
  const stats = createNumericStats();
  addPartialNumericStats(stats, template.stats);
  // 怪物只保留通用基础 200% 暴伤，不继承玩家境界模板里的额外暴伤。
  stats.critDamage = 0;
  stats.hpRegenRate = MONSTER_BASE_HP_REGEN_RATE;
  applyAttrWeight(stats, normalizedAttrs);
  applyMonsterEquipmentStats(stats, equipment);
  accumulateAttrPercentBonus(percentBonuses, normalizedAttrs);
  applyPercentBonuses(stats, percentBonuses);
  return stats;
}

/** applyMonsterLevelScaling：执行对应的业务逻辑。 */
export function applyMonsterLevelScaling(stats: NumericStats, level?: number): NumericStats {
  const normalizedLevel = normalizeMonsterLevel(level);
  const scaled = cloneNumericStats(stats);
  const exponentialMultiplier = getRealmAttributeMultiplier(normalizedLevel);
  if (exponentialMultiplier !== 1) {
    for (const key of MONSTER_EXPONENTIAL_NUMERIC_KEYS) {
      scaled[key] = Math.max(0, Math.round(scaled[key] * exponentialMultiplier));
    }
  }

  for (const key of MONSTER_LINEAR_NUMERIC_KEYS) {
    const linearMultiplier = getRealmLinearGrowthMultiplier(normalizedLevel, MONSTER_LINEAR_NUMERIC_GROWTH_RATES[key]);
    if (linearMultiplier !== 1) {
      scaled[key] = Math.max(0, Math.round(scaled[key] * linearMultiplier));
    }
  }
  return scaled;
}

/** applyNumericStatPercentages：执行对应的业务逻辑。 */
export function applyNumericStatPercentages(stats: NumericStats, percents?: NumericStatPercentages): NumericStats {
  if (!percents) {
    return stats;
  }
  for (const key of Object.keys(percents) as NumericScalarStatKey[]) {
    const percent = percents[key];
    if (!Number.isFinite(percent)) {
      continue;
    }
    stats[key] = Math.max(0, Math.round(stats[key] * Number(percent) / 100));
  }
  return stats;
}

/** resolveMonsterNumericStatsFromAttributes：执行对应的业务逻辑。 */
export function resolveMonsterNumericStatsFromAttributes(input: MonsterFormulaInput): NumericStats {
  const base = computeMonsterBaseNumericStatsFromAttrs(input.attrs, input.equipment, input.level);
  const scaled = applyMonsterLevelScaling(base, input.level);
  applyNumericStatPercentages(scaled, normalizeMonsterStatPercents(input.statPercents));
  applyNumericStatPercentages(scaled, MONSTER_GRADE_STAT_PERCENTS[input.grade ?? 'mortal']);
  applyNumericStatPercentages(scaled, MONSTER_TIER_STAT_PERCENTS[normalizeMonsterTier(input.tier)]);
  applyNumericStatPercentages(scaled, MONSTER_GLOBAL_STAT_PERCENTS);
  return scaled;
}

/** createMonsterAutoStatPercents：执行对应的业务逻辑。 */
export function createMonsterAutoStatPercents(
  targetStats: NumericStats,
  attrs: Partial<Attributes> | undefined,
  level?: number,
  equipment?: Partial<EquipmentSlots>,
): NumericStatPercentages {
  const base = applyMonsterLevelScaling(computeMonsterBaseNumericStatsFromAttrs(attrs, equipment, level), level);
  const percents: NumericStatPercentages = {};
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const target = targetStats[key];
    const baseline = base[key];
    if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(baseline) || baseline <= 0) {
      continue;
    }
    percents[key] = roundConfigValue(target / baseline * 100);
  }
  return percents;
}

/** inferMonsterAttrsFromNumericStats：执行对应的业务逻辑。 */
export function inferMonsterAttrsFromNumericStats(stats: NumericStats): Attributes {
  const constitution = Math.max(1, Math.round(Math.max(
    stats.physDef,
    stats.maxHp / 24,
    stats.physAtk * 0.6,
  )));
  const spirit = Math.max(1, Math.round(Math.max(
    stats.spellDef,
    stats.maxQi / 18,
    stats.spellAtk * 0.8,
  )));
  const perception = Math.max(1, Math.round(Math.max(
    stats.dodge,
    Math.min(stats.hit, Math.max(1, stats.moveSpeed * 0.1)),
  )));
  const talent = Math.max(1, Math.round(Math.max(
    stats.resolvePower,
    stats.maxHp / 42,
    stats.maxQi / 32,
  )));
  const comprehension = Math.max(0, Math.round(Math.max(
    stats.breakPower,
    stats.maxQiOutputPerTick,
    stats.qiRegenRate / 16,
  ) * MONSTER_SECONDARY_ATTR_RATIO));
  const luck = Math.max(0, Math.round(Math.max(
    stats.crit,
    stats.antiCrit,
    Math.min(stats.hit, stats.dodge),
  ) * MONSTER_SECONDARY_ATTR_RATIO));
  return {
    constitution,
    spirit,
    perception,
    talent,
    comprehension,
    luck,
  };
}

/** compileMonsterValueStats：执行对应的业务逻辑。 */
export function compileMonsterValueStats(valueStats?: PartialNumericStats): NumericStats {
  const actual = compileValueStatsToActualStats(valueStats);
  const stats = createNumericStats();
  addPartialNumericStats(stats, actual);
  return stats;
}

/** resolveMonsterNumericStatsFromValueStats：执行对应的业务逻辑。 */
export function resolveMonsterNumericStatsFromValueStats(valueStats?: PartialNumericStats, level?: number): NumericStats {
  return applyMonsterLevelScaling(compileMonsterValueStats(valueStats), level);
}

/** estimateMonsterSpiritFromStats：执行对应的业务逻辑。 */
export function estimateMonsterSpiritFromStats(stats: NumericStats, level?: number): number {
  const normalizedLevel = normalizeMonsterLevel(level);
  return Math.max(6, Math.round(normalizedLevel * 12 + stats.physAtk * 0.8 + stats.maxHp * 0.18));
}

/** buildLegacyMonsterNumericStats：执行对应的业务逻辑。 */
export function buildLegacyMonsterNumericStats(profile: LegacyMonsterNumericProfile): NumericStats {
  const level = normalizeMonsterLevel(profile.level ?? Math.round(profile.attack / 6));
  const maxHp = Math.max(1, Math.round(profile.maxHp));
  const attack = Math.max(1, Math.round(profile.attack));
  const stats = createNumericStats();
  stats.maxHp = maxHp;
  stats.maxQi = Math.max(24, Math.round(maxHp * 0.4 + level * 8));
  stats.physAtk = attack;
  stats.spellAtk = Math.max(1, Math.round(attack * 0.9));
  stats.physDef = Math.max(0, Math.round(maxHp * 0.18 + level * 2));
  stats.spellDef = Math.max(0, Math.round(maxHp * 0.14 + level * 2));
  stats.hit = 12 + level * 8;
  stats.dodge = level * 4;
  stats.crit = level * 2;
  stats.antiCrit = level * 2;
  stats.critDamage = level * 6;
  stats.breakPower = level * 3;
  stats.resolvePower = level * 3;
  stats.viewRange = Math.max(0, Math.round(profile.viewRange ?? 6));
  return stats;
}

/** inferMonsterValueStatsFromLegacy：执行对应的业务逻辑。 */
export function inferMonsterValueStatsFromLegacy(profile: LegacyMonsterNumericProfile): PartialNumericStats {
  const level = normalizeMonsterLevel(profile.level ?? Math.round(profile.attack / 6));
  const actualStats = buildLegacyMonsterNumericStats(profile);
  const valueStats: PartialNumericStats = {};

  const applyScalar = (key: NumericScalarStatKey): void => {
    const actual = actualStats[key];
    if (!actual) {
      return;
    }
    const linearGrowthRate = getMonsterLinearGrowthRate(key);
    const multiplier = (MONSTER_EXPONENTIAL_NUMERIC_KEYS as readonly string[]).includes(key)
      ? getRealmAttributeMultiplier(level)
      : linearGrowthRate !== null
        ? getRealmLinearGrowthMultiplier(level, linearGrowthRate)
        : 1;
    const configUnit = NUMERIC_STAT_ACTUAL_POINTS_PER_CONFIG_VALUE[key];
    const baseValue = actual / multiplier / configUnit;
    if (Math.abs(baseValue) < 1e-6) {
      return;
    }
    valueStats[key] = roundConfigValue(baseValue);
  };

  applyScalar('maxHp');
  applyScalar('maxQi');
  applyScalar('physAtk');
  applyScalar('spellAtk');
  applyScalar('physDef');
  applyScalar('spellDef');
  applyScalar('hit');
  applyScalar('dodge');
  applyScalar('crit');
  applyScalar('antiCrit');
  applyScalar('critDamage');
  applyScalar('breakPower');
  applyScalar('resolvePower');
  applyScalar('viewRange');

  return valueStats;
}

