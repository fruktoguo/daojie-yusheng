import { readTrimmedEnv } from '../config/env-alias';

export type FlushTaskRuntimeMode = 'inline' | 'direct' | 'off';

export function resolveFlushTaskRuntimeMode(): FlushTaskRuntimeMode {
  const raw = readTrimmedEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', 'FLUSH_TASK_RUNTIME_MODE')?.toLowerCase();
  if (raw === 'direct' || raw === 'legacy') {
    return 'direct';
  }
  if (raw === 'off' || raw === 'disabled' || raw === '0' || raw === 'false') {
    return 'off';
  }
  const runtimeEnv = readTrimmedEnv('SERVER_RUNTIME_ENV', 'APP_ENV', 'NODE_ENV').toLowerCase();
  if (runtimeEnv === 'test' || readTrimmedEnv('SERVER_SMOKE_PORT') || readTrimmedEnv('SERVER_SMOKE_ALLOW_UNREADY')) {
    return 'off';
  }
  return 'inline';
}

export function isInlineFlushTaskRuntimeMode(): boolean {
  return resolveFlushTaskRuntimeMode() === 'inline';
}

export function shouldRunLegacyFlushIntervals(): boolean {
  return resolveFlushTaskRuntimeMode() === 'direct';
}
