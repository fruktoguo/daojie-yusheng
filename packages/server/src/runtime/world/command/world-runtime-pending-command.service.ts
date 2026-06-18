/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Injectable } from '@nestjs/common';
import { findPlayerSkill, resolveRuntimeSkillRange } from '../world-runtime.normalization.helpers';
import { chebyshevDistance } from '../world-runtime.path-planning.helpers';

function isOutOfRangeFailure(message) {
    return message === '目标超出攻击距离'
        || message === '目标超出技能范围'
        || (typeof message === 'string' && /^技能 .+ 超出范围$/.test(message))
        || (typeof message === 'string' && /^Skill .+ out of range$/.test(message));
}

function normalizePendingCommandNoticeMessage(command, message) {
    if (command?.autoCombat === true && command?.manualEngage !== true) {
        if (message === '该目标无法被攻击' || message === '没有可命中的目标' || message === '当前实例不允许玩家互攻' || isOutOfRangeFailure(message)) {
            return null;
        }
    }
    if (message === '该目标无法被攻击') {
        return '没有可命中的目标';
    }
    if (typeof message === 'string' && /^Skill .+ out of range$/.test(message)) {
        return null;
    }
    if (typeof message === 'string' && message.startsWith("Cannot read properties of undefined")) {
        return null;
    }
    return message;
}

function isTerminalAutoCombatTargetFailure(message) {
    return message === '该目标无法被攻击'
        || message === '没有可命中的目标'
        || message === '当前实例不允许玩家互攻'
        || isOutOfRangeFailure(message);
}

function isCooldownFailure(message) {
    return typeof message === 'string' && /^技能 .+ 尚在冷却$/.test(message);
}

function shouldDowngradePendingCommandFailure(command, message) {
    if (command?.autoCombat === true || command?.manualEngage === true) {
        return false;
    }
    return isExpectedPendingCommandReject(command, message);
}

function isExpectedNavigationReject(message) {
    return message === '无法到达该位置'
        || message === '任务目标当前不可达'
        || message === '目标超出地图范围'
        || message === '前往界门的路径不可达'
        || (typeof message === 'string' && /^无法规划前往 .+ 的跨图路线$/.test(message))
        || (typeof message === 'string' && /^当前地图没有通往 .+ 的界门$/.test(message));
}

function isExpectedCombatReject(message) {
    return message === '没有可命中的目标'
        || message === '该目标无法被攻击'
        || message === '正在吟唱中，无法继续施法。'
        || message === '正在吟唱中，无法执行战斗动作。'
        || message === '目标超出攻击距离'
        || message === '目标超出技能范围'
        || message === '目标被遮挡'
        || message === '目标不在同一地图'
        || message === '目标已经死亡'
        || message === '施法者已死亡'
        || isCooldownFailure(message)
        || isOutOfRangeFailure(message)
        || (typeof message === 'string' && /^技能 .+ 元气不足$/.test(message))
        || (typeof message === 'string' && /^玩家 .+ 元气不足$/.test(message));
}

function isExpectedTechniqueActivityReject(message) {
    return message === '学习者已有进行中的技艺任务。'
        || message === '技艺任务队列已满。'
        || message === '当前没有进行中的任务。'
        || message === '没有进行中的传授'
        || (typeof message === 'string' && /^当前没有可取消的.+任务。$/.test(message));
}

function isExpectedPendingCommandReject(command, message) {
    if (command?.kind === 'moveTo') {
        return isExpectedNavigationReject(message);
    }
    if (command?.kind === 'engageBattle'
        || command?.kind === 'basicAttack'
        || command?.kind === 'castSkill') {
        return isExpectedCombatReject(message);
    }
    if (command?.kind === 'startTechniqueTransmission'
        || command?.kind === 'cancelTechniqueTransmission'
        || command?.kind === 'startAlchemy'
        || command?.kind === 'cancelAlchemy'
        || command?.kind === 'startForging'
        || command?.kind === 'cancelForging'
        || command?.kind === 'startEnhancement'
        || command?.kind === 'cancelEnhancement'
        || command?.kind === 'startGather'
        || command?.kind === 'cancelGather'
        || command?.kind === 'startMining'
        || command?.kind === 'cancelMining'
        || command?.kind === 'startBuilding'
        || command?.kind === 'cancelBuilding'
        || command?.kind === 'startFormationMaintenance'
        || command?.kind === 'cancelFormationMaintenance'
        || command?.kind === 'cancelTechniqueActivity') {
        return isExpectedTechniqueActivityReject(message);
    }
    return false;
}

function resolveCommandTargetRef(command) {
    const targetPlayerId = typeof command?.targetPlayerId === 'string' ? command.targetPlayerId.trim() : '';
    if (targetPlayerId) {
        return `player:${targetPlayerId}`;
    }
    const targetMonsterId = typeof command?.targetMonsterId === 'string' ? command.targetMonsterId.trim() : '';
    if (targetMonsterId) {
        return targetMonsterId;
    }
    const targetRef = typeof command?.targetRef === 'string' ? command.targetRef.trim() : '';
    if (targetRef) {
        return targetRef;
    }
    if (Number.isFinite(command?.targetX) && Number.isFinite(command?.targetY)) {
        return `tile:${Math.trunc(command.targetX)}:${Math.trunc(command.targetY)}`;
    }
    return null;
}

function formatCoord(x, y) {
    if (x === null || x === undefined || y === null || y === undefined || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
        return 'unknown';
    }
    return `${Math.trunc(Number(x))},${Math.trunc(Number(y))}`;
}

function formatDiagnosticToken(value) {
    const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, '_') : '';
    return normalized.length > 0 ? normalized.slice(0, 80) : '';
}

function resolvePlayerDiagnosticName(player, playerId) {
    const displayName = formatDiagnosticToken(player?.displayName);
    if (displayName && displayName !== playerId) {
        return displayName;
    }
    const name = formatDiagnosticToken(player?.name);
    if (name && name !== playerId) {
        return name;
    }
    return '';
}

function hasFiniteCoord(x, y) {
    return x !== null && x !== undefined
        && y !== null && y !== undefined
        && Number.isFinite(Number(x))
        && Number.isFinite(Number(y));
}

function resolvePlayerIdFromTargetRef(targetRef) {
    const normalized = typeof targetRef === 'string' ? targetRef.trim() : '';
    return normalized.startsWith('player:') ? normalized.slice('player:'.length).trim() : '';
}

function resolveCommandTargetPosition(command, player, deps) {
    if (Number.isFinite(command?.targetX) && Number.isFinite(command?.targetY)) {
        return { kind: 'tile', ref: resolveCommandTargetRef(command) ?? 'tile', x: Math.trunc(Number(command.targetX)), y: Math.trunc(Number(command.targetY)) };
    }
    const targetPlayerId = typeof command?.targetPlayerId === 'string' ? command.targetPlayerId.trim() : '';
    if (targetPlayerId) {
        const targetPlayer = deps.playerRuntimeService?.getPlayer?.(targetPlayerId);
        return targetPlayer
            ? { kind: 'player', ref: `player:${targetPlayerId}`, x: targetPlayer.x, y: targetPlayer.y }
            : { kind: 'player', ref: `player:${targetPlayerId}`, x: null, y: null };
    }
    const targetRef = resolveCommandTargetRef(command);
    if (!targetRef || !player?.instanceId) {
        return null;
    }
    const targetRefPlayerId = resolvePlayerIdFromTargetRef(targetRef);
    if (targetRefPlayerId) {
        const targetPlayer = deps.playerRuntimeService?.getPlayer?.(targetRefPlayerId);
        return targetPlayer
            ? { kind: 'player', ref: targetRef, x: targetPlayer.x, y: targetPlayer.y }
            : { kind: 'player', ref: targetRef, x: null, y: null };
    }
    const instance = typeof deps.getInstanceRuntime === 'function'
        ? deps.getInstanceRuntime(player.instanceId)
        : null;
    if (!instance) {
        return { kind: 'unknown', ref: targetRef, x: null, y: null };
    }
    const monster = typeof instance.getMonster === 'function' ? instance.getMonster(targetRef) : null;
    if (monster) {
        return { kind: 'monster', ref: targetRef, x: monster.x, y: monster.y };
    }
    const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
        ? deps.worldRuntimeFormationService.getFormationCombatState(player.instanceId, targetRef)
        : null;
    if (formation) {
        return { kind: formation.kind ?? 'formation', ref: targetRef, x: formation.x, y: formation.y };
    }
    return { kind: 'unknown', ref: targetRef, x: null, y: null };
}

function clearAutoCombatThreatTarget(playerId, targetRef, deps) {
    const normalizedTargetRef = typeof targetRef === 'string' ? targetRef.trim() : '';
    if (!normalizedTargetRef) {
        return;
    }
    const threatService = deps.worldRuntimeThreatService;
    if (typeof threatService?.buildPlayerOwnerId === 'function' && typeof threatService?.multiplyThreat === 'function') {
        threatService.multiplyThreat(threatService.buildPlayerOwnerId(playerId), normalizedTargetRef, 0);
    }
}

function buildPendingCommandFailureDebug(playerId, command, deps) {
    const player = deps.playerRuntimeService?.getPlayer?.(playerId);
    const parts = [];
    parts.push(`auto=${command?.autoCombat === true ? '1' : '0'}`);
    parts.push(`manual=${command?.manualEngage === true ? '1' : '0'}`);
    if (command?.kind === 'castSkill') {
        const skillId = typeof command.skillId === 'string' && command.skillId.trim() ? command.skillId.trim() : 'unknown';
        const skill = Array.isArray(player?.techniques?.techniques) ? findPlayerSkill(player, skillId) : null;
        parts.push(`skill=${skillId}`);
        if (skill?.name) {
            parts.push(`skillName=${skill.name}`);
        }
        if (skill) {
            parts.push(`skillRange=${resolveRuntimeSkillRange(skill)}`);
        }
    }
    if (player) {
        const playerName = resolvePlayerDiagnosticName(player, playerId);
        if (playerName) {
            parts.push(`playerName=${playerName}`);
        }
        parts.push(`instance=${player.instanceId ?? 'none'}`);
        parts.push(`playerPos=${formatCoord(player.x, player.y)}`);
        const target = resolveCommandTargetPosition(command, player, deps);
        if (target) {
            parts.push(`target=${target.ref}`);
            parts.push(`targetKind=${target.kind}`);
            parts.push(`targetPos=${formatCoord(target.x, target.y)}`);
            if (hasFiniteCoord(target.x, target.y) && hasFiniteCoord(player.x, player.y)) {
                parts.push(`distance=${chebyshevDistance(player.x, player.y, target.x, target.y)}`);
            }
        }
        const lockedTarget = typeof player.combat?.combatTargetId === 'string' ? player.combat.combatTargetId.trim() : '';
        if (lockedTarget) {
            parts.push(`combatTarget=${lockedTarget}`);
            parts.push(`combatTargetLocked=${player.combat?.combatTargetLocked === true ? '1' : '0'}`);
        }
    } else {
        parts.push('playerState=missing');
    }
    return `debug=${parts.join(' ')}`;
}

function emitPendingCommandFailureLog(deps, line, command, message) {
    if (shouldDowngradePendingCommandFailure(command, message)) {
        const log = typeof deps.logger?.debug === 'function'
            ? deps.logger.debug
            : typeof deps.logger?.log === 'function'
                ? deps.logger.log
            : null;
        if (log) {
            log.call(deps.logger, line);
            return;
        }
    }
    if (typeof deps.logger?.warn === 'function') {
        deps.logger.warn(line);
        return;
    }
    deps.logger?.log?.(line);
}

function resolvePendingCommandPerfKey(command) {
    switch (command?.kind) {
        case 'move':
        case 'portal':
            return 'pendingCommands.instanceMoveMs';
        case 'moveTo':
            return 'pendingCommands.navigationMs';
        case 'basicAttack':
            return 'pendingCommands.basicAttackMs';
        case 'engageBattle':
            return 'pendingCommands.engageBattleMs';
        case 'castSkill':
            return 'pendingCommands.castSkillMs';
        case 'useItem':
        case 'equip':
        case 'unequip':
        case 'dropItem':
        case 'takeGround':
        case 'takeGroundAll':
            return 'pendingCommands.itemMs';
        case 'createFormation':
        case 'setFormationActive':
        case 'refillFormation':
            return 'pendingCommands.formationMs';
        case 'startTechniqueTransmission':
        case 'cancelTechniqueTransmission':
        case 'startAlchemy':
        case 'cancelAlchemy':
        case 'startForging':
        case 'cancelForging':
        case 'saveAlchemyPreset':
        case 'deleteAlchemyPreset':
        case 'startEnhancement':
        case 'cancelEnhancement':
        case 'startGather':
        case 'cancelGather':
        case 'startMining':
        case 'cancelMining':
        case 'startBuilding':
        case 'cancelBuilding':
        case 'startFormationMaintenance':
        case 'cancelFormationMaintenance':
        case 'cancelTechniqueActivity':
            return 'pendingCommands.techniqueActivityMs';
        case 'cultivate':
        case 'breakthrough':
        case 'refineRootFoundation':
        case 'heavenGateAction':
            return 'pendingCommands.progressionMs';
        case 'buyNpcShopItem':
        case 'npcInteraction':
        case 'interactNpcQuest':
        case 'acceptNpcQuest':
        case 'submitNpcQuest':
            return 'pendingCommands.npcQuestMs';
        case 'redeemCodes':
            return 'pendingCommands.redeemCodesMs';
        default:
            return 'pendingCommands.otherPlayerCommandMs';
    }
}

function recordPendingCommandPerf(recordTickSectionDuration, key, startedAt, count = 1) {
    if (typeof recordTickSectionDuration !== 'function') {
        return;
    }
    try {
        recordTickSectionDuration(key, performance.now() - startedAt, count);
    }
    catch {
        // 性能诊断不能影响权威命令执行。
    }
}

/** world-runtime pending command state：承接玩家待执行命令队列所有权与消费。 */
@Injectable()
export class WorldRuntimePendingCommandService {
/**
 * pendingCommands：pendingCommand相关字段。
 */

    pendingCommands = new Map();
    /**
 * isAutoCombatCommand：判断是否是自动战斗派生指令。
 * @param command 输入指令。
 * @returns 返回布尔结果。
 */

    isAutoCombatCommand(command) {
        return command?.autoCombat === true;
    }
    /**
 * clearManualEngageState：清理一次性接战的服务端临时状态。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值。
 */

    clearManualEngageState(playerId, deps) {
        const currentTick = typeof deps.resolveCurrentTickForPlayerId === 'function'
            ? deps.resolveCurrentTickForPlayerId(playerId)
            : 0;
        deps.playerRuntimeService?.clearManualEngagePending?.(playerId);
        deps.playerRuntimeService?.clearCombatTarget?.(playerId, currentTick);
    }
    /**
 * clearAutoCombatTargetAfterFailure：自动战斗确认目标失效后只清理当前目标锁。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值。
 */

    clearAutoCombatTargetAfterFailure(playerId, deps, command = undefined) {
        const currentTick = typeof deps.resolveCurrentTickForPlayerId === 'function'
            ? deps.resolveCurrentTickForPlayerId(playerId)
            : 0;
        deps.playerRuntimeService?.clearManualEngagePending?.(playerId);
        const player = deps.playerRuntimeService?.getPlayer?.(playerId);
        const currentTargetRef = typeof player?.combat?.combatTargetId === 'string'
            ? player.combat.combatTargetId.trim()
            : '';
        const commandTargetRef = resolveCommandTargetRef(command);
        if (currentTargetRef && commandTargetRef && currentTargetRef !== commandTargetRef) {
            return;
        }
        const targetPlayerId = resolvePlayerIdFromTargetRef(commandTargetRef);
        if (targetPlayerId) {
            deps.playerRuntimeService?.clearRetaliatePlayerTargetIfMatches?.(playerId, targetPlayerId, currentTick);
        }
        clearAutoCombatThreatTarget(playerId, commandTargetRef, deps);
        deps.playerRuntimeService?.clearCombatTarget?.(playerId, currentTick);
    }
    /**
 * dispatchCommand：统一派发实例或玩家指令。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 返回执行结果。
 */

    async dispatchCommand(playerId, command, deps) {
        if (command.kind === 'move' || command.kind === 'portal') {
            await deps.dispatchInstanceCommand(playerId, command);
            return;
        }
        await deps.dispatchPlayerCommand(playerId, command);
    }
    /**
 * retryAutoCombatCommand：旧目标失效时立即重算自动战斗指令。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 返回是否已处理及最终错误。
 */

    async retryAutoCombatCommand(playerId, deps, failedCommand = undefined) {
        const excludedSkillIds = new Set();
        const failedSkillId = failedCommand?.kind === 'castSkill' && typeof failedCommand.skillId === 'string'
            ? failedCommand.skillId.trim()
            : '';
        if (failedSkillId) {
            excludedSkillIds.add(failedSkillId);
        }
        while (true) {
            const player = deps.playerRuntimeService?.getPlayer?.(playerId);
            if (!player || player.hp <= 0 || player.combat?.autoBattle !== true || !player.instanceId) {
                return { handled: false, error: null, errorCommand: null };
            }
            const instance = typeof deps.getInstanceRuntime === 'function'
                ? deps.getInstanceRuntime(player.instanceId)
                : deps.getInstanceRuntimeOrThrow(player.instanceId);
            if (!instance) {
                return { handled: false, error: null, errorCommand: null };
            }
            const retryCommand = deps.buildAutoCombatCommand(instance, player, excludedSkillIds.size > 0 ? { excludedSkillIds } : undefined);
            if (!retryCommand) {
                return { handled: true, error: null, errorCommand: null };
            }
            try {
                await this.dispatchCommand(playerId, retryCommand, deps);
                return { handled: true, error: null, errorCommand: null };
            }
            catch (error) {
                if (retryCommand.kind !== 'castSkill') {
                    return { handled: false, error, errorCommand: retryCommand };
                }
                const nextSkillId = typeof retryCommand.skillId === 'string' ? retryCommand.skillId.trim() : '';
                if (!nextSkillId || excludedSkillIds.has(nextSkillId)) {
                    return { handled: false, error, errorCommand: retryCommand };
                }
                excludedSkillIds.add(nextSkillId);
            }
        }
    }
    /**
 * enqueuePendingCommand：处理待处理Command并更新相关状态。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

    enqueuePendingCommand(playerId, command) {
        this.pendingCommands.set(playerId, command);
    }
    /**
 * getPendingCommand：读取待处理Command。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成PendingCommand的读取/组装。
 */

    getPendingCommand(playerId) {
        return this.pendingCommands.get(playerId);
    }
    /**
 * hasPendingCommand：判断待处理Command是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成PendingCommand的条件判断。
 */

    hasPendingCommand(playerId) {
        return this.pendingCommands.has(playerId);
    }
    /**
 * clearPendingCommand：执行clear待处理Command相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clearPendingCommand相关状态。
 */

    clearPendingCommand(playerId) {
        this.pendingCommands.delete(playerId);
    }
    /**
 * getPendingCommandCount：读取待处理Command数量。
 * @returns 无返回值，完成PendingCommand数量的读取/组装。
 */

    getPendingCommandCount() {
        return this.pendingCommands.size;
    }
    /**
 * dispatchPendingCommands：判断待处理Command是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

    async dispatchPendingCommands(deps, recordTickSectionDuration = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const [playerId, command] of this.pendingCommands) {
            const commandDispatchStartedAt = performance.now();
            let commandDispatchRecorded = false;
            const previousRecorder = deps?.recordPendingCommandSectionDuration;
            if (typeof recordTickSectionDuration === 'function') {
                deps.recordPendingCommandSectionDuration = recordTickSectionDuration;
            }
            try {
                await this.dispatchCommand(playerId, command, deps);
                recordPendingCommandPerf(recordTickSectionDuration, resolvePendingCommandPerfKey(command), commandDispatchStartedAt);
                commandDispatchRecorded = true;
                if (command?.manualEngage === true && command.kind !== 'move' && command.kind !== 'portal') {
                    const manualCleanupStartedAt = performance.now();
                    this.clearManualEngageState(playerId, deps);
                    recordPendingCommandPerf(recordTickSectionDuration, 'pendingCommands.manualEngageCleanupMs', manualCleanupStartedAt);
                }
            }
            catch (error) {
                if (!commandDispatchRecorded) {
                    recordPendingCommandPerf(recordTickSectionDuration, resolvePendingCommandPerfKey(command), commandDispatchStartedAt);
                    commandDispatchRecorded = true;
                }
                if (command?.manualEngage === true) {
                    const manualCleanupStartedAt = performance.now();
                    this.clearManualEngageState(playerId, deps);
                    recordPendingCommandPerf(recordTickSectionDuration, 'pendingCommands.manualEngageCleanupMs', manualCleanupStartedAt);
                }
                let failedCommandForDiagnostics = command;
                if (this.isAutoCombatCommand(command)) {
                    const retryStartedAt = performance.now();
                    const retryResult = await this.retryAutoCombatCommand(playerId, deps, command);
                    recordPendingCommandPerf(recordTickSectionDuration, 'pendingCommands.autoCombatRetryMs', retryStartedAt);
                    if (retryResult.handled) {
                        continue;
                    }
                    if (retryResult.error) {
                        error = retryResult.error;
                        failedCommandForDiagnostics = retryResult.errorCommand ?? command;
                    }
                }
                const failureHandlingStartedAt = performance.now();
                const message = error instanceof Error ? error.message : String(error);
                if (this.isAutoCombatCommand(failedCommandForDiagnostics) && isTerminalAutoCombatTargetFailure(message)) {
                    this.clearAutoCombatTargetAfterFailure(playerId, deps, failedCommandForDiagnostics);
                }
                const noticeMessage = normalizePendingCommandNoticeMessage(failedCommandForDiagnostics, message);
                const retrySuffix = failedCommandForDiagnostics !== command ? ` retryOf=${command.kind}` : '';
                emitPendingCommandFailureLog(
                    deps,
                    `处理玩家 ${playerId} 的待执行指令失败：${failedCommandForDiagnostics.kind}（${message}） ${buildPendingCommandFailureDebug(playerId, failedCommandForDiagnostics, deps)}${retrySuffix}`,
                    failedCommandForDiagnostics,
                    message,
                );
                if (noticeMessage) {
                    deps.queuePlayerNotice(playerId, noticeMessage, 'warn');
                }
                recordPendingCommandPerf(recordTickSectionDuration, 'pendingCommands.failureHandlingMs', failureHandlingStartedAt);
            }
            finally {
                if (typeof recordTickSectionDuration === 'function') {
                    if (previousRecorder) {
                        deps.recordPendingCommandSectionDuration = previousRecorder;
                    }
                    else {
                        delete deps.recordPendingCommandSectionDuration;
                    }
                }
            }
        }
        this.pendingCommands.clear();
    }
    /**
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
 */

    resetState() {
        this.pendingCommands.clear();
    }
};
