/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 寻路与导航意图服务
 * 管理玩家寻路目标设置、路径规划、跨图导航和导航中断
 */
import { Inject, Injectable, BadRequestException, Logger, NotFoundException, Optional } from '@nestjs/common';
import { isServerNextMovementDebugEnabled, logServerNextMovement } from '../../debug/movement-debug';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { AsyncPathfindingService } from './async-pathfinding.service';
import { buildStructuredNotice } from './structured-notice.helpers';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';
import * as world_runtime_path_planning_helpers_1 from './world-runtime.path-planning.helpers';

const { parseDirection, normalizeCoordinate, compareStableStrings } = world_runtime_normalization_helpers_1;
const {
    isInBounds,
    selectNearestPortal,
    buildGoalPoints,
    buildGoalPointsFromTemplate,
    buildAdjacentGoalPoints,
    decodeClientPathHint,
    findOptimalPathOnMap,
    buildPathingBlockArray,
    resolvePreferredClientPathHint,
    directionFromStep,
} = world_runtime_path_planning_helpers_1;

function resolvePlayerMapId(player, instance = null) {
    const playerMapId = typeof player?.templateId === 'string' && player.templateId.trim()
        ? player.templateId.trim()
        : '';
    if (playerMapId) {
        return playerMapId;
    }
    const instanceMapId = typeof instance?.template?.id === 'string' && instance.template.id.trim()
        ? instance.template.id.trim()
        : typeof instance?.template?.mapId === 'string' && instance.template.mapId.trim()
            ? instance.template.mapId.trim()
            : '';
    return instanceMapId || null;
}
function resolvePlayerPathingOptions(player, deps) {
    const currentTick = typeof deps?.resolveCurrentTickForPlayerId === 'function'
        ? deps.resolveCurrentTickForPlayerId(player?.playerId)
        : null;
    return canPlayerTraverseUnwalkableWithArtifact(player, currentTick)
        ? { allowTraverseUnwalkable: true }
        : undefined;
}
function canPlayerTraverseUnwalkableWithArtifact(player, currentTick = null) {
    const normalizedTick = Number.isFinite(Number(currentTick)) ? Math.trunc(Number(currentTick)) : null;
    const slots = Array.isArray(player?.artifacts?.slots) ? player.artifacts.slots : [];
    for (const slot of slots) {
        if (!slot || slot.unlocked !== true || slot.enabled === false || !slot.item) {
            continue;
        }
        const effects = Array.isArray(slot.item.artifactEffects) ? slot.item.artifactEffects : [];
        const effect = effects.find((entry) => entry?.type === 'traverse_unwalkable');
        if (!effect) {
            continue;
        }
        if (normalizedTick !== null && Math.trunc(Number(slot.lastTraverseUnwalkableTick) || -1) === normalizedTick) {
            return true;
        }
        const maxQi = Math.max(0, Number(slot.maxQi) || 0);
        const ratio = Number(effect.costMaxQiRatio);
        const cost = Number.isFinite(ratio) && ratio > 0
            ? Math.max(1, Math.ceil(maxQi * ratio))
            : 0;
        if (cost > 0 && maxQi > 0 && Number(slot.qi) >= cost) {
            return true;
        }
    }
    return false;
}

/** movement/navigation 状态域服务：承接导航意图状态与路径物化。 */
@Injectable()
export class WorldRuntimeNavigationService {
/**
 * templateRepository：template仓储引用。
 */

    templateRepository;
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * asyncPathfindingService：异步寻路服务引用（T-05）。
 */

    asyncPathfindingService;
    /**
 * logger：日志器引用。
 */

    logger = new Logger(WorldRuntimeNavigationService.name);
    /**
 * navigationIntents：导航Intent相关字段。
 */

    navigationIntents = new Map();
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param templateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(MapTemplateRepository) templateRepository: any,
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Optional() @Inject(AsyncPathfindingService) asyncPathfindingService?: AsyncPathfindingService,
    ) {
        this.templateRepository = templateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.asyncPathfindingService = asyncPathfindingService ?? null;
    }
    /**
 * clearNavigationIntent：执行clear导航Intent相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clear导航Intent相关状态。
 */

    clearNavigationIntent(playerId) {
        this.navigationIntents.delete(playerId);
    }
    /**
 * hasNavigationIntent：判断导航Intent是否满足条件。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成导航Intent的条件判断。
 */

    hasNavigationIntent(playerId) {
        return this.navigationIntents.has(playerId);
    }
    /**
 * getBlockedPlayerIds：读取Blocked玩家ID。
 * @returns 无返回值，完成Blocked玩家ID的读取/组装。
 */

    getBlockedPlayerIds() {
        return this.navigationIntents.size > 0 ? new Set(this.navigationIntents.keys()) : undefined;
    }
    /**
 * reset：执行reset相关逻辑。
 * @returns 无返回值，直接更新reset相关状态。
 */

    reset() {
        this.navigationIntents.clear();
    }
    /**
 * enqueueMove：处理Move并更新相关状态。
 * @param playerId 玩家 ID。
 * @param directionInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Move相关状态。
 */

    enqueueMove(playerId, directionInput, deps) {
        const direction = parseDirection(directionInput);
        deps.getPlayerLocationOrThrow(playerId);
        const player = this.playerRuntimeService.getPlayer(playerId);
        this.clearNavigationIntent(playerId);
        this.interruptManualNavigation(playerId, deps);
        deps.enqueuePendingCommand(playerId, {
            kind: 'move',
            direction,
            continuous: true,
            resetBudget: false,
        });
        logServerNextMovement(deps.logger ?? this.logger, 'runtime.enqueue.move', {
            playerId,
            direction,
            from: player ? { mapId: player.templateId, x: player.x, y: player.y } : null,
        });
        return deps.getPlayerViewOrThrow(playerId);
    }
    /**
 * enqueueMoveTo：处理MoveTo并更新相关状态。
 * @param playerId 玩家 ID。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @param allowNearestReachableInput 参数说明。
 * @param packedPathInput 参数说明。
 * @param packedPathStepsInput 参数说明。
 * @param pathStartXInput 参数说明。
 * @param pathStartYInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新MoveTo相关状态。
 */

    enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput, targetMapIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!deps && targetMapIdInput && typeof targetMapIdInput === 'object') {
            deps = targetMapIdInput;
            targetMapIdInput = null;
        }
        const location = deps.getPlayerLocationOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const x = normalizeCoordinate(xInput, 'x');
        const y = normalizeCoordinate(yInput, 'y');
        const player = this.playerRuntimeService.getPlayer(playerId);
        const currentMapId = resolvePlayerMapId(player, instance);
        if (!currentMapId) {
            throw new BadRequestException('当前地图状态异常');
        }
        const targetMapId = typeof targetMapIdInput === 'string' && targetMapIdInput.trim()
            ? targetMapIdInput.trim()
            : currentMapId;
        if (targetMapId === currentMapId && instance.isInBounds?.(x, y) !== true) {
            throw new BadRequestException('目标超出地图范围');
        }
        if (targetMapId !== currentMapId) {
            const targetTemplate = this.templateRepository.getOrThrow(targetMapId);
            if (!isInBounds(x, y, targetTemplate.width, targetTemplate.height)) {
                throw new BadRequestException('目标超出地图范围');
            }
        }
        this.interruptManualNavigation(playerId, deps);
        const clientPathHint = decodeClientPathHint(packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput);
        const intent = {
            kind: 'point',
            mapId: targetMapId,
            x,
            y,
            allowNearestReachable: allowNearestReachableInput === true,
            clientPathHint,
        };
        this.queueInitialNavigationStep(playerId, intent, deps);
        logServerNextMovement(deps.logger ?? this.logger, 'runtime.enqueue.moveTo', {
            playerId,
            from: player ? { mapId: player.templateId, x: player.x, y: player.y } : null,
            target: { mapId: targetMapId, x, y },
            allowNearestReachable: allowNearestReachableInput === true,
            clientPathHint: clientPathHint ? {
                startX: clientPathHint.startX,
                startY: clientPathHint.startY,
                points: clientPathHint.points,
            } : null,
        });
        return deps.getPlayerViewOrThrow(playerId);
    }

    queueInitialNavigationStep(playerId, intent, deps) {
        this.navigationIntents.set(playerId, intent);
        let initialStep;
        try {
            initialStep = this.resolveNavigationStep(playerId, intent, deps);
        }
        catch (error) {
            this.navigationIntents.delete(playerId);
            throw error;
        }
        logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.initialStep', { playerId, intent, step: initialStep });
        if (initialStep.kind === 'done') {
            this.navigationIntents.delete(playerId);
            return;
        }
        if (initialStep.kind === 'portal') {
            deps.dispatchInstanceCommand(playerId, { kind: 'portal' });
            return;
        }
        deps.dispatchInstanceCommand(playerId, {
            kind: 'move',
            direction: initialStep.direction,
            continuous: true,
            maxSteps: initialStep.maxSteps,
            path: initialStep.path ?? undefined,
            resetBudget: false,
        });
    }
    /**
 * usePortal：执行use传送门相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新usePortal相关状态。
 */

    usePortal(playerId, deps) {
        deps.getPlayerLocationOrThrow(playerId);
        this.clearNavigationIntent(playerId);
        this.interruptManualNavigation(playerId, deps);
        deps.dispatchInstanceCommand(playerId, { kind: 'portal' });
        return deps.getPlayerViewOrThrow(playerId);
    }
    /**
 * navigateQuest：执行navigate任务相关逻辑。
 * @param playerId 玩家 ID。
 * @param questIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新navigate任务相关状态。
 */

    navigateQuest(playerId, questIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);
        this.interruptManualNavigation(playerId, deps);
        const questId = typeof questIdInput === 'string' ? questIdInput.trim() : '';
        if (!questId) {
            throw new BadRequestException('任务 ID 不能为空');
        }
        const intent = { kind: 'quest', questId };
        this.navigationIntents.set(playerId, intent);
        const initialStep = this.resolveNavigationStep(playerId, intent, deps);
        const path = initialStep.kind === 'move' && Array.isArray(initialStep.path)
            ? initialStep.path.map((entry) => [entry.x, entry.y])
            : [];
        return {
            view: deps.getPlayerViewOrThrow(playerId),
            path,
        };
    }
    /**
 * interruptManualNavigation：执行interruptManual导航相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新interruptManual导航相关状态。
 */

    interruptManualNavigation(playerId, deps) {
        const currentTick = deps.resolveCurrentTickForPlayerId(playerId);
        this.playerRuntimeService.updateCombatSettings(playerId, { autoBattle: false }, currentTick);
        deps.cancelPendingInstanceCommand(playerId);
    }
    /**
 * getLegacyNavigationPath：读取Legacy导航路径。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，完成Legacy导航路径的读取/组装。
 */

    getLegacyNavigationPath(playerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const intent = this.navigationIntents.get(playerId);
        if (!intent) {
            return [];
        }
        try {
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            const location = deps.getPlayerLocationOrThrow(playerId);
            const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
            const currentMapId = resolvePlayerMapId(player, instance);
            if (!currentMapId) {
                return [];
            }
            const pathingOptions = resolvePlayerPathingOptions(player, deps);
            const destination = this.resolveNavigationDestination(playerId, intent, deps, pathingOptions);
            if (destination.mapId !== currentMapId) {
                const route = this.findMapRoute(currentMapId, destination.mapId);
                if (!route || route.length < 2) {
                    return [];
                }
                const nextMapId = route[1];
                const portal = selectNearestPortal(instance.template.portals, nextMapId, player.x, player.y);
                if (!portal || (portal.x === player.x && portal.y === player.y)) {
                    return [];
                }
                const path = findPathPointsOnMap(instance, player.playerId, player.x, player.y, [{ x: portal.x, y: portal.y }], pathingOptions);
                return path ? path.map((entry) => [entry.x, entry.y]) : [];
            }
            if (destination.goals.some((goal) => goal.x === player.x && goal.y === player.y)) {
                return [];
            }
            const path = findPathPointsOnMap(instance, player.playerId, player.x, player.y, destination.goals, pathingOptions);
            return path ? path.map((entry) => [entry.x, entry.y]) : [];
        }
        catch (error) {
            if (error instanceof TypeError || error instanceof RangeError) {
                console.error(`[寻路] 路径规划错误：`, error);
            }
            return [];
        }
    }
    /**
 * handleTransfer：处理Transfer并更新相关状态。
 * @param transfer 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Transfer相关状态。
 */

    handleTransfer(transfer, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const navigation = this.navigationIntents.get(transfer.playerId);
        const transferSourceMapId = typeof transfer.sourceMapId === 'string' && transfer.sourceMapId.trim()
            ? transfer.sourceMapId.trim()
            : null;
        const sourceInstance = !transferSourceMapId && typeof deps.getInstanceRuntime === 'function'
            ? deps.getInstanceRuntime(transfer.fromInstanceId)
            : null;
        const sourceMapId = transferSourceMapId ?? sourceInstance?.template?.mapId ?? null;
        if (navigation?.kind === 'point' && sourceMapId && navigation.mapId === sourceMapId) {
            this.navigationIntents.delete(transfer.playerId);
        }
        const runtimePlayer = this.playerRuntimeService.getPlayer(transfer.playerId);
        const linePreset = runtimePlayer?.worldPreference?.linePreset === 'real' ? 'real' : 'peaceful';
        const targetInstance = (typeof transfer.targetInstanceId === 'string' && transfer.targetInstanceId.trim()
            ? deps.getInstanceRuntime(transfer.targetInstanceId.trim())
            : null)
            ?? (typeof deps.getOrCreateDefaultLineInstance === 'function'
                ? deps.getOrCreateDefaultLineInstance(transfer.targetMapId, linePreset)
                : deps.getOrCreatePublicInstance(transfer.targetMapId));
        const mapName = targetInstance.template.name;
        const travelMethod = transfer.reason === 'manual_portal' ? '通过界门' : '穿过灵脉';
        const n = buildStructuredNotice('travel', 'notice.travel.arrived', `${travelMethod}抵达 ${mapName}`, {
            vars: { travelMethod, mapName },
            pills: [{ key: 'mapName', style: 'target' }],
        });
        deps.queuePlayerNotice(transfer.playerId, n.text, n.kind, undefined, undefined, n.structured);
    }
    /**
 * materializeNavigationCommands：执行materialize导航Command相关逻辑。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新materialize导航Command相关状态。
 */

    async materializeNavigationCommands(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.navigationIntents.size === 0) {
            return;
        }
        for (const [playerId, intent] of this.navigationIntents) {
            if (deps.hasPendingCommand(playerId)) {
                continue;
            }
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || !player.instanceId || player.hp <= 0) {
                this.navigationIntents.delete(playerId);
                continue;
            }
            try {
                const step = await this.resolveNavigationStepAsync(playerId, intent, deps);
                logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.step', { playerId, intent, step });
                if (step.kind === 'done') {
                    this.navigationIntents.delete(playerId);
                    continue;
                }
                if (step.kind === 'portal') {
                    deps.enqueuePendingCommand(playerId, { kind: 'portal' });
                    continue;
                }
                deps.enqueuePendingCommand(playerId, {
                    kind: 'move',
                    direction: step.direction,
                    continuous: true,
                    maxSteps: step.maxSteps,
                    path: step.path ?? undefined,
                    resetBudget: false,
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.error', { playerId, intent, message });
                this.navigationIntents.delete(playerId);
                deps.queuePlayerNotice(playerId, message, 'warn');
            }
        }
    }
    /** materializeNavigationCommandsForInstance：只为指定实例的玩家物化导航命令（加速 tick 补偿用）。 */
    materializeNavigationCommandsForInstance(instanceId, deps) {
        if (this.navigationIntents.size === 0) {
            return;
        }
        for (const [playerId, intent] of this.navigationIntents) {
            if (deps.hasPendingCommand(playerId)) {
                continue;
            }
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player || !player.instanceId || player.hp <= 0) {
                this.navigationIntents.delete(playerId);
                continue;
            }
            if (player.instanceId !== instanceId) {
                continue;
            }
            try {
                const step = this.resolveNavigationStep(playerId, intent, deps);
                logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.step', { playerId, intent, step });
                if (step.kind === 'done') {
                    this.navigationIntents.delete(playerId);
                    continue;
                }
                if (step.kind === 'portal') {
                    deps.enqueuePendingCommand(playerId, { kind: 'portal' });
                    continue;
                }
                deps.enqueuePendingCommand(playerId, {
                    kind: 'move',
                    direction: step.direction,
                    continuous: true,
                    maxSteps: step.maxSteps,
                    path: step.path ?? undefined,
                    resetBudget: false,
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.error', { playerId, intent, message });
                this.navigationIntents.delete(playerId);
                deps.queuePlayerNotice(playerId, message, 'warn');
            }
        }
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

    dispatchMoveTo(playerId, x, y, allowNearestReachable, clientPathHint = null, targetMapId = null, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!deps && targetMapId && typeof targetMapId === 'object') {
            deps = targetMapId;
            targetMapId = null;
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        this.playerRuntimeService.recordActivity(playerId, deps.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
            reason: 'move',
        });
        const normalizedTargetMapId = typeof targetMapId === 'string' && targetMapId.trim()
            ? targetMapId.trim()
            : player.templateId;
        const intent = { kind: 'point', mapId: normalizedTargetMapId, x, y, allowNearestReachable, clientPathHint };
        this.queueInitialNavigationStep(playerId, intent, deps);
        logServerNextMovement(deps.logger ?? this.logger, 'runtime.dispatch.moveTo', {
            playerId,
            from: { mapId: player.templateId, x: player.x, y: player.y },
            target: { mapId: normalizedTargetMapId, x, y },
            allowNearestReachable,
            previewPath: this.getLegacyNavigationPath(playerId, deps),
            clientPathHint: clientPathHint ? {
                startX: clientPathHint.startX,
                startY: clientPathHint.startY,
                points: clientPathHint.points,
            } : null,
        });
    }
    /**
 * resolveNavigationStep：规范化或转换导航Step。
 * @param playerId 玩家 ID。
 * @param intent 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新导航Step相关状态。
 */

    resolveNavigationStep(playerId, intent, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const location = deps.getPlayerLocationOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const currentMapId = resolvePlayerMapId(player, instance);
        if (!currentMapId) {
            throw new BadRequestException('当前地图状态异常');
        }
        const pathingOptions = resolvePlayerPathingOptions(player, deps);
        const destination = this.resolveNavigationDestination(playerId, intent, deps, pathingOptions);
        if (destination.mapId !== currentMapId) {
            const route = this.findMapRoute(currentMapId, destination.mapId);
            if (!route || route.length < 2) {
                throw new BadRequestException(`无法规划前往 ${destination.mapId} 的跨图路线`);
            }
            const nextMapId = route[1];
            const portal = selectNearestPortal(instance.template.portals, nextMapId, player.x, player.y);
            if (!portal) {
                throw new BadRequestException(`当前地图没有通往 ${nextMapId} 的界门`);
            }
            if (player.x === portal.x && player.y === portal.y) {
                logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.crossMap.atPortal', {
                    playerId, fromMapId: currentMapId, destinationMapId: destination.mapId, route, portal,
                });
                return { kind: 'portal' };
            }
            const pathResult = findOptimalPathOnMap(instance, player.playerId, player.x, player.y, [{ x: portal.x, y: portal.y }], true, pathingOptions);
            if (!pathResult || pathResult.points.length === 0) {
                throw new BadRequestException('前往界门的路径不可达');
            }
            const previewPath = isServerNextMovementDebugEnabled() ? pathResult.points : null;
            const direction = directionFromStep(player.x, player.y, pathResult.points[0].x, pathResult.points[0].y);
            if (direction === null) {
                throw new BadRequestException('前往界门的路径不可达');
            }
            logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.crossMap.path', {
                playerId, fromMapId: currentMapId, destinationMapId: destination.mapId, from: { x: player.x, y: player.y }, route, portal, direction,
                previewPath: previewPath ? previewPath.map((entry) => ({ x: entry.x, y: entry.y })) : null,
                pathCost: pathResult.cost,
            });
            return { kind: 'move', direction, maxSteps: pathResult.points.length, path: pathResult.points.map((entry) => ({ x: entry.x, y: entry.y })) };
        }
        if (destination.goals.some((goal) => goal.x === player.x && goal.y === player.y)) {
            logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.arrived', {
                playerId, mapId: destination.mapId, at: { x: player.x, y: player.y }, goals: destination.goals,
            });
            return { kind: 'done' };
        }
        const preferredPath = intent.kind === 'point'
            ? resolvePreferredClientPathHint(instance, player.playerId, player.x, player.y, destination.goals, intent.clientPathHint, pathingOptions)
            : null;
        const serverPathResult = preferredPath ? null : findOptimalPathOnMap(instance, player.playerId, player.x, player.y, destination.goals, true, pathingOptions);
        const pathResult = preferredPath ?? serverPathResult;
        if (!pathResult || pathResult.points.length === 0) {
            throw new BadRequestException(intent.kind === 'quest' ? '任务目标当前不可达' : '无法到达该位置');
        }
        const direction = directionFromStep(player.x, player.y, pathResult.points[0].x, pathResult.points[0].y);
        if (direction === null) {
            throw new BadRequestException(intent.kind === 'quest' ? '任务目标当前不可达' : '无法到达该位置');
        }
        const previewPath = isServerNextMovementDebugEnabled() ? pathResult.points : null;
        logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.local.path', {
            playerId, mapId: destination.mapId, from: { x: player.x, y: player.y }, goals: destination.goals, direction,
            previewPath: previewPath ? previewPath.map((entry) => ({ x: entry.x, y: entry.y })) : null,
            pathSource: preferredPath ? 'client_hint' : 'server_optimal',
            pathCost: pathResult.cost,
        });
        return { kind: 'move', direction, maxSteps: pathResult.points.length, path: pathResult.points.map((entry) => ({ x: entry.x, y: entry.y })) };
    }
    /** resolveNavigationStepAsync：优先通过 AsyncPathfindingService 解析 tick 外寻路，失败时同步 fallback。 */
    async resolveNavigationStepAsync(playerId, intent, deps) {
        if (!this.asyncPathfindingService) {
            return this.resolveNavigationStep(playerId, intent, deps);
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const location = deps.getPlayerLocationOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const currentMapId = resolvePlayerMapId(player, instance);
        if (!currentMapId) {
            throw new BadRequestException('当前地图状态异常');
        }
        const pathingOptions = resolvePlayerPathingOptions(player, deps);
        if (pathingOptions?.allowTraverseUnwalkable === true) {
            return this.resolveNavigationStep(playerId, intent, deps);
        }
        const destination = this.resolveNavigationDestination(playerId, intent, deps, pathingOptions);
        if (destination.mapId !== currentMapId) {
            return this.resolveNavigationStep(playerId, intent, deps);
        }
        if (destination.goals.some((goal) => goal.x === player.x && goal.y === player.y)) {
            logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.arrived', {
                playerId, mapId: destination.mapId, at: { x: player.x, y: player.y }, goals: destination.goals,
            });
            return { kind: 'done' };
        }
        const preferredPath = intent.kind === 'point'
            ? resolvePreferredClientPathHint(instance, player.playerId, player.x, player.y, destination.goals, intent.clientPathHint)
            : null;
        if (preferredPath) {
            const direction = directionFromStep(player.x, player.y, preferredPath.points[0].x, preferredPath.points[0].y);
            if (direction === null) {
                throw new BadRequestException(intent.kind === 'quest' ? '任务目标当前不可达' : '无法到达该位置');
            }
            return { kind: 'move', direction, maxSteps: preferredPath.points.length, path: preferredPath.points.map((entry) => ({ x: entry.x, y: entry.y })) };
        }
        const blocked = buildPathingBlockArray(instance, player.playerId, destination.goals, true);
        const pathResult = await this.asyncPathfindingService.findPathAsync(
            instance,
            blocked,
            player.x,
            player.y,
            destination.goals,
        );
        if (pathResult.status !== 'success' || pathResult.path.length === 0) {
            throw new BadRequestException(intent.kind === 'quest' ? '任务目标当前不可达' : '无法到达该位置');
        }
        const direction = directionFromStep(player.x, player.y, pathResult.path[0].x, pathResult.path[0].y);
        if (direction === null) {
            throw new BadRequestException(intent.kind === 'quest' ? '任务目标当前不可达' : '无法到达该位置');
        }
        logServerNextMovement(deps.logger ?? this.logger, 'runtime.navigation.local.path', {
            playerId,
            mapId: destination.mapId,
            from: { x: player.x, y: player.y },
            goals: destination.goals,
            direction,
            previewPath: isServerNextMovementDebugEnabled() ? pathResult.path.map((entry) => ({ x: entry.x, y: entry.y })) : null,
            pathSource: 'async_worker',
            pathExpandedNodes: pathResult.expandedNodes,
        });
        return { kind: 'move', direction, maxSteps: pathResult.path.length, path: pathResult.path.map((entry) => ({ x: entry.x, y: entry.y })) };
    }
    /**
 * resolveNavigationDestination：规范化或转换导航Destination。
 * @param playerId 玩家 ID。
 * @param intent 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新导航Destination相关状态。
 */

    resolveNavigationDestination(playerId, intent, deps, pathingOptions = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (intent.kind === 'point') {
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            const location = deps.getPlayerLocationOrThrow(playerId);
            const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
            const currentMapId = resolvePlayerMapId(player, instance);
            if (!currentMapId) {
                throw new BadRequestException('当前地图状态异常');
            }
            const goals = intent.mapId === currentMapId
                ? (() => {
                    return buildGoalPoints(instance, intent.x, intent.y, intent.allowNearestReachable, playerId, pathingOptions);
                })()
                : buildGoalPointsFromTemplate(
                    this.templateRepository.getOrThrow(intent.mapId),
                    intent.x,
                    intent.y,
                    intent.allowNearestReachable,
                );
            if (goals.length === 0) {
                throw new BadRequestException('无法到达该位置');
            }
            return { mapId: intent.mapId, goals };
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const quest = player.quests.quests.find((entry) => entry.id === intent.questId && entry.status !== 'completed');
        if (!quest) {
            throw new NotFoundException('目标任务不存在或已完成');
        }
        const resolved = deps.resolveQuestNavigationTarget(quest);
        if (!resolved) {
            throw new BadRequestException('当前任务没有可导航目标');
        }
        const targetTemplate = this.templateRepository.getOrThrow(resolved.mapId);
        const goals = resolved.adjacent
            ? buildAdjacentGoalPoints(targetTemplate, resolved.x, resolved.y)
            : buildGoalPointsFromTemplate(targetTemplate, resolved.x, resolved.y, true);
        if (goals.length === 0) {
            throw new BadRequestException('任务目标当前不可达');
        }
        return { mapId: resolved.mapId, goals };
    }
    /**
 * findMapRoute：读取地图路线并返回结果。
 * @param fromMapId fromMap ID。
 * @param toMapId toMap ID。
 * @returns 无返回值，完成地图路线的读取/组装。
 */

    findMapRoute(fromMapId, toMapId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (fromMapId === toMapId) {
            return [fromMapId];
        }
        const visited = new Set([fromMapId]);
        const queue = [{ mapId: fromMapId, path: [fromMapId] }];
        for (let index = 0; index < queue.length; index += 1) {
            const current = queue[index];
            const template = this.templateRepository.getOrThrow(current.mapId);
            for (const portal of template.portals) {
                if (visited.has(portal.targetMapId)) {
                    continue;
                }
                const nextPath = current.path.concat(portal.targetMapId);
                if (portal.targetMapId === toMapId) {
                    return nextPath;
                }
                visited.add(portal.targetMapId);
                queue.push({ mapId: portal.targetMapId, path: nextPath });
            }
        }
        return null;
    }
};
/**
 * findPathPointsOnMap：读取路径PointOn地图并返回结果。
 * @param instance 地图实例。
 * @param playerId 玩家 ID。
 * @param startX 参数说明。
 * @param startY 参数说明。
 * @param goals 参数说明。
 * @returns 无返回值，完成路径PointOn地图的读取/组装。
 */

function findPathPointsOnMap(instance, playerId, startX, startY, goals, pathingOptions = undefined) {
    const result = findOptimalPathOnMap(instance, playerId, startX, startY, goals, true, pathingOptions);
    return result ? result.points : null;
}
