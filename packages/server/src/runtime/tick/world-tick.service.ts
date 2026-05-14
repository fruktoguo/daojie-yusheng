/**
 * 世界 Tick 调度服务。
 * 按固定间隔驱动世界运行时推进帧、同步玩家状态和事件总线收尾。
 * 保证同一时刻只有一个 tick 在执行，关闭时等待当前 tick 完成。
 */
import { Inject, Injectable, Logger, type BeforeApplicationShutdown, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { gameplayConstants } from '@mud/shared';

import { WorldSyncService } from '../../network/world-sync.service';
import { RuntimeEventBusService } from '../event-bus/runtime-event-bus.service';
import { RuntimeMapConfigService } from '../map/runtime-map-config.service';
import { RuntimeMaintenanceService } from '../world/runtime-maintenance.service';
import { WorldRuntimeService } from '../world/world-runtime.service';

/** 运行时事件总线端口：tick 末尾 flush 收集的事件。 */
interface RuntimeEventBusPort {
  flushTick(): unknown;
}

/** 维护模式端口：判断是否处于维护状态以跳过 tick。 */
interface RuntimeMaintenancePort {
  isRuntimeMaintenanceActive(): boolean;
}

/** 地图配置端口：获取每张地图的 tick 倍速。 */
interface RuntimeMapConfigPort {
  getMapTickSpeed(mapId: string): number;
}

/** 世界运行时端口：推进帧和记录同步耗时。 */
interface WorldRuntimePort {
  advanceFrame(frameDurationMs: number, getMapTickSpeed: (mapId: string) => number): Promise<unknown> | unknown;
  recordSyncFlushDuration(durationMs: number): void;
}

/** 同步端口：把当前帧的变化推送给已连接玩家。 */
interface WorldSyncPort {
  flushConnectedPlayers(): void;
}

/** 世界 Tick 调度器：以固定间隔循环驱动世界帧推进、同步和事件总线 flush。 */
@Injectable()
export class WorldTickService implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  private readonly logger = new Logger(WorldTickService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickInFlight = false;
  private shuttingDown = false;

  constructor(
    @Inject(RuntimeEventBusService)
    private readonly runtimeEventBusService: RuntimeEventBusPort,
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

  /** 执行一次完整 tick：推进世界帧 → 同步玩家 → 事件总线 flush 收尾。 */
  private async runTickOnce(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
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
      this.runtimeEventBusService.flushTick();
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
    this.shuttingDown = false;
    this.timer = setInterval(() => {
      void this.runTickOnce();
    }, gameplayConstants.WORLD_TICK_INTERVAL_MS);

    this.timer.unref();
    this.logger.log(`世界 Tick 已启动，间隔 ${gameplayConstants.WORLD_TICK_INTERVAL_MS}ms`);
  }

  onModuleDestroy(): void {
    this.stopTimer();
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    this.stopTimer();
    while (this.tickInFlight) {
      await sleep(25);
    }
  }

  private stopTimer(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }
}

/** 异步等待指定毫秒数。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
