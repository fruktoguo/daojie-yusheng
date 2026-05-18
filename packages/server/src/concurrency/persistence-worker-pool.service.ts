/**
 * Persistence Worker Pool 服务。
 * 无状态池：吃 dirty domain 列表，输出 SQL 参数集合。
 * 主线程负责 pool.query 发 SQL + 处理结果。
 * 当前为空实现：所有 submit() 直接走主线程同步 fallback。
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  WorkerTaskEnvelope,
  WorkerTaskResult,
  WorkerPoolConfig,
  WorkerPoolMetrics,
} from './worker-task.types';
import { WorkerPoolMetricsService } from './worker-pool-metrics.service';
import type { SyncFallback } from './encoding-worker-pool.service';

@Injectable()
export class PersistenceWorkerPoolService {
  private readonly logger = new Logger(PersistenceWorkerPoolService.name);
  private config: WorkerPoolConfig;

  constructor(private readonly metricsService: WorkerPoolMetricsService) {
    this.config = {
      enabled: process.env.SERVER_WORKER_POOL_ENABLED === 'true',
      poolSize: Math.max(1, Math.min(Number(process.env.SERVER_PERSISTENCE_WORKER_COUNT) || 2, 4)),
      defaultDeadlineMs: 1000,
    };
  }

  /** 提交持久化序列化任务 */
  async submit<TPayload, TResult>(
    kind: WorkerTaskEnvelope['kind'],
    payload: TPayload,
    fallback: SyncFallback<TPayload, TResult> | null = null,
    _deadlineMs?: number,
  ): Promise<WorkerTaskResult<TResult>> {
    const taskId = randomUUID();
    this.metricsService.recordSubmit('persistence');

    // 当前空实现：直接走 fallback
    this.metricsService.recordFallback('persistence');
    if (!fallback) {
      return { taskId, ok: false, errorMessage: 'No fallback and pool disabled', durationMs: 0 };
    }
    const startedAt = performance.now();
    try {
      const result = fallback(payload);
      const durationMs = performance.now() - startedAt;
      this.metricsService.recordComplete('persistence', durationMs);
      return { taskId, ok: true, result, durationMs };
    } catch (err: unknown) {
      this.metricsService.recordFailed('persistence');
      return {
        taskId,
        ok: false,
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - startedAt,
      };
    }
  }

  /** 初始化 */
  initialize(): void {
    if (!this.config.enabled) {
      this.logger.log('PersistenceWorkerPool 已禁用');
      return;
    }
    // TODO: Phase 5 启动 worker 线程
    this.logger.log(`PersistenceWorkerPool 配置就绪（poolSize=${this.config.poolSize}），当前走 fallback`);
  }

  /** 关闭 */
  shutdown(): void {
    // 当前无 worker 需要关闭
  }

  /** 是否启用 */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** 获取指标 */
  getMetrics(): WorkerPoolMetrics {
    return this.metricsService.getMetrics('persistence');
  }
}
