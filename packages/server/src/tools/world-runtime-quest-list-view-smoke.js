"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeQuestQueryService } = require("../runtime/world/world-runtime-quest-query.service");

function createQuestQueryService(log, quests) {
    return new WorldRuntimeQuestQueryService({
        getItemName(itemId) {
            return itemId;
        },
        getTechniqueName(techniqueId) {
            return techniqueId;
        },
        createItem(itemId, count) {
            return { itemId, count };
        },
    }, {
        getQuestSource() {
            return null;
        },
        getNpcLocation() {
            return null;
        },
        has() {
            return false;
        },
        getOrThrow() {
            return { name: 'ignored' };
        },
    }, {
        listQuests(playerId) {
            log.push(['listQuests', playerId]);
            return quests.map((quest) => ({
                ...quest,
                rewards: Array.isArray(quest.rewards) ? quest.rewards.map((reward) => ({ ...reward })) : [],
            }));
        },
        getPlayerOrThrow(playerId) {
            log.push(['getPlayerOrThrow', playerId]);
            return {
                quests: {
                    quests: [],
                },
            };
        },
    });
}

function testQuestQueryServiceBuildQuestListView() {
    const log = [];
    const quests = [{ id: 'quest:1', title: '云游初试', rewards: [{ itemId: 'stone', count: 1 }] }];
    const service = createQuestQueryService(log, quests);
    const view = service.buildQuestListView('player:1');
    assert.deepEqual(view, {
        quests: [{ id: 'quest:1', title: '云游初试', rewards: [{ itemId: 'stone', count: 1 }] }],
    });
    assert.notEqual(view.quests, quests);
    assert.notEqual(view.quests[0], quests[0]);
    assert.notEqual(view.quests[0].rewards, quests[0].rewards);
    assert.notEqual(view.quests[0].rewards[0], quests[0].rewards[0]);
    assert.deepEqual(log, [['listQuests', 'player:1']]);
}

function testWorldRuntimeFacadeBuildQuestListView() {
    const log = [];
    const runtime = {
        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'instance:1' };
        },
        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        worldRuntimeQuestQueryService: {
            buildQuestListView(playerId) {
                log.push(['buildQuestListView', playerId]);
                return { quests: [{ id: 'quest:2', title: '归宗试炼', rewards: [] }] };
            },
        },
    };
    const view = WorldRuntimeService.prototype.buildQuestListView.call(runtime, 'player:2', {});
    assert.deepEqual(view, {
        quests: [{ id: 'quest:2', title: '归宗试炼', rewards: [] }],
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:2'],
        ['refreshQuestStates', 'player:2'],
        ['buildQuestListView', 'player:2'],
    ]);
}

function testQuestQueryServiceBuildNpcQuestsView() {
    const log = [];
    const service = createQuestQueryService(log, []);
    const view = service.buildNpcQuestsView('player:3', 'npc_a', {
        resolveAdjacentNpc(playerId, npcId) {
            log.push(['resolveAdjacentNpc', playerId, npcId]);
            return {
                npcId,
                name: '阿青',
                quests: [],
            };
        },
    });
    assert.deepEqual(view, {
        npcId: 'npc_a',
        npcName: '阿青',
        quests: [],
    });
    assert.deepEqual(log, [
        ['resolveAdjacentNpc', 'player:3', 'npc_a'],
        ['getPlayerOrThrow', 'player:3'],
    ]);
}

function testWorldRuntimeFacadeBuildNpcQuestsView() {
    const log = [];
    const runtime = {
        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { instanceId: 'instance:2' };
        },
        refreshQuestStates(playerId) {
            log.push(['refreshQuestStates', playerId]);
        },
        worldRuntimeQuestQueryService: {
            buildNpcQuestsView(playerId, npcId, deps) {
                log.push(['buildNpcQuestsView', playerId, npcId, deps === runtime]);
                return { npcId, npcName: '阿青', quests: [] };
            },
        },
    };
    const view = WorldRuntimeService.prototype.buildNpcQuestsView.call(runtime, 'player:4', ' npc_a ');
    assert.deepEqual(view, {
        npcId: 'npc_a',
        npcName: '阿青',
        quests: [],
    });
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:4'],
        ['refreshQuestStates', 'player:4'],
        ['buildNpcQuestsView', 'player:4', 'npc_a', true],
    ]);
    assert.throws(() => WorldRuntimeService.prototype.buildNpcQuestsView.call(runtime, 'player:4', '   '), /npcId is required/);
}

testQuestQueryServiceBuildQuestListView();
testWorldRuntimeFacadeBuildQuestListView();
testQuestQueryServiceBuildNpcQuestsView();
testWorldRuntimeFacadeBuildNpcQuestsView();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-quest-list-view' }, null, 2));
