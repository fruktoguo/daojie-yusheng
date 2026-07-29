/**
 * 动态功法模板的冷路径构建器。
 *
 * AI 生成和 GM 手工创建共用这里的校验、预算展开与审计报告，运行时只读取展开后的模板。
 */
import type {
  Attributes,
  ExpandedTechniqueArtsStrengthSkill,
  NormalizedTechniqueArtsStrengthTemplate,
  TechniqueCategory,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueTemplate,
} from '@mud/shared';
import {
  calcInternalTechniqueAttrTotalByBudgetPercent,
  calcTechniqueAttrValues,
  expandTechniqueArtsStrengthSkill,
  expandTechniqueAttrRatio,
  expandTechniqueExpCurve,
  normalizeTechniqueArtsStrengthTemplate,
  normalizeTechniqueAttrRatio,
  shouldExpandTechniqueAttrRatio,
} from '@mud/shared';

import { validateTechniqueCandidate, type ValidationError } from './technique-candidate-validator';
import { calcArtsBudgetMax } from './technique-budget-normalizer';

export interface GeneratedTechniqueTemplateBuildInput {
  techniqueId: string;
  candidate: Record<string, unknown>;
  category: Extract<TechniqueCategory, 'internal' | 'arts'>;
  grade: TechniqueGrade;
  realmLv: number;
  maxLayer: number;
  budgetPercent: number;
  totalBudget?: number;
}

export interface GeneratedTechniqueTemplateBuildSuccess {
  ok: true;
  template: TechniqueTemplate;
  expandedLayers: TechniqueLayerDef[];
  fullLevelAttrs?: Partial<Attributes>;
  validationReport: Record<string, unknown>;
}

export interface GeneratedTechniqueTemplateBuildFailure {
  ok: false;
  errors: ValidationError[];
}

export type GeneratedTechniqueTemplateBuildResult =
  | GeneratedTechniqueTemplateBuildSuccess
  | GeneratedTechniqueTemplateBuildFailure;

export function calculateGeneratedTechniqueTotalBudget(
  category: Extract<TechniqueCategory, 'internal' | 'arts'>,
  grade: TechniqueGrade,
  realmLv: number,
  budgetPercent: number,
): number {
  const normalizedBudgetPercent = Number.isFinite(budgetPercent) ? Math.max(0, budgetPercent) : 1;
  const totalBudget = category === 'arts'
    ? calcArtsBudgetMax(grade, realmLv) * normalizedBudgetPercent
    : calcInternalTechniqueAttrTotalByBudgetPercent(grade, realmLv, normalizedBudgetPercent);
  return roundTo(totalBudget, 4);
}

export function normalizeGeneratedTechniqueCandidateForServer(
  candidate: Record<string, unknown>,
  fixed: {
    category: Extract<TechniqueCategory, 'internal' | 'arts'>;
    grade: TechniqueGrade;
    realmLv: number;
    maxLayer: number;
    budgetPercent: number;
    totalBudget: number;
  },
): Record<string, unknown> {
  return {
    ...candidate,
    grade: fixed.grade,
    category: fixed.category,
    realmLv: fixed.realmLv,
    maxLayer: fixed.maxLayer,
    budgetPercent: fixed.budgetPercent,
    totalBudget: fixed.totalBudget,
  };
}

export function buildGeneratedTechniqueTemplate(
  input: GeneratedTechniqueTemplateBuildInput,
): GeneratedTechniqueTemplateBuildResult {
  const totalBudget = Number.isFinite(input.totalBudget) && Number(input.totalBudget) > 0
    ? Number(input.totalBudget)
    : calculateGeneratedTechniqueTotalBudget(input.category, input.grade, input.realmLv, input.budgetPercent);
  const fixedCandidate = normalizeGeneratedTechniqueCandidateForServer(input.candidate, {
    category: input.category,
    grade: input.grade,
    realmLv: input.realmLv,
    maxLayer: input.maxLayer,
    budgetPercent: input.budgetPercent,
    totalBudget,
  });
  const validation = validateTechniqueCandidate(fixedCandidate, input.category);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const rawCandidate = cloneJsonRecord(fixedCandidate);
  let skills: TechniqueTemplate['skills'];
  let artsStrengthReport: ArtsStrengthGenerationReport | undefined;
  if (input.category === 'arts') {
    const normalizedArts = normalizeTechniqueArtsStrengthTemplate(fixedCandidate);
    if (!normalizedArts.ok || !normalizedArts.template) {
      return {
        ok: false,
        errors: normalizedArts.errors.map((message) => ({ layer: 3, field: 'skills', message })),
      };
    }
    const expandedArts = normalizedArts.template.skills.map((skill, index) => (
      expandTechniqueArtsStrengthSkill({
        techniqueId: input.techniqueId,
        grade: input.grade,
        realmLv: input.realmLv,
        skillIndex: index,
        skill,
        targetBudget: totalBudget,
      })
    ));
    skills = expandedArts.map((entry) => entry.skill);
    artsStrengthReport = buildArtsStrengthGenerationReport({
      rawCandidate,
      normalizedTemplate: normalizedArts.template,
      expandedSkills: expandedArts,
    });
  }

  const template: TechniqueTemplate = {
    id: input.techniqueId,
    name: normalizeText(fixedCandidate.name, '无名功法'),
    desc: normalizeOptionalText(fixedCandidate.desc),
    grade: input.grade,
    category: input.category,
    realmLv: input.realmLv,
    budgetPercent: input.budgetPercent,
    totalBudget,
    attrRatio: input.category === 'internal'
      ? normalizeTechniqueAttrRatio(asRecord(fixedCandidate.attrRatio))
      : undefined,
    maxLayer: input.maxLayer,
    expDifficulty: Number(fixedCandidate.expDifficulty ?? 1),
    skills,
  };
  const expandedLayers = expandGeneratedTechniqueLayers(template);
  const fullLevelAttrs = shouldExpandTechniqueAttrRatio(template)
    ? normalizePositiveAttrs(calcTechniqueAttrValues(input.maxLayer, expandedLayers))
    : undefined;

  return {
    ok: true,
    template,
    expandedLayers,
    fullLevelAttrs,
    validationReport: {
      valid: true,
      errors: [],
      ...(artsStrengthReport ? { artsStrength: artsStrengthReport } : {}),
    },
  };
}

interface ArtsStrengthGenerationReport {
  version: 1;
  note: string;
  rawCandidate: Record<string, unknown>;
  normalizedTemplate: NormalizedTechniqueArtsStrengthTemplate;
  expansion: Array<{
    skillId: string;
    inputBudget: number;
    totalBudget: number;
    targetBudget: number;
    effectScale: number;
    structureBudgetMultiplier: number;
    budgetBreakdown: ExpandedTechniqueArtsStrengthSkill['budgetBreakdown'];
  }>;
}

function buildArtsStrengthGenerationReport(params: {
  rawCandidate: Record<string, unknown>;
  normalizedTemplate: NormalizedTechniqueArtsStrengthTemplate;
  expandedSkills: ExpandedTechniqueArtsStrengthSkill[];
}): ArtsStrengthGenerationReport {
  return {
    version: 1,
    note: 'template.skills 是服务端展开后的运行时 SkillDef；rawCandidate/normalizedTemplate 保留原始权重草稿与归一化权重，expansion 记录预算分配和真实值展开结果。',
    rawCandidate: params.rawCandidate,
    normalizedTemplate: params.normalizedTemplate,
    expansion: params.expandedSkills.map((entry) => ({
      skillId: entry.skill.id,
      inputBudget: entry.inputBudget,
      totalBudget: entry.totalBudget,
      targetBudget: entry.targetBudget,
      effectScale: entry.effectScale,
      structureBudgetMultiplier: entry.structureBudgetMultiplier,
      budgetBreakdown: entry.budgetBreakdown,
    })),
  };
}

function expandGeneratedTechniqueLayers(template: TechniqueTemplate): TechniqueLayerDef[] {
  if (shouldExpandTechniqueAttrRatio(template)) {
    return expandTechniqueAttrRatio(template).layers;
  }
  const maxLayer = Math.max(1, Math.trunc(Number(template.maxLayer) || 1));
  const expCurve = expandTechniqueExpCurve(
    template.grade,
    template.realmLv,
    maxLayer,
    template.expDifficulty ?? 1,
    template.category,
  );
  return expCurve.perLayerExp.map((expToNext, index) => ({ level: index + 1, expToNext }));
}

function normalizePositiveAttrs(attrs: Partial<Attributes>): Partial<Attributes> | undefined {
  const result: Partial<Attributes> = {};
  for (const [key, value] of Object.entries(attrs) as Array<[keyof Attributes, number]>) {
    if (Number.isFinite(value) && value > 0) {
      result[key] = Math.round(value);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
