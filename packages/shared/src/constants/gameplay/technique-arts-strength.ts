/**
 * 本文件负责前后端共享的术法强度归一化常量。
 *
 * 维护时只调整平衡参数，不在这里写运行时状态或单端逻辑。
 */
import type { NumericScalarStatKey } from '../../numeric';

/** AI 术法首版允许参与伤害基底的战斗属性。 */
export const TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS = [
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
] as const satisfies readonly NumericScalarStatKey[];

/** 每 100% 属性基底加成折算的强度成本。 */
export const TECHNIQUE_ARTS_STRENGTH_ATTRIBUTE_BASE_COSTS = {
  maxHp: 12,
  maxQi: 8,
  physAtk: 1,
  spellAtk: 1,
  physDef: 1,
  spellDef: 1,
  hit: 1,
  dodge: 1,
  crit: 1,
  antiCrit: 1,
  breakPower: 1,
  resolvePower: 1,
} as const satisfies Record<typeof TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS[number], number>;

/** AI 术法强度归一化常量。 */
export const TECHNIQUE_ARTS_STRENGTH_CONSTANTS = {
  version: 1,
  skillCount: {
    min: 1,
    max: 1,
  },
  attributeBases: {
    minCount: 1,
    maxCount: 5,
    minScale: 0,
    maxScale: 100,
    decimalPlaces: 2,
  },
  weights: {
    min: -100,
    max: 100,
  },
  structure: {
    baseCostMultiplier: 1,
    cooldownBaseRealmLvMultiplier: 3,
    baseCastRange: 1,
    positiveEfficiencyPerStrength: 0.9,
    negativePenaltyPerStrength: 1.2,
    positiveBudgetPerStrength: 1.2,
    negativeBudgetPerStrength: 0.9,
    costPositivePerBudget: 0.9,
    costNegativePerBudget: 1.2,
    cooldownPositivePerBudget: 0.98,
    cooldownNegativePerBudget: 1.02,
    castRangeBudgetGrowth: 1.2,
    coverageCellsPerBudget: 2,
    minCostMultiplier: 0,
    minCooldownTicks: 1,
    maxCooldownTicks: Number.POSITIVE_INFINITY,
    minRange: 0,
    maxRange: 100,
    minCastRange: 1,
    maxCastRange: 20,
    maxLineCastRange: 12,
    minWidth: 1,
    maxWidth: 9,
    maxBoxSide: 25,
    minRadius: 0,
    maxRadius: 12,
    minStrength: -100,
    maxStrength: 100,
  },
  percentBonuses: {
    techLevelScaleBase: 0.1,
    moveSpeedScalePerStrength: 0.001,
    minStrength: -100,
    maxStrength: 100,
  },
} as const;
