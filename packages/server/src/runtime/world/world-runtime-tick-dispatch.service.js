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
    getLegacyNavigationPath(playerId, deps) {
        return deps.worldRuntimeNavigationService.getLegacyNavigationPath(playerId, deps);
    }
    applyTransfer(transfer, deps) {
        deps.worldRuntimeTransferService.applyTransfer(transfer, deps);
    }
    materializeNavigationCommands(deps) {
        deps.worldRuntimeNavigationService.materializeNavigationCommands(deps);
    }
    resolveNavigationStep(playerId, intent, deps) {
        return deps.worldRuntimeNavigationService.resolveNavigationStep(playerId, intent, deps);
    }
    resolveNavigationDestination(playerId, intent, deps) {
        return deps.worldRuntimeNavigationService.resolveNavigationDestination(playerId, intent, deps);
    }
    materializeAutoCombatCommands(deps) {
        deps.worldRuntimeAutoCombatService.materializeAutoCombatCommands(deps);
    }
    buildAutoCombatCommand(instance, player, deps) {
        return deps.worldRuntimeAutoCombatService.buildAutoCombatCommand(instance, player, deps);
    }
    selectAutoCombatTarget(instance, player, visibleMonsters, deps) {
        return deps.worldRuntimeAutoCombatService.selectAutoCombatTarget(instance, player, visibleMonsters, deps);
    }
    resolveTrackedAutoCombatTarget(instance, player, visibleMonsters, deps) {
        return deps.worldRuntimeAutoCombatService.resolveTrackedAutoCombatTarget(instance, player, visibleMonsters, deps);
    }
    pickAutoBattleSkill(player, distance, deps) {
        return deps.worldRuntimeAutoCombatService.pickAutoBattleSkill(player, distance);
    }
    resolveAutoBattleDesiredRange(player, deps) {
        return deps.worldRuntimeAutoCombatService.resolveAutoBattleDesiredRange(player);
    }
    dispatchPendingCommands(deps) {
        deps.worldRuntimePendingCommandService.dispatchPendingCommands(deps);
    }
    dispatchPendingSystemCommands(deps) {
        deps.worldRuntimeSystemCommandService.dispatchPendingSystemCommands(deps);
    }
    dispatchInstanceCommand(playerId, command, deps) {
        deps.worldRuntimeMovementService.dispatchInstanceCommand(playerId, command, deps);
    }
    dispatchPlayerCommand(playerId, command, deps) {
        deps.worldRuntimePlayerCommandService.dispatchPlayerCommand(playerId, command, deps);
    }
    dispatchSystemCommand(command, deps) {
        deps.worldRuntimeSystemCommandService.dispatchSystemCommand(command, deps);
    }
    dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint, deps) {
        deps.worldRuntimeNavigationService.dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint, deps);
    }
    applyMonsterAction(action, deps) {
        deps.worldRuntimeMonsterActionApplyService.applyMonsterAction(action, deps);
    }
    applyMonsterBasicAttack(action, deps) {
        deps.worldRuntimeMonsterActionApplyService.applyMonsterBasicAttack(action, deps);
    }
    applyMonsterSkill(action, deps) {
        deps.worldRuntimeMonsterActionApplyService.applyMonsterSkill(action, deps);
    }
    spawnGroundItem(instance, x, y, item, deps) {
        deps.worldRuntimeItemGroundService.spawnGroundItem(instance, x, y, item);
    }
    ensureAttackAllowed(player, skill, deps) {
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
    queuePlayerNotice(playerId, text, kind, deps) {
        try {
            deps.playerRuntimeService.enqueueNotice(playerId, { text, kind });
        }
        catch {
            // 玩家已经不在线时忽略通知，避免影响主流程。
        }
    }
    pushCombatEffect(instanceId, effect, deps) {
        deps.worldRuntimeCombatEffectsService.pushCombatEffect(instanceId, effect);
    }
    pushActionLabelEffect(instanceId, x, y, text, deps) {
        deps.worldRuntimeCombatEffectsService.pushActionLabelEffect(instanceId, x, y, text);
    }
    pushDamageFloatEffect(instanceId, x, y, damage, color, deps) {
        deps.worldRuntimeCombatEffectsService.pushDamageFloatEffect(instanceId, x, y, damage, color);
    }
    pushAttackEffect(instanceId, fromX, fromY, toX, toY, color, deps) {
        deps.worldRuntimeCombatEffectsService.pushAttackEffect(instanceId, fromX, fromY, toX, toY, color);
    }
};
exports.WorldRuntimeTickDispatchService = WorldRuntimeTickDispatchService;
exports.WorldRuntimeTickDispatchService = WorldRuntimeTickDispatchService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeTickDispatchService);
