
/**
 * 世界网关会话状态 helper。
 * 收敛坊市订阅、请求缓存管理与断线后的会话侧状态清理。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

/** 世界 socket 会话侧状态 helper：收敛坊市订阅、请求缓存与断线清理。 */
@Injectable()
class WorldGatewaySessionStateHelper {
/**
 * marketSubscriberPlayerIds：坊市Subscriber玩家ID相关字段。
 */

    marketSubscriberPlayerIds = new Set();
    /**
 * marketListingRequestsByPlayerId：坊市ListingRequestBy玩家ID标识。
 */

    marketListingRequestsByPlayerId = new Map();
    /**
 * auctionListingRequestsByPlayerId：拍卖行ListingRequestBy玩家ID标识。
 */

    auctionListingRequestsByPlayerId = new Map();
    /**
 * marketTradeHistoryRequestsByPlayerId：坊市TradeHistoryRequestBy玩家ID标识。
 */

    marketTradeHistoryRequestsByPlayerId = new Map();
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    private readonly logger = new Logger(WorldGatewaySessionStateHelper.name);

    constructor(private readonly playerRuntimeService: PlayerRuntimeService) {}
    /**
 * clearDisconnectedPlayerState：判断clearDisconnected玩家状态是否满足条件。
 * @param binding 参数说明。
 * @returns 无返回值，直接更新clearDisconnected玩家状态相关状态。
 */

    async clearDisconnectedPlayerState(binding) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (binding.connected) {
            return;
        }
        this.marketSubscriberPlayerIds.delete(binding.playerId);
        this.marketListingRequestsByPlayerId.delete(binding.playerId);
        this.auctionListingRequestsByPlayerId.delete(binding.playerId);
        this.marketTradeHistoryRequestsByPlayerId.delete(binding.playerId);
        this.playerRuntimeService.detachSession(binding.playerId);
        if (typeof this.playerRuntimeService.beginOfflineGainSession === 'function') {
            await this.playerRuntimeService.beginOfflineGainSession(binding.playerId).catch((error) => {
                this.logger.warn(
                    `记录离线收益基线失败：${binding.playerId} ${error instanceof Error ? error.message : String(error)}`,
                );
            });
        }
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
 * setAuctionListingsRequest：写入拍卖行ListingRequest。
 * @param playerId 玩家 ID。
 * @param request 请求参数。
 * @returns 无返回值，直接更新拍卖行ListingRequest相关状态。
 */

    setAuctionListingsRequest(playerId, request) {
        this.auctionListingRequestsByPlayerId.set(playerId, { ...(request ?? {}) });
    }
    /**
 * getAuctionListingsRequest：读取拍卖行ListingRequest。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成拍卖行ListingRequest的读取/组装。
 */

    getAuctionListingsRequest(playerId) {
        return this.auctionListingRequestsByPlayerId.get(playerId);
    }
    /**
 * setMarketTradeHistoryRequest：写入坊市Trade历史Request。
 * @param playerId 玩家 ID。
 * @param page 参数说明。
 * @returns 无返回值，直接更新坊市TradeHistoryRequest相关状态。
 */

    setMarketTradeHistoryRequest(playerId, request) {
        const source = request?.source === 'auction' ? 'auction' : 'market';
        const scope = source === 'auction' && request?.scope === 'all' ? 'all' : 'mine';
        const page = Number.isFinite(request?.page) ? Math.max(1, Math.trunc(request.page)) : 1;
        this.marketTradeHistoryRequestsByPlayerId.set(playerId, { page, source, scope });
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
 * getAuctionListingRequests：读取拍卖行ListingRequest。
 * @returns 无返回值，完成拍卖行ListingRequest的读取/组装。
 */

    getAuctionListingRequests() {
        return this.auctionListingRequestsByPlayerId;
    }
    /**
 * getMarketTradeHistoryRequests：读取坊市Trade历史Request。
 * @returns 无返回值，完成坊市TradeHistoryRequest的读取/组装。
 */

    getMarketTradeHistoryRequests() {
        return this.marketTradeHistoryRequestsByPlayerId;
    }
}

export { WorldGatewaySessionStateHelper };
