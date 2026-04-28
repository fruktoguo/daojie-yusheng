// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeInstanceTickOrchestrationService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");
const world_runtime_qi_projection_helpers_1 = require("./world-runtime-qi-projection.helpers");

/** world-runtime instance tick orchestration：承接实例级 tick 编排外壳。 */
let WorldRuntimeInstanceTickOrchestrationService = class WorldRuntimeInstanceTickOrchestrationService {
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
            instanceStepPlans.push({ instance, steps });
            plannedLogicalTicks += steps;
        }
        if (plannedLogicalTicks <= 0) {
            deps.worldRuntimeMetricsService.recordIdleFrame(startedAt);
            return 0;
        }
        deps.processPendingRespawns();
        deps.materializeNavigationCommands();
        deps.materializeAutoCombatCommands();
        const pendingCommandsStartedAt = performance.now();
        await deps.dispatchPendingCommands();
        const pendingCommandsMs = performance.now() - pendingCommandsStartedAt;
        const systemCommandsStartedAt = performance.now();
        deps.dispatchPendingSystemCommands();
        const systemCommandsMs = performance.now() - systemCommandsStartedAt;
        const steppedPlayerIds = new Set();
        const blockedPlayerIds = deps.worldRuntimeNavigationService.getBlockedPlayerIds();
        let totalLogicalTicks = 0;
        const instanceTicksStartedAt = performance.now();
        for (const { instance, steps } of instanceStepPlans) {
            for (let index = 0; index < steps; index += 1) {
                deps.tick += 1;
                totalLogicalTicks += 1;
                if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
                    if (typeof deps.fenceInstanceRuntime === 'function') {
                        deps.fenceInstanceRuntime(instance.meta.instanceId, 'instance_tick_lease_check_failed');
                    }
                    break;
                }
                const result = instance.tickOnce();
                if (typeof deps.worldRuntimeFormationService?.advanceInstanceFormations === 'function') {
                    deps.worldRuntimeFormationService.advanceInstanceFormations(instance, deps.tick, deps);
                }
                if (typeof instance.advanceTemporaryTiles === 'function') {
                    instance.advanceTemporaryTiles(instance.tick, (x, y) => (
                        deps.worldRuntimeFormationService?.isTerrainStabilized?.(instance.meta.instanceId, x, y) === true
                    ));
                }
                if (typeof instance.advanceTileRecovery === 'function') {
                    instance.advanceTileRecovery((x, y) => (
                        deps.worldRuntimeFormationService?.isTerrainStabilized?.(instance.meta.instanceId, x, y) === true
                        || deps.worldRuntimeSectService?.isSectInnateStabilized?.(instance.meta.instanceId, x, y) === true
                    ));
                }
                for (const transfer of result.transfers) {
                    deps.applyTransfer(transfer);
                }
                for (const action of result.monsterActions) {
                    deps.applyMonsterAction(action);
                }
                const currentPlayerIds = instance.listPlayerIds();
                if (currentPlayerIds.length > 0) {
                    const cultivationAuraMultiplierByPlayerId = buildCultivationAuraMultiplierByPlayerId(instance, currentPlayerIds, deps.playerRuntimeService);
                    deps.playerRuntimeService.advanceTickForPlayerIds(currentPlayerIds, instance.tick, {
                        idleCultivationBlockedPlayerIds: blockedPlayerIds,
                        cultivationAuraMultiplierByPlayerId,
                    });
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
            }
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
exports.WorldRuntimeInstanceTickOrchestrationService = WorldRuntimeInstanceTickOrchestrationService;
exports.WorldRuntimeInstanceTickOrchestrationService = WorldRuntimeInstanceTickOrchestrationService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeInstanceTickOrchestrationService);

export { WorldRuntimeInstanceTickOrchestrationService };

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
    return 1 + Math.max(0, resolveTileAuraLevel(instance, player, position.x, position.y));
}

function resolveTileAuraLevel(instance, player, x, y) {
    const resources = typeof instance.listTileResources === 'function'
        ? instance.listTileResources(x, y)
        : null;
    if (Array.isArray(resources) && resources.length > 0) {
        let projectedAuraValue = 0;
        let hasAuraResource = false;
        for (const resource of resources) {
            const parsed = (0, shared_1.parseQiResourceKey)(resource.resourceKey);
            if (parsed?.family !== 'aura') {
                continue;
            }
            hasAuraResource = true;
            const value = Math.max(0, Math.trunc(Number(resource.value) || 0));
            projectedAuraValue += player
                ? (0, world_runtime_qi_projection_helpers_1.projectPlayerQiResourceValue)(player, resource.resourceKey, value)
                : value;
        }
        if (hasAuraResource) {
            return (0, shared_1.getQiResourceDefaultLevel)('aura.refined.neutral', projectedAuraValue, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE) ?? 0;
        }
    }
    const rawAura = typeof instance.getTileAura === 'function'
        ? instance.getTileAura(x, y)
        : 0;
    const normalizedAura = Math.max(0, Math.trunc(Number(rawAura) || 0));
    const effectiveAura = player
        ? (0, world_runtime_qi_projection_helpers_1.projectPlayerQiResourceValue)(player, 'aura.refined.neutral', normalizedAura)
        : normalizedAura;
    return (0, shared_1.getQiResourceDefaultLevel)('aura.refined.neutral', effectiveAura, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE) ?? 0;
}
