// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldSyncAuxStateService } = require("../network/world-sync-aux-state.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(log = []) {
    let lootWindow = {
        tileX: 4,
        tileY: 5,
        title: '初始拾取',
        sources: [],
    };
    const service = new WorldSyncAuxStateService({    
    /**
 * getOrThrow：读取OrThrow。
 * @param mapId 地图 ID。
 * @returns 无返回值，完成OrThrow的读取/组装。
 */

        getOrThrow(mapId) {
            log.push(['getTemplate', mapId]);
            return { id: mapId };
        },
    }, {    
    /**
 * buildRenderEntitiesSnapshot：构建并返回目标对象。
 * @returns 无返回值，直接更新RenderEntity快照相关状态。
 */

        buildRenderEntitiesSnapshot() {
            return new Map([['player:1', { id: 'player:1', x: 3, y: 4 }]]);
        },        
        /**
 * buildMinimapLibrarySync：构建并返回目标对象。
 * @returns 无返回值，直接更新MinimapLibrarySync相关状态。
 */

        buildMinimapLibrarySync() {
            return [{ mapId: 'map.a' }];
        },        
        /**
 * buildGameTimeState：构建并返回目标对象。
 * @returns 无返回值，直接更新Game时间状态相关状态。
 */

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
        /**
 * buildMapMetaSync：构建并返回目标对象。
 * @param template 参数说明。
 * @returns 无返回值，直接更新地图MetaSync相关状态。
 */

        buildMapMetaSync(template) {
            return { mapId: template.id };
        },
    }, {    
    /**
 * buildInitialMapStaticState：构建并返回目标对象。
 * @returns 无返回值，直接更新Initial地图Static状态相关状态。
 */

        buildInitialMapStaticState() {
            return {
                visibleTiles: { matrix: [[{ type: 'floor' }]], byKey: new Map([['3,4', { type: 'floor' }]]) },
                visibleMinimapMarkers: [{ id: 'marker.a', kind: 'npc', x: 3, y: 4, label: '甲', detail: '乙' }],
                cacheState: { phase: 'initial' },
            };
        },        
        /**
 * buildDeltaMapStaticPlan：构建并返回目标对象。
 * @returns 无返回值，直接更新Delta地图StaticPlan相关状态。
 */

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
        /**
 * commitPlayerCache：执行commit玩家缓存相关逻辑。
 * @param playerId 玩家 ID。
 * @param cacheState 参数说明。
 * @returns 无返回值，直接更新commit玩家缓存相关状态。
 */

        commitPlayerCache(playerId, cacheState) {
            log.push(['commitPlayerCache', playerId, cacheState.phase]);
        },        
        /**
 * clearPlayerCache：执行clear玩家缓存相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clear玩家缓存相关状态。
 */

        clearPlayerCache(playerId) {
            log.push(['clearPlayerCache', playerId]);
        },
    }, {    
    /**
 * buildMinimapSnapshotSync：构建并返回目标对象。
 * @param template 参数说明。
 * @returns 无返回值，直接更新Minimap快照Sync相关状态。
 */

        buildMinimapSnapshotSync(template) {
            return { mapId: template.id, width: 1, height: 1 };
        },
    }, {    
    /**
 * sendBootstrap：执行send引导相关逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新sendBootstrap相关状态。
 */

        sendBootstrap(socket, payload) {
            log.push(['sendBootstrap', socket.id, payload.self.unlockedMinimapIds]);
        },        
        /**
 * sendMapStatic：执行send地图Static相关逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新send地图Static相关状态。
 */

        sendMapStatic(socket, payload) {
            log.push(['sendMapStatic', socket.id, Boolean(payload.tiles), Boolean(payload.tilePatches)]);
        },        
        /**
 * sendRealm：执行sendRealm相关逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新sendRealm相关状态。
 */

        sendRealm(socket, payload) {
            log.push(['sendRealm', socket.id, payload.realm?.stage ?? null]);
        },        
        /**
 * sendLootWindow：执行send掉落窗口相关逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新send掉落窗口相关状态。
 */

        sendLootWindow(socket, payload) {
            log.push(['sendLootWindow', socket.id, payload.window?.title ?? null]);
        },
    }, {    
    /**
 * buildLootWindowSyncState：构建并返回目标对象。
 * @returns 无返回值，直接更新掉落窗口Sync状态相关状态。
 */

        buildLootWindowSyncState() {
            return lootWindow;
        },
    }, {    
    /**
 * buildThreatArrows：构建并返回目标对象。
 * @returns 无返回值，直接更新ThreatArrow相关状态。
 */

        buildThreatArrows() {
            return [['monster:1', 'player:1']];
        },        
        /**
 * emitInitialThreatSync：处理InitialThreat同步并更新相关状态。
 * @param socket 参数说明。
 * @param view 参数说明。
 * @param threatArrows 参数说明。
 * @returns 无返回值，直接更新InitialThreatSync相关状态。
 */

        emitInitialThreatSync(socket, view, threatArrows) {
            log.push(['emitInitialThreatSync', socket.id, view.tick, threatArrows.length]);
            return threatArrows;
        },        
        /**
 * emitDeltaThreatSync：处理增量Threat同步并更新相关状态。
 * @param socket 参数说明。
 * @param view 参数说明。
 * @param previousThreatArrows 参数说明。
 * @param mapChanged 参数说明。
 * @returns 无返回值，直接更新DeltaThreatSync相关状态。
 */

        emitDeltaThreatSync(socket, view, previousThreatArrows, mapChanged) {
            log.push(['emitDeltaThreatSync', socket.id, view.tick, previousThreatArrows?.length ?? 0, mapChanged]);
            return [['monster:2', 'player:1']];
        },
    }, {    
    /**
 * buildPlayerSyncState：构建并返回目标对象。
 * @param _player 参数说明。
 * @param _view 参数说明。
 * @param unlockedMinimapIds unlockedMinimap ID 集合。
 * @returns 无返回值，直接更新玩家Sync状态相关状态。
 */

        buildPlayerSyncState(_player, _view, unlockedMinimapIds) {
            return {
                id: 'player:1',
                unlockedMinimapIds,
            };
        },
    });
    return {
        service,        
        /**
 * setLootWindow：写入掉落窗口。
 * @param nextLootWindow 参数说明。
 * @returns 无返回值，直接更新掉落窗口相关状态。
 */

        setLootWindow(nextLootWindow) {
            lootWindow = nextLootWindow;
        },
    };
}
/**
 * createPlayer：构建并返回目标对象。
 * @param stage 参数说明。
 * @param progress 参数说明。
 * @returns 无返回值，直接更新玩家相关状态。
 */


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
/**
 * createView：构建并返回目标对象。
 * @param tick 当前 tick。
 * @returns 无返回值，直接更新视图相关状态。
 */


function createView(tick = 10) {
    return {
        tick,
        worldRevision: 20,
        selfRevision: 30,
        instance: { templateId: 'map.a', instanceId: 'inst.a' },
        self: { x: 3, y: 4 },
    };
}
/**
 * testAuxStateSync：处理testAux状态同步并更新相关状态。
 * @returns 无返回值，直接更新testAux状态Sync相关状态。
 */


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
