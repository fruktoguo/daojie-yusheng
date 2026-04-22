// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayClientEmitHelper = void 0;

/** 世界 socket 客户端发包 helper：统一主线单播、市场广播和建议广播的 markProtocol/emit 边界。 */
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
 * markMainline：处理主线协议标记并更新相关状态。
 * @param client 参数说明。
 * @returns 无返回值，直接更新主线协议相关状态。
 */

    markProtocolClient(client) {
        this.gateway.worldClientEventService.markProtocol(client, 'mainline');
    }    
    /**
 * emitMainlineQuests：处理主线任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线任务相关状态。
 */

    emitQuests(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitQuests(client, payload);
    }    
    /**
 * emitMainlineSuggestionUpdate：处理主线 SuggestionUpdate 并更新相关状态。
 * @param client 参数说明。
 * @param suggestions 参数说明。
 * @returns 无返回值，直接更新主线 SuggestionUpdate 相关状态。
 */

    emitSuggestionUpdate(client, suggestions) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitSuggestionUpdate(client, suggestions);
    }    
    /**
 * emitMainlineMailSummary：处理主线邮件摘要并更新相关状态。
 * @param client 参数说明。
 * @param summary 参数说明。
 * @returns 无返回值，直接更新主线邮件摘要相关状态。
 */

    emitProtocolMailSummary(client, summary) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMailSummary(client, summary);
    }    
    /**
 * emitMainlineMailSummaryForPlayer：处理主线邮件摘要并更新相关状态。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新主线邮件摘要相关状态。
 */

    async emitMailSummaryForPlayer(client, playerId) {
        this.markProtocolClient(client);
        await this.gateway.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }    
    /**
 * emitMainlineMailPage：处理主线邮件分页并更新相关状态。
 * @param client 参数说明。
 * @param page 参数说明。
 * @returns 无返回值，直接更新主线邮件分页相关状态。
 */

    emitMailPage(client, page) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMailPage(client, page);
    }    
    /**
 * emitMainlineMailDetail：处理主线邮件详情并更新相关状态。
 * @param client 参数说明。
 * @param detail 参数说明。
 * @returns 无返回值，直接更新主线邮件详情相关状态。
 */

    emitMailDetail(client, detail) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMailDetail(client, detail);
    }    
    /**
 * emitMainlineMailOperationResult：处理主线邮件操作结果并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线邮件操作结果相关状态。
 */

    emitMailOperationResult(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMailOperationResult(client, payload);
    }    
    /**
 * emitMainlineMarketUpdate：处理主线坊市更新并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市更新相关状态。
 */

    emitMarketUpdate(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketUpdate(client, payload);
    }    
    /**
 * emitMainlineMarketListings：读取主线坊市列表并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市列表相关状态。
 */

    emitMarketListings(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketListings(client, payload);
    }    
    /**
 * emitMainlineMarketOrders：处理主线坊市订单并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市订单相关状态。
 */

    emitMarketOrders(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketOrders(client, payload);
    }    
    /**
 * emitMainlineMarketStorage：处理主线坊市仓储并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市仓储相关状态。
 */

    emitMarketStorage(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketStorage(client, payload);
    }    
    /**
 * emitMainlineMarketItemBook：处理主线坊市道具图鉴并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市道具图鉴相关状态。
 */

    emitMarketItemBook(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketItemBook(client, payload);
    }    
    /**
 * emitMainlineMarketTradeHistory：处理主线坊市成交历史并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市成交历史相关状态。
 */

    emitMarketTradeHistory(client, payload) {
        this.markProtocolClient(client);
        this.gateway.worldClientEventService.emitMarketTradeHistory(client, payload);
    }    
    /**
 * emitMainlineNpcShop：处理主线 NPC 商店并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线 NPC 商店相关状态。
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
