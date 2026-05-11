/**
 * 世界帧推进服务
 * 封装 advanceFrame 调用入口，协调实例 tick 编排和帧指标记录
 */
import { Inject, Injectable } from '@nestjs/common';

import { WorldRuntimeInstanceTickOrchestrationService } from './world-runtime-instance-tick-orchestration.service';
import { WorldRuntimeMetricsService } from './world-runtime-metrics.service';

type FrameDeps = unknown;
type InstanceTickSpeedResolver = ((templateId: string) => number | null | undefined) | null;

interface FrameOrchestrationServiceLike {
  advanceFrame(
    deps: FrameDeps,
    frameDurationMs?: number,
    getInstanceTickSpeed?: InstanceTickSpeedResolver,
  ): Promise<number>;
}

interface RuntimeMetricsServiceLike {
  recordSyncFlushDuration(durationMs: number): void;
}

/** 世界帧推进入口，委托 tick 编排服务执行并记录同步刷新耗时 */
@Injectable()
export class WorldRuntimeFrameService {
  constructor(
    @Inject(WorldRuntimeInstanceTickOrchestrationService)
    private readonly worldRuntimeInstanceTickOrchestrationService: FrameOrchestrationServiceLike,
    @Inject(WorldRuntimeMetricsService)
    private readonly worldRuntimeMetricsService: RuntimeMetricsServiceLike,
  ) {}

  async tickAll(deps: FrameDeps): Promise<number> {
    return this.advanceFrame(deps, 1000);
  }

  async advanceFrame(
    deps: FrameDeps,
    frameDurationMs = 1000,
    getInstanceTickSpeed: InstanceTickSpeedResolver = null,
  ): Promise<number> {
    return this.worldRuntimeInstanceTickOrchestrationService.advanceFrame(deps, frameDurationMs, getInstanceTickSpeed);
  }

  recordSyncFlushDuration(durationMs: number): void {
    this.worldRuntimeMetricsService.recordSyncFlushDuration(durationMs);
  }
}
