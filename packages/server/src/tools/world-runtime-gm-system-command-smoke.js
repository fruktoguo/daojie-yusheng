"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeGmSystemCommandService } = require("../runtime/world/world-runtime-gm-system-command.service");

function createService(log = []) {
    return new WorldRuntimeGmSystemCommandService({
        dispatchGmUpdatePlayer(command, deps) {
            log.push(['dispatchGmUpdatePlayer', command.kind, typeof deps.resolveDefaultRespawnMapId, typeof deps.getOrCreatePublicInstance]);
        },
        dispatchGmSpawnBots(anchorPlayerId, count, deps) {
            log.push(['dispatchGmSpawnBots', anchorPlayerId, count, typeof deps.connectPlayer]);
        },
        dispatchGmRemoveBots(playerIds, all, deps) {
            log.push(['dispatchGmRemoveBots', playerIds, all, typeof deps.removePlayer]);
        },
    }, {
        respawnPlayer(playerId, deps) {
            log.push(['respawnPlayer', playerId, deps.marker]);
        },
    });
}

function createDeps() {
    return {
        marker: 'deps',
        playerRuntimeService: {},
        resolveDefaultRespawnMapId() { return 'yunlai_town'; },
        getOrCreatePublicInstance() { return null; },
        getPlayerLocation() { return null; },
        setPlayerLocation() {},
        getInstanceRuntime() { return null; },
        getPlayerViewOrThrow() { return null; },
        refreshPlayerContextActions() {},
        resolveCurrentTickForPlayerId() { return 0; },
        connectPlayer() {},
        removePlayer() {},
    };
}

function testDispatchesKnownCommands() {
    const log = [];
    const service = createService(log);
    const deps = createDeps();
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmUpdatePlayer', playerId: 'player:1' }, deps), true);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmResetPlayer', playerId: 'player:2' }, deps), true);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmSpawnBots', anchorPlayerId: 'player:3', count: 2 }, deps), true);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmRemoveBots', playerIds: ['bot:1'], all: false }, deps), true);
    assert.deepEqual(log, [
        ['dispatchGmUpdatePlayer', 'gmUpdatePlayer', 'function', 'function'],
        ['respawnPlayer', 'player:2', 'deps'],
        ['dispatchGmSpawnBots', 'player:3', 2, 'function'],
        ['dispatchGmRemoveBots', ['bot:1'], false, 'function'],
    ]);
}

function testIgnoreUnknownCommand() {
    const service = createService([]);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'damagePlayer', playerId: 'player:1', amount: 1 }, createDeps()), false);
}

testDispatchesKnownCommands();
testIgnoreUnknownCommand();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-gm-system-command' }, null, 2));
