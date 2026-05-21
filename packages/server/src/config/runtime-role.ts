import { readBooleanEnv, readTrimmedEnv } from './env-alias';

export type ServerRuntimeRole = 'all' | 'api' | 'worker';

const VALID_RUNTIME_ROLES = new Set<ServerRuntimeRole>(['all', 'api', 'worker']);
let invalidRuntimeRoleWarned = false;

export function resolveServerRuntimeRole(): ServerRuntimeRole {
  const raw = readTrimmedEnv('SERVER_RUNTIME_ROLE', 'DAOJIE_RUNTIME_ROLE').toLowerCase();
  if (!raw) {
    return 'all';
  }
  if (VALID_RUNTIME_ROLES.has(raw as ServerRuntimeRole)) {
    return raw as ServerRuntimeRole;
  }
  if (!invalidRuntimeRoleWarned) {
    invalidRuntimeRoleWarned = true;
    console.warn(`[runtime-role] 非法 SERVER_RUNTIME_ROLE/DAOJIE_RUNTIME_ROLE=${raw}，已回退 all；生产部署必须显式使用 api/worker。`);
  }
  return 'all';
}

export function shouldStartHttpServer(role = resolveServerRuntimeRole()): boolean {
  return role === 'all' || role === 'api';
}

export function shouldStartAuthoritativeRuntime(role = resolveServerRuntimeRole()): boolean {
  return role === 'all' || role === 'api';
}

export function shouldStartInlineFlushConsumer(role = resolveServerRuntimeRole()): boolean {
  if (role === 'all') {
    return true;
  }
  return role === 'api' && readBooleanEnv(
    'SERVER_ALLOW_API_INLINE_FLUSH_FALLBACK',
    'DAOJIE_ALLOW_API_INLINE_FLUSH_FALLBACK',
  );
}

export function shouldStartBackgroundWorkers(role = resolveServerRuntimeRole()): boolean {
  return role === 'all' || role === 'worker';
}

export function shouldStartOutboxDispatcher(role = resolveServerRuntimeRole()): boolean {
  return shouldStartBackgroundWorkers(role);
}

export function shouldStartBackupWorker(role = resolveServerRuntimeRole()): boolean {
  return shouldStartBackgroundWorkers(role);
}

export function describeServerRuntimeRole(role = resolveServerRuntimeRole()): string {
  return [
    `role=${role}`,
    `http=${shouldStartHttpServer(role) ? 'on' : 'off'}`,
    `authoritativeRuntime=${shouldStartAuthoritativeRuntime(role) ? 'on' : 'off'}`,
    `inlineFlush=${shouldStartInlineFlushConsumer(role) ? 'on' : 'off'}`,
    `backgroundWorkers=${shouldStartBackgroundWorkers(role) ? 'on' : 'off'}`,
    `outbox=${shouldStartOutboxDispatcher(role) ? 'on' : 'off'}`,
    `backup=${shouldStartBackupWorker(role) ? 'on' : 'off'}`,
  ].join(' ');
}
