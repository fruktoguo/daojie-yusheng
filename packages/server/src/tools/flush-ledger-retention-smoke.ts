import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { FlushLedgerService } from '../persistence/flush-ledger.service';

const PLAYER_ID = `retention_player_${Date.now().toString(36)}`;
const INSTANCE_ID = `retention_instance_${Date.now().toString(36)}`;
const DOMAIN = `retention_${Date.now().toString(36)}`;

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: 'with-db 下验证 flush ledger retention 会清理 completed payload_jsonb，并删除超过 rowRetentionDays 的 completed 空 payload rows。',
      completionMapping: 'flush-ledger-retention',
    }, null, 2));
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const ledger = new FlushLedgerService({ getPool: () => pool } as never);
  try {
    await ledger.onModuleInit();
    assert.equal(ledger.isEnabled(), true);
    await cleanup(pool);
    const oldTimestamp = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
    await seedRows(pool, oldTimestamp);

    const before = await loadProbeCounts(pool);
    assert.equal(before.playerPayloadRows, 1);
    assert.equal(before.instancePayloadRows, 1);
    assert.equal(before.playerRows, 2);
    assert.equal(before.instanceRows, 2);

    const result = await ledger.retainCompletedFlushLedger({
      payloadRetentionMinutes: 1,
      rowRetentionDays: 1,
      limit: 50,
    });

    const after = await loadProbeCounts(pool);
    assert.ok(result.playerPayloadCleared >= 1, `player payload not cleared: ${JSON.stringify(result)}`);
    assert.ok(result.instancePayloadCleared >= 1, `instance payload not cleared: ${JSON.stringify(result)}`);
    assert.ok(result.playerDeleted >= 1, `player row not deleted: ${JSON.stringify(result)}`);
    assert.ok(result.instanceDeleted >= 1, `instance row not deleted: ${JSON.stringify(result)}`);
    assert.equal(after.playerPayloadRows, 0);
    assert.equal(after.instancePayloadRows, 0);
    assert.ok(after.playerRows <= 1);
    assert.ok(after.instanceRows <= 1);

    console.log(JSON.stringify({
      ok: true,
      result,
      before,
      after,
      answers: 'flush ledger retention 对 completed ledger rows 生效：旧 payload_jsonb 被置空，超过行保留期的 completed 空 payload rows 被删除。',
      completionMapping: 'flush-ledger-retention',
    }, null, 2));
  } finally {
    await cleanup(pool).catch(() => undefined);
    await ledger.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function seedRows(pool: Pool, updatedAt: string): Promise<void> {
  await pool.query(`
    INSERT INTO player_flush_ledger(player_id, domain, priority, latest_version, flushed_version, dirty_since_at, next_attempt_at, payload_jsonb, updated_at)
    VALUES
      ($1, $3, 'normal', 10, 10, NULL, NULL, $5::jsonb, $4),
      ($2, $3, 'normal', 10, 10, NULL, NULL, NULL, $4)
  `, [PLAYER_ID, `${PLAYER_ID}_delete`, DOMAIN, updatedAt, JSON.stringify({ marker: PLAYER_ID })]);
  await pool.query(`
    INSERT INTO instance_flush_ledger(instance_id, domain, ownership_epoch, priority, latest_version, flushed_version, dirty_since_at, next_attempt_at, payload_jsonb, updated_at)
    VALUES
      ($1, $3, 1, 'normal', 10, 10, NULL, NULL, $5::jsonb, $4),
      ($2, $3, 1, 'normal', 10, 10, NULL, NULL, NULL, $4)
  `, [INSTANCE_ID, `${INSTANCE_ID}_delete`, DOMAIN, updatedAt, JSON.stringify({ marker: INSTANCE_ID })]);
}

async function loadProbeCounts(pool: Pool): Promise<Record<string, number>> {
  const player = await pool.query(
    'SELECT COUNT(*)::int AS rows, COUNT(*) FILTER (WHERE payload_jsonb IS NOT NULL)::int AS payload_rows FROM player_flush_ledger WHERE domain = $1',
    [DOMAIN],
  );
  const instance = await pool.query(
    'SELECT COUNT(*)::int AS rows, COUNT(*) FILTER (WHERE payload_jsonb IS NOT NULL)::int AS payload_rows FROM instance_flush_ledger WHERE domain = $1',
    [DOMAIN],
  );
  return {
    playerRows: Number(player.rows[0]?.rows ?? 0),
    playerPayloadRows: Number(player.rows[0]?.payload_rows ?? 0),
    instanceRows: Number(instance.rows[0]?.rows ?? 0),
    instancePayloadRows: Number(instance.rows[0]?.payload_rows ?? 0),
  };
}

async function cleanup(pool: Pool): Promise<void> {
  await pool.query('DELETE FROM player_flush_ledger WHERE domain = $1', [DOMAIN]).catch(() => undefined);
  await pool.query('DELETE FROM instance_flush_ledger WHERE domain = $1', [DOMAIN]).catch(() => undefined);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
