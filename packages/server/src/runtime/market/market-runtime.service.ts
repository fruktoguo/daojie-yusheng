/**
 * 坊市运行时服务。
 * 维护挂单、撮合成交、仓库存取和交易历史，
 * 所有写操作串行化执行并持久化到数据库。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AUCTION_LISTING_FEE_BASE, AUCTION_LISTING_FEE_RATE, EQUIP_SLOTS, ITEM_TYPES, MARKET_MAX_UNIT_PRICE, calculateMarketTradeTotalCost, createItemStackSignature, getMarketMinimumTradeQuantity, getMarketPriceStep, isValidMarketPrice, isValidMarketTradeQuantity, normalizeMarketPriceUp } from '@mud/shared';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { MARKET_CURRENCY_ITEM_ID, MARKET_MAX_ORDER_QUANTITY, MARKET_TRADE_HISTORY_PAGE_SIZE, MARKET_TRADE_HISTORY_VISIBLE_LIMIT } from '../../constants/gameplay/market';
import { MarketPersistenceService } from '../../persistence/market-persistence.service';
import { DurableOperationService } from '../../persistence/durable-operation.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { InstanceCatalogService } from '../../persistence/instance-catalog.service';
import { buildStructuredNotice } from '../world/structured-notice.helpers';

const AUCTION_EXTENSION_WINDOW_MS = 30 * 1000;
const AUCTION_MAX_EXTENSION_MS = 60 * 60 * 1000;

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
    /** 运行时日志器，记录加载、撮合与持久化异常。 */
    logger = new Logger(MarketRuntimeService.name);
    /** 当前仍然有效的求购/出售挂单。 */
    openOrders = [];
    /** 最近成交记录，用于交易历史面板。 */
    tradeHistory = [];
    /** 每个玩家的坊市仓库缓存。 */
    storageByPlayerId = new Map();
    /** 拍卖行独立出价态，避免拍卖出价误走坊市买单撮合。 */
    auctionBidsByItemKey = new Map();
    /** 拍卖行权威结束时间，前端只用投影字段本地倒计时。 */
    auctionTimingByItemKey = new Map();
    /** clientAuctionLotKey → auctionLotKey 索引，避免 resolveAuctionLotKey O(n) 扫描。 */
    auctionClientKeyToLotKey = new Map<string, string>();
    /** 串行化坊市写操作，避免并发修改同一份内存状态。 */
    marketOperationQueue = Promise.resolve();
    /** 注入内容、玩家与坊市持久化服务。 */
    constructor(
        @Inject(ContentTemplateRepository) contentTemplateRepository: any,
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(MarketPersistenceService) marketPersistenceService: any,
        @Inject(DurableOperationService) durableOperationService: any,
        @Inject(InstanceCatalogService) instanceCatalogService: any,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.marketPersistenceService = marketPersistenceService;
        this.durableOperationService = durableOperationService;
        this.instanceCatalogService = instanceCatalogService;
    }
    /** 应用完成启动后再回填坊市快照，避免早于持久化服务初始化导致空装载。 */
    async onApplicationBootstrap() {
        await this.reloadFromPersistence();
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
        this.tradeHistory = await this.marketPersistenceService.loadTradeHistory();
        this.storageByPlayerId.clear();
        this.auctionBidsByItemKey.clear();
        this.auctionTimingByItemKey.clear();
        this.hydrateAuctionStateFromOpenOrders();
        for (const entry of await this.marketPersistenceService.loadStorages()) {
            this.storageByPlayerId.set(entry.playerId, cloneStorage(entry.storage));
        }
        this.compactOpenOrders();
    }
    /** 生成玩家进入坊市时需要的总览数据。 */
    buildMarketUpdate(playerId) {
        return {
            currencyItemId: MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            listedItems: [],
            myOrders: this.buildOwnOrders(playerId),
            storage: this.getStorage(playerId),
        };
    }
    /** 构造分页坊市列表，支持品类、部位和功法书分类过滤。 */
    buildMarketListingsPage(payload) {

        const page = Number.isFinite(payload?.page) ? Math.max(1, Math.trunc(payload.page)) : 1;

        const pageSize = Number.isFinite(payload?.pageSize) ? Math.min(100, Math.max(1, Math.trunc(payload.pageSize))) : 20;

        const category = typeof payload?.category === 'string' ? payload.category : 'all';

        const equipmentSlot = typeof payload?.equipmentSlot === 'string' ? payload.equipmentSlot : 'all';

        const techniqueCategory = typeof payload?.techniqueCategory === 'string' ? payload.techniqueCategory : 'all';

        const entries = this.buildMarketListingEntries();

        const filtered = this.filterMarketListingEntries(entries, category, equipmentSlot, techniqueCategory);

        const groups = this.groupMarketListingEntriesForPage(filtered);

        const total = groups.length;

        const start = (page - 1) * pageSize;
        return {
            currencyItemId: MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            page,
            pageSize,
            total,
            category,
            equipmentSlot,
            techniqueCategory,
            counts: this.buildMarketListingCounts(entries),
            items: groups.slice(start, start + pageSize).flatMap((entry) => entry.entries),
        };
    }
    /** 构造拍卖行分页列表，服务端按 tab、筛选和页码裁剪后只返回当前页。 */
    buildAuctionListingsPage(playerId, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const request = this.normalizeAuctionListingsRequest(payload);

        const participateLots = this.buildAuctionParticipateLotEntries(playerId);

        const mineLots = this.buildAuctionMineLotEntries(playerId);

        const source = request.tab === 'mine' ? mineLots : participateLots;

        const queryFiltered = this.filterAuctionLotEntriesByQuery(source, request.query);

        const categoryFiltered = this.filterAuctionLotEntriesByCategory(queryFiltered, request.category);

        const total = categoryFiltered.length;

        const totalPages = Math.max(1, Math.ceil(total / request.pageSize));

        const page = Math.max(1, Math.min(totalPages, request.page));

        const start = (page - 1) * request.pageSize;
        return {
            currencyItemId: MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            tab: request.tab,
            page,
            pageSize: request.pageSize,
            total,
            category: request.category,
            query: request.query,
            counts: this.buildAuctionListingCounts(queryFiltered),
            summary: this.buildAuctionListingSummary(playerId, participateLots, mineLots),
            items: categoryFiltered.slice(start, start + request.pageSize),
        };
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
        return entries.filter((entry) => {
            if (category !== 'all' && entry.itemType !== category) {
                return false;
            }
            if (equipmentSlot !== 'all' && (
                entry.itemType !== 'equipment'
                || entry.itemSubType !== equipmentSlot
            )) {
                return false;
            }
            if (techniqueCategory !== 'all' && (
                entry.itemType !== 'skill_book'
                || entry.itemSubType !== techniqueCategory
            )) {
                return false;
            }
            return true;
        });
    }
    /**
 * buildMarketListingCounts：按服务端分页分组口径生成分类计数。
 * @param entries 坊市分页条目。
 * @returns 坊市分类计数。
 */

    buildMarketListingCounts(entries) {
        const categoryCounts = {
            all: this.groupMarketListingEntriesForPage(entries).length,
        };
        for (const itemType of ITEM_TYPES) {
            categoryCounts[itemType] = this.groupMarketListingEntriesForPage(
                this.filterMarketListingEntries(entries, itemType, 'all', 'all'),
            ).length;
        }
        const equipmentEntries = this.filterMarketListingEntries(entries, 'equipment', 'all', 'all');
        const equipmentSlotCounts = {
            all: this.groupMarketListingEntriesForPage(equipmentEntries).length,
        };
        for (const slot of EQUIP_SLOTS) {
            equipmentSlotCounts[slot] = this.groupMarketListingEntriesForPage(
                this.filterMarketListingEntries(entries, 'equipment', slot, 'all'),
            ).length;
        }
        const techniqueEntries = this.filterMarketListingEntries(entries, 'skill_book', 'all', 'all');
        const techniqueCategoryCounts = {
            all: this.groupMarketListingEntriesForPage(techniqueEntries).length,
        };
        for (const techniqueCategory of ['arts', 'internal', 'divine', 'secret']) {
            techniqueCategoryCounts[techniqueCategory] = this.groupMarketListingEntriesForPage(
                this.filterMarketListingEntries(entries, 'skill_book', 'all', techniqueCategory),
            ).length;
        }
        return {
            categoryCounts,
            equipmentSlotCounts,
            techniqueCategoryCounts,
        };
    }
    /** 构造玩家自己的挂单列表。 */
    buildMarketOrders(playerId) {
        return {
            currencyItemId: MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            orders: this.buildOwnOrders(playerId),
        };
    }
    /** 构造玩家仓库视图，展示仓库中可挂售的条目。 */
    buildMarketStorage(playerId) {
        return {
            items: this.getStorage(playerId).items.map((item) => ({
                itemKey: this.buildItemKey(item),
                item: { ...item },
                count: item.count,
            })),
        };
    }
    /** 构造某件物品的坊市图鉴页，供查看价格和挂单情况。 */
    buildItemBook(itemKey) {

        const requestedItemKey = typeof itemKey === 'string' ? itemKey.trim() : '';

        const normalizedItemKey = this.resolveInternalMarketItemKey(itemKey);

        const responseItemKey = requestedItemKey || this.buildClientMarketKey(normalizedItemKey);

        const book = this.buildItemBookView(normalizedItemKey);
        if (book) {
            book.itemKey = responseItemKey;
        }
        return {
            currencyItemId: MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            itemKey: responseItemKey,
            book,
        };
    }
    /** 构造玩家自己的成交历史分页。 */
    buildTradeHistoryPage(playerId, page) {

        const visibleRecords = this.tradeHistory
            .filter((entry) => entry.buyerId === playerId || entry.sellerId === playerId)
            .slice(0, MARKET_TRADE_HISTORY_VISIBLE_LIMIT);

        const totalVisible = visibleRecords.length;

        const totalPages = Math.max(1, Math.ceil(totalVisible / MARKET_TRADE_HISTORY_PAGE_SIZE));

        const normalizedPage = Math.max(1, Math.min(totalPages, Math.trunc(Number.isFinite(page) ? page : 1)));

        const start = (normalizedPage - 1) * MARKET_TRADE_HISTORY_PAGE_SIZE;
        return {
            page: normalizedPage,
            pageSize: MARKET_TRADE_HISTORY_PAGE_SIZE,
            totalVisible,
            records: visibleRecords
                .slice(start, start + MARKET_TRADE_HISTORY_PAGE_SIZE)
                .map((entry) => this.toTradeHistoryView(playerId, entry)),
        };
    }
    /** 发起出售挂单，必要时直接撮合买单。 */
    async createSellOrder(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const listingMode = payload?.listingMode === 'auction' || payload?.auction === true ? 'auction' : 'market';
            const item = this.playerRuntimeService.peekInventoryItem(playerId, payload.slotIndex);
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
            if (listingMode !== 'auction' && !isValidMarketTradeQuantity(unitPrice, quantity)) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(unitPrice));
            }
            const auctionBuyoutPrice = listingMode === 'auction'
                ? this.normalizeAuctionBuyoutPrice(payload?.buyoutPrice, unitPrice)
                : null;
            const auctionListingFee = listingMode === 'auction'
                ? this.calculateAuctionListingFee(unitPrice)
                : 0;
            if (item.count < quantity) {
                return this.singleMessage(playerId, '挂售数量超过了当前持有数量。');
            }
            if (!this.canTradeItemOnMarket(item)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}是坊市货币，不能挂售。`);
            }
            if (auctionListingFee > 0 && !this.canAffordMarketCurrency(playerId, auctionListingFee)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，发起拍卖需要上架费 ${this.formatUnitPrice(auctionListingFee)}。`);
            }

            const orderItem = this.toOrderItem(item);

            const itemKey = this.buildItemKey(orderItem);
            if (this.hasConflictingOpenOrder(playerId, itemKey, 'sell')) {
                return this.singleMessage(playerId, '同一种物品已在求购中，不能同时挂售。');
            }
            this.captureOnlinePlayerState(playerId, context);
            if (auctionListingFee > 0 && !this.consumeMarketCurrencyFromInventory(playerId, auctionListingFee)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，发起拍卖需要上架费 ${this.formatUnitPrice(auctionListingFee)}。`);
            }

            const removed = this.playerRuntimeService.splitInventoryItem(playerId, payload.slotIndex, quantity);

            const result = this.createEmptyResult(playerId);

            const buyOrders = listingMode === 'auction'
                ? []
                : this.getSortedOrders(itemKey, 'buy').filter((order) => order.ownerId !== playerId && order.unitPrice >= unitPrice);

            const matchPlan = this.planOrderMatches(buyOrders, removed.count, unitPrice);

            let remaining = matchPlan.remainingQuantity;
            for (const match of matchPlan.matches) {
                const buyOrder = match.order;
                const tradeQuantity = match.quantity;

                const tradePrice = buyOrder.unitPrice;
                this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverMarketCurrencyToPlayer(playerId, match.totalCost, context);
                this.recordTrade({
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
                this.pushNotice(result, buyOrder.ownerId, `你的求购已成交：${orderItem.name} x${tradeQuantity}。`, 'loot');
                this.pushNotice(result, playerId, `你卖出了 ${orderItem.name} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${match.totalCost}。`, 'loot');
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
                };
                this.openOrders.push(order);
                if (listingMode === 'auction') {
                    this.initializeAuctionOrderState(order, context, auctionBuyoutPrice);
                }
                this.markOrderDirty(order.id, context);
                const listingText = listingMode === 'auction'
                    ? `已寄拍 ${orderItem.name} x${remaining}，整包总价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}，已收上架费 ${this.formatUnitPrice(auctionListingFee)} ${this.getCurrencyItemName()}。`
                    : `已挂售 ${orderItem.name} x${remaining}，单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}。`;
                if (listingMode === 'auction') {
                    this.pushStructuredNotice(result, playerId, 'success', 'notice.market.auction.consigned', listingText, {
                        vars: {
                            itemName: orderItem.name,
                            quantity: remaining,
                            currencyName: this.getCurrencyItemName(),
                            totalPrice: this.formatUnitPrice(unitPrice),
                            listingFee: this.formatUnitPrice(auctionListingFee),
                        },
                        pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
                    });
                }
                else {
                    this.pushNotice(result, playerId, listingText, 'success');
                }
            }
            this.compactOpenOrders();
            return result;
        });
    }
    /** 发起求购挂单，必要时直接撮合卖单。 */
    async createBuyOrder(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const item = this.resolveMarketItemForBuy(payload);
            if (!item) {
                return this.singleMessage(playerId, '求购的物品不存在。');
            }
            if (!this.canTradeItemOnMarket(item)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}是坊市货币，不能求购。`);
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
            if (this.hasConflictingOpenOrder(playerId, itemKey, 'buy')) {
                return this.singleMessage(playerId, '同一种物品已在挂售中，不能同时求购。');
            }

            const totalCost = calculateMarketTradeTotalCost(quantity, unitPrice);
            if (totalCost === null) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(unitPrice));
            }
            if (!this.canAffordMarketCurrency(playerId, totalCost)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法挂出求购。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            if (!this.consumeMarketCurrencyFromInventory(playerId, totalCost)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法挂出求购。`);
            }

            const result = this.createEmptyResult(playerId);

            const sellOrders = this.getSortedOrders(itemKey, 'sell').filter((order) => order.ownerId !== playerId && order.unitPrice <= unitPrice);

            const matchPlan = this.planOrderMatches(sellOrders, quantity, unitPrice);

            let remaining = matchPlan.remainingQuantity;
            for (const match of matchPlan.matches) {
                const sellOrder = match.order;
                const tradeQuantity = match.quantity;

                const tradePrice = sellOrder.unitPrice;
                this.deliverItemToPlayer(playerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverMarketCurrencyToPlayer(sellOrder.ownerId, match.totalCost, context);
                this.recordTrade({
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
                this.pushNotice(result, playerId, `你买入了 ${orderItem.name} x${tradeQuantity}，成交价 ${this.formatUnitPrice(tradePrice)}。`, 'loot');
                this.pushNotice(result, sellOrder.ownerId, `你的挂售已成交：${orderItem.name} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${match.totalCost}。`, 'loot');
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
                this.pushNotice(result, playerId, `已挂出求购 ${orderItem.name} x${remaining}，单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}。`, 'success');
            }
            this.compactOpenOrders();
            return result;
        });
    }
    /** 立即按当前市场挂单买入指定物品。 */
    async buyNow(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {
            const quantity = this.normalizeQuantity(payload.quantity);
            if (!quantity) {
                return this.singleMessage(playerId, '买入数量无效。');
            }

            const itemKey = this.resolveInternalMarketItemKey(payload.itemKey);
            if (this.buildAuctionListedItems().some((entry) => entry.orderItemKey === itemKey && this.getSortedAuctionBids(entry.itemKey).some((bid) => bid.reservedCost > 0))) {
                return this.singleMessage(playerId, '该物品已有拍卖出价，请从拍卖行一口价或等待结算。');
            }
            const sells = this.getSortedOrders(itemKey, 'sell').filter((order) => order.ownerId !== playerId);
            if (sells.length === 0) {
                return this.singleMessage(playerId, '当前没有可买入的挂售。');
            }

            const plan = this.planOrderMatches(sells, quantity, Number.POSITIVE_INFINITY);
            if (plan.fulfilledQuantity < quantity) {
                return this.singleMessage(playerId, `当前最多只能买到 ${plan.fulfilledQuantity} 件。`);
            }

            const totalCost = plan.totalCost;
            if (!this.canAffordMarketCurrency(playerId, totalCost)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法完成买入。`);
            }

            const buyerSnapshot = this.playerRuntimeService.snapshot(playerId);
            const durableOperationService = this.durableOperationService;
            const canUseDurableBuyNow = false;
            const matchedSellerPlans = [];
            if (canUseDurableBuyNow) {
                for (const match of plan.matches) {
                    const sellOrder = match.order;
                    const sellerSnapshot = this.playerRuntimeService.snapshot(sellOrder.ownerId);
                    if (!sellerSnapshot?.inventory || !sellerSnapshot?.wallet) {
                        matchedSellerPlans.length = 0;
                        break;
                    }
                    const nextSellerInventoryItems = applyMarketBuyNowToSellerInventory(sellerSnapshot.inventory.items ?? [], sellOrder.item, match.quantity);
                    const nextSellerWalletBalances = applyMarketSellNowToWalletBalances(sellerSnapshot.wallet.balances ?? [], MARKET_CURRENCY_ITEM_ID, match.totalCost);
                    if (!nextSellerInventoryItems || !nextSellerWalletBalances) {
                        matchedSellerPlans.length = 0;
                        break;
                    }
                    matchedSellerPlans.push({
                        sellerId: sellOrder.ownerId,
                        tradeQuantity: match.quantity,
                        totalCost: match.totalCost,
                        nextSellerInventoryItems,
                        nextSellerWalletBalances,
                    });
                }
            }

            this.captureOnlinePlayerState(playerId, context);
            if (!this.consumeMarketCurrencyFromInventory(playerId, totalCost)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法完成买入。`);
            }

            const result = this.createEmptyResult(playerId);
            const item = { ...sells[0].item };
            if (canUseDurableBuyNow && matchedSellerPlans.length === plan.matches.length && buyerSnapshot) {
                const buyerRuntimeOwnerId = typeof buyerSnapshot.runtimeOwnerId === 'string' && buyerSnapshot.runtimeOwnerId.trim()
                    ? buyerSnapshot.runtimeOwnerId.trim()
                    : '';
                const buyerSessionEpoch = Number.isFinite(buyerSnapshot.sessionEpoch)
                    ? Math.max(1, Math.trunc(Number(buyerSnapshot.sessionEpoch)))
                    : 0;
                if (buyerRuntimeOwnerId && buyerSessionEpoch > 0) {
                    const instanceLease = await this.resolveInstanceLeaseContext(buyerSnapshot.instanceId ?? null);
                    const nextBuyerInventoryItems = applyMarketSellNowToInventory(buyerSnapshot.inventory.items ?? [], item, quantity);
                    const nextBuyerWalletBalances = applyMarketBuyNowToBuyerWalletBalances(buyerSnapshot.wallet?.balances ?? [], MARKET_CURRENCY_ITEM_ID, totalCost);
                    if (nextBuyerInventoryItems && nextBuyerWalletBalances) {
                        const operationId = `market-buy-now:${playerId}:${Date.now()}:${randomUUID()}`;
                        const durableResult = await durableOperationService.settleMarketBuyNow({
                            operationId,
                            buyerId: playerId,
                            expectedRuntimeOwnerId: buyerRuntimeOwnerId,
                            expectedSessionEpoch: buyerSessionEpoch,
                            expectedInstanceId: buyerSnapshot.instanceId ?? null,
                            expectedAssignedNodeId: instanceLease?.assignedNodeId ?? null,
                            expectedOwnershipEpoch: instanceLease?.ownershipEpoch ?? null,
                            itemId: item.itemId,
                            itemName: item.name ?? item.itemId,
                            quantity,
                            totalCost,
                            nextBuyerInventoryItems,
                            nextBuyerWalletBalances,
                            matches: matchedSellerPlans.map((entry) => ({ ...entry })),
                        });
                        if (durableResult?.ok) {
                            this.playerRuntimeService.replaceInventoryItems(playerId, nextBuyerInventoryItems);
                            for (let index = 0; index < plan.matches.length; index += 1) {
                                const match = plan.matches[index];
                                const sellerPlan = matchedSellerPlans[index];
                                const sellOrder = match.order;
                                const tradeQuantity = match.quantity;
                                if (sellerPlan) {
                                    this.playerRuntimeService.replaceInventoryItems(sellOrder.ownerId, sellerPlan.nextSellerInventoryItems);
                                    this.playerRuntimeService.creditWallet(sellOrder.ownerId, MARKET_CURRENCY_ITEM_ID, sellerPlan.totalCost);
                                }
                                this.recordTrade({
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
                                this.pushNotice(result, sellOrder.ownerId, `你的挂售已成交：${item.name} x${tradeQuantity}。`, 'loot');
                                if (sellOrder.remainingQuantity <= 0) {
                                    sellOrder.status = 'filled';
                                    this.deleteOrder(sellOrder.id, context);
                                }
                            }
                            context.skipPersistence = true;
                            this.pushNotice(result, playerId, `你买入了 ${item.name} x${quantity}，共花费 ${this.getCurrencyItemName()} x${totalCost}。`, 'loot');
                            this.compactOpenOrders();
                            return result;
                        }
                    }
                }
            }

            for (const match of plan.matches) {
                const sellOrder = match.order;
                const tradeQuantity = match.quantity;
                this.deliverItemToPlayer(playerId, { ...item, count: tradeQuantity }, context);
                this.deliverMarketCurrencyToPlayer(sellOrder.ownerId, match.totalCost, context);
                this.recordTrade({
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
                this.pushNotice(result, sellOrder.ownerId, `你的挂售已成交：${item.name} x${tradeQuantity}。`, 'loot');
                if (sellOrder.remainingQuantity <= 0) {
                    sellOrder.status = 'filled';
                    this.deleteOrder(sellOrder.id, context);
                }
            }
            this.pushNotice(result, playerId, `你买入了 ${item.name} x${quantity}，共花费 ${this.getCurrencyItemName()} x${totalCost}。`, 'loot');
            this.compactOpenOrders();
            return result;
        });
    }
    /** 立即按当前市场挂单卖出指定物品。 */
    async sellNow(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const item = this.playerRuntimeService.peekInventoryItem(playerId, payload.slotIndex);
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
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}是坊市货币，不能出售给求购盘。`);
            }

            const orderItem = this.toOrderItem(item);

            const buys = this.getSortedOrders(this.buildItemKey(orderItem), 'buy').filter((order) => order.ownerId !== playerId);
            if (buys.length === 0) {
                return this.singleMessage(playerId, '当前没有可直接成交的求购。');
            }

            const plan = this.planOrderMatches(buys, quantity, Number.POSITIVE_INFINITY);
            if (plan.fulfilledQuantity < quantity) {
                return this.singleMessage(playerId, `当前求购盘最多只能接下 ${plan.fulfilledQuantity} 件。`);
            }

            const sellerSnapshot = this.playerRuntimeService.snapshot(playerId);
            const durableOperationService = this.durableOperationService;
            const canUseDurableSellNow = false;
            const matchedBuyerPlans = [];
            if (canUseDurableSellNow) {
                for (const match of plan.matches) {
                    const buyOrder = match.order;
                    const buyerSnapshot = this.playerRuntimeService.snapshot(buyOrder.ownerId);
                    if (!buyerSnapshot?.inventory) {
                        matchedBuyerPlans.length = 0;
                        break;
                    }
                    matchedBuyerPlans.push({
                        buyerId: buyOrder.ownerId,
                        tradeQuantity: match.quantity,
                        totalCost: match.totalCost,
                        nextBuyerInventoryItems: applyMarketSellNowToInventory(buyerSnapshot.inventory.items ?? [], orderItem, match.quantity),
                    });
                }
            }

            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.splitInventoryItem(playerId, payload.slotIndex, quantity);

            const result = this.createEmptyResult(playerId);

            const totalIncome = plan.totalCost;
            if (canUseDurableSellNow && matchedBuyerPlans.length === plan.matches.length && sellerSnapshot) {
                const sellerRuntimeOwnerId = typeof sellerSnapshot.runtimeOwnerId === 'string' && sellerSnapshot.runtimeOwnerId.trim()
                    ? sellerSnapshot.runtimeOwnerId.trim()
                    : '';
                const sellerSessionEpoch = Number.isFinite(sellerSnapshot.sessionEpoch)
                    ? Math.max(1, Math.trunc(Number(sellerSnapshot.sessionEpoch)))
                    : 0;
                if (sellerRuntimeOwnerId && sellerSessionEpoch > 0) {
                    const instanceLease = await this.resolveInstanceLeaseContext(sellerSnapshot.instanceId ?? null);
                    const nextSellerInventoryItems = cloneInventoryItems(this.playerRuntimeService.getPlayerOrThrow(playerId).inventory.items ?? []);
                    const nextSellerWalletBalances = applyMarketSellNowToWalletBalances(sellerSnapshot.wallet?.balances ?? [], MARKET_CURRENCY_ITEM_ID, totalIncome);
                    if (nextSellerInventoryItems && nextSellerWalletBalances) {
                        const operationId = `market-sell-now:${playerId}:${Date.now()}:${randomUUID()}`;
                        const durableResult = await durableOperationService.settleMarketSellNow({
                            operationId,
                            sellerId: playerId,
                            expectedRuntimeOwnerId: sellerRuntimeOwnerId,
                            expectedSessionEpoch: sellerSessionEpoch,
                            expectedInstanceId: sellerSnapshot.instanceId ?? null,
                            expectedAssignedNodeId: instanceLease?.assignedNodeId ?? null,
                            expectedOwnershipEpoch: instanceLease?.ownershipEpoch ?? null,
                            itemId: orderItem.itemId,
                            itemName: orderItem.name ?? item.name ?? orderItem.itemId,
                            quantity,
                            totalIncome,
                            nextSellerInventoryItems,
                            nextSellerWalletBalances,
                            matches: matchedBuyerPlans,
                        });
                        if (durableResult?.ok) {
                            this.playerRuntimeService.creditWallet(playerId, MARKET_CURRENCY_ITEM_ID, totalIncome);
                            for (const match of plan.matches) {
                                const buyOrder = match.order;
                                const tradeQuantity = match.quantity;
                                this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
                                this.recordTrade({
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
                                this.pushNotice(result, buyOrder.ownerId, `你的求购已成交：${orderItem.name} x${tradeQuantity}。`, 'loot');
                                if (buyOrder.remainingQuantity <= 0) {
                                    buyOrder.status = 'filled';
                                    this.deleteOrder(buyOrder.id, context);
                                }
                            }
                            context.skipPersistence = true;
                            this.pushNotice(result, playerId, `你卖出了 ${orderItem.name} x${quantity}，共入账 ${this.getCurrencyItemName()} x${totalIncome}。`, 'loot');
                            this.compactOpenOrders();
                            return result;
                        }
                    }
                }
            }

            for (const match of plan.matches) {
                const buyOrder = match.order;
                const tradeQuantity = match.quantity;
                this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverMarketCurrencyToPlayer(playerId, match.totalCost, context);
                this.recordTrade({
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
                this.pushNotice(result, buyOrder.ownerId, `你的求购已成交：${orderItem.name} x${tradeQuantity}。`, 'loot');
                if (buyOrder.remainingQuantity <= 0) {
                    buyOrder.status = 'filled';
                    this.deleteOrder(buyOrder.id, context);
                }
            }
            this.pushNotice(result, playerId, `你卖出了 ${orderItem.name} x${quantity}，共入账 ${this.getCurrencyItemName()} x${totalIncome}。`, 'loot');
            this.compactOpenOrders();
            return result;
        });
    }
    /** 取消玩家自己的挂单。 */
    async cancelOrder(playerId, payload) {
        const requestedOrderId = String(payload.orderId ?? '').trim();
        const requestedOrder = this.openOrders.find((entry) => entry.id === requestedOrderId && entry.ownerId === playerId);
        if (requestedOrder?.side === 'sell' && this.isAuctionOrder(requestedOrder) && this.getSortedAuctionBids(this.buildAuctionLotKey(requestedOrder)).some((bid) => bid.reservedCost > 0)) {
            return this.singleMessage(playerId, '这件寄拍已有出价，不能直接撤回。');
        }
        if (this.durableOperationService?.isEnabled()) {
            const orderId = requestedOrderId;
            const order = requestedOrder;
            if (!order) {
                return this.singleMessage(playerId, '未找到可取消的订单。');
            }
            if (order.status === 'cancelled' || order.remainingQuantity <= 0) {
                return this.singleMessage(playerId, '该订单已被取消或已完成。');
            }
            const playerSnapshot = this.playerRuntimeService.snapshot(playerId);
            if (order.side !== 'buy' && playerSnapshot?.runtimeOwnerId && Number.isFinite(playerSnapshot.sessionEpoch) && playerSnapshot.sessionEpoch > 0) {
                const operationId = `market-cancel-order:${playerId}:${Date.now()}:${randomUUID()}`;
                const nextInventoryItems = order.side === 'sell'
                    ? applyMarketSellNowToInventory(playerSnapshot.inventory.items ?? [], { ...order.item, count: order.remainingQuantity }, order.remainingQuantity)
                    : cloneInventoryItems(playerSnapshot.inventory.items ?? []);
                const nextWalletBalances = order.side === 'buy'
                    ? applyMarketSellNowToWalletBalances(playerSnapshot.wallet?.balances ?? [], MARKET_CURRENCY_ITEM_ID, calculateMarketTradeTotalCost(order.remainingQuantity, order.unitPrice))
                    : cloneWalletBalances(playerSnapshot.wallet?.balances ?? []);
                if (nextInventoryItems && nextWalletBalances) {
                    const instanceLease = await this.resolveInstanceLeaseContext(playerSnapshot.instanceId ?? null);
                    const durableResult = await this.durableOperationService.settleMarketCancelOrder({
                        operationId,
                        playerId,
                        expectedRuntimeOwnerId: String(playerSnapshot.runtimeOwnerId),
                        expectedSessionEpoch: Math.max(1, Math.trunc(Number(playerSnapshot.sessionEpoch))),
                        expectedInstanceId: playerSnapshot.instanceId ?? null,
                        expectedAssignedNodeId: instanceLease?.assignedNodeId ?? null,
                        expectedOwnershipEpoch: instanceLease?.ownershipEpoch ?? null,
                        orderId,
                        side: order.side,
                        nextInventoryItems,
                        nextWalletBalances,
                    });
                    if (durableResult?.ok) {
                        if (order.status === 'cancelled' || order.remainingQuantity <= 0) {
                            return this.singleMessage(playerId, '该订单已被取消或已完成。');
                        }
                        this.playerRuntimeService.replaceInventoryItems(playerId, nextInventoryItems);
                        if (order.side === 'buy') {
                            this.playerRuntimeService.creditWallet(playerId, MARKET_CURRENCY_ITEM_ID, calculateMarketTradeTotalCost(order.remainingQuantity, order.unitPrice));
                        }
                        order.status = 'cancelled';
                        order.remainingQuantity = 0;
                        order.updatedAt = Date.now();
                        this.openOrders = this.openOrders.filter((entry) => entry.id !== order.id);
                        this.compactOpenOrders();
                        return this.singleMessage(playerId, '订单已取消，剩余托管物已退回。', 'success');
                    }
                }
            }
        }
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const orderId = requestedOrderId;

            const order = this.openOrders.find((entry) => entry.id === orderId && entry.ownerId === playerId);
            if (!order) {
                return this.singleMessage(playerId, '未找到可取消的订单。');
            }
            if (order.side === 'sell') {
                this.deliverItemToPlayer(playerId, { ...order.item, count: order.remainingQuantity }, context);
            }
            else {

                const refund = calculateMarketTradeTotalCost(order.remainingQuantity, order.unitPrice);
                if (refund) {
                    this.deliverMarketCurrencyToPlayer(playerId, refund, context);
                }
            }
            order.status = 'cancelled';
            order.remainingQuantity = 0;
            order.updatedAt = Date.now();
            this.deleteOrder(order.id, context);
            this.compactOpenOrders();
            return this.singleMessage(playerId, '订单已取消，剩余托管物已退回。', 'success');
        });
    }
    /** 把仓库物品领取回背包，或在背包满时保留在仓库。 */
    async claimStorage(playerId) {
        if (this.durableOperationService?.isEnabled()) {
            return this.runExclusive(async () => {
                const context = this.createMutationContext();
                try {
                    const storage = this.storageByPlayerId.get(playerId);
                    if (!storage || storage.items.length === 0) {
                        return this.singleMessage(playerId, '坊市托管仓里暂时没有可领取的物品。');
                    }
                    const playerSnapshot = this.playerRuntimeService.snapshot(playerId);
                    if (!playerSnapshot) {
                        return this.singleMessage(playerId, '玩家当前不在运行态，暂时无法领取坊市托管仓物品。', 'warn');
                    }
                    const plan = this.buildClaimStoragePlan(playerSnapshot.inventory, storage.items);
                    if (plan.movedCount <= 0) {
                        return this.singleMessage(playerId, '背包空间不足，托管仓物品暂时无法领取。');
                    }
                    const expectedRuntimeOwnerId = typeof playerSnapshot.runtimeOwnerId === 'string' && playerSnapshot.runtimeOwnerId.trim()
                        ? playerSnapshot.runtimeOwnerId.trim()
                        : '';
                    const expectedSessionEpoch = Number.isFinite(playerSnapshot.sessionEpoch) ? Math.max(1, Math.trunc(Number(playerSnapshot.sessionEpoch))) : 0;
                    if (!expectedRuntimeOwnerId || expectedSessionEpoch <= 0) {
                        throw new Error('market_storage_claim_session_fence_missing');
                    }
                    const instanceLease = await this.resolveInstanceLeaseContext(playerSnapshot.instanceId ?? null);
                    this.captureOnlinePlayerState(playerId, context);
                    const operationId = `market-storage-claim:${playerId}:${Date.now()}:${randomUUID()}`;
                    const result = await this.durableOperationService.claimMarketStorage({
                        operationId,
                        playerId,
                        expectedRuntimeOwnerId,
                        expectedSessionEpoch,
                        expectedInstanceId: playerSnapshot.instanceId ?? null,
                        expectedAssignedNodeId: instanceLease?.assignedNodeId ?? null,
                        expectedOwnershipEpoch: instanceLease?.ownershipEpoch ?? null,
                        movedCount: plan.movedCount,
                        remainingCount: plan.remainingItems.length,
                        nextInventoryItems: plan.nextInventoryItems,
                        nextMarketStorageItems: plan.remainingItems,
                    });
                    if (!result.ok) {
                        throw new Error('market_storage_claim_failed');
                    }
                    this.playerRuntimeService.replaceInventoryItems(playerId, plan.nextInventoryItems);
                    this.setStorage(playerId, { items: plan.remainingItems }, context);
                    context.skipPersistence = true;
                    if (plan.remainingItems.length > 0) {
                        return this.singleMessage(playerId, `已领取部分托管物，共 ${plan.movedCount} 件，其余仍保留在坊市托管仓。`, 'loot');
                    }
                    return this.singleMessage(playerId, `已领取坊市托管仓中的全部物品，共 ${plan.movedCount} 件。`, 'loot');
                }
                catch (error) {
                    this.restoreMutationContext(context);
                    throw error;
                }
            }).catch((error) => {
                this.logger.error(`坊市托管仓领取失败，已回滚: ${error instanceof Error ? error.message : String(error)}`);
                return this.singleMessage(playerId, '坊市结算失败，已回滚本次操作。', 'warn');
            });
        }
        return this.runExclusiveMarketMutation(playerId, async (context) => {
            const storage = this.storageByPlayerId.get(playerId);
            if (!storage || storage.items.length === 0) {
                return this.singleMessage(playerId, '坊市托管仓里暂时没有可领取的物品。');
            }
            const playerSnapshot = this.playerRuntimeService.snapshot(playerId);
            if (!playerSnapshot) {
                return this.singleMessage(playerId, '玩家当前不在运行态，暂时无法领取坊市托管仓物品。', 'warn');
            }
            const plan = this.buildClaimStoragePlan(playerSnapshot.inventory, storage.items);
            if (plan.movedCount <= 0) {
                return this.singleMessage(playerId, '背包空间不足，托管仓物品暂时无法领取。');
            }
            this.captureOnlinePlayerState(playerId, context);
            for (const item of storage.items) {
                if (this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
                    this.playerRuntimeService.receiveInventoryItem(playerId, item);
                }
            }
            this.setStorage(playerId, { items: plan.remainingItems }, context);
            if (plan.remainingItems.length > 0) {
                return this.singleMessage(playerId, `已领取部分托管物，共 ${plan.movedCount} 件，其余仍保留在坊市托管仓。`, 'loot');
            }
            return this.singleMessage(playerId, `已领取坊市托管仓中的全部物品，共 ${plan.movedCount} 件。`, 'loot');
        });
    }
    /**
 * buildListedItems：构建并返回目标对象。
 * @returns 无返回值，直接更新Listed道具相关状态。
 */

    buildListedItems() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const grouped = new Map();
        for (const template of this.contentTemplateRepository.listItemTemplates()) {
            const item = this.contentTemplateRepository.createItem(template.itemId, 1);
            if (!item) {
                continue;
            }
            const orderItem = this.toOrderItem(item);
            if (!this.canTradeItemOnMarket(orderItem)) {
                continue;
            }
            grouped.set(this.buildItemKey(orderItem), {
                item: orderItem,
                sellOrderCount: 0,
                sellQuantity: 0,
                buyOrderCount: 0,
                buyQuantity: 0,
            });
        }
        for (const order of this.openOrders) {
            if (order.remainingQuantity <= 0 || order.status !== 'open' || !this.canTradeItemOnMarket(order.item)) {
                continue;
            }

            const orderItem = this.toOrderItem(order.item);

            const orderItemKey = this.buildItemKey(orderItem);

            const current = grouped.get(orderItemKey) ?? {
                item: { ...orderItem },
                sellOrderCount: 0,
                sellQuantity: 0,
                buyOrderCount: 0,
                buyQuantity: 0,
            };
            if (order.side === 'sell') {
                current.sellOrderCount += 1;
                current.sellQuantity += order.remainingQuantity;
                current.lowestSellPrice = current.lowestSellPrice === undefined
                    ? order.unitPrice
                    : Math.min(current.lowestSellPrice, order.unitPrice);
            }
            else {
                current.buyOrderCount += 1;
                current.buyQuantity += order.remainingQuantity;
                current.highestBuyPrice = current.highestBuyPrice === undefined
                    ? order.unitPrice
                    : Math.max(current.highestBuyPrice, order.unitPrice);
            }
            grouped.set(orderItemKey, current);
        }
        return Array.from(grouped.entries())
            .map(([itemKey, entry]) => ({
            itemKey,
            item: entry.item,
            sellOrderCount: entry.sellOrderCount,
            sellQuantity: entry.sellQuantity,
            lowestSellPrice: entry.lowestSellPrice,
            buyOrderCount: entry.buyOrderCount,
            buyQuantity: entry.buyQuantity,
            highestBuyPrice: entry.highestBuyPrice,
        }))
            .sort((left, right) => {

            const leftLevel = this.contentTemplateRepository.getItemSortLevel(left.item);

            const rightLevel = this.contentTemplateRepository.getItemSortLevel(right.item);
            if (leftLevel !== rightLevel) {
                return leftLevel - rightLevel;
            }

            const leftHasSell = left.sellQuantity > 0 ? 1 : 0;

            const rightHasSell = right.sellQuantity > 0 ? 1 : 0;
            if (leftHasSell !== rightHasSell) {
                return rightHasSell - leftHasSell;
            }

            const leftPrice = left.lowestSellPrice ?? Number.MAX_SAFE_INTEGER;

            const rightPrice = right.lowestSellPrice ?? Number.MAX_SAFE_INTEGER;
            if (leftPrice !== rightPrice) {
                return leftPrice - rightPrice;
            }
            return left.item.name.localeCompare(right.item.name, 'zh-Hans-CN');
        });
    }
    /**
 * buildMarketListingEntries：构建并返回目标对象。
 * @returns 无返回值，直接更新坊市Listing条目相关状态。
 */

    buildMarketListingEntries() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return this.buildListedItems().map((entry) => ({
            itemKey: this.buildClientMarketKey(entry.itemKey),
            item: { ...entry.item },
            itemId: entry.item.itemId,
            itemType: entry.item.type ?? 'material',
            itemSubType: this.buildMarketListingSubType(entry.item),
            enhanceLevel: Number.isFinite(Number(entry.item.enhanceLevel))
                ? Math.max(0, Math.trunc(Number(entry.item.enhanceLevel)))
                : undefined,
            lowestSellPrice: entry.lowestSellPrice,
            sellOrderCount: entry.sellOrderCount,
            sellQuantity: entry.sellQuantity,
            highestBuyPrice: entry.highestBuyPrice,
            buyOrderCount: entry.buyOrderCount,
            buyQuantity: entry.buyQuantity,
        }));
    }
    /** 只列出显式拍卖订单，普通坊市挂售不进入拍卖行。 */
    buildAuctionListedItems() {
        const entries = [];
        for (const order of this.openOrders) {
            if (!this.isAuctionOrder(order)
                || order.side !== 'sell'
                || order.status !== 'open'
                || order.remainingQuantity <= 0
                || !this.canTradeItemOnMarket(order.item)) {
                continue;
            }
            const orderItem = this.toOrderItem(order.item);
            const orderItemKey = this.buildItemKey(orderItem);
            entries.push({
                itemKey: this.buildAuctionLotKey(order),
                orderItemKey,
                item: { ...orderItem },
                sellOrderCount: 1,
                sellQuantity: order.remainingQuantity,
                buyOrderCount: 0,
                buyQuantity: 0,
                lowestSellPrice: order.unitPrice,
                order,
                orders: [order],
            });
        }
        return entries;
    }
    /** 构造可参与拍卖的拍品摘要，拍卖行分页会在服务端继续裁剪。 */
    buildAuctionParticipateLotEntries(viewerId = '') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return this.buildAuctionListedItems()
            .filter((entry) => entry.lowestSellPrice !== undefined)
            .map((entry) => {
            const clientItemKey = this.buildClientAuctionLotKey(entry.itemKey);
            const order = entry.order ?? entry.orders?.[0];
            const createdAt = Number(order?.createdAt) || Date.now();
            const seed = this.buildAuctionStableNumber(clientItemKey || entry.itemKey);
            const timing = this.buildAuctionTiming(entry.itemKey, seed, createdAt);
            if (timing.ended) {
                return null;
            }
            const lowestSell = entry.lowestSellPrice;
            const bids = this.getAuctionBidViews(entry.itemKey, viewerId);
            const highestBid = bids[0]?.unitPrice;
            const currentPrice = Math.max(1, Math.floor(highestBid ?? lowestSell ?? 1));
            const buyoutPrice = this.getAuctionOrderBuyoutPrice(order, Math.max(1, Math.floor(lowestSell ?? 1)));
            return {
                id: clientItemKey,
                itemKey: clientItemKey,
                item: this.toAuctionPreviewItem(entry.item),
                itemId: entry.item.itemId,
                itemType: entry.item.type ?? 'material',
                itemSubType: this.buildMarketListingSubType(entry.item),
                enhanceLevel: Number.isFinite(Number(entry.item.enhanceLevel))
                    ? Math.max(0, Math.trunc(Number(entry.item.enhanceLevel)))
                    : undefined,
                currentPrice,
                buyoutPrice: buyoutPrice !== null && buyoutPrice >= currentPrice ? buyoutPrice : null,
                bidCount: bids.length,
                bids,
                startAtMs: timing.startAtMs,
                durationSeconds: timing.durationSeconds,
                status: 'active',
                statusLabel: '正在拍卖',
                sellerLabel: '匿名寄拍',
                lotNo: `#${1000 + (seed % 9000)}`,
                heat: entry.sellOrderCount * 3 + bids.length * 2,
                remainingQuantity: entry.sellQuantity || entry.buyQuantity,
            };
        })
            .filter((entry) => Boolean(entry))
            .sort((left, right) => {
            if (right.heat !== left.heat) {
                return right.heat - left.heat;
            }
            return String(left.item?.name ?? left.itemId).localeCompare(String(right.item?.name ?? right.itemId), 'zh-Hans-CN');
        });
    }
    /** 构造我的寄拍拍品摘要。 */
    buildAuctionMineLotEntries(playerId) {
        return this.openOrders
            .filter((order) => order.ownerId === playerId
            && order.side === 'sell'
            && order.status === 'open'
            && order.remainingQuantity > 0
            && this.isAuctionOrder(order)
            && this.canTradeItemOnMarket(order.item))
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
            .map((order) => {
            const clientItemKey = this.buildClientAuctionLotKey(this.buildAuctionLotKey(order));
            const seed = this.buildAuctionStableNumber(order.id);
            const auctionLotKey = this.buildAuctionLotKey(order);
            const timing = this.buildAuctionTiming(auctionLotKey, seed, order.createdAt);
            const bids = this.getAuctionBidViews(auctionLotKey, playerId);
            const highestBid = bids[0]?.unitPrice;
            const status = timing.ended ? (bids.length > 0 ? 'sold' : 'failed') : 'consigning';
            const statusLabel = status === 'sold' ? '已成交' : status === 'failed' ? '流拍' : '寄拍中';
            const buyoutPrice = this.getAuctionOrderBuyoutPrice(order, Math.max(1, Math.floor(order.unitPrice)));
            return {
                id: order.id,
                itemKey: clientItemKey,
                item: this.toAuctionPreviewItem(order.item),
                itemId: order.item.itemId,
                itemType: order.item.type ?? 'material',
                itemSubType: this.buildMarketListingSubType(order.item),
                enhanceLevel: Number.isFinite(Number(order.item.enhanceLevel))
                    ? Math.max(0, Math.trunc(Number(order.item.enhanceLevel)))
                    : undefined,
                currentPrice: Math.max(1, Math.floor(highestBid ?? order.unitPrice)),
                buyoutPrice,
                bidCount: bids.length,
                bids,
                startAtMs: timing.startAtMs,
                durationSeconds: timing.durationSeconds,
                status,
                statusLabel,
                sellerLabel: '我的寄拍',
                lotNo: `#${1000 + (seed % 9000)}`,
                heat: order.remainingQuantity,
                remainingQuantity: order.remainingQuantity,
                orderId: order.id,
                orderSide: order.side,
            };
        });
    }
    /** 提交拍卖行加价，只写拍卖出价态，不进入坊市买单撮合。 */
    async placeAuctionBid(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {
            const requestedKey = String(payload?.itemKey ?? payload?.lotId ?? '').trim();
            const itemKey = this.resolveAuctionLotKey(requestedKey);
            if (!itemKey) {
                return this.singleMessage(playerId, '拍品不存在或已结束。');
            }
            const sellOrders = this.getAuctionSellOrders(itemKey).filter((order) => order.ownerId !== playerId);
            if (sellOrders.length === 0) {
                return this.singleMessage(playerId, '拍品不存在、已结束，或不能对自己的寄拍出价。');
            }
            const lot = this.buildAuctionParticipateLotEntries(playerId).find((entry) => this.resolveAuctionLotKey(entry.itemKey) === itemKey);
            if (!lot) {
                return this.singleMessage(playerId, '拍品不存在或已结束。');
            }
            const timing = this.auctionTimingByItemKey.get(itemKey);
            if (!timing || timing.endAtMs <= Date.now()) {
                return this.singleMessage(playerId, '拍品已经结束，不能继续出价。');
            }
            const unitPrice = this.normalizeUnitPrice(payload?.unitPrice);
            if (!unitPrice) {
                return this.singleMessage(playerId, '拍卖出价无效。');
            }
            const minBidPrice = this.getAuctionMinimumBidPrice(lot.currentPrice);
            if (unitPrice < minBidPrice) {
                return this.singleMessage(playerId, `最低加价为 ${this.formatUnitPrice(minBidPrice)} ${this.getCurrencyItemName()}。`);
            }
            const totalCost = calculateMarketTradeTotalCost(1, unitPrice);
            if (totalCost === null) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法出价。`);
            }
            const existingBids = this.getSortedAuctionBids(itemKey);
            const previousHighest = existingBids[0] ?? null;
            const previousBid = existingBids.find((entry) => entry.bidderId === playerId) ?? null;
            if (previousBid && unitPrice <= previousBid.unitPrice) {
                return this.singleMessage(playerId, '新的出价必须高于你当前的拍卖出价。');
            }
            const now = Date.now();
            const previousReservedCost = previousBid?.reservedCost && previousHighest?.bidderId === playerId
                ? Math.max(0, Math.trunc(Number(previousBid.reservedCost) || 0))
                : 0;
            const debitCost = Math.max(0, totalCost - previousReservedCost);
            if (!this.canAffordMarketCurrency(playerId, debitCost)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法出价。`);
            }
            if (debitCost > 0) {
                this.captureOnlinePlayerState(playerId, context);
                if (!this.consumeMarketCurrencyFromInventory(playerId, debitCost)) {
                    return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法出价。`);
                }
            }
            const result = this.createEmptyResult(playerId);
            if (previousHighest && previousHighest.bidderId !== playerId && previousHighest.reservedCost > 0) {
                this.deliverMarketCurrencyToPlayer(previousHighest.bidderId, previousHighest.reservedCost, context);
                this.pushNotice(result, previousHighest.bidderId, `你在拍卖行的 ${lot.item?.name ?? lot.itemId} 出价已被超过，冻结灵石已退回。`, 'info');
            }
            const extension = this.extendAuctionIfEndingSoon(itemKey, now);
            const bids = existingBids
                .filter((entry) => entry.bidderId !== playerId)
                .map((entry) => entry.bidderId === previousHighest?.bidderId
                ? { ...entry, reservedCost: 0 }
                : { ...entry });
            bids.push({
                bidderId: playerId,
                unitPrice,
                createdAt: now,
                reservedCost: totalCost,
            });
            bids.sort((left, right) => right.unitPrice - left.unitPrice || left.createdAt - right.createdAt || left.bidderId.localeCompare(right.bidderId));
            this.auctionBidsByItemKey.set(itemKey, bids);
            this.persistAuctionStateToCarrier(itemKey, context);
            const extensionText = extension.extended ? '，剩余时间已延长至 30 秒' : '';
            this.pushStructuredNotice(result, playerId, 'success', 'notice.market.auction.bid-placed', `你在拍卖行出价 ${lot.item?.name ?? lot.itemId}，当前总价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}${extensionText}。`, {
                vars: {
                    itemName: lot.item?.name ?? lot.itemId,
                    currencyName: this.getCurrencyItemName(),
                    totalPrice: this.formatUnitPrice(unitPrice),
                    extensionText,
                },
                pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
            });
            return result;
        });
    }
    /** 拍卖行一口价入口，避免客户端误走坊市买入事件。 */
    async buyoutAuctionLot(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {
            const requestedKey = String(payload?.itemKey ?? payload?.lotId ?? '').trim();
            const itemKey = this.resolveAuctionLotKey(requestedKey);
            if (!itemKey) {
                return this.singleMessage(playerId, '拍品不存在或已结束。');
            }
            const timing = this.auctionTimingByItemKey.get(itemKey);
            if (timing && timing.endAtMs <= Date.now()) {
                return this.singleMessage(playerId, '拍品已经结束，不能一口价。');
            }
            const sellOrder = this.getAuctionSellOrders(itemKey).find((order) => order.ownerId !== playerId);
            if (!sellOrder) {
                return this.singleMessage(playerId, '拍品不存在、已结束，或不能一口价自己的寄拍。');
            }
            const bids = this.getSortedAuctionBids(itemKey);
            const configuredBuyoutPrice = this.getAuctionOrderBuyoutPrice(sellOrder, Math.max(1, Math.floor(sellOrder.unitPrice)));
            const currentPrice = Math.max(1, Math.floor(bids[0]?.unitPrice ?? sellOrder.unitPrice));
            if (configuredBuyoutPrice === null || configuredBuyoutPrice < currentPrice) {
                return this.singleMessage(playerId, '该拍品不支持一口价。');
            }
            const buyoutUnitPrice = configuredBuyoutPrice;
            const tradeQuantity = Math.max(1, Math.trunc(Number(sellOrder.remainingQuantity) || 1));
            const totalCost = calculateMarketTradeTotalCost(1, buyoutUnitPrice);
            if (totalCost === null) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(buyoutUnitPrice));
            }
            const buyerBid = bids.find((entry) => entry.bidderId === playerId) ?? null;
            const buyerReservedCost = Math.max(0, Math.trunc(Number(buyerBid?.reservedCost ?? 0)));
            const additionalCost = Math.max(0, totalCost - buyerReservedCost);
            if (!this.canAffordMarketCurrency(playerId, additionalCost)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法一口价。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            if (additionalCost > 0 && !this.consumeMarketCurrencyFromInventory(playerId, additionalCost)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法一口价。`);
            }
            const result = this.createEmptyResult(playerId);
            for (const bid of bids) {
                const reservedCost = Math.max(0, Math.trunc(Number(bid.reservedCost ?? 0)));
                if (reservedCost <= 0) {
                    continue;
                }
                if (bid.bidderId === playerId) {
                    const refund = Math.max(0, reservedCost - totalCost);
                    if (refund > 0) {
                        this.deliverMarketCurrencyToPlayer(playerId, refund, context);
                    }
                    continue;
                }
                this.deliverMarketCurrencyToPlayer(bid.bidderId, reservedCost, context);
                this.pushNotice(result, bid.bidderId, `拍卖行 ${sellOrder.item.name ?? sellOrder.item.itemId} 已被一口价，冻结灵石已退回。`, 'info');
            }
            this.deliverItemToPlayer(playerId, { ...sellOrder.item, count: tradeQuantity }, context);
            this.deliverMarketCurrencyToPlayer(sellOrder.ownerId, totalCost, context);
            this.recordTrade({
                buyerId: playerId,
                sellerId: sellOrder.ownerId,
                itemId: sellOrder.item.itemId,
                quantity: tradeQuantity,
                unitPrice: buyoutUnitPrice,
            }, context);
            sellOrder.remainingQuantity -= tradeQuantity;
            sellOrder.updatedAt = Date.now();
            this.markOrderDirty(sellOrder.id, context);
            this.touchAffectedPlayer(result, sellOrder.ownerId);
            this.pushStructuredNotice(result, playerId, 'success', 'notice.market.auction.buyout-buyer', `你在拍卖行一口价竞得了 ${sellOrder.item.name ?? sellOrder.item.itemId} x${tradeQuantity}，一口价支付 ${this.getCurrencyItemName()} x${totalCost}。`, {
                vars: { itemName: sellOrder.item.name ?? sellOrder.item.itemId, quantity: tradeQuantity, currencyName: this.getCurrencyItemName(), totalPrice: totalCost },
                pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
            });
            this.pushStructuredNotice(result, sellOrder.ownerId, 'success', 'notice.market.auction.buyout-seller', `你的寄拍已被一口价拍下：${sellOrder.item.name ?? sellOrder.item.itemId} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${totalCost}。`, {
                vars: { itemName: sellOrder.item.name ?? sellOrder.item.itemId, quantity: tradeQuantity, currencyName: this.getCurrencyItemName(), totalPrice: totalCost },
                pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
            });
            if (sellOrder.remainingQuantity <= 0) {
                sellOrder.status = 'filled';
                this.deleteOrder(sellOrder.id, context);
            }
            this.clearAuctionStateForItemKey(itemKey, context);
            this.compactOpenOrders();
            this.reopenAuctionStateIfActive(itemKey, context);
            return result;
        });
    }
    /** 读取拍卖出价记录，按当前观看者做轻量匿名标签。 */
    getAuctionBidViews(itemKey, viewerId = '') {
        const normalizedItemKey = this.resolveAuctionLotKey(itemKey);
        const bids = this.getSortedAuctionBids(normalizedItemKey);
        return bids
            .slice(0, 6)
            .map((bid, index) => ({
            bidderLabel: bid.bidderId === viewerId ? '我的出价' : `匿名修士 ${index + 1}`,
            unitPrice: bid.unitPrice,
            createdAtMs: bid.createdAt,
        }));
    }
    /** 读取拍卖出价内部排序，最高价排在最前。 */
    getSortedAuctionBids(itemKey) {
        const normalizedItemKey = this.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const bids = this.auctionBidsByItemKey.get(normalizedItemKey) ?? [];
        return bids
            .map((entry) => ({
            bidderId: String(entry?.bidderId ?? ''),
            unitPrice: this.normalizeUnitPrice(entry?.unitPrice),
            createdAt: Number.isFinite(Number(entry?.createdAt)) ? Math.max(0, Math.trunc(Number(entry.createdAt))) : Date.now(),
            reservedCost: Math.max(0, Math.trunc(Number(entry?.reservedCost ?? 0))),
        }))
            .filter((entry) => entry.bidderId.length > 0 && entry.unitPrice > 0)
            .sort((left, right) => right.unitPrice - left.unitPrice || left.createdAt - right.createdAt || left.bidderId.localeCompare(right.bidderId));
    }
    /** 判断订单是否属于显式拍卖寄拍。 */
    isAuctionOrder(order) {
        return Boolean(order?.auction && typeof order.auction === 'object' && order.auction.mode === 'auction');
    }
    /** 读取指定拍品 key 对应的显式拍卖卖单。 */
    getAuctionSellOrders(itemKey) {
        const normalizedItemKey = this.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        return this.openOrders
            .filter((order) => order.status === 'open'
            && order.side === 'sell'
            && order.remainingQuantity > 0
            && this.isAuctionOrder(order)
            && this.buildAuctionLotKey(order) === normalizedItemKey)
            .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    }
    /** 是否存在指定物品的显式拍卖卖单。 */
    hasAuctionSellOrders(itemKey) {
        return this.getAuctionSellOrders(itemKey).length > 0;
    }
    /** 启动恢复时从订单 raw_payload 中恢复拍卖状态。 */
    hydrateAuctionStateFromOpenOrders() {
        this.auctionClientKeyToLotKey.clear();
        for (const order of this.openOrders) {
            if (!this.isAuctionOrder(order) || order.side !== 'sell' || order.status !== 'open' || order.remainingQuantity <= 0) {
                continue;
            }
            const itemKey = this.buildAuctionLotKey(order);
            const clientKey = this.buildClientAuctionLotKey(itemKey);
            if (clientKey) {
                this.auctionClientKeyToLotKey.set(clientKey, itemKey);
            }
            const auction = this.normalizeAuctionOrderState(order.auction);
            if (!auction) {
                continue;
            }
            if (!this.auctionTimingByItemKey.has(itemKey)) {
                this.auctionTimingByItemKey.set(itemKey, {
                    startAtMs: auction.startAtMs,
                    normalDurationSeconds: auction.normalDurationSeconds,
                    endAtMs: auction.endAtMs,
                    maxEndAtMs: auction.maxEndAtMs,
                });
            }
            if (!this.auctionBidsByItemKey.has(itemKey) && auction.bids.length > 0) {
                this.auctionBidsByItemKey.set(itemKey, auction.bids);
            }
        }
    }
    /** 初始化新寄拍的拍卖状态，并写回承载订单用于持久化。 */
    initializeAuctionOrderState(order, context, buyoutPrice = null) {
        if (!order || order.side !== 'sell') {
            return;
        }
        const itemKey = this.buildAuctionLotKey(order);
        if (!itemKey) {
            return;
        }
        const clientKey = this.buildClientAuctionLotKey(itemKey);
        if (clientKey) {
            this.auctionClientKeyToLotKey.set(clientKey, itemKey);
        }
        if (!this.auctionTimingByItemKey.has(itemKey)) {
            const seed = this.buildAuctionStableNumber(this.buildClientAuctionLotKey(itemKey) || itemKey);
            const base = this.buildAuctionBaseTiming(seed, order.createdAt, false);
            const normalEndAtMs = base.startAtMs + base.durationSeconds * 1000;
            this.auctionTimingByItemKey.set(itemKey, {
                startAtMs: base.startAtMs,
                normalDurationSeconds: base.durationSeconds,
                endAtMs: normalEndAtMs,
                maxEndAtMs: normalEndAtMs + AUCTION_MAX_EXTENSION_MS,
            });
        }
        if (!this.auctionBidsByItemKey.has(itemKey)) {
            this.auctionBidsByItemKey.set(itemKey, []);
        }
        const timing = this.auctionTimingByItemKey.get(itemKey);
        if (timing) {
            order.auction = {
                version: 1,
                mode: 'auction',
                buyoutPrice,
                startAtMs: timing.startAtMs,
                normalDurationSeconds: timing.normalDurationSeconds,
                endAtMs: timing.endAtMs,
                maxEndAtMs: timing.maxEndAtMs,
                bids: this.getSortedAuctionBids(itemKey),
            };
        }
        this.persistAuctionStateToCarrier(itemKey, context);
    }
    /** 规范化订单内拍卖状态。 */
    normalizeAuctionOrderState(raw) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }
        if (raw.mode !== 'auction') {
            return null;
        }
        const startAtMs = Number.isFinite(Number(raw.startAtMs)) ? Math.max(0, Math.trunc(Number(raw.startAtMs))) : 0;
        const normalDurationSeconds = Number.isFinite(Number(raw.normalDurationSeconds))
            ? Math.max(1, Math.trunc(Number(raw.normalDurationSeconds)))
            : 1;
        const normalEndAtMs = startAtMs + normalDurationSeconds * 1000;
        const endAtMs = Number.isFinite(Number(raw.endAtMs)) ? Math.max(normalEndAtMs, Math.trunc(Number(raw.endAtMs))) : normalEndAtMs;
        const maxEndAtMs = Number.isFinite(Number(raw.maxEndAtMs)) ? Math.max(endAtMs, Math.trunc(Number(raw.maxEndAtMs))) : normalEndAtMs + AUCTION_MAX_EXTENSION_MS;
        const bids = Array.isArray(raw.bids)
            ? raw.bids.map((entry) => ({
                bidderId: String(entry?.bidderId ?? '').trim(),
                unitPrice: this.normalizeUnitPrice(entry?.unitPrice),
                createdAt: Number.isFinite(Number(entry?.createdAt)) ? Math.max(0, Math.trunc(Number(entry.createdAt))) : Date.now(),
                reservedCost: Math.max(0, Math.trunc(Number(entry?.reservedCost ?? 0))),
            })).filter((entry) => entry.bidderId.length > 0 && entry.unitPrice > 0)
            : [];
        bids.sort((left, right) => right.unitPrice - left.unitPrice || left.createdAt - right.createdAt || left.bidderId.localeCompare(right.bidderId));
        return {
            version: 1,
            mode: 'auction',
            buyoutPrice: this.normalizeAuctionBuyoutPrice(raw.buyoutPrice, 1),
            startAtMs,
            normalDurationSeconds,
            endAtMs,
            maxEndAtMs,
            bids,
        };
    }
    /** 把当前拍卖状态写回同 itemKey 的最早有效卖单，复用市场订单持久化。 */
    persistAuctionStateToCarrier(itemKey, context) {
        const normalizedItemKey = this.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const timing = this.auctionTimingByItemKey.get(normalizedItemKey);
        if (!timing) {
            return;
        }
        const carrier = this.getAuctionSellOrders(normalizedItemKey)
            .find((order) => !context || !context.deletedOrderIds.has(order.id));
        if (!carrier) {
            return;
        }
        carrier.auction = {
            version: 1,
            mode: 'auction',
            buyoutPrice: this.getAuctionOrderBuyoutPrice(carrier, Math.max(1, Math.floor(carrier.unitPrice))),
            startAtMs: timing.startAtMs,
            normalDurationSeconds: timing.normalDurationSeconds,
            endAtMs: timing.endAtMs,
            maxEndAtMs: timing.maxEndAtMs,
            bids: this.getSortedAuctionBids(normalizedItemKey),
        };
        carrier.updatedAt = Date.now();
        if (context) {
            this.markOrderDirty(carrier.id, context);
        }
    }
    /** 清理指定拍品的拍卖状态，并同步清掉承载订单字段。 */
    clearAuctionStateForItemKey(itemKey, context) {
        const normalizedItemKey = this.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        this.auctionBidsByItemKey.delete(normalizedItemKey);
        this.auctionTimingByItemKey.delete(normalizedItemKey);
        for (const order of this.openOrders) {
            if (this.buildAuctionLotKey(order) !== normalizedItemKey || !order.auction) {
                continue;
            }
            delete order.auction;
            order.updatedAt = Date.now();
            if (context && !context.deletedOrderIds.has(order.id)) {
                this.markOrderDirty(order.id, context);
            }
        }
    }
    /** 若同一物品仍有寄拍库存，成交后为下一件重新开一个拍卖窗口。 */
    reopenAuctionStateIfActive(itemKey, context) {
        const normalizedItemKey = this.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const nextOrder = this.getAuctionSellOrders(normalizedItemKey)
            .find((order) => !context || !context.deletedOrderIds.has(order.id));
        if (!nextOrder) {
            return;
        }
        this.initializeAuctionOrderState({ ...nextOrder, createdAt: Date.now() }, context);
    }
    /** 惰性结算已经到期且存在有效最高出价的拍品。 */
    async settleExpiredAuctionLots() {
        return this.runExclusiveMarketMutation('', async (context) => {
            const result = { affectedPlayerIds: [], notices: [] };
            const now = Date.now();
            let changed = false;
            for (const itemKey of Array.from(this.auctionTimingByItemKey.keys())) {
                changed = this.settleExpiredAuctionLot(itemKey, now, context, result) || changed;
            }
            if (!changed) {
                context.skipPersistence = true;
                return null;
            }
            this.compactOpenOrders();
            return result;
        });
    }
    /** 结算单个到期拍品。 */
    settleExpiredAuctionLot(itemKey, now, context, result) {
        const normalizedItemKey = this.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const timing = this.auctionTimingByItemKey.get(normalizedItemKey);
        if (!timing || timing.endAtMs > now) {
            return false;
        }
        const bids = this.getSortedAuctionBids(normalizedItemKey);
        const highestBid = bids[0] ?? null;
        if (!highestBid) {
            this.persistAuctionStateToCarrier(normalizedItemKey, context);
            return false;
        }
        const sellOrder = this.getAuctionSellOrders(normalizedItemKey)
            .find((order) => order.ownerId !== highestBid.bidderId && !context.deletedOrderIds.has(order.id));
        if (!sellOrder) {
            this.refundAuctionBidReserves(normalizedItemKey, context, result, `拍卖行拍品已失效，冻结灵石已退回。`);
            this.clearAuctionStateForItemKey(normalizedItemKey, context);
            return true;
        }
        const tradeQuantity = Math.max(1, Math.trunc(Number(sellOrder.remainingQuantity) || 1));
        const totalCost = calculateMarketTradeTotalCost(1, highestBid.unitPrice);
        if (totalCost === null || highestBid.reservedCost < totalCost) {
            this.refundAuctionBidReserves(normalizedItemKey, context, result, `拍卖行拍品结算失败，冻结灵石已退回。`);
            this.clearAuctionStateForItemKey(normalizedItemKey, context);
            this.reopenAuctionStateIfActive(normalizedItemKey, context);
            return true;
        }
        for (const bid of bids) {
            const reservedCost = Math.max(0, Math.trunc(Number(bid.reservedCost ?? 0)));
            if (reservedCost <= 0 || bid.bidderId === highestBid.bidderId) {
                continue;
            }
            this.deliverMarketCurrencyToPlayer(bid.bidderId, reservedCost, context);
            this.pushNotice(result, bid.bidderId, `拍卖行 ${sellOrder.item.name ?? sellOrder.item.itemId} 已成交，冻结灵石已退回。`, 'info');
        }
        const overpayRefund = Math.max(0, highestBid.reservedCost - totalCost);
        if (overpayRefund > 0) {
            this.deliverMarketCurrencyToPlayer(highestBid.bidderId, overpayRefund, context);
        }
        this.deliverItemToPlayer(highestBid.bidderId, { ...sellOrder.item, count: tradeQuantity }, context);
        this.deliverMarketCurrencyToPlayer(sellOrder.ownerId, totalCost, context);
        this.recordTrade({
            buyerId: highestBid.bidderId,
            sellerId: sellOrder.ownerId,
            itemId: sellOrder.item.itemId,
            quantity: tradeQuantity,
            unitPrice: highestBid.unitPrice,
        }, context);
        sellOrder.remainingQuantity -= tradeQuantity;
        sellOrder.updatedAt = now;
        this.markOrderDirty(sellOrder.id, context);
        this.pushStructuredNotice(result, highestBid.bidderId, 'success', 'notice.market.auction.settled-buyer', `你竞得了 ${sellOrder.item.name ?? sellOrder.item.itemId} x${tradeQuantity}，整包成交价 ${this.formatUnitPrice(highestBid.unitPrice)} ${this.getCurrencyItemName()}。`, {
            vars: { itemName: sellOrder.item.name ?? sellOrder.item.itemId, quantity: tradeQuantity, currencyName: this.getCurrencyItemName(), totalPrice: this.formatUnitPrice(highestBid.unitPrice) },
            pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
        });
        this.pushStructuredNotice(result, sellOrder.ownerId, 'success', 'notice.market.auction.settled-seller', `你的寄拍已成交：${sellOrder.item.name ?? sellOrder.item.itemId} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${totalCost}。`, {
            vars: { itemName: sellOrder.item.name ?? sellOrder.item.itemId, quantity: tradeQuantity, currencyName: this.getCurrencyItemName(), totalPrice: totalCost },
            pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
        });
        if (sellOrder.remainingQuantity <= 0) {
            sellOrder.status = 'filled';
            this.deleteOrder(sellOrder.id, context);
        }
        this.clearAuctionStateForItemKey(normalizedItemKey, context);
        this.reopenAuctionStateIfActive(normalizedItemKey, context);
        return true;
    }
    /** 退回指定拍品全部仍冻结的拍卖出价。 */
    refundAuctionBidReserves(itemKey, context, result, text) {
        for (const bid of this.getSortedAuctionBids(itemKey)) {
            const reservedCost = Math.max(0, Math.trunc(Number(bid.reservedCost ?? 0)));
            if (reservedCost <= 0) {
                continue;
            }
            this.deliverMarketCurrencyToPlayer(bid.bidderId, reservedCost, context);
            this.pushNotice(result, bid.bidderId, text, 'info');
        }
    }
    /** 当前价向上走一档得到拍卖最低加价。 */
    getAuctionMinimumBidPrice(currentPrice) {
        if (currentPrice >= MARKET_MAX_UNIT_PRICE) {
            return MARKET_MAX_UNIT_PRICE;
        }
        return normalizeMarketPriceUp(currentPrice + getMarketPriceStep(currentPrice));
    }
    /** 把内部买入结算结果改写成拍卖一口价提示。 */
    rewriteAuctionBuyoutNotices(result, playerId) {
        if (!result || !Array.isArray(result.notices)) {
            return;
        }
        for (const notice of result.notices) {
            if (notice.playerId === playerId) {
                if (typeof notice.text === 'string' && notice.text.includes('你买入了')) {
                    notice.text = notice.text.replace('你买入了', '你在拍卖行一口价竞得了').replace('共花费', '一口价支付');
                    notice.kind = 'success';
                }
                else if (typeof notice.text === 'string' && notice.text.includes('当前没有可买入的挂售')) {
                    notice.text = '拍品不存在或已结束。';
                }
                else if (typeof notice.text === 'string' && notice.text.includes('不足，无法完成买入')) {
                    notice.text = `${this.getCurrencyItemName()}不足，无法一口价。`;
                }
                continue;
            }
            if (typeof notice.text === 'string' && notice.text.includes('你的挂售已成交')) {
                notice.text = notice.text.replace('你的挂售已成交', '你的寄拍已被一口价拍下');
                notice.kind = 'success';
            }
        }
    }
    /** 规范化拍卖行分页请求，服务端硬限制每页最多 10 条。 */
    normalizeAuctionListingsRequest(payload) {
        const page = Number.isFinite(payload?.page) ? Math.max(1, Math.trunc(payload.page)) : 1;
        const requestedPageSize = Number.isFinite(payload?.pageSize) ? Math.max(1, Math.trunc(payload.pageSize)) : 10;
        const category = typeof payload?.category === 'string' && (payload.category === 'all' || ITEM_TYPES.includes(payload.category))
            ? payload.category
            : 'all';
        return {
            tab: payload?.tab === 'mine' ? 'mine' : 'participate',
            page,
            pageSize: Math.min(10, requestedPageSize),
            category,
            query: typeof payload?.query === 'string' ? payload.query.trim().slice(0, 32) : '',
        };
    }
    /** 按拍卖行主分类筛选。 */
    filterAuctionLotEntriesByCategory(entries, category) {
        if (category === 'all') {
            return entries;
        }
        return entries.filter((entry) => entry.itemType === category);
    }
    /** 按拍卖行搜索关键字筛选。 */
    filterAuctionLotEntriesByQuery(entries, query) {
        const keyword = typeof query === 'string' ? query.trim().toLowerCase() : '';
        if (!keyword) {
            return entries;
        }
        return entries.filter((entry) => {
            const itemName = String(entry.item?.name ?? entry.itemId ?? '').toLowerCase();
            const itemId = String(entry.itemId ?? '').toLowerCase();
            const status = String(entry.statusLabel ?? '').toLowerCase();
            return itemName.includes(keyword) || itemId.includes(keyword) || status.includes(keyword);
        });
    }
    /** 构造拍卖行分类计数。 */
    buildAuctionListingCounts(entries) {
        const categoryCounts = { all: entries.length };
        for (const itemType of ITEM_TYPES) {
            categoryCounts[itemType] = entries.filter((entry) => entry.itemType === itemType).length;
        }
        return { categoryCounts };
    }
    /** 构造拍卖行摘要统计。 */
    buildAuctionListingSummary(playerId, participateLots, mineLots) {
        return {
            activeLots: participateLots.length,
            buyoutLots: participateLots.filter((lot) => lot.buyoutPrice !== null && lot.buyoutPrice !== undefined).length,
            totalCurrentPrice: participateLots.reduce((sum, lot) => sum + Math.max(0, Math.floor(Number(lot.currentPrice) || 0)), 0),
            myBidCount: Array.from(this.auctionBidsByItemKey.values()).flat().filter((bid) => bid.bidderId === playerId).length,
            myConsignments: mineLots.length,
            consigningLots: mineLots.filter((lot) => lot.status === 'consigning').length,
            soldLots: mineLots.filter((lot) => lot.status === 'sold').length,
            failedLots: mineLots.filter((lot) => lot.status === 'failed').length,
            storageCount: this.getStorage(playerId).items.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.count) || 0)), 0),
        };
    }
    /** 拍卖行只需要当前页展示字段，避免把完整物品详情塞进分页包。 */
    toAuctionPreviewItem(item) {
        return {
            itemId: item.itemId,
            count: 1,
            name: item.name ?? item.itemId,
            type: item.type ?? 'material',
            grade: item.grade,
            level: item.level,
            groundLabel: item.groundLabel,
            equipSlot: item.equipSlot,
            enhanceLevel: Number.isFinite(Number(item.enhanceLevel))
                ? Math.max(0, Math.trunc(Number(item.enhanceLevel)))
                : undefined,
        };
    }
    /** 从订单创建时间派生当前拍卖窗口，客户端只按 startAtMs + durationSeconds 本地倒计时。 */
    buildAuctionTiming(itemKey, seed, createdAt) {
        const base = this.buildAuctionBaseTiming(seed, createdAt);
        return this.getAuctionTimingState(itemKey, base.startAtMs, base.durationSeconds, Date.now());
    }
    /** 生成没有延时修正的基础拍卖窗口。 */
    buildAuctionBaseTiming(seed, createdAt, refreshExpiredLegacy = true) {
        const durationSeconds = 21600 + (Math.max(0, Math.trunc(seed)) % 21600);
        const durationMs = durationSeconds * 1000;
        const now = Date.now();
        const anchor = Number.isFinite(Number(createdAt)) ? Math.max(0, Math.trunc(Number(createdAt))) : now;
        if (anchor >= now) {
            return { startAtMs: anchor, durationSeconds };
        }
        if (refreshExpiredLegacy && anchor + durationMs <= now) {
            return { startAtMs: now, durationSeconds };
        }
        return { startAtMs: anchor, durationSeconds };
    }
    /** 读取或初始化拍卖结束时间状态；延时时通过 durationSeconds 投影给前端。 */
    getAuctionTimingState(itemKey, startAtMs, normalDurationSeconds, now = Date.now()) {
        const normalizedItemKey = this.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const normalEndAtMs = startAtMs + normalDurationSeconds * 1000;
        const maxEndAtMs = normalEndAtMs + AUCTION_MAX_EXTENSION_MS;
        const existing = this.auctionTimingByItemKey.get(normalizedItemKey);
        if (existing && Number(existing.maxEndAtMs) >= Number(existing.endAtMs)) {
            return this.projectAuctionTiming(existing);
        }
        const next = {
            startAtMs,
            normalDurationSeconds,
            endAtMs: normalEndAtMs,
            maxEndAtMs,
        };
        this.auctionTimingByItemKey.set(normalizedItemKey, next);
        return this.projectAuctionTiming(next);
    }
    /** 把权威结束时间投影成兼容前端的开始时间和持续秒数。 */
    projectAuctionTiming(state) {
        return {
            startAtMs: state.startAtMs,
            durationSeconds: Math.max(1, Math.ceil((state.endAtMs - state.startAtMs) / 1000)),
            endAtMs: state.endAtMs,
            ended: state.endAtMs <= Date.now(),
        };
    }
    /** 最后 30 秒内出价时，把结束时间直接调整到 now + 30 秒，不累加。 */
    extendAuctionIfEndingSoon(itemKey, now = Date.now()) {
        const normalizedItemKey = this.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const timing = this.auctionTimingByItemKey.get(normalizedItemKey);
        if (!timing) {
            return { extended: false };
        }
        const remainingMs = timing.endAtMs - now;
        if (remainingMs <= 0 || remainingMs > AUCTION_EXTENSION_WINDOW_MS) {
            return { extended: false };
        }
        const nextEndAtMs = Math.min(now + AUCTION_EXTENSION_WINDOW_MS, timing.maxEndAtMs);
        if (nextEndAtMs <= timing.endAtMs) {
            return { extended: false };
        }
        timing.endAtMs = nextEndAtMs;
        return { extended: true, endAtMs: timing.endAtMs };
    }
    /** 稳定哈希用于拍卖编号和展示窗口。 */
    buildAuctionStableNumber(value) {
        const text = String(value ?? '');
        let hash = 0;
        for (let index = 0; index < text.length; index += 1) {
            hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
        }
        return Math.abs(hash);
    }
    /**
 * groupMarketListingEntriesForPage：按正式市场列表口径聚合分页条目。
 * @param entries 坊市分页条目。
 * @returns 聚合后的分页组。
 */

    groupMarketListingEntriesForPage(entries) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const groups = new Map();
        const orderedKeys = [];
        for (const entry of entries) {
            const groupKey = entry.itemType === 'equipment'
                ? `equipment:${entry.itemId}`
                : `item:${entry.itemKey}`;
            const current = groups.get(groupKey);
            if (current) {
                current.entries.push(entry);
                continue;
            }
            orderedKeys.push(groupKey);
            groups.set(groupKey, {
                key: groupKey,
                entries: [entry],
            });
        }
        return orderedKeys.map((key) => groups.get(key)).filter((entry) => Boolean(entry));
    }
    /**
 * buildOwnOrders：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Own订单相关状态。
 */

    buildOwnOrders(playerId) {
        return this.openOrders
            .filter((order) => order.ownerId === playerId && order.status === 'open' && order.remainingQuantity > 0 && this.canTradeItemOnMarket(order.item))
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
            .map((order) => ({
            id: order.id,
            side: order.side,
            status: order.status,
            itemKey: this.buildClientMarketKey(this.getOrderItemKey(order)),
            item: { ...order.item },
            remainingQuantity: order.remainingQuantity,
            unitPrice: order.unitPrice,
            createdAt: order.createdAt,
        }));
    }
    /**
 * buildItemBookView：构建并返回目标对象。
 * @param itemKey 参数说明。
 * @returns 无返回值，直接更新道具Book视图相关状态。
 */

    buildItemBookView(itemKey) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedItemKey = this.resolveInternalMarketItemKey(itemKey);
        if (!normalizedItemKey) {
            return null;
        }

        const orders = this.openOrders.filter((order) => order.status === 'open' && order.remainingQuantity > 0 && this.getOrderItemKey(order) === normalizedItemKey);
        if (orders.length === 0) {
            return null;
        }
        return {
            itemKey: this.buildClientMarketKey(normalizedItemKey),
            sells: this.buildPriceLevels(normalizedItemKey, 'sell'),
            buys: this.buildPriceLevels(normalizedItemKey, 'buy'),
        };
    }
    /**
 * buildPriceLevels：构建并返回目标对象。
 * @param itemKey 参数说明。
 * @param side 参数说明。
 * @returns 无返回值，直接更新价格等级相关状态。
 */

    buildPriceLevels(itemKey, side) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const grouped = new Map();
        for (const order of this.openOrders) {
            if (order.status !== 'open' || order.remainingQuantity <= 0 || order.side !== side || this.getOrderItemKey(order) !== itemKey) {
                continue;
            }

            const current = grouped.get(order.unitPrice) ?? { quantity: 0, orderCount: 0 };
            current.quantity += order.remainingQuantity;
            current.orderCount += 1;
            grouped.set(order.unitPrice, current);
        }

        const levels = Array.from(grouped.entries(), ([unitPrice, entry]) => ({
            unitPrice,
            quantity: entry.quantity,
            orderCount: entry.orderCount,
        }));
        levels.sort((left, right) => side === 'sell' ? left.unitPrice - right.unitPrice : right.unitPrice - left.unitPrice);
        return levels;
    }
    /**
 * getSortedOrders：读取Sorted订单。
 * @param itemKey 参数说明。
 * @param side 参数说明。
 * @returns 无返回值，完成Sorted订单的读取/组装。
 */

    getSortedOrders(itemKey, side) {
        return this.openOrders
            .filter((order) => order.status === 'open' && order.remainingQuantity > 0 && order.side === side && this.getOrderItemKey(order) === itemKey)
            .sort((left, right) => {
            if (side === 'sell' && left.unitPrice !== right.unitPrice) {
                return left.unitPrice - right.unitPrice;
            }
            if (side === 'buy' && left.unitPrice !== right.unitPrice) {
                return right.unitPrice - left.unitPrice;
            }
            return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
        });
    }
    /**
 * hasConflictingOpenOrder：判断ConflictingOpen订单是否满足条件。
 * @param ownerId owner ID。
 * @param itemKey 参数说明。
 * @param nextSide 参数说明。
 * @returns 无返回值，完成ConflictingOpen订单的条件判断。
 */

    hasConflictingOpenOrder(ownerId, itemKey, nextSide) {

        const oppositeSide = nextSide === 'sell' ? 'buy' : 'sell';
        return this.openOrders.some((order) => order.ownerId === ownerId
            && this.getOrderItemKey(order) === itemKey
            && order.side === oppositeSide
            && order.status === 'open'
            && order.remainingQuantity > 0);
    }
    /**
 * planOrderMatches：执行plan订单Matche相关逻辑。
 * @param orders 参数说明。
 * @param quantity 参数说明。
 * @param takerUnitPrice 参数说明。
 * @returns 无返回值，直接更新plan订单Matche相关状态。
 */

    planOrderMatches(orders, quantity, takerUnitPrice) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let remaining = quantity;

        let total = 0;

        const matches = [];
        for (const order of orders) {
            if (remaining <= 0) {
                break;
            }

            const maxTradable = Math.min(remaining, order.remainingQuantity);

            const traded = this.getCompatibleTradeQuantity(maxTradable, order.unitPrice, takerUnitPrice);
            if (traded <= 0) {
                continue;
            }

            const tradeTotal = calculateMarketTradeTotalCost(traded, order.unitPrice);
            if (!tradeTotal) {
                continue;
            }
            total += tradeTotal;
            remaining -= traded;
            matches.push({
                order,
                quantity: traded,
                totalCost: tradeTotal,
            });
        }
        return {
            matches,
            fulfilledQuantity: quantity - remaining,
            remainingQuantity: remaining,
            totalCost: total,
        };
    }
    /**
 * getCompatibleTradeQuantity：读取CompatibleTradeQuantity。
 * @param maxQuantity 参数说明。
 * @param unitPrices 参数说明。
 * @returns 无返回值，完成CompatibleTradeQuantity的读取/组装。
 */

    getCompatibleTradeQuantity(maxQuantity, ...unitPrices) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (maxQuantity <= 0) {
            return 0;
        }

        let quantityStep = 1;
        for (const unitPrice of unitPrices) {
            if (!unitPrice || !isValidMarketPrice(unitPrice)) {
                continue;
            }
            quantityStep = this.leastCommonMultiple(quantityStep, getMarketMinimumTradeQuantity(unitPrice));
        }
        return Math.floor(maxQuantity / quantityStep) * quantityStep;
    }
    /**
 * leastCommonMultiple：执行leastCommonMultiple相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新leastCommonMultiple相关状态。
 */

    leastCommonMultiple(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (left <= 0 || right <= 0) {
            return 0;
        }
        return (left / this.greatestCommonDivisor(left, right)) * right;
    }
    /**
 * greatestCommonDivisor：判断greatestCommonDivisor是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新greatestCommonDivisor相关状态。
 */

    greatestCommonDivisor(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let currentLeft = Math.abs(Math.trunc(left));

        let currentRight = Math.abs(Math.trunc(right));
        while (currentRight !== 0) {

            const next = currentLeft % currentRight;
            currentLeft = currentRight;
            currentRight = next;
        }
        return Math.max(1, currentLeft);
    }
    /**
 * buildItemKey：构建并返回目标对象。
 * @param item 道具。
 * @returns 无返回值，直接更新道具Key相关状态。
 */

    buildItemKey(item) {
        const normalized = this.toOrderItem(item);
        const identity: any = {
            itemId: normalized.itemId,
        };
        if (normalized.type === 'equipment') {
            identity.enhanceLevel = Number.isFinite(Number(normalized.enhanceLevel))
                ? Math.max(0, Math.trunc(Number(normalized.enhanceLevel)))
                : 0;
        }
        return JSON.stringify(identity);
    }
    /**
 * getOrderItemKey：用当前规则重新计算订单盘口 key，兼容旧导入订单中的历史签名。
 * @param order 坊市订单。
 * @returns 订单当前盘口 key。
 */

    getOrderItemKey(order) {
        return this.buildItemKey(order.item);
    }
    /** 单个拍卖寄拍订单的权威拍品 key，避免同种物品多笔寄拍互相合并。 */
    buildAuctionLotKey(order) {
        const orderId = typeof order?.id === 'string' ? order.id.trim() : '';
        return orderId ? `auction:${orderId}` : '';
    }
    /**
 * buildClientMarketKey：把内部长签名压成客户端可传输的短 key。
 * @param itemKey 内部长签名。
 * @returns 无返回值，直接更新客户端坊市 key 相关状态。
 */

    buildClientMarketKey(itemKey) {
        const normalizedItemKey = typeof itemKey === 'string' ? itemKey.trim() : '';
        if (!normalizedItemKey) {
            return '';
        }
        return createHash('sha1').update(normalizedItemKey).digest('base64url').replace(/[-_]/g, '').slice(0, 18);
    }
    /** 把拍卖内部订单 key 压成客户端拍品 key。 */
    buildClientAuctionLotKey(itemKey) {
        return this.buildClientMarketKey(itemKey);
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
        const normalizedItemKey = typeof itemKey === 'string' ? itemKey.trim() : '';
        if (!normalizedItemKey) {
            return '';
        }
        if (normalizedItemKey.startsWith('auction:')) {
            return normalizedItemKey;
        }
        const cached = this.auctionClientKeyToLotKey.get(normalizedItemKey);
        if (cached) {
            return cached;
        }
        return normalizedItemKey;
    }
    /**
 * buildMarketListingSubType：按大类提炼列表所需的二级分类。
 * @param item 道具。
 * @returns 无返回值，直接更新坊市条目子类型相关状态。
 */

    buildMarketListingSubType(item) {
        if (item.type === 'equipment') {
            return item.equipSlot ?? 'other';
        }
        if (item.type === 'skill_book') {
            return this.contentTemplateRepository.getTechniqueCategoryForBookItem(item.itemId) ?? 'other';
        }
        if (item.type === 'material') {
            return item.itemId.startsWith('mat.') ? 'herb' : 'special';
        }
        return 'other';
    }
    /**
 * resolveMarketItemForBuy：规范化或转换坊市道具ForBuy。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新坊市道具ForBuy相关状态。
 */

    resolveMarketItemForBuy(payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const itemKey = this.resolveInternalMarketItemKey(payload?.itemKey);
        if (itemKey) {

            const listedItem = this.buildListedItems().find((entry) => entry.itemKey === itemKey)?.item;
            if (listedItem) {
                return { ...listedItem, count: 1 };
            }
        }

        const structuredItem = this.resolveStructuredMarketItemKey(payload?.itemKey);
        if (structuredItem) {
            return structuredItem;
        }

        const itemId = typeof payload?.itemId === 'string' ? payload.itemId.trim() : '';
        return itemId ? this.contentTemplateRepository.createItem(itemId, 1) : null;
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
    /**
 * toOrderItem：执行to订单道具相关逻辑。
 * @param item 道具。
 * @returns 无返回值，直接更新to订单道具相关状态。
 */

    toOrderItem(item) {

        const normalized = this.toFullItem(item);
        return {
            ...normalized,
            count: 1,
        };
    }
    /**
 * createCurrencyItem：构建并返回目标对象。
 * @param count 数量。
 * @returns 无返回值，直接更新Currency道具相关状态。
 */

    createCurrencyItem(count) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const item = this.contentTemplateRepository.createItem(MARKET_CURRENCY_ITEM_ID, count);
        if (item) {
            return this.toFullItem({
                ...item,
                count,
            });
        }
        return {
            itemId: MARKET_CURRENCY_ITEM_ID,
            name: this.getCurrencyItemName(),
            type: 'consumable',
            count,
            desc: '坊市通行货币。',
        };
    }
    /**
 * canAffordMarketCurrency：判断背包灵石是否足够坊市结算。
 * @param playerId 玩家 ID。
 * @param amount 数量。
 * @returns 是否足够支付。
 */

    canAffordMarketCurrency(playerId, amount) {
        const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
        if (normalizedAmount <= 0) {
            return true;
        }
        return this.playerRuntimeService.canAffordWallet(playerId, MARKET_CURRENCY_ITEM_ID, normalizedAmount);
    }
    /**
 * consumeMarketCurrencyFromInventory：从背包扣除坊市结算灵石。
 * @param playerId 玩家 ID。
 * @param amount 数量。
 * @returns 是否扣除成功。
 */

    consumeMarketCurrencyFromInventory(playerId, amount) {
        const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
        if (normalizedAmount <= 0) {
            return true;
        }
        try {
            this.playerRuntimeService.debitWallet(playerId, MARKET_CURRENCY_ITEM_ID, normalizedAmount);
        }
        catch {
            return false;
        }
        return true;
    }
    /**
 * deliverMarketCurrencyToPlayer：按背包物品语义发放坊市灵石。
 * @param playerId 玩家 ID。
 * @param amount 数量。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新玩家或托管仓。
 */

    deliverMarketCurrencyToPlayer(playerId, amount, context) {
        const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
        if (normalizedAmount <= 0) {
            return;
        }
        this.deliverItemToPlayer(playerId, this.createCurrencyItem(normalizedAmount), context);
    }
    /**
 * toFullItem：执行toFull道具相关逻辑。
 * @param item 道具。
 * @returns 无返回值，直接更新toFull道具相关状态。
 */

    toFullItem(item) {

        const normalized = this.contentTemplateRepository.normalizeItem(item);
        return {
            itemId: normalized.itemId,
            name: normalized.name ?? normalized.itemId,
            type: normalized.type ?? 'material',
            count: Math.max(1, Math.trunc(normalized.count)),
            desc: normalized.desc ?? '',
            groundLabel: normalized.groundLabel,
            grade: normalized.grade,
            level: normalized.level,
            equipSlot: normalized.equipSlot,
            equipAttrs: normalized.equipAttrs,
            equipStats: normalized.equipStats,
            equipValueStats: normalized.equipValueStats,
            enhanceLevel: Number.isFinite(Number(normalized.enhanceLevel))
                ? Math.max(0, Math.trunc(Number(normalized.enhanceLevel)))
                : undefined,
            effects: normalized.effects,
            healAmount: normalized.healAmount,
            healPercent: normalized.healPercent,
            qiPercent: normalized.qiPercent,
            consumeBuffs: normalized.consumeBuffs,
            tags: normalized.tags,
            mapUnlockId: normalized.mapUnlockId,
            mapUnlockIds: Array.isArray(normalized.mapUnlockIds) ? normalized.mapUnlockIds.slice() : undefined,
            respawnBindMapId: normalized.respawnBindMapId,
            tileAuraGainAmount: normalized.tileAuraGainAmount,
            tileResourceGains: Array.isArray(normalized.tileResourceGains) ? normalized.tileResourceGains.map((entry) => ({ ...entry })) : undefined,
            allowBatchUse: normalized.allowBatchUse,
        };
    }
    /**
 * canTradeItemOnMarket：判断Trade道具On坊市是否满足条件。
 * @param item 道具。
 * @returns 无返回值，完成Trade道具On坊市的条件判断。
 */

    canTradeItemOnMarket(item) {
        return item.itemId !== MARKET_CURRENCY_ITEM_ID;
    }
    /**
 * normalizeQuantity：规范化或转换Quantity。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Quantity相关状态。
 */

    normalizeQuantity(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!Number.isFinite(value)) {
            return null;
        }

        const quantity = Math.trunc(value);
        if (quantity <= 0 || quantity > MARKET_MAX_ORDER_QUANTITY) {
            return null;
        }
        return quantity;
    }
    /**
 * normalizeUnitPrice：规范化或转换Unit价格。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Unit价格相关状态。
 */

    normalizeUnitPrice(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!Number.isFinite(value)) {
            return null;
        }

        const unitPrice = value;
        if (unitPrice <= 0 || unitPrice > MARKET_MAX_UNIT_PRICE || !isValidMarketPrice(unitPrice)) {
            return null;
        }
        return unitPrice;
    }
    /** 规范化拍卖一口价：0、无效值或低于起拍价都表示不支持一口价。 */
    normalizeAuctionBuyoutPrice(value, startPrice) {
        const numericStart = Math.max(1, Math.trunc(Number(startPrice) || 1));
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue) || numericValue <= 0) {
            return null;
        }
        const normalized = this.normalizeUnitPrice(numericValue);
        if (!normalized || normalized < numericStart) {
            return null;
        }
        return normalized;
    }
    /** 读取订单持久化的一口价，兼容旧拍卖订单没有一口价字段的情况。 */
    getAuctionOrderBuyoutPrice(order, startPrice) {
        return this.normalizeAuctionBuyoutPrice(order?.auction?.buyoutPrice, startPrice);
    }
    /** 拍卖上架费：10 + 起拍总价 1%，向上取整。 */
    calculateAuctionListingFee(startPrice) {
        const normalizedStartPrice = Math.max(1, Math.trunc(Number(startPrice) || 1));
        return AUCTION_LISTING_FEE_BASE + Math.ceil(normalizedStartPrice * AUCTION_LISTING_FEE_RATE);
    }
    /**
 * buildTradeQuantityError：构建并返回目标对象。
 * @param unitPrice 参数说明。
 * @returns 无返回值，直接更新TradeQuantityError相关状态。
 */

    buildTradeQuantityError(unitPrice) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const minimumQuantity = getMarketMinimumTradeQuantity(unitPrice);
        if (minimumQuantity <= 1) {
            return '挂售数量或单价无效。';
        }
        return `当前单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()} 时，数量必须是 ${minimumQuantity} 的倍数，才能按整灵石结算。`;
    }
    /**
 * formatUnitPrice：规范化或转换Unit价格。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Unit价格相关状态。
 */

    formatUnitPrice(value) {
        return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.0+$/, '');
    }
    /**
 * deliverItemToPlayer：执行deliver道具To玩家相关逻辑。
 * @param playerId 玩家 ID。
 * @param item 道具。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新deliver道具To玩家相关状态。
 */

    deliverItemToPlayer(playerId, item, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (player) {
            this.captureOnlinePlayerState(playerId, context);
            if (this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
                this.playerRuntimeService.receiveInventoryItem(playerId, item);
            }
            else {
                this.mergeStorageItem(playerId, item, context);
            }
            return;
        }
        this.mergeStorageItem(playerId, item, context);
    }
    /**
 * mergeStorageItem：处理Storage道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param item 道具。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新Storage道具相关状态。
 */

    mergeStorageItem(playerId, item, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const current = this.storageByPlayerId.get(playerId);

        const next = cloneStorage(current);

        const signature = createItemStackSignature(item);

        const existing = next.items.find((entry) => createItemStackSignature(entry) === signature);
        if (existing) {
            existing.count += item.count;
        }
        else {
            next.items.push({ ...item });
            next.items.sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
        }
        this.setStorage(playerId, next, context);
    }
    /**
 * setStorage：写入Storage。
 * @param playerId 玩家 ID。
 * @param storage 参数说明。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新Storage相关状态。
 */

    setStorage(playerId, storage, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!context.storageSnapshotByPlayerId.has(playerId)) {
            context.storageSnapshotByPlayerId.set(playerId, cloneStorage(this.storageByPlayerId.get(playerId)));
        }

        const normalized = cloneStorage(storage);
        if (normalized.items.length > 0) {
            this.storageByPlayerId.set(playerId, normalized);
        }
        else {
            this.storageByPlayerId.delete(playerId);
        }
        context.dirtyStoragePlayerIds.add(playerId);
    }
    /**
 * recordTrade：执行recordTrade相关逻辑。
 * @param payload 载荷参数。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新recordTrade相关状态。
 */

    recordTrade(payload, context) {
        context.newTradeRecords.push({
            version: 1,
            id: randomUUID(),
            buyerId: payload.buyerId,
            sellerId: payload.sellerId,
            itemId: payload.itemId,
            quantity: payload.quantity,
            unitPrice: payload.unitPrice,
            createdAt: Date.now(),
        });
    }
    /**
 * toTradeHistoryView：判断toTrade历史视图是否满足条件。
 * @param playerId 玩家 ID。
 * @param record 参数说明。
 * @returns 无返回值，直接更新toTradeHistory视图相关状态。
 */

    toTradeHistoryView(playerId, record) {
        return {
            id: record.id,

            side: record.buyerId === playerId ? 'buy' : 'sell',
            itemId: record.itemId,
            itemName: this.contentTemplateRepository.getItemName(record.itemId) ?? record.itemId,
            quantity: record.quantity,
            unitPrice: record.unitPrice,
            createdAt: record.createdAt,
        };
    }
    /**
 * createEmptyResult：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Empty结果相关状态。
 */

    createEmptyResult(playerId) {
        return {
            affectedPlayerIds: [playerId],
            notices: [],
        };
    }
    /**
 * singleMessage：执行singleMessage相关逻辑。
 * @param playerId 玩家 ID。
 * @param text 参数说明。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新singleMessage相关状态。
 */

    singleMessage(playerId, text, kind = 'info') {
        return {
            affectedPlayerIds: [playerId],
            notices: [{ playerId, text, kind }],
        };
    }
    /**
 * touchAffectedPlayer：执行touchAffected玩家相关逻辑。
 * @param result 返回结果。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新touchAffected玩家相关状态。
 */

    touchAffectedPlayer(result, playerId) {
        if (!result.affectedPlayerIds.includes(playerId)) {
            result.affectedPlayerIds.push(playerId);
        }
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
        result.notices.push({ playerId, text, kind });
        this.touchAffectedPlayer(result, playerId);
    }
    /** 推送市场结构化通知，text 只作为旧客户端兜底。 */
    pushStructuredNotice(result, playerId, kind, key, text, opts) {
        const notice = buildStructuredNotice(kind, key, text, opts);
        result.notices.push({ playerId, text: notice.text, kind: notice.kind, structured: notice.structured });
        this.touchAffectedPlayer(result, playerId);
    }
    /**
 * markOrderDirty：处理订单Dirty并更新相关状态。
 * @param orderId order ID。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新订单Dirty相关状态。
 */

    markOrderDirty(orderId, context) {
        context.dirtyOrderIds.add(orderId);
        context.deletedOrderIds.delete(orderId);
    }
    /**
 * deleteOrder：处理订单并更新相关状态。
 * @param orderId order ID。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新订单相关状态。
 */

    deleteOrder(orderId, context) {
        context.deletedOrderIds.add(orderId);
        context.dirtyOrderIds.delete(orderId);
    }
    /**
 * compactOpenOrders：执行compactOpen订单相关逻辑。
 * @returns 无返回值，直接更新compactOpen订单相关状态。
 */

    compactOpenOrders() {
        this.openOrders = this.openOrders.filter((order) => order.status === 'open' && order.remainingQuantity > 0);
        const activeAuctionItemKeys = new Set(this.openOrders
            .filter((order) => this.isAuctionOrder(order) && order.side === 'sell' && this.canTradeItemOnMarket(order.item))
            .map((order) => this.buildAuctionLotKey(order)));
        for (const itemKey of Array.from(this.auctionBidsByItemKey.keys())) {
            if (!activeAuctionItemKeys.has(itemKey)) {
                this.auctionBidsByItemKey.delete(itemKey);
            }
        }
        for (const itemKey of Array.from(this.auctionTimingByItemKey.keys())) {
            if (!activeAuctionItemKeys.has(itemKey)) {
                this.auctionTimingByItemKey.delete(itemKey);
            }
        }
        this.rebuildAuctionClientKeyIndex();
    }
    /** 重建 clientKey → lotKey 索引。 */
    rebuildAuctionClientKeyIndex() {
        this.auctionClientKeyToLotKey.clear();
        for (const order of this.openOrders) {
            if (!this.isAuctionOrder(order) || order.side !== 'sell') {
                continue;
            }
            const lotKey = this.buildAuctionLotKey(order);
            const clientKey = this.buildClientAuctionLotKey(lotKey);
            if (clientKey && lotKey) {
                this.auctionClientKeyToLotKey.set(clientKey, lotKey);
            }
        }
    }
    /**
 * captureOnlinePlayerState：执行captureOnline玩家状态相关逻辑。
 * @param playerId 玩家 ID。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新captureOnline玩家状态相关状态。
 */

    captureOnlinePlayerState(playerId, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (context.onlinePlayerSnapshots.has(playerId)) {
            return;
        }

        const snapshot = this.playerRuntimeService.snapshot(playerId);
        if (!snapshot) {
            return;
        }
        context.onlinePlayerSnapshots.set(playerId, snapshot);
    }
    /**
 * getStorage：读取Storage。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成Storage的读取/组装。
 */

    getStorage(playerId) {
        return cloneStorage(this.storageByPlayerId.get(playerId));
    }
    /**
 * getCurrencyItemName：读取Currency道具名称。
 * @returns 无返回值，完成Currency道具名称的读取/组装。
 */

    getCurrencyItemName() {
        return this.contentTemplateRepository.getItemName(MARKET_CURRENCY_ITEM_ID) ?? '灵石';
    }
    /**
 * buildClaimStoragePlan：构建领取托管仓的目标背包与剩余仓库。
 * @param inventorySnapshot 背包快照。
 * @param storageItems 托管仓条目。
 * @returns 领取计划。
 */

    buildClaimStoragePlan(inventorySnapshot, storageItems) {
        const nextInventoryItems = Array.isArray(inventorySnapshot?.items)
            ? inventorySnapshot.items.map((entry) => ({ ...entry }))
            : [];
        const capacity = Number.isFinite(inventorySnapshot?.capacity)
            ? Math.max(0, Math.trunc(Number(inventorySnapshot.capacity)))
            : nextInventoryItems.length;
        const remainingItems = [];
        let movedCount = 0;
        for (const item of Array.isArray(storageItems) ? storageItems : []) {
            const normalized = this.contentTemplateRepository.normalizeItem(item);
            if (!normalized) {
                continue;
            }
            const existing = nextInventoryItems.find((entry) => createItemStackSignature(entry) === createItemStackSignature(normalized));
            if (existing) {
                existing.count += normalized.count;
                movedCount += normalized.count;
                continue;
            }
            if (nextInventoryItems.length < capacity) {
                nextInventoryItems.push({ ...normalized });
                movedCount += normalized.count;
                continue;
            }
            remainingItems.push({ ...normalized });
        }
        return {
            nextInventoryItems,
            remainingItems,
            movedCount,
        };
    }
    /**
 * createMutationContext：构建并返回目标对象。
 * @returns 无返回值，直接更新Mutation上下文相关状态。
 */

    createMutationContext() {
        return {
            openOrdersSnapshot: this.openOrders.map((entry) => ({
                ...entry,
                item: { ...entry.item },
                auction: entry.auction ? this.normalizeAuctionOrderState(entry.auction) : undefined,
            })),
            auctionBidsSnapshotByItemKey: cloneAuctionBidsMap(this.auctionBidsByItemKey),
            auctionTimingSnapshotByItemKey: cloneAuctionTimingMap(this.auctionTimingByItemKey),
            storageSnapshotByPlayerId: new Map(),
            onlinePlayerSnapshots: new Map(),
            dirtyOrderIds: new Set(),
            deletedOrderIds: new Set(),
            dirtyStoragePlayerIds: new Set(),
            newTradeRecords: [],
            skipPersistence: false,
        };
    }
    /**
 * restoreMutationContext：执行restoreMutation上下文相关逻辑。
 * @param context 上下文信息。
 * @returns 无返回值，直接更新restoreMutation上下文相关状态。
 */

    restoreMutationContext(context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.openOrders = context.openOrdersSnapshot.map((entry) => ({
            ...entry,
            item: { ...entry.item },
            auction: entry.auction ? this.normalizeAuctionOrderState(entry.auction) : undefined,
        }));
        this.auctionBidsByItemKey = cloneAuctionBidsMap(context.auctionBidsSnapshotByItemKey);
        this.auctionTimingByItemKey = cloneAuctionTimingMap(context.auctionTimingSnapshotByItemKey);
        for (const [playerId, storage] of context.storageSnapshotByPlayerId.entries()) {
            if (storage.items.length > 0) {
                this.storageByPlayerId.set(playerId, cloneStorage(storage));
            }
            else {
                this.storageByPlayerId.delete(playerId);
            }
        }
        for (const snapshot of context.onlinePlayerSnapshots.values()) {
            this.playerRuntimeService.restoreSnapshot(snapshot);
        }
    }
    /**
 * runExclusiveMarketMutation：处理runExclusive坊市Mutation并更新相关状态。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @returns 无返回值，直接更新runExclusive坊市Mutation相关状态。
 */

    async runExclusiveMarketMutation(playerId, action) {
        return this.runExclusive(async () => {

            const context = this.createMutationContext();
            try {

                const result = await action(context);
                if (context.newTradeRecords.length > 0 && result && typeof result === 'object') {
                    result.tradeHistoryPlayerIds = Array.from(new Set(context.newTradeRecords.flatMap((entry) => [entry.buyerId, entry.sellerId])));
                }
                if (!context.skipPersistence) {
                    await this.marketPersistenceService.persistMutation({
                        upsertOrders: this.openOrders
                            .filter((order) => context.dirtyOrderIds.has(order.id))
                            .map((order) => ({
                            ...order,
                            item: { ...order.item },
                        })),
                        deleteOrderIds: Array.from(context.deletedOrderIds),
                        upsertStorages: Array.from(context.dirtyStoragePlayerIds, (playerKey) => {

                            const storage = this.storageByPlayerId.get(playerKey);
                            return storage
                                ? { playerId: playerKey, storage: cloneStorage(storage) }
                                : null;
                        }).filter((entry) => Boolean(entry)),
                        deleteStoragePlayerIds: Array.from(context.dirtyStoragePlayerIds).filter((playerKey) => !this.storageByPlayerId.has(playerKey)),
                        tradeRecords: context.newTradeRecords.map((entry) => ({ ...entry })),
                    });
                }
                if (context.newTradeRecords.length > 0) {
                    this.tradeHistory.unshift(...context.newTradeRecords.map((entry) => ({ ...entry })));
                    this.tradeHistory.sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
                }
                return result;
            }
            catch (error) {
                this.restoreMutationContext(context);

                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`坊市结算失败，已回滚: ${message}`);
                return this.singleMessage(playerId, '坊市结算失败，已回滚本次操作。', 'warn');
            }
        });
    }
    /**
 * runExclusive：执行runExclusive相关逻辑。
 * @param action 参数说明。
 * @returns 无返回值，直接更新runExclusive相关状态。
 */

    async runExclusive(action) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const previous = this.marketOperationQueue;

        let release;
        this.marketOperationQueue = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await action();
        }
        finally {
            release();
        }
    }
}
/**
 * cloneStorage：构建Storage。
 * @param storage 参数说明。
 * @returns 无返回值，直接更新Storage相关状态。
 */

function cloneStorage(storage) {
    return {
        items: (storage?.items ?? []).map((item) => ({ ...item })),
    };
}

function cloneAuctionBidsMap(source) {
    const next = new Map();
    for (const [itemKey, bids] of source.entries()) {
        next.set(itemKey, Array.isArray(bids) ? bids.map((entry) => ({ ...entry })) : []);
    }
    return next;
}

function cloneAuctionTimingMap(source) {
    const next = new Map();
    for (const [itemKey, timing] of source.entries()) {
        next.set(itemKey, { ...timing });
    }
    return next;
}

function cloneInventoryItems(items) {
    return Array.isArray(items)
        ? items.map((item) => ({ ...item }))
        : [];
}

function applyMarketSellNowToInventory(existingItems, item, quantity) {
    const nextItems = cloneInventoryItems(existingItems);
    const normalizedQuantity = Math.max(1, Math.trunc(Number(quantity ?? 0)));
    if (!item || normalizedQuantity <= 0) {
        return nextItems;
    }
    const mergeTarget = { ...item, count: normalizedQuantity };
    const signature = createItemStackSignature(mergeTarget);
    const existing = nextItems.find((entry) => createItemStackSignature(entry) === signature);
    if (existing) {
        existing.count += normalizedQuantity;
        return nextItems;
    }
    nextItems.push(mergeTarget);
    return nextItems;
}

function applyMarketSellNowToWalletBalances(existingBalances, walletType, amount) {
    const normalizedWalletType = typeof walletType === 'string' ? walletType.trim() : '';
    const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
    if (!normalizedWalletType || normalizedAmount <= 0) {
        return null;
    }
    const balances = Array.isArray(existingBalances)
        ? existingBalances.map((entry) => ({
            walletType: typeof entry?.walletType === 'string' ? entry.walletType.trim() : '',
            balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
            frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
            version: Math.max(0, Math.trunc(Number(entry?.version ?? 0))),
        })).filter((entry) => entry.walletType)
        : [];
    const entry = balances.find((row) => row.walletType === normalizedWalletType);
    if (!entry) {
        balances.push({
            walletType: normalizedWalletType,
            balance: normalizedAmount,
            frozenBalance: 0,
            version: 1,
        });
        return balances;
    }
    entry.balance += normalizedAmount;
    entry.version += 1;
    return balances;
}

function cloneWalletBalances(existingBalances) {
    return Array.isArray(existingBalances)
        ? existingBalances.map((entry) => ({
            walletType: typeof entry?.walletType === 'string' ? entry.walletType.trim() : '',
            balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
            frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
            version: Math.max(0, Math.trunc(Number(entry?.version ?? 0))),
        })).filter((entry) => entry.walletType)
        : [];
}

function applyMarketBuyNowToSellerInventory(existingItems, item, quantity) {
    const nextItems = cloneInventoryItems(existingItems);
    const normalizedQuantity = Math.max(1, Math.trunc(Number(quantity ?? 0)));
    if (!item || normalizedQuantity <= 0) {
        return null;
    }
    const signature = createItemStackSignature(item);
    const existing = nextItems.find((entry) => createItemStackSignature(entry) === signature);
    if (!existing || Number(existing.count ?? 0) < normalizedQuantity) {
        return null;
    }
    existing.count = Number(existing.count ?? 0) - normalizedQuantity;
    if (existing.count <= 0) {
        const index = nextItems.indexOf(existing);
        if (index >= 0) {
            nextItems.splice(index, 1);
        }
    }
    return nextItems;
}

function applyMarketBuyNowToBuyerWalletBalances(existingBalances, walletType, amount) {
    const normalizedWalletType = typeof walletType === 'string' ? walletType.trim() : '';
    const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
    if (!normalizedWalletType || normalizedAmount <= 0) {
        return null;
    }
    const balances = cloneWalletBalances(existingBalances);
    const entry = balances.find((row) => row.walletType === normalizedWalletType);
    if (!entry || entry.balance < normalizedAmount) {
        return null;
    }
    entry.balance -= normalizedAmount;
    entry.version += 1;
    return balances;
}
