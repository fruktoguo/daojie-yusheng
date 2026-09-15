/**
 * craft-panel-runtime.alchemy-like.ts
 *
 * 从 CraftPanelRuntimeService 拆出的炼丹/炼器共享流实现：校验、启动、取消、
 * 预设管理、tick 推进、批量结算与成功率刷新。所有函数以 xxxImpl(self: CraftPanelRuntimeService, ...) 形式导出，
 * 由主类一行委托调用。
 */
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
import { assignItemInstanceIdIfNeeded } from '../world/item-instance-id.helpers';
import { ALCHEMY_CATALOG_VERSION, ALCHEMY_FURNACE_TAG, cloneAlchemyJob } from './craft-panel-alchemy-query.helpers';
import { buildForgingAlchemyPanelState } from './craft-panel-alchemy-query.service';
import { resolvePlayerEffectiveLuck } from '../player/player-special-stat.helpers';
import { resolvePlayerCraftRealmLevel } from './craft-effect-runtime.helpers';
import { advanceTechniqueActivityPause } from './technique-activity-runtime.helpers';
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
import { SPIRIT_STONE_ITEM_ID, ALCHEMY_LIKE_RESOURCE_CONSUMPTION_MODE_PER_BATCH, ALCHEMY_LIKE_RESOURCE_CONSUMPTION_VERSION } from './craft-panel-runtime.service';
import { resolveCraftSkillExpToNextByLevel } from './craft-skill-exp.helpers';

export function validateAlchemyLikeStartImpl(self: CraftPanelRuntimeService, player, payload, jobKindInput = undefined) {
        self.ensureCraftSkills(player);
        const jobKind = jobKindInput === 'forging' || payload?.kind === 'forging' ? 'forging' : 'alchemy';
        const catalog = jobKind === 'forging' ? self.forgingCatalog : self.alchemyCatalog;
        const outputNoun = jobKind === 'forging' ? '成器' : '成丹';
        const recipe = catalog.find((entry) => entry.recipeId === normalizeText(payload?.recipeId));
        if (!recipe) {
            return { ok: false, error: jobKind === 'forging' ? '对应器方不存在。' : '对应丹方不存在。' };
        }
        const normalizedSelection = validateAlchemySelection(self.contentTemplateRepository, recipe, normalizeIngredientSelections(payload?.ingredients));
        if ('error' in normalizedSelection) {
            return { ok: false, error: normalizedSelection.error };
        }
        const quantity = normalizeQuantity(payload?.quantity, 1);
        const furnaceOutputCount = jobKind === 'forging' || recipe.category === 'buff' ? 1 : ALCHEMY_FURNACE_OUTPUT_COUNT;
        const elementMatchSnapshot = computeFivePhaseElementMatch(
            normalizedSelection.inputElements,
            buildAlchemyRecipeTargetElements(self.contentTemplateRepository, recipe)
        );
        const baseSuccessRate = resolveAlchemyLikeBaseSuccessRate(recipe, elementMatchSnapshot.baseElementSuccessRate);
        const craftSkillLevel = (jobKind === 'forging' ? player.forgingSkill?.level : player.alchemySkill?.level) ?? 1;
        const rawBrewTicks = computeAlchemyRawBrewTicks(
            recipe.baseBrewTicks,
            recipe,
            normalizedSelection.ingredients,
            recipe.outputLevel,
            craftSkillLevel,
            self.getAlchemyLikeToolSpeedRate(player, jobKind),
            furnaceOutputCount
        );
        const batchBrewTicks = computeAlchemyAdjustedBrewTicks(
            recipe.baseBrewTicks,
            recipe,
            normalizedSelection.ingredients,
            recipe.outputLevel,
            craftSkillLevel,
            self.getAlchemyLikeToolSpeedRate(player, jobKind),
            furnaceOutputCount
        );
        const totalTicks = computeAlchemyTotalJobTicks(rawBrewTicks, quantity, 0);
        const exactRecipe = elementMatchSnapshot.baseElementSuccessRate >= 1;
        const successRate = computeAlchemyAdjustedSuccessRate(
            baseSuccessRate,
            recipe.outputLevel,
            craftSkillLevel,
            self.getAlchemyLikeToolSuccessRate(player, jobKind),
            self.getLuckSuccessRateBonus(player)
        );
        const baseBatchOutputCount = computeAlchemyBatchOutputCountWithSize(recipe.outputCount, furnaceOutputCount);
        const batchOutputCount = applyCraftOutputRate(
            baseBatchOutputCount,
            self.getAlchemyLikeToolOutputRate(player, jobKind),
        );
        const spiritStoneCost = getAlchemySpiritStoneCost(recipe.outputLevel, recipe.category === 'buff') * quantity;
        return {
            ok: true,
            validated: {
                jobKind,
                catalog,
                outputNoun,
                recipe,
                ingredients: normalizedSelection.ingredients,
                quantity,
                spiritStoneCost,
                rawBrewTicks,
                batchBrewTicks,
                totalTicks,
                exactRecipe,
                baseElementSuccessRate: baseSuccessRate,
                elementMatchSnapshot,
                successRate,
                batchOutputCount,
            },
        };
}

export function queueAlchemyLikeStartImpl(self: CraftPanelRuntimeService, player, validated, payload) {
        if (!self.hasAnyActiveTechniqueActivity(player)) {
            return null;
        }
        return self.enqueueCraftQueueItem(
            player,
            buildAlchemyQueueItem(validated.recipe, validated.ingredients, validated.quantity, validated.jobKind),
            normalizeCraftQueueStartMode(payload?.queueMode),
        );
}

export function consumeAlchemyLikeStartResourcesImpl(self: CraftPanelRuntimeService, player, validated) {
        return self.validateAlchemyLikeBatchResources(player, validated);
}

export function validateAlchemyLikeBatchResourcesImpl(self: CraftPanelRuntimeService, player, validatedOrJob) {
        const ingredients = Array.isArray(validatedOrJob?.ingredients) ? validatedOrJob.ingredients : [];
        for (const ingredient of ingredients) {
            const requiredCount = Math.max(1, Math.trunc(Number(ingredient.count) || 0));
            if (countInventoryItem(player, ingredient.itemId) < requiredCount) {
                return { ok: false, error: `${resolvePlayerFacingContentName(ingredient.itemId, '未知物品', self.contentTemplateRepository.getItemName(ingredient.itemId))} 数量不足。` };
            }
        }
        const batchSpiritStoneCost = self.resolveAlchemyLikeBatchSpiritStoneCost(validatedOrJob);
        if (batchSpiritStoneCost > 0 && !self.playerRuntimeService.canAffordWallet(player.playerId, SPIRIT_STONE_ITEM_ID, batchSpiritStoneCost)) {
            return { ok: false, error: `灵石不足，需要 ${batchSpiritStoneCost} 枚。` };
        }
        return { ok: true };
}

export function consumeAlchemyLikeBatchResourcesImpl(self: CraftPanelRuntimeService, player, job) {
        const validation = self.validateAlchemyLikeBatchResources(player, job);
        if (!validation.ok) {
            return validation;
        }
        const ingredients = Array.isArray(job?.ingredients) ? job.ingredients : [];
        let inventoryChanged = false;
        for (const ingredient of ingredients) {
            consumeInventoryItemByItemId(player, ingredient.itemId, Math.max(1, Math.trunc(Number(ingredient.count) || 0)));
            inventoryChanged = true;
        }
        const batchSpiritStoneCost = self.resolveAlchemyLikeBatchSpiritStoneCost(job);
        if (batchSpiritStoneCost > 0) {
            self.playerRuntimeService.debitWallet(player.playerId, SPIRIT_STONE_ITEM_ID, batchSpiritStoneCost);
            inventoryChanged = true;
        }
        return { ok: true, inventoryChanged };
}

export function resolveAlchemyLikeBatchSpiritStoneCostImpl(self: CraftPanelRuntimeService, job) {
        const quantity = Math.max(1, Math.floor(Number(job?.quantity) || 1));
        const totalCost = Math.max(0, Math.floor(Number(job?.spiritStoneCost) || 0));
        const completedCount = Math.max(0, Math.floor(Number(job?.completedCount) || 0));
        const baseCost = Math.floor(totalCost / quantity);
        const remainder = totalCost % quantity;
        return baseCost + (completedCount < remainder ? 1 : 0);
}

export function isAlchemyLikePerBatchResourceJobImpl(self: CraftPanelRuntimeService, job) {
        return job?.resourceConsumptionMode === ALCHEMY_LIKE_RESOURCE_CONSUMPTION_MODE_PER_BATCH
            || Math.trunc(Number(job?.resourceConsumptionVersion) || 0) >= ALCHEMY_LIKE_RESOURCE_CONSUMPTION_VERSION
            || job?.resourcesDeductedAtStart === false;
}

export function markAlchemyLikePerBatchResourceJobImpl(self: CraftPanelRuntimeService, job) {
        if (!job || typeof job !== 'object') {
            return;
        }
        job.resourceConsumptionMode = ALCHEMY_LIKE_RESOURCE_CONSUMPTION_MODE_PER_BATCH;
        job.resourceConsumptionVersion = ALCHEMY_LIKE_RESOURCE_CONSUMPTION_VERSION;
        job.resourcesDeductedAtStart = false;
}

export function computeLegacyAlchemyLikePrepaidRefundImpl(self: CraftPanelRuntimeService, job) {
        const quantity = Math.max(1, Math.trunc(Number(job?.quantity) || 1));
        const completedCount = Math.min(quantity, Math.max(0, Math.trunc(Number(job?.completedCount) || 0)));
        const refundableBatchCount = Math.max(0, quantity - completedCount);
        const ingredients = Array.isArray(job?.ingredients) ? job.ingredients : [];
        const items = [];
        for (const ingredient of ingredients) {
            const count = Math.max(1, Math.trunc(Number(ingredient?.count) || 0)) * refundableBatchCount;
            if (!ingredient?.itemId || count <= 0) {
                continue;
            }
            items.push({ itemId: ingredient.itemId, count });
        }
        const totalSpiritStoneCost = Math.max(0, Math.trunc(Number(job?.spiritStoneCost) || 0));
        const baseCost = Math.floor(totalSpiritStoneCost / quantity);
        const remainder = totalSpiritStoneCost % quantity;
        const completedSpiritStoneCost = (baseCost * completedCount) + Math.min(completedCount, remainder);
        return {
            items,
            spiritStones: Math.max(0, totalSpiritStoneCost - completedSpiritStoneCost),
        };
}

export function ensureAlchemyLikeJobResourceCompatibilityImpl(self: CraftPanelRuntimeService, player, jobKind = 'alchemy', job = undefined) {
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        const activeJob = job ?? getAlchemyLikeJob(player, normalizedJobKind);
        if (!activeJob || self.isAlchemyLikePerBatchResourceJob(activeJob)) {
            return { migrated: false, inventoryChanged: false, walletChanged: false, spiritStones: 0 };
        }
        const refund = self.computeLegacyAlchemyLikePrepaidRefund(activeJob);
        let inventoryChanged = false;
        let walletChanged = false;
        let creditedSpiritStones = 0;
        for (const item of refund.items) {
            if (item.itemId === SPIRIT_STONE_ITEM_ID) {
                self.playerRuntimeService.creditWallet(player.playerId, SPIRIT_STONE_ITEM_ID, item.count);
                creditedSpiritStones += item.count;
                walletChanged = true;
                inventoryChanged = true;
                continue;
            }
            receiveInventoryItem(player, self.contentTemplateRepository, { itemId: item.itemId, count: item.count });
            inventoryChanged = true;
        }
        if (refund.spiritStones > 0) {
            self.playerRuntimeService.creditWallet(player.playerId, SPIRIT_STONE_ITEM_ID, refund.spiritStones);
            creditedSpiritStones += refund.spiritStones;
            walletChanged = true;
            inventoryChanged = true;
        }
        self.markAlchemyLikePerBatchResourceJob(activeJob);
        activeJob.legacyPrepaidResourceRefundedAt = Date.now();
        self.finalizeMutation(player, {
            inventoryChanged,
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return {
            migrated: true,
            inventoryChanged,
            walletChanged,
            spiritStones: creditedSpiritStones,
        };
}

export function createAlchemyLikeStartJobImpl(self: CraftPanelRuntimeService, player, validated) {
        const recipe = validated.recipe;
        const nextJob = {
            jobRunId: createCraftJobRunId(player.playerId, validated.jobKind),
            jobType: validated.jobKind,
            recipeId: recipe.recipeId,
            outputItemId: recipe.outputItemId,
            outputCount: validated.batchOutputCount,
            quantity: validated.quantity,
            completedCount: 0,
            successCount: 0,
            failureCount: 0,
            ingredients: validated.ingredients.map((entry) => ({ ...entry })),
            phase: 'brewing',
            preparationTicks: 0,
            batchBrewTicks: validated.batchBrewTicks,
            rawBrewTicks: validated.rawBrewTicks ?? validated.batchBrewTicks,
            currentBatchRemainingTicks: validated.batchBrewTicks,
            pausedTicks: 0,
            workTotalTicks: validated.totalTicks,
            workRemainingTicks: validated.totalTicks,
            interruptWaitRemainingTicks: 0,
            interruptState: null,
            spiritStoneCost: validated.spiritStoneCost,
            resourceConsumptionMode: ALCHEMY_LIKE_RESOURCE_CONSUMPTION_MODE_PER_BATCH,
            resourceConsumptionVersion: ALCHEMY_LIKE_RESOURCE_CONSUMPTION_VERSION,
            resourcesDeductedAtStart: false,
            totalTicks: validated.totalTicks,
            remainingTicks: validated.totalTicks,
            successRate: validated.successRate,
            baseElementSuccessRate: validated.baseElementSuccessRate,
            elementMatchSnapshot: cloneCraftElementMatchSnapshot(validated.elementMatchSnapshot),
            jobVersion: 1,
            exactRecipe: validated.exactRecipe,
            outputLevel: recipe.outputLevel,
            baseBrewTicks: recipe.baseBrewTicks,
            startedAt: Date.now(),
        };
        setAlchemyLikeJob(player, validated.jobKind, nextJob);
        return nextJob;
}

export function finalizeAlchemyLikeStartImpl(self: CraftPanelRuntimeService, player) {
        self.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
}

export function buildAlchemyLikeStartMessagesImpl(self: CraftPanelRuntimeService, validated) {
        const recipe = validated.recipe;
        const actionLabel = validated.jobKind === 'forging' ? '炼器' : '炼制';
        const successRateText = (validated.successRate * 100).toFixed(validated.successRate === 1 ? 0 : 1);
        return [{
            kind: validated.jobKind === 'forging' ? 'forging' : 'alchemy',
            key: 'notice.craft.alchemy.start',
            vars: {
                actionLabel,
                itemName: recipe.outputName,
                quantity: validated.quantity,
                spiritStoneCost: validated.spiritStoneCost,
                totalTicks: validated.totalTicks,
                batchOutputCount: validated.batchOutputCount,
                outputNoun: validated.outputNoun,
                successRate: successRateText,
            },
            pills: [{ key: 'itemName', style: 'target' }],
        }];
}

export function startAlchemyImpl(self: CraftPanelRuntimeService, player, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        self.playerRuntimeService.captureOfflineGainBeforeTick?.(player);
        const validation = self.validateAlchemyLikeStart(player, payload);
        if (!validation.ok) {
            return buildCraftMutationResult(validation.error);
        }
        const queued = self.queueAlchemyLikeStart(player, validation.validated, payload);
        if (queued) {
            return queued;
        }
        const consumed = self.consumeAlchemyLikeStartResources(player, validation.validated);
        if (!consumed.ok) {
            return buildCraftMutationResult(consumed.error);
        }
        self.createAlchemyLikeStartJob(player, validation.validated);
        self.finalizeAlchemyLikeStart(player);
        const result = {
            ok: true,
            panelChanged: true,
            inventoryChanged: false,
            messages: self.buildAlchemyLikeStartMessages(validation.validated),
        };
        self.recordTechniqueActivityStatisticMutation(player, result);
        return result;
}

export function startForgingImpl(self: CraftPanelRuntimeService, player, payload) {
        return self.startAlchemy(player, { ...(payload ?? {}), kind: 'forging' });
}

export function cancelAlchemyImpl(self: CraftPanelRuntimeService, player, jobKind = 'alchemy') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        self.ensureCraftSkills(player);
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        const job = getAlchemyLikeJob(player, normalizedJobKind);
        if (!job) {
            return buildCraftMutationResult(normalizedJobKind === 'forging' ? '当前没有可取消的炼器任务。' : '当前没有可取消的炼丹任务。');
        }
        self.playerRuntimeService.captureOfflineGainBeforeTick?.(player);
        const compatibility = self.ensureAlchemyLikeJobResourceCompatibility(player, normalizedJobKind, job);
        setAlchemyLikeJob(player, normalizedJobKind, null);
        self.finalizeMutation(player, {
            inventoryChanged: Boolean(compatibility.inventoryChanged),
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        const result = {
            ok: true,
            panelChanged: true,
            inventoryChanged: Boolean(compatibility.inventoryChanged),
            groundDrops: [],
            messages: [{
                    kind: 'system',
                    key: normalizedJobKind === 'forging'
                        ? 'notice.craft.forging.cancel-no-refund'
                        : 'notice.craft.alchemy.cancel-no-refund',
                }],
        };
        self.recordTechniqueActivityStatisticMutation(player, result);
        return result;
}

export function cancelForgingImpl(self: CraftPanelRuntimeService, player) {
        return self.cancelAlchemy(player, 'forging');
}

export function saveAlchemyPresetImpl(self: CraftPanelRuntimeService, player, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        self.ensureCraftSkills(player);
        const recipeId = normalizeText(payload?.recipeId);
        const recipe = self.alchemyCatalog.find((entry) => entry.recipeId === recipeId);
        if (!recipe) {
            return buildCraftMutationResult('对应丹方不存在。');
        }
        const normalizedSelection = validateAlchemySelection(self.contentTemplateRepository, recipe, normalizeIngredientSelections(payload?.ingredients));
        if ('error' in normalizedSelection) {
            return buildCraftMutationResult(normalizedSelection.error);
        }
        const requestedPresetId = normalizeText(payload?.presetId);
        const presetName = normalizeAlchemyPresetName(
            payload?.name,
            resolvePlayerFacingContentName(recipe.recipeId, '未命名炼制预设', recipe.outputName),
        );
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
        self.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['alchemy_preset'],
        });
        void self.persistAlchemyPresets(player).catch((error) => {
            console.warn(`炼丹预设直写失败，已标记脏数据等待重试：${error instanceof Error ? error.message : String(error)}`);
            self.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['alchemy_preset']);
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

export function deleteAlchemyPresetImpl(self: CraftPanelRuntimeService, player, presetIdInput) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        self.ensureCraftSkills(player);
        const presetId = normalizeText(presetIdInput);
        if (!presetId) {
            return buildCraftMutationResult('预设标识不能为空。');
        }
        const index = player.alchemyPresets.findIndex((entry) => entry.presetId === presetId);
        if (index < 0) {
            return buildCraftMutationResult('对应炼制预设不存在。');
        }
        const [removed] = player.alchemyPresets.splice(index, 1);
        self.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['alchemy_preset'],
        });
        void self.persistAlchemyPresets(player).catch((error) => {
            console.warn(`炼丹预设直写失败，已标记脏数据等待重试：${error instanceof Error ? error.message : String(error)}`);
            self.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['alchemy_preset']);
        });
        return {
            ok: true,
            panelChanged: true,
            messages: [{
                    kind: 'system',
                    text: `已删除炼制预设：${resolvePlayerFacingContentName(presetId, '未命名炼制预设', removed?.name)}`,
                }],
        };
}

export function interruptAlchemyImpl(self: CraftPanelRuntimeService, player, reason, jobKind = 'alchemy') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        return self.interruptTechniqueActivity(player, normalizedJobKind, reason);
}

export function getAlchemyLikeActiveJobImpl(self: CraftPanelRuntimeService, player, jobKind = 'alchemy') {
        return getAlchemyLikeJob(player, jobKind === 'forging' ? 'forging' : 'alchemy');
}

export function ensureAlchemyLikeActiveJobResourceCompatibilityMutationImpl(self: CraftPanelRuntimeService, player, jobKind = 'alchemy') {
        const compatibility = self.ensureAlchemyLikeJobResourceCompatibility(player, jobKind);
        if (!compatibility.migrated) {
            return self.buildAlchemyLikeTickResult();
        }
        return self.buildAlchemyLikeTickResult(true, [], Boolean(compatibility.inventoryChanged));
}

export function setAlchemyLikeActiveJobImpl(self: CraftPanelRuntimeService, player, jobKind = 'alchemy', job = null) {
        setAlchemyLikeJob(player, jobKind === 'forging' ? 'forging' : 'alchemy', job);
}

export function advanceAlchemyLikePausedJobImpl(self: CraftPanelRuntimeService, player, job) {
        const resumed = advanceTechniqueActivityPause(job, 'brewing');
        self.finalizeMutation(player, {
            persistentOnly: true,
            dirtyDomains: ['active_job'],
        });
        return resumed;
}

export function resolveAlchemyLikeBatchSuccessImpl(self: CraftPanelRuntimeService, job, successRate = undefined) {
        return resolveAlchemyBatchSuccess(job.outputCount, successRate ?? job.successRate);
}

export function buildAlchemyLikeBatchResolveResultImpl(self: CraftPanelRuntimeService, player, jobKind, job, successCount, failureCount, completed, messages) {
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        const outputItems = successCount > 0
            ? [{
                    itemId: job.outputItemId,
                    count: successCount,
                    ...(typeof job.outputItemName === 'string' ? { name: job.outputItemName } : {}),
                }]
            : [];
        return {
            successCount,
            failureCount,
            outputs: outputItems.map((item) => ({
                itemId: item.itemId,
                count: item.count,
                ...(typeof item.name === 'string' ? { name: item.name } : {}),
            })),
            inventoryDelta: {
                granted: outputItems.map((item) => ({ itemId: item.itemId, count: item.count, ...(typeof item.name === 'string' ? { name: item.name } : {}) })),
                dropped: [],
                changed: false,
            },
            panelDirty: {
                changed: true,
                kinds: [normalizedJobKind],
                reason: completed ? 'completed' : 'batch',
            },
            expParams: self.buildAlchemyLikeExpParams(player, normalizedJobKind, job, successCount, failureCount),
            completed,
            messages,
        };
}

export function buildAlchemyLikeExpParamsImpl(self: CraftPanelRuntimeService, player, jobKind, job, successCount, failureCount) {
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        const catalog = normalizedJobKind === 'forging' ? self.forgingCatalog : self.alchemyCatalog;
        const recipe = Array.isArray(catalog)
            ? catalog.find((entry) => entry.recipeId === job.recipeId)
            : null;
        const skill = normalizedJobKind === 'forging' ? player.forgingSkill : player.alchemySkill;
        return {
            playerRealmLevel: resolvePlayerCraftRealmLevel(player),
            skillLevel: skill?.level ?? 1,
            targetLevel: recipe?.outputLevel ?? job.outputLevel ?? 1,
            baseActionTicks: resolveAlchemySkillBaseActionTicks(recipe, job),
            successCount,
            failureCount,
            successMultiplier: 1,
            getExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(self.playerRuntimeService, level),
        };
}

export function completeAlchemyLikeJobImpl(self: CraftPanelRuntimeService, player, jobKind, job) {
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        migrateLegacyCraftQueueToUnifiedQueue(player, job.queuedJobs);
        setAlchemyLikeJob(player, normalizedJobKind, null);
        self.finalizeMutation(player, { persistentOnly: true, dirtyDomains: ['active_job'] });
        return buildCraftMutationResult();
}

export function buildAlchemyLikeCompletionMessageImpl(self: CraftPanelRuntimeService, jobKind, job) {
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        const activityLabel = normalizedJobKind === 'forging' ? '炼器' : '炼制';
        const successNoun = normalizedJobKind === 'forging' ? '成器' : '成丹';
        return {
            kind: normalizedJobKind,
            key: 'notice.craft.alchemy.completed',
            vars: {
                itemName: resolvePlayerFacingContentName(job.outputItemId, '未知物品', self.contentTemplateRepository.getItemName(job.outputItemId)),
                activityLabel,
                successNoun,
                count: job.successCount,
            },
            pills: [{ key: 'itemName', style: 'target' }],
        };
}

export function buildAlchemyLikeBatchMessageImpl(self: CraftPanelRuntimeService, jobKind, job, successCount) {
        const successNoun = jobKind === 'forging' ? '成器' : '成丹';
        return {
            kind: successCount > 0 ? jobKind : 'system',
            key: successCount > 0
                ? 'notice.craft.alchemy.batch-success'
                : 'notice.craft.alchemy.batch-failed',
            vars: {
                batch: job.completedCount,
                successNoun,
                count: successCount,
            },
        };
}

export function buildAlchemyLikeTickResultImpl(
    self: CraftPanelRuntimeService,
    panelChanged = false,
    messages = [],
    inventoryChanged = false,
    equipmentChanged = false,
    attrChanged = false,
    groundDrops = [],
    craftRealmExpGain = 0,
) {
        return buildCraftTickResult(panelChanged, messages, inventoryChanged, equipmentChanged, attrChanged, groundDrops, craftRealmExpGain);
}

export function tickAlchemyImpl(self: CraftPanelRuntimeService, player, jobKind = undefined) {
        self.ensurePipelineInitialized();
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        return self.pipeline.tick(player, normalizedJobKind, self.buildPipelineContext(null));
}

export function getAlchemyLikeToolSpeedRateImpl(self: CraftPanelRuntimeService, player, jobKind) {
        const craftEffectStats = self.getCraftEffectStats(player);
        return jobKind === 'forging' ? craftEffectStats.forging.speedRate : craftEffectStats.alchemy.speedRate;
}

export function getAlchemyLikeToolSuccessRateImpl(self: CraftPanelRuntimeService, player, jobKind) {
        const craftEffectStats = self.getCraftEffectStats(player);
        return jobKind === 'forging' ? craftEffectStats.forging.successRate : craftEffectStats.alchemy.successRate;
}

export function getAlchemyLikeToolOutputRateImpl(self: CraftPanelRuntimeService, player, jobKind) {
        const craftEffectStats = self.getCraftEffectStats(player);
        return jobKind === 'forging' ? craftEffectStats.forging.outputRate : craftEffectStats.alchemy.outputRate;
}

export function getLuckSuccessRateBonusImpl(self: CraftPanelRuntimeService, player) {
        return computeLuckSuccessRateBonus(resolvePlayerEffectiveLuck(player));
}

export function resolveAlchemyLikeCurrentSuccessRateImpl(self: CraftPanelRuntimeService, player, jobKind, job) {
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        const baseRate = Number.isFinite(Number(job?.baseElementSuccessRate))
            ? Number(job.baseElementSuccessRate)
            : Number(job?.successRate ?? 0);
        const targetLevel = Math.max(1, Math.floor(Number(job?.outputLevel ?? 1) || 1));
        const craftSkillLevel = normalizedJobKind === 'forging'
            ? player?.forgingSkill?.level
            : player?.alchemySkill?.level;
        return computeAlchemyAdjustedSuccessRate(
            baseRate,
            targetLevel,
            craftSkillLevel,
            self.getAlchemyLikeToolSuccessRate(player, normalizedJobKind),
            self.getLuckSuccessRateBonus(player),
        );
}

export function refreshAlchemyLikeActiveJobSuccessRateImpl(self: CraftPanelRuntimeService, player, jobKind) {
        const normalizedJobKind = jobKind === 'forging' ? 'forging' : 'alchemy';
        const job = self.getAlchemyLikeActiveJob(player, normalizedJobKind);
        if (!job) {
            return;
        }
        job.successRate = self.resolveAlchemyLikeCurrentSuccessRate(player, normalizedJobKind, job);
}

export function getAlchemyLikeToolItemImpl(self: CraftPanelRuntimeService, player, jobKind) {
        const slot = jobKind === 'forging' ? 'technique_forging' : 'technique_alchemy';
        const expectedTag = jobKind === 'forging' ? 'forging_tool' : ALCHEMY_FURNACE_TAG;
        const tool = self.getEquippedItem(player, slot);
        if (tool?.tags?.includes(expectedTag)) {
            return tool;
        }
        const legacyWeapon = self.getEquippedItem(player, 'weapon');
        return legacyWeapon?.tags?.includes(expectedTag) ? legacyWeapon : null;
}

