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
  isMapPaused(mapId: string): boolean;
}

/** 世界运行时端口：推进帧和记录同步耗时。 */
interface WorldRuntimePort {
  advanceFrame(frameDurationMs: number, getMapTickSpeed: ((mapId: string) => number) | null): Promise<unknown> | unknown;
  recordSyncFlushDuration(durationMs: number): void;
  listInstanceEntries?(): Iterable<[string, { template?: { id?: string }; tickSpeed?: number; paused?: boolean }]>;
}

/** 同步端口：把当前帧的变化推送给已连接玩家。 */
interface WorldSyncPort {
  flushConnectedPlayers(): void;
}

/** 世界 Tick 性能指标：跳过帧数、上一帧耗时、最近一次实际间隔。 */
export interface WorldTickMetrics {
  /** 累计被跳过（错过期望调度）的帧数；递归 setTimeout 路径上由慢帧追溯计算。 */
  skippedFrameCount: number;
  /** 上一帧 advanceFrame + sync + 事件总线 flush 总耗时（ms）。 */
  lastTickDurationMs: number;
  /** 上一次实际 tick 间隔（ms）；理想值 = WORLD_TICK_INTERVAL_MS。 */
  lastIntervalMs: number;
  /** 累计 tick 次数。 */
  totalTicks: number;
}

/** 世界 Tick 调度器：以固定间隔循环驱动世界帧推进、同步和事件总线 flush。 */
@Injectable()
export class WorldTickService implements OnModuleInit, OnModuleDestroy, BeforeApplicationShutdown {
  private readonly logger = new Logger(WorldTickService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tickInFlight = false;
  private shuttingDown = false;
  /** N9：跳帧观测。慢于目标 1.5 倍即视为跳帧，便于 GM 性能页与 readiness 降级。 */
  private skippedFrameCount = 0;
  private lastTickStartedAt = 0;
  private lastTickDurationMs = 0;
  private lastIntervalMs = gameplayConstants.WORLD_TICK_INTERVAL_MS;
  private totalTicks = 0;
  /** S8：连续 tick 失败计数，用于 readiness 降级判断。 */
  private consecutiveTickFailures = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES_BEFORE_UNHEALTHY = 5;

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
      // 关停期间不再触发新 tick；不再调度后续。
      return;
    }
    if (this.tickInFlight) {
      // 递归 setTimeout 路径上理论不会重入，保留 guard 防御并发误触发。
      return;
    }

    this.tickInFlight = true;
    const startedAt = performance.now();
    // N9：与上一次 tick 的实际间隔；首次设为目标间隔避免误报。
    this.lastIntervalMs = this.lastTickStartedAt === 0
      ? gameplayConstants.WORLD_TICK_INTERVAL_MS
      : startedAt - this.lastTickStartedAt;
    this.lastTickStartedAt = startedAt;

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
      this.consecutiveTickFailures = 0;
    } catch (error: unknown) {
      this.consecutiveTickFailures += 1;
      this.logger.error(
        `世界 Tick 执行失败（连续第 ${this.consecutiveTickFailures} 次）`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.lastTickDurationMs = performance.now() - startedAt;
      this.totalTicks += 1;
      // N9：跳帧追溯 —— 实际间隔超过目标 1.5 倍视为慢帧，记入 skippedFrameCount，
      // 让 readiness 降级 / 监控指标可见，避免静默 0.66Hz 退化。
      const targetIntervalMs = gameplayConstants.WORLD_TICK_INTERVAL_MS;
      if (this.totalTicks > 1 && this.lastIntervalMs > targetIntervalMs * 1.5) {
        const dropped = Math.max(1, Math.floor(this.lastIntervalMs / targetIntervalMs) - 1);
        this.skippedFrameCount += dropped;
        this.logger.warn(
          `世界 Tick 慢帧：实际间隔 ${this.lastIntervalMs.toFixed(0)}ms，目标 ${targetIntervalMs}ms，估计跳过 ${dropped} 帧（累计 ${this.skippedFrameCount}）`,
        );
      }
      this.tickInFlight = false;
      this.scheduleNextTick();
    }
  }

  /** 递归 setTimeout 调度：按目标间隔与上一帧耗时差值动态决定下一次延迟。 */
  private scheduleNextTick(): void {
    if (this.shuttingDown) {
      return;
    }
    const targetIntervalMs = gameplayConstants.WORLD_TICK_INTERVAL_MS;
    // 上一帧耗时已经计入；理想下次延迟 = 目标 - 已耗，最低 0 表示立刻进下一帧但仍让出 event loop。
    const delay = Math.max(0, targetIntervalMs - this.lastTickDurationMs);
    this.timer = setTimeout(() => void this.runTickOnce(), delay);
    this.timer.unref();
  }

  /** 暴露 tick 性能指标供诊断 / readiness / GM 性能页消费。 */
  getTickMetrics(): WorldTickMetrics {
    return {
      skippedFrameCount: this.skippedFrameCount,
      lastTickDurationMs: this.lastTickDurationMs,
      lastIntervalMs: this.lastIntervalMs,
      totalTicks: this.totalTicks,
    };
  }

  /** S8：tick 是否健康（连续失败次数未超阈值）。供 readiness 降级消费。 */
  isTickHealthy(): boolean {
    return this.consecutiveTickFailures < WorldTickService.MAX_CONSECUTIVE_FAILURES_BEFORE_UNHEALTHY;
  }

  onModuleInit(): void {
    this.shuttingDown = false;
    this.lastTickStartedAt = 0;
    this.scheduleNextTick();
    this.logger.log(`世界 Tick 已启动（递归 setTimeout 自调度），目标间隔 ${gameplayConstants.WORLD_TICK_INTERVAL_MS}ms`);
  }

  onModuleDestroy(): void {
    this.stopTimer();
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    this.stopTimer();
    const deadline = Date.now() + 5000;
    while (this.tickInFlight && Date.now() < deadline) {
      await sleep(25);
    }
    if (this.tickInFlight) {
      this.logger.warn('关停超时：tick 仍在执行，强制继续关停流程');
    }
  }

  private stopTimer(): void {
    if (!this.timer) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = null;
  }
}

/** 异步等待指定毫秒数。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
