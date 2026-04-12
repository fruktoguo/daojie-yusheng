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

/** MonsterAttributeBonuses：定义该接口的能力与字段约束。 */
export interface MonsterAttributeBonuses {
/** flatAttrs：定义该变量以承载业务值。 */
  flatAttrs: Attributes;
/** percentAttrs：定义该变量以承载业务值。 */
  percentAttrs: Attributes;
}

/** scaleMonsterAttributes：执行对应的业务逻辑。 */
export function scaleMonsterAttributes(
  attrs: Partial<Attributes> | undefined,
  factor: number,
): Partial<Attributes> | undefined {
  if (!attrs || factor === 0) {
    return undefined;
  }
/** result：定义该变量以承载业务值。 */
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

/** hasMonsterAttributeModifiers：执行对应的业务逻辑。 */
export function hasMonsterAttributeModifiers(attrs: Pick<Attributes, keyof Attributes>): boolean {
  return MONSTER_ATTR_KEYS.some((key) => attrs[key] !== 0);
}

/** collectMonsterBuffAttrBonuses：执行对应的业务逻辑。 */
export function collectMonsterBuffAttrBonuses(
  buffs: TemporaryBuffState[] | undefined,
  targetRealmLv: number,
  resolveBuffModifierMode: (mode: BuffModifierMode | undefined) => BuffModifierMode,
): MonsterAttributeBonuses {
/** flatAttrs：定义该变量以承载业务值。 */
  const flatAttrs = createMonsterAttributeSnapshot();
/** percentAttrs：定义该变量以承载业务值。 */
  const percentAttrs = createMonsterAttributeSnapshot();
  for (const buff of buffs ?? []) {
    if (buff.remainingTicks <= 0 || buff.stacks <= 0 || !buff.attrs) {
      continue;
    }
/** effectFactor：定义该变量以承载业务值。 */
    const effectFactor = Math.max(1, buff.stacks) * getBuffRealmEffectivenessMultiplier(buff.realmLv, targetRealmLv);
/** scaled：定义该变量以承载业务值。 */
    const scaled = scaleMonsterAttributes(buff.attrs, effectFactor);
    if (!scaled) {
      continue;
    }
/** bucket：定义该变量以承载业务值。 */
    const bucket = resolveBuffModifierMode(buff.attrMode) === 'flat' ? flatAttrs : percentAttrs;
    applyAttributeAdditions(bucket, scaled);
  }
  return { flatAttrs, percentAttrs };
}

/** getMonsterFinalAttrs：执行对应的业务逻辑。 */
export function getMonsterFinalAttrs(
  monsterAttrs: Attributes,
  passiveBonuses: MonsterAttributeBonuses,
  buffBonuses: MonsterAttributeBonuses,
): Attributes {
/** attrs：定义该变量以承载业务值。 */
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

/** applyMonsterBuffStats：执行对应的业务逻辑。 */
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
/** percentBuffs：定义该变量以承载业务值。 */
  const percentBuffs = createNumericStats();
  for (const buff of buffs) {
    if (buff.remainingTicks <= 0 || buff.stacks <= 0 || !buff.stats) {
      continue;
    }
/** effectFactor：定义该变量以承载业务值。 */
    const effectFactor = Math.max(1, buff.stacks) * getBuffRealmEffectivenessMultiplier(buff.realmLv, targetRealmLv);
/** scaled：定义该变量以承载业务值。 */
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

