"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeUseItemService } = require("../runtime/world/world-runtime-use-item.service");

function createDeps(log) {
    return {
        refreshQuestStates(playerId) { log.push(['refreshQuestStates', playerId]); },
        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },
        advanceLearnTechniqueQuest(playerId, techniqueId) { log.push(['advanceLearnTechniqueQuest', playerId, techniqueId]); },
        getPlayerLocationOrThrow() { return { instanceId: 'instance:1' }; },
        getInstanceRuntimeOrThrow() {
            return {
                addTileAura(x, y, amount) {
                    log.push(['addTileAura', x, y, amount]);
                    return 7;
                },
            };
        },
    };
}

function createService(overrides = {}) {
    const playerRuntimeService = {
        peekInventoryItem() { return null; },
        hasUnlockedMap() { return false; },
        unlockMap(playerId, mapId) { overrides.log.push(['unlockMap', playerId, mapId]); },
        consumeInventoryItem(playerId, slotIndex, count) { overrides.log.push(['consumeInventoryItem', playerId, slotIndex, count]); },
        useItem(playerId, slotIndex) { overrides.log.push(['useItem', playerId, slotIndex]); },
        getPlayerOrThrow() { return { x: 3, y: 4 }; },
    };
    const contentTemplateRepository = {
        getLearnTechniqueId(itemId) {
            return itemId === 'manual_scroll' ? 'technique.scroll' : null;
        },
    };
    const templateRepository = {
        has(mapId) { return mapId === 'wildlands'; },
        getOrThrow() { return { name: '荒原' }; },
    };
    return new WorldRuntimeUseItemService(contentTemplateRepository, templateRepository, playerRuntimeService);
}

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
