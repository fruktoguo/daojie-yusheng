/**
 * 寻路与移动服务：路径状态管理、请求调度接入、方向移动、移动点数管理。
 */
import { Injectable } from '@nestjs/common';
import {
  directionFromTo,
  directionToDelta,
  Direction,
  getMovePointsPerTick,
  manhattanDistance,
  MAX_STORED_MOVE_POINTS,
  PATHFINDING_APPROACH_MAX_EXPANDED_NODES,
  PATHFINDING_APPROACH_MAX_PATH_LENGTH,
  PATHFINDING_BOT_MAX_EXPANDED_NODES,
  PATHFINDING_BOT_MAX_PATH_LENGTH,
  PATHFINDING_PLAYER_MAX_EXPANDED_NODES,
  PATHFINDING_PLAYER_MAX_PATH_LENGTH,
  PATHFINDING_PLAYER_MAX_TARGET_DISTANCE,
  PATHFINDING_REPATH_MAX_EXPANDED_NODES,
  PATHFINDING_REPATH_MAX_PATH_LENGTH,
  PlayerState,
  unpackDirections,
} from '@mud/shared';
import {
  PATH_REQUEST_MAX_PER_TICK_PER_PLAYER,
  PATH_DYNAMIC_ADJUST_LOOKAHEAD,
  PATH_DYNAMIC_ADJUST_MAX_RADIUS,
  PATH_REPATH_COOLDOWN_TICKS,
  PATH_REQUEST_PRIORITY_BOT_ROAM,
  PATH_REQUEST_PRIORITY_PLAYER_MOVE,
  PATH_REQUEST_PRIORITY_PLAYER_REPATH,
  PATH_RETRY_BACKOFF_TICKS,
} from '../constants/gameplay/pathfinding';
import { AttrService } from './attr.service';
import { MapService } from './map.service';
import { PathRequestSchedulerService } from './pathfinding/path-request-scheduler.service';
import { findBoundedPath } from './pathfinding/pathfinding-core';
import { PathRequestKind, PathfindingActorType } from './pathfinding/pathfinding.types';
import { TimeService } from './time.service';

interface PathStep {
  x: number;
  y: number;
}

interface MoveTargetState {
  targetX: number;
  targetY: number;
  path: PathStep[];
  blockedTicks: number;
  pendingRequestId?: string;
  pendingError?: string;
  pathComplete: boolean;
  failureCount: number;
  repathAvailableTick: number;
  showFailureMessage: boolean;
  requestKind: PathRequestKind;
}

interface SetMoveTargetOptions {
  allowNearestReachable?: boolean;
  clientPackedPath?: string;
  clientPackedPathSteps?: number;
  clientPathStartX?: number;
  clientPathStartY?: number;
  forceReplan?: boolean;
}

interface MoveRequestQuotaState {
  tick: number;
  count: number;
}

interface MoveChargeState {
  intentKey: string;
  points: number;
}

/** 单步寻路结果 */
export interface NavigationStepResult {
  moved: boolean;
  reached: boolean;
  blocked: boolean;
  error?: string;
}

export interface NavigationGoalPoint {
  x: number;
  y: number;
}

type NavigationActorType = 'player' | 'monster';

interface PathMoveAttemptResult {
  moved: boolean;
  blocked: boolean;
  points: number;
}

interface LocalAdjustmentResult {
  path: PathStep[];
  rejoinIndex: number;
}

@Injectable()
export class NavigationService {
  private readonly moveTargets = new Map<string, MoveTargetState>();
  private readonly moveCharges = new Map<string, MoveChargeState>();
  private readonly mapPathTicks = new Map<string, number>();
  private readonly moveRequestQuotaByPlayer = new Map<string, MoveRequestQuotaState>();
  private readonly pathVersions = new Map<string, number>();

  constructor(
    private readonly mapService: MapService,
    private readonly attrService: AttrService,
    private readonly pathRequestScheduler: PathRequestSchedulerService,
    private readonly timeService: TimeService,
  ) {}

  /** 每息统一派发当前地图的寻路请求。 */
  pumpScheduledPaths(mapId: string): void {
    this.mapPathTicks.set(mapId, (this.mapPathTicks.get(mapId) ?? 0) + 1);
    this.pathRequestScheduler.pumpMap(mapId);
  }

  /** 清除寻路目标和关联的移动点数 */
  clearMoveTarget(playerId: string): void {
    if (this.moveTargets.has(playerId)) {
      this.bumpPathVersion(playerId);
    }
    this.moveTargets.delete(playerId);
    this.pathRequestScheduler.cancelActor(playerId);
    const charge = this.moveCharges.get(playerId);
    if (charge?.intentKey.startsWith('target:')) {
      this.moveCharges.delete(playerId);
    }
  }

  hasMoveTarget(playerId: string): boolean {
    return this.moveTargets.has(playerId);
  }

  /** 玩家点击移动时，立刻启动寻路；状态生效仍然只在 tick 中完成。 */
  primeMoveTarget(player: PlayerState, x: number, y: number, options?: SetMoveTargetOptions): string | null {
    if (!this.consumePlayerMoveRequestQuota(player)) {
      return '本息调整目标过于频繁';
    }
    const error = this.setMoveTarget(player, x, y, {
      ...options,
      forceReplan: true,
    });
    if (error) {
      return error;
    }
    const state = this.moveTargets.get(player.id);
    if (state?.pendingRequestId) {
      this.pathRequestScheduler.dispatchNow(player.mapId, 1);
    }
    return null;
  }

  /** 获取当前寻路路径的坐标序列 */
  getPathPoints(playerId: string): Array<[number, number]> {
    const state = this.moveTargets.get(playerId);
    if (!state) return [];
    return state.path.map((step) => [step.x, step.y]);
  }

  getPathVersion(playerId: string): number {
    return this.pathVersions.get(playerId) ?? 0;
  }

  /** 设置玩家寻路目标，交由统一调度器异步计算路径 */
  setMoveTarget(player: PlayerState, x: number, y: number, options?: SetMoveTargetOptions): string | null {
    let targetX = x;
    let targetY = y;

    if (player.x === targetX && player.y === targetY) {
      this.clearMoveTarget(player.id);
      return null;
    }

    if (!player.isBot && manhattanDistance(player, { x: targetX, y: targetY }) > PATHFINDING_PLAYER_MAX_TARGET_DISTANCE) {
      this.clearMoveTarget(player.id);
      return '目标过远，无法规划路径';
    }

    if ((player.x !== targetX || player.y !== targetY) && !this.mapService.canOccupy(player.mapId, targetX, targetY, {
      occupancyId: player.id,
      actorType: 'player',
    })) {
      if (!options?.allowNearestReachable) {
        this.clearMoveTarget(player.id);
        return '无法到达该位置';
      }
      const fallback = this.mapService.findNearbyWalkable(player.mapId, targetX, targetY, 8, {
        occupancyId: player.id,
        actorType: 'player',
      });
      if (!fallback) {
        this.clearMoveTarget(player.id);
        return '无法到达该位置';
      }
      targetX = fallback.x;
      targetY = fallback.y;
    }

    if ((player.x !== targetX || player.y !== targetY) && !this.mapService.canOccupy(player.mapId, targetX, targetY, {
      occupancyId: player.id,
      actorType: 'player',
    })) {
      this.clearMoveTarget(player.id);
      return '无法到达该位置';
    }

    const existing = this.moveTargets.get(player.id);
    if (
      !options?.forceReplan
      && existing
      && existing.targetX === targetX
      && existing.targetY === targetY
      && (existing.pendingRequestId || existing.path.length > 0)
    ) {
      return null;
    }

    const requestKind: PathRequestKind = player.isBot ? 'bot_roam' : 'player_move_to';
    const clientPath = !player.isBot
      ? this.validateClientPath(player, targetX, targetY, options)
      : null;
    if (clientPath) {
      this.moveTargets.set(player.id, {
        targetX,
        targetY,
        path: clientPath,
        blockedTicks: 0,
        pathComplete: true,
        failureCount: 0,
        repathAvailableTick: this.getCurrentMapPathTick(player.mapId),
        showFailureMessage: true,
        requestKind,
      });
      this.bumpPathVersion(player.id);
      return null;
    }

    const requestId = this.enqueuePathRequest(player, requestKind, targetX, targetY);
    this.moveTargets.set(player.id, {
      targetX,
      targetY,
      path: [],
      blockedTicks: 0,
      pendingRequestId: requestId,
      pathComplete: false,
      failureCount: 0,
      repathAvailableTick: this.getCurrentMapPathTick(player.mapId),
      showFailureMessage: !player.isBot,
      requestKind,
    });
    this.bumpPathVersion(player.id);
    return null;
  }

  /** 每 tick 沿路径推进玩家位置 */
  stepPlayerTowardTarget(player: PlayerState): NavigationStepResult {
    const state = this.moveTargets.get(player.id);
    if (!state) {
      return { moved: false, reached: false, blocked: false };
    }

    this.consumeResolvedPath(player, state);
    if (!this.moveTargets.has(player.id)) {
      return { moved: false, reached: false, blocked: false };
    }
    if (state.pendingError) {
      const error = state.pendingError;
      this.clearMoveTarget(player.id);
      return { moved: false, reached: false, blocked: false, error };
    }

    if (player.x === state.targetX && player.y === state.targetY) {
      this.clearMoveTarget(player.id);
      return { moved: false, reached: true, blocked: false };
    }

    if (!this.syncPath(player, state)) {
      this.queueRepath(player, state);
      return { moved: false, reached: false, blocked: false };
    }

    const next = state.path[0];
    if (!next) {
      if (state.pendingRequestId) {
        return { moved: false, reached: false, blocked: false };
      }
      if (!state.pathComplete) {
        this.queuePathContinuation(player, state);
        return { moved: false, reached: false, blocked: false };
      }
      this.queueRepath(player, state);
      return { moved: false, reached: false, blocked: false };
    }

    const intentKey = `target:${player.mapId}:${state.targetX},${state.targetY}`;
    const availablePoints = this.rechargeMovePoints(player, intentKey);
    const attempt = this.consumePathWithinTick(player, state, availablePoints);
    this.commitMovePoints(player.id, intentKey, attempt.points);
    if (attempt.moved) {
      const reached = player.x === state.targetX && player.y === state.targetY;
      if (reached) {
        this.clearMoveTarget(player.id);
      }
      return { moved: true, reached, blocked: false };
    }

    if (attempt.blocked) {
      state.blockedTicks += 1;
      this.queueRepath(player, state);
    }

    return { moved: false, reached: false, blocked: attempt.blocked };
  }

  /** 按方向键移动玩家（消耗移动点数，可连续移动多格） */
  stepPlayerByDirection(player: PlayerState, direction: Direction): boolean {
    const [dx, dy] = directionToDelta(direction);
    player.facing = direction;
    const intentKey = `dir:${player.mapId}:${direction}`;
    let points = this.rechargeMovePoints(player, intentKey);
    let moved = false;
    while (true) {
      const nextX = player.x + dx;
      const nextY = player.y + dy;
      const stepCost = this.getStepMovePointCost(player.mapId, nextX, nextY);
      if (!Number.isFinite(stepCost)) {
        this.moveCharges.delete(player.id);
        return moved;
      }
      if (points < stepCost) {
        break;
      }
      if (!this.tryMovePlayer(player, nextX, nextY)) {
        this.moveCharges.delete(player.id);
        return moved;
      }
      points -= stepCost;
      moved = true;
    }
    this.commitMovePoints(player.id, intentKey, points);
    return moved;
  }

  findNextStepTowardClosestGoal(
    mapId: string,
    startX: number,
    startY: number,
    goals: NavigationGoalPoint[],
    selfOccupancyId: string,
    actorType: NavigationActorType = 'player',
  ): NavigationGoalPoint | null {
    const staticGrid = this.mapService.getPathfindingStaticGrid(mapId);
    const blocked = this.mapService.buildPathfindingBlockedGrid(mapId, actorType as PathfindingActorType, selfOccupancyId);
    if (!staticGrid || !blocked || goals.length === 0) {
      return null;
    }

    const result = findBoundedPath(
      staticGrid,
      blocked,
      startX,
      startY,
      goals,
      {
        maxExpandedNodes: PATHFINDING_APPROACH_MAX_EXPANDED_NODES,
        maxPathLength: PATHFINDING_APPROACH_MAX_PATH_LENGTH,
      },
    );
    if (result.status !== 'success') {
      return null;
    }

    const next = result.path[0];
    return next ? { x: next.x, y: next.y } : null;
  }

  private syncPath(player: PlayerState, state: MoveTargetState): boolean {
    const next = state.path[0];
    if (!next) {
      return false;
    }
    return manhattanDistance(next, player) === 1;
  }

  private tryMovePlayer(player: PlayerState, x: number, y: number): boolean {
    if (!this.mapService.canOccupy(player.mapId, x, y, { occupancyId: player.id, actorType: 'player' })) return false;
    this.mapService.removeOccupant(player.mapId, player.x, player.y, player.id);
    player.facing = directionFromTo(player.x, player.y, x, y);
    player.x = x;
    player.y = y;
    this.mapService.addOccupant(player.mapId, player.x, player.y, player.id, 'player');
    return true;
  }

  private tryMoveAlongPath(player: PlayerState, state: MoveTargetState, initialPoints: number): PathMoveAttemptResult {
    let points = initialPoints;
    let moved = false;
    let blocked = false;
    const initialPathLength = state.path.length;
    while (true) {
      const next = state.path[0];
      if (!next) break;
      const stepCost = this.getStepMovePointCost(player.mapId, next.x, next.y);
      if (!Number.isFinite(stepCost)) {
        this.moveCharges.delete(player.id);
        blocked = true;
        break;
      }
      if (points < stepCost) {
        break;
      }
      if (!this.tryMovePlayer(player, next.x, next.y)) {
        this.moveCharges.delete(player.id);
        blocked = true;
        break;
      }
      points -= stepCost;
      state.path.shift();
      state.blockedTicks = 0;
      moved = true;
      if (player.x === state.targetX && player.y === state.targetY) {
        break;
      }
    }
    if (state.path.length !== initialPathLength) {
      this.bumpPathVersion(player.id);
    }
    return { moved, blocked, points };
  }

  private consumePathWithinTick(player: PlayerState, state: MoveTargetState, initialPoints: number): PathMoveAttemptResult {
    let attempt = this.tryMoveAlongPath(player, state, initialPoints);
    if (attempt.blocked) {
      const adjustment = this.tryBuildLocalAdjustment(player, state);
      if (adjustment) {
        state.path = adjustment.path.concat(state.path.slice(adjustment.rejoinIndex + 1));
        this.bumpPathVersion(player.id);
        const continued = this.tryMoveAlongPath(player, state, attempt.points);
        attempt = {
          moved: attempt.moved || continued.moved,
          blocked: continued.blocked,
          points: continued.points,
        };
      }
    }
    if (
      attempt.moved
      && !attempt.blocked
      && attempt.points > 0
      && !state.pathComplete
      && !state.pendingRequestId
      && state.path.length === 0
      && (player.x !== state.targetX || player.y !== state.targetY)
    ) {
      this.queuePathContinuation(player, state);
    }
    return attempt;
  }

  private rechargeMovePoints(player: PlayerState, intentKey: string): number {
    const existing = this.moveCharges.get(player.id);
    const current = existing?.intentKey === intentKey ? existing.points : 0;
    const numericStats = this.attrService.getPlayerNumericStats(player);
    return Math.min(MAX_STORED_MOVE_POINTS, current + getMovePointsPerTick(numericStats.moveSpeed));
  }

  private commitMovePoints(playerId: string, intentKey: string, points: number): void {
    if (points <= 0) {
      this.moveCharges.delete(playerId);
      return;
    }
    this.moveCharges.set(playerId, {
      intentKey,
      points: Math.min(MAX_STORED_MOVE_POINTS, points),
    });
  }

  private getStepMovePointCost(mapId: string, x: number, y: number): number {
    const traversalCost = this.mapService.getTraversalCost(mapId, x, y);
    if (!Number.isFinite(traversalCost)) {
      return Number.POSITIVE_INFINITY;
    }
    return traversalCost;
  }

  private enqueuePathRequest(
    player: PlayerState,
    requestKind: PathRequestKind,
    targetX: number,
    targetY: number,
  ): string {
    const moveSpeed = this.attrService.getPlayerNumericStats(player).moveSpeed;
    const { priority, limits } = this.resolveRequestPolicy(player, requestKind);
    return this.pathRequestScheduler.enqueue({
      actorId: player.id,
      actorType: 'player',
      selfOccupancyId: player.id,
      kind: requestKind,
      mapId: player.mapId,
      priority,
      moveSpeed,
      startX: player.x,
      startY: player.y,
      goals: [{ x: targetX, y: targetY }],
      limits,
    });
  }

  private queueRepath(player: PlayerState, state: MoveTargetState): void {
    if (state.pendingRequestId) {
      return;
    }

    const currentTick = this.getCurrentMapPathTick(player.mapId);
    if (currentTick < state.repathAvailableTick) {
      return;
    }

    state.pendingRequestId = this.enqueuePathRequest(
      player,
      player.isBot ? 'bot_roam' : 'player_repath',
      state.targetX,
      state.targetY,
    );
    state.repathAvailableTick = currentTick + PATH_REPATH_COOLDOWN_TICKS;
  }

  private queuePathContinuation(player: PlayerState, state: MoveTargetState): void {
    if (state.pendingRequestId) {
      return;
    }

    state.pendingRequestId = this.enqueuePathRequest(
      player,
      state.requestKind,
      state.targetX,
      state.targetY,
    );
    state.repathAvailableTick = this.getCurrentMapPathTick(player.mapId);
  }

  private consumeResolvedPath(player: PlayerState, state: MoveTargetState): void {
    if (!state.pendingRequestId) {
      return;
    }

    const result = this.pathRequestScheduler.takeResult(player.id, state.pendingRequestId);
    if (!result) {
      return;
    }

    state.pendingRequestId = undefined;
    if (result.status === 'success') {
      state.path = result.path.map((step) => ({ x: step.x, y: step.y }));
      state.pathComplete = result.complete;
      state.blockedTicks = 0;
      state.failureCount = 0;
      state.pendingError = undefined;
      state.repathAvailableTick = this.getCurrentMapPathTick(player.mapId);
      this.bumpPathVersion(player.id);
      return;
    }

    state.path = [];
    state.pathComplete = false;
    state.blockedTicks = 0;
    state.failureCount += 1;
    state.repathAvailableTick = this.getCurrentMapPathTick(player.mapId) + (PATH_RETRY_BACKOFF_TICKS * state.failureCount);
    this.bumpPathVersion(player.id);
    if (state.showFailureMessage) {
      state.pendingError = this.translateFailureReason(result.reason);
      return;
    }
    this.clearMoveTarget(player.id);
  }

  private resolveRequestPolicy(
    player: PlayerState,
    requestKind: PathRequestKind,
  ): {
    priority: number;
    limits: {
      maxExpandedNodes: number;
      maxPathLength: number;
      maxGoalDistance?: number;
      allowPartialPath?: boolean;
    };
  } {
    if (requestKind === 'bot_roam' || player.isBot) {
      return {
        priority: PATH_REQUEST_PRIORITY_BOT_ROAM,
        limits: {
          maxExpandedNodes: PATHFINDING_BOT_MAX_EXPANDED_NODES,
          maxPathLength: PATHFINDING_BOT_MAX_PATH_LENGTH,
        },
      };
    }

    if (requestKind === 'player_repath') {
      return {
        priority: PATH_REQUEST_PRIORITY_PLAYER_REPATH,
        limits: {
          maxExpandedNodes: PATHFINDING_REPATH_MAX_EXPANDED_NODES,
          maxPathLength: PATHFINDING_REPATH_MAX_PATH_LENGTH,
          maxGoalDistance: PATHFINDING_PLAYER_MAX_TARGET_DISTANCE,
          allowPartialPath: false,
        },
      };
    }

    return {
      priority: PATH_REQUEST_PRIORITY_PLAYER_MOVE,
      limits: {
        maxExpandedNodes: PATHFINDING_PLAYER_MAX_EXPANDED_NODES,
        maxPathLength: PATHFINDING_PLAYER_MAX_PATH_LENGTH,
        maxGoalDistance: PATHFINDING_PLAYER_MAX_TARGET_DISTANCE,
        allowPartialPath: false,
      },
    };
  }

  private translateFailureReason(reason: string): string {
    switch (reason) {
      case 'target_too_far':
        return '目标过远，无法规划路径';
      case 'cancelled':
        return '寻路已取消';
      case 'step_limit':
      case 'path_too_long':
      case 'no_path':
      case 'invalid_goal':
      default:
        return '无法到达该位置';
    }
  }

  private getCurrentMapPathTick(mapId: string): number {
    return this.mapPathTicks.get(mapId) ?? this.timeService.getTotalTicks(mapId);
  }

  private consumePlayerMoveRequestQuota(player: PlayerState): boolean {
    const currentTick = this.timeService.getTotalTicks(player.mapId);
    const quota = this.moveRequestQuotaByPlayer.get(player.id);
    if (!quota || quota.tick !== currentTick) {
      this.moveRequestQuotaByPlayer.set(player.id, {
        tick: currentTick,
        count: 1,
      });
      return true;
    }
    if (quota.count >= PATH_REQUEST_MAX_PER_TICK_PER_PLAYER) {
      return false;
    }
    quota.count += 1;
    return true;
  }

  private validateClientPath(
    player: PlayerState,
    targetX: number,
    targetY: number,
    options?: SetMoveTargetOptions,
  ): PathStep[] | null {
    if (
      typeof options?.clientPackedPath !== 'string'
      || !Number.isInteger(options.clientPackedPathSteps)
      || typeof options.clientPathStartX !== 'number'
      || typeof options.clientPathStartY !== 'number'
    ) {
      return null;
    }

    if (options.clientPathStartX !== player.x || options.clientPathStartY !== player.y) {
      return null;
    }

    const packedPath = options.clientPackedPath;
    const packedPathSteps = options.clientPackedPathSteps ?? 0;
    const directions = unpackDirections(packedPath, packedPathSteps);
    if (!directions) {
      return null;
    }

    const path: PathStep[] = [];
    let currentX = player.x;
    let currentY = player.y;
    for (const direction of directions) {
      const [dx, dy] = directionToDelta(direction);
      currentX += dx;
      currentY += dy;
      if (!this.mapService.canTraverseTerrain(player.mapId, currentX, currentY)) {
        return null;
      }
      path.push({ x: currentX, y: currentY });
    }

    if (currentX !== targetX || currentY !== targetY) {
      return null;
    }

    return path;
  }

  private tryBuildLocalAdjustment(player: PlayerState, state: MoveTargetState): LocalAdjustmentResult | null {
    if (state.path.length === 0) {
      return null;
    }

    const goalIndicesByKey = new Map<string, number>();
    const lookahead = Math.min(state.path.length, PATH_DYNAMIC_ADJUST_LOOKAHEAD);
    for (let index = 0; index < lookahead; index += 1) {
      const step = state.path[index];
      if (manhattanDistance(player, step) > PATH_DYNAMIC_ADJUST_MAX_RADIUS) {
        continue;
      }
      if (!this.mapService.canOccupy(player.mapId, step.x, step.y, {
        occupancyId: player.id,
        actorType: 'player',
      })) {
        continue;
      }
      goalIndicesByKey.set(`${step.x},${step.y}`, index);
    }

    if (goalIndicesByKey.size === 0) {
      return null;
    }

    const radius = PATH_DYNAMIC_ADJUST_MAX_RADIUS;
    const width = radius * 2 + 1;
    const total = width * width;
    const center = radius * width + radius;
    const visited = new Uint8Array(total);
    const parent = new Int16Array(total);
    parent.fill(-1);
    const queue = new Int16Array(total);
    let head = 0;
    let tail = 0;
    queue[tail++] = center;
    visited[center] = 1;

    while (head < tail) {
      const localIndex = queue[head++]!;
      const localX = localIndex % width;
      const localY = Math.floor(localIndex / width);
      const worldX = player.x + (localX - radius);
      const worldY = player.y + (localY - radius);
      const goalIndex = goalIndicesByKey.get(`${worldX},${worldY}`);
      if (goalIndex !== undefined && localIndex !== center) {
        const path = this.reconstructLocalAdjustmentPath(player, parent, localIndex, width, radius);
        return path.length > 0 ? { path, rejoinIndex: goalIndex } : null;
      }

      for (const { dx, dy } of [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
      ]) {
        const nextLocalX = localX + dx;
        const nextLocalY = localY + dy;
        if (nextLocalX < 0 || nextLocalX >= width || nextLocalY < 0 || nextLocalY >= width) {
          continue;
        }
        const nextIndex = nextLocalY * width + nextLocalX;
        if (visited[nextIndex] === 1) {
          continue;
        }
        const nextWorldX = player.x + (nextLocalX - radius);
        const nextWorldY = player.y + (nextLocalY - radius);
        if (manhattanDistance(player, { x: nextWorldX, y: nextWorldY }) > radius) {
          continue;
        }
        if (!this.mapService.canOccupy(player.mapId, nextWorldX, nextWorldY, {
          occupancyId: player.id,
          actorType: 'player',
        })) {
          continue;
        }
        visited[nextIndex] = 1;
        parent[nextIndex] = localIndex;
        queue[tail++] = nextIndex;
      }
    }

    return null;
  }

  private reconstructLocalAdjustmentPath(
    player: PlayerState,
    parent: Int16Array,
    goalLocalIndex: number,
    width: number,
    radius: number,
  ): PathStep[] {
    const path: PathStep[] = [];
    let current = goalLocalIndex;
    const center = radius * width + radius;
    while (current !== center && current !== -1) {
      const localX = current % width;
      const localY = Math.floor(current / width);
      path.push({
        x: player.x + (localX - radius),
        y: player.y + (localY - radius),
      });
      current = parent[current];
    }
    path.reverse();
    return path;
  }

  private bumpPathVersion(playerId: string): number {
    const nextVersion = (this.pathVersions.get(playerId) ?? 0) + 1;
    this.pathVersions.set(playerId, nextVersion);
    return nextVersion;
  }
}
