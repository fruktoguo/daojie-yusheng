"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeMovementService } = require("../runtime/world/world-runtime-movement.service");

function buildDeps(log) {
    const playerLocations = new Map([['player:1', { instanceId: 'instance:1', sessionId: 'session:1' }]]);
    const instanceRuntimes = new Map([['instance:1', {
        setPlayerMoveSpeed(playerId, speed) { log.push(['setPlayerMoveSpeed', playerId, speed]); },
        enqueueMove(payload) { log.push(['enqueueMove', payload]); },
        tryPortalTransfer(playerId, mode) {
            log.push(['tryPortalTransfer', playerId, mode]);
            if (mode === 'manual_portal') {
                return null;
            }
            return { fromInstanceId: 'instance:1', targetMapId: 'yunlai_town', targetX: 8, targetY: 9, playerId, sessionId: 'session:1', reason: mode };
        },
        enqueuePortalUse(payload) { log.push(['enqueuePortalUse', payload]); },
    }]]);
    return {
        getPlayerLocation(playerId) {
            return playerLocations.get(playerId) ?? null;
        },
        getInstanceRuntime(instanceId) {
            return instanceRuntimes.get(instanceId) ?? null;
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                if (playerId !== 'player:1') return null;
                return { hp: 10, attrs: { numericStats: { moveSpeed: 12 } } };
            },
            recordActivity(playerId, tick, payload) { log.push(['recordActivity', playerId, tick, payload]); },
        },
        resolveCurrentTickForPlayerId() { return 33; },
        worldRuntimeCraftInterruptService: {
            interruptCraftForReason(playerId, _player, reason) { log.push(['interruptCraftForReason', playerId, reason]); },
        },
        applyTransfer(transfer) { log.push(['applyTransfer', transfer.reason]); },
    };
}

function testMoveBranch() {
    const log = [];
    const service = new WorldRuntimeMovementService();
    const deps = buildDeps(log);
    service.dispatchInstanceCommand('player:1', {
        kind: 'move',
        direction: 2,
        continuous: true,
        maxSteps: 3,
        path: [{ x: 1, y: 2 }],
        resetBudget: true,
    }, deps);
    assert.deepEqual(log, [
        ['setPlayerMoveSpeed', 'player:1', 12],
        ['recordActivity', 'player:1', 33, { interruptCultivation: true }],
        ['interruptCraftForReason', 'player:1', 'move'],
        ['enqueueMove', {
            playerId: 'player:1',
            direction: 2,
            continuous: true,
            maxSteps: 3,
            path: [{ x: 1, y: 2 }],
            resetBudget: true,
        }],
    ]);
}

function testPortalBranch() {
    const log = [];
    const service = new WorldRuntimeMovementService();
    const deps = buildDeps(log);
    service.dispatchInstanceCommand('player:1', { kind: 'portal' }, deps);
    assert.deepEqual(log, [
        ['recordActivity', 'player:1', 33, { interruptCultivation: true }],
        ['interruptCraftForReason', 'player:1', 'move'],
        ['tryPortalTransfer', 'player:1', 'manual_portal'],
        ['tryPortalTransfer', 'player:1', 'auto_portal'],
        ['applyTransfer', 'auto_portal'],
    ]);
}

testMoveBranch();
testPortalBranch();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-movement' }, null, 2));
