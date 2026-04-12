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

export const DEFAULT_ENHANCE_LEVEL = 0;
export const MAX_ENHANCE_LEVEL = 20;
export const ENHANCEMENT_RATE_PER_LEVEL = 0.1;
export const ENHANCEMENT_BASE_SUCCESS_RATE = 0.5;
export const ENHANCEMENT_SUCCESS_RATE_STEP = 0.05;
export const ENHANCEMENT_SUCCESS_RATE_REDUCTION_EVERY = 2;
export const ENHANCEMENT_BASE_JOB_TICKS = 5;
export const ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL = 1;
export const ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL = 0.02;
export const ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY = 0.1;
export const ENHANCEMENT_ACTION_ID = 'enhancement:open';
export const ENHANCEMENT_HAMMER_TAG = 'enhancement_hammer';
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
  const level = Math.max(1, Math.floor(Number(targetEnhanceLevel) || 1));
  const reductionSteps = Math.floor((level - 1) / ENHANCEMENT_SUCCESS_RATE_REDUCTION_EVERY);
  return Math.max(0, ENHANCEMENT_BASE_SUCCESS_RATE - reductionSteps * ENHANCEMENT_SUCCESS_RATE_STEP);
}

/** getEnhancementSpiritStoneCost：执行对应的业务逻辑。 */
export function getEnhancementSpiritStoneCost(itemLevel: number | undefined, hasMaterialCost = false): number {
  const level = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
  return Math.max(1, hasMaterialCost ? Math.floor(level / 10) : Math.ceil(level / 10));
}

/** getEnhancementPercent：执行对应的业务逻辑。 */
export function getEnhancementPercent(level: number | undefined): number {
  const normalized = normalizeEnhanceLevel(level);
  return Math.ceil(100 * ((1 + ENHANCEMENT_RATE_PER_LEVEL) ** normalized));
}

/** formatEnhancedItemName：执行对应的业务逻辑。 */
export function formatEnhancedItemName(name: string, level: number | undefined): string {
  const normalized = normalizeEnhanceLevel(level);
  if (normalized <= 0) {
    return name;
  }
  const cleanName = name.replace(/^\+\d+\s+/, '');
  return `+${normalized} ${cleanName}`;
}

/** computeEnhancementJobBaseTicks：执行对应的业务逻辑。 */
export function computeEnhancementJobBaseTicks(itemLevel: number | undefined): number {
  const normalizedLevel = Math.max(1, Math.floor(Number(itemLevel) || 1));
  return ENHANCEMENT_BASE_JOB_TICKS + Math.max(0, normalizedLevel - 1) * ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL;
}

/** computeEnhancementToolSpeedRate：执行对应的业务逻辑。 */
export function computeEnhancementToolSpeedRate(
  toolBaseSpeedRate: number | undefined,
  roleEnhancementLevel: number | undefined,
  targetItemLevel: number | undefined,
): number {
  const baseSpeedRate = Number.isFinite(toolBaseSpeedRate) ? Number(toolBaseSpeedRate) : 0;
  const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
  const levelBonus = Math.max(0, normalizeEnhanceLevel(roleEnhancementLevel) - targetLevel) * ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL;
  return Math.max(0, baseSpeedRate + levelBonus);
}

/** computeEnhancementJobTicks：执行对应的业务逻辑。 */
export function computeEnhancementJobTicks(
  itemLevel: number | undefined,
  speedRate: number | undefined,
): number {
  const normalizedSpeedRate = Number.isFinite(speedRate) ? Number(speedRate) : 0;
  return Math.max(1, Math.ceil(computeEnhancementJobBaseTicks(itemLevel) * Math.max(0.05, 1 - normalizedSpeedRate)));
}

/** computeEnhancementAdjustedSuccessRate：执行对应的业务逻辑。 */
export function computeEnhancementAdjustedSuccessRate(
  targetEnhanceLevel: number,
  roleEnhancementLevel: number | undefined,
  targetItemLevel: number | undefined,
): number {
  const baseRate = getEnhancementTargetSuccessRate(targetEnhanceLevel);
  const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
  const lowerLevelGap = Math.max(0, targetLevel - normalizeEnhanceLevel(roleEnhancementLevel));
  return Math.max(0, Math.min(1, baseRate * ((1 - ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY) ** lowerLevelGap)));
}

/** normalizeEnhancementRequirement：执行对应的业务逻辑。 */
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

/** normalizeEnhancementTargetRef：执行对应的业务逻辑。 */
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

/** normalizePlayerEnhancementJob：执行对应的业务逻辑。 */
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
    phase,
    pausedTicks,
    successRate: Math.max(0, Math.min(1, Number(candidate.successRate) || 0)),
    totalTicks,
    remainingTicks,
    startedAt: Math.max(0, Math.floor(Number(candidate.startedAt) || 0)),
    roleEnhancementLevel: normalizeEnhanceLevel(candidate.roleEnhancementLevel),
    totalSpeedRate: Math.max(0, Number(candidate.totalSpeedRate) || 0),
  };
}

/** scaleEnhancedNumber：执行对应的业务逻辑。 */
function scaleEnhancedNumber(value: number, level: number | undefined): number {
  const scaled = value * getEnhancementPercent(level) / 100;
  return Math.ceil((scaled - Number.EPSILON) * 100) / 100;
}

/** cloneScaledUtilityRate：执行对应的业务逻辑。 */
function cloneScaledUtilityRate(value: number | undefined, level: number | undefined): number | undefined {
  if (typeof value !== 'number') {
    return value;
  }
  return scaleEnhancedNumber(value, level);
}

/** scaleEnhancedAttributes：执行对应的业务逻辑。 */
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

/** scaleEnhancedNumericStats：执行对应的业务逻辑。 */
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

/** applyEnhancementToItemStack：执行对应的业务逻辑。 */
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
    enhancementSpeedRate: cloneScaledUtilityRate(item.enhancementSpeedRate, enhanceLevel),
  };
}
