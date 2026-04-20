// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeGmSystemCommandService } = require("../runtime/world/world-runtime-gm-system-command.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createService(log = []) {
    return new WorldRuntimeGmSystemCommandService({    
    /**
 * dispatchGmUpdatePlayer：处理事件并驱动执行路径。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        dispatchGmUpdatePlayer(command, deps) {
            log.push(['dispatchGmUpdatePlayer', command.kind, typeof deps.resolveDefaultRespawnMapId, typeof deps.getOrCreatePublicInstance]);
        },        
        /**
 * dispatchGmSpawnBots：处理事件并驱动执行路径。
 * @param anchorPlayerId anchorPlayer ID。
 * @param count 数量。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        dispatchGmSpawnBots(anchorPlayerId, count, deps) {
            log.push(['dispatchGmSpawnBots', anchorPlayerId, count, typeof deps.connectPlayer]);
        },        
        /**
 * dispatchGmRemoveBots：处理事件并驱动执行路径。
 * @param playerIds player ID 集合。
 * @param all 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        dispatchGmRemoveBots(playerIds, all, deps) {
            log.push(['dispatchGmRemoveBots', playerIds, all, typeof deps.removePlayer]);
        },
    }, {    
    /**
 * respawnPlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        respawnPlayer(playerId, deps) {
            log.push(['respawnPlayer', playerId, deps.marker]);
        },
    });
}
/**
 * createDeps：构建并返回目标对象。
 * @returns 函数返回值。
 */


function createDeps() {
    return {
        marker: 'deps',
        playerRuntimeService: {},        
        /**
 * resolveDefaultRespawnMapId：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        resolveDefaultRespawnMapId() { return 'yunlai_town'; },        
        /**
 * getOrCreatePublicInstance：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getOrCreatePublicInstance() { return null; },        
        /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerLocation() { return null; },        
        /**
 * setPlayerLocation：更新/写入相关状态。
 * @returns 函数返回值。
 */

        setPlayerLocation() {},        
        /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getInstanceRuntime() { return null; },        
        /**
 * getPlayerViewOrThrow：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPlayerViewOrThrow() { return null; },        
        /**
 * refreshPlayerContextActions：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        refreshPlayerContextActions() {},        
        /**
 * resolveCurrentTickForPlayerId：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        resolveCurrentTickForPlayerId() { return 0; },        
        /**
 * connectPlayer：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        connectPlayer() {},        
        /**
 * removePlayer：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        removePlayer() {},
    };
}
/**
 * testDispatchesKnownCommands：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDispatchesKnownCommands() {
    const log = [];
    const service = createService(log);
    const deps = createDeps();
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmUpdatePlayer', playerId: 'player:1' }, deps), true);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmResetPlayer', playerId: 'player:2' }, deps), true);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmSpawnBots', anchorPlayerId: 'player:3', count: 2 }, deps), true);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'gmRemoveBots', playerIds: ['bot:1'], all: false }, deps), true);
    assert.deepEqual(log, [
        ['dispatchGmUpdatePlayer', 'gmUpdatePlayer', 'function', 'function'],
        ['respawnPlayer', 'player:2', 'deps'],
        ['dispatchGmSpawnBots', 'player:3', 2, 'function'],
        ['dispatchGmRemoveBots', ['bot:1'], false, 'function'],
    ]);
}
/**
 * testIgnoreUnknownCommand：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testIgnoreUnknownCommand() {
    const service = createService([]);
    assert.equal(service.dispatchGmSystemCommand({ kind: 'damagePlayer', playerId: 'player:1', amount: 1 }, createDeps()), false);
}

testDispatchesKnownCommands();
testIgnoreUnknownCommand();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-gm-system-command' }, null, 2));
