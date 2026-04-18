"use strict";

const assert = require("node:assert/strict");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeCraftMutationService } = require("../runtime/world/world-runtime-craft-mutation.service");
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
    const playerRuntimeService = {
        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },
        getPlayer() { return { playerId: 'player:1' }; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    };
    const craftPanelRuntimeService = {
        startEnhancement() { return { ok: true, messages: [{ text: '强化开始', kind: 'success' }], panelChanged: true, groundDrops: [] }; },
        buildEnhancementPanelPayload() { return { ok: true }; },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return { emit(event, payload) { log.push(['emit', event, payload.ok]); } }; },
    }, {
        prefersNext() { return true; },
    });
    const service = new WorldRuntimeEnhancementService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchStartEnhancement('player:1', { target: 1 }, createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '强化开始', 'success'],
        ['emit', 'n:s:enhancementPanel', true],
    ]);
}

function testCancelEnhancement() {
    const log = [];
    const playerRuntimeService = {
        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },
        getPlayer() { return { playerId: 'player:1' }; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    };
    const craftPanelRuntimeService = {
        cancelEnhancement() { return { ok: true, messages: [{ text: '强化取消', kind: 'info' }], panelChanged: false, groundDrops: [] }; },
        buildEnhancementPanelPayload() { return { ok: true }; },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return { emit() { log.push(['emit']); } }; },
    }, {
        prefersNext() { return true; },
    });
    const service = new WorldRuntimeEnhancementService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchCancelEnhancement('player:1', createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '强化取消', 'info'],
    ]);
}

function testWorldRuntimeFacadeDispatchStartEnhancement() {
    const log = [];
    const runtime = {
        worldRuntimeEnhancementService: {
            dispatchStartEnhancement(playerId, payload, deps) {
                log.push(['dispatchStartEnhancement', playerId, payload, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchStartEnhancement.call(runtime, 'player:1', { slotIndex: 2 });
    assert.deepEqual(log, [
        ['dispatchStartEnhancement', 'player:1', { slotIndex: 2 }, true],
    ]);
}

function testWorldRuntimeFacadeDispatchCancelEnhancement() {
    const log = [];
    const runtime = {
        worldRuntimeEnhancementService: {
            dispatchCancelEnhancement(playerId, deps) {
                log.push(['dispatchCancelEnhancement', playerId, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchCancelEnhancement.call(runtime, 'player:1');
    assert.deepEqual(log, [
        ['dispatchCancelEnhancement', 'player:1', true],
    ]);
}

testStartEnhancement();
testCancelEnhancement();
testWorldRuntimeFacadeDispatchStartEnhancement();
testWorldRuntimeFacadeDispatchCancelEnhancement();
console.log(JSON.stringify({ ok: true, case: 'world-runtime-enhancement' }, null, 2));
