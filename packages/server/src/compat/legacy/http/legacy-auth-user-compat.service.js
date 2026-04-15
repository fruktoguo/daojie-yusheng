"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyAuthUserCompatService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** legacy_account_validation_1：定义该变量以承载业务值。 */
const legacy_account_validation_1 = require("../legacy-account-validation");
/** legacy_auth_service_1：定义该变量以承载业务值。 */
const legacy_auth_service_1 = require("../legacy-auth.service");
/** ALLOW_LEGACY_HTTP_MEMORY_FALLBACK_ENV_KEYS：定义该变量以承载业务值。 */
const ALLOW_LEGACY_HTTP_MEMORY_FALLBACK_ENV_KEYS = [
    'SERVER_NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK',
    'NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK',
];
/** LegacyAuthUserCompatService：定义该变量以承载业务值。 */
let LegacyAuthUserCompatService = class LegacyAuthUserCompatService {
    logger = new common_1.Logger(LegacyAuthUserCompatService.name);
    legacyAuthService;
    memoryUsersById = new Map();
    memoryUserIdByUsername = new Map();
/** 构造函数：执行实例初始化流程。 */
    constructor(legacyAuthService) {
        this.legacyAuthService = legacyAuthService;
    }
/** ensureLegacyHttpMemoryFallbackEnabled：执行对应的业务逻辑。 */
    ensureLegacyHttpMemoryFallbackEnabled() {
        if (isLegacyHttpMemoryFallbackEnabled()) {
            return;
        }
        this.logger.warn('旧鉴权 HTTP 内存回退已拦截：没有 legacy 数据库，且 compat 内存回退已禁用');
        throw new common_1.ServiceUnavailableException('legacy HTTP 内存兼容已关闭');
    }
/** ensureAvailable：执行对应的业务逻辑。 */
    async ensureAvailable(value, requestedKind, options = {}) {
        if (requestedKind === 'display' && (0, shared_1.isDuplicateFriendlyDisplayName)(value)) {
            return null;
        }
/** conflict：定义该变量以承载业务值。 */
        const conflict = await this.findConflict(value, requestedKind, options);
        if (!conflict) {
            return null;
        }
        return buildConflictMessage(requestedKind, conflict.kind);
    }
/** findConflict：执行对应的业务逻辑。 */
    async findConflict(value, requestedKind, options = {}) {
        if (!value) {
            return null;
        }
/** conflicts：定义该变量以承载业务值。 */
        const conflicts = [];
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
/** shouldUseMemoryFallback：定义该变量以承载业务值。 */
        let shouldUseMemoryFallback = !pool;
        if (pool) {
            try {
                if (requestedKind === 'account') {
/** users：定义该变量以承载业务值。 */
                    const users = await pool.query('SELECT id, username FROM users WHERE username = $1', [value]);
                    for (const row of users.rows) {
                        const user = normalizeUserRow(row);
                        if (!user) {
                            continue;
                        }
                        if ((0, legacy_account_validation_1.normalizeUsername)(user.username) === value) {
                            conflicts.push({ kind: 'account', userId: user.id });
                        }
                    }
                }
                else if (requestedKind === 'role') {
                    const [users, players] = await Promise.all([
                        pool.query('SELECT id, "pendingRoleName" FROM users WHERE "pendingRoleName" = $1', [value]),
                        pool.query('SELECT "userId", name FROM players WHERE name = $1', [value]),
                    ]);
                    for (const row of users.rows) {
                        const user = normalizeUserRow(row);
                        if (!user) {
                            continue;
                        }
                        if ((0, legacy_account_validation_1.normalizeRoleName)(user.pendingRoleName) === value) {
                            conflicts.push({ kind: 'role', userId: user.id });
                        }
                    }
                    for (const row of players.rows) {
                        const userId = typeof row?.userId === 'string' ? row.userId : '';
                        if (!userId) {
                            continue;
                        }
                        if ((0, legacy_account_validation_1.normalizeRoleName)(row?.name) === value) {
                            conflicts.push({ kind: 'role', userId });
                        }
                    }
                }
                else {
                    if ((0, shared_1.isDuplicateFriendlyDisplayName)(value)) {
                        return null;
                    }
/** users：定义该变量以承载业务值。 */
                    const users = await pool.query(`
            SELECT id, username, "displayName"
            FROM users
            WHERE "displayName" = $1
              OR ("displayName" IS NULL AND LEFT(username, 1) = $1)
          `, [value]);
                    for (const row of users.rows) {
                        const user = normalizeUserRow(row);
                        if (!user) {
                            continue;
                        }
                        if ((0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username) === value) {
                            conflicts.push({ kind: 'display', userId: user.id });
                        }
                    }
                }
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
                shouldUseMemoryFallback = true;
            }
        }
        if (shouldUseMemoryFallback) {
            for (const user of this.memoryUsersById.values()) {
                if (requestedKind === 'account' && (0, legacy_account_validation_1.normalizeUsername)(user.username) === value) {
                    conflicts.push({ kind: 'account', userId: user.id });
                }
                if (requestedKind === 'display' && (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username) === value) {
                    conflicts.push({ kind: 'display', userId: user.id });
                }
                if (requestedKind === 'role' && (0, legacy_account_validation_1.normalizeRoleName)(user.pendingRoleName) === value) {
                    conflicts.push({ kind: 'role', userId: user.id });
                }
            }
        }
/** exclude：定义该变量以承载业务值。 */
        const exclude = options.exclude ?? [];
        return conflicts.find((entry) => !exclude.some((candidate) => candidate.kind === entry.kind && candidate.userId === entry.userId)) ?? null;
    }
/** findUserById：执行对应的业务逻辑。 */
    async findUserById(userId) {
/** normalizedUserId：定义该变量以承载业务值。 */
        const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
        if (!normalizedUserId) {
            return null;
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
/** result：定义该变量以承载业务值。 */
                const result = await pool.query(`
        SELECT id, username, "displayName", "pendingRoleName", "passwordHash", "totalOnlineSeconds", "currentOnlineStartedAt", "createdAt"
        FROM users
        WHERE id::text = $1
        LIMIT 1
      `, [normalizedUserId]);
                return normalizeUserRow(result.rows[0]);
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
            }
        }
        this.ensureLegacyHttpMemoryFallbackEnabled();
        return this.memoryUsersById.get(normalizedUserId) ?? null;
    }
/** findUserByUsername：执行对应的业务逻辑。 */
    async findUserByUsername(username) {
/** normalizedUsername：定义该变量以承载业务值。 */
        const normalizedUsername = (0, legacy_account_validation_1.normalizeUsername)(username).trim();
        if (!normalizedUsername) {
            return null;
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
/** result：定义该变量以承载业务值。 */
                const result = await pool.query(`
        SELECT id, username, "displayName", "pendingRoleName", "passwordHash", "totalOnlineSeconds", "currentOnlineStartedAt", "createdAt"
        FROM users
        WHERE username = $1
        LIMIT 1
      `, [normalizedUsername]);
                return normalizeUserRow(result.rows[0]);
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
            }
        }
        this.ensureLegacyHttpMemoryFallbackEnabled();
/** userId：定义该变量以承载业务值。 */
        const userId = this.memoryUserIdByUsername.get(normalizedUsername);
        return userId ? (this.memoryUsersById.get(userId) ?? null) : null;
    }
/** findUsersByRoleName：执行对应的业务逻辑。 */
    async findUsersByRoleName(roleName) {
/** normalizedRoleName：定义该变量以承载业务值。 */
        const normalizedRoleName = (0, legacy_account_validation_1.normalizeRoleName)(roleName);
        if (!normalizedRoleName) {
            return [];
        }
/** pool：定义该变量以承载业务值。 */
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
/** matchedPlayers：定义该变量以承载业务值。 */
                const matchedPlayers = await pool.query('SELECT "userId" FROM players WHERE name = $1', [normalizedRoleName]);
/** matchedUserIds：定义该变量以承载业务值。 */
                const matchedUserIds = Array.from(new Set(matchedPlayers.rows
                    .map((row) => typeof row?.userId === 'string' ? row.userId : '')
                    .filter((userId) => userId.length > 0)));
/** clauses：定义该变量以承载业务值。 */
                const clauses = ['"pendingRoleName" = $1'];
/** values：定义该变量以承载业务值。 */
                const values = [normalizedRoleName];
                if (matchedUserIds.length > 0) {
                    clauses.push(`id::text = ANY($2::varchar[])`);
                    values.push(matchedUserIds);
                }
/** result：定义该变量以承载业务值。 */
                const result = await pool.query(`
        SELECT id, username, "displayName", "pendingRoleName", "passwordHash", "totalOnlineSeconds", "currentOnlineStartedAt", "createdAt"
        FROM users
        WHERE ${clauses.join(' OR ')}
      `, values);
                return result.rows.map(normalizeUserRow).filter((entry) => entry !== null);
            }
            catch (error) {
                if (!isMissingLegacySchemaError(error)) {
                    throw error;
                }
            }
        }
        this.ensureLegacyHttpMemoryFallbackEnabled();
/** users：定义该变量以承载业务值。 */
        const users = [];
        for (const user of this.memoryUsersById.values()) {
            if ((0, legacy_account_validation_1.normalizeRoleName)(user.pendingRoleName) === normalizedRoleName) {
                users.push(user);
            }
        }
        return users;
    }
/** saveMemoryUser：执行对应的业务逻辑。 */
    saveMemoryUser(user) {
/** previous：定义该变量以承载业务值。 */
        const previous = this.memoryUsersById.get(user.id);
        if (previous) {
            this.memoryUserIdByUsername.delete(previous.username);
        }
        this.memoryUsersById.set(user.id, user);
        this.memoryUserIdByUsername.set(user.username, user.id);
    }
/** getMemoryUserById：执行对应的业务逻辑。 */
    getMemoryUserById(userId) {
/** normalizedUserId：定义该变量以承载业务值。 */
        const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
        if (!normalizedUserId) {
            return null;
        }
        return this.memoryUsersById.get(normalizedUserId) ?? null;
    }
};
exports.LegacyAuthUserCompatService = LegacyAuthUserCompatService;
exports.LegacyAuthUserCompatService = LegacyAuthUserCompatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_auth_service_1.LegacyAuthService])
], LegacyAuthUserCompatService);
/** normalizeUserRow：执行对应的业务逻辑。 */
function normalizeUserRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
/** id：定义该变量以承载业务值。 */
    const id = typeof row.id === 'string' ? row.id : '';
/** username：定义该变量以承载业务值。 */
    const username = typeof row.username === 'string' ? row.username : '';
/** passwordHash：定义该变量以承载业务值。 */
    const passwordHash = typeof row.passwordHash === 'string' ? row.passwordHash : '';
    if (!id || !username || !passwordHash) {
        return null;
    }
    return {
        id,
        username,
/** displayName：定义该变量以承载业务值。 */
        displayName: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : null,
/** pendingRoleName：定义该变量以承载业务值。 */
        pendingRoleName: typeof row.pendingRoleName === 'string' && row.pendingRoleName.trim() ? row.pendingRoleName : null,
        passwordHash,
        totalOnlineSeconds: Number.isFinite(row.totalOnlineSeconds) ? Math.max(0, Math.trunc(row.totalOnlineSeconds)) : 0,
        currentOnlineStartedAt: normalizeDateTime(row.currentOnlineStartedAt),
        createdAt: normalizeDateTime(row.createdAt) ?? new Date(0).toISOString(),
    };
}
/** normalizeDateTime：执行对应的业务逻辑。 */
function normalizeDateTime(value) {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }
    return null;
}
/** isMissingLegacySchemaError：执行对应的业务逻辑。 */
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
/** isLegacyHttpMemoryFallbackEnabled：执行对应的业务逻辑。 */
function isLegacyHttpMemoryFallbackEnabled() {
    for (const key of ALLOW_LEGACY_HTTP_MEMORY_FALLBACK_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
/** buildConflictMessage：执行对应的业务逻辑。 */
function buildConflictMessage(requestedKind, conflictKind) {
    if (requestedKind === 'account' || conflictKind === 'account') {
        return '账号已存在';
    }
    if (requestedKind === 'role' || conflictKind === 'role') {
        return '角色名称已存在';
    }
    return '称号已存在';
}
