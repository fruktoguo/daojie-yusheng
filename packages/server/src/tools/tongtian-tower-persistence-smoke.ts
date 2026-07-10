import assert from 'node:assert/strict';

import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { TongtianTowerPersistenceService } from '../persistence/tongtian-tower-persistence.service';

const TONGTIAN_TOWER_PROGRESS_TABLE = 'player_tongtian_tower_progress';

async function main(): Promise<void> {
  await proveClosedPoolFailsFinalFlushWithoutWarningStorm();

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

async function proveClosedPoolFailsFinalFlushWithoutWarningStorm(): Promise<void> {
  const service = new TongtianTowerPersistenceService({ getPool: () => null } as never);
  const warnings: string[] = [];
  let queryCount = 0;
  const internal = service as unknown as {
    pool: { query(...args: unknown[]): Promise<never> } | null;
    enabled: boolean;
    logger: { warn(message: unknown): void };
  };
  internal.pool = {
    async query() {
      queryCount += 1;
      throw new Error('Cannot use a pool after calling end on the pool');
    },
  };
  internal.enabled = true;
  internal.logger.warn = (message: unknown) => { warnings.push(String(message)); };

  service.getOrCreateProgress('smoke:tongtian:closed-pool:a');
  service.getOrCreateProgress('smoke:tongtian:closed-pool:b');
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(warnings.length, 1, '普通异步写失败必须按错误去重，不能逐玩家刷屏');
  await assert.rejects(
    () => service.flushAllProgress(),
    /tongtian_tower_persistence_pool_closed/,
  );
  assert.equal(warnings.length, 1, '最终刷盘只向上抛错，由关机协调器统一记录');
  assert.equal(queryCount, 3, '最终刷盘应只用首条探针识别连接池关闭，不能并发逐玩家重试');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
