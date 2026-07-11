/**
 * 本文件属于服务端调度器模块，负责登记、控制和持久化后台任务的运行状态。
 *
 * 维护时要区分任务定义、运行开关和实际 worker 逻辑，避免多个节点重复执行同一职责。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { StartupBarrierService } from '../lifecycle/startup-barrier.service';
import { SchedulerGovernorService } from './scheduler-governor.service';
import { SchedulerRegistryService } from './scheduler-registry.service';
import { SchedulerStatePersistenceService } from './scheduler-state-persistence.service';
import { SchedulerStateService } from './scheduler-state.service';
import type { SchedulerBarrierSnapshot, SchedulerSnapshot, SchedulerTaskDefinition, SchedulerTaskExecutor, SchedulerTaskRunResult } from './scheduler.types';

/** executor 默认超时：防止 runOnce hang 住导致 running=true 永久卡死 */
const SCHEDULER_TASK_DEFAULT_TIMEOUT_MS = 30_000;
/** 跨进程快照用于观测和恢复，不需要随每次任务完成同步写库。 */
const SCHEDULER_STATE_PERSIST_DEBOUNCE_MS = 15_000;

@Injectable()
export class SchedulerManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerManagerService.name);
  private readonly executors = new Map<string, SchedulerTaskExecutor>();
  private persistTimer: NodeJS.Timeout | null = null;
  private persistInFlight: Promise<void> | null = null;
  private persistRequested = false;

  constructor(
    private readonly registry: SchedulerRegistryService,
    private readonly state: SchedulerStateService,
    @Optional() @Inject(SchedulerGovernorService)
    private readonly governorService?: SchedulerGovernorService,
    @Optional() @Inject(SchedulerStatePersistenceService)
    private readonly statePersistenceService?: SchedulerStatePersistenceService,
    @Optional() @Inject(StartupBarrierService)
    private readonly startupBarrierService?: StartupBarrierService,
  ) {}

  onModuleInit(): void {
    this.logger.log('调度管理器已注册，等待启动链路编排器初始化');
  }

  async onModuleDestroy(): Promise<void> {
    this.stop('module_destroy');
    await this.persistSnapshotNow();
  }

  async initialize(input?: { barrier?: SchedulerBarrierSnapshot | null }): Promise<SchedulerSnapshot> {
    const persisted = await this.statePersistenceService?.loadSnapshot().catch(() => null);
    if (persisted) {
      this.state.restoreFromSnapshot(persisted);
    }
    this.state.markInitialized();
    this.refreshBarrierSnapshot(input?.barrier);
    await this.persistSnapshotNow();
    return this.getSnapshot();
  }

  stop(reason = 'stop'): SchedulerSnapshot {
    this.state.markStopping();
    this.refreshBarrierSnapshot();
    this.schedulePersistSnapshot();
    this.logger.log(`调度管理器已进入停止状态：${reason}`);
    return this.getSnapshot();
  }

  registerTask(definition: SchedulerTaskDefinition, executor?: SchedulerTaskExecutor): SchedulerTaskDefinition {
    const registered = this.registry.register(definition);
    this.state.registerTask(registered);
    if (executor) {
      this.executors.set(registered.id, executor);
    }
    this.schedulePersistSnapshot();
    return registered;
  }

  listTasks(): SchedulerTaskDefinition[] {
    return this.registry.list();
  }

  setPaused(taskId: string, paused: boolean): boolean {
    const updated = this.state.setPaused(taskId, paused);
    if (updated) {
      void this.persistSnapshotNow();
    }
    return Boolean(updated);
  }

  setEnabled(taskId: string, enabled: boolean): boolean {
    const updated = this.state.setEnabled(taskId, enabled);
    if (updated) {
      void this.persistSnapshotNow();
    }
    return Boolean(updated);
  }

  triggerTask(taskId: string): Promise<number> {
    const executor = this.executors.get(taskId);
    if (!executor) {
      return Promise.resolve(0);
    }
    return this.runTask(taskId, executor);
  }

  refreshBarrierSnapshot(snapshot?: SchedulerBarrierSnapshot | null): SchedulerSnapshot {
    const nextSnapshot = snapshot !== undefined
      ? snapshot
      : this.startupBarrierService?.getSnapshot?.() ?? null;
    this.state.setBarrierSnapshot(nextSnapshot);
    return this.getSnapshot();
  }

  async runTask(taskId: string, executor: SchedulerTaskExecutor): Promise<number> {
    const task = this.registry.get(taskId);
    if (!task || !task.enabled) return 0;
    const resolvedExecutor = executor ?? this.executors.get(taskId);
    if (!resolvedExecutor) return 0;
    const governorDecision = this.governorService?.evaluate(task) ?? { allow: true, reason: null, snapshot: null };
    if (!governorDecision.allow) {
      this.state.setBacklogCount(task.id, governorDecision.snapshot.backlogCount);
      this.schedulePersistSnapshot();
      return 0;
    }
    const started = this.state.beginRun(task.id);
    if (!started) return 0;
    const startedAt = performance.now();
    const timeoutMs = task.timeoutMs ?? SCHEDULER_TASK_DEFAULT_TIMEOUT_MS;
    try {
      const result = await withTimeout(resolvedExecutor(), timeoutMs, taskId);
      const normalized = normalizeRunResult(result);
      this.state.completeRun(task.id, {
        processedCount: normalized.processedCount,
        durationMs: performance.now() - startedAt,
        nextRunAt: normalized.nextRunAt,
      });
      this.schedulePersistSnapshot();
      return normalized.processedCount;
    } catch (error) {
      this.state.failRun(task.id, { error, durationMs: performance.now() - startedAt });
      this.schedulePersistSnapshot();
      throw error;
    }
  }

  getSnapshot(): SchedulerSnapshot {
    const snapshot = this.state.getSnapshot();
    return {
      ...snapshot,
      governor: this.governorService?.getSnapshot() ?? null,
    };
  }

  private schedulePersistSnapshot(): void {
    if (!this.statePersistenceService) return;
    this.persistRequested = true;
    if (this.persistTimer || this.persistInFlight) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistSnapshotNow();
    }, SCHEDULER_STATE_PERSIST_DEBOUNCE_MS);
    this.persistTimer.unref();
  }

  /**
   * 同一进程只允许一个 scheduler snapshot UPSERT 在途；并发请求只保留最新快照。
   * 失败后延迟重试，避免数据库锁竞争时形成每秒告警和连接池请求风暴。
   */
  private async persistSnapshotNow(): Promise<void> {
    if (!this.statePersistenceService) return;
    this.persistRequested = true;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.persistInFlight) {
      await this.persistInFlight;
      if (!this.persistRequested) return;
    }
    const persistence = this.statePersistenceService;
    const run = (async () => {
      while (this.persistRequested) {
        this.persistRequested = false;
        try {
          await persistence.saveSnapshot(this.getSnapshot());
        } catch (error: unknown) {
          this.logger.warn(`调度器状态持久化失败：${error instanceof Error ? error.message : String(error)}`);
          this.persistRequested = true;
          break;
        }
      }
    })();
    this.persistInFlight = run;
    try {
      await run;
    } finally {
      if (this.persistInFlight === run) {
        this.persistInFlight = null;
      }
      if (this.persistRequested && !this.persistTimer) {
        this.schedulePersistSnapshot();
      }
    }
  }
}

function normalizeRunResult(input: SchedulerTaskRunResult | number | void): { processedCount: number; nextRunAt: number | null } {
  if (typeof input === 'number') {
    return { processedCount: Math.max(0, Math.trunc(input)), nextRunAt: null };
  }
  if (!input || typeof input !== 'object') {
    return { processedCount: 0, nextRunAt: null };
  }
  return {
    processedCount: Math.max(0, Math.trunc(Number(input.processedCount) || 0)),
    nextRunAt: typeof input.nextRunAt === 'number' ? input.nextRunAt : null,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, taskId: string): Promise<T> {
  if (ms <= 0 || !Number.isFinite(ms)) {
    return promise;
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`scheduler_task_timeout: ${taskId} exceeded ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
