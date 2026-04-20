// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePendingCommandService } = require("../runtime/world/world-runtime-pending-command.service");
/**
 * testQueueOwnershipMethods：执行testQueueOwnershipMethod相关逻辑。
 * @returns 无返回值，直接更新testQueueOwnershipMethod相关状态。
 */


function testQueueOwnershipMethods() {
    const service = new WorldRuntimePendingCommandService();
    service.enqueuePendingCommand('player:1', { kind: 'move', direction: 'east' });
    service.enqueuePendingCommand('player:1', { kind: 'portal' });
    service.enqueuePendingCommand('player:2', { kind: 'basicAttack', targetPlayerId: null, targetMonsterId: 'monster:1', targetX: null, targetY: null });
    assert.equal(service.hasPendingCommand('player:1'), true);
    assert.deepEqual(service.getPendingCommand('player:1'), { kind: 'portal' });
    assert.equal(service.getPendingCommandCount(), 2);
    service.clearPendingCommand('player:2');
    assert.equal(service.hasPendingCommand('player:2'), false);
    assert.equal(service.getPendingCommandCount(), 1);
}
/**
 * testDispatchRoutesAndClearsQueue：判断testDispatch路线AndClearQueue是否满足条件。
 * @returns 无返回值，直接更新testDispatch路线AndClearQueue相关状态。
 */


function testDispatchRoutesAndClearsQueue() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', { kind: 'move', direction: 'east' });
    service.enqueuePendingCommand('player:2', { kind: 'basicAttack', targetPlayerId: null, targetMonsterId: 'monster:2', targetX: null, targetY: null });
    service.enqueuePendingCommand('player:3', { kind: 'portal' });
    service.dispatchPendingCommands({    
    /**
 * dispatchInstanceCommand：判断InstanceCommand是否满足条件。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新InstanceCommand相关状态。
 */

        dispatchInstanceCommand(playerId, command) {
            log.push(['dispatchInstanceCommand', playerId, command.kind]);
        },        
        /**
 * dispatchPlayerCommand：判断玩家Command是否满足条件。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新玩家Command相关状态。
 */

        dispatchPlayerCommand(playerId, command) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            if (playerId === 'player:2') {
                throw new Error('boom');
            }
            log.push(['dispatchPlayerCommand', playerId, command.kind]);
        },
        logger: {        
        /**
 * warn：执行warn相关逻辑。
 * @param message 参数说明。
 * @returns 无返回值，直接更新warn相关状态。
 */

            warn(message) {
                log.push(['warn', message]);
            },
        },        
        /**
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param message 参数说明。
 * @param tone 参数说明。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
 */

        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['dispatchInstanceCommand', 'player:1', 'move'],
        ['warn', '处理玩家 player:2 的待执行指令失败：basicAttack（boom）'],
        ['queuePlayerNotice', 'player:2', 'boom', 'warn'],
        ['dispatchInstanceCommand', 'player:3', 'portal'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

testQueueOwnershipMethods();
testDispatchRoutesAndClearsQueue();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-pending-command' }, null, 2));
