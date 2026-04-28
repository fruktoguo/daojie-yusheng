// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var SuggestionPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuggestionPersistenceService = void 0;

const common_1 = require("@nestjs/common");

const pg_1 = require("pg");

const env_alias_1 = require("../config/env-alias");

const SUGGESTION_STATE_TABLE = 'server_suggestion_state';
const SUGGESTION_TABLE = 'server_suggestion';
const SUGGESTION_STATE_KEY = 'global';

/** 建议持久化服务：保存/恢复全服建议与回复投票状态。 */
let SuggestionPersistenceService = SuggestionPersistenceService_1 = class SuggestionPersistenceService {
/**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(SuggestionPersistenceService_1.name);    
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
            this.logger.log('建议持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await ensureSuggestionTables(this.pool);
            this.enabled = true;
            this.logger.log('建议持久化已启用（server_suggestion）');
        }
        catch (error) {
            this.logger.error('建议持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
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
 * loadSuggestions：读取Suggestion并返回结果。
 * @returns 无返回值，完成Suggestion的读取/组装。
 */

    async loadSuggestions() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.enabled) {
            return null;
        }

        const stateResult = await this.pool.query(
            `SELECT revision FROM ${SUGGESTION_STATE_TABLE} WHERE state_key = $1 LIMIT 1`,
            [SUGGESTION_STATE_KEY],
        );
        const suggestionResult = await this.pool.query(
            `
              SELECT suggestion_id, status, category, author_player_id, created_at_ms,
                     updated_at_ms, author_last_read_gm_reply_at, upvotes_payload,
                     downvotes_payload, replies_payload, raw_payload
              FROM ${SUGGESTION_TABLE}
              ORDER BY created_at_ms DESC, suggestion_id ASC
            `,
        );
        if ((suggestionResult.rowCount ?? 0) === 0 && (stateResult.rowCount ?? 0) === 0) {
            return null;
        }
        return normalizeSuggestionDocument({
            version: 1,
            revision: Number(stateResult.rows?.[0]?.revision ?? 1),
            suggestions: suggestionResult.rows.map((row) => ({
                ...(row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload : {}),
                id: typeof row.suggestion_id === 'string' ? row.suggestion_id : '',
                status: typeof row.status === 'string' ? row.status : undefined,
                category: typeof row.category === 'string' ? row.category : undefined,
                authorPlayerId: typeof row.author_player_id === 'string' ? row.author_player_id : undefined,
                upvotes: Array.isArray(row.upvotes_payload) ? row.upvotes_payload : [],
                downvotes: Array.isArray(row.downvotes_payload) ? row.downvotes_payload : [],
                replies: Array.isArray(row.replies_payload) ? row.replies_payload : [],
                authorLastReadGmReplyAt: Number(row.author_last_read_gm_reply_at ?? 0),
                createdAt: Number(row.created_at_ms ?? Date.now()),
                updatedAt: Number(row.updated_at_ms ?? row.created_at_ms ?? Date.now()),
            })),
        });
    }    
    /**
 * saveSuggestions：执行saveSuggestion相关逻辑。
 * @param document 参数说明。
 * @returns 无返回值，直接更新saveSuggestion相关状态。
 */

    async saveSuggestions(document) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.enabled) {
            return;
        }
        const normalized = normalizeSuggestionDocument(document);
        if (!normalized) {
            return;
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `
                  INSERT INTO ${SUGGESTION_STATE_TABLE}(state_key, revision, updated_at)
                  VALUES ($1, $2, now())
                  ON CONFLICT (state_key)
                  DO UPDATE SET revision = EXCLUDED.revision, updated_at = now()
                `,
                [SUGGESTION_STATE_KEY, normalized.revision],
            );
            await client.query(`DELETE FROM ${SUGGESTION_TABLE}`);
            for (const suggestion of normalized.suggestions) {
                await client.query(
                    `
                      INSERT INTO ${SUGGESTION_TABLE}(
                        suggestion_id,
                        status,
                        category,
                        author_player_id,
                        created_at_ms,
                        updated_at_ms,
                        author_last_read_gm_reply_at,
                        upvotes_payload,
                        downvotes_payload,
                        replies_payload,
                        raw_payload,
                        updated_at
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, now())
                    `,
                    [
                        suggestion.id,
                        normalizeOptionalString(suggestion.status),
                        normalizeOptionalString(suggestion.category),
                        normalizeOptionalString(suggestion.authorPlayerId ?? suggestion.playerId ?? suggestion.authorId),
                        normalizeInteger(suggestion.createdAt, Date.now()),
                        normalizeInteger(suggestion.updatedAt, suggestion.createdAt ?? Date.now()),
                        normalizeInteger(suggestion.authorLastReadGmReplyAt, 0),
                        JSON.stringify(suggestion.upvotes),
                        JSON.stringify(suggestion.downvotes),
                        JSON.stringify(suggestion.replies),
                        JSON.stringify(suggestion),
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
exports.SuggestionPersistenceService = SuggestionPersistenceService;
exports.SuggestionPersistenceService = SuggestionPersistenceService = SuggestionPersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], SuggestionPersistenceService);

async function ensureSuggestionTables(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${SUGGESTION_STATE_TABLE} (
            state_key varchar(64) PRIMARY KEY,
            revision bigint NOT NULL DEFAULT 1,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS ${SUGGESTION_TABLE} (
            suggestion_id varchar(160) PRIMARY KEY,
            status varchar(32),
            category varchar(80),
            author_player_id varchar(100),
            created_at_ms bigint NOT NULL,
            updated_at_ms bigint NOT NULL,
            author_last_read_gm_reply_at bigint NOT NULL DEFAULT 0,
            upvotes_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
            downvotes_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
            replies_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
            raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_suggestion_author_idx
          ON ${SUGGESTION_TABLE}(author_player_id, created_at_ms DESC)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS server_suggestion_status_idx
          ON ${SUGGESTION_TABLE}(status, updated_at_ms DESC)
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

/** 统一清洗建议文档，过滤无效字段并规整投票/回复列表。 */
function normalizeSuggestionDocument(raw) {
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
        suggestions: Array.isArray(candidate.suggestions)
            ? candidate.suggestions
                .filter((entry) => typeof entry === 'object' && entry !== null && typeof entry.id === 'string')
                .map((entry) => ({
                ...entry,
                upvotes: Array.isArray(entry.upvotes) ? entry.upvotes.filter((vote) => typeof vote === 'string') : [],
                downvotes: Array.isArray(entry.downvotes) ? entry.downvotes.filter((vote) => typeof vote === 'string') : [],
                replies: Array.isArray(entry.replies)
                    ? entry.replies
                        .filter((reply) => typeof reply === 'object' && reply !== null && typeof reply.id === 'string')
                        .map((reply) => ({ ...reply }))
                    : [],
                authorLastReadGmReplyAt: Number.isFinite(entry.authorLastReadGmReplyAt)
                    ? Math.max(0, Math.trunc(Number(entry.authorLastReadGmReplyAt)))
                    : 0,
                createdAt: Number.isFinite(entry.createdAt) ? Math.trunc(Number(entry.createdAt)) : Date.now(),
            }))
            : [],
    };
}

function normalizeOptionalString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeInteger(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : Math.trunc(Number(fallback ?? 0));
}
export { SuggestionPersistenceService };
//# sourceMappingURL=suggestion-persistence.service.js.map
