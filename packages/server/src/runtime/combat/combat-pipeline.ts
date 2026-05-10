/**
 * 战斗结算管线：将伤害结算拆成独立环节，按目标类型组合。
 *
 * 设计约束：
 * - 每个环节是一个纯函数，读写 context 字段
 * - context 由调用方创建，跨环节贯穿，零分配（不返回新对象）
 * - 环节的执行顺序由 compose 层决定，本文件只提供环节实现
 * - 随机源使用 combat-resolution.helpers 中的 cryptoRandom，保证 smoke 可注入
 */

import {
  getRealmGapDamageMultiplier,
  percentModifierToMultiplier,
  ratioValue,
} from '@mud/shared';
import {
  resolveOpposedCombatRate,
  resolveDefenseReductionRate,
  resolveCombatExperienceAdvantage,
  __combatPipelineRandom as cryptoRandom,
} from './combat-resolution.helpers';

export interface CombatResolveContext {
  // 输入（由 createCombatResolveContext 写入）
  attackerStats: Record<string, unknown>;
  attackerRatios: Record<string, unknown>;
  attackerRealmLv: number;
  attackerCombatExp: number;
  targetStats: Record<string, unknown>;
  targetRatios: Record<string, unknown>;
  targetRealmLv: number;
  targetCombatExp: number;
  baseDamage: number;
  damageKind: 'physical' | 'spell';
  element?: string;
  extraMultiplier: number;

  // 各环节写入
  broken: boolean;
  resolved: boolean;
  dodged: boolean;
  crit: boolean;
  hit: boolean;
  damage: number;
  rawDamage: number;
}

export interface CombatResolveInput {
  attackerStats: Record<string, unknown>;
  attackerRatios: Record<string, unknown>;
  attackerRealmLv?: number;
  attackerCombatExp?: number;
  targetStats: Record<string, unknown>;
  targetRatios: Record<string, unknown>;
  targetRealmLv?: number;
  targetCombatExp?: number;
  baseDamage: number;
  damageKind: 'physical' | 'spell';
  element?: string;
  extraMultiplier?: number;
}

export interface CombatResolveOutcome {
  hit: boolean;
  rawDamage: number;
  damage: number;
  crit: boolean;
  dodged: boolean;
  resolved: boolean;
  broken: boolean;
}

export function createCombatResolveContext(input: CombatResolveInput): CombatResolveContext {
  const baseDamage = Math.max(1, Math.round(Number(input.baseDamage) || 0));
  return {
    attackerStats: input.attackerStats,
    attackerRatios: input.attackerRatios,
    attackerRealmLv: Math.max(1, Math.floor(Number(input.attackerRealmLv) || 1)),
    attackerCombatExp: Math.max(0, Math.floor(Number(input.attackerCombatExp) || 0)),
    targetStats: input.targetStats,
    targetRatios: input.targetRatios,
    targetRealmLv: Math.max(1, Math.floor(Number(input.targetRealmLv) || 1)),
    targetCombatExp: Math.max(0, Math.floor(Number(input.targetCombatExp) || 0)),
    baseDamage,
    damageKind: input.damageKind,
    element: input.element,
    extraMultiplier: Math.max(0, Number.isFinite(input.extraMultiplier) ? input.extraMultiplier! : 1),

    broken: false,
    resolved: false,
    dodged: false,
    crit: false,
    hit: true,
    damage: baseDamage,
    rawDamage: baseDamage,
  };
}

/** 破防判定。随机数消费顺序第 1 位。 */
export function resolveBreak(ctx: CombatResolveContext): void {
  const breakPower = (ctx.attackerStats as { breakPower?: number }).breakPower ?? 0;
  const resolvePower = (ctx.targetStats as { resolvePower?: number }).resolvePower ?? 0;
  if (breakPower > resolvePower) {
    const breakChance = resolveOpposedCombatRate(breakPower, resolvePower);
    ctx.broken = breakChance > 0 && cryptoRandom() < breakChance;
  }
}

/** 命中/闪避判定。随机数消费顺序第 2 位。 */
export function resolveHitDodge(ctx: CombatResolveContext): void {
  const combatAdvantage = resolveCombatExperienceAdvantage(ctx.attackerCombatExp, ctx.targetCombatExp);
  const hit = ((ctx.attackerStats as { hit?: number }).hit ?? 0) * (ctx.broken ? 2 : 1) * (1 + combatAdvantage.attackerBonus);
  const dodge = ((ctx.targetStats as { dodge?: number }).dodge ?? 0) * (1 + combatAdvantage.defenderBonus);
  const dodgeChance = resolveOpposedCombatRate(dodge, hit);
  if (dodgeChance > 0 && cryptoRandom() < dodgeChance) {
    ctx.dodged = true;
    ctx.hit = false;
    ctx.damage = 0;
    ctx.rawDamage = 0;
  }
}

/** 化解判定。随机数消费顺序第 3 位。 */
export function resolveResolve(ctx: CombatResolveContext): void {
  const breakPower = (ctx.attackerStats as { breakPower?: number }).breakPower ?? 0;
  const resolvePower = (ctx.targetStats as { resolvePower?: number }).resolvePower ?? 0;
  if (resolvePower > breakPower) {
    const resolveChance = resolveOpposedCombatRate(resolvePower, breakPower);
    ctx.resolved = resolveChance > 0 && cryptoRandom() < resolveChance;
  }
}

/** 暴击判定。随机数消费顺序第 4 位。 */
export function resolveCrit(ctx: CombatResolveContext): void {
  const critStat = ((ctx.attackerStats as { crit?: number }).crit ?? 0) * (ctx.broken ? 2 : 1);
  const antiCrit = (ctx.targetStats as { antiCrit?: number }).antiCrit ?? 0;
  const critChance = resolveOpposedCombatRate(critStat, antiCrit);
  ctx.crit = critChance > 0 && cryptoRandom() < critChance;
}

/** 五行伤害加成（攻击方），同时修改 damage 和 rawDamage。 */
export function resolveElementBonus(ctx: CombatResolveContext): void {
  if (!ctx.element) return;
  const bonusMap = (ctx.attackerStats as { elementDamageBonus?: Record<string, number> }).elementDamageBonus;
  const bonus = percentModifierToMultiplier(bonusMap?.[ctx.element] ?? 0);
  ctx.damage = Math.max(1, Math.round(ctx.damage * bonus));
  ctx.rawDamage = Math.max(1, Math.round(ctx.rawDamage * bonus));
}

/** 防御减伤 + 元素减免（仅作用于 damage，rawDamage 无视防御）。 */
export function resolveDefense(ctx: CombatResolveContext): void {
  const ts = ctx.targetStats as { physDef?: number; spellDef?: number; elementDamageReduce?: Record<string, number> };
  let defense = ctx.damageKind === 'physical' ? (ts.physDef ?? 0) : (ts.spellDef ?? 0);
  if (ctx.resolved) defense *= 2;
  const as = ctx.attackerStats as { physAtk?: number; spellAtk?: number };
  const defenseAttackBasis = ctx.damageKind === 'physical' ? (as.physAtk ?? 0) : (as.spellAtk ?? 0);
  let reduction = resolveDefenseReductionRate(defense, defenseAttackBasis);
  if (ctx.element) {
    const tr = ctx.targetRatios as { elementDamageReduce?: Record<string, number> };
    const elementReduce = Math.max(0, ratioValue(ts.elementDamageReduce?.[ctx.element] ?? 0, tr.elementDamageReduce?.[ctx.element] ?? 1));
    reduction = 1 - (1 - reduction) * (1 - elementReduce);
  }
  ctx.damage = Math.max(1, Math.round(ctx.damage * Math.max(0, 1 - reduction)));
}

/** 暴击乘区，同时放大 damage 和 rawDamage。 */
export function resolveCritMultiplier(ctx: CombatResolveContext): void {
  if (!ctx.crit) return;
  const critDamage = (ctx.attackerStats as { critDamage?: number }).critDamage ?? 0;
  const critMultiplier = (200 + Math.max(0, critDamage) / 10) / 100;
  ctx.rawDamage = Math.max(1, Math.round(ctx.rawDamage * critMultiplier));
  ctx.damage = Math.max(1, Math.round(ctx.damage * critMultiplier));
}

/** 境界差乘区。 */
export function resolveRealmGap(ctx: CombatResolveContext): void {
  const mult = getRealmGapDamageMultiplier(ctx.attackerRealmLv, ctx.targetRealmLv);
  ctx.rawDamage = Math.max(1, Math.round(ctx.rawDamage * mult));
  ctx.damage = Math.max(1, Math.round(ctx.damage * mult));
}

/** 外部额外乘区（如普攻战斗经验伤害乘区）。 */
export function resolveExtraMultiplier(ctx: CombatResolveContext): void {
  if (!Number.isFinite(ctx.extraMultiplier) || ctx.extraMultiplier === 1) return;
  ctx.rawDamage = Math.max(1, Math.round(ctx.rawDamage * ctx.extraMultiplier));
  ctx.damage = Math.max(1, Math.round(ctx.damage * ctx.extraMultiplier));
}

/** 把 context 转换为对外的结算结果对象。 */
export function finalizeCombatResolveOutcome(ctx: CombatResolveContext): CombatResolveOutcome {
  if (ctx.dodged) {
    return { hit: false, rawDamage: 0, damage: 0, crit: false, dodged: true, resolved: false, broken: ctx.broken };
  }
  return { hit: true, rawDamage: ctx.rawDamage, damage: ctx.damage, crit: ctx.crit, dodged: false, resolved: ctx.resolved, broken: ctx.broken };
}
