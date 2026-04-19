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
exports.WorldSyncEnvelopeService = void 0;
const common_1 = require("@nestjs/common");
const movement_debug_1 = require("../debug/movement-debug");
const map_template_repository_1 = require("../runtime/map/map-template.repository");
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const world_projector_service_1 = require("./world-projector.service");
const world_sync_map_snapshot_service_1 = require("./world-sync-map-snapshot.service");
/** world envelope 服务：承接 envelope 生成、战斗特效附加与移动调试日志。 */
let WorldSyncEnvelopeService = class WorldSyncEnvelopeService {
    worldProjectorService;
    worldRuntimeService;
    templateRepository;
    worldSyncMapSnapshotService;
    logger = new common_1.Logger(WorldSyncEnvelopeService.name);
    constructor(worldProjectorService, worldRuntimeService, templateRepository, worldSyncMapSnapshotService) {
        this.worldProjectorService = worldProjectorService;
        this.worldRuntimeService = worldRuntimeService;
        this.templateRepository = templateRepository;
        this.worldSyncMapSnapshotService = worldSyncMapSnapshotService;
    }
    createInitialEnvelope(playerId, binding, view, player) {
        const envelope = this.appendNextCombatEffects(this.worldProjectorService.createInitialEnvelope(binding, view, player), view, player);
        this.logMovementEnvelope(playerId, 'initial', envelope);
        return envelope;
    }
    createDeltaEnvelope(playerId, view, player) {
        const envelope = this.appendNextCombatEffects(this.worldProjectorService.createDeltaEnvelope(view, player), view, player);
        this.logMovementEnvelope(playerId, 'delta', envelope);
        return envelope;
    }
    clearPlayerCache(playerId) {
        this.worldProjectorService.clear(playerId);
    }
    appendNextCombatEffects(envelope, view, player) {
        const effects = this.collectNextCombatEffects(view, player);
        if (effects.length === 0) {
            return envelope;
        }
        const nextEnvelope = envelope ?? {};
        nextEnvelope.worldDelta = {
            t: view.tick,
            wr: view.worldRevision,
            sr: view.selfRevision,
            ...(nextEnvelope.worldDelta ?? {}),
            fx: effects.map((entry) => cloneCombatEffect(entry)),
        };
        return nextEnvelope;
    }
    collectNextCombatEffects(view, player) {
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const visibleTileKeys = this.worldSyncMapSnapshotService.buildVisibleTileKeySet(view, player, template);
        return filterCombatEffects(this.worldRuntimeService.getCombatEffects(view.instance.instanceId), visibleTileKeys);
    }
    logMovementEnvelope(playerId, phase, envelope) {
        if (!(0, movement_debug_1.isServerNextMovementDebugEnabled)()) {
            return;
        }
        const worldSelfPatch = envelope?.worldDelta?.p?.find((patch) => patch?.id === playerId);
        const hasMovementSignal = Boolean(envelope?.mapEnter
            || envelope?.initSession
            || envelope?.selfDelta?.mid
            || typeof envelope?.selfDelta?.x === 'number'
            || typeof envelope?.selfDelta?.y === 'number'
            || envelope?.selfDelta?.f !== undefined
            || (worldSelfPatch && (typeof worldSelfPatch.x === 'number'
                || typeof worldSelfPatch.y === 'number'
                || worldSelfPatch.facing !== undefined)));
        if (!hasMovementSignal) {
            return;
        }
        (0, movement_debug_1.logServerNextMovement)(this.logger, `sync.${phase}`, {
            playerId,
            initSession: envelope?.initSession
                ? { sessionId: envelope.initSession.sid ?? null }
                : null,
            mapEnter: envelope?.mapEnter
                ? {
                    mapId: envelope.mapEnter.mid ?? null,
                    x: envelope.mapEnter.x ?? null,
                    y: envelope.mapEnter.y ?? null,
                }
                : null,
            worldSelfPatch: worldSelfPatch
                ? {
                    x: typeof worldSelfPatch.x === 'number' ? worldSelfPatch.x : null,
                    y: typeof worldSelfPatch.y === 'number' ? worldSelfPatch.y : null,
                    facing: worldSelfPatch.facing ?? null,
                }
                : null,
            selfDelta: envelope?.selfDelta
                ? {
                    mapId: envelope.selfDelta.mid ?? null,
                    x: typeof envelope.selfDelta.x === 'number' ? envelope.selfDelta.x : null,
                    y: typeof envelope.selfDelta.y === 'number' ? envelope.selfDelta.y : null,
                    facing: envelope.selfDelta.f ?? null,
                }
                : null,
        });
    }
};
exports.WorldSyncEnvelopeService = WorldSyncEnvelopeService;
exports.WorldSyncEnvelopeService = WorldSyncEnvelopeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_projector_service_1.WorldProjectorService,
        world_runtime_service_1.WorldRuntimeService,
        map_template_repository_1.MapTemplateRepository,
        world_sync_map_snapshot_service_1.WorldSyncMapSnapshotService])
], WorldSyncEnvelopeService);
function buildCoordKey(x, y) {
    return `${x},${y}`;
}
function cloneCombatEffect(source) {
    return { ...source };
}
function filterCombatEffects(effects, visibleTiles) {
    if (effects.length === 0 || visibleTiles.size === 0) {
        return [];
    }
    return effects
        .filter((effect) => effect.type === 'attack'
        ? visibleTiles.has(buildCoordKey(effect.fromX, effect.fromY)) || visibleTiles.has(buildCoordKey(effect.toX, effect.toY))
        : visibleTiles.has(buildCoordKey(effect.x, effect.y)))
        .map((entry) => cloneCombatEffect(entry));
}
