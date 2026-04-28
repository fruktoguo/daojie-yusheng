// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeSystemCommandService } = require("../runtime/world/world-runtime-system-command.service");
/**
 * createService：构建并返回目标对象。
 * @param log 参数说明。
 * @returns 无返回值，直接更新服务相关状态。
 */


function createService(log = []) {
    return new WorldRuntimeSystemCommandService({    
    /**
 * getPendingSystemCommandCount：读取待处理SystemCommand数量。
 * @returns 无返回值，完成PendingSystemCommand数量的读取/组装。
 */

        getPendingSystemCommandCount() {
            return 4;
        },        
        /**
 * drainPendingSystemCommands：执行drain待处理SystemCommand相关逻辑。
 * @returns 无返回值，直接更新drainPendingSystemCommand相关状态。
 */

        drainPendingSystemCommands() {
            return [
                { kind: 'spawnMonsterLoot', instanceId: 'public:a', x: 1, y: 2, monsterId: 'monster:a', rolls: 3 },
                { kind: 'damagePlayer', playerId: 'player:1', amount: 9 },
                { kind: 'gmUpdatePlayer', playerId: 'player:2', instanceId: 'real:yunlai_town' },
                { kind: 'gmRemoveBots', playerIds: ['bot:1'], all: false },
            ];
        },
    }, {    
    /**
 * dispatchSpawnMonsterLoot：判断Spawn怪物掉落是否满足条件。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param monsterId monster ID。
 * @param rolls 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Spawn怪物掉落相关状态。
 */

        dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, deps) {
            log.push(['spawnMonsterLoot', instanceId, x, y, monsterId, rolls, deps.marker]);
        },        
        /**
 * dispatchDamageMonster：判断Damage怪物是否满足条件。
 * @returns 无返回值，直接更新Damage怪物相关状态。
 */

        dispatchDamageMonster() {
            log.push(['damageMonster']);
        },        
        /**
 * dispatchDefeatMonster：判断Defeat怪物是否满足条件。
 * @returns 无返回值，直接更新Defeat怪物相关状态。
 */

        dispatchDefeatMonster() {
            log.push(['defeatMonster']);
        },
    }, {    
    /**
 * dispatchDamagePlayer：判断Damage玩家是否满足条件。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

        dispatchDamagePlayer(playerId, amount, deps) {
            log.push(['damagePlayer', playerId, amount, deps.marker]);
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
    }, {    
    /**
 * dispatchGmSystemCommand：判断GMSystemCommand是否满足条件。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMSystemCommand相关状态。
 */

        dispatchGmSystemCommand(command, deps) {
            log.push(['gmSystem', command.kind, command.instanceId ?? '', deps.marker]);
            return true;
        },
    });
}
/**
 * testDispatchPendingSystemCommands：判断testDispatch待处理SystemCommand是否满足条件。
 * @returns 无返回值，直接更新testDispatchPendingSystemCommand相关状态。
 */


function testDispatchPendingSystemCommands() {
    const log = [];
    const service = createService(log);
    service.dispatchPendingSystemCommands({ marker: 'deps' });
    assert.deepEqual(log, [
        ['spawnMonsterLoot', 'public:a', 1, 2, 'monster:a', 3, 'deps'],
        ['damagePlayer', 'player:1', 9, 'deps'],
        ['gmSystem', 'gmUpdatePlayer', 'real:yunlai_town', 'deps'],
        ['gmSystem', 'gmRemoveBots', '', 'deps'],
    ]);
}
/**
 * testDispatchSystemCommandRoutes：判断testDispatchSystemCommand路线是否满足条件。
 * @returns 无返回值，直接更新testDispatchSystemCommand路线相关状态。
 */


function testDispatchSystemCommandRoutes() {
    const log = [];
    const service = createService(log);
    const deps = { marker: 'routeDeps' };
    service.dispatchSystemCommand({ kind: 'respawnPlayer', playerId: 'player:7' }, deps);
    service.dispatchSystemCommand({ kind: 'gmResetPlayer', playerId: 'player:8' }, deps);
    service.dispatchSystemCommand({ kind: 'gmUpdatePlayer', playerId: 'player:9', instanceId: 'line:yunlai_town:real:2' }, deps);
    assert.deepEqual(log, [
        ['respawnPlayer', 'player:7', 'routeDeps'],
        ['gmSystem', 'gmResetPlayer', '', 'routeDeps'],
        ['gmSystem', 'gmUpdatePlayer', 'line:yunlai_town:real:2', 'routeDeps'],
    ]);
}
/**
 * testReturnToSpawnStartsCooldown：验证遁返成功后写入固定冷却。
 * @returns 无返回值，直接更新测试状态。
 */


function testReturnToSpawnStartsCooldown() {
    const log = [];
    const service = createService(log);
    const player = { combat: { cooldownReadyTickBySkillId: {} } };
    service.dispatchSystemCommand({ kind: 'returnToSpawn', playerId: 'player:10' }, {
        marker: 'returnDeps',
        playerRuntimeService: {
            getPlayerOrThrow(playerId) {
                log.push(['getPlayerOrThrow', playerId]);
                return player;
            },
            setSkillCooldownReadyTick(playerId, actionId, readyTick, currentTick) {
                log.push(['setSkillCooldownReadyTick', playerId, actionId, readyTick, currentTick]);
            },
        },
        resolveCurrentTickForPlayerId() {
            return 20;
        },
    });
    assert.deepEqual(log, [
        ['getPlayerOrThrow', 'player:10'],
        ['respawnPlayer', 'player:10', 'returnDeps'],
        ['setSkillCooldownReadyTick', 'player:10', 'travel:return_spawn', 1820, 20],
    ]);
}
/**
 * testReturnToSpawnHonorsCooldown：验证遁返冷却未好时不再次执行。
 * @returns 无返回值，直接更新测试状态。
 */


function testReturnToSpawnHonorsCooldown() {
    const log = [];
    const service = createService(log);
    const player = { combat: { cooldownReadyTickBySkillId: { 'travel:return_spawn': 50 } } };
    service.dispatchSystemCommand({ kind: 'returnToSpawn', playerId: 'player:11' }, {
        marker: 'returnDeps',
        playerRuntimeService: {
            getPlayerOrThrow(playerId) {
                log.push(['getPlayerOrThrow', playerId]);
                return player;
            },
            rebuildActionState(inputPlayer, currentTick) {
                log.push(['rebuildActionState', inputPlayer === player, currentTick]);
            },
        },
        resolveCurrentTickForPlayerId() {
            return 20;
        },
        queuePlayerNotice(playerId, text, kind) {
            log.push(['queuePlayerNotice', playerId, text, kind]);
        },
    });
    assert.deepEqual(log, [
        ['getPlayerOrThrow', 'player:11'],
        ['queuePlayerNotice', 'player:11', '行动尚在调息中，还需 30 息', 'system'],
        ['rebuildActionState', true, 20],
    ]);
}

testDispatchPendingSystemCommands();
testDispatchSystemCommandRoutes();
testReturnToSpawnStartsCooldown();
testReturnToSpawnHonorsCooldown();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-system-command' }, null, 2));
