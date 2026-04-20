// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayClientEmitHelper = void 0;

/** 世界 socket 客户端发包 helper：统一 next 单播、市场广播和建议广播的 markProtocol/emit 边界。 */
class WorldGatewayClientEmitHelper {
/**
 * gateway：WorldGatewayClientEmitHelper 内部字段。
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
 * markNext：执行核心业务逻辑。
 * @param client 参数说明。
 * @returns 函数返回值。
 */

    markNext(client) {
        this.gateway.worldClientEventService.markProtocol(client, 'next');
    }    
    /**
 * emitNextQuests：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    emitNextQuests(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitQuests(client, payload);
    }    
    /**
 * emitNextSuggestionUpdate：执行核心业务逻辑。
 * @param client 参数说明。
 * @param suggestions 参数说明。
 * @returns 函数返回值。
 */

    emitNextSuggestionUpdate(client, suggestions) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitSuggestionUpdate(client, suggestions);
    }    
    /**
 * emitNextMailSummary：执行核心业务逻辑。
 * @param client 参数说明。
 * @param summary 参数说明。
 * @returns 函数返回值。
 */

    emitNextMailSummary(client, summary) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMailSummary(client, summary);
    }    
    /**
 * emitNextMailSummaryForPlayer：执行核心业务逻辑。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    async emitNextMailSummaryForPlayer(client, playerId) {
        this.markNext(client);
        await this.gateway.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }    
    /**
 * emitNextMailPage：执行核心业务逻辑。
 * @param client 参数说明。
 * @param page 参数说明。
 * @returns 函数返回值。
 */

    emitNextMailPage(client, page) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMailPage(client, page);
    }    
    /**
 * emitNextMailDetail：执行核心业务逻辑。
 * @param client 参数说明。
 * @param detail 参数说明。
 * @returns 函数返回值。
 */

    emitNextMailDetail(client, detail) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMailDetail(client, detail);
    }    
    /**
 * emitNextMailOperationResult：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    emitNextMailOperationResult(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMailOperationResult(client, payload);
    }    
    /**
 * emitNextMarketUpdate：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    emitNextMarketUpdate(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketUpdate(client, payload);
    }    
    /**
 * emitNextMarketListings：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    emitNextMarketListings(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketListings(client, payload);
    }    
    /**
 * emitNextMarketOrders：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    emitNextMarketOrders(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketOrders(client, payload);
    }    
    /**
 * emitNextMarketStorage：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    emitNextMarketStorage(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketStorage(client, payload);
    }    
    /**
 * emitNextMarketItemBook：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    emitNextMarketItemBook(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketItemBook(client, payload);
    }    
    /**
 * emitNextMarketTradeHistory：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    emitNextMarketTradeHistory(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitMarketTradeHistory(client, payload);
    }    
    /**
 * emitNextNpcShop：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    emitNextNpcShop(client, payload) {
        this.markNext(client);
        this.gateway.worldClientEventService.emitNpcShop(client, payload);
    }    
    /**
 * flushMarketResult：执行核心业务逻辑。
 * @param result 返回结果。
 * @returns 函数返回值。
 */

    flushMarketResult(result) {
        this.gateway.worldClientEventService.flushMarketResult(this.gateway.gatewaySessionStateHelper.getMarketSubscribers(), result, {
            marketListingRequests: this.gateway.gatewaySessionStateHelper.getMarketListingRequests(),
            marketTradeHistoryRequests: this.gateway.gatewaySessionStateHelper.getMarketTradeHistoryRequests(),
        });
    }    
    /**
 * emitMailSummary：执行核心业务逻辑。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    async emitMailSummary(client, playerId) {
        await this.gateway.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }    
    /**
 * broadcastSuggestions：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    broadcastSuggestions() {
        this.gateway.worldClientEventService.broadcastSuggestionUpdate();
    }
}
exports.WorldGatewayClientEmitHelper = WorldGatewayClientEmitHelper;

export { WorldGatewayClientEmitHelper };
