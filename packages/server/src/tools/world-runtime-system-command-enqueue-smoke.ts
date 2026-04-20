// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeSystemCommandEnqueueService } = require("../runtime/world/world-runtime-system-command-enqueue.service");
/**
 * createQueue：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新Queue相关状态。
 */


function createQueue(log = []) {
    return {    
    /**
 * enqueueSystemCommand：处理SystemCommand并更新相关状态。
 * @param command 输入指令。
 * @returns 无返回值，直接更新SystemCommand相关状态。
 */

        enqueueSystemCommand(command) {
            log.push(['enqueueSystemCommand', command]);
            return { queued: true };
        },        
        /**
 * enqueueGmUpdatePlayer：处理GMUpdate玩家并更新相关状态。
 * @param input 输入参数。
 * @returns 无返回值，直接更新GMUpdate玩家相关状态。
 */

        enqueueGmUpdatePlayer(input) {
            log.push(['enqueueGmUpdatePlayer', input]);
            return { queued: true };
        },        
        /**
 * enqueueGmResetPlayer：处理GMReset玩家并更新相关状态。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新GMReset玩家相关状态。
 */

        enqueueGmResetPlayer(playerId) {
            log.push(['enqueueGmResetPlayer', playerId]);
            return { queued: true };
        },        
        /**
 * enqueueGmSpawnBots：处理GMSpawnBot并更新相关状态。
 * @param anchorPlayerId anchorPlayer ID。
 * @param count 数量。
 * @returns 无返回值，直接更新GMSpawnBot相关状态。
 */

        enqueueGmSpawnBots(anchorPlayerId, count) {
            log.push(['enqueueGmSpawnBots', anchorPlayerId, count]);
            return { queued: true };
        },        
        /**
 * enqueueGmRemoveBots：处理GMRemoveBot并更新相关状态。
 * @param playerIds player ID 集合。
 * @param all 参数说明。
 * @returns 无返回值，直接更新GMRemoveBot相关状态。
 */

        enqueueGmRemoveBots(playerIds, all) {
            log.push(['enqueueGmRemoveBots', playerIds, all]);
            return { queued: true };
        },
    };
}
/**
 * createDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新Dep相关状态。
 */


function createDeps(log = []) {
    return {    
    /**
 * getInstanceRuntimeOrThrow：读取Instance运行态OrThrow。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态OrThrow的读取/组装。
 */

        getInstanceRuntimeOrThrow(instanceId) {
            log.push(['getInstanceRuntimeOrThrow', instanceId]);
            return { meta: { instanceId } };
        },        
        /**
 * getPlayerLocationOrThrow：读取玩家位置OrThrow。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置OrThrow的读取/组装。
 */

        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { playerId };
        },
    };
}
/**
 * testSpawnMonsterLootQueue：执行testSpawn怪物掉落Queue相关逻辑。
 * @returns 无返回值，直接更新testSpawn怪物掉落Queue相关状态。
 */


function testSpawnMonsterLootQueue() {
    const log = [];
    const queue = createQueue(log);
    const deps = createDeps(log);
    const service = new WorldRuntimeSystemCommandEnqueueService(queue);
    const result = service.enqueueSpawnMonsterLoot(' public:alpha ', ' monster.a ', 4.8, 7.2, 3.9, deps);
    assert.deepEqual(result, { queued: true });
    assert.deepEqual(log, [
        ['getInstanceRuntimeOrThrow', 'public:alpha'],
        ['enqueueSystemCommand', {
            kind: 'spawnMonsterLoot',
            instanceId: 'public:alpha',
            monsterId: 'monster.a',
            x: 4,
            y: 7,
            rolls: 3,
        }],
    ]);
}
/**
 * testDamagePlayerQueue：执行testDamage玩家Queue相关逻辑。
 * @returns 无返回值，直接更新testDamage玩家Queue相关状态。
 */


function testDamagePlayerQueue() {
    const log = [];
    const queue = createQueue(log);
    const deps = createDeps(log);
    const service = new WorldRuntimeSystemCommandEnqueueService(queue);
    service.enqueueDamagePlayer(' player:1 ', 5.9, deps);
    assert.deepEqual(log, [
        ['getPlayerLocationOrThrow', 'player:1'],
        ['enqueueSystemCommand', {
            kind: 'damagePlayer',
            playerId: 'player:1',
            amount: 5,
        }],
    ]);
}
/**
 * testGmDelegations：执行testGMDelegation相关逻辑。
 * @returns 无返回值，直接更新testGMDelegation相关状态。
 */


function testGmDelegations() {
    const log = [];
    const queue = createQueue(log);
    const service = new WorldRuntimeSystemCommandEnqueueService(queue);
    service.enqueueGmUpdatePlayer({ playerId: 'player:1' });
    service.enqueueGmResetPlayer('player:2');
    service.enqueueGmSpawnBots('player:3', 4);
    service.enqueueGmRemoveBots(['bot:1'], true);
    assert.deepEqual(log, [
        ['enqueueGmUpdatePlayer', { playerId: 'player:1' }],
        ['enqueueGmResetPlayer', 'player:2'],
        ['enqueueGmSpawnBots', 'player:3', 4],
        ['enqueueGmRemoveBots', ['bot:1'], true],
    ]);
}

testSpawnMonsterLootQueue();
testDamagePlayerQueue();
testGmDelegations();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-system-command-enqueue' }, null, 2));
