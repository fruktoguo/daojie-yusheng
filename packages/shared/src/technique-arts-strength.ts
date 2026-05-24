/**
 * 本文件定义 AI 术法强度模板的共享解析与展开函数。
 *
 * 维护时保持纯函数，不引入服务端持久化、客户端 UI 或运行时状态。
 */
import type { ElementKey, NumericScalarStatKey } from './numeric';
import type { SkillDamageKind, SkillDef, SkillEffectDef, SkillFormula, SkillFormulaVar, SkillTargetingDef } from './skill-types';
import type { TechniqueGrade } from './cultivation-types';
import { calculateTechniqueSkillQiCost } from './technique';
import {
  TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS,
  TECHNIQUE_ARTS_STRENGTH_ATTRIBUTE_BASE_COSTS,
  TECHNIQUE_ARTS_STRENGTH_CONSTANTS,
} from './constants/gameplay/technique-arts-strength';

export type TechniqueArtsStrengthAttributeBaseStat = typeof TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS[number];

export type TechniqueArtsStrengthTargetType = 'single' | 'line' | 'box' | 'area' | 'orientedBox' | 'ring' | 'checkerboard';

export interface TechniqueArtsStrengthTargetInput {
  type?: TechniqueArtsStrengthTargetType;
  range?: number;
  width?: number;
  height?: number;
  radius?: number;
  innerRadius?: number;
  checkerParity?: 'even' | 'odd';
  maxTargets?: number;
  targetMode?: 'any' | 'entity' | 'tile';
  rawTargeting?: SkillTargetingDef | null;
}

export interface TechniqueArtsStrengthStructureInput {
  cost?: number;
  cooldown?: number;
  chant?: number;
  costMultiplier?: number;
  cooldownTicks?: number;
}

export interface TechniqueArtsStrengthFormulaInput {
  flatBase?: number;
  attributeBases?: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>>;
  extraBaseVars?: Record<string, number>;
  percentBonuses?: {
    techLevel?: number;
    moveSpeed?: number;
  };
  extraPercentBonuses?: Record<string, number>;
  rawFormula?: SkillFormula;
}

export interface TechniqueArtsStrengthSkillInput {
  id?: string;
  name?: string;
  desc?: string;
  unlockLevel?: number;
  unlockRealm?: number;
  unlockPlayerRealm?: number;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
  damageKind?: SkillDamageKind;
  element?: ElementKey;
  target?: TechniqueArtsStrengthTargetInput;
  structureStrength?: TechniqueArtsStrengthStructureInput;
  formulaStrength?: TechniqueArtsStrengthFormulaInput;
  totalBudget?: number;
  targetBudget?: number;
  effectsStrength?: TechniqueArtsStrengthEffectInput[];
  playerCast?: unknown;
  monsterCast?: unknown;
}

export type TechniqueArtsStrengthEffectInput = Record<string, unknown> & {
  type?: string;
  effectBudget?: number;
  targetBudget?: number;
  formulaStrength?: TechniqueArtsStrengthFormulaInput;
  hpFormulaStrength?: TechniqueArtsStrengthFormulaInput;
};

export interface TechniqueArtsStrengthTemplateInput {
  skills?: TechniqueArtsStrengthSkillInput[];
}

export interface NormalizedTechniqueArtsStrengthTarget {
  type: TechniqueArtsStrengthTargetType;
  range: number;
  width?: number;
  height?: number;
  radius?: number;
  innerRadius?: number;
  checkerParity?: 'even' | 'odd';
  maxTargets?: number;
  targetMode?: 'any' | 'entity' | 'tile';
  rawTargeting?: SkillTargetingDef | null;
  coveredCells: number;
  areaStrength: number;
  rangeStrength: number;
}

export interface NormalizedTechniqueArtsStrengthStructure {
  cost: number;
  cooldown: number;
  chant: number;
  budgetMultiplier: number;
  budgetWeight: number;
  costMultiplier: number;
  cooldownTicks: number;
}

export interface NormalizedTechniqueArtsStrengthFormula {
  flatBase: number;
  attributeBases: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>>;
  extraBaseVars: Record<string, number>;
  percentBonuses: {
    techLevel: number;
    moveSpeed: number;
  };
  extraPercentBonuses: Record<string, number>;
  rawFormula?: SkillFormula;
  effectStrength: number;
}

export interface NormalizedTechniqueArtsStrengthSkill {
  id?: string;
  name: string;
  desc: string;
  unlockLevel: number;
  unlockRealm?: number;
  unlockPlayerRealm?: number;
  requiresTarget?: boolean;
  targetMode?: 'any' | 'entity' | 'tile';
  damageKind: SkillDamageKind;
  element?: ElementKey;
  target: NormalizedTechniqueArtsStrengthTarget;
  structure: NormalizedTechniqueArtsStrengthStructure;
  formula: NormalizedTechniqueArtsStrengthFormula;
  totalBudget?: number;
  targetBudget?: number;
  effectsStrength?: TechniqueArtsStrengthEffectInput[];
  playerCast?: unknown;
  monsterCast?: unknown;
  inputBudget: number;
}

export interface NormalizedTechniqueArtsStrengthTemplate {
  skills: [NormalizedTechniqueArtsStrengthSkill];
}

export interface TechniqueArtsStrengthNormalizeResult {
  ok: boolean;
  template?: NormalizedTechniqueArtsStrengthTemplate;
  errors: string[];
}

export interface ExpandTechniqueArtsStrengthSkillParams {
  techniqueId: string;
  grade?: TechniqueGrade;
  realmLv?: number;
  skillIndex?: number;
  skill: NormalizedTechniqueArtsStrengthSkill;
  targetBudget?: number;
}

export interface ExpandedTechniqueArtsStrengthSkill {
  skill: SkillDef;
  inputBudget: number;
  totalBudget: number;
  targetBudget: number;
  effectScale: number;
  structureBudgetMultiplier: number;
}

const ALLOWED_ATTRIBUTE_BASE_STATS = new Set<string>(TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS);
const ELEMENT_KEYS: readonly ElementKey[] = ['metal', 'wood', 'water', 'fire', 'earth'];
const DAMAGE_KINDS: readonly SkillDamageKind[] = ['physical', 'spell'];
const TARGET_TYPES: readonly TechniqueArtsStrengthTargetType[] = ['single', 'line', 'box', 'area', 'orientedBox', 'ring', 'checkerboard'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clampStrength(value: unknown): number {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  return clamp(toFiniteNumber(value, 0), constants.minStrength, constants.maxStrength);
}

export function calculateTechniqueArtsStrengthEfficiencyFactor(weight: number): number {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  if (weight >= 0) {
    return constants.positiveEfficiencyPerStrength ** weight;
  }
  return constants.negativePenaltyPerStrength ** (-weight);
}

export function calculateTechniqueArtsStrengthBudgetMultiplier(weight: number): number {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  if (weight >= 0) {
    return constants.positiveBudgetPerStrength ** weight;
  }
  return constants.negativeBudgetPerStrength ** (-weight);
}

function normalizeTarget(raw: unknown): NormalizedTechniqueArtsStrengthTarget {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  const source = isRecord(raw) ? raw : {};
  const type = TARGET_TYPES.includes(source.type as TechniqueArtsStrengthTargetType)
    ? source.type as TechniqueArtsStrengthTargetType
    : 'single';
  const range = Math.floor(clamp(
    toFiniteNumber(source.range, constants.baseCastRange),
    constants.minRange,
    constants.maxRange,
  ));
  const targetMode = source.targetMode === 'any' || source.targetMode === 'entity' || source.targetMode === 'tile'
    ? source.targetMode
    : undefined;
  const rawTargeting = Object.prototype.hasOwnProperty.call(source, 'rawTargeting')
    ? normalizeRawTargeting(source.rawTargeting)
    : undefined;
  const maxTargets = Number.isFinite(Number(source.maxTargets)) && Number(source.maxTargets) > 0
    ? Math.max(1, Math.floor(Number(source.maxTargets)))
    : undefined;

  if (type === 'line') {
    const width = Math.floor(clamp(toFiniteNumber(source.width, 1), constants.minWidth, constants.maxWidth));
    const coveredCells = Math.max(1, range * width);
    return buildTargetWithStrength({ type, range, width, maxTargets, targetMode, rawTargeting }, coveredCells);
  }
  if (type === 'box') {
    const width = Math.floor(clamp(toFiniteNumber(source.width, 3), constants.minWidth, constants.maxWidth));
    const height = Math.floor(clamp(toFiniteNumber(source.height, width), constants.minWidth, constants.maxWidth));
    return buildTargetWithStrength({ type, range, width, height, maxTargets, targetMode, rawTargeting }, width * height);
  }
  if (type === 'orientedBox') {
    const width = Math.floor(clamp(toFiniteNumber(source.width, 3), constants.minWidth, constants.maxWidth));
    const height = Math.floor(clamp(toFiniteNumber(source.height, 1), constants.minWidth, constants.maxWidth));
    return buildTargetWithStrength({ type, range, width, height, maxTargets, targetMode, rawTargeting }, width * height);
  }
  if (type === 'checkerboard') {
    const width = Math.floor(clamp(toFiniteNumber(source.width, 3), constants.minWidth, constants.maxWidth));
    const height = Math.floor(clamp(toFiniteNumber(source.height, width), constants.minWidth, constants.maxWidth));
    const checkerParity = source.checkerParity === 'odd' ? 'odd' : 'even';
    return buildTargetWithStrength({ type, range, width, height, checkerParity, maxTargets, targetMode, rawTargeting }, Math.ceil(width * height / 2));
  }
  if (type === 'area') {
    const radius = Math.floor(clamp(toFiniteNumber(source.radius, 1), constants.minRadius, constants.maxRadius));
    return buildTargetWithStrength({ type, range, radius, maxTargets, targetMode, rawTargeting }, countCircleCells(radius));
  }
  if (type === 'ring') {
    const radius = Math.floor(clamp(toFiniteNumber(source.radius, 1), constants.minRadius, constants.maxRadius));
    const innerRadius = Math.floor(clamp(toFiniteNumber(source.innerRadius, Math.max(radius - 1, 0)), 0, radius));
    return buildTargetWithStrength({ type, range, radius, innerRadius, maxTargets, targetMode, rawTargeting }, countRingCells(innerRadius, radius));
  }
  return buildTargetWithStrength({ type: 'single', range, maxTargets, targetMode, rawTargeting }, 1);
}

function normalizeRawTargeting(raw: unknown): SkillTargetingDef | null {
  if (raw === null) {
    return null;
  }
  return isRecord(raw) ? { ...raw } as SkillTargetingDef : null;
}

function buildTargetWithStrength(
  target: Omit<NormalizedTechniqueArtsStrengthTarget, 'coveredCells' | 'areaStrength' | 'rangeStrength'>,
  coveredCells: number,
): NormalizedTechniqueArtsStrengthTarget {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  const areaStrength = target.type === 'single'
    ? 0
    : Math.ceil(Math.max(1, coveredCells) / constants.areaCellsPerStrength);
  const rangeStrength = Math.max(0, target.range - constants.baseCastRange) * constants.rangeStrengthPerExtraTile;
  return {
    ...target,
    coveredCells,
    areaStrength,
    rangeStrength,
  };
}

function countCircleCells(radius: number): number {
  let cells = 0;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (x * x + y * y <= radius * radius) {
        cells += 1;
      }
    }
  }
  return Math.max(1, cells);
}

function countRingCells(innerRadius: number, outerRadius: number): number {
  let cells = 0;
  const innerSquared = Math.max(0, innerRadius) ** 2;
  const outerSquared = Math.max(0, outerRadius) ** 2;
  for (let y = -outerRadius; y <= outerRadius; y += 1) {
    for (let x = -outerRadius; x <= outerRadius; x += 1) {
      const distanceSquared = x * x + y * y;
      if (distanceSquared <= outerSquared && distanceSquared > innerSquared) {
        cells += 1;
      }
    }
  }
  return Math.max(1, cells);
}

function normalizeStructure(raw: unknown, target: NormalizedTechniqueArtsStrengthTarget): NormalizedTechniqueArtsStrengthStructure {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  const source = isRecord(raw) ? raw : {};
  const cost = clampStrength(source.cost);
  const cooldown = clampStrength(source.cooldown);
  const chant = clampStrength(source.chant);
  const budgetMultiplier = [
    cost,
    cooldown,
    chant,
    target.areaStrength,
    target.rangeStrength,
  ].reduce((product, strength) => product * calculateTechniqueArtsStrengthBudgetMultiplier(strength), 1);
  const budgetWeight = roundTo(
    Math.abs(cost) + Math.abs(cooldown) + Math.abs(chant) + target.areaStrength + target.rangeStrength,
    4,
  );
  const costMultiplier = Number.isFinite(Number(source.costMultiplier))
    ? Math.max(0, roundTo(Number(source.costMultiplier), 2))
    : roundTo(clamp(
      constants.baseCostMultiplier * calculateTechniqueArtsStrengthEfficiencyFactor(cost),
      constants.minCostMultiplier,
      constants.maxCostMultiplier,
    ), 2);
  const cooldownTicks = Number.isFinite(Number(source.cooldownTicks))
    ? Math.max(0, Math.round(Number(source.cooldownTicks)))
    : Math.round(clamp(
      constants.baseCooldownTicks * calculateTechniqueArtsStrengthEfficiencyFactor(cooldown),
      constants.minCooldownTicks,
      constants.maxCooldownTicks,
    ));
  return {
    cost,
    cooldown,
    chant,
    budgetMultiplier,
    budgetWeight,
    costMultiplier,
    cooldownTicks,
  };
}

function normalizeFormula(raw: unknown): NormalizedTechniqueArtsStrengthFormula {
  const source = isRecord(raw) ? raw : {};
  const rawFormula = isSkillFormula(source.rawFormula) ? source.rawFormula : undefined;
  const flatBase = roundTo(Math.max(0, toFiniteNumber(source.flatBase, 0)), 4);
  const bases = normalizeAttributeBases(source.attributeBases);
  const extraBaseVars = normalizeFormulaVarScales(source.extraBaseVars);
  const percentSource = isRecord(source.percentBonuses) ? source.percentBonuses : {};
  const percentBonuses = {
    techLevel: clamp(
      toFiniteNumber(percentSource.techLevel, 0),
      TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.minStrength,
      TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.maxStrength,
    ),
    moveSpeed: clamp(
      toFiniteNumber(percentSource.moveSpeed, 0),
      TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.minStrength,
      TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.maxStrength,
    ),
  };
  const extraPercentBonuses = normalizeFormulaVarScales(source.extraPercentBonuses);
  const effectStrength = rawFormula
    ? calculateRawFormulaStrength(rawFormula)
    : calculateFormulaEffectStrength(flatBase, bases, extraBaseVars, percentBonuses, extraPercentBonuses);
  return {
    flatBase,
    attributeBases: bases,
    extraBaseVars,
    percentBonuses,
    extraPercentBonuses,
    rawFormula,
    effectStrength,
  };
}

function normalizeFormulaVarScales(raw: unknown): Record<string, number> {
  const source = isRecord(raw) ? raw : {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.trim();
    const normalizedValue = roundTo(toFiniteNumber(value, 0), 6);
    if (normalizedKey && normalizedValue !== 0) {
      result[normalizedKey] = normalizedValue;
    }
  }
  return result;
}

function normalizeAttributeBases(raw: unknown): Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>> {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.attributeBases;
  const source = isRecord(raw) ? raw : {};
  const entries: Array<[TechniqueArtsStrengthAttributeBaseStat, number]> = [];
  for (const [key, value] of Object.entries(source)) {
    if (!ALLOWED_ATTRIBUTE_BASE_STATS.has(key)) {
      continue;
    }
    const scale = roundTo(
      clamp(toFiniteNumber(value, 0), constants.minScale, constants.maxScale),
      constants.decimalPlaces,
    );
    if (scale <= 0) {
      continue;
    }
    entries.push([key as TechniqueArtsStrengthAttributeBaseStat, scale]);
  }
  entries.sort((left, right) => (
    calculateAttributeBaseCost(right[0], right[1]) - calculateAttributeBaseCost(left[0], left[1])
    || left[0].localeCompare(right[0])
  ));
  const result: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>> = {};
  for (const [key, value] of entries.slice(0, constants.maxCount)) {
    result[key] = value;
  }
  return result;
}

function calculateAttributeBaseCost(stat: TechniqueArtsStrengthAttributeBaseStat, scale: number): number {
  return Math.abs(scale) * TECHNIQUE_ARTS_STRENGTH_ATTRIBUTE_BASE_COSTS[stat];
}

function calculateFormulaEffectStrength(
  flatBase: number,
  bases: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>>,
  extraBaseVars: Record<string, number>,
  percentBonuses: NormalizedTechniqueArtsStrengthFormula['percentBonuses'],
  extraPercentBonuses: Record<string, number>,
): number {
  let total = Math.max(0, flatBase);
  for (const [key, value] of Object.entries(bases)) {
    total += calculateAttributeBaseCost(key as TechniqueArtsStrengthAttributeBaseStat, value);
  }
  for (const value of Object.values(extraBaseVars)) {
    total += Math.abs(value);
  }
  total += Math.max(0, percentBonuses.techLevel);
  total += Math.abs(percentBonuses.moveSpeed);
  for (const value of Object.values(extraPercentBonuses)) {
    total += Math.abs(value);
  }
  return roundTo(total, 4);
}

export function normalizeTechniqueArtsStrengthTemplate(raw: unknown): TechniqueArtsStrengthNormalizeResult {
  const source = isRecord(raw) ? raw : {};
  const skills = Array.isArray(source.skills) ? source.skills : [];
  if (skills.length !== TECHNIQUE_ARTS_STRENGTH_CONSTANTS.skillCount.max) {
    return { ok: false, errors: [`AI 术法首版必须且只能包含 ${TECHNIQUE_ARTS_STRENGTH_CONSTANTS.skillCount.max} 个技能`] };
  }
  const normalized = normalizeTechniqueArtsStrengthSkill(skills[0]);
  const errors = validateNormalizedSkill(normalized);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    template: {
      skills: [normalized],
    },
    errors: [],
  };
}

export function normalizeTechniqueArtsStrengthSkill(raw: unknown): NormalizedTechniqueArtsStrengthSkill {
  const source = isRecord(raw) ? raw : {};
  const target = normalizeTarget(source.target);
  const structure = normalizeStructure(source.structureStrength, target);
  const formula = normalizeFormula(source.formulaStrength);
  const inputBudget = roundTo(formula.effectStrength + structure.budgetWeight, 4);
  return {
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : undefined,
    name: normalizeText(source.name, '未命名术法'),
    desc: normalizeText(source.desc, ''),
    unlockLevel: Math.max(1, Math.floor(toFiniteNumber(source.unlockLevel, 1))),
    unlockRealm: Number.isFinite(Number(source.unlockRealm)) ? Math.max(0, Math.floor(Number(source.unlockRealm))) : undefined,
    unlockPlayerRealm: Number.isFinite(Number(source.unlockPlayerRealm)) ? Math.max(0, Math.floor(Number(source.unlockPlayerRealm))) : undefined,
    requiresTarget: typeof source.requiresTarget === 'boolean' ? source.requiresTarget : undefined,
    targetMode: source.targetMode === 'any' || source.targetMode === 'entity' || source.targetMode === 'tile'
      ? source.targetMode
      : undefined,
    damageKind: DAMAGE_KINDS.includes(source.damageKind as SkillDamageKind) ? source.damageKind as SkillDamageKind : 'spell',
    element: ELEMENT_KEYS.includes(source.element as ElementKey) ? source.element as ElementKey : undefined,
    target,
    structure,
    formula,
    totalBudget: resolvePositiveBudget(source.totalBudget),
    targetBudget: resolvePositiveBudget(source.targetBudget),
    effectsStrength: Array.isArray(source.effectsStrength)
      ? source.effectsStrength.filter(isRecord) as TechniqueArtsStrengthEffectInput[]
      : undefined,
    playerCast: isRecord(source.playerCast) ? { ...source.playerCast } : undefined,
    monsterCast: isRecord(source.monsterCast) ? { ...source.monsterCast } : undefined,
    inputBudget,
  };
}

function resolvePositiveBudget(value: unknown): number | undefined {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function validateNormalizedSkill(skill: NormalizedTechniqueArtsStrengthSkill): string[] {
  const errors: string[] = [];
  const baseCount = Object.keys(skill.formula.attributeBases).length;
  const baseConstants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.attributeBases;
  if (baseCount < baseConstants.minCount || baseCount > baseConstants.maxCount) {
    errors.push(`属性基底数量必须在 ${baseConstants.minCount} 到 ${baseConstants.maxCount} 个之间`);
  }
  if (skill.formula.effectStrength <= 0) {
    errors.push('效果强度必须大于 0');
  }
  if (skill.inputBudget <= 0) {
    errors.push('输入预算必须大于 0');
  }
  return errors;
}

export function expandTechniqueArtsStrengthSkill(params: ExpandTechniqueArtsStrengthSkillParams): ExpandedTechniqueArtsStrengthSkill {
  const fullTotalBudget = Number.isFinite(params.targetBudget) && (params.targetBudget ?? 0) > 0
    ? Number(params.targetBudget)
    : Number.isFinite(params.skill.totalBudget) && (params.skill.totalBudget ?? 0) > 0
      ? Number(params.skill.totalBudget)
      : Number.isFinite(params.skill.targetBudget) && (params.skill.targetBudget ?? 0) > 0
        ? Number(params.skill.targetBudget)
        : calculateTechniqueArtsStrengthTotalBudget(params.skill.formula.effectStrength, params.skill.structure.budgetMultiplier);
  const targetBudget = calculateTechniqueArtsStrengthEffectBudget(fullTotalBudget, params.skill.structure.budgetMultiplier);
  const effectScale = params.skill.formula.effectStrength > 0
    ? targetBudget / params.skill.formula.effectStrength
    : 1;
  const skillIndex = Math.max(0, Math.floor(params.skillIndex ?? 0));
  const skillId = params.skill.id ?? `${params.techniqueId}_skill_${skillIndex + 1}`;
  const effects = params.skill.effectsStrength?.length
    ? params.skill.effectsStrength.map((effect) => expandEffectStrength(effect)).filter(Boolean) as SkillEffectDef[]
    : [{
      type: 'damage' as const,
      damageKind: params.skill.damageKind,
      element: params.skill.element,
      formula: buildDamageFormula(params.skill.formula, effectScale),
    }];
  const requiresTarget = typeof params.skill.requiresTarget === 'boolean'
    ? params.skill.requiresTarget
    : params.skill.target.range > 0;
  const targeting = buildTargetingDef(params.skill.target);
  if (!requiresTarget && params.skill.target.rawTargeting === undefined) {
    if (targeting) {
      targeting.requiresTarget = false;
    }
  }
  const explicitRequiresTarget = typeof params.skill.requiresTarget === 'boolean';
  return {
    skill: {
      id: skillId,
      name: params.skill.name,
      desc: params.skill.desc,
      cooldown: params.skill.structure.cooldownTicks,
      cost: calculateTechniqueSkillQiCost(params.skill.structure.costMultiplier, params.grade, params.realmLv),
      costMultiplier: params.skill.structure.costMultiplier,
      range: params.skill.target.range,
      targeting,
      effects,
      unlockLevel: params.skill.unlockLevel,
      unlockRealm: params.skill.unlockRealm as any,
      unlockPlayerRealm: params.skill.unlockPlayerRealm as any,
      ...(explicitRequiresTarget ? { requiresTarget: params.skill.requiresTarget } : requiresTarget ? {} : { requiresTarget: false }),
      targetMode: params.skill.targetMode ?? params.skill.target.targetMode,
      playerCast: params.skill.playerCast as any,
      monsterCast: params.skill.monsterCast as any,
    },
    inputBudget: params.skill.inputBudget,
    totalBudget: fullTotalBudget,
    targetBudget,
    effectScale,
    structureBudgetMultiplier: params.skill.structure.budgetMultiplier,
  };
}

export function expandTechniqueArtsStrengthContentSkill(
  raw: unknown,
  params: Omit<ExpandTechniqueArtsStrengthSkillParams, 'skill'>,
): ExpandedTechniqueArtsStrengthSkill | null {
  const source = isRecord(raw) ? raw : {};
  const strengthSource = isRecord(source.artsStrength)
    ? {
      ...source.artsStrength,
      id: source.id,
      name: source.name,
      desc: source.desc,
      unlockLevel: source.unlockLevel,
      unlockRealm: source.unlockRealm,
      unlockPlayerRealm: source.unlockPlayerRealm,
      requiresTarget: typeof source.requiresTarget === 'boolean'
        ? source.requiresTarget
        : source.artsStrength.requiresTarget,
      targetMode: source.targetMode ?? source.artsStrength.targetMode,
      playerCast: source.playerCast ?? source.artsStrength.playerCast,
      monsterCast: source.monsterCast ?? source.artsStrength.monsterCast,
    }
    : source;
  const normalized = normalizeTechniqueArtsStrengthSkill(strengthSource);
  if (!normalized.id || !normalized.name || !normalized.desc) {
    return null;
  }
  return expandTechniqueArtsStrengthSkill({
    ...params,
    skill: normalized,
    targetBudget: normalized.totalBudget ?? normalized.targetBudget ?? params.targetBudget,
  });
}

export function calculateTechniqueArtsStrengthTotalBudget(effectStrength: number, structureBudgetMultiplier: number): number {
  return roundTo(Math.max(0, effectStrength) * Math.max(0, structureBudgetMultiplier), 4);
}

export function calculateTechniqueArtsStrengthEffectBudget(totalBudget: number, structureBudgetMultiplier: number): number {
  if (!Number.isFinite(totalBudget) || totalBudget <= 0) {
    return 0;
  }
  if (!Number.isFinite(structureBudgetMultiplier) || structureBudgetMultiplier <= 0) {
    return totalBudget;
  }
  return totalBudget / structureBudgetMultiplier;
}

function buildDamageFormula(
  formula: NormalizedTechniqueArtsStrengthFormula,
  effectScale = 1,
): SkillFormula {
  if (formula.rawFormula) {
    return scaleWholeFormula(formula.rawFormula, effectScale);
  }
  const baseArgs: SkillFormula[] = [];
  if (formula.flatBase > 0) {
    baseArgs.push(formula.flatBase);
  }
  for (const [key, value] of Object.entries(formula.attributeBases)) {
    baseArgs.push({
      var: `caster.stat.${key as NumericScalarStatKey}`,
      scale: value,
    });
  }
  for (const [key, value] of Object.entries(formula.extraBaseVars)) {
    baseArgs.push({
      var: key as SkillFormulaVar,
      scale: value,
    });
  }
  const percentArgs: SkillFormula[] = [
    1,
    {
      var: 'techLevel',
      scale: calculateTechLevelScale(formula.percentBonuses.techLevel),
    },
  ];
  const moveSpeedScale = roundTo(
    formula.percentBonuses.moveSpeed
    * TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.moveSpeedScalePerStrength,
    6,
  );
  if (moveSpeedScale !== 0) {
    percentArgs.push({
      var: 'caster.stat.moveSpeed',
      scale: moveSpeedScale,
    });
  }
  for (const [key, value] of Object.entries(formula.extraPercentBonuses)) {
    percentArgs.push({
      var: key as SkillFormulaVar,
      scale: value,
    });
  }
  const baseFormula: SkillFormula = baseArgs.length === 0
    ? 0
    : baseArgs.length === 1 ? baseArgs[0]! : { op: 'add', args: baseArgs };
  const hasPercentBonus = percentArgs.some((entry, index) => (
    index > 0 && isFormulaVarRef(entry) && toFiniteNumber(entry.scale, 0) !== 0
  ));
  if (!hasPercentBonus) {
    return scaleWholeFormula(baseFormula, effectScale);
  }
  const result: SkillFormula = {
    op: 'mul',
    args: [
      baseFormula,
      { op: 'add', args: percentArgs },
    ],
  };
  return scaleWholeFormula(result, effectScale);
}

function isFormulaVarRef(value: SkillFormula): value is { var: SkillFormulaVar; scale?: number } {
  return isRecord(value) && typeof (value as Record<string, unknown>).var === 'string';
}

function expandEffectStrength(effect: TechniqueArtsStrengthEffectInput): SkillEffectDef | null {
  const type = typeof effect.type === 'string' ? effect.type : '';
  const {
    formulaStrength: _formulaStrength,
    hpFormulaStrength: _hpFormulaStrength,
    effectBudget: _effectBudget,
    targetBudget: _targetBudget,
    ...rest
  } = effect;
  if (type === 'damage' || type === 'heal') {
    const formula = normalizeFormula(effect.formulaStrength);
    return {
      ...rest,
      type,
      formula: scaleWholeFormula(
        formula.rawFormula ?? buildDamageFormula(formula),
        resolveEffectScale(formula.effectStrength, effect.effectBudget ?? effect.targetBudget),
      ),
    } as SkillEffectDef;
  }
  if (type === 'temporary_tile') {
    const formula = normalizeFormula(effect.hpFormulaStrength);
    return {
      ...rest,
      type,
      hpFormula: scaleWholeFormula(
        formula.rawFormula ?? buildDamageFormula(formula),
        resolveEffectScale(formula.effectStrength, effect.effectBudget ?? effect.targetBudget),
      ),
    } as SkillEffectDef;
  }
  return { ...rest, type } as SkillEffectDef;
}

function resolveEffectScale(effectStrength: number, targetBudget: unknown): number {
  const budget = Number(targetBudget);
  if (!Number.isFinite(budget) || budget <= 0 || effectStrength <= 0) {
    return 1;
  }
  return budget / effectStrength;
}

function scaleWholeFormula(formula: SkillFormula, scale: number): SkillFormula {
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 1e-9) {
    return formula;
  }
  return {
    op: 'mul',
    args: [
      formula,
      roundTo(scale, 6),
    ],
  };
}

function calculateRawFormulaStrength(formula: SkillFormula): number {
  if (typeof formula === 'number') {
    return Math.abs(formula);
  }
  if (!isRecord(formula)) {
    return 0;
  }
  const record = formula as Record<string, unknown>;
  if (typeof record.var === 'string') {
    return Math.abs(toFiniteNumber(record.scale, 1));
  }
  if (Array.isArray(record.args)) {
    return roundTo(record.args.reduce((sum: number, entry: unknown) => (
      sum + (isSkillFormula(entry) ? calculateRawFormulaStrength(entry) : 0)
    ), 0), 4);
  }
  if (isSkillFormula(record.value)) {
    return calculateRawFormulaStrength(record.value);
  }
  return 0;
}

function isSkillFormula(value: unknown): value is SkillFormula {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.var === 'string') {
    return true;
  }
  if (typeof value.op === 'string' && Array.isArray(value.args)) {
    return value.args.every(isSkillFormula);
  }
  if (value.op === 'clamp') {
    return isSkillFormula(value.value)
      && (value.min === undefined || isSkillFormula(value.min))
      && (value.max === undefined || isSkillFormula(value.max));
  }
  return false;
}

function calculateTechLevelScale(strength: number): number {
  const base = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.techLevelScaleBase;
  return roundTo(Math.max(0, base * (1 + strength)), 6);
}

function buildTargetingDef(target: NormalizedTechniqueArtsStrengthTarget): SkillTargetingDef | undefined {
  if (target.rawTargeting !== undefined) {
    return target.rawTargeting === null ? undefined : { ...target.rawTargeting };
  }
  if (target.type === 'line') {
    return stripUndefinedTargeting({
      shape: 'line',
      range: target.range,
      width: target.width,
      maxTargets: target.maxTargets,
      targetMode: target.targetMode,
    });
  }
  if (target.type === 'box') {
    return stripUndefinedTargeting({
      shape: 'box',
      range: target.range,
      width: target.width,
      height: target.height,
      maxTargets: target.maxTargets,
      targetMode: target.targetMode,
    });
  }
  if (target.type === 'orientedBox') {
    return stripUndefinedTargeting({
      shape: 'orientedBox',
      range: target.range,
      width: target.width,
      height: target.height,
      maxTargets: target.maxTargets,
      targetMode: target.targetMode,
    });
  }
  if (target.type === 'checkerboard') {
    return stripUndefinedTargeting({
      shape: 'checkerboard',
      range: target.range,
      width: target.width,
      height: target.height,
      checkerParity: target.checkerParity,
      maxTargets: target.maxTargets,
      targetMode: target.targetMode,
    });
  }
  if (target.type === 'area') {
    return stripUndefinedTargeting({
      shape: 'area',
      range: target.range,
      radius: target.radius,
      maxTargets: target.maxTargets,
      targetMode: target.targetMode,
    });
  }
  if (target.type === 'ring') {
    return stripUndefinedTargeting({
      shape: 'ring',
      range: target.range,
      radius: target.radius,
      innerRadius: target.innerRadius,
      maxTargets: target.maxTargets,
      targetMode: target.targetMode,
    });
  }
  return stripUndefinedTargeting({
    shape: 'single',
    range: target.range,
    maxTargets: target.maxTargets,
    targetMode: target.targetMode,
  });
}

function stripUndefinedTargeting(targeting: SkillTargetingDef): SkillTargetingDef {
  const result: SkillTargetingDef = {};
  for (const [key, value] of Object.entries(targeting) as Array<[keyof SkillTargetingDef, unknown]>) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
