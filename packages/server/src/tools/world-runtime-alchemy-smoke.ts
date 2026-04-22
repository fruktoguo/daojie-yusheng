// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeCraftMutationService } = require("../runtime/world/world-runtime-craft-mutation.service");
const { WorldRuntimeAlchemyService } = require("../runtime/world/world-runtime-alchemy.service");
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
 * testStartAlchemy：执行test开始炼丹相关逻辑。
 * @returns 无返回值，直接更新testStart炼丹相关状态。
 */


function testStartAlchemy() {
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
 * startAlchemy：执行开始炼丹相关逻辑。
 * @returns 无返回值，直接更新start炼丹相关状态。
 */

        startAlchemy() { return { ok: true, messages: [{ text: '炼丹开始', kind: 'success' }], panelChanged: true, groundDrops: [] }; },        
        /**
 * startTechniqueActivity：统一技艺活动开始入口。
 * @returns 无返回值，直接更新技艺活动开始相关状态。
 */

        startTechniqueActivity(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.startAlchemy();
        },        
        /**
 * buildAlchemyPanelPayload：构建并返回目标对象。
 * @returns 无返回值，直接更新炼丹面板载荷相关状态。
 */

        buildAlchemyPanelPayload() { return { ok: true }; },
        /**
 * buildTechniqueActivityPanelPayload：统一技艺面板载荷入口。
 * @returns 无返回值，直接更新技艺面板载荷相关状态。
 */

        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildAlchemyPanelPayload();
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
 * prefersMainline：执行preferNext相关逻辑。
 * @returns 无返回值，直接更新preferNext相关状态。
 */

        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchStartAlchemy('player:1', { presetId: 'p1' }, createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '炼丹开始', 'success'],
        ['emit', 'n:s:alchemyPanel', true],
    ]);
}
/**
 * testDeletePreset：处理testDeletePreset并更新相关状态。
 * @returns 无返回值，直接更新testDeletePreset相关状态。
 */


function testDeletePreset() {
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
 * deleteAlchemyPreset：处理炼丹Preset并更新相关状态。
 * @returns 无返回值，直接更新炼丹Preset相关状态。
 */

        deleteAlchemyPreset() { return { ok: true, messages: [{ text: '预设删除成功', kind: 'info' }], panelChanged: false, groundDrops: [] }; },        
        /**
 * buildAlchemyPanelPayload：构建并返回目标对象。
 * @returns 无返回值，直接更新炼丹面板载荷相关状态。
 */

        buildAlchemyPanelPayload() { return { ok: true }; },
        /**
 * buildTechniqueActivityPanelPayload：统一技艺面板载荷入口。
 * @returns 无返回值，直接更新技艺面板载荷相关状态。
 */

        buildTechniqueActivityPanelPayload(_player, kind) {
            if (kind !== 'alchemy') {
                throw new Error(`unexpected technique activity kind: ${kind}`);
            }
            return this.buildAlchemyPanelPayload();
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
 * prefersMainline：执行preferNext相关逻辑。
 * @returns 无返回值，直接更新preferNext相关状态。
 */

        prefersMainline() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchDeleteAlchemyPreset('player:1', 'preset:1', createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '预设删除成功', 'info'],
    ]);
}
/**
 * testWorldRuntimeFacadeDispatchStartAlchemy：判断test世界运行态FacadeDispatch开始炼丹是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchStart炼丹相关状态。
 */


function testWorldRuntimeFacadeDispatchStartAlchemy() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchStartAlchemy：判断开始炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start炼丹相关状态。
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
 * testWorldRuntimeFacadeDispatchCancelAlchemy：判断test世界运行态FacadeDispatchCancel炼丹是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchCancel炼丹相关状态。
 */


function testWorldRuntimeFacadeDispatchCancelAlchemy() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchCancelAlchemy：判断Cancel炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel炼丹相关状态。
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
 * testWorldRuntimeFacadeDispatchSaveAlchemyPreset：判断test世界运行态FacadeDispatchSave炼丹Preset是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchSave炼丹Preset相关状态。
 */


function testWorldRuntimeFacadeDispatchSaveAlchemyPreset() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchSaveAlchemyPreset：判断Save炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Save炼丹Preset相关状态。
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
 * testWorldRuntimeFacadeDispatchDeleteAlchemyPreset：判断test世界运行态FacadeDispatchDelete炼丹Preset是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeDispatchDelete炼丹Preset相关状态。
 */


function testWorldRuntimeFacadeDispatchDeleteAlchemyPreset() {
    const log = [];
    const runtime = {
        worldRuntimeGameplayWriteFacadeService: {        
        /**
 * dispatchDeleteAlchemyPreset：判断Delete炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Delete炼丹Preset相关状态。
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
