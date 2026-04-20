// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewaySessionStateHelper = void 0;

/** 世界 socket 会话侧状态 helper：收敛坊市订阅、请求缓存与断线清理。 */
class WorldGatewaySessionStateHelper {
/**
 * gateway：WorldGatewaySessionStateHelper 内部字段。
 */

    gateway;    
    /**
 * marketSubscriberPlayerIds：WorldGatewaySessionStateHelper 内部字段。
 */

    marketSubscriberPlayerIds = new Set();    
    /**
 * marketListingRequestsByPlayerId：WorldGatewaySessionStateHelper 内部字段。
 */

    marketListingRequestsByPlayerId = new Map();    
    /**
 * marketTradeHistoryRequestsByPlayerId：WorldGatewaySessionStateHelper 内部字段。
 */

    marketTradeHistoryRequestsByPlayerId = new Map();    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(gateway) {
        this.gateway = gateway;
    }    
    /**
 * clearDisconnectedPlayerState：执行核心业务逻辑。
 * @param binding 参数说明。
 * @returns 函数返回值。
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
 * subscribeMarket：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    subscribeMarket(playerId) {
        this.marketSubscriberPlayerIds.add(playerId);
    }    
    /**
 * setMarketListingsRequest：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param request 请求参数。
 * @returns 函数返回值。
 */

    setMarketListingsRequest(playerId, request) {
        this.marketListingRequestsByPlayerId.set(playerId, { ...(request ?? {}) });
    }    
    /**
 * getMarketListingsRequest：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    getMarketListingsRequest(playerId) {
        return this.marketListingRequestsByPlayerId.get(playerId);
    }    
    /**
 * setMarketTradeHistoryRequest：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param page 参数说明。
 * @returns 函数返回值。
 */

    setMarketTradeHistoryRequest(playerId, page) {
        this.marketTradeHistoryRequestsByPlayerId.set(playerId, Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1);
    }    
    /**
 * getMarketSubscribers：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    getMarketSubscribers() {
        return this.marketSubscriberPlayerIds;
    }    
    /**
 * getMarketListingRequests：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    getMarketListingRequests() {
        return this.marketListingRequestsByPlayerId;
    }    
    /**
 * getMarketTradeHistoryRequests：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    getMarketTradeHistoryRequests() {
        return this.marketTradeHistoryRequestsByPlayerId;
    }
}
exports.WorldGatewaySessionStateHelper = WorldGatewaySessionStateHelper;

export { WorldGatewaySessionStateHelper };
