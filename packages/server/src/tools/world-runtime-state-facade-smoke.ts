// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeStateFacadeService } = require("../runtime/world/world-runtime-state-facade.service");
/**
 * testStateFacade：执行test状态Facade相关逻辑。
 * @returns 无返回值，直接更新test状态Facade相关状态。
 */


async function testStateFacade() {
    const service = new WorldRuntimeStateFacadeService();
    const log = [];
    const deps = {
        worldRuntimePendingCommandService: {        
        /**
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

            enqueuePendingCommand(playerId, command) { log.push(['enqueuePendingCommand', playerId, command.kind]); },            
            /**
 * getPendingCommand：读取待处理Command。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成PendingCommand的读取/组装。
 */

            getPendingCommand(playerId) { return playerId === 'player:1' ? { kind: 'move' } : null; },            
            /**
 * hasPendingCommand：判断待处理Command是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成PendingCommand的条件判断。
 */

            hasPendingCommand(playerId) { return playerId === 'player:1'; },            
            /**
 * clearPendingCommand：执行clear待处理Command相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clearPendingCommand相关状态。
 */

            clearPendingCommand(playerId) { log.push(['clearPendingCommand', playerId]); },            
            /**
 * getPendingCommandCount：读取待处理Command数量。
 * @returns 无返回值，完成PendingCommand数量的读取/组装。
 */

            getPendingCommandCount() { return 2; },
        },
        worldRuntimePlayerLocationService: {        
        /**
 * getPlayerLocation：读取玩家位置。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

            getPlayerLocation(playerId) { return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null; },            
            /**
 * setPlayerLocation：写入玩家位置。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 无返回值，直接更新玩家位置相关状态。
 */

            setPlayerLocation(playerId, location) { log.push(['setPlayerLocation', playerId, location.instanceId]); },            
            /**
 * clearPlayerLocation：执行clear玩家位置相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clear玩家位置相关状态。
 */

            clearPlayerLocation(playerId) { log.push(['clearPlayerLocation', playerId]); },            
            /**
 * getPlayerLocationCount：读取玩家位置数量。
 * @returns 无返回值，完成玩家位置数量的读取/组装。
 */

            getPlayerLocationCount() { return 3; },            
            /**
 * listConnectedPlayerIds：读取Connected玩家ID并返回结果。
 * @returns 无返回值，完成Connected玩家ID的读取/组装。
 */

            listConnectedPlayerIds() { return ['player:1', 'player:2']; },
        },
        worldRuntimeInstanceStateService: {        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

            getInstanceRuntime(instanceId) { return instanceId === 'public:yunlai_town' ? { meta: { instanceId } } : null; },            
            /**
 * setInstanceRuntime：写入Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新Instance运行态相关状态。
 */

            setInstanceRuntime(instanceId) { log.push(['setInstanceRuntime', instanceId]); },            
            /**
 * listInstanceRuntimes：读取Instance运行态并返回结果。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

            listInstanceRuntimes() { return [{ meta: { instanceId: 'public:yunlai_town' } }]; },            
            /**
 * listInstanceEntries：读取Instance条目并返回结果。
 * @returns 无返回值，完成Instance条目的读取/组装。
 */

            listInstanceEntries() { return [['public:yunlai_town', { meta: { instanceId: 'public:yunlai_town' } }]]; },            
            /**
 * getInstanceCount：读取Instance数量。
 * @returns 无返回值，完成Instance数量的读取/组装。
 */

            getInstanceCount() { return 1; },
        },
        worldRuntimePersistenceStateService: {        
        /**
 * listDirtyPersistentInstances：读取DirtyPersistentInstance并返回结果。
 * @returns 无返回值，完成DirtyPersistentInstance的读取/组装。
 */

            listDirtyPersistentInstances() { return ['public:yunlai_town']; },            
            /**
 * buildMapPersistenceSnapshot：构建并返回目标对象。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新地图Persistence快照相关状态。
 */

            buildMapPersistenceSnapshot(instanceId) { return { instanceId }; },            
            /**
 * markMapPersisted：判断地图Persisted是否满足条件。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新地图Persisted相关状态。
 */

            markMapPersisted(instanceId) { log.push(['markMapPersisted', instanceId]); },
        },
        worldRuntimeFrameService: {        
        /**
 * tickAll：执行tickAll相关逻辑。
 * @returns 无返回值，直接更新tickAll相关状态。
 */

            tickAll() { log.push(['tickAll']); return 1; },            
            /**
 * advanceFrame：执行advance帧相关逻辑。
 * @param _deps 参数说明。
 * @param frameDurationMs 参数说明。
 * @returns 无返回值，直接更新advance帧相关状态。
 */

            advanceFrame(_deps, frameDurationMs) { log.push(['advanceFrame', frameDurationMs]); return { frameDurationMs }; },            
            /**
 * recordSyncFlushDuration：处理record同步刷新耗时并更新相关状态。
 * @param durationMs 参数说明。
 * @returns 无返回值，直接更新recordSyncFlushDuration相关状态。
 */

            recordSyncFlushDuration(durationMs) { log.push(['recordSyncFlushDuration', durationMs]); },
        },
        worldRuntimeLifecycleService: {        
        /**
 * bootstrapPublicInstances：执行引导PublicInstance相关逻辑。
 * @returns 无返回值，直接更新bootstrapPublicInstance相关状态。
 */

            bootstrapPublicInstances() { log.push(['bootstrapPublicInstances']); },            
            /**
 * restorePublicInstancePersistence：判断restorePublicInstancePersistence是否满足条件。
 * @returns 无返回值，直接更新restorePublicInstancePersistence相关状态。
 */

            async restorePublicInstancePersistence() { log.push(['restorePublicInstancePersistence']); },            
            /**
 * rebuildPersistentRuntimeAfterRestore：判断rebuildPersistent运行态AfterRestore是否满足条件。
 * @returns 无返回值，直接更新rebuildPersistent运行态AfterRestore相关状态。
 */

            async rebuildPersistentRuntimeAfterRestore() { log.push(['rebuildPersistentRuntimeAfterRestore']); },
        },
    };

    service.enqueuePendingCommand('player:1', { kind: 'move' }, deps);
    assert.deepEqual(service.getPendingCommand('player:1', deps), { kind: 'move' });
    assert.equal(service.hasPendingCommand('player:1', deps), true);
    service.clearPendingCommand('player:1', deps);
    assert.equal(service.getPendingCommandCount(deps), 2);
    assert.deepEqual(service.getPlayerLocation('player:1', deps), { instanceId: 'public:yunlai_town' });
    service.setPlayerLocation('player:1', { instanceId: 'public:yunlai_town' }, deps);
    service.clearPlayerLocation('player:1', deps);
    assert.equal(service.getPlayerLocationCount(deps), 3);
    assert.deepEqual(service.listConnectedPlayerIds(deps), ['player:1', 'player:2']);
    assert.deepEqual(service.getInstanceRuntime('public:yunlai_town', deps), { meta: { instanceId: 'public:yunlai_town' } });
    service.setInstanceRuntime('public:yunlai_town', { meta: { instanceId: 'public:yunlai_town' } }, deps);
    assert.equal(service.listInstanceRuntimes(deps).length, 1);
    assert.equal(service.listInstanceEntries(deps).length, 1);
    assert.equal(service.getInstanceCount(deps), 1);
    assert.deepEqual(service.listDirtyPersistentInstances(deps), ['public:yunlai_town']);
    assert.deepEqual(service.buildMapPersistenceSnapshot('public:yunlai_town', deps), { instanceId: 'public:yunlai_town' });
    service.markMapPersisted('public:yunlai_town', deps);
    assert.equal(service.tickAll(deps), 1);
    assert.deepEqual(service.advanceFrame(1000, null, deps), { frameDurationMs: 1000 });
    service.recordSyncFlushDuration(12, deps);
    service.bootstrapPublicInstances(deps);
    await service.restorePublicInstancePersistence(deps);
    await service.rebuildPersistentRuntimeAfterRestore(deps);
}

testStateFacade().then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-state-facade' }, null, 2));
});
