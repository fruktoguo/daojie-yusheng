import * as path from 'node:path';

require(path.resolve(__dirname, '../../../../scripts/load-local-runtime-env.js'));
/**
 * DatabaseEnvSource：统一结构类型，保证协议与运行时一致性。
 */


type DatabaseEnvSource = 'SERVER_NEXT_DATABASE_URL' | 'DATABASE_URL';
/**
 * GmPasswordEnvSource：统一结构类型，保证协议与运行时一致性。
 */

type GmPasswordEnvSource = 'SERVER_NEXT_GM_PASSWORD' | 'GM_PASSWORD';
/**
 * ServerUrlEnvSource：统一结构类型，保证协议与运行时一致性。
 */

type ServerUrlEnvSource = 'SERVER_NEXT_URL';
/**
 * ShadowUrlEnvSource：统一结构类型，保证协议与运行时一致性。
 */

type ShadowUrlEnvSource = 'SERVER_NEXT_SHADOW_URL' | 'SERVER_NEXT_URL';
/**
 * readTrimmedEnv：执行核心业务逻辑。
 * @param names string[] 参数说明。
 * @returns string。
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
 * resolveServerNextDatabaseEnvSource：执行核心业务逻辑。
 * @returns DatabaseEnvSource | null。
 */


export function resolveServerNextDatabaseEnvSource(): DatabaseEnvSource | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (readTrimmedEnv('SERVER_NEXT_DATABASE_URL')) {
    return 'SERVER_NEXT_DATABASE_URL';
  }

  if (readTrimmedEnv('DATABASE_URL')) {
    return 'DATABASE_URL';
  }

  return null;
}
/**
 * resolveServerNextDatabaseUrl：执行核心业务逻辑。
 * @returns string。
 */


export function resolveServerNextDatabaseUrl(): string {
  return readTrimmedEnv('SERVER_NEXT_DATABASE_URL', 'DATABASE_URL');
}
/**
 * resolveServerNextGmPasswordEnvSource：执行核心业务逻辑。
 * @returns GmPasswordEnvSource | null。
 */


export function resolveServerNextGmPasswordEnvSource(): GmPasswordEnvSource | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (readTrimmedEnv('SERVER_NEXT_GM_PASSWORD')) {
    return 'SERVER_NEXT_GM_PASSWORD';
  }

  if (readTrimmedEnv('GM_PASSWORD')) {
    return 'GM_PASSWORD';
  }

  return null;
}
/**
 * resolveServerNextGmPassword：执行核心业务逻辑。
 * @param defaultValue 参数说明。
 * @returns string。
 */


export function resolveServerNextGmPassword(defaultValue = ''): string {
  return readTrimmedEnv('SERVER_NEXT_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}
/**
 * resolveServerNextUrlEnvSource：执行核心业务逻辑。
 * @returns ServerUrlEnvSource | null。
 */


export function resolveServerNextUrlEnvSource(): ServerUrlEnvSource | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (readTrimmedEnv('SERVER_NEXT_URL')) {
    return 'SERVER_NEXT_URL';
  }

  return null;
}
/**
 * resolveServerNextUrl：执行核心业务逻辑。
 * @returns string。
 */


export function resolveServerNextUrl(): string {
  return readTrimmedEnv('SERVER_NEXT_URL');
}
/**
 * resolveServerNextShadowUrlEnvSource：执行核心业务逻辑。
 * @returns ShadowUrlEnvSource | null。
 */


export function resolveServerNextShadowUrlEnvSource(): ShadowUrlEnvSource | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (readTrimmedEnv('SERVER_NEXT_SHADOW_URL')) {
    return 'SERVER_NEXT_SHADOW_URL';
  }

  if (readTrimmedEnv('SERVER_NEXT_URL')) {
    return 'SERVER_NEXT_URL';
  }

  return null;
}
/**
 * resolveServerNextShadowUrl：执行核心业务逻辑。
 * @returns string。
 */


export function resolveServerNextShadowUrl(): string {
  return readTrimmedEnv('SERVER_NEXT_SHADOW_URL', 'SERVER_NEXT_URL');
}
