import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS } from '../persistence/player-domain-persistence.service';
import { FlushTaskRuntimeService } from '../persistence/flush-task-runtime.service';
import type { FlushTask } from '../persistence/flush-task.types';

async function main(): Promise<void> {
  const previousRole = process.env.SERVER_RUNTIME_ROLE;
  const previousMode = process.env.SERVER_FLUSH_TASK_RUNTIME_MODE;
  process.env.SERVER_RUNTIME_ROLE = 'worker';
  process.env.SERVER_FLUSH_TASK_RUNTIME_MODE = 'worker';

  const saved: Array<{ playerId: string; payload: unknown }> = [];
  const savedProjections: Array<{ playerId: string; domains: string[]; snapshot: unknown; options?: Record<string, unknown> }> = [];
  const savedProjectionBatches: Array<{
    playerId: string;
    entries: Array<{ domains: string[]; snapshot: unknown; options?: Record<string, unknown> }>;
  }> = [];
  const flushed: FlushTask[] = [];
  let claimed = false;
  const task: FlushTask = {
    scope: 'player',
    id: 'player-presence-1',
    domain: 'presence',
    priority: 'high',
    latestRevision: 7,
    payloadJson: {
      online: true,
      inWorld: true,
      lastHeartbeatAt: 12345,
      offlineSinceAt: null,
      runtimeOwnerId: 'api-1',
      sessionEpoch: 9,
      versionSeed: 7,
    },
  };
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {} as never,
    { flushPlayerDomains: async () => { throw new Error('presence payload should not use runtime flush fallback'); } } as never,
    {
      isEnabled: () => true,
      renewFlushTaskClaim: async () => true,
      claimReadyFlushTasks: async () => {
        if (claimed) return [];
        claimed = true;
        return [task];
      },
      markFlushTaskFlushed: async (flushedTask: FlushTask) => {
        flushed.push(flushedTask);
        return true;
      },
      markFlushTaskRetry: async () => true,
      markFlushTasksRetry: async () => 0,
    } as never,
    { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
    undefined,
    undefined,
    {
      isEnabled: () => true,
      loadPlayerPresence: async () => ({ runtimeOwnerId: 'api-1', sessionEpoch: 9 }),
      savePlayerPresence: async (playerId: string, payload: unknown) => {
        saved.push({ playerId, payload });
      },
      savePlayerSnapshotProjectionDomains: async (playerId: string, snapshot: unknown, domains: Iterable<string>) => {
        savedProjections.push({ playerId, snapshot, domains: Array.from(domains).sort() });
      },
    } as never,
  );
  try {
    const processed = await runtime.runOnce('presence-payload-smoke');
    assert.equal(processed, 1);
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.playerId, 'player-presence-1');
    assert.deepEqual(saved[0]?.payload, {
      ...task.payloadJson as Record<string, unknown>,
      transferState: null,
      transferTargetNodeId: null,
    });
    assert.equal(flushed.length, 1);

    const projectionTask: FlushTask = {
      scope: 'player',
      id: 'player-snapshot-1',
      domain: 'inventory',
      priority: 'high',
      latestRevision: 8,
      payloadJson: {
        kind: 'player_snapshot_projection',
        snapshot: { version: 1, savedAt: 88, placement: { templateId: 'map-1', x: 1, y: 2 }, inventory: { items: [{ itemId: 'ore' }] } },
      },
    };
    const questProjectionTask: FlushTask = {
      scope: 'player',
      id: 'player-snapshot-1',
      domain: 'quest',
      priority: 'normal',
      latestRevision: 9,
      payloadJson: {
        kind: 'player_snapshot_projection',
        snapshot: { version: 1, savedAt: 99, placement: { templateId: 'map-1', x: 1, y: 2 }, quests: { entries: [{ questId: 'quest-1' }] } },
      },
    };
    const fallbackProjectionTask: FlushTask = {
      scope: 'player',
      id: 'player-snapshot-1',
      domain: 'snapshot',
      priority: 'normal',
      latestRevision: 10,
      payloadJson: {
        kind: 'player_snapshot_projection',
        snapshot: {
          version: 1,
          savedAt: 100,
          placement: { templateId: 'map-1', x: 1, y: 2 },
          inventory: { items: [] },
          equipment: { slots: [] },
          artifacts: { slots: [] },
          buffs: { buffs: [] },
        },
      },
    };
    let projectionClaimed = false;
    const projectionRuntime = new FlushTaskRuntimeService(
      {} as never,
      {} as never,
      { flushPlayerDomains: async () => { throw new Error('snapshot payload should not use runtime flush fallback'); } } as never,
      {
        isEnabled: () => true,
        renewFlushTaskClaim: async () => true,
        claimReadyFlushTasks: async () => {
          if (projectionClaimed) return [];
          projectionClaimed = true;
          return [projectionTask, questProjectionTask, fallbackProjectionTask];
        },
        markFlushTaskFlushed: async (flushedTask: FlushTask) => {
          flushed.push(flushedTask);
          return true;
        },
        markFlushTaskRetry: async () => true,
        markFlushTasksRetry: async () => 0,
      } as never,
      { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
      undefined,
      undefined,
      {
        isEnabled: () => true,
        renewFlushTaskClaim: async () => true,
        savePlayerPresence: async () => undefined,
        savePlayerSnapshotProjectionDomainBatch: async (
          playerId: string,
          entries: Array<{ domains: Iterable<string>; snapshot: unknown; options?: Record<string, unknown> }>,
        ) => {
          savedProjectionBatches.push({
            playerId,
            entries: entries.map((entry) => ({
              domains: Array.from(entry.domains).sort(),
              snapshot: entry.snapshot,
              options: entry.options,
            })),
          });
        },
        savePlayerSnapshotProjectionDomains: async (playerId: string, snapshot: unknown, domains: Iterable<string>, options?: Record<string, unknown>) => {
          savedProjections.push({ playerId, snapshot, domains: Array.from(domains).sort(), options });
        },
      } as never,
    );
    const projectionProcessed = await projectionRuntime.runOnce('snapshot-payload-smoke');
    assert.equal(projectionProcessed, 3);
    assert.equal(savedProjections.length, 0, '生产 payload 消费不得退回逐域多事务 writer');
    assert.equal(savedProjectionBatches.length, 1, '同一玩家全部已认领投影必须只提交一个 batch');
    assert.equal(savedProjectionBatches[0]?.playerId, 'player-snapshot-1');
    const batchByDomain = new Map(savedProjectionBatches[0]?.entries.map((entry) => [entry.domains[0], entry]));
    assert.equal(batchByDomain.size, PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS.length);
    assert.equal(batchByDomain.has('inventory'), true, 'legacy snapshot fallback 必须派生全部 projectable domains');
    assert.equal(batchByDomain.has('quest'), true);
    assert.equal(batchByDomain.get('inventory')?.options?.allowInventoryEmptyOverwrite, true);
    assert.equal(batchByDomain.get('equipment')?.options?.allowEquipmentEmptyOverwrite, true);
    assert.equal(batchByDomain.get('artifact')?.options?.allowArtifactEmptyOverwrite, true);
    assert.equal(batchByDomain.get('buff')?.options?.allowBuffEmptyOverwrite, true);
    assert.equal(flushed.length, 4);

    const staleProjectionTask: FlushTask = {
      scope: 'player',
      id: 'player-stale-snapshot-1',
      domain: 'technique',
      priority: 'normal',
      latestRevision: 10,
      payloadJson: {
        kind: 'player_snapshot_projection',
        runtimeOwnerId: 'old-owner',
        sessionEpoch: 9,
        snapshot: { version: 1, savedAt: 100, placement: { templateId: 'map-1', x: 1, y: 2 }, techniques: { techniques: [{ techId: 'old-tech' }] } },
      },
    };
    let staleProjectionClaimed = false;
    const staleProjectionRuntime = new FlushTaskRuntimeService(
      {} as never,
      {} as never,
      { flushPlayerDomains: async () => { throw new Error('stale snapshot payload should not use runtime flush fallback'); } } as never,
      {
        isEnabled: () => true,
        claimReadyFlushTasks: async () => {
          if (staleProjectionClaimed) return [];
          staleProjectionClaimed = true;
          return [staleProjectionTask];
        },
        markFlushTaskFlushed: async (flushedTask: FlushTask) => {
          flushed.push(flushedTask);
          return true;
        },
        markFlushTaskRetry: async () => true,
        markFlushTasksRetry: async () => 0,
      } as never,
      { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
      undefined,
      undefined,
      {
        isEnabled: () => true,
        loadPlayerPresence: async () => ({ runtimeOwnerId: 'new-owner', sessionEpoch: 10 }),
        savePlayerPresence: async () => undefined,
        savePlayerSnapshotProjectionDomains: async () => {
          throw new Error('stale projection must not be persisted');
        },
      } as never,
    );
    const staleProjectionProcessed = await staleProjectionRuntime.runOnce('stale-snapshot-payload-smoke');
    assert.equal(staleProjectionProcessed, 1);
    assert.equal(savedProjections.length, 0);
    assert.equal(savedProjectionBatches.length, 1);
    assert.equal(flushed.length, 5);
    await proveProjectionBatchFailureRetriesWholePlayer();
    await proveHistoricalOwnerlessProjectionFenceCompatibility();
    await proveHistoricalPresenceFenceConvergence();
    await proveStartupReplayDrainsPresenceBeforeProjection();
    await proveStartupReplayAdvancesDurableFutureFence();
    await proveStartupReplayPreservesTechniqueComprehensionTruth();
  } finally {
    restoreEnv('SERVER_RUNTIME_ROLE', previousRole);
    restoreEnv('SERVER_FLUSH_TASK_RUNTIME_MODE', previousMode);
  }
  console.log(JSON.stringify({
    ok: true,
    answers: '玩家 presence 与 snapshot projectable flush task 可在 worker role 下从 staging payload 写入 PlayerDomainPersistenceService，并 mark flushed；同一玩家的多个 projection 只调用一次单事务 batch writer，任一领域写失败时整组进入 retry 且不会降级为逐域写入；历史 payload 缺 owner 时不信任可能残留的 ledger owner，只有 payload/DB 精确 fence 或同 epoch双方均已释放 owner才写入，旧 session/owner 与不存在玩家的 projection 会 stale-safe 收敛；启动重放遇到历史无授权的功法领悟空删除时保留数据库真源、隔离 technique 删除 payload，并继续提交同玩家其余领域。',
    excludes: '不证明邮件/市场/GM edit 或实例 domain，也不证明真实 DB with-db 竞争。',
    completionMapping: 'flush-player-payload',
  }, null, 2));
}

async function proveProjectionBatchFailureRetriesWholePlayer(): Promise<void> {
  const playerId = 'player-projection-batch-failure';
  const tasks: FlushTask[] = [
    {
      scope: 'player',
      id: playerId,
      domain: 'inventory',
      priority: 'high',
      latestRevision: 101,
      payloadJson: {
        kind: 'player_snapshot_projection',
        projectedDomains: ['inventory'],
        snapshot: {
          version: 1,
          savedAt: 101,
          placement: { templateId: 'map-1', x: 1, y: 2 },
          inventory: { items: [{ itemId: 'pill-1' }] },
        },
      },
    },
    {
      scope: 'player',
      id: playerId,
      domain: 'buff',
      priority: 'normal',
      latestRevision: 102,
      payloadJson: {
        kind: 'player_snapshot_projection',
        projectedDomains: ['buff'],
        snapshot: {
          version: 1,
          savedAt: 102,
          placement: { templateId: 'map-1', x: 1, y: 2 },
          buffs: { buffs: [{ buffId: 'buff-1', sourceSkillId: 'skill-1' }] },
        },
      },
    },
  ];
  const retriedGroups: FlushTask[][] = [];
  const flushedTasks: FlushTask[] = [];
  let sequentialWrites = 0;
  let batchWrites = 0;
  let claimed = false;
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {} as never,
    { flushPlayerDomains: async () => { throw new Error('batch failure must not use runtime flush fallback'); } } as never,
    {
      isEnabled: () => true,
      claimReadyFlushTasks: async () => {
        if (claimed) return [];
        claimed = true;
        return tasks;
      },
      renewFlushTaskClaims: async (claimedTasks: FlushTask[]) => claimedTasks.length,
      markFlushTaskFlushed: async (task: FlushTask) => {
        flushedTasks.push(task);
        return true;
      },
      markFlushTasksRetry: async (retryTasks: FlushTask[]) => {
        retriedGroups.push([...retryTasks]);
        return retryTasks.length;
      },
    } as never,
    { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
    undefined,
    undefined,
    {
      isEnabled: () => true,
      savePlayerSnapshotProjectionDomainBatch: async () => {
        batchWrites += 1;
        throw new Error('forced_projection_batch_failure');
      },
      savePlayerSnapshotProjectionDomains: async () => {
        sequentialWrites += 1;
      },
    } as never,
  );

  assert.equal(await runtime.runOnce('projection-batch-failure-smoke'), 0);
  assert.equal(batchWrites, 1);
  assert.equal(sequentialWrites, 0, 'batch 写失败后不得逐域补写制造部分提交');
  assert.equal(flushedTasks.length, 0, '事务失败后不得确认任一领域已刷盘');
  assert.equal(retriedGroups.length, 1);
  assert.deepEqual(
    retriedGroups[0]?.map((task) => task.domain).sort(),
    ['buff', 'inventory'],
    '事务失败后必须以玩家为单位重试全部当前 projection',
  );
}

async function proveHistoricalOwnerlessProjectionFenceCompatibility(): Promise<void> {
  const task = (
    id: string,
    runtimeOwnerId: string | null,
    payloadRuntimeOwnerId: string | null = null,
  ): FlushTask => ({
    scope: 'player',
    id,
    domain: 'technique',
    priority: 'normal',
    latestRevision: 90,
    runtimeOwnerId,
    payloadJson: {
      kind: 'player_snapshot_projection',
      runtimeOwnerId: payloadRuntimeOwnerId,
      sessionEpoch: 9,
      snapshot: {
        version: 1,
        savedAt: 90,
        placement: { templateId: 'map-1', x: 1, y: 2 },
        techniques: { techniques: [{ techId: `tech:${id}` }] },
      },
    },
  });
  const tasks = [
    task('player-payload-owner', 'rt-current', 'rt-current'),
    task('player-ledger-owner', 'rt-current'),
    task('player-ownerless-offline', null),
    task('player-owner-mismatch', 'rt-old', 'rt-old'),
    task('player-stale-epoch', 'rt-old'),
    task('player-missing', null),
  ];
  const presences = new Map<string, { runtimeOwnerId: string | null; sessionEpoch: number } | null>([
    ['player-payload-owner', { runtimeOwnerId: 'rt-current', sessionEpoch: 9 }],
    ['player-ledger-owner', { runtimeOwnerId: 'rt-current', sessionEpoch: 9 }],
    ['player-ownerless-offline', { runtimeOwnerId: null, sessionEpoch: 9 }],
    ['player-owner-mismatch', { runtimeOwnerId: 'rt-new', sessionEpoch: 9 }],
    ['player-stale-epoch', { runtimeOwnerId: 'rt-new', sessionEpoch: 10 }],
    ['player-missing', null],
  ]);
  const written: Array<{ playerId: string; expectedOwner: unknown; expectedEpoch: unknown }> = [];
  const converged: string[] = [];
  let claimed = false;
  let retryCount = 0;
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {} as never,
    { flushPlayerDomains: async () => { throw new Error('历史 owner fence payload 不应回退 runtime flush'); } } as never,
    {
      isEnabled: () => true,
      renewFlushTaskClaim: async () => true,
      claimReadyFlushTasks: async () => {
        if (claimed) return [];
        claimed = true;
        return tasks;
      },
      markFlushTaskFlushed: async (flushedTask: FlushTask) => {
        converged.push(flushedTask.id);
        return true;
      },
      markFlushTaskRetry: async () => {
        retryCount += 1;
        return true;
      },
      markFlushTasksRetry: async () => 0,
    } as never,
    { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
    undefined,
    undefined,
    {
      isEnabled: () => true,
      loadPlayerPresence: async (playerId: string) => presences.get(playerId) ?? null,
      savePlayerPresence: async () => undefined,
      savePlayerSnapshotProjectionDomains: async (
        playerId: string,
        _snapshot: unknown,
        _domains: Iterable<string>,
        options?: Record<string, unknown>,
      ) => {
        written.push({
          playerId,
          expectedOwner: options?.expectedRuntimeOwnerId,
          expectedEpoch: options?.expectedSessionEpoch,
        });
      },
    } as never,
  );

  const processed = await runtime.runOnce('historical-ownerless-fence-smoke');
  assert.equal(processed, tasks.length);
  assert.deepEqual(written, [
    { playerId: 'player-payload-owner', expectedOwner: 'rt-current', expectedEpoch: 9 },
    { playerId: 'player-ownerless-offline', expectedOwner: null, expectedEpoch: 9 },
  ]);
  assert.deepEqual(new Set(converged), new Set(tasks.map((entry) => entry.id)));
  assert.equal(retryCount, 0, '可证明 stale 的历史 fence 必须直接收敛，不能无限 retry');
}

async function proveHistoricalPresenceFenceConvergence(): Promise<void> {
  const task = (
    id: string,
    runtimeOwnerId: string | null,
    sessionEpoch: number,
  ): FlushTask => ({
    scope: 'player',
    id,
    domain: 'presence',
    priority: 'high',
    latestRevision: 91,
    payloadJson: {
      online: false,
      inWorld: true,
      runtimeOwnerId,
      sessionEpoch,
      versionSeed: 91,
    },
  });
  const tasks = [
    task('presence-current-owner', 'rt-current', 9),
    task('presence-current-ownerless', null, 9),
    task('presence-ownerless-stale', null, 9),
    task('presence-stale-epoch', 'rt-old', 9),
    task('presence-raced-stale', 'rt-race', 9),
    task('presence-future-epoch', 'rt-future', 10),
    task('presence-missing', null, 9),
  ];
  const presences = new Map<string, { runtimeOwnerId: string | null; sessionEpoch: number } | null>([
    ['presence-current-owner', { runtimeOwnerId: 'rt-current', sessionEpoch: 9 }],
    ['presence-current-ownerless', { runtimeOwnerId: null, sessionEpoch: 9 }],
    ['presence-ownerless-stale', { runtimeOwnerId: 'rt-current', sessionEpoch: 9 }],
    ['presence-stale-epoch', { runtimeOwnerId: 'rt-new', sessionEpoch: 10 }],
    ['presence-raced-stale', { runtimeOwnerId: 'rt-race', sessionEpoch: 9 }],
    ['presence-future-epoch', { runtimeOwnerId: 'rt-old', sessionEpoch: 9 }],
    ['presence-missing', null],
  ]);
  const saved: string[] = [];
  const converged: string[] = [];
  const retried: string[] = [];
  let claimed = false;
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {} as never,
    { flushPlayerDomains: async () => { throw new Error('历史 presence fence payload 不应回退 runtime flush'); } } as never,
    {
      isEnabled: () => true,
      renewFlushTaskClaim: async () => true,
      claimReadyFlushTasks: async () => {
        if (claimed) return [];
        claimed = true;
        return tasks;
      },
      markFlushTaskFlushed: async (flushedTask: FlushTask) => {
        converged.push(flushedTask.id);
        return true;
      },
      markFlushTaskRetry: async (retryTask: FlushTask) => {
        retried.push(retryTask.id);
        return true;
      },
      markFlushTasksRetry: async () => 0,
    } as never,
    { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
    undefined,
    undefined,
    {
      isEnabled: () => true,
      loadPlayerPresence: async (playerId: string) => presences.get(playerId) ?? null,
      savePlayerPresence: async (playerId: string) => {
        if (playerId === 'presence-raced-stale') {
          throw new Error(`player_presence_stale_fence:${playerId}`);
        }
        saved.push(playerId);
      },
      savePlayerSnapshotProjectionDomains: async () => undefined,
    } as never,
  );

  const processed = await runtime.runOnce('historical-presence-fence-smoke');
  assert.equal(processed, 7);
  assert.deepEqual(saved.sort(), [
    'presence-current-owner',
    'presence-current-ownerless',
    'presence-future-epoch',
    'presence-missing',
  ]);
  assert.deepEqual(new Set(converged), new Set([
    'presence-current-owner',
    'presence-current-ownerless',
    'presence-ownerless-stale',
    'presence-stale-epoch',
    'presence-raced-stale',
    'presence-future-epoch',
    'presence-missing',
  ]));
  assert.deepEqual(retried, []);
}

async function proveStartupReplayAdvancesDurableFutureFence(): Promise<void> {
  const task: FlushTask = {
    scope: 'player',
    id: 'presence-replay-incomplete',
    domain: 'presence',
    priority: 'high',
    latestRevision: 92,
    claimOwnerId: 'replay-claim',
    payloadJson: {
      online: false,
      inWorld: true,
      runtimeOwnerId: null,
      sessionEpoch: 10,
      versionSeed: 92,
    },
  };
  let claimCount = 0;
  let retryCount = 0;
  let pendingCount = 1;
  let saved = false;
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {} as never,
    { flushPlayerDomains: async () => { throw new Error('startup replay 不得回退 runtime flush'); } } as never,
    {
      isEnabled: () => true,
      countPendingPayloadTasks: async () => pendingCount,
      claimReadyFlushTasks: async (input: { scope: string }) => {
        if (input.scope !== 'player' || claimCount > 0) return [];
        claimCount += 1;
        return [task];
      },
      markFlushTaskRetry: async () => {
        retryCount += 1;
        return true;
      },
      markFlushTaskFlushed: async () => {
        pendingCount = 0;
        return true;
      },
      renewFlushTaskClaim: async () => true,
      markFlushTasksRetry: async () => 0,
    } as never,
    { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
    undefined,
    undefined,
    {
      isEnabled: () => true,
      loadPlayerPresence: async () => ({ runtimeOwnerId: null, sessionEpoch: 9 }),
      savePlayerPresence: async () => {
        saved = true;
      },
      savePlayerSnapshotProjectionDomains: async () => undefined,
    } as never,
  );

  const processed = await runtime.replayDurablePayloadsBeforeRecovery({ timeoutMs: 5_000 });
  assert.equal(processed, 1);
  assert.equal(saved, true, 'durable future epoch presence 应通过数据库 epoch CAS 推进');
  assert.equal(claimCount, 1, 'startup replay 只能消费一次 future epoch presence');
  assert.equal(retryCount, 0, '可推进的 durable presence 不应进入 retry');
}

async function proveStartupReplayDrainsPresenceBeforeProjection(): Promise<void> {
  const playerId = 'presence-first-replay-player';
  const presenceTask: FlushTask = {
    scope: 'player',
    id: playerId,
    domain: 'presence',
    priority: 'low',
    latestRevision: 93,
    claimOwnerId: 'presence-first-claim',
    payloadJson: {
      online: false,
      inWorld: true,
      runtimeOwnerId: 'rt-presence-first',
      sessionEpoch: 9,
      versionSeed: 93,
    },
  };
  const projectionTask: FlushTask = {
    scope: 'player',
    id: playerId,
    domain: 'technique',
    priority: 'high',
    latestRevision: 94,
    claimOwnerId: 'projection-second-claim',
    payloadJson: {
      kind: 'player_snapshot_projection',
      runtimeOwnerId: 'rt-presence-first',
      sessionEpoch: 9,
      snapshot: {
        version: 1,
        savedAt: 94,
        placement: { templateId: 'map-1', x: 1, y: 2 },
        techniques: { techniques: [{ techId: 'presence-first-tech' }] },
      },
    },
  };
  let presencePending = true;
  let projectionPending = true;
  const writeOrder: string[] = [];
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {} as never,
    { flushPlayerDomains: async () => { throw new Error('startup replay 不得回退 runtime flush'); } } as never,
    {
      isEnabled: () => true,
      countPendingPayloadTasks: async (input?: { scope?: string; domain?: string }) => {
        if (input?.scope === 'player' && input.domain === 'presence') {
          return presencePending ? 1 : 0;
        }
        return (presencePending ? 1 : 0) + (projectionPending ? 1 : 0);
      },
      claimReadyFlushTasks: async (input: { scope: string; domain?: string }) => {
        if (input.scope === 'instance') return [];
        if (input.domain === 'presence') {
          return presencePending ? [presenceTask] : [];
        }
        assert.equal(presencePending, false, 'projection claim 前必须先 drain 全局 presence payload');
        return projectionPending ? [projectionTask] : [];
      },
      renewFlushTaskClaim: async () => true,
      markFlushTaskFlushed: async (flushedTask: FlushTask) => {
        if (flushedTask.domain === 'presence') presencePending = false;
        else projectionPending = false;
        return true;
      },
      markFlushTaskRetry: async () => true,
      markFlushTasksRetry: async () => 0,
    } as never,
    { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
    undefined,
    undefined,
    {
      isEnabled: () => true,
      loadPlayerPresence: async () => ({ runtimeOwnerId: 'rt-presence-first', sessionEpoch: 9 }),
      savePlayerPresence: async () => { writeOrder.push('presence'); },
      savePlayerSnapshotProjectionDomains: async () => { writeOrder.push('projection'); },
    } as never,
  );

  const processed = await runtime.replayDurablePayloadsBeforeRecovery({ timeoutMs: 5_000 });
  assert.equal(processed, 2);
  assert.deepEqual(writeOrder, ['presence', 'projection']);
}

async function proveStartupReplayPreservesTechniqueComprehensionTruth(): Promise<void> {
  const playerId = 'technique-empty-overwrite-replay-player';
  const pendingDomains = new Set(['attr', 'technique']);
  const buildTask = (domain: string, latestRevision: number): FlushTask => ({
    scope: 'player',
    id: playerId,
    domain,
    priority: 'normal',
    latestRevision,
    claimOwnerId: `technique-empty-overwrite-${domain}`,
    payloadJson: {
      kind: 'player_snapshot_projection',
      projectedDomains: [domain],
      projectionVersion: latestRevision,
      snapshot: {
        version: 1,
        savedAt: latestRevision,
        placement: { templateId: 'map-1', x: 1, y: 2 },
        techniques: { techniques: [], pendingComprehensions: [] },
        attrState: { baseAttrs: {} },
      },
    },
  });
  const tasks = [buildTask('attr', 201), buildTask('technique', 202)];
  const flushedDomains: string[] = [];
  const committedDomains: string[][] = [];
  let batchAttempts = 0;
  const runtime = new FlushTaskRuntimeService(
    {} as never,
    {} as never,
    { flushPlayerDomains: async () => { throw new Error('startup replay 不得回退 runtime flush'); } } as never,
    {
      isEnabled: () => true,
      countPendingPayloadTasks: async (input?: { scope?: string; domain?: string }) => {
        if (input?.scope === 'player' && input.domain === 'presence') return 0;
        return pendingDomains.size;
      },
      claimReadyFlushTasks: async (input: { scope: string }) => {
        if (input.scope === 'instance') return [];
        return tasks.filter((task) => pendingDomains.has(task.domain));
      },
      renewFlushTaskClaims: async (claimedTasks: FlushTask[]) => claimedTasks.length,
      markFlushTaskFlushed: async (task: FlushTask) => {
        pendingDomains.delete(task.domain);
        flushedDomains.push(task.domain);
        return true;
      },
      markFlushTasksRetry: async () => 0,
      markFlushTaskRetry: async () => true,
    } as never,
    { signalPlayerFlush: () => undefined, signalInstanceFlush: () => undefined } as never,
    undefined,
    undefined,
    {
      isEnabled: () => true,
      savePlayerSnapshotProjectionDomainBatch: async (
        _targetPlayerId: string,
        entries: Array<{ domains: Iterable<string> }>,
      ) => {
        batchAttempts += 1;
        const domains = entries.flatMap((entry) => Array.from(entry.domains)).sort();
        if (domains.includes('technique')) {
          throw new Error(
            `replace_technique_comprehension_refused_empty_overwrite:playerId=${playerId} table=player_technique_comprehension`,
          );
        }
        committedDomains.push(domains);
      },
    } as never,
  );

  const processed = await runtime.replayDurablePayloadsBeforeRecovery({ timeoutMs: 5_000 });
  assert.equal(processed, 2);
  assert.equal(batchAttempts, 2, '隔离 technique 后必须重试并提交同玩家其余领域');
  assert.deepEqual(flushedDomains.sort(), ['attr', 'technique']);
  assert.deepEqual(committedDomains, [['attr']]);
  assert.equal(pendingDomains.size, 0);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === 'string') {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
