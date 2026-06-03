/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */

/**
 * 术法预算归一化。
 *
 * 按 AI功法生成方案.md §5 的公式，将 AI 输出的原始权重压回品阶预算内。
 * 内功不需要归一化（attrRatio 由 expandTechniqueAttrRatio 处理）。
 */

import type { SkillDamageKind, SkillFormula, TechniqueGrade } from '@mud/shared';
import { getTechniqueGradeIndex } from '@mud/shared';

/**
 * 计算术法单技能满层预算。
 *
 * BUDGET_max = 3 + realmLv × 0.5 × 1.4^(g - 1) × majorRealmMultiplier
 */
export function calcArtsBudgetMax(grade: TechniqueGrade, realmLv: number, majorRealmMultiplier = 1): number {
  const g = getTechniqueGradeIndex(grade);
  const normalizedRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.floor(realmLv)) : 1;
  return 3 + normalizedRealmLv * 0.5 * Math.pow(1.4, g - 1) * Math.max(0, majorRealmMultiplier);
}

/**
 * 按层计算预算。
 *
 * BUDGET(layer) = BUDGET_max × layer / maxLayer
 */
export function calcArtsBudgetAtLayer(budgetMax: number, layer: number, maxLayer: number): number {
  if (maxLayer <= 0) return 0;
  return budgetMax * layer / maxLayer;
}

/**
 * 归一化术法技能效果。
 *
 * 遍历 skills 中每个 effect 的 value，按 scale = BUDGET / RAW_TOTAL 缩放。
 * 返回新的 skills 数组（不修改原对象）。
 */
export function normalizeArtsSkills(params: {
  skills: Array<Record<string, unknown>>;
  grade: TechniqueGrade;
  realmLv: number;
  maxLayer: number;
}): Array<Record<string, unknown>> {
  const { skills, grade, realmLv, maxLayer } = params;
  const budgetMax = calcArtsBudgetMax(grade, realmLv);

  return skills.map((skill) => {
    const effects = Array.isArray(skill.effects) ? skill.effects : [];
    if (effects.length === 0) return { ...skill };

    // 计算原始总消耗
    const rawTotal = effects.reduce((sum: number, effect: unknown) => {
      if (!effect || typeof effect !== 'object') return sum;
      const e = effect as Record<string, unknown>;
      const value = Number(e.value ?? 0);
      return sum + (Number.isFinite(value) ? Math.abs(value) : 0);
    }, 0);

    if (rawTotal <= 0) return { ...skill };

    // 满层预算归一化
    const budget = calcArtsBudgetAtLayer(budgetMax, maxLayer, maxLayer);
    const scale = budget / rawTotal;

    const normalizedEffects = effects.map((effect: unknown) => {
      if (!effect || typeof effect !== 'object') return effect;
      const e = { ...(effect as Record<string, unknown>) };
      const scaledValue = typeof e.value === 'number' && Number.isFinite(e.value)
        ? Math.round((e.value as number) * scale * 100) / 100
        : null;
      if (typeof e.value === 'number' && Number.isFinite(e.value)) {
        e.value = scaledValue;
      }
      if (typeof e.formula === 'number' && Number.isFinite(e.formula)) {
        e.formula = Math.round((e.formula as number) * scale * 100) / 100;
      } else if (e.formula === undefined && scaledValue !== null) {
        e.formula = scaledValue;
      }
      if (e.type === 'damage' && typeof e.formula === 'number' && Number.isFinite(e.formula)) {
        e.formula = buildGeneratedDamageFormula(e.formula, e.damageKind);
      }
      return e;
    });

    return { ...skill, effects: normalizedEffects };
  });
}

function buildGeneratedDamageFormula(value: number, damageKind: unknown): SkillFormula {
  const statVar = resolveDamageStatVar(damageKind);
  const scale = Math.max(0, Math.round(value * 100) / 100);
  return {
    op: 'mul',
    args: [
      {
        op: 'add',
        args: [
          {
            var: statVar,
            scale,
          },
        ],
      },
      {
        op: 'add',
        args: [
          1,
          {
            var: 'techLevel',
            scale: 0.1,
          },
        ],
      },
    ],
  };
}

function resolveDamageStatVar(damageKind: unknown): 'caster.stat.physAtk' | 'caster.stat.spellAtk' {
  return (damageKind as SkillDamageKind) === 'physical'
    ? 'caster.stat.physAtk'
    : 'caster.stat.spellAtk';
}
