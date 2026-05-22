/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Injectable } from '@nestjs/common';

function normalizePendingCommandNoticeMessage(command, message) {
    if (command?.autoCombat === true && command?.manualEngage !== true) {
        if (message === '该目标无法被攻击' || message === '没有可命中的目标') {
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
    return message === '该目标无法被攻击' || message === '没有可命中的目标';
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
                return { handled: false, error: null };
            }
            const instance = typeof deps.getInstanceRuntime === 'function'
                ? deps.getInstanceRuntime(player.instanceId)
                : deps.getInstanceRuntimeOrThrow(player.instanceId);
            if (!instance) {
                return { handled: false, error: null };
            }
            const retryCommand = deps.buildAutoCombatCommand(instance, player, excludedSkillIds.size > 0 ? { excludedSkillIds } : undefined);
            if (!retryCommand) {
                return { handled: true, error: null };
            }
            try {
                await this.dispatchCommand(playerId, retryCommand, deps);
                return { handled: true, error: null };
            }
            catch (error) {
                if (retryCommand.kind !== 'castSkill') {
                    return { handled: false, error };
                }
                const nextSkillId = typeof retryCommand.skillId === 'string' ? retryCommand.skillId.trim() : '';
                if (!nextSkillId || excludedSkillIds.has(nextSkillId)) {
                    return { handled: false, error };
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

    async dispatchPendingCommands(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const [playerId, command] of this.pendingCommands) {
            try {
                await this.dispatchCommand(playerId, command, deps);
                if (command?.manualEngage === true && command.kind !== 'move' && command.kind !== 'portal') {
                    this.clearManualEngageState(playerId, deps);
                }
            }
            catch (error) {
                if (command?.manualEngage === true) {
                    this.clearManualEngageState(playerId, deps);
                }
                if (this.isAutoCombatCommand(command)) {
                    const retryResult = await this.retryAutoCombatCommand(playerId, deps, command);
                    if (retryResult.handled) {
                        continue;
                    }
                    if (retryResult.error) {
                        error = retryResult.error;
                    }
                }
                const message = error instanceof Error ? error.message : String(error);
                if (this.isAutoCombatCommand(command) && isTerminalAutoCombatTargetFailure(message)) {
                    this.clearAutoCombatTargetAfterFailure(playerId, deps, command);
                }
                const noticeMessage = normalizePendingCommandNoticeMessage(command, message);
                deps.logger.warn(`处理玩家 ${playerId} 的待执行指令失败：${command.kind}（${message}）`);
                if (noticeMessage) {
                    deps.queuePlayerNotice(playerId, noticeMessage, 'warn');
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
