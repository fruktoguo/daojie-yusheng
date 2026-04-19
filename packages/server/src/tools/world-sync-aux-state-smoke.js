"use strict";

const assert = require("node:assert/strict");

const { WorldSyncAuxStateService } = require("../network/world-sync-aux-state.service");

function createService(log = []) {
    let lootWindow = {
        tileX: 4,
        tileY: 5,
        title: '初始拾取',
        sources: [],
    };
    const service = new WorldSyncAuxStateService({
        getOrThrow(mapId) {
            log.push(['getTemplate', mapId]);
            return { id: mapId };
        },
    }, {
        buildRenderEntitiesSnapshot() {
            return new Map([['player:1', { id: 'player:1', x: 3, y: 4 }]]);
        },
        buildMinimapLibrarySync() {
            return [{ mapId: 'map.a' }];
        },
        buildGameTimeState() {
            return {
                totalTicks: 10,
                localTicks: 10,
                dayLength: 120,
                timeScale: 1,
                phase: 'day',
                phaseLabel: '白昼',
                darknessStacks: 0,
            };
        },
        buildMapMetaSync(template) {
            return { mapId: template.id };
        },
    }, {
        buildInitialMapStaticState() {
            return {
                visibleTiles: { matrix: [[{ type: 'floor' }]], byKey: new Map([['3,4', { type: 'floor' }]]) },
                visibleMinimapMarkers: [{ id: 'marker.a', kind: 'npc', x: 3, y: 4, label: '甲', detail: '乙' }],
                cacheState: { phase: 'initial' },
            };
        },
        buildDeltaMapStaticPlan() {
            return {
                mapChanged: false,
                visibleTiles: { matrix: [[{ type: 'floor' }]], byKey: new Map([['3,4', { type: 'floor' }]]) },
                visibleMinimapMarkers: [{ id: 'marker.a', kind: 'npc', x: 3, y: 4, label: '甲', detail: '乙' }],
                tilePatches: [{ x: 3, y: 4, tile: { type: 'wall' } }],
                visibleMinimapMarkerAdds: [{ id: 'marker.b', kind: 'npc', x: 4, y: 4, label: '丙', detail: '丁' }],
                visibleMinimapMarkerRemoves: ['marker.a'],
                cacheState: { phase: 'delta' },
            };
        },
        commitPlayerCache(playerId, cacheState) {
            log.push(['commitPlayerCache', playerId, cacheState.phase]);
        },
        clearPlayerCache(playerId) {
            log.push(['clearPlayerCache', playerId]);
        },
    }, {
        buildMinimapSnapshotSync(template) {
            return { mapId: template.id, width: 1, height: 1 };
        },
    }, {
        sendBootstrap(socket, payload) {
            log.push(['sendBootstrap', socket.id, payload.self.unlockedMinimapIds]);
        },
        sendMapStatic(socket, payload) {
            log.push(['sendMapStatic', socket.id, Boolean(payload.tiles), Boolean(payload.tilePatches)]);
        },
        sendRealm(socket, payload) {
            log.push(['sendRealm', socket.id, payload.realm?.stage ?? null]);
        },
        sendLootWindow(socket, payload) {
            log.push(['sendLootWindow', socket.id, payload.window?.title ?? null]);
        },
    }, {
        buildLootWindowSyncState() {
            return lootWindow;
        },
    }, {
        buildThreatArrows() {
            return [['monster:1', 'player:1']];
        },
        emitInitialThreatSync(socket, view, threatArrows) {
            log.push(['emitInitialThreatSync', socket.id, view.tick, threatArrows.length]);
            return threatArrows;
        },
        emitDeltaThreatSync(socket, view, previousThreatArrows, mapChanged) {
            log.push(['emitDeltaThreatSync', socket.id, view.tick, previousThreatArrows?.length ?? 0, mapChanged]);
            return [['monster:2', 'player:1']];
        },
    }, {
        buildPlayerSyncState(_player, _view, unlockedMinimapIds) {
            return {
                id: 'player:1',
                unlockedMinimapIds,
            };
        },
    });
    return {
        service,
        setLootWindow(nextLootWindow) {
            lootWindow = nextLootWindow;
        },
    };
}

function createPlayer(stage = '炼气', progress = 10) {
    return {
        attrs: { numericStats: { viewRange: 2 } },
        realm: {
            stage,
            realmLv: 1,
            displayName: stage,
            name: stage,
            shortName: stage,
            path: 'qi',
            narrative: 'narrative',
            review: 'review',
            lifespanYears: 60,
            progress,
            progressToNext: 100,
            breakthroughReady: false,
            nextStage: '筑基',
            minTechniqueLevel: 1,
            minTechniqueRealm: 1,
            breakthroughItems: [],
            heavenGate: null,
        },
    };
}

function createView(tick = 10) {
    return {
        tick,
        worldRevision: 20,
        selfRevision: 30,
        instance: { templateId: 'map.a', instanceId: 'inst.a' },
        self: { x: 3, y: 4 },
    };
}

function testAuxStateSync() {
    const log = [];
    const { service, setLootWindow } = createService(log);
    const socket = { id: 'socket:1' };
    service.emitNextInitialSync('player:1', socket, createView(10), createPlayer('炼气', 10));
    setLootWindow({
        tileX: 4,
        tileY: 5,
        title: '增量拾取',
        sources: [],
    });
    service.emitNextDeltaSync('player:1', socket, createView(11), createPlayer('筑基', 20));
    service.clearPlayerCache('player:1');
    assert.deepEqual(log, [
        ['getTemplate', 'map.a'],
        ['sendBootstrap', 'socket:1', ['map.a']],
        ['sendMapStatic', 'socket:1', true, false],
        ['sendRealm', 'socket:1', '炼气'],
        ['sendLootWindow', 'socket:1', '初始拾取'],
        ['emitInitialThreatSync', 'socket:1', 10, 1],
        ['commitPlayerCache', 'player:1', 'initial'],
        ['getTemplate', 'map.a'],
        ['sendMapStatic', 'socket:1', false, true],
        ['sendRealm', 'socket:1', '筑基'],
        ['sendLootWindow', 'socket:1', '增量拾取'],
        ['emitDeltaThreatSync', 'socket:1', 11, 1, false],
        ['commitPlayerCache', 'player:1', 'delta'],
        ['clearPlayerCache', 'player:1'],
    ]);
}

testAuxStateSync();

console.log(JSON.stringify({ ok: true, case: 'world-sync-aux-state' }, null, 2));
