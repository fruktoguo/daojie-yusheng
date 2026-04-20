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
 * getLegacyNavigationPath：读取Legacy导航路径。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Legacy导航路径的读取/组装。
 */

    getLegacyNavigationPath(playerId, deps) {
        return deps.worldRuntimeNavigationService.getLegacyNavigationPath(playerId, deps);
    }    
    /**
 * applyTransfer：处理Transfer并更新相关状态。
 * @param transfer 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Transfer相关状态。
 */

    applyTransfer(transfer, deps) {
        deps.worldRuntimeTransferService.applyTransfer(transfer, deps);
    }    
    /**
 * materializeNavigationCommands：执行materialize导航Command相关逻辑。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新materialize导航Command相关状态。
 */

    materializeNavigationCommands(deps) {
        deps.worldRuntimeNavigationService.materializeNavigationCommands(deps);
    }    
    /**
 * resolveNavigationStep：规范化或转换导航Step。
 * @param playerId 玩家 ID。
 * @param intent 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新导航Step相关状态。
 */

    resolveNavigationStep(playerId, intent, deps) {
        return deps.worldRuntimeNavigationService.resolveNavigationStep(playerId, intent, deps);
    }    
    /**
 * resolveNavigationDestination：规范化或转换导航Destination。
 * @param playerId 玩家 ID。
 * @param intent 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新导航Destination相关状态。
 */

    resolveNavigationDestination(playerId, intent, deps) {
        return deps.worldRuntimeNavigationService.resolveNavigationDestination(playerId, intent, deps);
    }    
    /**
 * materializeAutoCombatCommands：执行materializeAuto战斗Command相关逻辑。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新materializeAuto战斗Command相关状态。
 */

    materializeAutoCombatCommands(deps) {
        deps.worldRuntimeAutoCombatService.materializeAutoCombatCommands(deps);
    }    
    /**
 * buildAutoCombatCommand：构建并返回目标对象。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Auto战斗Command相关状态。
 */

    buildAutoCombatCommand(instance, player, deps) {
        return deps.worldRuntimeAutoCombatService.buildAutoCombatCommand(instance, player, deps);
    }    
    /**
 * selectAutoCombatTarget：读取selectAuto战斗目标并返回结果。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param visibleMonsters 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新selectAuto战斗目标相关状态。
 */

    selectAutoCombatTarget(instance, player, visibleMonsters, deps) {
        return deps.worldRuntimeAutoCombatService.selectAutoCombatTarget(instance, player, visibleMonsters, deps);
    }    
    /**
 * resolveTrackedAutoCombatTarget：读取TrackedAuto战斗目标并返回结果。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param visibleMonsters 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TrackedAuto战斗目标相关状态。
 */

    resolveTrackedAutoCombatTarget(instance, player, visibleMonsters, deps) {
        return deps.worldRuntimeAutoCombatService.resolveTrackedAutoCombatTarget(instance, player, visibleMonsters, deps);
    }    
    /**
 * pickAutoBattleSkill：执行pickAutoBattle技能相关逻辑。
 * @param player 玩家对象。
 * @param distance 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新pickAutoBattle技能相关状态。
 */

    pickAutoBattleSkill(player, distance, deps) {
        return deps.worldRuntimeAutoCombatService.pickAutoBattleSkill(player, distance);
    }    
    /**
 * resolveAutoBattleDesiredRange：规范化或转换AutoBattleDesired范围。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新AutoBattleDesired范围相关状态。
 */

    resolveAutoBattleDesiredRange(player, deps) {
        return deps.worldRuntimeAutoCombatService.resolveAutoBattleDesiredRange(player);
    }    
    /**
 * dispatchPendingCommands：判断待处理Command是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新PendingCommand相关状态。
 */

    dispatchPendingCommands(deps) {
        deps.worldRuntimePendingCommandService.dispatchPendingCommands(deps);
    }    
    /**
 * dispatchPendingSystemCommands：判断待处理SystemCommand是否满足条件。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新PendingSystemCommand相关状态。
 */

    dispatchPendingSystemCommands(deps) {
        deps.worldRuntimeSystemCommandService.dispatchPendingSystemCommands(deps);
    }    
    /**
 * dispatchInstanceCommand：判断InstanceCommand是否满足条件。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新InstanceCommand相关状态。
 */

    dispatchInstanceCommand(playerId, command, deps) {
        deps.worldRuntimeMovementService.dispatchInstanceCommand(playerId, command, deps);
    }    
    /**
 * dispatchPlayerCommand：判断玩家Command是否满足条件。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家Command相关状态。
 */

    dispatchPlayerCommand(playerId, command, deps) {
        deps.worldRuntimePlayerCommandService.dispatchPlayerCommand(playerId, command, deps);
    }    
    /**
 * dispatchSystemCommand：判断SystemCommand是否满足条件。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新SystemCommand相关状态。
 */

    dispatchSystemCommand(command, deps) {
        deps.worldRuntimeSystemCommandService.dispatchSystemCommand(command, deps);
    }    
    /**
 * dispatchMoveTo：判断MoveTo是否满足条件。
 * @param playerId 玩家 ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param allowNearestReachable 参数说明。
 * @param clientPathHint 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新MoveTo相关状态。
 */

    dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint, deps) {
        deps.worldRuntimeNavigationService.dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint, deps);
    }    
    /**
 * applyMonsterAction：处理怪物Action并更新相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新怪物Action相关状态。
 */

    applyMonsterAction(action, deps) {
        deps.worldRuntimeMonsterActionApplyService.applyMonsterAction(action, deps);
    }    
    /**
 * applyMonsterBasicAttack：处理怪物BasicAttack并更新相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新怪物BasicAttack相关状态。
 */

    applyMonsterBasicAttack(action, deps) {
        deps.worldRuntimeMonsterActionApplyService.applyMonsterBasicAttack(action, deps);
    }    
    /**
 * applyMonsterSkill：处理怪物技能并更新相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新怪物技能相关状态。
 */

    applyMonsterSkill(action, deps) {
        deps.worldRuntimeMonsterActionApplyService.applyMonsterSkill(action, deps);
    }    
    /**
 * spawnGroundItem：执行spawn地面道具相关逻辑。
 * @param instance 地图实例。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新spawnGround道具相关状态。
 */

    spawnGroundItem(instance, x, y, item, deps) {
        deps.worldRuntimeItemGroundService.spawnGroundItem(instance, x, y, item);
    }    
    /**
 * ensureAttackAllowed：执行ensureAttackAllowed相关逻辑。
 * @param player 玩家对象。
 * @param skill 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新ensureAttackAllowed相关状态。
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
 * queuePlayerNotice：执行queue玩家Notice相关逻辑。
 * @param playerId 玩家 ID。
 * @param text 参数说明。
 * @param kind 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新queue玩家Notice相关状态。
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
 * pushCombatEffect：处理战斗Effect并更新相关状态。
 * @param instanceId instance ID。
 * @param effect 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新战斗Effect相关状态。
 */

    pushCombatEffect(instanceId, effect, deps) {
        deps.worldRuntimeCombatEffectsService.pushCombatEffect(instanceId, effect);
    }    
    /**
 * pushActionLabelEffect：处理ActionLabelEffect并更新相关状态。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param text 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新ActionLabelEffect相关状态。
 */

    pushActionLabelEffect(instanceId, x, y, text, deps) {
        deps.worldRuntimeCombatEffectsService.pushActionLabelEffect(instanceId, x, y, text);
    }    
    /**
 * pushDamageFloatEffect：处理DamageFloatEffect并更新相关状态。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param damage 参数说明。
 * @param color 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新DamageFloatEffect相关状态。
 */

    pushDamageFloatEffect(instanceId, x, y, damage, color, deps) {
        deps.worldRuntimeCombatEffectsService.pushDamageFloatEffect(instanceId, x, y, damage, color);
    }    
    /**
 * pushAttackEffect：处理AttackEffect并更新相关状态。
 * @param instanceId instance ID。
 * @param fromX 参数说明。
 * @param fromY 参数说明。
 * @param toX 参数说明。
 * @param toY 参数说明。
 * @param color 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新AttackEffect相关状态。
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
