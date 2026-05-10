/**
 * 战斗结算管线链路组合：按攻击类型 × 目标类型把环节串成完整结算流程。
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
 * 地块链路：跳过防御与境界差。
 */
export function runTilePipeline(ctx: CombatResolveContext): void {
  resolveBreak(ctx);
  resolveHitDodge(ctx);
  if (ctx.dodged) return;
  resolveResolve(ctx);
  resolveCrit(ctx);
  resolveElementBonus(ctx);
  resolveCritMultiplier(ctx);
  resolveExtraMultiplier(ctx);
}

export function resolveBasicAttackToMonster(ctx: CombatResolveContext): void { runFullCombatantPipeline(ctx); }
export function resolveBasicAttackToPlayer(ctx: CombatResolveContext): void { runFullCombatantPipeline(ctx); }
export function resolveBasicAttackToTile(ctx: CombatResolveContext): void { runTilePipeline(ctx); }
export function resolveSkillToMonster(ctx: CombatResolveContext): void { runFullCombatantPipeline(ctx); }
export function resolveSkillToPlayer(ctx: CombatResolveContext): void { runFullCombatantPipeline(ctx); }
export function resolveSkillToTile(ctx: CombatResolveContext): void { runTilePipeline(ctx); }
