/**
 * 为本地单进程开发入口补齐安全的运行角色默认值。
 *
 * 生产入口仍保持 api/off 的缺省策略；这里只由本地开发启动前置与 dev-hot 调用，且绝不覆盖用户配置。
 */
export function applyLocalDevelopmentRuntimeDefaults(
  env: NodeJS.ProcessEnv = process.env,
): {
  runtimeRole: string;
  flushTaskRuntimeMode: string;
  roleDefaulted: boolean;
  flushModeDefaulted: boolean;
} {
  const configuredRole = firstTrimmed(env.SERVER_RUNTIME_ROLE, env.DAOJIE_RUNTIME_ROLE);
  const roleDefaulted = !configuredRole;
  if (roleDefaulted) {
    env.SERVER_RUNTIME_ROLE = 'all';
  }
  const runtimeRole = configuredRole || 'all';

  const configuredFlushMode = firstTrimmed(
    env.SERVER_FLUSH_TASK_RUNTIME_MODE,
    env.FLUSH_TASK_RUNTIME_MODE,
  );
  const flushModeDefaulted = !configuredFlushMode && runtimeRole === 'all';
  if (flushModeDefaulted) {
    env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'inline';
  }

  return {
    runtimeRole,
    flushTaskRuntimeMode: configuredFlushMode || (runtimeRole === 'all' ? 'inline' : ''),
    roleDefaulted,
    flushModeDefaulted,
  };
}

function firstTrimmed(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized) {
      return normalized;
    }
  }
  return '';
}
