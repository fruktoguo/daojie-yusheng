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
exports.WorldRuntimeBattleEngageService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");

/** 玩家战斗接敌编排服务：承接锁定目标、autoBattle 切换与首个命令 handoff。 */
let WorldRuntimeBattleEngageService = class WorldRuntimeBattleEngageService {
    playerRuntimeService;
    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }
    dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps) {
        const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
        const currentPlayer = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const wasAutoBattleActive = currentPlayer.combat.autoBattle === true;
        deps.interruptManualCombat(playerId);
        if (!targetMonsterId) {
            const targetRef = targetPlayerId
                ? `player:${targetPlayerId}`
                : (targetX !== null && targetY !== null ? `tile:${targetX}:${targetY}` : null);
            if (locked && targetRef) {
                this.playerRuntimeService.updateCombatSettings(playerId, {
                    autoBattle: true,
                }, currentTick);
                this.playerRuntimeService.setCombatTarget(playerId, targetRef, true, currentTick);
                if (wasAutoBattleActive) {
                    return;
                }
            }
            deps.dispatchBasicAttack(playerId, targetPlayerId, null, targetX, targetY);
            return;
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (!player.instanceId) {
            throw new common_1.BadRequestException(`Player ${playerId} not attached to instance`);
        }
        const instance = deps.getInstanceRuntimeOrThrow(player.instanceId);
        const monster = instance.getMonster(targetMonsterId);
        if (!monster?.alive) {
            throw new common_1.NotFoundException(`Monster ${targetMonsterId} not found`);
        }
        this.playerRuntimeService.updateCombatSettings(playerId, {
            autoBattle: true,
        }, currentTick);
        this.playerRuntimeService.setCombatTarget(playerId, monster.runtimeId, locked, currentTick);
        if (wasAutoBattleActive) {
            return;
        }
        const nextCommand = deps.buildAutoCombatCommand(instance, player);
        if (!nextCommand) {
            return;
        }
        if (nextCommand.kind === 'move' || nextCommand.kind === 'portal') {
            deps.dispatchInstanceCommand(playerId, nextCommand);
            return;
        }
        deps.dispatchPlayerCommand(playerId, nextCommand);
    }
};
exports.WorldRuntimeBattleEngageService = WorldRuntimeBattleEngageService;
exports.WorldRuntimeBattleEngageService = WorldRuntimeBattleEngageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeBattleEngageService);
