// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeTickDispatchService = void 0;

const common_1 = require("@nestjs/common");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { isHostileSkill } = world_runtime_normalization_helpers_1;

/** world-runtime tick-dispatch facade：承接世界级 tick、路由与 monster-action facade。 */
let WorldRuntimeTickDispatchService = class WorldRuntimeTickDispatchService {
/**
 * getLegacyNavigationPath：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    getLegacyNavigationPath(playerId, deps) {
        return deps.worldRuntimeNavigationService.getLegacyNavigationPath(playerId, deps);
    }    
    /**
 * applyTransfer：更新/写入相关状态。
 * @param transfer 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    applyTransfer(transfer, deps) {
        deps.worldRuntimeTransferService.applyTransfer(transfer, deps);
    }    
    /**
 * materializeNavigationCommands：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    materializeNavigationCommands(deps) {
        deps.worldRuntimeNavigationService.materializeNavigationCommands(deps);
    }    
    /**
 * resolveNavigationStep：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param intent 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    resolveNavigationStep(playerId, intent, deps) {
        return deps.worldRuntimeNavigationService.resolveNavigationStep(playerId, intent, deps);
    }    
    /**
 * resolveNavigationDestination：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param intent 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    resolveNavigationDestination(playerId, intent, deps) {
        return deps.worldRuntimeNavigationService.resolveNavigationDestination(playerId, intent, deps);
    }    
    /**
 * materializeAutoCombatCommands：执行核心业务逻辑。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    materializeAutoCombatCommands(deps) {
        deps.worldRuntimeAutoCombatService.materializeAutoCombatCommands(deps);
    }    
    /**
 * buildAutoCombatCommand：构建并返回目标对象。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    buildAutoCombatCommand(instance, player, deps) {
        return deps.worldRuntimeAutoCombatService.buildAutoCombatCommand(instance, player, deps);
    }    
    /**
 * selectAutoCombatTarget：执行核心业务逻辑。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param visibleMonsters 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    selectAutoCombatTarget(instance, player, visibleMonsters, deps) {
        return deps.worldRuntimeAutoCombatService.selectAutoCombatTarget(instance, player, visibleMonsters, deps);
    }    
    /**
 * resolveTrackedAutoCombatTarget：执行核心业务逻辑。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param visibleMonsters 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    resolveTrackedAutoCombatTarget(instance, player, visibleMonsters, deps) {
        return deps.worldRuntimeAutoCombatService.resolveTrackedAutoCombatTarget(instance, player, visibleMonsters, deps);
    }    
    /**
 * pickAutoBattleSkill：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param distance 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    pickAutoBattleSkill(player, distance, deps) {
        return deps.worldRuntimeAutoCombatService.pickAutoBattleSkill(player, distance);
    }    
    /**
 * resolveAutoBattleDesiredRange：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    resolveAutoBattleDesiredRange(player, deps) {
        return deps.worldRuntimeAutoCombatService.resolveAutoBattleDesiredRange(player);
    }    
    /**
 * dispatchPendingCommands：处理事件并驱动执行路径。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchPendingCommands(deps) {
        deps.worldRuntimePendingCommandService.dispatchPendingCommands(deps);
    }    
    /**
 * dispatchPendingSystemCommands：处理事件并驱动执行路径。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchPendingSystemCommands(deps) {
        deps.worldRuntimeSystemCommandService.dispatchPendingSystemCommands(deps);
    }    
    /**
 * dispatchInstanceCommand：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchInstanceCommand(playerId, command, deps) {
        deps.worldRuntimeMovementService.dispatchInstanceCommand(playerId, command, deps);
    }    
    /**
 * dispatchPlayerCommand：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchPlayerCommand(playerId, command, deps) {
        deps.worldRuntimePlayerCommandService.dispatchPlayerCommand(playerId, command, deps);
    }    
    /**
 * dispatchSystemCommand：处理事件并驱动执行路径。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchSystemCommand(command, deps) {
        deps.worldRuntimeSystemCommandService.dispatchSystemCommand(command, deps);
    }    
    /**
 * dispatchMoveTo：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param allowNearestReachable 参数说明。
 * @param clientPathHint 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint, deps) {
        deps.worldRuntimeNavigationService.dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint, deps);
    }    
    /**
 * applyMonsterAction：更新/写入相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    applyMonsterAction(action, deps) {
        deps.worldRuntimeMonsterActionApplyService.applyMonsterAction(action, deps);
    }    
    /**
 * applyMonsterBasicAttack：更新/写入相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    applyMonsterBasicAttack(action, deps) {
        deps.worldRuntimeMonsterActionApplyService.applyMonsterBasicAttack(action, deps);
    }    
    /**
 * applyMonsterSkill：更新/写入相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    applyMonsterSkill(action, deps) {
        deps.worldRuntimeMonsterActionApplyService.applyMonsterSkill(action, deps);
    }    
    /**
 * spawnGroundItem：执行核心业务逻辑。
 * @param instance 地图实例。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    spawnGroundItem(instance, x, y, item, deps) {
        deps.worldRuntimeItemGroundService.spawnGroundItem(instance, x, y, item);
    }    
    /**
 * ensureAttackAllowed：执行核心业务逻辑。
 * @param player 玩家对象。
 * @param skill 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    ensureAttackAllowed(player, skill, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (skill && !isHostileSkill(skill)) {
            return;
        }
        if (!player.instanceId) {
            return;
        }
        const instance = deps.getInstanceRuntime(player.instanceId);
        if (!instance || !instance.isPointInSafeZone(player.x, player.y)) {
            return;
        }
        throw new common_1.BadRequestException('安全区内无法发起攻击。');
    }    
    /**
 * queuePlayerNotice：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param text 参数说明。
 * @param kind 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    queuePlayerNotice(playerId, text, kind, deps) {
        try {
            deps.playerRuntimeService.enqueueNotice(playerId, { text, kind });
        }
        catch {
            // 玩家已经不在线时忽略通知，避免影响主流程。
        }
    }    
    /**
 * pushCombatEffect：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param effect 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    pushCombatEffect(instanceId, effect, deps) {
        deps.worldRuntimeCombatEffectsService.pushCombatEffect(instanceId, effect);
    }    
    /**
 * pushActionLabelEffect：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param text 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    pushActionLabelEffect(instanceId, x, y, text, deps) {
        deps.worldRuntimeCombatEffectsService.pushActionLabelEffect(instanceId, x, y, text);
    }    
    /**
 * pushDamageFloatEffect：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param damage 参数说明。
 * @param color 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    pushDamageFloatEffect(instanceId, x, y, damage, color, deps) {
        deps.worldRuntimeCombatEffectsService.pushDamageFloatEffect(instanceId, x, y, damage, color);
    }    
    /**
 * pushAttackEffect：执行核心业务逻辑。
 * @param instanceId instance ID。
 * @param fromX 参数说明。
 * @param fromY 参数说明。
 * @param toX 参数说明。
 * @param toY 参数说明。
 * @param color 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    pushAttackEffect(instanceId, fromX, fromY, toX, toY, color, deps) {
        deps.worldRuntimeCombatEffectsService.pushAttackEffect(instanceId, fromX, fromY, toX, toY, color);
    }
};
exports.WorldRuntimeTickDispatchService = WorldRuntimeTickDispatchService;
exports.WorldRuntimeTickDispatchService = WorldRuntimeTickDispatchService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeTickDispatchService);

export { WorldRuntimeTickDispatchService };
