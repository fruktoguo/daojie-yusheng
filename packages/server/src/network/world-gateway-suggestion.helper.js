"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewaySuggestionHelper = void 0;

/** 世界 socket suggestion helper：只收敛玩家建议写路径。 */
class WorldGatewaySuggestionHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    handleNextRequestSuggestions(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.gateway.emitNextSuggestionUpdate(client, this.gateway.suggestionRuntimeService.getAll());
    }
    async handleNextCreateSuggestion(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.suggestionRuntimeService.create(playerId, playerId, payload?.title ?? '', payload?.description ?? '');
            this.gateway.broadcastSuggestions();
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CREATE_SUGGESTION_FAILED', error);
        }
    }
    async handleNextVoteSuggestion(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.suggestionRuntimeService.vote(playerId, payload?.suggestionId ?? '', payload?.vote);
            this.gateway.broadcastSuggestions();
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'VOTE_SUGGESTION_FAILED', error);
        }
    }
    async handleNextReplySuggestion(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.suggestionRuntimeService.addReply(payload?.suggestionId ?? '', 'author', playerId, playerId, payload?.content ?? '');
            this.gateway.broadcastSuggestions();
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REPLY_SUGGESTION_FAILED', error);
        }
    }
    async handleNextMarkSuggestionRepliesRead(client, payload) {
        const playerId = this.gateway.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.suggestionRuntimeService.markRepliesRead(payload?.suggestionId ?? '', playerId);
            this.gateway.broadcastSuggestions();
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'MARK_SUGGESTION_REPLIES_READ_FAILED', error);
        }
    }
}
exports.WorldGatewaySuggestionHelper = WorldGatewaySuggestionHelper;
