"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeSystemCommandEnqueueService } = require("../runtime/world/world-runtime-system-command-enqueue.service");

function createQueue(log = []) {
    return {
        enqueueSystemCommand(command) {
            log.push(['enqueueSystemCommand', command]);
            return { queued: true };
        },
        enqueueGmUpdatePlayer(input) {
            log.push(['enqueueGmUpdatePlayer', input]);
            return { queued: true };
        },
        enqueueGmResetPlayer(playerId) {
            log.push(['enqueueGmResetPlayer', playerId]);
            return { queued: true };
        },
        enqueueGmSpawnBots(anchorPlayerId, count) {
            log.push(['enqueueGmSpawnBots', anchorPlayerId, count]);
            return { queued: true };
        },
        enqueueGmRemoveBots(playerIds, all) {
            log.push(['enqueueGmRemoveBots', playerIds, all]);
            return { queued: true };
        },
    };
}

function createDeps(log = []) {
    return {
        getInstanceRuntimeOrThrow(instanceId) {
            log.push(['getInstanceRuntimeOrThrow', instanceId]);
            return { meta: { instanceId } };
        },
        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { playerId };
        },
    };
}

function testSpawnMonsterLootQueue() {
    const log = [];
    const queue = createQueue(log);
    const deps = createDeps(log);
    const service = new WorldRuntimeSystemCommandEnqueueService(queue);
    const result = service.enqueueSpawnMonsterLoot(' public:alpha ', ' monster.a ', 4.8, 7.2, 3.9, deps);
    assert.deepEqual(result, { queued: true });
    assert.deepEqual(log, [
        ['getInstanceRuntimeOrThrow', 'public:alpha'],
        ['enqueueSystemCommand', {
            kind: 'spawnMonsterLoot',
            instanceId: 'public:alpha',
            monsterId: 'monster.a',
            x: 4,
            y: 7,
            rolls: 3,
        }],
    ]);
}

function testDamagePlayerQueue() {
    const log = [];
    const queue = createQueue(log);
    const deps = createDeps(log);
    const service = new WorldRuntimeSystemCommandEnqueueService(queue);
    service.enqueueDamagePlayer(' player:1 ', 5.9, deps);
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['enqueueSystemCommand', {
            kind: 'damagePlayer',
            playerId: 'player:1',
            amount: 5,
        }],
    ]);
}

function testGmDelegations() {
    const log = [];
    const queue = createQueue(log);
    const service = new WorldRuntimeSystemCommandEnqueueService(queue);
    service.enqueueGmUpdatePlayer({ playerId: 'player:1' });
    service.enqueueGmResetPlayer('player:2');
    service.enqueueGmSpawnBots('player:3', 4);
    service.enqueueGmRemoveBots(['bot:1'], true);
    assert.deepEqual(log, [
        ['enqueueGmUpdatePlayer', { playerId: 'player:1' }],
        ['enqueueGmResetPlayer', 'player:2'],
        ['enqueueGmSpawnBots', 'player:3', 4],
        ['enqueueGmRemoveBots', ['bot:1'], true],
    ]);
}

testSpawnMonsterLootQueue();
testDamagePlayerQueue();
testGmDelegations();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-system-command-enqueue' }, null, 2));
