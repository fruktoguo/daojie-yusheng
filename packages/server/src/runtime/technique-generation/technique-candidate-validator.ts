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
import { TECHNIQUE_GRADE_ORDER, normalizeTechniqueAttrRatio } from '@mud/shared';

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
    const skills = candidate.skills as unknown[];
    if (Array.isArray(skills)) {
      const hasEffect = skills.some((skill) => {
        if (!skill || typeof skill !== 'object') return false;
        const s = skill as Record<string, unknown>;
        return Array.isArray(s.effects) && s.effects.length > 0;
      });
      if (!hasEffect) {
        errors.push({ layer: 3, field: 'skills', message: '至少一个技能必须有非空 effects' });
      }
    }
  }

  return errors;
}
