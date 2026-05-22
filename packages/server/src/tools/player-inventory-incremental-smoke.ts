import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { PlayerDomainPersistenceService } from '../persistence/player-domain-persistence.service';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: '无 DB 时跳过背包增量落盘 smoke；with-db 下会验证同一玩家 inventory 只有数量变化时仅更新 count、只有格子变化时仅更新 slot，并保留未变行的 updated_at。',
          completionMapping: 'player-inventory-incremental-smoke',
        },
        null,
        2,
      ),
    );
    return;
  }

  const playerId = `inventory-incremental-${Date.now().toString(36)}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const databasePoolProvider = new DatabasePoolProvider();
  const service = new PlayerDomainPersistenceService(null, databasePoolProvider);

  await service.onModuleInit();
  assert.equal(service.isEnabled(), true);

  try {
    await cleanupPlayer(pool, playerId);

    const oreItemId = 'smoke_ore';
    const herbItemId = 'smoke_herb';
    const oreInstanceId = `${playerId}-ore`;
    const herbInstanceId = `${playerId}-herb`;

    await service.savePlayerInventoryItems(
      playerId,
      [
        {
          itemId: oreItemId,
          count: 2,
          slotIndex: 1,
          itemInstanceId: oreInstanceId,
          enhanceLevel: 3,
          rawPayload: {
            itemId: oreItemId,
            count: 2,
            enhanceLevel: 3,
          },
        },
        {
          itemId: herbItemId,
          count: 1,
          slotIndex: 2,
          itemInstanceId: herbInstanceId,
          rawPayload: {
            itemId: herbItemId,
            count: 1,
          },
        },
      ],
      { versionSeed: 101 },
    );

    const beforeRows = await fetchInventoryRows(pool, playerId);
    assert.equal(beforeRows.length, 2);
    const beforeOre = requireRow(beforeRows, oreInstanceId);
    const beforeHerb = requireRow(beforeRows, herbInstanceId);

    await delay(25);

    await service.savePlayerInventoryItems(
      playerId,
      [
        {
          itemId: oreItemId,
          count: 5,
          slotIndex: 7,
          itemInstanceId: oreInstanceId,
          enhanceLevel: 3,
          rawPayload: {
            itemId: oreItemId,
            count: 5,
            enhanceLevel: 3,
          },
        },
        {
          itemId: herbItemId,
          count: 1,
          slotIndex: 2,
          itemInstanceId: herbInstanceId,
          rawPayload: {
            itemId: herbItemId,
            count: 1,
          },
        },
      ],
      { versionSeed: 102 },
    );

    const afterRows = await fetchInventoryRows(pool, playerId);
    assert.equal(afterRows.length, 2);
    const afterOre = requireRow(afterRows, oreInstanceId);
    const afterHerb = requireRow(afterRows, herbInstanceId);

    assert.equal(afterOre.slot_index, 7);
    assert.equal(afterOre.count, 5);
    assert.equal(afterOre.item_id, oreItemId);
    assert.ok(afterOre.updated_at_epoch > beforeOre.updated_at_epoch);

    assert.equal(afterHerb.slot_index, 2);
    assert.equal(afterHerb.count, 1);
    assert.equal(afterHerb.item_id, herbItemId);
    assert.equal(afterHerb.updated_at_epoch, beforeHerb.updated_at_epoch);

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerId,
          before: beforeRows,
          after: afterRows,
          answers: '背包增量落盘已按行级 diff 生效：数量变化只更新 count/相关实例 payload，格子变化只移动 slot，未变行保持原 updated_at。',
          completionMapping: 'player-inventory-incremental-smoke',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupPlayer(pool, playerId).catch(() => undefined);
    await service.onModuleDestroy().catch(() => undefined);
    await databasePoolProvider.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupPlayer(pool: Pool, playerId: string): Promise<void> {
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = $1', [playerId]);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = $1', [playerId]);
}

async function fetchInventoryRows(pool: Pool, playerId: string): Promise<Array<{
  item_instance_id: string;
  slot_index: number;
  item_id: string;
  count: number;
  updated_at_epoch: number;
}>> {
  const result = await pool.query(
    `
      SELECT
        item_instance_id,
        slot_index,
        item_id,
        count,
        extract(epoch FROM updated_at)::double precision AS updated_at_epoch
      FROM player_inventory_item
      WHERE player_id = $1
      ORDER BY slot_index ASC, item_instance_id ASC
    `,
    [playerId],
  );
  return (result.rows ?? []).map((row) => ({
    item_instance_id: String(row.item_instance_id ?? ''),
    slot_index: Number(row.slot_index ?? 0),
    item_id: String(row.item_id ?? ''),
    count: Number(row.count ?? 0),
    updated_at_epoch: Number(row.updated_at_epoch ?? 0),
  }));
}

function requireRow(rows: Array<{ item_instance_id: string; slot_index: number; item_id: string; count: number; updated_at_epoch: number }>, itemInstanceId: string) {
  const row = rows.find((entry) => entry.item_instance_id === itemInstanceId);
  if (!row) {
    throw new Error(`missing inventory row: ${itemInstanceId}`);
  }
  return row;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
