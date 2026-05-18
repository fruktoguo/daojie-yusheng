/**
 * NPC 商店购买写路径服务
 * 处理玩家购买请求的校验、扣款、物品发放和持久化提交
 */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { canMergeItemStack, createItemStackSignature } from '@mud/shared';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { WorldRuntimeNpcShopQueryService } from './query/world-runtime-npc-shop-query.service';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';
import { DurableOperationService } from '../../persistence/durable-operation.service';
import { buildStructuredNotice } from './structured-notice.helpers';
import { assignItemInstanceIdIfNeeded } from './item-instance-id.helpers';

const { normalizeShopQuantity, formatItemStackLabel } = world_runtime_normalization_helpers_1;

/** NPC 商店写路径服务：承接购买入队与结算。 */
@Injectable()
export class WorldRuntimeNpcShopService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    durableOperationService;
    /**
     * worldRuntimeNpcShopQueryService：世界运行态NPCShopQuery服务引用。
     */
    
    worldRuntimeNpcShopQueryService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param worldRuntimeNpcShopQueryService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        playerRuntimeService: PlayerRuntimeService,
        worldRuntimeNpcShopQueryService: WorldRuntimeNpcShopQueryService,
        @Inject(DurableOperationService) durableOperationService: DurableOperationService | null = null,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeNpcShopQueryService = worldRuntimeNpcShopQueryService;
        this.durableOperationService = durableOperationService;
    }    
    /**
 * enqueueBuyNpcShopItem：处理BuyNPCShop道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param itemIdInput 参数说明。
 * @param quantityInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新BuyNPCShop道具相关状态。
 */

    enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);
        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        const itemId = typeof itemIdInput === 'string' ? itemIdInput.trim() : '';
        if (!npcId) {
            throw new BadRequestException('场景人物 ID 不能为空');
        }
        if (!itemId) {
            throw new BadRequestException('物品 ID 不能为空');
        }
        const quantity = normalizeShopQuantity(quantityInput);
        deps.validateNpcShopPurchase(playerId, npcId, itemId, quantity);
        deps.enqueuePendingCommand(playerId, { kind: 'buyNpcShopItem', npcId, itemId, quantity });
        return deps.getPlayerViewOrThrow(playerId);
    }    
    /**
 * dispatchBuyNpcShopItem：判断BuyNPCShop道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新BuyNPCShop道具相关状态。
 */

    async dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, deps) {
        const validated = deps.validateNpcShopPurchase(playerId, npcId, itemId, quantity);
        const durableOperationService = this.durableOperationService ?? deps?.durableOperationService ?? null;
        const player = typeof deps?.getPlayerOrThrow === 'function'
            ? deps.getPlayerOrThrow(playerId)
            : this.playerRuntimeService.getPlayerOrThrow(playerId);
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (durableOperationService?.isEnabled?.() && runtimeOwnerId && sessionEpoch > 0) {
            const currencyItemId = this.worldRuntimeNpcShopQueryService.getCurrencyItemId();
            const nextInventoryItems = applyNpcShopPurchaseToInventory(player.inventory?.items ?? [], validated.item, currencyItemId, validated.totalCost);
            const nextWalletBalances = applyNpcShopPurchaseToWallet(player.wallet?.balances ?? [], currencyItemId, nextInventoryItems);
            if (nextInventoryItems && nextWalletBalances) {
                const location = typeof deps?.getPlayerLocation === 'function' ? deps.getPlayerLocation(playerId) : null;
                const leaseContext = await resolveInstanceLeaseContext(location?.instanceId ?? null, deps);
                const operationId = `op:${playerId}:npc-shop:${Date.now().toString(36)}`;
                return durableOperationService.purchaseNpcShopItem({
                    operationId,
                    playerId,
                    expectedRuntimeOwnerId: runtimeOwnerId,
                    expectedSessionEpoch: sessionEpoch,
                    expectedInstanceId: location?.instanceId ?? null,
                    expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                    expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                    itemId: validated.item.itemId,
                    quantity,
                    totalCost: validated.totalCost,
                    nextInventoryItems,
                    nextWalletBalances,
                }).then(() => {
                    this.playerRuntimeService.replaceInventoryItems(playerId, nextInventoryItems);
                    deps.refreshQuestStates(playerId);
                    const n = buildStructuredNotice('success', 'notice.shop.purchased', `购买 ${formatItemStackLabel(validated.item)}，消耗 ${this.worldRuntimeNpcShopQueryService.getCurrencyItemName()} x${validated.totalCost}`, { vars: { itemLabel: formatItemStackLabel(validated.item), currency: this.worldRuntimeNpcShopQueryService.getCurrencyItemName(), cost: validated.totalCost }, pills: [{ key: 'itemLabel', style: 'target' }, { key: 'currency', style: 'target' }] });
                    deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
                    return deps.getPlayerViewOrThrow(playerId);
                });
            }
        }
        this.playerRuntimeService.debitWallet(playerId, this.worldRuntimeNpcShopQueryService.getCurrencyItemId(), validated.totalCost);
        this.playerRuntimeService.receiveInventoryItem(playerId, validated.item);
        deps.refreshQuestStates(playerId);
        const n = buildStructuredNotice('success', 'notice.shop.purchased', `购买 ${formatItemStackLabel(validated.item)}，消耗 ${this.worldRuntimeNpcShopQueryService.getCurrencyItemName()} x${validated.totalCost}`, { vars: { itemLabel: formatItemStackLabel(validated.item), currency: this.worldRuntimeNpcShopQueryService.getCurrencyItemName(), cost: validated.totalCost }, pills: [{ key: 'itemLabel', style: 'target' }, { key: 'currency', style: 'target' }] });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
        return deps.getPlayerViewOrThrow(playerId);
    }
};

function applyNpcShopPurchaseToInventory(existingItems, item, currencyItemId, totalCost) {
    const nextItems = Array.isArray(existingItems)
        ? existingItems.map((entry) => ({ ...entry }))
        : [];
    if (!debitInventoryItemCount(nextItems, currencyItemId, totalCost)) {
        return null;
    }
    const incoming = { ...item };
    assignItemInstanceIdIfNeeded(incoming);
    const existing = canMergeItemStack(incoming)
        ? nextItems.find((entry) => canMergeItemStack(entry) && createItemStackSignature(entry) === createItemStackSignature(incoming))
        : null;
    if (existing) {
        existing.count += incoming.count;
        return nextItems;
    }
    nextItems.push(incoming);
    return nextItems;
}

function applyNpcShopPurchaseToWallet(existingBalances, walletType, nextInventoryItems) {
    const normalizedWalletType = typeof walletType === 'string' ? walletType.trim() : '';
    if (!normalizedWalletType || !Array.isArray(nextInventoryItems)) {
        return null;
    }
    const balances = collapseWalletBalances(existingBalances);
    const nextBalance = countInventoryItem(nextInventoryItems, normalizedWalletType);
    const entry = balances.find((row) => row.walletType === normalizedWalletType);
    if (entry) {
        entry.balance = nextBalance;
        entry.frozenBalance = 0;
        entry.version += 1;
    } else {
        balances.push({
            walletType: normalizedWalletType,
            balance: nextBalance,
            frozenBalance: 0,
            version: 1,
        });
    }
    return balances;
}

function debitInventoryItemCount(items, itemId, count) {
    const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
    let remaining = Math.max(0, Math.trunc(Number(count ?? 0)));
    if (!normalizedItemId || remaining <= 0) {
        return false;
    }
    for (let index = 0; index < items.length && remaining > 0; index += 1) {
        const entry = items[index];
        if (entry?.itemId !== normalizedItemId) {
            continue;
        }
        const itemCount = Math.max(0, Math.trunc(Number(entry.count ?? 0)));
        const consumed = Math.min(itemCount, remaining);
        entry.count = itemCount - consumed;
        remaining -= consumed;
    }
    for (let index = items.length - 1; index >= 0; index -= 1) {
        if (items[index]?.itemId === normalizedItemId && Math.max(0, Math.trunc(Number(items[index]?.count ?? 0))) <= 0) {
            items.splice(index, 1);
        }
    }
    return remaining <= 0;
}

function countInventoryItem(items, itemId) {
    const normalizedItemId = typeof itemId === 'string' ? itemId.trim() : '';
    if (!normalizedItemId || !Array.isArray(items)) {
        return 0;
    }
    return items.reduce((total, entry) => total + (entry?.itemId === normalizedItemId ? Math.max(0, Math.trunc(Number(entry.count ?? 0))) : 0), 0);
}

function collapseWalletBalances(existingBalances) {
    const byType = new Map();
    for (const entry of Array.isArray(existingBalances) ? existingBalances : []) {
        const walletType = typeof entry?.walletType === 'string' ? entry.walletType.trim() : '';
        if (!walletType) {
            continue;
        }
        const balance = Math.max(0, Math.trunc(Number(entry?.balance ?? 0)));
        const frozenBalance = Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0)));
        const version = Math.max(0, Math.trunc(Number(entry?.version ?? 0)));
        const existing = byType.get(walletType);
        if (existing) {
            existing.balance += balance;
            existing.frozenBalance += frozenBalance;
            existing.version = Math.max(existing.version, version);
            continue;
        }
        byType.set(walletType, { walletType, balance, frozenBalance, version });
    }
    return Array.from(byType.values());
}

async function resolveInstanceLeaseContext(instanceId, deps) {
    const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
    const instanceCatalogService = deps?.instanceCatalogService ?? null;
    if (!normalizedInstanceId || !instanceCatalogService?.isEnabled?.()) {
        return null;
    }
    const catalog = await instanceCatalogService.loadInstanceCatalog?.(normalizedInstanceId);
    const assignedNodeId = typeof catalog?.assigned_node_id === 'string' && catalog.assigned_node_id.trim()
        ? catalog.assigned_node_id.trim()
        : '';
    const ownershipEpoch = Number.isFinite(Number(catalog?.ownership_epoch))
        ? Math.max(1, Math.trunc(Number(catalog.ownership_epoch)))
        : 0;
    if (!assignedNodeId || ownershipEpoch <= 0) {
        return null;
    }
    return {
        assignedNodeId,
        ownershipEpoch,
    };
}
