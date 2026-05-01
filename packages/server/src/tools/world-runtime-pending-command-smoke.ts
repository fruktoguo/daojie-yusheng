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


async function testDispatchRoutesAndClearsQueue() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', { kind: 'move', direction: 'east' });
    service.enqueuePendingCommand('player:2', { kind: 'basicAttack', targetPlayerId: null, targetMonsterId: 'monster:2', targetX: null, targetY: null });
    service.enqueuePendingCommand('player:3', { kind: 'portal' });
    await service.dispatchPendingCommands({    
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

async function testAsyncPlayerCommandIsAwaitedBeforeQueueClear() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    let resolvePlayerCommand = () => {};
    service.enqueuePendingCommand('player:1', { kind: 'startAlchemy', payload: { presetId: 'p1' } });
    const pendingDispatch = service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand(playerId, command) {
            log.push(['dispatchPlayerCommand', playerId, command.kind]);
            return new Promise((resolve) => {
                resolvePlayerCommand = () => {
                    log.push(['dispatchPlayerCommand:resolved', playerId, command.kind]);
                    resolve(undefined);
                };
            });
        },
        logger: {
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(log, [
        ['dispatchPlayerCommand', 'player:1', 'startAlchemy'],
    ]);
    assert.equal(service.getPendingCommandCount(), 1);
    resolvePlayerCommand();
    await pendingDispatch;
    assert.deepEqual(log, [
        ['dispatchPlayerCommand', 'player:1', 'startAlchemy'],
        ['dispatchPlayerCommand:resolved', 'player:1', 'startAlchemy'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testAutoCombatStaleTargetRetriesImmediately() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    const player = {
        playerId: 'player:1',
        instanceId: 'public:yunlai_town',
        hp: 100,
        combat: {
            autoBattle: true,
        },
    };
    service.enqueuePendingCommand('player:1', {
        kind: 'basicAttack',
        targetPlayerId: null,
        targetMonsterId: 'monster:stale',
        targetX: null,
        targetY: null,
        autoCombat: true,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand(playerId, command) {
            log.push(['dispatchInstanceCommand', playerId, command.kind, command.direction ?? null]);
        },
        dispatchPlayerCommand(playerId, command) {
            log.push(['dispatchPlayerCommand', playerId, command.kind, command.targetMonsterId ?? null]);
            if (command.targetMonsterId === 'monster:stale') {
                throw new Error('Monster monster:stale not found');
            }
        },
        buildAutoCombatCommand(instance, runtimePlayer) {
            log.push(['buildAutoCombatCommand', instance.meta.instanceId, runtimePlayer.playerId]);
            return {
                kind: 'move',
                direction: 'east',
                continuous: false,
                maxSteps: 1,
                autoCombat: true,
            };
        },
        getInstanceRuntime(instanceId) {
            assert.equal(instanceId, 'public:yunlai_town');
            return {
                meta: {
                    instanceId,
                },
            };
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                return playerId === player.playerId ? player : null;
            },
        },
        logger: {
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['dispatchPlayerCommand', 'player:1', 'basicAttack', 'monster:stale'],
        ['buildAutoCombatCommand', 'public:yunlai_town', 'player:1'],
        ['dispatchInstanceCommand', 'player:1', 'move', 'east'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testAutoCombatFailedSkillFallsBackToAlternativeCommand() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    const player = {
        playerId: 'player:1',
        instanceId: 'public:yunlai_town',
        hp: 100,
        combat: {
            autoBattle: true,
        },
    };
    service.enqueuePendingCommand('player:1', {
        kind: 'castSkill',
        skillId: 'skill:expensive',
        targetPlayerId: null,
        targetMonsterId: 'monster:1',
        targetRef: null,
        autoCombat: true,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand(playerId, command) {
            log.push([
                'dispatchPlayerCommand',
                playerId,
                command.kind,
                command.kind === 'castSkill' ? command.skillId : (command.targetMonsterId ?? null),
            ]);
            if (command.kind === 'castSkill' && command.skillId === 'skill:expensive') {
                throw new Error('Skill skill:expensive qi insufficient');
            }
        },
        buildAutoCombatCommand(instance, runtimePlayer, options) {
            const excludedSkillIds = [...(options?.excludedSkillIds ?? [])].sort();
            log.push(['buildAutoCombatCommand', instance.meta.instanceId, runtimePlayer.playerId, excludedSkillIds.join(',')]);
            assert.deepEqual(excludedSkillIds, ['skill:expensive']);
            return {
                kind: 'basicAttack',
                targetPlayerId: null,
                targetMonsterId: 'monster:1',
                targetX: null,
                targetY: null,
                autoCombat: true,
            };
        },
        getInstanceRuntime(instanceId) {
            assert.equal(instanceId, 'public:yunlai_town');
            return {
                meta: {
                    instanceId,
                },
            };
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                return playerId === player.playerId ? player : null;
            },
        },
        logger: {
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['dispatchPlayerCommand', 'player:1', 'castSkill', 'skill:expensive'],
        ['buildAutoCombatCommand', 'public:yunlai_town', 'player:1', 'skill:expensive'],
        ['dispatchPlayerCommand', 'player:1', 'basicAttack', 'monster:1'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testManualEngageAttackClearsServerOnlyEngageState() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'basicAttack',
        targetPlayerId: null,
        targetMonsterId: 'monster:1',
        targetX: null,
        targetY: null,
        manualEngage: true,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand(playerId, command) {
            log.push(['dispatchPlayerCommand', playerId, command.kind, command.targetMonsterId ?? null]);
        },
        resolveCurrentTickForPlayerId(playerId) {
            log.push(['resolveCurrentTickForPlayerId', playerId]);
            return 17;
        },
        playerRuntimeService: {
            clearManualEngagePending(playerId) {
                log.push(['clearManualEngagePending', playerId]);
            },
            clearCombatTarget(playerId, currentTick) {
                log.push(['clearCombatTarget', playerId, currentTick]);
            },
        },
        logger: {
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['dispatchPlayerCommand', 'player:1', 'basicAttack', 'monster:1'],
        ['resolveCurrentTickForPlayerId', 'player:1'],
        ['clearManualEngagePending', 'player:1'],
        ['clearCombatTarget', 'player:1', 17],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testInvalidAttackNoticeUsesTargetReason() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'basicAttack',
        targetPlayerId: null,
        targetMonsterId: null,
        targetX: 10,
        targetY: 11,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error('该目标无法被攻击');
        },
        logger: {
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['warn', '处理玩家 player:1 的待执行指令失败：basicAttack（该目标无法被攻击）'],
        ['queuePlayerNotice', 'player:1', '没有可命中的目标', 'warn'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testAutoCombatInvalidTargetStaysServerInternal() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'basicAttack',
        targetPlayerId: null,
        targetMonsterId: null,
        targetX: 10,
        targetY: 11,
        autoCombat: true,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error('该目标无法被攻击');
        },
        buildAutoCombatCommand() {
            return null;
        },
        getInstanceRuntime() {
            return null;
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                return {
                    playerId,
                    instanceId: 'public:yunlai_town',
                    hp: 100,
                    combat: {
                        autoBattle: true,
                    },
                };
            },
            clearManualEngagePending(playerId) {
                log.push(['clearManualEngagePending', playerId]);
            },
            updateCombatSettings() {
                throw new Error('updateCombatSettings should not run for auto-combat target failure');
            },
            clearCombatTarget(playerId, currentTick) {
                log.push(['clearCombatTarget', playerId, currentTick]);
            },
        },
        logger: {
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['clearManualEngagePending', 'player:1'],
        ['clearCombatTarget', 'player:1', 0],
        ['warn', '处理玩家 player:1 的待执行指令失败：basicAttack（该目标无法被攻击）'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);

    const skillService = new WorldRuntimePendingCommandService();
    const skillLog = [];
    skillService.enqueuePendingCommand('player:1', {
        kind: 'castSkill',
        skillId: 'skill:area',
        targetPlayerId: null,
        targetMonsterId: 'monster:gone',
        targetRef: null,
        autoCombat: true,
    });
    await skillService.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error('没有可命中的目标');
        },
        buildAutoCombatCommand() {
            return null;
        },
        getInstanceRuntime() {
            return null;
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                return {
                    playerId,
                    instanceId: 'public:yunlai_town',
                    hp: 100,
                    combat: {
                        autoBattle: true,
                    },
                };
            },
            clearManualEngagePending(playerId) {
                skillLog.push(['clearManualEngagePending', playerId]);
            },
            updateCombatSettings() {
                throw new Error('updateCombatSettings should not run for auto-combat target failure');
            },
            clearCombatTarget(playerId, currentTick) {
                skillLog.push(['clearCombatTarget', playerId, currentTick]);
            },
        },
        logger: {
            warn(message) {
                skillLog.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            skillLog.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(skillLog, [
        ['clearManualEngagePending', 'player:1'],
        ['clearCombatTarget', 'player:1', 0],
        ['warn', '处理玩家 player:1 的待执行指令失败：castSkill（没有可命中的目标）'],
    ]);
    assert.equal(skillService.getPendingCommandCount(), 0);
}

async function testSkillOutOfRangeStaysServerInternal() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'castSkill',
        skillId: 'skill.liyan_duanxi',
        targetPlayerId: null,
        targetMonsterId: 'monster:1',
        targetRef: null,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error('Skill skill.liyan_duanxi out of range');
        },
        logger: {
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['warn', '处理玩家 player:1 的待执行指令失败：castSkill（Skill skill.liyan_duanxi out of range）'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testInternalSliceErrorStaysServerInternal() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'castSkill',
        skillId: 'skill.baihong_duanyue',
        targetPlayerId: null,
        targetMonsterId: 'monster:1',
        targetRef: null,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error("Cannot read properties of undefined (reading 'slice')");
        },
        logger: {
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ["warn", "处理玩家 player:1 的待执行指令失败：castSkill（Cannot read properties of undefined (reading 'slice')）"],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

testQueueOwnershipMethods();
Promise.resolve()
    .then(() => testDispatchRoutesAndClearsQueue())
    .then(() => testAsyncPlayerCommandIsAwaitedBeforeQueueClear())
    .then(() => testAutoCombatStaleTargetRetriesImmediately())
    .then(() => testAutoCombatFailedSkillFallsBackToAlternativeCommand())
    .then(() => testManualEngageAttackClearsServerOnlyEngageState())
    .then(() => testInvalidAttackNoticeUsesTargetReason())
    .then(() => testAutoCombatInvalidTargetStaysServerInternal())
    .then(() => testSkillOutOfRangeStaysServerInternal())
    .then(() => testInternalSliceErrorStaysServerInternal())
    .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-pending-command' }, null, 2));
});
