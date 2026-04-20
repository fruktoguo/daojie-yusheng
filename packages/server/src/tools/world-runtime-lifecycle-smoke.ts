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
            return 2;
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
 * testRestoreAndRebuild：构建testRestoreAndRebuild。
 * @returns 无返回值，直接更新testRestoreAndRebuild相关状态。
 */


async function testRestoreAndRebuild() {
    const service = new WorldRuntimeLifecycleService();
    const log = [];
    const persistentInstance = {
        meta: { persistent: true },
        template: { id: 'yunlai_town' },        
        /**
 * hydrateAura：执行hydrateAura相关逻辑。
 * @param entries 参数说明。
 * @returns 无返回值，直接更新hydrateAura相关状态。
 */

        hydrateAura(entries) {
            log.push(['hydrateAura', entries]);
        },        
        /**
 * hydrateGroundPiles：执行hydrate地面Pile相关逻辑。
 * @param entries 参数说明。
 * @returns 无返回值，直接更新hydrateGroundPile相关状态。
 */

        hydrateGroundPiles(entries) {
            log.push(['hydrateGroundPiles', entries]);
        },
    };
    const volatileInstance = {
        meta: { persistent: false },
        template: { id: 'forest_1' },        
        /**
 * hydrateAura：执行hydrateAura相关逻辑。
 * @returns 无返回值，直接更新hydrateAura相关状态。
 */

        hydrateAura() {
            log.push(['volatileHydrateAura']);
        },        
        /**
 * hydrateGroundPiles：执行hydrate地面Pile相关逻辑。
 * @returns 无返回值，直接更新hydrateGroundPile相关状态。
 */

        hydrateGroundPiles() {
            log.push(['volatileHydrateGroundPiles']);
        },
    };
    await service.restorePublicInstancePersistence({
        mapPersistenceService: {        
        /**
 * isEnabled：判断启用是否满足条件。
 * @returns 无返回值，完成启用的条件判断。
 */

            isEnabled() {
                return true;
            },            
            /**
 * loadMapSnapshot：读取地图快照并返回结果。
 * @param instanceId instance ID。
 * @returns 无返回值，完成地图快照的读取/组装。
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
 * listInstanceEntries：读取Instance条目并返回结果。
 * @returns 无返回值，完成Instance条目的读取/组装。
 */

        listInstanceEntries() {
            return [
                ['public:yunlai_town', persistentInstance],
                ['public:forest_1', volatileInstance],
            ];
        },
        worldRuntimeLootContainerService: {        
        /**
 * hydrateContainerStates：执行hydrateContainer状态相关逻辑。
 * @param instanceId instance ID。
 * @param states 参数说明。
 * @returns 无返回值，直接更新hydrateContainer状态相关状态。
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
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
 */
 resetState() { resetLog.push('instance'); } },
        worldRuntimePlayerLocationService: {        
        /**
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
 */
 resetState() { resetLog.push('playerLocation'); } },
        worldRuntimePendingCommandService: {        
        /**
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
 */
 resetState() { resetLog.push('pending'); } },
        worldRuntimeGmQueueService: {        
        /**
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
 */
 resetState() { resetLog.push('gmQueue'); } },
        worldRuntimeNavigationService: {        
        /**
 * reset：执行reset相关逻辑。
 * @returns 无返回值，直接更新reset相关状态。
 */
 reset() { resetLog.push('navigation'); } },
        worldRuntimeTickProgressService: {        
        /**
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
 */
 resetState() { resetLog.push('tickProgress'); } },
        worldRuntimeLootContainerService: {        
        /**
 * reset：执行reset相关逻辑。
 * @returns 无返回值，直接更新reset相关状态。
 */

            reset() { resetLog.push('lootContainer'); },            
            /**
 * hydrateContainerStates：执行hydrateContainer状态相关逻辑。
 * @param instanceId instance ID。
 * @param states 参数说明。
 * @returns 无返回值，直接更新hydrateContainer状态相关状态。
 */

            hydrateContainerStates(instanceId, states) { resetLog.push(['hydrateContainerStates', instanceId, states]); },
        },
        worldRuntimeCombatEffectsService: {        
        /**
 * resetAll：执行resetAll相关逻辑。
 * @returns 无返回值，直接更新resetAll相关状态。
 */
 resetAll() { resetLog.push('combatEffects'); } },
        templateRepository: {        
        /**
 * list：读取列表并返回结果。
 * @returns 无返回值，完成结果的读取/组装。
 */

            list() {
                return [{ id: 'yunlai_town' }];
            },
        },        
        /**
 * createInstance：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 无返回值，直接更新Instance相关状态。
 */

        createInstance(input) {
            resetLog.push(['createInstance', input.instanceId]);
        },        
        /**
 * getInstanceCount：读取Instance数量。
 * @returns 无返回值，完成Instance数量的读取/组装。
 */

        getInstanceCount() {
            return 1;
        },
        logger: {        
        /**
 * log：执行log相关逻辑。
 * @param message 参数说明。
 * @returns 无返回值，直接更新log相关状态。
 */

            log(message) {
                resetLog.push(['log', message]);
            },
        },
        mapPersistenceService: {        
        /**
 * isEnabled：判断启用是否满足条件。
 * @returns 无返回值，完成启用的条件判断。
 */

            isEnabled() {
                return false;
            },            
            /**
 * loadMapSnapshot：读取地图快照并返回结果。
 * @returns 无返回值，完成地图快照的读取/组装。
 */

            async loadMapSnapshot() {
                throw new Error('unreachable');
            },
        },        
        /**
 * listInstanceEntries：读取Instance条目并返回结果。
 * @returns 无返回值，完成Instance条目的读取/组装。
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
 * main：执行main相关逻辑。
 * @returns 无返回值，直接更新main相关状态。
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
