/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */

/**
 * AI 生成功法候选校验器（三层防线）。
 *
 * Layer 1: 结构合法性 — 字段存在性、类型、必填项
 * Layer 2: 语义合法性 — category 限制、数值范围、白名单
 * Layer 3: 数值合法性 — 归一化可执行性
 */

import type { TechniqueCategory, TechniqueGrade } from '@mud/shared';
import {
  TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS,
  TECHNIQUE_ARTS_STRENGTH_CONSTANTS,
  TECHNIQUE_GRADE_ORDER,
  normalizeTechniqueArtsStrengthTemplate,
  normalizeTechniqueAttrRatio,
} from '@mud/shared';

export interface ValidationError {
  layer: 1 | 2 | 3;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const ALLOWED_CATEGORIES: TechniqueCategory[] = ['internal', 'arts'];
const ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS = new Set<string>(
  TECHNIQUE_ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS,
);
const ARTS_STRENGTH_TARGET_TYPES = new Set<string>(['single', 'line', 'box', 'area']);
const ARTS_STRENGTH_TARGET_MODES = new Set<string>(['any', 'entity', 'tile']);
const ARTS_STRENGTH_SKILL_FORBIDDEN_FIELDS = [
  'id',
  'cost',
  'costMultiplier',
  'cooldown',
  'range',
  'targeting',
  'effects',
  'value',
  'formula',
  'buff',
  'buffId',
  'heal',
  'maxTargets',
  'totalBudget',
  'inputBudget',
  'targetBudget',
  'damageValue',
  'baseDamage',
] as const;
const ARTS_STRENGTH_STRUCTURE_KEYS = new Set<string>(['cost', 'cooldown', 'chant']);
const ARTS_STRENGTH_FORMULA_KEYS = new Set<string>(['attributeBases', 'percentBonuses']);
const ARTS_STRENGTH_PERCENT_BONUS_KEYS = new Set<string>(['techLevel', 'moveSpeed']);
const ARTS_STRENGTH_TARGET_KEYS = new Set<string>([
  'type',
  'castRangeWeight',
  'areaWeight',
  'targetMode',
]);

/** 完整校验链 */
export function validateTechniqueCandidate(
  raw: unknown,
  expectedCategory: TechniqueCategory,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Layer 1: 结构
  const structureResult = validateStructure(raw);
  if (structureResult.length > 0) {
    return { valid: false, errors: structureResult };
  }

  const candidate = raw as Record<string, unknown>;

  // Layer 2: 语义
  const semanticResult = validateSemantics(candidate, expectedCategory);
  errors.push(...semanticResult);

  // Layer 3: 数值
  if (semanticResult.length === 0) {
    const numericResult = validateNumerics(candidate, expectedCategory);
    errors.push(...numericResult);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Layer 1: 结构 ───

function validateStructure(raw: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({ layer: 1, field: 'root', message: '必须是非空对象' });
    return errors;
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    errors.push({ layer: 1, field: 'name', message: '必须是非空字符串' });
  }
  if (typeof obj.grade !== 'string') {
    errors.push({ layer: 1, field: 'grade', message: '必须是字符串' });
  }
  if (typeof obj.category !== 'string') {
    errors.push({ layer: 1, field: 'category', message: '必须是字符串' });
  }
  if (!Number.isFinite(obj.realmLv) || (obj.realmLv as number) < 1) {
    errors.push({ layer: 1, field: 'realmLv', message: '必须是 ≥1 的有限数字' });
  }

  const category = obj.category as string;
  if (category === 'internal') {
    if (!obj.attrRatio || typeof obj.attrRatio !== 'object') {
      errors.push({ layer: 1, field: 'attrRatio', message: 'internal 类功法必须提供 attrRatio' });
    }
  } else if (category === 'arts') {
    if (!Array.isArray(obj.skills) || obj.skills.length === 0) {
      errors.push({ layer: 1, field: 'skills', message: 'arts 类功法必须提供非空 skills 数组' });
    }
  }

  return errors;
}

// ─── Layer 2: 语义 ───

function validateSemantics(candidate: Record<string, unknown>, expectedCategory: TechniqueCategory): ValidationError[] {
  const errors: ValidationError[] = [];

  // category 限制
  const category = candidate.category as string;
  if (!ALLOWED_CATEGORIES.includes(category as TechniqueCategory)) {
    errors.push({ layer: 2, field: 'category', message: `仅允许 ${ALLOWED_CATEGORIES.join('/')}，收到 ${category}` });
  }
  if (category !== expectedCategory) {
    errors.push({ layer: 2, field: 'category', message: `期望 ${expectedCategory}，收到 ${category}` });
  }

  // grade 合法
  const grade = candidate.grade as string;
  if (!TECHNIQUE_GRADE_ORDER.includes(grade as TechniqueGrade)) {
    errors.push({ layer: 2, field: 'grade', message: `非法品阶: ${grade}` });
  }

  // attrFloat 范围
  if (candidate.attrFloat !== undefined) {
    const attrFloat = Number(candidate.attrFloat);
    if (!Number.isFinite(attrFloat) || attrFloat < -0.15 || attrFloat > 0.10) {
      errors.push({ layer: 2, field: 'attrFloat', message: 'attrFloat 必须在 [-0.15, 0.10]' });
    }
  }

  // expDifficulty 范围
  if (candidate.expDifficulty !== undefined) {
    const expDifficulty = Number(candidate.expDifficulty);
    if (!Number.isFinite(expDifficulty) || expDifficulty < 0.5 || expDifficulty > 2.0) {
      errors.push({ layer: 2, field: 'expDifficulty', message: 'expDifficulty 必须在 [0.5, 2.0]' });
    }
  }

  // maxLayer 范围
  if (candidate.maxLayer !== undefined) {
    const maxLayer = Number(candidate.maxLayer);
    if (!Number.isFinite(maxLayer) || maxLayer < 3 || maxLayer > 49) {
      errors.push({ layer: 2, field: 'maxLayer', message: 'maxLayer 必须在 [3, 49]' });
    }
  }

  if (expectedCategory === 'arts') {
    errors.push(...validateArtsStrengthSemantics(candidate));
  }

  return errors;
}

// ─── Layer 3: 数值 ───

function validateNumerics(candidate: Record<string, unknown>, expectedCategory: TechniqueCategory): ValidationError[] {
  const errors: ValidationError[] = [];

  if (expectedCategory === 'internal') {
    const attrRatio = candidate.attrRatio as Record<string, unknown> | undefined;
    const normalizedAttrRatio = normalizeTechniqueAttrRatio(attrRatio);
    const weightSum = Object.values(normalizedAttrRatio ?? {}).reduce((sum, value) => sum + value, 0);
    if (!normalizedAttrRatio || weightSum <= 0) {
      errors.push({ layer: 3, field: 'attrRatio', message: 'attrRatio 必须包含合法六维字段且权重和 > 0' });
    } else if (Object.keys(normalizedAttrRatio).length < 2) {
      errors.push({ layer: 3, field: 'attrRatio', message: 'attrRatio 至少需要 2 个合法六维字段' });
    }
  }

  if (expectedCategory === 'arts') {
    const normalized = normalizeTechniqueArtsStrengthTemplate(candidate);
    if (!normalized.ok) {
      for (const message of normalized.errors) {
        errors.push({ layer: 3, field: 'skills', message });
      }
    }
  }

  return errors;
}

function validateArtsStrengthSemantics(candidate: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  const skills = candidate.skills;
  if (!Array.isArray(skills)) {
    return errors;
  }
  if (skills.length !== 1) {
    errors.push({ layer: 2, field: 'skills', message: 'AI 术法首版必须且只能生成 1 个技能' });
  }

  skills.forEach((rawSkill, skillIndex) => {
    if (!rawSkill || typeof rawSkill !== 'object' || Array.isArray(rawSkill)) {
      errors.push({ layer: 2, field: `skills[${skillIndex}]`, message: '技能必须是对象' });
      return;
    }
    const skill = rawSkill as Record<string, unknown>;
    for (const field of ARTS_STRENGTH_SKILL_FORBIDDEN_FIELDS) {
      if (field in skill) {
        errors.push({
          layer: 2,
          field: `skills[${skillIndex}].${field}`,
          message: '术法强度草稿禁止输出旧版 SkillDef/Effect/预算字段',
        });
      }
    }
    validateArtsStrengthTarget(skill.target, skillIndex, errors);
    validateArtsStrengthStructure(skill.structureStrength, skillIndex, errors);
    validateArtsStrengthFormula(skill.formulaStrength, skillIndex, errors);
  });
  return errors;
}

function validateArtsStrengthTarget(raw: unknown, skillIndex: number, errors: ValidationError[]): void {
  if (raw === undefined) return;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({ layer: 2, field: `skills[${skillIndex}].target`, message: 'target 必须是对象' });
    return;
  }
  const target = raw as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (!ARTS_STRENGTH_TARGET_KEYS.has(key)) {
      errors.push({ layer: 2, field: `skills[${skillIndex}].target.${key}`, message: 'target 包含未允许字段' });
    }
  }
  if (target.type !== undefined && !ARTS_STRENGTH_TARGET_TYPES.has(String(target.type))) {
    errors.push({ layer: 2, field: `skills[${skillIndex}].target.type`, message: 'target.type 不在允许范围' });
  }
  if (target.targetMode !== undefined && !ARTS_STRENGTH_TARGET_MODES.has(String(target.targetMode))) {
    errors.push({ layer: 2, field: `skills[${skillIndex}].target.targetMode`, message: 'targetMode 不在允许范围' });
  }
  validateOptionalArtsPositiveWeight(target.castRangeWeight, `skills[${skillIndex}].target.castRangeWeight`, errors);
  validateOptionalArtsPositiveWeight(target.areaWeight, `skills[${skillIndex}].target.areaWeight`, errors);
}

function validateArtsStrengthStructure(raw: unknown, skillIndex: number, errors: ValidationError[]): void {
  if (raw === undefined) return;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({ layer: 2, field: `skills[${skillIndex}].structureStrength`, message: 'structureStrength 必须是对象' });
    return;
  }
  for (const key of Object.keys(raw as Record<string, unknown>)) {
    const value = Number((raw as Record<string, unknown>)[key]);
    if (!ARTS_STRENGTH_STRUCTURE_KEYS.has(key)) {
      errors.push({ layer: 2, field: `skills[${skillIndex}].structureStrength.${key}`, message: 'structureStrength 只允许 cost/cooldown/chant' });
    } else if (!isValidArtsWeight(value)) {
      errors.push({ layer: 2, field: `skills[${skillIndex}].structureStrength.${key}`, message: 'structureStrength 权重必须在 [-100, 100]' });
    }
  }
}

function validateArtsStrengthFormula(raw: unknown, skillIndex: number, errors: ValidationError[]): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({ layer: 2, field: `skills[${skillIndex}].formulaStrength`, message: 'formulaStrength 必须是对象' });
    return;
  }
  const formula = raw as Record<string, unknown>;
  for (const key of Object.keys(formula)) {
    if (!ARTS_STRENGTH_FORMULA_KEYS.has(key)) {
      errors.push({ layer: 2, field: `skills[${skillIndex}].formulaStrength.${key}`, message: 'formulaStrength 包含未允许字段' });
    }
  }
  const bases = formula.attributeBases;
  if (!bases || typeof bases !== 'object' || Array.isArray(bases)) {
    errors.push({ layer: 2, field: `skills[${skillIndex}].formulaStrength.attributeBases`, message: 'attributeBases 必须是对象' });
  } else {
    for (const key of Object.keys(bases as Record<string, unknown>)) {
      const value = Number((bases as Record<string, unknown>)[key]);
      if (!ARTS_STRENGTH_ALLOWED_ATTRIBUTE_BASE_STATS.has(key)) {
        errors.push({
          layer: 2,
          field: `skills[${skillIndex}].formulaStrength.attributeBases.${key}`,
          message: 'attributeBases key 不在允许的战斗属性白名单中',
        });
      } else if (!Number.isFinite(value) || value <= 0 || value > TECHNIQUE_ARTS_STRENGTH_CONSTANTS.attributeBases.maxScale) {
        errors.push({
          layer: 2,
          field: `skills[${skillIndex}].formulaStrength.attributeBases.${key}`,
          message: 'attributeBases 必须是 1 到 100 的正权重；0 或负数表示不参与时请省略该 key',
        });
      }
    }
  }
  const percentBonuses = formula.percentBonuses;
  if (percentBonuses !== undefined) {
    if (!percentBonuses || typeof percentBonuses !== 'object' || Array.isArray(percentBonuses)) {
      errors.push({ layer: 2, field: `skills[${skillIndex}].formulaStrength.percentBonuses`, message: 'percentBonuses 必须是对象' });
      return;
    }
    for (const key of Object.keys(percentBonuses as Record<string, unknown>)) {
      const value = Number((percentBonuses as Record<string, unknown>)[key]);
      if (!ARTS_STRENGTH_PERCENT_BONUS_KEYS.has(key)) {
        errors.push({
          layer: 2,
          field: `skills[${skillIndex}].formulaStrength.percentBonuses.${key}`,
          message: 'percentBonuses 只允许 techLevel/moveSpeed',
        });
      } else if (!isValidArtsWeight(value)) {
        errors.push({
          layer: 2,
          field: `skills[${skillIndex}].formulaStrength.percentBonuses.${key}`,
          message: 'percentBonuses 权重必须在 [-100, 100]',
        });
      }
    }
  }
}

function isValidArtsWeight(value: number): boolean {
  return Number.isFinite(value)
    && value >= TECHNIQUE_ARTS_STRENGTH_CONSTANTS.weights.min
    && value <= TECHNIQUE_ARTS_STRENGTH_CONSTANTS.weights.max;
}

function validateOptionalArtsPositiveWeight(raw: unknown, field: string, errors: ValidationError[]): void {
  if (raw === undefined) return;
  const value = Number(raw);
  if (
    !Number.isFinite(value)
    || value < TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure.minRange
    || value > TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure.maxRange
  ) {
    errors.push({
      layer: 2,
      field,
      message: `target 权重必须在 [${TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure.minRange}, ${TECHNIQUE_ARTS_STRENGTH_CONSTANTS.structure.maxRange}]`,
    });
  }
}
