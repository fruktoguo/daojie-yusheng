import {
  addPartialNumericStats,
  applyNumericStatsPercentMultiplier,
  cloneNumericStats,
  createNumericStats,
  percentModifierToMultiplier,
  type NumericStats,
  type PartialNumericStats,
} from './numeric';
import {
  ATTR_KEYS,
  ATTR_TO_NUMERIC_WEIGHTS,
  ATTR_TO_PERCENT_NUMERIC_WEIGHTS,
  ELEMENT_KEYS,
  NUMERIC_SCALAR_STAT_KEYS,
} from './constants/gameplay/attributes';
import { EQUIP_SLOTS } from './constants/gameplay/equipment';
import * as monsterGameplayConstants from './constants/gameplay/monster';
import {
  DEFAULT_PLAYER_REALM_STAGE,
  PLAYER_REALM_ORDER,
  PLAYER_REALM_NUMERIC_TEMPLATES,
  PLAYER_REALM_STAGE_LEVEL_RANGES,
} from './constants/gameplay/realm';
import { getRealmAttributeMultiplier, getRealmLinearGrowthMultiplier } from './combat';
import {
  compileValueStatsToActualStats,
  NUMERIC_STAT_ACTUAL_POINTS_PER_CONFIG_VALUE,
} from './value';
import type {
  Attributes,
  EquipSlot,
  EquipmentSlots,
  ItemStack,
  ItemType,
  MonsterAggroMode,
  MonsterTier,
  NumericStatPercentages,
  PlayerRealmStage,
  TechniqueGrade,
} from './types';
import type { NumericScalarStatKey } from './numeric';

export type MonsterCombatModel = 'legacy' | 'value_stats';

const {
  MONSTER_GLOBAL_STAT_PERCENTS,
  MONSTER_GRADE_STAT_PERCENTS,
  MONSTER_LEVEL_EXP_DECAY_MULTIPLIER_EARLY,
  MONSTER_LEVEL_EXP_DECAY_MULTIPLIER_LATE,
  MONSTER_LEVEL_EXP_DECAY_MULTIPLIER_MID,
  MONSTER_LEVEL_FLAT_GROWTH_STATS,
  MONSTER_TIER_EXP_MULTIPLIERS,
  MONSTER_TIER_OVERLEVEL_EXP_REDUCTION_RATES,
  MONSTER_TIER_STAT_PERCENTS,
} = monsterGameplayConstants;

const MONSTER_EXPONENTIAL_NUMERIC_KEYS = ['maxHp', 'maxQi', 'physAtk', 'spellAtk'] as const satisfies readonly NumericScalarStatKey[];
const MONSTER_LINEAR_NUMERIC_KEYS = [
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
  'moveSpeed',
  'extraAggroRate',
  'viewRange',
] as const satisfies readonly NumericScalarStatKey[];

export interface LegacyMonsterNumericProfile {
  maxHp: number;
  attack: number;
  level?: number;
  viewRange?: number;
}

export interface MonsterFormulaInput {
  attrs?: Partial<Attributes>;
  equipment?: Partial<EquipmentSlots>;
  level?: number;
  statPercents?: NumericStatPercentages;
  grade?: TechniqueGrade;
  tier?: MonsterTier;
}

export interface MonsterTemplateDropRecord {
  itemId: string;
  name: string;
  type: ItemType;
  count: number;
  chance?: number;
}

export type MonsterTemplateEquipmentRefs = Partial<Record<EquipSlot, string>>;

export interface MonsterTemplateConfiguredRecord {
  id: string;
  name: string;
  char: string;
  color: string;
  grade?: TechniqueGrade;
  tier?: MonsterTier;
  valueStats?: PartialNumericStats;
  attrs?: Partial<Attributes>;
  statPercents?: NumericStatPercentages;
  equipment?: MonsterTemplateEquipmentRefs;
  skills?: string[];
  hp?: number;
  maxHp?: number;
  attack?: number;
  count?: number;
  radius?: number;
  maxAlive?: number;
  aggroRange?: number;
  viewRange?: number;
  aggroMode?: MonsterAggroMode;
  respawnSec?: number;
  respawnTicks?: number;
  level?: number;
  expMultiplier?: number;
  drops?: MonsterTemplateDropRecord[];
}

export interface MonsterTemplateEditorItem {
  itemId: string;
  name: string;
  type: ItemType;
  desc: string;
  count?: number;
  groundLabel?: string;
  grade?: TechniqueGrade;
  level?: number;
  equipSlot?: EquipSlot;
  equipAttrs?: Partial<Attributes>;
  equipStats?: PartialNumericStats;
  equipValueStats?: PartialNumericStats;
  effects?: ItemStack['effects'];
  tags?: string[];
  mapUnlockId?: string;
  tileAuraGainAmount?: number;
  allowBatchUse?: boolean;
}

export type MonsterTemplateSourceMode = 'legacy' | 'value_stats' | 'attributes';

export interface MonsterTemplateResolvedRecord extends MonsterTemplateConfiguredRecord {
  grade: TechniqueGrade;
  tier: MonsterTier;
  valueStats?: PartialNumericStats;
  attrs?: Attributes;
  statPercents?: NumericStatPercentages;
  equipment: MonsterTemplateEquipmentRefs;
  skills: string[];
  computedStats: NumericStats;
  resolvedAttrs: Attributes;
  resolvedStatPercents?: NumericStatPercentages;
  combatModel: MonsterCombatModel;
  sourceMode: MonsterTemplateSourceMode;
  hp: number;
  maxHp: number;
  attack: number;
  count: number;
  radius: number;
  maxAlive: number;
  aggroRange: number;
  viewRange: number;
  aggroMode: MonsterAggroMode;
  respawnSec: number;
  respawnTicks?: number;
  level?: number;
  expMultiplier: number;
  drops: MonsterTemplateDropRecord[];
}

type PercentBonusAccumulator = NumericStats;
const MONSTER_SECONDARY_ATTR_RATIO = 0.2;
const MONSTER_BASE_HP_REGEN_RATE = 5;

function normalizeMonsterLevel(level?: number): number {
  return Math.max(1, Math.floor(level ?? 1));
}

function roundConfigValue(value: number): number {
  return Math.round(value * 100) / 100;
}

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

function isTechniqueGrade(value: unknown): value is TechniqueGrade {
  return value === 'mortal'
    || value === 'yellow'
    || value === 'mystic'
    || value === 'earth'
    || value === 'heaven'
    || value === 'spirit'
    || value === 'saint'
    || value === 'emperor';
}

function isMonsterAggroMode(value: unknown): value is MonsterAggroMode {
  return value === 'always' || value === 'retaliate' || value === 'day_only' || value === 'night_only';
}

function normalizeMonsterConfigStats(stats: unknown): PartialNumericStats | undefined {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
    return undefined;
  }
  const source = stats as Record<string, unknown>;
  const normalized: PartialNumericStats = {};
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const value = source[key];
    if (!Number.isFinite(value)) {
      continue;
    }
    normalized[key] = Number(value);
  }
  for (const groupKey of ['elementDamageBonus', 'elementDamageReduce'] as const) {
    const group = source[groupKey];
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      continue;
    }
    const groupSource = group as Record<string, unknown>;
    const normalizedGroup: Partial<Record<typeof ELEMENT_KEYS[number], number>> = {};
    for (const element of ELEMENT_KEYS) {
      const value = groupSource[element];
      if (!Number.isFinite(value)) {
        continue;
      }
      normalizedGroup[element] = Number(value);
    }
    if (Object.keys(normalizedGroup).length > 0) {
      normalized[groupKey] = normalizedGroup;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

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

export function normalizeMonsterTier(tier: unknown, fallback: MonsterTier = 'mortal_blood'): MonsterTier {
  return tier === 'mortal_blood' || tier === 'variant' || tier === 'demon_king' ? tier : fallback;
}

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

export function getDefaultMonsterExpMultiplier(tier: MonsterTier | undefined): number {
  return MONSTER_TIER_EXP_MULTIPLIERS[normalizeMonsterTier(tier)] ?? 1;
}

export function resolveMonsterExpMultiplier(expMultiplier: unknown, tier: MonsterTier | undefined): number {
  if (Number.isFinite(expMultiplier)) {
    return Math.max(0, Number(expMultiplier));
  }
  return getDefaultMonsterExpMultiplier(tier);
}

export function shouldPersistMonsterTier(tier: MonsterTier | undefined, name: string | undefined): boolean {
  return normalizeMonsterTier(tier) !== inferMonsterTierFromName(name);
}

export function shouldPersistMonsterExpMultiplier(expMultiplier: unknown, tier: MonsterTier | undefined): boolean {
  return resolveMonsterExpMultiplier(expMultiplier, tier) !== getDefaultMonsterExpMultiplier(tier);
}

export function getMonsterKillExpLevelAdjustment(
  playerRealmLv: number,
  monsterLevel: number,
  tier: MonsterTier | undefined,
): number {
  const normalizedPlayerLevel = Math.max(1, Math.floor(playerRealmLv));
  const normalizedMonsterLevel = Math.max(1, Math.floor(monsterLevel));
  if (normalizedPlayerLevel < normalizedMonsterLevel) {
    return 1.5 ** (normalizedMonsterLevel - normalizedPlayerLevel);
  }
  if (normalizedPlayerLevel > normalizedMonsterLevel) {
    const reductionRate = MONSTER_TIER_OVERLEVEL_EXP_REDUCTION_RATES[normalizeMonsterTier(tier)] ?? 0.5;
    return Math.max(0, 1 - reductionRate) ** (normalizedPlayerLevel - normalizedMonsterLevel);
  }
  return 1;
}

export function getMonsterLevelExpDecayMultiplier(monsterLevel: number): number {
  const normalizedMonsterLevel = Math.max(1, Math.floor(monsterLevel));
  const earlyLevelSteps = Math.max(0, Math.min(normalizedMonsterLevel, 18) - 1);
  const midLevelSteps = Math.max(0, Math.min(normalizedMonsterLevel, 30) - 18);
  const lateLevelSteps = Math.max(0, normalizedMonsterLevel - 30);
  return (MONSTER_LEVEL_EXP_DECAY_MULTIPLIER_EARLY ** earlyLevelSteps)
    * (MONSTER_LEVEL_EXP_DECAY_MULTIPLIER_MID ** midLevelSteps)
    * (MONSTER_LEVEL_EXP_DECAY_MULTIPLIER_LATE ** lateLevelSteps);
}

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
    for (const statKey of NUMERIC_SCALAR_STAT_KEYS) {
      const weightValue = weight[statKey];
      if (weightValue === undefined) {
        continue;
      }
      target[statKey] += weightValue * value;
    }
  }
}

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

function applyPercentBonuses(target: NumericStats, bonuses: PercentBonusAccumulator): void {
  applyNumericStatsPercentMultiplier(target, bonuses);
}

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

function applyMonsterLevelFlatGrowth(target: NumericStats, level: number): NumericStats {
  const levelDelta = Math.max(0, level - 1);
  if (levelDelta === 0) {
    return target;
  }
  target.maxHp += (MONSTER_LEVEL_FLAT_GROWTH_STATS.maxHp ?? 0) * levelDelta;
  target.maxQi += (MONSTER_LEVEL_FLAT_GROWTH_STATS.maxQi ?? 0) * levelDelta;
  target.physAtk += (MONSTER_LEVEL_FLAT_GROWTH_STATS.physAtk ?? 0) * levelDelta;
  target.spellAtk += (MONSTER_LEVEL_FLAT_GROWTH_STATS.spellAtk ?? 0) * levelDelta;
  target.physDef += (MONSTER_LEVEL_FLAT_GROWTH_STATS.physDef ?? 0) * levelDelta;
  target.spellDef += (MONSTER_LEVEL_FLAT_GROWTH_STATS.spellDef ?? 0) * levelDelta;
  target.hit += (MONSTER_LEVEL_FLAT_GROWTH_STATS.hit ?? 0) * levelDelta;
  target.dodge += (MONSTER_LEVEL_FLAT_GROWTH_STATS.dodge ?? 0) * levelDelta;
  target.crit += (MONSTER_LEVEL_FLAT_GROWTH_STATS.crit ?? 0) * levelDelta;
  target.breakPower += (MONSTER_LEVEL_FLAT_GROWTH_STATS.breakPower ?? 0) * levelDelta;
  target.resolvePower += (MONSTER_LEVEL_FLAT_GROWTH_STATS.resolvePower ?? 0) * levelDelta;
  target.cooldownSpeed += (MONSTER_LEVEL_FLAT_GROWTH_STATS.cooldownSpeed ?? 0) * levelDelta;
  return target;
}

export function computeMonsterBaseNumericStatsFromAttrs(
  attrs?: Partial<Attributes>,
  equipment?: Partial<EquipmentSlots>,
  level?: number,
): NumericStats {
  const normalizedAttrs = mergeMonsterEquipmentAttrs(normalizeMonsterAttrs(attrs), equipment);
  const template = PLAYER_REALM_NUMERIC_TEMPLATES[resolveMonsterBaseRealmStage(level)];
  const percentBonuses = createNumericStats();
  const stats = createNumericStats();
  addPartialNumericStats(stats, template.stats);
  stats.hpRegenRate = MONSTER_BASE_HP_REGEN_RATE;
  applyAttrWeight(stats, normalizedAttrs);
  applyMonsterEquipmentStats(stats, equipment);
  accumulateAttrPercentBonus(percentBonuses, normalizedAttrs);
  applyPercentBonuses(stats, percentBonuses);
  return stats;
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
  return applyMonsterLevelFlatGrowth(scaled, normalizedLevel);
}

export function applyNumericStatPercentages(stats: NumericStats, percents?: NumericStatPercentages): NumericStats {
  if (!percents) {
    return stats;
  }
  for (const key of Object.keys(percents) as NumericScalarStatKey[]) {
    const percent = percents[key];
    if (!Number.isFinite(percent)) {
      continue;
    }
    const deltaPercent = Number(percent) - 100;
    stats[key] = Math.max(0, Math.round(stats[key] * percentModifierToMultiplier(deltaPercent)));
  }
  return stats;
}

export function resolveMonsterNumericStatsFromAttributes(input: MonsterFormulaInput): NumericStats {
  const base = computeMonsterBaseNumericStatsFromAttrs(input.attrs, input.equipment, input.level);
  const scaled = applyMonsterLevelScaling(base, input.level);
  applyNumericStatPercentages(scaled, normalizeMonsterStatPercents(input.statPercents));
  applyNumericStatPercentages(scaled, MONSTER_GRADE_STAT_PERCENTS[input.grade ?? 'mortal']);
  applyNumericStatPercentages(scaled, MONSTER_TIER_STAT_PERCENTS[normalizeMonsterTier(input.tier)]);
  applyNumericStatPercentages(scaled, MONSTER_GLOBAL_STAT_PERCENTS);
  return scaled;
}

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
  stats.maxQi = Math.max(24, Math.round(maxHp * 0.4 + level * 8));
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
    const multiplier = (MONSTER_EXPONENTIAL_NUMERIC_KEYS as readonly string[]).includes(key)
      ? getRealmAttributeMultiplier(level)
      : (MONSTER_LINEAR_NUMERIC_KEYS as readonly string[]).includes(key)
        ? getRealmLinearGrowthMultiplier(level)
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
  applyScalar('critDamage');
  applyScalar('breakPower');
  applyScalar('resolvePower');
  applyScalar('viewRange');

  return valueStats;
}

export function normalizeMonsterTemplateEquipmentRefs(rawEquipment: unknown): MonsterTemplateEquipmentRefs {
  const normalized: MonsterTemplateEquipmentRefs = {};
  if (!rawEquipment || typeof rawEquipment !== 'object' || Array.isArray(rawEquipment)) {
    return normalized;
  }
  const source = rawEquipment as Record<string, unknown>;
  for (const slot of EQUIP_SLOTS) {
    const entry = source[slot];
    const entryRecord = entry && typeof entry === 'object' && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : undefined;
    const itemId = typeof entry === 'string'
      ? entry.trim()
      : (entryRecord && typeof entryRecord.itemId === 'string' ? entryRecord.itemId.trim() : '');
    if (itemId) {
      normalized[slot] = itemId;
    }
  }
  return normalized;
}

export function normalizeMonsterTemplateSkillIds(rawSkills: unknown): string[] {
  if (!Array.isArray(rawSkills)) {
    return [];
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of rawSkills) {
    if (typeof entry !== 'string') {
      continue;
    }
    const skillId = entry.trim();
    if (!skillId || seen.has(skillId)) {
      continue;
    }
    seen.add(skillId);
    result.push(skillId);
  }
  return result;
}

export function normalizeMonsterTemplateDrops(rawDrops: unknown): MonsterTemplateDropRecord[] {
  if (!Array.isArray(rawDrops)) {
    return [];
  }
  const result: MonsterTemplateDropRecord[] = [];
  for (const entry of rawDrops) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const source = entry as Record<string, unknown>;
    const itemId = typeof source.itemId === 'string' ? source.itemId.trim() : '';
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    const type = source.type;
    if (!itemId || !name || typeof type !== 'string') {
      continue;
    }
    result.push({
      itemId,
      name,
      type: type as ItemType,
      count: Number.isFinite(source.count) ? Math.max(1, Math.floor(Number(source.count))) : 1,
      chance: Number.isFinite(source.chance) ? Number(source.chance) : undefined,
    });
  }
  return result;
}

function resolveMonsterTemplateItem(
  itemId: string,
  itemLookup?: ReadonlyMap<string, MonsterTemplateEditorItem> | Record<string, MonsterTemplateEditorItem>,
): MonsterTemplateEditorItem | undefined {
  if (!itemLookup) {
    return undefined;
  }
  const mapLookup = itemLookup as ReadonlyMap<string, MonsterTemplateEditorItem>;
  if (typeof mapLookup.get === 'function') {
    return mapLookup.get(itemId);
  }
  return (itemLookup as Record<string, MonsterTemplateEditorItem>)[itemId];
}

function createMonsterTemplateEquipmentItem(item: MonsterTemplateEditorItem): ItemStack {
  return {
    itemId: item.itemId,
    name: item.name,
    type: item.type,
    count: 1,
    desc: item.desc,
    groundLabel: item.groundLabel,
    grade: item.grade,
    level: item.level,
    equipSlot: item.equipSlot,
    equipAttrs: item.equipAttrs,
    equipStats: item.equipStats ?? compileValueStatsToActualStats(item.equipValueStats),
    equipValueStats: item.equipValueStats,
    effects: item.effects,
    tags: item.tags,
    mapUnlockId: item.mapUnlockId,
    tileAuraGainAmount: item.tileAuraGainAmount,
    allowBatchUse: item.allowBatchUse,
  };
}

function resolveMonsterTemplateEquipmentSlots(
  equipmentRefs: MonsterTemplateEquipmentRefs,
  itemLookup?: ReadonlyMap<string, MonsterTemplateEditorItem> | Record<string, MonsterTemplateEditorItem>,
): EquipmentSlots {
  const equipment = {
    weapon: null,
    head: null,
    body: null,
    legs: null,
    accessory: null,
  } as EquipmentSlots;
  for (const slot of EQUIP_SLOTS) {
    const itemId = equipmentRefs[slot];
    if (!itemId) {
      continue;
    }
    const item = resolveMonsterTemplateItem(itemId, itemLookup);
    if (!item || item.type !== 'equipment' || item.equipSlot !== slot) {
      continue;
    }
    equipment[slot] = createMonsterTemplateEquipmentItem(item);
  }
  return equipment;
}

export function resolveMonsterTemplateRecord(
  rawMonster: MonsterTemplateConfiguredRecord | Record<string, unknown>,
  itemLookup?: ReadonlyMap<string, MonsterTemplateEditorItem> | Record<string, MonsterTemplateEditorItem>,
): MonsterTemplateResolvedRecord {
  const monster = rawMonster as MonsterTemplateConfiguredRecord & Record<string, unknown>;
  const attrsInput = monster.attrs as Partial<Attributes> | undefined;
  const statPercentsInput = monster.statPercents as NumericStatPercentages | undefined;
  const level = Number.isFinite(monster.level) ? Math.max(1, Math.floor(Number(monster.level))) : undefined;
  const grade = isTechniqueGrade(monster.grade) ? monster.grade : 'mortal';
  const tier = normalizeMonsterTier(monster.tier ?? inferMonsterTierFromName(typeof monster.name === 'string' ? monster.name : undefined));
  const valueStats = normalizeMonsterConfigStats(monster.valueStats);
  const attrs = attrsInput ? normalizeMonsterAttrs(attrsInput) : undefined;
  const equipmentRefs = normalizeMonsterTemplateEquipmentRefs(monster.equipment);
  const equipment = resolveMonsterTemplateEquipmentSlots(equipmentRefs, itemLookup);
  const legacyMaxHp = Math.max(
    1,
    Math.round(
      Number.isFinite(monster.maxHp)
        ? Number(monster.maxHp)
        : (Number.isFinite(monster.hp) ? Number(monster.hp) : 1),
    ),
  );
  const legacyAttack = Math.max(1, Math.round(Number.isFinite(monster.attack) ? Number(monster.attack) : 1));
  const fallbackValueStats = !valueStats && !attrs
    ? inferMonsterValueStatsFromLegacy({
        maxHp: legacyMaxHp,
        attack: legacyAttack,
        level,
        viewRange: Number.isFinite(monster.viewRange)
          ? Math.max(0, Math.floor(Number(monster.viewRange)))
          : (Number.isFinite(monster.aggroRange) ? Math.max(0, Math.floor(Number(monster.aggroRange))) : 6),
      })
    : undefined;
  const effectiveValueStats = valueStats ?? fallbackValueStats;
  const legacyNumericStats = effectiveValueStats
    ? resolveMonsterNumericStatsFromValueStats(effectiveValueStats, level)
    : resolveMonsterNumericStatsFromAttributes({
        attrs,
        equipment,
        level,
      });
  const resolvedAttrs = normalizeMonsterAttrs(
    attrsInput,
    attrs ? undefined : inferMonsterAttrsFromNumericStats(legacyNumericStats),
  );
  const resolvedStatPercents = normalizeMonsterStatPercents(statPercentsInput)
    ?? (attrsInput
      ? undefined
      : createMonsterAutoStatPercents(legacyNumericStats, resolvedAttrs, level, equipment));
  const computedStats = resolveMonsterNumericStatsFromAttributes({
    attrs: resolvedAttrs,
    equipment,
    level,
    statPercents: resolvedStatPercents,
    grade,
    tier,
  });
  const count = Number.isFinite(monster.count)
    ? Math.max(1, Math.floor(Number(monster.count)))
    : (Number.isFinite(monster.maxAlive) ? Math.max(1, Math.floor(Number(monster.maxAlive))) : 1);
  const aggroRange = Number.isFinite(monster.aggroRange) ? Math.max(0, Math.floor(Number(monster.aggroRange))) : 6;
  const sourceMode: MonsterTemplateSourceMode = attrsInput
    ? 'attributes'
    : (valueStats || fallbackValueStats ? 'value_stats' : 'legacy');

  return {
    id: typeof monster.id === 'string' ? monster.id.trim() : '',
    name: typeof monster.name === 'string' ? monster.name.trim() : '',
    char: typeof monster.char === 'string' ? monster.char.trim() : '',
    color: typeof monster.color === 'string' ? monster.color.trim() : '',
    grade,
    tier,
    valueStats,
    attrs,
    statPercents: normalizeMonsterStatPercents(statPercentsInput),
    equipment: equipmentRefs,
    skills: normalizeMonsterTemplateSkillIds(monster.skills),
    computedStats,
    resolvedAttrs,
    resolvedStatPercents,
    combatModel: 'value_stats',
    sourceMode,
    hp: Math.max(1, Math.round(computedStats.maxHp || Number(monster.hp) || 1)),
    maxHp: Math.max(
      1,
      Math.round(computedStats.maxHp || (Number.isFinite(monster.maxHp) ? Number(monster.maxHp) : Number(monster.hp) || 1)),
    ),
    attack: Math.max(1, Math.round(computedStats.physAtk || computedStats.spellAtk || Number(monster.attack) || 1)),
    level,
    count,
    radius: Number.isFinite(monster.radius) ? Math.max(0, Math.floor(Number(monster.radius))) : 3,
    maxAlive: Number.isFinite(monster.maxAlive)
      ? Math.max(1, Math.floor(Number(monster.maxAlive)))
      : count,
    aggroRange,
    viewRange: Number.isFinite(monster.viewRange)
      ? Math.max(0, Math.floor(Number(monster.viewRange)))
      : aggroRange,
    aggroMode: isMonsterAggroMode(monster.aggroMode) ? monster.aggroMode : 'always',
    respawnSec: Number.isFinite(monster.respawnSec) ? Math.max(1, Math.floor(Number(monster.respawnSec))) : 15,
    respawnTicks: Number.isFinite(monster.respawnTicks) ? Math.max(1, Math.floor(Number(monster.respawnTicks))) : undefined,
    expMultiplier: resolveMonsterExpMultiplier(monster.expMultiplier, tier),
    drops: normalizeMonsterTemplateDrops(monster.drops),
  };
}
