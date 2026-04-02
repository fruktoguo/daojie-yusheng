import { DEFAULT_BONE_AGE_YEARS, GAME_DAY_TICKS, GAME_YEAR_DAYS } from './constants';

export interface CharacterChronologyState {
  boneAgeBaseYears?: number;
  lifeElapsedTicks?: number;
}

export interface CharacterAgeSnapshot {
  totalDays: number;
  years: number;
  days: number;
  totalYears: number;
}

export interface CharacterRemainingLifespanSnapshot {
  totalDays: number;
  years: number;
  days: number;
  expired: boolean;
}

export function normalizeBoneAgeBaseYears(value: unknown): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BONE_AGE_YEARS;
  }
  return Math.max(0, Math.floor(Number(value)));
}

export function normalizeLifeElapsedTicks(value: unknown): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Number(value));
}

export function normalizeLifespanYears(value: unknown): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(Number(value));
  return normalized > 0 ? normalized : null;
}

export function resolveLifeElapsedDays(lifeElapsedTicks: number): number {
  return Math.floor(normalizeLifeElapsedTicks(lifeElapsedTicks) / GAME_DAY_TICKS);
}

export function resolveCharacterAge(state: CharacterChronologyState): CharacterAgeSnapshot {
  const baseYears = normalizeBoneAgeBaseYears(state.boneAgeBaseYears);
  const livedDays = resolveLifeElapsedDays(state.lifeElapsedTicks ?? 0);
  const totalDays = baseYears * GAME_YEAR_DAYS + livedDays;
  return {
    totalDays,
    years: Math.floor(totalDays / GAME_YEAR_DAYS),
    days: totalDays % GAME_YEAR_DAYS,
    totalYears: totalDays / GAME_YEAR_DAYS,
  };
}

export function resolveRemainingLifespan(
  state: CharacterChronologyState,
  lifespanYears: unknown,
): CharacterRemainingLifespanSnapshot | null {
  const normalizedLifespanYears = normalizeLifespanYears(lifespanYears);
  if (normalizedLifespanYears == null) {
    return null;
  }

  const age = resolveCharacterAge(state);
  const totalDays = Math.max(0, normalizedLifespanYears * GAME_YEAR_DAYS - age.totalDays);
  return {
    totalDays,
    years: Math.floor(totalDays / GAME_YEAR_DAYS),
    days: totalDays % GAME_YEAR_DAYS,
    expired: totalDays <= 0,
  };
}
