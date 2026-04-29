import type { PlayerState } from '../../player-runtime-types';

type SkillEnabledEntry = {
  skillEnabled?: boolean;
};

export const PLAYER_BASE_ENABLED_SKILL_SLOTS = 4;
export const PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP_EARLY = 1;
export const PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP_MID = 3;
export const PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP_LATE = 5;
export const PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP_ENDGAME = 6;
export const PLAYER_ENABLED_SKILL_SLOT_BONUS_EVERY_SIX_LEVELS = 1;
export const PLAYER_ENABLED_SKILL_SLOT_BONUS_EVERY_TWELVE_LEVELS = 1;
export const PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP = PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP_MID;

/** 遁返命石绑定复活点的行动 id。 */
export const RETURN_TO_SPAWN_ACTION_ID = 'travel:return_spawn';

/** 遁返命石绑定复活点的调息时长（息）。 */
export const RETURN_TO_SPAWN_COOLDOWN_TICKS = 1800;

export function getPlayerEnabledSkillSlotLimitByLevel(level: number | undefined): number {
  const normalizedLevel = Number.isFinite(level) ? Math.max(1, Math.floor(Number(level))) : 1;
  let extraSlots = 0;

  const earlyLevels = Math.min(normalizedLevel, 6);
  extraSlots += Math.max(0, earlyLevels - 1);

  if (normalizedLevel >= 7) {
    extraSlots += Math.floor((Math.min(normalizedLevel, 18) - 6) / PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP_MID);
  }

  if (normalizedLevel >= 19) {
    extraSlots += Math.floor((Math.min(normalizedLevel, 30) - 18) / PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP_LATE);
  }

  if (normalizedLevel >= 31) {
    extraSlots += Math.floor((normalizedLevel - 30) / PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP_ENDGAME);
  }

  extraSlots += Math.floor(normalizedLevel / 6) * PLAYER_ENABLED_SKILL_SLOT_BONUS_EVERY_SIX_LEVELS;
  extraSlots += Math.floor(normalizedLevel / 12) * PLAYER_ENABLED_SKILL_SLOT_BONUS_EVERY_TWELVE_LEVELS;

  return PLAYER_BASE_ENABLED_SKILL_SLOTS + extraSlots;
}

export function resolvePlayerSkillSlotLimit(
  player: Pick<PlayerState, 'realmLv' | 'realm'> | null | undefined,
): number {
  return getPlayerEnabledSkillSlotLimitByLevel(player?.realm?.realmLv ?? player?.realmLv);
}

export function countEnabledSkillEntries<T extends SkillEnabledEntry>(entries: readonly T[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.skillEnabled !== false) {
      count += 1;
    }
  }
  return count;
}

export function enforceSkillEnabledLimit<T extends SkillEnabledEntry>(
  entries: readonly T[],
  limit: number,
): T[] {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  let enabledCount = 0;
  return entries.map((entry) => {
    if (entry.skillEnabled === false) {
      return entry;
    }
    if (enabledCount < normalizedLimit) {
      enabledCount += 1;
      return entry;
    }
    return {
      ...entry,
      skillEnabled: false,
    };
  });
}
