// @ts-nocheck

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { WorldRuntimeTransferService } from '../runtime/world/world-runtime-transfer.service';

const DEFAULT_TRANSFER_COUNT = 100;
const DEFAULT_CONCURRENCY = 16;

async function main(): Promise<void> {
  const transferCount = normalizePositiveInteger(
    readEnvNumber('TRANSFER_PRESSURE_COUNT'),
    DEFAULT_TRANSFER_COUNT,
    1,
    1000,
  );
  const concurrency = normalizePositiveInteger(
    readEnvNumber('TRANSFER_PRESSURE_CONCURRENCY'),
    DEFAULT_CONCURRENCY,
    1,
    128,
  );

  const service = new WorldRuntimeTransferService();
  const transfers = Array.from({ length: transferCount }, (_, index) => buildTransfer(index));
  const runtimeStates = new Map<string, { meta: { instanceId: string } }>();
  const playerLocations = new Map<string, { instanceId: string; sessionId: string }>();
  const transferStates: Array<[string, string, string | null]> = [];

  for (const transfer of transfers) {
    runtimeStates.set(transfer.fromInstanceId, {
      meta: { instanceId: transfer.fromInstanceId },
      disconnectPlayer() {},
    });
  }

  const durations: number[] = [];
  await runBatched(transfers, concurrency, async (transfer) => {
    const source = runtimeStates.get(transfer.fromInstanceId);
    if (!source) {
      throw new Error(`missing source runtime for ${transfer.fromInstanceId}`);
    }
    const target = {
      meta: { instanceId: transfer.targetMapId === 'yunlai_town' ? 'public:yunlai_town' : `public:${transfer.targetMapId}` },
      disconnectPlayer() {},
      connectPlayer() {},
      setPlayerMoveSpeed() {},
    };
    const startedAt = performance.now();
    service.applyTransfer(transfer, {
      getInstanceRuntime(instanceId: string) {
        return instanceId === transfer.fromInstanceId ? source : null;
      },
      setPlayerLocation(playerId: string, location: { instanceId: string; sessionId: string }) {
        playerLocations.set(playerId, location);
      },
      playerRuntimeService: {
        getPlayer(playerId: string) {
          return {
            playerId,
            attrs: { numericStats: { moveSpeed: 12 } },
            worldPreference: { linePreset: 'peaceful' },
          };
        },
        beginTransfer(playerId: string, targetMapId: string) {
          transferStates.push(['beginTransfer', playerId, targetMapId]);
        },
        completeTransfer(playerId: string) {
          transferStates.push(['completeTransfer', playerId, null]);
        },
        syncFromWorldView() {},
      },
      getOrCreateDefaultLineInstance() {
        return target;
      },
      getOrCreatePublicInstance() {
        return target;
      },
      worldRuntimeNavigationService: {
        handleTransfer() {},
      },
    });
    durations.push(performance.now() - startedAt);
  });

  assert.equal(playerLocations.size, transferCount);
  assert.equal(transferStates.length, transferCount * 2);

  console.log(JSON.stringify({
    ok: true,
    transferCount,
    concurrency,
    avgMs: round6(average(durations)),
    p95Ms: round6(percentile(durations, 0.95)),
    p99Ms: round6(percentile(durations, 0.99)),
    maxMs: round6(Math.max(...durations)),
    answers: transferCount >= 100
      ? '已跑通 100 玩家同时跨节点传送的压测入口，可作为阶段 7.4 的跨节点转移压力侧证'
      : '已跑通跨节点传送压测入口，可作为阶段 7.4 的起点报告',
    excludes: '不证明真实多节点 socket 导流或 lease 接管故障注入',
    completionMapping: 'release:proof:stage7.transfer-pressure',
  }, null, 2));
}

function buildTransfer(index: number): {
  playerId: string;
  sessionId: string;
  fromInstanceId: string;
  targetMapId: string;
  targetX: number;
  targetY: number;
  reason: string;
} {
  return {
    playerId: `bench_transfer_player_${index.toString(36)}_${Date.now().toString(36)}`,
    sessionId: `bench_transfer_session_${index.toString(36)}`,
    fromInstanceId: `instance:from:${index.toString(36)}`,
    targetMapId: 'yunlai_town',
    targetX: 10 + (index % 7),
    targetY: 10 + (index % 5),
    reason: index % 2 === 0 ? 'portal' : 'gm_transfer',
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

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
