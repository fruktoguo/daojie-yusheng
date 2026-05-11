/**
 * 建筑系统运行时服务
 * 处理建筑放置、拆除、建造进度、材料消耗和风水计算
 */
import { calculateTerrainDurability, computeCraftSkillExpGain, isGenericBuildMaterialSlotItemId, resolveBuildMaterialCategoryKey, resolveGenericBuildMaterialSlotCategory } from '@mud/shared';
import { DEFAULT_CRAFT_EXP_TO_NEXT, resolveCraftSkillExpToNextByLevel } from '../craft/craft-skill-exp.helpers';

export function handleBuildPlaceIntent(runtime, playerId, payload) {
    const requestId = normalizeBuildingRequestId(payload?.requestId);
    if (!requestId) {
        return { requestId: '', ok: false, reason: 'request_id_required' };
    }
    const operationKey = buildBuildingOperationKey('place', playerId, requestId);
    const replay = runtime.buildingOperationResultsByKey.get(operationKey);
    if (replay) {
        return { ...replay, duplicate: true };
    }
    const context = resolvePlayerBuildingContext(runtime, playerId);
    if (!context.instance?.meta?.persistent) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'instance_not_persistent' }, { action: 'place', playerId, instanceId: context.instance?.meta?.instanceId ?? null });
    }
    const defId = normalizeBuildingRequestId(payload?.defId);
    const compiled = context.instance.buildingCatalog?.defById?.get?.(defId);
    if (!compiled) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'building_def_not_found' }, { action: 'place', playerId, instanceId: context.instance.meta.instanceId, defId });
    }
    const existing = context.instance.buildingById?.get?.(requestId);
    if (existing) {
        return { requestId, ok: true, building: toBuildingInstanceView(existing), duplicate: true };
    }
    const selectedMaterialItemIds = Array.isArray(payload?.selectedMaterialItemIds)
        ? payload.selectedMaterialItemIds.map((entry) => typeof entry === 'string' ? entry.trim() : '')
        : [];
    const costResolution = resolveSelectedBuildingCost(context.player, compiled, selectedMaterialItemIds);
    if (!costResolution.ok) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: costResolution.reason }, { action: 'place', playerId, instanceId: context.instance.meta.instanceId, defId });
    }
    const buildStrength = normalizeBuildStrength(payload?.buildStrength);
    const buildingSkillLevel = resolveBuildingSkillLevel(context.player);
    const finalMaxHp = resolvePlacedBuildingMaxHp(compiled, buildingSkillLevel, buildStrength);
    const result = context.instance.placeBuildingInstance({
        requestId,
        defId,
        x: payload?.x,
        y: payload?.y,
        rotation: payload?.rotation,
        ownerPlayerId: playerId,
        ownerSectId: context.player?.sectId ?? null,
        state: 'building',
        hp: finalMaxHp,
        maxHp: finalMaxHp,
        buildStrength,
        builderSkillLevel: buildingSkillLevel,
        buildRemainingTicks: buildStrength,
        activeBuilderPlayerId: null,
    });
    if (!result?.ok) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: result?.reason ?? 'build_failed' }, { action: 'place', playerId, instanceId: context.instance.meta.instanceId, defId });
    }
    try {
        consumeBuildingCost(runtime.playerRuntimeService, playerId, costResolution.consumedItems);
    }
    catch (error) {
        context.instance.deconstructBuildingInstance?.(result.building?.id);
        throw error;
    }
    return recordBuildingOperation(runtime, operationKey, {
        requestId,
        ok: true,
        building: toBuildingInstanceView(result.building),
        consumedItems: costResolution.consumedItems,
    }, { action: 'place', playerId, instanceId: context.instance.meta.instanceId, defId, buildingId: result.building?.id ?? null });
}

export function handleStartBuildingConstruction(runtime, playerId, buildingIdInput) {
    const context = resolvePlayerBuildingContext(runtime, playerId);
    const buildingId = normalizeBuildingRequestId(buildingIdInput);
    const result = context.instance.startBuildingConstruction?.(buildingId, playerId) ?? { ok: false, reason: 'building_start_unsupported' };
    if (result?.ok === true) {
        const buildingView = toBuildingInstanceView(result.building);
        if (buildingView && canQueueBuildingNotice(runtime)) {
            runtime.queuePlayerNotice(
                playerId,
                `开始建造：${resolveBuildingDisplayName(context.instance, result.building) ?? buildingView.defId}`,
                'info',
            );
        }
        return {
            ok: true,
            changed: result.changed !== false,
            building: buildingView,
        };
    }
    return {
        ok: false,
        reason: result?.reason ?? 'building_start_failed',
    };
}

export function dispatchStartBuildingConstruction(runtime, playerId, buildingIdInput) {
    const context = resolvePlayerBuildingContext(runtime, playerId);
    const player = context.player;
    const buildingId = normalizeBuildingRequestId(buildingIdInput);
    if (!buildingId) {
        throw new Error('建筑 ID 不能为空');
    }
    const activeJob = player?.buildingJob;
    if (activeJob && Number(activeJob.remainingTicks) > 0) {
        if (activeJob.buildingId !== buildingId) {
            throw new Error('当前已有建造任务在进行中。');
        }
    }
    const result: any = handleStartBuildingConstruction(runtime, playerId, buildingId);
    if (result?.ok !== true || !result.building) {
        throw new Error(localizeStartBuildingFailure(result?.reason));
    }
    const buildingName = resolveBuildingDisplayName(context.instance, result.building) ?? result.building.name ?? result.building.defId ?? '建筑';
    player.buildingJob = {
        buildingId: result.building.id,
        buildingName,
        instanceId: context.instance.meta.instanceId,
        startedAt: Date.now(),
        totalTicks: Math.max(1, Math.trunc(Number(result.building.buildRemainingTicks ?? result.building.buildStrength ?? 1) || 1)),
        remainingTicks: Math.max(1, Math.trunc(Number(result.building.buildRemainingTicks ?? result.building.buildStrength ?? 1) || 1)),
        pausedTicks: 0,
        successRate: 1,
        spiritStoneCost: 0,
        phase: 'building',
    };
    runtime.playerRuntimeService.bumpPersistentRevision?.(player);
    runtime.refreshPlayerContextActions?.(playerId);
}

export function interruptBuildingConstruction(runtime, playerId, reason = 'cancel') {
    const context = resolvePlayerBuildingContext(runtime, playerId);
    const player = context.player;
    const job = player?.buildingJob;
    if (!job || Number(job.remainingTicks) <= 0) {
        return;
    }
    const instanceId = typeof job.instanceId === 'string' && job.instanceId.trim()
        ? job.instanceId.trim()
        : context.location.instanceId;
    const instance = runtime.getInstanceRuntime?.(instanceId) ?? context.instance;
    instance?.stopBuildingConstruction?.(job.buildingId, playerId);
    player.buildingJob = null;
    runtime.playerRuntimeService.bumpPersistentRevision?.(player);
    if (canQueueBuildingNotice(runtime)) {
        runtime.queuePlayerNotice(playerId, buildBuildingInterruptMessage(job.buildingName, reason), 'system');
    }
    runtime.refreshPlayerContextActions?.(playerId);
}

export function tickBuildingConstruction(runtime, playerId) {
    const player = runtime?.playerRuntimeService?.getPlayer?.(playerId);
    const job = player?.buildingJob;
    if (!player || !job || Number(job.remainingTicks) <= 0) {
        return;
    }
    const instanceId = typeof job.instanceId === 'string' && job.instanceId.trim() ? job.instanceId.trim() : '';
    const instance = instanceId ? runtime.getInstanceRuntime?.(instanceId) : null;
    const building = instance?.buildingById?.get?.(job.buildingId);
    if (!instance || !building) {
        player.buildingJob = null;
        runtime.playerRuntimeService.bumpPersistentRevision?.(player);
        if (canQueueBuildingNotice(runtime)) {
            runtime.queuePlayerNotice(playerId, '建造目标已经不存在。', 'warn');
        }
        return;
    }
    const previousRemainingTicks = Math.max(0, Math.trunc(Number(job.remainingTicks) || 0));
    const nextRemainingTicks = resolveBuildingRemainingTicksForView(building);
    const progressedTicks = Math.max(0, previousRemainingTicks - nextRemainingTicks);
    if (progressedTicks > 0) {
        awardBuildingConstructionProgress(runtime, playerId, progressedTicks);
    }
    if (building.state !== 'building' || nextRemainingTicks <= 0) {
        player.buildingJob = null;
        runtime.playerRuntimeService.bumpPersistentRevision?.(player);
        runtime.refreshPlayerContextActions?.(playerId);
        return;
    }
    if (building.activeBuilderPlayerId !== playerId) {
        player.buildingJob = null;
        runtime.playerRuntimeService.bumpPersistentRevision?.(player);
        runtime.refreshPlayerContextActions?.(playerId);
        return;
    }
    const nextTotalTicks = Math.max(nextRemainingTicks, Math.trunc(Number(job.totalTicks) || 0), Math.trunc(Number(building.buildStrength) || 0), 1);
    job.buildingName = resolveBuildingDisplayName(instance, building) ?? job.buildingName ?? building.defId ?? '建筑';
    job.instanceId = instance.meta.instanceId;
    job.totalTicks = nextTotalTicks;
    job.remainingTicks = nextRemainingTicks;
    job.pausedTicks = 0;
    job.phase = 'building';
    runtime.playerRuntimeService.bumpPersistentRevision?.(player);
}

export function handleBuildDeconstructIntent(runtime, playerId, payload) {
    const requestId = normalizeBuildingRequestId(payload?.requestId);
    if (!requestId) {
        return { requestId: '', ok: false, reason: 'request_id_required' };
    }
    const operationKey = buildBuildingOperationKey('deconstruct', playerId, requestId);
    const replay = runtime.buildingOperationResultsByKey.get(operationKey);
    if (replay) {
        return { ...replay, duplicate: true };
    }
    const context = resolvePlayerBuildingContext(runtime, playerId);
    const buildingId = normalizeBuildingRequestId(payload?.buildingId);
    const building = context.instance.buildingById?.get?.(buildingId);
    if (!building) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'building_not_found' }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
    }
    if (building.ownerPlayerId && building.ownerPlayerId !== playerId) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'building_owner_mismatch' }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
    }
    const result = context.instance.deconstructBuildingInstance(buildingId);
    return recordBuildingOperation(runtime, operationKey, {
        requestId,
        ok: result?.ok === true,
        reason: result?.ok === true ? undefined : result?.reason ?? 'deconstruct_failed',
    }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
}

export function listBuildingOperationAudit(runtime, limit = 50) {
    const normalizedLimit = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 50)));
    return runtime.buildingOperationAuditLog.slice(-normalizedLimit).reverse().map((entry) => ({ ...entry }));
}

export function handleRoomSetRoleIntent(runtime, playerId, payload) {
    const requestId = normalizeBuildingRequestId(payload?.requestId);
    if (!requestId) {
        return { requestId: '', ok: false, reason: 'request_id_required' };
    }
    return {
        requestId,
        ok: false,
        reason: 'room_role_auto_inferred',
    };
}

export function buildCurrentRoomSummaryPatch(runtime, playerId) {
    const context = resolvePlayerBuildingContext(runtime, playerId);
    return {
        instanceId: context.instance.meta.instanceId,
        revision: context.instance.getPersistenceRevision?.() ?? 0,
        adds: context.instance.listRoomSummaries?.().map(toRoomSummaryView) ?? [],
        updates: [],
        removes: [],
    };
}

export function buildFengShuiObserveView(runtime, playerId, payload) {
    const context = resolvePlayerBuildingContext(runtime, playerId);
    const roomId = typeof payload?.roomId === 'string' && payload.roomId.trim() ? payload.roomId.trim() : '';
    const hasExplicitPoint = Number.isFinite(Number(payload?.x)) || Number.isFinite(Number(payload?.y));
    const shouldBuildDetail = Boolean(roomId || hasExplicitPoint || payload?.overlay !== true);
    const x = shouldBuildDetail && Number.isFinite(Number(payload?.x)) ? Math.trunc(Number(payload.x)) : context.instance.playersById.get(playerId)?.x;
    const y = shouldBuildDetail && Number.isFinite(Number(payload?.y)) ? Math.trunc(Number(payload.y)) : context.instance.playersById.get(playerId)?.y;
    const snapshot = shouldBuildDetail && roomId
        ? context.instance.getFengShuiSnapshot?.(roomId)
        : shouldBuildDetail
            ? context.instance.getFengShuiSnapshotAt?.(x, y)
            : null;
    const room = snapshot?.roomId ? context.instance.roomsById?.get?.(snapshot.roomId) : null;
    return {
        detail: room && snapshot
            ? { room: toRoomSummaryView(room), fengShui: snapshot }
            : null,
        overlay: payload?.overlay === true ? buildFengShuiOverlayPatch(context.instance, playerId) : null,
    };
}

function resolvePlayerBuildingContext(runtime, playerId) {
    const location = runtime.getPlayerLocationOrThrow(playerId);
    const instance = runtime.getInstanceRuntimeOrThrow(location.instanceId);
    const player = runtime.playerRuntimeService.getPlayer(playerId);
    if (!player) {
        throw new Error(`player_not_found:${playerId}`);
    }
    return { location, instance, player };
}
function normalizeBuildingRequestId(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}
function buildBuildingOperationKey(action, playerId, requestId) {
    return `${action}:${playerId}:${requestId}`;
}
function recordBuildingOperation(runtime, operationKey, result, meta) {
    const stableResult = { ...result };
    runtime.buildingOperationResultsByKey.set(operationKey, stableResult);
    runtime.buildingOperationAuditLog.push({
        operationKey,
        action: meta?.action ?? 'unknown',
        playerId: meta?.playerId ?? null,
        instanceId: meta?.instanceId ?? null,
        defId: meta?.defId ?? null,
        buildingId: meta?.buildingId ?? null,
        ok: stableResult.ok === true,
        reason: stableResult.reason ?? null,
        tick: runtime.tick,
        recordedAt: Date.now(),
    });
    while (runtime.buildingOperationAuditLog.length > 1000) {
        runtime.buildingOperationAuditLog.shift();
    }
    while (runtime.buildingOperationResultsByKey.size > 1000) {
        const oldestKey = runtime.buildingOperationResultsByKey.keys().next().value;
        if (!oldestKey) break;
        runtime.buildingOperationResultsByKey.delete(oldestKey);
    }
    return stableResult;
}
function resolveSelectedBuildingCost(player, compiled, selectedMaterialItemIds) {
    const itemIds = Array.isArray(compiled?.costItemIds) ? compiled.costItemIds : Array.from(compiled?.costItemIds ?? []);
    const counts = compiled?.costCounts ?? [];
    const consumedByItemId = new Map();
    for (let index = 0; index < itemIds.length; index += 1) {
        const slotItemId = typeof itemIds[index] === 'string' ? itemIds[index] : '';
        const required = Math.max(0, Math.trunc(Number(counts[index]) || 0));
        if (!slotItemId || required <= 0) {
            continue;
        }
        if (isGenericBuildMaterialSlotItemId(slotItemId)) {
            const selectedItemId = typeof selectedMaterialItemIds?.[index] === 'string' ? selectedMaterialItemIds[index].trim() : '';
            if (!selectedItemId) {
                return { ok: false, reason: `build_material_required:${slotItemId}:${index}` };
            }
            const inventoryItem = findInventoryItem(player, selectedItemId);
            if (!inventoryItem) {
                return { ok: false, reason: `material_insufficient:${selectedItemId}:${required}` };
            }
            if ((inventoryItem.type ?? 'material') !== 'material') {
                return { ok: false, reason: `build_material_invalid:${selectedItemId}` };
            }
            const selectedCategory = resolveBuildMaterialCategoryKey(inventoryItem);
            const requiredCategory = resolveGenericBuildMaterialSlotCategory(slotItemId);
            if (selectedCategory !== requiredCategory) {
                return { ok: false, reason: `build_material_category_mismatch:${selectedItemId}:${slotItemId}` };
            }
            consumedByItemId.set(selectedItemId, (consumedByItemId.get(selectedItemId) ?? 0) + required);
            continue;
        }
        consumedByItemId.set(slotItemId, (consumedByItemId.get(slotItemId) ?? 0) + required);
    }
    const consumedItems = Array.from(consumedByItemId.entries())
        .map(([itemId, count]) => ({ itemId, count: Math.max(1, Math.trunc(Number(count) || 1)) }))
        .filter((entry) => entry.itemId && entry.count > 0);
    for (const entry of consumedItems) {
        const owned = countPlayerInventoryItem(player, entry.itemId);
        if (owned < entry.count) {
            return { ok: false, reason: `material_insufficient:${entry.itemId}:${entry.count - owned}` };
        }
    }
    return {
        ok: true,
        consumedItems,
    };
}
function normalizeBuildStrength(value) {
    const normalized = Math.trunc(Number(value) || 1);
    return Math.max(1, normalized);
}
function resolveBuildingSkillLevel(player) {
    return Math.max(1, Math.trunc(Number(player?.buildingSkill?.level ?? 1) || 1));
}
function resolvePlacedBuildingMaxHp(compiled, buildingSkillLevel, buildStrength) {
    const baseMultiplier = Math.max(0.01, Number(compiled?.durabilityMultiplier ?? (Number(compiled?.maxHp ?? 1) / 100)));
    return Math.max(1, Math.trunc(calculateTerrainDurability(buildingSkillLevel, baseMultiplier) * buildStrength));
}
function applyCraftSkillExp(source, skill, amount) {
    if (!skill) {
        return false;
    }
    let changed = false;
    const currentExpToNext = resolveCraftSkillExpToNextByLevel(source, skill.level);
    if (skill.expToNext !== currentExpToNext) {
        skill.expToNext = currentExpToNext;
        changed = true;
    }
    skill.exp += Math.max(0, Math.floor(Number(amount) || 0));
    while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
        skill.exp -= skill.expToNext;
        skill.level += 1;
        skill.expToNext = resolveCraftSkillExpToNextByLevel(source, skill.level);
        changed = true;
    }
    return changed || amount > 0;
}
function ensureBuildingSkillState(source, player) {
    const level = Math.max(1, Math.floor(Number(player?.buildingSkill?.level) || 1));
    const expToNext = resolveCraftSkillExpToNextByLevel(source, level, DEFAULT_CRAFT_EXP_TO_NEXT);
    const state = {
        level,
        exp: Math.max(0, Math.floor(Number(player?.buildingSkill?.exp) || 0)),
        expToNext,
    };
    player.buildingSkill = state;
    return state;
}
function applyBuildingSkillExp(source, player, buildStrength) {
    if (!player) {
        return 0;
    }
    const skill = ensureBuildingSkillState(source, player);
    const gain = computeCraftSkillExpGain({
        skillLevel: skill.level,
        targetLevel: skill.level,
        baseActionTicks: normalizeBuildStrength(buildStrength),
        getExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(source, level),
        successCount: 1,
        failureCount: 0,
        successMultiplier: 1,
    }).finalGain;
    if (gain <= 0) {
        return 0;
    }
    applyCraftSkillExp(source, skill, gain);
    if (!(player.dirtyDomains instanceof Set)) {
        player.dirtyDomains = new Set();
    }
    player.dirtyDomains.add('profession');
    return gain;
}
export function awardBuildingConstructionProgress(runtime, playerIdInput, progressTicks = 1) {
    const playerId = normalizeBuildingRequestId(playerIdInput);
    if (!playerId) {
        return 0;
    }
    const player = runtime?.playerRuntimeService?.getPlayer?.(playerId);
    if (!player) {
        return 0;
    }
    const gainedExp = applyBuildingSkillExp(runtime?.playerRuntimeService, player, progressTicks);
    if (gainedExp > 0) {
        runtime?.playerRuntimeService?.bumpPersistentRevision?.(player);
    }
    return gainedExp;
}
export function notifyBuildingConstructionCompletion(runtime, building) {
    const playerId = normalizeBuildingRequestId(building?.ownerPlayerId);
    const buildingName = resolveBuildingDisplayNameByRuntime(runtime, building) ?? building?.defId ?? '建筑';
    if (playerId && canQueueBuildingNotice(runtime)) {
        runtime.queuePlayerNotice(playerId, `${buildingName}已完工`, 'success');
    }
    return 0;
}
export function awardBuildingConstructionCompletion(runtime, building) {
    return notifyBuildingConstructionCompletion(runtime, building);
}
function buildBuildingInterruptMessage(buildingNameInput, reason) {
    const buildingName = typeof buildingNameInput === 'string' && buildingNameInput.trim() ? buildingNameInput.trim() : '当前建筑';
    const reasonLabel = reason === 'move'
        ? '移动'
        : reason === 'attack'
            ? '出手'
            : reason === 'cultivate'
                ? '打坐'
                : '手动取消';
    return `${buildingName} 的营造被${reasonLabel}打断。`;
}
function localizeStartBuildingFailure(reason) {
    switch (reason) {
        case 'building_not_found':
            return '目标半成品不存在';
        case 'building_not_under_construction':
            return '该建筑当前不可继续施工';
        case 'building_owner_mismatch':
            return '只能建造自己的半成品';
        case 'player_not_found':
            return '当前角色不存在';
        case 'building_too_far':
            return '需要靠近半成品后才能开始建造';
        default:
            return '开始建造失败';
    }
}
function resolveBuildingRemainingTicksForView(building) {
    if (Number.isFinite(Number(building?.buildRemainingTicks))) {
        return Math.max(0, Math.trunc(Number(building.buildRemainingTicks)));
    }
    if (Number.isFinite(Number(building?.buildStrength))) {
        return Math.max(1, Math.trunc(Number(building.buildStrength)));
    }
    return 0;
}
function consumeBuildingCost(playerRuntimeService, playerId, consumedItems) {
    for (const entry of Array.isArray(consumedItems) ? consumedItems : []) {
        const itemId = typeof entry?.itemId === 'string' ? entry.itemId : '';
        const count = Math.max(0, Math.trunc(Number(entry?.count) || 0));
        if (itemId && count > 0) {
            playerRuntimeService.consumeInventoryItemByItemId(playerId, itemId, count);
        }
    }
}
function findInventoryItem(player, itemId) {
    return Array.isArray(player?.inventory?.items)
        ? player.inventory.items.find((entry) => entry?.itemId === itemId) ?? null
        : null;
}
function countPlayerInventoryItem(player, itemId) {
    let total = 0;
    for (const item of Array.isArray(player?.inventory?.items) ? player.inventory.items : []) {
        if (item?.itemId === itemId) {
            total += Math.max(0, Math.trunc(Number(item.count) || 0));
        }
    }
    return total;
}
function toBuildingInstanceView(building) {
    if (!building) {
        return undefined;
    }
    return {
        id: building.id,
        defId: building.defId,
        x: building.x,
        y: building.y,
        rotation: building.rotation,
        state: building.state,
        roomId: building.roomId ?? null,
        hp: building.hp,
        maxHp: building.maxHp,
        buildStrength: building.buildStrength,
        builderSkillLevel: building.builderSkillLevel,
        buildCompleteTick: building.buildCompleteTick,
        buildRemainingTicks: building.buildRemainingTicks,
        activeBuilderPlayerId: building.activeBuilderPlayerId ?? null,
        revision: building.revision,
    };
}
function resolveBuildingDisplayName(instance, building) {
    const compiled = instance?.buildingCatalog?.defByHandle?.[building?.defHandle]
        ?? instance?.buildingCatalog?.defById?.get?.(building?.defId);
    return typeof compiled?.name === 'string' && compiled.name.trim()
        ? compiled.name.trim()
        : (typeof building?.defId === 'string' ? building.defId : null);
}
function resolveBuildingDisplayNameByRuntime(runtime, building) {
    const instanceId = typeof building?.instanceId === 'string' ? building.instanceId.trim() : '';
    if (!instanceId) {
        return typeof building?.defId === 'string' ? building.defId : null;
    }
    let instance = null;
    if (typeof runtime?.getInstanceRuntimeOrThrow === 'function') {
        try {
            instance = runtime.getInstanceRuntimeOrThrow(instanceId);
        }
        catch (_error) {
            instance = null;
        }
    }
    else if (typeof runtime?.getInstanceRuntime === 'function' && runtime?.worldRuntimeStateFacadeService) {
        instance = runtime.getInstanceRuntime(instanceId);
    }
    return resolveBuildingDisplayName(instance, building);
}
function canQueueBuildingNotice(runtime) {
    return typeof runtime?.queuePlayerNotice === 'function'
        && typeof runtime?.worldRuntimeTickDispatchService?.queuePlayerNotice === 'function';
}
function toRoomSummaryView(room) {
    return {
        id: room.id,
        role: room.role,
        enclosed: room.enclosed === true,
        semiOutdoor: room.semiOutdoor === true,
        minX: room.minX,
        minY: room.minY,
        maxX: room.maxX,
        maxY: room.maxY,
        area: room.area,
        doorCount: room.doorCount,
        windowCount: room.windowCount,
        roofCoverageRatio: room.roofCoverageRatio,
        revision: Math.max(1, Math.trunc(Number(room.topologyRevision || room.revision || 1))),
    };
}
function buildFengShuiOverlayPatch(instance, playerId) {
    const player = instance.playersById?.get?.(playerId);
    const centerX = Number.isFinite(Number(player?.x)) ? Math.trunc(Number(player.x)) : 0;
    const centerY = Number.isFinite(Number(player?.y)) ? Math.trunc(Number(player.y)) : 0;
    const radius = 12;
    const cells = [];
    const count = Math.max(0, Math.trunc(Number(instance.tilePlane?.getCellCount?.()) || 0));
    for (let cellIndex = 0; cellIndex < count; cellIndex += 1) {
        const x = instance.tilePlane.getX(cellIndex);
        const y = instance.tilePlane.getY(cellIndex);
        if (Math.max(Math.abs(x - centerX), Math.abs(y - centerY)) > radius) {
            continue;
        }
        const roomId = instance.roomIdsByHandle?.[instance.roomIdByCell?.[cellIndex]];
        if (!roomId) {
            continue;
        }
        const snapshot = instance.fengShuiByRoomId?.get?.(roomId);
        if (!snapshot) {
            continue;
        }
        cells.push({
            x,
            y,
            roomId,
            score: snapshot.score,
            grade: snapshot.grade,
            revision: snapshot.revision,
        });
    }
    return {
        instanceId: instance.meta.instanceId,
        revision: instance.getPersistenceRevision?.() ?? 0,
        cells,
    };
}
