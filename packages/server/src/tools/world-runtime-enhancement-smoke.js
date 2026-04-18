"use strict";

const assert = require("node:assert/strict");
const { WorldRuntimeEnhancementService } = require("../runtime/world/world-runtime-enhancement.service");

function createDeps(log) {
    return {
        queuePlayerNotice(playerId, message, kind) { log.push(['queuePlayerNotice', playerId, message, kind]); },
        getInstanceRuntimeOrThrow() {
            return {
                dropGroundItem() { log.push(['dropGroundItem']); return { sourceId: 'ground:1' }; },
            };
        },
        spawnGroundItem() { log.push(['spawnGroundItem']); },
    };
}

function testStartEnhancement() {
    const log = [];
    const service = new WorldRuntimeEnhancementService({
        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },
        getPlayer() { return { playerId: 'player:1' }; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    }, {
        startEnhancement() { return { ok: true, messages: [{ text: '强化开始', kind: 'success' }], panelChanged: true, groundDrops: [] }; },
        buildEnhancementPanelPayload() { return { ok: true }; },
    }, {
        getSocketByPlayerId() { return { emit(event, payload) { log.push(['emit', event, payload.ok]); } }; },
    }, {
        prefersNext() { return true; },
    });
    service.dispatchStartEnhancement('player:1', { target: 1 }, createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '强化开始', 'success'],
        ['emit', 'n:s:alchemyEnhancementPanel', true],
    ]);
}

function testCancelEnhancement() {
    const log = [];
    const service = new WorldRuntimeEnhancementService({
        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },
        getPlayer() { return { playerId: 'player:1' }; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    }, {
        cancelEnhancement() { return { ok: true, messages: [{ text: '强化取消', kind: 'info' }], panelChanged: false, groundDrops: [] }; },
        buildEnhancementPanelPayload() { return { ok: true }; },
    }, {
        getSocketByPlayerId() { return { emit() { log.push(['emit']); } }; },
    }, {
        prefersNext() { return true; },
    });
    service.dispatchCancelEnhancement('player:1', createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '强化取消', 'info'],
    ]);
}

testStartEnhancement();
testCancelEnhancement();
console.log(JSON.stringify({ ok: true, case: 'world-runtime-enhancement' }, null, 2));
