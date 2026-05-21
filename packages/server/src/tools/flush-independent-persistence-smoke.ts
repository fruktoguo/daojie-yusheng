import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

async function main(): Promise<void> {
  const mailRuntime = readSource('src/runtime/mail/mail-runtime.service.ts');
  const mailPersistence = readSource('src/persistence/mail-persistence.service.ts');
  const gmPlayer = readSource('src/http/native/native-gm-player.service.ts');
  const flushRuntime = readSource('src/persistence/flush-task-runtime.service.ts');
  const noopRetrySmoke = readSource('src/tools/flush-task-noop-retry-smoke.ts');

  assert.match(mailRuntime, /mailPersistenceService\.saveMailboxMutation\(/);
  assert.match(mailRuntime, /mailPersistenceService\.saveMailbox\(/);
  assert.match(mailRuntime, /mailboxWriteByPlayerId = new Map\(\)/);
  assert.match(mailPersistence, /async saveMailboxMutation\(/);
  assert.match(mailPersistence, /upsertStructuredMails/);
  assert.match(mailPersistence, /pruneStructuredMailboxSnapshot|upsertMailRecoveryWatermark/);

  assert.match(gmPlayer, /savePlayerPersistenceSnapshotForGmUpdate\(/);
  assert.match(gmPlayer, /savePlayerPersistenceSnapshot\(/);
  assert.match(gmPlayer, /recordGmAuditEntry\(/);

  assert.doesNotMatch(flushRuntime, /PLAYER_MAILBOX_PAYLOAD_KIND/);
  assert.doesNotMatch(flushRuntime, /PLAYER_GM_EDIT_PAYLOAD_KIND/);
  assert.match(noopRetrySmoke, /domain: 'mail'/);
  assert.match(noopRetrySmoke, /playerRuntimeFallbackCount, 0/);

  console.log(JSON.stringify({
    ok: true,
    answers: 'mail 由 MailRuntimeService -> MailPersistenceService 直写结构化真源；GM edit 由 NativeGmPlayerService 直写玩家快照并记录审计；二者没有伪装为 flush staging payload。',
    workerBoundary: 'flush-task-noop-retry smoke 覆盖 unsupported player domain 在 worker role 下只 retry，不回退 runtime flush。',
    completionMapping: 'flush-independent-persistence',
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
