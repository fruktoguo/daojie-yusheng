/**
 * 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
 *
 * 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
 */
/**
 * 移动调试工具：通过 SERVER_DEBUG_MOVEMENT 环境变量控制开关，
 * 开启后在移动链路关键分支输出结构化日志，辅助定位寻路和碰撞问题。
 */

/** 把环境变量里常见的布尔写法统一成标准布尔值。 */
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

/** 判断是否开启服务端新版移动日志调试。 */
export function isServerNextMovementDebugEnabled(): boolean {
  return normalizeDebugFlag(process.env.SERVER_DEBUG_MOVEMENT);
}

/** 安全序列化日志载荷，失败时回退为错误摘要，避免调试日志再抛错。 */
function safeSerialize(payload: unknown): string {

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
/** 日志器最小接口 */
interface MovementLoggerLike {
  log: (message: string) => void;
}

/** 在开关开启时输出移动日志，便于定位移动链路的分支和载荷。 */
export function logServerNextMovement(
  logger: MovementLoggerLike,
  scope: string,
  payload?: unknown,
): void {

  if (!isServerNextMovementDebugEnabled()) {
    return;
  }
  logger.log(`[移动调试][${scope}]${payload === undefined ? '' : ` ${safeSerialize(payload)}`}`);
}
