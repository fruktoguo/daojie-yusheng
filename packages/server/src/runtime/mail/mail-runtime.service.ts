/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable } from '@nestjs/common';
import { buildMailPreviewSnippet, canMergeItemStack, createItemStackSignature, normalizeMailBatchIds, normalizeMailFilter, normalizeMailPageSize, renderMailBodyPlain, renderMailTitlePlain, resolveClampedMailResponsePage, resolvePlayerFacingContentName } from '@mud/shared';
import { createHash } from 'node:crypto';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import {
    PlayerDomainPersistenceService,
    nextPlayerPersistenceVersion,
} from '../../persistence/player-domain-persistence.service';
import { DurableOperationService } from '../../persistence/durable-operation.service';
import { MailPersistenceService } from '../../persistence/mail-persistence.service';
import { InstanceCatalogService } from '../../persistence/instance-catalog.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildWalletBalancesFromInventory } from '../player/wallet-inventory-projection.helpers';
import { assignItemInstanceIdIfNeeded } from '../world/item-instance-id.helpers';

/** 邮件运行时：负责系统信件、附件领取和直接邮件的持久化读写。 */
const MAIL_WELCOME_TEMPLATE_ID = 'mail.welcome.v1';

/** 默认系统发件人名称。 */
const MAIL_DEFAULT_SENDER_LABEL = '司命台';
const MAILBOX_CACHE_MAX_PLAYERS = normalizePositiveInteger(process.env.SERVER_MAILBOX_CACHE_MAX_PLAYERS, 5_000, 100, 50_000);
const MAIL_ATTACHMENT_ITEM_COUNT_MAX = 2_147_483_647;

@Injectable()
export class MailRuntimeService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * mailPersistenceService：邮件Persistence服务引用。
 */

    mailPersistenceService;
    /**
 * durableOperationService：强持久化事务服务引用。
 */

    durableOperationService;
    /**
 * playerDomainPersistenceService：玩家分域持久化服务引用。
 */

    playerDomainPersistenceService;
    /**
 * instanceCatalogService：实例目录持久化服务引用。
 */

    instanceCatalogService;
    /** 玩家邮箱缓存，按 playerId 索引。 */
    mailboxByPlayerId = new Map();
    /** 邮箱缓存最近访问时间，用于 LRU 剪枝。 */
    mailboxLastAccessAtByPlayerId = new Map();
    /** 正在加载中的邮箱任务，避免重复读库。 */
    loadingMailboxByPlayerId = new Map();
    /** 正在串行执行的邮箱写任务，避免同玩家邮箱写链互相覆盖。 */
    mailboxWriteByPlayerId = new Map();
    /** 注入内容、玩家与邮件持久化服务。 */
    constructor(
        @Inject(ContentTemplateRepository) contentTemplateRepository: any,
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(MailPersistenceService) mailPersistenceService: any,
        @Inject(DurableOperationService) durableOperationService: any,
        @Inject(PlayerDomainPersistenceService) playerDomainPersistenceService: any,
        @Inject(InstanceCatalogService) instanceCatalogService: any,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.mailPersistenceService = mailPersistenceService;
        this.durableOperationService = durableOperationService;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
        this.instanceCatalogService = instanceCatalogService;
    }
    /** 清空内存邮箱缓存，通常用于重载或测试。 */
    clearRuntimeCache() {
        this.mailboxByPlayerId.clear();
        this.mailboxLastAccessAtByPlayerId.clear();
        this.loadingMailboxByPlayerId.clear();
        this.mailboxWriteByPlayerId.clear();
    }
    /** 读取玩家邮箱，缓存未命中时从持久化层回填。 */
    async ensurePlayerMailbox(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        const cached = this.mailboxByPlayerId.get(normalizedPlayerId);
        if (cached) {
            this.touchMailboxCache(normalizedPlayerId);
            return cached;
        }

        const existingLoad = this.loadingMailboxByPlayerId.get(normalizedPlayerId);
        if (existingLoad) {
            return existingLoad;
        }

        const loading = (async () => {
            try {
                const loaded = await this.mailPersistenceService.loadMailbox(normalizedPlayerId);

                const mailbox = loaded ?? createEmptyMailbox();
                this.compactMailbox(mailbox);
                this.rememberMailboxCache(normalizedPlayerId, mailbox);
                return mailbox;
            }
            finally {
                if (this.loadingMailboxByPlayerId.get(normalizedPlayerId) === loading) {
                    this.loadingMailboxByPlayerId.delete(normalizedPlayerId);
                }
            }
        })();
        this.loadingMailboxByPlayerId.set(normalizedPlayerId, loading);
        return loading;
    }
    /** 确保新玩家至少会收到一封欢迎信。 */
    async ensureWelcomeMail(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return this.runSerializedMailboxWrite(playerId, async () => {
            const mailbox = await this.ensurePlayerMailbox(playerId);
            if (this.hasWelcomeMailHistory(mailbox)) {
                if (mailbox.welcomeMailDeliveredAt == null) {
                    mailbox.welcomeMailDeliveredAt = resolveWelcomeMailHistoryTimestamp(mailbox) ?? Date.now();
                    this.compactMailbox(mailbox);
                    await this.persistMailboxMutation(playerId, mailbox, []);
                }
                return;
            }
            mailbox.welcomeMailDeliveredAt = Date.now();
            this.appendMail(playerId, mailbox, {
                templateId: MAIL_WELCOME_TEMPLATE_ID,
                attachments: [
                    { itemId: 'pill.minor_heal', count: 2 },
                    { itemId: 'spirit_stone', count: 8 },
                ],
            });
            this.compactMailbox(mailbox);
            await this.persistMailboxMutation(playerId, mailbox, mailbox.mails.slice(0, 1));
        });
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

        const filter = normalizeMailFilter(requestedFilter);

        const pageSize = normalizeMailPageSize(requestedPageSize);

        const filtered = this.filterMails(this.listVisibleMails(mailbox), filter);

        const total = filtered.length;

        const totalPages = Math.max(1, Math.ceil(total / pageSize));

        const page = resolveClampedMailResponsePage(requestedPage, total, pageSize);

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
        return this.runSerializedMailboxWrite(playerId, async () => {
            const mailbox = await this.ensurePlayerMailbox(playerId);
            const normalizedIds = normalizeMailBatchIds(mailIds);
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
                let entryChanged = false;
                if (entry.firstSeenAt == null) {
                    entry.firstSeenAt = now;
                    entryChanged = true;
                }
                if (entry.readAt == null) {
                    entry.readAt = now;
                    entryChanged = true;
                }
                if (entryChanged) {
                    entry.updatedAt = now;
                    entry.mailVersion = nextMailVersion(entry);
                    changed = true;
                }
            }
            if (changed) {
                mailbox.revision += 1;
                this.compactMailbox(mailbox);
                await this.persistMailboxMutation(playerId, mailbox, visible);
            }
            return {
                operation: 'markRead',
                ok: true,
                mailIds: visible.map((entry) => entry.mailId),
            };
        });
    }
    /** 批量领取邮件附件。 */
    async claimAttachments(playerId, mailIds) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const claim = () => this.runSerializedMailboxWrite(playerId, async () => {
            const mailbox = await this.ensurePlayerMailbox(playerId);
            const normalizedIds = normalizeMailBatchIds(mailIds);
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
            const resolution = this.resolveAttachmentItems(visible);
            if (!resolution) {
                return {
                    operation: 'claim',
                    ok: false,
                    mailIds: visible.map((entry) => entry.mailId),
                    message: '邮件附件包含无效物品，暂时无法领取。',
                };
            }
            const nextInventoryItems = this.buildNextInventoryItems(playerId, resolution.inventoryItems);
            if (nextInventoryItems === undefined) {
                return {
                    operation: 'claim',
                    ok: false,
                    mailIds: visible.map((entry) => entry.mailId),
                    message: '邮件附件数量超过背包单堆上限，暂时无法领取。',
                };
            }
            if (!nextInventoryItems) {
                return {
                    operation: 'claim',
                    ok: false,
                    mailIds: visible.map((entry) => entry.mailId),
                    message: '背包空间不足，无法领取全部附件。',
                };
            }
            if (this.durableOperationService?.isEnabled?.()) {
                try {
                    await this.claimAttachmentsDurably(
                        playerId,
                        normalizedIds,
                        visible,
                        nextInventoryItems,
                        resolution.hasWalletAttachments,
                    );
                    const revalidatedInventory = this.buildNextInventoryItems(playerId, resolution.inventoryItems);
                    if (revalidatedInventory === undefined) {
                        return {
                            operation: 'claim',
                            ok: false,
                            mailIds: visible.map((entry) => entry.mailId),
                            message: '邮件附件数量超过背包单堆上限，暂时无法领取。',
                        };
                    }
                    if (!revalidatedInventory) {
                        return {
                            operation: 'claim',
                            ok: false,
                            mailIds: visible.map((entry) => entry.mailId),
                            message: '背包空间不足，无法领取全部附件。',
                        };
                    }
                    this.playerRuntimeService.replaceInventoryItems(playerId, revalidatedInventory.map((entry) => ({ ...entry.rawPayload })));
                    await this.reloadMailboxFromPersistence(playerId);
                    return {
                        operation: 'claim',
                        ok: true,
                        mailIds: visible.map((entry) => entry.mailId),
                        message: `已领取 ${visible.length} 封邮件的附件。`,
                    };
                }
                catch (error) {
                    return {
                        operation: 'claim',
                        ok: false,
                        mailIds: visible.map((entry) => entry.mailId),
                        message: resolveClaimErrorMessage(error),
                    };
                }
            }
            return {
                operation: 'claim',
                ok: false,
                mailIds: visible.map((entry) => entry.mailId),
                message: '邮件附件领取事务暂不可用，请稍后再试。',
            };
        });
        const coordinator = this.playerRuntimeService?.runExclusiveAssetMutation;
        if (typeof coordinator !== 'function') {
            return claim();
        }
        return coordinator.call(this.playerRuntimeService, [playerId], claim);
    }
    async claimAttachmentsDurably(playerId, normalizedIds, visible, nextInventoryItems, hasWalletAttachments) {
        await this.syncCurrentPresenceFence(playerId);
        const attempt = async () => {
            const sessionFence = this.playerRuntimeService.getSessionFence?.(playerId) ?? null;
            const currentSnapshot = this.playerRuntimeService.buildPersistenceSnapshot?.(playerId) ?? null;
            const nextWalletBalances = currentSnapshot && hasWalletAttachments
                ? buildWalletBalancesFromInventory(currentSnapshot.wallet?.balances, nextInventoryItems)
                : undefined;
            const nextSnapshot = currentSnapshot
                ? {
                    ...currentSnapshot,
                    savedAt: nextPlayerPersistenceVersion(),
                    inventory: {
                        ...currentSnapshot.inventory,
                        revision: Math.max(1, Math.trunc(Number(currentSnapshot.inventory?.revision ?? 1)) + 1),
                        items: nextInventoryItems.map((entry) => ({ ...entry.rawPayload })),
                    },
                    wallet: {
                        ...currentSnapshot.wallet,
                        balances: nextWalletBalances ?? currentSnapshot.wallet?.balances ?? [],
                    },
                }
                : null;
            if (!sessionFence?.runtimeOwnerId || !sessionFence?.sessionEpoch || !nextSnapshot) {
                throw new Error('player_session_fencing_unavailable');
            }
            const instanceLease = await this.resolveInstanceLeaseContext(currentSnapshot?.placement?.instanceId ?? null);
            await this.durableOperationService.claimMailAttachments({
                operationId: buildMailClaimOperationId(playerId, sessionFence.sessionEpoch, normalizedIds),
                playerId,
                expectedRuntimeOwnerId: sessionFence.runtimeOwnerId,
                expectedSessionEpoch: sessionFence.sessionEpoch,
                expectedInstanceId: currentSnapshot?.placement?.instanceId ?? null,
                expectedAssignedNodeId: instanceLease?.assignedNodeId ?? null,
                expectedOwnershipEpoch: instanceLease?.ownershipEpoch ?? null,
                mailIds: visible.map((entry) => entry.mailId),
                nextInventoryItems,
                nextWalletBalances,
                nextPlayerSnapshot: nextSnapshot,
            });
        };
        try {
            await attempt();
        }
        catch (error) {
            if (!shouldRetryClaimFence(error) || !(await this.syncCurrentPresenceFence(playerId))) {
                throw error;
            }
            await attempt();
        }
    }
    async syncCurrentPresenceFence(playerId) {
        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return false;
        }
        const persistedPresence = typeof this.playerDomainPersistenceService?.loadPlayerPresence === 'function'
            ? await this.playerDomainPersistenceService.loadPlayerPresence(playerId)
            : null;
        let presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
        if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
            return false;
        }
        const persistedSessionEpoch = Number.isFinite(persistedPresence?.sessionEpoch)
            ? Math.max(0, Math.trunc(Number(persistedPresence.sessionEpoch)))
            : 0;
        const persistedRuntimeOwnerId = typeof persistedPresence?.runtimeOwnerId === 'string'
            ? persistedPresence.runtimeOwnerId.trim()
            : '';
        const runtimeSessionEpoch = Math.max(0, Math.trunc(Number(presence.sessionEpoch ?? 0)));
        const runtimeOwnerId = typeof presence.runtimeOwnerId === 'string' ? presence.runtimeOwnerId.trim() : '';
        if (
            typeof this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast === 'function'
            && persistedSessionEpoch > 0
            && (
                runtimeSessionEpoch <= persistedSessionEpoch
                || (persistedRuntimeOwnerId && persistedRuntimeOwnerId !== runtimeOwnerId)
            )
        ) {
            this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast(playerId, persistedSessionEpoch);
            presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
        }
        if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
            return false;
        }
        await this.playerDomainPersistenceService.savePlayerPresence(playerId, {
            ...presence,
            versionSeed: nextPlayerPersistenceVersion(),
        });
        return true;
    }
    async resolveInstanceLeaseContext(instanceId) {
        const normalizedInstanceId = typeof instanceId === 'string' && instanceId.trim() ? instanceId.trim() : '';
        if (!normalizedInstanceId || !this.instanceCatalogService?.isEnabled?.()) {
            return null;
        }
        const catalog = await this.instanceCatalogService.loadInstanceCatalog(normalizedInstanceId);
        if (!catalog) {
            return null;
        }
        const assignedNodeId = typeof catalog.assigned_node_id === 'string' && catalog.assigned_node_id.trim()
            ? catalog.assigned_node_id.trim()
            : null;
        const ownershipEpoch = Number.isFinite(Number(catalog.ownership_epoch))
            ? Math.max(0, Math.trunc(Number(catalog.ownership_epoch)))
            : null;
        if (!assignedNodeId || ownershipEpoch == null) {
            return null;
        }
        return { assignedNodeId, ownershipEpoch };
    }
    /** 批量删除已满足删除条件的邮件。 */
    async deleteMails(playerId, mailIds) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        return this.runSerializedMailboxWrite(playerId, async () => {
            const mailbox = await this.ensurePlayerMailbox(playerId);
            const normalizedIds = normalizeMailBatchIds(mailIds);
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
                entry.mailVersion = nextMailVersion(entry);
            }
            mailbox.revision += 1;
            this.compactMailbox(mailbox);
            await this.persistMailboxMutation(playerId, mailbox, visible);
            return {
                operation: 'delete',
                ok: true,
                mailIds: visible.map((entry) => entry.mailId),
            };
        });
    }
    /** 创建一封直接邮件，并在需要时尝试立刻发送附件。 */
    async createDirectMail(playerId, input) {
        return this.runSerializedMailboxWrite(playerId, async () => {
            const mailbox = await this.ensurePlayerMailbox(playerId);
            const mailId = this.appendMail(playerId, mailbox, input);
            this.compactMailbox(mailbox);
            const createdEntry = this.findVisibleMail(mailbox, mailId);
            await this.persistMailboxMutation(playerId, mailbox, createdEntry ? [createdEntry] : []);
            return mailId;
        });
    }
    /** 以单次持久化事务向一组玩家广播同一封邮件，并在提交后使本节点缓存失效。 */
    async createBroadcastMail(playerIds, batchId, input) {
        const normalizedPlayerIds = Array.from(new Set(
            (Array.isArray(playerIds) ? playerIds : [])
                .map((playerId) => typeof playerId === 'string' ? playerId.trim() : '')
                .filter((playerId) => playerId.length > 0),
        ));
        const normalizedBatchId = typeof batchId === 'string' ? batchId.trim() : '';
        const now = Date.now();
        const entry = buildMailEntry('mail:broadcast:prototype', input ?? {}, now);
        const result = await this.mailPersistenceService.saveBroadcastMail(
            normalizedPlayerIds,
            normalizedBatchId,
            serializeMailboxEntry(entry),
        );
        for (const playerId of normalizedPlayerIds) {
            this.discardMailboxCache(playerId);
        }
        return result;
    }
    /** 往邮箱里追加一封邮件，供欢迎信和系统发信复用。 */
    appendMail(playerId, mailbox, input) {
        const previousNewestCreatedAt = Number.isFinite(mailbox.mails[0]?.createdAt)
            ? Math.trunc(Number(mailbox.mails[0].createdAt))
            : 0;
        const now = Math.max(Date.now(), previousNewestCreatedAt + 1);

        const mailId = buildMailId(playerId, mailbox, now);
        mailbox.mails.unshift(buildMailEntry(mailId, input, now));
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

        const title = renderMailTitlePlain(entry.templateId, entry.args, entry.fallbackTitle);

        const body = renderMailBodyPlain(entry.templateId, entry.args, entry.fallbackBody);
        return {
            mailId: entry.mailId,
            title,
            summary: buildMailPreviewSnippet(body),
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

        const inventoryItems = [];
        let hasWalletAttachments = false;
        for (const mail of mails) {
            for (const attachment of mail.attachments) {
                const count = Math.max(0, Math.trunc(Number(attachment?.count ?? 0)));
                const itemId = typeof attachment?.itemId === 'string' ? attachment.itemId.trim() : '';
                if (!itemId || count <= 0) {
                    return null;
                }
                if (isWalletAttachmentItemId(itemId)) {
                    hasWalletAttachments = true;
                }
                const attachmentPayload = attachment && typeof attachment === 'object'
                    ? attachment
                    : null;
                const item = attachmentPayload && typeof attachmentPayload.type === 'string'
                    ? this.contentTemplateRepository.normalizeItem({ ...attachmentPayload, itemId, count })
                    : this.contentTemplateRepository.createItem(itemId, count);
                if (!item) {
                    return null;
                }
                inventoryItems.push({
                    itemId: item.itemId,
                    name: resolvePlayerFacingContentName(item.itemId, '未知物品', item.name),
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
                    baselineHealPercent: item.baselineHealPercent,
                    baselineQiPercent: item.baselineQiPercent,
                    qiPercent: item.qiPercent,
                    consumeBuffs: item.consumeBuffs,
                    tags: item.tags,
                    mapUnlockId: item.mapUnlockId,
                    mapUnlockIds: Array.isArray(item.mapUnlockIds) ? item.mapUnlockIds.slice() : undefined,
                    respawnBindMapId: item.respawnBindMapId,
                    tileAuraGainAmount: item.tileAuraGainAmount,
                    tileResourceGains: Array.isArray(item.tileResourceGains) ? item.tileResourceGains.map((entry) => ({ ...entry })) : undefined,
                    allowBatchUse: item.allowBatchUse,
                    // 与 market toFullItem 同理：残卷的功法身份只在这两个实例字段上，漏列即变空书。
                    learnTechniqueId: item.learnTechniqueId,
                    learnTechniqueMaxLevel: item.learnTechniqueMaxLevel,
                });
            }
        }
        return {
            inventoryItems,
            hasWalletAttachments,
        };
    }
    /** 检查玩家背包是否能一次性容纳全部附件。 */
    canReceiveAllAttachments(playerId, items) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        return Array.isArray(this.buildNextInventoryItems(playerId, items));
    }
    /** 预演附件领取后的背包形态；容量不足时返回 null。 */
    buildNextInventoryItems(playerId, items) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);

        const simulated = player.inventory.items.map((entry) => {
            const normalized = { ...this.contentTemplateRepository.normalizeItem(entry) };
            assignItemInstanceIdIfNeeded(normalized);
            return normalized;
        });

        let nextSize = simulated.length;

        const signatureIndex = new Map();
        for (let index = 0; index < simulated.length; index += 1) {
            if (canMergeItemStack(simulated[index])) {
                signatureIndex.set(createItemStackSignature(simulated[index]), index);
            }
        }
        for (const item of items) {
            const normalized = { ...this.contentTemplateRepository.normalizeItem(item) };
            assignItemInstanceIdIfNeeded(normalized);
            const signature = canMergeItemStack(normalized) ? createItemStackSignature(normalized) : null;
            const existingIndex = signature ? signatureIndex.get(signature) : undefined;
            if (signature && existingIndex !== undefined) {
                const nextCount = Math.max(0, Math.trunc(Number(simulated[existingIndex].count ?? 0)))
                    + Math.max(0, Math.trunc(Number(normalized.count ?? 0)));
                if (nextCount > MAIL_ATTACHMENT_ITEM_COUNT_MAX) {
                    return undefined;
                }
                simulated[existingIndex].count = nextCount;
                continue;
            }
            const incomingCount = Math.max(0, Math.trunc(Number(normalized.count ?? 0)));
            if (incomingCount <= 0 || incomingCount > MAIL_ATTACHMENT_ITEM_COUNT_MAX) {
                return undefined;
            }
            if (nextSize >= player.inventory.capacity) {
                return null;
            }
            if (signature) {
                signatureIndex.set(signature, simulated.length);
            }
            simulated.push({ ...normalized });
            nextSize += 1;
        }
        return simulated.map((entry) => ({
            itemId: entry.itemId,
            count: entry.count,
            rawPayload: { ...entry },
        }));
    }
    /** 规范化邮箱数据，去掉过期垃圾并压缩结构。 */
    compactMailbox(mailbox) {

        const now = Date.now();
        mailbox.mails = mailbox.mails
            .filter((entry) => entry.deletedAt == null && (entry.expireAt == null || entry.expireAt > now))
            .sort((left, right) => right.createdAt - left.createdAt || right.mailId.localeCompare(left.mailId));
    }
    /** 记录邮箱缓存访问并按 LRU 清理长期未用玩家邮箱。 */
    rememberMailboxCache(playerId, mailbox) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
        this.mailboxByPlayerId.set(normalizedPlayerId, mailbox);
        this.touchMailboxCache(normalizedPlayerId);
        this.pruneMailboxCache(normalizedPlayerId);
    }
    touchMailboxCache(playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
        this.mailboxLastAccessAtByPlayerId.set(normalizedPlayerId, Date.now());
    }
    discardMailboxCache(playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
        this.mailboxByPlayerId.delete(normalizedPlayerId);
        this.mailboxLastAccessAtByPlayerId.delete(normalizedPlayerId);
    }
    pruneMailboxCache(protectedPlayerId = '') {
        if (this.mailboxByPlayerId.size <= MAILBOX_CACHE_MAX_PLAYERS) {
            return;
        }
        const protectedId = typeof protectedPlayerId === 'string' ? protectedPlayerId.trim() : '';
        const candidates = Array.from(this.mailboxByPlayerId.keys())
            .filter((playerId) => playerId !== protectedId
                && !this.loadingMailboxByPlayerId.has(playerId)
                && !this.mailboxWriteByPlayerId.has(playerId))
            .sort((left, right) => (this.mailboxLastAccessAtByPlayerId.get(left) ?? 0) - (this.mailboxLastAccessAtByPlayerId.get(right) ?? 0));
        for (const playerId of candidates) {
            if (this.mailboxByPlayerId.size <= MAILBOX_CACHE_MAX_PLAYERS) {
                break;
            }
            this.discardMailboxCache(playerId);
        }
    }
    /** 持久化单个玩家的邮箱快照。 */
    async persistMailbox(playerId, mailbox) {
        this.compactMailbox(mailbox);
        await this.mailPersistenceService.saveMailbox(playerId, serializeMailboxPayload(mailbox));
    }
    /** 按受影响邮件局部 upsert 结构化真源，并同步兼容镜像。 */
    async persistMailboxMutation(playerId, mailbox, affectedEntries) {
        await this.mailPersistenceService.saveMailboxMutation(
            playerId,
            serializeMailboxPayload(mailbox),
            serializeMailboxEntries(affectedEntries),
        );
        await this.reloadMailboxFromPersistence(playerId);
    }
    /** 丢弃当前节点快照并从结构化真源回读，用于收敛跨节点邮件状态。 */
    async reloadMailboxFromPersistence(playerId) {
        if (!this.mailPersistenceService?.isEnabled?.()) {
            return;
        }
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return;
        }
        const existingLoad = this.loadingMailboxByPlayerId.get(normalizedPlayerId);
        if (existingLoad) {
            await existingLoad.catch(() => undefined);
        }
        this.discardMailboxCache(normalizedPlayerId);
        this.loadingMailboxByPlayerId.delete(normalizedPlayerId);
        await this.ensurePlayerMailbox(normalizedPlayerId);
    }
    /** 同一玩家的邮箱写链按序执行，避免并发写把缓存和持久化状态交叉覆盖。 */
    async runSerializedMailboxWrite(playerId, task) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return task();
        }
        const previous = this.mailboxWriteByPlayerId.get(normalizedPlayerId) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(async () => {
            // 邮件操作是低频强持久化命令；写前回读真源，不使用可能跨节点过期的本地缓存做删除/领取决策。
            await this.reloadMailboxFromPersistence(normalizedPlayerId);
            return task();
        });
        const tracked = next.finally(() => {
            if (this.mailboxWriteByPlayerId.get(normalizedPlayerId) === tracked) {
                this.mailboxWriteByPlayerId.delete(normalizedPlayerId);
            }
        });
        this.mailboxWriteByPlayerId.set(normalizedPlayerId, tracked);
        return tracked;
    }
    /** 判断邮箱是否已经留下欢迎信投递记录。 */
    hasWelcomeMailHistory(mailbox) {
        if (Number.isFinite(mailbox.welcomeMailDeliveredAt)) {
            return true;
        }
        if (mailbox.mails.some((entry) => entry.templateId === MAIL_WELCOME_TEMPLATE_ID)) {
            return true;
        }
        return mailbox.mails.length === 0 && Number(mailbox.revision ?? 1) > 1;
    }
};
/**
 * createEmptyMailbox：构建并返回目标对象。
 * @returns 无返回值，直接更新Empty邮件箱相关状态。
 */

function createEmptyMailbox() {
    return {
        version: 1,
        revision: 1,
        welcomeMailDeliveredAt: null,
        mails: [],
    };
}

/**
 * resolveWelcomeMailHistoryTimestamp：从现有邮箱数据推断欢迎信首次投递时间。
 * @param mailbox 参数说明。
 * @returns 无返回值，直接更新欢迎信历史时间相关状态。
 */
function resolveWelcomeMailHistoryTimestamp(mailbox) {
    const welcomeEntry = mailbox.mails.find((entry) => entry.templateId === MAIL_WELCOME_TEMPLATE_ID) ?? null;
    if (welcomeEntry) {
        return Number.isFinite(welcomeEntry.createdAt) ? Math.trunc(Number(welcomeEntry.createdAt)) : Date.now();
    }
    return Number(mailbox.revision ?? 1) > 1 ? Date.now() : null;
}

function serializeMailboxPayload(mailbox) {
    return {
        version: 1,
        revision: Math.max(1, mailbox.revision),
        welcomeMailDeliveredAt: Number.isFinite(mailbox.welcomeMailDeliveredAt)
            ? Math.trunc(Number(mailbox.welcomeMailDeliveredAt))
            : null,
        mails: serializeMailboxEntries(mailbox.mails),
    };
}

function serializeMailboxEntries(entries) {
    return Array.isArray(entries) ? entries.map((entry) => serializeMailboxEntry(entry)) : [];
}

function serializeMailboxEntry(entry) {
    return {
        ...entry,
        args: Array.isArray(entry?.args) ? entry.args.map((arg) => ({ ...arg })) : [],
        attachments: Array.isArray(entry?.attachments)
            ? entry.attachments.map((attachment) => ({ ...attachment }))
            : [],
    };
}

function nextMailVersion(entry) {
    return Math.max(1, Math.trunc(Number(entry?.mailVersion ?? 1)) + 1);
}

export function buildMailClaimOperationId(playerId, sessionEpoch, mailIds) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedEpoch = Number.isFinite(sessionEpoch) ? Math.max(1, Math.trunc(Number(sessionEpoch))) : 1;
    const normalizedIds = normalizeMailBatchIds(mailIds).slice().sort(compareMailIdStable);
    const playerHash = hashMailOperationComponent(normalizedPlayerId);
    const mailSetHash = hashMailOperationComponent(JSON.stringify(normalizedIds));
    const operationId = `mail-claim:p:${playerHash}:e:${normalizedEpoch}:m:${mailSetHash}`;
    if (operationId.length > 173) {
        throw new Error(`mail_claim_operation_id_too_long:${operationId.length}`);
    }
    return operationId;
}

function hashMailOperationComponent(value) {
    return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function compareMailIdStable(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function resolveClaimErrorMessage(error) {
    const code = error instanceof Error ? error.message : String(error);
    if (code.startsWith('player_session_fencing_conflict')) {
        const auditDebugEnabled = typeof process.env.SERVER_PROTOCOL_AUDIT_CASES === 'string'
            && process.env.SERVER_PROTOCOL_AUDIT_CASES.trim().length > 0;
        return auditDebugEnabled
            ? `当前会话已失效，请重新连接后再领取附件。 [${code}]`
            : '当前会话已失效，请重新连接后再领取附件。';
    }
    if (code === 'mail_already_claimed_or_deleted') {
        return '目标邮件已经领取或删除，请刷新邮箱后重试。';
    }
    if (code === 'mail_claim_targets_missing' || code === 'mail_claim_attachments_missing') {
        return '目标邮件已变化，请刷新邮箱后重试。';
    }
    if (code === 'mail_already_expired') {
        return '目标邮件已过期，无法再领取附件。';
    }
    return '邮件附件领取失败，请稍后重试。';
}

function shouldRetryClaimFence(error) {
    const code = error instanceof Error ? error.message : String(error);
    return code.startsWith('player_session_fencing_conflict');
}

function buildMailId(playerId, mailbox, createdAt) {
    return `mail:${normalizeMailIdComponent(playerId)}:${createdAt.toString(36)}:${mailbox.revision.toString(36)}:${mailbox.mails.length.toString(36)}`;
}

function buildMailEntry(mailId, input, createdAt) {
    return {
        version: 1,
        mailVersion: 1,
        mailId,
        senderLabel: input.senderLabel?.trim() || MAIL_DEFAULT_SENDER_LABEL,
        templateId: input.templateId?.trim() || null,
        args: normalizeArgs(input.args),
        fallbackTitle: input.fallbackTitle?.trim() || null,
        fallbackBody: input.fallbackBody?.trim() || null,
        attachments: normalizeAttachments(input.attachments),
        createdAt,
        updatedAt: createdAt,
        expireAt: Number.isFinite(input.expireAt) ? Math.trunc(Number(input.expireAt)) : null,
        firstSeenAt: null,
        readAt: null,
        claimedAt: null,
        deletedAt: null,
    };
}

function normalizeMailIdComponent(value) {
    const normalized = String(value ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .slice(0, 48);
    return normalized || 'unknown';
}
/**
 * normalizeArgs：规范化或转换Arg。
 * @param args 参数说明。
 * @returns 无返回值，直接更新Arg相关状态。
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
 * normalizeAttachments：规范化或转换Attachment。
 * @param attachments 参数说明。
 * @returns 无返回值，直接更新Attachment相关状态。
 */

function normalizeAttachments(attachments) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(attachments)) {
        return [];
    }
    return attachments
        .filter((entry) => entry && typeof entry.itemId === 'string' && entry.itemId.trim().length > 0)
        .map((entry) => ({
        ...entry,
        itemId: entry.itemId.trim(),
        count: Number.isFinite(entry.count) ? Math.max(1, Math.trunc(Number(entry.count))) : 1,
    }));
}

function isWalletAttachmentItemId(itemId) {
    return typeof itemId === 'string' && itemId.trim() === 'spirit_stone';
}

function normalizePositiveInteger(value, defaultValue, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return defaultValue;
    }
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
