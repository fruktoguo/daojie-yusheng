/**
 * 世界同步总控服务。
 * 编排每 tick 的初始同步、增量同步、全量 flush 和缓存清理，是网络层同步的核心入口。
 */

import { Inject, Injectable } from '@nestjs/common';
import { S2C } from '@mud/shared';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldSyncQuestLootService } from './world-sync-quest-loot.service';
import { WorldSyncProtocolService } from './world-sync-protocol.service';
import { WorldSyncAuxStateService } from './world-sync-aux-state.service';
import { WorldSyncEnvelopeService } from './world-sync-envelope.service';
import { WorldSessionService } from './world-session.service';

@Injectable()
export class WorldSyncService {
        worldRuntimeService;
        playerRuntimeService;
        worldSessionService;
        worldSyncQuestLootService;
        worldSyncProtocolService;
        worldSyncAuxStateService;
        worldSyncEnvelopeService;    
    constructor(
        @Inject(WorldRuntimeService) worldRuntimeService: any,
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(WorldSessionService) worldSessionService: any,
        @Inject(WorldSyncQuestLootService) worldSyncQuestLootService: any,
        @Inject(WorldSyncProtocolService) worldSyncProtocolService: any,
        @Inject(WorldSyncAuxStateService) worldSyncAuxStateService: any,
        @Inject(WorldSyncEnvelopeService) worldSyncEnvelopeService: any,
    ) {
        this.worldRuntimeService = worldRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldSyncQuestLootService = worldSyncQuestLootService;
        this.worldSyncProtocolService = worldSyncProtocolService;
        this.worldSyncAuxStateService = worldSyncAuxStateService;
        this.worldSyncEnvelopeService = worldSyncEnvelopeService;
    }
    emitInitialSync(playerId, socketOverride = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const binding = this.worldSessionService.getBinding(playerId);
        if (!binding) {
            return;
        }
        const socket = socketOverride ?? this.worldSessionService.getSocketByPlayerId(playerId);
        const view = this.worldRuntimeService.getPlayerView(playerId);
        if (!socket || !view) {
            return;
        }
        this.worldRuntimeService.refreshPlayerContextActions(playerId, view);
        const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);
        const envelope = this.worldSyncEnvelopeService.createInitialEnvelope(playerId, binding, view, player);
        this.emitEnvelope(socket, envelope);
        this.emitAuxInitialSync(binding.playerId, socket, view, player);
        this.worldSyncQuestLootService.emitQuestSync(socket, binding.playerId, player.quests.revision);
        this.emitPendingNotices(binding.playerId, socket);
        this.emitPendingPlayerStatisticRecords(binding.playerId, socket);
    }
        emitDeltaSync(playerId, socketOverride = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const binding = this.worldSessionService.getBinding(playerId);
        if (!binding) {
            return;
        }
        const socket = socketOverride ?? this.worldSessionService.getSocketByPlayerId(playerId);
        const view = this.worldRuntimeService.getPlayerView(playerId);
        if (!socket || !view) {
            return;
        }
        this.worldRuntimeService.refreshPlayerContextActions(playerId, view);
        const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);
        const envelope = this.worldSyncEnvelopeService.createDeltaEnvelope(binding.playerId, view, player);
        const auxEmittedBeforeEnvelope = this.emitAuxDeltaSync(binding.playerId, socket, view, player, { deferMapChanged: true });
        this.emitEnvelope(socket, envelope);
        if (!auxEmittedBeforeEnvelope) {
            this.emitAuxDeltaSync(binding.playerId, socket, view, player);
        }
        this.worldSyncQuestLootService.emitQuestSyncIfChanged(socket, binding.playerId, player.quests.revision);
        this.emitPendingNotices(binding.playerId, socket);
        this.emitPendingPlayerStatisticRecords(binding.playerId, socket);
    }
        flushConnectedPlayers() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        this.clearPurgedPlayerCaches();
        for (const binding of this.worldSessionService.listBindings()) {
            const socket = this.worldSessionService.getSocketByPlayerId(binding.playerId);
            const view = this.worldRuntimeService.getPlayerView(binding.playerId);
            if (!socket || !view) {
                continue;
            }
            this.worldRuntimeService.refreshPlayerContextActions(binding.playerId, view);
            const player = this.playerRuntimeService.syncFromWorldView(binding.playerId, binding.sessionId, view);
            const envelope = this.worldSyncEnvelopeService.createDeltaEnvelope(binding.playerId, view, player);
            const auxEmittedBeforeEnvelope = this.emitAuxDeltaSync(binding.playerId, socket, view, player, { deferMapChanged: true });
            this.emitEnvelope(socket, envelope);
            if (!auxEmittedBeforeEnvelope) {
                this.emitAuxDeltaSync(binding.playerId, socket, view, player);
            }
            this.worldSyncQuestLootService.emitQuestSyncIfChanged(socket, binding.playerId, player.quests.revision);
            this.emitPendingNotices(binding.playerId, socket);
            this.emitPendingPlayerStatisticRecords(binding.playerId, socket);
        }
    }
        emitEnvelope(socket, envelope) {
        this.worldSyncProtocolService.sendEnvelope(socket, envelope);
    }
        clearDetachedPlayerCaches(playerId) {
        this.clearPlayerCaches(playerId, true);
    }
        clearPurgedPlayerCaches() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const purgedPlayerIds = this.worldSessionService.consumePurgedPlayerIds();
        for (const playerId of purgedPlayerIds) {
            this.clearPlayerCaches(playerId, false);
        }
    }
        clearPlayerCaches(playerId, detachRuntimeSession) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        this.worldSyncEnvelopeService.clearPlayerCache(playerId);
        if (detachRuntimeSession) {
            this.playerRuntimeService.detachSession(playerId);
        }
        this.worldSyncQuestLootService.clearPlayerCache(playerId);
        this.worldSyncAuxStateService.clearPlayerCache(playerId);
    }    
    emitLootWindowUpdate(playerId) {
        this.worldSyncQuestLootService.emitLootWindowUpdate(playerId);
    }    
    openLootWindow(playerId, x, y) {
        return this.worldSyncQuestLootService.openLootWindow(playerId, x, y);
    }    
    emitAuxInitialSync(playerId, socket, view, player) {
        this.worldSyncAuxStateService.emitAuxInitialSync(playerId, socket, view, player);
    }    
    emitAuxDeltaSync(playerId, socket, view, player, options = undefined) {
        return this.worldSyncAuxStateService.emitAuxDeltaSync(playerId, socket, view, player, options);
    }    
    emitPendingNotices(playerId, socket) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const items = this.playerRuntimeService.drainNotices(playerId);
        if (items.length === 0) {
            return;
        }
        this.worldSyncProtocolService.sendNotices(socket, items);
    }
    emitPendingPlayerStatisticRecords(playerId, socket) {
        const records = typeof this.playerRuntimeService.getPendingPlayerStatisticRecords === 'function'
            ? this.playerRuntimeService.getPendingPlayerStatisticRecords(playerId)
            : [];
        const totals = typeof this.playerRuntimeService.consumePlayerStatisticTotalsForEmit === 'function'
            ? this.playerRuntimeService.consumePlayerStatisticTotalsForEmit(playerId)
            : null;
        if (typeof socket?.emit !== 'function') {
            return;
        }
        if ((!Array.isArray(records) || records.length === 0) && !totals) {
            return;
        }
        socket.emit(S2C.OfflineGainReports, {
            reports: Array.isArray(records) ? records : [],
            ...(totals ? { totals } : {}),
        });
    }
};
