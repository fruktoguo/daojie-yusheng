import assert from 'node:assert/strict';

import { MailPersistenceService } from '../persistence/mail-persistence.service';
import { buildMailClaimOperationId } from '../runtime/mail/mail-runtime.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

interface QueryRecord {
  sql: string;
  params: unknown[];
}

interface FakePersistenceHarness {
  persistence: MailPersistenceService;
  queries: QueryRecord[];
}

const now = 1_720_000_000_000;
const playerId = `player-${'p'.repeat(120)}`;
const mailEntry = {
  version: 1,
  mailVersion: 2,
  mailId: `mail-${'m'.repeat(120)}`,
  senderLabel: '系统',
  templateId: null,
  args: [],
  fallbackTitle: '跨节点旧快照',
  fallbackBody: '不得回滚 durable claim',
  attachments: [{ itemId: 'spirit_stone', count: 8 }],
  createdAt: now,
  updatedAt: now + 1,
  expireAt: null,
  firstSeenAt: now + 1,
  readAt: now + 1,
  claimedAt: null,
  deletedAt: null,
} as const;

async function main(): Promise<void> {
  verifyMaximumBatchOperationId();
  await verifyStaleMutationUsesMonotonicCas();
  await verifyOrdinarySnapshotCannotPruneDurableRows();

  console.log(JSON.stringify({
    ok: true,
    operationIdMax: 173,
    batchSize: 20,
    answers: '邮件 operationId 对最大批量做稳定 hash；旧节点写只合并单调状态，不删除重建附件，计数在事务锁内从数据库回算',
    excludes: '本 smoke 是无数据库严格查询契约；真实 PostgreSQL 并发仍由 with-db 邮件 smoke 证明',
  }, null, 2));
}

function verifyMaximumBatchOperationId(): void {
  const mailIds = Array.from({ length: 20 }, (_, index) => `${index.toString().padStart(2, '0')}:${'x'.repeat(178)}`);
  const forward = buildMailClaimOperationId(playerId, Number.MAX_SAFE_INTEGER, mailIds);
  const reverse = buildMailClaimOperationId(playerId, Number.MAX_SAFE_INTEGER, mailIds.slice().reverse());
  const changed = buildMailClaimOperationId(
    playerId,
    Number.MAX_SAFE_INTEGER,
    [...mailIds.slice(0, 19), `changed:${'y'.repeat(172)}`],
  );
  const capped = buildMailClaimOperationId(
    playerId,
    Number.MAX_SAFE_INTEGER,
    [...mailIds, `ignored:${'z'.repeat(172)}`],
  );

  assert.equal(forward, reverse, '同一批邮件的操作 ID 不应受请求顺序影响');
  assert.notEqual(forward, changed, '邮件集合变化必须生成不同操作 ID');
  assert.equal(forward, capped, '第 21 封邮件不得进入最大 20 封的批量语义');
  assert.ok(forward.length <= 173, `operationId 超长: ${forward.length}`);
  assert.ok(`outbox:${forward}`.length <= 180, `outbox eventId 超长: ${`outbox:${forward}`.length}`);
}

async function verifyStaleMutationUsesMonotonicCas(): Promise<void> {
  const harness = createFakePersistenceHarness();
  await harness.persistence.saveMailboxMutation(
    playerId,
    {
      version: 1,
      revision: 2,
      welcomeMailDeliveredAt: null,
      mails: [mailEntry],
    },
    [mailEntry],
  );

  const mailUpsert = findQuery(harness.queries, 'INSERT INTO player_mail(');
  assert.match(mailUpsert.sql, /mail_version\s*=\s*GREATEST\(player_mail\.mail_version,\s*EXCLUDED\.mail_version\)/u);
  assert.match(mailUpsert.sql, /player_mail\.mail_version\s*<\s*EXCLUDED\.mail_version/u);
  assert.doesNotMatch(mailUpsert.sql, /mail_version\s*<=\s*EXCLUDED\.mail_version/u);
  assert.match(mailUpsert.sql, /claimed_at\s*=\s*COALESCE\(player_mail\.claimed_at,\s*EXCLUDED\.claimed_at\)/u);
  assert.match(mailUpsert.sql, /deleted_at\s*=\s*COALESCE\(player_mail\.deleted_at,\s*EXCLUDED\.deleted_at\)/u);

  const attachmentUpsert = findQuery(harness.queries, 'INSERT INTO player_mail_attachment(');
  assert.match(
    attachmentUpsert.sql,
    /claim_operation_id\s*=\s*COALESCE\(\s*player_mail_attachment\.claim_operation_id,\s*EXCLUDED\.claim_operation_id\s*\)/u,
  );
  assert.match(
    attachmentUpsert.sql,
    /claimed_at\s*=\s*COALESCE\(player_mail_attachment\.claimed_at,\s*EXCLUDED\.claimed_at\)/u,
  );
  assert.equal(
    harness.queries.some((entry) => /DELETE\s+FROM\s+player_mail_attachment/iu.test(entry.sql)),
    false,
    '局部邮件写禁止删除后重建附件',
  );

  const aggregateIndex = harness.queries.findIndex((entry) => entry.sql.includes('WITH visible_mail AS'));
  const mailUpsertIndex = harness.queries.indexOf(mailUpsert);
  const attachmentUpsertIndex = harness.queries.indexOf(attachmentUpsert);
  const commitIndex = harness.queries.findIndex((entry) => entry.sql === 'COMMIT');
  assert.ok(aggregateIndex > mailUpsertIndex && aggregateIndex > attachmentUpsertIndex);
  assert.ok(commitIndex > aggregateIndex, '计数回算必须发生在同一事务提交前');

  const counterUpsert = findQuery(harness.queries, 'INSERT INTO player_mail_counter(');
  assert.equal(counterUpsert.params[1], 0);
  assert.equal(counterUpsert.params[2], 0);
  assert.equal(counterUpsert.params[4], 201, '旧快照写也必须从当前 counterVersion 单调前进');
}

async function verifyOrdinarySnapshotCannotPruneDurableRows(): Promise<void> {
  const harness = createFakePersistenceHarness();
  await harness.persistence.saveMailbox(playerId, {
    version: 1,
    revision: 2,
    welcomeMailDeliveredAt: null,
    mails: [mailEntry],
  });

  assert.equal(
    harness.queries.some((entry) => /DELETE\s+FROM\s+player_mail(?:_attachment)?/iu.test(entry.sql)),
    false,
    '普通全量 persist 不能用旧快照删除数据库真源行',
  );
}

function createFakePersistenceHarness(): FakePersistenceHarness {
  const queries: QueryRecord[] = [];
  const client = {
    async query(sqlValue: unknown, paramsValue?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
      const sql = normalizeSql(sqlValue);
      const params = Array.isArray(paramsValue) ? paramsValue : [];
      queries.push({ sql, params });
      if (sql.includes('SELECT counter_version FROM player_mail_counter')) {
        return { rows: [{ counter_version: 200 }], rowCount: 1 };
      }
      if (sql.includes('SELECT counter_version, welcome_mail_delivered_at')) {
        return { rows: [{ counter_version: 200, welcome_mail_delivered_at: null }], rowCount: 1 };
      }
      if (sql.includes('WITH visible_mail AS')) {
        return {
          rows: [{ unread_count: 0, unclaimed_count: 0, latest_mail_at: now }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
    release(): void {},
  };
  const pool = {
    async connect(): Promise<typeof client> {
      return client;
    },
  };
  const persistence = new MailPersistenceService(null);
  Object.assign(persistence as unknown as Record<string, unknown>, {
    pool,
    enabled: true,
  });
  return { persistence, queries };
}

function findQuery(queries: QueryRecord[], marker: string): QueryRecord {
  const result = queries.find((entry) => entry.sql.includes(marker));
  assert.ok(result, `未执行预期 SQL: ${marker}`);
  return result;
}

function normalizeSql(value: unknown): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

void main();
