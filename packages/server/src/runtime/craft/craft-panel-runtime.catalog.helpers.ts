/**
 * craft-panel-runtime.catalog.helpers.ts
 *
 * 从 craft-panel-runtime.service.ts 拆出的内容加载与归一化游离函数集合。
 * 包含内容路径解析、JSON 遍历、炼丹/强化配置归一化、道具克隆、队列管理、
 * 持久化快照构建、背包/装备操作等纯函数，供 CraftPanelRuntimeService 委托调用。
 */
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
    ALCHEMY_FURNACE_OUTPUT_COUNT,
    ARTIFACT_CRAFT_BASE_SUCCESS_RATE,
    COMBAT_EQUIP_SLOTS,
    ELEMENT_KEYS,
    EQUIP_SLOTS,
    TECHNIQUE_EQUIP_SLOTS,
    MAX_ENHANCE_LEVEL,
    TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH,
    TECHNIQUE_GRADE_ORDER,
    addCraftElementVector,
    canMergeItemStack,
    compactCraftElementVector,
    computeAlchemyBrewTicks,
    createEmptyCraftElementVector,
    createItemStackSignature,
    isLegacyItemInstanceId,
    normalizeCraftEffectStatsPatch,
    normalizeCraftElementVector,
    resolvePlayerFacingContentName,
    type ItemStack,
    type TechniqueActivityQueueReorderAction,
} from '@mud/shared';
import { assignItemInstanceIdIfNeeded } from '../world/item-instance-id.helpers';
import { DEFAULT_CRAFT_EXP_TO_NEXT, resolveCraftSkillExpToNextByLevel } from './craft-skill-exp.helpers';
import {
    buildEnhancementRecordRowsFromEntries,
    type PlayerTechniqueActivityQueueUpsertInput,
} from '../../persistence/player-domain-persistence.service';
import type { DurableProfessionStateSnapshot } from '../../persistence/durable-operation.service';
import { resolveProjectPath } from '../../common/project-path';

export type CraftRuntimeSectionRecorder = ((key: string, durationMs: number, count?: number) => void) | null;
/**
 * resolveContentPath：规范化或转换内容路径。
 * @param segments 参数说明。
 * @returns 无返回值，直接更新内容路径相关状态。
 */

export function resolveContentPath(...segments) {
    return resolveProjectPath('packages', 'server', 'data', 'content', ...segments);
}
/**
 * walkJsonFiles：执行walkJsonFile相关逻辑。
 * @param root 参数说明。
 * @returns 无返回值，直接更新walkJsonFile相关状态。
 */

export function walkJsonFiles(root) {
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

export function normalizePositiveInt(value, fallback = 1) {
    return Math.max(1, Math.floor(Number(value) || fallback));
}

export function normalizeTechniqueGrade(value) {
    return TECHNIQUE_GRADE_ORDER.includes(value) ? value : 'mortal';
}
/**
 * normalizeCraftSkill：规范化或转换炼制技能。
 * @param value 参数说明。
 * @returns 无返回值，直接更新炼制技能相关状态。
 */

export function normalizeCraftSkill(value, getExpToNextByLevel = null) {
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

export function normalizeEnhancementConfig(value) {
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

export function normalizeEnhancementRequirement(value) {
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

export function toAlchemyIngredientDef(contentTemplateRepository, ingredient) {
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

export function toAlchemyMainIngredientDef(contentTemplateRepository, ingredient) {
    const itemId = typeof ingredient?.itemId === 'string' ? ingredient.itemId.trim() : '';
    const item = contentTemplateRepository.createItem(itemId, 1);
    if (!item) {
        return null;
    }
    return {
        itemId,
        name: item.name,
        count: normalizePositiveInt(ingredient?.count, 1),
    };
}

export function resolveRecipeRequiredAuxElements(contentTemplateRepository, rawRequiredAuxElements, legacyIngredients) {
    const explicit = normalizeCraftElementVector(rawRequiredAuxElements);
    if (sumCraftElementAbs(explicit) > 0) {
        return explicit;
    }
    const auxElements = sumRecipeIngredientElements(
        contentTemplateRepository,
        legacyIngredients.filter((ingredient) => ingredient.role !== 'main'),
    );
    if (sumCraftElementAbs(auxElements) > 0) {
        return auxElements;
    }
    return createEmptyCraftElementVector();
}

export function sumRecipeIngredientElements(contentTemplateRepository, ingredients) {
    const result = createEmptyCraftElementVector();
    for (const ingredient of ingredients) {
        const item = contentTemplateRepository.createItem(ingredient.itemId, 1);
        if (!item?.materialValues?.elements) {
            continue;
        }
        addCraftElementVector(result, item.materialValues.elements, ingredient.count);
    }
    return compactCraftElementVector(result);
}

export function buildAlchemyRecipeTargetElements(contentTemplateRepository, recipe) {
    const result = createEmptyCraftElementVector();
    addCraftElementVector(result, recipe.requiredAuxElements, 1);
    const mainIngredients = Array.isArray(recipe.mainIngredients) && recipe.mainIngredients.length > 0
        ? recipe.mainIngredients
        : (recipe.ingredients ?? []).filter((entry) => entry.role === 'main');
    for (const ingredient of mainIngredients) {
        const item = contentTemplateRepository.createItem(ingredient.itemId, 1);
        if (!item?.materialValues?.elements) {
            continue;
        }
        addCraftElementVector(result, item.materialValues.elements, ingredient.count);
    }
    return compactCraftElementVector(result);
}

export function sumCraftElementAbs(elements) {
    return ELEMENT_KEYS.reduce((total, element) => total + Math.abs(Number(elements?.[element]) || 0), 0);
}
/**
 * resolveAlchemyRecipeCategory：规范化或转换炼丹RecipeCategory。
 * @param outputItem 参数说明。
 * @param recipeId recipe ID。
 * @returns 无返回值，直接更新炼丹RecipeCategory相关状态。
 */

export function resolveAlchemyRecipeCategory(outputItem, recipeId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (recipeId === 'forging.copper_luopan' || outputItem.itemId === 'equip.copper_luopan') {
        return 'special';
    }
    if (outputItem.type === 'equipment') {
        if (TECHNIQUE_EQUIP_SLOTS.includes(outputItem.equipSlot)) {
            return 'special';
        }
        if (COMBAT_EQUIP_SLOTS.includes(outputItem.equipSlot)) {
            return outputItem.equipSlot;
        }
    }
    if (outputItem.type === 'artifact') {
        return 'artifact';
    }
    if (typeof outputItem.healAmount === 'number'
        || typeof outputItem.healPercent === 'number'
        || typeof outputItem.baselineHealPercent === 'number'
        || typeof outputItem.baselineQiPercent === 'number'
        || typeof outputItem.qiPercent === 'number') {
        return 'recovery';
    }
    if ((outputItem.consumeBuffs?.length ?? 0) > 0) {
        return 'buff';
    }
    return 'special';
}

/** resolveAlchemyLikeBaseSuccessRate：法宝器方把五行基础成功率压到 10% 上限。 */
export function resolveAlchemyLikeBaseSuccessRate(recipe, rawBaseSuccessRate) {
    const normalized = Math.max(0, Math.min(1, Number(rawBaseSuccessRate) || 0));
    return recipe?.category === 'artifact'
        ? Math.max(0, Math.min(1, normalized * ARTIFACT_CRAFT_BASE_SUCCESS_RATE))
        : normalized;
}
/**
 * computeAlchemyMaterialPower：执行炼丹MaterialPower相关逻辑。
 * @param level 参数说明。
 * @param grade 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新炼丹MaterialPower相关状态。
 */

export function computeAlchemyMaterialPower(level, grade, count = 1) {
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
    return normalizedLevel * (resolveAlchemyGradeValue(grade) ** 2) * normalizedCount;
}
/**
 * resolveAlchemyGradeValue：规范化或转换炼丹Grade值。
 * @param grade 参数说明。
 * @returns 无返回值，直接更新炼丹Grade值相关状态。
 */

export function resolveAlchemyGradeValue(grade) {
    const index = TECHNIQUE_GRADE_ORDER.indexOf(grade ?? 'mortal');
    return Math.max(1, index + 1);
}
/**
 * cloneItem：构建道具。
 * @param item 道具。
 * @returns 无返回值，直接更新道具相关状态。
 */

export function cloneItem(item) {
    if (!item || typeof item !== 'object') {
        return undefined;
    }
    const flat = flattenItemForClone(item);
    return {
        ...flat,
        equipAttrs: flat.equipAttrs ? { ...flat.equipAttrs } : undefined,
        equipStats: flat.equipStats ? clonePartialNumericStats(flat.equipStats) : undefined,
        equipValueStats: flat.equipValueStats ? { ...flat.equipValueStats } : undefined,
        equipSpecialStats: flat.equipSpecialStats ? { ...flat.equipSpecialStats } : undefined,
        craftEffectStats: normalizeCraftEffectStatsPatch(flat.craftEffectStats),
        consumeBuffs: Array.isArray(flat.consumeBuffs) ? flat.consumeBuffs.map((entry) => ({ ...entry })) : undefined,
        effects: Array.isArray(flat.effects) ? flat.effects.map((entry) => ({ ...entry })) : undefined,
        tags: Array.isArray(flat.tags) ? flat.tags.slice() : undefined,
    };
}

export function flattenItemForClone(item) {
    if (!item || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null) {
        return item;
    }
    const result = {};
    for (const key in item) {
        result[key] = item[key];
    }
    return result;
}

export function isEnhanceableItem(item) {
    return item?.type === 'equipment' || item?.type === 'artifact';
}
/**
 * clonePartialNumericStats：构建PartialNumericStat。
 * @param stats 参数说明。
 * @returns 无返回值，直接更新PartialNumericStat相关状态。
 */

export function clonePartialNumericStats(stats) {
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

export function cloneEnhancementRecord(entry) {
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

export function cloneEnhancementJob(entry) {
    return {
        ...entry,
        target: entry.target ? { ...entry.target } : entry.target,
        // 旧版字段：仅在迁移期残留，按需透传不强构造；新版工件存在 inventory.lockedItems
        item: entry.item ? cloneItem(entry.item) : undefined,
        materials: Array.isArray(entry.materials) ? entry.materials.map((material) => ({ ...material })) : [],
    };
}

export function createCraftJobRunId(playerId, jobType) {
    const normalizedJobType = jobType === 'enhancement' ? 'enhancement' : jobType === 'forging' ? 'forging' : 'alchemy';
    const entropy = Math.random().toString(36).slice(2, 8);
    return `job:${normalizedJobType}:${Date.now().toString(36)}${entropy}`;
}

export function normalizeCraftQueueStartMode(value) {
    if (value === 'preserve' || value === 'append') {
        return value;
    }
    return 'replace';
}

export function cloneCraftQueue(queue) {
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

export function getPlayerCraftQueue(player) {
    return [
        ...getPlayerTechniqueActivityQueue(player),
        ...cloneCraftQueue(player?.alchemyJob?.queuedJobs ?? []),
        ...cloneCraftQueue(player?.forgingJob?.queuedJobs ?? []),
        ...cloneCraftQueue(player?.enhancementJob?.queuedJobs ?? []),
    ];
}

export function getPlayerTechniqueActivityQueue(player) {
    if (!player || typeof player !== 'object') {
        return [];
    }
    if (!Array.isArray(player.techniqueActivityQueue)) {
        player.techniqueActivityQueue = [];
    }
    return player.techniqueActivityQueue
        .map((entry) => normalizeTechniqueActivityQueueItem(entry))
        .filter(Boolean);
}

export function setPlayerTechniqueActivityQueue(player, queue) {
    if (!player || typeof player !== 'object') {
        return;
    }
    player.techniqueActivityQueue = Array.isArray(queue)
        ? queue
            .map((entry) => normalizeTechniqueActivityQueueItem(entry))
            .filter(Boolean)
        : [];
}

export function enqueuePlayerTechniqueActivityQueueItem(player, item, mode) {
    const currentQueue = getPlayerTechniqueActivityQueue(player);
    const normalizedItem = normalizeTechniqueActivityQueueItem(item);
    if (!normalizedItem) {
        return false;
    }
    const nextQueue = mode === 'replace'
        ? [normalizedItem]
        : mode === 'preserve'
            ? [normalizedItem, ...currentQueue]
            : [...currentQueue, normalizedItem];
    if (nextQueue.length > TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH) {
        return false;
    }
    setPlayerTechniqueActivityQueue(player, nextQueue);
    return true;
}

export function reorderPlayerTechniqueActivityQueueItem(player, queueIdInput, action: TechniqueActivityQueueReorderAction) {
    const queueId = typeof queueIdInput === 'string' ? queueIdInput.trim() : '';
    if (!queueId || (action !== 'move_to_top' && action !== 'move_down')) {
        return false;
    }
    const queues = [
        getPlayerTechniqueActivityQueue(player),
        player?.alchemyJob?.queuedJobs,
        player?.forgingJob?.queuedJobs,
        player?.enhancementJob?.queuedJobs,
    ];
    for (const queue of queues) {
        if (!Array.isArray(queue)) {
            continue;
        }
        const fromIndex = queue.findIndex((item) => item?.queueId === queueId);
        if (fromIndex < 0) {
            continue;
        }
        const toIndex = action === 'move_to_top'
            ? 0
            : Math.min(queue.length - 1, fromIndex + 1);
        if (toIndex === fromIndex) {
            return false;
        }
        const [item] = queue.splice(fromIndex, 1);
        queue.splice(toIndex, 0, item);
        if (queue === queues[0]) {
            setPlayerTechniqueActivityQueue(player, queue);
        }
        return true;
    }
    return false;
}

export function migrateLegacyCraftQueueToUnifiedQueue(player, legacyQueue) {
    const items = cloneCraftQueue(legacyQueue);
    if (items.length <= 0) {
        return;
    }
    const currentQueue = getPlayerTechniqueActivityQueue(player);
    const seen = new Set(currentQueue.map((entry) => entry.queueId));
    for (const item of items) {
        const normalizedItem = normalizeTechniqueActivityQueueItem(item);
        if (normalizedItem && !seen.has(normalizedItem.queueId)) {
            currentQueue.push(normalizedItem);
            seen.add(normalizedItem.queueId);
        }
    }
    setPlayerTechniqueActivityQueue(player, currentQueue.slice(0, TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH));
}

export function normalizeTechniqueActivityQueueItem(item) {
    if (!item || typeof item !== 'object') {
        return null;
    }
    const kind = normalizeRuntimeTechniqueActivityKind(item.kind);
    const queueId = normalizeText(item.queueId) || createTechniqueActivityQueueId(kind);
    const state = item.state === 'sleeping' ? 'sleeping' : 'pending';
    const payload = item.payload && typeof item.payload === 'object'
        ? structuredClone(item.payload)
        : item.payload;
    const normalized = {
        ...item,
        queueId,
        kind,
        payload,
        label: normalizeText(item.label) || (kind === 'forging'
            ? '炼器任务'
            : kind === 'enhancement'
                ? '强化任务'
                : kind === 'gather'
                    ? '采集任务'
                    : kind === 'building'
                        ? '营造任务'
                        : kind === 'mining'
                            ? '挖矿任务'
                            : kind === 'formation'
                                ? '阵法任务'
                                : '炼丹任务'),
        state,
        createdAt: Math.max(1, Math.trunc(Number(item.createdAt ?? Date.now()))),
        cancelRef: {
            kind,
            queueId,
        },
    };
    const targetLabel = normalizeText(item.targetLabel);
    if (targetLabel) {
        normalized.targetLabel = targetLabel;
    }
    const sleepReason = normalizeText(item.sleepReason);
    if (sleepReason) {
        normalized.sleepReason = sleepReason;
    }
    return normalized;
}

export function normalizeRuntimeTechniqueActivityKind(kind) {
    return kind === 'forging'
        || kind === 'enhancement'
        || kind === 'gather'
        || kind === 'building'
        || kind === 'mining'
        || kind === 'formation'
        ? kind
        : 'alchemy';
}

export function hasCancelableTechniqueActivityJob(player, kind) {
    if (!player || typeof player !== 'object') {
        return false;
    }
    if (kind === 'alchemy') {
        return Boolean(player.alchemyJob && player.alchemyJob.jobType !== 'forging');
    }
    if (kind === 'forging') {
        return Boolean(player.forgingJob || player.alchemyJob?.jobType === 'forging');
    }
    if (kind === 'enhancement') {
        return Boolean(player.enhancementJob);
    }
    if (kind === 'transmission') {
        return Boolean(player.transmissionJob);
    }
    if (kind === 'formation') {
        return Boolean(player.formationJob);
    }
    if (kind === 'gather') {
        return Boolean(player.gatherJob);
    }
    if (kind === 'mining') {
        return Boolean(player.miningJob);
    }
    return kind === 'building' && Boolean(player.buildingJob);
}

export function createTechniqueActivityQueueId(kind) {
    return `technique-queue:${kind}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export function getAlchemyLikeJob(player, jobKind) {
    return jobKind === 'forging' ? player?.forgingJob ?? null : player?.alchemyJob ?? null;
}

export function setAlchemyLikeJob(player, jobKind, job) {
    if (jobKind === 'forging') {
        player.forgingJob = job;
    }
    else {
        player.alchemyJob = job;
    }
}

export function buildCraftQueueId(kind) {
    const normalizedKind = kind === 'enhancement' ? 'enhancement' : kind === 'forging' ? 'forging' : 'alchemy';
    return `craft-queue:${normalizedKind}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export function buildAlchemyQueueItem(recipe, ingredients, quantity, kind = 'alchemy') {
    const normalizedKind = kind === 'forging' ? 'forging' : 'alchemy';
    return {
        queueId: buildCraftQueueId(normalizedKind),
        kind: normalizedKind,
        label: resolvePlayerFacingContentName(
            recipe?.outputItemId,
            normalizedKind === 'forging' ? '炼器任务' : '炼丹任务',
            recipe?.outputName,
        ),
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

export function buildEnhancementQueueItem(target, protection, payload, desiredTargetLevel, targetLabel = undefined) {
    const targetItemId = normalizeText(target?.item?.itemId);
    const targetItemName = resolvePlayerFacingContentName(
        targetItemId,
        '未知物品',
        targetLabel,
        target?.item?.name,
    );
    return {
        queueId: buildCraftQueueId('enhancement'),
        kind: 'enhancement',
        label: targetItemName === '未知物品' ? '强化任务' : targetItemName,
        quantity: desiredTargetLevel,
        createdAt: Date.now(),
        payload: {
            target: target?.ref ? cloneTargetRef(target.ref) : undefined,
            protection: protection?.ref ? cloneTargetRef(protection.ref) : undefined,
            targetItemId: targetItemId || undefined,
            targetItemName: targetItemName === '未知物品' ? undefined : targetItemName,
            targetLevel: payload?.targetLevel,
            protectionStartLevel: payload?.protectionStartLevel,
        },
    };
}

export function buildActiveJobSnapshotFromPlayer(player) {
    if (player?.formationJob) {
        return buildActiveJobSnapshot(player.formationJob, 'formation');
    }
    if (player?.buildingJob) {
        return buildActiveJobSnapshot(player.buildingJob, 'building');
    }
    if (player?.miningJob) {
        return buildActiveJobSnapshot(player.miningJob, 'mining');
    }
    if (player?.transmissionJob) {
        return buildActiveJobSnapshot(player.transmissionJob, 'transmission');
    }
    if (player?.gatherJob) {
        return buildActiveJobSnapshot(player.gatherJob, 'gather');
    }
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

export function captureEnhancementAssetRuntimeState(player) {
    return {
        inventory: {
            revision: player?.inventory?.revision,
            items: Array.isArray(player?.inventory?.items)
                ? player.inventory.items.map((entry) => cloneItem(entry))
                : [],
            lockedItems: Array.isArray(player?.inventory?.lockedItems)
                ? player.inventory.lockedItems.map((entry) => ({ ...entry }))
                : [],
        },
        equipment: {
            revision: player?.equipment?.revision,
            slots: Array.isArray(player?.equipment?.slots)
                ? player.equipment.slots.map((entry) => ({
                    ...entry,
                    item: entry?.item ? cloneItem(entry.item) : null,
                }))
                : [],
        },
        wallet: {
            balances: Array.isArray(player?.wallet?.balances)
                ? player.wallet.balances.map((entry) => ({ ...entry }))
                : [],
        },
        enhancementJob: player?.enhancementJob ? cloneEnhancementJob(player.enhancementJob) : null,
        enhancementRecords: Array.isArray(player?.enhancementRecords)
            ? player.enhancementRecords.map((entry) => structuredClone(entry))
            : [],
        enhancementSkill: player?.enhancementSkill ? { ...player.enhancementSkill } : null,
        enhancementSkillLevel: player?.enhancementSkillLevel,
        techniqueActivityQueue: Array.isArray(player?.techniqueActivityQueue)
            ? player.techniqueActivityQueue.map((entry) => structuredClone(entry))
            : [],
        selfRevision: player?.selfRevision,
        dirtyDomains: player?.dirtyDomains instanceof Set ? new Set(player.dirtyDomains) : null,
    };
}

/** 普通进度息只保存 ensureCraftSkills 与 active_job 修订可能触达的引用和值。 */
export function captureEnhancementProgressRuntimeState(player) {
    return {
        alchemySkill: player?.alchemySkill,
        forgingSkill: player?.forgingSkill,
        gatherSkill: player?.gatherSkill,
        miningSkill: player?.miningSkill,
        formationSkill: player?.formationSkill,
        enhancementSkill: player?.enhancementSkill,
        enhancementSkillLevel: player?.enhancementSkillLevel,
        alchemyPresets: player?.alchemyPresets,
        enhancementRecords: player?.enhancementRecords,
        alchemyJob: player?.alchemyJob,
        forgingJob: player?.forgingJob,
        enhancementJob: player?.enhancementJob,
        persistentRevision: player?.persistentRevision,
        selfRevision: player?.selfRevision,
        dirtyDomains: player?.dirtyDomains instanceof Set ? new Set(player.dirtyDomains) : null,
    };
}

export function restoreEnhancementProgressRuntimeState(player, snapshot) {
    if (!player || !snapshot) {
        return;
    }
    player.alchemySkill = snapshot.alchemySkill;
    player.forgingSkill = snapshot.forgingSkill;
    player.gatherSkill = snapshot.gatherSkill;
    player.miningSkill = snapshot.miningSkill;
    player.formationSkill = snapshot.formationSkill;
    player.enhancementSkill = snapshot.enhancementSkill;
    player.enhancementSkillLevel = snapshot.enhancementSkillLevel;
    player.alchemyPresets = snapshot.alchemyPresets;
    player.enhancementRecords = snapshot.enhancementRecords;
    player.alchemyJob = snapshot.alchemyJob;
    player.forgingJob = snapshot.forgingJob;
    player.enhancementJob = snapshot.enhancementJob;
    player.persistentRevision = snapshot.persistentRevision;
    player.selfRevision = snapshot.selfRevision;
    player.dirtyDomains = snapshot.dirtyDomains instanceof Set
        ? new Set(snapshot.dirtyDomains)
        : snapshot.dirtyDomains;
}

export function restoreEnhancementAssetRuntimeState(player, snapshot) {
    if (!player || !snapshot) {
        return;
    }
    if (player.inventory) {
        player.inventory.revision = snapshot.inventory.revision;
        player.inventory.items = snapshot.inventory.items.map((entry) => cloneItem(entry));
        player.inventory.lockedItems = snapshot.inventory.lockedItems.map((entry) => ({ ...entry }));
    }
    if (player.equipment) {
        player.equipment.revision = snapshot.equipment.revision;
        player.equipment.slots = snapshot.equipment.slots.map((entry) => ({
            ...entry,
            item: entry?.item ? cloneItem(entry.item) : null,
        }));
    }
    player.wallet = {
        balances: snapshot.wallet.balances.map((entry) => ({ ...entry })),
    };
    player.enhancementJob = snapshot.enhancementJob ? cloneEnhancementJob(snapshot.enhancementJob) : null;
    player.enhancementRecords = snapshot.enhancementRecords.map((entry) => structuredClone(entry));
    player.enhancementSkill = snapshot.enhancementSkill ? { ...snapshot.enhancementSkill } : null;
    player.enhancementSkillLevel = snapshot.enhancementSkillLevel;
    player.techniqueActivityQueue = snapshot.techniqueActivityQueue.map((entry) => structuredClone(entry));
    player.selfRevision = snapshot.selfRevision;
    const currentDirtyDomains = player.dirtyDomains instanceof Set ? new Set(player.dirtyDomains) : new Set();
    for (const domain of snapshot.dirtyDomains instanceof Set ? snapshot.dirtyDomains : []) {
        currentDirtyDomains.add(domain);
    }
    for (const domain of ['inventory', 'wallet', 'equipment', 'attr', 'active_job', 'enhancement_record']) {
        currentDirtyDomains.add(domain);
    }
    player.dirtyDomains = currentDirtyDomains;
}

export function buildDurableInventoryItemsFromSnapshot(snapshot) {
    const normalItems = Array.isArray(snapshot?.inventory?.items) ? snapshot.inventory.items : [];
    const lockedItems = Array.isArray(snapshot?.inventory?.lockedItems) ? snapshot.inventory.lockedItems : [];
    return [
        ...normalItems.map((entry) => buildDurableInventoryItemSnapshot(entry, null)),
        ...lockedItems.map((entry) => buildDurableInventoryItemSnapshot(entry, normalizeText(entry?.lockedBy))),
    ];
}

export function buildDurableWalletBalancesFromSnapshot(snapshot) {
    const balances = Array.isArray(snapshot?.wallet?.balances) ? snapshot.wallet.balances : [];
    return balances
        .map((entry) => ({
            walletType: normalizeText(entry?.walletType),
            balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
            frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
            version: Math.max(0, Math.trunc(Number(entry?.version ?? 0))),
        }))
        .filter((entry) => Boolean(entry.walletType));
}

/**
 * 连续强化中间阶只提取真实变化行。任何会改变资产归属/槽位语义的情况都返回 null，
 * 调用方自动回退完整快照替换。
 */
export function buildEnhancementAdvancedAssetPatch(playerId, beforeState, player) {
    const beforeInventoryItems = buildDurableInventoryItemsFromSnapshot({ inventory: beforeState?.inventory });
    const nextInventoryItems = buildDurableInventoryItemsFromSnapshot({ inventory: player?.inventory });
    const beforeInventoryById = indexStableDurableInventoryItems(beforeInventoryItems);
    const nextInventoryById = indexStableDurableInventoryItems(nextInventoryItems);
    if (!beforeInventoryById || !nextInventoryById) {
        return null;
    }
    const changedInventoryItems = [];
    for (const [itemInstanceId, nextItem] of nextInventoryById) {
        const beforeItem = beforeInventoryById.get(itemInstanceId);
        if (!beforeItem || normalizeText(beforeItem.lockedBy) !== normalizeText(nextItem.lockedBy)) {
            return null;
        }
        if (!isDeepStrictEqual(
            normalizeEnhancementPatchComparableValue(beforeItem),
            normalizeEnhancementPatchComparableValue(nextItem),
        )) {
            changedInventoryItems.push(nextItem);
        }
    }
    const removedInventoryItemInstanceIds = Array.from(beforeInventoryById.keys())
        .filter((itemInstanceId) => !nextInventoryById.has(itemInstanceId))
        .sort();

    const beforeEquipmentSlots = Array.isArray(beforeState?.equipment?.slots)
        ? beforeState.equipment.slots
        : [];
    const nextEquipmentSlots = Array.isArray(player?.equipment?.slots)
        ? player.equipment.slots
        : [];
    if (!isDeepStrictEqual(
        normalizeEnhancementPatchComparableValue(beforeEquipmentSlots),
        normalizeEnhancementPatchComparableValue(nextEquipmentSlots),
    )) {
        return null;
    }

    const beforeWalletBalances = buildDurableWalletBalancesFromSnapshot({ wallet: beforeState?.wallet });
    const nextWalletBalances = buildDurableWalletBalancesFromSnapshot({ wallet: player?.wallet });
    const beforeWalletByType = new Map(beforeWalletBalances.map((entry) => [entry.walletType, entry]));
    const nextWalletByType = new Map(nextWalletBalances.map((entry) => [entry.walletType, entry]));
    const changedWalletBalances = nextWalletBalances.filter((entry) => (
        !isDeepStrictEqual(beforeWalletByType.get(entry.walletType), entry)
    ));
    const removedWalletTypes = Array.from(beforeWalletByType.keys())
        .filter((walletType) => !nextWalletByType.has(walletType))
        .sort();

    const beforeEnhancementRecords = buildDurableEnhancementRecordsFromEntries(
        playerId,
        beforeState?.enhancementRecords ?? [],
    );
    const nextEnhancementRecords = buildDurableEnhancementRecordsFromEntries(
        playerId,
        player?.enhancementRecords ?? [],
    );
    const beforeEnhancementRecordById = new Map(
        beforeEnhancementRecords.map((entry) => [entry.recordId, entry]),
    );
    const nextEnhancementRecordIds = new Set(nextEnhancementRecords.map((entry) => entry.recordId));
    if (beforeEnhancementRecords.some((entry) => !nextEnhancementRecordIds.has(entry.recordId))) {
        return null;
    }
    const changedEnhancementRecords = nextEnhancementRecords.filter((entry) => (
        !isDeepStrictEqual(beforeEnhancementRecordById.get(entry.recordId), entry)
    ));
    const nextProfessionStates = buildDurableProfessionStatesFromSnapshot({
        progression: {
            enhancementSkill: player?.enhancementSkill,
            enhancementSkillLevel: player?.enhancementSkillLevel,
        },
    }).filter((entry) => entry.professionType === 'enhancement');

    return {
        nextInventoryItems: changedInventoryItems,
        removedInventoryItemInstanceIds,
        nextWalletBalances: changedWalletBalances,
        removedWalletTypes,
        nextEnhancementRecords: changedEnhancementRecords,
        nextProfessionStates,
    };
}

export function indexStableDurableInventoryItems(items) {
    const byId = new Map();
    for (const item of Array.isArray(items) ? items : []) {
        const itemInstanceId = normalizeInventoryItemInstanceId(item?.itemInstanceId);
        if (!itemInstanceId || isLegacyItemInstanceId(itemInstanceId) || byId.has(itemInstanceId)) {
            return null;
        }
        byId.set(itemInstanceId, item);
    }
    return byId;
}

export function normalizeEnhancementPatchComparableValue(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeEnhancementPatchComparableValue(entry));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    const normalized = {};
    for (const [key, entry] of Object.entries(value)) {
        if (entry !== undefined) {
            normalized[key] = normalizeEnhancementPatchComparableValue(entry);
        }
    }
    return normalized;
}

export function resolveEnhancementDurableCompletionKind(action, player, jobRunId, expectedJob = null) {
    if (action === 'tick') {
        return 'advanced';
    }
    const records = Array.isArray(player?.enhancementRecords) ? player.enhancementRecords : [];
    const record = records.find((entry) => entry?.jobRunId === jobRunId)
        ?? records.find((entry) => Number(entry?.actionStartedAt) === Number(expectedJob?.startedAt))
        ?? [...records].reverse().find((entry) => entry?.itemId === expectedJob?.targetItemId)
        ?? null;
    return record?.status === 'stopped' ? 'stopped' : 'completed';
}

export function buildDurableInventoryItemSnapshot(entry, lockedBy) {
    const rawPayload = entry && typeof entry === 'object' ? { ...entry } : {};
    return {
        itemId: normalizeText(entry?.itemId),
        itemInstanceId: normalizeInventoryItemInstanceId(entry?.itemInstanceId),
        count: Math.max(1, Math.trunc(Number(entry?.count ?? 1))),
        lockedBy: lockedBy || null,
        lockedAt: Number.isFinite(Number(entry?.lockedAt)) ? Math.max(1, Math.trunc(Number(entry.lockedAt))) : null,
        name: typeof entry?.name === 'string' ? entry.name : undefined,
        desc: typeof entry?.desc === 'string' ? entry.desc : undefined,
        enhanceLevel: entry?.enhanceLevel == null ? undefined : normalizeEnhanceLevel(entry.enhanceLevel),
        learnTechniqueId: typeof entry?.learnTechniqueId === 'string' ? entry.learnTechniqueId : undefined,
        learnTechniqueMaxLevel: Number.isFinite(Number(entry?.learnTechniqueMaxLevel))
            ? Math.max(0, Math.trunc(Number(entry.learnTechniqueMaxLevel)))
            : undefined,
        grade: typeof entry?.grade === 'string' ? entry.grade : undefined,
        level: Number.isFinite(Number(entry?.level)) ? Math.max(1, Math.trunc(Number(entry.level))) : undefined,
        rawPayload,
    };
}

export function buildDurableEquipmentSlotsFromSnapshot(snapshot) {
    const slots = Array.isArray(snapshot?.equipment?.slots) ? snapshot.equipment.slots : [];
    return slots
        .filter((entry) => entry?.item)
        .map((entry) => ({
            slot: normalizeEquipSlot(entry.slot) ?? entry.slot,
            itemInstanceId: normalizeInventoryItemInstanceId(entry.item?.itemInstanceId),
            item: { ...entry.item },
        }));
}

export function buildDurableEnhancementRecordsFromEntries(playerId, entries) {
    return buildEnhancementRecordRowsFromEntries(playerId, entries).map((row) => ({
        recordId: row.recordId,
        itemId: row.itemId,
        itemName: row.itemName,
        highestLevel: row.highestLevel,
        levels: Array.isArray(row.levelsPayload) ? row.levelsPayload : [],
        actionStartedAt: row.actionStartedAt,
        actionEndedAt: row.actionEndedAt,
        startLevel: row.startLevel,
        initialTargetLevel: row.initialTargetLevel,
        desiredTargetLevel: row.desiredTargetLevel,
        protectionStartLevel: row.protectionStartLevel,
        status: row.status,
    }));
}

export function buildDurableProfessionStatesFromSnapshot(snapshot): DurableProfessionStateSnapshot[] {
    const progression = snapshot?.progression && typeof snapshot.progression === 'object'
        ? snapshot.progression
        : {};
    const rows: DurableProfessionStateSnapshot[] = [];
    const append = (
        professionType: DurableProfessionStateSnapshot['professionType'],
        skill: unknown,
        fallbackLevel: unknown = null,
    ) => {
        const state = skill && typeof skill === 'object' ? skill as Record<string, unknown> : null;
        if (!state && fallbackLevel == null) {
            return;
        }
        const exp = state?.exp == null ? Number.NaN : Number(state.exp);
        const expToNext = state?.expToNext == null ? Number.NaN : Number(state.expToNext);
        rows.push({
            professionType,
            level: Math.max(1, Math.trunc(Number(state?.level ?? fallbackLevel ?? 1) || 1)),
            exp: Number.isFinite(exp) ? Math.max(0, exp) : null,
            expToNext: Number.isFinite(expToNext) ? Math.max(0, expToNext) : null,
        });
    };
    append('alchemy', progression.alchemySkill);
    append('building', progression.buildingSkill);
    append('gather', progression.gatherSkill);
    append('forging', progression.forgingSkill);
    append('mining', progression.miningSkill);
    append('formation', progression.formationSkill);
    append('transmission', progression.transmissionSkill);
    append('enhancement', progression.enhancementSkill, progression.enhancementSkillLevel ?? 1);
    return rows;
}

export function buildTechniqueActivityQueueSnapshotFromPlayer(player): PlayerTechniqueActivityQueueUpsertInput[] {
    return getPlayerTechniqueActivityQueue(player).map((entry, index) => {
        const queueId = typeof entry.queueId === 'string' && entry.queueId.trim()
            ? entry.queueId.trim()
            : buildCraftQueueId(entry.kind ?? 'activity');
        const kind = typeof entry.kind === 'string' && entry.kind.trim() ? entry.kind.trim() : 'activity';
        const cancelRef = entry.cancelRef && typeof entry.cancelRef === 'object'
            ? { ...entry.cancelRef, kind, queueId }
            : { kind, queueId };
        return {
            queueId,
            kind,
            state: typeof entry.state === 'string' && entry.state.trim() ? entry.state.trim() : 'pending',
            label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : null,
            targetLabel: typeof entry.targetLabel === 'string' && entry.targetLabel.trim() ? entry.targetLabel.trim() : null,
            sleepReason: typeof entry.sleepReason === 'string' && entry.sleepReason.trim() ? entry.sleepReason.trim() : null,
            retryAfterTicks: Number.isFinite(Number(entry.retryAfterTicks)) ? Math.max(0, Math.trunc(Number(entry.retryAfterTicks))) : null,
            createdAt: Math.max(1, Math.trunc(Number(entry.createdAt ?? Date.now()))),
            payloadJson: entry.payload && typeof entry.payload === 'object' ? structuredClone(entry.payload) : {},
            cancelRefJson: cancelRef,
            detailJson: {
                ...entry,
                queueId,
                kind,
                cancelRef,
                queueOrder: index,
            },
        };
    });
}

export function buildActiveJobSnapshot(job, jobType) {
    if (!job || typeof job !== 'object') {
        return null;
    }
    const normalizedJobType = normalizeActiveJobSnapshotType(jobType);
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

export function normalizeActiveJobSnapshotType(jobType) {
    switch (jobType) {
        case 'formation':
        case 'building':
        case 'mining':
        case 'gather':
        case 'enhancement':
        case 'forging':
            return jobType;
        default:
            return 'alchemy';
    }
}

export function isCompletedAlchemyLikeJob(job) {
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

export function countInventoryItem(player, itemId) {
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

export function receiveInventoryItem(player, contentTemplateRepository, item) {
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
 * consumeInventoryItemByItemId：执行consume背包道具By道具ID相关逻辑。
 * @param player 玩家对象。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具By道具ID相关状态。
 */

export function consumeInventoryItemByItemId(player, itemId, count) {
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

export function extractInventoryItemByInstanceId(player, itemInstanceId) {
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

export function findInventoryItemByInstanceId(player, itemInstanceId) {
    const slotIndex = findInventoryItemIndexByInstanceId(player, itemInstanceId);
    return slotIndex >= 0 ? player.inventory.items[slotIndex] ?? null : null;
}

export function findInventoryItemIndexByInstanceId(player, itemInstanceId) {
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

export function setEquippedItem(player, slot, item) {
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
export function extractEquipmentItem(player, slot) {
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

export function hasTechniqueActivityStatisticSignal(result) {
    return result?.inventoryChanged === true
        || result?.equipmentChanged === true
        || result?.attrChanged === true
        || Number(result?.craftRealmExpGain) > 0;
}

export function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function normalizeInventoryItemInstanceId(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}
/**
 * normalizeAlchemyPresetName：规范化或转换炼丹Preset名称。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @returns 无返回值，直接更新炼丹Preset名称相关状态。
 */

export function normalizeAlchemyPresetName(value, fallback) {
    const normalized = normalizeText(value);
    return normalized || normalizeText(fallback) || '未命名丹方';
}
/**
 * createAlchemyPresetId：构建并返回目标对象。
 * @param recipeId recipe ID。
 * @returns 无返回值，直接更新炼丹PresetID相关状态。
 */

export function createAlchemyPresetId(recipeId) {
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

export function normalizeQuantity(value, fallback = 1) {
    const numeric = Number(value);
    return Math.max(1, Math.floor(Number.isFinite(numeric) ? numeric : fallback));
}
/**
 * normalizeIngredientSelections：规范化或转换IngredientSelection。
 * @param value 参数说明。
 * @returns 无返回值，直接更新IngredientSelection相关状态。
 */

export function normalizeIngredientSelections(value) {
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

export function cloneAlchemyIngredientSelections(value) {
    return Array.isArray(value)
        ? value.map((entry) => ({
            itemId: String(entry.itemId),
            count: Math.max(1, Math.floor(Number(entry.count) || 1)),
        }))
        : [];
}

export function cloneCraftElementMatchSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        return undefined;
    }
    return {
        targetElements: compactCraftElementVector(snapshot.targetElements),
        inputElements: compactCraftElementVector(snapshot.inputElements),
        perElementScore: { ...snapshot.perElementScore },
        targetTotalAbs: Number(snapshot.targetTotalAbs) || 0,
        zeroBase: Number(snapshot.zeroBase) || 1,
        baseElementSuccessRate: Math.max(0, Math.min(1, Number(snapshot.baseElementSuccessRate) || 0)),
    };
}
/**
 * isExactSubmittedIngredients：判断ExactSubmittedIngredient是否满足条件。
 * @param recipeIngredients 参数说明。
 * @param submitted 参数说明。
 * @returns 无返回值，完成ExactSubmittedIngredient的条件判断。
 */

export function isExactSubmittedIngredients(recipeIngredients, submitted) {
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

export function validateAlchemySelection(contentTemplateRepository, recipe, submitted) {
  const mainIngredients = Array.isArray(recipe.mainIngredients) && recipe.mainIngredients.length > 0
      ? recipe.mainIngredients
      : (recipe.ingredients ?? []).filter((entry) => entry.role === 'main');
  const mainIngredientMap = new Map();
  for (const ingredient of mainIngredients) {
    mainIngredientMap.set(ingredient.itemId, ingredient);
  }
  const submittedMap = new Map(submitted.map((entry) => [entry.itemId, Number(entry.count)]));
  const normalizedIngredients = [];
  const inputElements = createEmptyCraftElementVector();

  for (const ingredient of mainIngredients) {
    const submittedCount = submittedMap.get(ingredient.itemId) ?? 0;
    if (submittedCount !== ingredient.count) {
      return { error: `${resolvePlayerFacingContentName(ingredient.itemId, '未知物品', ingredient.name, contentTemplateRepository.getItemName(ingredient.itemId))} 属于主药/主材，数量必须为 ${ingredient.count}。` };
    }
    const item = contentTemplateRepository.createItem(ingredient.itemId, 1);
    if (item?.materialValues?.elements) {
      addCraftElementVector(inputElements, item.materialValues.elements, ingredient.count);
    }
    normalizedIngredients.push({ itemId: ingredient.itemId, count: ingredient.count });
  }

  for (const entry of submitted) {
    if (mainIngredientMap.has(entry.itemId)) {
      continue;
    }
    const count = Math.max(1, Math.floor(Number(entry.count) || 1));
    const item = contentTemplateRepository.createItem(entry.itemId, 1);
    if (!item || item.type !== 'material') {
      return { error: '辅药/辅材必须是材料。' };
    }
    const elements = item.materialValues?.elements;
    if (!elements || Object.keys(elements).length === 0) {
      return { error: `${resolvePlayerFacingContentName(item.itemId, '未知物品', item.name, contentTemplateRepository.getItemName(item.itemId))} 没有五行值，不能作为辅药/辅材。` };
    }
    addCraftElementVector(inputElements, elements, count);
    normalizedIngredients.push({ itemId: entry.itemId, count });
  }

  return {
    ingredients: normalizedIngredients.sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN')),
    inputElements: compactCraftElementVector(inputElements),
  };
}
/**
 * applyCraftSkillExp：处理炼制技能Exp并更新相关状态。
 * @param skill 参数说明。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新炼制技能Exp相关状态。
 */

export function applyCraftSkillExp(skill, amount, getExpToNextByLevel = null) {
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

export function resolveAlchemySkillBaseActionTicks(recipe, job) {
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

/**
 * resolveAlchemyBatchSuccess：规范化或转换炼丹BatchSuccess。
 * @param outputCount 参数说明。
 * @param successRate 参数说明。
 * @returns 无返回值，直接更新炼丹BatchSuccess相关状态。
 */

export function resolveAlchemyBatchSuccess(outputCount, successRate) {
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

export function normalizeEquipSlot(value) {
    return EQUIP_SLOTS.includes(value) ? value : null;
}
/**
 * cloneTargetRef：读取目标Ref并返回结果。
 * @param ref 参数说明。
 * @returns 无返回值，直接更新目标Ref相关状态。
 */

export function cloneTargetRef(ref) {
    return ref.source === 'equipment'
        ? { source: 'equipment', slot: ref.slot }
        : { source: 'inventory', itemInstanceId: normalizeInventoryItemInstanceId(ref.itemInstanceId) };
}
export function beginCraftRuntimeSection(recorder: CraftRuntimeSectionRecorder): number | null {
    return typeof recorder === 'function' ? performance.now() : null;
}
export function recordCraftRuntimeSection(
    recorder: CraftRuntimeSectionRecorder,
    key: string,
    startedAt: number | null,
    count = 1,
): void {
    if (typeof recorder !== 'function' || startedAt === null) {
        return;
    }
    recorder(key, Math.max(0, performance.now() - startedAt), count);
}
export function recordCraftRuntimeCount(recorder: CraftRuntimeSectionRecorder, key: string, count = 1): void {
    if (typeof recorder !== 'function') {
        return;
    }
    recorder(key, 0, count);
}
/**
 * buildCraftMutationResult：构建并返回目标对象。
 * @param error 参数说明。
 * @returns 无返回值，直接更新炼制Mutation结果相关状态。
 */

export function buildCraftMutationResult(error = undefined) {
    return {
        ok: false,
        error,
        messages: [],
        panelChanged: false,
    };
}

export function buildSupersededCraftTickResult() {
    return {
        ...buildCraftTickResult(),
        sessionFenceSuperseded: true,
    };
}

export function capturePlayerSessionFence(player): { runtimeOwnerId: string | null; sessionEpoch: number } {
    const runtimeOwnerId = typeof player?.runtimeOwnerId === 'string' && player.runtimeOwnerId.trim()
        ? player.runtimeOwnerId.trim()
        : null;
    const numericEpoch = Number(player?.sessionEpoch);
    return {
        runtimeOwnerId,
        sessionEpoch: Number.isFinite(numericEpoch) ? Math.max(0, Math.trunc(numericEpoch)) : 0,
    };
}

export function normalizePlayerSessionFence(fence): { runtimeOwnerId: string | null; sessionEpoch: number } {
    const numericEpoch = Number(fence?.sessionEpoch);
    return {
        runtimeOwnerId: typeof fence?.runtimeOwnerId === 'string' && fence.runtimeOwnerId.trim()
            ? fence.runtimeOwnerId.trim()
            : null,
        sessionEpoch: Number.isFinite(numericEpoch) ? Math.max(0, Math.trunc(numericEpoch)) : 0,
    };
}

export function isSamePlayerSessionFence(
    left: { runtimeOwnerId: string | null; sessionEpoch: number },
    right: { runtimeOwnerId: string | null; sessionEpoch: number },
): boolean {
    return left.sessionEpoch === right.sessionEpoch
        && left.runtimeOwnerId === right.runtimeOwnerId;
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

export function buildCraftTickResult(panelChanged = false, messages = [], inventoryChanged = false, equipmentChanged = false, attrChanged = false, groundDrops = [], craftRealmExpGain = 0) {
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

export function normalizeEnhanceLevel(level) {
    return Math.max(0, Math.min(MAX_ENHANCE_LEVEL, Math.floor(Number(level) || 0)));
}
/**
 * getEnhancementSpiritStoneCost：读取强化SpiritStone消耗。
 * @param itemLevel 参数说明。
 * @param hasMaterialCost 参数说明。
 * @returns 无返回值，完成强化SpiritStone消耗的读取/组装。
 */

export function getEnhancementSpiritStoneCost(itemLevel, hasMaterialCost = false) {
    const level = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
    return Math.max(1, hasMaterialCost ? Math.floor(level / 10) : Math.ceil(level / 10));
}
