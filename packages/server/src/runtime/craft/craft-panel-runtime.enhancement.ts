/**
 * craft-panel-runtime.enhancement.ts
 *
 * 从 CraftPanelRuntimeService 拆出的强化域实现：durable 流、保护/记录、
 * 候选构建、资源校验与持久化。所有函数以 xxxImpl(self: CraftPanelRuntimeService, ...) 形式导出，
 * 由主类一行委托调用。
 */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { existsSync, readFileSync } from 'fs';
import {
    ALCHEMY_FURNACE_OUTPUT_COUNT,
    ARTIFACT_CRAFT_BASE_SUCCESS_RATE,
    ELEMENT_KEYS,
    EQUIP_SLOTS,
    ENHANCEMENT_HAMMER_TAG,
    ENHANCEMENT_SPIRIT_STONE_ITEM_ID,
    MAX_ENHANCE_LEVEL,
    TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH,
    TECHNIQUE_GRADE_ORDER,
    addCraftElementVector,
    applyCraftOutputRate,
    canMergeItemStack,
    cloneCraftEffectStats,
    compactCraftElementVector,
    computeAlchemyAdjustedBrewTicks,
    computeAlchemyAdjustedSuccessRate,
    computeAlchemyBatchOutputCountWithSize,
    computeAlchemyBrewTicks,
    computeAlchemyRawBrewTicks,
    computeAlchemyTotalJobTicks,
    computeEnhancementAdjustedSuccessRate,
    computeEnhancementJobTicks,
    computeEnhancementToolSpeedRate,
    computeFivePhaseElementMatch,
    computeLuckSuccessRateBonus,
    createEmptyCraftElementVector,
    createItemStackSignature,
    getAlchemySpiritStoneCost,
    getItemDisplayName,
    isLegacyItemInstanceId,
    normalizeCraftEffectStatsPatch,
    normalizeCraftElementVector,
    resolvePlayerFacingContentName,
} from '@mud/shared';
import type { ItemStack } from '@mud/shared';
import { assignItemInstanceIdIfNeeded, compareItemInstanceId, isItemInstanceIdHardCheckEnabled } from '../world/item-instance-id.helpers';
import { lockItem, unlockItem, getLockedItem, lockedItemToItemStack } from '../player/inventory-lock.helpers';
import {
    buildEnhancementRecordRowsFromEntries,
    nextPlayerPersistenceVersion,
    isConvergedPlayerProjectionFenceError,
    isConvergedPlayerPresenceFenceError,
    isSupersededPlayerAssetFenceError,
} from '../../persistence/player-domain-persistence.service';
import { isFlushTaskConsumerMode } from '../../persistence/flush-task-runtime-mode';
import type { TechniqueActivityQueueReorderAction } from '@mud/shared';
import type { DurableProfessionStateSnapshot } from '../../persistence/durable-operation.service';
import { bumpTechniqueActivityJobVersion } from './technique-activity-runtime.helpers';
import { resolvePlayerEffectiveLuck } from '../player/player-special-stat.helpers';
import { resolvePlayerCraftRealmLevel } from './craft-effect-runtime.helpers';
import { isEnhancementProgressOnlyTick } from './pipeline/strategies/enhancement-tick.helpers';
import {
    type CraftRuntimeSectionRecorder,
    resolveContentPath,
    walkJsonFiles,
    normalizePositiveInt,
    normalizeTechniqueGrade,
    normalizeCraftSkill,
    normalizeEnhancementConfig,
    normalizeEnhancementRequirement,
    toAlchemyIngredientDef,
    toAlchemyMainIngredientDef,
    resolveRecipeRequiredAuxElements,
    sumRecipeIngredientElements,
    buildAlchemyRecipeTargetElements,
    sumCraftElementAbs,
    resolveAlchemyRecipeCategory,
    resolveAlchemyLikeBaseSuccessRate,
    computeAlchemyMaterialPower,
    resolveAlchemyGradeValue,
    cloneItem,
    flattenItemForClone,
    isEnhanceableItem,
    clonePartialNumericStats,
    cloneEnhancementRecord,
    cloneEnhancementJob,
    createCraftJobRunId,
    normalizeCraftQueueStartMode,
    cloneCraftQueue,
    getPlayerCraftQueue,
    getPlayerTechniqueActivityQueue,
    setPlayerTechniqueActivityQueue,
    enqueuePlayerTechniqueActivityQueueItem,
    reorderPlayerTechniqueActivityQueueItem,
    migrateLegacyCraftQueueToUnifiedQueue,
    normalizeTechniqueActivityQueueItem,
    normalizeRuntimeTechniqueActivityKind,
    hasCancelableTechniqueActivityJob,
    createTechniqueActivityQueueId,
    getAlchemyLikeJob,
    setAlchemyLikeJob,
    buildCraftQueueId,
    buildAlchemyQueueItem,
    buildEnhancementQueueItem,
    buildActiveJobSnapshotFromPlayer,
    captureEnhancementAssetRuntimeState,
    captureEnhancementProgressRuntimeState,
    restoreEnhancementProgressRuntimeState,
    restoreEnhancementAssetRuntimeState,
    buildDurableInventoryItemsFromSnapshot,
    buildDurableWalletBalancesFromSnapshot,
    buildEnhancementAdvancedAssetPatch,
    indexStableDurableInventoryItems,
    normalizeEnhancementPatchComparableValue,
    resolveEnhancementDurableCompletionKind,
    buildDurableInventoryItemSnapshot,
    buildDurableEquipmentSlotsFromSnapshot,
    buildDurableEnhancementRecordsFromEntries,
    buildDurableProfessionStatesFromSnapshot,
    buildTechniqueActivityQueueSnapshotFromPlayer,
    buildActiveJobSnapshot,
    normalizeActiveJobSnapshotType,
    isCompletedAlchemyLikeJob,
    countInventoryItem,
    receiveInventoryItem,
    consumeInventoryItemByItemId,
    extractInventoryItemByInstanceId,
    findInventoryItemByInstanceId,
    findInventoryItemIndexByInstanceId,
    setEquippedItem,
    extractEquipmentItem,
    hasTechniqueActivityStatisticSignal,
    normalizeText,
    normalizeInventoryItemInstanceId,
    normalizeAlchemyPresetName,
    createAlchemyPresetId,
    normalizeQuantity,
    normalizeIngredientSelections,
    cloneAlchemyIngredientSelections,
    cloneCraftElementMatchSnapshot,
    isExactSubmittedIngredients,
    validateAlchemySelection,
    applyCraftSkillExp,
    resolveAlchemySkillBaseActionTicks,
    resolveAlchemyBatchSuccess,
    normalizeEquipSlot,
    cloneTargetRef,
    beginCraftRuntimeSection,
    recordCraftRuntimeSection,
    recordCraftRuntimeCount,
    buildCraftMutationResult,
    buildSupersededCraftTickResult,
    capturePlayerSessionFence,
    normalizePlayerSessionFence,
    isSamePlayerSessionFence,
    buildCraftTickResult,
    normalizeEnhanceLevel,
    getEnhancementSpiritStoneCost,
} from './craft-panel-runtime.catalog.helpers';
import type { CraftPanelRuntimeService } from './craft-panel-runtime.service';
import { SPIRIT_STONE_ITEM_ID } from './craft-panel-runtime.service';

export async function startEnhancementDurablyImpl(self: CraftPanelRuntimeService, player, payload, deps = null) {
        return self.runExclusivePlayerAssetMutation(
            player,
            () => self.startEnhancementDurablyLocked(player, payload, deps),
        );
}

export async function startEnhancementDurablyLockedImpl(self: CraftPanelRuntimeService, player, payload, deps = null) {
        if (player?.enhancementDurableCommitInFlight === true || player?.suppressImmediateDomainPersistence === true) {
            return buildCraftMutationResult('强化状态正在同步，请稍后重试。');
        }
        const durableEnabled = self.shouldUseDurableEnhancementPersistence(player);
        if (
            durableEnabled
            && !await self.flushTechniqueActivityProjection(player, {
                force: true,
                reason: 'enhancement_start_handoff',
            })
        ) {
            return buildCraftMutationResult('强化状态正在同步，请稍后重试。');
        }
        const durablePresence = durableEnabled
            ? await self.resolveDurablePresenceFence(player.playerId)
            : null;
        const before = captureEnhancementAssetRuntimeState(player);
        const previousSuppress = player?.suppressImmediateDomainPersistence;
        if (durableEnabled) {
            player.enhancementDurableCommitInFlight = true;
            player.suppressImmediateDomainPersistence = true;
        }
        try {
            const result = self.startTechniqueActivity(player, 'enhancement', payload, deps);
            if (!result.ok) {
                return result;
            }
            if ('queued' in result && result.queued === true) {
                self.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job']);
                return result;
            }
            if (!player?.enhancementJob) {
                return result;
            }
            await self.commitEnhancementActiveJobWithAssets(player, 'start', null, {
                allowSuppressed: durableEnabled,
                presence: durablePresence,
            });
            return result;
        }
        catch (error) {
            self.restoreEnhancementAssetRuntimeState(player, before);
            throw error;
        }
        finally {
            if (durableEnabled) {
                player.suppressImmediateDomainPersistence = previousSuppress;
                player.enhancementDurableCommitInFlight = false;
            }
        }
}

export async function startQueuedEnhancementDurablyImpl(self: CraftPanelRuntimeService, player, startQueuedActivity, deps = null) {
        return self.runExclusivePlayerAssetMutation(
            player,
            () => self.startQueuedEnhancementDurablyLocked(player, startQueuedActivity, deps),
        );
}

export async function startQueuedEnhancementDurablyLockedImpl(self: CraftPanelRuntimeService, player, startQueuedActivity, deps = null) {
        if (typeof startQueuedActivity !== 'function') {
            return null;
        }
        if (player?.enhancementDurableCommitInFlight === true || player?.suppressImmediateDomainPersistence === true) {
            return null;
        }
        const queueHead = Array.isArray(player?.techniqueActivityQueue)
            ? player.techniqueActivityQueue[0]
            : null;
        if (queueHead?.kind !== 'enhancement') {
            return startQueuedActivity();
        }
        const durableEnabled = self.shouldUseDurableEnhancementPersistence(player);
        if (
            durableEnabled
            && !await self.flushTechniqueActivityProjection(player, {
                force: true,
                reason: 'queued_enhancement_start_handoff',
            })
        ) {
            return null;
        }
        const durablePresence = durableEnabled
            ? await self.resolveDurablePresenceFence(player.playerId)
            : null;
        const before = captureEnhancementAssetRuntimeState(player);
        const previousSuppress = player?.suppressImmediateDomainPersistence;
        if (durableEnabled) {
            player.enhancementDurableCommitInFlight = true;
            player.suppressImmediateDomainPersistence = true;
        }
        try {
            const result = startQueuedActivity();
            if (!result?.ok || !player?.enhancementJob) {
                return result;
            }
            await self.commitEnhancementActiveJobWithAssets(player, 'start', null, {
                allowSuppressed: durableEnabled,
                presence: durablePresence,
                expectedQueueHeadId: normalizeText(queueHead.queueId) || null,
            });
            return result;
        }
        catch (error) {
            self.restoreEnhancementAssetRuntimeState(player, before);
            throw error;
        }
        finally {
            if (durableEnabled) {
                player.suppressImmediateDomainPersistence = previousSuppress;
                player.enhancementDurableCommitInFlight = false;
            }
        }
}

export async function cancelEnhancementDurablyImpl(self: CraftPanelRuntimeService, player, deps = null) {
        return self.runExclusivePlayerAssetMutation(
            player,
            () => self.cancelEnhancementDurablyLocked(player, deps),
        );
}

export async function cancelEnhancementDurablyLockedImpl(self: CraftPanelRuntimeService, player, deps = null) {
        if (player?.enhancementDurableCommitInFlight === true || player?.suppressImmediateDomainPersistence === true) {
            return buildCraftMutationResult('强化状态正在同步，请稍后重试。');
        }
        const durableEnabled = self.shouldUseDurableEnhancementPersistence(player);
        const durablePresence = durableEnabled
            ? await self.resolveDurablePresenceFence(player.playerId)
            : null;
        const before = captureEnhancementAssetRuntimeState(player);
        const expectedJob = player?.enhancementJob ? { ...player.enhancementJob } : null;
        const previousSuppress = player?.suppressImmediateDomainPersistence;
        player.suppressImmediateDomainPersistence = true;
        if (durableEnabled) {
            player.enhancementDurableCommitInFlight = true;
        }
        try {
            const result = self.cancelTechniqueActivity(player, 'enhancement', deps);
            if (!result?.ok || !expectedJob) {
                return result;
            }
            await self.commitEnhancementActiveJobWithAssets(player, 'cancelled', expectedJob, {
                allowSuppressed: durableEnabled,
                presence: durablePresence,
            });
            return result;
        }
        catch (error) {
            self.restoreEnhancementAssetRuntimeState(player, before);
            throw error;
        }
        finally {
            player.suppressImmediateDomainPersistence = previousSuppress;
            if (durableEnabled) {
                player.enhancementDurableCommitInFlight = false;
            }
        }
}

export function tickEnhancementDurablyImpl(
    self: CraftPanelRuntimeService,
    player,
    deps = null,
    recordSectionDuration: CraftRuntimeSectionRecorder = null,
) {
        if (self.isPlayerSessionFenceSuperseded(player)) {
            return buildSupersededCraftTickResult();
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        const runWhileAssetIdle = self.playerRuntimeService?.tryRunSynchronousPlayerMutationWhileAssetIdle;
        const stateGuarded = player?.enhancementDurableCommitInFlight === true
            || player?.suppressImmediateDomainPersistence === true;
        const progressOnly = Boolean(playerId && !stateGuarded && isEnhancementProgressOnlyTick(player));
        if (
            progressOnly
            && typeof runWhileAssetIdle === 'function'
        ) {
            let progressResult: any = null;
            const executed = runWhileAssetIdle.call(self.playerRuntimeService, playerId, () => {
                progressResult = self.tickEnhancementProgressOnly(player, deps);
            });
            if (executed) {
                return progressResult;
            }
        }
        recordCraftRuntimeCount(
            recordSectionDuration,
            stateGuarded
                ? 'instance.craftJob.enhancementAsyncStateGuard'
                : progressOnly
                    ? typeof runWhileAssetIdle === 'function'
                        ? 'instance.craftJob.enhancementAsyncQueueBusy'
                        : 'instance.craftJob.enhancementAsyncUnsupported'
                    : 'instance.craftJob.enhancementAsyncSettlement',
        );
        const queueStartedAt = beginCraftRuntimeSection(recordSectionDuration);
        let actionCompletedAt: number | null = null;
        const pendingResult = self.runExclusivePlayerAssetMutation(
            player,
            async () => {
                recordCraftRuntimeSection(
                    recordSectionDuration,
                    'instance.craftJob.enhancementAssetQueueWaitMs',
                    queueStartedAt,
                );
                try {
                    return await self.tickEnhancementDurablyLocked(player, deps, recordSectionDuration);
                }
                finally {
                    actionCompletedAt = performance.now();
                }
            },
        );
        return Promise.resolve(pendingResult).finally(() => {
            recordCraftRuntimeSection(
                recordSectionDuration,
                'instance.craftJob.enhancementCoordinatorFinalizeMs',
                actionCompletedAt,
            );
        });
}

export function tickEnhancementProgressOnlyImpl(self: CraftPanelRuntimeService, player, deps = null) {
        const before = captureEnhancementProgressRuntimeState(player);
        const expectedJobRunId = player?.enhancementJob?.jobRunId;
        const previousSuppress = player?.suppressImmediateDomainPersistence;
        player.suppressImmediateDomainPersistence = true;
        try {
            const result: any = self.tickTechniqueActivity(player, 'enhancement', deps);
            if (result && typeof result.then === 'function') {
                throw new Error('enhancement_progress_tick_must_be_synchronous');
            }
            const violatesProgressBoundary = Boolean(
                !result?.ok
                || result.inventoryChanged
                || result.equipmentChanged
                || result.attrChanged
                || Number(result.craftRealmExpGain) > 0
                || !player?.enhancementJob
                || player.enhancementJob.jobRunId !== expectedJobRunId,
            );
            if (violatesProgressBoundary) {
                throw new Error('enhancement_progress_tick_crossed_asset_boundary');
            }
            self.queueEnhancementActiveJobFlush(player, previousSuppress);
            return result;
        }
        catch (error) {
            restoreEnhancementProgressRuntimeState(player, before);
            throw error;
        }
        finally {
            player.suppressImmediateDomainPersistence = previousSuppress;
        }
}

export async function tickEnhancementDurablyLockedImpl(
    self: CraftPanelRuntimeService,
    player,
    deps = null,
    recordSectionDuration: CraftRuntimeSectionRecorder = null,
) {
        if (player?.enhancementDurableCommitInFlight === true || player?.suppressImmediateDomainPersistence === true) {
            return buildCraftTickResult();
        }
        const durableEnabled = self.shouldUseDurableEnhancementPersistence(player);
        const before = captureEnhancementAssetRuntimeState(player);
        const expectedJob = player?.enhancementJob ? { ...player.enhancementJob } : null;
        let attemptedSessionFence = capturePlayerSessionFence(player);
        const previousSuppress = player?.suppressImmediateDomainPersistence;
        if (durableEnabled) {
            player.enhancementDurableCommitInFlight = true;
            player.suppressImmediateDomainPersistence = true;
        }
        try {
            const runtimeResolveStartedAt = beginCraftRuntimeSection(recordSectionDuration);
            let result: any;
            try {
                result = self.tickTechniqueActivity(player, 'enhancement', deps);
            }
            finally {
                recordCraftRuntimeSection(
                    recordSectionDuration,
                    'instance.craftJob.enhancementRuntimeResolveMs',
                    runtimeResolveStartedAt,
                );
            }
            if (!result?.ok) {
                return result;
            }
            const hasAssetBoundary = Boolean(
                result.inventoryChanged
                || result.equipmentChanged
                || !player?.enhancementJob
                || player.enhancementJob?.jobRunId !== expectedJob?.jobRunId,
            );
            if (expectedJob && hasAssetBoundary) {
                const presenceFenceStartedAt = beginCraftRuntimeSection(recordSectionDuration);
                let durablePresence = null;
                try {
                    durablePresence = durableEnabled
                        ? await self.resolveDurablePresenceFence(player.playerId, recordSectionDuration)
                        : null;
                }
                finally {
                    recordCraftRuntimeSection(
                        recordSectionDuration,
                        'instance.craftJob.enhancementPresenceFenceMs',
                        presenceFenceStartedAt,
                    );
                }
                if (durablePresence) {
                    attemptedSessionFence = {
                        runtimeOwnerId: durablePresence.runtimeOwnerId,
                        sessionEpoch: durablePresence.sessionEpoch,
                    };
                }
                await self.commitEnhancementActiveJobWithAssets(player, !player?.enhancementJob ? 'completed' : 'tick', expectedJob, {
                    allowSuppressed: durableEnabled,
                    presence: durablePresence,
                    beforeState: before,
                    recordSectionDuration,
                });
            } else if (expectedJob && player?.enhancementJob) {
                self.queueEnhancementActiveJobFlush(player, previousSuppress);
            }
            return result;
        }
        catch (error) {
            self.restoreEnhancementAssetRuntimeState(player, before);
            if (
                isConvergedPlayerPresenceFenceError(error)
                || isSupersededPlayerAssetFenceError(error)
            ) {
                const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
                self.markPlayerSessionFenceSuperseded(player, attemptedSessionFence);
                self.logger.debug(
                    `强化 tick 已让位于更新会话：playerId=${playerId || 'unknown'} expectedSessionEpoch=${attemptedSessionFence.sessionEpoch}`,
                );
                return buildSupersededCraftTickResult();
            }
            throw error;
        }
        finally {
            if (durableEnabled) {
                player.suppressImmediateDomainPersistence = previousSuppress;
                player.enhancementDurableCommitInFlight = false;
            }
        }
}

export function queueEnhancementActiveJobFlushImpl(self: CraftPanelRuntimeService, player, previousSuppress = false) {
        if (!player?.enhancementJob) {
            return;
        }
        self.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job']);
        void previousSuppress;
}

export async function commitEnhancementActiveJobWithAssetsImpl(
    self: CraftPanelRuntimeService,
    player,
    action,
    expectedJob = null,
    options: {
        allowSuppressed?: boolean;
        presence?: { runtimeOwnerId: string; sessionEpoch: number } | null;
        expectedQueueHeadId?: string | null;
        beforeState?: ReturnType<typeof captureEnhancementAssetRuntimeState> | null;
        recordSectionDuration?: CraftRuntimeSectionRecorder;
    } = {},
) {
        if (!self.shouldUseDurableEnhancementPersistence(player, options)) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            throw new Error('强化强事务提交失败：缺少玩家 ID');
        }
        const presence = options.presence ?? await self.resolveDurablePresenceFence(playerId);
        const payloadBuildStartedAt = beginCraftRuntimeSection(options.recordSectionDuration ?? null);
        const advancedPatch = action === 'tick' && options.beforeState
            ? buildEnhancementAdvancedAssetPatch(playerId, options.beforeState, player)
            : null;
        const snapshot = advancedPatch
            ? null
            : self.playerRuntimeService.buildPersistenceSnapshot?.(
                playerId,
                new Set(['inventory', 'wallet', 'equipment', 'profession', 'active_job', 'enhancement_record']),
            );
        if (!advancedPatch && !snapshot) {
            throw new Error(`强化强事务提交失败：无法构建玩家快照 playerId=${playerId}`);
        }
        const inventoryItems = advancedPatch?.nextInventoryItems
            ?? buildDurableInventoryItemsFromSnapshot(snapshot);
        const walletBalances = advancedPatch?.nextWalletBalances
            ?? buildDurableWalletBalancesFromSnapshot(snapshot);
        const equipmentSlots = advancedPatch ? null : buildDurableEquipmentSlotsFromSnapshot(snapshot);
        const enhancementRecords = advancedPatch?.nextEnhancementRecords
            ?? buildDurableEnhancementRecordsFromEntries(playerId, player.enhancementRecords ?? []);
        const professionStates = advancedPatch?.nextProfessionStates
            ?? buildDurableProfessionStatesFromSnapshot(snapshot);
        const activeJob = buildActiveJobSnapshotFromPlayer(player);
        const jobRunId = typeof expectedJob?.jobRunId === 'string'
            ? expectedJob.jobRunId
            : typeof player?.enhancementJob?.jobRunId === 'string'
            ? player.enhancementJob.jobRunId
            : null;
        const jobVersion = Math.max(1, Math.trunc(Number(
            expectedJob?.jobVersion
                ?? player?.enhancementJob?.jobVersion
                ?? 1,
        )));
        const snapshotRevision = Number.isFinite(Number(player?.persistentRevision))
            ? Math.trunc(Number(player.persistentRevision))
            : null;
        recordCraftRuntimeSection(
            options.recordSectionDuration ?? null,
            'instance.craftJob.enhancementPayloadBuildMs',
            payloadBuildStartedAt,
        );
        const durableCommitStartedAt = beginCraftRuntimeSection(options.recordSectionDuration ?? null);
        try {
            if (action === 'start') {
                if (!activeJob) {
                    throw new Error(`强化强事务启动失败：缺少 active job playerId=${playerId}`);
                }
                await self.durableOperationService.startActiveJobWithAssets({
                    operationId: `enhancement:start:${playerId}:${activeJob.jobRunId}:${activeJob.jobVersion}`,
                    playerId,
                    expectedRuntimeOwnerId: presence.runtimeOwnerId,
                    expectedSessionEpoch: presence.sessionEpoch,
                    nextInventoryItems: inventoryItems,
                    nextWalletBalances: walletBalances,
                    nextActiveJob: activeJob,
                    nextEnhancementRecords: enhancementRecords,
                    ...(options.expectedQueueHeadId ? {
                        expectedQueueHeadId: options.expectedQueueHeadId,
                        nextTechniqueActivityQueue: buildTechniqueActivityQueueSnapshotFromPlayer(player),
                    } : {}),
                });
            }
            else if (action === 'cancelled') {
                if (!jobRunId) {
                    throw new Error(`强化强事务取消失败：缺少 jobRunId playerId=${playerId}`);
                }
                await self.durableOperationService.cancelActiveJobWithAssets({
                    operationId: `enhancement:cancelled:${playerId}:${jobRunId}:${jobVersion}`,
                    playerId,
                    expectedRuntimeOwnerId: presence.runtimeOwnerId,
                    expectedSessionEpoch: presence.sessionEpoch,
                    expectedJobRunId: jobRunId,
                    expectedJobVersion: jobVersion,
                    nextInventoryItems: inventoryItems,
                    nextWalletBalances: walletBalances,
                    nextEquipmentSlots: equipmentSlots,
                    nextEnhancementRecords: enhancementRecords,
                });
            }
            else {
                if (!jobRunId) {
                    throw new Error(`强化强事务完成失败：缺少 jobRunId playerId=${playerId}`);
                }
                await self.durableOperationService.completeActiveJobWithAssets({
                    operationId: `enhancement:${action}:${playerId}:${jobRunId}:${jobVersion}`,
                    playerId,
                    expectedRuntimeOwnerId: presence.runtimeOwnerId,
                    expectedSessionEpoch: presence.sessionEpoch,
                    expectedJobRunId: jobRunId,
                    expectedJobVersion: jobVersion,
                    nextInventoryItems: inventoryItems,
                    nextWalletBalances: walletBalances,
                    nextEquipmentSlots: equipmentSlots,
                    nextEnhancementRecords: enhancementRecords,
                    nextProfessionStates: professionStates,
                    nextActiveJob: activeJob,
                    completionKind: resolveEnhancementDurableCompletionKind(action, player, jobRunId, expectedJob),
                    ...(advancedPatch ? {
                        assetWriteMode: 'patch' as const,
                        removedInventoryItemInstanceIds: advancedPatch.removedInventoryItemInstanceIds,
                        removedWalletTypes: advancedPatch.removedWalletTypes,
                    } : {}),
                    recordSectionDuration: options.recordSectionDuration,
                });
            }
        }
        finally {
            recordCraftRuntimeSection(
                options.recordSectionDuration ?? null,
                'instance.craftJob.enhancementDurableCommitMs',
                durableCommitStartedAt,
            );
        }
        const markPersistedStartedAt = beginCraftRuntimeSection(options.recordSectionDuration ?? null);
        const persistedDomains = new Set<string>(['active_job']);
        if (!advancedPatch || advancedPatch.nextInventoryItems.length > 0 || advancedPatch.removedInventoryItemInstanceIds.length > 0) {
            persistedDomains.add('inventory');
        }
        if (!advancedPatch || advancedPatch.nextWalletBalances.length > 0 || advancedPatch.removedWalletTypes.length > 0) {
            persistedDomains.add('wallet');
        }
        if (!advancedPatch) {
            persistedDomains.add('equipment');
        }
        if (!advancedPatch || advancedPatch.nextEnhancementRecords.length > 0) {
            persistedDomains.add('enhancement_record');
        }
        if (action !== 'start' && action !== 'cancelled') {
            persistedDomains.add('profession');
        }
        self.playerRuntimeService.markPersisted?.(
            playerId,
            persistedDomains,
            snapshotRevision,
        );
        recordCraftRuntimeSection(
            options.recordSectionDuration ?? null,
            'instance.craftJob.enhancementMarkPersistedMs',
            markPersistedStartedAt,
        );
}

export function markPlayerSessionFenceSupersededImpl(self: CraftPanelRuntimeService, player, expectedFence) {
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId || !player || typeof player !== 'object') {
            return false;
        }
        const normalizedExpectedFence = normalizePlayerSessionFence(expectedFence);
        const currentFence = capturePlayerSessionFence(player);
        if (!isSamePlayerSessionFence(currentFence, normalizedExpectedFence)) {
            // 本地会话已经先一步换代；不登记旧 fence，避免抑制新会话。
            return false;
        }
        self.supersededPlayerSessionFences.set(player, normalizedExpectedFence);
        return true;
}

export function isPlayerSessionFenceSupersededImpl(self: CraftPanelRuntimeService, player) {
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId || !player || typeof player !== 'object') {
            return false;
        }
        const expectedFence = self.supersededPlayerSessionFences.get(player);
        if (!expectedFence) {
            return false;
        }
        const currentFence = capturePlayerSessionFence(player);
        if (!isSamePlayerSessionFence(currentFence, expectedFence)) {
            self.supersededPlayerSessionFences.delete(player);
            return false;
        }
        return true;
}

export function shouldUseDurableEnhancementPersistenceImpl(self: CraftPanelRuntimeService, player, options: { allowSuppressed?: boolean } = {}) {
        return Boolean(
            (options?.allowSuppressed === true || player?.suppressImmediateDomainPersistence !== true)
            && self.durableOperationService
            && typeof self.durableOperationService.isEnabled === 'function'
            && self.durableOperationService.isEnabled(),
        );
}

export async function runExclusivePlayerAssetMutationImpl(self: CraftPanelRuntimeService, player, action) {
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        const coordinator = self.playerRuntimeService?.runExclusiveAssetMutation;
        if (!playerId || typeof coordinator !== 'function') {
            return await action();
        }
        return coordinator.call(self.playerRuntimeService, [playerId], action, {
            deferAssetStatisticsUntilSuccess: true,
        });
}

export async function resolveDurablePresenceFenceImpl(
    self: CraftPanelRuntimeService,
    playerId,
    recordSectionDuration: CraftRuntimeSectionRecorder = null,
) {
        const describeStartedAt = beginCraftRuntimeSection(recordSectionDuration);
        let presence = self.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
        recordCraftRuntimeSection(
            recordSectionDuration,
            'instance.craftJob.enhancementPresenceDescribeMs',
            describeStartedAt,
        );
        if (
            (!presence?.runtimeOwnerId || !presence?.sessionEpoch)
            && typeof self.playerRuntimeService.ensureRuntimeOwnershipClaimed === 'function'
        ) {
            const claimStartedAt = beginCraftRuntimeSection(recordSectionDuration);
            try {
                await self.playerRuntimeService.ensureRuntimeOwnershipClaimed(playerId);
                presence = self.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
            }
            finally {
                recordCraftRuntimeSection(
                    recordSectionDuration,
                    'instance.craftJob.enhancementPresenceClaimMs',
                    claimStartedAt,
                );
            }
        }
        if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
            throw new Error(`强化强事务提交失败：缺少运行态所有权围栏 playerId=${playerId}`);
        }
        const player = self.playerRuntimeService.getPlayer?.(playerId) ?? null;
        const presenceDirty = player?.dirtyDomains instanceof Set && player.dirtyDomains.has('presence');
        const presencePersisted = !presenceDirty
            && self.playerRuntimeService.isPersistenceDomainPersisted?.(playerId, 'presence') === true;
        recordCraftRuntimeCount(
            recordSectionDuration,
            presenceDirty
                ? 'instance.craftJob.enhancementPresenceDirty'
                : 'instance.craftJob.enhancementPresenceClean',
        );
        if (
            !presencePersisted
            && self.playerDomainPersistenceService?.isEnabled?.()
            && typeof self.playerDomainPersistenceService.savePlayerPresence === 'function'
        ) {
            const presenceSnapshotRevision = self.playerRuntimeService.getPersistenceRevision?.(playerId) ?? null;
            const presenceDomainRevision = self.playerRuntimeService.getPersistenceDomainRevision?.(
                playerId,
                'presence',
            ) ?? null;
            const persistStartedAt = beginCraftRuntimeSection(recordSectionDuration);
            try {
                await self.playerDomainPersistenceService.savePlayerPresence(playerId, {
                    ...presence,
                    versionSeed: nextPlayerPersistenceVersion(),
                });
            }
            finally {
                recordCraftRuntimeSection(
                    recordSectionDuration,
                    'instance.craftJob.enhancementPresencePersistMs',
                    persistStartedAt,
                );
            }
            if (
                Number.isFinite(Number(presenceSnapshotRevision))
                && Number.isFinite(Number(presenceDomainRevision))
                && Number(presenceDomainRevision) > 0
                && self.playerRuntimeService.getPersistenceDomainRevision?.(playerId, 'presence') === presenceDomainRevision
                && typeof self.playerRuntimeService.markPersisted === 'function'
            ) {
                self.playerRuntimeService.markPersisted(
                    playerId,
                    new Set(['presence']),
                    Math.trunc(Number(presenceSnapshotRevision)),
                );
            }
        }
        else if (presencePersisted) {
            recordCraftRuntimeCount(
                recordSectionDuration,
                'instance.craftJob.enhancementPresenceSkip',
            );
        }
        return {
            runtimeOwnerId: String(presence.runtimeOwnerId),
            sessionEpoch: Math.max(1, Math.trunc(Number(presence.sessionEpoch))),
        };
}

export function restoreEnhancementAssetRuntimeStateImpl(self: CraftPanelRuntimeService, player, snapshot) {
        restoreEnhancementAssetRuntimeState(player, snapshot);
        self.playerRuntimeService.playerProgressionService?.refreshPreview?.(player);
        self.playerRuntimeService.playerAttributesService?.recalculate?.(player, 'craft_settlement');
        self.playerRuntimeService.rebuildActionState?.(player, 0);
}

export function validateEnhancementStartImpl(self: CraftPanelRuntimeService, player, payload) {
        self.ensureCraftSkills(player);
        const target = self.resolveEnhancementTarget(player, payload?.target);
        if (!target) {
            return { ok: false, error: '强化目标不存在。' };
        }
        if (target.ref.source === 'equipment') {
            return { ok: false, error: '身上装备不能直接强化，请先卸下放入背包。' };
        }
        if ((target as Record<string, unknown>).mismatched) {
            return { ok: false, error: '强化目标已变更，请重新选择。' };
        }
        if (!isEnhanceableItem(target.item)) {
            return { ok: false, error: '当前仅支持强化装备或法宝。' };
        }
        const currentLevel = normalizeEnhanceLevel(target.item.enhanceLevel);
        if (currentLevel >= MAX_ENHANCE_LEVEL) {
            return { ok: false, error: `该目标已达到强化上限 +${MAX_ENHANCE_LEVEL}。` };
        }
        const targetLevel = currentLevel + 1;
        const desiredTargetLevel = self.resolveRequestedTargetLevel(currentLevel, payload?.targetLevel);
        const config = self.enhancementConfigs.get(target.item.itemId);
        const protection = payload?.protection
            ? self.resolveEnhancementProtection(player, payload.protection, target, config)
            : null;
        if (payload?.protection && !protection) {
            return { ok: false, error: '保护物不存在或不符合本次强化规则。' };
        }
        const materials = self.getEnhancementRequirements(config, targetLevel);
        const protectionStartLevel = protection
            ? self.resolveProtectionStartLevel(desiredTargetLevel, payload?.protectionStartLevel)
            : undefined;
        const spiritStoneCost = getEnhancementSpiritStoneCost(target.item.level, materials.length > 0);
        return {
            ok: true,
            validated: {
                payload,
                target,
                currentLevel,
                targetLevel,
                desiredTargetLevel,
                config,
                protection,
                materials,
                protectionStartLevel,
                spiritStoneCost,
                jobRunId: createCraftJobRunId(player.playerId, 'enhancement'),
            },
        };
}

export function queueEnhancementStartImpl(self: CraftPanelRuntimeService, player, validated, payload) {
        if (!self.hasAnyActiveTechniqueActivity(player)) {
            return null;
        }
        return self.enqueueCraftQueueItem(
            player,
            buildEnhancementQueueItem(
                validated.target,
                validated.protection,
                payload,
                validated.desiredTargetLevel,
                self.resolveEnhancementItemBaseDisplayName(validated.target.item),
            ),
            normalizeCraftQueueStartMode(payload?.queueMode),
        );
}

export function consumeEnhancementStartResourcesImpl(self: CraftPanelRuntimeService, player, validated) {
        const target = validated.target;
        const protectionRequired = self.shouldUseProtectionForStep(validated.targetLevel, validated.protectionStartLevel);
        if (!self.hasEnoughEnhancementResources(player, target, validated.protection, validated.spiritStoneCost, validated.materials, protectionRequired)) {
            return { ok: false, error: '所需灵石、材料或保护物不足。' };
        }
        const workingItem = target.ref.source === 'inventory'
            ? extractInventoryItemByInstanceId(player, target.ref.itemInstanceId)
            : extractEquipmentItem(player, target.ref.slot);
        if (!workingItem) {
            return { ok: false, error: '强化目标不存在。' };
        }
        assignItemInstanceIdIfNeeded(workingItem as ItemStack);
        const workingInstanceId = typeof (workingItem as ItemStack).itemInstanceId === 'string'
            ? (workingItem as ItemStack).itemInstanceId
            : '';
        if (!workingInstanceId) {
            return { ok: false, error: '强化目标缺失实例标识。' };
        }
        for (const material of validated.materials) {
            consumeInventoryItemByItemId(player, material.itemId, material.count);
        }
        if (!Array.isArray(player.inventory.lockedItems)) {
            player.inventory.lockedItems = [];
        }
        (workingItem as ItemStack).enhanceLevel = validated.currentLevel;
        (workingItem as ItemStack).count = 1;
        lockItem(player.inventory.lockedItems, workingItem as unknown as Record<string, unknown>, `enhancement:${validated.jobRunId}`);
        validated.workingItem = workingItem;
        validated.workingInstanceId = workingInstanceId;
        return { ok: true };
}

export function createEnhancementStartJobImpl(self: CraftPanelRuntimeService, player, validated) {
        const target = validated.target;
        const roleEnhancementLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        const craftEffectStats = self.getCraftEffectStats(player);
        const totalSpeedRate = computeEnhancementToolSpeedRate(craftEffectStats.enhancement.speedRate, roleEnhancementLevel, target.item.level);
        const successRate = computeEnhancementAdjustedSuccessRate(validated.targetLevel, roleEnhancementLevel, target.item.level, craftEffectStats.enhancement.successRate, self.getLuckSuccessRateBonus(player));
        const totalTicks = computeEnhancementJobTicks(target.item.level, totalSpeedRate);
        const protectionItemId = validated.protection ? (validated.config?.protectionItemId ?? target.item.itemId) : undefined;
        const protectionItemName = protectionItemId
            ? resolvePlayerFacingContentName(protectionItemId, '未知物品', self.contentTemplateRepository.getItemName(protectionItemId))
            : undefined;
        const protectionItemSignature = validated.protection
            ? createItemStackSignature(validated.protection.item)
            : undefined;
        const targetItemName = self.resolveEnhancementItemBaseDisplayName(target.item);
        player.enhancementJob = {
            jobRunId: validated.jobRunId,
            jobType: 'enhancement',
            target: cloneTargetRef(target.ref),
            itemInstanceId: validated.workingInstanceId,
            targetItemId: target.item.itemId,
            targetItemName,
            targetItemLevel: Math.max(1, Math.floor(Number(target.item.level) || 1)),
            currentLevel: validated.currentLevel,
            targetLevel: validated.targetLevel,
            desiredTargetLevel: validated.desiredTargetLevel,
            spiritStoneCost: validated.spiritStoneCost,
            materials: validated.materials.map((entry) => ({ ...entry })),
            protectionUsed: Boolean(validated.protection),
            protectionStartLevel: validated.protectionStartLevel,
            protectionItemId,
            protectionItemName,
            protectionItemSignature,
            phase: 'enhancing',
            pausedTicks: 0,
            workTotalTicks: totalTicks,
            workRemainingTicks: totalTicks,
            interruptWaitRemainingTicks: 0,
            interruptState: null,
            successRate,
            totalTicks,
            remainingTicks: totalTicks,
            startedAt: Date.now(),
            roleEnhancementLevel,
            totalSpeedRate,
            jobVersion: 1,
        };
        self.recordEnhancementStart(player, {
            itemId: target.item.itemId,
            itemName: targetItemName,
            actionStartedAt: player.enhancementJob.startedAt,
            startLevel: validated.currentLevel,
            initialTargetLevel: validated.targetLevel,
            desiredTargetLevel: validated.desiredTargetLevel,
            protectionStartLevel: validated.protectionStartLevel,
            status: 'in_progress',
        });
        return player.enhancementJob;
}

export function finalizeEnhancementStartImpl(self: CraftPanelRuntimeService, player) {
        self.finalizeMutation(player, {
            inventoryChanged: true,
            persistentOnly: true,
            dirtyDomains: ['active_job', 'enhancement_record'],
        });
}

export function buildEnhancementStartMessagesImpl(self: CraftPanelRuntimeService, validated, job) {
        if (validated.desiredTargetLevel > validated.targetLevel && validated.protection) {
            return [{
                kind: 'enhancement',
                key: 'notice.craft.enhancement.start-chain-protected',
                vars: {
                    itemName: job.targetItemName,
                    targetLevel: validated.targetLevel,
                    desiredTargetLevel: validated.desiredTargetLevel,
                    protectionStartLevel: validated.protectionStartLevel,
                },
                pills: [{ key: 'itemName', style: 'target' }],
            }];
        }
        if (validated.desiredTargetLevel > validated.targetLevel) {
            return [{
                kind: 'enhancement',
                key: 'notice.craft.enhancement.start-chain',
                vars: {
                    itemName: job.targetItemName,
                    targetLevel: validated.targetLevel,
                    desiredTargetLevel: validated.desiredTargetLevel,
                },
                pills: [{ key: 'itemName', style: 'target' }],
            }];
        }
        return [{
            kind: 'enhancement',
            key: 'notice.craft.enhancement.start',
            vars: {
                itemName: job.targetItemName,
                targetLevel: validated.targetLevel,
                totalTicks: job.totalTicks,
            },
            pills: [{ key: 'itemName', style: 'target' }],
        }];
}

export function resolveEnhancementItemBaseDisplayNameImpl(self: CraftPanelRuntimeService, item) {
        const itemId = typeof item?.itemId === 'string' ? item.itemId.trim() : '';
        const itemName = typeof item?.name === 'string' ? item.name.trim() : '';
        const templateName = itemId ? self.contentTemplateRepository.getItemName(itemId) : null;
        const resolvedName = resolvePlayerFacingContentName(itemId, '未知物品', itemName, templateName);
        return getItemDisplayName({
            itemId,
            name: resolvedName,
            enhanceLevel: 0,
        });
}

export function startEnhancementImpl(self: CraftPanelRuntimeService, player, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return self.startTechniqueActivity(player, 'enhancement', payload);
}

export function cancelEnhancementImpl(self: CraftPanelRuntimeService, player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        self.ensureCraftSkills(player);
        const job = player.enhancementJob;
        if (!job || job.remainingTicks <= 0) {
            return buildCraftMutationResult('当前没有可取消的强化任务。');
        }
        self.playerRuntimeService.captureOfflineGainBeforeTick?.(player);
        const finishResult = self.finishEnhancementJob(player, job.currentLevel, 'cancelled');
        const result = {
            ok: true,
            panelChanged: true,
            inventoryChanged: finishResult.inventoryChanged,
            equipmentChanged: finishResult.equipmentChanged,
            attrChanged: finishResult.attrChanged,
            groundDrops: finishResult.groundDrops,
            messages: [{
                    kind: 'system',
                    text: `你停止了 ${job.targetItemName} 的强化，已投入的本阶材料不会退回；保护物仅在失败且保护生效时扣除，灵石将在本阶成功后结算。`,
                }],
        };
        self.recordTechniqueActivityStatisticMutation(player, result);
        return result;
}

export function interruptEnhancementImpl(self: CraftPanelRuntimeService, player, reason) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return self.interruptTechniqueActivity(player, 'enhancement', reason);
}

export function tickEnhancementImpl(self: CraftPanelRuntimeService, player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return self.tickTechniqueActivity(player, 'enhancement');
}

export function hasEquippedHammerImpl(self: CraftPanelRuntimeService, player) {
        return Boolean(self.getEnhancementToolItem(player)?.tags?.includes(ENHANCEMENT_HAMMER_TAG));
}

export function collectEnhancementCandidatesImpl(self: CraftPanelRuntimeService, player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const candidates = [];
        player.inventory.items.forEach((item) => {
            assignItemInstanceIdIfNeeded(item);
            const itemInstanceId = normalizeInventoryItemInstanceId(item?.itemInstanceId);
            if (!itemInstanceId) {
                return;
            }
            const normalizedItem = self.normalizeEnhancementInventoryItem(item);
            const candidate = self.buildEnhancementCandidate(player, { source: 'inventory', itemInstanceId }, normalizedItem);
            if (candidate) {
                candidates.push(candidate);
            }
        });
        candidates.sort((left, right) => {
            if (left.item.level !== right.item.level) {
                return left.item.level - right.item.level;
            }
            if (left.currentLevel !== right.currentLevel) {
                return left.currentLevel - right.currentLevel;
            }
            return left.item.itemId.localeCompare(right.item.itemId, 'zh-Hans-CN');
        });
        return candidates;
}

export function buildEnhancementCandidateImpl(self: CraftPanelRuntimeService, player, ref, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!isEnhanceableItem(item)) {
            return null;
        }
        const currentLevel = normalizeEnhanceLevel(item.enhanceLevel);
        if (currentLevel >= MAX_ENHANCE_LEVEL) {
            return null;
        }
        const nextLevel = currentLevel + 1;
        const craftEffectStats = self.getCraftEffectStats(player);
        const enhancementSkillLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        const config = self.enhancementConfigs.get(item.itemId);
        const requirements = self.getEnhancementRequirements(config, nextLevel);
        const totalSpeedRate = computeEnhancementToolSpeedRate(craftEffectStats.enhancement.speedRate, enhancementSkillLevel, item.level);
        return {
            ref,
            item: cloneItem(item),
            currentLevel,
            nextLevel,
            spiritStoneCost: getEnhancementSpiritStoneCost(item.level, requirements.length > 0),
            successRate: computeEnhancementAdjustedSuccessRate(nextLevel, enhancementSkillLevel, item.level, craftEffectStats.enhancement.successRate, self.getLuckSuccessRateBonus(player)),
            durationTicks: computeEnhancementJobTicks(item.level, totalSpeedRate),
            materials: requirements.map((entry) => ({
                itemId: entry.itemId,
                name: resolvePlayerFacingContentName(entry.itemId, '未知物品', self.contentTemplateRepository.getItemName(entry.itemId)),
                count: entry.count,
                ownedCount: countInventoryItem(player, entry.itemId),
            })),
            protectionItemId: config?.protectionItemId,
            protectionItemName: config?.protectionItemId
                ? resolvePlayerFacingContentName(config.protectionItemId, '未知物品', self.contentTemplateRepository.getItemName(config.protectionItemId))
                : undefined,
            allowSelfProtection: !config?.protectionItemId,
            protectionCandidates: self.buildProtectionCandidates(player, ref, item, config),
        };
}

export function buildProtectionCandidatesImpl(self: CraftPanelRuntimeService, player, ref, item, config) {
        const candidates = [];
        const targetProtectionItemId = config?.protectionItemId ?? item.itemId;
        const targetInstanceId = ref.source === 'inventory' ? normalizeInventoryItemInstanceId(ref.itemInstanceId) : '';
        player.inventory.items.forEach((entry) => {
            if (!entry || !self.isEligibleProtectionItem(entry, targetProtectionItemId, item.itemId)) {
                return;
            }
            assignItemInstanceIdIfNeeded(entry);
            const itemInstanceId = normalizeInventoryItemInstanceId(entry.itemInstanceId);
            if (!itemInstanceId) {
                return;
            }
            if (targetInstanceId && itemInstanceId === targetInstanceId) {
                const entryCount = Math.max(0, Math.floor(Number(entry.count) || 0));
                if (entryCount < 2) {
                    return;
                }
                const cloned = cloneItem(entry);
                cloned.count = entryCount - 1;
                candidates.push({ ref: { source: 'inventory', itemInstanceId }, item: cloned });
                return;
            }
            candidates.push({
                ref: { source: 'inventory', itemInstanceId },
                item: cloneItem(entry),
            });
        });
        return candidates;
}

export function getEnhancementRequirementsImpl(self: CraftPanelRuntimeService, config, targetLevel) {
        const step = config?.steps.find((entry) => entry.targetEnhanceLevel === targetLevel);
        return (step?.materials ?? []).map((entry) => ({ ...entry }));
}

export function getEnhancementToolItemImpl(self: CraftPanelRuntimeService, player) {
        const tool = self.getEquippedItem(player, 'technique_enhancement');
        if (tool?.tags?.includes(ENHANCEMENT_HAMMER_TAG)) {
            return tool;
        }
        const legacyWeapon = self.getEquippedItem(player, 'weapon');
        return legacyWeapon?.tags?.includes(ENHANCEMENT_HAMMER_TAG) ? legacyWeapon : null;
}

export function resolveRequestedTargetLevelImpl(self: CraftPanelRuntimeService, currentLevel, requestedTargetLevel) {
        const normalized = Math.floor(Number(requestedTargetLevel) || 0);
        return Math.min(MAX_ENHANCE_LEVEL, Math.max(currentLevel + 1, normalized || (currentLevel + 1)));
}

export function resolveProtectionStartLevelImpl(self: CraftPanelRuntimeService, desiredTargetLevel, requestedProtectionStartLevel) {
        const normalized = Math.floor(Number(requestedProtectionStartLevel) || 0);
        return Math.max(2, Math.min(desiredTargetLevel, normalized || 2));
}

export function shouldUseProtectionForStepImpl(self: CraftPanelRuntimeService, targetLevel, protectionStartLevel) {
        return typeof protectionStartLevel === 'number' && targetLevel >= protectionStartLevel;
}

export function resolveEnhancementTargetImpl(self: CraftPanelRuntimeService, player, ref) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!ref || typeof ref !== 'object') {
            return null;
        }
        let resolved: { ref: any; item: any } | null = null;
        if (ref.source === 'inventory') {
            const directItemInstanceId = normalizeInventoryItemInstanceId(ref.itemInstanceId)
                || normalizeInventoryItemInstanceId(ref.expectedItemInstanceId);
            if (directItemInstanceId) {
                const item = findInventoryItemByInstanceId(player, directItemInstanceId);
                resolved = item ? { ref: { source: 'inventory', itemInstanceId: directItemInstanceId }, item: self.normalizeEnhancementInventoryItem(item) } : null;
            }
        } else if (ref.source === 'equipment') {
            const slot = normalizeEquipSlot(ref.slot);
            if (!slot) {
                return null;
            }
            const item = self.getEquippedItem(player, slot);
            resolved = item ? { ref: { source: 'equipment', slot }, item } : null;
        }
        if (!resolved) {
            return null;
        }
        // 乐观一致性校验：客户端选中目标时看到的 itemInstanceId
        const expected = typeof ref?.expectedItemInstanceId === 'string' && ref.expectedItemInstanceId.trim().length > 0
            ? ref.expectedItemInstanceId.trim()
            : '';
        const actual = typeof resolved.item.itemInstanceId === 'string' ? resolved.item.itemInstanceId : '';
        const compare = compareItemInstanceId(actual, expected);
        if (compare === 'mismatch') {
            const hardCheck = isItemInstanceIdHardCheckEnabled();
            self.logger.warn(
                `enhancement target itemInstanceId mismatch player=${player.playerId} `
                + `expected=${expected} actual=${actual} ref=${JSON.stringify(ref)} `
                + `hardCheck=${hardCheck}`,
            );
            if (hardCheck) {
                return { mismatched: true } as unknown as ReturnType<typeof self.resolveEnhancementTarget>;
            }
        }
        return resolved;
}

export function resolveEnhancementProtectionImpl(self: CraftPanelRuntimeService, player, ref, target, config) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!ref || ref.source !== 'inventory') {
            return null;
        }
        const protection = self.resolveEnhancementTarget(player, ref);
        if (!protection || protection.ref.source !== 'inventory') {
            return null;
        }
        const expectedItemId = config?.protectionItemId ?? target.item.itemId;
        if (!self.isEligibleProtectionItem(protection.item, expectedItemId, target.item.itemId)) {
            return null;
        }
        if (target.ref.source === 'inventory'
            && normalizeInventoryItemInstanceId(protection.ref.itemInstanceId) === normalizeInventoryItemInstanceId(target.ref.itemInstanceId)
            && Math.max(0, Math.floor(Number(target.item.count) || 0)) < 2) {
            return null;
        }
        return protection;
}

export function touchEnhancementRecordImpl(self: CraftPanelRuntimeService, player, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const itemId = normalizeText(input.itemId);
        if (!itemId) {
            return null;
        }
        const itemName = self.resolveEnhancementRecordItemName(itemId, input);
        const existing = (player.enhancementRecords ?? []).find((entry) => entry.itemId === itemId);
        if (existing) {
            if (itemName) {
                existing.itemName = itemName;
            }
            if (Object.prototype.hasOwnProperty.call(input, 'actionStartedAt')) {
                existing.actionStartedAt = input.actionStartedAt;
            }
            if (Object.prototype.hasOwnProperty.call(input, 'startLevel')) {
                existing.startLevel = input.startLevel;
            }
            if (Object.prototype.hasOwnProperty.call(input, 'initialTargetLevel')) {
                existing.initialTargetLevel = input.initialTargetLevel;
            }
            if (Object.prototype.hasOwnProperty.call(input, 'desiredTargetLevel')) {
                existing.desiredTargetLevel = input.desiredTargetLevel;
            }
            if (Object.prototype.hasOwnProperty.call(input, 'protectionStartLevel')) {
                existing.protectionStartLevel = input.protectionStartLevel;
            }
            if (Object.prototype.hasOwnProperty.call(input, 'status')) {
                existing.status = input.status;
            }
            self.playerRuntimeService.markPersistenceDirtyDomains(player, ['enhancement_record']);
            return existing;
        }
        const created = {
            itemId,
            itemName,
            highestLevel: Math.max(0, Number(input.startLevel) || 0),
            levels: [],
            actionStartedAt: input.actionStartedAt,
            startLevel: input.startLevel,
            initialTargetLevel: input.initialTargetLevel,
            desiredTargetLevel: input.desiredTargetLevel,
            protectionStartLevel: input.protectionStartLevel,
            status: input.status,
        };
        player.enhancementRecords.push(created);
        self.playerRuntimeService.markPersistenceDirtyDomains(player, ['enhancement_record']);
        return created;
}

export function resolveEnhancementRecordItemNameImpl(self: CraftPanelRuntimeService, itemId, input = {}) {
        const recordInput = input as { itemName?: unknown };
        return itemId
            ? resolvePlayerFacingContentName(
                itemId,
                '未知物品',
                recordInput.itemName,
                self.contentTemplateRepository.getItemName(itemId),
            )
            : '';
}

export function touchEnhancementLevelRecordImpl(self: CraftPanelRuntimeService, player, itemId, targetLevel, success, resultingLevel) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const existing = (player.enhancementRecords ?? []).find((entry) => entry.itemId === normalizeText(itemId));
        const job = player.enhancementJob?.targetItemId === itemId ? player.enhancementJob : null;
        const record = self.touchEnhancementRecord(player, existing
            ? {
                itemId,
                itemName: job?.targetItemName,
                status: 'in_progress',
            }
            : {
                itemId,
                itemName: job?.targetItemName,
                actionStartedAt: job?.startedAt,
                startLevel: job?.currentLevel ?? 0,
                initialTargetLevel: job?.targetLevel ?? targetLevel,
                desiredTargetLevel: job?.desiredTargetLevel ?? targetLevel,
                protectionStartLevel: job?.protectionStartLevel,
                status: 'in_progress',
            });
        if (!record) {
            return;
        }
        let levelRecord = record.levels.find((entry) => entry.targetLevel === targetLevel);
        if (!levelRecord) {
            levelRecord = {
                targetLevel,
                successCount: 0,
                failureCount: 0,
            };
            record.levels.push(levelRecord);
            record.levels.sort((left, right) => left.targetLevel - right.targetLevel);
        }
        if (success) {
            levelRecord.successCount += 1;
        }
        else {
            levelRecord.failureCount += 1;
        }
        record.highestLevel = Math.max(record.highestLevel, resultingLevel);
}

export function recordEnhancementStartImpl(self: CraftPanelRuntimeService, player, input) {
        return self.touchEnhancementRecord(player, input);
}

export function recordEnhancementStepResultImpl(self: CraftPanelRuntimeService, player, job, success, resultingLevel) {
        return self.touchEnhancementLevelRecord(player, job.targetItemId, job.targetLevel, success, resultingLevel);
}

export function completeEnhancementRecordImpl(self: CraftPanelRuntimeService, player, job, resultingLevel, status) {
        const record = (player.enhancementRecords ?? []).find((entry) => entry.itemId === job.targetItemId);
        if (!record) {
            return null;
        }
        record.actionEndedAt = Date.now();
        record.status = status;
        record.highestLevel = Math.max(record.highestLevel, resultingLevel);
        self.playerRuntimeService.markPersistenceDirtyDomains(player, ['enhancement_record']);
        return record;
}

export function advanceEnhancementJobImpl(self: CraftPanelRuntimeService, player, currentLevel) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const job = player.enhancementJob;
        if (!job || currentLevel >= job.desiredTargetLevel) {
            return null;
        }
        const nextTargetLevel = currentLevel + 1;
        const config = self.enhancementConfigs.get(job.targetItemId);
        const nextMaterials = self.getEnhancementRequirements(config, nextTargetLevel);
        const nextSpiritStoneCost = getEnhancementSpiritStoneCost(job.targetItemLevel, nextMaterials.length > 0);
        const protectionItemId = self.shouldUseProtectionForStep(nextTargetLevel, job.protectionStartLevel)
            ? (config?.protectionItemId ?? job.targetItemId)
            : undefined;
        if (!self.hasEnoughQueuedEnhancementResources(player, protectionItemId, job.targetItemId, nextSpiritStoneCost, nextMaterials)) {
            const finishResult = self.finishEnhancementJob(player, currentLevel, 'stopped');
            return {
                continued: false,
                inventoryChanged: finishResult.inventoryChanged,
                equipmentChanged: finishResult.equipmentChanged,
                attrChanged: finishResult.attrChanged,
                groundDrops: finishResult.groundDrops,
                messages: [{
                        kind: 'system',
                        key: 'notice.craft.enhancement.advance-resources-missing',
                        vars: {
                            itemName: job.targetItemName,
                            currentLevel,
                        },
                        pills: [{ key: 'itemName', style: 'target' }],
                    }],
            };
        }
        for (const material of nextMaterials) {
            consumeInventoryItemByItemId(player, material.itemId, material.count);
        }
        const roleEnhancementLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        const craftEffectStats = self.getCraftEffectStats(player);
        const totalSpeedRate = computeEnhancementToolSpeedRate(craftEffectStats.enhancement.speedRate, roleEnhancementLevel, job.targetItemLevel);
        const totalTicks = computeEnhancementJobTicks(job.targetItemLevel, totalSpeedRate);
        const lockedEntry = getLockedItem(player.inventory.lockedItems ?? [], job.itemInstanceId);
        if (!lockedEntry) {
            const finishResult = self.finishEnhancementJob(player, currentLevel, 'stopped');
            return {
                continued: false,
                inventoryChanged: finishResult.inventoryChanged,
                equipmentChanged: finishResult.equipmentChanged,
                attrChanged: finishResult.attrChanged,
                groundDrops: finishResult.groundDrops,
                messages: [{
                        kind: 'system',
                        key: 'notice.craft.enhancement.advance-missing-target',
                        vars: { itemName: job.targetItemName },
                        pills: [{ key: 'itemName', style: 'target' }],
                    }],
            };
        }
        // 锁定空间中的物品就是真源；把当前实际等级写回，下一阶段以此为基础结算
        (lockedEntry as unknown as ItemStack).enhanceLevel = currentLevel;
        (lockedEntry as unknown as ItemStack).count = 1;
        job.currentLevel = currentLevel;
        job.targetLevel = nextTargetLevel;
        job.spiritStoneCost = nextSpiritStoneCost;
        job.materials = nextMaterials.map((entry) => ({ ...entry }));
        job.phase = 'enhancing';
        job.pausedTicks = 0;
        job.interruptWaitRemainingTicks = 0;
        job.interruptState = null;
        job.successRate = computeEnhancementAdjustedSuccessRate(nextTargetLevel, roleEnhancementLevel, job.targetItemLevel, craftEffectStats.enhancement.successRate, self.getLuckSuccessRateBonus(player));
        job.totalTicks = totalTicks;
        job.remainingTicks = totalTicks;
        job.workTotalTicks = totalTicks;
        job.workRemainingTicks = totalTicks;
        job.startedAt = Date.now();
        job.roleEnhancementLevel = roleEnhancementLevel;
        job.totalSpeedRate = totalSpeedRate;
        self.finalizeMutation(player, {
            inventoryChanged: true,
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return {
            continued: true,
            inventoryChanged: true,
            equipmentChanged: false,
            attrChanged: false,
            messages: [{
                    kind: 'enhancement',
                    key: 'notice.craft.enhancement.advance-continue',
                    vars: {
                        itemName: job.targetItemName,
                        currentLevel,
                        nextTargetLevel,
                    },
                    pills: [{ key: 'itemName', style: 'target' }],
                }],
        };
}

export function finishEnhancementJobImpl(self: CraftPanelRuntimeService, player, resultingLevel, status) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const job = player.enhancementJob;
        if (!job) {
            return {
                inventoryChanged: false,
                equipmentChanged: false,
                attrChanged: false,
                groundDrops: [],
            };
        }
        if (!Array.isArray(player.inventory.lockedItems)) {
            player.inventory.lockedItems = [];
        }
        // 通过 itemInstanceId 从锁定空间取出真源工件；不再走 fallback 重建
        const lockedRaw = job.itemInstanceId
            ? unlockItem(player.inventory.lockedItems, job.itemInstanceId)
            : null;
        if (!lockedRaw) {
            // 极端兜底：锁定空间已不存在该工件（异常恢复 / 老存档），仍要清掉 job 防止卡死
            // 同时清理可能残留的同 jobRunId 孤儿锁定项
            const jobRunId = job.jobRunId;
            const orphanKey = `enhancement:${jobRunId}`;
            const before = player.inventory.lockedItems.length;
            player.inventory.lockedItems = player.inventory.lockedItems.filter(
                (e) => e.lockedBy !== orphanKey,
            );
            const cleaned = before !== player.inventory.lockedItems.length;
            self.completeEnhancementRecord(player, job, resultingLevel, status);
            player.enhancementJob = null;
            self.finalizeMutation(player, {
                inventoryChanged: cleaned,
                persistentOnly: true,
                dirtyDomains: [
                    'active_job',
                    'enhancement_record',
                ],
            });
            return {
                inventoryChanged: cleaned,
                equipmentChanged: false,
                attrChanged: false,
                groundDrops: [],
            };
        }
        // 把目标等级写回真源后还原成普通 ItemStack 形态
        (lockedRaw as unknown as ItemStack).enhanceLevel = resultingLevel;
        const itemFields = lockedItemToItemStack(lockedRaw);
        const resolvedItem = self.contentTemplateRepository.normalizeItem({
            ...itemFields,
            count: 1,
            enhanceLevel: resultingLevel,
        });
        // normalize 后兜底分配 instanceId（理论上 locked 物必然已带）
        assignItemInstanceIdIfNeeded(resolvedItem);
        // unlockItem 已移除 lockedItems 条目 → inventory 域必然脏
        let inventoryChanged = true;
        let equipmentChanged = false;
        let attrChanged = false;
        const targetSlot = job.target?.source === 'equipment' ? job.target.slot : null;
        const slotEntry = targetSlot
            ? player.equipment?.slots?.find((current) => current.slot === targetSlot)
            : null;
        const slotIsEmpty = Boolean(slotEntry) && !slotEntry.item;
        const slotMatchesInstance = Boolean(slotEntry?.item)
            && typeof slotEntry.item.itemInstanceId === 'string'
            && slotEntry.item.itemInstanceId === resolvedItem.itemInstanceId;
        if (targetSlot && (slotIsEmpty || slotMatchesInstance)) {
            // 装备来源：原槽仍空（启动时取走）或仍是同一实例 → 写回装备槽
            setEquippedItem(player, targetSlot, resolvedItem);
            equipmentChanged = true;
            attrChanged = true;
        }
        else {
            // 持续任务结算与取消返还属于玩家既有资产边界，即使普通背包已满也必须强制入包。
            // receiveInventoryItem 会优先按完整堆叠签名合并；无法合并时允许暂时超过容量。
            receiveInventoryItem(player, self.contentTemplateRepository, resolvedItem);
            inventoryChanged = true;
        }
        self.completeEnhancementRecord(player, job, resultingLevel, status);
        player.enhancementJob = null;
        self.finalizeMutation(player, {
            inventoryChanged,
            equipmentChanged,
            attrChanged,
            persistentOnly: true,
            dirtyDomains: [
                'active_job',
                'enhancement_record',
            ],
        });
        if (player?.suppressImmediateDomainPersistence !== true) {
            void self.persistEnhancementRecords(player).catch((error) => {
                self.logger.warn(`强化记录直写失败，已标记脏数据等待重试：${error instanceof Error ? error.message : String(error)}`);
                self.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['enhancement_record']);
            });
        }
        return {
            inventoryChanged,
            equipmentChanged,
            attrChanged,
            groundDrops: [],
        };
}

export function hasEnoughEnhancementResourcesImpl(self: CraftPanelRuntimeService, player, target, protection, spiritStoneCost, materials, protectionRequired) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const counts = new Map();
        for (const item of player.inventory.items) {
            counts.set(item.itemId, (counts.get(item.itemId) ?? 0) + Math.max(0, Math.floor(Number(item.count) || 0)));
        }
        if (target.ref.source === 'inventory') {
            counts.set(target.item.itemId, (counts.get(target.item.itemId) ?? 0) - 1);
        }
        if (protectionRequired && protection?.ref?.source === 'inventory') {
            counts.set(protection.item.itemId, (counts.get(protection.item.itemId) ?? 0) - 1);
        }
        if (!self.playerRuntimeService.canAffordWallet(player.playerId, SPIRIT_STONE_ITEM_ID, spiritStoneCost)) {
            return false;
        }
        return materials.every((entry) => (counts.get(entry.itemId) ?? 0) >= entry.count);
}

export function hasEnoughQueuedEnhancementResourcesImpl(self: CraftPanelRuntimeService, player, protectionItemId, targetItemId, spiritStoneCost, materials) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const counts = new Map();
        for (const item of player.inventory.items) {
            counts.set(item.itemId, (counts.get(item.itemId) ?? 0) + Math.max(0, Math.floor(Number(item.count) || 0)));
        }
        if (!self.playerRuntimeService.canAffordWallet(player.playerId, SPIRIT_STONE_ITEM_ID, spiritStoneCost)) {
            return false;
        }
        if (protectionItemId && self.getEligibleProtectionCount(player, protectionItemId, targetItemId) < 1) {
            return false;
        }
        return materials.every((entry) => (counts.get(entry.itemId) ?? 0) >= entry.count);
}

export function consumeProtectionItemForFailureImpl(self: CraftPanelRuntimeService, player, job) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const protectionItemId = job.protectionItemId ?? job.targetItemId;
        if (job.protectionItemSignature
            && self.consumeInventoryItemByPredicate(player, (item) => createItemStackSignature(item) === job.protectionItemSignature, 1)) {
            return true;
        }
        return self.consumeInventoryItemByPredicate(player, (item) => self.isEligibleProtectionItem(item, protectionItemId, job.targetItemId), 1);
}

export function consumeInventoryItemByPredicateImpl(self: CraftPanelRuntimeService, player, predicate, count) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let remaining = Math.max(0, Math.floor(Number(count) || 0));
        if (remaining <= 0) {
            return true;
        }
        for (let slotIndex = player.inventory.items.length - 1; slotIndex >= 0 && remaining > 0; slotIndex -= 1) {
            const item = player.inventory.items[slotIndex];
            if (!item || !predicate(item)) {
                continue;
            }
            const consumed = Math.min(remaining, Math.max(0, Math.floor(Number(item.count) || 0)));
            item.count -= consumed;
            remaining -= consumed;
            if (item.count <= 0) {
                player.inventory.items.splice(slotIndex, 1);
            }
        }
        return remaining <= 0;
}

export function isSelfProtectionItemImpl(self: CraftPanelRuntimeService, protectionItemId, targetItemId) {
        return protectionItemId === targetItemId;
}

export function isEligibleProtectionItemImpl(self: CraftPanelRuntimeService, item, protectionItemId, targetItemId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!item || item.itemId !== protectionItemId) {
            return false;
        }
        if (!self.isSelfProtectionItem(protectionItemId, targetItemId)) {
            return true;
        }
        return isEnhanceableItem(item) && normalizeEnhanceLevel(item.enhanceLevel) === 0;
}

export function getEligibleProtectionCountImpl(self: CraftPanelRuntimeService, player, protectionItemId, targetItemId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let total = 0;
        for (const item of player.inventory.items) {
            if (!self.isEligibleProtectionItem(item, protectionItemId, targetItemId)) {
                continue;
            }
            total += Math.max(0, Math.floor(Number(item.count) || 0));
        }
        return total;
}

export async function persistEnhancementRecordsImpl(self: CraftPanelRuntimeService, player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (isFlushTaskConsumerMode()) {
            return;
        }
        if (!self.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        // 运行时记录使用 `levels` 字段，DB 列为 `levels_payload` 且 NOT NULL；
        // 必须先归一为 EnhancementRecordRow 形态，否则 levels_payload undefined 会触发非空约束违反。
        const rows = buildEnhancementRecordRowsFromEntries(playerId, player.enhancementRecords ?? []);
        await self.playerDomainPersistenceService.savePlayerEnhancementRecords(playerId, rows, {
            versionSeed: nextPlayerPersistenceVersion(),
        });
}

