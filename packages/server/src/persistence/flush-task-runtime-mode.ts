import { readTrimmedEnv } from '../config/env-alias';
import { resolveServerRuntimeRole, shouldStartAuthoritativeRuntime } from '../config/runtime-role';

export type FlushTaskRuntimeMode = 'inline' | 'worker' | 'direct' | 'off';

export function resolveFlushTaskRuntimeMode(): FlushTaskRuntimeMode {
  const raw = readTrimmedEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', 'FLUSH_TASK_RUNTIME_MODE')?.toLowerCase();
  if (raw === 'direct' || raw === 'legacy') {
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
