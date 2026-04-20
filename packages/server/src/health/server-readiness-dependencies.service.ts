import { Inject, Injectable, Optional } from '@nestjs/common';

import { RuntimeMaintenanceService } from '../runtime/world/runtime-maintenance.service';
/**
 * RuntimeMaintenanceServiceLike：定义接口结构约束，明确可交付字段含义。
 */


interface RuntimeMaintenanceServiceLike {
/**
 * isRuntimeMaintenanceActive：RuntimeMaintenanceServiceLike 内部字段。
 */

  isRuntimeMaintenanceActive?: () => boolean;
}

/** 运行就绪依赖收集器，当前主要提供维护态服务引用，便于后续扩展。 */
@Injectable()
export class ServerReadinessDependenciesService {
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param maintenanceStateService RuntimeMaintenanceServiceLike 参数说明。
 * @returns 无返回值（构造函数）。
 */

  constructor(
    @Optional()
    @Inject(RuntimeMaintenanceService)
    private readonly maintenanceStateService: RuntimeMaintenanceServiceLike,
  ) {}

  /** 输出 readiness 依赖注入对象，保持上层服务组装的一致性。 */
  build() {
    return {
      maintenanceStateService: this.maintenanceStateService,
    };
  }
}
