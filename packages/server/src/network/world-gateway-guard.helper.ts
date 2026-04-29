// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayGuardHelper = void 0;
/**
 * readBooleanEnv：读取BooleanEnv并返回结果。
 * @param key 参数说明。
 * @returns 无返回值，完成BooleanEnv的读取/组装。
 */


function readBooleanEnv(key) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const value = process.env[key];
    if (typeof value !== 'string') {
        return false;
    }
    return value === '1' || value.toLowerCase() === 'true';
}
/** 世界 socket 守卫 helper：收敛 readiness、玩家身份和 GM 身份检查。 */
class WorldGatewayGuardHelper {
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
 * rejectWhenNotReady：读取rejectWhenNotReady并返回结果。
 * @param client 参数说明。
 * @returns 无返回值，直接更新rejectWhenNotReady相关状态。
 */

    rejectWhenNotReady(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (readBooleanEnv('SERVER_ALLOW_UNREADY_TRAFFIC') || readBooleanEnv('SERVER_SMOKE_ALLOW_UNREADY')) {
            return false;
        }
        const health = this.gateway.healthReadinessService.build();
        if (health.readiness.ok) {
            return false;
        }
        const isMaintenance = health.readiness.maintenance?.active === true;
        this.gateway.worldClientEventService.emitError(client, isMaintenance ? 'SERVER_BUSY' : 'SERVER_NOT_READY', isMaintenance ? '数据库维护中，请稍后重连' : '服务未就绪，请稍后重连');
        client.disconnect(true);
        return true;
    }
    /**
 * requirePlayerId：执行require玩家ID相关逻辑。
 * @param client 参数说明。
 * @returns 无返回值，直接更新require玩家ID相关状态。
 */

    requirePlayerId(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = typeof client.data.playerId === 'string' ? client.data.playerId : '';
        if (playerId) {
            return playerId;
        }
        this.gateway.worldClientEventService.emitNotReady(client);
        return null;
    }
    /**
 * requireActivePlayerId：要求当前 socket 仍绑定在该玩家的有效 session 上。
 * @param client 参数说明。
 * @returns 无返回值，直接更新有效玩家会话相关状态。
 */

    requireActivePlayerId(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return null;
        }
        const binding = this.gateway.worldSessionService?.getBinding?.(playerId) ?? null;
        if (binding?.connected === true && binding.socketId === client.id) {
            return playerId;
        }
        this.gateway.worldClientEventService.emitError(client, 'SESSION_EXPIRED', '当前会话已失效，请重新连接。');
        if (typeof client?.disconnect === 'function') {
            client.disconnect(true);
        }
        return null;
    }
    /**
 * requireGm：执行requireGM相关逻辑。
 * @param client 参数说明。
 * @returns 无返回值，直接更新requireGM相关状态。
 */

    requireGm(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.requirePlayerId(client);
        if (!playerId) {
            return null;
        }
        if (client.data?.isGm === true) {
            return playerId;
        }
        this.gateway.worldClientEventService.emitError(client, 'GM_FORBIDDEN', 'GM 权限不足');
        return null;
    }
}
exports.WorldGatewayGuardHelper = WorldGatewayGuardHelper;

export { WorldGatewayGuardHelper };
