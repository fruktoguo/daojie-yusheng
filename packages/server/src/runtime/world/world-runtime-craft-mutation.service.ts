// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeCraftMutationService = void 0;

const common_1 = require("@nestjs/common");
const world_session_service_1 = require("../../network/world-session.service");
const world_client_event_service_1 = require("../../network/world-client-event.service");
const player_runtime_service_1 = require("../player/player-runtime.service");
const craft_panel_runtime_service_1 = require("../craft/craft-panel-runtime.service");
const technique_activity_registry_helpers_1 = require("../craft/technique-activity-registry.helpers");

/** craft shared mutation orchestration：承接 panel 更新、掉地兜底与 mutation flush。 */
let WorldRuntimeCraftMutationService = class WorldRuntimeCraftMutationService {
    logger = new common_1.Logger(WorldRuntimeCraftMutationService.name);
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * craftPanelRuntimeService：炼制面板运行态服务引用。
 */

    craftPanelRuntimeService;    
    /**
 * worldSessionService：世界Session服务引用。
 */

    worldSessionService;    
    /**
 * worldClientEventService：世界Client事件服务引用。
 */

    worldClientEventService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param craftPanelRuntimeService 参数说明。
 * @param worldSessionService 参数说明。
 * @param worldClientEventService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService, craftPanelRuntimeService, worldSessionService, worldClientEventService) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldClientEventService = worldClientEventService;
    }    
    /**
 * emitCraftPanelUpdate：处理炼制面板Update并更新相关状态。
 * @param playerId 玩家 ID。
 * @param panel 参数说明。
 * @param _deps 参数说明。
 * @returns 无返回值，直接更新炼制面板Update相关状态。
 */

    emitCraftPanelUpdate(playerId, panel, _deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const socket = this.worldSessionService.getSocketByPlayerId(playerId);
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!socket || !player || !this.worldClientEventService.prefersMainline(socket)) {
            return;
        }
        const payload = this.craftPanelRuntimeService.buildTechniqueActivityPanelPayload(player, panel);
        (0, technique_activity_registry_helpers_1.emitTechniqueActivityPanel)(socket, panel, payload);
    }    
    /**
 * emitAllTechniqueActivityPanelUpdates：按统一技艺顺序补发所有面板。
 * @param playerId 玩家 ID。
 * @param deps 参数说明。
 * @returns 无返回值，直接更新所有技艺面板相关状态。
 */

    emitAllTechniqueActivityPanelUpdates(playerId, deps) {
        for (const kind of (0, technique_activity_registry_helpers_1.listTechniqueActivityRefreshKinds)()) {
            this.emitCraftPanelUpdate(playerId, kind, deps);
        }
    }    
    /**
 * flushCraftMutation：执行刷新炼制Mutation相关逻辑。
 * @param playerId 玩家 ID。
 * @param result 返回结果。
 * @param panel 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新flush炼制Mutation相关状态。
 */

    flushCraftMutation(playerId, result, panel, deps, options = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!result?.ok) {
            return;
        }
        if (!options.skipActiveJobPersistence) {
            void this.persistActiveJobIfNeeded(playerId, deps).catch((error) => {
                this.logger.warn(`活跃任务 durable 记账失败：${error instanceof Error ? error.message : String(error)}`);
            });
        }
        if (Array.isArray(result.groundDrops) && result.groundDrops.length > 0) {
            this.dropCraftGroundItems(playerId, result.groundDrops, deps);
        }
        for (const message of result.messages ?? []) {
            if (message?.text) {
                deps.queuePlayerNotice(playerId, message.text, message.kind ?? 'info');
            }
        }
        if (result.panelChanged) {
            this.emitCraftPanelUpdate(playerId, panel, deps);
        }
    }    
    /**
 * persistActiveJobIfNeeded：处理活跃Job持久化相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新活跃Job持久化相关状态。
 */

    async persistActiveJobIfNeeded(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const durableOperationService = deps?.durableOperationService ?? null;
        if (!durableOperationService?.isEnabled?.()) {
            return;
        }
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player || !player.playerId) {
            return;
        }
        const activeJob = player.enhancementJob ?? player.alchemyJob;
        if (!activeJob || !activeJob.jobRunId) {
            return;
        }
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (!runtimeOwnerId || sessionEpoch <= 0) {
            return;
        }
        const nextActiveJob = buildActiveJobSnapshot(activeJob, player.enhancementJob ? 'enhancement' : 'alchemy');
        if (!nextActiveJob) {
            return;
        }
        const expectedInstanceId = typeof player.instanceId === 'string' && player.instanceId.trim() ? player.instanceId.trim() : '';
        const leaseContext = await this.resolveActiveJobLeaseContext(player, deps);
        if (expectedInstanceId && !leaseContext) {
            this.logger.warn(`活跃任务 durable 记账跳过：instance lease 缺失 playerId=${playerId} instanceId=${expectedInstanceId}`);
            return;
        }
        const operationId = buildActiveJobOperationId(playerId, nextActiveJob);
        await durableOperationService.updateActiveJobState({
            operationId,
            playerId,
            expectedRuntimeOwnerId: runtimeOwnerId,
            expectedSessionEpoch: sessionEpoch,
            expectedInstanceId: expectedInstanceId || null,
            expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
            expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
            action: activeJob.phase === 'paused' ? 'update' : (activeJob.jobType === 'enhancement' ? 'start' : 'start'),
            expectedJobRunId: activeJob.jobRunId,
            expectedJobVersion: activeJob.jobVersion ?? 1,
            nextActiveJob,
        });
    }    
    /**
 * resolveActiveJobLeaseContext：解析活跃作业 durable 记账的实例 lease 上下文。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 返回 assignedNodeId / ownershipEpoch，无法解析时返回 null。
 */

    async resolveActiveJobLeaseContext(player, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instanceId = typeof player?.instanceId === 'string' && player.instanceId.trim()
            ? player.instanceId.trim()
            : '';
        const instanceCatalogService = deps?.instanceCatalogService ?? null;
        if (!instanceId || !instanceCatalogService?.isEnabled?.()) {
            return null;
        }
        const catalog = await instanceCatalogService.loadInstanceCatalog?.(instanceId);
        const assignedNodeId = typeof catalog?.assigned_node_id === 'string' && catalog.assigned_node_id.trim()
            ? catalog.assigned_node_id.trim()
            : '';
        const ownershipEpoch = Number.isFinite(Number(catalog?.ownership_epoch))
            ? Math.max(1, Math.trunc(Number(catalog.ownership_epoch)))
            : 0;
        if (!assignedNodeId || ownershipEpoch <= 0) {
            return null;
        }
        return {
            assignedNodeId,
            ownershipEpoch,
        };
    }    
    /**
 * dropCraftGroundItems：执行drop炼制地面道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param items 道具列表。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新drop炼制Ground道具相关状态。
 */

    dropCraftGroundItems(playerId, items, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        const instance = deps.getInstanceRuntimeOrThrow(player.instanceId);
        for (const item of items) {
            try {
                deps.spawnGroundItem(instance, player.x, player.y, item);
                deps.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 背包放不下，已落在你脚边。`, 'loot');
            }
            catch {
                this.playerRuntimeService.receiveInventoryItem(playerId, item);
                deps.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 无法落地，已直接放回背包。`, 'warn');
            }
        }
    }
};
exports.WorldRuntimeCraftMutationService = WorldRuntimeCraftMutationService;
exports.WorldRuntimeCraftMutationService = WorldRuntimeCraftMutationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        craft_panel_runtime_service_1.CraftPanelRuntimeService,
        world_session_service_1.WorldSessionService,
        world_client_event_service_1.WorldClientEventService])
], WorldRuntimeCraftMutationService);
/**
 * formatItemStackLabel：规范化或转换道具StackLabel。
 * @param item 道具。
 * @returns 无返回值，直接更新道具StackLabel相关状态。
 */


function formatItemStackLabel(item) {
    return `${item.name ?? item.itemId} x${Math.max(1, Math.floor(Number(item.count) || 1))}`;
}

function buildActiveJobSnapshot(job, jobType) {
    if (!job || typeof job !== 'object') {
        return null;
    }
    const normalizedJobType = jobType === 'enhancement' ? 'enhancement' : 'alchemy';
    const jobRunId = typeof job.jobRunId === 'string' && job.jobRunId.trim() ? job.jobRunId.trim() : '';
    const jobVersion = Math.max(1, Math.trunc(Number(job.jobVersion ?? 1)));
    return {
        jobRunId,
        jobType: normalizedJobType,
        status: typeof job.status === 'string' && job.status.trim() ? job.status.trim() : 'running',
        phase: typeof job.phase === 'string' && job.phase.trim() ? job.phase.trim() : 'running',
        startedAt: Math.max(1, Math.trunc(Number(job.startedAt ?? Date.now()))),
        finishedAt: job.finishedAt == null ? null : Math.max(1, Math.trunc(Number(job.finishedAt))),
        pausedTicks: Math.max(0, Math.trunc(Number(job.pausedTicks ?? 0))),
        totalTicks: Math.max(0, Math.trunc(Number(job.totalTicks ?? 0))),
        remainingTicks: Math.max(0, Math.trunc(Number(job.remainingTicks ?? 0))),
        successRate: Number.isFinite(Number(job.successRate ?? 0)) ? Number(job.successRate ?? 0) : 0,
        speedRate: Number.isFinite(Number(job.speedRate ?? job.totalSpeedRate ?? 1)) ? Number(job.speedRate ?? job.totalSpeedRate ?? 1) : 1,
        jobVersion,
        detailJson: {
            ...job,
            jobRunId,
            jobType: normalizedJobType,
            jobVersion,
        },
    };
}

function buildActiveJobOperationId(playerId, activeJob) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedJobRunId = typeof activeJob?.jobRunId === 'string' && activeJob.jobRunId.trim()
        ? activeJob.jobRunId.trim()
        : 'job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(activeJob?.jobVersion ?? 1)));
    const normalizedPhase = typeof activeJob?.phase === 'string' && activeJob.phase.trim()
        ? activeJob.phase.trim()
        : 'running';
    return `op:${normalizedPlayerId}:active-job:${normalizedJobRunId}:v${normalizedJobVersion}:${normalizedPhase}`;
}

export { WorldRuntimeCraftMutationService };
