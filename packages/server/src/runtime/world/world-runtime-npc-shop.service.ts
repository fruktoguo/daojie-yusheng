/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * NPC 商店购买写路径服务
 * 处理玩家购买请求的校验、扣款、物品发放和持久化提交
 */
import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { canMergeItemStack, createItemStackSignature } from '@mud/shared';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildWalletBalancesFromInventory } from '../player/wallet-inventory-projection.helpers';
import { WorldRuntimeNpcShopQueryService } from './query/world-runtime-npc-shop-query.service';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';
import { DurableOperationService } from '../../persistence/durable-operation.service';
import {
    PlayerDomainPersistenceService,
    nextPlayerPersistenceVersion,
} from '../../persistence/player-domain-persistence.service';
import { buildStructuredNotice } from './structured-notice.helpers';
import { assignItemInstanceIdIfNeeded } from './item-instance-id.helpers';

const { normalizeShopQuantity, formatItemStackLabel } = world_runtime_normalization_helpers_1;
const NPC_SHOP_INVENTORY_ITEM_COUNT_MAX = 2_147_483_647;

/** NPC 商店写路径服务：承接购买入队与结算。 */
@Injectable()
export class WorldRuntimeNpcShopService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    durableOperationService;
    playerDomainPersistenceService;
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
        @Optional()
        @Inject(PlayerDomainPersistenceService) playerDomainPersistenceService: PlayerDomainPersistenceService | null = null,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeNpcShopQueryService = worldRuntimeNpcShopQueryService;
        this.durableOperationService = durableOperationService;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
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
        return this.runExclusivePlayerAssetMutation(
            playerId,
            () => this.dispatchBuyNpcShopItemLocked(playerId, npcId, itemId, quantity, deps),
        );
    }

    async dispatchBuyNpcShopItemLocked(playerId, npcId, itemId, quantity, deps) {
        const validated = deps.validateNpcShopPurchase(playerId, npcId, itemId, quantity);
        const durableOperationService = this.durableOperationService ?? deps?.durableOperationService ?? null;
        const durableEnabled = durableOperationService?.isEnabled?.() === true;
        if (durableEnabled) {
            await this.syncCurrentPresenceFence(playerId);
        }
        const player = typeof deps?.getPlayerOrThrow === 'function'
            ? deps.getPlayerOrThrow(playerId)
            : this.playerRuntimeService.getPlayerOrThrow(playerId);
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch)
            ? Math.max(0, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        const currencyItemId = this.worldRuntimeNpcShopQueryService.getCurrencyItemId();
        const nextInventoryItems = applyNpcShopPurchaseToInventory(
            player.inventory?.items ?? [],
            player.inventory?.capacity,
            validated.item,
            currencyItemId,
            validated.totalCost,
        );
        const nextWalletBalances = applyNpcShopPurchaseToWallet(player.wallet?.balances ?? [], currencyItemId, nextInventoryItems);
        if (!nextInventoryItems || !nextWalletBalances) {
            throw new BadRequestException('NPC 商店资产事务预演失败，请稍后重试');
        }
        if (durableEnabled) {
            if (!runtimeOwnerId || sessionEpoch <= 0) {
                throw new BadRequestException('玩家资产事务围栏暂不可用，请稍后重试');
            }
            const location = typeof deps?.getPlayerLocation === 'function' ? deps.getPlayerLocation(playerId) : null;
            const leaseContext = await resolveInstanceLeaseContext(location?.instanceId ?? null, deps);
            const operationId = `op:${playerId}:npc-shop:${Date.now().toString(36)}`;
            const runPurchase = async () => durableOperationService.purchaseNpcShopItem({
                operationId,
                playerId,
                expectedRuntimeOwnerId: this.getCurrentRuntimeOwnerId(playerId, deps) ?? runtimeOwnerId,
                expectedSessionEpoch: this.getCurrentSessionEpoch(playerId, deps) ?? sessionEpoch,
                expectedInstanceId: location?.instanceId ?? null,
                expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                itemId: validated.item.itemId,
                quantity,
                totalCost: validated.totalCost,
                nextInventoryItems,
                nextWalletBalances,
            });
            try {
                await runPurchase();
            }
            catch (error) {
                if (!shouldRetryNpcShopFence(error) || !(await this.syncCurrentPresenceFence(playerId))) {
                    throw error;
                }
                await runPurchase();
            }
            this.playerRuntimeService.replaceInventoryItems(playerId, nextInventoryItems);
            deps.refreshQuestStates(playerId);
            const n = buildStructuredNotice('success', 'notice.shop.purchased', `购买 ${formatItemStackLabel(validated.item)}，消耗 ${this.worldRuntimeNpcShopQueryService.getCurrencyItemName()} x${validated.totalCost}`, { vars: { itemLabel: formatItemStackLabel(validated.item), currency: this.worldRuntimeNpcShopQueryService.getCurrencyItemName(), cost: validated.totalCost }, pills: [{ key: 'itemLabel', style: 'target' }, { key: 'currency', style: 'target' }] });
            deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
            return deps.getPlayerViewOrThrow(playerId);
        }
        this.playerRuntimeService.replaceInventoryItems(playerId, nextInventoryItems);
        deps.refreshQuestStates(playerId);
        const n = buildStructuredNotice('success', 'notice.shop.purchased', `购买 ${formatItemStackLabel(validated.item)}，消耗 ${this.worldRuntimeNpcShopQueryService.getCurrencyItemName()} x${validated.totalCost}`, { vars: { itemLabel: formatItemStackLabel(validated.item), currency: this.worldRuntimeNpcShopQueryService.getCurrencyItemName(), cost: validated.totalCost }, pills: [{ key: 'itemLabel', style: 'target' }, { key: 'currency', style: 'target' }] });
        deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
        return deps.getPlayerViewOrThrow(playerId);
    }

    /** NPC 商店结算从校验到运行态应用始终占用同一玩家资产串行区。 */
    async runExclusivePlayerAssetMutation(playerId, action) {
        const coordinator = this.playerRuntimeService?.runExclusiveAssetMutation;
        if (typeof coordinator !== 'function') {
            return await action();
        }
        return coordinator.call(this.playerRuntimeService, [playerId], action);
    }

    async syncCurrentPresenceFence(playerId) {
        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return false;
        }
        const persistedPresence = typeof this.playerDomainPersistenceService?.loadPlayerPresence === 'function'
            ? await this.playerDomainPersistenceService.loadPlayerPresence(playerId)
            : null;
        let presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
        if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
            return false;
        }
        const persistedSessionEpoch = Number.isFinite(persistedPresence?.sessionEpoch)
            ? Math.max(0, Math.trunc(Number(persistedPresence.sessionEpoch)))
            : 0;
        const persistedRuntimeOwnerId = typeof persistedPresence?.runtimeOwnerId === 'string'
            ? persistedPresence.runtimeOwnerId.trim()
            : '';
        const runtimeSessionEpoch = Math.max(0, Math.trunc(Number(presence.sessionEpoch ?? 0)));
        const runtimeOwnerId = typeof presence.runtimeOwnerId === 'string' ? presence.runtimeOwnerId.trim() : '';
        if (
            typeof this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast === 'function'
            && persistedSessionEpoch > 0
            && (
                runtimeSessionEpoch <= persistedSessionEpoch
                || (persistedRuntimeOwnerId && persistedRuntimeOwnerId !== runtimeOwnerId)
            )
        ) {
            this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast(playerId, persistedSessionEpoch);
            presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
        }
        if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
            return false;
        }
        await this.playerDomainPersistenceService.savePlayerPresence(playerId, {
            ...presence,
            versionSeed: nextPlayerPersistenceVersion(),
        });
        return true;
    }

    getCurrentRuntimeOwnerId(playerId, deps) {
        const player = typeof deps?.getPlayerOrThrow === 'function'
            ? deps.getPlayerOrThrow(playerId)
            : this.playerRuntimeService.getPlayerOrThrow(playerId);
        return typeof player?.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : null;
    }

    getCurrentSessionEpoch(playerId, deps) {
        const player = typeof deps?.getPlayerOrThrow === 'function'
            ? deps.getPlayerOrThrow(playerId)
            : this.playerRuntimeService.getPlayerOrThrow(playerId);
        return Number.isFinite(player?.sessionEpoch)
            ? Math.max(0, Math.trunc(Number(player.sessionEpoch)))
            : null;
    }
};

function applyNpcShopPurchaseToInventory(existingItems, capacity, item, currencyItemId, totalCost) {
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
        const nextCount = Math.max(0, Math.trunc(Number(existing.count ?? 0)))
            + Math.max(0, Math.trunc(Number(incoming.count ?? 0)));
        if (nextCount > NPC_SHOP_INVENTORY_ITEM_COUNT_MAX) {
            throw new BadRequestException(`${incoming.itemId} 数量超过上限，无法购买`);
        }
        existing.count = nextCount;
        return nextItems;
    }
    const incomingCount = Math.max(0, Math.trunc(Number(incoming.count ?? 0)));
    if (incomingCount <= 0 || incomingCount > NPC_SHOP_INVENTORY_ITEM_COUNT_MAX) {
        throw new BadRequestException(`${incoming.itemId} 数量超过上限，无法购买`);
    }
    const normalizedCapacity = Number.isFinite(Number(capacity))
        ? Math.max(0, Math.trunc(Number(capacity)))
        : Number.MAX_SAFE_INTEGER;
    if (nextItems.length >= normalizedCapacity) {
        return null;
    }
    nextItems.push(incoming);
    return nextItems;
}

function applyNpcShopPurchaseToWallet(existingBalances, walletType, nextInventoryItems) {
    const normalizedWalletType = typeof walletType === 'string' ? walletType.trim() : '';
    if (!normalizedWalletType || !Array.isArray(nextInventoryItems)) {
        return null;
    }
    return buildWalletBalancesFromInventory(
        existingBalances,
        nextInventoryItems,
        [normalizedWalletType],
    );
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

function shouldRetryNpcShopFence(error) {
    const message = String(error instanceof Error ? error.message : error);
    return message.startsWith('player_session_fencing_conflict');
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
