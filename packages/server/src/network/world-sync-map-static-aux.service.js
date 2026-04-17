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
exports.WorldSyncMapStaticAuxService = void 0;

const common_1 = require("@nestjs/common");

const world_sync_map_snapshot_service_1 = require("./world-sync-map-snapshot.service");

const world_sync_minimap_service_1 = require("./world-sync-minimap.service");

/** map/static aux cache 服务：承接 player 级 map cache 与 tile/minimap patch 规划。 */
let WorldSyncMapStaticAuxService = class WorldSyncMapStaticAuxService {
    worldSyncMapSnapshotService;
    worldSyncMinimapService;
    cacheByPlayerId = new Map();
    constructor(worldSyncMapSnapshotService, worldSyncMinimapService) {
        this.worldSyncMapSnapshotService = worldSyncMapSnapshotService;
        this.worldSyncMinimapService = worldSyncMinimapService;
    }
    buildInitialMapStaticState(view, player, template) {

        const visibleTiles = this.worldSyncMapSnapshotService.buildVisibleTilesSnapshot(view, player, template);

        const allMinimapMarkers = this.worldSyncMinimapService.buildMinimapMarkers(template);

        const visibleMinimapMarkers = this.worldSyncMinimapService.buildVisibleMinimapMarkers(allMinimapMarkers, visibleTiles.byKey);
        return {
            visibleTiles,
            visibleMinimapMarkers,
            cacheState: buildCacheState(view, visibleTiles.byKey, visibleMinimapMarkers),
        };
    }
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
            cacheState: buildCacheState(view, visibleTiles.byKey, visibleMinimapMarkers),
        };
    }
    commitPlayerCache(playerId, cacheState) {
        this.cacheByPlayerId.set(playerId, cacheState);
    }
    clearPlayerCache(playerId) {
        this.cacheByPlayerId.delete(playerId);
    }
};
exports.WorldSyncMapStaticAuxService = WorldSyncMapStaticAuxService;
exports.WorldSyncMapStaticAuxService = WorldSyncMapStaticAuxService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_sync_map_snapshot_service_1.WorldSyncMapSnapshotService,
        world_sync_minimap_service_1.WorldSyncMinimapService])
], WorldSyncMapStaticAuxService);
function buildCacheState(view, visibleTiles, visibleMinimapMarkers) {
    return {
        mapId: view.instance.templateId,
        instanceId: view.instance.instanceId,
        visibleTiles: new Map(Array.from(visibleTiles.entries(), ([key, tile]) => [key, cloneTile(tile)])),
        visibleMinimapMarkers: visibleMinimapMarkers.map((entry) => cloneMinimapMarker(entry)),
    };
}
function diffVisibleTiles(previous, current) {

    const patches = [];
    for (const [key, tile] of current) {
        const prev = previous?.get(key) ?? null;
        if (!prev || !isSameTile(prev, tile)) {
            const [x, y] = parseCoordKey(key);
            patches.push({ x, y, tile: cloneTile(tile) });
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
function parseCoordKey(key) {

    const separatorIndex = key.indexOf(',');
    if (separatorIndex < 0) {
        return [0, 0];
    }
    return [
        Number(key.slice(0, separatorIndex)),
        Number(key.slice(separatorIndex + 1)),
    ];
}
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
function cloneTile(source) {
    return {
        ...source,
        hiddenEntrance: source.hiddenEntrance ? { ...source.hiddenEntrance } : undefined,
    };
}
function isSameTile(left, right) {
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
        && left.occupiedBy === right.occupiedBy
        && left.modifiedAt === right.modifiedAt
        && left.hp === right.hp
        && left.maxHp === right.maxHp
        && left.hiddenEntrance?.portalId === right.hiddenEntrance?.portalId
        && left.hiddenEntrance?.portalKind === right.hiddenEntrance?.portalKind
        && left.hiddenEntrance?.portalTargetMapId === right.hiddenEntrance?.portalTargetMapId;
}
