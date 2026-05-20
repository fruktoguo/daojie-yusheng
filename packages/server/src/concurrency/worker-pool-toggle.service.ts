/**
 * Worker Pool 诊断服务。
 * 只负责读取 worker pool 的健康状态与指标快照，不再承载任何产品级开关语义。
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
