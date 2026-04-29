// @ts-nocheck

const assert = require("node:assert/strict");
const { WorldRuntimeNpcShopQueryService } = require("../runtime/world/world-runtime-npc-shop-query.service");
const { WorldRuntimeNpcShopService } = require("../runtime/world/world-runtime-npc-shop.service");
/**
 * testQueryBuildNpcShopView：读取testQueryBuildNPCShop视图并返回结果。
 * @returns 无返回值，直接更新testQueryBuildNPCShop视图相关状态。
 */


function testQueryBuildNpcShopView() {
    const log = [];
    const service = new WorldRuntimeNpcShopQueryService({    
    /**
 * createItem：构建并返回目标对象。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 无返回值，直接更新道具相关状态。
 */

        createItem(itemId, count) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (itemId === 'spirit_stone') {
                return { itemId, count, name: '灵石' };
            }
            if (itemId === 'qi_pill') {
                return { itemId, count, name: '聚气丹' };
            }
            return null;
        },
    }, {    
    /**
 * canReceiveInventoryItem：判断Receive背包道具是否满足条件。
 * @returns 无返回值，完成Receive背包道具的条件判断。
 */

        canReceiveInventoryItem() {
            return true;
        },        
        /**
 * canAffordWallet：判断钱包余额是否足够。
 * @returns 无返回值，完成钱包余额条件判断。
 */

        canAffordWallet() {
            return true;
        },
    });
    const result = service.buildNpcShopView('player:1', 'npc_a', {    
    /**
 * resolveAdjacentNpc：规范化或转换AdjacentNPC。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新AdjacentNPC相关状态。
 */

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
/**
 * testWorldRuntimeFacadeBuildNpcShopView：构建test世界运行态FacadeBuildNPCShop视图。
 * @returns 无返回值，直接更新test世界运行态FacadeBuildNPCShop视图相关状态。
 */


/**
 * testQueryValidateNpcShopPurchase：读取testQueryValidateNPCShopPurchase并返回结果。
 * @returns 无返回值，直接更新testQueryValidateNPCShopPurchase相关状态。
 */


function testQueryValidateNpcShopPurchase() {
    const log = [];
    const service = new WorldRuntimeNpcShopQueryService({    
    /**
 * createItem：构建并返回目标对象。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 无返回值，直接更新道具相关状态。
 */

        createItem(itemId, count) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (itemId === 'spirit_stone') {
                return { itemId, count, name: '灵石' };
            }
            if (itemId === 'qi_pill') {
                return { itemId, count, name: '聚气丹' };
            }
            return null;
        },
    }, {    
    /**
 * canReceiveInventoryItem：判断Receive背包道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param itemId 道具 ID。
 * @returns 无返回值，完成Receive背包道具的条件判断。
 */

        canReceiveInventoryItem(playerId, itemId) {
            log.push(['canReceiveInventoryItem', playerId, itemId]);
            return true;
        },        
        /**
 * canAffordWallet：判断钱包余额是否足够。
 * @param playerId 玩家 ID。
 * @param walletType 钱包类型。
 * @param amount 数量。
 * @returns 无返回值，完成钱包余额条件判断。
 */

        canAffordWallet(playerId, walletType, amount) {
            log.push(['canAffordWallet', playerId, walletType, amount]);
            return true;
        },
    });
    const result = service.validateNpcShopPurchase('player:1', 'npc_a', 'qi_pill', 2, {    
    /**
 * resolveAdjacentNpc：规范化或转换AdjacentNPC。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @returns 无返回值，直接更新AdjacentNPC相关状态。
 */

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
        ['canAffordWallet', 'player:1', 'spirit_stone', 10],
    ]);
}
/**
 * testWorldRuntimeFacadeValidateNpcShopPurchase：判断test世界运行态FacadeValidateNPCShopPurchase是否满足条件。
 * @returns 无返回值，直接更新test世界运行态FacadeValidateNPCShopPurchase相关状态。
 */


/**
 * testEnqueue：处理testEnqueue并更新相关状态。
 * @returns 无返回值，直接更新testEnqueue相关状态。
 */


function testEnqueue() {
    const log = [];
    const service = new WorldRuntimeNpcShopService({}, {    
    /**
 * getCurrencyItemName：读取Currency道具名称。
 * @returns 无返回值，完成Currency道具名称的读取/组装。
 */
 getCurrencyItemName() { return '灵石'; },    
 /**
 * getCurrencyItemId：读取Currency道具ID。
 * @returns 无返回值，完成Currency道具ID的读取/组装。
 */
 getCurrencyItemId() { return 'spirit_stone'; } });
    const queued = new Map();
    const deps = {    
    /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow() { return { instanceId: 'instance:1' }; },        
        /**
 * validateNpcShopPurchase：判断NPCShopPurchase是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @returns 无返回值，完成NPCShopPurchase的条件判断。
 */

        validateNpcShopPurchase(playerId, npcId, itemId, quantity) { log.push(['validateNpcShopPurchase', playerId, npcId, itemId, quantity]); },        
        /**
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * getPlayerViewOrThrow：读取玩家视图OrThrow。
 * @returns 无返回值，完成玩家视图OrThrow的读取/组装。
 */

        getPlayerViewOrThrow() { return { tick: 1 }; },
    };
    const result = service.enqueueBuyNpcShopItem('player:1', 'npc_a', 'qi_pill', 2, deps);
    assert.deepEqual(log, [['validateNpcShopPurchase', 'player:1', 'npc_a', 'qi_pill', 2]]);
    assert.deepEqual(queued.get('player:1'), { kind: 'buyNpcShopItem', npcId: 'npc_a', itemId: 'qi_pill', quantity: 2 });
    assert.deepEqual(result, { tick: 1 });
}
/**
 * testDispatch：判断testDispatch是否满足条件。
 * @returns 无返回值，直接更新testDispatch相关状态。
 */


async function testDispatch() {
    const durableLog = [];
    const fallbackLog = [];
    const service = new WorldRuntimeNpcShopService({
        getPlayerOrThrow() {
            return {
                runtimeOwnerId: 'runtime:player:1',
                sessionEpoch: 7,
                inventory: { items: [] },
                wallet: { balances: [{ walletType: 'spirit_stone', balance: 20, frozenBalance: 0, version: 1 }] },
            };
        },
        /**
 * debitWallet：执行wallet扣余额相关逻辑。
 * @param playerId 玩家 ID。
 * @param walletType 钱包类型。
 * @param count 数量。
 * @returns 无返回值，直接更新wallet扣余额相关状态。
 */

        debitWallet(playerId, walletType, count) { durableLog.push(['debitWallet', playerId, walletType, count]); },        
        /**
 * receiveInventoryItem：执行receive背包道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param item 道具。
 * @returns 无返回值，直接更新receive背包道具相关状态。
 */

        replaceInventoryItems(playerId, items) { durableLog.push(['replaceInventoryItems', playerId, Array.isArray(items) ? items.length : -1]); },
        receiveInventoryItem(playerId, item) { durableLog.push(['receiveInventoryItem', playerId, item.itemId, item.count]); },
    }, {    
    /**
 * getCurrencyItemId：读取Currency道具ID。
 * @returns 无返回值，完成Currency道具ID的读取/组装。
 */

        getCurrencyItemId() { return 'spirit_stone'; },        
        /**
 * getCurrencyItemName：读取Currency道具名称。
 * @returns 无返回值，完成Currency道具名称的读取/组装。
 */

        getCurrencyItemName() { return '灵石'; },
    }, {
        isEnabled() { return true; },
        async purchaseNpcShopItem(input) {
            durableLog.push([
                'purchaseNpcShopItem',
                input.playerId,
                input.itemId,
                input.quantity,
                input.totalCost,
                input.expectedAssignedNodeId,
                input.expectedOwnershipEpoch,
            ]);
            return { ok: true, alreadyCommitted: false, itemId: input.itemId, quantity: input.quantity, totalCost: input.totalCost };
        },
    });
    const deps = {    
    /**
 * validateNpcShopPurchase：判断NPCShopPurchase是否满足条件。
 * @returns 无返回值，完成NPCShopPurchase的条件判断。
 */

        validateNpcShopPurchase() { return { totalCost: 5, item: { itemId: 'qi_pill', name: '聚气丹', count: 1 } }; },        
        /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
 */

        refreshQuestStates(playerId) { durableLog.push(['refreshQuestStates', playerId]); },        
        /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, tone) { durableLog.push(['queuePlayerNotice', playerId, message, tone]); },
        getPlayerViewOrThrow() { return { tick: 1, playerId: 'player:1' }; },
        getPlayerLocation() { return { instanceId: 'instance:1' }; },
        instanceCatalogService: {
            isEnabled() { return true; },
            async loadInstanceCatalog(instanceId) {
                assert.equal(instanceId, 'instance:1');
                return {
                    assigned_node_id: 'node:npc-shop',
                    ownership_epoch: 17,
                };
            },
        },
        getPlayerOrThrow() { return { runtimeOwnerId: 'runtime:player:1', sessionEpoch: 7, inventory: { items: [] }, wallet: { balances: [{ walletType: 'spirit_stone', balance: 20, frozenBalance: 0, version: 1 }] } }; },
    };
    await service.dispatchBuyNpcShopItem('player:1', 'npc_a', 'qi_pill', 1, deps);
    assert.deepEqual(durableLog, [
        ['purchaseNpcShopItem', 'player:1', 'qi_pill', 1, 5, 'node:npc-shop', 17],
        ['replaceInventoryItems', 'player:1', 1],
        ['debitWallet', 'player:1', 'spirit_stone', 5],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '购买 聚气丹，消耗 灵石 x5', 'success'],
    ]);

    const fallbackService = new WorldRuntimeNpcShopService({
        debitWallet(playerId, walletType, count) { fallbackLog.push(['debitWallet', playerId, walletType, count]); },
        receiveInventoryItem(playerId, item) { fallbackLog.push(['receiveInventoryItem', playerId, item.itemId, item.count]); },
    }, {
        getCurrencyItemId() { return 'spirit_stone'; },
        getCurrencyItemName() { return '灵石'; },
    });
    await fallbackService.dispatchBuyNpcShopItem('player:2', 'npc_a', 'qi_pill', 1, {
        validateNpcShopPurchase() { return { totalCost: 5, item: { itemId: 'qi_pill', name: '聚气丹', count: 1 } }; },
        refreshQuestStates(playerId) { fallbackLog.push(['refreshQuestStates', playerId]); },
        queuePlayerNotice(playerId, message, tone) { fallbackLog.push(['queuePlayerNotice', playerId, message, tone]); },
        getPlayerViewOrThrow() { return { tick: 2, playerId: 'player:2' }; },
        getPlayerOrThrow() { return { inventory: { items: [] }, wallet: { balances: [] } }; },
    });
    assert.deepEqual(fallbackLog, [
        ['debitWallet', 'player:2', 'spirit_stone', 5],
        ['receiveInventoryItem', 'player:2', 'qi_pill', 1],
        ['refreshQuestStates', 'player:2'],
        ['queuePlayerNotice', 'player:2', '购买 聚气丹，消耗 灵石 x5', 'success'],
    ]);
}

testQueryBuildNpcShopView();
testQueryValidateNpcShopPurchase();
testEnqueue();
testDispatch().then(() => undefined);

console.log(JSON.stringify({ ok: true, case: 'world-runtime-npc-shop' }, null, 2));
