/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */

/**
 * 世界网关建议 helper。
 * 收敛玩家建议的查看、创建、投票、回复和标记已读入口。
 */

import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { SuggestionRuntimeService } from '../runtime/suggestion/suggestion-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import { WorldGatewayClientEmitHelper } from './world-gateway-client-emit.helper';
import { WorldGatewayGuardHelper } from './world-gateway-guard.helper';

/** 世界 socket suggestion helper：只收敛玩家建议写路径。 */
@Injectable()
class WorldGatewaySuggestionHelper {
    constructor(
        private readonly gatewayGuardHelper: WorldGatewayGuardHelper,
        private readonly gatewayClientEmitHelper: WorldGatewayClientEmitHelper,
        private readonly suggestionRuntimeService: SuggestionRuntimeService,
        private readonly worldClientEventService: WorldClientEventService,
    ) {}

    /**
 * handleRequestSuggestions：处理NextRequestSuggestion并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequestSuggestion相关状态。
 */

    handleRequestSuggestions(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        void payload;
        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        this.gatewayClientEmitHelper.emitSuggestionUpdate(client, this.suggestionRuntimeService.getAll());
    }    
    /**
 * handleCreateSuggestion：构建NextCreateSuggestion。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextCreateSuggestion相关状态。
 */

    async handleCreateSuggestion(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.create(playerId, playerId, payload?.title ?? '', payload?.description ?? '');
            this.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'CREATE_SUGGESTION_FAILED', error);
        }
    }    
    /**
 * handleVoteSuggestion：处理NextVoteSuggestion并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextVoteSuggestion相关状态。
 */

    async handleVoteSuggestion(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.vote(playerId, payload?.suggestionId ?? '', payload?.vote);
            this.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'VOTE_SUGGESTION_FAILED', error);
        }
    }    
    /**
 * handleReplySuggestion：处理NextReplySuggestion并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextReplySuggestion相关状态。
 */

    async handleReplySuggestion(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.addReply(payload?.suggestionId ?? '', 'author', playerId, playerId, payload?.content ?? '');
            this.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REPLY_SUGGESTION_FAILED', error);
        }
    }    
    /**
 * handleMarkSuggestionRepliesRead：读取NextMarkSuggestionReplyRead并返回结果。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextMarkSuggestionReplyRead相关状态。
 */

    async handleMarkSuggestionRepliesRead(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            await this.suggestionRuntimeService.markRepliesRead(payload?.suggestionId ?? '', playerId);
            this.gatewayClientEmitHelper.broadcastSuggestions();
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'MARK_SUGGESTION_REPLIES_READ_FAILED', error);
        }
    }
}

export { WorldGatewaySuggestionHelper };
