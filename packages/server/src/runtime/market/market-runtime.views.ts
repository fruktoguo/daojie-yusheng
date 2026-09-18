/**\n * market-runtime.views.ts\n *\n * 从 MarketRuntimeService 拆出的纯构建函数集合：挂单视图、价格层级、道具键解析、\n * 交易记录、通知构建与互斥操作。所有函数以 xxxImpl(self: MarketRuntimeService, ...) 形式导出。\n */
import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AUCTION_DEFAULT_DURATION_HOURS, AUCTION_LISTING_FEE_BASE, AUCTION_LISTING_FEE_RATE, AUCTION_MAX_DURATION_HOURS, AUCTION_MIN_DURATION_HOURS, CUSTOM_TECHNIQUE_BOOK_ITEM_ID, EQUIP_SLOTS, HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID, HEAVENLY_DAO_SHOP_ITEMS, ITEM_TYPES, MARKET_CONSUMABLE_CATEGORIES, MARKET_MAX_ENHANCE_LEVEL, MARKET_MAX_UNIT_PRICE, TECHNIQUE_EQUIP_SLOTS, TECHNIQUE_GRADE_ORDER, calculateHeavenlyDaoShopDiscountedPrice, calculateMarketOrderReservedCost, calculateMarketOrderTradeTotalCost, calculateMarketRoundedTotalCost, calculateMarketTradeTotalCost, canMergeItemStack, createItemStackSignature, getItemDisplayName, getMarketMinimumTradeQuantity, getMarketPriceStep, isLegacyMarketPrice, isValidMarketListingPrice, isValidMarketPrice, isValidMarketTradeQuantity, normalizeMarketAuctionPageSize, normalizeMarketAuctionQuery, normalizeMarketConsumableCategory, normalizeMarketListingsPageSize, normalizeMarketPriceUp, normalizeMarketRequestPage, normalizeMarketTradeSource, normalizeTransmissionCategory, normalizeTransmissionListingSort, resolveClampedMarketResponsePage, resolveMarketConsumableCategory, resolvePlayerFacingContentName } from '@mud/shared';
import { assignItemInstanceIdIfNeeded } from '../world/item-instance-id.helpers';
import { AUCTION_GLOBAL_TRADE_HISTORY_LIMIT, AUCTION_MY_TRADE_HISTORY_VISIBLE_LIMIT, AUCTION_TRADE_HISTORY_PAGE_SIZE, MARKET_CURRENCY_ITEM_ID, MARKET_MAX_ORDER_QUANTITY, MARKET_STORAGE_RUNTIME_CACHE_LIMIT, MARKET_TRADE_HISTORY_PAGE_SIZE, MARKET_TRADE_HISTORY_RUNTIME_CACHE_LIMIT, MARKET_TRADE_HISTORY_VISIBLE_LIMIT } from '../../constants/gameplay/market';
import { buildStructuredNotice } from '../world/structured-notice.helpers';
import { getChinaDateKey } from '../activity/activity-runtime.service';
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
    AUCTION_EXTENSION_WINDOW_MS,
    AUCTION_MAX_EXTENSION_MS,
    MARKET_DURABLE_OPERATION_ALREADY_COMMITTED,
    MarketDurableOperationCommittedError,
} from './market-runtime.service';
import type { MarketRuntimeService } from './market-runtime.service';
export function buildMarketUpdateImpl(self: MarketRuntimeService, playerId) {
        return {
            currencyItemId: MARKET_CURRENCY_ITEM_ID,
            currencyItemName: self.getCurrencyItemName(),
            listedItems: [],
            myOrders: self.buildOwnOrders(playerId),
            storage: self.getStorage(playerId),
            heavenlyDaoShopDiscountPercent: self.resolveCachedHeavenlyDaoShopDiscountPercent(playerId),
        };
}

export function buildMarketListingsPageImpl(self: MarketRuntimeService, payload) {

        const requestedPage = normalizeMarketRequestPage(payload?.page);

        const pageSize = normalizeMarketListingsPageSize(payload?.pageSize);

        const category = typeof payload?.category === 'string' ? payload.category : 'all';

        const equipmentSlot = typeof payload?.equipmentSlot === 'string' ? payload.equipmentSlot : 'all';

        const techniqueCategory = typeof payload?.techniqueCategory === 'string' ? payload.techniqueCategory : 'all';

        const consumableCategory = normalizeMarketConsumableCategory(payload?.consumableCategory);

        const entries = self.buildMarketListingEntries();

        const filtered = self.filterMarketListingEntries(entries, category, equipmentSlot, techniqueCategory, consumableCategory);

        const groups = self.groupMarketListingEntriesForPage(filtered);

        const total = groups.length;

        const page = resolveClampedMarketResponsePage(requestedPage, total, pageSize);

        const start = (page - 1) * pageSize;
        return {
            currencyItemId: MARKET_CURRENCY_ITEM_ID,
            currencyItemName: self.getCurrencyItemName(),
            page,
            pageSize,
            total,
            category,
            equipmentSlot,
            techniqueCategory,
            consumableCategory,
            counts: self.buildMarketListingCounts(entries),
            items: groups.slice(start, start + pageSize).flatMap((entry) => entry.entries),
        };
}

export function filterMarketListingEntriesImpl(self: MarketRuntimeService, entries, category, equipmentSlot, techniqueCategory, consumableCategory = 'all') {
        return entries.filter((entry) => {
            if (category !== 'all' && entry.itemType !== category) {
                return false;
            }
            if (equipmentSlot !== 'all') {
                if (entry.itemType !== 'equipment') {
                    return false;
                }
                if (equipmentSlot === 'technique') {
                    if (!TECHNIQUE_EQUIP_SLOTS.includes(entry.itemSubType)) {
                        return false;
                    }
                } else if (entry.itemSubType !== equipmentSlot) {
                    return false;
                }
            }
            if (techniqueCategory !== 'all' && (
                entry.itemType !== 'skill_book'
                || entry.itemSubType !== techniqueCategory
            )) {
                return false;
            }
            if (consumableCategory !== 'all' && (
                entry.itemType !== 'consumable'
                || entry.itemSubType !== consumableCategory
            )) {
                return false;
            }
            return true;
        });
}

export function buildMarketListingCountsImpl(self: MarketRuntimeService, entries) {
        const categoryCounts = {
            all: self.groupMarketListingEntriesForPage(entries).length,
        };
        for (const itemType of ITEM_TYPES) {
            categoryCounts[itemType] = self.groupMarketListingEntriesForPage(
                self.filterMarketListingEntries(entries, itemType, 'all', 'all'),
            ).length;
        }
        const equipmentEntries = self.filterMarketListingEntries(entries, 'equipment', 'all', 'all');
        const equipmentSlotCounts = {
            all: self.groupMarketListingEntriesForPage(equipmentEntries).length,
            technique: 0,
        };
        equipmentSlotCounts.technique = self.groupMarketListingEntriesForPage(
            self.filterMarketListingEntries(entries, 'equipment', 'technique', 'all'),
        ).length;
        for (const slot of EQUIP_SLOTS) {
            equipmentSlotCounts[slot] = self.groupMarketListingEntriesForPage(
                self.filterMarketListingEntries(entries, 'equipment', slot, 'all'),
            ).length;
        }
        const techniqueEntries = self.filterMarketListingEntries(entries, 'skill_book', 'all', 'all');
        const techniqueCategoryCounts = {
            all: self.groupMarketListingEntriesForPage(techniqueEntries).length,
        };
        for (const techniqueCategory of ['arts', 'internal', 'divine', 'secret']) {
            techniqueCategoryCounts[techniqueCategory] = self.groupMarketListingEntriesForPage(
                self.filterMarketListingEntries(entries, 'skill_book', 'all', techniqueCategory),
            ).length;
        }
        const consumableEntries = self.filterMarketListingEntries(entries, 'consumable', 'all', 'all');
        const consumableCategoryCounts = {
            all: self.groupMarketListingEntriesForPage(consumableEntries).length,
        };
        for (const consumableCategory of MARKET_CONSUMABLE_CATEGORIES) {
            consumableCategoryCounts[consumableCategory] = self.groupMarketListingEntriesForPage(
                self.filterMarketListingEntries(entries, 'consumable', 'all', 'all', consumableCategory),
            ).length;
        }
        return {
            categoryCounts,
            equipmentSlotCounts,
            techniqueCategoryCounts,
            consumableCategoryCounts,
        };
}

export function buildMarketOrdersImpl(self: MarketRuntimeService, playerId) {
        return {
            currencyItemId: MARKET_CURRENCY_ITEM_ID,
            currencyItemName: self.getCurrencyItemName(),
            orders: self.buildOwnOrders(playerId),
        };
}

export function buildItemBookImpl(self: MarketRuntimeService, itemKey) {

        const requestedItemKey = typeof itemKey === 'string' ? itemKey.trim() : '';

        const normalizedItemKey = self.resolveInternalMarketItemKey(itemKey);

        const responseItemKey = requestedItemKey || self.buildClientMarketKey(normalizedItemKey);

        const book = self.buildItemBookView(normalizedItemKey);
        if (book) {
            book.itemKey = responseItemKey;
        }
        return {
            currencyItemId: MARKET_CURRENCY_ITEM_ID,
            currencyItemName: self.getCurrencyItemName(),
            itemKey: responseItemKey,
            book,
        };
}

export async function buildTradeHistoryPageImpl(self: MarketRuntimeService, playerId, page, source = 'market', scope = 'mine') {

        const normalizedSource = self.normalizeTradeSource(source);
        const normalizedScope = self.normalizeTradeHistoryScope(normalizedSource, scope);

        const visibleRecords = normalizedScope === 'all'
            ? await self.loadGlobalTradeHistory(normalizedSource, AUCTION_GLOBAL_TRADE_HISTORY_LIMIT)
            : await self.loadVisibleTradeHistory(playerId, normalizedSource, normalizedSource === 'auction' ? AUCTION_MY_TRADE_HISTORY_VISIBLE_LIMIT : MARKET_TRADE_HISTORY_VISIBLE_LIMIT);

        const totalVisible = visibleRecords.length;

        const pageSize = normalizedSource === 'auction' ? AUCTION_TRADE_HISTORY_PAGE_SIZE : MARKET_TRADE_HISTORY_PAGE_SIZE;

        const totalPages = Math.max(1, Math.ceil(totalVisible / pageSize));

        const normalizedPage = normalizedScope === 'all'
            ? 1
            : Math.max(1, Math.min(totalPages, Math.trunc(Number.isFinite(page) ? page : 1)));

        const start = (normalizedPage - 1) * pageSize;
        const pageRecords = visibleRecords.slice(start, start + pageSize);
        const identitiesByPlayerId = await self.loadTradeHistoryIdentityMap(pageRecords);
        return {
            source: normalizedSource,
            scope: normalizedScope,
            page: normalizedPage,
            pageSize,
            totalVisible,
            records: pageRecords
                .map((entry) => self.toTradeHistoryView(playerId, entry, identitiesByPlayerId)),
        };
}

export function buildListedItemsImpl(self: MarketRuntimeService) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const grouped = new Map();
        for (const template of self.contentTemplateRepository.listItemTemplates()) {
            const item = self.contentTemplateRepository.createItem(template.itemId, 1);
            if (!item) {
                continue;
            }
            const orderItem = self.toOrderItem(item);
            if (!self.isOrderBookTradableItem(orderItem)) {
                continue;
            }
            grouped.set(self.buildItemKey(orderItem), {
                item: orderItem,
                sellOrderCount: 0,
                sellQuantity: 0,
                buyOrderCount: 0,
                buyQuantity: 0,
            });
        }
        for (const order of self.openOrders) {
            if (order.remainingQuantity <= 0
                || order.status !== 'open'
                || self.isSpecialListingOrder(order)
                || !self.isOrderBookTradableItem(order.item)) {
                continue;
            }

            const orderItem = self.toOrderItem(order.item);

            const orderItemKey = self.buildItemKey(orderItem);

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

            const leftLevel = self.contentTemplateRepository.getItemSortLevel(left.item);

            const rightLevel = self.contentTemplateRepository.getItemSortLevel(right.item);
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

export function buildMarketListingEntriesImpl(self: MarketRuntimeService) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return self.buildListedItems().map((entry) => ({
            itemKey: self.buildClientMarketKey(entry.itemKey),
            item: { ...entry.item },
            itemId: entry.item.itemId,
            itemType: entry.item.type ?? 'material',
            itemSubType: self.buildMarketListingSubType(entry.item),
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

export function groupMarketListingEntriesForPageImpl(self: MarketRuntimeService, entries) {
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

export function buildOwnOrdersImpl(self: MarketRuntimeService, playerId) {
        return self.openOrders
            .filter((order) => order.ownerId === playerId
            && order.status === 'open'
            && order.remainingQuantity > 0
            && !self.isSpecialListingOrder(order)
            && self.canTradeItemOnMarket(order.item))
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
            .map((order) => ({
            id: order.id,
            side: order.side,
            status: order.status,
            itemKey: self.buildClientMarketKey(self.getOrderItemKey(order)),
            item: { ...order.item },
            remainingQuantity: order.remainingQuantity,
            unitPrice: order.unitPrice,
            createdAt: order.createdAt,
        }));
}

export function buildItemBookViewImpl(self: MarketRuntimeService, itemKey) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedItemKey = self.resolveInternalMarketItemKey(itemKey);
        if (!normalizedItemKey) {
            return null;
        }

        const orders = self.openOrders.filter((order) => order.status === 'open'
            && order.remainingQuantity > 0
            && !self.isSpecialListingOrder(order)
            && self.getOrderItemKey(order) === normalizedItemKey);
        if (orders.length === 0) {
            return null;
        }
        return {
            itemKey: self.buildClientMarketKey(normalizedItemKey),
            sells: self.buildPriceLevels(normalizedItemKey, 'sell'),
            buys: self.buildPriceLevels(normalizedItemKey, 'buy'),
        };
}

export function buildPriceLevelsImpl(self: MarketRuntimeService, itemKey, side) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const grouped = new Map();
        for (const order of self.openOrders) {
            if (order.status !== 'open'
                || order.remainingQuantity <= 0
                || order.side !== side
                || self.isSpecialListingOrder(order)
                || self.getOrderItemKey(order) !== itemKey) {
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

export function getSortedOrdersImpl(self: MarketRuntimeService, itemKey, side) {
        return self.openOrders
            .filter((order) => order.status === 'open'
            && order.remainingQuantity > 0
            && order.side === side
            && !self.isSpecialListingOrder(order)
            && self.getOrderItemKey(order) === itemKey)
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

export function hasConflictingOpenOrderImpl(self: MarketRuntimeService, ownerId, itemKey, nextSide) {

        const oppositeSide = nextSide === 'sell' ? 'buy' : 'sell';
        return self.hasOpenOrder(ownerId, itemKey, oppositeSide);
}

export function hasOpenOrderImpl(self: MarketRuntimeService, ownerId, itemKey, side) {
        return self.openOrders.some((order) => order.ownerId === ownerId
            && self.getOrderItemKey(order) === itemKey
            && order.side === side
            && order.status === 'open'
            && !self.isSpecialListingOrder(order)
            && order.remainingQuantity > 0);
}

export function planOrderMatchesImpl(self: MarketRuntimeService, orders, quantity, takerUnitPrice) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let remaining = quantity;

        let total = 0;

        const matches = [];
        for (const order of orders) {
            if (remaining <= 0) {
                break;
            }

            const maxTradable = Math.min(remaining, order.remainingQuantity);

            const traded = self.getCompatibleTradeQuantity(maxTradable, order, takerUnitPrice);
            if (traded <= 0) {
                continue;
            }

            const tradeTotal = order.side === 'sell'
                ? calculateMarketRoundedTotalCost(traded, order.unitPrice)
                : calculateMarketOrderTradeTotalCost(order.remainingQuantity, traded, order.unitPrice);
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

export function getCompatibleTradeQuantityImpl(self: MarketRuntimeService, maxQuantity, order, takerUnitPrice) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (maxQuantity <= 0) {
            return 0;
        }

        const orderUnitPrice = Number(order?.unitPrice);
        const orderRemainingQuantity = Math.max(0, Math.trunc(Number(order?.remainingQuantity) || 0));
        if (!isValidMarketPrice(orderUnitPrice)
            || orderRemainingQuantity <= 0
            || (order?.side !== 'buy' && order?.side !== 'sell')) {
            return 0;
        }

        let quantityStep = 1;
        if (isValidMarketListingPrice(takerUnitPrice)) {
            quantityStep = self.leastCommonMultiple(quantityStep, getMarketMinimumTradeQuantity(takerUnitPrice));
        }
        if (isValidMarketListingPrice(orderUnitPrice)) {
            quantityStep = self.leastCommonMultiple(quantityStep, getMarketMinimumTradeQuantity(orderUnitPrice));
        }

        const traded = Math.floor(maxQuantity / quantityStep) * quantityStep;
        if (traded <= 0) {
            return 0;
        }
        if (isLegacyMarketPrice(orderUnitPrice)) {
            const minimumQuantity = getMarketMinimumTradeQuantity(orderUnitPrice);
            if (traded < minimumQuantity && traded < orderRemainingQuantity) {
                return 0;
            }
        }
        const tradeTotal = order.side === 'sell'
            ? calculateMarketRoundedTotalCost(traded, orderUnitPrice)
            : calculateMarketOrderTradeTotalCost(orderRemainingQuantity, traded, orderUnitPrice);
        return tradeTotal === null
            ? 0
            : traded;
}

export function leastCommonMultipleImpl(self: MarketRuntimeService, left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (left <= 0 || right <= 0) {
            return 0;
        }
        return (left / self.greatestCommonDivisor(left, right)) * right;
}

export function greatestCommonDivisorImpl(self: MarketRuntimeService, left, right) {
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

export function buildItemKeyImpl(self: MarketRuntimeService, item) {
        const normalized = self.toOrderItem(item);
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

export function getOrderItemKeyImpl(self: MarketRuntimeService, order) {
        return self.buildItemKey(order.item);
}

export function buildClientMarketKeyImpl(self: MarketRuntimeService, itemKey) {
        const normalizedItemKey = typeof itemKey === 'string' ? itemKey.trim() : '';
        if (!normalizedItemKey) {
            return '';
        }
        return createHash('sha1').update(normalizedItemKey).digest('base64url').replace(/[-_]/g, '').slice(0, 18);
}

export function buildMarketListingSubTypeImpl(self: MarketRuntimeService, item) {
        if (item.type === 'equipment') {
            return item.equipSlot ?? 'other';
        }
        if (item.type === 'skill_book') {
            return self.contentTemplateRepository.getTechniqueCategoryForBookItem(item.itemId) ?? 'other';
        }
        if (item.type === 'material') {
            return item.itemId.startsWith('mat.') ? 'herb' : 'special';
        }
        if (item.type === 'consumable') {
            return resolveMarketConsumableCategory(item);
        }
        return 'other';
}

export function resolveMarketItemForBuyImpl(self: MarketRuntimeService, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const itemKey = self.resolveInternalMarketItemKey(payload?.itemKey);
        if (itemKey) {

            const listedItem = self.buildListedItems().find((entry) => entry.itemKey === itemKey)?.item;
            if (listedItem) {
                return { ...listedItem, count: 1 };
            }
        }

        const structuredItem = self.resolveStructuredMarketItemKey(payload?.itemKey);
        if (structuredItem) {
            return structuredItem;
        }

        const stackSignatureItem = self.resolveStackSignatureMarketItemKey(payload?.itemKey);
        if (stackSignatureItem) {
            return stackSignatureItem;
        }

        const itemId = typeof payload?.itemId === 'string' ? payload.itemId.trim() : '';
        return itemId ? self.contentTemplateRepository.createItem(itemId, 1) : null;
}

export function resolveStackSignatureMarketItemKeyImpl(self: MarketRuntimeService, itemKey) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const parsedItemKey = parseMarketStackSignatureItemKey(itemKey);
        if (!parsedItemKey) {
            return null;
        }
        const { itemId, enhanceLevel } = parsedItemKey;
        const baseItem = self.contentTemplateRepository.createItem(itemId, 1);
        if (!baseItem) {
            return null;
        }
        const mergedItem = {
            ...baseItem,
            itemId,
            count: 1,
        };
        if (enhanceLevel > 0 || baseItem.type === 'equipment') {
            mergedItem.enhanceLevel = enhanceLevel;
        }
        return self.toFullItem(mergedItem);
}

export function toOrderItemImpl(self: MarketRuntimeService, item) {

        const normalized = self.toFullItem(item);
        // 市场内同质化交易：卖家挂单后 itemInstanceId 不再有意义，
        // 买家成交后由 deliverItemToPlayer → receiveInventoryItem 重新分配新 instanceId。
        // 这里显式剥离，避免买家收到的物品继承卖家原 instanceId 造成身份串台。
        if (normalized && typeof normalized === 'object' && 'itemInstanceId' in normalized) {
            delete (normalized as { itemInstanceId?: unknown }).itemInstanceId;
        }
        return {
            ...normalized,
            count: 1,
        };
}

export function toEscrowOrderItemImpl(self: MarketRuntimeService, item) {
        return {
            ...self.toFullItem(item),
            count: 1,
        };
}

export function createCurrencyItemImpl(self: MarketRuntimeService, count) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const item = self.contentTemplateRepository.createItem(MARKET_CURRENCY_ITEM_ID, count);
        if (item) {
            return self.toFullItem({
                ...item,
                count,
            });
        }
        return {
            itemId: MARKET_CURRENCY_ITEM_ID,
            name: self.getCurrencyItemName(),
            type: 'consumable',
            count,
            desc: '坊市通行货币。',
        };
}

export function canAffordMarketCurrencyImpl(self: MarketRuntimeService, playerId, amount) {
        const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
        if (normalizedAmount <= 0) {
            return true;
        }
        return self.playerRuntimeService.canAffordWallet(playerId, MARKET_CURRENCY_ITEM_ID, normalizedAmount);
}

export function consumeMarketCurrencyFromInventoryImpl(self: MarketRuntimeService, playerId, amount) {
        const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
        if (normalizedAmount <= 0) {
            return true;
        }
        try {
            self.playerRuntimeService.debitWallet(playerId, MARKET_CURRENCY_ITEM_ID, normalizedAmount);
        }
        catch (error) {
            self.logger.warn(`坊市扣费失败 player=${playerId} amount=${normalizedAmount}：${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
        return true;
}

export function deliverMarketCurrencyToPlayerImpl(self: MarketRuntimeService, playerId, amount, context) {
        const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
        if (normalizedAmount <= 0) {
            return;
        }
        self.deliverItemToPlayer(playerId, self.createCurrencyItem(normalizedAmount), context);
}

export function refundOutbidAuctionReserveToPlayerImpl(self: MarketRuntimeService, playerId, amount, context) {
        const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
        if (normalizedAmount <= 0) {
            return 'inventory';
        }
        const player = self.playerRuntimeService.getPlayer(playerId);
        if (player && self.hasActiveProjectionFence(playerId)) {
            self.captureOnlinePlayerState(playerId, context);
            self.playerRuntimeService.receiveInventoryItem(playerId, self.createCurrencyItem(normalizedAmount));
            return 'inventory';
        }
        self.mergeStorageItem(playerId, self.createCurrencyItem(normalizedAmount), context);
        return 'storage';
}

export function toFullItemImpl(self: MarketRuntimeService, item) {

        const normalized = self.contentTemplateRepository.normalizeItem(item);
        return {
            itemId: normalized.itemId,
            itemInstanceId: normalizeInventoryItemInstanceId(normalized.itemInstanceId) || undefined,
            name: self.resolveMarketItemDisplayName(normalized, normalized.itemId),
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
            baselineHealPercent: normalized.baselineHealPercent,
            baselineQiPercent: normalized.baselineQiPercent,
            qiPercent: normalized.qiPercent,
            consumeBuffs: normalized.consumeBuffs,
            tags: normalized.tags,
            mapUnlockId: normalized.mapUnlockId,
            mapUnlockIds: Array.isArray(normalized.mapUnlockIds) ? normalized.mapUnlockIds.slice() : undefined,
            respawnBindMapId: normalized.respawnBindMapId,
            tileAuraGainAmount: normalized.tileAuraGainAmount,
            tileResourceGains: Array.isArray(normalized.tileResourceGains) ? normalized.tileResourceGains.map((entry) => ({ ...entry })) : undefined,
            allowBatchUse: normalized.allowBatchUse,
            // 自创功法残卷共用 book.custom_technique 这一个 itemId，功法身份只由这两个实例字段承载。
            // 一旦此处漏列，经市场/拍卖/托管仓回环的残卷会退化成空书，学习时抛「功法书缺少功法 ID」。
            learnTechniqueId: normalized.learnTechniqueId,
            learnTechniqueMaxLevel: normalized.learnTechniqueMaxLevel,
        };
}

export function canTradeItemOnMarketImpl(self: MarketRuntimeService, item) {
        const itemId = typeof item?.itemId === 'string' ? item.itemId.trim() : '';
        if (!itemId || itemId === MARKET_CURRENCY_ITEM_ID) {
            return false;
        }
        if (typeof self.contentTemplateRepository.isItemMarketTradable === 'function') {
            return self.contentTemplateRepository.isItemMarketTradable(itemId) === true;
        }
        return item?.marketTradable !== false;
}

export function buildItemNotTradableResultImpl(self: MarketRuntimeService, playerId) {
        return self.singleStructuredMessage(playerId, 'warn', 'notice.market.item-not-tradable', '此物不入坊市流通。', {});
}

export function isOrderBookTradableItemImpl(self: MarketRuntimeService, item) {
        return self.canTradeItemOnMarket(item) && item?.itemId !== CUSTOM_TECHNIQUE_BOOK_ITEM_ID;
}

export function isOrdinaryMarketEnhancementLevelRestrictedImpl(self: MarketRuntimeService, item) {
        const enhanceLevel = Number(item?.enhanceLevel ?? 0);
        return Number.isFinite(enhanceLevel) && Math.trunc(enhanceLevel) > MARKET_MAX_ENHANCE_LEVEL;
}

export function normalizeQuantityImpl(self: MarketRuntimeService, value) {
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

export function normalizeHeavenlyDaoShopQuantityImpl(self: MarketRuntimeService, value) {
        const numeric = Number(value ?? 1);
        if (!Number.isFinite(numeric)) {
            return null;
        }
        const quantity = Math.trunc(numeric);
        if (quantity <= 0 || quantity > 9_999) {
            return null;
        }
        return quantity;
}

export async function resolveHeavenlyDaoShopDiscountPercentImpl(self: MarketRuntimeService, playerId) {
        if (typeof self.activityRuntimeService?.getHeavenlyDaoShopDiscountPercent !== 'function') {
            return 0;
        }
        const discountPercent = await self.activityRuntimeService.getHeavenlyDaoShopDiscountPercent(playerId).catch(() => 0);
        return Number.isFinite(Number(discountPercent)) ? Math.max(0, Math.min(100, Math.trunc(Number(discountPercent)))) : 0;
}

export function resolveCachedHeavenlyDaoShopDiscountPercentImpl(self: MarketRuntimeService, playerId) {
        if (typeof self.activityRuntimeService?.getCachedHeavenlyDaoShopDiscountPercent !== 'function') {
            return 0;
        }
        const discountPercent = self.activityRuntimeService.getCachedHeavenlyDaoShopDiscountPercent(playerId);
        return Number.isFinite(Number(discountPercent)) ? Math.max(0, Math.min(100, Math.trunc(Number(discountPercent)))) : 0;
}

export function normalizeUnitPriceImpl(self: MarketRuntimeService, value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!Number.isFinite(value)) {
            return null;
        }

        const unitPrice = value;
        if (unitPrice <= 0 || unitPrice > MARKET_MAX_UNIT_PRICE || !isValidMarketListingPrice(unitPrice)) {
            return null;
        }
        return unitPrice;
}

export function normalizeAuctionBuyoutPriceImpl(self: MarketRuntimeService, value, startPrice) {
        const numericStart = Math.max(1, Math.trunc(Number(startPrice) || 1));
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue) || numericValue <= 0) {
            return null;
        }
        const normalized = self.normalizeUnitPrice(numericValue);
        if (!normalized || normalized < numericStart) {
            return null;
        }
        return normalized;
}

export function getAuctionOrderBuyoutPriceImpl(self: MarketRuntimeService, order, startPrice) {
        return self.normalizeAuctionBuyoutPrice(order?.auction?.buyoutPrice, startPrice);
}

export function calculateAuctionListingFeeImpl(self: MarketRuntimeService, startPrice) {
        const normalizedStartPrice = Math.max(1, Math.trunc(Number(startPrice) || 1));
        return AUCTION_LISTING_FEE_BASE + Math.ceil(normalizedStartPrice * AUCTION_LISTING_FEE_RATE);
}

export function buildTradeQuantityErrorImpl(self: MarketRuntimeService, unitPrice) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const minimumQuantity = getMarketMinimumTradeQuantity(unitPrice);
        if (minimumQuantity <= 1) {
            return '挂售数量或单价无效。';
        }
        return `当前单价 ${self.formatUnitPrice(unitPrice)} ${self.getCurrencyItemName()} 时，数量必须是 ${minimumQuantity} 的倍数，才能按整灵石结算。`;
}

export function formatUnitPriceImpl(self: MarketRuntimeService, value) {
        return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.0+$/, '');
}

export function getHeavenlyDaoShopCurrencyNameImpl(self: MarketRuntimeService) {
        const item = self.contentTemplateRepository.createItem(HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID, 1);
        return self.resolveMarketItemDisplayName(item, HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID);
}

export function formatMarketItemStackLabelImpl(self: MarketRuntimeService, item) {
        const label = self.resolveMarketItemDisplayName(item, item?.itemId);
        const count = Math.max(1, Math.trunc(Number(item?.count ?? 1)));
        return count > 1 ? `${label} x${count}` : label;
}

export function deliverItemToPlayerImpl(self: MarketRuntimeService, playerId, item, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = self.playerRuntimeService.getPlayer(playerId);
        if (player && self.isPlayerNetworkOnline(playerId) && self.hasActiveProjectionFence(playerId)) {
            self.captureOnlinePlayerState(playerId, context);
            if (self.playerRuntimeService.canReceiveInventoryItem(playerId, item)) {
                self.playerRuntimeService.receiveInventoryItem(playerId, item);
            }
            else {
                self.mergeStorageItem(playerId, item, context);
            }
            return;
        }
        self.mergeStorageItem(playerId, item, context);
}

export function isPlayerNetworkOnlineImpl(self: MarketRuntimeService, playerId) {
        const presence = typeof self.playerRuntimeService?.describePersistencePresence === 'function'
            ? self.playerRuntimeService.describePersistencePresence(playerId)
            : null;
        if (presence) {
            return presence.online === true;
        }
        const player = self.playerRuntimeService.getPlayer?.(playerId);
        return typeof player?.sessionId === 'string' && player.sessionId.trim().length > 0;
}

export function hasActiveProjectionFenceImpl(self: MarketRuntimeService, playerId) {
        const presence = typeof self.playerRuntimeService?.describePersistencePresence === 'function'
            ? self.playerRuntimeService.describePersistencePresence(playerId)
            : null;
        const player = presence ? null : self.playerRuntimeService.getPlayer?.(playerId);
        const fenceSource = presence ?? player;
        const runtimeOwnerId = typeof fenceSource?.runtimeOwnerId === 'string' ? fenceSource.runtimeOwnerId.trim() : '';
        const sessionEpoch = Number.isFinite(Number(presence?.sessionEpoch))
            ? Math.max(0, Math.trunc(Number(presence.sessionEpoch)))
            : Number.isFinite(Number(player?.sessionEpoch))
                ? Math.max(0, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        return Boolean(runtimeOwnerId && sessionEpoch > 0);
}

export function recordTradeImpl(self: MarketRuntimeService, payload, context) {
        context.newTradeRecords.push({
            version: 1,
            id: randomUUID(),
            source: self.normalizeTradeSource(payload.source),
            buyerId: payload.buyerId,
            sellerId: payload.sellerId,
            buyerName: self.resolveOnlineMarketPlayerLabel(payload.buyerId),
            sellerName: self.resolveOnlineMarketPlayerLabel(payload.sellerId),
            itemId: payload.itemId,
            quantity: payload.quantity,
            unitPrice: payload.unitPrice,
            createdAt: Date.now(),
        });
}

export function toTradeHistoryViewImpl(self: MarketRuntimeService, playerId, record, identitiesByPlayerId = new Map()) {
        const counterpartyId = record.buyerId === playerId ? record.sellerId : record.buyerId;
        const persistedLabel = record.buyerId === playerId
            ? self.normalizePlayerLabelText(record.sellerName, counterpartyId)
            : self.normalizePlayerLabelText(record.buyerName, counterpartyId);
        const identityLabel = self.resolveIdentityPlayerLabel(identitiesByPlayerId.get(counterpartyId));
        const onlineLabel = self.resolveOnlineMarketPlayerLabel(counterpartyId);
        const buyerLabel = self.normalizePlayerLabelText(record.buyerName, record.buyerId)
            || self.resolveIdentityPlayerLabel(identitiesByPlayerId.get(record.buyerId))
            || self.resolveOnlineMarketPlayerLabel(record.buyerId)
            || '未知玩家';
        const sellerLabel = self.normalizePlayerLabelText(record.sellerName, record.sellerId)
            || self.resolveIdentityPlayerLabel(identitiesByPlayerId.get(record.sellerId))
            || self.resolveOnlineMarketPlayerLabel(record.sellerId)
            || '未知玩家';
        return {
            id: record.id,

            side: record.buyerId === playerId ? 'buy' : 'sell',
            source: self.normalizeTradeSource(record.source),
            itemId: record.itemId,
            itemName: self.resolveMarketItemDisplayName(null, record.itemId),
            counterpartyLabel: persistedLabel || identityLabel || onlineLabel || '未知玩家',
            buyerLabel,
            sellerLabel,
            quantity: record.quantity,
            unitPrice: record.unitPrice,
            createdAt: record.createdAt,
        };
}

export async function loadTradeHistoryIdentityMapImpl(self: MarketRuntimeService, records) {
        const playerIds = Array.from(new Set((records ?? [])
            .flatMap((record) => [record?.buyerId, record?.sellerId])
            .map((playerId) => typeof playerId === 'string' ? playerId.trim() : '')
            .filter((playerId) => playerId.length > 0)));
        if (playerIds.length === 0 || typeof self.playerIdentityPersistenceService?.listPlayerIdentitiesByPlayerIds !== 'function') {
            return new Map();
        }
        try {
            return await self.playerIdentityPersistenceService.listPlayerIdentitiesByPlayerIds(playerIds);
        }
        catch (error) {
            self.logger.warn(`补齐坊市成交记录玩家名失败：${error instanceof Error ? error.message : String(error)}`);
            return new Map();
        }
}

export function normalizePlayerLabelTextImpl(self: MarketRuntimeService, value, rejectedPlayerId = '') {
        const normalized = typeof value === 'string' ? value.trim().normalize('NFC') : '';
        const rejected = typeof rejectedPlayerId === 'string' ? rejectedPlayerId.trim() : '';
        if (rejected && normalized === rejected) {
            return '';
        }
        return normalized.length > 0 ? normalized : '';
}

export function resolveIdentityPlayerLabelImpl(self: MarketRuntimeService, identity) {
        return self.normalizePlayerLabelText(identity?.playerName, identity?.playerId)
            || self.normalizePlayerLabelText(identity?.displayName, identity?.playerId)
            || self.normalizePlayerLabelText(identity?.username, identity?.playerId);
}

export function resolveOnlineMarketPlayerLabelImpl(self: MarketRuntimeService, playerId) {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        const player = normalizedPlayerId ? self.playerRuntimeService.getPlayer(normalizedPlayerId) : null;
        return self.normalizePlayerLabelText(player?.displayName, normalizedPlayerId)
            || self.normalizePlayerLabelText(player?.name, normalizedPlayerId);
}

export function normalizeTradeSourceImpl(self: MarketRuntimeService, source) {
        return normalizeMarketTradeSource(source);
}

export function normalizeTradeHistoryScopeImpl(self: MarketRuntimeService, source, scope) {
        return source === 'auction' && scope === 'all' ? 'all' : 'mine';
}

export async function loadGlobalTradeHistoryImpl(self: MarketRuntimeService, source, limit) {
        if (typeof self.marketPersistenceService.loadTradeHistoryBySource === 'function'
            && self.marketPersistenceService.isEnabled?.()) {
            return self.marketPersistenceService.loadTradeHistoryBySource(source, limit);
        }
        return self.tradeHistory
            .filter((entry) => self.normalizeTradeSource(entry.source) === source)
            .slice(0, limit);
}

export async function loadVisibleTradeHistoryImpl(self: MarketRuntimeService, playerId, source, limit = MARKET_TRADE_HISTORY_VISIBLE_LIMIT) {
        if (typeof self.marketPersistenceService.loadTradeHistoryForPlayer === 'function'
            && self.marketPersistenceService.isEnabled?.()) {
            return self.marketPersistenceService.loadTradeHistoryForPlayer(playerId, source, limit);
        }
        return self.tradeHistory
            .filter((entry) => self.normalizeTradeSource(entry.source) === source && (entry.buyerId === playerId || entry.sellerId === playerId))
            .slice(0, limit);
}

export function createEmptyResultImpl(self: MarketRuntimeService, playerId) {
        return {
            affectedPlayerIds: [playerId],
            notices: [],
        };
}

export function singleMessageImpl(self: MarketRuntimeService, playerId, text, kind = 'info') {
        return {
            affectedPlayerIds: [playerId],
            notices: [{ playerId, text, kind }],
        };
}

export function singleStructuredMessageImpl(self: MarketRuntimeService, playerId, kind, key, text, opts = undefined) {
        const notice = buildStructuredNotice(kind, key, text, opts);
        return {
            affectedPlayerIds: [playerId],
            notices: [{ playerId, text: notice.text, kind: notice.kind, structured: notice.structured }],
        };
}

export function touchAffectedPlayerImpl(self: MarketRuntimeService, result, playerId) {
        if (!result.affectedPlayerIds.includes(playerId)) {
            result.affectedPlayerIds.push(playerId);
        }
}

export function pushNoticeImpl(self: MarketRuntimeService, result, playerId, text, kind = 'info') {
        result.notices.push({ playerId, text, kind });
        self.touchAffectedPlayer(result, playerId);
}

export function pushStructuredNoticeImpl(self: MarketRuntimeService, result, playerId, kind, key, text, opts) {
        const notice = buildStructuredNotice(kind, key, text, opts);
        result.notices.push({ playerId, text: notice.text, kind: notice.kind, structured: notice.structured });
        self.touchAffectedPlayer(result, playerId);
}

export function markOrderDirtyImpl(self: MarketRuntimeService, orderId, context, order = null) {
        context.dirtyOrderIds.add(orderId);
        context.deletedOrderIds.delete(orderId);
        if (self.isTransmissionOrder(order)) {
            context.transmissionListingsChanged = true;
        }
}

export function deleteOrderImpl(self: MarketRuntimeService, orderId, context, order = null) {
        context.deletedOrderIds.add(orderId);
        context.dirtyOrderIds.delete(orderId);
        if (self.isTransmissionOrder(order)) {
            context.transmissionListingsChanged = true;
        }
}

export function compactOpenOrdersImpl(self: MarketRuntimeService) {
        self.openOrders = self.openOrders.filter((order) => order.status === 'open' && order.remainingQuantity > 0);
        const activeAuctionItemKeys = new Set(self.openOrders
            .filter((order) => self.isAuctionOrder(order) && order.side === 'sell' && self.canTradeItemOnMarket(order.item))
            .map((order) => self.buildAuctionLotKey(order)));
        for (const itemKey of Array.from(self.auctionBidsByItemKey.keys())) {
            if (!activeAuctionItemKeys.has(itemKey)) {
                self.auctionBidsByItemKey.delete(itemKey);
            }
        }
        for (const itemKey of Array.from(self.auctionTimingByItemKey.keys())) {
            if (!activeAuctionItemKeys.has(itemKey)) {
                self.auctionTimingByItemKey.delete(itemKey);
            }
        }
        self.rebuildAuctionClientKeyIndex();
        // 传法台索引与订单表同源重建，撤单/成交后不会残留 stale 的 clientKey。
        self.hydrateTransmissionStateFromOpenOrders();
}

export function rebuildAuctionClientKeyIndexImpl(self: MarketRuntimeService) {
        self.auctionClientKeyToLotKey.clear();
        for (const order of self.openOrders) {
            if (!self.isAuctionOrder(order) || order.side !== 'sell') {
                continue;
            }
            const lotKey = self.buildAuctionLotKey(order);
            const clientKey = self.buildClientAuctionLotKey(lotKey);
            if (clientKey && lotKey) {
                self.auctionClientKeyToLotKey.set(clientKey, lotKey);
            }
        }
}

export function captureOnlinePlayerStateImpl(self: MarketRuntimeService, playerId, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (context.onlinePlayerSnapshots.has(playerId)) {
            return;
        }

        const snapshot = self.playerRuntimeService.snapshot(playerId);
        if (!snapshot) {
            return;
        }
        context.onlinePlayerSnapshots.set(playerId, snapshot);
}

export function getCurrencyItemNameImpl(self: MarketRuntimeService) {
        return self.contentTemplateRepository.getItemName(MARKET_CURRENCY_ITEM_ID) ?? '灵石';
}

export function resolveMarketItemDisplayNameImpl(self: MarketRuntimeService, item, itemIdInput) {
        const itemId = typeof itemIdInput === 'string' && itemIdInput.trim()
            ? itemIdInput.trim()
            : typeof item?.itemId === 'string'
                ? item.itemId.trim()
                : '';
        return resolvePlayerFacingContentName(
            itemId,
            '未知物品',
            item?.name,
            itemId ? self.contentTemplateRepository.getItemName(itemId) : null,
        );
}

export function createMutationContextImpl(self: MarketRuntimeService) {
        return {
            openOrdersSnapshot: self.openOrders.map((entry) => ({
                ...entry,
                item: { ...entry.item },
                auction: entry.auction ? self.normalizeAuctionOrderState(entry.auction) : undefined,
            })),
            auctionBidsSnapshotByItemKey: cloneAuctionBidsMap(self.auctionBidsByItemKey),
            auctionTimingSnapshotByItemKey: cloneAuctionTimingMap(self.auctionTimingByItemKey),
            storageSnapshotByPlayerId: new Map(),
            onlinePlayerSnapshots: new Map(),
            dirtyOrderIds: new Set(),
            deletedOrderIds: new Set(),
            dirtyStoragePlayerIds: new Set(),
            newTradeRecords: [],
            transmissionListingsChanged: false,
            skipPersistence: false,
        };
}

export function restoreMutationContextImpl(self: MarketRuntimeService, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        self.openOrders = context.openOrdersSnapshot.map((entry) => ({
            ...entry,
            item: { ...entry.item },
            auction: entry.auction ? self.normalizeAuctionOrderState(entry.auction) : undefined,
        }));
        self.auctionBidsByItemKey = cloneAuctionBidsMap(context.auctionBidsSnapshotByItemKey);
        self.auctionTimingByItemKey = cloneAuctionTimingMap(context.auctionTimingSnapshotByItemKey);
        self.rebuildAuctionClientKeyIndex();
        self.hydrateTransmissionStateFromOpenOrders();
        for (const [playerId, storage] of context.storageSnapshotByPlayerId.entries()) {
            if (storage.items.length > 0) {
                self.storageByPlayerId.set(playerId, cloneStorage(storage));
                self.loadedStoragePlayerIds.add(playerId);
            }
            else {
                self.storageByPlayerId.delete(playerId);
                // 回滚到空仓库时仍然视作已 hydrate（之前 ensureStorageHydrated 已经拉取过持久化态）。
                self.loadedStoragePlayerIds.add(playerId);
            }
        }
        for (const snapshot of context.onlinePlayerSnapshots.values()) {
            if (snapshot?.playerId && Array.isArray(snapshot.inventory?.items)) {
                self.playerRuntimeService.replaceInventoryItems(snapshot.playerId, snapshot.inventory.items);
            }
            if (snapshot?.playerId && Array.isArray(snapshot.wallet?.balances)) {
                self.playerRuntimeService.replaceWalletBalances(snapshot.playerId, snapshot.wallet.balances);
            }
        }
}

export async function runExclusiveMarketMutationImpl(self: MarketRuntimeService, playerId, action, options = {}) {
        return self.runExclusive(async () => {

            const context = self.createMutationContext();
            const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
            const mutationOptions = options as { requirePrimaryPresenceFence?: boolean };
            const requirePrimaryPresenceFence = mutationOptions.requirePrimaryPresenceFence !== false;
            if (normalizedPlayerId) {
                self.captureOnlinePlayerState(normalizedPlayerId, context);
            }
            if (
                requirePrimaryPresenceFence
                && normalizedPlayerId
                && self.durableOperationService?.isEnabled?.() === true
            ) {
                const primarySnapshot = context.onlinePlayerSnapshots.get(normalizedPlayerId) ?? null;
                const runtimeOwnerId = typeof primarySnapshot?.runtimeOwnerId === 'string'
                    ? primarySnapshot.runtimeOwnerId.trim()
                    : '';
                const sessionEpoch = Number.isFinite(primarySnapshot?.sessionEpoch)
                    ? Math.max(0, Math.trunc(Number(primarySnapshot.sessionEpoch)))
                    : 0;
                if (!primarySnapshot || !runtimeOwnerId || sessionEpoch <= 0) {
                    return self.singleMessage(playerId, '玩家资产事务围栏暂不可用，请稍后重试。', 'warn');
                }
            }
            try {

                const result = await action(context);
                if (context.newTradeRecords.length > 0 && result && typeof result === 'object') {
                    result.tradeHistoryPlayerIds = Array.from(new Set(context.newTradeRecords.flatMap((entry) => [entry.buyerId, entry.sellerId])));
                }
                if (context.transmissionListingsChanged && result && typeof result === 'object') {
                    result.transmissionListingsChanged = true;
                }
                if (!context.skipPersistence) {
                    await self.marketPersistenceService.persistMutation({
                        upsertOrders: self.openOrders
                            .filter((order) => context.dirtyOrderIds.has(order.id))
                            .map((order) => ({
                            ...order,
                            item: { ...order.item },
                        })),
                        deleteOrderIds: Array.from(context.deletedOrderIds),
                        upsertStorages: Array.from(context.dirtyStoragePlayerIds, (playerKey) => {

                            const storage = self.storageByPlayerId.get(playerKey);
                            return storage
                                ? { playerId: playerKey, storage: cloneStorage(storage) }
                                : null;
                        }).filter((entry) => Boolean(entry)),
                        deleteStoragePlayerIds: Array.from(context.dirtyStoragePlayerIds).filter((playerKey) => !self.storageByPlayerId.has(playerKey)),
                        tradeRecords: context.newTradeRecords.map((entry) => ({ ...entry })),
                    });
                }
                if (context.newTradeRecords.length > 0) {
                    self.tradeHistory.unshift(...context.newTradeRecords.map((entry) => ({ ...entry })));
                    self.tradeHistory.sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));
                    self.tradeHistory = trimTradeHistoryRuntimeCache(self.tradeHistory);
                }
                // 非 durable 降级链中，坊市订单/仓库/历史先即时落库，玩家资产仍需立即 flush。
                // durable 主链已经在同一事务写入订单与玩家资产，禁止再次并发投影旧快照。
                // 任意单玩家 flush 失败不回滚整笔交易：dirty 标记不会被 markPersisted 清掉，
                // 下一次周期 flush / 玩家断线 / 关停 flush 仍会重试。
                if (!context.skipPersistence) {
                    await self.flushAffectedPlayersAfterMutation(context);
                }
                // 落库完成且无回滚后再尝试 LRU 驱逐：此时缓存与持久化已经一致，
                // 移除最久未使用且未被 pin 的玩家不会丢任何脏数据。
                self.evictStorageCacheIfOverLimit();
                return result;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (error instanceof MarketDurableOperationCommittedError) {
                    return {
                        ...self.singleMessage(playerId, '该请求已经处理，无需重复操作。', 'success'),
                        alreadyCommitted: true,
                        banCommitted: true,
                        cancelledOrderIds: [],
                        ...(context.transmissionListingsChanged ? { transmissionListingsChanged: true } : {}),
                    };
                }
                self.restoreMutationContext(context);
    if (message === 'heavenly_dao_shop_daily_limit_exceeded') {
     return self.singleMessage(playerId, '该商品今日限购数量已用完。', 'warn');
    }
                if (message.startsWith('market_order_cas_conflict:')) {
                    try {
                        await self.reloadFromPersistence();
                    }
                    catch (reloadError) {
                        self.logger.error(
                            `坊市订单冲突后刷新失败: ${reloadError instanceof Error ? reloadError.stack : String(reloadError)}`,
                        );
                    }
                    return {
                        ...self.singleMessage(playerId, '坊市订单已发生变化，已刷新最新状态，请重试。', 'warn'),
                        ...(context.transmissionListingsChanged ? { transmissionListingsChanged: true } : {}),
                    };
                }
                self.logger.error(`坊市结算失败，已回滚: ${message}`);
                return self.singleMessage(playerId, '坊市结算失败，已回滚本次操作。', 'warn');
            }
        });
}

export async function flushAffectedPlayersAfterMutationImpl(self: MarketRuntimeService, context) {
        const flushPort = self.playerPersistenceFlushService;
        if (!flushPort || typeof flushPort.flushPlayer !== 'function') {
            return;
        }
        const onlineSnapshots = context?.onlinePlayerSnapshots;
        if (!onlineSnapshots || typeof onlineSnapshots.keys !== 'function') {
            return;
        }
        const playerIds = Array.from(onlineSnapshots.keys());
        for (const affectedPlayerId of playerIds) {
            if (typeof affectedPlayerId !== 'string' || !affectedPlayerId) {
                continue;
            }
            if (!self.hasActiveProjectionFence(affectedPlayerId)) {
                continue;
            }
            try {
                await flushPort.flushPlayer(affectedPlayerId);
            }
            catch (error) {
                self.logger.error(
                    `坊市成交后玩家分域 flush 失败 playerId=${affectedPlayerId}：${error instanceof Error ? error.stack : String(error)}`,
                );
            }
        }
}

export async function runExclusivePlayerAssetMutationImpl(self: MarketRuntimeService, playerIds, action) {
        const coordinator = self.playerRuntimeService?.runExclusiveAssetMutation;
        if (typeof coordinator !== 'function') {
            return action();
        }
        return coordinator.call(self.playerRuntimeService, playerIds, action);
}

export async function runExclusiveImpl(self: MarketRuntimeService, action) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const previous = self.marketOperationQueue;

        let release;
        self.marketOperationQueue = new Promise((resolve) => {
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

