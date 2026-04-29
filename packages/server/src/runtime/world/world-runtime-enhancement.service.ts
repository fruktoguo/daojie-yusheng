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
exports.WorldRuntimeEnhancementService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const craft_panel_runtime_service_1 = require("../craft/craft-panel-runtime.service");
const world_runtime_craft_mutation_service_1 = require("./world-runtime-craft-mutation.service");

/** world-runtime enhancement orchestration：承接强化写路径与面板刷新。 */
let WorldRuntimeEnhancementService = class WorldRuntimeEnhancementService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * craftPanelRuntimeService：炼制面板运行态服务引用。
 */

    craftPanelRuntimeService;    
    /**
 * worldRuntimeCraftMutationService：世界运行态炼制Mutation服务引用。
 */

    worldRuntimeCraftMutationService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param craftPanelRuntimeService 参数说明。
 * @param worldRuntimeCraftMutationService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService, craftPanelRuntimeService, worldRuntimeCraftMutationService) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldRuntimeCraftMutationService = worldRuntimeCraftMutationService;
    }    
    /**
 * dispatchStartEnhancement：判断开始强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start强化相关状态。
 */

    async dispatchStartEnhancement(playerId, payload, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const durableOperationService = deps?.durableOperationService ?? null;
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (!durableOperationService?.isEnabled?.() || !runtimeOwnerId || sessionEpoch <= 0) {
            const result = this.craftPanelRuntimeService.startTechniqueActivity(player, 'enhancement', payload);
            if (!result.ok) {
                throw new common_1.BadRequestException(result.error ?? '启动强化失败');
            }
            this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'enhancement', deps);
            return;
        }
        try {
            await this.dispatchStartEnhancementDurably(playerId, player, payload, deps, durableOperationService, runtimeOwnerId, sessionEpoch);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            deps.queuePlayerNotice(playerId, message, 'warn');
        }
    }    
    /**
 * dispatchStartEnhancementDurably：按 commit-gated durable 主链启动强化。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @param durableOperationService durable 服务。
 * @param runtimeOwnerId 运行态 owner。
 * @param sessionEpoch session epoch。
 * @returns 无返回值，直接更新 durable 启动强化相关状态。
 */

    async dispatchStartEnhancementDurably(playerId, player, payload, deps, durableOperationService, runtimeOwnerId, sessionEpoch) {
        const rollbackState = captureEnhancementRollbackState(player);
        player.suppressImmediateDomainPersistence = true;
        let result;
        try {
            result = this.craftPanelRuntimeService.startTechniqueActivity(player, 'enhancement', payload);
            if (!result.ok) {
                restoreEnhancementRollbackState(player, rollbackState, this.playerRuntimeService);
                throw new common_1.BadRequestException(result.error ?? '启动强化失败');
            }
            const nextActiveJob = buildNextEnhancementActiveJobSnapshot(player);
            const nextInventoryItems = cloneInventoryItems(player.inventory?.items ?? []);
            const leaseContext = await resolveRequiredInstanceLeaseContext(player.instanceId, deps);
            await durableOperationService.startActiveJobWithAssets({
                operationId: buildStartEnhancementOperationId(playerId, nextActiveJob),
                playerId,
                expectedRuntimeOwnerId: runtimeOwnerId,
                expectedSessionEpoch: sessionEpoch,
                expectedInstanceId: player.instanceId ?? null,
                expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                nextInventoryItems,
                nextWalletBalances: cloneWalletBalances(player.wallet?.balances ?? []),
                nextActiveJob,
                nextEnhancementRecords: cloneEnhancementRecords(player.enhancementRecords ?? []),
            });
        } catch (error) {
            restoreEnhancementRollbackState(player, rollbackState, this.playerRuntimeService);
            throw error;
        } finally {
            player.suppressImmediateDomainPersistence = false;
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'enhancement', deps, {
            skipActiveJobPersistence: true,
        });
    }    
    /**
 * dispatchCancelEnhancement：判断Cancel强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel强化相关状态。
 */

    async dispatchCancelEnhancement(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const durableOperationService = deps?.durableOperationService ?? null;
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (!durableOperationService?.isEnabled?.() || !runtimeOwnerId || sessionEpoch <= 0) {
            const result = this.craftPanelRuntimeService.cancelTechniqueActivity(player, 'enhancement');
            if (!result.ok) {
                throw new common_1.BadRequestException(result.error ?? '取消强化失败');
            }
            this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'enhancement', deps);
            return;
        }
        try {
            await this.dispatchCancelEnhancementDurably(playerId, player, deps, durableOperationService, runtimeOwnerId, sessionEpoch);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            deps.queuePlayerNotice(playerId, message, 'warn');
        }
    }    
    /**
 * dispatchCancelEnhancementDurably：按 commit-gated durable 主链取消强化。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @param durableOperationService durable 服务。
 * @param runtimeOwnerId 运行态 owner。
 * @param sessionEpoch session epoch。
 * @returns 无返回值，直接更新 durable 取消强化相关状态。
 */

    async dispatchCancelEnhancementDurably(playerId, player, deps, durableOperationService, runtimeOwnerId, sessionEpoch) {
        const rollbackState = captureEnhancementRollbackState(player);
        const activeJob = rollbackState.enhancementJob ? structuredClone(rollbackState.enhancementJob) : null;
        if (!activeJob?.jobRunId) {
            throw new common_1.BadRequestException('当前没有可取消的强化任务。');
        }
        player.suppressImmediateDomainPersistence = true;
        let result;
        try {
            result = this.craftPanelRuntimeService.cancelTechniqueActivity(player, 'enhancement');
            if (!result.ok) {
                restoreEnhancementRollbackState(player, rollbackState, this.playerRuntimeService);
                throw new common_1.BadRequestException(result.error ?? '取消强化失败');
            }
            const leaseContext = await resolveRequiredInstanceLeaseContext(player.instanceId, deps);
            await durableOperationService.cancelActiveJobWithAssets({
                operationId: buildCancelEnhancementOperationId(playerId, activeJob),
                playerId,
                expectedRuntimeOwnerId: runtimeOwnerId,
                expectedSessionEpoch: sessionEpoch,
                expectedInstanceId: player.instanceId ?? null,
                expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                expectedJobRunId: String(activeJob.jobRunId),
                expectedJobVersion: Math.max(1, Math.trunc(Number(activeJob.jobVersion ?? 1))),
                nextInventoryItems: cloneInventoryItems(player.inventory?.items ?? []),
                nextWalletBalances: cloneWalletBalances(player.wallet?.balances ?? []),
                nextEquipmentSlots: buildNextEnhancementEquipmentSlots(player),
                nextEnhancementRecords: cloneEnhancementRecords(player.enhancementRecords ?? []),
            });
        } catch (error) {
            restoreEnhancementRollbackState(player, rollbackState, this.playerRuntimeService);
            throw error;
        } finally {
            player.suppressImmediateDomainPersistence = false;
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'enhancement', deps, {
            skipActiveJobPersistence: true,
        });
    }    
    /**
 * tickEnhancementDurably：按 commit-gated durable 主链完成强化终局 tick。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @param durableOperationService durable 服务。
 * @param runtimeOwnerId 运行态 owner。
 * @param sessionEpoch session epoch。
 * @returns 无返回值，直接更新 durable 强化 tick 相关状态。
 */

    async tickEnhancementDurably(playerId, player, deps, durableOperationService, runtimeOwnerId, sessionEpoch) {
        const activeJobBeforeTick = player?.enhancementJob ? structuredClone(player.enhancementJob) : null;
        if (!activeJobBeforeTick?.jobRunId) {
            this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickTechniqueActivity(player, 'enhancement'), 'enhancement', deps);
            return;
        }
        const rollbackState = captureEnhancementRollbackState(player);
        player.suppressImmediateDomainPersistence = true;
        let result;
        try {
            result = this.craftPanelRuntimeService.tickTechniqueActivity(player, 'enhancement');
            if (!result?.ok) {
                this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'enhancement', deps);
                return;
            }
            const leaseContext = await resolveRequiredInstanceLeaseContext(player.instanceId, deps);
            if (player?.enhancementJob) {
                await durableOperationService.updateActiveJobState({
                    operationId: buildTickEnhancementOperationId(playerId, player.enhancementJob),
                    playerId,
                    expectedRuntimeOwnerId: runtimeOwnerId,
                    expectedSessionEpoch: sessionEpoch,
                    expectedInstanceId: player.instanceId ?? null,
                    expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                    expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                    action: 'update',
                    expectedJobRunId: String(activeJobBeforeTick.jobRunId),
                    expectedJobVersion: Math.max(1, Math.trunc(Number(activeJobBeforeTick.jobVersion ?? 1))),
                    nextActiveJob: buildNextEnhancementActiveJobSnapshot(player),
                });
            } else {
                const expectedJobVersion = resolveCompletedEnhancementJobVersion(activeJobBeforeTick);
                await durableOperationService.completeActiveJobWithAssets({
                    operationId: buildCompleteEnhancementOperationId(playerId, activeJobBeforeTick, expectedJobVersion),
                    playerId,
                    expectedRuntimeOwnerId: runtimeOwnerId,
                    expectedSessionEpoch: sessionEpoch,
                    expectedInstanceId: player.instanceId ?? null,
                    expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                    expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                    expectedJobRunId: String(activeJobBeforeTick.jobRunId),
                    expectedJobVersion,
                    nextInventoryItems: cloneInventoryItems(player.inventory?.items ?? []),
                    nextWalletBalances: cloneWalletBalances(player.wallet?.balances ?? []),
                    nextEquipmentSlots: buildNextEnhancementEquipmentSlots(player),
                    nextEnhancementRecords: cloneEnhancementRecords(player.enhancementRecords ?? []),
                });
            }
        } catch (error) {
            restoreEnhancementRollbackState(player, rollbackState, this.playerRuntimeService);
            throw error;
        } finally {
            player.suppressImmediateDomainPersistence = false;
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'enhancement', deps, {
            skipActiveJobPersistence: true,
        });
    }    
    /**
 * tickEnhancement：执行tick强化相关逻辑。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新tick强化相关状态。
 */

    async tickEnhancement(playerId, player, deps) {
        const durableOperationService = deps?.durableOperationService ?? null;
        const runtimeOwnerId = typeof player?.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player?.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (!durableOperationService?.isEnabled?.() || !runtimeOwnerId || sessionEpoch <= 0) {
            this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickTechniqueActivity(player, 'enhancement'), 'enhancement', deps);
            return;
        }
        await this.tickEnhancementDurably(playerId, player, deps, durableOperationService, runtimeOwnerId, sessionEpoch).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            deps.queuePlayerNotice(playerId, message, 'warn');
        });
    }
};
exports.WorldRuntimeEnhancementService = WorldRuntimeEnhancementService;
exports.WorldRuntimeEnhancementService = WorldRuntimeEnhancementService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        craft_panel_runtime_service_1.CraftPanelRuntimeService,
        world_runtime_craft_mutation_service_1.WorldRuntimeCraftMutationService])
], WorldRuntimeEnhancementService);

export { WorldRuntimeEnhancementService };

function cloneInventoryItems(items) {
    return Array.isArray(items) ? items.map((entry) => ({ ...entry })) : [];
}

function cloneWalletBalances(balances) {
    return Array.isArray(balances)
        ? balances.map((entry) => ({
            walletType: typeof entry?.walletType === 'string' ? entry.walletType.trim() : '',
            balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
            frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
            version: Math.max(0, Math.trunc(Number(entry?.version ?? 0))),
        })).filter((entry) => entry.walletType)
        : [];
}

function cloneEnhancementRecords(records) {
    return Array.isArray(records)
        ? records.map((entry) => ({
            recordId: typeof entry?.recordId === 'string' ? entry.recordId : undefined,
            itemId: typeof entry?.itemId === 'string' ? entry.itemId : '',
            highestLevel: Math.max(0, Math.trunc(Number(entry?.highestLevel ?? 0))),
            levels: Array.isArray(entry?.levels) ? entry.levels.map((level) => level) : [],
            actionStartedAt: Number.isFinite(Number(entry?.actionStartedAt)) ? Math.trunc(Number(entry.actionStartedAt)) : null,
            actionEndedAt: Number.isFinite(Number(entry?.actionEndedAt)) ? Math.trunc(Number(entry.actionEndedAt)) : null,
            startLevel: Number.isFinite(Number(entry?.startLevel)) ? Math.trunc(Number(entry.startLevel)) : null,
            initialTargetLevel: Number.isFinite(Number(entry?.initialTargetLevel)) ? Math.trunc(Number(entry.initialTargetLevel)) : null,
            desiredTargetLevel: Number.isFinite(Number(entry?.desiredTargetLevel)) ? Math.trunc(Number(entry.desiredTargetLevel)) : null,
            protectionStartLevel: Number.isFinite(Number(entry?.protectionStartLevel)) ? Math.trunc(Number(entry.protectionStartLevel)) : null,
            status: typeof entry?.status === 'string' ? entry.status : null,
        })).filter((entry) => entry.itemId)
        : [];
}

function buildNextEnhancementActiveJobSnapshot(player) {
    const job = player?.enhancementJob ?? null;
    if (!job?.jobRunId) {
        throw new Error('active_job_snapshot_missing_after_start_enhancement');
    }
    return {
        jobRunId: String(job.jobRunId),
        jobType: 'enhancement',
        status: job.remainingTicks > 0 ? 'running' : 'completed',
        phase: typeof job.phase === 'string' && job.phase.trim() ? job.phase.trim() : 'enhancing',
        startedAt: Math.max(0, Math.trunc(Number(job.startedAt ?? Date.now()))),
        finishedAt: Number.isFinite(Number(job.finishedAt)) ? Math.max(0, Math.trunc(Number(job.finishedAt))) : null,
        pausedTicks: Math.max(0, Math.trunc(Number(job.pausedTicks ?? 0))),
        totalTicks: Math.max(0, Math.trunc(Number(job.totalTicks ?? 0))),
        remainingTicks: Math.max(0, Math.trunc(Number(job.remainingTicks ?? 0))),
        successRate: Number.isFinite(Number(job.successRate)) ? Number(job.successRate) : 0,
        speedRate: Number.isFinite(Number(job.totalSpeedRate ?? job.speedRate)) ? Number(job.totalSpeedRate ?? job.speedRate) : 0,
        jobVersion: Math.max(1, Math.trunc(Number(job.jobVersion ?? 1))),
        detailJson: {
            target: job.target ? structuredClone(job.target) : null,
            targetItemId: typeof job.targetItemId === 'string' ? job.targetItemId : '',
            targetItemName: typeof job.targetItemName === 'string' ? job.targetItemName : '',
            targetItemLevel: Math.max(1, Math.trunc(Number(job.targetItemLevel ?? 1))),
            currentLevel: Math.max(0, Math.trunc(Number(job.currentLevel ?? 0))),
            targetLevel: Math.max(1, Math.trunc(Number(job.targetLevel ?? 1))),
            desiredTargetLevel: Math.max(1, Math.trunc(Number(job.desiredTargetLevel ?? job.targetLevel ?? 1))),
            spiritStoneCost: Math.max(0, Math.trunc(Number(job.spiritStoneCost ?? 0))),
            materials: Array.isArray(job.materials) ? job.materials.map((entry) => ({ ...entry })) : [],
            protectionUsed: Boolean(job.protectionUsed),
            protectionStartLevel: Number.isFinite(Number(job.protectionStartLevel))
                ? Math.max(1, Math.trunc(Number(job.protectionStartLevel)))
                : null,
            protectionItemId: typeof job.protectionItemId === 'string' ? job.protectionItemId : '',
            protectionItemName: typeof job.protectionItemName === 'string' ? job.protectionItemName : '',
            protectionItemSignature: typeof job.protectionItemSignature === 'string' ? job.protectionItemSignature : '',
        },
    };
}

function captureEnhancementRollbackState(player) {
    return {
        inventoryItems: cloneInventoryItems(player.inventory?.items ?? []),
        inventoryRevision: Math.max(0, Math.trunc(Number(player.inventory?.revision ?? 0))),
        equipmentSlots: buildNextEnhancementEquipmentSlots(player),
        equipmentRevision: Math.max(0, Math.trunc(Number(player.equipment?.revision ?? 0))),
        walletBalances: cloneWalletBalances(player.wallet?.balances ?? []),
        enhancementJob: player?.enhancementJob ? structuredClone(player.enhancementJob) : null,
        enhancementRecords: Array.isArray(player?.enhancementRecords) ? structuredClone(player.enhancementRecords) : [],
        enhancementSkill: player?.enhancementSkill ? structuredClone(player.enhancementSkill) : null,
        enhancementSkillLevel: Math.max(1, Math.trunc(Number(player?.enhancementSkillLevel ?? 1))),
        persistentRevision: Math.max(0, Math.trunc(Number(player.persistentRevision ?? 0))),
        selfRevision: Math.max(0, Math.trunc(Number(player.selfRevision ?? 0))),
        dirtyDomains: player?.dirtyDomains instanceof Set ? Array.from(player.dirtyDomains) : [],
    };
}

function restoreEnhancementRollbackState(player, rollbackState, playerRuntimeService) {
    player.inventory.items = cloneInventoryItems(rollbackState.inventoryItems);
    player.inventory.revision = rollbackState.inventoryRevision;
    if (player.equipment && Array.isArray(player.equipment.slots)) {
        player.equipment.slots = Array.isArray(rollbackState.equipmentSlots)
            ? rollbackState.equipmentSlots.map((entry) => ({
                slot: entry.slot,
                item: entry.item ? structuredClone(entry.item) : null,
            }))
            : [];
        player.equipment.revision = rollbackState.equipmentRevision;
    }
    if (player.wallet && Array.isArray(player.wallet.balances)) {
        player.wallet.balances = cloneWalletBalances(rollbackState.walletBalances);
    } else {
        player.wallet = {
            balances: cloneWalletBalances(rollbackState.walletBalances),
        };
    }
    player.enhancementJob = rollbackState.enhancementJob ? structuredClone(rollbackState.enhancementJob) : null;
    player.enhancementRecords = Array.isArray(rollbackState.enhancementRecords)
        ? structuredClone(rollbackState.enhancementRecords)
        : [];
    if (rollbackState.enhancementSkill) {
        player.enhancementSkill = structuredClone(rollbackState.enhancementSkill);
    }
    player.enhancementSkillLevel = rollbackState.enhancementSkillLevel;
    player.persistentRevision = rollbackState.persistentRevision;
    player.selfRevision = rollbackState.selfRevision;
    player.dirtyDomains = new Set(Array.isArray(rollbackState.dirtyDomains) ? rollbackState.dirtyDomains : []);
    playerRuntimeService.playerAttributesService?.recalculate?.(player);
    playerRuntimeService.playerProgressionService.refreshPreview(player);
}

function buildStartEnhancementOperationId(playerId, nextActiveJob) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedJobRunId = typeof nextActiveJob?.jobRunId === 'string' && nextActiveJob.jobRunId.trim()
        ? nextActiveJob.jobRunId.trim()
        : 'active-job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(nextActiveJob?.jobVersion ?? 1)));
    const normalizedPhase = typeof nextActiveJob?.phase === 'string' && nextActiveJob.phase.trim()
        ? nextActiveJob.phase.trim()
        : 'start';
    return `op:${normalizedPlayerId}:enhancement-start:${normalizedJobRunId}:v${normalizedJobVersion}:${normalizedPhase}`;
}

function buildCancelEnhancementOperationId(playerId, activeJob) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedJobRunId = typeof activeJob?.jobRunId === 'string' && activeJob.jobRunId.trim()
        ? activeJob.jobRunId.trim()
        : 'active-job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(activeJob?.jobVersion ?? 1)));
    const normalizedPhase = typeof activeJob?.phase === 'string' && activeJob.phase.trim()
        ? activeJob.phase.trim()
        : 'cancel';
    return `op:${normalizedPlayerId}:enhancement-cancel:${normalizedJobRunId}:v${normalizedJobVersion}:${normalizedPhase}`;
}

function buildTickEnhancementOperationId(playerId, activeJob) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedJobRunId = typeof activeJob?.jobRunId === 'string' && activeJob.jobRunId.trim()
        ? activeJob.jobRunId.trim()
        : 'active-job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(activeJob?.jobVersion ?? 1)));
    const normalizedPhase = typeof activeJob?.phase === 'string' && activeJob.phase.trim()
        ? activeJob.phase.trim()
        : 'update';
    return `op:${normalizedPlayerId}:enhancement-update:${normalizedJobRunId}:v${normalizedJobVersion}:${normalizedPhase}`;
}

function buildCompleteEnhancementOperationId(playerId, activeJob, expectedJobVersion) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedJobRunId = typeof activeJob?.jobRunId === 'string' && activeJob.jobRunId.trim()
        ? activeJob.jobRunId.trim()
        : 'active-job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(expectedJobVersion ?? activeJob?.jobVersion ?? 1)));
    const normalizedPhase = typeof activeJob?.phase === 'string' && activeJob.phase.trim()
        ? activeJob.phase.trim()
        : 'complete';
    return `op:${normalizedPlayerId}:enhancement-complete:${normalizedJobRunId}:v${normalizedJobVersion}:${normalizedPhase}`;
}

function resolveCompletedEnhancementJobVersion(activeJob) {
    return Math.max(1, Math.trunc(Number(activeJob?.jobVersion ?? 1)) + 1);
}

function buildNextEnhancementEquipmentSlots(player) {
    return Array.isArray(player?.equipment?.slots)
        ? player.equipment.slots.map((entry) => ({
            slot: typeof entry?.slot === 'string' ? entry.slot : '',
            item: entry?.item ? structuredClone(entry.item) : null,
        })).filter((entry) => entry.slot)
        : [];
}

async function resolveInstanceLeaseContext(instanceId, deps) {
    const normalizedInstanceId = typeof instanceId === 'string' && instanceId.trim() ? instanceId.trim() : '';
    const instanceCatalogService = deps?.instanceCatalogService ?? null;
    if (!normalizedInstanceId || !instanceCatalogService?.isEnabled?.()) {
        return null;
    }
    const catalog = await instanceCatalogService.loadInstanceCatalog?.(normalizedInstanceId);
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

async function resolveRequiredInstanceLeaseContext(instanceId, deps) {
    const normalizedInstanceId = typeof instanceId === 'string' && instanceId.trim() ? instanceId.trim() : '';
    const instanceCatalogService = deps?.instanceCatalogService ?? null;
    if (!normalizedInstanceId || !instanceCatalogService?.isEnabled?.()) {
        return null;
    }
    const leaseContext = await resolveInstanceLeaseContext(normalizedInstanceId, deps);
    if (!leaseContext) {
        throw new Error(`instance_lease_context_missing:${normalizedInstanceId}`);
    }
    return leaseContext;
}
