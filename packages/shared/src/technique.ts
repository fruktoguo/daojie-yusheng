/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
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
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueLayerGains,
  TechniqueLayerGainsDelta,
  TechniqueRealm,
  TechniqueState,
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
export const TECHNIQUE_MAX_ATTR_PERCENT_BONUS_SOURCE = 'attr-multiplier:technique-max';

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
  const s = modifier.selector;
  const rk = s?.resourceKeys ? s.resourceKeys.slice().sort().join(',') : '';
  const fm = s?.families ? s.families.slice().sort().join(',') : '';
  const fo = s?.forms ? s.forms.slice().sort().join(',') : '';
  const el = s?.elements ? s.elements.slice().sort().join(',') : '';
  return `${rk}|${fm}|${fo}|${el}|${modifier.visibility ?? ''}`;
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
export function getTechniqueMaxLevel(layers?: TechniqueLayerDef[], currentLevel = 1): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
export function deriveTechniqueRealm(level: number, layers?: TechniqueLayerDef[]): TechniqueRealm {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const maxLevel = Math.max(1, getTechniqueMaxLevel(layers, level));
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

/** 计算功法在指定层数时累计提供的六维属性加成 */
export function calcTechniqueAttrValues(level: number, layers?: TechniqueLayerDef[]): Partial<Attributes> {
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
export function calcTechniqueNextLevelGains(level: number, layers?: TechniqueLayerDef[]): Partial<Attributes> {
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
  return {};
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

/** 计算已学功法中每项六维的当前最高单项值，并换算成独立百分比乘区。 */
export function calcTechniqueMaxAttrPercentBonus(techniques: readonly TechniqueState[]): Partial<Attributes> {
  const result: Partial<Attributes> = {};
  for (const key of TECHNIQUE_ATTR_KEYS) {
    let maxValue = 0;
    for (const technique of techniques) {
      const value = Number(calcTechniqueAttrValues(technique.level, technique.layers)[key] ?? 0);
      if (Number.isFinite(value) && value > maxValue) {
        maxValue = value;
      }
    }
    if (maxValue > 0) {
      result[key] = maxValue / 10;
    }
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

export * from './technique-internal-normalization';

/**
 * 功法逐层增量展开：把紧凑的 `TechniqueLayerGains`（base + deltas）拉平为逐层
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
