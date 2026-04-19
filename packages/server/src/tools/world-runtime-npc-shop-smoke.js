"use strict";

const assert = require("node:assert/strict");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeNpcShopQueryService } = require("../runtime/world/world-runtime-npc-shop-query.service");
const { WorldRuntimeNpcShopService } = require("../runtime/world/world-runtime-npc-shop.service");

function testQueryBuildNpcShopView() {
    const log = [];
    const service = new WorldRuntimeNpcShopQueryService({
        createItem(itemId, count) {
            if (itemId === 'spirit_stone') {
                return { itemId, count, name: '灵石' };
            }
            if (itemId === 'qi_pill') {
                return { itemId, count, name: '聚气丹' };
            }
            return null;
        },
    }, {
        canReceiveInventoryItem() {
            return true;
        },
        getInventoryCountByItemId() {
            return 999;
        },
    });
    const result = service.buildNpcShopView('player:1', 'npc_a', {
        resolveAdjacentNpc(playerId, npcId) {
            log.push(['resolveAdjacentNpc', playerId, npcId]);
            return {
                npcId,
                name: '阿商',
                dialogue: '看看货架。',
                hasShop: true,
                shopItems: [{ itemId: 'qi_pill', price: 5 }],
            };
        },
    });
    assert.deepEqual(result, {
        npcId: 'npc_a',
        shop: {
            npcId: 'npc_a',
            npcName: '阿商',
            dialogue: '看看货架。',
            currencyItemId: 'spirit_stone',
            currencyItemName: '灵石',
            items: [{
                itemId: 'qi_pill',
                item: { itemId: 'qi_pill', count: 1, name: '聚气丹' },
                unitPrice: 5,
            }],
        },
    });
    assert.deepEqual(log, [['resolveAdjacentNpc', 'player:1', 'npc_a']]);
}

function testWorldRuntimeFacadeBuildNpcShopView() {
    const log = [];
    const runtime = {
        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'instance:1' };
        },
        worldRuntimeNpcShopQueryService: {
            buildNpcShopView(playerId, npcId, deps) {
                log.push(['buildNpcShopView', playerId, npcId, deps === runtime]);
                return { npcId, shop: null, error: '对方现在没有经营商店' };
            },
        },
    };
    const result = WorldRuntimeService.prototype.buildNpcShopView.call(runtime, 'player:1', ' npc_a ');
    assert.deepEqual(result, { npcId: 'npc_a', shop: null, error: '对方现在没有经营商店' });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['buildNpcShopView', 'player:1', 'npc_a', true],
    ]);
    assert.throws(() => WorldRuntimeService.prototype.buildNpcShopView.call(runtime, 'player:1', '   '), /npcId is required/);
}

function testQueryValidateNpcShopPurchase() {
    const log = [];
    const service = new WorldRuntimeNpcShopQueryService({
        createItem(itemId, count) {
            if (itemId === 'spirit_stone') {
                return { itemId, count, name: '灵石' };
            }
            if (itemId === 'qi_pill') {
                return { itemId, count, name: '聚气丹' };
            }
            return null;
        },
    }, {
        canReceiveInventoryItem(playerId, itemId) {
            log.push(['canReceiveInventoryItem', playerId, itemId]);
            return true;
        },
        getInventoryCountByItemId(playerId, itemId) {
            log.push(['getInventoryCountByItemId', playerId, itemId]);
            return 999;
        },
    });
    const result = service.validateNpcShopPurchase('player:1', 'npc_a', 'qi_pill', 2, {
        resolveAdjacentNpc(playerId, npcId) {
            log.push(['resolveAdjacentNpc', playerId, npcId]);
            return {
                npcId,
                name: '阿商',
                hasShop: true,
                shopItems: [{ itemId: 'qi_pill', price: 5 }],
            };
        },
    });
    assert.deepEqual(result, {
        item: { itemId: 'qi_pill', count: 2, name: '聚气丹' },
        totalCost: 10,
    });
    assert.deepEqual(log, [
        ['resolveAdjacentNpc', 'player:1', 'npc_a'],
        ['canReceiveInventoryItem', 'player:1', 'qi_pill'],
        ['getInventoryCountByItemId', 'player:1', 'spirit_stone'],
    ]);
}

function testWorldRuntimeFacadeValidateNpcShopPurchase() {
    const log = [];
    const runtime = {
        worldRuntimeNpcShopQueryService: {
            validateNpcShopPurchase(playerId, npcId, itemId, quantity, deps) {
                log.push(['validateNpcShopPurchase', playerId, npcId, itemId, quantity, deps === runtime]);
                return { totalCost: 6, item: { itemId: 'qi_pill', count: quantity } };
            },
        },
    };
    const result = WorldRuntimeService.prototype.validateNpcShopPurchase.call(runtime, 'player:1', 'npc_a', 'qi_pill', 2);
    assert.deepEqual(result, { totalCost: 6, item: { itemId: 'qi_pill', count: 2 } });
    assert.deepEqual(log, [
        ['validateNpcShopPurchase', 'player:1', 'npc_a', 'qi_pill', 2, true],
    ]);
}

function testEnqueue() {
    const log = [];
    const service = new WorldRuntimeNpcShopService({}, { getCurrencyItemName() { return '灵石'; }, getCurrencyItemId() { return 'spirit_stone'; } });
    const queued = new Map();
    const deps = {
        getPlayerLocationOrThrow() { return { instanceId: 'instance:1' }; },
        validateNpcShopPurchase(playerId, npcId, itemId, quantity) { log.push(['validateNpcShopPurchase', playerId, npcId, itemId, quantity]); },
        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },
        getPlayerViewOrThrow() { return { tick: 1 }; },
    };
    const result = service.enqueueBuyNpcShopItem('player:1', 'npc_a', 'qi_pill', 2, deps);
    assert.deepEqual(log, [['validateNpcShopPurchase', 'player:1', 'npc_a', 'qi_pill', 2]]);
    assert.deepEqual(queued.get('player:1'), { kind: 'buyNpcShopItem', npcId: 'npc_a', itemId: 'qi_pill', quantity: 2 });
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
        ['queuePlayerNotice', 'player:1', '购买 聚气丹，消耗 灵石 x5', 'success'],
    ]);
}

testQueryBuildNpcShopView();
testWorldRuntimeFacadeBuildNpcShopView();
testQueryValidateNpcShopPurchase();
testWorldRuntimeFacadeValidateNpcShopPurchase();
testEnqueue();
testDispatch();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-npc-shop' }, null, 2));
