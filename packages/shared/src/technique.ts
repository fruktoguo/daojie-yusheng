/**
 * 功法系统计算：层级经验、境界推导、属性成长曲线、品阶软衰减。
 */
import type {
  Attributes,
} from './attribute-types';
import type { BodyTrainingState, TechniqueGrade, TechniqueLayerDef, TechniqueRealm, TechniqueState } from './cultivation-types';
import type { SkillDef } from './skill-types';
import { TechniqueRealm as TechniqueRealmEnum } from './cultivation-types';
import {
  BODY_TRAINING_ATTR_KEYS,
  BODY_TRAINING_EXP_BASE,
  BODY_TRAINING_EXP_GROWTH_RATE,
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_GRADE_ATTR_DECAY_K,
  TECHNIQUE_GRADE_ATTR_DECAY_SPANS,
  TECHNIQUE_GRADE_ATTR_FREE_LIMITS,
  TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP,
  TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA,
  TECHNIQUE_GRADE_QI_COST_MULTIPLIERS,
  TECHNIQUE_GRADE_ORDER,
} from './constants/gameplay/technique';

/** 创建全零六维属性对象 */
export function createZeroAttributes(): Attributes {
  return {
    constitution: 0,
    spirit: 0,
    perception: 0,
    talent: 0,
    comprehension: 0,
    luck: 0,
  };
}

/** normalizeLayers：规范化Layers。 */
function normalizeLayers(layers?: TechniqueLayerDef[]): TechniqueLayerDef[] {
  if (!layers || layers.length === 0) return [];
  return [...layers].sort((left, right) => left.level - right.level);
}

/** 获取功法最大层数 */
export function getTechniqueMaxLevel(layers?: TechniqueLayerDef[], currentLevel = 1): number {
  const normalized = normalizeLayers(layers);
  if (normalized.length > 0) {
    return normalized[normalized.length - 1].level;
  }
  return Math.max(1, currentLevel);
}

/** 获取指定层的配置定义 */
export function getTechniqueLayerDef(level: number, layers?: TechniqueLayerDef[]): TechniqueLayerDef | undefined {
  return normalizeLayers(layers).find((entry) => entry.level === level);
}

/** 获取当前层升级所需经验 */
export function getTechniqueExpToNext(level: number, layers?: TechniqueLayerDef[]): number {
  return Math.max(0, getTechniqueLayerDef(level, layers)?.expToNext ?? 0);
}

/** 解析技能解锁层数（优先 unlockLevel，其次 unlockRealm+1） */
export function resolveSkillUnlockLevel(skill: Pick<SkillDef, 'unlockLevel' | 'unlockRealm'>): number {
  if (typeof skill.unlockLevel === 'number' && skill.unlockLevel > 0) {
    return skill.unlockLevel;
  }
  if (typeof skill.unlockRealm === 'number') {
    return skill.unlockRealm + 1;
  }
  return 1;
}

/** 获取功法品阶对应的灵力消耗倍率 */
export function getTechniqueGradeQiCostMultiplier(grade: TechniqueGrade | undefined): number {
  return grade ? TECHNIQUE_GRADE_QI_COST_MULTIPLIERS[grade] ?? 1 : 1;
}

/** 根据当前层数推导功法境界（入门/小成/大成/圆满） */
export function deriveTechniqueRealm(level: number, layers?: TechniqueLayerDef[]): TechniqueRealm {
  const maxLevel = Math.max(1, getTechniqueMaxLevel(layers, level));
  if (level >= maxLevel) return TechniqueRealmEnum.Perfection;
  const progress = maxLevel <= 1 ? 1 : level / maxLevel;
  if (progress >= 0.66) return TechniqueRealmEnum.Major;
  if (progress >= 0.33) return TechniqueRealmEnum.Minor;
  return TechniqueRealmEnum.Entry;
}

/** 解析技能所属的功法境界（优先技能显式 unlockRealm，其次按解锁层数推导） */
export function resolveSkillTechniqueRealm(skill: Pick<SkillDef, 'unlockLevel' | 'unlockRealm'>, layers?: TechniqueLayerDef[]): TechniqueRealm {
  if (typeof skill.unlockRealm === 'number') {
    return skill.unlockRealm;
  }
  return deriveTechniqueRealm(resolveSkillUnlockLevel(skill), layers);
}

/** 按技能倍率、功法品阶与功法境界计算真实灵力消耗 */
export function calculateTechniqueSkillQiCost(
  costMultiplier: number,
  grade: TechniqueGrade | undefined,
  realmLv: number | undefined,
): number {
  const normalizedMultiplier = Number.isFinite(costMultiplier) ? Math.max(0, costMultiplier) : 0;
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.floor(realmLv ?? 1)) : 1;
  return Math.max(
    0,
    Math.round(
      normalizedMultiplier
      * getTechniqueGradeQiCostMultiplier(grade)
      * normalizedRealmLv,
    ),
  );
}

/** getTechniqueExpLevelAdjustment：读取Technique Exp等级Adjustment。 */
export function getTechniqueExpLevelAdjustment(
  playerRealmLv: number | undefined,
  techniqueRealmLv: number | undefined,
): number {
  const normalizedPlayerLevel = Number.isFinite(playerRealmLv) ? Math.max(1, Math.floor(Number(playerRealmLv))) : 1;
  const normalizedTechniqueLevel = Number.isFinite(techniqueRealmLv) ? Math.max(1, Math.floor(Number(techniqueRealmLv))) : 1;
  const stepMultiplier = 1 + TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP;
  const penaltyMultiplier = Math.max(0, 1 - TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP);
  if (normalizedPlayerLevel < normalizedTechniqueLevel) {
    return penaltyMultiplier ** (normalizedTechniqueLevel - normalizedPlayerLevel);
  }
  if (normalizedPlayerLevel > normalizedTechniqueLevel) {
    return stepMultiplier ** (normalizedPlayerLevel - normalizedTechniqueLevel);
  }
  return 1;
}

/** shouldWarnTechniqueLearningDifficulty：判断是否警告Technique Learning Difficulty。 */
export function shouldWarnTechniqueLearningDifficulty(
  playerRealmLv: number | undefined,
  techniqueRealmLv: number | undefined,
): boolean {
  const normalizedPlayerLevel = Number.isFinite(playerRealmLv) ? Math.max(1, Math.floor(Number(playerRealmLv))) : 1;
  const normalizedTechniqueLevel = Number.isFinite(techniqueRealmLv) ? Math.max(1, Math.floor(Number(techniqueRealmLv))) : 1;
  return normalizedTechniqueLevel - normalizedPlayerLevel > TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA;
}

/** 获取当前炼体层数升到下一层所需经验 */
export function getBodyTrainingExpToNext(level: number): number {
  const normalizedLevel = Math.max(0, Math.floor(level));
  return Math.max(1, Math.round(BODY_TRAINING_EXP_BASE * (BODY_TRAINING_EXP_GROWTH_RATE ** normalizedLevel)));
}

/** 规范化炼体状态，并把超额经验滚入后续层数 */
export function normalizeBodyTrainingState(state?: Partial<BodyTrainingState> | null): BodyTrainingState {
  let level = Math.max(0, Math.floor(Number(state?.level ?? 0) || 0));
  let exp = Math.max(0, Math.floor(Number(state?.exp ?? 0) || 0));
  let expToNext = getBodyTrainingExpToNext(level);

  while (expToNext > 0 && exp >= expToNext) {
    exp -= expToNext;
    level += 1;
    /** expToNext：exp To新版。 */
    expToNext = getBodyTrainingExpToNext(level);
  }

  return {
    level,
    exp,
    expToNext,
  };
}

/** 计算炼体累计提供的固定四维加成 */
export function calcBodyTrainingAttrBonus(level: number): Partial<Attributes> {
  const normalizedLevel = Math.max(0, Math.floor(level));
  if (normalizedLevel <= 0) {
    return {};
  }
  const result: Partial<Attributes> = {};
  for (const key of BODY_TRAINING_ATTR_KEYS) {
    result[key] = normalizedLevel;
  }
  return result;
}

/** 计算功法在指定层数时累计提供的六维属性加成 */
export function calcTechniqueAttrValues(level: number, layers?: TechniqueLayerDef[]): Partial<Attributes> {
  const result: Partial<Attributes> = {};
  if (level <= 0) return result;
  const normalized = normalizeLayers(layers);
  for (const layer of normalized) {
    if (layer.level > level) break;
    for (const key of TECHNIQUE_ATTR_KEYS) {
      const value = layer.attrs?.[key] ?? 0;
      if (value <= 0) continue;
      result[key] = (result[key] ?? 0) + value;
    }
  }
  return result;
}

/** 计算下一层升级时各属性的增量 */
export function calcTechniqueNextLevelGains(level: number, layers?: TechniqueLayerDef[]): Partial<Attributes> {
  const normalized = normalizeLayers(layers);
  const nextLayer = normalized.find((entry) => entry.level === level + 1);
  if (!nextLayer?.attrs) return {};
  const result: Partial<Attributes> = {};
  for (const key of TECHNIQUE_ATTR_KEYS) {
    const gain = nextLayer.attrs[key] ?? 0;
    if (gain <= 0) continue;
    result[key] = gain;
  }
  return result;
}

/** calcTechniqueSoftDecayedPool：处理calc Technique Soft Decayed池。 */
function calcTechniqueSoftDecayedPool(rawPool: number, freeLimit: number, decaySpan: number): number {
  if (rawPool <= 0) return 0;
  if (rawPool <= freeLimit) return rawPool;
  if (decaySpan <= 0) return freeLimit;
  const overflow = rawPool - freeLimit;
  return freeLimit + decaySpan * Math.log1p(overflow / decaySpan);
}

/** 汇总所有已学功法的最终属性加成（按品阶分组并应用软衰减） */
export function calcTechniqueFinalAttrBonus(techniques: readonly TechniqueState[]): Attributes {
  const result = createZeroAttributes();

  for (const key of TECHNIQUE_ATTR_KEYS) {
    let finalValue = 0;

    for (const grade of TECHNIQUE_GRADE_ORDER) {
      const rawPool = techniques
        .filter((technique) => technique.grade === grade)
        .map((technique) => calcTechniqueAttrValues(technique.level, technique.layers)[key] ?? 0)
        .reduce((sum, value) => sum + value, 0);
      if (rawPool <= 0) continue;
      finalValue += calcTechniqueSoftDecayedPool(
        rawPool,
        TECHNIQUE_GRADE_ATTR_FREE_LIMITS[grade][key],
        TECHNIQUE_GRADE_ATTR_DECAY_SPANS[grade][key],
      );
    }

    if (finalValue <= 0) continue;
    result[key] = Math.floor(finalValue);
  }

  return result;
}



