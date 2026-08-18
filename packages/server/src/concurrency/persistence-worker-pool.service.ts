/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import type { WorkerTaskEnvelope, WorkerTaskResult, WorkerPoolConfig, WorkerPoolMetrics } from './worker-task.types';
import { WorkerPoolMetricsService } from './worker-pool-metrics.service';
import { isForceSyncMode, type SyncFallback } from './encoding-worker-pool.service';
import { resolveWorkerPoolSize } from '../config/worker-pool-config';

interface PendingPersistenceTask {
  resolve: (result: WorkerTaskResult) => void;
  timer: ReturnType<typeof setTimeout>;
  fallback: SyncFallback<unknown, unknown> | null;
  payload: unknown;
  submittedAt: number;
  workerIndex: number;
}

const MISSING_WORKER_RECOVERY_INTERVAL_MS = 1_000;

@Injectable()
export class PersistenceWorkerPoolService {
  private readonly logger = new Logger(PersistenceWorkerPoolService.name);
  private readonly forceSyncMode = isForceSyncMode();
  private readonly config: WorkerPoolConfig;
  private readonly pendingTasks = new Map<string, PendingPersistenceTask>();
  private workers: Array<Worker | null> = [];
  private roundRobinIndex = 0;
  private shuttingDown = false;
  private activeWorkerCount = 0;
  private missingWorkerPath: string | null = null;
  private missingWorkerRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private missingWorkerPathLogged = false;

  constructor(
    private readonly metricsService: WorkerPoolMetricsService,
  ) {
    const poolSize = resolveWorkerPoolSize(
      process.env.SERVER_PERSISTENCE_WORKER_COUNT,
      2,
      4,
    );
    this.config = {
      poolSize: poolSize.poolSize,
      defaultDeadlineMs: 1000,
    };
    if (poolSize.adjusted && poolSize.configuredValue !== null) {
      this.logger.warn(
        `SERVER_PERSISTENCE_WORKER_COUNT=${JSON.stringify(poolSize.configuredValue.slice(0, 80))} 不是可用的线程数，已归一化为 ${poolSize.poolSize}`,
      );
    }
  }

  async submit<TPayload, TResult>(
    kind: WorkerTaskEnvelope['kind'],
    payload: TPayload,
    fallback: SyncFallback<TPayload, TResult> | null = null,
    deadlineMs?: number,
  ): Promise<WorkerTaskResult<TResult>> {
    const taskId = randomUUID();
    this.metricsService.recordSubmit('persistence');
    if (this.forceSyncMode) return this.executeFallback(taskId, payload, fallback);
    this.ensureWorkersStarted();
    if (this.activeWorkerCount === 0) return this.executeFallback(taskId, payload, fallback);
    return this.dispatchToWorker(taskId, kind, payload, deadlineMs ?? this.config.defaultDeadlineMs, fallback);
  }

  initialize(): void {
    if (this.forceSyncMode) {
      this.logger.log('持久化工作池处于强制同步模式，跳过工作线程启动');
      return;
    }
    this.ensureWorkersStarted();
    if (this.activeWorkerCount > 0) {
      this.logger.log(`持久化工作池已启动：${this.activeWorkerCount} 个工作线程`);
    }
  }

  shutdown(): Promise<void> {
    this.shuttingDown = true;
    return this.shutdownWorkers();
  }

  private async shutdownWorkers(): Promise<void> {
    if (this.missingWorkerRecoveryTimer) {
      clearTimeout(this.missingWorkerRecoveryTimer);
      this.missingWorkerRecoveryTimer = null;
    }
    const workers = this.workers.filter((worker): worker is Worker => worker !== null);
    this.workers = [];
    this.activeWorkerCount = 0;
    for (const [taskId, pending] of this.pendingTasks) {
      clearTimeout(pending.timer);
      pending.resolve({ taskId, ok: false, errorMessage: 'Worker pool shutting down', durationMs: performance.now() - pending.submittedAt });
    }
    this.pendingTasks.clear();
    this.metricsService.setActiveWorkers('persistence', 0);
    await Promise.all(workers.map(async (worker) => {
      await worker.terminate().catch((error: unknown) => {
        this.logger.warn(`持久化工作线程关闭失败：${error instanceof Error ? error.message : String(error)}`);
      });
    }));
  }

  isEnabled(): boolean {
    return !this.forceSyncMode && this.activeWorkerCount > 0;
  }

  getMetrics(): WorkerPoolMetrics {
    return this.metricsService.getMetrics('persistence');
  }

  private ensureWorkersStarted(): void {
    if (this.forceSyncMode || this.activeWorkerCount > 0 || this.shuttingDown) return;
    const workerPath = this.resolveWorkerPath();
    if (!this.workerFileExists(workerPath)) {
      this.markWorkerPathMissing(workerPath);
      return;
    }
    this.clearMissingWorkerPath();
    this.workers = new Array(this.config.poolSize).fill(null);
    for (let i = 0; i < this.config.poolSize; i += 1) this.spawnSingleWorker(workerPath, i);
    this.metricsService.setActiveWorkers('persistence', this.activeWorkerCount);
  }

  private spawnSingleWorker(workerPath: string, index: number): void {
    if (this.shuttingDown) return;
    if (!this.workerFileExists(workerPath)) {
      this.markWorkerPathMissing(workerPath);
      return;
    }
    try {
      const worker = new Worker(workerPath);
      worker.on('message', (msg: WorkerTaskResult) => this.handleWorkerResult(msg));
      worker.on('error', (err) => {
        if (isWorkerModuleMissing(err, workerPath)) {
          this.markWorkerPathMissing(workerPath);
          this.handleWorkerDeath(worker, index, workerPath);
          return;
        }
        this.logger.error(`持久化工作线程 ${index} 错误：${err.message}`);
        this.handleWorkerDeath(worker, index, workerPath);
      });
      worker.on('exit', (code) => {
        if (!this.shuttingDown && code !== 0) this.handleWorkerDeath(worker, index, workerPath);
      });
      this.workers[index] = worker;
      this.activeWorkerCount += 1;
      this.metricsService.setActiveWorkers('persistence', this.activeWorkerCount);
    } catch (err: unknown) {
      if (isWorkerModuleMissing(err, workerPath)) {
        this.markWorkerPathMissing(workerPath);
        return;
      }
      this.logger.error(`持久化工作线程 ${index} 启动失败：${err instanceof Error ? err.message : String(err)}`);
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
        this.metricsService.recordTimeout('persistence');
        resolvePromise(this.executeFallbackSync(taskId, payload, fallback) as WorkerTaskResult<TResult>);
      }, deadlineMs);
      this.pendingTasks.set(taskId, { resolve: resolvePromise as (r: WorkerTaskResult) => void, timer, fallback: fallback as SyncFallback<unknown, unknown> | null, payload, submittedAt: performance.now(), workerIndex: selectedIndex });
      const envelope: WorkerTaskEnvelope = { taskId, kind: kind as WorkerTaskEnvelope['kind'], payload, deadlineMs: Date.now() + deadlineMs, fallbackOnTimeout: fallback !== null };
      try {
        worker.postMessage(envelope);
      } catch (err: unknown) {
        clearTimeout(timer);
        this.pendingTasks.delete(taskId);
        this.metricsService.recordFailed('persistence');
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
    this.metricsService.recordFallback('persistence');
    return Promise.resolve(this.executeFallbackSync(taskId, payload, fallback));
  }

  private executeFallbackSync<TPayload, TResult>(taskId: string, payload: TPayload, fallback: SyncFallback<TPayload, TResult> | null, errorMessage = 'No fallback and pool unavailable'): WorkerTaskResult<TResult> {
    const startedAt = performance.now();
    if (!fallback) {
      this.metricsService.recordFailed('persistence');
      return { taskId, ok: false, errorMessage, durationMs: 0 };
    }
    try {
      const result = fallback(payload);
      const durationMs = performance.now() - startedAt;
      this.metricsService.recordComplete('persistence', durationMs);
      return { taskId, ok: true, result, durationMs };
    } catch (err: unknown) {
      this.metricsService.recordFailed('persistence');
      return { taskId, ok: false, errorMessage: err instanceof Error ? err.message : String(err), durationMs: performance.now() - startedAt };
    }
  }

  private handleWorkerResult(msg: WorkerTaskResult): void {
    const pending = this.pendingTasks.get(msg.taskId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingTasks.delete(msg.taskId);
    const durationMs = performance.now() - pending.submittedAt;
    if (msg.ok) this.metricsService.recordComplete('persistence', durationMs);
    else this.metricsService.recordFailed('persistence');
    pending.resolve({ ...msg, durationMs });
  }

  private handleWorkerDeath(deadWorker: Worker, index: number, workerPath: string): void {
    if (this.workers[index] !== deadWorker) return;
    this.workers[index] = null;
    this.activeWorkerCount = Math.max(0, this.activeWorkerCount - 1);
    this.metricsService.setActiveWorkers('persistence', this.activeWorkerCount);
    for (const [taskId, pending] of this.pendingTasks) {
      if (pending.workerIndex !== index) continue;
      clearTimeout(pending.timer);
      this.pendingTasks.delete(taskId);
      pending.resolve(this.executeFallbackSync(taskId, pending.payload, pending.fallback, 'Worker died'));
    }
    if (this.missingWorkerPath) {
      this.scheduleMissingWorkerRecovery();
      return;
    }
    setTimeout(() => {
      if (!this.shuttingDown && !this.workers[index]) this.spawnSingleWorker(workerPath, index);
    }, 1000);
  }

  protected resolveWorkerPath(): string {
    return resolve(__dirname, 'workers', 'persistence-build.worker.js');
  }

  protected workerFileExists(workerPath: string): boolean {
    return existsSync(workerPath);
  }

  private markWorkerPathMissing(workerPath: string): void {
    this.missingWorkerPath = workerPath;
    if (!this.missingWorkerPathLogged) {
      this.missingWorkerPathLogged = true;
      this.logger.warn(
        `持久化工作池已临时降级为同步路径：worker 文件不存在 ${workerPath}；将自动探测恢复`,
      );
    }
    this.scheduleMissingWorkerRecovery();
  }

  private clearMissingWorkerPath(): void {
    this.missingWorkerPath = null;
    this.missingWorkerPathLogged = false;
    if (this.missingWorkerRecoveryTimer) {
      clearTimeout(this.missingWorkerRecoveryTimer);
      this.missingWorkerRecoveryTimer = null;
    }
  }

  private scheduleMissingWorkerRecovery(): void {
    if (this.shuttingDown || this.missingWorkerRecoveryTimer || !this.missingWorkerPath) return;
    this.missingWorkerRecoveryTimer = setTimeout(() => {
      this.missingWorkerRecoveryTimer = null;
      const workerPath = this.missingWorkerPath;
      if (!workerPath || this.shuttingDown) return;
      if (!this.workerFileExists(workerPath)) {
        this.scheduleMissingWorkerRecovery();
        return;
      }

      this.clearMissingWorkerPath();
      if (this.workers.length !== this.config.poolSize) {
        this.workers = new Array(this.config.poolSize).fill(null);
      }
      for (let index = 0; index < this.workers.length; index += 1) {
        if (!this.workers[index]) this.spawnSingleWorker(workerPath, index);
      }
      this.metricsService.setActiveWorkers('persistence', this.activeWorkerCount);
      if (this.activeWorkerCount > 0) {
        this.logger.log(`持久化工作池 worker 文件已恢复：${this.activeWorkerCount} 个工作线程可用`);
      }
    }, MISSING_WORKER_RECOVERY_INTERVAL_MS);
    this.missingWorkerRecoveryTimer.unref();
  }
}

function isWorkerModuleMissing(error: unknown, workerPath: string): boolean {
  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate?.message === 'string' ? candidate.message : '';
  return candidate?.code === 'MODULE_NOT_FOUND' && message.includes(workerPath);
}
