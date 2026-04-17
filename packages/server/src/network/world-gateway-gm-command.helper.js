"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayGmCommandHelper = void 0;

/** 世界 socket GM 命令 helper：收敛维护命令。 */
class WorldGatewayGmCommandHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    handleGmGetState(client, _payload) {
        const playerId = this.gateway.requireGm(client);
        if (!playerId) {
            return;
        }
        this.gateway.worldGmSocketService.emitState(client);
    }
    handleGmSpawnBots(client, payload) {
        const playerId = this.gateway.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldGmSocketService.enqueueSpawnBots(playerId, payload?.count);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'GM_SPAWN_BOTS_FAILED', error);
        }
    }
    handleGmRemoveBots(client, payload) {
        const playerId = this.gateway.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldGmSocketService.enqueueRemoveBots(playerId, payload?.playerIds, payload?.all);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'GM_REMOVE_BOTS_FAILED', error);
        }
    }
    handleGmUpdatePlayer(client, payload) {
        const requesterPlayerId = this.gateway.requireGm(client);
        if (!requesterPlayerId) {
            return;
        }
        try {
            this.gateway.worldGmSocketService.enqueueUpdatePlayer(requesterPlayerId, payload);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'GM_UPDATE_PLAYER_FAILED', error);
        }
    }
    handleGmResetPlayer(client, payload) {
        const requesterPlayerId = this.gateway.requireGm(client);
        if (!requesterPlayerId) {
            return;
        }
        try {
            this.gateway.worldGmSocketService.enqueueResetPlayer(requesterPlayerId, payload?.playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'GM_RESET_PLAYER_FAILED', error);
        }
    }
}
exports.WorldGatewayGmCommandHelper = WorldGatewayGmCommandHelper;
