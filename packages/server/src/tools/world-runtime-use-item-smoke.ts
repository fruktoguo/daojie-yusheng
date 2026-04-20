// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeUseItemService } = require("../runtime/world/world-runtime-use-item.service");
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createDeps(log) {
    return {    
    /**
 * refreshQuestStates：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        refreshQuestStates(playerId) { log.push(['refreshQuestStates', playerId]); },        
        /**
 * queuePlayerNotice：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 函数返回值。
 */

        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },        
        /**
 * advanceLearnTechniqueQuest：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @returns 函数返回值。
 */

        advanceLearnTechniqueQuest(playerId, techniqueId) { log.push(['advanceLearnTechniqueQuest', playerId, techniqueId]); },        
        /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow() { return { instanceId: 'instance:1' }; },        
        /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceRuntimeOrThrow() {
            return {            
            /**
 * addTileAura：执行核心业务逻辑。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param amount 参数说明。
 * @returns 函数返回值。
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
 * @returns 函数返回值。
 */


function createService(overrides = {}) {
    const playerRuntimeService = {    
    /**
 * peekInventoryItem：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        peekInventoryItem() { return null; },        
        /**
 * hasUnlockedMap：执行状态校验并返回判断结果。
 * @returns 函数返回值。
 */

        hasUnlockedMap() { return false; },        
        /**
 * unlockMap：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param mapId 地图 ID。
 * @returns 函数返回值。
 */

        unlockMap(playerId, mapId) { overrides.log.push(['unlockMap', playerId, mapId]); },        
        /**
 * consumeInventoryItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 函数返回值。
 */

        consumeInventoryItem(playerId, slotIndex, count) { overrides.log.push(['consumeInventoryItem', playerId, slotIndex, count]); },        
        /**
 * useItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 函数返回值。
 */

        useItem(playerId, slotIndex) { overrides.log.push(['useItem', playerId, slotIndex]); },        
        /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerOrThrow() { return { x: 3, y: 4 }; },
    };
    const contentTemplateRepository = {    
    /**
 * getLearnTechniqueId：按给定条件读取/查询数据。
 * @param itemId 道具 ID。
 * @returns 函数返回值。
 */

        getLearnTechniqueId(itemId) {
            return itemId === 'manual_scroll' ? 'technique.scroll' : null;
        },
    };
    const templateRepository = {    
    /**
 * has：执行状态校验并返回判断结果。
 * @param mapId 地图 ID。
 * @returns 函数返回值。
 */

        has(mapId) { return mapId === 'wildlands'; },        
        /**
 * getOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getOrThrow() { return { name: '荒原' }; },
    };
    return new WorldRuntimeUseItemService(contentTemplateRepository, templateRepository, playerRuntimeService);
}
/**
 * testMapUnlockBranch：执行核心业务逻辑。
 * @returns 函数返回值。
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
 * testTileAuraBranch：执行核心业务逻辑。
 * @returns 函数返回值。
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
 * testNormalUseBranch：执行核心业务逻辑。
 * @returns 函数返回值。
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
