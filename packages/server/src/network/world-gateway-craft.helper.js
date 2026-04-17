"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayCraftHelper = void 0;

const shared_1 = require("@mud/shared-next");

/** 世界 socket 采集/锻造 helper：只收敛 craft 相关入口。 */
class WorldGatewayCraftHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    handleNextRequestAlchemyPanel(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const player = this.gateway.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                return;
            }
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.AlchemyPanel, this.gateway.craftPanelRuntimeService.buildAlchemyPanelPayload(player, payload?.knownCatalogVersion));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_ALCHEMY_PANEL_FAILED', error);
        }
    }
    handleNextRequestEnhancementPanel(client, _payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const player = this.gateway.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                return;
            }
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.EnhancementPanel, this.gateway.craftPanelRuntimeService.buildEnhancementPanelPayload(player));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_ENHANCEMENT_PANEL_FAILED', error);
        }
    }
    handleNextStartAlchemy(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueStartAlchemy(playerId, payload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'START_ALCHEMY_FAILED', error);
        }
    }
    handleNextCancelAlchemy(client, _payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueCancelAlchemy(playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CANCEL_ALCHEMY_FAILED', error);
        }
    }
    handleNextSaveAlchemyPreset(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueSaveAlchemyPreset(playerId, payload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'SAVE_ALCHEMY_PRESET_FAILED', error);
        }
    }
    handleNextDeleteAlchemyPreset(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueDeleteAlchemyPreset(playerId, payload?.presetId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'DELETE_ALCHEMY_PRESET_FAILED', error);
        }
    }
    handleNextStartEnhancement(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueStartEnhancement(playerId, payload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'START_ENHANCEMENT_FAILED', error);
        }
    }
    handleNextCancelEnhancement(client, _payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            this.gateway.worldRuntimeService.enqueueCancelEnhancement(playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CANCEL_ENHANCEMENT_FAILED', error);
        }
    }
}
exports.WorldGatewayCraftHelper = WorldGatewayCraftHelper;
