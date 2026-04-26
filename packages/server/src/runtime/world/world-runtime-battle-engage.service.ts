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
exports.WorldRuntimeBattleEngageService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_attack_target_helpers_1 = require("./world-runtime.attack-target.helpers");

function assertInstanceSupportsPlayerCombat(instance) {
    if (instance?.meta?.supportsPvp === true) {
        return;
    }
    throw new common_1.BadRequestException('当前实例不允许玩家互攻');
}

function assertInstanceSupportsTileDamage(instance, player, targetX, targetY, deps) {
    if (instance?.meta?.canDamageTile === true) {
        return;
    }
    const attackableTile = typeof deps.worldRuntimeFormationService?.getAttackableTileCombatState === 'function'
        ? deps.worldRuntimeFormationService.getAttackableTileCombatState(player.instanceId, targetX, targetY)
        : null;
    if (attackableTile) {
        return;
    }
    throw new common_1.BadRequestException('当前实例不允许攻击地块');
}

function dispatchResolvedBasicAttack(playerId, target, deps) {
    return deps.dispatchBasicAttack(
        playerId,
        target.targetPlayerId ?? null,
        target.targetMonsterId ?? null,
        target.targetX ?? null,
        target.targetY ?? null,
    );
}

/** 玩家战斗接敌编排服务：承接锁定目标、autoBattle 切换与首个命令 handoff。 */
let WorldRuntimeBattleEngageService = class WorldRuntimeBattleEngageService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService) {
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
            if (targetX !== null && targetY !== null) {
                assertInstanceSupportsTileDamage(instance, currentPlayer, targetX, targetY, deps);
            }
            const resolvedTarget = targetRef
                ? (0, world_runtime_attack_target_helpers_1.resolveAttackableTargetRef)(
                    instance,
                    this.playerRuntimeService,
                    currentPlayer,
                    targetRef,
                    deps,
                    { currentTick },
                )
                : null;
            if (!resolvedTarget) {
                throw new common_1.BadRequestException('该目标无法被攻击');
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
            return dispatchResolvedBasicAttack(playerId, resolvedTarget, deps);
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (!player.instanceId) {
            throw new common_1.BadRequestException(`Player ${playerId} not attached to instance`);
        }
        const monsterInstance = deps.getInstanceRuntimeOrThrow(player.instanceId);
        const resolvedTarget = (0, world_runtime_attack_target_helpers_1.resolveAttackableTargetRef)(
            monsterInstance,
            this.playerRuntimeService,
            player,
            targetMonsterId,
            deps,
            { currentTick },
        );
        if (!resolvedTarget) {
            throw new common_1.NotFoundException(`Target ${targetMonsterId} not found or cannot be attacked`);
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
        const command = locked ? nextCommand : {
            ...nextCommand,
            manualEngage: true,
        };
        if (command.kind === 'move' || command.kind === 'portal') {
            deps.dispatchInstanceCommand(playerId, command);
            return;
        }
        try {
            return await deps.dispatchPlayerCommand(playerId, command);
        }
        finally {
            if (!locked) {
                this.playerRuntimeService.clearManualEngagePending(playerId);
                this.playerRuntimeService.clearCombatTarget(playerId, currentTick);
            }
        }
    }
};
exports.WorldRuntimeBattleEngageService = WorldRuntimeBattleEngageService;
exports.WorldRuntimeBattleEngageService = WorldRuntimeBattleEngageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeBattleEngageService);

export { WorldRuntimeBattleEngageService };
