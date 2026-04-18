"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeNpcQuestWriteService } = require("../runtime/world/world-runtime-npc-quest-write.service");

function createService(player, log = []) {
    return new WorldRuntimeNpcQuestWriteService({
        getPlayerOrThrow() {
            if (!player) {
                throw new Error('player missing');
            }
            return player;
        },
        markQuestStateDirty(playerId) {
            log.push(['markQuestStateDirty', playerId]);
        },
        consumeInventoryItemByItemId(playerId, itemId, count) {
            log.push(['consumeInventoryItemByItemId', playerId, itemId, count]);
        },
        receiveInventoryItem(playerId, item) {
            log.push(['receiveInventoryItem', playerId, item.itemId, item.count ?? 1]);
        },
    });
}

function testExecuteNpcQuestActionQueuesSubmit() {
    const player = { templateId: 'map_a' };
    const service = createService(player);
    const deps = {
        pendingCommands: new Map(),
        buildNpcQuestsView() {
            return {
                quests: [{ id: 'quest:ready', status: 'ready', submitNpcId: 'npc_a' }],
            };
        },
    };
    const result = service.executeNpcQuestAction('player:1', 'npc_a', deps);
    assert.deepEqual(deps.pendingCommands.get('player:1'), {
        kind: 'submitNpcQuest',
        npcId: 'npc_a',
        questId: 'quest:ready',
    });
    assert.equal(result.kind, 'npcQuests');
}

function testEnqueueNpcInteraction() {
    const service = createService({ templateId: 'map_a' });
    const deps = {
        pendingCommands: new Map(),
        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },
        getPlayerViewOrThrow() {
            return { tick: 1 };
        },
    };
    const result = service.enqueueNpcInteraction('player:1', ' npc:npc_a ', deps);
    assert.deepEqual(deps.pendingCommands.get('player:1'), {
        kind: 'npcInteraction',
        npcId: 'npc_a',
    });
    assert.deepEqual(result, { tick: 1 });
}

function testEnqueueAcceptAndSubmitNpcQuest() {
    const service = createService({ templateId: 'map_a' });
    const deps = {
        pendingCommands: new Map(),
        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },
        getPlayerViewOrThrow() {
            return { tick: 2 };
        },
    };
    const acceptView = service.enqueueAcceptNpcQuest('player:1', ' npc_a ', ' quest:accept ', deps);
    assert.deepEqual(deps.pendingCommands.get('player:1'), {
        kind: 'acceptNpcQuest',
        npcId: 'npc_a',
        questId: 'quest:accept',
    });
    assert.deepEqual(acceptView, { tick: 2 });
    const submitView = service.enqueueSubmitNpcQuest('player:1', ' npc_a ', ' quest:submit ', deps);
    assert.deepEqual(deps.pendingCommands.get('player:1'), {
        kind: 'submitNpcQuest',
        npcId: 'npc_a',
        questId: 'quest:submit',
    });
    assert.deepEqual(submitView, { tick: 2 });
}

function testEnqueueLegacyNpcInteractionDelegates() {
    const service = createService({ templateId: 'map_a' });
    const deps = {
        pendingCommands: new Map(),
        getPlayerLocationOrThrow() {
            return { instanceId: 'public:yunlai_town' };
        },
        getPlayerViewOrThrow() {
            return { tick: 3 };
        },
    };
    service.enqueueLegacyNpcInteraction('player:1', 'npc:npc_b', deps);
    assert.deepEqual(deps.pendingCommands.get('player:1'), {
        kind: 'npcInteraction',
        npcId: 'npc_b',
    });
}

function testExecuteNpcQuestActionQueuesAccept() {
    const player = { templateId: 'map_a' };
    const service = createService(player);
    const deps = {
        pendingCommands: new Map(),
        buildNpcQuestsView() {
            return {
                quests: [{ id: 'quest:available', status: 'available' }],
            };
        },
    };
    service.executeNpcQuestAction('player:1', 'npc_a', deps);
    assert.deepEqual(deps.pendingCommands.get('player:1'), {
        kind: 'acceptNpcQuest',
        npcId: 'npc_a',
        questId: 'quest:available',
    });
}

function testExecuteNpcQuestActionQueuesTalkInteract() {
    const player = { templateId: 'map_a' };
    const service = createService(player);
    const deps = {
        pendingCommands: new Map(),
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
    assert.deepEqual(deps.pendingCommands.get('player:1'), {
        kind: 'interactNpcQuest',
        npcId: 'npc_a',
    });
}

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
        resolveAdjacentNpc() {
            return { npcId: 'npc_a', name: '阿青', dialogue: '你好' };
        },
        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        createNpcQuestsEnvelope() {
            return { quests: [] };
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['refreshQuestStates', 'player:1'],
        ['dispatchSubmitNpcQuest', 'player:1', 'npc_a', 'quest:ready'],
    ]);
}

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
        resolveAdjacentNpc() {
            return { npcId: 'npc_a', name: '阿青', dialogue: '先去历练吧。' };
        },
        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        createNpcQuestsEnvelope() {
            return { quests: [] };
        },
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
