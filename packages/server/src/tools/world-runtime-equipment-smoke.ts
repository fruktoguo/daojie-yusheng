// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeEquipmentService } = require("../runtime/world/world-runtime-equipment.service");
/**
 * buildDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新Dep相关状态。
 */


function buildDeps(log) {
    return {
        craftPanelRuntimeService: {        
        /**
 * getLockedSlotReason：读取LockedSlotReason。
 * @returns 无返回值，完成LockedSlotReason的读取/组装。
 */

            getLockedSlotReason() { return null; },
        },        
        /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },
        worldRuntimeCraftMutationService: {        
        /**
 * emitAllTechniqueActivityPanelUpdates：处理所有技艺面板Update并更新相关状态。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新炼制面板Update相关状态。
 */

            emitAllTechniqueActivityPanelUpdates(playerId) { log.push(['emitAllTechniqueActivityPanelUpdates', playerId]); },
        },
    };
}
/**
 * testEquip：执行testEquip相关逻辑。
 * @returns 无返回值，直接更新testEquip相关状态。
 */


function testEquip() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * peekInventoryItem：执行peek背包道具相关逻辑。
 * @returns 无返回值，直接更新peek背包道具相关状态。
 */

        peekInventoryItem() { return { itemId: 'sword_1', name: '铁剑', equipSlot: 'weapon' }; },        
        /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() { return { playerId: 'player:1' }; },        
        /**
 * equipItem：执行equip道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @returns 无返回值，直接更新equip道具相关状态。
 */

        equipItem(playerId, slotIndex) { log.push(['equipItem', playerId, slotIndex]); },
    };
    const service = new WorldRuntimeEquipmentService(playerRuntimeService);
    service.dispatchEquipItem('player:1', 3, buildDeps(log));
    assert.deepEqual(log, [
        ['equipItem', 'player:1', 3],
        ['queuePlayerNotice', 'player:1', '装备 铁剑', 'success'],
        ['emitAllTechniqueActivityPanelUpdates', 'player:1'],
    ]);
}
/**
 * testUnequip：执行testUnequip相关逻辑。
 * @returns 无返回值，直接更新testUnequip相关状态。
 */


function testUnequip() {
    const log = [];
    const playerRuntimeService = {    
    /**
 * peekEquippedItem：执行peekEquipped道具相关逻辑。
 * @returns 无返回值，直接更新peekEquipped道具相关状态。
 */

        peekEquippedItem() { return { itemId: 'sword_1', name: '铁剑' }; },        
        /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() { return { playerId: 'player:1' }; },        
        /**
 * unequipItem：执行unequip道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @returns 无返回值，直接更新unequip道具相关状态。
 */

        unequipItem(playerId, slot) { log.push(['unequipItem', playerId, slot]); },
    };
    const service = new WorldRuntimeEquipmentService(playerRuntimeService);
    service.dispatchUnequipItem('player:1', 'weapon', buildDeps(log));
    assert.deepEqual(log, [
        ['unequipItem', 'player:1', 'weapon'],
        ['queuePlayerNotice', 'player:1', '卸下 铁剑', 'info'],
        ['emitAllTechniqueActivityPanelUpdates', 'player:1'],
    ]);
}

async function testDurableEquipPath() {
    const log = [];
    const playerState = {
        playerId: 'player:1',
        runtimeOwnerId: 'owner-a',
        sessionEpoch: 7,
        inventory: {
            items: [
                { itemId: 'sword_1', name: '铁剑', equipSlot: 'weapon', count: 3, enhanceLevel: 2 },
                { itemId: 'gem_1', name: '宝石', count: 2 },
            ],
        },
        equipment: {
            slots: [
                { slot: 'weapon', item: null },
                { slot: 'armor', item: { itemId: 'armor_1', name: '布甲', equipSlot: 'armor' } },
            ],
        },
    };
    const playerRuntimeService = {
        peekInventoryItem() { return playerState.inventory.items[0]; },
        peekEquippedItem() { return null; },
        getPlayerOrThrow() { return playerState; },
        snapshot() {
            return JSON.parse(JSON.stringify(playerState));
        },
        replaceInventoryItems(playerId, items) {
            log.push(['replaceInventoryItems', playerId, items.map((entry) => `${entry.itemId}:${entry.count ?? 1}:+${entry.enhanceLevel ?? 0}`)]);
            playerState.inventory.items = items.map((entry) => ({ ...entry }));
        },
        replaceEquipmentSlots(playerId, slots) {
            log.push(['replaceEquipmentSlots', playerId, slots.map((entry) => `${entry.slot}:${entry.item ? `${entry.item.itemId}:${entry.item.count ?? 1}:+${entry.item.enhanceLevel ?? 0}` : 'null'}`)]);
            playerState.equipment.slots = slots.map((entry) => ({
                slot: entry.slot,
                item: entry.item ? { ...entry.item } : null,
            }));
        },
        equipItem() {
            throw new Error('equipItem should not be used on durable path');
        },
        unequipItem() {
            throw new Error('unequipItem should not be used on durable path');
        },
    };
    const service = new WorldRuntimeEquipmentService(playerRuntimeService, {
        isEnabled() { return true; },
        updateEquipmentLoadout(input) {
            log.push([
                'updateEquipmentLoadout',
                input.action,
                input.slot,
                input.expectedRuntimeOwnerId,
                input.expectedSessionEpoch,
                input.expectedAssignedNodeId,
                input.expectedOwnershipEpoch,
            ]);
            return Promise.resolve({ ok: true, alreadyCommitted: false, action: input.action, slot: input.slot });
        },
    });
    await service.dispatchEquipItem('player:1', 0, {
        craftPanelRuntimeService: {
            getLockedSlotReason() { return null; },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
        worldRuntimeCraftMutationService: {
            emitAllTechniqueActivityPanelUpdates(playerId) {
                log.push(['emitAllTechniqueActivityPanelUpdates', playerId]);
            },
        },
        getPlayerLocation() {
            return { instanceId: 'instance:1' };
        },
        instanceCatalogService: {
            isEnabled() { return true; },
            async loadInstanceCatalog(instanceId) {
                assert.equal(instanceId, 'instance:1');
                return {
                    assigned_node_id: 'node:equipment',
                    ownership_epoch: 23,
                };
            },
        },
        getPlayerViewOrThrow() {
            return { ok: true };
        },
    });
    assert.deepEqual(log, [
        ['updateEquipmentLoadout', 'equip', 'weapon', 'owner-a', 7, 'node:equipment', 23],
        ['replaceInventoryItems', 'player:1', ['sword_1:2:+2', 'gem_1:2:+0']],
        ['replaceEquipmentSlots', 'player:1', ['weapon:sword_1:1:+2', 'armor:armor_1:1:+0']],
        ['queuePlayerNotice', 'player:1', '装备 铁剑', 'success'],
        ['emitAllTechniqueActivityPanelUpdates', 'player:1'],
    ]);
}

async function main() {
    testEquip();
    testUnequip();
    await testDurableEquipPath();
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-equipment' }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
