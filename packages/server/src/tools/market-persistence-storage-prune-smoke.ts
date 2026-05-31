import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { MarketPersistenceService } from '../persistence/market-persistence.service';

async function main(): Promise<void> {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
      queries.push({ sql, params });
      return { rows: [], rowCount: 1 };
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
    normalizedQueries.some((query) => query.includes('DELETE FROM player_market_storage_item')
      && query.includes('slot_index = $2')
      && query.includes('storage_item_id <> $3')),
    false,
    'market storage upsert path must not keep runtime legacy storage_item_id repair logic',
  );
  assert.equal(
    normalizedQueries.some((query) => query.includes('ON CONFLICT (storage_item_id)')
      && query.includes('WHERE player_market_storage_item.player_id = EXCLUDED.player_id')),
    true,
    'market storage upsert path must not move storage_item_id rows across owners',
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

  const crossOwnerConflictClient = {
    async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
      queries.push({ sql, params });
      return {
        rows: [],
        rowCount: sql.includes('ON CONFLICT (storage_item_id)') ? 0 : 1,
      };
    },
  };
  await assert.rejects(
    service.persistStructuredStorages(
      crossOwnerConflictClient,
      [
        {
          playerId: 'player:market:conflict',
          storage: {
            items: [
              { itemId: 'spirit_stone', count: 1 },
            ],
          },
        },
      ],
      [],
    ),
    /persistStructuredStorages: storage_item_id conflict outside player scope/,
    'market storage upsert must reject cross-owner storage_item_id conflicts',
  );

  console.log(JSON.stringify({
    ok: true,
    answers: '证明 MarketPersistenceService.persistStructuredStorages 的 upsert 玩家路径不再先 DELETE 整玩家托管仓，也不在运行时自动修复 legacy storage_item_id；它只用带 owner guard 的 storage_item_id 行级 UPSERT，最后按当前 slot_index 快照删除 stale 行；显式 deleteStoragePlayerIds 仍保留整玩家清空语义；跨玩家 storage_item_id 冲突会被拒绝。',
    excludes: '不证明真实 PostgreSQL 回读，也不覆盖 PlayerDomainPersistenceService / DurableOperationService 内的同名 player_market_storage_item 写入路径。',
    completionMapping: 'release:proof:market-persistence-storage-prune',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
