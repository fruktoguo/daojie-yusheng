import type {
  AttrKey,
  Attributes,
  TechniqueAttrCurveSegment,
  TechniqueAttrCurves,
  TechniqueGrade,
  TechniqueState,
} from './types';

export const TECHNIQUE_ATTR_KEYS: AttrKey[] = [
  'constitution',
  'spirit',
  'perception',
  'talent',
  'comprehension',
  'luck',
];

export const TECHNIQUE_GRADE_ORDER: TechniqueGrade[] = [
  'mortal',
  'yellow',
  'mystic',
  'earth',
  'heaven',
  'spirit',
  'saint',
  'emperor',
];

export const TECHNIQUE_GRADE_LABELS: Record<TechniqueGrade, string> = {
  mortal: '凡阶',
  yellow: '黄阶',
  mystic: '玄阶',
  earth: '地阶',
  heaven: '天阶',
  spirit: '灵阶',
  saint: '圣阶',
  emperor: '帝阶',
};

export const TECHNIQUE_GRADE_LOCAL_DECAY: Record<TechniqueGrade, Attributes> = {
  mortal: { constitution: 0.35, spirit: 0.35, perception: 0.35, talent: 0.35, comprehension: 0.35, luck: 0.35 },
  yellow: { constitution: 0.45, spirit: 0.45, perception: 0.45, talent: 0.45, comprehension: 0.45, luck: 0.45 },
  mystic: { constitution: 0.55, spirit: 0.55, perception: 0.55, talent: 0.55, comprehension: 0.55, luck: 0.55 },
  earth: { constitution: 0.64, spirit: 0.64, perception: 0.64, talent: 0.64, comprehension: 0.64, luck: 0.64 },
  heaven: { constitution: 0.72, spirit: 0.72, perception: 0.72, talent: 0.72, comprehension: 0.72, luck: 0.72 },
  spirit: { constitution: 0.79, spirit: 0.79, perception: 0.79, talent: 0.79, comprehension: 0.79, luck: 0.79 },
  saint: { constitution: 0.85, spirit: 0.85, perception: 0.85, talent: 0.85, comprehension: 0.85, luck: 0.85 },
  emperor: { constitution: 0.9, spirit: 0.9, perception: 0.9, talent: 0.9, comprehension: 0.9, luck: 0.9 },
};

export const TECHNIQUE_GRADE_TOTAL_WEIGHTS: Record<TechniqueGrade, number> = {
  mortal: 0.6,
  yellow: 0.85,
  mystic: 1.1,
  earth: 1.4,
  heaven: 1.75,
  spirit: 2.15,
  saint: 2.6,
  emperor: 3.1,
};

export const TECHNIQUE_TOTAL_POOL_CAPS: Attributes = {
  constitution: 20,
  spirit: 20,
  perception: 18,
  talent: 18,
  comprehension: 16,
  luck: 14,
};

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

function normalizeSegments(segments?: TechniqueAttrCurveSegment[]): TechniqueAttrCurveSegment[] {
  if (!segments || segments.length === 0) return [];
  return [...segments].sort((left, right) => left.startLevel - right.startLevel);
}

export function calcTechniqueCurveValue(level: number, segments?: TechniqueAttrCurveSegment[]): number {
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

export function calcTechniqueCurveNextGain(level: number, segments?: TechniqueAttrCurveSegment[]): number {
  const targetLevel = Math.max(1, level + 1);
  for (const segment of normalizeSegments(segments)) {
    const segmentEnd = segment.endLevel ?? Number.POSITIVE_INFINITY;
    if (targetLevel >= segment.startLevel && targetLevel <= segmentEnd) {
      return segment.gainPerLevel;
    }
  }
  return 0;
}

export function calcTechniqueAttrValues(level: number, curves?: TechniqueAttrCurves): Partial<Attributes> {
  const result: Partial<Attributes> = {};
  if (!curves) return result;
  for (const key of TECHNIQUE_ATTR_KEYS) {
    const value = calcTechniqueCurveValue(level, curves[key]);
    if (value > 0) {
      result[key] = value;
    }
  }
  return result;
}

export function calcTechniqueNextLevelGains(level: number, curves?: TechniqueAttrCurves): Partial<Attributes> {
  const result: Partial<Attributes> = {};
  if (!curves) return result;
  for (const key of TECHNIQUE_ATTR_KEYS) {
    const gain = calcTechniqueCurveNextGain(level, curves[key]);
    if (gain > 0) {
      result[key] = gain;
    }
  }
  return result;
}

export function calcTechniqueFinalAttrBonus(techniques: readonly TechniqueState[]): Attributes {
  const result = createZeroAttributes();

  for (const key of TECHNIQUE_ATTR_KEYS) {
    let totalPool = 0;

    for (const grade of TECHNIQUE_GRADE_ORDER) {
      const contributions = techniques
        .filter((technique) => technique.grade === grade)
        .map((technique) => calcTechniqueCurveValue(technique.level, technique.attrCurves?.[key]))
        .filter((value) => value > 0)
        .sort((left, right) => right - left);

      if (contributions.length === 0) continue;

      const decay = TECHNIQUE_GRADE_LOCAL_DECAY[grade][key];
      let localPool = 0;
      for (let index = 0; index < contributions.length; index += 1) {
        localPool += contributions[index] * Math.pow(decay, index);
      }
      totalPool += localPool * TECHNIQUE_GRADE_TOTAL_WEIGHTS[grade];
    }

    if (totalPool <= 0) continue;
    const cap = TECHNIQUE_TOTAL_POOL_CAPS[key];
    const finalValue = cap > 0 ? cap * Math.log1p(totalPool / cap) : totalPool;
    result[key] = Math.floor(finalValue);
  }

  return result;
}

