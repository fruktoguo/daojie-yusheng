/**
 * 阵法战斗效果投影：只在结算时临时套用，不改妖兽运行态真源。
 */
import {
  applyMonsterMainCombatStatModifier,
  cloneNumericStats,
  percentModifierToMultiplier,
} from '@mud/shared';

export function resolveFormationMonsterSuppressionLayers(
  formationService: any,
  instanceId: unknown,
  x: unknown,
  y: unknown,
): number {
  if (typeof formationService?.resolveMonsterSuppressionLayersAt !== 'function') {
    return 0;
  }
  const layers = Number(formationService.resolveMonsterSuppressionLayersAt(instanceId, x, y));
  return Number.isFinite(layers) ? Math.max(0, Math.floor(layers)) : 0;
}

export function resolveFormationMonsterExpMultiplier(
  formationService: any,
  instanceId: unknown,
  x: unknown,
  y: unknown,
): number {
  const layers = resolveFormationMonsterSuppressionLayers(formationService, instanceId, x, y);
  return layers > 0 ? percentModifierToMultiplier(-layers) : 1;
}

export function resolveSuppressedMonsterNumericStats(
  monster: any,
  formationService: any,
  instanceId: unknown = monster?.instanceId,
): {
  layers: number;
  numericStats: any;
} {
  const layers = resolveFormationMonsterSuppressionLayers(formationService, instanceId, monster?.x, monster?.y);
  if (layers <= 0 || !monster?.numericStats) {
    return { layers: 0, numericStats: monster?.numericStats };
  }
  const numericStats = cloneNumericStats(monster.numericStats);
  applyMonsterMainCombatStatModifier(numericStats, -layers);
  return { layers, numericStats };
}
