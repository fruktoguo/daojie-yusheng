/**
 * Worker Pool 动态开关服务。
 * 支持通过 GM runtime flag 在运行时动态开关 worker pool 各子功能。
 * 优先级：GM runtime flag > 环境变量。
 *
 * GM flag key 约定：
 * - worker_pool_enabled: 总开关
 * - worker_pool_aoi_envelope_enabled: AOI envelope 编码
 * - worker_pool_pathfinding_enabled: 寻路
 * - worker_pool_fov_enabled: FOV 计算
 * - worker_pool_instance_enabled: 实例 tick 分片
 * - worker_pool_persistence_enabled: 持久化序列化
 */
import { Inject, Injectable, Optional } from '@nestjs/common';

import { GmRuntimeFlagPersistenceService } from '../persistence/gm-runtime-flag-persistence.service';

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
export class WorkerPoolToggleService {
  constructor(
    @Optional() @Inject(GmRuntimeFlagPersistenceService)
    private readonly runtimeFlagService?: GmRuntimeFlagPersistenceService,
  ) {}

  /** 总开关是否启用 */
  isPoolEnabled(): boolean {
    return this.resolveFlag(WORKER_POOL_FLAG_KEYS.enabled, 'SERVER_WORKER_POOL_ENABLED');
  }

  /** AOI envelope worker 是否启用 */
  isAoiEnvelopeEnabled(): boolean {
    return this.isPoolEnabled()
      && this.resolveFlag(WORKER_POOL_FLAG_KEYS.aoiEnvelope, 'SERVER_AOI_ENVELOPE_WORKER_ENABLED');
  }

  /** 寻路 worker 是否启用 */
  isPathfindingEnabled(): boolean {
    return this.isPoolEnabled()
      && this.resolveFlag(WORKER_POOL_FLAG_KEYS.pathfinding, 'SERVER_PATHFINDING_WORKER_ENABLED');
  }

  /** FOV worker 是否启用 */
  isFovEnabled(): boolean {
    return this.isPoolEnabled()
      && this.resolveFlag(WORKER_POOL_FLAG_KEYS.fov, 'SERVER_FOV_WORKER_ENABLED');
  }

  /** 实例 tick 分片 worker 是否启用 */
  isInstanceEnabled(): boolean {
    return this.isPoolEnabled()
      && this.resolveFlag(WORKER_POOL_FLAG_KEYS.instance, 'SERVER_INSTANCE_WORKER_ENABLED');
  }

  /** 持久化序列化 worker 是否启用 */
  isPersistenceEnabled(): boolean {
    return this.isPoolEnabled()
      && this.resolveFlag(WORKER_POOL_FLAG_KEYS.persistence, 'SERVER_PERSISTENCE_BUILD_WORKER_ENABLED');
  }

  /** 获取所有开关状态（供 GM 性能页展示） */
  getAllToggleStates(): Record<string, boolean> {
    return {
      poolEnabled: this.isPoolEnabled(),
      aoiEnvelope: this.isAoiEnvelopeEnabled(),
      pathfinding: this.isPathfindingEnabled(),
      fov: this.isFovEnabled(),
      instance: this.isInstanceEnabled(),
      persistence: this.isPersistenceEnabled(),
    };
  }

  /**
   * 解析开关值。优先级：GM runtime flag > 环境变量。
   * GM flag 未设置时 fallback 到环境变量。
   */
  private resolveFlag(flagKey: string, envKey: string): boolean {
    // GM runtime flag 优先（支持运行时动态切换）
    if (this.runtimeFlagService?.isEnabled()) {
      // 只有 GM 显式设置过该 flag 时才覆盖环境变量
      if (this.runtimeFlagService.hasFlag(flagKey)) {
        return this.runtimeFlagService.getFlag(flagKey);
      }
    }
    // fallback 到环境变量
    return process.env[envKey] === 'true';
  }
}
