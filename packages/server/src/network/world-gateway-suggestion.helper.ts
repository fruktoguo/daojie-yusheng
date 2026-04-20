// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewaySuggestionHelper = void 0;

/** 世界 socket suggestion helper：只收敛玩家建议写路径。 */
class WorldGatewaySuggestionHelper {
/**
 * gateway：WorldGatewaySuggestionHelper 内部字段。
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
 * handleNextRequestSuggestions：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    handleNextRequestSuggestions(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.gateway.gatewayClientEmitHelper.emitNextSuggestionUpdate(client, this.gateway.suggestionRuntimeService.getAll());
    }    
    /**
 * handleNextCreateSuggestion：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    async handleNextCreateSuggestion(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.suggestionRuntimeService.create(playerId, playerId, payload?.title ?? '', payload?.description ?? '');
            this.gateway.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CREATE_SUGGESTION_FAILED', error);
        }
    }    
    /**
 * handleNextVoteSuggestion：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    async handleNextVoteSuggestion(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.suggestionRuntimeService.vote(playerId, payload?.suggestionId ?? '', payload?.vote);
            this.gateway.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'VOTE_SUGGESTION_FAILED', error);
        }
    }    
    /**
 * handleNextReplySuggestion：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    async handleNextReplySuggestion(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.suggestionRuntimeService.addReply(payload?.suggestionId ?? '', 'author', playerId, playerId, payload?.content ?? '');
            this.gateway.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REPLY_SUGGESTION_FAILED', error);
        }
    }    
    /**
 * handleNextMarkSuggestionRepliesRead：处理事件并驱动执行路径。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    async handleNextMarkSuggestionRepliesRead(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.gateway.suggestionRuntimeService.markRepliesRead(payload?.suggestionId ?? '', playerId);
            this.gateway.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'MARK_SUGGESTION_REPLIES_READ_FAILED', error);
        }
    }
}
exports.WorldGatewaySuggestionHelper = WorldGatewaySuggestionHelper;

export { WorldGatewaySuggestionHelper };
