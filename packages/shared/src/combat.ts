/**
 * 战斗数值公式与境界差异计算。
 * 提供伤害颜色、境界属性成长倍率、境界压制/优势伤害系数等。
 */
import type { ElementKey } from './numeric';
import type { SkillDamageKind } from './types';

/** 物理伤害飘字颜色 */
export const DAMAGE_TRAIL_PHYSICAL_COLOR = '#cf7a32';
/** 法术伤害飘字颜色 */
export const DAMAGE_TRAIL_SPELL_COLOR = '#2b5fae';
/** 每境界属性指数成长率 */
export const REALM_ATTRIBUTE_GROWTH_RATE = 0.2;
/** 每境界战斗线性成长率 */
export const REALM_COMBAT_LINEAR_GROWTH_RATE = 0.1;
/** 高境界对低境界的伤害加成率 */
export const REALM_DAMAGE_ADVANTAGE_RATE = 0.2;
/** 低境界对高境界的伤害衰减率 */
export const REALM_DAMAGE_DISADVANTAGE_RATE = 0.2;

/** 五行元素伤害飘字颜色 */
export const ELEMENT_DAMAGE_TRAIL_COLORS: Record<ElementKey, string> = {
  metal: '#f9a825',
  wood: '#7cb342',
  water: '#039be5',
  fire: '#e53935',
  earth: '#8d6e63',
};

/** 根据伤害类型和元素获取飘字颜色 */
export function getDamageTrailColor(damageKind: SkillDamageKind, element?: ElementKey): string {
  if (damageKind === 'physical') {
    return DAMAGE_TRAIL_PHYSICAL_COLOR;
  }
  return element ? ELEMENT_DAMAGE_TRAIL_COLORS[element] : DAMAGE_TRAIL_SPELL_COLOR;
}

/** 按境界等级计算属性指数成长倍率 */
export function getRealmAttributeMultiplier(realmLv: number): number {
  const normalizedRealmLv = Math.max(1, Math.floor(realmLv));
  return Math.pow(1 + REALM_ATTRIBUTE_GROWTH_RATE, normalizedRealmLv - 1);
}

/** 按境界等级计算战斗线性成长倍率 */
export function getRealmLinearGrowthMultiplier(realmLv: number): number {
  const normalizedRealmLv = Math.max(1, Math.floor(realmLv));
  return 1 + REALM_COMBAT_LINEAR_GROWTH_RATE * (normalizedRealmLv - 1);
}

/** 根据攻守双方境界差计算伤害倍率（高打低加成，低打高衰减） */
export function getRealmGapDamageMultiplier(attackerRealmLv: number, defenderRealmLv: number): number {
  const realmGap = Math.floor(attackerRealmLv) - Math.floor(defenderRealmLv);
  if (realmGap > 0) {
    return Math.pow(1 + REALM_DAMAGE_ADVANTAGE_RATE, realmGap);
  }
  if (realmGap < 0) {
    return Math.pow(1 - REALM_DAMAGE_DISADVANTAGE_RATE, Math.abs(realmGap));
  }
  return 1;
}
