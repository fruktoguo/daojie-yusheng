// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeNpcQuestWriteService } = require("../runtime/world/world-runtime-npc-quest-write.service");

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
    });
    return { promise, resolve, reject };
}

function nextTick() {
    return new Promise((resolve) => setImmediate(resolve));
}
/**
 * createService：构建并返回目标对象。
 * @param player 玩家对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(player, log = []) {
    return new WorldRuntimeNpcQuestWriteService({    
    /**
 * getPlayerOrThrow：读取玩家OrThrow。
 * @returns 无返回值，完成玩家OrThrow的读取/组装。
 */

        getPlayerOrThrow() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (!player) {
                throw new Error('player missing');
            }
            return player;
        },        
        /**
 * markQuestStateDirty：处理任务状态Dirty并更新相关状态。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新任务状态Dirty相关状态。
 */

        markQuestStateDirty(playerId) {
            log.push(['markQuestStateDirty', playerId]);
        },        
        /**
 * consumeInventoryItemByItemId：执行consume背包道具By道具ID相关逻辑。
 * @param playerId 玩家 ID。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具By道具ID相关状态。
 */

        consumeInventoryItemByItemId(playerId, itemId, count) {
            log.push(['consumeInventoryItemByItemId', playerId, itemId, count]);
        },        
        /**
 * receiveInventoryItem：执行receive背包道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param item 道具。
 * @returns 无返回值，直接更新receive背包道具相关状态。
 */

        receiveInventoryItem(playerId, item) {
            log.push(['receiveInventoryItem', playerId, item.itemId, item.count ?? 1]);
        },
        replaceInventoryItems(playerId, items) {
            player.inventory = player.inventory ?? { items: [] };
            player.inventory.items = items.map((entry) => ({ ...entry }));
            log.push(['replaceInventoryItems', playerId, items.map((entry) => [entry.itemId, entry.count])]);
        },
        replaceWalletBalances(playerId, balances) {
            player.wallet = {
                balances: balances.map((entry) => ({ ...entry })),
            };
            log.push(['replaceWalletBalances', playerId, balances.map((entry) => [entry.walletType, entry.balance, entry.version])]);
        },
        creditWallet(playerId, walletType, amount) {
            log.push(['creditWallet', playerId, walletType, amount]);
        },
    }, {
        createQuestStateFromSource(playerId, questId, status = 'active') {
            log.push(['createQuestStateFromSource', playerId, questId, status]);
            return {
                id: questId,
                title: questId === 'quest:next' ? '后续任务' : questId,
                status,
                progress: 0,
                required: 1,
            };
        },
    });
}
/**
 * testExecuteNpcQuestActionQueuesSubmit：执行testExecuteNPC任务ActionQueueSubmit相关逻辑。
 * @returns 无返回值，直接更新testExecuteNPC任务ActionQueueSubmit相关状态。
 */


function testExecuteNpcQuestActionQueuesSubmit() {
    const player = { templateId: 'map_a' };
    const service = createService(player);
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @returns 无返回值，直接更新NPC任务视图相关状态。
 */

        buildNpcQuestsView() {
            return {
                quests: [{ id: 'quest:ready', status: 'ready', submitNpcId: 'npc_a' }],
            };
        },
    };
    const result = service.executeNpcQuestAction('player:1', 'npc_a', deps);
    assert.deepEqual(queued.get('player:1'), {
        kind: 'submitNpcQuest',
        npcId: 'npc_a',
        questId: 'quest:ready',
    });
    assert.equal(result.kind, 'npcQuests');
}
/**
 * testEnqueueNpcInteraction：处理testEnqueueNPCInteraction并更新相关状态。
 * @returns 无返回值，直接更新testEnqueueNPCInteraction相关状态。
 */


function testEnqueueNpcInteraction() {
    const service = createService({ templateId: 'map_a' });
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getPlayerViewOrThrow：读取玩家视图OrThrow。
 * @returns 无返回值，完成玩家视图OrThrow的读取/组装。
 */

        getPlayerViewOrThrow() {
            return { tick: 1 };
        },
    };
    const result = service.enqueueNpcInteraction('player:1', ' npc:npc_a ', deps);
    assert.deepEqual(queued.get('player:1'), {
        kind: 'npcInteraction',
        npcId: 'npc_a',
    });
    assert.deepEqual(result, { tick: 1 });
}
/**
 * testEnqueueAcceptAndSubmitNpcQuest：处理testEnqueueAcceptAndSubmitNPC任务并更新相关状态。
 * @returns 无返回值，直接更新testEnqueueAcceptAndSubmitNPC任务相关状态。
 */


function testEnqueueAcceptAndSubmitNpcQuest() {
    const service = createService({ templateId: 'map_a' });
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getPlayerViewOrThrow：读取玩家视图OrThrow。
 * @returns 无返回值，完成玩家视图OrThrow的读取/组装。
 */

        getPlayerViewOrThrow() {
            return { tick: 2 };
        },
    };
    const acceptView = service.enqueueAcceptNpcQuest('player:1', ' npc_a ', ' quest:accept ', deps);
    assert.deepEqual(queued.get('player:1'), {
        kind: 'acceptNpcQuest',
        npcId: 'npc_a',
        questId: 'quest:accept',
    });
    assert.deepEqual(acceptView, { tick: 2 });
    const submitView = service.enqueueSubmitNpcQuest('player:1', ' npc_a ', ' quest:submit ', deps);
    assert.deepEqual(queued.get('player:1'), {
        kind: 'submitNpcQuest',
        npcId: 'npc_a',
        questId: 'quest:submit',
    });
    assert.deepEqual(submitView, { tick: 2 });
}
/**
 * testEnqueueLegacyNpcInteractionDelegates：处理testEnqueueLegacyNPCInteractionDelegate并更新相关状态。
 * @returns 无返回值，直接更新testEnqueueLegacyNPCInteractionDelegate相关状态。
 */


function testEnqueueLegacyNpcInteractionDelegates() {
    const service = createService({ templateId: 'map_a' });
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getPlayerViewOrThrow：读取玩家视图OrThrow。
 * @returns 无返回值，完成玩家视图OrThrow的读取/组装。
 */

        getPlayerViewOrThrow() {
            return { tick: 3 };
        },
    };
    service.enqueueLegacyNpcInteraction('player:1', 'npc:npc_b', deps);
    assert.deepEqual(queued.get('player:1'), {
        kind: 'npcInteraction',
        npcId: 'npc_b',
    });
}
/**
 * testExecuteNpcQuestActionQueuesAccept：执行testExecuteNPC任务ActionQueueAccept相关逻辑。
 * @returns 无返回值，直接更新testExecuteNPC任务ActionQueueAccept相关状态。
 */


function testExecuteNpcQuestActionQueuesAccept() {
    const player = { templateId: 'map_a' };
    const service = createService(player);
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @returns 无返回值，直接更新NPC任务视图相关状态。
 */

        buildNpcQuestsView() {
            return {
                quests: [{ id: 'quest:available', status: 'available' }],
            };
        },
    };
    service.executeNpcQuestAction('player:1', 'npc_a', deps);
    assert.deepEqual(queued.get('player:1'), {
        kind: 'acceptNpcQuest',
        npcId: 'npc_a',
        questId: 'quest:available',
    });
}
/**
 * testExecuteNpcQuestActionQueuesTalkInteract：执行testExecuteNPC任务ActionQueueTalkInteract相关逻辑。
 * @returns 无返回值，直接更新testExecuteNPC任务ActionQueueTalkInteract相关状态。
 */


function testExecuteNpcQuestActionQueuesTalkInteract() {
    const player = { templateId: 'map_a' };
    const service = createService(player);
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @returns 无返回值，直接更新NPC任务视图相关状态。
 */

        buildNpcQuestsView() {
            return {
                quests: [{
                    id: 'quest:talk',
                    status: 'active',
                    objectiveType: 'talk',
                    targetNpcId: 'npc_a',
                    targetMapId: 'map_a',
                }],
            };
        },
    };
    service.executeNpcQuestAction('player:1', 'npc_a', deps);
    assert.deepEqual(queued.get('player:1'), {
        kind: 'interactNpcQuest',
        npcId: 'npc_a',
    });
}
/**
 * testDispatchNpcInteractionPrioritizesSubmit：判断testDispatchNPCInteractionPrioritizeSubmit是否满足条件。
 * @returns 无返回值，直接更新testDispatchNPCInteractionPrioritizeSubmit相关状态。
 */


async function testDispatchNpcInteractionPrioritizesSubmit() {
    const log = [];
    const player = {
        templateId: 'map_a',
        quests: {
            quests: [
                { id: 'quest:ready', status: 'ready', submitNpcId: 'npc_a', submitMapId: 'map_a' },
                { id: 'quest:talk', status: 'active', objectiveType: 'talk', targetNpcId: 'npc_a', targetMapId: 'map_a' },
            ],
        },
    };
    const service = createService(player, log);
    const deferred = createDeferred();
    service.dispatchSubmitNpcQuest = (playerId, npcId, questId) => {
        log.push(['dispatchSubmitNpcQuest', playerId, npcId, questId]);
        return deferred.promise;
    };
    service.dispatchInteractNpcQuest = () => {
        log.push(['dispatchInteractNpcQuest']);
    };
    service.dispatchAcceptNpcQuest = () => {
        log.push(['dispatchAcceptNpcQuest']);
    };
    const pendingDispatch = service.dispatchNpcInteraction('player:1', 'npc_a', {    
    /**
 * resolveAdjacentNpc：规范化或转换AdjacentNPC。
 * @returns 无返回值，直接更新AdjacentNPC相关状态。
 */

        resolveAdjacentNpc() {
            return { npcId: 'npc_a', name: '阿青', dialogue: '你好' };
        },        
        /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
 */

        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },        
        /**
 * createNpcQuestsEnvelope：构建并返回目标对象。
 * @returns 无返回值，直接更新NPC任务Envelope相关状态。
 */

        createNpcQuestsEnvelope() {
            return { quests: [] };
        },        
        /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    await nextTick();
    assert.deepEqual(log, [
        ['refreshQuestStates', 'player:1'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc_a', 'quest:ready'],
    ]);
    deferred.resolve();
    await pendingDispatch;
}
/**
 * testDispatchNpcInteractionFallsBackToDialogueNotice：判断testDispatchNPCInteractionFallBackToDialogueNotice是否满足条件。
 * @returns 无返回值，直接更新testDispatchNPCInteractionFallBackToDialogueNotice相关状态。
 */


function testDispatchNpcInteractionFallsBackToDialogueNotice() {
    const log = [];
    const player = {
        templateId: 'map_a',
        quests: {
            quests: [],
        },
    };
    const service = createService(player, log);
    service.dispatchNpcInteraction('player:1', 'npc_a', {    
    /**
 * resolveAdjacentNpc：规范化或转换AdjacentNPC。
 * @returns 无返回值，直接更新AdjacentNPC相关状态。
 */

        resolveAdjacentNpc() {
            return { npcId: 'npc_a', name: '阿青', dialogue: '先去历练吧。' };
        },        
        /**
 * refreshQuestStates：执行refresh任务状态相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新refresh任务状态相关状态。
 */

        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },        
        /**
 * createNpcQuestsEnvelope：构建并返回目标对象。
 * @returns 无返回值，直接更新NPC任务Envelope相关状态。
 */

        createNpcQuestsEnvelope() {
            return { quests: [] };
        },        
        /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '阿青：先去历练吧。', 'info'],
    ]);
}

async function testDispatchSubmitNpcQuestUsesDurableInventoryGrant() {
    const log = [];
    const player = {
        playerId: 'player:1',
        name: '阿一',
        templateId: 'map_a',
        instanceId: 'instance:quest-smoke',
        runtimeOwnerId: 'runtime-owner:quest-smoke',
        sessionEpoch: 6,
        inventory: {
            items: [{ itemId: 'quest_token', count: 1, name: '信物' }],
            capacity: 8,
        },
        quests: {
            quests: [{
                id: 'quest:ready',
                status: 'ready',
                submitNpcId: 'npc_a',
                rewardText: '奖励到手',
                nextQuestId: 'quest:next',
                requiredItemId: 'quest_token',
                requiredItemCount: 1,
            }],
        },
    };
    const service = createService(player, log);
    const deferred = createDeferred();
    const deps = {
        resolveAdjacentNpc() {
            return { npcId: 'npc_a', name: '阿青' };
        },
        buildQuestRewardItems() {
            return [
                { itemId: 'rat_tail', count: 2 },
                { itemId: 'spirit_stone', count: 3 },
            ];
        },
        durableOperationService: {
            isEnabled() {
                return true;
            },
            async submitNpcQuestRewards(input) {
                log.push(['submitNpcQuestRewards', input.questId, input.expectedInstanceId, input.expectedAssignedNodeId, input.expectedOwnershipEpoch]);
                return deferred.promise;
            },
        },
        instanceCatalogService: {
            isEnabled() {
                return true;
            },
            async loadInstanceCatalog(instanceId) {
                assert.equal(instanceId, 'instance:quest-smoke');
                return {
                    assigned_node_id: 'node:quest-smoke',
                    ownership_epoch: 11,
                };
            },
        },
        tryAcceptNextQuest() {
            return null;
        },
        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    };
    const promise = service.dispatchSubmitNpcQuest('player:1', 'npc_a', 'quest:ready', deps);
    await nextTick();
    assert.deepEqual(log, [
        ['createQuestStateFromSource', 'player:1', 'quest:next', 'active'],
        ['submitNpcQuestRewards', 'quest:ready', 'instance:quest-smoke', 'node:quest-smoke', 11],
    ]);
    assert.equal(player.quests.quests[0].status, 'ready');
    deferred.resolve({
        ok: true,
        alreadyCommitted: false,
        questId: 'quest:ready',
    });
    await promise;
    assert.deepEqual(log, [
        ['createQuestStateFromSource', 'player:1', 'quest:next', 'active'],
        ['submitNpcQuestRewards', 'quest:ready', 'instance:quest-smoke', 'node:quest-smoke', 11],
        ['replaceInventoryItems', 'player:1', [['rat_tail', 2]]],
        ['replaceWalletBalances', 'player:1', [['spirit_stone', 3, 1]]],
        ['markQuestStateDirty', 'player:1'],
        ['refreshQuestStates', 'player:1'],
        ['queuePlayerNotice', 'player:1', '阿青：做得不错，这是你的奖励 奖励到手', 'success'],
        ['queuePlayerNotice', 'player:1', '新的任务《后续任务》已自动接取', 'info'],
    ]);
    assert.equal(player.quests.quests[0].status, 'completed');
    assert.equal(player.quests.quests[1].id, 'quest:next');
    assert.equal(player.wallet.balances[0].walletType, 'spirit_stone');
    assert.equal(player.wallet.balances[0].balance, 3);
}

async function main() {
    testEnqueueNpcInteraction();
    testEnqueueAcceptAndSubmitNpcQuest();
    testEnqueueLegacyNpcInteractionDelegates();
    testExecuteNpcQuestActionQueuesSubmit();
    testExecuteNpcQuestActionQueuesAccept();
    testExecuteNpcQuestActionQueuesTalkInteract();
    await testDispatchNpcInteractionPrioritizesSubmit();
    testDispatchNpcInteractionFallsBackToDialogueNotice();
    await testDispatchSubmitNpcQuestUsesDurableInventoryGrant();
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-npc-quest-write' }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
