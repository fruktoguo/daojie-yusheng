/**
 * 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
 *
 * 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
 */
/**
 * Encoding Worker Pool 服务。
 * CPU 无状态池：处理 AOI envelope 编码、A* 寻路、FOV 计算。
 *
 * 热路径默认 always-on；任务级故障降级在 pool 内部透明处理。
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
  private readonly forceSyncMode = isForceSyncMode();
  private workers: Worker[] = [];
  private shuttingDown = false;
  private activeWorkerCount = 0;
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
      poolSize: Math.max(1, Math.min(cpus().length - 2, 6)),
      defaultDeadlineMs: 500,
    };
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

    if (this.forceSyncMode) {
      return this.executeFallback(taskId, kind, payload, fallback);
    }

    if (this.activeWorkerCount === 0) {
      this.ensureWorkersStarted();
    }

    if (this.activeWorkerCount === 0) {
      return this.executeFallback(taskId, kind, payload, fallback);
    }

    return this.dispatchToWorker(taskId, kind, payload, deadline, fallback);
  }

  /** 初始化 worker pool（由 WorkerPoolModule onModuleInit 调用） */
  initialize(): void {
    if (this.forceSyncMode) {
      this.logger.log('编码工作池处于强制同步模式，跳过工作线程启动');
      return;
    }
    this.ensureWorkersStarted();
    this.logger.log(
      `EncodingWorkerPool 已启动：${this.activeWorkerCount} 个 worker`,
    );
  }

  /** 延迟启动 worker。 */
  private ensureWorkersStarted(): void {
    if (this.forceSyncMode || this.shuttingDown) return;
    if (this.activeWorkerCount > 0) return;
    this.spawnWorkers();
    if (this.activeWorkerCount > 0) {
      this.logger.log(`编码工作池延迟启动：${this.activeWorkerCount} 个工作线程`);
      this.metricsService.setActiveWorkers('encoding', this.activeWorkerCount);
    }
  }

  /** 关闭所有 worker（进程退出时调用） */
  shutdown(): void {
    this.shuttingDown = true;
    this.shutdownWorkers();
  }

  /** 关闭 worker 线程（进程退出或显式重启时调用） */
  private shutdownWorkers(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
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
    this.metricsService.setActiveWorkers('encoding', 0);
  }

  /** 是否启用 */
  isEnabled(): boolean {
    return !this.forceSyncMode && this.activeWorkerCount > 0;
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
        this.logger.error(`编码工作线程 ${index} 错误：${err.message}`);
        this.handleWorkerDeath(worker, index, workerPath);
      });
      worker.on('exit', (code) => {
        if (!this.shuttingDown && code !== 0) {
          this.logger.warn(`编码工作线程 ${index} 异常退出（code=${code}），正在重启...`);
          this.handleWorkerDeath(worker, index, workerPath);
        }
      });
      this.workers[index] = worker;
      this.activeWorkerCount += 1;
      this.metricsService.setActiveWorkers('encoding', this.activeWorkerCount);
    } catch (err: unknown) {
      this.logger.error(
        `编码工作线程 ${index} 启动失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private handleWorkerResult(msg: WorkerTaskResult): void {
    const pending = this.pendingTasks.get(msg.taskId);
    if (!pending) {
      return;
    }
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
      this.activeWorkerCount = Math.max(0, this.activeWorkerCount - 1);
      this.metricsService.setActiveWorkers('encoding', this.activeWorkerCount);
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
}

export function isForceSyncMode(): boolean {
  const raw = process.env.SERVER_WORKER_POOL_FORCE_SYNC;
  if (typeof raw !== 'string') {
    return false;
  }
  return /^(1|true|yes|on)$/iu.test(raw.trim());
}
