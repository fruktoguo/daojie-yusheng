import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

import { Direction } from '@mud/shared';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { MapPersistenceFlushService } from '../persistence/map-persistence-flush.service';
import { MapPersistenceService } from '../persistence/map-persistence.service';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { PlayerPersistenceFlushService } from '../persistence/player-persistence-flush.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldSessionRecoveryQueueService } from '../network/world-session-recovery-queue.service';

const DEFAULT_PLAYER_COUNT = 24;
const DEFAULT_INSTANCE_COUNT = 24;
const DEFAULT_QUEUE_TASK_COUNT = 24;
const DEFAULT_WALLET_OP_COUNT = 100;
const DEFAULT_CONCURRENCY = 8;
const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: '本地基线下可验证 player flush / map flush / recovery queue 的平均值与 p95/p99，并作为阶段 7.4 起点报告',
          excludes: '不证明 500/1000 规模真实压测、跨节点竞争或故障注入',
          completionMapping: 'replace-ready:proof:stage7.persistence-benchmark',
        },
        null,
        2,
      ),
    );
    return;
  }

  const playerCount = normalizePositiveInteger(
    readEnvNumber('PERSISTENCE_BENCH_PLAYER_COUNT'),
    DEFAULT_PLAYER_COUNT,
    1,
    1000,
  );
  const instanceCount = normalizePositiveInteger(
    readEnvNumber('PERSISTENCE_BENCH_INSTANCE_COUNT'),
    DEFAULT_INSTANCE_COUNT,
    1,
    1000,
  );
  const queueTaskCount = normalizePositiveInteger(
    readEnvNumber('PERSISTENCE_BENCH_QUEUE_TASK_COUNT'),
    DEFAULT_QUEUE_TASK_COUNT,
    1,
    1000,
  );
  const walletOpCount = normalizePositiveInteger(
    readEnvNumber('PERSISTENCE_BENCH_WALLET_OP_COUNT'),
    DEFAULT_WALLET_OP_COUNT,
    1,
    1000,
  );
  const concurrency = normalizePositiveInteger(
    readEnvNumber('PERSISTENCE_BENCH_CONCURRENCY'),
    DEFAULT_CONCURRENCY,
    1,
    128,
  );

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const pool = new Pool({ connectionString: databaseUrl });
  const playerRuntime = app.get(PlayerRuntimeService);
  const playerFlush = app.get(PlayerPersistenceFlushService);
  const mapPersistenceService = app.get(MapPersistenceService);
  const recoveryQueue = app.get(WorldSessionRecoveryQueueService);
  const durableOperation = app.get(DurableOperationService);

  const playerIds = Array.from({ length: playerCount }, (_, index) => `bench_player_${index.toString(36)}_${Date.now().toString(36)}`);
  const sessionIds = playerIds.map((playerId, index) => `bench_session_${index.toString(36)}_${playerId.slice(-6)}`);
  const instanceIds = Array.from({ length: instanceCount }, (_, index) => `public:bench_${index.toString(36)}_${Date.now().toString(36)}`);
  const walletOperationIds = Array.from({ length: walletOpCount }, (_, index) => `bench_wallet_op_${index.toString(36)}_${Date.now().toString(36)}`);

  try {
    assert(mapPersistenceService.isEnabled(), 'map persistence should be enabled for benchmark');
    assert(durableOperation.isEnabled(), 'durable operation service should be enabled for benchmark');
    await cleanupBenchmarkRows(pool, playerIds, instanceIds, walletOperationIds);

    const playerFlushDurations: number[] = [];
    const mapFlushDurations: number[] = [];
    const queueDurations: number[] = [];
    const walletMutationDurations: number[] = [];

    await runBatched(playerIds, concurrency, async (playerId, index) => {
      const sessionId = sessionIds[index];
      const placementInstanceId = instanceIds[index % instanceIds.length];
      const freshSnapshot = playerRuntime.buildFreshPersistenceSnapshot(playerId, {
        templateId: 'yunlai_town',
        x: 10 + (index % 3),
        y: 10 + (index % 5),
        facing: Direction.South,
      });
      assert(freshSnapshot);
      playerRuntime.hydrateFromSnapshot(playerId, sessionId, freshSnapshot as never);
      playerRuntime.syncFromWorldView(playerId, sessionId, {
        instance: { instanceId: placementInstanceId, templateId: 'yunlai_town' },
        self: { x: 10 + index, y: 10, facing: Direction.South },
      });
      const startedAt = performance.now();
      await playerFlush.flushPlayer(playerId);
      playerFlushDurations.push(performance.now() - startedAt);
    });

    const mapFlush = new MapPersistenceFlushService(
      {
        listDirtyPersistentInstances() {
          return instanceIds;
        },
        buildMapPersistenceSnapshot(instanceId: string) {
          return buildMapSnapshot(instanceId);
        },
        markMapPersisted() {
          return;
        },
      } as never,
      mapPersistenceService,
    );

    await runBatched(instanceIds, concurrency, async (instanceId) => {
      const startedAt = performance.now();
      await mapFlush.flushInstance(instanceId);
      mapFlushDurations.push(performance.now() - startedAt);
    });

    const recoveryQueueResults = await Promise.all(
      Array.from({ length: queueTaskCount }, (_, index) => {
        const startedAt = performance.now();
        return recoveryQueue
          .enqueue({
            key: `bench:${index}`,
            priority: index % 3 === 0 ? 'vip' : index % 3 === 1 ? 'recent' : 'normal',
            timeoutMs: 1000,
            run: async () => {
              await sleep(2);
              return index;
            },
          })
          .then(() => {
            queueDurations.push(performance.now() - startedAt);
            return true;
          });
      }),
    );
    assert.equal(recoveryQueueResults.length, queueTaskCount);

    const walletBenchPlayers = playerIds.slice(0, walletOpCount);
    await runBatched(walletBenchPlayers, concurrency, async (playerId, index) => {
      const sessionId = sessionIds[index];
      const freshSnapshot = playerRuntime.buildFreshPersistenceSnapshot(playerId, {
        templateId: 'yunlai_town',
        x: 14 + (index % 3),
        y: 14 + (index % 5),
        facing: Direction.South,
      });
      assert(freshSnapshot);
      playerRuntime.hydrateFromSnapshot(playerId, sessionId, freshSnapshot as never);
      playerRuntime.syncFromWorldView(playerId, sessionId, {
        instance: { instanceId: instanceIds[index % instanceIds.length], templateId: 'yunlai_town' },
        self: { x: 14 + index, y: 14, facing: Direction.South },
      });
      const runtimePresence = playerRuntime.describePersistencePresence(playerId);
      assert(runtimePresence?.runtimeOwnerId);
      assert(Number.isFinite(runtimePresence?.sessionEpoch));
      const operationId = walletOperationIds[index];
      const startedAt = performance.now();
      await durableOperation.mutatePlayerWallet({
        operationId,
        playerId,
        expectedRuntimeOwnerId: runtimePresence.runtimeOwnerId as string,
        expectedSessionEpoch: Number(runtimePresence.sessionEpoch),
        walletType: 'spirit_stone',
        action: 'credit',
        delta: 1,
        nextWalletBalances: [{ walletType: 'spirit_stone', balance: 1000 + index }],
      });
      walletMutationDurations.push(performance.now() - startedAt);
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerCount,
          instanceCount,
          queueTaskCount,
          walletOpCount,
          playerFlush: summarizeDurations(playerFlushDurations),
          mapFlush: summarizeDurations(mapFlushDurations),
          recoveryQueue: summarizeDurations(queueDurations),
          walletMutation: summarizeDurations(walletMutationDurations),
          budget: {
            playerFlushAvgMs: 50,
            mapFlushAvgMs: 100,
            recoveryQueueAvgMs: 20,
            walletMutationAvgMs: 50,
          },
          answers: playerCount >= 500 && instanceCount >= 1000 && walletOpCount >= 100
            ? '已跑通 500/1000 规模的 player flush / map flush / recovery queue / wallet mutation 批量压测入口，可作为阶段 7.4 的压力测试起点报告'
            : '本地基线已跑通 player flush / map flush / recovery queue / wallet mutation 三条路径，可作为阶段 7.4 的起点报告',
          excludes: playerCount >= 500 && instanceCount >= 1000 && walletOpCount >= 100
            ? '不证明跨节点竞争或故障注入'
            : '不证明 500/1000 规模真实压测、跨节点竞争或故障注入',
          completionMapping: 'replace-ready:proof:stage7.persistence-benchmark',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupBenchmarkRows(pool, playerIds, instanceIds, walletOperationIds).catch(() => undefined);
    await app.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

function buildMapSnapshot(instanceId: string): Record<string, unknown> {
  const suffix = instanceId.slice(-6);
  return {
    version: 1,
    savedAt: Date.now(),
    templateId: 'yunlai_town',
    tileResourceEntries: [
      { resourceKey: 'qi', tileIndex: 3, value: 9 + (suffix.length % 4) },
      { resourceKey: 'qi', tileIndex: 8, value: 11 + (suffix.length % 5) },
    ],
    groundPileEntries: [],
    containerStates: [],
  };
}

function summarizeDurations(values: number[]): Record<string, number> {
  return {
    avgMs: round6(average(values)),
    p95Ms: round6(percentile(values, 0.95)),
    p99Ms: round6(percentile(values, 0.99)),
    maxMs: round6(Math.max(...values)),
  };
}

async function cleanupBenchmarkRows(pool: Pool, playerIds: string[], instanceIds: string[], operationIds: string[]): Promise<void> {
  await pool.query('DELETE FROM player_flush_ledger WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_position_checkpoint WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM player_world_anchor WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM server_player_snapshot WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM durable_operation_log WHERE operation_id = ANY($1::varchar[])', [operationIds]).catch(() => undefined);
  await pool.query('DELETE FROM outbox_event WHERE operation_id = ANY($1::varchar[])', [operationIds]).catch(() => undefined);
  await pool.query('DELETE FROM asset_audit_log WHERE operation_id = ANY($1::varchar[])', [operationIds]).catch(() => undefined);
  await pool.query('DELETE FROM instance_flush_ledger WHERE instance_id = ANY($1::varchar[])', [instanceIds]).catch(() => undefined);
  for (const instanceId of instanceIds) {
    await pool.query('DELETE FROM persistent_documents WHERE scope = $1 AND key = $2', ['server_map_aura_v1', instanceId]).catch(() => undefined);
  }
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

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readEnvNumber(name: string): number | null {
  const raw = process.env[name];
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
