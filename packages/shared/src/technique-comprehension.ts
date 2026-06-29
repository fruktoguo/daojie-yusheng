/**
 * 功法领悟与传法的共享公式。
 *
 * 这里仅放纯计算，服务端负责权威推进和持久化，客户端只用于展示。
 */
import type { TechniqueGrade } from './cultivation-types';
import { TECHNIQUE_GRADE_ORDER } from './constants/gameplay/technique';

export const TECHNIQUE_COMPREHENSION_NORMAL_BASE_TICKS = 10;
export const TECHNIQUE_COMPREHENSION_CREATED_BASE_TICKS = 300;
export const TECHNIQUE_TRANSMISSION_RANGE = 2;
export const CREATED_TECHNIQUE_ID_PREFIX = 'gen_';
export const TECHNIQUE_COMPREHENSION_PRE_FOUNDATION_MAX_REALM_LV = 30;
export const TECHNIQUE_COMPREHENSION_PRE_FOUNDATION_LEVEL1_REQUIRED_RATIO = 0.05;
export const TECHNIQUE_COMPREHENSION_PRE_FOUNDATION_LEVEL30_REQUIRED_RATIO = 0.5;

export function isCreatedTechniqueId(techId: string | null | undefined): boolean {
  return typeof techId === 'string' && techId.trim().startsWith(CREATED_TECHNIQUE_ID_PREFIX);
}

export function getTechniqueComprehensionGradeFactor(grade: TechniqueGrade | null | undefined): number {
  const index = grade ? TECHNIQUE_GRADE_ORDER.indexOf(grade) : -1;
  return index >= 0 ? index + 1 : 1;
}

export function getTechniqueComprehensionPreFoundationRequiredRatio(learnerRealmLv: number | null | undefined): number {
  const rawRealmLv = Number(learnerRealmLv);
  if (!Number.isFinite(rawRealmLv)) {
    return 1;
  }
  const realmLv = Math.max(1, Math.floor(rawRealmLv));
  if (realmLv > TECHNIQUE_COMPREHENSION_PRE_FOUNDATION_MAX_REALM_LV) {
    return 1;
  }
  const progress = (realmLv - 1) / (TECHNIQUE_COMPREHENSION_PRE_FOUNDATION_MAX_REALM_LV - 1);
  const ratio = TECHNIQUE_COMPREHENSION_PRE_FOUNDATION_LEVEL1_REQUIRED_RATIO
    + (TECHNIQUE_COMPREHENSION_PRE_FOUNDATION_LEVEL30_REQUIRED_RATIO - TECHNIQUE_COMPREHENSION_PRE_FOUNDATION_LEVEL1_REQUIRED_RATIO) * progress;
  return Math.max(
    TECHNIQUE_COMPREHENSION_PRE_FOUNDATION_LEVEL1_REQUIRED_RATIO,
    Math.min(TECHNIQUE_COMPREHENSION_PRE_FOUNDATION_LEVEL30_REQUIRED_RATIO, ratio),
  );
}

export function getTechniqueComprehensionRealmFactor(techniqueRealmLv: number, learnerRealmLv: number): number {
  const delta = Math.floor(Math.max(1, techniqueRealmLv)) - Math.floor(Math.max(1, learnerRealmLv));
  if (delta > 0) {
    return 1.1 ** delta;
  }
  if (delta < 0) {
    return 0.98 ** Math.abs(delta);
  }
  return 1;
}

export function getTechniqueTransmissionSkillFactor(skillLevel: number, techniqueRealmLv: number): number {
  const delta = Math.floor(Math.max(1, skillLevel)) - Math.floor(Math.max(1, techniqueRealmLv));
  if (delta > 0) {
    return 0.95 ** delta;
  }
  if (delta < 0) {
    return 1.05 ** Math.abs(delta);
  }
  return 1;
}

export interface TechniqueComprehensionProgressBreakdown {
  baseProgress: number;
  progressGain: number;
  difficultyFactor: number;
  techniqueRealmLv: number;
  learnerRealmLv: number;
  learnerTransmissionLevel: number;
  teacherTransmissionLevel?: number;
  realmFactor: number;
  learnerTransmissionFactor: number;
  teacherTransmissionFactor?: number;
  transmissionSpeedRate?: number;
  transmissionSpeedFactor?: number;
}

export function getTechniqueComprehensionProgressDifficultyFactor(input: {
  techniqueRealmLv: number;
  learnerRealmLv: number;
  learnerTransmissionLevel?: number;
  teacherTransmissionLevel?: number;
}): number {
  const techniqueRealmLv = Math.max(1, Math.floor(Number(input.techniqueRealmLv) || 1));
  let factor = getTechniqueComprehensionRealmFactor(techniqueRealmLv, input.learnerRealmLv)
    * getTechniqueTransmissionSkillFactor(input.learnerTransmissionLevel ?? 1, techniqueRealmLv);
  if (input.teacherTransmissionLevel !== undefined) {
    factor *= getTechniqueTransmissionSkillFactor(input.teacherTransmissionLevel, techniqueRealmLv);
  }
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

export function calculateTechniqueComprehensionProgressBreakdown(input: {
  baseProgress: number;
  techniqueRealmLv: number;
  learnerRealmLv: number;
  learnerTransmissionLevel?: number;
  teacherTransmissionLevel?: number;
  transmissionSpeedRate?: number;
}): TechniqueComprehensionProgressBreakdown {
  const baseProgress = Number(input.baseProgress);
  const normalizedBaseProgress = Number.isFinite(baseProgress) && baseProgress > 0 ? baseProgress : 0;
  const techniqueRealmLv = Math.max(1, Math.floor(Number(input.techniqueRealmLv) || 1));
  const learnerRealmLv = Math.max(1, Math.floor(Number(input.learnerRealmLv) || 1));
  const learnerTransmissionLevel = Math.max(1, Math.floor(Number(input.learnerTransmissionLevel) || 1));
  const teacherTransmissionLevel = input.teacherTransmissionLevel === undefined
    ? undefined
    : Math.max(1, Math.floor(Number(input.teacherTransmissionLevel) || 1));
  const realmFactor = getTechniqueComprehensionRealmFactor(techniqueRealmLv, learnerRealmLv);
  const learnerTransmissionFactor = getTechniqueTransmissionSkillFactor(learnerTransmissionLevel, techniqueRealmLv);
  const teacherTransmissionFactor = teacherTransmissionLevel === undefined
    ? undefined
    : getTechniqueTransmissionSkillFactor(teacherTransmissionLevel, techniqueRealmLv);
  const rawDifficultyFactor = realmFactor
    * learnerTransmissionFactor
    * (teacherTransmissionFactor ?? 1);
  const difficultyFactor = Number.isFinite(rawDifficultyFactor) && rawDifficultyFactor > 0
    ? rawDifficultyFactor
    : 1;
  const transmissionSpeedRate = Math.max(0, Number(input.transmissionSpeedRate) || 0);
  const transmissionSpeedFactor = 1 + transmissionSpeedRate;
  return {
    baseProgress: normalizedBaseProgress,
    progressGain: normalizedBaseProgress > 0 ? Math.max(0, normalizedBaseProgress / difficultyFactor * transmissionSpeedFactor) : 0,
    difficultyFactor,
    techniqueRealmLv,
    learnerRealmLv,
    learnerTransmissionLevel,
    ...(teacherTransmissionLevel === undefined ? {} : { teacherTransmissionLevel }),
    realmFactor,
    learnerTransmissionFactor,
    ...(teacherTransmissionFactor === undefined ? {} : { teacherTransmissionFactor }),
    transmissionSpeedRate,
    transmissionSpeedFactor,
  };
}

export function calculateTechniqueComprehensionProgressGain(input: {
  baseProgress: number;
  techniqueRealmLv: number;
  learnerRealmLv: number;
  learnerTransmissionLevel?: number;
  teacherTransmissionLevel?: number;
  transmissionSpeedRate?: number;
}): number {
  const baseProgress = Number(input.baseProgress);
  if (!Number.isFinite(baseProgress) || baseProgress <= 0) {
    return 0;
  }
  return calculateTechniqueComprehensionProgressBreakdown(input).progressGain;
}

export function calculateTechniqueComprehensionRequiredProgress(input: {
  sourceKind: 'normal' | 'created';
  techniqueRealmLv: number;
  grade: TechniqueGrade | null | undefined;
  learnerRealmLv?: number;
  learnerTransmissionLevel?: number;
  teacherTransmissionLevel?: number;
}): number {
  const base = input.sourceKind === 'created'
    ? TECHNIQUE_COMPREHENSION_CREATED_BASE_TICKS
    : TECHNIQUE_COMPREHENSION_NORMAL_BASE_TICKS;
  const techniqueRealmLv = Math.max(1, Math.floor(Number(input.techniqueRealmLv) || 1));
  const required = base
    * techniqueRealmLv
    * getTechniqueComprehensionGradeFactor(input.grade)
    * getTechniqueComprehensionPreFoundationRequiredRatio(input.learnerRealmLv);
  return Math.max(1, Math.ceil(required));
}
