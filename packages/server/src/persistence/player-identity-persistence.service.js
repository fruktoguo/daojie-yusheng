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

var PlayerIdentityPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerIdentityPersistenceService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const pg_1 = require("pg");

const env_alias_1 = require("../config/env-alias");

const PLAYER_IDENTITY_SCOPE = 'server_next_player_identities_v1';

const PLAYER_IDENTITY_TABLE = 'server_next_player_identity';

const CREATE_PLAYER_IDENTITY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_IDENTITY_TABLE} (
    user_id varchar(100) PRIMARY KEY,
    username varchar(80) NOT NULL UNIQUE,
    player_id varchar(100) NOT NULL UNIQUE,
    display_name varchar(32),
    player_name varchar(120) NOT NULL,
    persisted_source varchar(32) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )
`;

const CREATE_PLAYER_IDENTITY_USERNAME_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_next_player_identity_username_idx
  ON ${PLAYER_IDENTITY_TABLE}(username)
`;

const CREATE_PLAYER_IDENTITY_PLAYER_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_next_player_identity_player_idx
  ON ${PLAYER_IDENTITY_TABLE}(player_id)
`;

const CREATE_PLAYER_IDENTITY_DISPLAY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_next_player_identity_display_idx
  ON ${PLAYER_IDENTITY_TABLE}(display_name)
`;

const PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE = 'native';

const PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_BACKFILL = 'legacy_backfill';

const PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_SYNC = 'legacy_sync';

const PLAYER_IDENTITY_PERSISTED_SOURCE_TOKEN_SEED = 'token_seed';

/** 玩家身份持久化：维护 userId/username/playerId 映射及来源标签。 */
let PlayerIdentityPersistenceService = PlayerIdentityPersistenceService_1 = class PlayerIdentityPersistenceService {
    logger = new common_1.Logger(PlayerIdentityPersistenceService_1.name);
    pool = null;
    enabled = false;
    async onModuleInit() {

        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('玩家身份持久化已禁用：未提供 SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await ensurePlayerIdentityTable(this.pool);
            this.enabled = true;
            this.logger.log('玩家身份持久化已启用（server_next_player_identity）');
        }
        catch (error) {
            this.logger.error('玩家身份持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
    async onModuleDestroy() {
        await this.safeClosePool();
    }

    /** 判断身份持久化是否生效（数据库连接已就绪）。 */
    isEnabled() {
        return this.enabled && this.pool !== null;
    }

    /** 按用户 ID 查询身份持久化记录。 */
    async loadPlayerIdentity(userId) {

        const normalizedUserId = normalizeRequiredString(userId);
        if (!this.pool || !this.enabled || !normalizedUserId) {
            return null;
        }

        const result = await this.pool.query(`
        SELECT
          user_id,
          username,
          player_id,
          display_name,
          player_name,
          persisted_source,
          updated_at,
          payload
        FROM ${PLAYER_IDENTITY_TABLE}
        WHERE user_id = $1
        LIMIT 1
      `, [normalizedUserId]);
        if (result.rowCount === 0) {
            return null;
        }

        const normalized = normalizePersistedPlayerIdentityRow(result.rows[0]);
        if (!normalized) {
            throw new Error(`Player identity next record invalid: userId=${normalizedUserId}`);
        }
        return normalized;
    }
    async savePlayerIdentity(identity) {

        const normalized = normalizePlayerIdentity(identity);
        if (!this.pool || !this.enabled || !normalized) {
            return null;
        }
        await this.pool.query(`
        INSERT INTO ${PLAYER_IDENTITY_TABLE}(
          user_id,
          username,
          player_id,
          display_name,
          player_name,
          persisted_source,
          updated_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb)
        ON CONFLICT (user_id)
        DO UPDATE SET
          username = EXCLUDED.username,
          player_id = EXCLUDED.player_id,
          display_name = EXCLUDED.display_name,
          player_name = EXCLUDED.player_name,
          persisted_source = EXCLUDED.persisted_source,
          updated_at = now(),
          payload = EXCLUDED.payload
      `, [
            normalized.userId,
            normalized.username,
            normalized.playerId,
            normalized.displayName,
            normalized.playerName,
            normalizePlayerIdentityPersistedSource(normalized.persistedSource)
                ?? PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE,
            JSON.stringify(normalized),
        ]);
        return normalized;
    }
    async safeClosePool() {

        const pool = this.pool;
        this.pool = null;
        this.enabled = false;
        if (pool) {
            await pool.end().catch(() => undefined);
        }
    }
};
exports.PlayerIdentityPersistenceService = PlayerIdentityPersistenceService;
exports.PlayerIdentityPersistenceService = PlayerIdentityPersistenceService = PlayerIdentityPersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], PlayerIdentityPersistenceService);
async function ensurePlayerIdentityTable(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(CREATE_PLAYER_IDENTITY_TABLE_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_USERNAME_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_PLAYER_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_DISPLAY_INDEX_SQL);
        await migrateLegacyIdentityDocumentsToTable(client);
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
async function migrateLegacyIdentityDocumentsToTable(client) {
    const existing = await client.query(`SELECT 1 FROM ${PLAYER_IDENTITY_TABLE} LIMIT 1`);
    if (existing.rowCount > 0) {
        return;
    }
    const relation = await client.query(`SELECT to_regclass('public.persistent_documents') AS relation_name`);
    if (!relation.rows[0]?.relation_name) {
        return;
    }
    const legacyRows = await client.query('SELECT key, payload FROM persistent_documents WHERE scope = $1 ORDER BY key ASC', [PLAYER_IDENTITY_SCOPE]);
    for (const row of legacyRows.rows) {
        const normalized = normalizePlayerIdentity(row?.payload);
        if (!normalized) {
            continue;
        }
        await client.query(`
        INSERT INTO ${PLAYER_IDENTITY_TABLE}(
          user_id,
          username,
          player_id,
          display_name,
          player_name,
          persisted_source,
          updated_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, now(), $7::jsonb)
        ON CONFLICT (user_id) DO NOTHING
      `, [
            normalized.userId,
            normalized.username,
            normalized.playerId,
            normalized.displayName,
            normalized.playerName,
            normalizePlayerIdentityPersistedSource(normalized.persistedSource)
                ?? PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE,
            JSON.stringify(normalized),
        ]);
    }
}
function normalizePersistedPlayerIdentityRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const normalizedFromPayload = normalizePlayerIdentity(row.payload);
    if (!normalizedFromPayload) {
        return null;
    }
    const userId = normalizeRequiredString(row.user_id) || normalizedFromPayload.userId;
    const username = normalizeRequiredString(row.username) || normalizedFromPayload.username;
    const playerId = normalizeRequiredString(row.player_id) || normalizedFromPayload.playerId;
    const playerName = normalizePlayerName(row.player_name, username) || normalizedFromPayload.playerName;
    if (!userId || !username || !playerId || !playerName) {
        return null;
    }
    return {
        ...normalizedFromPayload,
        userId,
        username,
        playerId,
        displayName: normalizeDisplayName(row.display_name, username),
        playerName,
        persistedSource: normalizePlayerIdentityPersistedSource(row.persisted_source)
            ?? normalizedFromPayload.persistedSource,
        updatedAt: row.updated_at instanceof Date
            ? row.updated_at.getTime()
            : Number.isFinite(Date.parse(String(row.updated_at ?? '')))
                ? Date.parse(String(row.updated_at))
                : normalizedFromPayload.updatedAt,
    };
}

/** 解析并规整玩家身份记录，补齐默认来源和值。 */
function normalizePlayerIdentity(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const userId = normalizeRequiredString(raw.userId);

    const username = normalizeRequiredString(raw.username);

    const playerId = normalizeRequiredString(raw.playerId);
    if (!userId || !username || !playerId) {
        return null;
    }

    const displayName = normalizeDisplayName(raw.displayName, username);

    const playerName = normalizePlayerName(raw.playerName, username);
    return {
        version: 1,
        userId,
        username,
        displayName,
        playerId,
        playerName,
        persistedSource: normalizePlayerIdentityPersistedSource(raw.persistedSource)
            ?? PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE,
        updatedAt: Number.isFinite(raw.updatedAt) ? Math.max(0, Math.trunc(raw.updatedAt)) : Date.now(),
    };
}
function normalizePlayerIdentityPersistedSource(value) {
    if (value === PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_BACKFILL) {
        return PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_BACKFILL;
    }
    if (value === PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_SYNC) {
        return PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_SYNC;
    }
    if (value === PLAYER_IDENTITY_PERSISTED_SOURCE_TOKEN_SEED) {
        return PLAYER_IDENTITY_PERSISTED_SOURCE_TOKEN_SEED;
    }
    if (value === PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE) {
        return PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE;
    }
    return null;
}
function normalizeRequiredString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function normalizeDisplayName(displayName, username) {

    const normalized = typeof displayName === 'string' ? displayName.trim().normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalized)) {
        return normalized;
    }
    return (0, shared_1.resolveDefaultVisibleDisplayName)(username.normalize('NFC'));
}
function normalizePlayerName(playerName, username) {

    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    return username.normalize('NFC');
}
function isValidVisibleDisplayName(value) {
    return typeof value === 'string'
        && value.length > 0
        && (0, shared_1.getGraphemeCount)(value) === 1
        && (0, shared_1.hasVisibleNameGrapheme)(value)
        && !(0, shared_1.containsInvisibleOnlyNameGrapheme)(value);
}
