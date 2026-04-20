// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeCultivationService } = require("../runtime/world/world-runtime-cultivation.service");
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @param blockReason 参数说明。
 * @returns 函数返回值。
 */


function createDeps(log, blockReason = null) {
    return {
        craftPanelRuntimeService: {        
        /**
 * getCultivationBlockReason：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getCultivationBlockReason() { return blockReason; },
        },        
        /**
 * queuePlayerNotice：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 函数返回值。
 */

        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },
    };
}
/**
 * testStopCultivation：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testStopCultivation() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerOrThrow() { return { playerId: 'player:1' }; },        
        /**
 * cultivateTechnique：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 函数返回值。
 */

        cultivateTechnique(playerId, techniqueId) { log.push(['cultivateTechnique', playerId, techniqueId]); },        
        /**
 * getTechniqueName：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getTechniqueName() { return null; },
    };
    const service = new WorldRuntimeCultivationService(playerRuntimeService);
    service.dispatchCultivateTechnique('player:1', null, createDeps(log));
    assert.deepEqual(log, [
        ['cultivateTechnique', 'player:1', null],
        ['queuePlayerNotice', 'player:1', '已停止当前修炼', 'info'],
    ]);
}
/**
 * testStartCultivation：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testStartCultivation() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerOrThrow() { return { playerId: 'player:1' }; },        
        /**
 * cultivateTechnique：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 函数返回值。
 */

        cultivateTechnique(playerId, techniqueId) { log.push(['cultivateTechnique', playerId, techniqueId]); },        
        /**
 * getTechniqueName：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getTechniqueName() { return '青木剑诀'; },
    };
    const service = new WorldRuntimeCultivationService(playerRuntimeService);
    service.dispatchCultivateTechnique('player:1', 'qingmu_sword', createDeps(log));
    assert.deepEqual(log, [
        ['cultivateTechnique', 'player:1', 'qingmu_sword'],
        ['queuePlayerNotice', 'player:1', '开始修炼 青木剑诀', 'success'],
    ]);
}

testStopCultivation();
testStartCultivation();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-cultivation' }, null, 2));
