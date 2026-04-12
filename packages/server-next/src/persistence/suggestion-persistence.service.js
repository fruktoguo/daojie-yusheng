"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** SuggestionPersistenceService_1：定义该变量以承载业务值。 */
var SuggestionPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuggestionPersistenceService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** persistent_document_table_1：定义该变量以承载业务值。 */
const persistent_document_table_1 = require("./persistent-document-table");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** SUGGESTION_SCOPE：定义该变量以承载业务值。 */
const SUGGESTION_SCOPE = 'server_next_suggestions_v1';
/** SUGGESTION_KEY：定义该变量以承载业务值。 */
const SUGGESTION_KEY = 'global';
/** SuggestionPersistenceService：定义该变量以承载业务值。 */
let SuggestionPersistenceService = SuggestionPersistenceService_1 = class SuggestionPersistenceService {
    logger = new common_1.Logger(SuggestionPersistenceService_1.name);
    pool = null;
    enabled = false;
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
/** databaseUrl：定义该变量以承载业务值。 */
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('Suggestion persistence disabled: no SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            this.logger.log('Suggestion persistence enabled via persistent_documents');
        }
        catch (error) {
            this.logger.error('Suggestion persistence init failed, fallback to disabled mode', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
/** onModuleDestroy：执行对应的业务逻辑。 */
    async onModuleDestroy() {
        await this.safeClosePool();
    }
/** loadSuggestions：执行对应的业务逻辑。 */
    async loadSuggestions() {
        if (!this.pool || !this.enabled) {
            return null;
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [SUGGESTION_SCOPE, SUGGESTION_KEY]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizeSuggestionDocument(result.rows[0]?.payload);
    }
/** saveSuggestions：执行对应的业务逻辑。 */
    async saveSuggestions(document) {
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
exports.SuggestionPersistenceService = SuggestionPersistenceService;
exports.SuggestionPersistenceService = SuggestionPersistenceService = SuggestionPersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], SuggestionPersistenceService);
/** normalizeSuggestionDocument：执行对应的业务逻辑。 */
function normalizeSuggestionDocument(raw) {
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
//# sourceMappingURL=suggestion-persistence.service.js.map
