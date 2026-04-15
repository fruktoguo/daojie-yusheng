"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailRuntimeService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** content_template_repository_1：定义该变量以承载业务值。 */
const content_template_repository_1 = require("../../content/content-template.repository");
/** mail_persistence_service_1：定义该变量以承载业务值。 */
const mail_persistence_service_1 = require("../../persistence/mail-persistence.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../player/player-runtime.service");
/** MAIL_WELCOME_TEMPLATE_ID：定义该变量以承载业务值。 */
const MAIL_WELCOME_TEMPLATE_ID = 'mail.welcome.v1';
/** MAIL_DEFAULT_SENDER_LABEL：定义该变量以承载业务值。 */
const MAIL_DEFAULT_SENDER_LABEL = '司命台';
/** MailRuntimeService：定义该变量以承载业务值。 */
let MailRuntimeService = class MailRuntimeService {
    contentTemplateRepository;
    playerRuntimeService;
    mailPersistenceService;
    mailboxByPlayerId = new Map();
    loadingMailboxByPlayerId = new Map();
/** 构造函数：执行实例初始化流程。 */
    constructor(contentTemplateRepository, playerRuntimeService, mailPersistenceService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.mailPersistenceService = mailPersistenceService;
    }
/** clearRuntimeCache：执行对应的业务逻辑。 */
    clearRuntimeCache() {
        this.mailboxByPlayerId.clear();
        this.loadingMailboxByPlayerId.clear();
    }
/** ensurePlayerMailbox：执行对应的业务逻辑。 */
    async ensurePlayerMailbox(playerId) {
/** cached：定义该变量以承载业务值。 */
        const cached = this.mailboxByPlayerId.get(playerId);
        if (cached) {
            return cached;
        }
/** existingLoad：定义该变量以承载业务值。 */
        const existingLoad = this.loadingMailboxByPlayerId.get(playerId);
        if (existingLoad) {
            return existingLoad;
        }
/** loading：定义该变量以承载业务值。 */
        const loading = (async () => {
/** loaded：定义该变量以承载业务值。 */
            const loaded = await this.mailPersistenceService.loadMailbox(playerId);
/** mailbox：定义该变量以承载业务值。 */
            const mailbox = loaded ?? createEmptyMailbox();
            this.compactMailbox(mailbox);
            this.mailboxByPlayerId.set(playerId, mailbox);
            this.loadingMailboxByPlayerId.delete(playerId);
            return mailbox;
        })();
        this.loadingMailboxByPlayerId.set(playerId, loading);
        return loading;
    }
/** ensureWelcomeMail：执行对应的业务逻辑。 */
    async ensureWelcomeMail(playerId) {
/** mailbox：定义该变量以承载业务值。 */
        const mailbox = await this.ensurePlayerMailbox(playerId);
        if (mailbox.mails.some((entry) => entry.templateId === MAIL_WELCOME_TEMPLATE_ID)) {
            return;
        }
        this.appendMail(mailbox, {
            templateId: MAIL_WELCOME_TEMPLATE_ID,
            attachments: [
                { itemId: 'pill.minor_heal', count: 2 },
                { itemId: 'spirit_stone', count: 8 },
            ],
        });
        await this.persistMailbox(playerId, mailbox);
    }
/** getSummary：执行对应的业务逻辑。 */
    async getSummary(playerId) {
/** mailbox：定义该变量以承载业务值。 */
        const mailbox = await this.ensurePlayerMailbox(playerId);
/** visible：定义该变量以承载业务值。 */
        const visible = this.listVisibleMails(mailbox);
/** unreadCount：定义该变量以承载业务值。 */
        let unreadCount = 0;
/** claimableCount：定义该变量以承载业务值。 */
        let claimableCount = 0;
        for (const entry of visible) {
            if (entry.readAt == null) {
                unreadCount += 1;
            }
            if (entry.attachments.length > 0 && entry.claimedAt == null) {
                claimableCount += 1;
            }
        }
        return {
            unreadCount,
            claimableCount,
            revision: mailbox.revision,
        };
    }
/** getPage：执行对应的业务逻辑。 */
    async getPage(playerId, requestedPage, requestedPageSize, requestedFilter) {
/** mailbox：定义该变量以承载业务值。 */
        const mailbox = await this.ensurePlayerMailbox(playerId);
/** filter：定义该变量以承载业务值。 */
        const filter = (0, shared_1.normalizeMailFilter)(requestedFilter);
/** pageSize：定义该变量以承载业务值。 */
        const pageSize = (0, shared_1.normalizeMailPageSize)(requestedPageSize);
/** filtered：定义该变量以承载业务值。 */
        const filtered = this.filterMails(this.listVisibleMails(mailbox), filter);
/** total：定义该变量以承载业务值。 */
        const total = filtered.length;
/** totalPages：定义该变量以承载业务值。 */
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
/** page：定义该变量以承载业务值。 */
        const page = Math.min(totalPages, Math.max(1, Math.floor(requestedPage || 1)));
/** start：定义该变量以承载业务值。 */
        const start = (page - 1) * pageSize;
        return {
            items: filtered.slice(start, start + pageSize).map((entry) => this.toMailListEntryView(entry)),
            total,
            page,
            pageSize,
            totalPages,
            filter,
        };
    }
/** getDetail：执行对应的业务逻辑。 */
    async getDetail(playerId, mailId) {
/** mailbox：定义该变量以承载业务值。 */
        const mailbox = await this.ensurePlayerMailbox(playerId);
/** entry：定义该变量以承载业务值。 */
        const entry = this.findVisibleMail(mailbox, mailId);
        return entry ? this.toMailDetailView(entry) : null;
    }
/** markRead：执行对应的业务逻辑。 */
    async markRead(playerId, mailIds) {
/** mailbox：定义该变量以承载业务值。 */
        const mailbox = await this.ensurePlayerMailbox(playerId);
/** normalizedIds：定义该变量以承载业务值。 */
        const normalizedIds = (0, shared_1.normalizeMailBatchIds)(mailIds);
        if (normalizedIds.length === 0) {
            return {
                operation: 'markRead',
                ok: false,
                mailIds: [],
                message: '未选择要标记已读的邮件。',
            };
        }
/** visible：定义该变量以承载业务值。 */
        const visible = this.findVisibleMails(mailbox, normalizedIds);
        if (visible.length === 0) {
            return {
                operation: 'markRead',
                ok: false,
                mailIds: [],
                message: '目标邮件不存在、已过期，或已被删除。',
            };
        }
/** now：定义该变量以承载业务值。 */
        const now = Date.now();
/** changed：定义该变量以承载业务值。 */
        let changed = false;
        for (const entry of visible) {
            if (entry.firstSeenAt == null) {
                entry.firstSeenAt = now;
                changed = true;
            }
            if (entry.readAt == null) {
                entry.readAt = now;
                entry.updatedAt = now;
                changed = true;
            }
        }
        if (changed) {
            mailbox.revision += 1;
            await this.persistMailbox(playerId, mailbox);
        }
        return {
            operation: 'markRead',
            ok: true,
            mailIds: visible.map((entry) => entry.mailId),
        };
    }
/** claimAttachments：执行对应的业务逻辑。 */
    async claimAttachments(playerId, mailIds) {
/** mailbox：定义该变量以承载业务值。 */
        const mailbox = await this.ensurePlayerMailbox(playerId);
/** normalizedIds：定义该变量以承载业务值。 */
        const normalizedIds = (0, shared_1.normalizeMailBatchIds)(mailIds);
        if (normalizedIds.length === 0) {
            return {
                operation: 'claim',
                ok: false,
                mailIds: [],
                message: '未选择要领取附件的邮件。',
            };
        }
/** visible：定义该变量以承载业务值。 */
        const visible = this.findVisibleMails(mailbox, normalizedIds)
            .filter((entry) => entry.attachments.length > 0 && entry.claimedAt == null);
        if (visible.length === 0) {
            return {
                operation: 'claim',
                ok: false,
                mailIds: [],
                message: '当前没有可领取附件的邮件。',
            };
        }
/** items：定义该变量以承载业务值。 */
        const items = this.resolveAttachmentItems(visible);
        if (!items) {
            return {
                operation: 'claim',
                ok: false,
                mailIds: visible.map((entry) => entry.mailId),
                message: '邮件附件包含无效物品，暂时无法领取。',
            };
        }
        if (!this.canReceiveAllAttachments(playerId, items)) {
            return {
                operation: 'claim',
                ok: false,
                mailIds: visible.map((entry) => entry.mailId),
                message: '背包空间不足，无法领取全部附件。',
            };
        }
        for (const item of items) {
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
        }
/** now：定义该变量以承载业务值。 */
        const now = Date.now();
        for (const entry of visible) {
            entry.firstSeenAt ??= now;
            entry.readAt ??= now;
            entry.claimedAt = now;
            entry.updatedAt = now;
        }
        mailbox.revision += 1;
        await this.persistMailbox(playerId, mailbox);
        return {
            operation: 'claim',
            ok: true,
            mailIds: visible.map((entry) => entry.mailId),
            message: `已领取 ${visible.length} 封邮件的附件。`,
        };
    }
/** deleteMails：执行对应的业务逻辑。 */
    async deleteMails(playerId, mailIds) {
/** mailbox：定义该变量以承载业务值。 */
        const mailbox = await this.ensurePlayerMailbox(playerId);
/** normalizedIds：定义该变量以承载业务值。 */
        const normalizedIds = (0, shared_1.normalizeMailBatchIds)(mailIds);
        if (normalizedIds.length === 0) {
            return {
                operation: 'delete',
                ok: false,
                mailIds: [],
                message: '未选择要删除的邮件。',
            };
        }
/** visible：定义该变量以承载业务值。 */
        const visible = this.findVisibleMails(mailbox, normalizedIds);
        if (visible.length === 0) {
            return {
                operation: 'delete',
                ok: false,
                mailIds: [],
                message: '目标邮件不存在、已过期，或已被删除。',
            };
        }
        if (visible.some((entry) => entry.attachments.length > 0 && entry.claimedAt == null)) {
            return {
                operation: 'delete',
                ok: false,
                mailIds: [],
                message: '仍有未领取附件的邮件，不能直接删除。',
            };
        }
/** now：定义该变量以承载业务值。 */
        const now = Date.now();
        for (const entry of visible) {
            entry.deletedAt = now;
            entry.updatedAt = now;
        }
        mailbox.revision += 1;
        await this.persistMailbox(playerId, mailbox);
        return {
            operation: 'delete',
            ok: true,
            mailIds: visible.map((entry) => entry.mailId),
        };
    }
/** createDirectMail：执行对应的业务逻辑。 */
    async createDirectMail(playerId, input) {
/** mailbox：定义该变量以承载业务值。 */
        const mailbox = await this.ensurePlayerMailbox(playerId);
/** mailId：定义该变量以承载业务值。 */
        const mailId = this.appendMail(mailbox, input);
        await this.persistMailbox(playerId, mailbox);
        return mailId;
    }
/** appendMail：执行对应的业务逻辑。 */
    appendMail(mailbox, input) {
/** now：定义该变量以承载业务值。 */
        const now = Date.now();
/** mailId：定义该变量以承载业务值。 */
        const mailId = `mail:${now.toString(36)}:${mailbox.revision.toString(36)}:${mailbox.mails.length.toString(36)}`;
        mailbox.mails.unshift({
            version: 1,
            mailId,
            senderLabel: input.senderLabel?.trim() || MAIL_DEFAULT_SENDER_LABEL,
            templateId: input.templateId?.trim() || null,
            args: normalizeArgs(input.args),
            fallbackTitle: input.fallbackTitle?.trim() || null,
            fallbackBody: input.fallbackBody?.trim() || null,
            attachments: normalizeAttachments(input.attachments),
            createdAt: now,
            updatedAt: now,
            expireAt: Number.isFinite(input.expireAt) ? Math.trunc(Number(input.expireAt)) : null,
            firstSeenAt: null,
            readAt: null,
            claimedAt: null,
            deletedAt: null,
        });
        mailbox.revision += 1;
        this.compactMailbox(mailbox);
        return mailId;
    }
/** findVisibleMail：执行对应的业务逻辑。 */
    findVisibleMail(mailbox, mailId) {
/** normalizedId：定义该变量以承载业务值。 */
        const normalizedId = String(mailId ?? '').trim();
        if (!normalizedId) {
            return null;
        }
        return this.listVisibleMails(mailbox).find((entry) => entry.mailId === normalizedId) ?? null;
    }
/** findVisibleMails：执行对应的业务逻辑。 */
    findVisibleMails(mailbox, mailIds) {
/** visibleById：定义该变量以承载业务值。 */
        const visibleById = new Map(this.listVisibleMails(mailbox).map((entry) => [entry.mailId, entry]));
        return mailIds
            .map((mailId) => visibleById.get(mailId) ?? null)
            .filter((entry) => Boolean(entry));
    }
/** listVisibleMails：执行对应的业务逻辑。 */
    listVisibleMails(mailbox) {
/** now：定义该变量以承载业务值。 */
        const now = Date.now();
        return mailbox.mails.filter((entry) => entry.deletedAt == null && (entry.expireAt == null || entry.expireAt > now));
    }
/** filterMails：执行对应的业务逻辑。 */
    filterMails(mails, filter) {
        if (filter === 'unread') {
            return mails.filter((entry) => entry.readAt == null);
        }
        if (filter === 'claimable') {
            return mails.filter((entry) => entry.attachments.length > 0 && entry.claimedAt == null);
        }
        return mails;
    }
/** toMailListEntryView：执行对应的业务逻辑。 */
    toMailListEntryView(entry) {
/** title：定义该变量以承载业务值。 */
        const title = (0, shared_1.renderMailTitlePlain)(entry.templateId, entry.args, entry.fallbackTitle);
/** body：定义该变量以承载业务值。 */
        const body = (0, shared_1.renderMailBodyPlain)(entry.templateId, entry.args, entry.fallbackBody);
        return {
            mailId: entry.mailId,
            title,
            summary: (0, shared_1.buildMailPreviewSnippet)(body),
            senderLabel: entry.senderLabel,
            createdAt: entry.createdAt,
            expireAt: entry.expireAt,
            hasAttachments: entry.attachments.length > 0,
/** read：定义该变量以承载业务值。 */
            read: entry.readAt != null,
/** claimed：定义该变量以承载业务值。 */
            claimed: entry.attachments.length === 0 || entry.claimedAt != null,
        };
    }
/** toMailDetailView：执行对应的业务逻辑。 */
    toMailDetailView(entry) {
        return {
            mailId: entry.mailId,
            senderLabel: entry.senderLabel,
            createdAt: entry.createdAt,
            expireAt: entry.expireAt,
            templateId: entry.templateId,
            args: entry.args.map((arg) => ({ ...arg })),
            fallbackTitle: entry.fallbackTitle,
            fallbackBody: entry.fallbackBody,
            attachments: entry.attachments.map((attachment) => ({ ...attachment })),
/** read：定义该变量以承载业务值。 */
            read: entry.readAt != null,
/** claimed：定义该变量以承载业务值。 */
            claimed: entry.attachments.length === 0 || entry.claimedAt != null,
/** deletable：定义该变量以承载业务值。 */
            deletable: entry.attachments.length === 0 || entry.claimedAt != null,
        };
    }
/** resolveAttachmentItems：执行对应的业务逻辑。 */
    resolveAttachmentItems(mails) {
/** items：定义该变量以承载业务值。 */
        const items = [];
        for (const mail of mails) {
            for (const attachment of mail.attachments) {
                const item = this.contentTemplateRepository.createItem(attachment.itemId, attachment.count);
                if (!item) {
                    return null;
                }
                items.push({
                    itemId: item.itemId,
                    name: item.name ?? item.itemId,
                    type: item.type ?? 'material',
                    count: item.count,
                    desc: item.desc ?? '',
                    groundLabel: item.groundLabel,
                    grade: item.grade,
                    level: item.level,
                    equipSlot: item.equipSlot,
                    equipAttrs: item.equipAttrs,
                    equipStats: item.equipStats,
                    equipValueStats: item.equipValueStats,
                    effects: item.effects,
                    healAmount: item.healAmount,
                    healPercent: item.healPercent,
                    qiPercent: item.qiPercent,
                    consumeBuffs: item.consumeBuffs,
                    tags: item.tags,
                    mapUnlockId: item.mapUnlockId,
                    mapUnlockIds: Array.isArray(item.mapUnlockIds) ? item.mapUnlockIds.slice() : undefined,
                    tileAuraGainAmount: item.tileAuraGainAmount,
                    allowBatchUse: item.allowBatchUse,
                });
            }
        }
        return items;
    }
/** canReceiveAllAttachments：执行对应的业务逻辑。 */
    canReceiveAllAttachments(playerId, items) {
/** player：定义该变量以承载业务值。 */
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
/** simulated：定义该变量以承载业务值。 */
        const simulated = player.inventory.items.map((entry) => ({ ...this.contentTemplateRepository.normalizeItem(entry) }));
/** nextSize：定义该变量以承载业务值。 */
        let nextSize = simulated.length;
/** signatureIndex：定义该变量以承载业务值。 */
        const signatureIndex = new Map();
        for (let index = 0; index < simulated.length; index += 1) {
            signatureIndex.set((0, shared_1.createItemStackSignature)(simulated[index]), index);
        }
        for (const item of items) {
            const signature = (0, shared_1.createItemStackSignature)(item);
            const existingIndex = signatureIndex.get(signature);
            if (existingIndex !== undefined) {
                simulated[existingIndex].count += item.count;
                continue;
            }
            if (nextSize >= player.inventory.capacity) {
                return false;
            }
            signatureIndex.set(signature, simulated.length);
            simulated.push({ ...item });
            nextSize += 1;
        }
        return true;
    }
/** compactMailbox：执行对应的业务逻辑。 */
    compactMailbox(mailbox) {
/** now：定义该变量以承载业务值。 */
        const now = Date.now();
        mailbox.mails = mailbox.mails
            .filter((entry) => entry.deletedAt == null && (entry.expireAt == null || entry.expireAt > now))
            .sort((left, right) => right.createdAt - left.createdAt || left.mailId.localeCompare(right.mailId));
    }
/** persistMailbox：执行对应的业务逻辑。 */
    async persistMailbox(playerId, mailbox) {
        this.compactMailbox(mailbox);
        await this.mailPersistenceService.saveMailbox(playerId, {
            version: 1,
            revision: Math.max(1, mailbox.revision),
            mails: mailbox.mails.map((entry) => ({
                ...entry,
                args: entry.args.map((arg) => ({ ...arg })),
                attachments: entry.attachments.map((attachment) => ({ ...attachment })),
            })),
        });
    }
};
exports.MailRuntimeService = MailRuntimeService;
exports.MailRuntimeService = MailRuntimeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService,
        mail_persistence_service_1.MailPersistenceService])
], MailRuntimeService);
/** createEmptyMailbox：执行对应的业务逻辑。 */
function createEmptyMailbox() {
    return {
        version: 1,
        revision: 1,
        mails: [],
    };
}
/** normalizeArgs：执行对应的业务逻辑。 */
function normalizeArgs(args) {
    if (!Array.isArray(args)) {
        return [];
    }
/** normalized：定义该变量以承载业务值。 */
    const normalized = [];
    for (const entry of args) {
        if (!entry || typeof entry !== 'object' || typeof entry.kind !== 'string') {
            continue;
        }
        if (entry.kind === 'text') {
            normalized.push({ kind: 'text', value: String(entry.value ?? '') });
            continue;
        }
        if (entry.kind === 'number') {
            normalized.push({ kind: 'number', value: Number(entry.value ?? 0) });
            continue;
        }
        if (entry.kind === 'item' && typeof entry.itemId === 'string' && entry.itemId.trim()) {
            normalized.push({
                kind: 'item',
                itemId: entry.itemId.trim(),
/** label：定义该变量以承载业务值。 */
                label: typeof entry.label === 'string' ? entry.label : undefined,
                count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(Number(entry.count))) : undefined,
            });
        }
    }
    return normalized;
}
/** normalizeAttachments：执行对应的业务逻辑。 */
function normalizeAttachments(attachments) {
    if (!Array.isArray(attachments)) {
        return [];
    }
    return attachments
        .filter((entry) => entry && typeof entry.itemId === 'string' && entry.itemId.trim().length > 0)
        .map((entry) => ({
        itemId: entry.itemId.trim(),
        count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(Number(entry.count))) : 1,
    }));
}
//# sourceMappingURL=mail-runtime.service.js.map
