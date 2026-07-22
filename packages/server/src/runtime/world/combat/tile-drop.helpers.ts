/**
 * 本文件属于世界运行时战斗边界，负责战斗指令、表现投影或掉落辅助逻辑。
 *
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要的表现字段。
 */
import {
  MINING_EXP_BASE_ACTION_TICKS,
  applyCraftOutputRate,
  computeCraftSkillExpGain,
  computeLuckSuccessRateBonus,
  getOreMiningLevel,
  getMiningDamageMultiplier,
  getMiningDropRateBonus,
  isOreMinableTileType,
} from '@mud/shared';
import { resolveCraftSkillExpToNextByLevel } from '../../craft/craft-skill-exp.helpers';
import {
  applyPlayerCraftExpRate,
  resolvePlayerCraftEffectStat,
  resolvePlayerCraftRealmLevel,
} from '../../craft/craft-effect-runtime.helpers';
import { buildStructuredNotice } from '../structured-notice.helpers';
import * as worldRuntimeNormalizationHelpers from '../world-runtime.normalization.helpers';
import { resolvePlayerEffectiveLuck } from '../../player/player-special-stat.helpers';

const { formatItemStackLabel } = worldRuntimeNormalizationHelpers;

export function resolveMiningAdjustedTileDamage(input: {
  attacker: any;
  tileType: unknown;
  baseDamage: unknown;
  miningDamageMultiplier?: number;
}): {
  damage: number;
  isOreTile: boolean;
} {
  const baseDamage = Math.max(0, Math.round(Number(input.baseDamage) || 0));
  const isOreTile = isOreMinableTileType(input.tileType as string | undefined);
  if (baseDamage <= 0) {
    return { damage: baseDamage, isOreTile };
  }

  const multiplier = Number.isFinite(Number(input.miningDamageMultiplier))
    ? Math.max(0, Number(input.miningDamageMultiplier))
    : resolveMiningTileDamageMultiplier(input.attacker);
  return {
    damage: Math.max(1, Math.round(baseDamage * multiplier)),
    isOreTile,
  };
}

/** 同次施法复用挖矿等级和装备对地块伤害的乘区。 */
export function resolveMiningTileDamageMultiplier(attacker: any): number {
  const miningLevel = attacker?.miningSkill?.level ?? 0;
  const miningSpeedRate = resolvePlayerCraftEffectStat(attacker, 'mining', 'speedRate');
  return getMiningDamageMultiplier(miningLevel)
    * (1 + Math.max(0, Number(miningSpeedRate) || 0));
}

export function resolveMiningDropRateBonus(attacker: any): number {
  const miningLevel = attacker?.miningSkill?.level ?? 0;
  const skillBonus = getMiningDropRateBonus(miningLevel);
  const luckBonus = computeLuckSuccessRateBonus(resolvePlayerEffectiveLuck(attacker));
  return skillBonus + luckBonus;
}

export function applyMiningExpForTileDamage(input: {
  attacker: any;
  tileType: unknown;
  appliedDamage: unknown;
  playerRuntimeService: any;
}): { gained: number; changed: boolean } {
  if (!isOreMinableTileType(input.tileType as string | undefined)) {
    return { gained: 0, changed: false };
  }
  const damage = Math.max(0, Math.round(Number(input.appliedDamage) || 0));
  if (damage <= 0) {
    return { gained: 0, changed: false };
  }
  const skill = input.attacker?.miningSkill;
  if (!skill) {
    return { gained: 0, changed: false };
  }

  const oreTileLevel = getOreMiningLevel(input.tileType as string | undefined) ?? 1;
  const miningLevel = Math.max(1, Math.floor(Number(skill.level) || 1));
  const baseGain = computeCraftSkillExpGain({
    playerRealmLevel: resolvePlayerCraftRealmLevel(input.attacker),
    skillLevel: miningLevel,
    targetLevel: oreTileLevel,
    baseActionTicks: MINING_EXP_BASE_ACTION_TICKS,
    getExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(input.playerRuntimeService, level),
    successCount: 1,
    failureCount: 0,
    successMultiplier: 1,
  }).finalGain;
  const gain = applyPlayerCraftExpRate(input.attacker, 'mining', baseGain);

  if (gain <= 0) {
    return { gained: 0, changed: false };
  }

  skill.level = miningLevel;
  skill.exp = Math.max(0, Number(skill.exp) || 0) + gain;
  skill.expToNext = Math.max(0, Math.floor(Number(skill.expToNext) || 0));
  while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
    skill.exp -= skill.expToNext;
    skill.level += 1;
    skill.expToNext = resolveCraftSkillExpToNextByLevel(input.playerRuntimeService, skill.level);
  }
  const realmResult = input.playerRuntimeService?.playerProgressionService?.grantCraftRealmExp?.(
    input.attacker,
    gain / 2,
  );
  if (realmResult) {
    input.playerRuntimeService?.applyProgressionResult?.(input.attacker, realmResult);
  }
  return { gained: gain, changed: true };
}

/**
 * 批量结算同次地块技能命中的挖矿经验。
 * 经验仍按目标顺序和升级后的实时技能等级计算，只合并重复公式求值、状态写回与境界经验落账。
 */
export function applyMiningExpForTileDamageBatch(input: {
  attacker: any;
  entries: ReadonlyArray<{ tileType: unknown; appliedDamage: unknown }>;
  playerRuntimeService: any;
}): { gained: number; changed: boolean; hitCount: number } {
  const skill = input.attacker?.miningSkill;
  if (!skill || !Array.isArray(input.entries) || input.entries.length === 0) {
    return { gained: 0, changed: false, hitCount: 0 };
  }

  let miningLevel = Math.max(1, Math.floor(Number(skill.level) || 1));
  let miningExp = Math.max(0, Number(skill.exp) || 0);
  let miningExpToNext = Math.max(0, Math.floor(Number(skill.expToNext) || 0));
  const playerRealmLevel = resolvePlayerCraftRealmLevel(input.attacker);
  const gainBySkillLevel = new Map<number, Map<number, number>>();
  let totalGain = 0;
  let totalCraftRealmGain = 0;
  let hitCount = 0;

  for (const entry of input.entries) {
    if (!isOreMinableTileType(entry?.tileType as string | undefined)) {
      continue;
    }
    const damage = Math.max(0, Math.round(Number(entry?.appliedDamage) || 0));
    if (damage <= 0) {
      continue;
    }
    const oreTileLevel = getOreMiningLevel(entry.tileType as string | undefined) ?? 1;
    let gainByTargetLevel = gainBySkillLevel.get(miningLevel);
    if (!gainByTargetLevel) {
      gainByTargetLevel = new Map<number, number>();
      gainBySkillLevel.set(miningLevel, gainByTargetLevel);
    }
    let gain = gainByTargetLevel.get(oreTileLevel);
    if (gain === undefined) {
      const baseGain = computeCraftSkillExpGain({
        playerRealmLevel,
        skillLevel: miningLevel,
        targetLevel: oreTileLevel,
        baseActionTicks: MINING_EXP_BASE_ACTION_TICKS,
        getExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(input.playerRuntimeService, level),
        successCount: 1,
        failureCount: 0,
        successMultiplier: 1,
      }).finalGain;
      gain = applyPlayerCraftExpRate(input.attacker, 'mining', baseGain);
      gainByTargetLevel.set(oreTileLevel, gain);
    }
    if (gain <= 0) {
      continue;
    }

    hitCount += 1;
    totalGain += gain;
    totalCraftRealmGain += Math.max(0, Math.round(gain / 2));
    miningExp += gain;
    while (miningExpToNext > 0 && miningExp >= miningExpToNext) {
      miningExp -= miningExpToNext;
      miningLevel += 1;
      miningExpToNext = resolveCraftSkillExpToNextByLevel(input.playerRuntimeService, miningLevel);
    }
  }

  if (totalGain <= 0) {
    return { gained: 0, changed: false, hitCount: 0 };
  }
  skill.level = miningLevel;
  skill.exp = miningExp;
  skill.expToNext = miningExpToNext;
  const realmResult = input.playerRuntimeService?.playerProgressionService?.grantCraftRealmExp?.(
    input.attacker,
    totalCraftRealmGain,
  );
  if (realmResult) {
    input.playerRuntimeService?.applyProgressionResult?.(input.attacker, realmResult);
  }
  return { gained: totalGain, changed: true, hitCount };
}

export function resolveTileDamageDropMultiplier(appliedDamage: unknown): number {
  const damage = Math.max(0, Math.trunc(Number(appliedDamage) || 0));
  if (damage <= 0) {
    return 0;
  }
  if (damage < 100) {
    return 0.5;
  }
  let multiplier = 1;
  let threshold = 300;
  while (damage >= threshold) {
    multiplier += 1;
    threshold *= 3;
  }
  return multiplier;
}

export function spawnTileDrops(input: {
  playerId: string;
  tileDrops: unknown;
  deps: any;
}): void {
  const drops = Array.isArray(input.tileDrops) ? input.tileDrops : [];
  if (drops.length <= 0) {
    return;
  }
  const content = input.deps?.contentTemplateRepository;
  const receiveInventoryItem = input.deps?.playerRuntimeService?.receiveInventoryItem;
  if (typeof receiveInventoryItem !== 'function') {
    throw new Error('tile_drop_receive_inventory_item_missing');
  }
  const player = input.deps?.playerRuntimeService?.getPlayer?.(input.playerId);
  const outputRate = resolvePlayerCraftEffectStat(player, 'mining', 'outputRate');
  const outputCountByItemId = new Map<string, number>();
  for (const drop of drops) {
    const itemId = typeof drop?.itemId === 'string' ? drop.itemId.trim() : '';
    if (!itemId) {
      continue;
    }
    const count = applyCraftOutputRate(Math.max(1, Math.trunc(Number(drop?.count) || 1)), outputRate);
    outputCountByItemId.set(itemId, (outputCountByItemId.get(itemId) ?? 0) + count);
  }
  const labels: string[] = [];
  for (const [itemId, count] of outputCountByItemId) {
    const item = typeof content?.createItem === 'function'
      ? content.createItem(itemId, count)
      : null;
    const normalizedItem = item ?? { itemId, count };
    receiveInventoryItem.call(input.deps.playerRuntimeService, input.playerId, normalizedItem);
    labels.push(formatItemStackLabel(normalizedItem));
  }
  if (labels.length <= 0 || typeof input.deps?.queuePlayerNotice !== 'function') {
    return;
  }
  const itemLabel = labels.join('、');
  const notice = buildStructuredNotice('loot', 'notice.loot.tile-drop-inventory', `获得 ${itemLabel}`, {
    vars: { itemLabel },
    pills: [{ key: 'itemLabel', style: 'target' }],
  });
  input.deps.queuePlayerNotice(input.playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
}
