import assert from 'node:assert/strict';

import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { PlayerStatisticLedgerIoQueue } from '../runtime/player/player-statistic-ledger-io-queue';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      assert.ok(resolvePromise);
      resolvePromise(value);
    },
  };
}

function createPeriodTotal(gained: number) {
  const emptyAmount = { gained: 0, lost: 0, net: 0 };
  return {
    spiritStones: { gained, lost: 0, net: gained },
    progress: { ...emptyAmount },
    techniques: { ...emptyAmount },
    professions: { ...emptyAmount },
  };
}

function createHarness() {
  const loadCalls: Array<{
    dayKeys: string[];
    deferred: Deferred<Array<{ dayKey: string; total: ReturnType<typeof createPeriodTotal> }>>;
  }> = [];
  const incrementCalls: Array<{ deferred: Deferred<void> }> = [];
  const persistence = {
    isEnabled() {
      return true;
    },
    loadPlayerStatisticDayTotals(_playerId: string, dayKeys: string[]) {
      const deferred = createDeferred<Array<{ dayKey: string; total: ReturnType<typeof createPeriodTotal> }>>();
      loadCalls.push({ dayKeys, deferred });
      return deferred.promise;
    },
    incrementPlayerStatisticDayTotal() {
      const deferred = createDeferred<void>();
      incrementCalls.push({ deferred });
      return deferred.promise;
    },
  };
  const service = new PlayerRuntimeService(
    {} as never,
    {} as never,
    { recalculate() {} } as never,
    {} as never,
    persistence as never,
  );
  (service as unknown as { schedulePlayerStatisticLedgerFlush(): void }).schedulePlayerStatisticLedgerFlush = () => undefined;
  return { service, loadCalls, incrementCalls };
}

function recordTenSpiritStones(service: PlayerRuntimeService, playerId: string, now: number): void {
  service.recordPlayerStatisticTotals(playerId, {
    spiritStones: { gained: 10, lost: 0, net: 10 },
    items: [],
    progress: [],
    techniques: [],
    professions: [],
  }, now);
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function verifyLoadThenFlushIsSerialized(): Promise<void> {
  const playerId = 'player:statistic-ledger-load-first';
  const now = Date.now();
  const { service, loadCalls, incrementCalls } = createHarness();
  recordTenSpiritStones(service, playerId, now);

  const loadPromise = service.loadPlayerStatisticTotals(playerId, now);
  await flushMicrotasks();
  assert.equal(loadCalls.length, 1);
  const flushPromise = service.flushPendingPlayerStatisticLedger(playerId);
  await flushMicrotasks();
  assert.equal(incrementCalls.length, 0, '数据库总账回读完成前不得并发启动增量落盘');

  const loadCall = loadCalls[0];
  assert.ok(loadCall);
  loadCall.deferred.resolve([{ dayKey: loadCall.dayKeys[0] ?? '', total: createPeriodTotal(100) }]);
  const loadedTotals = await loadPromise;
  assert.equal(loadedTotals?.today?.spiritStones?.gained, 110, '回读基线必须叠加尚未落盘的运行时增量');

  await flushMicrotasks();
  assert.equal(incrementCalls.length, 1);
  incrementCalls[0]?.deferred.resolve(undefined);
  await flushPromise;
  assert.equal(service.getPlayerStatisticTotalsSync(playerId, now)?.today?.spiritStones?.gained, 110);
}

async function verifyFlushThenLoadIsSerialized(): Promise<void> {
  const playerId = 'player:statistic-ledger-flush-first';
  const now = Date.now();
  const { service, loadCalls, incrementCalls } = createHarness();
  recordTenSpiritStones(service, playerId, now);

  const flushPromise = service.flushPendingPlayerStatisticLedger(playerId);
  await flushMicrotasks();
  assert.equal(incrementCalls.length, 1);
  const loadPromise = service.loadPlayerStatisticTotals(playerId, now);
  await flushMicrotasks();
  assert.equal(loadCalls.length, 0, '增量落盘完成前不得并发回读并覆盖持久缓存');

  incrementCalls[0]?.deferred.resolve(undefined);
  await flushPromise;
  await flushMicrotasks();
  assert.equal(loadCalls.length, 1);
  const loadCall = loadCalls[0];
  assert.ok(loadCall);
  loadCall.deferred.resolve([{ dayKey: loadCall.dayKeys[0] ?? '', total: createPeriodTotal(110) }]);
  const loadedTotals = await loadPromise;
  assert.equal(loadedTotals?.today?.spiritStones?.gained, 110, '落盘后的数据库总值不得再次叠加同一增量');
}

async function verifyDifferentPlayersStayParallel(): Promise<void> {
  const now = Date.now();
  const { service, loadCalls } = createHarness();
  const first = service.loadPlayerStatisticTotals('player:statistic-ledger-parallel-a', now);
  const second = service.loadPlayerStatisticTotals('player:statistic-ledger-parallel-b', now);
  await flushMicrotasks();
  assert.equal(loadCalls.length, 2, '不同玩家的总账 I/O 不得被全局串行');
  for (const loadCall of loadCalls) {
    loadCall.deferred.resolve([{ dayKey: loadCall.dayKeys[0] ?? '', total: createPeriodTotal(100) }]);
  }
  const totals = await Promise.all([first, second]);
  assert.deepEqual(totals.map((entry) => entry?.today?.spiritStones?.gained), [100, 100]);
}

async function verifyFailedOperationReleasesQueue(): Promise<void> {
  const queue = new PlayerStatisticLedgerIoQueue();
  await assert.rejects(
    queue.run('player:statistic-ledger-failed', async () => {
      throw new Error('simulated_statistic_ledger_failure');
    }),
    /simulated_statistic_ledger_failure/,
  );
  assert.equal(
    await queue.run('player:statistic-ledger-failed', () => 'recovered'),
    'recovered',
    '单次 I/O 失败不得永久阻塞该玩家后续总账操作',
  );
}

async function main(): Promise<void> {
  await verifyLoadThenFlushIsSerialized();
  await verifyFlushThenLoadIsSerialized();
  await verifyDifferentPlayersStayParallel();
  await verifyFailedOperationReleasesQueue();
  console.log(JSON.stringify({
    ok: true,
    case: 'player-statistic-ledger-io',
    answers: [
      '总账回读与同玩家增量落盘严格串行，持久缓存不会被旧查询覆盖。',
      '无论回读或落盘先发，数据库基线与运行时增量都只合并一次。',
      '不同玩家保持并行，单次失败也会释放队列。',
    ],
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
