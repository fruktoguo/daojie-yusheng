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
    envelopeContainerProjectionMs: number;
    envelopeContainerProjectionCount: number;
    envelopeProjectorMs: number;
    envelopeProjectorCount: number;
    envelopeEventBusMs: number;
    envelopeEventBusCount: number;
    projectorIdentityMs: number;
    projectorIdentityCount: number;
    projectorWorldMs: number;
    projectorWorldCount: number;
    projectorSelfMs: number;
    projectorSelfCount: number;
    projectorPanelMs: number;
    projectorPanelCount: number;
    projectorPanelAttrCheckMs: number;
    projectorPanelAttrCheckCount: number;
    projectorPanelBuffProjectionMs: number;
    projectorPanelBuffProjectionCount: number;
    projectorPanelCursorMs: number;
    projectorPanelCursorCount: number;
    projectorPanelAttrSliceMs: number;
    projectorPanelAttrSliceCount: number;
    projectorPanelActionSliceMs: number;
    projectorPanelActionSliceCount: number;
    projectorPanelDeltaMs: number;
    projectorPanelDeltaCount: number;
    projectorPanelTechniqueMs: number;
    projectorPanelTechniqueCount: number;
    projectorCacheMs: number;
    projectorCacheCount: number;
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
    contextActionsCacheHitCount: number;
    envelopeNoopCount: number;
    envelopeWorldDeltaCount: number;
    envelopeSelfDeltaCount: number;
    envelopePanelDeltaCount: number;
    envelopeEventCount: number;
    projectorFullRebuildCount: number;
    projectorWorldReuseCount: number;
    projectorWorldCaptureCount: number;
    projectorPanelAttrNoneCount: number;
    projectorPanelAttrRealmProgressCount: number;
    projectorPanelAttrFullCount: number;
    projectorPanelActionReuseCount: number;
    projectorPanelInventoryDeltaCount: number;
    projectorPanelEquipmentDeltaCount: number;
    projectorPanelArtifactDeltaCount: number;
    projectorPanelTechniqueDeltaCount: number;
    projectorPanelAttrDeltaCount: number;
    projectorPanelActionDeltaCount: number;
    projectorPanelBuffDeltaCount: number;
    projectorPanelTechniqueEntryCount: number;
    projectorPanelActionEntryCount: number;
    projectorPanelBuffEntryCount: number;
    auxDeferredCount: number;
    auxNoopCount: number;
    auxMapCacheHitCount: number;
    auxMapDirtyDiffCount: number;
    auxMapRebuildCount: number;
    auxMapChangedCount: number;
    auxMapPatchCount: number;
    auxMapDirtyTileCount: number;
    auxMapVisibleDirtyTileCount: number;
    auxMapTilePatchEntryCount: number;
    auxMapDirtyProjectionNoopCount: number;
    auxTimeChangedCount: number;
    auxRealmChangedCount: number;
    auxLootChangedCount: number;
    auxThreatChangedCount: number;
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
        envelopeContainerProjectionMs: 0,
        envelopeContainerProjectionCount: 0,
        envelopeProjectorMs: 0,
        envelopeProjectorCount: 0,
        envelopeEventBusMs: 0,
        envelopeEventBusCount: 0,
        projectorIdentityMs: 0,
        projectorIdentityCount: 0,
        projectorWorldMs: 0,
        projectorWorldCount: 0,
        projectorSelfMs: 0,
        projectorSelfCount: 0,
        projectorPanelMs: 0,
        projectorPanelCount: 0,
        projectorPanelAttrCheckMs: 0,
        projectorPanelAttrCheckCount: 0,
        projectorPanelBuffProjectionMs: 0,
        projectorPanelBuffProjectionCount: 0,
        projectorPanelCursorMs: 0,
        projectorPanelCursorCount: 0,
        projectorPanelAttrSliceMs: 0,
        projectorPanelAttrSliceCount: 0,
        projectorPanelActionSliceMs: 0,
        projectorPanelActionSliceCount: 0,
        projectorPanelDeltaMs: 0,
        projectorPanelDeltaCount: 0,
        projectorPanelTechniqueMs: 0,
        projectorPanelTechniqueCount: 0,
        projectorCacheMs: 0,
        projectorCacheCount: 0,
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
        contextActionsCacheHitCount: 0,
        envelopeNoopCount: 0,
        envelopeWorldDeltaCount: 0,
        envelopeSelfDeltaCount: 0,
        envelopePanelDeltaCount: 0,
        envelopeEventCount: 0,
        projectorFullRebuildCount: 0,
        projectorWorldReuseCount: 0,
        projectorWorldCaptureCount: 0,
        projectorPanelAttrNoneCount: 0,
        projectorPanelAttrRealmProgressCount: 0,
        projectorPanelAttrFullCount: 0,
        projectorPanelActionReuseCount: 0,
        projectorPanelInventoryDeltaCount: 0,
        projectorPanelEquipmentDeltaCount: 0,
        projectorPanelArtifactDeltaCount: 0,
        projectorPanelTechniqueDeltaCount: 0,
        projectorPanelAttrDeltaCount: 0,
        projectorPanelActionDeltaCount: 0,
        projectorPanelBuffDeltaCount: 0,
        projectorPanelTechniqueEntryCount: 0,
        projectorPanelActionEntryCount: 0,
        projectorPanelBuffEntryCount: 0,
        auxDeferredCount: 0,
        auxNoopCount: 0,
        auxMapCacheHitCount: 0,
        auxMapDirtyDiffCount: 0,
        auxMapRebuildCount: 0,
        auxMapChangedCount: 0,
        auxMapPatchCount: 0,
        auxMapDirtyTileCount: 0,
        auxMapVisibleDirtyTileCount: 0,
        auxMapTilePatchEntryCount: 0,
        auxMapDirtyProjectionNoopCount: 0,
        auxTimeChangedCount: 0,
        auxRealmChangedCount: 0,
        auxLootChangedCount: 0,
        auxThreatChangedCount: 0,
    };
}

export type SyncFlushDurationKey = keyof Pick<SyncFlushBreakdownSample,
    | 'getSocketMs'
    | 'getViewMs'
    | 'roomSyncMs'
    | 'contextActionsMs'
    | 'playerStateMs'
    | 'envelopeMs'
    | 'envelopeContainerProjectionMs'
    | 'envelopeProjectorMs'
    | 'envelopeEventBusMs'
    | 'projectorIdentityMs'
    | 'projectorWorldMs'
    | 'projectorSelfMs'
    | 'projectorPanelMs'
    | 'projectorPanelAttrCheckMs'
    | 'projectorPanelBuffProjectionMs'
    | 'projectorPanelCursorMs'
    | 'projectorPanelAttrSliceMs'
    | 'projectorPanelActionSliceMs'
    | 'projectorPanelDeltaMs'
    | 'projectorPanelTechniqueMs'
    | 'projectorCacheMs'
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
    | 'envelopeContainerProjectionCount'
    | 'envelopeProjectorCount'
    | 'envelopeEventBusCount'
    | 'projectorIdentityCount'
    | 'projectorWorldCount'
    | 'projectorSelfCount'
    | 'projectorPanelCount'
    | 'projectorPanelAttrCheckCount'
    | 'projectorPanelBuffProjectionCount'
    | 'projectorPanelCursorCount'
    | 'projectorPanelAttrSliceCount'
    | 'projectorPanelActionSliceCount'
    | 'projectorPanelDeltaCount'
    | 'projectorPanelTechniqueCount'
    | 'projectorCacheCount'
    | 'auxSyncCount'
    | 'emitEnvelopeCount'
    | 'questSyncCount'
    | 'runtimeEventsCount'
    | 'statisticRecordsCount'
    | 'contextActionsCacheHitCount'
    | 'envelopeNoopCount'
    | 'envelopeWorldDeltaCount'
    | 'envelopeSelfDeltaCount'
    | 'envelopePanelDeltaCount'
    | 'envelopeEventCount'
    | 'projectorFullRebuildCount'
    | 'projectorWorldReuseCount'
    | 'projectorWorldCaptureCount'
    | 'projectorPanelAttrNoneCount'
    | 'projectorPanelAttrRealmProgressCount'
    | 'projectorPanelAttrFullCount'
    | 'projectorPanelActionReuseCount'
    | 'projectorPanelInventoryDeltaCount'
    | 'projectorPanelEquipmentDeltaCount'
    | 'projectorPanelArtifactDeltaCount'
    | 'projectorPanelTechniqueDeltaCount'
    | 'projectorPanelAttrDeltaCount'
    | 'projectorPanelActionDeltaCount'
    | 'projectorPanelBuffDeltaCount'
    | 'projectorPanelTechniqueEntryCount'
    | 'projectorPanelActionEntryCount'
    | 'projectorPanelBuffEntryCount'
    | 'auxDeferredCount'
    | 'auxNoopCount'
    | 'auxMapCacheHitCount'
    | 'auxMapDirtyDiffCount'
    | 'auxMapRebuildCount'
    | 'auxMapChangedCount'
    | 'auxMapPatchCount'
    | 'auxMapDirtyTileCount'
    | 'auxMapVisibleDirtyTileCount'
    | 'auxMapTilePatchEntryCount'
    | 'auxMapDirtyProjectionNoopCount'
    | 'auxTimeChangedCount'
    | 'auxRealmChangedCount'
    | 'auxLootChangedCount'
    | 'auxThreatChangedCount'>;

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
    amount = 1,
): void {
    const normalizedAmount = Math.max(0, Math.trunc(Number(amount) || 0));
    if (!breakdown || normalizedAmount <= 0) {
        return;
    }
    breakdown[key] += normalizedAmount;
}

export function recordSyncEnvelopeDetail(
    breakdown: SyncFlushBreakdownSample | undefined,
    envelope: any,
): void {
    if (!envelope) {
        incrementSyncFlushCount(breakdown, 'envelopeNoopCount');
        return;
    }
    if (envelope.worldDelta) {
        incrementSyncFlushCount(breakdown, 'envelopeWorldDeltaCount');
    }
    if (envelope.selfDelta) {
        incrementSyncFlushCount(breakdown, 'envelopeSelfDeltaCount');
    }
    if (envelope.panelDelta) {
        incrementSyncFlushCount(breakdown, 'envelopePanelDeltaCount');
    }
    if (envelope.gmStatePush || envelope.worldDelta?.fx || envelope.worldDelta?.eventBus) {
        incrementSyncFlushCount(breakdown, 'envelopeEventCount');
    }
}

export function runMeasuredSyncFlushStep<T>(
    breakdown: SyncFlushBreakdownSample | undefined,
    durationKey: SyncFlushDurationKey,
    countKey: SyncFlushCountKey,
    step: () => T,
): T {
    if (!breakdown) {
        return step();
    }
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
