/**
 * 寻路与移动服务：A* 寻路、路径跟随、方向移动、移动点数管理
 */
import { Injectable } from '@nestjs/common';
import {
  CARDINAL_DIRECTION_STEPS,
  directionFromTo,
  directionToDelta,
  Direction,
  getMovePointsPerTick,
  manhattanDistance,
  MAX_STORED_MOVE_POINTS,
  PlayerState,
} from '@mud/shared';
import { AttrService } from './attr.service';
import { MapService } from './map.service';

interface PathStep {
  x: number;
  y: number;
}

interface MoveTargetState {
  targetX: number;
  targetY: number;
  path: PathStep[];
  blockedTicks: number;
}

interface SetMoveTargetOptions {
  allowNearestReachable?: boolean;
}

interface MoveChargeState {
  intentKey: string;
  points: number;
}

interface HeapNode {
  index: number;
  score: number;
}

/** 单步寻路结果 */
export interface NavigationStepResult {
  moved: boolean;
  reached: boolean;
  blocked: boolean;
  error?: string;
}

interface PathMoveAttemptResult {
  moved: boolean;
  blocked: boolean;
  points: number;
}

const MIN_STEP_COST = 1;

class MinHeap {
  private items: HeapNode[] = [];

  push(node: HeapNode) {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapNode | undefined {
    if (this.items.length === 0) return undefined;
    const head = this.items[0];
    const tail = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = tail;
      this.bubbleDown(0);
    }
    return head;
  }

  get size(): number {
    return this.items.length;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].score <= this.items[index].score) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  private bubbleDown(index: number) {
    const last = this.items.length - 1;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left <= last && this.items[left].score < this.items[smallest].score) {
        smallest = left;
      }
      if (right <= last && this.items[right].score < this.items[smallest].score) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }
}

@Injectable()
export class NavigationService {
  private readonly moveTargets = new Map<string, MoveTargetState>();
  private readonly moveCharges = new Map<string, MoveChargeState>();

  constructor(
    private readonly mapService: MapService,
    private readonly attrService: AttrService,
  ) {}

  /** 清除寻路目标和关联的移动点数 */
  clearMoveTarget(playerId: string) {
    this.moveTargets.delete(playerId);
    const charge = this.moveCharges.get(playerId);
    if (charge?.intentKey.startsWith('target:')) {
      this.moveCharges.delete(playerId);
    }
  }

  hasMoveTarget(playerId: string): boolean {
    return this.moveTargets.has(playerId);
  }

  /** 获取当前寻路路径的坐标序列 */
  getPathPoints(playerId: string): Array<[number, number]> {
    const state = this.moveTargets.get(playerId);
    if (!state) return [];
    return state.path.map((step) => [step.x, step.y]);
  }

  /** 设置玩家寻路目标，自动计算路径 */
  setMoveTarget(player: PlayerState, x: number, y: number, options?: SetMoveTargetOptions): string | null {
    let targetX = x;
    let targetY = y;

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

    const path = this.findPath(player.mapId, player.x, player.y, targetX, targetY, player.id);
    if (path === null) {
      this.clearMoveTarget(player.id);
      return '无法到达该位置';
    }

    if (path.length === 0) {
      this.clearMoveTarget(player.id);
      return null;
    }

    this.moveTargets.set(player.id, {
      targetX,
      targetY,
      path,
      blockedTicks: 0,
    });
    return null;
  }

  /** 每 tick 沿路径推进玩家位置 */
  stepPlayerTowardTarget(player: PlayerState): NavigationStepResult {
    const state = this.moveTargets.get(player.id);
    if (!state) {
      return { moved: false, reached: false, blocked: false };
    }

    if (player.x === state.targetX && player.y === state.targetY) {
      this.clearMoveTarget(player.id);
      return { moved: false, reached: true, blocked: false };
    }

    if (!this.syncPath(player, state)) {
      this.clearMoveTarget(player.id);
      return { moved: false, reached: false, blocked: false, error: '无法到达该位置' };
    }

    const next = state.path[0];
    if (!next) {
      this.clearMoveTarget(player.id);
      return { moved: false, reached: true, blocked: false };
    }

    const intentKey = `target:${player.mapId}:${state.targetX},${state.targetY}`;
    const availablePoints = this.rechargeMovePoints(player, intentKey);
    const attempt = this.tryMoveAlongPath(player, state, availablePoints);
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
      if (this.rebuildPath(player, state)) {
        const alternate = state.path[0];
        const retry = alternate ? this.tryMoveAlongPath(player, state, attempt.points) : null;
        if (retry) {
          this.commitMovePoints(player.id, intentKey, retry.points);
        }
        if (retry?.moved) {
          const reached = player.x === state.targetX && player.y === state.targetY;
          if (reached) {
            this.clearMoveTarget(player.id);
          }
          return { moved: true, reached, blocked: false };
        }
      } else {
        this.clearMoveTarget(player.id);
        return { moved: false, reached: false, blocked: false, error: '无法到达该位置' };
      }
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

  private syncPath(player: PlayerState, state: MoveTargetState): boolean {
    const next = state.path[0];
    if (!next) {
      return this.rebuildPath(player, state);
    }
    if (manhattanDistance(next, player) !== 1) {
      return this.rebuildPath(player, state);
    }
    return true;
  }

  private rebuildPath(player: PlayerState, state: MoveTargetState): boolean {
    const path = this.findPath(player.mapId, player.x, player.y, state.targetX, state.targetY, player.id);
    if (path === null) return false;
    state.path = path;
    return true;
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
    return { moved, blocked, points };
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

  /** A* 寻路，返回路径步骤数组或 null（不可达） */
  private findPath(
    mapId: string,
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    selfOccupancyId: string,
  ): PathStep[] | null {
    const meta = this.mapService.getMapMeta(mapId);
    if (!meta) return null;
    if (startX === targetX && startY === targetY) return [];
    if (!this.mapService.isTerrainWalkable(mapId, targetX, targetY)) return null;

    const width = meta.width;
    const height = meta.height;
    const total = width * height;
    const startIndex = this.toIndex(startX, startY, width);
    const goalIndex = this.toIndex(targetX, targetY, width);
    const gScore = new Float64Array(total);
    gScore.fill(Number.POSITIVE_INFINITY);
    const parent = new Int32Array(total);
    parent.fill(-1);
    const closed = new Uint8Array(total);
    const heap = new MinHeap();

    gScore[startIndex] = 0;
    heap.push({ index: startIndex, score: this.heuristic(startX, startY, targetX, targetY) });

    while (heap.size > 0) {
      const current = heap.pop();
      if (!current) break;
      if (closed[current.index]) continue;
      closed[current.index] = 1;

      if (current.index === goalIndex) {
        return this.reconstructPath(parent, goalIndex, startIndex, width);
      }

      const x = current.index % width;
      const y = Math.floor(current.index / width);
      for (const { dx, dy } of CARDINAL_DIRECTION_STEPS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (!this.mapService.isTerrainWalkable(mapId, nx, ny)) continue;

        const nextIndex = this.toIndex(nx, ny, width);
        if (closed[nextIndex]) continue;

        const stepCost = this.mapService.getTraversalCost(mapId, nx, ny) + this.occupancyPenalty(mapId, nx, ny, selfOccupancyId);
        if (!Number.isFinite(stepCost)) continue;
        const nextScore = gScore[current.index] + stepCost;
        if (nextScore >= gScore[nextIndex]) continue;

        gScore[nextIndex] = nextScore;
        parent[nextIndex] = current.index;
        heap.push({
          index: nextIndex,
          score: nextScore + this.heuristic(nx, ny, targetX, targetY),
        });
      }
    }

    return null;
  }

  private heuristic(x: number, y: number, targetX: number, targetY: number): number {
    return manhattanDistance({ x, y }, { x: targetX, y: targetY }) * MIN_STEP_COST;
  }

  private occupancyPenalty(
    mapId: string,
    x: number,
    y: number,
    selfOccupancyId: string,
  ): number {
    if (this.mapService.canOccupy(mapId, x, y, { occupancyId: selfOccupancyId, actorType: 'player' })) return 0;
    return Number.POSITIVE_INFINITY;
  }

  private reconstructPath(parent: Int32Array, goalIndex: number, startIndex: number, width: number): PathStep[] {
    const path: PathStep[] = [];
    let current = goalIndex;
    while (current !== startIndex && current !== -1) {
      path.push({
        x: current % width,
        y: Math.floor(current / width),
      });
      current = parent[current];
    }
    path.reverse();
    return path;
  }

  private toIndex(x: number, y: number, width: number): number {
    return y * width + x;
  }
}
