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
exports.WorldRuntimeAutoCombatService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const player_combat_config_helpers_1 = require("../player/player-combat-config.helpers");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");
const { findPlayerSkill, resolveAutoBattleSkillQiCost } = world_runtime_normalization_helpers_1;
const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const { chebyshevDistance, findNextDirectionOnMap, buildAutoBattleGoalPoints } = world_runtime_path_planning_helpers_1;

/** 自动战斗编排服务：承接 auto-targeting 与 auto command 物化。 */
let WorldRuntimeAutoCombatService = class WorldRuntimeAutoCombatService {
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
 * materializeAutoCombatCommands：执行materializeAuto战斗Command相关逻辑。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新materializeAuto战斗Command相关状态。
 */

    materializeAutoCombatCommands(deps) {
        for (const playerId of deps.listConnectedPlayerIds()) {
            if (deps.hasPendingCommand(playerId) || deps.worldRuntimeNavigationService.hasNavigationIntent(playerId)) {
                continue;
            }
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || player.hp <= 0) {
                continue;
            }
            if (!player.combat.autoBattle && !player.combat.autoRetaliate) {
                continue;
            }
            const location = deps.getPlayerLocation(playerId);
            if (!location) {
                continue;
            }
            const instance = deps.getInstanceRuntime(location.instanceId);
            if (!instance) {
                continue;
            }
            if (player.combat.autoBattle && instance.isSafeZoneTile(player.x, player.y)) {
                const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
                this.playerRuntimeService.updateCombatSettings(playerId, { autoBattle: false }, currentTick);
                this.playerRuntimeService.clearCombatTarget(playerId, currentTick);
                deps.queuePlayerNotice(playerId, '安全区内无法发起攻击，自动战斗已停止。', 'warn');
                continue;
            }
            const command = this.buildAutoCombatCommand(instance, player, deps);
            if (command) {
                deps.enqueuePendingCommand(playerId, command);
            }
        }
    }    
    /**
 * buildAutoCombatCommand：构建并返回目标对象。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Auto战斗Command相关状态。
 */

    buildAutoCombatCommand(instance, player, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (instance.isPointInSafeZone(player.x, player.y)) {
            return null;
        }
        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
        const view = instance.buildPlayerView(player.playerId, radius);
        if (!view) {
            return null;
        }
        const target = this.selectAutoCombatTarget(instance, player, view, deps);
        if (!target) {
            return null;
        }
        const distance = chebyshevDistance(player.x, player.y, target.x, target.y);
        const skillId = this.pickAutoBattleSkill(player, distance);
        if (skillId) {
            if (target.kind === 'monster') {
                return {
                    kind: 'castSkill',
                    skillId,
                    targetPlayerId: null,
                    targetMonsterId: target.runtimeId,
                    targetRef: null,
                };
            }
            return {
                kind: 'castSkill',
                skillId,
                targetPlayerId: null,
                targetMonsterId: null,
                targetRef: target.targetRef,
            };
        }
        if (distance <= 1) {
            return {
                kind: 'basicAttack',
                targetPlayerId: target.kind === 'player' ? target.playerId : null,
                targetMonsterId: target.kind === 'monster' ? target.runtimeId : null,
                targetX: target.kind === 'tile' ? target.x : null,
                targetY: target.kind === 'tile' ? target.y : null,
            };
        }
        if (player.combat.autoBattleStationary) {
            return null;
        }
        const desiredRange = this.resolveAutoBattleDesiredRange(player);
        if (desiredRange > 1 && distance <= desiredRange) {
            return null;
        }
        const goals = buildAutoBattleGoalPoints(instance, target.x, target.y, desiredRange);
        const direction = findNextDirectionOnMap(instance, player.playerId, player.x, player.y, goals, false);
        if (direction === null) {
            return null;
        }
        return {
            kind: 'move',
            direction,
            continuous: true,
        };
    }    
    /**
 * selectAutoCombatTarget：读取selectAuto战斗目标并返回结果。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param visibleMonsters 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新selectAuto战斗目标相关状态。
 */

    selectAutoCombatTarget(instance, player, view, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (player.combat.autoBattle) {
            const trackedTarget = this.resolveTrackedAutoCombatTarget(instance, player, view, deps);
            if (trackedTarget) {
                return trackedTarget;
            }
        }
        const bestPlayer = this.selectAutoCombatPlayerTarget(player, view);
        let best = null;
        let bestAggro = -1;
        let bestDistance = Number.MAX_SAFE_INTEGER;
        let bestHp = Number.MAX_SAFE_INTEGER;
        for (const monster of view.localMonsters) {
            const liveMonster = instance.getMonster(monster.runtimeId);
            if (!liveMonster?.alive) {
                continue;
            }
            const retaliating = liveMonster.aggroTargetPlayerId === player.playerId;
            if (!player.combat.autoBattle && !retaliating) {
                continue;
            }
            const aggroRank = retaliating ? 1 : 0;
            const distance = chebyshevDistance(player.x, player.y, monster.x, monster.y);
            if (aggroRank > bestAggro
                || (aggroRank === bestAggro && distance < bestDistance)
                || (aggroRank === bestAggro && distance === bestDistance && monster.hp < bestHp)
                || (aggroRank === bestAggro && distance === bestDistance && monster.hp === bestHp && best && monster.runtimeId < best.runtimeId)) {
                best = monster;
                bestAggro = aggroRank;
                bestDistance = distance;
                bestHp = monster.hp;
            }
        }
        if (best && player.combat.autoBattle && player.combat.combatTargetId !== best.runtimeId) {
            this.playerRuntimeService.setCombatTarget(player.playerId, best.runtimeId, false, deps.resolveCurrentTickForPlayerId(player.playerId));
        }
        if (!bestPlayer) {
            return best;
        }
        if (!best) {
            if (player.combat.autoBattle && player.combat.combatTargetId !== `player:${bestPlayer.playerId}`) {
                this.playerRuntimeService.setCombatTarget(player.playerId, `player:${bestPlayer.playerId}`, false, deps.resolveCurrentTickForPlayerId(player.playerId));
            }
            return bestPlayer;
        }
        const playerPriority = bestPlayer.priority ?? 0;
        const monsterPriority = bestAggro > 0 ? 2 : 0;
        if (playerPriority > monsterPriority
            || (playerPriority === monsterPriority && bestPlayer.hp < bestHp)
            || (playerPriority === monsterPriority && bestPlayer.hp === bestHp && chebyshevDistance(player.x, player.y, bestPlayer.x, bestPlayer.y) <= bestDistance)) {
            if (player.combat.autoBattle && player.combat.combatTargetId !== `player:${bestPlayer.playerId}`) {
                this.playerRuntimeService.setCombatTarget(player.playerId, `player:${bestPlayer.playerId}`, false, deps.resolveCurrentTickForPlayerId(player.playerId));
            }
            return bestPlayer;
        }
        return best;
    }    
    /**
 * resolveTrackedAutoCombatTarget：读取TrackedAuto战斗目标并返回结果。
 * @param instance 地图实例。
 * @param player 玩家对象。
 * @param visibleMonsters 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TrackedAuto战斗目标相关状态。
 */

    resolveTrackedAutoCombatTarget(instance, player, view, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const targetRuntimeId = player.combat.combatTargetId;
        if (!targetRuntimeId) {
            return null;
        }
        const radius = Math.max(1, Math.round(player.attrs.numericStats.viewRange));
        if (targetRuntimeId.startsWith('player:')) {
            const targetPlayerId = targetRuntimeId.slice('player:'.length).trim();
            if (!targetPlayerId) {
                return null;
            }
            const trackedPlayer = this.playerRuntimeService.getPlayer(targetPlayerId);
            if (trackedPlayer?.instanceId === player.instanceId
                && trackedPlayer.playerId !== player.playerId
                && trackedPlayer.hp > 0
                && (0, player_combat_config_helpers_1.canPlayerDealDamageToPlayer)(player, trackedPlayer)
                && chebyshevDistance(player.x, player.y, trackedPlayer.x, trackedPlayer.y) <= radius) {
                return {
                    kind: 'player',
                    playerId: trackedPlayer.playerId,
                    targetRef: `player:${trackedPlayer.playerId}`,
                    x: trackedPlayer.x,
                    y: trackedPlayer.y,
                    hp: trackedPlayer.hp,
                };
            }
            return this.handleMissingTrackedTarget(player, deps);
        }
        if (targetRuntimeId.startsWith('tile:')) {
            const tile = shared_1.parseTileTargetRef(targetRuntimeId);
            if (!tile || !instance.getTileCombatState(tile.x, tile.y) || chebyshevDistance(player.x, player.y, tile.x, tile.y) > radius) {
                return this.handleMissingTrackedTarget(player, deps);
            }
            return {
                kind: 'tile',
                targetRef: targetRuntimeId,
                x: tile.x,
                y: tile.y,
                hp: Number.MAX_SAFE_INTEGER,
            };
        }
        const visibleTarget = view.localMonsters.find((entry) => entry.runtimeId === targetRuntimeId);
        if (visibleTarget) {
            return {
                kind: 'monster',
                runtimeId: visibleTarget.runtimeId,
                targetRef: visibleTarget.runtimeId,
                x: visibleTarget.x,
                y: visibleTarget.y,
                hp: visibleTarget.hp,
            };
        }
        const trackedTarget = instance.getMonster(targetRuntimeId);
        if (trackedTarget?.alive && chebyshevDistance(player.x, player.y, trackedTarget.x, trackedTarget.y) <= radius) {
            return {
                kind: 'monster',
                runtimeId: trackedTarget.runtimeId,
                targetRef: trackedTarget.runtimeId,
                x: trackedTarget.x,
                y: trackedTarget.y,
                hp: trackedTarget.hp,
            };
        }
        return this.handleMissingTrackedTarget(player, deps);
    }    
    /**
 * handleMissingTrackedTarget：处理丢失的锁定目标。
 * @param player 玩家对象。
 * @param deps 运行时依赖。
 * @returns 返回空结果。
 */

    handleMissingTrackedTarget(player, deps) {
        const locked = player.combat.combatTargetLocked;
        if (locked) {
            const currentTick = deps.resolveCurrentTickForPlayerId(player.playerId);
            this.playerRuntimeService.updateCombatSettings(player.playerId, { autoBattle: false }, currentTick);
            deps.queuePlayerNotice(player.playerId, '强制攻击目标已经失去踪迹，自动战斗已停止。', 'combat');
            return null;
        }
        this.playerRuntimeService.clearCombatTarget(player.playerId, deps.resolveCurrentTickForPlayerId(player.playerId));
        return null;
    }
    /** 从可见玩家里选出当前最合适的自动战斗目标。 */
    selectAutoCombatPlayerTarget(player, view) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let best = null;
        for (const visible of view.visiblePlayers ?? []) {
            const target = this.playerRuntimeService.getPlayer(visible.playerId);
            if (!target || target.instanceId !== player.instanceId || target.hp <= 0) {
                continue;
            }
            if (!(0, player_combat_config_helpers_1.canPlayerDealDamageToPlayer)(player, target)) {
                continue;
            }
            const retaliating = player.combat.retaliatePlayerTargetId === target.playerId;
            const demonized = (0, player_combat_config_helpers_1.isPlayerPassivelyHostileTarget)(target);
            if (!player.combat.autoBattle && !retaliating) {
                continue;
            }
            const priority = retaliating ? 3 : demonized ? 1 : 0;
            const distance = chebyshevDistance(player.x, player.y, target.x, target.y);
            if (!best
                || priority > best.priority
                || (priority === best.priority && distance < best.distance)
                || (priority === best.priority && distance === best.distance && target.hp < best.hp)
                || (priority === best.priority && distance === best.distance && target.hp === best.hp && target.playerId < best.playerId)) {
                best = {
                    kind: 'player',
                    playerId: target.playerId,
                    targetRef: `player:${target.playerId}`,
                    x: target.x,
                    y: target.y,
                    hp: target.hp,
                    distance,
                    priority,
                };
            }
        }
        return best;
    }    
    /**
 * pickAutoBattleSkill：执行pickAutoBattle技能相关逻辑。
 * @param player 玩家对象。
 * @param distance 参数说明。
 * @returns 无返回值，直接更新pickAutoBattle技能相关状态。
 */

    pickAutoBattleSkill(player, distance) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const action of player.actions.actions) {
            if (action.type !== 'skill') {
                continue;
            }
            if (action.autoBattleEnabled === false || action.skillEnabled === false) {
                continue;
            }
            if ((action.cooldownLeft ?? 0) > 0) {
                continue;
            }
            const range = Math.max(1, Math.round(action.range ?? 1));
            if (distance > range) {
                continue;
            }
            const skill = findPlayerSkill(player, action.id);
            if (!skill) {
                continue;
            }
            if (player.qi < resolveAutoBattleSkillQiCost(skill.cost, player.attrs.numericStats.maxQiOutputPerTick)) {
                continue;
            }
            return skill.id;
        }
        return null;
    }    
    /**
 * resolveAutoBattleDesiredRange：规范化或转换AutoBattleDesired范围。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新AutoBattleDesired范围相关状态。
 */

    resolveAutoBattleDesiredRange(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let desiredRange = 1;
        for (const action of player.actions.actions) {
            if (action.type !== 'skill') {
                continue;
            }
            if (action.autoBattleEnabled === false || action.skillEnabled === false) {
                continue;
            }
            const skill = findPlayerSkill(player, action.id);
            if (!skill) {
                continue;
            }
            if (player.qi < resolveAutoBattleSkillQiCost(skill.cost, player.attrs.numericStats.maxQiOutputPerTick)) {
                continue;
            }
            desiredRange = Math.max(desiredRange, Math.max(1, Math.round(action.range ?? 1)));
        }
        return desiredRange;
    }
};
exports.WorldRuntimeAutoCombatService = WorldRuntimeAutoCombatService;
exports.WorldRuntimeAutoCombatService = WorldRuntimeAutoCombatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeAutoCombatService);

export { WorldRuntimeAutoCombatService };
