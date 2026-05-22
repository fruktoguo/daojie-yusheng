/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * WorldSyncService flush 性能分解采样类型与辅助函数。
 * 从 world-sync.service.ts 提取，降低主文件行数。
 */

export interface SyncFlushBreakdownSample {
    playerCount: number;
    processedPlayerCount: number;
    skippedPlayerCount: number;
    getSocketMs: number;
    getSocketCount: number;
    getViewMs: number;
    getViewCount: number;
    roomSyncMs: number;
    roomSyncCount: number;
    contextActionsMs: number;
    contextActionsCount: number;
    playerStateMs: number;
    playerStateCount: number;
    envelopeMs: number;
    envelopeCount: number;
    auxSyncMs: number;
    auxSyncCount: number;
    emitEnvelopeMs: number;
    emitEnvelopeCount: number;
    questSyncMs: number;
    questSyncCount: number;
    runtimeEventsMs: number;
    runtimeEventsCount: number;
    statisticRecordsMs: number;
    statisticRecordsCount: number;
    clearCachesMs: number;
    clearCachesCount: number;
}

export function createSyncFlushBreakdownSample(): SyncFlushBreakdownSample {
    return {
        playerCount: 0,
        processedPlayerCount: 0,
        skippedPlayerCount: 0,
        getSocketMs: 0,
        getSocketCount: 0,
        getViewMs: 0,
        getViewCount: 0,
        roomSyncMs: 0,
        roomSyncCount: 0,
        contextActionsMs: 0,
        contextActionsCount: 0,
        playerStateMs: 0,
        playerStateCount: 0,
        envelopeMs: 0,
        envelopeCount: 0,
        auxSyncMs: 0,
        auxSyncCount: 0,
        emitEnvelopeMs: 0,
        emitEnvelopeCount: 0,
        questSyncMs: 0,
        questSyncCount: 0,
        runtimeEventsMs: 0,
        runtimeEventsCount: 0,
        statisticRecordsMs: 0,
        statisticRecordsCount: 0,
        clearCachesMs: 0,
        clearCachesCount: 0,
    };
}

export type SyncFlushDurationKey = keyof Pick<SyncFlushBreakdownSample,
    | 'getSocketMs'
    | 'getViewMs'
    | 'roomSyncMs'
    | 'contextActionsMs'
    | 'playerStateMs'
    | 'envelopeMs'
    | 'auxSyncMs'
    | 'emitEnvelopeMs'
    | 'questSyncMs'
    | 'runtimeEventsMs'
    | 'statisticRecordsMs'
    | 'clearCachesMs'>;

export type SyncFlushCountKey = keyof Pick<SyncFlushBreakdownSample,
    | 'roomSyncCount'
    | 'contextActionsCount'
    | 'playerStateCount'
    | 'envelopeCount'
    | 'auxSyncCount'
    | 'emitEnvelopeCount'
    | 'questSyncCount'
    | 'runtimeEventsCount'
    | 'statisticRecordsCount'>;

export function addSyncFlushDuration(
    breakdown: SyncFlushBreakdownSample | undefined,
    key: SyncFlushDurationKey,
    startedAt: number,
): void {
    if (!breakdown) {
        return;
    }
    breakdown[key] += performance.now() - startedAt;
}

export function incrementSyncFlushCount(
    breakdown: SyncFlushBreakdownSample | undefined,
    key: SyncFlushCountKey,
): void {
    if (!breakdown) {
        return;
    }
    breakdown[key] += 1;
}

export function runMeasuredSyncFlushStep<T>(
    breakdown: SyncFlushBreakdownSample | undefined,
    durationKey: SyncFlushDurationKey,
    countKey: SyncFlushCountKey,
    step: () => T,
): T {
    const startedAt = performance.now();
    const result = step();
    addSyncFlushDuration(breakdown, durationKey, startedAt);
    incrementSyncFlushCount(breakdown, countKey);
    return result;
}

export function runMeasuredAuxSync<T>(
    breakdown: SyncFlushBreakdownSample | undefined,
    step: () => T,
): T {
    return runMeasuredSyncFlushStep(breakdown, 'auxSyncMs', 'auxSyncCount', step);
}
