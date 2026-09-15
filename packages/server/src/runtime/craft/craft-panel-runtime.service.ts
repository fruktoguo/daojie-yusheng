/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ALCHEMY_FURNACE_OUTPUT_COUNT, ARTIFACT_CRAFT_BASE_SUCCESS_RATE, ELEMENT_KEYS, EQUIP_SLOTS, ENHANCEMENT_HAMMER_TAG, ENHANCEMENT_SPIRIT_STONE_ITEM_ID, MAX_ENHANCE_LEVEL, TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH, TECHNIQUE_GRADE_ORDER, addCraftElementVector, applyCraftOutputRate, canMergeItemStack, cloneCraftEffectStats, compactCraftElementVector, computeAlchemyAdjustedBrewTicks, computeAlchemyAdjustedSuccessRate, computeAlchemyBatchOutputCountWithSize, computeAlchemyBrewTicks, computeAlchemyRawBrewTicks, computeAlchemyTotalJobTicks, computeEnhancementAdjustedSuccessRate, computeEnhancementJobTicks, computeEnhancementToolSpeedRate, computeFivePhaseElementMatch, computeLuckSuccessRateBonus, createEmptyCraftElementVector, createItemStackSignature, getAlchemySpiritStoneCost, getItemDisplayName, isLegacyItemInstanceId, normalizeCraftEffectStatsPatch, normalizeCraftElementVector, resolvePlayerFacingContentName } from '@mud/shared';
import type { ItemStack } from '@mud/shared';
import { assignItemInstanceIdIfNeeded, compareItemInstanceId, isItemInstanceIdHardCheckEnabled } from '../world/item-instance-id.helpers';
import { lockItem, unlockItem, getLockedItem, lockedItemToItemStack } from '../player/inventory-lock.helpers';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import {
    PlayerDomainPersistenceService,
    buildEnhancementRecordRowsFromEntries,
    nextPlayerPersistenceVersion,
    type PlayerTechniqueActivityQueueUpsertInput,
    isConvergedPlayerProjectionFenceError,
    isConvergedPlayerPresenceFenceError,
    isSupersededPlayerAssetFenceError,
} from '../../persistence/player-domain-persistence.service';
import { PlayerPersistenceFlushService } from '../../persistence/player-persistence-flush.service';
import { isFlushTaskConsumerMode } from '../../persistence/flush-task-runtime-mode';
import type { TechniqueActivityQueueReorderAction } from '@mud/shared';
import { DurableOperationService, type DurableProfessionStateSnapshot } from '../../persistence/durable-operation.service';
import { resolveProjectPath } from '../../common/project-path';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { CraftPanelAlchemyQueryService, buildForgingAlchemyPanelState } from './craft-panel-alchemy-query.service';
import { ALCHEMY_CATALOG_VERSION, ALCHEMY_FURNACE_TAG, cloneAlchemyJob } from './craft-panel-alchemy-query.helpers';
import { CraftPanelEnhancementQueryService } from './craft-panel-enhancement-query.service';
import { advanceTechniqueActivityPause, bumpTechniqueActivityJobVersion, hasTechniqueActivityJob, listRuntimeTechniqueActivityKinds } from './technique-activity-runtime.helpers';
import { DEFAULT_CRAFT_EXP_TO_NEXT, resolveCraftSkillExpToNextByLevel, resolveInitialCraftSkillExpToNext } from './craft-skill-exp.helpers';
import { TechniqueActivityPipelineService } from './pipeline/technique-activity-pipeline.service';
import { AlchemyStrategy } from './pipeline/strategies/alchemy.strategy';
import { ForgingStrategy } from './pipeline/strategies/forging.strategy';
import { EnhancementStrategy } from './pipeline/strategies/enhancement.strategy';
import { TransmissionStrategy } from './pipeline/strategies/transmission.strategy';
import { GatherStrategy } from './pipeline/strategies/gather.strategy';
import { BuildingStrategy } from './pipeline/strategies/building.strategy';
import { FormationStrategy } from './pipeline/strategies/formation.strategy';
import { MiningStrategy } from './pipeline/strategies/mining.strategy';
import { isEnhancementProgressOnlyTick } from './pipeline/strategies/enhancement-tick.helpers';
import { resolvePlayerEffectiveLuck } from '../player/player-special-stat.helpers';
import { resolvePlayerCraftRealmLevel } from './craft-effect-runtime.helpers';
import {
    buildTechniqueActivityTaskListView,
    buildTechniqueActivityTaskPatchView,
} from './technique-activity-task-view.helpers';
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
import {
    startEnhancementDurablyImpl,
    startEnhancementDurablyLockedImpl,
    startQueuedEnhancementDurablyImpl,
    startQueuedEnhancementDurablyLockedImpl,
    cancelEnhancementDurablyImpl,
    cancelEnhancementDurablyLockedImpl,
    tickEnhancementDurablyImpl,
    tickEnhancementProgressOnlyImpl,
    tickEnhancementDurablyLockedImpl,
    queueEnhancementActiveJobFlushImpl,
    commitEnhancementActiveJobWithAssetsImpl,
    markPlayerSessionFenceSupersededImpl,
    isPlayerSessionFenceSupersededImpl,
    shouldUseDurableEnhancementPersistenceImpl,
    runExclusivePlayerAssetMutationImpl,
    resolveDurablePresenceFenceImpl,
    restoreEnhancementAssetRuntimeStateImpl,
    validateEnhancementStartImpl,
    queueEnhancementStartImpl,
    consumeEnhancementStartResourcesImpl,
    createEnhancementStartJobImpl,
    finalizeEnhancementStartImpl,
    buildEnhancementStartMessagesImpl,
    resolveEnhancementItemBaseDisplayNameImpl,
    startEnhancementImpl,
    cancelEnhancementImpl,
    interruptEnhancementImpl,
    tickEnhancementImpl,
    collectEnhancementCandidatesImpl,
    buildEnhancementCandidateImpl,
    buildProtectionCandidatesImpl,
    getEnhancementRequirementsImpl,
    getEnhancementToolItemImpl,
    resolveRequestedTargetLevelImpl,
    resolveProtectionStartLevelImpl,
    shouldUseProtectionForStepImpl,
    resolveEnhancementTargetImpl,
    resolveEnhancementProtectionImpl,
    touchEnhancementRecordImpl,
    resolveEnhancementRecordItemNameImpl,
    touchEnhancementLevelRecordImpl,
    recordEnhancementStartImpl,
    recordEnhancementStepResultImpl,
    completeEnhancementRecordImpl,
    advanceEnhancementJobImpl,
    finishEnhancementJobImpl,
    hasEnoughEnhancementResourcesImpl,
    hasEnoughQueuedEnhancementResourcesImpl,
    consumeProtectionItemForFailureImpl,
    consumeInventoryItemByPredicateImpl,
    isSelfProtectionItemImpl,
    isEligibleProtectionItemImpl,
    getEligibleProtectionCountImpl,
    persistEnhancementRecordsImpl,
    hasEquippedHammerImpl,
} from './craft-panel-runtime.enhancement';
import {
    validateAlchemyLikeStartImpl,
    queueAlchemyLikeStartImpl,
    consumeAlchemyLikeStartResourcesImpl,
    validateAlchemyLikeBatchResourcesImpl,
    consumeAlchemyLikeBatchResourcesImpl,
    resolveAlchemyLikeBatchSpiritStoneCostImpl,
    isAlchemyLikePerBatchResourceJobImpl,
    markAlchemyLikePerBatchResourceJobImpl,
    computeLegacyAlchemyLikePrepaidRefundImpl,
    ensureAlchemyLikeJobResourceCompatibilityImpl,
    createAlchemyLikeStartJobImpl,
    finalizeAlchemyLikeStartImpl,
    buildAlchemyLikeStartMessagesImpl,
    startAlchemyImpl,
    startForgingImpl,
    cancelAlchemyImpl,
    cancelForgingImpl,
    saveAlchemyPresetImpl,
    deleteAlchemyPresetImpl,
    interruptAlchemyImpl,
    getAlchemyLikeActiveJobImpl,
    ensureAlchemyLikeActiveJobResourceCompatibilityMutationImpl,
    setAlchemyLikeActiveJobImpl,
    advanceAlchemyLikePausedJobImpl,
    resolveAlchemyLikeBatchSuccessImpl,
    buildAlchemyLikeBatchResolveResultImpl,
    buildAlchemyLikeExpParamsImpl,
    completeAlchemyLikeJobImpl,
    buildAlchemyLikeCompletionMessageImpl,
    buildAlchemyLikeBatchMessageImpl,
    buildAlchemyLikeTickResultImpl,
    tickAlchemyImpl,
    getAlchemyLikeToolSpeedRateImpl,
    getAlchemyLikeToolSuccessRateImpl,
    getAlchemyLikeToolOutputRateImpl,
    getLuckSuccessRateBonusImpl,
    resolveAlchemyLikeCurrentSuccessRateImpl,
    refreshAlchemyLikeActiveJobSuccessRateImpl,
    getAlchemyLikeToolItemImpl,
} from './craft-panel-runtime.alchemy-like';

/** 强化与炼丹计算中固定使用的灵石物品 ID。 */
export const SPIRIT_STONE_ITEM_ID = ENHANCEMENT_SPIRIT_STONE_ITEM_ID;
/** 炼丹/炼器资源扣除策略版本：每批完成结算前扣除一批。 */
export const ALCHEMY_LIKE_RESOURCE_CONSUMPTION_MODE_PER_BATCH = 'perBatchOnResolve';
export const ALCHEMY_LIKE_RESOURCE_CONSUMPTION_VERSION = 2;

/** 制作运行时服务：负责炼丹与强化的任务创建、进度推进与结果落库。 */
@Injectable()
export class CraftPanelRuntimeService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * playerDomainPersistenceService：玩家分域持久化服务引用。
 */

    playerDomainPersistenceService;
    /**
 * craftPanelAlchemyQueryService：炼制面板炼丹Query服务引用。
 */

    craftPanelAlchemyQueryService;
    /**
 * craftPanelEnhancementQueryService：炼制面板强化Query服务引用。
 */

    craftPanelEnhancementQueryService;
    /**
 * durableOperationService：高风险资产操作强事务服务引用。
 */

    durableOperationService;
    /** 玩家分域立即刷盘服务，用于收敛技艺任务生命周期边界。 */
    playerPersistenceFlushService;
    /** 运行时日志器，记录炼丹、强化与配置加载问题。 */
    logger = new Logger(CraftPanelRuntimeService.name);
    /** 缓存炼丹目录，供面板快照和任务校验共用。 */
    alchemyCatalog = [];
    /** 缓存炼器目录，复用炼丹制造公式但输出器物。 */
    forgingCatalog = [];
    /** 缓存强化配置，避免每次操作都重新查表。 */
    enhancementConfigs = new Map();
    /** 已被更高 session 接管的玩家 fence；只抑制相同旧 fence，新的本地会话会自动恢复 tick。 */
    readonly supersededPlayerSessionFences = new WeakMap<object, {
        runtimeOwnerId: string | null;
        sessionEpoch: number;
    }>();
    /** 技艺管线服务。 */
    pipeline: TechniqueActivityPipelineService | null = null;
    /** 缓存依赖并初始化日志、配方与强化配置。 */
    constructor(
        contentTemplateRepository: ContentTemplateRepository,
        playerRuntimeService: PlayerRuntimeService,
        playerDomainPersistenceService: PlayerDomainPersistenceService,
        craftPanelAlchemyQueryService: CraftPanelAlchemyQueryService,
        craftPanelEnhancementQueryService: CraftPanelEnhancementQueryService,
        @Optional() @Inject(DurableOperationService) durableOperationService: DurableOperationService | null = null,
        @Optional() @Inject(PlayerPersistenceFlushService) playerPersistenceFlushService: PlayerPersistenceFlushService | null = null,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
        this.craftPanelAlchemyQueryService = craftPanelAlchemyQueryService;
        this.craftPanelEnhancementQueryService = craftPanelEnhancementQueryService;
        this.durableOperationService = durableOperationService;
        this.playerPersistenceFlushService = playerPersistenceFlushService;
    }
    /** 模块初始化：按需加载炼丹目录和强化配置。 */
    onModuleInit() {
        this.loadAlchemyCatalog();
        this.loadForgingCatalog();
        this.loadEnhancementConfigs();
        this.ensurePipelineInitialized();
    }
    /** 读取炼丹面板的状态和可见目录，同步客户端所需的数据快照。 */
    buildAlchemyPanelPayload(player, knownCatalogVersion) {
        this.ensureCraftSkills(player);
        this.refreshAlchemyLikeActiveJobSuccessRate(player, 'alchemy');
        return this.craftPanelAlchemyQueryService.buildAlchemyPanelPayload(
            player,
            knownCatalogVersion,
            this.alchemyCatalog,
            this.getAlchemyLikeToolItem(player, 'alchemy'),
            this.getCraftEffectStats(player),
        );
    }
    /** 读取炼丹面板运行态增量，高频刷新不重复下发目录和预设。 */
    buildAlchemyPanelPatchPayload(player) {
        this.ensureCraftSkills(player);
        this.refreshAlchemyLikeActiveJobSuccessRate(player, 'alchemy');
        return this.craftPanelAlchemyQueryService.buildAlchemyPanelPatchPayload(player, 'alchemy');
    }
    /** 读取炼器面板状态，复用炼丹面板结构但返回炼器目录。 */
    buildForgingPanelPayload(player, knownCatalogVersion) {
        this.ensureCraftSkills(player);
        this.refreshAlchemyLikeActiveJobSuccessRate(player, 'forging');
        const payload = {
            ...this.craftPanelAlchemyQueryService.buildAlchemyPanelPayload(
                player,
                knownCatalogVersion,
                this.forgingCatalog,
                this.getAlchemyLikeToolItem(player, 'forging'),
                this.getCraftEffectStats(player),
            ),
            kind: 'forging',
        };
        if (payload.state) {
            payload.state = {
                ...buildForgingAlchemyPanelState(
                    player,
                    this.getAlchemyLikeToolItem(player, 'forging'),
                    this.getCraftEffectStats(player),
                ),
            };
        }
        return payload;
    }
    /** 读取炼器面板运行态增量，高频刷新不重复下发目录和预设。 */
    buildForgingPanelPatchPayload(player) {
        this.ensureCraftSkills(player);
        this.refreshAlchemyLikeActiveJobSuccessRate(player, 'forging');
        return this.craftPanelAlchemyQueryService.buildAlchemyPanelPatchPayload(player, 'forging');
    }
    /** 读取强化面板状态并在未装备强化锤时返回错误。 */
    buildEnhancementPanelPayload(player) {
        this.ensureCraftSkills(player);
        return this.craftPanelEnhancementQueryService.buildEnhancementPanelPayload(player, this.enhancementConfigs);
    }
    /** 读取强化面板运行态增量，高频刷新不重复下发候选与历史。 */
    buildEnhancementPanelPatchPayload(player) {
        this.ensureCraftSkills(player);
        return this.craftPanelEnhancementQueryService.buildEnhancementPanelPatchPayload(player);
    }
    /** 按 activity kind 统一返回技艺面板载荷。 */
    buildTechniqueActivityPanelPayload(player, kind, knownCatalogVersion) {
        if (kind === 'alchemy') {
            return this.buildAlchemyPanelPayload(player, knownCatalogVersion);
        }
        if (kind === 'forging') {
            return this.buildForgingPanelPayload(player, knownCatalogVersion);
        }
        if (kind === 'enhancement') {
            return this.buildEnhancementPanelPayload(player);
        }
        return null;
    }
    /**
     * 构建服务端主动触发的面板状态刷新。
     * 静态目录只响应客户端显式请求；装备和运行时变更不得重复夹带目录。
     */
    buildTechniqueActivityPanelRefreshPayload(player, kind) {
        if (kind === 'alchemy' || kind === 'forging') {
            return this.buildTechniqueActivityPanelPayload(player, kind, ALCHEMY_CATALOG_VERSION);
        }
        return this.buildTechniqueActivityPanelPayload(player, kind, undefined);
    }
    /** 按 activity kind 统一返回技艺面板运行态增量。 */
    buildTechniqueActivityPanelPatchPayload(player, kind) {
        if (kind === 'alchemy') {
            return this.buildAlchemyPanelPatchPayload(player);
        }
        if (kind === 'forging') {
            return this.buildForgingPanelPatchPayload(player);
        }
        if (kind === 'enhancement') {
            return this.buildEnhancementPanelPatchPayload(player);
        }
        return this.buildTechniqueActivityPanelPayload(player, kind, { patch: true });
    }
    /** 构建统一技艺任务列表完整同步。 */
    buildTechniqueActivityTaskListPayload(player, serverTick) {
        return buildTechniqueActivityTaskListView(
            player,
            serverTick,
            (itemId) => this.contentTemplateRepository.getItemName(itemId),
        );
    }
    /** 构建统一技艺任务列表运行态 patch。 */
    buildTechniqueActivityTaskPatchPayload(player, serverTick) {
        return buildTechniqueActivityTaskPatchView(
            player,
            serverTick,
            (itemId) => this.contentTemplateRepository.getItemName(itemId),
        );
    }
    /** 判断玩家当前是否有炼丹任务在进行。 */
    hasActiveAlchemyJob(player) {
        return player.alchemyJob?.jobType !== 'forging' && hasTechniqueActivityJob(player.alchemyJob);
    }
    /** 判断玩家当前是否有炼器任务在进行。 */
    hasActiveForgingJob(player) {
        return hasTechniqueActivityJob(player.forgingJob)
            || (player.alchemyJob?.jobType === 'forging' && hasTechniqueActivityJob(player.alchemyJob));
    }
    /** 判断玩家当前是否有强化任务在进行。 */
    hasActiveEnhancementJob(player) {
        return hasTechniqueActivityJob(player.enhancementJob);
    }
    /** 判断指定技艺活动当前是否仍处于进行中。 */
    hasActiveTechniqueActivity(player, kind) {
        if (kind === 'alchemy') {
            return this.hasActiveAlchemyJob(player);
        }
        if (kind === 'forging') {
            return this.hasActiveForgingJob(player);
        }
        if (kind === 'enhancement') {
            return this.hasActiveEnhancementJob(player);
        }
        if (kind === 'transmission') {
            return hasTechniqueActivityJob(player.transmissionJob);
        }
        if (kind === 'formation') {
            return hasTechniqueActivityJob(player.formationJob);
        }
        if (kind === 'gather') {
            return hasTechniqueActivityJob(player.gatherJob);
        }
        if (kind === 'building') {
            return hasTechniqueActivityJob(player.buildingJob);
        }
        if (kind === 'mining') {
            return hasTechniqueActivityJob(player.miningJob);
        }
        return false;
    }
    /** 返回当前玩家仍在运行中的技艺活动键。 */
    listActiveTechniqueActivityKinds(player) {
        return listRuntimeTechniqueActivityKinds()
            .filter((kind) => this.hasActiveTechniqueActivity(player, kind));
    }
    /** 返回所有仍占用 job 槽的技艺活动，包含 remainingTicks 已归零的僵死任务。 */
    listCancelableTechniqueActivityKinds(player) {
        return listRuntimeTechniqueActivityKinds()
            .filter((kind) => hasCancelableTechniqueActivityJob(player, kind));
    }
    /** 将历史上寄生在炼丹槽的炼器任务迁回独立槽，供 tick 与统一取消生命周期复用。 */
    normalizeLegacyForgingJobSlot(player) {
        if (player?.alchemyJob?.jobType !== 'forging') {
            return false;
        }
        player.forgingJob = player.alchemyJob;
        player.alchemyJob = null;
        this.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return true;
    }
    /** 判断任一制造型技艺是否正在占用任务槽。 */
    hasAnyActiveTechniqueActivity(player) {
        return this.listActiveTechniqueActivityKinds(player).length > 0;
    }
    /** 统一派发技艺活动的开始写路径。 */
    startTechniqueActivity(player, kind, payload, deps = null) {
        this.ensurePipelineInitialized();
        if (this.pipeline?.hasStrategy(kind)) {
            const ctx = this.buildPipelineContext(deps);
            this.playerRuntimeService.captureOfflineGainBeforeTick?.(player);
            const result = this.pipeline.start(player, kind, payload, ctx);
            this.recordTechniqueActivityStatisticMutation(player, result);
            return result;
        }
        return buildCraftMutationResult(`unsupported technique activity kind: ${kind}`);
    }
    /** 线上强化启动入口：运行态变更成功后必须同步提交强事务，失败则回滚本次运行态变更。 */
        async startEnhancementDurably(player, payload, deps = null) {
        return startEnhancementDurablyImpl(this, player, payload, deps);
    }
        async startEnhancementDurablyLocked(player, payload, deps = null) {
        return startEnhancementDurablyLockedImpl(this, player, payload, deps);
    }
    /** 队列头强化的出队、扣料、锁定与 durable start 必须处于同一个玩家资产串行区。 */
        async startQueuedEnhancementDurably(player, startQueuedActivity, deps = null) {
        return startQueuedEnhancementDurablyImpl(this, player, startQueuedActivity, deps);
    }
        async startQueuedEnhancementDurablyLocked(player, startQueuedActivity, deps = null) {
        return startQueuedEnhancementDurablyLockedImpl(this, player, startQueuedActivity, deps);
    }
    /** 统一派发技艺活动的取消写路径。 */
    cancelTechniqueActivity(player, kind, deps = null) {
        this.ensurePipelineInitialized();
        if (this.pipeline?.hasStrategy(kind)) {
            const ctx = this.buildPipelineContext(deps);
            this.playerRuntimeService.captureOfflineGainBeforeTick?.(player);
            const result = this.pipeline.cancel(player, kind, ctx);
            this.recordTechniqueActivityStatisticMutation(player, result);
            return result;
        }
        return buildCraftMutationResult(`unsupported technique activity kind: ${kind}`);
    }
    /** 线上强化取消入口：释放锁定装备和清理 active_job 必须同批强事务提交。 */
        async cancelEnhancementDurably(player, deps = null) {
        return cancelEnhancementDurablyImpl(this, player, deps);
    }
        async cancelEnhancementDurablyLocked(player, deps = null) {
        return cancelEnhancementDurablyLockedImpl(this, player, deps);
    }
    /** 统一派发技艺活动的中断。 */
    interruptTechniqueActivity(player, kind, reason, deps = null) {
        this.ensurePipelineInitialized();
        if (this.pipeline?.hasStrategy(kind)) {
            const ctx = this.buildPipelineContext(deps);
            this.playerRuntimeService.captureOfflineGainBeforeTick?.(player);
            const result = this.pipeline.interrupt(player, kind, reason, ctx);
            this.recordTechniqueActivityStatisticMutation(player, result);
            return result;
        }
        return buildCraftTickResult();
    }
    /** 统一派发技艺活动的 tick 推进。 */
    tickTechniqueActivity(player, kind, deps = null) {
        this.ensurePipelineInitialized();
        if (this.pipeline?.hasStrategy(kind)) {
            const ctx = this.buildPipelineContext(deps);
            this.playerRuntimeService.captureOfflineGainBeforeTick?.(player);
            const result: any = this.pipeline.tick(player, kind, ctx);
            if (result && typeof result.then === 'function') {
                return result.then((resolved) => {
                    this.recordTechniqueActivityStatisticMutation(player, resolved, true, kind);
                    return resolved;
                });
            }
            this.recordTechniqueActivityStatisticMutation(player, result, true, kind);
            return result;
        }
        return buildCraftTickResult();
    }
    /** 线上强化 tick 入口：普通进度走同步轻量段，清理 job 或回写资产仍同步提交强事务。 */
        tickEnhancementDurably(
        player,
        deps = null,
        recordSectionDuration: CraftRuntimeSectionRecorder = null,
    ) {
        return tickEnhancementDurablyImpl(this, player, deps, recordSectionDuration);
    }
    /** 强化普通进度只修改规范化 job 与 active_job 修订；异常时按轻量快照原样回滚。 */
        tickEnhancementProgressOnly(player, deps = null) {
        return tickEnhancementProgressOnlyImpl(this, player, deps);
    }
        async tickEnhancementDurablyLocked(
        player,
        deps = null,
        recordSectionDuration: CraftRuntimeSectionRecorder = null,
    ) {
        return tickEnhancementDurablyLockedImpl(this, player, deps, recordSectionDuration);
    }
    /** 强化普通进度 tick 只进入分域刷盘；资产阶段结算走压缩强事务，不按次数追加 outbox 与审计行。 */
        queueEnhancementActiveJobFlush(player, previousSuppress = false) {
        return queueEnhancementActiveJobFlushImpl(this, player, previousSuppress);
    }
    /** 对强化 tick 后的资产变更做强事务提交；中间阶段按 jobRunId 复用 durable 检查点。 */
    async commitEnhancementActiveJobWithAssets(player, action, expectedJob = null, options: {
        allowSuppressed?: boolean;
        presence?: { runtimeOwnerId: string; sessionEpoch: number } | null;
        expectedQueueHeadId?: string | null;
        beforeState?: ReturnType<typeof captureEnhancementAssetRuntimeState> | null;
        recordSectionDuration?: CraftRuntimeSectionRecorder;
    }) {
        return commitEnhancementActiveJobWithAssetsImpl(this, player, action, expectedJob, options);
    }
    /** 记录旧会话已被数据库更高 fence 接管，避免下一息重复提交同一旧 owner。 */
        markPlayerSessionFenceSuperseded(player, expectedFence): boolean {
        return markPlayerSessionFenceSupersededImpl(this, player, expectedFence);
    }
    /** 只抑制仍持有旧 fence 的玩家；本地新 session 变化后自动清除旧标记。 */
        isPlayerSessionFenceSuperseded(player): boolean {
        return isPlayerSessionFenceSupersededImpl(this, player);
    }
    shouldUseDurableEnhancementPersistence(player, options: { allowSuppressed?: boolean } = {}) {
        return shouldUseDurableEnhancementPersistenceImpl(this, player, options);
    }
    /** 强化资产边界从运行态计算到 durable 提交结束均占用玩家资产串行区。 */
        async runExclusivePlayerAssetMutation(player, action) {
        return runExclusivePlayerAssetMutationImpl(this, player, action);
    }
        async resolveDurablePresenceFence(
        playerId,
        recordSectionDuration: CraftRuntimeSectionRecorder = null,
    ) {
        return resolveDurablePresenceFenceImpl(this, playerId, recordSectionDuration);
    }
    /** 强事务失败后恢复完整强化运行态，并重建由装备/背包派生的显示与行动状态。 */
        restoreEnhancementAssetRuntimeState(player, snapshot) {
        return restoreEnhancementAssetRuntimeStateImpl(this, player, snapshot);
    }
    /** 技艺 pipeline 入口补记直接改背包/技艺经验的收支；已由玩家运行时入口记录的部分会被当前快照过滤。 */
    recordTechniqueActivityStatisticMutation(player, result, requireStatisticSignal = false, kind = null) {
        if (!result?.ok || !player) {
            return;
        }
        if (requireStatisticSignal && !hasTechniqueActivityStatisticSignal(result)) {
            return;
        }
        const beforeSnapshot = this.playerRuntimeService.captureOfflineGainBeforeTick?.(player);
        const useProgressionAndProfessionOnly = requireStatisticSignal
            && kind === 'building'
            && result.inventoryChanged !== true
            && result.equipmentChanged !== true
            && (!Array.isArray(result.groundDrops) || result.groundDrops.length === 0);
        if (useProgressionAndProfessionOnly) {
            this.playerRuntimeService.recordAssetStatisticMutation?.(
                player,
                beforeSnapshot,
                undefined,
                { progressionAndProfessionOnly: true },
            );
            return;
        }
        this.playerRuntimeService.recordAssetStatisticMutation?.(player, beforeSnapshot);
    }
    buildPipelineContext(deps = null) {
        return {
            contentTemplateRepository: this.contentTemplateRepository,
            resolveExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(this.playerRuntimeService, level),
            getInstanceRuntime: (instanceId) => typeof deps?.getInstanceRuntime === 'function' ? deps.getInstanceRuntime(instanceId) : null,
            playerRuntimeService: this.playerRuntimeService,
            deps,
        };
    }
    ensurePipelineInitialized() {
        if (this.pipeline) {
            return;
        }
        this.pipeline = new TechniqueActivityPipelineService();
        this.pipeline.register(new AlchemyStrategy(this));
        this.pipeline.register(new ForgingStrategy(this));
        this.pipeline.register(new EnhancementStrategy(this));
        this.pipeline.register(new TransmissionStrategy());
        this.pipeline.register(new GatherStrategy());
        this.pipeline.register(new MiningStrategy());
        this.pipeline.register(new BuildingStrategy());
        this.pipeline.register(new FormationStrategy());
    }
    /** 把制造任务写入当前活跃任务携带的等待队列。 */
    enqueueCraftQueueItem(player, item, mode) {
        const queued = enqueuePlayerTechniqueActivityQueueItem(player, item, mode);
        if (!queued) {
            return buildCraftMutationResult('技艺任务队列已满。');
        }
        this.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return {
            ok: true,
            panelChanged: true,
            messages: [{
                    kind: 'system',
                    key: mode === 'append'
                        ? 'notice.craft.queue.appended'
                        : mode === 'preserve'
                            ? 'notice.craft.queue.preserved'
                            : 'notice.craft.queue.replaced',
                    vars: { label: item.label },
                    pills: [{ key: 'label', style: 'target' }],
            }],
        };
    }
    /** 清空统一技艺等待队列；当前 job 必须由对应 strategy 的 cancel 生命周期处理。 */
    clearTechniqueActivityQueue(player) {
        const removedCount = Array.isArray(player?.techniqueActivityQueue)
            ? player.techniqueActivityQueue.length
            : 0;
        if (removedCount <= 0) {
            return 0;
        }
        setPlayerTechniqueActivityQueue(player, []);
        this.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return removedCount;
    }
    /** 调整统一技艺等待队列顺序；边界位置和陈旧 ID 按幂等无变化处理。 */
    reorderTechniqueActivityQueue(player, queueId, action: TechniqueActivityQueueReorderAction) {
        const changed = reorderPlayerTechniqueActivityQueueItem(player, queueId, action);
        if (!changed) {
            return {
                ok: true,
                panelChanged: false,
                messages: [],
                groundDrops: [],
            };
        }
        this.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return {
            ok: true,
            panelChanged: true,
            messages: [],
            groundDrops: [],
        };
    }
    /** 校验炼丹/炼器 start 的配方、投料和基础参数；不检查背包和钱包，避免排队任务提前要求资源。 */
        validateAlchemyLikeStart(player, payload, jobKindInput = undefined) {
        return validateAlchemyLikeStartImpl(this, player, payload, jobKindInput);
    }
    /** 活动互斥时把炼丹/炼器 start 转成统一技艺队列项。 */
        queueAlchemyLikeStart(player, validated, payload) {
        return queueAlchemyLikeStartImpl(this, player, validated, payload);
    }
    /** 真正启动炼丹/炼器 job 前只校验单批资源，实际扣除延后到每批完成结算前。 */
        consumeAlchemyLikeStartResources(player, validated) {
        return consumeAlchemyLikeStartResourcesImpl(this, player, validated);
    }
    /** 校验炼丹/炼器单批结算所需资源。 */
        validateAlchemyLikeBatchResources(player, validatedOrJob) {
        return validateAlchemyLikeBatchResourcesImpl(this, player, validatedOrJob);
    }
    /** 扣除炼丹/炼器单批结算所需资源。 */
        consumeAlchemyLikeBatchResources(player, job) {
        return consumeAlchemyLikeBatchResourcesImpl(this, player, job);
    }
    /** 解析炼丹/炼器单批灵石成本。 */
        resolveAlchemyLikeBatchSpiritStoneCost(job) {
        return resolveAlchemyLikeBatchSpiritStoneCostImpl(this, job);
    }
    /** 判断 active job 是否已经使用逐批完成前扣料语义。 */
        isAlchemyLikePerBatchResourceJob(job) {
        return isAlchemyLikePerBatchResourceJobImpl(this, job);
    }
    /** 标记炼丹/炼器 job 已迁移到逐批扣料语义，避免旧预扣返还重复执行。 */
        markAlchemyLikePerBatchResourceJob(job) {
        return markAlchemyLikePerBatchResourceJobImpl(this, job);
    }
    /** 计算旧版本启动时全量预扣的未完成批次资源返还。 */
        computeLegacyAlchemyLikePrepaidRefund(job) {
        return computeLegacyAlchemyLikePrepaidRefundImpl(this, job);
    }
    /** 兼容旧 active job：旧版启动已全量扣料，迁移时返还未完成批次资源。 */
        ensureAlchemyLikeJobResourceCompatibility(player, jobKind = 'alchemy', job = undefined) {
        return ensureAlchemyLikeJobResourceCompatibilityImpl(this, player, jobKind, job);
    }
    /** 创建炼丹/炼器 active job；资源会在每批完成结算前扣除。 */
        createAlchemyLikeStartJob(player, validated) {
        return createAlchemyLikeStartJobImpl(this, player, validated);
    }
    /** 标记炼丹/炼器 start 对 active job 的权威变更。 */
        finalizeAlchemyLikeStart(player) {
        return finalizeAlchemyLikeStartImpl(this, player);
    }
    /** 构建炼丹/炼器启动提示。 */
        buildAlchemyLikeStartMessages(validated) {
        return buildAlchemyLikeStartMessagesImpl(this, validated);
    }
    /** 提交新炼丹任务前完成装备与状态校验。 */
        startAlchemy(player, payload) {
        return startAlchemyImpl(this, player, payload);
    }
    /** 提交新炼器任务：复用炼丹成功率、加速、队列和打断规则。 */
        startForging(player, payload) {
        return startForgingImpl(this, player, payload);
    }
    /**
 * cancelAlchemy：判断cancel炼丹是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成cancel炼丹的条件判断。
 */

        cancelAlchemy(player, jobKind = 'alchemy') {
        return cancelAlchemyImpl(this, player, jobKind);
    }
    /** 取消炼器任务，退款规则与炼丹同构。 */
        cancelForging(player) {
        return cancelForgingImpl(this, player);
    }

    /**
 * saveAlchemyPreset：执行save炼丹Preset相关逻辑。
 * @param player 玩家对象。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新save炼丹Preset相关状态。
 */

        saveAlchemyPreset(player, payload) {
        return saveAlchemyPresetImpl(this, player, payload);
    }
    /**
 * deleteAlchemyPreset：处理炼丹Preset并更新相关状态。
 * @param player 玩家对象。
 * @param presetIdInput 参数说明。
 * @returns 无返回值，直接更新炼丹Preset相关状态。
 */

        deleteAlchemyPreset(player, presetIdInput) {
        return deleteAlchemyPresetImpl(this, player, presetIdInput);
    }
    /**
 * interruptAlchemy：执行interrupt炼丹相关逻辑。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新interrupt炼丹相关状态。
 */

        interruptAlchemy(player, reason, jobKind = 'alchemy') {
        return interruptAlchemyImpl(this, player, reason, jobKind);
    }
    /** 读取炼丹/炼器 active job，供 pipeline strategy 推进。 */
        getAlchemyLikeActiveJob(player, jobKind = 'alchemy') {
        return getAlchemyLikeActiveJobImpl(this, player, jobKind);
    }
    /** 启动/恢复后的轻量兼容检查：旧预扣 active job 会返还未完成批次并标记新扣料版本。 */
        ensureAlchemyLikeActiveJobResourceCompatibilityMutation(player, jobKind = 'alchemy') {
        return ensureAlchemyLikeActiveJobResourceCompatibilityMutationImpl(this, player, jobKind);
    }
    /** 设置炼丹/炼器 active job，供 pipeline strategy 在异常结算时权威清理。 */
        setAlchemyLikeActiveJob(player, jobKind = 'alchemy', job = null) {
        return setAlchemyLikeActiveJobImpl(this, player, jobKind, job);
    }
    /** 推进炼丹/炼器打断等待，只改等待状态，不修改实际工作量。 */
        advanceAlchemyLikePausedJob(player, job) {
        return advanceAlchemyLikePausedJobImpl(this, player, job);
    }
    /** 解析当前批次成功数。 */
        resolveAlchemyLikeBatchSuccess(job, successRate = undefined) {
        return resolveAlchemyLikeBatchSuccessImpl(this, job, successRate);
    }
    /** 构建炼丹/炼器批次结算 result；后续公共 pipeline 会直接消费该结构。 */
        buildAlchemyLikeBatchResolveResult(player, jobKind, job, successCount, failureCount, completed, messages) {
        return buildAlchemyLikeBatchResolveResultImpl(this, player, jobKind, job, successCount, failureCount, completed, messages);
    }
        buildAlchemyLikeExpParams(player, jobKind, job, successCount, failureCount) {
        return buildAlchemyLikeExpParamsImpl(this, player, jobKind, job, successCount, failureCount);
    }
    /** 完成炼丹/炼器 job；统一队列由 WorldRuntimeCraftTickService 在所有 active job 清空后推进。 */
        completeAlchemyLikeJob(player, jobKind, job) {
        return completeAlchemyLikeJobImpl(this, player, jobKind, job);
    }
        buildAlchemyLikeCompletionMessage(jobKind, job) {
        return buildAlchemyLikeCompletionMessageImpl(this, jobKind, job);
    }
        buildAlchemyLikeBatchMessage(jobKind, job, successCount) {
        return buildAlchemyLikeBatchMessageImpl(this, jobKind, job, successCount);
    }
        buildAlchemyLikeTickResult(panelChanged = false, messages = [], inventoryChanged = false, equipmentChanged = false, attrChanged = false, groundDrops = [], craftRealmExpGain = 0) {
        return buildAlchemyLikeTickResultImpl(this, panelChanged, messages, inventoryChanged, equipmentChanged, attrChanged, groundDrops, craftRealmExpGain);
    }
    /**
 * tickAlchemy：执行tick炼丹相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新tick炼丹相关状态。
 */

        tickAlchemy(player, jobKind = undefined) {
        return tickAlchemyImpl(this, player, jobKind);
    }
    /** 校验强化 start 的目标、保护物和基础参数；不提前锁装备或扣资源。 */
        validateEnhancementStart(player, payload) {
        return validateEnhancementStartImpl(this, player, payload);
    }
    /** 活动互斥时把强化 start 转入统一技艺队列，不提前锁装备或扣资源。 */
        queueEnhancementStart(player, validated, payload) {
        return queueEnhancementStartImpl(this, player, validated, payload);
    }
    /** 锁定强化工件并扣除本阶材料；调用方负责先完成校验和排队。 */
        consumeEnhancementStartResources(player, validated) {
        return consumeEnhancementStartResourcesImpl(this, player, validated);
    }
    /** 创建强化 active job；调用方负责先完成资源锁定和材料消耗。 */
        createEnhancementStartJob(player, validated) {
        return createEnhancementStartJobImpl(this, player, validated);
    }
    /** 标记强化 start 对背包、active job 和强化记录的权威变更。 */
        finalizeEnhancementStart(player) {
        return finalizeEnhancementStartImpl(this, player);
    }
    /** 构建强化启动提示。 */
        buildEnhancementStartMessages(validated, job) {
        return buildEnhancementStartMessagesImpl(this, validated, job);
    }
    /** 解析强化玩家可见装备名，运行态物品缺少 name 时用内容目录兜底。 */
        resolveEnhancementItemBaseDisplayName(item) {
        return resolveEnhancementItemBaseDisplayNameImpl(this, item);
    }
    /**
 * startEnhancement：执行开始强化相关逻辑。
 * @param player 玩家对象。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新start强化相关状态。
 */

        startEnhancement(player, payload) {
        return startEnhancementImpl(this, player, payload);
    }
    /**
 * cancelEnhancement：判断cancel强化是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成cancel强化的条件判断。
 */

        cancelEnhancement(player) {
        return cancelEnhancementImpl(this, player);
    }
    /**
 * interruptEnhancement：执行interrupt强化相关逻辑。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新interrupt强化相关状态。
 */

        interruptEnhancement(player, reason) {
        return interruptEnhancementImpl(this, player, reason);
    }
    /**
 * tickEnhancement：执行tick强化相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新tick强化相关状态。
 */

        tickEnhancement(player) {
        return tickEnhancementImpl(this, player);
    }
    /** 兼容旧 active job 内 queuedJobs，迁移到统一技艺队列。 */
    migrateLegacyCraftQueueToUnifiedQueue(player, queuedJobs) {
        migrateLegacyCraftQueueToUnifiedQueue(player, queuedJobs);
    }
    /** 旧完成路径不再直接消费统一队列；保留空实现兼容过渡调用方，避免丢弃非炼制类队列项。 */
    startNextQueuedCraftJob(_player) {
        return buildCraftMutationResult();
    }
    /**
 * blocksEquipSlotChange：执行blockEquipSlotChange相关逻辑。
 * @param player 玩家对象。
 * @param slot 参数说明。
 * @returns 无返回值，直接更新blockEquipSlotChange相关状态。
 */

    blocksEquipSlotChange(player, slot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        return Boolean(this.hasActiveEnhancementJob(player)
            && player.enhancementJob?.target?.source === 'equipment'
            && player.enhancementJob.target.slot === slot);
    }
    /**
 * getLockedSlotReason：读取LockedSlotReason。
 * @param player 玩家对象。
 * @param slot 参数说明。
 * @returns 无返回值，完成LockedSlotReason的读取/组装。
 */

    getLockedSlotReason(player, slot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.hasActiveEnhancementJob(player)) {
            return null;
        }
        if (player.enhancementJob?.target?.source === 'equipment' && player.enhancementJob.target.slot === slot) {
            return `${player.enhancementJob.targetItemName} 强化进行中，暂时不能更换对应装备槽。`;
        }
        return null;
    }
    /**
 * hasEquippedFurnace：判断EquippedFurnace是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成EquippedFurnace的条件判断。
 */

    hasEquippedFurnace(player) {
        return Boolean(this.getAlchemyLikeToolItem(player, 'alchemy')?.tags?.includes(ALCHEMY_FURNACE_TAG));
    }
    hasEquippedForgingTool(player) {
        return Boolean(this.getAlchemyLikeToolItem(player, 'forging')?.tags?.includes('forging_tool'));
    }
        getAlchemyLikeToolSpeedRate(player, jobKind) {
        return getAlchemyLikeToolSpeedRateImpl(this, player, jobKind);
    }
        getAlchemyLikeToolSuccessRate(player, jobKind) {
        return getAlchemyLikeToolSuccessRateImpl(this, player, jobKind);
    }
        getAlchemyLikeToolOutputRate(player, jobKind) {
        return getAlchemyLikeToolOutputRateImpl(this, player, jobKind);
    }
        getLuckSuccessRateBonus(player) {
        return getLuckSuccessRateBonusImpl(this, player);
    }

        resolveAlchemyLikeCurrentSuccessRate(player, jobKind, job) {
        return resolveAlchemyLikeCurrentSuccessRateImpl(this, player, jobKind, job);
    }

        refreshAlchemyLikeActiveJobSuccessRate(player, jobKind) {
        return refreshAlchemyLikeActiveJobSuccessRateImpl(this, player, jobKind);
    }

    /**
 * hasEquippedHammer：判断EquippedHammer是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成EquippedHammer的条件判断。
 */

        hasEquippedHammer(player) {
        return hasEquippedHammerImpl(this, player);
    }
    /**
 * ensureCraftSkills：执行ensure炼制技能相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新ensure炼制技能相关状态。
 */

    ensureCraftSkills(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const resolveExpToNext = (level) => resolveCraftSkillExpToNextByLevel(this.playerRuntimeService, level);
        player.alchemySkill = normalizeCraftSkill(player.alchemySkill, resolveExpToNext);
        player.forgingSkill = normalizeCraftSkill(player.forgingSkill, resolveExpToNext);
        player.gatherSkill = normalizeCraftSkill(player.gatherSkill, resolveExpToNext);
        player.miningSkill = normalizeCraftSkill(player.miningSkill, resolveExpToNext);
        player.formationSkill = normalizeCraftSkill(player.formationSkill, resolveExpToNext);
        player.enhancementSkill = normalizeCraftSkill(player.enhancementSkill ?? {
            level: player.enhancementSkillLevel,
            exp: 0,
            expToNext: resolveInitialCraftSkillExpToNext(this.playerRuntimeService),
        }, resolveExpToNext);
        player.enhancementSkillLevel = player.enhancementSkill.level;
        if (!Array.isArray(player.alchemyPresets)) {
            player.alchemyPresets = [];
        }
        if (!Array.isArray(player.enhancementRecords)) {
            player.enhancementRecords = [];
        }
        player.alchemyJob = player.alchemyJob ? cloneAlchemyJob(player.alchemyJob) : null;
        if (isCompletedAlchemyLikeJob(player.alchemyJob)) {
            player.alchemyJob = null;
            this.finalizeMutation(player, {
                persistentOnly: true,
                dirtyDomains: ['active_job'],
            });
        }
        this.normalizeLegacyForgingJobSlot(player);
        if (player.forgingJob && typeof player.forgingJob === 'object' && 'recipeId' in player.forgingJob) {
            player.forgingJob = cloneAlchemyJob(player.forgingJob);
            if (isCompletedAlchemyLikeJob(player.forgingJob)) {
                player.forgingJob = null;
                this.finalizeMutation(player, {
                    persistentOnly: true,
                    dirtyDomains: ['active_job'],
                });
            }
        } else {
            player.forgingJob = null;
        }
        player.enhancementJob = player.enhancementJob ? cloneEnhancementJob(player.enhancementJob) : null;
        if (player.enhancementJob?.target?.source === 'equipment') {
            player.enhancementJob.target = {
                source: 'inventory',
                ...(normalizeInventoryItemInstanceId(player.enhancementJob.itemInstanceId)
                    ? { itemInstanceId: normalizeInventoryItemInstanceId(player.enhancementJob.itemInstanceId) }
                    : {}),
            };
            this.finishEnhancementJob(player, player.enhancementJob.currentLevel ?? 0, 'cancelled');
        }
    }
    /**
 * buildAlchemyPanelState：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新炼丹面板状态相关状态。
 */

    buildAlchemyPanelState(player) {
        return this.craftPanelAlchemyQueryService.buildAlchemyPanelState(
            player,
            this.getAlchemyLikeToolItem(player, 'alchemy'),
            this.getCraftEffectStats(player),
        );
    }
    /**
 * buildEnhancementPanelState：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新强化面板状态相关状态。
 */

    buildEnhancementPanelState(player) {
        this.ensureCraftSkills(player);
        return this.craftPanelEnhancementQueryService.buildEnhancementPanelState(player, this.enhancementConfigs);
    }
    /**
 * collectEnhancementCandidates：判断强化Candidate是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新强化Candidate相关状态。
 */

        collectEnhancementCandidates(player) {
        return collectEnhancementCandidatesImpl(this, player);
    }
    /**
 * buildEnhancementCandidate：构建并返回目标对象。
 * @param player 玩家对象。
 * @param ref 参数说明。
 * @param item 道具。
 * @returns 无返回值，直接更新强化Candidate相关状态。
 */

        buildEnhancementCandidate(player, ref, item) {
        return buildEnhancementCandidateImpl(this, player, ref, item);
    }
    /**
 * buildProtectionCandidates：构建并返回目标对象。
 * @param player 玩家对象。
 * @param ref 参数说明。
 * @param item 道具。
 * @param config 参数说明。
 * @returns 无返回值，直接更新ProtectionCandidate相关状态。
 */

        buildProtectionCandidates(player, ref, item, config) {
        return buildProtectionCandidatesImpl(this, player, ref, item, config);
    }
    /**
 * getEnhancementRequirements：读取强化Requirement。
 * @param config 参数说明。
 * @param targetLevel 参数说明。
 * @returns 无返回值，完成强化Requirement的读取/组装。
 */

        getEnhancementRequirements(config, targetLevel) {
        return getEnhancementRequirementsImpl(this, config, targetLevel);
    }

    normalizeEnhancementInventoryItem(item) {
        return this.contentTemplateRepository.normalizeItem?.(item) ?? item;
    }
    getCraftEffectStats(player) {
        return cloneCraftEffectStats(player?.attrs?.craftEffectStats);
    }

        getAlchemyLikeToolItem(player, jobKind) {
        return getAlchemyLikeToolItemImpl(this, player, jobKind);
    }

        getEnhancementToolItem(player) {
        return getEnhancementToolItemImpl(this, player);
    }
    /**
 * getEquippedItem：读取Equipped道具。
 * @param player 玩家对象。
 * @param slot 参数说明。
 * @returns 无返回值，完成Equipped道具的读取/组装。
 */

    getEquippedItem(player, slot) {
        return player.equipment?.slots?.find((entry) => entry.slot === slot)?.item ?? null;
    }
    /**
 * resolveRequestedTargetLevel：读取Requested目标等级并返回结果。
 * @param currentLevel 参数说明。
 * @param requestedTargetLevel 参数说明。
 * @returns 无返回值，直接更新Requested目标等级相关状态。
 */

        resolveRequestedTargetLevel(currentLevel, requestedTargetLevel) {
        return resolveRequestedTargetLevelImpl(this, currentLevel, requestedTargetLevel);
    }
    /**
 * resolveProtectionStartLevel：规范化或转换Protection开始等级。
 * @param desiredTargetLevel 参数说明。
 * @param requestedProtectionStartLevel 参数说明。
 * @returns 无返回值，直接更新ProtectionStart等级相关状态。
 */

        resolveProtectionStartLevel(desiredTargetLevel, requestedProtectionStartLevel) {
        return resolveProtectionStartLevelImpl(this, desiredTargetLevel, requestedProtectionStartLevel);
    }
    /**
 * shouldUseProtectionForStep：判断UseProtectionForStep是否满足条件。
 * @param targetLevel 参数说明。
 * @param protectionStartLevel 参数说明。
 * @returns 无返回值，完成UseProtectionForStep的条件判断。
 */

        shouldUseProtectionForStep(targetLevel, protectionStartLevel) {
        return shouldUseProtectionForStepImpl(this, targetLevel, protectionStartLevel);
    }
    /**
 * resolveEnhancementTarget：读取强化目标并返回结果。
 * @param player 玩家对象。
 * @param ref 参数说明。
 * @returns 无返回值，直接更新强化目标相关状态。
 */

        resolveEnhancementTarget(player, ref) {
        return resolveEnhancementTargetImpl(this, player, ref);
    }
    /**
 * resolveEnhancementProtection：规范化或转换强化Protection。
 * @param player 玩家对象。
 * @param ref 参数说明。
 * @param target 目标对象。
 * @param config 参数说明。
 * @returns 无返回值，直接更新强化Protection相关状态。
 */

        resolveEnhancementProtection(player, ref, target, config) {
        return resolveEnhancementProtectionImpl(this, player, ref, target, config);
    }
    /**
 * touchEnhancementRecord：执行touch强化Record相关逻辑。
 * @param player 玩家对象。
 * @param input 输入参数。
 * @returns 无返回值，直接更新touch强化Record相关状态。
 */

        touchEnhancementRecord(player, input) {
        return touchEnhancementRecordImpl(this, player, input);
    }
    resolveEnhancementRecordItemName(itemId, input = {}) {
        return resolveEnhancementRecordItemNameImpl(this, itemId, input);
    }
    /**
 * touchEnhancementLevelRecord：执行touch强化等级Record相关逻辑。
 * @param player 玩家对象。
 * @param itemId 道具 ID。
 * @param targetLevel 参数说明。
 * @param success 参数说明。
 * @param resultingLevel 参数说明。
 * @returns 无返回值，直接更新touch强化等级Record相关状态。
 */

        touchEnhancementLevelRecord(player, itemId, targetLevel, success, resultingLevel) {
        return touchEnhancementLevelRecordImpl(this, player, itemId, targetLevel, success, resultingLevel);
    }
    /** 强化 start 生命周期显式记录 hook。 */
        recordEnhancementStart(player, input) {
        return recordEnhancementStartImpl(this, player, input);
    }
    /** 强化单阶结算显式记录 hook。 */
        recordEnhancementStepResult(player, job, success, resultingLevel) {
        return recordEnhancementStepResultImpl(this, player, job, success, resultingLevel);
    }
    /** 强化 job 结束显式记录 hook。 */
        completeEnhancementRecord(player, job, resultingLevel, status) {
        return completeEnhancementRecordImpl(this, player, job, resultingLevel, status);
    }
    /**
 * advanceEnhancementJob：执行advance强化Job相关逻辑。
 * @param player 玩家对象。
 * @param currentLevel 参数说明。
 * @returns 无返回值，直接更新advance强化Job相关状态。
 */

        advanceEnhancementJob(player, currentLevel) {
        return advanceEnhancementJobImpl(this, player, currentLevel);
    }
    /**
 * finishEnhancementJob：判断完成强化Job是否满足条件。
 * @param player 玩家对象。
 * @param resultingLevel 参数说明。
 * @param status 参数说明。
 * @returns 无返回值，直接更新finish强化Job相关状态。
 */

        finishEnhancementJob(player, resultingLevel, status) {
        return finishEnhancementJobImpl(this, player, resultingLevel, status);
    }
    /**
 * hasEnoughEnhancementResources：判断Enough强化Resource是否满足条件。
 * @param player 玩家对象。
 * @param target 目标对象。
 * @param protection 参数说明。
 * @param spiritStoneCost 参数说明。
 * @param materials 参数说明。
 * @param protectionRequired 参数说明。
 * @returns 无返回值，完成Enough强化Resource的条件判断。
 */

        hasEnoughEnhancementResources(player, target, protection, spiritStoneCost, materials, protectionRequired) {
        return hasEnoughEnhancementResourcesImpl(this, player, target, protection, spiritStoneCost, materials, protectionRequired);
    }
    /**
 * hasEnoughQueuedEnhancementResources：判断EnoughQueued强化Resource是否满足条件。
 * @param player 玩家对象。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @param spiritStoneCost 参数说明。
 * @param materials 参数说明。
 * @returns 无返回值，完成EnoughQueued强化Resource的条件判断。
 */

        hasEnoughQueuedEnhancementResources(player, protectionItemId, targetItemId, spiritStoneCost, materials) {
        return hasEnoughQueuedEnhancementResourcesImpl(this, player, protectionItemId, targetItemId, spiritStoneCost, materials);
    }
    /**
 * consumeProtectionItemForFailure：执行consumeProtection道具ForFailure相关逻辑。
 * @param player 玩家对象。
 * @param job 参数说明。
 * @returns 无返回值，直接更新consumeProtection道具ForFailure相关状态。
 */

        consumeProtectionItemForFailure(player, job) {
        return consumeProtectionItemForFailureImpl(this, player, job);
    }
    /**
 * consumeInventoryItemByPredicate：执行consume背包道具ByPredicate相关逻辑。
 * @param player 玩家对象。
 * @param predicate 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具ByPredicate相关状态。
 */

        consumeInventoryItemByPredicate(player, predicate, count) {
        return consumeInventoryItemByPredicateImpl(this, player, predicate, count);
    }
    /**
 * isSelfProtectionItem：判断SelfProtection道具是否满足条件。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @returns 无返回值，完成SelfProtection道具的条件判断。
 */

        isSelfProtectionItem(protectionItemId, targetItemId) {
        return isSelfProtectionItemImpl(this, protectionItemId, targetItemId);
    }
    /**
 * isEligibleProtectionItem：判断EligibleProtection道具是否满足条件。
 * @param item 道具。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @returns 无返回值，完成EligibleProtection道具的条件判断。
 */

        isEligibleProtectionItem(item, protectionItemId, targetItemId) {
        return isEligibleProtectionItemImpl(this, item, protectionItemId, targetItemId);
    }
    /**
 * getEligibleProtectionCount：读取EligibleProtection数量。
 * @param player 玩家对象。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @returns 无返回值，完成EligibleProtection数量的读取/组装。
 */

        getEligibleProtectionCount(player, protectionItemId, targetItemId) {
        return getEligibleProtectionCountImpl(this, player, protectionItemId, targetItemId);
    }
    /**
 * persistEnhancementRecords：执行persist强化Records相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新persist强化Records相关状态。
 */

        async persistEnhancementRecords(player) {
        return persistEnhancementRecordsImpl(this, player);
    }
    /**
 * persistAlchemyPresets：执行persist炼丹Presets相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新persist炼丹Presets相关状态。
 */

    async persistAlchemyPresets(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (isFlushTaskConsumerMode()) {
            return;
        }
        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        await this.playerDomainPersistenceService.savePlayerAlchemyPresets(playerId, [...(player.alchemyPresets ?? [])], {
            versionSeed: nextPlayerPersistenceVersion(),
        });
    }
    /**
 * persistActiveJob：执行persist活跃Job相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新persist活跃Job相关状态。
 */

    async persistActiveJob(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (isFlushTaskConsumerMode()) {
            return;
        }
        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        const activeJob = buildActiveJobSnapshotFromPlayer(player);
        const versionSeed = nextPlayerPersistenceVersion();
        await this.playerDomainPersistenceService.savePlayerActiveJob(playerId, activeJob, {
            versionSeed,
        });
        await this.playerDomainPersistenceService.savePlayerTechniqueActivityQueue(playerId, buildTechniqueActivityQueueSnapshotFromPlayer(player), {
            versionSeed,
        });
    }
    /**
 * persistTechniqueActivitySnapshot：执行persist技艺活动Snapshot相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新persist技艺活动Snapshot相关状态。
 */

    async persistTechniqueActivitySnapshot(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (isFlushTaskConsumerMode()) {
            return;
        }
        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        const activeJob = buildActiveJobSnapshotFromPlayer(player);
        const versionSeed = nextPlayerPersistenceVersion();
        await this.playerDomainPersistenceService.savePlayerActiveJob(playerId, activeJob, {
            versionSeed,
        });
        await this.playerDomainPersistenceService.savePlayerTechniqueActivityQueue(playerId, buildTechniqueActivityQueueSnapshotFromPlayer(player), {
            versionSeed,
        });
    }
    /**
     * 在任务开始、终止或强事务切换边界立即收敛 active_job 与统一队列投影。
     * 普通进度 tick 仍只标脏并由统一 flush 合并，避免把数据库 IO 放进热路径。
     */
    async flushTechniqueActivityProjection(player, options: { force?: boolean; reason?: string } = {}) {
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        const flushPlayerDomains = this.playerPersistenceFlushService?.flushPlayerDomains;
        if (!playerId || typeof flushPlayerDomains !== 'function') {
            return false;
        }
        if (options.force === true) {
            this.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job']);
            this.playerRuntimeService.bumpPersistentRevision?.(player);
        }
        try {
            const flushed = await flushPlayerDomains.call(
                this.playerPersistenceFlushService,
                playerId,
                ['active_job'],
                { forceCurrentSnapshot: options.force === true },
            );
            // IO 期间可能产生更高版本的任务进度 dirty；本次快照已成功提交即可通过边界，
            // 新修订继续由统一 flush 收敛，不能反向把已完成的边界提交判为失败。
            return flushed === true;
        }
        catch (error) {
            const reason = typeof options.reason === 'string' && options.reason.trim()
                ? options.reason.trim()
                : 'technique_activity_boundary';
            if (isConvergedPlayerProjectionFenceError(error)) {
                // 更新会话已经接管该玩家；旧会话的投影应跳过，不重试也不打成业务告警。
                this.logger.debug(
                    `技艺任务投影已被更新会话取代，按 stale-safe 收敛：playerId=${playerId} reason=${reason} error=${error.message}`,
                );
                return false;
            }
            this.logger.warn(
                `技艺任务投影收敛失败 playerId=${playerId} reason=${reason} error=${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    }
    /**
 * finalizeMutation：执行finalizeMutation相关逻辑。
 * @param player 玩家对象。
 * @param options 选项参数。
 * @returns 无返回值，直接更新finalizeMutation相关状态。
 */

    finalizeMutation(player, options: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const dirtyDomains = [];
        if (options.inventoryChanged) {
            player.inventory.revision += 1;
            this.playerRuntimeService.refreshWalletCacheFromInventory(player);
            this.playerRuntimeService.playerProgressionService.refreshPreview(player);
            dirtyDomains.push('inventory');
        }
        if (options.equipmentChanged) {
            player.equipment.revision += 1;
            this.playerRuntimeService.playerAttributesService.recalculate(player, 'craft_settlement');
            this.playerRuntimeService.rebuildActionState(player, 0);
            dirtyDomains.push('equipment', 'attr');
        }
        else if (options.attrChanged) {
            player.enhancementSkillLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        }
        if (options.attrChanged && !options.equipmentChanged) {
            player.enhancementSkillLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        }
        for (const domain of Array.isArray(options.dirtyDomains) ? options.dirtyDomains : []) {
            if (typeof domain === 'string' && domain.trim()) {
                dirtyDomains.push(domain.trim());
            }
        }
        if (dirtyDomains.includes('active_job')) {
            bumpTechniqueActivityJobVersion(player);
        }
        if (dirtyDomains.length > 0) {
            this.playerRuntimeService.markPersistenceDirtyDomains(player, dirtyDomains);
        }
        if (options.inventoryChanged || options.equipmentChanged || options.attrChanged || options.persistentOnly || dirtyDomains.length > 0) {
            this.playerRuntimeService.bumpPersistentRevision(player);
        }
        const durableEnhancementActiveJob = dirtyDomains.includes('active_job')
            && (Boolean(player?.enhancementJob) || dirtyDomains.includes('enhancement_record'))
            && this.durableOperationService?.isEnabled?.() === true;
        if (
            dirtyDomains.includes('active_job')
            && !player?.suppressImmediateDomainPersistence
            && !durableEnhancementActiveJob
            && !isFlushTaskConsumerMode()
        ) {
            void this.persistTechniqueActivitySnapshot(player).catch((error) => {
                console.warn(`活跃任务直写失败，已标记脏数据等待重试：${error instanceof Error ? error.message : String(error)}`);
                this.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job']);
            });
        }
    }
    /**
 * loadAlchemyCatalog：读取炼丹目录并返回结果。
 * @returns 无返回值，完成炼丹目录的读取/组装。
 */

    loadAlchemyCatalog() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const filePath = resolveContentPath('alchemy', 'recipes.json');
        if (!existsSync(filePath)) {
            this.logger.warn(`炼丹配方目录缺失：${filePath}`);
            this.alchemyCatalog = [];
            return;
        }
        const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
        this.alchemyCatalog = Array.isArray(raw)
            ? raw.map((entry) => this.toAlchemyCatalogEntry(entry)).filter(Boolean)
            : [];
        this.alchemyCatalog.sort((left, right) => {
            if (left.outputLevel !== right.outputLevel) {
                return left.outputLevel - right.outputLevel;
            }
            return left.outputItemId.localeCompare(right.outputItemId, 'zh-Hans-CN');
        });
    }
    /** 读取炼器目录，转换成炼丹同构的制造目录。 */
    loadForgingCatalog() {
        const filePath = resolveContentPath('forging', 'recipes.json');
        if (!existsSync(filePath)) {
            this.logger.warn(`炼器配方目录缺失：${filePath}`);
            this.forgingCatalog = [];
            return;
        }
        const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
        this.forgingCatalog = Array.isArray(raw)
            ? raw.map((entry) => this.toAlchemyCatalogEntry(entry)).filter(Boolean)
            : [];
        this.forgingCatalog.sort((left, right) => {
            if (left.outputLevel !== right.outputLevel) {
                return left.outputLevel - right.outputLevel;
            }
            return left.outputItemId.localeCompare(right.outputItemId, 'zh-Hans-CN');
        });
    }
    /**
 * loadEnhancementConfigs：读取强化配置并返回结果。
 * @returns 无返回值，完成强化配置的读取/组装。
 */

    loadEnhancementConfigs() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const root = resolveContentPath('enhancements');
        this.enhancementConfigs.clear();
        if (!existsSync(root)) {
            this.logger.warn(`强化配置目录缺失：${root}`);
            return;
        }
        for (const filePath of walkJsonFiles(root)) {
            const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
            if (!Array.isArray(raw)) {
                continue;
            }
            for (const entry of raw) {
                const normalized = normalizeEnhancementConfig(entry);
                if (normalized) {
                    this.enhancementConfigs.set(normalized.targetItemId, normalized);
                }
            }
        }
    }
    /**
 * toAlchemyCatalogEntry：执行to炼丹目录条目相关逻辑。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新to炼丹目录条目相关状态。
 */

    toAlchemyCatalogEntry(entry) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const recipeId = typeof entry?.recipeId === 'string' ? entry.recipeId.trim() : '';
        const outputItemId = typeof entry?.outputItemId === 'string' ? entry.outputItemId.trim() : '';
        const outputItem = this.contentTemplateRepository.createItem(outputItemId, 1);
        if (!recipeId || !outputItemId || !outputItem) {
            return null;
        }
        const legacyIngredients = Array.isArray(entry.ingredients)
            ? entry.ingredients.map((ingredient) => toAlchemyIngredientDef(this.contentTemplateRepository, ingredient)).filter(Boolean)
            : [];
        const mainIngredients = Array.isArray(entry.mainIngredients)
            ? entry.mainIngredients.map((ingredient) => toAlchemyMainIngredientDef(this.contentTemplateRepository, ingredient)).filter(Boolean)
            : legacyIngredients.filter((ingredient) => ingredient.role === 'main').map((ingredient) => ({
                itemId: ingredient.itemId,
                name: ingredient.name,
                count: ingredient.count,
            }));
        if (mainIngredients.length < 1 || mainIngredients.length > 2) {
            return null;
        }
        const requiredAuxElements = resolveRecipeRequiredAuxElements(
            this.contentTemplateRepository,
            entry.requiredAuxElements,
            legacyIngredients,
        );
        const mainElements = sumRecipeIngredientElements(this.contentTemplateRepository, mainIngredients);
        if (sumCraftElementAbs(requiredAuxElements) <= 0 && sumCraftElementAbs(mainElements) <= 0) {
            return null;
        }
        const category = resolveAlchemyRecipeCategory(outputItem, recipeId);
        const outputLevel = normalizePositiveInt(entry.level ?? outputItem.level, 1);
        return {
            recipeId,
            outputItemId,
            outputName: outputItem.name,
            category,
            outputCount: normalizePositiveInt(entry.outputCount, 1),
            outputLevel,
            level: outputLevel,
            grade: normalizeTechniqueGrade(entry.grade ?? outputItem.grade),
            baseBrewTicks: normalizePositiveInt(entry.baseBrewTicks, 1),
            mainIngredients,
            requiredAuxElements,
            fullPower: legacyIngredients.reduce((total, ingredient) => total + ingredient.powerPerUnit * ingredient.count, 0),
            ingredients: legacyIngredients.length > 0
                ? legacyIngredients
                : mainIngredients.map((ingredient) => ({
                    itemId: ingredient.itemId,
                    name: ingredient.name,
                    count: ingredient.count,
                    role: 'main',
                    level: outputLevel,
                    grade: normalizeTechniqueGrade(entry.grade ?? outputItem.grade),
                    powerPerUnit: computeAlchemyMaterialPower(outputItem.level, outputItem.grade, 1),
                })),
        };
    }
};
