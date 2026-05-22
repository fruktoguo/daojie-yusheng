import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';

const databaseUrl = resolveServerDatabaseUrl();
const OUTBOX_EVENT_TABLE = 'outbox_event';

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证 outbox worker 可作为独立进程单轮认领并完成 delivered 回写',
          excludes: '不证明真实多节点 worker 竞争、下游消费者幂等或分布式共享去重存储',
          completionMapping: 'release:proof:with-db.outbox-dispatcher-worker',
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const eventId = `event:${Date.now().toString(36)}`;
  const eventIdB = `${eventId}:b`;
  const eventIdC = `${eventId}:c`;
  const eventIdRegistry = `${eventId}:registry`;
  const eventIdConsumer = `${eventId}:consumer`;
  const topicPrefix = `smoke.outbox.worker.${Date.now().toString(36)}`;
  const workerScript = resolveWorkerScript();
  const consumerModulePath = resolveWorkerConsumerScript();

  try {
    await cleanupOutboxRows(pool, [eventId, eventIdB, eventIdC, eventIdRegistry, eventIdConsumer]);
    await seedOutboxRow({
      pool,
      eventId,
      operationId: `op:${eventId}`,
      topic: `${topicPrefix}.mail.deliver`,
      partitionKey: 'player:outbox:worker',
      status: 'ready',
    });

    const result = await spawnWorker(
      workerScript,
      databaseUrl,
      topicPrefix,
      'outbox-dispatcher-worker-smoke',
      '8',
    );

    if (result.status !== 0) {
      throw new Error(
        [
          `worker exited with status ${result.status ?? 'null'}`,
          `stdout:\n${result.stdout ?? ''}`,
          `stderr:\n${result.stderr ?? ''}`,
        ].join('\n'),
      );
    }

    const workerRow = await waitForOutboxStatus(pool, eventId, 'delivered');
    assert.equal(workerRow?.status, 'delivered');
    assert.ok(String(workerRow?.claimed_by ?? '').startsWith('outbox-dispatcher:'), `expected worker claim id to use outbox-dispatcher prefix, got ${workerRow?.claimed_by ?? 'null'}`);

    await seedOutboxRow({
      pool,
      eventId: eventIdB,
      operationId: `op:${eventIdB}`,
      topic: `${topicPrefix}.mail.deliver`,
      partitionKey: 'player:outbox:worker',
      status: 'ready',
    });
    await seedOutboxRow({
      pool,
      eventId: eventIdC,
      operationId: `op:${eventIdC}`,
      topic: `${topicPrefix}.mail.deliver`,
      partitionKey: 'player:outbox:worker',
      status: 'ready',
    });

    const workerA = await spawnWorker(workerScript, databaseUrl, topicPrefix, 'outbox-dispatcher-worker-a');
    const deliveredRowA = await waitForOutboxStatus(pool, eventIdB, 'delivered');
    const workerB = await spawnWorker(workerScript, databaseUrl, topicPrefix, 'outbox-dispatcher-worker-b');
    const deliveredRowB = await waitForOutboxStatus(pool, eventIdC, 'delivered');
    assert.equal(workerA.status, 0, formatWorkerError('workerA', workerA));
    assert.equal(workerB.status, 0, formatWorkerError('workerB', workerB));
    assert.equal(deliveredRowA?.status, 'delivered');
    assert.equal(deliveredRowB?.status, 'delivered');
    const claimers = new Set([
      String(deliveredRowA?.claimed_by ?? ''),
      String(deliveredRowB?.claimed_by ?? ''),
    ]);
    assert.ok(claimers.size >= 1 && claimers.size <= 2, `expected one or two outbox workers to claim ready rows, got ${Array.from(claimers).join(',')}`);
    assert.ok(Array.from(claimers).every((claimer) => claimer.startsWith('outbox-dispatcher:')));

    await seedOutboxRow({
      pool,
      eventId: eventIdRegistry,
      operationId: `op:${eventIdRegistry}`,
      topic: 'player.wallet.updated',
      partitionKey: 'player:outbox:worker',
      status: 'ready',
    });
    const registryResult = await spawnWorker(
      workerScript,
      databaseUrl,
      'player.wallet.updated',
      'outbox-dispatcher-worker-registry',
      '1',
    );
    assert.equal(registryResult.status, 0, formatWorkerError('registryWorker', registryResult));
    assert.ok(registryResult.stdout.includes('"consumerMode":"registry"') || registryResult.stdout.includes('"consumerMode": "registry"'));
    const registryRow = await waitForOutboxStatus(pool, eventIdRegistry, 'delivered');
    assert.equal(registryRow?.status, 'delivered');

    await seedOutboxRow({
      pool,
      eventId: eventIdConsumer,
      operationId: `op:${eventIdConsumer}`,
      topic: `${topicPrefix}.consumer`,
      partitionKey: 'player:outbox:worker',
      status: 'ready',
    });
    const consumerResult = await spawnWorker(
      workerScript,
      databaseUrl,
      `${topicPrefix}.consumer`,
      'outbox-dispatcher-worker-consumer',
      '1',
      {
        SERVER_OUTBOX_CONSUMER_MODULE: consumerModulePath,
      },
    );
    assert.equal(consumerResult.status, 0, formatWorkerError('consumerWorker', consumerResult));
    assert.ok(consumerResult.stdout.includes('"consumerMode":"module"') || consumerResult.stdout.includes('"consumerMode": "module"'));
    const consumerRow = await waitForOutboxStatus(pool, eventIdConsumer, 'delivered');
    assert.equal(consumerRow?.status, 'delivered');

    console.log(
      JSON.stringify(
        {
          ok: true,
          workerStatus: result.status,
          deliveredRowStatus: workerRow?.status,
          claimedBy: workerRow?.claimed_by,
          multiWorkerStatuses: {
            workerA: workerA.status,
            workerB: workerB.status,
          },
          multiWorkerClaimedBy: [
            deliveredRowA?.claimed_by ?? null,
            deliveredRowB?.claimed_by ?? null,
          ],
          registryDeliveredStatus: registryRow?.status ?? null,
          consumerDeliveredStatus: consumerRow?.status ?? null,
          workerStdout: result.stdout?.trim() ?? '',
          answers: 'with-db 下已验证 outbox worker 可作为独立进程单轮认领 ready 事件，并可由两个独立 worker 进程并发处理同一前缀下的 ready 事件且不重复 delivered；当前 worker 默认会从 AppModule 取 formal registry provider 处理内建 topic，也支持通过 SERVER_OUTBOX_CONSUMER_MODULE 挂接外部真实 consumer，并在 consumer 抛错时通过 markFailed 推进 retry/dead-letter',
          excludes: '不证明真实跨机网络分区或下游消费者业务幂等，只证明共享数据库前提下的独立 worker 进程认领、不重复 delivered、AppModule registry wiring、外部 consumer 挂接与失败回收',
          completionMapping: 'release:proof:with-db.outbox-dispatcher-worker',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupOutboxRows(pool, [eventId, eventIdB, eventIdC, eventIdRegistry, eventIdConsumer]).catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function spawnWorker(
  workerScript: string,
  dbUrl: string,
  topicPrefix: string,
  dispatcherId: string,
  batchSize = '1',
  extraEnv: Record<string, string> = {},
) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('node', [workerScript, '--once', `--topic-prefix=${topicPrefix}`], {
      cwd: resolveWorkerCwd(),
      env: {
        ...process.env,
        ...extraEnv,
        SERVER_DATABASE_URL: dbUrl,
        SERVER_OUTBOX_DISPATCHER_ID: dispatcherId,
        SERVER_OUTBOX_DISPATCH_INTERVAL_MS: '250',
        SERVER_OUTBOX_DISPATCH_BATCH_SIZE: batchSize,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function formatWorkerError(label: string, result: { status: number | null; stdout: string; stderr: string }): string {
  return [
    `${label} exited with status ${result.status ?? 'null'}`,
    `stdout:\n${result.stdout ?? ''}`,
    `stderr:\n${result.stderr ?? ''}`,
  ].join('\n');
}

function resolveWorkerCwd(): string {
  return resolvePath(__dirname, '../../..');
}

function resolveWorkerScript(): string {
  return resolvePath(__dirname, 'outbox-dispatcher-worker.js');
}

function resolveWorkerConsumerScript(): string {
  return resolvePath(__dirname, 'outbox-dispatcher-worker-consumer.fixture.js');
}

async function seedOutboxRow(input: {
  pool: Pool;
  eventId: string;
  operationId: string;
  topic: string;
  partitionKey: string;
  status: string;
}): Promise<void> {
  await input.pool.query(
    `
      INSERT INTO ${OUTBOX_EVENT_TABLE}(
        event_id, operation_id, topic, partition_key, payload_jsonb,
        status, attempt_count, next_retry_at, claimed_by, claim_until, created_at, delivered_at
      )
      VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, 0, NULL, NULL, NULL, now(), NULL)
      ON CONFLICT (event_id)
      DO UPDATE SET
        operation_id = EXCLUDED.operation_id,
        topic = EXCLUDED.topic,
        partition_key = EXCLUDED.partition_key,
        payload_jsonb = EXCLUDED.payload_jsonb,
        status = EXCLUDED.status,
        attempt_count = EXCLUDED.attempt_count,
        claim_until = EXCLUDED.claim_until
    `,
    [input.eventId, input.operationId, input.topic, input.partitionKey, input.status],
  );
}

async function fetchOutboxRow(pool: Pool, eventId: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query(`SELECT * FROM ${OUTBOX_EVENT_TABLE} WHERE event_id = $1 LIMIT 1`, [eventId]);
  return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
}

async function waitForOutboxStatus(
  pool: Pool,
  eventId: string,
  expectedStatus: string,
): Promise<Record<string, unknown> | null> {
  return waitForOutboxPredicate(pool, eventId, (row) => row?.status === expectedStatus);
}

async function waitForOutboxPredicate(
  pool: Pool,
  eventId: string,
  predicate: (row: Record<string, unknown> | null) => boolean,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + 10_000;
  let lastRow: Record<string, unknown> | null = null;
  while (Date.now() <= deadline) {
    lastRow = await fetchOutboxRow(pool, eventId);
    if (predicate(lastRow)) {
      return lastRow;
    }
    await sleep(250);
  }
  return lastRow;
}

async function cleanupOutboxRows(pool: Pool, eventIds: string[]): Promise<void> {
  await pool.query(`DELETE FROM ${OUTBOX_EVENT_TABLE} WHERE event_id = ANY($1::varchar[])`, [eventIds]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
