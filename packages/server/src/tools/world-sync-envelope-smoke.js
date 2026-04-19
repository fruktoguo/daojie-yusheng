"use strict";

const assert = require("node:assert/strict");

const { WorldSyncEnvelopeService } = require("../network/world-sync-envelope.service");

function testEnvelopeService() {
    const service = new WorldSyncEnvelopeService({
        createInitialEnvelope(binding) {
            return {
                initSession: { sid: binding.sessionId },
                worldDelta: { t: 10, wr: 20, sr: 30 },
            };
        },
        createDeltaEnvelope() {
            return {
                worldDelta: { t: 11, wr: 21, sr: 31 },
            };
        },
        clear(playerId) {
            assert.equal(playerId, 'player:1');
        },
    }, {
        getCombatEffects() {
            return [
                { type: 'attack', fromX: 3, fromY: 4, toX: 7, toY: 8, label: 'keep' },
                { type: 'attack', fromX: 20, fromY: 20, toX: 21, toY: 21, label: 'drop' },
            ];
        },
    }, {
        getOrThrow(mapId) {
            assert.equal(mapId, 'map.a');
            return { id: mapId };
        },
    }, {
        buildVisibleTileKeySet() {
            return new Set(['3,4']);
        },
    });
    const view = {
        tick: 10,
        worldRevision: 20,
        selfRevision: 30,
        instance: { templateId: 'map.a', instanceId: 'inst.a' },
    };
    const binding = { sessionId: 'sid.a' };
    const envelope = service.createInitialEnvelope('player:1', binding, view, {});
    assert.equal(envelope.initSession.sid, 'sid.a');
    assert.equal(envelope.worldDelta.fx.length, 1);
    assert.equal(envelope.worldDelta.fx[0].label, 'keep');
    const delta = service.createDeltaEnvelope('player:1', { ...view, tick: 11, worldRevision: 21, selfRevision: 31 }, {});
    assert.equal(delta.worldDelta.fx.length, 1);
    service.clearPlayerCache('player:1');
}

testEnvelopeService();

console.log(JSON.stringify({ ok: true, case: 'world-sync-envelope' }, null, 2));
