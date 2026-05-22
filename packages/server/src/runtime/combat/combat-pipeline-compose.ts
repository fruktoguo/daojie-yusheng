/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import {
  type CombatResolveContext,
  type CombatResolveInput,
  type CombatResolveOutcome,
  createCombatResolveContext,
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

// ─── 管线链路 ───

/**
 * 完整战斗者链路（玩家/怪物目标）。
 * 破防 → 闪避 → 化解 → 暴击 → 五行加成 → 防御减伤 → 暴击乘区 → 境界差 → 额外乘区。
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
 * 地块链路：不吃境界压制、暴击、命中、破招、防御。
 * 只保留五行加成和额外乘区（阵法减伤在外部处理）。
 */
export function runTilePipeline(ctx: CombatResolveContext): void {
  resolveElementBonus(ctx);
  resolveExtraMultiplier(ctx);
}

// ─── 从 context 提取结果 ───

function extractOutcome(ctx: CombatResolveContext): CombatResolveOutcome {
  return {
    hit: ctx.hit,
    rawDamage: ctx.rawDamage,
    damage: ctx.damage,
    crit: ctx.crit,
    dodged: ctx.dodged,
    resolved: ctx.resolved,
    broken: ctx.broken,
  };
}

// ─── 统一入口 ───

/**
 * 战斗者伤害结算统一入口（普攻/技能 → 怪物/玩家）。
 * 创建 context → 跑完整管线 → 返回结果。
 */
export function resolveCombatDamage(input: CombatResolveInput): CombatResolveOutcome {
  const ctx = createCombatResolveContext(input);
  runFullCombatantPipeline(ctx);
  return extractOutcome(ctx);
}

/**
 * 地块伤害结算统一入口（普攻/技能 → 地块/阵法）。
 * 创建 context → 跑地块管线 → 返回结果。
 */
export function resolveTileCombatDamage(input: CombatResolveInput): CombatResolveOutcome {
  const ctx = createCombatResolveContext(input);
  runTilePipeline(ctx);
  return extractOutcome(ctx);
}
