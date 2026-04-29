// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewaySessionStateHelper = void 0;

/** 世界 socket 会话侧状态 helper：收敛坊市订阅、请求缓存与断线清理。 */
class WorldGatewaySessionStateHelper {
/**
 * gateway：gateway相关字段。
 */

    gateway;    
    /**
 * marketSubscriberPlayerIds：坊市Subscriber玩家ID相关字段。
 */

    marketSubscriberPlayerIds = new Set();    
    /**
 * marketListingRequestsByPlayerId：坊市ListingRequestBy玩家ID标识。
 */

    marketListingRequestsByPlayerId = new Map();    
    /**
 * marketTradeHistoryRequestsByPlayerId：坊市TradeHistoryRequestBy玩家ID标识。
 */

    marketTradeHistoryRequestsByPlayerId = new Map();    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(gateway) {
        this.gateway = gateway;
    }    
    /**
 * clearDisconnectedPlayerState：判断clearDisconnected玩家状态是否满足条件。
 * @param binding 参数说明。
 * @returns 无返回值，直接更新clearDisconnected玩家状态相关状态。
 */

    clearDisconnectedPlayerState(binding) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (binding.connected) {
            return;
        }
        this.marketSubscriberPlayerIds.delete(binding.playerId);
        this.marketListingRequestsByPlayerId.delete(binding.playerId);
        this.marketTradeHistoryRequestsByPlayerId.delete(binding.playerId);
        this.gateway.playerRuntimeService.detachSession(binding.playerId);
    }    
    /**
 * subscribeMarket：处理subscribe坊市并更新相关状态。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新subscribe坊市相关状态。
 */

    subscribeMarket(playerId) {
        this.marketSubscriberPlayerIds.add(playerId);
    }    
    /**
 * setMarketListingsRequest：写入坊市ListingRequest。
 * @param playerId 玩家 ID。
 * @param request 请求参数。
 * @returns 无返回值，直接更新坊市ListingRequest相关状态。
 */

    setMarketListingsRequest(playerId, request) {
        this.marketListingRequestsByPlayerId.set(playerId, { ...(request ?? {}) });
    }    
    /**
 * getMarketListingsRequest：读取坊市ListingRequest。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成坊市ListingRequest的读取/组装。
 */

    getMarketListingsRequest(playerId) {
        return this.marketListingRequestsByPlayerId.get(playerId);
    }    
    /**
 * setMarketTradeHistoryRequest：写入坊市Trade历史Request。
 * @param playerId 玩家 ID。
 * @param page 参数说明。
 * @returns 无返回值，直接更新坊市TradeHistoryRequest相关状态。
 */

    setMarketTradeHistoryRequest(playerId, page) {
        this.marketTradeHistoryRequestsByPlayerId.set(playerId, Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1);
    }    
    /**
 * getMarketSubscribers：读取坊市Subscriber。
 * @returns 无返回值，完成坊市Subscriber的读取/组装。
 */

    getMarketSubscribers() {
        return this.marketSubscriberPlayerIds;
    }    
    /**
 * getMarketListingRequests：读取坊市ListingRequest。
 * @returns 无返回值，完成坊市ListingRequest的读取/组装。
 */

    getMarketListingRequests() {
        return this.marketListingRequestsByPlayerId;
    }    
    /**
 * getMarketTradeHistoryRequests：读取坊市Trade历史Request。
 * @returns 无返回值，完成坊市TradeHistoryRequest的读取/组装。
 */

    getMarketTradeHistoryRequests() {
        return this.marketTradeHistoryRequestsByPlayerId;
    }
}
exports.WorldGatewaySessionStateHelper = WorldGatewaySessionStateHelper;

export { WorldGatewaySessionStateHelper };
