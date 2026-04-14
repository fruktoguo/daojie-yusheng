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
/** MarketRuntimeService_1：定义该变量以承载业务值。 */
var MarketRuntimeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketRuntimeService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** crypto_1：定义该变量以承载业务值。 */
const crypto_1 = require("crypto");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** content_template_repository_1：定义该变量以承载业务值。 */
const content_template_repository_1 = require("../../content/content-template.repository");
/** market_1：定义该变量以承载业务值。 */
const market_1 = require("../../constants/gameplay/market");
/** market_persistence_service_1：定义该变量以承载业务值。 */
const market_persistence_service_1 = require("../../persistence/market-persistence.service");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../player/player-runtime.service");
/** MarketRuntimeService：定义该变量以承载业务值。 */
let MarketRuntimeService = MarketRuntimeService_1 = class MarketRuntimeService {
    contentTemplateRepository;
    playerRuntimeService;
    marketPersistenceService;
    logger = new common_1.Logger(MarketRuntimeService_1.name);
    openOrders = [];
    tradeHistory = [];
    storageByPlayerId = new Map();
    marketOperationQueue = Promise.resolve();
/** 构造函数：执行实例初始化流程。 */
    constructor(contentTemplateRepository, playerRuntimeService, marketPersistenceService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.marketPersistenceService = marketPersistenceService;
    }
/** onModuleInit：执行对应的业务逻辑。 */
    async onModuleInit() {
        await this.reloadFromPersistence();
    }
/** reloadFromPersistence：执行对应的业务逻辑。 */
    async reloadFromPersistence() {
        this.openOrders = await this.marketPersistenceService.loadOpenOrders();
        this.tradeHistory = await this.marketPersistenceService.loadTradeHistory();
        this.storageByPlayerId.clear();
        for (const entry of await this.marketPersistenceService.loadStorages()) {
            this.storageByPlayerId.set(entry.playerId, cloneStorage(entry.storage));
        }
        this.compactOpenOrders();
    }
/** buildMarketUpdate：执行对应的业务逻辑。 */
    buildMarketUpdate(playerId) {
        return {
            currencyItemId: market_1.MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            listedItems: this.buildListedItems(),
            myOrders: this.buildOwnOrders(playerId),
            storage: this.getStorage(playerId),
        };
    }
/** buildItemBook：执行对应的业务逻辑。 */
    buildItemBook(itemKey) {
/** normalizedItemKey：定义该变量以承载业务值。 */
        const normalizedItemKey = String(itemKey ?? '').trim();
        return {
            currencyItemId: market_1.MARKET_CURRENCY_ITEM_ID,
            currencyItemName: this.getCurrencyItemName(),
            itemKey: normalizedItemKey,
            book: this.buildItemBookView(normalizedItemKey),
        };
    }
/** buildTradeHistoryPage：执行对应的业务逻辑。 */
    buildTradeHistoryPage(playerId, page) {
/** visibleRecords：定义该变量以承载业务值。 */
        const visibleRecords = this.tradeHistory
            .filter((entry) => entry.buyerId === playerId || entry.sellerId === playerId)
            .slice(0, market_1.MARKET_TRADE_HISTORY_VISIBLE_LIMIT);
/** totalVisible：定义该变量以承载业务值。 */
        const totalVisible = visibleRecords.length;
/** totalPages：定义该变量以承载业务值。 */
        const totalPages = Math.max(1, Math.ceil(totalVisible / market_1.MARKET_TRADE_HISTORY_PAGE_SIZE));
/** normalizedPage：定义该变量以承载业务值。 */
        const normalizedPage = Math.max(1, Math.min(totalPages, Math.trunc(Number.isFinite(page) ? page : 1)));
/** start：定义该变量以承载业务值。 */
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
/** createSellOrder：执行对应的业务逻辑。 */
    async createSellOrder(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {
/** item：定义该变量以承载业务值。 */
            const item = this.playerRuntimeService.peekInventoryItem(playerId, payload.slotIndex);
            if (!item) {
                return this.singleMessage(playerId, '要挂售的物品不存在。');
            }
/** quantity：定义该变量以承载业务值。 */
            const quantity = this.normalizeQuantity(payload.quantity);
/** unitPrice：定义该变量以承载业务值。 */
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
/** orderItem：定义该变量以承载业务值。 */
            const orderItem = this.toOrderItem(item);
/** itemKey：定义该变量以承载业务值。 */
            const itemKey = this.buildItemKey(orderItem);
            if (this.hasConflictingOpenOrder(playerId, itemKey, 'sell')) {
                return this.singleMessage(playerId, '同一种物品已在求购中，不能同时挂售。');
            }
            this.captureOnlinePlayerState(playerId, context);
/** removed：定义该变量以承载业务值。 */
            const removed = this.playerRuntimeService.splitInventoryItem(playerId, payload.slotIndex, quantity);
/** result：定义该变量以承载业务值。 */
            const result = this.createEmptyResult(playerId);
/** buyOrders：定义该变量以承载业务值。 */
            const buyOrders = this.getSortedOrders(itemKey, 'buy').filter((order) => order.ownerId !== playerId && order.unitPrice >= unitPrice);
/** matchPlan：定义该变量以承载业务值。 */
            const matchPlan = this.planOrderMatches(buyOrders, removed.count, unitPrice);
/** remaining：定义该变量以承载业务值。 */
            let remaining = matchPlan.remainingQuantity;
            for (const match of matchPlan.matches) {
                const buyOrder = match.order;
                const tradeQuantity = match.quantity;
/** tradePrice：定义该变量以承载业务值。 */
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
/** now：定义该变量以承载业务值。 */
                const now = Date.now();
/** order：定义该变量以承载业务值。 */
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
/** createBuyOrder：执行对应的业务逻辑。 */
    async createBuyOrder(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {
/** item：定义该变量以承载业务值。 */
            const item = this.contentTemplateRepository.createItem(payload.itemId, 1);
            if (!item) {
                return this.singleMessage(playerId, '求购的物品不存在。');
            }
            if (!this.canTradeItemOnMarket(item)) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}是坊市货币，不能求购。`);
            }
/** quantity：定义该变量以承载业务值。 */
            const quantity = this.normalizeQuantity(payload.quantity);
/** unitPrice：定义该变量以承载业务值。 */
            const unitPrice = this.normalizeUnitPrice(payload.unitPrice);
            if (!quantity || !unitPrice) {
                return this.singleMessage(playerId, '求购数量或单价无效。');
            }
            if (!(0, shared_1.isValidMarketTradeQuantity)(unitPrice, quantity)) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(unitPrice));
            }
/** orderItem：定义该变量以承载业务值。 */
            const orderItem = this.toOrderItem(item);
/** itemKey：定义该变量以承载业务值。 */
            const itemKey = this.buildItemKey(orderItem);
            if (this.hasConflictingOpenOrder(playerId, itemKey, 'buy')) {
                return this.singleMessage(playerId, '同一种物品已在挂售中，不能同时求购。');
            }
/** totalCost：定义该变量以承载业务值。 */
            const totalCost = (0, shared_1.calculateMarketTradeTotalCost)(quantity, unitPrice);
            if (totalCost === null) {
                return this.singleMessage(playerId, this.buildTradeQuantityError(unitPrice));
            }
            if (this.playerRuntimeService.getInventoryCountByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID) < totalCost) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法挂出求购。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.consumeInventoryItemByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID, totalCost);
/** result：定义该变量以承载业务值。 */
            const result = this.createEmptyResult(playerId);
/** sellOrders：定义该变量以承载业务值。 */
            const sellOrders = this.getSortedOrders(itemKey, 'sell').filter((order) => order.ownerId !== playerId && order.unitPrice <= unitPrice);
/** matchPlan：定义该变量以承载业务值。 */
            const matchPlan = this.planOrderMatches(sellOrders, quantity, unitPrice);
/** remaining：定义该变量以承载业务值。 */
            let remaining = matchPlan.remainingQuantity;
            for (const match of matchPlan.matches) {
                const sellOrder = match.order;
                const tradeQuantity = match.quantity;
/** tradePrice：定义该变量以承载业务值。 */
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
/** reservedCost：定义该变量以承载业务值。 */
                const reservedCost = (0, shared_1.calculateMarketTradeTotalCost)(tradeQuantity, unitPrice) ?? match.totalCost;
/** refund：定义该变量以承载业务值。 */
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
/** now：定义该变量以承载业务值。 */
                const now = Date.now();
/** order：定义该变量以承载业务值。 */
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
/** buyNow：执行对应的业务逻辑。 */
    async buyNow(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {
/** quantity：定义该变量以承载业务值。 */
            const quantity = this.normalizeQuantity(payload.quantity);
            if (!quantity) {
                return this.singleMessage(playerId, '买入数量无效。');
            }
/** sells：定义该变量以承载业务值。 */
            const sells = this.getSortedOrders(String(payload.itemKey ?? '').trim(), 'sell').filter((order) => order.ownerId !== playerId);
            if (sells.length === 0) {
                return this.singleMessage(playerId, '当前没有可买入的挂售。');
            }
/** plan：定义该变量以承载业务值。 */
            const plan = this.planOrderMatches(sells, quantity);
            if (plan.fulfilledQuantity < quantity) {
                return this.singleMessage(playerId, `当前最多只能买到 ${plan.fulfilledQuantity} 件。`);
            }
/** totalCost：定义该变量以承载业务值。 */
            const totalCost = plan.totalCost;
            if (this.playerRuntimeService.getInventoryCountByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID) < totalCost) {
                return this.singleMessage(playerId, `${this.getCurrencyItemName()}不足，无法完成买入。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.consumeInventoryItemByItemId(playerId, market_1.MARKET_CURRENCY_ITEM_ID, totalCost);
/** result：定义该变量以承载业务值。 */
            const result = this.createEmptyResult(playerId);
/** item：定义该变量以承载业务值。 */
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
/** sellNow：执行对应的业务逻辑。 */
    async sellNow(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {
/** item：定义该变量以承载业务值。 */
            const item = this.playerRuntimeService.peekInventoryItem(playerId, payload.slotIndex);
            if (!item) {
                return this.singleMessage(playerId, '要出售的物品不存在。');
            }
/** quantity：定义该变量以承载业务值。 */
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
/** orderItem：定义该变量以承载业务值。 */
            const orderItem = this.toOrderItem(item);
/** buys：定义该变量以承载业务值。 */
            const buys = this.getSortedOrders(this.buildItemKey(orderItem), 'buy').filter((order) => order.ownerId !== playerId);
            if (buys.length === 0) {
                return this.singleMessage(playerId, '当前没有可直接成交的求购。');
            }
/** plan：定义该变量以承载业务值。 */
            const plan = this.planOrderMatches(buys, quantity);
            if (plan.fulfilledQuantity < quantity) {
                return this.singleMessage(playerId, `当前求购盘最多只能接下 ${plan.fulfilledQuantity} 件。`);
            }
            this.captureOnlinePlayerState(playerId, context);
            this.playerRuntimeService.splitInventoryItem(playerId, payload.slotIndex, quantity);
/** result：定义该变量以承载业务值。 */
            const result = this.createEmptyResult(playerId);
/** totalIncome：定义该变量以承载业务值。 */
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
/** cancelOrder：执行对应的业务逻辑。 */
    async cancelOrder(playerId, payload) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {
/** orderId：定义该变量以承载业务值。 */
            const orderId = String(payload.orderId ?? '').trim();
/** order：定义该变量以承载业务值。 */
            const order = this.openOrders.find((entry) => entry.id === orderId && entry.ownerId === playerId);
            if (!order) {
                return this.singleMessage(playerId, '未找到可取消的订单。');
            }
            if (order.side === 'sell') {
                this.deliverItemToPlayer(playerId, { ...order.item, count: order.remainingQuantity }, context);
            }
            else {
/** refund：定义该变量以承载业务值。 */
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
/** claimStorage：执行对应的业务逻辑。 */
    async claimStorage(playerId) {
        return this.runExclusiveMarketMutation(playerId, async (context) => {
/** storage：定义该变量以承载业务值。 */
            const storage = this.storageByPlayerId.get(playerId);
            if (!storage || storage.items.length === 0) {
                return this.singleMessage(playerId, '坊市托管仓里暂时没有可领取的物品。');
            }
            this.captureOnlinePlayerState(playerId, context);
/** nextItems：定义该变量以承载业务值。 */
            const nextItems = [];
/** movedCount：定义该变量以承载业务值。 */
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
/** buildListedItems：执行对应的业务逻辑。 */
    buildListedItems() {
/** grouped：定义该变量以承载业务值。 */
        const grouped = new Map();
        for (const order of this.openOrders) {
            if (order.remainingQuantity <= 0 || order.status !== 'open' || !this.canTradeItemOnMarket(order.item)) {
                continue;
            }
/** current：定义该变量以承载业务值。 */
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
/** leftLevel：定义该变量以承载业务值。 */
            const leftLevel = this.contentTemplateRepository.getItemSortLevel(left.item);
/** rightLevel：定义该变量以承载业务值。 */
            const rightLevel = this.contentTemplateRepository.getItemSortLevel(right.item);
            if (leftLevel !== rightLevel) {
                return leftLevel - rightLevel;
            }
/** leftHasSell：定义该变量以承载业务值。 */
            const leftHasSell = left.sellQuantity > 0 ? 1 : 0;
/** rightHasSell：定义该变量以承载业务值。 */
            const rightHasSell = right.sellQuantity > 0 ? 1 : 0;
            if (leftHasSell !== rightHasSell) {
                return rightHasSell - leftHasSell;
            }
/** leftPrice：定义该变量以承载业务值。 */
            const leftPrice = left.lowestSellPrice ?? Number.MAX_SAFE_INTEGER;
/** rightPrice：定义该变量以承载业务值。 */
            const rightPrice = right.lowestSellPrice ?? Number.MAX_SAFE_INTEGER;
            if (leftPrice !== rightPrice) {
                return leftPrice - rightPrice;
            }
            return left.item.name.localeCompare(right.item.name, 'zh-Hans-CN');
        });
    }
/** buildOwnOrders：执行对应的业务逻辑。 */
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
/** buildItemBookView：执行对应的业务逻辑。 */
    buildItemBookView(itemKey) {
/** normalizedItemKey：定义该变量以承载业务值。 */
        const normalizedItemKey = itemKey.trim();
        if (!normalizedItemKey) {
            return null;
        }
/** orders：定义该变量以承载业务值。 */
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
/** buildPriceLevels：执行对应的业务逻辑。 */
    buildPriceLevels(itemKey, side) {
/** grouped：定义该变量以承载业务值。 */
        const grouped = new Map();
        for (const order of this.openOrders) {
            if (order.status !== 'open' || order.remainingQuantity <= 0 || order.side !== side || order.itemKey !== itemKey) {
                continue;
            }
/** current：定义该变量以承载业务值。 */
            const current = grouped.get(order.unitPrice) ?? { quantity: 0, orderCount: 0 };
            current.quantity += order.remainingQuantity;
            current.orderCount += 1;
            grouped.set(order.unitPrice, current);
        }
/** levels：定义该变量以承载业务值。 */
        const levels = Array.from(grouped.entries(), ([unitPrice, entry]) => ({
            unitPrice,
            quantity: entry.quantity,
            orderCount: entry.orderCount,
        }));
        levels.sort((left, right) => side === 'sell' ? left.unitPrice - right.unitPrice : right.unitPrice - left.unitPrice);
        return levels;
    }
/** getSortedOrders：执行对应的业务逻辑。 */
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
/** hasConflictingOpenOrder：执行对应的业务逻辑。 */
    hasConflictingOpenOrder(ownerId, itemKey, nextSide) {
/** oppositeSide：定义该变量以承载业务值。 */
        const oppositeSide = nextSide === 'sell' ? 'buy' : 'sell';
        return this.openOrders.some((order) => order.ownerId === ownerId
            && order.itemKey === itemKey
            && order.side === oppositeSide
            && order.status === 'open'
            && order.remainingQuantity > 0);
    }
/** planOrderMatches：执行对应的业务逻辑。 */
    planOrderMatches(orders, quantity, takerUnitPrice) {
/** remaining：定义该变量以承载业务值。 */
        let remaining = quantity;
/** total：定义该变量以承载业务值。 */
        let total = 0;
/** matches：定义该变量以承载业务值。 */
        const matches = [];
        for (const order of orders) {
            if (remaining <= 0) {
                break;
            }
/** maxTradable：定义该变量以承载业务值。 */
            const maxTradable = Math.min(remaining, order.remainingQuantity);
/** traded：定义该变量以承载业务值。 */
            const traded = this.getCompatibleTradeQuantity(maxTradable, order.unitPrice, takerUnitPrice);
            if (traded <= 0) {
                continue;
            }
/** tradeTotal：定义该变量以承载业务值。 */
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
/** getCompatibleTradeQuantity：执行对应的业务逻辑。 */
    getCompatibleTradeQuantity(maxQuantity, ...unitPrices) {
        if (maxQuantity <= 0) {
            return 0;
        }
/** quantityStep：定义该变量以承载业务值。 */
        let quantityStep = 1;
        for (const unitPrice of unitPrices) {
            if (!unitPrice || !(0, shared_1.isValidMarketPrice)(unitPrice)) {
                continue;
            }
            quantityStep = this.leastCommonMultiple(quantityStep, (0, shared_1.getMarketMinimumTradeQuantity)(unitPrice));
        }
        return Math.floor(maxQuantity / quantityStep) * quantityStep;
    }
/** leastCommonMultiple：执行对应的业务逻辑。 */
    leastCommonMultiple(left, right) {
        if (left <= 0 || right <= 0) {
            return 0;
        }
        return (left / this.greatestCommonDivisor(left, right)) * right;
    }
/** greatestCommonDivisor：执行对应的业务逻辑。 */
    greatestCommonDivisor(left, right) {
/** currentLeft：定义该变量以承载业务值。 */
        let currentLeft = Math.abs(Math.trunc(left));
/** currentRight：定义该变量以承载业务值。 */
        let currentRight = Math.abs(Math.trunc(right));
        while (currentRight !== 0) {
/** next：定义该变量以承载业务值。 */
            const next = currentLeft % currentRight;
            currentLeft = currentRight;
            currentRight = next;
        }
        return Math.max(1, currentLeft);
    }
/** buildItemKey：执行对应的业务逻辑。 */
    buildItemKey(item) {
        return (0, shared_1.createItemStackSignature)({
            ...item,
            count: 1,
        });
    }
/** toOrderItem：执行对应的业务逻辑。 */
    toOrderItem(item) {
/** normalized：定义该变量以承载业务值。 */
        const normalized = this.toFullItem(item);
        return {
            ...normalized,
            count: 1,
        };
    }
/** createCurrencyItem：执行对应的业务逻辑。 */
    createCurrencyItem(count) {
/** item：定义该变量以承载业务值。 */
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
/** toFullItem：执行对应的业务逻辑。 */
    toFullItem(item) {
/** normalized：定义该变量以承载业务值。 */
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
            allowBatchUse: normalized.allowBatchUse,
        };
    }
/** canTradeItemOnMarket：执行对应的业务逻辑。 */
    canTradeItemOnMarket(item) {
        return item.itemId !== market_1.MARKET_CURRENCY_ITEM_ID;
    }
/** normalizeQuantity：执行对应的业务逻辑。 */
    normalizeQuantity(value) {
        if (!Number.isFinite(value)) {
            return null;
        }
/** quantity：定义该变量以承载业务值。 */
        const quantity = Math.trunc(value);
        if (quantity <= 0 || quantity > market_1.MARKET_MAX_ORDER_QUANTITY) {
            return null;
        }
        return quantity;
    }
/** normalizeUnitPrice：执行对应的业务逻辑。 */
    normalizeUnitPrice(value) {
        if (!Number.isFinite(value)) {
            return null;
        }
/** unitPrice：定义该变量以承载业务值。 */
        const unitPrice = value;
        if (unitPrice <= 0 || unitPrice > shared_1.MARKET_MAX_UNIT_PRICE || !(0, shared_1.isValidMarketPrice)(unitPrice)) {
            return null;
        }
        return unitPrice;
    }
/** buildTradeQuantityError：执行对应的业务逻辑。 */
    buildTradeQuantityError(unitPrice) {
/** minimumQuantity：定义该变量以承载业务值。 */
        const minimumQuantity = (0, shared_1.getMarketMinimumTradeQuantity)(unitPrice);
        if (minimumQuantity <= 1) {
            return '挂售数量或单价无效。';
        }
        return `当前单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()} 时，数量必须是 ${minimumQuantity} 的倍数，才能按整灵石结算。`;
    }
/** formatUnitPrice：执行对应的业务逻辑。 */
    formatUnitPrice(value) {
        return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.0+$/, '');
    }
/** deliverItemToPlayer：执行对应的业务逻辑。 */
    deliverItemToPlayer(playerId, item, context) {
/** player：定义该变量以承载业务值。 */
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
/** mergeStorageItem：执行对应的业务逻辑。 */
    mergeStorageItem(playerId, item, context) {
/** current：定义该变量以承载业务值。 */
        const current = this.storageByPlayerId.get(playerId);
/** next：定义该变量以承载业务值。 */
        const next = cloneStorage(current);
/** signature：定义该变量以承载业务值。 */
        const signature = (0, shared_1.createItemStackSignature)(item);
/** existing：定义该变量以承载业务值。 */
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
/** setStorage：执行对应的业务逻辑。 */
    setStorage(playerId, storage, context) {
        if (!context.storageSnapshotByPlayerId.has(playerId)) {
            context.storageSnapshotByPlayerId.set(playerId, cloneStorage(this.storageByPlayerId.get(playerId)));
        }
/** normalized：定义该变量以承载业务值。 */
        const normalized = cloneStorage(storage);
        if (normalized.items.length > 0) {
            this.storageByPlayerId.set(playerId, normalized);
        }
        else {
            this.storageByPlayerId.delete(playerId);
        }
        context.dirtyStoragePlayerIds.add(playerId);
    }
/** recordTrade：执行对应的业务逻辑。 */
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
/** toTradeHistoryView：执行对应的业务逻辑。 */
    toTradeHistoryView(playerId, record) {
        return {
            id: record.id,
/** side：定义该变量以承载业务值。 */
            side: record.buyerId === playerId ? 'buy' : 'sell',
            itemId: record.itemId,
            itemName: this.contentTemplateRepository.getItemName(record.itemId) ?? record.itemId,
            quantity: record.quantity,
            unitPrice: record.unitPrice,
            createdAt: record.createdAt,
        };
    }
/** createEmptyResult：执行对应的业务逻辑。 */
    createEmptyResult(playerId) {
        return {
            affectedPlayerIds: [playerId],
            notices: [],
        };
    }
/** singleMessage：执行对应的业务逻辑。 */
    singleMessage(playerId, text, kind = 'info') {
        return {
            affectedPlayerIds: [playerId],
            notices: [{ playerId, text, kind }],
        };
    }
/** touchAffectedPlayer：执行对应的业务逻辑。 */
    touchAffectedPlayer(result, playerId) {
        if (!result.affectedPlayerIds.includes(playerId)) {
            result.affectedPlayerIds.push(playerId);
        }
    }
/** pushNotice：执行对应的业务逻辑。 */
    pushNotice(result, playerId, text, kind = 'info') {
        result.notices.push({ playerId, text, kind });
        this.touchAffectedPlayer(result, playerId);
    }
/** markOrderDirty：执行对应的业务逻辑。 */
    markOrderDirty(orderId, context) {
        context.dirtyOrderIds.add(orderId);
        context.deletedOrderIds.delete(orderId);
    }
/** deleteOrder：执行对应的业务逻辑。 */
    deleteOrder(orderId, context) {
        context.deletedOrderIds.add(orderId);
        context.dirtyOrderIds.delete(orderId);
    }
/** compactOpenOrders：执行对应的业务逻辑。 */
    compactOpenOrders() {
        this.openOrders = this.openOrders.filter((order) => order.status === 'open' && order.remainingQuantity > 0);
    }
/** captureOnlinePlayerState：执行对应的业务逻辑。 */
    captureOnlinePlayerState(playerId, context) {
        if (context.onlinePlayerSnapshots.has(playerId)) {
            return;
        }
/** snapshot：定义该变量以承载业务值。 */
        const snapshot = this.playerRuntimeService.snapshot(playerId);
        if (!snapshot) {
            return;
        }
        context.onlinePlayerSnapshots.set(playerId, snapshot);
    }
/** getStorage：执行对应的业务逻辑。 */
    getStorage(playerId) {
        return cloneStorage(this.storageByPlayerId.get(playerId));
    }
/** getCurrencyItemName：执行对应的业务逻辑。 */
    getCurrencyItemName() {
        return this.contentTemplateRepository.getItemName(market_1.MARKET_CURRENCY_ITEM_ID) ?? '灵石';
    }
/** createMutationContext：执行对应的业务逻辑。 */
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
/** restoreMutationContext：执行对应的业务逻辑。 */
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
/** runExclusiveMarketMutation：执行对应的业务逻辑。 */
    async runExclusiveMarketMutation(playerId, action) {
        return this.runExclusive(async () => {
/** context：定义该变量以承载业务值。 */
            const context = this.createMutationContext();
            try {
/** result：定义该变量以承载业务值。 */
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
/** storage：定义该变量以承载业务值。 */
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
/** message：定义该变量以承载业务值。 */
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`坊市结算失败，已回滚: ${message}`);
                return this.singleMessage(playerId, '坊市结算失败，已回滚本次操作。', 'warn');
            }
        });
    }
/** runExclusive：执行对应的业务逻辑。 */
    async runExclusive(action) {
/** previous：定义该变量以承载业务值。 */
        const previous = this.marketOperationQueue;
/** release：定义该变量以承载业务值。 */
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
/** cloneStorage：执行对应的业务逻辑。 */
function cloneStorage(storage) {
    return {
        items: (storage?.items ?? []).map((item) => ({ ...item })),
    };
}
//# sourceMappingURL=market-runtime.service.js.map
