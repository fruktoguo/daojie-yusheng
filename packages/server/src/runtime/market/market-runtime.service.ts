/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AUCTION_DEFAULT_DURATION_HOURS, AUCTION_LISTING_FEE_BASE, AUCTION_LISTING_FEE_RATE, AUCTION_MAX_DURATION_HOURS, AUCTION_MIN_DURATION_HOURS, CUSTOM_TECHNIQUE_BOOK_ITEM_ID, EQUIP_SLOTS, HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID, HEAVENLY_DAO_SHOP_ITEMS, ITEM_TYPES, MARKET_MAX_ENHANCE_LEVEL, MARKET_MAX_UNIT_PRICE, TECHNIQUE_EQUIP_SLOTS, TECHNIQUE_GRADE_ORDER, calculateHeavenlyDaoShopDiscountedPrice, calculateMarketOrderReservedCost, calculateMarketOrderTradeTotalCost, calculateMarketRoundedTotalCost, calculateMarketTradeTotalCost, canMergeItemStack, createItemStackSignature, getItemDisplayName, getMarketMinimumTradeQuantity, getMarketPriceStep, isLegacyMarketPrice, isValidMarketListingPrice, isValidMarketPrice, isValidMarketTradeQuantity, normalizeMarketAuctionPageSize, normalizeMarketAuctionQuery, normalizeMarketListingsPageSize, normalizeMarketPriceUp, normalizeMarketRequestPage, normalizeMarketTradeSource, normalizeTransmissionCategory, normalizeTransmissionListingSort, resolveClampedMarketResponsePage, resolvePlayerFacingContentName } from '@mud/shared';
import { assignItemInstanceIdIfNeeded } from '../world/item-instance-id.helpers';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { AUCTION_GLOBAL_TRADE_HISTORY_LIMIT, AUCTION_MY_TRADE_HISTORY_VISIBLE_LIMIT, AUCTION_TRADE_HISTORY_PAGE_SIZE, MARKET_CURRENCY_ITEM_ID, MARKET_MAX_ORDER_QUANTITY, MARKET_STORAGE_RUNTIME_CACHE_LIMIT, MARKET_TRADE_HISTORY_PAGE_SIZE, MARKET_TRADE_HISTORY_RUNTIME_CACHE_LIMIT, MARKET_TRADE_HISTORY_VISIBLE_LIMIT } from '../../constants/gameplay/market';
import { MarketPersistenceService } from '../../persistence/market-persistence.service';
import { DurableOperationService } from '../../persistence/durable-operation.service';
import { PlayerPersistenceFlushService } from '../../persistence/player-persistence-flush.service';
import { PlayerIdentityPersistenceService } from '../../persistence/player-identity-persistence.service';
import {
    PlayerDomainPersistenceService,
    nextPlayerPersistenceVersion,
} from '../../persistence/player-domain-persistence.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { InstanceCatalogService } from '../../persistence/instance-catalog.service';
import { buildStructuredNotice } from '../world/structured-notice.helpers';
import { ActivityRuntimeService, getChinaDateKey } from '../activity/activity-runtime.service';
import { parseMarketStackSignatureItemKey } from './market-item-key.helpers';
import {
    cloneStorage,
    cloneAuctionBidsMap,
    cloneAuctionTimingMap,
    cloneInventoryItems,
    normalizeInventoryItemInstanceId,
    cloneWalletBalances,
    shouldRetryMarketSessionFence,
    trimTradeHistoryRuntimeCache,
} from './market-runtime.helpers';
import {
    buildAuctionListingsPageImpl,
    buildAuctionListedItemsImpl,
    buildAuctionParticipateLotEntriesImpl,
    buildAuctionMineLotEntriesImpl,
    placeAuctionBidImpl,
    buyoutAuctionLotImpl,
    getAuctionBidViewsImpl,
    getSortedAuctionBidsImpl,
    isAuctionOrderImpl,
    getAuctionSellOrdersImpl,
    hasAuctionSellOrdersImpl,
    hydrateAuctionStateFromOpenOrdersImpl,
    initializeAuctionOrderStateImpl,
    normalizeAuctionOrderStateImpl,
    persistAuctionStateToCarrierImpl,
    clearAuctionStateForItemKeyImpl,
    reopenAuctionStateIfActiveImpl,
    settleExpiredAuctionLotsImpl,
    settleExpiredAuctionLotImpl,
    refundAuctionBidReservesImpl,
    getAuctionMinimumBidPriceImpl,
    rewriteAuctionBuyoutNoticesImpl,
    normalizeAuctionListingsRequestImpl,
    filterAuctionLotEntriesByCategoryImpl,
    filterAuctionLotEntriesByQueryImpl,
    buildAuctionListingCountsImpl,
    buildAuctionListingSummaryImpl,
    toAuctionPreviewItemImpl,
    normalizeAuctionDurationSecondsImpl,
    buildAuctionTimingImpl,
    buildAuctionBaseTimingImpl,
    getAuctionTimingStateImpl,
    projectAuctionTimingImpl,
    extendAuctionIfEndingSoonImpl,
    buildAuctionStableNumberImpl,
    buildAuctionLotKeyImpl,
    buildClientAuctionLotKeyImpl,
    resolveAuctionLotKeyImpl,
} from './market-runtime.auction';
import {
    isTransmissionOrderImpl,
    isSpecialListingOrderImpl,
    buildTransmissionLotKeyImpl,
    buildClientTransmissionLotKeyImpl,
    resolveTransmissionLotKeyImpl,
    registerTransmissionLotImpl,
    hydrateTransmissionStateFromOpenOrdersImpl,
    getTransmissionSellOrderImpl,
    buildTransmissionListedItemsImpl,
    buildTransmissionLotEntriesImpl,
    resolveTransmissionTechniqueSummaryImpl,
    buildTransmissionListingsPageImpl,
    normalizeTransmissionListingsRequestImpl,
    filterTransmissionLotEntriesByQueryImpl,
    buildTransmissionCategoryCountsImpl,
    sortTransmissionLotEntriesImpl,
    isMyTransmissionLotImpl,
    buyTransmissionLotImpl,
} from './market-runtime.transmission';
import {
    buildMarketStorageImpl,
    summarizeSpiritStoneAssetsByPlayerImpl,
    claimStorageImpl,
    mergeStorageItemImpl,
    setStorageImpl,
    getStorageImpl,
    touchStorageLruImpl,
    ensureStorageHydratedImpl,
    ensureStoragesHydratedImpl,
    pinStoragePlayerImpl,
    unpinStoragePlayerImpl,
    collectStorageCachePinnedImpl,
    evictStorageCacheIfOverLimitImpl,
    buildClaimStoragePlanImpl,
} from './market-runtime.storage';
import {
    buildMarketUpdateImpl,
    buildMarketListingsPageImpl,
    filterMarketListingEntriesImpl,
    buildMarketListingCountsImpl,
    buildMarketOrdersImpl,
    buildItemBookImpl,
    buildTradeHistoryPageImpl,
    buildListedItemsImpl,
    buildMarketListingEntriesImpl,
    groupMarketListingEntriesForPageImpl,
    buildOwnOrdersImpl,
    buildItemBookViewImpl,
    buildPriceLevelsImpl,
    getSortedOrdersImpl,
    hasConflictingOpenOrderImpl,
    hasOpenOrderImpl,
    planOrderMatchesImpl,
    getCompatibleTradeQuantityImpl,
    leastCommonMultipleImpl,
    greatestCommonDivisorImpl,
    buildItemKeyImpl,
    getOrderItemKeyImpl,
    buildClientMarketKeyImpl,
    buildMarketListingSubTypeImpl,
    resolveMarketItemForBuyImpl,
    resolveStackSignatureMarketItemKeyImpl,
    toOrderItemImpl,
    toEscrowOrderItemImpl,
    createCurrencyItemImpl,
    canAffordMarketCurrencyImpl,
    consumeMarketCurrencyFromInventoryImpl,
    deliverMarketCurrencyToPlayerImpl,
    refundOutbidAuctionReserveToPlayerImpl,
    toFullItemImpl,
    canTradeItemOnMarketImpl,
    buildItemNotTradableResultImpl,
    isOrderBookTradableItemImpl,
    isOrdinaryMarketEnhancementLevelRestrictedImpl,
    normalizeQuantityImpl,
    normalizeHeavenlyDaoShopQuantityImpl,
    resolveHeavenlyDaoShopDiscountPercentImpl,
    resolveCachedHeavenlyDaoShopDiscountPercentImpl,
    normalizeUnitPriceImpl,
    normalizeAuctionBuyoutPriceImpl,
    getAuctionOrderBuyoutPriceImpl,
    calculateAuctionListingFeeImpl,
    buildTradeQuantityErrorImpl,
    formatUnitPriceImpl,
    getHeavenlyDaoShopCurrencyNameImpl,
    formatMarketItemStackLabelImpl,
    deliverItemToPlayerImpl,
    isPlayerNetworkOnlineImpl,
    hasActiveProjectionFenceImpl,
    recordTradeImpl,
    toTradeHistoryViewImpl,
    loadTradeHistoryIdentityMapImpl,
    normalizePlayerLabelTextImpl,
    resolveIdentityPlayerLabelImpl,
    resolveOnlineMarketPlayerLabelImpl,
    normalizeTradeSourceImpl,
    normalizeTradeHistoryScopeImpl,
    loadGlobalTradeHistoryImpl,
    loadVisibleTradeHistoryImpl,
    createEmptyResultImpl,
    singleMessageImpl,
    singleStructuredMessageImpl,
    touchAffectedPlayerImpl,
    pushNoticeImpl,
    pushStructuredNoticeImpl,
    markOrderDirtyImpl,
    deleteOrderImpl,
    compactOpenOrdersImpl,
    rebuildAuctionClientKeyIndexImpl,
    captureOnlinePlayerStateImpl,
    getCurrencyItemNameImpl,
    resolveMarketItemDisplayNameImpl,
    createMutationContextImpl,
    restoreMutationContextImpl,
    runExclusiveMarketMutationImpl,
    flushAffectedPlayersAfterMutationImpl,
    runExclusivePlayerAssetMutationImpl,
    runExclusiveImpl,
} from './market-runtime.views';

export const AUCTION_EXTENSION_WINDOW_MS = 30 * 1000;
export const AUCTION_MAX_EXTENSION_MS = 60 * 60 * 1000;
export const MARKET_DURABLE_OPERATION_ALREADY_COMMITTED = 'market_durable_operation_already_committed';

export class MarketDurableOperationCommittedError extends Error {
    constructor(readonly operationId: string) {
        super(MARKET_DURABLE_OPERATION_ALREADY_COMMITTED);
    }
}

/** 坊市运行时：维护挂单、成交、仓库与交易历史。 */
@Injectable()
export class MarketRuntimeService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * marketPersistenceService：坊市Persistence服务引用。
 */

    marketPersistenceService;
    /**
 * durableOperationService：强事务Persistence服务引用。
 */

    durableOperationService;
    /**
 * instanceCatalogService：实例目录持久化服务引用。
 */

    instanceCatalogService;
    /**
 * playerPersistenceFlushService：玩家持久化刷盘服务引用，用于在坊市成交后立即把当事玩家的内存
 * 改动落库，避免 5 秒周期 flush 与异常重启之间的丢失窗口；smoke 直接构造时可以省略。
 */

    playerPersistenceFlushService: any = null;
    /** 玩家身份持久化服务，用于低频面板历史补齐角色名，避免向玩家暴露内部 playerId。 */
    playerIdentityPersistenceService: any = null;
    /** 玩家分域持久化服务，用于 durable 市场操作前同步 session fencing。 */
    playerDomainPersistenceService: any = null;
    /** 活动权益服务，用于天道商店折扣结算。 */
    activityRuntimeService: any = null;
    /** 运行时日志器，记录加载、撮合与持久化异常。 */
    logger = new Logger(MarketRuntimeService.name);
    /** 当前仍然有效的求购/出售挂单。 */
    openOrders = [];
    /** 最近成交记录，用于交易历史面板。 */
    tradeHistory = [];
    /** 每个玩家的坊市仓库缓存。仅缓存已经被 hydrateStorageForPlayer 加载过的玩家条目。 */
    storageByPlayerId = new Map();
    /**
     * 已经从持久化层加载过 (hydrate) 的玩家 ID。Set 的迭代顺序近似于 LRU：
     * 命中时通过 delete + add 重新插入到末尾，超出 MARKET_STORAGE_RUNTIME_CACHE_LIMIT
     * 时按迭代顺序从头驱逐离线/无挂单玩家。
     */
    loadedStoragePlayerIds = new Set<string>();
    /** 同一玩家的并发 hydrate 复用同一个 Promise，避免重复 SQL 与并发写入。 */
    storageHydrationLocks = new Map<string, Promise<void>>();
    /** 当前正在执行 mutation 的玩家集合，eviction 时跳过这些条目以防数据丢失。 */
    pendingStorageMutationPlayerIds = new Map<string, number>();
    /** 拍卖行独立出价态，避免拍卖出价误走坊市买单撮合。 */
    auctionBidsByItemKey = new Map();
    /** 拍卖行权威结束时间，前端只用投影字段本地倒计时。 */
    auctionTimingByItemKey = new Map();
    /** clientAuctionLotKey → auctionLotKey 索引，避免 resolveAuctionLotKey O(n) 扫描。 */
    auctionClientKeyToLotKey = new Map<string, string>();
    /** clientTransmissionLotKey → transmissionLotKey 索引，避免 resolveTransmissionLotKey O(n) 扫描。 */
    transmissionClientKeyToLotKey = new Map<string, string>();
    /** 串行化坊市写操作，避免并发修改同一份内存状态。 */
    marketOperationQueue = Promise.resolve();
    /** 注入内容、玩家与坊市持久化服务。 */
    constructor(
        @Inject(ContentTemplateRepository) contentTemplateRepository: any,
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(MarketPersistenceService) marketPersistenceService: any,
        @Inject(DurableOperationService) durableOperationService: any,
        @Inject(InstanceCatalogService) instanceCatalogService: any,
        @Optional() @Inject(PlayerPersistenceFlushService) playerPersistenceFlushService: any = null,
        @Optional() @Inject(PlayerIdentityPersistenceService) playerIdentityPersistenceService: any = null,
        @Optional() @Inject(PlayerDomainPersistenceService) playerDomainPersistenceService: any = null,
        @Optional() @Inject(ActivityRuntimeService) activityRuntimeService: any = null,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.marketPersistenceService = marketPersistenceService;
        this.durableOperationService = durableOperationService;
        this.instanceCatalogService = instanceCatalogService;
        this.playerPersistenceFlushService = playerPersistenceFlushService ?? null;
        this.playerIdentityPersistenceService = playerIdentityPersistenceService ?? null;
        this.playerDomainPersistenceService = playerDomainPersistenceService ?? null;
        this.activityRuntimeService = activityRuntimeService ?? null;
    }
    /** 应用完成启动后再回填坊市快照，避免早于持久化服务初始化导致空装载。 */
    async onApplicationBootstrap() {
        this.logger.log('坊市运行态恢复已交由启动链路编排器执行');
    }
    /** 关停前等待当前 marketOperationQueue 串行链跑完。 */
    async drainForShutdown(): Promise<void> {
        try {
            await this.marketOperationQueue;
        }
        catch (error) {
            this.logger.error(
                `等待坊市 mutation 队列收尾失败：${error instanceof Error ? error.stack : String(error)}`,
            );
        }
    }
    /** 购买坊市内的天道商店固定商品。 */
    async buyHeavenlyDaoShopItem(playerId, payload) {
        await this.ensureStorageHydrated(playerId);
        return this.runExclusiveMarketMutation(playerId, async (context) => {
            return this.runExclusivePlayerAssetMutation([playerId], async () => {
            const itemId = typeof payload?.itemId === 'string' ? payload.itemId.trim() : '';
            const quantity = this.normalizeHeavenlyDaoShopQuantity(payload?.quantity);
            const shopItem = HEAVENLY_DAO_SHOP_ITEMS.find((entry) => entry.itemId === itemId);
            if (!shopItem || !quantity) {
                return this.singleMessage(playerId, '天道商店商品不存在。', 'warn');
            }
    const dailyLimit = 'dailyLimit' in shopItem
     ? Math.max(1, Math.trunc(Number(shopItem.dailyLimit) || 0))
     : null;
    const purchaseDate = dailyLimit ? getChinaDateKey() : null;
    if (dailyLimit && purchaseDate) {
     if (this.durableOperationService?.isEnabled?.() !== true
      || typeof this.durableOperationService.getHeavenlyDaoShopPurchasedCount !== 'function') {
      return this.singleMessage(playerId, '天道商店限购状态暂不可用，请稍后重试。', 'warn');
     }
     const purchasedCount = await this.durableOperationService.getHeavenlyDaoShopPurchasedCount(playerId, itemId, purchaseDate);
     const remainingCount = Math.max(0, dailyLimit - purchasedCount);
     if (quantity > remainingCount) {
      const itemName = this.contentTemplateRepository.getItemName(itemId) ?? itemId;
      return this.singleMessage(playerId, `${itemName}每日限购 ${dailyLimit} 个，今日剩余可购 ${remainingCount} 个。`, 'warn');
     }
    }
            const discountPercent = await this.resolveHeavenlyDaoShopDiscountPercent(playerId);
            const unitPrice = calculateHeavenlyDaoShopDiscountedPrice(shopItem.price, discountPercent);
            const totalCost = unitPrice * quantity;
            if (!Number.isSafeInteger(totalCost) || totalCost <= 0) {
                return this.singleMessage(playerId, '天道商店价格异常，已拒绝本次购买。', 'warn');
            }
            const outputCount = shopItem.count * quantity;
            if (!Number.isSafeInteger(outputCount) || outputCount <= 0) {
                return this.singleMessage(playerId, '天道商店商品数量异常，已拒绝本次购买。', 'warn');
            }
            const item = this.contentTemplateRepository.createItem(shopItem.itemId, outputCount);
            if (!item) {
                return this.singleMessage(playerId, '天道商店商品配置不存在。', 'warn');
            }
            const currencyName = this.getHeavenlyDaoShopCurrencyName();
            if (!this.playerRuntimeService.canAffordWallet(playerId, HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID, totalCost)) {
                return this.singleMessage(playerId, `${currencyName}不足，无法购买。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            if (!this.playerRuntimeService.canAffordWallet(playerId, HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID, totalCost)) {
                return this.singleMessage(playerId, `${currencyName}不足，无法购买。`);
            }
            this.playerRuntimeService.debitWallet(playerId, HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID, totalCost);
            this.deliverItemToPlayer(playerId, item, context);
            const itemLabel = this.formatMarketItemStackLabel(item);
            const durableCommitted = await this.commitDurableMarketMutationIfAvailable(context, playerId, 'heavenly_dao_shop_purchase', {
                operationId: payload?.operationId ?? payload?.requestId,
                itemId: shopItem.itemId,
                quantity,
                outputCount,
                unitPrice,
                totalCost,
                discountPercent,
    }, {
     heavenlyDaoShopPurchase: dailyLimit && purchaseDate
      ? { itemId: shopItem.itemId, purchaseDate, quantity, dailyLimit }
      : null,
            });
            if (this.durableOperationService?.isEnabled?.() && !durableCommitted) {
                throw new Error('heavenly_dao_shop_purchase_durable_commit_failed');
            }
            return this.singleStructuredMessage(playerId, 'success', 'notice.market.heavenly-dao-shop.purchased', `购买 ${itemLabel}，消耗 ${currencyName} x${totalCost}`, {
                vars: { itemLabel, currency: currencyName, cost: totalCost },
                pills: [{ key: 'itemLabel', style: 'target' }, { key: 'currency', style: 'target' }],
            });
            });
        });
    }
    /** 可用时通过强事务服务提交玩家侧坊市 mutation，当前未启用或缺少通用接口时回退常规 flush。 */
    async commitDurableMarketMutationIfAvailable(context, playerId, operationType, payload = undefined, options = {}) {
        const durableOperationService = this.durableOperationService;
        if (!durableOperationService?.isEnabled?.() || typeof durableOperationService.settleMarketMutation !== 'function') {
            return false;
        }
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        const normalizedOperationType = typeof operationType === 'string' && operationType.trim()
            ? operationType.trim()
            : 'market_mutation';
        if (!normalizedPlayerId) {
            return false;
        }
        const primarySnapshot = this.playerRuntimeService.snapshot(normalizedPlayerId);
        const runtimeOwnerId = typeof primarySnapshot?.runtimeOwnerId === 'string' && primarySnapshot.runtimeOwnerId.trim()
            ? primarySnapshot.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(primarySnapshot?.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(primarySnapshot.sessionEpoch)))
            : 0;
  const durableOptions = options as {
   requirePresenceFence?: boolean;
   banUser?: unknown;
   heavenlyDaoShopPurchase?: { itemId: string; purchaseDate: string; quantity: number; dailyLimit: number } | null;
  };
        const requirePresenceFence = durableOptions.requirePresenceFence !== false;
        if (requirePresenceFence && (!primarySnapshot?.inventory || !primarySnapshot?.wallet || !runtimeOwnerId || sessionEpoch <= 0)) {
            return false;
        }
        const affectedPlayerIds = new Set([normalizedPlayerId]);
        for (const affectedPlayerId of context?.onlinePlayerSnapshots?.keys?.() ?? []) {
            affectedPlayerIds.add(affectedPlayerId);
        }
        for (const affectedPlayerId of context?.dirtyStoragePlayerIds?.values?.() ?? []) {
            affectedPlayerIds.add(affectedPlayerId);
        }
        const playerMutations: Array<{
            playerId: string;
            expectedRuntimeOwnerId?: string;
            expectedSessionEpoch?: number;
            nextInventoryItems?: unknown[];
            nextWalletBalances?: unknown[];
            nextMarketStorageItems?: unknown[];
        }> = [];
        for (const affectedPlayerId of Array.from(affectedPlayerIds).filter((entry) => typeof entry === 'string' && entry.trim())) {
            const snapshot = this.playerRuntimeService.snapshot(affectedPlayerId);
            const storage = this.storageByPlayerId.has(affectedPlayerId)
                ? cloneStorage(this.storageByPlayerId.get(affectedPlayerId))
                : null;
            const mutation: {
                playerId: string;
                expectedRuntimeOwnerId?: string;
                expectedSessionEpoch?: number;
                nextInventoryItems?: unknown[];
                nextWalletBalances?: unknown[];
                nextMarketStorageItems?: unknown[];
            } = { playerId: affectedPlayerId };
            const affectedRuntimeOwnerId = typeof snapshot?.runtimeOwnerId === 'string' ? snapshot.runtimeOwnerId.trim() : '';
            const affectedSessionEpoch = Number.isFinite(Number(snapshot?.sessionEpoch))
                ? Math.max(0, Math.trunc(Number(snapshot.sessionEpoch)))
                : 0;
            if (affectedRuntimeOwnerId && affectedSessionEpoch > 0) {
                mutation.expectedRuntimeOwnerId = affectedRuntimeOwnerId;
                mutation.expectedSessionEpoch = affectedSessionEpoch;
            }
            if (snapshot?.inventory) {
                mutation.nextInventoryItems = cloneInventoryItems(snapshot.inventory.items ?? []);
            }
            if (snapshot?.wallet) {
                mutation.nextWalletBalances = cloneWalletBalances(snapshot.wallet.balances ?? []);
            }
            if (context?.dirtyStoragePlayerIds?.has?.(affectedPlayerId)) {
                mutation.nextMarketStorageItems = storage ? storage.items : [];
            }
            if (mutation.nextInventoryItems || mutation.nextWalletBalances || mutation.nextMarketStorageItems) {
                playerMutations.push(mutation);
            }
        }
        if (typeof this.playerRuntimeService?.hasActiveAssetMutationLocks === 'function'
            && !this.playerRuntimeService.hasActiveAssetMutationLocks(Array.from(affectedPlayerIds))) {
            throw new Error('market_player_asset_lock_set_incomplete');
        }
        const rawOperationId = this.resolveClientMarketOperationId(payload);
        const operationId = rawOperationId
            ? `market-${normalizedOperationType}:${normalizedPlayerId}:${rawOperationId}`
            : `market-${normalizedOperationType}:${normalizedPlayerId}:${Date.now()}:${randomUUID()}`;
        const buildInput = async () => {
            const snapshot = this.playerRuntimeService.snapshot(normalizedPlayerId);
            const ownerId = typeof snapshot?.runtimeOwnerId === 'string' && snapshot.runtimeOwnerId.trim()
                ? snapshot.runtimeOwnerId.trim()
                : runtimeOwnerId;
            const epoch = Number.isFinite(snapshot?.sessionEpoch)
                ? Math.max(1, Math.trunc(Number(snapshot.sessionEpoch)))
                : sessionEpoch;
            const lease = requirePresenceFence ? await this.resolveInstanceLeaseContext(snapshot?.instanceId ?? primarySnapshot?.instanceId ?? null) : null;
            const mutatedOrderIds = new Set([
                ...Array.from(context?.dirtyOrderIds ?? []),
                ...Array.from(context?.deletedOrderIds ?? []),
            ]);
            const expectedOrders = Array.from(mutatedOrderIds, (orderId) => {
                const before = context?.openOrdersSnapshot?.find?.((order) => order?.id === orderId) ?? null;
                return before
                    ? {
                        orderId,
                        exists: true,
                        status: before.status,
                        remainingQuantity: before.remainingQuantity,
                        updatedAtMs: before.updatedAt,
                    }
                    : { orderId, exists: false };
            });
            return {
                operationId,
                playerId: normalizedPlayerId,
                expectedRuntimeOwnerId: ownerId || null,
                expectedSessionEpoch: epoch || null,
                expectedInstanceId: snapshot?.instanceId ?? primarySnapshot?.instanceId ?? null,
                expectedAssignedNodeId: lease?.assignedNodeId ?? null,
                expectedOwnershipEpoch: lease?.ownershipEpoch ?? null,
                operationType: normalizedOperationType,
                payload,
                requirePresenceFence,
                playerMutations,
                expectedOrders,
                upsertOrders: this.openOrders
                    .filter((order) => context?.dirtyOrderIds?.has?.(order.id))
                    .map((order) => ({ ...order, item: { ...order.item } })),
                deleteOrderIds: Array.from(context?.deletedOrderIds ?? []),
                tradeRecords: (context?.newTradeRecords ?? []).map((entry) => ({ ...entry })),
                banUser: durableOptions.banUser ?? null,
    heavenlyDaoShopPurchase: durableOptions.heavenlyDaoShopPurchase ?? null,
            };
        };
        if (requirePresenceFence) {
            await this.syncCurrentPresenceFence(normalizedPlayerId);
        }
        let result;
        try {
            result = await durableOperationService.settleMarketMutation(await buildInput());
        }
        catch (error) {
            let settlementError = error;
            if (requirePresenceFence && shouldRetryMarketSessionFence(error) && await this.syncCurrentPresenceFence(normalizedPlayerId)) {
                try {
                    result = await durableOperationService.settleMarketMutation(await buildInput());
                    settlementError = null;
                }
                catch (retryError) {
                    settlementError = retryError;
                }
            }
            if (settlementError) {
                throw settlementError;
            }
        }
        if (result?.ok && result?.alreadyCommitted) {
            // 历史 replay 的 operation 后态可能早于其后的正常资产变更，绝不能回灌旧 payload。
            // 当前参与玩家锁仍在：只撤销本次重复请求的乐观变更，保留请求开始前的最新运行态。
            this.restoreMutationContext(context);
            context.skipPersistence = true;
            throw new MarketDurableOperationCommittedError(operationId);
        }
        if (result?.ok) {
            context.skipPersistence = true;
            return true;
        }
        return false;
    }

    resolveClientMarketOperationId(payload) {
        if (!payload || typeof payload !== 'object') {
            return '';
        }
        for (const key of ['operationId', 'requestId', 'clientOperationId', 'idempotencyKey']) {
            const value = payload?.[key];
            if (typeof value === 'string' && value.trim()) {
                return value.trim().slice(0, 96);
            }
        }
        return '';
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
    /** 重新加载坊市快照，通常用于启动或 GM 恢复后重建内存态。 */
    async reloadFromPersistence() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.openOrders = (await this.marketPersistenceService.loadOpenOrders()).map((order) => ({
            ...order,
            item: this.toFullItem(order.item),
        }));
        this.tradeHistory = trimTradeHistoryRuntimeCache(await this.marketPersistenceService.loadTradeHistory());
        // 改为按需 lazy-load：启动时不再灌入所有历史玩家的坊市仓库，
        // 只在玩家实际触发坊市操作或参与撮合时通过 ensureStorageHydrated 拉取。
        this.storageByPlayerId.clear();
        this.loadedStoragePlayerIds.clear();
        this.storageHydrationLocks.clear();
        this.pendingStorageMutationPlayerIds.clear();
        this.auctionBidsByItemKey.clear();
        this.auctionTimingByItemKey.clear();
        this.hydrateAuctionStateFromOpenOrders();
        this.hydrateTransmissionStateFromOpenOrders();
        this.compactOpenOrders();
        // 维持不变量：openOrders 中的所有 owner 与拍卖出价人都已 hydrate，
        // 之后撮合/退款分支无需再为对手方做异步等待，只需 hydrate 当前主动玩家即可。
        await this.ensureStoragesHydrated(this.collectOrderParticipantPlayerIds());
    }
    /** GM 兼容转换写库时独占坊市状态，并在提交后从数据库重建运行态缓存。 */
    async runExclusiveCompatibilityPersistenceReload<T>(action: () => Promise<T>): Promise<{
        result: T;
        reloadError: string | null;
    }> {
        return this.runExclusive(async () => {
            const result = await action();
            try {
                await this.reloadFromPersistence();
                return { result, reloadError: null };
            }
            catch (firstError) {
                this.logger.warn(`GM 兼容转换提交后首次重载坊市失败，立即重试：${firstError instanceof Error ? firstError.message : String(firstError)}`);
            }
            try {
                await this.reloadFromPersistence();
                return { result, reloadError: null };
            }
            catch (error) {
                const reloadError = error instanceof Error ? error.message : String(error);
                this.logger.error(`GM 兼容转换已提交，但坊市运行态重载失败：${reloadError}`);
                return { result, reloadError };
            }
        });
    }
    /** 收集当前 openOrders 与拍卖出价中的所有参与玩家，用于 hydrate 不变量维护。 */
    collectOrderParticipantPlayerIds() {
        const participants = new Set();
        for (const order of this.openOrders) {
            const ownerId = typeof order?.ownerId === 'string' ? order.ownerId : '';
            if (ownerId) {
                participants.add(ownerId);
            }
        }
        for (const bids of this.auctionBidsByItemKey.values()) {
            if (!Array.isArray(bids)) {
                continue;
            }
            for (const bid of bids) {
                const bidderId = typeof bid?.bidderId === 'string' ? bid.bidderId : '';
                if (bidderId) {
                    participants.add(bidderId);
                }
            }
        }
        return participants;
    }
    /** 生成玩家进入坊市时需要的总览数据。 */
        buildMarketUpdate(playerId) {
        return buildMarketUpdateImpl(this, playerId);
    }
    /** 构造分页坊市列表，支持品类、部位和功法书分类过滤。 */
        buildMarketListingsPage(payload) {
        return buildMarketListingsPageImpl(this, payload);
    }
    /** 构造拍卖行分页列表，服务端按 tab、筛选和页码裁剪后只返回当前页。 */
        buildAuctionListingsPage(playerId, payload) {
        return buildAuctionListingsPageImpl(this, playerId, payload);
    }
    /**
 * filterMarketListingEntries：按请求筛选坊市分页条目。
 * @param entries 坊市分页条目。
 * @param category 主分类。
 * @param equipmentSlot 装备部位。
 * @param techniqueCategory 功法分类。
 * @returns 筛选后的坊市分页条目。
 */

        filterMarketListingEntries(entries, category, equipmentSlot, techniqueCategory) {
        return filterMarketListingEntriesImpl(this, entries, category, equipmentSlot, techniqueCategory);
    }
    /**
 * buildMarketListingCounts：按服务端分页分组口径生成分类计数。
 * @param entries 坊市分页条目。
 * @returns 坊市分类计数。
 */

        buildMarketListingCounts(entries) {
        return buildMarketListingCountsImpl(this, entries);
    }
    /** 构造玩家自己的挂单列表。 */
        buildMarketOrders(playerId) {
        return buildMarketOrdersImpl(this, playerId);
    }
    /** 构造玩家仓库视图，展示仓库中可挂售的条目。 */
        buildMarketStorage(playerId) {
        return buildMarketStorageImpl(this, playerId);
    }
    /**
     * 汇总玩家暂存在坊市边界内的灵石：托管仓、开放求购预留以及有效竞拍冻结。
     * 托管仓先读完整数据库真源，再以当前已 hydrate 的运行态覆盖，避免 LRU 缓存遗漏或脏读旧值。
     */
        async summarizeSpiritStoneAssetsByPlayer() {
        return summarizeSpiritStoneAssetsByPlayerImpl(this);
    }
    /** 构造某件物品的坊市图鉴页，供查看价格和挂单情况。 */
        buildItemBook(itemKey) {
        return buildItemBookImpl(this, itemKey);
    }
    /** 构造成交历史分页；拍卖行支持全服最近记录和我的记录两种范围。 */
        async buildTradeHistoryPage(playerId, page, source = 'market', scope = 'mine') {
        return buildTradeHistoryPageImpl(this, playerId, page, source, scope);
    }
    /** 发起出售挂单，必要时直接撮合买单。 */
    async createSellOrder(playerId, payload) {
        await this.ensureStorageHydrated(playerId);
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const listingMode = payload?.listingMode === 'auction' || payload?.auction === true
                ? 'auction'
                : payload?.listingMode === 'transmission'
                    ? 'transmission'
                    : 'market';
            const itemInstanceId = this.resolveMarketInventoryItemInstanceId(playerId, payload, 'createSellOrder');
            const item = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId);
            if (!item) {
                return this.singleMessage(playerId, '要挂售的物品不存在。');
            }

            const quantity = this.normalizeQuantity(payload.quantity);

            const unitPrice = this.normalizeUnitPrice(payload.unitPrice);
            if (!quantity || !unitPrice) {
                return this.singleMessage(playerId, '挂售数量或单价无效。');
            }
            if (listingMode === 'auction' && (!Number.isInteger(unitPrice) || unitPrice < 1)) {
                return this.singleMessage(playerId, '拍卖总价必须是正整数。');
            }
            if (listingMode === 'transmission' && (!Number.isInteger(unitPrice) || unitPrice < 1)) {
                return this.singleStructuredMessage(playerId, 'warn', 'notice.market.transmission-invalid-price', '传法台售价必须是正整数。', {});
            }
            if (listingMode === 'market' && !isValidMarketTradeQuantity(unitPrice, quantity)) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(unitPrice));
            }
            const auctionBuyoutPrice = listingMode === 'auction'
                ? this.normalizeAuctionBuyoutPrice(payload?.buyoutPrice, unitPrice)
                : null;
            const auctionDurationSeconds = listingMode === 'auction'
                ? this.normalizeAuctionDurationSeconds(payload?.auctionDurationHours)
                : null;
            const auctionListingFee = listingMode === 'auction'
                ? this.calculateAuctionListingFee(unitPrice)
                : 0;
            if (item.count < quantity) {
                return this.singleMessage(playerId, '挂售数量超过了当前持有数量。');
            }
            if (!this.canTradeItemOnMarket(item)) {
                return this.buildItemNotTradableResult(playerId);
            }
            if (listingMode === 'market' && item.itemId === CUSTOM_TECHNIQUE_BOOK_ITEM_ID) {
                // 普通坊市按 itemId 聚合盘口，残卷共用 itemId 会导致 A 功法被当 B 功法成交。
                return this.singleStructuredMessage(playerId, 'warn', 'notice.market.custom-technique-order-book-forbidden', '自创功法残卷不能在普通坊市交易，请前往传法台或拍卖行。', {});
            }
            if (listingMode === 'transmission' && item.itemId !== CUSTOM_TECHNIQUE_BOOK_ITEM_ID) {
                return this.singleStructuredMessage(playerId, 'warn', 'notice.market.transmission-only-custom-technique', '传法台只流通自创功法残卷。', {});
            }
            if (listingMode === 'transmission' && !item.learnTechniqueId) {
                // 空书（功法身份已丢失）不得再次流通，避免买家买到无法学习的残卷。
                return this.singleStructuredMessage(playerId, 'warn', 'notice.market.transmission-empty-book', '这卷残卷已残缺不全，无法寄售。', {});
            }
            if (listingMode !== 'auction' && this.isOrdinaryMarketEnhancementLevelRestricted(item)) {
                return this.singleMessage(playerId, `普通坊市只支持 +${MARKET_MAX_ENHANCE_LEVEL} 及以下装备，+${MARKET_MAX_ENHANCE_LEVEL + 1} 以上请走拍卖行寄拍。`);
            }
            if (auctionListingFee > 0 && !this.canAffordMarketCurrency(playerId, auctionListingFee)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，发起拍卖需要上架费 ${this.formatUnitPrice(auctionListingFee)}。`);
            }

            let orderItem = this.toOrderItem(item);

            const itemKey = this.buildItemKey(orderItem);
            if (listingMode === 'market' && this.hasConflictingOpenOrder(playerId, itemKey, 'sell')) {
                return this.singleMessage(playerId, '同一种物品已在求购中，不能同时挂售。');
            }
            const buyOrders = listingMode !== 'market'
                ? []
                : this.getSortedOrders(itemKey, 'buy').filter((order) => order.ownerId !== playerId && order.unitPrice >= unitPrice);
            const matchPlan = this.planOrderMatches(buyOrders, quantity, unitPrice);
            return this.runExclusivePlayerAssetMutation(
                [playerId, ...matchPlan.matches.map((match) => match.order.ownerId)],
                async () => {
                    const currentItem = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId);
                    if (!currentItem || Number(currentItem.count ?? 0) < quantity) {
                        return this.singleMessage(playerId, '挂售物品已发生变化，请重新操作。');
                    }
                    if (auctionListingFee > 0 && !this.canAffordMarketCurrency(playerId, auctionListingFee)) {
                        return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，发起拍卖需要上架费 ${this.formatUnitPrice(auctionListingFee)}。`);
                    }
            this.captureOnlinePlayerState(playerId, context);
            if (auctionListingFee > 0 && !this.consumeMarketCurrencyFromInventory(playerId, auctionListingFee)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，发起拍卖需要上架费 ${this.formatUnitPrice(auctionListingFee)}。`);
            }

            const extractedItem = this.playerRuntimeService.splitInventoryItemByInstanceId(playerId, itemInstanceId, quantity);
            if (listingMode !== 'market') {
                // 拍卖与传法台是一物一单的托管链，必须使用真实拆分出的实例身份。
                orderItem = this.toEscrowOrderItem(extractedItem);
            }

            const result = this.createEmptyResult(playerId);

            let remaining = matchPlan.remainingQuantity;
            for (const match of matchPlan.matches) {
                const buyOrder = match.order;
                const tradeQuantity = match.quantity;

                const tradePrice = buyOrder.unitPrice;
                this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverMarketCurrencyToPlayer(playerId, match.totalCost, context);
                this.recordTrade({
                    source: 'market',
                    buyerId: buyOrder.ownerId,
                    sellerId: playerId,
                    itemId: orderItem.itemId,
                    quantity: tradeQuantity,
                    unitPrice: tradePrice,
                }, context);
                buyOrder.remainingQuantity -= tradeQuantity;
                buyOrder.updatedAt = Date.now();
                this.markOrderDirty(buyOrder.id, context);
                this.touchAffectedPlayer(result, buyOrder.ownerId);
                this.pushNotice(result, buyOrder.ownerId, `你的求购已成交：${getItemDisplayName(orderItem)} x${tradeQuantity}。`, 'loot');
                this.pushNotice(result, playerId, `你卖出了 ${getItemDisplayName(orderItem)} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${match.totalCost}。`, 'loot');
                if (buyOrder.remainingQuantity <= 0) {
                    buyOrder.status = 'filled';
                    this.deleteOrder(buyOrder.id, context);
                }
            }
            if (remaining > 0) {

                const now = Date.now();

                const order = {
                    version: 1,
                    id: randomUUID(),
                    ownerId: playerId,
                    side: 'sell',
                    status: 'open',
                    itemKey,
                    item: orderItem,
                    remainingQuantity: remaining,
                    unitPrice,
                    createdAt: now,
                    updatedAt: now,
                    // 只有传法台单携带该标记，普通坊市与拍卖单的 raw_payload 保持原样。
                    ...(listingMode === 'transmission' ? { listingMode: 'transmission' as const } : {}),
                };
                this.openOrders.push(order);
                if (listingMode === 'auction') {
                    this.initializeAuctionOrderState(order, context, auctionBuyoutPrice, auctionDurationSeconds);
                }
                else if (listingMode === 'transmission') {
                    this.registerTransmissionLot(order);
                }
                this.markOrderDirty(order.id, context, order);
                if (listingMode === 'auction') {
                    const listingText = `已寄拍 ${getItemDisplayName(orderItem)} x${remaining}，整包总价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}，已收上架费 ${this.formatUnitPrice(auctionListingFee)} ${this.getCurrencyItemName()}。`;
                    this.pushStructuredNotice(result, playerId, 'success', 'notice.market.auction.consigned', listingText, {
                        vars: {
                            itemName: getItemDisplayName(orderItem),
                            quantity: remaining,
                            currencyName: this.getCurrencyItemName(),
                            totalPrice: this.formatUnitPrice(unitPrice),
                            listingFee: this.formatUnitPrice(auctionListingFee),
                        },
                        pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
                    });
                }
                else if (listingMode === 'transmission') {
                    const listingText = `已在传法台寄售 ${getItemDisplayName(orderItem)}，售价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}。`;
                    this.pushStructuredNotice(result, playerId, 'success', 'notice.market.transmission.consigned', listingText, {
                        vars: {
                            itemName: getItemDisplayName(orderItem),
                            currencyName: this.getCurrencyItemName(),
                            totalPrice: this.formatUnitPrice(unitPrice),
                        },
                        pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
                    });
                }
                else {
                    const listingText = `已挂售 ${getItemDisplayName(orderItem)} x${remaining}，单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}。`;
                    this.pushNotice(result, playerId, listingText, 'success');
                }
            }
            this.compactOpenOrders();
            const durableCommitted = await this.commitDurableMarketMutationIfAvailable(context, playerId, 'market_create_sell_order', {
                operationId: payload?.operationId,
                listingMode,
                itemId: orderItem.itemId,
                itemKey,
                quantity,
                unitPrice,
                remainingQuantity: remaining,
            });
            if (this.durableOperationService?.isEnabled?.() && !durableCommitted) {
                throw new Error('market_create_sell_order_durable_commit_failed');
            }
                    return result;
                },
            );
        });
    }
    resolveMarketInventoryItemInstanceId(playerId, payload, _eventName) {
        const itemInstanceId = normalizeInventoryItemInstanceId(payload?.itemRef?.itemInstanceId)
            || normalizeInventoryItemInstanceId(payload?.itemInstanceId)
            || normalizeInventoryItemInstanceId(payload?.expectedItemInstanceId);
        if (itemInstanceId) {
            return itemInstanceId;
        }
        this.playerRuntimeService.repairInventoryItemInstanceIds(playerId);
        throw new BadRequestException('背包物品身份已修复，请重新选择。');
    }
    /** 发起求购挂单，必要时直接撮合卖单。 */
    async createBuyOrder(playerId, payload) {
        await this.ensureStorageHydrated(playerId);
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const item = this.resolveMarketItemForBuy(payload);
            if (!item) {
                return this.singleMessage(playerId, '求购的物品不存在。');
            }
            if (!this.canTradeItemOnMarket(item)) {
                return this.buildItemNotTradableResult(playerId);
            }
            if (item.itemId === CUSTOM_TECHNIQUE_BOOK_ITEM_ID) {
                // 求购单的物品由模板重建，不含 learnTechniqueId；一旦撮合成交会把空书交付买家。
                return this.singleStructuredMessage(playerId, 'warn', 'notice.market.custom-technique-order-book-forbidden', '自创功法残卷不能在普通坊市交易，请前往传法台或拍卖行。', {});
            }
            if (this.isOrdinaryMarketEnhancementLevelRestricted(item)) {
                return this.singleMessage(playerId, `普通坊市只支持 +${MARKET_MAX_ENHANCE_LEVEL} 及以下装备求购，+${MARKET_MAX_ENHANCE_LEVEL + 1} 以上请走拍卖行。`);
            }

            const quantity = this.normalizeQuantity(payload.quantity);

            const unitPrice = this.normalizeUnitPrice(payload.unitPrice);
            if (!quantity || !unitPrice) {
                return this.singleMessage(playerId, '求购数量或单价无效。');
            }
            if (!isValidMarketTradeQuantity(unitPrice, quantity)) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(unitPrice));
            }

            const orderItem = this.toOrderItem(item);

            const itemKey = this.buildItemKey(orderItem);
            if (this.hasOpenOrder(playerId, itemKey, 'buy')) {
                return this.singleStructuredMessage(playerId, 'warn', 'notice.market.buy-order-duplicate', '同一种物品已有求购挂单，不能重复求购。', {});
            }
            if (this.hasConflictingOpenOrder(playerId, itemKey, 'buy')) {
                return this.singleMessage(playerId, '同一种物品已在挂售中，不能同时求购。');
            }

            const totalCost = calculateMarketTradeTotalCost(quantity, unitPrice);
            if (totalCost === null) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(unitPrice));
            }
            const sellOrders = this.getSortedOrders(itemKey, 'sell').filter((order) => order.ownerId !== playerId && order.unitPrice <= unitPrice);
            const matchPlan = this.planOrderMatches(sellOrders, quantity, unitPrice);
            return this.runExclusivePlayerAssetMutation(
                [playerId, ...matchPlan.matches.map((match) => match.order.ownerId)],
                async () => {
                    if (!this.canAffordMarketCurrency(playerId, totalCost)) {
                        return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法挂出求购。`);
                    }
            this.captureOnlinePlayerState(playerId, context);
            if (!this.consumeMarketCurrencyFromInventory(playerId, totalCost)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法挂出求购。`);
            }

            const result = this.createEmptyResult(playerId);

            let remaining = matchPlan.remainingQuantity;
            for (const match of matchPlan.matches) {
                const sellOrder = match.order;
                const tradeQuantity = match.quantity;

                const tradePrice = sellOrder.unitPrice;
                this.deliverItemToPlayer(playerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverMarketCurrencyToPlayer(sellOrder.ownerId, match.totalCost, context);
                this.recordTrade({
                    source: 'market',
                    buyerId: playerId,
                    sellerId: sellOrder.ownerId,
                    itemId: orderItem.itemId,
                    quantity: tradeQuantity,
                    unitPrice: tradePrice,
                }, context);

                const reservedCost = calculateMarketTradeTotalCost(tradeQuantity, unitPrice) ?? match.totalCost;

                const refund = Math.max(0, reservedCost - match.totalCost);
                if (refund > 0) {
                    this.deliverMarketCurrencyToPlayer(playerId, refund, context);
                }
                sellOrder.remainingQuantity -= tradeQuantity;
                sellOrder.updatedAt = Date.now();
                this.markOrderDirty(sellOrder.id, context);
                this.touchAffectedPlayer(result, sellOrder.ownerId);
                this.pushNotice(result, playerId, `你买入了 ${getItemDisplayName(orderItem)} x${tradeQuantity}，成交价 ${this.formatUnitPrice(tradePrice)}。`, 'loot');
                this.pushNotice(result, sellOrder.ownerId, `你的挂售已成交：${getItemDisplayName(orderItem)} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${match.totalCost}。`, 'loot');
                if (sellOrder.remainingQuantity <= 0) {
                    sellOrder.status = 'filled';
                    this.deleteOrder(sellOrder.id, context);
                }
            }
            if (remaining > 0) {

                const now = Date.now();

                const order = {
                    version: 1,
                    id: randomUUID(),
                    ownerId: playerId,
                    side: 'buy',
                    status: 'open',
                    itemKey,
                    item: orderItem,
                    remainingQuantity: remaining,
                    unitPrice,
                    createdAt: now,
                    updatedAt: now,
                };
                this.openOrders.push(order);
                this.markOrderDirty(order.id, context);
                this.pushNotice(result, playerId, `已挂出求购 ${getItemDisplayName(orderItem)} x${remaining}，单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}。`, 'success');
            }
            this.compactOpenOrders();
            const durableCommitted = await this.commitDurableMarketMutationIfAvailable(context, playerId, 'market_create_buy_order', {
                operationId: payload?.operationId,
                itemId: orderItem.itemId,
                itemKey,
                quantity,
                unitPrice,
                remainingQuantity: remaining,
            });
            if (this.durableOperationService?.isEnabled?.() && !durableCommitted) {
                throw new Error('market_create_buy_order_durable_commit_failed');
            }
                    return result;
                },
            );
        });
    }
    /** 立即按当前市场挂单买入指定物品。 */
    async buyNow(playerId, payload) {
        await this.ensureStorageHydrated(playerId);
        return this.runExclusiveMarketMutation(playerId, async (context) => {
            const quantity = this.normalizeQuantity(payload.quantity);
            if (!quantity) {
                return this.singleMessage(playerId, '买入数量无效。');
            }

            const itemKey = this.resolveInternalMarketItemKey(payload.itemKey);
            if (this.buildAuctionListedItems().some((entry) => entry.orderItemKey === itemKey && this.getSortedAuctionBids(entry.itemKey).some((bid) => bid.reservedCost > 0))) {
                return this.singleMessage(playerId, '该物品已有拍卖出价，请从拍卖行一口价或等待结算。');
            }
            const sells = this.getSortedOrders(itemKey, 'sell').filter((order) => order.ownerId !== playerId
                && !this.isSpecialListingOrder(order)
                && this.canTradeItemOnMarket(order.item)
                && !this.isOrdinaryMarketEnhancementLevelRestricted(order.item));
            if (sells.length === 0) {
                return this.singleMessage(playerId, '当前没有可买入的挂售。');
            }

            const plan = this.planOrderMatches(sells, quantity, Number.POSITIVE_INFINITY);
            if (plan.fulfilledQuantity < quantity) {
                return this.singleMessage(playerId, `当前最多只能买到 ${plan.fulfilledQuantity} 件。`);
            }

            const totalCost = plan.totalCost;
            return this.runExclusivePlayerAssetMutation(
                [playerId, ...plan.matches.map((match) => match.order.ownerId)],
                async () => {
                    if (!this.canAffordMarketCurrency(playerId, totalCost)) {
                        return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法完成买入。`);
                    }

                    this.captureOnlinePlayerState(playerId, context);
                    if (!this.consumeMarketCurrencyFromInventory(playerId, totalCost)) {
                        return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法完成买入。`);
                    }

            const result = this.createEmptyResult(playerId);
            const item = { ...sells[0].item };
            for (const match of plan.matches) {
                const sellOrder = match.order;
                const tradeQuantity = match.quantity;
                this.deliverItemToPlayer(playerId, { ...item, count: tradeQuantity }, context);
                this.deliverMarketCurrencyToPlayer(sellOrder.ownerId, match.totalCost, context);
                this.recordTrade({
                    source: 'market',
                    buyerId: playerId,
                    sellerId: sellOrder.ownerId,
                    itemId: item.itemId,
                    quantity: tradeQuantity,
                    unitPrice: sellOrder.unitPrice,
                }, context);
                sellOrder.remainingQuantity -= tradeQuantity;
                sellOrder.updatedAt = Date.now();
                this.markOrderDirty(sellOrder.id, context);
                this.touchAffectedPlayer(result, sellOrder.ownerId);
                this.pushNotice(result, sellOrder.ownerId, `你的挂售已成交：${getItemDisplayName(item)} x${tradeQuantity}。`, 'loot');
                if (sellOrder.remainingQuantity <= 0) {
                    sellOrder.status = 'filled';
                    this.deleteOrder(sellOrder.id, context);
                }
            }
            this.pushNotice(result, playerId, `你买入了 ${getItemDisplayName(item)} x${quantity}，共花费 ${this.getCurrencyItemName()} x${totalCost}。`, 'loot');
            this.compactOpenOrders();
            const durableCommitted = await this.commitDurableMarketMutationIfAvailable(context, playerId, 'market_buy_now', {
                operationId: payload?.operationId ?? payload?.requestId,
                itemKey,
                itemId: item.itemId,
                quantity,
                totalCost,
            });
            if (this.durableOperationService?.isEnabled?.() && !durableCommitted) {
                throw new Error('market_buy_now_durable_commit_failed');
            }
                    return result;
                },
            );
        });
    }
    /** 立即按当前市场挂单卖出指定物品。 */
    async sellNow(playerId, payload) {
        await this.ensureStorageHydrated(playerId);
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const itemInstanceId = this.resolveMarketInventoryItemInstanceId(playerId, payload, 'sellNow');
            const item = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId);
            if (!item) {
                return this.singleMessage(playerId, '要出售的物品不存在。');
            }

            const quantity = this.normalizeQuantity(payload.quantity);
            if (!quantity) {
                return this.singleMessage(playerId, '出售数量无效。');
            }
            if (item.count < quantity) {
                return this.singleMessage(playerId, '出售数量超过了当前持有数量。');
            }
            if (!this.canTradeItemOnMarket(item)) {
                return this.buildItemNotTradableResult(playerId);
            }
            if (this.isOrdinaryMarketEnhancementLevelRestricted(item)) {
                return this.singleMessage(playerId, `+${MARKET_MAX_ENHANCE_LEVEL + 1} 以上装备不能出售给普通求购盘，请走拍卖行寄拍。`);
            }

            const orderItem = this.toOrderItem(item);

            const buys = this.getSortedOrders(this.buildItemKey(orderItem), 'buy').filter((order) => order.ownerId !== playerId
                && !this.isSpecialListingOrder(order)
                && this.canTradeItemOnMarket(order.item)
                && !this.isOrdinaryMarketEnhancementLevelRestricted(order.item));
            if (buys.length === 0) {
                return this.singleMessage(playerId, '当前没有可直接成交的求购。');
            }

            const plan = this.planOrderMatches(buys, quantity, Number.POSITIVE_INFINITY);
            if (plan.fulfilledQuantity < quantity) {
                return this.singleMessage(playerId, `当前求购盘最多只能接下 ${plan.fulfilledQuantity} 件。`);
            }
            return this.runExclusivePlayerAssetMutation(
                [playerId, ...plan.matches.map((match) => match.order.ownerId)],
                async () => {
                    const currentItem = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId);
                    if (!currentItem || Number(currentItem.count ?? 0) < quantity) {
                        return this.singleMessage(playerId, '出售物品已发生变化，请重新操作。');
                    }

            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.splitInventoryItemByInstanceId(playerId, itemInstanceId, quantity);

            const result = this.createEmptyResult(playerId);

            const totalIncome = plan.totalCost;
            for (const match of plan.matches) {
                const buyOrder = match.order;
                const tradeQuantity = match.quantity;
                this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverMarketCurrencyToPlayer(playerId, match.totalCost, context);
                this.recordTrade({
                    source: 'market',
                    buyerId: buyOrder.ownerId,
                    sellerId: playerId,
                    itemId: orderItem.itemId,
                    quantity: tradeQuantity,
                    unitPrice: buyOrder.unitPrice,
                }, context);
                buyOrder.remainingQuantity -= tradeQuantity;
                buyOrder.updatedAt = Date.now();
                this.markOrderDirty(buyOrder.id, context);
                this.touchAffectedPlayer(result, buyOrder.ownerId);
                this.pushNotice(result, buyOrder.ownerId, `你的求购已成交：${getItemDisplayName(orderItem)} x${tradeQuantity}。`, 'loot');
                if (buyOrder.remainingQuantity <= 0) {
                    buyOrder.status = 'filled';
                    this.deleteOrder(buyOrder.id, context);
                }
            }
            this.pushNotice(result, playerId, `你卖出了 ${getItemDisplayName(orderItem)} x${quantity}，共入账 ${this.getCurrencyItemName()} x${totalIncome}。`, 'loot');
            this.compactOpenOrders();
            const durableCommitted = await this.commitDurableMarketMutationIfAvailable(context, playerId, 'market_sell_now', {
                operationId: payload?.operationId ?? payload?.requestId,
                itemId: orderItem.itemId,
                itemInstanceId,
                quantity,
                totalIncome,
            });
            if (this.durableOperationService?.isEnabled?.() && !durableCommitted) {
                throw new Error('market_sell_now_durable_commit_failed');
            }
                    return result;
                },
            );
        });
    }
    /** 取消玩家自己的挂单。 */
    async cancelOrder(playerId, payload) {
        await this.ensureStorageHydrated(playerId);
        const requestedOrderId = String(payload.orderId ?? '').trim();
        const requestedOrder = this.openOrders.find((entry) => entry.id === requestedOrderId && entry.ownerId === playerId);
        if (requestedOrder?.side === 'sell' && this.isAuctionOrder(requestedOrder) && this.getSortedAuctionBids(this.buildAuctionLotKey(requestedOrder)).some((bid) => bid.reservedCost > 0)) {
            return this.singleMessage(playerId, '这件寄拍已有出价，不能直接撤回。');
        }
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const orderId = requestedOrderId;

            const order = this.openOrders.find((entry) => entry.id === orderId && entry.ownerId === playerId);
            if (!order) {
                return this.singleMessage(playerId, '未找到可取消的订单。');
            }
            return this.runExclusivePlayerAssetMutation([playerId], async () => {
            if (order.side === 'sell') {
                this.deliverItemToPlayer(playerId, { ...order.item, count: order.remainingQuantity }, context);
            }
            else {

                const refund = calculateMarketOrderReservedCost(order.remainingQuantity, order.unitPrice);
                if (refund) {
                    this.deliverMarketCurrencyToPlayer(playerId, refund, context);
                }
            }
            order.status = 'cancelled';
            order.remainingQuantity = 0;
            order.updatedAt = Date.now();
            this.deleteOrder(order.id, context, order);
            this.compactOpenOrders();
            const durableCommitted = await this.commitDurableMarketMutationIfAvailable(context, playerId, 'market_cancel_order', {
                operationId: payload?.operationId ?? payload?.requestId,
                orderId,
                side: order.side,
            });
            if (this.durableOperationService?.isEnabled?.() && !durableCommitted) {
                throw new Error('market_cancel_order_durable_commit_failed');
            }
                return this.singleMessage(playerId, '订单已取消，剩余托管物已退回。', 'success');
            });
        });
    }
    /** GM 封禁联动：取消目标玩家全部开放求购/挂售/寄拍订单，并返还仍冻结的资产。 */
    async cancelOpenOrdersForBannedPlayer(playerId, options = {}) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId) {
            return { affectedPlayerIds: [], notices: [], cancelledOrderIds: [], banCommitted: false };
        }
        const mutationOptions = (options && typeof options === 'object' ? options : {}) as {
            operationId?: unknown;
            banUser?: unknown;
        };
        const banUser = mutationOptions.banUser ?? null;
        const operationId = typeof mutationOptions.operationId === 'string' && mutationOptions.operationId.trim()
            ? mutationOptions.operationId.trim()
            : undefined;
        const result = await this.runExclusiveMarketMutation(normalizedPlayerId, async (context) => {
            const targetOrders = this.openOrders.filter((order) => order?.ownerId === normalizedPlayerId
                && order.status === 'open'
                && order.remainingQuantity > 0);
            const affectedPlayerIds = new Set([normalizedPlayerId]);
            for (const order of targetOrders) {
                if (order.side !== 'sell' || !this.isAuctionOrder(order)) {
                    continue;
                }
                for (const bid of this.getSortedAuctionBids(this.buildAuctionLotKey(order))) {
                    if (bid.reservedCost > 0) {
                        affectedPlayerIds.add(bid.bidderId);
                    }
                }
            }
            return this.runExclusivePlayerAssetMutation(Array.from(affectedPlayerIds), async () => {
            if (targetOrders.length === 0) {
                const banCommitted = banUser
                    ? await this.commitDurableMarketMutationIfAvailable(context, normalizedPlayerId, 'market_ban_cancel_orders', {
                        operationId,
                        cancelledOrderIds: [],
                    }, { requirePresenceFence: false, banUser })
                    : false;
                if (!banCommitted) {
                    context.skipPersistence = true;
                }
                return { affectedPlayerIds: [], notices: [], cancelledOrderIds: [], banCommitted };
            }
            await this.ensureStoragesHydrated(affectedPlayerIds);
            const mutationResult = {
                affectedPlayerIds: [],
                notices: [],
                cancelledOrderIds: [],
            };
            const now = Date.now();
            for (const order of targetOrders) {
                if (order.status !== 'open' || order.remainingQuantity <= 0 || order.ownerId !== normalizedPlayerId) {
                    continue;
                }
                if (order.side === 'sell') {
                    if (this.isAuctionOrder(order)) {
                        const lotKey = this.buildAuctionLotKey(order);
                        this.refundAuctionBidReserves(lotKey, context, mutationResult, '拍卖行拍品已被撤下，冻结灵石已退回。');
                        this.clearAuctionStateForItemKey(lotKey, context);
                    }
                    this.deliverItemToPlayer(normalizedPlayerId, { ...order.item, count: order.remainingQuantity }, context);
                }
                else {
                    const refund = calculateMarketOrderReservedCost(order.remainingQuantity, order.unitPrice);
                    if (refund) {
                        this.deliverMarketCurrencyToPlayer(normalizedPlayerId, refund, context);
                    }
                }
                order.status = 'cancelled';
                order.remainingQuantity = 0;
                order.updatedAt = now;
                this.deleteOrder(order.id, context, order);
                mutationResult.cancelledOrderIds.push(order.id);
                this.touchAffectedPlayer(mutationResult, normalizedPlayerId);
            }
            this.compactOpenOrders();
            const banCommitted = await this.commitDurableMarketMutationIfAvailable(context, normalizedPlayerId, 'market_ban_cancel_orders', {
                operationId,
                cancelledOrderIds: mutationResult.cancelledOrderIds,
            }, { requirePresenceFence: false, banUser });
            if (banUser && this.durableOperationService?.isEnabled?.() && !banCommitted) {
                throw new Error('banned_player_market_ban_commit_failed');
            }
            return { ...mutationResult, banCommitted: Boolean(banUser && banCommitted) };
            });
        }, { requirePrimaryPresenceFence: false });
        const stillOpen = this.openOrders.some((order) => order?.ownerId === normalizedPlayerId
            && order.status === 'open'
            && order.remainingQuantity > 0);
        if (stillOpen) {
            throw new Error('banned_player_market_cancel_incomplete');
        }
        if (banUser && this.durableOperationService?.isEnabled?.() && !result?.banCommitted) {
            throw new Error('banned_player_market_ban_commit_failed');
        }
        return result;
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
    /** 把仓库物品领取回背包，或在背包满时保留在仓库。 */
        async claimStorage(playerId) {
        return claimStorageImpl(this, playerId);
    }
    /**
 * buildListedItems：构建并返回目标对象。
 * @returns 无返回值，直接更新Listed道具相关状态。
 */

        buildListedItems() {
        return buildListedItemsImpl(this);
    }
    /**
 * buildMarketListingEntries：构建并返回目标对象。
 * @returns 无返回值，直接更新坊市Listing条目相关状态。
 */

        buildMarketListingEntries() {
        return buildMarketListingEntriesImpl(this);
    }
    /** 只列出显式拍卖订单，普通坊市挂售不进入拍卖行。 */
        buildAuctionListedItems() {
        return buildAuctionListedItemsImpl(this);
    }
    /** 构造可参与拍卖的拍品摘要，拍卖行分页会在服务端继续裁剪。 */
        buildAuctionParticipateLotEntries(viewerId = '') {
        return buildAuctionParticipateLotEntriesImpl(this, viewerId);
    }
    /** 构造我的寄拍拍品摘要。 */
        buildAuctionMineLotEntries(playerId) {
        return buildAuctionMineLotEntriesImpl(this, playerId);
    }
    /** 提交拍卖行加价，只写拍卖出价态，不进入坊市买单撮合。 */
        async placeAuctionBid(playerId, payload) {
        return placeAuctionBidImpl(this, playerId, payload);
    }
    /** 拍卖行一口价入口，避免客户端误走坊市买入事件。 */
        async buyoutAuctionLot(playerId, payload) {
        return buyoutAuctionLotImpl(this, playerId, payload);
    }
    /** 读取拍卖出价记录，按当前观看者做轻量匿名标签。 */
        getAuctionBidViews(itemKey, _viewerId = '') {
        return getAuctionBidViewsImpl(this, itemKey, _viewerId);
    }
    /** 读取拍卖出价内部排序，最高价排在最前。 */
        getSortedAuctionBids(itemKey) {
        return getSortedAuctionBidsImpl(this, itemKey);
    }
    /** 判断订单是否属于显式拍卖寄拍。 */
        isAuctionOrder(order) {
        return isAuctionOrderImpl(this, order);
    }
    /** 判断订单是否属于传法台一口价寄售（自创功法残卷专用子市场，一物一单）。 */
        isTransmissionOrder(order) {
        return isTransmissionOrderImpl(this, order);
    }
    /** 传法台与拍卖行都是一物一单的专有挂单，不参与普通坊市 order-book 撮合与目录。 */
        isSpecialListingOrder(order) {
        return isSpecialListingOrderImpl(this, order);
    }
    /** 单笔传法台寄售的权威拍品 key，避免同 itemId 的不同功法残卷合并成一个盘口。 */
        buildTransmissionLotKey(order) {
        return buildTransmissionLotKeyImpl(this, order);
    }
    /** 把传法台内部订单 key 压成客户端可传输的短 key。 */
        buildClientTransmissionLotKey(itemKey) {
        return buildClientTransmissionLotKeyImpl(this, itemKey);
    }
    /** 把客户端传法台 key 还原成单个寄售订单 key。 */
        resolveTransmissionLotKey(itemKey) {
        return resolveTransmissionLotKeyImpl(this, itemKey);
    }
    /** 登记传法台寄售的 clientKey → lotKey 映射。 */
        registerTransmissionLot(order) {
        return registerTransmissionLotImpl(this, order);
    }
    /** 重启后从持久化订单重建传法台内存索引。 */
        hydrateTransmissionStateFromOpenOrders() {
        return hydrateTransmissionStateFromOpenOrdersImpl(this);
    }
    /** 读取指定传法台寄售单，key 已是内部 lotKey。 */
        getTransmissionSellOrder(itemKey) {
        return getTransmissionSellOrderImpl(this, itemKey);
    }
    /** 传法台在架寄售单，一单一卷。 */
        buildTransmissionListedItems() {
        return buildTransmissionListedItemsImpl(this);
    }
    /** 传法台拍品摘要投影；一口价、无竞价、无倒计时。 */
        buildTransmissionLotEntries(ownerId = '') {
        return buildTransmissionLotEntriesImpl(this, ownerId);
    }
    /** 从只读功法模板投影传法台列表所需的最小元数据。 */
        resolveTransmissionTechniqueSummary(item) {
        return resolveTransmissionTechniqueSummaryImpl(this, item);
    }
    /** 构造传法台分页列表，服务端按 tab、搜索与页码裁剪后只返回当前页。 */
        buildTransmissionListingsPage(playerId, payload) {
        return buildTransmissionListingsPageImpl(this, playerId, payload);
    }
    /** 规范化传法台分页筛选与排序。 */
        normalizeTransmissionListingsRequest(payload) {
        return normalizeTransmissionListingsRequestImpl(this, payload);
    }
    /** 传法台只搜索功法名称、功法 ID 与残卷名称。 */
        filterTransmissionLotEntriesByQuery(entries, query) {
        return filterTransmissionLotEntriesByQueryImpl(this, entries, query);
    }
    /** 按当前搜索结果生成分类数量，避免分类按钮显示与搜索结果脱节。 */
        buildTransmissionCategoryCounts(entries) {
        return buildTransmissionCategoryCountsImpl(this, entries);
    }
    /** 服务端先排序再分页，保证跨页顺序稳定。 */
        sortTransmissionLotEntries(entries, sort) {
        return sortTransmissionLotEntriesImpl(this, entries, sort);
    }
    /** 判断某个传法台拍品是否是该玩家自己的寄售。 */
        isMyTransmissionLot(playerId, clientItemKey) {
        return isMyTransmissionLotImpl(this, playerId, clientItemKey);
    }
    /** 传法台一口价求取：一物一单整卷成交，不撮合、不竞价。 */
        async buyTransmissionLot(playerId, payload) {
        return buyTransmissionLotImpl(this, playerId, payload);
    }
    /** 读取指定拍品 key 对应的显式拍卖卖单。 */
        getAuctionSellOrders(itemKey) {
        return getAuctionSellOrdersImpl(this, itemKey);
    }
    /** 是否存在指定物品的显式拍卖卖单。 */
        hasAuctionSellOrders(itemKey) {
        return hasAuctionSellOrdersImpl(this, itemKey);
    }
    /** 启动恢复时从订单 raw_payload 中恢复拍卖状态。 */
        hydrateAuctionStateFromOpenOrders() {
        return hydrateAuctionStateFromOpenOrdersImpl(this);
    }
    /** 初始化新寄拍的拍卖状态，并写回承载订单用于持久化。 */
        initializeAuctionOrderState(order, context, buyoutPrice = null, durationSeconds = null) {
        return initializeAuctionOrderStateImpl(this, order, context, buyoutPrice, durationSeconds);
    }
    /** 规范化订单内拍卖状态。 */
        normalizeAuctionOrderState(raw) {
        return normalizeAuctionOrderStateImpl(this, raw);
    }
    /** 把当前拍卖状态写回同 itemKey 的最早有效卖单，复用市场订单持久化。 */
        persistAuctionStateToCarrier(itemKey, context) {
        return persistAuctionStateToCarrierImpl(this, itemKey, context);
    }
    /** 清理指定拍品的拍卖状态，并同步清掉承载订单字段。 */
        clearAuctionStateForItemKey(itemKey, context) {
        return clearAuctionStateForItemKeyImpl(this, itemKey, context);
    }
    /** 若同一物品仍有寄拍库存，成交后为下一件重新开一个拍卖窗口。 */
        reopenAuctionStateIfActive(itemKey, context) {
        return reopenAuctionStateIfActiveImpl(this, itemKey, context);
    }
    /** 惰性结算已到期拍品：成交有效最高出价，无人出价则自动返还寄拍物。 */
        async settleExpiredAuctionLots() {
        return settleExpiredAuctionLotsImpl(this);
    }
    /** 结算单个到期拍品。 */
        settleExpiredAuctionLot(itemKey, now, context, result) {
        return settleExpiredAuctionLotImpl(this, itemKey, now, context, result);
    }
    /** 退回指定拍品全部仍冻结的拍卖出价。 */
        refundAuctionBidReserves(itemKey, context, result, text) {
        return refundAuctionBidReservesImpl(this, itemKey, context, result, text);
    }
    /** 当前价向上走一档得到拍卖最低加价。 */
        getAuctionMinimumBidPrice(currentPrice) {
        return getAuctionMinimumBidPriceImpl(this, currentPrice);
    }
    /** 把内部买入结算结果改写成拍卖一口价提示。 */
        rewriteAuctionBuyoutNotices(result, playerId) {
        return rewriteAuctionBuyoutNoticesImpl(this, result, playerId);
    }
    /** 规范化拍卖行分页请求，服务端硬限制每页最多 10 条。 */
        normalizeAuctionListingsRequest(payload) {
        return normalizeAuctionListingsRequestImpl(this, payload);
    }
    /** 按拍卖行主分类筛选。 */
        filterAuctionLotEntriesByCategory(entries, category) {
        return filterAuctionLotEntriesByCategoryImpl(this, entries, category);
    }
    /** 按拍卖行搜索关键字筛选。 */
        filterAuctionLotEntriesByQuery(entries, query) {
        return filterAuctionLotEntriesByQueryImpl(this, entries, query);
    }
    /** 构造拍卖行分类计数。 */
        buildAuctionListingCounts(entries) {
        return buildAuctionListingCountsImpl(this, entries);
    }
    /** 构造拍卖行摘要统计。 */
        buildAuctionListingSummary(playerId, participateLots, mineLots) {
        return buildAuctionListingSummaryImpl(this, playerId, participateLots, mineLots);
    }
    /** 拍卖行只需要当前页展示字段，避免把完整物品详情塞进分页包。 */
        toAuctionPreviewItem(item) {
        return toAuctionPreviewItemImpl(this, item);
    }
    /** 规范化玩家自定义拍卖时长，单位为秒。 */
        normalizeAuctionDurationSeconds(value) {
        return normalizeAuctionDurationSecondsImpl(this, value);
    }
    /** 从订单创建时间派生当前拍卖窗口，客户端只按 startAtMs + durationSeconds 本地倒计时。 */
        buildAuctionTiming(itemKey, seed, createdAt) {
        return buildAuctionTimingImpl(this, itemKey, seed, createdAt);
    }
    /** 生成没有延时修正的基础拍卖窗口。 */
        buildAuctionBaseTiming(seed, createdAt, refreshExpiredLegacy = true) {
        return buildAuctionBaseTimingImpl(this, seed, createdAt, refreshExpiredLegacy);
    }
    /** 读取或初始化拍卖结束时间状态；延时时通过 durationSeconds 投影给前端。 */
        getAuctionTimingState(itemKey, startAtMs, normalDurationSeconds, now = Date.now()) {
        return getAuctionTimingStateImpl(this, itemKey, startAtMs, normalDurationSeconds, now);
    }
    /** 把权威结束时间投影成兼容前端的开始时间和持续秒数。 */
        projectAuctionTiming(state) {
        return projectAuctionTimingImpl(this, state);
    }
    /** 最后 30 秒内出价时，把结束时间直接调整到 now + 30 秒，不累加。 */
        extendAuctionIfEndingSoon(itemKey, now = Date.now()) {
        return extendAuctionIfEndingSoonImpl(this, itemKey, now);
    }
    /** 稳定哈希用于拍卖编号和展示窗口。 */
        buildAuctionStableNumber(value) {
        return buildAuctionStableNumberImpl(this, value);
    }
    /**
 * groupMarketListingEntriesForPage：按正式市场列表口径聚合分页条目。
 * @param entries 坊市分页条目。
 * @returns 聚合后的分页组。
 */

        groupMarketListingEntriesForPage(entries) {
        return groupMarketListingEntriesForPageImpl(this, entries);
    }
    /**
 * buildOwnOrders：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Own订单相关状态。
 */

        buildOwnOrders(playerId) {
        return buildOwnOrdersImpl(this, playerId);
    }
    /**
 * buildItemBookView：构建并返回目标对象。
 * @param itemKey 参数说明。
 * @returns 无返回值，直接更新道具Book视图相关状态。
 */

        buildItemBookView(itemKey) {
        return buildItemBookViewImpl(this, itemKey);
    }
    /**
 * buildPriceLevels：构建并返回目标对象。
 * @param itemKey 参数说明。
 * @param side 参数说明。
 * @returns 无返回值，直接更新价格等级相关状态。
 */

        buildPriceLevels(itemKey, side) {
        return buildPriceLevelsImpl(this, itemKey, side);
    }
    /**
 * getSortedOrders：读取Sorted订单。
 * @param itemKey 参数说明。
 * @param side 参数说明。
 * @returns 无返回值，完成Sorted订单的读取/组装。
 */

        getSortedOrders(itemKey, side) {
        return getSortedOrdersImpl(this, itemKey, side);
    }
    /**
 * hasConflictingOpenOrder：判断ConflictingOpen订单是否满足条件。
 * @param ownerId owner ID。
 * @param itemKey 参数说明。
 * @param nextSide 参数说明。
 * @returns 无返回值，完成ConflictingOpen订单的条件判断。
 */

        hasConflictingOpenOrder(ownerId, itemKey, nextSide) {
        return hasConflictingOpenOrderImpl(this, ownerId, itemKey, nextSide);
    }
    /** 判断玩家是否已有指定方向的同物品普通坊市挂单。 */
        hasOpenOrder(ownerId, itemKey, side) {
        return hasOpenOrderImpl(this, ownerId, itemKey, side);
    }
    /**
 * planOrderMatches：执行plan订单Matche相关逻辑。
 * @param orders 参数说明。
 * @param quantity 参数说明。
 * @param takerUnitPrice 参数说明。
 * @returns 无返回值，直接更新plan订单Matche相关状态。
 */

        planOrderMatches(orders, quantity, takerUnitPrice) {
        return planOrderMatchesImpl(this, orders, quantity, takerUnitPrice);
    }
    /**
 * getCompatibleTradeQuantity：读取CompatibleTradeQuantity。
 * @param maxQuantity 参数说明。
 * @param order 当前作为 maker 的开放订单。
 * @param takerUnitPrice 本次主动挂单价格；即时交易传入 Infinity。
 * @returns 无返回值，完成CompatibleTradeQuantity的读取/组装。
 */

        getCompatibleTradeQuantity(maxQuantity, order, takerUnitPrice) {
        return getCompatibleTradeQuantityImpl(this, maxQuantity, order, takerUnitPrice);
    }
    /**
 * leastCommonMultiple：执行leastCommonMultiple相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新leastCommonMultiple相关状态。
 */

        leastCommonMultiple(left, right) {
        return leastCommonMultipleImpl(this, left, right);
    }
    /**
 * greatestCommonDivisor：判断greatestCommonDivisor是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新greatestCommonDivisor相关状态。
 */

        greatestCommonDivisor(left, right) {
        return greatestCommonDivisorImpl(this, left, right);
    }
    /**
 * buildItemKey：构建并返回目标对象。
 * @param item 道具。
 * @returns 无返回值，直接更新道具Key相关状态。
 */

        buildItemKey(item) {
        return buildItemKeyImpl(this, item);
    }
    /**
 * getOrderItemKey：用当前规则重新计算订单盘口 key，兼容旧导入订单中的历史签名。
 * @param order 坊市订单。
 * @returns 订单当前盘口 key。
 */

        getOrderItemKey(order) {
        return getOrderItemKeyImpl(this, order);
    }
    /** 单个拍卖寄拍订单的权威拍品 key，避免同种物品多笔寄拍互相合并。 */
        buildAuctionLotKey(order) {
        return buildAuctionLotKeyImpl(this, order);
    }
    /**
 * buildClientMarketKey：把内部长签名压成客户端可传输的短 key。
 * @param itemKey 内部长签名。
 * @returns 无返回值，直接更新客户端坊市 key 相关状态。
 */

        buildClientMarketKey(itemKey) {
        return buildClientMarketKeyImpl(this, itemKey);
    }
    /** 把拍卖内部订单 key 压成客户端拍品 key。 */
        buildClientAuctionLotKey(itemKey) {
        return buildClientAuctionLotKeyImpl(this, itemKey);
    }
    /**
 * resolveInternalMarketItemKey：把客户端短 key 还原成内部完整签名。
 * @param itemKey 客户端或内部 key。
 * @returns 无返回值，直接更新内部坊市 key 相关状态。
 */

    resolveInternalMarketItemKey(itemKey) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedItemKey = typeof itemKey === 'string' ? itemKey.trim() : '';
        if (!normalizedItemKey) {
            return '';
        }
        if (normalizedItemKey.startsWith('{')) {
            try {
                const parsed = JSON.parse(normalizedItemKey);
                if (parsed?.itemId) {
                    return this.buildItemKey(this.toFullItem({
                        ...parsed,
                        count: 1,
                    }));
                }
            }
            catch {
                return normalizedItemKey;
            }
            return normalizedItemKey;
        }
        const listed = this.buildListedItems().find((entry) => this.buildClientMarketKey(entry.itemKey) === normalizedItemKey);
        return listed?.itemKey ?? normalizedItemKey;
    }
    /** 把客户端拍品 key 还原成单个拍卖订单 key。 */
        resolveAuctionLotKey(itemKey) {
        return resolveAuctionLotKeyImpl(this, itemKey);
    }
    /**
 * buildMarketListingSubType：按大类提炼列表所需的二级分类。
 * @param item 道具。
 * @returns 无返回值，直接更新坊市条目子类型相关状态。
 */

        buildMarketListingSubType(item) {
        return buildMarketListingSubTypeImpl(this, item);
    }
    /**
 * resolveMarketItemForBuy：规范化或转换坊市道具ForBuy。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新坊市道具ForBuy相关状态。
 */

        resolveMarketItemForBuy(payload) {
        return resolveMarketItemForBuyImpl(this, payload);
    }
    /**
 * resolveStructuredMarketItemKey：从客户端结构化 itemKey 还原求购物品。
 * @param itemKey 客户端传入的 itemKey。
 * @returns 可求购的物品，无法还原时返回 null。
 */

    resolveStructuredMarketItemKey(itemKey) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedItemKey = typeof itemKey === 'string' ? itemKey.trim() : '';
        if (!normalizedItemKey.startsWith('{')) {
            return null;
        }
        try {
            const parsed = JSON.parse(normalizedItemKey);
            const itemId = typeof parsed?.itemId === 'string' ? parsed.itemId.trim() : '';
            if (!itemId) {
                return null;
            }
            const baseItem = this.contentTemplateRepository.createItem(itemId, 1);
            if (!baseItem) {
                return null;
            }
            const mergedItem = {
                ...baseItem,
                itemId,
                count: 1,
            };
            if (Number.isFinite(Number(parsed.enhanceLevel))) {
                mergedItem.enhanceLevel = Math.max(0, Math.trunc(Number(parsed.enhanceLevel)));
            }
            return this.toFullItem(mergedItem);
        }
        catch {
            return null;
        }
    }
    /** 从客户端本地补齐行的完整堆叠签名或历史两段签名还原求购物品。 */
        resolveStackSignatureMarketItemKey(itemKey) {
        return resolveStackSignatureMarketItemKeyImpl(this, itemKey);
    }
    /**
 * toOrderItem：执行to订单道具相关逻辑。
 * @param item 道具。
 * @returns 无返回值，直接更新to订单道具相关状态。
 */

        toOrderItem(item) {
        return toOrderItemImpl(this, item);
    }
    /** 一物一单的拍卖/传法台托管保留原 itemInstanceId，成交、撤单与流拍均交付同一实例。 */
        toEscrowOrderItem(item) {
        return toEscrowOrderItemImpl(this, item);
    }
    /**
 * createCurrencyItem：构建并返回目标对象。
 * @param count 数量。
 * @returns 无返回值，直接更新Currency道具相关状态。
 */

        createCurrencyItem(count) {
        return createCurrencyItemImpl(this, count);
    }
    /**
 * canAffordMarketCurrency：判断背包灵石是否足够坊市结算。
 * @param playerId 玩家 ID。
 * @param amount 数量。
 * @returns 是否足够支付。
 */

        canAffordMarketCurrency(playerId, amount) {
        return canAffordMarketCurrencyImpl(this, playerId, amount);
    }
    /**
 * consumeMarketCurrencyFromInventory：从背包扣除坊市结算灵石。
 * @param playerId 玩家 ID。
 * @param amount 数量。
 * @returns 是否扣除成功。
 */

        consumeMarketCurrencyFromInventory(playerId, amount) {
        return consumeMarketCurrencyFromInventoryImpl(this, playerId, amount);
    }
    /**
 * deliverMarketCurrencyToPlayer：按背包物品语义发放坊市灵石。
 * @param playerId 玩家 ID。
 * @param amount 数量。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新玩家或托管仓。
 */

        deliverMarketCurrencyToPlayer(playerId, amount, context) {
        return deliverMarketCurrencyToPlayerImpl(this, playerId, amount, context);
    }
    /**
     * 被超价时退回的冻结灵石属于玩家自有资产结算：只要仍有有效运行时围栏，就强制回到背包，
     * 不因容量已满转入托管仓。玩家已完全脱离运行时则保留托管仓兜底，避免用旧快照覆盖背包真源。
     */
        refundOutbidAuctionReserveToPlayer(playerId, amount, context) {
        return refundOutbidAuctionReserveToPlayerImpl(this, playerId, amount, context);
    }
    /**
 * toFullItem：执行toFull道具相关逻辑。
 * @param item 道具。
 * @returns 无返回值，直接更新toFull道具相关状态。
 */

        toFullItem(item) {
        return toFullItemImpl(this, item);
    }
    /**
 * canTradeItemOnMarket：判断Trade道具On坊市是否满足条件。
 * @param item 道具。
 * @returns 无返回值，完成Trade道具On坊市的条件判断。
 */

        canTradeItemOnMarket(item) {
        return canTradeItemOnMarketImpl(this, item);
    }
    /** 构造物品禁止进入坊市时的统一结构化提示。 */
        buildItemNotTradableResult(playerId) {
        return buildItemNotTradableResultImpl(this, playerId);
    }
    /**
     * 普通坊市（order-book）是否接受该物品。
     * 自创功法残卷共用同一个 itemId，盘口 key 只按 itemId 聚合，撮合必然串台；
     * 且求购单的物品由模板重建，天然不含 learnTechniqueId，成交即交付空书。
     * 因此残卷只允许走传法台（一口价）与拍卖行（竞价），这两条都是一物一单、携带实例 payload。
     */
        isOrderBookTradableItem(item) {
        return isOrderBookTradableItemImpl(this, item);
    }
    /** 普通坊市强化等级上限；拍卖行寄拍允许更高强化。 */
        isOrdinaryMarketEnhancementLevelRestricted(item) {
        return isOrdinaryMarketEnhancementLevelRestrictedImpl(this, item);
    }
    /**
 * normalizeQuantity：规范化或转换Quantity。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Quantity相关状态。
 */

        normalizeQuantity(value) {
        return normalizeQuantityImpl(this, value);
    }
    /** 天道商店一次购买份数，固定商品不允许超大批量压垮背包和持久化。 */
        normalizeHeavenlyDaoShopQuantity(value) {
        return normalizeHeavenlyDaoShopQuantityImpl(this, value);
    }
        async resolveHeavenlyDaoShopDiscountPercent(playerId) {
        return resolveHeavenlyDaoShopDiscountPercentImpl(this, playerId);
    }
        resolveCachedHeavenlyDaoShopDiscountPercent(playerId) {
        return resolveCachedHeavenlyDaoShopDiscountPercentImpl(this, playerId);
    }
    /**
 * normalizeUnitPrice：规范化或转换Unit价格。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Unit价格相关状态。
 */

        normalizeUnitPrice(value) {
        return normalizeUnitPriceImpl(this, value);
    }
    /** 规范化拍卖一口价：0、无效值或低于起拍价都表示不支持一口价。 */
        normalizeAuctionBuyoutPrice(value, startPrice) {
        return normalizeAuctionBuyoutPriceImpl(this, value, startPrice);
    }
    /** 读取订单持久化的一口价，兼容旧拍卖订单没有一口价字段的情况。 */
        getAuctionOrderBuyoutPrice(order, startPrice) {
        return getAuctionOrderBuyoutPriceImpl(this, order, startPrice);
    }
    /** 拍卖上架费：10 + 起拍总价 1%，向上取整。 */
        calculateAuctionListingFee(startPrice) {
        return calculateAuctionListingFeeImpl(this, startPrice);
    }
    /**
 * buildTradeQuantityError：构建并返回目标对象。
 * @param unitPrice 参数说明。
 * @returns 无返回值，直接更新TradeQuantityError相关状态。
 */

        buildTradeQuantityError(unitPrice) {
        return buildTradeQuantityErrorImpl(this, unitPrice);
    }
    /**
 * formatUnitPrice：规范化或转换Unit价格。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Unit价格相关状态。
 */

        formatUnitPrice(value) {
        return formatUnitPriceImpl(this, value);
    }
    /** 天道商店专属货币展示名。 */
        getHeavenlyDaoShopCurrencyName() {
        return getHeavenlyDaoShopCurrencyNameImpl(this);
    }
    /** 生成市场内商品提示标签。 */
        formatMarketItemStackLabel(item) {
        return formatMarketItemStackLabelImpl(this, item);
    }
    /**
 * deliverItemToPlayer：执行deliver道具To玩家相关逻辑。
 * @param playerId 玩家 ID。
 * @param item 道具。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新deliver道具To玩家相关状态。
 */

        deliverItemToPlayer(playerId, item, context) {
        return deliverItemToPlayerImpl(this, playerId, item, context);
    }
    /** runtime ownership 与网络在线态解耦；离线挂机 owner 不能让市场误投递到随身背包。 */
        isPlayerNetworkOnline(playerId) {
        return isPlayerNetworkOnlineImpl(this, playerId);
    }
    /**
 * hasActiveProjectionFence：判断玩家当前是否拥有可用于分域投影的 session fence。
 * @param playerId 玩家 ID。
 * @returns 有 runtimeOwnerId 与 sessionEpoch 时返回 true。
 */

        hasActiveProjectionFence(playerId) {
        return hasActiveProjectionFenceImpl(this, playerId);
    }
    /**
 * mergeStorageItem：处理Storage道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param item 道具。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新Storage道具相关状态。
 */

        mergeStorageItem(playerId, item, context) {
        return mergeStorageItemImpl(this, playerId, item, context);
    }
    /**
 * setStorage：写入Storage。
 * @param playerId 玩家 ID。
 * @param storage 参数说明。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新Storage相关状态。
 */

        setStorage(playerId, storage, context) {
        return setStorageImpl(this, playerId, storage, context);
    }
    /**
 * recordTrade：执行recordTrade相关逻辑。
 * @param payload 载荷参数。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新recordTrade相关状态。
 */

        recordTrade(payload, context) {
        return recordTradeImpl(this, payload, context);
    }
    /**
 * toTradeHistoryView：判断toTrade历史视图是否满足条件。
 * @param playerId 玩家 ID。
 * @param record 参数说明。
 * @returns 无返回值，直接更新toTradeHistory视图相关状态。
 */

        toTradeHistoryView(playerId, record, identitiesByPlayerId = new Map()) {
        return toTradeHistoryViewImpl(this, playerId, record, identitiesByPlayerId);
    }
        async loadTradeHistoryIdentityMap(records) {
        return loadTradeHistoryIdentityMapImpl(this, records);
    }
        normalizePlayerLabelText(value, rejectedPlayerId = '') {
        return normalizePlayerLabelTextImpl(this, value, rejectedPlayerId);
    }
        resolveIdentityPlayerLabel(identity) {
        return resolveIdentityPlayerLabelImpl(this, identity);
    }
        resolveOnlineMarketPlayerLabel(playerId) {
        return resolveOnlineMarketPlayerLabelImpl(this, playerId);
    }
    /** 规范化成交来源，兼容旧历史记录缺少 source 的情况。 */
        normalizeTradeSource(source) {
        return normalizeTradeSourceImpl(this, source);
    }
        normalizeTradeHistoryScope(source, scope) {
        return normalizeTradeHistoryScopeImpl(this, source, scope);
    }
    /** 读取全服最近成交历史；有数据库真源时按需查询，避免全表历史常驻内存。 */
        async loadGlobalTradeHistory(source, limit) {
        return loadGlobalTradeHistoryImpl(this, source, limit);
    }
    /** 读取玩家可见成交历史；有数据库真源时按需查询，避免全表历史常驻内存。 */
        async loadVisibleTradeHistory(playerId, source, limit = MARKET_TRADE_HISTORY_VISIBLE_LIMIT) {
        return loadVisibleTradeHistoryImpl(this, playerId, source, limit);
    }
    /**
 * createEmptyResult：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Empty结果相关状态。
 */

        createEmptyResult(playerId) {
        return createEmptyResultImpl(this, playerId);
    }
    /**
 * singleMessage：执行singleMessage相关逻辑。
 * @param playerId 玩家 ID。
 * @param text 参数说明。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新singleMessage相关状态。
 */

        singleMessage(playerId, text, kind = 'info') {
        return singleMessageImpl(this, playerId, text, kind);
    }
    /** 构造单条结构化坊市提示，fallback text 仅用于旧客户端和日志。 */
        singleStructuredMessage(playerId, kind, key, text, opts = undefined) {
        return singleStructuredMessageImpl(this, playerId, kind, key, text, opts);
    }
    /**
 * touchAffectedPlayer：执行touchAffected玩家相关逻辑。
 * @param result 返回结果。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新touchAffected玩家相关状态。
 */

        touchAffectedPlayer(result, playerId) {
        return touchAffectedPlayerImpl(this, result, playerId);
    }
    /**
 * pushNotice：处理Notice并更新相关状态。
 * @param result 返回结果。
 * @param playerId 玩家 ID。
 * @param text 参数说明。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新Notice相关状态。
 */

        pushNotice(result, playerId, text, kind = 'info') {
        return pushNoticeImpl(this, result, playerId, text, kind);
    }
    /** 推送市场结构化通知，text 只作为旧客户端兜底。 */
        pushStructuredNotice(result, playerId, kind, key, text, opts) {
        return pushStructuredNoticeImpl(this, result, playerId, kind, key, text, opts);
    }
    /**
 * markOrderDirty：处理订单Dirty并更新相关状态。
 * @param orderId order ID。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新订单Dirty相关状态。
 */

        markOrderDirty(orderId, context, order = null) {
        return markOrderDirtyImpl(this, orderId, context, order);
    }
    /**
 * deleteOrder：处理订单并更新相关状态。
 * @param orderId order ID。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新订单相关状态。
 */

        deleteOrder(orderId, context, order = null) {
        return deleteOrderImpl(this, orderId, context, order);
    }
    /**
 * compactOpenOrders：执行compactOpen订单相关逻辑。
 * @returns 无返回值，直接更新compactOpen订单相关状态。
 */

        compactOpenOrders() {
        return compactOpenOrdersImpl(this);
    }
    /** 重建 clientKey → lotKey 索引。 */
        rebuildAuctionClientKeyIndex() {
        return rebuildAuctionClientKeyIndexImpl(this);
    }
    /**
 * captureOnlinePlayerState：执行captureOnline玩家状态相关逻辑。
 * @param playerId 玩家 ID。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新captureOnline玩家状态相关状态。
 */

        captureOnlinePlayerState(playerId, context) {
        return captureOnlinePlayerStateImpl(this, playerId, context);
    }
    /**
 * getStorage：读取Storage。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成Storage的读取/组装。
 */

        getStorage(playerId) {
        return getStorageImpl(this, playerId);
    }
    /** 把命中的玩家 ID 重新插到 Set 末尾，使其成为最近使用项，从而保留在 LRU 缓存窗口内。 */
        touchStorageLru(playerId) {
        return touchStorageLruImpl(this, playerId);
    }
    /**
     * 按需 hydrate 单个玩家的坊市仓库。已 hydrate 的玩家直接返回并刷新 LRU；
     * 未 hydrate 时按 playerId 加锁拉取，避免重复 SQL 与并发覆盖。
     */
        async ensureStorageHydrated(playerId) {
        return ensureStorageHydratedImpl(this, playerId);
    }
    /** 批量 hydrate 多个玩家，常用于撮合前一次性预热所有受影响的对手方。 */
        async ensureStoragesHydrated(playerIds) {
        return ensureStoragesHydratedImpl(this, playerIds);
    }
    /** 标记玩家正在执行 mutation，eviction 期间避免误删该玩家的缓存条目。 */
        pinStoragePlayer(playerId) {
        return pinStoragePlayerImpl(this, playerId);
    }
    /** 释放上一次 pinStoragePlayer 计数；归零后从 pending 集合中移除。 */
        unpinStoragePlayer(playerId) {
        return unpinStoragePlayerImpl(this, playerId);
    }
    /** 收集当前必须保留在缓存中的玩家集合：在线玩家、有挂单玩家、当前正在 mutation 的玩家。 */
        collectStorageCachePinned() {
        return collectStorageCachePinnedImpl(this);
    }
    /** 超出 LRU 上限时按迭代顺序驱逐最久未使用且未被 pin 的玩家。 */
        evictStorageCacheIfOverLimit() {
        return evictStorageCacheIfOverLimitImpl(this);
    }
    /**
 * getCurrencyItemName：读取Currency道具名称。
 * @returns 无返回值，完成Currency道具名称的读取/组装。
 */

        getCurrencyItemName() {
        return getCurrencyItemNameImpl(this);
    }
    /** 统一解析坊市玩家可见物品名，禁止用 itemId 作为兜底文案。 */
        resolveMarketItemDisplayName(item, itemIdInput) {
        return resolveMarketItemDisplayNameImpl(this, item, itemIdInput);
    }
    /**
 * buildClaimStoragePlan：构建领取托管仓的目标背包与剩余仓库。
 * @param inventorySnapshot 背包快照。
 * @param storageItems 托管仓条目。
 * @returns 领取计划。
 */

        buildClaimStoragePlan(inventorySnapshot, storageItems) {
        return buildClaimStoragePlanImpl(this, inventorySnapshot, storageItems);
    }
    /**
 * createMutationContext：构建并返回目标对象。
 * @returns 无返回值，直接更新Mutation上下文相关状态。
 */

        createMutationContext() {
        return createMutationContextImpl(this);
    }
    /**
 * restoreMutationContext：执行restoreMutation上下文相关逻辑。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新restoreMutation上下文相关状态。
 */

        restoreMutationContext(context) {
        return restoreMutationContextImpl(this, context);
    }
    /**
 * runExclusiveMarketMutation：处理runExclusive坊市Mutation并更新相关状态。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @returns 无返回值，直接更新runExclusive坊市Mutation相关状态。
 */

    async runExclusiveMarketMutation(playerId, action, options = {}) {
        return runExclusiveMarketMutationImpl(this, playerId, action, options);
    }
    /**
     * 坊市 mutation 收尾后立即对所有受影响的在线玩家强制 flush 一次：
     * - context.onlinePlayerSnapshots 由 captureOnlinePlayerState 在所有动钱/动物品的入口标记，
     *   覆盖买家、卖家、收货方等当事玩家。
     * - flushPlayer 内部已经处理 lease 失效与无脏域的快速返回，调用方不需要预过滤。
     * - 单玩家失败仅记录日志：market 已经 commit，玩家 dirty 标记仍保留，下一次周期/断线/关停
     *   flush 会继续重试，避免单点失败回滚整笔交易。
     */
    async flushAffectedPlayersAfterMutation(context) {
        return flushAffectedPlayersAfterMutationImpl(this, context);
    }
    /** 复用玩家运行时的跨领域资产串行器；精简 smoke 未提供该端口时直接执行。 */
    async runExclusivePlayerAssetMutation(playerIds, action) {
        return runExclusivePlayerAssetMutationImpl(this, playerIds, action);
    }
    /**
 * runExclusive：执行runExclusive相关逻辑。
 * @param action 参数说明。
 * @returns 无返回值，直接更新runExclusive相关状态。
 */

    async runExclusive(action) {
        return runExclusiveImpl(this, action);
    }
}

