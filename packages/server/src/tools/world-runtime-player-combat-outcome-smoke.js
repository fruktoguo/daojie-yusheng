"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimePlayerCombatOutcomeService } = require("../runtime/world/world-runtime-player-combat-outcome.service");

function createService(log = []) {
    return new WorldRuntimePlayerCombatOutcomeService({
        dispatchDamagePlayer(playerId, amount, deps) {
            log.push(['dispatchDamagePlayer', playerId, amount, deps.marker]);
        },
        handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
            log.push(['handlePlayerMonsterKill', instance.meta.instanceId, monster.runtimeId, killerPlayerId, deps.marker]);
        },
        handlePlayerDefeat(playerId, deps) {
            log.push(['handlePlayerDefeat', playerId, deps.marker]);
        },
    }, {
        processPendingRespawns(deps) {
            log.push(['processPendingRespawns', deps.marker]);
        },
        respawnPlayer(playerId, deps) {
            log.push(['respawnPlayer', playerId, deps.marker]);
        },
    });
}

function testOutcomeDelegations() {
    const log = [];
    const service = createService(log);
    const deps = { marker: 'deps' };
    service.dispatchDamagePlayer('player:1', 12, deps);
    service.handlePlayerMonsterKill({ meta: { instanceId: 'public:a' } }, { runtimeId: 'monster:1' }, 'player:1', deps);
    service.handlePlayerDefeat('player:1', deps);
    service.processPendingRespawns(deps);
    service.respawnPlayer('player:1', deps);
    assert.deepEqual(log, [
        ['dispatchDamagePlayer', 'player:1', 12, 'deps'],
        ['handlePlayerMonsterKill', 'public:a', 'monster:1', 'player:1', 'deps'],
        ['handlePlayerDefeat', 'player:1', 'deps'],
        ['processPendingRespawns', 'deps'],
        ['respawnPlayer', 'player:1', 'deps'],
    ]);
}

testOutcomeDelegations();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-combat-outcome' }, null, 2));
