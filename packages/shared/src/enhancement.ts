import type { Attributes, ItemStack } from './types';
import type { PartialNumericStats } from './numeric';
import { ELEMENT_KEYS, NUMERIC_SCALAR_STAT_KEYS } from './numeric';
import { ATTR_KEYS } from './constants/gameplay/attributes';

export const DEFAULT_ENHANCE_LEVEL = 0;
export const ENHANCEMENT_RATE_PER_LEVEL = 0.05;
export const ENHANCEMENT_BASE_SUCCESS_RATE = 0.5;
export const ENHANCEMENT_SUCCESS_RATE_STEP = 0.05;
export const ENHANCEMENT_SUCCESS_RATE_REDUCTION_EVERY = 2;
export const ENHANCEMENT_BASE_ACTION_COOLDOWN_TICKS = 5;
export const ENHANCEMENT_ACTION_ID = 'enhancement:open';
export const ENHANCEMENT_HAMMER_TAG = 'enhancement_hammer';
export const ENHANCEMENT_SPIRIT_STONE_ITEM_ID = 'spirit_stone';

export function normalizeEnhanceLevel(value: unknown): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ENHANCE_LEVEL;
  }
  return Math.max(DEFAULT_ENHANCE_LEVEL, Math.floor(Number(value)));
}

export function getEnhancementTargetSuccessRate(targetEnhanceLevel: number): number {
  const level = Math.max(1, Math.floor(Number(targetEnhanceLevel) || 1));
  const reductionSteps = Math.floor((level - 1) / ENHANCEMENT_SUCCESS_RATE_REDUCTION_EVERY);
  return Math.max(0, ENHANCEMENT_BASE_SUCCESS_RATE - reductionSteps * ENHANCEMENT_SUCCESS_RATE_STEP);
}

export function getEnhancementSpiritStoneCost(itemLevel: number | undefined): number {
  const level = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
  return Math.max(1, Math.ceil(level / 10));
}

export function getEnhancementPercent(level: number | undefined): number {
  const normalized = normalizeEnhanceLevel(level);
  return Math.ceil(100 * ((1 + ENHANCEMENT_RATE_PER_LEVEL) ** normalized));
}

export function formatEnhancedItemName(name: string, level: number | undefined): string {
  const normalized = normalizeEnhanceLevel(level);
  if (normalized <= 0) {
    return name;
  }
  const cleanName = name.replace(/^\+\d+\s+/, '');
  return `+${normalized} ${cleanName}`;
}

export function computeEnhancementActionCooldownTicks(speedRate: number | undefined): number {
  const normalized = Number.isFinite(speedRate) ? Number(speedRate) : 0;
  return Math.max(1, Math.ceil(ENHANCEMENT_BASE_ACTION_COOLDOWN_TICKS * Math.max(0.05, 1 - normalized)));
}

function scaleEnhancedNumber(value: number, level: number | undefined): number {
  return Math.ceil(value * getEnhancementPercent(level) / 100);
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
  };
}
