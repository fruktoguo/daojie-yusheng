import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { gameplayConstants } from '@mud/shared';

import { WorldSyncService } from '../../network/world-sync.service';
import { RuntimeGmStateService } from '../gm/runtime-gm-state.service';
import { RuntimeMapConfigService } from '../map/runtime-map-config.service';
import { RuntimeMaintenanceService } from '../world/runtime-maintenance.service';
import { WorldRuntimeService } from '../world/world-runtime.service';

interface RuntimeGmStatePort {
  flushQueuedStatePushes(): void;
}

interface RuntimeMaintenancePort {
  isRuntimeMaintenanceActive(): boolean;
}

interface RuntimeMapConfigPort {
  getMapTickSpeed(mapId: string): number;
}

interface WorldRuntimePort {
  advanceFrame(frameDurationMs: number, getMapTickSpeed: (mapId: string) => number): Promise<unknown> | unknown;
  recordSyncFlushDuration(durationMs: number): void;
}

interface WorldSyncPort {
  flushConnectedPlayers(): void;
}

@Injectable()
export class WorldTickService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorldTickService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickInFlight = false;

  constructor(
    @Inject(RuntimeGmStateService)
    private readonly runtimeGmStateService: RuntimeGmStatePort,
    @Inject(RuntimeMaintenanceService)
    private readonly runtimeMaintenanceService: RuntimeMaintenancePort,
    @Inject(RuntimeMapConfigService)
    private readonly mapRuntimeConfigService: RuntimeMapConfigPort,
    @Inject(WorldRuntimeService)
    private readonly worldRuntimeService: WorldRuntimePort,
    @Inject(WorldSyncService)
    private readonly worldSyncService: WorldSyncPort,
  ) {}

  private getMapTickSpeed(mapId: string): number {
    return this.mapRuntimeConfigService.getMapTickSpeed(mapId);
  }

  private async runTickOnce(): Promise<void> {
    if (this.tickInFlight) {
      return;
    }

    this.tickInFlight = true;

    try {
      if (this.runtimeMaintenanceService.isRuntimeMaintenanceActive()) {
        return;
      }

      await this.worldRuntimeService.advanceFrame(
        gameplayConstants.WORLD_TICK_INTERVAL_MS,
        (mapId: string) => this.getMapTickSpeed(mapId),
      );

      const syncStartedAt = performance.now();
      this.worldSyncService.flushConnectedPlayers();
      this.worldRuntimeService.recordSyncFlushDuration(performance.now() - syncStartedAt);
      this.runtimeGmStateService.flushQueuedStatePushes();
    } catch (error: unknown) {
      this.logger.error(
        '世界 Tick 执行失败',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.tickInFlight = false;
    }
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runTickOnce();
    }, gameplayConstants.WORLD_TICK_INTERVAL_MS);

    this.timer.unref();
    this.logger.log(`世界 Tick 已启动，间隔 ${gameplayConstants.WORLD_TICK_INTERVAL_MS}ms`);
  }

  onModuleDestroy(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }
}
