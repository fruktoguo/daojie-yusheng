/**
 * 技能提示框内容构建器
 * 根据 SkillDef 和玩家上下文生成带公式预览的富文本提示内容
 */

import { NumericScalarStatKey, SkillDef, SkillFormula, SkillFormulaVar, TemporaryBuffState, calcQiCostWithOutputLimit, formatBuffMaxStacks } from '@mud/shared';
import type { PlayerState } from '@mud/shared';
import { FORMULA_VAR_LABELS, FORMULA_VAR_META, type SkillScalingMeta } from '../constants/ui/skill-tooltip';
import { getElementKeyLabel } from '../domain-labels';
import { resolvePreviewSkill, resolvePreviewSkills } from '../content/local-templates';
import { describePreviewBonuses } from './stat-preview';
import { formatDisplayInteger, formatDisplayNumber, formatDisplayPercent } from '../utils/number';

type SkillTooltipPreviewPlayer = Pick<PlayerState, 'hp' | 'maxHp' | 'qi' | 'numericStats' | 'temporaryBuffs'>;

export interface SkillTooltipPreviewContext {
  techLevel?: number;
  unlockLevel?: number;
  player?: SkillTooltipPreviewPlayer | null;
  target?: SkillTooltipPreviewPlayer | null;
  knownSkills?: SkillDef[];
}

type PreviewPlayer = NonNullable<SkillTooltipPreviewContext['player']>;

type ScalingMeta = SkillScalingMeta;

type FormulaPreview = {
  html: string;
  resolved: number | null;
};

type StructuredDamagePreview = {
  total: number;
  fixedTotal: number;
  percentTotal: number;
  fixedHtml: string;
  percentHtml: string;
};

type ResolvedPreviewValue = {
  value: number;
  known: boolean;
};

type BuffFormulaMeta = {
  side: 'caster' | 'target';
  buffId: string;
};

type ResolvedBuffMeta = {
  name: string;
  mark: string;
  tone: 'buff' | 'debuff';
};

export interface SkillTooltipAsideCard {
  mark?: string;
  title: string;
  lines: string[];
  tone?: 'buff' | 'debuff';
}

export interface SkillTooltipContent {
  lines: string[];
  asideCards: SkillTooltipAsideCard[];
}

export interface SkillPreviewMetrics {
  actualDamage: number | null;
  actualQiCost: number;
  range: number;
  targetCount: number;
  cooldown: number;
  hasPhysicalDamage: boolean;
  hasSpellDamage: boolean;
  isSingleTarget: boolean;
  isAreaTarget: boolean;
  isMelee: boolean;
  isRanged: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPercent(scale: number): string {
  return formatDisplayPercent(scale * 100);
}

function normalizeBuffMark(name: string, shortMark?: string): string {
  const value = shortMark?.trim();
  if (value) return [...value][0] ?? value;
  return [...name.trim()][0] ?? '气';
}

function renderLabelLine(label: string, value: string): string {
  return `<span class="skill-tooltip-label">${escapeHtml(label)}：</span>${value}`;
}

function renderPlainLine(label: string, value: string): string {
  return renderLabelLine(label, escapeHtml(value));
}

function buildQiCostValue(cost: number, context: SkillTooltipPreviewContext): string {
  const baseCost = escapeHtml(formatDisplayNumber(cost));
  const maxQiOutputPerTick = context.player?.numericStats?.maxQiOutputPerTick;
  if (maxQiOutputPerTick === undefined) {
    return baseCost;
  }

  const actualCost = calcQiCostWithOutputLimit(cost, Math.max(0, maxQiOutputPerTick));
  const actualText = Number.isFinite(actualCost)
    ? formatDisplayNumber(Math.round(actualCost))
    : '无法稳定施展';
  const actualClassName = Number.isFinite(actualCost) && Math.round(actualCost) > Math.round(cost)
    ? 'skill-tooltip-cost-actual is-overflow'
    : 'skill-tooltip-cost-actual';
  return `${baseCost}<span class="skill-tooltip-cost-actual-separator"> · </span><span class="${actualClassName}">实际 ${escapeHtml(actualText)}</span>`;
}

function describeBuffEffect(effect: Extract<SkillDef['effects'][number], { type: 'buff' }>): string[] {
  return describePreviewBonuses(effect.attrs, effect.stats, effect.valueStats);
}

function buildBuffInlineBadge(effect: Extract<SkillDef['effects'][number], { type: 'buff' }>): string {
  const toneClass = effect.category === 'debuff' ? 'debuff' : 'buff';
  const mark = normalizeBuffMark(effect.name, effect.shortMark);
  return `<span class="skill-tooltip-buff-entry ${toneClass}"><span class="skill-tooltip-buff-mark">${escapeHtml(mark)}</span><span>${escapeHtml(effect.name)}</span></span>`;
}

function buildBuffInlineBadgeFromMeta(meta: ResolvedBuffMeta): string {
  return `<span class="skill-tooltip-buff-entry ${meta.tone}"><span class="skill-tooltip-buff-mark">${escapeHtml(meta.mark)}</span><span>${escapeHtml(meta.name)}</span></span>`;
}

function buildBuffAsideCard(effect: Extract<SkillDef['effects'][number], { type: 'buff' }>): SkillTooltipAsideCard {
  const effectLines = describeBuffEffect(effect);
  const stackLimit = formatBuffMaxStacks(effect.maxStacks);
  const lines = [
    `${effect.target === 'target' ? '目标' : '自身'} · ${formatDisplayInteger(effect.duration)} 息${stackLimit ? ` · 最多 ${stackLimit} 层` : ''}`,
    ...(effectLines.length > 0 ? [`效果：${effectLines.join('，')}`] : []),
    ...(effect.desc ? [effect.desc] : []),
  ];
  return {
    mark: normalizeBuffMark(effect.name, effect.shortMark),
    title: effect.name,
    lines,
    tone: effect.category === 'debuff' ? 'debuff' : 'buff',
  };
}

function renderScalingBadge(meta: ScalingMeta): string {
  return `<span class="skill-scaling ${meta.badgeClassName}"><span class="skill-scaling-icon">${escapeHtml(meta.icon)}</span><span>${escapeHtml(meta.label)}</span></span>`;
}

function renderFormulaTerm(content: string, className: string): string {
  return `<span class="skill-formula-term ${className}">${content}</span>`;
}

function parseBuffFormulaVar(varName: SkillFormulaVar): BuffFormulaMeta | null {
  const matched = varName.match(/^(caster|target)\.buff\.(.+)\.stacks$/);
  if (!matched) {
    return null;
  }
  return {
    side: matched[1] as 'caster' | 'target',
    buffId: matched[2],
  };
}

function resolveBuffStacks(buffs: TemporaryBuffState[] | undefined, buffId: string): number {
  return buffs?.find((entry) => entry.buffId === buffId && entry.remainingTicks > 0)?.stacks ?? 0;
}

function resolveBuffFormulaMeta(varName: SkillFormulaVar, context: SkillTooltipPreviewContext): ResolvedBuffMeta | null {
  const parsed = parseBuffFormulaVar(varName);
  if (!parsed) {
    return null;
  }
  const effect = resolvePreviewSkills(context.knownSkills)
    ?.flatMap((skill) => skill.effects)
    .find((entry): entry is Extract<SkillDef['effects'][number], { type: 'buff' }> => (
      entry.type === 'buff' && entry.buffId === parsed.buffId
    ));
  if (!effect) {
    return null;
  }
  return {
    name: effect.name,
    mark: normalizeBuffMark(effect.name, effect.shortMark),
    tone: effect.category === 'debuff' ? 'debuff' : 'buff',
  };
}

function buildBuffStackReference(varName: SkillFormulaVar, context: SkillTooltipPreviewContext, stacks?: number | null): string | null {
  const parsed = parseBuffFormulaVar(varName);
  if (!parsed) {
    return null;
  }
  const sideLabel = parsed.side === 'caster' ? '自身' : '目标';
  const buffMeta = resolveBuffFormulaMeta(varName, context);
  if (!buffMeta) {
    return `<span class="skill-formula-buff-ref"><span class="skill-formula-buff-side">${escapeHtml(sideLabel)}</span><span class="skill-formula-buff-stacks">${stacks === null || stacks === undefined ? '状态层数' : `${formatDisplayNumber(stacks)}层`}</span></span>`;
  }
  return `<span class="skill-formula-buff-ref"><span class="skill-formula-buff-side">${escapeHtml(sideLabel)}</span>${buildBuffInlineBadgeFromMeta(buffMeta)}<span class="skill-formula-buff-stacks">${stacks === null || stacks === undefined ? '层数' : `${formatDisplayNumber(stacks)}层`}</span></span>`;
}

function resolveStatValue(player: PreviewPlayer | null | undefined, key: NumericScalarStatKey): ResolvedPreviewValue {
  if (!player?.numericStats) {
    return { value: 0, known: false };
  }
  return { value: player.numericStats[key] ?? 0, known: true };
}

function resolveTargetPreview(context: SkillTooltipPreviewContext): PreviewPlayer | null | undefined {
  return context.target ?? null;
}

function resolvePreviewValue(varName: SkillFormulaVar, context: SkillTooltipPreviewContext): ResolvedPreviewValue {
  const player = context.player;
  const target = resolveTargetPreview(context);
  const parsedBuff = parseBuffFormulaVar(varName);
  if (parsedBuff) {
    if (parsedBuff.side === 'caster') {
      return {
        value: resolveBuffStacks(player?.temporaryBuffs, parsedBuff.buffId),
        known: Boolean(player),
      };
    }
    return target
      ? { value: resolveBuffStacks(target.temporaryBuffs, parsedBuff.buffId), known: true }
      : { value: 0, known: false };
  }
  switch (varName) {
    case 'techLevel':
      return { value: context.techLevel ?? 0, known: context.techLevel !== undefined };
    case 'caster.hp':
      return { value: player?.hp ?? 0, known: Boolean(player) };
    case 'caster.maxHp':
      return { value: player?.maxHp ?? 0, known: Boolean(player) };
    case 'caster.qi':
      return { value: player?.qi ?? 0, known: Boolean(player) };
    case 'caster.maxQi':
      return player?.numericStats ? { value: player.numericStats.maxQi ?? 0, known: true } : { value: 0, known: false };
    case 'target.maxHp':
      return { value: target?.maxHp ?? 0, known: Boolean(target) };
    case 'target.hp':
      return { value: target?.hp ?? 0, known: Boolean(target) };
    case 'target.qi':
      return { value: target?.qi ?? 0, known: Boolean(target) };
    case 'target.maxQi':
      return target?.numericStats ? { value: target.numericStats.maxQi ?? 0, known: true } : { value: 0, known: false };
    default:
      if (varName.startsWith('caster.stat.')) {
        return resolveStatValue(player, varName.slice('caster.stat.'.length) as NumericScalarStatKey);
      }
      if (varName.startsWith('target.stat.')) {
        return resolveStatValue(target, varName.slice('target.stat.'.length) as NumericScalarStatKey);
      }
      return { value: 0, known: false };
  }
}

function resolvePreviewVar(varName: SkillFormulaVar, context: SkillTooltipPreviewContext): number | null {
  const resolved = resolvePreviewValue(varName, context);
  return resolved.known ? resolved.value : null;
}

function renderVariableFormula(varName: SkillFormulaVar, scale: number, context: SkillTooltipPreviewContext): FormulaPreview {
  if (varName === 'techLevel') {
    const techLevel = context.techLevel;
    if (typeof techLevel === 'number') {
      const contribution = techLevel * scale;
      const detail = `<span class="skill-scaling skill-scaling-tech"><span class="skill-scaling-icon">◎</span><span>${escapeHtml(`${formatDisplayNumber(techLevel)}层`)}</span></span>`;
      return {
        html: renderFormulaTerm(`${formatDisplayNumber(contribution)}(${detail})`, 'skill-formula-term-tech'),
        resolved: contribution,
      };
    }
  }

  const buffReference = buildBuffStackReference(varName, context);
  if (buffReference) {
    const resolved = resolvePreviewValue(varName, context);
    const contribution = resolved.value * scale;
    return {
      html: resolved.known
        ? renderFormulaTerm(`${formatDisplayNumber(contribution)}(${formatPercent(scale)} ${buildBuffStackReference(varName, context, resolved.value)})`, 'skill-formula-term-buff-stack')
        : renderFormulaTerm(`${formatPercent(scale)} ${buffReference}`, 'skill-formula-term-buff-stack'),
      resolved: resolved.known ? contribution : null,
    };
  }

  const meta = FORMULA_VAR_META[varName];
  const resolvedValue = resolvePreviewVar(varName, context);
  if (meta) {
    const badge = renderScalingBadge(meta);
    if (resolvedValue !== null) {
      const contribution = resolvedValue * scale;
      return {
        html: renderFormulaTerm(`${formatDisplayNumber(contribution)}(${formatPercent(scale)} ${badge})`, meta.termClassName),
        resolved: contribution,
      };
    }
    return {
      html: renderFormulaTerm(`${formatPercent(scale)} ${badge}`, meta.termClassName),
      resolved: null,
    };
  }

  const label = FORMULA_VAR_LABELS[varName] ?? varName;
  if (resolvedValue !== null) {
    const contribution = resolvedValue * scale;
    return {
      html: renderFormulaTerm(`${formatDisplayNumber(contribution)}(${escapeHtml(label)})`, 'skill-formula-term-generic'),
      resolved: contribution,
    };
  }

  return {
    html: renderFormulaTerm(
      Math.abs(scale - 1) < 1e-6 ? escapeHtml(label) : `${formatDisplayNumber(scale)}*${escapeHtml(label)}`,
      'skill-formula-term-generic',
    ),
    resolved: null,
  };
}

function isAddFormula(formula: SkillFormula): formula is { op: 'add'; args: SkillFormula[] } {
  return typeof formula !== 'number' && !('var' in formula) && formula.op === 'add';
}

function isMulFormula(formula: SkillFormula): formula is { op: 'mul'; args: SkillFormula[] } {
  return typeof formula !== 'number' && !('var' in formula) && formula.op === 'mul';
}

function extractStructuredDamagePreview(formula: SkillFormula, context: SkillTooltipPreviewContext): StructuredDamagePreview | null {
  if (!isMulFormula(formula) || formula.args.length !== 2) {
    return null;
  }
  const [fixedFormula, percentFormula] = formula.args;
  if (!isAddFormula(fixedFormula) || !isAddFormula(percentFormula)) {
    return null;
  }
  if (typeof percentFormula.args[0] !== 'number' || Math.abs((percentFormula.args[0] as number) - 1) > 1e-6) {
    return null;
  }

  const fixedParts = fixedFormula.args.map((entry) => previewFormula(entry, context));
  const fixedTotal = fixedParts.reduce((sum, entry) => sum + (entry.resolved ?? 0), 0);
  const percentParts = percentFormula.args.slice(1).map((entry) => previewPercentPart(entry, context));
  const percentBonus = percentParts.reduce((sum, entry) => sum + (entry.resolved ?? 0), 0);
  const total = fixedTotal * (1 + percentBonus);

  const fixedHtml = fixedParts
    .map((entry) => entry.html)
    .join('<span class="skill-formula-operator"> + </span>');
  const percentHtml = percentParts.length > 0
    ? percentParts
      .map((entry) => entry.html)
      .join('<span class="skill-formula-operator"> + </span>')
    : '<span class="skill-formula-empty">0%</span>';

  return {
    total: Math.max(0, total),
    fixedTotal,
    percentTotal: 1 + percentBonus,
    fixedHtml,
    percentHtml,
  };
}

function previewPercentPart(formula: SkillFormula, context: SkillTooltipPreviewContext): FormulaPreview {
  if (typeof formula === 'number') {
    return {
      html: renderFormulaTerm(formatPercent(formula), 'skill-formula-term-percent'),
      resolved: formula,
    };
  }
  if ('var' in formula) {
    const resolved = resolvePreviewValue(formula.var, context);
    const resolvedPercent = resolved.value * (formula.scale ?? 1);
    const buffReference = buildBuffStackReference(formula.var, context, resolved.known ? resolved.value : null);
    if (buffReference) {
      return {
        html: renderFormulaTerm(
          resolved.known ? `${formatPercent(resolvedPercent)}（${buffReference}×${formatPercent(formula.scale ?? 1)}）` : `${buffReference}×${formatPercent(formula.scale ?? 1)}`,
          'skill-formula-term-percent',
        ),
        resolved: resolvedPercent,
      };
    }
    if (formula.var === 'techLevel') {
      const badge = `<span class="skill-scaling skill-scaling-tech"><span class="skill-scaling-icon">◎</span><span>${escapeHtml(`${formatDisplayNumber(resolved.value)}层`)}</span></span>`;
      return {
        html: renderFormulaTerm(
          resolved.known ? `${formatPercent(resolvedPercent)}（${badge}×${formatPercent(formula.scale ?? 1)}）` : `${escapeHtml(FORMULA_VAR_LABELS[formula.var] ?? formula.var)}×${formatPercent(formula.scale ?? 1)}`,
          'skill-formula-term-percent',
        ),
        resolved: resolvedPercent,
      };
    }
    const meta = FORMULA_VAR_META[formula.var];
    if (meta) {
      return {
        html: renderFormulaTerm(
          resolved.known ? `${formatPercent(resolvedPercent)}（${renderScalingBadge(meta)}×${formatPercent(formula.scale ?? 1)}）` : `${renderScalingBadge(meta)}×${formatPercent(formula.scale ?? 1)}`,
          'skill-formula-term-percent',
        ),
        resolved: resolvedPercent,
      };
    }
    const label = FORMULA_VAR_LABELS[formula.var] ?? formula.var;
    return {
      html: renderFormulaTerm(
        resolved.known ? `${formatPercent(resolvedPercent)}（${escapeHtml(label)}×${formatPercent(formula.scale ?? 1)}）` : `${escapeHtml(label)}×${formatPercent(formula.scale ?? 1)}`,
        'skill-formula-term-percent',
      ),
      resolved: resolvedPercent,
    };
  }
  return previewFormula(formula, context);
}

function joinFormulaParts(parts: string[], operator: string): string {
  return parts.join(`<span class="skill-formula-operator"> ${operator} </span>`);
}

function previewFormula(formula: SkillFormula, context: SkillTooltipPreviewContext): FormulaPreview {
  if (typeof formula === 'number') {
    return {
      html: formatDisplayNumber(formula),
      resolved: formula,
    };
  }
  if ('var' in formula) {
    return renderVariableFormula(formula.var, formula.scale ?? 1, context);
  }
  if (formula.op === 'clamp') {
    const valuePreview = previewFormula(formula.value, context);
    const minPreview = formula.min !== undefined ? previewFormula(formula.min, context) : null;
    const maxPreview = formula.max !== undefined ? previewFormula(formula.max, context) : null;
    const parts = [`值=${valuePreview.html}`];
    if (minPreview) parts.push(`下限=${minPreview.html}`);
    if (maxPreview) parts.push(`上限=${maxPreview.html}`);
    let resolved = valuePreview.resolved;
    if (minPreview) {
      resolved = resolved === null || minPreview.resolved === null
        ? null
        : Math.max(resolved, minPreview.resolved);
    }
    if (maxPreview) {
      resolved = resolved === null || maxPreview.resolved === null
        ? null
        : Math.min(resolved, maxPreview.resolved);
    }
    return {
      html: `限制(${parts.join('，')})`,
      resolved,
    };
  }
  const args = formula.args.map((entry) => previewFormula(entry, context));
  const parts = args.map((entry) => entry.html);
  const allResolved = args.every((entry) => entry.resolved !== null);
  switch (formula.op) {
    case 'add':
      return {
        html: joinFormulaParts(parts, '+'),
        resolved: allResolved ? args.reduce((sum, entry) => sum + (entry.resolved ?? 0), 0) : null,
      };
    case 'sub':
      return {
        html: joinFormulaParts(parts, '-'),
        resolved: allResolved
          ? args.slice(1).reduce((sum, entry) => sum - (entry.resolved ?? 0), args[0]?.resolved ?? 0)
          : null,
      };
    case 'mul':
      return {
        html: parts.map((entry) => `(${entry})`).join('<span class="skill-formula-operator"> × </span>'),
        resolved: allResolved ? args.reduce((product, entry) => product * (entry.resolved ?? 1), 1) : null,
      };
    case 'div':
      if (!allResolved) {
        return {
          html: parts.map((entry) => `(${entry})`).join('<span class="skill-formula-operator"> ÷ </span>'),
          resolved: null,
        };
      }
      return {
        html: parts.map((entry) => `(${entry})`).join('<span class="skill-formula-operator"> ÷ </span>'),
        resolved: args.slice(1).reduce<number | null>((quotient, entry) => {
          if (quotient === null || (entry.resolved ?? 0) === 0) {
            return null;
          }
          return quotient / (entry.resolved ?? 1);
        }, args[0]?.resolved ?? 0),
      };
    case 'min':
      return {
        html: `min(${parts.join(', ')})`,
        resolved: allResolved ? Math.min(...args.map((entry) => entry.resolved ?? 0)) : null,
      };
    case 'max':
      return {
        html: `max(${parts.join(', ')})`,
        resolved: allResolved ? Math.max(...args.map((entry) => entry.resolved ?? 0)) : null,
      };
    default:
      return {
        html: parts.join(', '),
        resolved: null,
      };
  }
}

function formatDamageFormula(formula: SkillFormula, context: SkillTooltipPreviewContext, damageKind: 'physical' | 'spell'): string {
  const structured = extractStructuredDamagePreview(formula, context);
  if (structured) {
    const fixedPart = `<span class="skill-formula-group">${formatDisplayNumber(structured.fixedTotal)}<span class="skill-formula-breakdown">（${structured.fixedHtml}）</span></span>`;
    const percentPart = structured.percentHtml.startsWith('<span class="skill-formula-empty">')
      ? `<span class="skill-formula-group">${formatPercent(structured.percentTotal)}</span>`
      : `<span class="skill-formula-group">${formatPercent(structured.percentTotal)}<span class="skill-formula-breakdown">（${structured.percentHtml}）</span></span>`;
    return `<span class="skill-damage-total skill-damage-total-${damageKind}">${formatDisplayNumber(structured.total)}</span><span class="skill-formula-equals"> = </span>${fixedPart}<span class="skill-formula-operator"> × </span>${percentPart}`;
  }
  const preview = previewFormula(formula, context);
  if (typeof formula === 'number' || 'var' in formula) {
    return preview.html;
  }
  if (preview.resolved === null) {
    return preview.html;
  }
  return `<span class="skill-damage-total skill-damage-total-${damageKind}">${formatDisplayNumber(preview.resolved)}</span><span class="skill-formula-breakdown">（${preview.html}）</span>`;
}

export function summarizeSkillPreviewMetrics(skill: SkillDef, context: SkillTooltipPreviewContext = {}): SkillPreviewMetrics {
  const previewSkill = resolvePreviewSkill(skill);
  let totalDamage = 0;
  let hasDamageEffect = false;
  let hasUnknownDamage = false;
  let hasPhysicalDamage = false;
  let hasSpellDamage = false;

  for (const effect of previewSkill.effects) {
    if (effect.type !== 'damage') {
      continue;
    }
    hasDamageEffect = true;
    if (effect.damageKind === 'physical') {
      hasPhysicalDamage = true;
    } else {
      hasSpellDamage = true;
    }
    const structured = extractStructuredDamagePreview(effect.formula, context);
    const resolvedDamage = structured?.total ?? previewFormula(effect.formula, context).resolved;
    if (resolvedDamage === null) {
      hasUnknownDamage = true;
      continue;
    }
    totalDamage += resolvedDamage;
  }

  const shape = previewSkill.targeting?.shape ?? 'single';
  const targetCount = typeof previewSkill.targeting?.maxTargets === 'number' && previewSkill.targeting.maxTargets > 0
    ? previewSkill.targeting.maxTargets
    : shape === 'single'
      ? 1
      : 99;
  const maxQiOutputPerTick = context.player?.numericStats?.maxQiOutputPerTick;

  return {
    actualDamage: hasDamageEffect && hasUnknownDamage ? null : totalDamage,
    actualQiCost: maxQiOutputPerTick === undefined
      ? previewSkill.cost
      : calcQiCostWithOutputLimit(previewSkill.cost, Math.max(0, maxQiOutputPerTick)),
    range: previewSkill.range,
    targetCount,
    cooldown: previewSkill.cooldown,
    hasPhysicalDamage,
    hasSpellDamage,
    isSingleTarget: targetCount <= 1 && shape === 'single',
    isAreaTarget: targetCount > 1 || shape !== 'single',
    isMelee: previewSkill.range <= 1,
    isRanged: previewSkill.range > 1,
  };
}

function formatTargeting(skill: SkillDef): string {
  const shape = skill.targeting?.shape ?? 'single';
  if (shape === 'line') {
    return `直线，最多命中 ${formatDisplayInteger(skill.targeting?.maxTargets ?? 99)} 个目标`;
  }
  if (shape === 'area') {
    return `范围，半径 ${formatDisplayNumber(skill.targeting?.radius ?? 1)}，最多命中 ${formatDisplayInteger(skill.targeting?.maxTargets ?? 99)} 个目标`;
  }
  return skill.targetMode === 'tile' ? '单体地块' : '单体';
}

/** 构建完整的技能提示内容（富文本行 + 侧栏 Buff 卡片） */
export function buildSkillTooltipContent(skill: SkillDef, context: SkillTooltipPreviewContext = {}): SkillTooltipContent {
  const previewSkill = resolvePreviewSkill(skill);
  const lines: string[] = [`<span class="skill-tooltip-desc">${escapeHtml(previewSkill.desc)}</span>`];
  const asideCards: SkillTooltipAsideCard[] = [];
  if (context.unlockLevel !== undefined) {
    lines.push(renderPlainLine('解锁层数', `第 ${formatDisplayInteger(context.unlockLevel)} 层`));
  }
  lines.push(renderPlainLine('施法距离', formatDisplayNumber(previewSkill.range)));
  lines.push(renderPlainLine('作用方式', formatTargeting(previewSkill)));
  for (const effect of previewSkill.effects) {
    if (effect.type === 'damage') {
      const damageKind = effect.damageKind === 'physical' ? 'physical' : 'spell';
      const damageLabel = damageKind === 'physical'
        ? (effect.element ? `${getElementKeyLabel(effect.element)}行物理伤害` : '物理伤害')
        : `${effect.element ? `${getElementKeyLabel(effect.element)}行` : ''}法术伤害`;
      lines.push(renderLabelLine(damageLabel, formatDamageFormula(effect.formula, context, damageKind)));
      continue;
    }
    const stackLimit = formatBuffMaxStacks(effect.maxStacks);
    const stackText = stackLimit ? `，最多 ${stackLimit} 层` : '';
    const categoryLabel = effect.category === 'debuff' ? '减益' : '增益';
    const targetLabel = effect.target === 'target' ? '目标' : '自身';
    const badge = buildBuffInlineBadge(effect);
    lines.push(renderLabelLine(categoryLabel, `${badge}<span class="skill-tooltip-buff-meta">${escapeHtml(` ${targetLabel} · ${formatDisplayInteger(effect.duration)} 息${stackText}`)}</span>`));
    const effectLines = describeBuffEffect(effect);
    if (effectLines.length > 0) {
      lines.push(renderPlainLine('效果', effectLines.join('，')));
    }
    asideCards.push(buildBuffAsideCard(effect));
  }
  lines.push(renderLabelLine('灵力消耗', buildQiCostValue(previewSkill.cost, context)));
  lines.push(renderPlainLine('冷却', `${formatDisplayInteger(previewSkill.cooldown)} 息`));
  lines.push('<span class="skill-tooltip-note">实际结算仍会受命中、闪避、破招、化解、暴击与目标防御影响。</span>');
  return { lines, asideCards };
}

/** 仅返回提示文本行（不含侧栏卡片） */
export function buildSkillTooltipLines(skill: SkillDef, context: SkillTooltipPreviewContext = {}): string[] {
  return buildSkillTooltipContent(skill, context).lines;
}
