"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeTransferService } = require("../runtime/world/world-runtime-transfer.service");

function testMissingSourceIsNoop() {
    const log = [];
    const service = new WorldRuntimeTransferService();
    const playerLocations = new Map();
    service.applyTransfer({
        playerId: 'player:1',
        sessionId: 'session:1',
        fromInstanceId: 'missing',
        targetMapId: 'yunlai_town',
        targetX: 8,
        targetY: 9,
        reason: 'portal',
    }, {
        getInstanceRuntime() {
            return null;
        },
        setPlayerLocation(playerId, location) {
            playerLocations.set(playerId, location);
        },
        playerRuntimeService: {
            getPlayer() {
                log.push('getPlayer');
                return null;
            },
        },
        getOrCreatePublicInstance() {
            log.push('getOrCreatePublicInstance');
            return {};
        },
        worldRuntimeNavigationService: {
            handleTransfer() {
                log.push('handleTransfer');
            },
        },
    });
    assert.deepEqual(log, []);
    assert.equal(playerLocations.size, 0);
}

function testApplyTransfer() {
    const log = [];
    const service = new WorldRuntimeTransferService();
    const playerLocations = new Map();
    const source = {
        disconnectPlayer(playerId) {
            log.push(['disconnectPlayer', playerId]);
        },
    };
    const target = {
        meta: { instanceId: 'public:yunlai_town' },
        connectPlayer(payload) {
            log.push(['connectPlayer', payload]);
        },
        setPlayerMoveSpeed(playerId, speed) {
            log.push(['setPlayerMoveSpeed', playerId, speed]);
        },
    };
    const transfer = {
        playerId: 'player:1',
        sessionId: 'session:1',
        fromInstanceId: 'instance:old',
        targetMapId: 'yunlai_town',
        targetX: 8,
        targetY: 9,
        reason: 'auto_portal',
    };
    const instanceRuntimes = new Map([['instance:old', source]]);
    service.applyTransfer(transfer, {
        getInstanceRuntime(instanceId) {
            return instanceRuntimes.get(instanceId) ?? null;
        },
        setPlayerLocation(playerId, location) {
            playerLocations.set(playerId, location);
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                log.push(['getPlayer', playerId]);
                return { attrs: { numericStats: { moveSpeed: 12 } } };
            },
        },
        getOrCreatePublicInstance(mapId) {
            log.push(['getOrCreatePublicInstance', mapId]);
            return target;
        },
        worldRuntimeNavigationService: {
            handleTransfer(entry) {
                log.push(['handleTransfer', entry.reason]);
            },
        },
    });
    assert.deepEqual(log, [
        ['disconnectPlayer', 'player:1'],
        ['getOrCreatePublicInstance', 'yunlai_town'],
        ['connectPlayer', {
            playerId: 'player:1',
            sessionId: 'session:1',
            preferredX: 8,
            preferredY: 9,
        }],
        ['getPlayer', 'player:1'],
        ['setPlayerMoveSpeed', 'player:1', 12],
        ['handleTransfer', 'auto_portal'],
    ]);
    assert.deepEqual(playerLocations.get('player:1'), {
        instanceId: 'public:yunlai_town',
        sessionId: 'session:1',
    });
}

testMissingSourceIsNoop();
testApplyTransfer();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-transfer' }, null, 2));
