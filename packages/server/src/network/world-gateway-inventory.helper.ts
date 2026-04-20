// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayInventoryHelper = void 0;

/** 世界 socket 背包/装备 helper：只收敛 inventory/equipment 相关入口。 */
class WorldGatewayInventoryHelper {
/**
 * gateway：gateway相关字段。
 */

    gateway;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(gateway) {
        this.gateway = gateway;
    }    
    /**
 * handleNextDestroyItem：处理NextDestroy道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextDestroy道具相关状态。
 */

    handleNextDestroyItem(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleNextSortInventory：处理NextSort背包并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextSort背包相关状态。
 */

    handleNextSortInventory(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * executeUseItem：执行executeUse道具相关逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeUse道具相关状态。
 */

    executeUseItem(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleNextUseItem：处理NextUse道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUse道具相关状态。
 */

    handleNextUseItem(client, payload) {
        this.executeUseItem(client, payload);
    }    
    /**
 * executeDropItem：执行executeDrop道具相关逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeDrop道具相关状态。
 */

    executeDropItem(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleNextDropItem：处理NextDrop道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextDrop道具相关状态。
 */

    handleNextDropItem(client, payload) {
        this.executeDropItem(client, payload);
    }    
    /**
 * handleTakeGround：处理Take地面并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

    handleTakeGround(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * executeEquip：执行executeEquip相关逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeEquip相关状态。
 */

    executeEquip(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleNextEquip：处理NextEquip并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextEquip相关状态。
 */

    handleNextEquip(client, payload) {
        this.executeEquip(client, payload);
    }    
    /**
 * executeUnequip：执行executeUnequip相关逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeUnequip相关状态。
 */

    executeUnequip(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleNextUnequip：处理NextUnequip并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextUnequip相关状态。
 */

    handleNextUnequip(client, payload) {
        this.executeUnequip(client, payload);
    }
}
exports.WorldGatewayInventoryHelper = WorldGatewayInventoryHelper;

export { WorldGatewayInventoryHelper };
