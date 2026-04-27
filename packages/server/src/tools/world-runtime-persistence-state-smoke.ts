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
    assert.deepEqual(snapshot.groundPileEntries, ['ground:1']);
    assert.deepEqual(snapshot.containerStates, [{ id: 'container:1' }]);
    service.markMapPersisted('public:yunlai_town', deps);
    assert.deepEqual(log, [
        ['buildContainerPersistenceStates', 'public:yunlai_town'],
        'markAuraPersisted',
        ['clearPersisted', 'public:yunlai_town'],
    ]);
}

async function testFlushOverlayAndMonsterDomains() {
    const log = [];
    const service = new WorldRuntimePersistenceStateService();
    const instance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },
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
        ['markPersistenceDomainsPersisted', ['overlay', 'monster_runtime']],
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
        },
        worldRuntimeLootContainerService: {
            buildContainerPersistenceStates() { throw new Error('time checkpoint should not build container snapshot'); },
            clearPersisted() {},
        },
    });
    assert.deepEqual(log, [
        ['saveInstanceCheckpoint', 'public:yunlai_town', 'time_checkpoint', 9876],
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
    testFlushTimeDomainCheckpoint(),
]).then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-persistence-state' }, null, 2));
}).catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
});
