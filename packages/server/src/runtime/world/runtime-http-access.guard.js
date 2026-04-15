"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeHttpAccessGuard = void 0;
exports.resolveRuntimeHttpAccessPolicy = resolveRuntimeHttpAccessPolicy;

const common_1 = require("@nestjs/common");

const RUNTIME_HTTP_ENABLE_ENV_KEYS = [
    'SERVER_NEXT_RUNTIME_HTTP',
    'SERVER_NEXT_RUNTIME_HTTP_ENABLED',
    'SERVER_NEXT_ENABLE_RUNTIME_HTTP',
];

const RUNTIME_HTTP_TOKEN_ENV_KEYS = [
    'SERVER_NEXT_RUNTIME_ADMIN_TOKEN',
    'SERVER_NEXT_RUNTIME_HTTP_TOKEN',
];

const TRUE_FLAG_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);

const FALSE_FLAG_VALUES = new Set(['0', 'false', 'no', 'off', 'disable', 'disabled']);

let RuntimeHttpAccessGuard = class RuntimeHttpAccessGuard {
    /** 启动时解析并缓存 runtime HTTP 的访问策略。 */
    policy = resolveRuntimeHttpAccessPolicy(process.env);
    /** 检查请求是否允许访问 runtime HTTP 接口，并校验管理口令。 */
    canActivate(context) {
        if (!this.policy.enabled) {
            throw new common_1.ServiceUnavailableException('runtime debug HTTP is disabled; set SERVER_NEXT_RUNTIME_HTTP=1 to enable it explicitly');
        }
        if (this.policy.token === null) {
            return true;
        }

        const request = context.switchToHttp().getRequest();

        const token = readRuntimeAdminToken(request.headers);
        if (token !== this.policy.token) {
            throw new common_1.UnauthorizedException('runtime debug HTTP requires a valid x-runtime-admin-token header or Authorization: Bearer <token>');
        }
        return true;
    }
};
exports.RuntimeHttpAccessGuard = RuntimeHttpAccessGuard;
exports.RuntimeHttpAccessGuard = RuntimeHttpAccessGuard = __decorate([
    (0, common_1.Injectable)()
], RuntimeHttpAccessGuard);
/** 解析运行时 HTTP 访问策略，按显式配置优先，再回退测试环境自动放开。 */
function resolveRuntimeHttpAccessPolicy(env) {

    const explicitEnabled = readFirstBooleanFlag(env, RUNTIME_HTTP_ENABLE_ENV_KEYS);
    if (explicitEnabled !== undefined) {
        return {
            enabled: explicitEnabled,
            token: readFirstToken(env, RUNTIME_HTTP_TOKEN_ENV_KEYS),
        };
    }
    return {
        enabled: isRuntimeHttpAutoEnabledForTest(env),
        token: readFirstToken(env, RUNTIME_HTTP_TOKEN_ENV_KEYS),
    };
}
/** 在 test / verify / smoke 场景自动开启 runtime HTTP，便于验证链路。 */
function isRuntimeHttpAutoEnabledForTest(env) {

    const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
    if (nodeEnv === 'test') {
        return true;
    }

    const lifecycleEvent = env.npm_lifecycle_event?.trim().toLowerCase() ?? '';
    return lifecycleEvent === 'verify'
        || lifecycleEvent === 'build'
        || lifecycleEvent === 'smoke:all'
        || lifecycleEvent === 'smoke:all:with-db'
        || lifecycleEvent.startsWith('smoke:');
}
/** 从请求头读取管理 token（x-runtime-admin-token 或 Authorization）。 */
function readRuntimeAdminToken(headers) {
    if (!headers) {
        return null;
    }

    const directHeader = normalizeHeaderValue(headers['x-runtime-admin-token']);
    if (directHeader !== null) {
        return directHeader;
    }

    const authorization = normalizeHeaderValue(headers.authorization);
    if (authorization === null) {
        return null;
    }
    const [scheme, ...rest] = authorization.split(' ');
    if (scheme.toLowerCase() !== 'bearer') {
        return null;
    }

    const token = rest.join(' ').trim();
    return token.length > 0 ? token : null;
}
/** 规范化 header 值，去空白后返回字符串或 null。 */
function normalizeHeaderValue(value) {
    if (typeof value === 'string') {

        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
    }
    if (Array.isArray(value)) {
        for (const entry of value) {
            const normalized = entry.trim();
            if (normalized.length > 0) {
                return normalized;
            }
        }
    }
    return null;
}
/** 按给定优先级读取第一个存在且可解析的布尔开关。 */
function readFirstBooleanFlag(env, keys) {
    for (const key of keys) {
        const rawValue = env[key];
        if (rawValue === undefined) {
            continue;
        }
        return parseBooleanFlag(rawValue);
    }
    return undefined;
}
/** 解析布尔环境变量取值（true/false）并兜底为 false。 */
function parseBooleanFlag(value) {

    const normalized = value.trim().toLowerCase();
    if (TRUE_FLAG_VALUES.has(normalized)) {
        return true;
    }
    if (FALSE_FLAG_VALUES.has(normalized)) {
        return false;
    }
    return false;
}
/** 按优先级返回首个非空 token。 */
function readFirstToken(env, keys) {
    for (const key of keys) {
        const rawValue = env[key];
        if (rawValue === undefined) {
            continue;
        }

        const token = rawValue.trim();
        if (token.length > 0) {
            return token;
        }
    }
    return null;
}
//# sourceMappingURL=runtime-http-access.guard.js.map

