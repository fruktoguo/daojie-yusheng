/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * 兑换码持久化服务。
 * 管理 server_redeem_code_group 和 server_redeem_code 表，
 * 支持兑换码组的创建、兑换码使用/销毁状态的事务性落库和全量加载。
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from './database-pool.provider';

const REDEEM_CODE_STATE_TABLE = 'server_redeem_code_state';
const REDEEM_CODE_GROUP_TABLE = 'server_redeem_code_group';
const REDEEM_CODE_TABLE = 'server_redeem_code';
const REDEEM_CODE_STATE_KEY = 'global';

/** 兑换码持久化服务：保存/读取兑换码组与兑换码实例状态 */
@Injectable()
export class RedeemCodePersistenceService {
/**
 * logger：日志器引用。
 */

    logger = new Logger(RedeemCodePersistenceService.name);
    /**
 * pool：缓存或索引容器。
 */

    pool = null;
    /**
 * enabled：启用开关或状态标识。
 */

    enabled = false;

    databasePoolProvider;
    initializationPromise = null;

    constructor(@Inject(DatabasePoolProvider) databasePoolProvider: any = undefined) {
        this.databasePoolProvider = databasePoolProvider;
    }

    /**
 * onModuleInit：执行on模块Init相关逻辑。
 * @returns 无返回值，直接更新on模块Init相关状态。
 */

    async onModuleInit() {
        await this.ensureReady();
    }

    async ensureReady() {
        if (this.enabled && this.pool) {
            return true;
        }
        if (this.initializationPromise) {
            await this.initializationPromise;
            return this.enabled === true && Boolean(this.pool);
        }
        this.initializationPromise = this.initializePersistence();
        try {
            await this.initializationPromise;
        }
        finally {
            this.initializationPromise = null;
        }
        return this.enabled === true && Boolean(this.pool);
    }

    async initializePersistence() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const databaseUrl = resolveRedeemCodeDatabaseUrl();
        if (!databaseUrl.trim()) {
            this.logger.log('兑换码持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL/SERVER_DATABASE_POOLER_URL/DATABASE_POOLER_URL');
            return;
        }
        const sharedPool = this.databasePoolProvider?.getPool?.('redeem-code');
        if (!sharedPool) {
            this.logger.warn('兑换码持久化已禁用：数据库连接池提供者未提供连接池');
            return;
        }
        this.pool = sharedPool;
        try {
            await ensureRedeemCodeTables(this.pool);
            this.enabled = true;
            this.logger.log('兑换码持久化已启用（server_redeem_code_group + server_redeem_code）');
        }
        catch (error) {
            this.logger.error('兑换码持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            this.releasePoolReference();
        }
    }
    isEnabled() {
        return this.enabled === true && Boolean(this.pool);
    }
    /**
 * onModuleDestroy：执行on模块Destroy相关逻辑。
 * @returns 无返回值，直接更新on模块Destroy相关状态。
 */

    async onModuleDestroy() {
        this.releasePoolReference();
    }
    /**
 * loadDocument：读取Document并返回结果。
 * @returns 无返回值，完成Document的读取/组装。
 */

    async loadDocument() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        await this.ensureReady();
        if (!this.pool || !this.enabled) {
            if (isRedeemCodeDatabaseConfigured()) {
                throw new Error('redeem_code_persistence_unavailable');
            }
            return null;
        }

        const stateResult = await this.pool.query(
            `SELECT revision FROM ${REDEEM_CODE_STATE_TABLE} WHERE state_key = $1 LIMIT 1`,
            [REDEEM_CODE_STATE_KEY],
        );
        const groupResult = await this.pool.query(
            `
              SELECT group_id, name, rewards_payload, created_at, updated_at, raw_payload
              FROM ${REDEEM_CODE_GROUP_TABLE}
              ORDER BY created_at ASC, group_id ASC
            `,
        );
        const codeResult = await this.pool.query(
            `
              SELECT code_id, group_id, code, status, used_by_player_id, used_by_role_name,
                     used_at, destroyed_at, created_at, updated_at, raw_payload
              FROM ${REDEEM_CODE_TABLE}
              ORDER BY created_at ASC, code_id ASC
            `,
        );
        if ((groupResult.rowCount ?? 0) === 0 && (codeResult.rowCount ?? 0) === 0 && (stateResult.rowCount ?? 0) === 0) {
            return null;
        }
        return normalizeRedeemCodeDocument({
            version: 1,
            revision: Number(stateResult.rows?.[0]?.revision ?? 1),
            groups: groupResult.rows.map((row) => ({
                ...(row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {}),
                id: typeof row.group_id === 'string' ? row.group_id : '',
                name: typeof row.name === 'string' ? row.name : '',
                rewards: Array.isArray(row.rewards_payload) ? row.rewards_payload : [],
                createdAt: normalizeDbTimestamp(row.created_at),
                updatedAt: normalizeDbTimestamp(row.updated_at),
            })),
            codes: codeResult.rows.map((row) => ({
                ...(row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {}),
                id: typeof row.code_id === 'string' ? row.code_id : '',
                groupId: typeof row.group_id === 'string' ? row.group_id : '',
                code: typeof row.code === 'string' ? row.code : '',
                status: row.status === 'used' || row.status === 'destroyed' ? row.status : 'active',
                usedByPlayerId: typeof row.used_by_player_id === 'string' ? row.used_by_player_id : null,
                usedByRoleName: typeof row.used_by_role_name === 'string' ? row.used_by_role_name : null,
                usedAt: normalizeNullableDbTimestamp(row.used_at),
                destroyedAt: normalizeNullableDbTimestamp(row.destroyed_at),
                createdAt: normalizeDbTimestamp(row.created_at),
                updatedAt: normalizeDbTimestamp(row.updated_at),
            })),
        });
    }
    /**
 * saveDocument：执行saveDocument相关逻辑。
 * @param document 参数说明。
 * @returns 无返回值，直接更新saveDocument相关状态。
 */

    async saveDocument(document) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        await this.ensureReady();
        if (!this.pool || !this.enabled) {
            return false;
        }
        const normalized = normalizeRedeemCodeDocument(document);
        if (!normalized) {
            return false;
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `
                  INSERT INTO ${REDEEM_CODE_STATE_TABLE}(state_key, revision, updated_at)
                  VALUES ($1, $2, now())
                  ON CONFLICT (state_key)
                  DO UPDATE SET revision = EXCLUDED.revision, updated_at = now()
                `,
                [REDEEM_CODE_STATE_KEY, normalized.revision],
            );
            for (const group of normalized.groups) {
                const rewardsJson = JSON.stringify(group.rewards);
                const groupJson = JSON.stringify(group);
                await client.query(
                    `
                      INSERT INTO ${REDEEM_CODE_GROUP_TABLE}(
                        group_id,
                        name,
                        rewards_payload,
                        created_at,
                        updated_at,
                        raw_payload
                      )
                      VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz, $6::jsonb)
                      ON CONFLICT (group_id)
                      DO UPDATE SET
                        name = EXCLUDED.name,
                        rewards_payload = EXCLUDED.rewards_payload,
                        updated_at = EXCLUDED.updated_at,
                        raw_payload = EXCLUDED.raw_payload
                    `,
                    [
                        group.id,
                        group.name,
                        rewardsJson,
                        group.createdAt,
                        group.updatedAt,
                        groupJson,
                    ],
                );
            }
            for (const code of normalized.codes) {
                const codeJson = JSON.stringify(code);
                await client.query(
                    `
                      INSERT INTO ${REDEEM_CODE_TABLE}(
                        code_id,
                        group_id,
                        code,
                        status,
                        used_by_player_id,
                        used_by_role_name,
                        used_at,
                        destroyed_at,
                        created_at,
                        updated_at,
                        raw_payload
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::timestamptz, $11::jsonb)
                      ON CONFLICT (code_id)
                      DO UPDATE SET
                        status = CASE
                          WHEN ${REDEEM_CODE_TABLE}.status = 'used' AND EXCLUDED.status <> 'used' THEN ${REDEEM_CODE_TABLE}.status
                          WHEN ${REDEEM_CODE_TABLE}.status = 'destroyed' AND EXCLUDED.status = 'active' THEN ${REDEEM_CODE_TABLE}.status
                          ELSE EXCLUDED.status
                        END,
                        used_by_player_id = CASE
                          WHEN ${REDEEM_CODE_TABLE}.status = 'used' AND EXCLUDED.status <> 'used' THEN ${REDEEM_CODE_TABLE}.used_by_player_id
                          ELSE EXCLUDED.used_by_player_id
                        END,
                        used_by_role_name = CASE
                          WHEN ${REDEEM_CODE_TABLE}.status = 'used' AND EXCLUDED.status <> 'used' THEN ${REDEEM_CODE_TABLE}.used_by_role_name
                          ELSE EXCLUDED.used_by_role_name
                        END,
                        used_at = CASE
                          WHEN ${REDEEM_CODE_TABLE}.status = 'used' AND EXCLUDED.status <> 'used' THEN ${REDEEM_CODE_TABLE}.used_at
                          ELSE EXCLUDED.used_at
                        END,
                        destroyed_at = CASE
                          WHEN ${REDEEM_CODE_TABLE}.status = 'destroyed' AND EXCLUDED.status = 'active' THEN ${REDEEM_CODE_TABLE}.destroyed_at
                          ELSE EXCLUDED.destroyed_at
                        END,
                        updated_at = CASE
                          WHEN ${REDEEM_CODE_TABLE}.status <> 'active' AND EXCLUDED.status = 'active' THEN ${REDEEM_CODE_TABLE}.updated_at
                          ELSE EXCLUDED.updated_at
                        END,
                        raw_payload = CASE
                          WHEN ${REDEEM_CODE_TABLE}.status <> 'active' AND EXCLUDED.status = 'active' THEN ${REDEEM_CODE_TABLE}.raw_payload
                          ELSE EXCLUDED.raw_payload
                        END
                    `,
                    [
                        code.id,
                        code.groupId,
                        code.code,
                        code.status,
                        code.usedByPlayerId,
                        code.usedByRoleName,
                        code.usedAt,
                        code.destroyedAt,
                        code.createdAt,
                        code.updatedAt,
                        codeJson,
                    ],
                );
            }
            await client.query('COMMIT');
            return true;
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        }
        finally {
            client.release();
        }
    }
    /** 删除兑换码分组及其未使用码；数据库内已有使用记录时拒绝，保留核销审计。 */
    async deleteGroup(groupId, revision) {
        await this.ensureReady();
        if (!this.pool || !this.enabled) {
            return false;
        }
        const normalizedGroupId = typeof groupId === 'string' ? groupId.trim() : '';
        const normalizedRevision = Math.max(1, Math.trunc(Number(revision) || 1));
        if (!normalizedGroupId) {
            return { ok: false, reason: 'invalid_group_id' };
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const groupResult = await client.query(
                `
                  SELECT group_id
                  FROM ${REDEEM_CODE_GROUP_TABLE}
                  WHERE group_id = $1
                  FOR UPDATE
                `,
                [normalizedGroupId],
            );
            if ((groupResult.rowCount ?? 0) === 0) {
                await client.query('COMMIT');
                return { ok: true, deletedCodeCount: 0 };
            }
            const codeResult = await client.query(
                `
                  SELECT code_id, status
                  FROM ${REDEEM_CODE_TABLE}
                  WHERE group_id = $1
                  FOR UPDATE
                `,
                [normalizedGroupId],
            );
            if (codeResult.rows.some((row) => row.status === 'used')) {
                await client.query('ROLLBACK');
                return { ok: false, reason: 'used_code_exists' };
            }
            const deletedCodes = await client.query(
                `DELETE FROM ${REDEEM_CODE_TABLE} WHERE group_id = $1`,
                [normalizedGroupId],
            );
            await client.query(
                `DELETE FROM ${REDEEM_CODE_GROUP_TABLE} WHERE group_id = $1`,
                [normalizedGroupId],
            );
            await client.query(
                `
                  INSERT INTO ${REDEEM_CODE_STATE_TABLE}(state_key, revision, updated_at)
                  VALUES ($1, $2, now())
                  ON CONFLICT (state_key)
                  DO UPDATE SET revision = EXCLUDED.revision, updated_at = now()
                `,
                [REDEEM_CODE_STATE_KEY, normalizedRevision],
            );
            await client.query('COMMIT');
            return { ok: true, deletedCodeCount: deletedCodes.rowCount ?? 0 };
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        }
        finally {
            client.release();
        }
    }
    /** 原子核销兑换码：只有 active 状态能被置为 used，跨节点并发只有一个调用成功。 */
    async claimCodeForUse(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        await this.ensureReady();
        if (!this.pool || !this.enabled) {
            if (isRedeemCodeDatabaseConfigured()) {
                return { ok: false, reason: 'persistence_unavailable' };
            }
            return { ok: true, skipped: true };
        }
        const code = typeof input?.code === 'string' ? input.code.trim().toUpperCase() : '';
        const playerId = typeof input?.playerId === 'string' ? input.playerId.trim() : '';
        const playerName = typeof input?.playerName === 'string' ? input.playerName.trim() : '';
        const usedAt = typeof input?.usedAt === 'string' && input.usedAt.trim() ? input.usedAt.trim() : new Date().toISOString();
        if (!code || !playerId) {
            return { ok: false, reason: 'invalid_input' };
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(
                `
                  UPDATE ${REDEEM_CODE_TABLE}
                  SET
                    status = 'used',
                    used_by_player_id = $2,
                    used_by_role_name = $3,
                    used_at = $4::timestamptz,
                    updated_at = $4::timestamptz,
                    raw_payload = raw_payload
                      || jsonb_build_object(
                        'status', 'used',
                        'usedByPlayerId', $5::text,
                        'usedByRoleName', $6::text,
                        'usedAt', $7::text,
                        'updatedAt', $7::text
                      )
                  WHERE code = $1 AND status = 'active'
                  RETURNING code_id, group_id, code, status, used_by_player_id, used_by_role_name, used_at, updated_at
                `,
                [code, playerId, playerName || playerId, usedAt, playerId, playerName || playerId, usedAt],
            );
            if ((result.rowCount ?? 0) !== 1) {
                await client.query('ROLLBACK');
                return { ok: false, reason: 'not_active' };
            }
            const row = result.rows[0];
            await client.query(
                `
                  UPDATE ${REDEEM_CODE_GROUP_TABLE}
                  SET
                    updated_at = $2::timestamptz,
                    raw_payload = jsonb_set(raw_payload, '{updatedAt}', to_jsonb($3::text), true)
                  WHERE group_id = $1
                `,
                [row.group_id, usedAt, usedAt],
            );
            await client.query(
                `
                  INSERT INTO ${REDEEM_CODE_STATE_TABLE}(state_key, revision, updated_at)
                  VALUES ($1, 2, now())
                  ON CONFLICT (state_key)
                  DO UPDATE SET revision = ${REDEEM_CODE_STATE_TABLE}.revision + 1, updated_at = now()
                `,
                [REDEEM_CODE_STATE_KEY],
            );
            await client.query('COMMIT');
            return {
                ok: true,
                skipped: false,
                code: {
                    id: typeof row.code_id === 'string' ? row.code_id : '',
                    groupId: typeof row.group_id === 'string' ? row.group_id : '',
                    code: typeof row.code === 'string' ? row.code : '',
                    status: 'used',
                    usedByPlayerId: typeof row.used_by_player_id === 'string' ? row.used_by_player_id : playerId,
                    usedByRoleName: typeof row.used_by_role_name === 'string' ? row.used_by_role_name : (playerName || playerId),
                    usedAt: normalizeNullableDbTimestamp(row.used_at) ?? usedAt,
                    updatedAt: normalizeDbTimestamp(row.updated_at),
                },
            };
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        }
        finally {
            client.release();
        }
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

async function ensureRedeemCodeTables(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${REDEEM_CODE_STATE_TABLE} (
            state_key varchar(64) PRIMARY KEY,
            revision bigint NOT NULL DEFAULT 1,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${REDEEM_CODE_GROUP_TABLE} (
            group_id varchar(120) PRIMARY KEY,
            name varchar(160) NOT NULL,
            rewards_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${REDEEM_CODE_TABLE} (
            code_id varchar(160) PRIMARY KEY,
            group_id varchar(120) NOT NULL,
            code varchar(160) NOT NULL UNIQUE,
            status varchar(32) NOT NULL,
            used_by_player_id varchar(100),
            used_by_role_name varchar(120),
            used_at timestamptz,
            destroyed_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
          )
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_redeem_code_group_idx
          ON ${REDEEM_CODE_TABLE}(group_id, status)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_redeem_code_used_by_idx
          ON ${REDEEM_CODE_TABLE}(used_by_player_id)
        `);
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

/** 清洗兑换码文档结构，确保组与码条目字段完整可用。 */
function normalizeRedeemCodeDocument(raw) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const candidate = raw;
    if (candidate.version !== 1) {
        return null;
    }
    return {
        version: 1,
        revision: Number.isFinite(candidate.revision) ? Math.max(1, Math.trunc(Number(candidate.revision ?? 1))) : 1,
        groups: Array.isArray(candidate.groups)
            ? candidate.groups
                .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
                .map((entry) => ({
                id: String(entry.id),

                name: typeof entry.name === 'string' ? entry.name : '',
                rewards: Array.isArray(entry.rewards)
                    ? entry.rewards
                        .filter((reward) => reward && typeof reward === 'object' && typeof reward.itemId === 'string')
                        .map((reward) => ({
                        itemId: String(reward.itemId),
                        count: Number.isFinite(reward.count) ? Math.max(1, Math.trunc(Number(reward.count))) : 1,
                    }))
                    : [],

                createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString(),

                updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date(0).toISOString(),
            }))
            : [],
        codes: Array.isArray(candidate.codes)
            ? candidate.codes
                .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
                .map((entry) => ({
                id: String(entry.id),

                groupId: typeof entry.groupId === 'string' ? entry.groupId : '',

                code: typeof entry.code === 'string' ? entry.code : '',

                status: entry.status === 'used' || entry.status === 'destroyed' ? entry.status : 'active',

                usedByPlayerId: typeof entry.usedByPlayerId === 'string' ? entry.usedByPlayerId : null,

                usedByRoleName: typeof entry.usedByRoleName === 'string' ? entry.usedByRoleName : null,

                usedAt: typeof entry.usedAt === 'string' ? entry.usedAt : null,

                destroyedAt: typeof entry.destroyedAt === 'string' ? entry.destroyedAt : null,

                createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString(),

                updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date(0).toISOString(),
            }))
            : [],
    };
}

function normalizeDbTimestamp(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date(0).toISOString();
    }
    return new Date(0).toISOString();
}

function normalizeNullableDbTimestamp(value) {
    if (value == null) {
        return null;
    }
    return normalizeDbTimestamp(value);
}

function resolveRedeemCodeDatabaseUrl() {
    return resolveServerDatabasePoolerUrl() || resolveServerDatabaseUrl();
}

function isRedeemCodeDatabaseConfigured() {
    return Boolean(resolveRedeemCodeDatabaseUrl().trim());
}
