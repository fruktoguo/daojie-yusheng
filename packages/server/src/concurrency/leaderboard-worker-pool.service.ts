/**
 * 排行榜构建工作池：把 8 个 board 的 sort/slice/map 卸载到 worker_threads，
 * 避免每 10 分钟一次的全量刷新阻塞主线程上的 world tick。
 *
 * 设计要点：
 * - 任务低频（10 分钟一次），poolSize = 1 即可
 * - deadline 给足 10s，避免大世界场景 (5000 玩家) 误超时
 * - 主线程 fallback 始终可用：worker 不可用或失败时回退到同步路径
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import type {
  LeaderboardBuildPayload,
  LeaderboardBuildResult,
  WorkerPoolConfig,
  WorkerPoolMetrics,
  WorkerTaskEnvelope,
  WorkerTaskResult,
} from './worker-task.types';
import { WorkerPoolMetricsService } from './worker-pool-metrics.service';
import { isForceSyncMode, type SyncFallback } from './encoding-worker-pool.service';

interface PendingLeaderboardTask {
  resolve: (result: WorkerTaskResult<LeaderboardBuildResult>) => void;
  timer: ReturnType<typeof setTimeout>;
  fallback: SyncFallback<LeaderboardBuildPayload, LeaderboardBuildResult> | null;
  payload: LeaderboardBuildPayload;
  submittedAt: number;
  workerIndex: number;
}

@Injectable()
export class LeaderboardWorkerPoolService {
  private readonly logger = new Logger(LeaderboardWorkerPoolService.name);
  private readonly forceSyncMode = isForceSyncMode();
  private readonly config: WorkerPoolConfig;
  private readonly pendingTasks = new Map<string, PendingLeaderboardTask>();
  private workers: Array<Worker | null> = [];
  private shuttingDown = false;
  private activeWorkerCount = 0;

  constructor(
    private readonly metricsService: WorkerPoolMetricsService,
  ) {
    this.config = {
      poolSize: 1,
      defaultDeadlineMs: 10_000,
    };
  }

  /** 提交一次排行榜构建任务，超时/失败自动 fallback 到同步路径。 */
  async submit(
    payload: LeaderboardBuildPayload,
    fallback: SyncFallback<LeaderboardBuildPayload, LeaderboardBuildResult> | null = null,
    deadlineMs?: number,
  ): Promise<WorkerTaskResult<LeaderboardBuildResult>> {
    const taskId = randomUUID();
    this.metricsService.recordSubmit('leaderboard');
    if (this.forceSyncMode) {
      return this.executeFallback(taskId, payload, fallback);
    }
    this.ensureWorkersStarted();
    if (this.activeWorkerCount === 0) {
      return this.executeFallback(taskId, payload, fallback);
    }
    return this.dispatchToWorker(taskId, payload, deadlineMs ?? this.config.defaultDeadlineMs, fallback);
  }

  initialize(): void {
    if (this.forceSyncMode) {
      this.logger.log('排行榜工作池处于强制同步模式，跳过工作线程启动');
      return;
    }
    this.ensureWorkersStarted();
    this.logger.log(`排行榜工作池已启动：${this.activeWorkerCount} 个工作线程`);
  }

  shutdown(): void {
    this.shuttingDown = true;
    this.shutdownWorkers();
  }

  isEnabled(): boolean {
    return !this.forceSyncMode && this.activeWorkerCount > 0;
  }

  getMetrics(): WorkerPoolMetrics {
    return this.metricsService.getMetrics('leaderboard');
  }

  private shutdownWorkers(): void {
    for (const worker of this.workers) worker?.terminate();
    this.workers = [];
    this.activeWorkerCount = 0;
    for (const [taskId, pending] of this.pendingTasks) {
      clearTimeout(pending.timer);
      pending.resolve({
        taskId,
        ok: false,
        errorMessage: 'Worker pool shutting down',
        durationMs: performance.now() - pending.submittedAt,
      });
    }
    this.pendingTasks.clear();
    this.metricsService.setActiveWorkers('leaderboard', 0);
  }

  private ensureWorkersStarted(): void {
    if (this.forceSyncMode || this.activeWorkerCount > 0 || this.shuttingDown) return;
    const workerPath = resolve(__dirname, 'workers', 'leaderboard-build.worker.js');
    this.workers = new Array(this.config.poolSize).fill(null);
    for (let i = 0; i < this.config.poolSize; i += 1) {
      this.spawnSingleWorker(workerPath, i);
    }
    this.metricsService.setActiveWorkers('leaderboard', this.activeWorkerCount);
  }

  private spawnSingleWorker(workerPath: string, index: number): void {
    try {
      const worker = new Worker(workerPath);
      worker.on('message', (msg: WorkerTaskResult<LeaderboardBuildResult>) => this.handleWorkerResult(msg));
      worker.on('error', (err) => {
        this.logger.error(`排行榜工作线程 ${index} 错误：${err.message}`);
        this.handleWorkerDeath(worker, index, workerPath);
      });
      worker.on('exit', (code) => {
        if (!this.shuttingDown && code !== 0) this.handleWorkerDeath(worker, index, workerPath);
      });
      this.workers[index] = worker;
      this.activeWorkerCount += 1;
      this.metricsService.setActiveWorkers('leaderboard', this.activeWorkerCount);
    } catch (err: unknown) {
      this.logger.error(`排行榜工作线程 ${index} 启动失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private dispatchToWorker(
    taskId: string,
    payload: LeaderboardBuildPayload,
    deadlineMs: number,
    fallback: SyncFallback<LeaderboardBuildPayload, LeaderboardBuildResult> | null,
  ): Promise<WorkerTaskResult<LeaderboardBuildResult>> {
    return new Promise((resolvePromise) => {
      const selectedIndex = this.workers.findIndex((w) => w !== null);
      const worker = selectedIndex >= 0 ? this.workers[selectedIndex] : null;
      if (!worker) {
        resolvePromise(this.executeFallbackSync(taskId, payload, fallback));
        return;
      }
      const timer = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        this.metricsService.recordTimeout('leaderboard');
        resolvePromise(this.executeFallbackSync(taskId, payload, fallback));
      }, deadlineMs);
      this.pendingTasks.set(taskId, {
        resolve: resolvePromise,
        timer,
        fallback,
        payload,
        submittedAt: performance.now(),
        workerIndex: selectedIndex,
      });
      const envelope: WorkerTaskEnvelope = {
        taskId,
        kind: 'leaderboard-build',
        payload,
        deadlineMs: Date.now() + deadlineMs,
        fallbackOnTimeout: fallback !== null,
      };
      try {
        worker.postMessage(envelope);
      } catch (err: unknown) {
        clearTimeout(timer);
        this.pendingTasks.delete(taskId);
        this.metricsService.recordFailed('leaderboard');
        resolvePromise(
          this.executeFallbackSync(
            taskId,
            payload,
            fallback,
            `Worker postMessage failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    });
  }

  private executeFallback(
    taskId: string,
    payload: LeaderboardBuildPayload,
    fallback: SyncFallback<LeaderboardBuildPayload, LeaderboardBuildResult> | null,
  ): Promise<WorkerTaskResult<LeaderboardBuildResult>> {
    this.metricsService.recordFallback('leaderboard');
    return Promise.resolve(this.executeFallbackSync(taskId, payload, fallback));
  }

  private executeFallbackSync(
    taskId: string,
    payload: LeaderboardBuildPayload,
    fallback: SyncFallback<LeaderboardBuildPayload, LeaderboardBuildResult> | null,
    errorMessage = 'No fallback and pool unavailable',
  ): WorkerTaskResult<LeaderboardBuildResult> {
    const startedAt = performance.now();
    if (!fallback) {
      this.metricsService.recordFailed('leaderboard');
      return { taskId, ok: false, errorMessage, durationMs: 0 };
    }
    try {
      const result = fallback(payload);
      const durationMs = performance.now() - startedAt;
      this.metricsService.recordComplete('leaderboard', durationMs);
      return { taskId, ok: true, result, durationMs };
    } catch (err: unknown) {
      this.metricsService.recordFailed('leaderboard');
      return {
        taskId,
        ok: false,
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - startedAt,
      };
    }
  }

  private handleWorkerResult(msg: WorkerTaskResult<LeaderboardBuildResult>): void {
    const pending = this.pendingTasks.get(msg.taskId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingTasks.delete(msg.taskId);
    const durationMs = performance.now() - pending.submittedAt;
    if (msg.ok) this.metricsService.recordComplete('leaderboard', durationMs);
    else this.metricsService.recordFailed('leaderboard');
    pending.resolve({ ...msg, durationMs });
  }

  private handleWorkerDeath(deadWorker: Worker, index: number, workerPath: string): void {
    if (this.workers[index] !== deadWorker) return;
    this.workers[index] = null;
    this.activeWorkerCount = Math.max(0, this.activeWorkerCount - 1);
    this.metricsService.setActiveWorkers('leaderboard', this.activeWorkerCount);
    for (const [taskId, pending] of this.pendingTasks) {
      if (pending.workerIndex !== index) continue;
      clearTimeout(pending.timer);
      this.pendingTasks.delete(taskId);
      pending.resolve(this.executeFallbackSync(taskId, pending.payload, pending.fallback, 'Worker died'));
    }
    setTimeout(() => {
      if (!this.shuttingDown && !this.workers[index]) this.spawnSingleWorker(workerPath, index);
    }, 1_000);
  }
}
