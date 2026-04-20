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
exports.WorldSyncEnvelopeService = void 0;
const common_1 = require("@nestjs/common");
const movement_debug_1 = require("../debug/movement-debug");
const map_template_repository_1 = require("../runtime/map/map-template.repository");
const world_runtime_service_1 = require("../runtime/world/world-runtime.service");
const world_projector_service_1 = require("./world-projector.service");
const world_sync_map_snapshot_service_1 = require("./world-sync-map-snapshot.service");
/** world envelope 服务：承接 envelope 生成、战斗特效附加与移动调试日志。 */
let WorldSyncEnvelopeService = class WorldSyncEnvelopeService {
/**
 * worldProjectorService：对象字段。
 */

    worldProjectorService;    
    /**
 * worldRuntimeService：对象字段。
 */

    worldRuntimeService;    
    /**
 * templateRepository：对象字段。
 */

    templateRepository;    
    /**
 * worldSyncMapSnapshotService：对象字段。
 */

    worldSyncMapSnapshotService;    
    /**
 * logger：对象字段。
 */

    logger = new common_1.Logger(WorldSyncEnvelopeService.name);    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldProjectorService 参数说明。
 * @param worldRuntimeService 参数说明。
 * @param templateRepository 参数说明。
 * @param worldSyncMapSnapshotService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(worldProjectorService, worldRuntimeService, templateRepository, worldSyncMapSnapshotService) {
        this.worldProjectorService = worldProjectorService;
        this.worldRuntimeService = worldRuntimeService;
        this.templateRepository = templateRepository;
        this.worldSyncMapSnapshotService = worldSyncMapSnapshotService;
    }    
    /**
 * createInitialEnvelope：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param binding 参数说明。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    createInitialEnvelope(playerId, binding, view, player) {
        const envelope = this.appendNextCombatEffects(this.worldProjectorService.createInitialEnvelope(binding, view, player), view, player);
        this.logMovementEnvelope(playerId, 'initial', envelope);
        return envelope;
    }    
    /**
 * createDeltaEnvelope：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    createDeltaEnvelope(playerId, view, player) {
        const envelope = this.appendNextCombatEffects(this.worldProjectorService.createDeltaEnvelope(view, player), view, player);
        this.logMovementEnvelope(playerId, 'delta', envelope);
        return envelope;
    }    
    /**
 * clearPlayerCache：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    clearPlayerCache(playerId) {
        this.worldProjectorService.clear(playerId);
    }    
    /**
 * appendNextCombatEffects：执行核心业务逻辑。
 * @param envelope 参数说明。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    appendNextCombatEffects(envelope, view, player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    /**
 * collectNextCombatEffects：执行核心业务逻辑。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 函数返回值。
 */

    collectNextCombatEffects(view, player) {
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const visibleTileKeys = this.worldSyncMapSnapshotService.buildVisibleTileKeySet(view, player, template);
        return filterCombatEffects(this.worldRuntimeService.getCombatEffects(view.instance.instanceId), visibleTileKeys);
    }    
    /**
 * logMovementEnvelope：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param phase 参数说明。
 * @param envelope 参数说明。
 * @returns 函数返回值。
 */

    logMovementEnvelope(playerId, phase, envelope) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * buildCoordKey：构建并返回目标对象。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 函数返回值。
 */

function buildCoordKey(x, y) {
    return `${x},${y}`;
}
/**
 * cloneCombatEffect：执行核心业务逻辑。
 * @param source 来源对象。
 * @returns 函数返回值。
 */

function cloneCombatEffect(source) {
    return { ...source };
}
/**
 * filterCombatEffects：执行核心业务逻辑。
 * @param effects 参数说明。
 * @param visibleTiles 参数说明。
 * @returns 函数返回值。
 */

function filterCombatEffects(effects, visibleTiles) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (effects.length === 0 || visibleTiles.size === 0) {
        return [];
    }
    return effects
        .filter((effect) => effect.type === 'attack'
        ? visibleTiles.has(buildCoordKey(effect.fromX, effect.fromY)) || visibleTiles.has(buildCoordKey(effect.toX, effect.toY))
        : visibleTiles.has(buildCoordKey(effect.x, effect.y)))
        .map((entry) => cloneCombatEffect(entry));
}

export { WorldSyncEnvelopeService };
