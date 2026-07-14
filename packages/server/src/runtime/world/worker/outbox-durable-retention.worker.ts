/**
 * 本文件实现后台 worker 或对应冷路径入口，负责把运行态变更异步落库、清理或压缩。
 *
 * 维护时要关注批量大小、重试幂等和中断恢复，不能让后台任务破坏服务端权威状态。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import { DurableOperationService, type DurableOperationRetentionResult } from '../../../persistence/durable-operation.service';
import { OutboxDispatcherService, type OutboxRetentionResult } from '../../../persistence/outbox-dispatcher.service';

const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_BATCH_LIMIT = 1000;
const DEFAULT_MAX_BATCHES_PER_CYCLE = 5;

interface OutboxRetentionPort {
  isEnabled(): boolean;
  retainDeliveredOutbox(input?: { retentionDays?: number; limit?: number }): Promise<OutboxRetentionResult>;
}

interface DurableOperationRetentionPort {
  isEnabled(): boolean;
  retainCommittedOperationLogs(input?: { retentionDays?: number; limit?: number }): Promise<DurableOperationRetentionResult>;
}

@Injectable()
export class OutboxDurableRetentionWorker {
  private readonly logger = new Logger(OutboxDurableRetentionWorker.name);
  private running = false;

  constructor(
    @Inject(OutboxDispatcherService)
    private readonly outboxDispatcherService: OutboxRetentionPort,
    @Inject(DurableOperationService)
    private readonly durableOperationService: DurableOperationRetentionPort,
  ) {}

  async runOnce(input?: { retentionDays?: number; limit?: number; maxBatches?: number }): Promise<number> {
    if (this.running || (!this.outboxDispatcherService.isEnabled() && !this.durableOperationService.isEnabled())) {
      return 0;
    }
    this.running = true;
    const retentionDays = clampPositiveInt(input?.retentionDays, DEFAULT_RETENTION_DAYS, 1, 3650);
    const limit = clampPositiveInt(input?.limit, DEFAULT_BATCH_LIMIT, 1, 10_000);
    const maxBatches = clampPositiveInt(input?.maxBatches, DEFAULT_MAX_BATCHES_PER_CYCLE, 1, 100);
    let totalProcessed = 0;
    try {
      for (let batch = 0; batch < maxBatches; batch += 1) {
        const outboxResult = this.outboxDispatcherService.isEnabled()
          ? await this.outboxDispatcherService.retainDeliveredOutbox({ retentionDays, limit })
          : { deliveredEventsDeleted: 0, consumerDedupeDeleted: 0 };
        const durableResult = this.durableOperationService.isEnabled()
          ? await this.durableOperationService.retainCommittedOperationLogs({ retentionDays, limit })
          : { operationLogsDeleted: 0 };
        const processed = outboxResult.deliveredEventsDeleted
          + outboxResult.consumerDedupeDeleted
          + durableResult.operationLogsDeleted;
        totalProcessed += processed;
        if (processed <= 0) {
          break;
        }
      }
      if (totalProcessed > 0) {
        this.logger.debug(`Outbox/durable retention 完成：processed=${totalProcessed} retentionDays=${retentionDays} limit=${limit}`);
      }
      return totalProcessed;
    } finally {
      this.running = false;
    }
  }
}

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const truncated = Math.trunc(numeric);
  if (truncated < min || truncated > max) {
    return fallback;
  }
  return truncated;
}
