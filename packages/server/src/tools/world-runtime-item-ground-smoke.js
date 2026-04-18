"use strict";

const assert = require("node:assert/strict");
const { WorldRuntimeItemGroundService } = require("../runtime/world/world-runtime-item-ground.service");

function testDropItem() {
    const log = [];
    const service = new WorldRuntimeItemGroundService({
        getPlayerOrThrow() { return { x: 5, y: 7 }; },
        splitInventoryItem(playerId, slotIndex, count) {
            log.push(['splitInventoryItem', playerId, slotIndex, count]);
            return { itemId: 'rat_tail', name: '鼠尾', count: 2 };
        },
        receiveInventoryItem(playerId, item) { log.push(['receiveInventoryItem', playerId, item.itemId, item.count]); },
    });
    const deps = {
        getPlayerLocationOrThrow() { return { instanceId: 'instance:1' }; },
        getInstanceRuntimeOrThrow() {
            return {
                dropGroundItem(x, y, item) {
                    log.push(['dropGroundItem', x, y, item.itemId, item.count]);
                    return { sourceId: 'ground:1' };
                },
            };
        },
        refreshQuestStates(playerId) { log.push(['refreshQuestStates', playerId]); },
        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },
    };
    service.dispatchDropItem('player:1', 2, 2, deps);
    assert.deepEqual(log, [
        ['splitInventoryItem', 'player:1', 2, 2],
        ['dropGroundItem', 5, 7, 'rat_tail', 2],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '放下 鼠尾x2', 'info'],
    ]);
}

function testTakeGroundDelegation() {
    const log = [];
    const service = new WorldRuntimeItemGroundService({});
    const deps = {
        worldRuntimeLootContainerService: {
            dispatchTakeGround(playerId, sourceId, itemKey) { log.push(['dispatchTakeGround', playerId, sourceId, itemKey]); },
            dispatchTakeGroundAll(playerId, sourceId) { log.push(['dispatchTakeGroundAll', playerId, sourceId]); },
        },
    };
    service.dispatchTakeGround('player:1', 'ground:1', 'item:1', deps);
    service.dispatchTakeGroundAll('player:1', 'ground:1', deps);
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
    ]);
}

testDropItem();
testTakeGroundDelegation();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-item-ground' }, null, 2));
