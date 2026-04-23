import { Inject, Injectable, Logger } from '@nestjs/common';

import { DurableOperationService } from '../../persistence/durable-operation.service';

const ASSET_AUDIT_LOG_RETENTION_IDLE_MS = 30_000;

interface AssetAuditLogRetentionPort {
  archiveOldAssetAuditLogs(input?: { retentionDays?: number; limit?: number }): Promise<number>;
}

@Injectable()
export class AssetAuditLogRetentionWorker {
  private readonly logger = new Logger(AssetAuditLogRetentionWorker.name);

  constructor(
    @Inject(DurableOperationService)
    private readonly durableOperationService: AssetAuditLogRetentionPort,
  ) {}

  async runOnce(limit = 500, retentionDays = 30): Promise<number> {
    const processed = await this.durableOperationService.archiveOldAssetAuditLogs({ retentionDays, limit });
    if (processed > 0) {
      this.logger.log(`资产审计日志归档完成：processed=${processed}, retentionDays=${retentionDays}, limit=${limit}`);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
