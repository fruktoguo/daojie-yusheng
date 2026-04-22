// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeGmSystemCommandService } = require("../runtime/world/world-runtime-gm-system-command.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(log = []) {
    return new WorldRuntimeGmSystemCommandService({    
    /**
 * dispatchGmUpdatePlayer：判断GMUpdate玩家是否满足条件。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMUpdate玩家相关状态。
 */

        dispatchGmUpdatePlayer(command, deps) {
            log.push([
                'dispatchGmUpdatePlayer',
                command.kind,
                command.playerId,
                command.instanceId ?? '',
                typeof deps.resolveDefaultRespawnMapId,
                typeof deps.getOrCreatePublicInstance,
                typeof deps.getInstanceRuntime,
            ]);
        },        
        /**
 * dispatchGmSpawnBots：判断GMSpawnBot是否满足条件。
 * @param anchorPlayerId anchorPlayer ID。
 * @param count 数量。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMSpawnBot相关状态。
 */

        dispatchGmSpawnBots(anchorPlayerId, count, deps) {
            log.push(['dispatchGmSpawnBots', anchorPlayerId, count, typeof deps.connectPlayer]);
        },        
        /**
 * dispatchGmRemoveBots：判断GMRemoveBot是否满足条件。
 * @param playerIds player ID 集合。
 * @param all 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMRemoveBot相关状态。
 */

        dispatchGmRemoveBots(playerIds, all, deps) {
            log.push(['dispatchGmRemoveBots', playerIds, all, typeof deps.removePlayer]);
        },
    }, {    
    /**
 * respawnPlayer：执行重生玩家相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新重生玩家相关状态。
 */

        respawnPlayer(playerId, deps) {
            log.push(['respawnPlayer', playerId, deps.marker]);
        },
    });
}
/**
 * createDeps：构建并返回目标对象。
 * @returns 无返回值，直接更新Dep相关状态。
 */


function createDeps() {
    return {
        marker: 'deps',
        playerRuntimeService: {},        
        /**
 * resolveDefaultRespawnMapId：规范化或转换默认重生地图ID。
 * @returns 无返回值，直接更新Default重生地图ID相关状态。
 */

        resolveDefaultRespawnMapId() { return 'yunlai_town'; },        
        /**
 * getOrCreatePublicInstance：读取OrCreatePublicInstance。
 * @returns 无返回值，完成OrCreatePublicInstance的读取/组装。
 */

        getOrCreatePublicInstance() { return null; },        
        /**
 * getPlayerLocation：读取玩家位置。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

        getPlayerLocation() { return null; },        
        /**
 * setPlayerLocation：写入玩家位置。
 * @returns 无返回值，直接更新玩家位置相关状态。
 */

        setPlayerLocation() {},        
        /**
 * getInstanceRuntime：读取Instance运行态。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

        getInstanceRuntime() { return null; },        
        /**
 * getPlayerViewOrThrow：读取玩家视图OrThrow。
 * @returns 无返回值，完成玩家视图OrThrow的读取/组装。
 */

        getPlayerViewOrThrow() { return null; },        
        /**
 * refreshPlayerContextActions：执行refresh玩家上下文Action相关逻辑。
 * @returns 无返回值，直接更新refresh玩家上下文Action相关状态。
 */

        refreshPlayerContextActions() {},        
        /**
 * resolveCurrentTickForPlayerId：规范化或转换当前tickFor玩家ID。
 * @returns 无返回值，直接更新CurrenttickFor玩家ID相关状态。
 */

        resolveCurrentTickForPlayerId() { return 0; },        
        /**
 * worldRuntimePlayerSessionService：提供运行态玩家会话 facade。
 * @returns 无返回值，直接更新connect玩家相关状态。
 */
        worldRuntimePlayerSessionService: {
            connectPlayer() {},
            removePlayer() {},
        },
    };
}
/**
 * testDispatchesKnownCommands：判断testDispatcheKnownCommand是否满足条件。
 * @returns 无返回值，直接更新testDispatcheKnownCommand相关状态。
 */


function testDispatchesKnownCommands() {
    const log = [];
    const service = createService(log);
    const deps = createDeps();
    assert.equal(service.dispatchGmSystemCommand({
        kind: 'gmUpdatePlayer',
        playerId: 'player:1',
        instanceId: 'real:yunlai_town',
    }, deps), true);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmResetPlayer', playerId: 'player:2' }, deps), true);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmSpawnBots', anchorPlayerId: 'player:3', count: 2 }, deps), true);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmRemoveBots', playerIds: ['bot:1'], all: false }, deps), true);
    assert.deepEqual(log, [
        ['dispatchGmUpdatePlayer', 'gmUpdatePlayer', 'player:1', 'real:yunlai_town', 'function', 'function', 'function'],
        ['respawnPlayer', 'player:2', 'deps'],
        ['dispatchGmSpawnBots', 'player:3', 2, 'function'],
        ['dispatchGmRemoveBots', ['bot:1'], false, 'function'],
    ]);
}
/**
 * testIgnoreUnknownCommand：执行testIgnoreUnknownCommand相关逻辑。
 * @returns 无返回值，直接更新testIgnoreUnknownCommand相关状态。
 */


function testIgnoreUnknownCommand() {
    const service = createService([]);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'damagePlayer', playerId: 'player:1', amount: 1 }, createDeps()), false);
}

testDispatchesKnownCommands();
testIgnoreUnknownCommand();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-gm-system-command' }, null, 2));
