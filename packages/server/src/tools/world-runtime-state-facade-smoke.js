"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeStateFacadeService } = require("../runtime/world/world-runtime-state-facade.service");

async function testStateFacade() {
    const service = new WorldRuntimeStateFacadeService();
    const log = [];
    const deps = {
        worldRuntimePendingCommandService: {
            enqueuePendingCommand(playerId, command) { log.push(['enqueuePendingCommand', playerId, command.kind]); },
            getPendingCommand(playerId) { return playerId === 'player:1' ? { kind: 'move' } : null; },
            hasPendingCommand(playerId) { return playerId === 'player:1'; },
            clearPendingCommand(playerId) { log.push(['clearPendingCommand', playerId]); },
            getPendingCommandCount() { return 2; },
        },
        worldRuntimePlayerLocationService: {
            getPlayerLocation(playerId) { return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null; },
            setPlayerLocation(playerId, location) { log.push(['setPlayerLocation', playerId, location.instanceId]); },
            clearPlayerLocation(playerId) { log.push(['clearPlayerLocation', playerId]); },
            getPlayerLocationCount() { return 3; },
            listConnectedPlayerIds() { return ['player:1', 'player:2']; },
        },
        worldRuntimeInstanceStateService: {
            getInstanceRuntime(instanceId) { return instanceId === 'public:yunlai_town' ? { meta: { instanceId } } : null; },
            setInstanceRuntime(instanceId) { log.push(['setInstanceRuntime', instanceId]); },
            listInstanceRuntimes() { return [{ meta: { instanceId: 'public:yunlai_town' } }]; },
            listInstanceEntries() { return [['public:yunlai_town', { meta: { instanceId: 'public:yunlai_town' } }]]; },
            getInstanceCount() { return 1; },
        },
        worldRuntimePersistenceStateService: {
            listDirtyPersistentInstances() { return ['public:yunlai_town']; },
            buildMapPersistenceSnapshot(instanceId) { return { instanceId }; },
            markMapPersisted(instanceId) { log.push(['markMapPersisted', instanceId]); },
        },
        worldRuntimeFrameService: {
            tickAll() { log.push(['tickAll']); return 1; },
            advanceFrame(_deps, frameDurationMs) { log.push(['advanceFrame', frameDurationMs]); return { frameDurationMs }; },
            recordSyncFlushDuration(durationMs) { log.push(['recordSyncFlushDuration', durationMs]); },
        },
        worldRuntimeLifecycleService: {
            bootstrapPublicInstances() { log.push(['bootstrapPublicInstances']); },
            async restorePublicInstancePersistence() { log.push(['restorePublicInstancePersistence']); },
            async rebuildPersistentRuntimeAfterRestore() { log.push(['rebuildPersistentRuntimeAfterRestore']); },
        },
    };

    service.enqueuePendingCommand('player:1', { kind: 'move' }, deps);
    assert.deepEqual(service.getPendingCommand('player:1', deps), { kind: 'move' });
    assert.equal(service.hasPendingCommand('player:1', deps), true);
    service.clearPendingCommand('player:1', deps);
    assert.equal(service.getPendingCommandCount(deps), 2);
    assert.deepEqual(service.getPlayerLocation('player:1', deps), { instanceId: 'public:yunlai_town' });
    service.setPlayerLocation('player:1', { instanceId: 'public:yunlai_town' }, deps);
    service.clearPlayerLocation('player:1', deps);
    assert.equal(service.getPlayerLocationCount(deps), 3);
    assert.deepEqual(service.listConnectedPlayerIds(deps), ['player:1', 'player:2']);
    assert.deepEqual(service.getInstanceRuntime('public:yunlai_town', deps), { meta: { instanceId: 'public:yunlai_town' } });
    service.setInstanceRuntime('public:yunlai_town', { meta: { instanceId: 'public:yunlai_town' } }, deps);
    assert.equal(service.listInstanceRuntimes(deps).length, 1);
    assert.equal(service.listInstanceEntries(deps).length, 1);
    assert.equal(service.getInstanceCount(deps), 1);
    assert.deepEqual(service.listDirtyPersistentInstances(deps), ['public:yunlai_town']);
    assert.deepEqual(service.buildMapPersistenceSnapshot('public:yunlai_town', deps), { instanceId: 'public:yunlai_town' });
    service.markMapPersisted('public:yunlai_town', deps);
    assert.equal(service.tickAll(deps), 1);
    assert.deepEqual(service.advanceFrame(1000, null, deps), { frameDurationMs: 1000 });
    service.recordSyncFlushDuration(12, deps);
    service.bootstrapPublicInstances(deps);
    await service.restorePublicInstancePersistence(deps);
    await service.rebuildPersistentRuntimeAfterRestore(deps);
}

testStateFacade().then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-state-facade' }, null, 2));
});
