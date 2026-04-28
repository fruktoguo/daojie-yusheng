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
const { formatCombatActionClause, formatCombatDamageBreakdown } = world_runtime_observation_helpers_1;

function ensureHostileRelation(resolution) {
    if ((0, player_combat_config_helpers_1.isHostileCombatRelationResolution)(resolution)) {
        return;
    }
    if (resolution?.blockedReason === 'self_target') {
        throw new common_1.BadRequestException('不能攻击自己');
    }
    throw new common_1.BadRequestException('当前目标不在敌方判定规则内');
}
function ensureInstanceSupportsPlayerCombat(instance) {
    if (instance?.meta?.supportsPvp === true) {
        return;
    }
    throw new common_1.BadRequestException('当前实例不允许玩家互攻');
}
function ensureInstanceSupportsTileDamage(instance) {
    if (instance?.meta?.canDamageTile === true) {
        return;
    }
    throw new common_1.BadRequestException('当前实例不允许攻击地块');
}
function formatAuraDamage(value) {
    const amount = Math.max(0, Number(value) || 0);
    if (amount <= 0) {
        return '0';
    }
    if (amount < 1) {
        return amount.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    }
    return amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function buildEffectivePlayerSkillGeometry(attacker, skill) {
    return (0, shared_1.buildEffectiveTargetingGeometry)({
        range: resolveRuntimeSkillRange(skill),
        shape: skill.targeting?.shape ?? 'single',
        radius: skill.targeting?.radius,
        innerRadius: skill.targeting?.innerRadius,
        width: skill.targeting?.width,
        height: skill.targeting?.height,
        checkerParity: skill.targeting?.checkerParity,
    }, {
        extraRange: Math.max(0, Math.floor(attacker.attrs?.numericStats?.extraRange ?? 0)),
        extraArea: Math.max(0, Math.floor(attacker.attrs?.numericStats?.extraArea ?? 0)),
    });
}

function resolveSkillTargetLimit(skill) {
    const configuredMaxTargets = skill.targeting?.maxTargets;
    if (!Number.isFinite(configuredMaxTargets) || (configuredMaxTargets ?? 0) <= 0) {
        return 99;
    }
    return Math.max(1, Math.round(configuredMaxTargets));
}

function getTemporaryTileEffects(skill) {
    return (skill.effects ?? []).filter((effect) => effect?.type === 'temporary_tile');
}

function isTemporaryTileSkill(skill) {
    return getTemporaryTileEffects(skill).length > 0;
}

function resolveTechniqueLevelForSkill(player, skillId) {
    for (const technique of player.techniques?.techniques ?? []) {
        if ((technique.skills ?? []).some((entry) => entry.id === skillId)) {
            return Math.max(1, Math.trunc(Number(technique.level) || 1));
        }
    }
    return 1;
}

function spendSkillCostAndStartCooldown(playerRuntimeService, attacker, skill, currentTick) {
    const readyTick = attacker.combat?.cooldownReadyTickBySkillId?.[skill.id] ?? 0;
    if (currentTick < readyTick) {
        throw new common_1.BadRequestException(`Skill ${skill.id} cooling down`);
    }
    const plannedCost = Math.max(0, Math.round(Number(skill.cost) || 0));
    const qiCost = Math.round((0, shared_1.calcQiCostWithOutputLimit)(plannedCost, Math.max(0, attacker.attrs?.numericStats?.maxQiOutputPerTick ?? 0)));
    if (qiCost > 0) {
        if (!Number.isFinite(qiCost) || attacker.qi < qiCost) {
            throw new common_1.BadRequestException(`Skill ${skill.id} qi insufficient`);
        }
        playerRuntimeService.spendQi(attacker.playerId, qiCost);
    }
    playerRuntimeService.setSkillCooldownReadyTick(attacker.playerId, skill.id, currentTick + Math.max(1, Math.round(skill.cooldown ?? 1)), currentTick);
    return qiCost;
}

function evaluateCasterSkillFormula(formula, attacker, techLevel, targetCount) {
    if (typeof formula === 'number') {
        return formula;
    }
    if (!formula || typeof formula !== 'object') {
        return 0;
    }
    if ('var' in formula) {
        return resolveCasterSkillFormulaVar(formula.var, attacker, techLevel, targetCount) * (formula.scale ?? 1);
    }
    if (formula.op === 'clamp') {
        const value = evaluateCasterSkillFormula(formula.value, attacker, techLevel, targetCount);
        const min = formula.min === undefined ? Number.NEGATIVE_INFINITY : evaluateCasterSkillFormula(formula.min, attacker, techLevel, targetCount);
        const max = formula.max === undefined ? Number.POSITIVE_INFINITY : evaluateCasterSkillFormula(formula.max, attacker, techLevel, targetCount);
        return Math.min(max, Math.max(min, value));
    }
    const values = Array.isArray(formula.args)
        ? formula.args.map((entry) => evaluateCasterSkillFormula(entry, attacker, techLevel, targetCount))
        : [];
    switch (formula.op) {
        case 'add':
            return values.reduce((sum, value) => sum + value, 0);
        case 'sub':
            return values.slice(1).reduce((sum, value) => sum - value, values[0] ?? 0);
        case 'mul':
            return values.reduce((product, value) => product * value, 1);
        case 'div':
            return values.slice(1).reduce((sum, value) => (value === 0 ? sum : sum / value), values[0] ?? 0);
        case 'min':
            return values.length > 0 ? Math.min(...values) : 0;
        case 'max':
            return values.length > 0 ? Math.max(...values) : 0;
        default:
            return 0;
    }
}

function resolveCasterSkillFormulaVar(variable, attacker, techLevel, targetCount) {
    if (variable === 'techLevel') {
        return techLevel;
    }
    if (variable === 'targetCount') {
        return targetCount;
    }
    if (variable === 'caster.hp') {
        return attacker.hp ?? 0;
    }
    if (variable === 'caster.maxHp') {
        return attacker.maxHp ?? 0;
    }
    if (variable === 'caster.qi') {
        return attacker.qi ?? 0;
    }
    if (variable === 'caster.maxQi') {
        return attacker.maxQi ?? 0;
    }
    if (typeof variable === 'string' && variable.startsWith('caster.attr.')) {
        return attacker.attrs?.finalAttrs?.[variable.slice('caster.attr.'.length)] ?? 0;
    }
    if (typeof variable === 'string' && variable.startsWith('caster.stat.')) {
        return attacker.attrs?.numericStats?.[variable.slice('caster.stat.'.length)] ?? 0;
    }
    if (typeof variable === 'string' && variable.startsWith('caster.buff.') && variable.endsWith('.stacks')) {
        const buffId = variable.slice('caster.buff.'.length, -'.stacks'.length);
        const buff = attacker.buffs?.buffs?.find((entry) => entry.buffId === buffId);
        return buff ? Math.max(0, Number(buff.stacks) || 0) : 0;
    }
    return 0;
}

function getResolvedSkillTargetKey(target) {
    if (target.kind === 'monster') {
        return `monster:${target.monsterId}`;
    }
    if (target.kind === 'formation') {
        return `formation:${target.formationId}`;
    }
    if (target.kind === 'formation_boundary') {
        return `formation-boundary:${target.formationId}:${target.x}:${target.y}`;
    }
    if (target.kind === 'player') {
        return `player:${target.playerId}`;
    }
    return `tile:${target.x}:${target.y}`;
}

function ensurePlayerSkillActionEnabled(player, skillId) {
    const action = player.actions?.actions?.find((entry) => entry.id === skillId && entry.type === 'skill');
    if (!action) {
        throw new common_1.NotFoundException(`Skill action ${skillId} not found`);
    }
    if (action.skillEnabled === false) {
        throw new common_1.BadRequestException('技能未启用，无法释放');
    }
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

    async dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef = null, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const attacker = this.playerRuntimeService.getPlayerOrThrow(playerId);
        ensurePlayerSkillActionEnabled(attacker, skillId);
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
        if (isTemporaryTileSkill(skill)) {
            if (!targetRef) {
                throw new common_1.BadRequestException('必须选择地块目标');
            }
            const tile = (0, shared_1.parseTileTargetRef)(targetRef);
            if (!tile) {
                throw new common_1.BadRequestException('必须选择地块目标');
            }
            return this.dispatchTemporaryTileSkill(attacker, skill, tile.x, tile.y, currentTick, deps);
        }
        if (targetRef && !targetMonsterId && !targetPlayerId) {
            const tileAnchor = (0, shared_1.parseTileTargetRef)(targetRef);
            const resolvedTarget = this.resolveLegacySkillTargetRef(attacker, skill, targetRef, deps);
            if (!resolvedTarget) {
                throw new common_1.BadRequestException('没有可命中的目标');
            }
            if (tileAnchor) {
                return this.dispatchCastSkillAtAnchor(attacker, skillId, skill, tileAnchor, resolvedTarget, deps);
            }
            if (resolvedTarget.kind === 'monster') {
                return this.dispatchCastSkillToMonster(attacker, skillId, resolvedTarget.monsterId, deps);
            }
            if (resolvedTarget.kind === 'tile') {
                return this.dispatchCastSkillToTile(attacker, skillId, resolvedTarget.x, resolvedTarget.y, deps);
            }
            if (resolvedTarget.kind === 'formation') {
                return this.dispatchCastSkillToFormation(attacker, skillId, resolvedTarget.formationId, deps);
            }
            if (resolvedTarget.kind === 'formation_boundary') {
                return this.dispatchCastSkillToTile(attacker, skillId, resolvedTarget.x, resolvedTarget.y, deps);
            }
            return this.dispatchCastSkill(playerId, skillId, resolvedTarget.playerId, null, null, deps);
        }
        if (targetMonsterId) {
            const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
                ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, targetMonsterId)
                : null;
            if (formation) {
                return this.dispatchCastSkillToFormation(attacker, skillId, targetMonsterId, deps);
            }
            return this.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps);
        }
        if (!targetPlayerId) {
            throw new common_1.BadRequestException('targetPlayerId or targetMonsterId is required');
        }
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        ensureInstanceSupportsPlayerCombat(instance);
        const target = this.playerRuntimeService.getPlayerOrThrow(targetPlayerId);
        if (attacker.instanceId !== target.instanceId) {
            throw new common_1.BadRequestException(`Target ${targetPlayerId} not in same instance`);
        }
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, {
            kind: 'player',
            target,
        }));
        const targets = this.collectSkillTargetsFromAnchor(attacker, skill, { x: target.x, y: target.y }, deps, {
            kind: 'player',
            playerId: target.playerId,
            x: target.x,
            y: target.y,
        });
        if (targets.length === 0) {
            throw new common_1.BadRequestException('没有可命中的目标');
        }
        await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps);
    }    
    async dispatchCastSkillAtAnchor(attacker, skillId, skill, anchor, primaryTarget, deps) {
        const targets = this.collectSkillTargetsFromAnchor(attacker, skill, anchor, deps, primaryTarget);
        if (targets.length === 0) {
            throw new common_1.BadRequestException('没有可命中的目标');
        }
        await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps);
    }
    dispatchTemporaryTileSkill(attacker, skill, targetX, targetY, currentTick, deps) {
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const geometry = buildEffectivePlayerSkillGeometry(attacker, skill);
        const anchor = { x: Math.trunc(Number(targetX)), y: Math.trunc(Number(targetY)) };
        const cells = (0, shared_1.computeAffectedCellsFromAnchor)({ x: attacker.x, y: attacker.y }, anchor, geometry);
        if (cells.length === 0) {
            throw new common_1.BadRequestException(`Skill ${skill.id} out of range`);
        }
        const effects = getTemporaryTileEffects(skill);
        const techLevel = resolveTechniqueLevelForSkill(attacker, skill.id);
        const plans = [];
        for (const effect of effects) {
            const targetCells = effect.excludeAnchor === true
                ? cells.filter((cell) => cell.x !== anchor.x || cell.y !== anchor.y)
                : cells;
            const availableCells = targetCells.filter((cell) => instance.canCreateTemporaryTile?.(cell.x, cell.y) === true);
            if (availableCells.length <= 0) {
                continue;
            }
            const hp = Math.max(1, Math.round(evaluateCasterSkillFormula(effect.hpFormula, attacker, techLevel, Math.max(1, targetCells.length))));
            const durationTicks = Math.max(1, Math.round(Number(effect.durationTicks) || 1));
            const tileType = typeof effect.tileType === 'string' && effect.tileType.length > 0 ? effect.tileType : shared_1.TileType.Stone;
            plans.push({ effect, cells: availableCells, hp, durationTicks, tileType });
        }
        if (plans.length <= 0) {
            throw new common_1.BadRequestException('没有可生成石头的地块');
        }
        spendSkillCostAndStartCooldown(this.playerRuntimeService, attacker, skill, currentTick);
        deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, skill.name);
        let created = 0;
        for (const plan of plans) {
            for (const cell of plan.cells) {
                const result = instance.createTemporaryTile?.(cell.x, cell.y, plan.tileType, plan.hp, plan.durationTicks, currentTick, {
                    ownerPlayerId: attacker.playerId,
                    sourceSkillId: skill.id,
                });
                if (result?.created === true) {
                    created += 1;
                    deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, cell.x, cell.y, getSkillEffectColor(skill));
                }
            }
        }
        deps.queuePlayerNotice?.(attacker.playerId, `${skill.name}生成了 ${created} 处临时石头。`, 'combat');
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
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const targetPlayerId = targetRef.startsWith('player:') ? targetRef.slice('player:'.length).trim() : '';
        if (targetPlayerId) {
            if (instance?.meta?.supportsPvp !== true) {
                return null;
            }
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
        if (!targetRef.startsWith('tile:')) {
            const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
                ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, targetRef)
                : null;
            if (formation) {
                if (!(0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }))) {
                    return null;
                }
                return { kind: 'formation', formationId: formation.id };
            }
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
        const geometry = buildEffectivePlayerSkillGeometry(attacker, skill);
        const directDistance = chebyshevDistance(attacker.x, attacker.y, tile.x, tile.y);
        const terrainHostile = (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
        const directBoundary = typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
            ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, tile.x, tile.y)
            : null;
        if (directDistance <= geometry.range && directBoundary && terrainHostile) {
            return { kind: 'formation_boundary', formationId: directBoundary.formationId, x: tile.x, y: tile.y };
        }
        const directTileState = instance.getTileCombatState(tile.x, tile.y);
        if (
            instance?.meta?.canDamageTile === true
            && (
            directDistance <= geometry.range
            && directTileState
            && directTileState.destroyed !== true
            && terrainHostile
            )
        ) {
            return { kind: 'tile', x: tile.x, y: tile.y };
        }
        const affectedCells = (0, shared_1.computeAffectedCellsFromAnchor)({ x: attacker.x, y: attacker.y }, { x: tile.x, y: tile.y }, geometry);
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
        const formations = typeof deps.worldRuntimeFormationService?.listRuntimeFormations === 'function'
            ? deps.worldRuntimeFormationService.listRuntimeFormations(attacker.instanceId)
                .filter((entry) => Number(entry.remainingAuraBudget) > 0)
                .sort((left, right) => chebyshevDistance(tile.x, tile.y, left.x, left.y) - chebyshevDistance(tile.x, tile.y, right.x, right.y))
            : [];
        for (const cell of affectedCells) {
            const formation = formations.find((entry) => entry.x === cell.x && entry.y === cell.y);
            if (
                formation
                && terrainHostile
            ) {
                return { kind: 'formation', formationId: formation.id };
            }
        }
        for (const cell of affectedCells) {
            const boundary = typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
                ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, cell.x, cell.y)
                : null;
            if (boundary && terrainHostile) {
                return { kind: 'formation_boundary', formationId: boundary.formationId, x: cell.x, y: cell.y };
            }
        }
        const players = this.playerRuntimeService.listPlayerSnapshots()
            .filter((entry) => entry.instanceId === attacker.instanceId && entry.playerId !== attacker.playerId && entry.hp > 0)
            .sort((left, right) => chebyshevDistance(tile.x, tile.y, left.x, left.y) - chebyshevDistance(tile.x, tile.y, right.x, right.y));
        for (const cell of affectedCells) {
            const player = players.find((entry) => entry.x === cell.x && entry.y === cell.y);
            if (
                instance?.meta?.supportsPvp === true
                && (
                player
                && (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, {
                    kind: 'player',
                    target: player,
                }))
                )
            ) {
                return { kind: 'player', playerId: player.playerId };
            }
        }
        for (const cell of affectedCells) {
            const tileState = instance.getTileCombatState(cell.x, cell.y);
            if (
                tileState
                && tileState.destroyed !== true
                && terrainHostile
            ) {
                return { kind: 'tile', x: cell.x, y: cell.y };
            }
        }
        return null;
    }

    collectSkillTargetsFromAnchor(attacker, skill, anchor, deps, primaryTarget = null) {
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const geometry = buildEffectivePlayerSkillGeometry(attacker, skill);
        const shape = geometry.shape ?? 'single';
        const cells = shape === 'single'
            ? (chebyshevDistance(attacker.x, attacker.y, anchor.x, anchor.y) <= geometry.range ? [{ x: anchor.x, y: anchor.y }] : [])
            : (0, shared_1.computeAffectedCellsFromAnchor)({ x: attacker.x, y: attacker.y }, { x: anchor.x, y: anchor.y }, geometry);
        if (cells.length === 0) {
            return [];
        }
        const maxTargets = resolveSkillTargetLimit(skill);
        const targets = [];
        const seen = new Set();
        const pushTarget = (target) => {
            if (targets.length >= maxTargets) {
                return;
            }
            const key = getResolvedSkillTargetKey(target);
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            targets.push(target);
        };
        if (primaryTarget) {
            pushTarget(primaryTarget);
        }
        const hostileMonster = (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'monster' }));
        const hostileFormation = (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
        const hostileTerrain = instance?.meta?.canDamageTile === true
            && (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
        const monsters = instance.listMonsters().filter((entry) => entry.alive);
        const formations = typeof deps.worldRuntimeFormationService?.listRuntimeFormations === 'function'
            ? deps.worldRuntimeFormationService.listRuntimeFormations(attacker.instanceId).filter((entry) => Number(entry.remainingAuraBudget) > 0)
            : [];
        const players = this.playerRuntimeService.listPlayerSnapshots()
            .filter((entry) => entry.instanceId === attacker.instanceId && entry.playerId !== attacker.playerId && entry.hp > 0);
        for (const cell of cells) {
            if (targets.length >= maxTargets) {
                break;
            }
            if (hostileMonster) {
                const monster = monsters.find((entry) => entry.x === cell.x && entry.y === cell.y);
                if (monster) {
                    pushTarget({ kind: 'monster', monsterId: monster.runtimeId, x: monster.x, y: monster.y });
                }
            }
            if (hostileFormation) {
                const formation = formations.find((entry) => entry.x === cell.x && entry.y === cell.y);
                if (formation) {
                    pushTarget({ kind: 'formation', formationId: formation.id, x: formation.x, y: formation.y });
                }
                const boundary = typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
                    ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, cell.x, cell.y)
                    : null;
                if (boundary) {
                    pushTarget({ kind: 'formation_boundary', formationId: boundary.formationId, x: cell.x, y: cell.y });
                }
            }
            if (instance?.meta?.supportsPvp === true) {
                const targetPlayer = players.find((entry) => entry.x === cell.x && entry.y === cell.y);
                if (
                    targetPlayer
                    && (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, {
                        kind: 'player',
                        target: targetPlayer,
                    }))
                ) {
                    pushTarget({ kind: 'player', playerId: targetPlayer.playerId, x: targetPlayer.x, y: targetPlayer.y });
                }
            }
            if (hostileTerrain) {
                const tileState = instance.getTileCombatState(cell.x, cell.y);
                if (tileState && !tileState.destroyed) {
                    pushTarget({ kind: 'tile', x: cell.x, y: cell.y });
                }
            }
        }
        return targets;
    }

    async dispatchSkillTargets(attacker, skillId, skill, targets, deps) {
        if (targets.length === 0) {
            throw new common_1.BadRequestException('没有可命中的目标');
        }
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const currentTick = deps.resolveCurrentTickForPlayerId(attacker.playerId);
        const effectColor = getSkillEffectColor(skill);
        const effectiveRange = buildEffectivePlayerSkillGeometry(attacker, skill).range;
        deps.pushActionLabelEffect(attacker.instanceId, attacker.x, attacker.y, skill.name);
        let castIndex = 0;
        const destroyedTiles = [];
        for (const target of targets) {
            const options = {
                targetCount: targets.length,
                skipResourceAndCooldown: castIndex > 0,
                range: effectiveRange,
            };
            if (target.kind === 'monster') {
                const monster = instance.getMonster(target.monsterId);
                if (!monster?.alive) {
                    continue;
                }
                const distance = chebyshevDistance(attacker.x, attacker.y, monster.x, monster.y);
                const result = this.playerCombatService.castSkillToMonster(attacker, {
                    runtimeId: monster.runtimeId,
                    monsterId: monster.monsterId,
                    hp: monster.hp,
                    maxHp: monster.maxHp,
                    qi: 0,
                    maxQi: 0,
                    attrs: {
                        finalAttrs: monster.attrs,
                        numericStats: monster.numericStats,
                        ratioDivisors: monster.ratioDivisors,
                    },
                    buffs: monster.buffs,
                }, skillId, currentTick, distance, (buff) => {
                    instance.applyTemporaryBuffToMonster(monster.runtimeId, buff);
                }, options);
                castIndex += 1;
                deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, monster.x, monster.y, effectColor);
                if (result.totalDamage <= 0) {
                    continue;
                }
                deps.pushDamageFloatEffect(attacker.instanceId, monster.x, monster.y, result.totalDamage, effectColor);
                const outcome = instance.applyDamageToMonster(monster.runtimeId, result.totalDamage, attacker.playerId);
                if (outcome?.defeated) {
                    await deps.handlePlayerMonsterKill(instance, outcome.monster, attacker.playerId);
                }
                continue;
            }
            if (target.kind === 'player') {
                const targetPlayer = this.playerRuntimeService.getPlayer(target.playerId);
                if (!targetPlayer || targetPlayer.instanceId !== attacker.instanceId || targetPlayer.hp <= 0) {
                    continue;
                }
                const distance = chebyshevDistance(attacker.x, attacker.y, targetPlayer.x, targetPlayer.y);
                const result = this.playerCombatService.castSkill(attacker, targetPlayer, skillId, currentTick, distance, options);
                castIndex += 1;
                deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, targetPlayer.x, targetPlayer.y, effectColor);
                if (result.totalDamage > 0) {
                    deps.pushDamageFloatEffect(attacker.instanceId, targetPlayer.x, targetPlayer.y, result.totalDamage, effectColor);
                }
                this.playerRuntimeService.recordActivity(targetPlayer.playerId, currentTick, { interruptCultivation: true });
                const updatedTarget = this.playerRuntimeService.getPlayer(targetPlayer.playerId);
                if (updatedTarget && updatedTarget.hp <= 0) {
                    await deps.handlePlayerDefeat(updatedTarget.playerId, attacker.playerId);
                }
                continue;
            }
            if (target.kind === 'formation') {
                const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
                    ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, target.formationId)
                    : null;
                if (!formation) {
                    continue;
                }
                const distance = chebyshevDistance(attacker.x, attacker.y, formation.x, formation.y);
                const effectiveDurability = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(formation.remainingAuraBudget * formation.damagePerAura)));
                const result = this.playerCombatService.castSkillToMonster(attacker, {
                    runtimeId: formation.id,
                    monsterId: formation.id,
                    hp: effectiveDurability,
                    maxHp: effectiveDurability,
                    qi: 0,
                    maxQi: 0,
                    attrs: {
                        finalAttrs: createTileCombatAttributes(),
                        numericStats: createTileCombatNumericStats(effectiveDurability),
                        ratioDivisors: createTileCombatRatioDivisors(),
                    },
                    buffs: [],
                }, skillId, currentTick, distance, () => undefined, options);
                castIndex += 1;
                deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, formation.x, formation.y, effectColor);
                if (result.totalDamage <= 0) {
                    continue;
                }
                const outcome = deps.worldRuntimeFormationService.applyDamageToFormation(
                    attacker.instanceId,
                    formation.id,
                    result.totalDamage,
                    attacker.playerId,
                    deps,
                );
                const appliedDamage = Number.isFinite(outcome?.appliedDamage) ? Math.max(0, Math.round(outcome.appliedDamage)) : 0;
                if (appliedDamage > 0) {
                    deps.pushDamageFloatEffect(attacker.instanceId, formation.x, formation.y, appliedDamage, effectColor);
                }
                deps.queuePlayerNotice?.(
                    attacker.playerId,
                    `${formatCombatActionClause('你', formation.name, '攻击')}，造成 ${formatCombatDamageBreakdown(result.totalDamage, appliedDamage, result.damageKind ?? 'spell')} 伤害，削减阵法灵力 ${formatAuraDamage(outcome?.auraDamage)}。`,
                    'combat',
                );
                continue;
            }
            if (target.kind === 'formation_boundary') {
                const boundary = typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
                    ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, target.x, target.y)
                    : null;
                if (!boundary) {
                    continue;
                }
                const distance = chebyshevDistance(attacker.x, attacker.y, target.x, target.y);
                const effectiveDurability = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(boundary.remainingAuraBudget * boundary.damagePerAura)));
                const result = this.playerCombatService.castSkillToMonster(attacker, {
                    runtimeId: `formation-boundary:${boundary.formationId}:${target.x}:${target.y}`,
                    monsterId: boundary.formationId,
                    hp: effectiveDurability,
                    maxHp: effectiveDurability,
                    qi: 0,
                    maxQi: 0,
                    attrs: {
                        finalAttrs: createTileCombatAttributes(),
                        numericStats: createTileCombatNumericStats(effectiveDurability),
                        ratioDivisors: createTileCombatRatioDivisors(),
                    },
                    buffs: [],
                }, skillId, currentTick, distance, () => undefined, options);
                castIndex += 1;
                deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, target.x, target.y, effectColor);
                if (result.totalDamage <= 0) {
                    continue;
                }
                const outcome = deps.worldRuntimeFormationService.applyDamageToBoundaryBarrier(
                    attacker.instanceId,
                    target.x,
                    target.y,
                    result.totalDamage,
                    attacker.playerId,
                    deps,
                );
                const appliedDamage = Number.isFinite(outcome?.appliedDamage) ? Math.max(0, Math.round(outcome.appliedDamage)) : 0;
                if (appliedDamage > 0) {
                    deps.pushDamageFloatEffect(attacker.instanceId, target.x, target.y, appliedDamage, effectColor);
                }
                deps.queuePlayerNotice?.(
                    attacker.playerId,
                    `${formatCombatActionClause('你', boundary.name, '攻击')}边界，造成 ${formatCombatDamageBreakdown(result.totalDamage, appliedDamage, result.damageKind ?? 'spell')} 伤害，削减阵法灵力 ${formatAuraDamage(outcome?.auraDamage)}。`,
                    'combat',
                );
                continue;
            }
            const tileState = instance.getTileCombatState(target.x, target.y);
            if (!tileState || tileState.destroyed) {
                continue;
            }
            const distance = chebyshevDistance(attacker.x, attacker.y, target.x, target.y);
            const result = this.playerCombatService.castSkillToMonster(attacker, {
                runtimeId: `tile:${target.x}:${target.y}`,
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
            }, skillId, currentTick, distance, () => undefined, options);
            castIndex += 1;
            deps.pushAttackEffect(attacker.instanceId, attacker.x, attacker.y, target.x, target.y, effectColor);
            if (result.totalDamage <= 0) {
                continue;
            }
            const mitigatedDamage = typeof deps.worldRuntimeFormationService?.mitigateTerrainDamage === 'function'
                ? deps.worldRuntimeFormationService.mitigateTerrainDamage(attacker.instanceId, target.x, target.y, result.totalDamage)
                : result.totalDamage;
            const tileDamageResult = instance.damageTile(target.x, target.y, mitigatedDamage);
            const appliedDamage = Number.isFinite(tileDamageResult?.appliedDamage) ? Math.max(0, Math.round(tileDamageResult.appliedDamage)) : 0;
            if (appliedDamage > 0) {
                deps.pushDamageFloatEffect(attacker.instanceId, target.x, target.y, appliedDamage, effectColor);
            }
            if (tileDamageResult?.destroyed === true) {
                destroyedTiles.push({ x: target.x, y: target.y });
            }
        }
        if (castIndex === 0) {
            throw new common_1.BadRequestException('没有可命中的目标');
        }
        for (const tile of destroyedTiles) {
            deps.worldRuntimeSectService?.expandSectForDestroyedTile?.(attacker.instanceId, tile.x, tile.y, deps);
        }
    }    
    async dispatchCastSkillToFormation(attacker, skillId, formationInstanceId, deps) {
  // 阵法按地形敌对规则承受技能，伤害折算为阵眼剩余灵力扣减。

        ensurePlayerSkillActionEnabled(attacker, skillId);
        const formation = typeof deps.worldRuntimeFormationService?.getFormationCombatState === 'function'
            ? deps.worldRuntimeFormationService.getFormationCombatState(attacker.instanceId, formationInstanceId)
            : null;
        if (!formation) {
            throw new common_1.NotFoundException(`Formation ${formationInstanceId} not found`);
        }
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
        const skill = findPlayerSkill(attacker, skillId);
        if (!skill) {
            throw new common_1.NotFoundException(`Skill ${skillId} not found`);
        }
        const targets = this.collectSkillTargetsFromAnchor(attacker, skill, { x: formation.x, y: formation.y }, deps, {
            kind: 'formation',
            formationId: formation.id,
            x: formation.x,
            y: formation.y,
        });
        if (targets.length === 0) {
            throw new common_1.BadRequestException('没有可命中的目标');
        }
        await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps);
    }    
    /**
 * dispatchCastSkillToMonster：判断Cast技能To怪物是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetMonsterId targetMonster ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能To怪物相关状态。
 */

    async dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        ensurePlayerSkillActionEnabled(attacker, skillId);
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const target = instance.getMonster(targetMonsterId);
        if (!target) {
            throw new common_1.NotFoundException(`Monster ${targetMonsterId} not found`);
        }
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'monster' }));
        const skill = findPlayerSkill(attacker, skillId);
        if (!skill) {
            throw new common_1.NotFoundException(`Skill ${skillId} not found`);
        }
        const targets = this.collectSkillTargetsFromAnchor(attacker, skill, { x: target.x, y: target.y }, deps, {
            kind: 'monster',
            monsterId: target.runtimeId,
            x: target.x,
            y: target.y,
        });
        if (targets.length === 0) {
            throw new common_1.BadRequestException('没有可命中的目标');
        }
        await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps);
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

    async dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        ensurePlayerSkillActionEnabled(attacker, skillId);
        const instance = deps.getInstanceRuntimeOrThrow(attacker.instanceId);
        const boundary = typeof deps.worldRuntimeFormationService?.getBoundaryBarrierCombatState === 'function'
            ? deps.worldRuntimeFormationService.getBoundaryBarrierCombatState(attacker.instanceId, targetX, targetY)
            : null;
        if (boundary) {
            ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
            const skill = findPlayerSkill(attacker, skillId);
            if (!skill) {
                throw new common_1.NotFoundException(`Skill ${skillId} not found`);
            }
            const targets = this.collectSkillTargetsFromAnchor(attacker, skill, { x: targetX, y: targetY }, deps, {
                kind: 'formation_boundary',
                formationId: boundary.formationId,
                x: targetX,
                y: targetY,
            });
            if (targets.length === 0) {
                throw new common_1.BadRequestException('没有可命中的目标');
            }
            await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps);
            return;
        }
        ensureInstanceSupportsTileDamage(instance);
        const tileState = instance.getTileCombatState(targetX, targetY);
        if (!tileState || tileState.destroyed) {
            throw new common_1.BadRequestException('该目标无法被攻击');
        }
        ensureHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(attacker, { kind: 'terrain' }));
        const skill = findPlayerSkill(attacker, skillId);
        if (!skill) {
            throw new common_1.NotFoundException(`Skill ${skillId} not found`);
        }
        const targets = this.collectSkillTargetsFromAnchor(attacker, skill, { x: targetX, y: targetY }, deps, {
            kind: 'tile',
            x: targetX,
            y: targetY,
        });
        if (targets.length === 0) {
            throw new common_1.BadRequestException('没有可命中的目标');
        }
        await this.dispatchSkillTargets(attacker, skillId, skill, targets, deps);
    }
};
exports.WorldRuntimePlayerSkillDispatchService = WorldRuntimePlayerSkillDispatchService;
exports.WorldRuntimePlayerSkillDispatchService = WorldRuntimePlayerSkillDispatchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        player_combat_service_1.PlayerCombatService])
], WorldRuntimePlayerSkillDispatchService);

export { WorldRuntimePlayerSkillDispatchService };
