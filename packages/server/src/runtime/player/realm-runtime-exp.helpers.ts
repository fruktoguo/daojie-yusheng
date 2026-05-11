import { TECHNIQUE_GRADE_ORDER } from '@mud/shared';

export interface RawRealmLevelEntry {
  realmLv?: unknown;
  expToNext?: unknown;
  grade?: unknown;
  displayName?: unknown;
  name?: unknown;
  phaseName?: unknown;
  path?: unknown;
  review?: unknown;
  lifespanYears?: unknown;
}

export interface RuntimeRealmLevelEntry {
  realmLv: number;
  runtimeExpToNext: number;
  grade: string;
  displayName: string;
  name: string;
  phaseName: string | null;
  path: 'martial' | 'immortal' | 'ascended';
  review?: string;
  lifespanYears: number | null;
}

export function normalizeRuntimeRealmExpMultiplier(value: unknown): number {
  return normalizeNonNegativeInteger(value, 1);
}

export function normalizeRuntimeRealmLevelEntry(
  entry: RawRealmLevelEntry,
  expMultiplier: unknown,
): RuntimeRealmLevelEntry | null {
  const realmLv = normalizeNonNegativeInteger(entry?.realmLv, 0);
  if (realmLv <= 0) {
    return null;
  }
  const runtimeExpToNext = resolveRuntimeRealmExpToNext(entry?.expToNext, expMultiplier);
  return {
    realmLv,
    runtimeExpToNext,
    grade: typeof entry?.grade === 'string' && entry.grade.trim() ? entry.grade.trim() : 'mortal',
    displayName: typeof entry?.displayName === 'string' && entry.displayName.trim() ? entry.displayName.trim() : `realmLv ${realmLv}`,
    name: typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : `realmLv ${realmLv}`,
    phaseName: typeof entry?.phaseName === 'string' && entry.phaseName.trim() ? entry.phaseName.trim() : null,
    path: entry?.path === 'immortal' || entry?.path === 'ascended' ? entry.path : 'martial',
    review: typeof entry?.review === 'string' && entry.review.trim() ? entry.review.trim() : undefined,
    lifespanYears: normalizeNullablePositiveInteger(entry?.lifespanYears),
  };
}

export function resolveRuntimeRealmExpToNext(rawExpToNext: unknown, expMultiplier: unknown): number {
  return normalizeNonNegativeInteger(rawExpToNext, 0) * normalizeRuntimeRealmExpMultiplier(expMultiplier);
}

export function getRuntimeRealmGradeIndex(grade: unknown): number {
  const normalizedGrade = typeof grade === 'string' && grade.trim() ? grade.trim() : 'mortal';
  return Math.max(0, (TECHNIQUE_GRADE_ORDER as readonly string[]).indexOf(normalizedGrade));
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.max(0, Math.floor(numeric));
}

function normalizeNullablePositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
}
