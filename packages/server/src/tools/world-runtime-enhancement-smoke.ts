// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeCraftMutationService } = require("../runtime/world/world-runtime-craft-mutation.service");
const { WorldRuntimeEnhancementService } = require("../runtime/world/world-runtime-enhancement.service");
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
 * testStartEnhancement：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testStartEnhancement() {
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
 * startEnhancement：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        startEnhancement() { return { ok: true, messages: [{ text: '强化开始', kind: 'success' }], panelChanged: true, groundDrops: [] }; },        
        /**
 * buildEnhancementPanelPayload：构建并返回目标对象。
 * @returns 函数返回值。
 */

        buildEnhancementPanelPayload() { return { ok: true }; },
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
    const service = new WorldRuntimeEnhancementService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchStartEnhancement('player:1', { target: 1 }, createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '强化开始', 'success'],
        ['emit', 'n:s:enhancementPanel', true],
    ]);
}
/**
 * testCancelEnhancement：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testCancelEnhancement() {
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
 * cancelEnhancement：执行状态校验并返回判断结果。
 * @returns 函数返回值。
 */

        cancelEnhancement() { return { ok: true, messages: [{ text: '强化取消', kind: 'info' }], panelChanged: false, groundDrops: [] }; },        
        /**
 * buildEnhancementPanelPayload：构建并返回目标对象。
 * @returns 函数返回值。
 */

        buildEnhancementPanelPayload() { return { ok: true }; },
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
    const service = new WorldRuntimeEnhancementService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchCancelEnhancement('player:1', createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '强化取消', 'info'],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchStartEnhancement：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testWorldRuntimeFacadeDispatchStartEnhancement() {
    const log = [];
    const runtime = {
        worldRuntimeEnhancementService: {        
        /**
 * dispatchStartEnhancement：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

            dispatchStartEnhancement(playerId, payload, deps) {
                log.push(['dispatchStartEnhancement', playerId, payload, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchStartEnhancement.call(runtime, 'player:1', { slotIndex: 2 });
    assert.deepEqual(log, [
        ['dispatchStartEnhancement', 'player:1', { slotIndex: 2 }, true],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchCancelEnhancement：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testWorldRuntimeFacadeDispatchCancelEnhancement() {
    const log = [];
    const runtime = {
        worldRuntimeEnhancementService: {        
        /**
 * dispatchCancelEnhancement：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

            dispatchCancelEnhancement(playerId, deps) {
                log.push(['dispatchCancelEnhancement', playerId, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchCancelEnhancement.call(runtime, 'player:1');
    assert.deepEqual(log, [
        ['dispatchCancelEnhancement', 'player:1', true],
    ]);
}

testStartEnhancement();
testCancelEnhancement();
testWorldRuntimeFacadeDispatchStartEnhancement();
testWorldRuntimeFacadeDispatchCancelEnhancement();
console.log(JSON.stringify({ ok: true, case: 'world-runtime-enhancement' }, null, 2));
