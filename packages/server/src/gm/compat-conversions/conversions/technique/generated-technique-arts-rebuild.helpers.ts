/**
 * 自创术法权重草稿重建 helper。
 *
 * 所有兼容转换都必须从原始权重重新展开正式 SkillDef，禁止直接修补伤害公式。
 */
import {
  expandTechniqueArtsStrengthSkill,
  normalizeTechniqueArtsStrengthTemplate,
  type ExpandedTechniqueArtsStrengthSkill,
  type TechniqueGrade,
} from '@mud/shared';

import { calcArtsBudgetMax } from '../../../../runtime/technique-generation/technique-budget-normalizer';

export interface GeneratedTechniqueArtsCandidateRow {
  id: string;
  status: string;
  display_name?: string | null;
  grade?: string | null;
  realm_lv?: number | string | null;
  template: unknown;
  validation_report: unknown;
}

export interface GeneratedTechniqueArtsRebuildSuccess {
  ok: true;
  normalizedRawCandidate: Record<string, unknown>;
  normalizedTemplate: NonNullable<ReturnType<typeof normalizeTechniqueArtsStrengthTemplate>['template']>;
  updatedTemplate: Record<string, unknown>;
  expandedSkills: ExpandedTechniqueArtsStrengthSkill[];
  expansionReport: GeneratedTechniqueArtsExpansionReport[];
}

export interface GeneratedTechniqueArtsRebuildFailure {
  ok: false;
  error: string;
}

export interface GeneratedTechniqueArtsExpansionReport {
  skillId: string;
  inputBudget: number;
  totalBudget: number;
  targetBudget: number;
  effectScale: number;
  structureBudgetMultiplier: number;
  budgetBreakdown: ExpandedTechniqueArtsStrengthSkill['budgetBreakdown'];
}

export function rebuildGeneratedTechniqueArtsRow(
  row: GeneratedTechniqueArtsCandidateRow,
  rawCandidate: Record<string, unknown>,
): GeneratedTechniqueArtsRebuildSuccess | GeneratedTechniqueArtsRebuildFailure {
  const normalizedRawCandidate = removeGeneratedTechniqueTargetModeFields(rawCandidate);
  const normalized = normalizeTechniqueArtsStrengthTemplate(normalizedRawCandidate);
  if (!normalized.ok || !normalized.template) {
    return {
      ok: false,
      error: normalized.errors.join('; ') || '术法权重草稿无法通过当前 schema',
    };
  }

  const currentTemplate = asRecord(row.template);
  if (!currentTemplate) {
    return {
      ok: false,
      error: '缺少 generated_technique.template，无法重算正式 SkillDef',
    };
  }
  const grade = normalizeTechniqueGrade(currentTemplate.grade ?? rawCandidate.grade ?? row.grade);
  if (!grade) {
    return { ok: false, error: '无法确定功法品阶，不能重算术法 SkillDef' };
  }
  const realmLv = Math.max(1, Math.floor(toFiniteNumber(
    currentTemplate.realmLv ?? rawCandidate.realmLv ?? row.realm_lv,
    1,
  )));
  const techniqueId = typeof currentTemplate.id === 'string' && currentTemplate.id.trim()
    ? currentTemplate.id.trim()
    : row.id;
  const targetBudget = resolveTargetBudget(currentTemplate, grade, realmLv);
  const expandedSkills = normalized.template.skills.map((skill, index) => expandTechniqueArtsStrengthSkill({
    techniqueId,
    grade,
    realmLv,
    skillIndex: index,
    skill,
    targetBudget,
  }));
  const updatedTemplate = removeGeneratedTechniqueTargetModeFields({
    ...currentTemplate,
    skills: expandedSkills.map((entry) => entry.skill),
  });

  return {
    ok: true,
    normalizedRawCandidate,
    normalizedTemplate: normalized.template,
    updatedTemplate,
    expandedSkills,
    expansionReport: buildGeneratedTechniqueArtsExpansionReport(expandedSkills),
  };
}

export function buildGeneratedTechniqueArtsExpansionReport(
  expandedSkills: ExpandedTechniqueArtsStrengthSkill[],
): GeneratedTechniqueArtsExpansionReport[] {
  return expandedSkills.map((entry) => ({
    skillId: entry.skill.id,
    inputBudget: entry.inputBudget,
    totalBudget: entry.totalBudget,
    targetBudget: entry.targetBudget,
    effectScale: entry.effectScale,
    structureBudgetMultiplier: entry.structureBudgetMultiplier,
    budgetBreakdown: entry.budgetBreakdown,
  }));
}

export function resolveGeneratedTechniqueRowName(row: GeneratedTechniqueArtsCandidateRow): string {
  if (typeof row.display_name === 'string' && row.display_name.trim()) {
    return row.display_name.trim();
  }
  const template = asRecord(row.template);
  if (typeof template?.name === 'string' && template.name.trim()) {
    return template.name.trim();
  }
  return row.id;
}

export function cloneJsonRecord(value: unknown): Record<string, unknown> {
  const source = asRecord(value) ?? {};
  return structuredClone(source);
}

/** 兼容转换冷路径专用：从生成功法 JSON 中递归删除已废弃的技能目标模式。 */
export function removeGeneratedTechniqueTargetModeFields(value: Record<string, unknown>): Record<string, unknown> {
  return removeTargetModeValue(structuredClone(value)) as Record<string, unknown>;
}

function removeTargetModeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeTargetModeValue);
  }
  const record = asRecord(value);
  if (!record) {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (key !== 'targetMode') {
      result[key] = removeTargetModeValue(entry);
    }
  }
  return result;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function toFiniteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function isJsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveTargetBudget(
  template: Record<string, unknown>,
  grade: TechniqueGrade,
  realmLv: number,
): number {
  const templateBudget = toFiniteNumber(template.totalBudget, Number.NaN);
  if (Number.isFinite(templateBudget) && templateBudget > 0) {
    return templateBudget;
  }
  const budgetPercent = Math.max(0, toFiniteNumber(template.budgetPercent, 1));
  return calcArtsBudgetMax(grade, realmLv) * budgetPercent;
}

function normalizeTechniqueGrade(value: unknown): TechniqueGrade | null {
  const text = typeof value === 'string' ? value : '';
  if (
    text === 'mortal'
    || text === 'yellow'
    || text === 'mystic'
    || text === 'earth'
    || text === 'heaven'
    || text === 'spirit'
    || text === 'saint'
    || text === 'emperor'
  ) {
    return text;
  }
  return null;
}
