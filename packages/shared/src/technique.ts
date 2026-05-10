/**
 * 功法系统计算：层级经验、境界推导、属性成长曲线、品阶软衰减。
 */
import type {
  Attributes,
} from './attribute-types';
import type { AttrKey } from './attribute-types';
import type {
  BodyTrainingState,
  PlayerSpecialStats,
  TechniqueAttrCurveSegment,
  TechniqueAttrCurves,
  TechniqueCategory,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueLayerGains,
  TechniqueLayerGainsDelta,
  TechniqueRealm,
  TechniqueState,
  TechniqueTemplate,
  TechniqueTemplateSparseLayer,
} from './cultivation-types';
import type { SkillDef } from './skill-types';
import { TechniqueRealm as TechniqueRealmEnum } from './cultivation-types';
import type { QiProjectionModifier } from './qi';
import { getRealmAttributeMultiplier } from './combat';
import { DEFAULT_QI_EFFICIENCY_BP } from './constants/gameplay/qi';
import {
  BODY_TRAINING_ATTR_KEYS,
  BODY_TRAINING_ATTR_PERCENT_PER_LEVEL,
  BODY_TRAINING_EXP_BASE,
  BODY_TRAINING_EXP_GROWTH_RATE,
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_EXP_BASE,
  TECHNIQUE_GRADE_ATTR_DECAY_K,
  TECHNIQUE_GRADE_ATTR_DECAY_SPANS,
  TECHNIQUE_GRADE_ATTR_FREE_LIMITS,
  TECHNIQUE_EXP_LEVEL_DELTA_MULTIPLIER_STEP,
  TECHNIQUE_LEARNING_HEAVY_DECAY_WARNING_DELTA,
  TECHNIQUE_GRADE_QI_COST_MULTIPLIERS,
  TECHNIQUE_GRADE_ORDER,
} from './constants/gameplay/technique';

const BODY_TRAINING_FINITE_NUMBER_MAX = Number.MAX_VALUE;

/** 创建全零六维属性对象 */
export function createZeroAttributes(): Attributes {
  return {
    constitution: 0,
    spirit: 0,
    perception: 0,
    talent: 0,
    strength: 0,
    meridians: 0,
  };
}

/** normalizeLayers：规范化Layers。 */
function normalizeLayers(layers?: TechniqueLayerDef[]): TechniqueLayerDef[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!layers || layers.length === 0) return [];
  return [...layers].sort((left, right) => left.level - right.level);
}

function normalizeSegments(segments?: TechniqueAttrCurveSegment[]): TechniqueAttrCurveSegment[] {
  if (!segments || segments.length === 0) return [];
  return [...segments].sort((left, right) => left.startLevel - right.startLevel);
}

function calcTechniqueCurveValue(level: number, segments?: TechniqueAttrCurveSegment[]): number {
  if (level <= 0) return 0;
  let total = 0;
  for (const segment of normalizeSegments(segments)) {
    if (level < segment.startLevel) continue;
    const effectiveEnd = segment.endLevel === undefined ? level : Math.min(level, segment.endLevel);
    if (effectiveEnd < segment.startLevel) continue;
    total += (effectiveEnd - segment.startLevel + 1) * segment.gainPerLevel;
  }
  return total;
}

function calcTechniqueCurveNextGain(level: number, segments?: TechniqueAttrCurveSegment[]): number {
  const targetLevel = Math.max(1, level + 1);
  for (const segment of normalizeSegments(segments)) {
    const segmentEnd = segment.endLevel ?? Number.POSITIVE_INFINITY;
    if (targetLevel >= segment.startLevel && targetLevel <= segmentEnd) {
      return segment.gainPerLevel;
    }
  }
  return 0;
}

function cloneQiProjectionSelector(
  selector: QiProjectionModifier['selector'],
): QiProjectionModifier['selector'] {
  if (!selector) {
    return undefined;
  }
  return {
    resourceKeys: selector.resourceKeys ? [...selector.resourceKeys].sort() : undefined,
    families: selector.families ? [...selector.families].sort() : undefined,
    forms: selector.forms ? [...selector.forms].sort() : undefined,
    elements: selector.elements ? [...selector.elements].sort() : undefined,
  };
}

function buildQiProjectionModifierKey(modifier: QiProjectionModifier): string {
  return JSON.stringify({
    selector: cloneQiProjectionSelector(modifier.selector),
    visibility: modifier.visibility,
  });
}

function accumulateQiProjectionModifiers(
  target: Map<string, QiProjectionModifier>,
  modifiers?: readonly QiProjectionModifier[],
): void {
  for (const modifier of modifiers ?? []) {
    const key = buildQiProjectionModifierKey(modifier);
    const existing = target.get(key);
    if (!existing) {
      target.set(key, {
        selector: cloneQiProjectionSelector(modifier.selector),
        visibility: modifier.visibility,
        efficiencyBpMultiplier: modifier.efficiencyBpMultiplier,
      });
      continue;
    }
    if (modifier.visibility === 'absorbable' || (!existing.visibility && modifier.visibility)) {
      existing.visibility = modifier.visibility;
    }
    if (modifier.efficiencyBpMultiplier !== undefined) {
      const existingDelta = (existing.efficiencyBpMultiplier ?? DEFAULT_QI_EFFICIENCY_BP) - DEFAULT_QI_EFFICIENCY_BP;
      const incomingDelta = modifier.efficiencyBpMultiplier - DEFAULT_QI_EFFICIENCY_BP;
      existing.efficiencyBpMultiplier = Math.max(0, DEFAULT_QI_EFFICIENCY_BP + existingDelta + incomingDelta);
    }
  }
}

/** 获取功法最大层数 */
export function getTechniqueMaxLevel(layers?: TechniqueLayerDef[], currentLevel = 1, legacyCurves?: TechniqueAttrCurves): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalized = normalizeLayers(layers);
  if (normalized.length > 0) {
    return normalized[normalized.length - 1].level;
  }
  if (legacyCurves && Object.keys(legacyCurves).length > 0) {
    return Math.max(4, currentLevel);
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

/** 根据经验倍率与功法境界等级计算功法实际经验需求 */
export function scaleTechniqueExp(expFactor: number, realmLv = 1): number {
  if (expFactor <= 0) return 0;
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.floor(realmLv)) : 1;
  return Math.max(0, Math.round(expFactor * TECHNIQUE_EXP_BASE * normalizedRealmLv));
}

/** 解析技能解锁层数（优先 unlockLevel，其次 unlockRealm+1） */
export function resolveSkillUnlockLevel(skill: Pick<SkillDef, 'unlockLevel' | 'unlockRealm'>): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
export function deriveTechniqueRealm(level: number, layers?: TechniqueLayerDef[], legacyCurves?: TechniqueAttrCurves): TechniqueRealm {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const maxLevel = Math.max(1, getTechniqueMaxLevel(layers, level, legacyCurves));
  if (level >= maxLevel) return TechniqueRealmEnum.Perfection;
  const progress = maxLevel <= 1 ? 1 : level / maxLevel;
  if (progress >= 0.66) return TechniqueRealmEnum.Major;
  if (progress >= 0.33) return TechniqueRealmEnum.Minor;
  return TechniqueRealmEnum.Entry;
}

/** 解析技能所属的功法境界（优先技能显式 unlockRealm，其次按解锁层数推导） */
export function resolveSkillTechniqueRealm(skill: Pick<SkillDef, 'unlockLevel' | 'unlockRealm'>, layers?: TechniqueLayerDef[]): TechniqueRealm {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  const realmFactor = getRealmAttributeMultiplier(normalizedRealmLv);
  return Math.max(
    0,
    Math.round(
      normalizedMultiplier
      * getTechniqueGradeQiCostMultiplier(grade)
      * normalizedRealmLv
      * realmFactor,
    ),
  );
}

/** getTechniqueExpLevelAdjustment：读取Technique Exp等级Adjustment。 */
export function getTechniqueExpLevelAdjustment(
  playerRealmLv: number | undefined,
  techniqueRealmLv: number | undefined,
): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  const normalizedLevel = normalizeBodyTrainingInteger(level, 0);
  const rawExpToNext = BODY_TRAINING_EXP_BASE * (BODY_TRAINING_EXP_GROWTH_RATE ** normalizedLevel);
  if (!Number.isFinite(rawExpToNext) || rawExpToNext >= BODY_TRAINING_FINITE_NUMBER_MAX) {
    return BODY_TRAINING_FINITE_NUMBER_MAX;
  }
  return Math.max(1, Math.round(rawExpToNext));
}

/** 规范化炼体状态，并把超额经验滚入后续层数 */
export function normalizeBodyTrainingState(state?: Partial<BodyTrainingState> | null): BodyTrainingState {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  let level = normalizeBodyTrainingInteger(state?.level, 0);
  let exp = normalizeBodyTrainingInteger(state?.exp, 0);
  let expToNext = getBodyTrainingExpToNext(level);

  while (expToNext > 0 && exp >= expToNext) {
    if (level >= BODY_TRAINING_FINITE_NUMBER_MAX) {
      exp = Math.min(exp, Math.max(0, expToNext - 1));
      break;
    }
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

function normalizeBodyTrainingInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(BODY_TRAINING_FINITE_NUMBER_MAX, Math.max(0, Math.floor(numeric)));
}

/** 计算炼体累计提供的全六维百分比加成 */
export function calcBodyTrainingAttrPercentBonus(level: number): Partial<Attributes> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalizedLevel = Math.max(0, Math.floor(level));
  if (normalizedLevel <= 0) {
    return {};
  }
  const result: Partial<Attributes> = {};
  for (const key of BODY_TRAINING_ATTR_KEYS) {
    result[key] = normalizedLevel * BODY_TRAINING_ATTR_PERCENT_PER_LEVEL;
  }
  return result;
}

/** @deprecated 炼体现在返回全六维百分比加成，保留旧名兼容调用方。 */
export function calcBodyTrainingAttrBonus(level: number): Partial<Attributes> {
  return calcBodyTrainingAttrPercentBonus(level);
}

/** 计算功法在指定层数时累计提供的六维属性加成 */
export function calcTechniqueAttrValues(level: number, layers?: TechniqueLayerDef[], legacyCurves?: TechniqueAttrCurves): Partial<Attributes> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const result: Partial<Attributes> = {};
  if (level <= 0) return result;
  const normalized = normalizeLayers(layers);
  if (normalized.length > 0) {
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
  if (!legacyCurves) return result;
  for (const key of TECHNIQUE_ATTR_KEYS) {
    const value = calcTechniqueCurveValue(level, legacyCurves[key]);
    if (value <= 0) continue;
    result[key] = value;
  }
  return result;
}

/** 计算功法在指定层数时累计提供的特殊属性加成 */
export function calcTechniqueSpecialStatValues(level: number, layers?: TechniqueLayerDef[]): Partial<PlayerSpecialStats> {
  const result: Partial<PlayerSpecialStats> = {};
  if (level <= 0) return result;
  const normalized = normalizeLayers(layers);
  for (const layer of normalized) {
    if (layer.level > level) break;
    const legacyAttrs = layer.attrs as (TechniqueLayerDef['attrs'] & { comprehension?: number; luck?: number }) | undefined;
    const comprehension = layer.specialStats?.comprehension ?? legacyAttrs?.comprehension ?? 0;
    if (comprehension > 0) {
      result.comprehension = (result.comprehension ?? 0) + comprehension;
    }
    const luck = layer.specialStats?.luck ?? legacyAttrs?.luck ?? 0;
    if (luck > 0) {
      result.luck = (result.luck ?? 0) + luck;
    }
  }
  return result;
}

/** 计算下一层升级时各属性的增量 */
export function calcTechniqueNextLevelGains(level: number, layers?: TechniqueLayerDef[], legacyCurves?: TechniqueAttrCurves): Partial<Attributes> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalized = normalizeLayers(layers);
  if (normalized.length > 0) {
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
  const result: Partial<Attributes> = {};
  if (!legacyCurves) return result;
  for (const key of TECHNIQUE_ATTR_KEYS) {
    const gain = calcTechniqueCurveNextGain(level, legacyCurves[key]);
    if (gain <= 0) continue;
    result[key] = gain;
  }
  return result;
}

/** 计算下一层升级时各特殊属性的增量 */
export function calcTechniqueNextLevelSpecialStatGains(level: number, layers?: TechniqueLayerDef[]): Partial<PlayerSpecialStats> {
  const normalized = normalizeLayers(layers);
  const nextLayer = normalized.find((entry) => entry.level === level + 1);
  if (!nextLayer?.specialStats && !nextLayer?.attrs) return {};
  const result: Partial<PlayerSpecialStats> = {};
  const legacyAttrs = nextLayer.attrs as (TechniqueLayerDef['attrs'] & { comprehension?: number; luck?: number }) | undefined;
  const comprehension = nextLayer.specialStats?.comprehension ?? legacyAttrs?.comprehension ?? 0;
  if (comprehension > 0) {
    result.comprehension = comprehension;
  }
  const luck = nextLayer.specialStats?.luck ?? legacyAttrs?.luck ?? 0;
  if (luck > 0) {
    result.luck = luck;
  }
  return result;
}

/** 计算功法在指定层数时累计提供的气机投影修正。 */
export function calcTechniqueQiProjectionModifiers(level: number, layers?: TechniqueLayerDef[]): QiProjectionModifier[] {
  if (level <= 0) {
    return [];
  }
  const normalized = normalizeLayers(layers);
  if (normalized.length === 0) {
    return [];
  }
  const aggregated = new Map<string, QiProjectionModifier>();
  for (const layer of normalized) {
    if (layer.level > level) {
      break;
    }
    accumulateQiProjectionModifiers(aggregated, layer.qiProjection);
  }
  return [...aggregated.values()];
}

/** calcTechniqueSoftDecayedPool：处理calc Technique Soft Decayed池。 */
function calcTechniqueSoftDecayedPool(rawPool: number, freeLimit: number, decaySpan: number): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (rawPool <= 0) return 0;
  if (rawPool <= freeLimit) return rawPool;
  if (decaySpan <= 0) return freeLimit;
  const overflow = rawPool - freeLimit;
  return freeLimit + decaySpan * Math.log1p(overflow / decaySpan);
}

/** 汇总所有已学功法的最终属性加成（按品阶分组并应用软衰减） */
export function calcTechniqueFinalAttrBonus(techniques: readonly TechniqueState[]): Attributes {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const result = createZeroAttributes();

  for (const key of TECHNIQUE_ATTR_KEYS) {
    let finalValue = 0;

    for (const grade of TECHNIQUE_GRADE_ORDER) {
      const rawPool = techniques
        .filter((technique) => technique.grade === grade)
        .map((technique) => calcTechniqueAttrValues(technique.level, technique.layers, technique.attrCurves)[key] ?? 0)
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

/** 汇总所有已学功法的最终特殊属性加成 */
export function calcTechniqueFinalSpecialStatBonus(techniques: readonly TechniqueState[]): Pick<PlayerSpecialStats, 'comprehension' | 'luck'> {
  const result = {
    comprehension: 0,
    luck: 0,
  };
  for (const technique of techniques) {
    const values = calcTechniqueSpecialStatValues(technique.level, technique.layers);
    result.comprehension += Math.max(0, Math.floor(values.comprehension ?? 0));
    result.luck += Math.max(0, Math.floor(values.luck ?? 0));
  }
  return result;
}

/** 汇总所有已学功法的最终气机投影修正。 */
export function calcTechniqueFinalQiProjection(techniques: readonly TechniqueState[]): QiProjectionModifier[] {
  const aggregated = new Map<string, QiProjectionModifier>();
  for (const technique of techniques) {
    accumulateQiProjectionModifiers(
      aggregated,
      calcTechniqueQiProjectionModifiers(technique.level, technique.layers),
    );
  }
  return [...aggregated.values()];
}

// ---------------------------------------------------------------------------
// 内功量化展开：把 TechniqueTemplate 的 attrRatio / attrFloat / maxLayer /
// expDifficulty 按公式展开为逐层 attrs + expToNext，供运行时走与静态功法一致
// 的代码路径。同时允许通过 sparse `layers` 承载 qiProjection 等策划权威覆盖。
// 设计来源：docs/design/systems/AI功法生成方案.md §4 / §6 / §7.4。
// ---------------------------------------------------------------------------

/** 功法模板 schema 版本，便于后续 AI 生成入库时做兼容迁移。 */
export const TECHNIQUE_SCHEMA_VERSION = 1 as const;

/** 内功展开默认总层数。 */
export const TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER = 9 as const;

/** 内功总层数允许范围（含端点）。 */
export const TECHNIQUE_INTERNAL_MAX_LAYER_RANGE: readonly [number, number] = [3, 49];

/** 内功属性浮动系数 `attrFloat` 允许范围（含端点）。 */
export const TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE: readonly [number, number] = [-0.15, 0.10];

/** 经验难度系数 `expDifficulty` 允许范围（含端点）。 */
export const TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE: readonly [number, number] = [0.5, 2.0];

/** 每层经验增长公比（阶段内部平滑递增基底）。 */
export const TECHNIQUE_INTERNAL_K = 1.10 as const;

/**
 * 阶段经验 / 属性权重 `[入门, 小成, 大成]`。
 *
 * 既作为每层经验倍乘 `stageStep`，也作为阶段属性总量分配比例。
 */
export const TECHNIQUE_INTERNAL_STAGE_WEIGHT: readonly [number, number, number] = [1, 2, 4];

/** 各分类的经验系数 `catFactor`。 */
export const TECHNIQUE_CATEGORY_EXP_FACTOR: Record<TechniqueCategory, number> = {
  internal: 1.0,
  arts: 0.5,
  secret: 1.0,
  divine: 1.0,
};

/** 品阶索引：`mortal = 1` ... `emperor = 8`。 */
const TECHNIQUE_GRADE_INDEX: Record<TechniqueGrade, number> = {
  mortal: 1,
  yellow: 2,
  mystic: 3,
  earth: 4,
  heaven: 5,
  spirit: 6,
  saint: 7,
  emperor: 8,
};

/** 读取功法品阶索引。 */
export function getTechniqueGradeIndex(grade: TechniqueGrade): number {
  return TECHNIQUE_GRADE_INDEX[grade] ?? 1;
}

/** 在 `[min, max]` 之间夹住 `value`。 */
function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 按阶段（入门/小成/大成）切分总层数。
 *
 * 规则：入门 = `floor(n/3)`，小成 = `floor(n/3)`，大成 = `n - 2·floor(n/3)`（余数归大成）。
 *
 * 下限取 1（容纳 legacy monster arts 等单层模板）；上限仍为 `TECHNIQUE_INTERNAL_MAX_LAYER_RANGE[1]`。
 */
export function resolveTechniqueStageLayers(maxLayer: number): [number, number, number] {
  const normalized = Math.max(
    1,
    Math.min(TECHNIQUE_INTERNAL_MAX_LAYER_RANGE[1], Math.trunc(maxLayer || TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER)),
  );
  const per = Math.floor(normalized / 3);
  return [per, per, normalized - 2 * per];
}

/** 按 1-based 层号返回阶段索引 0/1/2（入门/小成/大成）。 */
export function resolveTechniqueStageIndex(level: number, stageLayers: readonly [number, number, number]): 0 | 1 | 2 {
  if (level <= stageLayers[0]) return 0;
  if (level <= stageLayers[0] + stageLayers[1]) return 1;
  return 2;
}

/**
 * 内功六维总量公式：`T = (g²·(realmLv+25) + 50) × (1 + attrFloat)`。
 */
export function calcInternalTechniqueAttrTotal(
  grade: TechniqueGrade,
  realmLv: number,
  attrFloat = 0,
): number {
  const g = getTechniqueGradeIndex(grade);
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.trunc(realmLv)) : 1;
  const normalizedFloat = clampRange(
    Number(attrFloat ?? 0),
    TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[0],
    TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[1],
  );
  return (g * g * (normalizedRealmLv + 25) + 50) * (1 + normalizedFloat);
}

/**
 * 内功总经验：`BASE × catFactor × (K^maxLayer - 1)/(K-1) × expDifficulty`，`BASE = g²·(realmLv+5)`。
 *
 * 返回值已乘以 `TECHNIQUE_EXP_BASE × realmLv`，与 `scaleTechniqueExp(expFactor, realmLv)` 的
 * 运行时单位对齐；这样展开后的 `expToNext` 可直接作为 `TechniqueLayerDef.expToNext` 使用，
 * 不需要下游再做额外缩放，也避免与老逐层配置的数量级出现 ~1700x 偏差。
 */
export function calcInternalTechniqueTotalExp(
  grade: TechniqueGrade,
  realmLv: number,
  maxLayer: number,
  expDifficulty = 1,
  category: TechniqueCategory = 'internal',
): number {
  const g = getTechniqueGradeIndex(grade);
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.trunc(realmLv)) : 1;
  const base = g * g * (normalizedRealmLv + 5);
  const [entry, minor, major] = resolveTechniqueStageLayers(maxLayer);
  const layersCount = entry + minor + major;
  const catFactor = TECHNIQUE_CATEGORY_EXP_FACTOR[category] ?? 1;
  const difficulty = clampRange(
    Number(expDifficulty ?? 1),
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[0],
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[1],
  );
  const K = TECHNIQUE_INTERNAL_K;
  const rawTotal = base * catFactor * ((K ** layersCount - 1) / (K - 1)) * difficulty;
  return rawTotal * TECHNIQUE_EXP_BASE * normalizedRealmLv;
}

/** attrRatio 的非零权重总和。 */
function sumAttrRatioWeights(attrRatio: Partial<Record<AttrKey, number>> | undefined): number {
  if (!attrRatio) return 0;
  let sum = 0;
  for (const value of Object.values(attrRatio)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      sum += value;
    }
  }
  return sum;
}

/** 把 sparse overlay layers（只含 qiProjection）按 `level` merge 进展开结果。 */
function mergeSparseQiProjection(
  expandedLayers: TechniqueLayerDef[],
  sparse: readonly (TechniqueLayerDef | TechniqueTemplateSparseLayer)[] | undefined,
): void {
  if (!sparse || sparse.length === 0) return;
  const byLevel = new Map<number, TechniqueLayerDef>();
  for (const layer of expandedLayers) {
    byLevel.set(layer.level, layer);
  }
  for (const entry of sparse) {
    if (!entry || !Number.isFinite((entry as TechniqueTemplateSparseLayer).level)) continue;
    const target = byLevel.get(Math.trunc((entry as TechniqueTemplateSparseLayer).level));
    if (!target) continue;
    const qiProjection = (entry as TechniqueTemplateSparseLayer).qiProjection;
    if (Array.isArray(qiProjection) && qiProjection.length > 0) {
      target.qiProjection = qiProjection.map((modifier) => ({ ...modifier }));
    }
  }
}

/**
 * 判断模板是否需要走量化展开。
 *
 * 触发条件：`category === 'internal'` 且有 `attrRatio` 非零权重。
 */
export function shouldExpandInternalTechnique(template: Pick<TechniqueTemplate, 'category' | 'attrRatio'>): boolean {
  if (template.category !== 'internal') return false;
  return sumAttrRatioWeights(template.attrRatio) > 0;
}

/** 内功展开结果（仅包含运行时需要的 layers 与诊断性统计）。 */
export interface InternalTechniqueExpansion {
  /** 展开后的完整 layers，可直接挂到 TechniqueState.layers。 */
  layers: TechniqueLayerDef[];
  /** 六维总量（浮点，按公式计算，用于 diff 报告）。 */
  attrTotal: number;
  /** 总经验（浮点，按公式计算，用于 diff 报告）。 */
  totalExp: number;
  /** 各阶段层数 `[入门, 小成, 大成]`。 */
  stageLayers: [number, number, number];
}

/**
 * 展开内功量化模板：生成逐层 `{ level, expToNext, attrs, qiProjection? }`。
 *
 * 数值按 `AI功法生成方案.md §4 / §6 / §7.4`：
 * - 六维总量 `T = (g²·(realmLv+25) + 50) × (1 + attrFloat)`；
 * - 按阶段权重 `[1, 2, 4]` 分配到入门/小成/大成，阶段内每层均分；
 * - 每层经验 `raw = BASE × catFactor × K^(L-1) × stageStep × expDifficulty`，再归一到 `totalExp`。
 *
 * sparse overlay `template.layers` 仅保留 `{ level, qiProjection }` 的条目会被 merge 进结果。
 */
export function expandInternalTechnique(template: TechniqueTemplate): InternalTechniqueExpansion {
  if (template.category !== 'internal') {
    throw new Error(`expandInternalTechnique: category must be 'internal', got ${template.category}`);
  }

  const grade = template.grade;
  const realmLv = Number.isFinite(template.realmLv) ? Math.max(1, Math.trunc(template.realmLv)) : 1;
  const attrFloat = clampRange(
    Number(template.attrFloat ?? 0),
    TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[0],
    TECHNIQUE_INTERNAL_ATTR_FLOAT_RANGE[1],
  );
  const maxLayer = Math.max(
    TECHNIQUE_INTERNAL_MAX_LAYER_RANGE[0],
    Math.min(
      TECHNIQUE_INTERNAL_MAX_LAYER_RANGE[1],
      Math.trunc(template.maxLayer ?? TECHNIQUE_INTERNAL_DEFAULT_MAX_LAYER),
    ),
  );
  const expDifficulty = clampRange(
    Number(template.expDifficulty ?? 1),
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[0],
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[1],
  );

  const attrTotal = calcInternalTechniqueAttrTotal(grade, realmLv, attrFloat);
  const expCurve = expandTechniqueExpCurve(grade, realmLv, maxLayer, expDifficulty, 'internal');
  const totalExp = expCurve.totalExp;

  const stageLayers = expCurve.stageLayers;
  const stageWeight = TECHNIQUE_INTERNAL_STAGE_WEIGHT;
  const stageWeightSum = stageWeight[0] + stageWeight[1] + stageWeight[2];
  const stageAttrTotals: [number, number, number] = [
    (attrTotal * stageWeight[0]) / stageWeightSum,
    (attrTotal * stageWeight[1]) / stageWeightSum,
    (attrTotal * stageWeight[2]) / stageWeightSum,
  ];

  // 经验归一由 expandTechniqueExpCurve 统一生成
  const perLayerExp = expCurve.perLayerExp;

  // 属性归一（每维按占比分到阶段，阶段内各层均分）
  const ratioSum = sumAttrRatioWeights(template.attrRatio);
  const attrRatio = template.attrRatio ?? {};

  const layers: TechniqueLayerDef[] = [];
  for (let level = 1; level <= maxLayer; level += 1) {
    const stageIdx = resolveTechniqueStageIndex(level, stageLayers);
    const layersInStage = stageLayers[stageIdx] > 0 ? stageLayers[stageIdx] : 1;
    const stagePerLayer = stageAttrTotals[stageIdx] / layersInStage;

    const attrs: Partial<Attributes> = {};
    if (ratioSum > 0) {
      for (const key of TECHNIQUE_ATTR_KEYS) {
        const weight = attrRatio[key];
        if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) continue;
        const raw = (stagePerLayer * weight) / ratioSum;
        const rounded = Math.max(0, Math.round(raw));
        if (rounded > 0) {
          attrs[key] = rounded;
        }
      }
    }

    layers.push({
      level,
      expToNext: perLayerExp[level - 1] ?? 0,
      attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
    });
  }

  mergeSparseQiProjection(layers, template.layers as TechniqueTemplateSparseLayer[] | undefined);

  return {
    layers,
    attrTotal,
    totalExp,
    stageLayers,
  };
}

/**
 * 通用功法经验曲线展开：产出每一层已缩放的 `expToNext`，并把末层强制置 0。
 *
 * 适用于所有 category（`internal / arts / divine / secret`）。经验公式统一为：
 * - `BASE = g²·(realmLv + 5)`，`K = 1.10`，`catFactor` 由 `TECHNIQUE_CATEGORY_EXP_FACTOR` 分派
 * - 阶段划分 1/3 入门 / 1/3 小成 / 余数归大成，阶段权重 `[1, 2, 4]`
 * - `rawLayer(L) = BASE × catFactor × K^(L-1) × stageStep × expDifficulty`
 * - 归一到 `totalExp = BASE × catFactor × (K^maxLayer - 1)/(K-1) × expDifficulty × TECHNIQUE_EXP_BASE × realmLv`
 * - 末层 `expToNext = 0`（沿用 legacy 约定，顶层不再消耗经验）
 */
export function expandTechniqueExpCurve(
  grade: TechniqueGrade,
  realmLv: number,
  maxLayer: number,
  expDifficulty = 1,
  category: TechniqueCategory = 'internal',
): {
  /** 每一层的 `expToNext`（已缩放到 runtime 单位），末层为 0。 */
  perLayerExp: number[];
  /** 总经验（含末层的理论贡献，仅用于 diff/验证）。 */
  totalExp: number;
  /** 各阶段层数 `[入门, 小成, 大成]`。 */
  stageLayers: [number, number, number];
} {
  const stageLayers = resolveTechniqueStageLayers(maxLayer);
  const resolvedMaxLayer = stageLayers[0] + stageLayers[1] + stageLayers[2];
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.trunc(realmLv)) : 1;
  const difficulty = clampRange(
    Number(expDifficulty ?? 1),
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[0],
    TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE[1],
  );

  const totalExp = calcInternalTechniqueTotalExp(grade, normalizedRealmLv, resolvedMaxLayer, difficulty, category);

  const g = getTechniqueGradeIndex(grade);
  const expBaseRaw = g * g * (normalizedRealmLv + 5);
  const catFactor = TECHNIQUE_CATEGORY_EXP_FACTOR[category] ?? 1;
  const K = TECHNIQUE_INTERNAL_K;
  const stageWeight = TECHNIQUE_INTERNAL_STAGE_WEIGHT;

  const rawPerLayer: number[] = [];
  let rawTotal = 0;
  for (let level = 1; level <= resolvedMaxLayer; level += 1) {
    const stageIdx = resolveTechniqueStageIndex(level, stageLayers);
    const stageStep = stageWeight[stageIdx];
    const raw = expBaseRaw * catFactor * (K ** (level - 1)) * stageStep * difficulty;
    rawPerLayer.push(raw);
    rawTotal += raw;
  }
  const normFactor = rawTotal > 0 ? totalExp / rawTotal : 0;

  const perLayerExp: number[] = [];
  for (let level = 1; level <= resolvedMaxLayer; level += 1) {
    if (level === resolvedMaxLayer) {
      perLayerExp.push(0);
    } else {
      perLayerExp.push(Math.max(1, Math.round(rawPerLayer[level - 1] * normFactor)));
    }
  }

  return { perLayerExp, totalExp, stageLayers };
}

/**
 * `calcInternalTechniqueTotalExp` 的通用别名，便于 tooling / 非内功调用方表达意图。
 */
export function calcTechniqueTotalExp(
  grade: TechniqueGrade,
  realmLv: number,
  maxLayer: number,
  expDifficulty = 1,
  category: TechniqueCategory = 'internal',
): number {
  return calcInternalTechniqueTotalExp(grade, realmLv, maxLayer, expDifficulty, category);
}

/**
 * 非内功功法的逐层增量展开：把紧凑的 `TechniqueLayerGains`（base + deltas）拉平为逐层
 * `{ attrs, specialStats }` 数组，下游按 level-1 下标读取。
 *
 * - `attrs` / `specialStats`：作为每一层的基础常驻增量，逐层原样拷贝；
 * - `deltas[].attrsAdd` / `deltas[].specialStatsAdd`：按 `[fromLevel, toLevel]`（含端点，
 *   `toLevel` 缺省 = `maxLayer`）累加到每层；多条 delta 作用于同一层时按顺序依次累加；
 * - 返回数组长度固定为 `max(1, maxLayer)`；下标 `i` 对应 `level = i + 1`；
 * - 所有非正整数字段会被忽略，最终 attrs / specialStats 如果为空对象会被省略为 `undefined`。
 */
export function expandTechniqueLayerGains(
  gains: TechniqueLayerGains | undefined,
  maxLayer: number,
): Array<{ attrs?: Partial<Attributes>; specialStats?: Partial<Pick<PlayerSpecialStats, 'comprehension' | 'luck'>> }> {
  const size = Math.max(1, Math.trunc(Number(maxLayer) || 0));
  const result: Array<{
    attrs?: Partial<Attributes>;
    specialStats?: Partial<Pick<PlayerSpecialStats, 'comprehension' | 'luck'>>;
  }> = [];

  if (!gains || typeof gains !== 'object') {
    for (let i = 0; i < size; i += 1) result.push({});
    return result;
  }

  const baseAttrs = sanitizeAttrBag(gains.attrs);
  const baseSpecial = sanitizeSpecialStatsBag(gains.specialStats);
  const deltas = Array.isArray(gains.deltas) ? gains.deltas : [];

  for (let level = 1; level <= size; level += 1) {
    const attrs: Record<string, number> = { ...baseAttrs };
    const special: Record<string, number> = { ...baseSpecial };

    for (const delta of deltas) {
      if (!delta || typeof delta !== 'object') continue;
      const from = Math.max(1, Math.trunc(Number(delta.fromLevel ?? 1)) || 1);
      const to = Number.isFinite(delta.toLevel as number)
        ? Math.trunc(Number(delta.toLevel as number))
        : size;
      if (level < from || level > to) continue;

      for (const [k, v] of Object.entries(sanitizeAttrBag(delta.attrsAdd))) {
        attrs[k] = (attrs[k] ?? 0) + v;
      }
      for (const [k, v] of Object.entries(sanitizeSpecialStatsBag(delta.specialStatsAdd))) {
        special[k] = (special[k] ?? 0) + v;
      }
    }

    const cleanAttrs: Partial<Attributes> = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (Number.isFinite(v) && v !== 0) cleanAttrs[k as AttrKey] = v;
    }
    const cleanSpecial: Partial<Pick<PlayerSpecialStats, 'comprehension' | 'luck'>> = {};
    for (const [k, v] of Object.entries(special)) {
      if (Number.isFinite(v) && v !== 0) (cleanSpecial as Record<string, number>)[k] = v;
    }

    result.push({
      attrs: Object.keys(cleanAttrs).length > 0 ? cleanAttrs : undefined,
      specialStats: Object.keys(cleanSpecial).length > 0 ? cleanSpecial : undefined,
    });
  }

  return result;
}

/** 内部工具：清洗 attrs 包（只保留 AttrKey + 有限数字 + 非零）。 */
function sanitizeAttrBag(raw: Partial<Attributes> | undefined | null): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const key of TECHNIQUE_ATTR_KEYS) {
    const value = Number((raw as Record<string, unknown>)[key]);
    if (Number.isFinite(value) && value !== 0) out[key] = value;
  }
  return out;
}

/** 内部工具：清洗 specialStats 包（只保留 comprehension / luck）。 */
function sanitizeSpecialStatsBag(
  raw: Partial<Pick<PlayerSpecialStats, 'comprehension' | 'luck'>> | undefined | null,
): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const key of ['comprehension', 'luck'] as const) {
    const value = Number((raw as Record<string, unknown>)[key]);
    if (Number.isFinite(value) && value !== 0) out[key] = value;
  }
  return out;
}
