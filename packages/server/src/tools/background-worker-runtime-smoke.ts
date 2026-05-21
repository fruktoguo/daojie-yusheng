import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { BackgroundWorkerRuntimeService } from '../runtime/worker/background-worker-runtime.service';

async function main(): Promise<void> {
  const previousRole = process.env.SERVER_RUNTIME_ROLE;
  const previousOutbox = process.env.SERVER_OUTBOX_RUNTIME_ENABLED;
  const previousServerDatabaseUrl = process.env.SERVER_DATABASE_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.SERVER_RUNTIME_ROLE = 'worker';
  process.env.SERVER_OUTBOX_RUNTIME_ENABLED = '1';
  delete process.env.SERVER_DATABASE_URL;
  delete process.env.DATABASE_URL;

  let outboxCalls = 0;
  let mailExpirationCalls = 0;
  const orchestrator = new BackgroundWorkerRuntimeService(
    { runOnce: async () => 0 } as never,
    {
      isRuntimeEnabled: () => true,
      dispatchPendingEvents: async () => {
        outboxCalls += 1;
        return 2;
      },
    } as never,
    undefined,
    { runOnce: async () => { mailExpirationCalls += 1; return 1; } } as never,
    undefined,
    undefined,
    undefined,
  );

  try {
    orchestrator.onModuleInit();
    await sleep(20);
    const states = orchestrator.listWorkerStates();
    const outbox = states.find((state) => state.id === 'outbox-dispatcher');
    const mailExpiration = states.find((state) => state.id === 'mail-expiration-cleanup');
    const flush = states.find((state) => state.id === 'flush-task-consumer');
    const backup = states.find((state) => state.id === 'database-backup');
    assert.equal(outbox?.enabled, true);
    assert.equal(mailExpiration?.enabled, true);
    assert.equal(flush?.enabled, false);
    assert.equal(backup?.enabled, false);
    assert.ok((outbox?.processedCount ?? 0) >= 2);
    assert.ok((mailExpiration?.processedCount ?? 0) >= 1);
    assert.ok(outboxCalls >= 1);
    assert.ok(mailExpirationCalls >= 1);
    const serverRoot = process.cwd();
    const backupTool = fs.readFileSync(path.join(serverRoot, 'src/tools/database-backup-worker.ts'), 'utf8');
    const orchestratorSource = fs.readFileSync(path.join(serverRoot, 'src/runtime/worker/background-worker-runtime.service.ts'), 'utf8');
    assert.ok(backupTool.includes('export async function runDatabaseBackupWorkerOnce'));
    assert.ok(backupTool.includes('if (require.main === module)'));
    assert.ok(orchestratorSource.includes('runDatabaseBackupWorkerOnce'));
  } finally {
    orchestrator.onModuleDestroy();
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_OUTBOX_RUNTIME_ENABLED', previousOutbox);
    restoreEnv('SERVER_DATABASE_URL', previousServerDatabaseUrl);
    restoreEnv('DATABASE_URL', previousDatabaseUrl);
  }

  console.log(JSON.stringify({
    ok: true,
    answers: '后台 worker orchestrator 能在 worker role 下调度已启用任务，记录 heartbeat/status/processedCount；database backup 已抽出 runOnce 端口并由 orchestrator 引用。',
    excludes: '不证明 durable staging payload、真实数据库备份可生成或 with-db 多副本竞争。',
    completionMapping: 'background-worker-orchestrator',
  }, null, 2));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
