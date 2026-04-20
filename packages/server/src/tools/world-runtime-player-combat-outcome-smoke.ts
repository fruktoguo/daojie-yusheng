// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePlayerCombatOutcomeService } = require("../runtime/world/world-runtime-player-combat-outcome.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 函数返回值。
 */


function createService(log = []) {
    return new WorldRuntimePlayerCombatOutcomeService({    
    /**
 * dispatchDamagePlayer：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        dispatchDamagePlayer(playerId, amount, deps) {
            log.push(['dispatchDamagePlayer', playerId, amount, deps.marker]);
        },        
        /**
 * handlePlayerMonsterKill：处理事件并驱动执行路径。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
            log.push(['handlePlayerMonsterKill', instance.meta.instanceId, monster.runtimeId, killerPlayerId, deps.marker]);
        },        
        /**
 * handlePlayerDefeat：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        handlePlayerDefeat(playerId, deps) {
            log.push(['handlePlayerDefeat', playerId, deps.marker]);
        },
    }, {    
    /**
 * processPendingRespawns：处理事件并驱动执行路径。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

        processPendingRespawns(deps) {
            log.push(['processPendingRespawns', deps.marker]);
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
    });
}
/**
 * testOutcomeDelegations：执行核心业务逻辑。
 * @returns 函数返回值。
 */


function testOutcomeDelegations() {
    const log = [];
    const service = createService(log);
    const deps = { marker: 'deps' };
    service.dispatchDamagePlayer('player:1', 12, deps);
    service.handlePlayerMonsterKill({ meta: { instanceId: 'public:a' } }, { runtimeId: 'monster:1' }, 'player:1', deps);
    service.handlePlayerDefeat('player:1', deps);
    service.processPendingRespawns(deps);
    service.respawnPlayer('player:1', deps);
    assert.deepEqual(log, [
        ['dispatchDamagePlayer', 'player:1', 12, 'deps'],
        ['handlePlayerMonsterKill', 'public:a', 'monster:1', 'player:1', 'deps'],
        ['handlePlayerDefeat', 'player:1', 'deps'],
        ['processPendingRespawns', 'deps'],
        ['respawnPlayer', 'player:1', 'deps'],
    ]);
}

testOutcomeDelegations();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-combat-outcome' }, null, 2));
