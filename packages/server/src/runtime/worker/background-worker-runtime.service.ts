/**
 * 本文件属于服务端权威运行时，负责地图、玩家、市场、邮件或后台运行态的类型与逻辑。
 *
 * 维护时要保持运行态变更受控，所有会影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { shouldStartBackgroundWorkers, shouldStartBackupWorker } from '../../config/runtime-role';
import { StartupBarrierService } from '../../lifecycle/startup-barrier.service';
import { FlushTaskRuntimeService } from '../../persistence/flush-task-runtime.service';
import { resolveFlushTaskRuntimeMode } from '../../persistence/flush-task-runtime-mode';
import { OutboxDispatcherRuntimeService } from '../../persistence/outbox-dispatcher-runtime.service';
import { AssetAuditLogRetentionWorker } from '../world/worker/asset-audit-log-retention.worker';
import { FlushLedgerRetentionWorker } from '../world/worker/flush-ledger-retention.worker';
import { InstanceStatePurgeWorker } from '../world/worker/instance-state-purge.worker';
import { MailExpirationCleanupWorker } from '../world/worker/mail-expiration-cleanup.worker';
import { MailSoftDeletePurgeWorker } from '../world/worker/mail-soft-delete-purge.worker';
import { runDatabaseBackupWorkerOnce } from '../../tools/database-backup-worker';
import { SchedulerManagerService } from '../../scheduler/scheduler-manager.service';
import type { SchedulerTaskKind, SchedulerTaskPriority, SchedulerTaskScope } from '../../scheduler/scheduler.types';
import { MarketTradeHistoryRetentionWorker } from '../world/worker/market-trade-history-retention.worker';

interface BackgroundWorkerTask {
  id: string;
  label: string;
  intervalMs: number;
  enabled: boolean;
  kind: SchedulerTaskKind;
  scope: SchedulerTaskScope;
  priority: SchedulerTaskPriority;
  runOnce: () => Promise<number>;
}

export interface BackgroundWorkerRuntimeStatus {
  id: string;
  label: string;
  enabled: boolean;
  running: boolean;
  lastHeartbeatAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailure: string | null;
  processedCount: number;
}

const OUTBOX_INTERVAL_MS = 2_000;
const CLEANUP_INTERVAL_MS = 30_000;
const MAIL_EXPIRATION_INTERVAL_MS = 5_000;
const MARKET_RETENTION_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class BackgroundWorkerRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundWorkerRuntimeService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly states = new Map<string, BackgroundWorkerRuntimeStatus>();
  private stopping = false;

  constructor(
    @Optional() @Inject(FlushTaskRuntimeService)
    private readonly flushTaskRuntimeService?: FlushTaskRuntimeService,
    @Optional() @Inject(OutboxDispatcherRuntimeService)
    private readonly outboxDispatcherRuntimeService?: OutboxDispatcherRuntimeService,
    @Optional() @Inject(AssetAuditLogRetentionWorker)
    private readonly assetAuditLogRetentionWorker?: AssetAuditLogRetentionWorker,
    @Optional() @Inject(FlushLedgerRetentionWorker)
    private readonly flushLedgerRetentionWorker?: FlushLedgerRetentionWorker,
    @Optional() @Inject(MailExpirationCleanupWorker)
    private readonly mailExpirationCleanupWorker?: MailExpirationCleanupWorker,
    @Optional() @Inject(MailSoftDeletePurgeWorker)
    private readonly mailSoftDeletePurgeWorker?: MailSoftDeletePurgeWorker,
    @Optional() @Inject(MarketTradeHistoryRetentionWorker)
    private readonly marketTradeHistoryRetentionWorker?: MarketTradeHistoryRetentionWorker,
    @Optional() @Inject(InstanceStatePurgeWorker)
    private readonly instanceStatePurgeWorker?: InstanceStatePurgeWorker,
    @Optional() @Inject(StartupBarrierService)
    private readonly startupBarrierService?: StartupBarrierService,
    @Optional() @Inject(SchedulerManagerService)
    private readonly schedulerManagerService?: SchedulerManagerService,
  ) {}

  onModuleInit(): void {
    this.logger.log('后台任务编排器已注册，等待启动链路编排器开闸');
  }

  startForLifecycleCoordinator(): void {
    if (!shouldStartBackgroundWorkers()) {
      this.logger.log('后台任务编排器已跳过：当前 role 不承载后台 worker');
      return;
    }
    if (this.timers.size > 0) {
      return;
    }
    for (const task of this.buildTasks()) {
      this.registerTask(task);
      if (!task.enabled) {
        continue;
      }
      const timer = setInterval(() => void this.runTask(task), task.intervalMs);
      timer.unref();
      this.timers.set(task.id, timer);
      void this.runTask(task);
    }
    this.logger.log(`后台任务编排器已启动：${this.timers.size} 个定时任务`);
  }

  onModuleDestroy(): void {
    this.stopping = true;
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  listWorkerStates(): BackgroundWorkerRuntimeStatus[] {
    return Array.from(this.states.values()).map((state) => ({ ...state }));
  }

  private buildTasks(): BackgroundWorkerTask[] {
    return [
      {
        id: 'flush-task-consumer',
        label: 'Flush task consumer',
        intervalMs: 2_000,
        enabled: Boolean(this.flushTaskRuntimeService) && resolveFlushTaskRuntimeMode() === 'worker',
        kind: 'flush',
        scope: 'global',
        priority: 'high',
        runOnce: async () => this.flushTaskRuntimeService?.runOnce('background-orchestrator') ?? 0,
      },
      {
        id: 'outbox-dispatcher',
        label: 'Outbox dispatcher',
        intervalMs: OUTBOX_INTERVAL_MS,
        enabled: this.outboxDispatcherRuntimeService?.isRuntimeEnabled() === true,
        kind: 'outbox',
        scope: 'global',
        priority: 'high',
        runOnce: async () => this.outboxDispatcherRuntimeService?.dispatchPendingEvents() ?? 0,
      },
      {
        id: 'mail-expiration-cleanup',
        label: 'Mail expiration cleanup',
        intervalMs: MAIL_EXPIRATION_INTERVAL_MS,
        enabled: Boolean(this.mailExpirationCleanupWorker),
        kind: 'maintenance',
        scope: 'global',
        priority: 'normal',
        runOnce: async () => this.mailExpirationCleanupWorker?.runOnce() ?? 0,
      },
      {
        id: 'mail-soft-delete-purge',
        label: 'Mail soft delete purge',
        intervalMs: CLEANUP_INTERVAL_MS,
        enabled: Boolean(this.mailSoftDeletePurgeWorker),
        kind: 'maintenance',
        scope: 'global',
        priority: 'low',
        runOnce: async () => this.mailSoftDeletePurgeWorker?.runOnce() ?? 0,
      },
      {
        id: 'asset-audit-log-retention',
        label: 'Asset audit log retention',
        intervalMs: CLEANUP_INTERVAL_MS,
        enabled: Boolean(this.assetAuditLogRetentionWorker),
        kind: 'maintenance',
        scope: 'global',
        priority: 'low',
        runOnce: async () => this.assetAuditLogRetentionWorker?.runOnce() ?? 0,
      },
      {
        id: 'flush-ledger-retention',
        label: 'Flush ledger retention',
        intervalMs: CLEANUP_INTERVAL_MS,
        enabled: Boolean(this.flushLedgerRetentionWorker),
        kind: 'maintenance',
        scope: 'global',
        priority: 'low',
        runOnce: async () => this.flushLedgerRetentionWorker?.runOnce() ?? 0,
      },
      {
        id: 'market-trade-history-retention',
        label: 'Market trade history retention',
        intervalMs: MARKET_RETENTION_INTERVAL_MS,
        enabled: Boolean(this.marketTradeHistoryRetentionWorker),
        kind: 'maintenance',
        scope: 'global',
        priority: 'low',
        runOnce: async () => this.marketTradeHistoryRetentionWorker?.runOnce() ?? 0,
      },
      {
        id: 'instance-state-purge',
        label: 'Instance state purge',
        intervalMs: CLEANUP_INTERVAL_MS,
        enabled: Boolean(this.instanceStatePurgeWorker),
        kind: 'maintenance',
        scope: 'instance',
        priority: 'low',
        runOnce: async () => this.instanceStatePurgeWorker?.runOnce() ?? 0,
      },
      {
        id: 'database-backup',
        label: 'Database backup',
        intervalMs: 60_000,
        enabled: shouldStartBackupWorker() && resolveServerDatabaseUrl().trim().length > 0,
        kind: 'maintenance',
        scope: 'node',
        priority: 'low',
        runOnce: async () => (await runDatabaseBackupWorkerOnce()) ? 1 : 0,
      },
    ];
  }

  private registerTask(task: BackgroundWorkerTask): void {
    this.schedulerManagerService?.registerTask({
      id: task.id,
      kind: task.kind,
      scope: task.scope,
      enabled: task.enabled,
      priority: task.priority,
      intervalMs: task.intervalMs,
      maxConcurrency: 1,
      leaderMode: task.id === 'flush-task-consumer' || task.id === 'outbox-dispatcher' ? 'claim' : 'single',
      description: task.label,
    }, task.runOnce);
    this.states.set(task.id, {
      id: task.id,
      label: task.label,
      enabled: task.enabled,
      running: false,
      lastHeartbeatAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailure: null,
      processedCount: 0,
    });
  }

  private async runTask(task: BackgroundWorkerTask): Promise<void> {
    const state = this.states.get(task.id);
    if (!state || state.running || this.stopping || !task.enabled) {
      return;
    }
    if (this.startupBarrierService && !this.startupBarrierService.isWorkerOpen()) {
      return;
    }
    state.running = true;
    state.lastHeartbeatAt = new Date().toISOString();
    try {
      const processed = this.schedulerManagerService
        ? await this.schedulerManagerService.runTask(task.id, task.runOnce)
        : await task.runOnce();
      state.processedCount += Math.max(0, Math.trunc(Number(processed) || 0));
      state.lastSuccessAt = new Date().toISOString();
      state.lastFailure = null;
    } catch (error) {
      state.lastFailureAt = new Date().toISOString();
      state.lastFailure = error instanceof Error ? error.message : String(error);
      this.logger.warn(`后台任务执行失败 id=${task.id}: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    } finally {
      state.running = false;
      state.lastHeartbeatAt = new Date().toISOString();
    }
  }
}
