import { Inject, Injectable } from '@nestjs/common';
import { S2C } from '@mud/shared';
import { RuntimeGmStateService } from '../runtime/gm/runtime-gm-state.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldSyncQuestLootService } from './world-sync-quest-loot.service';
import { WorldSyncProtocolService } from './world-sync-protocol.service';
import { WorldSyncAuxStateService } from './world-sync-aux-state.service';
import { WorldSyncEnvelopeService } from './world-sync-envelope.service';
import { WorldSessionService } from './world-session.service';

interface SyncFlushBreakdownSample {
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

@Injectable()
export class WorldSyncService {
    constructor(
        @Inject(WorldRuntimeService) private readonly worldRuntimeService: any,
        @Inject(PlayerRuntimeService) private readonly playerRuntimeService: any,
        @Inject(WorldSessionService) private readonly worldSessionService: any,
        @Inject(WorldSyncQuestLootService) private readonly worldSyncQuestLootService: any,
        @Inject(WorldSyncProtocolService) private readonly worldSyncProtocolService: any,
        @Inject(WorldSyncAuxStateService) private readonly worldSyncAuxStateService: any,
        @Inject(WorldSyncEnvelopeService) private readonly worldSyncEnvelopeService: any,
        @Inject(RuntimeGmStateService) private readonly runtimeGmStateService: any,
    ) {}

    emitInitialSync(playerId: string, socketOverride = undefined) {
        const binding = this.worldSessionService.getBinding(playerId);
        if (!binding) return;
        const socket = socketOverride ?? this.worldSessionService.getSocketByPlayerId(playerId);
        const view = this.worldRuntimeService.getPlayerView(playerId);
        if (!socket || !view) return;
        this.syncPlayerInstanceRoom(binding.playerId, view);
        this.worldRuntimeService.refreshPlayerContextActions(playerId, view);
        const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);
        const envelope = this.worldSyncEnvelopeService.createInitialEnvelope(playerId, binding, view, player);
        this.emitEnvelope(socket, envelope);
        this.emitAuxInitialSync(binding.playerId, socket, view, player);
        this.worldSyncQuestLootService.emitQuestSync(socket, binding.playerId, player.quests.revision);
        this.emitPendingInitialNotices(binding.playerId, socket);
        this.emitPendingPlayerStatisticRecords(binding.playerId, socket);
    }

    emitDeltaSync(playerId: string, socketOverride = undefined) {
        const binding = this.worldSessionService.getBinding(playerId);
        if (!binding) return;
        const socket = socketOverride ?? this.worldSessionService.getSocketByPlayerId(playerId);
        const view = this.worldRuntimeService.getPlayerView(playerId);
        if (!socket || !view) return;
        this.syncDeltaForPlayer(binding.playerId, binding.sessionId, socket, view);
    }

    flushConnectedPlayers() {
        const breakdown = createSyncFlushBreakdownSample();
        try {
            const clearCachesStartedAt = performance.now();
            this.clearPurgedPlayerCaches();
            addSyncFlushDuration(breakdown, 'clearCachesMs', clearCachesStartedAt);
            breakdown.clearCachesCount += 1;

            const bindings = this.worldSessionService.listBindings();
            breakdown.playerCount = Array.isArray(bindings) ? bindings.length : 0;
            for (const binding of bindings) {
                const getSocketStartedAt = performance.now();
                const socket = this.worldSessionService.getSocketByPlayerId(binding.playerId);
                addSyncFlushDuration(breakdown, 'getSocketMs', getSocketStartedAt);
                breakdown.getSocketCount += 1;

                const getViewStartedAt = performance.now();
                const view = this.worldRuntimeService.getPlayerView(binding.playerId);
                addSyncFlushDuration(breakdown, 'getViewMs', getViewStartedAt);
                breakdown.getViewCount += 1;

                if (!socket || !view) {
                    breakdown.skippedPlayerCount += 1;
                    continue;
                }
                breakdown.processedPlayerCount += 1;
                this.syncDeltaForPlayer(binding.playerId, binding.sessionId, socket, view, breakdown);
            }
        } finally {
            this.runtimeGmStateService?.recordSyncFlushBreakdown?.(breakdown);
        }
    }

    emitEnvelope(socket: any, envelope: any) {
        this.worldSyncProtocolService.sendEnvelope(socket, envelope);
    }

    clearDetachedPlayerCaches(playerId: string) {
        this.clearPlayerCaches(playerId, true);
    }

    unloadDetachedPlayerRuntime(
        playerId: string,
        options: { allowOfflineHangingDemotion?: boolean; reason?: string } = {},
    ): boolean {
        if (options.allowOfflineHangingDemotion !== true) {
            return false;
        }
        if (typeof this.playerRuntimeService.canUnloadDetachedPlayerRuntime === 'function'
            && !this.playerRuntimeService.canUnloadDetachedPlayerRuntime(playerId)) {
            return false;
        }
        if (typeof this.worldRuntimeService.worldRuntimePlayerSessionService?.disconnectPlayer === 'function') {
            this.worldRuntimeService.worldRuntimePlayerSessionService.disconnectPlayer(playerId, this.worldRuntimeService);
        }
        if (typeof this.playerRuntimeService.removePlayerRuntime === 'function') {
            this.playerRuntimeService.removePlayerRuntime(playerId);
            return true;
        }
        return false;
    }

    emitLootWindowUpdate(playerId: string) {
        this.worldSyncQuestLootService.emitLootWindowUpdate(playerId);
    }

    openLootWindow(playerId: string, x: number, y: number) {
        return this.worldSyncQuestLootService.openLootWindow(playerId, x, y);
    }

    private syncDeltaForPlayer(playerId: string, sessionId: string, socket: any, view: any, breakdown?: SyncFlushBreakdownSample) {
        const roomStartedAt = performance.now();
        this.syncPlayerInstanceRoom(playerId, view);
        addSyncFlushDuration(breakdown, 'roomSyncMs', roomStartedAt);
        incrementSyncFlushCount(breakdown, 'roomSyncCount');

        const contextStartedAt = performance.now();
        this.worldRuntimeService.refreshPlayerContextActions(playerId, view);
        addSyncFlushDuration(breakdown, 'contextActionsMs', contextStartedAt);
        incrementSyncFlushCount(breakdown, 'contextActionsCount');

        const playerStartedAt = performance.now();
        const player = this.playerRuntimeService.syncFromWorldView(playerId, sessionId, view);
        addSyncFlushDuration(breakdown, 'playerStateMs', playerStartedAt);
        incrementSyncFlushCount(breakdown, 'playerStateCount');

        const envelopeStartedAt = performance.now();
        const envelope = this.worldSyncEnvelopeService.createDeltaEnvelope(playerId, view, player);
        addSyncFlushDuration(breakdown, 'envelopeMs', envelopeStartedAt);
        incrementSyncFlushCount(breakdown, 'envelopeCount');

        const firstAuxStartedAt = performance.now();
        const auxEmittedBeforeEnvelope = this.emitAuxDeltaSync(playerId, socket, view, player, { deferMapChanged: true });
        addSyncFlushDuration(breakdown, 'auxSyncMs', firstAuxStartedAt);
        incrementSyncFlushCount(breakdown, 'auxSyncCount');

        const emitStartedAt = performance.now();
        this.emitEnvelope(socket, envelope);
        addSyncFlushDuration(breakdown, 'emitEnvelopeMs', emitStartedAt);
        incrementSyncFlushCount(breakdown, 'emitEnvelopeCount');

        if (!auxEmittedBeforeEnvelope) {
            const secondAuxStartedAt = performance.now();
            this.emitAuxDeltaSync(playerId, socket, view, player);
            addSyncFlushDuration(breakdown, 'auxSyncMs', secondAuxStartedAt);
            incrementSyncFlushCount(breakdown, 'auxSyncCount');
        }
        const questStartedAt = performance.now();
        this.worldSyncQuestLootService.emitQuestSyncIfChanged(socket, playerId, player.quests.revision);
        addSyncFlushDuration(breakdown, 'questSyncMs', questStartedAt);
        incrementSyncFlushCount(breakdown, 'questSyncCount');

        const eventsStartedAt = performance.now();
        this.emitPendingRuntimeEvents(playerId, socket, envelope);
        addSyncFlushDuration(breakdown, 'runtimeEventsMs', eventsStartedAt);
        incrementSyncFlushCount(breakdown, 'runtimeEventsCount');

        const recordsStartedAt = performance.now();
        this.emitPendingPlayerStatisticRecords(playerId, socket);
        addSyncFlushDuration(breakdown, 'statisticRecordsMs', recordsStartedAt);
        incrementSyncFlushCount(breakdown, 'statisticRecordsCount');
    }

    private clearPurgedPlayerCaches() {
        const purgedPlayerIds = this.worldSessionService.consumePurgedPlayerIds();
        for (const playerId of purgedPlayerIds) {
            this.clearPlayerCaches(playerId, false);
        }
    }

    private clearPlayerCaches(playerId: string, detachRuntimeSession: boolean) {
        this.worldSyncEnvelopeService.clearPlayerCache(playerId);
        if (detachRuntimeSession) {
            this.playerRuntimeService.detachSession(playerId);
        }
        this.worldSyncQuestLootService.clearPlayerCache(playerId);
        this.worldSyncAuxStateService.clearPlayerCache(playerId);
    }

    private emitAuxInitialSync(playerId: string, socket: any, view: any, player: any) {
        this.worldSyncAuxStateService.emitAuxInitialSync(playerId, socket, view, player);
    }

    private emitAuxDeltaSync(playerId: string, socket: any, view: any, player: any, options: any = undefined) {
        return this.worldSyncAuxStateService.emitAuxDeltaSync(playerId, socket, view, player, options);
    }

    private emitPendingRuntimeEvents(playerId: string, socket: any, envelope: any) {
        if (envelope?.gmStatePush) {
            this.runtimeGmStateService.emitState(socket);
        }
        if (envelope?.worldDelta?.eventBus) {
            return;
        }
        const items = this.playerRuntimeService.drainNotices(playerId);
        if (items.length > 0) {
            this.worldSyncProtocolService.sendNotices(socket, items);
        }
    }

    private emitPendingInitialNotices(playerId: string, socket: any) {
        const items = this.playerRuntimeService.drainNotices(playerId);
        if (items.length > 0) {
            this.worldSyncProtocolService.sendNotices(socket, items);
        }
    }

    private emitPendingPlayerStatisticRecords(playerId: string, socket: any) {
        const records = typeof this.playerRuntimeService.getPendingPlayerStatisticRecords === 'function'
            ? this.playerRuntimeService.getPendingPlayerStatisticRecords(playerId) : [];
        const totals = typeof this.playerRuntimeService.consumePlayerStatisticTotalsForEmit === 'function'
            ? this.playerRuntimeService.consumePlayerStatisticTotalsForEmit(playerId) : null;
        if (typeof socket?.emit !== 'function') return;
        if ((!Array.isArray(records) || records.length === 0) && !totals) return;
        socket.emit(S2C.OfflineGainReports, { reports: Array.isArray(records) ? records : [], ...(totals ? { totals } : {}) });
    }

    private syncPlayerInstanceRoom(playerId: string, view: any) {
        const instanceId = typeof view?.instance?.instanceId === 'string' ? view.instance.instanceId : null;
        if (typeof this.worldSessionService?.syncPlayerInstanceRoom === 'function') this.worldSessionService.syncPlayerInstanceRoom(playerId, instanceId);
    }

    handleReportMinimapVersions(socket: any, playerId: string, clientVersions: Record<string, number>): void {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (player) this.worldSyncAuxStateService.handleReportMinimapVersions(socket, player, clientVersions);
    }
}

function createSyncFlushBreakdownSample(): SyncFlushBreakdownSample {
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

function addSyncFlushDuration(
    breakdown: SyncFlushBreakdownSample | undefined,
    key: keyof Pick<SyncFlushBreakdownSample,
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
        | 'clearCachesMs'>,
    startedAt: number,
): void {
    if (!breakdown) {
        return;
    }
    breakdown[key] += performance.now() - startedAt;
}

function incrementSyncFlushCount(
    breakdown: SyncFlushBreakdownSample | undefined,
    key: keyof Pick<SyncFlushBreakdownSample,
        | 'roomSyncCount'
        | 'contextActionsCount'
        | 'playerStateCount'
        | 'envelopeCount'
        | 'auxSyncCount'
        | 'emitEnvelopeCount'
        | 'questSyncCount'
        | 'runtimeEventsCount'
        | 'statisticRecordsCount'>,
): void {
    if (!breakdown) {
        return;
    }
    breakdown[key] += 1;
}
