/**
 * 本文件负责服务端运行配置的解析或角色判断，是启动期配置边界的一部分。
 *
 * 维护时要让默认值对生产环境友好，并避免把临时本地配置误当作线上真源。
 */
/**
 * 服务端 CORS 配置解析：从环境变量读取允许的 origin、方法和头部，
 * 构建运行时 origin 校验器。开发环境自动放行 localhost，
 * 非开发环境强制要求显式配置 origin 白名单。
 */
import { readTrimmedEnv } from './env-alias';

const DEVELOPMENT_LIKE_ENVS = new Set(['development', 'dev', 'local', 'test']);
const DEFAULT_CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_CORS_HEADERS = ['Content-Type', 'Authorization', 'X-Requested-With'];

/** CORS origin 校验回调签名 */
type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;

/** CORS origin 动态校验函数签名 */
type CorsOriginResolver = (origin: string | undefined, callback: CorsOriginCallback) => void;

/** 服务端 CORS 配置选项，传递给 NestJS enableCors */
export interface ServerNextCorsOptions {
  /** 动态 origin 校验器 */
  origin: CorsOriginResolver;
  /** 允许的 HTTP 方法列表 */
  methods: string[];
  /** 允许的请求头列表 */
  allowedHeaders: string[];
  /** 是否允许携带凭证 */
  credentials: boolean;
}

/** 解析环境变量并构建 CORS 配置；禁用时返回 false。 */
export function resolveServerCorsOptions(): ServerNextCorsOptions | false {
  const enabled = readBooleanEnv(['SERVER_CORS_ENABLED', 'CORS_ENABLED'], true);
  if (!enabled) {
    return false;
  }

  const allowedOrigins = readCsvEnv(['SERVER_CORS_ORIGINS', 'CORS_ORIGINS']);
  const methods = readCsvEnv(['SERVER_CORS_METHODS', 'CORS_METHODS'], DEFAULT_CORS_METHODS);
  const allowedHeaders = readCsvEnv(['SERVER_CORS_HEADERS', 'CORS_HEADERS'], DEFAULT_CORS_HEADERS);
  const credentials = readBooleanEnv(['SERVER_CORS_CREDENTIALS', 'CORS_CREDENTIALS'], false);

  // 非开发环境必须显式配置白名单，防止生产全开
  if (allowedOrigins.length === 0 && !isDevelopmentLikeEnv()) {
    throw new Error('非开发环境必须显式配置 SERVER_CORS_ORIGINS 或 CORS_ORIGINS，禁止继续使用全开 CORS。');
  }

  const allowedOriginSet = new Set(allowedOrigins.map(normalizeOrigin).filter(Boolean));
  const origin = buildOriginResolver(allowedOriginSet);

  return {
    origin,
    methods,
    allowedHeaders,
    credentials,
  };
}

/** 构建 origin 动态校验闭包：白名单匹配 + 开发环境本地来源放行 */
function buildOriginResolver(allowedOriginSet: Set<string>): CorsOriginResolver {
  const allowAll = allowedOriginSet.has('*');
  const developmentLike = isDevelopmentLikeEnv();

  return (origin, callback) => {
    // 无 origin（同源请求或服务端调用）直接放行
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (allowAll || allowedOriginSet.has(normalizedOrigin) || (developmentLike && isDevelopmentLocalOrigin(normalizedOrigin))) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by server CORS policy.`), false);
  };
}

/** 判断当前运行环境是否为开发类环境 */
function isDevelopmentLikeEnv(): boolean {
  const runtimeEnv = readTrimmedEnv('SERVER_RUNTIME_ENV', 'APP_ENV', 'NODE_ENV').toLowerCase();
  return DEVELOPMENT_LIKE_ENVS.has(runtimeEnv);
}
/** 判断 origin 是否为开发本地来源（localhost、回环地址或 /etc/hosts 常用单标签别名） */
function isDevelopmentLocalOrigin(origin: string): boolean {
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.trim();
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && hostname.length > 0
      && !hostname.includes('.')
      && hostname !== '0.0.0.0'
      && hostname !== '[::]';
  } catch {
    return false;
  }
}
/** 去除 origin 尾部斜杠并 trim */
function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}
/** 从环境变量读取逗号分隔列表，支持多别名回退 */
function readCsvEnv(names: string[], fallback: string[] = []): string[] {

  const raw = readTrimmedEnv(...names);
  if (!raw) {
    return [...fallback];
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}
/** 从环境变量读取布尔值，支持 1/true/yes/on 等常见写法 */
function readBooleanEnv(names: string[], fallback: boolean): boolean {

  const raw = readTrimmedEnv(...names);
  if (!raw) {
    return fallback;
  }

  const normalized = raw.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}
