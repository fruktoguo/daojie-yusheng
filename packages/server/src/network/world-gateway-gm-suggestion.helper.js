"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayGmSuggestionHelper = void 0;

/** 世界 socket GM 建议 helper：只收敛 suggestion 的 GM 维护写路径。 */
class WorldGatewayGmSuggestionHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    async handleGmMarkSuggestionCompleted(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.suggestionRuntimeService.markCompleted(payload?.suggestionId ?? '');
            this.gateway.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'GM_MARK_SUGGESTION_COMPLETED_FAILED', error);
        }
    }
    async handleGmRemoveSuggestion(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.suggestionRuntimeService.remove(payload?.suggestionId ?? '');
            this.gateway.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'GM_REMOVE_SUGGESTION_FAILED', error);
        }
    }
}
exports.WorldGatewayGmSuggestionHelper = WorldGatewayGmSuggestionHelper;
