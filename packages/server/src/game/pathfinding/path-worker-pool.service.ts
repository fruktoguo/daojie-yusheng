/**
 * 寻路 worker 池。
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import { PATHFINDING_WORKER_COUNT } from '../../constants/gameplay/pathfinding';
import { PathfindingTask, PathfindingTaskResult } from './pathfinding.types';

interface WorkerSlot {
  id: number;
  worker: Worker;
  currentTask: PathfindingTask | null;
}

@Injectable()
export class PathWorkerPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(PathWorkerPoolService.name);
  private readonly workerPath = path.join(__dirname, 'workers', 'pathfinding.worker.js');
  private readonly slots: WorkerSlot[] = [];
  private readonly completedResults: PathfindingTaskResult[] = [];
  private shuttingDown = false;

  constructor() {
    for (let index = 0; index < PATHFINDING_WORKER_COUNT; index += 1) {
      this.slots.push(this.createWorkerSlot(index));
    }
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
    slot.currentTask = task;
    slot.worker.postMessage(task);
    return true;
  }

  drainCompleted(): PathfindingTaskResult[] {
    if (this.completedResults.length === 0) {
      return [];
    }
    return this.completedResults.splice(0, this.completedResults.length);
  }

  private createWorkerSlot(id: number): WorkerSlot {
    const worker = new Worker(this.workerPath);
    const slot: WorkerSlot = {
      id,
      worker,
      currentTask: null,
    };

    worker.on('message', (result: PathfindingTaskResult) => {
      slot.currentTask = null;
      this.completedResults.push(result);
    });

    worker.on('error', (error: Error) => {
      this.logger.error(`寻路 worker #${id} 异常: ${error.message}`);
      this.failActiveTask(slot);
    });

    worker.on('exit', (code) => {
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
    this.completedResults.push({
      status: 'failed',
      reason: 'no_path',
      expandedNodes: 0,
      requestId: task.requestId,
      actorId: task.actorId,
      kind: task.kind,
      mapId: task.staticGrid.mapId,
      mapRevision: task.staticGrid.mapRevision,
      elapsedMs: 0,
    });
  }
}
