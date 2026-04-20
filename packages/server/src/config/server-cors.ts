import { readTrimmedEnv } from './env-alias';

const DEVELOPMENT_LIKE_ENVS = new Set(['', 'development', 'dev', 'local', 'test']);
const DEFAULT_CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_CORS_HEADERS = ['Content-Type', 'Authorization', 'X-Requested-With'];
/**
 * CorsOriginCallback：统一结构类型，保证协议与运行时一致性。
 */


type CorsOriginCallback = (error: Error | null, allow?: boolean) => void;
/**
 * CorsOriginResolver：统一结构类型，保证协议与运行时一致性。
 */

type CorsOriginResolver = (origin: string | undefined, callback: CorsOriginCallback) => void;
/**
 * ServerNextCorsOptions：定义接口结构约束，明确可交付字段含义。
 */


export interface ServerNextCorsOptions {
/**
 * origin：ServerNextCorsOptions 内部字段。
 */

  origin: CorsOriginResolver;  
  /**
 * methods：ServerNextCorsOptions 内部字段。
 */

  methods: string[];  
  /**
 * allowedHeaders：ServerNextCorsOptions 内部字段。
 */

  allowedHeaders: string[];  
  /**
 * credentials：ServerNextCorsOptions 内部字段。
 */

  credentials: boolean;
}

/** 统一解析 server-next 的 HTTP / Socket CORS 配置。 */
export function resolveServerNextCorsOptions(): ServerNextCorsOptions | false {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const enabled = readBooleanEnv(['SERVER_NEXT_CORS_ENABLED', 'NEXT_CORS_ENABLED'], true);
  if (!enabled) {
    return false;
  }

  const allowedOrigins = readCsvEnv(['SERVER_NEXT_CORS_ORIGINS', 'NEXT_CORS_ORIGINS']);
  const methods = readCsvEnv(['SERVER_NEXT_CORS_METHODS', 'NEXT_CORS_METHODS'], DEFAULT_CORS_METHODS);
  const allowedHeaders = readCsvEnv(['SERVER_NEXT_CORS_HEADERS', 'NEXT_CORS_HEADERS'], DEFAULT_CORS_HEADERS);
  const credentials = readBooleanEnv(['SERVER_NEXT_CORS_CREDENTIALS', 'NEXT_CORS_CREDENTIALS'], false);

  if (allowedOrigins.length === 0 && !isDevelopmentLikeEnv()) {
    throw new Error('非开发环境必须显式配置 SERVER_NEXT_CORS_ORIGINS 或 NEXT_CORS_ORIGINS，禁止继续使用全开 CORS。');
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
/**
 * buildOriginResolver：构建并返回目标对象。
 * @param allowedOriginSet Set<string> 参数说明。
 * @returns CorsOriginResolver。
 */


function buildOriginResolver(allowedOriginSet: Set<string>): CorsOriginResolver {
  const allowAll = allowedOriginSet.has('*');
  const developmentLike = isDevelopmentLikeEnv();

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (allowAll || allowedOriginSet.has(normalizedOrigin) || (developmentLike && isLocalOrigin(normalizedOrigin))) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by server-next CORS policy.`), false);
  };
}
/**
 * isDevelopmentLikeEnv：执行状态校验并返回判断结果。
 * @returns boolean。
 */


function isDevelopmentLikeEnv(): boolean {
  const runtimeEnv = readTrimmedEnv('SERVER_NEXT_RUNTIME_ENV', 'APP_ENV', 'NODE_ENV').toLowerCase();
  return DEVELOPMENT_LIKE_ENVS.has(runtimeEnv);
}
/**
 * isLocalOrigin：执行状态校验并返回判断结果。
 * @param origin string 参数说明。
 * @returns boolean。
 */


function isLocalOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
}
/**
 * normalizeOrigin：执行核心业务逻辑。
 * @param origin string 参数说明。
 * @returns string。
 */


function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}
/**
 * readCsvEnv：执行核心业务逻辑。
 * @param names string[] 参数说明。
 * @param fallback string[] 参数说明。
 * @returns string[]。
 */


function readCsvEnv(names: string[], fallback: string[] = []): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const raw = readTrimmedEnv(...names);
  if (!raw) {
    return [...fallback];
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}
/**
 * readBooleanEnv：执行核心业务逻辑。
 * @param names string[] 参数说明。
 * @param fallback boolean 参数说明。
 * @returns boolean。
 */


function readBooleanEnv(names: string[], fallback: boolean): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
