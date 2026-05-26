/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 世界网关读模型 helper。
 * 收敛属性详情、排行榜、世界摘要、实体详情和地块详情等只读请求入口。
 */

import { Injectable } from '@nestjs/common';
import { S2C, cloneNumericRatioDivisors, cloneNumericStats } from '@mud/shared';
import type { Socket } from 'socket.io';
import { LeaderboardRuntimeService } from '../runtime/player/leaderboard-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { buildAttrDetailBonuses, buildAttrDetailNumericStatBreakdowns } from './world-gateway-attr-detail.helper';
import { WorldClientEventService } from './world-client-event.service';
import { WorldGatewayGuardHelper } from './world-gateway-guard.helper';

/** 世界 socket 读模型 helper：只收敛请求详情/排行/摘要入口。 */
@Injectable()
class WorldGatewayReadModelHelper {
    constructor(
        private readonly gatewayGuardHelper: WorldGatewayGuardHelper,
        private readonly playerRuntimeService: PlayerRuntimeService,
        private readonly leaderboardRuntimeService: LeaderboardRuntimeService,
        private readonly worldRuntimeService: WorldRuntimeService,
        private readonly worldClientEventService: WorldClientEventService,
    ) {}

    /**
 * handleRequestAttrDetail：处理NextRequestAttr详情并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequestAttr详情相关状态。
 */

    handleRequestAttrDetail(client: Socket, _payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        void _payload;
        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                return;
            }
            this.worldClientEventService.markProtocol(client, 'mainline');
            const bonuses = buildAttrDetailBonuses(player);
            const numericStatBreakdowns = buildAttrDetailNumericStatBreakdowns(player);
            client.emit(S2C.AttrDetail, {
                baseAttrs: { ...player.attrs.baseAttrs },
                bonuses,
                finalAttrs: { ...player.attrs.finalAttrs },
                numericStats: cloneNumericStats(player.attrs.numericStats),
                ratioDivisors: cloneNumericRatioDivisors(player.attrs.ratioDivisors),
                numericStatBreakdowns,
                alchemySkill: player.alchemySkill,
                forgingSkill: player.forgingSkill,
                buildingSkill: player.buildingSkill,
                gatherSkill: player.gatherSkill,
                enhancementSkill: player.enhancementSkill,
                miningSkill: player.miningSkill,
                formationSkill: player.formationSkill,
            });
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_ATTR_DETAIL_FAILED', error);
        }
    }    
    /**
 * handleRequestLeaderboard：处理NextRequestLeaderboard并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新NextRequestLeaderboard相关状态。
 */

    async handleRequestLeaderboard(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'mainline');
            client.emit(S2C.Leaderboard, await this.leaderboardRuntimeService.buildLeaderboard(
                payload?.limit,
                this.worldRuntimeService?.worldRuntimeSectService,
            ));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_LEADERBOARD_FAILED', error);
        }
    }    
    /**
 * handleRequestLeaderboardPlayerLocations：处理玩家击杀榜坐标追索请求并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新玩家击杀榜坐标追索相关状态。
 */

    async handleRequestLeaderboardPlayerLocations(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'mainline');
            client.emit(S2C.LeaderboardPlayerLocations, await this.leaderboardRuntimeService.buildLeaderboardPlayerLocations(payload?.playerIds));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_LEADERBOARD_PLAYER_LOCATIONS_FAILED', error);
        }
    }    
    /**
 * handleRequestWorldSummary：处理NextRequest世界摘要并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新NextRequest世界摘要相关状态。
 */

    async handleRequestWorldSummary(client: Socket, _payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        void _payload;
        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'mainline');
            client.emit(S2C.WorldSummary, await this.leaderboardRuntimeService.buildWorldSummary());
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_WORLD_SUMMARY_FAILED', error);
        }
    }    
    /**
 * handleRequestDetail：处理Request详情并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Request详情相关状态。
 */

    handleRequestDetail(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(S2C.Detail, this.worldRuntimeService.buildDetail(playerId, {
                kind: payload?.kind,
                id: payload?.id ?? '',
            }));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_DETAIL_FAILED', error);
        }
    }    
    /**
 * handleRequestTileDetail：处理RequestTile详情并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新RequestTile详情相关状态。
 */

    handleRequestTileDetail(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            client.emit(S2C.TileDetail, this.worldRuntimeService.buildTileDetail(playerId, {
                x: payload?.x,
                y: payload?.y,
            }));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'REQUEST_TILE_DETAIL_FAILED', error);
        }
    }
}

export { WorldGatewayReadModelHelper };
