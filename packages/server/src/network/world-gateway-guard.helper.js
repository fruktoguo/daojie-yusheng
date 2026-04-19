"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayGuardHelper = void 0;

function readBooleanEnv(key) {
    const value = process.env[key];
    if (typeof value !== 'string') {
        return false;
    }
    return value === '1' || value.toLowerCase() === 'true';
}
/** 世界 socket 守卫 helper：收敛 readiness、玩家身份和 GM 身份检查。 */
class WorldGatewayGuardHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    rejectWhenNotReady(client) {
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
    requirePlayerId(client) {
        const playerId = typeof client.data.playerId === 'string' ? client.data.playerId : '';
        if (playerId) {
            return playerId;
        }
        this.gateway.worldClientEventService.emitNotReady(client);
        return null;
    }
    requireGm(client) {
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
