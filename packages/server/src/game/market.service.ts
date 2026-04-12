import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { EntityManager, Repository } from 'typeorm';
import {
  calculateMarketTradeTotalCost,
  createItemStackSignature,
  DEFAULT_INVENTORY_CAPACITY,
  EquipSlot,
  getMarketMinimumTradeQuantity,
  ItemStack,
  ItemType,
  MAX_ENHANCE_LEVEL,
  MarketListedItemView,
  MarketOrderBookView,
  MarketOrderSide,
  MarketOwnOrderView,
  MarketPriceLevelView,
  MarketStorage,
  MarketTradeHistoryEntryView,
  PlayerState,
  S2C_MarketListings,
  S2C_MarketOrders,
  S2C_MarketStorage,
  S2C_MarketUpdate,
  TechniqueCategory,
  isValidMarketPrice,
  isValidMarketTradeQuantity,
} from '@mud/shared';
import { PlayerEntity } from '../database/entities/player.entity';
import { MarketOrderEntity } from '../database/entities/market-order.entity';
import { MarketTradeHistoryEntity } from '../database/entities/market-trade-history.entity';
import { MARKET_CURRENCY_ITEM_ID, MARKET_MAX_ORDER_QUANTITY, MARKET_MAX_UNIT_PRICE } from '../constants/gameplay/market';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';
import { PlayerService } from './player.service';

/** MarketMessage：定义该接口的能力与字段约束。 */
interface MarketMessage {
  playerId: string;
  text: string;
  kind?: 'system' | 'loot';
}

/** MarketPlayerSnapshot：定义该接口的能力与字段约束。 */
interface MarketPlayerSnapshot {
  inventory: {
    items: ItemStack[];
    capacity: number;
  };
  marketStorage: MarketStorage;
}

/** MarketMutationContext：定义该接口的能力与字段约束。 */
interface MarketMutationContext {
  orderRepo: Repository<MarketOrderEntity>;
  tradeHistoryRepo: Repository<MarketTradeHistoryEntity>;
  playerRepo: Repository<PlayerEntity>;
  openOrdersSnapshot: MarketOrderEntity[];
  onlinePlayerSnapshots: Map<string, MarketPlayerSnapshot>;
  touchedOnlinePlayerIds: Set<string>;
}

/** MarketActionResult：定义该接口的能力与字段约束。 */
export interface MarketActionResult {
  affectedPlayerIds: string[];
  messages: MarketMessage[];
  privateStatePlayerIds: string[];
  touchedItemIds: string[];
  tradeHistoryPlayerIds: string[];
}

@Injectable()
/** MarketService：封装相关状态与行为。 */
export class MarketService implements OnModuleInit {
  private readonly logger = new Logger(MarketService.name);
  private static readonly MARKET_PRICE_COLUMN_TABLES = [
    { table: 'market_orders', column: 'unitPrice' },
    { table: 'market_trade_history', column: 'unitPrice' },
  ] as const;
  private static readonly TRADE_HISTORY_VISIBLE_LIMIT = 100;
  private static readonly TRADE_HISTORY_PAGE_SIZE = 10;
  private openOrders: MarketOrderEntity[] = [];
  private marketOperationQueue: Promise<void> = Promise.resolve();

  constructor(
    @InjectRepository(MarketOrderEntity)
    private readonly marketOrderRepo: Repository<MarketOrderEntity>,
    @InjectRepository(MarketTradeHistoryEntity)
    private readonly marketTradeHistoryRepo: Repository<MarketTradeHistoryEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
    private readonly playerService: PlayerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureMarketUnitPriceCapacity();
    await this.reloadOpenOrders();
  }

  async reloadOpenOrders(): Promise<void> {
    this.openOrders = await this.marketOrderRepo.find({
      where: { status: 'open' },
      order: {
        createdAt: 'ASC',
        id: 'ASC',
      },
    });
    await this.sanitizeOpenOrders();
    this.compactOpenOrders();
  }

  async refreshInvalidOrders(): Promise<MarketActionResult> {
    return this.runExclusive(async () => {
      const context = this.createMutationContext();
      try {
        return await this.marketOrderRepo.manager.transaction(async (manager) => {
          this.bindTransactionRepos(context, manager);
          const result = await this.sanitizeOpenOrdersInContext(context);
          await this.persistTouchedOnlinePlayers(context);
          return result;
        });
      } catch (error) {
        this.restoreMutationContext(context);
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`坊市无效订单清理失败，已回滚: ${message}`);
        return this.createBaseResult();
      }
    });
  }

  getCurrencyItemId(): string {
    return MARKET_CURRENCY_ITEM_ID;
  }

  getCurrencyItemName(): string {
    return this.contentService.getItem(MARKET_CURRENCY_ITEM_ID)?.name ?? '灵石';
  }

  buildListingsPage(input: {
    page: number;
    pageSize?: number;
    category?: ItemType | 'all';
    equipmentSlot?: EquipSlot | 'all';
    techniqueCategory?: TechniqueCategory | 'all';
  }): S2C_MarketListings {
    const category = input.category ?? 'all';
    const equipmentSlot = input.equipmentSlot ?? 'all';
    const techniqueCategory = input.techniqueCategory ?? 'all';
    const pageSize = this.normalizeListingsPageSize(input.pageSize);
    const filtered = this.filterMarketItems(this.buildListingGroups(), {
      category,
      equipmentSlot,
      techniqueCategory,
    });
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.max(1, Math.min(totalPages, Math.floor(Number.isFinite(input.page) ? input.page : 1)));
    const start = (page - 1) * pageSize;
    return {
      currencyItemId: this.getCurrencyItemId(),
      currencyItemName: this.getCurrencyItemName(),
      page,
      pageSize,
      total,
      category,
      equipmentSlot,
      techniqueCategory,
      items: filtered
        .slice(start, start + pageSize)
        .map((entry) => ({ ...entry })),
    };
  }

  buildOrdersUpdate(player: PlayerState): S2C_MarketOrders {
    return {
      currencyItemId: this.getCurrencyItemId(),
      currencyItemName: this.getCurrencyItemName(),
      orders: this.buildOwnOrders(player.id).map((order) => ({
        id: order.id,
        side: order.side,
        status: order.status,
        itemKey: order.itemKey,
        item: { ...order.item },
        remainingQuantity: order.remainingQuantity,
        unitPrice: order.unitPrice,
        createdAt: order.createdAt,
      })),
    };
  }

  buildStorageUpdate(player: PlayerState): S2C_MarketStorage {
    const grouped = new Map<string, { item: ItemStack; count: number }>();
    for (const item of player.marketStorage?.items ?? []) {
      if (!item?.itemId || !Number.isFinite(item.count) || item.count <= 0) {
        continue;
      }
      const normalized = this.toOrderItem(item);
      const itemKey = this.buildItemKey(normalized);
      const current = grouped.get(itemKey) ?? {
        item: normalized,
        count: 0,
      };
      current.count += item.count;
      grouped.set(itemKey, current);
    }
    return {
      items: [...grouped.entries()]
        .map(([itemKey, entry]) => ({
          itemKey,
          item: { ...entry.item },
          count: entry.count,
        }))
        .sort((left, right) => left.item.name.localeCompare(right.item.name, 'zh-Hans-CN') || left.itemKey.localeCompare(right.itemKey)),
    };
  }

  buildMarketUpdate(player: PlayerState): S2C_MarketUpdate {
    return {
      currencyItemId: this.getCurrencyItemId(),
      currencyItemName: this.getCurrencyItemName(),
      listedItems: this.buildListedItems(),
      myOrders: this.buildOwnOrders(player.id),
      storage: this.cloneStorage(player.marketStorage),
    };
  }

  buildItemBook(itemKey: string): { itemKey: string; item: ItemStack; sells: MarketPriceLevelView[]; buys: MarketPriceLevelView[] } | null {
    const orders = this.openOrders.filter((order) => {
      const orderItem = this.cloneOrderItem(order);
      return order.remainingQuantity > 0
        && this.isSupportedMarketItem(orderItem)
        && this.isOrderItemDefined(orderItem)
        && this.buildItemKey(orderItem) === itemKey;
    });
    if (orders.length === 0) {
      return null;
    }
    return {
      itemKey,
      item: this.cloneOrderItem(orders[0]),
      sells: this.buildPriceLevels(itemKey, 'sell'),
      buys: this.buildPriceLevels(itemKey, 'buy'),
    };
  }

  async buildTradeHistoryPage(playerId: string, page: number): Promise<{
    page: number;
    pageSize: number;
    totalVisible: number;
    records: MarketTradeHistoryEntryView[];
  }> {
    const visibleRecords = await this.marketTradeHistoryRepo.find({
      where: [
        { buyerId: playerId },
        { sellerId: playerId },
      ],
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
      take: MarketService.TRADE_HISTORY_VISIBLE_LIMIT,
    });
    const totalVisible = visibleRecords.length;
    const totalPages = Math.max(1, Math.ceil(totalVisible / MarketService.TRADE_HISTORY_PAGE_SIZE));
    const normalizedPage = Math.max(1, Math.min(totalPages, Math.floor(Number.isFinite(page) ? page : 1)));
    const start = (normalizedPage - 1) * MarketService.TRADE_HISTORY_PAGE_SIZE;
    return {
      page: normalizedPage,
      pageSize: MarketService.TRADE_HISTORY_PAGE_SIZE,
      totalVisible,
      records: visibleRecords
        .slice(start, start + MarketService.TRADE_HISTORY_PAGE_SIZE)
        .map((record) => ({
          id: record.id,
          side: record.buyerId === playerId ? 'buy' : 'sell',
          itemId: record.itemId,
          itemName: this.contentService.getItem(record.itemId)?.name ?? record.itemId,
          quantity: record.quantity,
          unitPrice: record.unitPrice,
          createdAt: record.createdAt,
        })),
    };
  }

  async createSellOrder(player: PlayerState, payload: { slotIndex: number; quantity: number; unitPrice: number }): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.createSellOrderUnsafe(player, payload, context);
    });
  }

  private async createSellOrderUnsafe(
    player: PlayerState,
    payload: { slotIndex: number; quantity: number; unitPrice: number },
    context: MarketMutationContext,
  ): Promise<MarketActionResult> {
    const item = this.inventoryService.getItem(player, payload.slotIndex);
    if (!item) {
      return this.singleMessage(player.id, '要挂售的物品不存在。');
    }
    const quantity = this.normalizeQuantity(payload.quantity);
    const unitPrice = this.normalizeUnitPrice(payload.unitPrice);
    if (!quantity || !unitPrice) {
      return this.singleMessage(player.id, '挂售数量或单价无效。');
    }
    if (!isValidMarketTradeQuantity(unitPrice, quantity)) {
      return this.singleMessage(player.id, this.buildTradeQuantityError(unitPrice));
    }
    if (item.count < quantity) {
      return this.singleMessage(player.id, '挂售数量超过了当前持有数量。');
    }
    if (!this.canTradeItemOnMarket(item)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}是坊市货币，不能挂售。`);
    }
    if (!this.isSupportedMarketItem(this.toOrderItem(item))) {
      return this.singleMessage(player.id, `该物品强化等级超过坊市支持上限 +${MAX_ENHANCE_LEVEL}，无法挂售。`);
    }
    const orderItem = this.toOrderItem(item);
    const itemKey = this.buildItemKey(orderItem);
    if (this.hasConflictingOpenOrder(player.id, itemKey, 'sell')) {
      return this.singleMessage(player.id, '同一种物品已在求购中，不能同时挂售。');
    }

    const removed = this.inventoryService.removeItem(player, payload.slotIndex, quantity);
    if (!removed) {
      return this.singleMessage(player.id, '挂售失败，未能扣除物品。');
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

    const result = this.createEmptyResult(player.id);
    this.touchPrivateStatePlayer(result, player.id);
    this.touchItem(result, orderItem.itemId);
    const buyOrders = this.getSortedOrders(itemKey, 'buy')
      .filter((order) => order.ownerId !== player.id && order.unitPrice >= unitPrice);
    const matchPlan = this.planOrderMatches(buyOrders, removed.count, unitPrice);
    let remaining = matchPlan.remainingQuantity;

    for (const match of matchPlan.matches) {
      const buyOrder = match.order;
      const tradeQuantity = match.quantity;
      const tradePrice = buyOrder.unitPrice;
      await this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
      await this.deliverItemToPlayer(player.id, this.createCurrencyItem(match.totalCost), context);
      await this.recordTrade({
        buyerId: buyOrder.ownerId,
        sellerId: player.id,
        itemId: orderItem.itemId,
        quantity: tradeQuantity,
        unitPrice: tradePrice,
      }, context);
      this.touchPrivateStatePlayer(result, buyOrder.ownerId);
      this.touchTradeHistoryPlayer(result, buyOrder.ownerId);
      this.touchTradeHistoryPlayer(result, player.id);
      buyOrder.remainingQuantity -= tradeQuantity;
      buyOrder.updatedAt = Date.now();
      this.touchAffectedPlayer(result, buyOrder.ownerId);
      this.pushMessage(result, buyOrder.ownerId, `你的求购已成交：${orderItem.name} x${tradeQuantity}。`, 'loot');
      this.pushMessage(result, player.id, `你卖出了 ${orderItem.name} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${match.totalCost}。`, 'loot');
      await this.persistOrderState(buyOrder, buyOrder.remainingQuantity <= 0 ? 'filled' : 'open', context);
    }

    if (remaining > 0) {
      const now = Date.now();
      const order = this.marketOrderRepo.create({
        id: randomUUID(),
        ownerId: player.id,
        ownerName: player.displayName || player.name,
        side: 'sell',
        itemKey,
        itemSnapshot: this.toPlainItem(orderItem),
        remainingQuantity: remaining,
        unitPrice,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      });
      await context.orderRepo.save(order);
      this.openOrders.push(order);
      this.pushMessage(result, player.id, `已挂售 ${orderItem.name} x${remaining}，单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}。`);
    }

    this.compactOpenOrders();
    return result;
  }

  async createBuyOrder(player: PlayerState, payload: { itemKey: string; quantity: number; unitPrice: number }): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.createBuyOrderUnsafe(player, payload, context);
    });
  }

  private async createBuyOrderUnsafe(
    player: PlayerState,
    payload: { itemKey: string; quantity: number; unitPrice: number },
    context: MarketMutationContext,
  ): Promise<MarketActionResult> {
    const item = this.resolveBuyOrderItem(player, payload.itemKey);
    if (!item) {
      return this.singleMessage(player.id, '求购的物品不存在。');
    }
    if (!this.canTradeItemOnMarket(item)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}是坊市货币，不能求购。`);
    }
    if (!this.isSupportedMarketItem(this.toOrderItem(item))) {
      return this.singleMessage(player.id, `该物品强化等级超过坊市支持上限 +${MAX_ENHANCE_LEVEL}，无法求购。`);
    }
    const quantity = this.normalizeQuantity(payload.quantity);
    const unitPrice = this.normalizeUnitPrice(payload.unitPrice);
    if (!quantity || !unitPrice) {
      return this.singleMessage(player.id, '求购数量或单价无效。');
    }
    if (!isValidMarketTradeQuantity(unitPrice, quantity)) {
      return this.singleMessage(player.id, this.buildTradeQuantityError(unitPrice));
    }
    const orderItem = this.toOrderItem(item);
    const itemKey = this.buildItemKey(orderItem);
    if (this.hasConflictingOpenOrder(player.id, itemKey, 'buy')) {
      return this.singleMessage(player.id, '同一种物品已在挂售中，不能同时求购。');
    }

    const totalCost = calculateMarketTradeTotalCost(quantity, unitPrice);
    if (totalCost === null) {
      return this.singleMessage(player.id, this.buildTradeQuantityError(unitPrice));
    }
    if (!this.consumeCurrencyFromInventory(player, totalCost)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}不足，无法挂出求购。`);
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

    const result = this.createEmptyResult(player.id);
    this.touchPrivateStatePlayer(result, player.id);
    this.touchItem(result, orderItem.itemId);
    const sellOrders = this.getSortedOrders(itemKey, 'sell')
      .filter((order) => order.ownerId !== player.id && order.unitPrice <= unitPrice);
    const matchPlan = this.planOrderMatches(sellOrders, quantity, unitPrice);
    let remaining = matchPlan.remainingQuantity;

    for (const match of matchPlan.matches) {
      const sellOrder = match.order;
      const tradeQuantity = match.quantity;
      const tradePrice = sellOrder.unitPrice;
      await this.deliverItemToPlayer(player.id, { ...orderItem, count: tradeQuantity }, context);
      await this.deliverItemToPlayer(sellOrder.ownerId, this.createCurrencyItem(match.totalCost), context);
      await this.recordTrade({
        buyerId: player.id,
        sellerId: sellOrder.ownerId,
        itemId: orderItem.itemId,
        quantity: tradeQuantity,
        unitPrice: tradePrice,
      }, context);
      this.touchPrivateStatePlayer(result, sellOrder.ownerId);
      this.touchTradeHistoryPlayer(result, player.id);
      this.touchTradeHistoryPlayer(result, sellOrder.ownerId);
      const reservedCost = calculateMarketTradeTotalCost(tradeQuantity, unitPrice) ?? match.totalCost;
      const refund = Math.max(0, reservedCost - match.totalCost);
      if (refund > 0) {
        await this.deliverItemToPlayer(player.id, this.createCurrencyItem(refund), context);
      }
      sellOrder.remainingQuantity -= tradeQuantity;
      sellOrder.updatedAt = Date.now();
      this.touchAffectedPlayer(result, sellOrder.ownerId);
      this.pushMessage(result, player.id, `你买入了 ${orderItem.name} x${tradeQuantity}，成交价 ${this.formatUnitPrice(tradePrice)}。`, 'loot');
      this.pushMessage(result, sellOrder.ownerId, `你的挂售已成交：${orderItem.name} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${match.totalCost}。`, 'loot');
      await this.persistOrderState(sellOrder, sellOrder.remainingQuantity <= 0 ? 'filled' : 'open', context);
    }

    if (remaining > 0) {
      const now = Date.now();
      const order = this.marketOrderRepo.create({
        id: randomUUID(),
        ownerId: player.id,
        ownerName: player.displayName || player.name,
        side: 'buy',
        itemKey,
        itemSnapshot: this.toPlainItem(orderItem),
        remainingQuantity: remaining,
        unitPrice,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      });
      await context.orderRepo.save(order);
      this.openOrders.push(order);
      this.pushMessage(result, player.id, `已挂出求购 ${orderItem.name} x${remaining}，单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()}。`);
    }

    this.compactOpenOrders();
    return result;
  }

  async buyNow(player: PlayerState, payload: { itemKey: string; quantity: number }): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.buyNowUnsafe(player, payload, context);
    });
  }

  private async buyNowUnsafe(
    player: PlayerState,
    payload: { itemKey: string; quantity: number },
    context: MarketMutationContext,
  ): Promise<MarketActionResult> {
    const quantity = this.normalizeQuantity(payload.quantity);
    if (!quantity) {
      return this.singleMessage(player.id, '买入数量无效。');
    }
    const sells = this.getSortedOrders(payload.itemKey, 'sell')
      .filter((order) => order.ownerId !== player.id);
    if (sells.length === 0) {
      return this.singleMessage(player.id, '当前没有可买入的挂售。');
    }
    const plan = this.planOrderMatches(sells, quantity);
    if (plan.fulfilledQuantity < quantity) {
      return this.singleMessage(player.id, `当前最多只能买到 ${plan.fulfilledQuantity} 件。`);
    }
    const totalCost = plan.totalCost;
    if (!this.consumeCurrencyFromInventory(player, totalCost)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}不足，无法完成买入。`);
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

    const result = this.createEmptyResult(player.id);
    this.touchPrivateStatePlayer(result, player.id);
    const item = this.cloneOrderItem(sells[0]);
    this.touchItem(result, item.itemId);

    for (const match of plan.matches) {
      const sellOrder = match.order;
      const tradeQuantity = match.quantity;
      await this.deliverItemToPlayer(player.id, { ...item, count: tradeQuantity }, context);
      await this.deliverItemToPlayer(sellOrder.ownerId, this.createCurrencyItem(match.totalCost), context);
      await this.recordTrade({
        buyerId: player.id,
        sellerId: sellOrder.ownerId,
        itemId: item.itemId,
        quantity: tradeQuantity,
        unitPrice: sellOrder.unitPrice,
      }, context);
      this.touchPrivateStatePlayer(result, sellOrder.ownerId);
      this.touchTradeHistoryPlayer(result, player.id);
      this.touchTradeHistoryPlayer(result, sellOrder.ownerId);
      sellOrder.remainingQuantity -= tradeQuantity;
      sellOrder.updatedAt = Date.now();
      this.touchAffectedPlayer(result, sellOrder.ownerId);
      this.pushMessage(result, sellOrder.ownerId, `你的挂售已成交：${item.name} x${tradeQuantity}。`, 'loot');
      await this.persistOrderState(sellOrder, sellOrder.remainingQuantity <= 0 ? 'filled' : 'open', context);
    }

    this.pushMessage(result, player.id, `你买入了 ${item.name} x${quantity}，共花费 ${this.getCurrencyItemName()} x${totalCost}。`, 'loot');
    this.compactOpenOrders();
    return result;
  }

  async sellNow(player: PlayerState, payload: { slotIndex: number; quantity: number }): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.sellNowUnsafe(player, payload, context);
    });
  }

  private async sellNowUnsafe(
    player: PlayerState,
    payload: { slotIndex: number; quantity: number },
    context: MarketMutationContext,
  ): Promise<MarketActionResult> {
    const item = this.inventoryService.getItem(player, payload.slotIndex);
    if (!item) {
      return this.singleMessage(player.id, '要出售的物品不存在。');
    }
    const quantity = this.normalizeQuantity(payload.quantity);
    if (!quantity) {
      return this.singleMessage(player.id, '出售数量无效。');
    }
    if (item.count < quantity) {
      return this.singleMessage(player.id, '出售数量超过了当前持有数量。');
    }
    if (!this.canTradeItemOnMarket(item)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}是坊市货币，不能出售给求购盘。`);
    }
    const orderItem = this.toOrderItem(item);
    if (!this.isSupportedMarketItem(orderItem)) {
      return this.singleMessage(player.id, `该物品强化等级超过坊市支持上限 +${MAX_ENHANCE_LEVEL}，无法出售给求购盘。`);
    }
    const buys = this.getSortedOrders(this.buildItemKey(orderItem), 'buy')
      .filter((order) => order.ownerId !== player.id);
    if (buys.length === 0) {
      return this.singleMessage(player.id, '当前没有可直接成交的求购。');
    }
    const plan = this.planOrderMatches(buys, quantity);
    if (plan.fulfilledQuantity < quantity) {
      return this.singleMessage(player.id, `当前求购盘最多只能接下 ${plan.fulfilledQuantity} 件。`);
    }

    const removed = this.inventoryService.removeItem(player, payload.slotIndex, quantity);
    if (!removed) {
      return this.singleMessage(player.id, '出售失败，未能扣除物品。');
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

    const result = this.createEmptyResult(player.id);
    this.touchPrivateStatePlayer(result, player.id);
    const totalIncome = plan.totalCost;
    this.touchItem(result, orderItem.itemId);

    for (const match of plan.matches) {
      const buyOrder = match.order;
      const tradeQuantity = match.quantity;
      await this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
      await this.deliverItemToPlayer(player.id, this.createCurrencyItem(match.totalCost), context);
      await this.recordTrade({
        buyerId: buyOrder.ownerId,
        sellerId: player.id,
        itemId: orderItem.itemId,
        quantity: tradeQuantity,
        unitPrice: buyOrder.unitPrice,
      }, context);
      this.touchPrivateStatePlayer(result, buyOrder.ownerId);
      this.touchTradeHistoryPlayer(result, buyOrder.ownerId);
      this.touchTradeHistoryPlayer(result, player.id);
      buyOrder.remainingQuantity -= tradeQuantity;
      buyOrder.updatedAt = Date.now();
      this.touchAffectedPlayer(result, buyOrder.ownerId);
      this.pushMessage(result, buyOrder.ownerId, `你的求购已成交：${orderItem.name} x${tradeQuantity}。`, 'loot');
      await this.persistOrderState(buyOrder, buyOrder.remainingQuantity <= 0 ? 'filled' : 'open', context);
    }

    this.pushMessage(result, player.id, `你卖出了 ${orderItem.name} x${quantity}，共入账 ${this.getCurrencyItemName()} x${totalIncome}。`, 'loot');
    this.compactOpenOrders();
    return result;
  }

  async cancelOrder(player: PlayerState, payload: { orderId: string }): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.cancelOrderUnsafe(player, payload, context);
    });
  }

  private async cancelOrderUnsafe(
    player: PlayerState,
    payload: { orderId: string },
    context: MarketMutationContext,
  ): Promise<MarketActionResult> {
    const order = this.openOrders.find((entry) => entry.id === payload.orderId && entry.ownerId === player.id);
    if (!order) {
      return this.singleMessage(player.id, '未找到可取消的订单。');
    }

    if (order.side === 'sell') {
      await this.deliverItemToPlayer(player.id, { ...this.cloneOrderItem(order), count: order.remainingQuantity }, context);
    } else {
      const refund = calculateMarketTradeTotalCost(order.remainingQuantity, order.unitPrice);
      if (refund) {
        await this.deliverItemToPlayer(player.id, this.createCurrencyItem(refund), context);
      }
    }

    const result = this.singleMessage(player.id, '订单已取消，剩余托管物已退回你的坊市托管仓。');
    this.touchPrivateStatePlayer(result, player.id);
    this.touchItem(result, this.cloneOrderItem(order).itemId);
    order.updatedAt = Date.now();
    await this.persistOrderState(order, 'cancelled', context);
    this.compactOpenOrders();
    return result;
  }

  async claimStorage(player: PlayerState): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.claimStorageUnsafe(player, context);
    });
  }

  private async claimStorageUnsafe(player: PlayerState, context: MarketMutationContext): Promise<MarketActionResult> {
    const storage = player.marketStorage ?? { items: [] };
    if (storage.items.length === 0) {
      return this.singleMessage(player.id, '坊市托管仓里暂时没有可领取的物品。');
    }

    let movedCount = 0;
    const nextItems: ItemStack[] = [];
    for (const item of storage.items) {
      if (this.inventoryService.addItem(player, { ...item })) {
        movedCount += item.count;
        continue;
      }
      nextItems.push({ ...item });
    }
    player.marketStorage = { items: nextItems };
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

    if (movedCount === 0) {
      return this.singleMessage(player.id, '背包空间不足，托管仓物品暂时无法领取。');
    }
    const result = this.singleMessage(
      player.id,
      nextItems.length > 0
        ? `已领取部分托管物，共 ${movedCount} 件，其余因背包空间不足仍保留在坊市托管仓。`
        : `已领取坊市托管仓中的全部物品，共 ${movedCount} 件。`,
      'loot',
    );
    this.touchPrivateStatePlayer(result, player.id);
    if (nextItems.length > 0) {
      return result;
    }
    return result;
  }

  private buildListedItems(): MarketListedItemView[] {
    const grouped = new Map<string, {
      item: ItemStack;
      sellOrderCount: number;
      sellQuantity: number;
      lowestSellPrice?: number;
      buyOrderCount: number;
      buyQuantity: number;
      highestBuyPrice?: number;
    }>();

    for (const catalogItem of this.contentService.getEditorItemCatalog()) {
      const item = this.contentService.createItem(catalogItem.itemId, 1);
      if (!item || !this.isSupportedMarketItem(item)) {
        continue;
      }
      grouped.set(this.buildItemKey(item), {
        item: this.toOrderItem(item),
        sellOrderCount: 0,
        sellQuantity: 0,
        buyOrderCount: 0,
        buyQuantity: 0,
      });
    }

    for (const order of this.openOrders) {
      if (order.remainingQuantity <= 0) {
        continue;
      }
      const item = this.cloneOrderItem(order);
      if (!this.isSupportedMarketItem(item) || !this.isOrderItemDefined(item)) {
        continue;
      }
      const itemKey = this.buildItemKey(item);
      const current = grouped.get(itemKey) ?? {
        item,
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
      } else {
        current.buyOrderCount += 1;
        current.buyQuantity += order.remainingQuantity;
        current.highestBuyPrice = current.highestBuyPrice === undefined
          ? order.unitPrice
          : Math.max(current.highestBuyPrice, order.unitPrice);
      }
      grouped.set(itemKey, current);
    }

    return [...grouped.entries()]
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
        const leftLevel = this.contentService.getItemSortLevel(left.item);
        const rightLevel = this.contentService.getItemSortLevel(right.item);
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

  private buildListingGroups(): S2C_MarketListings['items'] {
    const grouped = new Map<string, S2C_MarketListings['items'][number]>();
    for (const entry of this.buildListedItems()) {
      const canEnhance = this.canGroupEnhancementVariants(entry.item);
      const groupKey = canEnhance ? entry.item.itemId : entry.itemKey;
      const current = grouped.get(groupKey) ?? {
        itemId: entry.item.itemId,
        item: canEnhance
          ? this.createDisplayItemForListingGroup(entry.item.itemId, entry.item)
          : { ...entry.item },
        lowestSellPrice: undefined,
        highestBuyPrice: undefined,
        canEnhance,
        variants: [],
      };
      current.lowestSellPrice = current.lowestSellPrice === undefined
        ? entry.lowestSellPrice
        : entry.lowestSellPrice === undefined
          ? current.lowestSellPrice
          : Math.min(current.lowestSellPrice, entry.lowestSellPrice);
      current.highestBuyPrice = current.highestBuyPrice === undefined
        ? entry.highestBuyPrice
        : entry.highestBuyPrice === undefined
          ? current.highestBuyPrice
          : Math.max(current.highestBuyPrice, entry.highestBuyPrice);
      current.variants.push({
        itemKey: entry.itemKey,
        item: { ...entry.item },
        lowestSellPrice: entry.lowestSellPrice,
        highestBuyPrice: entry.highestBuyPrice,
        sellOrderCount: entry.sellOrderCount,
        sellQuantity: entry.sellQuantity,
        buyOrderCount: entry.buyOrderCount,
        buyQuantity: entry.buyQuantity,
      });
      grouped.set(groupKey, current);
    }
    return [...grouped.values()]
      .map((entry) => {
        const variants = entry.canEnhance
          ? this.fillEnhancementListingVariants(entry.itemId, entry.variants)
          : [...entry.variants];
        const zeroVariant = variants.find((variant) => Math.max(0, Math.floor(Number(variant.item.enhanceLevel) || 0)) === 0) ?? null;
        return {
          ...entry,
          item: zeroVariant?.item ? { ...zeroVariant.item } : { ...entry.item },
          lowestSellPrice: zeroVariant?.lowestSellPrice,
          highestBuyPrice: zeroVariant?.highestBuyPrice,
          variants: variants.sort((left, right) => {
          const leftEnhanceLevel = Math.max(0, Math.floor(Number(left.item.enhanceLevel) || 0));
          const rightEnhanceLevel = Math.max(0, Math.floor(Number(right.item.enhanceLevel) || 0));
          if (leftEnhanceLevel !== rightEnhanceLevel) {
            return leftEnhanceLevel - rightEnhanceLevel;
          }
          const leftPrice = left.lowestSellPrice ?? Number.MAX_SAFE_INTEGER;
          const rightPrice = right.lowestSellPrice ?? Number.MAX_SAFE_INTEGER;
          if (leftPrice !== rightPrice) {
            return leftPrice - rightPrice;
          }
          return left.itemKey.localeCompare(right.itemKey);
        }),
        };
      })
      .sort((left, right) => {
        const leftLevel = this.contentService.getItemSortLevel(left.item);
        const rightLevel = this.contentService.getItemSortLevel(right.item);
        if (leftLevel !== rightLevel) {
          return leftLevel - rightLevel;
        }
        const leftHasSell = left.variants.some((variant) => variant.sellQuantity > 0) ? 1 : 0;
        const rightHasSell = right.variants.some((variant) => variant.sellQuantity > 0) ? 1 : 0;
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

  private buildOwnOrders(playerId: string): MarketOwnOrderView[] {
    return this.openOrders
      .filter((order) => {
        const orderItem = this.cloneOrderItem(order);
        return order.ownerId === playerId
          && order.remainingQuantity > 0
          && this.isSupportedMarketItem(orderItem)
          && this.isOrderItemDefined(orderItem);
      })
      .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
      .map((order) => ({
        id: order.id,
        side: order.side,
        status: order.status,
        itemKey: this.getOrderItemKey(order),
        item: this.cloneOrderItem(order),
        remainingQuantity: order.remainingQuantity,
        unitPrice: order.unitPrice,
        createdAt: order.createdAt,
      }));
  }

  private buildPriceLevels(itemKey: string, side: MarketOrderSide): MarketPriceLevelView[] {
    const grouped = new Map<number, { quantity: number; orderCount: number }>();
    for (const order of this.openOrders) {
      const orderItem = this.cloneOrderItem(order);
      if (
        this.buildItemKey(orderItem) !== itemKey
        || order.side !== side
        || order.remainingQuantity <= 0
        || !this.isSupportedMarketItem(orderItem)
        || !this.isOrderItemDefined(orderItem)
      ) {
        continue;
      }
      const current = grouped.get(order.unitPrice) ?? { quantity: 0, orderCount: 0 };
      current.quantity += order.remainingQuantity;
      current.orderCount += 1;
      grouped.set(order.unitPrice, current);
    }
    const levels = [...grouped.entries()].map(([unitPrice, entry]) => ({
      unitPrice,
      quantity: entry.quantity,
      orderCount: entry.orderCount,
    }));
    levels.sort((left, right) => side === 'sell'
      ? left.unitPrice - right.unitPrice
      : right.unitPrice - left.unitPrice);
    return levels;
  }

  private filterMarketItems<T extends { item: ItemStack }>(
    items: T[],
    filter: {
      category: ItemType | 'all';
      equipmentSlot: EquipSlot | 'all';
      techniqueCategory: TechniqueCategory | 'all';
    },
  ): T[] {
    return items.filter((item) => {
      if (filter.category !== 'all' && item.item.type !== filter.category) {
        return false;
      }
      if (filter.category === 'equipment' && filter.equipmentSlot !== 'all' && item.item.equipSlot !== filter.equipmentSlot) {
        return false;
      }
      if (filter.category === 'skill_book' && filter.techniqueCategory !== 'all') {
        return this.resolveTechniqueCategoryForItem(item.item.itemId) === filter.techniqueCategory;
      }
      return true;
    });
  }

  private resolveTechniqueCategoryForItem(itemId: string): TechniqueCategory | null {
    const techniqueId = this.resolveTechniqueIdFromBookItemId(itemId);
    if (!techniqueId) {
      return null;
    }
    return this.contentService.getTechnique(techniqueId)?.category ?? null;
  }

  private resolveTechniqueIdFromBookItemId(itemId: string): string | null {
    if (itemId.startsWith('book.')) {
      return itemId.slice(5);
    }
    if (itemId.startsWith('book_')) {
      return itemId.slice(5);
    }
    return null;
  }

  private normalizeListingsPageSize(pageSize: number | undefined): number {
    if (!Number.isFinite(pageSize)) {
      return 24;
    }
    return Math.max(8, Math.min(48, Math.floor(Number(pageSize))));
  }

  private getSortedOrders(itemKey: string, side: MarketOrderSide): MarketOrderEntity[] {
    return this.openOrders
      .filter((order) => {
        if (order.side !== side || order.remainingQuantity <= 0) {
          return false;
        }
        const orderItem = this.cloneOrderItem(order);
        return this.isSupportedMarketItem(orderItem)
          && this.isOrderItemDefined(orderItem)
          && this.getOrderItemKey(order) === itemKey;
      })
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

  private hasConflictingOpenOrder(ownerId: string, itemKey: string, nextSide: MarketOrderSide): boolean {
    const oppositeSide: MarketOrderSide = nextSide === 'sell' ? 'buy' : 'sell';
    return this.openOrders.some((order) =>
      order.ownerId === ownerId
      && this.getOrderItemKey(order) === itemKey
      && order.side === oppositeSide
      && order.remainingQuantity > 0
      && order.status === 'open'
      && this.isSupportedMarketItem(this.cloneOrderItem(order))
      && this.isOrderItemDefined(this.cloneOrderItem(order)));
  }

  private planOrderMatches(
    orders: MarketOrderEntity[],
    quantity: number,
    takerUnitPrice?: number,
  ): {
    matches: Array<{ order: MarketOrderEntity; quantity: number; totalCost: number }>;
    fulfilledQuantity: number;
    remainingQuantity: number;
    totalCost: number;
  } {
    let remaining = quantity;
    let total = 0;
    const matches: Array<{ order: MarketOrderEntity; quantity: number; totalCost: number }> = [];
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

  private getCompatibleTradeQuantity(maxQuantity: number, ...unitPrices: Array<number | undefined>): number {
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

  private leastCommonMultiple(left: number, right: number): number {
    if (left <= 0 || right <= 0) {
      return 0;
    }
    return (left / this.greatestCommonDivisor(left, right)) * right;
  }

  private greatestCommonDivisor(left: number, right: number): number {
    let currentLeft = Math.abs(Math.trunc(left));
    let currentRight = Math.abs(Math.trunc(right));
    while (currentRight !== 0) {
      const next = currentLeft % currentRight;
      currentLeft = currentRight;
      currentRight = next;
    }
    return Math.max(1, currentLeft);
  }

  private buildItemKey(item: ItemStack): string {
    const enhanceLevel = this.getSupportedMarketEnhanceLevel(item);
    if (this.canGroupEnhancementVariants(item) && enhanceLevel !== null) {
      return createItemStackSignature(this.createEnhancementVariantItem(item.itemId, enhanceLevel));
    }
    return createItemStackSignature({
      ...item,
      count: 1,
    });
  }

  private createDisplayItemForListingGroup(itemId: string, fallback: ItemStack): ItemStack {
    const template = this.contentService.createItem(itemId, 1);
    if (template) {
      return this.toOrderItem(template);
    }
    return this.toOrderItem({
      ...fallback,
      count: 1,
      enhanceLevel: 0,
    });
  }

  private canGroupEnhancementVariants(item: ItemStack): boolean {
    return item.type === 'equipment';
  }

  private fillEnhancementListingVariants(
    itemId: string,
    variants: S2C_MarketListings['items'][number]['variants'],
  ): S2C_MarketListings['items'][number]['variants'] {
    const byLevel = new Map<number, S2C_MarketListings['items'][number]['variants'][number]>();
    variants.forEach((variant) => {
      const level = this.getSupportedMarketEnhanceLevel(variant.item);
      if (level === null) {
        return;
      }
      const item = this.createEnhancementVariantItem(itemId, level);
      const current = byLevel.get(level) ?? {
        itemKey: this.buildItemKey(item),
        item,
        lowestSellPrice: undefined,
        highestBuyPrice: undefined,
        sellOrderCount: 0,
        sellQuantity: 0,
        buyOrderCount: 0,
        buyQuantity: 0,
      };
      current.lowestSellPrice = current.lowestSellPrice === undefined
        ? variant.lowestSellPrice
        : variant.lowestSellPrice === undefined
          ? current.lowestSellPrice
          : Math.min(current.lowestSellPrice, variant.lowestSellPrice);
      current.highestBuyPrice = current.highestBuyPrice === undefined
        ? variant.highestBuyPrice
        : variant.highestBuyPrice === undefined
          ? current.highestBuyPrice
          : Math.max(current.highestBuyPrice, variant.highestBuyPrice);
      current.sellOrderCount += variant.sellOrderCount;
      current.sellQuantity += variant.sellQuantity;
      current.buyOrderCount += variant.buyOrderCount;
      current.buyQuantity += variant.buyQuantity;
      byLevel.set(level, current);
    });
    for (let level = 0; level <= MAX_ENHANCE_LEVEL; level += 1) {
      if (byLevel.has(level)) {
        continue;
      }
      const item = this.createEnhancementVariantItem(itemId, level);
      byLevel.set(level, {
        itemKey: this.buildItemKey(item),
        item,
        lowestSellPrice: undefined,
        highestBuyPrice: undefined,
        sellOrderCount: 0,
        sellQuantity: 0,
        buyOrderCount: 0,
        buyQuantity: 0,
      });
    }
    return [...byLevel.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([, entry]) => entry);
  }

  private createEnhancementVariantItem(itemId: string, enhanceLevel: number): ItemStack {
    const template = this.contentService.createItem(itemId, 1);
    const base = template ?? {
      itemId,
      count: 1,
      name: itemId,
      type: 'equipment' as const,
      desc: '',
    };
    return this.toOrderItem({
      ...base,
      count: 1,
      enhanceLevel,
    });
  }

  private toOrderItem(item: ItemStack): ItemStack {
    const normalized = this.contentService.normalizeItemStack(item);
    return {
      ...normalized,
      count: 1,
    };
  }

  private cloneOrderItem(order: MarketOrderEntity): ItemStack {
    return this.toOrderItem(order.itemSnapshot as unknown as ItemStack);
  }

  private getOrderItemKey(order: MarketOrderEntity): string {
    return this.buildItemKey(this.cloneOrderItem(order));
  }

  private createCurrencyItem(count: number): ItemStack {
    return this.contentService.createItem(MARKET_CURRENCY_ITEM_ID, count) ?? {
      itemId: MARKET_CURRENCY_ITEM_ID,
      name: this.getCurrencyItemName(),
      type: 'consumable',
      count,
      desc: '坊市通行货币。',
    };
  }

  private canTradeItemOnMarket(item: Pick<ItemStack, 'itemId'>): boolean {
    return item.itemId !== MARKET_CURRENCY_ITEM_ID;
  }

  private getSupportedMarketEnhanceLevel(item: ItemStack): number | null {
    if (!this.canGroupEnhancementVariants(item)) {
      return 0;
    }
    const level = Math.max(0, Math.floor(Number(item.enhanceLevel) || 0));
    return level <= MAX_ENHANCE_LEVEL ? level : null;
  }

  private isSupportedMarketItem(item: ItemStack): boolean {
    return this.canTradeItemOnMarket(item)
      && (!this.canGroupEnhancementVariants(item) || this.getSupportedMarketEnhanceLevel(item) !== null);
  }

  private resolveBuyOrderItem(player: PlayerState, itemKey: string): ItemStack | null {
    const listed = this.buildListedItems().find((entry) => entry.itemKey === itemKey)?.item;
    if (listed) {
      return { ...listed };
    }
    const inventoryItem = player.inventory.items.find((entry) => this.buildItemKey(this.toOrderItem(entry)) === itemKey);
    if (inventoryItem) {
      return this.toOrderItem(inventoryItem);
    }
    const parsed = this.parseItemKey(itemKey);
    if (parsed) {
      return parsed;
    }
    return null;
  }

  private parseItemKey(itemKey: string): ItemStack | null {
    try {
      const candidate = JSON.parse(itemKey) as Partial<ItemStack>;
      const itemId = typeof candidate.itemId === 'string' ? candidate.itemId.trim() : '';
      if (!itemId) {
        return null;
      }
      const template = this.contentService.createItem(itemId, 1);
      if (!template) {
        return null;
      }
      return this.toOrderItem({
        ...template,
        ...candidate,
        count: 1,
      });
    } catch {
      return null;
    }
  }

  private isOrderItemDefined(item: Pick<ItemStack, 'itemId'>): boolean {
    return Boolean(this.contentService.getItem(item.itemId));
  }

  private normalizeQuantity(value: number): number | null {
    if (!Number.isFinite(value)) {
      return null;
    }
    const quantity = Math.floor(value);
    if (quantity <= 0 || quantity > MARKET_MAX_ORDER_QUANTITY) {
      return null;
    }
    return quantity;
  }

  private normalizeUnitPrice(value: number): number | null {
    if (!Number.isFinite(value)) {
      return null;
    }
    const unitPrice = value;
    if (unitPrice <= 0 || unitPrice > MARKET_MAX_UNIT_PRICE) {
      return null;
    }
    if (!isValidMarketPrice(unitPrice)) {
      return null;
    }
    return unitPrice;
  }

  private async ensureMarketUnitPriceCapacity(): Promise<void> {
    const tableNames = [...new Set(MarketService.MARKET_PRICE_COLUMN_TABLES.map((entry) => entry.table))];
    const columnNames = [...new Set(MarketService.MARKET_PRICE_COLUMN_TABLES.map((entry) => entry.column))];
    const rows = await this.marketOrderRepo.query(`
      SELECT table_name, column_name, data_type, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
        AND column_name = ANY($2::text[])
    `, [tableNames, columnNames]);

    const columnsNeedingUpgrade = new Set<string>();
    for (const row of rows as Array<{ table_name?: unknown; column_name?: unknown; data_type?: unknown; numeric_scale?: unknown }>) {
      if ((row.data_type !== 'numeric' || Number(row.numeric_scale ?? 0) !== 1)
        && typeof row.table_name === 'string'
        && typeof row.column_name === 'string') {
        columnsNeedingUpgrade.add(`${row.table_name}.${row.column_name}`);
      }
    }

    if (columnsNeedingUpgrade.size === 0) {
      return;
    }

    for (const entry of MarketService.MARKET_PRICE_COLUMN_TABLES) {
      const key = `${entry.table}.${entry.column}`;
      if (!columnsNeedingUpgrade.has(key)) {
        continue;
      }
      await this.marketOrderRepo.query(`
        ALTER TABLE ${this.quotePgIdentifier(entry.table)}
        ALTER COLUMN ${this.quotePgIdentifier(entry.column)} TYPE numeric(20, 1)
        USING COALESCE(${this.quotePgIdentifier(entry.column)}, 0)::numeric(20, 1)
      `);
    }

    this.logger.warn(`已将市场表 unitPrice 字段升级为 numeric(20,1): ${[...columnsNeedingUpgrade].join(', ')}`);
  }

  private quotePgIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private buildTradeQuantityError(unitPrice: number): string {
    const minimumQuantity = getMarketMinimumTradeQuantity(unitPrice);
    if (minimumQuantity <= 1) {
      return '挂售数量或单价无效。';
    }
    return `当前单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()} 时，数量必须是 ${minimumQuantity} 的倍数，才能按整灵石结算。`;
  }

  private formatUnitPrice(value: number): string {
    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(1).replace(/\.0$/, '');
  }

  private consumeCurrencyFromInventory(player: PlayerState, count: number): boolean {
    if (count <= 0) {
      return true;
    }
    const owned = player.inventory.items
      .filter((item) => item.itemId === MARKET_CURRENCY_ITEM_ID)
      .reduce((sum, item) => sum + item.count, 0);
    if (owned < count) {
      return false;
    }
    let remaining = count;
    for (let index = player.inventory.items.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const item = player.inventory.items[index];
      if (item.itemId !== MARKET_CURRENCY_ITEM_ID) {
        continue;
      }
      const removed = this.inventoryService.removeItem(player, index, remaining);
      if (!removed) {
        continue;
      }
      remaining -= removed.count;
    }
    return remaining === 0;
  }

  private async deliverItemToPlayer(playerId: string, item: ItemStack, context: MarketMutationContext): Promise<void> {
    const player = this.playerService.getPlayer(playerId);
    if (player) {
      this.captureOnlinePlayerState(player.id, context);
      if (this.inventoryService.addItem(player, { ...item })) {
        this.playerService.markDirty(player.id, 'inv');
      } else {
        player.marketStorage = this.mergeStorageItem(player.marketStorage, item);
      }
      context.touchedOnlinePlayerIds.add(player.id);
      return;
    }

    const entity = await context.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) {
      this.logger.warn(`坊市结算时未找到玩家存档: ${playerId}`);
      return;
    }
    const storage = this.normalizeStorage(entity.marketStorage);
    entity.marketStorage = this.toPersistedStorage(this.mergeStorageItem(storage, item)) as unknown as Record<string, unknown>;
    await context.playerRepo.save(entity);
  }

  private mergeStorageItem(storage: MarketStorage | undefined, item: ItemStack): MarketStorage {
    const current = this.cloneStorage(storage);
    const signature = createItemStackSignature(item);
    const existing = current.items.find((entry) => createItemStackSignature(entry) === signature);
    if (existing) {
      existing.count += item.count;
      return current;
    }
    current.items.push({ ...item });
    current.items = this.contentService.normalizeInventory({
      capacity: Math.max(DEFAULT_INVENTORY_CAPACITY, current.items.length + DEFAULT_INVENTORY_CAPACITY),
      items: current.items,
    }).items;
    return current;
  }

  private normalizeStorage(raw: unknown): MarketStorage {
    const source = (typeof raw === 'object' && raw !== null ? raw : {}) as { items?: unknown[] };
    const items = Array.isArray(source.items)
      ? source.items
        .map((entry) => this.normalizeStorageItem(entry))
        .filter((entry): entry is ItemStack => entry !== null)
      : [];
    return {
      items: this.contentService.normalizeInventory({
        capacity: Math.max(DEFAULT_INVENTORY_CAPACITY, items.length + DEFAULT_INVENTORY_CAPACITY),
        items,
      }).items,
    };
  }

  private normalizeStorageItem(raw: unknown): ItemStack | null {
    if (typeof raw !== 'object' || raw === null || typeof (raw as { itemId?: unknown }).itemId !== 'string') {
      return null;
    }
    const item = raw as ItemStack;
    return this.contentService.normalizeItemStack({
      ...item,
      count: Math.max(1, Number.isFinite(item.count) ? Math.floor(item.count) : 1),
    });
  }

  private cloneStorage(storage: MarketStorage | undefined): MarketStorage {
    return {
      items: (storage?.items ?? []).map((item) => ({ ...item })),
    };
  }

  private toPersistedStorage(storage: MarketStorage): { items: ItemStack[]; capacity: number } {
    return {
      items: storage.items.map((item) => ({ ...item })),
      capacity: DEFAULT_INVENTORY_CAPACITY,
    };
  }

  private toPlainItem(item: ItemStack): Record<string, unknown> {
    return JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
  }

  private async recordTrade(payload: {
    buyerId: string;
    sellerId: string;
    itemId: string;
    quantity: number;
    unitPrice: number;
  }, context: MarketMutationContext): Promise<void> {
    const now = Date.now();
    await context.tradeHistoryRepo.save(context.tradeHistoryRepo.create({
      id: randomUUID(),
      buyerId: payload.buyerId,
      sellerId: payload.sellerId,
      itemId: payload.itemId,
      quantity: payload.quantity,
      unitPrice: payload.unitPrice,
      createdAt: now,
    }));
  }

  private toTradeHistoryView(playerId: string, record: MarketTradeHistoryEntity): MarketTradeHistoryEntryView {
    const itemName = this.contentService.getItem(record.itemId)?.name
      ?? this.contentService.createItem(record.itemId, 1)?.name
      ?? record.itemId;
    return {
      id: record.id,
      side: record.buyerId === playerId ? 'buy' : 'sell',
      itemId: record.itemId,
      itemName,
      quantity: record.quantity,
      unitPrice: record.unitPrice,
      createdAt: record.createdAt,
    };
  }

  private async persistOrderState(
    order: MarketOrderEntity,
    status: 'open' | 'filled' | 'cancelled',
    context: MarketMutationContext,
  ): Promise<void> {
    order.status = status;
    if (status !== 'open') {
      order.remainingQuantity = Math.max(0, order.remainingQuantity);
    }
    await context.orderRepo.save(order);
  }

  private async sanitizeOpenOrders(): Promise<void> {
    const context = this.createMutationContext();
    try {
      await this.marketOrderRepo.manager.transaction(async (manager) => {
        this.bindTransactionRepos(context, manager);
        await this.sanitizeOpenOrdersInContext(context);
        await this.persistTouchedOnlinePlayers(context);
      });
    } catch (error) {
      this.restoreMutationContext(context);
      throw error;
    }
  }

  private async sanitizeOpenOrdersInContext(context: MarketMutationContext): Promise<MarketActionResult> {
    const result = this.createBaseResult();
    for (const order of this.openOrders) {
      const orderItem = this.cloneOrderItem(order);
      const canonicalKey = this.getOrderItemKey(order);
      const validUnitPrice = this.normalizeUnitPrice(order.unitPrice);
      if (!this.isOrderItemDefined(orderItem)) {
        await this.removeDeletedItemOrder(order, orderItem, context, result);
        continue;
      }
      if (!this.isSupportedMarketItem(orderItem)
        || !validUnitPrice
        || !isValidMarketTradeQuantity(validUnitPrice, order.remainingQuantity)) {
        await this.refundInvalidOrder(order, orderItem, context, result);
        continue;
      }
      if (order.unitPrice !== validUnitPrice) {
        order.unitPrice = validUnitPrice;
        order.updatedAt = Date.now();
        await context.orderRepo.save(order);
      }
      if (order.itemKey !== canonicalKey) {
        order.itemKey = canonicalKey;
        order.updatedAt = Date.now();
        await context.orderRepo.save(order);
      }
    }
    return result;
  }

  private async refundInvalidOrder(
    order: MarketOrderEntity,
    orderItem: ItemStack,
    context: MarketMutationContext,
    result?: MarketActionResult,
  ): Promise<void> {
    if (order.side === 'sell') {
      await this.deliverItemToPlayer(order.ownerId, { ...orderItem, count: order.remainingQuantity }, context);
    } else {
      const refund = calculateMarketTradeTotalCost(order.remainingQuantity, order.unitPrice);
      if (refund) {
        await this.deliverItemToPlayer(order.ownerId, this.createCurrencyItem(refund), context);
      }
    }
    if (result) {
      this.touchPrivateStatePlayer(result, order.ownerId);
      this.touchAffectedPlayer(result, order.ownerId);
      this.touchItem(result, orderItem.itemId);
    }
    order.status = 'cancelled';
    order.remainingQuantity = 0;
    order.updatedAt = Date.now();
    await context.orderRepo.save(order);
    this.logger.warn(`已自动取消非法坊市订单 ${order.id}，原因：价格或数量不再满足坊市结算规则`);
  }

  private async removeDeletedItemOrder(
    order: MarketOrderEntity,
    orderItem: ItemStack,
    context: MarketMutationContext,
    result: MarketActionResult,
  ): Promise<void> {
    if (order.side === 'buy') {
      const refund = calculateMarketTradeTotalCost(order.remainingQuantity, order.unitPrice);
      if (refund) {
        await this.deliverItemToPlayer(order.ownerId, this.createCurrencyItem(refund), context);
      }
      this.pushMessage(result, order.ownerId, `你的求购单 ${orderItem.itemId} 已自动取消，托管${this.getCurrencyItemName()}已退回坊市托管仓。`);
    } else {
      this.pushMessage(result, order.ownerId, `你的挂售单 ${orderItem.itemId} 已自动移除，原因：对应物品已被删除。`);
    }
    this.touchPrivateStatePlayer(result, order.ownerId);
    this.touchItem(result, orderItem.itemId);
    order.status = 'cancelled';
    order.remainingQuantity = 0;
    order.updatedAt = Date.now();
    await context.orderRepo.save(order);
    this.logger.warn(`已自动移除已删除物品的坊市订单 ${order.id}，side=${order.side} itemId=${orderItem.itemId}`);
  }

  private compactOpenOrders(): void {
    this.openOrders = this.openOrders.filter((order) => order.status === 'open' && order.remainingQuantity > 0);
  }

  private createBaseResult(): MarketActionResult {
    return {
      affectedPlayerIds: [],
      messages: [],
      privateStatePlayerIds: [],
      touchedItemIds: [],
      tradeHistoryPlayerIds: [],
    };
  }

  private createEmptyResult(playerId: string): MarketActionResult {
    const result = this.createBaseResult();
    result.affectedPlayerIds.push(playerId);
    return result;
  }

  private mergeResults(...results: MarketActionResult[]): MarketActionResult {
    const merged = this.createBaseResult();
    for (const result of results) {
      for (const playerId of result.affectedPlayerIds) {
        this.touchAffectedPlayer(merged, playerId);
      }
      merged.messages.push(...result.messages);
      for (const playerId of result.privateStatePlayerIds) {
        this.touchPrivateStatePlayer(merged, playerId);
      }
      for (const itemId of result.touchedItemIds) {
        this.touchItem(merged, itemId);
      }
      for (const playerId of result.tradeHistoryPlayerIds) {
        this.touchTradeHistoryPlayer(merged, playerId);
      }
    }
    return merged;
  }

  private singleMessage(playerId: string, text: string, kind: 'system' | 'loot' = 'system'): MarketActionResult {
    return {
      affectedPlayerIds: [playerId],
      messages: [{ playerId, text, kind }],
      privateStatePlayerIds: [],
      touchedItemIds: [],
      tradeHistoryPlayerIds: [],
    };
  }

  private touchAffectedPlayer(result: MarketActionResult, playerId: string): void {
    if (!result.affectedPlayerIds.includes(playerId)) {
      result.affectedPlayerIds.push(playerId);
    }
  }

  private pushMessage(result: MarketActionResult, playerId: string, text: string, kind: 'system' | 'loot' = 'system'): void {
    result.messages.push({ playerId, text, kind });
    this.touchAffectedPlayer(result, playerId);
  }

  private touchPrivateStatePlayer(result: MarketActionResult, playerId: string): void {
    if (!result.privateStatePlayerIds.includes(playerId)) {
      result.privateStatePlayerIds.push(playerId);
    }
  }

  private touchItem(result: MarketActionResult, itemId: string): void {
    if (!result.touchedItemIds.includes(itemId)) {
      result.touchedItemIds.push(itemId);
    }
  }

  private touchTradeHistoryPlayer(result: MarketActionResult, playerId: string): void {
    if (!result.tradeHistoryPlayerIds.includes(playerId)) {
      result.tradeHistoryPlayerIds.push(playerId);
    }
  }

  private async runExclusiveMarketMutation(
    playerId: string,
    action: (context: MarketMutationContext) => Promise<MarketActionResult>,
  ): Promise<MarketActionResult> {
    return this.runExclusive(async () => {
      const context = this.createMutationContext();
      try {
        const result = await this.marketOrderRepo.manager.transaction(async (manager) => {
          this.bindTransactionRepos(context, manager);
          const cleanupResult = await this.sanitizeOpenOrdersInContext(context);
          const nextResult = await action(context);
          await this.persistTouchedOnlinePlayers(context);
          return this.mergeResults(cleanupResult, nextResult);
        });
        return result;
      } catch (error) {
        this.restoreMutationContext(context);
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`坊市结算失败，已回滚: ${message}`);
        return this.singleMessage(playerId, '坊市结算失败，已回滚本次操作。');
      }
    });
  }

  private async runExclusive<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.marketOperationQueue;
    let release!: () => void;
    this.marketOperationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  private createMutationContext(): MarketMutationContext {
    return {
      orderRepo: this.marketOrderRepo,
      tradeHistoryRepo: this.marketTradeHistoryRepo,
      playerRepo: this.playerRepo,
      openOrdersSnapshot: this.cloneOpenOrders(this.openOrders),
      onlinePlayerSnapshots: new Map(),
      touchedOnlinePlayerIds: new Set(),
    };
  }

  private bindTransactionRepos(context: MarketMutationContext, manager: EntityManager): void {
    context.orderRepo = manager.getRepository(MarketOrderEntity);
    context.tradeHistoryRepo = manager.getRepository(MarketTradeHistoryEntity);
    context.playerRepo = manager.getRepository(PlayerEntity);
  }

  private captureOnlinePlayerState(playerId: string, context: MarketMutationContext): void {
    if (context.onlinePlayerSnapshots.has(playerId)) {
      return;
    }
    const player = this.playerService.getPlayer(playerId);
    if (!player) {
      return;
    }
    context.onlinePlayerSnapshots.set(playerId, {
      inventory: {
        capacity: player.inventory.capacity,
        items: player.inventory.items.map((item) => ({ ...item })),
      },
      marketStorage: this.cloneStorage(player.marketStorage),
    });
  }

  private async persistTouchedOnlinePlayers(context: MarketMutationContext): Promise<void> {
    for (const playerId of context.touchedOnlinePlayerIds) {
      const player = this.playerService.getPlayer(playerId);
      if (!player) {
        continue;
      }
      await context.playerRepo.save(context.playerRepo.create({
        id: playerId,
        inventory: {
          capacity: player.inventory.capacity,
          items: player.inventory.items.map((item) => ({ ...item })),
        } as unknown as Record<string, unknown>,
        marketStorage: this.toPersistedStorage(player.marketStorage ?? { items: [] }) as unknown as Record<string, unknown>,
      }));
    }
  }

  private restoreMutationContext(context: MarketMutationContext): void {
    this.openOrders = this.cloneOpenOrders(context.openOrdersSnapshot);
    for (const [playerId, snapshot] of context.onlinePlayerSnapshots.entries()) {
      const player = this.playerService.getPlayer(playerId);
      if (!player) {
        continue;
      }
      player.inventory = {
        capacity: snapshot.inventory.capacity,
        items: snapshot.inventory.items.map((item) => ({ ...item })),
      };
      player.marketStorage = this.cloneStorage(snapshot.marketStorage);
    }
  }

  private cloneOpenOrders(source: MarketOrderEntity[]): MarketOrderEntity[] {
    return source.map((order) => this.marketOrderRepo.create({
      ...order,
      itemSnapshot: this.toPlainItem(order.itemSnapshot as unknown as ItemStack),
    }));
  }
}
