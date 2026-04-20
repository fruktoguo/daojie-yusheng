// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeUseItemService } = require("../runtime/world/world-runtime-use-item.service");
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新Dep相关状态。
 */


function createDeps(log) {
    return {    
    /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
 */

        refreshQuestStates(playerId) { log.push(['refreshQuestStates', playerId]); },        
        /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },        
        /**
 * advanceLearnTechniqueQuest：执行advanceLearn功法任务相关逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 无返回值，直接更新advanceLearn功法任务相关状态。
 */

        advanceLearnTechniqueQuest(playerId, techniqueId) { log.push(['advanceLearnTechniqueQuest', playerId, techniqueId]); },        
        /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow() { return { instanceId: 'instance:1' }; },        
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntimeOrThrow() {
            return {            
            /**
 * addTileAura：处理TileAura并更新相关状态。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新TileAura相关状态。
 */

                addTileAura(x, y, amount) {
                    log.push(['addTileAura', x, y, amount]);
                    return 7;
                },
            };
        },
    };
}
/**
 * createService：构建并返回目标对象。
 * @param overrides 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(overrides = {}) {
    const playerRuntimeService = {    
    /**
 * peekInventoryItem：执行peek背包道具相关逻辑。
 * @returns 无返回值，直接更新peek背包道具相关状态。
 */

        peekInventoryItem() { return null; },        
        /**
 * hasUnlockedMap：判断Unlocked地图是否满足条件。
 * @returns 无返回值，完成Unlocked地图的条件判断。
 */

        hasUnlockedMap() { return false; },        
        /**
 * unlockMap：执行unlock地图相关逻辑。
 * @param playerId 玩家 ID。
 * @param mapId 地图 ID。
 * @returns 无返回值，直接更新unlock地图相关状态。
 */

        unlockMap(playerId, mapId) { overrides.log.push(['unlockMap', playerId, mapId]); },        
        /**
 * consumeInventoryItem：执行consume背包道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具相关状态。
 */

        consumeInventoryItem(playerId, slotIndex, count) { overrides.log.push(['consumeInventoryItem', playerId, slotIndex, count]); },        
        /**
 * useItem：执行use道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新use道具相关状态。
 */

        useItem(playerId, slotIndex) { overrides.log.push(['useItem', playerId, slotIndex]); },        
        /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() { return { x: 3, y: 4 }; },
    };
    const contentTemplateRepository = {    
    /**
 * getLearnTechniqueId：读取Learn功法ID。
 * @param itemId 道具 ID。
 * @returns 无返回值，完成Learn功法ID的读取/组装。
 */

        getLearnTechniqueId(itemId) {
            return itemId === 'manual_scroll' ? 'technique.scroll' : null;
        },
    };
    const templateRepository = {    
    /**
 * has：判断ha是否满足条件。
 * @param mapId 地图 ID。
 * @returns 无返回值，完成地图、标识的条件判断。
 */

        has(mapId) { return mapId === 'wildlands'; },        
        /**
 * getOrThrow：读取OrThrow。
 * @returns 无返回值，完成OrThrow的读取/组装。
 */

        getOrThrow() { return { name: '荒原' }; },
    };
    return new WorldRuntimeUseItemService(contentTemplateRepository, templateRepository, playerRuntimeService);
}
/**
 * testMapUnlockBranch：执行test地图UnlockBranch相关逻辑。
 * @returns 无返回值，直接更新test地图UnlockBranch相关状态。
 */


function testMapUnlockBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'map_scroll', name: '荒原图志', mapUnlockIds: ['wildlands'] });
    service.dispatchUseItem('player:1', 2, createDeps(log));
    assert.deepEqual(log, [
        ['unlockMap', 'player:1', 'wildlands'],
        ['consumeInventoryItem', 'player:1', 2, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '已解锁地图：荒原', 'success'],
    ]);
}
/**
 * testTileAuraBranch：执行testTileAuraBranch相关逻辑。
 * @returns 无返回值，直接更新testTileAuraBranch相关状态。
 */


function testTileAuraBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'spirit_dust', name: '灵尘', tileAuraGainAmount: 3 });
    service.dispatchUseItem('player:1', 1, createDeps(log));
    assert.deepEqual(log, [
        ['addTileAura', 3, 4, 3],
        ['consumeInventoryItem', 'player:1', 1, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '使用 灵尘，当前地块灵气提升至 7', 'success'],
    ]);
}
/**
 * testNormalUseBranch：执行testNormalUseBranch相关逻辑。
 * @returns 无返回值，直接更新testNormalUseBranch相关状态。
 */


function testNormalUseBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'manual_scroll', name: '功法玉简' });
    service.dispatchUseItem('player:1', 0, createDeps(log));
    assert.deepEqual(log, [
        ['useItem', 'player:1', 0],
        ['advanceLearnTechniqueQuest', 'player:1', 'technique.scroll'],
        ['queuePlayerNotice', 'player:1', '使用 功法玉简', 'success'],
    ]);
}

testMapUnlockBranch();
testTileAuraBranch();
testNormalUseBranch();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-use-item' }, null, 2));
