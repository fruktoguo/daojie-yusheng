"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeSystemCommandService } = require("../runtime/world/world-runtime-system-command.service");

function createService(log = []) {
    return new WorldRuntimeSystemCommandService({
        getPendingSystemCommandCount() {
            return 4;
        },
        drainPendingSystemCommands() {
            return [
                { kind: 'spawnMonsterLoot', instanceId: 'public:a', x: 1, y: 2, monsterId: 'monster:a', rolls: 3 },
                { kind: 'damagePlayer', playerId: 'player:1', amount: 9 },
                { kind: 'gmUpdatePlayer', playerId: 'player:2' },
                { kind: 'gmRemoveBots', playerIds: ['bot:1'], all: false },
            ];
        },
    }, {
        dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, deps) {
            log.push(['spawnMonsterLoot', instanceId, x, y, monsterId, rolls, deps.marker]);
        },
        dispatchDamageMonster() {
            log.push(['damageMonster']);
        },
        dispatchDefeatMonster() {
            log.push(['defeatMonster']);
        },
    }, {
        dispatchDamagePlayer(playerId, amount, deps) {
            log.push(['damagePlayer', playerId, amount, deps.marker]);
        },
        respawnPlayer(playerId, deps) {
            log.push(['respawnPlayer', playerId, deps.marker]);
        },
    }, {
        dispatchGmSystemCommand(command, deps) {
            log.push(['gmSystem', command.kind, deps.marker]);
            return true;
        },
    });
}

function testDispatchPendingSystemCommands() {
    const log = [];
    const service = createService(log);
    service.dispatchPendingSystemCommands({ marker: 'deps' });
    assert.deepEqual(log, [
        ['spawnMonsterLoot', 'public:a', 1, 2, 'monster:a', 3, 'deps'],
        ['damagePlayer', 'player:1', 9, 'deps'],
        ['gmSystem', 'gmUpdatePlayer', 'deps'],
        ['gmSystem', 'gmRemoveBots', 'deps'],
    ]);
}

function testDispatchSystemCommandRoutes() {
    const log = [];
    const service = createService(log);
    const deps = { marker: 'routeDeps' };
    service.dispatchSystemCommand({ kind: 'respawnPlayer', playerId: 'player:7' }, deps);
    service.dispatchSystemCommand({ kind: 'gmResetPlayer', playerId: 'player:8' }, deps);
    assert.deepEqual(log, [
        ['respawnPlayer', 'player:7', 'routeDeps'],
        ['gmSystem', 'gmResetPlayer', 'routeDeps'],
    ]);
}

testDispatchPendingSystemCommands();
testDispatchSystemCommandRoutes();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-system-command' }, null, 2));
