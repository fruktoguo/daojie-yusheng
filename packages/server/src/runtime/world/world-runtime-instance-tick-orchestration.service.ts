/**
 * 实例级 tick 编排服务
 * 按阶段推进每个实例的 tick：资源流动、阵法、建筑、传送、怪物、玩家修炼等
 */
import { Injectable } from '@nestjs/common';
import { DEFAULT_AURA_LEVEL_BASE_VALUE, getAuraLevel, getQiResourceDefaultLevel, parseQiResourceKey, resolveGameTimeState } from '@mud/shared';
import { projectPlayerQiResourceValue, resolvePlayerQiResourceProjection } from './world-runtime-qi-projection.helpers';
import { notifyBuildingConstructionCompletion } from './world-runtime-building.service';

/** world-runtime instance tick orchestration：承接实例级 tick 编排外壳。 */
@Injectable()
export class WorldRuntimeInstanceTickOrchestrationService {
/**
 * advanceFrame：执行advance帧相关逻辑。
 * @param deps 运行时依赖。
 * @param frameDurationMs 参数说明。
 * @param getInstanceTickSpeed 参数说明。
 * @returns 无返回值，直接更新advance帧相关状态。
 */

    async advanceFrame(deps, frameDurationMs = 1000, getInstanceTickSpeed = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const startedAt = performance.now();
        deps.worldRuntimeCombatEffectsService.resetFrameEffects();
        const instanceStepPlans = [];
        let plannedLogicalTicks = 0;
        for (const instance of deps.listInstanceRuntimes()) {
            if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
                if (typeof deps.fenceInstanceRuntime === 'function') {
                    deps.fenceInstanceRuntime(instance.meta.instanceId, 'advance_frame_lease_check_failed');
                }
                continue;
            }
            const speed = getInstanceTickSpeed
                ? Math.max(0, Number(getInstanceTickSpeed(instance.template.id) ?? 1))
                : 1;
            if (!Number.isFinite(speed) || speed <= 0) {
                continue;
            }
            const previousProgress = deps.worldRuntimeTickProgressService.getProgress(instance.meta.instanceId);
            const accumulated = previousProgress + speed * (Math.max(0, frameDurationMs) / 1000);
            const steps = Math.floor(accumulated);
            deps.worldRuntimeTickProgressService.setProgress(instance.meta.instanceId, accumulated - steps);
            if (steps <= 0) {
                continue;
            }
            instanceStepPlans.push({ instance, steps, speed });
            plannedLogicalTicks += steps;
        }
        if (plannedLogicalTicks <= 0) {
            deps.worldRuntimeMetricsService.recordIdleFrame(startedAt);
            return 0;
        }
        deps.processPendingRespawns();
        deps.materializeNavigationCommands();
        deps.materializeAutoUsePills?.();
        deps.worldRuntimeAutoCombatService.materializeAutoCombatCommands(deps);
        const pendingCommandsStartedAt = performance.now();
        await deps.dispatchPendingCommands();
        const pendingCommandsMs = performance.now() - pendingCommandsStartedAt;
        const systemCommandsStartedAt = performance.now();
        deps.dispatchPendingSystemCommands();
        const systemCommandsMs = performance.now() - systemCommandsStartedAt;
        const steppedPlayerIds = new Set();
        let totalLogicalTicks = 0;
        const instanceTicksStartedAt = performance.now();
        for (const { instance, steps, speed } of instanceStepPlans) {
            for (let index = 0; index < steps; index += 1) {
                // 加速 tick 补偿：对于后续逻辑 tick，为当前实例的玩家重新物化命令
                if (index > 0) {
                    deps.worldRuntimeNavigationService.materializeNavigationCommandsForInstance(instance.meta.instanceId, deps);
                    deps.worldRuntimeAutoCombatService.materializeAutoUsePillsForInstance(instance.meta.instanceId, deps);
                    deps.worldRuntimeAutoCombatService.materializeAutoCombatCommandsForInstance(instance.meta.instanceId, deps);
                    await deps.dispatchPendingCommands();
                }
                const blockedPlayerIds = deps.worldRuntimeNavigationService.getBlockedPlayerIds();
                deps.tick += 1;
                totalLogicalTicks += 1;
                if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
                    if (typeof deps.fenceInstanceRuntime === 'function') {
                        deps.fenceInstanceRuntime(instance.meta.instanceId, 'instance_tick_lease_check_failed');
                    }
                    break;
                }
                const isFormationTerrainStabilized = typeof deps.worldRuntimeFormationService?.createTerrainStabilizationChecker === 'function'
                    ? deps.worldRuntimeFormationService.createTerrainStabilizationChecker(instance.meta.instanceId)
                    : ((x, y) => deps.worldRuntimeFormationService?.isTerrainStabilized?.(instance.meta.instanceId, x, y) === true);
                const isTerrainStabilized = (x, y) => (
                    isFormationTerrainStabilized(x, y) === true
                    || deps.worldRuntimeSectService?.isSectInnateStabilized?.(instance.meta.instanceId, x, y) === true
                );
                const result = instance.tickOnce();
                if (typeof instance.advanceTileResourceFlow === 'function') {
                    instance.advanceTileResourceFlow();
                }
                if (typeof deps.worldRuntimeFormationService?.advanceInstanceFormations === 'function') {
                    deps.worldRuntimeFormationService.advanceInstanceFormations(instance, deps.tick, deps);
                }
                if (typeof instance.advanceTemporaryTiles === 'function') {
                    instance.advanceTemporaryTiles(instance.tick, isTerrainStabilized);
                }
                if (typeof instance.advanceTileRecovery === 'function') {
                    instance.advanceTileRecovery(isTerrainStabilized);
                }
                if (Array.isArray(result.completedBuildings) && result.completedBuildings.length > 0) {
                    for (const building of result.completedBuildings) {
                        notifyBuildingConstructionCompletion(deps, building);
                    }
                }
                for (const transfer of result.transfers) {
                    deps.applyTransfer(transfer);
                }
                for (const action of result.monsterActions) {
                    deps.applyMonsterAction(action);
                }
                const currentPlayerIds = instance.listPlayerIds();
                if (currentPlayerIds.length > 0) {
                    syncWorldTimeVisionForPlayers(instance, currentPlayerIds, deps.playerRuntimeService, speed);
                    const cultivationAuraMultiplierByPlayerId = buildCultivationAuraMultiplierByPlayerId(instance, currentPlayerIds, deps.playerRuntimeService);
                    deps.playerRuntimeService.advanceTickForPlayerIds(currentPlayerIds, instance.tick, {
                        idleCultivationBlockedPlayerIds: blockedPlayerIds,
                        cultivationAuraMultiplierByPlayerId,
                    });
                    applyTileQiDrainForPlayers(instance, currentPlayerIds, deps);
                    if (typeof deps.worldRuntimePlayerSkillDispatchService?.resolvePendingPlayerSkillCast === 'function') {
                        for (const playerId of currentPlayerIds) {
                            await deps.worldRuntimePlayerSkillDispatchService.resolvePendingPlayerSkillCast(playerId, deps);
                        }
                    }
                    await deps.worldRuntimeCraftTickService.advanceCraftJobs(currentPlayerIds, deps);
                    for (const playerId of currentPlayerIds) {
                        steppedPlayerIds.add(playerId);
                    }
                }
                if (typeof deps.worldRuntimeTongtianTowerService?.advanceInstance === 'function') {
                    deps.worldRuntimeTongtianTowerService.advanceInstance(instance, deps);
                }
            }
        }
        if (typeof deps.worldRuntimeTongtianTowerService?.cleanupIdleInstances === 'function') {
            await deps.worldRuntimeTongtianTowerService.cleanupIdleInstances(deps);
        }
        const instanceTicksMs = performance.now() - instanceTicksStartedAt;
        const transfersMs = 0;
        const monsterActionsMs = 0;
        const playerAdvanceStartedAt = performance.now();
        deps.worldRuntimeLootContainerService.advanceContainerSearches({
            getInstanceRuntime: (instanceId) => deps.getInstanceRuntime(instanceId),
        }, {
            listConnectedPlayerIds: () => deps.listConnectedPlayerIds(),
            getPlayerLocation: (playerId) => deps.getPlayerLocation(playerId),
        }, deps.tick);
        for (const playerId of steppedPlayerIds) {
            deps.refreshQuestStates(playerId);
        }
        const playerAdvanceMs = performance.now() - playerAdvanceStartedAt;
        deps.worldRuntimeMetricsService.recordFrameResult(startedAt, {
            pendingCommandsMs,
            systemCommandsMs,
            instanceTicksMs,
            transfersMs,
            monsterActionsMs,
            playerAdvanceMs,
        });
        return totalLogicalTicks;
    }
};

function syncWorldTimeVisionForPlayers(instance, playerIds, playerRuntimeService, tickSpeed = 1) {
    if (!playerRuntimeService || typeof playerRuntimeService.getPlayer !== 'function') {
        return;
    }
    const timeState = resolveGameTimeState(
        instance.tick,
        1,
        instance.template?.source?.time,
        tickSpeed,
    );
    for (const playerId of playerIds) {
        const player = playerRuntimeService.getPlayer(playerId);
        if (!player) {
            continue;
        }
        if (isSameWorldTimeVisionState(player.worldTime, timeState)) {
            continue;
        }
        player.worldTime = timeState;
        if (typeof playerRuntimeService.playerAttributesService?.recalculate === 'function') {
            playerRuntimeService.playerAttributesService.recalculate(player);
        }
    }
}

function isSameWorldTimeVisionState(left, right) {
    return Boolean(left)
        && left.phase === right.phase
        && left.phaseLabel === right.phaseLabel
        && left.darknessStacks === right.darknessStacks
        && left.visionMultiplier === right.visionMultiplier
        && left.lightPercent === right.lightPercent;
}

function buildCultivationAuraMultiplierByPlayerId(instance, playerIds, playerRuntimeService) {
    const multipliers = new Map();
    for (const playerId of playerIds) {
        const player = typeof playerRuntimeService?.getPlayer === 'function'
            ? playerRuntimeService.getPlayer(playerId)
            : null;
        const position = typeof instance.getPlayerPosition === 'function'
            ? instance.getPlayerPosition(playerId)
            : null;
        multipliers.set(playerId, resolveCultivationAuraMultiplier(instance, player, position));
    }
    return multipliers;
}

function resolveCultivationAuraMultiplier(instance, player, position) {
    if (!position) {
        return 1;
    }
    const aura = resolveTileCultivationAura(instance, player, position.x, position.y);
    if (aura.rawLevel <= 0) {
        return 1;
    }
    const efficiencyMultiplier = aura.rawValue > 0
        ? Math.max(0, aura.effectiveValue / aura.rawValue)
        : 1;
    return 1 + Math.max(0, aura.rawLevel) * efficiencyMultiplier;
}

function resolveTileCultivationAura(instance, player, x, y) {
    const resources = typeof instance.listTileResources === 'function'
        ? instance.listTileResources(x, y)
        : null;
    if (Array.isArray(resources) && resources.length > 0) {
        let rawQiValue = 0;
        let projectedQiValue = 0;
        let hasQiResource = false;
        for (const resource of resources) {
            const value = Math.max(0, Math.trunc(Number(resource.value) || 0));
            const projected = resolveCultivationResourceValue(player, resource.resourceKey, value);
            if (!projected.contributes) {
                continue;
            }
            hasQiResource = true;
            rawQiValue += projected.rawValue;
            projectedQiValue += projected.effectiveValue;
        }
        if (hasQiResource) {
            return {
                rawValue: rawQiValue,
                effectiveValue: projectedQiValue,
                rawLevel: getAuraLevel(rawQiValue, DEFAULT_AURA_LEVEL_BASE_VALUE),
            };
        }
    }
    const rawAura = typeof instance.getTileAura === 'function'
        ? instance.getTileAura(x, y)
        : 0;
    const normalizedAura = Math.max(0, Math.trunc(Number(rawAura) || 0));
    const effectiveAura = player
        ? projectPlayerQiResourceValue(player, 'aura.refined.neutral', normalizedAura)
        : normalizedAura;
    return {
        rawValue: normalizedAura,
        effectiveValue: effectiveAura,
        rawLevel: getQiResourceDefaultLevel('aura.refined.neutral', normalizedAura, DEFAULT_AURA_LEVEL_BASE_VALUE) ?? 0,
    };
}

function applyTileQiDrainForPlayers(instance, playerIds, deps) {
    const playerRuntimeService = deps?.playerRuntimeService;
    if (!instance || typeof instance.getPlayerPosition !== 'function' || typeof instance.getTileQiDrainPerTick !== 'function' || typeof playerRuntimeService?.getPlayer !== 'function' || typeof playerRuntimeService?.setVitals !== 'function') {
        return;
    }
    for (const playerId of playerIds) {
        const position = instance.getPlayerPosition(playerId);
        if (!position) {
            continue;
        }
        const qiDrain = instance.getTileQiDrainPerTick(position.x, position.y);
        if (!Number.isFinite(qiDrain) || qiDrain <= 0) {
            continue;
        }
        const player = playerRuntimeService.getPlayer(playerId);
        if (!player || player.hp <= 0) {
            continue;
        }
        const currentQi = Math.max(0, Math.round(Number(player.qi) || 0));
        const nextQi = Math.max(0, currentQi - Math.max(0, Math.trunc(qiDrain)));
        if (nextQi !== player.qi) {
            playerRuntimeService.setVitals(playerId, { qi: nextQi });
        }
        if (currentQi > 0 && nextQi <= 0 && typeof instance.relocatePlayer === 'function') {
            const spawnPoint = instance.template?.spawnPoint ?? null;
            const relocated = instance.relocatePlayer(playerId, spawnPoint?.x, spawnPoint?.y);
            if (relocated) {
                instance.cancelPendingCommand?.(playerId);
                deps.worldRuntimeNavigationService?.clearNavigationIntent?.(playerId);
                deps.clearPendingCommand?.(playerId);
                deps.queuePlayerNotice?.(playerId, '灵力被地脉道压抽空，你被震回起点。', 'warn');
            }
        }
    }
}

function resolveCultivationResourceValue(player, resourceKey, value) {
    const parsed = parseQiResourceKey(resourceKey);
    if (!parsed || value <= 0) {
        return { contributes: false, rawValue: 0, effectiveValue: 0 };
    }
    if (!player) {
        return { contributes: true, rawValue: value, effectiveValue: value };
    }
    const projection = resolvePlayerQiResourceProjection(player, resourceKey);
    if (projection?.visibility !== 'absorbable') {
        return { contributes: false, rawValue: 0, effectiveValue: 0 };
    }
    return {
        contributes: true,
        rawValue: value,
        effectiveValue: projectPlayerQiResourceValue(player, resourceKey, value),
    };
}
