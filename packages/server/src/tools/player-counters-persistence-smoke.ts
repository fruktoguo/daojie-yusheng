import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { PlayerCountersPersistenceService } from '../persistence/player-counters-persistence.service';

interface PersistedCounterBatch {
  playerIds: string[];
  keys: string[];
  values: number[];
}

interface DeferredSignal {
  promise: Promise<void>;
  resolve: () => void;
}

class FakeCounterPool {
  readonly batches: PersistedCounterBatch[] = [];
  batchAttempts = 0;
  failuresRemaining = 0;
  private nextBatchGate: { started: DeferredSignal; release: DeferredSignal } | null = null;

  pauseNextBatch(): { started: Promise<void>; release: () => void } {
    const gate = { started: createDeferredSignal(), release: createDeferredSignal() };
    this.nextBatchGate = gate;
    return { started: gate.started.promise, release: gate.release.resolve };
  }

  async query(sql: string, values: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    if (sql.includes('CREATE TABLE IF NOT EXISTS player_counters')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('SELECT player_id, counter_key, value FROM player_counters')) {
      return { rows: [], rowCount: 0 };
    }
    if (!sql.includes('INSERT INTO player_counters')) {
      throw new Error(`unexpected_query:${sql.slice(0, 80)}`);
    }
    this.batchAttempts += 1;
    const gate = this.nextBatchGate;
    this.nextBatchGate = null;
    if (gate) {
      gate.started.resolve();
      await gate.release.promise;
    }
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('simulated_connection_timeout');
    }
    const playerIds = toStringArray(values[0]);
    const keys = toStringArray(values[1]);
    const counterValues = toNumberArray(values[2]);
    assert.equal(playerIds.length, keys.length);
    assert.equal(playerIds.length, counterValues.length);
    this.batches.push({ playerIds, keys, values: counterValues });
    return { rows: [], rowCount: playerIds.length };
  }
}

async function main(): Promise<void> {
  await proveCoalescedBatch();
  await proveFailureRetry();
  await proveInFlightRevisionProtection();
  await proveShutdownDrain();
  await proveShutdownFailureRejectsWithDirtyWrites();

  const postgresRoundTrip = await provePostgresBatchRoundTrip();

  console.log(JSON.stringify({
    ok: true,
    case: 'player-counters-persistence',
    answers: '玩家计数器会合并高频脏值、失败后保留并退避重试、以 revision 防止旧批次确认新值；关机成功路径会刷完待写批次，重试耗尽会拒绝关停并保留 pending。',
    postgresRoundTrip,
    excludes: postgresRoundTrip
      ? '真实 PostgreSQL 用例在回滚事务内验证批量 SQL，不模拟物理断网或数据库进程崩溃。'
      : '当前未提供数据库连接，只覆盖内存假端口的合并、重试、revision 与关机语义。',
  }, null, 2));
}

async function proveCoalescedBatch(): Promise<void> {
  const pool = new FakeCounterPool();
  const service = await createService(pool);
  for (let index = 0; index < 20; index += 1) {
    service.increment('player:coalesced', 'monsterKillCount');
  }
  await waitUntil(() => service.getPendingWriteCount() === 0);
  assert.equal(pool.batchAttempts, 1);
  assert.deepEqual(pool.batches, [{
    playerIds: ['player:coalesced'],
    keys: ['monsterKillCount'],
    values: [20],
  }]);
  await service.onModuleDestroy();
}

async function proveFailureRetry(): Promise<void> {
  const pool = new FakeCounterPool();
  pool.failuresRemaining = 1;
  const service = await createService(pool);
  service.increment('player:retry', 'monsterKillCount', 3);
  await waitUntil(() => pool.batchAttempts >= 1);
  assert.equal(service.getPendingWriteCount(), 1);
  await waitUntil(() => service.getPendingWriteCount() === 0, 2_500);
  assert.equal(pool.batchAttempts, 2);
  assert.deepEqual(pool.batches[0], {
    playerIds: ['player:retry'],
    keys: ['monsterKillCount'],
    values: [3],
  });
  await service.onModuleDestroy();
}

async function proveInFlightRevisionProtection(): Promise<void> {
  const pool = new FakeCounterPool();
  const service = await createService(pool);
  const gate = pool.pauseNextBatch();
  service.set('player:revision', 'monsterKillCount', 1);
  await waitUntil(() => pool.batchAttempts === 1);
  await gate.started;
  service.set('player:revision', 'monsterKillCount', 2);
  gate.release();
  await waitUntil(() => service.getPendingWriteCount() === 0);
  assert.equal(pool.batchAttempts, 2);
  assert.deepEqual(pool.batches.map((batch) => batch.values), [[1], [2]]);
  await service.onModuleDestroy();
}

async function proveShutdownDrain(): Promise<void> {
  const pool = new FakeCounterPool();
  pool.failuresRemaining = 1;
  const service = await createService(pool);
  service.set('player:shutdown', 'monsterKillCount', 7);
  service.set('player:shutdown', 'deathCount', 2);
  await service.onModuleDestroy();
  assert.equal(service.getPendingWriteCount(), 0);
  assert.equal(pool.batchAttempts, 2);
  assert.deepEqual(pool.batches[0]?.values, [7, 2]);
}

async function proveShutdownFailureRejectsWithDirtyWrites(): Promise<void> {
  const pool = new FakeCounterPool();
  pool.failuresRemaining = 10;
  const service = await createService(pool);
  service.set('player:shutdown-failure', 'monsterKillCount', 9);

  await assert.rejects(
    () => service.onModuleDestroy(),
    /player_counters_shutdown_flush_failed:pending=1:attempt=2/,
  );
  assert.equal(service.getPendingWriteCount(), 1);
  assert.equal(pool.batchAttempts, 2);
}

async function provePostgresBatchRoundTrip(): Promise<boolean> {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    return false;
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    query_timeout: 6_000,
  });
  const client = await pool.connect();
  const playerId = `smoke:counter:${process.pid}:${Date.now()}`;
  let service: PlayerCountersPersistenceService | null = null;
  let destroyed = false;
  try {
    await client.query('BEGIN');
    const transactionalPool = {
      query(sql: string, values?: unknown[]) {
        return client.query(sql, values);
      },
    } as unknown as Pool;
    const provider = {
      getPool() {
        return transactionalPool;
      },
    } as DatabasePoolProvider;
    service = new PlayerCountersPersistenceService(provider);
    await service.onModuleInit();
    service.set(playerId, 'monsterKillCount', 12);
    service.set(playerId, 'bossMonsterKillCount', 3);
    await service.onModuleDestroy();
    destroyed = true;
    const persisted = await client.query(
      'SELECT counter_key, value::text AS value FROM player_counters WHERE player_id = $1 ORDER BY counter_key ASC',
      [playerId],
    );
    assert.deepEqual(persisted.rows, [
      { counter_key: 'bossMonsterKillCount', value: '3' },
      { counter_key: 'monsterKillCount', value: '12' },
    ]);
    await client.query('ROLLBACK');
    return true;
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    if (service && !destroyed) {
      await service.onModuleDestroy().catch(() => undefined);
    }
    client.release();
    await pool.end();
  }
}

async function createService(pool: FakeCounterPool): Promise<PlayerCountersPersistenceService> {
  const provider = {
    getPool() {
      return pool as unknown as Pool;
    },
  } as DatabasePoolProvider;
  const service = new PlayerCountersPersistenceService(provider);
  await service.onModuleInit();
  return service;
}

function createDeferredSignal(): DeferredSignal {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function toNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map((entry) => Number(entry)) : [];
}

function resolveDatabaseUrl(): string {
  return [
    process.env.SERVER_DATABASE_POOLER_URL,
    process.env.DATABASE_POOLER_URL,
    process.env.SERVER_DATABASE_URL,
    process.env.DATABASE_URL,
  ].find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`wait_until_timeout:${timeoutMs}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
