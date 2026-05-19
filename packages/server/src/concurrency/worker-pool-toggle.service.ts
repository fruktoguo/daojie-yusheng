/**
 * Worker Pool 动态开关服务。
 * 支持通过 GM runtime flag 在运行时动态开关 worker pool 各子功能。
 * 不再读取环境变量，所有开关都只以 runtime flag 为准。
 *
 * 架构：toggle 变更时主动调用各 pool 的 setEnabled()，pool 热路径只读自己的 config.enabled。
 *
 * GM flag key 约定：
 * - worker_pool_enabled: 总开关
 * - worker_pool_aoi_envelope_enabled: AOI envelope 编码
 * - worker_pool_pathfinding_enabled: 寻路
 * - worker_pool_fov_enabled: FOV 计算
 * - worker_pool_instance_enabled: 实例 tick 分片
 * - worker_pool_persistence_enabled: 持久化序列化
 */
import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';

import { GmRuntimeFlagPersistenceService } from '../persistence/gm-runtime-flag-persistence.service';
import { EncodingWorkerPoolService } from './encoding-worker-pool.service';
import { InstanceWorkerPoolService } from './instance-worker-pool.service';
import { PersistenceWorkerPoolService } from './persistence-worker-pool.service';

/** Worker Pool 开关 key 常量 */
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
    @Optional() @Inject(GmRuntimeFlagPersistenceService)
    private readonly runtimeFlagService?: GmRuntimeFlagPersistenceService,
    @Optional() @Inject(EncodingWorkerPoolService)
    private readonly encodingPool?: EncodingWorkerPoolService,
    @Optional() @Inject(InstanceWorkerPoolService)
    private readonly instancePool?: InstanceWorkerPoolService,
    @Optional() @Inject(PersistenceWorkerPoolService)
    private readonly persistencePool?: PersistenceWorkerPoolService,
  ) {}

  /**
   * 模块初始化后自动同步一次开关状态。
   * 解决：重启时 GM flag 已为 true 但 pool 初始 config.enabled=false 的问题。
   */
  onModuleInit(): void {
    void this.syncToPoolAfterInit();
  }

  private async syncToPoolAfterInit(): Promise<void> {
    try {
      await this.runtimeFlagService?.ensureInitialized();
    } catch (error: unknown) {
      this.logger.warn(`Worker Pool 开关初始化读取失败，将按默认关闭状态同步：${error instanceof Error ? error.message : String(error)}`);
    }
    // 延迟一个 tick，确保 WorkerPoolModule.onModuleInit() 已完成 pool 的 initialize()
    setImmediate(() => {
      this.syncToPool();
    });
  }

  /**
   * 同步开关状态到各 pool service。
   * 在 GM flag 变更后由 controller 调用。
   */
  syncToPool(): void {
    const poolEnabled = this.isPoolEnabled();

    // 子开关：如果 runtime flag 没有显式设置子开关，默认跟随总开关
    const instanceEnabled = poolEnabled
      && this.resolveFlagWithDefault(WORKER_POOL_FLAG_KEYS.instance, poolEnabled);
    const persistenceEnabled = poolEnabled
      && this.resolveFlagWithDefault(WORKER_POOL_FLAG_KEYS.persistence, poolEnabled);

    this.logger.log(
      `syncToPool: poolEnabled=${poolEnabled}, encoding=${poolEnabled}, instance=${instanceEnabled}, persistence=${persistenceEnabled}` +
      ` | injected: encoding=${Boolean(this.encodingPool)}, instance=${Boolean(this.instancePool)}, persistence=${Boolean(this.persistencePool)}`,
    );

    this.encodingPool?.setEnabled(poolEnabled);
    this.instancePool?.setEnabled(instanceEnabled);
    this.persistencePool?.setEnabled(persistenceEnabled);
  }

  /** 总开关是否启用 */
  isPoolEnabled(): boolean {
    return this.resolveFlag(WORKER_POOL_FLAG_KEYS.enabled);
  }

  /** AOI envelope worker 是否启用 */
  isAoiEnvelopeEnabled(): boolean {
    return this.isPoolEnabled()
      && this.resolveFlag(WORKER_POOL_FLAG_KEYS.aoiEnvelope);
  }

  /** 寻路 worker 是否启用 */
  isPathfindingEnabled(): boolean {
    return this.isPoolEnabled()
      && this.resolveFlag(WORKER_POOL_FLAG_KEYS.pathfinding);
  }

  /** FOV worker 是否启用 */
  isFovEnabled(): boolean {
    return this.isPoolEnabled()
      && this.resolveFlag(WORKER_POOL_FLAG_KEYS.fov);
  }

  /** 实例 tick 分片 worker 是否启用 */
  isInstanceEnabled(): boolean {
    return this.isPoolEnabled()
      && this.resolveFlag(WORKER_POOL_FLAG_KEYS.instance);
  }

  /** 持久化序列化 worker 是否启用 */
  isPersistenceEnabled(): boolean {
    return this.isPoolEnabled()
      && this.resolveFlag(WORKER_POOL_FLAG_KEYS.persistence);
  }

  /** 获取所有开关状态（供 GM 性能页展示） */
  getAllToggleStates(): Record<string, boolean | string> {
    return {
      poolEnabled: this.isPoolEnabled(),
      aoiEnvelope: this.isAoiEnvelopeEnabled(),
      pathfinding: this.isPathfindingEnabled(),
      fov: this.isFovEnabled(),
      instance: this.isInstanceEnabled(),
      persistence: this.isPersistenceEnabled(),
      _runtimeFlagServiceInjected: Boolean(this.runtimeFlagService) as any,
      _runtimeFlagServiceEnabled: Boolean(this.runtimeFlagService?.isEnabled()) as any,
      _hasPoolFlag: Boolean(this.runtimeFlagService?.hasFlag?.(WORKER_POOL_FLAG_KEYS.enabled)) as any,
      _poolFlagValue: Boolean(this.runtimeFlagService?.getFlag?.(WORKER_POOL_FLAG_KEYS.enabled)) as any,
    };
  }

  /**
   * 解析开关值，仅以 GM runtime flag 为准。
   * 未显式设置时，默认关闭。
   */
  private resolveFlag(flagKey: string): boolean {
    if (this.runtimeFlagService?.isEnabled() && this.runtimeFlagService.hasFlag(flagKey)) {
      return this.runtimeFlagService.getFlag(flagKey);
    }
    return false;
  }

  /**
   * 与 resolveFlag 类似，但未显式设置时返回 defaultValue。
   * 用于子开关默认跟随总开关。
   */
  private resolveFlagWithDefault(flagKey: string, defaultValue: boolean): boolean {
    if (this.runtimeFlagService?.isEnabled() && this.runtimeFlagService.hasFlag(flagKey)) {
      return this.runtimeFlagService.getFlag(flagKey);
    }
    return defaultValue;
  }
}
