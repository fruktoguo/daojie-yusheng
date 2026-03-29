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
  AttrKey,
  DEFAULT_PLAYER_REALM_STAGE,
  ELEMENT_KEYS,
  getRealmAttributeMultiplier,
  getRealmLinearGrowthMultiplier,
  NUMERIC_SCALAR_STAT_KEYS,
  PlayerState,
  PLAYER_REALM_NUMERIC_TEMPLATES,
  PlayerRealmStage,
  PartialNumericStats,
  TemporaryBuffState,
  VIEW_RADIUS,
  addPartialNumericStats,
  cloneNumericRatioDivisors,
  createNumericStats,
  NumericRatioDivisors,
  NumericStats,
  resetNumericStats,
} from '@mud/shared';
import { REALM_EXPONENTIAL_NUMERIC_KEYS, REALM_LINEAR_NUMERIC_KEYS } from '../constants/gameplay/attr';
import { SOUL_DEVOUR_EROSION_BUFF_ID } from '../constants/gameplay/equipment';
import { getSoulDevourErosionRatio } from './buff-presentation';
import { QiProjectionService } from './qi-projection.service';

type PercentBonusAccumulator = Pick<NumericStats, 'maxHp' | 'maxQi' | 'physAtk' | 'spellAtk'>;
const SOUL_DEVOUR_EROSION_ATTR_KEYS: readonly AttrKey[] = ['constitution', 'spirit', 'perception', 'talent'];

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

function scaleBuffAttributes(attrs: Partial<Attributes> | undefined, stacks: number): Partial<Attributes> | undefined {
  if (!attrs || stacks <= 0) return undefined;
  const result: Partial<Attributes> = {};
  for (const key of ATTR_KEYS) {
    const value = attrs[key];
    if (value === undefined) continue;
    result[key] = value * stacks;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function scaleBuffStats(stats: PartialNumericStats | undefined, stacks: number): PartialNumericStats | undefined {
  if (!stats || stacks <= 0) return undefined;
  const result: PartialNumericStats = {};
  for (const key of NUMERIC_SCALAR_STAT_KEYS) {
    const value = stats[key];
    if (value === undefined) continue;
    result[key] = value * stacks;
  }
  if (stats.elementDamageBonus) {
    const group: PartialNumericStats['elementDamageBonus'] = {};
    for (const key of ELEMENT_KEYS) {
      const value = stats.elementDamageBonus[key];
      if (value === undefined) continue;
      group[key] = value * stacks;
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
      group[key] = value * stacks;
    }
    if (Object.keys(group).length > 0) {
      result.elementDamageReduce = group;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sumBuffStacks(buffs: readonly TemporaryBuffState[], buffId: string): number {
  return buffs.reduce((total, buff) => (
    buff.buffId === buffId && buff.remainingTicks > 0 && buff.stacks > 0
      ? total + buff.stacks
      : total
  ), 0);
}

@Injectable()
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
  ): Attributes {
    const result = target ?? createAttributeSnapshot();
    result.constitution = base.constitution;
    result.spirit = base.spirit;
    result.perception = base.perception;
    result.talent = base.talent;
    result.comprehension = base.comprehension;
    result.luck = base.luck;

    for (const bonus of bonuses) {
      const attrs = bonus.attrs;
      if (attrs.constitution !== undefined) result.constitution += attrs.constitution;
      if (attrs.spirit !== undefined) result.spirit += attrs.spirit;
      if (attrs.perception !== undefined) result.perception += attrs.perception;
      if (attrs.talent !== undefined) result.talent += attrs.talent;
      if (attrs.comprehension !== undefined) result.comprehension += attrs.comprehension;
      if (attrs.luck !== undefined) result.luck += attrs.luck;
    }

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

  /** 重算玩家六维缓存、具体属性缓存，并同步 HP/QI 上限等运行时字段 */
  recalcPlayer(player: PlayerState): void {
    const previousMaxQi = Math.max(0, Math.round(player.numericStats?.maxQi ?? player.qi ?? 0));
    const activeTemporaryBuffs = this.getActiveTemporaryBuffs(player);
    const effectiveBonuses = this.getEffectiveBonuses(player, activeTemporaryBuffs);
    const realmLv = this.resolvePlayerRealmLv(player);
    const finalAttrs = this.computeFinal(
      player.baseAttrs,
      effectiveBonuses,
      player.finalAttrs ?? createAttributeSnapshot(),
      activeTemporaryBuffs,
    );
    const stage = player.realm?.stage ?? DEFAULT_PLAYER_REALM_STAGE;
    const stats = this.computeNumericStats(
      finalAttrs,
      effectiveBonuses,
      stage,
      player.numericStats ?? createNumericStats(),
    );
    this.applyRealmNumericScaling(stats, realmLv);
    const ratioDivisors = this.getRatioDivisorsForStage(
      stage,
      player.ratioDivisors,
    );

    player.finalAttrs = finalAttrs;
    player.numericStats = stats;
    player.ratioDivisors = ratioDivisors;

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

  /** 收集生效的加成列表（含临时 Buff） */
  private getEffectiveBonuses(player: PlayerState, activeTemporaryBuffs: readonly TemporaryBuffState[]): AttrBonus[] {
    const temporaryBonuses = activeTemporaryBuffs.map((buff) => this.buildTemporaryBuffBonus(buff));
    if (temporaryBonuses.length === 0) {
      return player.bonuses;
    }
    return [...player.bonuses, ...temporaryBonuses];
  }

  /** 将临时 Buff 转换为 AttrBonus（按层数缩放） */
  private buildTemporaryBuffBonus(buff: TemporaryBuffState): AttrBonus {
    return {
      source: `temp-buff:${buff.buffId}`,
      label: buff.name,
      attrs: scaleBuffAttributes(buff.attrs, buff.stacks) ?? {},
      stats: scaleBuffStats(buff.stats, buff.stacks),
      meta: {
        sourceSkillId: buff.sourceSkillId,
        remainingTicks: buff.remainingTicks,
        stacks: buff.stacks,
      },
    };
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
  ): NumericStats {
    const template = PLAYER_REALM_NUMERIC_TEMPLATES[stage] ?? PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE];
    const percentBonuses: PercentBonusAccumulator = {
      maxHp: 0,
      maxQi: 0,
      physAtk: 0,
      spellAtk: 0,
    };
    resetNumericStats(target);
    addPartialNumericStats(target, template.stats);

    for (const key of ATTR_KEYS) {
      const value = finalAttrs[key];
      if (value === 0) continue;
      this.applyAttrWeight(target, key, value);
      this.accumulateAttrPercentBonus(percentBonuses, key, value);
    }

    for (const bonus of bonuses) {
      addPartialNumericStats(target, bonus.stats);
    }

    this.applyPercentBonuses(target, percentBonuses);

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

  private accumulateAttrPercentBonus(target: PercentBonusAccumulator, key: AttrKey, value: number): void {
    const weight = ATTR_TO_PERCENT_NUMERIC_WEIGHTS[key];
    if (!weight) return;

    if (weight.maxHp !== undefined) target.maxHp += weight.maxHp * value;
    if (weight.maxQi !== undefined) target.maxQi += weight.maxQi * value;
    if (weight.physAtk !== undefined) target.physAtk += weight.physAtk * value;
    if (weight.spellAtk !== undefined) target.spellAtk += weight.spellAtk * value;
  }

  private applyPercentBonuses(target: NumericStats, bonuses: PercentBonusAccumulator): void {
    if (bonuses.maxHp !== 0) target.maxHp *= 1 + bonuses.maxHp / 100;
    if (bonuses.maxQi !== 0) target.maxQi *= 1 + bonuses.maxQi / 100;
    if (bonuses.physAtk !== 0) target.physAtk *= 1 + bonuses.physAtk / 100;
    if (bonuses.spellAtk !== 0) target.spellAtk *= 1 + bonuses.spellAtk / 100;
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

    const linearMultiplier = getRealmLinearGrowthMultiplier(realmLv);
    if (linearMultiplier === 1) {
      return;
    }
    for (const key of REALM_LINEAR_NUMERIC_KEYS) {
      target[key] = Math.max(0, Math.round(target[key] * linearMultiplier));
    }
  }
}
