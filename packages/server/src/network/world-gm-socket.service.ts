import { Inject, Injectable } from '@nestjs/common';
import { RuntimeGmStateService } from '../runtime/gm/runtime-gm-state.service';

/** GM Socket 下发服务：将 GM 操作转换为 runtime gm state 队列。 */
@Injectable()
export class WorldGmSocketService {
/**
 * runtimeGmStateService：运行态GM状态服务引用。
 */

    runtimeGmStateService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param runtimeGmStateService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(RuntimeGmStateService) runtimeGmStateService: any,
    ) {
        this.runtimeGmStateService = runtimeGmStateService;
    }

    /** 向请求者同步 GM 当前状态。 */
    emitState(client) {
        this.runtimeGmStateService.emitState(client);
    }

    /** 触发 GM 请求：新增机器人。 */
    enqueueSpawnBots(requesterPlayerId, count) {
        this.runtimeGmStateService.enqueueSpawnBots(requesterPlayerId, count);
    }

    /** 触发 GM 请求：移除机器人。 */
    enqueueRemoveBots(requesterPlayerId, playerIds, all) {
        this.runtimeGmStateService.enqueueRemoveBots(requesterPlayerId, playerIds, all);
    }

    /** 触发 GM 请求：更新玩家。 */
    enqueueUpdatePlayer(requesterPlayerId, payload) {
        this.runtimeGmStateService.enqueueUpdatePlayer(requesterPlayerId, payload);
    }

    /** 触发 GM 请求：重置玩家。 */
    enqueueResetPlayer(requesterPlayerId, playerId) {
        this.runtimeGmStateService.enqueueResetPlayer(requesterPlayerId, playerId);
    }
};
