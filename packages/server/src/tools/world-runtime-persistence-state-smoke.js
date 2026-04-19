"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimePersistenceStateService } = require("../runtime/world/world-runtime-persistence-state.service");

function testListDirtyPersistentInstances() {
    const service = new WorldRuntimePersistenceStateService();
    const result = service.listDirtyPersistentInstances({
        worldRuntimeLootContainerService: {
            getDirtyInstanceIds() {
                return ['public:container_map', 'public:alpha'];
            },
        },
        listInstanceEntries() {
            return [
                ['public:beta', { meta: { persistent: true }, isPersistentDirty() { return true; } }],
                ['public:gamma', { meta: { persistent: false }, isPersistentDirty() { return true; } }],
            ];
        },
        compareStableStrings(left, right) {
            return left.localeCompare(right);
        },
    });
    assert.deepEqual(result, ['public:alpha', 'public:beta', 'public:container_map']);
}

function testBuildAndMarkSnapshot() {
    const log = [];
    const service = new WorldRuntimePersistenceStateService();
    const instance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },
        buildAuraPersistenceEntries() { return ['aura:1']; },
        buildGroundPersistenceEntries() { return ['ground:1']; },
        markAuraPersisted() { log.push('markAuraPersisted'); },
    };
    const deps = {
        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? instance : null;
        },
        worldRuntimeLootContainerService: {
            buildContainerPersistenceStates(instanceId) {
                log.push(['buildContainerPersistenceStates', instanceId]);
                return [{ id: 'container:1' }];
            },
            clearPersisted(instanceId) {
                log.push(['clearPersisted', instanceId]);
            },
        },
    };
    const snapshot = service.buildMapPersistenceSnapshot('public:yunlai_town', deps);
    assert.equal(snapshot.templateId, 'yunlai_town');
    assert.deepEqual(snapshot.auraEntries, ['aura:1']);
    assert.deepEqual(snapshot.groundPileEntries, ['ground:1']);
    assert.deepEqual(snapshot.containerStates, [{ id: 'container:1' }]);
    service.markMapPersisted('public:yunlai_town', deps);
    assert.deepEqual(log, [
        ['buildContainerPersistenceStates', 'public:yunlai_town'],
        'markAuraPersisted',
        ['clearPersisted', 'public:yunlai_town'],
    ]);
}

testListDirtyPersistentInstances();
testBuildAndMarkSnapshot();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-persistence-state' }, null, 2));
