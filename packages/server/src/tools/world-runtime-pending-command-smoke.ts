// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimePendingCommandService } = require("../runtime/world/command/world-runtime-pending-command.service");
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
        ['warn', '处理玩家 player:2 的待执行指令失败：basicAttack（boom） debug=auto=0 manual=0 playerState=missing'],
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
        displayName: '青衫客',
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
        displayName: '青衫客',
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

async function testAutoCombatRetryFailureLogsRetryCommandDebug() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    const player = {
        playerId: 'player:1',
        displayName: '青衫客',
        instanceId: 'public:yunlai_town',
        hp: 100,
        x: 43,
        y: 56,
        techniques: {
            techniques: [{
                skills: [{
                    id: 'skill.qingmu_sword',
                    name: '青木剑诀',
                    range: 2,
                    effects: [{ type: 'damage', formula: 1 }],
                }],
            }],
        },
        combat: {
            autoBattle: true,
            combatTargetId: 'monster:far',
        },
    };
    service.enqueuePendingCommand('player:1', {
        kind: 'castSkill',
        skillId: 'skill.qingmu_sword',
        targetPlayerId: null,
        targetMonsterId: null,
        targetRef: 'player:target:1',
        autoCombat: true,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand(playerId, command) {
            log.push(['dispatchPlayerCommand', playerId, command.kind, command.skillId ?? command.targetMonsterId ?? command.targetRef ?? null]);
            if (command.kind === 'castSkill') {
                throw new Error('技能 skill.qingmu_sword 元气不足');
            }
            throw new Error('目标超出攻击距离');
        },
        buildAutoCombatCommand(instance, runtimePlayer, options) {
            const excludedSkillIds = [...(options?.excludedSkillIds ?? [])].sort();
            log.push(['buildAutoCombatCommand', instance.meta.instanceId, runtimePlayer.playerId, excludedSkillIds.join(',')]);
            return {
                kind: 'basicAttack',
                targetPlayerId: null,
                targetMonsterId: 'monster:far',
                targetX: null,
                targetY: null,
                autoCombat: true,
            };
        },
        getInstanceRuntime(instanceId) {
            return {
                meta: { instanceId },
                getMonster(monsterId) {
                    return monsterId === 'monster:far'
                        ? { runtimeId: monsterId, x: 99, y: 1, alive: true }
                        : null;
                },
            };
        },
        resolveCurrentTickForPlayerId() {
            return 0;
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                if (playerId === 'player:1') {
                    return player;
                }
                if (playerId === 'target:1') {
                    return {
                        playerId,
                        instanceId: 'public:yunlai_town',
                        hp: 100,
                        x: 44,
                        y: 57,
                        combat: {},
                    };
                }
                return null;
            },
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
        ['dispatchPlayerCommand', 'player:1', 'castSkill', 'skill.qingmu_sword'],
        ['buildAutoCombatCommand', 'public:yunlai_town', 'player:1', 'skill.qingmu_sword'],
        ['dispatchPlayerCommand', 'player:1', 'basicAttack', 'monster:far'],
        ['clearManualEngagePending', 'player:1'],
        ['clearCombatTarget', 'player:1', 0],
        ['warn', '处理玩家 player:1 的待执行指令失败：basicAttack（目标超出攻击距离） debug=auto=1 manual=0 playerName=青衫客 instance=public:yunlai_town playerPos=43,56 target=monster:far targetKind=monster targetPos=99,1 distance=56 combatTarget=monster:far combatTargetLocked=0 retryOf=castSkill'],
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
            log(message) {
                log.push(['log', message]);
            },
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['log', '处理玩家 player:1 的待执行指令失败：basicAttack（该目标无法被攻击） debug=auto=0 manual=0 playerState=missing'],
        ['queuePlayerNotice', 'player:1', '没有可命中的目标', 'warn'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testMoveToUnreachableFailureUsesLogWhenAvailable() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'moveTo',
        x: 99,
        y: 99,
        allowNearestReachable: false,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error('无法到达该位置');
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                assert.equal(playerId, 'player:1');
                return {
                    playerId: 'player:1',
                    name: '妖',
                    instanceId: 'real:cold_tide_marsh',
                    x: 23,
                    y: 37,
                };
            },
        },
        logger: {
            log(message) {
                log.push(['log', message]);
            },
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['log', '处理玩家 player:1 的待执行指令失败：moveTo（无法到达该位置） debug=auto=0 manual=0 playerName=妖 instance=real:cold_tide_marsh playerPos=23,37'],
        ['queuePlayerNotice', 'player:1', '无法到达该位置', 'warn'],
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
        ['warn', '处理玩家 player:1 的待执行指令失败：basicAttack（该目标无法被攻击） debug=auto=1 manual=0 instance=public:yunlai_town playerPos=unknown target=tile:10:11 targetKind=tile targetPos=10,11'],
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
        ['warn', '处理玩家 player:1 的待执行指令失败：castSkill（没有可命中的目标） debug=auto=1 manual=0 skill=skill:area instance=public:yunlai_town playerPos=unknown target=monster:gone targetKind=unknown targetPos=unknown'],
    ]);
    assert.equal(skillService.getPendingCommandCount(), 0);
}

async function testAutoCombatRetaliateFailurePreservesDifferentLockedTarget() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'basicAttack',
        targetPlayerId: 'attacker',
        targetMonsterId: null,
        targetX: null,
        targetY: null,
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
                        combatTargetId: 'tile:2:1',
                        combatTargetLocked: true,
                    },
                };
            },
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
        ['clearManualEngagePending', 'player:1'],
        ['warn', '处理玩家 player:1 的待执行指令失败：basicAttack（该目标无法被攻击） debug=auto=1 manual=0 instance=public:yunlai_town playerPos=unknown target=player:attacker targetKind=player targetPos=unknown combatTarget=tile:2:1 combatTargetLocked=1'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testAutoCombatOutOfRangeClearsTargetWithoutNotice() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'castSkill',
        skillId: 'skill:area',
        targetPlayerId: null,
        targetMonsterId: 'monster:far',
        targetRef: null,
        autoCombat: true,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error('技能 skill:area 超出范围');
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
                    x: 1,
                    y: 1,
                    techniques: {
                        techniques: [{
                            skills: [{
                                id: 'skill:area',
                                name: '地火术',
                                range: 3,
                                effects: [{ type: 'damage', formula: 1 }],
                            }],
                        }],
                    },
                    combat: {
                        autoBattle: false,
                        combatTargetId: 'monster:far',
                    },
                };
            },
            clearManualEngagePending(playerId) {
                log.push(['clearManualEngagePending', playerId]);
            },
            clearCombatTarget(playerId, currentTick) {
                log.push(['clearCombatTarget', playerId, currentTick]);
            },
        },
        getInstanceRuntime(instanceId) {
            assert.equal(instanceId, 'public:yunlai_town');
            return {
                getMonster(runtimeId) {
                    assert.equal(runtimeId, 'monster:far');
                    return {
                        runtimeId,
                        x: 7,
                        y: 2,
                        hp: 100,
                        alive: true,
                    };
                },
            };
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
        ['warn', '处理玩家 player:1 的待执行指令失败：castSkill（技能 skill:area 超出范围） debug=auto=1 manual=0 skill=skill:area skillName=地火术 skillRange=3 instance=public:yunlai_town playerPos=1,1 target=monster:far targetKind=monster targetPos=7,2 distance=6 combatTarget=monster:far combatTargetLocked=0'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testAutoCombatPlayerOutOfRangeClearsRetaliateAndThreatTarget() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'castSkill',
        skillId: 'skill.cloud_blade',
        targetPlayerId: null,
        targetMonsterId: null,
        targetRef: 'player:target:1',
        autoCombat: true,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error('目标超出攻击距离');
        },
        buildAutoCombatCommand() {
            return null;
        },
        getInstanceRuntime() {
            return null;
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                if (playerId === 'player:1') {
                    return {
                        playerId,
                        instanceId: 'public:yunlai_town',
                        hp: 100,
                        x: 43,
                        y: 56,
                        techniques: {
                            techniques: [{
                                skills: [{
                                    id: 'skill.cloud_blade',
                                    name: '流云刀谱',
                                    range: 3,
                                    effects: [{ type: 'damage', formula: 1 }],
                                }],
                            }],
                        },
                        combat: {
                            autoBattle: false,
                            retaliatePlayerTargetId: 'target:1',
                            combatTargetId: 'player:target:1',
                        },
                    };
                }
                if (playerId === 'target:1') {
                    return {
                        playerId,
                        instanceId: 'public:yunlai_town',
                        hp: 100,
                        x: 99,
                        y: 1,
                        combat: {},
                    };
                }
                return null;
            },
            clearManualEngagePending(playerId) {
                log.push(['clearManualEngagePending', playerId]);
            },
            clearRetaliatePlayerTargetIfMatches(playerId, targetPlayerId, currentTick) {
                log.push(['clearRetaliatePlayerTargetIfMatches', playerId, targetPlayerId, currentTick]);
            },
            clearCombatTarget(playerId, currentTick) {
                log.push(['clearCombatTarget', playerId, currentTick]);
            },
        },
        worldRuntimeThreatService: {
            buildPlayerOwnerId(playerId) {
                log.push(['buildPlayerOwnerId', playerId]);
                return `player:${playerId}`;
            },
            multiplyThreat(ownerId, targetRef, multiplier) {
                log.push(['multiplyThreat', ownerId, targetRef, multiplier]);
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
        ['clearRetaliatePlayerTargetIfMatches', 'player:1', 'target:1', 0],
        ['buildPlayerOwnerId', 'player:1'],
        ['multiplyThreat', 'player:player:1', 'player:target:1', 0],
        ['clearCombatTarget', 'player:1', 0],
        ['warn', '处理玩家 player:1 的待执行指令失败：castSkill（目标超出攻击距离） debug=auto=1 manual=0 skill=skill.cloud_blade skillName=流云刀谱 skillRange=3 instance=public:yunlai_town playerPos=43,56 target=player:target:1 targetKind=player targetPos=99,1 distance=56 combatTarget=player:target:1 combatTargetLocked=0'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testAutoCombatPlayerPvpDisabledClearsTargetWithoutNotice() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'basicAttack',
        targetPlayerId: 'target:1',
        targetMonsterId: null,
        targetX: null,
        targetY: null,
        autoCombat: true,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error('当前实例不允许玩家互攻');
        },
        buildAutoCombatCommand() {
            return null;
        },
        getInstanceRuntime() {
            return null;
        },
        playerRuntimeService: {
            getPlayer(playerId) {
                if (playerId === 'player:1') {
                    return {
                        playerId,
                        instanceId: 'public:yunlai_town',
                        hp: 100,
                        x: 43,
                        y: 56,
                        combat: {
                            autoBattle: true,
                            retaliatePlayerTargetId: 'target:1',
                            combatTargetId: 'player:target:1',
                        },
                    };
                }
                if (playerId === 'target:1') {
                    return {
                        playerId,
                        instanceId: 'public:yunlai_town',
                        hp: 100,
                        x: 44,
                        y: 57,
                        combat: {},
                    };
                }
                return null;
            },
            clearManualEngagePending(playerId) {
                log.push(['clearManualEngagePending', playerId]);
            },
            clearRetaliatePlayerTargetIfMatches(playerId, targetPlayerId, currentTick) {
                log.push(['clearRetaliatePlayerTargetIfMatches', playerId, targetPlayerId, currentTick]);
            },
            clearCombatTarget(playerId, currentTick) {
                log.push(['clearCombatTarget', playerId, currentTick]);
            },
        },
        worldRuntimeThreatService: {
            buildPlayerOwnerId(playerId) {
                log.push(['buildPlayerOwnerId', playerId]);
                return `player:${playerId}`;
            },
            multiplyThreat(ownerId, targetRef, multiplier) {
                log.push(['multiplyThreat', ownerId, targetRef, multiplier]);
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
        ['clearRetaliatePlayerTargetIfMatches', 'player:1', 'target:1', 0],
        ['buildPlayerOwnerId', 'player:1'],
        ['multiplyThreat', 'player:player:1', 'player:target:1', 0],
        ['clearCombatTarget', 'player:1', 0],
        ['warn', '处理玩家 player:1 的待执行指令失败：basicAttack（当前实例不允许玩家互攻） debug=auto=1 manual=0 instance=public:yunlai_town playerPos=43,56 target=player:target:1 targetKind=player targetPos=44,57 distance=1 combatTarget=player:target:1 combatTargetLocked=0'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
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
            log(message) {
                log.push(['log', message]);
            },
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['log', '处理玩家 player:1 的待执行指令失败：castSkill（Skill skill.liyan_duanxi out of range） debug=auto=0 manual=0 skill=skill.liyan_duanxi playerState=missing'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testManualSkillCooldownFailureUsesLogWhenAvailable() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'castSkill',
        skillId: 'skill.iron_bone_art',
        targetPlayerId: null,
        targetMonsterId: null,
        targetRef: null,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error('技能 skill.iron_bone_art 尚在冷却');
        },
        logger: {
            log(message) {
                log.push(['log', message]);
            },
            debug(message) {
                log.push(['debug', message]);
            },
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['log', '处理玩家 player:1 的待执行指令失败：castSkill（技能 skill.iron_bone_art 尚在冷却） debug=auto=0 manual=0 skill=skill.iron_bone_art playerState=missing'],
        ['queuePlayerNotice', 'player:1', '技能 skill.iron_bone_art 尚在冷却', 'warn'],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

async function testManualEngageNoTargetFailureUsesLogWhenAvailable() {
    const service = new WorldRuntimePendingCommandService();
    const log = [];
    service.enqueuePendingCommand('player:1', {
        kind: 'engageBattle',
        targetPlayerId: null,
        targetMonsterId: 'monster:gone',
        targetX: null,
        targetY: null,
        locked: false,
    });
    await service.dispatchPendingCommands({
        dispatchInstanceCommand() {
            throw new Error('unexpected dispatchInstanceCommand');
        },
        dispatchPlayerCommand() {
            throw new Error('没有可命中的目标');
        },
        logger: {
            log(message) {
                log.push(['log', message]);
            },
            debug(message) {
                log.push(['debug', message]);
            },
            warn(message) {
                log.push(['warn', message]);
            },
        },
        queuePlayerNotice(playerId, message, tone) {
            log.push(['queuePlayerNotice', playerId, message, tone]);
        },
    });
    assert.deepEqual(log, [
        ['log', '处理玩家 player:1 的待执行指令失败：engageBattle（没有可命中的目标） debug=auto=0 manual=0 playerState=missing'],
        ['queuePlayerNotice', 'player:1', '没有可命中的目标', 'warn'],
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
        ["warn", "处理玩家 player:1 的待执行指令失败：castSkill（Cannot read properties of undefined (reading 'slice')） debug=auto=0 manual=0 skill=skill.baihong_duanyue playerState=missing"],
    ]);
    assert.equal(service.getPendingCommandCount(), 0);
}

testQueueOwnershipMethods();
Promise.resolve()
    .then(() => testDispatchRoutesAndClearsQueue())
    .then(() => testAsyncPlayerCommandIsAwaitedBeforeQueueClear())
    .then(() => testAutoCombatStaleTargetRetriesImmediately())
    .then(() => testAutoCombatFailedSkillFallsBackToAlternativeCommand())
    .then(() => testAutoCombatRetryFailureLogsRetryCommandDebug())
    .then(() => testManualEngageAttackClearsServerOnlyEngageState())
    .then(() => testInvalidAttackNoticeUsesTargetReason())
    .then(() => testMoveToUnreachableFailureUsesLogWhenAvailable())
    .then(() => testAutoCombatInvalidTargetStaysServerInternal())
    .then(() => testAutoCombatRetaliateFailurePreservesDifferentLockedTarget())
    .then(() => testAutoCombatOutOfRangeClearsTargetWithoutNotice())
    .then(() => testAutoCombatPlayerOutOfRangeClearsRetaliateAndThreatTarget())
    .then(() => testAutoCombatPlayerPvpDisabledClearsTargetWithoutNotice())
    .then(() => testSkillOutOfRangeStaysServerInternal())
    .then(() => testManualSkillCooldownFailureUsesLogWhenAvailable())
    .then(() => testManualEngageNoTargetFailureUsesLogWhenAvailable())
    .then(() => testInternalSliceErrorStaysServerInternal())
    .then(() => {
    console.log(JSON.stringify({ ok: true, case: 'world-runtime-pending-command' }, null, 2));
});
