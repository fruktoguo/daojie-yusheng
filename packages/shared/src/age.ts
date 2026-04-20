import { DEFAULT_BONE_AGE_YEARS, GAME_YEAR_DAYS } from './constants/gameplay/core';
import { GAME_DAY_TICKS } from './constants/gameplay/world';

/** 角色寿命信息：记录角色当前年龄换算所需的基础输入。 */
export interface CharacterChronologyState {
/**
 * boneAgeBaseYears：boneAgeBaseYear相关字段。
 */

  boneAgeBaseYears?: number;  
  /**
 * lifeElapsedTicks：lifeElapsedtick相关字段。
 */

  lifeElapsedTicks?: number;
}

/** 角色年龄快照：把骨龄和生存时长换算成年龄展示。 */
export interface CharacterAgeSnapshot {
/**
 * totalDays：totalDay相关字段。
 */

  totalDays: number;  
  /**
 * years：year相关字段。
 */

  years: number;  
  /**
 * days：day相关字段。
 */

  days: number;  
  /**
 * totalYears：totalYear相关字段。
 */

  totalYears: number;
}

/** 角色剩余寿命快照：换算为剩余天数和是否逝世。 */
export interface CharacterRemainingLifespanSnapshot {
/**
 * totalDays：totalDay相关字段。
 */

  totalDays: number;  
  /**
 * years：year相关字段。
 */

  years: number;  
  /**
 * days：day相关字段。
 */

  days: number;  
  /**
 * expired：expired相关字段。
 */

  expired: boolean;
}

/** normalizeBoneAgeBaseYears：规范化Bone Age基础Years。 */
export function normalizeBoneAgeBaseYears(value: unknown): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value)) {
    return DEFAULT_BONE_AGE_YEARS;
  }
  return Math.max(0, Math.floor(Number(value)));
}

/** normalizeLifeElapsedTicks：规范化Life Elapsed Ticks。 */
export function normalizeLifeElapsedTicks(value: unknown): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Number(value));
}

/** normalizeLifespanYears：规范化Lifespan Years。 */
export function normalizeLifespanYears(value: unknown): number | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(Number(value));
  return normalized > 0 ? normalized : null;
}

/** resolveLifeElapsedDays：解析Life Elapsed Days。 */
export function resolveLifeElapsedDays(lifeElapsedTicks: number): number {
  return Math.floor(normalizeLifeElapsedTicks(lifeElapsedTicks) / GAME_DAY_TICKS);
}

/** resolveCharacterAge：解析Character Age。 */
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

/** resolveRemainingLifespan：解析Remaining Lifespan。 */
export function resolveRemainingLifespan(
  state: CharacterChronologyState,
  lifespanYears: unknown,
): CharacterRemainingLifespanSnapshot | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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




