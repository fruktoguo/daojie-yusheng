/**
 * 世界同步总控服务。
 * 编排每 tick 的初始同步、增量同步、全量 flush 和缓存清理，是网络层同步的核心入口。
 */

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
        this.clearPurgedPlayerCaches();
        for (const binding of this.worldSessionService.listBindings()) {
            const socket = this.worldSessionService.getSocketByPlayerId(binding.playerId);
            const view = this.worldRuntimeService.getPlayerView(binding.playerId);
            if (!socket || !view) continue;
            this.syncDeltaForPlayer(binding.playerId, binding.sessionId, socket, view);
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

    private syncDeltaForPlayer(playerId: string, sessionId: string, socket: any, view: any) {
        this.worldRuntimeService.refreshPlayerContextActions(playerId, view);
        const player = this.playerRuntimeService.syncFromWorldView(playerId, sessionId, view);
        const envelope = this.worldSyncEnvelopeService.createDeltaEnvelope(playerId, view, player);
        const auxEmittedBeforeEnvelope = this.emitAuxDeltaSync(playerId, socket, view, player, { deferMapChanged: true });
        this.emitEnvelope(socket, envelope);
        if (!auxEmittedBeforeEnvelope) {
            this.emitAuxDeltaSync(playerId, socket, view, player);
        }
        this.worldSyncQuestLootService.emitQuestSyncIfChanged(socket, playerId, player.quests.revision);
        this.emitPendingRuntimeEvents(playerId, socket, envelope);
        this.emitPendingPlayerStatisticRecords(playerId, socket);
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
            ? this.playerRuntimeService.getPendingPlayerStatisticRecords(playerId)
            : [];
        const totals = typeof this.playerRuntimeService.consumePlayerStatisticTotalsForEmit === 'function'
            ? this.playerRuntimeService.consumePlayerStatisticTotalsForEmit(playerId)
            : null;
        if (typeof socket?.emit !== 'function') return;
        if ((!Array.isArray(records) || records.length === 0) && !totals) return;
        socket.emit(S2C.OfflineGainReports, {
            reports: Array.isArray(records) ? records : [],
            ...(totals ? { totals } : {}),
        });
    }
}
