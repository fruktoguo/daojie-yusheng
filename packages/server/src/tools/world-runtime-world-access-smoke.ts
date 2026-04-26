// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeWorldAccessService } = require("../runtime/world/world-runtime-world-access.service");
/**
 * createService：构建并返回目标对象。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService() {
    return new WorldRuntimeWorldAccessService({    
    /**
 * buildRuntimeSummary：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 无返回值，直接更新运行态摘要相关状态。
 */

        buildRuntimeSummary(input) {
            return {
                tick: input.tick,
                instanceCount: input.instances.length,
                pendingSystemCommandCount: input.pendingSystemCommandCount,
                dirtyBacklog: input.dirtyBacklog,
                recoveryQueue: input.recoveryQueue,
                flushWakeup: input.flushWakeup,
            };
        },
    });
}
/**
 * testAccessorsAndSummary：执行testAccessorAnd摘要相关逻辑。
 * @returns 无返回值，直接更新testAccessorAnd摘要相关状态。
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
 * has：判断ha是否满足条件。
 * @param id 参数说明。
 * @returns 无返回值，完成标识的条件判断。
 */

            has(id) { return id === 'yunlai_town'; },            
            /**
 * list：读取列表并返回结果。
 * @returns 无返回值，完成结果的读取/组装。
 */

            list() { return [{ id: 'yunlai_town' }]; },
        },        
        /**
 * listInstances：读取Instance并返回结果。
 * @returns 无返回值，完成Instance的读取/组装。
 */

        listInstances() { return [{ instanceId: 'public:yunlai_town' }]; },        
        /**
 * getPlayerLocationCount：读取玩家位置数量。
 * @returns 无返回值，完成玩家位置数量的读取/组装。
 */

        getPlayerLocationCount() { return 1; },        
        /**
 * getPendingCommandCount：读取待处理Command数量。
 * @returns 无返回值，完成PendingCommand数量的读取/组装。
 */

        getPendingCommandCount() { return 2; },
        listDirtyPersistentInstances() { return ['instance:1', 'instance:2']; },
        worldRuntimeGmQueueService: {        
        /**
 * getPendingSystemCommandCount：读取待处理SystemCommand数量。
 * @returns 无返回值，完成PendingSystemCommand数量的读取/组装。
 */
            getPendingSystemCommandCount() { return 4; } },
        worldSessionRecoveryQueueService: {
            getSnapshot() {
                return {
                    concurrency: 4,
                    inFlight: 1,
                    queued: 2,
                    keys: ['bootstrap:player:1'],
                };
            },
        },
        flushWakeupService: {
            listWakeupKeys() {
                return ['flush:wakeup:player:player:1'];
            },
        },
        worldRuntimeNavigationService: {        
        /**
 * findMapRoute：读取地图路线并返回结果。
 * @param fromMapId fromMap ID。
 * @param toMapId toMap ID。
 * @returns 无返回值，完成地图路线的读取/组装。
 */

            findMapRoute(fromMapId, toMapId) { return { fromMapId, toMapId }; },            
            /**
 * interruptManualNavigation：执行interruptManual导航相关逻辑。
 * @param playerId 玩家 ID。
 * @param runtime 参数说明。
 * @returns 无返回值，直接更新interruptManual导航相关状态。
 */

            interruptManualNavigation(playerId, runtime) { runtime.log.push(['interruptManualNavigation', playerId]); },            
            /**
 * clearNavigationIntent：执行clear导航Intent相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clear导航Intent相关状态。
 */

            clearNavigationIntent(playerId) { deps.log.push(['clearNavigationIntent', playerId]); },
        },        
        /**
 * createInstance：构建并返回目标对象。
 * @param input 输入参数。
 * @returns 无返回值，直接更新Instance相关状态。
 */

        createInstance(input) { deps.log.push(['createInstance', input.instanceId]); return instance; },        
        /**
 * getPlayerLocation：读取玩家位置。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

        getPlayerLocation(playerId) { return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null; },        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime(instanceId) { return instanceId === 'public:yunlai_town' ? instance : null; },        
        /**
 * getPlayer：读取玩家。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */

        getPlayer(playerId) { return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null; },
        playerRuntimeService: {        
        /**
 * getPlayer：读取玩家。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */
 getPlayer(playerId) { return deps.getPlayer(playerId); },
            clearManualEngagePending(playerId) { deps.log.push(['clearManualEngagePending', playerId]); },
        },
        clearPendingCommand(playerId) { deps.log.push(['clearPendingCommand', playerId]); },
 /**
 * getPlayerView：读取玩家视图。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家视图的读取/组装。
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
    deps.log.length = 0;
    service.interruptManualNavigation('player:1', deps);
    service.interruptManualCombat('player:1', deps);
    assert.deepEqual(deps.log, [
        ['interruptManualNavigation', 'player:1'],
        ['clearNavigationIntent', 'player:1'],
        ['clearPendingCommand', 'player:1'],
        ['clearManualEngagePending', 'player:1'],
    ]);
    assert.deepEqual(service.getPlayerViewOrThrow('player:1', deps), { playerId: 'player:1' });
    assert.deepEqual(service.getRuntimeSummary(deps), {
        tick: 3,
        instanceCount: 1,
        pendingSystemCommandCount: 4,
        dirtyBacklog: {
            players: 0,
            playerDomains: 0,
            instances: 2,
        },
        recoveryQueue: {
            concurrency: 4,
            inFlight: 1,
            queued: 2,
            keys: ['bootstrap:player:1'],
        },
        flushWakeup: {
            concurrency: 0,
            inFlight: 0,
            queued: 1,
            keys: ['flush:wakeup:player:player:1'],
        },
    });
}

testAccessorsAndSummary();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-world-access' }, null, 2));
