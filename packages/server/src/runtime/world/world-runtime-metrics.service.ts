// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeMetricsService = void 0;

const common_1 = require("@nestjs/common");

const TICK_METRIC_WINDOW_SIZE = 60;

/** world-runtime metrics state：承接 tick / sync flush 指标状态所有权。 */
let WorldRuntimeMetricsService = class WorldRuntimeMetricsService {
/**
 * lastTickDurationMs：lasttickDurationM相关字段。
 */

    lastTickDurationMs = 0;    
    /**
 * lastSyncFlushDurationMs：lastSyncFlushDurationM相关字段。
 */

    lastSyncFlushDurationMs = 0;    
    /**
 * lastTickPhaseDurations：lasttickPhaseDuration相关字段。
 */

    lastTickPhaseDurations = {
        pendingCommandsMs: 0,
        systemCommandsMs: 0,
        instanceTicksMs: 0,
        transfersMs: 0,
        monsterActionsMs: 0,
        playerAdvanceMs: 0,
    };    
    /**
 * tickDurationHistoryMs：tickDurationHistoryM相关字段。
 */

    tickDurationHistoryMs = [];    
    /**
 * syncFlushDurationHistoryMs：FlushDurationHistoryM相关字段。
 */

    syncFlushDurationHistoryMs = [];    
    /**
 * recordIdleFrame：执行recordIdle帧相关逻辑。
 * @param startedAt 参数说明。
 * @returns 无返回值，直接更新recordIdle帧相关状态。
 */

    recordIdleFrame(startedAt) {
        this.lastTickPhaseDurations = {
            pendingCommandsMs: 0,
            systemCommandsMs: 0,
            instanceTicksMs: 0,
            transfersMs: 0,
            monsterActionsMs: 0,
            playerAdvanceMs: 0,
        };
        this.lastTickDurationMs = roundDurationMs(performance.now() - startedAt);
        pushDurationMetric(this.tickDurationHistoryMs, this.lastTickDurationMs);
    }    
    /**
 * recordFrameResult：执行record帧结果相关逻辑。
 * @param startedAt 参数说明。
 * @param phaseDurations 参数说明。
 * @returns 无返回值，直接更新record帧结果相关状态。
 */

    recordFrameResult(startedAt, phaseDurations) {
        this.lastTickPhaseDurations = {
            pendingCommandsMs: roundDurationMs(phaseDurations.pendingCommandsMs),
            systemCommandsMs: roundDurationMs(phaseDurations.systemCommandsMs),
            instanceTicksMs: roundDurationMs(phaseDurations.instanceTicksMs),
            transfersMs: roundDurationMs(phaseDurations.transfersMs),
            monsterActionsMs: roundDurationMs(phaseDurations.monsterActionsMs),
            playerAdvanceMs: roundDurationMs(phaseDurations.playerAdvanceMs),
        };
        this.lastTickDurationMs = roundDurationMs(performance.now() - startedAt);
        pushDurationMetric(this.tickDurationHistoryMs, this.lastTickDurationMs);
    }    
    /**
 * recordSyncFlushDuration：处理record同步刷新耗时并更新相关状态。
 * @param durationMs 参数说明。
 * @returns 无返回值，直接更新recordSyncFlushDuration相关状态。
 */

    recordSyncFlushDuration(durationMs) {
        this.lastSyncFlushDurationMs = roundDurationMs(durationMs);
        pushDurationMetric(this.syncFlushDurationHistoryMs, this.lastSyncFlushDurationMs);
    }
};
exports.WorldRuntimeMetricsService = WorldRuntimeMetricsService;
exports.WorldRuntimeMetricsService = WorldRuntimeMetricsService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeMetricsService);
/**
 * roundDurationMs：执行round耗时M相关逻辑。
 * @param value 参数说明。
 * @returns 无返回值，直接更新roundDurationM相关状态。
 */


function roundDurationMs(value) {
    return Math.round(value * 1000) / 1000;
}
/**
 * pushDurationMetric：处理耗时Metric并更新相关状态。
 * @param history 参数说明。
 * @param value 参数说明。
 * @returns 无返回值，直接更新DurationMetric相关状态。
 */


function pushDurationMetric(history, value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    history.push(value);
    if (history.length > TICK_METRIC_WINDOW_SIZE) {
        history.splice(0, history.length - TICK_METRIC_WINDOW_SIZE);
    }
}

export { WorldRuntimeMetricsService };
