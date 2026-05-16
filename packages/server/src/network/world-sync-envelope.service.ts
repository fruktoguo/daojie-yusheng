/**
 * 世界同步 envelope 服务。
 * 承接 envelope 生成、容器重生投影、战斗特效附加与移动调试日志。
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { isServerNextMovementDebugEnabled, logServerNextMovement } from '../debug/movement-debug';
import { RuntimeEventBusService } from '../runtime/event-bus/runtime-event-bus.service';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { WorldRuntimeService } from '../runtime/world/world-runtime.service';
import { WorldProjectorService } from './world-projector.service';
import { WorldSyncMapSnapshotService } from './world-sync-map-snapshot.service';

const containerRespawnProjectionCache = new WeakMap<object, Map<number, unknown>>();

/** world envelope 服务：承接 envelope 生成、战斗特效附加与移动调试日志。 */
@Injectable()
export class WorldSyncEnvelopeService {
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
 * runtimeEventBusService：运行时事件总线引用。
 */

    runtimeEventBusService;
    /**
 * logger：日志器引用。
 */

    logger = new Logger(WorldSyncEnvelopeService.name);
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldProjectorService 参数说明。
 * @param worldRuntimeService 参数说明。
 * @param templateRepository 参数说明。
 * @param worldSyncMapSnapshotService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(WorldProjectorService) worldProjectorService: any,
        @Inject(WorldRuntimeService) worldRuntimeService: any,
        @Inject(MapTemplateRepository) templateRepository: any,
        @Inject(WorldSyncMapSnapshotService) worldSyncMapSnapshotService: any,
        @Inject(RuntimeEventBusService) runtimeEventBusService: any,
    ) {
        this.worldProjectorService = worldProjectorService;
        this.worldRuntimeService = worldRuntimeService;
        this.templateRepository = templateRepository;
        this.worldSyncMapSnapshotService = worldSyncMapSnapshotService;
        this.runtimeEventBusService = runtimeEventBusService;
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
        const envelope = this.appendEventBusPayload(
            playerId,
            this.worldProjectorService.createInitialEnvelope(binding, projectedView, player),
            projectedView,
            player,
            { drainPlayer: false },
        );
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
        const envelope = this.appendEventBusPayload(
            playerId,
            this.worldProjectorService.createDeltaEnvelope(projectedView, player),
            projectedView,
            player,
            { drainPlayer: true },
        );
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
        this.runtimeEventBusService?.discardPlayer?.(playerId);
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
        let localContainers = null;
        for (let index = 0; index < view.localContainers.length; index += 1) {
            const entry = view.localContainers[index];
            const container = instance.getContainerById?.(entry.id) ?? null;
            const projection = lootContainerService.getHerbContainerWorldProjection(instanceId, container, instance.tick);
            const respawnRemainingTicks = projection?.remainingCount === 0 && projection.respawnRemainingTicks !== undefined
                ? Math.max(0, Math.trunc(Number(projection.respawnRemainingTicks) || 0))
                : undefined;
            if (respawnRemainingTicks === entry.respawnRemainingTicks) {
                if (localContainers) {
                    localContainers.push(entry);
                }
                continue;
            }
            if (!localContainers) {
                localContainers = view.localContainers.slice(0, index);
            }
            localContainers.push(projectContainerRespawnEntry(entry, respawnRemainingTicks));
        }
        return localContainers ? { ...view, localContainers } : view;
    }
    /**
 * appendNextCombatEffects：执行appendNext战斗Effect相关逻辑。
 * @param envelope 参数说明。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新appendNext战斗Effect相关状态。
 */

    appendEventBusPayload(playerId, envelope, view, player, options) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerDrain = options?.drainPlayer
            ? this.runtimeEventBusService?.drainPlayerEventBusPayload?.(playerId)
            : null;
        const { effects, aoiEffects } = this.collectVisibleEventBusEffects(view, player);
        if (!playerDrain?.payload && effects.length === 0 && aoiEffects.length === 0) {
            return envelope;
        }
        const nextEnvelope = envelope ?? {};
        const eventBus = {
            ...(playerDrain?.payload ?? {}),
            ...(effects.length > 0 ? { combatEffects: effects } : {}),
            ...(aoiEffects.length > 0 ? { aoiEffects } : {}),
        };
        nextEnvelope.worldDelta = {
            t: view.tick,
            wr: view.worldRevision,
            sr: view.selfRevision,
            ...(nextEnvelope.worldDelta ?? {}),
            ...(effects.length > 0 ? { fx: effects } : {}),
            eventBus,
        };
        if (playerDrain?.gmStatePush) {
            nextEnvelope.gmStatePush = true;
        }
        return nextEnvelope;
    }
    /** 只在实例确实有表现事件时构建一次玩家 AOI 可见集合。 */
    collectVisibleEventBusEffects(view, player) {
        const instanceCombatEffects = this.worldRuntimeService.getCombatEffects(view.instance.instanceId);
        const instanceAoiEffects = this.runtimeEventBusService?.getAoiPresentations?.(view.instance.instanceId) ?? [];
        const hasCombatEffects = Array.isArray(instanceCombatEffects) && instanceCombatEffects.length > 0;
        const hasAoiEffects = Array.isArray(instanceAoiEffects) && instanceAoiEffects.length > 0;
        if (!hasCombatEffects && !hasAoiEffects) {
            return { effects: [], aoiEffects: [] };
        }
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const visibleTileKeys = this.worldSyncMapSnapshotService.buildVisibleTileKeySet(view, player, template);
        return {
            effects: hasCombatEffects ? filterCombatEffects(instanceCombatEffects, visibleTileKeys) : [],
            aoiEffects: hasAoiEffects ? filterAoiPresentations(instanceAoiEffects, visibleTileKeys) : [],
        };
    }
    /**
 * collectNextCombatEffects：执行Next战斗Effect相关逻辑。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Next战斗Effect相关状态。
 */

    collectCombatEffects(view, player) {
        const effects = this.worldRuntimeService.getCombatEffects(view.instance.instanceId);
        if (!Array.isArray(effects) || effects.length === 0) {
            return [];
        }
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const visibleTileKeys = this.worldSyncMapSnapshotService.buildVisibleTileKeySet(view, player, template);
        return filterCombatEffects(effects, visibleTileKeys);
    }
    /**
 * collectAoiPresentations：按玩家 AOI 裁剪事件总线 AOI 表现事件。
 * @param view 玩家视图。
 * @param player 玩家状态。
 * @returns 可见 AOI 表现事件。
 */

    collectAoiPresentations(view, player) {
        const effects = this.runtimeEventBusService?.getAoiPresentations?.(view.instance.instanceId) ?? [];
        if (!Array.isArray(effects) || effects.length === 0) {
            return [];
        }
        const template = this.templateRepository.getOrThrow(view.instance.templateId);
        const visibleTileKeys = this.worldSyncMapSnapshotService.buildVisibleTileKeySet(view, player, template);
        return filterAoiPresentations(
            effects,
            visibleTileKeys,
        );
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

        if (!isServerNextMovementDebugEnabled()) {
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
        logServerNextMovement(this.logger, `sync.${phase}`, {
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
/**
 * buildCoordKey：构建并返回目标对象。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 无返回值，直接更新CoordKey相关状态。
 */

function buildCoordKey(x, y) {
    return `${x},${y}`;
}

function projectContainerRespawnEntry(entry, respawnRemainingTicks) {
    if (!entry || typeof entry !== 'object') {
        return entry;
    }
    const cacheKey = Number.isFinite(respawnRemainingTicks) ? Math.max(0, Math.trunc(respawnRemainingTicks)) : -1;
    let byTicks = containerRespawnProjectionCache.get(entry);
    if (!byTicks) {
        byTicks = new Map();
        containerRespawnProjectionCache.set(entry, byTicks);
    }
    const cached = byTicks.get(cacheKey);
    if (cached) {
        return cached;
    }
    const projected = {
        ...entry,
        respawnRemainingTicks,
    };
    if (process.env.NODE_ENV !== 'production') {
        Object.freeze(projected);
    }
    byTicks.set(cacheKey, projected);
    return projected;
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
        });
}

function filterAoiPresentations(effects, visibleTiles) {
    if (effects.length === 0 || visibleTiles.size === 0) {
        return [];
    }
    return effects
        .filter((effect) => visibleTiles.has(buildCoordKey(effect.x, effect.y)));
}
