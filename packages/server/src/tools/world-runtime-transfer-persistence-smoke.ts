import assert from 'node:assert/strict';

import { Direction } from '@mud/shared';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { PlayerFlushLedgerService } from '../persistence/player-flush-ledger.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { PlayerAnchorCheckpointFlushWorker } from '../runtime/world/player-anchor-checkpoint-flush.worker';
import { WorldRuntimeTransferService } from '../runtime/world/world-runtime-transfer.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers:
            'with-db 下可验证 transfer 落点打脏 world_anchor/position_checkpoint 后，会经 player_flush_ledger 与 anchor/checkpoint worker 刷进数据库真源',
          excludes: '不证明真实多节点 socket redirect、完整 transfer 协议消息格式或 route handoff',
          completionMapping: 'release:proof:with-db.world-runtime-transfer.persistence',
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const runtime = app.get(PlayerRuntimeService);
  const ledger = app.get(PlayerFlushLedgerService);
  const worker = app.get(PlayerAnchorCheckpointFlushWorker);
  const transferService = new WorldRuntimeTransferService();
  const playerId = `transfer:persistence:${Date.now().toString(36)}`;
  const sessionId = `session:${Date.now().toString(36)}`;

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

    const beforeDirtyDomains = runtime.listDirtyPlayerDomains().get(playerId) ?? new Set<string>();
    assert.equal(beforeDirtyDomains.has('world_anchor'), false);
    assert.equal(beforeDirtyDomains.has('position_checkpoint'), false);

    transferService.applyTransfer(
      {
        playerId,
        sessionId,
        fromInstanceId: snapshot.placement.instanceId,
        targetMapId: 'yunlai_town',
        targetX: 44,
        targetY: 18,
        reason: 'portal',
      },
      {
        getInstanceRuntime(instanceId: string) {
          if (instanceId !== snapshot.placement.instanceId) {
            return null;
          }
          return {
            disconnectPlayer() {
              return undefined;
            },
          };
        },
        getOrCreateDefaultLineInstance() {
          return {
            meta: { instanceId: 'public:yunlai_town:real' },
            connectPlayer() {
              return undefined;
            },
            setPlayerMoveSpeed() {
              return undefined;
            },
          };
        },
        getOrCreatePublicInstance() {
          throw new Error('unexpected public instance fallback');
        },
        setPlayerLocation() {
          return undefined;
        },
        getPlayerViewOrThrow() {
          return {
            instance: {
              instanceId: 'public:yunlai_town:real',
              templateId: 'yunlai_town',
            },
            self: {
              x: 44,
              y: 18,
              facing: Direction.East,
            },
          };
        },
        playerRuntimeService: runtime,
        worldRuntimeNavigationService: {
          handleTransfer() {
            return undefined;
          },
        },
      } as never,
    );

    const dirtyDomains = runtime.listDirtyPlayerDomains().get(playerId) ?? new Set<string>();
    assert.ok(dirtyDomains.has('world_anchor'));
    assert.ok(dirtyDomains.has('position_checkpoint'));
    const latestVersion = runtime.getPersistenceRevision(playerId);
    assert.ok(Number(latestVersion) > 0);

    await ledger.seedDirtyPlayers({
      playerIds: [playerId],
      domain: 'position_checkpoint',
      latestVersion: Number(latestVersion),
    });
    const processedCount = await worker.runOnce('world-runtime-transfer-persistence-smoke');

    const checkpointRow = await fetchSingleRow(pool, 'player_position_checkpoint', playerId);
    const anchorRow = await fetchSingleRow(pool, 'player_world_anchor', playerId);
    const ledgerRows = await ledger.listLedgerRows();
    const ledgerRow = ledgerRows.find((row) => row.player_id === playerId && row.domain === 'position_checkpoint');

    assert.ok(processedCount >= 1);
    assert.equal(checkpointRow?.instance_id, 'public:yunlai_town:real');
    assert.equal(Number(checkpointRow?.x ?? -1), 44);
    assert.equal(Number(checkpointRow?.y ?? -1), 18);
    assert.equal(Number(checkpointRow?.facing ?? -1), Direction.East);
    assert.equal(anchorRow?.respawn_template_id, 'yunlai_town');
    assert.equal(anchorRow?.respawn_instance_id, 'public:yunlai_town:real');
    assert.equal(Number(anchorRow?.respawn_x ?? -1), 44);
    assert.equal(Number(anchorRow?.respawn_y ?? -1), 18);
    assert.equal(anchorRow?.last_safe_template_id, 'yunlai_town');
    assert.equal(anchorRow?.last_safe_instance_id, 'public:yunlai_town:real');
    assert.equal(Number(anchorRow?.last_safe_x ?? -1), 44);
    assert.equal(Number(anchorRow?.last_safe_y ?? -1), 18);
    assert.equal(Number(ledgerRow?.latest_version ?? 0), Number(latestVersion));
    assert.equal(Number(ledgerRow?.flushed_version ?? 0) >= Number(ledgerRow?.latest_version ?? 0), true);

    console.log(
      JSON.stringify(
        {
          ok: true,
          processedCount,
          playerId,
          latestVersion,
          answers:
            'with-db 下现已直接证明 transfer 落点打脏 world_anchor/position_checkpoint 后，会经 player_flush_ledger 与 anchor/checkpoint worker 刷进 player_world_anchor/player_position_checkpoint 真源',
          excludes:
            '不证明真实多节点 socket redirect、完整 transfer 协议消息格式、route handoff 或跨节点数据库写回时序',
          completionMapping: 'release:proof:with-db.world-runtime-transfer.persistence',
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
