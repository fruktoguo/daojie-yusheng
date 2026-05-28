/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Injectable } from '@nestjs/common';

function resolveMiningJobTargetRef(job) {
    if (!job || !Number.isFinite(Number(job.targetX)) || !Number.isFinite(Number(job.targetY))) {
        return '';
    }
    return `tile:${Math.trunc(Number(job.targetX))}:${Math.trunc(Number(job.targetY))}`;
}

function hasMiningJobCommandMarker(command) {
    return typeof command?.miningJobRunId === 'string' && command.miningJobRunId.trim().length > 0;
}

function isMatchingMiningJobCommand(player, command) {
    const jobRunId = typeof command?.miningJobRunId === 'string' ? command.miningJobRunId.trim() : '';
    const targetRef = typeof command?.miningTargetRef === 'string' ? command.miningTargetRef.trim() : '';
    const job = player?.miningJob;
    return Boolean(jobRunId)
        && job?.jobRunId === jobRunId
        && targetRef === resolveMiningJobTargetRef(job);
}

/** world-runtime movement orchestration：承接实例侧移动/传送执行编排。 */
@Injectable()
export class WorldRuntimeMovementService {
/**
 * dispatchInstanceCommand：判断InstanceCommand是否满足条件。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新InstanceCommand相关状态。
 */

    dispatchInstanceCommand(playerId, command, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocation(playerId);
        if (!location) {
            return;
        }
        const player = deps.playerRuntimeService.getPlayer(playerId);
        if (!player || player.hp <= 0) {
            return;
        }
        const instance = deps.getInstanceRuntime(location.instanceId);
        if (!instance) {
            return;
        }
        if (command.kind === 'move') {
            this.dispatchMoveCommand(playerId, command, player, instance, deps);
            return;
        }
        this.dispatchPortalCommand(playerId, player, instance, deps);
    }
    /**
 * dispatchMoveCommand：判断MoveCommand是否满足条件。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param player 玩家对象。
 * @param instance 地图实例。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新MoveCommand相关状态。
 */

    dispatchMoveCommand(playerId, command, player, instance, deps) {
        if (hasMiningJobCommandMarker(command) && !isMatchingMiningJobCommand(player, command)) {
            return;
        }
        instance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
        deps.worldRuntimePlayerSkillDispatchService?.interruptPendingPlayerSkillCast?.(playerId, '你移动了身形。', deps);
        deps.playerRuntimeService.recordActivity(playerId, deps.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
            reason: 'move',
        });
        if (!isMatchingMiningJobCommand(player, command)) {
            deps.worldRuntimeCraftInterruptService.interruptCraftForReason(playerId, player, 'move', deps);
        }
        instance.enqueueMove({
            playerId,
            direction: command.direction,
            continuous: command.continuous === true,
            maxSteps: command.maxSteps,
            path: Array.isArray(command.path)
                ? command.path.map((entry) => ({ x: entry.x, y: entry.y }))
                : undefined,
            resetBudget: command.resetBudget === true,
        });
    }
    /**
 * dispatchPortalCommand：判断传送门Command是否满足条件。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param instance 地图实例。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新PortalCommand相关状态。
 */

    dispatchPortalCommand(playerId, player, instance, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.playerRuntimeService.recordActivity(playerId, deps.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
            reason: 'move',
        });
        deps.worldRuntimePlayerSkillDispatchService?.interruptPendingPlayerSkillCast?.(playerId, '你移动了身形。', deps);
        deps.worldRuntimeCraftInterruptService.interruptCraftForReason(playerId, player, 'move', deps);
        const manualTransfer = instance.tryPortalTransfer(playerId, 'manual_portal');
        if (manualTransfer) {
            deps.applyTransfer(manualTransfer);
            return;
        }
        instance.enqueuePortalUse({ playerId });
    }
};
