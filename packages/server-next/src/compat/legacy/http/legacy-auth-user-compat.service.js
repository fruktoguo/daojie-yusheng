"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
    else
        for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyAuthUserCompatService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const legacy_account_validation_1 = require("../legacy-account-validation");
const legacy_auth_service_1 = require("../legacy-auth.service");
const ALLOW_LEGACY_HTTP_MEMORY_FALLBACK_ENV_KEYS = [
    'SERVER_NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK',
    'NEXT_ALLOW_LEGACY_HTTP_MEMORY_FALLBACK',
];
let LegacyAuthUserCompatService = class LegacyAuthUserCompatService {
    logger = new common_1.Logger(LegacyAuthUserCompatService.name);
    legacyAuthService;
    memoryUsersById = new Map();
    memoryUserIdByUsername = new Map();
    constructor(legacyAuthService) {
        this.legacyAuthService = legacyAuthService;
    }
    ensureLegacyHttpMemoryFallbackEnabled() {
        if (isLegacyHttpMemoryFallbackEnabled()) {
            return;
        }
        this.logger.warn('Legacy auth http memory fallback blocked: no legacy database and compat memory fallback disabled');
        throw new common_1.ServiceUnavailableException('legacy HTTP 内存兼容已关闭');
    }
    async ensureAvailable(value, requestedKind, options = {}) {
        if (requestedKind === 'display' && (0, shared_1.isDuplicateFriendlyDisplayName)(value)) {
            return null;
        }
        const conflict = await this.findConflict(value, requestedKind, options);
        if (!conflict) {
            return null;
        }
        return buildConflictMessage(requestedKind, conflict.kind);
    }
    async findConflict(value, requestedKind, options = {}) {
        if (!value) {
            return null;
        }
        const conflicts = [];
        const pool = await this.legacyAuthService.ensurePool();
        let shouldUseMemoryFallback = !pool;
        if (pool) {
            try {
                if (requestedKind === 'account') {
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
        const exclude = options.exclude ?? [];
        return conflicts.find((entry) => !exclude.some((candidate) => candidate.kind === entry.kind && candidate.userId === entry.userId)) ?? null;
    }
    async findUserById(userId) {
        const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
        if (!normalizedUserId) {
            return null;
        }
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
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
    async findUserByUsername(username) {
        const normalizedUsername = (0, legacy_account_validation_1.normalizeUsername)(username).trim();
        if (!normalizedUsername) {
            return null;
        }
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
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
        const userId = this.memoryUserIdByUsername.get(normalizedUsername);
        return userId ? (this.memoryUsersById.get(userId) ?? null) : null;
    }
    async findUsersByRoleName(roleName) {
        const normalizedRoleName = (0, legacy_account_validation_1.normalizeRoleName)(roleName);
        if (!normalizedRoleName) {
            return [];
        }
        const pool = await this.legacyAuthService.ensurePool();
        if (pool) {
            try {
                const matchedPlayers = await pool.query('SELECT "userId" FROM players WHERE name = $1', [normalizedRoleName]);
                const matchedUserIds = Array.from(new Set(matchedPlayers.rows
                    .map((row) => typeof row?.userId === 'string' ? row.userId : '')
                    .filter((userId) => userId.length > 0)));
                const clauses = ['"pendingRoleName" = $1'];
                const values = [normalizedRoleName];
                if (matchedUserIds.length > 0) {
                    clauses.push(`id::text = ANY($2::varchar[])`);
                    values.push(matchedUserIds);
                }
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
        const users = [];
        for (const user of this.memoryUsersById.values()) {
            if ((0, legacy_account_validation_1.normalizeRoleName)(user.pendingRoleName) === normalizedRoleName) {
                users.push(user);
            }
        }
        return users;
    }
    saveMemoryUser(user) {
        const previous = this.memoryUsersById.get(user.id);
        if (previous) {
            this.memoryUserIdByUsername.delete(previous.username);
        }
        this.memoryUsersById.set(user.id, user);
        this.memoryUserIdByUsername.set(user.username, user.id);
    }
    getMemoryUserById(userId) {
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
function normalizeUserRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const id = typeof row.id === 'string' ? row.id : '';
    const username = typeof row.username === 'string' ? row.username : '';
    const passwordHash = typeof row.passwordHash === 'string' ? row.passwordHash : '';
    if (!id || !username || !passwordHash) {
        return null;
    }
    return {
        id,
        username,
        displayName: typeof row.displayName === 'string' && row.displayName.trim() ? row.displayName : null,
        pendingRoleName: typeof row.pendingRoleName === 'string' && row.pendingRoleName.trim() ? row.pendingRoleName : null,
        passwordHash,
        totalOnlineSeconds: Number.isFinite(row.totalOnlineSeconds) ? Math.max(0, Math.trunc(row.totalOnlineSeconds)) : 0,
        currentOnlineStartedAt: normalizeDateTime(row.currentOnlineStartedAt),
        createdAt: normalizeDateTime(row.createdAt) ?? new Date(0).toISOString(),
    };
}
function normalizeDateTime(value) {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }
    return null;
}
function isMissingLegacySchemaError(error) {
    return Boolean(error && typeof error === 'object' && error.code === '42P01');
}
function isLegacyHttpMemoryFallbackEnabled() {
    for (const key of ALLOW_LEGACY_HTTP_MEMORY_FALLBACK_ENV_KEYS) {
        const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
        if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
            return true;
        }
    }
    return false;
}
function buildConflictMessage(requestedKind, conflictKind) {
    if (requestedKind === 'account' || conflictKind === 'account') {
        return '账号已存在';
    }
    if (requestedKind === 'role' || conflictKind === 'role') {
        return '角色名称已存在';
    }
    return '称号已存在';
}
