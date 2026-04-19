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
exports.WorldRuntimeWorldAccessService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_summary_query_service_1 = require("./world-runtime-summary-query.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { buildPublicInstanceId } = world_runtime_normalization_helpers_1;

const DEFAULT_PLAYER_RESPAWN_MAP_ID = 'yunlai_town';

/** world-runtime world-access seam：承接世界级 access/utility/query 外壳。 */
let WorldRuntimeWorldAccessService = class WorldRuntimeWorldAccessService {
    worldRuntimeSummaryQueryService;
    constructor(worldRuntimeSummaryQueryService) {
        this.worldRuntimeSummaryQueryService = worldRuntimeSummaryQueryService;
    }
    resolveCurrentTickForPlayerId(playerId, deps) {
        const player = deps.playerRuntimeService.getPlayer(playerId);
        if (!player?.instanceId) {
            return deps.tick;
        }
        return deps.getInstanceRuntime(player.instanceId)?.tick ?? deps.tick;
    }
    getRuntimeSummary(deps) {
        const instances = deps.listInstances();
        return this.worldRuntimeSummaryQueryService.buildRuntimeSummary({
            tick: deps.tick,
            lastTickDurationMs: deps.lastTickDurationMs,
            lastSyncFlushDurationMs: deps.lastSyncFlushDurationMs,
            mapTemplateCount: deps.templateRepository.list().length,
            playerCount: deps.getPlayerLocationCount(),
            pendingCommandCount: deps.getPendingCommandCount(),
            pendingSystemCommandCount: deps.worldRuntimeGmQueueService.getPendingSystemCommandCount(),
            tickDurationHistoryMs: deps.tickDurationHistoryMs,
            syncFlushDurationHistoryMs: deps.syncFlushDurationHistoryMs,
            lastTickPhaseDurations: deps.lastTickPhaseDurations,
            instances,
        });
    }
    getOrCreatePublicInstance(templateId, deps) {
        if (!deps.templateRepository.has(templateId)) {
            throw new common_1.NotFoundException(`Unknown map template: ${templateId}`);
        }
        return deps.createInstance({
            instanceId: buildPublicInstanceId(templateId),
            templateId,
            kind: 'public',
            persistent: true,
        });
    }
    resolveDefaultRespawnMapId(deps) {
        if (deps.templateRepository.has(DEFAULT_PLAYER_RESPAWN_MAP_ID)) {
            return DEFAULT_PLAYER_RESPAWN_MAP_ID;
        }
        const fallback = deps.templateRepository.list()[0]?.id;
        if (!fallback) {
            throw new common_1.NotFoundException('No map template available');
        }
        return fallback;
    }
    findMapRoute(fromMapId, toMapId, deps) {
        return deps.worldRuntimeNavigationService.findMapRoute(fromMapId, toMapId);
    }
    getPlayerLocationOrThrow(playerId, deps) {
        const location = deps.getPlayerLocation(playerId);
        if (!location) {
            throw new common_1.NotFoundException(`Player ${playerId} is not connected`);
        }
        return location;
    }
    getInstanceRuntimeOrThrow(instanceId, deps) {
        const instance = deps.getInstanceRuntime(instanceId);
        if (!instance) {
            throw new common_1.NotFoundException(`Instance ${instanceId} not found`);
        }
        return instance;
    }
    cancelPendingInstanceCommand(playerId, deps) {
        const location = deps.getPlayerLocation(playerId);
        if (!location) {
            return false;
        }
        return deps.getInstanceRuntime(location.instanceId)?.cancelPendingCommand(playerId) ?? false;
    }
    interruptManualNavigation(playerId, deps) {
        deps.worldRuntimeNavigationService.interruptManualNavigation(playerId, deps);
    }
    interruptManualCombat(playerId, deps) {
        deps.worldRuntimeNavigationService.clearNavigationIntent(playerId);
        this.cancelPendingInstanceCommand(playerId, deps);
    }
    getPlayerViewOrThrow(playerId, deps) {
        const view = deps.getPlayerView(playerId);
        if (!view) {
            throw new common_1.NotFoundException(`Player ${playerId} not found`);
        }
        return view;
    }
};
exports.WorldRuntimeWorldAccessService = WorldRuntimeWorldAccessService;
exports.WorldRuntimeWorldAccessService = WorldRuntimeWorldAccessService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_summary_query_service_1.WorldRuntimeSummaryQueryService])
], WorldRuntimeWorldAccessService);
