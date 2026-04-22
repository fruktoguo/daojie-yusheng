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

var MarketRuntimeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketRuntimeService = void 0;

const common_1 = require("@nestjs/common");

const crypto_1 = require("crypto");

const shared_1 = require("@mud/shared");

const content_template_repository_1 = require("../../content/content-template.repository");

const market_1 = require("../../constants/gameplay/market");

const market_persistence_service_1 = require("../../persistence/market-persistence.service");

const player_runtime_service_1 = require("../player/player-runtime.service");

/** 坊市运行时：维护挂单、成交、仓库与交易历史。 */
let MarketRuntimeService = MarketRuntimeService_1 = class MarketRuntimeService {
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
    /** 运行时日志器，记录加载、撮合与持久化异常。 */
    logger = new common_1.Logger(MarketRuntimeService_1.name);
    /** 当前仍然有效的求购/出售挂单。 */
    openOrders = [];
    /** 最近成交记录，用于交易历史面板。 */
    tradeHistory = [];
    /** 每个玩家的坊市仓库缓存。 */
    storageByPlayerId = new Map();
    /** 串行化坊市写操作，避免并发修改同一份内存状态。 */
    marketOperationQueue = Promise.resolve();
    /** 注入内容、玩家与坊市持久化服务。 */
    constructor(contentTemplateRepository, playerRuntimeService, marketPersistenceService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.marketPersistenceService = marketPersistenceService;
    }
    /** 模块初始化时从持久化回填挂单、成交历史和仓库。 */
    async onModuleInit() {
        await this.reloadFromPersistence();
    }
    /** 重新加载坊市快照，通常用于启动或 GM 恢复后重建内存态。 */
    async reloadFromPersistence() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.openOrders = await this.marketPersistenceService.loadOpenOrders();
        this.tradeHistory = await this.marketPersistenceService.loadTradeHistory();
        this.storageByPlayerId.clear();
        for (const entry of await this.marketPersistenceService.loadStorages()) {
            this.storageByPlayerId.set(entry.playerId, cloneStorage(entry.storage));
        }
        this.compactOpenOrders();
    }
    /** 生成玩家进入坊市时需要的总览数据。 */
    buildMarketUpdate(playerId) {
        return {
            currencyItemId: market_1.MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            listedItems: this.buildListedItems(),
            myOrders: this.buildOwnOrders(playerId),
            storage: this.getStorage(playerId),
        };
    }
    /** 构造分页坊市列表，支持品类、部位和功法书分类过滤。 */
    buildMarketListingsPage(payload) {

        const page = Number.isFinite(payload?.page) ? Math.max(1, Math.trunc(payload.page)) : 1;

        const pageSize = Number.isFinite(payload?.pageSize) ? Math.max(1, Math.trunc(payload.pageSize)) : 20;

        const category = typeof payload?.category === 'string' ? payload.category : 'all';

        const equipmentSlot = typeof payload?.equipmentSlot === 'string' ? payload.equipmentSlot : 'all';

        const techniqueCategory = typeof payload?.techniqueCategory === 'string' ? payload.techniqueCategory : 'all';

        const filtered = this.buildMarketListingEntries().filter((entry) => {
            if (category !== 'all' && entry.item.type !== category) {
                return false;
            }
            if (equipmentSlot !== 'all' && entry.item.equipSlot !== equipmentSlot) {
                return false;
            }
            if (techniqueCategory !== 'all' && entry.item.type !== 'skill_book') {
                return false;
            }
            return true;
        });

        const total = filtered.length;

        const start = (page - 1) * pageSize;
        return {
            currencyItemId: market_1.MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            page,
            pageSize,
            total,
            category,
            equipmentSlot,
            techniqueCategory,
            items: filtered.slice(start, start + pageSize),
        };
    }
    /** 构造玩家自己的挂单列表。 */
    buildMarketOrders(playerId) {
        return {
            currencyItemId: market_1.MARKET_CURRENCY_ITEM_ID,
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

        const normalizedItemKey = String(itemKey ?? '').trim();
        return {
            currencyItemId: market_1.MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            itemKey: normalizedItemKey,
            book: this.buildItemBookView(normalizedItemKey),
        };
    }
    /** 构造玩家自己的成交历史分页。 */
    buildTradeHistoryPage(playerId, page) {

        const visibleRecords = this.tradeHistory
            .filter((entry) => entry.buyerId === playerId || entry.sellerId === playerId)
            .slice(0, market_1.MARKET_TRADE_HISTORY_VISIBLE_LIMIT);

        const totalVisible = visibleRecords.length;

        const totalPages = Math.max(1, Math.ceil(totalVisible / market_1.MARKET_TRADE_HISTORY_PAGE_SIZE));

        const normalizedPage = Math.max(1, Math.min(totalPages, Math.trunc(Number.isFinite(page) ? page : 1)));

        const start = (normalizedPage - 1) * market_1.MARKET_TRADE_HISTORY_PAGE_SIZE;
        return {
            page: normalizedPage,
            pageSize: market_1.MARKET_TRADE_HISTORY_PAGE_SIZE,
            totalVisible,
            records: visibleRecords
                .slice(start, start + market_1.MARKET_TRADE_HISTORY_PAGE_SIZE)
                .map((entry) => this.toTradeHistoryView(playerId, entry)),
        };
    }
    /** 发起出售挂单，必要时直接撮合买单。 */
    async createSellOrder(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const item = this.playerRuntimeService.peekInventoryItem(playerId, payload.slotIndex);
            if (!item) {
                return this.singleMessage(playerId, '要挂售的物品不存在。');
            }

            const quantity = this.normalizeQuantity(payload.quantity);

            const unitPrice = this.normalizeUnitPrice(payload.unitPrice);
            if (!quantity || !unitPrice) {
                return this.singleMessage(playerId, '挂售数量或单价无效。');
            }
            if (!(0, shared_1.isValidMarketTradeQuantity)(unitPrice, quantity)) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(unitPrice));
            }
            if (item.count < quantity) {
                return this.singleMessage(playerId, '挂售数量超过了当前持有数量。');
            }
            if (!this.canTradeItemOnMarket(item)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}是坊市货币，不能挂售。`);
            }

            const orderItem = this.toOrderItem(item);

            const itemKey = this.buildItemKey(orderItem);
            if (this.hasConflictingOpenOrder(playerId, itemKey, 'sell')) {
                return this.singleMessage(playerId, '同一种物品已在求购中，不能同时挂售。');
            }
            this.captureOnlinePlayerState(playerId, context);

            const removed = this.playerRuntimeService.splitInventoryItem(playerId, payload.slotIndex, quantity);

            const result = this.createEmptyResult(playerId);

            const buyOrders = this.getSortedOrders(itemKey, 'buy').filter((order) => order.ownerId !== playerId && order.unitPrice >= unitPrice);

            const matchPlan = this.planOrderMatches(buyOrders, removed.count, unitPrice);

            let remaining = matchPlan.remainingQuantity;
            for (const match of matchPlan.matches) {
                const buyOrder = match.order;
                const tradeQuantity = match.quantity;

                const tradePrice = buyOrder.unitPrice;
                this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverItemToPlayer(playerId, this.createCurrencyItem(match.totalCost), context);
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
                    id: (0, crypto_1.randomUUID)(),
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
                this.markOrderDirty(order.id, context);
                this.pushNotice(result, playerId, `已挂售 ${orderItem.name} x${remaining}，单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}。`, 'success');
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
            if (!(0, shared_1.isValidMarketTradeQuantity)(unitPrice, quantity)) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(unitPrice));
            }

            const orderItem = this.toOrderItem(item);

            const itemKey = this.buildItemKey(orderItem);
            if (this.hasConflictingOpenOrder(playerId, itemKey, 'buy')) {
                return this.singleMessage(playerId, '同一种物品已在挂售中，不能同时求购。');
            }

            const totalCost = (0, shared_1.calculateMarketTradeTotalCost)(quantity, unitPrice);
            if (totalCost === null) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(unitPrice));
            }
            if (this.playerRuntimeService.getInventoryCountByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID) < totalCost) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法挂出求购。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.consumeInventoryItemByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID, totalCost);

            const result = this.createEmptyResult(playerId);

            const sellOrders = this.getSortedOrders(itemKey, 'sell').filter((order) => order.ownerId !== playerId && order.unitPrice <= unitPrice);

            const matchPlan = this.planOrderMatches(sellOrders, quantity, unitPrice);

            let remaining = matchPlan.remainingQuantity;
            for (const match of matchPlan.matches) {
                const sellOrder = match.order;
                const tradeQuantity = match.quantity;

                const tradePrice = sellOrder.unitPrice;
                this.deliverItemToPlayer(playerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverItemToPlayer(sellOrder.ownerId, this.createCurrencyItem(match.totalCost), context);
                this.recordTrade({
                    buyerId: playerId,
                    sellerId: sellOrder.ownerId,
                    itemId: orderItem.itemId,
                    quantity: tradeQuantity,
                    unitPrice: tradePrice,
                }, context);

                const reservedCost = (0, shared_1.calculateMarketTradeTotalCost)(tradeQuantity, unitPrice) ?? match.totalCost;

                const refund = Math.max(0, reservedCost - match.totalCost);
                if (refund > 0) {
                    this.deliverItemToPlayer(playerId, this.createCurrencyItem(refund), context);
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
                    id: (0, crypto_1.randomUUID)(),
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

            const sells = this.getSortedOrders(String(payload.itemKey ?? '').trim(), 'sell').filter((order) => order.ownerId !== playerId);
            if (sells.length === 0) {
                return this.singleMessage(playerId, '当前没有可买入的挂售。');
            }

            const plan = this.planOrderMatches(sells, quantity);
            if (plan.fulfilledQuantity < quantity) {
                return this.singleMessage(playerId, `当前最多只能买到 ${plan.fulfilledQuantity} 件。`);
            }

            const totalCost = plan.totalCost;
            if (this.playerRuntimeService.getInventoryCountByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID) < totalCost) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法完成买入。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.consumeInventoryItemByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID, totalCost);

            const result = this.createEmptyResult(playerId);

            const item = { ...sells[0].item };
            for (const match of plan.matches) {
                const sellOrder = match.order;
                const tradeQuantity = match.quantity;
                this.deliverItemToPlayer(playerId, { ...item, count: tradeQuantity }, context);
                this.deliverItemToPlayer(sellOrder.ownerId, this.createCurrencyItem(match.totalCost), context);
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

            const plan = this.planOrderMatches(buys, quantity);
            if (plan.fulfilledQuantity < quantity) {
                return this.singleMessage(playerId, `当前求购盘最多只能接下 ${plan.fulfilledQuantity} 件。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.splitInventoryItem(playerId, payload.slotIndex, quantity);

            const result = this.createEmptyResult(playerId);

            const totalIncome = plan.totalCost;
            for (const match of plan.matches) {
                const buyOrder = match.order;
                const tradeQuantity = match.quantity;
                this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverItemToPlayer(playerId, this.createCurrencyItem(match.totalCost), context);
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
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const orderId = String(payload.orderId ?? '').trim();

            const order = this.openOrders.find((entry) => entry.id === orderId && entry.ownerId === playerId);
            if (!order) {
                return this.singleMessage(playerId, '未找到可取消的订单。');
            }
            if (order.side === 'sell') {
                this.deliverItemToPlayer(playerId, { ...order.item, count: order.remainingQuantity }, context);
            }
            else {

                const refund = (0, shared_1.calculateMarketTradeTotalCost)(order.remainingQuantity, order.unitPrice);
                if (refund) {
                    this.deliverItemToPlayer(playerId, this.createCurrencyItem(refund), context);
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
        return this.runExclusiveMarketMutation(playerId, async (context) => {

            const storage = this.storageByPlayerId.get(playerId);
            if (!storage || storage.items.length === 0) {
                return this.singleMessage(playerId, '坊市托管仓里暂时没有可领取的物品。');
            }
            this.captureOnlinePlayerState(playerId, context);

            const nextItems = [];

            let movedCount = 0;
            for (const item of storage.items) {
                if (this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
                    this.playerRuntimeService.receiveInventoryItem(playerId, item);
                    movedCount += item.count;
                    continue;
                }
                nextItems.push({ ...item });
            }
            this.setStorage(playerId, { items: nextItems }, context);
            if (movedCount <= 0) {
                return this.singleMessage(playerId, '背包空间不足，托管仓物品暂时无法领取。');
            }
            if (nextItems.length > 0) {
                return this.singleMessage(playerId, `已领取部分托管物，共 ${movedCount} 件，其余仍保留在坊市托管仓。`, 'loot');
            }
            return this.singleMessage(playerId, `已领取坊市托管仓中的全部物品，共 ${movedCount} 件。`, 'loot');
        });
    }    
    /**
 * buildListedItems：构建并返回目标对象。
 * @returns 无返回值，直接更新Listed道具相关状态。
 */

    buildListedItems() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const grouped = new Map();
        for (const order of this.openOrders) {
            if (order.remainingQuantity <= 0 || order.status !== 'open' || !this.canTradeItemOnMarket(order.item)) {
                continue;
            }

            const current = grouped.get(order.itemKey) ?? {
                item: { ...order.item },
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
            grouped.set(order.itemKey, current);
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


        const grouped = new Map();
        for (const order of this.openOrders) {
            if (order.remainingQuantity <= 0 || order.status !== 'open' || !this.canTradeItemOnMarket(order.item)) {
                continue;
            }

            const current = grouped.get(order.itemKey) ?? {
                item: { ...order.item },
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
            grouped.set(order.itemKey, current);
        }
        return Array.from(grouped.entries())
            .map(([itemKey, entry]) => ({
            itemKey,
            itemId: entry.item.itemId,
            item: { ...entry.item },
            lowestSellPrice: entry.lowestSellPrice,
            highestBuyPrice: entry.highestBuyPrice,
            canEnhance: Boolean(entry.item.equipSlot),
            variants: [{
                    itemKey,
                    item: { ...entry.item },
                    lowestSellPrice: entry.lowestSellPrice,
                    highestBuyPrice: entry.highestBuyPrice,
                    sellOrderCount: entry.sellOrderCount,
                    sellQuantity: entry.sellQuantity,
                    buyOrderCount: entry.buyOrderCount,
                    buyQuantity: entry.buyQuantity,
                }],
        }))
            .sort((left, right) => left.item.name.localeCompare(right.item.name, 'zh-Hans-CN'));
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
            itemKey: order.itemKey,
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


        const normalizedItemKey = itemKey.trim();
        if (!normalizedItemKey) {
            return null;
        }

        const orders = this.openOrders.filter((order) => order.status === 'open' && order.remainingQuantity > 0 && order.itemKey === normalizedItemKey);
        if (orders.length === 0) {
            return null;
        }
        return {
            itemKey: normalizedItemKey,
            item: { ...orders[0].item },
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
            if (order.status !== 'open' || order.remainingQuantity <= 0 || order.side !== side || order.itemKey !== itemKey) {
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
            .filter((order) => order.status === 'open' && order.remainingQuantity > 0 && order.side === side && order.itemKey === itemKey)
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
            && order.itemKey === itemKey
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

            const tradeTotal = (0, shared_1.calculateMarketTradeTotalCost)(traded, order.unitPrice);
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
            if (!unitPrice || !(0, shared_1.isValidMarketPrice)(unitPrice)) {
                continue;
            }
            quantityStep = this.leastCommonMultiple(quantityStep, (0, shared_1.getMarketMinimumTradeQuantity)(unitPrice));
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
        return (0, shared_1.createItemStackSignature)({
            ...item,
            count: 1,
        });
    }    
    /**
 * resolveMarketItemForBuy：规范化或转换坊市道具ForBuy。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新坊市道具ForBuy相关状态。
 */

    resolveMarketItemForBuy(payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const itemKey = typeof payload?.itemKey === 'string' ? payload.itemKey.trim() : '';
        if (itemKey) {

            const orderItem = this.openOrders.find((entry) => entry.itemKey === itemKey)?.item;
            if (orderItem) {
                return { ...orderItem, count: 1 };
            }
        }

        const itemId = typeof payload?.itemId === 'string' ? payload.itemId.trim() : '';
        return itemId ? this.contentTemplateRepository.createItem(itemId, 1) : null;
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


        const item = this.contentTemplateRepository.createItem(market_1.MARKET_CURRENCY_ITEM_ID, count);
        if (item) {
            return this.toFullItem({
                ...item,
                count,
            });
        }
        return {
            itemId: market_1.MARKET_CURRENCY_ITEM_ID,
            name: this.getCurrencyItemName(),
            type: 'consumable',
            count,
            desc: '坊市通行货币。',
        };
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
            effects: normalized.effects,
            healAmount: normalized.healAmount,
            healPercent: normalized.healPercent,
            qiPercent: normalized.qiPercent,
            consumeBuffs: normalized.consumeBuffs,
            tags: normalized.tags,
            mapUnlockId: normalized.mapUnlockId,
            mapUnlockIds: Array.isArray(normalized.mapUnlockIds) ? normalized.mapUnlockIds.slice() : undefined,
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
        return item.itemId !== market_1.MARKET_CURRENCY_ITEM_ID;
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
        if (quantity <= 0 || quantity > market_1.MARKET_MAX_ORDER_QUANTITY) {
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
        if (unitPrice <= 0 || unitPrice > shared_1.MARKET_MAX_UNIT_PRICE || !(0, shared_1.isValidMarketPrice)(unitPrice)) {
            return null;
        }
        return unitPrice;
    }    
    /**
 * buildTradeQuantityError：构建并返回目标对象。
 * @param unitPrice 参数说明。
 * @returns 无返回值，直接更新TradeQuantityError相关状态。
 */

    buildTradeQuantityError(unitPrice) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const minimumQuantity = (0, shared_1.getMarketMinimumTradeQuantity)(unitPrice);
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

        const signature = (0, shared_1.createItemStackSignature)(item);

        const existing = next.items.find((entry) => (0, shared_1.createItemStackSignature)(entry) === signature);
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
            id: (0, crypto_1.randomUUID)(),
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
        return this.contentTemplateRepository.getItemName(market_1.MARKET_CURRENCY_ITEM_ID) ?? '灵石';
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
            })),
            storageSnapshotByPlayerId: new Map(),
            onlinePlayerSnapshots: new Map(),
            dirtyOrderIds: new Set(),
            deletedOrderIds: new Set(),
            dirtyStoragePlayerIds: new Set(),
            newTradeRecords: [],
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
        }));
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
};
exports.MarketRuntimeService = MarketRuntimeService;
exports.MarketRuntimeService = MarketRuntimeService = MarketRuntimeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService,
        market_persistence_service_1.MarketPersistenceService])
], MarketRuntimeService);
export { MarketRuntimeService };
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
