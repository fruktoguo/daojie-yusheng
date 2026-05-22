/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';

import { RuntimeMaintenanceService } from '../runtime/world/runtime-maintenance.service';

/** 维护态服务鸭子类型接口 */
interface RuntimeMaintenanceServiceLike {
  isRuntimeMaintenanceActive?: () => boolean;
}

/** 就绪依赖收集器：当前提供维护态服务引用 */
@Injectable()
export class ServerReadinessDependenciesService {
  constructor(
    @Optional()
    @Inject(RuntimeMaintenanceService)
    private readonly maintenanceStateService: RuntimeMaintenanceServiceLike,
  ) {}

  /** 输出 readiness 依赖对象，供 HealthReadinessService 组装 */
  build() {
    return {
      maintenanceStateService: this.maintenanceStateService,
    };
  }
}
