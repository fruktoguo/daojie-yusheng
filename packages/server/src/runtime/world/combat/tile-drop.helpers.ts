import {
  MINING_EXP_BASE_ACTION_TICKS,
  applyEquipmentAttributeEffectivenessToItemStack,
  computeCraftSkillExpGain,
  getOreMiningLevel,
  getMiningDamageMultiplier,
  isOreMinableTileType,
} from '@mud/shared';
import { resolveCraftSkillExpToNextByLevel } from '../../craft/craft-skill-exp.helpers';
import { buildStructuredNotice } from '../structured-notice.helpers';
import * as worldRuntimeNormalizationHelpers from '../world-runtime.normalization.helpers';

const { formatItemStackLabel } = worldRuntimeNormalizationHelpers;

export function resolveMiningAdjustedTileDamage(input: {
  attacker: any;
  tileType: unknown;
  baseDamage: unknown;
}): {
  damage: number;
  isOreTile: boolean;
} {
  const baseDamage = Math.max(0, Math.round(Number(input.baseDamage) || 0));
  const isOreTile = isOreMinableTileType(input.tileType as any);
  if (baseDamage <= 0) {
    return { damage: baseDamage, isOreTile };
  }

  const miningLevel = input.attacker?.miningSkill?.level ?? 0;
  const equippedWeapon = resolveEquippedWeapon(input.attacker);
  const weapon = equippedWeapon
    ? applyEquipmentAttributeEffectivenessToItemStack(equippedWeapon, input.attacker?.realm?.realmLv ?? input.attacker?.realmLv)
    : null;
  const miningDamageRate = weapon?.miningDamageRate ?? 0;
  const levelMultiplier = getMiningDamageMultiplier(miningLevel);
  const equipMultiplier = 1 + Math.max(0, Number(miningDamageRate) || 0);
  return {
    damage: Math.max(1, Math.round(baseDamage * levelMultiplier * equipMultiplier)),
    isOreTile,
  };
}

function resolveEquippedWeapon(attacker: any): any | null {
  const slotWeapon = Array.isArray(attacker?.equipment?.slots)
    ? attacker.equipment.slots.find((entry: any) => entry?.slot === 'weapon')?.item
    : null;
  return slotWeapon ?? attacker?.equipment?.weapon ?? null;
}

export function applyMiningExpForTileDamage(input: {
  attacker: any;
  tileType: unknown;
  appliedDamage: unknown;
  playerRuntimeService: any;
}): number {
  if (!isOreMinableTileType(input.tileType as any)) {
    return 0;
  }
  const damage = Math.max(0, Math.round(Number(input.appliedDamage) || 0));
  if (damage <= 0) {
    return 0;
  }
  const skill = input.attacker?.miningSkill;
  if (!skill) {
    return 0;
  }

  const oreTileLevel = getOreMiningLevel(input.tileType as any) ?? 1;
  const realmLevel = input.attacker?.realmLv ?? input.attacker?.realm?.realmLv ?? 1;
  const miningLevel = Math.max(1, Math.floor(Number(skill.level) || 1));
  const referenceLevel = Math.min(oreTileLevel, miningLevel, realmLevel);
  const gain = computeCraftSkillExpGain({
    skillLevel: miningLevel,
    targetLevel: referenceLevel,
    baseActionTicks: MINING_EXP_BASE_ACTION_TICKS,
    getExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(input.playerRuntimeService, level),
    successCount: 1,
    failureCount: 0,
    successMultiplier: 1,
  }).finalGain;

  if (gain <= 0) {
    return 0;
  }

  skill.level = miningLevel;
  skill.exp = Math.max(0, Number(skill.exp) || 0) + gain;
  skill.expToNext = Math.max(0, Math.floor(Number(skill.expToNext) || 0));
  while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
    skill.exp -= skill.expToNext;
    skill.level += 1;
    skill.expToNext = resolveCraftSkillExpToNextByLevel(input.playerRuntimeService, skill.level);
  }
  return gain;
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
  const labels: string[] = [];
  for (const drop of drops) {
    const itemId = typeof drop?.itemId === 'string' ? drop.itemId.trim() : '';
    if (!itemId) {
      continue;
    }
    const count = Math.max(1, Math.trunc(Number(drop?.count) || 1));
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
