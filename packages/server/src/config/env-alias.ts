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
 * resolveServerNextDatabaseEnvSource：规范化或转换ServerNextDatabaseEnv来源。
 * @returns 返回ServerNextDatabaseEnv来源。
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
 * resolveServerNextDatabaseUrl：规范化或转换ServerNextDatabaseUrl。
 * @returns 返回ServerNextDatabaseUrl。
 */


export function resolveServerNextDatabaseUrl(): string {
  return readTrimmedEnv('SERVER_NEXT_DATABASE_URL', 'DATABASE_URL');
}
/**
 * resolveServerNextGmPasswordEnvSource：规范化或转换ServerNextGMPasswordEnv来源。
 * @returns 返回ServerNextGMPasswordEnv来源。
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
 * resolveServerNextGmPassword：规范化或转换ServerNextGMPassword。
 * @param defaultValue 参数说明。
 * @returns 返回ServerNextGMPassword。
 */


export function resolveServerNextGmPassword(defaultValue = ''): string {
  return readTrimmedEnv('SERVER_NEXT_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}
/**
 * resolveServerNextUrlEnvSource：规范化或转换ServerNextUrlEnv来源。
 * @returns 返回ServerNextUrlEnv来源。
 */


export function resolveServerNextUrlEnvSource(): ServerUrlEnvSource | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (readTrimmedEnv('SERVER_NEXT_URL')) {
    return 'SERVER_NEXT_URL';
  }

  return null;
}
/**
 * resolveServerNextUrl：规范化或转换ServerNextUrl。
 * @returns 返回ServerNextUrl。
 */


export function resolveServerNextUrl(): string {
  return readTrimmedEnv('SERVER_NEXT_URL');
}
/**
 * resolveServerNextShadowUrlEnvSource：规范化或转换ServerNextShadowUrlEnv来源。
 * @returns 返回ServerNextShadowUrlEnv来源。
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
 * resolveServerNextShadowUrl：规范化或转换ServerNextShadowUrl。
 * @returns 返回ServerNextShadowUrl。
 */


export function resolveServerNextShadowUrl(): string {
  return readTrimmedEnv('SERVER_NEXT_SHADOW_URL', 'SERVER_NEXT_URL');
}
