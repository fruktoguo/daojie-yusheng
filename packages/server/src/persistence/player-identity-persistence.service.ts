// @ts-nocheck
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

const shared_1 = require("@mud/shared");

const pg_1 = require("pg");

const env_alias_1 = require("../config/env-alias");

const PLAYER_IDENTITY_SCOPE = 'server_player_identities_v1';

const PLAYER_IDENTITY_TABLE = 'server_player_identity';

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
  CREATE INDEX IF NOT EXISTS server_player_identity_username_idx
  ON ${PLAYER_IDENTITY_TABLE}(username)
`;

const CREATE_PLAYER_IDENTITY_PLAYER_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_player_identity_player_idx
  ON ${PLAYER_IDENTITY_TABLE}(player_id)
`;

const CREATE_PLAYER_IDENTITY_DISPLAY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_player_identity_display_idx
  ON ${PLAYER_IDENTITY_TABLE}(display_name)
`;

const PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE = 'native';

const PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_BACKFILL = 'legacy_backfill';

const PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_SYNC = 'legacy_sync';

const PLAYER_IDENTITY_PERSISTED_SOURCE_TOKEN_SEED = 'token_seed';

/** 玩家身份持久化：维护 userId/username/playerId 映射及来源标签。 */
let PlayerIdentityPersistenceService = PlayerIdentityPersistenceService_1 = class PlayerIdentityPersistenceService {
/**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(PlayerIdentityPersistenceService_1.name);    
    /**
 * pool：缓存或索引容器。
 */

    pool = null;    
    /**
 * enabled：启用开关或状态标识。
 */

    enabled = false;    
    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    async onModuleInit() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const databaseUrl = (0, env_alias_1.resolveServerDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('玩家身份持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await ensurePlayerIdentityTable(this.pool);
            this.enabled = true;
            this.logger.log('玩家身份持久化已启用（server_player_identity）');
        }
        catch (error) {
            this.logger.error('玩家身份持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }    
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    async onModuleDestroy() {
        await this.safeClosePool();
    }

    /** 判断身份持久化是否生效（数据库连接已就绪）。 */
    isEnabled() {
        return this.enabled && this.pool !== null;
    }

    /** 按用户 ID 查询身份持久化记录。 */
    async loadPlayerIdentity(userId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
            throw new Error(`Player identity mainline record invalid: userId=${normalizedUserId}`);
        }
        return normalized;
    }    
    /**
 * savePlayerIdentity：执行save玩家Identity相关逻辑。
 * @param identity 参数说明。
 * @returns 无返回值，直接更新save玩家Identity相关状态。
 */

    async savePlayerIdentity(identity) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
    /**
 * safeClosePool：执行safeClosePool相关逻辑。
 * @returns 无返回值，直接更新safeClosePool相关状态。
 */

    async safeClosePool() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
/**
 * ensurePlayerIdentityTable：执行ensure玩家Identity表相关逻辑。
 * @param pool 参数说明。
 * @returns 无返回值，直接更新ensure玩家Identity表相关状态。
 */

async function ensurePlayerIdentityTable(pool) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(CREATE_PLAYER_IDENTITY_TABLE_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_USERNAME_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_PLAYER_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_DISPLAY_INDEX_SQL);
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
export { PlayerIdentityPersistenceService };
/**
 * normalizePersistedPlayerIdentityRow：判断Persisted玩家IdentityRow是否满足条件。
 * @param row 参数说明。
 * @returns 无返回值，直接更新Persisted玩家IdentityRow相关状态。
 */

function normalizePersistedPlayerIdentityRow(row) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizePlayerIdentityPersistedSource：判断玩家IdentityPersisted来源是否满足条件。
 * @param value 参数说明。
 * @returns 无返回值，直接更新玩家IdentityPersisted来源相关状态。
 */

function normalizePlayerIdentityPersistedSource(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeRequiredString：规范化或转换RequiredString。
 * @param value 参数说明。
 * @returns 无返回值，直接更新RequiredString相关状态。
 */

function normalizeRequiredString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
/**
 * normalizeDisplayName：判断显示名称是否满足条件。
 * @param displayName 参数说明。
 * @param username 参数说明。
 * @returns 无返回值，直接更新显示名称相关状态。
 */

function normalizeDisplayName(displayName, username) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const normalized = typeof displayName === 'string' ? displayName.trim().normalize('NFC') : '';
    if (isValidVisibleDisplayName(normalized)) {
        return normalized;
    }
    return (0, shared_1.resolveDefaultVisibleDisplayName)(username.normalize('NFC'));
}
/**
 * normalizePlayerName：规范化或转换玩家名称。
 * @param playerName 参数说明。
 * @param username 参数说明。
 * @returns 无返回值，直接更新玩家名称相关状态。
 */

function normalizePlayerName(playerName, username) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
    if (normalized) {
        return normalized;
    }
    return username.normalize('NFC');
}
/**
 * isValidVisibleDisplayName：判断Valid可见显示名称是否满足条件。
 * @param value 参数说明。
 * @returns 无返回值，完成Valid可见显示名称的条件判断。
 */

function isValidVisibleDisplayName(value) {
    return typeof value === 'string'
        && value.length > 0
        && (0, shared_1.getGraphemeCount)(value) === 1
        && (0, shared_1.hasVisibleNameGrapheme)(value)
        && !(0, shared_1.containsInvisibleOnlyNameGrapheme)(value);
}
