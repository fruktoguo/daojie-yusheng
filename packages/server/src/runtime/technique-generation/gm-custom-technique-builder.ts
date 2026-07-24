/** GM 手工功法输入的严格校验与规范化。 */
import type {
  AttrKey,
  GmCustomArtsTechniqueInput,
  GmCustomInternalTechniqueInput,
  GmCustomTechniqueArtsSkillInput,
  GmCustomTechniqueInput,
  TechniqueArtsStrengthAttributeBaseStat,
  TechniqueGrade,
} from '@mud/shared';
import {
  ATTR_KEYS,
  CUSTOM_TECHNIQUE_NAME_MAX_LENGTH,
  CUSTOM_TECHNIQUE_NAME_MIN_LENGTH,
  ELEMENT_KEYS,
  TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS,
  TECHNIQUE_ARTS_STRENGTH_CONSTANTS,
  TECHNIQUE_ARTS_STRENGTH_PERCENT_BONUS_KEYS,
  TECHNIQUE_GRADE_ORDER,
  TECHNIQUE_INTERNAL_BUDGET_PERCENT_RANGE,
  TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE,
  TECHNIQUE_INTERNAL_MAX_LAYER_RANGE,
} from '@mud/shared';

import {
  buildGeneratedTechniqueTemplate,
  calculateGeneratedTechniqueTotalBudget,
  type GeneratedTechniqueTemplateBuildSuccess,
} from './generated-technique-template-builder';
import type { ValidationError } from './technique-candidate-validator';

const REALM_LV_RANGE: readonly [number, number] = [1, 127];
const DESCRIPTION_MAX_LENGTH = 500;
const SKILL_NAME_MAX_LENGTH = 40;
const SKILL_DESCRIPTION_MAX_LENGTH = 500;
const TOP_LEVEL_KEYS = new Set([
  'name',
  'desc',
  'grade',
  'category',
  'realmLv',
  'maxLayer',
  'expDifficulty',
  'budgetPercent',
  'attrRatio',
  'skills',
]);
const SKILL_KEYS = new Set([
  'name',
  'desc',
  'unlockLevel',
  'damageKind',
  'element',
  'target',
  'structureStrength',
  'formulaStrength',
]);
const TARGET_KEYS = new Set(['type', 'targetMode']);
const TARGET_TYPES = new Set(['single', 'line', 'box', 'area']);
const TARGET_MODES = new Set(['any', 'entity', 'tile']);
const STRUCTURE_KEYS = ['damage', 'cost', 'cooldown', 'chant', 'castRange', 'area'] as const;
const STRUCTURE_KEY_SET = new Set<string>(STRUCTURE_KEYS);
const FORMULA_KEYS = new Set(['attributeBases', 'percentBonuses']);
const PERCENT_BONUS_KEY_SET = new Set<string>(TECHNIQUE_ARTS_STRENGTH_PERCENT_BONUS_KEYS);
const DAMAGE_KINDS = new Set(['physical', 'spell']);
const ELEMENT_KEY_SET = new Set<string>(ELEMENT_KEYS);
const ATTR_KEY_SET = new Set<string>(ATTR_KEYS);
const ATTRIBUTE_BASE_KEY_SET = new Set<string>(TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS);

export type GmCustomTechniqueBuildResult =
  | (GeneratedTechniqueTemplateBuildSuccess & { normalizedInput: GmCustomTechniqueInput })
  | { ok: false; errors: ValidationError[] };

export function buildGmCustomTechnique(
  rawInput: unknown,
  techniqueId: string,
): GmCustomTechniqueBuildResult {
  const errors: ValidationError[] = [];
  const input = asRecord(rawInput);
  if (!input) {
    return { ok: false, errors: [error('technique', '功法配置必须是对象')] };
  }
  rejectUnknownKeys(input, TOP_LEVEL_KEYS, 'technique', errors);

  const name = readText(input.name, 'name', CUSTOM_TECHNIQUE_NAME_MIN_LENGTH, CUSTOM_TECHNIQUE_NAME_MAX_LENGTH, errors);
  const desc = readOptionalText(input.desc, 'desc', DESCRIPTION_MAX_LENGTH, errors);
  const category = input.category === 'internal' || input.category === 'arts' ? input.category : null;
  if (!category) errors.push(error('category', '仅允许 internal 或 arts'));
  const grade = isTechniqueGrade(input.grade) ? input.grade : null;
  if (!grade) errors.push(error('grade', '功法品阶不在允许范围'));
  const realmLv = readInteger(input.realmLv, 'realmLv', REALM_LV_RANGE, errors);
  const maxLayer = readInteger(input.maxLayer, 'maxLayer', TECHNIQUE_INTERNAL_MAX_LAYER_RANGE, errors);
  const expDifficulty = readNumber(input.expDifficulty, 'expDifficulty', TECHNIQUE_INTERNAL_EXP_DIFFICULTY_RANGE, errors);
  const budgetPercent = readNumber(input.budgetPercent, 'budgetPercent', TECHNIQUE_INTERNAL_BUDGET_PERCENT_RANGE, errors);

  if (!name || !category || !grade || realmLv === null || maxLayer === null || expDifficulty === null || budgetPercent === null) {
    return { ok: false, errors };
  }

  let normalizedInput: GmCustomTechniqueInput | null = null;
  let candidate: Record<string, unknown> | null = null;
  if (category === 'internal') {
    if (input.skills !== undefined) {
      errors.push(error('skills', '内功不能提交术法技能草稿'));
    }
    const attrRatio = normalizeAttrRatio(input.attrRatio, errors);
    if (attrRatio) {
      normalizedInput = {
        name,
        ...(desc ? { desc } : {}),
        category,
        grade,
        realmLv,
        maxLayer,
        expDifficulty,
        budgetPercent,
        attrRatio,
      } satisfies GmCustomInternalTechniqueInput;
      candidate = { ...normalizedInput };
    }
  } else {
    if (input.attrRatio !== undefined) {
      errors.push(error('attrRatio', '术法不能提交内功六维权重'));
    }
    const skill = normalizeArtsSkill(input.skills, maxLayer, errors);
    if (skill) {
      normalizedInput = {
        name,
        ...(desc ? { desc } : {}),
        category,
        grade,
        realmLv,
        maxLayer,
        expDifficulty,
        budgetPercent,
        skills: [skill],
      } satisfies GmCustomArtsTechniqueInput;
      candidate = { ...normalizedInput, skills: normalizedInput.skills.map((entry) => ({ ...entry })) };
    }
  }

  if (errors.length > 0 || !normalizedInput || !candidate) {
    return { ok: false, errors };
  }
  const built = buildGeneratedTechniqueTemplate({
    techniqueId,
    candidate,
    category,
    grade,
    realmLv,
    maxLayer,
    budgetPercent,
    totalBudget: calculateGeneratedTechniqueTotalBudget(category, grade, realmLv, budgetPercent),
  });
  if (built.ok === false) {
    return { ok: false, errors: built.errors };
  }
  return { ...built, normalizedInput };
}

export function normalizeCustomTechniquePublishedName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

function normalizeAttrRatio(raw: unknown, errors: ValidationError[]): Partial<Record<AttrKey, number>> | null {
  const source = asRecord(raw);
  if (!source) {
    errors.push(error('attrRatio', '内功必须提供六维权重对象'));
    return null;
  }
  rejectUnknownKeys(source, ATTR_KEY_SET, 'attrRatio', errors);
  const result: Partial<Record<AttrKey, number>> = {};
  for (const key of ATTR_KEYS) {
    if (!(key in source)) continue;
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      errors.push(error(`attrRatio.${key}`, '权重必须是大于 0 的有限数字'));
      continue;
    }
    result[key] = value;
  }
  if (Object.keys(result).length < 2) {
    errors.push(error('attrRatio', '至少需要两个有效六维权重'));
  }
  return Object.keys(result).length >= 2 ? result : null;
}

function normalizeArtsSkill(
  raw: unknown,
  maxLayer: number,
  errors: ValidationError[],
): GmCustomTechniqueArtsSkillInput | null {
  if (!Array.isArray(raw) || raw.length !== 1) {
    errors.push(error('skills', '术法必须且只能提供一个技能'));
    return null;
  }
  const source = asRecord(raw[0]);
  if (!source) {
    errors.push(error('skills[0]', '技能必须是对象'));
    return null;
  }
  rejectUnknownKeys(source, SKILL_KEYS, 'skills[0]', errors);
  const name = readText(source.name, 'skills[0].name', 1, SKILL_NAME_MAX_LENGTH, errors);
  const desc = readOptionalText(source.desc, 'skills[0].desc', SKILL_DESCRIPTION_MAX_LENGTH, errors);
  const unlockLevel = readInteger(source.unlockLevel, 'skills[0].unlockLevel', [1, maxLayer], errors);
  const damageKind = DAMAGE_KINDS.has(String(source.damageKind)) ? source.damageKind as 'physical' | 'spell' : null;
  if (!damageKind) errors.push(error('skills[0].damageKind', '仅允许 physical 或 spell'));
  const element = source.element === undefined || source.element === ''
    ? undefined
    : ELEMENT_KEY_SET.has(String(source.element))
      ? source.element as GmCustomTechniqueArtsSkillInput['element']
      : null;
  if (element === null) errors.push(error('skills[0].element', '五行属性不在允许范围'));
  const target = normalizeTarget(source.target, errors);
  const structureStrength = normalizeStructureStrength(source.structureStrength, errors);
  const formulaStrength = normalizeFormulaStrength(source.formulaStrength, errors);
  if (!name || unlockLevel === null || !damageKind || element === null || !target || !structureStrength || !formulaStrength) {
    return null;
  }
  return {
    name,
    ...(desc ? { desc } : {}),
    unlockLevel,
    damageKind,
    ...(element ? { element } : {}),
    target,
    structureStrength,
    formulaStrength,
  };
}

function normalizeTarget(
  raw: unknown,
  errors: ValidationError[],
): GmCustomTechniqueArtsSkillInput['target'] | null {
  const source = asRecord(raw);
  if (!source) {
    errors.push(error('skills[0].target', '目标配置必须是对象'));
    return null;
  }
  rejectUnknownKeys(source, TARGET_KEYS, 'skills[0].target', errors);
  const type = TARGET_TYPES.has(String(source.type))
    ? source.type as GmCustomTechniqueArtsSkillInput['target']['type']
    : null;
  const targetMode = TARGET_MODES.has(String(source.targetMode))
    ? source.targetMode as GmCustomTechniqueArtsSkillInput['target']['targetMode']
    : null;
  if (!type) errors.push(error('skills[0].target.type', '目标形状不在允许范围'));
  if (!targetMode) errors.push(error('skills[0].target.targetMode', '目标模式不在允许范围'));
  return type && targetMode ? { type, targetMode } : null;
}

function normalizeStructureStrength(
  raw: unknown,
  errors: ValidationError[],
): GmCustomTechniqueArtsSkillInput['structureStrength'] | null {
  const source = asRecord(raw);
  if (!source) {
    errors.push(error('skills[0].structureStrength', '术法结构权重必须是对象'));
    return null;
  }
  rejectUnknownKeys(source, STRUCTURE_KEY_SET, 'skills[0].structureStrength', errors);
  const result = {} as GmCustomTechniqueArtsSkillInput['structureStrength'];
  let hasInvalid = false;
  let hasPositive = false;
  for (const key of STRUCTURE_KEYS) {
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < -100 || value > 100) {
      errors.push(error(`skills[0].structureStrength.${key}`, '权重必须在 -100 到 100 之间'));
      hasInvalid = true;
      continue;
    }
    result[key] = value;
    if (value > 0) hasPositive = true;
  }
  if (!hasPositive) {
    errors.push(error('skills[0].structureStrength', '至少需要一个正向结构权重'));
    hasInvalid = true;
  }
  return hasInvalid ? null : result;
}

function normalizeFormulaStrength(
  raw: unknown,
  errors: ValidationError[],
): GmCustomTechniqueArtsSkillInput['formulaStrength'] | null {
  const source = asRecord(raw);
  if (!source) {
    errors.push(error('skills[0].formulaStrength', '术法公式权重必须是对象'));
    return null;
  }
  rejectUnknownKeys(source, FORMULA_KEYS, 'skills[0].formulaStrength', errors);
  const rawBases = asRecord(source.attributeBases);
  if (!rawBases) {
    errors.push(error('skills[0].formulaStrength.attributeBases', '必须提供伤害属性构成'));
    return null;
  }
  rejectUnknownKeys(rawBases, ATTRIBUTE_BASE_KEY_SET, 'skills[0].formulaStrength.attributeBases', errors);
  const attributeBases: Partial<Record<TechniqueArtsStrengthAttributeBaseStat, number>> = {};
  for (const key of TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS) {
    if (!(key in rawBases)) continue;
    const value = rawBases[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100) {
      errors.push(error(`skills[0].formulaStrength.attributeBases.${key}`, '构成权重必须在 0 到 100 之间且不含 0'));
      continue;
    }
    attributeBases[key] = value;
  }
  const baseCount = Object.keys(attributeBases).length;
  if (baseCount < 1 || baseCount > 5) {
    errors.push(error('skills[0].formulaStrength.attributeBases', '伤害属性构成必须包含 1 到 5 项'));
  }

  const rawPercentBonuses = source.percentBonuses === undefined ? {} : asRecord(source.percentBonuses);
  if (!rawPercentBonuses) {
    errors.push(error('skills[0].formulaStrength.percentBonuses', '百分比权重必须是对象'));
    return null;
  }
  rejectUnknownKeys(rawPercentBonuses, PERCENT_BONUS_KEY_SET, 'skills[0].formulaStrength.percentBonuses', errors);
  const percentBonuses: NonNullable<GmCustomTechniqueArtsSkillInput['formulaStrength']['percentBonuses']> = {};
  for (const key of TECHNIQUE_ARTS_STRENGTH_PERCENT_BONUS_KEYS) {
    if (!(key in rawPercentBonuses)) continue;
    const value = rawPercentBonuses[key];
    if (
      typeof value !== 'number'
      || !Number.isFinite(value)
      || value < TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.minStrength
      || value > TECHNIQUE_ARTS_STRENGTH_CONSTANTS.percentBonuses.maxStrength
    ) {
      errors.push(error(`skills[0].formulaStrength.percentBonuses.${key}`, '权重必须在 0 到 100 之间'));
      continue;
    }
    percentBonuses[key] = value;
  }
  return baseCount >= 1 && baseCount <= 5
    ? {
      attributeBases,
      ...(Object.keys(percentBonuses).length > 0 ? { percentBonuses } : {}),
    }
    : null;
}

function readText(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
  errors: ValidationError[],
): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const length = [...normalized].length;
  if (length < minLength || length > maxLength) {
    errors.push(error(field, `长度必须在 ${minLength} 到 ${maxLength} 个字符之间`));
    return null;
  }
  return normalized;
}

function readOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
  errors: ValidationError[],
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    errors.push(error(field, '必须是字符串'));
    return undefined;
  }
  const normalized = value.trim();
  if ([...normalized].length > maxLength) {
    errors.push(error(field, `长度不能超过 ${maxLength} 个字符`));
    return undefined;
  }
  return normalized || undefined;
}

function readInteger(
  value: unknown,
  field: string,
  range: readonly [number, number],
  errors: ValidationError[],
): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < range[0] || value > range[1]) {
    errors.push(error(field, `必须是 ${range[0]} 到 ${range[1]} 之间的整数`));
    return null;
  }
  return value;
}

function readNumber(
  value: unknown,
  field: string,
  range: readonly [number, number],
  errors: ValidationError[],
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < range[0] || value > range[1]) {
    errors.push(error(field, `必须在 ${range[0]} 到 ${range[1]} 之间`));
    return null;
  }
  return value;
}

function rejectUnknownKeys(
  source: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  field: string,
  errors: ValidationError[],
): void {
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) {
      errors.push(error(`${field}.${key}`, '包含未允许字段'));
    }
  }
}

function isTechniqueGrade(value: unknown): value is TechniqueGrade {
  return TECHNIQUE_GRADE_ORDER.includes(value as TechniqueGrade);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function error(field: string, message: string): ValidationError {
  return { layer: 2, field, message };
}
