// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeLifecycleService } = require("../runtime/world/world-runtime-lifecycle.service");
/**
 * testBootstrapPublicInstances：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testBootstrapPublicInstances() {
    const service = new WorldRuntimeLifecycleService();
    const log = [];
    service.bootstrapPublicInstances({
        templateRepository: {        
        /**
 * list：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            list() {
                return [{ id: 'yunlai_town' }, { id: 'forest_1' }];
            },
        },        
        /**
 * createInstance：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

        createInstance(input) {
            log.push(['createInstance', input]);
        },        
        /**
 * getInstanceCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceCount() {
            return 2;
        },
        logger: {        
        /**
 * log：执行核心业务逻辑。
 * @param message 参数说明。
 * @returns 函数返回值。
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
/**
 * testRestoreAndRebuild：执行核心业务逻辑。
 * @returns 函数返回值。
 */


async function testRestoreAndRebuild() {
    const service = new WorldRuntimeLifecycleService();
    const log = [];
    const persistentInstance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },        
        /**
 * hydrateAura：执行核心业务逻辑。
 * @param entries 参数说明。
 * @returns 函数返回值。
 */

        hydrateAura(entries) {
            log.push(['hydrateAura', entries]);
        },        
        /**
 * hydrateGroundPiles：执行核心业务逻辑。
 * @param entries 参数说明。
 * @returns 函数返回值。
 */

        hydrateGroundPiles(entries) {
            log.push(['hydrateGroundPiles', entries]);
        },
    };
    const volatileInstance = {
        meta: { persistent: false },
        template: { id: 'forest_1' },        
        /**
 * hydrateAura：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        hydrateAura() {
            log.push(['volatileHydrateAura']);
        },        
        /**
 * hydrateGroundPiles：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        hydrateGroundPiles() {
            log.push(['volatileHydrateGroundPiles']);
        },
    };
    await service.restorePublicInstancePersistence({
        mapPersistenceService: {        
        /**
 * isEnabled：执行状态校验并返回判断结果。
 * @returns 函数返回值。
 */

            isEnabled() {
                return true;
            },            
            /**
 * loadMapSnapshot：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

            async loadMapSnapshot(instanceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
        /**
 * listInstanceEntries：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        listInstanceEntries() {
            return [
                ['public:yunlai_town', persistentInstance],
                ['public:forest_1', volatileInstance],
            ];
        },
        worldRuntimeLootContainerService: {        
        /**
 * hydrateContainerStates：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param states 参数说明。
 * @returns 函数返回值。
 */

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
        worldRuntimeInstanceStateService: {        
        /**
 * resetState：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 resetState() { resetLog.push('instance'); } },
        worldRuntimePlayerLocationService: {        
        /**
 * resetState：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 resetState() { resetLog.push('playerLocation'); } },
        worldRuntimePendingCommandService: {        
        /**
 * resetState：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 resetState() { resetLog.push('pending'); } },
        worldRuntimeGmQueueService: {        
        /**
 * resetState：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 resetState() { resetLog.push('gmQueue'); } },
        worldRuntimeNavigationService: {        
        /**
 * reset：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 reset() { resetLog.push('navigation'); } },
        worldRuntimeTickProgressService: {        
        /**
 * resetState：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 resetState() { resetLog.push('tickProgress'); } },
        worldRuntimeLootContainerService: {        
        /**
 * reset：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            reset() { resetLog.push('lootContainer'); },            
            /**
 * hydrateContainerStates：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param states 参数说明。
 * @returns 函数返回值。
 */

            hydrateContainerStates(instanceId, states) { resetLog.push(['hydrateContainerStates', instanceId, states]); },
        },
        worldRuntimeCombatEffectsService: {        
        /**
 * resetAll：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 resetAll() { resetLog.push('combatEffects'); } },
        templateRepository: {        
        /**
 * list：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            list() {
                return [{ id: 'yunlai_town' }];
            },
        },        
        /**
 * createInstance：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

        createInstance(input) {
            resetLog.push(['createInstance', input.instanceId]);
        },        
        /**
 * getInstanceCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceCount() {
            return 1;
        },
        logger: {        
        /**
 * log：执行核心业务逻辑。
 * @param message 参数说明。
 * @returns 函数返回值。
 */

            log(message) {
                resetLog.push(['log', message]);
            },
        },
        mapPersistenceService: {        
        /**
 * isEnabled：执行状态校验并返回判断结果。
 * @returns 函数返回值。
 */

            isEnabled() {
                return false;
            },            
            /**
 * loadMapSnapshot：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            async loadMapSnapshot() {
                throw new Error('unreachable');
            },
        },        
        /**
 * listInstanceEntries：执行核心业务逻辑。
 * @returns 函数返回值。
 */

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
/**
 * main：执行核心业务逻辑。
 * @returns 函数返回值。
 */


async function main() {
    testBootstrapPublicInstances();
    await testRestoreAndRebuild();
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-lifecycle' }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
