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

const persistent_document_table_1 = require("./persistent-document-table");

const env_alias_1 = require("../config/env-alias");

const REDEEM_CODE_SCOPE = 'server_next_redeem_codes_v1';

const REDEEM_CODE_KEY = 'global';

/** 兑换码持久化服务：保存/读取兑换码组与兑换码实例状态。 */
let RedeemCodePersistenceService = RedeemCodePersistenceService_1 = class RedeemCodePersistenceService {
/**
 * logger：对象字段。
 */

    logger = new common_1.Logger(RedeemCodePersistenceService_1.name);    
    /**
 * pool：对象字段。
 */

    pool = null;    
    /**
 * enabled：对象字段。
 */

    enabled = false;    
    /**
 * onModuleInit：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    async onModuleInit() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('兑换码持久化已禁用：未提供 SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            this.logger.log('兑换码持久化已启用（persistent_documents）');
        }
        catch (error) {
            this.logger.error('兑换码持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }    
    /**
 * onModuleDestroy：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    async onModuleDestroy() {
        await this.safeClosePool();
    }    
    /**
 * loadDocument：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    async loadDocument() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.enabled) {
            return null;
        }

        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [REDEEM_CODE_SCOPE, REDEEM_CODE_KEY]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizeRedeemCodeDocument(result.rows[0]?.payload);
    }    
    /**
 * saveDocument：执行核心业务逻辑。
 * @param document 参数说明。
 * @returns 函数返回值。
 */

    async saveDocument(document) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.pool || !this.enabled) {
            return;
        }
        await this.pool.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
      `, [REDEEM_CODE_SCOPE, REDEEM_CODE_KEY, JSON.stringify(document)]);
    }    
    /**
 * safeClosePool：执行核心业务逻辑。
 * @returns 函数返回值。
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
export { RedeemCodePersistenceService };
//# sourceMappingURL=redeem-code-persistence.service.js.map

