// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeCraftMutationService } = require("../runtime/world/world-runtime-craft-mutation.service");
const { WorldRuntimeAlchemyService } = require("../runtime/world/world-runtime-alchemy.service");
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createDeps(log) {
    return {    
    /**
 * queuePlayerNotice：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param kind 参数说明。
 * @returns 函数返回值。
 */

        queuePlayerNotice(playerId, message, kind) { log.push(['queuePlayerNotice', playerId, message, kind]); },        
        /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceRuntimeOrThrow() {
            return {            
            /**
 * dropGroundItem：执行核心业务逻辑。
 * @returns 函数返回值。
 */

                dropGroundItem() { log.push(['dropGroundItem']); return { sourceId: 'ground:1' }; },
            };
        },        
        /**
 * spawnGroundItem：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        spawnGroundItem() { log.push(['spawnGroundItem']); },
    };
}
/**
 * testStartAlchemy：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testStartAlchemy() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },        
        /**
 * getPlayer：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayer() { return { playerId: 'player:1' }; },        
        /**
 * receiveInventoryItem：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    };
    const craftPanelRuntimeService = {    
    /**
 * startAlchemy：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        startAlchemy() { return { ok: true, messages: [{ text: '炼丹开始', kind: 'success' }], panelChanged: true, groundDrops: [] }; },        
        /**
 * buildAlchemyPanelPayload：构建并返回目标对象。
 * @returns 函数返回值。
 */

        buildAlchemyPanelPayload() { return { ok: true }; },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {    
    /**
 * getSocketByPlayerId：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getSocketByPlayerId() { return {        
        /**
 * emit：执行核心业务逻辑。
 * @param event 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */
 emit(event, payload) { log.push(['emit', event, payload.ok]); } }; },
    }, {    
    /**
 * prefersNext：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        prefersNext() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchStartAlchemy('player:1', { presetId: 'p1' }, createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '炼丹开始', 'success'],
        ['emit', 'n:s:alchemyPanel', true],
    ]);
}
/**
 * testDeletePreset：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDeletePreset() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },        
        /**
 * getPlayer：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayer() { return { playerId: 'player:1' }; },        
        /**
 * receiveInventoryItem：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    };
    const craftPanelRuntimeService = {    
    /**
 * deleteAlchemyPreset：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        deleteAlchemyPreset() { return { ok: true, messages: [{ text: '预设删除成功', kind: 'info' }], panelChanged: false, groundDrops: [] }; },        
        /**
 * buildAlchemyPanelPayload：构建并返回目标对象。
 * @returns 函数返回值。
 */

        buildAlchemyPanelPayload() { return { ok: true }; },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {    
    /**
 * getSocketByPlayerId：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getSocketByPlayerId() { return {        
        /**
 * emit：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 emit() { log.push(['emit']); } }; },
    }, {    
    /**
 * prefersNext：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        prefersNext() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchDeleteAlchemyPreset('player:1', 'preset:1', createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '预设删除成功', 'info'],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchStartAlchemy：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testWorldRuntimeFacadeDispatchStartAlchemy() {
    const log = [];
    const runtime = {
        worldRuntimeAlchemyService: {        
        /**
 * dispatchStartAlchemy：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

            dispatchStartAlchemy(playerId, payload, deps) {
                log.push(['dispatchStartAlchemy', playerId, payload, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchStartAlchemy.call(runtime, 'player:1', { presetId: 'p1' });
    assert.deepEqual(log, [
        ['dispatchStartAlchemy', 'player:1', { presetId: 'p1' }, true],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchCancelAlchemy：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testWorldRuntimeFacadeDispatchCancelAlchemy() {
    const log = [];
    const runtime = {
        worldRuntimeAlchemyService: {        
        /**
 * dispatchCancelAlchemy：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

            dispatchCancelAlchemy(playerId, deps) {
                log.push(['dispatchCancelAlchemy', playerId, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchCancelAlchemy.call(runtime, 'player:1');
    assert.deepEqual(log, [
        ['dispatchCancelAlchemy', 'player:1', true],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchSaveAlchemyPreset：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testWorldRuntimeFacadeDispatchSaveAlchemyPreset() {
    const log = [];
    const runtime = {
        worldRuntimeAlchemyService: {        
        /**
 * dispatchSaveAlchemyPreset：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

            dispatchSaveAlchemyPreset(playerId, payload, deps) {
                log.push(['dispatchSaveAlchemyPreset', playerId, payload, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchSaveAlchemyPreset.call(runtime, 'player:1', { presetId: 'p2' });
    assert.deepEqual(log, [
        ['dispatchSaveAlchemyPreset', 'player:1', { presetId: 'p2' }, true],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchDeleteAlchemyPreset：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testWorldRuntimeFacadeDispatchDeleteAlchemyPreset() {
    const log = [];
    const runtime = {
        worldRuntimeAlchemyService: {        
        /**
 * dispatchDeleteAlchemyPreset：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

            dispatchDeleteAlchemyPreset(playerId, presetId, deps) {
                log.push(['dispatchDeleteAlchemyPreset', playerId, presetId, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchDeleteAlchemyPreset.call(runtime, 'player:1', 'preset:1');
    assert.deepEqual(log, [
        ['dispatchDeleteAlchemyPreset', 'player:1', 'preset:1', true],
    ]);
}

testStartAlchemy();
testDeletePreset();
testWorldRuntimeFacadeDispatchStartAlchemy();
testWorldRuntimeFacadeDispatchCancelAlchemy();
testWorldRuntimeFacadeDispatchSaveAlchemyPreset();
testWorldRuntimeFacadeDispatchDeleteAlchemyPreset();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-alchemy' }, null, 2));
