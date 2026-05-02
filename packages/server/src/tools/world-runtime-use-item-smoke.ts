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
            template: {
                id: 'wildlands',
                spawnX: 99,
                spawnY: 99,
                portals: [],
                npcs: [],
            },
            isPointInSafeZone() { return false; },
            isSafeZoneTile() { return false; },
            listAllPortals() { return []; },
            /**
	 * addTileResource：处理TileResource并更新相关状态。
	 * @param resourceKey 资源键。
	 * @param x X 坐标。
 * @param y Y 坐标。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新TileResource相关状态。
 */

                addTileResource(resourceKey, x, y, amount) {
                    log.push(['addTileResource', resourceKey, x, y, amount]);
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
 * bindRespawnPoint：绑定玩家复活点。
 * @param playerId 玩家 ID。
 * @param mapId 地图 ID。
 * @returns 返回是否发生变化。
 */

        bindRespawnPoint(playerId, mapId) { overrides.log.push(['bindRespawnPoint', playerId, mapId]); return true; },        
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

        has(mapId) { return ['wildlands', 'yunlai_town', 'yunlai_town_ore_basement'].includes(mapId); },
        resolveMapGroupMembers(mapRef) {
            if (mapRef === '云来镇' || mapRef === 'yunlai_town') {
                return ['yunlai_town', 'yunlai_town_ore_basement'];
            }
            return this.has(mapRef) ? [mapRef] : [];
        },
        resolveMapGroupLabel(mapRef) {
            return mapRef === '云来镇' || mapRef === 'yunlai_town' ? '云来镇' : '';
        },
        /**
 * getOrThrow：读取OrThrow。
 * @returns 无返回值，完成OrThrow的读取/组装。
 */

        getOrThrow(mapId) { return { name: mapId === 'wildlands' ? '荒原' : '云来镇' }; },
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
function testMapGroupUnlockBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'map_scroll', name: '云来图志', mapUnlockId: '云来镇' });
    service.dispatchUseItem('player:1', 2, createDeps(log));
    assert.deepEqual(log, [
        ['unlockMap', 'player:1', 'yunlai_town'],
        ['unlockMap', 'player:1', 'yunlai_town_ore_basement'],
        ['consumeInventoryItem', 'player:1', 2, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '已解锁地图：云来镇', 'success'],
    ]);
}
/**
 * testTileAuraBranch：执行testTileAuraBranch相关逻辑。
 * @returns 无返回值，直接更新testTileAuraBranch相关状态。
 */


function testTileAuraBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'spirit_dust',
        name: '灵尘',
        tileResourceGains: [{ resourceKey: 'aura.refined.neutral', amount: 3 }],
    });
    service.dispatchUseItem('player:1', 1, createDeps(log));
    assert.deepEqual(log, [
        ['addTileResource', 'aura.refined.neutral', 3, 4, 3],
        ['consumeInventoryItem', 'player:1', 1, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '使用 灵尘，当前地块灵气提升至 7', 'success'],
    ]);
}
/**
 * testBloodEssenceBatchBranch：执行test血精石BatchBranch相关逻辑。
 * @returns 无返回值，直接更新test血精石BatchBranch相关状态。
 */


function testBloodEssenceBatchBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'stone.blood_essence',
        name: '血精石',
        count: 4,
        allowBatchUse: true,
        tileResourceGains: [{ resourceKey: 'sha.refined.neutral', amount: 10 }],
    });
    service.dispatchUseItem('player:1', 1, createDeps(log), { count: 3 });
    assert.deepEqual(log, [
        ['addTileResource', 'sha.refined.neutral', 3, 4, 30],
        ['consumeInventoryItem', 'player:1', 1, 3],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '使用 血精石 x3，当前地块煞气提升至 7', 'success'],
    ]);
}
function testTileResourceProtectedTileRejectsUse() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({
        itemId: 'spirit_stone',
        name: '灵石',
        count: 2,
        allowBatchUse: true,
        tileAuraGainAmount: 100,
    });
    const deps = createDeps(log);
    deps.getInstanceRuntimeOrThrow = () => ({
        template: {
            id: 'wildlands',
            spawnX: 3,
            spawnY: 4,
            portals: [],
            npcs: [],
        },
        isPointInSafeZone() { return false; },
        isSafeZoneTile() { return false; },
        listAllPortals() { return []; },
        addTileResource(resourceKey, x, y, amount) {
            log.push(['addTileResource', resourceKey, x, y, amount]);
            return 7;
        },
    });
    assert.throws(
        () => service.dispatchUseItem('player:1', 1, deps, { count: 2 }),
        /无法使用地块资源道具/,
    );
    assert.deepEqual(log, []);
}
/**
 * testRespawnBindBranch：执行test复活绑定Branch相关逻辑。
 * @returns 无返回值，直接更新test复活绑定Branch相关状态。
 */


function testRespawnBindBranch() {
    const log = [];
    const service = createService({ log });
    service.templateRepository.has = (mapId) => mapId === 'yunlai_town';
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'fate_stone.yunlai_town', name: '命石-云来镇', respawnBindMapId: 'yunlai_town' });
    service.dispatchUseItem('player:1', 4, createDeps(log));
    assert.deepEqual(log, [
        ['bindRespawnPoint', 'player:1', 'yunlai_town'],
        ['consumeInventoryItem', 'player:1', 4, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '复活点与遁返落点已绑定：云来镇', 'success'],
    ]);
}
/**
 * testLegacyTileAuraBranch：执行test旧TileAuraBranch相关逻辑。
 * @returns 无返回值，直接更新test旧TileAuraBranch相关状态。
 */


function testLegacyTileAuraBranch() {
    const log = [];
    const service = createService({ log });
    service.playerRuntimeService.peekInventoryItem = () => ({ itemId: 'old_spirit_dust', name: '旧灵尘', tileAuraGainAmount: 2 });
    service.dispatchUseItem('player:1', 3, createDeps(log));
    assert.deepEqual(log, [
        ['addTileResource', 'aura.refined.neutral', 3, 4, 2],
        ['consumeInventoryItem', 'player:1', 3, 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '使用 旧灵尘，当前地块灵气提升至 7', 'success'],
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
testMapGroupUnlockBranch();
testTileAuraBranch();
testBloodEssenceBatchBranch();
testTileResourceProtectedTileRejectsUse();
testRespawnBindBranch();
testLegacyTileAuraBranch();
testNormalUseBranch();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-use-item' }, null, 2));
