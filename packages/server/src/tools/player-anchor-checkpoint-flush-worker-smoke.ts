import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { FlushWakeupService } from '../persistence/flush-wakeup.service';
import { PlayerFlushLedgerService } from '../persistence/player-flush-ledger.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { PlayerAnchorCheckpointFlushWorker } from '../runtime/world/player-anchor-checkpoint-flush.worker';
import { Direction } from '@mud/shared';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证 player anchor/checkpoint worker 会独立认领 player_flush_ledger，并驱动现有 flush 服务完成一次刷盘',
          excludes: '不证明多节点 worker 竞争、完整 dead-letter 或 Redis 唤醒',
          completionMapping: 'release:proof:with-db.player-anchor-checkpoint-flush-worker',
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const ledger = app.get(PlayerFlushLedgerService);
  const wakeup = app.get(FlushWakeupService);
  const runtime = app.get(PlayerRuntimeService);
  const worker = app.get(PlayerAnchorCheckpointFlushWorker);
  const playerId = `worker:${Date.now().toString(36)}`;
  const sessionId = `session:${Date.now().toString(36)}`;
  const playerRevision = 84;

  try {
    await cleanupRows(pool, [playerId]);
    const snapshot = runtime.buildFreshPersistenceSnapshot(playerId, {
      templateId: 'yunlai_town',
      x: 11,
      y: 12,
      facing: Direction.South,
    });
    assert(snapshot);
    runtime.hydrateFromSnapshot(playerId, sessionId, snapshot as never);
    runtime.syncFromWorldView(playerId, sessionId, {
      instance: { instanceId: snapshot.placement.instanceId, templateId: snapshot.placement.templateId },
      self: { x: 15, y: 19, facing: Direction.East },
    });
    runtime.getPlayer(playerId).persistentRevision = playerRevision;

    const dirtyPlayerIds = Array.from(runtime.listDirtyPlayerDomains?.().keys() ?? []);
    assert(dirtyPlayerIds.includes(playerId));
    await ledger.seedDirtyPlayers({
      playerIds: dirtyPlayerIds,
      domain: 'position_checkpoint',
      latestVersion: playerRevision,
    });
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(playerId)));
    const processedCount = await worker.runOnce('player-anchor-checkpoint-worker-smoke');

    const ledgerRows = await ledger.listLedgerRows();
    const targetLedgerRow = ledgerRows.find((row) => row.player_id === playerId && row.domain === 'position_checkpoint');
    assert.equal(Number(targetLedgerRow?.latest_version ?? 0), playerRevision);
    assert.equal(String(targetLedgerRow?.claimed_by ?? ''), '');
    assert.equal(String(targetLedgerRow?.claim_until ?? ''), '');
    assert.equal(Number(targetLedgerRow?.flushed_version ?? 0) >= Number(targetLedgerRow?.latest_version ?? 0), true);

    const checkpointRow = await fetchSingleRow(pool, 'player_position_checkpoint', playerId);
    const anchorRow = await fetchSingleRow(pool, 'player_world_anchor', playerId);
    assert.equal(Boolean(checkpointRow), true);
    assert.equal(Boolean(anchorRow), true);

    console.log(
      JSON.stringify(
        {
          ok: true,
          processedCount,
          playerId,
          anchorRow: Boolean(anchorRow),
          checkpointRow: Boolean(checkpointRow),
          answers: 'player anchor/checkpoint worker 已认领 player_flush_ledger，并驱动现有 flush 服务完成一次刷盘',
          excludes: '不证明多节点 worker 竞争、独立进程调度、完整 dead-letter 或 Redis 唤醒',
          completionMapping: 'release:proof:with-db.player-anchor-checkpoint-flush-worker',
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
  await pool.query('DELETE FROM player_position_checkpoint WHERE player_id = ANY($1::varchar[])', [playerIds]);
  await pool.query('DELETE FROM player_world_anchor WHERE player_id = ANY($1::varchar[])', [playerIds]);
  await pool.query('DELETE FROM server_player_snapshot WHERE player_id = ANY($1::varchar[])', [playerIds]);
}

async function fetchSingleRow(pool: Pool, table: string, playerId: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query(`SELECT * FROM ${table} WHERE player_id = $1 LIMIT 1`, [playerId]);
  return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
