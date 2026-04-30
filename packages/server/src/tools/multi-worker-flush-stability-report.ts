import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

const smoke_player_cleanup_1 = require('./smoke-player-cleanup');
import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from '../persistence/database-pool.provider';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { PlayerFlushLedgerService } from '../persistence/player-flush-ledger.service';
import { InstanceResourceFlushWorker } from '../runtime/world/instance-resource-flush.worker';
import { PlayerStateFlushWorker } from '../runtime/world/player-state-flush.worker';

const DEFAULT_PLAYER_COUNT = 64;
const DEFAULT_INSTANCE_COUNT = 32;
const DEFAULT_PLAYER_WORKERS = 4;
const DEFAULT_INSTANCE_WORKERS = 4;
const DEFAULT_FLUSH_DELAY_MS = 8;
const DEFAULT_CONCURRENCY = 4;

async function main(): Promise<void> {
  const databaseUrl = resolveBenchmarkDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: '可在真实数据库环境下验证多 worker 并行刷盘是否能稳定分摊 ledger 认领与刷盘，不打破 claim/flush 原语。',
          excludes: '不证明无库环境、不证明真实生产压测结果。',
          completionMapping: 'release:proof:stage4.worker-parallel-flush-stability',
        },
        null,
        2,
      ),
    );
    return;
  }

  const playerCount = normalizePositiveInteger(readEnvNumber('MULTI_WORKER_FLUSH_PLAYER_COUNT'), DEFAULT_PLAYER_COUNT, 1, 500);
  const instanceCount = normalizePositiveInteger(readEnvNumber('MULTI_WORKER_FLUSH_INSTANCE_COUNT'), DEFAULT_INSTANCE_COUNT, 1, 500);
  const playerWorkers = normalizePositiveInteger(readEnvNumber('MULTI_WORKER_FLUSH_PLAYER_WORKERS'), DEFAULT_PLAYER_WORKERS, 1, 16);
  const instanceWorkers = normalizePositiveInteger(readEnvNumber('MULTI_WORKER_FLUSH_INSTANCE_WORKERS'), DEFAULT_INSTANCE_WORKERS, 1, 16);
  const flushDelayMs = normalizePositiveInteger(readEnvNumber('MULTI_WORKER_FLUSH_DELAY_MS'), DEFAULT_FLUSH_DELAY_MS, 0, 250);
  const concurrency = normalizePositiveInteger(readEnvNumber('MULTI_WORKER_FLUSH_CONCURRENCY'), DEFAULT_CONCURRENCY, 1, 32);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const poolProvider = app.get(DatabasePoolProvider);
  const pool = poolProvider.getPool('multi-worker-flush-stability');
  assert(pool, 'database pool should be available for multi worker benchmark');
  const ledger = app.get(FlushLedgerService);
  const playerFlushLedger = app.get(PlayerFlushLedgerService);

  const playerIds = Array.from({ length: playerCount }, (_, index) => `bench_multi_player_${index.toString(36)}_${Date.now().toString(36)}`);
  const instanceIds = Array.from({ length: instanceCount }, (_, index) => `public:bench_multi_instance_${index.toString(36)}_${Date.now().toString(36)}`);

  const playerFlushCalls = new Map<string, number>();
  const instanceFlushCalls = new Map<string, number>();
  let activeFlushCalls = 0;
  let maxActiveFlushCalls = 0;

  const mockPlayerFlushService = {
    async flushPlayer(playerId: string): Promise<void> {
      trackCall(playerFlushCalls, playerId);
      activeFlushCalls += 1;
      maxActiveFlushCalls = Math.max(maxActiveFlushCalls, activeFlushCalls);
      try {
        await sleep(flushDelayMs);
      } finally {
        activeFlushCalls -= 1;
      }
    },
  };

  const mockPlayerRuntimeService = {
    listDirtyPlayerDomains() {
      return new Map<string, Set<string>>();
    },
    getPersistenceRevision() {
      return 1;
    },
  };

  const mockWakeupService = {
    signalPlayerFlush() {
      return;
    },
    signalInstanceFlush() {
      return;
    },
  };

  const mockInstanceRuntimeService = {
    listDirtyPersistentInstances() {
      return [];
    },
    getInstanceRuntime(instanceId: string) {
      return {
        meta: {
          persistent: true,
          ownershipEpoch: 0,
        },
        getPersistenceRevision() {
          return 1;
        },
      };
    },
    async flushInstanceDomains(instanceId: string): Promise<{ skipped: boolean }> {
      trackCall(instanceFlushCalls, instanceId);
      activeFlushCalls += 1;
      maxActiveFlushCalls = Math.max(maxActiveFlushCalls, activeFlushCalls);
      try {
        await sleep(flushDelayMs);
      } finally {
        activeFlushCalls -= 1;
      }
      return { skipped: false };
    },
  };

  const playerWorkersList = Array.from({ length: playerWorkers }, () => new PlayerStateFlushWorker(
    mockPlayerRuntimeService as never,
    mockPlayerFlushService as never,
    playerFlushLedger,
    mockWakeupService as never,
  ));
  const instanceWorkersList = Array.from({ length: instanceWorkers }, () => new InstanceResourceFlushWorker(
    mockInstanceRuntimeService as never,
    ledger,
    mockWakeupService as never,
  ));

  try {
    await cleanupBenchmarkRows(pool, playerIds, instanceIds);
    await purgeMultiWorkerBenchmarkArtifacts();
    await seedBenchmarkRows(playerFlushLedger, ledger, playerIds, instanceIds);

    const startedAt = performance.now();
    const jobs: Array<() => Promise<FlushJobResult>> = [
      ...playerWorkersList.map((worker, index) => async () => ({
        kind: 'player' as const,
        processed: await worker.runOnce(`player-worker-${index}`),
      })),
      ...instanceWorkersList.map((worker, index) => async () => ({
        kind: 'instance' as const,
        processed: await worker.runOnce(`instance-worker-${index}`),
      })),
    ];
    const jobResults = await runBatchedJobs<FlushJobResult>(
      jobs,
      concurrency,
    );
    const totalDurationMs = performance.now() - startedAt;

    const playerLedgerRows = await playerFlushLedger.listLedgerRows();
    const instanceLedgerSummary = await ledger.listInstanceBacklogSummary();

    const duplicatePlayerFlushCount = sumDuplicateCalls(playerFlushCalls);
    const duplicateInstanceFlushCount = sumDuplicateCalls(instanceFlushCalls);
    const playerProcessedCount = jobResults.filter((entry) => entry.kind === 'player').reduce((sum, entry) => sum + entry.processed, 0);
    const instanceProcessedCount = jobResults.filter((entry) => entry.kind === 'instance').reduce((sum, entry) => sum + entry.processed, 0);

    assert.equal(playerProcessedCount, playerCount, 'player workers should flush every seeded player once');
    assert.equal(instanceProcessedCount, instanceCount, 'instance workers should flush every seeded instance once');
    assert.equal(duplicatePlayerFlushCount, 0, 'player flushes should not duplicate across workers');
    assert.equal(duplicateInstanceFlushCount, 0, 'instance flushes should not duplicate across workers');
    assert.equal(activeFlushCalls, 0, 'all flush calls should have completed');

    console.log(
      JSON.stringify(
        {
          ok: true,
          playerCount,
          instanceCount,
          playerWorkers,
          instanceWorkers,
          concurrency,
          flushDelayMs,
          totalDurationMs: round6(totalDurationMs),
          maxConcurrentFlushCalls: maxActiveFlushCalls,
          playerProcessedCount,
          instanceProcessedCount,
          playerFlushCalls: summarizeMapCounts(playerFlushCalls),
          instanceFlushCalls: summarizeMapCounts(instanceFlushCalls),
          playerLedgerReadyCount: playerLedgerRows.filter((row) => Number(row.latest_version ?? 0) > Number(row.flushed_version ?? 0)).length,
          instanceLedgerReadyCount: instanceLedgerSummary.reduce((sum, row) => sum + Number(row.dirty_count ?? 0), 0),
          duplicatePlayerFlushCount,
          duplicateInstanceFlushCount,
          answers: '已跑通多 worker 并行刷盘稳定性基线，可作为阶段 4.5.4 的并行刷盘验证起点',
          excludes: '不证明真实生产压测或跨节点故障注入',
          completionMapping: 'release:proof:stage4.worker-parallel-flush-stability',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupBenchmarkRows(pool, playerIds, instanceIds).catch(() => undefined);
    await purgeMultiWorkerBenchmarkArtifacts().catch(() => undefined);
    await app.close().catch(() => undefined);
  }
}

async function purgeMultiWorkerBenchmarkArtifacts(): Promise<void> {
  await (0, smoke_player_cleanup_1.purgeSmokeTestArtifacts)({
    dryRun: false,
    accountPatterns: ['bench_multi_%'],
    playerPatterns: ['bench_multi_player_%'],
    instancePatterns: ['public:bench_multi_%', 'public:bench_%', 'instance:%:lease'],
  });
}

async function runBatchedJobs<T>(
  jobs: readonly (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const currentIndex = cursor;
      cursor += 1;
      const job = jobs[currentIndex];
      if (typeof job !== 'function') {
        break;
      }
      results[currentIndex] = await job();
    }
  });
  await Promise.all(workers);
  return results;
}

type FlushJobResult = {
  kind: 'player' | 'instance';
  processed: number;
};

async function seedBenchmarkRows(
  playerFlushLedger: PlayerFlushLedgerService,
  ledger: FlushLedgerService,
  playerIds: string[],
  instanceIds: string[],
): Promise<void> {
  const now = new Date().toISOString();
  await playerFlushLedger.seedDirtyPlayers({
    playerIds,
    domain: 'snapshot',
    latestVersion: 1,
  });
  await ledger.upsertInstanceFlushLedger({
    instanceId: instanceIds[0] ?? 'public:bench_instance_seed',
    domain: 'tile_resource',
    ownershipEpoch: 0,
    latestVersion: 1,
    dirtySinceAt: now,
  });
  for (const instanceId of instanceIds.slice(1)) {
    await ledger.upsertInstanceFlushLedger({
      instanceId,
      domain: 'tile_resource',
      ownershipEpoch: 0,
      latestVersion: 1,
      dirtySinceAt: now,
    });
  }
}

async function cleanupBenchmarkRows(pool: Pool, playerIds: string[], instanceIds: string[]): Promise<void> {
  await pool.query('DELETE FROM player_flush_ledger WHERE player_id = ANY($1::varchar[])', [playerIds]).catch(() => undefined);
  await pool.query('DELETE FROM instance_flush_ledger WHERE instance_id = ANY($1::varchar[])', [instanceIds]).catch(() => undefined);
}

function trackCall(counter: Map<string, number>, key: string): void {
  const next = (counter.get(key) ?? 0) + 1;
  counter.set(key, next);
}

function sumDuplicateCalls(counter: Map<string, number>): number {
  let duplicateCount = 0;
  for (const value of counter.values()) {
    if (value > 1) {
      duplicateCount += value - 1;
    }
  }
  return duplicateCount;
}

function summarizeMapCounts(counter: Map<string, number>): Record<string, number> {
  return Object.fromEntries(Array.from(counter.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function resolveBenchmarkDatabaseUrl(): string {
  return resolveServerDatabaseUrl().trim();
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

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
