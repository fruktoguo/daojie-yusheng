"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayNpcHelper = void 0;

const shared_1 = require("@mud/shared-next");

/** 世界 socket NPC/quest/shop helper：只收敛最小 NPC/quest/shop 入口。 */
class WorldGatewayNpcHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    handleNextRequestNpcShop(client, payload) {
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
    handleRequestNpcQuests(client, payload) {
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
    handleAcceptNpcQuest(client, payload) {
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
    handleSubmitNpcQuest(client, payload) {
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
    executeBuyNpcShopItem(client, payload) {
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
    handleNextBuyNpcShopItem(client, payload) {
        this.executeBuyNpcShopItem(client, payload);
    }
}
exports.WorldGatewayNpcHelper = WorldGatewayNpcHelper;
