import type { PlayerState } from '../../types';

type SkillEnabledEntry = {
  skillEnabled?: boolean;
};

/** 玩家默认可启用的技能数量。 */
export const PLAYER_BASE_ENABLED_SKILL_SLOTS = 4;

/** 玩家每提升多少级可额外获得一个技能栏位。 */
export const PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP = 3;

/** 根据玩家等级计算可启用的技能数量。 */
export function getPlayerEnabledSkillSlotLimitByLevel(level: number | undefined): number {
  const normalizedLevel = Number.isFinite(level) ? Math.max(1, Math.floor(Number(level))) : 1;
  return PLAYER_BASE_ENABLED_SKILL_SLOTS + Math.floor((normalizedLevel - 1) / PLAYER_ENABLED_SKILL_SLOT_LEVEL_STEP);
}

/** 根据玩家状态解析当前可启用的技能数量。 */
export function resolvePlayerSkillSlotLimit(
  player: Pick<PlayerState, 'realmLv' | 'realm'> | null | undefined,
): number {
  return getPlayerEnabledSkillSlotLimitByLevel(player?.realm?.realmLv ?? player?.realmLv);
}

/** 统计当前已启用的技能数量。 */
export function countEnabledSkillEntries<T extends SkillEnabledEntry>(entries: readonly T[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.skillEnabled !== false) {
      count += 1;
    }
  }
  return count;
}

/** 按顺位裁剪启用技能数量，超出上限的技能会自动禁用。 */
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
