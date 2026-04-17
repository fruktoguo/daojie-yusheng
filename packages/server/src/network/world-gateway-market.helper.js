"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayMarketHelper = void 0;

/** 世界 socket 坊市 helper：只收敛 market 相关入口。 */
class WorldGatewayMarketHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    handleNextRequestMarket(client, _payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.marketSubscriberPlayerIds.add(playerId);
            this.gateway.marketListingRequestsByPlayerId.set(playerId, { page: 1 });
            const response = this.gateway.marketRuntimeService.buildMarketUpdate(playerId);
            this.gateway.emitNextMarketUpdate(client, response);
            this.gateway.emitNextMarketListings(client, this.gateway.marketRuntimeService.buildMarketListingsPage(this.gateway.marketListingRequestsByPlayerId.get(playerId)));
            this.gateway.emitNextMarketOrders(client, this.gateway.marketRuntimeService.buildMarketOrders(playerId));
            this.gateway.emitNextMarketStorage(client, this.gateway.marketRuntimeService.buildMarketStorage(playerId));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_FAILED', error);
        }
    }
    handleNextRequestMarketListings(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.marketSubscriberPlayerIds.add(playerId);
            this.gateway.marketListingRequestsByPlayerId.set(playerId, { ...(payload ?? {}) });
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldClientEventService.emitMarketListings(client, this.gateway.marketRuntimeService.buildMarketListingsPage(payload));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_LISTINGS_FAILED', error);
        }
    }
    handleNextRequestMarketItemBook(client, payload) {
        this.executeRequestMarketItemBook(client, payload);
    }
    executeRequestMarketItemBook(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const response = this.gateway.marketRuntimeService.buildItemBook(payload?.itemKey ?? '');
            this.gateway.emitNextMarketItemBook(client, response);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_ITEM_BOOK_FAILED', error);
        }
    }
    handleNextRequestMarketTradeHistory(client, payload) {
        this.executeRequestMarketTradeHistory(client, payload);
    }
    executeRequestMarketTradeHistory(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.marketTradeHistoryRequestsByPlayerId.set(playerId, Number.isFinite(payload?.page) ? Math.max(1, Math.trunc(payload.page)) : 1);
            const response = this.gateway.marketRuntimeService.buildTradeHistoryPage(playerId, payload?.page);
            this.gateway.emitNextMarketTradeHistory(client, response);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_MARKET_TRADE_HISTORY_FAILED', error);
        }
    }
    async executeCreateMarketSellOrder(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.createSellOrder(playerId, {
                slotIndex: payload?.slotIndex,
                quantity: payload?.quantity,
                unitPrice: payload?.unitPrice,
            });
            this.gateway.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CREATE_MARKET_SELL_ORDER_FAILED', error);
        }
    }
    async handleNextCreateMarketSellOrder(client, payload) {
        await this.executeCreateMarketSellOrder(client, payload);
    }
    async executeCreateMarketBuyOrder(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
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
            this.gateway.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CREATE_MARKET_BUY_ORDER_FAILED', error);
        }
    }
    async handleNextCreateMarketBuyOrder(client, payload) {
        await this.executeCreateMarketBuyOrder(client, payload);
    }
    async executeBuyMarketItem(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.buyNow(playerId, {
                itemKey: payload?.itemKey ?? '',
                quantity: payload?.quantity,
            });
            this.gateway.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'BUY_MARKET_ITEM_FAILED', error);
        }
    }
    async handleNextBuyMarketItem(client, payload) {
        await this.executeBuyMarketItem(client, payload);
    }
    async executeSellMarketItem(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.sellNow(playerId, {
                slotIndex: payload?.slotIndex,
                quantity: payload?.quantity,
            });
            this.gateway.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'SELL_MARKET_ITEM_FAILED', error);
        }
    }
    async handleNextSellMarketItem(client, payload) {
        await this.executeSellMarketItem(client, payload);
    }
    async executeCancelMarketOrder(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.cancelOrder(playerId, {
                orderId: payload?.orderId ?? '',
            });
            this.gateway.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CANCEL_MARKET_ORDER_FAILED', error);
        }
    }
    async handleNextCancelMarketOrder(client, payload) {
        await this.executeCancelMarketOrder(client, payload);
    }
    async executeClaimMarketStorage(client) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const result = await this.gateway.marketRuntimeService.claimStorage(playerId);
            this.gateway.flushMarketResult(result);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CLAIM_MARKET_STORAGE_FAILED', error);
        }
    }
    async handleNextClaimMarketStorage(client, _payload) {
        await this.executeClaimMarketStorage(client);
    }
}
exports.WorldGatewayMarketHelper = WorldGatewayMarketHelper;
