/**\n * market-runtime.storage.ts\n *\n * 从 MarketRuntimeService 拆出的仓储域实现：仓库水合、LRU 缓存、存取与清理。\n * 所有函数以 xxxImpl(self: MarketRuntimeService, ...) 形式导出。\n */
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
export function buildMarketStorageImpl(self: MarketRuntimeService, playerId) {
        return {
            items: self.getStorage(playerId).items.map((item) => ({
                itemKey: self.buildItemKey(item),
                item: { ...item },
                count: item.count,
            })),
        };
}

export async function summarizeSpiritStoneAssetsByPlayerImpl(self: MarketRuntimeService) {
        const persistedStorageCounts: Map<string, number> = typeof self.marketPersistenceService?.summarizeStorageItemCountsByPlayer === 'function'
            ? await self.marketPersistenceService.summarizeStorageItemCountsByPlayer(MARKET_CURRENCY_ITEM_ID)
            : new Map<string, number>();
        return self.runExclusive(async () => {
            const totalsByPlayerId = new Map<string, number>(persistedStorageCounts);
            for (const playerId of self.loadedStoragePlayerIds) {
                const storageCount = cloneStorage(self.storageByPlayerId.get(playerId)).items.reduce(
                    (total, item) => item?.itemId === MARKET_CURRENCY_ITEM_ID
                        ? total + Math.max(0, Math.trunc(Number(item.count) || 0))
                        : total,
                    0,
                );
                if (storageCount > 0) {
                    totalsByPlayerId.set(playerId, storageCount);
                }
                else {
                    totalsByPlayerId.delete(playerId);
                }
            }
            for (const order of self.openOrders) {
                if (order?.status !== 'open' || order?.side !== 'buy') {
                    continue;
                }
                const ownerId = typeof order.ownerId === 'string' ? order.ownerId.trim() : '';
                const reservedCost = calculateMarketOrderReservedCost(order.remainingQuantity, order.unitPrice) ?? 0;
                if (ownerId && reservedCost > 0) {
                    totalsByPlayerId.set(ownerId, (totalsByPlayerId.get(ownerId) ?? 0) + reservedCost);
                }
            }
            for (const bids of self.auctionBidsByItemKey.values()) {
                for (const bid of Array.isArray(bids) ? bids : []) {
                    const bidderId = typeof bid?.bidderId === 'string' ? bid.bidderId.trim() : '';
                    const reservedCost = Math.max(0, Math.trunc(Number(bid?.reservedCost) || 0));
                    if (bidderId && reservedCost > 0) {
                        totalsByPlayerId.set(bidderId, (totalsByPlayerId.get(bidderId) ?? 0) + reservedCost);
                    }
                }
            }
            return totalsByPlayerId;
        });
}

export async function claimStorageImpl(self: MarketRuntimeService, playerId) {
        await self.ensureStorageHydrated(playerId);
        if (self.durableOperationService?.isEnabled()) {
            return self.runExclusive(async () => {
                return self.runExclusivePlayerAssetMutation([playerId], async () => {
                    const context = self.createMutationContext();
                    try {
                        const storage = self.storageByPlayerId.get(playerId);
                        if (!storage || storage.items.length === 0) {
                            return self.singleMessage(playerId, '坊市托管仓里暂时没有可领取的物品。');
                        }
                        const playerSnapshot = self.playerRuntimeService.snapshot(playerId);
                        if (!playerSnapshot) {
                            return self.singleMessage(playerId, '玩家当前不在运行态，暂时无法领取坊市托管仓物品。', 'warn');
                        }
                        const plan = self.buildClaimStoragePlan(playerSnapshot.inventory, storage.items);
                        if (plan.movedCount <= 0) {
                            return self.singleMessage(playerId, '背包空间不足，托管仓物品暂时无法领取。');
                        }
                        const expectedRuntimeOwnerId = typeof playerSnapshot.runtimeOwnerId === 'string' && playerSnapshot.runtimeOwnerId.trim()
                            ? playerSnapshot.runtimeOwnerId.trim()
                            : '';
                        const expectedSessionEpoch = Number.isFinite(playerSnapshot.sessionEpoch) ? Math.max(0, Math.trunc(Number(playerSnapshot.sessionEpoch))) : 0;
                        if (!expectedRuntimeOwnerId || expectedSessionEpoch <= 0) {
                            throw new Error('market_storage_claim_session_fence_missing');
                        }
                        const instanceLease = await self.resolveInstanceLeaseContext(playerSnapshot.instanceId ?? null);
                        self.captureOnlinePlayerState(playerId, context);
                        const operationId = `market-storage-claim:${playerId}:${Date.now()}:${randomUUID()}`;
                        const result = await self.durableOperationService.claimMarketStorage({
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
                        self.playerRuntimeService.replaceInventoryItems(playerId, plan.nextInventoryItems);
                        self.setStorage(playerId, { items: plan.remainingItems }, context);
                        context.skipPersistence = true;
                        self.evictStorageCacheIfOverLimit();
                        if (plan.remainingItems.length > 0) {
                            return self.singleMessage(playerId, `已领取部分托管物，共 ${plan.movedCount} 件，其余仍保留在坊市托管仓。`, 'loot');
                        }
                        return self.singleMessage(playerId, `已领取坊市托管仓中的全部物品，共 ${plan.movedCount} 件。`, 'loot');
                    }
                    catch (error) {
                        self.restoreMutationContext(context);
                        throw error;
                    }
                });
            }).catch((error) => {
                self.logger.error(`坊市托管仓领取失败，已回滚: ${error instanceof Error ? error.message : String(error)}`);
                return self.singleMessage(playerId, '坊市结算失败，已回滚本次操作。', 'warn');
            });
        }
        return self.runExclusiveMarketMutation(playerId, async (context) => {
            return self.runExclusivePlayerAssetMutation([playerId], async () => {
                const storage = self.storageByPlayerId.get(playerId);
                if (!storage || storage.items.length === 0) {
                    return self.singleMessage(playerId, '坊市托管仓里暂时没有可领取的物品。');
                }
                const playerSnapshot = self.playerRuntimeService.snapshot(playerId);
                if (!playerSnapshot) {
                    return self.singleMessage(playerId, '玩家当前不在运行态，暂时无法领取坊市托管仓物品。', 'warn');
                }
                const plan = self.buildClaimStoragePlan(playerSnapshot.inventory, storage.items);
                if (plan.movedCount <= 0) {
                    return self.singleMessage(playerId, '背包空间不足，托管仓物品暂时无法领取。');
                }
                self.captureOnlinePlayerState(playerId, context);
                for (const item of storage.items) {
                    if (self.playerRuntimeService.canReceiveInventoryItem(playerId, item)) {
                        self.playerRuntimeService.receiveInventoryItem(playerId, item);
                    }
                }
                self.setStorage(playerId, { items: plan.remainingItems }, context);
                if (plan.remainingItems.length > 0) {
                    return self.singleMessage(playerId, `已领取部分托管物，共 ${plan.movedCount} 件，其余仍保留在坊市托管仓。`, 'loot');
                }
                return self.singleMessage(playerId, `已领取坊市托管仓中的全部物品，共 ${plan.movedCount} 件。`, 'loot');
            });
        });
}

export function mergeStorageItemImpl(self: MarketRuntimeService, playerId, item, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const current = self.storageByPlayerId.get(playerId);

        const next = cloneStorage(current);

        const incoming = { ...item };
        assignItemInstanceIdIfNeeded(incoming);
        const signature = canMergeItemStack(incoming) ? createItemStackSignature(incoming) : null;

        const existing = signature
            ? next.items.find((entry) => canMergeItemStack(entry) && createItemStackSignature(entry) === signature)
            : null;
        if (existing) {
            existing.count += incoming.count;
        }
        else {
            next.items.push(incoming);
            next.items.sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
        }
        self.setStorage(playerId, next, context);
}

export function setStorageImpl(self: MarketRuntimeService, playerId, storage, context) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!context.storageSnapshotByPlayerId.has(playerId)) {
            context.storageSnapshotByPlayerId.set(playerId, cloneStorage(self.storageByPlayerId.get(playerId)));
        }

        const normalized = cloneStorage(storage);
        if (normalized.items.length > 0) {
            self.storageByPlayerId.set(playerId, normalized);
        }
        else {
            self.storageByPlayerId.delete(playerId);
        }
        // 经过 mutation 写入的玩家视作已 hydrate，并刷新 LRU 顺序。
        self.touchStorageLru(playerId);
        context.dirtyStoragePlayerIds.add(playerId);
}

export function getStorageImpl(self: MarketRuntimeService, playerId) {
        if (typeof playerId === 'string' && playerId && self.loadedStoragePlayerIds.has(playerId)) {
            self.touchStorageLru(playerId);
        }
        return cloneStorage(self.storageByPlayerId.get(playerId));
}

export function touchStorageLruImpl(self: MarketRuntimeService, playerId) {
        if (typeof playerId !== 'string' || !playerId) {
            return;
        }
        if (self.loadedStoragePlayerIds.has(playerId)) {
            self.loadedStoragePlayerIds.delete(playerId);
        }
        self.loadedStoragePlayerIds.add(playerId);
}

export async function ensureStorageHydratedImpl(self: MarketRuntimeService, playerId) {
        const normalized = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalized) {
            return;
        }
        if (self.loadedStoragePlayerIds.has(normalized)) {
            self.touchStorageLru(normalized);
            return;
        }
        let pending = self.storageHydrationLocks.get(normalized);
        if (!pending) {
            pending = (async () => {
                try {
                    const loaded = typeof self.marketPersistenceService?.loadStorageForPlayer === 'function'
                        ? await self.marketPersistenceService.loadStorageForPlayer(normalized)
                        : { items: [] };
                    if (self.loadedStoragePlayerIds.has(normalized)) {
                        // 期间已经被其他 mutation 写入并 hydrate，直接尊重内存态。
                        return;
                    }
                    if (loaded && Array.isArray(loaded.items) && loaded.items.length > 0) {
                        self.storageByPlayerId.set(normalized, cloneStorage(loaded));
                    }
                    else {
                        self.storageByPlayerId.delete(normalized);
                    }
                    self.loadedStoragePlayerIds.add(normalized);
                }
                catch (error) {
                    self.logger.error(`坊市仓库延迟加载失败 (playerId=${normalized}): ${error instanceof Error ? error.message : String(error)}`);
                    throw error;
                }
                finally {
                    self.storageHydrationLocks.delete(normalized);
                }
            })();
            self.storageHydrationLocks.set(normalized, pending);
        }
        await pending;
        self.touchStorageLru(normalized);
}

export async function ensureStoragesHydratedImpl(self: MarketRuntimeService, playerIds) {
        const unique = new Set();
        if (playerIds && typeof playerIds[Symbol.iterator] === 'function') {
            for (const playerId of playerIds) {
                const normalized = typeof playerId === 'string' ? playerId.trim() : '';
                if (!normalized || self.loadedStoragePlayerIds.has(normalized)) {
                    continue;
                }
                unique.add(normalized);
            }
        }
        if (unique.size === 0) {
            return;
        }
        await Promise.all(Array.from(unique, (playerId) => self.ensureStorageHydrated(playerId)));
}

export function pinStoragePlayerImpl(self: MarketRuntimeService, playerId) {
        if (typeof playerId !== 'string' || !playerId) {
            return;
        }
        const next = (self.pendingStorageMutationPlayerIds.get(playerId) ?? 0) + 1;
        self.pendingStorageMutationPlayerIds.set(playerId, next);
}

export function unpinStoragePlayerImpl(self: MarketRuntimeService, playerId) {
        if (typeof playerId !== 'string' || !playerId) {
            return;
        }
        const current = self.pendingStorageMutationPlayerIds.get(playerId) ?? 0;
        if (current <= 1) {
            self.pendingStorageMutationPlayerIds.delete(playerId);
            return;
        }
        self.pendingStorageMutationPlayerIds.set(playerId, current - 1);
}

export function collectStorageCachePinnedImpl(self: MarketRuntimeService) {
        const pinned = new Set();
        for (const order of self.openOrders) {
            const ownerId = typeof order?.ownerId === 'string' ? order.ownerId : '';
            if (ownerId) {
                pinned.add(ownerId);
            }
        }
        for (const bids of self.auctionBidsByItemKey.values()) {
            if (!Array.isArray(bids)) {
                continue;
            }
            for (const bid of bids) {
                const bidderId = typeof bid?.bidderId === 'string' ? bid.bidderId : '';
                if (bidderId) {
                    pinned.add(bidderId);
                }
            }
        }
        for (const playerId of self.pendingStorageMutationPlayerIds.keys()) {
            pinned.add(playerId);
        }
        if (typeof self.playerRuntimeService?.getPlayer === 'function') {
            for (const playerId of self.loadedStoragePlayerIds) {
                if (self.playerRuntimeService.getPlayer(playerId)) {
                    pinned.add(playerId);
                }
            }
        }
        return pinned;
}

export function evictStorageCacheIfOverLimitImpl(self: MarketRuntimeService) {
        const limit = MARKET_STORAGE_RUNTIME_CACHE_LIMIT;
        if (!Number.isFinite(limit) || limit <= 0) {
            return;
        }
        if (self.loadedStoragePlayerIds.size <= limit) {
            return;
        }
        const pinned = self.collectStorageCachePinned();
        const target = self.loadedStoragePlayerIds.size - limit;
        let removed = 0;
        const ordered = Array.from(self.loadedStoragePlayerIds);
        for (const playerId of ordered) {
            if (removed >= target) {
                break;
            }
            if (pinned.has(playerId) || self.storageHydrationLocks.has(playerId)) {
                continue;
            }
            self.loadedStoragePlayerIds.delete(playerId);
            self.storageByPlayerId.delete(playerId);
            removed += 1;
        }
}

export function buildClaimStoragePlanImpl(self: MarketRuntimeService, inventorySnapshot, storageItems) {
        const nextInventoryItems = Array.isArray(inventorySnapshot?.items)
            ? inventorySnapshot.items.map((entry) => ({ ...entry }))
            : [];
        const capacity = Number.isFinite(inventorySnapshot?.capacity)
            ? Math.max(0, Math.trunc(Number(inventorySnapshot.capacity)))
            : nextInventoryItems.length;
        const remainingItems = [];
        let movedCount = 0;
        for (const item of Array.isArray(storageItems) ? storageItems : []) {
            const normalized = { ...self.contentTemplateRepository.normalizeItem(item) };
            if (!normalized) {
                continue;
            }
            assignItemInstanceIdIfNeeded(normalized);
            const existing = canMergeItemStack(normalized)
                ? nextInventoryItems.find((entry) => canMergeItemStack(entry) && createItemStackSignature(entry) === createItemStackSignature(normalized))
                : null;
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

