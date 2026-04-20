// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeInstanceReadFacadeService } = require("../runtime/world/world-runtime-instance-read-facade.service");
/**
 * testInstanceReadFacade：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testInstanceReadFacade() {
    const service = new WorldRuntimeInstanceReadFacadeService();
    const log = [];
    const instance = {
        meta: { instanceId: 'public:yunlai_town' },
        monsters: [{ runtimeId: 'monster:1' }],
    };
    const deps = {
        templateRepository: {        
        /**
 * listSummaries：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            listSummaries() { return [{ id: 'yunlai_town' }]; },            
            /**
 * getOrThrow：按给定条件读取/查询数据。
 * @param templateId template ID。
 * @returns 函数返回值。
 */

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
        /**
 * listInstances：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            listInstances() { return [{ instanceId: 'public:yunlai_town' }]; },            
            /**
 * getInstance：按给定条件读取/查询数据。
 * @param _deps 参数说明。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

            getInstance(_deps, instanceId) { return { instanceId }; },            
            /**
 * listInstanceMonsters：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

            listInstanceMonsters(input) { return input.monsters; },            
            /**
 * getInstanceMonster：按给定条件读取/查询数据。
 * @param _instance 参数说明。
 * @param runtimeId runtime ID。
 * @returns 函数返回值。
 */

            getInstanceMonster(_instance, runtimeId) { return { runtimeId }; },            
            /**
 * getInstanceTileState：按给定条件读取/查询数据。
 * @param _instance 参数说明。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 函数返回值。
 */

            getInstanceTileState(_instance, x, y) { return { x, y }; },
        },
        worldRuntimeCombatEffectsService: {        
        /**
 * getCombatEffects：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getCombatEffects() { return [{ kind: 'flash' }]; },
        },        
        /**
 * cloneCombatEffect：执行核心业务逻辑。
 * @param effect 参数说明。
 * @returns 函数返回值。
 */

        cloneCombatEffect(effect) {
            return { ...effect, cloned: true };
        },        
        /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? instance : null;
        },        
        /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntimeOrThrow(instanceId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (instanceId !== 'public:yunlai_town') throw new Error('not found');
            return instance;
        },
        contentTemplateRepository: {        
        /**
 * createRuntimeMonstersForMap：构建并返回目标对象。
 * @param templateId template ID。
 * @returns 函数返回值。
 */

            createRuntimeMonstersForMap(templateId) {
                log.push(['createRuntimeMonstersForMap', templateId]);
                return [];
            },
        },        
        /**
 * setInstanceRuntime：更新/写入相关状态。
 * @param instanceId instance ID。
 * @param created 参数说明。
 * @returns 函数返回值。
 */

        setInstanceRuntime(instanceId, created) {
            log.push(['setInstanceRuntime', instanceId, created.meta.instanceId]);
        },
        worldRuntimeTickProgressService: {        
        /**
 * initializeInstance：初始化并准备运行时基础状态。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

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
