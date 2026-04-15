import { DEFAULT_BONE_AGE_YEARS, GAME_DAY_TICKS, GAME_YEAR_DAYS } from './constants';

/** CharacterChronologyState：定义该接口的能力与字段约束。 */
export interface CharacterChronologyState {
  boneAgeBaseYears?: number;
  lifeElapsedTicks?: number;
}

/** CharacterAgeSnapshot：定义该接口的能力与字段约束。 */
export interface CharacterAgeSnapshot {
/** totalDays：定义该变量以承载业务值。 */
  totalDays: number;
/** years：定义该变量以承载业务值。 */
  years: number;
/** days：定义该变量以承载业务值。 */
  days: number;
/** totalYears：定义该变量以承载业务值。 */
  totalYears: number;
}

/** CharacterRemainingLifespanSnapshot：定义该接口的能力与字段约束。 */
export interface CharacterRemainingLifespanSnapshot {
/** totalDays：定义该变量以承载业务值。 */
  totalDays: number;
/** years：定义该变量以承载业务值。 */
  years: number;
/** days：定义该变量以承载业务值。 */
  days: number;
/** expired：定义该变量以承载业务值。 */
  expired: boolean;
}

/** normalizeBoneAgeBaseYears：执行对应的业务逻辑。 */
export function normalizeBoneAgeBaseYears(value: unknown): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BONE_AGE_YEARS;
  }
  return Math.max(0, Math.floor(Number(value)));
}

/** normalizeLifeElapsedTicks：执行对应的业务逻辑。 */
export function normalizeLifeElapsedTicks(value: unknown): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Number(value));
}

/** normalizeLifespanYears：执行对应的业务逻辑。 */
export function normalizeLifespanYears(value: unknown): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
/** normalized：定义该变量以承载业务值。 */
  const normalized = Math.floor(Number(value));
  return normalized > 0 ? normalized : null;
}

/** resolveLifeElapsedDays：执行对应的业务逻辑。 */
export function resolveLifeElapsedDays(lifeElapsedTicks: number): number {
  return Math.floor(normalizeLifeElapsedTicks(lifeElapsedTicks) / GAME_DAY_TICKS);
}

/** resolveCharacterAge：执行对应的业务逻辑。 */
export function resolveCharacterAge(state: CharacterChronologyState): CharacterAgeSnapshot {
/** baseYears：定义该变量以承载业务值。 */
  const baseYears = normalizeBoneAgeBaseYears(state.boneAgeBaseYears);
/** livedDays：定义该变量以承载业务值。 */
  const livedDays = resolveLifeElapsedDays(state.lifeElapsedTicks ?? 0);
/** totalDays：定义该变量以承载业务值。 */
  const totalDays = baseYears * GAME_YEAR_DAYS + livedDays;
  return {
    totalDays,
    years: Math.floor(totalDays / GAME_YEAR_DAYS),
    days: totalDays % GAME_YEAR_DAYS,
    totalYears: totalDays / GAME_YEAR_DAYS,
  };
}

/** resolveRemainingLifespan：执行对应的业务逻辑。 */
export function resolveRemainingLifespan(
  state: CharacterChronologyState,
  lifespanYears: unknown,
): CharacterRemainingLifespanSnapshot | null {
/** normalizedLifespanYears：定义该变量以承载业务值。 */
  const normalizedLifespanYears = normalizeLifespanYears(lifespanYears);
  if (normalizedLifespanYears == null) {
    return null;
  }

/** age：定义该变量以承载业务值。 */
  const age = resolveCharacterAge(state);
/** totalDays：定义该变量以承载业务值。 */
  const totalDays = Math.max(0, normalizedLifespanYears * GAME_YEAR_DAYS - age.totalDays);
  return {
    totalDays,
    years: Math.floor(totalDays / GAME_YEAR_DAYS),
    days: totalDays % GAME_YEAR_DAYS,
/** expired：定义该变量以承载业务值。 */
    expired: totalDays <= 0,
  };
}

