import { Inject, Injectable, Optional } from '@nestjs/common';
import { RuntimeGmStateService } from '../runtime/gm/runtime-gm-state.service';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldSyncQuestLootService } from './world-sync-quest-loot.service';
import { WorldSyncProtocolService } from './world-sync-protocol.service';
import { WorldSyncAuxStateService } from './world-sync-aux-state.service';
import { WorldSyncEnvelopeService } from './world-sync-envelope.service';
import { WorldSessionService } from './world-session.service';
import { WorldSyncWorkerEncodeService, type PendingEnvelopeEmit } from './world-sync-worker-encode.service';
import { NativePlayerAuthStoreService } from '../http/native/native-player-auth-store.service';
import { type SyncFlushBreakdownSample, createSyncFlushBreakdownSample, addSyncFlushDuration, recordSyncEnvelopeDetail, runMeasuredAuxSync, runMeasuredSyncFlushStep } from './world-sync-flush-breakdown';
import { emitPendingPlayerStatisticRecords } from './world-sync-player-statistic-records';
import { WorldSyncContextActionsCache } from './world-sync-context-actions-cache';
@Injectable()
export class WorldSyncService {
    private readonly contextActionsCache = new WorldSyncContextActionsCache();
    constructor(
        @Inject(WorldRuntimeService) private readonly worldRuntimeService: any,
        @Inject(PlayerRuntimeService) private readonly playerRuntimeService: any,
        @Inject(WorldSessionService) private readonly worldSessionService: any,
        @Inject(WorldSyncQuestLootService) private readonly worldSyncQuestLootService: any,
        @Inject(WorldSyncProtocolService) private readonly worldSyncProtocolService: any,
        @Inject(WorldSyncAuxStateService) private readonly worldSyncAuxStateService: any,
        @Inject(WorldSyncEnvelopeService) private readonly worldSyncEnvelopeService: any,
        @Inject(RuntimeGmStateService) private readonly runtimeGmStateService: any,
        @Optional() @Inject(WorldSyncWorkerEncodeService) private readonly workerEncodeService?: WorldSyncWorkerEncodeService,
        @Optional() @Inject(NativePlayerAuthStoreService) private readonly nativePlayerAuthStoreService?: any,
    ) {}
    emitInitialSync(playerId: string, socketOverride = undefined) {
        const binding = this.worldSessionService.getBinding(playerId);
        if (!binding) return;
        if (this.isOfflineGainBlocking(playerId)) return;
        const socket = socketOverride ?? this.worldSessionService.getSocketByPlayerId(playerId);
        const view = this.worldRuntimeService.getPlayerView(playerId);
        if (!socket || !view) return;
        this.syncPlayerInstanceRoom(binding.playerId, view);
        this.worldRuntimeService.refreshPlayerContextActions(playerId, view);
        this.contextActionsCache.update(playerId, view, this.worldRuntimeService, this.playerRuntimeService);
        const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);
        this.worldSessionService.syncPlayerSectChannel?.(binding.playerId, player?.sectId ?? null);
        const envelope = this.worldSyncEnvelopeService.createInitialEnvelope(playerId, binding, view, player);
        if (envelope.initSession) envelope.initSession.pno = this.nativePlayerAuthStoreService?.getMemoryUserByPlayerId?.(playerId)?.playerNo ?? undefined;
        this.emitEnvelope(socket, envelope);
        this.emitAuxInitialSync(binding.playerId, socket, view, player);
        this.worldSyncQuestLootService.markQuestSyncBaseline(binding.playerId, player.quests.revision);
        this.emitPendingInitialNotices(binding.playerId, socket);
    }
    emitDeltaSync(playerId: string, socketOverride = undefined) {
        const binding = this.worldSessionService.getBinding(playerId);
        if (!binding) return;
        if (this.isOfflineGainBlocking(playerId)) return;
        const socket = socketOverride ?? this.worldSessionService.getSocketByPlayerId(playerId);
        const view = this.worldRuntimeService.getPlayerView(playerId);
        if (!socket || !view) return;
        this.syncDeltaForPlayer(binding.playerId, binding.sessionId, socket, view);
    }
    async flushConnectedPlayers() {
        return this.flushBindings(this.worldSessionService.listBindings());
    }
    /** 只刷新到期实例涉及的玩家，跨图玩家由调用方合并传送前后的集合。 */
    async flushPlayerIds(playerIds: Iterable<string>) {
        return this.flushBindings(this.worldSessionService.listBindingsForPlayerIds(playerIds));
    }

    private async flushBindings(bindings: any[]) {
        const breakdown = createSyncFlushBreakdownSample();
        try {
            const clearCachesStartedAt = performance.now();
            this.clearPurgedPlayerCaches();
            addSyncFlushDuration(breakdown, 'clearCachesMs', clearCachesStartedAt);
            breakdown.clearCachesCount += 1;

            breakdown.playerCount = Array.isArray(bindings) ? bindings.length : 0;

            const pendingEmits: PendingEnvelopeEmit[] = [];
            const useWorkerEncode = this.workerEncodeService?.shouldUseWorkerEncode?.() === true;

            for (const binding of bindings) {
                if (this.isOfflineGainBlocking(binding.playerId)) {
                    breakdown.skippedPlayerCount += 1;
                    continue;
                }
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

                const { envelope, player, auxDeferred } = this.prepareDeltaForPlayer(binding.playerId, binding.sessionId, socket, view, breakdown, true);
                if (useWorkerEncode && envelope) {
                    const playerId = binding.playerId;
                    pendingEmits.push({
                        socket, envelope, playerId, player,
                        postEmitFn: () => this.emitDeltaPostSync(playerId, socket, view, player, envelope, auxDeferred, breakdown),
                    });
                    continue;
                }
                this.emitPreparedDelta(binding.playerId, socket, view, player, envelope, auxDeferred, breakdown);
            }

            if (useWorkerEncode && pendingEmits.length > 0) {
                await this.workerEncodeService?.flushPendingEmitsViaWorker(pendingEmits);
            }
        } finally {
            this.runtimeGmStateService?.recordSyncFlushBreakdown?.(breakdown);
        }
    }

    /** 准备 envelope（不 emit），用于同步和异步编码路径 */
    private prepareDeltaForPlayer(
        playerId: string,
        sessionId: string,
        socket: any,
        view: any,
        breakdown?: SyncFlushBreakdownSample,
        reuseContextActionsWithinTick = false,
    ) {
        runMeasuredSyncFlushStep(breakdown, 'roomSyncMs', 'roomSyncCount', () => this.syncPlayerInstanceRoom(playerId, view));
        this.contextActionsCache.refresh(playerId, view, this.worldRuntimeService, this.playerRuntimeService, breakdown, reuseContextActionsWithinTick);
        const player = runMeasuredSyncFlushStep(breakdown, 'playerStateMs', 'playerStateCount', () => this.playerRuntimeService.syncFromWorldView(playerId, sessionId, view));
        this.worldSessionService.syncPlayerSectChannel?.(playerId, player?.sectId ?? null);
        const envelope = runMeasuredSyncFlushStep(breakdown, 'envelopeMs', 'envelopeCount', () => this.worldSyncEnvelopeService.createDeltaEnvelope(playerId, view, player, breakdown));
        recordSyncEnvelopeDetail(breakdown, envelope);
        const auxSynced = runMeasuredAuxSync(breakdown, () => this.emitAuxDeltaSync(playerId, socket, view, player, {
            deferMapChanged: true,
            breakdown,
        }));
        return { envelope, player, auxDeferred: auxSynced === false };
    }

    emitEnvelope(socket: any, envelope: any) {
        this.worldSyncProtocolService.sendEnvelope(socket, envelope);
    }

    clearDetachedPlayerCaches(playerId: string) {
        this.clearPlayerCaches(playerId, true);
    }

    unloadDetachedPlayerRuntime(playerId: string, options: { allowOfflineHangingDemotion?: boolean; reason?: string } = {}): boolean {
        if (options.allowOfflineHangingDemotion !== true) return false;
        if (typeof this.playerRuntimeService.canUnloadDetachedPlayerRuntime === 'function'
            && !this.playerRuntimeService.canUnloadDetachedPlayerRuntime(playerId)) return false;
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
        const { envelope, player, auxDeferred } = this.prepareDeltaForPlayer(playerId, sessionId, socket, view, breakdown);
        this.emitPreparedDelta(playerId, socket, view, player, envelope, auxDeferred, breakdown);
    }

    private emitPreparedDelta(playerId: string, socket: any, view: any, player: any, envelope: any, auxDeferred: boolean, breakdown?: SyncFlushBreakdownSample) {
        if (envelope) {
            runMeasuredSyncFlushStep(breakdown, 'emitEnvelopeMs', 'emitEnvelopeCount', () => this.emitEnvelope(socket, envelope));
        }
        this.emitDeltaPostSync(playerId, socket, view, player, envelope, auxDeferred, breakdown);
    }

    private emitDeltaPostSync(playerId: string, socket: any, view: any, player: any, envelope: any, auxDeferred: boolean, breakdown?: SyncFlushBreakdownSample) {
        if (auxDeferred) runMeasuredAuxSync(breakdown, () => this.emitAuxDeltaSync(playerId, socket, view, player, { breakdown }));
        runMeasuredSyncFlushStep(breakdown, 'questSyncMs', 'questSyncCount', () => this.worldSyncQuestLootService.emitQuestSyncIfChanged(socket, playerId, player?.quests?.revision));
        runMeasuredSyncFlushStep(breakdown, 'runtimeEventsMs', 'runtimeEventsCount', () => this.emitPendingRuntimeEvents(playerId, socket, envelope));
        runMeasuredSyncFlushStep(breakdown, 'statisticRecordsMs', 'statisticRecordsCount', () => emitPendingPlayerStatisticRecords(this.playerRuntimeService, playerId, socket));
    }

    private clearPurgedPlayerCaches() {
        const purgedPlayerIds = this.worldSessionService.consumePurgedPlayerIds();
        for (const playerId of purgedPlayerIds) {
            this.clearPlayerCaches(playerId, false);
        }
    }

    private clearPlayerCaches(playerId: string, detachRuntimeSession: boolean) {
        this.contextActionsCache.clear(playerId);
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

    private isOfflineGainBlocking(playerId: string): boolean {
        return typeof this.playerRuntimeService.hasLoadedActiveOfflineGainSession === 'function'
            && this.playerRuntimeService.hasLoadedActiveOfflineGainSession(playerId) === true;
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

    private syncPlayerInstanceRoom(playerId: string, view: any) {
        const instanceId = typeof view?.instance?.instanceId === 'string' ? view.instance.instanceId : null;
        if (typeof this.worldSessionService?.syncPlayerInstanceRoom === 'function') this.worldSessionService.syncPlayerInstanceRoom(playerId, instanceId);
    }

    handleReportMinimapVersions(socket: any, playerId: string, clientVersions: Record<string, number>): void {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (player) this.worldSyncAuxStateService.handleReportMinimapVersions(socket, player, clientVersions);
    }
}
