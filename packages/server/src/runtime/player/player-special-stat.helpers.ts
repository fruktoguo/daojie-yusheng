import {
  applyEquipmentAttributeEffectivenessToItemStack,
  calcTechniqueFinalSpecialStatBonus,
} from '@mud/shared';

function normalizePositiveInteger(value: unknown): number {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function resolvePlayerTechniqueStates(player: any): any[] {
  if (Array.isArray(player?.techniques?.techniques)) {
    return player.techniques.techniques;
  }
  if (Array.isArray(player?.techniques)) {
    return player.techniques;
  }
  return [];
}

function resolveEquipmentLuck(player: any): number {
  const realmLv = Math.max(1, Math.floor(Number(player?.realm?.realmLv ?? player?.realmLv ?? 1) || 1));
  let total = 0;
  for (const entry of player?.equipment?.slots ?? []) {
    const item = entry?.item;
    if (!item) {
      continue;
    }
    const effectiveItem = applyEquipmentAttributeEffectivenessToItemStack(item, realmLv);
    total += normalizePositiveInteger(effectiveItem.equipSpecialStats?.luck);
  }
  return total;
}

export function resolvePlayerDailySignInFortuneLuck(player: any, nowMs = Date.now()): number {
  const expireAt = Number(player?.dailySignInFortuneExpireAt ?? 0);
  if (!Number.isFinite(expireAt) || expireAt <= nowMs) {
    return 0;
  }
  return Math.trunc(Number(player?.dailySignInFortuneLuck ?? 0) || 0);
}

export function resolvePlayerEffectiveLuck(player: any): number {
  const techniqueSpecialStats = calcTechniqueFinalSpecialStatBonus(resolvePlayerTechniqueStates(player));
  const total = normalizePositiveInteger(player?.luck)
    + normalizePositiveInteger(techniqueSpecialStats.luck)
    + resolveEquipmentLuck(player)
    + Math.trunc(Number(player?.fengShuiLuck ?? 0) || 0)
    + resolvePlayerDailySignInFortuneLuck(player);
  return Math.max(0, total);
}
