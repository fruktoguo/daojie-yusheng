/** currentServerTick：定义该变量以承载业务值。 */
let currentServerTick: number | null = null;
/** currentServerTickSyncedAt：定义该变量以承载业务值。 */
let currentServerTickSyncedAt = performance.now();
/** currentServerTickIntervalMs：定义该变量以承载业务值。 */
let currentServerTickIntervalMs = 1000;

/** syncEstimatedServerTick：执行对应的业务逻辑。 */
export function syncEstimatedServerTick(serverTick: number | null | undefined): void {
  currentServerTick = typeof serverTick === 'number' && Number.isFinite(serverTick)
    ? Math.max(0, Math.floor(serverTick))
    : null;
  currentServerTickSyncedAt = performance.now();
}

/** syncEstimatedServerTickInterval：执行对应的业务逻辑。 */
export function syncEstimatedServerTickInterval(dtMs: number | null | undefined): void {
  if (typeof dtMs !== 'number' || !Number.isFinite(dtMs) || dtMs <= 0) {
    return;
  }
  currentServerTickIntervalMs = dtMs;
}

/** getEstimatedServerTick：执行对应的业务逻辑。 */
export function getEstimatedServerTick(now = performance.now()): number | null {
  if (currentServerTick === null) {
    return null;
  }
/** elapsedMs：定义该变量以承载业务值。 */
  const elapsedMs = Math.max(0, now - currentServerTickSyncedAt);
/** elapsedTicks：定义该变量以承载业务值。 */
  const elapsedTicks = Math.floor(elapsedMs / Math.max(1, currentServerTickIntervalMs));
  return currentServerTick + elapsedTicks;
}

/** resolveInventoryCooldownLeft：执行对应的业务逻辑。 */
export function resolveInventoryCooldownLeft(cooldown: number, startedAtTick: number, now = performance.now()): number {
/** normalizedCooldown：定义该变量以承载业务值。 */
  const normalizedCooldown = Math.max(0, Math.floor(cooldown));
  if (normalizedCooldown <= 0) {
    return 0;
  }
/** currentTick：定义该变量以承载业务值。 */
  const currentTick = getEstimatedServerTick(now);
  if (currentTick === null) {
    return normalizedCooldown;
  }
/** elapsedTicks：定义该变量以承载业务值。 */
  const elapsedTicks = Math.max(0, currentTick - Math.max(0, Math.floor(startedAtTick)));
  return Math.max(0, normalizedCooldown - elapsedTicks);
}

