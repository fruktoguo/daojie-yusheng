"use strict";

const assert = require("node:assert/strict");
const { WorldRuntimeService } = require("../runtime/world/world-runtime.service");
const { WorldRuntimeCraftMutationService } = require("../runtime/world/world-runtime-craft-mutation.service");
const { WorldRuntimeAlchemyService } = require("../runtime/world/world-runtime-alchemy.service");

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

function testStartAlchemy() {
    const log = [];
    const playerRuntimeService = {
        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },
        getPlayer() { return { playerId: 'player:1' }; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    };
    const craftPanelRuntimeService = {
        startAlchemy() { return { ok: true, messages: [{ text: '炼丹开始', kind: 'success' }], panelChanged: true, groundDrops: [] }; },
        buildAlchemyPanelPayload() { return { ok: true }; },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return { emit(event, payload) { log.push(['emit', event, payload.ok]); } }; },
    }, {
        prefersNext() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchStartAlchemy('player:1', { presetId: 'p1' }, createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '炼丹开始', 'success'],
        ['emit', 'n:s:alchemyPanel', true],
    ]);
}

function testDeletePreset() {
    const log = [];
    const playerRuntimeService = {
        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },
        getPlayer() { return { playerId: 'player:1' }; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    };
    const craftPanelRuntimeService = {
        deleteAlchemyPreset() { return { ok: true, messages: [{ text: '预设删除成功', kind: 'info' }], panelChanged: false, groundDrops: [] }; },
        buildAlchemyPanelPayload() { return { ok: true }; },
    };
    const craftMutationService = new WorldRuntimeCraftMutationService(playerRuntimeService, craftPanelRuntimeService, {
        getSocketByPlayerId() { return { emit() { log.push(['emit']); } }; },
    }, {
        prefersNext() { return true; },
    });
    const service = new WorldRuntimeAlchemyService(playerRuntimeService, craftPanelRuntimeService, craftMutationService);
    service.dispatchDeleteAlchemyPreset('player:1', 'preset:1', createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '预设删除成功', 'info'],
    ]);
}

function testWorldRuntimeFacadeDispatchStartAlchemy() {
    const log = [];
    const runtime = {
        worldRuntimeAlchemyService: {
            dispatchStartAlchemy(playerId, payload, deps) {
                log.push(['dispatchStartAlchemy', playerId, payload, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchStartAlchemy.call(runtime, 'player:1', { presetId: 'p1' });
    assert.deepEqual(log, [
        ['dispatchStartAlchemy', 'player:1', { presetId: 'p1' }, true],
    ]);
}

function testWorldRuntimeFacadeDispatchCancelAlchemy() {
    const log = [];
    const runtime = {
        worldRuntimeAlchemyService: {
            dispatchCancelAlchemy(playerId, deps) {
                log.push(['dispatchCancelAlchemy', playerId, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchCancelAlchemy.call(runtime, 'player:1');
    assert.deepEqual(log, [
        ['dispatchCancelAlchemy', 'player:1', true],
    ]);
}

function testWorldRuntimeFacadeDispatchSaveAlchemyPreset() {
    const log = [];
    const runtime = {
        worldRuntimeAlchemyService: {
            dispatchSaveAlchemyPreset(playerId, payload, deps) {
                log.push(['dispatchSaveAlchemyPreset', playerId, payload, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchSaveAlchemyPreset.call(runtime, 'player:1', { presetId: 'p2' });
    assert.deepEqual(log, [
        ['dispatchSaveAlchemyPreset', 'player:1', { presetId: 'p2' }, true],
    ]);
}

function testWorldRuntimeFacadeDispatchDeleteAlchemyPreset() {
    const log = [];
    const runtime = {
        worldRuntimeAlchemyService: {
            dispatchDeleteAlchemyPreset(playerId, presetId, deps) {
                log.push(['dispatchDeleteAlchemyPreset', playerId, presetId, deps === runtime]);
            },
        },
    };
    WorldRuntimeService.prototype.dispatchDeleteAlchemyPreset.call(runtime, 'player:1', 'preset:1');
    assert.deepEqual(log, [
        ['dispatchDeleteAlchemyPreset', 'player:1', 'preset:1', true],
    ]);
}

testStartAlchemy();
testDeletePreset();
testWorldRuntimeFacadeDispatchStartAlchemy();
testWorldRuntimeFacadeDispatchCancelAlchemy();
testWorldRuntimeFacadeDispatchSaveAlchemyPreset();
testWorldRuntimeFacadeDispatchDeleteAlchemyPreset();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-alchemy' }, null, 2));
