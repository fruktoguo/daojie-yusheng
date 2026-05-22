/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';

import { EncodingWorkerPoolService } from './encoding-worker-pool.service';
import { InstanceWorkerPoolService } from './instance-worker-pool.service';
import { PersistenceWorkerPoolService } from './persistence-worker-pool.service';
import { WorkerPoolMetricsService } from './worker-pool-metrics.service';

export interface WorkerPoolDiagnosticsSnapshot {
  mode: 'always_on';
  pools: {
    encoding: { enabled: boolean };
    instance: { enabled: boolean };
    persistence: { enabled: boolean };
  };
  metrics: {
    encoding: ReturnType<WorkerPoolMetricsService['getMetrics']> | null;
    instance: ReturnType<WorkerPoolMetricsService['getMetrics']> | null;
    persistence: ReturnType<WorkerPoolMetricsService['getMetrics']> | null;
  };
}

@Injectable()
export class WorkerPoolDiagnosticsService {
  constructor(
    private readonly metricsService: WorkerPoolMetricsService,
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingPool?: EncodingWorkerPoolService,
    @Optional() @Inject(InstanceWorkerPoolService)
    private readonly instancePool?: InstanceWorkerPoolService,
    @Optional() @Inject(PersistenceWorkerPoolService)
    private readonly persistencePool?: PersistenceWorkerPoolService,
  ) {}

  /** 获取 worker pool 诊断快照。 */
  getDiagnosticsSnapshot(): WorkerPoolDiagnosticsSnapshot {
    return {
      mode: 'always_on',
      pools: {
        encoding: { enabled: Boolean(this.encodingPool?.isEnabled()) },
        instance: { enabled: Boolean(this.instancePool?.isEnabled()) },
        persistence: { enabled: Boolean(this.persistencePool?.isEnabled()) },
      },
      metrics: {
        encoding: this.encodingPool ? this.metricsService.getMetrics('encoding') : null,
        instance: this.instancePool ? this.metricsService.getMetrics('instance') : null,
        persistence: this.persistencePool ? this.metricsService.getMetrics('persistence') : null,
      },
    };
  }

  /** 获取 worker pool 健康状态。 */
  getHealthSummary(): {
    mode: 'always_on';
    healthy: boolean;
    pools: WorkerPoolDiagnosticsSnapshot['pools'];
  } {
    const snapshot = this.getDiagnosticsSnapshot();
    return {
      mode: 'always_on',
      healthy: snapshot.pools.encoding.enabled && snapshot.pools.instance.enabled && snapshot.pools.persistence.enabled,
      pools: snapshot.pools,
    };
  }
}
