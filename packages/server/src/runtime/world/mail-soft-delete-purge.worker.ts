import { Inject, Injectable, Logger } from '@nestjs/common';

import { MailPersistenceService } from '../../persistence/mail-persistence.service';

const MAIL_SOFT_DELETE_PURGE_IDLE_MS = 30_000;

interface MailSoftDeletePurgePort {
  purgeSoftDeletedMails(input?: { retentionDays?: number; limit?: number }): Promise<number>;
}

@Injectable()
export class MailSoftDeletePurgeWorker {
  private readonly logger = new Logger(MailSoftDeletePurgeWorker.name);

  constructor(
    @Inject(MailPersistenceService)
    private readonly mailPersistenceService: MailSoftDeletePurgePort,
  ) {}

  async runOnce(limit = 500, retentionDays = 30): Promise<number> {
    const processed = await this.mailPersistenceService.purgeSoftDeletedMails({ retentionDays, limit });
    if (processed > 0) {
      this.logger.log(`邮件软删周期清理完成：processed=${processed}, retentionDays=${retentionDays}, limit=${limit}`);
    }
    return processed;
  }

  async runLoop(idleMs = MAIL_SOFT_DELETE_PURGE_IDLE_MS): Promise<void> {
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
    return MAIL_SOFT_DELETE_PURGE_IDLE_MS;
  }
  return Math.max(250, Math.trunc(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
