"use strict";

const assert = require("node:assert/strict");
const { WorldRuntimeEquipmentService } = require("../runtime/world/world-runtime-equipment.service");

function buildDeps(log) {
    return {
        craftPanelRuntimeService: {
            getLockedSlotReason() { return null; },
        },
        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },
        worldRuntimeCraftService: {
            emitCraftPanelUpdate(playerId, panel) { log.push(['emitCraftPanelUpdate', playerId, panel]); },
        },
    };
}

function testEquip() {
    const log = [];
    const playerRuntimeService = {
        peekInventoryItem() { return { itemId: 'sword_1', name: '铁剑', equipSlot: 'weapon' }; },
        getPlayerOrThrow() { return { playerId: 'player:1' }; },
        equipItem(playerId, slotIndex) { log.push(['equipItem', playerId, slotIndex]); },
    };
    const service = new WorldRuntimeEquipmentService(playerRuntimeService);
    service.dispatchEquipItem('player:1', 3, buildDeps(log));
    assert.deepEqual(log, [
        ['equipItem', 'player:1', 3],
        ['queuePlayerNotice', 'player:1', '装备 铁剑', 'success'],
        ['emitCraftPanelUpdate', 'player:1', 'alchemy'],
        ['emitCraftPanelUpdate', 'player:1', 'enhancement'],
    ]);
}

function testUnequip() {
    const log = [];
    const playerRuntimeService = {
        peekEquippedItem() { return { itemId: 'sword_1', name: '铁剑' }; },
        getPlayerOrThrow() { return { playerId: 'player:1' }; },
        unequipItem(playerId, slot) { log.push(['unequipItem', playerId, slot]); },
    };
    const service = new WorldRuntimeEquipmentService(playerRuntimeService);
    service.dispatchUnequipItem('player:1', 'weapon', buildDeps(log));
    assert.deepEqual(log, [
        ['unequipItem', 'player:1', 'weapon'],
        ['queuePlayerNotice', 'player:1', '卸下 铁剑', 'info'],
        ['emitCraftPanelUpdate', 'player:1', 'alchemy'],
        ['emitCraftPanelUpdate', 'player:1', 'enhancement'],
    ]);
}

testEquip();
testUnequip();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-equipment' }, null, 2));
