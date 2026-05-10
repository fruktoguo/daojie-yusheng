/**
 * 战斗结算管线链路组合：按攻击类型 × 目标类型把环节串成完整结算流程。
 *
 * 职责：
 * - 定义不同目标类型（战斗者 / 地块）的结算环节执行顺序
 * - 提供按攻击类型（普攻 / 技能）× 目标类型（怪物 / 玩家 / 地块）的入口函数
 *
 * 设计：
 * - 随机数消费顺序固定：broken → dodged → resolved → crit，保证 smoke 可回归
 * - 地块链路跳过防御与境界差（地块无防御属性）
 */

import {
  type CombatResolveContext,
  resolveBreak,
  resolveResolve,
  resolveHitDodge,
  resolveCrit,
  resolveElementBonus,
  resolveDefense,
  resolveCritMultiplier,
  resolveRealmGap,
  resolveExtraMultiplier,
} from './combat-pipeline';

/**
 * 完整战斗者链路（玩家/怪物目标）。
 * 包含所有结算环节：破防 → 闪避 → 化解 → 暴击 → 五行加成 → 防御减伤 → 暴击乘区 → 境界差 → 额外乘区。
 * 随机数消费顺序：broken → dodged → resolved → crit。
 */
export function runFullCombatantPipeline(ctx: CombatResolveContext): void {
  resolveBreak(ctx);
  resolveHitDodge(ctx);
  if (ctx.dodged) return;
  resolveResolve(ctx);
  resolveCrit(ctx);
  resolveElementBonus(ctx);
  resolveDefense(ctx);
  resolveCritMultiplier(ctx);
  resolveRealmGap(ctx);
  resolveExtraMultiplier(ctx);
}

/**
 * 地块链路：地块不吃境界压制、暴击、命中、破招、防御。
 * 只保留五行加成和额外乘区（阵法减伤在外部处理）。
 */
export function runTilePipeline(ctx: CombatResolveContext): void {
  resolveElementBonus(ctx);
  resolveExtraMultiplier(ctx);
}

/** 普攻 → 怪物：走完整战斗者链路。 */
export function resolveBasicAttackToMonster(ctx: CombatResolveContext): void { runFullCombatantPipeline(ctx); }
/** 普攻 → 玩家：走完整战斗者链路。 */
export function resolveBasicAttackToPlayer(ctx: CombatResolveContext): void { runFullCombatantPipeline(ctx); }
/** 普攻 → 地块：走地块链路（无防御/境界差）。 */
export function resolveBasicAttackToTile(ctx: CombatResolveContext): void { runTilePipeline(ctx); }
/** 技能 → 怪物：走完整战斗者链路。 */
export function resolveSkillToMonster(ctx: CombatResolveContext): void { runFullCombatantPipeline(ctx); }
/** 技能 → 玩家：走完整战斗者链路。 */
export function resolveSkillToPlayer(ctx: CombatResolveContext): void { runFullCombatantPipeline(ctx); }
/** 技能 → 地块：走地块链路（无防御/境界差）。 */
export function resolveSkillToTile(ctx: CombatResolveContext): void { runTilePipeline(ctx); }
