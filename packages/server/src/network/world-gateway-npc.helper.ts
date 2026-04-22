// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayNpcHelper = void 0;

const shared_1 = require("@mud/shared");

/** 世界 socket NPC/quest/shop helper：只收敛最小 NPC/quest/shop 入口。 */
class WorldGatewayNpcHelper {
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
 * handleRequestNpcShop：处理NextRequestNPCShop并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequestNPCShop相关状态。
 */

    handleRequestNpcShop(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.gatewayClientEmitHelper.emitNpcShop(client, this.gateway.worldRuntimeService.buildNpcShopView(playerId, payload?.npcId));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'NPC_SHOP_REQUEST_FAILED', error);
        }
    }    
    /**
 * handleRequestNpcQuests：处理RequestNPC任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新RequestNPC任务相关状态。
 */

    handleRequestNpcQuests(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.S2C.NpcQuests, this.gateway.worldRuntimeService.buildNpcQuestsView(playerId, payload?.npcId));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_REQUEST_FAILED', error);
        }
    }    
    /**
 * handleAcceptNpcQuest：处理AcceptNPC任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新AcceptNPC任务相关状态。
 */

    handleAcceptNpcQuest(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueAcceptNpcQuest(playerId, payload?.npcId, payload?.questId, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_ACCEPT_FAILED', error);
        }
    }    
    /**
 * handleSubmitNpcQuest：处理SubmitNPC任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

    handleSubmitNpcQuest(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSubmitNpcQuest(playerId, payload?.npcId, payload?.questId, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_SUBMIT_FAILED', error);
        }
    }    
    /**
 * executeBuyNpcShopItem：执行executeBuyNPCShop道具相关逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeBuyNPCShop道具相关状态。
 */

    executeBuyNpcShopItem(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueBuyNpcShopItem(playerId, payload?.npcId, payload?.itemId, payload?.quantity, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'NPC_SHOP_BUY_FAILED', error);
        }
    }    
    /**
 * handleBuyNpcShopItem：处理NextBuyNPCShop道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextBuyNPCShop道具相关状态。
 */

    handleBuyNpcShopItem(client, payload) {
        this.executeBuyNpcShopItem(client, payload);
    }
}
exports.WorldGatewayNpcHelper = WorldGatewayNpcHelper;

export { WorldGatewayNpcHelper };
