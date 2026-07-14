import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function main(): void {
  const serverRoot = process.cwd();
  const ledger = fs.readFileSync(path.join(serverRoot, 'src/persistence/flush-ledger.service.ts'), 'utf8');
  const types = fs.readFileSync(path.join(serverRoot, 'src/persistence/flush-task.types.ts'), 'utf8');
  const requiredColumns = [
    'runtime_owner_id',
    'fencing_token',
    'idempotency_key',
    'payload_jsonb',
    'failure_category',
    'retry_after',
    'created_at',
    'claim_until',
  ];
  for (const column of requiredColumns) {
    assert.ok(ledger.includes(column), `flush ledger schema missing ${column}`);
  }
  const requiredTaskFields = [
    'runtimeOwnerId',
    'fencingToken',
    'idempotencyKey',
    'payloadJson',
    'failureCategory',
    'createdAt',
  ];
  for (const field of requiredTaskFields) {
    assert.ok(types.includes(field), `FlushTask missing ${field}`);
  }
  assert.match(ledger, /FOR UPDATE SKIP LOCKED/);
  assert.match(ledger, /buildFlushTaskIdempotencyKey/);
  assert.match(ledger, /JSON\.stringify\(batch\)/);
  assert.match(ledger, /ORDER BY player_id ASC, domain ASC/);
  assert.match(ledger, /ORDER BY instance_id ASC, domain ASC, ownership_epoch ASC/);
  assert.match(ledger, /FOR UPDATE OF ledger/);
  console.log(JSON.stringify({
    ok: true,
    answers: 'flush ledger 已具备 durable staging 所需字段，并约束玩家/实例批量 staging、claim、续租、重试与确认统一按账本主键锁行。',
    excludes: '不证明各 player/instance domain 已完成 payload projector，也不替代 with-db claim proof。',
    completionMapping: 'flush-staging-schema',
  }, null, 2));
}

main();
