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
exports.WorldRuntimeFrameService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_instance_tick_orchestration_service_1 = require("./world-runtime-instance-tick-orchestration.service");
const world_runtime_metrics_service_1 = require("./world-runtime-metrics.service");

/** world-runtime frame seam：承接 tickAll/advanceFrame/sync-flush-duration 这组世界级 frame 外壳。 */
let WorldRuntimeFrameService = class WorldRuntimeFrameService {
/**
 * worldRuntimeInstanceTickOrchestrationService：对象字段。
 */

    worldRuntimeInstanceTickOrchestrationService;    
    /**
 * worldRuntimeMetricsService：对象字段。
 */

    worldRuntimeMetricsService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeInstanceTickOrchestrationService 参数说明。
 * @param worldRuntimeMetricsService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(worldRuntimeInstanceTickOrchestrationService, worldRuntimeMetricsService) {
        this.worldRuntimeInstanceTickOrchestrationService = worldRuntimeInstanceTickOrchestrationService;
        this.worldRuntimeMetricsService = worldRuntimeMetricsService;
    }    
    /**
 * tickAll：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    tickAll(deps) {
        return this.advanceFrame(deps, 1000);
    }    
    /**
 * advanceFrame：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @param frameDurationMs 参数说明。
 * @param getInstanceTickSpeed 参数说明。
 * @returns 函数返回值。
 */

    advanceFrame(deps, frameDurationMs = 1000, getInstanceTickSpeed = null) {
        return this.worldRuntimeInstanceTickOrchestrationService.advanceFrame(deps, frameDurationMs, getInstanceTickSpeed);
    }    
    /**
 * recordSyncFlushDuration：执行核心业务逻辑。
 * @param durationMs 参数说明。
 * @returns 函数返回值。
 */

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

export { WorldRuntimeFrameService };
