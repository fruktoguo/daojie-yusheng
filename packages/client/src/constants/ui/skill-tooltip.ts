/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
/**
 * 技能提示框公式与缩放标签常量。
 */

import { ATTR_KEYS, NUMERIC_SCALAR_STAT_KEYS, SkillFormulaVar, SKILL_FORMULA_BASE_VAR_LABELS } from '@mud/shared';
import { getAttrKeyLabel, getNumericScalarStatKeyLabel } from '../../domain-labels';
import { t } from '../../ui/i18n';

function skillText(key: string): string {
  return t(key);
}

/** 技能缩放徽章的展示元数据。 */
export type SkillScalingMeta = {
/**
 * badgeClassName：badgeClass名称名称或显示文本。
 */

  badgeClassName: string;  
  /**
 * icon：icon相关字段。
 */

  icon: string;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * termClassName：termClass名称名称或显示文本。
 */

  termClassName: string;
};

/** 技能公式变量的人类可读标签。 */
export const FORMULA_VAR_LABELS: Record<string, string> = {
  ...SKILL_FORMULA_BASE_VAR_LABELS,
  ...Object.fromEntries(NUMERIC_SCALAR_STAT_KEYS.flatMap((key) => [
    [`caster.stat.${key}`, t('skill.formula.var.caster-stat', { label: getNumericScalarStatKeyLabel(key) })],
    [`target.stat.${key}`, t('skill.formula.var.target-stat', { label: getNumericScalarStatKeyLabel(key) })],
  ])),
  ...Object.fromEntries(ATTR_KEYS.flatMap((key) => [
    [`caster.attr.${key}`, t('skill.formula.var.caster-attr', { label: getAttrKeyLabel(key) })],
    [`target.attr.${key}`, t('skill.formula.var.target-attr', { label: getAttrKeyLabel(key) })],
  ])),
  targetCount: skillText('skill.formula.var.target-count'),
  'caster.hp': skillText('skill.formula.var.caster-hp'),
  'caster.maxHp': skillText('skill.formula.var.caster-max-hp'),
  'target.hp': skillText('skill.formula.var.target-hp'),
  'target.maxHp': skillText('skill.formula.var.target-max-hp'),
};

/** 技能公式变量的视觉徽章配置。 */
export const FORMULA_VAR_META: Partial<Record<SkillFormulaVar, SkillScalingMeta>> = {
  'caster.maxHp': { badgeClassName: 'skill-scaling-hp', icon: '♥', label: skillText('skill.formula.meta.caster-max-hp'), termClassName: 'skill-formula-term-hp' },
  'caster.maxQi': { badgeClassName: 'skill-scaling-qi', icon: '◌', label: skillText('skill.formula.meta.caster-max-qi'), termClassName: 'skill-formula-term-qi' },
  'target.maxHp': { badgeClassName: 'skill-scaling-hp', icon: '♥', label: skillText('skill.formula.meta.target-max-hp'), termClassName: 'skill-formula-term-hp' },
  'target.maxQi': { badgeClassName: 'skill-scaling-qi', icon: '◌', label: skillText('skill.formula.meta.target-max-qi'), termClassName: 'skill-formula-term-qi' },
  'caster.stat.maxHp': { badgeClassName: 'skill-scaling-hp', icon: '♥', label: skillText('skill.formula.meta.caster-stat-max-hp'), termClassName: 'skill-formula-term-hp' },
  'caster.stat.maxQi': { badgeClassName: 'skill-scaling-qi', icon: '◌', label: skillText('skill.formula.meta.caster-stat-max-qi'), termClassName: 'skill-formula-term-qi' },
  'caster.stat.physAtk': { badgeClassName: 'skill-scaling-phys-atk', icon: '⚔', label: skillText('skill.formula.meta.caster-stat-phys-atk'), termClassName: 'skill-formula-term-phys-atk' },
  'caster.stat.spellAtk': { badgeClassName: 'skill-scaling-spell-atk', icon: '✦', label: skillText('skill.formula.meta.caster-stat-spell-atk'), termClassName: 'skill-formula-term-spell-atk' },
  'caster.stat.physDef': { badgeClassName: 'skill-scaling-phys-def', icon: '🛡', label: skillText('skill.formula.meta.caster-stat-phys-def'), termClassName: 'skill-formula-term-phys-def' },
  'caster.stat.spellDef': { badgeClassName: 'skill-scaling-spell-def', icon: '◈', label: skillText('skill.formula.meta.caster-stat-spell-def'), termClassName: 'skill-formula-term-spell-def' },
  'caster.stat.hit': { badgeClassName: 'skill-scaling-hit', icon: '◎', label: skillText('skill.formula.meta.caster-stat-hit'), termClassName: 'skill-formula-term-hit' },
  'caster.stat.dodge': { badgeClassName: 'skill-scaling-dodge', icon: '◌', label: skillText('skill.formula.meta.caster-stat-dodge'), termClassName: 'skill-formula-term-dodge' },
  'caster.stat.crit': { badgeClassName: 'skill-scaling-crit', icon: '✧', label: skillText('skill.formula.meta.caster-stat-crit'), termClassName: 'skill-formula-term-crit' },
  'caster.stat.antiCrit': { badgeClassName: 'skill-scaling-crit', icon: '◈', label: skillText('skill.formula.meta.caster-stat-anti-crit'), termClassName: 'skill-formula-term-crit' },
  'caster.stat.critDamage': { badgeClassName: 'skill-scaling-crit', icon: '✦', label: skillText('skill.formula.meta.caster-stat-crit-damage'), termClassName: 'skill-formula-term-crit' },
  'caster.stat.breakPower': { badgeClassName: 'skill-scaling-break', icon: '✕', label: skillText('skill.formula.meta.caster-stat-break-power'), termClassName: 'skill-formula-term-break' },
  'caster.stat.resolvePower': { badgeClassName: 'skill-scaling-resolve', icon: '⬢', label: skillText('skill.formula.meta.caster-stat-resolve-power'), termClassName: 'skill-formula-term-resolve' },
  'caster.stat.moveSpeed': { badgeClassName: 'skill-scaling-speed', icon: '➜', label: skillText('skill.formula.meta.caster-stat-move-speed'), termClassName: 'skill-formula-term-speed' },
  'target.stat.physDef': { badgeClassName: 'skill-scaling-phys-def', icon: '🛡', label: skillText('skill.formula.meta.target-stat-phys-def'), termClassName: 'skill-formula-term-phys-def' },
  'target.stat.spellDef': { badgeClassName: 'skill-scaling-spell-def', icon: '◈', label: skillText('skill.formula.meta.target-stat-spell-def'), termClassName: 'skill-formula-term-spell-def' },
  'target.stat.hit': { badgeClassName: 'skill-scaling-hit', icon: '◎', label: skillText('skill.formula.meta.target-stat-hit'), termClassName: 'skill-formula-term-hit' },
  'target.stat.dodge': { badgeClassName: 'skill-scaling-dodge', icon: '◌', label: skillText('skill.formula.meta.target-stat-dodge'), termClassName: 'skill-formula-term-dodge' },
  'target.stat.crit': { badgeClassName: 'skill-scaling-crit', icon: '✧', label: skillText('skill.formula.meta.target-stat-crit'), termClassName: 'skill-formula-term-crit' },
  'target.stat.antiCrit': { badgeClassName: 'skill-scaling-crit', icon: '◈', label: skillText('skill.formula.meta.target-stat-anti-crit'), termClassName: 'skill-formula-term-crit' },
  'target.stat.critDamage': { badgeClassName: 'skill-scaling-crit', icon: '✦', label: skillText('skill.formula.meta.target-stat-crit-damage'), termClassName: 'skill-formula-term-crit' },
  'target.stat.breakPower': { badgeClassName: 'skill-scaling-break', icon: '✕', label: skillText('skill.formula.meta.target-stat-break-power'), termClassName: 'skill-formula-term-break' },
  'target.stat.resolvePower': { badgeClassName: 'skill-scaling-resolve', icon: '⬢', label: skillText('skill.formula.meta.target-stat-resolve-power'), termClassName: 'skill-formula-term-resolve' },
  'target.stat.moveSpeed': { badgeClassName: 'skill-scaling-speed', icon: '➜', label: skillText('skill.formula.meta.target-stat-move-speed'), termClassName: 'skill-formula-term-speed' },
};
