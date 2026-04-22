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

const persistent_document_table_1 = require("./persistent-document-table");

const env_alias_1 = require("../config/env-alias");

const SUGGESTION_SCOPE = 'server_suggestions_v1';

const SUGGESTION_KEY = 'global';

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
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            this.logger.log('建议持久化已启用（persistent_documents）');
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

        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [SUGGESTION_SCOPE, SUGGESTION_KEY]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizeSuggestionDocument(result.rows[0]?.payload);
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
        await this.pool.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
      `, [SUGGESTION_SCOPE, SUGGESTION_KEY, JSON.stringify(document)]);
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
export { SuggestionPersistenceService };
//# sourceMappingURL=suggestion-persistence.service.js.map

