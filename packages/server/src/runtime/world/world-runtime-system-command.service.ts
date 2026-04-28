// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeSystemCommandService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");

const world_runtime_gm_queue_service_1 = require("./world-runtime-gm-queue.service");

const world_runtime_monster_system_command_service_1 = require("./world-runtime-monster-system-command.service");

const world_runtime_player_combat_outcome_service_1 = require("./world-runtime-player-combat-outcome.service");
const world_runtime_gm_system_command_service_1 = require("./world-runtime-gm-system-command.service");

/** world-runtime system-command orchestration：承接系统命令队列消费与分发。 */
let WorldRuntimeSystemCommandService = class WorldRuntimeSystemCommandService {
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

    logger = new common_1.Logger(WorldRuntimeSystemCommandService.name);    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeGmQueueService 参数说明。
 * @param worldRuntimeMonsterSystemCommandService 参数说明。
 * @param worldRuntimePlayerCombatOutcomeService 参数说明。
 * @param worldRuntimeGmSystemCommandService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldRuntimeGmQueueService, worldRuntimeMonsterSystemCommandService, worldRuntimePlayerCombatOutcomeService, worldRuntimeGmSystemCommandService) {
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
        const readyTick = Math.max(0, Math.trunc(Number(player.combat?.cooldownReadyTickBySkillId?.[shared_1.RETURN_TO_SPAWN_ACTION_ID] ?? 0)));
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
            shared_1.RETURN_TO_SPAWN_ACTION_ID,
            nextTick + shared_1.RETURN_TO_SPAWN_COOLDOWN_TICKS,
            nextTick,
        );
    }
};
exports.WorldRuntimeSystemCommandService = WorldRuntimeSystemCommandService;
exports.WorldRuntimeSystemCommandService = WorldRuntimeSystemCommandService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_gm_queue_service_1.WorldRuntimeGmQueueService,
        world_runtime_monster_system_command_service_1.WorldRuntimeMonsterSystemCommandService,
        world_runtime_player_combat_outcome_service_1.WorldRuntimePlayerCombatOutcomeService,
        world_runtime_gm_system_command_service_1.WorldRuntimeGmSystemCommandService])
], WorldRuntimeSystemCommandService);

export { WorldRuntimeSystemCommandService };
