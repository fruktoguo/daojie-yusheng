import type { ElementKey } from '../../numeric';

/**
 * 战斗飘字与伤害表现视觉常量。
 */

/** 物理伤害飘字颜色 */
export const DAMAGE_TRAIL_PHYSICAL_COLOR = '#cf7a32';

/** 法术伤害飘字颜色 */
export const DAMAGE_TRAIL_SPELL_COLOR = '#2b5fae';

/** 五行元素伤害飘字颜色 */
export const ELEMENT_DAMAGE_TRAIL_COLORS: Record<ElementKey, string> = {
  metal: '#f9a825',
  wood: '#7cb342',
  water: '#039be5',
  fire: '#e53935',
  earth: '#8d6e63',
};
