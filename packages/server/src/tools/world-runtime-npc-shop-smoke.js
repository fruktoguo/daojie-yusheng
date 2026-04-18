"use strict";

const assert = require("node:assert/strict");
const { WorldRuntimeNpcShopService } = require("../runtime/world/world-runtime-npc-shop.service");

function testEnqueue() {
    const log = [];
    const service = new WorldRuntimeNpcShopService({}, { getCurrencyItemName() { return '灵石'; }, getCurrencyItemId() { return 'spirit_stone'; } });
    const deps = {
        pendingCommands: new Map(),
        getPlayerLocationOrThrow() { return { instanceId: 'instance:1' }; },
        validateNpcShopPurchase(playerId, npcId, itemId, quantity) { log.push(['validateNpcShopPurchase', playerId, npcId, itemId, quantity]); },
        getPlayerViewOrThrow() { return { tick: 1 }; },
    };
    const result = service.enqueueBuyNpcShopItem('player:1', 'npc_a', 'qi_pill', 2, deps);
    assert.deepEqual(log, [['validateNpcShopPurchase', 'player:1', 'npc_a', 'qi_pill', 2]]);
    assert.deepEqual(deps.pendingCommands.get('player:1'), { kind: 'buyNpcShopItem', npcId: 'npc_a', itemId: 'qi_pill', quantity: 2 });
    assert.deepEqual(result, { tick: 1 });
}

function testDispatch() {
    const log = [];
    const service = new WorldRuntimeNpcShopService({
        consumeInventoryItemByItemId(playerId, itemId, count) { log.push(['consumeInventoryItemByItemId', playerId, itemId, count]); },
        receiveInventoryItem(playerId, item) { log.push(['receiveInventoryItem', playerId, item.itemId, item.count]); },
    }, {
        getCurrencyItemId() { return 'spirit_stone'; },
        getCurrencyItemName() { return '灵石'; },
    });
    const deps = {
        validateNpcShopPurchase() { return { totalCost: 5, item: { itemId: 'qi_pill', name: '聚气丹', count: 1 } }; },
        refreshQuestStates(playerId) { log.push(['refreshQuestStates', playerId]); },
        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },
    };
    service.dispatchBuyNpcShopItem('player:1', 'npc_a', 'qi_pill', 1, deps);
    assert.deepEqual(log, [
        ['consumeInventoryItemByItemId', 'player:1', 'spirit_stone', 5],
        ['receiveInventoryItem', 'player:1', 'qi_pill', 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '购买 聚气丹x1，消耗 灵石 x5', 'success'],
    ]);
}

testEnqueue();
testDispatch();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-npc-shop' }, null, 2));
