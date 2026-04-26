// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBasicAttackCommandFromAttackableTarget = exports.resolveAttackableTargetRef = void 0;

const shared_1 = require("@mud/shared");
const player_combat_config_helpers_1 = require("../player/player-combat-config.helpers");
const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const { chebyshevDistance } = world_runtime_path_planning_helpers_1;

function isHostileRelation(resolution) {
    return (0, player_combat_config_helpers_1.isHostileCombatRelationResolution)(resolution);
}

function isWithinMaxDistance(player, target, maxDistance) {
    if (!Number.isFinite(maxDistance)) {
        return true;
    }
    return chebyshevDistance(player.x, player.y, target.x, target.y) <= Math.max(0, Math.round(maxDistance));
}

function buildAttackableTarget(base, command) {
    return {
        ...base,
        targetPlayerId: command.targetPlayerId ?? null,
        targetMonsterId: command.targetMonsterId ?? null,
        targetX: command.targetX ?? null,
        targetY: command.targetY ?? null,
        supportsSkill: command.supportsSkill !== false,
    };
}

function buildBasicAttackCommandFromAttackableTarget(target) {
    if (!target) {
        return null;
    }
    return {
        kind: 'basicAttack',
        targetPlayerId: target.targetPlayerId ?? null,
        targetMonsterId: target.targetMonsterId ?? null,
        targetX: target.targetX ?? null,
        targetY: target.targetY ?? null,
        autoCombat: true,
    };
}
exports.buildBasicAttackCommandFromAttackableTarget = buildBasicAttackCommandFromAttackableTarget;

function resolveAttackablePlayerTarget(instance, playerRuntimeService, player, targetRef, options) {
    const targetPlayerId = targetRef.slice('player:'.length).trim();
    if (!targetPlayerId || instance?.meta?.supportsPvp !== true) {
        return null;
    }
    const target = playerRuntimeService.getPlayer(targetPlayerId);
    const relation = (0, player_combat_config_helpers_1.resolveCombatRelation)(player, {
        kind: 'player',
        target,
    });
    if (
        !target
        || target.instanceId !== player.instanceId
        || target.playerId === player.playerId
        || target.hp <= 0
        || !isHostileRelation(relation)
        || !isWithinMaxDistance(player, target, options?.maxDistance)
    ) {
        return null;
    }
    return buildAttackableTarget({
        kind: 'player',
        targetRef: `player:${target.playerId}`,
        playerId: target.playerId,
        x: target.x,
        y: target.y,
        hp: target.hp,
    }, {
        targetPlayerId: target.playerId,
    });
}

function resolveAttackableTileTarget(instance, player, tile, deps, options) {
    if (!tile || !player.instanceId) {
        return null;
    }
    if (!isWithinMaxDistance(player, tile, options?.maxDistance)) {
        return null;
    }
    if (!isHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(player, { kind: 'terrain' }))) {
        return null;
    }
    const currentTick = Number.isFinite(options?.currentTick)
        ? Math.max(0, Math.trunc(options.currentTick))
        : (typeof deps.resolveCurrentTickForPlayerId === 'function' ? deps.resolveCurrentTickForPlayerId(player.playerId) : 0);
    const formationTileState = typeof deps.worldRuntimeFormationService?.getAttackableTileCombatState === 'function'
        ? deps.worldRuntimeFormationService.getAttackableTileCombatState(player.instanceId, tile.x, tile.y)
        : null;
    if (formationTileState) {
        return buildAttackableTarget({
            kind: formationTileState.kind ?? 'tile',
            targetRef: (0, shared_1.encodeTileTargetRef)(tile),
            x: tile.x,
            y: tile.y,
            hp: formationTileState.hp ?? formationTileState.remainingHp ?? formationTileState.remainingAuraBudget ?? 1,
        }, {
            targetX: tile.x,
            targetY: tile.y,
            supportsSkill: formationTileState.supportsSkill !== false,
        });
    }
    if (instance?.meta?.canDamageTile !== true) {
        return null;
    }
    const container = typeof instance.getContainerAtTile === 'function'
        ? instance.getContainerAtTile(tile.x, tile.y)
        : null;
    const containerState = typeof deps.worldRuntimeLootContainerService?.getAttackableContainerCombatStateAtTile === 'function'
        ? deps.worldRuntimeLootContainerService.getAttackableContainerCombatStateAtTile(player.instanceId, container, currentTick)
        : null;
    if (containerState) {
        return buildAttackableTarget({
            kind: containerState.kind ?? 'tile',
            targetRef: (0, shared_1.encodeTileTargetRef)(tile),
            x: tile.x,
            y: tile.y,
            hp: containerState.hp ?? containerState.remainingCount ?? 1,
        }, {
            targetX: tile.x,
            targetY: tile.y,
            supportsSkill: containerState.supportsSkill === true,
        });
    }
    const tileState = typeof instance.getTileCombatState === 'function'
        ? instance.getTileCombatState(tile.x, tile.y)
        : null;
    if (!tileState || tileState.destroyed === true) {
        return null;
    }
    return buildAttackableTarget({
        kind: 'tile',
        targetRef: (0, shared_1.encodeTileTargetRef)(tile),
        x: tile.x,
        y: tile.y,
        hp: tileState.hp,
    }, {
        targetX: tile.x,
        targetY: tile.y,
    });
}

function resolveAttackableIdTarget(instance, player, targetRef, deps, options) {
    const formationState = typeof deps.worldRuntimeFormationService?.getAttackableEntityCombatState === 'function'
        ? deps.worldRuntimeFormationService.getAttackableEntityCombatState(player.instanceId, targetRef)
        : null;
    if (formationState) {
        if (
            !isHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(player, { kind: 'terrain' }))
            || !isWithinMaxDistance(player, formationState, options?.maxDistance)
        ) {
            return null;
        }
        return buildAttackableTarget({
            kind: formationState.kind ?? 'entity',
            targetRef: formationState.targetRef ?? targetRef,
            runtimeId: formationState.targetMonsterId ?? formationState.id ?? targetRef,
            x: formationState.x,
            y: formationState.y,
            hp: formationState.hp ?? formationState.remainingHp ?? formationState.remainingAuraBudget ?? 1,
        }, {
            targetMonsterId: formationState.targetMonsterId ?? formationState.id ?? targetRef,
            supportsSkill: formationState.supportsSkill !== false,
        });
    }
    const monster = typeof instance?.getMonster === 'function' ? instance.getMonster(targetRef) : null;
    if (
        !monster?.alive
        || !isHostileRelation((0, player_combat_config_helpers_1.resolveCombatRelation)(player, { kind: 'monster' }))
        || !isWithinMaxDistance(player, monster, options?.maxDistance)
    ) {
        return null;
    }
    return buildAttackableTarget({
        kind: 'monster',
        targetRef: monster.runtimeId,
        runtimeId: monster.runtimeId,
        x: monster.x,
        y: monster.y,
        hp: monster.hp,
    }, {
        targetMonsterId: monster.runtimeId,
    });
}

function resolveAttackableTargetRef(instance, playerRuntimeService, player, targetRef, deps, options = undefined) {
    const normalizedRef = typeof targetRef === 'string' ? targetRef.trim() : '';
    if (!normalizedRef || !player?.instanceId) {
        return null;
    }
    if (normalizedRef.startsWith('player:')) {
        return resolveAttackablePlayerTarget(instance, playerRuntimeService, player, normalizedRef, options);
    }
    if ((0, shared_1.isTileTargetRef)(normalizedRef)) {
        return resolveAttackableTileTarget(instance, player, (0, shared_1.parseTileTargetRef)(normalizedRef), deps, options);
    }
    return resolveAttackableIdTarget(instance, player, normalizedRef, deps, options);
}
exports.resolveAttackableTargetRef = resolveAttackableTargetRef;

export {
    buildBasicAttackCommandFromAttackableTarget,
    resolveAttackableTargetRef,
};
