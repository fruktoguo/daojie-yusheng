import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { shouldStartBackgroundWorkers, shouldStartBackupWorker } from '../../config/runtime-role';
import { FlushTaskRuntimeService } from '../../persistence/flush-task-runtime.service';
import { OutboxDispatcherRuntimeService } from '../../persistence/outbox-dispatcher-runtime.service';
import { AssetAuditLogRetentionWorker } from '../world/worker/asset-audit-log-retention.worker';
import { InstanceStatePurgeWorker } from '../world/worker/instance-state-purge.worker';
import { MailExpirationCleanupWorker } from '../world/worker/mail-expiration-cleanup.worker';
import { MailSoftDeletePurgeWorker } from '../world/worker/mail-soft-delete-purge.worker';
import { runDatabaseBackupWorkerOnce } from '../../tools/database-backup-worker';
import { MarketTradeHistoryRetentionWorker } from '../world/worker/market-trade-history-retention.worker';

interface BackgroundWorkerTask {
  id: string;
  label: string;
  intervalMs: number;
  enabled: boolean;
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
    @Optional() @Inject(MailExpirationCleanupWorker)
    private readonly mailExpirationCleanupWorker?: MailExpirationCleanupWorker,
    @Optional() @Inject(MailSoftDeletePurgeWorker)
    private readonly mailSoftDeletePurgeWorker?: MailSoftDeletePurgeWorker,
    @Optional() @Inject(MarketTradeHistoryRetentionWorker)
    private readonly marketTradeHistoryRetentionWorker?: MarketTradeHistoryRetentionWorker,
    @Optional() @Inject(InstanceStatePurgeWorker)
    private readonly instanceStatePurgeWorker?: InstanceStatePurgeWorker,
  ) {}

  onModuleInit(): void {
    if (!shouldStartBackgroundWorkers()) {
      this.logger.log('后台 worker orchestrator 已跳过：当前 role 不承载后台 worker');
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
    this.logger.log(`后台 worker orchestrator 已启动：${this.timers.size} 个定时任务`);
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
        enabled: false,
        runOnce: async () => this.flushTaskRuntimeService?.runOnce('background-orchestrator') ?? 0,
      },
      {
        id: 'outbox-dispatcher',
        label: 'Outbox dispatcher',
        intervalMs: OUTBOX_INTERVAL_MS,
        enabled: this.outboxDispatcherRuntimeService?.isRuntimeEnabled() === true,
        runOnce: async () => this.outboxDispatcherRuntimeService?.dispatchPendingEvents() ?? 0,
      },
      {
        id: 'mail-expiration-cleanup',
        label: 'Mail expiration cleanup',
        intervalMs: MAIL_EXPIRATION_INTERVAL_MS,
        enabled: Boolean(this.mailExpirationCleanupWorker),
        runOnce: async () => this.mailExpirationCleanupWorker?.runOnce() ?? 0,
      },
      {
        id: 'mail-soft-delete-purge',
        label: 'Mail soft delete purge',
        intervalMs: CLEANUP_INTERVAL_MS,
        enabled: Boolean(this.mailSoftDeletePurgeWorker),
        runOnce: async () => this.mailSoftDeletePurgeWorker?.runOnce() ?? 0,
      },
      {
        id: 'asset-audit-log-retention',
        label: 'Asset audit log retention',
        intervalMs: CLEANUP_INTERVAL_MS,
        enabled: Boolean(this.assetAuditLogRetentionWorker),
        runOnce: async () => this.assetAuditLogRetentionWorker?.runOnce() ?? 0,
      },
      {
        id: 'market-trade-history-retention',
        label: 'Market trade history retention',
        intervalMs: MARKET_RETENTION_INTERVAL_MS,
        enabled: Boolean(this.marketTradeHistoryRetentionWorker),
        runOnce: async () => this.marketTradeHistoryRetentionWorker?.runOnce() ?? 0,
      },
      {
        id: 'instance-state-purge',
        label: 'Instance state purge',
        intervalMs: CLEANUP_INTERVAL_MS,
        enabled: Boolean(this.instanceStatePurgeWorker),
        runOnce: async () => this.instanceStatePurgeWorker?.runOnce() ?? 0,
      },
      {
        id: 'database-backup',
        label: 'Database backup',
        intervalMs: 60_000,
        enabled: shouldStartBackupWorker() && resolveServerDatabaseUrl().trim().length > 0,
        runOnce: async () => (await runDatabaseBackupWorkerOnce()) ? 1 : 0,
      },
    ];
  }

  private registerTask(task: BackgroundWorkerTask): void {
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
    state.running = true;
    state.lastHeartbeatAt = new Date().toISOString();
    try {
      const processed = await task.runOnce();
      state.processedCount += Math.max(0, Math.trunc(Number(processed) || 0));
      state.lastSuccessAt = new Date().toISOString();
      state.lastFailure = null;
    } catch (error) {
      state.lastFailureAt = new Date().toISOString();
      state.lastFailure = error instanceof Error ? error.message : String(error);
      this.logger.warn(`后台 worker 执行失败 id=${task.id}: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    } finally {
      state.running = false;
      state.lastHeartbeatAt = new Date().toISOString();
    }
  }
}
