// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeStateFacadeService } = require("../runtime/world/world-runtime-state-facade.service");
/**
 * testStateFacade：执行核心业务逻辑。
 * @returns 函数返回值。
 */


async function testStateFacade() {
    const service = new WorldRuntimeStateFacadeService();
    const log = [];
    const deps = {
        worldRuntimePendingCommandService: {        
        /**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

            enqueuePendingCommand(playerId, command) { log.push(['enqueuePendingCommand', playerId, command.kind]); },            
            /**
 * getPendingCommand：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            getPendingCommand(playerId) { return playerId === 'player:1' ? { kind: 'move' } : null; },            
            /**
 * hasPendingCommand：执行状态校验并返回判断结果。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            hasPendingCommand(playerId) { return playerId === 'player:1'; },            
            /**
 * clearPendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            clearPendingCommand(playerId) { log.push(['clearPendingCommand', playerId]); },            
            /**
 * getPendingCommandCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getPendingCommandCount() { return 2; },
        },
        worldRuntimePlayerLocationService: {        
        /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            getPlayerLocation(playerId) { return playerId === 'player:1' ? { instanceId: 'public:yunlai_town' } : null; },            
            /**
 * setPlayerLocation：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 函数返回值。
 */

            setPlayerLocation(playerId, location) { log.push(['setPlayerLocation', playerId, location.instanceId]); },            
            /**
 * clearPlayerLocation：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

            clearPlayerLocation(playerId) { log.push(['clearPlayerLocation', playerId]); },            
            /**
 * getPlayerLocationCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getPlayerLocationCount() { return 3; },            
            /**
 * listConnectedPlayerIds：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            listConnectedPlayerIds() { return ['player:1', 'player:2']; },
        },
        worldRuntimeInstanceStateService: {        
        /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

            getInstanceRuntime(instanceId) { return instanceId === 'public:yunlai_town' ? { meta: { instanceId } } : null; },            
            /**
 * setInstanceRuntime：更新/写入相关状态。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

            setInstanceRuntime(instanceId) { log.push(['setInstanceRuntime', instanceId]); },            
            /**
 * listInstanceRuntimes：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            listInstanceRuntimes() { return [{ meta: { instanceId: 'public:yunlai_town' } }]; },            
            /**
 * listInstanceEntries：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            listInstanceEntries() { return [['public:yunlai_town', { meta: { instanceId: 'public:yunlai_town' } }]]; },            
            /**
 * getInstanceCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

            getInstanceCount() { return 1; },
        },
        worldRuntimePersistenceStateService: {        
        /**
 * listDirtyPersistentInstances：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            listDirtyPersistentInstances() { return ['public:yunlai_town']; },            
            /**
 * buildMapPersistenceSnapshot：构建并返回目标对象。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

            buildMapPersistenceSnapshot(instanceId) { return { instanceId }; },            
            /**
 * markMapPersisted：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

            markMapPersisted(instanceId) { log.push(['markMapPersisted', instanceId]); },
        },
        worldRuntimeFrameService: {        
        /**
 * tickAll：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            tickAll() { log.push(['tickAll']); return 1; },            
            /**
 * advanceFrame：执行核心业务逻辑。
 * @param _deps 参数说明。
 * @param frameDurationMs 参数说明。
 * @returns 函数返回值。
 */

            advanceFrame(_deps, frameDurationMs) { log.push(['advanceFrame', frameDurationMs]); return { frameDurationMs }; },            
            /**
 * recordSyncFlushDuration：执行核心业务逻辑。
 * @param durationMs 参数说明。
 * @returns 函数返回值。
 */

            recordSyncFlushDuration(durationMs) { log.push(['recordSyncFlushDuration', durationMs]); },
        },
        worldRuntimeLifecycleService: {        
        /**
 * bootstrapPublicInstances：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            bootstrapPublicInstances() { log.push(['bootstrapPublicInstances']); },            
            /**
 * restorePublicInstancePersistence：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            async restorePublicInstancePersistence() { log.push(['restorePublicInstancePersistence']); },            
            /**
 * rebuildPersistentRuntimeAfterRestore：执行核心业务逻辑。
 * @returns 函数返回值。
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
