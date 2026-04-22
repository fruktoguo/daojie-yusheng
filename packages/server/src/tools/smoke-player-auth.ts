// @ts-nocheck

/**
 * 用途：为 smoke 脚本生成玩家身份与访问令牌。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.flushRegisteredSmokePlayers = exports.registerSmokePlayerForCleanup = exports.registerAndLoginSmokePlayer = exports.createSmokePlayerIdentity = void 0;
const node_crypto_1 = require("node:crypto");
const env_alias_1 = require("../config/env-alias");
const smoke_player_cleanup_1 = require("./smoke-player-cleanup");
const ACCESS_KIND = 'access';
/**
 * 记录next令牌issuer。
 */
const TOKEN_ISSUER = 'server';
/**
 * 记录next令牌version。
 */
const TOKEN_VERSION = 1;
/**
 * 记录accessexpiresseconds。
 */
const ACCESS_EXPIRES_SECONDS = 15 * 60;
/**
 * 记录玩家令牌secret环境变量keys。
 */
const PLAYER_TOKEN_SECRET_ENV_KEYS = [
    'SERVER_PLAYER_TOKEN_SECRET',
    'SERVER_PLAYER_TOKEN_SECRET',
];
const SMOKE_PLAYER_CLEANUP_SIGNAL_EXIT_CODES = Object.freeze({
    SIGINT: 130,
    SIGTERM: 143,
});
const registeredSmokePlayers = new Map();
let smokePlayerCleanupHooksInstalled = false;
let smokePlayerCleanupPromise = null;
/**
 * 创建smoke 校验玩家identity。
 */
function createSmokePlayerIdentity(playerId, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录normalized玩家ID。
 */
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
        throw new Error('smoke playerId is required');
    }
/**
 * 记录normalizedlabel。
 */
    const normalizedLabel = typeof options?.label === 'string' && options.label.trim()
        ? options.label.trim()
        : 'smoke';
/**
 * 记录normalizedseed。
 */
    const normalizedSeed = sanitizeForTokenId(normalizedPlayerId);
/**
 * 记录userID。
 */
    const userId = typeof options?.userId === 'string' && options.userId.trim()
        ? options.userId.trim()
        : `${normalizedLabel}_user_${normalizedSeed}`;
/**
 * 记录username。
 */
    const username = typeof options?.username === 'string' && options.username.trim()
        ? options.username.trim()
        : `${normalizedLabel}_${normalizedSeed}`;
/**
 * 记录显示信息名称。
 */
    const displayName = typeof options?.displayName === 'string' && options.displayName.trim()
        ? options.displayName.trim()
        : normalizedPlayerId;
/**
 * 记录玩家名称。
 */
    const playerName = typeof options?.playerName === 'string' && options.playerName.trim()
        ? options.playerName.trim()
        : displayName;
    return {
        userId,
        username,
        displayName,
        playerName,
        playerId: normalizedPlayerId,
        token: issuePlayerAccessToken({
            sub: userId,
            username,
            displayName,
            playerId: normalizedPlayerId,
            playerName,
        }),
    };
}
exports.createSmokePlayerIdentity = createSmokePlayerIdentity;
/**
 * 通过正式认证接口注册并登录 smoke 玩家，返回访问令牌。
 */
async function registerAndLoginSmokePlayer(baseUrl, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录标准化baseUrl。
 */
    const normalizedBaseUrl = String(baseUrl ?? '').trim().replace(/\/+$/, '');
    if (!normalizedBaseUrl) {
        throw new Error('smoke auth baseUrl is required');
    }
/**
 * 记录account前缀。
 */
    const accountPrefix = sanitizeAccountPrefix(options?.accountPrefix);
/**
 * 记录role前缀。
 */
    const rolePrefix = sanitizeRolePrefix(options?.rolePrefix);
/**
 * 记录seed。
 */
    const seed = buildSeed(options?.seed);
    for (let attempt = 0; attempt < 32; attempt += 1) {
/**
 * 记录account名称。
 */
        const accountName = buildAccountName(accountPrefix, seed, attempt);
/**
 * 记录password。
 */
        const password = `Pass_${seed}${attempt === 0 ? '' : attempt.toString(36)}`.slice(0, 32);
/**
 * 记录显示信息名称。
 */
        const displayName = buildDisplayName(seed, attempt);
/**
 * 记录角色名。
 */
        const roleName = buildRoleName(rolePrefix, seed, attempt);
        try {
            await requestJson(normalizedBaseUrl, '/api/auth/register', {
                method: 'POST',
                body: {
                    accountName,
                    password,
                    displayName,
                    roleName,
                },
            });
/**
 * 记录login。
 */
            const login = await requestJson(normalizedBaseUrl, '/api/auth/login', {
                method: 'POST',
                body: {
                    loginName: accountName,
                    password,
                },
            });
/**
 * 记录access令牌。
 */
            const accessToken = typeof login?.accessToken === 'string' ? login.accessToken.trim() : '';
/**
 * 记录refresh令牌。
 */
            const refreshToken = typeof login?.refreshToken === 'string' ? login.refreshToken.trim() : '';
            if (!accessToken) {
                throw new Error(`unexpected login payload: ${JSON.stringify(login)}`);
            }
/**
 * 记录payload。
 */
            const payload = parseJwtPayload(accessToken);
/**
 * 记录玩家ID。
 */
            const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
/**
 * 记录玩家名称。
 */
            const playerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : '';
            if (!playerId || !playerName) {
                throw new Error(`smoke auth token missing player identity: ${JSON.stringify(payload)}`);
            }
            registerSmokePlayerForCleanup(playerId, {
                serverUrl: normalizedBaseUrl,
                databaseUrl: (0, env_alias_1.resolveServerDatabaseUrl)(),
            });
            return {
                accessToken,
                refreshToken,
                accountName,
                password,
                displayName,
                roleName,
                playerId,
                playerName,
            };
        }
        catch (error) {
            if (!isRegisterConflictError(error) || attempt >= 31) {
                throw error;
            }
        }
    }
    throw new Error(`registerAndLoginSmokePlayer exhausted retries: seed=${seed}`);
}
exports.registerAndLoginSmokePlayer = registerAndLoginSmokePlayer;
/**
 * 登记 smoke 玩家，便于脚本退出时统一清理。
 */
function registerSmokePlayerForCleanup(playerId, options = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId) {
        return '';
    }
    installSmokePlayerCleanupHooks();
    registeredSmokePlayers.set(normalizedPlayerId, {
        serverUrl: normalizeOptionalString(options?.serverUrl),
        databaseUrl: normalizeOptionalString(options?.databaseUrl) || (0, env_alias_1.resolveServerDatabaseUrl)(),
    });
    return normalizedPlayerId;
}
exports.registerSmokePlayerForCleanup = registerSmokePlayerForCleanup;
/**
 * 执行当前进程已登记 smoke 玩家的统一清理。
 */
async function flushRegisteredSmokePlayers() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (registeredSmokePlayers.size === 0) {
        return {
            ok: true,
            deletedPlayers: 0,
            failures: [],
        };
    }
    if (smokePlayerCleanupPromise) {
        return smokePlayerCleanupPromise;
    }
    smokePlayerCleanupPromise = (async () => {
        const entries = Array.from(registeredSmokePlayers.entries());
        registeredSmokePlayers.clear();
        const failures = [];
        let deletedPlayers = 0;
        for (const [registeredPlayerId, options] of entries) {
            try {
                await (0, smoke_player_cleanup_1.purgeSmokePlayerArtifactsByPlayerId)(registeredPlayerId, options);
                deletedPlayers += 1;
            }
            catch (error) {
                failures.push({
                    playerId: registeredPlayerId,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return {
            ok: failures.length === 0,
            deletedPlayers,
            failures,
        };
    })();
    try {
        return await smokePlayerCleanupPromise;
    }
    finally {
        smokePlayerCleanupPromise = null;
    }
}
exports.flushRegisteredSmokePlayers = flushRegisteredSmokePlayers;
/**
 * 处理issue玩家access令牌。
 */
function issuePlayerAccessToken(payload) {
/**
 * 记录now。
 */
    const now = Math.floor(Date.now() / 1000);
/**
 * 记录secret。
 */
    const secret = resolveSigningSecret();
/**
 * 记录header。
 */
    const header = base64UrlEncode(Buffer.from(JSON.stringify({
        alg: 'HS256',
        typ: 'JWT',
    }), 'utf8'));
/**
 * 记录请求体。
 */
    const body = base64UrlEncode(Buffer.from(JSON.stringify({
        iss: TOKEN_ISSUER,
        aud: 'player',
        ver: TOKEN_VERSION,
        kind: ACCESS_KIND,
        scope: ACCESS_KIND,
        sub: payload.sub,
        username: payload.username,
        displayName: payload.displayName,
        playerId: payload.playerId,
        playerName: payload.playerName,
        iat: now,
        nbf: now,
        exp: now + ACCESS_EXPIRES_SECONDS,
    }), 'utf8'));
/**
 * 记录signature。
 */
    const signature = base64UrlEncode((0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${header}.${body}`)
        .digest());
    return `${header}.${body}.${signature}`;
}
/**
 * 解析signingsecret。
 */
function resolveSigningSecret() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    for (const key of PLAYER_TOKEN_SECRET_ENV_KEYS) {
/**
 * 记录价值。
 */
        const value = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
        if (value) {
            return value;
        }
    }
    return 'daojie-yusheng-dev-secret';
}
function normalizeOptionalString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function installSmokePlayerCleanupHooks() {
    if (smokePlayerCleanupHooksInstalled) {
        return;
    }
    smokePlayerCleanupHooksInstalled = true;
    process.once('beforeExit', () => {
        void flushRegisteredSmokePlayers().catch(reportSmokeCleanupError);
    });
    process.once('SIGINT', () => {
        void flushRegisteredSmokePlayers()
            .catch(reportSmokeCleanupError)
            .finally(() => {
            process.exit(SMOKE_PLAYER_CLEANUP_SIGNAL_EXIT_CODES.SIGINT);
        });
    });
    process.once('SIGTERM', () => {
        void flushRegisteredSmokePlayers()
            .catch(reportSmokeCleanupError)
            .finally(() => {
            process.exit(SMOKE_PLAYER_CLEANUP_SIGNAL_EXIT_CODES.SIGTERM);
        });
    });
    process.once('uncaughtException', (error) => {
        reportSmokeCleanupError(error);
        void flushRegisteredSmokePlayers()
            .catch(reportSmokeCleanupError)
            .finally(() => {
            process.exit(1);
        });
    });
    process.once('unhandledRejection', (reason) => {
        reportSmokeCleanupError(reason);
        void flushRegisteredSmokePlayers()
            .catch(reportSmokeCleanupError)
            .finally(() => {
            process.exit(1);
        });
    });
}
function reportSmokeCleanupError(error) {
    console.error('[smoke cleanup]', error instanceof Error ? (error.stack || error.message) : String(error));
}
/**
 * 处理sanitizefor令牌ID。
 */
function sanitizeForTokenId(value) {
/**
 * 记录sanitized。
 */
    const sanitized = String(value)
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    return sanitized || `player_${Date.now().toString(36)}`;
}
/**
 * 统一生成 smoke 注册 seed，避免账号与角色名冲突。
 */
function buildSeed(value) {
/**
 * 记录normalized。
 */
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized) {
        return sanitizeForTokenId(normalized);
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
/**
 * 清洗账号名前缀，避免超长或非法字符。
 */
function sanitizeAccountPrefix(value) {
/**
 * 记录normalized。
 */
    const normalized = typeof value === 'string'
        ? value.trim().replace(/[^a-zA-Z0-9]+/g, '').slice(0, 8)
        : '';
    return normalized || 'sm';
}
/**
 * 清洗角色名前缀。
 */
function sanitizeRolePrefix(value) {
/**
 * 记录normalized。
 */
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized ? normalized.slice(0, 4) : '烟';
}
/**
 * 构建 smoke 账号名。
 */
function buildAccountName(prefix, seed, attempt) {
/**
 * 记录suffix。
 */
    const suffix = attempt === 0 ? seed : `${seed}${attempt.toString(36)}`;
    return `${prefix}_${suffix}`.slice(0, 20);
}
/**
 * 生成满足现有注册约束的单字显示名。
 */
function buildDisplayName(seed, attempt) {
/**
 * 记录source。
 */
    const source = `${seed}:${attempt}`;
/**
 * 记录hash。
 */
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
        hash = (hash * 131 + source.charCodeAt(index)) >>> 0;
    }
    return String.fromCodePoint(0x4e00 + (hash % (0x9fff - 0x4e00 + 1)));
}
/**
 * 构建 smoke 角色名。
 */
function buildRoleName(prefix, seed, attempt) {
/**
 * 记录suffix。
 */
    const suffix = attempt === 0 ? seed.slice(-4) : `${seed}${attempt.toString(36)}`.slice(-4);
    return `${prefix}${suffix}`.slice(0, 12);
}
/**
 * 判断注册失败是否属于名称冲突，可安全重试。
 */
function isRegisterConflictError(error) {
/**
 * 记录message。
 */
    const message = error instanceof Error ? error.message : String(error);
    return /已存在|already exists|duplicate|账号|角色名|显示名称|称号/i.test(message);
}
/**
 * 解析 JWT payload，提取 playerId 等字段。
 */
function parseJwtPayload(token) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const parts = String(token ?? '').split('.');
    if (parts.length < 2 || !parts[1]) {
        return null;
    }
    try {
/**
 * 记录normalized。
 */
        const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
/**
 * 记录padded。
 */
        const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    }
    catch {
        return null;
    }
}
/**
 * 统一执行 smoke 认证请求。
 */
async function requestJson(baseUrl, path, init = undefined) {
/**
 * 记录body。
 */
    const body = init?.body === undefined ? undefined : JSON.stringify(init.body);
/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}${path}`, {
        method: init?.method ?? 'GET',
        headers: body === undefined ? undefined : {
            'content-type': 'application/json',
        },
        body,
    });
    if (!response.ok) {
        throw new Error(`request failed: ${init?.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`);
    }
    if (response.status === 204) {
        return null;
    }
    return response.json();
}
/**
 * 处理base64URLencode。
 */
function base64UrlEncode(value) {
    return value
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

export { createSmokePlayerIdentity, registerAndLoginSmokePlayer, registerSmokePlayerForCleanup, flushRegisteredSmokePlayers };
