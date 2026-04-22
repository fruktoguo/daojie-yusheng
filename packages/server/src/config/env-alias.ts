import './load-local-runtime-env';
/**
 * DatabaseEnvSource：统一结构类型，保证协议与运行时一致性。
 */


type DatabaseEnvSource = 'SERVER_DATABASE_URL' | 'DATABASE_URL';
/**
 * GmPasswordEnvSource：统一结构类型，保证协议与运行时一致性。
 */

type GmPasswordEnvSource = 'SERVER_GM_PASSWORD' | 'GM_PASSWORD';
/**
 * GmInsecureDefaultPasswordEnvSource：统一结构类型，保证协议与运行时一致性。
 */

type GmInsecureDefaultPasswordEnvSource =
  | 'SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD'
  | 'GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD';
/**
 * ServerUrlEnvSource：统一结构类型，保证协议与运行时一致性。
 */

type ServerUrlEnvSource = 'SERVER_URL';
/**
 * ShadowUrlEnvSource：统一结构类型，保证协议与运行时一致性。
 */

type ShadowUrlEnvSource = 'SERVER_SHADOW_URL' | 'SERVER_URL';
/**
 * readTrimmedEnv：读取TrimmedEnv并返回结果。
 * @param names string[] 参数说明。
 * @returns 返回TrimmedEnv。
 */


export function readTrimmedEnv(...names: string[]): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  for (const name of names) {
    const rawValue = process.env[name];
    if (typeof rawValue !== 'string') {
      continue;
    }

    const value = rawValue.trim();
    if (value.length > 0) {
      return value;
    }
  }

  return '';
}
/**
 * resolveServerDatabaseEnvSource：规范化或转换ServerNextDatabaseEnv来源。
 * @returns 返回ServerNextDatabaseEnv来源。
 */


export function resolveServerDatabaseEnvSource(): DatabaseEnvSource | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (readTrimmedEnv('SERVER_DATABASE_URL')) {
    return 'SERVER_DATABASE_URL';
  }

  if (readTrimmedEnv('DATABASE_URL')) {
    return 'DATABASE_URL';
  }

  return null;
}
/**
 * resolveServerDatabaseUrl：规范化或转换ServerNextDatabaseUrl。
 * @returns 返回ServerNextDatabaseUrl。
 */


export function resolveServerDatabaseUrl(): string {
  return readTrimmedEnv('SERVER_DATABASE_URL', 'DATABASE_URL');
}
/**
 * resolveServerGmPasswordEnvSource：规范化或转换ServerNextGMPasswordEnv来源。
 * @returns 返回ServerNextGMPasswordEnv来源。
 */


export function resolveServerGmPasswordEnvSource(): GmPasswordEnvSource | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (readTrimmedEnv('SERVER_GM_PASSWORD')) {
    return 'SERVER_GM_PASSWORD';
  }

  if (readTrimmedEnv('GM_PASSWORD')) {
    return 'GM_PASSWORD';
  }

  return null;
}
/**
 * resolveServerGmPassword：规范化或转换ServerNextGMPassword。
 * @param defaultValue 参数说明。
 * @returns 返回ServerNextGMPassword。
 */


export function resolveServerGmPassword(defaultValue = ''): string {
  return readTrimmedEnv('SERVER_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}
/**
 * resolveServerAllowInsecureLocalGmPasswordEnvSource：规范化或转换显式本地 GM 降级开关来源。
 * @returns 返回显式本地 GM 降级开关来源。
 */


export function resolveServerAllowInsecureLocalGmPasswordEnvSource(): GmInsecureDefaultPasswordEnvSource | null {
  if (readTrimmedEnv('SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD')) {
    return 'SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD';
  }

  if (readTrimmedEnv('GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD')) {
    return 'GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD';
  }

  return null;
}
/**
 * resolveServerAllowInsecureLocalGmPassword：解析显式本地 GM 降级开关。
 * @returns 返回是否开启显式本地 GM 降级。
 */


export function resolveServerAllowInsecureLocalGmPassword(): boolean {
  return readBooleanEnv('SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD', 'GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD');
}
/**
 * resolveServerUrlEnvSource：规范化或转换ServerNextUrlEnv来源。
 * @returns 返回ServerNextUrlEnv来源。
 */


export function resolveServerUrlEnvSource(): ServerUrlEnvSource | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (readTrimmedEnv('SERVER_URL')) {
    return 'SERVER_URL';
  }

  return null;
}
/**
 * resolveServerUrl：规范化或转换ServerNextUrl。
 * @returns 返回ServerNextUrl。
 */


export function resolveServerUrl(): string {
  return readTrimmedEnv('SERVER_URL');
}
/**
 * resolveServerShadowUrlEnvSource：规范化或转换ServerNextShadowUrlEnv来源。
 * @returns 返回ServerNextShadowUrlEnv来源。
 */


export function resolveServerShadowUrlEnvSource(): ShadowUrlEnvSource | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (readTrimmedEnv('SERVER_SHADOW_URL')) {
    return 'SERVER_SHADOW_URL';
  }

  if (readTrimmedEnv('SERVER_URL')) {
    return 'SERVER_URL';
  }

  return null;
}
/**
 * resolveServerShadowUrl：规范化或转换ServerNextShadowUrl。
 * @returns 返回ServerNextShadowUrl。
 */


export function resolveServerShadowUrl(): string {
  return readTrimmedEnv('SERVER_SHADOW_URL', 'SERVER_URL');
}
/**
 * readBooleanEnv：读取布尔环境变量。
 * @param names string[] 参数说明。
 * @returns 返回布尔值。
 */


export function readBooleanEnv(...names: string[]): boolean {
  const rawValue = readTrimmedEnv(...names).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(rawValue);
}
