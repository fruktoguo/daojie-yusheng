/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { findPlayerSkill, resolveRuntimeSkillRange } from '../world-runtime.normalization.helpers';
import { chebyshevDistance } from '../world-runtime.path-planning.helpers';

function isOutOfRangeFailure(message) {
    return message === '目标超出攻击距离'
        || message === '目标超出技能范围'
        || (typeof message === 'string' && /^技能 .+ 超出范围$/.test(message))
        || (typeof message === 'string' && /^Skill .+ out of range$/.test(message));
}

/** 妖兽已死亡或已被移除：自动战斗锁定目标失效的常态。 */
function isMissingMonsterFailure(message) {
    return typeof message === 'string' && /^妖兽不存在：/.test(message);
}

/** 背包条目已消失：客户端面板尚未收到移除 patch 时的亚秒级陈旧引用。 */
function isMissingInventoryItemFailure(message) {
    return typeof message === 'string' && /^背包物品不存在：/.test(message);
}

/** 目标实例无可占用落点：通常由建筑铺满可通行格导致，属运营事故。 */
function isNoSpawnPointFailure(message) {
    return typeof message === 'string' && /^实例 .+ 中没有可用出生点$/.test(message);
}

/** 消息里内嵌了 uuid / runtimeId / instanceId 等内部标识，禁止推送给玩家。 */
function exposesInternalIdentifier(message) {
    return isMissingMonsterFailure(message)
        || isMissingInventoryItemFailure(message)
        || isNoSpawnPointFailure(message);
}

function normalizePendingCommandNoticeMessage(command, message) {
    if (exposesInternalIdentifier(message)) {
        return null;
    }
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
        || isMissingMonsterFailure(message)
        || isOutOfRangeFailure(message);
}

function isCooldownFailure(message) {
    return typeof message === 'string' && /^技能 .+ 尚在冷却$/.test(message);
}

function shouldDowngradePendingCommandFailure(command, message) {
    if (command?.autoCombat === true || command?.manualEngage === true) {
        // 自动战斗派生指令的目标失效是常态（怪被他人击杀、已刷新），不代表系统异常。
        return isTerminalAutoCombatTargetFailure(message);
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
        || message === '当前实例不允许玩家互攻'
        || isMissingMonsterFailure(message)
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
        || message === '学习者已经掌握该功法。'
        || (typeof message === 'string' && /^当前没有可取消的.+任务。$/.test(message));
}

/** 背包条目在指令入队与派发之间消失：客户端面板未及刷新，权威态已正确拒绝。 */
function isExpectedInventoryReject(message) {
    return isMissingInventoryItemFailure(message);
}

/** 地块资源道具的位置约束拒绝：确定性业务规则，非系统异常。 */
function isExpectedUseItemReject(message) {
    return message === '当前位于安全区、出生点、传送点或 NPC 附近，无法使用地块资源道具。';
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
    if (command?.kind === 'equip' || command?.kind === 'unequip') {
        return isExpectedInventoryReject(message);
    }
    if (command?.kind === 'useItem') {
        return isExpectedUseItemReject(message);
    }
    // portal 的「没有可用出生点」刻意不降级：目标实例被建筑铺满可通行格属运营事故，
    // 必须保留 WARN 供运维发现；只在 notice 层抑制内部 instanceId 外泄。
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
        case 'craftTechniqueBook':
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

const MAX_PENDING_COMMANDS_PER_PLAYER = 16;

type PendingCommandPolicy = {
    domain: string;
    replaceable: boolean;
};

type PendingCommandEntry = {
    command: any;
    policy: PendingCommandPolicy;
    dispatching: boolean;
    enqueuedDuring: PendingCommandEntry | null;
};

function isSameTickDerivedMovementCommand(command): boolean {
    if (!command || (command.kind !== 'move' && command.kind !== 'portal')) {
        return false;
    }
    return command.autoCombat === true || typeof command.miningTargetRef === 'string';
}

/**
 * 只有明确的意图型命令可以在同领域以最后一次为准。
 * 手动战斗、资产、任务、成长和传送均是一次性命令，必须进有界队列。
 */
function resolvePendingCommandPolicy(command): PendingCommandPolicy {
    if (command?.kind === 'move' || command?.kind === 'moveTo') {
        return { domain: 'movement', replaceable: true };
    }
    if (command?.autoCombat === true
        && (command?.kind === 'basicAttack' || command?.kind === 'engageBattle' || command?.kind === 'castSkill')) {
        return { domain: 'auto_combat', replaceable: true };
    }
    switch (resolvePendingCommandPerfKey(command)) {
        case 'pendingCommands.itemMs':
            return { domain: 'asset', replaceable: false };
        case 'pendingCommands.formationMs':
            return { domain: 'formation', replaceable: false };
        case 'pendingCommands.techniqueActivityMs':
            return { domain: 'technique_activity', replaceable: false };
        case 'pendingCommands.progressionMs':
            return { domain: 'progression', replaceable: false };
        case 'pendingCommands.npcQuestMs':
            return { domain: 'npc_quest', replaceable: false };
        case 'pendingCommands.redeemCodesMs':
            return { domain: 'redeem_code', replaceable: false };
        case 'pendingCommands.basicAttackMs':
        case 'pendingCommands.engageBattleMs':
        case 'pendingCommands.castSkillMs':
            return { domain: 'combat_action', replaceable: false };
        case 'pendingCommands.instanceMoveMs':
            return { domain: 'instance_action', replaceable: false };
        default:
            return { domain: 'other', replaceable: false };
    }
}

/** 有界深比较用于拒绝队列中完全相同的一次性命令，不构造 JSON 或字符串签名。 */
function areEquivalentPendingCommands(left, right, depth = 0): boolean {
    if (left === right) {
        return true;
    }
    if (left === null || right === null || left === undefined || right === undefined) {
        return false;
    }
    if (typeof left !== 'object' || typeof right !== 'object' || depth >= 4) {
        return false;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length > 64) {
            return false;
        }
        for (let index = 0; index < left.length; index += 1) {
            if (!areEquivalentPendingCommands(left[index], right[index], depth + 1)) {
                return false;
            }
        }
        return true;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length || leftKeys.length > 64) {
        return false;
    }
    for (const key of leftKeys) {
        if (!Object.prototype.hasOwnProperty.call(right, key)
            || !areEquivalentPendingCommands(left[key], right[key], depth + 1)) {
            return false;
        }
    }
    return true;
}

/** world-runtime pending command state：承接玩家待执行命令队列所有权与消费。 */
@Injectable()
export class WorldRuntimePendingCommandService {
/**
 * pendingCommands：pendingCommand相关字段。
 */

    /** 每玩家一条有界 FIFO；可覆盖意图只替换同领域尚未执行的条目。 */
    pendingCommands = new Map<string, PendingCommandEntry[]>();
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
        const policy = resolvePendingCommandPolicy(command);
        let queue = this.pendingCommands.get(playerId);
        if (!queue) {
            queue = [];
            this.pendingCommands.set(playerId, queue);
        }
        const dispatchingParent = queue.find((entry) => entry.dispatching) ?? null;
        if (policy.replaceable) {
            const replaceIndex = queue.findIndex((entry) => !entry.dispatching
                && entry.policy.replaceable
                && entry.policy.domain === policy.domain);
            if (replaceIndex >= 0) {
                queue[replaceIndex] = this.createPendingCommandEntry(command, policy, dispatchingParent);
                return;
            }
        }
        else if (queue.some((entry) => !entry.policy.replaceable
            && entry.policy.domain === policy.domain
            && areEquivalentPendingCommands(entry.command, command))) {
            throw new ConflictException('相同指令已在等待执行');
        }
        if (queue.length >= MAX_PENDING_COMMANDS_PER_PLAYER) {
            if (queue.length === 0) {
                this.pendingCommands.delete(playerId);
            }
            throw new HttpException('待执行指令过多，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
        }
        queue.push(this.createPendingCommandEntry(command, policy, dispatchingParent));
    }

    createPendingCommandEntry(command, policy: PendingCommandPolicy, enqueuedDuring: PendingCommandEntry | null): PendingCommandEntry {
        return { command, policy, dispatching: false, enqueuedDuring };
    }
    /**
 * getPendingCommand：读取待处理Command。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成PendingCommand的读取/组装。
 */

    getPendingCommand(playerId) {
        return this.pendingCommands.get(playerId)?.[0]?.command;
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
        let count = 0;
        for (const queue of this.pendingCommands.values()) {
            count += queue.length;
        }
        return count;
    }
    /**
 * dispatchPendingCommands：判断待处理Command是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

    async dispatchPendingCommands(deps, recordTickSectionDuration = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const pendingEntries = Array.from(this.pendingCommands.entries(), ([playerId, queue]) => [playerId, queue[0]] as const)
            .filter((entry): entry is readonly [string, PendingCommandEntry] => Boolean(entry[1]));
        for (const [playerId, pendingEntry] of pendingEntries) {
            const queueBeforeDispatch = this.pendingCommands.get(playerId);
            if (!queueBeforeDispatch || queueBeforeDispatch[0] !== pendingEntry) {
                continue;
            }
            pendingEntry.dispatching = true;
            const command = pendingEntry.command;
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
                const currentQueue = this.pendingCommands.get(playerId);
                const entryIndex = currentQueue?.indexOf(pendingEntry) ?? -1;
                if (currentQueue && entryIndex >= 0) {
                    currentQueue.splice(entryIndex, 1);
                }
                if (currentQueue) {
                    for (let index = currentQueue.length - 1; index >= 0; index -= 1) {
                        const queuedEntry = currentQueue[index];
                        if (queuedEntry.enqueuedDuring !== pendingEntry) {
                            continue;
                        }
                        queuedEntry.enqueuedDuring = null;
                        if (isSameTickDerivedMovementCommand(queuedEntry.command)) {
                            currentQueue.splice(index, 1);
                        }
                    }
                }
                if (!currentQueue || currentQueue.length === 0) {
                    this.pendingCommands.delete(playerId);
                }
            }
        }
    }
    /**
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
 */

    resetState() {
        this.pendingCommands.clear();
    }
};
