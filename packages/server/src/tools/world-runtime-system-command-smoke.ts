// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeSystemCommandService } = require("../runtime/world/world-runtime-system-command.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createService(log = []) {
    return new WorldRuntimeSystemCommandService({    
    /**
 * getPendingSystemCommandCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

        getPendingSystemCommandCount() {
            return 4;
        },        
        /**
 * drainPendingSystemCommands：执行核心业务逻辑。
 * @returns 函数返回值。
 */

        drainPendingSystemCommands() {
            return [
                { kind: 'spawnMonsterLoot', instanceId: 'public:a', x: 1, y: 2, monsterId: 'monster:a', rolls: 3 },
                { kind: 'damagePlayer', playerId: 'player:1', amount: 9 },
                { kind: 'gmUpdatePlayer', playerId: 'player:2' },
                { kind: 'gmRemoveBots', playerIds: ['bot:1'], all: false },
            ];
        },
    }, {    
    /**
 * dispatchSpawnMonsterLoot：处理事件并驱动执行路径。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param monsterId monster ID。
 * @param rolls 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, deps) {
            log.push(['spawnMonsterLoot', instanceId, x, y, monsterId, rolls, deps.marker]);
        },        
        /**
 * dispatchDamageMonster：处理事件并驱动执行路径。
 * @returns 函数返回值。
 */

        dispatchDamageMonster() {
            log.push(['damageMonster']);
        },        
        /**
 * dispatchDefeatMonster：处理事件并驱动执行路径。
 * @returns 函数返回值。
 */

        dispatchDefeatMonster() {
            log.push(['defeatMonster']);
        },
    }, {    
    /**
 * dispatchDamagePlayer：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        dispatchDamagePlayer(playerId, amount, deps) {
            log.push(['damagePlayer', playerId, amount, deps.marker]);
        },        
        /**
 * respawnPlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        respawnPlayer(playerId, deps) {
            log.push(['respawnPlayer', playerId, deps.marker]);
        },
    }, {    
    /**
 * dispatchGmSystemCommand：处理事件并驱动执行路径。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        dispatchGmSystemCommand(command, deps) {
            log.push(['gmSystem', command.kind, deps.marker]);
            return true;
        },
    });
}
/**
 * testDispatchPendingSystemCommands：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDispatchPendingSystemCommands() {
    const log = [];
    const service = createService(log);
    service.dispatchPendingSystemCommands({ marker: 'deps' });
    assert.deepEqual(log, [
        ['spawnMonsterLoot', 'public:a', 1, 2, 'monster:a', 3, 'deps'],
        ['damagePlayer', 'player:1', 9, 'deps'],
        ['gmSystem', 'gmUpdatePlayer', 'deps'],
        ['gmSystem', 'gmRemoveBots', 'deps'],
    ]);
}
/**
 * testDispatchSystemCommandRoutes：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testDispatchSystemCommandRoutes() {
    const log = [];
    const service = createService(log);
    const deps = { marker: 'routeDeps' };
    service.dispatchSystemCommand({ kind: 'respawnPlayer', playerId: 'player:7' }, deps);
    service.dispatchSystemCommand({ kind: 'gmResetPlayer', playerId: 'player:8' }, deps);
    assert.deepEqual(log, [
        ['respawnPlayer', 'player:7', 'routeDeps'],
        ['gmSystem', 'gmResetPlayer', 'routeDeps'],
    ]);
}

testDispatchPendingSystemCommands();
testDispatchSystemCommandRoutes();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-system-command' }, null, 2));
