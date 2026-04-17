"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayActionHelper = void 0;

/** 世界 socket 小型 action helper：收敛 redeem / portal / cultivate / cast skill 入口。 */
class WorldGatewayActionHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    handleNextRedeemCodes(client, payload) {
        this.executeRedeemCodes(client, payload);
    }
    executeRedeemCodes(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueRedeemCodes(playerId, payload?.codes ?? []);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REDEEM_CODES_FAILED', error);
        }
    }
    handleUsePortal(client) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.usePortal(playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'PORTAL_FAILED', error);
        }
    }
    executeCultivate(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueCultivate(playerId, payload?.techId ?? null);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CULTIVATE_FAILED', error);
        }
    }
    handleNextCultivate(client, payload) {
        this.executeCultivate(client, payload);
    }
    handleCastSkill(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.enqueueCastSkill(playerId, payload?.skillId, payload?.targetPlayerId ?? null, payload?.targetMonsterId ?? null, payload?.targetRef ?? null);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CAST_SKILL_FAILED', error);
        }
    }
}
exports.WorldGatewayActionHelper = WorldGatewayActionHelper;
