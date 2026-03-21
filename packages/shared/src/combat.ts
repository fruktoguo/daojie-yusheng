import type { ElementKey } from './numeric';
import type { SkillDamageKind } from './types';

export const DAMAGE_TRAIL_PHYSICAL_COLOR = '#cf7a32';
export const DAMAGE_TRAIL_SPELL_COLOR = '#2b5fae';
export const REALM_ATTRIBUTE_GROWTH_RATE = 0.2;
export const REALM_COMBAT_LINEAR_GROWTH_RATE = 0.1;
export const REALM_DAMAGE_ADVANTAGE_RATE = 0.2;
export const REALM_DAMAGE_DISADVANTAGE_RATE = 0.2;

export const ELEMENT_DAMAGE_TRAIL_COLORS: Record<ElementKey, string> = {
  metal: '#f9a825',
  wood: '#7cb342',
  water: '#039be5',
  fire: '#e53935',
  earth: '#8d6e63',
};

export function getDamageTrailColor(damageKind: SkillDamageKind, element?: ElementKey): string {
  if (damageKind === 'physical') {
    return DAMAGE_TRAIL_PHYSICAL_COLOR;
  }
  return element ? ELEMENT_DAMAGE_TRAIL_COLORS[element] : DAMAGE_TRAIL_SPELL_COLOR;
}

export function getRealmAttributeMultiplier(realmLv: number): number {
  const normalizedRealmLv = Math.max(1, Math.floor(realmLv));
  return Math.pow(1 + REALM_ATTRIBUTE_GROWTH_RATE, normalizedRealmLv - 1);
}

export function getRealmLinearGrowthMultiplier(realmLv: number): number {
  const normalizedRealmLv = Math.max(1, Math.floor(realmLv));
  return 1 + REALM_COMBAT_LINEAR_GROWTH_RATE * (normalizedRealmLv - 1);
}

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
