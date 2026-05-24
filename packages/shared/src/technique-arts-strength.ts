/**
 * 本文件定义 AI 术法强度模板的共享解析与展开函数。
 *
 * 维护时保持纯函数，不引入服务端持久化、客户端 UI 或运行时状态。
 */
import type { ElementKey, NumericScalarStatKey } from './numeric';
import type { SkillDamageKind, SkillDef, SkillFormula, SkillTargetingDef } from './skill-types';
import type { TechniqueGrade } from './cultivation-types';
import { calculateTechniqueSkillQiCost } from './technique';
import {
  TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS,
  TECHNIQUE_ARTS_STRENGTH_ATTRIBUTE_BASE_COSTS,
  TECHNIQUE_ARTS_STRENGTH_CONSTANTS,
} from './constants/gameplay/technique-arts-strength';

export type TechniqueArtsStrengthAttributeBaseStat = typeof TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS[number];

export type TechniqueArtsStrengthTargetType = 'single' | 'line' | 'box' | 'area';

export interface TechniqueArtsStrengthTargetInput {
  type?: TechniqueArtsStrengthTargetType;
  range?: number;
  width?: number;
  height?: number;
  radius?: number;
  targetMode?: 'any' | 'entity' | 'tile';
}

export interface TechniqueArtsStrengthStructureInput {
  cost?: number;
  cooldown?: number;
  chant?: number;
}

export interface TechniqueArtsStrengthFormulaInput {
  attributeBases?: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>>;
  percentBonuses?: {
    techLevel?: number;
    moveSpeed?: number;
  };
}

export interface TechniqueArtsStrengthSkillInput {
  name?: string;
  desc?: string;
  unlockLevel?: number;
  damageKind?: SkillDamageKind;
  element?: ElementKey;
  target?: TechniqueArtsStrengthTargetInput;
  structureStrength?: TechniqueArtsStrengthStructureInput;
  formulaStrength?: TechniqueArtsStrengthFormulaInput;
}

export interface TechniqueArtsStrengthTemplateInput {
  skills?: TechniqueArtsStrengthSkillInput[];
}

export interface NormalizedTechniqueArtsStrengthTarget {
  type: TechniqueArtsStrengthTargetType;
  range: number;
  width?: number;
  height?: number;
  radius?: number;
  targetMode?: 'any' | 'entity' | 'tile';
  coveredCells: number;
  areaStrength: number;
  rangeStrength: number;
}

export interface NormalizedTechniqueArtsStrengthStructure {
  cost: number;
  cooldown: number;
  chant: number;
  budgetMultiplier: number;
  costMultiplier: number;
  cooldownTicks: number;
}

export interface NormalizedTechniqueArtsStrengthFormula {
  attributeBases: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>>;
  percentBonuses: {
    techLevel: number;
    moveSpeed: number;
  };
  effectStrength: number;
}

export interface NormalizedTechniqueArtsStrengthSkill {
  name: string;
  desc: string;
  unlockLevel: number;
  damageKind: SkillDamageKind;
  element?: ElementKey;
  target: NormalizedTechniqueArtsStrengthTarget;
  structure: NormalizedTechniqueArtsStrengthStructure;
  formula: NormalizedTechniqueArtsStrengthFormula;
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
  targetBudget: number;
  effectScale: number;
  structureBudgetMultiplier: number;
}

const ALLOWED_ATTRIBUTE_BASE_STATS = new Set<string>(TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS);
const ELEMENT_KEYS: readonly ElementKey[] = ['metal', 'wood', 'water', 'fire', 'earth'];
const DAMAGE_KINDS: readonly SkillDamageKind[] = ['physical', 'spell'];
const TARGET_TYPES: readonly TechniqueArtsStrengthTargetType[] = ['single', 'line', 'box', 'area'];

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

export function calculateTechniqueArtsStrengthEfficiencyFactor(strength: number): number {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  if (strength >= 0) {
    return constants.positiveEfficiencyPerStrength ** strength;
  }
  return constants.negativePenaltyPerStrength ** (-strength);
}

export function calculateTechniqueArtsStrengthBudgetMultiplier(strength: number): number {
  const constants = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure;
  if (strength >= 0) {
    return constants.positiveBudgetPerStrength ** strength;
  }
  return constants.negativeBudgetPerStrength ** (-strength);
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

  if (type === 'line') {
    const width = Math.floor(clamp(toFiniteNumber(source.width, 1), constants.minWidth, constants.maxWidth));
    const coveredCells = Math.max(1, range * width);
    return buildTargetWithStrength({ type, range, width, targetMode: targetMode ?? 'tile' }, coveredCells);
  }
  if (type === 'box') {
    const width = Math.floor(clamp(toFiniteNumber(source.width, 3), constants.minWidth, constants.maxWidth));
    const height = Math.floor(clamp(toFiniteNumber(source.height, width), constants.minWidth, constants.maxWidth));
    return buildTargetWithStrength({ type, range, width, height, targetMode: targetMode ?? 'tile' }, width * height);
  }
  if (type === 'area') {
    const radius = Math.floor(clamp(toFiniteNumber(source.radius, 1), constants.minRadius, constants.maxRadius));
    return buildTargetWithStrength({ type, range, radius, targetMode: targetMode ?? 'tile' }, countCircleCells(radius));
  }
  return buildTargetWithStrength({ type: 'single', range, targetMode }, 1);
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
  const costMultiplier = roundTo(clamp(
    constants.baseCostMultiplier * calculateTechniqueArtsStrengthEfficiencyFactor(cost),
    constants.minCostMultiplier,
    constants.maxCostMultiplier,
  ), 2);
  const cooldownTicks = Math.round(clamp(
    constants.baseCooldownTicks * calculateTechniqueArtsStrengthEfficiencyFactor(cooldown),
    constants.minCooldownTicks,
    constants.maxCooldownTicks,
  ));
  return {
    cost,
    cooldown,
    chant,
    budgetMultiplier,
    costMultiplier,
    cooldownTicks,
  };
}

function normalizeFormula(raw: unknown): NormalizedTechniqueArtsStrengthFormula {
  const source = isRecord(raw) ? raw : {};
  const bases = normalizeAttributeBases(source.attributeBases);
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
  const effectStrength = calculateFormulaEffectStrength(bases, percentBonuses);
  return {
    attributeBases: bases,
    percentBonuses,
    effectStrength,
  };
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
  percentBonuses: NormalizedTechniqueArtsStrengthFormula['percentBonuses'],
): number {
  let total = 0;
  for (const [key, value] of Object.entries(bases)) {
    total += calculateAttributeBaseCost(key as TechniqueArtsStrengthAttributeBaseStat, value);
  }
  total += Math.max(0, percentBonuses.techLevel);
  total += Math.abs(percentBonuses.moveSpeed);
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
  const inputBudget = roundTo(formula.effectStrength * structure.budgetMultiplier, 4);
  return {
    name: normalizeText(source.name, '未命名术法'),
    desc: normalizeText(source.desc, ''),
    unlockLevel: Math.max(1, Math.floor(toFiniteNumber(source.unlockLevel, 1))),
    damageKind: DAMAGE_KINDS.includes(source.damageKind as SkillDamageKind) ? source.damageKind as SkillDamageKind : 'spell',
    element: ELEMENT_KEYS.includes(source.element as ElementKey) ? source.element as ElementKey : undefined,
    target,
    structure,
    formula,
    inputBudget,
  };
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
  const targetBudget = Number.isFinite(params.targetBudget) && (params.targetBudget ?? 0) > 0
    ? Number(params.targetBudget)
    : params.skill.inputBudget;
  const effectScale = params.skill.inputBudget > 0 ? targetBudget / params.skill.inputBudget : 1;
  const skillIndex = Math.max(0, Math.floor(params.skillIndex ?? 0));
  const skillId = `${params.techniqueId}_skill_${skillIndex + 1}`;
  const scaledBases = scaleAttributeBases(params.skill.formula.attributeBases, effectScale);
  const effects = [{
    type: 'damage' as const,
    damageKind: params.skill.damageKind,
    element: params.skill.element,
    formula: buildDamageFormula(scaledBases, params.skill.formula.percentBonuses),
  }];
  return {
    skill: {
      id: skillId,
      name: params.skill.name,
      desc: params.skill.desc,
      cooldown: params.skill.structure.cooldownTicks,
      cost: calculateTechniqueSkillQiCost(params.skill.structure.costMultiplier, params.grade, params.realmLv),
      costMultiplier: params.skill.structure.costMultiplier,
      range: params.skill.target.range,
      targeting: buildTargetingDef(params.skill.target),
      effects,
      unlockLevel: params.skill.unlockLevel,
      targetMode: params.skill.target.targetMode,
    },
    inputBudget: params.skill.inputBudget,
    targetBudget,
    effectScale,
    structureBudgetMultiplier: params.skill.structure.budgetMultiplier,
  };
}

function scaleAttributeBases(
  bases: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>>,
  effectScale: number,
): Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>> {
  const result: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>> = {};
  const places = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.attributeBases.decimalPlaces;
  for (const [key, value] of Object.entries(bases)) {
    const scaled = roundTo(value * effectScale, places);
    if (scaled > 0) {
      result[key as TechniqueArtsStrengthAttributeBaseStat] = scaled;
    }
  }
  return result;
}

function buildDamageFormula(
  bases: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>>,
  percentBonuses: NormalizedTechniqueArtsStrengthFormula['percentBonuses'],
): SkillFormula {
  const baseArgs: SkillFormula[] = [];
  for (const [key, value] of Object.entries(bases)) {
    baseArgs.push({
      var: `caster.stat.${key as NumericScalarStatKey}`,
      scale: value,
    });
  }
  const percentArgs: SkillFormula[] = [
    1,
    {
      var: 'techLevel',
      scale: calculateTechLevelScale(percentBonuses.techLevel),
    },
  ];
  const moveSpeedScale = roundTo(
    percentBonuses.moveSpeed
    * TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.moveSpeedScalePerStrength,
    6,
  );
  if (moveSpeedScale !== 0) {
    percentArgs.push({
      var: 'caster.stat.moveSpeed',
      scale: moveSpeedScale,
    });
  }
  return {
    op: 'mul',
    args: [
      baseArgs.length === 1 ? baseArgs[0]! : { op: 'add', args: baseArgs },
      { op: 'add', args: percentArgs },
    ],
  };
}

function calculateTechLevelScale(strength: number): number {
  const base = TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.techLevelScaleBase;
  return roundTo(Math.max(0, base * (1 + strength)), 6);
}

function buildTargetingDef(target: NormalizedTechniqueArtsStrengthTarget): SkillTargetingDef {
  if (target.type === 'line') {
    return {
      shape: 'line',
      range: target.range,
      width: target.width,
      targetMode: target.targetMode,
    };
  }
  if (target.type === 'box') {
    return {
      shape: 'box',
      range: target.range,
      width: target.width,
      height: target.height,
      targetMode: target.targetMode,
    };
  }
  if (target.type === 'area') {
    return {
      shape: 'area',
      range: target.range,
      radius: target.radius,
      targetMode: target.targetMode,
    };
  }
  return {
    shape: 'single',
    range: target.range,
    targetMode: target.targetMode,
  };
}
