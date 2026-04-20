/** 把环境变量里常见的布尔写法统一成标准布尔值。 */
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

/** 判断是否开启服务端新版移动日志调试。 */
export function isServerNextMovementDebugEnabled(): boolean {
  return normalizeDebugFlag(process.env.SERVER_NEXT_DEBUG_MOVEMENT)
    || normalizeDebugFlag(process.env.NEXT_DEBUG_MOVEMENT);
}

/** 安全序列化日志载荷，失败时回退为错误摘要，避免调试日志再抛错。 */
function safeSerialize(payload: unknown): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (payload === undefined) {
    return '';
  }
  try {
    return JSON.stringify(payload);
  } catch (error) {
    return JSON.stringify({
      serializationError: error instanceof Error ? error.message : String(error),
      fallback: String(payload),
    });
  }
}
/**
 * MovementLoggerLike：定义接口结构约束，明确可交付字段含义。
 */


interface MovementLoggerLike {
/**
 * log：MovementLoggerLike 内部字段。
 */

  log: (message: string) => void;
}

/** 在开关开启时输出移动日志，便于定位移动链路的分支和载荷。 */
export function logServerNextMovement(
  logger: MovementLoggerLike,
  scope: string,
  payload?: unknown,
): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!isServerNextMovementDebugEnabled()) {
    return;
  }
  logger.log(`[移动调试][${scope}]${payload === undefined ? '' : ` ${safeSerialize(payload)}`}`);
}
