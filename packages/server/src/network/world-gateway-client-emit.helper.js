"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayClientEmitHelper = void 0;

/** 世界 socket 客户端发包 helper：统一 next 单播、市场广播和建议广播的 markProtocol/emit 边界。 */
class WorldGatewayClientEmitHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    markNext(client) {
        this.gateway.worldClientEventService.markProtocol(client, 'next');
    }
    emitNextQuests(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitQuests(client, payload);
    }
    emitNextSuggestionUpdate(client, suggestions) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitSuggestionUpdate(client, suggestions);
    }
    emitNextMailSummary(client, summary) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMailSummary(client, summary);
    }
    async emitNextMailSummaryForPlayer(client, playerId) {
        this.markNext(client);
        await this.gateway.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
    emitNextMailPage(client, page) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMailPage(client, page);
    }
    emitNextMailDetail(client, detail) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMailDetail(client, detail);
    }
    emitNextMailOperationResult(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMailOperationResult(client, payload);
    }
    emitNextMarketUpdate(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketUpdate(client, payload);
    }
    emitNextMarketListings(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketListings(client, payload);
    }
    emitNextMarketOrders(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketOrders(client, payload);
    }
    emitNextMarketStorage(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketStorage(client, payload);
    }
    emitNextMarketItemBook(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketItemBook(client, payload);
    }
    emitNextMarketTradeHistory(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketTradeHistory(client, payload);
    }
    emitNextNpcShop(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitNpcShop(client, payload);
    }
    flushMarketResult(result) {
        this.gateway.worldClientEventService.flushMarketResult(this.gateway.gatewaySessionStateHelper.getMarketSubscribers(), result, {
            marketListingRequests: this.gateway.gatewaySessionStateHelper.getMarketListingRequests(),
            marketTradeHistoryRequests: this.gateway.gatewaySessionStateHelper.getMarketTradeHistoryRequests(),
        });
    }
    async emitMailSummary(client, playerId) {
        await this.gateway.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
    broadcastSuggestions() {
        this.gateway.worldClientEventService.broadcastSuggestionUpdate();
    }
}
exports.WorldGatewayClientEmitHelper = WorldGatewayClientEmitHelper;
