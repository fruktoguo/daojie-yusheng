/**
 * 技能提示框公式与缩放标签常量。
 */

import { ATTR_KEYS, NUMERIC_SCALAR_STAT_KEYS, SkillFormulaVar, SKILL_FORMULA_BASE_VAR_LABELS } from '@mud/shared';
import { getAttrKeyLabel, getNumericScalarStatKeyLabel } from '../../domain-labels';

/** 技能缩放徽章的展示元数据。 */
export type SkillScalingMeta = {
  badgeClassName: string;
  icon: string;
  label: string;
  termClassName: string;
};

/** 技能公式变量的人类可读标签。 */
export const FORMULA_VAR_LABELS: Record<string, string> = {
  ...SKILL_FORMULA_BASE_VAR_LABELS,
  ...Object.fromEntries(NUMERIC_SCALAR_STAT_KEYS.flatMap((key) => [
    [`caster.stat.${key}`, `自身${getNumericScalarStatKeyLabel(key)}`],
    [`target.stat.${key}`, `目标${getNumericScalarStatKeyLabel(key)}`],
  ])),
  ...Object.fromEntries(ATTR_KEYS.flatMap((key) => [
    [`caster.attr.${key}`, `自身${getAttrKeyLabel(key)}`],
    [`target.attr.${key}`, `目标${getAttrKeyLabel(key)}`],
  ])),
  targetCount: '命中目标数',
  'caster.hp': '自身当前气血',
  'caster.maxHp': '自身最大气血',
  'target.hp': '目标当前气血',
  'target.maxHp': '目标最大气血',
};

/** 技能公式变量的视觉徽章配置。 */
export const FORMULA_VAR_META: Partial<Record<SkillFormulaVar, SkillScalingMeta>> = {
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
  'caster.stat.hit': { badgeClassName: 'skill-scaling-hit', icon: '◎', label: '命中', termClassName: 'skill-formula-term-hit' },
  'caster.stat.dodge': { badgeClassName: 'skill-scaling-dodge', icon: '◌', label: '闪避', termClassName: 'skill-formula-term-dodge' },
  'caster.stat.crit': { badgeClassName: 'skill-scaling-crit', icon: '✧', label: '暴击', termClassName: 'skill-formula-term-crit' },
  'caster.stat.critDamage': { badgeClassName: 'skill-scaling-crit', icon: '✦', label: '暴伤', termClassName: 'skill-formula-term-crit' },
  'caster.stat.breakPower': { badgeClassName: 'skill-scaling-break', icon: '✕', label: '破招', termClassName: 'skill-formula-term-break' },
  'caster.stat.resolvePower': { badgeClassName: 'skill-scaling-resolve', icon: '⬢', label: '化解', termClassName: 'skill-formula-term-resolve' },
  'caster.stat.moveSpeed': { badgeClassName: 'skill-scaling-speed', icon: '➜', label: '移速', termClassName: 'skill-formula-term-speed' },
  'target.stat.physDef': { badgeClassName: 'skill-scaling-phys-def', icon: '🛡', label: '目标护甲', termClassName: 'skill-formula-term-phys-def' },
  'target.stat.spellDef': { badgeClassName: 'skill-scaling-spell-def', icon: '◈', label: '目标法抗', termClassName: 'skill-formula-term-spell-def' },
  'target.stat.hit': { badgeClassName: 'skill-scaling-hit', icon: '◎', label: '目标命中', termClassName: 'skill-formula-term-hit' },
  'target.stat.dodge': { badgeClassName: 'skill-scaling-dodge', icon: '◌', label: '目标闪避', termClassName: 'skill-formula-term-dodge' },
  'target.stat.crit': { badgeClassName: 'skill-scaling-crit', icon: '✧', label: '目标暴击', termClassName: 'skill-formula-term-crit' },
  'target.stat.critDamage': { badgeClassName: 'skill-scaling-crit', icon: '✦', label: '目标暴伤', termClassName: 'skill-formula-term-crit' },
  'target.stat.breakPower': { badgeClassName: 'skill-scaling-break', icon: '✕', label: '目标破招', termClassName: 'skill-formula-term-break' },
  'target.stat.resolvePower': { badgeClassName: 'skill-scaling-resolve', icon: '⬢', label: '目标化解', termClassName: 'skill-formula-term-resolve' },
  'target.stat.moveSpeed': { badgeClassName: 'skill-scaling-speed', icon: '➜', label: '目标移速', termClassName: 'skill-formula-term-speed' },
};
