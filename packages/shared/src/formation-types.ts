/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
import { DEFAULT_QI_RESOURCE_DESCRIPTOR, buildQiResourceKey } from './qi';
import type { InventoryItemRefView } from './inventory-item-ref';

export type FormationId = 'spirit_gathering' | 'earth_stabilizing' | 'warding_barrier' | 'sect_guardian_barrier' | string;

export type FormationDiskTier = 'mortal' | 'yellow' | 'mystic' | 'earth';

export type FormationLifecycle = 'deployed' | 'persistent';

export type FormationEffectKind = 'tile_aura_source' | 'terrain_stabilizer' | 'boundary_barrier';

export type FormationRangeShape = 'circle' | 'square' | 'checkerboard';

export interface FormationVisualConfig {
  char?: string;
  color?: string;
  showText?: boolean;
  rangeHighlightColor?: string;
  boundaryChar?: string;
  boundaryColor?: string;
  boundaryRangeHighlightColor?: string;
  eyeVisibleWithoutSenseQi?: boolean;
  rangeVisibleWithoutSenseQi?: boolean;
  boundaryVisibleWithoutSenseQi?: boolean;
}

export type FormationRangeGrowth =
  | {
      type: 'geometric_radius';
      baseAura: number;
      baseRadius: number;
      ratioPerStep: number;
      stepDivisor?: number;
    };

export interface FormationRangeConfig {
  shape: FormationRangeShape;
  minRadius: number;
  growth: FormationRangeGrowth;
}

export interface FormationCostConfig {
  defaultRadius?: number;
  defaultDurationHours?: number;
  durationStepHours?: number;
  minDurationMinutes?: number;
  minDurationCostMultiplier?: number;
  shortDurationReferenceMinutes?: number;
  shortDurationReferenceCostMultiplier?: number;
  rangeCostRatio?: number;
  durationCostRatio?: number;
  minEffectValue?: number;
  effectCostRatio?: number;
  auraPerSpiritStone?: number;
  qiPerSpiritStone?: number;
}

export interface FormationEffectConfig {
  kind: FormationEffectKind;
  conversionRatio: number;
  resourceKey?: string;
  convergenceHalfLifeTicks?: number;
}

export interface FormationAccessConfig {
  kind: 'sect_members';
  sectId?: string;
}

export interface FormationTemplate {
  id: FormationId;
  name: string;
  desc?: string;
  lifecycle?: FormationLifecycle;
  placeableByDisk?: boolean;
  access?: FormationAccessConfig;
  minSpiritStoneCount?: number;
  damagePerAura?: number;
  cost?: FormationCostConfig;
  range: FormationRangeConfig;
  effect: FormationEffectConfig;
  visual?: FormationVisualConfig;
}

export interface FormationAllocation {
  effectPercent: number;
  rangePercent: number;
  durationPercent: number;
}

export interface FormationSetup {
  radius: number;
  durationHours: number;
  effectValue: number;
}

export interface FormationCreatePayload {
  itemRef: InventoryItemRefView;
  formationId: FormationId;
  setup?: Partial<FormationSetup>;
  spiritStoneCount?: number;
  qiCost?: number;
  allocation?: Partial<FormationAllocation> | Partial<FormationSetup>;
}

export interface FormationControlPayload {
  formationInstanceId: string;
}

export interface FormationRefillPayload {
  formationInstanceId: string;
  spiritStoneCount?: number;
  qiAmount?: number;
  qiCost?: number;
}

export interface FormationResolvedStats {
  setup?: FormationSetup;
  requiredAuraBudget?: number;
  durationHours?: number;
  requiredQiBudget?: number;
  requiredSpiritStoneBudget?: number;
  baseAuraBudget: number;
  totalAuraBudget: number;
  baseQiBudget: number;
  totalQiBudget: number;
  totalSpiritStoneBudget: number;
  effectAura: number;
  rangeAura: number;
  effectValue: number;
  radius: number;
  dailyActiveCost: number;
  dailyInactiveCost: number;
  tickActiveCost: number;
  tickInactiveCost: number;
  dailyActiveQiCost: number;
  dailyInactiveQiCost: number;
  tickActiveQiCost: number;
  tickInactiveQiCost: number;
  dailyActiveSpiritStoneCost: number;
  dailyInactiveSpiritStoneCost: number;
  tickActiveSpiritStoneCost: number;
  tickInactiveSpiritStoneCost: number;
}

export interface FormationAffectedCell {
  x: number;
  y: number;
}

import {
  FORMATION_SPIRIT_STONE_ITEM_ID,
  FORMATION_DEFAULT_MIN_SPIRIT_STONE_COUNT,
  FORMATION_AURA_PER_SPIRIT_STONE,
  FORMATION_DEFAULT_QI_COST_PER_SPIRIT_STONE,
  FORMATION_DEFAULT_DURATION_HOURS,
  FORMATION_DEFAULT_DURATION_STEP_HOURS,
  FORMATION_DEFAULT_MIN_DURATION_MINUTES,
  FORMATION_DEFAULT_MIN_DURATION_COST_MULTIPLIER,
  FORMATION_DEFAULT_SHORT_DURATION_REFERENCE_MINUTES,
  FORMATION_DEFAULT_SHORT_DURATION_REFERENCE_COST_MULTIPLIER,
  FORMATION_DEFAULT_GROWTH_COST_RATIO,
  FORMATION_DEFAULT_MIN_EFFECT_VALUE,
  FORMATION_DEFAULT_EFFECT_COST_RATIO,
  FORMATION_ALLOCATION_MIN_PERCENT,
  FORMATION_ALLOCATION_MAX_PERCENT,
  FORMATION_ALLOCATION_TOTAL_PERCENT,
  FORMATION_DEFAULT_ALLOCATION_PERCENT,
  FORMATION_DAILY_DURATION_BASE_PERCENT,
  FORMATION_TICKS_PER_DAY,
  DEFAULT_FORMATION_VISUAL_CHAR,
  DEFAULT_FORMATION_VISUAL_COLOR,
  DEFAULT_FORMATION_RANGE_HIGHLIGHT_COLOR,
  FORMATION_DEFAULT_DAMAGE_PER_AURA,
} from './constants/gameplay/formation';

export const DEFAULT_FORMATION_TILE_AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);

export const FORMATION_DISK_TIER_MULTIPLIERS: Record<FormationDiskTier, number> = {
  mortal: 1,
  yellow: 2,
  mystic: 4,
  earth: 8,
};

export const FORMATION_DISK_TIER_LABELS: Record<FormationDiskTier, string> = {
  mortal: '凡品',
  yellow: '黄阶',
  mystic: '玄阶',
  earth: '地阶',
};

export const BUILTIN_FORMATION_TEMPLATES: FormationTemplate[] = [
  {
    id: 'spirit_gathering',
    name: '聚灵阵',
    desc: '持续抬升范围内地块的炼化中性灵气。',
    minSpiritStoneCount: 100,
    damagePerAura: FORMATION_DEFAULT_DAMAGE_PER_AURA,
    cost: {
      defaultRadius: 1,
      defaultDurationHours: 2,
      durationStepHours: 2,
      minDurationMinutes: 1,
      minDurationCostMultiplier: 1 / 8,
      shortDurationReferenceMinutes: 10,
      shortDurationReferenceCostMultiplier: 1 / 6,
      rangeCostRatio: 1.5,
      durationCostRatio: 1,
      minEffectValue: 1000,
      effectCostRatio: 1,
      auraPerSpiritStone: 100,
      qiPerSpiritStone: 100,
    },
    range: {
      shape: 'circle',
      minRadius: 1,
      growth: {
        type: 'geometric_radius',
        baseAura: 1000,
        baseRadius: 0,
        ratioPerStep: 2,
      },
    },
    effect: {
      kind: 'tile_aura_source',
      conversionRatio: 1,
      resourceKey: DEFAULT_FORMATION_TILE_AURA_RESOURCE_KEY,
      convergenceHalfLifeTicks: FORMATION_TICKS_PER_DAY,
    },
    visual: {
      char: '◎',
      color: '#4da3ff',
      showText: true,
      rangeHighlightColor: '#3b82f6',
    },
  },
  {
    id: 'earth_stabilizing',
    name: '固脉阵',
    desc: '稳固范围内地脉，阻止可攻击地块复生和临时地块自然消散，并按效果灵力降低可拆除地块受到的伤害。',
    minSpiritStoneCount: 1000,
    damagePerAura: FORMATION_DEFAULT_DAMAGE_PER_AURA,
    cost: {
      defaultRadius: 1,
      defaultDurationHours: 2,
      durationStepHours: 2,
      minDurationMinutes: 1,
      minDurationCostMultiplier: 1 / 8,
      shortDurationReferenceMinutes: 10,
      shortDurationReferenceCostMultiplier: 1 / 6,
      rangeCostRatio: 1.5,
      durationCostRatio: 1,
      minEffectValue: 100_000,
      effectCostRatio: 1,
      auraPerSpiritStone: 100,
      qiPerSpiritStone: 100,
    },
    range: {
      shape: 'square',
      minRadius: 1,
      growth: {
        type: 'geometric_radius',
        baseAura: 100,
        baseRadius: 0,
        ratioPerStep: 1.5,
        stepDivisor: 2,
      },
    },
    effect: {
      kind: 'terrain_stabilizer',
      conversionRatio: 1,
    },
    visual: {
      char: '◇',
      color: '#b7791f',
      showText: true,
      rangeHighlightColor: '#a16207',
    },
  },
  {
    id: 'warding_barrier',
    name: '太玄封界阵',
    desc: '以太玄阵纹封锁四方，阵法边界等同墙体阻挡通行与视线，攻击任意边界都会消耗阵眼灵力。',
    minSpiritStoneCount: 100,
    damagePerAura: 100,
    cost: {
      defaultRadius: 1,
      defaultDurationHours: 2,
      durationStepHours: 2,
      minDurationMinutes: 1,
      minDurationCostMultiplier: 1 / 8,
      shortDurationReferenceMinutes: 10,
      shortDurationReferenceCostMultiplier: 1 / 6,
      rangeCostRatio: 1.5,
      durationCostRatio: 1,
      minEffectValue: 10_000,
      effectCostRatio: 1,
      auraPerSpiritStone: 100,
      qiPerSpiritStone: 100,
    },
    range: {
      shape: 'square',
      minRadius: 1,
      growth: {
        type: 'geometric_radius',
        baseAura: 10000,
        baseRadius: 1,
        ratioPerStep: 2,
      },
    },
    effect: {
      kind: 'boundary_barrier',
      conversionRatio: 1,
    },
    visual: {
      char: '玄',
      color: '#c4b5fd',
      showText: true,
      rangeHighlightColor: '#7dd3fc',
      boundaryChar: '封',
      boundaryColor: '#67e8f9',
      boundaryRangeHighlightColor: '#22d3ee',
      eyeVisibleWithoutSenseQi: false,
      rangeVisibleWithoutSenseQi: false,
      boundaryVisibleWithoutSenseQi: true,
    },
  },
  {
    id: 'sect_guardian_barrier',
    name: '护宗大阵',
    desc: '护持宗门山门的特殊大阵，阵眼位于宗门内部，主世界入口处形成默认一格封界；本宗门修士可自由通行。',
    lifecycle: 'persistent',
    placeableByDisk: false,
    access: {
      kind: 'sect_members',
    },
    minSpiritStoneCount: 1,
    damagePerAura: FORMATION_DEFAULT_DAMAGE_PER_AURA,
    cost: {
      defaultRadius: 1,
      defaultDurationHours: 2,
      durationStepHours: 2,
      minDurationMinutes: 1,
      minDurationCostMultiplier: 1 / 8,
      shortDurationReferenceMinutes: 10,
      shortDurationReferenceCostMultiplier: 1 / 6,
      rangeCostRatio: 1.5,
      durationCostRatio: 1,
      minEffectValue: 10_000,
      effectCostRatio: 1,
      auraPerSpiritStone: 100,
      qiPerSpiritStone: 100,
    },
    range: {
      shape: 'square',
      minRadius: 1,
      growth: {
        type: 'geometric_radius',
        baseAura: 10000,
        baseRadius: 1,
        ratioPerStep: 2,
      },
    },
    effect: {
      kind: 'boundary_barrier',
      conversionRatio: 1,
    },
    visual: {
      char: '宗',
      color: '#fde68a',
      showText: false,
      rangeHighlightColor: '#f59e0b',
      boundaryChar: '护',
      boundaryColor: '#e0f7ff',
      boundaryRangeHighlightColor: '#67e8f9',
      eyeVisibleWithoutSenseQi: false,
      rangeVisibleWithoutSenseQi: false,
      boundaryVisibleWithoutSenseQi: true,
    },
  },
];

export function resolveFormationVisual(template: FormationTemplate): Required<FormationVisualConfig> {
  const visual = template.visual ?? {};
  return {
    char: normalizeFormationVisualString(visual.char, DEFAULT_FORMATION_VISUAL_CHAR),
    color: normalizeFormationVisualString(visual.color, DEFAULT_FORMATION_VISUAL_COLOR),
    showText: visual.showText !== false,
    rangeHighlightColor: normalizeFormationVisualString(
      visual.rangeHighlightColor,
      visual.color ?? DEFAULT_FORMATION_RANGE_HIGHLIGHT_COLOR,
    ),
    boundaryChar: normalizeFormationVisualString(visual.boundaryChar, visual.char ?? DEFAULT_FORMATION_VISUAL_CHAR),
    boundaryColor: normalizeFormationVisualString(visual.boundaryColor, visual.color ?? DEFAULT_FORMATION_VISUAL_COLOR),
    boundaryRangeHighlightColor: normalizeFormationVisualString(
      visual.boundaryRangeHighlightColor,
      visual.rangeHighlightColor ?? visual.boundaryColor ?? visual.color ?? DEFAULT_FORMATION_RANGE_HIGHLIGHT_COLOR,
    ),
    eyeVisibleWithoutSenseQi: visual.eyeVisibleWithoutSenseQi === true,
    rangeVisibleWithoutSenseQi: visual.rangeVisibleWithoutSenseQi === true,
    boundaryVisibleWithoutSenseQi: visual.boundaryVisibleWithoutSenseQi === true,
  };
}

export function normalizeFormationAllocation(input: Partial<FormationAllocation> | null | undefined): FormationAllocation {
  const effectPercent = clampFormationPercent(input?.effectPercent ?? FORMATION_DEFAULT_ALLOCATION_PERCENT);
  const rangePercent = clampFormationPercent(input?.rangePercent ?? FORMATION_DEFAULT_ALLOCATION_PERCENT);
  const durationPercent = clampFormationPercent(input?.durationPercent ?? FORMATION_DEFAULT_ALLOCATION_PERCENT);
  const total = effectPercent + rangePercent + durationPercent;
  if (total === FORMATION_ALLOCATION_TOTAL_PERCENT) {
    return { effectPercent, rangePercent, durationPercent };
  }
  if (total <= 0) {
    return {
      effectPercent: FORMATION_DEFAULT_ALLOCATION_PERCENT,
      rangePercent: FORMATION_DEFAULT_ALLOCATION_PERCENT,
      durationPercent: FORMATION_DEFAULT_ALLOCATION_PERCENT,
    };
  }
  return {
    effectPercent: effectPercent / total * FORMATION_ALLOCATION_TOTAL_PERCENT,
    rangePercent: rangePercent / total * FORMATION_ALLOCATION_TOTAL_PERCENT,
    durationPercent: durationPercent / total * FORMATION_ALLOCATION_TOTAL_PERCENT,
  };
}

export function resolveFormationCostConfig(template: FormationTemplate): Required<FormationCostConfig> {
  const configured = template.cost ?? {};
  const defaultRadius = normalizePositiveInteger(
    configured.defaultRadius,
    Math.max(1, Math.trunc(Number(template.range?.minRadius) || 1)),
  );
  return {
    defaultRadius,
    defaultDurationHours: normalizePositiveNumber(configured.defaultDurationHours, FORMATION_DEFAULT_DURATION_HOURS),
    durationStepHours: normalizePositiveNumber(configured.durationStepHours, FORMATION_DEFAULT_DURATION_STEP_HOURS),
    minDurationMinutes: normalizePositiveNumber(configured.minDurationMinutes, FORMATION_DEFAULT_MIN_DURATION_MINUTES),
    minDurationCostMultiplier: normalizePositiveNumber(
      configured.minDurationCostMultiplier,
      FORMATION_DEFAULT_MIN_DURATION_COST_MULTIPLIER,
    ),
    shortDurationReferenceMinutes: normalizePositiveNumber(
      configured.shortDurationReferenceMinutes,
      FORMATION_DEFAULT_SHORT_DURATION_REFERENCE_MINUTES,
    ),
    shortDurationReferenceCostMultiplier: normalizePositiveNumber(
      configured.shortDurationReferenceCostMultiplier,
      FORMATION_DEFAULT_SHORT_DURATION_REFERENCE_COST_MULTIPLIER,
    ),
    rangeCostRatio: normalizeRatio(configured.rangeCostRatio, FORMATION_DEFAULT_GROWTH_COST_RATIO),
    durationCostRatio: normalizePositiveNumber(configured.durationCostRatio, 1),
    minEffectValue: normalizePositiveInteger(configured.minEffectValue, FORMATION_DEFAULT_MIN_EFFECT_VALUE),
    effectCostRatio: normalizePositiveNumber(configured.effectCostRatio, FORMATION_DEFAULT_EFFECT_COST_RATIO),
    auraPerSpiritStone: normalizePositiveNumber(configured.auraPerSpiritStone, FORMATION_AURA_PER_SPIRIT_STONE),
    qiPerSpiritStone: normalizePositiveNumber(configured.qiPerSpiritStone, FORMATION_DEFAULT_QI_COST_PER_SPIRIT_STONE),
  };
}

export function normalizeFormationSetup(
  template: FormationTemplate,
  input: Partial<FormationSetup> | null | undefined,
): FormationSetup {
  const cost = resolveFormationCostConfig(template);
  const rawRadius = Math.trunc(Number(input?.radius) || cost.defaultRadius);
  const radius = Math.max(cost.defaultRadius, rawRadius);
  const rawDurationHours = Number(input?.durationHours);
  const requestedDurationHours = Number.isFinite(rawDurationHours) ? rawDurationHours : cost.defaultDurationHours;
  const durationHours = Math.max(cost.minDurationMinutes / 60, requestedDurationHours);
  const rawEffectValue = Math.trunc(Number(input?.effectValue) || cost.minEffectValue);
  const effectValue = Math.max(cost.minEffectValue, rawEffectValue);
  return { radius, durationHours, effectValue };
}

export function isFormationSetupInput(
  input: Partial<FormationAllocation> | Partial<FormationSetup> | null | undefined,
): input is Partial<FormationSetup> {
  if (!input || typeof input !== 'object') {
    return false;
  }
  return 'radius' in input || 'durationHours' in input || 'effectValue' in input;
}

export function resolveFormationLifecycle(template: FormationTemplate | null | undefined): FormationLifecycle {
  return template?.lifecycle === 'persistent' ? 'persistent' : 'deployed';
}

export function resolveFormationStats(
  template: FormationTemplate,
  spiritStoneCount: number,
  diskMultiplier: number,
  allocationInput: Partial<FormationAllocation> | Partial<FormationSetup> | null | undefined,
): FormationResolvedStats {
  if (isFormationSetupInput(allocationInput)) {
    return resolveFormationSetupStats(template, diskMultiplier, allocationInput);
  }
  const allocation = normalizeFormationAllocation(allocationInput);
  const normalizedStones = Math.max(1, Math.trunc(Number(spiritStoneCount) || 0));
  const normalizedMultiplier = Number.isFinite(diskMultiplier) ? Math.max(1, Number(diskMultiplier)) : 1;
  const baseAuraBudget = normalizedStones * FORMATION_AURA_PER_SPIRIT_STONE;
  const totalAuraBudget = Math.round(baseAuraBudget * normalizedMultiplier);
  const effectAura = Math.floor(totalAuraBudget * allocation.effectPercent / FORMATION_ALLOCATION_TOTAL_PERCENT);
  const rangeAura = Math.floor(totalAuraBudget * allocation.rangePercent / FORMATION_ALLOCATION_TOTAL_PERCENT);
  const effectValue = Math.floor(effectAura * Math.max(0, Number(template.effect.conversionRatio) || 0));
  const radius = resolveFormationRadius(template.range, rangeAura);
  const durationScale = Math.max(0.01, allocation.durationPercent / FORMATION_DAILY_DURATION_BASE_PERCENT);
  const dailyActiveCost = totalAuraBudget / durationScale;
  const dailyInactiveCost = dailyActiveCost / 10;
  const tickActiveCost = dailyActiveCost / FORMATION_TICKS_PER_DAY;
  const tickInactiveCost = dailyInactiveCost / FORMATION_TICKS_PER_DAY;
  const spiritStoneCostDivisor = Math.max(1, FORMATION_AURA_PER_SPIRIT_STONE * normalizedMultiplier);
  const dailyActiveSpiritStoneCost = dailyActiveCost / spiritStoneCostDivisor;
  const dailyInactiveSpiritStoneCost = dailyInactiveCost / spiritStoneCostDivisor;
  return {
    baseAuraBudget,
    totalAuraBudget,
    baseQiBudget: baseAuraBudget,
    totalQiBudget: totalAuraBudget,
    totalSpiritStoneBudget: normalizedStones,
    effectAura,
    rangeAura,
    effectValue,
    radius,
    durationHours: 24 * durationScale,
    dailyActiveCost,
    dailyInactiveCost,
    tickActiveCost,
    tickInactiveCost,
    dailyActiveQiCost: dailyActiveCost,
    dailyInactiveQiCost: dailyInactiveCost,
    tickActiveQiCost: tickActiveCost,
    tickInactiveQiCost: tickInactiveCost,
    dailyActiveSpiritStoneCost,
    dailyInactiveSpiritStoneCost,
    tickActiveSpiritStoneCost: dailyActiveSpiritStoneCost / FORMATION_TICKS_PER_DAY,
    tickInactiveSpiritStoneCost: dailyInactiveSpiritStoneCost / FORMATION_TICKS_PER_DAY,
  };
}

export function resolveFormationSetupStats(
  template: FormationTemplate,
  diskMultiplier: number,
  setupInput: Partial<FormationSetup> | null | undefined,
): FormationResolvedStats {
  const cost = resolveFormationCostConfig(template);
  const setup = normalizeFormationSetup(template, setupInput);
  const normalizedMultiplier = Number.isFinite(diskMultiplier) ? Math.max(1, Number(diskMultiplier)) : 1;
  const rangeSteps = Math.max(0, setup.radius - cost.defaultRadius);
  const rangeMultiplier = Math.pow(cost.rangeCostRatio, rangeSteps);
  const linearDurationMultiplier = setup.durationHours / cost.defaultDurationHours;
  const durationMultiplier = setup.durationHours >= cost.defaultDurationHours
    ? 1 + (linearDurationMultiplier - 1) * cost.durationCostRatio
    : resolveShortDurationCostMultiplier(cost, setup.durationHours);
  const requiredAuraBudget = Math.max(1, Math.ceil(setup.effectValue * cost.effectCostRatio * rangeMultiplier * durationMultiplier));
  const spiritStoneCount = Math.max(
    FORMATION_DEFAULT_MIN_SPIRIT_STONE_COUNT,
    Math.ceil(requiredAuraBudget / Math.max(1, cost.auraPerSpiritStone * normalizedMultiplier)),
  );
  const baseAuraBudget = Math.ceil(requiredAuraBudget / normalizedMultiplier);
  const totalAuraBudget = requiredAuraBudget;
  const durationTicks = Math.max(1, Math.round(setup.durationHours * 3_600));
  const dailyActiveCost = totalAuraBudget * (FORMATION_TICKS_PER_DAY / durationTicks);
  const dailyInactiveCost = dailyActiveCost / 10;
  const tickActiveCost = totalAuraBudget / durationTicks;
  const tickInactiveCost = tickActiveCost / 10;
  const spiritStoneCostDivisor = Math.max(1, cost.auraPerSpiritStone * normalizedMultiplier);
  const tickActiveSpiritStoneCost = tickActiveCost / spiritStoneCostDivisor;
  const tickInactiveSpiritStoneCost = tickInactiveCost / spiritStoneCostDivisor;
  return {
    setup,
    requiredAuraBudget,
    requiredQiBudget: requiredAuraBudget,
    requiredSpiritStoneBudget: spiritStoneCount,
    durationHours: setup.durationHours,
    baseAuraBudget,
    totalAuraBudget,
    baseQiBudget: baseAuraBudget,
    totalQiBudget: totalAuraBudget,
    totalSpiritStoneBudget: spiritStoneCount,
    effectAura: setup.effectValue,
    rangeAura: requiredAuraBudget,
    effectValue: setup.effectValue,
    radius: setup.radius,
    dailyActiveCost,
    dailyInactiveCost,
    tickActiveCost,
    tickInactiveCost,
    dailyActiveQiCost: dailyActiveCost,
    dailyInactiveQiCost: dailyInactiveCost,
    tickActiveQiCost: tickActiveCost,
    tickInactiveQiCost: tickInactiveCost,
    dailyActiveSpiritStoneCost: tickActiveSpiritStoneCost * FORMATION_TICKS_PER_DAY,
    dailyInactiveSpiritStoneCost: tickInactiveSpiritStoneCost * FORMATION_TICKS_PER_DAY,
    tickActiveSpiritStoneCost,
    tickInactiveSpiritStoneCost,
  };
}

export function resolveFormationSetupPlan(
  template: FormationTemplate,
  diskMultiplier: number,
  setupInput: Partial<FormationSetup> | null | undefined,
): {
  setup: FormationSetup;
  stats: FormationResolvedStats;
  spiritStoneCount: number;
  qiCost: number;
} {
  const cost = resolveFormationCostConfig(template);
  const stats = resolveFormationSetupStats(template, diskMultiplier, setupInput);
  const normalizedMultiplier = Number.isFinite(diskMultiplier) ? Math.max(1, Number(diskMultiplier)) : 1;
  const spiritStoneCount = Math.max(
    FORMATION_DEFAULT_MIN_SPIRIT_STONE_COUNT,
    Math.ceil((stats.requiredAuraBudget ?? stats.totalAuraBudget) / Math.max(1, cost.auraPerSpiritStone * normalizedMultiplier)),
  );
  return {
    setup: stats.setup ?? normalizeFormationSetup(template, setupInput),
    stats,
    spiritStoneCount,
    qiCost: resolveFormationQiCost(spiritStoneCount, template),
  };
}

export function resolveFormationDamagePerAura(template: FormationTemplate): number {
  const configured = Number(template.damagePerAura);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : FORMATION_DEFAULT_DAMAGE_PER_AURA;
}

export function resolveFormationQiCost(spiritStoneCount: number, template?: FormationTemplate | null): number {
  const normalizedStones = Math.max(1, Math.trunc(Number(spiritStoneCount) || 0));
  const qiPerSpiritStone = template ? resolveFormationCostConfig(template).qiPerSpiritStone : FORMATION_DEFAULT_QI_COST_PER_SPIRIT_STONE;
  return Math.ceil(normalizedStones * qiPerSpiritStone);
}

export function resolveFormationMinSpiritStoneCount(template: FormationTemplate): number {
  const value = Math.trunc(Number(template.minSpiritStoneCount) || 0);
  return Number.isFinite(value) ? Math.max(FORMATION_DEFAULT_MIN_SPIRIT_STONE_COUNT, value) : FORMATION_DEFAULT_MIN_SPIRIT_STONE_COUNT;
}

export function resolveFormationRadius(range: FormationRangeConfig, rangeAura: number): number {
  const growth = range.growth;
  const normalizedAura = Math.max(0, Number(rangeAura) || 0);
  let radius = range.minRadius;
  if (growth.type === 'geometric_radius' && normalizedAura > 0 && growth.baseAura > 0 && growth.ratioPerStep > 1) {
    const rawSteps = Math.log(normalizedAura / growth.baseAura) / Math.log(growth.ratioPerStep);
    const steps = Math.max(0, Math.floor(rawSteps / Math.max(1, growth.stepDivisor ?? 1)));
    radius = Math.max(range.minRadius, Math.trunc(growth.baseRadius + steps));
  }
  return Math.max(1, Math.trunc(radius));
}

export function getFormationTemplateById(id: FormationId): FormationTemplate | null {
  return BUILTIN_FORMATION_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function listFormationAffectedCells(
  shape: FormationRangeShape,
  centerX: number,
  centerY: number,
  radius: number,
  width: number,
  height: number,
): FormationAffectedCell[] {
  const cells: FormationAffectedCell[] = [];
  const normalizedRadius = Math.max(1, Math.trunc(radius));
  const minX = Math.max(0, Math.trunc(centerX) - normalizedRadius);
  const maxX = Math.min(Math.max(0, width - 1), Math.trunc(centerX) + normalizedRadius);
  const minY = Math.max(0, Math.trunc(centerY) - normalizedRadius);
  const maxY = Math.min(Math.max(0, height - 1), Math.trunc(centerY) + normalizedRadius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (shape === 'circle') {
        const dx = x - Math.trunc(centerX);
        const dy = y - Math.trunc(centerY);
        if ((dx * dx) + (dy * dy) > normalizedRadius * normalizedRadius) {
          continue;
        }
      }
      if (shape === 'checkerboard' && ((x + y) % 2 !== 0)) {
        continue;
      }
      cells.push({ x, y });
    }
  }
  return cells;
}

function clampFormationPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return FORMATION_ALLOCATION_MIN_PERCENT;
  }
  return Math.max(
    FORMATION_ALLOCATION_MIN_PERCENT,
    Math.min(FORMATION_ALLOCATION_MAX_PERCENT, Math.trunc(value)),
  );
}

function normalizeFormationVisualString(input: string | null | undefined, fallback: string): string {
  const value = typeof input === 'string' ? input.trim() : '';
  return value.length > 0 ? value : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Math.max(1, Math.trunc(fallback));
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Math.max(Number.EPSILON, Number(fallback) || Number.EPSILON);
}

function normalizeRatio(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : Math.max(1.000001, Number(fallback) || FORMATION_DEFAULT_GROWTH_COST_RATIO);
}

function resolveShortDurationCostMultiplier(cost: Required<FormationCostConfig>, durationHours: number): number {
  const minDurationHours = Math.max(Number.EPSILON, cost.minDurationMinutes / 60);
  const defaultDurationHours = Math.max(minDurationHours + Number.EPSILON, cost.defaultDurationHours);
  const clampedDurationHours = Math.max(minDurationHours, Math.min(defaultDurationHours, durationHours));
  const minMultiplier = Math.max(Number.EPSILON, Math.min(1, cost.minDurationCostMultiplier));
  const referenceDurationHours = Math.max(
    minDurationHours + Number.EPSILON,
    Math.min(defaultDurationHours - Number.EPSILON, cost.shortDurationReferenceMinutes / 60),
  );
  const referenceMultiplier = Math.max(
    minMultiplier + Number.EPSILON,
    Math.min(1 - Number.EPSILON, cost.shortDurationReferenceCostMultiplier),
  );
  const progress = (clampedDurationHours - minDurationHours) / (defaultDurationHours - minDurationHours);
  const referenceProgress = (referenceDurationHours - minDurationHours) / (defaultDurationHours - minDurationHours);
  const referenceValue = (referenceMultiplier - minMultiplier) / (1 - minMultiplier);
  const exponent = referenceProgress > 0 && referenceProgress < 1 && referenceValue > 0 && referenceValue < 1
    ? Math.log(referenceValue) / Math.log(referenceProgress)
    : 1;
  return minMultiplier + (1 - minMultiplier) * Math.pow(Math.max(0, Math.min(1, progress)), Math.max(Number.EPSILON, exponent));
}
