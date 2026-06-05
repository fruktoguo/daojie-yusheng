/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable } from '@nestjs/common';
import { WorldSyncMapSnapshotService } from './world-sync-map-snapshot.service';
import { WorldSyncMinimapService } from './world-sync-minimap.service';

const compactTileResourcesBySource = new WeakMap<any[], any[]>();

/** map/static aux cache 服务：承接 player 级 map cache 与 tile/minimap patch 规划。 */
@Injectable()
export class WorldSyncMapStaticAuxService {
/**
 * worldSyncMapSnapshotService：世界Sync地图快照服务引用。
 */

    worldSyncMapSnapshotService;    
    /**
 * worldSyncMinimapService：世界SyncMinimap服务引用。
 */

    worldSyncMinimapService;    
    /**
 * cacheByPlayerId：缓存By玩家ID标识。
 */

    cacheByPlayerId = new Map();    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldSyncMapSnapshotService 参数说明。
 * @param worldSyncMinimapService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(WorldSyncMapSnapshotService) worldSyncMapSnapshotService: any,
        @Inject(WorldSyncMinimapService) worldSyncMinimapService: any,
    ) {
        this.worldSyncMapSnapshotService = worldSyncMapSnapshotService;
        this.worldSyncMinimapService = worldSyncMinimapService;
    }    
    /**
 * buildInitialMapStaticState：构建并返回目标对象。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @param template 参数说明。
 * @returns 无返回值，直接更新Initial地图Static状态相关状态。
 */

    buildInitialMapStaticState(view, player, template) {

        const visibleTiles = this.worldSyncMapSnapshotService.buildVisibleTilesSnapshot(view, player, template);

        const allMinimapMarkers = this.worldSyncMinimapService.buildMinimapMarkers(template);

        const visibleMinimapMarkers = this.worldSyncMinimapService.buildVisibleMinimapMarkers(allMinimapMarkers, visibleTiles.byKey);
        const staticSyncRevision = typeof this.worldSyncMapSnapshotService.getInstanceStaticTileSyncRevision === 'function'
            ? this.worldSyncMapSnapshotService.getInstanceStaticTileSyncRevision(view)
            : normalizeRevision(view.worldRevision);
        return {
            visibleTiles,
            visibleMinimapMarkers,
            cacheState: buildCacheState(view, visibleTiles, visibleMinimapMarkers, staticSyncRevision),
        };
    }    
    /**
 * buildDeltaMapStaticPlan：构建并返回目标对象。
 * @param playerId 玩家 ID。
 * @param view 参数说明。
 * @param player 玩家对象。
 * @param template 参数说明。
 * @returns 无返回值，直接更新Delta地图StaticPlan相关状态。
 */

    buildDeltaMapStaticPlan(playerId, view, player, template) {

        const previous = this.cacheByPlayerId.get(playerId) ?? null;
        const instanceStaticPlan = typeof this.worldSyncMapSnapshotService.buildInstanceStaticTileDiffPlan === 'function'
            ? this.worldSyncMapSnapshotService.buildInstanceStaticTileDiffPlan(view, template)
            : null;
        const staticSyncRevision = instanceStaticPlan
            ? normalizeRevision(instanceStaticPlan.toRevision)
            : normalizeRevision(view.worldRevision);
        const unchangedPlan = buildUnchangedDeltaMapStaticPlan(previous, view, player, staticSyncRevision);
        if (unchangedPlan) {
            return unchangedPlan;
        }
        const instanceDirtyPlan = buildInstanceDirtyDeltaMapStaticPlan(
            this.worldSyncMapSnapshotService,
            previous,
            view,
            player,
            template,
            instanceStaticPlan,
        );
        if (instanceDirtyPlan) {
            return instanceDirtyPlan;
        }

        const previousVisibleTiles = previous?.visibleTiles instanceof Map
            ? new Map(previous.visibleTiles)
            : previous?.visibleTiles;
        const visibleTiles = this.worldSyncMapSnapshotService.buildVisibleTilesSnapshot(view, player, template);

        const allMinimapMarkers = this.worldSyncMinimapService.buildMinimapMarkers(template);

        const visibleMinimapMarkers = this.worldSyncMinimapService.buildVisibleMinimapMarkers(allMinimapMarkers, visibleTiles.byKey);

        const mapChanged = !previous
            || previous.mapId !== view.instance.templateId
            || previous.instanceId !== view.instance.instanceId;

        const tilePatches = mapChanged
            ? []
            : diffVisibleTiles(previousVisibleTiles, visibleTiles.byKey);

        const markerPatch = mapChanged
            ? { adds: [], removes: [] }
            : this.worldSyncMinimapService.diffVisibleMinimapMarkers(previous.visibleMinimapMarkers, visibleMinimapMarkers);
        return {
            mapChanged,
            visibleTiles,
            visibleMinimapMarkers,
            tilePatches,
            visibleMinimapMarkerAdds: markerPatch.adds,
            visibleMinimapMarkerRemoves: markerPatch.removes,
            cacheState: buildCacheState(view, visibleTiles, visibleMinimapMarkers, staticSyncRevision),
        };
    }    
    /**
 * commitPlayerCache：执行commit玩家缓存相关逻辑。
 * @param playerId 玩家 ID。
 * @param cacheState 参数说明。
 * @returns 无返回值，直接更新commit玩家缓存相关状态。
 */

    commitPlayerCache(playerId, cacheState) {
        this.cacheByPlayerId.set(playerId, cacheState);
    }    
    /**
 * clearPlayerCache：执行clear玩家缓存相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clear玩家缓存相关状态。
 */

    clearPlayerCache(playerId) {
        this.cacheByPlayerId.delete(playerId);
    }
};
/**
 * buildCacheState：构建并返回目标对象。
 * @param view 参数说明。
 * @param visibleTiles 参数说明。
 * @param visibleMinimapMarkers 参数说明。
 * @returns 无返回值，直接更新缓存状态相关状态。
 */

function buildCacheState(view, visibleTiles, visibleMinimapMarkers, staticSyncRevision = normalizeRevision(view.worldRevision)) {
    return {
        mapId: view.instance.templateId,
        instanceId: view.instance.instanceId,
        worldRevision: normalizeRevision(view.worldRevision),
        staticSyncRevision: normalizeRevision(staticSyncRevision),
        viewRadius: resolveVisibleTilesRadius(visibleTiles.matrix, view),
        tilesOriginX: resolveVisibleTilesOriginX(view, visibleTiles.matrix),
        tilesOriginY: resolveVisibleTilesOriginY(view, visibleTiles.matrix),
        visibleTiles: visibleTiles.byKey,
        visibleTilesMatrix: visibleTiles.matrix,
        visibleMinimapMarkers,
    };
}

function buildUnchangedDeltaMapStaticPlan(previous, view, player, staticSyncRevision = normalizeRevision(view.worldRevision)) {
    if (!previous) {
        return null;
    }
    const viewRadius = resolvePlayerViewRadius(player, view);
    const tilesOriginX = view.self.x - viewRadius;
    const tilesOriginY = view.self.y - viewRadius;
    if (previous.mapId !== view.instance.templateId
        || previous.instanceId !== view.instance.instanceId
        || normalizeRevision(previous.staticSyncRevision ?? previous.worldRevision) !== normalizeRevision(staticSyncRevision)
        || previous.viewRadius !== viewRadius
        || previous.tilesOriginX !== tilesOriginX
        || previous.tilesOriginY !== tilesOriginY) {
        return null;
    }
    return {
        mapChanged: false,
        visibleTiles: { matrix: previous.visibleTilesMatrix ?? [], byKey: previous.visibleTiles },
        visibleMinimapMarkers: previous.visibleMinimapMarkers,
        tilePatches: [],
        visibleMinimapMarkerAdds: [],
        visibleMinimapMarkerRemoves: [],
        cacheState: previous,
        reusedCache: true,
    };
}

function buildInstanceDirtyDeltaMapStaticPlan(snapshotService, previous, view, player, template, instanceStaticPlan) {
    if (!previous || !instanceStaticPlan || !Array.isArray(instanceStaticPlan.dirtyTileKeys)) {
        return null;
    }
    if (previous.mapId !== view.instance.templateId || previous.instanceId !== view.instance.instanceId) {
        return null;
    }
    const previousRevision = normalizeRevision(previous.staticSyncRevision ?? previous.worldRevision);
    const fromRevision = normalizeRevision(instanceStaticPlan.fromRevision);
    const toRevision = normalizeRevision(instanceStaticPlan.toRevision);
    if (previousRevision < fromRevision || previousRevision > toRevision) {
        return null;
    }
    if (!isVisibleTileSetUnchanged(previous, view)) {
        return null;
    }
    const nextVisibleTiles = new Map(previous.visibleTiles);
    const tilePatches = [];
    for (const key of instanceStaticPlan.dirtyTileKeys) {
        if (!previous.visibleTiles?.has?.(key)) {
            continue;
        }
        const [x, y] = parseCoordKey(key);
        const tile = typeof snapshotService.buildCompositeTileSyncState === 'function'
            ? snapshotService.buildCompositeTileSyncState(view, template, x, y, player)
            : null;
        const previousTile = previous.visibleTiles.get(key) ?? null;
        if (tile) {
            nextVisibleTiles.set(key, tile);
            if (!previousTile || !isSameTile(previousTile, tile)) {
                tilePatches.push({ x, y, tile: cloneTilePatch(tile) });
            }
            continue;
        }
        nextVisibleTiles.delete(key);
        if (previousTile) {
            tilePatches.push({ x, y, tile: null });
        }
    }
    return {
        mapChanged: false,
        visibleTiles: { matrix: [], byKey: nextVisibleTiles },
        visibleMinimapMarkers: previous.visibleMinimapMarkers,
        tilePatches,
        visibleMinimapMarkerAdds: [],
        visibleMinimapMarkerRemoves: [],
        cacheState: {
            ...previous,
            worldRevision: normalizeRevision(view.worldRevision),
            staticSyncRevision: toRevision,
            visibleTiles: nextVisibleTiles,
            visibleMinimapMarkers: previous.visibleMinimapMarkers,
        },
        instanceDirtyDiff: true,
    };
}

function isVisibleTileSetUnchanged(previous, view) {
    const keys = Array.isArray(view?.visibleTileKeys) ? view.visibleTileKeys : null;
    if (!keys || keys.length === 0) {
        return false;
    }
    if (!(previous?.visibleTiles instanceof Map) || previous.visibleTiles.size !== keys.length) {
        return false;
    }
    for (const key of keys) {
        if (!previous.visibleTiles.has(String(key))) {
            return false;
        }
    }
    return true;
}

function resolvePlayerViewRadius(player, view) {
    const numericRange = Number(player?.attrs?.numericStats?.viewRange);
    if (Number.isFinite(numericRange)) {
        return Math.max(1, Math.round(numericRange));
    }
    return resolveRadiusFromVisibleTileKeys(view);
}

function resolveVisibleTilesRadius(matrix, view) {
    return Array.isArray(matrix) && matrix.length > 0
        ? Math.max(0, Math.floor((matrix.length - 1) / 2))
        : resolveRadiusFromVisibleTileKeys(view);
}

function normalizeRevision(value) {
    const revision = Number(value);
    return Number.isFinite(revision) ? Math.trunc(revision) : 0;
}

function resolveVisibleTilesOriginX(view, matrix) {
    const radius = resolveVisibleTilesRadius(matrix, view);
    return view.self.x - radius;
}

function resolveVisibleTilesOriginY(view, matrix) {
    const radius = resolveVisibleTilesRadius(matrix, view);
    return view.self.y - radius;
}

function resolveRadiusFromVisibleTileKeys(view) {
    const keys = Array.isArray(view?.visibleTileKeys) ? view.visibleTileKeys : [];
    let maxDistance = 0;
    for (const key of keys) {
        const [x, y] = parseCoordKey(String(key));
        maxDistance = Math.max(maxDistance, Math.abs(x - view.self.x), Math.abs(y - view.self.y));
    }
    return Math.max(1, maxDistance);
}
/**
 * diffVisibleTiles：判断diff可见Tile是否满足条件。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 无返回值，直接更新diff可见Tile相关状态。
 */

function diffVisibleTiles(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const patches = [];
    for (const [key, tile] of current) {
        const prev = previous?.get(key) ?? null;
        if (prev === tile) {
            continue;
        }
        if (!prev || !isSameTile(prev, tile)) {
            const [x, y] = parseCoordKey(key);
            patches.push({ x, y, tile: cloneTilePatch(tile) });
        }
    }
    if (previous) {
        for (const key of previous.keys()) {
            if (current.has(key)) {
                continue;
            }
            const [x, y] = parseCoordKey(key);
            patches.push({ x, y, tile: null });
        }
    }
    return patches;
}

function cloneTilePatch(source) {
    const tile: Record<string, any> = {
        type: source.type,
    };
    if (typeof source.walkable === 'boolean') {
        tile.walkable = source.walkable;
    }
    if (typeof source.blocksSight === 'boolean') {
        tile.blocksSight = source.blocksSight;
    }
    if (Number.isFinite(source.aura) && source.aura > 0) {
        tile.aura = source.aura;
    }
    if (Number.isFinite(source.movementCost) && source.movementCost > 0) {
        tile.movementCost = Math.max(1, Math.trunc(source.movementCost));
    }
    if (Number.isFinite(source.qiDrainPerTick) && source.qiDrainPerTick > 0) {
        tile.qiDrainPerTick = Math.max(0, Math.trunc(source.qiDrainPerTick));
    }
    const resources = cloneCompactTileResources(source.resources);
    if (resources && resources.length > 0) {
        tile.resources = resources;
    }
    if (source.hpVisible === true && Number.isFinite(source.hp) && Number.isFinite(source.maxHp)) {
        tile.hp = source.hp;
        tile.maxHp = source.maxHp;
        tile.hpVisible = true;
    }
    if (typeof source.modifiedAt === 'number' && Number.isFinite(source.modifiedAt)) {
        tile.modifiedAt = source.modifiedAt;
    }
    if (typeof source.terrainType === 'string' && source.terrainType.length > 0) {
        tile.terrainType = source.terrainType;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'surfaceType')) {
        tile.surfaceType = typeof source.surfaceType === 'string' && source.surfaceType.length > 0 ? source.surfaceType : null;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'structureType')) {
        tile.structureType = typeof source.structureType === 'string' && source.structureType.length > 0 ? source.structureType : null;
    }
    if (Array.isArray(source.interactableKinds) && source.interactableKinds.length > 0) {
        const interactableKinds = [];
        for (const kind of source.interactableKinds) {
            if (typeof kind === 'string' && kind.length > 0) {
                interactableKinds.push(kind);
            }
        }
        if (interactableKinds.length > 0) {
            tile.interactableKinds = interactableKinds;
        }
    }
    return tile;
}

function cloneCompactTileResources(resources) {
    if (!Array.isArray(resources) || resources.length === 0) {
        return undefined;
    }
    const cached = compactTileResourcesBySource.get(resources);
    if (cached) {
        return cached.length > 0 ? cached : undefined;
    }
    const compact = [];
    for (const resource of resources) {
        if (!resource || typeof resource.key !== 'string' || resource.key === 'aura.refined.neutral') {
            continue;
        }
        const level = Number(resource.level);
        compact.push({
            key: resource.key,
            ...(Number.isFinite(level) ? { level } : {}),
        });
    }
    compactTileResourcesBySource.set(resources, compact);
    return compact.length > 0 ? compact : undefined;
}
/**
 * parseCoordKey：规范化或转换CoordKey。
 * @param key 参数说明。
 * @returns 无返回值，直接更新CoordKey相关状态。
 */

function parseCoordKey(key) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const separatorIndex = key.indexOf(',');
    if (separatorIndex < 0) {
        return [0, 0];
    }
    return [
        Number(key.slice(0, separatorIndex)),
        Number(key.slice(separatorIndex + 1)),
    ];
}
/**
 * isSameTile：判断SameTile是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameTile的条件判断。
 */

function isSameTile(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.type === right.type
        && left.walkable === right.walkable
        && left.blocksSight === right.blocksSight
        && left.aura === right.aura
        && left.movementCost === right.movementCost
        && left.qiDrainPerTick === right.qiDrainPerTick
        && isSameTileResourceList(left.resources, right.resources)
        && left.occupiedBy === right.occupiedBy
        && left.modifiedAt === right.modifiedAt
        && left.hp === right.hp
        && left.maxHp === right.maxHp
        && left.hpVisible === right.hpVisible
        && left.terrainType === right.terrainType
        && left.surfaceType === right.surfaceType
        && left.structureType === right.structureType
        && isSameStringList(left.interactableKinds, right.interactableKinds)
        && left.hiddenEntrance?.portalId === right.hiddenEntrance?.portalId
        && left.hiddenEntrance?.portalKind === right.hiddenEntrance?.portalKind
        && left.hiddenEntrance?.portalTargetMapId === right.hiddenEntrance?.portalTargetMapId;
}

function isSameStringList(left, right) {
  if (left === right) {
    return true;
  }
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function isSameTileResourceList(left, right) {
  if (left === right) {
    return true;
  }
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.key !== right[index]?.key
      || left[index]?.label !== right[index]?.label
      || left[index]?.value !== right[index]?.value
      || left[index]?.effectiveValue !== right[index]?.effectiveValue
      || left[index]?.level !== right[index]?.level
      || left[index]?.sourceValue !== right[index]?.sourceValue) {
      return false;
    }
  }
  return true;
}
