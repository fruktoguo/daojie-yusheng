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
exports.WorldRuntimeMonsterActionApplyService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");
const player_combat_service_1 = require("../combat/player-combat.service");
const combat_resolution_helpers_1 = require("../combat/combat-resolution.helpers");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_combat_effects_service_1 = require("./world-runtime-combat-effects.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");
const { getSkillEffectColor, resolveRuntimeSkillRange } = world_runtime_normalization_helpers_1;
const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const { chebyshevDistance } = world_runtime_path_planning_helpers_1;
const world_runtime_observation_helpers_1 = require("./world-runtime.observation.helpers");
const {
    formatCombatDamageBreakdown,
    formatCombatActionClause,
    formatCombatResolutionOutcome,
    formatCombatResolutionFloatText,
    getCombatResolutionFloatColor,
} = world_runtime_observation_helpers_1;
function resolvePrimaryDamageRoll(result, fallbackDamageKind, fallbackElement) {
    const firstRoll = Array.isArray(result?.damageRolls)
        ? result.damageRolls.find((entry) => entry && typeof entry === 'object')
        : null;
    if (firstRoll) {
        return {
            ...firstRoll,
            rawDamage: Number.isFinite(Number(firstRoll.rawDamage))
                ? Number(firstRoll.rawDamage)
                : Math.max(0, Math.round(Number(result?.totalRawDamage ?? result?.totalDamage) || 0)),
            damage: Number.isFinite(Number(firstRoll.damage))
                ? Number(firstRoll.damage)
                : Math.max(0, Math.round(Number(result?.totalDamage) || 0)),
            damageKind: firstRoll.damageKind ?? result?.damageKind ?? fallbackDamageKind,
            element: firstRoll.element ?? result?.damageElement ?? fallbackElement,
        };
    }
    return {
        hit: Math.max(0, Math.round(Number(result?.totalDamage) || 0)) > 0,
        rawDamage: Math.max(0, Math.round(Number(result?.totalRawDamage ?? result?.totalDamage) || 0)),
        damage: Math.max(0, Math.round(Number(result?.totalDamage) || 0)),
        crit: result?.crit === true,
        dodged: result?.dodged === true,
        resolved: result?.resolved === true,
        broken: result?.broken === true,
        damageKind: result?.damageKind ?? fallbackDamageKind,
        element: result?.damageElement ?? fallbackElement,
    };
}
function pushCombatResolutionFloat(effectsService, instanceId, x, y, resolution, fallbackColor) {
    const text = formatCombatResolutionFloatText(resolution);
    if (!text) {
        return;
    }
    effectsService.pushCombatTextFloatEffect(
        instanceId,
        x,
        y,
        text,
        getCombatResolutionFloatColor(resolution, fallbackColor),
        920,
    );
}

/** 妖兽动作落地服务：承接 monster action apply 与 monster skill apply。 */
let WorldRuntimeMonsterActionApplyService = class WorldRuntimeMonsterActionApplyService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * playerCombatService：玩家战斗服务引用。
 */

    playerCombatService;    
    /**
 * worldRuntimeCombatEffectsService：世界运行态战斗Effect服务引用。
 */

    worldRuntimeCombatEffectsService;    
    /**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(WorldRuntimeMonsterActionApplyService.name);    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param playerCombatService 参数说明。
 * @param worldRuntimeCombatEffectsService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService, playerCombatService, worldRuntimeCombatEffectsService) {
        this.playerRuntimeService = playerRuntimeService;
        this.playerCombatService = playerCombatService;
        this.worldRuntimeCombatEffectsService = worldRuntimeCombatEffectsService;
    }    
    /**
 * applyMonsterAction：处理怪物Action并更新相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新怪物Action相关状态。
 */

    applyMonsterAction(action, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (action.kind === 'skill_chant') {
            this.applyMonsterSkillChant(action, deps);
            return;
        }
        if (action.kind === 'skill') {
            this.applyMonsterSkill(action, deps);
            return;
        }
        this.applyMonsterBasicAttack(action, deps);
    }    
    applyMonsterSkillChant(action, deps) {
        if (!action.skillId) {
            return;
        }
        const instance = deps.getInstanceRuntime(action.instanceId);
        if (!instance) {
            return;
        }
        const monster = instance.getMonster(action.runtimeId);
        if (!monster || !monster.alive) {
            return;
        }
        const skill = monster.skills.find((entry) => entry.id === action.skillId);
        if (!skill) {
            return;
        }
        const durationMs = Math.max(1, Math.round(Number(action.durationMs) || 1000));
        this.worldRuntimeCombatEffectsService.pushActionLabelEffect(action.instanceId, monster.x, monster.y, skill.name, {
            actionStyle: 'chant',
            durationMs: durationMs + 240,
        });
        const warningCells = Array.isArray(action.warningCells)
            ? action.warningCells.map((cell) => ({ x: cell.x, y: cell.y }))
            : [];
        if (warningCells.length > 0) {
            this.worldRuntimeCombatEffectsService.pushCombatEffect(action.instanceId, {
                type: 'warning_zone',
                cells: warningCells,
                color: typeof action.warningColor === 'string' && action.warningColor.trim().length > 0
                    ? action.warningColor.trim()
                    : '#ff3030',
                baseColor: '#ff8a8a',
                originX: Number.isFinite(action.warningOriginX) ? action.warningOriginX : undefined,
                originY: Number.isFinite(action.warningOriginY) ? action.warningOriginY : undefined,
                durationMs,
            });
        }
    }
    /**
 * applyMonsterBasicAttack：处理怪物BasicAttack并更新相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新怪物BasicAttack相关状态。
 */

    applyMonsterBasicAttack(action, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const location = deps.getPlayerLocation(action.targetPlayerId);
        if (!location) {
            return;
        }
        const instance = deps.getInstanceRuntime(action.instanceId);
        if (!instance) {
            return;
        }
        const monster = instance.getMonster(action.runtimeId);
        if (!monster || !monster.alive) {
            return;
        }
        const runtimeTargetPosition = instance.getPlayerPosition(action.targetPlayerId);
        if (!runtimeTargetPosition) {
            return;
        }
        const player = this.playerRuntimeService.getPlayer(action.targetPlayerId);
        if (!player || player.instanceId !== location.instanceId || player.hp <= 0) {
            return;
        }
        const distance = chebyshevDistance(monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y);
        if (distance > monster.attackRange) {
            return;
        }
        if (typeof instance.canSeeTileFrom === 'function'
            && !instance.canSeeTileFrom(monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y, distance)) {
            return;
        }
        const damageKind = monster.numericStats.spellAtk > monster.numericStats.physAtk ? 'spell' : 'physical';
        const baseDamage = Math.max(1, Math.round(damageKind === 'spell'
            ? monster.numericStats.spellAtk
            : monster.numericStats.physAtk));
        const resolvedDamage = (0, combat_resolution_helpers_1.resolveCombatHit)({
            attackerStats: monster.numericStats,
            attackerRatios: monster.ratioDivisors,
            attackerRealmLv: Math.max(1, Math.floor(monster.level ?? 1)),
            attackerCombatExp: resolveMonsterCombatExpEquivalent(monster, this.playerRuntimeService),
            targetStats: player.attrs.numericStats,
            targetRatios: player.attrs.ratioDivisors,
            targetRealmLv: Math.max(1, Math.floor(player.realm?.realmLv ?? 1)),
            targetCombatExp: Math.max(0, Math.floor(player.combatExp ?? 0)),
            baseDamage,
            damageKind,
            damageMultiplier: 1,
        });
        const effectColor = (0, shared_1.getDamageTrailColor)(damageKind);
        this.worldRuntimeCombatEffectsService.pushActionLabelEffect(action.instanceId, monster.x, monster.y, '攻击');
        this.worldRuntimeCombatEffectsService.pushAttackEffect(action.instanceId, monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y, effectColor);
        pushCombatResolutionFloat(this.worldRuntimeCombatEffectsService, action.instanceId, runtimeTargetPosition.x, runtimeTargetPosition.y, resolvedDamage, effectColor);
        const currentTick = deps.resolveCurrentTickForPlayerId(action.targetPlayerId);
        let updated = player;
        if (resolvedDamage.damage > 0) {
            updated = this.playerRuntimeService.applyDamage(action.targetPlayerId, resolvedDamage.damage);
            this.worldRuntimeCombatEffectsService.pushDamageFloatEffect(action.instanceId, runtimeTargetPosition.x, runtimeTargetPosition.y, resolvedDamage.damage, effectColor);
            deps.queuePlayerNotice?.(
                action.targetPlayerId,
                `${formatCombatActionClause(monster.name ?? monster.monsterId ?? action.runtimeId, '你', '攻击')}，${formatCombatResolutionOutcome(resolvedDamage, damageKind)}`,
                'combat',
            );
            this.playerRuntimeService.activateAutoRetaliate(action.targetPlayerId, currentTick);
        }
        else {
            deps.queuePlayerNotice?.(
                action.targetPlayerId,
                `${formatCombatActionClause(monster.name ?? monster.monsterId ?? action.runtimeId, '你', '攻击')}，${formatCombatResolutionOutcome(resolvedDamage, damageKind)}`,
                'combat',
            );
        }
        this.playerRuntimeService.recordActivity(action.targetPlayerId, currentTick, {
            interruptCultivation: true,
        });
        if (updated.hp <= 0) {
            deps.handlePlayerDefeat(updated.playerId);
        }
    }    
    /**
 * applyMonsterSkill：处理怪物技能并更新相关状态。
 * @param action 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新怪物技能相关状态。
 */

    applyMonsterSkill(action, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!action.skillId) {
            return;
        }
        const location = deps.getPlayerLocation?.(action.targetPlayerId);
        if (!location || location.instanceId !== action.instanceId) {
            return;
        }
        const instance = deps.getInstanceRuntime(action.instanceId);
        if (!instance) {
            return;
        }
        const monster = instance.getMonster(action.runtimeId);
        if (!monster || !monster.alive) {
            return;
        }
        const skill = monster.skills.find((entry) => entry.id === action.skillId);
        if (!skill) {
            return;
        }
        const runtimeTargetPosition = instance.getPlayerPosition(action.targetPlayerId);
        if (!runtimeTargetPosition) {
            return;
        }
        const warningCells = Array.isArray(action.warningCells)
            ? action.warningCells
                .map((cell) => ({ x: Math.trunc(Number(cell?.x)), y: Math.trunc(Number(cell?.y)) }))
                .filter((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y))
            : [];
        const hasAnchoredCast = Number.isFinite(Number(action.targetX)) && Number.isFinite(Number(action.targetY));
        const distanceAnchor = hasAnchoredCast
            ? { x: Math.trunc(Number(action.targetX)), y: Math.trunc(Number(action.targetY)) }
            : runtimeTargetPosition;
        const distance = skill.requiresTarget === false
            ? 0
            : chebyshevDistance(monster.x, monster.y, distanceAnchor.x, distanceAnchor.y);
        if (typeof instance.canSeeTileFrom === 'function'
            && skill.requiresTarget !== false
            && !instance.canSeeTileFrom(monster.x, monster.y, distanceAnchor.x, distanceAnchor.y, distance)) {
            return;
        }
        const effectColor = skill ? getSkillEffectColor(skill) : (0, shared_1.getDamageTrailColor)('spell');
        const selectedTargets = skill.requiresTarget === false
            ? []
            : collectMonsterSkillRuntimeTargets(instance, this.playerRuntimeService, deps, action, runtimeTargetPosition, warningCells, skill);
        if (skill.requiresTarget !== false && selectedTargets.length === 0) {
            if (hasAnchoredCast || warningCells.length > 0) {
                this.worldRuntimeCombatEffectsService.pushActionLabelEffect(action.instanceId, monster.x, monster.y, skill.name);
                this.worldRuntimeCombatEffectsService.pushAttackEffect(action.instanceId, monster.x, monster.y, distanceAnchor.x, distanceAnchor.y, effectColor);
            }
            return;
        }
        const selfBuffTarget = skill.requiresTarget === false
            ? this.playerRuntimeService.getPlayer(action.targetPlayerId)
            : null;
        if (skill.requiresTarget === false && (!selfBuffTarget || selfBuffTarget.hp <= 0)) {
            return;
        }
        try {
            const currentTick = instance.tick;
            const targetEntries = skill.requiresTarget === false
                ? [{ player: selfBuffTarget, position: runtimeTargetPosition }]
                : selectedTargets;
            let labelPushed = false;
            let qiSpent = false;
            for (let index = 0; index < targetEntries.length; index += 1) {
                const entry = targetEntries[index];
                const player = entry.player;
                if (!player || player.hp <= 0 || !isPlayerLocatedInActionInstance(deps, player.playerId, action.instanceId)) {
                    continue;
                }
                const result = this.playerCombatService.castMonsterSkill({
                    runtimeId: monster.runtimeId,
                    monsterId: monster.monsterId,
                    hp: monster.hp,
                    maxHp: monster.maxHp,
                    qi: monster.qi,
                    maxQi: monster.maxQi,
                    level: monster.level,
                    combatExp: resolveMonsterCombatExpEquivalent(monster, this.playerRuntimeService),
                    skills: monster.skills,
                    cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId,
                    attrs: {
                        finalAttrs: monster.attrs,
                        numericStats: monster.numericStats,
                        ratioDivisors: monster.ratioDivisors,
                    },
                    buffs: monster.buffs,
                }, player, action.skillId, currentTick, distance, (buff) => {
                    instance.applyTemporaryBuffToMonster(monster.runtimeId, buff);
                }, (buff) => {
                    this.playerRuntimeService.applyTemporaryBuff(player.playerId, buff);
                }, (amount) => {
                    if (qiSpent) {
                        return;
                    }
                    qiSpent = true;
                    monster.qi = Math.max(0, Math.round((monster.qi ?? 0) - amount));
                    instance.markMonsterRuntimePersistenceDirty(monster.runtimeId);
                }, {
                    skipResourceAndCooldown: index > 0,
                    targetCount: Math.max(1, targetEntries.length),
                });
                if (skill && !labelPushed) {
                    this.worldRuntimeCombatEffectsService.pushActionLabelEffect(action.instanceId, monster.x, monster.y, skill.name);
                    labelPushed = true;
                }
                if (skill.requiresTarget === false) {
                    continue;
                }
                const targetPosition = entry.position;
                this.worldRuntimeCombatEffectsService.pushAttackEffect(action.instanceId, monster.x, monster.y, targetPosition.x, targetPosition.y, effectColor);
                const primaryRoll = resolvePrimaryDamageRoll(result, result.damageKind ?? 'spell', result.damageElement);
                pushCombatResolutionFloat(this.worldRuntimeCombatEffectsService, action.instanceId, targetPosition.x, targetPosition.y, primaryRoll, effectColor);
                if (result.totalDamage > 0) {
                    this.worldRuntimeCombatEffectsService.pushDamageFloatEffect(action.instanceId, targetPosition.x, targetPosition.y, result.totalDamage, effectColor);
                    deps.queuePlayerNotice?.(
                        player.playerId,
                        `${formatCombatActionClause(monster.name ?? monster.monsterId ?? action.runtimeId, '你', skill?.name ?? action.skillId)}，${formatCombatResolutionOutcome(primaryRoll, primaryRoll.damageKind ?? result.damageKind ?? 'spell', primaryRoll.element ?? result.damageElement)}`,
                        'combat',
                    );
                    this.playerRuntimeService.activateAutoRetaliate(player.playerId, currentTick);
                }
                else {
                    deps.queuePlayerNotice?.(
                        player.playerId,
                        `${formatCombatActionClause(monster.name ?? monster.monsterId ?? action.runtimeId, '你', skill?.name ?? action.skillId)}，${formatCombatResolutionOutcome(primaryRoll, primaryRoll.damageKind ?? result.damageKind ?? 'spell', primaryRoll.element ?? result.damageElement)}`,
                        'combat',
                    );
                }
                this.playerRuntimeService.recordActivity(player.playerId, currentTick, {
                    interruptCultivation: true,
                });
                const updatedPlayer = this.playerRuntimeService.getPlayer(player.playerId);
                if (updatedPlayer && updatedPlayer.hp <= 0) {
                    deps.handlePlayerDefeat(updatedPlayer.playerId);
                }
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            (deps.logger ?? this.logger).warn(`处理妖兽技能 ${action.skillId}（来源 ${action.runtimeId}）失败：${message}`);
        }
    }
};
exports.WorldRuntimeMonsterActionApplyService = WorldRuntimeMonsterActionApplyService;
exports.WorldRuntimeMonsterActionApplyService = WorldRuntimeMonsterActionApplyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        player_combat_service_1.PlayerCombatService,
        world_runtime_combat_effects_service_1.WorldRuntimeCombatEffectsService])
], WorldRuntimeMonsterActionApplyService);

export { WorldRuntimeMonsterActionApplyService };

function collectMonsterSkillRuntimeTargets(instance, playerRuntimeService, deps, action, fallbackPosition, warningCells, skill) {
    const maxTargets = resolveMonsterSkillMaxTargets(skill);
    const entries = [];
    const seenPlayerIds = new Set();
    const pushPlayerAtPosition = (playerId, position) => {
        if (!playerId || seenPlayerIds.has(playerId) || entries.length >= maxTargets) {
            return;
        }
        const player = playerRuntimeService.getPlayer(playerId);
        if (!player || player.hp <= 0 || !isPlayerLocatedInActionInstance(deps, playerId, action.instanceId)) {
            return;
        }
        seenPlayerIds.add(playerId);
        entries.push({
            player,
            position: {
                x: Math.trunc(Number(position.x)),
                y: Math.trunc(Number(position.y)),
            },
        });
    };
    if (Array.isArray(warningCells) && warningCells.length > 0) {
        if (typeof instance.getPlayersAtTile === 'function') {
            for (const cell of warningCells) {
                if (entries.length >= maxTargets) {
                    break;
                }
                for (const tilePlayer of instance.getPlayersAtTile(cell.x, cell.y) ?? []) {
                    pushPlayerAtPosition(tilePlayer.playerId, { x: cell.x, y: cell.y });
                    if (entries.length >= maxTargets) {
                        break;
                    }
                }
            }
        }
        else if (warningCells.some((cell) => cell.x === fallbackPosition.x && cell.y === fallbackPosition.y)) {
            pushPlayerAtPosition(action.targetPlayerId, fallbackPosition);
        }
        return entries;
    }
    pushPlayerAtPosition(action.targetPlayerId, fallbackPosition);
    return entries;
}
function isPlayerLocatedInActionInstance(deps, playerId, instanceId) {
    const location = typeof deps?.getPlayerLocation === 'function'
        ? deps.getPlayerLocation(playerId)
        : null;
    return Boolean(location && location.instanceId === instanceId);
}
function resolveMonsterSkillMaxTargets(skill) {
    const configured = Number(skill?.targeting?.maxTargets);
    if (Number.isFinite(configured) && configured > 0) {
        return Math.max(1, Math.floor(configured));
    }
    const shape = skill?.targeting?.shape ?? 'single';
    if (shape === 'single') {
        return 1;
    }
    const geometry = {
        range: resolveRuntimeSkillRange(skill),
        shape,
        radius: skill?.targeting?.radius,
        innerRadius: skill?.targeting?.innerRadius,
        width: skill?.targeting?.width,
        height: skill?.targeting?.height,
        checkerParity: skill?.targeting?.checkerParity,
    };
    const width = Math.max(1, Math.round(Number(geometry.width) || 1));
    const height = Math.max(1, Math.round(Number(geometry.height) || 1));
    const radius = Math.max(1, Math.round(Number(geometry.radius) || geometry.range || 1));
    if (shape === 'box' || shape === 'checkerboard') {
        return width * height;
    }
    if (shape === 'line') {
        return Math.max(1, geometry.range) * width;
    }
    return Math.max(1, (radius * 2 + 1) * (radius * 2 + 1));
}

function resolveMonsterCombatExpEquivalent(monster, playerRuntimeService) {
    const level = Math.max(1, Math.floor(Number(monster?.level) || 1));
    const progressionService = playerRuntimeService?.playerProgressionService;
    if (typeof progressionService?.getMonsterCombatExpEquivalent === 'function') {
        const resolved = progressionService.getMonsterCombatExpEquivalent(level);
        if (Number.isFinite(resolved) && resolved > 0) {
            return Math.floor(resolved);
        }
    }
    return level * 100;
}
