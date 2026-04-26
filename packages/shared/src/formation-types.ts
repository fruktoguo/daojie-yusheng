import { DEFAULT_QI_RESOURCE_DESCRIPTOR, buildQiResourceKey } from './qi';

export type FormationId = 'spirit_gathering' | 'earth_stabilizing' | 'warding_barrier' | 'sect_guardian_barrier' | string;

export type FormationDiskTier = 'mortal' | 'yellow' | 'mystic' | 'earth';

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
  placeableByDisk?: boolean;
  access?: FormationAccessConfig;
  minSpiritStoneCount?: number;
  damagePerAura?: number;
  range: FormationRangeConfig;
  effect: FormationEffectConfig;
  visual?: FormationVisualConfig;
}

export interface FormationAllocation {
  effectPercent: number;
  rangePercent: number;
  durationPercent: number;
}

export interface FormationCreatePayload {
  slotIndex: number;
  formationId: FormationId;
  spiritStoneCount: number;
  qiCost: number;
  allocation: FormationAllocation;
}

export interface FormationControlPayload {
  formationInstanceId: string;
}

export interface FormationRefillPayload {
  formationInstanceId: string;
  spiritStoneCount: number;
  qiCost: number;
}

export interface FormationResolvedStats {
  baseAuraBudget: number;
  totalAuraBudget: number;
  effectAura: number;
  rangeAura: number;
  effectValue: number;
  radius: number;
  dailyActiveCost: number;
  dailyInactiveCost: number;
  tickActiveCost: number;
  tickInactiveCost: number;
}

export interface FormationAffectedCell {
  x: number;
  y: number;
}

export const FORMATION_SPIRIT_STONE_ITEM_ID = 'spirit_stone';
export const FORMATION_DEFAULT_MIN_SPIRIT_STONE_COUNT = 1;
export const FORMATION_AURA_PER_SPIRIT_STONE = 100;
export const FORMATION_DEFAULT_QI_COST_PER_SPIRIT_STONE = 100;
export const FORMATION_ALLOCATION_MIN_PERCENT = 0;
export const FORMATION_ALLOCATION_MAX_PERCENT = 100;
export const FORMATION_ALLOCATION_TOTAL_PERCENT = 100;
export const FORMATION_DEFAULT_ALLOCATION_PERCENT = FORMATION_ALLOCATION_TOTAL_PERCENT / 3;
export const FORMATION_DAILY_DURATION_BASE_PERCENT = FORMATION_DEFAULT_ALLOCATION_PERCENT;
export const FORMATION_TICKS_PER_DAY = 86_400;
export const DEFAULT_FORMATION_TILE_AURA_RESOURCE_KEY = buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR);
export const DEFAULT_FORMATION_VISUAL_CHAR = '◎';
export const DEFAULT_FORMATION_VISUAL_COLOR = '#4da3ff';
export const DEFAULT_FORMATION_RANGE_HIGHLIGHT_COLOR = '#3b82f6';
export const FORMATION_DEFAULT_DAMAGE_PER_AURA = 100;

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
    placeableByDisk: false,
    access: {
      kind: 'sect_members',
    },
    minSpiritStoneCount: 1,
    damagePerAura: FORMATION_DEFAULT_DAMAGE_PER_AURA,
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

export function resolveFormationStats(
  template: FormationTemplate,
  spiritStoneCount: number,
  diskMultiplier: number,
  allocationInput: Partial<FormationAllocation> | null | undefined,
): FormationResolvedStats {
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
  return {
    baseAuraBudget,
    totalAuraBudget,
    effectAura,
    rangeAura,
    effectValue,
    radius,
    dailyActiveCost,
    dailyInactiveCost,
    tickActiveCost: dailyActiveCost / FORMATION_TICKS_PER_DAY,
    tickInactiveCost: dailyInactiveCost / FORMATION_TICKS_PER_DAY,
  };
}

export function resolveFormationDamagePerAura(template: FormationTemplate): number {
  const configured = Number(template.damagePerAura);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : FORMATION_DEFAULT_DAMAGE_PER_AURA;
}

export function resolveFormationQiCost(spiritStoneCount: number): number {
  const normalizedStones = Math.max(1, Math.trunc(Number(spiritStoneCount) || 0));
  return normalizedStones * FORMATION_DEFAULT_QI_COST_PER_SPIRIT_STONE;
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
