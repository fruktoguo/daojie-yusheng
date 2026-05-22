/**
 * 本文件属于项目主线脚本，负责所属模块内的类型、工具或运行逻辑。
 *
 * 维护时先确认调用方和数据边界，保持注释说明职责而不改变现有行为。
 */
/**
 * Worker Pool NestJS 模块。
 * 注册三类 worker pool 服务和指标采集服务。
 * worker pool 默认 always-on，任务级 fallback 在各 pool 内部处理。
 */
import { Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { WorkerPoolMetricsService } from './worker-pool-metrics.service';
import { EncodingWorkerPoolService } from './encoding-worker-pool.service';
import { InstanceWorkerPoolService } from './instance-worker-pool.service';
import { PersistenceWorkerPoolService } from './persistence-worker-pool.service';

@Module({
  providers: [
    WorkerPoolMetricsService,
    EncodingWorkerPoolService,
    InstanceWorkerPoolService,
    PersistenceWorkerPoolService,
  ],
  exports: [
    WorkerPoolMetricsService,
    EncodingWorkerPoolService,
    InstanceWorkerPoolService,
    PersistenceWorkerPoolService,
  ],
})
export class WorkerPoolModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly encodingPool: EncodingWorkerPoolService,
    private readonly instancePool: InstanceWorkerPoolService,
    private readonly persistencePool: PersistenceWorkerPoolService,
  ) {}

  onModuleInit(): void {
    this.encodingPool.initialize();
    this.instancePool.initialize();
    this.persistencePool.initialize();
  }

  onModuleDestroy(): void {
    this.encodingPool.shutdown();
    this.instancePool.shutdown();
    this.persistencePool.shutdown();
  }
}
