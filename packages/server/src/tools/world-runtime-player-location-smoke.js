"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimePlayerLocationService } = require("../runtime/world/world-runtime-player-location.service");

function testOwnershipMethods() {
    const service = new WorldRuntimePlayerLocationService();
    assert.equal(service.getPlayerLocation('player:1'), null);
    service.setPlayerLocation('player:1', { instanceId: 'instance:1', sessionId: 'session:1' });
    service.setPlayerLocation('player:2', { instanceId: 'instance:2', sessionId: 'session:2' });
    assert.deepEqual(service.getPlayerLocation('player:1'), { instanceId: 'instance:1', sessionId: 'session:1' });
    assert.equal(service.getPlayerLocationCount(), 2);
    assert.deepEqual(Array.from(service.listConnectedPlayerIds()), ['player:1', 'player:2']);
    service.setPlayerLocation('player:1', { instanceId: 'instance:3', sessionId: 'session:3' });
    assert.deepEqual(service.getPlayerLocation('player:1'), { instanceId: 'instance:3', sessionId: 'session:3' });
    service.clearPlayerLocation('player:2');
    assert.equal(service.getPlayerLocation('player:2'), null);
    assert.equal(service.getPlayerLocationCount(), 1);
}

function testResetState() {
    const service = new WorldRuntimePlayerLocationService();
    service.setPlayerLocation('player:1', { instanceId: 'instance:1', sessionId: 'session:1' });
    service.resetState();
    assert.equal(service.getPlayerLocation('player:1'), null);
    assert.equal(service.getPlayerLocationCount(), 0);
}

testOwnershipMethods();
testResetState();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-location' }, null, 2));
