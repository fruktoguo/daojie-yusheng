// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayGmSuggestionHelper = void 0;

/** 世界 socket GM 建议 helper：只收敛 suggestion 的 GM 维护写路径。 */
class WorldGatewayGmSuggestionHelper {
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
 * handleGmMarkSuggestionCompleted：处理GMMarkSuggestionCompleted并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新GMMarkSuggestionCompleted相关状态。
 */

    async handleGmMarkSuggestionCompleted(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * handleGmRemoveSuggestion：处理GMRemoveSuggestion并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新GMRemoveSuggestion相关状态。
 */

    async handleGmRemoveSuggestion(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

export { WorldGatewayGmSuggestionHelper };
