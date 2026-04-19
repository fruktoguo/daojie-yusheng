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
exports.WorldRuntimeFrameService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_instance_tick_orchestration_service_1 = require("./world-runtime-instance-tick-orchestration.service");
const world_runtime_metrics_service_1 = require("./world-runtime-metrics.service");

/** world-runtime frame seam：承接 tickAll/advanceFrame/sync-flush-duration 这组世界级 frame 外壳。 */
let WorldRuntimeFrameService = class WorldRuntimeFrameService {
    worldRuntimeInstanceTickOrchestrationService;
    worldRuntimeMetricsService;
    constructor(worldRuntimeInstanceTickOrchestrationService, worldRuntimeMetricsService) {
        this.worldRuntimeInstanceTickOrchestrationService = worldRuntimeInstanceTickOrchestrationService;
        this.worldRuntimeMetricsService = worldRuntimeMetricsService;
    }
    tickAll(deps) {
        return this.advanceFrame(deps, 1000);
    }
    advanceFrame(deps, frameDurationMs = 1000, getInstanceTickSpeed = null) {
        return this.worldRuntimeInstanceTickOrchestrationService.advanceFrame(deps, frameDurationMs, getInstanceTickSpeed);
    }
    recordSyncFlushDuration(durationMs) {
        this.worldRuntimeMetricsService.recordSyncFlushDuration(durationMs);
    }
};
exports.WorldRuntimeFrameService = WorldRuntimeFrameService;
exports.WorldRuntimeFrameService = WorldRuntimeFrameService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_instance_tick_orchestration_service_1.WorldRuntimeInstanceTickOrchestrationService,
        world_runtime_metrics_service_1.WorldRuntimeMetricsService])
], WorldRuntimeFrameService);
