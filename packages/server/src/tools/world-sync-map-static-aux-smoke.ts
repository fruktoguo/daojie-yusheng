import assert from 'node:assert/strict';

import { WorldSyncMapStaticAuxService } from '../network/world-sync-map-static-aux.service';

interface VisibleTile {
    type: string;
    terrainType?: string;
    surfaceType?: string | null;
    structureType?: string | null;
    walkable?: boolean;
    blocksSight?: boolean;
    aura?: number;
    resources?: Array<{
        key: string;
        label: string;
        value: number;
        effectiveValue: number;
        level: number;
        sourceValue: number;
    }>;
    movementCost?: number;
    qiDrainPerTick?: number;
    modifiedAt?: number;
}

interface VisibleTilesSnapshot {
    matrix: VisibleTile[][];
    byKey: Map<string, VisibleTile>;
}

interface BuildVisibleTilesOptions {
    specialResourceAt?: { x: number; y: number };
}

function buildVisibleTilesByKey(originX: number, originY: number, size = 3, options: BuildVisibleTilesOptions = {}): VisibleTilesSnapshot {
    const byKey = new Map<string, VisibleTile>();
    const matrix: VisibleTile[][] = [];
    for (let y = 0; y < size; y += 1) {
        const row = [];
        for (let x = 0; x < size; x += 1) {
            const wx = originX + x;
            const wy = originY + y;
            const resourceKey = options.specialResourceAt?.x === wx && options.specialResourceAt?.y === wy
                ? 'sha.refined.neutral'
                : 'aura.refined.neutral';
            const tile: VisibleTile = {
                type: 'floor',
            terrainType: 'stone_ground',
                surfaceType: 'floor',
                structureType: null,
                walkable: true,
                blocksSight: false,
                aura: 26,
                resources: [{
                    key: resourceKey,
                    label: resourceKey === 'aura.refined.neutral' ? '灵气' : '煞气',
                    value: 30765596,
                    effectiveValue: 33842156,
                    level: 26,
                    sourceValue: 0,
                }],
                modifiedAt: 1778174219098,
            };
            byKey.set(`${wx},${wy}`, tile);
            row.push(tile);
        }
        matrix.push(row);
    }
    return { matrix, byKey };
}

function createService() {
    let visibleTiles = buildVisibleTilesByKey(2, 3);
    let buildVisibleTilesSnapshotCount = 0;
    let buildMinimapMarkersCount = 0;
    const service = new WorldSyncMapStaticAuxService(
        {
            buildVisibleTilesSnapshot() {
                buildVisibleTilesSnapshotCount += 1;
                return visibleTiles;
            },
            buildVisibleTileKeySet() {
                return new Set(visibleTiles.byKey.keys());
            },
        },
        {
            buildMinimapMarkers() {
                buildMinimapMarkersCount += 1;
                return [
                    { id: 'marker.old', kind: 'npc', x: 2, y: 3, label: '旧', detail: '旧视野' },
                    { id: 'marker.new', kind: 'npc', x: 5, y: 3, label: '新', detail: '新视野' },
                ];
            },
            buildVisibleMinimapMarkers(markers, visibleTileKeys) {
                return markers.filter((marker) => visibleTileKeys.has(`${marker.x},${marker.y}`));
            },
            diffVisibleMinimapMarkers(previous, current) {
                const previousIds = new Set(previous.map((entry) => entry.id));
                const currentIds = new Set(current.map((entry) => entry.id));
                return {
                    adds: current.filter((entry) => !previousIds.has(entry.id)),
                    removes: previous.filter((entry) => !currentIds.has(entry.id)).map((entry) => entry.id),
                };
            },
        },
    );
    return {
        service,
        setVisibleTiles(nextVisibleTiles: VisibleTilesSnapshot) {
            visibleTiles = nextVisibleTiles;
        },
        getBuildVisibleTilesSnapshotCount() {
            return buildVisibleTilesSnapshotCount;
        },
        getBuildMinimapMarkersCount() {
            return buildMinimapMarkersCount;
        },
    };
}

function createView(x: number, y: number, instanceId = 'inst.a', worldRevision = 1, visibleTileKeys?: string[]) {
    return {
        instance: { templateId: 'map.a', instanceId },
        self: { x, y },
        worldRevision,
        ...(Array.isArray(visibleTileKeys) ? { visibleTileKeys } : {}),
    };
}

function createPlayer(viewRange = 1) {
    return {
        attrs: {
            numericStats: {
                viewRange,
            },
        },
    };
}

function testMovingVisibleWindowUsesTilePatchesNotMapStatic() {
    const { service, setVisibleTiles } = createService();
    const initial = service.buildInitialMapStaticState(createView(3, 4), createPlayer(), {});
    service.commitPlayerCache('player:1', initial.cacheState);

    setVisibleTiles(buildVisibleTilesByKey(3, 3));
    const plan = service.buildDeltaMapStaticPlan('player:1', createView(4, 4), createPlayer(), {});

    assert.equal(plan.mapChanged, false);
    const addedPatch = plan.tilePatches.find((patch) => patch.x === 5 && patch.y === 3);
    assert.deepEqual(addedPatch, {
        x: 5,
        y: 3,
        tile: {
            type: 'floor',
            walkable: true,
            blocksSight: false,
            aura: 26,
            modifiedAt: 1778174219098,
            terrainType: 'stone_ground',
            surfaceType: 'floor',
            structureType: null,
        },
    });
    assert.ok(plan.tilePatches.some((patch) => patch.x === 2 && patch.y === 3 && patch.tile === null));
    assert.deepEqual(plan.visibleMinimapMarkerAdds.map((entry) => entry.id), ['marker.new']);
    assert.deepEqual(plan.visibleMinimapMarkerRemoves, ['marker.old']);
}

function testTilePatchKeepsOnlyCompactSpecialResourceSignal() {
    const { service, setVisibleTiles } = createService();
    const initial = service.buildInitialMapStaticState(createView(3, 4), createPlayer(), {});
    service.commitPlayerCache('player:1', initial.cacheState);

    setVisibleTiles(buildVisibleTilesByKey(3, 3, 3, { specialResourceAt: { x: 5, y: 3 } }));
    const plan = service.buildDeltaMapStaticPlan('player:1', createView(4, 4), createPlayer(), {});
    const addedPatch = plan.tilePatches.find((patch) => patch.x === 5 && patch.y === 3);

    assert.deepEqual(addedPatch, {
        x: 5,
        y: 3,
        tile: {
            type: 'floor',
            walkable: true,
            blocksSight: false,
            aura: 26,
            resources: [{ key: 'sha.refined.neutral', level: 26 }],
            modifiedAt: 1778174219098,
            terrainType: 'stone_ground',
            surfaceType: 'floor',
            structureType: null,
        },
    });
}

function testTilePatchKeepsTileEffectProjectionFields() {
    const { service, setVisibleTiles } = createService();
    const initial = service.buildInitialMapStaticState(createView(3, 4), createPlayer(), {});
    service.commitPlayerCache('player:1', initial.cacheState);

    const nextVisibleTiles = buildVisibleTilesByKey(3, 3);
    const effectTile = nextVisibleTiles.byKey.get('5,3');
    effectTile.movementCost = 9280;
    effectTile.qiDrainPerTick = 73455;
    setVisibleTiles(nextVisibleTiles);
    const plan = service.buildDeltaMapStaticPlan('player:1', createView(4, 4), createPlayer(), {});
    const addedPatch = plan.tilePatches.find((patch) => patch.x === 5 && patch.y === 3);

    assert.deepEqual(addedPatch, {
        x: 5,
        y: 3,
        tile: {
            type: 'floor',
            walkable: true,
            blocksSight: false,
            aura: 26,
            movementCost: 9280,
            qiDrainPerTick: 73455,
            modifiedAt: 1778174219098,
            terrainType: 'stone_ground',
            surfaceType: 'floor',
            structureType: null,
        },
    });
}

function testTilePatchKeepsAuthorityTraversalAndLayerFields() {
    const { service, setVisibleTiles } = createService();
    const initial = service.buildInitialMapStaticState(createView(3, 4), createPlayer(), {});
    service.commitPlayerCache('player:1', initial.cacheState);

    const nextVisibleTiles = buildVisibleTilesByKey(3, 3);
    const projectedTile = nextVisibleTiles.byKey.get('5,3');
    projectedTile.type = 'stone';
    projectedTile.walkable = true;
    projectedTile.blocksSight = false;
    projectedTile.terrainType = 'stone_ground';
    projectedTile.surfaceType = null;
    projectedTile.structureType = null;
    projectedTile.modifiedAt = 1778174999999;
    setVisibleTiles(nextVisibleTiles);
    const plan = service.buildDeltaMapStaticPlan('player:1', createView(4, 4), createPlayer(), {});
    const addedPatch = plan.tilePatches.find((patch) => patch.x === 5 && patch.y === 3);

    assert.deepEqual(addedPatch, {
        x: 5,
        y: 3,
        tile: {
            type: 'stone',
            walkable: true,
            blocksSight: false,
            aura: 26,
            modifiedAt: 1778174999999,
            terrainType: 'stone_ground',
            surfaceType: null,
            structureType: null,
        },
    });
}

function testInstanceChangeStillRequiresMapStatic() {
    const { service, setVisibleTiles } = createService();
    const initial = service.buildInitialMapStaticState(createView(3, 4), createPlayer(), {});
    service.commitPlayerCache('player:1', initial.cacheState);

    setVisibleTiles(buildVisibleTilesByKey(3, 3));
    const plan = service.buildDeltaMapStaticPlan('player:1', createView(4, 4, 'inst.b'), createPlayer(), {});

    assert.equal(plan.mapChanged, true);
    assert.deepEqual(plan.tilePatches, []);
    assert.deepEqual(plan.visibleMinimapMarkerAdds, []);
    assert.deepEqual(plan.visibleMinimapMarkerRemoves, []);
}

function testUnchangedWorldRevisionSkipsVisibleTilePlan() {
    const { service, getBuildVisibleTilesSnapshotCount, getBuildMinimapMarkersCount } = createService();
    const player = createPlayer();
    const initial = service.buildInitialMapStaticState(createView(3, 4, 'inst.a', 7), player, {});
    service.commitPlayerCache('player:1', initial.cacheState);
    assert.equal(getBuildVisibleTilesSnapshotCount(), 1);
    assert.equal(getBuildMinimapMarkersCount(), 1);

    const plan: any = service.buildDeltaMapStaticPlan('player:1', createView(3, 4, 'inst.a', 7), player, {});

    assert.equal(plan.reusedCache, true);
    assert.equal(plan.mapChanged, false);
    assert.deepEqual(plan.tilePatches, []);
    assert.deepEqual(plan.visibleMinimapMarkerAdds, []);
    assert.deepEqual(plan.visibleMinimapMarkerRemoves, []);
    assert.equal(getBuildVisibleTilesSnapshotCount(), 1);
    assert.equal(getBuildMinimapMarkersCount(), 1);
}

function testInstanceDirtyDiffOnlyProjectsDirtyVisibleTiles() {
    let buildVisibleTilesSnapshotCount = 0;
    let buildCompositeTileSyncStateCount = 0;
    const initialTile = { type: 'floor', walkable: true, blocksSight: false, aura: 26 };
    const changedTile = { type: 'wall', walkable: false, blocksSight: true, aura: 26 };
    const visibleTiles = {
        matrix: [[initialTile, initialTile]],
        byKey: new Map([
            ['3,4', initialTile],
            ['4,4', initialTile],
        ]),
    };
    const service = new WorldSyncMapStaticAuxService(
        {
            buildVisibleTilesSnapshot() {
                buildVisibleTilesSnapshotCount += 1;
                return visibleTiles;
            },
            getInstanceStaticTileSyncRevision() {
                return 0;
            },
            buildInstanceStaticTileDiffPlan() {
                return {
                    fromRevision: 0,
                    toRevision: 1,
                    dirtyTileKeys: ['4,4', '9,9'],
                };
            },
            buildCompositeTileSyncState(_view: unknown, _template: unknown, x: number, y: number) {
                buildCompositeTileSyncStateCount += 1;
                return x === 4 && y === 4 ? changedTile : null;
            },
        },
        {
            buildMinimapMarkers() {
                return [];
            },
            buildVisibleMinimapMarkers() {
                return [];
            },
            diffVisibleMinimapMarkers() {
                return { adds: [], removes: [] };
            },
        },
    );
    const player = createPlayer();
    const view = createView(3, 4, 'inst.a', 1, ['3,4', '4,4']);
    const initial = service.buildInitialMapStaticState(view, player, {});
    service.commitPlayerCache('player:1', initial.cacheState);
    assert.equal(buildVisibleTilesSnapshotCount, 1);

    const plan: any = service.buildDeltaMapStaticPlan('player:1', view, player, {});

    assert.equal(plan.instanceDirtyDiff, true);
    assert.equal(buildVisibleTilesSnapshotCount, 1);
    assert.equal(buildCompositeTileSyncStateCount, 1);
    assert.deepEqual(plan.tilePatches, [{
        x: 4,
        y: 4,
        tile: {
            type: 'wall',
            walkable: false,
            blocksSight: true,
            aura: 26,
        },
    }]);
    assert.equal(plan.cacheState.staticSyncRevision, 1);
}

function testInstanceDirtyDiffFallsBackWhenVisibleKeysMissing() {
    let buildVisibleTilesSnapshotCount = 0;
    let buildCompositeTileSyncStateCount = 0;
    const initialTile = { type: 'floor', walkable: true, blocksSight: false };
    const visibleTiles = {
        matrix: [[initialTile]],
        byKey: new Map([['3,4', initialTile]]),
    };
    const service = new WorldSyncMapStaticAuxService(
        {
            buildVisibleTilesSnapshot() {
                buildVisibleTilesSnapshotCount += 1;
                return visibleTiles;
            },
            getInstanceStaticTileSyncRevision() {
                return 0;
            },
            buildInstanceStaticTileDiffPlan() {
                return {
                    fromRevision: 0,
                    toRevision: 1,
                    dirtyTileKeys: ['3,4'],
                };
            },
            buildCompositeTileSyncState() {
                buildCompositeTileSyncStateCount += 1;
                return null;
            },
        },
        {
            buildMinimapMarkers() {
                return [];
            },
            buildVisibleMinimapMarkers() {
                return [];
            },
            diffVisibleMinimapMarkers() {
                return { adds: [], removes: [] };
            },
        },
    );
    const player = createPlayer();
    const initial = service.buildInitialMapStaticState(createView(3, 4, 'inst.a', 1), player, {});
    service.commitPlayerCache('player:1', initial.cacheState);

    const plan: any = service.buildDeltaMapStaticPlan('player:1', createView(3, 4, 'inst.a', 1), player, {});

    assert.equal(plan.instanceDirtyDiff, undefined);
    assert.equal(buildVisibleTilesSnapshotCount, 2);
    assert.equal(buildCompositeTileSyncStateCount, 0);
}

testMovingVisibleWindowUsesTilePatchesNotMapStatic();
testTilePatchKeepsOnlyCompactSpecialResourceSignal();
testTilePatchKeepsTileEffectProjectionFields();
testTilePatchKeepsAuthorityTraversalAndLayerFields();
testInstanceChangeStillRequiresMapStatic();
testUnchangedWorldRevisionSkipsVisibleTilePlan();
testInstanceDirtyDiffOnlyProjectsDirtyVisibleTiles();
testInstanceDirtyDiffFallsBackWhenVisibleKeysMissing();

console.log(JSON.stringify({ ok: true, case: 'world-sync-map-static-aux' }, null, 2));
