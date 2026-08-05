import { readCraftEffectStat } from '@mud/shared';

import { resolveCompiledBuildingDefinition } from '../building/building-definition-resolution.helpers';
import { resolvePlayerCraftEffectStat } from '../craft/craft-effect-runtime.helpers';

export type PlayerComprehensionSpeedContext = {
  getInstanceRuntime?(instanceId: string): any | null;
  instanceRuntime?: any | null;
};

export const PLAYER_COMPREHENSION_PROJECTION_CACHE_HIT = 0;
export const PLAYER_COMPREHENSION_PROJECTION_RECALCULATED_UNCHANGED = 1;
export const PLAYER_COMPREHENSION_PROJECTION_RECALCULATED_CHANGED = 2;

type PlayerComprehensionProjectionRefreshResult =
  | typeof PLAYER_COMPREHENSION_PROJECTION_CACHE_HIT
  | typeof PLAYER_COMPREHENSION_PROJECTION_RECALCULATED_UNCHANGED
  | typeof PLAYER_COMPREHENSION_PROJECTION_RECALCULATED_CHANGED;

const initializedComprehensionProjectionPlayers = new WeakSet<object>();
const dirtyComprehensionProjectionPlayers = new WeakSet<object>();

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
  const changed = !Number.isFinite(previous) || previous !== next;
  if (changed) {
    player.comprehensionSpeedRate = next;
    if (player.attrs && Number.isFinite(Number(player.attrs.revision))) {
      player.attrs.revision = Math.max(1, Math.trunc(Number(player.attrs.revision))) + 1;
    }
  }
  if (player && typeof player === 'object') {
    initializedComprehensionProjectionPlayers.add(player);
    dirtyComprehensionProjectionPlayers.delete(player);
  }
  return changed;
}

/** 标记本人展示投影失效；权威领悟结算始终绕过此缓存读取真实输入。 */
export function markPlayerComprehensionSpeedRateProjectionDirty(player: any): void {
  if (player && typeof player === 'object') {
    dirtyComprehensionProjectionPlayers.add(player);
  }
}

/**
 * 仅在个人属性、站位或脚下建筑版本变化时刷新展示投影。
 * 命中路径不分配对象，也不再解析建筑定义。
 */
export function refreshPlayerComprehensionSpeedRateProjectionIfDirty(
  player: any,
  context: PlayerComprehensionSpeedContext = {},
): PlayerComprehensionProjectionRefreshResult {
  if (
    player
    && typeof player === 'object'
    && initializedComprehensionProjectionPlayers.has(player)
    && !dirtyComprehensionProjectionPlayers.has(player)
  ) {
    return PLAYER_COMPREHENSION_PROJECTION_CACHE_HIT;
  }
  return refreshPlayerComprehensionSpeedRateProjection(player, context)
    ? PLAYER_COMPREHENSION_PROJECTION_RECALCULATED_CHANGED
    : PLAYER_COMPREHENSION_PROJECTION_RECALCULATED_UNCHANGED;
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
  const instance = resolveProjectionInstance(instanceId, context);
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

function resolveProjectionInstance(
  instanceId: string,
  context: PlayerComprehensionSpeedContext,
): any | null {
  return typeof context.getInstanceRuntime === 'function'
    ? context.getInstanceRuntime(instanceId)
    : context.instanceRuntime ?? null;
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
