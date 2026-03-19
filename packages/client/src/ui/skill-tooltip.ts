import { SkillDef, SkillFormula } from '@mud/shared';

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
  'caster.stat.physDef': '自身物防',
  'caster.stat.spellDef': '自身法防',
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
  'target.stat.physDef': '目标物防',
  'target.stat.spellDef': '目标法防',
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

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (Math.abs(value % 1) < 1e-6) {
    return String(Math.round(value));
  }
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatFormula(formula: SkillFormula): string {
  if (typeof formula === 'number') {
    return formatNumber(formula);
  }
  if ('var' in formula) {
    const label = FORMULA_VAR_LABELS[formula.var] ?? formula.var;
    const scale = formula.scale ?? 1;
    if (Math.abs(scale - 1) < 1e-6) {
      return label;
    }
    return `${formatNumber(scale)}*${label}`;
  }
  if (formula.op === 'clamp') {
    const parts = [`值=${formatFormula(formula.value)}`];
    if (formula.min !== undefined) parts.push(`下限=${formatFormula(formula.min)}`);
    if (formula.max !== undefined) parts.push(`上限=${formatFormula(formula.max)}`);
    return `限制(${parts.join('，')})`;
  }
  const args = formula.args.map((entry) => formatFormula(entry));
  switch (formula.op) {
    case 'add':
      return args.join(' + ');
    case 'sub':
      return args.join(' - ');
    case 'mul':
      return args.map((entry) => `(${entry})`).join(' * ');
    case 'div':
      return args.map((entry) => `(${entry})`).join(' / ');
    case 'min':
      return `min(${args.join(', ')})`;
    case 'max':
      return `max(${args.join(', ')})`;
    default:
      return args.join(', ');
  }
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

export function buildSkillTooltipLines(skill: SkillDef, unlockLevel?: number): string[] {
  const lines: string[] = [skill.desc];
  if (unlockLevel !== undefined) {
    lines.push(`解锁层数：第 ${unlockLevel} 层`);
  }
  lines.push(`施法距离：${skill.range}`);
  lines.push(`作用方式：${formatTargeting(skill)}`);
  for (const effect of skill.effects) {
    if (effect.type === 'damage') {
      lines.push(`${effect.damageKind === 'physical' ? '物理' : '法术'}伤害：${formatFormula(effect.formula)}`);
      continue;
    }
    const stackText = effect.maxStacks && effect.maxStacks > 1 ? `，最多 ${effect.maxStacks} 层` : '';
    lines.push(`增益：${effect.name}，持续 ${effect.duration} 回合${stackText}`);
  }
  lines.push(`灵力消耗：${skill.cost}`);
  lines.push(`冷却：${skill.cooldown} 秒`);
  lines.push('实际结算仍会受命中、闪避、破招、化解、暴击与目标防御影响。');
  return lines;
}
