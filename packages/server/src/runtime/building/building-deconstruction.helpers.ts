import { BUILDING_DECONSTRUCT_SKILL_EFFICIENCY_PER_LEVEL } from '@mud/shared';
import { resolvePlayerCraftEffectStat } from '../craft/craft-effect-runtime.helpers';

/** 计算半成品已经实际完成的原始施工工作量；完工建筑保留完整 buildStrength。 */
export function resolveBuildingDeconstructionWork(
  building: Record<string, any>,
  fallbackBuildTicks = 1,
): number {
  const buildStrength = Math.max(
    1,
    Number.isFinite(Number(building?.buildStrength))
      ? Number(building.buildStrength)
      : Number(fallbackBuildTicks) || 1,
  );
  const sourceState = building?.state === 'deconstructing'
    ? building?.deconstructPreviousState
    : building?.state;
  if (sourceState !== 'building') {
    return buildStrength;
  }
  const remainingWork = Number.isFinite(Number(building?.buildRemainingTicks))
    ? Math.min(buildStrength, Math.max(0, Number(building.buildRemainingTicks)))
    : buildStrength;
  return Math.max(1, Number((buildStrength - remainingWork).toFixed(6)));
}

/**
 * 拆除效率同时比较双方营造等级，并继续消费拆除者当前 building.speedRate。
 * 同等级时等级倍率为 1；旧建筑缺少建造者等级时保持既有等时语义。
 */
export function resolveBuildingDeconstructionProgressPerTick(
  player: Record<string, any>,
  building: Record<string, any>,
): number {
  const deconstructorLevel = normalizeBuildingSkillLevel(player?.buildingSkill?.level);
  const builderLevel = Number.isFinite(Number(building?.builderSkillLevel))
    ? normalizeBuildingSkillLevel(building.builderSkillLevel)
    : deconstructorLevel;
  const deconstructorEfficiency = resolveBuildingSkillEfficiency(deconstructorLevel);
  const builderEfficiency = resolveBuildingSkillEfficiency(builderLevel);
  const speedRate = Math.max(0, resolvePlayerCraftEffectStat(player, 'building', 'speedRate'));
  return (1 + speedRate) * (deconstructorEfficiency / builderEfficiency);
}

export function resolveBuildingDeconstructionDurationTicks(
  totalWork: number,
  player: Record<string, any>,
  building: Record<string, any>,
): number {
  const normalizedWork = Math.max(1, Number(totalWork) || 1);
  const duration = normalizedWork / resolveBuildingDeconstructionProgressPerTick(player, building);
  return Math.max(1, Math.ceil(Number(duration.toFixed(6))));
}

function normalizeBuildingSkillLevel(value: unknown): number {
  return Math.max(1, Math.trunc(Number(value) || 1));
}

function resolveBuildingSkillEfficiency(level: number): number {
  return 1 + (level - 1) * BUILDING_DECONSTRUCT_SKILL_EFFICIENCY_PER_LEVEL;
}
