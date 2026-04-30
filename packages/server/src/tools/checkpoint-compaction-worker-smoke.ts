import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

import { Direction } from '@mud/shared';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { FlushWakeupService } from '../persistence/flush-wakeup.service';
import { PlayerFlushLedgerService } from '../persistence/player-flush-ledger.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { CheckpointCompactionWorker } from '../runtime/world/checkpoint-compaction.worker';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证 checkpoint compaction worker 会独立认领 snapshot_checkpoint ledger，并驱动现有 flush 服务完成一次 checkpoint 刷盘',
          excludes: '不证明多节点 worker 竞争、Redis 唤醒或 dead-letter',
          completionMapping: 'release:proof:with-db.checkpoint-compaction-worker',
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
  const ledger = app.get(PlayerFlushLedgerService);
  const wakeup = app.get(FlushWakeupService);
  const runtime = app.get(PlayerRuntimeService);
  const worker = app.get(CheckpointCompactionWorker);
  const playerId = `checkpoint-worker:${Date.now().toString(36)}`;
  const sessionId = `session:${Date.now().toString(36)}`;

  try {
    await cleanupRows(pool, [playerId]);
    const snapshot = runtime.buildFreshPersistenceSnapshot(playerId, {
      templateId: 'yunlai_town',
      x: 8,
      y: 9,
      facing: Direction.South,
    });
    assert(snapshot);
    runtime.hydrateFromSnapshot(playerId, sessionId, snapshot as never);
    runtime.syncFromWorldView(playerId, sessionId, {
      instance: { instanceId: snapshot.placement.instanceId, templateId: snapshot.placement.templateId },
      self: { x: 14, y: 18, facing: Direction.East },
    });
    runtime.grantItem(playerId, 'rat_tail', 1);

    const playerBeforeFlush = runtime.getPlayer(playerId);
    const revisionBeforeFlush = Number(playerBeforeFlush.persistentRevision ?? 0);
    assert.equal(revisionBeforeFlush > Number(playerBeforeFlush.persistedRevision ?? 0), true);

    const processedCount = await worker.runOnce('checkpoint-compaction-worker-smoke');
    assert.equal(processedCount, 1);
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(playerId)));

    const ledgerRows = await ledger.listLedgerRows();
    const targetLedgerRow = ledgerRows.find((row) => row.player_id === playerId && row.domain === 'snapshot_checkpoint');
    assert(targetLedgerRow);
    assert.equal(Number(targetLedgerRow.latest_version ?? 0), revisionBeforeFlush);
    assert.equal(String(targetLedgerRow.claimed_by ?? ''), '');
    assert.equal(String(targetLedgerRow.claim_until ?? ''), '');
    assert.equal(Number(targetLedgerRow.flushed_version ?? 0) >= Number(targetLedgerRow.latest_version ?? 0), true);

    const snapshotRow = await fetchSingleRow(pool, 'server_player_snapshot', playerId);
    assert.equal(Boolean(snapshotRow), true);

    console.log(
      JSON.stringify(
        {
          ok: true,
          processedCount,
          playerId,
          revisionBeforeFlush,
          answers: 'checkpoint compaction worker 已认领 snapshot_checkpoint ledger，并驱动现有 flush 服务完成一次 checkpoint 刷盘',
          excludes: '不证明多节点 worker 竞争、Redis 唤醒或 dead-letter',
          completionMapping: 'release:proof:with-db.checkpoint-compaction-worker',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupRows(pool, [playerId]).catch(() => undefined);
    await app.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupRows(pool: Pool, playerIds: string[]): Promise<void> {
  await pool.query('DELETE FROM player_flush_ledger WHERE player_id = ANY($1::varchar[])', [playerIds]);
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = ANY($1::varchar[])', [playerIds]);
  await pool.query('DELETE FROM player_wallet WHERE player_id = ANY($1::varchar[])', [playerIds]);
  await pool.query('DELETE FROM player_position_checkpoint WHERE player_id = ANY($1::varchar[])', [playerIds]);
  await pool.query('DELETE FROM player_world_anchor WHERE player_id = ANY($1::varchar[])', [playerIds]);
  await pool.query('DELETE FROM player_presence WHERE player_id = ANY($1::varchar[])', [playerIds]);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = ANY($1::varchar[])', [playerIds]);
  await pool.query('DELETE FROM server_player_snapshot WHERE player_id = ANY($1::varchar[])', [playerIds]);
}

async function fetchSingleRow(pool: Pool, table: string, playerId: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query(`SELECT * FROM ${table} WHERE player_id = $1 LIMIT 1`, [playerId]);
  return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
