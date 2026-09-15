/**\n * market-runtime.auction.ts\n *\n * 从 MarketRuntimeService 拆出的拍卖域实现：出价、一口价、拍卖状态管理、\n * 过期结算、计时扩展与拍卖视图构建。所有函数以 xxxImpl(self: MarketRuntimeService, ...) 形式导出。\n */
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
export function buildAuctionListingsPageImpl(self: MarketRuntimeService, playerId, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const request = self.normalizeAuctionListingsRequest(payload);

        const participateLots = self.buildAuctionParticipateLotEntries(playerId);

        const mineLots = self.buildAuctionMineLotEntries(playerId);

        const source = request.tab === 'mine' ? mineLots : participateLots;

        const queryFiltered = self.filterAuctionLotEntriesByQuery(source, request.query);

        const categoryFiltered = self.filterAuctionLotEntriesByCategory(queryFiltered, request.category);

        const total = categoryFiltered.length;

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
            category: request.category,
            query: request.query,
            counts: self.buildAuctionListingCounts(queryFiltered),
            summary: self.buildAuctionListingSummary(playerId, participateLots, mineLots),
            items: categoryFiltered.slice(start, start + request.pageSize),
        };
}

export function buildAuctionListedItemsImpl(self: MarketRuntimeService) {
        const entries = [];
        for (const order of self.openOrders) {
            if (!self.isAuctionOrder(order)
                || order.side !== 'sell'
                || order.status !== 'open'
                || order.remainingQuantity <= 0
                || !self.canTradeItemOnMarket(order.item)) {
                continue;
            }
            const orderItem = self.toOrderItem(order.item);
            const orderItemKey = self.buildItemKey(orderItem);
            entries.push({
                itemKey: self.buildAuctionLotKey(order),
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

export function buildAuctionParticipateLotEntriesImpl(self: MarketRuntimeService, viewerId = '') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return self.buildAuctionListedItems()
            .filter((entry) => entry.lowestSellPrice !== undefined)
            .map((entry) => {
            const clientItemKey = self.buildClientAuctionLotKey(entry.itemKey);
            const order = entry.order ?? entry.orders?.[0];
            const createdAt = Number(order?.createdAt) || Date.now();
            const seed = self.buildAuctionStableNumber(clientItemKey || entry.itemKey);
            const timing = self.buildAuctionTiming(entry.itemKey, seed, createdAt);
            if (timing.ended) {
                return null;
            }
            const lowestSell = entry.lowestSellPrice;
            const bids = self.getAuctionBidViews(entry.itemKey, viewerId);
            const highestBid = bids[0]?.unitPrice;
            const currentPrice = Math.max(1, Math.floor(highestBid ?? lowestSell ?? 1));
            const buyoutPrice = self.getAuctionOrderBuyoutPrice(order, Math.max(1, Math.floor(lowestSell ?? 1)));
            return {
                id: clientItemKey,
                itemKey: clientItemKey,
                item: self.toAuctionPreviewItem(entry.item),
                itemId: entry.item.itemId,
                itemType: entry.item.type ?? 'material',
                itemSubType: self.buildMarketListingSubType(entry.item),
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

export function buildAuctionMineLotEntriesImpl(self: MarketRuntimeService, playerId) {
        return self.openOrders
            .filter((order) => order.ownerId === playerId
            && order.side === 'sell'
            && order.status === 'open'
            && order.remainingQuantity > 0
            && self.isAuctionOrder(order)
            && self.canTradeItemOnMarket(order.item))
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
            .map((order) => {
            const clientItemKey = self.buildClientAuctionLotKey(self.buildAuctionLotKey(order));
            const seed = self.buildAuctionStableNumber(order.id);
            const auctionLotKey = self.buildAuctionLotKey(order);
            const timing = self.buildAuctionTiming(auctionLotKey, seed, order.createdAt);
            const bids = self.getAuctionBidViews(auctionLotKey, playerId);
            const highestBid = bids[0]?.unitPrice;
            const status = timing.ended ? (bids.length > 0 ? 'sold' : 'failed') : 'consigning';
            const statusLabel = status === 'sold' ? '已成交' : status === 'failed' ? '流拍' : '寄拍中';
            const buyoutPrice = self.getAuctionOrderBuyoutPrice(order, Math.max(1, Math.floor(order.unitPrice)));
            return {
                id: order.id,
                itemKey: clientItemKey,
                item: self.toAuctionPreviewItem(order.item),
                itemId: order.item.itemId,
                itemType: order.item.type ?? 'material',
                itemSubType: self.buildMarketListingSubType(order.item),
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

export async function placeAuctionBidImpl(self: MarketRuntimeService, playerId, payload) {
        await self.ensureStorageHydrated(playerId);
        return self.runExclusiveMarketMutation(playerId, async (context) => {
            const requestedKey = String(payload?.itemKey ?? payload?.lotId ?? '').trim();
            const itemKey = self.resolveAuctionLotKey(requestedKey);
            if (!itemKey) {
                return self.singleMessage(playerId, '拍品不存在或已结束。');
            }
            const sellOrders = self.getAuctionSellOrders(itemKey).filter((order) => order.ownerId !== playerId);
            if (sellOrders.length === 0) {
                return self.singleMessage(playerId, '拍品不存在、已结束，或不能对自己的寄拍出价。');
            }
            const lot = self.buildAuctionParticipateLotEntries(playerId).find((entry) => self.resolveAuctionLotKey(entry.itemKey) === itemKey);
            if (!lot) {
                return self.singleMessage(playerId, '拍品不存在或已结束。');
            }
            const timing = self.auctionTimingByItemKey.get(itemKey);
            if (!timing || timing.endAtMs <= Date.now()) {
                return self.singleMessage(playerId, '拍品已经结束，不能继续出价。');
            }
            const unitPrice = self.normalizeUnitPrice(payload?.unitPrice);
            if (!unitPrice) {
                return self.singleMessage(playerId, '拍卖出价无效。');
            }
            const minBidPrice = self.getAuctionMinimumBidPrice(lot.currentPrice);
            if (unitPrice < minBidPrice) {
                return self.singleMessage(playerId, `最低加价为 ${self.formatUnitPrice(minBidPrice)} ${self.getCurrencyItemName()}。`);
            }
            const totalCost = calculateMarketTradeTotalCost(1, unitPrice);
            if (totalCost === null) {
                return self.singleMessage(playerId, `${self.getCurrencyItemName()}不足，无法出价。`);
            }
            const existingBids = self.getSortedAuctionBids(itemKey);
            const previousHighest = existingBids[0] ?? null;
            const previousBid = existingBids.find((entry) => entry.bidderId === playerId) ?? null;
            if (previousHighest?.bidderId && previousHighest.bidderId !== playerId) {
                await self.ensureStorageHydrated(previousHighest.bidderId);
            }
            return self.runExclusivePlayerAssetMutation(
                [playerId, previousHighest?.bidderId].filter(Boolean),
                async () => {
            if (previousBid && unitPrice <= previousBid.unitPrice) {
                return self.singleMessage(playerId, '新的出价必须高于你当前的拍卖出价。');
            }
            const now = Date.now();
            const previousReservedCost = previousBid?.reservedCost && previousHighest?.bidderId === playerId
                ? Math.max(0, Math.trunc(Number(previousBid.reservedCost) || 0))
                : 0;
            const debitCost = Math.max(0, totalCost - previousReservedCost);
            if (!self.canAffordMarketCurrency(playerId, debitCost)) {
                return self.singleMessage(playerId, `${self.getCurrencyItemName()}不足，无法出价。`);
            }
            if (debitCost > 0) {
                self.captureOnlinePlayerState(playerId, context);
                if (!self.consumeMarketCurrencyFromInventory(playerId, debitCost)) {
                    return self.singleMessage(playerId, `${self.getCurrencyItemName()}不足，无法出价。`);
                }
            }
            const result = self.createEmptyResult(playerId);
            const lotItemName = self.resolveMarketItemDisplayName(lot.item, lot.itemId);
            if (previousHighest && previousHighest.bidderId !== playerId && previousHighest.reservedCost > 0) {
                const refundDestination = self.refundOutbidAuctionReserveToPlayer(
                    previousHighest.bidderId,
                    previousHighest.reservedCost,
                    context,
                );
                const noticeKey = refundDestination === 'inventory'
                    ? 'notice.market.auction.outbid-refunded-inventory'
                    : 'notice.market.auction.outbid-refunded-storage';
                self.pushStructuredNotice(result, previousHighest.bidderId, 'system', noticeKey, noticeKey, {
                    vars: {
                        itemName: lotItemName,
                        currencyName: MARKET_CURRENCY_ITEM_ID,
                        refundAmount: previousHighest.reservedCost,
                    },
                    pills: [{ key: 'itemName', style: 'target' }, { key: 'refundAmount', style: 'damage' }],
                });
            }
            const extension = self.extendAuctionIfEndingSoon(itemKey, now);
            const bids = existingBids
                .filter((entry) => entry.bidderId !== playerId)
                .map((entry) => entry.bidderId === previousHighest?.bidderId
                ? { ...entry, reservedCost: 0 }
                : { ...entry });
            bids.push({
                bidderId: playerId,
                bidderLabel: self.resolveOnlineMarketPlayerLabel(playerId) || '未知玩家',
                unitPrice,
                createdAt: now,
                reservedCost: totalCost,
            });
            bids.sort((left, right) => right.unitPrice - left.unitPrice || left.createdAt - right.createdAt || left.bidderId.localeCompare(right.bidderId));
            self.auctionBidsByItemKey.set(itemKey, bids);
            self.persistAuctionStateToCarrier(itemKey, context);
            const extensionText = extension.extended ? '，剩余时间已延长至 30 秒' : '';
            self.pushStructuredNotice(result, playerId, 'success', 'notice.market.auction.bid-placed', `你在拍卖行出价 ${lotItemName}，当前总价 ${self.formatUnitPrice(unitPrice)} ${self.getCurrencyItemName()}${extensionText}。`, {
                vars: {
                    itemName: lotItemName,
                    currencyName: self.getCurrencyItemName(),
                    totalPrice: self.formatUnitPrice(unitPrice),
                    extensionText,
                },
                pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
            });
                    const durableCommitted = await self.commitDurableMarketMutationIfAvailable(context, playerId, 'market_auction_bid', {
                        operationId: payload?.operationId ?? payload?.requestId,
                        itemKey,
                        unitPrice,
                        totalCost,
                    });
                    if (self.durableOperationService?.isEnabled?.() && !durableCommitted) {
                        throw new Error('market_auction_bid_durable_commit_failed');
                    }
                    return result;
                },
            );
        });
}

export async function buyoutAuctionLotImpl(self: MarketRuntimeService, playerId, payload) {
        await self.ensureStorageHydrated(playerId);
        return self.runExclusiveMarketMutation(playerId, async (context) => {
            const requestedKey = String(payload?.itemKey ?? payload?.lotId ?? '').trim();
            const itemKey = self.resolveAuctionLotKey(requestedKey);
            if (!itemKey) {
                return self.singleMessage(playerId, '拍品不存在或已结束。');
            }
            const timing = self.auctionTimingByItemKey.get(itemKey);
            if (timing && timing.endAtMs <= Date.now()) {
                return self.singleMessage(playerId, '拍品已经结束，不能一口价。');
            }
            const sellOrder = self.getAuctionSellOrders(itemKey).find((order) => order.ownerId !== playerId);
            if (!sellOrder) {
                return self.singleMessage(playerId, '拍品不存在、已结束，或不能一口价自己的寄拍。');
            }
            const bids = self.getSortedAuctionBids(itemKey);
            return self.runExclusivePlayerAssetMutation(
                [playerId, sellOrder.ownerId, ...bids.map((bid) => bid.bidderId)],
                async () => {
            const configuredBuyoutPrice = self.getAuctionOrderBuyoutPrice(sellOrder, Math.max(1, Math.floor(sellOrder.unitPrice)));
            const currentPrice = Math.max(1, Math.floor(bids[0]?.unitPrice ?? sellOrder.unitPrice));
            if (configuredBuyoutPrice === null || configuredBuyoutPrice < currentPrice) {
                return self.singleMessage(playerId, '该拍品不支持一口价。');
            }
            const buyoutUnitPrice = configuredBuyoutPrice;
            const tradeQuantity = Math.max(1, Math.trunc(Number(sellOrder.remainingQuantity) || 1));
            const totalCost = calculateMarketTradeTotalCost(1, buyoutUnitPrice);
            if (totalCost === null) {
                return self.singleMessage(playerId, self.buildTradeQuantityError(buyoutUnitPrice));
            }
            const buyerBid = bids.find((entry) => entry.bidderId === playerId) ?? null;
            const buyerReservedCost = Math.max(0, Math.trunc(Number(buyerBid?.reservedCost ?? 0)));
            const additionalCost = Math.max(0, totalCost - buyerReservedCost);
            if (!self.canAffordMarketCurrency(playerId, additionalCost)) {
                return self.singleMessage(playerId, `${self.getCurrencyItemName()}不足，无法一口价。`);
            }
            self.captureOnlinePlayerState(playerId, context);
            if (additionalCost > 0 && !self.consumeMarketCurrencyFromInventory(playerId, additionalCost)) {
                return self.singleMessage(playerId, `${self.getCurrencyItemName()}不足，无法一口价。`);
            }
            const result = self.createEmptyResult(playerId);
            for (const bid of bids) {
                const reservedCost = Math.max(0, Math.trunc(Number(bid.reservedCost ?? 0)));
                if (reservedCost <= 0) {
                    continue;
                }
                if (bid.bidderId === playerId) {
                    const refund = Math.max(0, reservedCost - totalCost);
                    if (refund > 0) {
                        self.deliverMarketCurrencyToPlayer(playerId, refund, context);
                    }
                    continue;
                }
                self.deliverMarketCurrencyToPlayer(bid.bidderId, reservedCost, context);
                self.pushNotice(result, bid.bidderId, `拍卖行 ${getItemDisplayName(sellOrder.item)} 已被一口价，冻结灵石已退回。`, 'info');
            }
            self.deliverItemToPlayer(playerId, { ...sellOrder.item, count: tradeQuantity }, context);
            self.deliverMarketCurrencyToPlayer(sellOrder.ownerId, totalCost, context);
            self.recordTrade({
                source: 'auction',
                buyerId: playerId,
                sellerId: sellOrder.ownerId,
                itemId: sellOrder.item.itemId,
                quantity: tradeQuantity,
                unitPrice: buyoutUnitPrice,
            }, context);
            sellOrder.remainingQuantity -= tradeQuantity;
            sellOrder.updatedAt = Date.now();
            self.markOrderDirty(sellOrder.id, context, sellOrder);
            self.touchAffectedPlayer(result, sellOrder.ownerId);
            self.pushStructuredNotice(result, playerId, 'success', 'notice.market.auction.buyout-buyer', `你在拍卖行一口价竞得了 ${getItemDisplayName(sellOrder.item)} x${tradeQuantity}，一口价支付 ${self.getCurrencyItemName()} x${totalCost}。`, {
                vars: { itemName: getItemDisplayName(sellOrder.item), quantity: tradeQuantity, currencyName: self.getCurrencyItemName(), totalPrice: totalCost },
                pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
            });
            self.pushStructuredNotice(result, sellOrder.ownerId, 'success', 'notice.market.auction.buyout-seller', `你的寄拍已被一口价拍下：${getItemDisplayName(sellOrder.item)} x${tradeQuantity}，入账 ${self.getCurrencyItemName()} x${totalCost}。`, {
                vars: { itemName: getItemDisplayName(sellOrder.item), quantity: tradeQuantity, currencyName: self.getCurrencyItemName(), totalPrice: totalCost },
                pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
            });
            if (sellOrder.remainingQuantity <= 0) {
                sellOrder.status = 'filled';
                self.deleteOrder(sellOrder.id, context, sellOrder);
            }
            self.clearAuctionStateForItemKey(itemKey, context);
            self.compactOpenOrders();
            self.reopenAuctionStateIfActive(itemKey, context);
                    const durableCommitted = await self.commitDurableMarketMutationIfAvailable(context, playerId, 'market_auction_buyout', {
                        operationId: payload?.operationId ?? payload?.requestId,
                        itemKey,
                        orderId: sellOrder.id,
                        totalCost,
                    });
                    if (self.durableOperationService?.isEnabled?.() && !durableCommitted) {
                        throw new Error('market_auction_buyout_durable_commit_failed');
                    }
                    return result;
                },
            );
        });
}

export function getAuctionBidViewsImpl(self: MarketRuntimeService, itemKey, _viewerId = '') {
        const normalizedItemKey = self.resolveAuctionLotKey(itemKey);
        const bids = self.getSortedAuctionBids(normalizedItemKey);
        return bids
            .slice(0, 6)
            .map((bid) => ({
            bidderLabel: self.normalizePlayerLabelText(bid.bidderLabel, bid.bidderId) || self.resolveOnlineMarketPlayerLabel(bid.bidderId) || '未知玩家',
            unitPrice: bid.unitPrice,
            createdAtMs: bid.createdAt,
        }));
}

export function getSortedAuctionBidsImpl(self: MarketRuntimeService, itemKey) {
        const normalizedItemKey = self.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const bids = self.auctionBidsByItemKey.get(normalizedItemKey) ?? [];
        return bids
            .map((entry) => ({
            bidderId: String(entry?.bidderId ?? ''),
            bidderLabel: self.normalizePlayerLabelText(entry?.bidderLabel, entry?.bidderId),
            unitPrice: self.normalizeUnitPrice(entry?.unitPrice),
            createdAt: Number.isFinite(Number(entry?.createdAt)) ? Math.max(0, Math.trunc(Number(entry.createdAt))) : Date.now(),
            reservedCost: Math.max(0, Math.trunc(Number(entry?.reservedCost ?? 0))),
        }))
            .filter((entry) => entry.bidderId.length > 0 && entry.unitPrice > 0)
            .sort((left, right) => right.unitPrice - left.unitPrice || left.createdAt - right.createdAt || left.bidderId.localeCompare(right.bidderId));
}

export function isAuctionOrderImpl(self: MarketRuntimeService, order) {
        return Boolean(order?.auction && typeof order.auction === 'object' && order.auction.mode === 'auction');
}

export function getAuctionSellOrdersImpl(self: MarketRuntimeService, itemKey) {
        const normalizedItemKey = self.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        return self.openOrders
            .filter((order) => order.status === 'open'
            && order.side === 'sell'
            && order.remainingQuantity > 0
            && self.isAuctionOrder(order)
            && self.buildAuctionLotKey(order) === normalizedItemKey)
            .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

export function hasAuctionSellOrdersImpl(self: MarketRuntimeService, itemKey) {
        return self.getAuctionSellOrders(itemKey).length > 0;
}

export function hydrateAuctionStateFromOpenOrdersImpl(self: MarketRuntimeService) {
        self.auctionClientKeyToLotKey.clear();
        for (const order of self.openOrders) {
            if (!self.isAuctionOrder(order) || order.side !== 'sell' || order.status !== 'open' || order.remainingQuantity <= 0) {
                continue;
            }
            const itemKey = self.buildAuctionLotKey(order);
            const clientKey = self.buildClientAuctionLotKey(itemKey);
            if (clientKey) {
                self.auctionClientKeyToLotKey.set(clientKey, itemKey);
            }
            const auction = self.normalizeAuctionOrderState(order.auction);
            if (!auction) {
                continue;
            }
            if (!self.auctionTimingByItemKey.has(itemKey)) {
                self.auctionTimingByItemKey.set(itemKey, {
                    startAtMs: auction.startAtMs,
                    normalDurationSeconds: auction.normalDurationSeconds,
                    endAtMs: auction.endAtMs,
                    maxEndAtMs: auction.maxEndAtMs,
                });
            }
            if (!self.auctionBidsByItemKey.has(itemKey) && auction.bids.length > 0) {
                self.auctionBidsByItemKey.set(itemKey, auction.bids);
            }
        }
}

export function initializeAuctionOrderStateImpl(self: MarketRuntimeService, order, context, buyoutPrice = null, durationSeconds = null) {
        if (!order || order.side !== 'sell') {
            return;
        }
        const itemKey = self.buildAuctionLotKey(order);
        if (!itemKey) {
            return;
        }
        const clientKey = self.buildClientAuctionLotKey(itemKey);
        if (clientKey) {
            self.auctionClientKeyToLotKey.set(clientKey, itemKey);
        }
        if (!self.auctionTimingByItemKey.has(itemKey)) {
            const seed = self.buildAuctionStableNumber(self.buildClientAuctionLotKey(itemKey) || itemKey);
            const base = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
                ? { startAtMs: order.createdAt, durationSeconds: Math.max(1, Math.trunc(Number(durationSeconds))) }
                : self.buildAuctionBaseTiming(seed, order.createdAt, false);
            const normalEndAtMs = base.startAtMs + base.durationSeconds * 1000;
            self.auctionTimingByItemKey.set(itemKey, {
                startAtMs: base.startAtMs,
                normalDurationSeconds: base.durationSeconds,
                endAtMs: normalEndAtMs,
                maxEndAtMs: normalEndAtMs + AUCTION_MAX_EXTENSION_MS,
            });
        }
        if (!self.auctionBidsByItemKey.has(itemKey)) {
            self.auctionBidsByItemKey.set(itemKey, []);
        }
        const timing = self.auctionTimingByItemKey.get(itemKey);
        if (timing) {
            order.auction = {
                version: 1,
                mode: 'auction',
                buyoutPrice,
                startAtMs: timing.startAtMs,
                normalDurationSeconds: timing.normalDurationSeconds,
                endAtMs: timing.endAtMs,
                maxEndAtMs: timing.maxEndAtMs,
                bids: self.getSortedAuctionBids(itemKey),
            };
        }
        self.persistAuctionStateToCarrier(itemKey, context);
}

export function normalizeAuctionOrderStateImpl(self: MarketRuntimeService, raw) {
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
                bidderLabel: self.normalizePlayerLabelText(entry?.bidderLabel, entry?.bidderId),
                unitPrice: self.normalizeUnitPrice(entry?.unitPrice),
                createdAt: Number.isFinite(Number(entry?.createdAt)) ? Math.max(0, Math.trunc(Number(entry.createdAt))) : Date.now(),
                reservedCost: Math.max(0, Math.trunc(Number(entry?.reservedCost ?? 0))),
            })).filter((entry) => entry.bidderId.length > 0 && entry.unitPrice > 0)
            : [];
        bids.sort((left, right) => right.unitPrice - left.unitPrice || left.createdAt - right.createdAt || left.bidderId.localeCompare(right.bidderId));
        return {
            version: 1,
            mode: 'auction',
            buyoutPrice: self.normalizeAuctionBuyoutPrice(raw.buyoutPrice, 1),
            startAtMs,
            normalDurationSeconds,
            endAtMs,
            maxEndAtMs,
            bids,
        };
}

export function persistAuctionStateToCarrierImpl(self: MarketRuntimeService, itemKey, context) {
        const normalizedItemKey = self.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const timing = self.auctionTimingByItemKey.get(normalizedItemKey);
        if (!timing) {
            return;
        }
        const carrier = self.getAuctionSellOrders(normalizedItemKey)
            .find((order) => !context || !context.deletedOrderIds.has(order.id));
        if (!carrier) {
            return;
        }
        carrier.auction = {
            version: 1,
            mode: 'auction',
            buyoutPrice: self.getAuctionOrderBuyoutPrice(carrier, Math.max(1, Math.floor(carrier.unitPrice))),
            startAtMs: timing.startAtMs,
            normalDurationSeconds: timing.normalDurationSeconds,
            endAtMs: timing.endAtMs,
            maxEndAtMs: timing.maxEndAtMs,
            bids: self.getSortedAuctionBids(normalizedItemKey),
        };
        carrier.updatedAt = Date.now();
        if (context) {
            self.markOrderDirty(carrier.id, context);
        }
}

export function clearAuctionStateForItemKeyImpl(self: MarketRuntimeService, itemKey, context) {
        const normalizedItemKey = self.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        self.auctionBidsByItemKey.delete(normalizedItemKey);
        self.auctionTimingByItemKey.delete(normalizedItemKey);
        for (const order of self.openOrders) {
            if (self.buildAuctionLotKey(order) !== normalizedItemKey || !order.auction) {
                continue;
            }
            delete order.auction;
            order.updatedAt = Date.now();
            if (context && !context.deletedOrderIds.has(order.id)) {
                self.markOrderDirty(order.id, context);
            }
        }
}

export function reopenAuctionStateIfActiveImpl(self: MarketRuntimeService, itemKey, context) {
        const normalizedItemKey = self.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const nextOrder = self.getAuctionSellOrders(normalizedItemKey)
            .find((order) => !context || !context.deletedOrderIds.has(order.id));
        if (!nextOrder) {
            return;
        }
        self.initializeAuctionOrderState({ ...nextOrder, createdAt: Date.now() }, context);
}

export async function settleExpiredAuctionLotsImpl(self: MarketRuntimeService) {
        return self.runExclusiveMarketMutation('', async (context) => {
            const itemKeys = Array.from(self.auctionTimingByItemKey.keys());
            const participantPlayerIds = Array.from(new Set(itemKeys.flatMap((itemKey) => [
                ...self.getAuctionSellOrders(itemKey).map((order) => order.ownerId),
                ...self.getSortedAuctionBids(itemKey).map((bid) => bid.bidderId),
            ]).filter(Boolean)));
            return self.runExclusivePlayerAssetMutation(participantPlayerIds, async () => {
            const result = { affectedPlayerIds: [], notices: [] };
            const now = Date.now();
            let changed = false;
            for (const itemKey of itemKeys) {
                changed = self.settleExpiredAuctionLot(itemKey, now, context, result) || changed;
            }
            if (!changed) {
                context.skipPersistence = true;
                return null;
            }
            self.compactOpenOrders();
                const primaryPlayerId = participantPlayerIds[0] ?? result.affectedPlayerIds[0] ?? '';
                const durableCommitted = primaryPlayerId
                    ? await self.commitDurableMarketMutationIfAvailable(context, primaryPlayerId, 'market_auction_expiry', {
                        settledAt: now,
                        itemKeys,
                    }, { requirePresenceFence: false })
                    : false;
                if (self.durableOperationService?.isEnabled?.() && !durableCommitted) {
                    throw new Error('market_auction_expiry_durable_commit_failed');
                }
                return result;
            });
        });
}

export function settleExpiredAuctionLotImpl(self: MarketRuntimeService, itemKey, now, context, result) {
        const normalizedItemKey = self.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const timing = self.auctionTimingByItemKey.get(normalizedItemKey);
        if (!timing || timing.endAtMs > now) {
            return false;
        }
        const bids = self.getSortedAuctionBids(normalizedItemKey);
        const highestBid = bids[0] ?? null;
        if (!highestBid) {
            const sellOrder = self.getAuctionSellOrders(normalizedItemKey)
                .find((order) => !context.deletedOrderIds.has(order.id));
            if (!sellOrder) {
                self.clearAuctionStateForItemKey(normalizedItemKey, context);
                return true;
            }
            const returnedQuantity = Math.max(1, Math.trunc(Number(sellOrder.remainingQuantity) || 1));
            const itemName = getItemDisplayName(sellOrder.item);
            self.deliverItemToPlayer(
                sellOrder.ownerId,
                { ...sellOrder.item, count: returnedQuantity },
                context,
            );
            sellOrder.status = 'cancelled';
            sellOrder.remainingQuantity = 0;
            sellOrder.updatedAt = now;
            self.deleteOrder(sellOrder.id, context, sellOrder);
            self.clearAuctionStateForItemKey(normalizedItemKey, context);
            self.pushStructuredNotice(
                result,
                sellOrder.ownerId,
                'loot',
                'notice.market.auction.expired-returned',
                'notice.market.auction.expired-returned',
                {
                    vars: { itemName, quantity: returnedQuantity },
                    pills: [{ key: 'itemName', style: 'target' }],
                },
            );
            return true;
        }
        const sellOrder = self.getAuctionSellOrders(normalizedItemKey)
            .find((order) => order.ownerId !== highestBid.bidderId && !context.deletedOrderIds.has(order.id));
        if (!sellOrder) {
            self.refundAuctionBidReserves(normalizedItemKey, context, result, `拍卖行拍品已失效，冻结灵石已退回。`);
            self.clearAuctionStateForItemKey(normalizedItemKey, context);
            return true;
        }
        const tradeQuantity = Math.max(1, Math.trunc(Number(sellOrder.remainingQuantity) || 1));
        const totalCost = calculateMarketTradeTotalCost(1, highestBid.unitPrice);
        if (totalCost === null || highestBid.reservedCost < totalCost) {
            self.refundAuctionBidReserves(normalizedItemKey, context, result, `拍卖行拍品结算失败，冻结灵石已退回。`);
            self.clearAuctionStateForItemKey(normalizedItemKey, context);
            self.reopenAuctionStateIfActive(normalizedItemKey, context);
            return true;
        }
        for (const bid of bids) {
            const reservedCost = Math.max(0, Math.trunc(Number(bid.reservedCost ?? 0)));
            if (reservedCost <= 0 || bid.bidderId === highestBid.bidderId) {
                continue;
            }
            self.deliverMarketCurrencyToPlayer(bid.bidderId, reservedCost, context);
            self.pushNotice(result, bid.bidderId, `拍卖行 ${getItemDisplayName(sellOrder.item)} 已成交，冻结灵石已退回。`, 'info');
        }
        const overpayRefund = Math.max(0, highestBid.reservedCost - totalCost);
        if (overpayRefund > 0) {
            self.deliverMarketCurrencyToPlayer(highestBid.bidderId, overpayRefund, context);
        }
        self.deliverItemToPlayer(highestBid.bidderId, { ...sellOrder.item, count: tradeQuantity }, context);
        self.deliverMarketCurrencyToPlayer(sellOrder.ownerId, totalCost, context);
        self.recordTrade({
            source: 'auction',
            buyerId: highestBid.bidderId,
            sellerId: sellOrder.ownerId,
            itemId: sellOrder.item.itemId,
            quantity: tradeQuantity,
            unitPrice: highestBid.unitPrice,
        }, context);
        sellOrder.remainingQuantity -= tradeQuantity;
        sellOrder.updatedAt = now;
        self.markOrderDirty(sellOrder.id, context);
        self.pushStructuredNotice(result, highestBid.bidderId, 'success', 'notice.market.auction.settled-buyer', `你竞得了 ${getItemDisplayName(sellOrder.item)} x${tradeQuantity}，整包成交价 ${self.formatUnitPrice(highestBid.unitPrice)} ${self.getCurrencyItemName()}。`, {
            vars: { itemName: getItemDisplayName(sellOrder.item), quantity: tradeQuantity, currencyName: self.getCurrencyItemName(), totalPrice: self.formatUnitPrice(highestBid.unitPrice) },
            pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
        });
        self.pushStructuredNotice(result, sellOrder.ownerId, 'success', 'notice.market.auction.settled-seller', `你的寄拍已成交：${getItemDisplayName(sellOrder.item)} x${tradeQuantity}，入账 ${self.getCurrencyItemName()} x${totalCost}。`, {
            vars: { itemName: getItemDisplayName(sellOrder.item), quantity: tradeQuantity, currencyName: self.getCurrencyItemName(), totalPrice: totalCost },
            pills: [{ key: 'itemName', style: 'target' }, { key: 'totalPrice', style: 'damage' }],
        });
        if (sellOrder.remainingQuantity <= 0) {
            sellOrder.status = 'filled';
            self.deleteOrder(sellOrder.id, context);
        }
        self.clearAuctionStateForItemKey(normalizedItemKey, context);
        self.reopenAuctionStateIfActive(normalizedItemKey, context);
        return true;
}

export function refundAuctionBidReservesImpl(self: MarketRuntimeService, itemKey, context, result, text) {
        for (const bid of self.getSortedAuctionBids(itemKey)) {
            const reservedCost = Math.max(0, Math.trunc(Number(bid.reservedCost ?? 0)));
            if (reservedCost <= 0) {
                continue;
            }
            self.deliverMarketCurrencyToPlayer(bid.bidderId, reservedCost, context);
            self.pushNotice(result, bid.bidderId, text, 'info');
        }
}

export function getAuctionMinimumBidPriceImpl(self: MarketRuntimeService, currentPrice) {
        if (currentPrice >= MARKET_MAX_UNIT_PRICE) {
            return MARKET_MAX_UNIT_PRICE;
        }
        return normalizeMarketPriceUp(currentPrice + getMarketPriceStep(currentPrice));
}

export function rewriteAuctionBuyoutNoticesImpl(self: MarketRuntimeService, result, playerId) {
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
                    notice.text = `${self.getCurrencyItemName()}不足，无法一口价。`;
                }
                continue;
            }
            if (typeof notice.text === 'string' && notice.text.includes('你的挂售已成交')) {
                notice.text = notice.text.replace('你的挂售已成交', '你的寄拍已被一口价拍下');
                notice.kind = 'success';
            }
        }
}

export function normalizeAuctionListingsRequestImpl(self: MarketRuntimeService, payload) {
        const category = typeof payload?.category === 'string' && (payload.category === 'all' || ITEM_TYPES.includes(payload.category))
            ? payload.category
            : 'all';
        return {
            tab: payload?.tab === 'mine' ? 'mine' : 'participate',
            page: normalizeMarketRequestPage(payload?.page),
            pageSize: normalizeMarketAuctionPageSize(payload?.pageSize),
            category,
            query: normalizeMarketAuctionQuery(payload?.query),
        };
}

export function filterAuctionLotEntriesByCategoryImpl(self: MarketRuntimeService, entries, category) {
        if (category === 'all') {
            return entries;
        }
        return entries.filter((entry) => entry.itemType === category);
}

export function filterAuctionLotEntriesByQueryImpl(self: MarketRuntimeService, entries, query) {
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

export function buildAuctionListingCountsImpl(self: MarketRuntimeService, entries) {
        const categoryCounts = { all: entries.length };
        for (const itemType of ITEM_TYPES) {
            categoryCounts[itemType] = entries.filter((entry) => entry.itemType === itemType).length;
        }
        return { categoryCounts };
}

export function buildAuctionListingSummaryImpl(self: MarketRuntimeService, playerId, participateLots, mineLots) {
        return {
            activeLots: participateLots.length,
            buyoutLots: participateLots.filter((lot) => lot.buyoutPrice !== null && lot.buyoutPrice !== undefined).length,
            totalCurrentPrice: participateLots.reduce((sum, lot) => sum + Math.max(0, Math.floor(Number(lot.currentPrice) || 0)), 0),
            myBidCount: Array.from(self.auctionBidsByItemKey.values()).flat().filter((bid) => bid.bidderId === playerId).length,
            myConsignments: mineLots.length,
            consigningLots: mineLots.filter((lot) => lot.status === 'consigning').length,
            soldLots: mineLots.filter((lot) => lot.status === 'sold').length,
            failedLots: mineLots.filter((lot) => lot.status === 'failed').length,
            storageCount: self.getStorage(playerId).items.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.count) || 0)), 0),
        };
}

export function toAuctionPreviewItemImpl(self: MarketRuntimeService, item) {
        return {
            itemId: item.itemId,
            count: 1,
            name: self.resolveMarketItemDisplayName(item, item.itemId),
            type: item.type ?? 'material',
            grade: item.grade,
            level: item.level,
            groundLabel: item.groundLabel,
            equipSlot: item.equipSlot,
            enhanceLevel: Number.isFinite(Number(item.enhanceLevel))
                ? Math.max(0, Math.trunc(Number(item.enhanceLevel)))
                : undefined,
            // 残卷预览必须带上功法身份，客户端才能在悬浮详情里展示这卷记载的究竟是哪门功法。
            learnTechniqueId: item.learnTechniqueId,
            learnTechniqueMaxLevel: item.learnTechniqueMaxLevel,
        };
}

export function normalizeAuctionDurationSecondsImpl(self: MarketRuntimeService, value) {
        const numeric = Math.floor(Number(value));
        const hours = Number.isFinite(numeric)
            ? Math.max(AUCTION_MIN_DURATION_HOURS, Math.min(AUCTION_MAX_DURATION_HOURS, numeric))
            : AUCTION_DEFAULT_DURATION_HOURS;
        return hours * 60 * 60;
}

export function buildAuctionTimingImpl(self: MarketRuntimeService, itemKey, seed, createdAt) {
        const base = self.buildAuctionBaseTiming(seed, createdAt);
        return self.getAuctionTimingState(itemKey, base.startAtMs, base.durationSeconds, Date.now());
}

export function buildAuctionBaseTimingImpl(self: MarketRuntimeService, seed, createdAt, refreshExpiredLegacy = true) {
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

export function getAuctionTimingStateImpl(self: MarketRuntimeService, itemKey, startAtMs, normalDurationSeconds, now = Date.now()) {
        const normalizedItemKey = self.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const normalEndAtMs = startAtMs + normalDurationSeconds * 1000;
        const maxEndAtMs = normalEndAtMs + AUCTION_MAX_EXTENSION_MS;
        const existing = self.auctionTimingByItemKey.get(normalizedItemKey);
        if (existing && Number(existing.maxEndAtMs) >= Number(existing.endAtMs)) {
            return self.projectAuctionTiming(existing);
        }
        const next = {
            startAtMs,
            normalDurationSeconds,
            endAtMs: normalEndAtMs,
            maxEndAtMs,
        };
        self.auctionTimingByItemKey.set(normalizedItemKey, next);
        return self.projectAuctionTiming(next);
}

export function projectAuctionTimingImpl(self: MarketRuntimeService, state) {
        return {
            startAtMs: state.startAtMs,
            durationSeconds: Math.max(1, Math.ceil((state.endAtMs - state.startAtMs) / 1000)),
            endAtMs: state.endAtMs,
            ended: state.endAtMs <= Date.now(),
        };
}

export function extendAuctionIfEndingSoonImpl(self: MarketRuntimeService, itemKey, now = Date.now()) {
        const normalizedItemKey = self.resolveAuctionLotKey(itemKey) || String(itemKey ?? '');
        const timing = self.auctionTimingByItemKey.get(normalizedItemKey);
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

export function buildAuctionStableNumberImpl(self: MarketRuntimeService, value) {
        const text = String(value ?? '');
        let hash = 0;
        for (let index = 0; index < text.length; index += 1) {
            hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
        }
        return Math.abs(hash);
}

export function buildAuctionLotKeyImpl(self: MarketRuntimeService, order) {
        const orderId = typeof order?.id === 'string' ? order.id.trim() : '';
        return orderId ? `auction:${orderId}` : '';
}

export function buildClientAuctionLotKeyImpl(self: MarketRuntimeService, itemKey) {
        return self.buildClientMarketKey(itemKey);
}

export function resolveAuctionLotKeyImpl(self: MarketRuntimeService, itemKey) {
        const normalizedItemKey = typeof itemKey === 'string' ? itemKey.trim() : '';
        if (!normalizedItemKey) {
            return '';
        }
        if (normalizedItemKey.startsWith('auction:')) {
            return normalizedItemKey;
        }
        const cached = self.auctionClientKeyToLotKey.get(normalizedItemKey);
        if (cached) {
            return cached;
        }
        return normalizedItemKey;
}

