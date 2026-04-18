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

/** world-runtime instance tick orchestration：承接实例级 tick 编排外壳。 */
let WorldRuntimeInstanceTickOrchestrationService = class WorldRuntimeInstanceTickOrchestrationService {
    advanceFrame(deps, frameDurationMs = 1000, getInstanceTickSpeed = null) {
        const startedAt = performance.now();
        deps.worldRuntimeCombatEffectsService.resetFrameEffects();
        const instanceStepPlans = [];
        let plannedLogicalTicks = 0;
        for (const instance of deps.instances.values()) {
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
        deps.dispatchPendingCommands();
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
                const result = instance.tickOnce();
                for (const transfer of result.transfers) {
                    deps.applyTransfer(transfer);
                }
                for (const action of result.monsterActions) {
                    deps.applyMonsterAction(action);
                }
                const currentPlayerIds = instance.listPlayerIds();
                if (currentPlayerIds.length > 0) {
                    deps.playerRuntimeService.advanceTickForPlayerIds(currentPlayerIds, instance.tick, {
                        idleCultivationBlockedPlayerIds: blockedPlayerIds,
                    });
                    deps.worldRuntimeCraftService.advanceCraftJobs(currentPlayerIds, deps);
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
        deps.worldRuntimeLootContainerService.advanceContainerSearches(deps.instances, deps.playerLocations, deps.tick);
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
