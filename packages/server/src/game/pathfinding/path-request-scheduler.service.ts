/**
 * 寻路请求调度：统一收集、按优先级与移速排序、下发到 worker 池。
 */
import { Injectable } from '@nestjs/common';
import {
  PATH_REQUEST_DISPATCH_BATCH_SIZE,
} from '../../constants/gameplay/pathfinding';
import { MapService } from '../map.service';
import { PathWorkerPoolService } from './path-worker-pool.service';
import {
  PathPoint,
  PathfindingActorType,
  PathfindingSearchLimits,
  PathfindingTask,
  PathfindingTaskResult,
  PathRequestKind,
} from './pathfinding.types';

interface PendingPathRequest {
  requestId: string;
  actorId: string;
  actorType: PathfindingActorType;
  selfOccupancyId?: string | null;
  kind: PathRequestKind;
  mapId: string;
  priority: number;
  moveSpeed: number;
  enqueueOrder: number;
  startX: number;
  startY: number;
  goals: PathPoint[];
  limits: PathfindingSearchLimits;
}

interface EnqueuePathRequestInput {
  actorId: string;
  actorType: PathfindingActorType;
  selfOccupancyId?: string | null;
  kind: PathRequestKind;
  mapId: string;
  priority: number;
  moveSpeed: number;
  startX: number;
  startY: number;
  goals: PathPoint[];
  limits: PathfindingSearchLimits;
}

@Injectable()
export class PathRequestSchedulerService {
  private sequence = 1;
  private readonly pendingById = new Map<string, PendingPathRequest>();
  private readonly latestRequestIdByActor = new Map<string, string>();
  private readonly completedByActor = new Map<string, PathfindingTaskResult>();

  constructor(
    private readonly mapService: MapService,
    private readonly workerPool: PathWorkerPoolService,
  ) {}

  enqueue(input: EnqueuePathRequestInput): string {
    const requestId = `${input.actorId}:${this.sequence++}`;
    const request: PendingPathRequest = {
      ...input,
      requestId,
      enqueueOrder: this.sequence,
    };
    this.latestRequestIdByActor.set(input.actorId, requestId);
    this.completedByActor.delete(input.actorId);

    for (const [id, pending] of this.pendingById.entries()) {
      if (pending.actorId === input.actorId) {
        this.pendingById.delete(id);
      }
    }

    this.pendingById.set(requestId, request);
    return requestId;
  }

  cancelActor(actorId: string): void {
    this.latestRequestIdByActor.delete(actorId);
    this.completedByActor.delete(actorId);
    for (const [id, pending] of this.pendingById.entries()) {
      if (pending.actorId === actorId) {
        this.pendingById.delete(id);
      }
    }
  }

  pumpMap(mapId: string): void {
    this.collectCompletedResults();

    let dispatched = 0;
    while (this.workerPool.hasIdleWorker() && dispatched < PATH_REQUEST_DISPATCH_BATCH_SIZE) {
      const next = this.pickNextPending(mapId);
      if (!next) {
        break;
      }

      const staticGrid = this.mapService.getPathfindingStaticGrid(next.mapId);
      const blocked = this.mapService.buildPathfindingBlockedGrid(next.mapId, next.actorType, next.selfOccupancyId);
      if (!staticGrid || !blocked) {
        this.completedByActor.set(next.actorId, {
          status: 'failed',
          reason: 'invalid_goal',
          expandedNodes: 0,
          requestId: next.requestId,
          actorId: next.actorId,
          kind: next.kind,
          mapId: next.mapId,
          mapRevision: 0,
          elapsedMs: 0,
        });
        continue;
      }

      const task: PathfindingTask = {
        requestId: next.requestId,
        actorId: next.actorId,
        actorType: next.actorType,
        kind: next.kind,
        priority: next.priority,
        moveSpeed: next.moveSpeed,
        enqueueOrder: next.enqueueOrder,
        startX: next.startX,
        startY: next.startY,
        goals: next.goals,
        staticGrid,
        blocked,
        limits: next.limits,
      };

      if (!this.workerPool.dispatch(task)) {
        this.pendingById.set(next.requestId, next);
        break;
      }
      dispatched += 1;
    }
  }

  takeResult(actorId: string, requestId?: string): PathfindingTaskResult | null {
    this.collectCompletedResults();
    const result = this.completedByActor.get(actorId);
    if (!result) {
      return null;
    }
    if (requestId && result.requestId !== requestId) {
      return null;
    }
    this.completedByActor.delete(actorId);
    return result;
  }

  private collectCompletedResults(): void {
    for (const result of this.workerPool.drainCompleted()) {
      const latest = this.latestRequestIdByActor.get(result.actorId);
      if (latest !== result.requestId) {
        continue;
      }
      this.completedByActor.set(result.actorId, result);
    }
  }

  private pickNextPending(mapId: string): PendingPathRequest | null {
    const candidates = [...this.pendingById.values()]
      .filter((request) => request.mapId === mapId && this.latestRequestIdByActor.get(request.actorId) === request.requestId)
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }
        if (right.moveSpeed !== left.moveSpeed) {
          return right.moveSpeed - left.moveSpeed;
        }
        return left.enqueueOrder - right.enqueueOrder;
      });

    const next = candidates[0] ?? null;
    if (next) {
      this.pendingById.delete(next.requestId);
    }
    return next;
  }
}
