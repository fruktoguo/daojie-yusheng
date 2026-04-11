/**
 * 数值属性系统：战斗数值结构定义、五行元素属性组、RatioValue 计算、灵力消耗公式。
 */
import type { Attributes } from './types';
import { PlayerRealmStage } from './types';
import {
  DEFAULT_RATIO_DIVISOR,
  ELEMENT_KEYS,
  NUMERIC_STAT_MULTIPLIER_FLOORS,
  NUMERIC_SCALAR_STAT_KEYS,
  NUMERIC_SCALAR_STAT_VALUE_TYPES,
} from './constants/gameplay/attributes';

export {
  DEFAULT_RATIO_DIVISOR,
  ELEMENT_KEYS,
  NUMERIC_STAT_MULTIPLIER_FLOORS,
  NUMERIC_SCALAR_STAT_KEYS,
  NUMERIC_SCALAR_STAT_VALUE_TYPES,
} from './constants/gameplay/attributes';

/** 五行元素键类型 */
export type ElementKey = typeof ELEMENT_KEYS[number];

/** 数值属性的值类型分类 */
export type NumericValueType = 'flat' | 'ratio_value' | 'rate_bp' | 'throughput';

/** 五行元素属性组 */
export interface ElementStatGroup {
  metal: number;
  wood: number;
  water: number;
  fire: number;
  earth: number;
}

/** 五行元素部分属性组 */
export type PartialElementStatGroup = Partial<Record<ElementKey, number>>;

/** 标量数值属性键类型 */
export type NumericScalarStatKey = typeof NUMERIC_SCALAR_STAT_KEYS[number];

/** 完整数值属性集（含五行元素加成/减免） */
export interface NumericStats {
  maxHp: number;
  maxQi: number;
  physAtk: number;
  spellAtk: number;
  physDef: number;
  spellDef: number;
  hit: number;
  dodge: number;
  crit: number;
  antiCrit: number;
  critDamage: number;
  breakPower: number;
  resolvePower: number;
  maxQiOutputPerTick: number;
  qiRegenRate: number;
  hpRegenRate: number;
  cooldownSpeed: number;
  auraCostReduce: number;
  auraPowerRate: number;
  playerExpRate: number;
  techniqueExpRate: number;
  realmExpPerTick: number;
  techniqueExpPerTick: number;
  lootRate: number;
  rareLootRate: number;
  viewRange: number;
  moveSpeed: number;
  extraAggroRate: number;
  extraRange: number;
  extraArea: number;
  elementDamageBonus: ElementStatGroup;
  elementDamageReduce: ElementStatGroup;
}

/** 部分数值属性（用于增量叠加） */
export interface PartialNumericStats extends Partial<Omit<NumericStats, 'elementDamageBonus' | 'elementDamageReduce'>> {
  elementDamageBonus?: PartialElementStatGroup;
  elementDamageReduce?: PartialElementStatGroup;
}

/** 具体属性乘区拆解 */
export interface NumericStatBreakdownEntry {
  realmBaseValue: number;
  bonusBaseValue: number;
  baseValue: number;
  flatBuffValue: number;
  preMultiplierValue: number;
  attrMultiplierPct: number;
  realmMultiplier: number;
  buffMultiplierPct: number;
  pillMultiplierPct: number;
  finalValue: number;
}

/** 具体属性乘区拆解映射 */
export type NumericStatBreakdownMap = Partial<Record<NumericScalarStatKey, NumericStatBreakdownEntry>>;

/** 数值修改器（来源标识 + 属性/数值增量） */
export interface NumericModifier {
  source: string;
  baseAttrs?: Partial<Attributes>;
  stats?: PartialNumericStats;
  label?: string;
  meta?: Record<string, unknown>;
}

/** RatioValue 除数配置（控制闪避/暴击等属性的收益递减曲线） */
export interface NumericRatioDivisors {
  dodge: number;
  crit: number;
  breakPower: number;
  resolvePower: number;
  cooldownSpeed: number;
  moveSpeed: number;
  elementDamageReduce: ElementStatGroup;
}

/** 境界数值模板（基础属性 + RatioValue 除数） */
export interface RealmNumericTemplate {
  stage: PlayerRealmStage;
  stats: NumericStats;
  ratioDivisors: NumericRatioDivisors;
}

/**
 * 将“加减百分比”转换为最终乘区。
 * 正向保持线性增长，负向改为反比衰减，避免任意乘区被直接压到 0。
 * 例如:
 * - +50 => 1.5
 * - -50 => 1 / 1.5 = 0.666...
 * - -100 => 0.5
 */
export function percentModifierToMultiplier(percent: number): number {
  if (!Number.isFinite(percent) || percent === 0) {
    return 1;
  }
  if (percent > 0) {
    return 1 + percent / 100;
  }
  return 1 / (1 + Math.abs(percent) / 100);
}

/** 将万分比加减值转换为最终乘区。100 = 1%，-500 = -5%。 */
export function basisPointModifierToMultiplier(rateBp: number): number {
  if (!Number.isFinite(rateBp) || rateBp === 0) {
    return 1;
  }
  return percentModifierToMultiplier(rateBp / 100);
}

/** 创建全零五行元素属性组 */
export function createElementStatGroup(initialValue = 0): ElementStatGroup {
  return {
    metal: initialValue,
    wood: initialValue,
    water: initialValue,
    fire: initialValue,
    earth: initialValue,
  };
}

/** 深拷贝五行元素属性组 */
export function cloneElementStatGroup(source: ElementStatGroup): ElementStatGroup {
  return {
    metal: source.metal,
    wood: source.wood,
    water: source.water,
    fire: source.fire,
    earth: source.earth,
  };
}

/** 重置五行元素属性组为指定值 */
export function resetElementStatGroup(target: ElementStatGroup, value = 0): ElementStatGroup {
  target.metal = value;
  target.wood = value;
  target.water = value;
  target.fire = value;
  target.earth = value;
  return target;
}

/** 将部分五行属性叠加到目标上 */
export function addPartialElementStatGroup(target: ElementStatGroup, patch?: PartialElementStatGroup): ElementStatGroup {
  if (!patch) return target;
  if (patch.metal !== undefined) target.metal += patch.metal;
  if (patch.wood !== undefined) target.wood += patch.wood;
  if (patch.water !== undefined) target.water += patch.water;
  if (patch.fire !== undefined) target.fire += patch.fire;
  if (patch.earth !== undefined) target.earth += patch.earth;
  return target;
}

/** 创建全零数值属性集 */
export function createNumericStats(): NumericStats {
  return {
    maxHp: 0,
    maxQi: 0,
    physAtk: 0,
    spellAtk: 0,
    physDef: 0,
    spellDef: 0,
    hit: 0,
    dodge: 0,
    crit: 0,
    antiCrit: 0,
    critDamage: 0,
    breakPower: 0,
    resolvePower: 0,
    maxQiOutputPerTick: 0,
    qiRegenRate: 0,
    hpRegenRate: 0,
    cooldownSpeed: 0,
    auraCostReduce: 0,
    auraPowerRate: 0,
    playerExpRate: 0,
    techniqueExpRate: 0,
    realmExpPerTick: 0,
    techniqueExpPerTick: 0,
    lootRate: 0,
    rareLootRate: 0,
    viewRange: 0,
    moveSpeed: 0,
    extraAggroRate: 0,
    extraRange: 0,
    extraArea: 0,
    elementDamageBonus: createElementStatGroup(),
    elementDamageReduce: createElementStatGroup(),
  };
}

/** 深拷贝数值属性集 */
export function cloneNumericStats(source: NumericStats): NumericStats {
  return {
    maxHp: source.maxHp,
    maxQi: source.maxQi,
    physAtk: source.physAtk,
    spellAtk: source.spellAtk,
    physDef: source.physDef,
    spellDef: source.spellDef,
    hit: source.hit,
    dodge: source.dodge,
    crit: source.crit,
    antiCrit: source.antiCrit,
    critDamage: source.critDamage,
    breakPower: source.breakPower,
    resolvePower: source.resolvePower,
    maxQiOutputPerTick: source.maxQiOutputPerTick,
    qiRegenRate: source.qiRegenRate,
    hpRegenRate: source.hpRegenRate,
    cooldownSpeed: source.cooldownSpeed,
    auraCostReduce: source.auraCostReduce,
    auraPowerRate: source.auraPowerRate,
    playerExpRate: source.playerExpRate,
    techniqueExpRate: source.techniqueExpRate,
    realmExpPerTick: source.realmExpPerTick,
    techniqueExpPerTick: source.techniqueExpPerTick,
    lootRate: source.lootRate,
    rareLootRate: source.rareLootRate,
    viewRange: source.viewRange,
    moveSpeed: source.moveSpeed,
    extraAggroRate: source.extraAggroRate,
    extraRange: source.extraRange,
    extraArea: source.extraArea,
    elementDamageBonus: cloneElementStatGroup(source.elementDamageBonus),
    elementDamageReduce: cloneElementStatGroup(source.elementDamageReduce),
  };
}

/** 重置数值属性集为全零 */
export function resetNumericStats(target: NumericStats): NumericStats {
  target.maxHp = 0;
  target.maxQi = 0;
  target.physAtk = 0;
  target.spellAtk = 0;
  target.physDef = 0;
  target.spellDef = 0;
  target.hit = 0;
  target.dodge = 0;
  target.crit = 0;
  target.antiCrit = 0;
  target.critDamage = 0;
  target.breakPower = 0;
  target.resolvePower = 0;
  target.maxQiOutputPerTick = 0;
  target.qiRegenRate = 0;
  target.hpRegenRate = 0;
  target.cooldownSpeed = 0;
  target.auraCostReduce = 0;
  target.auraPowerRate = 0;
  target.playerExpRate = 0;
  target.techniqueExpRate = 0;
  target.realmExpPerTick = 0;
  target.techniqueExpPerTick = 0;
  target.lootRate = 0;
  target.rareLootRate = 0;
  target.viewRange = 0;
  target.moveSpeed = 0;
  target.extraAggroRate = 0;
  target.extraRange = 0;
  target.extraArea = 0;
  resetElementStatGroup(target.elementDamageBonus);
  resetElementStatGroup(target.elementDamageReduce);
  return target;
}

/** 将部分数值属性叠加到目标上 */
export function addPartialNumericStats(target: NumericStats, patch?: PartialNumericStats): NumericStats {
  if (!patch) return target;
  if (patch.maxHp !== undefined) target.maxHp += patch.maxHp;
  if (patch.maxQi !== undefined) target.maxQi += patch.maxQi;
  if (patch.physAtk !== undefined) target.physAtk += patch.physAtk;
  if (patch.spellAtk !== undefined) target.spellAtk += patch.spellAtk;
  if (patch.physDef !== undefined) target.physDef += patch.physDef;
  if (patch.spellDef !== undefined) target.spellDef += patch.spellDef;
  if (patch.hit !== undefined) target.hit += patch.hit;
  if (patch.dodge !== undefined) target.dodge += patch.dodge;
  if (patch.crit !== undefined) target.crit += patch.crit;
  if (patch.antiCrit !== undefined) target.antiCrit += patch.antiCrit;
  if (patch.critDamage !== undefined) target.critDamage += patch.critDamage;
  if (patch.breakPower !== undefined) target.breakPower += patch.breakPower;
  if (patch.resolvePower !== undefined) target.resolvePower += patch.resolvePower;
  if (patch.maxQiOutputPerTick !== undefined) target.maxQiOutputPerTick += patch.maxQiOutputPerTick;
  if (patch.qiRegenRate !== undefined) target.qiRegenRate += patch.qiRegenRate;
  if (patch.hpRegenRate !== undefined) target.hpRegenRate += patch.hpRegenRate;
  if (patch.cooldownSpeed !== undefined) target.cooldownSpeed += patch.cooldownSpeed;
  if (patch.auraCostReduce !== undefined) target.auraCostReduce += patch.auraCostReduce;
  if (patch.auraPowerRate !== undefined) target.auraPowerRate += patch.auraPowerRate;
  if (patch.playerExpRate !== undefined) target.playerExpRate += patch.playerExpRate;
  if (patch.techniqueExpRate !== undefined) target.techniqueExpRate += patch.techniqueExpRate;
  if (patch.realmExpPerTick !== undefined) target.realmExpPerTick += patch.realmExpPerTick;
  if (patch.techniqueExpPerTick !== undefined) target.techniqueExpPerTick += patch.techniqueExpPerTick;
  if (patch.lootRate !== undefined) target.lootRate += patch.lootRate;
  if (patch.rareLootRate !== undefined) target.rareLootRate += patch.rareLootRate;
  if (patch.viewRange !== undefined) target.viewRange += patch.viewRange;
  if (patch.moveSpeed !== undefined) target.moveSpeed += patch.moveSpeed;
  if (patch.extraAggroRate !== undefined) target.extraAggroRate += patch.extraAggroRate;
  if (patch.extraRange !== undefined) target.extraRange += patch.extraRange;
  if (patch.extraArea !== undefined) target.extraArea += patch.extraArea;
  addPartialElementStatGroup(target.elementDamageBonus, patch.elementDamageBonus);
  addPartialElementStatGroup(target.elementDamageReduce, patch.elementDamageReduce);
  return target;
}

/** 合并基础数值与多个增量补丁 */
export function mergeNumericStats(base: NumericStats, patches: readonly PartialNumericStats[]): NumericStats {
  const result = cloneNumericStats(base);
  for (const patch of patches) {
    addPartialNumericStats(result, patch);
  }
  return result;
}

/** 获取单个标量属性用于百分比乘区的参考底座 */
export function getNumericStatMultiplierFloor(key: NumericScalarStatKey): number {
  return NUMERIC_STAT_MULTIPLIER_FLOORS[key];
}

/** 获取元素属性用于百分比乘区的参考底座 */
export function getElementStatMultiplierFloor(group: 'elementDamageBonus' | 'elementDamageReduce', key: ElementKey): number {
  return NUMERIC_STAT_MULTIPLIER_FLOORS[group][key];
}

/** 对一组数值属性应用百分比乘区，允许以参考底座撬动零基值属性 */
export function applyNumericStatsPercentMultiplier(target: NumericStats, patch?: PartialNumericStats): NumericStats {
  if (!patch) {
    return target;
  }
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const percent = patch[key];
    if (!percent) {
      continue;
    }
    const floor = getNumericStatMultiplierFloor(key);
    const current = key === 'moveSpeed'
      ? target[key] + floor
      : target[key];
    const multiplier = percentModifierToMultiplier(percent);
    const nextValue = current > 0
      ? Math.max(0, current * multiplier)
      : floor * multiplier - floor;
    if (key === 'moveSpeed') {
      target[key] = nextValue - floor;
      continue;
    }
    target[key] = nextValue;
  }
  if (patch.elementDamageBonus) {
    for (const key of ELEMENT_KEYS) {
      const percent = patch.elementDamageBonus[key];
      if (!percent) {
        continue;
      }
      const floor = getElementStatMultiplierFloor('elementDamageBonus', key);
      const current = target.elementDamageBonus[key];
      const multiplier = percentModifierToMultiplier(percent);
      target.elementDamageBonus[key] = current > 0
        ? Math.max(0, current * multiplier)
        : floor * multiplier - floor;
    }
  }
  if (patch.elementDamageReduce) {
    for (const key of ELEMENT_KEYS) {
      const percent = patch.elementDamageReduce[key];
      if (!percent) {
        continue;
      }
      const floor = getElementStatMultiplierFloor('elementDamageReduce', key);
      const current = target.elementDamageReduce[key];
      const multiplier = percentModifierToMultiplier(percent);
      target.elementDamageReduce[key] = current > 0
        ? Math.max(0, current * multiplier)
        : Math.max(0, floor * multiplier - floor);
    }
  }
  return target;
}

/** 创建 RatioValue 除数配置 */
export function createNumericRatioDivisors(initialValue = DEFAULT_RATIO_DIVISOR): NumericRatioDivisors {
  return {
    dodge: initialValue,
    crit: initialValue,
    breakPower: initialValue,
    resolvePower: initialValue,
    cooldownSpeed: initialValue,
    moveSpeed: initialValue,
    elementDamageReduce: createElementStatGroup(initialValue),
  };
}

/** 深拷贝 RatioValue 除数配置 */
export function cloneNumericRatioDivisors(source: NumericRatioDivisors): NumericRatioDivisors {
  return {
    dodge: source.dodge,
    crit: source.crit,
    breakPower: source.breakPower,
    resolvePower: source.resolvePower,
    cooldownSpeed: source.cooldownSpeed,
    moveSpeed: source.moveSpeed,
    elementDamageReduce: cloneElementStatGroup(source.elementDamageReduce),
  };
}

/** RatioValue 计算：value / (value + divisor)，实现收益递减 */
export function ratioValue(value: number, divisor: number): number {
  if (value === 0) return 0;
  if (divisor <= 0) return value > 0 ? 1 : -1;
  return value > 0 ? value / (value + divisor) : -value / divisor;
}

/** 带符号的 RatioValue，负值保留方向，用于冷却等允许正负变化的比例属性。 */
export function signedRatioValue(value: number, divisor: number): number {
  if (value === 0) {
    return 0;
  }
  const magnitude = ratioValue(Math.abs(value), divisor);
  return value > 0 ? magnitude : -magnitude;
}

/** 获取指定标量属性的 RatioValue 百分比 */
export function getScalarRatioValue(stats: NumericStats, divisors: NumericRatioDivisors, key: keyof Omit<NumericRatioDivisors, 'elementDamageReduce'>): number {
  return ratioValue(stats[key], divisors[key]);
}

/** 获取指定元素的伤害减免百分比 */
export function getElementDamageReduceRatio(stats: NumericStats, divisors: NumericRatioDivisors, element: ElementKey): number {
  return ratioValue(stats.elementDamageReduce[element], divisors.elementDamageReduce[element]);
}

/** 计算灵力消耗（超出每 tick 输出上限时递增惩罚） */
export function calcQiCostWithOutputLimit(plannedCost: number, maxQiOutputPerTick: number): number {
  if (plannedCost <= 0) return 0;
  if (maxQiOutputPerTick <= 0) return Number.POSITIVE_INFINITY;
  if (plannedCost <= maxQiOutputPerTick) return plannedCost;

  const segment = maxQiOutputPerTick * 0.2;
  if (segment <= 0) return Number.POSITIVE_INFINITY;

  const overflow = plannedCost - maxQiOutputPerTick;
  const fullSegments = Math.floor(overflow / segment);
  const remainder = overflow - fullSegments * segment;
  const fullSegmentCost = segment * fullSegments * (fullSegments + 3) / 2;
  const remainderCost = remainder * (fullSegments + 2);
  return maxQiOutputPerTick + fullSegmentCost + remainderCost;
}
