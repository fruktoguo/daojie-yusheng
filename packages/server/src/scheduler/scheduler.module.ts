/**
 * 本文件属于服务端调度器模块，负责登记、控制和持久化后台任务的运行状态。
 *
 * 维护时要区分任务定义、运行开关和实际 worker 逻辑，避免多个节点重复执行同一职责。
 */
import { Module } from '@nestjs/common';

import { SchedulerGovernorService } from './scheduler-governor.service';
import { SchedulerManagerService } from './scheduler-manager.service';
import { SchedulerRegistryService } from './scheduler-registry.service';
import { SchedulerStatePersistenceService } from './scheduler-state-persistence.service';
import { SchedulerStateService } from './scheduler-state.service';

@Module({
  providers: [
    SchedulerGovernorService,
    SchedulerManagerService,
    SchedulerRegistryService,
    SchedulerStatePersistenceService,
    SchedulerStateService,
  ],
  exports: [
    SchedulerGovernorService,
    SchedulerManagerService,
    SchedulerRegistryService,
    SchedulerStatePersistenceService,
    SchedulerStateService,
  ],
})
export class SchedulerModule {}
