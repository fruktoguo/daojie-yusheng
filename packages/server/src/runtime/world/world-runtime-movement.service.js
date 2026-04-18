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
    dispatchInstanceCommand(playerId, command, deps) {
        const location = deps.playerLocations.get(playerId);
        if (!location) {
            return;
        }
        const player = deps.playerRuntimeService.getPlayer(playerId);
        if (!player || player.hp <= 0) {
            return;
        }
        const instance = deps.instances.get(location.instanceId);
        if (!instance) {
            return;
        }
        if (command.kind === 'move') {
            this.dispatchMoveCommand(playerId, command, player, instance, deps);
            return;
        }
        this.dispatchPortalCommand(playerId, player, instance, deps);
    }
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
    dispatchPortalCommand(playerId, player, instance, deps) {
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
