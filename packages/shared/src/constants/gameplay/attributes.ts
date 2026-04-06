import type { ElementStatGroup, NumericStats, PartialNumericStats, NumericValueType } from '../../numeric';
import type { AttrKey } from '../../types';

/**
 * 角色属性与基础数值常量。
 */

/** 六维属性键顺序。 */
export const ATTR_KEYS: AttrKey[] = [
  'constitution',
  'spirit',
  'perception',
  'talent',
  'comprehension',
  'luck',
];

/** 默认六维属性 */
export const DEFAULT_BASE_ATTRS = {
  constitution: 10,
  spirit: 10,
  perception: 10,
  talent: 10,
  comprehension: 0,
  luck: 0,
} as const;

/** 基础最大灵力 */
export const BASE_MAX_QI = 50;

/** 基础物理攻击 */
export const BASE_PHYS_ATK = 10;

/** 基础法术攻击 */
export const BASE_SPELL_ATK = 5;

/** 基础物理防御 */
export const BASE_PHYS_DEF = 0;

/** 基础法术防御 */
export const BASE_SPELL_DEF = 0;

/** 基础命中 */
export const BASE_HIT = 0;

/** 基础灵力输出速率 */
export const BASE_MAX_QI_OUTPUT_PER_TICK = 10;

/** 基础生命自动回复（万分比） */
export const BASE_HP_REGEN_RATE = 50;

/** 基础灵力自动回复（万分比） */
export const BASE_QI_REGEN_RATE = 50;

/** 体质转换最大生命的基准系数 */
export const HP_PER_CONSTITUTION = 10;

/** 基础最大生命 */
export const BASE_MAX_HP = 100;

/** 五行元素键列表 */
export const ELEMENT_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'] as const;

/** 所有标量数值属性键列表 */
export const NUMERIC_SCALAR_STAT_KEYS = [
  'maxHp',
  'maxQi',
  'physAtk',
  'spellAtk',
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
  'auraCostReduce',
  'auraPowerRate',
  'playerExpRate',
  'techniqueExpRate',
  'realmExpPerTick',
  'techniqueExpPerTick',
  'lootRate',
  'rareLootRate',
  'viewRange',
  'moveSpeed',
  'extraAggroRate',
] as const;

/** 六维提供的原始点数加成 */
export const ATTR_TO_NUMERIC_WEIGHTS: Record<AttrKey, PartialNumericStats> = {
  constitution: {},
  spirit: {},
  perception: {},
  talent: {},
  comprehension: {
    auraPowerRate: 100,
    playerExpRate: 100,
    techniqueExpRate: 100,
  },
  luck: {
    lootRate: 100,
  },
};

/** 六维提供的百分比加成，按最终汇总值乘算 */
export const ATTR_TO_PERCENT_NUMERIC_WEIGHTS: Record<AttrKey, PartialNumericStats> = {
  constitution: {
    maxHp: 1,
    physAtk: 1,
    physDef: 1,
  },
  spirit: {
    maxQi: 1,
    spellAtk: 1,
    spellDef: 1,
  },
  perception: {
    hit: 1,
    dodge: 1,
    moveSpeed: 0.5,
  },
  talent: {
    maxHp: 1,
    maxQi: 1,
    resolvePower: 1,
  },
  comprehension: {
    breakPower: 1,
  },
  luck: {
    crit: 1,
    hit: 1,
    dodge: 1,
  },
};

function createScalarMultiplierFloorStats(): Omit<NumericStats, 'elementDamageBonus' | 'elementDamageReduce'> {
  return {
    maxHp: BASE_MAX_HP,
    maxQi: BASE_MAX_QI,
    physAtk: BASE_PHYS_ATK,
    spellAtk: BASE_SPELL_ATK,
    physDef: 100,
    spellDef: 100,
    hit: 100,
    dodge: DEFAULT_RATIO_DIVISOR,
    crit: DEFAULT_RATIO_DIVISOR,
    // critDamage 只表示额外暴伤加成；基础 200% 暴伤不应被百分比乘区当成底座放大。
    critDamage: 0,
    breakPower: DEFAULT_RATIO_DIVISOR,
    resolvePower: DEFAULT_RATIO_DIVISOR,
    maxQiOutputPerTick: BASE_MAX_QI_OUTPUT_PER_TICK,
    qiRegenRate: 10000,
    hpRegenRate: 10000,
    cooldownSpeed: DEFAULT_RATIO_DIVISOR,
    auraCostReduce: 10000,
    auraPowerRate: 10000,
    playerExpRate: 10000,
    techniqueExpRate: 10000,
    realmExpPerTick: 1,
    techniqueExpPerTick: TECHNIQUE_EXP_REFERENCE_PER_TICK,
    lootRate: 10000,
    rareLootRate: 10000,
    viewRange: VIEW_RANGE_REFERENCE,
    moveSpeed: DEFAULT_RATIO_DIVISOR,
    extraAggroRate: 10000,
  };
}

const TECHNIQUE_EXP_REFERENCE_PER_TICK = 5;
const VIEW_RANGE_REFERENCE = 8;

const ELEMENT_MULTIPLIER_FLOOR: ElementStatGroup = {
  metal: 100,
  wood: 100,
  water: 100,
  fire: 100,
  earth: 100,
};

/** 各标量属性的值类型分类映射 */
export const NUMERIC_SCALAR_STAT_VALUE_TYPES = {
  maxHp: 'flat',
  maxQi: 'flat',
  physAtk: 'flat',
  spellAtk: 'flat',
  physDef: 'flat',
  spellDef: 'flat',
  hit: 'flat',
  dodge: 'ratio_value',
  crit: 'ratio_value',
  critDamage: 'rate_bp',
  breakPower: 'ratio_value',
  resolvePower: 'ratio_value',
  maxQiOutputPerTick: 'throughput',
  qiRegenRate: 'rate_bp',
  hpRegenRate: 'rate_bp',
  cooldownSpeed: 'ratio_value',
  auraCostReduce: 'rate_bp',
  auraPowerRate: 'rate_bp',
  playerExpRate: 'rate_bp',
  techniqueExpRate: 'rate_bp',
  realmExpPerTick: 'throughput',
  techniqueExpPerTick: 'throughput',
  lootRate: 'rate_bp',
  rareLootRate: 'rate_bp',
  viewRange: 'flat',
  moveSpeed: 'flat',
  extraAggroRate: 'flat',
} satisfies Record<typeof NUMERIC_SCALAR_STAT_KEYS[number], NumericValueType>;

/** 默认 RatioValue 除数 */
export const DEFAULT_RATIO_DIVISOR = 100;

/** 百分比乘区在零基值附近使用的参考底座，避免 0 值属性完全吃不到乘区。 */
export const NUMERIC_STAT_MULTIPLIER_FLOORS: NumericStats = {
  ...createScalarMultiplierFloorStats(),
  elementDamageBonus: { ...ELEMENT_MULTIPLIER_FLOOR },
  elementDamageReduce: { ...ELEMENT_MULTIPLIER_FLOOR },
};
