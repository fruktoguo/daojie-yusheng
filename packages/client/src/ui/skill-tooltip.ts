import { NumericScalarStatKey, SkillDef, SkillFormula, SkillFormulaVar } from '@mud/shared';
import type { PlayerState } from '@mud/shared';

type SkillTooltipPreviewPlayer = Pick<PlayerState, 'hp' | 'maxHp' | 'qi' | 'numericStats'>;

export interface SkillTooltipPreviewContext {
  techLevel?: number;
  unlockLevel?: number;
  player?: SkillTooltipPreviewPlayer | null;
}

type PreviewPlayer = NonNullable<SkillTooltipPreviewContext['player']>;

type ScalingMeta = {
  badgeClassName: string;
  icon: string;
  label: string;
  termClassName: string;
};

type FormulaPreview = {
  html: string;
  resolved: number | null;
};

const FORMULA_VAR_LABELS: Record<string, string> = {
  techLevel: '功法层数',
  targetCount: '命中目标数',
  'caster.hp': '自身当前气血',
  'caster.maxHp': '自身最大气血',
  'caster.qi': '自身当前灵力',
  'caster.maxQi': '自身最大灵力',
  'target.hp': '目标当前气血',
  'target.maxHp': '目标最大气血',
  'target.qi': '目标当前灵力',
  'target.maxQi': '目标最大灵力',
  'caster.stat.maxHp': '自身气血上限',
  'caster.stat.maxQi': '自身灵力上限',
  'caster.stat.physAtk': '自身物攻',
  'caster.stat.spellAtk': '自身法攻',
  'caster.stat.physDef': '自身护甲',
  'caster.stat.spellDef': '自身法抗',
  'caster.stat.hit': '自身命中',
  'caster.stat.dodge': '自身闪避',
  'caster.stat.crit': '自身暴击',
  'caster.stat.critDamage': '自身暴伤',
  'caster.stat.breakPower': '自身破招',
  'caster.stat.resolvePower': '自身化解',
  'caster.stat.maxQiOutputPerTick': '自身灵力输出',
  'caster.stat.qiRegenRate': '自身灵力回复',
  'caster.stat.hpRegenRate': '自身气血回复',
  'caster.stat.cooldownSpeed': '自身冷却速度',
  'caster.stat.auraCostReduce': '自身灵耗减免',
  'caster.stat.auraPowerRate': '自身灵术增幅',
  'caster.stat.playerExpRate': '自身角色经验',
  'caster.stat.techniqueExpRate': '自身功法经验',
  'caster.stat.lootRate': '自身掉宝率',
  'caster.stat.rareLootRate': '自身稀有掉落率',
  'caster.stat.viewRange': '自身视野',
  'caster.stat.moveSpeed': '自身移速',
  'target.stat.maxHp': '目标气血上限',
  'target.stat.maxQi': '目标灵力上限',
  'target.stat.physAtk': '目标物攻',
  'target.stat.spellAtk': '目标法攻',
  'target.stat.physDef': '目标护甲',
  'target.stat.spellDef': '目标法抗',
  'target.stat.hit': '目标命中',
  'target.stat.dodge': '目标闪避',
  'target.stat.crit': '目标暴击',
  'target.stat.critDamage': '目标暴伤',
  'target.stat.breakPower': '目标破招',
  'target.stat.resolvePower': '目标化解',
  'target.stat.maxQiOutputPerTick': '目标灵力输出',
  'target.stat.qiRegenRate': '目标灵力回复',
  'target.stat.hpRegenRate': '目标气血回复',
  'target.stat.cooldownSpeed': '目标冷却速度',
  'target.stat.auraCostReduce': '目标灵耗减免',
  'target.stat.auraPowerRate': '目标灵术增幅',
  'target.stat.playerExpRate': '目标角色经验',
  'target.stat.techniqueExpRate': '目标功法经验',
  'target.stat.lootRate': '目标掉宝率',
  'target.stat.rareLootRate': '目标稀有掉落率',
  'target.stat.viewRange': '目标视野',
  'target.stat.moveSpeed': '目标移速',
};

const FORMULA_VAR_META: Partial<Record<SkillFormulaVar, ScalingMeta>> = {
  'caster.maxHp': { badgeClassName: 'skill-scaling-hp', icon: '♥', label: '生命', termClassName: 'skill-formula-term-hp' },
  'caster.maxQi': { badgeClassName: 'skill-scaling-qi', icon: '◌', label: '灵力', termClassName: 'skill-formula-term-qi' },
  'target.maxHp': { badgeClassName: 'skill-scaling-hp', icon: '♥', label: '目标生命', termClassName: 'skill-formula-term-hp' },
  'target.maxQi': { badgeClassName: 'skill-scaling-qi', icon: '◌', label: '目标灵力', termClassName: 'skill-formula-term-qi' },
  'caster.stat.maxHp': { badgeClassName: 'skill-scaling-hp', icon: '♥', label: '生命', termClassName: 'skill-formula-term-hp' },
  'caster.stat.maxQi': { badgeClassName: 'skill-scaling-qi', icon: '◌', label: '灵力', termClassName: 'skill-formula-term-qi' },
  'caster.stat.physAtk': { badgeClassName: 'skill-scaling-phys-atk', icon: '⚔', label: '物攻', termClassName: 'skill-formula-term-phys-atk' },
  'caster.stat.spellAtk': { badgeClassName: 'skill-scaling-spell-atk', icon: '✦', label: '法攻', termClassName: 'skill-formula-term-spell-atk' },
  'caster.stat.physDef': { badgeClassName: 'skill-scaling-phys-def', icon: '🛡', label: '护甲', termClassName: 'skill-formula-term-phys-def' },
  'caster.stat.spellDef': { badgeClassName: 'skill-scaling-spell-def', icon: '◈', label: '法抗', termClassName: 'skill-formula-term-spell-def' },
  'caster.stat.resolvePower': { badgeClassName: 'skill-scaling-resolve', icon: '⬢', label: '化解', termClassName: 'skill-formula-term-resolve' },
  'caster.stat.moveSpeed': { badgeClassName: 'skill-scaling-speed', icon: '➜', label: '移速', termClassName: 'skill-formula-term-speed' },
  'target.stat.physDef': { badgeClassName: 'skill-scaling-phys-def', icon: '🛡', label: '目标护甲', termClassName: 'skill-formula-term-phys-def' },
  'target.stat.spellDef': { badgeClassName: 'skill-scaling-spell-def', icon: '◈', label: '目标法抗', termClassName: 'skill-formula-term-spell-def' },
  'target.stat.resolvePower': { badgeClassName: 'skill-scaling-resolve', icon: '⬢', label: '目标化解', termClassName: 'skill-formula-term-resolve' },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (Math.abs(value % 1) < 1e-6) {
    return String(Math.round(value));
  }
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatPercent(scale: number): string {
  return `${formatNumber(scale * 100)}%`;
}

function renderLabelLine(label: string, value: string): string {
  return `<span class="skill-tooltip-label">${escapeHtml(label)}：</span>${value}`;
}

function renderPlainLine(label: string, value: string): string {
  return renderLabelLine(label, escapeHtml(value));
}

function renderScalingBadge(meta: ScalingMeta): string {
  return `<span class="skill-scaling ${meta.badgeClassName}"><span class="skill-scaling-icon">${escapeHtml(meta.icon)}</span><span>${escapeHtml(meta.label)}</span></span>`;
}

function renderFormulaTerm(content: string, className: string): string {
  return `<span class="skill-formula-term ${className}">${content}</span>`;
}

function resolveCasterStat(player: PreviewPlayer | null | undefined, key: NumericScalarStatKey): number | null {
  if (!player?.numericStats) {
    return null;
  }
  return player.numericStats[key];
}

function resolvePreviewVar(varName: SkillFormulaVar, context: SkillTooltipPreviewContext): number | null {
  const player = context.player;
  switch (varName) {
    case 'techLevel':
      return context.techLevel ?? null;
    case 'caster.hp':
      return player?.hp ?? null;
    case 'caster.maxHp':
      return player?.maxHp ?? null;
    case 'caster.qi':
      return player?.qi ?? null;
    case 'caster.maxQi':
      return player?.numericStats?.maxQi ?? null;
    default:
      if (varName.startsWith('caster.stat.')) {
        return resolveCasterStat(player, varName.slice('caster.stat.'.length) as NumericScalarStatKey);
      }
      return null;
  }
}

function renderVariableFormula(varName: SkillFormulaVar, scale: number, context: SkillTooltipPreviewContext): FormulaPreview {
  if (varName === 'techLevel') {
    const techLevel = context.techLevel;
    if (typeof techLevel === 'number') {
      const contribution = techLevel * scale;
      const detail = `<span class="skill-scaling skill-scaling-tech"><span class="skill-scaling-icon">◎</span><span>${escapeHtml(`${formatNumber(techLevel)}层`)}</span></span>`;
      return {
        html: renderFormulaTerm(`${formatNumber(contribution)}(${detail})`, 'skill-formula-term-tech'),
        resolved: contribution,
      };
    }
  }

  const meta = FORMULA_VAR_META[varName];
  const resolvedValue = resolvePreviewVar(varName, context);
  if (meta) {
    const badge = renderScalingBadge(meta);
    if (resolvedValue !== null) {
      const contribution = resolvedValue * scale;
      return {
        html: renderFormulaTerm(`${formatNumber(contribution)}(${formatPercent(scale)} ${badge})`, meta.termClassName),
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
      html: renderFormulaTerm(`${formatNumber(contribution)}(${escapeHtml(label)})`, 'skill-formula-term-generic'),
      resolved: contribution,
    };
  }

  return {
    html: renderFormulaTerm(
      Math.abs(scale - 1) < 1e-6 ? escapeHtml(label) : `${formatNumber(scale)}*${escapeHtml(label)}`,
      'skill-formula-term-generic',
    ),
    resolved: null,
  };
}

function flattenAddTerms(formula: SkillFormula): SkillFormula[] {
  if (typeof formula === 'number' || 'var' in formula || formula.op !== 'add') {
    return [formula];
  }
  return formula.args.flatMap((entry) => flattenAddTerms(entry));
}

function joinFormulaParts(parts: string[], operator: string): string {
  return parts.join(`<span class="skill-formula-operator"> ${operator} </span>`);
}

function formatFormulaRich(formula: SkillFormula, context: SkillTooltipPreviewContext): string {
  if (typeof formula === 'number') {
    return formatNumber(formula);
  }
  if ('var' in formula) {
    return renderVariableFormula(formula.var, formula.scale ?? 1, context).html;
  }
  if (formula.op === 'clamp') {
    const parts = [`值=${formatFormulaRich(formula.value, context)}`];
    if (formula.min !== undefined) parts.push(`下限=${formatFormulaRich(formula.min, context)}`);
    if (formula.max !== undefined) parts.push(`上限=${formatFormulaRich(formula.max, context)}`);
    return `限制(${parts.join('，')})`;
  }
  const args = formula.args.map((entry) => formatFormulaRich(entry, context));
  switch (formula.op) {
    case 'add':
      return joinFormulaParts(args, '+');
    case 'sub':
      return joinFormulaParts(args, '-');
    case 'mul':
      return args.map((entry) => `(${entry})`).join('<span class="skill-formula-operator"> × </span>');
    case 'div':
      return args.map((entry) => `(${entry})`).join('<span class="skill-formula-operator"> ÷ </span>');
    case 'min':
      return `min(${args.join(', ')})`;
    case 'max':
      return `max(${args.join(', ')})`;
    default:
      return args.join(', ');
  }
}

function formatDamageFormula(formula: SkillFormula, context: SkillTooltipPreviewContext, damageKind: 'physical' | 'spell'): string {
  const terms = flattenAddTerms(formula).map((entry) => {
    if (typeof entry === 'number') {
      return { html: renderFormulaTerm(formatNumber(entry), 'skill-formula-term-base'), resolved: entry };
    }
    if ('var' in entry) {
      return renderVariableFormula(entry.var, entry.scale ?? 1, context);
    }
    return { html: formatFormulaRich(entry, context), resolved: null };
  });

  if (terms.length === 1) {
    return terms[0].html;
  }

  const detail = joinFormulaParts(terms.map((entry) => entry.html), '+');
  const fullyResolved = terms.every((entry) => entry.resolved !== null);
  if (!fullyResolved) {
    return detail;
  }

  const total = terms.reduce((sum, entry) => sum + (entry.resolved ?? 0), 0);
  return `<span class="skill-damage-total skill-damage-total-${damageKind}">${formatNumber(total)}</span><span class="skill-formula-breakdown">（${detail}）</span>`;
}

function formatTargeting(skill: SkillDef): string {
  const shape = skill.targeting?.shape ?? 'single';
  if (shape === 'line') {
    return `直线，最多命中 ${skill.targeting?.maxTargets ?? 99} 个目标`;
  }
  if (shape === 'area') {
    return `范围，半径 ${skill.targeting?.radius ?? 1}，最多命中 ${skill.targeting?.maxTargets ?? 99} 个目标`;
  }
  return skill.targetMode === 'tile' ? '单体地块' : '单体';
}

export function buildSkillTooltipLines(skill: SkillDef, context: SkillTooltipPreviewContext = {}): string[] {
  const lines: string[] = [`<span class="skill-tooltip-desc">${escapeHtml(skill.desc)}</span>`];
  if (context.unlockLevel !== undefined) {
    lines.push(renderPlainLine('解锁层数', `第 ${context.unlockLevel} 层`));
  }
  lines.push(renderPlainLine('施法距离', String(skill.range)));
  lines.push(renderPlainLine('作用方式', formatTargeting(skill)));
  for (const effect of skill.effects) {
    if (effect.type === 'damage') {
      const damageKind = effect.damageKind === 'physical' ? 'physical' : 'spell';
      lines.push(renderLabelLine(damageKind === 'physical' ? '物理伤害' : '法术伤害', formatDamageFormula(effect.formula, context, damageKind)));
      continue;
    }
    const stackText = effect.maxStacks && effect.maxStacks > 1 ? `，最多 ${effect.maxStacks} 层` : '';
    lines.push(renderPlainLine('增益', `${effect.name}，持续 ${effect.duration} 回合${stackText}`));
  }
  lines.push(renderPlainLine('灵力消耗', String(skill.cost)));
  lines.push(renderPlainLine('冷却', `${skill.cooldown} 秒`));
  lines.push('<span class="skill-tooltip-note">实际结算仍会受命中、闪避、破招、化解、暴击与目标防御影响。</span>');
  return lines;
}
