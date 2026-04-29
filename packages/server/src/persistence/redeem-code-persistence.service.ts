// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var RedeemCodePersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedeemCodePersistenceService = void 0;

const common_1 = require("@nestjs/common");

const pg_1 = require("pg");

const env_alias_1 = require("../config/env-alias");

const REDEEM_CODE_STATE_TABLE = 'server_redeem_code_state';
const REDEEM_CODE_GROUP_TABLE = 'server_redeem_code_group';
const REDEEM_CODE_TABLE = 'server_redeem_code';
const REDEEM_CODE_STATE_KEY = 'global';

/** 兑换码持久化服务：保存/读取兑换码组与兑换码实例状态。 */
let RedeemCodePersistenceService = RedeemCodePersistenceService_1 = class RedeemCodePersistenceService {
/**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(RedeemCodePersistenceService_1.name);    
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
            this.logger.log('兑换码持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await ensureRedeemCodeTables(this.pool);
            this.enabled = true;
            this.logger.log('兑换码持久化已启用（server_redeem_code_group + server_redeem_code）');
        }
        catch (error) {
            this.logger.error('兑换码持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
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
    /**
 * loadDocument：读取Document并返回结果。
 * @returns 无返回值，完成Document的读取/组装。
 */

    async loadDocument() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.enabled) {
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

        if (!this.pool || !this.enabled) {
            return;
        }
        const normalized = normalizeRedeemCodeDocument(document);
        if (!normalized) {
            return;
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
            await client.query(`DELETE FROM ${REDEEM_CODE_TABLE}`);
            await client.query(`DELETE FROM ${REDEEM_CODE_GROUP_TABLE}`);
            for (const group of normalized.groups) {
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
                    `,
                    [
                        group.id,
                        group.name,
                        JSON.stringify(group.rewards),
                        group.createdAt,
                        group.updatedAt,
                        JSON.stringify(group),
                    ],
                );
            }
            for (const code of normalized.codes) {
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
                        JSON.stringify(code),
                    ],
                );
            }
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
exports.RedeemCodePersistenceService = RedeemCodePersistenceService;
exports.RedeemCodePersistenceService = RedeemCodePersistenceService = RedeemCodePersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], RedeemCodePersistenceService);

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
export { RedeemCodePersistenceService };
//# sourceMappingURL=redeem-code-persistence.service.js.map
