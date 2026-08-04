import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { reconcilePostgresRestoreMissingPlayerPresenceInTransaction } from '../http/native/native-postgres-restore-cleanup';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  const migrationSource = readFileSync(
    resolveSourcePath('packages/server/src/tools/import-legacy-persistence-once.ts'),
    'utf8',
  );
  const gmStateSource = readFileSync(
    resolveSourcePath('packages/server/src/http/native/native-gm-state-query.service.ts'),
    'utf8',
  );
  const restoreSource = readFileSync(
    resolveSourcePath('packages/server/src/http/native/native-postgres-backup.ts'),
    'utf8',
  );
  const restoreCleanupSource = readFileSync(
    resolveSourcePath('packages/server/src/http/native/native-postgres-restore-cleanup.ts'),
    'utf8',
  );

  assert.ok(
    migrationSource.includes('savePlayerPresence(entry.playerId'),
    'expected legacy player-domain import to seed player_presence',
  );
  assert.ok(
    migrationSource.includes('inWorld: Boolean(entry.snapshot.placement?.templateId)'),
    'expected imported player presence to preserve offline hanging inWorld=true when placement exists',
  );
  assert.ok(
    gmStateSource.includes('LEFT JOIN player_presence presence ON presence.player_id = rw.player_id'),
    'expected GM player summaries to read player_presence',
  );
  assert.ok(
    gmStateSource.includes('COALESCE(presence.in_world, position.player_id IS NOT NULL) AS in_world'),
    'expected GM player summaries to fall back to checkpoint presence for pre-fix imports',
  );
  assert.ok(
    restoreSource.includes('await reconcilePostgresRestoreMissingPlayerPresence(databaseUrl)'),
    'expected PostgreSQL restore to reconcile missing player presence before handoff',
  );
  assert.ok(
    restoreCleanupSource.includes(`INSERT INTO \${PLAYER_PRESENCE_TABLE}`),
    'expected restore reconciliation to materialize player_presence',
  );
  assert.ok(
    restoreCleanupSource.includes('offline_gain.started_at'),
    'expected restore reconciliation to preserve the offline gain session start',
  );
  assert.ok(
    restoreCleanupSource.includes('EXTRACT(EPOCH FROM position.updated_at)'),
    'expected restore reconciliation to fall back to the checkpoint timestamp',
  );

  const databaseProof = databaseUrl.trim()
    ? await proveDatabaseReconciliation(databaseUrl)
    : { skipped: true, reason: 'SERVER_DATABASE_URL/DATABASE_URL missing' };

  console.log(JSON.stringify({
    ok: true,
    case: 'offline-hanging-presence-import',
    databaseProof,
    answers: '旧快照迁移与 PostgreSQL 恢复都会补齐缺失的 player_presence；恢复后优先保留离线收益会话起点，否则沿用位置 checkpoint 时间，已有 presence 不覆盖且重复执行幂等。GM 摘要在旧数据尚未转换时仍按位置保留离线挂机展示。',
    excludes: '不证明真实 pg_restore 外部进程、服务端完整重启或客户端渲染；未配置数据库时只验证源码合同，配置数据库时会在临时表事务中验证补齐行为。',
    completionMapping: 'release:proof:offline-hanging-presence-import',
  }, null, 2));
}

async function proveDatabaseReconciliation(connectionString: string): Promise<Record<string, unknown>> {
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const sessionPlayerId = `player:presence-session:${suffix}`;
  const checkpointPlayerId = `player:presence-checkpoint:${suffix}`;
  const offlinePlayerId = `player:presence-offline:${suffix}`;
  const existingPlayerId = `player:presence-existing:${suffix}`;
  const sessionStartedAt = 1_780_000_000_123;
  const checkpointUpdatedAt = 1_780_000_100_456;
  try {
    await client.query('BEGIN');
    await createTemporaryProjectionTables(client);
    await client.query(
      `INSERT INTO player_recovery_watermark(player_id)
       VALUES ($1), ($2), ($3), ($4)`,
      [sessionPlayerId, checkpointPlayerId, offlinePlayerId, existingPlayerId],
    );
    await client.query(
      `INSERT INTO player_position_checkpoint(player_id, instance_id, updated_at)
       VALUES
         ($1, 'public:session', to_timestamp($4 / 1000.0)),
         ($2, 'public:checkpoint', to_timestamp($5 / 1000.0)),
         ($3, 'public:existing', to_timestamp($5 / 1000.0))`,
      [sessionPlayerId, checkpointPlayerId, existingPlayerId, sessionStartedAt + 10_000, checkpointUpdatedAt],
    );
    await client.query(
      `INSERT INTO player_offline_gain_session(player_id, started_at) VALUES ($1, $2)`,
      [sessionPlayerId, sessionStartedAt],
    );
    await client.query(
      `INSERT INTO player_presence(
         player_id, online, in_world, offline_since_at, runtime_owner_id, session_epoch
       ) VALUES ($1, true, false, 999, 'existing-owner', 7)`,
      [existingPlayerId],
    );

    const report = await reconcilePostgresRestoreMissingPlayerPresenceInTransaction(client);
    assert.deepEqual(report, {
      supported: true,
      seededRows: 3,
      seededInWorldRows: 2,
      seededOfflineRows: 1,
    });
    const presenceResult = await client.query(
      `SELECT player_id, online, in_world, offline_since_at, runtime_owner_id, session_epoch
       FROM player_presence
       ORDER BY player_id ASC`,
    );
    const presenceByPlayerId = new Map<string, Record<string, unknown>>(
      presenceResult.rows.map((row) => [String(row.player_id), row]),
    );
    assertPresence(presenceByPlayerId.get(sessionPlayerId), {
      online: false,
      inWorld: true,
      offlineSinceAt: sessionStartedAt,
      runtimeOwnerId: null,
      sessionEpoch: 1,
    });
    assertPresence(presenceByPlayerId.get(checkpointPlayerId), {
      online: false,
      inWorld: true,
      offlineSinceAt: checkpointUpdatedAt,
      runtimeOwnerId: null,
      sessionEpoch: 1,
    });
    assertPresence(presenceByPlayerId.get(offlinePlayerId), {
      online: false,
      inWorld: false,
      offlineSinceAt: null,
      runtimeOwnerId: null,
      sessionEpoch: 1,
    });
    assertPresence(presenceByPlayerId.get(existingPlayerId), {
      online: true,
      inWorld: false,
      offlineSinceAt: 999,
      runtimeOwnerId: 'existing-owner',
      sessionEpoch: 7,
    });

    const idempotentReport = await reconcilePostgresRestoreMissingPlayerPresenceInTransaction(client);
    assert.deepEqual(idempotentReport, {
      supported: true,
      seededRows: 0,
      seededInWorldRows: 0,
      seededOfflineRows: 0,
    });
    await client.query('ROLLBACK');
    return { report, idempotentReport, temporaryTables: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

async function createTemporaryProjectionTables(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TEMP TABLE player_recovery_watermark (
      player_id varchar(100) PRIMARY KEY
    ) ON COMMIT DROP;
    CREATE TEMP TABLE player_position_checkpoint (
      player_id varchar(100) PRIMARY KEY,
      instance_id varchar(160) NOT NULL,
      updated_at timestamptz NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE player_offline_gain_session (
      player_id varchar(100) PRIMARY KEY,
      started_at bigint NOT NULL
    ) ON COMMIT DROP;
    CREATE TEMP TABLE player_presence (
      player_id varchar(100) PRIMARY KEY,
      online boolean NOT NULL DEFAULT false,
      in_world boolean NOT NULL DEFAULT false,
      last_heartbeat_at bigint,
      offline_since_at bigint,
      runtime_owner_id varchar(180),
      session_epoch bigint NOT NULL DEFAULT 1,
      transfer_state varchar(32),
      transfer_target_node_id varchar(120),
      updated_at timestamptz NOT NULL DEFAULT now()
    ) ON COMMIT DROP
  `);
}

function assertPresence(
  row: Record<string, unknown> | undefined,
  expected: {
    online: boolean;
    inWorld: boolean;
    offlineSinceAt: number | null;
    runtimeOwnerId: string | null;
    sessionEpoch: number;
  },
): void {
  assert.ok(row);
  assert.equal(row.online, expected.online);
  assert.equal(row.in_world, expected.inWorld);
  assert.equal(row.offline_since_at == null ? null : Number(row.offline_since_at), expected.offlineSinceAt);
  assert.equal(row.runtime_owner_id ?? null, expected.runtimeOwnerId);
  assert.equal(Number(row.session_epoch), expected.sessionEpoch);
}

function resolveSourcePath(relativePath: string): string {
  return `${process.cwd()}/${relativePath}`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
