"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldGatewayReadModelHelper = void 0;

const shared_1 = require("@mud/shared-next");
const world_gateway_attr_detail_helper_1 = require("./world-gateway-attr-detail.helper");

/** 世界 socket 读模型 helper：只收敛请求详情/排行/摘要入口。 */
class WorldGatewayReadModelHelper {
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    handleNextRequestAttrDetail(client, _payload) {
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
    handleNextRequestLeaderboard(client, payload) {
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
    handleNextRequestWorldSummary(client, _payload) {
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
    handleRequestDetail(client, payload) {
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
    handleRequestTileDetail(client, payload) {
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
