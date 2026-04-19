"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeWorldAccessService } = require("../runtime/world/world-runtime-world-access.service");

function createService() {
    return new WorldRuntimeWorldAccessService({
        buildRuntimeSummary(input) {
            return { tick: input.tick, instanceCount: input.instances.length, pendingSystemCommandCount: input.pendingSystemCommandCount };
        },
    });
}

function testAccessorsAndSummary() {
    const service = createService();
    const instance = { meta: { instanceId: 'public:yunlai_town' }, tick: 9 };
    const deps = {
        tick: 3,
        lastTickDurationMs: 1,
        lastSyncFlushDurationMs: 2,
        tickDurationHistoryMs: [1],
        syncFlushDurationHistoryMs: [2],
        lastTickPhaseDurations: { tick: 1 },
        templateRepository: {
            has(id) { return id === 'yunlai_town'; },
            list() { return [{ id: 'yunlai_town' }]; },
        },
        listInstances() { return [{ instanceId: 'public:yunlai_town' }]; },
        getPlayerLocationCount() { return 1; },
        getPendingCommandCount() { return 2; },
        worldRuntimeGmQueueService: { getPendingSystemCommandCount() { return 4; } },
        worldRuntimeNavigationService: {
            findMapRoute(fromMapId, toMapId) { return { fromMapId, toMapId }; },
            interruptManualNavigation(playerId, runtime) { runtime.log.push(['interruptManualNavigation', playerId]); },
            clearNavigationIntent(playerId) { deps.log.push(['clearNavigationIntent', playerId]); },
        },
        createInstance(input) { deps.log.push(['createInstance', input.instanceId]); return instance; },
        getPlayerLocation(playerId) { return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null; },
        getInstanceRuntime(instanceId) { return instanceId === 'public:yunlai_town' ? instance : null; },
        getPlayer(playerId) { return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null; },
        playerRuntimeService: { getPlayer(playerId) { return deps.getPlayer(playerId); } },
        getPlayerView(playerId) { return playerId === 'player:1' ? { playerId } : null; },
        log: [],
    };
    assert.equal(service.resolveCurrentTickForPlayerId('player:1', deps), 9);
    assert.equal(service.resolveDefaultRespawnMapId(deps), 'yunlai_town');
    assert.equal(service.getOrCreatePublicInstance('yunlai_town', deps), instance);
    assert.deepEqual(service.findMapRoute('a', 'b', deps), { fromMapId: 'a', toMapId: 'b' });
    assert.deepEqual(service.getPlayerLocationOrThrow('player:1', deps), { instanceId: 'public:yunlai_town' });
    assert.equal(service.getInstanceRuntimeOrThrow('public:yunlai_town', deps), instance);
    instance.cancelPendingCommand = (playerId) => playerId === 'player:1';
    assert.equal(service.cancelPendingInstanceCommand('player:1', deps), true);
    service.interruptManualNavigation('player:1', deps);
    service.interruptManualCombat('player:1', deps);
    assert.deepEqual(service.getPlayerViewOrThrow('player:1', deps), { playerId: 'player:1' });
    assert.deepEqual(service.getRuntimeSummary(deps), { tick: 3, instanceCount: 1, pendingSystemCommandCount: 4 });
}

testAccessorsAndSummary();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-world-access' }, null, 2));
