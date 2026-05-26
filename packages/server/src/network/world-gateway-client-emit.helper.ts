/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */

/**
 * 世界网关客户端发包 helper。
 * 统一主线单播、市场广播和活动状态的 markProtocol/emit 边界。
 */

import { Injectable } from '@nestjs/common';
import { WorldClientEventService } from './world-client-event.service';

interface MarketFlushRequestSnapshot {
    marketListingRequests: Map<string, unknown>;
    auctionListingRequests: Map<string, unknown>;
    marketTradeHistoryRequests: Map<string, unknown>;
}

/** 世界 socket 客户端发包 helper：统一主线单播、市场广播和活动状态的 markProtocol/emit 边界。 */
@Injectable()
class WorldGatewayClientEmitHelper {
    constructor(private readonly worldClientEventService: WorldClientEventService) {}
    /**
 * markMainline：处理主线协议标记并更新相关状态。
 * @param client 参数说明。
 * @returns 无返回值，直接更新主线协议相关状态。
 */

    markProtocolClient(client) {
        this.worldClientEventService.markProtocol(client, 'mainline');
    }
    /**
 * emitMainlineQuests：处理主线任务并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线任务相关状态。
 */

    emitQuests(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitQuests(client, toQuestSyncPayload(payload));
    }
    emitActivityStatus(client, status) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitActivityStatus(client, status);
    }

    emitActivityOperationResult(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitActivityOperationResult(client, payload);
    }
    /**
 * emitMainlineMailSummary：处理主线邮件摘要并更新相关状态。
 * @param client 参数说明。
 * @param summary 参数说明。
 * @returns 无返回值，直接更新主线邮件摘要相关状态。
 */

    emitProtocolMailSummary(client, summary) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitMailSummary(client, summary);
    }
    /**
 * emitMainlineMailSummaryForPlayer：处理主线邮件摘要并更新相关状态。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新主线邮件摘要相关状态。
 */

    async emitMailSummaryForPlayer(client, playerId) {
        this.markProtocolClient(client);
        await this.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
    /**
 * emitMainlineMailPage：处理主线邮件分页并更新相关状态。
 * @param client 参数说明。
 * @param page 参数说明。
 * @returns 无返回值，直接更新主线邮件分页相关状态。
 */

    emitMailPage(client, page) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitMailPage(client, page);
    }
    /**
 * emitMainlineMailDetail：处理主线邮件详情并更新相关状态。
 * @param client 参数说明。
 * @param detail 参数说明。
 * @returns 无返回值，直接更新主线邮件详情相关状态。
 */

    emitMailDetail(client, detail) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitMailDetail(client, detail);
    }
    /**
 * emitMainlineMailOperationResult：处理主线邮件操作结果并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线邮件操作结果相关状态。
 */

    emitMailOperationResult(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitMailOperationResult(client, payload);
    }
    /**
 * emitMainlineMarketUpdate：处理主线坊市更新并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市更新相关状态。
 */

    emitMarketUpdate(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitMarketUpdate(client, payload);
    }
    /**
 * emitMainlineMarketListings：读取主线坊市列表并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市列表相关状态。
 */

    emitMarketListings(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitMarketListings(client, payload);
    }
    /**
 * emitMainlineAuctionListings：读取主线拍卖行列表并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线拍卖行列表相关状态。
 */

    emitAuctionListings(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitAuctionListings(client, payload);
    }
    /**
 * emitMainlineMarketOrders：处理主线坊市订单并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市订单相关状态。
 */

    emitMarketOrders(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitMarketOrders(client, payload);
    }
    /**
 * emitMainlineMarketStorage：处理主线坊市仓储并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市仓储相关状态。
 */

    emitMarketStorage(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitMarketStorage(client, payload);
    }
    /**
 * emitMainlineMarketItemBook：处理主线坊市道具图鉴并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市道具图鉴相关状态。
 */

    emitMarketItemBook(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitMarketItemBook(client, payload);
    }
    /**
 * emitMainlineMarketTradeHistory：处理主线坊市成交历史并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线坊市成交历史相关状态。
 */

    emitMarketTradeHistory(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitMarketTradeHistory(client, payload);
    }
    /**
 * emitMainlineNpcShop：处理主线 NPC 商店并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新主线 NPC 商店相关状态。
 */

    emitNpcShop(client, payload) {
        this.markProtocolClient(client);
        this.worldClientEventService.emitNpcShop(client, payload);
    }
    /**
 * flushMarketResult：处理刷新坊市结果并更新相关状态。
 * @param result 返回结果。
 * @returns 无返回值，直接更新flush坊市结果相关状态。
 */

    async flushMarketResult(
        result,
        subscribers,
        requests: MarketFlushRequestSnapshot,
    ) {
        await this.worldClientEventService.flushMarketResult(subscribers, result, requests);
    }
    /**
 * emitMailSummary：处理邮件摘要并更新相关状态。
 * @param client 参数说明。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新邮件摘要相关状态。
 */

    async emitMailSummary(client, playerId) {
        await this.worldClientEventService.emitMailSummaryForPlayer(client, playerId);
    }
}

function toQuestSyncPayload(payload) {
    return {
        ...payload,
        quests: Array.isArray(payload?.quests)
            ? payload.quests.map((entry) => toQuestRuntimeState(entry))
            : [],
    };
}

function toQuestRuntimeState(source) {
    return {
        id: source.id,
        status: source.status,
        progress: Math.max(0, Math.trunc(Number(source.progress ?? 0))),
    };
}

export { WorldGatewayClientEmitHelper };
