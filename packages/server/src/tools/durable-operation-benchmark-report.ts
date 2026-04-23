import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

import { Direction } from '@mud/shared';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';

const databaseUrl = resolveServerDatabaseUrl();
const DEFAULT_OPERATION_COUNT = 100;
const DEFAULT_FAILURE_RATIO = 0.5;
const DEFAULT_CONCURRENCY = 16;

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: '可输出强持久化事务的提交耗时与失败率，并作为阶段 6.1 的事务指标入口',
      excludes: '不证明真实多节点顶号风暴或 split-brain',
      completionMapping: 'replace-ready:proof:stage6.durable-operation-benchmark',
    }, null, 2));
    return;
  }

  const operationCount = normalizePositiveInteger(readEnvNumber('DURABLE_OPERATION_BENCH_COUNT'), DEFAULT_OPERATION_COUNT, 1, 1000);
  const failureRatio = normalizeRatio(readEnvNumber('DURABLE_OPERATION_BENCH_FAILURE_RATIO'), DEFAULT_FAILURE_RATIO);
  const concurrency = normalizePositiveInteger(readEnvNumber('DURABLE_OPERATION_BENCH_CONCURRENCY'), DEFAULT_CONCURRENCY, 1, 128);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const pool = new Pool({ connectionString: databaseUrl });
  const durableOperation = app.get(DurableOperationService);
  const playerRuntime = app.get(PlayerRuntimeService);

  const playerIds = Array.from({ length: operationCount }, (_, index) => `do_bench_${index.toString(36)}_${Date.now().toString(36)}`);
  const sessionIds = playerIds.map((playerId, index) => `do_sess_${index.toString(36)}_${playerId.slice(-6)}`);
  const operationIds = playerIds.map((playerId, index) => `op:${playerId}:wallet:${index}`);

  try {
    const durations: number[] = [];
    let successCount = 0;
    let failureCount = 0;

    await runBatched(playerIds, concurrency, async (playerId, index) => {
      const sessionId = sessionIds[index];
      const freshSnapshot = playerRuntime.buildFreshPersistenceSnapshot(playerId, {
        templateId: 'yunlai_town',
        x: 10,
        y: 10,
        facing: Direction.South,
      });
      assert(freshSnapshot);
      playerRuntime.hydrateFromSnapshot(playerId, sessionId, freshSnapshot as never);
      playerRuntime.syncFromWorldView(playerId, sessionId, {
        instance: { instanceId: 'public:yunlai_town', templateId: 'yunlai_town' },
        self: { x: 10, y: 10, facing: Direction.South },
      });
      const presence = playerRuntime.describePersistencePresence(playerId);
      assert(presence?.runtimeOwnerId);
      assert(Number.isFinite(presence?.sessionEpoch));
      await seedPlayerPresence(pool, playerId, String(presence.runtimeOwnerId), Number(presence.sessionEpoch));
      const shouldFail = index < Math.round(operationCount * failureRatio);
      const startedAt = performance.now();
      try {
        await durableOperation.mutatePlayerWallet({
          operationId: operationIds[index],
          playerId,
          expectedRuntimeOwnerId: shouldFail ? `${presence.runtimeOwnerId}:stale` : String(presence.runtimeOwnerId),
          expectedSessionEpoch: shouldFail ? Number(presence.sessionEpoch) + 1 : Number(presence.sessionEpoch),
          walletType: 'spirit_stone',
          action: 'credit',
          delta: 1,
          nextWalletBalances: [{ walletType: 'spirit_stone', balance: 1000 + index }],
        });
        successCount += 1;
      } catch (_error) {
        failureCount += 1;
      } finally {
        durations.push(performance.now() - startedAt);
      }
    });

    console.log(JSON.stringify({
      ok: true,
      operationCount,
      failureRatio,
      concurrency,
      successCount,
      failureCount,
      successRate: round6(successCount / Math.max(1, operationCount)),
      failureRate: round6(failureCount / Math.max(1, operationCount)),
      commitLatencyMs: summarizeDurations(durations),
      answers: '强持久化事务批量压测已可直接输出提交耗时与成功/失败率，可作为阶段 6.1 的事务指标入口',
      excludes: '不证明真实多节点顶号风暴或 socket 导流',
      completionMapping: 'replace-ready:proof:stage6.durable-operation-benchmark',
    }, null, 2));
  } finally {
    await cleanupRows(pool, playerIds, operationIds).catch(() => undefined);
    await app.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupRows(pool: Pool, playerIds: string[], operationIds: string[]): Promise<void> {
  await pool.query('DELETE FROM durable_operation_log WHERE operation_id = ANY($1::varchar[])', [operationIds]).catch(() => undefined);
  await pool.query('DELETE FROM outbox_event WHERE operation_id = ANY($1::varchar[])', [operationIds]).catch(() => undefined);
  await pool.query('DELETE FROM asset_audit_log WHERE operation_id = ANY($1::varchar[])', [operationIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_mail WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_mail_attachment WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_mail_counter WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_recovery_watermark WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_wallet WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_inventory_item WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM server_player_snapshot WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_presence WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
}

async function seedPlayerPresence(pool: Pool, playerId: string, runtimeOwnerId: string, sessionEpoch: number): Promise<void> {
  await pool.query(
    `
      INSERT INTO player_presence(
        player_id,
        online,
        in_world,
        last_heartbeat_at,
        runtime_owner_id,
        session_epoch,
        updated_at
      )
      VALUES ($1, true, true, $4, $2, $3, now())
      ON CONFLICT (player_id)
      DO UPDATE SET
        online = EXCLUDED.online,
        in_world = EXCLUDED.in_world,
        last_heartbeat_at = EXCLUDED.last_heartbeat_at,
        runtime_owner_id = EXCLUDED.runtime_owner_id,
        session_epoch = EXCLUDED.session_epoch,
        updated_at = now()
    `,
    [playerId, runtimeOwnerId, Math.max(1, Math.trunc(sessionEpoch)), Date.now()],
  );
}

async function runBatched<T>(
  items: readonly T[],
  concurrency: number,
  runItem: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      const item = items[currentIndex];
      if (typeof item === 'undefined') {
        break;
      }
      await runItem(item, currentIndex);
    }
  });
  await Promise.all(workers);
}

function summarizeDurations(values: number[]): Record<string, number> {
  return {
    avgMs: round6(average(values)),
    p95Ms: round6(percentile(values, 0.95)),
    p99Ms: round6(percentile(values, 0.99)),
    maxMs: round6(Math.max(...values)),
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

function readEnvNumber(name: string): number | null {
  const raw = process.env[name];
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePositiveInteger(value: number | null, defaultValue: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return defaultValue;
  }
  const normalized = Math.trunc(value as number);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}

function normalizeRatio(value: number | null, defaultValue: number): number {
  if (!Number.isFinite(value)) {
    return defaultValue;
  }
  const normalized = Number(value);
  if (normalized < 0) {
    return 0;
  }
  if (normalized > 1) {
    return 1;
  }
  return normalized;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
