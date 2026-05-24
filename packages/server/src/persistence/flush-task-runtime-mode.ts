/**
 * 本文件属于持久化边界，负责 flush 运行时、兼容转换或失败策略等数据可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和数据库真源，避免在 tick 内直接引入阻塞 IO。
 */
import { Logger } from '@nestjs/common';
import { readTrimmedEnv } from '../config/env-alias';
import { resolveServerRuntimeRole, shouldStartAuthoritativeRuntime } from '../config/runtime-role';

const flushModeLogger = new Logger('FlushTaskRuntimeMode');

export type FlushTaskRuntimeMode = 'inline' | 'worker' | 'direct' | 'off';

export function resolveFlushTaskRuntimeMode(): FlushTaskRuntimeMode {
  const raw = readTrimmedEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', 'FLUSH_TASK_RUNTIME_MODE')?.toLowerCase();
  if (raw === 'direct' || raw === 'legacy') {
    if (raw === 'legacy') {
      flushModeLogger.warn('FLUSH_TASK_RUNTIME_MODE 使用了已废弃的 "legacy" 别名，已映射为 "direct"');
    }
    return 'direct';
  }
  if (raw === 'worker' || raw === 'consumer') {
    return 'worker';
  }
  if (raw === 'inline') {
    return 'inline';
  }
  if (raw === 'off' || raw === 'disabled' || raw === '0' || raw === 'false') {
    return 'off';
  }
  const runtimeEnv = readTrimmedEnv('SERVER_RUNTIME_ENV', 'APP_ENV', 'NODE_ENV').toLowerCase();
  if (runtimeEnv === 'test' || readTrimmedEnv('SERVER_SMOKE_PORT') || readTrimmedEnv('SERVER_SMOKE_ALLOW_UNREADY')) {
    return 'off';
  }
  const role = resolveServerRuntimeRole();
  if (role === 'worker') {
    return 'worker';
  }
  if (role === 'api') {
    return 'off';
  }
  return 'inline';
}

export function isInlineFlushTaskRuntimeMode(): boolean {
  return resolveFlushTaskRuntimeMode() === 'inline';
}

export function isFlushTaskConsumerMode(): boolean {
  const mode = resolveFlushTaskRuntimeMode();
  return mode === 'inline' || mode === 'worker';
}

export function shouldRunLegacyFlushIntervals(): boolean {
  return shouldStartAuthoritativeRuntime(resolveServerRuntimeRole()) && resolveFlushTaskRuntimeMode() === 'direct';
}
