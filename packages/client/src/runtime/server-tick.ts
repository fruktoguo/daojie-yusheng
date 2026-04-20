import { gameplayConstants } from '@mud/shared-next';

/** 当前估算服务端 tick（可为空表示还未接收到服务端节拍基准）。 */
let currentServerTick: number | null = null;
/** 当前服务端 tick 时间戳（ms），用于换算本地延迟后 tick。 */
let currentServerTickSyncedAt = performance.now();
/** 服务端 world tick 间隔，默认按 shared 主线的 100ms 兜底。 */
let currentServerTickIntervalMs = gameplayConstants.WORLD_TICK_INTERVAL_MS;

/** 同步服务端下发的基准 tick，并重置本地估算时间基点。 */
export function syncEstimatedServerTick(serverTick: number | null | undefined): void {
  currentServerTick = typeof serverTick === 'number' && Number.isFinite(serverTick)
    ? Math.max(0, Math.floor(serverTick))
    : null;
  /** 基准 tick 已同步，刷新对齐时间点。 */
  currentServerTickSyncedAt = performance.now();
}

/** 同步服务端 tick 间隔（服务端可变 tick 周期时用于本地估算）。 */
export function syncEstimatedServerTickInterval(dtMs: number | null | undefined): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof dtMs !== 'number' || !Number.isFinite(dtMs) || dtMs <= 0) {
    return;
  }
  /** 使用有效的服务端 tick 周期替换本地默认值。 */
  currentServerTickIntervalMs = dtMs;
}

/** 根据本地耗时估算当前服务端 tick。 */
export function getEstimatedServerTick(now = performance.now()): number | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (currentServerTick === null) {
    return null;
  }
  const elapsedMs = Math.max(0, now - currentServerTickSyncedAt);
  const elapsedTicks = Math.floor(elapsedMs / Math.max(1, currentServerTickIntervalMs));
  return currentServerTick + elapsedTicks;
}

/** 根据冷却开始 tick 与当前估算 tick 计算剩余可用秒/时序 tick。 */
export function resolveInventoryCooldownLeft(cooldown: number, startedAtTick: number, now = performance.now()): number {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalizedCooldown = Math.max(0, Math.floor(cooldown));
  if (normalizedCooldown <= 0) {
    return 0;
  }
  const currentTick = getEstimatedServerTick(now);
  if (currentTick === null) {
    return normalizedCooldown;
  }
  const elapsedTicks = Math.max(0, currentTick - Math.max(0, Math.floor(startedAtTick)));
  return Math.max(0, normalizedCooldown - elapsedTicks);
}

