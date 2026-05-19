/**
 * Worker Pool 状态服务。
 * 现阶段只负责 worker pool 的诊断视图与启动后的保活同步，不再承载产品级开关语义。
 * 运行时 worker 可用性由 pool 自身的 fallback 与健康状态决定。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';

import { EncodingWorkerPoolService } from './encoding-worker-pool.service';
import { InstanceWorkerPoolService } from './instance-worker-pool.service';
import { PersistenceWorkerPoolService } from './persistence-worker-pool.service';

/** Worker Pool 开关 key 常量（保留给 GM 诊断接口兼容使用）。 */
export const WORKER_POOL_FLAG_KEYS = {
  /** 总开关 */
  enabled: 'worker_pool_enabled',
  /** AOI envelope 编码 */
  aoiEnvelope: 'worker_pool_aoi_envelope_enabled',
  /** 寻路 */
  pathfinding: 'worker_pool_pathfinding_enabled',
  /** FOV 计算 */
  fov: 'worker_pool_fov_enabled',
  /** 实例 tick 分片 */
  instance: 'worker_pool_instance_enabled',
  /** 持久化序列化 */
  persistence: 'worker_pool_persistence_enabled',
} as const;

@Injectable()
export class WorkerPoolToggleService implements OnModuleInit {
  private readonly logger = new Logger(WorkerPoolToggleService.name);

  constructor(
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingPool?: EncodingWorkerPoolService,
    @Optional() @Inject(InstanceWorkerPoolService)
    private readonly instancePool?: InstanceWorkerPoolService,
    @Optional() @Inject(PersistenceWorkerPoolService)
    private readonly persistencePool?: PersistenceWorkerPoolService,
  ) {}

  /** 模块初始化后主动确保三类 pool 都处于启用态。 */
  onModuleInit(): void {
    void this.syncToPool();
  }

  /** 同步当前 always-on 状态到各 pool；产品级关闭语义已移除。 */
  syncToPool(): void {
    try {
      this.encodingPool?.setEnabled(true);
      this.instancePool?.setEnabled(true);
      this.persistencePool?.setEnabled(true);
    } catch (error: unknown) {
      this.logger.warn(`Worker Pool 启用同步失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 总开关是否启用。 */
  isPoolEnabled(): boolean {
    return Boolean(this.encodingPool?.isEnabled() || this.instancePool?.isEnabled() || this.persistencePool?.isEnabled());
  }

  /** AOI envelope worker 是否启用。 */
  isAoiEnvelopeEnabled(): boolean {
    return Boolean(this.encodingPool?.isEnabled());
  }

  /** 寻路 worker 是否启用。 */
  isPathfindingEnabled(): boolean {
    return Boolean(this.encodingPool?.isEnabled());
  }

  /** FOV worker 是否启用。 */
  isFovEnabled(): boolean {
    return Boolean(this.encodingPool?.isEnabled());
  }

  /** 实例 tick 分片 worker 是否启用。 */
  isInstanceEnabled(): boolean {
    return Boolean(this.instancePool?.isEnabled());
  }

  /** 持久化序列化 worker 是否启用。 */
  isPersistenceEnabled(): boolean {
    return Boolean(this.persistencePool?.isEnabled());
  }

  /** 获取所有开关状态（供 GM 诊断页展示）。 */
  getAllToggleStates(): Record<string, boolean | string> {
    return {
      mode: 'always_on',
      poolEnabled: this.isPoolEnabled(),
      aoiEnvelope: this.isAoiEnvelopeEnabled(),
      pathfinding: this.isPathfindingEnabled(),
      fov: this.isFovEnabled(),
      instance: this.isInstanceEnabled(),
      persistence: this.isPersistenceEnabled(),
      encodingPoolInjected: Boolean(this.encodingPool),
      instancePoolInjected: Boolean(this.instancePool),
      persistencePoolInjected: Boolean(this.persistencePool),
    };
  }
}
