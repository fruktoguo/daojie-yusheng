/**
 * Instance Worker Pool 服务。
 * 实例分片池：每个 worker 持有 K 个 MapInstanceRuntime 的只读快照，
 * 按 instanceId 哈希分片。只承担可在 tick 内完整算完且不需写权威态的子阶段。
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
export class InstanceWorkerPoolService {
  private readonly logger = new Logger(InstanceWorkerPoolService.name);
  private config: WorkerPoolConfig;

  constructor(private readonly metricsService: WorkerPoolMetricsService) {
    this.config = {
      enabled: process.env.SERVER_WORKER_POOL_ENABLED === 'true',
      poolSize: Math.max(1, Math.min(Number(process.env.SERVER_INSTANCE_WORKER_COUNT) || 4, 6)),
      defaultDeadlineMs: 800,
    };
  }

  /** 提交实例 tick 任务 */
  async submit<TPayload, TResult>(
    kind: WorkerTaskEnvelope['kind'],
    payload: TPayload,
    fallback: SyncFallback<TPayload, TResult> | null = null,
    deadlineMs?: number,
  ): Promise<WorkerTaskResult<TResult>> {
    const taskId = randomUUID();
    this.metricsService.recordSubmit('instance');

    // 当前空实现：直接走 fallback
    if (!this.config.enabled || !fallback) {
      this.metricsService.recordFallback('instance');
      if (!fallback) {
        return { taskId, ok: false, errorMessage: 'No fallback and pool disabled', durationMs: 0 };
      }
      const startedAt = performance.now();
      try {
        const result = fallback(payload);
        const durationMs = performance.now() - startedAt;
        this.metricsService.recordComplete('instance', durationMs);
        return { taskId, ok: true, result, durationMs };
      } catch (err: unknown) {
        this.metricsService.recordFailed('instance');
        return {
          taskId,
          ok: false,
          errorMessage: err instanceof Error ? err.message : String(err),
          durationMs: performance.now() - startedAt,
        };
      }
    }

    // TODO: Phase 4 实现真实 worker 分发
    this.metricsService.recordFallback('instance');
    const startedAt = performance.now();
    try {
      const result = fallback(payload);
      const durationMs = performance.now() - startedAt;
      this.metricsService.recordComplete('instance', durationMs);
      return { taskId, ok: true, result, durationMs };
    } catch (err: unknown) {
      this.metricsService.recordFailed('instance');
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
      this.logger.log('InstanceWorkerPool 已禁用');
      return;
    }
    // TODO: Phase 4 启动 worker 线程
    this.logger.log(`InstanceWorkerPool 配置就绪（poolSize=${this.config.poolSize}），当前走 fallback`);
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
    return this.metricsService.getMetrics('instance');
  }
}
