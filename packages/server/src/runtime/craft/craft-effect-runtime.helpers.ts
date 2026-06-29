import {
  applyCraftExpRate,
  readCraftEffectStat,
  type CraftEffectKind,
  type CraftEffectSkillKind,
} from '@mud/shared';

export function resolvePlayerCraftEffectStat(
  player: any,
  skillKind: CraftEffectSkillKind,
  effectKind: CraftEffectKind,
): number {
  return readCraftEffectStat(player?.attrs?.craftEffectStats, skillKind, effectKind);
}

export function applyPlayerCraftExpRate(player: any, skillKind: CraftEffectSkillKind, baseGain: number): number {
  return applyCraftExpRate(
    baseGain,
    resolvePlayerCraftEffectStat(player, skillKind, 'expRate'),
  );
}
