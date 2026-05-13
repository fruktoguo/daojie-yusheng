// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldSyncMapStaticAuxService } = require("../network/world-sync-map-static-aux.service");

function buildVisibleTilesByKey(originX, originY, size = 3, options = {}) {
    const byKey = new Map();
    const matrix = [];
    for (let y = 0; y < size; y += 1) {
        const row = [];
        for (let x = 0; x < size; x += 1) {
            const wx = originX + x;
            const wy = originY + y;
            const resourceKey = options.specialResourceAt?.x === wx && options.specialResourceAt?.y === wy
                ? 'sha.refined.neutral'
                : 'aura.refined.neutral';
            const tile = {
                type: 'floor',
                terrainType: 'floor',
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
    const service = new WorldSyncMapStaticAuxService(
        {
            buildVisibleTilesSnapshot() {
                return visibleTiles;
            },
            buildVisibleTileKeySet() {
                return new Set(visibleTiles.byKey.keys());
            },
        },
        {
            buildMinimapMarkers() {
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
        setVisibleTiles(nextVisibleTiles) {
            visibleTiles = nextVisibleTiles;
        },
    };
}

function createView(x, y, instanceId = 'inst.a') {
    return {
        instance: { templateId: 'map.a', instanceId },
        self: { x, y },
    };
}

function testMovingVisibleWindowUsesTilePatchesNotMapStatic() {
    const { service, setVisibleTiles } = createService();
    const initial = service.buildInitialMapStaticState(createView(3, 4), {}, {});
    service.commitPlayerCache('player:1', initial.cacheState);

    setVisibleTiles(buildVisibleTilesByKey(3, 3));
    const plan = service.buildDeltaMapStaticPlan('player:1', createView(4, 4), {}, {});

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
            terrainType: 'floor',
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
    const initial = service.buildInitialMapStaticState(createView(3, 4), {}, {});
    service.commitPlayerCache('player:1', initial.cacheState);

    setVisibleTiles(buildVisibleTilesByKey(3, 3, 3, { specialResourceAt: { x: 5, y: 3 } }));
    const plan = service.buildDeltaMapStaticPlan('player:1', createView(4, 4), {}, {});
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
            terrainType: 'floor',
            surfaceType: 'floor',
            structureType: null,
        },
    });
}

function testTilePatchKeepsTileEffectProjectionFields() {
    const { service, setVisibleTiles } = createService();
    const initial = service.buildInitialMapStaticState(createView(3, 4), {}, {});
    service.commitPlayerCache('player:1', initial.cacheState);

    const nextVisibleTiles = buildVisibleTilesByKey(3, 3);
    const effectTile = nextVisibleTiles.byKey.get('5,3');
    effectTile.movementCost = 9280;
    effectTile.qiDrainPerTick = 73455;
    setVisibleTiles(nextVisibleTiles);
    const plan = service.buildDeltaMapStaticPlan('player:1', createView(4, 4), {}, {});
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
            terrainType: 'floor',
            surfaceType: 'floor',
            structureType: null,
        },
    });
}

function testTilePatchKeepsAuthorityTraversalAndLayerFields() {
    const { service, setVisibleTiles } = createService();
    const initial = service.buildInitialMapStaticState(createView(3, 4), {}, {});
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
    const plan = service.buildDeltaMapStaticPlan('player:1', createView(4, 4), {}, {});
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
    const initial = service.buildInitialMapStaticState(createView(3, 4), {}, {});
    service.commitPlayerCache('player:1', initial.cacheState);

    setVisibleTiles(buildVisibleTilesByKey(3, 3));
    const plan = service.buildDeltaMapStaticPlan('player:1', createView(4, 4, 'inst.b'), {}, {});

    assert.equal(plan.mapChanged, true);
    assert.deepEqual(plan.tilePatches, []);
    assert.deepEqual(plan.visibleMinimapMarkerAdds, []);
    assert.deepEqual(plan.visibleMinimapMarkerRemoves, []);
}

testMovingVisibleWindowUsesTilePatchesNotMapStatic();
testTilePatchKeepsOnlyCompactSpecialResourceSignal();
testTilePatchKeepsTileEffectProjectionFields();
testTilePatchKeepsAuthorityTraversalAndLayerFields();
testInstanceChangeStillRequiresMapStatic();

console.log(JSON.stringify({ ok: true, case: 'world-sync-map-static-aux' }, null, 2));
