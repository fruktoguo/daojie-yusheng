/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 世界 Tick 调度服务。
 * 按实例 deadline 驱动世界运行时推进帧、同步玩家状态和事件总线收尾。
 * 加速实例只提高自己的到期频率；全局维护和全量同步仍固定在 1Hz。
 * 保证同一时刻只有一个 tick 在执行，关闭时等待当前 tick 完成。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { MAX_INSTANCE_TICK_SPEED, gameplayConstants } from '@mud/shared';

import { shouldStartAuthoritativeRuntime } from '../../config/runtime-role';
import { StartupBarrierService } from '../../lifecycle/startup-barrier.service';
import { SchedulerManagerService } from '../../scheduler/scheduler-manager.service';
import { WorldSyncService } from '../../network/world-sync.service';
import { WorldSessionService } from '../../network/world-session.service';
import { RuntimeEventBusService } from '../event-bus/runtime-event-bus.service';
import { RuntimeMapConfigService } from '../map/runtime-map-config.service';
import { RuntimeMaintenanceService } from '../world/runtime-maintenance.service';
import { WorldRuntimeService } from '../world/world-runtime.service';
import {
  WorldRuntimeInstanceScheduleService,
  type InstanceTickSchedulePlan,
  type SchedulableInstanceRuntime,
} from '../world/world-runtime-instance-schedule.service';

/** 运行时事件总线端口：tick 末尾 flush 收集的事件。 */
interface RuntimeEventBusPort {
  flushTick(): unknown;
  flushInstance?(instanceId: string): unknown;
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
  advanceFrame(
    frameDurationMs: number,
    getMapTickSpeed: ((mapId: string) => number) | null,
    scheduledPlans?: InstanceTickSchedulePlan[] | null,
  ): Promise<unknown> | unknown;
  recordSyncFlushDuration(durationMs: number): void;
  listInstanceEntries?(): Iterable<[string, SchedulableInstanceRuntime]>;
  getInstanceRuntime?(instanceId: string): SchedulableInstanceRuntime | null;
  isInstanceLeaseWritable?(instance: SchedulableInstanceRuntime): boolean;
}

interface WorldSessionIndexPort {
  listInstancePlayerIds(instanceId: string): string[];
}

/** 同步端口：把当前帧的变化推送给已连接玩家。 */
interface WorldSyncPort {
  flushConnectedPlayers(): Promise<void> | void;
  flushPlayerIds?(playerIds: Iterable<string>): Promise<void> | void;
}

/** 调度间隔下限（ms），防止极端倍速导致 CPU 过载。 */
const MIN_TICK_INTERVAL_MS = gameplayConstants.WORLD_TICK_INTERVAL_MS / MAX_INSTANCE_TICK_SPEED;

/** 调度间隔上限（ms），即正常 1 倍速间隔。 */
const BASE_TICK_INTERVAL_MS = gameplayConstants.WORLD_TICK_INTERVAL_MS;
const WORLD_TICK_SCHEDULER_TASK_ID = 'world-tick';

/** 世界 Tick 性能指标：跳过帧数、上一帧耗时、最近一次实际间隔。 */
export interface WorldTickMetrics {
  /** 累计被跳过（错过期望调度）的帧数；递归 setTimeout 路径上由慢帧追溯计算。 */
  skippedFrameCount: number;
  /** 上一帧 advanceFrame + sync + 事件总线 flush 总耗时（ms）。 */
  lastTickDurationMs: number;
  /** 上一次实际 tick 间隔（ms）；理想值 = 动态目标间隔。 */
  lastIntervalMs: number;
  /** 累计 tick 次数。 */
  totalTicks: number;
}

/** 世界 Tick 调度器：以动态间隔循环驱动世界帧推进、同步和事件总线 flush。 */
@Injectable()
export class WorldTickService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorldTickService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lifecycleStarted = false;
  private tickInFlight = false;
  private shuttingDown = false;
  /** N9：跳帧观测。慢于目标 1.5 倍即视为跳帧，便于 GM 性能页与 readiness 降级。 */
  private skippedFrameCount = 0;
  private lastTickStartedAt = 0;
  /** 最近一次 1Hz 全量同步的单调时钟时间；加速帧之间只同步到期实例。 */
  private lastFullSyncStartedAt = 0;
  private lastTickDurationMs = 0;
  private lastIntervalMs = BASE_TICK_INTERVAL_MS;
  private totalTicks = 0;
  /** S8：连续 tick 失败计数，用于 readiness 降级判断。 */
  private consecutiveTickFailures = 0;
  private static readonly MAX_CONSECUTIVE_FAILURES_BEFORE_UNHEALTHY = 5;

  /** 当前目标唤醒间隔（ms），由最近实例 deadline 决定。 */
  private currentTargetIntervalMs = BASE_TICK_INTERVAL_MS;

  private readonly handleInstanceScheduleChanged = (): void => {
    if (!this.lifecycleStarted || this.shuttingDown || this.tickInFlight) {
      return;
    }
    this.stopTimer();
    this.scheduleNextTick();
  };

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
    @Optional() @Inject(StartupBarrierService)
    private readonly startupBarrierService?: StartupBarrierService,
    @Optional() @Inject(SchedulerManagerService)
    private readonly schedulerManagerService?: SchedulerManagerService,
    @Optional() @Inject(WorldRuntimeInstanceScheduleService)
    private readonly instanceScheduleService?: WorldRuntimeInstanceScheduleService,
    @Optional() @Inject(WorldSessionService)
    private readonly worldSessionService?: WorldSessionIndexPort,
  ) {}

  private getMapTickSpeed(mapId: string): number {
    return this.mapRuntimeConfigService.getMapTickSpeed(mapId);
  }

  /** 旧测试/降级路径使用的全实例扫描间隔解析。 */
  private resolveEffectiveTickIntervalMs(): number {
    let maxSpeed = 1;
    if (typeof this.worldRuntimeService.listInstanceEntries === 'function') {
      for (const [, instance] of this.worldRuntimeService.listInstanceEntries()) {
        if (instance.paused === true) {
          continue;
        }
        const speed = instance.tickSpeed;
        if (typeof speed === 'number' && Number.isFinite(speed) && speed > maxSpeed) {
          maxSpeed = speed;
        }
      }
    }
    if (maxSpeed <= 1) {
      return BASE_TICK_INTERVAL_MS;
    }
    return Math.max(MIN_TICK_INTERVAL_MS, Math.round(BASE_TICK_INTERVAL_MS / maxSpeed));
  }

  /** 执行一次完整 tick：推进世界帧 → 同步玩家 → 事件总线 flush 收尾。 */
  private async runTickOnce(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    if (this.startupBarrierService && !this.startupBarrierService.isTickOpen()) {
      return;
    }
    if (this.tickInFlight) {
      return;
    }

    this.tickInFlight = true;
    const startedAt = performance.now();
    // 计算本帧实际经过时间
    const actualElapsedMs = this.lastTickStartedAt === 0
      ? this.currentTargetIntervalMs
      : startedAt - this.lastTickStartedAt;
    this.lastIntervalMs = actualElapsedMs;
    this.lastTickStartedAt = startedAt;

    try {
      if (this.runtimeMaintenanceService.isRuntimeMaintenanceActive()) {
        return;
      }

      const scheduledPlans = this.collectDueInstancePlans(startedAt);
      const affectedPlayerIds = scheduledPlans
        ? this.collectPlanPlayerIds(scheduledPlans)
        : null;
      await this.worldRuntimeService.advanceFrame(
        actualElapsedMs,
        null,
        scheduledPlans,
      );

      const fullSyncDue = scheduledPlans === null
        || this.lastFullSyncStartedAt === 0
        || startedAt - this.lastFullSyncStartedAt >= BASE_TICK_INTERVAL_MS;
      const syncStartedAt = performance.now();
      if (!fullSyncDue && scheduledPlans && typeof this.worldSyncService.flushPlayerIds === 'function') {
        for (const playerId of this.collectPlanPlayerIds(scheduledPlans)) {
          affectedPlayerIds?.add(playerId);
        }
        await this.worldSyncService.flushPlayerIds(affectedPlayerIds ?? []);
      } else {
        await this.worldSyncService.flushConnectedPlayers();
        this.lastFullSyncStartedAt = startedAt;
      }
      this.worldRuntimeService.recordSyncFlushDuration(performance.now() - syncStartedAt);
      if (!fullSyncDue && scheduledPlans && typeof this.runtimeEventBusService.flushInstance === 'function') {
        for (const plan of scheduledPlans) {
          this.runtimeEventBusService.flushInstance(plan.instanceId);
        }
      } else {
        this.runtimeEventBusService.flushTick();
      }
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
      // N9：跳帧追溯 —— 实际间隔超过动态目标 1.5 倍视为慢帧
      const targetIntervalMs = this.currentTargetIntervalMs;
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

  /** 递归 setTimeout 调度：按动态目标间隔与上一帧耗时差值决定下一次延迟。 */
  private scheduleNextTick(): void {
    if (!this.lifecycleStarted || this.shuttingDown) {
      return;
    }
    // deadline 是绝对单调时间，不能再减上一帧耗时，否则会重复补偿并提前唤醒。
    const deadlineDelay = this.instanceScheduleService?.resolveNextDelayMs(performance.now());
    this.currentTargetIntervalMs = deadlineDelay ?? this.resolveEffectiveTickIntervalMs();
    const delay = deadlineDelay ?? Math.max(0, this.currentTargetIntervalMs - this.lastTickDurationMs);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runScheduledTick();
    }, delay);
    this.timer.unref();
  }

  private async runScheduledTick(): Promise<void> {
    try {
      if (!this.schedulerManagerService) {
        await this.runTickOnce();
        return;
      }
      await this.schedulerManagerService.runTask(WORLD_TICK_SCHEDULER_TASK_ID, async () => {
        await this.runTickOnce();
        return 1;
      }).catch((error: unknown) => {
        this.logger.error('世界 Tick 调度管理器调度失败', error instanceof Error ? error.stack : String(error));
      });
    } finally {
      // 启动闸门关闭或调度管理器未真正执行 callback 时，也必须保留下一次唤醒。
      if (this.lifecycleStarted && !this.shuttingDown && !this.tickInFlight && !this.timer) {
        this.scheduleNextTick();
      }
    }
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
    if (!shouldStartAuthoritativeRuntime()) {
      this.logger.log('世界 Tick 已跳过：当前 role 不持有权威运行态');
      return;
    }
    this.logger.log('世界 Tick 已注册，等待启动链路编排器开闸');
  }

  startForLifecycleCoordinator(): void {
    if (!shouldStartAuthoritativeRuntime()) {
      this.logger.log('世界 Tick 已跳过：当前 role 不持有权威运行态');
      return;
    }
    if (this.lifecycleStarted) {
      return;
    }
    this.lifecycleStarted = true;
    this.shuttingDown = false;
    this.lastTickStartedAt = 0;
    this.lastFullSyncStartedAt = 0;
    this.currentTargetIntervalMs = BASE_TICK_INTERVAL_MS;
    if (this.instanceScheduleService && typeof this.worldRuntimeService.listInstanceEntries === 'function') {
      this.instanceScheduleService.rebuild(this.worldRuntimeService.listInstanceEntries(), performance.now());
      // 重建期间不安装监听器，避免 rebuild 通知提前创建首个 timer，随后启动路径再创建第二个。
      this.instanceScheduleService.setScheduleChangedListener(this.handleInstanceScheduleChanged);
    }
    this.schedulerManagerService?.registerTask({
      id: WORLD_TICK_SCHEDULER_TASK_ID,
      kind: 'tick',
      scope: 'global',
      enabled: true,
      priority: 'high',
      intervalMs: BASE_TICK_INTERVAL_MS,
      maxConcurrency: 1,
      leaderMode: 'single',
      description: 'World runtime tick loop',
    }, async () => {
      await this.runTickOnce();
      return 1;
    });
    this.schedulerManagerService?.setPaused(WORLD_TICK_SCHEDULER_TASK_ID, false);
    this.scheduleNextTick();
    this.logger.log(`世界 Tick 已启动（实例 deadline 自调度），基准间隔 ${BASE_TICK_INTERVAL_MS}ms，最小间隔 ${MIN_TICK_INTERVAL_MS}ms`);
  }

  private collectDueInstancePlans(nowMs: number): InstanceTickSchedulePlan[] | null {
    if (!this.instanceScheduleService || typeof this.worldRuntimeService.getInstanceRuntime !== 'function') {
      return null;
    }
    return this.instanceScheduleService.collectDue(
      nowMs,
      (instanceId) => this.worldRuntimeService.getInstanceRuntime?.(instanceId) ?? null,
      typeof this.worldRuntimeService.isInstanceLeaseWritable === 'function'
        ? (instance) => this.worldRuntimeService.isInstanceLeaseWritable?.(instance) !== false
        : undefined,
    );
  }

  private collectPlanPlayerIds(plans: InstanceTickSchedulePlan[]): Set<string> {
    const playerIds = new Set<string>();
    if (typeof this.worldSessionService?.listInstancePlayerIds !== 'function') {
      return playerIds;
    }
    for (const plan of plans) {
      for (const playerId of this.worldSessionService.listInstancePlayerIds(plan.instanceId)) {
        playerIds.add(playerId);
      }
    }
    return playerIds;
  }

  onModuleDestroy(): void {
    this.lifecycleStarted = false;
    this.instanceScheduleService?.setScheduleChangedListener(null);
    this.schedulerManagerService?.setPaused(WORLD_TICK_SCHEDULER_TASK_ID, true);
    this.stopTimer();
  }

  async stopForShutdown(): Promise<void> {
    this.lifecycleStarted = false;
    this.shuttingDown = true;
    this.instanceScheduleService?.setScheduleChangedListener(null);
    this.schedulerManagerService?.setPaused(WORLD_TICK_SCHEDULER_TASK_ID, true);
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
