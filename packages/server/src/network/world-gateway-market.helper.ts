// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayMarketHelper = void 0;

/** 世界 socket 坊市 helper：只收敛 market 相关入口。 */
class WorldGatewayMarketHelper {
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
 * handleNextRequestMarket：处理NextRequest坊市并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequest坊市相关状态。
 */

    handleNextRequestMarket(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.gatewaySessionStateHelper.subscribeMarket(playerId);
            this.gateway.gatewaySessionStateHelper.setMarketListingsRequest(playerId, { page: 1 });
            const response = this.gateway.marketRuntimeService.buildMarketUpdate(playerId);
            this.gateway.gatewayClientEmitHelper.emitNextMarketUpdate(client, response);
            this.gateway.gatewayClientEmitHelper.emitNextMarketListings(client, this.gateway.marketRuntimeService.buildMarketListingsPage(this.gateway.gatewaySessionStateHelper.getMarketListingsRequest(playerId)));
            this.gateway.gatewayClientEmitHelper.emitNextMarketOrders(client, this.gateway.marketRuntimeService.buildMarketOrders(playerId));
            this.gateway.gatewayClientEmitHelper.emitNextMarketStorage(client, this.gateway.marketRuntimeService.buildMarketStorage(playerId));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_FAILED', error);
        }
    }    
    /**
 * handleNextRequestMarketListings：读取NextRequest坊市Listing并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest坊市Listing相关状态。
 */

    handleNextRequestMarketListings(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.gatewaySessionStateHelper.subscribeMarket(playerId);
            this.gateway.gatewaySessionStateHelper.setMarketListingsRequest(playerId, payload ?? {});
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldClientEventService.emitMarketListings(client, this.gateway.marketRuntimeService.buildMarketListingsPage(payload));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_LISTINGS_FAILED', error);
        }
    }    
    /**
 * handleNextRequestMarketItemBook：处理NextRequest坊市道具Book并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest坊市道具Book相关状态。
 */

    handleNextRequestMarketItemBook(client, payload) {
        this.executeRequestMarketItemBook(client, payload);
    }    
    /**
 * executeRequestMarketItemBook：处理executeRequest坊市道具Book并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeRequest坊市道具Book相关状态。
 */

    executeRequestMarketItemBook(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = this.gateway.marketRuntimeService.buildItemBook(payload?.itemKey ?? '');
            this.gateway.gatewayClientEmitHelper.emitNextMarketItemBook(client, response);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_ITEM_BOOK_FAILED', error);
        }
    }    
    /**
 * handleNextRequestMarketTradeHistory：判断NextRequest坊市Trade历史是否满足条件。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequest坊市TradeHistory相关状态。
 */

    handleNextRequestMarketTradeHistory(client, payload) {
        this.executeRequestMarketTradeHistory(client, payload);
    }    
    /**
 * executeRequestMarketTradeHistory：判断executeRequest坊市Trade历史是否满足条件。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeRequest坊市TradeHistory相关状态。
 */

    executeRequestMarketTradeHistory(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.gatewaySessionStateHelper.setMarketTradeHistoryRequest(playerId, payload?.page);
            const response = this.gateway.marketRuntimeService.buildTradeHistoryPage(playerId, payload?.page);
            this.gateway.gatewayClientEmitHelper.emitNextMarketTradeHistory(client, response);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_TRADE_HISTORY_FAILED', error);
        }
    }    
    /**
 * executeCreateMarketSellOrder：构建executeCreate坊市Sell订单。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeCreate坊市Sell订单相关状态。
 */

    async executeCreateMarketSellOrder(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.createSellOrder(playerId, {
                slotIndex: payload?.slotIndex,
                quantity: payload?.quantity,
                unitPrice: payload?.unitPrice,
            });
            this.gateway.gatewayClientEmitHelper.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CREATE_MARKET_SELL_ORDER_FAILED', error);
        }
    }    
    /**
 * handleNextCreateMarketSellOrder：构建NextCreate坊市Sell订单。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextCreate坊市Sell订单相关状态。
 */

    async handleNextCreateMarketSellOrder(client, payload) {
        await this.executeCreateMarketSellOrder(client, payload);
    }    
    /**
 * executeCreateMarketBuyOrder：构建executeCreate坊市Buy订单。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeCreate坊市Buy订单相关状态。
 */

    async executeCreateMarketBuyOrder(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.createBuyOrder(playerId, {
                itemKey: payload?.itemKey ?? '',
                itemId: payload?.itemId ?? '',
                quantity: payload?.quantity,
                unitPrice: payload?.unitPrice,
            });
            this.gateway.gatewayClientEmitHelper.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CREATE_MARKET_BUY_ORDER_FAILED', error);
        }
    }    
    /**
 * handleNextCreateMarketBuyOrder：构建NextCreate坊市Buy订单。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextCreate坊市Buy订单相关状态。
 */

    async handleNextCreateMarketBuyOrder(client, payload) {
        await this.executeCreateMarketBuyOrder(client, payload);
    }    
    /**
 * executeBuyMarketItem：处理executeBuy坊市道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeBuy坊市道具相关状态。
 */

    async executeBuyMarketItem(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.buyNow(playerId, {
                itemKey: payload?.itemKey ?? '',
                quantity: payload?.quantity,
            });
            this.gateway.gatewayClientEmitHelper.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'BUY_MARKET_ITEM_FAILED', error);
        }
    }    
    /**
 * handleNextBuyMarketItem：处理NextBuy坊市道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextBuy坊市道具相关状态。
 */

    async handleNextBuyMarketItem(client, payload) {
        await this.executeBuyMarketItem(client, payload);
    }    
    /**
 * executeSellMarketItem：处理executeSell坊市道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeSell坊市道具相关状态。
 */

    async executeSellMarketItem(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.sellNow(playerId, {
                slotIndex: payload?.slotIndex,
                quantity: payload?.quantity,
            });
            this.gateway.gatewayClientEmitHelper.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'SELL_MARKET_ITEM_FAILED', error);
        }
    }    
    /**
 * handleNextSellMarketItem：处理NextSell坊市道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextSell坊市道具相关状态。
 */

    async handleNextSellMarketItem(client, payload) {
        await this.executeSellMarketItem(client, payload);
    }    
    /**
 * executeCancelMarketOrder：判断executeCancel坊市订单是否满足条件。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeCancel坊市订单相关状态。
 */

    async executeCancelMarketOrder(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.cancelOrder(playerId, {
                orderId: payload?.orderId ?? '',
            });
            this.gateway.gatewayClientEmitHelper.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CANCEL_MARKET_ORDER_FAILED', error);
        }
    }    
    /**
 * handleNextCancelMarketOrder：判断NextCancel坊市订单是否满足条件。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextCancel坊市订单相关状态。
 */

    async handleNextCancelMarketOrder(client, payload) {
        await this.executeCancelMarketOrder(client, payload);
    }    
    /**
 * executeClaimMarketStorage：处理executeClaim坊市Storage并更新相关状态。
 * @param client 参数说明。
 * @returns 无返回值，直接更新executeClaim坊市Storage相关状态。
 */

    async executeClaimMarketStorage(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.claimStorage(playerId);
            this.gateway.gatewayClientEmitHelper.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CLAIM_MARKET_STORAGE_FAILED', error);
        }
    }    
    /**
 * handleNextClaimMarketStorage：处理NextClaim坊市Storage并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextClaim坊市Storage相关状态。
 */

    async handleNextClaimMarketStorage(client, _payload) {
        await this.executeClaimMarketStorage(client);
    }
}
exports.WorldGatewayMarketHelper = WorldGatewayMarketHelper;

export { WorldGatewayMarketHelper };
