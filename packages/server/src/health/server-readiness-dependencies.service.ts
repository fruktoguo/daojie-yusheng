/**
 * 就绪依赖收集服务：封装 readiness 检测所需的运维态依赖（如维护态服务），
 * 便于 HealthReadinessService 统一组装，也方便后续扩展新的就绪条件。
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
