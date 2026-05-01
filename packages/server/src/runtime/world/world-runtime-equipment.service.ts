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
exports.WorldRuntimeEquipmentService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const durable_operation_service_1 = require("../../persistence/durable-operation.service");

/** world-runtime equipment orchestration：承接装备穿戴/卸下结算。 */
let WorldRuntimeEquipmentService = class WorldRuntimeEquipmentService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    durableOperationService;
    /**
     * 构造器：初始化 当前 实例并建立基础状态。
     * @param playerRuntimeService 参数说明。
     * @returns 无返回值，完成实例初始化。
     */

    constructor(playerRuntimeService, durableOperationService = null) {
        this.playerRuntimeService = playerRuntimeService;
        this.durableOperationService = durableOperationService;
    }    
    /**
 * dispatchEquipItem：判断Equip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Equip道具相关状态。
 */

    async dispatchEquipItem(playerId, slotIndex, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const item = this.playerRuntimeService.peekInventoryItem(playerId, slotIndex);
        if (!item) {
            throw new common_1.NotFoundException(`背包槽位不存在：${slotIndex}`);
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const lockReason = item.equipSlot
            ? deps.craftPanelRuntimeService.getLockedSlotReason(player, item.equipSlot)
            : null;
        if (lockReason) {
            throw new common_1.BadRequestException(lockReason);
        }
        const durableOperationService = this.durableOperationService ?? deps?.durableOperationService ?? null;
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (durableOperationService?.isEnabled?.() && runtimeOwnerId && sessionEpoch > 0) {
            const mutation = buildEquipMutation(this.playerRuntimeService.snapshot(playerId), slotIndex);
            if (mutation) {
                const location = deps.getPlayerLocation?.(playerId);
                const leaseContext = await resolveInstanceLeaseContext(location?.instanceId ?? null, deps);
                const operationId = `op:${playerId}:equipment:${Date.now().toString(36)}`;
                return durableOperationService.updateEquipmentLoadout({
                    operationId,
                    playerId,
                    expectedRuntimeOwnerId: runtimeOwnerId,
                    expectedSessionEpoch: sessionEpoch,
                    expectedInstanceId: location?.instanceId ?? null,
                    expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                    expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                    action: 'equip',
                    slot: mutation.slot,
                    nextInventoryItems: mutation.nextInventoryItems,
                    nextEquipmentSlots: mutation.nextEquipmentSlots,
                }).then(() => {
                    this.playerRuntimeService.replaceInventoryItems(playerId, mutation.nextInventoryItems);
                    this.playerRuntimeService.replaceEquipmentSlots(playerId, mutation.nextEquipmentSlots);
                    deps.queuePlayerNotice(playerId, `装备 ${item.name}`, 'success');
                    deps.worldRuntimeCraftMutationService.emitAllTechniqueActivityPanelUpdates(playerId, deps);
                    return deps.getPlayerViewOrThrow(playerId);
                });
            }
        }
        this.playerRuntimeService.equipItem(playerId, slotIndex);
        deps.queuePlayerNotice(playerId, `装备 ${item.name}`, 'success');
        deps.worldRuntimeCraftMutationService.emitAllTechniqueActivityPanelUpdates(playerId, deps);
    }    
    /**
 * dispatchUnequipItem：判断Unequip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Unequip道具相关状态。
 */

    async dispatchUnequipItem(playerId, slot, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const item = this.playerRuntimeService.peekEquippedItem(playerId, slot);
        if (!item) {
            throw new common_1.NotFoundException(`装备槽位为空：${slot}`);
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const lockReason = deps.craftPanelRuntimeService.getLockedSlotReason(player, slot);
        if (lockReason) {
            throw new common_1.BadRequestException(lockReason);
        }
        const durableOperationService = this.durableOperationService ?? deps?.durableOperationService ?? null;
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (durableOperationService?.isEnabled?.() && runtimeOwnerId && sessionEpoch > 0) {
            const mutation = buildUnequipMutation(this.playerRuntimeService.snapshot(playerId), slot);
            if (mutation) {
                const location = deps.getPlayerLocation?.(playerId);
                const leaseContext = await resolveInstanceLeaseContext(location?.instanceId ?? null, deps);
                const operationId = `op:${playerId}:equipment:${Date.now().toString(36)}`;
                return durableOperationService.updateEquipmentLoadout({
                    operationId,
                    playerId,
                    expectedRuntimeOwnerId: runtimeOwnerId,
                    expectedSessionEpoch: sessionEpoch,
                    expectedInstanceId: location?.instanceId ?? null,
                    expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                    expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                    action: 'unequip',
                    slot: mutation.slot,
                    nextInventoryItems: mutation.nextInventoryItems,
                    nextEquipmentSlots: mutation.nextEquipmentSlots,
                }).then(() => {
                    this.playerRuntimeService.replaceInventoryItems(playerId, mutation.nextInventoryItems);
                    this.playerRuntimeService.replaceEquipmentSlots(playerId, mutation.nextEquipmentSlots);
                    deps.queuePlayerNotice(playerId, `卸下 ${item.name}`, 'info');
                    deps.worldRuntimeCraftMutationService.emitAllTechniqueActivityPanelUpdates(playerId, deps);
                    return deps.getPlayerViewOrThrow(playerId);
                });
            }
        }
        this.playerRuntimeService.unequipItem(playerId, slot);
        deps.queuePlayerNotice(playerId, `卸下 ${item.name}`, 'info');
        deps.worldRuntimeCraftMutationService.emitAllTechniqueActivityPanelUpdates(playerId, deps);
    }
};
exports.WorldRuntimeEquipmentService = WorldRuntimeEquipmentService;
exports.WorldRuntimeEquipmentService = WorldRuntimeEquipmentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        durable_operation_service_1.DurableOperationService])
], WorldRuntimeEquipmentService);

export { WorldRuntimeEquipmentService };

function buildEquipMutation(snapshot, slotIndex) {
    if (!snapshot || !snapshot.inventory || !snapshot.equipment) {
        return null;
    }
    const inventoryItems = Array.isArray(snapshot.inventory.items) ? snapshot.inventory.items.map((entry) => ({ ...entry })) : [];
    const equipmentSlots = Array.isArray(snapshot.equipment.slots) ? snapshot.equipment.slots.map((entry) => ({
        slot: entry.slot,
        item: entry.item ? { ...entry.item } : null,
    })) : [];
    const item = inventoryItems[slotIndex];
    if (!item || !item.equipSlot) {
        return null;
    }
    const equipmentEntry = equipmentSlots.find((entry) => entry.slot === item.equipSlot);
    if (!equipmentEntry) {
        return null;
    }
    const equippedItem = takeSingleInventoryItemForEquipment(inventoryItems, slotIndex);
    if (!equippedItem) {
        return null;
    }
    const previousEquipped = equipmentEntry.item ? { ...equipmentEntry.item } : null;
    equipmentEntry.item = { ...equippedItem };
    if (previousEquipped) {
        inventoryItems.push(previousEquipped);
    }
    return {
        slot: equipmentEntry.slot,
        nextInventoryItems: inventoryItems.map((entry) => ({ ...entry })),
        nextEquipmentSlots: equipmentSlots.map((entry) => ({
            slot: entry.slot,
            item: entry.item ? { ...entry.item } : null,
        })),
    };
}

function buildUnequipMutation(snapshot, slot) {
    if (!snapshot || !snapshot.inventory || !snapshot.equipment) {
        return null;
    }
    const inventoryItems = Array.isArray(snapshot.inventory.items) ? snapshot.inventory.items.map((entry) => ({ ...entry })) : [];
    const equipmentSlots = Array.isArray(snapshot.equipment.slots) ? snapshot.equipment.slots.map((entry) => ({
        slot: entry.slot,
        item: entry.item ? { ...entry.item } : null,
    })) : [];
    const equipmentEntry = equipmentSlots.find((entry) => entry.slot === slot);
    if (!equipmentEntry || !equipmentEntry.item) {
        return null;
    }
    inventoryItems.push({ ...equipmentEntry.item });
    equipmentEntry.item = null;
    return {
        slot: equipmentEntry.slot,
        nextInventoryItems: inventoryItems.map((entry) => ({ ...entry })),
        nextEquipmentSlots: equipmentSlots.map((entry) => ({
            slot: entry.slot,
            item: entry.item ? { ...entry.item } : null,
        })),
    };
}

function takeSingleInventoryItemForEquipment(items, slotIndex) {
    const item = items[slotIndex];
    if (!item) {
        return null;
    }
    const itemCount = Math.max(1, Math.trunc(Number(item.count ?? 1)));
    if (itemCount <= 1) {
        const [removed] = items.splice(slotIndex, 1);
        return {
            ...removed,
            count: 1,
        };
    }
    item.count = itemCount - 1;
    return {
        ...item,
        count: 1,
    };
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
