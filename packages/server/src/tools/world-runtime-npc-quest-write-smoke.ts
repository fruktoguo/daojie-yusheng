// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeNpcQuestWriteService } = require("../runtime/world/world-runtime-npc-quest-write.service");
/**
 * createService：构建并返回目标对象。
 * @param player 玩家对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createService(player, log = []) {
    return new WorldRuntimeNpcQuestWriteService({    
    /**
 * getPlayerOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerOrThrow() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (!player) {
                throw new Error('player missing');
            }
            return player;
        },        
        /**
 * markQuestStateDirty：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        markQuestStateDirty(playerId) {
            log.push(['markQuestStateDirty', playerId]);
        },        
        /**
 * consumeInventoryItemByItemId：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 函数返回值。
 */

        consumeInventoryItemByItemId(playerId, itemId, count) {
            log.push(['consumeInventoryItemByItemId', playerId, itemId, count]);
        },        
        /**
 * receiveInventoryItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param item 道具。
 * @returns 函数返回值。
 */

        receiveInventoryItem(playerId, item) {
            log.push(['receiveInventoryItem', playerId, item.itemId, item.count ?? 1]);
        },
    });
}
/**
 * testExecuteNpcQuestActionQueuesSubmit：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testExecuteNpcQuestActionQueuesSubmit() {
    const player = { templateId: 'map_a' };
    const service = createService(player);
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @returns 函数返回值。
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
 * testEnqueueNpcInteraction：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testEnqueueNpcInteraction() {
    const service = createService({ templateId: 'map_a' });
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getPlayerViewOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
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
 * testEnqueueAcceptAndSubmitNpcQuest：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testEnqueueAcceptAndSubmitNpcQuest() {
    const service = createService({ templateId: 'map_a' });
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getPlayerViewOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
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
 * testEnqueueLegacyNpcInteractionDelegates：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testEnqueueLegacyNpcInteractionDelegates() {
    const service = createService({ templateId: 'map_a' });
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },        
        /**
 * getPlayerViewOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
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
 * testExecuteNpcQuestActionQueuesAccept：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testExecuteNpcQuestActionQueuesAccept() {
    const player = { templateId: 'map_a' };
    const service = createService(player);
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @returns 函数返回值。
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
 * testExecuteNpcQuestActionQueuesTalkInteract：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testExecuteNpcQuestActionQueuesTalkInteract() {
    const player = { templateId: 'map_a' };
    const service = createService(player);
    const queued = new Map();
    const deps = {    
    /**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

        enqueuePendingCommand(playerId, command) { queued.set(playerId, command); },        
        /**
 * buildNpcQuestsView：构建并返回目标对象。
 * @returns 函数返回值。
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
 * testDispatchNpcInteractionPrioritizesSubmit：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDispatchNpcInteractionPrioritizesSubmit() {
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
    service.dispatchSubmitNpcQuest = (playerId, npcId, questId) => {
        log.push(['dispatchSubmitNpcQuest', playerId, npcId, questId]);
    };
    service.dispatchInteractNpcQuest = () => {
        log.push(['dispatchInteractNpcQuest']);
    };
    service.dispatchAcceptNpcQuest = () => {
        log.push(['dispatchAcceptNpcQuest']);
    };
    service.dispatchNpcInteraction('player:1', 'npc_a', {    
    /**
 * resolveAdjacentNpc：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        resolveAdjacentNpc() {
            return { npcId: 'npc_a', name: '阿青', dialogue: '你好' };
        },        
        /**
 * refreshQuestStates：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },        
        /**
 * createNpcQuestsEnvelope：构建并返回目标对象。
 * @returns 函数返回值。
 */

        createNpcQuestsEnvelope() {
            return { quests: [] };
        },        
        /**
 * queuePlayerNotice：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 函数返回值。
 */

        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['refreshQuestStates', 'player:1'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc_a', 'quest:ready'],
    ]);
}
/**
 * testDispatchNpcInteractionFallsBackToDialogueNotice：执行核心业务逻辑。
 * @returns 函数返回值。
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
 * resolveAdjacentNpc：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        resolveAdjacentNpc() {
            return { npcId: 'npc_a', name: '阿青', dialogue: '先去历练吧。' };
        },        
        /**
 * refreshQuestStates：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },        
        /**
 * createNpcQuestsEnvelope：构建并返回目标对象。
 * @returns 函数返回值。
 */

        createNpcQuestsEnvelope() {
            return { quests: [] };
        },        
        /**
 * queuePlayerNotice：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 函数返回值。
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

testEnqueueNpcInteraction();
testEnqueueAcceptAndSubmitNpcQuest();
testEnqueueLegacyNpcInteractionDelegates();
testExecuteNpcQuestActionQueuesSubmit();
testExecuteNpcQuestActionQueuesAccept();
testExecuteNpcQuestActionQueuesTalkInteract();
testDispatchNpcInteractionPrioritizesSubmit();
testDispatchNpcInteractionFallsBackToDialogueNotice();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-npc-quest-write' }, null, 2));
