/**
 * Encoding Worker Pool 服务。
 * CPU 无状态池：处理 AOI envelope 编码、A* 寻路、FOV 计算。
 *
 * 热路径只读 config.enabled（零开销）。
 * GM toggle 变更时通过 setEnabled() 写入 config.enabled 并按需启动/关闭 worker。
 */
import { Injectable, Logger } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  WorkerTaskEnvelope,
  WorkerTaskResult,
  WorkerPoolConfig,
  WorkerPoolMetrics,
} from './worker-task.types';
import { WorkerPoolMetricsService } from './worker-pool-metrics.service';

/** 同步 fallback 函数签名 */
export type SyncFallback<TPayload, TResult> = (payload: TPayload) => TResult;

@Injectable()
export class EncodingWorkerPoolService {
  private readonly logger = new Logger(EncodingWorkerPoolService.name);
  private workers: Worker[] = [];
  private shuttingDown = false;
  private roundRobinIndex = 0;
  private config: WorkerPoolConfig;
  private pendingTasks = new Map<string, {
    resolve: (result: WorkerTaskResult) => void;
    timer: ReturnType<typeof setTimeout>;
    fallback: SyncFallback<unknown, unknown> | null;
    payload: unknown;
    submittedAt: number;
    workerIndex: number;
  }>();

  constructor(
    private readonly metricsService: WorkerPoolMetricsService,
  ) {
    this.config = {
      enabled: false,
      poolSize: Math.max(1, Math.min(cpus().length - 2, 6)),
      defaultDeadlineMs: 500,
    };
  }

  /**
   * 运行时开关：由 WorkerPoolToggleService 在 GM flag 变更时调用。
   * 打开时延迟启动 worker，关闭时终止 worker。
   */
  setEnabled(value: boolean): void {
    if (this.config.enabled === value) return;
    this.config.enabled = value;
    if (value) {
      this.logger.log('EncodingWorkerPool 运行时启用');
      this.ensureWorkersStarted();
    } else {
      this.logger.log('EncodingWorkerPool 运行时禁用');
      this.shutdownWorkers();
    }
  }

  /** 提交任务到 worker pool，返回结果 Promise */
  async submit<TPayload, TResult>(
    kind: WorkerTaskEnvelope['kind'],
    payload: TPayload,
    fallback: SyncFallback<TPayload, TResult> | null = null,
    deadlineMs?: number,
  ): Promise<WorkerTaskResult<TResult>> {
    const taskId = randomUUID();
    const deadline = deadlineMs ?? this.config.defaultDeadlineMs;

    this.metricsService.recordSubmit('encoding');

    // 热路径只读 config.enabled
    if (!this.config.enabled) {
      return this.executeFallback(taskId, kind, payload, fallback);
    }

    // 延迟启动：toggle 刚打开但 worker 还没启动
    if (!this.workers.some((w) => w !== null)) {
      this.ensureWorkersStarted();
    }

    // worker 仍然没启动成功，走 fallback
    if (!this.workers.some((w) => w !== null)) {
      return this.executeFallback(taskId, kind, payload, fallback);
    }

    return this.dispatchToWorker(taskId, kind, payload, deadline, fallback);
  }

  /** 初始化 worker pool（由 WorkerPoolModule onModuleInit 调用） */
  initialize(): void {
    if (!this.config.enabled) {
      this.logger.log('EncodingWorkerPool 已禁用（等待 GM toggle 启用）');
      return;
    }
    this.ensureWorkersStarted();
    this.logger.log(
      `EncodingWorkerPool 已启动：${this.workers.filter((w) => w !== null).length} 个 worker`,
    );
  }

  /** 延迟启动 worker（GM toggle 运行时打开时调用） */
  private ensureWorkersStarted(): void {
    if (this.shuttingDown) return;
    if (this.workers.some((w) => w !== null)) return; // 已有活跃 worker
    this.spawnWorkers();
    const activeCount = this.workers.filter((w) => w !== null).length;
    if (activeCount > 0) {
      this.logger.log(`EncodingWorkerPool 延迟启动：${activeCount} 个 worker`);
      this.metricsService.setActiveWorkers('encoding', activeCount);
    }
  }

  /** 关闭所有 worker（进程退出时调用） */
  shutdown(): void {
    this.shuttingDown = true;
    this.shutdownWorkers();
  }

  /** 关闭 worker 线程（运行时禁用 / 进程退出） */
  private shutdownWorkers(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
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
    this.metricsService.setActiveWorkers('encoding', 0);
  }

  /** 是否启用 */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** 获取指标 */
  getMetrics(): WorkerPoolMetrics {
    return this.metricsService.getMetrics('encoding');
  }

  // ─── 内部方法 ────────────────────────────────────────────────

  private executeFallback<TPayload, TResult>(
    taskId: string,
    _kind: string,
    payload: TPayload,
    fallback: SyncFallback<TPayload, TResult> | null,
  ): Promise<WorkerTaskResult<TResult>> {
    const startedAt = performance.now();
    this.metricsService.recordFallback('encoding');

    if (!fallback) {
      return Promise.resolve({
        taskId,
        ok: false,
        errorMessage: 'No fallback provided and worker pool disabled',
        durationMs: 0,
      });
    }

    try {
      const result = fallback(payload);
      const durationMs = performance.now() - startedAt;
      this.metricsService.recordComplete('encoding', durationMs);
      return Promise.resolve({ taskId, ok: true, result, durationMs });
    } catch (err: unknown) {
      const durationMs = performance.now() - startedAt;
      this.metricsService.recordFailed('encoding');
      return Promise.resolve({
        taskId,
        ok: false,
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs,
      });
    }
  }

  private dispatchToWorker<TPayload, TResult>(
    taskId: string,
    kind: string,
    payload: TPayload,
    deadlineMs: number,
    fallback: SyncFallback<TPayload, TResult> | null,
  ): Promise<WorkerTaskResult<TResult>> {
    return new Promise((resolve) => {
      // 找到一个活跃的 worker（跳过 null/dead）
      let worker: Worker | null = null;
      let selectedIndex = -1;
      for (let attempt = 0; attempt < this.workers.length; attempt++) {
        const idx = this.roundRobinIndex % this.workers.length;
        const candidate = this.workers[idx];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % this.workers.length;
        if (candidate) {
          worker = candidate;
          selectedIndex = idx;
          break;
        }
      }
      if (!worker) {
        // 所有 worker 都死了，走 fallback
        if (fallback) {
          resolve(this.executeFallbackSync(taskId, payload, fallback) as WorkerTaskResult<TResult>);
        } else {
          resolve({ taskId, ok: false, errorMessage: 'All workers dead', durationMs: 0 });
        }
        return;
      }

      const timer = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        this.metricsService.recordTimeout('encoding');

        // 超时 fallback
        if (fallback) {
          const fbResult = this.executeFallbackSync(taskId, payload, fallback);
          resolve(fbResult as WorkerTaskResult<TResult>);
        } else {
          resolve({
            taskId,
            ok: false,
            errorMessage: `Task timed out after ${deadlineMs}ms`,
            durationMs: deadlineMs,
          });
        }
      }, deadlineMs);

      this.pendingTasks.set(taskId, {
        resolve: resolve as (r: WorkerTaskResult) => void,
        timer,
        fallback: fallback as SyncFallback<unknown, unknown> | null,
        payload,
        submittedAt: performance.now(),
        workerIndex: selectedIndex,
      });

      const envelope: WorkerTaskEnvelope = {
        taskId,
        kind: kind as WorkerTaskEnvelope['kind'],
        payload,
        deadlineMs: Date.now() + deadlineMs,
        fallbackOnTimeout: fallback !== null,
      };

      try {
        worker.postMessage(envelope);
      } catch (postErr: unknown) {
        // Worker 已终止——清理 pending 并走 fallback
        clearTimeout(timer);
        this.pendingTasks.delete(taskId);
        if (fallback) {
          const fbResult = this.executeFallbackSync(taskId, payload, fallback);
          resolve(fbResult as WorkerTaskResult<TResult>);
        } else {
          resolve({
            taskId,
            ok: false,
            errorMessage: `Worker postMessage failed: ${postErr instanceof Error ? postErr.message : String(postErr)}`,
            durationMs: 0,
          });
        }
      }
    });
  }

  private executeFallbackSync<TPayload, TResult>(
    taskId: string,
    payload: TPayload,
    fallback: SyncFallback<TPayload, TResult>,
  ): WorkerTaskResult<TResult> {
    const startedAt = performance.now();
    try {
      const result = fallback(payload);
      return { taskId, ok: true, result, durationMs: performance.now() - startedAt };
    } catch (err: unknown) {
      return {
        taskId,
        ok: false,
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - startedAt,
      };
    }
  }

  private spawnWorkers(): void {
    const workerPath = resolve(__dirname, 'workers', 'encoding.worker.js');
    this.workers = new Array(this.config.poolSize).fill(null);

    for (let i = 0; i < this.config.poolSize; i++) {
      this.spawnSingleWorker(workerPath, i);
    }
  }

  private spawnSingleWorker(workerPath: string, index: number): void {
    try {
      const worker = new Worker(workerPath);
      worker.on('message', (msg: WorkerTaskResult) => {
        this.handleWorkerResult(msg);
      });
      worker.on('error', (err) => {
        this.logger.error(`Encoding worker ${index} error: ${err.message}`);
        this.handleWorkerDeath(worker, index, workerPath);
      });
      worker.on('exit', (code) => {
        if (!this.shuttingDown && code !== 0) {
          this.logger.warn(`Encoding worker ${index} exited with code ${code}, restarting...`);
          this.handleWorkerDeath(worker, index, workerPath);
        }
      });
      this.workers[index] = worker;
    } catch (err: unknown) {
      this.logger.error(
        `Failed to spawn encoding worker ${index}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** 处理 worker 死亡：清理该 worker 的 pending 任务 + 重启 */
  private handleWorkerDeath(deadWorker: Worker, index: number, workerPath: string): void {
    if (this.shuttingDown) return;
    // 防止 error + exit 重复触发
    if (this.workers[index] !== deadWorker && this.workers[index] !== null) {
      return; // 已经被处理过（重启了新 worker）
    }
    // 标记该 worker 为 null（防止新任务分配到它）
    if (this.workers[index] === deadWorker) {
      this.workers[index] = null as unknown as Worker;
    }
    // 只清理分配到该 worker 的 pending 任务
    for (const [taskId, pending] of this.pendingTasks) {
      if (pending.workerIndex !== index) continue;
      clearTimeout(pending.timer);
      this.pendingTasks.delete(taskId);
      this.metricsService.recordFailed('encoding');
      if (pending.fallback) {
        const fbResult = this.executeFallbackSync(taskId, pending.payload, pending.fallback);
        pending.resolve(fbResult);
      } else {
        pending.resolve({
          taskId,
          ok: false,
          errorMessage: 'Worker died',
          durationMs: performance.now() - pending.submittedAt,
        });
      }
    }
    // 延迟重启（避免快速循环崩溃）
    setTimeout(() => {
      if (this.workers[index] === deadWorker || !this.workers[index]) {
        this.spawnSingleWorker(workerPath, index);
      }
    }, 1000);
  }

  private handleWorkerResult(msg: WorkerTaskResult): void {
    const pending = this.pendingTasks.get(msg.taskId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingTasks.delete(msg.taskId);

    const durationMs = performance.now() - pending.submittedAt;
    if (msg.ok) {
      this.metricsService.recordComplete('encoding', durationMs);
    } else {
      this.metricsService.recordFailed('encoding');
    }

    pending.resolve({ ...msg, durationMs });
  }
}
