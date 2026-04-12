/**
 * 寻路 worker 池。
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import { PATHFINDING_WORKER_COUNT } from '../../constants/gameplay/pathfinding';
import { PerformanceService } from '../performance.service';
import { PathfindingTask, PathfindingTaskResult } from './pathfinding.types';

/** WorkerSlot：定义该接口的能力与字段约束。 */
interface WorkerSlot {
  id: number;
  worker: Worker;
  currentTask: PathfindingTask | null;
}

@Injectable()
/** PathWorkerPoolService：封装相关状态与行为。 */
export class PathWorkerPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(PathWorkerPoolService.name);
  private readonly workerPath = path.join(__dirname, 'workers', 'pathfinding.worker.js');
  private readonly slots: WorkerSlot[] = [];
  private readonly completedResults: PathfindingTaskResult[] = [];
  private shuttingDown = false;

  constructor(
    private readonly performanceService: PerformanceService = new PerformanceService(),
  ) {
    for (let index = 0; index < PATHFINDING_WORKER_COUNT; index += 1) {
      this.slots.push(this.createWorkerSlot(index));
    }
    this.syncWorkerState();
  }

  onModuleDestroy(): void {
    this.shuttingDown = true;
    for (const slot of this.slots) {
      void slot.worker.terminate();
    }
    this.slots.length = 0;
  }

  hasIdleWorker(): boolean {
    return this.slots.some((slot) => slot.currentTask === null);
  }

  dispatch(task: PathfindingTask): boolean {
    const slot = this.slots.find((candidate) => candidate.currentTask === null);
    if (!slot) {
      return false;
    }
    const cancelFlag = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    const runningTask: PathfindingTask = {
      ...task,
      cancelFlag,
    };
    slot.currentTask = runningTask;
    this.syncWorkerState();
    slot.worker.postMessage(runningTask);
    return true;
  }

  cancelRequest(requestId: string): void {
    const slot = this.slots.find((candidate) => candidate.currentTask?.requestId === requestId);
    if (!slot?.currentTask?.cancelFlag) {
      return;
    }
    Atomics.store(slot.currentTask.cancelFlag, 0, 1);
  }

  cancelActor(actorId: string): void {
    for (const slot of this.slots) {
      if (slot.currentTask?.actorId !== actorId || !slot.currentTask.cancelFlag) {
        continue;
      }
      Atomics.store(slot.currentTask.cancelFlag, 0, 1);
    }
  }

  drainCompleted(): PathfindingTaskResult[] {
    if (this.completedResults.length === 0) {
      return [];
    }
    return this.completedResults.splice(0, this.completedResults.length);
  }

  clearRuntimeState(): void {
    for (const slot of this.slots) {
      if (!slot.currentTask?.cancelFlag) {
        continue;
      }
      Atomics.store(slot.currentTask.cancelFlag, 0, 1);
      slot.currentTask = null;
    }
    this.completedResults.splice(0, this.completedResults.length);
    this.syncWorkerState();
  }

  private createWorkerSlot(id: number): WorkerSlot {
    const worker = new Worker(this.workerPath);
    const eventedWorker = worker as Worker & NodeJS.EventEmitter;
    const slot: WorkerSlot = {
      id,
      worker,
      currentTask: null,
    };

    eventedWorker.on('message', (result: PathfindingTaskResult) => {
      slot.currentTask = null;
      this.performanceService.recordPathfindingCompleted(result);
      this.syncWorkerState();
      this.completedResults.push(result);
    });

    eventedWorker.on('error', (error: Error) => {
      this.logger.error(`寻路 worker #${id} 异常: ${error.message}`);
      this.failActiveTask(slot);
    });

    eventedWorker.on('exit', (code: number) => {
      if (!this.shuttingDown && code !== 0) {
        this.failActiveTask(slot);
      }
      if (!this.shuttingDown && code !== 0) {
        this.logger.warn(`寻路 worker #${id} 退出，状态码 ${code}，已自动拉起`);
        const next = this.createWorkerSlot(id);
        const index = this.slots.findIndex((candidate) => candidate.id === id);
        if (index >= 0) {
          this.slots[index] = next;
        } else {
          this.slots.push(next);
        }
      }
    });

    return slot;
  }

  private failActiveTask(slot: WorkerSlot): void {
    if (!slot.currentTask) {
      return;
    }
    const task = slot.currentTask;
    slot.currentTask = null;
    this.syncWorkerState();
    const reason = task.cancelFlag && Atomics.load(task.cancelFlag, 0) === 1 ? 'cancelled' : 'no_path';
    const result: PathfindingTaskResult = {
      status: 'failed',
      reason,
      expandedNodes: 0,
      requestId: task.requestId,
      actorId: task.actorId,
      kind: task.kind,
      mapId: task.staticGrid.mapId,
      mapRevision: task.staticGrid.mapRevision,
      elapsedMs: 0,
    };
    this.performanceService.recordPathfindingCompleted(result);
    this.completedResults.push(result);
  }

  private syncWorkerState(): void {
    this.performanceService.setPathfindingWorkerState(
      this.slots.length,
      this.slots.filter((slot) => slot.currentTask !== null).length,
    );
  }
}

