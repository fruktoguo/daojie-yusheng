/**
 * Worker pool 启动期配置解析。
 *
 * 配置只在服务构造时归一化一次，运行时直接读取稳定整数，避免小数或越界值传入数组长度。
 */

export interface WorkerPoolSizeResolution {
  poolSize: number;
  configuredValue: string | null;
  adjusted: boolean;
}

/** 把手写 env 或历史数据库配置归一化为有界正整数。 */
export function resolveWorkerPoolSize(
  value: unknown,
  fallback: number,
  max: number,
): WorkerPoolSizeResolution {
  const normalizedMax = Math.max(1, Math.trunc(Number(max) || 1));
  const normalizedFallback = clampWorkerPoolSize(fallback, normalizedMax);
  const configuredValue = typeof value === 'string' && value.trim() ? value.trim() : null;
  if (configuredValue === null) {
    return {
      poolSize: normalizedFallback,
      configuredValue: null,
      adjusted: false,
    };
  }

  const parsed = Number(configuredValue);
  if (!Number.isFinite(parsed)) {
    return {
      poolSize: normalizedFallback,
      configuredValue,
      adjusted: true,
    };
  }

  const poolSize = clampWorkerPoolSize(parsed, normalizedMax);
  return {
    poolSize,
    configuredValue,
    adjusted: poolSize !== parsed,
  };
}

function clampWorkerPoolSize(value: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}
