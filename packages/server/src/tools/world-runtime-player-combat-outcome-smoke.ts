// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePlayerCombatOutcomeService } = require("../runtime/world/world-runtime-player-combat-outcome.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(log = []) {
    return new WorldRuntimePlayerCombatOutcomeService({    
    /**
 * dispatchDamagePlayer：判断Damage玩家是否满足条件。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

        dispatchDamagePlayer(playerId, amount, deps) {
            log.push(['dispatchDamagePlayer', playerId, amount, deps.marker]);
        },        
        /**
 * handlePlayerMonsterKill：处理玩家怪物Kill并更新相关状态。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家怪物Kill相关状态。
 */

        handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
            log.push(['handlePlayerMonsterKill', instance.meta.instanceId, monster.runtimeId, killerPlayerId, deps.marker]);
        },        
        /**
 * handlePlayerDefeat：处理玩家Defeat并更新相关状态。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家Defeat相关状态。
 */

        handlePlayerDefeat(playerId, deps) {
            log.push(['handlePlayerDefeat', playerId, deps.marker]);
        },
    }, {    
    /**
 * processPendingRespawns：处理待处理重生并更新相关状态。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Pending重生相关状态。
 */

        processPendingRespawns(deps) {
            log.push(['processPendingRespawns', deps.marker]);
        },        
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

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
    });
    return { promise, resolve, reject };
}
/**
 * testOutcomeDelegations：执行testOutcomeDelegation相关逻辑。
 * @returns 无返回值，直接更新testOutcomeDelegation相关状态。
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

async function testOutcomeAwaitHandlers() {
    const log = [];
    const service = createService(log);
    const monsterKillDeferred = createDeferred();
    const defeatDeferred = createDeferred();
    service.worldRuntimePlayerCombatService.handlePlayerMonsterKill = async (instance, monster, killerPlayerId, deps) => {
        log.push(['handlePlayerMonsterKill', instance.meta.instanceId, monster.runtimeId, killerPlayerId, deps.marker]);
        await monsterKillDeferred.promise;
        log.push(['handlePlayerMonsterKill:resolved', instance.meta.instanceId, monster.runtimeId, killerPlayerId, deps.marker]);
    };
    service.worldRuntimePlayerCombatService.handlePlayerDefeat = async (playerId, deps, killerPlayerId = null) => {
        log.push(['handlePlayerDefeat', playerId, deps.marker, killerPlayerId]);
        await defeatDeferred.promise;
        log.push(['handlePlayerDefeat:resolved', playerId, deps.marker, killerPlayerId]);
    };
    const deps = { marker: 'deps' };

    const pendingMonsterKill = service.handlePlayerMonsterKill({ meta: { instanceId: 'public:a' } }, { runtimeId: 'monster:1' }, 'player:1', deps);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['handlePlayerMonsterKill', 'public:a', 'monster:1', 'player:1', 'deps'],
    ]);
    monsterKillDeferred.resolve();
    await pendingMonsterKill;

    const pendingDefeat = service.handlePlayerDefeat('player:1', deps, 'player:2');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['handlePlayerMonsterKill', 'public:a', 'monster:1', 'player:1', 'deps'],
        ['handlePlayerMonsterKill:resolved', 'public:a', 'monster:1', 'player:1', 'deps'],
        ['handlePlayerDefeat', 'player:1', 'deps', 'player:2'],
    ]);
    defeatDeferred.resolve();
    await pendingDefeat;
    assert.deepEqual(log, [
        ['handlePlayerMonsterKill', 'public:a', 'monster:1', 'player:1', 'deps'],
        ['handlePlayerMonsterKill:resolved', 'public:a', 'monster:1', 'player:1', 'deps'],
        ['handlePlayerDefeat', 'player:1', 'deps', 'player:2'],
        ['handlePlayerDefeat:resolved', 'player:1', 'deps', 'player:2'],
    ]);
}

Promise.resolve()
    .then(() => testOutcomeDelegations())
    .then(() => testOutcomeAwaitHandlers())
    .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-player-combat-outcome' }, null, 2));
});
