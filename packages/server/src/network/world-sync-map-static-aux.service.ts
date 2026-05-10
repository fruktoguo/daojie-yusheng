import { Inject, Injectable } from '@nestjs/common';
import { WorldSyncMapSnapshotService } from './world-sync-map-snapshot.service';
import { WorldSyncMinimapService } from './world-sync-minimap.service';

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
        return {
            visibleTiles,
            visibleMinimapMarkers,
            cacheState: buildCacheState(view, visibleTiles, visibleMinimapMarkers),
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

        const visibleTiles = this.worldSyncMapSnapshotService.buildVisibleTilesSnapshot(view, player, template);

        const currentVisibleTileKeys = this.worldSyncMapSnapshotService.buildVisibleTileKeySet(view, player, template);

        const allMinimapMarkers = this.worldSyncMinimapService.buildMinimapMarkers(template);

        const visibleMinimapMarkers = this.worldSyncMinimapService.buildVisibleMinimapMarkers(allMinimapMarkers, currentVisibleTileKeys);

        const previous = this.cacheByPlayerId.get(playerId) ?? null;
        const mapChanged = !previous
            || previous.mapId !== view.instance.templateId
            || previous.instanceId !== view.instance.instanceId;

        const tilePatches = mapChanged
            ? []
            : diffVisibleTiles(previous.visibleTiles, visibleTiles.byKey);

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
            cacheState: buildCacheState(view, visibleTiles, visibleMinimapMarkers),
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

function buildCacheState(view, visibleTiles, visibleMinimapMarkers) {
    return {
        mapId: view.instance.templateId,
        instanceId: view.instance.instanceId,
        tilesOriginX: resolveVisibleTilesOriginX(view, visibleTiles.matrix),
        tilesOriginY: resolveVisibleTilesOriginY(view, visibleTiles.matrix),
        visibleTiles: new Map(Array.from(visibleTiles.byKey.entries(), ([key, tile]) => [key, cloneTile(tile)])),
        visibleMinimapMarkers: visibleMinimapMarkers.map((entry) => cloneMinimapMarker(entry)),
    };
}

function resolveVisibleTilesOriginX(view, matrix) {
    const radius = Array.isArray(matrix) && matrix.length > 0
        ? Math.max(0, Math.floor((matrix.length - 1) / 2))
        : resolveRadiusFromVisibleTileKeys(view);
    return view.self.x - radius;
}

function resolveVisibleTilesOriginY(view, matrix) {
    const radius = Array.isArray(matrix) && matrix.length > 0
        ? Math.max(0, Math.floor((matrix.length - 1) / 2))
        : resolveRadiusFromVisibleTileKeys(view);
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
    return tile;
}

function cloneCompactTileResources(resources) {
    if (!Array.isArray(resources) || resources.length === 0) {
        return undefined;
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
 * cloneMinimapMarker：构建MinimapMarker。
 * @param source 来源对象。
 * @returns 无返回值，直接更新MinimapMarker相关状态。
 */

function cloneMinimapMarker(source) {
    return {
        id: source.id,
        kind: source.kind,
        x: source.x,
        y: source.y,
        label: source.label,
        detail: source.detail,
    };
}
/**
 * cloneTile：构建Tile。
 * @param source 来源对象。
 * @returns 无返回值，直接更新Tile相关状态。
 */

function cloneTile(source) {
    return {
        ...source,
        resources: source.resources?.map((entry) => ({ ...entry })),
        hiddenEntrance: source.hiddenEntrance ? { ...source.hiddenEntrance } : undefined,
    };
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
