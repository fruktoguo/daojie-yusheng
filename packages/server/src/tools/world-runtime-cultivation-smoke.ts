// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeCultivationService } = require("../runtime/world/world-runtime-cultivation.service");
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @param blockReason 参数说明。
 * @returns 无返回值，直接更新Dep相关状态。
 */


function createDeps(log, blockReason = null) {
    return {
        craftPanelRuntimeService: {        
        /**
 * getCultivationBlockReason：读取CultivationBlockReason。
 * @returns 无返回值，完成CultivationBlockReason的读取/组装。
 */

            getCultivationBlockReason() { return blockReason; },
        },        
        /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },
    };
}
/**
 * testStopCultivation：执行testStopCultivation相关逻辑。
 * @returns 无返回值，直接更新testStopCultivation相关状态。
 */


function testClearMainTechnique() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() { return { playerId: 'player:1' }; },        
        /**
 * cultivateTechnique：执行cultivate功法相关逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 无返回值，直接更新cultivate功法相关状态。
 */

        cultivateTechnique(playerId, techniqueId) { log.push(['cultivateTechnique', playerId, techniqueId]); },        
        /**
 * getTechniqueName：读取功法名称。
 * @returns 无返回值，完成功法名称的读取/组装。
 */

        getTechniqueName() { return null; },
    };
    const service = new WorldRuntimeCultivationService(playerRuntimeService);
    service.dispatchCultivateTechnique('player:1', null, createDeps(log));
    assert.deepEqual(log, [
        ['cultivateTechnique', 'player:1', null],
        ['queuePlayerNotice', 'player:1', '已取消主修功法', 'info'],
    ]);
}
/**
 * testStartCultivation：执行test开始Cultivation相关逻辑。
 * @returns 无返回值，直接更新testStartCultivation相关状态。
 */


function testSetMainTechnique() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() { return { playerId: 'player:1' }; },        
        /**
 * cultivateTechnique：执行cultivate功法相关逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 无返回值，直接更新cultivate功法相关状态。
 */

        cultivateTechnique(playerId, techniqueId) { log.push(['cultivateTechnique', playerId, techniqueId]); },        
        /**
 * getTechniqueName：读取功法名称。
 * @returns 无返回值，完成功法名称的读取/组装。
 */

        getTechniqueName() { return '青木剑诀'; },
    };
    const service = new WorldRuntimeCultivationService(playerRuntimeService);
    service.dispatchCultivateTechnique('player:1', 'qingmu_sword', createDeps(log));
    assert.deepEqual(log, [
        ['cultivateTechnique', 'player:1', 'qingmu_sword'],
        ['queuePlayerNotice', 'player:1', '已设为主修 青木剑诀', 'success'],
    ]);
}

testClearMainTechnique();
testSetMainTechnique();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-cultivation' }, null, 2));
