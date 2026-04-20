// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeEquipmentService } = require("../runtime/world/world-runtime-equipment.service");
/**
 * buildDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function buildDeps(log) {
    return {
        craftPanelRuntimeService: {        
        /**
 * getLockedSlotReason：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getLockedSlotReason() { return null; },
        },        
        /**
 * queuePlayerNotice：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 函数返回值。
 */

        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },
        worldRuntimeCraftMutationService: {        
        /**
 * emitCraftPanelUpdate：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param panel 参数说明。
 * @returns 函数返回值。
 */

            emitCraftPanelUpdate(playerId, panel) { log.push(['emitCraftPanelUpdate', playerId, panel]); },
        },
    };
}
/**
 * testEquip：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testEquip() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * peekInventoryItem：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        peekInventoryItem() { return { itemId: 'sword_1', name: '铁剑', equipSlot: 'weapon' }; },        
        /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerOrThrow() { return { playerId: 'player:1' }; },        
        /**
 * equipItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 函数返回值。
 */

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
/**
 * testUnequip：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testUnequip() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * peekEquippedItem：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        peekEquippedItem() { return { itemId: 'sword_1', name: '铁剑' }; },        
        /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerOrThrow() { return { playerId: 'player:1' }; },        
        /**
 * unequipItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @returns 函数返回值。
 */

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
