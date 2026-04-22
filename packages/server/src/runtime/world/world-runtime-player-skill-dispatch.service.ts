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
exports.WorldRuntimePlayerSkillDispatchService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");
const player_combat_service_1 = require("../combat/player-combat.service");
const player_combat_config_helpers_1 = require("../player/player-combat-config.helpers");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");
const { findPlayerSkill, getSkillEffectColor, resolveRuntimeSkillRange } = world_runtime_normalization_helpers_1;
const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const { chebyshevDistance } = world_runtime_path_planning_helpers_1;
const world_runtime_observation_helpers_1 = require("./world-runtime.observation.helpers");
const { createTileCombatAttributes, createTileCombatNumericStats, createTileCombatRatioDivisors } = world_runtime_observation_helpers_1;

function ensureHostileRelation(resolution) {
    if ((0, player_combat_config_helpers_1.isHostileCombatRelationResolution)(resolution)) {
        return;
    }
    if (resolution?.blockedReason === 'self_target') {
        throw new common_1.BadRequestException('不能攻击自己');
    }
    throw new common_1.BadRequestException('当前目标不在敌方判定规则内');
}

/** 玩家技能派发服务：承接 player skill dispatch 与 legacy target 解析。 */
let WorldRuntimePlayerSkillDispatchService = class WorldRuntimePlayerSkillDispatchService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * playerCombatService：玩家战斗服务引用。
 */

    playerCombatService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param playerCombatService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService, playerCombatService) {
        this.playerRuntimeService = playerRuntimeService;
        this.playerCombatService = playerCombatService;
    }    
    /**
 * dispatchCastSkill：判断Cast技能是否满足条件。
 * @param playerId 玩家 ID。
 * @param skillId skill ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetRef 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能相关状态。
 */

    dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef = null, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const attacker = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
        this.playerRuntimeService.recordActivity(playerId, currentTick, { interruptCultivation: true });
        deps.worldRuntimeCraftInterruptService.interruptCraftForReason(playerId, attacker, 'attack', deps);
        if (!attacker.instanceId) {
            throw new common_1.BadRequestException(`Player ${playerId} not attached to instance`);
        }
        const skill = findPlayerSkill(attacker, skillId);
        if (!skill) {
            throw new common_1.NotFoundException(`Skill ${skillId} not found`);
        }
        deps.ensureAttackAllowed(attacker, skill);
        if (targetRef && !targetMonsterId && !targetPlayerId) {
            const resolvedTarget = this.resolveLegacySkillTargetRef(attacker, skill, targetRef, deps);
            if (!resolvedTarget) {
                throw new common_1.BadRequestException('没有可命中的目标');
            }
            if (resolvedTarget.kind === 'monster') {
                this.dispatchCastSkillToMonster(attacker, skillId, resolvedTarget.monsterId, deps);
                return;
            }
            if (resolvedTarget.kind === 'tile') {
                this.dispatchCastSkillToTile(attacker, skillId, resolvedTarget.x, resolvedTarget.y, deps);
                return;
            }
            this.dispatchCastSkill(playerId, skillId, resolvedTarget.playerId, null, null, deps);
            return;
        }
        if (targetMonsterId) {
            this.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps);
            return;
        }
        if (!targetPlayerId) {
            throw new common_1.BadRequestException('targetPlayerId or targetMonsterId is required');
        }
        const target = this.playerRuntimeService.getPlayerOrThrow(targetPlayerId);
        if (attacker.instanceId !== target.instanceId) {
            throw new common_1.BadRequestException(`Target ${targetPlayerId} not in same instance`);
        }
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, {
            kind: 'player',
            target,
        }));
        const distance = chebyshevDistance(attacker.x, attacker.y, target.x, target.y);
        const result = this.playerCombatService.castSkill(attacker, target, skillId, currentTick, distance);
        const effectColor = getSkillEffectColor(skill);
        deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, skill.name);
        deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, target.x, target.y, effectColor);
        if (result.totalDamage > 0) {
            deps.pushDamageFloatEffect(attacker.instanceId, target.x, target.y, result.totalDamage, effectColor);
        }
        this.playerRuntimeService.recordActivity(target.playerId, currentTick, { interruptCultivation: true });
        const updatedTarget = this.playerRuntimeService.getPlayer(target.playerId);
        if (updatedTarget && updatedTarget.hp <= 0) {
            deps.handlePlayerDefeat(updatedTarget.playerId, attacker.playerId);
        }
    }    
    /**
 * resolveLegacySkillTargetRef：读取Legacy技能目标Ref并返回结果。
 * @param attacker 参数说明。
 * @param skill 参数说明。
 * @param targetRef 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Legacy技能目标Ref相关状态。
 */

    resolveLegacySkillTargetRef(attacker, skill, targetRef, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!attacker.instanceId) {
            return null;
        }
        const targetPlayerId = targetRef.startsWith('player:') ? targetRef.slice('player:'.length).trim() : '';
        if (targetPlayerId) {
            const target = this.playerRuntimeService.getPlayer(targetPlayerId);
            if (!target || target.playerId === attacker.playerId || target.instanceId !== attacker.instanceId || target.hp <= 0) {
                return null;
            }
            if (!(0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, {
                kind: 'player',
                target,
            }))) {
                return null;
            }
            return { kind: 'player', playerId: target.playerId };
        }
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        if (!targetRef.startsWith('tile:')) {
            const monster = instance.getMonster(targetRef);
            if (!monster?.alive) {
                return null;
            }
            if (!(0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'monster' }))) {
                return null;
            }
            return { kind: 'monster', monsterId: monster.runtimeId };
        }
        const tile = (0, shared_1.parseTileTargetRef)(targetRef);
        if (!tile) {
            return null;
        }
        const directDistance = chebyshevDistance(attacker.x, attacker.y, tile.x, tile.y);
        if (
            directDistance <= resolveRuntimeSkillRange(skill)
            && instance.getTileCombatState(tile.x, tile.y)
            && (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }))
        ) {
            return { kind: 'tile', x: tile.x, y: tile.y };
        }
        const affectedCells = (0, shared_1.computeAffectedCellsFromAnchor)({ x: attacker.x, y: attacker.y }, { x: tile.x, y: tile.y }, {
            range: resolveRuntimeSkillRange(skill),
            shape: skill.targeting?.shape,
            radius: skill.targeting?.radius,
            width: skill.targeting?.width,
            height: skill.targeting?.height,
        });
        if (affectedCells.length === 0) {
            return null;
        }
        const monsters = instance.listMonsters()
            .filter((entry) => entry.alive)
            .sort((left, right) => chebyshevDistance(tile.x, tile.y, left.x, left.y) - chebyshevDistance(tile.x, tile.y, right.x, right.y));
        for (const cell of affectedCells) {
            const monster = monsters.find((entry) => entry.x === cell.x && entry.y === cell.y);
            if (
                monster
                && (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'monster' }))
            ) {
                return { kind: 'monster', monsterId: monster.runtimeId };
            }
        }
        const players = this.playerRuntimeService.listPlayerSnapshots()
            .filter((entry) => entry.instanceId === attacker.instanceId && entry.playerId !== attacker.playerId && entry.hp > 0)
            .sort((left, right) => chebyshevDistance(tile.x, tile.y, left.x, left.y) - chebyshevDistance(tile.x, tile.y, right.x, right.y));
        for (const cell of affectedCells) {
            const player = players.find((entry) => entry.x === cell.x && entry.y === cell.y);
            if (
                player
                && (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, {
                    kind: 'player',
                    target: player,
                }))
            ) {
                return { kind: 'player', playerId: player.playerId };
            }
        }
        for (const cell of affectedCells) {
            if (
                instance.getTileCombatState(cell.x, cell.y)
                && (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }))
            ) {
                return { kind: 'tile', x: cell.x, y: cell.y };
            }
        }
        return null;
    }    
    /**
 * dispatchCastSkillToMonster：判断Cast技能To怪物是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetMonsterId targetMonster ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能To怪物相关状态。
 */

    dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const target = instance.getMonster(targetMonsterId);
        if (!target) {
            throw new common_1.NotFoundException(`Monster ${targetMonsterId} not found`);
        }
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'monster' }));
        const distance = chebyshevDistance(attacker.x, attacker.y, target.x, target.y);
        const currentTick = deps.resolveCurrentTickForPlayerId(attacker.playerId);
        const result = this.playerCombatService.castSkillToMonster(attacker, {
            runtimeId: target.runtimeId,
            monsterId: target.monsterId,
            hp: target.hp,
            maxHp: target.maxHp,
            qi: 0,
            maxQi: 0,
            attrs: {
                finalAttrs: target.attrs,
                numericStats: target.numericStats,
                ratioDivisors: target.ratioDivisors,
            },
            buffs: target.buffs,
        }, skillId, currentTick, distance, (buff) => {
            instance.applyTemporaryBuffToMonster(targetMonsterId, buff);
        });
        const skill = findPlayerSkill(attacker, skillId);
        const effectColor = skill ? getSkillEffectColor(skill) : (0, shared_1.getDamageTrailColor)('spell');
        if (skill) {
            deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, skill.name);
        }
        deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, target.x, target.y, effectColor);
        if (result.totalDamage <= 0) {
            return;
        }
        deps.pushDamageFloatEffect(attacker.instanceId, target.x, target.y, result.totalDamage, effectColor);
        const outcome = instance.applyDamageToMonster(targetMonsterId, result.totalDamage, attacker.playerId);
        if (!outcome?.defeated) {
            return;
        }
        deps.handlePlayerMonsterKill(instance, outcome.monster, attacker.playerId);
    }    
    /**
 * dispatchCastSkillToTile：判断Cast技能ToTile是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能ToTile相关状态。
 */

    dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const tileState = instance.getTileCombatState(targetX, targetY);
        if (!tileState || tileState.destroyed) {
            throw new common_1.BadRequestException('该目标无法被攻击');
        }
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
        const distance = chebyshevDistance(attacker.x, attacker.y, targetX, targetY);
        const currentTick = deps.resolveCurrentTickForPlayerId(attacker.playerId);
        const result = this.playerCombatService.castSkillToMonster(attacker, {
            runtimeId: `tile:${targetX}:${targetY}`,
            monsterId: `tile:${tileState.tileType}`,
            hp: tileState.hp,
            maxHp: tileState.maxHp,
            qi: 0,
            maxQi: 0,
            attrs: {
                finalAttrs: createTileCombatAttributes(),
                numericStats: createTileCombatNumericStats(tileState.maxHp),
                ratioDivisors: createTileCombatRatioDivisors(),
            },
            buffs: [],
        }, skillId, currentTick, distance, () => undefined);
        const skill = findPlayerSkill(attacker, skillId);
        const effectColor = skill ? getSkillEffectColor(skill) : (0, shared_1.getDamageTrailColor)('spell');
        if (skill) {
            deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, skill.name);
        }
        deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, targetX, targetY, effectColor);
        if (result.totalDamage <= 0) {
            return;
        }
        deps.pushDamageFloatEffect(attacker.instanceId, targetX, targetY, result.totalDamage, effectColor);
        instance.damageTile(targetX, targetY, result.totalDamage);
    }
};
exports.WorldRuntimePlayerSkillDispatchService = WorldRuntimePlayerSkillDispatchService;
exports.WorldRuntimePlayerSkillDispatchService = WorldRuntimePlayerSkillDispatchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        player_combat_service_1.PlayerCombatService])
], WorldRuntimePlayerSkillDispatchService);

export { WorldRuntimePlayerSkillDispatchService };
