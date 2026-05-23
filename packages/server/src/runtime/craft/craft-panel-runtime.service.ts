/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ALCHEMY_FURNACE_OUTPUT_COUNT, EQUIP_SLOTS, ENHANCEMENT_HAMMER_TAG, ENHANCEMENT_SPIRIT_STONE_ITEM_ID, MAX_ENHANCE_LEVEL, TECHNIQUE_GRADE_ORDER, applyEquipmentAttributeEffectivenessToItemStack, canMergeItemStack, computeAlchemyAdjustedBrewTicks, computeAlchemyAdjustedSuccessRate, computeAlchemyBatchOutputCountWithSize, computeAlchemyBrewTicks, computeAlchemySuccessRate, computeAlchemyTotalJobTicks, computeCraftSkillExpGain, computeEnhancementAdjustedSuccessRate, computeEnhancementJobBaseTicks, computeEnhancementJobTicks, computeEnhancementToolSpeedRate, createItemStackSignature, getAlchemySpiritStoneCost, isExactAlchemyRecipe, isLegacyItemInstanceId } from '@mud/shared';
import type { ItemStack } from '@mud/shared';
import { assignItemInstanceIdIfNeeded, compareItemInstanceId, isItemInstanceIdHardCheckEnabled } from '../world/item-instance-id.helpers';
import { lockItem, unlockItem, getLockedItem, lockedItemToItemStack } from '../player/inventory-lock.helpers';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { PlayerDomainPersistenceService, buildEnhancementRecordRowsFromEntries } from '../../persistence/player-domain-persistence.service';
import { resolveProjectPath } from '../../common/project-path';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { CraftPanelAlchemyQueryService, buildForgingAlchemyPanelState } from './craft-panel-alchemy-query.service';
import { ALCHEMY_FURNACE_TAG, cloneAlchemyJob } from './craft-panel-alchemy-query.helpers';
import { CraftPanelEnhancementQueryService } from './craft-panel-enhancement-query.service';
import { advanceTechniqueActivityPause, applyTechniqueActivityInterrupt, buildTechniqueActivityInterruptMessage, hasTechniqueActivityJob, listRuntimeTechniqueActivityKinds } from './technique-activity-runtime.helpers';
import { DEFAULT_CRAFT_EXP_TO_NEXT, resolveCraftSkillExpToNextByLevel, resolveInitialCraftSkillExpToNext } from './craft-skill-exp.helpers';
import { TechniqueActivityPipelineService } from './pipeline/technique-activity-pipeline.service';
import { AlchemyStrategy } from './pipeline/strategies/alchemy.strategy';
import { ForgingStrategy } from './pipeline/strategies/forging.strategy';
import { EnhancementStrategy } from './pipeline/strategies/enhancement.strategy';
import { GatherStrategy } from './pipeline/strategies/gather.strategy';
import { BuildingStrategy } from './pipeline/strategies/building.strategy';

/** 强化与炼丹计算中固定使用的灵石物品 ID。 */
const SPIRIT_STONE_ITEM_ID = ENHANCEMENT_SPIRIT_STONE_ITEM_ID;

/** 炼丹任务开始后先经历的准备息数。 */
const ALCHEMY_PREPARATION_TICKS = 10;

/** 炼丹被打断后进入的暂停息数。 */
const ALCHEMY_INTERRUPT_PAUSE_TICKS = 10;

/** 强化被打断后进入的暂停息数。 */
const ENHANCEMENT_INTERRUPT_PAUSE_TICKS = 10;
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
    /** 运行时日志器，记录炼丹、强化与配置加载问题。 */
    logger = new Logger(CraftPanelRuntimeService.name);
    /** 缓存炼丹目录，供面板快照和任务校验共用。 */
    alchemyCatalog = [];
    /** 缓存炼器目录，复用炼丹制造公式但输出器物。 */
    forgingCatalog = [];
    /** 缓存强化配置，避免每次操作都重新查表。 */
    enhancementConfigs = new Map();
    /** 技艺管线服务。 */
    pipeline: TechniqueActivityPipelineService | null = null;
    /** 缓存依赖并初始化日志、配方与强化配置。 */
    constructor(
        contentTemplateRepository: ContentTemplateRepository,
        playerRuntimeService: PlayerRuntimeService,
        playerDomainPersistenceService: PlayerDomainPersistenceService,
        craftPanelAlchemyQueryService: CraftPanelAlchemyQueryService,
        craftPanelEnhancementQueryService: CraftPanelEnhancementQueryService,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.playerDomainPersistenceService = playerDomainPersistenceService;
        this.craftPanelAlchemyQueryService = craftPanelAlchemyQueryService;
        this.craftPanelEnhancementQueryService = craftPanelEnhancementQueryService;
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
        return this.craftPanelAlchemyQueryService.buildAlchemyPanelPayload(player, knownCatalogVersion, this.alchemyCatalog, this.getWeapon(player));
    }
    /** 读取炼丹面板运行态增量，高频刷新不重复下发目录和预设。 */
    buildAlchemyPanelPatchPayload(player) {
        this.ensureCraftSkills(player);
        return this.craftPanelAlchemyQueryService.buildAlchemyPanelPatchPayload(player, 'alchemy');
    }
    /** 读取炼器面板状态，复用炼丹面板结构但返回炼器目录。 */
    buildForgingPanelPayload(player, knownCatalogVersion) {
        this.ensureCraftSkills(player);
        const payload = {
            ...this.craftPanelAlchemyQueryService.buildAlchemyPanelPayload(player, knownCatalogVersion, this.forgingCatalog, this.getWeapon(player)),
            kind: 'forging',
        };
        if (payload.state) {
            payload.state = {
                ...buildForgingAlchemyPanelState(player, this.getWeapon(player)),
            };
        }
        return payload;
    }
    /** 读取炼器面板运行态增量，高频刷新不重复下发目录和预设。 */
    buildForgingPanelPatchPayload(player) {
        this.ensureCraftSkills(player);
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
        // gather/building 仍由独立路径 tick，不纳入此列表以避免双重 tick
        return false;
    }
    /** 返回当前玩家仍在运行中的技艺活动键。 */
    listActiveTechniqueActivityKinds(player) {
        return listRuntimeTechniqueActivityKinds()
            .filter((kind) => this.hasActiveTechniqueActivity(player, kind));
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
            return this.pipeline.start(player, kind, payload, ctx);
        }
        return buildCraftMutationResult(`unsupported technique activity kind: ${kind}`);
    }
    /** 统一派发技艺活动的取消写路径。 */
    cancelTechniqueActivity(player, kind, deps = null) {
        this.ensurePipelineInitialized();
        if (this.pipeline?.hasStrategy(kind)) {
            const ctx = this.buildPipelineContext(deps);
            return this.pipeline.cancel(player, kind, ctx);
        }
        return buildCraftMutationResult(`unsupported technique activity kind: ${kind}`);
    }
    /** 统一派发技艺活动的中断。 */
    interruptTechniqueActivity(player, kind, reason, deps = null) {
        this.ensurePipelineInitialized();
        if (this.pipeline?.hasStrategy(kind)) {
            const ctx = this.buildPipelineContext(deps);
            return this.pipeline.interrupt(player, kind, reason, ctx);
        }
        return buildCraftTickResult();
    }
    /** 统一派发技艺活动的 tick 推进。 */
    tickTechniqueActivity(player, kind, deps = null) {
        this.ensurePipelineInitialized();
        if (this.pipeline?.hasStrategy(kind)) {
            const ctx = this.buildPipelineContext(deps);
            return this.pipeline.tick(player, kind, ctx);
        }
        return buildCraftTickResult();
    }
    buildPipelineContext(deps = null) {
        return {
            contentTemplateRepository: this.contentTemplateRepository,
            resolveExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(this.playerRuntimeService, level),
            getInstanceRuntime: (instanceId) => typeof deps?.getInstanceRuntime === 'function' ? deps.getInstanceRuntime(instanceId) : null,
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
        this.pipeline.register(new GatherStrategy());
        this.pipeline.register(new BuildingStrategy());
    }
    /** 把制造任务写入当前活跃任务携带的等待队列。 */
    enqueueCraftQueueItem(player, item, mode) {
        const holder = player.enhancementJob ?? player.forgingJob ?? player.alchemyJob ?? null;
        if (!holder) {
            return buildCraftMutationResult('当前没有可挂载队列的制造任务。');
        }
        const currentQueue = getPlayerCraftQueue(player);
        const nextQueue = mode === 'replace'
            ? [item]
            : mode === 'preserve'
                ? [item, ...currentQueue]
                : [...currentQueue, item];
        holder.queuedJobs = nextQueue;
        this.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return {
            ok: true,
            panelChanged: true,
            messages: [{
                    kind: 'system',
                    text: mode === 'append'
                        ? `已加入制造队列末尾：${item.label}`
                        : mode === 'preserve'
                            ? `已加入当前任务之后：${item.label}`
                            : `已重置等待队列，下一项为：${item.label}`,
                }],
        };
    }
    /** 提交新炼丹任务前完成装备与状态校验。 */
    startAlchemy(player, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const jobKind = payload?.kind === 'forging' ? 'forging' : 'alchemy';
        const catalog = jobKind === 'forging' ? this.forgingCatalog : this.alchemyCatalog;
        const outputNoun = jobKind === 'forging' ? '成器' : '成丹';
        const recipe = catalog.find((entry) => entry.recipeId === normalizeText(payload?.recipeId));
        if (!recipe) {
            return buildCraftMutationResult(jobKind === 'forging' ? '对应器方不存在。' : '对应丹方不存在。');
        }
        const normalizedSelection = validateAlchemySelection(recipe, normalizeIngredientSelections(payload?.ingredients));
        if ('error' in normalizedSelection) {
            return buildCraftMutationResult(normalizedSelection.error);
        }
        const quantity = normalizeQuantity(payload?.quantity, 1, 99);
        if (this.hasAnyActiveTechniqueActivity(player)) {
            return this.enqueueCraftQueueItem(
                player,
                buildAlchemyQueueItem(recipe, normalizedSelection.ingredients, quantity, jobKind),
                normalizeCraftQueueStartMode(payload?.queueMode),
            );
        }
        const queuedJobs = Array.isArray(payload?.__queuedJobs)
            ? cloneCraftQueue(payload.__queuedJobs)
            : normalizeCraftQueueStartMode(payload?.queueMode) === 'preserve'
                ? getPlayerCraftQueue(player)
                : [];
        for (const ingredient of normalizedSelection.ingredients) {
            const requiredCount = ingredient.count * quantity;
            if (countInventoryItem(player, ingredient.itemId) < requiredCount) {
                return buildCraftMutationResult(`${this.contentTemplateRepository.getItemName(ingredient.itemId) ?? ingredient.itemId} 数量不足。`);
            }
        }
        const spiritStoneCost = getAlchemySpiritStoneCost(recipe.outputLevel, recipe.category === 'buff') * quantity;
        if (spiritStoneCost > 0 && !this.playerRuntimeService.canAffordWallet(player.playerId, SPIRIT_STONE_ITEM_ID, spiritStoneCost)) {
            return buildCraftMutationResult(`灵石不足，需要 ${spiritStoneCost} 枚。`);
        }
        for (const ingredient of normalizedSelection.ingredients) {
            consumeInventoryItemByItemId(player, ingredient.itemId, ingredient.count * quantity);
        }
        if (spiritStoneCost > 0) {
            this.playerRuntimeService.debitWallet(player.playerId, SPIRIT_STONE_ITEM_ID, spiritStoneCost);
        }
        const furnaceOutputCount = jobKind === 'forging' || recipe.category === 'buff' ? 1 : ALCHEMY_FURNACE_OUTPUT_COUNT;
        const baseSuccessRate = computeAlchemySuccessRate(recipe, normalizedSelection.ingredients);
        const craftSkillLevel = (jobKind === 'forging' ? player.forgingSkill?.level : player.alchemySkill?.level) ?? 1;
        const batchBrewTicks = computeAlchemyAdjustedBrewTicks(
            recipe.baseBrewTicks,
            recipe,
            normalizedSelection.ingredients,
            recipe.outputLevel,
            craftSkillLevel,
            this.getAlchemyLikeToolSpeedRate(player, jobKind),
            furnaceOutputCount
        );
        const totalTicks = computeAlchemyTotalJobTicks(batchBrewTicks, quantity, ALCHEMY_PREPARATION_TICKS);
        const exactRecipe = isExactAlchemyRecipe(recipe, normalizedSelection.ingredients);
        const successRate = computeAlchemyAdjustedSuccessRate(
            baseSuccessRate,
            recipe.outputLevel,
            craftSkillLevel,
            this.getAlchemyLikeToolSuccessRate(player, jobKind)
        );
        const batchOutputCount = computeAlchemyBatchOutputCountWithSize(recipe.outputCount, furnaceOutputCount);
        const nextJob = {
            jobRunId: createCraftJobRunId(player.playerId, jobKind),
            jobType: jobKind,
            recipeId: recipe.recipeId,
            outputItemId: recipe.outputItemId,
            outputCount: batchOutputCount,
            quantity,
            completedCount: 0,
            successCount: 0,
            failureCount: 0,
            ingredients: normalizedSelection.ingredients.map((entry) => ({ ...entry })),
            phase: 'preparing',
            preparationTicks: ALCHEMY_PREPARATION_TICKS,
            batchBrewTicks,
            currentBatchRemainingTicks: batchBrewTicks,
            pausedTicks: 0,
            spiritStoneCost,
            totalTicks,
            remainingTicks: totalTicks,
            successRate,
            jobVersion: 1,
            exactRecipe,
            outputLevel: recipe.outputLevel,
            baseBrewTicks: recipe.baseBrewTicks,
            startedAt: Date.now(),
            queuedJobs,
        };
        setAlchemyLikeJob(player, jobKind, nextJob);
        this.finalizeMutation(player, {
            inventoryChanged: true,
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return {
            ok: true,
            panelChanged: true,
            inventoryChanged: true,
            messages: [{
                    kind: 'quest',
                    text: `开始准备炼制 ${recipe.outputName}${quantity > 1 ? `，共 ${quantity} 炉` : ''}${spiritStoneCost > 0 ? `，消耗灵石 x${spiritStoneCost}` : ''}；${ALCHEMY_PREPARATION_TICKS} 息后自动开炼，总计 ${totalTicks} 息。单炉固定 ${batchOutputCount} 件，每件${outputNoun}率 ${(successRate * 100).toFixed(successRate === 1 ? 0 : 1)}%。`,
                }],
        };
    }
    /** 提交新炼器任务：复用炼丹成功率、加速、队列和打断规则。 */
    startForging(player, payload) {
        return this.startAlchemy(player, { ...(payload ?? {}), kind: 'forging' });
    }
    /**
 * cancelAlchemy：判断cancel炼丹是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成cancel炼丹的条件判断。
 */

    cancelAlchemy(player, jobKind = 'alchemy') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        const job = getAlchemyLikeJob(player, normalizedJobKind);
        if (!job || job.remainingTicks <= 0) {
            return buildCraftMutationResult(normalizedJobKind === 'forging' ? '当前没有可取消的炼器任务。' : '当前没有可取消的炼丹任务。');
        }
        const refundableBatchCount = Math.max(0, job.quantity - job.completedCount - (job.phase === 'brewing' ? 1 : 0));
        const groundDrops = [];
        let inventoryChanged = false;
        for (const ingredient of job.ingredients) {
            const refundCount = ingredient.count * refundableBatchCount;
            if (refundCount > 0) {
                const refundItem = this.contentTemplateRepository.normalizeItem({
                    itemId: ingredient.itemId,
                    count: refundCount,
                });
                if (refundItem.itemId === SPIRIT_STONE_ITEM_ID) {
                    this.playerRuntimeService.creditWallet(player.playerId, SPIRIT_STONE_ITEM_ID, refundCount);
                    inventoryChanged = true;
                }
                else if (canReceiveCraftItem(player, refundItem)) {
                    receiveInventoryItem(player, this.contentTemplateRepository, refundItem);
                    inventoryChanged = true;
                } else {
                    groundDrops.push(refundItem);
                }
            }
        }
        if (job.spiritStoneCost > 0 && refundableBatchCount > 0) {
            const refundableSpiritStones = Math.floor(job.spiritStoneCost * (refundableBatchCount / Math.max(1, job.quantity)));
            if (refundableSpiritStones > 0) {
                this.playerRuntimeService.creditWallet(player.playerId, SPIRIT_STONE_ITEM_ID, refundableSpiritStones);
                inventoryChanged = true;
            }
        }
        setAlchemyLikeJob(player, normalizedJobKind, null);
        this.finalizeMutation(player, {
            inventoryChanged,
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return {
            ok: true,
            panelChanged: true,
            inventoryChanged,
            groundDrops,
            messages: [{
                    kind: 'system',
                    text: refundableBatchCount > 0
                        ? '你收了炉火，未开炼的后续炉次材料已退回。'
                        : '你收了炉火，当前这一炉已开炼，材料无法退回。',
                }],
        };
    }
    /** 取消炼器任务，退款规则与炼丹同构。 */
    cancelForging(player) {
        return this.cancelAlchemy(player, 'forging');
    }

    /**
 * saveAlchemyPreset：执行save炼丹Preset相关逻辑。
 * @param player 玩家对象。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新save炼丹Preset相关状态。
 */

    saveAlchemyPreset(player, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const recipeId = normalizeText(payload?.recipeId);
        const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
        if (!recipe) {
            return buildCraftMutationResult('对应丹方不存在。');
        }
        const normalizedSelection = validateAlchemySelection(recipe, normalizeIngredientSelections(payload?.ingredients));
        if ('error' in normalizedSelection) {
            return buildCraftMutationResult(normalizedSelection.error);
        }
        const requestedPresetId = normalizeText(payload?.presetId);
        const presetName = normalizeAlchemyPresetName(payload?.name, recipe.outputName || recipe.recipeId);
        const presetId = requestedPresetId || createAlchemyPresetId(recipe.recipeId);
        const existingIndex = player.alchemyPresets.findIndex((entry) => entry.presetId === presetId);
        const nextPreset = {
            presetId,
            recipeId: recipe.recipeId,
            name: presetName,
            ingredients: normalizedSelection.ingredients.map((entry) => ({ ...entry })),
            updatedAt: Date.now(),
        };
        if (existingIndex >= 0) {
            player.alchemyPresets.splice(existingIndex, 1, nextPreset);
        }
        else {
            player.alchemyPresets.unshift(nextPreset);
        }
        this.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['alchemy_preset'],
        });
        void this.persistAlchemyPresets(player).catch((error) => {
            console.warn(`炼丹预设直写失败，已标记脏数据等待重试：${error instanceof Error ? error.message : String(error)}`);
            this.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['alchemy_preset']);
        });
        return {
            ok: true,
            panelChanged: true,
            messages: [{
                    kind: 'system',
                    text: existingIndex >= 0 ? `已更新炼制预设：${presetName}` : `已保存炼制预设：${presetName}`,
                }],
        };
    }
    /**
 * deleteAlchemyPreset：处理炼丹Preset并更新相关状态。
 * @param player 玩家对象。
 * @param presetIdInput 参数说明。
 * @returns 无返回值，直接更新炼丹Preset相关状态。
 */

    deleteAlchemyPreset(player, presetIdInput) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const presetId = normalizeText(presetIdInput);
        if (!presetId) {
            return buildCraftMutationResult('预设标识不能为空。');
        }
        const index = player.alchemyPresets.findIndex((entry) => entry.presetId === presetId);
        if (index < 0) {
            return buildCraftMutationResult('对应炼制预设不存在。');
        }
        const [removed] = player.alchemyPresets.splice(index, 1);
        this.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['alchemy_preset'],
        });
        void this.persistAlchemyPresets(player).catch((error) => {
            console.warn(`炼丹预设直写失败，已标记脏数据等待重试：${error instanceof Error ? error.message : String(error)}`);
            this.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['alchemy_preset']);
        });
        return {
            ok: true,
            panelChanged: true,
            messages: [{
                    kind: 'system',
                    text: `已删除炼制预设：${removed?.name ?? presetId}`,
                }],
        };
    }
    /**
 * interruptAlchemy：执行interrupt炼丹相关逻辑。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新interrupt炼丹相关状态。
 */

    interruptAlchemy(player, reason, jobKind = 'alchemy') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        const job = getAlchemyLikeJob(player, normalizedJobKind);
        const addedPauseTicks = applyTechniqueActivityInterrupt(job, ALCHEMY_INTERRUPT_PAUSE_TICKS);
        if (addedPauseTicks <= 0) {
            return buildCraftTickResult();
        }
        this.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return buildCraftTickResult(true, [{
                kind: 'system',
                text: buildTechniqueActivityInterruptMessage(
                    this.contentTemplateRepository.getItemName(job.outputItemId) ?? job.outputItemId,
                    normalizedJobKind === 'forging' ? '炼器' : '炼制',
                    ALCHEMY_INTERRUPT_PAUSE_TICKS,
                    reason,
                ),
            }]);
    }
    /**
 * tickAlchemy：执行tick炼丹相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新tick炼丹相关状态。
 */

    tickAlchemy(player, jobKind = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        const job = getAlchemyLikeJob(player, normalizedJobKind);
        if (!job || job.remainingTicks <= 0) {
            return buildCraftTickResult();
        }
        const catalog = normalizedJobKind === 'forging' ? this.forgingCatalog : this.alchemyCatalog;
        const activityLabel = normalizedJobKind === 'forging' ? '炼器' : '炼制';
        const successNoun = normalizedJobKind === 'forging' ? '成器' : '成丹';
        job.remainingTicks = Math.max(0, job.remainingTicks - 1);
        if (job.phase === 'paused') {
            const resumed = advanceTechniqueActivityPause(
                job,
                job.completedCount > 0 || job.currentBatchRemainingTicks < job.batchBrewTicks
                    ? 'brewing'
                    : 'preparing',
            );
            if (!resumed.resumed) {
                this.finalizeMutation(player, {
                    persistentOnly: true,
                    dirtyDomains: ['active_job'],
                });
                return buildCraftTickResult();
            }
            this.finalizeMutation(player, {
                persistentOnly: true,
                dirtyDomains: ['active_job'],
            });
            return buildCraftTickResult(true);
        }
        if (job.phase === 'preparing') {
            const brewTicksRemaining = Math.max(0, (job.quantity - job.completedCount) * job.batchBrewTicks);
            if (job.remainingTicks > brewTicksRemaining) {
                this.finalizeMutation(player, {
                    persistentOnly: true,
                    dirtyDomains: ['active_job'],
                });
                return buildCraftTickResult();
            }
            job.phase = 'brewing';
            job.currentBatchRemainingTicks = job.batchBrewTicks;
            this.finalizeMutation(player, {
                persistentOnly: true,
                dirtyDomains: ['active_job'],
            });
            return buildCraftTickResult(true, [{
                    kind: 'quest',
                    text: `${this.contentTemplateRepository.getItemName(job.outputItemId) ?? job.outputItemId} 炉火已稳，开始正式${activityLabel}。`,
                }]);
        }
        job.currentBatchRemainingTicks = Math.max(0, job.currentBatchRemainingTicks - 1);
        if (job.currentBatchRemainingTicks > 0 && job.remainingTicks > 0) {
            this.finalizeMutation(player, {
                persistentOnly: true,
                dirtyDomains: ['active_job'],
            });
            return buildCraftTickResult();
        }
        const successCount = resolveAlchemyBatchSuccess(job.outputCount, job.successRate);
        const failureCount = Math.max(0, job.outputCount - successCount);
        job.completedCount += 1;
        job.successCount += successCount;
        job.failureCount += failureCount;
        const groundDrops = [];
        let inventoryChanged = false;
        if (successCount > 0) {
            const outputItem = this.contentTemplateRepository.normalizeItem({
                itemId: job.outputItemId,
                count: successCount,
            });
            if (canReceiveCraftItem(player, outputItem)) {
                receiveInventoryItem(player, this.contentTemplateRepository, outputItem);
                inventoryChanged = true;
            }
            else {
                groundDrops.push(outputItem);
            }
        }
        const craftSkill = jobKind === 'forging' ? player.forgingSkill : player.alchemySkill;
        const skillGain = resolveAlchemySkillExpGain(this.playerRuntimeService, catalog, job, craftSkill, successCount, failureCount);
        const skillChanged = applyCraftSkillExp(craftSkill, skillGain, (level) => resolveCraftSkillExpToNextByLevel(this.playerRuntimeService, level));
        const jobCompleted = job.completedCount >= job.quantity || job.remainingTicks <= 0;
        this.finalizeMutation(player, {
            inventoryChanged,
            attrChanged: skillChanged,
            persistentOnly: true,
            dirtyDomains: [
                ...(jobCompleted ? [] : ['active_job']),
                ...(skillChanged ? ['profession'] : []),
            ],
        });
        if (jobCompleted) {
            const queuedJobs = cloneCraftQueue(job.queuedJobs);
            setAlchemyLikeJob(player, normalizedJobKind, null);
            const nextStartResult: any = this.startNextQueuedCraftJob(player, queuedJobs);
            if (!player.alchemyJob && !player.forgingJob && !player.enhancementJob) {
                this.finalizeMutation(player, { persistentOnly: true, dirtyDomains: ['active_job'] });
            }
            const nextMessages = nextStartResult.messages ?? [];
            return buildCraftTickResult(true, [{
                   kind: 'quest',
                    text: `${this.contentTemplateRepository.getItemName(job.outputItemId) ?? job.outputItemId} ${activityLabel}完成，${successNoun} ${job.successCount} 件。`,
                }, ...nextMessages], inventoryChanged || Boolean(nextStartResult.inventoryChanged), Boolean(nextStartResult.equipmentChanged), skillChanged || Boolean(nextStartResult.attrChanged), [...groundDrops, ...(nextStartResult.groundDrops ?? [])], skillGain / 2);
        }
        job.currentBatchRemainingTicks = job.batchBrewTicks;
        return buildCraftTickResult(true, [{
                kind: successCount > 0 ? 'quest' : 'system',
                text: successCount > 0
                    ? `第 ${job.completedCount} 炉${successNoun} ${successCount} 件。`
                    : `第 ${job.completedCount} 炉未能${successNoun}。`,
            }], inventoryChanged, false, skillChanged, groundDrops, skillGain / 2);
    }
    /**
 * startEnhancement：执行开始强化相关逻辑。
 * @param player 玩家对象。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新start强化相关状态。
 */

    startEnhancement(player, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const target = this.resolveEnhancementTarget(player, payload?.target);
        if (!target) {
            return buildCraftMutationResult('强化目标不存在。');
        }
        if (target.ref.source === 'equipment') {
            return buildCraftMutationResult('身上装备不能直接强化，请先卸下放入背包。');
        }
        if ((target as Record<string, unknown>).mismatched) {
            return buildCraftMutationResult('强化目标已变更，请重新选择。');
        }
        if (target.item.type !== 'equipment') {
            return buildCraftMutationResult('当前仅支持强化装备。');
        }
        const currentLevel = normalizeEnhanceLevel(target.item.enhanceLevel);
        if (currentLevel >= MAX_ENHANCE_LEVEL) {
            return buildCraftMutationResult(`该装备已达到强化上限 +${MAX_ENHANCE_LEVEL}。`);
        }
        const targetLevel = currentLevel + 1;
        const desiredTargetLevel = this.resolveRequestedTargetLevel(currentLevel, payload?.targetLevel);
        const config = this.enhancementConfigs.get(target.item.itemId);
        const protection = payload?.protection
            ? this.resolveEnhancementProtection(player, payload.protection, target, config)
            : null;
        if (payload?.protection && !protection) {
            return buildCraftMutationResult('保护物不存在或不符合本次强化规则。');
        }
        if (this.hasAnyActiveTechniqueActivity(player)) {
            return this.enqueueCraftQueueItem(
                player,
                buildEnhancementQueueItem(target, protection, payload, desiredTargetLevel),
                normalizeCraftQueueStartMode(payload?.queueMode),
            );
        }
        const queuedJobs = Array.isArray(payload?.__queuedJobs)
            ? cloneCraftQueue(payload.__queuedJobs)
            : normalizeCraftQueueStartMode(payload?.queueMode) === 'preserve'
                ? getPlayerCraftQueue(player)
                : [];
        const materials = this.getEnhancementRequirements(config, targetLevel);
        const protectionStartLevel = protection
            ? this.resolveProtectionStartLevel(desiredTargetLevel, payload?.protectionStartLevel)
            : undefined;
        const spiritStoneCost = getEnhancementSpiritStoneCost(target.item.level, materials.length > 0);
        if (!this.hasEnoughEnhancementResources(player, target, protection, spiritStoneCost, materials, this.shouldUseProtectionForStep(targetLevel, protectionStartLevel))) {
            return buildCraftMutationResult('所需灵石、材料或保护物不足。');
        }
        const workingItem = target.ref.source === 'inventory'
            ? extractInventoryItemByInstanceId(player, target.ref.itemInstanceId)
            : extractEquipmentItem(player, target.ref.slot);
        if (!workingItem) {
            return buildCraftMutationResult('强化目标不存在。');
        }
        // 装备类必须有稳定 itemInstanceId 才能进入锁定空间作为索引键
        assignItemInstanceIdIfNeeded(workingItem as ItemStack);
        const workingInstanceId = typeof (workingItem as ItemStack).itemInstanceId === 'string'
            ? (workingItem as ItemStack).itemInstanceId
            : '';
        if (!workingInstanceId) {
            return buildCraftMutationResult('强化目标缺失实例标识。');
        }
        for (const material of materials) {
            consumeInventoryItemByItemId(player, material.itemId, material.count);
        }
        const roleEnhancementLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        const totalSpeedRate = computeEnhancementToolSpeedRate(this.getWeapon(player)?.enhancementSpeedRate, roleEnhancementLevel, target.item.level);
        const successRate = computeEnhancementAdjustedSuccessRate(targetLevel, roleEnhancementLevel, target.item.level, this.getWeapon(player)?.enhancementSuccessRate);
        const totalTicks = computeEnhancementJobTicks(target.item.level, totalSpeedRate);
        const protectionItemId = protection ? (config?.protectionItemId ?? target.item.itemId) : undefined;
        const protectionItemName = protectionItemId
            ? (this.contentTemplateRepository.getItemName(protectionItemId) ?? protectionItemId)
            : undefined;
        const protectionItemSignature = protection
            ? createItemStackSignature(protection.item)
            : undefined;
        const jobRunId = createCraftJobRunId(player.playerId, 'enhancement');
        // 把工件移入锁定空间（escrow）：之后的强化结算路径都通过 itemInstanceId 取出/写回
        if (!Array.isArray(player.inventory.lockedItems)) {
            player.inventory.lockedItems = [];
        }
        // 锁定时同步把当前 enhanceLevel 对齐到 currentLevel，保证后续 mutation 一致
        (workingItem as ItemStack).enhanceLevel = currentLevel;
        (workingItem as ItemStack).count = 1;
        lockItem(player.inventory.lockedItems, workingItem as unknown as Record<string, unknown>, `enhancement:${jobRunId}`);
        player.enhancementJob = {
            jobRunId,
            jobType: 'enhancement',
            target: cloneTargetRef(target.ref),
            itemInstanceId: workingInstanceId,
            targetItemId: target.item.itemId,
            targetItemName: target.item.name ?? target.item.itemId,
            targetItemLevel: Math.max(1, Math.floor(Number(target.item.level) || 1)),
            currentLevel,
            targetLevel,
            desiredTargetLevel,
            spiritStoneCost,
            materials: materials.map((entry) => ({ ...entry })),
            protectionUsed: Boolean(protection),
            protectionStartLevel,
            protectionItemId,
            protectionItemName,
            protectionItemSignature,
            phase: 'enhancing',
            pausedTicks: 0,
            successRate,
            totalTicks,
            remainingTicks: totalTicks,
            startedAt: Date.now(),
            roleEnhancementLevel,
            totalSpeedRate,
            jobVersion: 1,
            queuedJobs,
        };
        this.touchEnhancementRecord(player, {
            itemId: target.item.itemId,
            actionStartedAt: player.enhancementJob.startedAt,
            startLevel: currentLevel,
            initialTargetLevel: targetLevel,
            desiredTargetLevel,
            protectionStartLevel,
            status: 'in_progress',
        });
        this.finalizeMutation(player, {
            inventoryChanged: true,
            equipmentChanged: target.ref.source === 'equipment',
            persistentOnly: true,
            dirtyDomains: ['active_job', 'enhancement_record'],
        });
        return {
            ok: true,
            panelChanged: true,
            inventoryChanged: true,
            messages: [{
                    kind: 'quest',
                    text: desiredTargetLevel > targetLevel
                        ? `开始强化 ${target.item.name ?? target.item.itemId}，先冲击 +${targetLevel}，最终目标 +${desiredTargetLevel}${protection ? `，保护从 +${protectionStartLevel} 开始生效` : ''}。`
                        : `开始强化 ${target.item.name ?? target.item.itemId}，目标 +${targetLevel}，预计耗时 ${totalTicks} 息。`,
                }],
        };
    }
    /**
 * cancelEnhancement：判断cancel强化是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成cancel强化的条件判断。
 */

    cancelEnhancement(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const job = player.enhancementJob;
        if (!job || job.remainingTicks <= 0) {
            return buildCraftMutationResult('当前没有可取消的强化任务。');
        }
        const finishResult = this.finishEnhancementJob(player, job.currentLevel, 'cancelled');
        return {
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
    }
    /**
 * interruptEnhancement：执行interrupt强化相关逻辑。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新interrupt强化相关状态。
 */

    interruptEnhancement(player, reason) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const job = player.enhancementJob;
        const addedPauseTicks = applyTechniqueActivityInterrupt(job, ENHANCEMENT_INTERRUPT_PAUSE_TICKS);
        if (addedPauseTicks <= 0) {
            return buildCraftTickResult();
        }
        this.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return buildCraftTickResult(true, [{
                kind: 'system',
                text: buildTechniqueActivityInterruptMessage(
                    job.targetItemName,
                    '强化',
                    ENHANCEMENT_INTERRUPT_PAUSE_TICKS,
                    reason,
                ),
            }]);
    }
    /**
 * tickEnhancement：执行tick强化相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新tick强化相关状态。
 */

    tickEnhancement(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const job = player.enhancementJob;
        if (!job || job.remainingTicks <= 0) {
            return buildCraftTickResult();
        }
        job.remainingTicks = Math.max(0, job.remainingTicks - 1);
        if (job.phase === 'paused') {
            const resumed = advanceTechniqueActivityPause(job, 'enhancing');
            if (!resumed.resumed) {
                this.finalizeMutation(player, {
                    persistentOnly: true,
                    dirtyDomains: ['active_job'],
                });
                return buildCraftTickResult();
            }
            this.finalizeMutation(player, {
                persistentOnly: true,
                dirtyDomains: ['active_job'],
            });
            return buildCraftTickResult(true);
        }
        if (job.remainingTicks > 0) {
            this.finalizeMutation(player, {
                persistentOnly: true,
                dirtyDomains: ['active_job'],
            });
            return buildCraftTickResult();
        }
        const success = Math.random() < job.successRate;
        if (success) {
            try {
                this.playerRuntimeService.debitWallet(player.playerId, SPIRIT_STONE_ITEM_ID, job.spiritStoneCost);
            }
            catch (error) {
                if (error instanceof TypeError || error instanceof ReferenceError) {
                    console.error(`[制作] 扣费异常 player=${player.playerId}：`, error);
                }
                const finishResult = this.finishEnhancementJob(player, job.currentLevel, 'stopped');
                return buildCraftTickResult(true, [{
                        kind: 'system',
                        text: `${job.targetItemName} 强化中断，结算时灵石不足，本阶未能继续。`,
                    }], finishResult.inventoryChanged, finishResult.equipmentChanged, finishResult.attrChanged, finishResult.groundDrops);
            }
        }
        const protectionActiveForStep = this.shouldUseProtectionForStep(job.targetLevel, job.protectionStartLevel);
        if (!success && protectionActiveForStep && !this.consumeProtectionItemForFailure(player, job)) {
            const finishResult = this.finishEnhancementJob(player, job.currentLevel, 'stopped');
            return buildCraftTickResult(true, [{
                    kind: 'system',
                    text: `${job.targetItemName} 强化失败，保护物不足，本阶已终止。`,
                }], finishResult.inventoryChanged, finishResult.equipmentChanged, finishResult.attrChanged, finishResult.groundDrops);
        }
        const resultingLevel = success
            ? job.targetLevel
            : protectionActiveForStep
                ? Math.max(0, job.currentLevel - 1)
                : 0;
        this.touchEnhancementLevelRecord(player, job.targetItemId, job.targetLevel, success, resultingLevel);
        const skillGain = resolveEnhancementSkillExpGain(this.playerRuntimeService, player.enhancementSkill, job.targetItemLevel, success);
        const skillChanged = applyCraftSkillExp(player.enhancementSkill, skillGain, (level) => resolveCraftSkillExpToNextByLevel(this.playerRuntimeService, level));
        player.enhancementSkillLevel = player.enhancementSkill.level;
        if (skillChanged) {
            this.finalizeMutation(player, {
                attrChanged: true,
                persistentOnly: true,
                dirtyDomains: ['profession'],
            });
        }
        if (resultingLevel < job.desiredTargetLevel) {
            const continueResult = this.advanceEnhancementJob(player, resultingLevel);
            if (continueResult) {
                if (continueResult.continued) {
                    return buildCraftTickResult(true, continueResult.messages, continueResult.inventoryChanged, continueResult.equipmentChanged, skillChanged || continueResult.attrChanged, continueResult.groundDrops, skillGain / 2);
                }
                return buildCraftTickResult(true, continueResult.messages, continueResult.inventoryChanged, continueResult.equipmentChanged, skillChanged || continueResult.attrChanged, continueResult.groundDrops, skillGain / 2);
            }
        }
        const queuedJobs = cloneCraftQueue(job.queuedJobs);
        const finishResult = this.finishEnhancementJob(player, resultingLevel, 'completed');
            const nextStartResult: any = this.startNextQueuedCraftJob(player, queuedJobs);
        return buildCraftTickResult(true, [{
                kind: success ? 'quest' : 'system',
                text: success
                    ? `${job.targetItemName} 强化成功，已提升至 +${resultingLevel}。`
                    : protectionActiveForStep
                        ? `${job.targetItemName} 强化失败，保护生效，降为 +${resultingLevel}。`
                        : `${job.targetItemName} 强化失败，已归零为 +0。`,
            }, ...(nextStartResult.messages ?? [])], finishResult.inventoryChanged || Boolean(nextStartResult.inventoryChanged), finishResult.equipmentChanged || Boolean(nextStartResult.equipmentChanged), finishResult.attrChanged || skillChanged || Boolean(nextStartResult.attrChanged), [...(finishResult.groundDrops ?? []), ...(nextStartResult.groundDrops ?? [])], skillGain / 2);
    }
    /** 从等待队列取下一项制造任务并启动。 */
    startNextQueuedCraftJob(player, queuedJobs) {
        const queue = cloneCraftQueue(queuedJobs);
        while (queue.length > 0) {
            const next = queue.shift();
            if (!next || typeof next !== 'object') {
                continue;
            }
            const payload = {
                ...(next.payload && typeof next.payload === 'object' ? next.payload : {}),
                queueMode: 'preserve',
                __queuedJobs: queue,
            };
            const result = next.kind === 'enhancement'
                ? this.startEnhancement(player, payload)
                : next.kind === 'alchemy'
                    ? this.startAlchemy(player, payload)
                    : next.kind === 'forging'
                        ? this.startForging(player, payload)
                        : buildCraftMutationResult('未知制造任务暂未接入运行时。');
            if (result?.ok) {
                return {
                    ...result,
                    messages: [
                        {
                            kind: 'system',
                            text: `开始队列中的制造任务：${next.label}`,
                        },
                        ...(result.messages ?? []),
                    ],
                };
            }
            if (queue.length <= 0) {
                return {
                    ok: true,
                    panelChanged: true,
                    messages: [{
                            kind: 'system',
                text: `队列任务无法开始，已跳过：${next.label}。${(result as Record<string, unknown>)?.error ?? ''}`.trim(),
                        }],
                };
            }
        }
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
 * getCultivationBlockReason：读取CultivationBlockReason。
 * @param player 玩家对象。
 * @returns 无返回值，完成CultivationBlockReason的读取/组装。
 */

    getCultivationBlockReason(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.hasActiveAlchemyJob(player)) {
            return '炼丹进行中，暂时不能切换修炼。';
        }
        if (this.hasActiveForgingJob(player)) {
            return '炼器进行中，暂时不能切换修炼。';
        }
        if (this.hasActiveEnhancementJob(player)) {
            return '强化进行中，暂时不能切换修炼。';
        }
        return null;
    }
    /**
 * hasEquippedFurnace：判断EquippedFurnace是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成EquippedFurnace的条件判断。
 */

    hasEquippedFurnace(player) {
        return Boolean(this.getWeapon(player)?.tags?.includes(ALCHEMY_FURNACE_TAG));
    }
    hasEquippedForgingTool(player) {
        return Boolean(this.getWeapon(player)?.tags?.includes('forging_tool'));
    }
    getAlchemyLikeToolSpeedRate(player, jobKind) {
        const weapon = this.getWeapon(player);
        if (jobKind === 'forging' ? !this.hasEquippedForgingTool(player) : !this.hasEquippedFurnace(player)) {
            return 0;
        }
        return Number.isFinite(weapon?.alchemySpeedRate) ? Number(weapon.alchemySpeedRate) : 0;
    }
    getAlchemyLikeToolSuccessRate(player, jobKind) {
        const weapon = this.getWeapon(player);
        if (jobKind === 'forging' ? !this.hasEquippedForgingTool(player) : !this.hasEquippedFurnace(player)) {
            return 0;
        }
        return Number.isFinite(weapon?.alchemySuccessRate) ? Number(weapon.alchemySuccessRate) : 0;
    }

    /**
 * hasEquippedHammer：判断EquippedHammer是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成EquippedHammer的条件判断。
 */

    hasEquippedHammer(player) {
        return Boolean(this.getWeapon(player)?.tags?.includes(ENHANCEMENT_HAMMER_TAG));
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
        // 锻造独立化迁移：将寄生在 alchemyJob 上的 forging 任务迁移到独立 forgingJob 槽。
        if (player.alchemyJob?.jobType === 'forging') {
            player.forgingJob = player.alchemyJob;
            player.alchemyJob = null;
            this.finalizeMutation(player, {
                persistentOnly: true,
                dirtyDomains: ['active_job'],
            });
        }
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
        return this.craftPanelAlchemyQueryService.buildAlchemyPanelState(player, this.getWeapon(player));
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const candidates = [];
        player.inventory.items.forEach((item) => {
            assignItemInstanceIdIfNeeded(item);
            const itemInstanceId = normalizeInventoryItemInstanceId(item?.itemInstanceId);
            if (!itemInstanceId) {
                return;
            }
            const candidate = this.buildEnhancementCandidate(player, { source: 'inventory', itemInstanceId }, item);
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
    /**
 * buildEnhancementCandidate：构建并返回目标对象。
 * @param player 玩家对象。
 * @param ref 参数说明。
 * @param item 道具。
 * @returns 无返回值，直接更新强化Candidate相关状态。
 */

    buildEnhancementCandidate(player, ref, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!item || item.type !== 'equipment') {
            return null;
        }
        const currentLevel = normalizeEnhanceLevel(item.enhanceLevel);
        if (currentLevel >= MAX_ENHANCE_LEVEL) {
            return null;
        }
        const nextLevel = currentLevel + 1;
        const hammer = this.getWeapon(player);
        const enhancementSkillLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        const config = this.enhancementConfigs.get(item.itemId);
        const requirements = this.getEnhancementRequirements(config, nextLevel);
        const totalSpeedRate = computeEnhancementToolSpeedRate(hammer?.enhancementSpeedRate, enhancementSkillLevel, item.level);
        return {
            ref,
            item: cloneItem(item),
            currentLevel,
            nextLevel,
            spiritStoneCost: getEnhancementSpiritStoneCost(item.level, requirements.length > 0),
            successRate: computeEnhancementAdjustedSuccessRate(nextLevel, enhancementSkillLevel, item.level, hammer?.enhancementSuccessRate),
            durationTicks: computeEnhancementJobTicks(item.level, totalSpeedRate),
            materials: requirements.map((entry) => ({
                itemId: entry.itemId,
                name: this.contentTemplateRepository.getItemName(entry.itemId) ?? entry.itemId,
                count: entry.count,
                ownedCount: countInventoryItem(player, entry.itemId),
            })),
            protectionItemId: config?.protectionItemId,
            protectionItemName: config?.protectionItemId
                ? (this.contentTemplateRepository.getItemName(config.protectionItemId) ?? config.protectionItemId)
                : undefined,
            allowSelfProtection: !config?.protectionItemId,
            protectionCandidates: this.buildProtectionCandidates(player, ref, item, config),
        };
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
        const candidates = [];
        const targetProtectionItemId = config?.protectionItemId ?? item.itemId;
        const targetInstanceId = ref.source === 'inventory' ? normalizeInventoryItemInstanceId(ref.itemInstanceId) : '';
        player.inventory.items.forEach((entry) => {
            if (!entry || !this.isEligibleProtectionItem(entry, targetProtectionItemId, item.itemId)) {
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
    /**
 * getEnhancementRequirements：读取强化Requirement。
 * @param config 参数说明。
 * @param targetLevel 参数说明。
 * @returns 无返回值，完成强化Requirement的读取/组装。
 */

    getEnhancementRequirements(config, targetLevel) {
        const step = config?.steps.find((entry) => entry.targetEnhanceLevel === targetLevel);
        return (step?.materials ?? []).map((entry) => ({ ...entry }));
    }
    /**
 * getWeapon：读取Weapon。
 * @param player 玩家对象。
 * @returns 无返回值，完成Weapon的读取/组装。
 */

    getWeapon(player) {
        const weapon = this.getEquippedItem(player, 'weapon');
        return weapon
            ? applyEquipmentAttributeEffectivenessToItemStack(weapon, player?.realm?.realmLv ?? player?.realmLv)
            : null;
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
        const normalized = Math.floor(Number(requestedTargetLevel) || 0);
        return Math.min(MAX_ENHANCE_LEVEL, Math.max(currentLevel + 1, normalized || (currentLevel + 1)));
    }
    /**
 * resolveProtectionStartLevel：规范化或转换Protection开始等级。
 * @param desiredTargetLevel 参数说明。
 * @param requestedProtectionStartLevel 参数说明。
 * @returns 无返回值，直接更新ProtectionStart等级相关状态。
 */

    resolveProtectionStartLevel(desiredTargetLevel, requestedProtectionStartLevel) {
        const normalized = Math.floor(Number(requestedProtectionStartLevel) || 0);
        return Math.max(2, Math.min(desiredTargetLevel, normalized || 2));
    }
    /**
 * shouldUseProtectionForStep：判断UseProtectionForStep是否满足条件。
 * @param targetLevel 参数说明。
 * @param protectionStartLevel 参数说明。
 * @returns 无返回值，完成UseProtectionForStep的条件判断。
 */

    shouldUseProtectionForStep(targetLevel, protectionStartLevel) {
        return typeof protectionStartLevel === 'number' && targetLevel >= protectionStartLevel;
    }
    /**
 * resolveEnhancementTarget：读取强化目标并返回结果。
 * @param player 玩家对象。
 * @param ref 参数说明。
 * @returns 无返回值，直接更新强化目标相关状态。
 */

    resolveEnhancementTarget(player, ref) {
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
                resolved = item ? { ref: { source: 'inventory', itemInstanceId: directItemInstanceId }, item } : null;
            }
        } else if (ref.source === 'equipment') {
            const slot = normalizeEquipSlot(ref.slot);
            if (!slot) {
                return null;
            }
            const item = this.getEquippedItem(player, slot);
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
            this.logger.warn(
                `enhancement target itemInstanceId mismatch player=${player.playerId} `
                + `expected=${expected} actual=${actual} ref=${JSON.stringify(ref)} `
                + `hardCheck=${hardCheck}`,
            );
            if (hardCheck) {
                return { mismatched: true } as unknown as ReturnType<typeof this.resolveEnhancementTarget>;
            }
        }
        return resolved;
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!ref || ref.source !== 'inventory') {
            return null;
        }
        const protection = this.resolveEnhancementTarget(player, ref);
        if (!protection || protection.ref.source !== 'inventory') {
            return null;
        }
        const expectedItemId = config?.protectionItemId ?? target.item.itemId;
        if (!this.isEligibleProtectionItem(protection.item, expectedItemId, target.item.itemId)) {
            return null;
        }
        if (target.ref.source === 'inventory'
            && normalizeInventoryItemInstanceId(protection.ref.itemInstanceId) === normalizeInventoryItemInstanceId(target.ref.itemInstanceId)
            && Math.max(0, Math.floor(Number(target.item.count) || 0)) < 2) {
            return null;
        }
        return protection;
    }
    /**
 * touchEnhancementRecord：执行touch强化Record相关逻辑。
 * @param player 玩家对象。
 * @param input 输入参数。
 * @returns 无返回值，直接更新touch强化Record相关状态。
 */

    touchEnhancementRecord(player, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const itemId = normalizeText(input.itemId);
        if (!itemId) {
            return null;
        }
        const existing = (player.enhancementRecords ?? []).find((entry) => entry.itemId === itemId);
        if (existing) {
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
            this.playerRuntimeService.markPersistenceDirtyDomains(player, ['enhancement_record']);
            return existing;
        }
        const created = {
            itemId,
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
        this.playerRuntimeService.markPersistenceDirtyDomains(player, ['enhancement_record']);
        return created;
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const existing = (player.enhancementRecords ?? []).find((entry) => entry.itemId === normalizeText(itemId));
        const job = player.enhancementJob?.targetItemId === itemId ? player.enhancementJob : null;
        const record = this.touchEnhancementRecord(player, existing
            ? {
                itemId,
                status: 'in_progress',
            }
            : {
                itemId,
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
    /**
 * advanceEnhancementJob：执行advance强化Job相关逻辑。
 * @param player 玩家对象。
 * @param currentLevel 参数说明。
 * @returns 无返回值，直接更新advance强化Job相关状态。
 */

    advanceEnhancementJob(player, currentLevel) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const job = player.enhancementJob;
        if (!job || currentLevel >= job.desiredTargetLevel) {
            return null;
        }
        const nextTargetLevel = currentLevel + 1;
        const config = this.enhancementConfigs.get(job.targetItemId);
        const nextMaterials = this.getEnhancementRequirements(config, nextTargetLevel);
        const nextSpiritStoneCost = getEnhancementSpiritStoneCost(job.targetItemLevel, nextMaterials.length > 0);
        const protectionItemId = this.shouldUseProtectionForStep(nextTargetLevel, job.protectionStartLevel)
            ? (config?.protectionItemId ?? job.targetItemId)
            : undefined;
        if (!this.hasEnoughQueuedEnhancementResources(player, protectionItemId, job.targetItemId, nextSpiritStoneCost, nextMaterials)) {
            const finishResult = this.finishEnhancementJob(player, currentLevel, 'stopped');
            return {
                continued: false,
                inventoryChanged: finishResult.inventoryChanged,
                equipmentChanged: finishResult.equipmentChanged,
                attrChanged: finishResult.attrChanged,
                groundDrops: finishResult.groundDrops,
                messages: [{
                        kind: 'system',
                        text: `${job.targetItemName} 当前已到 +${currentLevel}，后续强化所需灵石、材料或保护物不足，队列已停止。`,
                    }],
            };
        }
        for (const material of nextMaterials) {
            consumeInventoryItemByItemId(player, material.itemId, material.count);
        }
        const roleEnhancementLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        const totalSpeedRate = computeEnhancementToolSpeedRate(this.getWeapon(player)?.enhancementSpeedRate, roleEnhancementLevel, job.targetItemLevel);
        const totalTicks = computeEnhancementJobTicks(job.targetItemLevel, totalSpeedRate);
        const lockedEntry = getLockedItem(player.inventory.lockedItems ?? [], job.itemInstanceId);
        if (!lockedEntry) {
            const finishResult = this.finishEnhancementJob(player, currentLevel, 'stopped');
            return {
                continued: false,
                inventoryChanged: finishResult.inventoryChanged,
                equipmentChanged: finishResult.equipmentChanged,
                attrChanged: finishResult.attrChanged,
                groundDrops: finishResult.groundDrops,
                messages: [{
                        kind: 'system',
                        text: `${job.targetItemName} 当前强化目标数据缺失，队列已停止。`,
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
        job.successRate = computeEnhancementAdjustedSuccessRate(nextTargetLevel, roleEnhancementLevel, job.targetItemLevel, this.getWeapon(player)?.enhancementSuccessRate);
        job.totalTicks = totalTicks;
        job.remainingTicks = totalTicks;
        job.startedAt = Date.now();
        job.roleEnhancementLevel = roleEnhancementLevel;
        job.totalSpeedRate = totalSpeedRate;
        this.finalizeMutation(player, {
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
                    kind: 'quest',
                    text: `${job.targetItemName} 已调整为 +${currentLevel}，继续冲击 +${nextTargetLevel}。`,
                }],
        };
    }
    /**
 * finishEnhancementJob：判断完成强化Job是否满足条件。
 * @param player 玩家对象。
 * @param resultingLevel 参数说明。
 * @param status 参数说明。
 * @returns 无返回值，直接更新finish强化Job相关状态。
 */

    finishEnhancementJob(player, resultingLevel, status) {
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
            player.enhancementJob = null;
            this.finalizeMutation(player, {
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
        const resolvedItem = this.contentTemplateRepository.normalizeItem({
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
        const groundDrops = [];
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
        else if (canReceiveCraftItem(player, resolvedItem)) {
            // 装备槽已被替换，或来源是背包 → 走入手链路
            receiveInventoryItem(player, this.contentTemplateRepository, resolvedItem);
            inventoryChanged = true;
        }
        else {
            groundDrops.push(resolvedItem);
        }
        const record = (player.enhancementRecords ?? []).find((entry) => entry.itemId === job.targetItemId);
        if (record) {
            record.actionEndedAt = Date.now();
            record.status = status;
            record.highestLevel = Math.max(record.highestLevel, resultingLevel);
        }
        player.enhancementJob = null;
        this.finalizeMutation(player, {
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
            void this.persistEnhancementRecords(player).catch((error) => {
                this.logger.warn(`强化记录直写失败，已标记脏数据等待重试：${error instanceof Error ? error.message : String(error)}`);
                this.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['enhancement_record']);
            });
        }
        return {
            inventoryChanged,
            equipmentChanged,
            attrChanged,
            groundDrops,
        };
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
        if (!this.playerRuntimeService.canAffordWallet(player.playerId, SPIRIT_STONE_ITEM_ID, spiritStoneCost)) {
            return false;
        }
        return materials.every((entry) => (counts.get(entry.itemId) ?? 0) >= entry.count);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const counts = new Map();
        for (const item of player.inventory.items) {
            counts.set(item.itemId, (counts.get(item.itemId) ?? 0) + Math.max(0, Math.floor(Number(item.count) || 0)));
        }
        if (!this.playerRuntimeService.canAffordWallet(player.playerId, SPIRIT_STONE_ITEM_ID, spiritStoneCost)) {
            return false;
        }
        if (protectionItemId && this.getEligibleProtectionCount(player, protectionItemId, targetItemId) < 1) {
            return false;
        }
        return materials.every((entry) => (counts.get(entry.itemId) ?? 0) >= entry.count);
    }
    /**
 * consumeProtectionItemForFailure：执行consumeProtection道具ForFailure相关逻辑。
 * @param player 玩家对象。
 * @param job 参数说明。
 * @returns 无返回值，直接更新consumeProtection道具ForFailure相关状态。
 */

    consumeProtectionItemForFailure(player, job) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const protectionItemId = job.protectionItemId ?? job.targetItemId;
        if (job.protectionItemSignature
            && this.consumeInventoryItemByPredicate(player, (item) => createItemStackSignature(item) === job.protectionItemSignature, 1)) {
            return true;
        }
        return this.consumeInventoryItemByPredicate(player, (item) => this.isEligibleProtectionItem(item, protectionItemId, job.targetItemId), 1);
    }
    /**
 * consumeInventoryItemByPredicate：执行consume背包道具ByPredicate相关逻辑。
 * @param player 玩家对象。
 * @param predicate 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具ByPredicate相关状态。
 */

    consumeInventoryItemByPredicate(player, predicate, count) {
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
    /**
 * isSelfProtectionItem：判断SelfProtection道具是否满足条件。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @returns 无返回值，完成SelfProtection道具的条件判断。
 */

    isSelfProtectionItem(protectionItemId, targetItemId) {
        return protectionItemId === targetItemId;
    }
    /**
 * isEligibleProtectionItem：判断EligibleProtection道具是否满足条件。
 * @param item 道具。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @returns 无返回值，完成EligibleProtection道具的条件判断。
 */

    isEligibleProtectionItem(item, protectionItemId, targetItemId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!item || item.itemId !== protectionItemId) {
            return false;
        }
        if (!this.isSelfProtectionItem(protectionItemId, targetItemId)) {
            return true;
        }
        return item.type === 'equipment' && normalizeEnhanceLevel(item.enhanceLevel) === 0;
    }
    /**
 * getEligibleProtectionCount：读取EligibleProtection数量。
 * @param player 玩家对象。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @returns 无返回值，完成EligibleProtection数量的读取/组装。
 */

    getEligibleProtectionCount(player, protectionItemId, targetItemId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let total = 0;
        for (const item of player.inventory.items) {
            if (!this.isEligibleProtectionItem(item, protectionItemId, targetItemId)) {
                continue;
            }
            total += Math.max(0, Math.floor(Number(item.count) || 0));
        }
        return total;
    }
    /**
 * persistEnhancementRecords：执行persist强化Records相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新persist强化Records相关状态。
 */

    async persistEnhancementRecords(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        // 运行时记录使用 `levels` 字段，DB 列为 `levels_payload` 且 NOT NULL；
        // 必须先归一为 EnhancementRecordRow 形态，否则 levels_payload undefined 会触发非空约束违反。
        const rows = buildEnhancementRecordRowsFromEntries(playerId, player.enhancementRecords ?? []);
        await this.playerDomainPersistenceService.savePlayerEnhancementRecords(playerId, rows, {
            versionSeed: player.persistentRevision,
        });
    }
    /**
 * persistAlchemyPresets：执行persist炼丹Presets相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新persist炼丹Presets相关状态。
 */

    async persistAlchemyPresets(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        await this.playerDomainPersistenceService.savePlayerAlchemyPresets(playerId, [...(player.alchemyPresets ?? [])], {
            versionSeed: player.persistentRevision,
        });
    }
    /**
 * persistActiveJob：执行persist活跃Job相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新persist活跃Job相关状态。
 */

    async persistActiveJob(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        const activeJob = buildActiveJobSnapshotFromPlayer(player);
        await this.playerDomainPersistenceService.savePlayerActiveJob(playerId, activeJob, {
            versionSeed: player.persistentRevision,
        });
    }
    /**
 * persistTechniqueActivitySnapshot：执行persist技艺活动Snapshot相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新persist技艺活动Snapshot相关状态。
 */

    async persistTechniqueActivitySnapshot(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!this.playerDomainPersistenceService?.isEnabled?.()) {
            return;
        }
        const playerId = typeof player?.playerId === 'string' ? player.playerId.trim() : '';
        if (!playerId) {
            return;
        }
        const activeJob = buildActiveJobSnapshotFromPlayer(player);
        await this.playerDomainPersistenceService.savePlayerActiveJob(playerId, activeJob, {
            versionSeed: player.persistentRevision,
        });
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
            this.playerRuntimeService.playerProgressionService.refreshPreview(player);
            dirtyDomains.push('inventory');
        }
        if (options.equipmentChanged) {
            player.equipment.revision += 1;
            this.playerRuntimeService.playerAttributesService.recalculate(player);
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
            bumpActiveJobVersion(player);
        }
        if (dirtyDomains.length > 0) {
            this.playerRuntimeService.markPersistenceDirtyDomains(player, dirtyDomains);
        }
        if (options.inventoryChanged || options.equipmentChanged || options.attrChanged || options.persistentOnly || dirtyDomains.length > 0) {
            this.playerRuntimeService.bumpPersistentRevision(player);
        }
        if (dirtyDomains.includes('active_job') && !player?.suppressImmediateDomainPersistence) {
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
            ? raw.map((entry) => this.toAlchemyCatalogEntry({ ...entry, category: 'special' })).filter(Boolean)
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
        const ingredients = Array.isArray(entry.ingredients)
            ? entry.ingredients.map((ingredient) => toAlchemyIngredientDef(this.contentTemplateRepository, ingredient)).filter(Boolean)
            : [];
        if (ingredients.length === 0) {
            return null;
        }
        const category = resolveAlchemyRecipeCategory(outputItem, recipeId);
        return {
            recipeId,
            outputItemId,
            outputName: outputItem.name,
            category,
            outputCount: normalizePositiveInt(entry.outputCount, 1),
            outputLevel: normalizePositiveInt(outputItem.level, 1),
            baseBrewTicks: normalizePositiveInt(entry.baseBrewTicks, 1),
            fullPower: ingredients.reduce((total, ingredient) => total + ingredient.powerPerUnit * ingredient.count, 0),
            ingredients,
        };
    }
};
/**
 * resolveContentPath：规范化或转换内容路径。
 * @param segments 参数说明。
 * @returns 无返回值，直接更新内容路径相关状态。
 */

function resolveContentPath(...segments) {
    return resolveProjectPath('packages', 'server', 'data', 'content', ...segments);
}
/**
 * walkJsonFiles：执行walkJsonFile相关逻辑。
 * @param root 参数说明。
 * @returns 无返回值，直接更新walkJsonFile相关状态。
 */

function walkJsonFiles(root) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!existsSync(root)) {
        return [];
    }
    const result = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const fullPath = join(root, entry.name);
        if (entry.isDirectory()) {
            result.push(...walkJsonFiles(fullPath));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.json')) {
            result.push(fullPath);
        }
    }
    return result;
}
/**
 * normalizePositiveInt：规范化或转换PositiveInt。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @returns 无返回值，直接更新PositiveInt相关状态。
 */

function normalizePositiveInt(value, fallback = 1) {
    return Math.max(1, Math.floor(Number(value) || fallback));
}
/**
 * normalizeCraftSkill：规范化或转换炼制技能。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼制技能相关状态。
 */

function normalizeCraftSkill(value, getExpToNextByLevel = null) {
    const level = Math.max(1, Math.floor(Number(value?.level) || 1));
    const resolvedExpToNext = typeof getExpToNextByLevel === 'function'
        ? getExpToNextByLevel(level)
        : Math.max(0, Math.floor(Number(value?.expToNext) || DEFAULT_CRAFT_EXP_TO_NEXT));
    return {
        level,
        exp: Math.max(0, Math.floor(Number(value?.exp) || 0)),
        expToNext: Math.max(0, Math.floor(Number(resolvedExpToNext) || 0)),
    };
}
/**
 * normalizeEnhancementConfig：规范化或转换强化配置。
 * @param value 参数说明。
 * @returns 无返回值，直接更新强化配置相关状态。
 */

function normalizeEnhancementConfig(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const targetItemId = typeof value?.targetItemId === 'string' ? value.targetItemId.trim() : '';
    if (!targetItemId) {
        return null;
    }
    return {
        targetItemId,
        protectionItemId: typeof value?.protectionItemId === 'string' && value.protectionItemId.trim()
            ? value.protectionItemId.trim()
            : undefined,
        steps: Array.isArray(value?.steps)
            ? value.steps.map((entry) => ({
                targetEnhanceLevel: Math.max(1, Math.floor(Number(entry?.targetEnhanceLevel) || 1)),
                materials: Array.isArray(entry?.materials)
                    ? entry.materials
                        .map((material) => normalizeEnhancementRequirement(material))
                        .filter(Boolean)
                    : [],
            }))
            : [],
    };
}
/**
 * normalizeEnhancementRequirement：规范化或转换强化Requirement。
 * @param value 参数说明。
 * @returns 无返回值，直接更新强化Requirement相关状态。
 */

function normalizeEnhancementRequirement(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const itemId = typeof value?.itemId === 'string' ? value.itemId.trim() : '';
    const count = Math.max(1, Math.floor(Number(value?.count) || 0));
    if (!itemId || count <= 0) {
        return null;
    }
    return { itemId, count };
}
/**
 * toAlchemyIngredientDef：执行to炼丹IngredientDef相关逻辑。
 * @param contentTemplateRepository 参数说明。
 * @param ingredient 参数说明。
 * @returns 无返回值，直接更新to炼丹IngredientDef相关状态。
 */

function toAlchemyIngredientDef(contentTemplateRepository, ingredient) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const itemId = typeof ingredient?.itemId === 'string' ? ingredient.itemId.trim() : '';
    const item = contentTemplateRepository.createItem(itemId, 1);
    if (!item) {
        return null;
    }
    return {
        itemId,
        name: item.name,
        count: normalizePositiveInt(ingredient?.count, 1),
        role: ingredient?.role === 'main' ? 'main' : 'aux',
        level: normalizePositiveInt(item.level, 1),
        grade: item.grade ?? 'mortal',
        powerPerUnit: computeAlchemyMaterialPower(item.level, item.grade, 1),
    };
}
/**
 * resolveAlchemyRecipeCategory：规范化或转换炼丹RecipeCategory。
 * @param outputItem 参数说明。
 * @param recipeId recipe ID。
 * @returns 无返回值，直接更新炼丹RecipeCategory相关状态。
 */

function resolveAlchemyRecipeCategory(outputItem, recipeId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if ((outputItem.consumeBuffs?.length ?? 0) > 0) {
        return 'buff';
    }
    if (typeof outputItem.healAmount === 'number'
        || typeof outputItem.healPercent === 'number'
        || typeof outputItem.qiPercent === 'number') {
        return 'recovery';
    }
    return 'special';
}
/**
 * computeAlchemyMaterialPower：执行炼丹MaterialPower相关逻辑。
 * @param level 参数说明。
 * @param grade 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新炼丹MaterialPower相关状态。
 */

function computeAlchemyMaterialPower(level, grade, count = 1) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
    return normalizedLevel * (resolveAlchemyGradeValue(grade) ** 2) * normalizedCount;
}
/**
 * resolveAlchemyGradeValue：规范化或转换炼丹Grade值。
 * @param grade 参数说明。
 * @returns 无返回值，直接更新炼丹Grade值相关状态。
 */

function resolveAlchemyGradeValue(grade) {
    const index = TECHNIQUE_GRADE_ORDER.indexOf(grade ?? 'mortal');
    return Math.max(1, index + 1);
}
/**
 * cloneItem：构建道具。
 * @param item 道具。
 * @returns 无返回值，直接更新道具相关状态。
 */

function cloneItem(item) {
    if (!item || typeof item !== 'object') {
        return undefined;
    }
    return {
        ...item,
        equipAttrs: item.equipAttrs ? { ...item.equipAttrs } : undefined,
        equipStats: item.equipStats ? clonePartialNumericStats(item.equipStats) : undefined,
        equipValueStats: item.equipValueStats ? { ...item.equipValueStats } : undefined,
        consumeBuffs: Array.isArray(item.consumeBuffs) ? item.consumeBuffs.map((entry) => ({ ...entry })) : undefined,
        effects: Array.isArray(item.effects) ? item.effects.map((entry) => ({ ...entry })) : undefined,
        tags: Array.isArray(item.tags) ? item.tags.slice() : undefined,
    };
}
/**
 * clonePartialNumericStats：构建PartialNumericStat。
 * @param stats 参数说明。
 * @returns 无返回值，直接更新PartialNumericStat相关状态。
 */

function clonePartialNumericStats(stats) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!stats) {
        return undefined;
    }
    const clone = { ...stats };
    if (stats.elementDamageBonus) {
        clone.elementDamageBonus = { ...stats.elementDamageBonus };
    }
    if (stats.elementDamageReduce) {
        clone.elementDamageReduce = { ...stats.elementDamageReduce };
    }
    return clone;
}
/**
 * cloneEnhancementRecord：构建强化Record。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新强化Record相关状态。
 */

function cloneEnhancementRecord(entry) {
    return {
        ...entry,
        levels: Array.isArray(entry.levels) ? entry.levels.map((level) => ({ ...level })) : [],
    };
}
/**
 * cloneEnhancementJob：构建强化Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新强化Job相关状态。
 */

function cloneEnhancementJob(entry) {
    return {
        ...entry,
        target: entry.target ? { ...entry.target } : entry.target,
        // 旧版字段：仅在迁移期残留，按需透传不强构造；新版工件存在 inventory.lockedItems
        item: entry.item ? cloneItem(entry.item) : undefined,
        materials: Array.isArray(entry.materials) ? entry.materials.map((material) => ({ ...material })) : [],
    };
}

function createCraftJobRunId(playerId, jobType) {
    const normalizedJobType = jobType === 'enhancement' ? 'enhancement' : jobType === 'forging' ? 'forging' : 'alchemy';
    const entropy = Math.random().toString(36).slice(2, 8);
    return `job:${normalizedJobType}:${Date.now().toString(36)}${entropy}`;
}

function normalizeCraftQueueStartMode(value) {
    if (value === 'preserve' || value === 'append') {
        return value;
    }
    return 'replace';
}

function cloneCraftQueue(queue) {
    return Array.isArray(queue)
        ? queue
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => ({
            ...entry,
            payload: entry.payload && typeof entry.payload === 'object'
                ? structuredClone(entry.payload)
                : entry.payload,
        }))
        : [];
}

function getPlayerCraftQueue(player) {
    return cloneCraftQueue(player?.enhancementJob?.queuedJobs ?? player?.forgingJob?.queuedJobs ?? player?.alchemyJob?.queuedJobs ?? []);
}

function getAlchemyLikeJob(player, jobKind) {
    return jobKind === 'forging' ? player?.forgingJob ?? null : player?.alchemyJob ?? null;
}

function setAlchemyLikeJob(player, jobKind, job) {
    if (jobKind === 'forging') {
        player.forgingJob = job;
    }
    else {
        player.alchemyJob = job;
    }
}

function buildCraftQueueId(kind) {
    const normalizedKind = kind === 'enhancement' ? 'enhancement' : kind === 'forging' ? 'forging' : 'alchemy';
    return `craft-queue:${normalizedKind}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function buildAlchemyQueueItem(recipe, ingredients, quantity, kind = 'alchemy') {
    const normalizedKind = kind === 'forging' ? 'forging' : 'alchemy';
    return {
        queueId: buildCraftQueueId(normalizedKind),
        kind: normalizedKind,
        label: recipe?.outputName ?? recipe?.outputItemId ?? (normalizedKind === 'forging' ? '炼器任务' : '炼丹任务'),
        quantity,
        createdAt: Date.now(),
        payload: {
            kind: normalizedKind,
            recipeId: recipe.recipeId,
            ingredients: cloneAlchemyIngredientSelections(ingredients),
            quantity,
        },
    };
}

function buildEnhancementQueueItem(target, protection, payload, desiredTargetLevel) {
    return {
        queueId: buildCraftQueueId('enhancement'),
        kind: 'enhancement',
        label: target?.item?.name ?? target?.item?.itemId ?? '强化任务',
        quantity: desiredTargetLevel,
        createdAt: Date.now(),
        payload: {
            target: target?.ref ? cloneTargetRef(target.ref) : undefined,
            protection: protection?.ref ? cloneTargetRef(protection.ref) : undefined,
            targetLevel: payload?.targetLevel,
            protectionStartLevel: payload?.protectionStartLevel,
        },
    };
}

function buildActiveJobSnapshotFromPlayer(player) {
    if (player?.enhancementJob) {
        return buildActiveJobSnapshot(player.enhancementJob, 'enhancement');
    }
    if (player?.forgingJob) {
        return buildActiveJobSnapshot(player.forgingJob, 'forging');
    }
    if (player?.alchemyJob) {
        return buildActiveJobSnapshot(player.alchemyJob, player.alchemyJob.jobType === 'forging' ? 'forging' : 'alchemy');
    }
    return null;
}

function buildActiveJobSnapshot(job, jobType) {
    if (!job || typeof job !== 'object') {
        return null;
    }
    const normalizedJobType = jobType === 'enhancement' ? 'enhancement' : jobType === 'forging' ? 'forging' : 'alchemy';
    const jobRunId = typeof job.jobRunId === 'string' && job.jobRunId.trim()
        ? job.jobRunId.trim()
        : createCraftJobRunId(typeof job.playerId === 'string' ? job.playerId : '', normalizedJobType);
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

function bumpActiveJobVersion(player) {
    const activeJob = player?.enhancementJob ?? player?.forgingJob ?? player?.alchemyJob ?? null;
    if (!activeJob || typeof activeJob !== 'object') {
        return;
    }
    activeJob.jobVersion = Math.max(1, Math.trunc(Number(activeJob.jobVersion ?? 1))) + 1;
}

function isCompletedAlchemyLikeJob(job) {
    if (!job || typeof job !== 'object') {
        return false;
    }
    const quantity = Math.max(1, Math.trunc(Number(job.quantity ?? 1)));
    const completedCount = Math.max(0, Math.trunc(Number(job.completedCount ?? 0)));
    return completedCount >= quantity;
}
/**
 * countInventoryItem：执行数量背包道具相关逻辑。
 * @param player 玩家对象。
 * @param itemId 道具 ID。
 * @returns 无返回值，直接更新数量背包道具相关状态。
 */

function countInventoryItem(player, itemId) {
    // 灵石（SPIRIT_STONE_ITEM_ID）的 wallet.balances 由 syncWalletCacheFromInventory
    // 全量镜像自 inventory.items，不是独立账户；craft 实际消费走 debitWallet →
    // consumeInventoryItemCount，从 inventory 扣减。这里统一只读 inventory，
    // 让"持有量计数"与"可消费量"对齐，避免显示翻倍并误判材料充足。
    return player.inventory.items.reduce((total, entry) => entry.itemId === itemId ? total + entry.count : total, 0);
}
/**
 * receiveInventoryItem：执行receive背包道具相关逻辑。
 * @param player 玩家对象。
 * @param contentTemplateRepository 参数说明。
 * @param item 道具。
 * @returns 无返回值，直接更新receive背包道具相关状态。
 */

function receiveInventoryItem(player, contentTemplateRepository, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = contentTemplateRepository.normalizeItem(item);
    // 装备类必须有稳定 itemInstanceId（炼器产物 / 强化产物 / 退还料 / 自动入手）
    assignItemInstanceIdIfNeeded(normalized);
    if (canMergeItemStack(normalized)) {
        const signature = createItemStackSignature(normalized);
        const existing = player.inventory.items.find((entry) =>
            canMergeItemStack(entry) && createItemStackSignature(entry) === signature,
        );
        if (existing) {
            existing.count += normalized.count;
            return existing;
        }
        player.inventory.items.push(normalized);
        return normalized;
    }
    // 极端兜底：canMergeItemStack 对合法物品恒为 true，理论不会到这里
    player.inventory.items.push(normalized);
    return normalized;
}
/**
 * canReceiveCraftItem：判断Receive炼制道具是否满足条件。
 * @param player 玩家对象。
 * @param item 道具。
 * @returns 无返回值，完成Receive炼制道具的条件判断。
 */

function canReceiveCraftItem(player, item) {
    const signature = createItemStackSignature(item);
    return player.inventory.items.some((entry) => createItemStackSignature(entry) === signature)
        || player.inventory.items.length < player.inventory.capacity;
}
/**
 * consumeInventoryItemByItemId：执行consume背包道具By道具ID相关逻辑。
 * @param player 玩家对象。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具By道具ID相关状态。
 */

function consumeInventoryItemByItemId(player, itemId, count) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let remaining = Math.max(1, Math.trunc(count));
    for (let slotIndex = player.inventory.items.length - 1; slotIndex >= 0 && remaining > 0; slotIndex -= 1) {
        const item = player.inventory.items[slotIndex];
        if (!item || item.itemId !== itemId) {
            continue;
        }
        const consumed = Math.min(item.count, remaining);
        item.count -= consumed;
        remaining -= consumed;
        if (item.count <= 0) {
            player.inventory.items.splice(slotIndex, 1);
        }
    }
    if (remaining > 0) {
        throw new Error(`背包物品不足：${itemId}`);
    }
}
/**
 * extractInventoryItemAt：执行extract背包道具At相关逻辑。
 * @param player 玩家对象。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新extract背包道具At相关状态。
 */

function extractInventoryItemByInstanceId(player, itemInstanceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedItemInstanceId = normalizeInventoryItemInstanceId(itemInstanceId);
    if (!normalizedItemInstanceId) {
        return null;
    }
    const slotIndex = findInventoryItemIndexByInstanceId(player, normalizedItemInstanceId);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= player.inventory.items.length) {
        return null;
    }
    const item = player.inventory.items[slotIndex];
    if (!item) {
        return null;
    }
    const count = Math.max(0, Math.floor(Number(item.count) || 0));
    if (count <= 1) {
        // 堆叠仅 1 件：原 slot 整体移除，被拆出的对象继承原 itemInstanceId 不会发生 PK 冲突。
        return player.inventory.items.splice(slotIndex, 1)[0] ?? null;
    }
    item.count = count - 1;
    const extracted: Record<string, unknown> = { ...item, count: 1 };
    // 从 count > 1 的堆叠里拆 1 件用于强化等单件流程：被拆出的那件必须分配新 itemInstanceId，
    // 否则剩余堆叠（仍在背包）和被拆出的那件（进入 enhancementJob.item / 等装备槽 / 入库）
    // 在持久化层会共用同一 PK（player_inventory_item.item_instance_id），导致冲突或互相覆盖。
    if (typeof extracted.itemInstanceId === 'string' && extracted.itemInstanceId.length > 0) {
        extracted.itemInstanceId = randomUUID();
    }
    return extracted;
}

function findInventoryItemByInstanceId(player, itemInstanceId) {
    const slotIndex = findInventoryItemIndexByInstanceId(player, itemInstanceId);
    return slotIndex >= 0 ? player.inventory.items[slotIndex] ?? null : null;
}

function findInventoryItemIndexByInstanceId(player, itemInstanceId) {
    const normalizedItemInstanceId = normalizeInventoryItemInstanceId(itemInstanceId);
    if (!normalizedItemInstanceId || !Array.isArray(player?.inventory?.items)) {
        return -1;
    }
    return player.inventory.items.findIndex((item) => normalizeInventoryItemInstanceId(item?.itemInstanceId) === normalizedItemInstanceId);
}
/**
 * setEquippedItem：写入Equipped道具。
 * @param player 玩家对象。
 * @param slot 参数说明。
 * @param item 道具。
 * @returns 无返回值，直接更新Equipped道具相关状态。
 */

function setEquippedItem(player, slot, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const entry = player.equipment?.slots?.find((current) => current.slot === slot);
    if (!entry) {
        return;
    }
    if (item) {
        const cloned = cloneItem(item);
        // 显式继承 instanceId（强化成功 / 失败 / 降级 / 取消 都走此路径）；
        // 若来源 item 没带（极端：迁移期老装备），就此 lazy 升级
        assignItemInstanceIdIfNeeded(cloned);
        entry.item = cloned;
    } else {
        entry.item = null;
    }
}

/**
 * extractEquipmentItem：把指定装备槽中的物品取出（slot.item 设为 null）并返回。
 * 用于强化启动时把装备移入锁定空间，避免双副本造成的真源歧义。
 */
function extractEquipmentItem(player, slot) {
    const entry = player.equipment?.slots?.find((current) => current.slot === slot);
    if (!entry || !entry.item) {
        return null;
    }
    const item = entry.item;
    entry.item = null;
    return item;
}

/**
 * normalizeText：规范化或转换Text。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Text相关状态。
 */

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeInventoryItemInstanceId(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}
/**
 * normalizeAlchemyPresetName：规范化或转换炼丹Preset名称。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @returns 无返回值，直接更新炼丹Preset名称相关状态。
 */

function normalizeAlchemyPresetName(value, fallback) {
    const normalized = normalizeText(value);
    return normalized || normalizeText(fallback) || '未命名丹方';
}
/**
 * createAlchemyPresetId：构建并返回目标对象。
 * @param recipeId recipe ID。
 * @returns 无返回值，直接更新炼丹PresetID相关状态。
 */

function createAlchemyPresetId(recipeId) {
    const base = normalizeText(recipeId) || 'alchemy';
    return `alchemy:${base}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}
/**
 * normalizeQuantity：规范化或转换Quantity。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新Quantity相关状态。
 */

function normalizeQuantity(value, fallback = 1, max = 99) {
    return Math.max(1, Math.min(max, Math.floor(Number(value) || fallback)));
}
/**
 * normalizeIngredientSelections：规范化或转换IngredientSelection。
 * @param value 参数说明。
 * @returns 无返回值，直接更新IngredientSelection相关状态。
 */

function normalizeIngredientSelections(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(value)) {
        return [];
    }
    const counts = new Map();
    for (const entry of value) {
        const itemId = normalizeText(entry?.itemId);
        const count = Math.max(1, Math.floor(Number(entry?.count) || 1));
        if (!itemId) {
            continue;
        }
        counts.set(itemId, (counts.get(itemId) ?? 0) + count);
    }
    return Array.from(counts.entries())
        .map(([itemId, count]) => ({ itemId, count }))
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
}

function cloneAlchemyIngredientSelections(value) {
    return Array.isArray(value)
        ? value.map((entry) => ({
            itemId: String(entry.itemId),
            count: Math.max(1, Math.floor(Number(entry.count) || 1)),
        }))
        : [];
}
/**
 * isExactSubmittedIngredients：判断ExactSubmittedIngredient是否满足条件。
 * @param recipeIngredients 参数说明。
 * @param submitted 参数说明。
 * @returns 无返回值，完成ExactSubmittedIngredient的条件判断。
 */

function isExactSubmittedIngredients(recipeIngredients, submitted) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedRecipe = recipeIngredients
        .map((entry) => ({ itemId: entry.itemId, count: Math.max(1, Math.floor(Number(entry.count) || 1)) }))
        .sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
    if (normalizedRecipe.length !== submitted.length) {
        return false;
    }
    for (let index = 0; index < normalizedRecipe.length; index += 1) {
        const recipe = normalizedRecipe[index];
        const entry = submitted[index];
        if (!entry || recipe.itemId !== entry.itemId || recipe.count !== entry.count) {
            return false;
        }
    }
    return true;
}

function validateAlchemySelection(recipe, submitted) {
  const recipeIngredientMap = new Map();
  for (const ingredient of recipe.ingredients ?? []) {
    recipeIngredientMap.set(ingredient.itemId, ingredient);
  }
  const submittedMap = new Map(submitted.map((entry) => [entry.itemId, Number(entry.count)]));
  for (const entry of submitted) {
    if (!recipeIngredientMap.has(entry.itemId)) {
      return { error: '投料中包含当前丹方未收录的药材。' };
    }
  }
  const normalizedIngredients = [];
  for (const ingredient of recipe.ingredients ?? []) {
    const submittedCount = submittedMap.get(ingredient.itemId) ?? 0;
    const normalizedSubmittedCount = Number(submittedCount);
    if (ingredient.role === 'main') {
      if (normalizedSubmittedCount !== ingredient.count) {
        return { error: `${ingredient.name ?? ingredient.itemId} 属于主药，数量必须为 ${ingredient.count}。` };
      }
      normalizedIngredients.push({ itemId: ingredient.itemId, count: ingredient.count });
      continue;
    }
    if (normalizedSubmittedCount < 0 || normalizedSubmittedCount > ingredient.count) {
      return { error: `${ingredient.name ?? ingredient.itemId} 的辅药数量必须在 0 到 ${ingredient.count} 之间。` };
    }
    if (normalizedSubmittedCount > 0) {
      normalizedIngredients.push({ itemId: ingredient.itemId, count: normalizedSubmittedCount });
    }
  }
  return {
    ingredients: normalizedIngredients.sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN')),
  };
}
/**
 * applyCraftSkillExp：处理炼制技能Exp并更新相关状态。
 * @param skill 参数说明。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新炼制技能Exp相关状态。
 */

function applyCraftSkillExp(skill, amount, getExpToNextByLevel = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!skill) {
        return false;
    }
    let changed = false;
    if (typeof getExpToNextByLevel === 'function') {
        const resolvedExpToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
        if (skill.expToNext !== resolvedExpToNext) {
            skill.expToNext = resolvedExpToNext;
            changed = true;
        }
    }
    skill.exp += Math.max(0, Math.floor(Number(amount) || 0));
    while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
        skill.exp -= skill.expToNext;
        skill.level += 1;
        skill.expToNext = typeof getExpToNextByLevel === 'function'
            ? Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0))
            : resolveCraftSkillExpToNextByLevel(null, skill.level, DEFAULT_CRAFT_EXP_TO_NEXT);
        changed = true;
    }
    return changed || amount > 0;
}

function resolveAlchemySkillExpGain(source, alchemyCatalog, job, skill, successCount, failureCount) {
    if (!skill || (skill.expToNext ?? 0) <= 0) {
        return 0;
    }
    const recipe = Array.isArray(alchemyCatalog)
        ? alchemyCatalog.find((entry) => entry.recipeId === job.recipeId)
        : null;
    const gainResult = computeCraftSkillExpGain({
        skillLevel: skill.level,
        targetLevel: recipe?.outputLevel ?? job.outputLevel ?? 1,
        baseActionTicks: resolveAlchemySkillBaseActionTicks(recipe, job),
        successCount,
        failureCount,
        successMultiplier: 1,
        getExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(source, level),
    });
    return gainResult.finalGain;
}

function resolveAlchemySkillBaseActionTicks(recipe, job) {
    const baseBrewTicks = recipe?.baseBrewTicks ?? job?.baseBrewTicks ?? job?.batchBrewTicks ?? 1;
    if (recipe) {
        return computeAlchemyBrewTicks(
            baseBrewTicks,
            recipe,
            Array.isArray(job?.ingredients) ? job.ingredients : undefined,
            job?.outputCount ?? ALCHEMY_FURNACE_OUTPUT_COUNT,
        );
    }
    return Math.max(1, Math.floor(Number(baseBrewTicks) || 1));
}

function resolveEnhancementSkillExpGain(source, skill, targetItemLevel, success) {
    if (!skill || (skill.expToNext ?? 0) <= 0) {
        return 0;
    }
    const gainResult = computeCraftSkillExpGain({
        skillLevel: skill.level,
        targetLevel: targetItemLevel,
        baseActionTicks: computeEnhancementJobBaseTicks(targetItemLevel),
        successCount: success ? 1 : 0,
        failureCount: success ? 0 : 1,
        successMultiplier: 1,
        getExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(source, level),
    });
    return gainResult.finalGain;
}
/**
 * resolveAlchemyBatchSuccess：规范化或转换炼丹BatchSuccess。
 * @param outputCount 参数说明。
 * @param successRate 参数说明。
 * @returns 无返回值，直接更新炼丹BatchSuccess相关状态。
 */

function resolveAlchemyBatchSuccess(outputCount, successRate) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    let successCount = 0;
    const normalizedOutputCount = Math.max(1, Math.floor(Number(outputCount) || 1));
    const normalizedSuccessRate = Math.max(0, Math.min(1, Number(successRate) || 0));
    for (let index = 0; index < normalizedOutputCount; index += 1) {
        if (Math.random() < normalizedSuccessRate) {
            successCount += 1;
        }
    }
    return successCount;
}
/**
 * normalizeEquipSlot：规范化或转换EquipSlot。
 * @param value 参数说明。
 * @returns 无返回值，直接更新EquipSlot相关状态。
 */

function normalizeEquipSlot(value) {
    return EQUIP_SLOTS.includes(value) ? value : null;
}
/**
 * cloneTargetRef：读取目标Ref并返回结果。
 * @param ref 参数说明。
 * @returns 无返回值，直接更新目标Ref相关状态。
 */

function cloneTargetRef(ref) {
    return ref.source === 'equipment'
        ? { source: 'equipment', slot: ref.slot }
        : { source: 'inventory', itemInstanceId: normalizeInventoryItemInstanceId(ref.itemInstanceId) };
}
/**
 * buildCraftMutationResult：构建并返回目标对象。
 * @param error 参数说明。
 * @returns 无返回值，直接更新炼制Mutation结果相关状态。
 */

function buildCraftMutationResult(error = undefined) {
    return {
        ok: false,
        error,
        messages: [],
        panelChanged: false,
    };
}
/**
 * buildCraftTickResult：构建并返回目标对象。
 * @param panelChanged 参数说明。
 * @param messages 参数说明。
 * @param inventoryChanged 参数说明。
 * @param equipmentChanged 参数说明。
 * @param attrChanged 参数说明。
 * @param groundDrops 参数说明。
 * @returns 无返回值，直接更新炼制tick结果相关状态。
 */

function buildCraftTickResult(panelChanged = false, messages = [], inventoryChanged = false, equipmentChanged = false, attrChanged = false, groundDrops = [], craftRealmExpGain = 0) {
    return {
        ok: true,
        panelChanged,
        inventoryChanged,
        equipmentChanged,
        attrChanged,
        messages,
        groundDrops,
        craftRealmExpGain,
    };
}
/**
 * normalizeEnhanceLevel：规范化或转换Enhance等级。
 * @param level 参数说明。
 * @returns 无返回值，直接更新Enhance等级相关状态。
 */

function normalizeEnhanceLevel(level) {
    return Math.max(0, Math.min(MAX_ENHANCE_LEVEL, Math.floor(Number(level) || 0)));
}
/**
 * getEnhancementSpiritStoneCost：读取强化SpiritStone消耗。
 * @param itemLevel 参数说明。
 * @param hasMaterialCost 参数说明。
 * @returns 无返回值，完成强化SpiritStone消耗的读取/组装。
 */

function getEnhancementSpiritStoneCost(itemLevel, hasMaterialCost = false) {
    const level = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
    return Math.max(1, hasMaterialCost ? Math.floor(level / 10) : Math.ceil(level / 10));
}
