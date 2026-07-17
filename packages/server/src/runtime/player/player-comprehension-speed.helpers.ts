import { readCraftEffectStat } from '@mud/shared';

import { resolveCompiledBuildingDefinition } from '../building/building-definition-resolution.helpers';
import { resolvePlayerCraftEffectStat } from '../craft/craft-effect-runtime.helpers';

export type PlayerComprehensionSpeedContext = {
  getInstanceRuntime?(instanceId: string): any | null;
  instanceRuntime?: any | null;
};

/** 计算玩家个人领悟速度贡献，统一供自悟、学习者与传授者使用。 */
export function resolvePlayerComprehensionSpeedRate(
  player: any,
  context: PlayerComprehensionSpeedContext = {},
): number {
  return resolveFiniteNumber(resolvePlayerCraftEffectStat(player, 'transmission', 'speedRate'))
    + resolveFiniteNumber(player?.attrs?.numericStats?.techniqueExpRate) / 10_000
    + resolveStandingBuildingTransmissionSpeedRate(player, context);
}

/** 刷新只用于自身同步的派生值；不进入玩家持久化属性真源。 */
export function refreshPlayerComprehensionSpeedRateProjection(
  player: any,
  context: PlayerComprehensionSpeedContext = {},
): boolean {
  const next = resolvePlayerComprehensionSpeedRate(player, context);
  const previous = Number(player?.comprehensionSpeedRate);
  if (Number.isFinite(previous) && previous === next) {
    return false;
  }
  player.comprehensionSpeedRate = next;
  if (player.attrs && Number.isFinite(Number(player.attrs.revision))) {
    player.attrs.revision = Math.max(1, Math.trunc(Number(player.attrs.revision))) + 1;
  }
  return true;
}

/** 读取玩家脚下已建成设施提供的传法速度，不扫描整张地图。 */
export function resolveStandingBuildingTransmissionSpeedRate(
  player: any,
  context: PlayerComprehensionSpeedContext = {},
): number {
  const instanceId = normalizeText(player?.instanceId);
  if (!instanceId) {
    return 0;
  }
  const instance = typeof context.getInstanceRuntime === 'function'
    ? context.getInstanceRuntime(instanceId)
    : context.instanceRuntime;
  if (!instance || typeof instance !== 'object') {
    return 0;
  }
  const x = Math.floor(Number(player?.x) || 0);
  const y = Math.floor(Number(player?.y) || 0);
  const cellIndex = typeof instance.toTileIndex === 'function'
    ? Math.trunc(Number(instance.toTileIndex(x, y)))
    : Math.trunc(Number(instance.tilePlane?.getCellIndex?.(x, y)));
  if (!Number.isFinite(cellIndex) || cellIndex < 0) {
    return 0;
  }
  const buildingIds = instance.buildingIdByCell?.get?.(cellIndex);
  if (!buildingIds || typeof buildingIds[Symbol.iterator] !== 'function') {
    return 0;
  }
  let speedRate = 0;
  for (const buildingId of buildingIds as Iterable<unknown>) {
    const building = instance.buildingById?.get?.(buildingId);
    if (!building || !isCompletedStandingEffectState(building.state)) {
      continue;
    }
    const compiled = resolveCompiledBuildingDefinition(instance.buildingCatalog, building);
    speedRate += resolveFiniteNumber(readCraftEffectStat(compiled?.craftEffectStats, 'transmission', 'speedRate'));
  }
  return speedRate;
}

function isCompletedStandingEffectState(value: unknown): boolean {
  return value === 'active' || value === 'damaged';
}

function resolveFiniteNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
