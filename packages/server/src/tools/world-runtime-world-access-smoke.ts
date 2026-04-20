// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeWorldAccessService } = require("../runtime/world/world-runtime-world-access.service");
/**
 * createService：构建并返回目标对象。
 * @returns 函数返回值。
 */


function createService() {
    return new WorldRuntimeWorldAccessService({    
    /**
 * buildRuntimeSummary：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

        buildRuntimeSummary(input) {
            return { tick: input.tick, instanceCount: input.instances.length, pendingSystemCommandCount: input.pendingSystemCommandCount };
        },
    });
}
/**
 * testAccessorsAndSummary：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testAccessorsAndSummary() {
    const service = createService();
    const instance = { meta: { instanceId: 'public:yunlai_town' }, tick: 9 };
    const deps = {
        tick: 3,
        lastTickDurationMs: 1,
        lastSyncFlushDurationMs: 2,
        tickDurationHistoryMs: [1],
        syncFlushDurationHistoryMs: [2],
        lastTickPhaseDurations: { tick: 1 },
        templateRepository: {        
        /**
 * has：执行状态校验并返回判断结果。
 * @param id 参数说明。
 * @returns 函数返回值。
 */

            has(id) { return id === 'yunlai_town'; },            
            /**
 * list：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            list() { return [{ id: 'yunlai_town' }]; },
        },        
        /**
 * listInstances：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        listInstances() { return [{ instanceId: 'public:yunlai_town' }]; },        
        /**
 * getPlayerLocationCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocationCount() { return 1; },        
        /**
 * getPendingCommandCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPendingCommandCount() { return 2; },
        worldRuntimeGmQueueService: {        
        /**
 * getPendingSystemCommandCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */
 getPendingSystemCommandCount() { return 4; } },
        worldRuntimeNavigationService: {        
        /**
 * findMapRoute：执行核心业务逻辑。
 * @param fromMapId fromMap ID。
 * @param toMapId toMap ID。
 * @returns 函数返回值。
 */

            findMapRoute(fromMapId, toMapId) { return { fromMapId, toMapId }; },            
            /**
 * interruptManualNavigation：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param runtime 参数说明。
 * @returns 函数返回值。
 */

            interruptManualNavigation(playerId, runtime) { runtime.log.push(['interruptManualNavigation', playerId]); },            
            /**
 * clearNavigationIntent：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            clearNavigationIntent(playerId) { deps.log.push(['clearNavigationIntent', playerId]); },
        },        
        /**
 * createInstance：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

        createInstance(input) { deps.log.push(['createInstance', input.instanceId]); return instance; },        
        /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerLocation(playerId) { return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null; },        
        /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntime(instanceId) { return instanceId === 'public:yunlai_town' ? instance : null; },        
        /**
 * getPlayer：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayer(playerId) { return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null; },
        playerRuntimeService: {        
        /**
 * getPlayer：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */
 getPlayer(playerId) { return deps.getPlayer(playerId); } },        
 /**
 * getPlayerView：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerView(playerId) { return playerId === 'player:1' ? { playerId } : null; },
        log: [],
    };
    assert.equal(service.resolveCurrentTickForPlayerId('player:1', deps), 9);
    assert.equal(service.resolveDefaultRespawnMapId(deps), 'yunlai_town');
    assert.equal(service.getOrCreatePublicInstance('yunlai_town', deps), instance);
    assert.deepEqual(service.findMapRoute('a', 'b', deps), { fromMapId: 'a', toMapId: 'b' });
    assert.deepEqual(service.getPlayerLocationOrThrow('player:1', deps), { instanceId: 'public:yunlai_town' });
    assert.equal(service.getInstanceRuntimeOrThrow('public:yunlai_town', deps), instance);
    instance.cancelPendingCommand = (playerId) => playerId === 'player:1';
    assert.equal(service.cancelPendingInstanceCommand('player:1', deps), true);
    service.interruptManualNavigation('player:1', deps);
    service.interruptManualCombat('player:1', deps);
    assert.deepEqual(service.getPlayerViewOrThrow('player:1', deps), { playerId: 'player:1' });
    assert.deepEqual(service.getRuntimeSummary(deps), { tick: 3, instanceCount: 1, pendingSystemCommandCount: 4 });
}

testAccessorsAndSummary();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-world-access' }, null, 2));
