import { Inject, Injectable, Logger } from '@nestjs/common';

import { DurableOperationService } from '../../../persistence/durable-operation.service';

const ASSET_AUDIT_LOG_RETENTION_IDLE_MS = 30_000;
const DEFAULT_LIVE_RETENTION_DAYS = 30;
const DEFAULT_ARCHIVE_RETENTION_DAYS = 365;
const DEFAULT_COMBAT_ARCHIVE_RETENTION_DAYS = 90;
const DEFAULT_BATCH_LIMIT = 500;

interface AssetAuditLogRetentionPort {
  archiveOldAssetAuditLogs(input?: { retentionDays?: number; limit?: number }): Promise<number>;
  purgeArchivedAssetAuditLogs(input?: {
    retentionDays?: number;
    combatRetentionDays?: number;
    limit?: number;
  }): Promise<number>;
}

export interface AssetAuditLogRetentionOptions {
  liveRetentionDays?: number;
  archiveRetentionDays?: number;
  combatArchiveRetentionDays?: number;
  archiveBatchLimit?: number;
  purgeBatchLimit?: number;
}

@Injectable()
export class AssetAuditLogRetentionWorker {
  private readonly logger = new Logger(AssetAuditLogRetentionWorker.name);

  constructor(
    @Inject(DurableOperationService)
    private readonly durableOperationService: AssetAuditLogRetentionPort,
  ) {}

  async runOnce(input?: AssetAuditLogRetentionOptions): Promise<number> {
    const liveRetentionDays = clampPositiveInt(
      input?.liveRetentionDays,
      DEFAULT_LIVE_RETENTION_DAYS,
      1,
      3650,
    );
    const archiveRetentionDays = clampPositiveInt(
      input?.archiveRetentionDays,
      DEFAULT_ARCHIVE_RETENTION_DAYS,
      1,
      3650,
    );
    const combatArchiveRetentionDays = Math.min(
      archiveRetentionDays,
      clampPositiveInt(
        input?.combatArchiveRetentionDays,
        DEFAULT_COMBAT_ARCHIVE_RETENTION_DAYS,
        1,
        3650,
      ),
    );
    const archiveBatchLimit = clampPositiveInt(input?.archiveBatchLimit, DEFAULT_BATCH_LIMIT, 1, 10_000);
    const purgeBatchLimit = clampPositiveInt(input?.purgeBatchLimit, DEFAULT_BATCH_LIMIT, 1, 10_000);

    const archived = await this.durableOperationService.archiveOldAssetAuditLogs({
      retentionDays: liveRetentionDays,
      limit: archiveBatchLimit,
    });
    const purged = await this.durableOperationService.purgeArchivedAssetAuditLogs({
      retentionDays: archiveRetentionDays,
      combatRetentionDays: combatArchiveRetentionDays,
      limit: purgeBatchLimit,
    });
    const processed = archived + purged;
    if (processed > 0) {
      this.logger.log(
        `资产审计日志 retention 完成：archived=${archived}, purged=${purged}`
        + `, liveRetentionDays=${liveRetentionDays}, archiveRetentionDays=${archiveRetentionDays}`
        + `, combatArchiveRetentionDays=${combatArchiveRetentionDays}`
        + `, archiveBatchLimit=${archiveBatchLimit}, purgeBatchLimit=${purgeBatchLimit}`,
      );
    }
    return processed;
  }

  async runLoop(idleMs = ASSET_AUDIT_LOG_RETENTION_IDLE_MS): Promise<void> {
    while (true) {
      const processed = await this.runOnce();
      if (processed <= 0) {
        await sleep(resolveIdleMs(idleMs));
      }
    }
  }
}

function resolveIdleMs(value: number): number {
  if (!Number.isFinite(value)) {
    return ASSET_AUDIT_LOG_RETENTION_IDLE_MS;
  }
  return Math.max(250, Math.trunc(value));
}

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
