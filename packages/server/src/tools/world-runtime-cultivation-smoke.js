"use strict";

const assert = require("node:assert/strict");
const { WorldRuntimeCultivationService } = require("../runtime/world/world-runtime-cultivation.service");

function createDeps(log, blockReason = null) {
    return {
        craftPanelRuntimeService: {
            getCultivationBlockReason() { return blockReason; },
        },
        queuePlayerNotice(playerId, message, tone) { log.push(['queuePlayerNotice', playerId, message, tone]); },
    };
}

function testStopCultivation() {
    const log = [];
    const playerRuntimeService = {
        getPlayerOrThrow() { return { playerId: 'player:1' }; },
        cultivateTechnique(playerId, techniqueId) { log.push(['cultivateTechnique', playerId, techniqueId]); },
        getTechniqueName() { return null; },
    };
    const service = new WorldRuntimeCultivationService(playerRuntimeService);
    service.dispatchCultivateTechnique('player:1', null, createDeps(log));
    assert.deepEqual(log, [
        ['cultivateTechnique', 'player:1', null],
        ['queuePlayerNotice', 'player:1', '已停止当前修炼', 'info'],
    ]);
}

function testStartCultivation() {
    const log = [];
    const playerRuntimeService = {
        getPlayerOrThrow() { return { playerId: 'player:1' }; },
        cultivateTechnique(playerId, techniqueId) { log.push(['cultivateTechnique', playerId, techniqueId]); },
        getTechniqueName() { return '青木剑诀'; },
    };
    const service = new WorldRuntimeCultivationService(playerRuntimeService);
    service.dispatchCultivateTechnique('player:1', 'qingmu_sword', createDeps(log));
    assert.deepEqual(log, [
        ['cultivateTechnique', 'player:1', 'qingmu_sword'],
        ['queuePlayerNotice', 'player:1', '开始修炼 青木剑诀', 'success'],
    ]);
}

testStopCultivation();
testStartCultivation();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-cultivation' }, null, 2));
