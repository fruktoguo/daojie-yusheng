"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** RedeemCodePersistenceService_1：定义该变量以承载业务值。 */
var RedeemCodePersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedeemCodePersistenceService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** persistent_document_table_1：定义该变量以承载业务值。 */
const persistent_document_table_1 = require("./persistent-document-table");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** REDEEM_CODE_SCOPE：定义该变量以承载业务值。 */
const REDEEM_CODE_SCOPE = 'server_next_redeem_codes_v1';
/** REDEEM_CODE_KEY：定义该变量以承载业务值。 */
const REDEEM_CODE_KEY = 'global';
/** RedeemCodePersistenceService：定义该变量以承载业务值。 */
let RedeemCodePersistenceService = RedeemCodePersistenceService_1 = class RedeemCodePersistenceService {
    logger = new common_1.Logger(RedeemCodePersistenceService_1.name);
    pool = null;
    enabled = false;
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
/** databaseUrl：定义该变量以承载业务值。 */
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('Redeem code persistence disabled: no SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            this.logger.log('Redeem code persistence enabled via persistent_documents');
        }
        catch (error) {
            this.logger.error('Redeem code persistence init failed, fallback to disabled mode', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
/** onModuleDestroy：执行对应的业务逻辑。 */
    async onModuleDestroy() {
        await this.safeClosePool();
    }
/** loadDocument：执行对应的业务逻辑。 */
    async loadDocument() {
        if (!this.pool || !this.enabled) {
            return null;
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [REDEEM_CODE_SCOPE, REDEEM_CODE_KEY]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizeRedeemCodeDocument(result.rows[0]?.payload);
    }
/** saveDocument：执行对应的业务逻辑。 */
    async saveDocument(document) {
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
/** safeClosePool：执行对应的业务逻辑。 */
    async safeClosePool() {
/** pool：定义该变量以承载业务值。 */
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
/** normalizeRedeemCodeDocument：执行对应的业务逻辑。 */
function normalizeRedeemCodeDocument(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
/** candidate：定义该变量以承载业务值。 */
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
/** name：定义该变量以承载业务值。 */
                name: typeof entry.name === 'string' ? entry.name : '',
                rewards: Array.isArray(entry.rewards)
                    ? entry.rewards
                        .filter((reward) => reward && typeof reward === 'object' && typeof reward.itemId === 'string')
                        .map((reward) => ({
                        itemId: String(reward.itemId),
                        count: Number.isFinite(reward.count) ? Math.max(1, Math.trunc(Number(reward.count))) : 1,
                    }))
                    : [],
/** createdAt：定义该变量以承载业务值。 */
                createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString(),
/** updatedAt：定义该变量以承载业务值。 */
                updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date(0).toISOString(),
            }))
            : [],
        codes: Array.isArray(candidate.codes)
            ? candidate.codes
                .filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string')
                .map((entry) => ({
                id: String(entry.id),
/** groupId：定义该变量以承载业务值。 */
                groupId: typeof entry.groupId === 'string' ? entry.groupId : '',
/** code：定义该变量以承载业务值。 */
                code: typeof entry.code === 'string' ? entry.code : '',
/** status：定义该变量以承载业务值。 */
                status: entry.status === 'used' || entry.status === 'destroyed' ? entry.status : 'active',
/** usedByPlayerId：定义该变量以承载业务值。 */
                usedByPlayerId: typeof entry.usedByPlayerId === 'string' ? entry.usedByPlayerId : null,
/** usedByRoleName：定义该变量以承载业务值。 */
                usedByRoleName: typeof entry.usedByRoleName === 'string' ? entry.usedByRoleName : null,
/** usedAt：定义该变量以承载业务值。 */
                usedAt: typeof entry.usedAt === 'string' ? entry.usedAt : null,
/** destroyedAt：定义该变量以承载业务值。 */
                destroyedAt: typeof entry.destroyedAt === 'string' ? entry.destroyedAt : null,
/** createdAt：定义该变量以承载业务值。 */
                createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date(0).toISOString(),
/** updatedAt：定义该变量以承载业务值。 */
                updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date(0).toISOString(),
            }))
            : [],
    };
}
//# sourceMappingURL=redeem-code-persistence.service.js.map
