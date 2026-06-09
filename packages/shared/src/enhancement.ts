/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
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
  applyAsymptoticSuccessModifier,
  applyMultiplicativeSuccessModifier,
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
  ENHANCEMENT_HIGH_LEVEL_THRESHOLD,
  ENHANCEMENT_HIGH_LEVEL_MAX_SUCCESS_RATE,
  ENHANCEMENT_HIGH_LEVEL_BASE_SUCCESS_RATE,
  ENHANCEMENT_HIGH_LEVEL_DECAY_PER_LEVEL,
  ENHANCEMENT_HIGH_LEVEL_MIN_SUCCESS_RATE,
} from './constants/gameplay/enhancement';

/** 强化技能高于物品等级时，每多 1 级给"增益 factor"加多少（加算合并）。 */
export const ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL = 0.01;
/** 强化技能低于物品等级时，每差 1 级让"减益 factor"乘以多少（乘算合并、几何衰减）。 */
export const ENHANCEMENT_LOWER_LEVEL_DECAY_PER_LEVEL = 0.9;
/** 历史命名兼容：旧 log-odds 单位的"低等级惩罚"系数；新公式不再使用，仅为外部 import 不破坏而保留。 */
export const ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY = 0.1;
export const EQUIPMENT_REALM_EFFECTIVENESS_PENALTY_PER_LEVEL = 0.05;
export const EQUIPMENT_REALM_EFFECTIVENESS_FACTOR_PER_LEVEL = 1 - EQUIPMENT_REALM_EFFECTIVENESS_PENALTY_PER_LEVEL;

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
  return Math.max(DEFAULT_ENHANCE_LEVEL, Math.min(MAX_ENHANCE_LEVEL, Math.floor(Number(value))));
}

export function getEnhancementTargetSuccessRate(targetEnhanceLevel: number): number {
  const level = Math.max(1, Math.floor(Number(targetEnhanceLevel) || 1));
  if (level < ENHANCEMENT_HIGH_LEVEL_THRESHOLD) {
    const tableIndex = Math.min(level, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL.length) - 1;
    return Math.max(0, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL[tableIndex] ?? 0);
  }
  // +阈值 起进入指数衰减分段：basePoint × (1 − decayPerLevel) ^ (level − threshold)。
  // 几何级数衰减永不归零，但仍设 1% 下限作为底板，避免高等级概率退化为肉眼归零。
  const exponent = level - ENHANCEMENT_HIGH_LEVEL_THRESHOLD;
  const decayFactor = Math.max(0, 1 - ENHANCEMENT_HIGH_LEVEL_DECAY_PER_LEVEL);
  const decayedRate = ENHANCEMENT_HIGH_LEVEL_BASE_SUCCESS_RATE * Math.pow(decayFactor, exponent);
  return Math.max(ENHANCEMENT_HIGH_LEVEL_MIN_SUCCESS_RATE, decayedRate);
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
  return EQUIPMENT_REALM_EFFECTIVENESS_FACTOR_PER_LEVEL ** realmGap;
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
  const realmPercent = (EQUIPMENT_REALM_EFFECTIVENESS_FACTOR_PER_LEVEL ** realmGap) * 100;
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

export function formatEnhancedItemName(name: string | undefined | null, level: number | undefined): string {
  const normalized = normalizeEnhanceLevel(level);
  // 防御性兼容：装备水合 / 内容漂移等异常路径下 name 可能为 undefined/null。
  // 直接 .replace 会把世界 tick 整个炸掉，这里退化为空字符串以保住运行时连续性，
  // 真实模板字段缺失会被 tick 上层日志和资产审计捕捉，而非把整服阻塞在 tick 异常上。
  const safeName = typeof name === 'string' ? name : '';
  if (normalized <= 0) {
    return safeName;
  }
  const cleanName = safeName.replace(/^\+\d+\s+/, '');
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

/**
 * 兼容旧调用方的赔率域成功率修正包装。新公式（严格分段乘除）由
 * `applyMultiplicativeSuccessFactor` / `computeEnhancementAdjustedSuccessRate` 走。
 */
export function applyEnhancementSuccessModifier(
  baseRate: number | undefined,
  modifier: number | undefined,
  maxRate: number = 1,
): number {
  return applyAsymptoticSuccessModifier(baseRate, modifier, maxRate);
}

/**
 * 用"严格分段乘除"应用强化成功率修正。
 *
 * - `factor = 1` 不变；`> 1` 增益；`< 1` 削弱；
 * - `maxRate` 是渐近上限（永远不会越过）；
 * - 弱段直接乘、过半进入除段、强段直接除失败率，详见 `applyMultiplicativeSuccessModifier`。
 */
export function applyMultiplicativeSuccessFactor(
  baseRate: number | undefined,
  factor: number | undefined,
  maxRate: number = 1,
): number {
  return applyMultiplicativeSuccessModifier(baseRate, factor, maxRate);
}

/**
 * 按目标强化等级返回每步成功率的渐近上限。
 * 高于阈值（默认 +11）的强化封顶到 `ENHANCEMENT_HIGH_LEVEL_MAX_SUCCESS_RATE`，
 * 阻止任何 modifier 把成功率推过该上限，避免"失败 -1 级"形成正向偏置随机游走。
 */
export function getEnhancementMaxSuccessRate(targetEnhanceLevel: number | undefined): number {
  const normalized = Math.max(1, Math.floor(Number(targetEnhanceLevel) || 1));
  if (normalized >= ENHANCEMENT_HIGH_LEVEL_THRESHOLD) {
    return ENHANCEMENT_HIGH_LEVEL_MAX_SUCCESS_RATE;
  }
  return 1;
}

/**
 * 强化技能差对成功率的影响，拆成增益增量（加算）与减益乘子（乘算）两个分量。
 * 调用方收集所有来源后，分别用"加算合 increment、乘算合 decay、最后乘成总 factor"。
 */
export interface EnhancementSuccessFactorContribution {
  /** 增益贡献：累加到 `1 + Σ increment` 里。 */
  increment: number;
  /** 减益贡献：累乘到 `∏ decay` 里。 */
  decay: number;
}

export function computeEnhancementLevelSuccessFactorContribution(
  targetItemLevel: number | undefined,
  roleEnhancementLevel: number | undefined,
): EnhancementSuccessFactorContribution {
  const normalizedTargetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
  const normalizedRoleLevel = Math.max(1, Math.floor(Number(roleEnhancementLevel) || 1));
  const levelDelta = normalizedRoleLevel - normalizedTargetLevel;
  if (levelDelta > 0) {
    // 增益：每级 factor 加 0.01，加算合并到总增益里。
    return { increment: levelDelta * ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL, decay: 1 };
  }
  if (levelDelta < 0) {
    // 减益：每级 factor 乘 0.9，乘算合并到总减益里（指数衰减）。
    return { increment: 0, decay: Math.pow(ENHANCEMENT_LOWER_LEVEL_DECAY_PER_LEVEL, -levelDelta) };
  }
  return { increment: 0, decay: 1 };
}

/**
 * 历史导出：返回单一数值的"等级修正"。在新公式（严格分段乘除）下没有等价语义；
 * 仅保留兼容已有外部导出，内部不再使用。
 */
export function computeEnhancementLevelSuccessModifier(
  targetItemLevel: number | undefined,
  roleEnhancementLevel: number | undefined,
): number {
  const contribution = computeEnhancementLevelSuccessFactorContribution(targetItemLevel, roleEnhancementLevel);
  return contribution.increment - (1 - contribution.decay);
}

export function computeEnhancementAdjustedSuccessRate(
  targetEnhanceLevel: number,
  roleEnhancementLevel: number | undefined,
  targetItemLevel: number | undefined,
  toolSuccessRateModifier = 0,
): number {
  const baseRate = getEnhancementTargetSuccessRate(targetEnhanceLevel);
  const maxRate = getEnhancementMaxSuccessRate(targetEnhanceLevel);
  const skillContribution = computeEnhancementLevelSuccessFactorContribution(targetItemLevel, roleEnhancementLevel);
  const toolIncrement = Number.isFinite(toolSuccessRateModifier) ? Math.max(0, Number(toolSuccessRateModifier)) : 0;
  // 增益加算（技能差正、锤子贡献、未来幸运等）；减益乘算（技能差负、未来负向 buff 等）。
  const incrementSum = skillContribution.increment + toolIncrement;
  const decayProduct = skillContribution.decay;
  const factor = (1 + incrementSum) * decayProduct;
  return applyMultiplicativeSuccessFactor(baseRate, factor, maxRate);
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
    const itemInstanceId = typeof candidate.itemInstanceId === 'string'
      ? candidate.itemInstanceId.trim()
      : '';
    if (!itemInstanceId) {
      return null;
    }
    return { source: 'inventory', itemInstanceId };
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
  const currentLevel = normalizeEnhanceLevel(candidate.currentLevel);
  const targetLevel = Math.min(MAX_ENHANCE_LEVEL, Math.max(1, Math.floor(Number(candidate.targetLevel) || currentLevel + 1)));
  const desiredTargetLevel = Math.min(MAX_ENHANCE_LEVEL, Math.max(targetLevel, Math.floor(Number(candidate.desiredTargetLevel) || 0)));
  return {
    target,
    item,
    targetItemId,
    targetItemName,
    targetItemLevel: Math.max(1, Math.floor(Number(candidate.targetItemLevel) || item.level || 1)),
    currentLevel,
    targetLevel,
    desiredTargetLevel,
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
    if (!stats) return undefined;
    // 浅拷贝 + 子对象展开，替代 JSON.parse(JSON.stringify) 深拷贝
    const copy: PartialNumericStats = { ...stats };
    if (stats.elementDamageBonus) copy.elementDamageBonus = { ...stats.elementDamageBonus };
    if (stats.elementDamageReduce) copy.elementDamageReduce = { ...stats.elementDamageReduce };
    return copy;
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
  // item 可能是 Object.create(template) 的原型链实例（服务端 normalizeItem 产出），
  // 展开运算符只复制自有属性，必须先扁平化以保证 type/level/equipStats 等原型链字段不丢失。
  const flat = flattenItemForSpread(item);
  const enhanceLevel = normalizeEnhanceLevel(flat.enhanceLevel);
  if (enhanceLevel <= 0 || flat.type !== 'equipment') {
    return {
      ...flat,
      enhanceLevel,
      name: formatEnhancedItemName(flat.name, enhanceLevel),
    };
  }
  return {
    ...flat,
    enhanceLevel,
    name: formatEnhancedItemName(flat.name, enhanceLevel),
    equipAttrs: scaleEnhancedAttributes(flat.equipAttrs, enhanceLevel),
    equipStats: scaleEnhancedNumericStats(flat.equipStats, enhanceLevel),
    equipValueStats: scaleEnhancedNumericStats(flat.equipValueStats, enhanceLevel),
    alchemySuccessRate: cloneScaledUtilityRate(flat.alchemySuccessRate, enhanceLevel),
    alchemySpeedRate: cloneScaledUtilityRate(flat.alchemySpeedRate, enhanceLevel),
    enhancementSuccessRate: cloneScaledUtilityRate(flat.enhancementSuccessRate, enhanceLevel),
    enhancementSpeedRate: cloneScaledUtilityRate(flat.enhancementSpeedRate, enhanceLevel),
    miningDamageRate: cloneScaledUtilityRate(flat.miningDamageRate, enhanceLevel),
    miningDropRate: cloneScaledUtilityRate(flat.miningDropRate, enhanceLevel),
    buildingSpeedRate: cloneScaledUtilityRate(flat.buildingSpeedRate, enhanceLevel),
  };
}

/**
 * 将可能的原型链实例扁平化为普通对象。
 * Object.create(template) 产出的实例，其 for...in 可枚举原型链属性，
 * 但展开运算符（{...obj}）只复制自有属性。此函数确保所有可枚举属性都成为自有属性。
 */
function flattenItemForSpread(item: ItemStack): ItemStack {
  if (!item || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null) {
    return item;
  }
  const result = {} as Record<string, unknown>;
  for (const key in item) {
    result[key] = (item as unknown as Record<string, unknown>)[key];
  }
  return result as unknown as ItemStack;
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
    miningDropRate: typeof enhancedItem.miningDropRate === 'number' ? scaleEquipmentEffectivenessUtilityRate(enhancedItem.miningDropRate, realmMultiplier) : enhancedItem.miningDropRate,
    buildingSpeedRate: typeof enhancedItem.buildingSpeedRate === 'number' ? scaleEquipmentEffectivenessUtilityRate(enhancedItem.buildingSpeedRate, realmMultiplier) : enhancedItem.buildingSpeedRate,
  };
}
