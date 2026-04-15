import {
  addPartialNumericStats,
  applyNumericStatsPercentMultiplier,
  Attributes,
  BuffModifierMode,
  createNumericStats,
  getBuffRealmEffectivenessMultiplier,
  NumericStats,
  PartialNumericStats,
  TemporaryBuffState,
} from '@mud/shared';
import {
  applyAttributeAdditions,
  applyAttributePercentMultipliers,
  createMonsterAttributeSnapshot,
  MONSTER_ATTR_KEYS,
} from './world.service.shared';

export interface MonsterAttributeBonuses {
  flatAttrs: Attributes;
  percentAttrs: Attributes;
}

export function scaleMonsterAttributes(
  attrs: Partial<Attributes> | undefined,
  factor: number,
): Partial<Attributes> | undefined {
  if (!attrs || factor === 0) {
    return undefined;
  }
  const result: Partial<Attributes> = {};
  for (const key of MONSTER_ATTR_KEYS) {
    const value = attrs[key];
    if (value === undefined || value === 0) {
      continue;
    }
    result[key] = value * factor;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function hasMonsterAttributeModifiers(attrs: Pick<Attributes, keyof Attributes>): boolean {
  return MONSTER_ATTR_KEYS.some((key) => attrs[key] !== 0);
}

export function collectMonsterBuffAttrBonuses(
  buffs: TemporaryBuffState[] | undefined,
  targetRealmLv: number,
  resolveBuffModifierMode: (mode: BuffModifierMode | undefined) => BuffModifierMode,
): MonsterAttributeBonuses {
  const flatAttrs = createMonsterAttributeSnapshot();
  const percentAttrs = createMonsterAttributeSnapshot();
  for (const buff of buffs ?? []) {
    if (buff.remainingTicks <= 0 || buff.stacks <= 0 || !buff.attrs) {
      continue;
    }
    const effectFactor = Math.max(1, buff.stacks) * getBuffRealmEffectivenessMultiplier(buff.realmLv, targetRealmLv);
    const scaled = scaleMonsterAttributes(buff.attrs, effectFactor);
    if (!scaled) {
      continue;
    }
    const bucket = resolveBuffModifierMode(buff.attrMode) === 'flat' ? flatAttrs : percentAttrs;
    applyAttributeAdditions(bucket, scaled);
  }
  return { flatAttrs, percentAttrs };
}

export function getMonsterFinalAttrs(
  monsterAttrs: Attributes,
  passiveBonuses: MonsterAttributeBonuses,
  buffBonuses: MonsterAttributeBonuses,
): Attributes {
  const attrs = createMonsterAttributeSnapshot();
  applyAttributeAdditions(attrs, monsterAttrs);
  applyAttributeAdditions(attrs, passiveBonuses.flatAttrs);
  applyAttributePercentMultipliers(attrs, passiveBonuses.percentAttrs);
  applyAttributeAdditions(attrs, buffBonuses.flatAttrs);
  applyAttributePercentMultipliers(attrs, buffBonuses.percentAttrs);
  for (const key of MONSTER_ATTR_KEYS) {
    attrs[key] = Math.max(0, attrs[key]);
  }
  return attrs;
}

export function applyMonsterBuffStats(
  stats: NumericStats,
  buffs: TemporaryBuffState[] | undefined,
  targetRealmLv: number,
  resolveBuffModifierMode: (mode: BuffModifierMode | undefined) => BuffModifierMode,
  scaleNumericStats: (stats: PartialNumericStats | undefined, factor: number) => PartialNumericStats | undefined,
): void {
  if (!buffs || buffs.length === 0) {
    return;
  }
  const percentBuffs = createNumericStats();
  for (const buff of buffs) {
    if (buff.remainingTicks <= 0 || buff.stacks <= 0 || !buff.stats) {
      continue;
    }
    const effectFactor = Math.max(1, buff.stacks) * getBuffRealmEffectivenessMultiplier(buff.realmLv, targetRealmLv);
    const scaled = scaleNumericStats(buff.stats, effectFactor);
    if (!scaled) {
      continue;
    }
    if (resolveBuffModifierMode(buff.statMode) === 'flat') {
      addPartialNumericStats(stats, scaled);
      continue;
    }
    addPartialNumericStats(percentBuffs, scaled);
  }
  applyNumericStatsPercentMultiplier(stats, percentBuffs);
}

