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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NextPlayerAuthStoreService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const pg_1 = require("pg");
const env_alias_1 = require("../../config/env-alias");
const persistent_document_table_1 = require("../../persistence/persistent-document-table");
const legacy_account_validation_1 = require("../../compat/legacy/legacy-account-validation");
const PLAYER_AUTH_SCOPE = 'server_next_player_auth_v1';
let NextPlayerAuthStoreService = class NextPlayerAuthStoreService {
    logger = new common_1.Logger(NextPlayerAuthStoreService.name);
    pool = null;
    enabled = false;
    poolUnavailable = false;
    usersById = new Map();
    userIdByUsername = new Map();
    userIdByPlayerId = new Map();
    userIdsByRoleName = new Map();
    userIdsByDisplayName = new Map();
    async onModuleInit() {
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('Next 玩家鉴权存储运行在纯内存模式：未提供 SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            await this.reloadFromPersistence();
            this.logger.log(`Next 玩家鉴权存储已就绪：已加载 ${this.usersById.size} 个账号`);
        }
        catch (error) {
            this.poolUnavailable = true;
            this.logger.error('Next 玩家鉴权存储持久化初始化失败，已回退为纯内存模式', error instanceof Error ? error.stack : String(error));
            await this.closePool();
        }
    }
    async onModuleDestroy() {
        await this.closePool();
    }
    isEnabled() {
        return this.enabled && this.pool !== null;
    }
    async reloadFromPersistence() {
        if (!this.pool || !this.enabled) {
            return;
        }
        const result = await this.pool.query('SELECT key, payload FROM persistent_documents WHERE scope = $1', [PLAYER_AUTH_SCOPE]);
        this.resetIndexes();
        for (const row of result.rows) {
            const normalized = normalizeAuthRecord(row?.payload, typeof row?.key === 'string' ? row.key : '');
            if (!normalized) {
                continue;
            }
            this.indexUser(normalized);
        }
    }
    async listUsers() {
        return Array.from(this.usersById.values()).map(cloneUser);
    }
    async saveUser(user) {
        const normalized = normalizeAuthRecord(user);
        if (!normalized) {
            throw new common_1.BadRequestException('账号记录无效');
        }
        if (this.pool && this.enabled) {
            await this.pool.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
      `, [PLAYER_AUTH_SCOPE, normalized.id, JSON.stringify(toPersistedUser(normalized))]);
        }
        this.replaceUser(normalized);
        return cloneUser(normalized);
    }
    async findUserById(userId) {
        const normalizedUserId = normalizeRequiredString(userId);
        const user = normalizedUserId ? this.usersById.get(normalizedUserId) ?? null : null;
        return user ? cloneUser(user) : null;
    }
    getMemoryUserById(userId) {
        const normalizedUserId = normalizeRequiredString(userId);
        const user = normalizedUserId ? this.usersById.get(normalizedUserId) ?? null : null;
        return user ? cloneUser(user) : null;
    }
    async findUserByPlayerId(playerId) {
        const normalizedPlayerId = normalizeRequiredString(playerId);
        const userId = normalizedPlayerId ? this.userIdByPlayerId.get(normalizedPlayerId) ?? '' : '';
        if (!userId) {
            return null;
        }
        return this.findUserById(userId);
    }
    async findUserByUsername(username) {
        const normalizedUsername = (0, legacy_account_validation_1.normalizeUsername)(username).trim();
        const userId = normalizedUsername ? this.userIdByUsername.get(normalizedUsername) ?? '' : '';
        if (!userId) {
            return null;
        }
        return this.findUserById(userId);
    }
    async findUsersByRoleName(roleName) {
        const normalizedRoleName = (0, legacy_account_validation_1.normalizeRoleName)(roleName);
        if (!normalizedRoleName) {
            return [];
        }
        const userIds = Array.from(this.userIdsByRoleName.get(normalizedRoleName) ?? []);
        return userIds
            .map((userId) => this.usersById.get(userId) ?? null)
            .filter((entry) => entry !== null)
            .map(cloneUser);
    }
    async ensureAvailable(value, requestedKind, options = {}) {
        if (requestedKind === 'display' && (0, shared_1.isDuplicateFriendlyDisplayName)(value)) {
            return null;
        }
        const conflict = this.findConflict(value, requestedKind, options);
        if (!conflict) {
            return null;
        }
        return buildConflictMessage(requestedKind, conflict.kind);
    }
    findConflict(value, requestedKind, options = {}) {
        if (!value) {
            return null;
        }
        const exclude = normalizeExcludeEntries(options.exclude);
        if (requestedKind === 'account') {
            const userId = this.userIdByUsername.get((0, legacy_account_validation_1.normalizeUsername)(value).trim()) ?? '';
            if (userId && !isExcluded(exclude, userId, 'account')) {
                return { kind: 'account', userId };
            }
            return null;
        }
        if (requestedKind === 'role') {
            const userIds = this.userIdsByRoleName.get((0, legacy_account_validation_1.normalizeRoleName)(value)) ?? null;
            if (!userIds) {
                return null;
            }
            for (const userId of userIds) {
                if (!isExcluded(exclude, userId, 'role')) {
                    return { kind: 'role', userId };
                }
            }
            return null;
        }
        if ((0, shared_1.isDuplicateFriendlyDisplayName)(value)) {
            return null;
        }
        const userIds = this.userIdsByDisplayName.get((0, legacy_account_validation_1.normalizeDisplayName)(value)) ?? null;
        if (!userIds) {
            return null;
        }
        for (const userId of userIds) {
            if (!isExcluded(exclude, userId, 'display')) {
                return { kind: 'display', userId };
            }
        }
        return null;
    }
    resetIndexes() {
        this.usersById.clear();
        this.userIdByUsername.clear();
        this.userIdByPlayerId.clear();
        this.userIdsByRoleName.clear();
        this.userIdsByDisplayName.clear();
    }
    replaceUser(user) {
        const previous = this.usersById.get(user.id) ?? null;
        if (previous) {
            this.unindexUser(previous);
        }
        this.indexUser(user);
    }
    indexUser(user) {
        this.usersById.set(user.id, user);
        this.userIdByUsername.set(user.username, user.id);
        this.userIdByPlayerId.set(user.playerId, user.id);
        if (user.pendingRoleName) {
            addToSetMap(this.userIdsByRoleName, user.pendingRoleName, user.id);
        }
        const resolvedDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
        if (!(0, shared_1.isDuplicateFriendlyDisplayName)(resolvedDisplayName)) {
            addToSetMap(this.userIdsByDisplayName, resolvedDisplayName, user.id);
        }
    }
    unindexUser(user) {
        this.usersById.delete(user.id);
        if (this.userIdByUsername.get(user.username) === user.id) {
            this.userIdByUsername.delete(user.username);
        }
        if (this.userIdByPlayerId.get(user.playerId) === user.id) {
            this.userIdByPlayerId.delete(user.playerId);
        }
        if (user.pendingRoleName) {
            removeFromSetMap(this.userIdsByRoleName, user.pendingRoleName, user.id);
        }
        const resolvedDisplayName = (0, legacy_account_validation_1.resolveDisplayName)(user.displayName, user.username);
        if (!(0, shared_1.isDuplicateFriendlyDisplayName)(resolvedDisplayName)) {
            removeFromSetMap(this.userIdsByDisplayName, resolvedDisplayName, user.id);
        }
    }
    async closePool() {
        const pool = this.pool;
        this.pool = null;
        this.enabled = false;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
};
exports.NextPlayerAuthStoreService = NextPlayerAuthStoreService;
exports.NextPlayerAuthStoreService = NextPlayerAuthStoreService = __decorate([
    (0, common_1.Injectable)()
], NextPlayerAuthStoreService);
function normalizeAuthRecord(raw, fallbackKey = '') {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const userId = normalizeRequiredString(raw.userId ?? raw.id ?? fallbackKey);
    const username = (0, legacy_account_validation_1.normalizeUsername)(raw.username).trim();
    const playerId = normalizeRequiredString(raw.playerId) || buildFallbackPlayerId(userId);
    const pendingRoleName = (0, legacy_account_validation_1.normalizeRoleName)(raw.playerName ?? raw.pendingRoleName)
        || (0, legacy_account_validation_1.buildDefaultRoleName)(username);
    const passwordHash = typeof raw.passwordHash === 'string' ? raw.passwordHash : '';
    if (!userId || !username || !playerId || !pendingRoleName || !passwordHash) {
        return null;
    }
    const createdAt = normalizeDateTime(raw.createdAt) ?? new Date(0).toISOString();
    return {
        version: 1,
        id: userId,
        userId,
        username,
        displayName: normalizeOptionalDisplayName(raw.displayName),
        pendingRoleName,
        playerId,
        playerName: pendingRoleName,
        passwordHash,
        totalOnlineSeconds: Number.isFinite(raw.totalOnlineSeconds) ? Math.max(0, Math.trunc(raw.totalOnlineSeconds)) : 0,
        currentOnlineStartedAt: normalizeDateTime(raw.currentOnlineStartedAt),
        createdAt,
        updatedAt: Number.isFinite(raw.updatedAt) ? Math.max(0, Math.trunc(raw.updatedAt)) : Date.now(),
    };
}
function toPersistedUser(user) {
    return {
        version: 1,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        playerId: user.playerId,
        playerName: user.pendingRoleName,
        passwordHash: user.passwordHash,
        totalOnlineSeconds: user.totalOnlineSeconds,
        currentOnlineStartedAt: user.currentOnlineStartedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}
function cloneUser(user) {
    return {
        ...user,
    };
}
function normalizeRequiredString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function normalizeOptionalDisplayName(value) {
    const normalized = (0, legacy_account_validation_1.normalizeDisplayName)(value);
    return normalized.trim().length > 0 ? normalized : null;
}
function normalizeDateTime(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}
function buildFallbackPlayerId(userId) {
    const normalizedUserId = normalizeRequiredString(userId);
    return normalizedUserId ? `p_${normalizedUserId}` : 'p_guest';
}
function addToSetMap(target, key, userId) {
    const current = target.get(key) ?? new Set();
    current.add(userId);
    target.set(key, current);
}
function removeFromSetMap(target, key, userId) {
    const current = target.get(key) ?? null;
    if (!current) {
        return;
    }
    current.delete(userId);
    if (current.size === 0) {
        target.delete(key);
        return;
    }
    target.set(key, current);
}
function normalizeExcludeEntries(entries) {
    if (!Array.isArray(entries)) {
        return [];
    }
    return entries
        .map((entry) => ({
        userId: normalizeRequiredString(entry?.userId),
        kind: entry?.kind === 'account' || entry?.kind === 'role' || entry?.kind === 'display' ? entry.kind : null,
    }))
        .filter((entry) => entry.userId && entry.kind);
}
function isExcluded(entries, userId, kind) {
    return entries.some((entry) => entry.userId === userId && entry.kind === kind);
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
