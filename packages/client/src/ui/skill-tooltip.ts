import { ElementKey, NumericScalarStatKey, NUMERIC_SCALAR_STAT_KEYS, SkillDef, SkillFormula, SkillFormulaVar } from '@mud/shared';
import type { PlayerState } from '@mud/shared';

type SkillTooltipPreviewPlayer = Pick<PlayerState, 'hp' | 'maxHp' | 'qi' | 'numericStats'>;

export interface SkillTooltipPreviewContext {
  techLevel?: number;
  unlockLevel?: number;
  player?: SkillTooltipPreviewPlayer | null;
  target?: SkillTooltipPreviewPlayer | null;
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

const ELEMENT_NAMES: Record<ElementKey, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

const ATTR_LABELS = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  comprehension: '悟性',
  luck: '气运',
} as const;

const NUMERIC_STAT_LABELS: Partial<Record<NumericScalarStatKey, string>> = {
  maxHp: '最大生命',
  maxQi: '最大灵力',
  physAtk: '物理攻击',
  spellAtk: '法术攻击',
  physDef: '物理防御',
  spellDef: '法术防御',
  hit: '命中',
  dodge: '闪避',
  crit: '暴击',
  critDamage: '暴击伤害',
  breakPower: '破招',
  resolvePower: '化解',
  maxQiOutputPerTick: '灵力输出',
  qiRegenRate: '灵力回复',
  hpRegenRate: '生命回复',
  cooldownSpeed: '冷却速度',
  auraCostReduce: '灵耗减免',
  auraPowerRate: '术法增幅',
  playerExpRate: '角色经验',
  techniqueExpRate: '功法经验',
  realmExpPerTick: '每息境界经验',
  techniqueExpPerTick: '每息功法经验',
  lootRate: '掉落增幅',
  rareLootRate: '稀有掉落',
  viewRange: '视野',
  moveSpeed: '移动速度',
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

function formatSignedValue(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(value)}`;
}

function describeBuffEffect(effect: Extract<SkillDef['effects'][number], { type: 'buff' }>): string[] {
  const lines: string[] = [];
  if (effect.attrs) {
    for (const [key, value] of Object.entries(effect.attrs)) {
      if (typeof value !== 'number' || value === 0) continue;
      lines.push(`${ATTR_LABELS[key as keyof typeof ATTR_LABELS] ?? key} ${formatSignedValue(value)}`);
    }
  }
  if (effect.stats) {
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
      const value = effect.stats[key];
      if (typeof value !== 'number' || value === 0) continue;
      lines.push(`${NUMERIC_STAT_LABELS[key] ?? key} ${formatSignedValue(value)}`);
    }
    if (effect.stats.elementDamageBonus) {
      for (const [key, value] of Object.entries(effect.stats.elementDamageBonus)) {
        if (typeof value !== 'number' || value === 0) continue;
        lines.push(`${ELEMENT_NAMES[key as ElementKey]}行增伤 ${formatSignedValue(value)}`);
      }
    }
    if (effect.stats.elementDamageReduce) {
      for (const [key, value] of Object.entries(effect.stats.elementDamageReduce)) {
        if (typeof value !== 'number' || value === 0) continue;
        lines.push(`${ELEMENT_NAMES[key as ElementKey]}行减伤 ${formatSignedValue(value)}`);
      }
    }
  }
  return lines;
}

function buildBuffInlineBadge(effect: Extract<SkillDef['effects'][number], { type: 'buff' }>): string {
  const toneClass = effect.category === 'debuff' ? 'debuff' : 'buff';
  const mark = normalizeBuffMark(effect.name, effect.shortMark);
  return `<span class="skill-tooltip-buff-entry ${toneClass}"><span class="skill-tooltip-buff-mark">${escapeHtml(mark)}</span><span>${escapeHtml(effect.name)}</span></span>`;
}

function buildBuffAsideCard(effect: Extract<SkillDef['effects'][number], { type: 'buff' }>): SkillTooltipAsideCard {
  const effectLines = describeBuffEffect(effect);
  const lines = [
    `${effect.target === 'target' ? '目标' : '自身'} · ${effect.duration} 息${effect.maxStacks && effect.maxStacks > 1 ? ` · 最多 ${effect.maxStacks} 层` : ''}`,
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

function resolveCasterStat(player: PreviewPlayer | null | undefined, key: NumericScalarStatKey): number | null {
  if (!player?.numericStats) {
    return null;
  }
  return player.numericStats[key];
}

function resolveTargetPreview(context: SkillTooltipPreviewContext): PreviewPlayer | null | undefined {
  return context.target ?? context.player;
}

function resolvePreviewVar(varName: SkillFormulaVar, context: SkillTooltipPreviewContext): number | null {
  const player = context.player;
  const target = resolveTargetPreview(context);
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
    case 'target.maxHp':
      return null;
    case 'target.hp':
      return target?.hp ?? null;
    case 'target.qi':
      return target?.qi ?? null;
    case 'target.maxQi':
      return target?.numericStats?.maxQi ?? null;
    default:
      if (varName.startsWith('caster.stat.')) {
        return resolveCasterStat(player, varName.slice('caster.stat.'.length) as NumericScalarStatKey);
      }
      if (varName.startsWith('target.stat.')) {
        if (varName === 'target.stat.maxHp') {
          return null;
        }
        return resolveCasterStat(target, varName.slice('target.stat.'.length) as NumericScalarStatKey);
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

function joinFormulaParts(parts: string[], operator: string): string {
  return parts.join(`<span class="skill-formula-operator"> ${operator} </span>`);
}

function previewFormula(formula: SkillFormula, context: SkillTooltipPreviewContext): FormulaPreview {
  if (typeof formula === 'number') {
    return {
      html: formatNumber(formula),
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
  const preview = previewFormula(formula, context);
  if (typeof formula === 'number' || 'var' in formula) {
    return preview.html;
  }
  if (preview.resolved === null) {
    return preview.html;
  }
  return `<span class="skill-damage-total skill-damage-total-${damageKind}">${formatNumber(preview.resolved)}</span><span class="skill-formula-breakdown">（${preview.html}）</span>`;
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

export function buildSkillTooltipContent(skill: SkillDef, context: SkillTooltipPreviewContext = {}): SkillTooltipContent {
  const lines: string[] = [`<span class="skill-tooltip-desc">${escapeHtml(skill.desc)}</span>`];
  const asideCards: SkillTooltipAsideCard[] = [];
  if (context.unlockLevel !== undefined) {
    lines.push(renderPlainLine('解锁层数', `第 ${context.unlockLevel} 层`));
  }
  lines.push(renderPlainLine('施法距离', String(skill.range)));
  lines.push(renderPlainLine('作用方式', formatTargeting(skill)));
  for (const effect of skill.effects) {
    if (effect.type === 'damage') {
      const damageKind = effect.damageKind === 'physical' ? 'physical' : 'spell';
      const damageLabel = damageKind === 'physical'
        ? (effect.element ? `${ELEMENT_NAMES[effect.element]}行物理伤害` : '物理伤害')
        : `${effect.element ? `${ELEMENT_NAMES[effect.element]}行` : ''}法术伤害`;
      lines.push(renderLabelLine(damageLabel, formatDamageFormula(effect.formula, context, damageKind)));
      continue;
    }
    const stackText = effect.maxStacks && effect.maxStacks > 1 ? `，最多 ${effect.maxStacks} 层` : '';
    const categoryLabel = effect.category === 'debuff' ? '减益' : '增益';
    const targetLabel = effect.target === 'target' ? '目标' : '自身';
    const badge = buildBuffInlineBadge(effect);
    lines.push(renderLabelLine(categoryLabel, `${badge}<span class="skill-tooltip-buff-meta">${escapeHtml(` ${targetLabel} · ${effect.duration} 息${stackText}`)}</span>`));
    const effectLines = describeBuffEffect(effect);
    if (effectLines.length > 0) {
      lines.push(renderPlainLine('效果', effectLines.join('，')));
    }
    asideCards.push(buildBuffAsideCard(effect));
  }
  lines.push(renderPlainLine('灵力消耗', String(skill.cost)));
  lines.push(renderPlainLine('冷却', `${skill.cooldown} 息`));
  lines.push('<span class="skill-tooltip-note">实际结算仍会受命中、闪避、破招、化解、暴击与目标防御影响。</span>');
  return { lines, asideCards };
}

export function buildSkillTooltipLines(skill: SkillDef, context: SkillTooltipPreviewContext = {}): string[] {
  return buildSkillTooltipContent(skill, context).lines;
}
