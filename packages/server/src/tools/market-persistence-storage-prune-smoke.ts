import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MarketPersistenceService } from '../persistence/market-persistence.service';

async function main(): Promise<void> {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const service = new MarketPersistenceService(null);

  await service.persistStructuredStorages(
    client,
    [
      {
        playerId: 'player:market:1',
        storage: {
          items: [
            { itemId: 'spirit_stone', count: 3 },
            { itemId: 'iron_sword', count: 1, enhanceLevel: 2 },
          ],
        },
      },
      {
        playerId: 'player:market:2',
        storage: {
          items: [],
        },
      },
    ],
    [],
  );

  const normalizedQueries = queries.map((entry) => entry.sql.replace(/\s+/g, ' ').trim());
  assert.equal(
    normalizedQueries.some((query) => query === 'DELETE FROM player_market_storage_item WHERE player_id = ANY($1::varchar[])'),
    false,
    'upsert market storage path must not delete whole player warehouses before insert',
  );
  assert.equal(
    normalizedQueries.some((query) => query.includes('ON CONFLICT (storage_item_id)') && query.includes('DO UPDATE SET')),
    true,
    'market storage upsert path must use row-level ON CONFLICT updates',
  );
  assert.equal(
    normalizedQueries.filter((query) => query.includes('DELETE FROM player_market_storage_item target')
      && query.includes('jsonb_to_recordset')
      && query.includes('NOT EXISTS')).length,
    2,
    'market storage upsert path must prune stale slots once per upserted player',
  );

  const deletionQueries: string[] = [];
  const deletionClient = {
    async query(sql: string): Promise<{ rows: unknown[] }> {
      deletionQueries.push(sql.replace(/\s+/g, ' ').trim());
      return { rows: [] };
    },
  };
  await service.persistStructuredStorages(deletionClient, [], ['player:market:deleted']);
  assert.equal(
    deletionQueries.some((query) => query === 'DELETE FROM player_market_storage_item WHERE player_id = ANY($1::varchar[])'),
    true,
    'explicit market storage deletion must keep whole-player clear semantics',
  );

  console.log(JSON.stringify({
    ok: true,
    answers: '证明 MarketPersistenceService.persistStructuredStorages 的 upsert 玩家路径不再先 DELETE 整玩家托管仓，而是 storage_item_id 行级 UPSERT 后按当前 slot_index 快照删除 stale 行；显式 deleteStoragePlayerIds 仍保留整玩家清空语义。',
    excludes: '不证明真实 PostgreSQL 回读，也不覆盖 PlayerDomainPersistenceService / DurableOperationService 内的同名 player_market_storage_item 写入路径。',
    completionMapping: 'release:proof:market-persistence-storage-prune',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
