import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { EntityManager, Repository } from 'typeorm';
import {
  createItemStackSignature,
  DEFAULT_INVENTORY_CAPACITY,
  ItemStack,
  MarketListedItemView,
  MarketOrderBookView,
  MarketOrderSide,
  MarketOwnOrderView,
  MarketPriceLevelView,
  MarketStorage,
  MarketTradeHistoryEntryView,
  PlayerState,
  S2C_MarketUpdate,
  isValidMarketPrice,
} from '@mud/shared';
import { PlayerEntity } from '../database/entities/player.entity';
import { MarketOrderEntity } from '../database/entities/market-order.entity';
import { MarketTradeHistoryEntity } from '../database/entities/market-trade-history.entity';
import { MARKET_CURRENCY_ITEM_ID, MARKET_MAX_ORDER_QUANTITY, MARKET_MAX_UNIT_PRICE } from '../constants/gameplay/market';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';
import { PlayerService } from './player.service';

interface MarketMessage {
  playerId: string;
  text: string;
  kind?: 'system' | 'loot';
}

interface MarketPlayerSnapshot {
  inventory: {
    items: ItemStack[];
    capacity: number;
  };
  marketStorage: MarketStorage;
}

interface MarketMutationContext {
  orderRepo: Repository<MarketOrderEntity>;
  tradeHistoryRepo: Repository<MarketTradeHistoryEntity>;
  playerRepo: Repository<PlayerEntity>;
  openOrdersSnapshot: MarketOrderEntity[];
  onlinePlayerSnapshots: Map<string, MarketPlayerSnapshot>;
  touchedOnlinePlayerIds: Set<string>;
}

export interface MarketActionResult {
  affectedPlayerIds: string[];
  messages: MarketMessage[];
}

@Injectable()
export class MarketService implements OnModuleInit {
  private readonly logger = new Logger(MarketService.name);
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

  getCurrencyItemId(): string {
    return MARKET_CURRENCY_ITEM_ID;
  }

  getCurrencyItemName(): string {
    return this.contentService.getItem(MARKET_CURRENCY_ITEM_ID)?.name ?? '灵石';
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

  buildItemBook(itemKey: string): MarketOrderBookView | null {
    const orders = this.openOrders.filter((order) =>
      order.remainingQuantity > 0
      && this.canTradeItemOnMarket(this.cloneOrderItem(order))
      && this.getOrderItemKey(order) === itemKey);
    if (orders.length === 0) {
      return null;
    }
    const item = this.cloneOrderItem(orders[0]);
    return {
      itemKey,
      item,
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
        .map((record) => this.toTradeHistoryView(playerId, record)),
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
    if (item.count < quantity) {
      return this.singleMessage(player.id, '挂售数量超过了当前持有数量。');
    }
    if (!this.canTradeItemOnMarket(item)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}是坊市货币，不能挂售。`);
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
    let remaining = removed.count;
    const buyOrders = this.getSortedOrders(itemKey, 'buy')
      .filter((order) => order.ownerId !== player.id && order.unitPrice >= unitPrice);

    for (const buyOrder of buyOrders) {
      if (remaining <= 0) {
        break;
      }
      const tradeQuantity = Math.min(remaining, buyOrder.remainingQuantity);
      if (tradeQuantity <= 0) {
        continue;
      }
      const tradePrice = buyOrder.unitPrice;
      await this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
      await this.deliverItemToPlayer(player.id, this.createCurrencyItem(tradeQuantity * tradePrice), context);
      await this.recordTrade({
        buyerId: buyOrder.ownerId,
        sellerId: player.id,
        itemId: orderItem.itemId,
        quantity: tradeQuantity,
        unitPrice: tradePrice,
      }, context);
      remaining -= tradeQuantity;
      buyOrder.remainingQuantity -= tradeQuantity;
      buyOrder.updatedAt = Date.now();
      this.touchAffectedPlayer(result, buyOrder.ownerId);
      this.pushMessage(result, buyOrder.ownerId, `你的求购已成交：${orderItem.name} x${tradeQuantity}。`, 'loot');
      this.pushMessage(result, player.id, `你卖出了 ${orderItem.name} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${tradeQuantity * tradePrice}。`, 'loot');
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
      this.pushMessage(result, player.id, `已挂售 ${orderItem.name} x${remaining}，单价 ${unitPrice} ${this.getCurrencyItemName()}。`);
    }

    this.compactOpenOrders();
    return result;
  }

  async createBuyOrder(player: PlayerState, payload: { itemId: string; quantity: number; unitPrice: number }): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.createBuyOrderUnsafe(player, payload, context);
    });
  }

  private async createBuyOrderUnsafe(
    player: PlayerState,
    payload: { itemId: string; quantity: number; unitPrice: number },
    context: MarketMutationContext,
  ): Promise<MarketActionResult> {
    const item = this.contentService.createItem(payload.itemId, 1);
    if (!item) {
      return this.singleMessage(player.id, '求购的物品不存在。');
    }
    if (!this.canTradeItemOnMarket(item)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}是坊市货币，不能求购。`);
    }
    const quantity = this.normalizeQuantity(payload.quantity);
    const unitPrice = this.normalizeUnitPrice(payload.unitPrice);
    if (!quantity || !unitPrice) {
      return this.singleMessage(player.id, '求购数量或单价无效。');
    }
    const orderItem = this.toOrderItem(item);
    const itemKey = this.buildItemKey(orderItem);
    if (this.hasConflictingOpenOrder(player.id, itemKey, 'buy')) {
      return this.singleMessage(player.id, '同一种物品已在挂售中，不能同时求购。');
    }

    const totalCost = quantity * unitPrice;
    if (!this.consumeCurrencyFromInventory(player, totalCost)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}不足，无法挂出求购。`);
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

    const result = this.createEmptyResult(player.id);
    let remaining = quantity;
    const sellOrders = this.getSortedOrders(itemKey, 'sell')
      .filter((order) => order.ownerId !== player.id && order.unitPrice <= unitPrice);

    for (const sellOrder of sellOrders) {
      if (remaining <= 0) {
        break;
      }
      const tradeQuantity = Math.min(remaining, sellOrder.remainingQuantity);
      if (tradeQuantity <= 0) {
        continue;
      }
      const tradePrice = sellOrder.unitPrice;
      await this.deliverItemToPlayer(player.id, { ...orderItem, count: tradeQuantity }, context);
      await this.deliverItemToPlayer(sellOrder.ownerId, this.createCurrencyItem(tradeQuantity * tradePrice), context);
      await this.recordTrade({
        buyerId: player.id,
        sellerId: sellOrder.ownerId,
        itemId: orderItem.itemId,
        quantity: tradeQuantity,
        unitPrice: tradePrice,
      }, context);
      const refund = tradeQuantity * Math.max(0, unitPrice - tradePrice);
      if (refund > 0) {
        await this.deliverItemToPlayer(player.id, this.createCurrencyItem(refund), context);
      }
      remaining -= tradeQuantity;
      sellOrder.remainingQuantity -= tradeQuantity;
      sellOrder.updatedAt = Date.now();
      this.touchAffectedPlayer(result, sellOrder.ownerId);
      this.pushMessage(result, player.id, `你买入了 ${orderItem.name} x${tradeQuantity}，成交价 ${tradePrice}。`, 'loot');
      this.pushMessage(result, sellOrder.ownerId, `你的挂售已成交：${orderItem.name} x${tradeQuantity}，入账 ${this.getCurrencyItemName()} x${tradeQuantity * tradePrice}。`, 'loot');
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
      this.pushMessage(result, player.id, `已挂出求购 ${orderItem.name} x${remaining}，单价 ${unitPrice} ${this.getCurrencyItemName()}。`);
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
    const available = sells.reduce((sum, order) => sum + order.remainingQuantity, 0);
    if (available < quantity) {
      return this.singleMessage(player.id, `当前最多只能买到 ${available} 件。`);
    }
    const totalCost = this.calculateImmediateTotalCost(sells, quantity);
    if (!this.consumeCurrencyFromInventory(player, totalCost)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}不足，无法完成买入。`);
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

    const result = this.createEmptyResult(player.id);
    let remaining = quantity;
    const item = this.cloneOrderItem(sells[0]);

    for (const sellOrder of sells) {
      if (remaining <= 0) {
        break;
      }
      const tradeQuantity = Math.min(remaining, sellOrder.remainingQuantity);
      if (tradeQuantity <= 0) {
        continue;
      }
      const tradePrice = sellOrder.unitPrice;
      await this.deliverItemToPlayer(player.id, { ...item, count: tradeQuantity }, context);
      await this.deliverItemToPlayer(sellOrder.ownerId, this.createCurrencyItem(tradeQuantity * tradePrice), context);
      await this.recordTrade({
        buyerId: player.id,
        sellerId: sellOrder.ownerId,
        itemId: item.itemId,
        quantity: tradeQuantity,
        unitPrice: tradePrice,
      }, context);
      sellOrder.remainingQuantity -= tradeQuantity;
      sellOrder.updatedAt = Date.now();
      remaining -= tradeQuantity;
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
    const buys = this.getSortedOrders(this.buildItemKey(orderItem), 'buy')
      .filter((order) => order.ownerId !== player.id);
    if (buys.length === 0) {
      return this.singleMessage(player.id, '当前没有可直接成交的求购。');
    }
    const available = buys.reduce((sum, order) => sum + order.remainingQuantity, 0);
    if (available < quantity) {
      return this.singleMessage(player.id, `当前求购盘最多只能接下 ${available} 件。`);
    }

    const removed = this.inventoryService.removeItem(player, payload.slotIndex, quantity);
    if (!removed) {
      return this.singleMessage(player.id, '出售失败，未能扣除物品。');
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

    const result = this.createEmptyResult(player.id);
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
      const tradePrice = buyOrder.unitPrice;
      await this.deliverItemToPlayer(buyOrder.ownerId, { ...orderItem, count: tradeQuantity }, context);
      await this.deliverItemToPlayer(player.id, this.createCurrencyItem(tradeQuantity * tradePrice), context);
      await this.recordTrade({
        buyerId: buyOrder.ownerId,
        sellerId: player.id,
        itemId: orderItem.itemId,
        quantity: tradeQuantity,
        unitPrice: tradePrice,
      }, context);
      buyOrder.remainingQuantity -= tradeQuantity;
      buyOrder.updatedAt = Date.now();
      remaining -= tradeQuantity;
      totalIncome += tradeQuantity * tradePrice;
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
      await this.deliverItemToPlayer(player.id, this.createCurrencyItem(order.remainingQuantity * order.unitPrice), context);
    }

    order.updatedAt = Date.now();
    await this.persistOrderState(order, 'cancelled', context);
    this.compactOpenOrders();
    return this.singleMessage(player.id, '订单已取消，剩余托管物已退回你的坊市托管仓。');
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
    if (nextItems.length > 0) {
      return this.singleMessage(player.id, `已领取部分托管物，共 ${movedCount} 件，其余因背包空间不足仍保留在坊市托管仓。`, 'loot');
    }
    return this.singleMessage(player.id, `已领取坊市托管仓中的全部物品，共 ${movedCount} 件。`, 'loot');
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
      if (!item || !this.canTradeItemOnMarket(item)) {
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
      if (!this.canTradeItemOnMarket(item)) {
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

  private buildOwnOrders(playerId: string): MarketOwnOrderView[] {
    return this.openOrders
      .filter((order) => order.ownerId === playerId && order.remainingQuantity > 0 && this.canTradeItemOnMarket(this.cloneOrderItem(order)))
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
        || !this.canTradeItemOnMarket(orderItem)
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

  private getSortedOrders(itemKey: string, side: MarketOrderSide): MarketOrderEntity[] {
    return this.openOrders
      .filter((order) => {
        if (order.side !== side || order.remainingQuantity <= 0) {
          return false;
        }
        const orderItem = this.cloneOrderItem(order);
        return this.canTradeItemOnMarket(orderItem) && this.getOrderItemKey(order) === itemKey;
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
      && this.canTradeItemOnMarket(this.cloneOrderItem(order)));
  }

  private calculateImmediateTotalCost(orders: MarketOrderEntity[], quantity: number): number {
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

  private buildItemKey(item: ItemStack): string {
    return createItemStackSignature({
      ...item,
      count: 1,
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
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
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
        for (const order of this.openOrders) {
          const orderItem = this.cloneOrderItem(order);
          const canonicalKey = this.getOrderItemKey(order);
          if (!this.canTradeItemOnMarket(orderItem)) {
            await this.refundInvalidOrder(order, context);
            continue;
          }
          if (order.itemKey !== canonicalKey) {
            order.itemKey = canonicalKey;
            order.updatedAt = Date.now();
            await context.orderRepo.save(order);
          }
        }
        await this.persistTouchedOnlinePlayers(context);
      });
    } catch (error) {
      this.restoreMutationContext(context);
      throw error;
    }
  }

  private async refundInvalidOrder(order: MarketOrderEntity, context: MarketMutationContext): Promise<void> {
    if (order.side === 'sell') {
      await this.deliverItemToPlayer(order.ownerId, this.createCurrencyItem(order.remainingQuantity), context);
    } else {
      await this.deliverItemToPlayer(order.ownerId, this.createCurrencyItem(order.remainingQuantity * order.unitPrice), context);
    }
    order.status = 'cancelled';
    order.remainingQuantity = 0;
    order.updatedAt = Date.now();
    await context.orderRepo.save(order);
    this.logger.warn(`已自动取消非法坊市订单 ${order.id}，原因：坊市货币不可交易`);
  }

  private compactOpenOrders(): void {
    this.openOrders = this.openOrders.filter((order) => order.status === 'open' && order.remainingQuantity > 0);
  }

  private createEmptyResult(playerId: string): MarketActionResult {
    return {
      affectedPlayerIds: [playerId],
      messages: [],
    };
  }

  private singleMessage(playerId: string, text: string, kind: 'system' | 'loot' = 'system'): MarketActionResult {
    return {
      affectedPlayerIds: [playerId],
      messages: [{ playerId, text, kind }],
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

  private async runExclusiveMarketMutation(
    playerId: string,
    action: (context: MarketMutationContext) => Promise<MarketActionResult>,
  ): Promise<MarketActionResult> {
    return this.runExclusive(async () => {
      const context = this.createMutationContext();
      try {
        const result = await this.marketOrderRepo.manager.transaction(async (manager) => {
          this.bindTransactionRepos(context, manager);
          const nextResult = await action(context);
          await this.persistTouchedOnlinePlayers(context);
          return nextResult;
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
