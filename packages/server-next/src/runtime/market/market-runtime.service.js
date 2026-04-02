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
const shared_1 = require("@mud/shared-next");
const content_template_repository_1 = require("../../content/content-template.repository");
const market_1 = require("../../constants/gameplay/market");
const market_persistence_service_1 = require("../../persistence/market-persistence.service");
const player_runtime_service_1 = require("../player/player-runtime.service");
let MarketRuntimeService = MarketRuntimeService_1 = class MarketRuntimeService {
    contentTemplateRepository;
    playerRuntimeService;
    marketPersistenceService;
    logger = new common_1.Logger(MarketRuntimeService_1.name);
    openOrders = [];
    tradeHistory = [];
    storageByPlayerId = new Map();
    marketOperationQueue = Promise.resolve();
    constructor(contentTemplateRepository, playerRuntimeService, marketPersistenceService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.marketPersistenceService = marketPersistenceService;
    }
    async onModuleInit() {
        await this.reloadFromPersistence();
    }
    async reloadFromPersistence() {
        this.openOrders = await this.marketPersistenceService.loadOpenOrders();
        this.tradeHistory = await this.marketPersistenceService.loadTradeHistory();
        this.storageByPlayerId.clear();
        for (const entry of await this.marketPersistenceService.loadStorages()) {
            this.storageByPlayerId.set(entry.playerId, cloneStorage(entry.storage));
        }
        this.compactOpenOrders();
    }
    buildMarketUpdate(playerId) {
        return {
            currencyItemId: market_1.MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            listedItems: this.buildListedItems(),
            myOrders: this.buildOwnOrders(playerId),
            storage: this.getStorage(playerId),
        };
    }
    buildItemBook(itemKey) {
        const normalizedItemKey = String(itemKey ?? '').trim();
        return {
            currencyItemId: market_1.MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            itemKey: normalizedItemKey,
            book: this.buildItemBookView(normalizedItemKey),
        };
    }
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
            let remaining = removed.count;
            const buyOrders = this.getSortedOrders(itemKey, 'buy').filter((order) => order.ownerId !== playerId && order.unitPrice >= unitPrice);
            for (const buyOrder of buyOrders) {
                if (remaining <= 0) {
                    break;
                }
                const tradeQuantity = Math.min(remaining, buyOrder.remainingQuantity);
                if (tradeQuantity <= 0) {
                    continue;
                }
                const tradePrice = buyOrder.unitPrice;
                this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverItemToPlayer(playerId, this.createCurrencyItem(tradeQuantity * tradePrice), context);
                this.recordTrade({
                    buyerId: buyOrder.ownerId,
                    sellerId: playerId,
                    itemId: orderItem.itemId,
                    quantity: tradeQuantity,
                    unitPrice: tradePrice,
                }, context);
                remaining -= tradeQuantity;
                buyOrder.remainingQuantity -= tradeQuantity;
                buyOrder.updatedAt = Date.now();
                this.markOrderDirty(buyOrder.id, context);
                this.touchAffectedPlayer(result, buyOrder.ownerId);
                this.pushNotice(result, buyOrder.ownerId, `你的求购已成交：${orderItem.name} x${tradeQuantity}。`, 'loot');
                this.pushNotice(result, playerId, `你卖出了 ${orderItem.name} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${tradeQuantity * tradePrice}。`, 'loot');
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
                this.pushNotice(result, playerId, `已挂售 ${orderItem.name} x${remaining}，单价 ${unitPrice} ${this.getCurrencyItemName()}。`, 'success');
            }
            this.compactOpenOrders();
            return result;
        });
    }
    async createBuyOrder(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {
            const item = this.contentTemplateRepository.createItem(payload.itemId, 1);
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
            const orderItem = this.toOrderItem(item);
            const itemKey = this.buildItemKey(orderItem);
            if (this.hasConflictingOpenOrder(playerId, itemKey, 'buy')) {
                return this.singleMessage(playerId, '同一种物品已在挂售中，不能同时求购。');
            }
            const totalCost = quantity * unitPrice;
            if (this.playerRuntimeService.getInventoryCountByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID) < totalCost) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法挂出求购。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.consumeInventoryItemByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID, totalCost);
            const result = this.createEmptyResult(playerId);
            let remaining = quantity;
            const sellOrders = this.getSortedOrders(itemKey, 'sell').filter((order) => order.ownerId !== playerId && order.unitPrice <= unitPrice);
            for (const sellOrder of sellOrders) {
                if (remaining <= 0) {
                    break;
                }
                const tradeQuantity = Math.min(remaining, sellOrder.remainingQuantity);
                if (tradeQuantity <= 0) {
                    continue;
                }
                const tradePrice = sellOrder.unitPrice;
                this.deliverItemToPlayer(playerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverItemToPlayer(sellOrder.ownerId, this.createCurrencyItem(tradeQuantity * tradePrice), context);
                this.recordTrade({
                    buyerId: playerId,
                    sellerId: sellOrder.ownerId,
                    itemId: orderItem.itemId,
                    quantity: tradeQuantity,
                    unitPrice: tradePrice,
                }, context);
                const refund = tradeQuantity * Math.max(0, unitPrice - tradePrice);
                if (refund > 0) {
                    this.deliverItemToPlayer(playerId, this.createCurrencyItem(refund), context);
                }
                remaining -= tradeQuantity;
                sellOrder.remainingQuantity -= tradeQuantity;
                sellOrder.updatedAt = Date.now();
                this.markOrderDirty(sellOrder.id, context);
                this.touchAffectedPlayer(result, sellOrder.ownerId);
                this.pushNotice(result, playerId, `你买入了 ${orderItem.name} x${tradeQuantity}，成交价 ${tradePrice}。`, 'loot');
                this.pushNotice(result, sellOrder.ownerId, `你的挂售已成交：${orderItem.name} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${tradeQuantity * tradePrice}。`, 'loot');
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
                this.pushNotice(result, playerId, `已挂出求购 ${orderItem.name} x${remaining}，单价 ${unitPrice} ${this.getCurrencyItemName()}。`, 'success');
            }
            this.compactOpenOrders();
            return result;
        });
    }
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
            const available = sells.reduce((sum, order) => sum + order.remainingQuantity, 0);
            if (available < quantity) {
                return this.singleMessage(playerId, `当前最多只能买到 ${available} 件。`);
            }
            const totalCost = this.calculateImmediateTotalCost(sells, quantity);
            if (this.playerRuntimeService.getInventoryCountByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID) < totalCost) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法完成买入。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.consumeInventoryItemByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID, totalCost);
            const result = this.createEmptyResult(playerId);
            let remaining = quantity;
            const item = { ...sells[0].item };
            for (const sellOrder of sells) {
                if (remaining <= 0) {
                    break;
                }
                const tradeQuantity = Math.min(remaining, sellOrder.remainingQuantity);
                if (tradeQuantity <= 0) {
                    continue;
                }
                this.deliverItemToPlayer(playerId, { ...item, count: tradeQuantity }, context);
                this.deliverItemToPlayer(sellOrder.ownerId, this.createCurrencyItem(tradeQuantity * sellOrder.unitPrice), context);
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
                remaining -= tradeQuantity;
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
            const available = buys.reduce((sum, order) => sum + order.remainingQuantity, 0);
            if (available < quantity) {
                return this.singleMessage(playerId, `当前求购盘最多只能接下 ${available} 件。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.splitInventoryItem(playerId, payload.slotIndex, quantity);
            const result = this.createEmptyResult(playerId);
            let remaining = quantity;
            let totalIncome = 0;
            for (const buyOrder of buys) {
                if (remaining <= 0) {
                    break;
                }
                const tradeQuantity = Math.min(remaining, buyOrder.remainingQuantity);
                if (tradeQuantity <= 0) {
                    continue;
                }
                this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
                this.deliverItemToPlayer(playerId, this.createCurrencyItem(tradeQuantity * buyOrder.unitPrice), context);
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
                remaining -= tradeQuantity;
                totalIncome += tradeQuantity * buyOrder.unitPrice;
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
                this.deliverItemToPlayer(playerId, this.createCurrencyItem(order.remainingQuantity * order.unitPrice), context);
            }
            order.status = 'cancelled';
            order.remainingQuantity = 0;
            order.updatedAt = Date.now();
            this.deleteOrder(order.id, context);
            this.compactOpenOrders();
            return this.singleMessage(playerId, '订单已取消，剩余托管物已退回。', 'success');
        });
    }
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
    buildListedItems() {
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
    buildItemBookView(itemKey) {
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
    buildPriceLevels(itemKey, side) {
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
    hasConflictingOpenOrder(ownerId, itemKey, nextSide) {
        const oppositeSide = nextSide === 'sell' ? 'buy' : 'sell';
        return this.openOrders.some((order) => order.ownerId === ownerId
            && order.itemKey === itemKey
            && order.side === oppositeSide
            && order.status === 'open'
            && order.remainingQuantity > 0);
    }
    calculateImmediateTotalCost(orders, quantity) {
        let remaining = quantity;
        let total = 0;
        for (const order of orders) {
            if (remaining <= 0) {
                break;
            }
            const traded = Math.min(remaining, order.remainingQuantity);
            total += traded * order.unitPrice;
            remaining -= traded;
        }
        return total;
    }
    buildItemKey(item) {
        return (0, shared_1.createItemStackSignature)({
            ...item,
            count: 1,
        });
    }
    toOrderItem(item) {
        const normalized = this.toFullItem(item);
        return {
            ...normalized,
            count: 1,
        };
    }
    createCurrencyItem(count) {
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
            tileAuraGainAmount: normalized.tileAuraGainAmount,
            allowBatchUse: normalized.allowBatchUse,
        };
    }
    canTradeItemOnMarket(item) {
        return item.itemId !== market_1.MARKET_CURRENCY_ITEM_ID;
    }
    normalizeQuantity(value) {
        if (!Number.isFinite(value)) {
            return null;
        }
        const quantity = Math.trunc(value);
        if (quantity <= 0 || quantity > market_1.MARKET_MAX_ORDER_QUANTITY) {
            return null;
        }
        return quantity;
    }
    normalizeUnitPrice(value) {
        if (!Number.isFinite(value) || !Number.isInteger(value)) {
            return null;
        }
        const unitPrice = Math.trunc(value);
        if (unitPrice <= 0 || unitPrice > shared_1.MARKET_MAX_UNIT_PRICE || !(0, shared_1.isValidMarketPrice)(unitPrice)) {
            return null;
        }
        return unitPrice;
    }
    deliverItemToPlayer(playerId, item, context) {
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
    mergeStorageItem(playerId, item, context) {
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
    setStorage(playerId, storage, context) {
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
    createEmptyResult(playerId) {
        return {
            affectedPlayerIds: [playerId],
            notices: [],
        };
    }
    singleMessage(playerId, text, kind = 'info') {
        return {
            affectedPlayerIds: [playerId],
            notices: [{ playerId, text, kind }],
        };
    }
    touchAffectedPlayer(result, playerId) {
        if (!result.affectedPlayerIds.includes(playerId)) {
            result.affectedPlayerIds.push(playerId);
        }
    }
    pushNotice(result, playerId, text, kind = 'info') {
        result.notices.push({ playerId, text, kind });
        this.touchAffectedPlayer(result, playerId);
    }
    markOrderDirty(orderId, context) {
        context.dirtyOrderIds.add(orderId);
        context.deletedOrderIds.delete(orderId);
    }
    deleteOrder(orderId, context) {
        context.deletedOrderIds.add(orderId);
        context.dirtyOrderIds.delete(orderId);
    }
    compactOpenOrders() {
        this.openOrders = this.openOrders.filter((order) => order.status === 'open' && order.remainingQuantity > 0);
    }
    captureOnlinePlayerState(playerId, context) {
        if (context.onlinePlayerSnapshots.has(playerId)) {
            return;
        }
        const snapshot = this.playerRuntimeService.snapshot(playerId);
        if (!snapshot) {
            return;
        }
        context.onlinePlayerSnapshots.set(playerId, snapshot);
    }
    getStorage(playerId) {
        return cloneStorage(this.storageByPlayerId.get(playerId));
    }
    getCurrencyItemName() {
        return this.contentTemplateRepository.getItemName(market_1.MARKET_CURRENCY_ITEM_ID) ?? '灵石';
    }
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
    restoreMutationContext(context) {
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
    async runExclusiveMarketMutation(playerId, action) {
        return this.runExclusive(async () => {
            const context = this.createMutationContext();
            try {
                const result = await action(context);
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
    async runExclusive(action) {
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
function cloneStorage(storage) {
    return {
        items: (storage?.items ?? []).map((item) => ({ ...item })),
    };
}
//# sourceMappingURL=market-runtime.service.js.map
