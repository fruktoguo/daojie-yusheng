"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeLifecycleService } = require("../runtime/world/world-runtime-lifecycle.service");

function testBootstrapPublicInstances() {
    const service = new WorldRuntimeLifecycleService();
    const log = [];
    service.bootstrapPublicInstances({
        templateRepository: {
            list() {
                return [{ id: 'yunlai_town' }, { id: 'forest_1' }];
            },
        },
        createInstance(input) {
            log.push(['createInstance', input]);
        },
        getInstanceCount() {
            return 2;
        },
        logger: {
            log(message) {
                log.push(['log', message]);
            },
        },
    });
    assert.deepEqual(log, [
        ['createInstance', {
            instanceId: 'public:yunlai_town',
            templateId: 'yunlai_town',
            kind: 'public',
            persistent: true,
        }],
        ['createInstance', {
            instanceId: 'public:forest_1',
            templateId: 'forest_1',
            kind: 'public',
            persistent: true,
        }],
        ['log', '已初始化 2 个公共实例'],
    ]);
}

async function testRestoreAndRebuild() {
    const service = new WorldRuntimeLifecycleService();
    const log = [];
    const persistentInstance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },
        hydrateAura(entries) {
            log.push(['hydrateAura', entries]);
        },
        hydrateGroundPiles(entries) {
            log.push(['hydrateGroundPiles', entries]);
        },
    };
    const volatileInstance = {
        meta: { persistent: false },
        template: { id: 'forest_1' },
        hydrateAura() {
            log.push(['volatileHydrateAura']);
        },
        hydrateGroundPiles() {
            log.push(['volatileHydrateGroundPiles']);
        },
    };
    await service.restorePublicInstancePersistence({
        mapPersistenceService: {
            isEnabled() {
                return true;
            },
            async loadMapSnapshot(instanceId) {
                log.push(['loadMapSnapshot', instanceId]);
                if (instanceId === 'public:yunlai_town') {
                    return {
                        templateId: 'yunlai_town',
                        auraEntries: ['aura:1'],
                        groundPileEntries: ['ground:1'],
                        containerStates: [{ id: 'container:1' }],
                    };
                }
                return null;
            },
        },
        listInstanceEntries() {
            return [
                ['public:yunlai_town', persistentInstance],
                ['public:forest_1', volatileInstance],
            ];
        },
        worldRuntimeLootContainerService: {
            hydrateContainerStates(instanceId, states) {
                log.push(['hydrateContainerStates', instanceId, states]);
            },
        },
    });
    assert.deepEqual(log, [
        ['loadMapSnapshot', 'public:yunlai_town'],
        ['hydrateAura', ['aura:1']],
        ['hydrateGroundPiles', ['ground:1']],
        ['hydrateContainerStates', 'public:yunlai_town', [{ id: 'container:1' }]],
    ]);

    const resetLog = [];
    await service.rebuildPersistentRuntimeAfterRestore({
        worldRuntimeInstanceStateService: { resetState() { resetLog.push('instance'); } },
        worldRuntimePlayerLocationService: { resetState() { resetLog.push('playerLocation'); } },
        worldRuntimePendingCommandService: { resetState() { resetLog.push('pending'); } },
        worldRuntimeGmQueueService: { resetState() { resetLog.push('gmQueue'); } },
        worldRuntimeNavigationService: { reset() { resetLog.push('navigation'); } },
        worldRuntimeTickProgressService: { resetState() { resetLog.push('tickProgress'); } },
        worldRuntimeLootContainerService: {
            reset() { resetLog.push('lootContainer'); },
            hydrateContainerStates(instanceId, states) { resetLog.push(['hydrateContainerStates', instanceId, states]); },
        },
        worldRuntimeCombatEffectsService: { resetAll() { resetLog.push('combatEffects'); } },
        templateRepository: {
            list() {
                return [{ id: 'yunlai_town' }];
            },
        },
        createInstance(input) {
            resetLog.push(['createInstance', input.instanceId]);
        },
        getInstanceCount() {
            return 1;
        },
        logger: {
            log(message) {
                resetLog.push(['log', message]);
            },
        },
        mapPersistenceService: {
            isEnabled() {
                return false;
            },
            async loadMapSnapshot() {
                throw new Error('unreachable');
            },
        },
        listInstanceEntries() {
            return [];
        },
    });
    assert.deepEqual(resetLog, [
        'instance',
        'playerLocation',
        'pending',
        'gmQueue',
        'navigation',
        'tickProgress',
        'lootContainer',
        'combatEffects',
        ['createInstance', 'public:yunlai_town'],
        ['log', '已初始化 1 个公共实例'],
    ]);
}

async function main() {
    testBootstrapPublicInstances();
    await testRestoreAndRebuild();
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-lifecycle' }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
