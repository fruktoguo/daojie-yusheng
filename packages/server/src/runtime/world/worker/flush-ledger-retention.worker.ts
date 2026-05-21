import { Inject, Injectable, Logger } from '@nestjs/common';

import { FlushLedgerService, type FlushLedgerRetentionResult } from '../../../persistence/flush-ledger.service';

const DEFAULT_PAYLOAD_RETENTION_MINUTES = 10;
const DEFAULT_ROW_RETENTION_DAYS = 1;
const DEFAULT_BATCH_LIMIT = 500;
const DEFAULT_MAX_BATCHES_PER_CYCLE = 5;

interface FlushLedgerRetentionPort {
  isEnabled(): boolean;
  retainCompletedFlushLedger(input?: {
    payloadRetentionMinutes?: number;
    rowRetentionDays?: number;
    limit?: number;
  }): Promise<FlushLedgerRetentionResult>;
}

@Injectable()
export class FlushLedgerRetentionWorker {
  private readonly logger = new Logger(FlushLedgerRetentionWorker.name);
  private running = false;

  constructor(
    @Inject(FlushLedgerService)
    private readonly flushLedgerService: FlushLedgerRetentionPort,
  ) {}

  async runOnce(input?: {
    payloadRetentionMinutes?: number;
    rowRetentionDays?: number;
    limit?: number;
    maxBatches?: number;
  }): Promise<number> {
    if (this.running || !this.flushLedgerService.isEnabled()) {
      return 0;
    }
    this.running = true;
    const payloadRetentionMinutes = clampPositiveInt(
      input?.payloadRetentionMinutes,
      DEFAULT_PAYLOAD_RETENTION_MINUTES,
      1,
      24 * 60,
    );
    const rowRetentionDays = clampPositiveInt(input?.rowRetentionDays, DEFAULT_ROW_RETENTION_DAYS, 1, 365);
    const limit = clampPositiveInt(input?.limit, DEFAULT_BATCH_LIMIT, 1, 10_000);
    const maxBatches = clampPositiveInt(input?.maxBatches, DEFAULT_MAX_BATCHES_PER_CYCLE, 1, 100);
    let totalProcessed = 0;
    try {
      for (let batch = 0; batch < maxBatches; batch += 1) {
        const result = await this.flushLedgerService.retainCompletedFlushLedger({
          payloadRetentionMinutes,
          rowRetentionDays,
          limit,
        });
        const processed = result.playerPayloadCleared
          + result.instancePayloadCleared
          + result.playerDeleted
          + result.instanceDeleted;
        totalProcessed += processed;
        if (processed < limit) {
          break;
        }
      }
      if (totalProcessed > 0) {
        this.logger.log(
          `刷盘账本 retention 完成：processed=${totalProcessed} `
          + `payloadRetentionMinutes=${payloadRetentionMinutes} rowRetentionDays=${rowRetentionDays} limit=${limit}`,
        );
      }
    } finally {
      this.running = false;
    }
    return totalProcessed;
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
