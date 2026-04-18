"use strict";

const assert = require("node:assert/strict");
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
    const service = new WorldRuntimeAlchemyService({
        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },
        getPlayer() { return { playerId: 'player:1' }; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    }, {
        startAlchemy() { return { ok: true, messages: [{ text: '炼丹开始', kind: 'success' }], panelChanged: true, groundDrops: [] }; },
        buildAlchemyPanelPayload() { return { ok: true }; },
    }, {
        getSocketByPlayerId() { return { emit(event, payload) { log.push(['emit', event, payload.ok]); } }; },
    }, {
        prefersNext() { return true; },
    });
    service.dispatchStartAlchemy('player:1', { presetId: 'p1' }, createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '炼丹开始', 'success'],
        ['emit', 'n:s:alchemyPanel', true],
    ]);
}

function testDeletePreset() {
    const log = [];
    const service = new WorldRuntimeAlchemyService({
        getPlayerOrThrow() { return { playerId: 'player:1', instanceId: 'instance:1', x: 1, y: 2 }; },
        getPlayer() { return { playerId: 'player:1' }; },
        receiveInventoryItem() { log.push(['receiveInventoryItem']); },
    }, {
        deleteAlchemyPreset() { return { ok: true, messages: [{ text: '预设删除成功', kind: 'info' }], panelChanged: false, groundDrops: [] }; },
        buildAlchemyPanelPayload() { return { ok: true }; },
    }, {
        getSocketByPlayerId() { return { emit() { log.push(['emit']); } }; },
    }, {
        prefersNext() { return true; },
    });
    service.dispatchDeleteAlchemyPreset('player:1', 'preset:1', createDeps(log));
    assert.deepEqual(log, [
        ['queuePlayerNotice', 'player:1', '预设删除成功', 'info'],
    ]);
}

testStartAlchemy();
testDeletePreset();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-alchemy' }, null, 2));
