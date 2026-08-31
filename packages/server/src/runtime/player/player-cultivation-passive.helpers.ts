/**
 * 玩家修炼被动的地块灵气投影计算。
 *
 * 该函数只做纯数值换算，供玩家 tick 与专项 smoke 复用，避免把配置解释散落在调用方。
 */
import type { SkillPassiveCultivationTileQiEffectDef } from '@mud/shared';

export function resolveCultivationPassiveTileQiAmount(
  player: { attrs?: { numericStats?: { maxQiOutputPerTick?: unknown } } } | null | undefined,
  effect: SkillPassiveCultivationTileQiEffectDef,
): number {
  const multiplier = Number.isFinite(Number(effect.multiplier)) ? Number(effect.multiplier) : 1;
  if (effect.amountSource === 'max_qi_output_sqrt') {
    const output = Math.max(0, Number(player?.attrs?.numericStats?.maxQiOutputPerTick) || 0);
    return Math.sqrt(output) * multiplier;
  }
  if (Number.isFinite(Number(effect.amount))) {
    return Number(effect.amount) * multiplier;
  }
  return 0;
}
