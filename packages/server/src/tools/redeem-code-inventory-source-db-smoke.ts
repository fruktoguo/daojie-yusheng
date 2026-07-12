import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { resolveServerDatabasePoolerUrl, resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabasePoolerUrl() || resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: '兑换码灵石奖励的背包真源验证需要真实 PostgreSQL',
    }, null, 2));
    return;
  }

  const now = Date.now();
  const playerId = `redeem_inventory_${now.toString(36)}`;
  const runtimeOwnerId = `runtime:${playerId}:1`;
  const operationId = `op:${playerId}:redeem-code:SPIRIT-STONE-SMOKE`;
  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const service = new DurableOperationService({
    getNodeId() {
      return 'node:redeem-inventory-smoke';
    },
  } as never, databasePoolProvider);

  try {
    await service.onModuleInit();
    await cleanupPlayer(pool, playerId);
    await pool.query(
      `
        INSERT INTO player_presence(
          player_id,
          online,
          in_world,
          last_heartbeat_at,
          runtime_owner_id,
          session_epoch,
          updated_at
        )
        VALUES ($1, true, true, $2, $3, 7, now())
      `,
      [playerId, now, runtimeOwnerId],
    );

    const durableInput = {
      operationId,
      playerId,
      expectedRuntimeOwnerId: runtimeOwnerId,
      expectedSessionEpoch: 7,
      expectedInstanceId: null,
      expectedAssignedNodeId: null,
      expectedOwnershipEpoch: null,
      sourceType: 'redeem_code',
      sourceRefId: 'SPIRIT-STONE-SMOKE',
      grantedItems: [{
        itemId: 'spirit_stone',
        count: 4,
        rawPayload: { itemId: 'spirit_stone', count: 4, type: 'currency' },
      }],
      nextInventoryItems: [{
        itemId: 'spirit_stone',
        count: 4,
        rawPayload: { itemId: 'spirit_stone', count: 4, type: 'currency' },
      }],
    };
    const firstResult = await service.grantInventoryItems(durableInput);
    const replayResult = await service.grantInventoryItems(durableInput);

    assert.equal(firstResult.ok, true);
    assert.equal(firstResult.alreadyCommitted, false);
    assert.equal(replayResult.ok, true);
    assert.equal(replayResult.alreadyCommitted, true);

    const inventoryRows = await pool.query(
      'SELECT item_id, count FROM player_inventory_item WHERE player_id = $1 ORDER BY slot_index ASC',
      [playerId],
    );
    const walletRows = await pool.query(
      'SELECT wallet_type, balance FROM player_wallet WHERE player_id = $1',
      [playerId],
    );
    const watermarkRows = await pool.query(
      'SELECT inventory_version, wallet_version FROM player_recovery_watermark WHERE player_id = $1',
      [playerId],
    );
    const operationRows = await pool.query(
      'SELECT status FROM durable_operation_log WHERE operation_id = $1',
      [operationId],
    );

    assert.equal(inventoryRows.rowCount, 1);
    assert.equal(inventoryRows.rows[0]?.item_id, 'spirit_stone');
    assert.equal(Number(inventoryRows.rows[0]?.count), 4);
    assert.equal(walletRows.rowCount, 0, '灵石不得只写入 wallet 镜像表');
    assert.ok(Number(watermarkRows.rows[0]?.inventory_version) > 0);
    assert.equal(Number(watermarkRows.rows[0]?.wallet_version ?? 0), 0);
    assert.equal(operationRows.rows[0]?.status, 'committed');

    console.log(JSON.stringify({
      ok: true,
      case: 'redeem-code-inventory-source-db',
      playerId,
      answers: '真实 PostgreSQL 已证明兑换码灵石奖励只通过一次幂等 inventory grant 写入 player_inventory_item 和 inventory watermark；精确重放不重复，player_wallet 镜像表及 wallet watermark 均未被单独写入',
      excludes: '不证明 live socket、客户端展示或人为修改数据库后的恢复',
      completionMapping: 'release:proof:with-db.redeem-code-inventory-source',
    }, null, 2));
  } finally {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  await pool.query('DELETE FROM outbox_event WHERE partition_key = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM asset_audit_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM durable_operation_log WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_wallet WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = $1', [playerId]).catch(() => undefined);
  await pool.query('DELETE FROM player_presence WHERE player_id = $1', [playerId]).catch(() => undefined);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
