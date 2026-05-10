import { encodeTileTargetRef, isTileTargetRef, parseTileTargetRef } from '@mud/shared';
import { isHostileCombatRelationResolution, resolveCombatRelation } from '../player/player-combat-config.helpers';
import * as world_runtime_path_planning_helpers_1 from './world-runtime.path-planning.helpers';

const { chebyshevDistance } = world_runtime_path_planning_helpers_1;

function isHostileRelation(resolution) {
    return isHostileCombatRelationResolution(resolution);
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

function buildFormationEntityAttackableTarget(formationState) {
    return buildAttackableTarget({
        kind: formationState.kind ?? 'entity',
        targetRef: formationState.targetRef ?? formationState.id,
        runtimeId: formationState.targetMonsterId ?? formationState.id,
        x: formationState.x,
        y: formationState.y,
        hp: formationState.hp ?? formationState.remainingHp ?? formationState.remainingAuraBudget ?? 1,
    }, {
        targetMonsterId: formationState.targetMonsterId ?? formationState.id,
        supportsSkill: formationState.supportsSkill !== false,
    });
}

function resolveAttackablePlayerTarget(instance, playerRuntimeService, player, targetRef, options) {
    const targetPlayerId = targetRef.slice('player:'.length).trim();
    if (!targetPlayerId || instance?.meta?.supportsPvp !== true) {
        return null;
    }
    const target = playerRuntimeService.getPlayer(targetPlayerId);
    const relation = resolveCombatRelation(player, {
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

function resolveAttackableMonsterAtTile(instance, player, tile, options) {
    const monsters = typeof instance?.listMonsters === 'function'
        ? instance.listMonsters()
        : [];
    const monster = monsters
        .filter((entry) => entry?.alive && entry.x === tile.x && entry.y === tile.y)
        .sort((left, right) => String(left.runtimeId).localeCompare(String(right.runtimeId), 'zh-Hans-CN'))[0];
    if (
        !monster
        || !isHostileRelation(resolveCombatRelation(player, { kind: 'monster' }))
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

function resolveAttackablePlayerAtTile(instance, playerRuntimeService, player, tile, options) {
    if (instance?.meta?.supportsPvp !== true) {
        return null;
    }
    const snapshots = typeof instance?.getPlayersAtTile === 'function'
        ? instance.getPlayersAtTile(tile.x, tile.y)
        : typeof playerRuntimeService.listPlayerSnapshots === 'function'
            ? playerRuntimeService.listPlayerSnapshots().filter((entry) => entry.instanceId === player.instanceId && entry.x === tile.x && entry.y === tile.y)
            : [];
    const candidates = snapshots
        .filter((entry) => entry?.playerId && entry.playerId !== player.playerId)
        .sort((left, right) => String(left.playerId).localeCompare(String(right.playerId), 'zh-Hans-CN'));
    for (const snapshot of candidates) {
        const target = typeof playerRuntimeService.getPlayer === 'function'
            ? playerRuntimeService.getPlayer(snapshot.playerId) ?? snapshot
            : snapshot;
        const relation = resolveCombatRelation(player, {
            kind: 'player',
            target,
        });
        if (
            target
            && target.instanceId === player.instanceId
            && target.hp > 0
            && isHostileRelation(relation)
            && isWithinMaxDistance(player, target, options?.maxDistance)
        ) {
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
    }
    return null;
}

function resolveAttackableTileTarget(instance, playerRuntimeService, player, tile, deps, options) {
    if (!tile || !player.instanceId) {
        return null;
    }
    if (!isWithinMaxDistance(player, tile, options?.maxDistance)) {
        return null;
    }
    const currentTick = Number.isFinite(options?.currentTick)
        ? Math.max(0, Math.trunc(options.currentTick))
        : (typeof deps.resolveCurrentTickForPlayerId === 'function' ? deps.resolveCurrentTickForPlayerId(player.playerId) : 0);
    const monsterTarget = resolveAttackableMonsterAtTile(instance, player, tile, options);
    if (monsterTarget) {
        return monsterTarget;
    }
    const playerTarget = resolveAttackablePlayerAtTile(instance, playerRuntimeService, player, tile, options);
    if (playerTarget) {
        return playerTarget;
    }
    const terrainHostile = isHostileRelation(resolveCombatRelation(player, { kind: 'terrain' }));
    if (!terrainHostile) {
        return null;
    }
    const formationTileState = typeof deps.worldRuntimeFormationService?.getAttackableTileCombatState === 'function'
        ? deps.worldRuntimeFormationService.getAttackableTileCombatState(player.instanceId, tile.x, tile.y)
        : null;
    if (formationTileState) {
        return buildAttackableTarget({
            kind: formationTileState.kind ?? 'tile',
            targetRef: encodeTileTargetRef(tile),
            x: tile.x,
            y: tile.y,
            hp: formationTileState.hp ?? formationTileState.remainingHp ?? formationTileState.remainingAuraBudget ?? 1,
        }, {
            targetX: tile.x,
            targetY: tile.y,
            supportsSkill: formationTileState.supportsSkill !== false,
        });
    }
    if (instance?.meta?.canDamageTile === true) {
        const container = typeof instance.getContainerAtTile === 'function'
            ? instance.getContainerAtTile(tile.x, tile.y)
            : null;
        const containerState = typeof deps.worldRuntimeLootContainerService?.getAttackableContainerCombatStateAtTile === 'function'
            ? deps.worldRuntimeLootContainerService.getAttackableContainerCombatStateAtTile(player.instanceId, container, currentTick)
            : null;
        if (containerState) {
            return buildAttackableTarget({
                kind: containerState.kind ?? 'tile',
                targetRef: encodeTileTargetRef(tile),
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
        if (tileState && tileState.destroyed !== true) {
            return buildAttackableTarget({
                kind: 'tile',
                targetRef: encodeTileTargetRef(tile),
                x: tile.x,
                y: tile.y,
                hp: tileState.hp,
            }, {
                targetX: tile.x,
                targetY: tile.y,
            });
        }
    }
    const formationEyeState = typeof deps.worldRuntimeFormationService?.getAttackableFormationEyeCombatStateAtTile === 'function'
        ? deps.worldRuntimeFormationService.getAttackableFormationEyeCombatStateAtTile(player.instanceId, tile.x, tile.y)
        : null;
    if (formationEyeState) {
        return buildFormationEntityAttackableTarget(formationEyeState);
    }
    return null;
}

function resolveAttackableIdTarget(instance, player, targetRef, deps, options) {
    const formationState = typeof deps.worldRuntimeFormationService?.getAttackableEntityCombatState === 'function'
        ? deps.worldRuntimeFormationService.getAttackableEntityCombatState(player.instanceId, targetRef)
        : null;
    if (formationState) {
        if (
            !isHostileRelation(resolveCombatRelation(player, { kind: 'terrain' }))
            || !isWithinMaxDistance(player, formationState, options?.maxDistance)
        ) {
            return null;
        }
        return buildFormationEntityAttackableTarget({
            ...formationState,
            targetRef: formationState.targetRef ?? targetRef,
            id: formationState.id ?? targetRef,
            targetMonsterId: formationState.targetMonsterId ?? formationState.id ?? targetRef,
        });
    }
    const monster = typeof instance?.getMonster === 'function' ? instance.getMonster(targetRef) : null;
    if (
        !monster?.alive
        || !isHostileRelation(resolveCombatRelation(player, { kind: 'monster' }))
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
    if (isTileTargetRef(normalizedRef)) {
        return resolveAttackableTileTarget(instance, playerRuntimeService, player, parseTileTargetRef(normalizedRef), deps, options);
    }
    return resolveAttackableIdTarget(instance, player, normalizedRef, deps, options);
}

export {
    buildBasicAttackCommandFromAttackableTarget,
    resolveAttackableTargetRef,
};
