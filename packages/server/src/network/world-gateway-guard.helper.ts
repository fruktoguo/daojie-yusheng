// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayGuardHelper = void 0;
/**
 * readBooleanEnv：执行核心业务逻辑。
 * @param key 参数说明。
 * @returns 函数返回值。
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
 * gateway：WorldGatewayGuardHelper 内部字段。
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
 * rejectWhenNotReady：执行核心业务逻辑。
 * @param client 参数说明。
 * @returns 函数返回值。
 */

    rejectWhenNotReady(client) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (readBooleanEnv('SERVER_NEXT_ALLOW_UNREADY_TRAFFIC') || readBooleanEnv('SERVER_NEXT_SMOKE_ALLOW_UNREADY')) {
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
 * requirePlayerId：执行核心业务逻辑。
 * @param client 参数说明。
 * @returns 函数返回值。
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
 * requireGm：执行核心业务逻辑。
 * @param client 参数说明。
 * @returns 函数返回值。
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
