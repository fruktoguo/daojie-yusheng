/**
 * 本文件属于世界运行时查询层，负责把权威状态整理为只读视图。
 *
 * 维护时应避免查询路径产生副作用，并控制返回字段，防止高频同步带出完整大对象。
 */
import { Injectable } from '@nestjs/common';
import * as world_runtime_normalization_helpers_1 from '../world-runtime.normalization.helpers';

const {
    summarizeDurations,
} = world_runtime_normalization_helpers_1;

/** 世界运行时摘要查询服务：承接只读 summary payload 构造。 */
@Injectable()
export class WorldRuntimeSummaryQueryService {
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
            leaseDegradedInstanceCount: countInstancesByRuntimeStatus(input.instances, 'lease_degraded'),
            fencedInstanceCount: countInstancesByRuntimeStatus(input.instances, 'fenced'),
            quarantineInstanceCount: countQuarantineInstances(input.instances),
            quarantineInstances: buildQuarantineInstances(input.instances),
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

function countInstancesByRuntimeStatus(instances, runtimeStatus) {
    if (!Array.isArray(instances)) {
        return 0;
    }
    let count = 0;
    for (const instance of instances) {
        if (instance?.runtimeStatus === runtimeStatus) {
            count += 1;
        }
    }
    return count;
}

function countQuarantineInstances(instances) {
    return buildQuarantineInstances(instances, Number.POSITIVE_INFINITY).length;
}

function buildQuarantineInstances(instances, limit = 25) {
    if (!Array.isArray(instances)) {
        return [];
    }
    const items = [];
    for (const instance of instances) {
        const runtimeStatus = typeof instance?.runtimeStatus === 'string' ? instance.runtimeStatus.trim() : '';
        if (!isQuarantineRuntimeStatus(runtimeStatus)) {
            continue;
        }
        items.push({
            instanceId: typeof instance?.instanceId === 'string' ? instance.instanceId : '',
            templateId: typeof instance?.templateId === 'string' ? instance.templateId : null,
            kind: typeof instance?.kind === 'string' ? instance.kind : null,
            status: typeof instance?.status === 'string' ? instance.status : null,
            runtimeStatus,
            reason: runtimeStatus === 'lease_degraded' ? 'lease_degraded' : runtimeStatus === 'fenced' ? 'lease_fenced' : runtimeStatus,
            playerCount: normalizeCount(instance?.playerCount),
        });
        if (items.length >= limit) {
            break;
        }
    }
    return items;
}

function isQuarantineRuntimeStatus(runtimeStatus) {
    return runtimeStatus === 'fenced'
        || runtimeStatus === 'lease_degraded'
        || runtimeStatus === 'template_missing';
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
