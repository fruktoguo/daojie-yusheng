/**
 * 炼丹系统写路径服务
 * 处理炼丹启动、预设管理、材料消耗和面板状态刷新
 */
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { CraftPanelRuntimeService } from '../craft/craft-panel-runtime.service';
import { WorldRuntimeCraftMutationService } from './world-runtime-craft-mutation.service';

/** 炼丹写路径：启动炼丹、预设管理、材料校验和面板刷新 */
@Injectable()
export class WorldRuntimeAlchemyService {
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
    /** 正在提交 durable 炼丹/炼器启动的玩家，避免同一 active_job 并发启动造成 CAS 自撞。 */
    activeStartPlayerIds = new Set();
    /** 正在提交 durable 炼丹/炼器 tick 的玩家，避免同一 active_job 并发推进造成 CAS 自撞。 */
    activeTickPlayerIds = new Set();
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param craftPanelRuntimeService 参数说明。
 * @param worldRuntimeCraftMutationService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(CraftPanelRuntimeService) craftPanelRuntimeService: any,
        @Inject(WorldRuntimeCraftMutationService) worldRuntimeCraftMutationService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldRuntimeCraftMutationService = worldRuntimeCraftMutationService;
    }    
    /**
 * interruptAlchemyForReason：执行interrupt炼丹ForReason相关逻辑。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新interrupt炼丹ForReason相关状态。
 */

    interruptAlchemyForReason(playerId, player, reason, deps) {
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptTechniqueActivity(player, 'alchemy', reason, deps), 'alchemy', deps);
    }    
    /**
 * dispatchStartAlchemy：判断开始炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start炼丹相关状态。
 */

    async dispatchStartAlchemy(playerId, payload, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const activityKind = resolveAlchemyLikeActivityKind(payload);
        const activityLabel = activityKind === 'forging' ? '炼器' : '炼丹';
        const durableOperationService = deps?.durableOperationService ?? null;
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (player.suppressImmediateDomainPersistence === true) {
            return;
        }
        if (!durableOperationService?.isEnabled?.() || !runtimeOwnerId || sessionEpoch <= 0) {
            const result = this.craftPanelRuntimeService.startTechniqueActivity(player, activityKind, payload, deps);
            if (!result.ok) {
                throw new BadRequestException(result.error ?? `启动${activityLabel}失败`);
            }
            this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, activityKind, deps);
            return;
        }
        const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : '';
        if (normalizedPlayerId && this.activeStartPlayerIds.has(normalizedPlayerId)) {
            return;
        }
        if (normalizedPlayerId) {
            this.activeStartPlayerIds.add(normalizedPlayerId);
        }
        try {
            await this.dispatchStartAlchemyDurably(playerId, player, payload, deps, durableOperationService, runtimeOwnerId, sessionEpoch);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            deps.queuePlayerNotice(playerId, message, 'warn');
        } finally {
            if (normalizedPlayerId) {
                this.activeStartPlayerIds.delete(normalizedPlayerId);
            }
        }
    }    
    /**
 * dispatchStartAlchemyDurably：按 commit-gated durable 主链启动炼丹。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @param durableOperationService durable 服务。
 * @param runtimeOwnerId 运行态 owner。
 * @param sessionEpoch session epoch。
 * @returns 无返回值，直接更新 durable 启动炼丹相关状态。
 */

    async dispatchStartAlchemyDurably(playerId, player, payload, deps, durableOperationService, runtimeOwnerId, sessionEpoch) {
        const activityKind = resolveAlchemyLikeActivityKind(payload);
        const activityLabel = activityKind === 'forging' ? '炼器' : '炼丹';
        const rollbackState = captureStartAlchemyRollbackState(player);
        const activeJobBeforeStart = resolveActiveJobSnapshotFromRollbackState(rollbackState);
        let activeJobPersistedDurably = false;
        player.suppressImmediateDomainPersistence = true;
        let result;
        try {
            result = this.craftPanelRuntimeService.startTechniqueActivity(player, activityKind, payload, deps);
            if (!result.ok) {
                restoreStartAlchemyRollbackState(player, rollbackState, this.playerRuntimeService);
                throw new BadRequestException(result.error ?? `启动${activityLabel}失败`);
            }
            if (hasNewAlchemyLikeActiveJob(rollbackState, player, activityKind)) {
                const nextActiveJob = buildNextAlchemyActiveJobSnapshot(player, activityKind);
                const nextInventoryItems = cloneInventoryItems(player.inventory?.items ?? []);
                const nextWalletBalances = cloneWalletBalances(player.wallet?.balances ?? []);
                const leaseContext = await resolveRequiredInstanceLeaseContext(player.instanceId, deps);
                await durableOperationService.startActiveJobWithAssets({
                    operationId: buildStartAlchemyOperationId(playerId, nextActiveJob),
                    playerId,
                    expectedRuntimeOwnerId: runtimeOwnerId,
                    expectedSessionEpoch: sessionEpoch,
                    expectedInstanceId: player.instanceId ?? null,
                    expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                    expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                    nextInventoryItems,
                    nextWalletBalances,
                    nextActiveJob,
                });
                activeJobPersistedDurably = true;
            } else {
                const nextActiveJob = resolveActiveJobSnapshot(player);
                if (shouldPersistActiveJobUpdate(activeJobBeforeStart, nextActiveJob)) {
                    const leaseContext = await resolveRequiredInstanceLeaseContext(player.instanceId, deps);
                    await durableOperationService.updateActiveJobState({
                        operationId: buildQueueActiveJobOperationId(playerId, activeJobBeforeStart, nextActiveJob),
                        playerId,
                        expectedRuntimeOwnerId: runtimeOwnerId,
                        expectedSessionEpoch: sessionEpoch,
                        expectedInstanceId: player.instanceId ?? null,
                        expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                        expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                        action: 'update',
                        expectedJobRunId: String(activeJobBeforeStart.jobRunId),
                        expectedJobVersion: Math.max(1, Math.trunc(Number(activeJobBeforeStart.jobVersion ?? 1))),
                        nextActiveJob,
                    });
                    activeJobPersistedDurably = true;
                }
            }
        } catch (error) {
            restoreStartAlchemyRollbackState(player, rollbackState, this.playerRuntimeService);
            throw error;
        } finally {
            player.suppressImmediateDomainPersistence = false;
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, activityKind, deps, {
            skipActiveJobPersistence: activeJobPersistedDurably,
        });
    }    
    /**
 * dispatchCancelAlchemy：判断Cancel炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel炼丹相关状态。
 */

  async dispatchCancelAlchemy(playerId, deps, activityKind = 'alchemy') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const normalizedActivityKind = activityKind === 'forging' ? 'forging' : 'alchemy';
        const activityLabel = normalizedActivityKind === 'forging' ? '炼器' : '炼丹';
        const durableOperationService = deps?.durableOperationService ?? null;
        const runtimeOwnerId = typeof player.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (player.suppressImmediateDomainPersistence === true) {
            return;
        }
        if (!durableOperationService?.isEnabled?.() || !runtimeOwnerId || sessionEpoch <= 0) {
            const result = this.craftPanelRuntimeService.cancelTechniqueActivity(player, normalizedActivityKind, deps);
            if (!result.ok) {
                throw new BadRequestException(result.error ?? `取消${activityLabel}失败`);
            }
            this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, normalizedActivityKind, deps);
            return;
        }
        try {
            await this.dispatchCancelAlchemyDurably(playerId, player, deps, durableOperationService, runtimeOwnerId, sessionEpoch, normalizedActivityKind);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            deps.queuePlayerNotice(playerId, message, 'warn');
        }
    }    
    /**
 * dispatchCancelAlchemyDurably：按 commit-gated durable 主链取消炼丹。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @param durableOperationService durable 服务。
 * @param runtimeOwnerId 运行态 owner。
 * @param sessionEpoch session epoch。
 * @returns 无返回值，直接更新 durable 取消炼丹相关状态。
 */

    async dispatchCancelAlchemyDurably(playerId, player, deps, durableOperationService, runtimeOwnerId, sessionEpoch, activityKind = 'alchemy') {
        const normalizedActivityKind = activityKind === 'forging' ? 'forging' : 'alchemy';
        const activityLabel = normalizedActivityKind === 'forging' ? '炼器' : '炼丹';
        const rollbackState = captureStartAlchemyRollbackState(player);
        const activeJob = getAlchemyLikeRollbackJob(rollbackState, normalizedActivityKind);
        if (!activeJob?.jobRunId) {
            throw new BadRequestException(`当前没有可取消的${activityLabel}任务。`);
        }
        if ((activeJob.jobType === 'forging' ? 'forging' : 'alchemy') !== normalizedActivityKind) {
            throw new BadRequestException(`当前没有可取消的${activityLabel}任务。`);
        }
        player.suppressImmediateDomainPersistence = true;
        let result;
        try {
            result = this.craftPanelRuntimeService.cancelTechniqueActivity(player, normalizedActivityKind, deps);
            if (!result.ok) {
                restoreStartAlchemyRollbackState(player, rollbackState, this.playerRuntimeService);
                throw new BadRequestException(result.error ?? `取消${activityLabel}失败`);
            }
            const nextInventoryItems = cloneInventoryItems(player.inventory?.items ?? []);
            const nextWalletBalances = cloneWalletBalances(player.wallet?.balances ?? []);
            const leaseContext = await resolveRequiredInstanceLeaseContext(player.instanceId, deps);
            await durableOperationService.cancelActiveJobWithAssets({
                operationId: buildCancelAlchemyOperationId(playerId, activeJob),
                playerId,
                expectedRuntimeOwnerId: runtimeOwnerId,
                expectedSessionEpoch: sessionEpoch,
                expectedInstanceId: player.instanceId ?? null,
                expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                expectedJobRunId: String(activeJob.jobRunId),
                expectedJobVersion: Math.max(1, Math.trunc(Number(activeJob.jobVersion ?? 1))),
                nextInventoryItems,
                nextWalletBalances,
            });
        } catch (error) {
            restoreStartAlchemyRollbackState(player, rollbackState, this.playerRuntimeService);
            throw error;
        } finally {
            player.suppressImmediateDomainPersistence = false;
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, normalizedActivityKind, deps, {
            skipActiveJobPersistence: true,
        });
    }    
    /**
 * tickAlchemyDurably：按 commit-gated durable 主链完成炼丹终局 tick。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @param durableOperationService durable 服务。
 * @param runtimeOwnerId 运行态 owner。
 * @param sessionEpoch session epoch。
 * @returns 无返回值，直接更新 durable 炼丹 tick 相关状态。
 */

    async tickAlchemyDurably(playerId, player, deps, durableOperationService, runtimeOwnerId, sessionEpoch, activityKind = undefined) {
        const normalizedActivityKind = normalizeAlchemyLikeActivityKind(activityKind ?? resolveActiveAlchemyLikeActivityKind(player));
        const activeJobBeforeTick = getAlchemyLikePlayerJob(player, normalizedActivityKind) ? structuredClone(getAlchemyLikePlayerJob(player, normalizedActivityKind)) : null;
        if (!activeJobBeforeTick?.jobRunId) {
            this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickTechniqueActivity(player, normalizedActivityKind, deps), normalizedActivityKind, deps);
            return;
        }
        const rollbackState = captureStartAlchemyRollbackState(player);
        player.suppressImmediateDomainPersistence = true;
        let result;
        try {
            result = this.craftPanelRuntimeService.tickTechniqueActivity(player, normalizedActivityKind, deps);
            if (!result?.ok) {
                this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, normalizedActivityKind, deps);
                return;
            }
            const leaseContext = await resolveRequiredInstanceLeaseContext(player.instanceId, deps);
            const activeJobAfterTick = getAlchemyLikePlayerJob(player, normalizedActivityKind);
            const nextActiveJobSnapshot = resolveActiveJobSnapshot(player);
            if (isSameActiveJobRun(activeJobBeforeTick, activeJobAfterTick)) {
                await durableOperationService.updateActiveJobState({
                    operationId: buildTickAlchemyOperationId(playerId, activeJobAfterTick),
                    playerId,
                    expectedRuntimeOwnerId: runtimeOwnerId,
                    expectedSessionEpoch: sessionEpoch,
                    expectedInstanceId: player.instanceId ?? null,
                    expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
                    expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
                    action: 'update',
                    expectedJobRunId: String(activeJobBeforeTick.jobRunId),
                    expectedJobVersion: resolveExpectedAlchemyJobVersion(activeJobBeforeTick),
                    nextActiveJob: buildNextAlchemyActiveJobSnapshot(player, normalizedActivityKind),
                });
            } else if (nextActiveJobSnapshot) {
                const expectedJobVersion = resolveCompletedAlchemyJobVersion(activeJobBeforeTick);
                await durableOperationService.completeActiveJobWithAssets({
                    operationId: buildReplaceAlchemyOperationId(playerId, activeJobBeforeTick, nextActiveJobSnapshot, expectedJobVersion),
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
                    nextActiveJob: nextActiveJobSnapshot,
                });
            } else {
                const expectedJobVersion = resolveCompletedAlchemyJobVersion(activeJobBeforeTick);
                await durableOperationService.completeActiveJobWithAssets({
                    operationId: buildCompleteAlchemyOperationId(playerId, activeJobBeforeTick, expectedJobVersion),
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
                });
            }
        } catch (error) {
            restoreStartAlchemyRollbackState(player, rollbackState, this.playerRuntimeService);
            throw error;
        } finally {
            player.suppressImmediateDomainPersistence = false;
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, normalizedActivityKind, deps, {
            skipActiveJobPersistence: true,
        });
    }    
    /**
 * dispatchSaveAlchemyPreset：判断Save炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Save炼丹Preset相关状态。
 */

    dispatchSaveAlchemyPreset(playerId, payload, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.saveAlchemyPreset(player, payload);
        if (!result.ok) {
            throw new BadRequestException(result.error ?? '保存炼制预设失败');
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'alchemy', deps);
    }    
    /**
 * dispatchDeleteAlchemyPreset：判断Delete炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Delete炼丹Preset相关状态。
 */

    dispatchDeleteAlchemyPreset(playerId, presetId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.deleteAlchemyPreset(player, presetId);
        if (!result.ok) {
            throw new BadRequestException(result.error ?? '删除炼制预设失败');
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'alchemy', deps);
    }    
    /**
 * tickAlchemy：执行tick炼丹相关逻辑。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新tick炼丹相关状态。
 */

    async tickAlchemy(playerId, player, deps, activityKind = undefined) {
        const normalizedActivityKind = normalizeAlchemyLikeActivityKind(activityKind ?? resolveActiveAlchemyLikeActivityKind(player));
        const durableOperationService = deps?.durableOperationService ?? null;
        const runtimeOwnerId = typeof player?.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
            ? player.runtimeOwnerId.trim()
            : '';
        const sessionEpoch = Number.isFinite(player?.sessionEpoch)
            ? Math.max(1, Math.trunc(Number(player.sessionEpoch)))
            : 0;
        if (!durableOperationService?.isEnabled?.() || !runtimeOwnerId || sessionEpoch <= 0) {
            this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickTechniqueActivity(player, normalizedActivityKind, deps), normalizedActivityKind, deps);
            return;
        }
        const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : '';
        if (normalizedPlayerId && this.activeTickPlayerIds.has(normalizedPlayerId)) {
            return;
        }
        if (normalizedPlayerId) {
            this.activeTickPlayerIds.add(normalizedPlayerId);
        }
        try {
            await this.tickAlchemyDurably(playerId, player, deps, durableOperationService, runtimeOwnerId, sessionEpoch, normalizedActivityKind).catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                deps.queuePlayerNotice(playerId, message, 'warn');
            });
        } finally {
            if (normalizedPlayerId) {
                this.activeTickPlayerIds.delete(normalizedPlayerId);
            }
        }
    }
};

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

function buildNextAlchemyActiveJobSnapshot(player, activityKind = 'alchemy') {
    const job = getAlchemyLikePlayerJob(player, activityKind);
    if (!job?.jobRunId) {
        throw new Error(`active_job_snapshot_missing_after_start_${activityKind === 'forging' ? 'forging' : 'alchemy'}`);
    }
    const jobType = job.jobType === 'forging' ? 'forging' : 'alchemy';
    return {
        jobRunId: String(job.jobRunId),
        jobType,
        status: job.phase === 'paused' ? 'paused' : 'running',
        phase: typeof job.phase === 'string' && job.phase.trim() ? job.phase.trim() : 'preparing',
        startedAt: Math.max(0, Math.trunc(Number(job.startedAt ?? Date.now()))),
        finishedAt: Number.isFinite(Number(job.finishedAt)) ? Math.max(0, Math.trunc(Number(job.finishedAt))) : null,
        pausedTicks: Math.max(0, Math.trunc(Number(job.pausedTicks ?? 0))),
        totalTicks: Math.max(0, Math.trunc(Number(job.totalTicks ?? 0))),
        remainingTicks: Math.max(0, Math.trunc(Number(job.remainingTicks ?? 0))),
        successRate: Number.isFinite(Number(job.successRate)) ? Number(job.successRate) : 0,
        speedRate: Number.isFinite(Number(job.speedRate ?? job.totalSpeedRate)) ? Number(job.speedRate ?? job.totalSpeedRate) : 0,
        jobVersion: Math.max(1, Math.trunc(Number(job.jobVersion ?? 1))),
        detailJson: {
            ...job,
            jobRunId: String(job.jobRunId),
            jobType,
            jobVersion: Math.max(1, Math.trunc(Number(job.jobVersion ?? 1))),
            recipeId: typeof job.recipeId === 'string' ? job.recipeId : '',
            outputItemId: typeof job.outputItemId === 'string' ? job.outputItemId : '',
            outputCount: Math.max(1, Math.trunc(Number(job.outputCount ?? 1))),
            quantity: Math.max(1, Math.trunc(Number(job.quantity ?? 1))),
            completedCount: Math.max(0, Math.trunc(Number(job.completedCount ?? 0))),
            successCount: Math.max(0, Math.trunc(Number(job.successCount ?? 0))),
            failureCount: Math.max(0, Math.trunc(Number(job.failureCount ?? 0))),
            ingredients: Array.isArray(job.ingredients) ? job.ingredients.map((entry) => ({ ...entry })) : [],
            preparationTicks: Math.max(0, Math.trunc(Number(job.preparationTicks ?? 0))),
            batchBrewTicks: Math.max(0, Math.trunc(Number(job.batchBrewTicks ?? 0))),
            currentBatchRemainingTicks: Math.max(0, Math.trunc(Number(job.currentBatchRemainingTicks ?? 0))),
            spiritStoneCost: Math.max(0, Math.trunc(Number(job.spiritStoneCost ?? 0))),
            exactRecipe: Boolean(job.exactRecipe),
        },
    };
}

function resolveActiveJobSnapshot(player) {
    if (player?.enhancementJob) {
        return buildActiveJobSnapshot(player.enhancementJob, 'enhancement');
    }
    if (player?.forgingJob) {
        return buildNextAlchemyActiveJobSnapshot(player, 'forging');
    }
    if (player?.alchemyJob) {
        return buildNextAlchemyActiveJobSnapshot(player, player.alchemyJob.jobType === 'forging' ? 'forging' : 'alchemy');
    }
    return null;
}

function resolveActiveJobSnapshotFromRollbackState(rollbackState) {
    if (rollbackState?.enhancementJob) {
        return buildActiveJobSnapshot(rollbackState.enhancementJob, 'enhancement');
    }
    if (rollbackState?.forgingJob) {
        return buildActiveJobSnapshot(rollbackState.forgingJob, 'forging');
    }
    if (rollbackState?.alchemyJob) {
        return buildActiveJobSnapshot(rollbackState.alchemyJob, rollbackState.alchemyJob.jobType === 'forging' ? 'forging' : 'alchemy');
    }
    return null;
}

function buildActiveJobSnapshot(job, jobType) {
    if (!job?.jobRunId) {
        return null;
    }
    const normalizedJobType = jobType === 'enhancement' ? 'enhancement' : jobType === 'forging' ? 'forging' : 'alchemy';
    return {
        jobRunId: String(job.jobRunId),
        jobType: normalizedJobType,
        status: job.phase === 'paused' ? 'paused' : 'running',
        phase: typeof job.phase === 'string' && job.phase.trim() ? job.phase.trim() : 'running',
        startedAt: Math.max(0, Math.trunc(Number(job.startedAt ?? Date.now()))),
        finishedAt: Number.isFinite(Number(job.finishedAt)) ? Math.max(0, Math.trunc(Number(job.finishedAt))) : null,
        pausedTicks: Math.max(0, Math.trunc(Number(job.pausedTicks ?? 0))),
        totalTicks: Math.max(0, Math.trunc(Number(job.totalTicks ?? 0))),
        remainingTicks: Math.max(0, Math.trunc(Number(job.remainingTicks ?? 0))),
        successRate: Number.isFinite(Number(job.successRate)) ? Number(job.successRate) : 0,
        speedRate: Number.isFinite(Number(job.speedRate ?? job.totalSpeedRate)) ? Number(job.speedRate ?? job.totalSpeedRate) : 0,
        jobVersion: Math.max(1, Math.trunc(Number(job.jobVersion ?? 1))),
        detailJson: {
            ...job,
            jobRunId: String(job.jobRunId),
            jobType: normalizedJobType,
            jobVersion: Math.max(1, Math.trunc(Number(job.jobVersion ?? 1))),
        },
    };
}

function hasNewAlchemyLikeActiveJob(rollbackState, player, activityKind) {
    const before = getAlchemyLikeRollbackJob(rollbackState, activityKind);
    const after = getAlchemyLikePlayerJob(player, activityKind);
    return Boolean(after?.jobRunId && before?.jobRunId !== after.jobRunId);
}

function shouldPersistActiveJobUpdate(before, after) {
    if (!before?.jobRunId || !after?.jobRunId) {
        return false;
    }
    if (before.jobRunId !== after.jobRunId) {
        return false;
    }
    return Math.max(1, Math.trunc(Number(before.jobVersion ?? 1))) !== Math.max(1, Math.trunc(Number(after.jobVersion ?? 1)));
}

function resolveAlchemyLikeActivityKind(payload) {
    return payload?.kind === 'forging' ? 'forging' : 'alchemy';
}

function normalizeAlchemyLikeActivityKind(value) {
    return value === 'forging' ? 'forging' : 'alchemy';
}

function isSameActiveJobRun(before, after) {
    const beforeJobRunId = typeof before?.jobRunId === 'string' && before.jobRunId.trim() ? before.jobRunId.trim() : '';
    const afterJobRunId = typeof after?.jobRunId === 'string' && after.jobRunId.trim() ? after.jobRunId.trim() : '';
    return Boolean(beforeJobRunId && afterJobRunId && beforeJobRunId === afterJobRunId);
}

function resolveActiveAlchemyLikeActivityKind(player) {
    return player?.forgingJob ? 'forging' : player?.alchemyJob?.jobType === 'forging' ? 'forging' : 'alchemy';
}

function getAlchemyLikePlayerJob(player, activityKind) {
    return activityKind === 'forging' ? player?.forgingJob ?? null : player?.alchemyJob ?? null;
}

function getAlchemyLikeRollbackJob(rollbackState, activityKind) {
    return activityKind === 'forging'
        ? rollbackState.forgingJob ? structuredClone(rollbackState.forgingJob) : null
        : rollbackState.alchemyJob ? structuredClone(rollbackState.alchemyJob) : null;
}

function captureStartAlchemyRollbackState(player) {
    return {
        inventoryItems: cloneInventoryItems(player.inventory?.items ?? []),
        inventoryRevision: Math.max(0, Math.trunc(Number(player.inventory?.revision ?? 0))),
        walletBalances: cloneWalletBalances(player.wallet?.balances ?? []),
        alchemyJob: player?.alchemyJob ? structuredClone(player.alchemyJob) : null,
        forgingJob: player?.forgingJob ? structuredClone(player.forgingJob) : null,
        enhancementJob: player?.enhancementJob ? structuredClone(player.enhancementJob) : null,
        alchemySkill: player?.alchemySkill ? structuredClone(player.alchemySkill) : null,
        forgingSkill: player?.forgingSkill ? structuredClone(player.forgingSkill) : null,
        enhancementSkillLevel: Math.max(1, Math.trunc(Number(player?.enhancementSkillLevel ?? 1))),
        persistentRevision: Math.max(0, Math.trunc(Number(player.persistentRevision ?? 0))),
        selfRevision: Math.max(0, Math.trunc(Number(player.selfRevision ?? 0))),
        dirtyDomains: player?.dirtyDomains instanceof Set ? Array.from(player.dirtyDomains) : [],
    };
}

function restoreStartAlchemyRollbackState(player, rollbackState, playerRuntimeService) {
    player.inventory.items = cloneInventoryItems(rollbackState.inventoryItems);
    player.inventory.revision = rollbackState.inventoryRevision;
    if (player.wallet && Array.isArray(player.wallet.balances)) {
        player.wallet.balances = cloneWalletBalances(rollbackState.walletBalances);
    } else {
        player.wallet = {
            balances: cloneWalletBalances(rollbackState.walletBalances),
        };
    }
    player.alchemyJob = rollbackState.alchemyJob ? structuredClone(rollbackState.alchemyJob) : null;
    player.forgingJob = rollbackState.forgingJob ? structuredClone(rollbackState.forgingJob) : null;
    player.enhancementJob = rollbackState.enhancementJob ? structuredClone(rollbackState.enhancementJob) : null;
    if (rollbackState.alchemySkill) {
        player.alchemySkill = structuredClone(rollbackState.alchemySkill);
    }
    if (rollbackState.forgingSkill) {
        player.forgingSkill = structuredClone(rollbackState.forgingSkill);
    }
    player.enhancementSkillLevel = rollbackState.enhancementSkillLevel;
    player.persistentRevision = rollbackState.persistentRevision;
    player.selfRevision = rollbackState.selfRevision;
    player.dirtyDomains = new Set(Array.isArray(rollbackState.dirtyDomains) ? rollbackState.dirtyDomains : []);
    playerRuntimeService.playerProgressionService.refreshPreview(player);
}

function buildStartAlchemyOperationId(playerId, nextActiveJob) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedJobRunId = typeof nextActiveJob?.jobRunId === 'string' && nextActiveJob.jobRunId.trim()
        ? nextActiveJob.jobRunId.trim()
        : 'active-job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(nextActiveJob?.jobVersion ?? 1)));
    const normalizedPhase = typeof nextActiveJob?.phase === 'string' && nextActiveJob.phase.trim()
        ? nextActiveJob.phase.trim()
        : 'start';
    return `op:${normalizedPlayerId}:active-job-start:${normalizedJobRunId}:v${normalizedJobVersion}:${normalizedPhase}`;
}

function buildCancelAlchemyOperationId(playerId, activeJob) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedJobRunId = typeof activeJob?.jobRunId === 'string' && activeJob.jobRunId.trim()
        ? activeJob.jobRunId.trim()
        : 'active-job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(activeJob?.jobVersion ?? 1)));
    return `op:${normalizedPlayerId}:active-job-cancel:${normalizedJobRunId}:v${normalizedJobVersion}`;
}

function buildTickAlchemyOperationId(playerId, activeJob) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedJobRunId = typeof activeJob?.jobRunId === 'string' && activeJob.jobRunId.trim()
        ? activeJob.jobRunId.trim()
        : 'active-job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(activeJob?.jobVersion ?? 1)));
    const normalizedPhase = typeof activeJob?.phase === 'string' && activeJob.phase.trim()
        ? activeJob.phase.trim()
        : 'update';
    return `op:${normalizedPlayerId}:active-job-update:${normalizedJobRunId}:v${normalizedJobVersion}:${normalizedPhase}`;
}

function buildQueueActiveJobOperationId(playerId, previousActiveJob, nextActiveJob) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedJobRunId = typeof nextActiveJob?.jobRunId === 'string' && nextActiveJob.jobRunId.trim()
        ? nextActiveJob.jobRunId.trim()
        : typeof previousActiveJob?.jobRunId === 'string' && previousActiveJob.jobRunId.trim()
            ? previousActiveJob.jobRunId.trim()
            : 'active-job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(nextActiveJob?.jobVersion ?? previousActiveJob?.jobVersion ?? 1)));
    return `op:${normalizedPlayerId}:active-job-queue:${normalizedJobRunId}:v${normalizedJobVersion}`;
}

function buildCompleteAlchemyOperationId(playerId, activeJob, expectedJobVersion) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedJobRunId = typeof activeJob?.jobRunId === 'string' && activeJob.jobRunId.trim()
        ? activeJob.jobRunId.trim()
        : 'active-job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(expectedJobVersion ?? activeJob?.jobVersion ?? 1)));
    return `op:${normalizedPlayerId}:active-job-complete:${normalizedJobRunId}:v${normalizedJobVersion}`;
}

function buildReplaceAlchemyOperationId(playerId, completedJob, nextActiveJob, expectedJobVersion) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const completedJobRunId = typeof completedJob?.jobRunId === 'string' && completedJob.jobRunId.trim()
        ? completedJob.jobRunId.trim()
        : 'completed-job';
    const nextJobRunId = typeof nextActiveJob?.jobRunId === 'string' && nextActiveJob.jobRunId.trim()
        ? nextActiveJob.jobRunId.trim()
        : 'next-job';
    const normalizedJobVersion = Math.max(1, Math.trunc(Number(expectedJobVersion ?? completedJob?.jobVersion ?? 1)));
    return `op:${normalizedPlayerId}:active-job-replace:${completedJobRunId}:v${normalizedJobVersion}:${nextJobRunId}`;
}

function resolveCompletedAlchemyJobVersion(activeJob) {
    return resolveExpectedAlchemyJobVersion(activeJob);
}

function resolveExpectedAlchemyJobVersion(activeJob) {
    return Math.max(1, Math.trunc(Number(activeJob?.jobVersion ?? 1)));
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
