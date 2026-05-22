/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * GM Socket 操作服务。
 * 将 gateway 层收到的 GM 操作请求转发到 runtime GM 状态队列中排队执行。
 */

import { Inject, Injectable } from '@nestjs/common';
import { RuntimeGmStateService } from '../runtime/gm/runtime-gm-state.service';
import { NativeGmStateQueryService } from '../http/native/native-gm-state-query.service';

/** GM Socket 下发服务：将 GM 操作转换为 runtime gm state 队列。 */
@Injectable()
export class WorldGmSocketService {
/**
 * runtimeGmStateService：运行态GM状态服务引用。
 */

    runtimeGmStateService;    
    gmStateQueryService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param runtimeGmStateService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(RuntimeGmStateService) runtimeGmStateService: any,
        @Inject(NativeGmStateQueryService) gmStateQueryService: any,
    ) {
        this.runtimeGmStateService = runtimeGmStateService;
        this.gmStateQueryService = gmStateQueryService;
    }

    /** 向请求者同步 GM 当前状态。 */
    emitState(client) {
        this.runtimeGmStateService.emitState(client);
    }

    /** 触发 GM 请求：新增机器人。 */
    enqueueSpawnBots(requesterPlayerId, count) {
        this.runtimeGmStateService.enqueueSpawnBots(requesterPlayerId, count);
        this.invalidatePlayerListCaches();
    }

    /** 触发 GM 请求：移除机器人。 */
    enqueueRemoveBots(requesterPlayerId, playerIds, all) {
        this.runtimeGmStateService.enqueueRemoveBots(requesterPlayerId, playerIds, all);
        this.invalidatePlayerListCaches();
    }

    /** 触发 GM 请求：更新玩家。 */
    enqueueUpdatePlayer(requesterPlayerId, payload) {
        this.runtimeGmStateService.enqueueUpdatePlayer(requesterPlayerId, payload);
        this.invalidatePlayerListCaches();
    }

    /** 触发 GM 请求：重置玩家。 */
    enqueueResetPlayer(requesterPlayerId, playerId) {
        this.runtimeGmStateService.enqueueResetPlayer(requesterPlayerId, playerId);
        this.invalidatePlayerListCaches();
    }

    invalidatePlayerListCaches() {
        if (typeof this.gmStateQueryService?.invalidatePlayerListCaches === 'function') {
            this.gmStateQueryService.invalidatePlayerListCaches();
        }
    }
};
