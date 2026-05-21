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
