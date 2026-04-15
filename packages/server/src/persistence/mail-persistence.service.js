"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** MailPersistenceService_1：定义该变量以承载业务值。 */
var MailPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailPersistenceService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** pg_1：定义该变量以承载业务值。 */
const pg_1 = require("pg");
/** persistent_document_table_1：定义该变量以承载业务值。 */
const persistent_document_table_1 = require("./persistent-document-table");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
/** MAILBOX_SCOPE：定义该变量以承载业务值。 */
const MAILBOX_SCOPE = 'server_next_mailboxes_v1';
/** MailPersistenceService：定义该变量以承载业务值。 */
let MailPersistenceService = MailPersistenceService_1 = class MailPersistenceService {
    logger = new common_1.Logger(MailPersistenceService_1.name);
    pool = null;
    enabled = false;
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
/** databaseUrl：定义该变量以承载业务值。 */
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('邮件持久化已禁用：未提供 SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            this.logger.log('邮件持久化已启用（persistent_documents）');
        }
        catch (error) {
            this.logger.error('邮件持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
/** onModuleDestroy：执行对应的业务逻辑。 */
    async onModuleDestroy() {
        await this.safeClosePool();
    }
/** loadMailbox：执行对应的业务逻辑。 */
    async loadMailbox(playerId) {
        if (!this.pool || !this.enabled) {
            return null;
        }
/** result：定义该变量以承载业务值。 */
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [MAILBOX_SCOPE, playerId]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizeMailbox(result.rows[0]?.payload);
    }
/** saveMailbox：执行对应的业务逻辑。 */
    async saveMailbox(playerId, mailbox) {
        if (!this.pool || !this.enabled) {
            return;
        }
        await this.pool.query(`
        INSERT INTO persistent_documents(scope, key, payload, "updatedAt")
        VALUES ($1, $2, $3::jsonb, now())
        ON CONFLICT (scope, key)
        DO UPDATE SET payload = EXCLUDED.payload, "updatedAt" = now()
      `, [MAILBOX_SCOPE, playerId, JSON.stringify(mailbox)]);
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
exports.MailPersistenceService = MailPersistenceService;
exports.MailPersistenceService = MailPersistenceService = MailPersistenceService_1 = __decorate([
    (0, common_1.Injectable)()
], MailPersistenceService);
/** normalizeMailbox：执行对应的业务逻辑。 */
function normalizeMailbox(raw) {
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
        mails: Array.isArray(candidate.mails)
            ? candidate.mails
                .map((entry) => normalizeMailEntry(entry))
                .filter((entry) => Boolean(entry))
                .sort((left, right) => right.createdAt - left.createdAt || left.mailId.localeCompare(right.mailId))
            : [],
    };
}
/** normalizeMailEntry：执行对应的业务逻辑。 */
function normalizeMailEntry(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
/** candidate：定义该变量以承载业务值。 */
    const candidate = raw;
    if (candidate.version !== 1
        || typeof candidate.mailId !== 'string'
        || typeof candidate.senderLabel !== 'string') {
        return null;
    }
    return {
        version: 1,
        mailId: candidate.mailId,
        senderLabel: candidate.senderLabel,
/** templateId：定义该变量以承载业务值。 */
        templateId: typeof candidate.templateId === 'string' ? candidate.templateId : null,
        args: Array.isArray(candidate.args) ? candidate.args.map((entry) => ({ ...entry })) : [],
/** fallbackTitle：定义该变量以承载业务值。 */
        fallbackTitle: typeof candidate.fallbackTitle === 'string' ? candidate.fallbackTitle : null,
/** fallbackBody：定义该变量以承载业务值。 */
        fallbackBody: typeof candidate.fallbackBody === 'string' ? candidate.fallbackBody : null,
        attachments: Array.isArray(candidate.attachments)
            ? candidate.attachments
                .filter((entry) => typeof entry === 'object' && entry !== null && typeof entry.itemId === 'string')
                .map((entry) => ({
                itemId: entry.itemId,
                count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(Number(entry.count ?? 1))) : 1,
            }))
            : [],
        createdAt: Number.isFinite(candidate.createdAt) ? Math.trunc(Number(candidate.createdAt ?? Date.now())) : Date.now(),
        updatedAt: Number.isFinite(candidate.updatedAt) ? Math.trunc(Number(candidate.updatedAt ?? Date.now())) : Date.now(),
        expireAt: Number.isFinite(candidate.expireAt) ? Math.trunc(Number(candidate.expireAt)) : null,
        firstSeenAt: Number.isFinite(candidate.firstSeenAt) ? Math.trunc(Number(candidate.firstSeenAt)) : null,
        readAt: Number.isFinite(candidate.readAt) ? Math.trunc(Number(candidate.readAt)) : null,
        claimedAt: Number.isFinite(candidate.claimedAt) ? Math.trunc(Number(candidate.claimedAt)) : null,
        deletedAt: Number.isFinite(candidate.deletedAt) ? Math.trunc(Number(candidate.deletedAt)) : null,
    };
}
//# sourceMappingURL=mail-persistence.service.js.map
