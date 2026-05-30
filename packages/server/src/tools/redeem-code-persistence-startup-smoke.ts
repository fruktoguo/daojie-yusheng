import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

async function main(): Promise<void> {
  process.env.SERVER_SKIP_LOCAL_ENV_AUTOLOAD = '1';
  process.env.SERVER_DATABASE_URL = 'postgresql://redeem-smoke:redeem-smoke@127.0.0.1:5432/redeem_smoke';
  process.env.DATABASE_URL = '';
  process.env.SERVER_DATABASE_POOLER_URL = '';
  process.env.DATABASE_POOLER_URL = '';

  const { RedeemCodePersistenceService } = await import('../persistence/redeem-code-persistence.service.js');
  const { RedeemCodeRuntimeService } = await import('../runtime/redeem/redeem-code-runtime.service.js');

  await testLoadDocumentSelfInitializesPersistence(RedeemCodePersistenceService);
  await testLoadDocumentFailsWhenConfiguredPersistenceUnavailable(RedeemCodePersistenceService);
  await testClaimCodeForUseUsesTypedJsonTimestampParameters(RedeemCodePersistenceService);
  await testRuntimeRollsBackMemoryOnlyCatalogMutation(RedeemCodeRuntimeService);

  console.log(JSON.stringify({
    ok: true,
    case: 'redeem-code-persistence-startup',
    answers: '兑换码启动回读会先启用专表持久化；GM 分组写入无法落库时会失败并回滚内存态，不再返回成功后重启丢失',
    excludes: '不连接真实 PostgreSQL，也不证明 live HTTP GM 面板链路',
    completionMapping: 'release:proof:redeem-code-persistence-startup',
  }, null, 2));
}

async function testLoadDocumentSelfInitializesPersistence(
  RedeemCodePersistenceService: new (provider: unknown) => {
    isEnabled(): boolean;
    loadDocument(): Promise<Record<string, unknown> | null>;
  },
): Promise<void> {
  let getPoolCalls = 0;
  let connectCalls = 0;
  const fakePool = {
    async query(sql: string) {
      if (sql.includes('SELECT revision FROM server_redeem_code_state')) {
        return { rowCount: 1, rows: [{ revision: 7 }] };
      }
      if (sql.includes('FROM server_redeem_code_group')) {
        return {
          rowCount: 1,
          rows: [{
            group_id: 'redeem-group:persisted',
            name: '重启保留分组',
            rewards_payload: [{ itemId: 'spirit_stone', count: 3 }],
            created_at: '2026-05-31T00:00:00.000Z',
            updated_at: '2026-05-31T00:01:00.000Z',
            raw_payload: {},
          }],
        };
      }
      if (sql.includes('FROM server_redeem_code')) {
        return {
          rowCount: 1,
          rows: [{
            code_id: 'redeem-code:persisted',
            group_id: 'redeem-group:persisted',
            code: 'A'.repeat(36),
            status: 'active',
            used_by_player_id: null,
            used_by_role_name: null,
            used_at: null,
            destroyed_at: null,
            created_at: '2026-05-31T00:00:00.000Z',
            updated_at: '2026-05-31T00:00:00.000Z',
            raw_payload: {},
          }],
        };
      }
      throw new Error(`unexpected fake pool query: ${sql}`);
    },
    async connect() {
      connectCalls += 1;
      return {
        async query() {
          return { rowCount: 0, rows: [] };
        },
        release() {},
      };
    },
  };
  const service = new RedeemCodePersistenceService({
    getPool(scope: string) {
      assert.equal(scope, 'redeem-code');
      getPoolCalls += 1;
      return fakePool;
    },
  });

  assert.equal(service.isEnabled(), false);
  const loaded = await service.loadDocument();

  assert.equal(service.isEnabled(), true);
  assert.equal(getPoolCalls, 1);
  assert.equal(connectCalls, 1);
  assert.equal(loaded?.revision, 7);
  assert.equal(Array.isArray(loaded?.groups), true);
  assert.equal((loaded?.groups as Array<Record<string, unknown>>)[0]?.name, '重启保留分组');
  assert.equal((loaded?.codes as Array<Record<string, unknown>>)[0]?.code, 'A'.repeat(36));
}

async function testLoadDocumentFailsWhenConfiguredPersistenceUnavailable(
  RedeemCodePersistenceService: new (provider: unknown) => {
    loadDocument(): Promise<Record<string, unknown> | null>;
  },
): Promise<void> {
  const service = new RedeemCodePersistenceService({
    getPool() {
      return null;
    },
  });

  await assert.rejects(
    () => service.loadDocument(),
    /redeem_code_persistence_unavailable/,
  );
}

async function testClaimCodeForUseUsesTypedJsonTimestampParameters(
  RedeemCodePersistenceService: new (provider: unknown) => {
    claimCodeForUse(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  },
): Promise<void> {
  const usedAt = '2026-05-31T01:41:00.000Z';
  const observedQueries: Array<{ sql: string; params: unknown[] }> = [];
  const service = new RedeemCodePersistenceService({});
  (service as any).enabled = true;
  (service as any).pool = {
    async connect() {
      return {
        async query(sql: string, params: unknown[] = []) {
          observedQueries.push({ sql, params });
          if (sql.includes('RETURNING code_id')) {
            return {
              rowCount: 1,
              rows: [{
                code_id: 'redeem-code:typed-claim',
                group_id: 'redeem-group:typed-claim',
                code: 'B'.repeat(36),
                status: 'used',
                used_by_player_id: 'player:typed-claim',
                used_by_role_name: '类型烟测',
                used_at: usedAt,
                updated_at: usedAt,
              }],
            };
          }
          return { rowCount: 1, rows: [] };
        },
        release() {},
      };
    },
  };

  const result = await service.claimCodeForUse({
    code: 'B'.repeat(36),
    playerId: 'player:typed-claim',
    playerName: '类型烟测',
    usedAt,
  });

  assert.equal(result.ok, true);
  const codeUpdate = observedQueries.find((entry) => entry.sql.includes('RETURNING code_id'));
  assert.ok(codeUpdate);
  assert.ok(codeUpdate.sql.includes("'usedByPlayerId', $5::text"));
  assert.ok(codeUpdate.sql.includes("'usedByRoleName', $6::text"));
  assert.ok(codeUpdate.sql.includes("'usedAt', $7::text"));
  assert.deepEqual(codeUpdate.params, ['B'.repeat(36), 'player:typed-claim', '类型烟测', usedAt, 'player:typed-claim', '类型烟测', usedAt]);

  const groupUpdate = observedQueries.find((entry) => entry.sql.includes('UPDATE server_redeem_code_group'));
  assert.ok(groupUpdate);
  assert.ok(groupUpdate.sql.includes('updated_at = $2::timestamptz'));
  assert.ok(groupUpdate.sql.includes("to_jsonb($3::text)"));
  assert.deepEqual(groupUpdate.params, ['redeem-group:typed-claim', usedAt, usedAt]);
}

async function testRuntimeRollsBackMemoryOnlyCatalogMutation(
  RedeemCodeRuntimeService: new (...args: unknown[]) => {
    groups: Array<unknown>;
    codes: Array<unknown>;
    revision: number;
    createGroup(name: string, rewards: Array<{ itemId: string; count: number }>, count: number): Promise<unknown>;
  },
): Promise<void> {
  const service = new RedeemCodeRuntimeService(
    {
      createItem(itemId: string, count: number) {
        return itemId === 'spirit_stone' ? { itemId, count, name: '灵石', type: 'currency' } : null;
      },
    },
    {},
    {
      async loadDocument() {
        return null;
      },
      async saveDocument() {
        return false;
      },
    },
    null,
    null,
  );

  await assert.rejects(
    () => service.createGroup('无法落库的分组', [{ itemId: 'spirit_stone', count: 1 }], 1),
    /redeem_code_persistence_unavailable/,
  );
  assert.equal(service.groups.length, 0);
  assert.equal(service.codes.length, 0);
  assert.equal(service.revision, 1);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
