/**
 * 玩家身份持久化服务。
 * 维护 server_player_identity 主表和 player_identity 镜像表，
 * 管理 userId/username/playerId/playerNo 映射、显示名规范化和来源标签，
 * 支持触发器自动同步镜像和 playerNo 回填。
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { containsInvisibleOnlyNameGrapheme, getGraphemeCount, hasVisibleNameGrapheme, resolveDefaultVisibleDisplayName } from '@mud/shared';
import { Pool } from 'pg';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from './database-pool.provider';

const PLAYER_IDENTITY_SCOPE = 'server_player_identities_v1';

const PLAYER_IDENTITY_TABLE = 'server_player_identity';
const PLAYER_IDENTITY_MIRROR_TABLE = 'player_identity';

const CREATE_PLAYER_IDENTITY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_IDENTITY_TABLE} (
    user_id varchar(100) PRIMARY KEY,
    username varchar(80) NOT NULL UNIQUE,
    player_id varchar(100) NOT NULL UNIQUE,
    player_no bigint UNIQUE,
    display_name varchar(32),
    player_name varchar(120) NOT NULL,
    persisted_source varchar(32) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )
`;

const CREATE_PLAYER_IDENTITY_MIRROR_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_IDENTITY_MIRROR_TABLE} (
    user_id varchar(100) PRIMARY KEY,
    username varchar(80) NOT NULL UNIQUE,
    player_id varchar(100) NOT NULL UNIQUE,
    player_no bigint UNIQUE,
    display_name varchar(32),
    player_name varchar(120) NOT NULL,
    persisted_source varchar(32) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )
`;

const ADD_PLAYER_IDENTITY_PLAYER_NO_COLUMNS_SQL = `
  ALTER TABLE ${PLAYER_IDENTITY_TABLE}
  ADD COLUMN IF NOT EXISTS player_no bigint;

  ALTER TABLE ${PLAYER_IDENTITY_MIRROR_TABLE}
  ADD COLUMN IF NOT EXISTS player_no bigint;
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

const CREATE_PLAYER_IDENTITY_PLAYER_NO_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS server_player_identity_player_no_idx
  ON ${PLAYER_IDENTITY_TABLE}(player_no)
  WHERE player_no IS NOT NULL
`;

const CREATE_PLAYER_IDENTITY_MIRROR_USERNAME_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS player_identity_username_idx
  ON ${PLAYER_IDENTITY_MIRROR_TABLE}(username)
`;

const CREATE_PLAYER_IDENTITY_MIRROR_PLAYER_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS player_identity_player_idx
  ON ${PLAYER_IDENTITY_MIRROR_TABLE}(player_id)
`;

const CREATE_PLAYER_IDENTITY_MIRROR_DISPLAY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS player_identity_display_idx
  ON ${PLAYER_IDENTITY_MIRROR_TABLE}(display_name)
`;

const CREATE_PLAYER_IDENTITY_MIRROR_PLAYER_NO_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS player_identity_player_no_idx
  ON ${PLAYER_IDENTITY_MIRROR_TABLE}(player_no)
  WHERE player_no IS NOT NULL
`;

const CREATE_PLAYER_IDENTITY_MIRROR_SYNC_FUNCTION_SQL = `
  CREATE OR REPLACE FUNCTION sync_server_player_identity_to_player_identity()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      DELETE FROM ${PLAYER_IDENTITY_MIRROR_TABLE}
      WHERE user_id = OLD.user_id;
      RETURN OLD;
    END IF;

    INSERT INTO ${PLAYER_IDENTITY_MIRROR_TABLE} (
      user_id,
      username,
      player_id,
      player_no,
      display_name,
      player_name,
      persisted_source,
      updated_at,
      payload
    )
    VALUES (
      NEW.user_id,
      NEW.username,
      NEW.player_id,
      NEW.player_no,
      NEW.display_name,
      NEW.player_name,
      NEW.persisted_source,
      NEW.updated_at,
      NEW.payload
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      username = EXCLUDED.username,
      player_id = EXCLUDED.player_id,
      player_no = EXCLUDED.player_no,
      display_name = EXCLUDED.display_name,
      player_name = EXCLUDED.player_name,
      persisted_source = EXCLUDED.persisted_source,
      updated_at = EXCLUDED.updated_at,
      payload = EXCLUDED.payload;
    RETURN NEW;
  END;
  $$;
`;

const CREATE_PLAYER_IDENTITY_MIRROR_TRIGGER_SQL = `
  DROP TRIGGER IF EXISTS server_player_identity_to_player_identity_sync ON ${PLAYER_IDENTITY_TABLE};
  CREATE TRIGGER server_player_identity_to_player_identity_sync
  AFTER INSERT OR UPDATE OR DELETE ON ${PLAYER_IDENTITY_TABLE}
  FOR EACH ROW
  EXECUTE FUNCTION sync_server_player_identity_to_player_identity();
`;

const PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE = 'native';

const PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_BACKFILL = 'legacy_backfill';

const PLAYER_IDENTITY_PERSISTED_SOURCE_LEGACY_SYNC = 'legacy_sync';

const PLAYER_IDENTITY_PERSISTED_SOURCE_TOKEN_SEED = 'token_seed';

/** 玩家身份持久化：维护 userId/username/playerId 映射及来源标签。 */
@Injectable()
export class PlayerIdentityPersistenceService {
/**
 * logger：日志器引用。
 */

    logger = new Logger(PlayerIdentityPersistenceService.name);
    /**
 * pool：缓存或索引容器。
 */

    pool = null;
    /**
 * enabled：启用开关或状态标识。
 */

    enabled = false;

    databasePoolProvider;

    constructor(@Inject(DatabasePoolProvider) databasePoolProvider: any = undefined) {
        this.databasePoolProvider = databasePoolProvider;
    }

    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    async onModuleInit() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const databaseUrl = resolveServerDatabaseUrl();
        if (!databaseUrl.trim()) {
            this.logger.log('玩家身份持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
            return;
        }
        const sharedPool = this.databasePoolProvider?.getPool?.('player-identity');
        if (!sharedPool) {
            this.logger.warn('玩家身份持久化已禁用：DatabasePoolProvider 未提供连接池');
            return;
        }
        this.pool = sharedPool;
        try {
            await ensurePlayerIdentityTable(this.pool);
            this.enabled = true;
            this.logger.log('玩家身份持久化已启用（server_player_identity + player_identity mirror）');
        }
        catch (error) {
            this.logger.error('玩家身份持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            this.releasePoolReference();
        }
    }
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    async onModuleDestroy() {
        this.releasePoolReference();
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
          player_no,
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
 * listPlayerIdentitiesByPlayerIds：按玩家 ID 批量读取身份记录。
 * @param playerIds 玩家 ID 集合。
 * @returns 玩家 ID 到身份记录的映射。
 */

    async listPlayerIdentitiesByPlayerIds(playerIds) {
  // 排行榜等低频读模型需要批量补角色名，避免逐玩家查询。

        const normalizedPlayerIds = Array.from(new Set(Array.from(playerIds ?? [])
            .map((playerId) => normalizeRequiredString(playerId))
            .filter((playerId) => playerId.length > 0)));
        if (!this.pool || !this.enabled || normalizedPlayerIds.length === 0) {
            return new Map();
        }

        const result = await this.pool.query(`
        SELECT
          user_id,
          username,
          player_id,
          player_no,
          display_name,
          player_name,
          persisted_source,
          updated_at,
          payload
        FROM ${PLAYER_IDENTITY_TABLE}
        WHERE player_id = ANY($1::varchar[])
      `, [normalizedPlayerIds]);

        const identitiesByPlayerId = new Map();
        for (const row of result.rows ?? []) {
            const normalized = normalizePersistedPlayerIdentityRow(row);
            if (normalized?.playerId) {
                identitiesByPlayerId.set(normalized.playerId, normalized);
            }
        }
        return identitiesByPlayerId;
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
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`
          DELETE FROM ${PLAYER_IDENTITY_TABLE}
          WHERE user_id <> $1
            AND (username = $2 OR player_id = $3)
        `, [
                normalized.userId,
                normalized.username,
                normalized.playerId,
            ]);
            await client.query(`
          INSERT INTO ${PLAYER_IDENTITY_TABLE}(
            user_id,
            username,
            player_id,
            player_no,
            display_name,
            player_name,
            persisted_source,
            updated_at,
            payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8::jsonb)
          ON CONFLICT (user_id)
          DO UPDATE SET
            username = EXCLUDED.username,
            player_id = EXCLUDED.player_id,
            player_no = COALESCE(EXCLUDED.player_no, ${PLAYER_IDENTITY_TABLE}.player_no),
            display_name = EXCLUDED.display_name,
            player_name = EXCLUDED.player_name,
            persisted_source = EXCLUDED.persisted_source,
            updated_at = now(),
            payload = jsonb_set(
              EXCLUDED.payload,
              '{playerNo}',
              COALESCE(to_jsonb(COALESCE(EXCLUDED.player_no, ${PLAYER_IDENTITY_TABLE}.player_no)), 'null'::jsonb),
              true
            )
        `, [
                normalized.userId,
                normalized.username,
                normalized.playerId,
                normalized.playerNo,
                normalized.displayName,
                normalized.playerName,
                normalizePlayerIdentityPersistedSource(normalized.persistedSource)
                    ?? PLAYER_IDENTITY_PERSISTED_SOURCE_NATIVE,
                JSON.stringify(normalized),
            ]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        }
        finally {
            client.release();
        }
        return normalized;
    }
    /**
 * releasePoolReference：释放对共享连接池的引用，由 DatabasePoolProvider 统一关闭真正的连接池。
 * @returns 无返回值，直接更新连接池引用相关状态。
 */

    releasePoolReference() {
        this.pool = null;
        this.enabled = false;
    }
}
/**
 * ensurePlayerIdentityTable：执行ensure玩家Identity表相关逻辑。
 * @param pool 参数说明。
 * @returns 无返回值，直接更新ensure玩家Identity表相关状态。
 */

export async function ensurePlayerIdentityTable(pool) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(CREATE_PLAYER_IDENTITY_TABLE_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_MIRROR_TABLE_SQL);
        await client.query(ADD_PLAYER_IDENTITY_PLAYER_NO_COLUMNS_SQL);
        await backfillPlayerIdentityNoWithClient(client);
        await client.query(CREATE_PLAYER_IDENTITY_USERNAME_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_PLAYER_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_DISPLAY_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_PLAYER_NO_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_MIRROR_USERNAME_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_MIRROR_PLAYER_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_MIRROR_DISPLAY_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_MIRROR_PLAYER_NO_INDEX_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_MIRROR_SYNC_FUNCTION_SQL);
        await client.query(CREATE_PLAYER_IDENTITY_MIRROR_TRIGGER_SQL);
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

async function backfillPlayerIdentityNoWithClient(client) {
    await client.query(`
      UPDATE ${PLAYER_IDENTITY_TABLE} ident
      SET
        player_no = auth.player_no,
        payload = jsonb_set(ident.payload, '{playerNo}', to_jsonb(auth.player_no), true)
      FROM server_player_auth auth
      WHERE ident.player_no IS DISTINCT FROM auth.player_no
        AND auth.player_id = ident.player_id
        AND auth.player_no IS NOT NULL
    `);
    await client.query(`
      UPDATE ${PLAYER_IDENTITY_MIRROR_TABLE} mirror
      SET
        player_no = ident.player_no,
        payload = jsonb_set(mirror.payload, '{playerNo}', to_jsonb(ident.player_no), true)
      FROM ${PLAYER_IDENTITY_TABLE} ident
      WHERE mirror.player_no IS DISTINCT FROM ident.player_no
        AND ident.user_id = mirror.user_id
        AND ident.player_no IS NOT NULL
    `);
}
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
    const playerNo = normalizeOptionalPlayerNo(row.player_no) ?? normalizedFromPayload.playerNo ?? null;
    const playerName = normalizePlayerName(row.player_name, username) || normalizedFromPayload.playerName;
    if (!userId || !username || !playerId || !playerName) {
        return null;
    }
    return {
        ...normalizedFromPayload,
        userId,
        username,
        playerId,
        playerNo,
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
    const playerNo = normalizeOptionalPlayerNo(raw.playerNo);
    return {
        version: 1,
        userId,
        username,
        displayName,
        playerId,
        playerNo,
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

function normalizeOptionalPlayerNo(value) {
    const numeric = typeof value === 'number'
        ? value
        : typeof value === 'bigint'
            ? Number(value)
            : typeof value === 'string' && value.trim()
                ? Number(value.trim())
                : NaN;
    if (!Number.isSafeInteger(numeric) || numeric <= 0) {
        return null;
    }
    return Math.trunc(numeric);
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
    return resolveDefaultVisibleDisplayName(username.normalize('NFC'));
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
        && getGraphemeCount(value) === 1
        && hasVisibleNameGrapheme(value)
        && !containsInvisibleOnlyNameGrapheme(value);
}
