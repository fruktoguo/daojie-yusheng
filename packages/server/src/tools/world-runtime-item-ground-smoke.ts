// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeItemGroundService } = require("../runtime/world/world-runtime-item-ground.service");
const { MapInstanceRuntime } = require("../runtime/instance/map-instance.runtime");
/**
 * testDropItem：执行testDrop道具相关逻辑。
 * @returns 无返回值，直接更新testDrop道具相关状态。
 */


function testDropItem() {
    const log = [];
    const service = new WorldRuntimeItemGroundService({    
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() { return { x: 5, y: 7 }; },        
        /**
 * splitInventoryItem：处理背包道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param count 数量。
 * @returns 无返回值，直接更新背包道具相关状态。
 */

        splitInventoryItemByInstanceId(playerId, itemInstanceId, count) {
            log.push(['splitInventoryItemByInstanceId', playerId, itemInstanceId, count]);
            return { itemId: 'equip.test_blade', type: 'equipment', count: 1, enhanceLevel: 5 };
        },        
        contentTemplateRepository: {
            normalizeItem(item) {
                return item?.itemId === 'equip.test_blade'
                    ? { ...item, name: '测试剑' }
                    : item;
            },
        },
        /**
 * receiveInventoryItem：执行receive背包道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param item 道具。
 * @returns 无返回值，直接更新receive背包道具相关状态。
 */

        receiveInventoryItem(playerId, item) { log.push(['receiveInventoryItem', playerId, item.itemId, item.count]); },
    });
    const deps = {    
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
            /**
 * dropGroundItem：执行drop地面道具相关逻辑。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @returns 无返回值，直接更新dropGround道具相关状态。
 */

                dropGroundItem(x, y, item) {
                    log.push(['dropGroundItem', x, y, item.itemId, item.name, item.count]);
                    return { sourceId: 'ground:1' };
                },
            };
        },        
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
    };
    service.dispatchDropItem('player:1', 'item:book', 2, deps);
    assert.deepEqual(log, [
        ['splitInventoryItemByInstanceId', 'player:1', 'item:book', 2],
        ['dropGroundItem', 5, 7, 'equip.test_blade', '测试剑', 1],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '放下 +5 测试剑', 'info'],
    ]);
}
/**
 * testTakeGroundDelegation：执行testTake地面Delegation相关逻辑。
 * @returns 无返回值，直接更新testTakeGroundDelegation相关状态。
 */


async function testTakeGroundDelegation() {
    const log = [];
    const service = new WorldRuntimeItemGroundService({});
    const deps = {
        worldRuntimeLootContainerService: {        
        /**
 * dispatchTakeGround：判断Take地面是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

            async dispatchTakeGround(playerId, sourceId, itemKey) { log.push(['dispatchTakeGround', playerId, sourceId, itemKey]); },            
            /**
 * dispatchTakeGroundAll：判断Take地面All是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @returns 无返回值，直接更新TakeGroundAll相关状态。
 */

            async dispatchTakeGroundAll(playerId, sourceId) { log.push(['dispatchTakeGroundAll', playerId, sourceId]); },
        },
    };
    await service.dispatchTakeGround('player:1', 'ground:1', 'item:1', deps);
    await service.dispatchTakeGroundAll('player:1', 'ground:1', deps);
    assert.deepEqual(log, [
        ['dispatchTakeGround', 'player:1', 'ground:1', 'item:1'],
        ['dispatchTakeGroundAll', 'player:1', 'ground:1'],
    ]);
}
/**
 * testSpawnGroundItem：执行testSpawn地面道具相关逻辑。
 * @returns 无返回值，直接更新testSpawnGround道具相关状态。
 */


function testSpawnGroundItem() {
    const log = [];
    const service = new WorldRuntimeItemGroundService({});
    service.spawnGroundItem({    
    /**
 * dropGroundItem：执行drop地面道具相关逻辑。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @returns 无返回值，直接更新dropGround道具相关状态。
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
 * testSpawnGroundItemFailure：执行testSpawn地面道具Failure相关逻辑。
 * @returns 无返回值，直接更新testSpawnGround道具Failure相关状态。
 */


function testSpawnGroundItemFailure() {
    const service = new WorldRuntimeItemGroundService({});
    assert.throws(() => {
        service.spawnGroundItem({        
        /**
 * dropGroundItem：执行drop地面道具相关逻辑。
 * @returns 无返回值，直接更新dropGround道具相关状态。
 */

            dropGroundItem() {
                return null;
            },
        }, 8, 9, { itemId: 'rat_tail', count: 1 });
    }, /无法在 8,9 生成掉落/);
}

function createGroundItemTestInstance() {
    return new MapInstanceRuntime({
        instanceId: 'public:ground-item-enhance-smoke',
        template: {
            id: 'ground-item-enhance-smoke',
            name: '地面物品强化烟测',
            width: 3,
            height: 3,
            tiles: ['...', '...', '...'],
            baseAuraByTile: new Int32Array(9),
            portals: [],
            npcs: [],
            monsters: [],
            safeZones: [],
            landmarks: [],
            containers: [],
            auras: [],
            spawnPoint: { x: 1, y: 1 },
        },
        monsterSpawns: [],
        kind: 'public',
        persistent: true,
        createdAt: Date.now(),
        displayName: '地面物品强化烟测',
        linePreset: 'peaceful',
        lineIndex: 1,
        instanceOrigin: 'smoke',
        defaultEntry: true,
        canDamageTile: true,
    });
}

function assertGroundEnhanceVariants(instance) {
    const pile = instance.getGroundPileBySourceId('g:4');
    assert.equal(pile?.items.length, 2);
    assert.deepEqual(
        pile.items.map((entry) => [entry.itemKey, entry.item.itemId, entry.item.count, entry.item.enhanceLevel ?? 0]),
        [
            ['equip.test_blade#0', 'equip.test_blade', 1, 0],
            ['equip.test_blade#5', 'equip.test_blade', 1, 5],
        ],
    );
    const view = instance.getTileGroundPile(1, 1);
    assert.deepEqual(
        view?.items.map((entry) => [entry.itemKey, entry.itemId, entry.count, entry.enhanceLevel ?? 0]),
        [
            ['equip.test_blade#0', 'equip.test_blade', 1, 0],
            ['equip.test_blade#5', 'equip.test_blade', 1, 5],
        ],
    );
}

function testEnhancedGroundItemsDoNotMerge() {
    const instance = createGroundItemTestInstance();
    instance.dropGroundItem(1, 1, { itemId: 'equip.test_blade', name: '测试剑', type: 'equipment', count: 1, enhanceLevel: 5 });
    instance.dropGroundItem(1, 1, { itemId: 'equip.test_blade', name: '测试剑', type: 'equipment', count: 1 });

    assertGroundEnhanceVariants(instance);

    const normal = instance.takeGroundItem('g:4', 'equip.test_blade#0', 1, 1);
    assert.equal(normal.itemId, 'equip.test_blade');
    assert.equal(normal.enhanceLevel, undefined);
    const enhanced = instance.takeGroundItem('g:4', 'equip.test_blade#5', 1, 1);
    assert.equal(enhanced.itemId, 'equip.test_blade');
    assert.equal(enhanced.enhanceLevel, 5);
}

function testHydratedEnhancedGroundItemsDoNotMerge() {
    const instance = createGroundItemTestInstance();
    instance.hydrateGroundPiles([
        {
            tileIndex: 4,
            items: [
                { itemId: 'equip.test_blade', name: '测试剑', type: 'equipment', count: 1, enhanceLevel: 5 },
                { itemId: 'equip.test_blade', name: '测试剑', type: 'equipment', count: 1 },
            ],
        },
    ]);

    assertGroundEnhanceVariants(instance);
}

function testLegacyBareItemKeyCompatibility() {
    const instance = createGroundItemTestInstance();
    instance.dropGroundItem(1, 1, { itemId: 'rat_tail', name: '鼠尾', type: 'material', count: 1 });
    const single = instance.takeGroundItem('g:4', 'rat_tail', 1, 1);
    assert.equal(single.itemId, 'rat_tail');

    instance.dropGroundItem(1, 1, { itemId: 'equip.test_blade', name: '测试剑', type: 'equipment', count: 1 });
    instance.dropGroundItem(1, 1, { itemId: 'equip.test_blade', name: '测试剑', type: 'equipment', count: 1, enhanceLevel: 5 });
    const ambiguous = instance.takeGroundItem('g:4', 'equip.test_blade', 1, 1);
    assert.equal(ambiguous, null);
}

Promise.resolve()
    .then(() => testDropItem())
    .then(() => testTakeGroundDelegation())
    .then(() => testSpawnGroundItem())
    .then(() => testSpawnGroundItemFailure())
    .then(() => testEnhancedGroundItemsDoNotMerge())
    .then(() => testHydratedEnhancedGroundItemsDoNotMerge())
    .then(() => testLegacyBareItemKeyCompatibility())
    .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-item-ground' }, null, 2));
});
