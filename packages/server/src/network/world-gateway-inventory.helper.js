"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayInventoryHelper = void 0;

/** 世界 socket 背包/装备 helper：只收敛 inventory/equipment 相关入口。 */
class WorldGatewayInventoryHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    handleNextDestroyItem(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const destroyed = this.gateway.playerRuntimeService.destroyInventoryItem(playerId, payload?.slotIndex, payload?.count);
            this.gateway.playerRuntimeService.enqueueNotice(playerId, {
                text: `你摧毁了 ${destroyed.name ?? destroyed.itemId} x${destroyed.count}。`,
                kind: 'info',
            });
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'DESTROY_ITEM_FAILED', error);
        }
    }
    handleNextSortInventory(client, _payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.playerRuntimeService.sortInventory(playerId);
            this.gateway.playerRuntimeService.enqueueNotice(playerId, {
                text: '背包已整理',
                kind: 'info',
            });
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'SORT_INVENTORY_FAILED', error);
        }
    }
    executeUseItem(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueUseItem(playerId, payload?.slotIndex);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'USE_ITEM_FAILED', error);
        }
    }
    handleNextUseItem(client, payload) {
        this.executeUseItem(client, payload);
    }
    executeDropItem(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueDropItem(playerId, payload?.slotIndex, payload?.count);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'DROP_ITEM_FAILED', error);
        }
    }
    handleNextDropItem(client, payload) {
        this.executeDropItem(client, payload);
    }
    handleTakeGround(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            if (payload?.takeAll) {
                this.gateway.worldRuntimeService.enqueueTakeGroundAll(playerId, payload?.sourceId);
                return;
            }
            this.gateway.worldRuntimeService.enqueueTakeGround(playerId, payload?.sourceId, payload?.itemKey);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'TAKE_GROUND_FAILED', error);
        }
    }
    executeEquip(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueEquip(playerId, payload?.slotIndex);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'EQUIP_FAILED', error);
        }
    }
    handleNextEquip(client, payload) {
        this.executeEquip(client, payload);
    }
    executeUnequip(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueUnequip(playerId, payload?.slot);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'UNEQUIP_FAILED', error);
        }
    }
    handleNextUnequip(client, payload) {
        this.executeUnequip(client, payload);
    }
}
exports.WorldGatewayInventoryHelper = WorldGatewayInventoryHelper;
