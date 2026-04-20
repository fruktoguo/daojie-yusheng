// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayNpcHelper = void 0;

const shared_1 = require("@mud/shared-next");

/** 世界 socket NPC/quest/shop helper：只收敛最小 NPC/quest/shop 入口。 */
class WorldGatewayNpcHelper {
/**
 * gateway：WorldGatewayNpcHelper 内部字段。
 */

    gateway;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(gateway) {
        this.gateway = gateway;
    }    
    /**
 * handleNextRequestNpcShop：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextRequestNpcShop(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.gatewayClientEmitHelper.emitNextNpcShop(client, this.gateway.worldRuntimeService.buildNpcShopView(playerId, payload?.npcId));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'NPC_SHOP_REQUEST_FAILED', error);
        }
    }    
    /**
 * handleRequestNpcQuests：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleRequestNpcQuests(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.NpcQuests, this.gateway.worldRuntimeService.buildNpcQuestsView(playerId, payload?.npcId));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_REQUEST_FAILED', error);
        }
    }    
    /**
 * handleAcceptNpcQuest：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleAcceptNpcQuest(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueAcceptNpcQuest(playerId, payload?.npcId, payload?.questId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_ACCEPT_FAILED', error);
        }
    }    
    /**
 * handleSubmitNpcQuest：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleSubmitNpcQuest(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueSubmitNpcQuest(playerId, payload?.npcId, payload?.questId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'NPC_QUEST_SUBMIT_FAILED', error);
        }
    }    
    /**
 * executeBuyNpcShopItem：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    executeBuyNpcShopItem(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueBuyNpcShopItem(playerId, payload?.npcId, payload?.itemId, payload?.quantity);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'NPC_SHOP_BUY_FAILED', error);
        }
    }    
    /**
 * handleNextBuyNpcShopItem：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextBuyNpcShopItem(client, payload) {
        this.executeBuyNpcShopItem(client, payload);
    }
}
exports.WorldGatewayNpcHelper = WorldGatewayNpcHelper;

export { WorldGatewayNpcHelper };
