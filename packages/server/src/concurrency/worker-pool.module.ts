/**
 * Worker Pool NestJS 模块。
 * 注册三类 worker pool 服务、指标采集服务和动态开关服务。
 * 启动时根据 SERVER_WORKER_POOL_ENABLED 决定是否真正拉起 worker 线程。
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
