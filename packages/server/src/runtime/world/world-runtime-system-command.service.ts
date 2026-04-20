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

const world_runtime_gm_queue_service_1 = require("./world-runtime-gm-queue.service");

const world_runtime_monster_system_command_service_1 = require("./world-runtime-monster-system-command.service");

const world_runtime_player_combat_outcome_service_1 = require("./world-runtime-player-combat-outcome.service");
const world_runtime_gm_system_command_service_1 = require("./world-runtime-gm-system-command.service");

/** world-runtime system-command orchestration：承接系统命令队列消费与分发。 */
let WorldRuntimeSystemCommandService = class WorldRuntimeSystemCommandService {
/**
 * worldRuntimeGmQueueService：对象字段。
 */

    worldRuntimeGmQueueService;    
    /**
 * worldRuntimeMonsterSystemCommandService：对象字段。
 */

    worldRuntimeMonsterSystemCommandService;    
    /**
 * worldRuntimePlayerCombatOutcomeService：对象字段。
 */

    worldRuntimePlayerCombatOutcomeService;    
    /**
 * worldRuntimeGmSystemCommandService：对象字段。
 */

    worldRuntimeGmSystemCommandService;    
    /**
 * logger：对象字段。
 */

    logger = new common_1.Logger(WorldRuntimeSystemCommandService.name);    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimeGmQueueService 参数说明。
 * @param worldRuntimeMonsterSystemCommandService 参数说明。
 * @param worldRuntimePlayerCombatOutcomeService 参数说明。
 * @param worldRuntimeGmSystemCommandService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(worldRuntimeGmQueueService, worldRuntimeMonsterSystemCommandService, worldRuntimePlayerCombatOutcomeService, worldRuntimeGmSystemCommandService) {
        this.worldRuntimeGmQueueService = worldRuntimeGmQueueService;
        this.worldRuntimeMonsterSystemCommandService = worldRuntimeMonsterSystemCommandService;
        this.worldRuntimePlayerCombatOutcomeService = worldRuntimePlayerCombatOutcomeService;
        this.worldRuntimeGmSystemCommandService = worldRuntimeGmSystemCommandService;
    }    
    /**
 * dispatchPendingSystemCommands：处理事件并驱动执行路径。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
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
 * dispatchSystemCommand：处理事件并驱动执行路径。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
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
            default:
                if (this.worldRuntimeGmSystemCommandService.dispatchGmSystemCommand(command, deps)) {
                    return;
                }
                return;
        }
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
