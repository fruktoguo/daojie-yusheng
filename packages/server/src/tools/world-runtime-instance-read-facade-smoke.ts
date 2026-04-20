// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeInstanceReadFacadeService } = require("../runtime/world/world-runtime-instance-read-facade.service");
/**
 * testInstanceReadFacade：读取testInstanceReadFacade并返回结果。
 * @returns 无返回值，直接更新testInstanceReadFacade相关状态。
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
 * listSummaries：读取摘要并返回结果。
 * @returns 无返回值，完成摘要的读取/组装。
 */

            listSummaries() { return [{ id: 'yunlai_town' }]; },            
            /**
 * getOrThrow：读取OrThrow。
 * @param templateId template ID。
 * @returns 无返回值，完成OrThrow的读取/组装。
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
 * listInstances：读取Instance并返回结果。
 * @returns 无返回值，完成Instance的读取/组装。
 */

            listInstances() { return [{ instanceId: 'public:yunlai_town' }]; },            
            /**
 * getInstance：读取Instance。
 * @param _deps 参数说明。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance的读取/组装。
 */

            getInstance(_deps, instanceId) { return { instanceId }; },            
            /**
 * listInstanceMonsters：读取Instance怪物并返回结果。
 * @param input 输入参数。
 * @returns 无返回值，完成Instance怪物的读取/组装。
 */

            listInstanceMonsters(input) { return input.monsters; },            
            /**
 * getInstanceMonster：读取Instance怪物。
 * @param _instance 参数说明。
 * @param runtimeId runtime ID。
 * @returns 无返回值，完成Instance怪物的读取/组装。
 */

            getInstanceMonster(_instance, runtimeId) { return { runtimeId }; },            
            /**
 * getInstanceTileState：读取InstanceTile状态。
 * @param _instance 参数说明。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 无返回值，完成InstanceTile状态的读取/组装。
 */

            getInstanceTileState(_instance, x, y) { return { x, y }; },
        },
        worldRuntimeCombatEffectsService: {        
        /**
 * getCombatEffects：读取战斗Effect。
 * @returns 无返回值，完成战斗Effect的读取/组装。
 */

            getCombatEffects() { return [{ kind: 'flash' }]; },
        },        
        /**
 * cloneCombatEffect：构建战斗Effect。
 * @param effect 参数说明。
 * @returns 无返回值，直接更新战斗Effect相关状态。
 */

        cloneCombatEffect(effect) {
            return { ...effect, cloned: true };
        },        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime(instanceId) {
            return instanceId === 'public:yunlai_town' ? instance : null;
        },        
        /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
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
 * @returns 无返回值，直接更新运行态怪物For地图相关状态。
 */

            createRuntimeMonstersForMap(templateId) {
                log.push(['createRuntimeMonstersForMap', templateId]);
                return [];
            },
        },        
        /**
 * setInstanceRuntime：写入Instance运行态。
 * @param instanceId instance ID。
 * @param created 参数说明。
 * @returns 无返回值，直接更新Instance运行态相关状态。
 */

        setInstanceRuntime(instanceId, created) {
            log.push(['setInstanceRuntime', instanceId, created.meta.instanceId]);
        },
        worldRuntimeTickProgressService: {        
        /**
 * initializeInstance：执行initializeInstance相关逻辑。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新initializeInstance相关状态。
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
