import assert from 'node:assert/strict';

import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { TongtianTowerPersistenceService } from '../persistence/tongtian-tower-persistence.service';

const TONGTIAN_TOWER_PROGRESS_TABLE = 'player_tongtian_tower_progress';

async function main(): Promise<void> {
  const provider = new DatabasePoolProvider();
  const pool = provider.getPool('tongtian_tower_persistence_smoke');
  if (!pool) {
    console.log('tongtian-tower-persistence-smoke skipped: database url not configured');
    return;
  }

  const playerId = `smoke:tongtian:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  try {
    const first = new TongtianTowerPersistenceService(provider);
    await first.onModuleInit();
    await pool.query(`DELETE FROM ${TONGTIAN_TOWER_PROGRESS_TABLE} WHERE player_id = $1`, [playerId]);

    assert.deepEqual(first.getOrCreateProgress(playerId), {
      playerId,
      currentLayer: 1,
      highestLayer: 1,
    });
    first.updateCurrentLayer(playerId, 3);
    first.promoteHighestLayer(playerId, 5);
    await first.flushProgress(playerId);

    const second = new TongtianTowerPersistenceService(provider);
    await second.onModuleInit();
    assert.deepEqual(second.getOrCreateProgress(playerId), {
      playerId,
      currentLayer: 3,
      highestLayer: 5,
    });

    second.updateCurrentLayer(playerId, 2);
    await second.flushProgress(playerId);
    const row = await pool.query(
      `SELECT current_layer, highest_layer FROM ${TONGTIAN_TOWER_PROGRESS_TABLE} WHERE player_id = $1 LIMIT 1`,
      [playerId],
    );
    assert.equal(Number(row.rows[0]?.current_layer), 2);
    assert.equal(Number(row.rows[0]?.highest_layer), 5, '最高层不能被较低 currentLayer 回退');

    console.log('tongtian-tower-persistence-smoke ok');
  } finally {
    await pool.query(`DELETE FROM ${TONGTIAN_TOWER_PROGRESS_TABLE} WHERE player_id = $1`, [playerId]).catch(() => undefined);
    await provider.onModuleDestroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
