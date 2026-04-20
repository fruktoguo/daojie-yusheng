// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeInstanceTickOrchestrationService } = require("../runtime/world/world-runtime-instance-tick-orchestration.service");
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createDeps(log) {
    const progress = new Map([['instance:1', 0]]);
    const instanceRuntimes = new Map([['instance:1', {
        meta: { instanceId: 'instance:1' },
        template: { id: 'yunlai_town' },
        tick: 3,        
        /**
 * tickOnce：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        tickOnce() {
            log.push('instance.tickOnce');
            return { transfers: [{ id: 'transfer:1' }], monsterActions: [{ id: 'action:1' }] };
        },        
        /**
 * listPlayerIds：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        listPlayerIds() {
            log.push('instance.listPlayerIds');
            return ['player:1'];
        },
    }]]);
    return {
        tick: 0,        
        /**
 * listInstanceRuntimes：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        listInstanceRuntimes() { return instanceRuntimes.values(); },        
        /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntime(instanceId) { return instanceRuntimes.get(instanceId) ?? null; },        
        /**
 * listConnectedPlayerIds：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        listConnectedPlayerIds() { return ['player:1'].values(); },        
        /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerLocation(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (playerId !== 'player:1') {
                return null;
            }
            return { instanceId: 'instance:1', sessionId: 'session:1' };
        },
        worldRuntimeCombatEffectsService: {        
        /**
 * resetFrameEffects：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 resetFrameEffects() { log.push('resetFrameEffects'); } },
        worldRuntimeTickProgressService: {        
        /**
 * getProgress：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

            getProgress(instanceId) { log.push(`getProgress:${instanceId}`); return progress.get(instanceId) ?? 0; },            
            /**
 * setProgress：更新/写入相关状态。
 * @param instanceId instance ID。
 * @param value 参数说明。
 * @returns 函数返回值。
 */

            setProgress(instanceId, value) { log.push(`setProgress:${instanceId}`); progress.set(instanceId, value); },
        },
        worldRuntimeMetricsService: {
            idleCalled: false,
            frameCalled: false,            
            /**
 * recordIdleFrame：执行核心业务逻辑。
 * @returns 函数返回值。
 */

            recordIdleFrame() { log.push('recordIdleFrame'); this.idleCalled = true; },            
            /**
 * recordFrameResult：执行核心业务逻辑。
 * @param _startedAt 参数说明。
 * @param durations 参数说明。
 * @returns 函数返回值。
 */

            recordFrameResult(_startedAt, durations) { log.push('recordFrameResult'); this.frameCalled = true; this.durations = durations; },
        },        
        /**
 * processPendingRespawns：处理事件并驱动执行路径。
 * @returns 函数返回值。
 */

        processPendingRespawns() { log.push('processPendingRespawns'); },        
        /**
 * materializeNavigationCommands：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        materializeNavigationCommands() { log.push('materializeNavigationCommands'); },        
        /**
 * materializeAutoCombatCommands：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        materializeAutoCombatCommands() { log.push('materializeAutoCombatCommands'); },        
        /**
 * dispatchPendingCommands：处理事件并驱动执行路径。
 * @returns 函数返回值。
 */

        dispatchPendingCommands() { log.push('dispatchPendingCommands'); },        
        /**
 * dispatchPendingSystemCommands：处理事件并驱动执行路径。
 * @returns 函数返回值。
 */

        dispatchPendingSystemCommands() { log.push('dispatchPendingSystemCommands'); },
        worldRuntimeNavigationService: {        
        /**
 * getBlockedPlayerIds：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */
 getBlockedPlayerIds() { log.push('getBlockedPlayerIds'); return new Set(['player:block']); } },        
 /**
 * applyTransfer：更新/写入相关状态。
 * @returns 函数返回值。
 */

        applyTransfer() { log.push('applyTransfer'); },        
        /**
 * applyMonsterAction：更新/写入相关状态。
 * @returns 函数返回值。
 */

        applyMonsterAction() { log.push('applyMonsterAction'); },
        playerRuntimeService: {        
        /**
 * advanceTickForPlayerIds：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 advanceTickForPlayerIds() { log.push('advanceTickForPlayerIds'); } },
        worldRuntimeCraftTickService: {        
        /**
 * advanceCraftJobs：执行核心业务逻辑。
 * @returns 函数返回值。
 */
 advanceCraftJobs() { log.push('advanceCraftJobs'); } },
        worldRuntimeLootContainerService: {        
        /**
 * advanceContainerSearches：执行核心业务逻辑。
 * @param instanceAccess 参数说明。
 * @param playerLocationIndex 参数说明。
 * @returns 函数返回值。
 */

            advanceContainerSearches(instanceAccess, playerLocationIndex) {
                assert.equal(typeof instanceAccess.getInstanceRuntime, 'function');
                assert.equal(instanceAccess.getInstanceRuntime('instance:1'), instanceRuntimes.get('instance:1'));
                assert.equal(typeof playerLocationIndex.listConnectedPlayerIds, 'function');
                assert.equal(typeof playerLocationIndex.getPlayerLocation, 'function');
                assert.deepEqual(Array.from(playerLocationIndex.listConnectedPlayerIds()), ['player:1']);
                assert.deepEqual(playerLocationIndex.getPlayerLocation('player:1'), { instanceId: 'instance:1', sessionId: 'session:1' });
                log.push('advanceContainerSearches');
            },
        },        
        /**
 * refreshQuestStates：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        refreshQuestStates(playerId) { log.push(`refreshQuestStates:${playerId}`); },
    };
}
/**
 * verifyNormalPath：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function verifyNormalPath() {
    const log = [];
    const deps = createDeps(log);
    const service = new WorldRuntimeInstanceTickOrchestrationService();
    const ticks = service.advanceFrame(deps, 1000, null);
    assert.equal(ticks, 1);
    assert.equal(deps.tick, 1);
    assert.equal(deps.worldRuntimeMetricsService.frameCalled, true);
    assert.equal(deps.worldRuntimeMetricsService.idleCalled, false);
    assert.deepEqual(log, [
        'resetFrameEffects',
        'getProgress:instance:1',
        'setProgress:instance:1',
        'processPendingRespawns',
        'materializeNavigationCommands',
        'materializeAutoCombatCommands',
        'dispatchPendingCommands',
        'dispatchPendingSystemCommands',
        'getBlockedPlayerIds',
        'instance.tickOnce',
        'applyTransfer',
        'applyMonsterAction',
        'instance.listPlayerIds',
        'advanceTickForPlayerIds',
        'advanceCraftJobs',
        'advanceContainerSearches',
        'refreshQuestStates:player:1',
        'recordFrameResult',
    ]);
}
/**
 * verifyZeroTickPath：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function verifyZeroTickPath() {
    const log = [];
    const deps = createDeps(log);
    deps.worldRuntimeTickProgressService.getProgress = () => 0;
    const service = new WorldRuntimeInstanceTickOrchestrationService();
    const ticks = service.advanceFrame(deps, 0, null);
    assert.equal(ticks, 0);
    assert.equal(deps.worldRuntimeMetricsService.idleCalled, true);
    assert.equal(deps.worldRuntimeMetricsService.frameCalled, false);
    assert.deepEqual(log, ['resetFrameEffects', 'setProgress:instance:1', 'recordIdleFrame']);
}

verifyNormalPath();
verifyZeroTickPath();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-instance-tick-orchestration' }, null, 2));
