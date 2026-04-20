// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayMarketHelper = void 0;

/** 世界 socket 坊市 helper：只收敛 market 相关入口。 */
class WorldGatewayMarketHelper {
/**
 * gateway：WorldGatewayMarketHelper 内部字段。
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
 * handleNextRequestMarket：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 函数返回值。
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
 * handleNextRequestMarketListings：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextRequestMarketItemBook：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextRequestMarketItemBook(client, payload) {
        this.executeRequestMarketItemBook(client, payload);
    }    
    /**
 * executeRequestMarketItemBook：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextRequestMarketTradeHistory：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextRequestMarketTradeHistory(client, payload) {
        this.executeRequestMarketTradeHistory(client, payload);
    }    
    /**
 * executeRequestMarketTradeHistory：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * executeCreateMarketSellOrder：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextCreateMarketSellOrder：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    async handleNextCreateMarketSellOrder(client, payload) {
        await this.executeCreateMarketSellOrder(client, payload);
    }    
    /**
 * executeCreateMarketBuyOrder：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextCreateMarketBuyOrder：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    async handleNextCreateMarketBuyOrder(client, payload) {
        await this.executeCreateMarketBuyOrder(client, payload);
    }    
    /**
 * executeBuyMarketItem：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextBuyMarketItem：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    async handleNextBuyMarketItem(client, payload) {
        await this.executeBuyMarketItem(client, payload);
    }    
    /**
 * executeSellMarketItem：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextSellMarketItem：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    async handleNextSellMarketItem(client, payload) {
        await this.executeSellMarketItem(client, payload);
    }    
    /**
 * executeCancelMarketOrder：执行核心业务逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
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
 * handleNextCancelMarketOrder：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    async handleNextCancelMarketOrder(client, payload) {
        await this.executeCancelMarketOrder(client, payload);
    }    
    /**
 * executeClaimMarketStorage：执行核心业务逻辑。
 * @param client 参数说明。
 * @returns 函数返回值。
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
 * handleNextClaimMarketStorage：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 函数返回值。
 */

    async handleNextClaimMarketStorage(client, _payload) {
        await this.executeClaimMarketStorage(client);
    }
}
exports.WorldGatewayMarketHelper = WorldGatewayMarketHelper;

export { WorldGatewayMarketHelper };
