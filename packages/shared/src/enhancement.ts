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
import { applyAsymptoticSuccessModifier } from './craft-success';

/** DEFAULT_ENHANCE_LEVEL：定义该变量以承载业务值。 */
export const DEFAULT_ENHANCE_LEVEL = 0;
/** MAX_ENHANCE_LEVEL：定义该变量以承载业务值。 */
export const MAX_ENHANCE_LEVEL = 20;
/** ENHANCEMENT_RATE_PER_LEVEL：定义该变量以承载业务值。 */
export const ENHANCEMENT_RATE_PER_LEVEL = 0.1;
/** ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL：定义该变量以承载业务值。 */
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
/** ENHANCEMENT_BASE_JOB_TICKS：定义该变量以承载业务值。 */
export const ENHANCEMENT_BASE_JOB_TICKS = 5;
/** ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL：定义该变量以承载业务值。 */
export const ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL = 1;
/** ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL：定义该变量以承载业务值。 */
export const ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL = 0.02;
/** ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL：定义该变量以承载业务值。 */
export const ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL = 0.002;
/** ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY：定义该变量以承载业务值。 */
export const ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY = 0.1;
/** ENHANCEMENT_ACTION_ID：定义该变量以承载业务值。 */
export const ENHANCEMENT_ACTION_ID = 'enhancement:open';
/** ENHANCEMENT_HAMMER_TAG：定义该变量以承载业务值。 */
export const ENHANCEMENT_HAMMER_TAG = 'enhancement_hammer';
/** ENHANCEMENT_SPIRIT_STONE_ITEM_ID：定义该变量以承载业务值。 */
export const ENHANCEMENT_SPIRIT_STONE_ITEM_ID = 'spirit_stone';

/** normalizeEnhanceLevel：执行对应的业务逻辑。 */
export function normalizeEnhanceLevel(value: unknown): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ENHANCE_LEVEL;
  }
  return Math.max(DEFAULT_ENHANCE_LEVEL, Math.floor(Number(value)));
}

/** getEnhancementTargetSuccessRate：执行对应的业务逻辑。 */
export function getEnhancementTargetSuccessRate(targetEnhanceLevel: number): number {
/** level：定义该变量以承载业务值。 */
  const level = Math.max(1, Math.floor(Number(targetEnhanceLevel) || 1));
/** index：定义该变量以承载业务值。 */
  const index = Math.min(level, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL.length) - 1;
  return Math.max(0, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL[index] ?? 0);
}

/** getEnhancementSpiritStoneCost：执行对应的业务逻辑。 */
export function getEnhancementSpiritStoneCost(itemLevel: number | undefined, hasMaterialCost = false): number {
/** level：定义该变量以承载业务值。 */
  const level = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
  return Math.max(1, hasMaterialCost ? Math.floor(level / 10) : Math.ceil(level / 10));
}

/** getEnhancementPercent：执行对应的业务逻辑。 */
export function getEnhancementPercent(level: number | undefined): number {
/** normalized：定义该变量以承载业务值。 */
  const normalized = normalizeEnhanceLevel(level);
  return Math.ceil(100 * ((1 + ENHANCEMENT_RATE_PER_LEVEL) ** normalized));
}

/** formatEnhancedItemName：执行对应的业务逻辑。 */
export function formatEnhancedItemName(name: string, level: number | undefined): string {
/** normalized：定义该变量以承载业务值。 */
  const normalized = normalizeEnhanceLevel(level);
  if (normalized <= 0) {
    return name;
  }
/** cleanName：定义该变量以承载业务值。 */
  const cleanName = name.replace(/^\+\d+\s+/, '');
  return `+${normalized} ${cleanName}`;
}

/** computeEnhancementJobBaseTicks：执行对应的业务逻辑。 */
export function computeEnhancementJobBaseTicks(itemLevel: number | undefined): number {
/** normalizedLevel：定义该变量以承载业务值。 */
  const normalizedLevel = Math.max(1, Math.floor(Number(itemLevel) || 1));
  return ENHANCEMENT_BASE_JOB_TICKS + Math.max(0, normalizedLevel - 1) * ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL;
}

/** computeEnhancementToolSpeedRate：执行对应的业务逻辑。 */
export function computeEnhancementToolSpeedRate(
  toolBaseSpeedRate: number | undefined,
  roleEnhancementLevel: number | undefined,
  targetItemLevel: number | undefined,
): number {
/** baseSpeedRate：定义该变量以承载业务值。 */
  const baseSpeedRate = Number.isFinite(toolBaseSpeedRate) ? Number(toolBaseSpeedRate) : 0;
/** targetLevel：定义该变量以承载业务值。 */
  const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
/** levelBonus：定义该变量以承载业务值。 */
  const levelBonus = Math.max(0, normalizeEnhanceLevel(roleEnhancementLevel) - targetLevel) * ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL;
  return baseSpeedRate + levelBonus;
}

/** computeEnhancementJobTicks：执行对应的业务逻辑。 */
export function computeEnhancementJobTicks(
  itemLevel: number | undefined,
  speedRate: number | undefined,
): number {
  return computeAdjustedCraftTicks(computeEnhancementJobBaseTicks(itemLevel), speedRate);
}

/** computeEnhancementAdjustedSuccessRate：执行对应的业务逻辑。 */
export function computeEnhancementAdjustedSuccessRate(
  targetEnhanceLevel: number,
  roleEnhancementLevel: number | undefined,
  targetItemLevel: number | undefined,
  toolSuccessRateModifier = 0,
): number {
/** baseRate：定义该变量以承载业务值。 */
  const baseRate = getEnhancementTargetSuccessRate(targetEnhanceLevel);
/** targetLevel：定义该变量以承载业务值。 */
  const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
/** lowerLevelGap：定义该变量以承载业务值。 */
  const lowerLevelGap = Math.max(0, targetLevel - normalizeEnhanceLevel(roleEnhancementLevel));
/** upperLevelGap：定义该变量以承载业务值。 */
  const upperLevelGap = Math.max(0, normalizeEnhanceLevel(roleEnhancementLevel) - targetLevel);
/** adjustedBaseRate：定义该变量以承载业务值。 */
  const adjustedBaseRate = baseRate * ((1 - ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY) ** lowerLevelGap);
/** totalSuccessModifier：定义该变量以承载业务值。 */
  const totalSuccessModifier = toolSuccessRateModifier + (upperLevelGap * ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL);
  return applyAsymptoticSuccessModifier(adjustedBaseRate, totalSuccessModifier);
}

/** normalizeEnhancementRequirement：执行对应的业务逻辑。 */
function normalizeEnhancementRequirement(value: unknown): EnhancementMaterialRequirement | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
/** candidate：定义该变量以承载业务值。 */
  const candidate = value as Partial<EnhancementMaterialRequirement>;
/** itemId：定义该变量以承载业务值。 */
  const itemId = typeof candidate.itemId === 'string' ? candidate.itemId.trim() : '';
/** count：定义该变量以承载业务值。 */
  const count = Math.max(1, Math.floor(Number(candidate.count) || 0));
  if (!itemId || count <= 0) {
    return null;
  }
  return { itemId, count };
}

/** normalizeEnhancementTargetRef：执行对应的业务逻辑。 */
function normalizeEnhancementTargetRef(value: unknown): EnhancementTargetRef | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
/** candidate：定义该变量以承载业务值。 */
  const candidate = value as Partial<EnhancementTargetRef>;
  if (candidate.source === 'inventory') {
/** slotIndex：定义该变量以承载业务值。 */
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

/** normalizePlayerEnhancementJob：执行对应的业务逻辑。 */
export function normalizePlayerEnhancementJob(value: unknown): PlayerEnhancementJob | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
/** candidate：定义该变量以承载业务值。 */
  const candidate = value as Partial<PlayerEnhancementJob>;
/** target：定义该变量以承载业务值。 */
  const target = normalizeEnhancementTargetRef(candidate.target);
/** item：定义该变量以承载业务值。 */
  const item = candidate.item && typeof candidate.item === 'object'
    ? { ...(candidate.item as ItemStack), enhanceLevel: normalizeEnhanceLevel((candidate.item as ItemStack).enhanceLevel) }
    : null;
/** targetItemId：定义该变量以承载业务值。 */
  const targetItemId = typeof candidate.targetItemId === 'string' ? candidate.targetItemId.trim() : '';
/** targetItemName：定义该变量以承载业务值。 */
  const targetItemName = typeof candidate.targetItemName === 'string' ? candidate.targetItemName.trim() : '';
  if (!target || !item || !targetItemId || !targetItemName) {
    return null;
  }
/** totalTicks：定义该变量以承载业务值。 */
  const totalTicks = Math.max(1, Math.floor(Number(candidate.totalTicks) || 0));
/** remainingTicks：定义该变量以承载业务值。 */
  const remainingTicks = Math.max(0, Math.min(totalTicks, Math.floor(Number(candidate.remainingTicks) || 0)));
/** phase：定义该变量以承载业务值。 */
  const phase = candidate.phase === 'paused' ? 'paused' : 'enhancing';
/** pausedTicks：定义该变量以承载业务值。 */
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
/** protectionUsed：定义该变量以承载业务值。 */
    protectionUsed: candidate.protectionUsed === true,
/** protectionStartLevel：定义该变量以承载业务值。 */
    protectionStartLevel: candidate.protectionUsed === true
      ? Math.max(2, Math.floor(Number(candidate.protectionStartLevel) || 0))
      : undefined,
/** protectionItemId：定义该变量以承载业务值。 */
    protectionItemId: typeof candidate.protectionItemId === 'string' && candidate.protectionItemId.trim().length > 0
      ? candidate.protectionItemId.trim()
      : undefined,
/** protectionItemName：定义该变量以承载业务值。 */
    protectionItemName: typeof candidate.protectionItemName === 'string' && candidate.protectionItemName.trim().length > 0
      ? candidate.protectionItemName.trim()
      : undefined,
/** protectionItemSignature：定义该变量以承载业务值。 */
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

/** scaleEnhancedNumber：执行对应的业务逻辑。 */
function scaleEnhancedNumber(value: number, level: number | undefined): number {
/** scaled：定义该变量以承载业务值。 */
  const scaled = value * getEnhancementPercent(level) / 100;
  return Math.ceil((scaled - Number.EPSILON) * 100) / 100;
}

/** scaleEnhancedUtilityRate：执行对应的业务逻辑。 */
function scaleEnhancedUtilityRate(value: number, level: number | undefined): number {
/** scaled：定义该变量以承载业务值。 */
  const scaled = value * getEnhancementPercent(level) / 100;
  return Math.ceil((scaled - Number.EPSILON) * 10_000) / 10_000;
}

/** cloneScaledUtilityRate：执行对应的业务逻辑。 */
function cloneScaledUtilityRate(value: number | undefined, level: number | undefined): number | undefined {
  if (typeof value !== 'number') {
    return value;
  }
  return scaleEnhancedUtilityRate(value, level);
}

/** scaleEnhancedAttributes：执行对应的业务逻辑。 */
export function scaleEnhancedAttributes(
  attrs: Partial<Attributes> | undefined,
  level: number | undefined,
): Partial<Attributes> | undefined {
/** normalizedLevel：定义该变量以承载业务值。 */
  const normalizedLevel = normalizeEnhanceLevel(level);
  if (!attrs || normalizedLevel <= 0) {
    return attrs ? { ...attrs } : undefined;
  }
/** scaled：定义该变量以承载业务值。 */
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

/** scaleEnhancedNumericStats：执行对应的业务逻辑。 */
export function scaleEnhancedNumericStats(
  stats: PartialNumericStats | undefined,
  level: number | undefined,
): PartialNumericStats | undefined {
/** normalizedLevel：定义该变量以承载业务值。 */
  const normalizedLevel = normalizeEnhanceLevel(level);
  if (!stats || normalizedLevel <= 0) {
    return stats ? JSON.parse(JSON.stringify(stats)) as PartialNumericStats : undefined;
  }
/** scaled：定义该变量以承载业务值。 */
  const scaled: PartialNumericStats = {};
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const value = stats[key];
    if (typeof value !== 'number') {
      continue;
    }
    scaled[key] = scaleEnhancedNumber(value, normalizedLevel);
  }
  if (stats.elementDamageBonus) {
/** group：定义该变量以承载业务值。 */
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
/** group：定义该变量以承载业务值。 */
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

/** applyEnhancementToItemStack：执行对应的业务逻辑。 */
export function applyEnhancementToItemStack(item: ItemStack): ItemStack {
/** enhanceLevel：定义该变量以承载业务值。 */
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
