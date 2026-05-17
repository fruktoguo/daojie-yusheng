
/**
 * 世界网关 GM 命令 helper。
 * 收敛 GM 状态查询、机器人管理和玩家数据修改等维护命令入口。
 */

import type { WorldGatewayHelperContext } from './world-gateway-context.types';

/** 世界 socket GM 命令 helper：收敛维护命令。 */
class WorldGatewayGmCommandHelper {
/**
 * gateway：gateway相关字段。
 */
    private readonly gateway: WorldGatewayHelperContext;
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(gateway: WorldGatewayHelperContext) {
        this.gateway = gateway;
    }    
    /**
 * handleGmGetState：读取GMGet状态并返回结果。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新GMGet状态相关状态。
 */

    handleGmGetState(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requireGm(client);
        if (!playerId) {
            return;
        }
        this.gateway.worldGmSocketService.emitState(client);
    }    
    /**
 * handleGmSpawnBots：处理GMSpawnBot并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新GMSpawnBot相关状态。
 */

    handleGmSpawnBots(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldGmSocketService.enqueueSpawnBots(playerId, payload?.count);
            this.gateway.worldGmSocketService.emitState(client);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'GM_SPAWN_BOTS_FAILED', error);
        }
    }    
    /**
 * handleGmRemoveBots：处理GMRemoveBot并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新GMRemoveBot相关状态。
 */

    handleGmRemoveBots(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requireGm(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldGmSocketService.enqueueRemoveBots(playerId, payload?.playerIds, payload?.all);
            this.gateway.worldGmSocketService.emitState(client);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'GM_REMOVE_BOTS_FAILED', error);
        }
    }    
    /**
 * handleGmUpdatePlayer：处理GMUpdate玩家并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新GMUpdate玩家相关状态。
 */

    handleGmUpdatePlayer(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const requesterPlayerId = this.gateway.gatewayGuardHelper.requireGm(client);
        if (!requesterPlayerId) {
            return;
        }
        try {
            this.gateway.worldGmSocketService.enqueueUpdatePlayer(requesterPlayerId, payload);
            this.gateway.worldGmSocketService.emitState(client);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'GM_UPDATE_PLAYER_FAILED', error);
        }
    }    
    /**
 * handleGmResetPlayer：处理GMReset玩家并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新GMReset玩家相关状态。
 */

    handleGmResetPlayer(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const requesterPlayerId = this.gateway.gatewayGuardHelper.requireGm(client);
        if (!requesterPlayerId) {
            return;
        }
        try {
            this.gateway.worldGmSocketService.enqueueResetPlayer(requesterPlayerId, payload?.playerId);
            this.gateway.worldGmSocketService.emitState(client);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'GM_RESET_PLAYER_FAILED', error);
        }
    }
}

export { WorldGatewayGmCommandHelper };
