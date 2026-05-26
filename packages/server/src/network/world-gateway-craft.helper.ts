/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 世界网关技艺 helper。
 * 收敛炼丹、锻造、强化面板请求和活动开始/取消/预设管理入口。
 */

import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { emitTechniqueActivityPanel, emitTechniqueActivityTasks, getTechniqueActivityMetadata } from '../runtime/craft/technique-activity-registry.helpers';
import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldClientEventService } from './world-client-event.service';
import { WorldGatewayGuardHelper } from './world-gateway-guard.helper';

/** 世界 socket 采集/锻造 helper：只收敛 craft 相关入口。 */
@Injectable()
class WorldGatewayCraftHelper {
    constructor(
        private readonly gatewayGuardHelper: WorldGatewayGuardHelper,
        private readonly playerRuntimeService: PlayerRuntimeService,
        private readonly craftPanelRuntimeService: CraftPanelRuntimeService,
        private readonly worldRuntimeService: WorldRuntimeService,
        private readonly worldClientEventService: WorldClientEventService,
    ) {}

    /**
 * handleRequestTechniqueActivityPanel：统一技艺面板请求入口。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新技艺面板请求相关状态。
 */

    handleRequestTechniqueActivityPanel(client: Socket, payload: any, kind: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
            const panelPayload = this.craftPanelRuntimeService.buildTechniqueActivityPanelPayload(player, kind, payload?.knownCatalogVersion);
            emitTechniqueActivityPanel(client, kind, panelPayload);
            emitTechniqueActivityTasks(client, this.craftPanelRuntimeService.buildTechniqueActivityTaskListPayload(player, undefined));
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, getTechniqueActivityMetadata(kind).requestPanelErrorCode, error);
        }
    }    
    /**
 * handleStartTechniqueActivity：统一技艺活动开始入口。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新技艺活动开始相关状态。
 */

    handleStartTechniqueActivity(client: Socket, payload: any, kind: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'mainline');
            this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueStartTechniqueActivity(playerId, kind, payload, this.worldRuntimeService);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, getTechniqueActivityMetadata(kind).startErrorCode, error);
        }
    }    
    /**
 * handleCancelTechniqueActivity：统一技艺活动取消入口。
 * @param client 参数说明。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新技艺活动取消相关状态。
 */

    handleCancelTechniqueActivity(client: Socket, kind: any, cancelRef: any = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'mainline');
            this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCancelTechniqueActivity(playerId, kind, this.worldRuntimeService, cancelRef);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, getTechniqueActivityMetadata(kind).cancelErrorCode, error);
        }
    }
    /** 统一任务列表取消按钮入口：payload 只作为取消意图，实际裁定在 runtime 命令队列执行。 */
    handleCancelTechniqueActivityView(client: Socket, payload: any) {
        const rawRef = payload?.cancelRef && typeof payload.cancelRef === 'object'
            ? payload.cancelRef
            : payload;
        const kind = normalizeTechniqueActivityKind(rawRef?.kind);
        const cancelRef = {
            kind,
            ...(typeof rawRef?.jobRunId === 'string' && rawRef.jobRunId.trim() ? { jobRunId: rawRef.jobRunId.trim() } : {}),
            ...(typeof rawRef?.queueId === 'string' && rawRef.queueId.trim() ? { queueId: rawRef.queueId.trim() } : {}),
        };
        this.handleCancelTechniqueActivity(client, kind, cancelRef);
    }    
    /**
 * handleRequestAlchemyPanel：处理炼丹面板请求并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新炼丹面板请求相关状态。
 */

    handleRequestAlchemyPanel(client: Socket, payload: any) {
        this.handleRequestTechniqueActivityPanel(client, payload, payload?.kind === 'forging' ? 'forging' : 'alchemy');
    }    
    /**
 * handleRequestEnhancementPanel：处理强化面板请求并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新强化面板请求相关状态。
 */

    handleRequestEnhancementPanel(client: Socket, _payload: any) {
        this.handleRequestTechniqueActivityPanel(client, _payload, 'enhancement');
    }    
    /**
 * handleStartAlchemy：处理开始炼丹并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新开始炼丹相关状态。
 */

    handleStartAlchemy(client: Socket, payload: any) {
        this.handleStartTechniqueActivity(client, payload, payload?.kind === 'forging' ? 'forging' : 'alchemy');
    }    
    /**
 * handleCancelAlchemy：判断取消炼丹是否满足条件。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新取消炼丹相关状态。
 */

    handleCancelAlchemy(client: Socket, _payload: any) {
        void _payload;
        this.handleCancelTechniqueActivity(client, _payload?.kind === 'forging' ? 'forging' : 'alchemy');
    }    
    /**
 * handleSaveAlchemyPreset：处理保存炼丹预设并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新保存炼丹预设相关状态。
 */

    handleSaveAlchemyPreset(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'mainline');
            this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSaveAlchemyPreset(playerId, payload, this.worldRuntimeService);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'SAVE_ALCHEMY_PRESET_FAILED', error);
        }
    }    
    /**
 * handleDeleteAlchemyPreset：处理删除炼丹预设并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新删除炼丹预设相关状态。
 */

    handleDeleteAlchemyPreset(client: Socket, payload: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.worldClientEventService.markProtocol(client, 'mainline');
            this.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueDeleteAlchemyPreset(playerId, payload?.presetId, this.worldRuntimeService);
        }
        catch (error) {
            this.worldClientEventService.emitGatewayError(client, 'DELETE_ALCHEMY_PRESET_FAILED', error);
        }
    }    
    /**
 * handleStartEnhancement：处理开始强化并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新开始强化相关状态。
 */

    handleStartEnhancement(client: Socket, payload: any) {
        this.handleStartTechniqueActivity(client, payload, 'enhancement');
    }    
    /**
 * handleCancelEnhancement：判断取消强化是否满足条件。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新取消强化相关状态。
 */

    handleCancelEnhancement(client: Socket, _payload: any) {
        void _payload;
        this.handleCancelTechniqueActivity(client, 'enhancement');
    }
}

function normalizeTechniqueActivityKind(kind: any) {
    return kind === 'forging'
        || kind === 'enhancement'
        || kind === 'gather'
        || kind === 'building'
        || kind === 'mining'
        || kind === 'formation'
        ? kind
        : 'alchemy';
}

export { WorldGatewayCraftHelper };
