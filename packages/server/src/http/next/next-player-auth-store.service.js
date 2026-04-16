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
const account_validation_1 = require("../../auth/account-validation");
const PLAYER_AUTH_SCOPE = 'server_next_player_auth_v1';
const PLAYER_AUTH_TABLE = 'server_next_player_auth';
const CREATE_PLAYER_AUTH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_AUTH_TABLE} (
    user_id varchar(100) PRIMARY KEY,
    username varchar(80) NOT NULL UNIQUE,
    player_id varchar(100) NOT NULL UNIQUE,
    pending_role_name varchar(120) NOT NULL,
    display_name varchar(32),
    password_hash text NOT NULL,
    total_online_seconds integer NOT NULL DEFAULT 0,
    current_online_started_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )
`;
const CREATE_PLAYER_AUTH_ROLE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_next_player_auth_role_idx
  ON ${PLAYER_AUTH_TABLE}(pending_role_name)
`;
const CREATE_PLAYER_AUTH_DISPLAY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_next_player_auth_display_idx
  ON ${PLAYER_AUTH_TABLE}(display_name)
`;
/** Next 玩家鉴权存储：维护账号索引、唯一性检查和持久化读写。 */
let NextPlayerAuthStoreService = class NextPlayerAuthStoreService {
    /** 记录存储层状态，便于定位启动和回退分支。 */
    logger = new common_1.Logger(NextPlayerAuthStoreService.name);
    /** 可选的数据库连接池；未启用时完全走内存模式。 */
    pool = null;
    /** 标记持久化是否已经成功初始化。 */
    enabled = false;
    /** 标记数据库初始化失败后是否永久降级。 */
    poolUnavailable = false;
    /** 按用户 ID 索引的账号快照。 */
    usersById = new Map();
    /** 按用户名索引到 userId。 */
    userIdByUsername = new Map();
    /** 按玩家 ID 索引到 userId。 */
    userIdByPlayerId = new Map();
    /** 按角色名索引到 userId 集合。 */
    userIdsByRoleName = new Map();
    /** 按显示名索引到 userId 集合。 */
    userIdsByDisplayName = new Map();
    /** 启动时加载持久化账号到内存索引。 */
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
            await ensurePlayerAuthTable(this.pool);
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
    /** 关闭模块时释放数据库连接。 */
    async onModuleDestroy() {
        await this.closePool();
    }
    /** 判断账号存储是否已经完成持久化初始化。 */
    isEnabled() {
        return this.enabled && this.pool !== null;
    }
    /** 从正式 auth 专表重建账号索引。 */
    async reloadFromPersistence() {
        if (!this.pool || !this.enabled) {
            return;
        }
        const result = await this.pool.query(`
      SELECT
        user_id,
        username,
        player_id,
        pending_role_name,
        display_name,
        password_hash,
        total_online_seconds,
        current_online_started_at,
        created_at,
        updated_at,
        payload
      FROM ${PLAYER_AUTH_TABLE}
      ORDER BY user_id ASC
    `);
        this.resetIndexes();
        for (const row of result.rows) {
            const normalized = normalizePersistedAuthRow(row);
            if (!normalized) {
                continue;
            }
            this.indexUser(normalized);
        }
    }
    /** 返回当前内存里的账号快照副本。 */
    async listUsers() {
        return Array.from(this.usersById.values()).map(cloneUser);
    }
    /** 保存账号并同步刷新所有内存索引。 */
    async saveUser(user) {
        const normalized = normalizeAuthRecord(user);
        if (!normalized) {
            throw new common_1.BadRequestException('账号记录无效');
        }
        if (this.pool && this.enabled) {
            await this.pool.query(`
        INSERT INTO ${PLAYER_AUTH_TABLE}(
          user_id,
          username,
          player_id,
          pending_role_name,
          display_name,
          password_hash,
          total_online_seconds,
          current_online_started_at,
          created_at,
          updated_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, now(), $10::jsonb)
        ON CONFLICT (user_id)
        DO UPDATE SET
          username = EXCLUDED.username,
          player_id = EXCLUDED.player_id,
          pending_role_name = EXCLUDED.pending_role_name,
          display_name = EXCLUDED.display_name,
          password_hash = EXCLUDED.password_hash,
          total_online_seconds = EXCLUDED.total_online_seconds,
          current_online_started_at = EXCLUDED.current_online_started_at,
          created_at = EXCLUDED.created_at,
          updated_at = now(),
          payload = EXCLUDED.payload
      `, [
                normalized.id,
                normalized.username,
                normalized.playerId,
                normalized.pendingRoleName,
                normalized.displayName,
                normalized.passwordHash,
                normalized.totalOnlineSeconds,
                normalized.currentOnlineStartedAt,
                normalized.createdAt,
                JSON.stringify(toPersistedUser(normalized)),
            ]);
        }
        this.replaceUser(normalized);
        return cloneUser(normalized);
    }
    /** 持久化启用时按 userId 回读正式真源，避免继续命中失效内存缓存。 */
    async refreshUserFromPersistenceById(userId) {
        if (!this.pool || !this.enabled) {
            return this.usersById.get(userId) ?? null;
        }
        const result = await this.pool.query(`
      SELECT
        user_id,
        username,
        player_id,
        pending_role_name,
        display_name,
        password_hash,
        total_online_seconds,
        current_online_started_at,
        created_at,
        updated_at,
        payload
      FROM ${PLAYER_AUTH_TABLE}
      WHERE user_id = $1
      LIMIT 1
    `, [userId]);
        const normalized = normalizePersistedAuthRow(result.rows[0] ?? null);
        if (!normalized) {
            const previous = this.usersById.get(userId) ?? null;
            if (previous) {
                this.unindexUser(previous);
            }
            return null;
        }
        this.replaceUser(normalized);
        return normalized;
    }
    /** 按 userId 查询账号。 */
    async findUserById(userId) {
        const normalizedUserId = normalizeRequiredString(userId);
        if (!normalizedUserId) {
            return null;
        }
        const user = await this.refreshUserFromPersistenceById(normalizedUserId);
        return user ? cloneUser(user) : null;
    }
    /** 直接从内存索引读取账号，供内部调用复用。 */
    getMemoryUserById(userId) {
        const normalizedUserId = normalizeRequiredString(userId);
        const user = normalizedUserId ? this.usersById.get(normalizedUserId) ?? null : null;
        return user ? cloneUser(user) : null;
    }
    /** 按玩家 ID 查询账号。 */
    async findUserByPlayerId(playerId) {
        const normalizedPlayerId = normalizeRequiredString(playerId);
        const userId = normalizedPlayerId ? this.userIdByPlayerId.get(normalizedPlayerId) ?? '' : '';
        if (!userId) {
            return null;
        }
        return this.findUserById(userId);
    }
    /** 按用户名查询账号。 */
    async findUserByUsername(username) {
        const normalizedUsername = (0, account_validation_1.normalizeUsername)(username).trim();
        const userId = normalizedUsername ? this.userIdByUsername.get(normalizedUsername) ?? '' : '';
        if (!userId) {
            return null;
        }
        return this.findUserById(userId);
    }
    /** 按角色名查询所有账号。 */
    async findUsersByRoleName(roleName) {
        const normalizedRoleName = (0, account_validation_1.normalizeRoleName)(roleName);
        if (!normalizedRoleName) {
            return [];
        }
        const userIds = Array.from(this.userIdsByRoleName.get(normalizedRoleName) ?? []);
        return userIds
            .map((userId) => this.usersById.get(userId) ?? null)
            .filter((entry) => entry !== null)
            .map(cloneUser);
    }
    /** 校验候选值是否可用，返回可读冲突说明。 */
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
    /** 在账号/角色/显示名三个维度上查找冲突账号。 */
    findConflict(value, requestedKind, options = {}) {
        if (!value) {
            return null;
        }
        const exclude = normalizeExcludeEntries(options.exclude);
        if (requestedKind === 'account') {
            const userId = this.userIdByUsername.get((0, account_validation_1.normalizeUsername)(value).trim()) ?? '';
            if (userId && !isExcluded(exclude, userId, 'account')) {
                return { kind: 'account', userId };
            }
            return null;
        }
        if (requestedKind === 'role') {
            const userIds = this.userIdsByRoleName.get((0, account_validation_1.normalizeRoleName)(value)) ?? null;
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
        const userIds = this.userIdsByDisplayName.get((0, account_validation_1.normalizeDisplayName)(value)) ?? null;
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
    /** 清空全部内存索引，配合重新加载使用。 */
    resetIndexes() {
        this.usersById.clear();
        this.userIdByUsername.clear();
        this.userIdByPlayerId.clear();
        this.userIdsByRoleName.clear();
        this.userIdsByDisplayName.clear();
    }
    /** 以 user.id 作为主键替换账号记录。 */
    replaceUser(user) {
        const previous = this.usersById.get(user.id) ?? null;
        if (previous) {
            this.unindexUser(previous);
        }
        this.indexUser(user);
    }
    /** 将账号写入所有辅助索引。 */
    indexUser(user) {
        this.usersById.set(user.id, user);
        this.userIdByUsername.set(user.username, user.id);
        this.userIdByPlayerId.set(user.playerId, user.id);
        if (user.pendingRoleName) {
            addToSetMap(this.userIdsByRoleName, user.pendingRoleName, user.id);
        }
        const resolvedDisplayName = (0, account_validation_1.resolveDisplayName)(user.displayName, user.username);
        if (!(0, shared_1.isDuplicateFriendlyDisplayName)(resolvedDisplayName)) {
            addToSetMap(this.userIdsByDisplayName, resolvedDisplayName, user.id);
        }
    }
    /** 从所有辅助索引中移除账号。 */
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
        const resolvedDisplayName = (0, account_validation_1.resolveDisplayName)(user.displayName, user.username);
        if (!(0, shared_1.isDuplicateFriendlyDisplayName)(resolvedDisplayName)) {
            removeFromSetMap(this.userIdsByDisplayName, resolvedDisplayName, user.id);
        }
    }
    /** 安全关闭数据库连接池，失败时忽略。 */
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
function normalizePersistedAuthRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const userId = normalizeRequiredString(row.user_id);
    const username = (0, account_validation_1.normalizeUsername)(row.username).trim();
    const playerId = normalizeRequiredString(row.player_id);
    const pendingRoleName = (0, account_validation_1.normalizeRoleName)(row.pending_role_name);
    const passwordHash = typeof row.password_hash === 'string' ? row.password_hash : '';
    if (!userId || !username || !playerId || !pendingRoleName || !passwordHash) {
        return null;
    }
    const createdAt = row.created_at instanceof Date
        ? row.created_at.toISOString()
        : normalizeDateTime(row.created_at) ?? new Date(0).toISOString();
    const currentOnlineStartedAt = row.current_online_started_at instanceof Date
        ? row.current_online_started_at.toISOString()
        : normalizeDateTime(row.current_online_started_at);
    const updatedAt = row.updated_at instanceof Date
        ? row.updated_at.getTime()
        : Number.isFinite(Date.parse(String(row.updated_at ?? ''))) ? Date.parse(String(row.updated_at)) : Date.now();
    return {
        version: 1,
        id: userId,
        userId,
        username,
        displayName: normalizeOptionalDisplayName(row.display_name),
        pendingRoleName,
        playerId,
        playerName: pendingRoleName,
        passwordHash,
        totalOnlineSeconds: Number.isFinite(row.total_online_seconds) ? Math.max(0, Math.trunc(row.total_online_seconds)) : 0,
        currentOnlineStartedAt,
        createdAt,
        updatedAt,
    };
}
function normalizeAuthRecord(raw, fallbackKey = '') {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const userId = normalizeRequiredString(raw.userId ?? raw.id ?? fallbackKey);
    const username = (0, account_validation_1.normalizeUsername)(raw.username).trim();
    const playerId = normalizeRequiredString(raw.playerId) || buildFallbackPlayerId(userId);
    const pendingRoleName = (0, account_validation_1.normalizeRoleName)(raw.playerName ?? raw.pendingRoleName)
        || (0, account_validation_1.buildDefaultRoleName)(username);
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
    const normalized = (0, account_validation_1.normalizeDisplayName)(value);
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
async function ensurePlayerAuthTable(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(CREATE_PLAYER_AUTH_TABLE_SQL);
        await client.query(CREATE_PLAYER_AUTH_ROLE_INDEX_SQL);
        await client.query(CREATE_PLAYER_AUTH_DISPLAY_INDEX_SQL);
        await migrateLegacyAuthDocumentsToTable(client);
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
    finally {
        client.release();
    }
}
async function migrateLegacyAuthDocumentsToTable(client) {
    const existing = await client.query(`SELECT 1 FROM ${PLAYER_AUTH_TABLE} LIMIT 1`);
    if (existing.rowCount > 0) {
        return;
    }
    const relation = await client.query(`SELECT to_regclass('public.persistent_documents') AS relation_name`);
    if (!relation.rows[0]?.relation_name) {
        return;
    }
    const legacyRows = await client.query('SELECT key, payload FROM persistent_documents WHERE scope = $1 ORDER BY key ASC', [PLAYER_AUTH_SCOPE]);
    for (const row of legacyRows.rows) {
        const normalized = normalizeAuthRecord(row?.payload, typeof row?.key === 'string' ? row.key : '');
        if (!normalized) {
            continue;
        }
        await client.query(`
      INSERT INTO ${PLAYER_AUTH_TABLE}(
        user_id,
        username,
        player_id,
        pending_role_name,
        display_name,
        password_hash,
        total_online_seconds,
        current_online_started_at,
        created_at,
        updated_at,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, now(), $10::jsonb)
      ON CONFLICT (user_id) DO NOTHING
    `, [
            normalized.id,
            normalized.username,
            normalized.playerId,
            normalized.pendingRoleName,
            normalized.displayName,
            normalized.passwordHash,
            normalized.totalOnlineSeconds,
            normalized.currentOnlineStartedAt,
            normalized.createdAt,
            JSON.stringify(toPersistedUser(normalized)),
        ]);
    }
}
