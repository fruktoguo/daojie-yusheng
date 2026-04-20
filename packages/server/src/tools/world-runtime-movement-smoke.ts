// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeMovementService } = require("../runtime/world/world-runtime-movement.service");
/**
 * buildDeps：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新Dep相关状态。
 */


function buildDeps(log) {
    const playerLocations = new Map([['player:1', { instanceId: 'instance:1', sessionId: 'session:1' }]]);
    const instanceRuntimes = new Map([['instance:1', {    
    /**
 * setPlayerMoveSpeed：写入玩家MoveSpeed。
 * @param playerId 玩家 ID。
 * @param speed 参数说明。
 * @returns 无返回值，直接更新玩家MoveSpeed相关状态。
 */

        setPlayerMoveSpeed(playerId, speed) { log.push(['setPlayerMoveSpeed', playerId, speed]); },        
        /**
 * enqueueMove：处理Move并更新相关状态。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新Move相关状态。
 */

        enqueueMove(payload) { log.push(['enqueueMove', payload]); },        
        /**
 * tryPortalTransfer：执行try传送门Transfer相关逻辑。
 * @param playerId 玩家 ID。
 * @param mode 参数说明。
 * @returns 无返回值，直接更新tryPortalTransfer相关状态。
 */

        tryPortalTransfer(playerId, mode) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

            log.push(['tryPortalTransfer', playerId, mode]);
            if (mode === 'manual_portal') {
                return null;
            }
            return { fromInstanceId: 'instance:1', targetMapId: 'yunlai_town', targetX: 8, targetY: 9, playerId, sessionId: 'session:1', reason: mode };
        },        
        /**
 * enqueuePortalUse：处理传送门Use并更新相关状态。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新PortalUse相关状态。
 */

        enqueuePortalUse(payload) { log.push(['enqueuePortalUse', payload]); },
    }]]);
    return {    
    /**
 * getPlayerLocation：读取玩家位置。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

        getPlayerLocation(playerId) {
            return playerLocations.get(playerId) ?? null;
        },        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime(instanceId) {
            return instanceRuntimes.get(instanceId) ?? null;
        },
        playerRuntimeService: {        
        /**
 * getPlayer：读取玩家。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家的读取/组装。
 */

            getPlayer(playerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

                if (playerId !== 'player:1') return null;
                return { hp: 10, attrs: { numericStats: { moveSpeed: 12 } } };
            },            
            /**
 * recordActivity：执行recordActivity相关逻辑。
 * @param playerId 玩家 ID。
 * @param tick 当前 tick。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新recordActivity相关状态。
 */

            recordActivity(playerId, tick, payload) { log.push(['recordActivity', playerId, tick, payload]); },
        },        
        /**
 * resolveCurrentTickForPlayerId：规范化或转换当前tickFor玩家ID。
 * @returns 无返回值，直接更新CurrenttickFor玩家ID相关状态。
 */

        resolveCurrentTickForPlayerId() { return 33; },
        worldRuntimeCraftInterruptService: {        
        /**
 * interruptCraftForReason：执行interrupt炼制ForReason相关逻辑。
 * @param playerId 玩家 ID。
 * @param _player 参数说明。
 * @param reason 参数说明。
 * @returns 无返回值，直接更新interrupt炼制ForReason相关状态。
 */

            interruptCraftForReason(playerId, _player, reason) { log.push(['interruptCraftForReason', playerId, reason]); },
        },        
        /**
 * applyTransfer：处理Transfer并更新相关状态。
 * @param transfer 参数说明。
 * @returns 无返回值，直接更新Transfer相关状态。
 */

        applyTransfer(transfer) { log.push(['applyTransfer', transfer.reason]); },
    };
}
/**
 * testMoveBranch：执行testMoveBranch相关逻辑。
 * @returns 无返回值，直接更新testMoveBranch相关状态。
 */


function testMoveBranch() {
    const log = [];
    const service = new WorldRuntimeMovementService();
    const deps = buildDeps(log);
    service.dispatchInstanceCommand('player:1', {
        kind: 'move',
        direction: 2,
        continuous: true,
        maxSteps: 3,
        path: [{ x: 1, y: 2 }],
        resetBudget: true,
    }, deps);
    assert.deepEqual(log, [
        ['setPlayerMoveSpeed', 'player:1', 12],
        ['recordActivity', 'player:1', 33, { interruptCultivation: true }],
        ['interruptCraftForReason', 'player:1', 'move'],
        ['enqueueMove', {
            playerId: 'player:1',
            direction: 2,
            continuous: true,
            maxSteps: 3,
            path: [{ x: 1, y: 2 }],
            resetBudget: true,
        }],
    ]);
}
/**
 * testPortalBranch：执行test传送门Branch相关逻辑。
 * @returns 无返回值，直接更新testPortalBranch相关状态。
 */


function testPortalBranch() {
    const log = [];
    const service = new WorldRuntimeMovementService();
    const deps = buildDeps(log);
    service.dispatchInstanceCommand('player:1', { kind: 'portal' }, deps);
    assert.deepEqual(log, [
        ['recordActivity', 'player:1', 33, { interruptCultivation: true }],
        ['interruptCraftForReason', 'player:1', 'move'],
        ['tryPortalTransfer', 'player:1', 'manual_portal'],
        ['tryPortalTransfer', 'player:1', 'auto_portal'],
        ['applyTransfer', 'auto_portal'],
    ]);
}

testMoveBranch();
testPortalBranch();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-movement' }, null, 2));
