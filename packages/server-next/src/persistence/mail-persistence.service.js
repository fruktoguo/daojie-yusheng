"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MailPersistenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailPersistenceService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const persistent_document_table_1 = require("./persistent-document-table");
const env_alias_1 = require("../config/env-alias");
const MAILBOX_SCOPE = 'server_next_mailboxes_v1';
let MailPersistenceService = MailPersistenceService_1 = class MailPersistenceService {
    logger = new common_1.Logger(MailPersistenceService_1.name);
    pool = null;
    enabled = false;
    async onModuleInit() {
        const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
        if (!databaseUrl.trim()) {
            this.logger.log('Mail persistence disabled: no SERVER_NEXT_DATABASE_URL/DATABASE_URL');
            return;
        }
        this.pool = new pg_1.Pool({
            connectionString: databaseUrl,
        });
        try {
            await (0, persistent_document_table_1.ensurePersistentDocumentsTable)(this.pool);
            this.enabled = true;
            this.logger.log('Mail persistence enabled via persistent_documents');
        }
        catch (error) {
            this.logger.error('Mail persistence init failed, fallback to disabled mode', error instanceof Error ? error.stack : String(error));
            await this.safeClosePool();
        }
    }
    async onModuleDestroy() {
        await this.safeClosePool();
    }
    async loadMailbox(playerId) {
        if (!this.pool || !this.enabled) {
            return null;
        }
        const result = await this.pool.query('SELECT payload FROM persistent_documents WHERE scope = $1 AND key = $2', [MAILBOX_SCOPE, playerId]);
        if (result.rowCount === 0) {
            return null;
        }
        return normalizeMailbox(result.rows[0]?.payload);
    }
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
    async safeClosePool() {
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
function normalizeMailbox(raw) {
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
        mails: Array.isArray(candidate.mails)
            ? candidate.mails
                .map((entry) => normalizeMailEntry(entry))
                .filter((entry) => Boolean(entry))
                .sort((left, right) => right.createdAt - left.createdAt || left.mailId.localeCompare(right.mailId))
            : [],
    };
}
function normalizeMailEntry(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
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
        templateId: typeof candidate.templateId === 'string' ? candidate.templateId : null,
        args: Array.isArray(candidate.args) ? candidate.args.map((entry) => ({ ...entry })) : [],
        fallbackTitle: typeof candidate.fallbackTitle === 'string' ? candidate.fallbackTitle : null,
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
