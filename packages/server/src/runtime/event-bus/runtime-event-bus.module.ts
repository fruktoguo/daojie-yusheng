/**
 * 本文件属于服务端权威运行时，负责地图、玩家、市场、邮件或后台运行态的类型与逻辑。
 *
 * 维护时要保持运行态变更受控，所有会影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Module } from '@nestjs/common';
import { RuntimeEventBusService } from './runtime-event-bus.service';
import { RuntimeEventBusMetricsService } from './runtime-event-bus-metrics.service';

@Module({
  providers: [RuntimeEventBusService, RuntimeEventBusMetricsService],
  exports: [RuntimeEventBusService, RuntimeEventBusMetricsService],
})
export class RuntimeEventBusModule {}
