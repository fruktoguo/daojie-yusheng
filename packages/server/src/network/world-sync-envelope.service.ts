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
 * worldProjectorService：世界Projector服务引用。
 */

    worldProjectorService;    
    /**
 * worldRuntimeService：世界运行态服务引用。
 */

    worldRuntimeService;    
    /**
 * templateRepository：template仓储引用。
 */

    templateRepository;    
    /**
 * worldSyncMapSnapshotService：世界Sync地图快照服务引用。
 */

    worldSyncMapSnapshotService;    
    /**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(WorldSyncEnvelopeService.name);    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldProjectorService 参数说明。
 * @param worldRuntimeService 参数说明。
 * @param templateRepository 参数说明。
 * @param worldSyncMapSnapshotService 参数说明。
 * @returns 无返回值，完成实例初始化。
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
 * @returns 无返回值，直接更新InitialEnvelope相关状态。
 */

    createInitialEnvelope(playerId, binding, view, player) {
        const projectedView = this.withContainerRespawnProjection(view);
        const envelope = this.appendCombatEffects(this.worldProjectorService.createInitialEnvelope(binding, projectedView, player), projectedView, player);
        this.logMovementEnvelope(playerId, 'initial', envelope);
        return envelope;
    }    
    /**
 * createDeltaEnvelope：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新DeltaEnvelope相关状态。
 */

    createDeltaEnvelope(playerId, view, player) {
        const projectedView = this.withContainerRespawnProjection(view);
        const envelope = this.appendCombatEffects(this.worldProjectorService.createDeltaEnvelope(projectedView, player), projectedView, player);
        this.logMovementEnvelope(playerId, 'delta', envelope);
        return envelope;
    }    
    /**
 * clearPlayerCache：执行clear玩家缓存相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clear玩家缓存相关状态。
 */

    clearPlayerCache(playerId) {
        this.worldProjectorService.clear(playerId);
    }    

    withContainerRespawnProjection(view) {
        if (!view || !Array.isArray(view.localContainers) || view.localContainers.length === 0) {
            return view;
        }
        const instanceId = view.instance?.instanceId;
        const instance = this.worldRuntimeService.getInstanceRuntime?.(instanceId) ?? null;
        const lootContainerService = this.worldRuntimeService.worldRuntimeLootContainerService;
        if (!instance || !lootContainerService || typeof lootContainerService.getHerbContainerWorldProjection !== 'function') {
            return view;
        }
        let changed = false;
        const localContainers = view.localContainers.map((entry) => {
            const container = instance.getContainerById?.(entry.id) ?? null;
            const projection = lootContainerService.getHerbContainerWorldProjection(instanceId, container, instance.tick);
            const respawnRemainingTicks = projection?.remainingCount === 0 && projection.respawnRemainingTicks !== undefined
                ? Math.max(0, Math.trunc(Number(projection.respawnRemainingTicks) || 0))
                : undefined;
            if (respawnRemainingTicks === entry.respawnRemainingTicks) {
                return entry;
            }
            changed = true;
            return { ...entry, respawnRemainingTicks };
        });
        return changed ? { ...view, localContainers } : view;
    }
    /**
 * appendNextCombatEffects：执行appendNext战斗Effect相关逻辑。
 * @param envelope 参数说明。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新appendNext战斗Effect相关状态。
 */

    appendCombatEffects(envelope, view, player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const effects = this.collectCombatEffects(view, player);
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
 * collectNextCombatEffects：执行Next战斗Effect相关逻辑。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Next战斗Effect相关状态。
 */

    collectCombatEffects(view, player) {
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const visibleTileKeys = this.worldSyncMapSnapshotService.buildVisibleTileKeySet(view, player, template);
        return filterCombatEffects(this.worldRuntimeService.getCombatEffects(view.instance.instanceId), visibleTileKeys);
    }    
    /**
 * logMovementEnvelope：执行logMovementEnvelope相关逻辑。
 * @param playerId 玩家 ID。
 * @param phase 参数说明。
 * @param envelope 参数说明。
 * @returns 无返回值，直接更新logMovementEnvelope相关状态。
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
 * @returns 无返回值，直接更新CoordKey相关状态。
 */

function buildCoordKey(x, y) {
    return `${x},${y}`;
}
/**
 * cloneCombatEffect：构建战斗Effect。
 * @param source 来源对象。
 * @returns 无返回值，直接更新战斗Effect相关状态。
 */

function cloneCombatEffect(source) {
    return { ...source };
}
/**
 * filterCombatEffects：执行filter战斗Effect相关逻辑。
 * @param effects 参数说明。
 * @param visibleTiles 参数说明。
 * @returns 无返回值，直接更新filter战斗Effect相关状态。
 */

function filterCombatEffects(effects, visibleTiles) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (effects.length === 0 || visibleTiles.size === 0) {
        return [];
    }
    return effects
        .filter((effect) => {
            if (effect.type === 'attack') {
                return visibleTiles.has(buildCoordKey(effect.fromX, effect.fromY)) || visibleTiles.has(buildCoordKey(effect.toX, effect.toY));
            }
            if (effect.type === 'warning_zone') {
                return effect.cells.some((cell) => visibleTiles.has(buildCoordKey(cell.x, cell.y)));
            }
            return visibleTiles.has(buildCoordKey(effect.x, effect.y));
        })
        .map((entry) => cloneCombatEffect(entry));
}

export { WorldSyncEnvelopeService };
