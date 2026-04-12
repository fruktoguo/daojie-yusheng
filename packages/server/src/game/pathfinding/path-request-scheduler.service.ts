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
import { PerformanceService } from '../performance.service';

/** PendingPathRequest：定义该接口的能力与字段约束。 */
interface PendingPathRequest {
/** requestId：定义该变量以承载业务值。 */
  requestId: string;
/** actorId：定义该变量以承载业务值。 */
  actorId: string;
/** actorType：定义该变量以承载业务值。 */
  actorType: PathfindingActorType;
  selfOccupancyId?: string | null;
/** kind：定义该变量以承载业务值。 */
  kind: PathRequestKind;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** priority：定义该变量以承载业务值。 */
  priority: number;
/** moveSpeed：定义该变量以承载业务值。 */
  moveSpeed: number;
/** enqueueOrder：定义该变量以承载业务值。 */
  enqueueOrder: number;
/** enqueuedAtMs：定义该变量以承载业务值。 */
  enqueuedAtMs: number;
/** startX：定义该变量以承载业务值。 */
  startX: number;
/** startY：定义该变量以承载业务值。 */
  startY: number;
/** goals：定义该变量以承载业务值。 */
  goals: PathPoint[];
/** limits：定义该变量以承载业务值。 */
  limits: PathfindingSearchLimits;
}

/** EnqueuePathRequestInput：定义该接口的能力与字段约束。 */
interface EnqueuePathRequestInput {
/** actorId：定义该变量以承载业务值。 */
  actorId: string;
/** actorType：定义该变量以承载业务值。 */
  actorType: PathfindingActorType;
  selfOccupancyId?: string | null;
/** kind：定义该变量以承载业务值。 */
  kind: PathRequestKind;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** priority：定义该变量以承载业务值。 */
  priority: number;
/** moveSpeed：定义该变量以承载业务值。 */
  moveSpeed: number;
/** startX：定义该变量以承载业务值。 */
  startX: number;
/** startY：定义该变量以承载业务值。 */
  startY: number;
/** goals：定义该变量以承载业务值。 */
  goals: PathPoint[];
/** limits：定义该变量以承载业务值。 */
  limits: PathfindingSearchLimits;
}

@Injectable()
/** PathRequestSchedulerService：封装相关状态与行为。 */
export class PathRequestSchedulerService {
  private sequence = 1;
  private readonly pendingById = new Map<string, PendingPathRequest>();
  private readonly latestRequestIdByActor = new Map<string, string>();
  private readonly completedByActor = new Map<string, PathfindingTaskResult>();

  constructor(
    private readonly mapService: MapService,
    private readonly workerPool: PathWorkerPoolService,
    private readonly performanceService: PerformanceService,
  ) {}

/** enqueue：执行对应的业务逻辑。 */
  enqueue(input: EnqueuePathRequestInput): string {
    this.collectCompletedResults();
/** requestId：定义该变量以承载业务值。 */
    const requestId = `${input.actorId}:${this.sequence++}`;
/** request：定义该变量以承载业务值。 */
    const request: PendingPathRequest = {
      ...input,
      requestId,
      enqueueOrder: this.sequence,
      enqueuedAtMs: Date.now(),
    };
    this.workerPool.cancelActor(input.actorId);
    this.completedByActor.delete(input.actorId);

/** removedPendingCount：定义该变量以承载业务值。 */
    let removedPendingCount = 0;
    for (const [id, pending] of this.pendingById.entries()) {
      if (pending.actorId === input.actorId) {
        this.pendingById.delete(id);
        removedPendingCount += 1;
      }
    }

    this.latestRequestIdByActor.set(input.actorId, requestId);
    this.pendingById.set(requestId, request);
    this.performanceService.recordPathfindingEnqueued();
    this.performanceService.recordPathfindingPendingDropped(removedPendingCount);
    this.syncQueueDepthMetrics();
    return requestId;
  }

/** cancelActor：执行对应的业务逻辑。 */
  cancelActor(actorId: string): void {
    this.workerPool.cancelActor(actorId);
    this.latestRequestIdByActor.delete(actorId);
    this.completedByActor.delete(actorId);
/** removedPendingCount：定义该变量以承载业务值。 */
    let removedPendingCount = 0;
    for (const [id, pending] of this.pendingById.entries()) {
      if (pending.actorId === actorId) {
        this.pendingById.delete(id);
        removedPendingCount += 1;
      }
    }
    this.performanceService.recordPathfindingPendingDropped(removedPendingCount);
    this.syncQueueDepthMetrics();
  }

/** dispatchNow：执行对应的业务逻辑。 */
  dispatchNow(mapId: string, maxDispatch = 1): void {
    this.collectCompletedResults();
    this.dispatchPendingForMap(mapId, Math.max(1, Math.floor(maxDispatch)));
  }

/** pumpMap：执行对应的业务逻辑。 */
  pumpMap(mapId: string): void {
    this.collectCompletedResults();
    this.dispatchPendingForMap(mapId, PATH_REQUEST_DISPATCH_BATCH_SIZE);
  }

/** dispatchPendingForMap：执行对应的业务逻辑。 */
  private dispatchPendingForMap(mapId: string, maxDispatch: number): void {
/** dispatched：定义该变量以承载业务值。 */
    let dispatched = 0;
    while (this.workerPool.hasIdleWorker() && dispatched < maxDispatch) {
/** next：定义该变量以承载业务值。 */
      const next = this.pickNextPending(mapId);
      if (!next) {
        break;
      }

/** staticGrid：定义该变量以承载业务值。 */
      const staticGrid = this.mapService.getPathfindingStaticGrid(next.mapId);
/** blocked：定义该变量以承载业务值。 */
      const blocked = this.mapService.buildPathfindingBlockedGrid(next.mapId, next.actorType, next.selfOccupancyId);
      if (!staticGrid || !blocked) {
/** result：定义该变量以承载业务值。 */
        const result: PathfindingTaskResult = {
          status: 'failed',
          reason: 'invalid_goal',
          expandedNodes: 0,
          requestId: next.requestId,
          actorId: next.actorId,
          kind: next.kind,
          mapId: next.mapId,
          mapRevision: 0,
          elapsedMs: 0,
        };
        this.performanceService.recordPathfindingCompleted(result);
        this.completedByActor.set(next.actorId, result);
        continue;
      }

/** task：定义该变量以承载业务值。 */
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
        enqueuedAtMs: next.enqueuedAtMs,
        limits: next.limits,
      };

      if (!this.workerPool.dispatch(task)) {
        this.pendingById.set(next.requestId, next);
        this.syncQueueDepthMetrics();
        break;
      }
      this.performanceService.recordPathfindingDispatched(Date.now() - next.enqueuedAtMs);
      dispatched += 1;
    }
  }

/** takeResult：执行对应的业务逻辑。 */
  takeResult(actorId: string, requestId?: string): PathfindingTaskResult | null {
    this.collectCompletedResults();
/** result：定义该变量以承载业务值。 */
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

/** clearRuntimeState：执行对应的业务逻辑。 */
  clearRuntimeState(): void {
    for (const actorId of this.latestRequestIdByActor.keys()) {
      this.workerPool.cancelActor(actorId);
    }
    this.pendingById.clear();
    this.latestRequestIdByActor.clear();
    this.completedByActor.clear();
    this.workerPool.clearRuntimeState();
    this.syncQueueDepthMetrics();
  }

/** collectCompletedResults：执行对应的业务逻辑。 */
  private collectCompletedResults(): void {
    for (const result of this.workerPool.drainCompleted()) {
      const latest = this.latestRequestIdByActor.get(result.actorId);
      if (latest !== result.requestId) {
        this.performanceService.recordPathfindingStaleResultDropped();
        continue;
      }
      this.completedByActor.set(result.actorId, result);
    }
  }

/** pickNextPending：执行对应的业务逻辑。 */
  private pickNextPending(mapId: string): PendingPathRequest | null {
/** next：定义该变量以承载业务值。 */
    let next: PendingPathRequest | null = null;
    for (const request of this.pendingById.values()) {
      if (request.mapId !== mapId || this.latestRequestIdByActor.get(request.actorId) !== request.requestId) {
        continue;
      }
      if (!next) {
        next = request;
        continue;
      }
      if (request.priority !== next.priority) {
        if (request.priority < next.priority) {
          next = request;
        }
        continue;
      }
      if (request.moveSpeed !== next.moveSpeed) {
        if (request.moveSpeed > next.moveSpeed) {
          next = request;
        }
        continue;
      }
      if (request.enqueueOrder < next.enqueueOrder) {
        next = request;
      }
    }
    if (next) {
      this.pendingById.delete(next.requestId);
      this.syncQueueDepthMetrics();
    }
    return next;
  }

/** syncQueueDepthMetrics：执行对应的业务逻辑。 */
  private syncQueueDepthMetrics(): void {
    this.performanceService.setPathfindingQueueDepth(this.pendingById.size);
  }
}

