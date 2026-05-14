import { Module } from '@nestjs/common';
import { RuntimeEventBusService } from './runtime-event-bus.service';
import { RuntimeEventBusMetricsService } from './runtime-event-bus-metrics.service';

@Module({
  providers: [RuntimeEventBusService, RuntimeEventBusMetricsService],
  exports: [RuntimeEventBusService, RuntimeEventBusMetricsService],
})
export class RuntimeEventBusModule {}
