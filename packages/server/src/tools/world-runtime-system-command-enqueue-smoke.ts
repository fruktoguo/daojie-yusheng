// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeSystemCommandEnqueueService } = require("../runtime/world/world-runtime-system-command-enqueue.service");
/**
 * createQueue：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createQueue(log = []) {
    return {    
    /**
 * enqueueSystemCommand：执行核心业务逻辑。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

        enqueueSystemCommand(command) {
            log.push(['enqueueSystemCommand', command]);
            return { queued: true };
        },        
        /**
 * enqueueGmUpdatePlayer：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

        enqueueGmUpdatePlayer(input) {
            log.push(['enqueueGmUpdatePlayer', input]);
            return { queued: true };
        },        
        /**
 * enqueueGmResetPlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        enqueueGmResetPlayer(playerId) {
            log.push(['enqueueGmResetPlayer', playerId]);
            return { queued: true };
        },        
        /**
 * enqueueGmSpawnBots：执行核心业务逻辑。
 * @param anchorPlayerId anchorPlayer ID。
 * @param count 数量。
 * @returns 函数返回值。
 */

        enqueueGmSpawnBots(anchorPlayerId, count) {
            log.push(['enqueueGmSpawnBots', anchorPlayerId, count]);
            return { queued: true };
        },        
        /**
 * enqueueGmRemoveBots：执行核心业务逻辑。
 * @param playerIds player ID 集合。
 * @param all 参数说明。
 * @returns 函数返回值。
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
 * @returns 函数返回值。
 */


function createDeps(log = []) {
    return {    
    /**
 * getInstanceRuntimeOrThrow：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

        getInstanceRuntimeOrThrow(instanceId) {
            log.push(['getInstanceRuntimeOrThrow', instanceId]);
            return { meta: { instanceId } };
        },        
        /**
 * getPlayerLocationOrThrow：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

        getPlayerLocationOrThrow(playerId) {
            log.push(['getPlayerLocationOrThrow', playerId]);
            return { playerId };
        },
    };
}
/**
 * testSpawnMonsterLootQueue：执行核心业务逻辑。
 * @returns 函数返回值。
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
 * testDamagePlayerQueue：执行核心业务逻辑。
 * @returns 函数返回值。
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
 * testGmDelegations：执行核心业务逻辑。
 * @returns 函数返回值。
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
