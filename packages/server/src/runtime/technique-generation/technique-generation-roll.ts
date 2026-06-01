/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */

/**
 * AI 功法生成品阶/境界随机逻辑。
 *
 * 共用非对称衰减分布模型：
 * - 50% 命中基准值
 * - 剩余 50%：低方向 75%（37.5%），高方向 25%（12.5%）
 * - 同方向内几何衰减（每多偏移 1 档概率减半）
 */

import type { TechniqueGrade } from '@mud/shared';
import { TECHNIQUE_GRADE_ORDER } from '@mud/shared';
import {
  TECHNIQUE_GENERATION_BUDGET_PERCENT_DEFAULT,
  TECHNIQUE_GENERATION_BUDGET_PERCENT_MAX,
  TECHNIQUE_GENERATION_BUDGET_PERCENT_MIN,
  TECHNIQUE_GENERATION_REALM_LV_OFFSET,
  TECHNIQUE_GENERATION_GRADE_OFFSET,
  TECHNIQUE_GENERATION_CENTER_PROBABILITY,
  TECHNIQUE_GENERATION_HIGH_DIRECTION_RATIO,
  TECHNIQUE_GENERATION_MAX_ITEM_SPEND,
} from './technique-generation-constants';

export interface TechniqueGenerationRollOutcome {
  grade: TechniqueGrade;
  realmLv: number;
}

export interface TechniqueGenerationRollOptionChance {
  grade: TechniqueGrade;
  chance: number;
}

export interface TechniqueGenerationRollRealmChance {
  realmLv: number;
  chance: number;
}

export interface TechniqueGenerationRollRange {
  realmLvMin: number;
  realmLvMax: number;
  gradeMin: TechniqueGrade;
  gradeMax: TechniqueGrade;
  baseGrade: TechniqueGrade;
  itemSpendMin: number;
  itemSpendMax: number;
  itemSpendDefault: number;
  realmLvChances: TechniqueGenerationRollRealmChance[];
  gradeChances: TechniqueGenerationRollOptionChance[];
}

// ─── 品阶区间表 ───
// 来源：docs/design/balance/境界等级基准期望六维公式.md

export interface TechniqueGradeRealmBand {
  grade: TechniqueGrade;
  fromRealmLv: number;
  toRealmLv: number;
}

export const TECHNIQUE_GRADE_REALM_BANDS: readonly TechniqueGradeRealmBand[] = [
  { grade: 'mortal',  fromRealmLv: 1,   toRealmLv: 18 },
  { grade: 'yellow',  fromRealmLv: 9,   toRealmLv: 30 },
  { grade: 'mystic',  fromRealmLv: 19,  toRealmLv: 42 },
  { grade: 'earth',   fromRealmLv: 25,  toRealmLv: 54 },
  { grade: 'heaven',  fromRealmLv: 31,  toRealmLv: 86 },
  { grade: 'spirit',  fromRealmLv: 64,  toRealmLv: 110 },
  { grade: 'saint',   fromRealmLv: 98,  toRealmLv: 134 },
  { grade: 'emperor', fromRealmLv: 122, toRealmLv: 158 },
];

// ─── 通用非对称衰减 ───

/**
 * 非对称偏移随机：
 * - centerProb 概率返回 0（命中基准）
 * - 剩余概率中 highRatio 走正方向，(1-highRatio) 走负方向
 * - 方向内几何衰减（offset=1 概率最高，每 +1 减半）
 *
 * 返回值范围 [-maxOffset, +maxOffset]
 */
export function rollAsymmetricOffset(
  maxOffset: number,
  centerProb = TECHNIQUE_GENERATION_CENTER_PROBABILITY,
  highRatio = TECHNIQUE_GENERATION_HIGH_DIRECTION_RATIO,
): number {
  if (maxOffset <= 0) return 0;
  if (Math.random() < centerProb) return 0;

  const goHigh = Math.random() < highRatio;
  const offset = rollGeometricOffset(maxOffset);
  return goHigh ? offset : -offset;
}

/** 几何衰减：offset=1 概率最高，每增加 1 概率减半 */
function rollGeometricOffset(max: number): number {
  for (let i = 1; i < max; i += 1) {
    if (Math.random() < 0.5) return i;
  }
  return max;
}

// ─── realmLv 随机 ───

/** 基于玩家当前 realmLv，非对称浮动 ±6 */
export function rollTechniqueRealmLv(playerRealmLv: number): number {
  const offset = rollAsymmetricOffset(TECHNIQUE_GENERATION_REALM_LV_OFFSET);
  const result = playerRealmLv + offset;
  return Math.max(1, Math.min(127, result));
}

// ─── 基准品阶确定 ───

/**
 * 根据 realmLv 确定基准品阶。
 *
 * 逻辑：筛选 realmLv 落在 [from, to] 内的所有品阶，取区间最窄的（最精准匹配）。
 * 若无命中（realmLv 超出所有区间），取最近的品阶。
 */
export function resolveBaseGrade(realmLv: number): TechniqueGrade {
  const hits = TECHNIQUE_GRADE_REALM_BANDS.filter(
    (band) => realmLv >= band.fromRealmLv && realmLv <= band.toRealmLv,
  );

  if (hits.length > 0) {
    // 取区间最窄的
    let best = hits[0];
    let bestWidth = best.toRealmLv - best.fromRealmLv;
    for (let i = 1; i < hits.length; i += 1) {
      const width = hits[i].toRealmLv - hits[i].fromRealmLv;
      if (width < bestWidth) {
        best = hits[i];
        bestWidth = width;
      }
    }
    return best.grade;
  }

  // 无命中：取距离最近的品阶
  let closest = TECHNIQUE_GRADE_REALM_BANDS[0];
  let closestDist = Math.min(
    Math.abs(realmLv - closest.fromRealmLv),
    Math.abs(realmLv - closest.toRealmLv),
  );
  for (let i = 1; i < TECHNIQUE_GRADE_REALM_BANDS.length; i += 1) {
    const band = TECHNIQUE_GRADE_REALM_BANDS[i];
    const dist = Math.min(
      Math.abs(realmLv - band.fromRealmLv),
      Math.abs(realmLv - band.toRealmLv),
    );
    if (dist < closestDist) {
      closest = band;
      closestDist = dist;
    }
  }
  return closest.grade;
}

// ─── 品阶随机 ───

/** 基于 realmLv 随机品阶：基准 ±2 档非对称衰减 */
export function rollTechniqueGrade(realmLv: number): TechniqueGrade {
  const baseGrade = resolveBaseGrade(realmLv);
  const baseIndex = TECHNIQUE_GRADE_ORDER.indexOf(baseGrade);
  const offset = rollAsymmetricOffset(TECHNIQUE_GENERATION_GRADE_OFFSET);
  const targetIndex = Math.max(0, Math.min(TECHNIQUE_GRADE_ORDER.length - 1, baseIndex + offset));
  return TECHNIQUE_GRADE_ORDER[targetIndex];
}

export function normalizeTechniqueGenerationItemSpend(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.min(TECHNIQUE_GENERATION_MAX_ITEM_SPEND, Math.trunc(numeric)));
}

export function normalizeTechniqueGenerationBudgetPercent(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return TECHNIQUE_GENERATION_BUDGET_PERCENT_DEFAULT;
  }
  return Math.max(
    TECHNIQUE_GENERATION_BUDGET_PERCENT_MIN,
    Math.min(TECHNIQUE_GENERATION_BUDGET_PERCENT_MAX, numeric),
  );
}

export function rollTechniqueBudgetPercent(): number {
  const span = TECHNIQUE_GENERATION_BUDGET_PERCENT_MAX - TECHNIQUE_GENERATION_BUDGET_PERCENT_MIN;
  return Math.round((TECHNIQUE_GENERATION_BUDGET_PERCENT_MIN + Math.random() * span) * 10_000) / 10_000;
}

export function rollBoostedTechniqueOutcome(playerRealmLv: number, itemSpend: number): TechniqueGenerationRollOutcome {
  const attempts = normalizeTechniqueGenerationItemSpend(itemSpend);
  let best: TechniqueGenerationRollOutcome | null = null;
  for (let i = 0; i < attempts; i += 1) {
    const realmLv = rollTechniqueRealmLv(playerRealmLv);
    const grade = rollTechniqueGrade(realmLv);
    const candidate = { grade, realmLv };
    if (!best || compareRollOutcome(candidate, best) > 0) {
      best = candidate;
    }
  }
  return best ?? {
    realmLv: Math.max(1, Math.min(127, Math.trunc(playerRealmLv))),
    grade: resolveBaseGrade(playerRealmLv),
  };
}

export function buildTechniqueGenerationRollRange(playerRealmLv: number, itemSpend: unknown = 1): TechniqueGenerationRollRange {
  const spend = normalizeTechniqueGenerationItemSpend(itemSpend);
  const realmLvMin = Math.max(1, Math.trunc(playerRealmLv) - TECHNIQUE_GENERATION_REALM_LV_OFFSET);
  const realmLvMax = Math.min(127, Math.trunc(playerRealmLv) + TECHNIQUE_GENERATION_REALM_LV_OFFSET);
  const gradeIndexes: number[] = [];
  for (let realmLv = realmLvMin; realmLv <= realmLvMax; realmLv += 1) {
    const baseIndex = TECHNIQUE_GRADE_ORDER.indexOf(resolveBaseGrade(realmLv));
    gradeIndexes.push(
      Math.max(0, baseIndex - TECHNIQUE_GENERATION_GRADE_OFFSET),
      Math.min(TECHNIQUE_GRADE_ORDER.length - 1, baseIndex + TECHNIQUE_GENERATION_GRADE_OFFSET),
    );
  }
  const gradeMinIndex = Math.min(...gradeIndexes);
  const gradeMaxIndex = Math.max(...gradeIndexes);
  return {
    realmLvMin,
    realmLvMax,
    gradeMin: TECHNIQUE_GRADE_ORDER[gradeMinIndex],
    gradeMax: TECHNIQUE_GRADE_ORDER[gradeMaxIndex],
    baseGrade: resolveBaseGrade(Math.max(1, Math.min(127, Math.trunc(playerRealmLv)))),
    itemSpendMin: 1,
    itemSpendMax: TECHNIQUE_GENERATION_MAX_ITEM_SPEND,
    itemSpendDefault: spend,
    realmLvChances: estimateBoostedRealmLvChances(Math.max(1, Math.min(127, Math.trunc(playerRealmLv))), spend),
    gradeChances: estimateBoostedGradeChances(Math.max(1, Math.min(127, Math.trunc(playerRealmLv))), spend),
  };
}

function compareRollOutcome(left: TechniqueGenerationRollOutcome, right: TechniqueGenerationRollOutcome): number {
  const gradeDelta = TECHNIQUE_GRADE_ORDER.indexOf(left.grade) - TECHNIQUE_GRADE_ORDER.indexOf(right.grade);
  if (gradeDelta !== 0) {
    return gradeDelta;
  }
  return left.realmLv - right.realmLv;
}

function estimateBoostedGradeChances(playerRealmLv: number, itemSpend: number): TechniqueGenerationRollOptionChance[] {
  const attempts = normalizeTechniqueGenerationItemSpend(itemSpend);
  const singleRollOutcomes = buildSingleRollOutcomeDistribution(playerRealmLv)
    .sort((left, right) => compareRollOutcome(left, right));
  const gradeProbabilities = new Map<TechniqueGrade, number>();
  let cumulativeBefore = 0;
  for (const outcome of singleRollOutcomes) {
    const cumulativeAfter = cumulativeBefore + outcome.probability;
    const bestProbability = Math.pow(cumulativeAfter, attempts) - Math.pow(cumulativeBefore, attempts);
    gradeProbabilities.set(outcome.grade, (gradeProbabilities.get(outcome.grade) ?? 0) + bestProbability);
    cumulativeBefore = cumulativeAfter;
  }
  return TECHNIQUE_GRADE_ORDER
    .map((grade) => ({ grade, chance: Math.round((gradeProbabilities.get(grade) ?? 0) * 1000) / 10 }))
    .filter((entry) => entry.chance > 0);
}

function estimateBoostedRealmLvChances(playerRealmLv: number, itemSpend: number): TechniqueGenerationRollRealmChance[] {
  const attempts = normalizeTechniqueGenerationItemSpend(itemSpend);
  const singleRollOutcomes = buildSingleRollOutcomeDistribution(playerRealmLv)
    .sort((left, right) => compareRollOutcome(left, right));
  const realmLvProbabilities = new Map<number, number>();
  let cumulativeBefore = 0;
  for (const outcome of singleRollOutcomes) {
    const cumulativeAfter = cumulativeBefore + outcome.probability;
    const bestProbability = Math.pow(cumulativeAfter, attempts) - Math.pow(cumulativeBefore, attempts);
    realmLvProbabilities.set(outcome.realmLv, (realmLvProbabilities.get(outcome.realmLv) ?? 0) + bestProbability);
    cumulativeBefore = cumulativeAfter;
  }
  return [...realmLvProbabilities.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([realmLv, probability]) => ({ realmLv, chance: Math.round(probability * 1000) / 10 }))
    .filter((entry) => entry.chance > 0);
}

type TechniqueGenerationWeightedOutcome = TechniqueGenerationRollOutcome & {
  probability: number;
};

function buildSingleRollOutcomeDistribution(playerRealmLv: number): TechniqueGenerationWeightedOutcome[] {
  const outcomeProbabilities = new Map<string, TechniqueGenerationWeightedOutcome>();
  for (const realmOffset of buildAsymmetricOffsetProbabilities(TECHNIQUE_GENERATION_REALM_LV_OFFSET)) {
    const realmLv = Math.max(1, Math.min(127, playerRealmLv + realmOffset.offset));
    const baseGrade = resolveBaseGrade(realmLv);
    const baseIndex = TECHNIQUE_GRADE_ORDER.indexOf(baseGrade);
    for (const gradeOffset of buildAsymmetricOffsetProbabilities(TECHNIQUE_GENERATION_GRADE_OFFSET)) {
      const gradeIndex = Math.max(0, Math.min(TECHNIQUE_GRADE_ORDER.length - 1, baseIndex + gradeOffset.offset));
      const grade = TECHNIQUE_GRADE_ORDER[gradeIndex];
      const key = `${grade}:${realmLv}`;
      const probability = realmOffset.probability * gradeOffset.probability;
      const existing = outcomeProbabilities.get(key);
      if (existing) {
        existing.probability += probability;
      } else {
        outcomeProbabilities.set(key, { grade, realmLv, probability });
      }
    }
  }
  return [...outcomeProbabilities.values()];
}

function buildAsymmetricOffsetProbabilities(maxOffset: number): Array<{ offset: number; probability: number }> {
  if (maxOffset <= 0) {
    return [{ offset: 0, probability: 1 }];
  }
  const result: Array<{ offset: number; probability: number }> = [
    { offset: 0, probability: TECHNIQUE_GENERATION_CENTER_PROBABILITY },
  ];
  const nonCenterProbability = 1 - TECHNIQUE_GENERATION_CENTER_PROBABILITY;
  for (let offset = 1; offset <= maxOffset; offset += 1) {
    const geometricProbability = offset < maxOffset
      ? Math.pow(0.5, offset)
      : Math.pow(0.5, maxOffset - 1);
    result.push({
      offset,
      probability: nonCenterProbability * TECHNIQUE_GENERATION_HIGH_DIRECTION_RATIO * geometricProbability,
    });
    result.push({
      offset: -offset,
      probability: nonCenterProbability * (1 - TECHNIQUE_GENERATION_HIGH_DIRECTION_RATIO) * geometricProbability,
    });
  }
  return result;
}
