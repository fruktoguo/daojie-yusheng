/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 网关 handler 统一返回类型与工厂函数。
 * 所有 gateway handler 通过 ok/fail 构造结果，客户端按 success 字段分流处理。
 */

/** 网关 handler 统一返回类型 */
export type GatewayResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: GatewayError };

export interface GatewayError {
  code: GatewayErrorCode;
  message: string;
  details?: unknown;
}

export enum GatewayErrorCode {
  /** 未认证 */
  Unauthenticated = 'UNAUTHENTICATED',
  /** 无权限 */
  PermissionDenied = 'PERMISSION_DENIED',
  /** 参数无效 */
  InvalidArgument = 'INVALID_ARGUMENT',
  /** 资源不存在 */
  NotFound = 'NOT_FOUND',
  /** 状态冲突 */
  FailedPrecondition = 'FAILED_PRECONDITION',
  /** 服务内部错误 */
  Internal = 'INTERNAL',
  /** 冷却中 */
  RateLimited = 'RATE_LIMITED',
}

/** 工厂函数 */
export function ok<T>(data: T): GatewayResult<T>;
export function ok(): GatewayResult<void>;
export function ok<T>(data?: T): GatewayResult<T | void> {
  return { success: true, data: data as T };
}

export function fail(code: GatewayErrorCode, message: string, details?: unknown): GatewayResult<never> {
  return { success: false, error: { code, message, details } };
}

/** 类型守卫 */
export function isOk<T>(result: GatewayResult<T>): result is { success: true; data: T } {
  return result.success;
}

export function isFail<T>(result: GatewayResult<T>): result is { success: false; error: GatewayError } {
  return !result.success;
}
