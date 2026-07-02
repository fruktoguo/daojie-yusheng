/**
 * 功法书分解与制造的共享公式。
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
}): number {
  const realmLv = Math.max(1, Math.floor(Number(input.realmLv) || 1));
  const maxLevel = Number.isFinite(Number(input.maxLevel))
    ? Math.max(1, Math.floor(Number(input.maxLevel)))
    : realmLv;
  const effectiveLevel = Math.max(1, Math.min(realmLv, maxLevel));
  return Math.max(1, Math.floor(effectiveLevel * getTechniqueGradePower(input.grade) * TECHNIQUE_BOOK_DECOMPOSE_FRAGMENT_BASE));
}

export function calculateTechniqueBookCraftFragmentCost(input: {
  realmLv?: number | null;
  grade?: TechniqueGrade | null;
  maxLevel?: number | null;
}): number {
  return calculateTechniqueBookDecomposeFragments(input) * TECHNIQUE_BOOK_CRAFT_FRAGMENT_COST_MULTIPLIER;
}
