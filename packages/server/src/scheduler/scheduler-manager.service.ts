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

@Injectable()
export class SchedulerManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerManagerService.name);
  private readonly executors = new Map<string, SchedulerTaskExecutor>();

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
    this.logger.log('SchedulerManager 已注册，等待启动链路编排器初始化');
  }

  onModuleDestroy(): void {
    this.stop('module_destroy');
  }

  async initialize(input?: { barrier?: SchedulerBarrierSnapshot | null }): Promise<SchedulerSnapshot> {
    const persisted = await this.statePersistenceService?.loadSnapshot().catch(() => null);
    if (persisted) {
      this.state.restoreFromSnapshot(persisted);
    }
    this.state.markInitialized();
    this.refreshBarrierSnapshot(input?.barrier);
    void this.persistSnapshot();
    return this.getSnapshot();
  }

  stop(reason = 'stop'): SchedulerSnapshot {
    this.state.markStopping();
    this.refreshBarrierSnapshot();
    void this.persistSnapshot();
    this.logger.log(`SchedulerManager 已进入停止状态：${reason}`);
    return this.getSnapshot();
  }

  registerTask(definition: SchedulerTaskDefinition, executor?: SchedulerTaskExecutor): SchedulerTaskDefinition {
    const registered = this.registry.register(definition);
    this.state.registerTask(registered);
    if (executor) {
      this.executors.set(registered.id, executor);
    }
    void this.persistSnapshot();
    return registered;
  }

  listTasks(): SchedulerTaskDefinition[] {
    return this.registry.list();
  }

  setPaused(taskId: string, paused: boolean): boolean {
    const updated = this.state.setPaused(taskId, paused);
    if (updated) {
      void this.persistSnapshot();
    }
    return Boolean(updated);
  }

  setEnabled(taskId: string, enabled: boolean): boolean {
    const updated = this.state.setEnabled(taskId, enabled);
    if (updated) {
      void this.persistSnapshot();
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
      void this.persistSnapshot();
      return 0;
    }
    const started = this.state.beginRun(task.id);
    if (!started) return 0;
    const startedAt = performance.now();
    try {
      const result = await resolvedExecutor();
      const normalized = normalizeRunResult(result);
      this.state.completeRun(task.id, {
        processedCount: normalized.processedCount,
        durationMs: performance.now() - startedAt,
        nextRunAt: normalized.nextRunAt,
      });
      void this.persistSnapshot();
      return normalized.processedCount;
    } catch (error) {
      this.state.failRun(task.id, { error, durationMs: performance.now() - startedAt });
      void this.persistSnapshot();
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

  private async persistSnapshot(): Promise<void> {
    if (!this.statePersistenceService) return;
    await this.statePersistenceService.saveSnapshot(this.getSnapshot()).catch((error: unknown) => {
      this.logger.warn(`Scheduler state 持久化失败：${error instanceof Error ? error.message : String(error)}`);
    });
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
