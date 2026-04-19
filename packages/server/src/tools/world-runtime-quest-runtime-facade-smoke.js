"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeQuestRuntimeFacadeService } = require("../runtime/world/world-runtime-quest-runtime-facade.service");

function testQuestRuntimeFacade() {
    const service = new WorldRuntimeQuestRuntimeFacadeService();
    const log = [];
    const deps = {
        worldRuntimeNpcAccessService: {
            resolveAdjacentNpc(playerId, npcId) {
                log.push(['resolveAdjacentNpc', playerId, npcId]);
                return { id: npcId };
            },
            getNpcForPlayerMap(playerId, npcId) {
                log.push(['getNpcForPlayerMap', playerId, npcId]);
                return { id: npcId };
            },
        },
        worldRuntimeQuestStateService: {
            refreshQuestStates(playerId, forceDirty) { log.push(['refreshQuestStates', playerId, forceDirty]); },
            tryAcceptNextQuest(playerId, nextQuestId) { log.push(['tryAcceptNextQuest', playerId, nextQuestId]); return true; },
            advanceKillQuestProgress(playerId, monsterId, monsterName) { log.push(['advanceKillQuestProgress', playerId, monsterId, monsterName]); },
            advanceLearnTechniqueQuest(playerId, techniqueId) { log.push(['advanceLearnTechniqueQuest', playerId, techniqueId]); },
            canReceiveRewardItems(playerId, rewards) { log.push(['canReceiveRewardItems', playerId, rewards.length]); return true; },
        },
    };

    assert.deepEqual(service.resolveAdjacentNpc('player:1', 'npc:1', deps), { id: 'npc:1' });
    service.refreshQuestStates('player:1', true, deps);
    assert.equal(service.tryAcceptNextQuest('player:1', 'quest:2', deps), true);
    service.advanceKillQuestProgress('player:1', 'monster:1', '灰尾鼠', deps);
    service.advanceLearnTechniqueQuest('player:1', 'tech:1', deps);
    assert.equal(service.canReceiveRewardItems('player:1', [{ itemId: 'item:1' }], deps), true);
    assert.deepEqual(service.getNpcForPlayerMap('player:1', 'npc:2', deps), { id: 'npc:2' });
    assert.deepEqual(log, [
        ['resolveAdjacentNpc', 'player:1', 'npc:1'],
        ['refreshQuestStates', 'player:1', true],
        ['tryAcceptNextQuest', 'player:1', 'quest:2'],
        ['advanceKillQuestProgress', 'player:1', 'monster:1', '灰尾鼠'],
        ['advanceLearnTechniqueQuest', 'player:1', 'tech:1'],
        ['canReceiveRewardItems', 'player:1', 1],
        ['getNpcForPlayerMap', 'player:1', 'npc:2'],
    ]);
}

testQuestRuntimeFacade();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-quest-runtime-facade' }, null, 2));
