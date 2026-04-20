// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeMovementService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime movement orchestration：承接实例侧移动/传送执行编排。 */
let WorldRuntimeMovementService = class WorldRuntimeMovementService {
/**
 * dispatchInstanceCommand：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
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
 * dispatchMoveCommand：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param player 玩家对象。
 * @param instance 地图实例。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchMoveCommand(playerId, command, player, instance, deps) {
        instance.setPlayerMoveSpeed(playerId, player.attrs.numericStats.moveSpeed);
        deps.playerRuntimeService.recordActivity(playerId, deps.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
        });
        deps.worldRuntimeCraftInterruptService.interruptCraftForReason(playerId, player, 'move', deps);
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
 * dispatchPortalCommand：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param player 玩家对象。
 * @param instance 地图实例。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchPortalCommand(playerId, player, instance, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.playerRuntimeService.recordActivity(playerId, deps.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
        });
        deps.worldRuntimeCraftInterruptService.interruptCraftForReason(playerId, player, 'move', deps);
        const manualTransfer = instance.tryPortalTransfer(playerId, 'manual_portal');
        if (manualTransfer) {
            deps.applyTransfer(manualTransfer);
            return;
        }
        const autoTransfer = instance.tryPortalTransfer(playerId, 'auto_portal');
        if (autoTransfer) {
            deps.applyTransfer(autoTransfer);
            return;
        }
        instance.enqueuePortalUse({ playerId });
    }
};
exports.WorldRuntimeMovementService = WorldRuntimeMovementService;
exports.WorldRuntimeMovementService = WorldRuntimeMovementService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeMovementService);

export { WorldRuntimeMovementService };
