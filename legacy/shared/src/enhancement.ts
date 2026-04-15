import type {
  Attributes,
  EnhancementMaterialRequirement,
  EnhancementTargetRef,
  ItemStack,
  PlayerEnhancementJob,
} from './types';
import type { PartialNumericStats } from './numeric';
import { ELEMENT_KEYS, NUMERIC_SCALAR_STAT_KEYS } from './numeric';
import { ATTR_KEYS } from './constants/gameplay/attributes';
import { computeAdjustedCraftTicks } from './craft-duration';

export const DEFAULT_ENHANCE_LEVEL = 0;
export const MAX_ENHANCE_LEVEL = 20;
export const ENHANCEMENT_RATE_PER_LEVEL = 0.1;
export const ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL = [
  0.5,
  0.45,
  0.45,
  0.4,
  0.4,
  0.4,
  0.35,
  0.35,
  0.35,
  0.35,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
  0.3,
] as const;
export const ENHANCEMENT_BASE_JOB_TICKS = 5;
export const ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL = 1;
export const ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL = 0.02;
export const ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL = 0.002;
export const ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY = 0.1;
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

/** applyEnhancementSuccessModifier：按 50% 枢轴应用强化成功率修正。 */
export function applyEnhancementSuccessModifier(
  baseRate: number | undefined,
  modifier: number | undefined,
): number {
  const normalizedBaseRate = Math.max(0, Math.min(1, Number.isFinite(baseRate) ? Number(baseRate) : 0));
  if (normalizedBaseRate <= 0 || normalizedBaseRate >= 1) {
    return normalizedBaseRate;
  }
  const normalizedModifier = Number.isFinite(modifier) ? Number(modifier) : 0;
  if (normalizedModifier === 0) {
    return normalizedBaseRate;
  }
  if (normalizedModifier < 0) {
    return normalizedBaseRate / (1 + Math.abs(normalizedModifier));
  }

  const factor = 1 + normalizedModifier;
  if (normalizedBaseRate <= 0.5) {
    const scaledSuccess = normalizedBaseRate * factor;
    if (scaledSuccess <= 0.5) {
      return scaledSuccess;
    }
    return 1 - (0.25 / scaledSuccess);
  }
  return 1 - ((1 - normalizedBaseRate) / factor);
}

export function computeEnhancementAdjustedSuccessRate(
  targetEnhanceLevel: number,
  roleEnhancementLevel: number | undefined,
  targetItemLevel: number | undefined,
  toolSuccessRateModifier = 0,
): number {
  const baseRate = getEnhancementTargetSuccessRate(targetEnhanceLevel);
  const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
  const lowerLevelGap = Math.max(0, targetLevel - normalizeEnhanceLevel(roleEnhancementLevel));
  const upperLevelGap = Math.max(0, normalizeEnhanceLevel(roleEnhancementLevel) - targetLevel);
  const adjustedBaseRate = baseRate * ((1 - ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY) ** lowerLevelGap);
  const totalSuccessModifier = toolSuccessRateModifier + (upperLevelGap * ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL);
  return applyEnhancementSuccessModifier(adjustedBaseRate, totalSuccessModifier);
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
  };
}
