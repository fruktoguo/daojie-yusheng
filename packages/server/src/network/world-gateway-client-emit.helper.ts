// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayClientEmitHelper = void 0;

/** 世界 socket 客户端发包 helper：统一 next 单播、市场广播和建议广播的 markProtocol/emit 边界。 */
class WorldGatewayClientEmitHelper {
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
 * markNext：处理Next并更新相关状态。
 * @param client 参数说明。
 * @returns 无返回值，直接更新Next相关状态。
 */

    markProtocolClient(client) {
        this.gateway.worldClientEventService.markProtocol(client, 'mainline');
    }    
    /**
 * emitNextQuests：处理Next任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Next任务相关状态。
 */

    emitQuests(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitQuests(client, payload);
    }    
    /**
 * emitNextSuggestionUpdate：处理NextSuggestionUpdate并更新相关状态。
 * @param client 参数说明。
 * @param suggestions 参数说明。
 * @returns 无返回值，直接更新NextSuggestionUpdate相关状态。
 */

    emitSuggestionUpdate(client, suggestions) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitSuggestionUpdate(client, suggestions);
    }    
    /**
 * emitNextMailSummary：处理Next邮件摘要并更新相关状态。
 * @param client 参数说明。
 * @param summary 参数说明。
 * @returns 无返回值，直接更新Next邮件摘要相关状态。
 */

    emitProtocolMailSummary(client, summary) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMailSummary(client, summary);
    }    
    /**
 * emitNextMailSummaryForPlayer：处理Next邮件摘要For玩家并更新相关状态。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新Next邮件摘要For玩家相关状态。
 */

    async emitMailSummaryForPlayer(client, playerId) {
        this.markProtocolClient(client);
        await this.gateway.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }    
    /**
 * emitNextMailPage：处理Next邮件Page并更新相关状态。
 * @param client 参数说明。
 * @param page 参数说明。
 * @returns 无返回值，直接更新Next邮件Page相关状态。
 */

    emitMailPage(client, page) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMailPage(client, page);
    }    
    /**
 * emitNextMailDetail：处理Next邮件详情并更新相关状态。
 * @param client 参数说明。
 * @param detail 参数说明。
 * @returns 无返回值，直接更新Next邮件详情相关状态。
 */

    emitMailDetail(client, detail) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMailDetail(client, detail);
    }    
    /**
 * emitNextMailOperationResult：处理Next邮件Operation结果并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Next邮件Operation结果相关状态。
 */

    emitMailOperationResult(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMailOperationResult(client, payload);
    }    
    /**
 * emitNextMarketUpdate：处理Next坊市Update并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Next坊市Update相关状态。
 */

    emitMarketUpdate(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketUpdate(client, payload);
    }    
    /**
 * emitNextMarketListings：读取Next坊市Listing并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Next坊市Listing相关状态。
 */

    emitMarketListings(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketListings(client, payload);
    }    
    /**
 * emitNextMarketOrders：处理Next坊市订单并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Next坊市订单相关状态。
 */

    emitMarketOrders(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketOrders(client, payload);
    }    
    /**
 * emitNextMarketStorage：处理Next坊市Storage并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Next坊市Storage相关状态。
 */

    emitMarketStorage(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketStorage(client, payload);
    }    
    /**
 * emitNextMarketItemBook：处理Next坊市道具Book并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Next坊市道具Book相关状态。
 */

    emitMarketItemBook(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketItemBook(client, payload);
    }    
    /**
 * emitNextMarketTradeHistory：判断Next坊市Trade历史是否满足条件。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Next坊市TradeHistory相关状态。
 */

    emitMarketTradeHistory(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketTradeHistory(client, payload);
    }    
    /**
 * emitNextNpcShop：处理NextNPCShop并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextNPCShop相关状态。
 */

    emitNpcShop(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitNpcShop(client, payload);
    }    
    /**
 * flushMarketResult：处理刷新坊市结果并更新相关状态。
 * @param result 返回结果。
 * @returns 无返回值，直接更新flush坊市结果相关状态。
 */

    flushMarketResult(result) {
        this.gateway.worldClientEventService.flushMarketResult(this.gateway.gatewaySessionStateHelper.getMarketSubscribers(), result, {
            marketListingRequests: this.gateway.gatewaySessionStateHelper.getMarketListingRequests(),
            marketTradeHistoryRequests: this.gateway.gatewaySessionStateHelper.getMarketTradeHistoryRequests(),
        });
    }    
    /**
 * emitMailSummary：处理邮件摘要并更新相关状态。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新邮件摘要相关状态。
 */

    async emitMailSummary(client, playerId) {
        await this.gateway.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }    
    /**
 * broadcastSuggestions：执行broadcastSuggestion相关逻辑。
 * @returns 无返回值，直接更新broadcastSuggestion相关状态。
 */

    broadcastSuggestions() {
        this.gateway.worldClientEventService.broadcastSuggestionUpdate();
    }
}
exports.WorldGatewayClientEmitHelper = WorldGatewayClientEmitHelper;

export { WorldGatewayClientEmitHelper };
