// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeCraftMutationService } = require("../runtime/world/world-runtime-craft-mutation.service");
const { WorldRuntimeEnhancementService } = require("../runtime/world/world-runtime-enhancement.service");
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新Dep相关状态。
 */


function createDeps(log) {
    return {    
    /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param kind 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, kind) { log.push(['queuePlayerNotice', playerId, message, kind]); },        
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntimeOrThrow() {
            return {            
            /**
 * dropGroundItem：执行drop地面道具相关逻辑。
 * @returns 无返回值，直接更新dropGround道具相关状态。
 */

                dropGroundItem() { log.push(['dropGroundItem']); return { sourceId: 'ground:1' }; },
            };
        },        
        /**
 * spawnGroundItem：执行spawn地面道具相关逻辑。
 * @returns 无返回值，直接更新spawnGround道具相关状态。
 */

        spawnGroundItem() { log.push(['spawnGroundItem']); },
    };
}
/**
 * testStartEnhancement：执行test开始强化相关逻辑。
 * @returns 无返回值，直接更新testStart强化相关状态。
 */


function testStartEnhancement() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },        
        /**
 * getPlayer：读取玩家。
 * @returns 无返回值，完成玩家的读取/组装。
 */

        getPlayer() { return { playerId: 'player:1' }; },        
        /**
 * receiveInventoryItem：执行receive背包道具相关逻辑。
 * @returns 无返回值，直接更新receive背包道具相关状态。
 */

        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    };
    const craftPanelRuntimeService = {    
    /**
 * startEnhancement：执行开始强化相关逻辑。
 * @returns 无返回值，直接更新start强化相关状态。
 */

        startEnhancement() { return { ok: true, messages: [{ text: '强化开始', kind: 'success' }], panelChanged: true, groundDrops: [] }; },        
        /**
 * startTechniqueActivity：统一技艺活动开始入口。
 * @returns 无返回值，直接更新技艺活动开始相关状态。
 */

        startTechniqueActivity(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.startEnhancement();
        },        
        /**
 * buildEnhancementPanelPayload：构建并返回目标对象。
 * @returns 无返回值，直接更新强化面板载荷相关状态。
 */

        buildEnhancementPanelPayload() { return { ok: true }; },
        /**
 * buildTechniqueActivityPanelPayload：统一技艺面板载荷入口。
 * @returns 无返回值，直接更新技艺面板载荷相关状态。
 */

        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildEnhancementPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {    
    /**
 * getSocketByPlayerId：读取SocketBy玩家ID。
 * @returns 无返回值，完成SocketBy玩家ID的读取/组装。
 */

        getSocketByPlayerId() { return {        
        /**
 * emit：处理emit并更新相关状态。
 * @param event 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新结果相关状态。
 */
 emit(event, payload) { log.push(['emit', event, payload.ok]); } }; },
    }, {    
    /**
 * prefersNext：执行preferNext相关逻辑。
 * @returns 无返回值，直接更新preferNext相关状态。
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
 * testCancelEnhancement：判断testCancel强化是否满足条件。
 * @returns 无返回值，直接更新testCancel强化相关状态。
 */


function testCancelEnhancement() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },        
        /**
 * getPlayer：读取玩家。
 * @returns 无返回值，完成玩家的读取/组装。
 */

        getPlayer() { return { playerId: 'player:1' }; },        
        /**
 * receiveInventoryItem：执行receive背包道具相关逻辑。
 * @returns 无返回值，直接更新receive背包道具相关状态。
 */

        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    };
    const craftPanelRuntimeService = {    
    /**
 * cancelEnhancement：判断cancel强化是否满足条件。
 * @returns 无返回值，完成cancel强化的条件判断。
 */

        cancelEnhancement() { return { ok: true, messages: [{ text: '强化取消', kind: 'info' }], panelChanged: false, groundDrops: [] }; },        
        /**
 * cancelTechniqueActivity：统一技艺活动取消入口。
 * @returns 无返回值，直接更新技艺活动取消相关状态。
 */

        cancelTechniqueActivity(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.cancelEnhancement();
        },        
        /**
 * buildEnhancementPanelPayload：构建并返回目标对象。
 * @returns 无返回值，直接更新强化面板载荷相关状态。
 */

        buildEnhancementPanelPayload() { return { ok: true }; },
        /**
 * buildTechniqueActivityPanelPayload：统一技艺面板载荷入口。
 * @returns 无返回值，直接更新技艺面板载荷相关状态。
 */

        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'enhancement') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildEnhancementPanelPayload();
        },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {    
    /**
 * getSocketByPlayerId：读取SocketBy玩家ID。
 * @returns 无返回值，完成SocketBy玩家ID的读取/组装。
 */

        getSocketByPlayerId() { return {        
        /**
 * emit：处理emit并更新相关状态。
 * @returns 无返回值，直接更新结果相关状态。
 */
 emit() { log.push(['emit']); } }; },
    }, {    
    /**
 * prefersNext：执行preferNext相关逻辑。
 * @returns 无返回值，直接更新preferNext相关状态。
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
 * testWorldRuntimeFacadeDispatchStartEnhancement：判断test世界运行态FacadeDispatch开始强化是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchStart强化相关状态。
 */


function testWorldRuntimeFacadeDispatchStartEnhancement() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchStartEnhancement：判断开始强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start强化相关状态。
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
 * testWorldRuntimeFacadeDispatchCancelEnhancement：判断test世界运行态FacadeDispatchCancel强化是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchCancel强化相关状态。
 */


function testWorldRuntimeFacadeDispatchCancelEnhancement() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchCancelEnhancement：判断Cancel强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel强化相关状态。
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
