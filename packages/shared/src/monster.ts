import {
  addPartialNumericStats,
  cloneNumericStats,
  createNumericStats,
  type NumericStats,
  type PartialNumericStats,
} from './numeric';
import { getRealmAttributeMultiplier, getRealmLinearGrowthMultiplier } from './combat';
import {
  compileValueStatsToActualStats,
  NUMERIC_STAT_ACTUAL_POINTS_PER_CONFIG_VALUE,
} from './value';
import type { NumericScalarStatKey } from './numeric';

export type MonsterCombatModel = 'legacy' | 'value_stats';

const MONSTER_EXPONENTIAL_NUMERIC_KEYS = ['maxHp', 'physAtk', 'spellAtk'] as const satisfies readonly NumericScalarStatKey[];
const MONSTER_LINEAR_NUMERIC_KEYS = [
  'maxQi',
  'physDef',
  'spellDef',
  'hit',
  'dodge',
  'crit',
  'critDamage',
  'breakPower',
  'resolvePower',
  'maxQiOutputPerTick',
  'qiRegenRate',
  'hpRegenRate',
  'cooldownSpeed',
  'extraAggroRate',
] as const satisfies readonly NumericScalarStatKey[];

export interface LegacyMonsterNumericProfile {
  maxHp: number;
  attack: number;
  level?: number;
  viewRange?: number;
}

function normalizeMonsterLevel(level?: number): number {
  return Math.max(1, Math.floor(level ?? 1));
}

function roundConfigValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function getMonsterStatScalingMultiplier(key: NumericScalarStatKey, level: number): number {
  if ((MONSTER_EXPONENTIAL_NUMERIC_KEYS as readonly string[]).includes(key)) {
    return getRealmAttributeMultiplier(level);
  }
  if ((MONSTER_LINEAR_NUMERIC_KEYS as readonly string[]).includes(key)) {
    return getRealmLinearGrowthMultiplier(level);
  }
  return 1;
}

export function applyMonsterLevelScaling(stats: NumericStats, level?: number): NumericStats {
  const normalizedLevel = normalizeMonsterLevel(level);
  const scaled = cloneNumericStats(stats);
  const exponentialMultiplier = getRealmAttributeMultiplier(normalizedLevel);
  if (exponentialMultiplier !== 1) {
    for (const key of MONSTER_EXPONENTIAL_NUMERIC_KEYS) {
      scaled[key] = Math.max(0, Math.round(scaled[key] * exponentialMultiplier));
    }
  }

  const linearMultiplier = getRealmLinearGrowthMultiplier(normalizedLevel);
  if (linearMultiplier !== 1) {
    for (const key of MONSTER_LINEAR_NUMERIC_KEYS) {
      scaled[key] = Math.max(0, Math.round(scaled[key] * linearMultiplier));
    }
  }
  return scaled;
}

export function compileMonsterValueStats(valueStats?: PartialNumericStats): NumericStats {
  const actual = compileValueStatsToActualStats(valueStats);
  const stats = createNumericStats();
  addPartialNumericStats(stats, actual);
  return stats;
}

export function resolveMonsterNumericStatsFromValueStats(valueStats?: PartialNumericStats, level?: number): NumericStats {
  return applyMonsterLevelScaling(compileMonsterValueStats(valueStats), level);
}

export function estimateMonsterSpiritFromStats(stats: NumericStats, level?: number): number {
  const normalizedLevel = normalizeMonsterLevel(level);
  return Math.max(6, Math.round(normalizedLevel * 12 + stats.physAtk * 0.8 + stats.maxHp * 0.18));
}

export function buildLegacyMonsterNumericStats(profile: LegacyMonsterNumericProfile): NumericStats {
  const level = normalizeMonsterLevel(profile.level ?? Math.round(profile.attack / 6));
  const maxHp = Math.max(1, Math.round(profile.maxHp));
  const attack = Math.max(1, Math.round(profile.attack));
  const stats = createNumericStats();
  stats.maxHp = maxHp;
  stats.physAtk = attack;
  stats.spellAtk = Math.max(1, Math.round(attack * 0.9));
  stats.physDef = Math.max(0, Math.round(maxHp * 0.18 + level * 2));
  stats.spellDef = Math.max(0, Math.round(maxHp * 0.14 + level * 2));
  stats.hit = 12 + level * 8;
  stats.dodge = level * 4;
  stats.crit = level * 2;
  stats.critDamage = level * 6;
  stats.breakPower = level * 3;
  stats.resolvePower = level * 3;
  stats.viewRange = Math.max(0, Math.round(profile.viewRange ?? 6));
  const spirit = estimateMonsterSpiritFromStats(stats, level);
  stats.maxQi = Math.max(24, Math.round(spirit * 2 + level * 8));
  return stats;
}

export function inferMonsterValueStatsFromLegacy(profile: LegacyMonsterNumericProfile): PartialNumericStats {
  const level = normalizeMonsterLevel(profile.level ?? Math.round(profile.attack / 6));
  const actualStats = buildLegacyMonsterNumericStats(profile);
  const valueStats: PartialNumericStats = {};

  const applyScalar = (key: NumericScalarStatKey): void => {
    const actual = actualStats[key];
    if (!actual) {
      return;
    }
    const multiplier = getMonsterStatScalingMultiplier(key, level);
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
  applyScalar('critDamage');
  applyScalar('breakPower');
  applyScalar('resolvePower');
  applyScalar('viewRange');

  return valueStats;
}
