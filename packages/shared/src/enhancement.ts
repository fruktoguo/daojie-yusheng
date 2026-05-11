import type {
  Attributes,
} from './attribute-types';
import type {
  EnhancementMaterialRequirement,
  EnhancementTargetRef,
  PlayerEnhancementJob,
} from './crafting-types';
import type { PlayerSpecialStats } from './cultivation-types';
import type { ItemStack } from './item-runtime-types';
import type { PartialNumericStats } from './numeric';
import { ELEMENT_KEYS, NUMERIC_SCALAR_STAT_KEYS } from './numeric';
import { ATTR_KEYS } from './constants/gameplay/attributes';
import { computeAdjustedCraftTicks } from './craft-duration';
import {
  CRAFT_SUCCESS_HIGHER_LEVEL_MODIFIER_PER_LEVEL,
  CRAFT_SUCCESS_LOWER_LEVEL_MODIFIER_PER_LEVEL,
  applyAsymptoticSuccessModifier,
  computeCraftAdjustedSuccessRate,
} from './craft-success';

import {
  DEFAULT_ENHANCE_LEVEL,
  MAX_ENHANCE_LEVEL,
  ENHANCEMENT_RATE_PER_LEVEL,
  ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL,
  ENHANCEMENT_BASE_JOB_TICKS,
  ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL,
  ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL,
  ENHANCEMENT_ACTION_ID,
  ENHANCEMENT_HAMMER_TAG,
  ENHANCEMENT_SPIRIT_STONE_ITEM_ID,
} from './constants/gameplay/enhancement';

export const ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL = CRAFT_SUCCESS_HIGHER_LEVEL_MODIFIER_PER_LEVEL;
export const ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY = 1 - Math.exp(CRAFT_SUCCESS_LOWER_LEVEL_MODIFIER_PER_LEVEL);
export const EQUIPMENT_REALM_EFFECTIVENESS_PENALTY_PER_LEVEL = 0.05;

export interface EquipmentAttributeEffectivenessBreakdown {
  enhanceLevel: number;
  equipmentRealmLv: number;
  playerRealmLv?: number;
  realmGap: number;
  enhancementPercent: number;
  realmPercent: number;
  effectivePercent: number;
}

export function normalizeEnhanceLevel(value: unknown): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ENHANCE_LEVEL;
  }
  return Math.max(DEFAULT_ENHANCE_LEVEL, Math.floor(Number(value)));
}

export function getEnhancementTargetSuccessRate(targetEnhanceLevel: number): number {
  const level = Math.max(1, Math.floor(Number(targetEnhanceLevel) || 1));
  const index = Math.min(level, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL.length) - 1;
  return Math.max(0, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL[index] ?? 0);
}

export function getEnhancementSpiritStoneCost(itemLevel: number | undefined, hasMaterialCost = false): number {
  const level = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
  return Math.max(1, hasMaterialCost ? Math.floor(level / 10) : Math.ceil(level / 10));
}

export function getEnhancementPercent(level: number | undefined): number {
  const normalized = normalizeEnhanceLevel(level);
  return Math.ceil(100 * ((1 + ENHANCEMENT_RATE_PER_LEVEL) ** normalized));
}

function normalizeEquipmentRealmLv(value: unknown): number {
  return Math.max(1, Math.floor(Number(value) || 1));
}

function normalizeOptionalPlayerRealmLv(value: unknown): number | undefined {
  if (!Number.isFinite(Number(value))) {
    return undefined;
  }
  return Math.max(1, Math.floor(Number(value)));
}

export function getEquipmentRealmEffectiveness(
  playerRealmLv: number | undefined | null,
  equipmentRealmLv: number | undefined | null,
): number {
  const normalizedPlayerRealmLv = normalizeOptionalPlayerRealmLv(playerRealmLv);
  if (normalizedPlayerRealmLv === undefined) {
    return 1;
  }
  const normalizedEquipmentRealmLv = normalizeEquipmentRealmLv(equipmentRealmLv);
  const realmGap = Math.max(0, normalizedEquipmentRealmLv - normalizedPlayerRealmLv);
  return Math.max(0, 1 - realmGap * EQUIPMENT_REALM_EFFECTIVENESS_PENALTY_PER_LEVEL);
}

export function getEquipmentAttributeEffectivenessBreakdown(
  item: Pick<ItemStack, 'enhanceLevel' | 'level'>,
  playerRealmLv?: number | null,
): EquipmentAttributeEffectivenessBreakdown {
  const enhanceLevel = normalizeEnhanceLevel(item.enhanceLevel);
  const equipmentRealmLv = normalizeEquipmentRealmLv(item.level);
  const normalizedPlayerRealmLv = normalizeOptionalPlayerRealmLv(playerRealmLv);
  const realmGap = normalizedPlayerRealmLv === undefined
    ? 0
    : Math.max(0, equipmentRealmLv - normalizedPlayerRealmLv);
  const enhancementPercent = getEnhancementPercent(enhanceLevel);
  const realmPercent = Math.max(0, 100 - realmGap * EQUIPMENT_REALM_EFFECTIVENESS_PENALTY_PER_LEVEL * 100);
  return {
    enhanceLevel,
    equipmentRealmLv,
    playerRealmLv: normalizedPlayerRealmLv,
    realmGap,
    enhancementPercent,
    realmPercent,
    effectivePercent: enhancementPercent * realmPercent / 100,
  };
}

export function formatEnhancedItemName(name: string, level: number | undefined): string {
  const normalized = normalizeEnhanceLevel(level);
  if (normalized <= 0) {
    return name;
  }
  const cleanName = name.replace(/^\+\d+\s+/, '');
  return `+${normalized} ${cleanName}`;
}

export function computeEnhancementJobBaseTicks(itemLevel: number | undefined): number {
  const normalizedLevel = Math.max(1, Math.floor(Number(itemLevel) || 1));
  return ENHANCEMENT_BASE_JOB_TICKS + Math.max(0, normalizedLevel - 1) * ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL;
}

export function computeEnhancementToolSpeedRate(
  toolBaseSpeedRate: number | undefined,
  roleEnhancementLevel: number | undefined,
  targetItemLevel: number | undefined,
): number {
  const baseSpeedRate = Number.isFinite(toolBaseSpeedRate) ? Number(toolBaseSpeedRate) : 0;
  const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
  const levelBonus = Math.max(0, normalizeEnhanceLevel(roleEnhancementLevel) - targetLevel) * ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL;
  return baseSpeedRate + levelBonus;
}

export function computeEnhancementJobTicks(
  itemLevel: number | undefined,
  speedRate: number | undefined,
): number {
  return computeAdjustedCraftTicks(computeEnhancementJobBaseTicks(itemLevel), speedRate);
}

export function applyEnhancementSuccessModifier(
  baseRate: number | undefined,
  modifier: number | undefined,
): number {
  return applyAsymptoticSuccessModifier(baseRate, modifier);
}

export function computeEnhancementAdjustedSuccessRate(
  targetEnhanceLevel: number,
  roleEnhancementLevel: number | undefined,
  targetItemLevel: number | undefined,
  toolSuccessRateModifier = 0,
): number {
  const baseRate = getEnhancementTargetSuccessRate(targetEnhanceLevel);
  return computeCraftAdjustedSuccessRate(baseRate, targetItemLevel, roleEnhancementLevel, toolSuccessRateModifier);
}

function normalizeEnhancementRequirement(value: unknown): EnhancementMaterialRequirement | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<EnhancementMaterialRequirement>;
  const itemId = typeof candidate.itemId === 'string' ? candidate.itemId.trim() : '';
  const count = Math.max(1, Math.floor(Number(candidate.count) || 0));
  if (!itemId || count <= 0) {
    return null;
  }
  return { itemId, count };
}

function normalizeEnhancementTargetRef(value: unknown): EnhancementTargetRef | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<EnhancementTargetRef>;
  if (candidate.source === 'inventory') {
    const slotIndex = Math.floor(Number(candidate.slotIndex));
    if (!Number.isInteger(slotIndex) || slotIndex < 0) {
      return null;
    }
    return { source: 'inventory', slotIndex };
  }
  if (candidate.source === 'equipment' && typeof candidate.slot === 'string') {
    return { source: 'equipment', slot: candidate.slot as EnhancementTargetRef['slot'] };
  }
  return null;
}

export function normalizePlayerEnhancementJob(value: unknown): PlayerEnhancementJob | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<PlayerEnhancementJob>;
  const target = normalizeEnhancementTargetRef(candidate.target);
  const item = candidate.item && typeof candidate.item === 'object'
    ? { ...(candidate.item as ItemStack), enhanceLevel: normalizeEnhanceLevel((candidate.item as ItemStack).enhanceLevel) }
    : null;
  const targetItemId = typeof candidate.targetItemId === 'string' ? candidate.targetItemId.trim() : '';
  const targetItemName = typeof candidate.targetItemName === 'string' ? candidate.targetItemName.trim() : '';
  if (!target || !item || !targetItemId || !targetItemName) {
    return null;
  }
  const totalTicks = Math.max(1, Math.floor(Number(candidate.totalTicks) || 0));
  const remainingTicks = Math.max(0, Math.min(totalTicks, Math.floor(Number(candidate.remainingTicks) || 0)));
  const phase = candidate.phase === 'paused' ? 'paused' : 'enhancing';
  const pausedTicks = phase === 'paused'
    ? Math.max(0, Math.floor(Number(candidate.pausedTicks) || 0))
    : 0;
  return {
    target,
    item,
    targetItemId,
    targetItemName,
    targetItemLevel: Math.max(1, Math.floor(Number(candidate.targetItemLevel) || item.level || 1)),
    currentLevel: normalizeEnhanceLevel(candidate.currentLevel),
    targetLevel: Math.min(MAX_ENHANCE_LEVEL, Math.max(1, Math.floor(Number(candidate.targetLevel) || normalizeEnhanceLevel(candidate.currentLevel) + 1))),
    desiredTargetLevel: Math.max(
      Math.min(MAX_ENHANCE_LEVEL, Math.max(1, Math.floor(Number(candidate.targetLevel) || normalizeEnhanceLevel(candidate.currentLevel) + 1))),
      Math.min(MAX_ENHANCE_LEVEL, Math.floor(Number(candidate.desiredTargetLevel) || 0)),
    ),
    spiritStoneCost: Math.max(0, Math.floor(Number(candidate.spiritStoneCost) || 0)),
    materials: Array.isArray(candidate.materials)
      ? candidate.materials
        .map((entry) => normalizeEnhancementRequirement(entry))
        .filter((entry): entry is EnhancementMaterialRequirement => entry !== null)
      : [],
    protectionUsed: candidate.protectionUsed === true,
    protectionStartLevel: candidate.protectionUsed === true
      ? Math.max(2, Math.floor(Number(candidate.protectionStartLevel) || 0))
      : undefined,
    protectionItemId: typeof candidate.protectionItemId === 'string' && candidate.protectionItemId.trim().length > 0
      ? candidate.protectionItemId.trim()
      : undefined,
    protectionItemName: typeof candidate.protectionItemName === 'string' && candidate.protectionItemName.trim().length > 0
      ? candidate.protectionItemName.trim()
      : undefined,
    protectionItemSignature: typeof candidate.protectionItemSignature === 'string' && candidate.protectionItemSignature.length > 0
      ? candidate.protectionItemSignature
      : undefined,
    phase,
    pausedTicks,
    successRate: Math.max(0, Math.min(1, Number(candidate.successRate) || 0)),
    totalTicks,
    remainingTicks,
    startedAt: Math.max(0, Math.floor(Number(candidate.startedAt) || 0)),
    roleEnhancementLevel: normalizeEnhanceLevel(candidate.roleEnhancementLevel),
    totalSpeedRate: Number.isFinite(candidate.totalSpeedRate) ? Number(candidate.totalSpeedRate) : 0,
  };
}

function scaleEnhancedNumber(value: number, level: number | undefined): number {
  const scaled = value * getEnhancementPercent(level) / 100;
  return Math.ceil((scaled - Number.EPSILON) * 100) / 100;
}

function scaleEnhancedUtilityRate(value: number, level: number | undefined): number {
  const scaled = value * getEnhancementPercent(level) / 100;
  return Math.ceil((scaled - Number.EPSILON) * 10_000) / 10_000;
}

function scaleEquipmentEffectivenessNumber(value: number, multiplier: number): number {
  const scaled = value * multiplier;
  return Math.ceil((scaled - Number.EPSILON) * 100) / 100;
}

function scaleEquipmentEffectivenessUtilityRate(value: number, multiplier: number): number {
  const scaled = value * multiplier;
  return Math.ceil((scaled - Number.EPSILON) * 10_000) / 10_000;
}

function cloneScaledUtilityRate(value: number | undefined, level: number | undefined): number | undefined {
  if (typeof value !== 'number') {
    return value;
  }
  return scaleEnhancedUtilityRate(value, level);
}

export function scaleEnhancedAttributes(
  attrs: Partial<Attributes> | undefined,
  level: number | undefined,
): Partial<Attributes> | undefined {
  const normalizedLevel = normalizeEnhanceLevel(level);
  if (!attrs || normalizedLevel <= 0) {
    return attrs ? { ...attrs } : undefined;
  }
  const scaled: Partial<Attributes> = {};
  for (const key of ATTR_KEYS) {
    const value = attrs[key];
    if (typeof value !== 'number') {
      continue;
    }
    scaled[key] = scaleEnhancedNumber(value, normalizedLevel);
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}

export function scaleEnhancedNumericStats(
  stats: PartialNumericStats | undefined,
  level: number | undefined,
): PartialNumericStats | undefined {
  const normalizedLevel = normalizeEnhanceLevel(level);
  if (!stats || normalizedLevel <= 0) {
    return stats ? JSON.parse(JSON.stringify(stats)) as PartialNumericStats : undefined;
  }
  const scaled: PartialNumericStats = {};
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const value = stats[key];
    if (typeof value !== 'number') {
      continue;
    }
    scaled[key] = scaleEnhancedNumber(value, normalizedLevel);
  }
  if (stats.elementDamageBonus) {
    const group: NonNullable<PartialNumericStats['elementDamageBonus']> = {};
    for (const key of ELEMENT_KEYS) {
      const value = stats.elementDamageBonus[key];
      if (typeof value !== 'number') {
        continue;
      }
      group[key] = scaleEnhancedNumber(value, normalizedLevel);
    }
    if (Object.keys(group).length > 0) {
      scaled.elementDamageBonus = group;
    }
  }
  if (stats.elementDamageReduce) {
    const group: NonNullable<PartialNumericStats['elementDamageReduce']> = {};
    for (const key of ELEMENT_KEYS) {
      const value = stats.elementDamageReduce[key];
      if (typeof value !== 'number') {
        continue;
      }
      group[key] = scaleEnhancedNumber(value, normalizedLevel);
    }
    if (Object.keys(group).length > 0) {
      scaled.elementDamageReduce = group;
    }
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}

export function scaleEquipmentEffectivenessAttributes(
  attrs: Partial<Attributes> | undefined,
  multiplier: number,
): Partial<Attributes> | undefined {
  if (!attrs) {
    return undefined;
  }
  const normalizedMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
  const scaled: Partial<Attributes> = {};
  for (const key of ATTR_KEYS) {
    const value = attrs[key];
    if (typeof value !== 'number') {
      continue;
    }
    scaled[key] = scaleEquipmentEffectivenessNumber(value, normalizedMultiplier);
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}

export function scaleEquipmentEffectivenessNumericStats(
  stats: PartialNumericStats | undefined,
  multiplier: number,
): PartialNumericStats | undefined {
  if (!stats) {
    return undefined;
  }
  const normalizedMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
  const scaled: PartialNumericStats = {};
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const value = stats[key];
    if (typeof value !== 'number') {
      continue;
    }
    scaled[key] = scaleEquipmentEffectivenessNumber(value, normalizedMultiplier);
  }
  if (stats.elementDamageBonus) {
    const group: NonNullable<PartialNumericStats['elementDamageBonus']> = {};
    for (const key of ELEMENT_KEYS) {
      const value = stats.elementDamageBonus[key];
      if (typeof value !== 'number') {
        continue;
      }
      group[key] = scaleEquipmentEffectivenessNumber(value, normalizedMultiplier);
    }
    if (Object.keys(group).length > 0) {
      scaled.elementDamageBonus = group;
    }
  }
  if (stats.elementDamageReduce) {
    const group: NonNullable<PartialNumericStats['elementDamageReduce']> = {};
    for (const key of ELEMENT_KEYS) {
      const value = stats.elementDamageReduce[key];
      if (typeof value !== 'number') {
        continue;
      }
      group[key] = scaleEquipmentEffectivenessNumber(value, normalizedMultiplier);
    }
    if (Object.keys(group).length > 0) {
      scaled.elementDamageReduce = group;
    }
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}

export function scaleEquipmentEffectivenessSpecialStats(
  stats: Partial<Pick<PlayerSpecialStats, 'comprehension' | 'luck'>> | undefined,
  multiplier: number,
): Partial<Pick<PlayerSpecialStats, 'comprehension' | 'luck'>> | undefined {
  if (!stats) {
    return undefined;
  }
  const normalizedMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
  const scaled: Partial<Pick<PlayerSpecialStats, 'comprehension' | 'luck'>> = {};
  const comprehension = stats.comprehension;
  const luck = stats.luck;
  if (typeof comprehension === 'number') {
    scaled.comprehension = scaleEquipmentEffectivenessNumber(comprehension, normalizedMultiplier);
  }
  if (typeof luck === 'number') {
    scaled.luck = scaleEquipmentEffectivenessNumber(luck, normalizedMultiplier);
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}

export function applyEnhancementToItemStack(item: ItemStack): ItemStack {
  const enhanceLevel = normalizeEnhanceLevel(item.enhanceLevel);
  if (enhanceLevel <= 0 || item.type !== 'equipment') {
    return {
      ...item,
      enhanceLevel,
      name: formatEnhancedItemName(item.name, enhanceLevel),
    };
  }
  return {
    ...item,
    enhanceLevel,
    name: formatEnhancedItemName(item.name, enhanceLevel),
    equipAttrs: scaleEnhancedAttributes(item.equipAttrs, enhanceLevel),
    equipStats: scaleEnhancedNumericStats(item.equipStats, enhanceLevel),
    equipValueStats: scaleEnhancedNumericStats(item.equipValueStats, enhanceLevel),
    alchemySuccessRate: cloneScaledUtilityRate(item.alchemySuccessRate, enhanceLevel),
    alchemySpeedRate: cloneScaledUtilityRate(item.alchemySpeedRate, enhanceLevel),
    enhancementSuccessRate: cloneScaledUtilityRate(item.enhancementSuccessRate, enhanceLevel),
    enhancementSpeedRate: cloneScaledUtilityRate(item.enhancementSpeedRate, enhanceLevel),
    miningDamageRate: cloneScaledUtilityRate(item.miningDamageRate, enhanceLevel),
  };
}

export function applyEquipmentAttributeEffectivenessToItemStack(
  item: ItemStack,
  playerRealmLv?: number | null,
): ItemStack {
  const enhancedItem = applyEnhancementToItemStack(item);
  if (enhancedItem.type !== 'equipment') {
    return enhancedItem;
  }
  const realmMultiplier = getEquipmentRealmEffectiveness(playerRealmLv, enhancedItem.level);
  if (realmMultiplier >= 1) {
    return enhancedItem;
  }
  return {
    ...enhancedItem,
    equipAttrs: scaleEquipmentEffectivenessAttributes(enhancedItem.equipAttrs, realmMultiplier),
    equipStats: scaleEquipmentEffectivenessNumericStats(enhancedItem.equipStats, realmMultiplier),
    equipValueStats: scaleEquipmentEffectivenessNumericStats(enhancedItem.equipValueStats, realmMultiplier),
    equipSpecialStats: scaleEquipmentEffectivenessSpecialStats(enhancedItem.equipSpecialStats, realmMultiplier),
    alchemySuccessRate: typeof enhancedItem.alchemySuccessRate === 'number' ? scaleEquipmentEffectivenessUtilityRate(enhancedItem.alchemySuccessRate, realmMultiplier) : enhancedItem.alchemySuccessRate,
    alchemySpeedRate: typeof enhancedItem.alchemySpeedRate === 'number' ? scaleEquipmentEffectivenessUtilityRate(enhancedItem.alchemySpeedRate, realmMultiplier) : enhancedItem.alchemySpeedRate,
    enhancementSuccessRate: typeof enhancedItem.enhancementSuccessRate === 'number' ? scaleEquipmentEffectivenessUtilityRate(enhancedItem.enhancementSuccessRate, realmMultiplier) : enhancedItem.enhancementSuccessRate,
    enhancementSpeedRate: typeof enhancedItem.enhancementSpeedRate === 'number' ? scaleEquipmentEffectivenessUtilityRate(enhancedItem.enhancementSpeedRate, realmMultiplier) : enhancedItem.enhancementSpeedRate,
    miningDamageRate: typeof enhancedItem.miningDamageRate === 'number' ? scaleEquipmentEffectivenessUtilityRate(enhancedItem.miningDamageRate, realmMultiplier) : enhancedItem.miningDamageRate,
  };
}
