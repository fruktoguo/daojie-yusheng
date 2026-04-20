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
} from './constants/gameplay';
import { ELEMENT_KEYS } from './constants/gameplay/attributes';
import { getRealmAttributeMultiplier, getRealmLinearGrowthMultiplier } from './combat';
import { compileValueStatsToActualStats } from './value';
import type {
  Attributes,
  NumericStatPercentages,
} from './attribute-types';
import type { EquipSlot, EquipmentSlots, ItemStack, ItemType } from './item-runtime-types';
import type { MonsterAggroMode, MonsterTier } from './world-core-types';
import type { MonsterInitialBuffDef } from './skill-types';
import type { PlayerRealmStage, TechniqueGrade } from './cultivation-types';
import type { NumericScalarStatKey } from './numeric';

/** 怪物战斗模型：next 侧统一按 value_stats 运行时数值口径结算。 */
export type MonsterCombatModel = 'value_stats';

/** 怪物指数成长的数值键，随等级按指数曲线放大。 */
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
/** 怪物线性成长的数值键，随等级按线性曲线放大。 */
const MONSTER_LINEAR_NUMERIC_KEYS = [
  'critDamage',
  'maxQiOutputPerTick',
  'qiRegenRate',
  'hpRegenRate',
] as const satisfies readonly NumericScalarStatKey[];
/** 各线性数值键对应的等级成长倍率。 */
const MONSTER_LINEAR_NUMERIC_GROWTH_RATES: Record<typeof MONSTER_LINEAR_NUMERIC_KEYS[number], number> = {
  critDamage: 0.1,
  maxQiOutputPerTick: 0.1,
  qiRegenRate: 0.02,
  hpRegenRate: 0.02,
};

/** 怪物公式输入：由属性、装备、等级和百分比修饰组合而成。 */
export interface MonsterFormulaInput {
/**
 * attrs：MonsterFormulaInput 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * equipment：MonsterFormulaInput 内部字段。
 */

  equipment?: Partial<EquipmentSlots>;  
  /**
 * level：MonsterFormulaInput 内部字段。
 */

  level?: number;  
  /**
 * statPercents：MonsterFormulaInput 内部字段。
 */

  statPercents?: NumericStatPercentages;  
  /**
 * grade：MonsterFormulaInput 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * tier：MonsterFormulaInput 内部字段。
 */

  tier?: MonsterTier;
}

/** 怪物模板掉落项：保留物品基础信息和掉率。 */
export interface MonsterTemplateDropRecord {
/**
 * itemId：MonsterTemplateDropRecord 内部字段。
 */

  itemId: string;  
  /**
 * name：MonsterTemplateDropRecord 内部字段。
 */

  name: string;  
  /**
 * type：MonsterTemplateDropRecord 内部字段。
 */

  type: ItemType;  
  /**
 * count：MonsterTemplateDropRecord 内部字段。
 */

  count: number;  
  /**
 * chance：MonsterTemplateDropRecord 内部字段。
 */

  chance?: number;
}

/** 怪物模板的装备引用表，按槽位指向物品 ID。 */
export type MonsterTemplateEquipmentRefs = Partial<Record<EquipSlot, string>>;

/** 怪物模板的原始配置记录，保存编辑器里可直接写入的字段。 */
export interface MonsterTemplateConfiguredRecord {
/**
 * id：MonsterTemplateConfiguredRecord 内部字段。
 */

  id: string;  
  /**
 * name：MonsterTemplateConfiguredRecord 内部字段。
 */

  name: string;  
  /**
 * char：MonsterTemplateConfiguredRecord 内部字段。
 */

  char: string;  
  /**
 * color：MonsterTemplateConfiguredRecord 内部字段。
 */

  color: string;  
  /**
 * grade：MonsterTemplateConfiguredRecord 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * tier：MonsterTemplateConfiguredRecord 内部字段。
 */

  tier?: MonsterTier;  
  /**
 * valueStats：MonsterTemplateConfiguredRecord 内部字段。
 */

  valueStats?: PartialNumericStats;  
  /**
 * attrs：MonsterTemplateConfiguredRecord 内部字段。
 */

  attrs?: Partial<Attributes>;  
  /**
 * statPercents：MonsterTemplateConfiguredRecord 内部字段。
 */

  statPercents?: NumericStatPercentages;  
  /**
 * initialBuffs：MonsterTemplateConfiguredRecord 内部字段。
 */

  initialBuffs?: MonsterInitialBuffDef[];  
  /**
 * equipment：MonsterTemplateConfiguredRecord 内部字段。
 */

  equipment?: MonsterTemplateEquipmentRefs;  
  /**
 * skills：MonsterTemplateConfiguredRecord 内部字段。
 */

  skills?: string[];  
  /**
 * count：MonsterTemplateConfiguredRecord 内部字段。
 */

  count?: number;  
  /**
 * radius：MonsterTemplateConfiguredRecord 内部字段。
 */

  radius?: number;  
  /**
 * maxAlive：MonsterTemplateConfiguredRecord 内部字段。
 */

  maxAlive?: number;  
  /**
 * aggroRange：MonsterTemplateConfiguredRecord 内部字段。
 */

  aggroRange?: number;  
  /**
 * viewRange：MonsterTemplateConfiguredRecord 内部字段。
 */

  viewRange?: number;  
  /**
 * aggroMode：MonsterTemplateConfiguredRecord 内部字段。
 */

  aggroMode?: MonsterAggroMode;  
  /**
 * respawnSec：MonsterTemplateConfiguredRecord 内部字段。
 */

  respawnSec?: number;  
  /**
 * respawnTicks：MonsterTemplateConfiguredRecord 内部字段。
 */

  respawnTicks?: number;  
  /**
 * level：MonsterTemplateConfiguredRecord 内部字段。
 */

  level?: number;  
  /**
 * expMultiplier：MonsterTemplateConfiguredRecord 内部字段。
 */

  expMultiplier?: number;  
  /**
 * drops：MonsterTemplateConfiguredRecord 内部字段。
 */

  drops?: MonsterTemplateDropRecord[];
}

/** 编辑器里的怪物关联物品选项，供模板装备和掉落引用。 */
export interface MonsterTemplateEditorItem {
/**
 * itemId：MonsterTemplateEditorItem 内部字段。
 */

  itemId: string;  
  /**
 * name：MonsterTemplateEditorItem 内部字段。
 */

  name: string;  
  /**
 * type：MonsterTemplateEditorItem 内部字段。
 */

  type: ItemType;  
  /**
 * desc：MonsterTemplateEditorItem 内部字段。
 */

  desc: string;  
  /**
 * count：MonsterTemplateEditorItem 内部字段。
 */

  count?: number;  
  /**
 * groundLabel：MonsterTemplateEditorItem 内部字段。
 */

  groundLabel?: string;  
  /**
 * grade：MonsterTemplateEditorItem 内部字段。
 */

  grade?: TechniqueGrade;  
  /**
 * level：MonsterTemplateEditorItem 内部字段。
 */

  level?: number;  
  /**
 * equipSlot：MonsterTemplateEditorItem 内部字段。
 */

  equipSlot?: EquipSlot;  
  /**
 * equipAttrs：MonsterTemplateEditorItem 内部字段。
 */

  equipAttrs?: Partial<Attributes>;  
  /**
 * equipStats：MonsterTemplateEditorItem 内部字段。
 */

  equipStats?: PartialNumericStats;  
  /**
 * equipValueStats：MonsterTemplateEditorItem 内部字段。
 */

  equipValueStats?: PartialNumericStats;  
  /**
 * effects：MonsterTemplateEditorItem 内部字段。
 */

  effects?: ItemStack['effects'];  
  /**
 * tags：MonsterTemplateEditorItem 内部字段。
 */

  tags?: string[];  
  /**
 * mapUnlockId：MonsterTemplateEditorItem 内部字段。
 */

  mapUnlockId?: string;  
  /**
 * mapUnlockIds：MonsterTemplateEditorItem 内部字段。
 */

  mapUnlockIds?: string[];  
  /**
 * tileAuraGainAmount：MonsterTemplateEditorItem 内部字段。
 */

  tileAuraGainAmount?: number;  
  /**
 * allowBatchUse：MonsterTemplateEditorItem 内部字段。
 */

  allowBatchUse?: boolean;
}

/** 怪物模板来源口径，用来区分 value_stats 和属性驱动。 */
export type MonsterTemplateSourceMode = 'value_stats' | 'attributes';

/** 解析后的怪物模板记录，已经补齐默认值并计算出运行时数值。 */
export interface MonsterTemplateResolvedRecord extends MonsterTemplateConfiguredRecord {
/**
 * grade：MonsterTemplateResolvedRecord 内部字段。
 */

  grade: TechniqueGrade;  
  /**
 * tier：MonsterTemplateResolvedRecord 内部字段。
 */

  tier: MonsterTier;  
  /**
 * valueStats：MonsterTemplateResolvedRecord 内部字段。
 */

  valueStats?: PartialNumericStats;  
  /**
 * attrs：MonsterTemplateResolvedRecord 内部字段。
 */

  attrs?: Attributes;  
  /**
 * statPercents：MonsterTemplateResolvedRecord 内部字段。
 */

  statPercents?: NumericStatPercentages;  
  /**
 * initialBuffs：MonsterTemplateResolvedRecord 内部字段。
 */

  initialBuffs?: MonsterInitialBuffDef[];  
  /**
 * equipment：MonsterTemplateResolvedRecord 内部字段。
 */

  equipment: MonsterTemplateEquipmentRefs;  
  /**
 * skills：MonsterTemplateResolvedRecord 内部字段。
 */

  skills: string[];  
  /**
 * computedStats：MonsterTemplateResolvedRecord 内部字段。
 */

  computedStats: NumericStats;  
  /**
 * resolvedAttrs：MonsterTemplateResolvedRecord 内部字段。
 */

  resolvedAttrs: Attributes;  
  /**
 * resolvedStatPercents：MonsterTemplateResolvedRecord 内部字段。
 */

  resolvedStatPercents?: NumericStatPercentages;  
  /**
 * combatModel：MonsterTemplateResolvedRecord 内部字段。
 */

  combatModel: MonsterCombatModel;  
  /**
 * sourceMode：MonsterTemplateResolvedRecord 内部字段。
 */

  sourceMode: MonsterTemplateSourceMode;  
  /**
 * hp：MonsterTemplateResolvedRecord 内部字段。
 */

  hp: number;  
  /**
 * maxHp：MonsterTemplateResolvedRecord 内部字段。
 */

  maxHp: number;  
  /**
 * attack：MonsterTemplateResolvedRecord 内部字段。
 */

  attack: number;  
  /**
 * count：MonsterTemplateResolvedRecord 内部字段。
 */

  count: number;  
  /**
 * radius：MonsterTemplateResolvedRecord 内部字段。
 */

  radius: number;  
  /**
 * maxAlive：MonsterTemplateResolvedRecord 内部字段。
 */

  maxAlive: number;  
  /**
 * aggroRange：MonsterTemplateResolvedRecord 内部字段。
 */

  aggroRange: number;  
  /**
 * viewRange：MonsterTemplateResolvedRecord 内部字段。
 */

  viewRange: number;  
  /**
 * aggroMode：MonsterTemplateResolvedRecord 内部字段。
 */

  aggroMode: MonsterAggroMode;  
  /**
 * respawnSec：MonsterTemplateResolvedRecord 内部字段。
 */

  respawnSec: number;  
  /**
 * respawnTicks：MonsterTemplateResolvedRecord 内部字段。
 */

  respawnTicks?: number;  
  /**
 * level：MonsterTemplateResolvedRecord 内部字段。
 */

  level?: number;  
  /**
 * expMultiplier：MonsterTemplateResolvedRecord 内部字段。
 */

  expMultiplier: number;  
  /**
 * drops：MonsterTemplateResolvedRecord 内部字段。
 */

  drops: MonsterTemplateDropRecord[];
}

/** 百分比属性累加器，只保留会影响怪物基础数值的四项。 */
type PercentBonusAccumulator = Pick<NumericStats, 'maxHp' | 'maxQi' | 'physAtk' | 'spellAtk'>;
/** 次级属性换算系数。 */
const MONSTER_SECONDARY_ATTR_RATIO = 0.2;
/** 怪物默认生命回复速度。 */
const MONSTER_BASE_HP_REGEN_RATE = 5;

/** 将怪物等级收敛为至少 1 的整数。 */
function normalizeMonsterLevel(level?: number): number {
  return Math.max(1, Math.floor(level ?? 1));
}

/** 将配置值保留两位小数，避免模板换算时产生抖动。 */
function roundConfigValue(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 根据怪物等级反推其基础境界模板。 */
function resolveMonsterBaseRealmStage(level?: number): PlayerRealmStage {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalizedLevel = normalizeMonsterLevel(level);
  for (const stage of [...PLAYER_REALM_ORDER].reverse()) {
    const range = PLAYER_REALM_STAGE_LEVEL_RANGES[stage];
    if (normalizedLevel >= range.levelFrom) {
      return stage;
    }
  }
  return DEFAULT_PLAYER_REALM_STAGE;
}

/** 判断值是否为合法功法品阶。 */
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

/** 判断值是否为合法怪物仇恨模式。 */
function isMonsterAggroMode(value: unknown): value is MonsterAggroMode {
  return value === 'always' || value === 'retaliate' || value === 'day_only' || value === 'night_only';
}

/** 清洗怪物模板里的数值属性配置。 */
function normalizeMonsterConfigStats(stats: unknown): PartialNumericStats | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 创建一套六维属性，默认值统一。 */
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

/** 将怪物阶位收敛到合法枚举。 */
export function normalizeMonsterTier(tier: unknown, fallback: MonsterTier = 'mortal_blood'): MonsterTier {
  return tier === 'mortal_blood' || tier === 'variant' || tier === 'demon_king' ? tier : fallback;
}

/** 根据名称关键词推断怪物阶位。 */
export function inferMonsterTierFromName(name: string | undefined): MonsterTier {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (/妖王|荒王|兽王|王$/.test(normalizedName)) {
    return 'demon_king';
  }
  if (/精英|异种/.test(normalizedName)) {
    return 'variant';
  }
  return 'mortal_blood';
}

/** 读取指定阶位对应的默认经验倍率。 */
export function getDefaultMonsterExpMultiplier(tier: MonsterTier | undefined): number {
  return MONSTER_TIER_EXP_MULTIPLIERS[normalizeMonsterTier(tier)] ?? 1;
}

/** 解析怪物经验倍率，缺省时回落到阶位默认值。 */
export function resolveMonsterExpMultiplier(expMultiplier: unknown, tier: MonsterTier | undefined): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (Number.isFinite(expMultiplier)) {
    return Math.max(0, Number(expMultiplier));
  }
  return getDefaultMonsterExpMultiplier(tier);
}

/** 判断怪物阶位是否需要显式落库。 */
export function shouldPersistMonsterTier(tier: MonsterTier | undefined, name: string | undefined): boolean {
  return normalizeMonsterTier(tier) !== inferMonsterTierFromName(name);
}

/** 判断怪物经验倍率是否需要显式落库。 */
export function shouldPersistMonsterExpMultiplier(expMultiplier: unknown, tier: MonsterTier | undefined): boolean {
  return resolveMonsterExpMultiplier(expMultiplier, tier) !== getDefaultMonsterExpMultiplier(tier);
}

/** 计算击杀经验按双方等级差修正后的倍率。 */
export function getMonsterKillExpLevelAdjustment(
  playerRealmLv: number,
  monsterLevel: number,
  tier: MonsterTier | undefined,
): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 将怪物属性收敛为非负整数，并补回默认值。 */
export function normalizeMonsterAttrs(
  attrs: Partial<Attributes> | undefined,
  fallback?: Attributes,
): Attributes {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const result = fallback ? { ...fallback } : createMonsterAttributes();
  for (const key of ATTR_KEYS) {
    const value = attrs?.[key];
    result[key] = Number.isFinite(value) ? Math.max(0, Number(value)) : (fallback?.[key] ?? 0);
  }
  return result;
}

/** 将怪物数值百分比修饰收敛为合法数值。 */
export function normalizeMonsterStatPercents(statPercents: NumericStatPercentages | undefined): NumericStatPercentages | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 把属性换算成只作用于生命、灵力和攻击的百分比加成。 */
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

/** 把属性按权重折算进怪物基础数值。 */
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

/** 将百分比加成应用到四项核心基础数值。 */
function applyPercentBonuses(target: NumericStats, bonuses: PercentBonusAccumulator): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (bonuses.maxHp !== 0) target.maxHp *= 1 + bonuses.maxHp / 100;
  if (bonuses.maxQi !== 0) target.maxQi *= 1 + bonuses.maxQi / 100;
  if (bonuses.physAtk !== 0) target.physAtk *= 1 + bonuses.physAtk / 100;
  if (bonuses.spellAtk !== 0) target.spellAtk *= 1 + bonuses.spellAtk / 100;
}

/** 把装备属性合并进怪物基础属性。 */
function mergeMonsterEquipmentAttrs(
  attrs: Attributes,
  equipment?: Partial<EquipmentSlots>,
): Attributes {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 把装备数值属性合并进怪物基础数值。 */
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

/** 根据属性、装备和等级计算怪物的基础数值模板。 */
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

/** 按等级曲线放大怪物数值。 */
export function applyMonsterLevelScaling(stats: NumericStats, level?: number): NumericStats {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 按百分比修饰进一步调整怪物数值。 */
export function applyNumericStatPercentages(stats: NumericStats, percents?: NumericStatPercentages): NumericStats {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 从属性驱动口径计算怪物最终数值。 */
export function resolveMonsterNumericStatsFromAttributes(input: MonsterFormulaInput): NumericStats {
  const base = computeMonsterBaseNumericStatsFromAttrs(input.attrs, input.equipment, input.level);
  const scaled = applyMonsterLevelScaling(base, input.level);
  applyNumericStatPercentages(scaled, normalizeMonsterStatPercents(input.statPercents));
  applyNumericStatPercentages(scaled, MONSTER_GRADE_STAT_PERCENTS[input.grade ?? 'mortal']);
  applyNumericStatPercentages(scaled, MONSTER_TIER_STAT_PERCENTS[normalizeMonsterTier(input.tier)]);
  applyNumericStatPercentages(scaled, MONSTER_GLOBAL_STAT_PERCENTS);
  return scaled;
}

/** 反推怪物数值的配置百分比，便于编辑器回填。 */
export function createMonsterAutoStatPercents(
  targetStats: NumericStats,
  attrs: Partial<Attributes> | undefined,
  level?: number,
  equipment?: Partial<EquipmentSlots>,
): NumericStatPercentages {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 根据怪物数值反推一组近似属性。 */
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

/** 将 value_stats 口径的配置值转换成运行时实际数值。 */
export function compileMonsterValueStats(valueStats?: PartialNumericStats): NumericStats {
  const actual = compileValueStatsToActualStats(valueStats);
  const stats = createNumericStats();
  addPartialNumericStats(stats, actual);
  return stats;
}

/** 从 value_stats 口径计算怪物最终数值。 */
export function resolveMonsterNumericStatsFromValueStats(valueStats?: PartialNumericStats, level?: number): NumericStats {
  return applyMonsterLevelScaling(compileMonsterValueStats(valueStats), level);
}

/** 按怪物数值和等级估算击杀掉落灵石。 */
export function estimateMonsterSpiritFromStats(stats: NumericStats, level?: number): number {
  const normalizedLevel = normalizeMonsterLevel(level);
  return Math.max(6, Math.round(normalizedLevel * 12 + stats.physAtk * 0.8 + stats.maxHp * 0.18));
}

/** 清洗怪物模板装备引用表。 */
export function normalizeMonsterTemplateEquipmentRefs(rawEquipment: unknown): MonsterTemplateEquipmentRefs {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 清洗怪物模板技能 ID 列表并去重。 */
export function normalizeMonsterTemplateSkillIds(rawSkills: unknown): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 清洗怪物模板掉落列表，过滤非法条目。 */
export function normalizeMonsterTemplateDrops(rawDrops: unknown): MonsterTemplateDropRecord[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 从物品查找表中解析模板引用。 */
function resolveMonsterTemplateItem(
  itemId: string,
  itemLookup?: ReadonlyMap<string, MonsterTemplateEditorItem> | Record<string, MonsterTemplateEditorItem>,
): MonsterTemplateEditorItem | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!itemLookup) {
    return undefined;
  }
  const mapLookup = itemLookup as ReadonlyMap<string, MonsterTemplateEditorItem>;
  if (typeof mapLookup.get === 'function') {
    return mapLookup.get(itemId);
  }
  return (itemLookup as Record<string, MonsterTemplateEditorItem>)[itemId];
}

/** 由编辑器物品定义构建可装备的实例对象。 */
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
    mapUnlockIds: item.mapUnlockIds ? [...item.mapUnlockIds] : undefined,
    tileAuraGainAmount: item.tileAuraGainAmount,
    allowBatchUse: item.allowBatchUse,
  };
}

/** 把装备引用表解析成完整装备槽位数据。 */
function resolveMonsterTemplateEquipmentSlots(
  equipmentRefs: MonsterTemplateEquipmentRefs,
  itemLookup?: ReadonlyMap<string, MonsterTemplateEditorItem> | Record<string, MonsterTemplateEditorItem>,
): EquipmentSlots {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

/** 解析怪物模板原始记录，补齐默认值并生成运行时字段。 */
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
  const resolvedStatPercents = normalizeMonsterStatPercents(statPercentsInput);
  const equipmentRefs = normalizeMonsterTemplateEquipmentRefs(monster.equipment);
  const equipment = resolveMonsterTemplateEquipmentSlots(equipmentRefs, itemLookup);
  const sourceMode: MonsterTemplateSourceMode = attrsInput ? 'attributes' : 'value_stats';
  const resolvedAttrs = attrs ?? createMonsterAttributes();
  const computedStats = sourceMode === 'attributes'
    ? resolveMonsterNumericStatsFromAttributes({
        attrs: resolvedAttrs,
        equipment,
        level,
        statPercents: resolvedStatPercents,
        grade,
        tier,
      })
    : applyNumericStatPercentages(resolveMonsterNumericStatsFromValueStats(valueStats, level), resolvedStatPercents);
  const count = Number.isFinite(monster.count)
    ? Math.max(1, Math.floor(Number(monster.count)))
    : (Number.isFinite(monster.maxAlive) ? Math.max(1, Math.floor(Number(monster.maxAlive))) : 1);
  const aggroRange = Number.isFinite(monster.aggroRange) ? Math.max(0, Math.floor(Number(monster.aggroRange))) : 6;

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
    initialBuffs: Array.isArray(monster.initialBuffs) ? monster.initialBuffs : undefined,
    equipment: equipmentRefs,
    skills: normalizeMonsterTemplateSkillIds(monster.skills),
    computedStats,
    resolvedAttrs,
    resolvedStatPercents,
    combatModel: 'value_stats',
    sourceMode,
    hp: Math.max(1, Math.round(computedStats.maxHp || 1)),
    maxHp: Math.max(1, Math.round(computedStats.maxHp || 1)),
    attack: Math.max(1, Math.round(computedStats.physAtk || computedStats.spellAtk || 1)),
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
