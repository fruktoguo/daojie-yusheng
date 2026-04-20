// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailRuntimeService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const content_template_repository_1 = require("../../content/content-template.repository");

const mail_persistence_service_1 = require("../../persistence/mail-persistence.service");

const player_runtime_service_1 = require("../player/player-runtime.service");

/** 邮件运行时：负责系统信件、附件领取和直接邮件的持久化读写。 */
const MAIL_WELCOME_TEMPLATE_ID = 'mail.welcome.v1';

/** 默认系统发件人名称。 */
const MAIL_DEFAULT_SENDER_LABEL = '司命台';

let MailRuntimeService = class MailRuntimeService {
/**
 * contentTemplateRepository：对象字段。
 */

    contentTemplateRepository;    
    /**
 * playerRuntimeService：对象字段。
 */

    playerRuntimeService;    
    /**
 * mailPersistenceService：对象字段。
 */

    mailPersistenceService;
    /** 玩家邮箱缓存，按 playerId 索引。 */
    mailboxByPlayerId = new Map();
    /** 正在加载中的邮箱任务，避免重复读库。 */
    loadingMailboxByPlayerId = new Map();
    /** 注入内容、玩家与邮件持久化服务。 */
    constructor(contentTemplateRepository, playerRuntimeService, mailPersistenceService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.mailPersistenceService = mailPersistenceService;
    }
    /** 清空内存邮箱缓存，通常用于重载或测试。 */
    clearRuntimeCache() {
        this.mailboxByPlayerId.clear();
        this.loadingMailboxByPlayerId.clear();
    }
    /** 读取玩家邮箱，缓存未命中时从持久化层回填。 */
    async ensurePlayerMailbox(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const cached = this.mailboxByPlayerId.get(playerId);
        if (cached) {
            return cached;
        }

        const existingLoad = this.loadingMailboxByPlayerId.get(playerId);
        if (existingLoad) {
            return existingLoad;
        }

        const loading = (async () => {

            const loaded = await this.mailPersistenceService.loadMailbox(playerId);

            const mailbox = loaded ?? createEmptyMailbox();
            this.compactMailbox(mailbox);
            this.mailboxByPlayerId.set(playerId, mailbox);
            this.loadingMailboxByPlayerId.delete(playerId);
            return mailbox;
        })();
        this.loadingMailboxByPlayerId.set(playerId, loading);
        return loading;
    }
    /** 确保新玩家至少会收到一封欢迎信。 */
    async ensureWelcomeMail(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
    /** 汇总邮箱未读数和可领取附件数。 */
    async getSummary(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const mailbox = await this.ensurePlayerMailbox(playerId);

        const visible = this.listVisibleMails(mailbox);

        let unreadCount = 0;

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
    /** 分页读取邮箱列表，支持过滤未读或仅附件邮件。 */
    async getPage(playerId, requestedPage, requestedPageSize, requestedFilter) {

        const mailbox = await this.ensurePlayerMailbox(playerId);

        const filter = (0, shared_1.normalizeMailFilter)(requestedFilter);

        const pageSize = (0, shared_1.normalizeMailPageSize)(requestedPageSize);

        const filtered = this.filterMails(this.listVisibleMails(mailbox), filter);

        const total = filtered.length;

        const totalPages = Math.max(1, Math.ceil(total / pageSize));

        const page = Math.min(totalPages, Math.max(1, Math.floor(requestedPage || 1)));

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
    /** 读取单封邮件详情。 */
    async getDetail(playerId, mailId) {

        const mailbox = await this.ensurePlayerMailbox(playerId);

        const entry = this.findVisibleMail(mailbox, mailId);
        return entry ? this.toMailDetailView(entry) : null;
    }
    /** 批量标记邮件已读。 */
    async markRead(playerId, mailIds) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const mailbox = await this.ensurePlayerMailbox(playerId);

        const normalizedIds = (0, shared_1.normalizeMailBatchIds)(mailIds);
        if (normalizedIds.length === 0) {
            return {
                operation: 'markRead',
                ok: false,
                mailIds: [],
                message: '未选择要标记已读的邮件。',
            };
        }

        const visible = this.findVisibleMails(mailbox, normalizedIds);
        if (visible.length === 0) {
            return {
                operation: 'markRead',
                ok: false,
                mailIds: [],
                message: '目标邮件不存在、已过期，或已被删除。',
            };
        }

        const now = Date.now();

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
    /** 批量领取邮件附件。 */
    async claimAttachments(playerId, mailIds) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const mailbox = await this.ensurePlayerMailbox(playerId);

        const normalizedIds = (0, shared_1.normalizeMailBatchIds)(mailIds);
        if (normalizedIds.length === 0) {
            return {
                operation: 'claim',
                ok: false,
                mailIds: [],
                message: '未选择要领取附件的邮件。',
            };
        }

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
    /** 批量删除已满足删除条件的邮件。 */
    async deleteMails(playerId, mailIds) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const mailbox = await this.ensurePlayerMailbox(playerId);

        const normalizedIds = (0, shared_1.normalizeMailBatchIds)(mailIds);
        if (normalizedIds.length === 0) {
            return {
                operation: 'delete',
                ok: false,
                mailIds: [],
                message: '未选择要删除的邮件。',
            };
        }

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
    /** 创建一封直接邮件，并在需要时尝试立刻发送附件。 */
    async createDirectMail(playerId, input) {

        const mailbox = await this.ensurePlayerMailbox(playerId);

        const mailId = this.appendMail(mailbox, input);
        await this.persistMailbox(playerId, mailbox);
        return mailId;
    }
    /** 往邮箱里追加一封邮件，供欢迎信和系统发信复用。 */
    appendMail(mailbox, input) {

        const now = Date.now();

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
    /** 在可见邮件里按 ID 查找单封邮件。 */
    findVisibleMail(mailbox, mailId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalizedId = String(mailId ?? '').trim();
        if (!normalizedId) {
            return null;
        }
        return this.listVisibleMails(mailbox).find((entry) => entry.mailId === normalizedId) ?? null;
    }
    /** 在可见邮件里按 ID 批量查找邮件。 */
    findVisibleMails(mailbox, mailIds) {

        const visibleById = new Map(this.listVisibleMails(mailbox).map((entry) => [entry.mailId, entry]));
        return mailIds
            .map((mailId) => visibleById.get(mailId) ?? null)
            .filter((entry) => Boolean(entry));
    }
    /** 列出当前仍然可见的邮件。 */
    listVisibleMails(mailbox) {

        const now = Date.now();
        return mailbox.mails.filter((entry) => entry.deletedAt == null && (entry.expireAt == null || entry.expireAt > now));
    }
    /** 根据邮箱过滤条件筛选邮件。 */
    filterMails(mails, filter) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (filter === 'unread') {
            return mails.filter((entry) => entry.readAt == null);
        }
        if (filter === 'claimable') {
            return mails.filter((entry) => entry.attachments.length > 0 && entry.claimedAt == null);
        }
        return mails;
    }
    /** 把邮件压成列表项视图。 */
    toMailListEntryView(entry) {

        const title = (0, shared_1.renderMailTitlePlain)(entry.templateId, entry.args, entry.fallbackTitle);

        const body = (0, shared_1.renderMailBodyPlain)(entry.templateId, entry.args, entry.fallbackBody);
        return {
            mailId: entry.mailId,
            title,
            summary: (0, shared_1.buildMailPreviewSnippet)(body),
            senderLabel: entry.senderLabel,
            createdAt: entry.createdAt,
            expireAt: entry.expireAt,
            hasAttachments: entry.attachments.length > 0,

            read: entry.readAt != null,

            claimed: entry.attachments.length === 0 || entry.claimedAt != null,
        };
    }
    /** 把邮件压成详情视图。 */
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

            read: entry.readAt != null,

            claimed: entry.attachments.length === 0 || entry.claimedAt != null,

            deletable: entry.attachments.length === 0 || entry.claimedAt != null,
        };
    }
    /** 汇总待发送附件，领取失败时返回 null。 */
    resolveAttachmentItems(mails) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


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
    /** 检查玩家背包是否能一次性容纳全部附件。 */
    canReceiveAllAttachments(playerId, items) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const simulated = player.inventory.items.map((entry) => ({ ...this.contentTemplateRepository.normalizeItem(entry) }));

        let nextSize = simulated.length;

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
    /** 规范化邮箱数据，去掉过期垃圾并压缩结构。 */
    compactMailbox(mailbox) {

        const now = Date.now();
        mailbox.mails = mailbox.mails
            .filter((entry) => entry.deletedAt == null && (entry.expireAt == null || entry.expireAt > now))
            .sort((left, right) => right.createdAt - left.createdAt || left.mailId.localeCompare(right.mailId));
    }
    /** 持久化单个玩家的邮箱快照。 */
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
export { MailRuntimeService };
/**
 * createEmptyMailbox：构建并返回目标对象。
 * @returns 函数返回值。
 */

function createEmptyMailbox() {
    return {
        version: 1,
        revision: 1,
        mails: [],
    };
}
/**
 * normalizeArgs：执行核心业务逻辑。
 * @param args 参数说明。
 * @returns 函数返回值。
 */

function normalizeArgs(args) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(args)) {
        return [];
    }

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

                label: typeof entry.label === 'string' ? entry.label : undefined,
                count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(Number(entry.count))) : undefined,
            });
        }
    }
    return normalized;
}
/**
 * normalizeAttachments：执行核心业务逻辑。
 * @param attachments 参数说明。
 * @returns 函数返回值。
 */

function normalizeAttachments(attachments) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
