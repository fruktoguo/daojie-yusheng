"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeNpcQuestInteractionQueryService } = require("../runtime/world/world-runtime-npc-quest-interaction-query.service");

function createService(player, collectNpcQuestViews) {
    return new WorldRuntimeNpcQuestInteractionQueryService({
        collectNpcQuestViews,
    }, {
        getPlayer() {
            return player;
        },
    });
}

function testResolveNpcQuestMarkerReady() {
    const service = createService({
        templateId: 'map_a',
        quests: {
            quests: [{ status: 'ready', submitNpcId: 'npc_a', submitMapId: 'map_a', line: 'main' }],
        },
    }, () => {
        throw new Error('should not collect npc quests for ready');
    });
    const marker = service.resolveNpcQuestMarker('player:1', 'npc_a', {
        getNpcForPlayerMap() {
            throw new Error('should not read npc for ready');
        },
    });
    assert.deepEqual(marker, { line: 'main', state: 'ready' });
}

function testResolveNpcQuestMarkerActive() {
    const service = createService({
        templateId: 'map_a',
        quests: {
            quests: [{ status: 'active', objectiveType: 'talk', targetNpcId: 'npc_a', targetMapId: 'map_a', line: 'branch' }],
        },
    }, () => {
        throw new Error('should not collect npc quests for active');
    });
    const marker = service.resolveNpcQuestMarker('player:1', 'npc_a', {
        getNpcForPlayerMap() {
            throw new Error('should not read npc for active');
        },
    });
    assert.deepEqual(marker, { line: 'branch', state: 'active' });
}

function testResolveNpcQuestMarkerAvailable() {
    const log = [];
    const npc = { npcId: 'npc_a', name: '阿青', quests: [] };
    const service = createService({
        templateId: 'map_a',
        quests: {
            quests: [],
        },
    }, (playerId, receivedNpc) => {
        log.push(['collectNpcQuestViews', playerId, receivedNpc.npcId]);
        return [{ status: 'available', line: 'side' }];
    });
    const marker = service.resolveNpcQuestMarker('player:1', 'npc_a', {
        getNpcForPlayerMap(playerId, npcId) {
            log.push(['getNpcForPlayerMap', playerId, npcId]);
            return npc;
        },
    });
    assert.deepEqual(marker, { line: 'side', state: 'available' });
    assert.deepEqual(log, [
        ['getNpcForPlayerMap', 'player:1', 'npc_a'],
        ['collectNpcQuestViews', 'player:1', 'npc_a'],
    ]);
}

function testResolveNpcQuestMarkerReturnsUndefinedWithoutPlayer() {
    const service = createService(null, () => {
        throw new Error('should not collect without player');
    });
    const marker = service.resolveNpcQuestMarker('player:1', 'npc_a', {
        getNpcForPlayerMap() {
            throw new Error('should not read npc without player');
        },
    });
    assert.equal(marker, undefined);
}

function testResolveNpcQuestMarkerReturnsUndefinedWithoutNpc() {
    const service = createService({
        templateId: 'map_a',
        quests: {
            quests: [],
        },
    }, () => {
        throw new Error('should not collect npc quests without npc');
    });
    const marker = service.resolveNpcQuestMarker('player:1', 'npc_a', {
        getNpcForPlayerMap() {
            return null;
        },
    });
    assert.equal(marker, undefined);
}

testResolveNpcQuestMarkerReady();
testResolveNpcQuestMarkerActive();
testResolveNpcQuestMarkerAvailable();
testResolveNpcQuestMarkerReturnsUndefinedWithoutPlayer();
testResolveNpcQuestMarkerReturnsUndefinedWithoutNpc();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-npc-quest-interaction-query' }, null, 2));
