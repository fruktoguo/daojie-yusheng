/**
 * 战斗数值公式与境界差异计算。
 * 提供伤害颜色、境界属性成长倍率、境界压制/优势伤害系数等。
 */
import {
  REALM_ATTRIBUTE_GROWTH_RATE,
  REALM_COMBAT_LINEAR_GROWTH_RATE,
  REALM_DAMAGE_ADVANTAGE_RATE,
  REALM_DAMAGE_DISADVANTAGE_RATE,
} from './constants/gameplay/combat';
import type { ElementKey } from './numeric';
import type { SkillDamageKind } from './types';
import {
  DAMAGE_TRAIL_PHYSICAL_COLOR,
  DAMAGE_TRAIL_SPELL_COLOR,
  ELEMENT_DAMAGE_TRAIL_COLORS,
} from './constants/visuals/combat';

export {
  REALM_ATTRIBUTE_GROWTH_RATE,
  REALM_COMBAT_LINEAR_GROWTH_RATE,
  REALM_DAMAGE_ADVANTAGE_RATE,
  REALM_DAMAGE_DISADVANTAGE_RATE,
} from './constants/gameplay/combat';
export {
  DAMAGE_TRAIL_PHYSICAL_COLOR,
  DAMAGE_TRAIL_SPELL_COLOR,
  ELEMENT_DAMAGE_TRAIL_COLORS,
} from './constants/visuals/combat';

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
