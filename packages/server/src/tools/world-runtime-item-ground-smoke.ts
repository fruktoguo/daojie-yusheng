// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeItemGroundService } = require("../runtime/world/world-runtime-item-ground.service");
/**
 * testDropItem：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDropItem() {
    const log = [];
    const service = new WorldRuntimeItemGroundService({    
    /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerOrThrow() { return { x: 5, y: 7 }; },        
        /**
 * splitInventoryItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @returns 函数返回值。
 */

        splitInventoryItem(playerId, slotIndex, count) {
            log.push(['splitInventoryItem', playerId, slotIndex, count]);
            return { itemId: 'rat_tail', name: '鼠尾', count: 2 };
        },        
        /**
 * receiveInventoryItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param item 道具。
 * @returns 函数返回值。
 */

        receiveInventoryItem(playerId, item) { log.push(['receiveInventoryItem', playerId, item.itemId, item.count]); },
    });
    const deps = {    
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
 * dropGroundItem：执行核心业务逻辑。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @returns 函数返回值。
 */

                dropGroundItem(x, y, item) {
                    log.push(['dropGroundItem', x, y, item.itemId, item.count]);
                    return { sourceId: 'ground:1' };
                },
            };
        },        
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
    };
    service.dispatchDropItem('player:1', 2, 2, deps);
    assert.deepEqual(log, [
        ['splitInventoryItem', 'player:1', 2, 2],
        ['dropGroundItem', 5, 7, 'rat_tail', 2],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '放下 鼠尾 x2', 'info'],
    ]);
}
/**
 * testTakeGroundDelegation：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testTakeGroundDelegation() {
    const log = [];
    const service = new WorldRuntimeItemGroundService({});
    const deps = {
        worldRuntimeLootContainerService: {        
        /**
 * dispatchTakeGround：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @returns 函数返回值。
 */

            dispatchTakeGround(playerId, sourceId, itemKey) { log.push(['dispatchTakeGround', playerId, sourceId, itemKey]); },            
            /**
 * dispatchTakeGroundAll：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @returns 函数返回值。
 */

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
/**
 * testSpawnGroundItem：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testSpawnGroundItem() {
    const log = [];
    const service = new WorldRuntimeItemGroundService({});
    service.spawnGroundItem({    
    /**
 * dropGroundItem：执行核心业务逻辑。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @returns 函数返回值。
 */

        dropGroundItem(x, y, item) {
            log.push(['dropGroundItem', x, y, item.itemId, item.count]);
            return { sourceId: 'ground:1' };
        },
    }, 3, 4, { itemId: 'rat_tail', count: 1 });
    assert.deepEqual(log, [
        ['dropGroundItem', 3, 4, 'rat_tail', 1],
    ]);
}
/**
 * testSpawnGroundItemFailure：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testSpawnGroundItemFailure() {
    const service = new WorldRuntimeItemGroundService({});
    assert.throws(() => {
        service.spawnGroundItem({        
        /**
 * dropGroundItem：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            dropGroundItem() {
                return null;
            },
        }, 8, 9, { itemId: 'rat_tail', count: 1 });
    }, /Failed to spawn loot at 8,9/);
}

testDropItem();
testTakeGroundDelegation();
testSpawnGroundItem();
testSpawnGroundItemFailure();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-item-ground' }, null, 2));
