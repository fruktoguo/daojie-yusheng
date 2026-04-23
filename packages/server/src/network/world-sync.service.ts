// @ts-nocheck
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSyncService = void 0;
const common_1 = require("@nestjs/common");
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const player_runtime_service_1 = require("../runtime/player/player-runtime.service");
const world_sync_quest_loot_service_1 = require("./world-sync-quest-loot.service");
const world_sync_protocol_service_1 = require("./world-sync-protocol.service");
const world_sync_aux_state_service_1 = require("./world-sync-aux-state.service");
const world_sync_envelope_service_1 = require("./world-sync-envelope.service");
const world_session_service_1 = require("./world-session.service");
let WorldSyncService = class WorldSyncService {
        worldRuntimeService;
        playerRuntimeService;
        worldSessionService;
        worldSyncQuestLootService;
        worldSyncProtocolService;
        worldSyncAuxStateService;
        worldSyncEnvelopeService;    
    constructor(worldRuntimeService, playerRuntimeService, worldSessionService, worldSyncQuestLootService, worldSyncProtocolService, worldSyncAuxStateService, worldSyncEnvelopeService) {
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
        this.emitEnvelope(socket, envelope);
        this.emitAuxDeltaSync(binding.playerId, socket, view, player);
        this.worldSyncQuestLootService.emitQuestSyncIfChanged(socket, binding.playerId, player.quests.revision);
        this.emitPendingNotices(binding.playerId, socket);
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
            this.emitEnvelope(socket, envelope);
            this.emitAuxDeltaSync(binding.playerId, socket, view, player);
            this.worldSyncQuestLootService.emitQuestSyncIfChanged(socket, binding.playerId, player.quests.revision);
            this.emitPendingNotices(binding.playerId, socket);
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
    emitAuxDeltaSync(playerId, socket, view, player) {
        this.worldSyncAuxStateService.emitAuxDeltaSync(playerId, socket, view, player);
    }    
    emitPendingNotices(playerId, socket) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const items = this.playerRuntimeService.drainNotices(playerId);
        if (items.length === 0) {
            return;
        }
        this.worldSyncProtocolService.sendNotices(socket, items);
    }
};
exports.WorldSyncService = WorldSyncService;
exports.WorldSyncService = WorldSyncService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => world_runtime_service_1.WorldRuntimeService))),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        player_runtime_service_1.PlayerRuntimeService,
        world_session_service_1.WorldSessionService,
        world_sync_quest_loot_service_1.WorldSyncQuestLootService,
        world_sync_protocol_service_1.WorldSyncProtocolService,
        world_sync_aux_state_service_1.WorldSyncAuxStateService,
        world_sync_envelope_service_1.WorldSyncEnvelopeService])
], WorldSyncService);
export { WorldSyncService };
