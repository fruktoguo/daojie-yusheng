/**
 * 本文件实现后台 worker 或对应冷路径入口，负责把运行态变更异步落库、清理或压缩。
 *
 * 维护时要关注批量大小、重试幂等和中断恢复，不能让后台任务破坏服务端权威状态。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import { MailPersistenceService } from '../../../persistence/mail-persistence.service';

const MAIL_EXPIRATION_IDLE_MS = 5_000;

interface MailExpirationCleanupPort {
  cleanupExpiredMails(limit?: number): Promise<number>;
}

@Injectable()
export class MailExpirationCleanupWorker {
  private readonly logger = new Logger(MailExpirationCleanupWorker.name);

  constructor(
    @Inject(MailPersistenceService)
    private readonly mailPersistenceService: MailExpirationCleanupPort,
  ) {}

  async runOnce(limit = 64): Promise<number> {
    const processed = await this.mailPersistenceService.cleanupExpiredMails(limit);
    if (processed > 0) {
      this.logger.log(`邮件过期清理完成：processed=${processed}`);
    }
    return processed;
  }

  async runLoop(idleMs = MAIL_EXPIRATION_IDLE_MS): Promise<void> {
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
    return MAIL_EXPIRATION_IDLE_MS;
  }
  return Math.max(250, Math.trunc(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
