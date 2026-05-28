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

export function isCreatedTechniqueId(techId: string | null | undefined): boolean {
  return typeof techId === 'string' && techId.trim().startsWith(CREATED_TECHNIQUE_ID_PREFIX);
}

export function getTechniqueComprehensionGradeFactor(grade: TechniqueGrade | null | undefined): number {
  const index = grade ? TECHNIQUE_GRADE_ORDER.indexOf(grade) : -1;
  return index >= 0 ? index + 1 : 1;
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

export function calculateTechniqueComprehensionProgressGain(input: {
  baseProgress: number;
  techniqueRealmLv: number;
  learnerRealmLv: number;
  learnerTransmissionLevel?: number;
  teacherTransmissionLevel?: number;
}): number {
  const baseProgress = Number(input.baseProgress);
  if (!Number.isFinite(baseProgress) || baseProgress <= 0) {
    return 0;
  }
  const difficultyFactor = getTechniqueComprehensionProgressDifficultyFactor(input);
  return Math.max(0, baseProgress / difficultyFactor);
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
    * getTechniqueComprehensionGradeFactor(input.grade);
  return Math.max(1, Math.ceil(required));
}
