// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeNpcShopService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_npc_shop_query_service_1 = require("./world-runtime-npc-shop-query.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");
const durable_operation_service_1 = require("../../persistence/durable-operation.service");

const { normalizeShopQuantity, formatItemStackLabel } = world_runtime_normalization_helpers_1;

/** NPC 商店写路径服务：承接购买入队与结算。 */
let WorldRuntimeNpcShopService = class WorldRuntimeNpcShopService {
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

    constructor(playerRuntimeService, worldRuntimeNpcShopQueryService, durableOperationService = null) {
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
            throw new common_1.BadRequestException('npcId is required');
        }
        if (!itemId) {
            throw new common_1.BadRequestException('itemId is required');
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
            const nextInventoryItems = applyNpcShopPurchaseToInventory(player.inventory?.items ?? [], validated.item);
            const nextWalletBalances = applyNpcShopPurchaseToWallet(player.wallet?.balances ?? [], this.worldRuntimeNpcShopQueryService.getCurrencyItemId(), validated.totalCost);
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
                    this.playerRuntimeService.debitWallet(playerId, this.worldRuntimeNpcShopQueryService.getCurrencyItemId(), validated.totalCost);
                    deps.refreshQuestStates(playerId);
                    deps.queuePlayerNotice(playerId, `购买 ${formatItemStackLabel(validated.item)}，消耗 ${this.worldRuntimeNpcShopQueryService.getCurrencyItemName()} x${validated.totalCost}`, 'success');
                    return deps.getPlayerViewOrThrow(playerId);
                });
            }
        }
        this.playerRuntimeService.debitWallet(playerId, this.worldRuntimeNpcShopQueryService.getCurrencyItemId(), validated.totalCost);
        this.playerRuntimeService.receiveInventoryItem(playerId, validated.item);
        deps.refreshQuestStates(playerId);
        deps.queuePlayerNotice(playerId, `购买 ${formatItemStackLabel(validated.item)}，消耗 ${this.worldRuntimeNpcShopQueryService.getCurrencyItemName()} x${validated.totalCost}`, 'success');
        return deps.getPlayerViewOrThrow(playerId);
    }
};
exports.WorldRuntimeNpcShopService = WorldRuntimeNpcShopService;
exports.WorldRuntimeNpcShopService = WorldRuntimeNpcShopService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        world_runtime_npc_shop_query_service_1.WorldRuntimeNpcShopQueryService])
], WorldRuntimeNpcShopService);

export { WorldRuntimeNpcShopService };

function applyNpcShopPurchaseToInventory(existingItems, item) {
    const nextItems = Array.isArray(existingItems)
        ? existingItems.map((entry) => ({ ...entry }))
        : [];
    const existing = nextItems.find((entry) => entry.itemId === item.itemId);
    if (existing) {
        existing.count += item.count;
        return nextItems;
    }
    nextItems.push({ ...item });
    return nextItems;
}

function applyNpcShopPurchaseToWallet(existingBalances, walletType, amount) {
    const normalizedWalletType = typeof walletType === 'string' ? walletType.trim() : '';
    const normalizedAmount = Math.max(0, Math.trunc(Number(amount ?? 0)));
    if (!normalizedWalletType || normalizedAmount <= 0) {
        return null;
    }
    const balances = Array.isArray(existingBalances)
        ? existingBalances.map((entry) => ({
            walletType: typeof entry?.walletType === 'string' ? entry.walletType.trim() : '',
            balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
            frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
            version: Math.max(0, Math.trunc(Number(entry?.version ?? 0))),
        })).filter((entry) => entry.walletType)
        : [];
    const entry = balances.find((row) => row.walletType === normalizedWalletType);
    if (!entry || entry.balance < normalizedAmount) {
        return null;
    }
    entry.balance -= normalizedAmount;
    entry.version += 1;
    return balances;
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
