import type { NumericStatPercentages, MonsterTier, TechniqueGrade } from '../../types';

/**
 * 妖兽六维、品阶与血脉层次规则常量。
 */

const MONSTER_PERCENT_SCALING_KEYS = [
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
  'critDamage',
  'breakPower',
  'resolvePower',
  'maxQiOutputPerTick',
  'qiRegenRate',
  'hpRegenRate',
  'viewRange',
  'moveSpeed',
] as const satisfies readonly (keyof NumericStatPercentages)[];

/** createUniformPercentProfile：创建Uniform Percent Profile。 */
function createUniformPercentProfile(percent: number): NumericStatPercentages {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const result: NumericStatPercentages = {};
  for (const key of MONSTER_PERCENT_SCALING_KEYS) {
    result[key] = percent;
  }
  return result;
}

/** createGradePercentProfile：创建Grade Percent Profile。 */
function createGradePercentProfile(rank: number): NumericStatPercentages {
  return createUniformPercentProfile(100 + rank * 10);
}

/** createTierPercentProfile：创建Tier Percent Profile。 */
function createTierPercentProfile(allPercent: number, hpPercent: number): NumericStatPercentages {
  const result = createUniformPercentProfile(allPercent);
  result.maxHp = hpPercent;
  return result;
}

/** createGlobalMonsterPercentProfile：创建Global妖兽Percent Profile。 */
function createGlobalMonsterPercentProfile(): NumericStatPercentages {
  const result = createUniformPercentProfile(100);
  result.hpRegenRate = 10;
  result.dodge = 10;
  result.resolvePower = 10;
  return result;
}

/** 妖兽血脉层次顺序。 */
export const MONSTER_TIER_ORDER: MonsterTier[] = [
  'mortal_blood',
  'variant',
  'demon_king',
];

/** 妖兽品阶对战斗数值的统一倍率。 */
export const MONSTER_GRADE_STAT_PERCENTS: Record<TechniqueGrade, NumericStatPercentages> = {
  mortal: createGradePercentProfile(0),
  yellow: createGradePercentProfile(1),
  mystic: createGradePercentProfile(2),
  earth: createGradePercentProfile(3),
  heaven: createGradePercentProfile(4),
  spirit: createGradePercentProfile(5),
  saint: createGradePercentProfile(6),
  emperor: createGradePercentProfile(7),
};

/** 所有妖兽共享的全局数值调节层，用于压制优先属性带来的统一超模收益。 */
export const MONSTER_GLOBAL_STAT_PERCENTS: NumericStatPercentages = createGlobalMonsterPercentProfile();

/** 妖兽血脉层次倍率。 */
export const MONSTER_TIER_STAT_PERCENTS: Record<MonsterTier, NumericStatPercentages> = {
  mortal_blood: createUniformPercentProfile(100),
  variant: createTierPercentProfile(120, 360),
  demon_king: createTierPercentProfile(140, 1400),
};

/** 妖兽血脉层次对应的默认经验倍率。 */
export const MONSTER_TIER_EXP_MULTIPLIERS: Record<MonsterTier, number> = {
  mortal_blood: 1,
  variant: 5,
  demon_king: 100,
};

/** 玩家等级高于怪物时，所有怪物通用的每级经验保留倍率。 */
export const MONSTER_OVERLEVEL_EXP_MULTIPLIER = 0.5;

/** 玩家等级低于怪物时，各血脉层次每级增加的击杀经验比例。 */
export const MONSTER_TIER_UNDERLEVEL_EXP_BONUS_RATES: Record<MonsterTier, number> = {
  mortal_blood: 0.1,
  variant: 0.25,
  demon_king: 0.4,
};

/** 击杀经验的等级差修正最多只按 10 级计算，避免极端越级导致收益爆炸。 */
export const MONSTER_KILL_EXP_LEVEL_DELTA_CAP = 10;





