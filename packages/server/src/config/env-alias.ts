/**
 * 环境变量别名解析：统一处理服务端各组件（数据库、Redis、GM、URL）的环境变量读取。
 * 每个配置项支持多个别名（如 SERVER_DATABASE_URL / DATABASE_URL），按优先级依次查找。
 * 同时提供 env source 查询，供 readiness 和诊断报告使用。
 */
import './load-local-runtime-env';

type DatabaseEnvSource = 'SERVER_DATABASE_URL' | 'DATABASE_URL';
type DatabasePoolerEnvSource = 'SERVER_DATABASE_POOLER_URL' | 'DATABASE_POOLER_URL';
type RedisUrlEnvSource = 'SERVER_REDIS_URL' | 'REDIS_URL';
type RedisModeEnvSource = 'SERVER_REDIS_MODE' | 'REDIS_MODE';
type PlayerTokenSecretEnvSource = 'SERVER_PLAYER_TOKEN_SECRET' | 'JWT_SECRET';
type GmAuthSecretEnvSource =
  | 'SERVER_GM_AUTH_SECRET'
  | 'GM_AUTH_SECRET'
  | PlayerTokenSecretEnvSource;
type SecretEncryptionKeyEnvSource =
  | 'SERVER_SECRET_ENCRYPTION_KEY'
  | 'SECRET_ENCRYPTION_KEY'
  | PlayerTokenSecretEnvSource;
type GmPasswordEnvSource = 'SERVER_GM_PASSWORD' | 'GM_PASSWORD';
type GmInsecureDefaultPasswordEnvSource =
  | 'SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD'
  | 'GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD';
type ServerUrlEnvSource = 'SERVER_URL';
type ShadowUrlEnvSource = 'SERVER_SHADOW_URL' | 'SERVER_URL';

/** 按优先级从多个环境变量名中读取第一个非空 trim 值 */
export function readTrimmedEnv(...names: string[]): string {

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
/** 返回数据库 URL 的环境变量来源名，供 readiness 诊断 */
export function resolveServerDatabaseEnvSource(): DatabaseEnvSource | null {

  if (readTrimmedEnv('SERVER_DATABASE_URL')) {
    return 'SERVER_DATABASE_URL';
  }

  if (readTrimmedEnv('DATABASE_URL')) {
    return 'DATABASE_URL';
  }

  return null;
}
/** 读取数据库连接 URL */
export function resolveServerDatabaseUrl(): string {
  return readTrimmedEnv('SERVER_DATABASE_URL', 'DATABASE_URL');
}
/** 返回 Pooler 数据库 URL 的环境变量来源名 */
export function resolveServerDatabasePoolerEnvSource(): DatabasePoolerEnvSource | null {
  if (readTrimmedEnv('SERVER_DATABASE_POOLER_URL')) {
    return 'SERVER_DATABASE_POOLER_URL';
  }

  if (readTrimmedEnv('DATABASE_POOLER_URL')) {
    return 'DATABASE_POOLER_URL';
  }

  return null;
}
/** 读取 Pooler 数据库连接 URL */
export function resolveServerDatabasePoolerUrl(): string {
  return readTrimmedEnv('SERVER_DATABASE_POOLER_URL', 'DATABASE_POOLER_URL');
}
/** 返回 Redis URL 的环境变量来源名 */
export function resolveServerRedisEnvSource(): RedisUrlEnvSource | null {
  if (readTrimmedEnv('SERVER_REDIS_URL')) {
    return 'SERVER_REDIS_URL';
  }

  if (readTrimmedEnv('REDIS_URL')) {
    return 'REDIS_URL';
  }

  return null;
}
/** 读取 Redis 连接 URL */
export function resolveServerRedisUrl(): string {
  return readTrimmedEnv('SERVER_REDIS_URL', 'REDIS_URL');
}
/** 返回 Redis 模式的环境变量来源名 */
export function resolveServerRedisModeEnvSource(): RedisModeEnvSource | null {
  if (readTrimmedEnv('SERVER_REDIS_MODE')) {
    return 'SERVER_REDIS_MODE';
  }

  if (readTrimmedEnv('REDIS_MODE')) {
    return 'REDIS_MODE';
  }

  return null;
}
/** 读取 Redis 运行模式（standalone / cluster 等） */
export function resolveServerRedisMode(): string {
  return readTrimmedEnv('SERVER_REDIS_MODE', 'REDIS_MODE');
}
/** 返回玩家 Token 签名密钥来源名。 */
export function resolveServerPlayerTokenSecretEnvSource(): PlayerTokenSecretEnvSource | null {
  if (readTrimmedEnv('SERVER_PLAYER_TOKEN_SECRET')) {
    return 'SERVER_PLAYER_TOKEN_SECRET';
  }

  if (readTrimmedEnv('JWT_SECRET')) {
    return 'JWT_SECRET';
  }

  return null;
}
/** 读取玩家 Token 签名密钥。 */
export function resolveServerPlayerTokenSecret(): string {
  return readTrimmedEnv('SERVER_PLAYER_TOKEN_SECRET', 'JWT_SECRET');
}
/** 返回 GM Token 签名密钥来源名；未显式配置时复用玩家 Token 签名密钥。 */
export function resolveServerGmAuthSecretEnvSource(): GmAuthSecretEnvSource | null {
  if (readTrimmedEnv('SERVER_GM_AUTH_SECRET')) {
    return 'SERVER_GM_AUTH_SECRET';
  }

  if (readTrimmedEnv('GM_AUTH_SECRET')) {
    return 'GM_AUTH_SECRET';
  }

  return resolveServerPlayerTokenSecretEnvSource();
}
/** 读取 GM Token 签名密钥；未显式配置时复用玩家 Token 签名密钥。 */
export function resolveServerGmAuthSecret(): string {
  return readTrimmedEnv('SERVER_GM_AUTH_SECRET', 'GM_AUTH_SECRET') || resolveServerPlayerTokenSecret();
}
/** 返回 GM 密钥管理主密钥来源名；未显式配置时复用玩家 Token 签名密钥。 */
export function resolveServerSecretEncryptionKeyEnvSource(): SecretEncryptionKeyEnvSource | null {
  if (readTrimmedEnv('SERVER_SECRET_ENCRYPTION_KEY')) {
    return 'SERVER_SECRET_ENCRYPTION_KEY';
  }

  if (readTrimmedEnv('SECRET_ENCRYPTION_KEY')) {
    return 'SECRET_ENCRYPTION_KEY';
  }

  return resolveServerPlayerTokenSecretEnvSource();
}
/** 读取 GM 密钥管理主密钥；未显式配置时复用玩家 Token 签名密钥。 */
export function resolveServerSecretEncryptionKey(): string {
  return readTrimmedEnv('SERVER_SECRET_ENCRYPTION_KEY', 'SECRET_ENCRYPTION_KEY') || resolveServerPlayerTokenSecret();
}
/** 返回 GM 密码的环境变量来源名 */
export function resolveServerGmPasswordEnvSource(): GmPasswordEnvSource | null {

  if (readTrimmedEnv('SERVER_GM_PASSWORD')) {
    return 'SERVER_GM_PASSWORD';
  }

  if (readTrimmedEnv('GM_PASSWORD')) {
    return 'GM_PASSWORD';
  }

  return null;
}
/** 读取 GM 密码，未配置时返回 defaultValue */
export function resolveServerGmPassword(defaultValue = ''): string {
  return readTrimmedEnv('SERVER_GM_PASSWORD', 'GM_PASSWORD') || defaultValue;
}
/** 返回"允许本地不安全 GM 密码"开关的环境变量来源名 */
export function resolveServerAllowInsecureLocalGmPasswordEnvSource(): GmInsecureDefaultPasswordEnvSource | null {
  if (readTrimmedEnv('SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD')) {
    return 'SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD';
  }

  if (readTrimmedEnv('GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD')) {
    return 'GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD';
  }

  return null;
}
/** 是否允许本地开发使用不安全的默认 GM 密码 */
export function resolveServerAllowInsecureLocalGmPassword(): boolean {
  return readBooleanEnv('SERVER_ALLOW_INSECURE_LOCAL_GM_PASSWORD', 'GM_ALLOW_INSECURE_LOCAL_GM_PASSWORD');
}
/** 返回服务端公开 URL 的环境变量来源名 */
export function resolveServerUrlEnvSource(): ServerUrlEnvSource | null {

  if (readTrimmedEnv('SERVER_URL')) {
    return 'SERVER_URL';
  }

  return null;
}
/** 读取服务端公开 URL */
export function resolveServerUrl(): string {
  return readTrimmedEnv('SERVER_URL');
}
/** 返回影子验证 URL 的环境变量来源名（回退到 SERVER_URL） */
export function resolveServerShadowUrlEnvSource(): ShadowUrlEnvSource | null {

  if (readTrimmedEnv('SERVER_SHADOW_URL')) {
    return 'SERVER_SHADOW_URL';
  }

  if (readTrimmedEnv('SERVER_URL')) {
    return 'SERVER_URL';
  }

  return null;
}
/** 读取影子验证 URL，回退到 SERVER_URL */
export function resolveServerShadowUrl(): string {
  return readTrimmedEnv('SERVER_SHADOW_URL', 'SERVER_URL');
}
/** 从多个环境变量别名中读取布尔值（1/true/yes/on 为 true） */
export function readBooleanEnv(...names: string[]): boolean {
  const rawValue = readTrimmedEnv(...names).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(rawValue);
}
