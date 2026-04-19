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
/** playerId：定义该变量以承载业务值。 */
  playerId: string;
/** text：定义该变量以承载业务值。 */
  text: string;
  kind?: 'system' | 'loot';
}

/** MarketPlayerSnapshot：定义该接口的能力与字段约束。 */
interface MarketPlayerSnapshot {
  inventory: {
/** items：定义该变量以承载业务值。 */
    items: ItemStack[];
/** capacity：定义该变量以承载业务值。 */
    capacity: number;
  };
/** marketStorage：定义该变量以承载业务值。 */
  marketStorage: MarketStorage;
}

/** MarketMutationContext：定义该接口的能力与字段约束。 */
interface MarketMutationContext {
/** orderRepo：定义该变量以承载业务值。 */
  orderRepo: Repository<MarketOrderEntity>;
/** tradeHistoryRepo：定义该变量以承载业务值。 */
  tradeHistoryRepo: Repository<MarketTradeHistoryEntity>;
/** playerRepo：定义该变量以承载业务值。 */
  playerRepo: Repository<PlayerEntity>;
/** openOrdersSnapshot：定义该变量以承载业务值。 */
  openOrdersSnapshot: MarketOrderEntity[];
/** onlinePlayerSnapshots：定义该变量以承载业务值。 */
  onlinePlayerSnapshots: Map<string, MarketPlayerSnapshot>;
/** touchedOnlinePlayerIds：定义该变量以承载业务值。 */
  touchedOnlinePlayerIds: Set<string>;
}

/** MarketActionResult：定义该接口的能力与字段约束。 */
export interface MarketActionResult {
/** affectedPlayerIds：定义该变量以承载业务值。 */
  affectedPlayerIds: string[];
/** messages：定义该变量以承载业务值。 */
  messages: MarketMessage[];
/** privateStatePlayerIds：定义该变量以承载业务值。 */
  privateStatePlayerIds: string[];
/** touchedItemIds：定义该变量以承载业务值。 */
  touchedItemIds: string[];
/** tradeHistoryPlayerIds：定义该变量以承载业务值。 */
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
/** openOrders：定义该变量以承载业务值。 */
  private openOrders: MarketOrderEntity[] = [];
/** marketOperationQueue：定义该变量以承载业务值。 */
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

/** onModuleInit：执行对应的业务逻辑。 */
  async onModuleInit(): Promise<void> {
    await this.ensureMarketUnitPriceCapacity();
    await this.reloadOpenOrders();
  }

/** reloadOpenOrders：执行对应的业务逻辑。 */
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

/** refreshInvalidOrders：执行对应的业务逻辑。 */
  async refreshInvalidOrders(): Promise<MarketActionResult> {
    return this.runExclusive(async () => {
/** context：定义该变量以承载业务值。 */
      const context = this.createMutationContext();
      try {
        return await this.marketOrderRepo.manager.transaction(async (manager) => {
          this.bindTransactionRepos(context, manager);
/** result：定义该变量以承载业务值。 */
          const result = await this.sanitizeOpenOrdersInContext(context);
          await this.persistTouchedOnlinePlayers(context);
          return result;
        });
      } catch (error) {
        this.restoreMutationContext(context);
/** message：定义该变量以承载业务值。 */
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`坊市无效订单清理失败，已回滚: ${message}`);
        return this.createBaseResult();
      }
    });
  }

/** getCurrencyItemId：执行对应的业务逻辑。 */
  getCurrencyItemId(): string {
    return MARKET_CURRENCY_ITEM_ID;
  }

/** getCurrencyItemName：执行对应的业务逻辑。 */
  getCurrencyItemName(): string {
    return this.contentService.getItem(MARKET_CURRENCY_ITEM_ID)?.name ?? '灵石';
  }

  buildListingsPage(input: {
/** page：定义该变量以承载业务值。 */
    page: number;
    pageSize?: number;
    category?: ItemType | 'all';
    equipmentSlot?: EquipSlot | 'all';
    techniqueCategory?: TechniqueCategory | 'all';
  }): S2C_MarketListings {
/** category：定义该变量以承载业务值。 */
    const category = input.category ?? 'all';
/** equipmentSlot：定义该变量以承载业务值。 */
    const equipmentSlot = input.equipmentSlot ?? 'all';
/** techniqueCategory：定义该变量以承载业务值。 */
    const techniqueCategory = input.techniqueCategory ?? 'all';
/** pageSize：定义该变量以承载业务值。 */
    const pageSize = this.normalizeListingsPageSize(input.pageSize);
/** filtered：定义该变量以承载业务值。 */
    const filtered = this.filterMarketItems(this.buildListingGroups(), {
      category,
      equipmentSlot,
      techniqueCategory,
    });
/** total：定义该变量以承载业务值。 */
    const total = filtered.length;
/** totalPages：定义该变量以承载业务值。 */
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
/** page：定义该变量以承载业务值。 */
    const page = Math.max(1, Math.min(totalPages, Math.floor(Number.isFinite(input.page) ? input.page : 1)));
/** start：定义该变量以承载业务值。 */
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

/** buildOrdersUpdate：执行对应的业务逻辑。 */
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

/** buildStorageUpdate：执行对应的业务逻辑。 */
  buildStorageUpdate(player: PlayerState): S2C_MarketStorage {
/** grouped：定义该变量以承载业务值。 */
    const grouped = new Map<string, { item: ItemStack; count: number }>();
    for (const item of player.marketStorage?.items ?? []) {
      if (!item?.itemId || !Number.isFinite(item.count) || item.count <= 0) {
        continue;
      }
/** normalized：定义该变量以承载业务值。 */
      const normalized = this.toOrderItem(item);
/** itemKey：定义该变量以承载业务值。 */
      const itemKey = this.buildItemKey(normalized);
/** current：定义该变量以承载业务值。 */
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

/** buildMarketUpdate：执行对应的业务逻辑。 */
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
/** orders：定义该变量以承载业务值。 */
    const orders = this.openOrders.filter((order) => {
/** orderItem：定义该变量以承载业务值。 */
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

/** buildTradeHistoryPage：执行对应的业务逻辑。 */
  async buildTradeHistoryPage(playerId: string, page: number): Promise<{
/** page：定义该变量以承载业务值。 */
    page: number;
/** pageSize：定义该变量以承载业务值。 */
    pageSize: number;
/** totalVisible：定义该变量以承载业务值。 */
    totalVisible: number;
/** records：定义该变量以承载业务值。 */
    records: MarketTradeHistoryEntryView[];
  }> {
/** visibleRecords：定义该变量以承载业务值。 */
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
/** totalVisible：定义该变量以承载业务值。 */
    const totalVisible = visibleRecords.length;
/** totalPages：定义该变量以承载业务值。 */
    const totalPages = Math.max(1, Math.ceil(totalVisible / MarketService.TRADE_HISTORY_PAGE_SIZE));
/** normalizedPage：定义该变量以承载业务值。 */
    const normalizedPage = Math.max(1, Math.min(totalPages, Math.floor(Number.isFinite(page) ? page : 1)));
/** start：定义该变量以承载业务值。 */
    const start = (normalizedPage - 1) * MarketService.TRADE_HISTORY_PAGE_SIZE;
    return {
      page: normalizedPage,
      pageSize: MarketService.TRADE_HISTORY_PAGE_SIZE,
      totalVisible,
      records: visibleRecords
        .slice(start, start + MarketService.TRADE_HISTORY_PAGE_SIZE)
        .map((record) => ({
          id: record.id,
/** side：定义该变量以承载业务值。 */
          side: record.buyerId === playerId ? 'buy' : 'sell',
          itemId: record.itemId,
          itemName: this.contentService.getItem(record.itemId)?.name ?? record.itemId,
          quantity: record.quantity,
          unitPrice: record.unitPrice,
          createdAt: record.createdAt,
        })),
    };
  }

/** createSellOrder：执行对应的业务逻辑。 */
  async createSellOrder(player: PlayerState, payload: { slotIndex: number; quantity: number; unitPrice: number }): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.createSellOrderUnsafe(player, payload, context);
    });
  }

  private async createSellOrderUnsafe(
    player: PlayerState,
/** payload：定义该变量以承载业务值。 */
    payload: { slotIndex: number; quantity: number; unitPrice: number },
    context: MarketMutationContext,
  ): Promise<MarketActionResult> {
/** item：定义该变量以承载业务值。 */
    const item = this.inventoryService.getItem(player, payload.slotIndex);
    if (!item) {
      return this.singleMessage(player.id, '要挂售的物品不存在。');
    }
/** quantity：定义该变量以承载业务值。 */
    const quantity = this.normalizeQuantity(payload.quantity);
/** unitPrice：定义该变量以承载业务值。 */
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
/** orderItem：定义该变量以承载业务值。 */
    const orderItem = this.toOrderItem(item);
/** itemKey：定义该变量以承载业务值。 */
    const itemKey = this.buildItemKey(orderItem);
    if (this.hasConflictingOpenOrder(player.id, itemKey, 'sell')) {
      return this.singleMessage(player.id, '同一种物品已在求购中，不能同时挂售。');
    }

/** removed：定义该变量以承载业务值。 */
    const removed = this.inventoryService.removeItem(player, payload.slotIndex, quantity);
    if (!removed) {
      return this.singleMessage(player.id, '挂售失败，未能扣除物品。');
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

/** result：定义该变量以承载业务值。 */
    const result = this.createEmptyResult(player.id);
    this.touchPrivateStatePlayer(result, player.id);
    this.touchItem(result, orderItem.itemId);
/** buyOrders：定义该变量以承载业务值。 */
    const buyOrders = this.getSortedOrders(itemKey, 'buy')
      .filter((order) => order.ownerId !== player.id && order.unitPrice >= unitPrice);
/** matchPlan：定义该变量以承载业务值。 */
    const matchPlan = this.planOrderMatches(buyOrders, removed.count, unitPrice);
/** remaining：定义该变量以承载业务值。 */
    let remaining = matchPlan.remainingQuantity;

    for (const match of matchPlan.matches) {
      const buyOrder = match.order;
      const tradeQuantity = match.quantity;
/** tradePrice：定义该变量以承载业务值。 */
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
/** now：定义该变量以承载业务值。 */
      const now = Date.now();
/** order：定义该变量以承载业务值。 */
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

/** createBuyOrder：执行对应的业务逻辑。 */
  async createBuyOrder(player: PlayerState, payload: { itemKey: string; quantity: number; unitPrice: number }): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.createBuyOrderUnsafe(player, payload, context);
    });
  }

  private async createBuyOrderUnsafe(
    player: PlayerState,
/** payload：定义该变量以承载业务值。 */
    payload: { itemKey: string; quantity: number; unitPrice: number },
    context: MarketMutationContext,
  ): Promise<MarketActionResult> {
/** item：定义该变量以承载业务值。 */
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
/** quantity：定义该变量以承载业务值。 */
    const quantity = this.normalizeQuantity(payload.quantity);
/** unitPrice：定义该变量以承载业务值。 */
    const unitPrice = this.normalizeUnitPrice(payload.unitPrice);
    if (!quantity || !unitPrice) {
      return this.singleMessage(player.id, '求购数量或单价无效。');
    }
    if (!isValidMarketTradeQuantity(unitPrice, quantity)) {
      return this.singleMessage(player.id, this.buildTradeQuantityError(unitPrice));
    }
/** orderItem：定义该变量以承载业务值。 */
    const orderItem = this.toOrderItem(item);
/** itemKey：定义该变量以承载业务值。 */
    const itemKey = this.buildItemKey(orderItem);
    if (this.hasConflictingOpenOrder(player.id, itemKey, 'buy')) {
      return this.singleMessage(player.id, '同一种物品已在挂售中，不能同时求购。');
    }

/** totalCost：定义该变量以承载业务值。 */
    const totalCost = calculateMarketTradeTotalCost(quantity, unitPrice);
    if (totalCost === null) {
      return this.singleMessage(player.id, this.buildTradeQuantityError(unitPrice));
    }
    if (!this.consumeCurrencyFromInventory(player, totalCost)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}不足，无法挂出求购。`);
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

/** result：定义该变量以承载业务值。 */
    const result = this.createEmptyResult(player.id);
    this.touchPrivateStatePlayer(result, player.id);
    this.touchItem(result, orderItem.itemId);
/** sellOrders：定义该变量以承载业务值。 */
    const sellOrders = this.getSortedOrders(itemKey, 'sell')
      .filter((order) => order.ownerId !== player.id && order.unitPrice <= unitPrice);
/** matchPlan：定义该变量以承载业务值。 */
    const matchPlan = this.planOrderMatches(sellOrders, quantity, unitPrice);
/** remaining：定义该变量以承载业务值。 */
    let remaining = matchPlan.remainingQuantity;

    for (const match of matchPlan.matches) {
      const sellOrder = match.order;
      const tradeQuantity = match.quantity;
/** tradePrice：定义该变量以承载业务值。 */
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
/** reservedCost：定义该变量以承载业务值。 */
      const reservedCost = calculateMarketTradeTotalCost(tradeQuantity, unitPrice) ?? match.totalCost;
/** refund：定义该变量以承载业务值。 */
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
/** now：定义该变量以承载业务值。 */
      const now = Date.now();
/** order：定义该变量以承载业务值。 */
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

/** buyNow：执行对应的业务逻辑。 */
  async buyNow(player: PlayerState, payload: { itemKey: string; quantity: number }): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.buyNowUnsafe(player, payload, context);
    });
  }

  private async buyNowUnsafe(
    player: PlayerState,
/** payload：定义该变量以承载业务值。 */
    payload: { itemKey: string; quantity: number },
    context: MarketMutationContext,
  ): Promise<MarketActionResult> {
/** quantity：定义该变量以承载业务值。 */
    const quantity = this.normalizeQuantity(payload.quantity);
    if (!quantity) {
      return this.singleMessage(player.id, '买入数量无效。');
    }
/** sells：定义该变量以承载业务值。 */
    const sells = this.getSortedOrders(payload.itemKey, 'sell')
      .filter((order) => order.ownerId !== player.id);
    if (sells.length === 0) {
      return this.singleMessage(player.id, '当前没有可买入的挂售。');
    }
/** plan：定义该变量以承载业务值。 */
    const plan = this.planOrderMatches(sells, quantity);
    if (plan.fulfilledQuantity < quantity) {
      return this.singleMessage(player.id, `当前最多只能买到 ${plan.fulfilledQuantity} 件。`);
    }
/** totalCost：定义该变量以承载业务值。 */
    const totalCost = plan.totalCost;
    if (!this.consumeCurrencyFromInventory(player, totalCost)) {
      return this.singleMessage(player.id, `${this.getCurrencyItemName()}不足，无法完成买入。`);
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

/** result：定义该变量以承载业务值。 */
    const result = this.createEmptyResult(player.id);
    this.touchPrivateStatePlayer(result, player.id);
/** item：定义该变量以承载业务值。 */
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

/** sellNow：执行对应的业务逻辑。 */
  async sellNow(player: PlayerState, payload: { slotIndex: number; quantity: number }): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.sellNowUnsafe(player, payload, context);
    });
  }

  private async sellNowUnsafe(
    player: PlayerState,
/** payload：定义该变量以承载业务值。 */
    payload: { slotIndex: number; quantity: number },
    context: MarketMutationContext,
  ): Promise<MarketActionResult> {
/** item：定义该变量以承载业务值。 */
    const item = this.inventoryService.getItem(player, payload.slotIndex);
    if (!item) {
      return this.singleMessage(player.id, '要出售的物品不存在。');
    }
/** quantity：定义该变量以承载业务值。 */
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
/** orderItem：定义该变量以承载业务值。 */
    const orderItem = this.toOrderItem(item);
    if (!this.isSupportedMarketItem(orderItem)) {
      return this.singleMessage(player.id, `该物品强化等级超过坊市支持上限 +${MAX_ENHANCE_LEVEL}，无法出售给求购盘。`);
    }
/** buys：定义该变量以承载业务值。 */
    const buys = this.getSortedOrders(this.buildItemKey(orderItem), 'buy')
      .filter((order) => order.ownerId !== player.id);
    if (buys.length === 0) {
      return this.singleMessage(player.id, '当前没有可直接成交的求购。');
    }
/** plan：定义该变量以承载业务值。 */
    const plan = this.planOrderMatches(buys, quantity);
    if (plan.fulfilledQuantity < quantity) {
      return this.singleMessage(player.id, `当前求购盘最多只能接下 ${plan.fulfilledQuantity} 件。`);
    }

/** removed：定义该变量以承载业务值。 */
    const removed = this.inventoryService.removeItem(player, payload.slotIndex, quantity);
    if (!removed) {
      return this.singleMessage(player.id, '出售失败，未能扣除物品。');
    }
    this.playerService.markDirty(player.id, 'inv');
    context.touchedOnlinePlayerIds.add(player.id);

/** result：定义该变量以承载业务值。 */
    const result = this.createEmptyResult(player.id);
    this.touchPrivateStatePlayer(result, player.id);
/** totalIncome：定义该变量以承载业务值。 */
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

/** cancelOrder：执行对应的业务逻辑。 */
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
/** order：定义该变量以承载业务值。 */
    const order = this.openOrders.find((entry) => entry.id === payload.orderId && entry.ownerId === player.id);
    if (!order) {
      return this.singleMessage(player.id, '未找到可取消的订单。');
    }

    if (order.side === 'sell') {
      await this.deliverItemToPlayer(player.id, { ...this.cloneOrderItem(order), count: order.remainingQuantity }, context);
    } else {
/** refund：定义该变量以承载业务值。 */
      const refund = calculateMarketTradeTotalCost(order.remainingQuantity, order.unitPrice);
      if (refund) {
        await this.deliverItemToPlayer(player.id, this.createCurrencyItem(refund), context);
      }
    }

/** result：定义该变量以承载业务值。 */
    const result = this.singleMessage(player.id, '订单已取消，剩余托管物已退回你的坊市托管仓。');
    this.touchPrivateStatePlayer(result, player.id);
    this.touchItem(result, this.cloneOrderItem(order).itemId);
    order.updatedAt = Date.now();
    await this.persistOrderState(order, 'cancelled', context);
    this.compactOpenOrders();
    return result;
  }

/** claimStorage：执行对应的业务逻辑。 */
  async claimStorage(player: PlayerState): Promise<MarketActionResult> {
    return this.runExclusiveMarketMutation(player.id, async (context) => {
      this.captureOnlinePlayerState(player.id, context);
      return this.claimStorageUnsafe(player, context);
    });
  }

/** claimStorageUnsafe：执行对应的业务逻辑。 */
  private async claimStorageUnsafe(player: PlayerState, context: MarketMutationContext): Promise<MarketActionResult> {
/** storage：定义该变量以承载业务值。 */
    const storage = player.marketStorage ?? { items: [] };
    if (storage.items.length === 0) {
      return this.singleMessage(player.id, '坊市托管仓里暂时没有可领取的物品。');
    }

/** movedCount：定义该变量以承载业务值。 */
    let movedCount = 0;
/** nextItems：定义该变量以承载业务值。 */
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
/** result：定义该变量以承载业务值。 */
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

/** buildListedItems：执行对应的业务逻辑。 */
  private buildListedItems(): MarketListedItemView[] {
/** grouped：定义该变量以承载业务值。 */
    const grouped = new Map<string, {
/** item：定义该变量以承载业务值。 */
      item: ItemStack;
/** sellOrderCount：定义该变量以承载业务值。 */
      sellOrderCount: number;
/** sellQuantity：定义该变量以承载业务值。 */
      sellQuantity: number;
      lowestSellPrice?: number;
/** buyOrderCount：定义该变量以承载业务值。 */
      buyOrderCount: number;
/** buyQuantity：定义该变量以承载业务值。 */
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
/** item：定义该变量以承载业务值。 */
      const item = this.cloneOrderItem(order);
      if (!this.isSupportedMarketItem(item) || !this.isOrderItemDefined(item)) {
        continue;
      }
/** itemKey：定义该变量以承载业务值。 */
      const itemKey = this.buildItemKey(item);
/** current：定义该变量以承载业务值。 */
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
/** leftLevel：定义该变量以承载业务值。 */
        const leftLevel = this.contentService.getItemSortLevel(left.item);
/** rightLevel：定义该变量以承载业务值。 */
        const rightLevel = this.contentService.getItemSortLevel(right.item);
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

/** buildListingGroups：执行对应的业务逻辑。 */
  private buildListingGroups(): S2C_MarketListings['items'] {
/** grouped：定义该变量以承载业务值。 */
    const grouped = new Map<string, S2C_MarketListings['items'][number]>();
    for (const entry of this.buildListedItems()) {
      const canEnhance = this.canGroupEnhancementVariants(entry.item);
      const groupKey = canEnhance ? entry.item.itemId : entry.itemKey;
/** current：定义该变量以承载业务值。 */
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
/** variants：定义该变量以承载业务值。 */
        const variants = entry.canEnhance
          ? this.fillEnhancementListingVariants(entry.itemId, entry.variants)
          : [...entry.variants];
/** zeroVariant：定义该变量以承载业务值。 */
        const zeroVariant = variants.find((variant) => Math.max(0, Math.floor(Number(variant.item.enhanceLevel) || 0)) === 0) ?? null;
        return {
          ...entry,
          item: zeroVariant?.item ? { ...zeroVariant.item } : { ...entry.item },
          lowestSellPrice: zeroVariant?.lowestSellPrice,
          highestBuyPrice: zeroVariant?.highestBuyPrice,
          variants: variants.sort((left, right) => {
/** leftEnhanceLevel：定义该变量以承载业务值。 */
          const leftEnhanceLevel = Math.max(0, Math.floor(Number(left.item.enhanceLevel) || 0));
/** rightEnhanceLevel：定义该变量以承载业务值。 */
          const rightEnhanceLevel = Math.max(0, Math.floor(Number(right.item.enhanceLevel) || 0));
          if (leftEnhanceLevel !== rightEnhanceLevel) {
            return leftEnhanceLevel - rightEnhanceLevel;
          }
/** leftPrice：定义该变量以承载业务值。 */
          const leftPrice = left.lowestSellPrice ?? Number.MAX_SAFE_INTEGER;
/** rightPrice：定义该变量以承载业务值。 */
          const rightPrice = right.lowestSellPrice ?? Number.MAX_SAFE_INTEGER;
          if (leftPrice !== rightPrice) {
            return leftPrice - rightPrice;
          }
          return left.itemKey.localeCompare(right.itemKey);
        }),
        };
      })
      .sort((left, right) => {
/** leftLevel：定义该变量以承载业务值。 */
        const leftLevel = this.contentService.getItemSortLevel(left.item);
/** rightLevel：定义该变量以承载业务值。 */
        const rightLevel = this.contentService.getItemSortLevel(right.item);
        if (leftLevel !== rightLevel) {
          return leftLevel - rightLevel;
        }
/** leftHasSell：定义该变量以承载业务值。 */
        const leftHasSell = left.variants.some((variant) => variant.sellQuantity > 0) ? 1 : 0;
/** rightHasSell：定义该变量以承载业务值。 */
        const rightHasSell = right.variants.some((variant) => variant.sellQuantity > 0) ? 1 : 0;
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
  private buildOwnOrders(playerId: string): MarketOwnOrderView[] {
    return this.openOrders
      .filter((order) => {
/** orderItem：定义该变量以承载业务值。 */
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

/** buildPriceLevels：执行对应的业务逻辑。 */
  private buildPriceLevels(itemKey: string, side: MarketOrderSide): MarketPriceLevelView[] {
/** grouped：定义该变量以承载业务值。 */
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
/** current：定义该变量以承载业务值。 */
      const current = grouped.get(order.unitPrice) ?? { quantity: 0, orderCount: 0 };
      current.quantity += order.remainingQuantity;
      current.orderCount += 1;
      grouped.set(order.unitPrice, current);
    }
/** levels：定义该变量以承载业务值。 */
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
/** category：定义该变量以承载业务值。 */
      category: ItemType | 'all';
/** equipmentSlot：定义该变量以承载业务值。 */
      equipmentSlot: EquipSlot | 'all';
/** techniqueCategory：定义该变量以承载业务值。 */
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

/** resolveTechniqueCategoryForItem：执行对应的业务逻辑。 */
  private resolveTechniqueCategoryForItem(itemId: string): TechniqueCategory | null {
/** techniqueId：定义该变量以承载业务值。 */
    const techniqueId = this.resolveTechniqueIdFromBookItemId(itemId);
    if (!techniqueId) {
      return null;
    }
    return this.contentService.getTechnique(techniqueId)?.category ?? null;
  }

/** resolveTechniqueIdFromBookItemId：执行对应的业务逻辑。 */
  private resolveTechniqueIdFromBookItemId(itemId: string): string | null {
    if (itemId.startsWith('book.')) {
      return itemId.slice(5);
    }
    if (itemId.startsWith('book_')) {
      return itemId.slice(5);
    }
    return null;
  }

/** normalizeListingsPageSize：执行对应的业务逻辑。 */
  private normalizeListingsPageSize(pageSize: number | undefined): number {
    if (!Number.isFinite(pageSize)) {
      return 24;
    }
    return Math.max(8, Math.min(48, Math.floor(Number(pageSize))));
  }

/** getSortedOrders：执行对应的业务逻辑。 */
  private getSortedOrders(itemKey: string, side: MarketOrderSide): MarketOrderEntity[] {
    return this.openOrders
      .filter((order) => {
        if (order.side !== side || order.remainingQuantity <= 0) {
          return false;
        }
/** orderItem：定义该变量以承载业务值。 */
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

/** hasConflictingOpenOrder：执行对应的业务逻辑。 */
  private hasConflictingOpenOrder(ownerId: string, itemKey: string, nextSide: MarketOrderSide): boolean {
/** oppositeSide：定义该变量以承载业务值。 */
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
/** matches：定义该变量以承载业务值。 */
    matches: Array<{ order: MarketOrderEntity; quantity: number; totalCost: number }>;
/** fulfilledQuantity：定义该变量以承载业务值。 */
    fulfilledQuantity: number;
/** remainingQuantity：定义该变量以承载业务值。 */
    remainingQuantity: number;
/** totalCost：定义该变量以承载业务值。 */
    totalCost: number;
  } {
/** remaining：定义该变量以承载业务值。 */
    let remaining = quantity;
/** total：定义该变量以承载业务值。 */
    let total = 0;
/** matches：定义该变量以承载业务值。 */
    const matches: Array<{ order: MarketOrderEntity; quantity: number; totalCost: number }> = [];
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

/** getCompatibleTradeQuantity：执行对应的业务逻辑。 */
  private getCompatibleTradeQuantity(maxQuantity: number, ...unitPrices: Array<number | undefined>): number {
    if (maxQuantity <= 0) {
      return 0;
    }
/** quantityStep：定义该变量以承载业务值。 */
    let quantityStep = 1;
    for (const unitPrice of unitPrices) {
      if (!unitPrice || !isValidMarketPrice(unitPrice)) {
        continue;
      }
      quantityStep = this.leastCommonMultiple(quantityStep, getMarketMinimumTradeQuantity(unitPrice));
    }
    return Math.floor(maxQuantity / quantityStep) * quantityStep;
  }

/** leastCommonMultiple：执行对应的业务逻辑。 */
  private leastCommonMultiple(left: number, right: number): number {
    if (left <= 0 || right <= 0) {
      return 0;
    }
    return (left / this.greatestCommonDivisor(left, right)) * right;
  }

/** greatestCommonDivisor：执行对应的业务逻辑。 */
  private greatestCommonDivisor(left: number, right: number): number {
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
  private buildItemKey(item: ItemStack): string {
/** enhanceLevel：定义该变量以承载业务值。 */
    const enhanceLevel = this.getSupportedMarketEnhanceLevel(item);
    if (this.canGroupEnhancementVariants(item) && enhanceLevel !== null) {
      return createItemStackSignature(this.createEnhancementVariantItem(item.itemId, enhanceLevel));
    }
    return createItemStackSignature({
      ...item,
      count: 1,
    });
  }

/** createDisplayItemForListingGroup：执行对应的业务逻辑。 */
  private createDisplayItemForListingGroup(itemId: string, fallback: ItemStack): ItemStack {
/** template：定义该变量以承载业务值。 */
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

/** canGroupEnhancementVariants：执行对应的业务逻辑。 */
  private canGroupEnhancementVariants(item: ItemStack): boolean {
    return item.type === 'equipment';
  }

  private fillEnhancementListingVariants(
    itemId: string,
    variants: S2C_MarketListings['items'][number]['variants'],
  ): S2C_MarketListings['items'][number]['variants'] {
/** byLevel：定义该变量以承载业务值。 */
    const byLevel = new Map<number, S2C_MarketListings['items'][number]['variants'][number]>();
    variants.forEach((variant) => {
/** level：定义该变量以承载业务值。 */
      const level = this.getSupportedMarketEnhanceLevel(variant.item);
      if (level === null) {
        return;
      }
/** item：定义该变量以承载业务值。 */
      const item = this.createEnhancementVariantItem(itemId, level);
/** current：定义该变量以承载业务值。 */
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
/** item：定义该变量以承载业务值。 */
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

/** createEnhancementVariantItem：执行对应的业务逻辑。 */
  private createEnhancementVariantItem(itemId: string, enhanceLevel: number): ItemStack {
/** template：定义该变量以承载业务值。 */
    const template = this.contentService.createItem(itemId, 1);
/** base：定义该变量以承载业务值。 */
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

/** toOrderItem：执行对应的业务逻辑。 */
  private toOrderItem(item: ItemStack): ItemStack {
/** normalized：定义该变量以承载业务值。 */
    const normalized = this.contentService.normalizeItemStack(item);
    return {
      ...normalized,
      count: 1,
    };
  }

/** cloneOrderItem：执行对应的业务逻辑。 */
  private cloneOrderItem(order: MarketOrderEntity): ItemStack {
    return this.toOrderItem(order.itemSnapshot as unknown as ItemStack);
  }

/** getOrderItemKey：执行对应的业务逻辑。 */
  private getOrderItemKey(order: MarketOrderEntity): string {
    return this.buildItemKey(this.cloneOrderItem(order));
  }

/** createCurrencyItem：执行对应的业务逻辑。 */
  private createCurrencyItem(count: number): ItemStack {
    return this.contentService.createItem(MARKET_CURRENCY_ITEM_ID, count) ?? {
      itemId: MARKET_CURRENCY_ITEM_ID,
      name: this.getCurrencyItemName(),
      type: 'consumable',
      count,
      desc: '坊市通行货币。',
    };
  }

/** canTradeItemOnMarket：执行对应的业务逻辑。 */
  private canTradeItemOnMarket(item: Pick<ItemStack, 'itemId'>): boolean {
    return item.itemId !== MARKET_CURRENCY_ITEM_ID;
  }

/** getSupportedMarketEnhanceLevel：执行对应的业务逻辑。 */
  private getSupportedMarketEnhanceLevel(item: ItemStack): number | null {
    if (!this.canGroupEnhancementVariants(item)) {
      return 0;
    }
/** level：定义该变量以承载业务值。 */
    const level = Math.max(0, Math.floor(Number(item.enhanceLevel) || 0));
    return level <= MAX_ENHANCE_LEVEL ? level : null;
  }

/** isSupportedMarketItem：执行对应的业务逻辑。 */
  private isSupportedMarketItem(item: ItemStack): boolean {
    return this.canTradeItemOnMarket(item)
      && (!this.canGroupEnhancementVariants(item) || this.getSupportedMarketEnhanceLevel(item) !== null);
  }

/** resolveBuyOrderItem：执行对应的业务逻辑。 */
  private resolveBuyOrderItem(player: PlayerState, itemKey: string): ItemStack | null {
/** listed：定义该变量以承载业务值。 */
    const listed = this.buildListedItems().find((entry) => entry.itemKey === itemKey)?.item;
    if (listed) {
      return { ...listed };
    }
/** inventoryItem：定义该变量以承载业务值。 */
    const inventoryItem = player.inventory.items.find((entry) => this.buildItemKey(this.toOrderItem(entry)) === itemKey);
    if (inventoryItem) {
      return this.toOrderItem(inventoryItem);
    }
/** parsed：定义该变量以承载业务值。 */
    const parsed = this.parseItemKey(itemKey);
    if (parsed) {
      return parsed;
    }
    return null;
  }

/** parseItemKey：执行对应的业务逻辑。 */
  private parseItemKey(itemKey: string): ItemStack | null {
    try {
/** candidate：定义该变量以承载业务值。 */
      const candidate = JSON.parse(itemKey) as Partial<ItemStack>;
/** itemId：定义该变量以承载业务值。 */
      const itemId = typeof candidate.itemId === 'string' ? candidate.itemId.trim() : '';
      if (!itemId) {
        return null;
      }
/** template：定义该变量以承载业务值。 */
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

/** isOrderItemDefined：执行对应的业务逻辑。 */
  private isOrderItemDefined(item: Pick<ItemStack, 'itemId'>): boolean {
    return Boolean(this.contentService.getItem(item.itemId));
  }

/** normalizeQuantity：执行对应的业务逻辑。 */
  private normalizeQuantity(value: number): number | null {
    if (!Number.isFinite(value)) {
      return null;
    }
/** quantity：定义该变量以承载业务值。 */
    const quantity = Math.floor(value);
    if (quantity <= 0 || quantity > MARKET_MAX_ORDER_QUANTITY) {
      return null;
    }
    return quantity;
  }

/** normalizeUnitPrice：执行对应的业务逻辑。 */
  private normalizeUnitPrice(value: number): number | null {
    if (!Number.isFinite(value)) {
      return null;
    }
/** unitPrice：定义该变量以承载业务值。 */
    const unitPrice = value;
    if (unitPrice <= 0 || unitPrice > MARKET_MAX_UNIT_PRICE) {
      return null;
    }
    if (!isValidMarketPrice(unitPrice)) {
      return null;
    }
    return unitPrice;
  }

/** ensureMarketUnitPriceCapacity：执行对应的业务逻辑。 */
  private async ensureMarketUnitPriceCapacity(): Promise<void> {
/** tableNames：定义该变量以承载业务值。 */
    const tableNames = [...new Set(MarketService.MARKET_PRICE_COLUMN_TABLES.map((entry) => entry.table))];
/** columnNames：定义该变量以承载业务值。 */
    const columnNames = [...new Set(MarketService.MARKET_PRICE_COLUMN_TABLES.map((entry) => entry.column))];
/** rows：定义该变量以承载业务值。 */
    const rows = await this.marketOrderRepo.query(`
      SELECT table_name, column_name, data_type, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
        AND column_name = ANY($2::text[])
    `, [tableNames, columnNames]);

/** columnsNeedingUpgrade：定义该变量以承载业务值。 */
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

/** quotePgIdentifier：执行对应的业务逻辑。 */
  private quotePgIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

/** buildTradeQuantityError：执行对应的业务逻辑。 */
  private buildTradeQuantityError(unitPrice: number): string {
/** minimumQuantity：定义该变量以承载业务值。 */
    const minimumQuantity = getMarketMinimumTradeQuantity(unitPrice);
    if (minimumQuantity <= 1) {
      return '挂售数量或单价无效。';
    }
    return `当前单价 ${this.formatUnitPrice(unitPrice)} ${this.getCurrencyItemName()} 时，数量必须是 ${minimumQuantity} 的倍数，才能按整灵石结算。`;
  }

/** formatUnitPrice：执行对应的业务逻辑。 */
  private formatUnitPrice(value: number): string {
    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(1).replace(/\.0$/, '');
  }

/** consumeCurrencyFromInventory：执行对应的业务逻辑。 */
  private consumeCurrencyFromInventory(player: PlayerState, count: number): boolean {
    if (count <= 0) {
      return true;
    }
/** owned：定义该变量以承载业务值。 */
    const owned = player.inventory.items
      .filter((item) => item.itemId === MARKET_CURRENCY_ITEM_ID)
      .reduce((sum, item) => sum + item.count, 0);
    if (owned < count) {
      return false;
    }
/** remaining：定义该变量以承载业务值。 */
    let remaining = count;
    for (let index = player.inventory.items.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const item = player.inventory.items[index];
      if (item.itemId !== MARKET_CURRENCY_ITEM_ID) {
        continue;
      }
/** removed：定义该变量以承载业务值。 */
      const removed = this.inventoryService.removeItem(player, index, remaining);
      if (!removed) {
        continue;
      }
      remaining -= removed.count;
    }
    return remaining === 0;
  }

/** deliverItemToPlayer：执行对应的业务逻辑。 */
  private async deliverItemToPlayer(playerId: string, item: ItemStack, context: MarketMutationContext): Promise<void> {
/** player：定义该变量以承载业务值。 */
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

/** entity：定义该变量以承载业务值。 */
    const entity = await context.playerRepo.findOne({ where: { id: playerId } });
    if (!entity) {
      this.logger.warn(`坊市结算时未找到玩家存档: ${playerId}`);
      return;
    }
/** storage：定义该变量以承载业务值。 */
    const storage = this.normalizeStorage(entity.marketStorage);
    await this.playerService.saveOfflineMarketStorage(playerId, this.mergeStorageItem(storage, item));
  }

/** mergeStorageItem：执行对应的业务逻辑。 */
  private mergeStorageItem(storage: MarketStorage | undefined, item: ItemStack): MarketStorage {
/** current：定义该变量以承载业务值。 */
    const current = this.cloneStorage(storage);
/** signature：定义该变量以承载业务值。 */
    const signature = createItemStackSignature(item);
/** existing：定义该变量以承载业务值。 */
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

/** normalizeStorage：执行对应的业务逻辑。 */
  private normalizeStorage(raw: unknown): MarketStorage {
/** source：定义该变量以承载业务值。 */
    const source = (typeof raw === 'object' && raw !== null ? raw : {}) as { items?: unknown[] };
/** items：定义该变量以承载业务值。 */
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

/** normalizeStorageItem：执行对应的业务逻辑。 */
  private normalizeStorageItem(raw: unknown): ItemStack | null {
    if (typeof raw !== 'object' || raw === null || typeof (raw as { itemId?: unknown }).itemId !== 'string') {
      return null;
    }
/** item：定义该变量以承载业务值。 */
    const item = raw as ItemStack;
    return this.contentService.normalizeItemStack({
      ...item,
      count: Math.max(1, Number.isFinite(item.count) ? Math.floor(item.count) : 1),
    });
  }

/** cloneStorage：执行对应的业务逻辑。 */
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

/** toPlainItem：执行对应的业务逻辑。 */
  private toPlainItem(item: ItemStack): Record<string, unknown> {
    return JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
  }

  private async recordTrade(payload: {
/** buyerId：定义该变量以承载业务值。 */
    buyerId: string;
/** sellerId：定义该变量以承载业务值。 */
    sellerId: string;
/** itemId：定义该变量以承载业务值。 */
    itemId: string;
/** quantity：定义该变量以承载业务值。 */
    quantity: number;
/** unitPrice：定义该变量以承载业务值。 */
    unitPrice: number;
  }, context: MarketMutationContext): Promise<void> {
/** now：定义该变量以承载业务值。 */
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

/** toTradeHistoryView：执行对应的业务逻辑。 */
  private toTradeHistoryView(playerId: string, record: MarketTradeHistoryEntity): MarketTradeHistoryEntryView {
/** itemName：定义该变量以承载业务值。 */
    const itemName = this.contentService.getItem(record.itemId)?.name
      ?? this.contentService.createItem(record.itemId, 1)?.name
      ?? record.itemId;
    return {
      id: record.id,
/** side：定义该变量以承载业务值。 */
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

/** sanitizeOpenOrders：执行对应的业务逻辑。 */
  private async sanitizeOpenOrders(): Promise<void> {
/** context：定义该变量以承载业务值。 */
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

/** sanitizeOpenOrdersInContext：执行对应的业务逻辑。 */
  private async sanitizeOpenOrdersInContext(context: MarketMutationContext): Promise<MarketActionResult> {
/** result：定义该变量以承载业务值。 */
    const result = this.createBaseResult();
    for (const order of this.openOrders) {
      const orderItem = this.cloneOrderItem(order);
      const canonicalKey = this.getOrderItemKey(order);
/** validUnitPrice：定义该变量以承载业务值。 */
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
/** refund：定义该变量以承载业务值。 */
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
/** refund：定义该变量以承载业务值。 */
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

/** compactOpenOrders：执行对应的业务逻辑。 */
  private compactOpenOrders(): void {
    this.openOrders = this.openOrders.filter((order) => order.status === 'open' && order.remainingQuantity > 0);
  }

/** createBaseResult：执行对应的业务逻辑。 */
  private createBaseResult(): MarketActionResult {
    return {
      affectedPlayerIds: [],
      messages: [],
      privateStatePlayerIds: [],
      touchedItemIds: [],
      tradeHistoryPlayerIds: [],
    };
  }

/** createEmptyResult：执行对应的业务逻辑。 */
  private createEmptyResult(playerId: string): MarketActionResult {
/** result：定义该变量以承载业务值。 */
    const result = this.createBaseResult();
    result.affectedPlayerIds.push(playerId);
    return result;
  }

/** mergeResults：执行对应的业务逻辑。 */
  private mergeResults(...results: MarketActionResult[]): MarketActionResult {
/** merged：定义该变量以承载业务值。 */
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

/** singleMessage：执行对应的业务逻辑。 */
  private singleMessage(playerId: string, text: string, kind: 'system' | 'loot' = 'system'): MarketActionResult {
    return {
      affectedPlayerIds: [playerId],
      messages: [{ playerId, text, kind }],
      privateStatePlayerIds: [],
      touchedItemIds: [],
      tradeHistoryPlayerIds: [],
    };
  }

/** touchAffectedPlayer：执行对应的业务逻辑。 */
  private touchAffectedPlayer(result: MarketActionResult, playerId: string): void {
    if (!result.affectedPlayerIds.includes(playerId)) {
      result.affectedPlayerIds.push(playerId);
    }
  }

/** pushMessage：执行对应的业务逻辑。 */
  private pushMessage(result: MarketActionResult, playerId: string, text: string, kind: 'system' | 'loot' = 'system'): void {
    result.messages.push({ playerId, text, kind });
    this.touchAffectedPlayer(result, playerId);
  }

/** touchPrivateStatePlayer：执行对应的业务逻辑。 */
  private touchPrivateStatePlayer(result: MarketActionResult, playerId: string): void {
    if (!result.privateStatePlayerIds.includes(playerId)) {
      result.privateStatePlayerIds.push(playerId);
    }
  }

/** touchItem：执行对应的业务逻辑。 */
  private touchItem(result: MarketActionResult, itemId: string): void {
    if (!result.touchedItemIds.includes(itemId)) {
      result.touchedItemIds.push(itemId);
    }
  }

/** touchTradeHistoryPlayer：执行对应的业务逻辑。 */
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
/** context：定义该变量以承载业务值。 */
      const context = this.createMutationContext();
      try {
/** result：定义该变量以承载业务值。 */
        const result = await this.marketOrderRepo.manager.transaction(async (manager) => {
          this.bindTransactionRepos(context, manager);
/** cleanupResult：定义该变量以承载业务值。 */
          const cleanupResult = await this.sanitizeOpenOrdersInContext(context);
/** nextResult：定义该变量以承载业务值。 */
          const nextResult = await action(context);
          await this.persistTouchedOnlinePlayers(context);
          return this.mergeResults(cleanupResult, nextResult);
        });
        return result;
      } catch (error) {
        this.restoreMutationContext(context);
/** message：定义该变量以承载业务值。 */
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`坊市结算失败，已回滚: ${message}`);
        return this.singleMessage(playerId, '坊市结算失败，已回滚本次操作。');
      }
    });
  }

  private async runExclusive<T>(action: () => Promise<T>): Promise<T> {
/** previous：定义该变量以承载业务值。 */
    const previous = this.marketOperationQueue;
/** release：定义该变量以承载业务值。 */
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

/** createMutationContext：执行对应的业务逻辑。 */
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

/** bindTransactionRepos：执行对应的业务逻辑。 */
  private bindTransactionRepos(context: MarketMutationContext, manager: EntityManager): void {
    context.orderRepo = manager.getRepository(MarketOrderEntity);
    context.tradeHistoryRepo = manager.getRepository(MarketTradeHistoryEntity);
    context.playerRepo = manager.getRepository(PlayerEntity);
  }

/** captureOnlinePlayerState：执行对应的业务逻辑。 */
  private captureOnlinePlayerState(playerId: string, context: MarketMutationContext): void {
    if (context.onlinePlayerSnapshots.has(playerId)) {
      return;
    }
/** player：定义该变量以承载业务值。 */
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

/** persistTouchedOnlinePlayers：执行对应的业务逻辑。 */
  private async persistTouchedOnlinePlayers(context: MarketMutationContext): Promise<void> {
    for (const playerId of context.touchedOnlinePlayerIds) {
      await this.playerService.savePlayerCollections(playerId);
    }
  }

/** restoreMutationContext：执行对应的业务逻辑。 */
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

/** cloneOpenOrders：执行对应的业务逻辑。 */
  private cloneOpenOrders(source: MarketOrderEntity[]): MarketOrderEntity[] {
    return source.map((order) => this.marketOrderRepo.create({
      ...order,
      itemSnapshot: this.toPlainItem(order.itemSnapshot as unknown as ItemStack),
    }));
  }
}
