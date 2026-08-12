/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 建筑系统运行时服务
 * 处理建筑放置、拆除、建造进度、材料消耗和风水计算
 */
import { randomUUID } from 'node:crypto';
import { BUILDING_MAX_BUILD_TICKS, calculateTerrainDurability, hasBuildMaterialCategory, isGenericBuildMaterialSlotItemId, resolveGenericBuildMaterialSlotCategory, resolvePlayerFacingContentName } from '@mud/shared';
import { resolveCompiledBuildingDefinition } from '../building/building-definition-resolution.helpers';
import {
    resolveBuildingDeconstructionDurationTicks,
    resolveBuildingDeconstructionWork,
} from '../building/building-deconstruction.helpers';
import { resolveCraftSkillExpToNextByLevel } from '../craft/craft-skill-exp.helpers';
import { executeBuildingTick } from '../craft/pipeline/strategies/building-tick.helpers';
import { buildStructuredNotice } from './structured-notice.helpers';
import { isVirtualPublicWorldInstance } from './world-runtime.normalization.helpers';

/**
 * 建筑操作结果缓存上限：默认 1000，可通过 env SERVER_BUILDING_OPERATION_RESULTS_LIMIT
 * 调整以适配大型联盟副本与高并发建造审计。0 或非法值回退默认。
 * 与 buildingOperationAuditLog 上限共用同一阈值，保证幂等回放与审计窗口一致。
 */
function resolveBuildingOperationResultsLimit() {
    const raw = process.env.SERVER_BUILDING_OPERATION_RESULTS_LIMIT;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return 1000;
    }
    const parsed = Number(raw.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 1000;
    }
    return Math.max(1, Math.min(1_000_000, Math.trunc(parsed)));
}

const BUILDING_OPERATION_RESULTS_LIMIT = resolveBuildingOperationResultsLimit();
const BUILDING_OPERATION_AUDIT_LOG_LIMIT = BUILDING_OPERATION_RESULTS_LIMIT;

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
    if (isVirtualPublicWorldInstance(context.instance)) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'virtual_world_building_forbidden' }, { action: 'place', playerId, instanceId: context.instance?.meta?.instanceId ?? null });
    }
    if (!context.instance?.meta?.persistent) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'instance_not_persistent' }, { action: 'place', playerId, instanceId: context.instance?.meta?.instanceId ?? null });
    }
    const defId = normalizeBuildingRequestId(payload?.defId);
    const sectAccess = resolveSectBuildingAccess(runtime, context, playerId, 'building_create');
    if (sectAccess.applies && !sectAccess.allowed) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'sect_build_permission_denied' }, { action: 'place', playerId, instanceId: context.instance.meta.instanceId, defId });
    }
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
    const buildStrength = normalizeBuildStrength(payload?.buildStrength, compiled.buildTicks);
    const buildingSkillLevel = resolveBuildingSkillLevel(context.player);
    const finalMaxHp = resolvePlacedBuildingMaxHp(compiled, buildingSkillLevel, buildStrength);
    const result = context.instance.placeBuildingInstance({
        requestId,
        defId,
        x: payload?.x,
        y: payload?.y,
        rotation: payload?.rotation,
        ownerPlayerId: playerId,
        ownerSectId: sectAccess.sectId ?? context.player?.sectId ?? null,
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
        context.instance.deconstructBuildingInstance?.(result.building?.id, { treasureVaultRecovered: true });
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
    if (isVirtualPublicWorldInstance(context.instance)) {
        return { ok: false, reason: 'virtual_world_building_forbidden' };
    }
    const sectAccess = resolveSectBuildingAccess(runtime, context, playerId, 'building_create');
    if (sectAccess.applies && !sectAccess.allowed) {
        return { ok: false, reason: 'sect_build_permission_denied' };
    }
    const result = context.instance.startBuildingConstruction?.(buildingId, playerId) ?? { ok: false, reason: 'building_start_unsupported' };
    if (result?.ok === true) {
        const buildingView = toBuildingInstanceView(result.building);
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
    const buildingName = resolvePlayerFacingContentName(
        result.building.defId,
        '未知建筑',
        resolveBuildingDisplayName(context.instance, result.building),
        result.building.name,
    );
    const remainingProgress = Math.max(1, Number(result.building.buildRemainingTicks ?? result.building.buildStrength ?? 1) || 1);
    const totalTicks = Math.max(1, Math.ceil(remainingProgress / resolveBuildingProgressPerTick(player)));
    const startedAt = Date.now();
    player.buildingJob = {
        jobRunId: `job:${playerId}:building:${randomUUID()}`,
        jobType: 'building',
        jobVersion: 1,
        buildingId: result.building.id,
        buildingName,
        instanceId: context.instance.meta.instanceId,
        operation: 'construct',
        startedAt,
        totalTicks,
        remainingTicks: totalTicks,
        workTotalTicks: totalTicks,
        workRemainingTicks: totalTicks,
        interruptWaitRemainingTicks: 0,
        interruptState: null,
        pausedTicks: 0,
        successRate: 1,
        spiritStoneCost: 0,
        phase: 'building',
    };
    runtime.playerRuntimeService.bumpPersistentRevision?.(player);
    runtime.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job']);
    runtime.refreshPlayerContextActions?.(playerId);
}

export function dispatchStartBuildingDeconstruction(runtime, playerId, buildingIdInput) {
    const context = resolvePlayerBuildingContext(runtime, playerId);
    const player = context.player;
    const buildingId = normalizeBuildingRequestId(buildingIdInput);
    if (!buildingId) {
        return { ok: false, reason: 'building_not_found' };
    }
    const sectAccess = resolveSectBuildingAccess(runtime, context, playerId, 'building_remove');
    if (sectAccess.applies && !sectAccess.allowed) {
        return { ok: false, reason: 'sect_demolish_permission_denied' };
    }
    const activeJob = player?.buildingJob;
    if (activeJob && Number(activeJob.remainingTicks) > 0) {
        if (activeJob.operation === 'deconstruct' && activeJob.buildingId === buildingId) {
            return {
                ok: true,
                changed: false,
                building: toBuildingInstanceView(context.instance.buildingById?.get?.(buildingId)),
                totalTicks: Math.max(1, Math.trunc(Number(activeJob.totalTicks) || 1)),
            };
        }
        return { ok: false, reason: 'building_job_active' };
    }
    if (runtime.craftPanelRuntimeService?.hasAnyActiveTechniqueActivity?.(player)) {
        return { ok: false, reason: 'technique_activity_busy' };
    }
    const building = context.instance.buildingById?.get?.(buildingId);
    if (!building) {
        return { ok: false, reason: 'building_not_found' };
    }
    const compiled = resolveCompiledBuildingDefinition(context.instance.buildingCatalog, building);
    const totalWorkTicks = resolveBuildingDeconstructionWork(building, compiled?.buildTicks);
    const totalTicks = resolveBuildingDeconstructionDurationTicks(totalWorkTicks, player, building);
    const result = context.instance.startBuildingDeconstruction?.(buildingId, playerId, totalWorkTicks)
        ?? { ok: false, reason: 'building_deconstruct_unsupported' };
    if (result?.ok !== true || !result.building) {
        return { ok: false, reason: result?.reason ?? 'building_deconstruct_failed' };
    }
    const buildingName = resolvePlayerFacingContentName(
        result.building.defId,
        '未知建筑',
        resolveBuildingDisplayName(context.instance, result.building),
        result.building.name,
    );
    const startedAt = Date.now();
    player.buildingJob = {
        jobRunId: `job:${playerId}:building:${randomUUID()}`,
        jobType: 'building',
        jobVersion: 1,
        buildingId: result.building.id,
        buildingName,
        label: '拆除建筑',
        instanceId: context.instance.meta.instanceId,
        operation: 'deconstruct',
        startedAt,
        totalTicks,
        remainingTicks: totalTicks,
        workTotalTicks: totalTicks,
        workRemainingTicks: totalTicks,
        interruptWaitRemainingTicks: 0,
        interruptState: null,
        pausedTicks: 0,
        successRate: 1,
        spiritStoneCost: 0,
        phase: 'deconstructing',
    };
    runtime.playerRuntimeService.bumpPersistentRevision?.(player);
    runtime.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job']);
    runtime.refreshPlayerContextActions?.(playerId);
    return {
        ok: true,
        changed: result.changed !== false,
        building: toBuildingInstanceView(result.building),
        totalTicks,
    };
}

function resolveBuildingProgressPerTick(player) {
    const speedRate = Math.max(0, Number(player?.attrs?.craftEffectStats?.building?.speedRate) || 0);
    return 1 + speedRate;
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
    if (job.operation === 'deconstruct') {
        instance?.stopBuildingDeconstruction?.(job.buildingId, playerId);
    }
    else {
        instance?.stopBuildingConstruction?.(job.buildingId, playerId);
    }
    player.buildingJob = null;
    runtime.playerRuntimeService.bumpPersistentRevision?.(player);
    runtime.playerRuntimeService.markPersistenceDirtyDomains?.(player, ['active_job']);
    if (canQueueBuildingNotice(runtime)) {
        const notice = buildBuildingInterruptNotice(job.buildingName, reason);
        runtime.queuePlayerNotice(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
    }
    runtime.refreshPlayerContextActions?.(playerId);
}

export function tickBuildingConstruction(runtime, playerId) {
    return executeBuildingTick(playerId, {
        contentTemplateRepository: runtime.contentTemplateRepository,
        resolveExpToNextByLevel: (level) => resolveCraftSkillExpToNextByLevel(runtime.playerRuntimeService, level),
        getInstanceRuntime: (instanceId) => runtime.getInstanceRuntime?.(instanceId) ?? null,
        deps: runtime,
    }, {
        ...runtime,
        resolveBuildingDisplayName,
        resolveBuildingDisplayNameByRuntime,
        completeBuildingDeconstruction: (activePlayerId, instanceId, buildingId) => (
            completeBuildingDeconstruction(runtime, activePlayerId, instanceId, buildingId)
        ),
    });
}

export async function handleBuildDeconstructIntent(runtime, playerId, payload) {
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
    const requestedBuildingId = normalizeBuildingRequestId(payload?.buildingId);
    const building = requestedBuildingId
        ? context.instance.buildingById?.get?.(requestedBuildingId)
        : resolveDeconstructBuildingAtCoordinate(context.instance, payload?.x, payload?.y);
    const buildingId = normalizeBuildingRequestId(building?.id ?? requestedBuildingId);
    const sectAccess = resolveSectBuildingAccess(runtime, context, playerId, 'building_remove');
    if (sectAccess.applies && !sectAccess.allowed) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'sect_demolish_permission_denied' }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
    }
    if (!building) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: 'building_not_found' }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
    }
    const targetAccess = resolveDeconstructTargetAccess(runtime, context, playerId, building, payload);
    if (!targetAccess.ok) {
        return recordBuildingOperation(runtime, operationKey, { requestId, ok: false, reason: targetAccess.reason }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
    }
    if (building.ownerPlayerId !== playerId) {
        const startResult = dispatchStartBuildingDeconstruction(runtime, playerId, building.id);
        return recordBuildingOperation(runtime, operationKey, {
            requestId,
            ok: startResult?.ok === true,
            reason: startResult?.ok === true ? undefined : startResult?.reason ?? 'building_deconstruct_failed',
            building: startResult?.building,
            deconstructStarted: startResult?.ok === true,
            deconstructTicks: startResult?.ok === true ? startResult.totalTicks : undefined,
        }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
    }
    const result = await deconstructBuildingWithSpecialLifecycle(runtime, context.instance, building, 'deconstruct');
    return recordBuildingOperation(runtime, operationKey, {
        requestId,
        ok: result?.ok === true,
        reason: result?.ok === true ? undefined : result?.reason ?? 'deconstruct_failed',
        treasureVaultRecoveryMailId: result.mailId,
        treasureVaultRecoveredItems: result.itemCount,
    }, { action: 'deconstruct', playerId, instanceId: context.instance.meta.instanceId, buildingId });
}

export async function completeBuildingDeconstruction(runtime, playerIdInput, instanceIdInput, buildingIdInput) {
    const playerId = normalizeBuildingRequestId(playerIdInput);
    const instanceId = normalizeBuildingRequestId(instanceIdInput);
    const buildingId = normalizeBuildingRequestId(buildingIdInput);
    const player = playerId ? runtime.playerRuntimeService?.getPlayer?.(playerId) : null;
    const job = player?.buildingJob;
    const instance = instanceId ? runtime.getInstanceRuntime?.(instanceId) : null;
    const building = buildingId ? instance?.buildingById?.get?.(buildingId) : null;
    if (!player || !job || job.operation !== 'deconstruct' || job.buildingId !== buildingId) {
        return { ok: false, reason: 'building_deconstruct_job_mismatch' };
    }
    if (!instance || !building) {
        return { ok: false, reason: 'building_not_found' };
    }
    if (building.state !== 'deconstructing' || building.activeDeconstructorPlayerId !== playerId) {
        return { ok: false, reason: 'building_deconstruct_state_mismatch' };
    }
    return deconstructBuildingWithSpecialLifecycle(runtime, instance, building, 'deconstruct');
}

/** 完工视觉建筑不重复投影实体；ID 缺失时按权威占格选择玩家实际点击的最上层建筑。 */
function resolveDeconstructBuildingAtCoordinate(instance, xInput, yInput) {
    const x = Number(xInput);
    const y = Number(yInput);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }
    return instance.getPrimaryBuildingAtTile?.(Math.trunc(x), Math.trunc(y)) ?? null;
}

/** 拆除必须命中目标建筑的权威占格，并处于玩家当前可见范围内。 */
function resolveDeconstructTargetAccess(runtime, context, playerId, building, payload) {
    const cells = collectBuildingOccupiedCells(context.instance, building);
    if (cells.length === 0) {
        return { ok: false, reason: 'building_not_found' };
    }
    const hasX = payload?.x !== undefined && payload?.x !== null;
    const hasY = payload?.y !== undefined && payload?.y !== null;
    let candidates = cells;
    if (hasX || hasY) {
        const x = Number(payload?.x);
        const y = Number(payload?.y);
        if (!hasX || !hasY || !Number.isFinite(x) || !Number.isFinite(y)) {
            return { ok: false, reason: 'building_target_mismatch' };
        }
        const targetX = Math.trunc(x);
        const targetY = Math.trunc(y);
        const matched = cells.find((cell) => cell.x === targetX && cell.y === targetY);
        if (!matched) {
            return { ok: false, reason: 'building_target_mismatch' };
        }
        candidates = [matched];
    }
    const instancePlayer = context.instance.playersById?.get?.(playerId);
    const playerX = Number(instancePlayer?.x ?? context.player?.x ?? context.location?.x);
    const playerY = Number(instancePlayer?.y ?? context.player?.y ?? context.location?.y);
    if (!Number.isFinite(playerX) || !Number.isFinite(playerY)) {
        return { ok: false, reason: 'building_not_visible' };
    }
    const viewRange = resolvePlayerBuildingViewRange(runtime, context, playerId);
    const inRangeCells = candidates.filter((cell) => Math.max(
        Math.abs(cell.x - Math.trunc(playerX)),
        Math.abs(cell.y - Math.trunc(playerY)),
    ) <= viewRange);
    if (inRangeCells.length === 0) {
        return { ok: false, reason: 'building_out_of_range' };
    }
    const visibleTiles = buildPlayerVisibleTileLookup(runtime, playerId, context.instance);
    if (!inRangeCells.some((cell) => isTileVisibleToPlayer(context.instance, cell.x, cell.y, visibleTiles))) {
        return { ok: false, reason: 'building_not_visible' };
    }
    return { ok: true };
}

function collectBuildingOccupiedCells(instance, building) {
    const cells = [];
    const occupiedIndices = instance.buildingCellsById?.get?.(building?.id);
    if (Array.isArray(occupiedIndices) && typeof instance.tilePlane?.getX === 'function' && typeof instance.tilePlane?.getY === 'function') {
        for (const cellIndex of occupiedIndices) {
            const x = Number(instance.tilePlane.getX(cellIndex));
            const y = Number(instance.tilePlane.getY(cellIndex));
            if (Number.isFinite(x) && Number.isFinite(y)) {
                cells.push({ x: Math.trunc(x), y: Math.trunc(y) });
            }
        }
    }
    if (cells.length > 0) {
        return cells;
    }
    const x = Number(building?.x);
    const y = Number(building?.y);
    return Number.isFinite(x) && Number.isFinite(y)
        ? [{ x: Math.trunc(x), y: Math.trunc(y) }]
        : [];
}

function resolvePlayerBuildingViewRange(runtime, context, playerId) {
    let runtimeRange = null;
    if (typeof runtime?.playerRuntimeService?.getViewRadius === 'function') {
        try {
            runtimeRange = runtime.playerRuntimeService.getViewRadius(playerId);
        }
        catch (_error) {
            runtimeRange = null;
        }
    }
    const rawRange = runtimeRange
        ?? context.player?.attrs?.numericStats?.viewRange
        ?? context.player?.viewRange;
    return Math.max(1, Math.round(Number(rawRange) || 1));
}

/** GM 拆除仍复用宝库返还、密室释放、lease 校验与分域刷盘，不返还建造材料。 */
export async function handleGmBuildDeconstruct(runtime, instanceIdInput, buildingIdInput) {
    const instanceId = normalizeBuildingRequestId(instanceIdInput);
    const buildingId = normalizeBuildingRequestId(buildingIdInput);
    const instance = instanceId ? runtime.getInstanceRuntime?.(instanceId) : null;
    if (!instance) {
        return { ok: false, reason: 'instance_not_found' };
    }
    if (typeof runtime.isInstanceLeaseWritable === 'function' && !runtime.isInstanceLeaseWritable(instance)) {
        return { ok: false, reason: 'instance_lease_not_local' };
    }
    const domains = ['building', 'tile_cell', 'tile_damage', 'room', 'fengshui'];
    let result = null;
    const mutate = async () => {
        if (typeof runtime.isInstanceLeaseWritable === 'function' && !runtime.isInstanceLeaseWritable(instance)) {
            return { ok: false, reason: 'instance_lease_not_local' };
        }
        const building = instance.buildingById?.get?.(buildingId) ?? null;
        if (!building) {
            return { ok: false, reason: 'building_not_found' };
        }
        const buildingSnapshot = {
            id: building.id,
            defId: building.defId,
            name: resolveBuildingDisplayName(instance, building),
            x: building.x,
            y: building.y,
        };
        const removed = await deconstructBuildingWithSpecialLifecycle(runtime, instance, building, 'gm_deconstruct');
        return removed.ok === true ? { ...removed, building: buildingSnapshot } : removed;
    };
    if (typeof instance.runExclusivePersistenceDomainMutation === 'function') {
        result = await instance.runExclusivePersistenceDomainMutation(domains, mutate);
    }
    else {
        result = await mutate();
    }
    if (result?.ok === true && typeof runtime.flushInstanceDomains === 'function') {
        await runtime.flushInstanceDomains(instanceId, domains);
    }
    return result ?? { ok: false, reason: 'building_deconstruct_failed' };
}

async function deconstructBuildingWithSpecialLifecycle(runtime, instance, building, reason) {
    const recovery = await recoverTreasureVaultItemsBeforeDeconstruct(runtime, instance, building, reason);
    if (recovery.ok !== true) {
        return { ok: false, reason: recovery.reason ?? 'treasure_vault_recovery_failed' };
    }
    const chamberRelease = await releaseTimeChamberBeforeDeconstruct(runtime, instance, building);
    if (chamberRelease.ok !== true) {
        return { ok: false, reason: chamberRelease.reason ?? 'time_chamber_release_failed' };
    }
    const result = instance.deconstructBuildingInstance(building.id, {
        treasureVaultRecovered: true,
        timeChamberReleased: true,
    });
    return {
        ok: result?.ok === true,
        reason: result?.ok === true ? undefined : result?.reason ?? 'deconstruct_failed',
        mailId: recovery.mailId,
        itemCount: recovery.itemCount,
    };
}

async function releaseTimeChamberBeforeDeconstruct(runtime, instance, building) {
    if (!isTimeChamberBuilding(instance, building)) {
        return { ok: true };
    }
    const service = runtime?.timeChamberRuntimeService;
    if (typeof service?.prepareDeconstruct !== 'function') {
        return { ok: false, reason: 'time_chamber_release_unavailable' };
    }
    return service.prepareDeconstruct(instance?.meta?.instanceId, building?.id, runtime);
}

async function recoverTreasureVaultItemsBeforeDeconstruct(runtime, instance, building, reason) {
    if (!isTreasureVaultBuilding(instance, building)) {
        return { ok: true, itemCount: 0 };
    }
    const service = runtime?.treasureVaultRuntimeService;
    if (typeof service?.recoverVaultItemsToOwnerMail !== 'function') {
        return { ok: false, itemCount: 0, reason: 'treasure_vault_recovery_unavailable' };
    }
    return service.recoverVaultItemsToOwnerMail({
        instanceId: instance?.meta?.instanceId,
        buildingId: building?.id,
        buildingName: resolvePlayerFacingContentName(
            building?.defId,
            '未知宝库',
            resolveBuildingDisplayName(instance, building),
            building?.name,
        ),
        ownerPlayerId: building?.ownerPlayerId ?? null,
        reason,
    });
}

function isTreasureVaultBuilding(instance, building) {
    const compiled = resolveCompiledBuildingDefinition(instance?.buildingCatalog, building);
    return building?.defId === 'treasure_vault'
        || compiled?.id === 'treasure_vault'
        || Math.max(0, Math.trunc(Number(compiled?.treasureVaultCapacity) || 0)) > 0;
}

function isTimeChamberBuilding(instance, building) {
    const compiled = resolveCompiledBuildingDefinition(instance?.buildingCatalog, building);
    return building?.defId === 'time_chamber'
        || compiled?.id === 'time_chamber'
        || compiled?.timeChamberEnabled === true;
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
    const visibleTiles = buildPlayerVisibleTileLookup(runtime, playerId, context.instance);
    const roomId = typeof payload?.roomId === 'string' && payload.roomId.trim() ? payload.roomId.trim() : '';
    const hasExplicitPoint = Number.isFinite(Number(payload?.x)) || Number.isFinite(Number(payload?.y));
    const shouldBuildDetail = Boolean(roomId || hasExplicitPoint || payload?.overlay !== true);
    const x = shouldBuildDetail && Number.isFinite(Number(payload?.x)) ? Math.trunc(Number(payload.x)) : context.instance.playersById.get(playerId)?.x;
    const y = shouldBuildDetail && Number.isFinite(Number(payload?.y)) ? Math.trunc(Number(payload.y)) : context.instance.playersById.get(playerId)?.y;
    const canReadDetail = shouldBuildDetail && (roomId
        ? isRoomVisibleToPlayer(context.instance, roomId, visibleTiles)
        : isTileVisibleToPlayer(context.instance, x, y, visibleTiles));
    const snapshot = canReadDetail && roomId
        ? context.instance.getFengShuiSnapshot?.(roomId)
        : canReadDetail
            ? context.instance.getFengShuiSnapshotAt?.(x, y)
            : null;
    const room = snapshot?.roomId ? context.instance.roomsById?.get?.(snapshot.roomId) : null;
    return {
        detail: room && snapshot
            ? { room: toRoomSummaryView(room), fengShui: snapshot }
            : null,
        overlay: payload?.overlay === true ? buildFengShuiOverlayPatch(context.instance, playerId, visibleTiles) : null,
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

/** 宗门地图使用宗门职位权限；其它地图不改变既有建筑权限语义。 */
function resolveSectBuildingAccess(runtime, context, playerId, permissionId) {
    const instanceId = normalizeBuildingRequestId(context?.instance?.meta?.instanceId ?? context?.location?.instanceId);
    const sectService = runtime?.worldRuntimeSectService;
    const sect = typeof sectService?.findSectByInstanceId === 'function'
        ? sectService.findSectByInstanceId(instanceId)
        : null;
    const sectId = normalizeBuildingRequestId(sect?.sectId ?? context?.instance?.meta?.ownerSectId);
    if (!sectId) {
        return { applies: false, allowed: true, sectId: null };
    }
    const verdict = typeof sectService?.resolveSectInstancePermission === 'function'
        ? sectService.resolveSectInstancePermission(playerId, instanceId, permissionId)
        : false;
    return {
        applies: true,
        allowed: verdict === true,
        sectId,
    };
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
    while (runtime.buildingOperationAuditLog.length > BUILDING_OPERATION_AUDIT_LOG_LIMIT) {
        runtime.buildingOperationAuditLog.shift();
    }
    while (runtime.buildingOperationResultsByKey.size > BUILDING_OPERATION_RESULTS_LIMIT) {
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
            const requiredCategory = resolveGenericBuildMaterialSlotCategory(slotItemId);
            if (!hasBuildMaterialCategory(inventoryItem, requiredCategory)) {
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
function normalizeBuildStrength(value, baseBuildTicks = 1) {
    const normalized = Math.trunc(Number(value) || 1);
    const base = Math.max(1, Math.trunc(Number(baseBuildTicks) || 1));
    return Math.min(BUILDING_MAX_BUILD_TICKS, Math.max(base, normalized));
}
function resolveBuildingSkillLevel(player) {
    return Math.max(1, Math.trunc(Number(player?.buildingSkill?.level ?? 1) || 1));
}
function resolvePlacedBuildingMaxHp(compiled, buildingSkillLevel, buildStrength) {
    const baseMultiplier = Math.max(0.01, Number(compiled?.durabilityMultiplier ?? (Number(compiled?.maxHp ?? 1) / 100)));
    return Math.max(1, Math.trunc(calculateTerrainDurability(buildingSkillLevel, baseMultiplier) * buildStrength));
}
export function awardBuildingConstructionProgress(runtime, playerIdInput, progressTicks = 1) {
    return 0;
}
export function notifyBuildingConstructionCompletion(runtime, building) {
    const playerId = normalizeBuildingRequestId(building?.ownerPlayerId);
    const buildingName = resolvePlayerFacingContentName(
        building?.defId,
        '未知建筑',
        resolveBuildingDisplayNameByRuntime(runtime, building),
        building?.name,
    );
    if (playerId && canQueueBuildingNotice(runtime)) {
        const notice = buildStructuredNotice(
            'building',
            'notice.craft.building.completed',
            `${buildingName}已完工`,
            { vars: { buildingName }, pills: [{ key: 'buildingName', style: 'target' }] },
        );
        runtime.queuePlayerNotice(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
    }
    if (building?.defId === 'time_chamber' && typeof runtime?.timeChamberRuntimeService?.ensurePersistentChamberForBuilding === 'function') {
        void runtime.timeChamberRuntimeService.ensurePersistentChamberForBuilding(
            building.instanceId,
            building.id,
            runtime,
        ).catch((error) => {
            runtime.logger?.warn?.(`密室完工后常驻实例创建失败：${building.instanceId}/${building.id} ${error instanceof Error ? error.message : String(error)}`);
        });
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
function buildBuildingInterruptNotice(buildingNameInput, reason) {
    const buildingName = typeof buildingNameInput === 'string' && buildingNameInput.trim() ? buildingNameInput.trim() : '当前建筑';
    const reasonLabel = reason === 'move'
        ? '移动'
        : reason === 'attack'
            ? '出手'
            : reason === 'cultivate'
                ? '打坐'
                : reason === 'defeat'
                    ? '身陨'
                    : '手动取消';
    return buildStructuredNotice(
        'building',
        'notice.craft.building.interrupted',
        buildBuildingInterruptMessage(buildingName, reason),
        {
            vars: { buildingName, reasonLabel },
            pills: [{ key: 'buildingName', style: 'target' }, { key: 'reasonLabel', style: 'target' }],
        },
    );
}
function localizeStartBuildingFailure(reason) {
    switch (reason) {
        case 'building_not_found':
            return '目标半成品不存在';
        case 'building_not_under_construction':
            return '该建筑当前不可继续施工';
        case 'building_owner_mismatch':
            return '只能建造自己的半成品';
        case 'sect_build_permission_denied':
            return '当前职位没有宗门建造权限';
        case 'virtual_world_building_forbidden':
            return '虚境不能建造建筑，请前往现世';
        case 'player_not_found':
            return '当前角色不存在';
        case 'building_too_far':
            return '需要靠近半成品后才能开始建造';
        case 'building_active_builder_mismatch':
            return '建筑正在由其他玩家施工';
        default:
            return '开始建造失败';
    }
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
        deconstructRemainingTicks: building.deconstructRemainingTicks,
        activeDeconstructorPlayerId: building.activeDeconstructorPlayerId ?? null,
        revision: building.revision,
    };
}
function resolveBuildingDisplayName(instance, building) {
    if (typeof building?.name === 'string' && building.name.trim()) {
        return building.name.trim();
    }
    const compiled = resolveCompiledBuildingDefinition(instance?.buildingCatalog, building);
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
function buildFengShuiOverlayPatch(instance, playerId, visibleTiles = null) {
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
        if (!isTileVisibleToPlayer(instance, x, y, visibleTiles)) {
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

function buildPlayerVisibleTileLookup(runtime, playerId, instance) {
    let view = null;
    if (typeof runtime?.getPlayerView === 'function') {
        try {
            view = runtime.getPlayerView(playerId);
        }
        catch (_error) {
            view = null;
        }
    }
    if (!view && typeof instance?.buildPlayerView === 'function') {
        view = instance.buildPlayerView(playerId);
    }
    const indices = new Set();
    const keys = new Set();
    for (const rawIndex of Array.isArray(view?.visibleTileIndices) ? view.visibleTileIndices : []) {
        const index = Math.trunc(Number(rawIndex));
        if (Number.isFinite(index) && index >= 0) {
            indices.add(index);
        }
    }
    for (const key of Array.isArray(view?.visibleTileKeys) ? view.visibleTileKeys : []) {
        if (typeof key === 'string') {
            keys.add(key);
        }
    }
    return { indices, keys };
}

function isTileVisibleToPlayer(instance, x, y, visibleTiles) {
    const tileX = Math.trunc(Number(x));
    const tileY = Math.trunc(Number(y));
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        return false;
    }
    if (visibleTiles?.keys?.has?.(`${tileX},${tileY}`)) {
        return true;
    }
    if (typeof instance?.isInBounds === 'function' && instance.isInBounds(tileX, tileY) !== true) {
        return false;
    }
    const tileIndex = typeof instance?.toTileIndex === 'function'
        ? instance.toTileIndex(tileX, tileY)
        : Math.trunc(Number(instance?.tilePlane?.getIndex?.(tileX, tileY)));
    return Number.isFinite(tileIndex) && visibleTiles?.indices?.has?.(tileIndex) === true;
}

function isRoomVisibleToPlayer(instance, roomId, visibleTiles) {
    if (!roomId || !visibleTiles) {
        return false;
    }
    for (const tileIndex of visibleTiles.indices ?? []) {
        if (instance.roomIdsByHandle?.[instance.roomIdByCell?.[tileIndex]] === roomId) {
            return true;
        }
    }
    if ((visibleTiles.indices?.size ?? 0) > 0 || typeof instance?.toTileIndex !== 'function') {
        return false;
    }
    for (const key of visibleTiles.keys ?? []) {
        const separatorIndex = typeof key === 'string' ? key.indexOf(',') : -1;
        if (separatorIndex < 0) {
            continue;
        }
        const x = Number(key.slice(0, separatorIndex));
        const y = Number(key.slice(separatorIndex + 1));
        if (!Number.isInteger(x) || !Number.isInteger(y) || instance.isInBounds?.(x, y) !== true) {
            continue;
        }
        const tileIndex = instance.toTileIndex(x, y);
        if (instance.roomIdsByHandle?.[instance.roomIdByCell?.[tileIndex]] === roomId) {
            return true;
        }
    }
    return false;
}
