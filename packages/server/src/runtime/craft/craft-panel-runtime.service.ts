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
exports.CraftPanelRuntimeService = void 0;
const common_1 = require("@nestjs/common");
const fs = require("fs");
const path = require("path");
const shared_1 = require("@mud/shared-next");
const content_template_repository_1 = require("../../content/content-template.repository");
const player_runtime_service_1 = require("../player/player-runtime.service");
const craft_panel_alchemy_query_service_1 = require("./craft-panel-alchemy-query.service");
const craft_panel_alchemy_query_helpers_1 = require("./craft-panel-alchemy-query.helpers");
const craft_panel_enhancement_query_service_1 = require("./craft-panel-enhancement-query.service");

/** 强化锤能力判定使用的物品标签。 */
const ENHANCEMENT_HAMMER_TAG = 'enhancement_hammer';

/** 强化与炼丹计算中固定使用的灵石物品 ID。 */
const SPIRIT_STONE_ITEM_ID = 'spirit_stone';

/** 工艺技能的默认升级经验门槛。 */
const DEFAULT_CRAFT_EXP_TO_NEXT = 60;

/** 炼丹任务开始后先经历的准备息数。 */
const ALCHEMY_PREPARATION_TICKS = 10;

/** 炼丹被打断后进入的暂停息数。 */
const ALCHEMY_INTERRUPT_PAUSE_TICKS = 10;

/** 强化等级上限。 */
const MAX_ENHANCE_LEVEL = 20;

/** 强化基础任务息数。 */
const ENHANCEMENT_BASE_JOB_TICKS = 5;

/** 每提升 1 级物品强化等级，额外增加的任务息数。 */
const ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL = 1;

/** 同级及以下装备强化时的额外成功率惩罚。 */
const ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY = 0.1;

/** 每提升 1 级装备带来的额外成功率修正。 */
const ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL = 0.002;

/** 每提升 1 级装备带来的额外速度修正。 */
const ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL = 0.02;

const ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL = [
    0.5,
    0.45,
    0.45,
    0.4,
    0.4,
    0.4,
    0.35,
    0.35,
    0.35,
    0.35,
    0.3,
    0.3,
    0.3,
    0.3,
    0.3,
    0.3,
    0.3,
    0.3,
    0.3,
    0.3,
    0.3,
];

/** 强化被打断后进入的暂停息数。 */
const ENHANCEMENT_INTERRUPT_PAUSE_TICKS = 10;
/** 制作运行时服务：负责炼丹与强化的任务创建、进度推进与结果落库。 */
let CraftPanelRuntimeService = class CraftPanelRuntimeService {
/**
 * contentTemplateRepository：对象字段。
 */

    contentTemplateRepository;    
    /**
 * playerRuntimeService：对象字段。
 */

    playerRuntimeService;    
    /**
 * craftPanelAlchemyQueryService：对象字段。
 */

    craftPanelAlchemyQueryService;    
    /**
 * craftPanelEnhancementQueryService：对象字段。
 */

    craftPanelEnhancementQueryService;
    /** 运行时日志器，记录炼丹、强化与配置加载问题。 */
    logger = new common_1.Logger(CraftPanelRuntimeService.name);
    /** 缓存炼丹目录，供面板快照和任务校验共用。 */
    alchemyCatalog = [];
    /** 缓存强化配置，避免每次操作都重新查表。 */
    enhancementConfigs = new Map();
    /** 缓存依赖并初始化日志、配方与强化配置。 */
    constructor(contentTemplateRepository, playerRuntimeService, craftPanelAlchemyQueryService, craftPanelEnhancementQueryService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelAlchemyQueryService = craftPanelAlchemyQueryService;
        this.craftPanelEnhancementQueryService = craftPanelEnhancementQueryService;
    }
    /** 模块初始化：按需加载炼丹目录和强化配置。 */
    onModuleInit() {
        this.loadAlchemyCatalog();
        this.loadEnhancementConfigs();
    }
    /** 读取炼丹面板的状态和可见目录，同步客户端所需的数据快照。 */
    buildAlchemyPanelPayload(player, knownCatalogVersion) {
        this.ensureCraftSkills(player);
        return this.craftPanelAlchemyQueryService.buildAlchemyPanelPayload(player, knownCatalogVersion, this.alchemyCatalog, this.getWeapon(player));
    }
    /** 读取强化面板状态并在未装备强化锤时返回错误。 */
    buildEnhancementPanelPayload(player) {
        this.ensureCraftSkills(player);
        return this.craftPanelEnhancementQueryService.buildEnhancementPanelPayload(player, this.enhancementConfigs);
    }
    /** 判断玩家当前是否有炼丹任务在进行。 */
    hasActiveAlchemyJob(player) {
        return Boolean(player.alchemyJob && player.alchemyJob.remainingTicks > 0);
    }
    /** 判断玩家当前是否有强化任务在进行。 */
    hasActiveEnhancementJob(player) {
        return Boolean(player.enhancementJob && player.enhancementJob.remainingTicks > 0);
    }
    /** 提交新炼丹任务前完成装备与状态校验。 */
    startAlchemy(player, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        if (!this.hasEquippedFurnace(player)) {
            return buildCraftMutationResult('尚未装备丹炉，无法炼丹。');
        }
        if (this.hasActiveAlchemyJob(player)) {
            return buildCraftMutationResult('当前已有炼丹任务在进行中。');
        }
        const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === normalizeText(payload?.recipeId));
        if (!recipe) {
            return buildCraftMutationResult('对应丹方不存在。');
        }
        const ingredients = normalizeIngredientSelections(payload?.ingredients);
        if (!isExactSubmittedIngredients(recipe.ingredients, ingredients)) {
            return buildCraftMutationResult('当前最小实现仅支持按目录原方炼制。');
        }
        const quantity = normalizeQuantity(payload?.quantity, 1, 99);
        for (const ingredient of ingredients) {
            const requiredCount = ingredient.count * quantity;
            if (countInventoryItem(player, ingredient.itemId) < requiredCount) {
                return buildCraftMutationResult(`${this.contentTemplateRepository.getItemName(ingredient.itemId) ?? ingredient.itemId} 数量不足。`);
            }
        }
        const spiritStoneCost = recipe.category === 'buff'
            ? Math.max(0, recipe.outputLevel * quantity)
            : 0;
        if (spiritStoneCost > 0 && countInventoryItem(player, SPIRIT_STONE_ITEM_ID) < spiritStoneCost) {
            return buildCraftMutationResult(`灵石不足，需要 ${spiritStoneCost} 枚。`);
        }
        for (const ingredient of ingredients) {
            consumeInventoryItemByItemId(player, ingredient.itemId, ingredient.count * quantity);
        }
        if (spiritStoneCost > 0) {
            consumeInventoryItemByItemId(player, SPIRIT_STONE_ITEM_ID, spiritStoneCost);
        }
        const batchBrewTicks = computeAdjustedCraftTicks(recipe.baseBrewTicks, this.getWeapon(player)?.alchemySpeedRate ?? 0);
        const totalTicks = ALCHEMY_PREPARATION_TICKS + (batchBrewTicks * quantity);
        const successRate = Math.max(0.65, Math.min(1, 0.92 + ((player.alchemySkill?.level ?? 1) - recipe.outputLevel) * 0.03 + (this.getWeapon(player)?.alchemySuccessRate ?? 0)));
        player.alchemyJob = {
            recipeId: recipe.recipeId,
            outputItemId: recipe.outputItemId,
            outputCount: Math.max(1, recipe.outputCount),
            quantity,
            completedCount: 0,
            successCount: 0,
            failureCount: 0,
            ingredients: ingredients.map((entry) => ({ ...entry })),
            phase: 'preparing',
            preparationTicks: ALCHEMY_PREPARATION_TICKS,
            batchBrewTicks,
            currentBatchRemainingTicks: batchBrewTicks,
            pausedTicks: 0,
            spiritStoneCost,
            totalTicks,
            remainingTicks: totalTicks,
            successRate,
            exactRecipe: true,
            startedAt: Date.now(),
        };
        this.finalizeMutation(player, { inventoryChanged: true, persistentOnly: true });
        return {
            ok: true,
            panelChanged: true,
            inventoryChanged: true,
            messages: [{
                    kind: 'quest',
                    text: `开始炼制 ${recipe.outputName}${quantity > 1 ? `，共 ${quantity} 炉` : ''}，总计 ${totalTicks} 息。`,
                }],
        };
    }    
    /**
 * cancelAlchemy：执行状态校验并返回判断结果。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    cancelAlchemy(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const job = player.alchemyJob;
        if (!job || job.remainingTicks <= 0) {
            return buildCraftMutationResult('当前没有可取消的炼丹任务。');
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
                if (canReceiveCraftItem(player, refundItem)) {
                    receiveInventoryItem(player, this.contentTemplateRepository, refundItem);
                    inventoryChanged = true;
                }
                else {
                    groundDrops.push(refundItem);
                }
            }
        }
        if (job.spiritStoneCost > 0 && refundableBatchCount > 0) {
            const refundableSpiritStones = Math.floor(job.spiritStoneCost * (refundableBatchCount / Math.max(1, job.quantity)));
            if (refundableSpiritStones > 0) {
                const refundItem = this.contentTemplateRepository.normalizeItem({
                    itemId: SPIRIT_STONE_ITEM_ID,
                    count: refundableSpiritStones,
                });
                if (canReceiveCraftItem(player, refundItem)) {
                    receiveInventoryItem(player, this.contentTemplateRepository, refundItem);
                    inventoryChanged = true;
                }
                else {
                    groundDrops.push(refundItem);
                }
            }
        }
        player.alchemyJob = null;
        this.finalizeMutation(player, { inventoryChanged, persistentOnly: true });
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
    /**
 * saveAlchemyPreset：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    saveAlchemyPreset(player, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const recipeId = normalizeText(payload?.recipeId);
        const recipe = this.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
        if (!recipe) {
            return buildCraftMutationResult('对应丹方不存在。');
        }
        const ingredients = normalizeIngredientSelections(payload?.ingredients);
        if (!isExactSubmittedIngredients(recipe.ingredients, ingredients)) {
            return buildCraftMutationResult('当前仅支持保存目录里已定义的原方预设。');
        }
        const requestedPresetId = normalizeText(payload?.presetId);
        const presetName = normalizeAlchemyPresetName(payload?.name, recipe.outputName || recipe.recipeId);
        const presetId = requestedPresetId || createAlchemyPresetId(recipe.recipeId);
        const existingIndex = player.alchemyPresets.findIndex((entry) => entry.presetId === presetId);
        const nextPreset = {
            presetId,
            recipeId: recipe.recipeId,
            name: presetName,
            ingredients: ingredients.map((entry) => ({ ...entry })),
            updatedAt: Date.now(),
        };
        if (existingIndex >= 0) {
            player.alchemyPresets.splice(existingIndex, 1, nextPreset);
        }
        else {
            player.alchemyPresets.unshift(nextPreset);
        }
        this.finalizeMutation(player, { persistentOnly: true });
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
 * deleteAlchemyPreset：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param presetIdInput 参数说明。
 * @returns 函数返回值。
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
        this.finalizeMutation(player, { persistentOnly: true });
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
 * interruptAlchemy：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @returns 函数返回值。
 */

    interruptAlchemy(player, reason) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const job = player.alchemyJob;
        if (!job || job.remainingTicks <= 0) {
            return buildCraftTickResult();
        }
        const currentPausedTicks = job.phase === 'paused' ? job.pausedTicks : 0;
        const addedPauseTicks = Math.max(0, ALCHEMY_INTERRUPT_PAUSE_TICKS - currentPausedTicks);
        if (addedPauseTicks <= 0) {
            return buildCraftTickResult();
        }
        job.phase = 'paused';
        job.pausedTicks = ALCHEMY_INTERRUPT_PAUSE_TICKS;
        job.remainingTicks += addedPauseTicks;
        job.totalTicks += addedPauseTicks;
        this.finalizeMutation(player, { persistentOnly: true });
        return buildCraftTickResult(true, [{
                kind: 'system',
                text: reason === 'move'
                    ? `${this.contentTemplateRepository.getItemName(job.outputItemId) ?? job.outputItemId} 的炼制被移动打断，炉火暂歇 ${ALCHEMY_INTERRUPT_PAUSE_TICKS} 息。`
                    : `${this.contentTemplateRepository.getItemName(job.outputItemId) ?? job.outputItemId} 的炼制被出手打断，炉火暂歇 ${ALCHEMY_INTERRUPT_PAUSE_TICKS} 息。`,
            }]);
    }    
    /**
 * tickAlchemy：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    tickAlchemy(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const job = player.alchemyJob;
        if (!job || job.remainingTicks <= 0) {
            return buildCraftTickResult();
        }
        job.remainingTicks = Math.max(0, job.remainingTicks - 1);
        if (job.phase === 'paused') {
            job.pausedTicks = Math.max(0, job.pausedTicks - 1);
            if (job.pausedTicks > 0) {
                return buildCraftTickResult();
            }
            job.phase = job.completedCount > 0 || job.currentBatchRemainingTicks < job.batchBrewTicks
                ? 'brewing'
                : 'preparing';
            return buildCraftTickResult(true);
        }
        if (job.phase === 'preparing') {
            const brewTicksRemaining = Math.max(0, (job.quantity - job.completedCount) * job.batchBrewTicks);
            if (job.remainingTicks > brewTicksRemaining) {
                return buildCraftTickResult();
            }
            job.phase = 'brewing';
            job.currentBatchRemainingTicks = job.batchBrewTicks;
            return buildCraftTickResult(true, [{
                    kind: 'quest',
                    text: `${this.contentTemplateRepository.getItemName(job.outputItemId) ?? job.outputItemId} 炉火已稳，开始正式炼制。`,
                }]);
        }
        job.currentBatchRemainingTicks = Math.max(0, job.currentBatchRemainingTicks - 1);
        if (job.currentBatchRemainingTicks > 0 && job.remainingTicks > 0) {
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
        const skillChanged = applyCraftSkillExp(player.alchemySkill, Math.max(1, successCount + Math.ceil((failureCount + 1) / 2)));
        this.finalizeMutation(player, {
            inventoryChanged,
            attrChanged: skillChanged,
            persistentOnly: true,
        });
        if (job.completedCount >= job.quantity || job.remainingTicks <= 0) {
            player.alchemyJob = null;
            this.finalizeMutation(player, {
                inventoryChanged: false,
                attrChanged: false,
                persistentOnly: true,
            });
            return buildCraftTickResult(true, [{
                    kind: 'quest',
                    text: `${this.contentTemplateRepository.getItemName(job.outputItemId) ?? job.outputItemId} 炼制完成，成丹 ${job.successCount} 枚。`,
                }], inventoryChanged, false, skillChanged, groundDrops);
        }
        job.currentBatchRemainingTicks = job.batchBrewTicks;
        return buildCraftTickResult(true, [{
                kind: successCount > 0 ? 'quest' : 'system',
                text: successCount > 0
                    ? `第 ${job.completedCount} 炉成丹 ${successCount} 枚。`
                    : `第 ${job.completedCount} 炉未能成丹。`,
            }], inventoryChanged, false, skillChanged, groundDrops);
    }    
    /**
 * startEnhancement：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    startEnhancement(player, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        if (!this.hasEquippedHammer(player)) {
            return buildCraftMutationResult('尚未装备强化锤。');
        }
        if (this.hasActiveEnhancementJob(player)) {
            return buildCraftMutationResult('当前已有强化任务在进行中。');
        }
        const target = this.resolveEnhancementTarget(player, payload?.target);
        if (!target) {
            return buildCraftMutationResult('强化目标不存在。');
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
        const materials = this.getEnhancementRequirements(config, targetLevel);
        const protection = payload?.protection
            ? this.resolveEnhancementProtection(player, payload.protection, target, config)
            : null;
        const protectionStartLevel = protection
            ? this.resolveProtectionStartLevel(desiredTargetLevel, payload?.protectionStartLevel)
            : undefined;
        if (payload?.protection && !protection) {
            return buildCraftMutationResult('保护物不存在或不符合本次强化规则。');
        }
        const spiritStoneCost = getEnhancementSpiritStoneCost(target.item.level, materials.length > 0);
        if (!this.hasEnoughEnhancementResources(player, target, protection, spiritStoneCost, materials, this.shouldUseProtectionForStep(targetLevel, protectionStartLevel))) {
            return buildCraftMutationResult('所需灵石、材料或保护物不足。');
        }
        const workingItem = target.ref.source === 'inventory'
            ? extractInventoryItemAt(player, target.ref.slotIndex)
            : cloneItem(target.item);
        if (!workingItem) {
            return buildCraftMutationResult('强化目标不存在。');
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
            ? (0, shared_1.createItemStackSignature)(protection.item)
            : undefined;
        player.enhancementJob = {
            target: cloneTargetRef(target.ref),
            item: {
                ...cloneItem(workingItem),
                count: 1,
            },
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
            equipmentChanged: false,
            persistentOnly: true,
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
 * cancelEnhancement：执行状态校验并返回判断结果。
 * @param player 玩家对象。
 * @returns 函数返回值。
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
 * interruptEnhancement：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param reason 参数说明。
 * @returns 函数返回值。
 */

    interruptEnhancement(player, reason) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.ensureCraftSkills(player);
        const job = player.enhancementJob;
        if (!job || job.remainingTicks <= 0) {
            return buildCraftTickResult();
        }
        const currentPausedTicks = job.phase === 'paused' ? job.pausedTicks : 0;
        const addedPauseTicks = Math.max(0, ENHANCEMENT_INTERRUPT_PAUSE_TICKS - currentPausedTicks);
        if (addedPauseTicks <= 0) {
            return buildCraftTickResult();
        }
        job.phase = 'paused';
        job.pausedTicks = ENHANCEMENT_INTERRUPT_PAUSE_TICKS;
        job.remainingTicks += addedPauseTicks;
        job.totalTicks += addedPauseTicks;
        this.finalizeMutation(player, { persistentOnly: true });
        return buildCraftTickResult(true, [{
                kind: 'system',
                text: reason === 'move'
                    ? `${job.targetItemName} 的强化被移动打断，暂歇 ${ENHANCEMENT_INTERRUPT_PAUSE_TICKS} 息。`
                    : `${job.targetItemName} 的强化被出手打断，暂歇 ${ENHANCEMENT_INTERRUPT_PAUSE_TICKS} 息。`,
            }]);
    }    
    /**
 * tickEnhancement：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
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
            job.pausedTicks = Math.max(0, job.pausedTicks - 1);
            if (job.pausedTicks > 0) {
                return buildCraftTickResult();
            }
            job.phase = 'enhancing';
            return buildCraftTickResult(true);
        }
        if (job.remainingTicks > 0) {
            return buildCraftTickResult();
        }
        const success = Math.random() < job.successRate;
        if (success) {
            try {
                consumeInventoryItemByItemId(player, SPIRIT_STONE_ITEM_ID, job.spiritStoneCost);
            }
            catch {
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
        const skillChanged = applyCraftSkillExp(player.enhancementSkill, success ? Math.max(2, job.targetLevel) : 1);
        player.enhancementSkillLevel = player.enhancementSkill.level;
        if (resultingLevel < job.desiredTargetLevel) {
            const continueResult = this.advanceEnhancementJob(player, resultingLevel);
            if (continueResult) {
                if (continueResult.continued) {
                    return buildCraftTickResult(true, continueResult.messages, continueResult.inventoryChanged, continueResult.equipmentChanged, skillChanged || continueResult.attrChanged, continueResult.groundDrops);
                }
                return buildCraftTickResult(true, continueResult.messages, continueResult.inventoryChanged, continueResult.equipmentChanged, skillChanged || continueResult.attrChanged, continueResult.groundDrops);
            }
        }
        const finishResult = this.finishEnhancementJob(player, resultingLevel, 'completed');
        return buildCraftTickResult(true, [{
                kind: success ? 'quest' : 'system',
                text: success
                    ? `${job.targetItemName} 强化成功，已提升至 +${resultingLevel}。`
                    : protectionActiveForStep
                        ? `${job.targetItemName} 强化失败，保护生效，降为 +${resultingLevel}。`
                        : `${job.targetItemName} 强化失败，已归零为 +0。`,
            }], finishResult.inventoryChanged, finishResult.equipmentChanged, finishResult.attrChanged || skillChanged, finishResult.groundDrops);
    }    
    /**
 * blocksEquipSlotChange：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param slot 参数说明。
 * @returns 函数返回值。
 */

    blocksEquipSlotChange(player, slot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.hasActiveAlchemyJob(player) && slot === 'weapon') {
            return true;
        }
        if (this.hasActiveEnhancementJob(player)) {
            if (slot === 'weapon') {
                return true;
            }
            return player.enhancementJob?.target?.source === 'equipment' && player.enhancementJob.target.slot === slot;
        }
        return false;
    }    
    /**
 * getLockedSlotReason：按给定条件读取/查询数据。
 * @param player 玩家对象。
 * @param slot 参数说明。
 * @returns 函数返回值。
 */

    getLockedSlotReason(player, slot) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.hasActiveAlchemyJob(player) && slot === 'weapon') {
            return '炼丹进行中，暂时不能替换或卸下丹炉。';
        }
        if (!this.hasActiveEnhancementJob(player)) {
            return null;
        }
        if (slot === 'weapon') {
            return '强化进行中，暂时不能替换或卸下强化锤。';
        }
        if (player.enhancementJob?.target?.source === 'equipment' && player.enhancementJob.target.slot === slot) {
            return `${player.enhancementJob.targetItemName} 强化进行中，暂时不能更换对应装备槽。`;
        }
        return null;
    }    
    /**
 * getCultivationBlockReason：按给定条件读取/查询数据。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    getCultivationBlockReason(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.hasActiveAlchemyJob(player)) {
            return '炼丹进行中，暂时不能切换修炼。';
        }
        if (this.hasActiveEnhancementJob(player)) {
            return '强化进行中，暂时不能切换修炼。';
        }
        return null;
    }    
    /**
 * hasEquippedFurnace：执行状态校验并返回判断结果。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    hasEquippedFurnace(player) {
        return Boolean(this.getWeapon(player)?.tags?.includes(craft_panel_alchemy_query_helpers_1.ALCHEMY_FURNACE_TAG));
    }    
    /**
 * hasEquippedHammer：执行状态校验并返回判断结果。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    hasEquippedHammer(player) {
        return Boolean(this.getWeapon(player)?.tags?.includes(ENHANCEMENT_HAMMER_TAG));
    }    
    /**
 * ensureCraftSkills：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    ensureCraftSkills(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        player.alchemySkill = normalizeCraftSkill(player.alchemySkill);
        player.gatherSkill = normalizeCraftSkill(player.gatherSkill);
        player.enhancementSkill = normalizeCraftSkill(player.enhancementSkill ?? {
            level: player.enhancementSkillLevel,
            exp: 0,
            expToNext: DEFAULT_CRAFT_EXP_TO_NEXT,
        });
        player.enhancementSkillLevel = player.enhancementSkill.level;
        if (!Array.isArray(player.alchemyPresets)) {
            player.alchemyPresets = [];
        }
        if (!Array.isArray(player.enhancementRecords)) {
            player.enhancementRecords = [];
        }
        player.alchemyJob = player.alchemyJob ? (0, craft_panel_alchemy_query_helpers_1.cloneAlchemyJob)(player.alchemyJob) : null;
        player.enhancementJob = player.enhancementJob ? cloneEnhancementJob(player.enhancementJob) : null;
    }    
    /**
 * buildAlchemyPanelState：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    buildAlchemyPanelState(player) {
        return this.craftPanelAlchemyQueryService.buildAlchemyPanelState(player, this.getWeapon(player));
    }    
    /**
 * buildEnhancementPanelState：构建并返回目标对象。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    buildEnhancementPanelState(player) {
        return this.craftPanelEnhancementQueryService.buildEnhancementPanelState(player, this.enhancementConfigs);
    }    
    /**
 * collectEnhancementCandidates：执行核心业务逻辑。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    collectEnhancementCandidates(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const candidates = [];
        player.inventory.items.forEach((item, slotIndex) => {
            const candidate = this.buildEnhancementCandidate(player, { source: 'inventory', slotIndex }, item);
            if (candidate) {
                candidates.push(candidate);
            }
        });
        for (const slot of shared_1.EQUIP_SLOTS) {
            const item = this.getEquippedItem(player, slot);
            if (!item) {
                continue;
            }
            const candidate = this.buildEnhancementCandidate(player, { source: 'equipment', slot }, item);
            if (candidate) {
                candidates.push(candidate);
            }
        }
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
 * @returns 函数返回值。
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
 * @returns 函数返回值。
 */

    buildProtectionCandidates(player, ref, item, config) {
        const candidates = [];
        const targetProtectionItemId = config?.protectionItemId ?? item.itemId;
        player.inventory.items.forEach((entry, slotIndex) => {
            if (!entry || !this.isEligibleProtectionItem(entry, targetProtectionItemId, item.itemId)) {
                return;
            }
            if (ref.source === 'inventory' && ref.slotIndex === slotIndex) {
                return;
            }
            candidates.push({
                ref: { source: 'inventory', slotIndex },
                item: cloneItem(entry),
            });
        });
        return candidates;
    }    
    /**
 * getEnhancementRequirements：按给定条件读取/查询数据。
 * @param config 参数说明。
 * @param targetLevel 参数说明。
 * @returns 函数返回值。
 */

    getEnhancementRequirements(config, targetLevel) {
        const step = config?.steps.find((entry) => entry.targetEnhanceLevel === targetLevel);
        return (step?.materials ?? []).map((entry) => ({ ...entry }));
    }    
    /**
 * getWeapon：按给定条件读取/查询数据。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    getWeapon(player) {
        return this.getEquippedItem(player, 'weapon');
    }    
    /**
 * getEquippedItem：按给定条件读取/查询数据。
 * @param player 玩家对象。
 * @param slot 参数说明。
 * @returns 函数返回值。
 */

    getEquippedItem(player, slot) {
        return player.equipment?.slots?.find((entry) => entry.slot === slot)?.item ?? null;
    }    
    /**
 * resolveRequestedTargetLevel：执行核心业务逻辑。
 * @param currentLevel 参数说明。
 * @param requestedTargetLevel 参数说明。
 * @returns 函数返回值。
 */

    resolveRequestedTargetLevel(currentLevel, requestedTargetLevel) {
        const normalized = Math.floor(Number(requestedTargetLevel) || 0);
        return Math.min(MAX_ENHANCE_LEVEL, Math.max(currentLevel + 1, normalized || (currentLevel + 1)));
    }    
    /**
 * resolveProtectionStartLevel：执行核心业务逻辑。
 * @param desiredTargetLevel 参数说明。
 * @param requestedProtectionStartLevel 参数说明。
 * @returns 函数返回值。
 */

    resolveProtectionStartLevel(desiredTargetLevel, requestedProtectionStartLevel) {
        const normalized = Math.floor(Number(requestedProtectionStartLevel) || 0);
        return Math.max(2, Math.min(desiredTargetLevel, normalized || 2));
    }    
    /**
 * shouldUseProtectionForStep：执行核心业务逻辑。
 * @param targetLevel 参数说明。
 * @param protectionStartLevel 参数说明。
 * @returns 函数返回值。
 */

    shouldUseProtectionForStep(targetLevel, protectionStartLevel) {
        return typeof protectionStartLevel === 'number' && targetLevel >= protectionStartLevel;
    }    
    /**
 * resolveEnhancementTarget：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param ref 参数说明。
 * @returns 函数返回值。
 */

    resolveEnhancementTarget(player, ref) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!ref || typeof ref !== 'object') {
            return null;
        }
        if (ref.source === 'inventory') {
            const slotIndex = Number.isFinite(ref.slotIndex) ? Math.max(0, Math.trunc(ref.slotIndex)) : -1;
            const item = player.inventory.items[slotIndex] ?? null;
            return item ? { ref: { source: 'inventory', slotIndex }, item } : null;
        }
        if (ref.source === 'equipment') {
            const slot = normalizeEquipSlot(ref.slot);
            if (!slot) {
                return null;
            }
            const item = this.getEquippedItem(player, slot);
            return item ? { ref: { source: 'equipment', slot }, item } : null;
        }
        return null;
    }    
    /**
 * resolveEnhancementProtection：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param ref 参数说明。
 * @param target 目标对象。
 * @param config 参数说明。
 * @returns 函数返回值。
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
            && protection.ref.slotIndex === target.ref.slotIndex
            && Math.max(0, Math.floor(Number(target.item.count) || 0)) < 2) {
            return null;
        }
        return protection;
    }    
    /**
 * touchEnhancementRecord：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

    touchEnhancementRecord(player, input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const itemId = normalizeText(input.itemId);
        if (!itemId) {
            return null;
        }
        const existing = (player.enhancementRecords ?? []).find((entry) => entry.itemId === itemId);
        if (existing) {
            existing.actionStartedAt = input.actionStartedAt;
            existing.startLevel = input.startLevel;
            existing.initialTargetLevel = input.initialTargetLevel;
            existing.desiredTargetLevel = input.desiredTargetLevel;
            existing.protectionStartLevel = input.protectionStartLevel;
            existing.status = input.status;
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
        return created;
    }    
    /**
 * touchEnhancementLevelRecord：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param itemId 道具 ID。
 * @param targetLevel 参数说明。
 * @param success 参数说明。
 * @param resultingLevel 参数说明。
 * @returns 函数返回值。
 */

    touchEnhancementLevelRecord(player, itemId, targetLevel, success, resultingLevel) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const record = this.touchEnhancementRecord(player, {
            itemId,
            startLevel: 0,
            initialTargetLevel: targetLevel,
            desiredTargetLevel: targetLevel,
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
 * advanceEnhancementJob：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param currentLevel 参数说明。
 * @returns 函数返回值。
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
        job.currentLevel = currentLevel;
        job.targetLevel = nextTargetLevel;
        job.item = this.contentTemplateRepository.normalizeItem({
            ...job.item,
            count: 1,
            enhanceLevel: currentLevel,
        });
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
 * finishEnhancementJob：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param resultingLevel 参数说明。
 * @param status 参数说明。
 * @returns 函数返回值。
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
        const resolvedItem = this.contentTemplateRepository.normalizeItem({
            ...job.item,
            count: 1,
            enhanceLevel: resultingLevel,
        });
        let inventoryChanged = false;
        let equipmentChanged = false;
        let attrChanged = false;
        const groundDrops = [];
        if (job.target.source === 'equipment' && job.target.slot) {
            setEquippedItem(player, job.target.slot, resolvedItem);
            equipmentChanged = true;
            attrChanged = true;
        }
        else if (canReceiveCraftItem(player, resolvedItem)) {
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
        });
        return {
            inventoryChanged,
            equipmentChanged,
            attrChanged,
            groundDrops,
        };
    }    
    /**
 * hasEnoughEnhancementResources：执行状态校验并返回判断结果。
 * @param player 玩家对象。
 * @param target 目标对象。
 * @param protection 参数说明。
 * @param spiritStoneCost 参数说明。
 * @param materials 参数说明。
 * @param protectionRequired 参数说明。
 * @returns 函数返回值。
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
        if ((counts.get(SPIRIT_STONE_ITEM_ID) ?? 0) < spiritStoneCost) {
            return false;
        }
        return materials.every((entry) => (counts.get(entry.itemId) ?? 0) >= entry.count);
    }    
    /**
 * hasEnoughQueuedEnhancementResources：执行状态校验并返回判断结果。
 * @param player 玩家对象。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @param spiritStoneCost 参数说明。
 * @param materials 参数说明。
 * @returns 函数返回值。
 */

    hasEnoughQueuedEnhancementResources(player, protectionItemId, targetItemId, spiritStoneCost, materials) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const counts = new Map();
        for (const item of player.inventory.items) {
            counts.set(item.itemId, (counts.get(item.itemId) ?? 0) + Math.max(0, Math.floor(Number(item.count) || 0)));
        }
        if ((counts.get(SPIRIT_STONE_ITEM_ID) ?? 0) < spiritStoneCost) {
            return false;
        }
        if (protectionItemId && this.getEligibleProtectionCount(player, protectionItemId, targetItemId) < 1) {
            return false;
        }
        return materials.every((entry) => (counts.get(entry.itemId) ?? 0) >= entry.count);
    }    
    /**
 * consumeProtectionItemForFailure：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param job 参数说明。
 * @returns 函数返回值。
 */

    consumeProtectionItemForFailure(player, job) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const protectionItemId = job.protectionItemId ?? job.targetItemId;
        if (job.protectionItemSignature
            && this.consumeInventoryItemByPredicate(player, (item) => (0, shared_1.createItemStackSignature)(item) === job.protectionItemSignature, 1)) {
            return true;
        }
        return this.consumeInventoryItemByPredicate(player, (item) => this.isEligibleProtectionItem(item, protectionItemId, job.targetItemId), 1);
    }    
    /**
 * consumeInventoryItemByPredicate：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param predicate 参数说明。
 * @param count 数量。
 * @returns 函数返回值。
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
 * isSelfProtectionItem：执行状态校验并返回判断结果。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @returns 函数返回值。
 */

    isSelfProtectionItem(protectionItemId, targetItemId) {
        return protectionItemId === targetItemId;
    }    
    /**
 * isEligibleProtectionItem：执行状态校验并返回判断结果。
 * @param item 道具。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @returns 函数返回值。
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
 * getEligibleProtectionCount：按给定条件读取/查询数据。
 * @param player 玩家对象。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @returns 函数返回值。
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
 * finalizeMutation：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param options 选项参数。
 * @returns 函数返回值。
 */

    finalizeMutation(player, options = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (options.inventoryChanged) {
            player.inventory.revision += 1;
            this.playerRuntimeService.playerProgressionService.refreshPreview(player);
        }
        if (options.equipmentChanged) {
            player.equipment.revision += 1;
            this.playerRuntimeService.playerAttributesService.recalculate(player);
            this.playerRuntimeService.rebuildActionState(player, 0);
        }
        else if (options.attrChanged) {
            player.enhancementSkillLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        }
        if (options.attrChanged && !options.equipmentChanged) {
            player.enhancementSkillLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        }
        if (options.inventoryChanged || options.equipmentChanged || options.attrChanged || options.persistentOnly) {
            this.playerRuntimeService.bumpPersistentRevision(player);
        }
    }    
    /**
 * loadAlchemyCatalog：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    loadAlchemyCatalog() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const filePath = resolveContentPath('alchemy', 'recipes.json');
        if (!fs.existsSync(filePath)) {
            this.logger.warn(`炼丹配方目录缺失：${filePath}`);
            this.alchemyCatalog = [];
            return;
        }
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
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
    /**
 * loadEnhancementConfigs：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    loadEnhancementConfigs() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const root = resolveContentPath('enhancements');
        this.enhancementConfigs.clear();
        if (!fs.existsSync(root)) {
            this.logger.warn(`强化配置目录缺失：${root}`);
            return;
        }
        for (const filePath of walkJsonFiles(root)) {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
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
 * toAlchemyCatalogEntry：执行核心业务逻辑。
 * @param entry 参数说明。
 * @returns 函数返回值。
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
exports.CraftPanelRuntimeService = CraftPanelRuntimeService;
exports.CraftPanelRuntimeService = CraftPanelRuntimeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService,
        craft_panel_alchemy_query_service_1.CraftPanelAlchemyQueryService,
        craft_panel_enhancement_query_service_1.CraftPanelEnhancementQueryService])
], CraftPanelRuntimeService);
export { CraftPanelRuntimeService };
/**
 * resolveContentPath：执行核心业务逻辑。
 * @param segments 参数说明。
 * @returns 函数返回值。
 */

function resolveContentPath(...segments) {
    return path.resolve(__dirname, '../../../../../packages/server/data/content', ...segments);
}
/**
 * walkJsonFiles：执行核心业务逻辑。
 * @param root 参数说明。
 * @returns 函数返回值。
 */

function walkJsonFiles(root) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!fs.existsSync(root)) {
        return [];
    }
    const result = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const fullPath = path.join(root, entry.name);
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
 * normalizePositiveInt：执行核心业务逻辑。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @returns 函数返回值。
 */

function normalizePositiveInt(value, fallback = 1) {
    return Math.max(1, Math.floor(Number(value) || fallback));
}
/**
 * normalizeCraftSkill：执行核心业务逻辑。
 * @param value 参数说明。
 * @returns 函数返回值。
 */

function normalizeCraftSkill(value) {
    const level = Math.max(1, Math.floor(Number(value?.level) || 1));
    return {
        level,
        exp: Math.max(0, Math.floor(Number(value?.exp) || 0)),
        expToNext: Math.max(0, Math.floor(Number(value?.expToNext) || DEFAULT_CRAFT_EXP_TO_NEXT)),
    };
}
/**
 * normalizeEnhancementConfig：执行核心业务逻辑。
 * @param value 参数说明。
 * @returns 函数返回值。
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
 * normalizeEnhancementRequirement：执行核心业务逻辑。
 * @param value 参数说明。
 * @returns 函数返回值。
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
 * toAlchemyIngredientDef：执行核心业务逻辑。
 * @param contentTemplateRepository 参数说明。
 * @param ingredient 参数说明。
 * @returns 函数返回值。
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
 * resolveAlchemyRecipeCategory：执行核心业务逻辑。
 * @param outputItem 参数说明。
 * @param recipeId recipe ID。
 * @returns 函数返回值。
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
    throw new Error(`炼丹配方 ${recipeId} 的产出物 ${outputItem.itemId} 既不是瞬回药，也不是增益药`);
}
/**
 * computeAlchemyMaterialPower：执行核心业务逻辑。
 * @param level 参数说明。
 * @param grade 参数说明。
 * @param count 数量。
 * @returns 函数返回值。
 */

function computeAlchemyMaterialPower(level, grade, count = 1) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
    return normalizedLevel * (resolveAlchemyGradeValue(grade) ** 2) * normalizedCount;
}
/**
 * resolveAlchemyGradeValue：执行核心业务逻辑。
 * @param grade 参数说明。
 * @returns 函数返回值。
 */

function resolveAlchemyGradeValue(grade) {
    const index = shared_1.TECHNIQUE_GRADE_ORDER.indexOf(grade ?? 'mortal');
    return Math.max(1, index + 1);
}
/**
 * cloneItem：执行核心业务逻辑。
 * @param item 道具。
 * @returns 函数返回值。
 */

function cloneItem(item) {
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
 * clonePartialNumericStats：执行核心业务逻辑。
 * @param stats 参数说明。
 * @returns 函数返回值。
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
 * cloneEnhancementRecord：执行核心业务逻辑。
 * @param entry 参数说明。
 * @returns 函数返回值。
 */

function cloneEnhancementRecord(entry) {
    return {
        ...entry,
        levels: Array.isArray(entry.levels) ? entry.levels.map((level) => ({ ...level })) : [],
    };
}
/**
 * cloneEnhancementJob：执行核心业务逻辑。
 * @param entry 参数说明。
 * @returns 函数返回值。
 */

function cloneEnhancementJob(entry) {
    return {
        ...entry,
        target: entry.target ? { ...entry.target } : entry.target,
        item: cloneItem(entry.item),
        materials: Array.isArray(entry.materials) ? entry.materials.map((material) => ({ ...material })) : [],
    };
}
/**
 * countInventoryItem：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param itemId 道具 ID。
 * @returns 函数返回值。
 */

function countInventoryItem(player, itemId) {
    return player.inventory.items.reduce((total, entry) => entry.itemId === itemId ? total + entry.count : total, 0);
}
/**
 * receiveInventoryItem：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param contentTemplateRepository 参数说明。
 * @param item 道具。
 * @returns 函数返回值。
 */

function receiveInventoryItem(player, contentTemplateRepository, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = contentTemplateRepository.normalizeItem(item);
    const existing = player.inventory.items.find((entry) => entry.itemId === normalized.itemId);
    if (existing) {
        existing.count += normalized.count;
        return existing;
    }
    player.inventory.items.push({ ...normalized });
    return normalized;
}
/**
 * canReceiveCraftItem：执行状态校验并返回判断结果。
 * @param player 玩家对象。
 * @param item 道具。
 * @returns 函数返回值。
 */

function canReceiveCraftItem(player, item) {
    return player.inventory.items.some((entry) => entry.itemId === item.itemId)
        || player.inventory.items.length < player.inventory.capacity;
}
/**
 * consumeInventoryItemByItemId：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 函数返回值。
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
        throw new Error(`Inventory item ${itemId} insufficient`);
    }
}
/**
 * extractInventoryItemAt：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param slotIndex 参数说明。
 * @returns 函数返回值。
 */

function extractInventoryItemAt(player, slotIndex) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= player.inventory.items.length) {
        return null;
    }
    return player.inventory.items.splice(slotIndex, 1)[0] ?? null;
}
/**
 * setEquippedItem：更新/写入相关状态。
 * @param player 玩家对象。
 * @param slot 参数说明。
 * @param item 道具。
 * @returns 函数返回值。
 */

function setEquippedItem(player, slot, item) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const entry = player.equipment?.slots?.find((current) => current.slot === slot);
    if (!entry) {
        return;
    }
    entry.item = item ? cloneItem(item) : null;
}
/**
 * normalizeText：执行核心业务逻辑。
 * @param value 参数说明。
 * @returns 函数返回值。
 */

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}
/**
 * normalizeAlchemyPresetName：执行核心业务逻辑。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @returns 函数返回值。
 */

function normalizeAlchemyPresetName(value, fallback) {
    const normalized = normalizeText(value);
    return normalized || normalizeText(fallback) || '未命名丹方';
}
/**
 * createAlchemyPresetId：构建并返回目标对象。
 * @param recipeId recipe ID。
 * @returns 函数返回值。
 */

function createAlchemyPresetId(recipeId) {
    const base = normalizeText(recipeId) || 'alchemy';
    return `alchemy:${base}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}
/**
 * normalizeQuantity：执行核心业务逻辑。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @param max 参数说明。
 * @returns 函数返回值。
 */

function normalizeQuantity(value, fallback = 1, max = 99) {
    return Math.max(1, Math.min(max, Math.floor(Number(value) || fallback)));
}
/**
 * normalizeIngredientSelections：执行核心业务逻辑。
 * @param value 参数说明。
 * @returns 函数返回值。
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
/**
 * isExactSubmittedIngredients：执行状态校验并返回判断结果。
 * @param recipeIngredients 参数说明。
 * @param submitted 参数说明。
 * @returns 函数返回值。
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
/**
 * applyCraftSkillExp：更新/写入相关状态。
 * @param skill 参数说明。
 * @param amount 参数说明。
 * @returns 函数返回值。
 */

function applyCraftSkillExp(skill, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!skill) {
        return false;
    }
    let changed = false;
    skill.exp += Math.max(0, Math.floor(Number(amount) || 0));
    while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
        skill.exp -= skill.expToNext;
        skill.level += 1;
        skill.expToNext = Math.max(DEFAULT_CRAFT_EXP_TO_NEXT, DEFAULT_CRAFT_EXP_TO_NEXT + ((skill.level - 1) * 12));
        changed = true;
    }
    return changed || amount > 0;
}
/**
 * resolveAlchemyBatchSuccess：执行核心业务逻辑。
 * @param outputCount 参数说明。
 * @param successRate 参数说明。
 * @returns 函数返回值。
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
 * normalizeEquipSlot：执行核心业务逻辑。
 * @param value 参数说明。
 * @returns 函数返回值。
 */

function normalizeEquipSlot(value) {
    return shared_1.EQUIP_SLOTS.includes(value) ? value : null;
}
/**
 * cloneTargetRef：执行核心业务逻辑。
 * @param ref 参数说明。
 * @returns 函数返回值。
 */

function cloneTargetRef(ref) {
    return ref.source === 'equipment'
        ? { source: 'equipment', slot: ref.slot }
        : { source: 'inventory', slotIndex: ref.slotIndex };
}
/**
 * buildCraftMutationResult：构建并返回目标对象。
 * @param error 参数说明。
 * @returns 函数返回值。
 */

function buildCraftMutationResult(error) {
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
 * @returns 函数返回值。
 */

function buildCraftTickResult(panelChanged = false, messages = [], inventoryChanged = false, equipmentChanged = false, attrChanged = false, groundDrops = []) {
    return {
        ok: true,
        panelChanged,
        inventoryChanged,
        equipmentChanged,
        attrChanged,
        messages,
        groundDrops,
    };
}
/**
 * normalizeEnhanceLevel：执行核心业务逻辑。
 * @param level 参数说明。
 * @returns 函数返回值。
 */

function normalizeEnhanceLevel(level) {
    return Math.max(0, Math.min(MAX_ENHANCE_LEVEL, Math.floor(Number(level) || 0)));
}
/**
 * getEnhancementTargetSuccessRate：按给定条件读取/查询数据。
 * @param targetEnhanceLevel 参数说明。
 * @returns 函数返回值。
 */

function getEnhancementTargetSuccessRate(targetEnhanceLevel) {
    const normalizedLevel = Math.max(1, Math.floor(Number(targetEnhanceLevel) || 1));
    const index = Math.min(normalizedLevel, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL.length) - 1;
    return Math.max(0, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL[index] ?? 0);
}
/**
 * getEnhancementSpiritStoneCost：按给定条件读取/查询数据。
 * @param itemLevel 参数说明。
 * @param hasMaterialCost 参数说明。
 * @returns 函数返回值。
 */

function getEnhancementSpiritStoneCost(itemLevel, hasMaterialCost = false) {
    const level = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
    return Math.max(1, hasMaterialCost ? Math.floor(level / 10) : Math.ceil(level / 10));
}
/**
 * computeEnhancementToolSpeedRate：执行核心业务逻辑。
 * @param toolBaseSpeedRate 参数说明。
 * @param roleEnhancementLevel 参数说明。
 * @param targetItemLevel 参数说明。
 * @returns 函数返回值。
 */

function computeEnhancementToolSpeedRate(toolBaseSpeedRate, roleEnhancementLevel, targetItemLevel) {
    const baseSpeedRate = Number.isFinite(toolBaseSpeedRate) ? Number(toolBaseSpeedRate) : 0;
    const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
    const levelBonus = Math.max(0, normalizeEnhanceLevel(roleEnhancementLevel) - targetLevel) * ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL;
    return baseSpeedRate + levelBonus;
}
/**
 * computeEnhancementJobTicks：执行核心业务逻辑。
 * @param itemLevel 参数说明。
 * @param speedRate 参数说明。
 * @returns 函数返回值。
 */

function computeEnhancementJobTicks(itemLevel, speedRate) {
    return computeAdjustedCraftTicks(computeEnhancementJobBaseTicks(itemLevel), speedRate);
}
/**
 * computeEnhancementJobBaseTicks：执行核心业务逻辑。
 * @param itemLevel 参数说明。
 * @returns 函数返回值。
 */

function computeEnhancementJobBaseTicks(itemLevel) {
    const normalizedLevel = Math.max(1, Math.floor(Number(itemLevel) || 1));
    return ENHANCEMENT_BASE_JOB_TICKS + Math.max(0, normalizedLevel - 1) * ENHANCEMENT_JOB_TICKS_PER_ITEM_LEVEL;
}
/**
 * computeAdjustedCraftTicks：执行核心业务逻辑。
 * @param baseTicks 参数说明。
 * @param speedRate 参数说明。
 * @returns 函数返回值。
 */

function computeAdjustedCraftTicks(baseTicks, speedRate) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedBaseTicks = Math.max(1, Math.floor(Number(baseTicks) || 1));
    const normalizedSpeedRate = Number.isFinite(speedRate) ? Number(speedRate) : 0;
    if (normalizedSpeedRate === 0) {
        return normalizedBaseTicks;
    }
    if (normalizedSpeedRate > 0) {
        return Math.max(1, Math.ceil(normalizedBaseTicks / (1 + normalizedSpeedRate)));
    }
    return Math.max(1, Math.ceil(normalizedBaseTicks * (1 + Math.abs(normalizedSpeedRate))));
}
/**
 * applyEnhancementSuccessModifier：更新/写入相关状态。
 * @param baseRate 参数说明。
 * @param modifier 参数说明。
 * @returns 函数返回值。
 */

function applyEnhancementSuccessModifier(baseRate, modifier) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedBaseRate = Math.max(0, Math.min(1, Number.isFinite(baseRate) ? Number(baseRate) : 0));
    if (normalizedBaseRate <= 0 || normalizedBaseRate >= 1) {
        return normalizedBaseRate;
    }
    const normalizedModifier = Number.isFinite(modifier) ? Number(modifier) : 0;
    if (normalizedModifier === 0) {
        return normalizedBaseRate;
    }
    if (normalizedModifier < 0) {
        return normalizedBaseRate / (1 + Math.abs(normalizedModifier));
    }
    const factor = 1 + normalizedModifier;
    if (normalizedBaseRate <= 0.5) {
        const scaledSuccess = normalizedBaseRate * factor;
        if (scaledSuccess <= 0.5) {
            return scaledSuccess;
        }
        return 1 - (0.25 / scaledSuccess);
    }
    return 1 - ((1 - normalizedBaseRate) / factor);
}
/**
 * computeEnhancementAdjustedSuccessRate：执行核心业务逻辑。
 * @param targetEnhanceLevel 参数说明。
 * @param roleEnhancementLevel 参数说明。
 * @param targetItemLevel 参数说明。
 * @param toolSuccessRateModifier 参数说明。
 * @returns 函数返回值。
 */

function computeEnhancementAdjustedSuccessRate(targetEnhanceLevel, roleEnhancementLevel, targetItemLevel, toolSuccessRateModifier = 0) {
    const baseRate = getEnhancementTargetSuccessRate(targetEnhanceLevel);
    const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
    const normalizedRoleLevel = Math.max(1, normalizeEnhanceLevel(roleEnhancementLevel));
    const lowerLevelGap = Math.max(0, targetLevel - normalizedRoleLevel);
    const upperLevelGap = Math.max(0, normalizedRoleLevel - targetLevel);
    const adjustedBaseRate = baseRate * ((1 - ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY) ** lowerLevelGap);
    const totalSuccessModifier = (Number.isFinite(toolSuccessRateModifier) ? Number(toolSuccessRateModifier) : 0)
        + (upperLevelGap * ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL);
    return applyEnhancementSuccessModifier(adjustedBaseRate, totalSuccessModifier);
}
