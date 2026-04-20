// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayReadModelHelper = void 0;

const shared_1 = require("@mud/shared-next");
const world_gateway_attr_detail_helper_1 = require("./world-gateway-attr-detail.helper");

/** 世界 socket 读模型 helper：只收敛请求详情/排行/摘要入口。 */
class WorldGatewayReadModelHelper {
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
 * handleNextRequestAttrDetail：处理NextRequestAttr详情并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequestAttr详情相关状态。
 */

    handleNextRequestAttrDetail(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const player = this.gateway.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                return;
            }
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            const bonuses = (0, world_gateway_attr_detail_helper_1.buildAttrDetailBonuses)(player);
            const numericStatBreakdowns = (0, world_gateway_attr_detail_helper_1.buildAttrDetailNumericStatBreakdowns)(player);
            client.emit(shared_1.NEXT_S2C.AttrDetail, {
                baseAttrs: { ...player.attrs.baseAttrs },
                bonuses,
                finalAttrs: { ...player.attrs.finalAttrs },
                numericStats: (0, shared_1.cloneNumericStats)(player.attrs.numericStats),
                ratioDivisors: (0, shared_1.cloneNumericRatioDivisors)(player.attrs.ratioDivisors),
                numericStatBreakdowns,
                alchemySkill: player.alchemySkill,
                gatherSkill: player.gatherSkill,
                enhancementSkill: player.enhancementSkill,
            });
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_ATTR_DETAIL_FAILED', error);
        }
    }    
    /**
 * handleNextRequestLeaderboard：处理NextRequestLeaderboard并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequestLeaderboard相关状态。
 */

    handleNextRequestLeaderboard(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.Leaderboard, this.gateway.leaderboardRuntimeService.buildLeaderboard(payload?.limit));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_LEADERBOARD_FAILED', error);
        }
    }    
    /**
 * handleNextRequestWorldSummary：处理NextRequest世界摘要并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequest世界摘要相关状态。
 */

    handleNextRequestWorldSummary(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'next');
            client.emit(shared_1.NEXT_S2C.WorldSummary, this.gateway.leaderboardRuntimeService.buildWorldSummary());
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_WORLD_SUMMARY_FAILED', error);
        }
    }    
    /**
 * handleRequestDetail：处理Request详情并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Request详情相关状态。
 */

    handleRequestDetail(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.Detail, this.gateway.worldRuntimeService.buildDetail(playerId, {
                kind: payload?.kind,
                id: payload?.id ?? '',
            }));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_DETAIL_FAILED', error);
        }
    }    
    /**
 * handleRequestTileDetail：处理RequestTile详情并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新RequestTile详情相关状态。
 */

    handleRequestTileDetail(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(shared_1.NEXT_S2C.TileDetail, this.gateway.worldRuntimeService.buildTileDetail(playerId, {
                x: payload?.x,
                y: payload?.y,
            }));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_TILE_DETAIL_FAILED', error);
        }
    }
}
exports.WorldGatewayReadModelHelper = WorldGatewayReadModelHelper;

export { WorldGatewayReadModelHelper };
