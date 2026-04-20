// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePersistenceStateService } = require("../runtime/world/world-runtime-persistence-state.service");
/**
 * testListDirtyPersistentInstances：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testListDirtyPersistentInstances() {
    const service = new WorldRuntimePersistenceStateService();
    const result = service.listDirtyPersistentInstances({
        worldRuntimeLootContainerService: {        
        /**
 * getDirtyInstanceIds：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getDirtyInstanceIds() {
                return ['public:container_map', 'public:alpha'];
            },
        },        
        /**
 * listInstanceEntries：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        listInstanceEntries() {
            return [
                ['public:beta', { meta: { persistent: true },                
                /**
 * isPersistentDirty：执行状态校验并返回判断结果。
 * @returns 函数返回值。
 */
 isPersistentDirty() { return true; } }],
                ['public:gamma', { meta: { persistent: false },                
                /**
 * isPersistentDirty：执行状态校验并返回判断结果。
 * @returns 函数返回值。
 */
 isPersistentDirty() { return true; } }],
            ];
        },        
        /**
 * compareStableStrings：执行核心业务逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

        compareStableStrings(left, right) {
            return left.localeCompare(right);
        },
    });
    assert.deepEqual(result, ['public:alpha', 'public:beta', 'public:container_map']);
}
/**
 * testBuildAndMarkSnapshot：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testBuildAndMarkSnapshot() {
    const log = [];
    const service = new WorldRuntimePersistenceStateService();
    const instance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },        
        /**
 * buildAuraPersistenceEntries：构建并返回目标对象。
 * @returns 函数返回值。
 */

        buildAuraPersistenceEntries() { return ['aura:1']; },        
        /**
 * buildGroundPersistenceEntries：构建并返回目标对象。
 * @returns 函数返回值。
 */

        buildGroundPersistenceEntries() { return ['ground:1']; },        
        /**
 * markAuraPersisted：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        markAuraPersisted() { log.push('markAuraPersisted'); },
    };
    const deps = {    
    /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? instance : null;
        },
        worldRuntimeLootContainerService: {        
        /**
 * buildContainerPersistenceStates：构建并返回目标对象。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

            buildContainerPersistenceStates(instanceId) {
                log.push(['buildContainerPersistenceStates', instanceId]);
                return [{ id: 'container:1' }];
            },            
            /**
 * clearPersisted：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

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
