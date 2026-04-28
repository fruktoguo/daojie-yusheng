// @ts-nocheck

const assert = require("node:assert/strict");

const { MapInstanceRuntime } = require("../runtime/instance/map-instance.runtime");
const { WorldRuntimePersistenceStateService } = require("../runtime/world/world-runtime-persistence-state.service");
/**
 * testListDirtyPersistentInstances：读取test列表DirtyPersistentInstance并返回结果。
 * @returns 无返回值，直接更新test列表DirtyPersistentInstance相关状态。
 */


function testListDirtyPersistentInstances() {
    const service = new WorldRuntimePersistenceStateService();
    const result = service.listDirtyPersistentInstances({
        worldRuntimeLootContainerService: {        
        /**
 * getDirtyInstanceIds：读取DirtyInstanceID。
 * @returns 无返回值，完成DirtyInstanceID的读取/组装。
 */

            getDirtyInstanceIds() {
                return ['public:container_map', 'public:alpha'];
            },
        },        
        /**
 * listInstanceEntries：读取Instance条目并返回结果。
 * @returns 无返回值，完成Instance条目的读取/组装。
 */

        listInstanceEntries() {
            return [
                ['public:beta', { meta: { persistent: true },                
                /**
 * isPersistentDirty：判断PersistentDirty是否满足条件。
 * @returns 无返回值，完成PersistentDirty的条件判断。
 */
 isPersistentDirty() { return true; } }],
                ['public:gamma', { meta: { persistent: false },                
                /**
 * isPersistentDirty：判断PersistentDirty是否满足条件。
 * @returns 无返回值，完成PersistentDirty的条件判断。
 */
 isPersistentDirty() { return true; } }],
            ];
        },        
        /**
 * compareStableStrings：执行compareStableString相关逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新compareStableString相关状态。
 */

        compareStableStrings(left, right) {
            return left.localeCompare(right);
        },
    });
    assert.deepEqual(result, ['public:alpha', 'public:beta', 'public:container_map']);
}
/**
 * testBuildAndMarkSnapshot：构建testBuildAndMark快照。
 * @returns 无返回值，直接更新testBuildAndMark快照相关状态。
 */


function testBuildAndMarkSnapshot() {
    const log = [];
    const service = new WorldRuntimePersistenceStateService();
    const instance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },        
        tick: 4321,
        getPersistenceRevision() { return 9; },
        /**
 * buildAuraPersistenceEntries：构建并返回目标对象。
 * @returns 无返回值，直接更新AuraPersistence条目相关状态。
 */

        buildAuraPersistenceEntries() { return ['aura:1']; },        
        /**
 * buildTileResourcePersistenceEntries：构建并返回目标对象。
 * @returns 无返回值，直接更新Tile资源Persistence条目相关状态。
 */

        buildTileResourcePersistenceEntries() { return ['tile-resource:1']; },        
        /**
 * buildTileDamagePersistenceEntries：构建并返回目标对象。
 * @returns 无返回值，直接更新Tile破坏Persistence条目相关状态。
 */

        buildTileDamagePersistenceEntries() { return ['tile-damage:1']; },        
        buildTemporaryTilePersistenceEntries() { return ['temporary-tile:1']; },
        /**
 * buildGroundPersistenceEntries：构建并返回目标对象。
 * @returns 无返回值，直接更新GroundPersistence条目相关状态。
 */

        buildGroundPersistenceEntries() { return ['ground:1']; },        
        /**
 * markAuraPersisted：判断AuraPersisted是否满足条件。
 * @returns 无返回值，直接更新AuraPersisted相关状态。
 */

        markAuraPersisted() { log.push('markAuraPersisted'); },
    };
    const deps = {    
    /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? instance : null;
        },
        worldRuntimeLootContainerService: {        
        /**
 * buildContainerPersistenceStates：构建并返回目标对象。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新ContainerPersistence状态相关状态。
 */

            buildContainerPersistenceStates(instanceId) {
                log.push(['buildContainerPersistenceStates', instanceId]);
                return [{ id: 'container:1' }];
            },            
            /**
 * clearPersisted：判断clearPersisted是否满足条件。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新clearPersisted相关状态。
 */

            clearPersisted(instanceId) {
                log.push(['clearPersisted', instanceId]);
            },
        },
    };
    const snapshot = service.buildMapPersistenceSnapshot('public:yunlai_town', deps);
    assert.equal(snapshot.templateId, 'yunlai_town');
    assert.equal(snapshot.tick, 4321);
    assert.equal(snapshot.persistenceRevision, 9);
    assert.deepEqual(snapshot.auraEntries, ['aura:1']);
    assert.deepEqual(snapshot.tileResourceEntries, ['tile-resource:1']);
    assert.deepEqual(snapshot.tileDamageEntries, ['tile-damage:1']);
    assert.deepEqual(snapshot.temporaryTileEntries, ['temporary-tile:1']);
    assert.deepEqual(snapshot.groundPileEntries, ['ground:1']);
    assert.deepEqual(snapshot.containerStates, [{ id: 'container:1' }]);
    service.markMapPersisted('public:yunlai_town', deps);
    assert.deepEqual(log, [
        ['buildContainerPersistenceStates', 'public:yunlai_town'],
        'markAuraPersisted',
        ['clearPersisted', 'public:yunlai_town'],
    ]);
}

async function testFlushTemporaryTileDomain() {
    const log = [];
    const service = new WorldRuntimePersistenceStateService();
    const instance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },
        tick: 333,
        getPersistenceRevision() { return 44; },
        buildTemporaryTilePersistenceEntries() {
            log.push('buildTemporaryTilePersistenceEntries');
            return [{ tileIndex: 8, x: 2, y: 2, tileType: 'stone', hp: 88, maxHp: 88, expiresAtTick: 393 }];
        },
        markPersistenceDomainsPersisted(domains) {
            log.push(['markPersistenceDomainsPersisted', domains]);
        },
    };
    await service.flushInstanceDomains('public:yunlai_town', ['temporary_tile'], {
        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? instance : null;
        },
        instanceDomainPersistenceService: {
            isEnabled() { return true; },
            async replaceTemporaryTileStates(instanceId, entries) {
                log.push(['replaceTemporaryTileStates', instanceId, entries.length, entries[0]?.expiresAtTick]);
            },
            async saveInstanceRecoveryWatermark(instanceId, payload) {
                log.push(['saveInstanceRecoveryWatermark', instanceId, payload.kind, payload.tick, payload.persistenceRevision, payload.domains]);
            },
        },
        worldRuntimeLootContainerService: {
            clearPersisted() {},
        },
    });
    assert.deepEqual(log, [
        'buildTemporaryTilePersistenceEntries',
        ['replaceTemporaryTileStates', 'public:yunlai_town', 1, 393],
        ['saveInstanceRecoveryWatermark', 'public:yunlai_town', 'domain_flush', 333, 44, ['temporary_tile']],
        ['markPersistenceDomainsPersisted', ['temporary_tile']],
    ]);
}

async function testFlushOverlayAndMonsterDomains() {
    const log = [];
    const service = new WorldRuntimePersistenceStateService();
    const instance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },
        tick: 2468,
        getPersistenceRevision() { return 7; },
        buildOverlayPersistenceChunks() {
            log.push('buildOverlayPersistenceChunks');
            return [{ patchKind: 'portal', chunkKey: 'runtime_portals', patchVersion: 1, patchPayload: { portals: [] } }];
        },
        buildMonsterRuntimePersistenceEntries() {
            log.push('buildMonsterRuntimePersistenceEntries');
            return [{ monsterRuntimeId: 'monster:1', monsterTier: 'demon_king' }];
        },
        markPersistenceDomainsPersisted(domains) {
            log.push(['markPersistenceDomainsPersisted', domains]);
        },
    };
    await service.flushInstanceDomains('public:yunlai_town', ['overlay', 'monster_runtime'], {
        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? instance : null;
        },
        instanceDomainPersistenceService: {
            isEnabled() { return true; },
            async replaceOverlayChunks(instanceId, entries) {
                log.push(['replaceOverlayChunks', instanceId, entries.length]);
            },
            async replaceMonsterRuntimeStates(instanceId, entries) {
                log.push(['replaceMonsterRuntimeStates', instanceId, entries.length]);
            },
            async saveInstanceRecoveryWatermark(instanceId, payload) {
                log.push(['saveInstanceRecoveryWatermark', instanceId, payload.kind, payload.tick, payload.persistenceRevision, payload.domains]);
            },
        },
        worldRuntimeLootContainerService: {
            clearPersisted() {},
        },
    });
    assert.deepEqual(log, [
        'buildOverlayPersistenceChunks',
        ['replaceOverlayChunks', 'public:yunlai_town', 1],
        'buildMonsterRuntimePersistenceEntries',
        ['replaceMonsterRuntimeStates', 'public:yunlai_town', 1],
        ['saveInstanceRecoveryWatermark', 'public:yunlai_town', 'domain_flush', 2468, 7, ['monster_runtime', 'overlay']],
        ['markPersistenceDomainsPersisted', ['overlay', 'monster_runtime']],
    ]);
}

async function testFlushIncrementalInstanceDomains() {
    const log = [];
    const service = new WorldRuntimePersistenceStateService();
    const instance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },
        tick: 555,
        getPersistenceRevision() { return 10; },
        buildTileResourcePersistenceDelta() {
            log.push('buildTileResourcePersistenceDelta');
            return {
                fullReplace: false,
                upserts: [{ resourceKey: 'aura.refined.neutral', tileIndex: 3, value: 9 }],
                deletes: [{ resourceKey: 'tile.resource.herb', tileIndex: 4 }],
            };
        },
        buildTileResourcePersistenceEntries() {
            throw new Error('incremental tile resource flush should not use full replace');
        },
        buildTileDamagePersistenceDelta() {
            log.push('buildTileDamagePersistenceDelta');
            return {
                fullReplace: false,
                upserts: [{ tileIndex: 8, hp: 1, maxHp: 10, destroyed: false }],
                deletes: [9],
            };
        },
        buildTileDamagePersistenceEntries() {
            throw new Error('incremental tile damage flush should not use full replace');
        },
        buildGroundPersistenceDelta() {
            log.push('buildGroundPersistenceDelta');
            return {
                fullReplace: false,
                tileIndices: [13],
                entries: [{ tileIndex: 13, items: [{ itemId: 'spirit_stone', count: 2 }] }],
            };
        },
        buildGroundPersistenceEntries() {
            throw new Error('incremental ground flush should not use full replace');
        },
        buildMonsterRuntimePersistenceDelta() {
            log.push('buildMonsterRuntimePersistenceDelta');
            return {
                fullReplace: false,
                upserts: [{ monsterRuntimeId: 'monster:1', monsterTier: 'demon_king' }],
                deletes: ['monster:old'],
            };
        },
        buildMonsterRuntimePersistenceEntries() {
            throw new Error('incremental monster runtime flush should not use full replace');
        },
        markPersistenceDomainsPersisted(domains) {
            log.push(['markPersistenceDomainsPersisted', domains]);
        },
    };
    await service.flushInstanceDomains('public:yunlai_town', ['tile_resource', 'tile_damage', 'ground_item', 'monster_runtime'], {
        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? instance : null;
        },
        instanceDomainPersistenceService: {
            isEnabled() { return true; },
            async saveTileResourceDelta(instanceId, upserts, deletes) {
                log.push(['saveTileResourceDelta', instanceId, upserts.length, deletes.length]);
            },
            async saveTileDamageDelta(instanceId, upserts, deletes) {
                log.push(['saveTileDamageDelta', instanceId, upserts.length, deletes.length]);
            },
            async replaceGroundItemTiles(instanceId, tileIndices, entries) {
                log.push(['replaceGroundItemTiles', instanceId, tileIndices.length, entries.length]);
            },
            async saveMonsterRuntimeDelta(instanceId, upserts, deletes) {
                log.push(['saveMonsterRuntimeDelta', instanceId, upserts.length, deletes.length]);
            },
            async saveInstanceRecoveryWatermark(instanceId, payload) {
                log.push(['saveInstanceRecoveryWatermark', instanceId, payload.kind, payload.tick, payload.persistenceRevision, payload.domains]);
            },
        },
        worldRuntimeLootContainerService: {
            clearPersisted() {},
        },
    });
    assert.deepEqual(log, [
        'buildTileResourcePersistenceDelta',
        ['saveTileResourceDelta', 'public:yunlai_town', 1, 1],
        'buildTileDamagePersistenceDelta',
        ['saveTileDamageDelta', 'public:yunlai_town', 1, 1],
        'buildGroundPersistenceDelta',
        ['replaceGroundItemTiles', 'public:yunlai_town', 1, 1],
        'buildMonsterRuntimePersistenceDelta',
        ['saveMonsterRuntimeDelta', 'public:yunlai_town', 1, 1],
        ['saveInstanceRecoveryWatermark', 'public:yunlai_town', 'domain_flush', 555, 10, ['ground_item', 'monster_runtime', 'tile_damage', 'tile_resource']],
        ['markPersistenceDomainsPersisted', ['tile_resource', 'tile_damage', 'ground_item', 'monster_runtime']],
    ]);
}

async function testFlushTimeDomainCheckpoint() {
    const log = [];
    const service = new WorldRuntimePersistenceStateService();
    const instance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },
        tick: 9876,
        getPersistenceRevision() { return 12; },
        buildAuraPersistenceEntries() { throw new Error('time checkpoint should not build full aura snapshot'); },
        buildTileResourcePersistenceEntries() { throw new Error('time checkpoint should not build full tile resource snapshot'); },
        buildTileDamagePersistenceEntries() { throw new Error('time checkpoint should not build full tile damage snapshot'); },
        buildGroundPersistenceEntries() { throw new Error('time checkpoint should not build full ground snapshot'); },
        markPersistenceDomainsPersisted(domains) {
            log.push(['markPersistenceDomainsPersisted', domains]);
        },
    };
    await service.flushInstanceDomains('public:yunlai_town', ['time'], {
        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? instance : null;
        },
        instanceDomainPersistenceService: {
            isEnabled() { return true; },
            async saveInstanceCheckpoint(instanceId, payload) {
                assert.equal(payload.snapshot.templateId, 'yunlai_town');
                assert.equal(payload.snapshot.persistenceRevision, 12);
                assert.equal(payload.snapshot.tileResourceEntries, undefined);
                log.push(['saveInstanceCheckpoint', instanceId, payload.kind, payload.snapshot.tick]);
            },
            async saveInstanceRecoveryWatermark(instanceId, payload) {
                log.push(['saveInstanceRecoveryWatermark', instanceId, payload.kind, payload.tick, payload.persistenceRevision, payload.domains]);
            },
        },
        worldRuntimeLootContainerService: {
            buildContainerPersistenceStates() { throw new Error('time checkpoint should not build container snapshot'); },
            clearPersisted() {},
        },
    });
    assert.deepEqual(log, [
        ['saveInstanceCheckpoint', 'public:yunlai_town', 'time_checkpoint', 9876],
        ['saveInstanceRecoveryWatermark', 'public:yunlai_town', 'domain_flush', 9876, 12, ['time']],
        ['markPersistenceDomainsPersisted', ['time']],
    ]);
}

function testMapTimeDirtyIsLowFrequency() {
    const instance = new MapInstanceRuntime({
        instanceId: 'public:time-frequency',
        template: createTimeFrequencyTemplate(),
        monsterSpawns: [],
        kind: 'public',
        persistent: true,
        createdAt: Date.now(),
        displayName: 'Time Frequency',
        linePreset: 'peaceful',
        lineIndex: 1,
        instanceOrigin: 'smoke',
        defaultEntry: true,
        supportsPvp: false,
        canDamageTile: false,
    });
    const initialRevision = instance.getPersistenceRevision();
    instance.tickOnce();
    assert.equal(instance.getDirtyDomains().has('time'), false);
    assert.equal(instance.getPersistenceRevision(), initialRevision);
    for (let index = 1; index < 300; index += 1) {
        instance.tickOnce();
    }
    assert.equal(instance.getDirtyDomains().has('time'), true);
    assert.ok(instance.getPersistenceRevision() > initialRevision);
}

function createTimeFrequencyTemplate() {
    return {
        id: 'time_frequency_smoke',
        name: '时间低频持久化 Smoke',
        width: 3,
        height: 3,
        terrainRows: ['...', '...', '...'],
        walkableMask: Uint8Array.from({ length: 9 }, () => 1),
        blocksSightMask: Uint8Array.from({ length: 9 }, () => 0),
        baseAuraByTile: Int32Array.from({ length: 9 }, () => 0),
        baseTileResourceEntries: [],
        npcs: [],
        landmarks: [],
        containers: [],
        safeZones: [],
        portals: [],
        spawnX: 1,
        spawnY: 1,
        source: {},
    };
}

testListDirtyPersistentInstances();
testBuildAndMarkSnapshot();
testMapTimeDirtyIsLowFrequency();
Promise.all([
    testFlushOverlayAndMonsterDomains(),
    testFlushIncrementalInstanceDomains(),
    testFlushTemporaryTileDomain(),
    testFlushTimeDomainCheckpoint(),
]).then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-persistence-state' }, null, 2));
}).catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
});
