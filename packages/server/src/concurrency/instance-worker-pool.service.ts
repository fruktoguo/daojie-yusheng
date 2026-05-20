/**
 * Instance Worker Pool 服务。
 * 实例分片池：只接收 POJO 快照并返回 intent/mutation proposal，权威状态仍由主线程应用。
 *
 * 热路径默认 always-on；任务级故障降级在 pool 内部透明处理。
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import type { WorkerTaskEnvelope, WorkerTaskResult, WorkerPoolConfig, WorkerPoolMetrics } from './worker-task.types';
import { WorkerPoolMetricsService } from './worker-pool-metrics.service';
import { isForceSyncMode, type SyncFallback } from './encoding-worker-pool.service';

interface PendingInstanceTask {
  resolve: (result: WorkerTaskResult) => void;
  timer: ReturnType<typeof setTimeout>;
  fallback: SyncFallback<unknown, unknown> | null;
  payload: unknown;
  submittedAt: number;
  workerIndex: number;
}

@Injectable()
export class InstanceWorkerPoolService {
  private readonly logger = new Logger(InstanceWorkerPoolService.name);
  private readonly forceSyncMode = isForceSyncMode();
  private readonly config: WorkerPoolConfig;
  private readonly pendingTasks = new Map<string, PendingInstanceTask>();
  private workers: Array<Worker | null> = [];
  private roundRobinIndex = 0;
  private shuttingDown = false;

  constructor(
    private readonly metricsService: WorkerPoolMetricsService,
  ) {
    this.config = {
      poolSize: Math.max(1, Math.min(Number(process.env.SERVER_INSTANCE_WORKER_COUNT) || cpus().length - 2, 6)),
      defaultDeadlineMs: 800,
    };
  }

  async submit<TPayload, TResult>(
    kind: WorkerTaskEnvelope['kind'],
    payload: TPayload,
    fallback: SyncFallback<TPayload, TResult> | null = null,
    deadlineMs?: number,
  ): Promise<WorkerTaskResult<TResult>> {
    const taskId = randomUUID();
    this.metricsService.recordSubmit('instance');
    if (this.forceSyncMode) return this.executeFallback(taskId, payload, fallback);
    this.ensureWorkersStarted();
    if (!this.workers.some(Boolean)) return this.executeFallback(taskId, payload, fallback);
    return this.dispatchToWorker(taskId, kind, payload, deadlineMs ?? this.config.defaultDeadlineMs, fallback);
  }

  initialize(): void {
    if (this.forceSyncMode) {
      this.logger.log('InstanceWorkerPool 处于强制同步模式，跳过 worker 启动');
      return;
    }
    this.ensureWorkersStarted();
    this.logger.log(`InstanceWorkerPool 已启动：${this.workers.filter(Boolean).length} 个 worker`);
  }

  shutdown(): void {
    this.shuttingDown = true;
    this.shutdownWorkers();
  }

  private shutdownWorkers(): void {
    for (const worker of this.workers) worker?.terminate();
    this.workers = [];
    for (const [taskId, pending] of this.pendingTasks) {
      clearTimeout(pending.timer);
      pending.resolve({ taskId, ok: false, errorMessage: 'Worker pool shutting down', durationMs: performance.now() - pending.submittedAt });
    }
    this.pendingTasks.clear();
    this.metricsService.setActiveWorkers('instance', 0);
  }

  isEnabled(): boolean {
    return !this.forceSyncMode && this.workers.some((worker) => worker !== null);
  }

  getMetrics(): WorkerPoolMetrics {
    return this.metricsService.getMetrics('instance');
  }

  private ensureWorkersStarted(): void {
    if (this.forceSyncMode || this.workers.some(Boolean) || this.shuttingDown) return;
    const workerPath = resolve(__dirname, 'workers', 'instance-advance.worker.js');
    this.workers = new Array(this.config.poolSize).fill(null);
    for (let i = 0; i < this.config.poolSize; i += 1) this.spawnSingleWorker(workerPath, i);
    this.metricsService.setActiveWorkers('instance', this.workers.filter(Boolean).length);
  }

  private spawnSingleWorker(workerPath: string, index: number): void {
    try {
      const worker = new Worker(workerPath);
      worker.on('message', (msg: WorkerTaskResult) => this.handleWorkerResult(msg));
      worker.on('error', (err) => {
        this.logger.error(`实例 worker ${index} 错误：${err.message}`);
        this.handleWorkerDeath(worker, index, workerPath);
      });
      worker.on('exit', (code) => {
        if (!this.shuttingDown && code !== 0) this.handleWorkerDeath(worker, index, workerPath);
      });
      this.workers[index] = worker;
    } catch (err: unknown) {
      this.logger.error(`实例 worker ${index} 启动失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private dispatchToWorker<TPayload, TResult>(
    taskId: string,
    kind: string,
    payload: TPayload,
    deadlineMs: number,
    fallback: SyncFallback<TPayload, TResult> | null,
  ): Promise<WorkerTaskResult<TResult>> {
    return new Promise((resolvePromise) => {
      const selectedIndex = this.selectWorkerIndex();
      const worker = selectedIndex >= 0 ? this.workers[selectedIndex] : null;
      if (!worker) {
        resolvePromise(this.executeFallbackSync(taskId, payload, fallback) as WorkerTaskResult<TResult>);
        return;
      }
      const timer = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        this.metricsService.recordTimeout('instance');
        resolvePromise(this.executeFallbackSync(taskId, payload, fallback) as WorkerTaskResult<TResult>);
      }, deadlineMs);
      this.pendingTasks.set(taskId, { resolve: resolvePromise as (r: WorkerTaskResult) => void, timer, fallback: fallback as SyncFallback<unknown, unknown> | null, payload, submittedAt: performance.now(), workerIndex: selectedIndex });
      const envelope: WorkerTaskEnvelope = { taskId, kind: kind as WorkerTaskEnvelope['kind'], payload, deadlineMs: Date.now() + deadlineMs, fallbackOnTimeout: fallback !== null };
      try {
        worker.postMessage(envelope);
      } catch (err: unknown) {
        clearTimeout(timer);
        this.pendingTasks.delete(taskId);
        this.metricsService.recordFailed('instance');
        resolvePromise(this.executeFallbackSync(taskId, payload, fallback, `Worker postMessage failed: ${err instanceof Error ? err.message : String(err)}`) as WorkerTaskResult<TResult>);
      }
    });
  }

  private selectWorkerIndex(): number {
    for (let attempt = 0; attempt < this.workers.length; attempt += 1) {
      const index = this.roundRobinIndex % this.workers.length;
      this.roundRobinIndex = (this.roundRobinIndex + 1) % this.workers.length;
      if (this.workers[index]) return index;
    }
    return -1;
  }

  private executeFallback<TPayload, TResult>(taskId: string, payload: TPayload, fallback: SyncFallback<TPayload, TResult> | null): Promise<WorkerTaskResult<TResult>> {
    this.metricsService.recordFallback('instance');
    return Promise.resolve(this.executeFallbackSync(taskId, payload, fallback));
  }

  private executeFallbackSync<TPayload, TResult>(taskId: string, payload: TPayload, fallback: SyncFallback<TPayload, TResult> | null, errorMessage = 'No fallback and pool unavailable'): WorkerTaskResult<TResult> {
    const startedAt = performance.now();
    if (!fallback) {
      this.metricsService.recordFailed('instance');
      return { taskId, ok: false, errorMessage, durationMs: 0 };
    }
    try {
      const result = fallback(payload);
      const durationMs = performance.now() - startedAt;
      this.metricsService.recordComplete('instance', durationMs);
      return { taskId, ok: true, result, durationMs };
    } catch (err: unknown) {
      this.metricsService.recordFailed('instance');
      return { taskId, ok: false, errorMessage: err instanceof Error ? err.message : String(err), durationMs: performance.now() - startedAt };
    }
  }

  private handleWorkerResult(msg: WorkerTaskResult): void {
    const pending = this.pendingTasks.get(msg.taskId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingTasks.delete(msg.taskId);
    const durationMs = performance.now() - pending.submittedAt;
    if (msg.ok) this.metricsService.recordComplete('instance', durationMs);
    else this.metricsService.recordFailed('instance');
    pending.resolve({ ...msg, durationMs });
  }

  private handleWorkerDeath(deadWorker: Worker, index: number, workerPath: string): void {
    if (this.workers[index] !== deadWorker) return;
    this.workers[index] = null;
    this.metricsService.setActiveWorkers('instance', this.workers.filter(Boolean).length);
    for (const [taskId, pending] of this.pendingTasks) {
      if (pending.workerIndex !== index) continue;
      clearTimeout(pending.timer);
      this.pendingTasks.delete(taskId);
      pending.resolve(this.executeFallbackSync(taskId, pending.payload, pending.fallback, 'Worker died'));
    }
    setTimeout(() => {
      if (!this.shuttingDown && !this.workers[index]) this.spawnSingleWorker(workerPath, index);
      this.metricsService.setActiveWorkers('instance', this.workers.filter(Boolean).length);
    }, 1000);
  }
}
