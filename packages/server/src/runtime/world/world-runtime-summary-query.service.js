"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeSummaryQueryService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const {
    summarizeDurations,
} = world_runtime_normalization_helpers_1;

/** 世界运行时摘要查询服务：承接只读 summary payload 构造。 */
let WorldRuntimeSummaryQueryService = class WorldRuntimeSummaryQueryService {
    buildRuntimeSummary(input) {
        return {
            tick: input.tick,
            lastTickDurationMs: input.lastTickDurationMs,
            lastSyncFlushDurationMs: input.lastSyncFlushDurationMs,
            mapTemplateCount: input.mapTemplateCount,
            instanceCount: input.instances.length,
            playerCount: input.playerCount,
            pendingCommandCount: input.pendingCommandCount,
            pendingSystemCommandCount: input.pendingSystemCommandCount,
            tickPerf: {
                totalMs: summarizeDurations(input.lastTickDurationMs, input.tickDurationHistoryMs),
                syncFlushMs: summarizeDurations(input.lastSyncFlushDurationMs, input.syncFlushDurationHistoryMs),
                phases: input.lastTickPhaseDurations,
            },
            instances: input.instances,
        };
    }
};
exports.WorldRuntimeSummaryQueryService = WorldRuntimeSummaryQueryService;
exports.WorldRuntimeSummaryQueryService = WorldRuntimeSummaryQueryService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeSummaryQueryService);
