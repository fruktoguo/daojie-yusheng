"use strict";

const assert = require("node:assert/strict");
const { WorldRuntimeProgressionService } = require("../runtime/world/world-runtime-progression.service");

function testBreakthrough() {
    const log = [];
    const service = new WorldRuntimeProgressionService({
        attemptBreakthrough(playerId, currentTick) {
            log.push(['attemptBreakthrough', playerId, currentTick]);
            return { ok: true };
        },
    });
    const result = service.dispatchBreakthrough('player:1', { resolveCurrentTickForPlayerId() { return 17; } });
    assert.deepEqual(log, [['attemptBreakthrough', 'player:1', 17]]);
    assert.deepEqual(result, { ok: true });
}

function testHeavenGateAction() {
    const log = [];
    const service = new WorldRuntimeProgressionService({
        handleHeavenGateAction(playerId, action, element, currentTick) {
            log.push(['handleHeavenGateAction', playerId, action, element, currentTick]);
            return { ok: true };
        },
    });
    const result = service.dispatchHeavenGateAction('player:1', 'choose_gate', 'wood', { resolveCurrentTickForPlayerId() { return 23; } });
    assert.deepEqual(log, [['handleHeavenGateAction', 'player:1', 'choose_gate', 'wood', 23]]);
    assert.deepEqual(result, { ok: true });
}

testBreakthrough();
testHeavenGateAction();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-progression' }, null, 2));
