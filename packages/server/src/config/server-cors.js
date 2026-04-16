"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveServerNextCorsOptions = void 0;
const env_alias_1 = require("./env-alias");
const DEVELOPMENT_LIKE_ENVS = new Set(['', 'development', 'dev', 'local', 'test']);
const DEFAULT_CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_CORS_HEADERS = ['Content-Type', 'Authorization', 'X-Requested-With'];
/** 统一解析 server-next 的 HTTP / Socket CORS 配置。 */
function resolveServerNextCorsOptions() {
    const enabled = readBooleanEnv(['SERVER_NEXT_CORS_ENABLED', 'NEXT_CORS_ENABLED'], true);
    if (!enabled) {
        return false;
    }
    const allowedOrigins = readCsvEnv('SERVER_NEXT_CORS_ORIGINS', 'NEXT_CORS_ORIGINS');
    const methods = readCsvEnv('SERVER_NEXT_CORS_METHODS', 'NEXT_CORS_METHODS', DEFAULT_CORS_METHODS);
    const allowedHeaders = readCsvEnv('SERVER_NEXT_CORS_HEADERS', 'NEXT_CORS_HEADERS', DEFAULT_CORS_HEADERS);
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
exports.resolveServerNextCorsOptions = resolveServerNextCorsOptions;
function buildOriginResolver(allowedOriginSet) {
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
function isDevelopmentLikeEnv() {
    const runtimeEnv = (0, env_alias_1.readTrimmedEnv)('SERVER_NEXT_RUNTIME_ENV', 'APP_ENV', 'NODE_ENV').toLowerCase();
    return DEVELOPMENT_LIKE_ENVS.has(runtimeEnv);
}
function isLocalOrigin(origin) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
}
function normalizeOrigin(origin) {
    return typeof origin === 'string' ? origin.trim().replace(/\/+$/, '') : '';
}
function readCsvEnv(...args) {
    const fallback = Array.isArray(args[args.length - 1]) ? args.pop() : [];
    const names = args;
    const raw = (0, env_alias_1.readTrimmedEnv)(...names);
    if (!raw) {
        return [...fallback];
    }
    return raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
}
function readBooleanEnv(names, fallback) {
    const raw = (0, env_alias_1.readTrimmedEnv)(...names);
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
