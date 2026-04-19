"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewaySessionStateHelper = void 0;

/** 世界 socket 会话侧状态 helper：收敛坊市订阅、请求缓存与断线清理。 */
class WorldGatewaySessionStateHelper {
    gateway;
    marketSubscriberPlayerIds = new Set();
    marketListingRequestsByPlayerId = new Map();
    marketTradeHistoryRequestsByPlayerId = new Map();
    constructor(gateway) {
        this.gateway = gateway;
    }
    clearDisconnectedPlayerState(binding) {
        if (binding.connected) {
            return;
        }
        this.marketSubscriberPlayerIds.delete(binding.playerId);
        this.marketListingRequestsByPlayerId.delete(binding.playerId);
        this.marketTradeHistoryRequestsByPlayerId.delete(binding.playerId);
        this.gateway.playerRuntimeService.detachSession(binding.playerId);
    }
    subscribeMarket(playerId) {
        this.marketSubscriberPlayerIds.add(playerId);
    }
    setMarketListingsRequest(playerId, request) {
        this.marketListingRequestsByPlayerId.set(playerId, { ...(request ?? {}) });
    }
    getMarketListingsRequest(playerId) {
        return this.marketListingRequestsByPlayerId.get(playerId);
    }
    setMarketTradeHistoryRequest(playerId, page) {
        this.marketTradeHistoryRequestsByPlayerId.set(playerId, Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1);
    }
    getMarketSubscribers() {
        return this.marketSubscriberPlayerIds;
    }
    getMarketListingRequests() {
        return this.marketListingRequestsByPlayerId;
    }
    getMarketTradeHistoryRequests() {
        return this.marketTradeHistoryRequestsByPlayerId;
    }
}
exports.WorldGatewaySessionStateHelper = WorldGatewaySessionStateHelper;
