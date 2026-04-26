// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayInventoryHelper = void 0;
const shared_1 = require("@mud/shared");

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
 * handleDestroyItem：处理销毁道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新销毁道具相关状态。
 */

    handleDestroyItem(client, payload) {
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
 * handleSortInventory：处理整理背包并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新整理背包相关状态。
 */

    handleSortInventory(client, _payload) {
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
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueUseItem(playerId, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'USE_ITEM_FAILED', error);
        }
    }    
    /**
 * handleUseItem：处理使用道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新使用道具相关状态。
 */

    handleUseItem(client, payload) {
        this.executeUseItem(client, payload);
    }    
    handleCreateFormation(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCreateFormation(playerId, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CREATE_FORMATION_FAILED', error);
        }
    }
    handleSetFormationActive(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSetFormationActive(playerId, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'SET_FORMATION_ACTIVE_FAILED', error);
        }
    }
    handleRefillFormation(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueRefillFormation(playerId, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REFILL_FORMATION_FAILED', error);
        }
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
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueDropItem(playerId, payload?.slotIndex, payload?.count, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'DROP_ITEM_FAILED', error);
        }
    }    
    /**
 * handleDropItem：处理丢弃道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新丢弃道具相关状态。
 */

    handleDropItem(client, payload) {
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
                this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueTakeGroundAll(playerId, payload?.sourceId, this.gateway.worldRuntimeService);
                return;
            }
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueTakeGround(playerId, payload?.sourceId, payload?.itemKey, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'TAKE_GROUND_FAILED', error);
        }
    }    
    /**
 * handleStartGather：处理开始草药采集并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新开始草药采集相关状态。
 */

    handleStartGather(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'mainline');
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueStartTechniqueActivity(playerId, 'gather', payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'START_GATHER_FAILED', error);
        }
    }    
    /**
 * handleCancelGather：处理取消草药采集并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新取消草药采集相关状态。
 */

    handleCancelGather(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'mainline');
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCancelTechniqueActivity(playerId, 'gather', this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CANCEL_GATHER_FAILED', error);
        }
    }    
    /**
 * handleStopLootHarvest：处理停止连续采摘并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新停止连续采摘相关状态。
 */

    handleStopLootHarvest(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.playerRuntimeService.clearLootWindow(playerId);
            client.emit(shared_1.S2C.LootWindowUpdate, { window: null });
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'STOP_LOOT_HARVEST_FAILED', error);
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
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueEquip(playerId, payload?.slotIndex, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'EQUIP_FAILED', error);
        }
    }    
    /**
 * handleEquip：处理装备并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新装备相关状态。
 */

    handleEquip(client, payload) {
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
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueUnequip(playerId, payload?.slot, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'UNEQUIP_FAILED', error);
        }
    }    
    /**
 * handleUnequip：处理卸下装备并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新卸下装备相关状态。
 */

    handleUnequip(client, payload) {
        this.executeUnequip(client, payload);
    }
}
exports.WorldGatewayInventoryHelper = WorldGatewayInventoryHelper;

export { WorldGatewayInventoryHelper };
