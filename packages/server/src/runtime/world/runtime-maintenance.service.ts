/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { GmRuntimeFlagPersistenceService, GM_RUNTIME_MAINTENANCE_FLAG_KEY } from '../../persistence/gm-runtime-flag-persistence.service';

/** 维护模式状态检测，读取多个环境变量判断是否激活 */
@Injectable()
export class RuntimeMaintenanceService {
  constructor(
    @Optional()
    @Inject(GmRuntimeFlagPersistenceService)
    private readonly gmRuntimeFlagService: GmRuntimeFlagPersistenceService | null = null,
  ) {}

  /** 检查运行时是否处于维护/恢复激活状态 */
  isRuntimeMaintenanceActive(): boolean {
    return readBooleanEnv('SERVER_RUNTIME_MAINTENANCE')
      || readBooleanEnv('RUNTIME_MAINTENANCE')
      || readBooleanEnv('SERVER_RUNTIME_RESTORE_ACTIVE')
      || this.isGmMaintenanceFlagActive();
  }

  /** GM 手动切换的持久化维护态。 */
  isGmMaintenanceFlagActive(): boolean {
    return this.gmRuntimeFlagService?.getFlag(GM_RUNTIME_MAINTENANCE_FLAG_KEY) === true;
  }
}

function readBooleanEnv(key: string): boolean {
  const value = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}
