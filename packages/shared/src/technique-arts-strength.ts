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
  castRangeWeight?: number;
  areaWeight?: number;
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
  budgetBreakdown: TechniqueArtsStrengthBudgetBreakdown;
}

export interface TechniqueArtsStrengthBudgetBreakdown {
  totalWeight: number;
  refundedBudget: number;
  redistributedBudget: number;
  items: TechniqueArtsStrengthBudgetBreakdownItem[];
}

export interface TechniqueArtsStrengthBudgetBreakdownItem {
  key: string;
  weight: number;
  allocatedBudget: number;
  usedBudget: number;
  refundBudget: number;
  value?: number | string;
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
  const source = isRecord(raw) ? raw : {};
  const type = TARGET_TYPES.includes(source.type as TechniqueArtsStrengthTargetType)
    ? source.type as TechniqueArtsStrengthTargetType
    : 'single';
  const range = normalizePositiveWeight(source.castRangeWeight);
  const areaWeight = normalizePositiveWeight(source.areaWeight);
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
    return buildTargetWithStrength({ type, range, width: areaWeight, maxTargets, targetMode, rawTargeting }, estimateCoveredCellsFromWeight(areaWeight));
  }
  if (type === 'box') {
    return buildTargetWithStrength({ type, range, width: areaWeight, height: areaWeight, maxTargets, targetMode, rawTargeting }, estimateCoveredCellsFromWeight(areaWeight));
  }
  if (type === 'orientedBox') {
    return buildTargetWithStrength({ type, range, width: areaWeight, height: areaWeight, maxTargets, targetMode, rawTargeting }, estimateCoveredCellsFromWeight(areaWeight));
  }
  if (type === 'checkerboard') {
    const checkerParity = source.checkerParity === 'odd' ? 'odd' : 'even';
    return buildTargetWithStrength({ type, range, width: areaWeight, height: areaWeight, checkerParity, maxTargets, targetMode, rawTargeting }, estimateCoveredCellsFromWeight(areaWeight));
  }
  if (type === 'area') {
    return buildTargetWithStrength({ type, range, radius: areaWeight, maxTargets, targetMode, rawTargeting }, estimateCoveredCellsFromWeight(areaWeight));
  }
  if (type === 'ring') {
    const radius = areaWeight;
    const innerRadius = normalizePositiveWeight(source.innerRadius);
    return buildTargetWithStrength({ type, range, radius, innerRadius, maxTargets, targetMode, rawTargeting }, estimateCoveredCellsFromWeight(radius));
  }
  return buildTargetWithStrength({ type: 'single', range, maxTargets, targetMode, rawTargeting }, 1);
}

function normalizePositiveWeight(value: unknown): number {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.weights;
  return roundTo(clamp(toFiniteNumber(value, 0), 0, constants.max), 4);
}

function estimateCoveredCellsFromWeight(weight: number): number {
  return Math.max(1, 1 + Math.max(0, weight) * TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure.coverageCellsPerBudget);
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
    : Math.max(0, (Math.max(1, coveredCells) - 1) / constants.coverageCellsPerBudget);
  const rangeStrength = Math.max(0, target.range);
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
  const budgetMultiplier = 1;
  const budgetWeight = roundTo(
    Math.abs(cost) + Math.abs(cooldown) + Math.abs(chant) + target.areaStrength + target.rangeStrength,
    4,
  );
  const costMultiplier = Number.isFinite(Number(source.costMultiplier))
    ? Math.max(0, roundTo(Number(source.costMultiplier), 2))
    : constants.baseCostMultiplier;
  const cooldownTicks = Number.isFinite(Number(source.cooldownTicks))
    ? Math.max(0, Math.round(Number(source.cooldownTicks)))
    : constants.minCooldownTicks;
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
    : calculateFormulaEffectStrength(bases, extraBaseVars, percentBonuses, extraPercentBonuses);
  return {
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
  bases: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>>,
  extraBaseVars: Record<string, number>,
  percentBonuses: NormalizedTechniqueArtsStrengthFormula['percentBonuses'],
  extraPercentBonuses: Record<string, number>,
): number {
  let total = 0;
  for (const value of Object.values(bases)) {
    total += Math.abs(value);
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

type BudgetItemKind =
  | 'castRange'
  | 'shape'
  | 'cost'
  | 'cooldown'
  | 'chant'
  | 'attributeBase'
  | 'extraBaseVar'
  | 'percentBonus'
  | 'extraPercentBonus';

interface BudgetItem {
  key: string;
  kind: BudgetItemKind;
  weight: number;
  stat?: TechniqueArtsStrengthAttributeBaseStat;
  varName?: string;
}

interface BudgetConversionResult<T> {
  value: T;
  usedBudget: number;
  refundBudget: number;
}

interface ConvertedFormulaBudget {
  formula: NormalizedTechniqueArtsStrengthFormula;
  items: TechniqueArtsStrengthBudgetBreakdownItem[];
  redistributedBudget: number;
}

function buildBudgetItems(skill: NormalizedTechniqueArtsStrengthSkill): BudgetItem[] {
  const items: BudgetItem[] = [];
  if (skill.target.range > 0) {
    items.push({ key: 'target.castRangeWeight', kind: 'castRange', weight: skill.target.range });
  }
  const shapeWeight = resolveTargetShapeWeight(skill.target);
  if (shapeWeight > 0) {
    items.push({ key: 'target.areaWeight', kind: 'shape', weight: shapeWeight });
  }
  if (skill.structure.cost !== 0) {
    items.push({ key: 'structure.cost', kind: 'cost', weight: skill.structure.cost });
  }
  if (skill.structure.cooldown !== 0) {
    items.push({ key: 'structure.cooldown', kind: 'cooldown', weight: skill.structure.cooldown });
  }
  if (skill.structure.chant !== 0) {
    items.push({ key: 'structure.chant', kind: 'chant', weight: skill.structure.chant });
  }
  for (const [stat, weight] of Object.entries(skill.formula.attributeBases)) {
    if (weight > 0) {
      items.push({
        key: `formula.attributeBases.${stat}`,
        kind: 'attributeBase',
        weight,
        stat: stat as TechniqueArtsStrengthAttributeBaseStat,
      });
    }
  }
  for (const [varName, weight] of Object.entries(skill.formula.extraBaseVars)) {
    if (weight !== 0) {
      items.push({ key: `formula.extraBaseVars.${varName}`, kind: 'extraBaseVar', weight, varName });
    }
  }
  if (skill.formula.percentBonuses.techLevel !== 0) {
    items.push({
      key: 'formula.percentBonuses.techLevel',
      kind: 'percentBonus',
      weight: skill.formula.percentBonuses.techLevel,
      varName: 'techLevel',
    });
  }
  if (skill.formula.percentBonuses.moveSpeed !== 0) {
    items.push({
      key: 'formula.percentBonuses.moveSpeed',
      kind: 'percentBonus',
      weight: skill.formula.percentBonuses.moveSpeed,
      varName: 'moveSpeed',
    });
  }
  for (const [varName, weight] of Object.entries(skill.formula.extraPercentBonuses)) {
    if (weight !== 0) {
      items.push({ key: `formula.extraPercentBonuses.${varName}`, kind: 'extraPercentBonus', weight, varName });
    }
  }
  return items;
}

function resolveTargetShapeWeight(target: NormalizedTechniqueArtsStrengthTarget): number {
  if (target.type === 'single') {
    return 0;
  }
  if (target.type === 'area' || target.type === 'ring') {
    return Math.max(0, target.radius ?? 0);
  }
  return Math.max(0, target.width ?? 0, target.height ?? 0);
}

function allocateBudgets(items: BudgetItem[], totalBudget: number): Map<string, number> {
  const totalWeight = items.reduce((sum, item) => sum + Math.abs(item.weight), 0);
  const allocations = new Map<string, number>();
  if (totalWeight <= 0 || totalBudget <= 0) {
    return allocations;
  }
  for (const item of items) {
    allocations.set(item.key, totalBudget * item.weight / totalWeight);
  }
  return allocations;
}

function readAllocatedBudget(allocations: Map<string, number>, key: string): number {
  return allocations.get(key) ?? 0;
}

function convertCastRangeBudget(budget: number, maxRange: number): BudgetConversionResult<number> {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  const positiveBudget = Math.max(0, budget);
  const cappedMaxRange = Math.max(constants.minCastRange, Math.floor(maxRange));
  let range = constants.minCastRange;
  let usedBudget = 0;
  for (let candidate = constants.minCastRange; candidate <= cappedMaxRange; candidate += 1) {
    const cost = calculateCastRangeBudgetCost(candidate);
    if (cost <= positiveBudget + 1e-9) {
      range = candidate;
      usedBudget = cost;
    } else {
      break;
    }
  }
  return {
    value: range,
    usedBudget: roundTo(usedBudget, 6),
    refundBudget: roundTo(Math.max(0, positiveBudget - usedBudget), 6),
  };
}

function calculateCastRangeBudgetCost(range: number): number {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  const normalizedRange = Math.max(constants.minCastRange, Math.floor(range));
  if (normalizedRange <= constants.minCastRange) {
    return 0;
  }
  const extraRange = normalizedRange - constants.minCastRange;
  return extraRange * (constants.castRangeBudgetGrowth ** extraRange);
}

function convertTargetBudget(
  target: NormalizedTechniqueArtsStrengthTarget,
  rangeBudget: number,
  shapeBudget: number,
): {
  target: NormalizedTechniqueArtsStrengthTarget;
  range: BudgetConversionResult<number>;
  shape: BudgetConversionResult<NormalizedTechniqueArtsStrengthTarget>;
} {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  const maxRange = target.type === 'line' ? constants.maxLineCastRange : constants.maxCastRange;
  const range = convertCastRangeBudget(rangeBudget, maxRange);
  const positiveShapeBudget = Math.max(0, shapeBudget);
  const maxCoveredCells = 1 + positiveShapeBudget * constants.coverageCellsPerBudget;
  const baseTarget = {
    maxTargets: target.maxTargets,
    targetMode: target.targetMode,
    rawTargeting: target.rawTargeting,
  };
  let converted: NormalizedTechniqueArtsStrengthTarget;
  let usedShapeBudget = 0;
  if (target.type === 'line') {
    const lineLength = Math.max(1, range.value);
    let width = constants.minWidth;
    for (let candidate = constants.minWidth; candidate <= constants.maxWidth; candidate += 2) {
      const cells = lineLength * candidate;
      if (cells <= lineLength + positiveShapeBudget * constants.coverageCellsPerBudget + 1e-9) {
        width = candidate;
        usedShapeBudget = (cells - lineLength) / constants.coverageCellsPerBudget;
      }
    }
    converted = buildTargetWithStrength({ ...baseTarget, type: 'line', range: range.value, width }, lineLength * width);
  } else if (target.type === 'box' || target.type === 'orientedBox' || target.type === 'checkerboard') {
    let side = constants.minWidth;
    for (let candidate = constants.minWidth; candidate <= constants.maxBoxSide; candidate += 2) {
      const cells = candidate * candidate;
      if (cells <= maxCoveredCells + 1e-9) {
        side = candidate;
        usedShapeBudget = (cells - 1) / constants.coverageCellsPerBudget;
      }
    }
    const type = target.type === 'orientedBox' || target.type === 'checkerboard' ? target.type : 'box';
    converted = buildTargetWithStrength({
      ...baseTarget,
      type,
      range: range.value,
      width: side,
      height: side,
      checkerParity: target.checkerParity,
    }, type === 'checkerboard' ? Math.ceil(side * side / 2) : side * side);
  } else if (target.type === 'area' || target.type === 'ring') {
    let radius = constants.minRadius;
    for (let candidate = constants.minRadius; candidate <= constants.maxRadius; candidate += 1) {
      const cells = countCircleCells(candidate);
      if (cells <= maxCoveredCells + 1e-9) {
        radius = candidate;
        usedShapeBudget = (cells - 1) / constants.coverageCellsPerBudget;
      }
    }
    if (target.type === 'ring') {
      const innerRadius = Math.max(0, Math.min(radius, Math.floor(target.innerRadius ?? Math.max(radius - 1, 0))));
      const coveredCells = countRingCells(innerRadius, radius);
      converted = buildTargetWithStrength({ ...baseTarget, type: 'ring', range: range.value, radius, innerRadius }, coveredCells);
    } else {
      converted = buildTargetWithStrength({ ...baseTarget, type: 'area', range: range.value, radius }, countCircleCells(radius));
    }
  } else {
    converted = buildTargetWithStrength({ ...baseTarget, type: 'single', range: range.value }, 1);
  }
  return {
    target: converted,
    range,
    shape: {
      value: converted,
      usedBudget: roundTo(usedShapeBudget, 6),
      refundBudget: roundTo(Math.max(0, positiveShapeBudget - usedShapeBudget), 6),
    },
  };
}

function convertCostBudget(budget: number): BudgetConversionResult<number> {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  const multiplier = budget >= 0
    ? constants.baseCostMultiplier * (constants.costPositivePerBudget ** budget)
    : constants.baseCostMultiplier * (constants.costNegativePerBudget ** Math.abs(budget));
  return {
    value: roundTo(Math.max(constants.minCostMultiplier, multiplier), 6),
    usedBudget: budget,
    refundBudget: 0,
  };
}

function convertCooldownBudget(budget: number, realmLv: number | undefined): BudgetConversionResult<number> {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  const baseCooldown = Math.max(constants.minCooldownTicks, (Math.max(1, Math.floor(realmLv ?? 1)) * constants.cooldownBaseRealmLvMultiplier));
  if (budget < 0) {
    return {
      value: Math.max(constants.minCooldownTicks, Math.round(baseCooldown * (constants.cooldownNegativePerBudget ** Math.abs(budget)))),
      usedBudget: budget,
      refundBudget: 0,
    };
  }
  const rawTicks = baseCooldown * (constants.cooldownPositivePerBudget ** budget);
  const ticks = Math.max(constants.minCooldownTicks, Math.round(rawTicks));
  const exactUsed = ticks <= constants.minCooldownTicks
    ? Math.log(constants.minCooldownTicks / baseCooldown) / Math.log(constants.cooldownPositivePerBudget)
    : Math.log(ticks / baseCooldown) / Math.log(constants.cooldownPositivePerBudget);
  const usedBudget = clamp(Number.isFinite(exactUsed) ? exactUsed : budget, 0, budget);
  return {
    value: ticks,
    usedBudget: roundTo(usedBudget, 6),
    refundBudget: roundTo(Math.max(0, budget - usedBudget), 6),
  };
}

function convertChantBudget(budget: number): BudgetConversionResult<number> {
  if (budget >= 0) {
    return { value: 0, usedBudget: 0, refundBudget: roundTo(budget, 6) };
  }
  return { value: Math.round(Math.abs(budget)), usedBudget: budget, refundBudget: 0 };
}

function convertFormulaBudget(
  formula: NormalizedTechniqueArtsStrengthFormula,
  items: BudgetItem[],
  allocations: Map<string, number>,
  positiveRefundBudget: number,
): ConvertedFormulaBudget {
  const attributeItems = items.filter((item) => item.kind === 'attributeBase' && item.stat);
  const attributeWeight = attributeItems.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  const extraBaseItems = items.filter((item) => item.kind === 'extraBaseVar' && item.varName);
  const fallbackItems = attributeWeight > 0 ? attributeItems : extraBaseItems;
  const fallbackWeight = fallbackItems.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  let redistributedBudget = 0;
  const converted: NormalizedTechniqueArtsStrengthFormula = {
    attributeBases: {},
    extraBaseVars: {},
    percentBonuses: {
      techLevel: readAllocatedBudget(allocations, 'formula.percentBonuses.techLevel'),
      moveSpeed: readAllocatedBudget(allocations, 'formula.percentBonuses.moveSpeed'),
    },
    extraPercentBonuses: {},
    rawFormula: formula.rawFormula,
    effectStrength: 0,
  };
  const breakdownItems: TechniqueArtsStrengthBudgetBreakdownItem[] = [];

  for (const item of attributeItems) {
    const allocatedBudget = readAllocatedBudget(allocations, item.key);
    const refundShare = fallbackWeight > 0 && positiveRefundBudget > 0
      ? positiveRefundBudget * Math.max(0, item.weight) / fallbackWeight
      : 0;
    redistributedBudget += refundShare;
    const finalBudget = Math.max(0, allocatedBudget + refundShare);
    const stat = item.stat!;
    converted.attributeBases[stat] = roundTo(finalBudget / TECHNIQUE_ARTS_STRENGTH_ATTRIBUTE_BASE_COSTS[stat], 6);
    breakdownItems.push(buildBreakdownItem(item, allocatedBudget, finalBudget, 0, converted.attributeBases[stat]));
  }

  for (const item of extraBaseItems) {
    const allocatedBudget = readAllocatedBudget(allocations, item.key);
    const refundShare = fallbackWeight > 0 && attributeWeight <= 0 && positiveRefundBudget > 0
      ? positiveRefundBudget * Math.max(0, item.weight) / fallbackWeight
      : 0;
    redistributedBudget += refundShare;
    const finalBudget = allocatedBudget + refundShare;
    converted.extraBaseVars[item.varName!] = roundTo(finalBudget, 6);
    breakdownItems.push(buildBreakdownItem(item, allocatedBudget, finalBudget, 0, converted.extraBaseVars[item.varName!]));
  }

  for (const item of items) {
    if (item.kind !== 'percentBonus' && item.kind !== 'extraPercentBonus') {
      continue;
    }
    const allocatedBudget = readAllocatedBudget(allocations, item.key);
    if (item.kind === 'percentBonus' && item.varName === 'techLevel') {
      converted.percentBonuses.techLevel = allocatedBudget;
      breakdownItems.push(buildBreakdownItem(item, allocatedBudget, allocatedBudget, 0, calculateTechLevelScale(allocatedBudget)));
    } else if (item.kind === 'percentBonus' && item.varName === 'moveSpeed') {
      converted.percentBonuses.moveSpeed = Math.max(0, allocatedBudget);
      breakdownItems.push(buildBreakdownItem(item, allocatedBudget, allocatedBudget, 0, roundTo(Math.max(0, allocatedBudget) * TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.moveSpeedScalePerStrength, 6)));
    } else if (item.varName) {
      converted.extraPercentBonuses[item.varName] = allocatedBudget;
      breakdownItems.push(buildBreakdownItem(item, allocatedBudget, allocatedBudget, 0, allocatedBudget));
    }
  }

  converted.effectStrength = roundTo(
    breakdownItems.reduce((sum, item) => sum + Math.max(0, item.usedBudget), 0),
    6,
  );
  return {
    formula: converted,
    items: breakdownItems,
    redistributedBudget: roundTo(redistributedBudget, 6),
  };
}

function buildBreakdownItem(
  item: BudgetItem,
  allocatedBudget: number,
  usedBudget: number,
  refundBudget: number,
  value?: number | string,
): TechniqueArtsStrengthBudgetBreakdownItem {
  return {
    key: item.key,
    weight: roundTo(item.weight, 6),
    allocatedBudget: roundTo(allocatedBudget, 6),
    usedBudget: roundTo(usedBudget, 6),
    refundBudget: roundTo(Math.max(0, refundBudget), 6),
    ...(value !== undefined ? { value: typeof value === 'number' ? roundTo(value, 6) : value } : {}),
  };
}

export function expandTechniqueArtsStrengthSkill(params: ExpandTechniqueArtsStrengthSkillParams): ExpandedTechniqueArtsStrengthSkill {
  const fullTotalBudget = Number.isFinite(params.targetBudget) && (params.targetBudget ?? 0) > 0
    ? Number(params.targetBudget)
    : Number.isFinite(params.skill.totalBudget) && (params.skill.totalBudget ?? 0) > 0
      ? Number(params.skill.totalBudget)
      : Number.isFinite(params.skill.targetBudget) && (params.skill.targetBudget ?? 0) > 0
        ? Number(params.skill.targetBudget)
        : params.skill.inputBudget;
  const budgetItems = buildBudgetItems(params.skill);
  const totalWeight = budgetItems.reduce((sum, item) => sum + Math.abs(item.weight), 0);
  const allocations = allocateBudgets(budgetItems, fullTotalBudget);
  const targetConversion = convertTargetBudget(
    params.skill.target,
    readAllocatedBudget(allocations, 'target.castRangeWeight'),
    readAllocatedBudget(allocations, 'target.areaWeight'),
  );
  const costConversion = convertCostBudget(readAllocatedBudget(allocations, 'structure.cost'));
  const cooldownConversion = convertCooldownBudget(readAllocatedBudget(allocations, 'structure.cooldown'), params.realmLv);
  const chantConversion = convertChantBudget(readAllocatedBudget(allocations, 'structure.chant'));
  const positiveRefundBudget = targetConversion.range.refundBudget
    + targetConversion.shape.refundBudget
    + cooldownConversion.refundBudget
    + chantConversion.refundBudget;
  const formulaConversion = convertFormulaBudget(params.skill.formula, budgetItems, allocations, positiveRefundBudget);
  const targetBudget = formulaConversion.formula.effectStrength;
  const effectScale = 1;
  const skillIndex = Math.max(0, Math.floor(params.skillIndex ?? 0));
  const skillId = params.skill.id ?? `${params.techniqueId}_skill_${skillIndex + 1}`;
  const effects = params.skill.effectsStrength?.length
    ? params.skill.effectsStrength.map((effect) => expandEffectStrength(effect)).filter(Boolean) as SkillEffectDef[]
    : [{
      type: 'damage' as const,
      damageKind: params.skill.damageKind,
      element: params.skill.element,
      formula: buildDamageFormula(formulaConversion.formula, effectScale),
    }];
  const requiresTarget = typeof params.skill.requiresTarget === 'boolean'
    ? params.skill.requiresTarget
    : targetConversion.target.range > 0;
  const targeting = buildTargetingDef(targetConversion.target);
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
      cooldown: cooldownConversion.value,
      cost: calculateTechniqueSkillQiCost(costConversion.value, params.grade, params.realmLv),
      costMultiplier: costConversion.value,
      range: targetConversion.target.range,
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
    structureBudgetMultiplier: 1,
    budgetBreakdown: {
      totalWeight: roundTo(totalWeight, 6),
      refundedBudget: roundTo(positiveRefundBudget, 6),
      redistributedBudget: formulaConversion.redistributedBudget,
      items: [
        buildBreakdownItem({ key: 'target.castRangeWeight', kind: 'castRange', weight: params.skill.target.range }, readAllocatedBudget(allocations, 'target.castRangeWeight'), targetConversion.range.usedBudget, targetConversion.range.refundBudget, targetConversion.target.range),
        buildBreakdownItem({ key: 'target.areaWeight', kind: 'shape', weight: resolveTargetShapeWeight(params.skill.target) }, readAllocatedBudget(allocations, 'target.areaWeight'), targetConversion.shape.usedBudget, targetConversion.shape.refundBudget, `${targetConversion.target.type}:${targetConversion.target.coveredCells}`),
        buildBreakdownItem({ key: 'structure.cost', kind: 'cost', weight: params.skill.structure.cost }, readAllocatedBudget(allocations, 'structure.cost'), costConversion.usedBudget, costConversion.refundBudget, costConversion.value),
        buildBreakdownItem({ key: 'structure.cooldown', kind: 'cooldown', weight: params.skill.structure.cooldown }, readAllocatedBudget(allocations, 'structure.cooldown'), cooldownConversion.usedBudget, cooldownConversion.refundBudget, cooldownConversion.value),
        buildBreakdownItem({ key: 'structure.chant', kind: 'chant', weight: params.skill.structure.chant }, readAllocatedBudget(allocations, 'structure.chant'), chantConversion.usedBudget, chantConversion.refundBudget, chantConversion.value),
        ...formulaConversion.items,
      ].filter((item) => item.weight !== 0 || item.allocatedBudget !== 0 || item.usedBudget !== 0 || item.refundBudget !== 0),
    },
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
    Math.max(0, formula.percentBonuses.moveSpeed)
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
