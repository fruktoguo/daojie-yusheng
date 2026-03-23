/**
 * 功法系统计算：层级经验、境界推导、属性成长曲线、品阶软衰减。
 */
import type {
  Attributes,
  SkillDef,
  TechniqueAttrCurveSegment,
  TechniqueAttrCurves,
  TechniqueLayerDef,
  TechniqueRealm,
  TechniqueState,
} from './types';
import { TechniqueRealm as TechniqueRealmEnum } from './types';
import {
  TECHNIQUE_ATTR_KEYS,
  TECHNIQUE_GRADE_ATTR_DECAY_K,
  TECHNIQUE_GRADE_ATTR_DECAY_SPANS,
  TECHNIQUE_GRADE_ATTR_FREE_LIMITS,
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

function normalizeLayers(layers?: TechniqueLayerDef[]): TechniqueLayerDef[] {
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

/** 获取功法最大层数 */
export function getTechniqueMaxLevel(layers?: TechniqueLayerDef[], currentLevel = 1, legacyCurves?: TechniqueAttrCurves): number {
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

/** 根据当前层数推导功法境界（入门/小成/大成/圆满） */
export function deriveTechniqueRealm(level: number, layers?: TechniqueLayerDef[], legacyCurves?: TechniqueAttrCurves): TechniqueRealm {
  const maxLevel = Math.max(1, getTechniqueMaxLevel(layers, level, legacyCurves));
  if (level >= maxLevel) return TechniqueRealmEnum.Perfection;
  const progress = maxLevel <= 1 ? 1 : level / maxLevel;
  if (progress >= 0.66) return TechniqueRealmEnum.Major;
  if (progress >= 0.33) return TechniqueRealmEnum.Minor;
  return TechniqueRealmEnum.Entry;
}

/** 计算功法在指定层数时累计提供的六维属性加成 */
export function calcTechniqueAttrValues(level: number, layers?: TechniqueLayerDef[], legacyCurves?: TechniqueAttrCurves): Partial<Attributes> {
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

/** 计算下一层升级时各属性的增量 */
export function calcTechniqueNextLevelGains(level: number, layers?: TechniqueLayerDef[], legacyCurves?: TechniqueAttrCurves): Partial<Attributes> {
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
    if (gain > 0) {
      result[key] = gain;
    }
  }
  return result;
}

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
