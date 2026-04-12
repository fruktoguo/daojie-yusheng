const MOVEMENT_DEBUG_STORAGE_KEY = 'next.debug.movement';
const MOVEMENT_DEBUG_QUERY_KEY = 'debugMovement';

/** NextMovementDebugWindow：定义该类型的结构与数据语义。 */
type NextMovementDebugWindow = Window & {
  __NEXT_DEBUG_MOVEMENT__?: unknown;
};

/** normalizeDebugFlag：执行对应的业务逻辑。 */
function normalizeDebugFlag(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}

/** isNextMovementDebugEnabled：执行对应的业务逻辑。 */
export function isNextMovementDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (normalizeDebugFlag(import.meta.env.VITE_NEXT_DEBUG_MOVEMENT)) {
    return true;
  }
  const debugWindow = window as NextMovementDebugWindow;
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

/** logNextMovement：执行对应的业务逻辑。 */
export function logNextMovement(scope: string, payload?: unknown): void {
  if (!isNextMovementDebugEnabled()) {
    return;
  }
  const prefix = `[next-move][${scope}]`;
  if (payload === undefined) {
    console.info(prefix);
    return;
  }
  console.info(prefix, payload);
}

