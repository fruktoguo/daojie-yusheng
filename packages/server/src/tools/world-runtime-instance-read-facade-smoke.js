"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeInstanceReadFacadeService } = require("../runtime/world/world-runtime-instance-read-facade.service");

function testInstanceReadFacade() {
    const service = new WorldRuntimeInstanceReadFacadeService();
    const log = [];
    const instance = {
        meta: { instanceId: 'public:yunlai_town' },
        monsters: [{ runtimeId: 'monster:1' }],
    };
    const deps = {
        templateRepository: {
            listSummaries() { return [{ id: 'yunlai_town' }]; },
            getOrThrow(templateId) {
                return {
                    id: templateId,
                    width: 2,
                    height: 2,
                    baseAuraByTile: [0, 0, 0, 0],
                    npcs: [],
                    landmarks: [],
                    containers: [],
                };
            },
        },
        worldRuntimeInstanceQueryService: {
            listInstances() { return [{ instanceId: 'public:yunlai_town' }]; },
            getInstance(_deps, instanceId) { return { instanceId }; },
            listInstanceMonsters(input) { return input.monsters; },
            getInstanceMonster(_instance, runtimeId) { return { runtimeId }; },
            getInstanceTileState(_instance, x, y) { return { x, y }; },
        },
        worldRuntimeCombatEffectsService: {
            getCombatEffects() { return [{ kind: 'flash' }]; },
        },
        cloneCombatEffect(effect) {
            return { ...effect, cloned: true };
        },
        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? instance : null;
        },
        getInstanceRuntimeOrThrow(instanceId) {
            if (instanceId !== 'public:yunlai_town') throw new Error('not found');
            return instance;
        },
        contentTemplateRepository: {
            createRuntimeMonstersForMap(templateId) {
                log.push(['createRuntimeMonstersForMap', templateId]);
                return [];
            },
        },
        setInstanceRuntime(instanceId, created) {
            log.push(['setInstanceRuntime', instanceId, created.meta.instanceId]);
        },
        worldRuntimeTickProgressService: {
            initializeInstance(instanceId) { log.push(['initializeInstance', instanceId]); },
        },
    };

    assert.deepEqual(service.listMapTemplates(deps), [{ id: 'yunlai_town' }]);
    assert.deepEqual(service.listInstances(deps), [{ instanceId: 'public:yunlai_town' }]);
    assert.deepEqual(service.getInstance('public:yunlai_town', deps), { instanceId: 'public:yunlai_town' });
    assert.deepEqual(service.listInstanceMonsters('public:yunlai_town', deps), [{ runtimeId: 'monster:1' }]);
    assert.deepEqual(service.getInstanceMonster('public:yunlai_town', 'monster:1', deps), { runtimeId: 'monster:1' });
    assert.deepEqual(service.getInstanceTileState('public:yunlai_town', 10, 11, deps), { x: 10, y: 11 });
    assert.deepEqual(service.getCombatEffects('public:yunlai_town', deps), [{ kind: 'flash', cloned: true }]);
    const created = service.createInstance({
        instanceId: 'public:new_map',
        templateId: 'yunlai_town',
        kind: 'public',
        persistent: true,
    }, deps);
    assert.equal(created.meta.instanceId, 'public:new_map');
}

testInstanceReadFacade();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-instance-read-facade' }, null, 2));
