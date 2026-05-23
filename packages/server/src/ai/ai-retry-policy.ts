/**
 * 本文件属于服务端 AI 接入层，负责模型配置、密钥引用或文本/图片客户端封装。
 *
 * 维护时要保护密钥不出现在普通响应中，并让外部模型调用保持可配置、可禁用、可超时。
 */

/**
 * AI 调用重试 + 熔断策略。
 *
 * 通用封装，不绑定具体业务。超时用 AbortController + Promise.race。
 */

export interface AiRetryConfig {
  /** 最大尝试次数（含首次），默认 2 */
  maxAttempts: number;
  /** 重试间隔 ms，默认 1000 */
  retryDelayMs: number;
  /** 单次超时 ms，默认 60000 */
  timeoutMs: number;
}

export const DEFAULT_AI_RETRY_CONFIG: AiRetryConfig = {
  maxAttempts: 2,
  retryDelayMs: 1000,
  timeoutMs: 60_000,
};

const CIRCUIT_BREAKER_THRESHOLD = 10;
const CIRCUIT_BREAKER_COOLDOWN_MS = 300_000;

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function isCircuitOpen(): boolean {
  if (consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD) return false;
  if (Date.now() >= circuitOpenUntil) {
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fn(controller.signal).finally(() => clearTimeout(timer));
}

export class AiCircuitBreakerOpenError extends Error {
  constructor() {
    super('AI 服务熔断中，请稍后重试');
    this.name = 'AiCircuitBreakerOpenError';
  }
}

export class AiTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`AI 调用超时（${timeoutMs}ms）`);
    this.name = 'AiTimeoutError';
  }
}

/**
 * 带重试和熔断的 AI 调用执行器。
 *
 * @param fn 实际调用函数，接收 AbortSignal 用于超时中断
 * @param config 重试配置
 */
export async function executeWithRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  config: Partial<AiRetryConfig> = {},
): Promise<T> {
  const resolved: AiRetryConfig = { ...DEFAULT_AI_RETRY_CONFIG, ...config };

  if (isCircuitOpen()) {
    throw new AiCircuitBreakerOpenError();
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= resolved.maxAttempts; attempt += 1) {
    try {
      const result = await withTimeout(fn, resolved.timeoutMs);
      recordSuccess();
      return result;
    } catch (error: unknown) {
      lastError = error;
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new AiTimeoutError(resolved.timeoutMs);
      }
      recordFailure();
      if (attempt < resolved.maxAttempts) {
        await delay(resolved.retryDelayMs);
      }
    }
  }

  throw lastError;
}

/** 重置熔断状态（仅测试用） */
export function resetAiRetryState(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}
