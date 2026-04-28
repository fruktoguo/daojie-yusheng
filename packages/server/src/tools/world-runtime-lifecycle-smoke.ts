// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeLifecycleService } = require("../runtime/world/world-runtime-lifecycle.service");
/**
 * testBootstrapPublicInstances：执行test引导PublicInstance相关逻辑。
 * @returns 无返回值，直接更新testBootstrapPublicInstance相关状态。
 */


function testBootstrapPublicInstances() {
    const service = new WorldRuntimeLifecycleService();
    const log = [];
    service.bootstrapPublicInstances({
        templateRepository: {        
        /**
 * list：读取列表并返回结果。
 * @returns 无返回值，完成结果的读取/组装。
 */

            list() {
                return [{ id: 'yunlai_town' }, { id: 'forest_1' }];
            },
        },        
        /**
 * createInstance：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 无返回值，直接更新Instance相关状态。
 */

        createInstance(input) {
            log.push(['createInstance', input]);
        },        
        /**
 * getInstanceCount：读取Instance数量。
 * @returns 无返回值，完成Instance数量的读取/组装。
 */

        getInstanceCount() {
            return 4;
        },
        logger: {        
        /**
 * log：执行log相关逻辑。
 * @param message 参数说明。
 * @returns 无返回值，直接更新log相关状态。
 */

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
            linePreset: 'peaceful',
            lineIndex: 1,
            instanceOrigin: 'bootstrap',
            defaultEntry: true,
        }],
        ['createInstance', {
            instanceId: 'real:yunlai_town',
            templateId: 'yunlai_town',
            kind: 'public',
            persistent: true,
            linePreset: 'real',
            lineIndex: 1,
            instanceOrigin: 'bootstrap',
            defaultEntry: true,
        }],
        ['createInstance', {
            instanceId: 'public:forest_1',
            templateId: 'forest_1',
            kind: 'public',
            persistent: true,
            linePreset: 'peaceful',
            lineIndex: 1,
            instanceOrigin: 'bootstrap',
            defaultEntry: true,
        }],
        ['createInstance', {
            instanceId: 'real:forest_1',
            templateId: 'forest_1',
            kind: 'public',
            persistent: true,
            linePreset: 'real',
            lineIndex: 1,
            instanceOrigin: 'bootstrap',
            defaultEntry: true,
        }],
        ['log', '已初始化 4 个默认地图实例'],
    ]);
}
/**
 * testRestoreAndRebuild：构建testRestoreAndRebuild。
 * @returns 无返回值，直接更新testRestoreAndRebuild相关状态。
 */


async function testRestoreAndRebuild() {
    const service = new WorldRuntimeLifecycleService();
    const log = [];
    const persistentInstance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },
        hydrateTime(tick) {
            log.push(['hydrateTime', tick]);
        },
        hydrateTileResources(entries) {
            log.push(['hydrateTileResources', entries]);
        },
        patchTileResources(entries) {
            log.push(['patchTileResources', entries]);
        },
        hydrateGroundPiles(entries) {
            log.push(['hydrateGroundPiles', entries]);
        },
        hydrateMonsterRuntimeStates(entries) {
            log.push(['hydrateMonsterRuntimeStates', entries]);
        },
        hydrateOverlayChunks(entries) {
            log.push(['hydrateOverlayChunks', entries]);
        },
    };
    const volatileInstance = {
        meta: { persistent: false },
        template: { id: 'forest_1' },
        hydrateTileResources() {
            log.push(['volatileHydrateTileResources']);
        },
        hydrateGroundPiles() {
            log.push(['volatileHydrateGroundPiles']);
        },
    };
    await service.restorePublicInstancePersistence({
        mapPersistenceService: {
            isEnabled() {
                return false;
            },
        },
        logger: {
            log(message) {
                log.push(['log', message]);
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
        instanceDomainPersistenceService: {
            isEnabled() {
                return true;
            },
            async loadInstanceRecoveryWatermark(instanceId) {
                log.push(['loadInstanceRecoveryWatermark', instanceId]);
                return { checkpointKind: 'cold_start' };
            },
            async loadTileResourceDiffs(instanceId) {
                log.push(['loadTileResourceDiffs', instanceId]);
                return [{ resourceKey: 'aura.refined.neutral', tileIndex: 1, value: 7 }];
            },
            async loadInstanceCheckpoint(instanceId) {
                log.push(['loadInstanceCheckpoint', instanceId]);
                return {
                    kind: 'time_checkpoint',
                    domains: ['time'],
                    snapshot: {
                        tick: 1234,
                        tileResourceEntries: [{ resourceKey: 'aura.refined.neutral', tileIndex: 5, value: 3 }],
                        groundPileEntries: [{ tileIndex: 11, items: [{ itemKey: 'checkpoint:ground:1', item: { itemId: 'checkpoint_stone', count: 2 } }] }],
                        containerStates: [{ instanceId, containerId: 'checkpoint:container:1', sourceId: 'checkpoint:source:1', statePayload: { sealed: true } }],
                    },
                };
            },
            async loadGroundItems(instanceId) {
                log.push(['loadGroundItems', instanceId]);
                return [{ groundItemId: 'ground:1', instanceId, tileIndex: 9, itemPayload: { itemId: 'spirit_stone', count: 3 }, expireAt: null }];
            },
            async loadContainerStates(instanceId) {
                log.push(['loadContainerStates', instanceId]);
                return [{ instanceId, containerId: 'container:1', sourceId: 'source:1', statePayload: { locked: true } }];
            },
            async loadMonsterRuntimeStates(instanceId) {
                log.push(['loadMonsterRuntimeStates', instanceId]);
                return [{
                    runtimeId: 'monster:1',
                    monsterId: 'm_demon_king_guard',
                    monsterName: '镇渊妖将',
                    monsterTier: 'demon_king',
                    monsterLevel: 88,
                    tileIndex: 27,
                    x: 3,
                    y: 4,
                    hp: 9000,
                    maxHp: 12000,
                    alive: true,
                    respawnLeft: 0,
                    respawnTicks: 0,
                    statePayload: { attackReadyTick: 77 },
                }];
            },
            async loadEventStates() {
                return [];
            },
            async loadOverlayChunks() {
                log.push(['loadOverlayChunks']);
                return [{ patchKind: 'portal', chunkKey: 'runtime_portals', patchPayload: { portals: [] } }];
            },
        },
    });
    assert.ok(!log.some((entry) => Array.isArray(entry) && entry[0] === 'loadMapSnapshot'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'loadInstanceRecoveryWatermark'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'loadTileResourceDiffs'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'loadGroundItems'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'loadContainerStates'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'loadMonsterRuntimeStates'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'loadOverlayChunks'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateOverlayChunks'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'loadInstanceCheckpoint'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateTime' && entry[1] === 1234));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateTileResources'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateGroundPiles'));
    assert.ok(log.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateContainerStates'));

    const domainRestoreLog = [];
    const domainInstance = {
        meta: { persistent: true, instanceId: 'public:yunlai_town' },
        template: { id: 'yunlai_town' },
        hydrateTime(tick) {
            domainRestoreLog.push(['hydrateTime', tick]);
        },
        hydrateTileResources(entries) {
            domainRestoreLog.push(['hydrateTileResources', entries]);
        },
        patchTileResources(entries) {
            domainRestoreLog.push(['patchTileResources', entries]);
        },
        hydrateGroundPiles(entries) {
            domainRestoreLog.push(['hydrateGroundPiles', entries]);
        },
        hydrateMonsterRuntimeStates(entries) {
            domainRestoreLog.push(['hydrateMonsterRuntimeStates', entries]);
        },
        hydrateOverlayChunks(entries) {
            domainRestoreLog.push(['hydrateOverlayChunks', entries]);
        },
    };
    await service.restorePublicInstancePersistence({
        mapPersistenceService: {
            isEnabled() {
                return false;
            },
        },
        logger: {
            log(message) {
                domainRestoreLog.push(['log', message]);
            },
        },
        instanceDomainPersistenceService: {
            isEnabled() {
                return true;
            },
            async loadInstanceRecoveryWatermark(instanceId) {
                domainRestoreLog.push(['loadInstanceRecoveryWatermark', instanceId]);
                return { checkpointKind: 'cold_start' };
            },
            async loadTileResourceDiffs(instanceId) {
                domainRestoreLog.push(['loadTileResourceDiffs', instanceId]);
                return [
                    { resourceKey: 'aura.refined.neutral', tileIndex: 1, value: 7 },
                ];
            },
            async loadInstanceCheckpoint(instanceId) {
                domainRestoreLog.push(['loadInstanceCheckpoint', instanceId]);
                return {
                    kind: 'domain_fallback_checkpoint',
                    domains: ['time', 'tile_resource', 'ground_item', 'container_state'],
                    snapshot: {
                        tick: 5678,
                        tileResourceEntries: [
                            { resourceKey: 'aura.refined.neutral', tileIndex: 5, value: 3 },
                        ],
                        groundPileEntries: [
                            {
                                tileIndex: 11,
                                items: [{ itemKey: 'checkpoint:ground:1', item: { itemId: 'checkpoint_stone', count: 2 } }],
                            },
                        ],
                        containerStates: [
                            { instanceId, containerId: 'checkpoint:container:1', sourceId: 'checkpoint:source:1', statePayload: { sealed: true } },
                        ],
                    },
                };
            },
            async loadGroundItems(instanceId) {
                domainRestoreLog.push(['loadGroundItems', instanceId]);
                return [
                    {
                        groundItemId: 'ground:1',
                        instanceId,
                        tileIndex: 9,
                        itemPayload: { itemId: 'spirit_stone', count: 3 },
                        expireAt: null,
                    },
                ];
            },
            async loadContainerStates(instanceId) {
                domainRestoreLog.push(['loadContainerStates', instanceId]);
                return [{ instanceId, containerId: 'container:1', sourceId: 'source:1', statePayload: { locked: true } }];
            },
            async loadMonsterRuntimeStates(instanceId) {
                domainRestoreLog.push(['loadMonsterRuntimeStates', instanceId]);
                return [{
                    runtimeId: 'monster:1',
                    monsterId: 'm_demon_king_guard',
                    monsterName: '镇渊妖将',
                    monsterTier: 'demon_king',
                    monsterLevel: 88,
                    tileIndex: 27,
                    x: 3,
                    y: 4,
                    hp: 9000,
                    maxHp: 12000,
                    alive: true,
                    respawnLeft: 0,
                    respawnTicks: 0,
                    statePayload: { attackReadyTick: 77 },
                }];
            },
            async loadEventStates() {
                return [];
            },
            async loadOverlayChunks() {
                domainRestoreLog.push(['loadOverlayChunks']);
                return [{ patchKind: 'portal', chunkKey: 'runtime_portals', patchPayload: { portals: [] } }];
            },
        },
        listInstanceEntries() {
            return [
                ['public:yunlai_town', domainInstance],
            ];
        },
        worldRuntimeLootContainerService: {
            hydrateContainerStates(instanceId, states) {
                domainRestoreLog.push(['hydrateContainerStates', instanceId, states]);
            },
        },
    });
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'loadInstanceRecoveryWatermark'));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'loadTileResourceDiffs'));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'patchTileResources' && Array.isArray(entry[1]) && entry[1][0]?.tileIndex === 1));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'loadGroundItems'));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateGroundPiles' && Array.isArray(entry[1]) && entry[1][0]?.tileIndex === 9));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'loadContainerStates'));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateContainerStates' && entry[1] === 'public:yunlai_town'));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'loadMonsterRuntimeStates'));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateMonsterRuntimeStates'));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'loadOverlayChunks'));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateOverlayChunks'));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'loadInstanceCheckpoint'));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateTime' && entry[1] === 5678));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateTileResources' && Array.isArray(entry[1]) && entry[1][0]?.tileIndex === 5));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'hydrateGroundPiles' && Array.isArray(entry[1]) && entry[1][0]?.tileIndex === 11));
    assert.ok(domainRestoreLog.some((entry) => Array.isArray(entry) && entry[0] === 'log' && entry[1] === '实例分域恢复已回填：public:yunlai_town'));

    const resetLog = [];
    await service.rebuildPersistentRuntimeAfterRestore({
        worldRuntimeInstanceStateService: {
            resetState() { resetLog.push('instance'); }
        },
        worldRuntimePlayerLocationService: {
            resetState() { resetLog.push('playerLocation'); }
        },
        worldRuntimePendingCommandService: {
            resetState() { resetLog.push('pending'); }
        },
        worldRuntimeGmQueueService: {
            resetState() { resetLog.push('gmQueue'); }
        },
        worldRuntimeNavigationService: {
            reset() { resetLog.push('navigation'); }
        },
        worldRuntimeTickProgressService: {
            resetState() { resetLog.push('tickProgress'); }
        },
        worldRuntimeLootContainerService: {
            reset() { resetLog.push('lootContainer'); },
            hydrateContainerStates(instanceId, states) { resetLog.push(['hydrateContainerStates', instanceId, states]); },
        },
        worldRuntimeCombatEffectsService: {
            resetAll() { resetLog.push('combatEffects'); }
        },
        templateRepository: {
            list() {
                return [{ id: 'yunlai_town' }];
            },
        },
        createInstance(input) {
            resetLog.push(['createInstance', input.instanceId]);
        },
        getInstanceCount() {
            return 2;
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
        ['createInstance', 'real:yunlai_town'],
        ['log', '已初始化 2 个默认地图实例'],
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
