/**\n * market-runtime.transmission.ts\n *\n * 从 MarketRuntimeService 拆出的传法坊市域实现：挂单注册、水合、视图构建与购买。\n * 所有函数以 xxxImpl(self: MarketRuntimeService, ...) 形式导出。\n */
import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AUCTION_DEFAULT_DURATION_HOURS, AUCTION_LISTING_FEE_BASE, AUCTION_LISTING_FEE_RATE, AUCTION_MAX_DURATION_HOURS, AUCTION_MIN_DURATION_HOURS, CUSTOM_TECHNIQUE_BOOK_ITEM_ID, EQUIP_SLOTS, HEAVENLY_DAO_SHOP_CURRENCY_ITEM_ID, HEAVENLY_DAO_SHOP_ITEMS, ITEM_TYPES, MARKET_MAX_ENHANCE_LEVEL, MARKET_MAX_UNIT_PRICE, TECHNIQUE_EQUIP_SLOTS, TECHNIQUE_GRADE_ORDER, calculateHeavenlyDaoShopDiscountedPrice, calculateMarketOrderReservedCost, calculateMarketOrderTradeTotalCost, calculateMarketRoundedTotalCost, calculateMarketTradeTotalCost, canMergeItemStack, createItemStackSignature, getItemDisplayName, getMarketMinimumTradeQuantity, getMarketPriceStep, isLegacyMarketPrice, isValidMarketListingPrice, isValidMarketPrice, isValidMarketTradeQuantity, normalizeMarketAuctionPageSize, normalizeMarketAuctionQuery, normalizeMarketListingsPageSize, normalizeMarketPriceUp, normalizeMarketRequestPage, normalizeMarketTradeSource, normalizeTransmissionCategory, normalizeTransmissionListingSort, resolveClampedMarketResponsePage, resolvePlayerFacingContentName } from '@mud/shared';
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
export function isTransmissionOrderImpl(self: MarketRuntimeService, order) {
        return order?.listingMode === 'transmission';
}

export function isSpecialListingOrderImpl(self: MarketRuntimeService, order) {
        return self.isAuctionOrder(order) || self.isTransmissionOrder(order);
}

export function buildTransmissionLotKeyImpl(self: MarketRuntimeService, order) {
        const orderId = typeof order?.id === 'string' ? order.id.trim() : '';
        return orderId ? `transmission:${orderId}` : '';
}

export function buildClientTransmissionLotKeyImpl(self: MarketRuntimeService, itemKey) {
        return self.buildClientMarketKey(itemKey);
}

export function resolveTransmissionLotKeyImpl(self: MarketRuntimeService, itemKey) {
        const normalizedItemKey = typeof itemKey === 'string' ? itemKey.trim() : '';
        if (!normalizedItemKey) {
            return '';
        }
        if (normalizedItemKey.startsWith('transmission:')) {
            return normalizedItemKey;
        }
        return self.transmissionClientKeyToLotKey.get(normalizedItemKey) ?? '';
}

export function registerTransmissionLotImpl(self: MarketRuntimeService, order) {
        const itemKey = self.buildTransmissionLotKey(order);
        const clientKey = self.buildClientTransmissionLotKey(itemKey);
        if (itemKey && clientKey) {
            self.transmissionClientKeyToLotKey.set(clientKey, itemKey);
        }
}

export function hydrateTransmissionStateFromOpenOrdersImpl(self: MarketRuntimeService) {
        self.transmissionClientKeyToLotKey.clear();
        for (const order of self.openOrders) {
            if (!self.isTransmissionOrder(order) || order.side !== 'sell' || order.status !== 'open' || order.remainingQuantity <= 0) {
                continue;
            }
            self.registerTransmissionLot(order);
        }
}

export function getTransmissionSellOrderImpl(self: MarketRuntimeService, itemKey) {
        const normalizedItemKey = self.resolveTransmissionLotKey(itemKey);
        if (!normalizedItemKey) {
            return null;
        }
        return self.openOrders.find((order) => self.isTransmissionOrder(order)
            && order.side === 'sell'
            && order.status === 'open'
            && order.remainingQuantity > 0
            && self.buildTransmissionLotKey(order) === normalizedItemKey) ?? null;
}

export function buildTransmissionListedItemsImpl(self: MarketRuntimeService) {
        const entries = [];
        for (const order of self.openOrders) {
            if (!self.isTransmissionOrder(order)
                || order.side !== 'sell'
                || order.status !== 'open'
                || order.remainingQuantity <= 0) {
                continue;
            }
            entries.push({ itemKey: self.buildTransmissionLotKey(order), item: self.toOrderItem(order.item), order });
        }
        return entries;
}

export function buildTransmissionLotEntriesImpl(self: MarketRuntimeService, ownerId = '') {
        const summariesByTechniqueId = new Map();
        return self.buildTransmissionListedItems()
            .filter((entry) => (ownerId ? entry.order.ownerId === ownerId : true))
            .map((entry) => {
            const techniqueId = typeof entry.item?.learnTechniqueId === 'string' ? entry.item.learnTechniqueId.trim() : '';
            let summary = summariesByTechniqueId.get(techniqueId);
            if (!summary) {
                summary = self.resolveTransmissionTechniqueSummary(entry.item);
                summariesByTechniqueId.set(techniqueId, summary);
            }
            return {
                id: self.buildClientTransmissionLotKey(entry.itemKey),
                itemKey: self.buildClientTransmissionLotKey(entry.itemKey),
                item: self.toAuctionPreviewItem(entry.item),
                itemId: entry.item.itemId,
                itemType: entry.item.type ?? 'skill_book',
                itemSubType: summary.techniqueCategory ?? 'other',
                techniqueName: summary.techniqueName,
                techniqueCategory: summary.techniqueCategory,
                techniqueGrade: summary.techniqueGrade,
                techniqueRealmLv: summary.techniqueRealmLv,
                price: Math.max(1, Math.trunc(Number(entry.order.unitPrice) || 1)),
                sellerLabel: '匿名传法',
                isMine: Boolean(ownerId) && entry.order.ownerId === ownerId,
                remainingQuantity: entry.order.remainingQuantity,
                createdAt: Number(entry.order.createdAt) || 0,
                orderId: entry.order.id,
            };
        });
}

export function resolveTransmissionTechniqueSummaryImpl(self: MarketRuntimeService, item) {
        const techniqueId = typeof item?.learnTechniqueId === 'string' ? item.learnTechniqueId.trim() : '';
        const template = techniqueId
            ? self.contentTemplateRepository.techniqueRegistry?.tryGetRef?.(techniqueId)
            : undefined;
        const normalizedCategory = normalizeTransmissionCategory(template?.category);
        const rawGrade = typeof template?.grade === 'string' ? template.grade : item?.grade;
        const techniqueGrade = TECHNIQUE_GRADE_ORDER.includes(rawGrade) ? rawGrade : undefined;
        const rawRealmLv = Number(template?.realmLv ?? item?.level);
        const techniqueRealmLv = Number.isFinite(rawRealmLv) && rawRealmLv > 0
            ? Math.max(1, Math.trunc(rawRealmLv))
            : undefined;
        const techniqueName = resolvePlayerFacingContentName(
            techniqueId || item?.itemId,
            '未知功法',
            template?.name,
            item?.name,
        );
        return {
            techniqueName,
            techniqueCategory: normalizedCategory === 'all' ? undefined : normalizedCategory,
            techniqueGrade,
            techniqueRealmLv,
        };
}

export function buildTransmissionListingsPageImpl(self: MarketRuntimeService, playerId, payload) {
        const request = self.normalizeTransmissionListingsRequest(payload);
        const participateLots = self.buildTransmissionLotEntries('')
            .map((entry) => {
            const isMine = entry.itemKey ? self.isMyTransmissionLot(playerId, entry.itemKey) : false;
            return { ...entry, isMine, orderId: isMine ? entry.orderId : '' };
        });
        const mineLots = self.buildTransmissionLotEntries(playerId);
        const source = request.tab === 'mine' ? mineLots : participateLots;
        const queryFiltered = self.filterTransmissionLotEntriesByQuery(source, request.query);
        const categoryFiltered = request.category === 'all'
            ? queryFiltered
            : queryFiltered.filter((entry) => entry.techniqueCategory === request.category);
        const filtered = self.sortTransmissionLotEntries(categoryFiltered, request.sort);
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / request.pageSize));
        const page = Math.max(1, Math.min(totalPages, request.page));
        const start = (page - 1) * request.pageSize;
        return {
            currencyItemId: MARKET_CURRENCY_ITEM_ID,
            currencyItemName: self.getCurrencyItemName(),
            tab: request.tab,
            page,
            pageSize: request.pageSize,
            total,
            query: request.query,
            category: request.category,
            sort: request.sort,
            counts: {
                participate: participateLots.length,
                mine: mineLots.length,
                categoryCounts: self.buildTransmissionCategoryCounts(queryFiltered),
            },
            items: filtered.slice(start, start + request.pageSize),
        };
}

export function normalizeTransmissionListingsRequestImpl(self: MarketRuntimeService, payload) {
        return {
            tab: payload?.tab === 'mine' ? 'mine' : 'participate',
            page: normalizeMarketRequestPage(payload?.page),
            pageSize: normalizeMarketAuctionPageSize(payload?.pageSize),
            query: normalizeMarketAuctionQuery(payload?.query),
            category: normalizeTransmissionCategory(payload?.category),
            sort: normalizeTransmissionListingSort(payload?.sort),
        };
}

export function filterTransmissionLotEntriesByQueryImpl(self: MarketRuntimeService, entries, query) {
        const keyword = normalizeMarketAuctionQuery(query).toLocaleLowerCase();
        if (!keyword) {
            return entries;
        }
        return entries.filter((entry) => {
            const techniqueName = String(entry.techniqueName ?? '').toLocaleLowerCase();
            const techniqueId = String(entry.item?.learnTechniqueId ?? '').toLocaleLowerCase();
            const itemName = String(entry.item?.name ?? '').toLocaleLowerCase();
            return techniqueName.includes(keyword) || techniqueId.includes(keyword) || itemName.includes(keyword);
        });
}

export function buildTransmissionCategoryCountsImpl(self: MarketRuntimeService, entries) {
        const categoryCounts = { all: entries.length, arts: 0, internal: 0, divine: 0, secret: 0 };
        for (const entry of entries) {
            if (entry.techniqueCategory && Object.hasOwn(categoryCounts, entry.techniqueCategory)) {
                categoryCounts[entry.techniqueCategory] += 1;
            }
        }
        return categoryCounts;
}

export function sortTransmissionLotEntriesImpl(self: MarketRuntimeService, entries, sort) {
        const gradeIndex = (entry) => Math.max(-1, TECHNIQUE_GRADE_ORDER.indexOf(entry.techniqueGrade));
        return [...entries].sort((left, right) => {
            let compared = 0;
            if (sort === 'price_desc') {
                compared = right.price - left.price;
            }
            else if (sort === 'realm_desc') {
                compared = (right.techniqueRealmLv ?? 0) - (left.techniqueRealmLv ?? 0)
                    || gradeIndex(right) - gradeIndex(left);
            }
            else if (sort === 'grade_desc') {
                compared = gradeIndex(right) - gradeIndex(left)
                    || (right.techniqueRealmLv ?? 0) - (left.techniqueRealmLv ?? 0);
            }
            else if (sort === 'newest') {
                compared = right.createdAt - left.createdAt;
            }
            else {
                compared = left.price - right.price;
            }
            return compared
                || right.createdAt - left.createdAt
                || String(left.itemKey).localeCompare(String(right.itemKey), 'zh-Hans-CN');
        });
}

export function isMyTransmissionLotImpl(self: MarketRuntimeService, playerId, clientItemKey) {
        const order = self.getTransmissionSellOrder(clientItemKey);
        return Boolean(order && order.ownerId === playerId);
}

export async function buyTransmissionLotImpl(self: MarketRuntimeService, playerId, payload) {
        await self.ensureStorageHydrated(playerId);
        return self.runExclusiveMarketMutation(playerId, async (context) => {
            const requestedKey = String(payload?.itemKey ?? payload?.lotId ?? '').trim();
            const itemKey = self.resolveTransmissionLotKey(requestedKey);
            const sellOrder = itemKey ? self.getTransmissionSellOrder(itemKey) : null;
            if (!sellOrder) {
                return self.singleStructuredMessage(playerId, 'warn', 'notice.market.transmission-lot-missing', '这卷功法残卷已不在传法台。', {});
            }
            if (sellOrder.ownerId === playerId) {
                return self.singleStructuredMessage(playerId, 'warn', 'notice.market.transmission-own-lot', '不能求取自己寄售的功法残卷。', {});
            }
            return self.runExclusivePlayerAssetMutation([playerId, sellOrder.ownerId], async () => {
            const tradeQuantity = Math.max(1, Math.trunc(Number(sellOrder.remainingQuantity) || 1));
            const unitPrice = Math.max(1, Math.trunc(Number(sellOrder.unitPrice) || 1));
            const totalCost = calculateMarketTradeTotalCost(1, unitPrice);
            if (totalCost === null) {
                return self.singleMessage(playerId, self.buildTradeQuantityError(unitPrice));
            }
            if (!self.canAffordMarketCurrency(playerId, totalCost)) {
                return self.singleMessage(playerId, `${self.getCurrencyItemName()}不足，无法求取。`);
            }
            self.captureOnlinePlayerState(playerId, context);
            if (!self.consumeMarketCurrencyFromInventory(playerId, totalCost)) {
                return self.singleMessage(playerId, `${self.getCurrencyItemName()}不足，无法求取。`);
            }
            const result = self.createEmptyResult(playerId);
            const itemName = getItemDisplayName(sellOrder.item);
            // 交付完整实例（含 learnTechniqueId），买家才能真正学习这门功法。
            self.deliverItemToPlayer(playerId, { ...sellOrder.item, count: tradeQuantity }, context);
            self.deliverMarketCurrencyToPlayer(sellOrder.ownerId, totalCost, context);
            self.recordTrade({
                source: 'transmission',
                buyerId: playerId,
                sellerId: sellOrder.ownerId,
                itemId: sellOrder.item.itemId,
                quantity: tradeQuantity,
                unitPrice,
            }, context);
            sellOrder.remainingQuantity -= tradeQuantity;
            sellOrder.updatedAt = Date.now();
            self.markOrderDirty(sellOrder.id, context, sellOrder);
            self.touchAffectedPlayer(result, sellOrder.ownerId);
            self.pushStructuredNotice(result, playerId, 'success', 'notice.market.transmission.bought', `你在传法台求得 ${itemName}，付出 ${self.getCurrencyItemName()} x${totalCost}。`, {
                vars: { itemName, currencyName: self.getCurrencyItemName(), totalPrice: totalCost },
                pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
            });
            self.pushStructuredNotice(result, sellOrder.ownerId, 'success', 'notice.market.transmission.sold', `你的传法台寄售已成交：${itemName}，入账 ${self.getCurrencyItemName()} x${totalCost}。`, {
                vars: { itemName, currencyName: self.getCurrencyItemName(), totalPrice: totalCost },
                pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
            });
            if (sellOrder.remainingQuantity <= 0) {
                sellOrder.status = 'filled';
                self.deleteOrder(sellOrder.id, context, sellOrder);
            }
            self.compactOpenOrders();
                const durableCommitted = await self.commitDurableMarketMutationIfAvailable(context, playerId, 'market_transmission_buyout', {
                    operationId: payload?.operationId ?? payload?.requestId,
                    itemKey,
                    orderId: sellOrder.id,
                    totalCost,
                });
                if (self.durableOperationService?.isEnabled?.() && !durableCommitted) {
                    throw new Error('market_transmission_buyout_durable_commit_failed');
                }
                return result;
            });
        });
}

