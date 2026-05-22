/**
 * 本文件负责服务端运行配置的解析或角色判断，是启动期配置边界的一部分。
 *
 * 维护时要让默认值对生产环境友好，并避免把临时本地配置误当作线上真源。
 */
import { readBooleanEnv, readTrimmedEnv } from './env-alias';

export type ServerRuntimeRole = 'all' | 'api' | 'worker';

const VALID_RUNTIME_ROLES = new Set<ServerRuntimeRole>(['all', 'api', 'worker']);
let invalidRuntimeRoleWarned = false;

export function resolveServerRuntimeRole(): ServerRuntimeRole {
  const raw = readTrimmedEnv('SERVER_RUNTIME_ROLE', 'DAOJIE_RUNTIME_ROLE').toLowerCase();
  if (!raw) {
    return 'api';
  }
  if (VALID_RUNTIME_ROLES.has(raw as ServerRuntimeRole)) {
    return raw as ServerRuntimeRole;
  }
  if (!invalidRuntimeRoleWarned) {
    invalidRuntimeRoleWarned = true;
    console.warn(`[runtime-role] 非法 SERVER_RUNTIME_ROLE/DAOJIE_RUNTIME_ROLE=${raw}，已回退 api；如需本地单进程或应急回滚必须显式使用 all。`);
  }
  return 'api';
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
