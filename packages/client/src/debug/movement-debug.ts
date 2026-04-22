/** MOVEMENT_DEBUG_STORAGE_KEY：移动调试存储KEY。 */
const MOVEMENT_DEBUG_STORAGE_KEY = 'next.debug.movement';
/** MOVEMENT_DEBUG_QUERY_KEY：移动调试查询KEY。 */
const MOVEMENT_DEBUG_QUERY_KEY = 'debugMovement';

/** MovementDebugWindow：挂载 next 移动调试开关的 window 扩展。 */
type MovementDebugWindow = Window & {
/**
 * __NEXT_DEBUG_MOVEMENT__：NEXTDEBUGMOVEMENT相关字段。
 */

  __NEXT_DEBUG_MOVEMENT__?: unknown;
};

/** normalizeDebugFlag：规范化调试Flag。 */
function normalizeDebugFlag(value: unknown): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (value === true || value === 1) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}

/** isMovementDebugEnabled：判断是否新版移动调试启用。 */
export function isMovementDebugEnabled(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof window === 'undefined') {
    return false;
  }
  if (normalizeDebugFlag(import.meta.env.VITE_NEXT_DEBUG_MOVEMENT)) {
    return true;
  }
  const debugWindow = window as MovementDebugWindow;
  if (normalizeDebugFlag(debugWindow.__NEXT_DEBUG_MOVEMENT__)) {
    return true;
  }
  try {
    const queryValue = new URLSearchParams(window.location.search).get(MOVEMENT_DEBUG_QUERY_KEY);
    if (normalizeDebugFlag(queryValue)) {
      return true;
    }
  } catch {
    // ignore malformed location
  }
  try {
    return normalizeDebugFlag(window.localStorage?.getItem(MOVEMENT_DEBUG_STORAGE_KEY));
  } catch {
    return false;
  }
}

/** logMovement：处理日志新版移动。 */
export function logMovement(scope: string, payload?: unknown): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!isMovementDebugEnabled()) {
    return;
  }
  const prefix = `[next-move][${scope}]`;
  if (payload === undefined) {
    console.info(prefix);
    return;
  }
  console.info(prefix, payload);
}
