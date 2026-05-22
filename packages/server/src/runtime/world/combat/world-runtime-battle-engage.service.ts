/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import { resolveAttackableTargetRef } from './world-runtime.attack-target.helpers';

function assertInstanceSupportsPlayerCombat(instance) {
    if (instance?.meta?.supportsPvp === true) {
        return;
    }
    throw new BadRequestException('当前实例不允许玩家互攻');
}

function dispatchAutoCombatCommand(playerId, command, locked, deps) {
    const resolvedCommand = locked ? command : {
        ...command,
        manualEngage: true,
    };
    if (resolvedCommand.kind === 'move' || resolvedCommand.kind === 'portal') {
        deps.dispatchInstanceCommand(playerId, resolvedCommand);
        return;
    }
    return deps.dispatchPlayerCommand(playerId, resolvedCommand);
}

/** 玩家战斗接敌编排服务：承接锁定目标、autoBattle 切换与首个命令 handoff。 */
@Injectable()
export class WorldRuntimeBattleEngageService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
    }
    /**
 * dispatchEngageBattle：判断EngageBattle是否满足条件。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param locked 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新EngageBattle相关状态。
 */

    async dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
        const currentPlayer = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const wasAutoBattleActive = currentPlayer.combat.autoBattle === true;
        const instance = currentPlayer.instanceId ? deps.getInstanceRuntimeOrThrow(currentPlayer.instanceId) : null;
        deps.interruptManualCombat(playerId);
        if (!targetMonsterId) {
            const targetRef = targetPlayerId
                ? `player:${targetPlayerId}`
                : (targetX !== null && targetY !== null ? `tile:${targetX}:${targetY}` : null);
            if (targetPlayerId) {
                assertInstanceSupportsPlayerCombat(instance);
            }
            const resolvedTarget = targetRef
                ? resolveAttackableTargetRef(
                    instance,
                    this.playerRuntimeService,
                    currentPlayer,
                    targetRef,
                    deps,
                    { currentTick },
                )
                : null;
            if (!resolvedTarget) {
                throw new BadRequestException('该目标无法被攻击');
            }
            if (locked && targetRef) {
                this.playerRuntimeService.updateCombatSettings(playerId, {
                    autoBattle: true,
                }, currentTick);
                this.playerRuntimeService.setCombatTarget(playerId, resolvedTarget.targetRef, true, currentTick);
                if (wasAutoBattleActive) {
                    return;
                }
            }
            else {
                this.playerRuntimeService.setCombatTarget(playerId, resolvedTarget.targetRef, false, currentTick);
                this.playerRuntimeService.setManualEngagePending(playerId, true);
            }
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            const nextCommand = deps.buildAutoCombatCommand(instance, player);
            if (!nextCommand) {
                return;
            }
            try {
                return await dispatchAutoCombatCommand(playerId, nextCommand, locked, deps);
            }
            finally {
                if (!locked && nextCommand.kind !== 'move' && nextCommand.kind !== 'portal') {
                    this.playerRuntimeService.clearManualEngagePending(playerId);
                    this.playerRuntimeService.clearCombatTarget(playerId, currentTick);
                }
            }
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (!player.instanceId) {
            throw new BadRequestException(`玩家 ${playerId} 未进入地图实例`);
        }
        const monsterInstance = deps.getInstanceRuntimeOrThrow(player.instanceId);
        const resolvedTarget = resolveAttackableTargetRef(
            monsterInstance,
            this.playerRuntimeService,
            player,
            targetMonsterId,
            deps,
            { currentTick },
        );
        if (!resolvedTarget) {
            if (locked) {
                this.playerRuntimeService.clearCombatTarget(playerId, currentTick);
                return;
            }
            throw new BadRequestException('没有可命中的目标');
        }
        if (locked) {
            this.playerRuntimeService.updateCombatSettings(playerId, {
                autoBattle: true,
            }, currentTick);
            this.playerRuntimeService.setCombatTarget(playerId, resolvedTarget.targetRef, true, currentTick);
            if (wasAutoBattleActive) {
                return;
            }
        }
        else {
            this.playerRuntimeService.setCombatTarget(playerId, resolvedTarget.targetRef, false, currentTick);
            this.playerRuntimeService.setManualEngagePending(playerId, true);
        }
        const nextCommand = deps.buildAutoCombatCommand(monsterInstance, player);
        if (!nextCommand) {
            return;
        }
        try {
            return await dispatchAutoCombatCommand(playerId, nextCommand, locked, deps);
        }
        finally {
            if (!locked && nextCommand.kind !== 'move' && nextCommand.kind !== 'portal') {
                this.playerRuntimeService.clearManualEngagePending(playerId);
                this.playerRuntimeService.clearCombatTarget(playerId, currentTick);
            }
        }
    }
};
