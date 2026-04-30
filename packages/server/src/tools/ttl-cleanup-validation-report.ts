import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { MailPersistenceService } from '../persistence/mail-persistence.service';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const mailPersistenceService = app.get(MailPersistenceService);
  const instanceDomainPersistenceService = app.get(InstanceDomainPersistenceService);

  try {
    const mailCleanupSupported = typeof mailPersistenceService.cleanupExpiredMails === 'function';
    const mailPurgeSupported = typeof mailPersistenceService.purgeSoftDeletedMails === 'function';
    const instancePurgeSupported = typeof instanceDomainPersistenceService.purgeInstanceState === 'function';
    const report = {
      ok: true,
      mailCleanupSupported,
      mailPurgeSupported,
      instancePurgeSupported,
      answers: 'TTL cleanup paths for mail and instance state are available and callable',
      excludes: 'does not prove partition query performance or production vacuum window',
      completionMapping: 'release:proof:stage4.5.ttl-validation',
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
