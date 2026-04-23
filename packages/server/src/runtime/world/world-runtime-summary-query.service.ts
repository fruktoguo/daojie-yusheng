// @ts-nocheck
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
/**
 * buildRuntimeSummary：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 无返回值，直接更新运行态摘要相关状态。
 */

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
            dirtyBacklog: normalizeDirtyBacklog(input.dirtyBacklog),
            recoveryQueue: normalizeSummaryObject(input.recoveryQueue),
            flushWakeup: normalizeSummaryObject(input.flushWakeup),
            tickPerf: {
                totalMs: summarizeDurations(input.lastTickDurationMs, input.tickDurationHistoryMs),
                syncFlushMs: summarizeDurations(input.lastSyncFlushDurationMs, input.syncFlushDurationHistoryMs),
                phases: input.lastTickPhaseDurations,
                phaseSummaries: summarizePhaseDurations(input.tickPhaseDurationHistoryMs),
            },
            instances: input.instances,
        };
    }
};
exports.WorldRuntimeSummaryQueryService = WorldRuntimeSummaryQueryService;
exports.WorldRuntimeSummaryQueryService = WorldRuntimeSummaryQueryService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeSummaryQueryService);

function summarizePhaseDurations(historyByKey) {
    if (!historyByKey || typeof historyByKey !== 'object') {
        return {};
    }

    const summaries = {};
    for (const [key, history] of Object.entries(historyByKey)) {
        if (!Array.isArray(history)) {
            continue;
        }
        let total = 0;
        let max = 0;
        let nonZeroCount = 0;
        for (const rawValue of history) {
            const value = Number(rawValue) || 0;
            total += value;
            if (value > max) {
                max = value;
            }
            if (value > 0) {
                nonZeroCount += 1;
            }
        }
        summaries[key] = {
            count: nonZeroCount,
            sampleCount: history.length,
            totalMs: roundDurationMs(total),
            avgMs: nonZeroCount > 0 ? roundDurationMs(total / nonZeroCount) : 0,
            maxMs: roundDurationMs(max),
        };
    }
    return summaries;
}

function roundDurationMs(value) {
    return Math.round(value * 1000) / 1000;
}

function normalizeDirtyBacklog(input) {
    if (!input || typeof input !== 'object') {
        return {
            players: 0,
            playerDomains: 0,
            instances: 0,
        };
    }
    return {
        players: normalizeCount(input.players),
        playerDomains: normalizeCount(input.playerDomains),
        instances: normalizeCount(input.instances),
    };
}

function normalizeSummaryObject(input) {
    if (!input || typeof input !== 'object') {
        return {
            concurrency: 0,
            inFlight: 0,
            queued: 0,
            keys: [],
        };
    }
    return {
        concurrency: normalizeCount(input.concurrency),
        inFlight: normalizeCount(input.inFlight),
        queued: normalizeCount(input.queued),
        keys: Array.isArray(input.keys) ? input.keys.filter((entry) => typeof entry === 'string' && entry.trim()) : [],
    };
}

function normalizeCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.max(0, Math.trunc(parsed));
}

export { WorldRuntimeSummaryQueryService };
