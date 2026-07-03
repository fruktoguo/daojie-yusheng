/**
 * 功法书分解与抄录的共享公式。
 */
import type { TechniqueGrade } from './cultivation-types';
import {
  TECHNIQUE_BOOK_CRAFT_FRAGMENT_COST_MULTIPLIER,
  TECHNIQUE_BOOK_DECOMPOSE_FRAGMENT_BASE,
  TECHNIQUE_GRADE_ORDER,
} from './constants/gameplay/technique';

export function getTechniqueGradePower(grade: TechniqueGrade | null | undefined): number {
  const index = grade ? TECHNIQUE_GRADE_ORDER.indexOf(grade) : -1;
  return 2 ** Math.max(0, index);
}

export function calculateTechniqueBookDecomposeFragments(input: {
  realmLv?: number | null;
  grade?: TechniqueGrade | null;
  maxLevel?: number | null;
  totalMaxLevel?: number | null;
}): number {
  const realmLv = Math.max(1, Math.floor(Number(input.realmLv) || 1));
  const totalMaxLevel = Number.isFinite(Number(input.totalMaxLevel))
    ? Math.max(1, Math.floor(Number(input.totalMaxLevel)))
    : realmLv;
  const maxLevelInput = Number.isFinite(Number(input.maxLevel))
    ? Math.max(1, Math.floor(Number(input.maxLevel)))
    : totalMaxLevel;
  const effectiveLevel = Math.max(1, Math.min(totalMaxLevel, maxLevelInput));
  const fullFragments = Math.max(1, Math.floor(realmLv * getTechniqueGradePower(input.grade) * TECHNIQUE_BOOK_DECOMPOSE_FRAGMENT_BASE));
  const levelFactor = totalMaxLevel <= 1
    ? 1
    : 0.5 + 0.5 * ((effectiveLevel - 1) / (totalMaxLevel - 1));
  return Math.max(1, Math.round(fullFragments * levelFactor));
}

export function calculateTechniqueBookCraftFragmentCost(input: {
  realmLv?: number | null;
  grade?: TechniqueGrade | null;
  maxLevel?: number | null;
  totalMaxLevel?: number | null;
}): number {
  return calculateTechniqueBookDecomposeFragments(input) * TECHNIQUE_BOOK_CRAFT_FRAGMENT_COST_MULTIPLIER;
}
