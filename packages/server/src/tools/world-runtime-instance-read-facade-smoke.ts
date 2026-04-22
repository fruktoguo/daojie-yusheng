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
        meta: {
            instanceId: 'public:yunlai_town',
            templateId: 'yunlai_town',
            displayName: '云来镇·和平',
            linePreset: 'peaceful',
            lineIndex: 1,
            instanceOrigin: 'bootstrap',
            defaultEntry: true,
            persistent: true,
            supportsPvp: false,
            canDamageTile: true,
        },
        template: { name: '云来镇' },
        tick: 7,
        worldRevision: 11,
        playerCount: 3,
        monsters: [{ runtimeId: 'monster:1' }],
        snapshot() {
            return {
                instanceId: this.meta.instanceId,
                displayName: this.meta.displayName,
                templateId: this.meta.templateId,
                templateName: this.template.name,
                kind: 'public',
                linePreset: this.meta.linePreset,
                lineIndex: this.meta.lineIndex,
                instanceOrigin: this.meta.instanceOrigin,
                defaultEntry: this.meta.defaultEntry,
                persistent: this.meta.persistent,
                supportsPvp: this.meta.supportsPvp,
                canDamageTile: this.meta.canDamageTile,
                tick: this.tick,
                worldRevision: this.worldRevision,
                playerCount: this.playerCount,
            };
        },
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
                    name: '云来镇',
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

            getInstance(_deps, instanceId) { return deps.getInstanceRuntimeOrThrow(instanceId).snapshot(); },            
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
    assert.deepEqual(service.getInstance('public:yunlai_town', deps), {
        instanceId: 'public:yunlai_town',
        displayName: '云来镇·和平',
        templateId: 'yunlai_town',
        templateName: '云来镇',
        kind: 'public',
        linePreset: 'peaceful',
        lineIndex: 1,
        instanceOrigin: 'bootstrap',
        defaultEntry: true,
        persistent: true,
        supportsPvp: false,
        canDamageTile: true,
        tick: 7,
        worldRevision: 11,
        playerCount: 3,
    });
    assert.deepEqual(service.listInstanceMonsters('public:yunlai_town', deps), [{ runtimeId: 'monster:1' }]);
    assert.deepEqual(service.getInstanceMonster('public:yunlai_town', 'monster:1', deps), { runtimeId: 'monster:1' });
    assert.deepEqual(service.getInstanceTileState('public:yunlai_town', 10, 11, deps), { x: 10, y: 11 });
    assert.deepEqual(service.getCombatEffects('public:yunlai_town', deps), [{ kind: 'flash' }]);
    const created = service.createInstance({
        instanceId: 'public:new_map',
        templateId: 'yunlai_town',
        kind: 'public',
        persistent: true,
    }, deps);
    assert.equal(created.meta.instanceId, 'public:new_map');
    assert.equal(created.meta.displayName, '云来镇·和平');
    assert.equal(created.meta.linePreset, 'peaceful');
    assert.equal(created.meta.lineIndex, 1);
    assert.equal(created.meta.instanceOrigin, 'bootstrap');
    assert.equal(created.meta.defaultEntry, true);
    assert.equal(created.meta.supportsPvp, false);
    assert.equal(created.meta.canDamageTile, true);
    const createdReal = service.createInstance({
        instanceId: 'real:yunlai_town',
        templateId: 'yunlai_town',
        kind: 'public',
        persistent: true,
    }, deps);
    assert.equal(createdReal.meta.instanceId, 'real:yunlai_town');
    assert.equal(createdReal.meta.displayName, '云来镇·真实');
    assert.equal(createdReal.meta.linePreset, 'real');
    assert.equal(createdReal.meta.lineIndex, 1);
    assert.equal(createdReal.meta.instanceOrigin, 'bootstrap');
    assert.equal(createdReal.meta.defaultEntry, true);
    assert.equal(createdReal.meta.supportsPvp, true);
    assert.equal(createdReal.meta.canDamageTile, true);
}

testInstanceReadFacade();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-instance-read-facade' }, null, 2));
