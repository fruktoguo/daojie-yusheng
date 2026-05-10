import { Inject, Injectable, Logger } from '@nestjs/common';
import { RETURN_TO_SPAWN_ACTION_ID, RETURN_TO_SPAWN_COOLDOWN_TICKS } from '@mud/shared';
import { WorldRuntimeGmQueueService } from './world-runtime-gm-queue.service';
import { WorldRuntimeMonsterSystemCommandService } from './world-runtime-monster-system-command.service';
import { WorldRuntimePlayerCombatOutcomeService } from './world-runtime-player-combat-outcome.service';
import { WorldRuntimeGmSystemCommandService } from './world-runtime-gm-system-command.service';

/** world-runtime system-command orchestration：承接系统命令队列消费与分发。 */
@Injectable()
export class WorldRuntimeSystemCommandService {
/**
 * worldRuntimeGmQueueService：世界运行态GMQueue服务引用。
 */

    worldRuntimeGmQueueService;
    /**
 * worldRuntimeMonsterSystemCommandService：世界运行态怪物SystemCommand服务引用。
 */

    worldRuntimeMonsterSystemCommandService;
    /**
 * worldRuntimePlayerCombatOutcomeService：世界运行态玩家战斗Outcome服务引用。
 */

    worldRuntimePlayerCombatOutcomeService;
    /**
 * worldRuntimeGmSystemCommandService：世界运行态GMSystemCommand服务引用。
 */

    worldRuntimeGmSystemCommandService;
    /**
 * logger：日志器引用。
 */

    logger = new Logger(WorldRuntimeSystemCommandService.name);
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeGmQueueService 参数说明。
 * @param worldRuntimeMonsterSystemCommandService 参数说明。
 * @param worldRuntimePlayerCombatOutcomeService 参数说明。
 * @param worldRuntimeGmSystemCommandService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(WorldRuntimeGmQueueService) worldRuntimeGmQueueService: any,
        @Inject(WorldRuntimeMonsterSystemCommandService) worldRuntimeMonsterSystemCommandService: any,
        @Inject(WorldRuntimePlayerCombatOutcomeService) worldRuntimePlayerCombatOutcomeService: any,
        @Inject(WorldRuntimeGmSystemCommandService) worldRuntimeGmSystemCommandService: any,
    ) {
        this.worldRuntimeGmQueueService = worldRuntimeGmQueueService;
        this.worldRuntimeMonsterSystemCommandService = worldRuntimeMonsterSystemCommandService;
        this.worldRuntimePlayerCombatOutcomeService = worldRuntimePlayerCombatOutcomeService;
        this.worldRuntimeGmSystemCommandService = worldRuntimeGmSystemCommandService;
    }
    /**
 * dispatchPendingSystemCommands：判断待处理SystemCommand是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新PendingSystemCommand相关状态。
 */

    dispatchPendingSystemCommands(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.worldRuntimeGmQueueService.getPendingSystemCommandCount() === 0) {
            return;
        }
        const commands = this.worldRuntimeGmQueueService.drainPendingSystemCommands();
        for (const command of commands) {
            try {
                this.dispatchSystemCommand(command, deps);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`处理系统指令 ${command.kind} 失败：${message}`);
            }
        }
    }
    /**
 * dispatchSystemCommand：判断SystemCommand是否满足条件。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新SystemCommand相关状态。
 */

    dispatchSystemCommand(command, deps) {
        switch (command.kind) {
            case 'spawnMonsterLoot':
                this.worldRuntimeMonsterSystemCommandService.dispatchSpawnMonsterLoot(command.instanceId, command.x, command.y, command.monsterId, command.rolls, deps);
                return;
            case 'damageMonster':
                this.worldRuntimeMonsterSystemCommandService.dispatchDamageMonster(command.instanceId, command.runtimeId, command.amount, deps);
                return;
            case 'defeatMonster':
                this.worldRuntimeMonsterSystemCommandService.dispatchDefeatMonster(command.instanceId, command.runtimeId, deps);
                return;
            case 'damagePlayer':
                this.worldRuntimePlayerCombatOutcomeService.dispatchDamagePlayer(command.playerId, command.amount, deps);
                return;
            case 'respawnPlayer':
                this.worldRuntimePlayerCombatOutcomeService.respawnPlayer(command.playerId, deps);
                return;
            case 'resetPlayerSpawn':
                this.worldRuntimePlayerCombatOutcomeService.respawnPlayer(command.playerId, deps);
                return;
            case 'returnToSpawn':
                this.dispatchReturnToSpawn(command.playerId, deps);
                return;
            default:
                if (this.worldRuntimeGmSystemCommandService.dispatchGmSystemCommand(command, deps)) {
                    return;
                }
                return;
        }
    }
    /**
 * dispatchReturnToSpawn：执行遁返并写入固定调息。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新遁返相关状态。
 */

    dispatchReturnToSpawn(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = deps.playerRuntimeService.getPlayerOrThrow(playerId);
        const currentTick = typeof deps.resolveCurrentTickForPlayerId === 'function'
            ? deps.resolveCurrentTickForPlayerId(playerId)
            : 0;
        const readyTick = normalizeReturnToSpawnReadyTick(player, currentTick);
        const cooldownLeft = Math.max(0, readyTick - currentTick);
        if (cooldownLeft > 0) {
            if (typeof deps.queuePlayerNotice === 'function') {
                deps.queuePlayerNotice(playerId, `行动尚在调息中，还需 ${cooldownLeft} 息`, 'system');
            }
            deps.playerRuntimeService.rebuildActionState?.(player, currentTick);
            return;
        }
        this.worldRuntimePlayerCombatOutcomeService.respawnPlayer(playerId, deps, { buffClearMode: 'return_to_spawn' });
        const nextTick = typeof deps.resolveCurrentTickForPlayerId === 'function'
            ? deps.resolveCurrentTickForPlayerId(playerId)
            : currentTick;
        deps.playerRuntimeService.setSkillCooldownReadyTick(
            playerId,
            RETURN_TO_SPAWN_ACTION_ID,
            nextTick + RETURN_TO_SPAWN_COOLDOWN_TICKS,
            nextTick,
        );
    }
};

function normalizeReturnToSpawnReadyTick(player, currentTick) {
    const cooldowns = player?.combat?.cooldownReadyTickBySkillId;
    if (!cooldowns) {
        return 0;
    }
    const actionId = RETURN_TO_SPAWN_ACTION_ID;
    const readyTick = Math.max(0, Math.trunc(Number(cooldowns[actionId] ?? 0)));
    if (readyTick <= 0) {
        return 0;
    }
    const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
    const remainingTicks = readyTick - normalizedCurrentTick;
    if (normalizedCurrentTick <= 0) {
        // 系统命令缺少地图 tick 时只收敛提示值，不清运行时真源。
        return readyTick > RETURN_TO_SPAWN_COOLDOWN_TICKS
            ? RETURN_TO_SPAWN_COOLDOWN_TICKS
            : readyTick;
    }
    if (remainingTicks <= 0 || remainingTicks > RETURN_TO_SPAWN_COOLDOWN_TICKS) {
        delete cooldowns[actionId];
        return 0;
    }
    return readyTick;
}
