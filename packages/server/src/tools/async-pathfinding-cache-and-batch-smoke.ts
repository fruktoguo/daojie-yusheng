import assert from 'node:assert/strict';

import type { PathfindingBatchTaskInput, PathfindingBatchTaskResult } from '@mud/shared';

import { EncodingWorkerPoolService } from '../concurrency/encoding-worker-pool.service';
import { WorkerPoolMetricsService } from '../concurrency/worker-pool-metrics.service';
import {
  ASYNC_PATHFINDING_MAX_IN_FLIGHT_BATCHES,
  ASYNC_PATHFINDING_MAX_REQUESTS_PER_BATCH,
  AsyncPathfindingService,
} from '../runtime/world/async-pathfinding.service';
import {
  NAVIGATION_MAX_CANDIDATES_PER_MATERIALIZATION,
  WorldRuntimeNavigationService,
} from '../runtime/world/world-runtime-navigation.service';

function createPathInstance(instanceId: string, walkableCells: number[]) {
  let staticPathingRevision = 0;
  let walkable = Uint8Array.from(walkableCells);
  let walkableReads = 0;
  return {
    meta: { instanceId },
    template: { id: 'shared-template', width: 3, height: 1 },
    getStaticPathingRevision() { return staticPathingRevision; },
    isCellIndexWalkable(index: number) {
      walkableReads += 1;
      return walkable[index] === 1;
    },
    isWalkable() { throw new Error('静态网格不得读取动态 isWalkable'); },
    getStaticTileTraversalCost() { return 1; },
    getTileTraversalCost() { throw new Error('静态网格不得读取动态 getTileTraversalCost'); },
    replaceStaticGrid(next: number[]) {
      walkable = Uint8Array.from(next);
      staticPathingRevision += 1;
    },
    getWalkableReads() { return walkableReads; },
  };
}

async function verifyInstanceAndStaticRevisionCacheKey(): Promise<void> {
  const submittedInputs: PathfindingBatchTaskInput[] = [];
  const fakePool = {
    async submit(
      kind: string,
      payload: PathfindingBatchTaskInput,
      fallback: (input: PathfindingBatchTaskInput) => PathfindingBatchTaskResult,
    ) {
      assert.equal(kind, 'pathfind-batch');
      submittedInputs.push(payload);
      return { taskId: `task:${submittedInputs.length}`, ok: true, result: fallback(payload), durationMs: 0 };
    },
  };
  const service = new AsyncPathfindingService(fakePool as never);
  const blocked = new Uint8Array(3);
  const first = createPathInstance('instance:a', [1, 1, 1]);

  const firstResult = await service.findPathAsync(first, blocked, 0, 0, [{ x: 2, y: 0 }]);
  assert.equal(firstResult.status, 'success');
  assert.equal(first.getWalkableReads(), 3);
  assert.equal(submittedInputs[0]?.mapId, 'instance:a');
  assert.equal(submittedInputs[0]?.requests.length, 1);
  assert.ok(
    typeof SharedArrayBuffer !== 'function' || submittedInputs[0]?.walkable.buffer instanceof SharedArrayBuffer,
    '静态网格应优先使用 SharedArrayBuffer，避免跨 Worker 复制字节',
  );

  await service.findPathAsync(first, blocked, 0, 0, [{ x: 2, y: 0 }]);
  assert.equal(first.getWalkableReads(), 3, '静态 revision 未变时应复用主线网格');
  assert.equal(submittedInputs[1]?.mapRevision, submittedInputs[0]?.mapRevision);

  first.replaceStaticGrid([1, 0, 1]);
  const changedResult = await service.findPathAsync(first, blocked, 0, 0, [{ x: 2, y: 0 }]);
  assert.equal(changedResult.status, 'failed');
  assert.equal(first.getWalkableReads(), 6);
  assert.notEqual(submittedInputs[2]?.mapRevision, submittedInputs[1]?.mapRevision);

  const recreated = createPathInstance('instance:a', [1, 1, 1]);
  const recreatedResult = await service.findPathAsync(recreated, blocked, 0, 0, [{ x: 2, y: 0 }]);
  assert.equal(recreatedResult.status, 'success');
  assert.equal(recreated.getWalkableReads(), 3);
  assert.notEqual(submittedInputs[3]?.mapRevision, submittedInputs[2]?.mapRevision, '同 ID 新实例不得复用 worker 旧网格');
}

async function verifyInstanceBatchReuseAndBackpressure(): Promise<void> {
  const submittedInputs: PathfindingBatchTaskInput[] = [];
  let releaseSubmissions!: () => void;
  const submissionGate = new Promise<void>((resolve) => {
    releaseSubmissions = resolve;
  });
  const fakePool = {
    async submit(
      kind: string,
      payload: PathfindingBatchTaskInput,
      fallback: (input: PathfindingBatchTaskInput) => PathfindingBatchTaskResult,
    ) {
      assert.equal(kind, 'pathfind-batch');
      submittedInputs.push(payload);
      await submissionGate;
      return {
        taskId: `batch:${submittedInputs.length}`,
        ok: true,
        result: fallback(payload),
        durationMs: 0,
      };
    },
  };
  const service = new AsyncPathfindingService(fakePool as never);
  const instance = createPathInstance('instance:batch', [1, 1, 1]);
  const requestCount = ASYNC_PATHFINDING_MAX_REQUESTS_PER_BATCH * 6 + 5;
  const pending = Array.from({ length: requestCount }, () => service.findPathByBlockedIndicesAsync(
    instance,
    new Uint32Array(0),
    0,
    0,
    [{ x: 2, y: 0 }],
  ));

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(
    submittedInputs.length,
    ASYNC_PATHFINDING_MAX_IN_FLIGHT_BATCHES,
    'Worker 未完成时只允许固定数量批次在途，其余请求必须留在服务内背压队列',
  );
  const blockedDiagnostics = service.getBatchDiagnostics();
  assert.equal(blockedDiagnostics.inFlightBatchCount, ASYNC_PATHFINDING_MAX_IN_FLIGHT_BATCHES);
  assert.ok(blockedDiagnostics.readyBatchCount > 0, '超出并发窗口的批次应等待，不得继续写入 WorkerPool.pendingTasks');

  releaseSubmissions();
  const results = await Promise.all(pending);
  assert.ok(results.every((result) => result.status === 'success'));
  const expectedBatchCount = Math.ceil(requestCount / ASYNC_PATHFINDING_MAX_REQUESTS_PER_BATCH);
  assert.equal(submittedInputs.length, expectedBatchCount, 'Worker 任务数应按批次而不是按玩家增长');
  assert.ok(submittedInputs.length < requestCount);
  assert.equal(
    submittedInputs.reduce((total, input) => total + input.requests.length, 0),
    requestCount,
  );
  assert.ok(submittedInputs.every((input) => input.requests.length <= ASYNC_PATHFINDING_MAX_REQUESTS_PER_BATCH));
  assert.ok(
    submittedInputs.every((input) => input.walkable === submittedInputs[0].walkable),
    '同实例所有批次必须复用同一静态可行走网格引用',
  );
  assert.ok(
    submittedInputs.every((input) => input.traversalCost === submittedInputs[0].traversalCost),
    '同实例所有批次必须复用同一静态代价网格引用',
  );
  assert.ok(
    submittedInputs.every((input) => input.requests.every((request) => request.blockedIndices instanceof Uint32Array)),
    '每玩家只传稀疏动态阻挡索引',
  );
  const diagnostics = service.getBatchDiagnostics();
  assert.equal(diagnostics.submittedBatchCount, expectedBatchCount);
  assert.equal(diagnostics.submittedRequestCount, requestCount);
  assert.equal(diagnostics.maxObservedInFlightBatchCount, ASYNC_PATHFINDING_MAX_IN_FLIGHT_BATCHES);
}

async function verifyCompiledWorkerExecutesBatchProtocol(): Promise<void> {
  const metrics = new WorkerPoolMetricsService();
  const pool = new EncodingWorkerPoolService(metrics);
  pool.initialize();
  try {
    const service = new AsyncPathfindingService(pool);
    const instance = createPathInstance('instance:real-worker', [1, 1, 1]);
    const [reachable, blocked] = await Promise.all([
      service.findPathByBlockedIndicesAsync(instance, new Uint32Array(0), 0, 0, [{ x: 2, y: 0 }]),
      service.findPathByBlockedIndicesAsync(instance, Uint32Array.of(1), 0, 0, [{ x: 2, y: 0 }]),
    ]);
    assert.equal(reachable.status, 'success');
    assert.equal(blocked.status, 'failed');
    assert.equal(service.getBatchDiagnostics().submittedBatchCount, 1, '真实 Worker 协议也应合并为单个实例批任务');
  }
  finally {
    pool.shutdown();
  }
}

async function verifyNavigationMaterializationIsConcurrent(): Promise<void> {
  const players = new Map(Array.from({ length: 4 }, (_, index) => {
    const playerId = `player:${index}`;
    return [playerId, { playerId, instanceId: 'instance:a', x: 0, y: 0, hp: 100 }];
  }));
  const service = new WorldRuntimeNavigationService(
    { getOrThrow() { throw new Error('unexpected template lookup'); } } as never,
    { getPlayer(playerId: string) { return players.get(playerId) ?? null; } } as never,
    undefined,
  );
  let inFlight = 0;
  let maxInFlight = 0;
  (service as unknown as {
    resolveNavigationStepAsync: (playerId: string) => Promise<Record<string, unknown>>;
  }).resolveNavigationStepAsync = async (playerId: string) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise<void>((resolve) => setImmediate(resolve));
    inFlight -= 1;
    return { kind: 'move', direction: 'east', maxSteps: 2, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }], playerId };
  };
  for (const playerId of players.keys()) {
    service.navigationIntents.set(playerId, { kind: 'point', mapId: 'shared-template', x: 2, y: 0 });
  }
  const enqueued: Array<{ playerId: string; command: Record<string, unknown> }> = [];
  await service.materializeNavigationCommands({
    hasPendingCommand() { return false; },
    enqueuePendingCommand(playerId: string, command: Record<string, unknown>) {
      enqueued.push({ playerId, command });
    },
    queuePlayerNotice() {},
    logger: { warn() {}, debug() {} },
  });

  assert.equal(maxInFlight, 4, '同帧寻路应先全部提交，再等待结果');
  assert.equal(enqueued.length, 4);
  assert.ok(enqueued.every((entry) => entry.command.kind === 'move'));
  assert.ok(enqueued.every((entry) => Array.isArray(entry.command.path) && entry.command.path.length === 2));
}

async function verifyNavigationMaterializationLimitIsFair(): Promise<void> {
  const playerCount = NAVIGATION_MAX_CANDIDATES_PER_MATERIALIZATION + 72;
  const players = new Map(Array.from({ length: playerCount }, (_, index) => {
    const playerId = `player:${index}`;
    return [playerId, { playerId, instanceId: 'instance:fair', x: 0, y: 0, hp: 100 }];
  }));
  const service = new WorldRuntimeNavigationService(
    { getOrThrow() { throw new Error('unexpected template lookup'); } } as never,
    { getPlayer(playerId: string) { return players.get(playerId) ?? null; } } as never,
    undefined,
  );
  (service as unknown as {
    resolveNavigationStepAsync: () => Promise<Record<string, unknown>>;
  }).resolveNavigationStepAsync = async () => ({
    kind: 'move',
    direction: 'east',
    maxSteps: 1,
    path: [{ x: 1, y: 0 }],
  });
  for (const playerId of players.keys()) {
    service.navigationIntents.set(playerId, { kind: 'point', mapId: 'shared-template', x: 2, y: 0 });
  }
  const firstFrame: string[] = [];
  const secondFrame: string[] = [];
  let activeTarget = firstFrame;
  const deps = {
    hasPendingCommand() { return false; },
    enqueuePendingCommand(playerId: string) { activeTarget.push(playerId); },
    queuePlayerNotice() {},
    logger: { warn() {}, debug() {} },
  };

  await service.materializeNavigationCommands(deps);
  activeTarget = secondFrame;
  await service.materializeNavigationCommands(deps);

  assert.equal(firstFrame.length, NAVIGATION_MAX_CANDIDATES_PER_MATERIALIZATION);
  assert.equal(secondFrame.length, NAVIGATION_MAX_CANDIDATES_PER_MATERIALIZATION);
  assert.equal(firstFrame[0], 'player:0');
  assert.equal(secondFrame[0], `player:${NAVIGATION_MAX_CANDIDATES_PER_MATERIALIZATION}`);
  assert.ok(
    new Set([...firstFrame, ...secondFrame]).size === playerCount,
    '第二帧必须先覆盖上一帧未处理玩家，再轮转回持续导航玩家',
  );
}

async function verifyStaleNavigationResultIsDiscarded(): Promise<void> {
  const player = { playerId: 'player:stale', instanceId: 'instance:a', x: 0, y: 0, hp: 100 };
  const service = new WorldRuntimeNavigationService(
    { getOrThrow() { throw new Error('unexpected template lookup'); } } as never,
    { getPlayer() { return player; } } as never,
    undefined,
  );
  (service as unknown as {
    resolveNavigationStepAsync: () => Promise<Record<string, unknown>>;
  }).resolveNavigationStepAsync = async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    player.x = 1;
    return { kind: 'move', direction: 'east', maxSteps: 1, path: [{ x: 1, y: 0 }] };
  };
  service.navigationIntents.set(player.playerId, { kind: 'point', mapId: 'shared-template', x: 2, y: 0 });
  const enqueued: Record<string, unknown>[] = [];
  await service.materializeNavigationCommands({
    hasPendingCommand() { return false; },
    enqueuePendingCommand(_playerId: string, command: Record<string, unknown>) { enqueued.push(command); },
    queuePlayerNotice() {},
    logger: { warn() {}, debug() {} },
  });

  assert.equal(enqueued.length, 0, 'worker 等待期间玩家位置变化后不得物化旧路径');
  assert.equal(service.navigationIntents.has(player.playerId), true, '旧结果丢弃后保留 intent，下一帧重新规划');
}

async function main(): Promise<void> {
  await verifyInstanceAndStaticRevisionCacheKey();
  await verifyInstanceBatchReuseAndBackpressure();
  await verifyCompiledWorkerExecutesBatchProtocol();
  await verifyNavigationMaterializationIsConcurrent();
  await verifyNavigationMaterializationLimitIsFair();
  await verifyStaleNavigationResultIsDiscarded();
  console.log(JSON.stringify({ ok: true, case: 'async-pathfinding-cache-and-batch' }));
}

void main();
