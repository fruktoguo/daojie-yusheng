
/**
 * 世界网关 GM 建议 helper。
 * 收敛 GM 对建议的标记完成和删除操作入口。
 */

import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { SuggestionRuntimeService } from '../runtime/suggestion/suggestion-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import { WorldGatewayClientEmitHelper } from './world-gateway-client-emit.helper';
import { WorldGatewayGuardHelper } from './world-gateway-guard.helper';

/** 世界 socket GM 建议 helper：只收敛 suggestion 的 GM 维护写路径。 */
@Injectable()
class WorldGatewayGmSuggestionHelper {
    constructor(
        private readonly gatewayGuardHelper: WorldGatewayGuardHelper,
        private readonly gatewayClientEmitHelper: WorldGatewayClientEmitHelper,
        private readonly suggestionRuntimeService: SuggestionRuntimeService,
        private readonly worldClientEventService: WorldClientEventService,
    ) {}

    /**
 * handleGmMarkSuggestionCompleted：处理GMMarkSuggestionCompleted并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新GMMarkSuggestionCompleted相关状态。
 */

    async handleGmMarkSuggestionCompleted(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.markCompleted(payload?.suggestionId ?? '');
            this.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'GM_MARK_SUGGESTION_COMPLETED_FAILED', error);
        }
    }    
    /**
 * handleGmRemoveSuggestion：处理GMRemoveSuggestion并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新GMRemoveSuggestion相关状态。
 */

    async handleGmRemoveSuggestion(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.remove(payload?.suggestionId ?? '');
            this.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'GM_REMOVE_SUGGESTION_FAILED', error);
        }
    }
}

export { WorldGatewayGmSuggestionHelper };
