import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { OutboxEventConsumerRegistryService } from '../persistence/outbox-event-consumer-registry.service';
import { OutboxDispatcherRuntimeService } from '../persistence/outbox-dispatcher-runtime.service';
import { OutboxDispatcherService } from '../persistence/outbox-dispatcher.service';

const databaseUrl = resolveServerDatabaseUrl();
const OUTBOX_EVENT_TABLE = 'outbox_event';
const DEAD_LETTER_EVENT_TABLE = 'dead_letter_event';
const OUTBOX_CONSUMER_DEDUPE_TABLE = 'outbox_consumer_dedupe';
const EXPECTED_BUILT_IN_OUTBOX_TOPICS = [
  'player.active_job.cancelled',
  'player.active_job.completed',
  'player.active_job.started',
  'player.active_job.updated',
  'player.equipment.updated',
  'player.mail.claimed',
  'player.market.buy_now',
  'player.market.sell_now',
  'player.market.sell_now.trade_delivered',
  'player.market.storage.claimed',
  'player.npc_shop.item_purchased',
  'player.wallet.updated',
].sort();

async function main(): Promise<void> {
  await testRuntimeGating();

  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: '当前已直接证明默认未开启 SERVER_OUTBOX_RUNTIME_ENABLED 时游戏节点不会自消费 outbox；with-db 下还可验证 outbox dispatcher 会独立认领 ready 事件、完成投递回写、失败后重试或 dead-letter',
          excludes: '不证明真实多节点 worker 竞争、下游消费幂等或发布链路完整投递',
          completionMapping: 'release:proof:with-db.outbox-dispatcher',
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const dispatcher = new OutboxDispatcherService({
    getPool() {
      return pool;
    },
  } as never);
  await dispatcher.onModuleInit();
  const eventId = `event:${Date.now().toString(36)}`;
  const retryEventId = `${eventId}:retry`;
  const deadLetterEventId = `${eventId}:dead-letter`;
  const runtimeRetryEventId = `${eventId}:runtime-retry`;
  const runtimeDeadLetterEventId = `${eventId}:runtime-dead-letter`;
  const registryEventId = `${eventId}:registry`;
  const topicPrefix = `smoke.outbox.dispatcher.${Date.now().toString(36)}`;

  try {
    await cleanupOutboxRows(pool, [eventId, retryEventId, deadLetterEventId]);
    await seedOutboxRow({
      pool,
      eventId,
      operationId: `op:${eventId}`,
      topic: `${topicPrefix}.mail.deliver`,
      partitionKey: 'player:outbox:1',
      status: 'ready',
    });

    const claimed = await dispatcher.claimReadyEvents({
      dispatcherId: 'outbox-dispatcher-smoke',
      claimTtlMs: 30_000,
      limit: 10,
      topicPrefixes: [topicPrefix],
    });
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0]?.event_id, eventId);
    assert.equal(claimed[0]?.status, 'claimed');

    const delivered = await dispatcher.markDelivered(eventId);
    assert.equal(delivered, true);
    const deliveredRow = await fetchOutboxRow(pool, eventId);
    assert.equal(deliveredRow?.status, 'delivered');
    assert.ok(deliveredRow?.delivered_at);

    const reclaimEventId = `${eventId}:reclaim`;
    await seedOutboxRow({
      pool,
      eventId: reclaimEventId,
      operationId: `op:${reclaimEventId}`,
      topic: `${topicPrefix}.mail.deliver`,
      partitionKey: 'player:outbox:1',
      status: 'claimed',
      claimUntil: new Date(Date.now() - 5_000).toISOString(),
    });
    const reclaimed = await dispatcher.claimReadyEvents({
      dispatcherId: 'outbox-dispatcher-smoke:reclaim',
      claimTtlMs: 5_000,
      limit: 10,
      topicPrefixes: [topicPrefix],
    });
    assert.equal(reclaimed.length, 1);
    assert.equal(reclaimed[0]?.event_id, reclaimEventId);
    assert.equal(reclaimed[0]?.claimed_by, 'outbox-dispatcher-smoke:reclaim');

    await seedOutboxRow({
      pool,
      eventId: retryEventId,
      operationId: `op:${retryEventId}`,
      topic: `${topicPrefix}.mail.deliver`,
      partitionKey: 'player:outbox:1',
      status: 'claimed',
      claimUntil: new Date(Date.now() - 5_000).toISOString(),
      attemptCount: 0,
    });

    const failed = await dispatcher.markFailed(retryEventId, 10_000, 2);
    assert.equal(failed, true);
    const retryRow = await fetchOutboxRow(pool, retryEventId);
    assert.equal(retryRow?.status, 'ready');
    assert.equal(Number(retryRow?.attempt_count ?? 0), 1);
    assert.ok(retryRow?.next_retry_at);

    await seedOutboxRow({
      pool,
      eventId: deadLetterEventId,
      operationId: `op:${deadLetterEventId}`,
      topic: `${topicPrefix}.mail.deliver`,
      partitionKey: 'player:outbox:1',
      status: 'claimed',
      claimUntil: new Date(Date.now() - 5_000).toISOString(),
      attemptCount: 0,
    });
    const deadLettered = await dispatcher.markFailed(deadLetterEventId, 10_000, 1);
    assert.equal(deadLettered, true);
    const deadLetterRow = await fetchDeadLetterRow(pool, deadLetterEventId);
    assert.equal(deadLetterRow?.event_id, deadLetterEventId);
    assert.equal(deadLetterRow?.status, 'dead_letter');

    const dedupeEventId = `${eventId}:dedupe`;
    const dedupeOperationId = `op:${dedupeEventId}`;
    await seedOutboxRow({
      pool,
      eventId: dedupeEventId,
      operationId: dedupeOperationId,
      topic: `${topicPrefix}.mail.deliver`,
      partitionKey: 'player:outbox:1',
      status: 'claimed',
      claimUntil: new Date(Date.now() - 5_000).toISOString(),
    });
    const runtimeA = new OutboxDispatcherRuntimeService(dispatcher);
    const runtimeB = new OutboxDispatcherRuntimeService(dispatcher);
    const consumedByA: string[] = [];
    const consumedByB: string[] = [];
    await runtimeA.consumeEvent(
      {
        event_id: dedupeEventId,
        operation_id: dedupeOperationId,
        topic: `${topicPrefix}.mail.deliver`,
      },
      async (event) => {
        consumedByA.push(String(event.event_id ?? ''));
      },
    );
    await runtimeB.consumeEvent(
      {
        event_id: dedupeEventId,
        operation_id: dedupeOperationId,
        topic: `${topicPrefix}.mail.deliver`,
      },
      async (event) => {
        consumedByB.push(String(event.event_id ?? ''));
      },
    );
    assert.deepEqual(consumedByA, [dedupeEventId]);
    assert.deepEqual(consumedByB, []);

    const duplicateOperationEventId = `${eventId}:dedupe-op`;
    await seedOutboxRow({
      pool,
      eventId: duplicateOperationEventId,
      operationId: dedupeOperationId,
      topic: `${topicPrefix}.mail.deliver`,
      partitionKey: 'player:outbox:1',
      status: 'claimed',
      claimUntil: new Date(Date.now() - 5_000).toISOString(),
    });
    const consumedByOperationDuplicate: string[] = [];
    await runtimeB.consumeEvent(
      {
        event_id: duplicateOperationEventId,
        operation_id: dedupeOperationId,
        topic: `${topicPrefix}.mail.deliver`,
      },
      async (event) => {
        consumedByOperationDuplicate.push(String(event.event_id ?? ''));
      },
    );
    assert.deepEqual(consumedByOperationDuplicate, []);
    const dedupeRows = await fetchConsumerDedupeRows(pool, [dedupeEventId, duplicateOperationEventId], [dedupeOperationId]);
    assert.ok(dedupeRows.some((row) => row.dedupe_key === `event:${dedupeEventId}` && row.state === 'delivered'));
    assert.ok(dedupeRows.some((row) => row.dedupe_key === `op:${dedupeOperationId}` && row.state === 'delivered'));

    await seedOutboxRow({
      pool,
      eventId: registryEventId,
      operationId: `op:${registryEventId}`,
      topic: `${topicPrefix}.registry`,
      partitionKey: 'player:outbox:1',
      status: 'ready',
    });
    const registryCalls: string[] = [];
    const registry = new OutboxEventConsumerRegistryService();
    assert.deepEqual(registry.listExactTopics(), EXPECTED_BUILT_IN_OUTBOX_TOPICS);
    assert.equal(registry.hasConsumer('player.active_job.completed'), true);
    assert.equal(registry.hasConsumer('player.npc_shop.item_purchased'), true);
    assert.equal(registry.hasConsumer(`${topicPrefix}.registry.miss`), false);
    registry.registerPrefix(`${topicPrefix}.registry`, async (event) => {
      registryCalls.push(String(event.event_id ?? ''));
    });
    const registryRuntime = new OutboxDispatcherRuntimeService(dispatcher, registry);
    await registryRuntime.onModuleInit();
    const registryProcessed = await registryRuntime.dispatchPendingEvents({
      topicPrefixes: [`${topicPrefix}.registry`],
    });
    await registryRuntime.onModuleDestroy();
    assert.equal(registryProcessed, 1);
    assert.deepEqual(registryCalls, [registryEventId]);
    const registryRow = await fetchOutboxRow(pool, registryEventId);
    assert.equal(registryRow?.status, 'delivered');

    await seedOutboxRow({
      pool,
      eventId: runtimeRetryEventId,
      operationId: `op:${runtimeRetryEventId}`,
      topic: `${topicPrefix}.runtime.retry`,
      partitionKey: 'player:outbox:1',
      status: 'ready',
    });
    const runtimeFailure = new OutboxDispatcherRuntimeService(dispatcher);
    runtimeFailure.setEventConsumer(async () => {
      throw new Error('synthetic_runtime_consumer_failure');
    });
    const runtimeRetryProcessed = await runtimeFailure.dispatchPendingEvents({
      topicPrefixes: [`${topicPrefix}.runtime.retry`],
    });
    assert.equal(runtimeRetryProcessed, 0);
    const runtimeRetryRow = await fetchOutboxRow(pool, runtimeRetryEventId);
    assert.equal(runtimeRetryRow?.status, 'ready');
    assert.equal(Number(runtimeRetryRow?.attempt_count ?? 0), 1);
    assert.ok(runtimeRetryRow?.next_retry_at);

    await seedOutboxRow({
      pool,
      eventId: runtimeDeadLetterEventId,
      operationId: `op:${runtimeDeadLetterEventId}`,
      topic: `${topicPrefix}.runtime.dead`,
      partitionKey: 'player:outbox:1',
      status: 'ready',
    });
    const previousMaxAttempts = process.env.SERVER_OUTBOX_MAX_ATTEMPTS;
    const previousRetryDelay = process.env.SERVER_OUTBOX_RETRY_DELAY_MS;
    process.env.SERVER_OUTBOX_MAX_ATTEMPTS = '1';
    process.env.SERVER_OUTBOX_RETRY_DELAY_MS = '250';
    try {
      const runtimeDeadProcessed = await runtimeFailure.dispatchPendingEvents({
        topicPrefixes: [`${topicPrefix}.runtime.dead`],
      });
      assert.equal(runtimeDeadProcessed, 0);
    } finally {
      if (previousMaxAttempts === undefined) {
        delete process.env.SERVER_OUTBOX_MAX_ATTEMPTS;
      } else {
        process.env.SERVER_OUTBOX_MAX_ATTEMPTS = previousMaxAttempts;
      }
      if (previousRetryDelay === undefined) {
        delete process.env.SERVER_OUTBOX_RETRY_DELAY_MS;
      } else {
        process.env.SERVER_OUTBOX_RETRY_DELAY_MS = previousRetryDelay;
      }
    }
    const runtimeDeadLetterRow = await fetchOutboxRow(pool, runtimeDeadLetterEventId);
    assert.equal(runtimeDeadLetterRow?.status, 'dead_letter');
    const runtimeDeadLetterArchive = await fetchDeadLetterRow(pool, runtimeDeadLetterEventId);
    assert.equal(runtimeDeadLetterArchive?.event_id, runtimeDeadLetterEventId);

    console.log(
      JSON.stringify(
        {
          ok: true,
          claimedCount: claimed.length,
          deliveredRowStatus: deliveredRow?.status,
          reclaimedCount: reclaimed.length,
          retryRowStatus: retryRow?.status,
          deadLetterRowStatus: deadLetterRow?.status,
          answers: '当前已直接证明默认未开启 SERVER_OUTBOX_RUNTIME_ENABLED 时游戏节点不会自消费 outbox，显式开启后才会启动轮询；with-db 下还已验证 outbox dispatcher 可独立认领 ready 事件、过期 claimed 事件可被新 dispatcher 接管、应用内 runtime 可通过 topic consumer registry 执行默认 handler、失败后会回到 ready 并推进 attempt_count，runtime consumer 抛错时也会通过 markFailed 进入 retry/dead_letter；同时 runtime 消费层现已通过共享数据库 dedupe 表按 event_id / operation_id 做跨实例幂等 claim，重复事件不会再次进入业务回调',
          excludes: '不证明真实发布链路完整投递或跨集群网络分区，只证明共享数据库前提下的 dispatcher 幂等消费',
          completionMapping: 'release:proof:with-db.outbox-dispatcher',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupOutboxRows(
      pool,
      [
        eventId,
        retryEventId,
        deadLetterEventId,
        runtimeRetryEventId,
        runtimeDeadLetterEventId,
        registryEventId,
        `${eventId}:reclaim`,
        `${eventId}:dedupe`,
        `${eventId}:dedupe-op`,
      ],
    ).catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function testRuntimeGating(): Promise<void> {
  const previousRuntimeEnabled = process.env.SERVER_OUTBOX_RUNTIME_ENABLED;
  const previousLegacyRuntimeEnabled = process.env.DATABASE_OUTBOX_RUNTIME_ENABLED;
  const previousIntervalMs = process.env.SERVER_OUTBOX_DISPATCH_INTERVAL_MS;
  delete process.env.SERVER_OUTBOX_RUNTIME_ENABLED;
  delete process.env.DATABASE_OUTBOX_RUNTIME_ENABLED;
  process.env.SERVER_OUTBOX_DISPATCH_INTERVAL_MS = '250';

  const disabledSpy = {
    claimCalls: 0,
    isEnabled() {
      return true;
    },
    async claimReadyEvents() {
      this.claimCalls += 1;
      return [];
    },
    async markDelivered() {
      return true;
    },
  };
  const disabledRuntime = new OutboxDispatcherRuntimeService(disabledSpy as never);
  await disabledRuntime.onModuleInit();
  await sleep(350);
  await disabledRuntime.onModuleDestroy();
  assert.equal(disabledSpy.claimCalls, 0);

  process.env.SERVER_OUTBOX_RUNTIME_ENABLED = '1';
  const enabledSpy = {
    claimCalls: 0,
    isEnabled() {
      return true;
    },
    async claimReadyEvents() {
      this.claimCalls += 1;
      return [];
    },
    async markDelivered() {
      return true;
    },
  };
  const enabledRuntime = new OutboxDispatcherRuntimeService(enabledSpy as never);
  await enabledRuntime.onModuleInit();
  await sleep(350);
  await enabledRuntime.onModuleDestroy();
  assert.ok(enabledSpy.claimCalls >= 1, `expected runtime polling when enabled, got ${enabledSpy.claimCalls}`);

  if (previousRuntimeEnabled === undefined) {
    delete process.env.SERVER_OUTBOX_RUNTIME_ENABLED;
  } else {
    process.env.SERVER_OUTBOX_RUNTIME_ENABLED = previousRuntimeEnabled;
  }
  if (previousLegacyRuntimeEnabled === undefined) {
    delete process.env.DATABASE_OUTBOX_RUNTIME_ENABLED;
  } else {
    process.env.DATABASE_OUTBOX_RUNTIME_ENABLED = previousLegacyRuntimeEnabled;
  }
  if (previousIntervalMs === undefined) {
    delete process.env.SERVER_OUTBOX_DISPATCH_INTERVAL_MS;
  } else {
    process.env.SERVER_OUTBOX_DISPATCH_INTERVAL_MS = previousIntervalMs;
  }
}

async function seedOutboxRow(input: {
  pool: Pool;
  eventId: string;
  operationId: string;
  topic: string;
  partitionKey: string;
  status: string;
  claimUntil?: string | null;
  attemptCount?: number;
}): Promise<void> {
  await input.pool.query(
    `
      INSERT INTO ${OUTBOX_EVENT_TABLE}(
        event_id, operation_id, topic, partition_key, payload_jsonb,
        status, attempt_count, next_retry_at, claimed_by, claim_until, created_at, delivered_at
      )
      VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, $6, NULL, NULL, $7, now(), NULL)
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
    [input.eventId, input.operationId, input.topic, input.partitionKey, input.status, Math.trunc(input.attemptCount ?? 0), input.claimUntil ?? null],
  );
}

async function fetchOutboxRow(pool: Pool, eventId: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query(`SELECT * FROM ${OUTBOX_EVENT_TABLE} WHERE event_id = $1 LIMIT 1`, [eventId]);
  return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
}

async function fetchDeadLetterRow(pool: Pool, eventId: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query(`SELECT * FROM ${DEAD_LETTER_EVENT_TABLE} WHERE event_id = $1 LIMIT 1`, [eventId]);
  return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
}

async function cleanupOutboxRows(pool: Pool, eventIds: string[]): Promise<void> {
  await pool.query(`DELETE FROM ${OUTBOX_EVENT_TABLE} WHERE event_id = ANY($1::varchar[])`, [eventIds]);
  await pool.query(`DELETE FROM ${DEAD_LETTER_EVENT_TABLE} WHERE event_id = ANY($1::varchar[])`, [eventIds]);
  await pool.query(`DELETE FROM ${OUTBOX_CONSUMER_DEDUPE_TABLE} WHERE event_id = ANY($1::varchar[])`, [eventIds]);
}

async function fetchConsumerDedupeRows(
  pool: Pool,
  eventIds: string[],
  operationIds: string[],
): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(
    `
      SELECT dedupe_key, event_id, operation_id, state
      FROM ${OUTBOX_CONSUMER_DEDUPE_TABLE}
      WHERE event_id = ANY($1::varchar[])
         OR operation_id = ANY($2::varchar[])
      ORDER BY dedupe_key ASC
    `,
    [eventIds, operationIds],
  );
  return Array.isArray(result.rows) ? (result.rows as Array<Record<string, unknown>>) : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
