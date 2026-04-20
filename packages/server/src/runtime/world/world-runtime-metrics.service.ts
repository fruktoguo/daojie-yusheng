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
 * lastTickDurationMs：对象字段。
 */

    lastTickDurationMs = 0;    
    /**
 * lastSyncFlushDurationMs：对象字段。
 */

    lastSyncFlushDurationMs = 0;    
    /**
 * lastTickPhaseDurations：对象字段。
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
 * tickDurationHistoryMs：对象字段。
 */

    tickDurationHistoryMs = [];    
    /**
 * syncFlushDurationHistoryMs：对象字段。
 */

    syncFlushDurationHistoryMs = [];    
    /**
 * recordIdleFrame：执行核心业务逻辑。
 * @param startedAt 参数说明。
 * @returns 函数返回值。
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
 * recordFrameResult：执行核心业务逻辑。
 * @param startedAt 参数说明。
 * @param phaseDurations 参数说明。
 * @returns 函数返回值。
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
 * recordSyncFlushDuration：执行核心业务逻辑。
 * @param durationMs 参数说明。
 * @returns 函数返回值。
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
 * roundDurationMs：执行核心业务逻辑。
 * @param value 参数说明。
 * @returns 函数返回值。
 */


function roundDurationMs(value) {
    return Math.round(value * 1000) / 1000;
}
/**
 * pushDurationMetric：执行核心业务逻辑。
 * @param history 参数说明。
 * @param value 参数说明。
 * @returns 函数返回值。
 */


function pushDurationMetric(history, value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    history.push(value);
    if (history.length > TICK_METRIC_WINDOW_SIZE) {
        history.splice(0, history.length - TICK_METRIC_WINDOW_SIZE);
    }
}

export { WorldRuntimeMetricsService };
