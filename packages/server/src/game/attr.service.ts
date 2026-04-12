/**
 * 属性计算服务：六维属性合并、数值面板计算、境界缩放
 */
import { Injectable } from '@nestjs/common';
import {
  ATTR_TO_PERCENT_NUMERIC_WEIGHTS,
  ATTR_TO_NUMERIC_WEIGHTS,
  ATTR_KEYS,
  Attributes,
  AttrBonus,
  BuffModifierMode,
  AttrKey,
  DEFAULT_PLAYER_REALM_STAGE,
  ELEMENT_KEYS,
  getBuffRealmEffectivenessMultiplier,
  getRealmAttributeMultiplier,
  getRealmLinearGrowthMultiplier,
  NUMERIC_SCALAR_STAT_KEYS,
  NumericScalarStatKey,
  NumericStatBreakdownMap,
  PlayerState,
  PLAYER_REALM_NUMERIC_TEMPLATES,
  PlayerRealmStage,
  PartialNumericStats,
  TemporaryBuffState,
  VIEW_RADIUS,
  addPartialNumericStats,
  applyNumericStatsPercentMultiplier,
  cloneNumericRatioDivisors,
  createNumericStats,
  NumericRatioDivisors,
  NumericStats,
  percentModifierToMultiplier,
  resetNumericStats,
} from '@mud/shared';
import {
  REALM_EXPONENTIAL_NUMERIC_KEYS,
  REALM_LINEAR_NUMERIC_GROWTH_RATES,
  REALM_LINEAR_NUMERIC_KEYS,
} from '../constants/gameplay/attr';
import { SOUL_DEVOUR_EROSION_BUFF_ID } from '../constants/gameplay/equipment';
import { getSoulDevourErosionRatio } from './buff-presentation';
import { QiProjectionService } from './qi-projection.service';

const SOUL_DEVOUR_EROSION_ATTR_KEYS: readonly AttrKey[] = ['constitution', 'spirit', 'perception', 'talent'];
const REALM_EXPONENTIAL_NUMERIC_KEY_SET = new Set<NumericScalarStatKey>(REALM_EXPONENTIAL_NUMERIC_KEYS);
const REALM_LINEAR_NUMERIC_KEY_SET = new Set<NumericScalarStatKey>(REALM_LINEAR_NUMERIC_KEYS);
const SIGNED_NUMERIC_STAT_KEYS = new Set<NumericScalarStatKey>([
  'moveSpeed',
  'cooldownSpeed',
  'auraCostReduce',
  'auraPowerRate',
  'playerExpRate',
  'techniqueExpRate',
  'lootRate',
  'rareLootRate',
  'extraAggroRate',
]);

/** getRealmLinearGrowthRate：执行对应的业务逻辑。 */
function getRealmLinearGrowthRate(key: NumericScalarStatKey): number | null {
  switch (key) {
    case 'critDamage':
    case 'maxQiOutputPerTick':
    case 'realmExpPerTick':
    case 'techniqueExpPerTick':
      return 0.1;
    case 'qiRegenRate':
    case 'hpRegenRate':
      return 0.02;
    default:
      return null;
  }
}

/** createAttributeSnapshot：执行对应的业务逻辑。 */
function createAttributeSnapshot(initial = 0): Attributes {
  return {
    constitution: initial,
    spirit: initial,
    perception: initial,
    talent: initial,
    comprehension: initial,
    luck: initial,
  };
}

/** accumulateScaledAttributes：执行对应的业务逻辑。 */
function accumulateScaledAttributes(target: Partial<Attributes>, attrs: Partial<Attributes> | undefined, factor: number): void {
  if (!attrs || factor === 0) return;
  for (const key of ATTR_KEYS) {
    const value = attrs[key];
    if (value === undefined || value === 0) continue;
    target[key] = (target[key] ?? 0) + value * factor;
  }
}

/** scaleNumericStats：执行对应的业务逻辑。 */
function scaleNumericStats(stats: PartialNumericStats | undefined, factor: number): PartialNumericStats | undefined {
  if (!stats || factor === 0) return undefined;
  const result: PartialNumericStats = {};
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const value = stats[key];
    if (value === undefined) continue;
    result[key] = value * factor;
  }
  if (stats.elementDamageBonus) {
    const group: PartialNumericStats['elementDamageBonus'] = {};
    for (const key of ELEMENT_KEYS) {
      const value = stats.elementDamageBonus[key];
      if (value === undefined) continue;
      group[key] = value * factor;
    }
    if (Object.keys(group).length > 0) {
      result.elementDamageBonus = group;
    }
  }
  if (stats.elementDamageReduce) {
    const group: PartialNumericStats['elementDamageReduce'] = {};
    for (const key of ELEMENT_KEYS) {
      const value = stats.elementDamageReduce[key];
      if (value === undefined) continue;
      group[key] = value * factor;
    }
    if (Object.keys(group).length > 0) {
      result.elementDamageReduce = group;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** applyAttributeAdditions：执行对应的业务逻辑。 */
function applyAttributeAdditions(target: Attributes, patch: Partial<Attributes>): void {
  for (const key of ATTR_KEYS) {
    const value = patch[key];
    if (value === undefined || value === 0) continue;
    target[key] += value;
  }
}

/** applyAttributePercentMultipliers：执行对应的业务逻辑。 */
function applyAttributePercentMultipliers(target: Attributes, multipliers: Partial<Attributes>): void {
  for (const key of ATTR_KEYS) {
    const percent = multipliers[key];
    if (!percent) continue;
    target[key] = Math.max(0, target[key] * percentModifierToMultiplier(percent));
  }
}

/** getNumericStatValue：执行对应的业务逻辑。 */
function getNumericStatValue(stats: PartialNumericStats | NumericStats | undefined, key: NumericScalarStatKey): number {
  const value = stats?.[key];
  return typeof value === 'number' ? value : 0;
}

/** sumBuffStacks：执行对应的业务逻辑。 */
function sumBuffStacks(buffs: readonly TemporaryBuffState[], buffId: string): number {
  return buffs.reduce((total, buff) => (
    buff.buffId === buffId && buff.remainingTicks > 0 && buff.stacks > 0
      ? total + buff.stacks
      : total
  ), 0);
}

@Injectable()
/** AttrService：封装相关状态与行为。 */
export class AttrService {
  constructor(
    private readonly qiProjectionService: QiProjectionService,
  ) {}

  /** 合并基础属性与所有加成，得到最终属性 */
  computeFinal(
    base: Attributes,
    bonuses: AttrBonus[],
    target?: Attributes,
    activeBuffs: readonly TemporaryBuffState[] = [],
    realmLv = 1,
  ): Attributes {
    const result = target ?? createAttributeSnapshot();
    result.constitution = base.constitution;
    result.spirit = base.spirit;
    result.perception = base.perception;
    result.talent = base.talent;
    result.comprehension = base.comprehension;
    result.luck = base.luck;

    const bonusAttrMultipliers: Partial<Attributes> = {};
    for (const bonus of bonuses) {
      if (this.resolveBonusModifierMode(bonus.attrMode) === 'percent') {
        accumulateScaledAttributes(bonusAttrMultipliers, bonus.attrs, 1);
        continue;
      }
      applyAttributeAdditions(result, bonus.attrs);
    }

    const buffAttrMultipliers: Partial<Attributes> = {};
    const pillAttrMultipliers: Partial<Attributes> = {};
    const flatBuffAttrs: Partial<Attributes> = {};
    for (const buff of activeBuffs) {
      const effectFactor = this.getBuffEffectFactor(buff, realmLv);
      if (effectFactor === 0 || !buff.attrs) {
        continue;
      }
      if (this.resolveBuffModifierMode(buff.attrMode) === 'flat') {
        accumulateScaledAttributes(flatBuffAttrs, buff.attrs, effectFactor);
        continue;
      }
      const bucket = this.isPillBuff(buff) ? pillAttrMultipliers : buffAttrMultipliers;
      accumulateScaledAttributes(bucket, buff.attrs, effectFactor);
    }

    applyAttributePercentMultipliers(result, bonusAttrMultipliers);
    applyAttributeAdditions(result, flatBuffAttrs);
    applyAttributePercentMultipliers(result, buffAttrMultipliers);
    applyAttributePercentMultipliers(result, pillAttrMultipliers);

    this.applyDynamicTemporaryBuffAttrModifiers(result, activeBuffs);

    result.constitution = Math.max(0, result.constitution);
    result.spirit = Math.max(0, result.spirit);
    result.perception = Math.max(0, result.perception);
    result.talent = Math.max(0, result.talent);
    result.comprehension = Math.max(0, result.comprehension);
    result.luck = Math.max(0, result.luck);

    return result;
  }

  /** 获取玩家最终六维属性（带缓存） */
  getPlayerFinalAttrs(player: PlayerState): Attributes {
    if (!player.finalAttrs) {
      this.recalcPlayer(player);
    }
    return player.finalAttrs!;
  }

  /** 获取玩家数值面板（带缓存） */
  getPlayerNumericStats(player: PlayerState): NumericStats {
    if (!player.numericStats) {
      this.recalcPlayer(player);
    }
    return player.numericStats!;
  }

  /** 获取玩家比率除数（用于命中/闪避/暴击等百分比换算） */
  getPlayerRatioDivisors(player: PlayerState): NumericRatioDivisors {
    if (!player.ratioDivisors) {
      this.recalcPlayer(player);
    }
    return player.ratioDivisors!;
  }

  /** 获取玩家具体属性乘区拆解（带缓存） */
  getPlayerNumericStatBreakdowns(player: PlayerState): NumericStatBreakdownMap {
    if (!player.numericStatBreakdowns) {
      this.recalcPlayer(player);
    }
    return player.numericStatBreakdowns!;
  }

  /** 重算玩家六维缓存、具体属性缓存，并同步 HP/QI 上限等运行时字段 */
  recalcPlayer(player: PlayerState): void {
    const previousMaxQi = Math.max(0, Math.round(player.numericStats?.maxQi ?? player.qi ?? 0));
    const activeTemporaryBuffs = this.getActiveTemporaryBuffs(player);
    const effectiveBonuses = this.getEffectiveBonuses(player);
    const realmLv = this.resolvePlayerRealmLv(player);
    const finalAttrs = this.computeFinal(
      player.baseAttrs,
      effectiveBonuses,
      player.finalAttrs ?? createAttributeSnapshot(),
      activeTemporaryBuffs,
      realmLv,
    );
    const stage = player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const numericStatBreakdowns = player.numericStatBreakdowns ?? {};
    const stats = this.computeNumericStats(
      finalAttrs,
      effectiveBonuses,
      stage,
      player.numericStats ?? createNumericStats(),
      realmLv,
      activeTemporaryBuffs,
      numericStatBreakdowns,
    );
    const ratioDivisors = this.getRatioDivisorsForStage(
      stage,
      player.ratioDivisors,
    );

    player.finalAttrs = finalAttrs;
    player.numericStats = stats;
    player.ratioDivisors = ratioDivisors;
    player.numericStatBreakdowns = numericStatBreakdowns;

    const newMaxHp = Math.max(1, Math.round(stats.maxHp));
    if (player.maxHp > 0 && newMaxHp !== player.maxHp) {
      const ratio = player.hp / player.maxHp;
      player.hp = Math.max(1, Math.round(ratio * newMaxHp));
    }
    player.maxHp = newMaxHp;
    const newMaxQi = Math.max(0, Math.round(stats.maxQi));
    if (previousMaxQi > 0 && newMaxQi !== previousMaxQi) {
      const ratio = player.qi / previousMaxQi;
      player.qi = Math.max(0, Math.min(newMaxQi, Math.round(ratio * newMaxQi)));
    } else if (previousMaxQi <= 0 && player.qi <= 0) {
      player.qi = newMaxQi;
    } else if (!Number.isFinite(player.qi)) {
      player.qi = newMaxQi;
    } else {
      player.qi = Math.max(0, Math.min(newMaxQi, Math.round(player.qi)));
    }
    player.viewRange = Math.max(1, Math.round(stats.viewRange || VIEW_RADIUS));
    this.qiProjectionService.recalcPlayer(player);
  }

  private getActiveTemporaryBuffs(player: PlayerState): TemporaryBuffState[] {
    return (player.temporaryBuffs ?? []).filter((buff) => buff.remainingTicks > 0 && buff.stacks > 0);
  }

  /** 收集生效的静态加成列表；临时 Buff 走专门的乘区与衰减结算 */
  private getEffectiveBonuses(player: PlayerState): AttrBonus[] {
    return player.bonuses;
  }

  private applyDynamicTemporaryBuffAttrModifiers(target: Attributes, activeBuffs: readonly TemporaryBuffState[]): void {
    const soulDevourStacks = sumBuffStacks(activeBuffs, SOUL_DEVOUR_EROSION_BUFF_ID);
    if (soulDevourStacks <= 0) {
      return;
    }
    const multiplier = 1 - getSoulDevourErosionRatio(soulDevourStacks);
    for (const key of SOUL_DEVOUR_EROSION_ATTR_KEYS) {
      target[key] *= multiplier;
    }
  }

  /** 获取当前境界阶段对应的比率除数 */
  private getRatioDivisorsForStage(stage: PlayerRealmStage, previous?: NumericRatioDivisors): NumericRatioDivisors {
    const template = PLAYER_REALM_NUMERIC_TEMPLATES[stage] ?? PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE];
    const snapshot = cloneNumericRatioDivisors(template.ratioDivisors);
    if (!previous) {
      return snapshot;
    }
    previous.dodge = snapshot.dodge;
    previous.crit = snapshot.crit;
    previous.breakPower = snapshot.breakPower;
    previous.resolvePower = snapshot.resolvePower;
    previous.cooldownSpeed = snapshot.cooldownSpeed;
    previous.moveSpeed = snapshot.moveSpeed;
    previous.elementDamageReduce.metal = snapshot.elementDamageReduce.metal;
    previous.elementDamageReduce.wood = snapshot.elementDamageReduce.wood;
    previous.elementDamageReduce.water = snapshot.elementDamageReduce.water;
    previous.elementDamageReduce.fire = snapshot.elementDamageReduce.fire;
    previous.elementDamageReduce.earth = snapshot.elementDamageReduce.earth;
    return previous;
  }

  /** 从六维属性和加成计算完整数值面板 */
  private computeNumericStats(
    finalAttrs: Attributes,
    bonuses: AttrBonus[],
    stage: PlayerRealmStage,
    target: NumericStats,
    realmLv: number,
    activeBuffs: readonly TemporaryBuffState[],
    breakdownsTarget?: NumericStatBreakdownMap,
  ): NumericStats {
    const template = PLAYER_REALM_NUMERIC_TEMPLATES[stage] ?? PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE];
    const attrMultipliers = createNumericStats();
    const buffMultipliers = createNumericStats();
    const pillMultipliers = createNumericStats();
    const staticBaseStats = createNumericStats();
    const flatBuffStats = createNumericStats();
    resetNumericStats(target);
    addPartialNumericStats(target, template.stats);
    addPartialNumericStats(staticBaseStats, template.stats);

    for (const bonus of bonuses) {
      if (this.resolveBonusModifierMode(bonus.statMode) === 'percent') {
        addPartialNumericStats(buffMultipliers, bonus.stats);
        continue;
      }
      addPartialNumericStats(target, bonus.stats);
      addPartialNumericStats(staticBaseStats, bonus.stats);
    }

    for (const key of ATTR_KEYS) {
      const value = finalAttrs[key];
      if (value === 0) continue;
      this.applyAttrWeight(target, key, value);
      this.applyAttrWeight(staticBaseStats, key, value);
      this.accumulateAttrPercentBonus(attrMultipliers, key, value);
    }

    for (const buff of activeBuffs) {
      const effectFactor = this.getBuffEffectFactor(buff, realmLv);
      if (effectFactor === 0 || !buff.stats) {
        continue;
      }
      const scaled = scaleNumericStats(buff.stats, effectFactor);
      if (!scaled) {
        continue;
      }
      if (this.resolveBuffModifierMode(buff.statMode) === 'flat') {
        addPartialNumericStats(target, scaled);
        addPartialNumericStats(flatBuffStats, scaled);
        continue;
      }
      addPartialNumericStats(this.isPillBuff(buff) ? pillMultipliers : buffMultipliers, scaled);
    }

    applyNumericStatsPercentMultiplier(target, attrMultipliers);
    this.applyRealmNumericScaling(target, realmLv);
    applyNumericStatsPercentMultiplier(target, buffMultipliers);
    applyNumericStatsPercentMultiplier(target, pillMultipliers);
    this.roundNumericStats(target);
    this.fillNumericStatBreakdowns(
      breakdownsTarget,
      template.stats,
      staticBaseStats,
      flatBuffStats,
      attrMultipliers,
      realmLv,
      buffMultipliers,
      pillMultipliers,
      target,
    );

    return target;
  }

  private applyAttrWeight(target: NumericStats, key: AttrKey, value: number): void {
    const weight = ATTR_TO_NUMERIC_WEIGHTS[key];
    if (!weight) return;

    if (weight.maxHp !== undefined) target.maxHp += weight.maxHp * value;
    if (weight.maxQi !== undefined) target.maxQi += weight.maxQi * value;
    if (weight.physAtk !== undefined) target.physAtk += weight.physAtk * value;
    if (weight.spellAtk !== undefined) target.spellAtk += weight.spellAtk * value;
    if (weight.physDef !== undefined) target.physDef += weight.physDef * value;
    if (weight.spellDef !== undefined) target.spellDef += weight.spellDef * value;
    if (weight.hit !== undefined) target.hit += weight.hit * value;
    if (weight.dodge !== undefined) target.dodge += weight.dodge * value;
    if (weight.crit !== undefined) target.crit += weight.crit * value;
    if (weight.antiCrit !== undefined) target.antiCrit += weight.antiCrit * value;
    if (weight.critDamage !== undefined) target.critDamage += weight.critDamage * value;
    if (weight.breakPower !== undefined) target.breakPower += weight.breakPower * value;
    if (weight.resolvePower !== undefined) target.resolvePower += weight.resolvePower * value;
    if (weight.maxQiOutputPerTick !== undefined) target.maxQiOutputPerTick += weight.maxQiOutputPerTick * value;
    if (weight.qiRegenRate !== undefined) target.qiRegenRate += weight.qiRegenRate * value;
    if (weight.hpRegenRate !== undefined) target.hpRegenRate += weight.hpRegenRate * value;
    if (weight.cooldownSpeed !== undefined) target.cooldownSpeed += weight.cooldownSpeed * value;
    if (weight.auraPowerRate !== undefined) target.auraPowerRate += weight.auraPowerRate * value;
    if (weight.playerExpRate !== undefined) target.playerExpRate += weight.playerExpRate * value;
    if (weight.techniqueExpRate !== undefined) target.techniqueExpRate += weight.techniqueExpRate * value;
    if (weight.lootRate !== undefined) target.lootRate += weight.lootRate * value;
    if (weight.rareLootRate !== undefined) target.rareLootRate += weight.rareLootRate * value;
    if (weight.moveSpeed !== undefined) target.moveSpeed += weight.moveSpeed * value;
  }

  private accumulateAttrPercentBonus(target: NumericStats, key: AttrKey, value: number): void {
    const weight = ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key];
    if (!weight) return;
    addPartialNumericStats(target, scaleNumericStats(weight, value));
  }

  private resolvePlayerRealmLv(player: PlayerState): number {
    return Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
  }

  /** 按境界等级对数值面板进行指数/线性缩放 */
  private applyRealmNumericScaling(target: NumericStats, realmLv: number): void {
    const exponentialMultiplier = getRealmAttributeMultiplier(realmLv);
    if (exponentialMultiplier !== 1) {
      for (const key of REALM_EXPONENTIAL_NUMERIC_KEYS) {
        target[key] = Math.max(0, Math.round(target[key] * exponentialMultiplier));
      }
    }

    for (const key of REALM_LINEAR_NUMERIC_KEYS) {
      const linearMultiplier = getRealmLinearGrowthMultiplier(realmLv, REALM_LINEAR_NUMERIC_GROWTH_RATES[key]);
      if (linearMultiplier === 1) {
        continue;
      }
      target[key] = Math.max(0, Math.round(target[key] * linearMultiplier));
    }
  }

  private fillNumericStatBreakdowns(
    target: NumericStatBreakdownMap | undefined,
    realmBaseStats: NumericStats,
    staticBaseStats: NumericStats,
    flatBuffStats: NumericStats,
    attrMultipliers: NumericStats,
    realmLv: number,
    buffMultipliers: NumericStats,
    pillMultipliers: NumericStats,
    finalStats: NumericStats,
  ): void {
    if (!target) {
      return;
    }
    for (const key of Object.keys(target) as NumericScalarStatKey[]) {
      delete target[key];
    }
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
      const realmBaseValue = getNumericStatValue(realmBaseStats, key);
      const baseValue = getNumericStatValue(staticBaseStats, key);
      const flatBuffValue = getNumericStatValue(flatBuffStats, key);
      const preMultiplierValue = baseValue + flatBuffValue;
      target[key] = {
        realmBaseValue,
        bonusBaseValue: baseValue - realmBaseValue,
        baseValue,
        flatBuffValue,
        preMultiplierValue,
        attrMultiplierPct: getNumericStatValue(attrMultipliers, key),
        realmMultiplier: this.getRealmNumericMultiplier(key, realmLv),
        buffMultiplierPct: getNumericStatValue(buffMultipliers, key),
        pillMultiplierPct: getNumericStatValue(pillMultipliers, key),
        finalValue: getNumericStatValue(finalStats, key),
      };
    }
  }

  private getRealmNumericMultiplier(key: NumericScalarStatKey, realmLv: number): number {
    if (REALM_EXPONENTIAL_NUMERIC_KEY_SET.has(key)) {
      return getRealmAttributeMultiplier(realmLv);
    }
    if (REALM_LINEAR_NUMERIC_KEY_SET.has(key)) {
      const linearGrowthRate = getRealmLinearGrowthRate(key);
      return linearGrowthRate === null ? 1 : getRealmLinearGrowthMultiplier(realmLv, linearGrowthRate);
    }
    return 1;
  }

  private roundNumericStats(target: NumericStats): void {
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
      const rounded = Math.round(target[key]);
      target[key] = SIGNED_NUMERIC_STAT_KEYS.has(key)
        ? rounded
        : Math.max(0, rounded);
    }
    for (const key of ELEMENT_KEYS) {
      target.elementDamageBonus[key] = Math.round(target.elementDamageBonus[key]);
      target.elementDamageReduce[key] = Math.max(0, Math.round(target.elementDamageReduce[key]));
    }
  }

  private resolveBuffModifierMode(mode: BuffModifierMode | undefined): BuffModifierMode {
    return mode === 'flat' ? 'flat' : 'percent';
  }

  private resolveBonusModifierMode(mode: BuffModifierMode | undefined): BuffModifierMode {
    return mode === 'percent' ? 'percent' : 'flat';
  }

  private isPillBuff(buff: TemporaryBuffState): boolean {
    return buff.sourceSkillId.startsWith('item:');
  }

  private getBuffEffectFactor(buff: TemporaryBuffState, targetRealmLv: number): number {
    if (buff.remainingTicks <= 0 || buff.stacks <= 0) {
      return 0;
    }
    const stackFactor = Math.max(1, buff.stacks);
    const realmFactor = getBuffRealmEffectivenessMultiplier(buff.realmLv, targetRealmLv);
    return stackFactor * realmFactor;
  }
}
